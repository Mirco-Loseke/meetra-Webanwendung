# ==========================================================
# SAGE 100 — Feldliste ermitteln (nur lesen)
# ==========================================================
# Schreibt Tabellen- und Spaltennamen der fuer den Abgleich relevanten
# Sage-Tabellen nach tools/sage-felder.txt. KEINE Kundendaten, nur Struktur
# plus Anzahlen. Aendert NICHTS.
#
# Aufruf: powershell -ExecutionPolicy Bypass -File tools/sage-felder.ps1
# ==========================================================
param(
    [string]$Server = 'Meetra-SA',
    [string]$Db     = 'OLMeetra',
    [string]$Ziel   = 'tools/sage-felder.txt'
)

$ErrorActionPreference = 'Stop'
$aus = New-Object System.Collections.Generic.List[string]
function Zeile($t) { $aus.Add($t) }

$conn = New-Object System.Data.SqlClient.SqlConnection(
    "Server=$Server;Integrated Security=SSPI;Database=$Db;Connect Timeout=10;Application Name=meetra-sage-felder")
$conn.Open()

function Frage($sql) {
    $cmd = $conn.CreateCommand(); $cmd.CommandText = $sql; $cmd.CommandTimeout = 60
    $t = New-Object System.Data.DataTable; $t.Load($cmd.ExecuteReader()); return $t
}

Zeile "Datenbank: $Db auf $Server"
Zeile "Erstellt: $(Get-Date -Format 'yyyy-MM-dd HH:mm')"

# --- 1. Kandidaten-Tabellen -------------------------------------------
Zeile "`n===== TABELLEN (Adressen / Kunden / Konten / Belege) ====="
$tabellen = Frage @"
SELECT t.TABLE_NAME,
       (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS c WHERE c.TABLE_NAME = t.TABLE_NAME) AS Spalten
FROM INFORMATION_SCHEMA.TABLES t
WHERE t.TABLE_TYPE = 'BASE TABLE'
  AND (t.TABLE_NAME LIKE '%Adress%' OR t.TABLE_NAME LIKE '%Kunde%'
    OR t.TABLE_NAME LIKE '%Konto%'  OR t.TABLE_NAME LIKE '%Anschrift%'
    OR t.TABLE_NAME LIKE '%Kontakt%' OR t.TABLE_NAME LIKE '%VKBeleg%')
ORDER BY t.TABLE_NAME
"@
foreach ($r in $tabellen) {
    $n = try { (Frage "SELECT COUNT(*) AS n FROM dbo.[$($r.TABLE_NAME)]").n } catch { '?' }
    Zeile ("  {0,-40} {1,4} Spalten  {2,8} Zeilen" -f $r.TABLE_NAME, $r.Spalten, $n)
}

# --- 2. Spalten der Kern-Tabellen -------------------------------------
foreach ($k in @('KHKAdressen','KHKVKBelege','KHKVKBelegePositionen')) {
    Zeile "`n===== SPALTEN $k ====="
    Frage "SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH AS len FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='$k' ORDER BY ORDINAL_POSITION" |
        ForEach-Object { Zeile ("  {0,-38} {1}{2}" -f $_.COLUMN_NAME, $_.DATA_TYPE, $(if ($_.len -and $_.len -ne [DBNull]::Value) { "($($_.len))" } else { '' })) }
}

# --- 3. Belegart-Spalte finden und Werte zaehlen ----------------------
Zeile "`n===== BELEGARTEN in KHKVKBelege ====="
$kand = Frage @"
SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'KHKVKBelege'
  AND (COLUMN_NAME LIKE '%art%' OR COLUMN_NAME LIKE '%typ%' OR COLUMN_NAME LIKE '%kennz%')
"@
if ($kand.Rows.Count -eq 0) { Zeile "  keine passende Spalte gefunden" }
foreach ($r in $kand) {
    $s = $r.COLUMN_NAME
    Zeile "`n  -- Spalte $s --"
    try {
        Frage "SELECT TOP 25 [$s] AS wert, COUNT(*) AS n FROM dbo.KHKVKBelege GROUP BY [$s] ORDER BY COUNT(*) DESC" |
            ForEach-Object { Zeile ("     {0,-24} {1,7} Belege" -f $_.wert, $_.n) }
    } catch { Zeile "     nicht auswertbar: $($_.Exception.Message)" }
}

$conn.Close()
$aus -join "`r`n" | Out-File -FilePath $Ziel -Encoding utf8
Write-Host "Geschrieben nach $Ziel ($($aus.Count) Zeilen). Nur gelesen, nichts geaendert." -ForegroundColor Green
