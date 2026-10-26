@echo off
title meetra Datensicherung - werktags einrichten
cd /d "%~dp0"
rem ==========================================================
rem  Legt in der Windows-Aufgabenplanung die Aufgabe
rem  "meetra Datensicherung" an: MONTAG BIS FREITAG um 17:30 Uhr
rem  laeuft backup.bat /auto (Datenbank + Dokumente aus R2).
rem  Ersetzt die Aufgabe aus taeglich-einrichten.bat (gleicher Name).
rem  Uhrzeit aendern: unten bei ZEIT (z. B. 07:00).
rem  Laeuft als Systemkonto (SYSTEM) - auch wenn niemand angemeldet ist.
rem  Dafuer diese Datei per Rechtsklick "Als Administrator ausfuehren".
rem  War der Server zur Startzeit aus, wird beim naechsten Start nachgeholt.
rem  TIPP: Den Ordner "backup" vorher nach C:\meetra-backup kopieren und
rem  die Aufgabe von dort anlegen (nicht vom Desktop eines Benutzers).
rem  Entfernen: taeglich-entfernen.bat (gleicher Aufgabenname).
rem ==========================================================
set "ZEIT=17:30"

net session >nul 2>&1
if errorlevel 1 (
    echo [FEHLER] Bitte diese Datei per Rechtsklick "Als Administrator ausfuehren" starten.
    echo.
    pause
    exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "$a = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument ('/c \"\"' + '%~dp0backup.bat' + '\" /auto\"') -WorkingDirectory '%~dp0'; $t = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday,Tuesday,Wednesday,Thursday,Friday -At '%ZEIT%'; $s = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 3); $p = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest; Register-ScheduledTask -TaskName 'meetra Datensicherung' -Action $a -Trigger $t -Settings $s -Principal $p -Description 'Sicherung der meetra-Datenbank und Dokumente, Mo-Fr' -Force | Out-Null; Write-Host 'OK: Aufgabe meetra Datensicherung wurde angelegt.'"
if errorlevel 1 (
    echo.
    echo [FEHLER] Die Aufgabe konnte nicht angelegt werden.
) else (
    echo.
    echo Montag bis Freitag um %ZEIT% Uhr. Pruefen: Windows-Taste, "Aufgabenplanung" oeffnen,
    echo Aufgabe "meetra Datensicherung" - dort rechts "Ausfuehren" zum sofortigen Test.
    echo Ergebnis jedes Laufs: backup-log.txt im Sicherungsordner ^(ZIEL^).
)
echo.
pause
