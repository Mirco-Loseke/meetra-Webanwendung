@echo off
rem ==========================================================
rem  Einstellungen fuer backup.bat  —  hier alles eintragen.
rem  Diese Datei enthaelt Zugangsdaten. Nicht weitergeben.
rem ==========================================================

rem --- 1) Supabase-Datenbank -------------------------------
rem Verbindungszeichenfolge aus Supabase:
rem   Dashboard -> oben "Connect" -> Reiter "Session pooler"
rem   -> die URI kopieren und [YOUR-PASSWORD] durch das
rem      Datenbank-Passwort ersetzen.
rem Sieht so aus:
rem   postgresql://postgres.rtnpyziwyaqrlfazxkyr:PASSWORT@aws-0-eu-central-1.pooler.supabase.com:5432/postgres
rem
rem ACHTUNG: Enthaelt das Passwort ein Prozentzeichen, muss es
rem hier doppelt stehen (%% statt %). Sonderzeichen wie @ : / ?
rem im Passwort muessen prozentkodiert werden (@ = %%40).
set "DB_URL="

rem --- 2) Wohin die Sicherung geschrieben wird --------------
rem Voreinstellung: Ordner "meetra-Backups" neben OneDrive.
set "ZIEL=%USERPROFILE%\meetra-Backups"

rem --- 3) Wie lange alte Sicherungen liegen bleiben (Tage) --
set "AUFHEBEN_TAGE=90"

rem --- 4) Dokumente aus Cloudflare R2 mitsichern? -----------
rem 1 = ja (braucht rclone), 0 = nur Datenbank
set "MIT_DOKUMENTEN=0"

set "R2_BUCKET=dateien"
set "R2_ENDPOINT=https://855feaccf4d0215922275100e91c4656.r2.cloudflarestorage.com"
set "R2_KEY=49a3cbad28594d9d5a90e46f3965133b"
set "R2_SECRET=0642e23714ce5c9f805d0c2f8f59e7c9df01ba8ba7a728b9640b0db5341de797"
