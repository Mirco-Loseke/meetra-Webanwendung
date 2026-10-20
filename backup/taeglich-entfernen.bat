@echo off
title meetra Datensicherung - taegliche Aufgabe entfernen
powershell -NoProfile -ExecutionPolicy Bypass -Command "Unregister-ScheduledTask -TaskName 'meetra Datensicherung' -Confirm:$false; Write-Host 'Aufgabe entfernt.'"
echo.
pause
