@echo off
title meetra Dateien spiegeln - wieder einschalten
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Enable-ScheduledTask -TaskName 'meetra Dateien spiegeln' -ErrorAction Stop | Out-Null; Write-Host 'Aufgabe wieder eingeschaltet.' } catch { Write-Host 'Aufgabe nicht gefunden.' }"
echo.
pause
