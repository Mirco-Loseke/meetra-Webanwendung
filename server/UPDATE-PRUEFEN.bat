@echo off
title meetra - Update-/Neustart-Bestand pruefen (nur lesen)
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0update-pruefen.ps1"
echo.
pause
