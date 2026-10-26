@echo off
title meetra Windows-Updates - STOPP
echo Bricht einen angekuendigten Neustart ab, beendet laufende Updates und schaltet die Aufgabe ab ...
shutdown /a >nul 2>&1 && echo Geplanter Neustart abgebrochen. || echo Kein Neustart angekuendigt.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$n='meetra Windows-Updates'; try { Stop-ScheduledTask -TaskName $n -ErrorAction Stop; Write-Host 'Laufende Aufgabe beendet.' } catch { Write-Host 'Aufgabe lief nicht oder existiert nicht.' }; try { Disable-ScheduledTask -TaskName $n -ErrorAction Stop | Out-Null; Write-Host 'Aufgabe abgeschaltet (startet nicht mehr von selbst).' } catch { Write-Host 'Aufgabe nicht gefunden.' }"
echo.
echo Wieder einschalten: UPDATES-WIEDER-AN.bat
pause
