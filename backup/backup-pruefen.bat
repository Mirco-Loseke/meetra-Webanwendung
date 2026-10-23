@echo off
title meetra Datensicherung - Vollstaendigkeit pruefen
rem Vergleicht R2 mit dem Ordner "dokumente" der Sicherung. Aendert nichts, nur Lesen.
pushd "%~dp0"
call "%~dp0backup-config.cmd"
if exist "C:\rclone-v1.75.2-windows-amd64\rclone.exe" set "PATH=%PATH%;C:\rclone-v1.75.2-windows-amd64"
set "RCLONE_CONFIG_R2_TYPE=s3"
set "RCLONE_CONFIG_R2_PROVIDER=Cloudflare"
set "RCLONE_CONFIG_R2_ACCESS_KEY_ID=%R2_KEY%"
set "RCLONE_CONFIG_R2_SECRET_ACCESS_KEY=%R2_SECRET%"
set "RCLONE_CONFIG_R2_ENDPOINT=%R2_ENDPOINT%"
set "RCLONE_CONFIG_R2_ACL=private"
set "RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true"
echo Groesse in R2:
rclone size "R2:%R2_BUCKET%"
echo.
echo Groesse der Sicherung:
rclone size "%ZIEL%\dokumente"
echo.
echo Fehlt etwas in der Sicherung? (--one-way: nur was in R2 ist und auf dem Laufwerk fehlt)
rclone check "R2:%R2_BUCKET%" "%ZIEL%\dokumente" --one-way --size-only --local-case-sensitive
echo.
echo ACHTUNG: "0 differences" allein beweist nichts. Massgeblich ist: "Total objects" in R2 = "Total objects" der Sicherung.
echo Meldungen "Duplicate ... found in source - ignoring" bedeuten: diese Dateien FEHLEN auf dem Laufwerk.
pause
