# meetra - Windows-Updates auf dem Server: suchen, herunterladen, installieren, bei Bedarf neu starten.
# Nutzt nur die in Windows eingebaute Update-Schnittstelle, es muss nichts nachinstalliert werden.
#
# Probelauf (zeigt nur, was kommen wuerde, installiert und startet NICHTS neu):
#   powershell -ExecutionPolicy Bypass -File windows-updates.ps1 -NurSuchen
#
# Der Neustart ist ein ganz normales, geordnetes Herunterfahren mit Neustart
# (shutdown /r): Dienste wie SQL Server und Sage werden wie gewohnt beendet und
# starten danach von selbst wieder. Es gibt 3 Minuten Vorwarnung, abbrechen: shutdown /a
param(
    [switch]$NurSuchen,
    [int]$NeustartInSekunden = 180
)

# Diese Updates werden NICHT automatisch eingespielt (grosse Spruenge, eigene Planung noetig):
$Ausnahmen = 'Funktionsupdate|Feature update|Upgrade auf|SQL Server|Sage'

$log = Join-Path $PSScriptRoot 'updates-log.txt'
function Log([string]$t) {
    $z = "{0}  {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $t
    Add-Content -Path $log -Value $z -Encoding UTF8
    Write-Host $z
}

try {
    Log ('===== Start' + $(if ($NurSuchen) { ' (nur suchen)' } else { '' }) + ' =====')
    $sitzung = New-Object -ComObject Microsoft.Update.Session
    $suche = $sitzung.CreateUpdateSearcher()
    $ergebnis = $suche.Search("IsInstalled=0 and IsHidden=0 and Type='Software'")

    $liste = New-Object -ComObject Microsoft.Update.UpdateColl
    foreach ($u in $ergebnis.Updates) {
        if ($u.Title -match $Ausnahmen) { Log ("uebersprungen (Ausnahme): " + $u.Title); continue }
        if ($u.InstallationBehavior.CanRequestUserInput) { Log ("uebersprungen (braucht Eingabe): " + $u.Title); continue }
        if (-not $u.EulaAccepted) { $u.AcceptEula() | Out-Null }
        [void]$liste.Add($u)
        Log ("gefunden: " + $u.Title)
    }
    Log ("{0} Update(s) zum Installieren." -f $liste.Count)

    $neustart = $false
    if ($liste.Count -gt 0 -and -not $NurSuchen) {
        Log 'Lade herunter ...'
        $lader = $sitzung.CreateUpdateDownloader()
        $lader.Updates = $liste
        $dl = $lader.Download()
        Log ("Download-Ergebnis: Code " + $dl.ResultCode)

        $bereit = New-Object -ComObject Microsoft.Update.UpdateColl
        foreach ($u in $liste) { if ($u.IsDownloaded) { [void]$bereit.Add($u) } }
        if ($bereit.Count -gt 0) {
            Log ("Installiere {0} Update(s) ..." -f $bereit.Count)
            $inst = $sitzung.CreateUpdateInstaller()
            $inst.Updates = $bereit
            $ir = $inst.Install()
            Log ("Installations-Ergebnis: Code {0}, Neustart noetig: {1}" -f $ir.ResultCode, $ir.RebootRequired)
            if ($ir.RebootRequired) { $neustart = $true }
        } else {
            Log 'Nichts heruntergeladen - kein Install.'
        }
    }

    # Wartet schon ein Neustart von einem frueheren Update?
    $info = New-Object -ComObject Microsoft.Update.SystemInfo
    if ($info.RebootRequired) { $neustart = $true }

    if ($NurSuchen) {
        Log ("Neustart waere noetig: " + $neustart + " (Probelauf, nichts passiert).")
    } elseif ($neustart) {
        Log ("Geordneter Neustart in {0} Sekunden." -f $NeustartInSekunden)
        & shutdown.exe /r /t $NeustartInSekunden /d p:2:17 /c "meetra: Neustart nach Windows-Updates (abbrechen: shutdown /a)"
    } else {
        Log 'Kein Neustart noetig.'
    }
    Log '===== Ende ====='
} catch {
    Log ("FEHLER: " + $_.Exception.Message)
    exit 1
}
