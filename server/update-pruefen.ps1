# meetra - Bestandsaufnahme: Laufen auf diesem Server schon automatische Updates/Neustarts?
# Nur LESEN, es wird nichts veraendert. Ergebnis: Bildschirm + update-bestand.txt in diesem Ordner.
#   powershell -ExecutionPolicy Bypass -File update-pruefen.ps1   (als Administrator)
$ErrorActionPreference = 'SilentlyContinue'
$aus = Join-Path $PSScriptRoot 'update-bestand.txt'
$zeilen = New-Object System.Collections.Generic.List[string]
function Z([string]$t) { $zeilen.Add($t); Write-Host $t }
function Kopf([string]$t) { Z ''; Z ('=' * 60); Z $t; Z ('=' * 60) }

Kopf 'SERVER'
$os = Get-CimInstance Win32_OperatingSystem
Z ("Name:        " + $env:COMPUTERNAME)
Z ("System:      " + $os.Caption + ' ' + $os.Version)
Z ("Letzter Start: " + $os.LastBootUpTime + "   (Laufzeit: " + [int]((Get-Date) - $os.LastBootUpTime).TotalDays + " Tage)")

Kopf '1) GEPLANTE AUFGABEN, die nach Update / Neustart / Herunterfahren aussehen'
$treffer = Get-ScheduledTask | Where-Object {
    $a = ($_.Actions | ForEach-Object { $_.Execute + ' ' + $_.Arguments }) -join ' '
    ($a -match 'shutdown|restart|reboot|Restart-Computer|wuauclt|usoclient|PSWindowsUpdate|windows-updates') -or
    ($_.TaskName -match 'update|neustart|reboot|restart|shutdown|herunterfahren') -and ($_.TaskPath -notmatch '^\\Microsoft\\')
}
if ($treffer) {
    foreach ($t in $treffer) {
        $i = $t.Actions | Select-Object -First 1
        Z ("- {0}{1}  [{2}]" -f $t.TaskPath, $t.TaskName, $t.State)
        Z ("    startet: " + $i.Execute + ' ' + $i.Arguments)
        $tr = ($t.Triggers | ForEach-Object { $_.CimClass.CimClassName -replace 'MSFT_Task','' }) -join ', '
        Z ("    Ausloeser: " + $tr)
        Z ("    Konto: " + $t.Principal.UserId)
    }
} else { Z 'Keine eigenen Aufgaben mit Update-/Neustart-Bezug gefunden.' }

Kopf '2) ALLE eigenen (nicht-Microsoft) geplanten Aufgaben'
Get-ScheduledTask | Where-Object { $_.TaskPath -notmatch '^\\Microsoft\\' -and $_.State -ne 'Disabled' } |
    ForEach-Object { Z ("- {0}{1}  [{2}]  Konto: {3}" -f $_.TaskPath, $_.TaskName, $_.State, $_.Principal.UserId) }

Kopf '3) WINDOWS-UPDATE-EINSTELLUNGEN (Richtlinien, z. B. vom Admin gesetzt)'
$wu = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate'
$au = "$wu\AU"
if (Test-Path $wu) {
    Z "Richtlinien-Schluessel vorhanden (Einstellungen per Gruppenrichtlinie/Registry):"
    Get-ItemProperty $wu | Format-List | Out-String | ForEach-Object { Z $_.Trim() }
    if (Test-Path $au) { Get-ItemProperty $au | Format-List | Out-String | ForEach-Object { Z $_.Trim() } }
    Z "Hinweise: AUOptions 2=melden, 3=laden+melden, 4=automatisch installieren; NoAutoUpdate 1=aus;"
    Z "          ScheduledInstallDay 0=taeglich 1=Sonntag..7=Samstag; NoAutoRebootWithLoggedOnUsers 1=kein Neustart bei Angemeldeten"
} else { Z 'Keine Update-Richtlinien gesetzt (Windows-Standard bzw. Einstellung in der Oberflaeche).' }
$su = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update').PSObject.Properties
Z ''
$dienst = Get-Service wuauserv, UsoSvc
$dienst | ForEach-Object { Z ("Dienst {0}: {1} (Start: {2})" -f $_.Name, $_.Status, $_.StartType) }

Kopf '4) ZULETZT INSTALLIERTE UPDATES (10)'
Get-HotFix | Sort-Object InstalledOn -Descending | Select-Object -First 10 |
    ForEach-Object { Z ("{0}  {1}  {2}" -f $_.InstalledOn.ToString('yyyy-MM-dd'), $_.HotFixID, $_.Description) }

Kopf '5) NEUSTARTS / HERUNTERFAHREN der letzten 60 Tage (wer/was hat es ausgeloest?)'
$von = (Get-Date).AddDays(-60)
$ev = Get-WinEvent -FilterHashtable @{ LogName = 'System'; Id = 1074, 6005, 6006, 6008, 41; StartTime = $von } -MaxEvents 80
if ($ev) {
    foreach ($e in ($ev | Sort-Object TimeCreated -Descending | Select-Object -First 30)) {
        $m = ($e.Message -split "`r?`n")[0]
        if ($m.Length -gt 170) { $m = $m.Substring(0, 170) + ' ...' }
        Z ("{0}  ID {1,-4}  {2}" -f $e.TimeCreated.ToString('yyyy-MM-dd HH:mm'), $e.Id, $m)
    }
    Z ''
    Z 'ID 1074 = geordneter Neustart/Herunterfahren (steht: Prozess und Grund, z. B. TrustedInstaller/wuauclt = Windows Update)'
    Z 'ID 6005/6006 = Systemstart / Ende des Ereignisprotokolls;  ID 6008/41 = unerwartetes Ausschalten'
} else { Z 'Keine Ereignisse gefunden (oder Protokoll nicht lesbar).' }

Kopf 'FERTIG'
Z ('Gespeichert in: ' + $aus)
$zeilen | Set-Content -Path $aus -Encoding UTF8
