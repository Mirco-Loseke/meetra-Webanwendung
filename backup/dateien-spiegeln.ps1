# meetra - Dateien aus Cloudflare R2 lesbar auf das Laufwerk kopieren
# Nur KOPIEREN: nichts in R2 aendern, nichts auf dem Laufwerk loeschen oder ueberschreiben.
# Zugangsdaten kommen aus backup-config.cmd (DB_URL, R2_*), es braucht nichts Neues.
#
# Test mit einer Maschine:
#   powershell -ExecutionPolicy Bypass -File dateien-spiegeln.ps1 -Maschine "JT 580" -Adresse "Emsland" -NurAnzeigen
#   (ohne -NurAnzeigen wird wirklich kopiert)
param(
    [Parameter(Mandatory = $true)][string]$Maschine,
    [string]$Adresse = '',
    [string]$Ziel = '\\MEETRA-SA\Sammelmappen\Web-Spiegel',
    [switch]$NurAnzeigen
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$env:PGCLIENTENCODING = 'UTF8'
$hier = Split-Path -Parent $MyInvocation.MyCommand.Path

# ---- Einstellungen aus backup-config.cmd lesen ----------------------------
$cfg = @{}
foreach ($z in Get-Content (Join-Path $hier 'backup-config.cmd') -Encoding UTF8) {
    if ($z -match '^\s*set\s+"([A-Za-z0-9_]+)=(.*)"\s*$') { $cfg[$Matches[1]] = $Matches[2] -replace '%%', '%' }
}
foreach ($k in 'DB_URL', 'R2_BUCKET', 'R2_ENDPOINT', 'R2_KEY', 'R2_SECRET') {
    if (-not $cfg[$k]) { throw "In backup-config.cmd fehlt: $k" }
}

# ---- Werkzeuge suchen ----------------------------------------------------
$rclone = (Get-Command rclone -ErrorAction SilentlyContinue).Source
if (-not $rclone -and (Test-Path 'C:\rclone-v1.75.2-windows-amd64\rclone.exe')) { $rclone = 'C:\rclone-v1.75.2-windows-amd64\rclone.exe' }
if (-not $rclone) { throw 'rclone nicht gefunden (siehe ANLEITUNG.txt).' }
$psql = (Get-Command psql -ErrorAction SilentlyContinue).Source
if (-not $psql) {
    $psql = Get-ChildItem "$env:ProgramFiles\PostgreSQL\*\bin\psql.exe" -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | Select-Object -First 1 -ExpandProperty FullName
}
if (-not $psql) { throw 'psql nicht gefunden (kommt mit den PostgreSQL-Clientwerkzeugen wie pg_dump).' }

$env:RCLONE_CONFIG_R2_TYPE = 's3'
$env:RCLONE_CONFIG_R2_PROVIDER = 'Cloudflare'
$env:RCLONE_CONFIG_R2_ACCESS_KEY_ID = $cfg['R2_KEY']
$env:RCLONE_CONFIG_R2_SECRET_ACCESS_KEY = $cfg['R2_SECRET']
$env:RCLONE_CONFIG_R2_ENDPOINT = $cfg['R2_ENDPOINT']
$env:RCLONE_CONFIG_R2_ACL = 'private'
$env:RCLONE_CONFIG_R2_NO_CHECK_BUCKET = 'true'
$bucket = $cfg['R2_BUCKET']

function Sauber([string]$s) {
    $s = ($s -replace '[\\/:*?"<>|]', ' ' -replace '\s+', ' ').Trim().TrimEnd('.', ' ')
    if ($s.Length -gt 80) { $s = $s.Substring(0, 80).TrimEnd() }
    if (-not $s) { $s = 'ohne Namen' }
    return $s
}
function Feld($o, [string[]]$namen) {
    foreach ($n in $namen) { $v = $o.$n; if ($v -ne $null -and "$v".Trim()) { return "$v".Trim() } }
    return ''
}
function Sql([string]$q) {
    $aus = & $psql $cfg['DB_URL'] -At -c $q
    if ($LASTEXITCODE -ne 0) { throw 'Datenbankabfrage fehlgeschlagen.' }
    return @($aus | Where-Object { $_ -and $_.Trim() })
}
function Lit([string]$s) { return "'" + ($s -replace "'", "''") + "'" }

# ---- Maschine und Adresse finden ---------------------------------------
$q = "select row_to_json(m) from machines m where m.name ilike " + (Lit "%$Maschine%") + " or (coalesce(m.manufacturer,'') || ' ' || coalesce(m.name,'')) ilike " + (Lit "%$Maschine%")
$maschinen = @(Sql $q | ForEach-Object { $_ | ConvertFrom-Json })
$treffer = @()
foreach ($m in $maschinen) {
    $kunde = $null
    if ($m.customer_id) {
        $r = Sql ("select row_to_json(c) from customers c where c.id = " + (Lit "$($m.customer_id)"))
        if ($r.Count) { $kunde = $r[0] | ConvertFrom-Json }
    }
    $kName = if ($kunde) { Feld $kunde @('name', 'company', 'firma', 'company_name', 'display_name') } else { '' }
    if ($Adresse -and ($kName -notlike "*$Adresse*")) { continue }
    $treffer += [pscustomobject]@{ M = $m; K = $kunde; KName = $kName }
}
if ($treffer.Count -eq 0) { throw "Keine Maschine '$Maschine' mit Adresse '$Adresse' gefunden." }
if ($treffer.Count -gt 1) {
    Write-Host "Mehrere Treffer - bitte genauer angeben:" -ForegroundColor Yellow
    $treffer | ForEach-Object { Write-Host ("  ID {0}: {1} {2} | Adresse: {3}" -f $_.M.id, $_.M.manufacturer, $_.M.name, $_.KName) }
    exit 2
}
$t = $treffer[0]; $m = $t.M
$id = "$($m.id)"
$serie = Feld $m @('serial', 'serial_number')
$maschName = Sauber ((@($m.manufacturer, $m.name, $serie) | Where-Object { $_ }) -join ' ')
$adrName = if ($t.KName) { Sauber $t.KName } else { 'Ohne Adresse' }
Write-Host ("Maschine: {0}  (ID {1})" -f $maschName, $id)
Write-Host ("Adresse:  {0}" -f $adrName)

$adrOrdner = Join-Path (Join-Path $Ziel 'Adressen') $adrName
$maschOrdner = Join-Path (Join-Path $adrOrdner 'Maschinen') ("$maschName [$id]")

# Namen der Unterordner in R2 -> lesbare Namen auf dem Laufwerk
$umbenennen = @{
    'vorschaubilder' = 'Fotos'; 'dokumente' = 'Dokumente'; 'serviceberichte' = 'Serviceberichte'
    'protokolle' = 'Protokolle'; 'mietvereinbarungen' = 'Mietvereinbarungen'
    'uebergabeprotokolle' = 'Einweisungen'; 'wartung' = 'Wartung'; 'verlauf' = 'Verlauf'
    'werkstatt' = 'Werkstatt'; 'schaden' = 'Schaden'
}

$log = Join-Path $Ziel '_spiegel-log.txt'
function Kopieren([string]$quelle, [string]$zielOrdner, [switch]$flach) {
    $a = @('copy', "R2:$bucket/$quelle", $zielOrdner, '--ignore-existing', '--local-case-sensitive', '--transfers=4', '--checkers=8', '--stats-one-line', '-v')
    if ($flach) { $a += @('--max-depth', '1') }
    if ($NurAnzeigen) { $a += '--dry-run' }
    Write-Host ("  {0}  ->  {1}" -f $quelle, $zielOrdner)
    & $rclone @a 2>&1 | ForEach-Object { "$_" } | Where-Object { $_ -match 'Copied|Failed|ERROR|NOTICE|Transferred' } | ForEach-Object { Write-Host "     $_" }
    if ($LASTEXITCODE -ne 0) { Write-Host "     [WARNUNG] rclone meldete einen Fehler bei $quelle" -ForegroundColor Yellow }
}
function Unterordner([string]$quelle) {
    return @(& $rclone lsf "R2:$bucket/$quelle" --dirs-only 2>$null | ForEach-Object { $_.TrimEnd('/') } | Where-Object { $_ })
}

if (-not $NurAnzeigen -and -not (Test-Path $Ziel)) { New-Item -ItemType Directory -Path $Ziel | Out-Null }
Write-Host ''; Write-Host $(if ($NurAnzeigen) { 'NUR ANZEIGEN (es wird nichts kopiert):' } else { 'Kopiere:' })

# ---- Maschine: alte Ordner "Maschinen/<id>_...." und neuer Ordner "maschinen/<id>" ----
$quellen = @()
foreach ($d in Unterordner 'Maschinen') { if ($d -eq $id -or $d.StartsWith("${id}_")) { $quellen += "Maschinen/$d" } }
$quellen += "maschinen/$id"
foreach ($q1 in $quellen) {
    foreach ($u in Unterordner $q1) {
        $schluessel = $u.ToLower()
        $ziel = if ($umbenennen.ContainsKey($schluessel)) { $umbenennen[$schluessel] } else { Sauber $u }
        Kopieren "$q1/$u" (Join-Path $maschOrdner $ziel)
    }
    # Dateien direkt im Maschinenordner (ohne Unterordner)
    Kopieren $q1 (Join-Path $maschOrdner 'Sonstiges') -flach
}

# ---- Adresse: Ablage ----
if ($t.K) { Kopieren ("adressen/{0}/ablage" -f $t.K.id) (Join-Path $adrOrdner 'Ablage') }

$zeile = "{0}  {1}  Maschine {2} / {3}  {4}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm'), $(if ($NurAnzeigen) { 'PROBE' } else { 'KOPIERT' }), $id, $adrName, $maschName
if (-not $NurAnzeigen) { Add-Content -Path $log -Value $zeile -Encoding UTF8 }
Write-Host ''; Write-Host 'Fertig.' -ForegroundColor Green
if (-not $NurAnzeigen) { Write-Host "Ordner: $adrOrdner" }
