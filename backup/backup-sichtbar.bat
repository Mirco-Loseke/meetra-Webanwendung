@echo off
rem Startet backup.bat so, dass das Fenster offen bleibt und die Fehlermeldung lesbar ist.
rem pushd legt bei Netzpfaden (\\Server\...) automatisch ein Laufwerk an.
pushd "%~dp0"
echo Ordner: %CD%
echo.
if not exist "backup.bat" echo [FEHLER] backup.bat liegt nicht in diesem Ordner.
if not exist "backup-config.cmd" echo [FEHLER] backup-config.cmd liegt nicht in diesem Ordner.
echo.
cmd /k "call backup.bat & echo. & echo ---- backup.bat beendet, Fehlercode: %%errorlevel%% ----"
