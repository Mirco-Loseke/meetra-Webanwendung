# ==========================================================
# SAGE 100 -> SUPABASE - Abgleich Adressen und Angebote
# ==========================================================
# Liest aus Sage (nur lesend) und schreibt nach Supabase.
# OHNE -Schreiben laeuft nur eine PROBE: es wird angezeigt, was sich aendern
# wuerde, geschrieben wird nichts.
#
#   powershell -ExecutionPolicy Bypass -File tools/sage-sync.ps1
#   powershell -ExecutionPolicy Bypass -File tools/sage-sync.ps1 -Schreiben
#   powershell -ExecutionPolicy Bypass -File tools/sage-sync.ps1 -Nur angebote
#
# Zugangsdaten: tools/sage-sync.config.ps1 (Vorlage: sage-sync.config.beispiel.ps1)
# Schreibt nur ueber die Edge Function sage-sync (supabase/SETUP_SAGE_SYNC.txt).
# Protokoll:    tools/sage-sync.log
# ==========================================================
param(
    [string]$Server = 'Meetra-SA',
    [string]$Db     = 'OLMeetra',
    [ValidateSet('alles','adressen','angebote','rechnungen','pdf')]
    [string]$Nur    = 'alles',
    [string]$AngeboteAb = '2026-01-01',
    [string]$RechnungenAb = '2023-01-01',
    [int]$IntervallMin = 30,   # Takt der geplanten Aufgabe (Mo-Fr 07:30-17:00) - fuer "naechste Aktualisierung"
    [string]$ZeitVon = "07:30",
    [string]$ZeitBis = "17:00",
    [switch]$Schreiben
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$Basis = Split-Path -Parent $MyInvocation.MyCommand.Path
$Log   = Join-Path $Basis 'sage-sync.log'

function Sag($t, $farbe = 'Gray') {
    Write-Host $t -ForegroundColor $farbe
    "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $t" | Out-File $Log -Append -Encoding utf8
}

# ---------- Zugangsdaten ----------
$cfg = Join-Path $Basis 'sage-sync.config.ps1'
if (-not (Test-Path $cfg)) { throw "Fehlt: $cfg  (aus sage-sync.config.beispiel.ps1 anlegen)" }
. $cfg
if (-not $SupabaseUrl -or -not $SyncToken -or $SyncToken -like 'HIER_*') {
    throw "In $cfg fehlt SupabaseUrl oder SyncToken."
}

# ---------- Sage lesen ----------
function SageFrage($sql) {
    $c = New-Object System.Data.SqlClient.SqlConnection(
        "Server=$Server;Integrated Security=SSPI;Database=$Db;Connect Timeout=15;Application Name=meetra-sage-sync")
    $c.Open()
    try {
        $cmd = $c.CreateCommand(); $cmd.CommandText = $sql; $cmd.CommandTimeout = 120
        $t = New-Object System.Data.DataTable
        $t.Load($cmd.ExecuteReader())
        return $t
    } finally { $c.Close() }
}

# ---------- Supabase (ueber Edge Function sage-sync, kein Generalschluessel) ----------
# Die Function erlaubt nur: Adressen/Angebote lesen, anlegen, aendern und den
# Zeitstempel setzen. Kein Loeschen, keine anderen Tabellen.
function Api($body) {
    $json = ConvertTo-Json -InputObject $body -Depth 6 -Compress
    $k = @{ 'x-sync-token' = $SyncToken; 'Content-Type' = 'application/json' }
    # Antwort selbst als UTF-8 lesen: PowerShell 5.1 nimmt ohne charset-Angabe
    # ISO-8859-1 und macht aus "ö" ein "Ã¶" - dann saehe jede Adresse mit
    # Umlaut wie von Hand geaendert aus.
    $r = Invoke-WebRequest -UseBasicParsing -Method Post -Uri "$SupabaseUrl/functions/v1/sage-sync" -Headers $k -Body ([Text.Encoding]::UTF8.GetBytes($json))
    $text = [Text.Encoding]::UTF8.GetString($r.RawContentStream.ToArray())
    return ($text | ConvertFrom-Json)
}

# $pfad z. B. 'customers?select=...' - die Spalten legt die Function fest.
function SupaHolen($pfad) {
    $tabelle = ($pfad -split '\?')[0]
    return @((Api @{ aktion = 'lesen'; tabelle = $tabelle }).zeilen)
}

function SupaInsert($tabelle, $zeilen) {
    for ($i = 0; $i -lt $zeilen.Count; $i += 200) {
        $bis = [Math]::Min($i + 199, $zeilen.Count - 1)
        Api @{ aktion = 'anlegen'; tabelle = $tabelle; zeilen = @($zeilen[$i..$bis]) } | Out-Null
        Sag ("    angelegt: {0}-{1}" -f ($i + 1), ($bis + 1))
    }
}

# $liste: Eintraege @(id, felder, ...) - aendert je Zeile nur die uebergebenen Felder.
function SupaAendern($tabelle, $liste) {
    for ($i = 0; $i -lt $liste.Count; $i += 100) {
        $bis = [Math]::Min($i + 99, $liste.Count - 1)
        $zeilen = @($liste[$i..$bis] | ForEach-Object { @{ id = $_[0]; felder = $_[1] } })
        Api @{ aktion = 'aendern'; tabelle = $tabelle; zeilen = $zeilen } | Out-Null
        Sag ("    geaendert: {0}-{1}" -f ($i + 1), ($bis + 1))
    }
}

# Naechster Lauf nach dem Plan der Aufgabe: Mo-Fr, ab $ZeitVon alle $IntervallMin
# Minuten bis einschliesslich $ZeitBis. Sonst zeigte die Webapp nachts und am
# Wochenende "ueberfaellig".
function Naechste {
    $jetzt = (Get-Date).AddMinutes(2)
    $tag = $jetzt.Date
    for ($i = 0; $i -lt 8; $i++) {
        if ($tag.DayOfWeek -ne 'Saturday' -and $tag.DayOfWeek -ne 'Sunday') {
            $t = $tag.Add([TimeSpan]::Parse($ZeitVon)); $ende = $tag.Add([TimeSpan]::Parse($ZeitBis))
            while ($t -le $ende) {
                if ($t -ge $jetzt) { return $t.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ') }
                $t = $t.AddMinutes($IntervallMin)
            }
        }
        $tag = $tag.AddDays(1)
    }
    return $null
}

# Jeder Abbruch (Sage nicht erreichbar, Supabase-Fehler ...) landet im Protokoll
# und - bei echten Laeufen - als Fehler unter der Angebotsliste.
trap {
    $msg = "$($_.Exception.Message)".Trim()
    Sag "FEHLER: $msg" 'Red'
    if ($Schreiben) { try { Api @{ aktion = 'stempel'; fehler = $msg; naechste = (Naechste) } | Out-Null } catch { Sag "  (Fehler konnte nicht an die Webapp gemeldet werden: $($_.Exception.Message))" 'Red' } }
    exit 1
}

function Schluessel($s) {
    if (-not $s) { return $null }
    $t = ("$s".ToLower() -replace '[^a-z0-9äöüß]', '')
    if ($t -eq '') { return $null }
    return $t
}

function Text($v) {
    if ($null -eq $v -or $v -is [DBNull]) { return $null }
    $s = "$v".Trim()
    if ($s -eq '') { return $null }
    return $s
}
function Zahl($v) {
    if ($null -eq $v -or $v -is [DBNull]) { return $null }
    return [decimal]$v
}
function Land($v) {
    $s = Text $v
    if (-not $s) { return 'Deutschland' }
    if ($s -eq 'D' -or $s -eq 'DEU') { return 'Deutschland' }
    # Wie der bisherige Import: diese Laender ausgeschrieben, alle anderen als Kuerzel.
    $namen = @{ DE = 'Deutschland'; AT = 'Österreich'; NL = 'Niederlande'; CZ = 'Tschechien'; IT = 'Italien'
                FR = 'Frankreich'; CH = 'Schweiz'; BE = 'Belgien'; PL = 'Polen' }
    if ($namen.ContainsKey($s.ToUpper())) { return $namen[$s.ToUpper()] }
    return $s
}

$modus = if ($Schreiben) { 'SCHREIBEN' } else { 'PROBE - es wird nichts geschrieben' }
Sag ""
Sag ("=== Sage-Abgleich {0} - {1} ===" -f (Get-Date -Format 'dd.MM.yyyy HH:mm'), $modus) 'Cyan'

# ==========================================================
# ADRESSEN
# ==========================================================
$adrIndex = @{}   # Adressnummer -> customers.id, wird unten fuer die Angebote gebraucht

if ($Nur -eq 'alles' -or $Nur -eq 'adressen') {
    Sag ""
    Sag "-- Adressen --" 'Cyan'

    $sqlAdr = @"
SELECT a.Adresse AS AdrNr, a.Matchcode, a.Name1, a.Name2,
       a.LieferStrasse, a.LieferPLZ, a.LieferOrt, a.LieferLand,
       a.PostStrasse, a.PostPLZ, a.PostOrt, a.PostLand,
       a.Telefon, a.EMail, k.Kto AS KdNr
FROM dbo.KHKAdressen a
OUTER APPLY (
    SELECT TOP 1 kk.Kto FROM dbo.KHKKontokorrent kk
    WHERE kk.Adresse = a.Adresse AND kk.Mandant = a.Mandant AND kk.KtoArt = 'D'
    ORDER BY kk.Kto
) k
WHERE a.Aktiv <> 0
"@
    $sage = SageFrage $sqlAdr
    $mitKdNr = @($sage | Where-Object { Text $_.KdNr }).Count
    Sag ("  Sage: {0} aktive Adressen, davon {1} mit Kundennummer" -f $sage.Rows.Count, $mitKdNr)

    $vorhanden = SupaHolen 'customers?select=id,address_number,customer_number,matchcode,name,street,zip_code,city,country,phone,email,sage_stand'
    $nachNr = @{}
    foreach ($c in $vorhanden) { if ($c.address_number) { $nachNr[[string]$c.address_number] = $c } }
    Sag ("  Supabase: {0} Adressen, davon {1} mit Adressnummer" -f $vorhanden.Count, $nachNr.Count)

    # Rueckfall fuer Adressen ohne Adressnummer (von Hand angelegt):
    # Kundennummer -> Matchcode -> Name+PLZ. Nur eindeutige Treffer zaehlen.
    $idx = @{ kd = @{}; mc = @{}; np = @{} }
    function Merke($art, $key, $c) {
        if (-not $key) { return }
        if ($idx[$art].ContainsKey($key)) { $idx[$art][$key] = 'MEHRDEUTIG' } else { $idx[$art][$key] = $c }
    }
    foreach ($c in $vorhanden) {
        if ($c.address_number) { continue }
        Merke 'kd' (Schluessel $c.customer_number) $c
        Merke 'mc' (Schluessel $c.matchcode) $c
        if ($c.zip_code) { Merke 'np' ((Schluessel $c.name) + '|' + (Schluessel $c.zip_code)) $c }
    }
    $vergeben = @{}

    $neu = @(); $geaendert = @(); $gleich = 0; $zugeordnet = 0; $unklar = @(); $handListe = @()
    foreach ($r in $sage) {
        $nr   = [string]$r.AdrNr
        $name = Text $r.Name1
        $n2   = Text $r.Name2
        # Name2 (Zusatz, Ansprechpartner "Herrn ...") gehoert nicht in den Firmennamen -
        # so steht es auch in der Webapp; nur wenn Name1 fehlt, Name2 nehmen.
        if (-not $name) { $name = $n2 }
        if (-not $name) { continue }

        $strasse = Text $r.LieferStrasse; if (-not $strasse) { $strasse = Text $r.PostStrasse }
        $plz     = Text $r.LieferPLZ;     if (-not $plz)     { $plz     = Text $r.PostPLZ }
        $ort     = Text $r.LieferOrt;     if (-not $ort)     { $ort     = Text $r.PostOrt }
        $land    = Text $r.LieferLand;    if (-not $land)    { $land    = Text $r.PostLand }

        $zeile = [ordered]@{
            address_number  = $nr
            customer_number = Text $r.KdNr
            matchcode       = Text $r.Matchcode
            name            = $name
            street          = $strasse
            zip_code        = $plz
            city            = $ort
            country         = Land $land
            phone           = Text $r.Telefon
            email           = Text $r.EMail
        }

        $alt = $nachNr[$nr]
        if (-not $alt) {
            $treffer = $null
            $schl = @(
                @('kd', (Schluessel $zeile.customer_number)),
                @('mc', (Schluessel $zeile.matchcode)),
                @('np', $(if ($plz) { (Schluessel $name) + '|' + (Schluessel $plz) } else { $null }))
            )
            foreach ($s in $schl) {
                if (-not $s[1]) { continue }
                $t = $idx[$s[0]][$s[1]]
                if ($t -eq 'MEHRDEUTIG') { $treffer = 'MEHRDEUTIG'; break }
                if ($t) { $treffer = $t; break }
            }
            if ($treffer -eq 'MEHRDEUTIG' -or ($treffer -and $vergeben.ContainsKey($treffer.id))) {
                $unklar += "$nr  $name"; continue
            }
            if (-not $treffer) {
                $stand = [ordered]@{}; foreach ($f in $zeile.Keys) { $stand[$f] = $zeile[$f] }
                $zeile['sage_stand'] = $stand
                $neu += $zeile; continue
            }
            $vergeben[$treffer.id] = $true
            $alt = $treffer
            $zugeordnet++
        }

        $adrIndex[$nr] = $alt.id
        # Je Feld: steht in der Webapp noch der zuletzt aus Sage uebernommene Wert
        # (oder nichts), darf Sage aktualisieren. Weicht er ab, wurde er von Hand
        # geaendert und bleibt. Ohne gemerkten Stand (erster Lauf) wird nur
        # Leeres gefuellt; Abweichungen gelten dann als Handaenderung.
        $s = $alt.sage_stand
        $felder = [ordered]@{}; $hand = @(); $stand = [ordered]@{}; $standNeu = $false
        foreach ($f in $zeile.Keys) {
            $n = Text $zeile[$f]; $a = Text $alt.$f
            $stand[$f] = $zeile[$f]
            $kennt = $s -and ($s.PSObject.Properties.Name -contains $f)
            if (-not $kennt -or (Text $s.$f) -ne $n) { $standNeu = $true }
            if ($a -eq $n) { continue }
            $vonSage = (-not $a) -or ($kennt -and (Text $s.$f) -eq $a)
            if ($vonSage) {
                if ($null -ne $n -or $kennt) { $felder[$f] = $zeile[$f] }
            } else { $hand += $f }
        }
        if ($standNeu) { $felder['sage_stand'] = $stand }
        if ($hand.Count -gt 0) { $handListe += ("{0}  {1}  -> {2}" -f $nr, $name, ($hand -join ', ')) }
        if ($felder.Count -eq 0) { $gleich++ }
        else {
            $sichtbar = @($felder.Keys | Where-Object { $_ -ne 'sage_stand' })
            $geaendert += ,@($alt.id, $felder, $name, $sichtbar)
        }
    }

    $inhalt = @($geaendert | Where-Object { $_[3].Count -gt 0 })
    Sag ("  -> {0} neu, {1} aktualisiert (davon {2} per Kundennr./Matchcode/Name zugeordnet), {3} unveraendert, {4} mit Handaenderung" -f $neu.Count, $inhalt.Count, $zugeordnet, ($gleich + $geaendert.Count - $inhalt.Count), $handListe.Count) 'Yellow'
    foreach ($b in @($neu | Select-Object -First 10)) { Sag ("     NEU:         {0}  {1}" -f $b.address_number, $b.name) }
    foreach ($g in @($inhalt | Select-Object -First 10)) {
        Sag ("     AKTUALISIERT: {0}  -> {1}" -f $g[2], ($g[3] -join ', '))
    }
    if ($handListe.Count -gt 0) {
        Sag "  Von Hand geaendert - bleibt wie in der Webapp:" 'Gray'
        foreach ($h in @($handListe | Select-Object -First 20)) { Sag "     $h" }
        if ($handListe.Count -gt 20) { Sag ("     ... und {0} weitere" -f ($handListe.Count - 20)) }
    }
    if ($unklar.Count -gt 0) {
        Sag ("  {0} Adressen NICHT uebernommen (mehrdeutig, bitte von Hand pruefen):" -f $unklar.Count) 'Red'
        foreach ($u in $unklar) { Sag "     $u" }
    }

    if ($Schreiben) {
        if ($neu.Count -gt 0) { SupaInsert 'customers' $neu }
        if ($geaendert.Count -gt 0) { SupaAendern 'customers' $geaendert }
        foreach ($c in (SupaHolen 'customers?select=id,address_number')) {
            if ($c.address_number) { $adrIndex[[string]$c.address_number] = $c.id }
        }
    }
}

# ==========================================================
# ANGEBOTE
# ==========================================================
if ($Nur -eq 'alles' -or $Nur -eq 'angebote') {
    Sag ""
    Sag "-- Angebote --" 'Cyan'

    if ($adrIndex.Count -eq 0) {
        foreach ($c in (SupaHolen 'customers?select=id,address_number')) {
            if ($c.address_number) { $adrIndex[[string]$c.address_number] = $c.id }
        }
    }

    $sqlAng = @"
SELECT CAST(b.Belegnummer AS varchar(20)) AS Nr, b.Belegdatum, b.A0Matchcode, b.A0AdressNr,
       b.Nettobetrag, b.Bruttobetrag
FROM dbo.KHKVKBelege b WHERE b.Belegart = 'Angebot' AND b.Belegdatum >= '$AngeboteAb'
UNION ALL
SELECT CAST(x.Belegnummer AS varchar(20)) AS Nr, x.Belegdatum, x.A0Matchcode, x.A0AdressNr,
       x.Nettobetrag, x.Bruttobetrag
FROM dbo.KHKArchivVKBelege x WHERE x.Belegart = 'Angebot' AND x.Belegdatum >= '$AngeboteAb'
"@
    # Dieselbe Belegnummer kann in Belegen UND Archiv stehen -> nur einmal nehmen.
    # Entwuerfe haben kurze Nummern (z. B. 241); verschickte Angebote 5-stellig (30018).
    # Eindeutig ist Nummer + Jahr: Sage vergibt die Angebotsnummern jedes Jahr neu
    # (Migration supabase_angebote_belegjahr.sql, Spalte angebote.belegjahr).
    function AngSchluessel($nr, $datum) {
        $j = '0'
        if ($datum -is [DateTime]) { $j = $datum.ToString('yyyy') }
        elseif ($datum) { $j = ([string]$datum).Substring(0, 4) }
        return "$nr|$j"
    }
    $gesehen = @{}; $entwuerfe = 0
    $sage = @(SageFrage $sqlAng | Where-Object {
        $n = Text $_.Nr
        $k = AngSchluessel $n $_.Belegdatum
        if (-not $n -or $gesehen.ContainsKey($k)) { $false }
        elseif ($n -notmatch '^\d{5,}$') { $entwuerfe++; $false }
        else { $gesehen[$k] = $true; $true }
    })
    if ($entwuerfe -gt 0) { Sag ("  {0} Entwuerfe (ohne endgueltige Nummer) uebersprungen" -f $entwuerfe) }
    Sag ("  Sage: {0} Angebote ab {1} (inkl. Archiv, ohne Doppelte)" -f $sage.Count, $AngeboteAb)

    $vorhanden = SupaHolen 'angebote?select=id,belegnummer,belegdatum,kundenmatchcode,nettobetrag,bruttobetrag,customer_id'
    $nachNr = @{}
    foreach ($a in $vorhanden) { $nachNr[(AngSchluessel ([string]$a.belegnummer) $a.belegdatum)] = $a }

    $wieder = @($sage | Where-Object { $nachNr.ContainsKey((AngSchluessel (Text $_.Nr) $_.Belegdatum)) }).Count
    Sag ("  Supabase: {0} Angebote - davon {1} per Belegnummer wiedererkannt" -f $vorhanden.Count, $wieder)
    if ($vorhanden.Count -gt 0 -and $wieder -lt ($vorhanden.Count * 0.5)) {
        Sag "  ACHTUNG: wenig Uebereinstimmung - Format der Belegnummer pruefen, sonst entstehen Doppelte!" 'Red'
    }

    $neu = @(); $geaendert = @(); $gleich = 0; $verknuepft = 0; $jahrKonflikt = @()
    foreach ($r in $sage) {
        $nr = Text $r.Nr
        if (-not $nr) { continue }
        # Gleiche Nummer aus einem anderen Jahr ist ein anderes Angebot -> eigener Schluessel.
        $alt = $nachNr[(AngSchluessel $nr $r.Belegdatum)]

        # Handzuordnung in der App hat Vorrang - nur leere Verknuepfungen fuellen.
        $kid = $null
        if ($alt -and $alt.customer_id) { $kid = $alt.customer_id }
        elseif ($r.A0AdressNr -and $adrIndex.ContainsKey([string]$r.A0AdressNr)) {
            $kid = $adrIndex[[string]$r.A0AdressNr]
            $verknuepft++
        }

        $datum = $null
        if ($r.Belegdatum -is [DateTime]) { $datum = $r.Belegdatum.ToString('yyyy-MM-dd') }

        $zeile = [ordered]@{
            belegnummer     = $nr
            belegdatum      = $datum
            kundenmatchcode = Text $r.A0Matchcode
            nettobetrag     = Zahl $r.Nettobetrag
            bruttobetrag    = Zahl $r.Bruttobetrag
            customer_id     = $kid
        }

        if (-not $alt) { $neu += $zeile; continue }
        # Nur die Sage-Felder vergleichen; alles andere am Angebot (Vorgang, Stand,
        # Maschine ...) wird nie mitgeschickt und bleibt damit unberuehrt.
        $felder = [ordered]@{}
        foreach ($f in $zeile.Keys) {
            if ($f -eq 'belegnummer') { continue }
            $n = $zeile[$f]; $a = $alt.$f
            if ($f -like '*betrag') {
                if ($null -eq $n) { continue }
                if ($null -ne $a -and [decimal]$a -eq [decimal]$n) { continue }
            } elseif ("$n" -eq "$a" -or $null -eq $n) { continue }
            $felder[$f] = $n
        }
        if ($felder.Count -eq 0) { $gleich++ } else { $geaendert += ,@($alt.id, $felder, $nr) }
    }

    Sag ("  -> {0} neu, {1} geaendert, {2} unveraendert, {3} neu mit Kunde verknuepft" -f $neu.Count, $geaendert.Count, $gleich, $verknuepft) 'Yellow'
    if ($jahrKonflikt.Count -gt 0) {
        Sag ("  {0} Angebote NICHT uebernommen - Nummer gibt es in der Webapp schon aus einem anderen Jahr:" -f $jahrKonflikt.Count) 'Red'
        foreach ($j in $jahrKonflikt) { Sag "     $j" }
    }
    foreach ($b in @($neu | Select-Object -First 5)) {
        Sag ("     NEU: {0}  {1}  {2}" -f $b.belegnummer, $b.belegdatum, $b.kundenmatchcode)
    }
    foreach ($g in @($geaendert | Select-Object -First 10)) {
        Sag ("     GEAENDERT: {0}  -> {1}" -f $g[2], (($g[1].Keys | ForEach-Object { $_ }) -join ', '))
    }

    if ($Schreiben) {
        if ($neu.Count -gt 0) { SupaInsert 'angebote' $neu }
        if ($geaendert.Count -gt 0) { SupaAendern 'angebote' $geaendert }
    }
}

# ==========================================================
# RECHNUNGEN (Reiter "Belege" an der Adresse)
# ==========================================================
# Eindeutig ueber BelID - die Belegnummer beginnt jedes Jahr neu, und derselbe
# Beleg steht oft in Belegen UND Archiv. Storno/Gutschrift immer als Minus.
if ($Nur -eq 'alles' -or $Nur -eq 'rechnungen') {
    Sag ""
    Sag "-- Rechnungen --" 'Cyan'

    if ($adrIndex.Count -eq 0) {
        foreach ($c in (SupaHolen 'customers')) {
            if ($c.address_number) { $adrIndex[[string]$c.address_number] = $c.id }
        }
    }

    $arten = "('Rechnung','Direktrechnung','Stornorechnung','Gutschrift')"
    $sqlRe = @"
SELECT 1 AS Quelle, b.BelID, b.Belegart, CAST(b.Belegnummer AS varchar(20)) AS Nr, b.Belegjahr, b.Belegdatum,
       b.A0AdressNr, b.A0Matchcode, b.Nettobetrag, b.Steuerbetrag, b.Bruttobetrag
FROM dbo.KHKVKBelege b WHERE b.Belegart IN $arten AND b.Belegdatum >= '$RechnungenAb'
UNION ALL
SELECT 2, x.BelID, x.Belegart, CAST(x.Belegnummer AS varchar(20)), x.Belegjahr, x.Belegdatum,
       x.A0AdressNr, x.A0Matchcode, x.Nettobetrag, x.Steuerbetrag, x.Bruttobetrag
FROM dbo.KHKArchivVKBelege x WHERE x.Belegart IN $arten AND x.Belegdatum >= '$RechnungenAb'
ORDER BY 1
"@
    # Aktuelle Belege (Quelle 1) vor Archiv - bei doppelter BelID gewinnt der aktuelle.
    $gesehen = @{}
    $sage = @(SageFrage $sqlRe | Where-Object {
        $id = [string]$_.BelID
        if ($gesehen.ContainsKey($id)) { $false } else { $gesehen[$id] = $true; $true }
    })
    Sag ("  Sage: {0} Rechnungsbelege ab {1} (Belege + Archiv, ohne Doppelte)" -f $sage.Count, $RechnungenAb)

    $vorhanden = SupaHolen 'rechnungen'
    $nachId = @{}
    foreach ($a in $vorhanden) { $nachId[[string]$a.sage_bel_id] = $a }
    Sag ("  Supabase: {0} Rechnungsbelege" -f $vorhanden.Count)

    function Betrag($v, $minus) {
        $z = Zahl $v
        if ($null -eq $z) { return $null }
        $z = [Math]::Round($z, 2)
        if ($minus) { return -[Math]::Abs($z) }
        return $z
    }

    $neu = @(); $geaendert = @(); $gleich = 0; $ohneKunde = 0
    foreach ($r in $sage) {
        $minus = $r.Belegart -eq 'Stornorechnung' -or $r.Belegart -eq 'Gutschrift'
        $adr   = Text $r.A0AdressNr
        $kid   = $null
        if ($adr -and $adrIndex.ContainsKey($adr)) { $kid = $adrIndex[$adr] } else { $ohneKunde++ }
        $datum = $null
        if ($r.Belegdatum -is [DateTime]) { $datum = $r.Belegdatum.ToString('yyyy-MM-dd') }

        $zeile = [ordered]@{
            sage_bel_id     = [int]$r.BelID
            belegart        = Text $r.Belegart
            belegnummer     = Text $r.Nr
            belegjahr       = $(if ($r.Belegjahr -is [DBNull]) { $null } else { [int]$r.Belegjahr })
            belegdatum      = $datum
            address_number  = $adr
            customer_id     = $kid
            kundenmatchcode = Text $r.A0Matchcode
            netto           = Betrag $r.Nettobetrag $minus
            mwst            = Betrag $r.Steuerbetrag $minus
            brutto          = Betrag $r.Bruttobetrag $minus
        }

        $alt = $nachId[[string]$r.BelID]
        if (-not $alt) { $neu += $zeile; continue }

        $felder = [ordered]@{}
        foreach ($f in $zeile.Keys) {
            if ($f -eq 'sage_bel_id') { continue }
            $n = $zeile[$f]; $a = $alt.$f
            if ($f -in 'netto', 'mwst', 'brutto') {
                if ($null -eq $n -and $null -eq $a) { continue }
                if ($null -ne $n -and $null -ne $a -and [decimal]$a -eq [decimal]$n) { continue }
            } elseif ("$n" -eq "$a") { continue }
            # Kunde nie auf leer setzen, nur weil die Adresse (noch) fehlt.
            if ($f -eq 'customer_id' -and $null -eq $n) { continue }
            $felder[$f] = $n
        }
        if ($felder.Count -eq 0) { $gleich++ }
        else {
            $felder['aktualisiert_am'] = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
            $geaendert += ,@($alt.id, $felder, ("{0} {1}/{2}" -f $zeile.belegart, $zeile.belegnummer, $zeile.belegjahr))
        }
    }

    Sag ("  -> {0} neu, {1} geaendert, {2} unveraendert" -f $neu.Count, $geaendert.Count, $gleich) 'Yellow'
    if ($ohneKunde -gt 0) { Sag ("  {0} Belege ohne passende Adresse in der Webapp - werden ohne Kunde gespeichert und spaeter zugeordnet" -f $ohneKunde) 'Red' }
    foreach ($b in @($neu | Select-Object -First 5)) {
        Sag ("     NEU: {0} {1}/{2}  {3}  {4}" -f $b.belegart, $b.belegnummer, $b.belegjahr, $b.belegdatum, $b.kundenmatchcode)
    }
    foreach ($g in @($geaendert | Select-Object -First 5)) {
        Sag ("     GEAENDERT: {0}  -> {1}" -f $g[2], (($g[1].Keys | Where-Object { $_ -ne 'aktualisiert_am' }) -join ', '))
    }

    if ($Schreiben) {
        if ($neu.Count -gt 0) { SupaInsert 'rechnungen' $neu }
        if ($geaendert.Count -gt 0) { SupaAendern 'rechnungen' $geaendert }
    }
}

# ==========================================================
# ANGEBOTS-PDFs aus einem Ordner an das Angebot haengen
# ==========================================================
# Ordner steht in sage-sync.config.ps1 ($AngebotePdfOrdner, UNC-Pfad - die
# geplante Aufgabe kennt keine Laufwerksbuchstaben wie S:). Angebotsnummer
# (5-stellig) aus dem Dateinamen. Schon vorhandene PDF (Pruefsumme/Groesse)
# wird nicht erneut hochgeladen. Erledigte Dateien -> Unterordner "zugeordnet".
if (($Nur -eq 'alles' -or $Nur -eq 'pdf') -and $AngebotePdfOrdner) {
    Sag ""
    Sag "-- Angebots-PDFs --" 'Cyan'
    if (-not (Test-Path -LiteralPath $AngebotePdfOrdner)) { throw "PDF-Ordner nicht erreichbar: $AngebotePdfOrdner" }
    $dateien = @(Get-ChildItem -LiteralPath $AngebotePdfOrdner -File -Filter *.pdf)
    Sag ("  {0} PDF im Ordner" -f $dateien.Count)

    if ($dateien.Count -gt 0) {
        $angAlle = @(SupaHolen 'angebote')
        $nachNr = @{}
        foreach ($a in $angAlle) {
            $k = [string]$a.belegnummer
            if (-not $nachNr.ContainsKey($k)) { $nachNr[$k] = @() }
            $nachNr[$k] += $a
        }
        $erledigtOrdner = Join-Path $AngebotePdfOrdner 'zugeordnet'

        foreach ($d in $dateien) {
            $nummern = @([regex]::Matches($d.BaseName, '(?<!\d)\d{5}(?!\d)') | ForEach-Object { $_.Value } | Select-Object -Unique)
            $kandidaten = @($nummern | ForEach-Object { $nachNr[$_] } | Where-Object { $_ })
            # Gleiche Nummer aus mehreren Jahren: Jahr im Dateinamen ("Angebot 2027-30041"),
            # sonst Aenderungsjahr der Datei, sonst das neueste Angebot.
            if ($kandidaten.Count -gt 1) {
                $mJahr = [regex]::Match($d.BaseName, '(?<!\d)20\d\d(?!\d)')
                $jahr = if ($mJahr.Success) { $mJahr.Value } else { $d.LastWriteTime.ToString('yyyy') }
                $imJahr = @($kandidaten | Where-Object { "$($_.belegdatum)".StartsWith($jahr) })
                if ($imJahr.Count -ge 1) { $kandidaten = $imJahr }
                if (@($kandidaten | ForEach-Object { [string]$_.belegnummer } | Select-Object -Unique).Count -eq 1) {
                    $kandidaten = @($kandidaten | Sort-Object { "$($_.belegdatum)" } -Descending | Select-Object -First 1)
                }
            }
            if ($kandidaten.Count -ne 1) {
                $grund = if ($kandidaten.Count -eq 0) { 'kein passendes Angebot' } else { 'mehrere Angebote passen' }
                Sag ("     BLEIBT LIEGEN: {0} ({1})" -f $d.Name, $grund) 'Red'
                continue
            }
            $ang  = $kandidaten[0]
            $sha  = (Get-FileHash -LiteralPath $d.FullName -Algorithm SHA256).Hash.ToLower()
            $info = @{ angebot_id = $ang.id; name = $d.Name; size = $d.Length; sha256 = $sha }

            if (-not $Schreiben) {
                Sag ("     WUERDE ZUORDNEN: {0} -> Angebot {1}" -f $d.Name, $ang.belegnummer)
                continue
            }
            try {
            $r = Api (@{ aktion = 'pdf_pruefen' } + $info)
            if ($r.status -eq 'hochladen') {
                Invoke-WebRequest -UseBasicParsing -Method Put -Uri $r.uploadUrl -InFile $d.FullName -ContentType 'application/pdf' | Out-Null
                $f = Api (@{ aktion = 'pdf_fertig'; key = $r.key } + $info)
                if ($f.status -eq 'ersetzt') {
                    Sag ("     ERSETZT:    {0} -> Angebot {1} (alte Fassung geloescht)" -f $d.Name, $f.belegnummer) 'Green'
                } else {
                    Sag ("     ANGEHAENGT: {0} -> Angebot {1}" -f $d.Name, $f.belegnummer) 'Green'
                }
            } elseif ($r.status -eq 'vorhanden') {
                Sag ("     SCHON DA:   {0} -> Angebot {1} (nicht erneut hochgeladen)" -f $d.Name, $r.belegnummer)
            } else {
                Sag ("     BLEIBT LIEGEN: {0} ({1})" -f $d.Name, $r.status) 'Red'
                continue
            }
            # Erledigt (angehaengt oder schon da) -> Unterordner, damit jeder sieht, was durch ist.
            New-Item -ItemType Directory -Force -Path $erledigtOrdner | Out-Null
            Move-Item -LiteralPath $d.FullName -Destination (Join-Path $erledigtOrdner $d.Name) -Force
            } catch {
                # Eine PDF (z. B. noch geoeffnet) darf nicht den ganzen Abgleich abbrechen.
                Sag ("     FEHLER bei {0}: {1} - bleibt liegen, naechster Lauf versucht es erneut" -f $d.Name, $_.Exception.Message) 'Red'
            }
        }
    }
}

if ($Schreiben -and ($Nur -eq 'alles' -or $Nur -eq 'angebote')) {
    # Anzeige "zuletzt aktualisiert" unter der Angebotsliste (js/listen.js)
    Api @{ aktion = 'stempel'; naechste = (Naechste) } | Out-Null
}

Sag ""
if ($Schreiben) { Sag "Fertig - geschrieben." 'Green' }
else            { Sag "Fertig - PROBE, es wurde nichts geschrieben. Mit -Schreiben ausfuehren." 'Green' }
