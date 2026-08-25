@echo off
setlocal enabledelayedexpansion
title meetra Datensicherung
cd /d "%~dp0"

rem ==========================================================
rem  meetra — Datensicherung auf Knopfdruck
rem  Doppelklick auf diese Datei sichert:
rem    1. die komplette Supabase-Datenbank (Struktur + Daten)
rem    2. auf Wunsch die Dokumente aus Cloudflare R2
rem  Einstellungen stehen in backup-config.cmd
rem ==========================================================

if not exist "%~dp0backup-config.cmd" (
    echo [FEHLER] backup-config.cmd fehlt im Ordner %~dp0
    goto :ende
)
call "%~dp0backup-config.cmd"

if "%DB_URL%"=="" (
    echo [FEHLER] In backup-config.cmd ist DB_URL noch leer.
    echo          Verbindungszeichenfolge aus Supabase eintragen.
    goto :ende
)

rem ---------- pg_dump suchen --------------------------------
set "PGDUMP="
for /f "delims=" %%i in ('where pg_dump 2^>nul') do if not defined PGDUMP set "PGDUMP=%%i"
if not defined PGDUMP (
    for /d %%d in ("%ProgramFiles%\PostgreSQL\*") do (
        if exist "%%~fd\bin\pg_dump.exe" set "PGDUMP=%%~fd\bin\pg_dump.exe"
    )
)
if not defined PGDUMP (
    echo [FEHLER] pg_dump wurde nicht gefunden.
    echo          PostgreSQL-Clientwerkzeuge installieren, siehe ANLEITUNG.txt
    goto :ende
)
echo Verwende: %PGDUMP%

rem ---------- Zeitstempel -----------------------------------
for /f "delims=" %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd_HHmm"') do set "STAMP=%%i"

set "DBZIEL=%ZIEL%\datenbank"
if not exist "%DBZIEL%" mkdir "%DBZIEL%" 2>nul
if not exist "%DBZIEL%" (
    echo [FEHLER] Zielordner laesst sich nicht anlegen: %DBZIEL%
    goto :ende
)

echo.
echo ==========================================================
echo  1/2  Datenbank sichern
echo ==========================================================
echo Ziel: %DBZIEL%
echo.

rem --- a) Wiederherstellungs-Format (komprimiert) -----------
echo [1] Vollsicherung (.dump) wird gezogen ...
call "%PGDUMP%" "%DB_URL%" --format=custom --compress=9 --no-owner --no-privileges --schema=public --file="%DBZIEL%\meetra_%STAMP%.dump"
if errorlevel 1 (
    echo [FEHLER] pg_dump ist fehlgeschlagen. Siehe Meldung oben.
    echo          Haeufigste Ursachen: falsches Passwort, falsche URI,
    echo          oder pg_dump ist aelter als der Server ^(ANLEITUNG.txt^).
    goto :ende
)

rem --- b) Lesbare SQL-Fassung -------------------------------
echo [2] Lesbare Fassung (.sql) wird gezogen ...
call "%PGDUMP%" "%DB_URL%" --format=plain --no-owner --no-privileges --schema=public --file="%DBZIEL%\meetra_%STAMP%.sql"
if errorlevel 1 echo [WARNUNG] Die lesbare Fassung konnte nicht erstellt werden.

for %%f in ("%DBZIEL%\meetra_%STAMP%.dump") do set "GROESSE=%%~zf"
echo.
echo Fertig: meetra_%STAMP%.dump  (!GROESSE! Bytes)

rem ---------- Alte Sicherungen aufraeumen -------------------
if not "%AUFHEBEN_TAGE%"=="" (
    echo Raeume Sicherungen aelter als %AUFHEBEN_TAGE% Tage auf ...
    forfiles /p "%DBZIEL%" /m meetra_*.dump /d -%AUFHEBEN_TAGE% /c "cmd /c del @path" 2>nul
    forfiles /p "%DBZIEL%" /m meetra_*.sql  /d -%AUFHEBEN_TAGE% /c "cmd /c del @path" 2>nul
)

rem ---------- Dokumente aus R2 ------------------------------
echo.
echo ==========================================================
echo  2/2  Dokumente (Cloudflare R2)
echo ==========================================================
if not "%MIT_DOKUMENTEN%"=="1" (
    echo Uebersprungen ^(MIT_DOKUMENTEN=0 in backup-config.cmd^).
    goto :fertig
)

where rclone >nul 2>nul
if errorlevel 1 (
    echo [WARNUNG] rclone wurde nicht gefunden - Dokumente uebersprungen.
    echo           Installation siehe ANLEITUNG.txt
    goto :fertig
)

set "RCLONE_CONFIG_R2_TYPE=s3"
set "RCLONE_CONFIG_R2_PROVIDER=Cloudflare"
set "RCLONE_CONFIG_R2_ACCESS_KEY_ID=%R2_KEY%"
set "RCLONE_CONFIG_R2_SECRET_ACCESS_KEY=%R2_SECRET%"
set "RCLONE_CONFIG_R2_ENDPOINT=%R2_ENDPOINT%"
set "RCLONE_CONFIG_R2_ACL=private"
set "RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true"

set "DOKZIEL=%ZIEL%\dokumente"
if not exist "%DOKZIEL%" mkdir "%DOKZIEL%" 2>nul
echo Gleiche R2-Bucket "%R2_BUCKET%" mit %DOKZIEL% ab ...
rem copy statt sync: es wird nur nachgeladen, nie lokal geloescht.
rclone copy "R2:%R2_BUCKET%" "%DOKZIEL%" --progress --transfers=8 --checkers=16
if errorlevel 1 (
    echo [WARNUNG] rclone meldete einen Fehler.
) else (
    echo Dokumente sind auf Stand.
)

:fertig
echo.
echo ==========================================================
echo  Sicherung abgeschlossen.
echo  Ordner: %ZIEL%
echo ==========================================================
echo.
choice /c JN /n /t 20 /d N /m "Zielordner oeffnen? [J/N] "
if errorlevel 2 goto :ende
start "" "%ZIEL%"

:ende
echo.
pause
endlocal
