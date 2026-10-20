@echo off
title meetra Datensicherung - taeglich einrichten
cd /d "%~dp0"
rem ==========================================================
rem  Legt in der Windows-Aufgabenplanung die Aufgabe
rem  "meetra Datensicherung" an: JEDEN TAG um 17:00 Uhr laeuft backup.bat /auto.
rem  Laeuft als Systemkonto (SYSTEM) - also auch, wenn niemand am Server
rem  angemeldet ist. Dafuer muss diese Datei "Als Administrator" gestartet
rem  werden (Rechtsklick -> Als Administrator ausfuehren).
rem  War der Server um 17:00 aus, wird beim naechsten Start nachgeholt.
rem  Uhrzeit aendern: unten bei ZEIT.
rem  WICHTIG: In backup-config.cmd muss ZIEL ein ABSOLUTER Pfad sein
rem  (z. B. D:\meetra-Backups) - das Systemkonto hat kein eigenes Benutzerprofil.
rem ==========================================================
set "ZEIT=17:00"

net session >nul 2>&1
if errorlevel 1 (
    echo [FEHLER] Bitte diese Datei per Rechtsklick "Als Administrator ausfuehren" starten.
    echo.
    pause
    exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "$a = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument ('/c \"\"' + '%~dp0backup.bat' + '\" /auto\"') -WorkingDirectory '%~dp0'; $t = New-ScheduledTaskTrigger -Daily -At '%ZEIT%'; $s = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 3); $p = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest; Register-ScheduledTask -TaskName 'meetra Datensicherung' -Action $a -Trigger $t -Settings $s -Principal $p -Description 'Taegliche Sicherung der meetra-Datenbank' -Force | Out-Null; Write-Host 'OK: Aufgabe meetra Datensicherung wurde angelegt.'"
if errorlevel 1 (
    echo.
    echo [FEHLER] Die Aufgabe konnte nicht angelegt werden.
) else (
    echo.
    echo Taeglich um %ZEIT% Uhr. Pruefen: Windows-Taste, "Aufgabenplanung" oeffnen,
    echo Aufgabe "meetra Datensicherung" - dort rechts "Ausfuehren" zum sofortigen Test.
    echo Ergebnis jedes Laufs: backup-log.txt im Sicherungsordner ^(ZIEL^).
)
echo.
pause
