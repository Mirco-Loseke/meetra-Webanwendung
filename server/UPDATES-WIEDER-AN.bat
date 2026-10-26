@echo off
title meetra Windows-Updates - wieder einschalten
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Enable-ScheduledTask -TaskName 'meetra Windows-Updates' -ErrorAction Stop | Out-Null; Write-Host 'Aufgabe wieder eingeschaltet.' } catch { Write-Host 'Aufgabe nicht gefunden.' }"
echo.
pause
