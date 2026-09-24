# ==========================================================
# Sage-Abgleich auf dem SERVER einrichten (einmalig)
# ==========================================================
# Auf dem Server als Administrator in PowerShell ausfuehren, aus dem Ordner,
# in den sage-sync.ps1 und sage-sync.config.ps1 kopiert wurden:
#
#   powershell -ExecutionPolicy Bypass -File .\sage-sync-server-einrichten.ps1
#
# Auch zum Aendern: erneut ausfuehren, die Aufgabe wird ueberschrieben (-Force).
#
# Macht:
#   1. Ordner C:\meetra-sync anlegen, beide Dateien hineinkopieren
#   2. Rechte: nur Administratoren, SYSTEM und das Aufgaben-Konto duerfen den Ordner lesen/aendern
#   3. Probelauf (schreibt nichts)
#   4. Geplante Aufgabe "meetra Sage-Abgleich" Mo-Fr 07:30-17:00 alle 30 min, auch ohne Anmeldung
# Das Passwort des Kontos fragt Windows selbst ab - es wird nirgends gespeichert
# ausser in der Aufgabenplanung.
# ==========================================================
param(
    [string]$Ziel  = 'C:\meetra-sync',
    [string]$Konto = "$env:USERDOMAIN\$env:USERNAME"
)
$ErrorActionPreference = 'Stop'
$quelle = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "`n1) Ordner $Ziel" -ForegroundColor Cyan
New-Item -ItemType Directory -Force $Ziel | Out-Null
foreach ($f in 'sage-sync.ps1', 'sage-sync.config.ps1') {
    if (-not (Test-Path (Join-Path $quelle $f))) { throw "Fehlt neben diesem Skript: $f" }
    if ((Resolve-Path $quelle).Path -ne (Resolve-Path $Ziel).Path) { Copy-Item (Join-Path $quelle $f) $Ziel -Force }
}
Write-Host "   kopiert."

Write-Host "`n2) Rechte auf $Ziel (nur Administratoren, SYSTEM, $Konto)" -ForegroundColor Cyan
icacls $Ziel /inheritance:r /grant:r "*S-1-5-32-544:(OI)(CI)F" "*S-1-5-18:(OI)(CI)F" "${Konto}:(OI)(CI)M" | Out-Null
Write-Host "   gesetzt."

Write-Host "`n3) Probelauf (schreibt nichts)" -ForegroundColor Cyan
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Ziel 'sage-sync.ps1')
if ($LASTEXITCODE -ne 0) { throw "Probelauf fehlgeschlagen - Aufgabe wird NICHT angelegt. Meldung oben pruefen." }

Write-Host "`n4) Geplante Aufgabe unter $Konto" -ForegroundColor Cyan
$cred = Get-Credential -UserName $Konto -Message "Passwort fuer $Konto (die Aufgabe laeuft damit auch ohne Anmeldung)"
$aktion  = New-ScheduledTaskAction -Execute 'powershell.exe' -WorkingDirectory $Ziel `
    -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$Ziel\sage-sync.ps1`" -Schreiben"
# Mo-Fr ab 07:30 alle 30 min, letzter Lauf 17:00 (Dauer 9:30 + 1 min, damit 17:00 noch dabei ist).
# Plan muss zu IntervallMin/ZeitVon/ZeitBis in sage-sync.ps1 passen (Anzeige "naechste Aktualisierung").
$ausloeser = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday, Tuesday, Wednesday, Thursday, Friday -At '07:30'
$ausloeser.Repetition = (New-ScheduledTaskTrigger -Once -At '07:30' -RepetitionInterval (New-TimeSpan -Minutes 30) -RepetitionDuration (New-TimeSpan -Hours 9 -Minutes 31)).Repetition
$optionen  = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 10)
Register-ScheduledTask -TaskName 'meetra Sage-Abgleich' -Action $aktion -Trigger $ausloeser -Settings $optionen `
    -User $cred.UserName -Password $cred.GetNetworkCredential().Password -RunLevel Limited -Force | Out-Null
Write-Host "   angelegt - Mo-Fr 07:30 bis 17:00 alle 30 Minuten." -ForegroundColor Green
Get-ScheduledTask -TaskName 'meetra Sage-Abgleich' | Get-ScheduledTaskInfo | ForEach-Object { Write-Host "   naechster Lauf: $($_.NextRunTime)" -ForegroundColor Green }
Write-Host "   Protokoll: $Ziel\sage-sync.log`n"
