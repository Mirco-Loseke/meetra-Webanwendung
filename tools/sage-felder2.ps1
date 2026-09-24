# ==========================================================
# SAGE 100 — Anschriften-Pflegegrad + Kontokorrent (nur lesen)
# ==========================================================
# Beantwortet: Welche Anschrift ist gepflegt? Wo steht die Kundennummer?
# Schreibt nach tools/sage-felder2.txt. Nur Anzahlen und Spaltennamen,
# keine Kundendaten. Aendert NICHTS.
#
# Aufruf: powershell -ExecutionPolicy Bypass -File tools/sage-felder2.ps1
# ==========================================================
param(
    [string]$Server = 'Meetra-SA',
    [string]$Db     = 'OLMeetra',
    [string]$Ziel   = 'tools/sage-felder2.txt'
)

$ErrorActionPreference = 'Stop'
$aus = New-Object System.Collections.Generic.List[string]
function Zeile($t) { $aus.Add($t) }

$conn = New-Object System.Data.SqlClient.SqlConnection(
    "Server=$Server;Integrated Security=SSPI;Database=$Db;Connect Timeout=10;Application Name=meetra-sage-felder2")
$conn.Open()
function Frage($sql) {
    $cmd = $conn.CreateCommand(); $cmd.CommandText = $sql; $cmd.CommandTimeout = 60
    $t = New-Object System.Data.DataTable; $t.Load($cmd.ExecuteReader()); return $t
}

Zeile "Datenbank: $Db auf $Server   ($(Get-Date -Format 'yyyy-MM-dd HH:mm'))"

# --- 1. Welche Anschrift ist wie oft gepflegt? ------------------------
Zeile "`n===== ANSCHRIFTEN-PFLEGEGRAD (von 807 Adressen) ====="
Frage @"
SELECT
  SUM(CASE WHEN LTRIM(RTRIM(ISNULL(LieferStrasse,''))) <> '' THEN 1 ELSE 0 END) AS LieferStrasse,
  SUM(CASE WHEN LTRIM(RTRIM(ISNULL(LieferOrt,'')))     <> '' THEN 1 ELSE 0 END) AS LieferOrt,
  SUM(CASE WHEN LTRIM(RTRIM(ISNULL(LieferPLZ,'')))     <> '' THEN 1 ELSE 0 END) AS LieferPLZ,
  SUM(CASE WHEN LTRIM(RTRIM(ISNULL(PostStrasse,'')))   <> '' THEN 1 ELSE 0 END) AS PostStrasse,
  SUM(CASE WHEN LTRIM(RTRIM(ISNULL(PostOrt,'')))       <> '' THEN 1 ELSE 0 END) AS PostOrt,
  SUM(CASE WHEN LTRIM(RTRIM(ISNULL(Telefon,'')))       <> '' THEN 1 ELSE 0 END) AS Telefon,
  SUM(CASE WHEN LTRIM(RTRIM(ISNULL(EMail,'')))         <> '' THEN 1 ELSE 0 END) AS EMail,
  SUM(CASE WHEN LTRIM(RTRIM(ISNULL(Matchcode,'')))     <> '' THEN 1 ELSE 0 END) AS Matchcode,
  SUM(CASE WHEN LTRIM(RTRIM(ISNULL(USER_Maschinenhersteller,'')))  <> '' THEN 1 ELSE 0 END) AS USER_Hersteller,
  SUM(CASE WHEN LTRIM(RTRIM(ISNULL(USER_Maschinenbezeichnung,''))) <> '' THEN 1 ELSE 0 END) AS USER_Bezeichnung
FROM dbo.KHKAdressen
"@ | ForEach-Object { foreach ($c in $_.Table.Columns) { Zeile ("  {0,-22} {1,5} gefuellt" -f $c.ColumnName, $_[$c.ColumnName]) } }

# --- 2. Kategorie / Aktiv --------------------------------------------
Zeile "`n===== KHKAdressen.Kategorie ====="
Frage "SELECT Kategorie, COUNT(*) AS n FROM dbo.KHKAdressen GROUP BY Kategorie ORDER BY n DESC" |
    ForEach-Object { Zeile ("  Kategorie {0,-6} {1,5}" -f $_.Kategorie, $_.n) }
Zeile "`n===== KHKAdressen.Aktiv ====="
Frage "SELECT Aktiv, COUNT(*) AS n FROM dbo.KHKAdressen GROUP BY Aktiv ORDER BY n DESC" |
    ForEach-Object { Zeile ("  Aktiv {0,-6} {1,5}" -f $_.Aktiv, $_.n) }

# --- 3. Kontokorrent: Spalten + Verknuepfung zur Adresse --------------
Zeile "`n===== SPALTEN KHKKontokorrent ====="
Frage "SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH AS len FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='KHKKontokorrent' ORDER BY ORDINAL_POSITION" |
    ForEach-Object { Zeile ("  {0,-34} {1}{2}" -f $_.COLUMN_NAME, $_.DATA_TYPE, $(if ($_.len -and $_.len -ne [DBNull]::Value) { "($($_.len))" } else { '' })) }

# --- 4. Belegkette ----------------------------------------------------
Zeile "`n===== SPALTEN KHKVKBelegeVorgaenge ====="
Frage "SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='KHKVKBelegeVorgaenge' ORDER BY ORDINAL_POSITION" |
    ForEach-Object { Zeile ("  {0,-34} {1}" -f $_.COLUMN_NAME, $_.DATA_TYPE) }

$conn.Close()
$aus -join "`r`n" | Out-File -FilePath $Ziel -Encoding utf8
Write-Host "Geschrieben nach $Ziel. Nur gelesen, nichts geaendert." -ForegroundColor Green
