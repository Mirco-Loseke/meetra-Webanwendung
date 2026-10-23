@echo off
title meetra Dateien spiegeln - STOPP
echo Beende laufende Spiegelung und schalte die Aufgabe ab ...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$n='meetra Dateien spiegeln'; try { Stop-ScheduledTask -TaskName $n -ErrorAction Stop; Write-Host 'Laufende Aufgabe beendet.' } catch { Write-Host 'Aufgabe lief nicht oder existiert nicht.' }; Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*dateien-spiegeln.ps1*' -and $_.ProcessId -ne $PID } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force; Write-Host ('Prozess beendet: ' + $_.ProcessId) }; try { Disable-ScheduledTask -TaskName $n -ErrorAction Stop | Out-Null; Write-Host 'Aufgabe abgeschaltet (startet nicht mehr von selbst).' } catch { Write-Host 'Aufgabe nicht gefunden - nichts abzuschalten.' }"
echo.
echo Fertig. Wieder einschalten: SPIEGELN-WIEDER-AN.bat
pause
