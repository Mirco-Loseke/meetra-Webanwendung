@echo off
title meetra Windows-Updates - woechentlich einrichten
cd /d "%~dp0"
rem ==========================================================
rem  Legt in der Aufgabenplanung die Aufgabe "meetra Windows-Updates" an:
rem  JEDEN SAMSTAG um 03:00 Uhr sucht, laedt und installiert windows-updates.ps1
rem  die Updates und startet den Server danach (nur wenn noetig) geordnet neu.
rem  Laeuft als Systemkonto. Diese Datei per Rechtsklick "Als Administrator ausfuehren".
rem  Zeit/Tag aendern: unten bei ZEIT und TAG (Saturday, Sunday ...).
rem  TIPP: Den Ordner "server" vorher nach C:\meetra-server kopieren und von dort einrichten.
rem  ERST einen Probelauf machen: windows-updates.ps1 -NurSuchen (siehe ERKLAERUNG).
rem ==========================================================
set "ZEIT=03:00"
set "TAG=Saturday"

net session >nul 2>&1
if errorlevel 1 (
    echo [FEHLER] Bitte diese Datei per Rechtsklick "Als Administrator ausfuehren" starten.
    echo.
    pause
    exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "$a = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -ExecutionPolicy Bypass -File \"' + '%~dp0windows-updates.ps1' + '\"') -WorkingDirectory '%~dp0'; $t = New-ScheduledTaskTrigger -Weekly -DaysOfWeek %TAG% -At '%ZEIT%'; $s = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 3); $p = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest; Register-ScheduledTask -TaskName 'meetra Windows-Updates' -Action $a -Trigger $t -Settings $s -Principal $p -Description 'Woechentliche Windows-Updates mit geordnetem Neustart' -Force | Out-Null; Write-Host 'OK: Aufgabe meetra Windows-Updates wurde angelegt.'"
if errorlevel 1 (
    echo.
    echo [FEHLER] Die Aufgabe konnte nicht angelegt werden.
) else (
    echo.
    echo Jeden %TAG% um %ZEIT% Uhr. Ergebnis jedes Laufs: updates-log.txt in diesem Ordner.
    echo Notbremse: UPDATES-STOPP.bat
)
echo.
pause
