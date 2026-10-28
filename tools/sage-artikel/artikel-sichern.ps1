# ==========================================================
# SAGE 100 — Artikel sichern / mit Sicherung vergleichen (nur lesen)
# ==========================================================
# Sichert alle Zeilen eines Artikels aus den KHK*Artikel*-Tabellen nach
# tools/sage-artikel/sicherung/<Nr>_<Zeit>.json. Mit -Vergleiche <datei.json>
# wird der aktuelle Stand gegen die Sicherung verglichen (geändert/neu/weg).
# Aendert NICHTS in Sage.
#
# Aufruf: powershell -ExecutionPolicy Bypass -File tools/sage-artikel/artikel-sichern.ps1 -Artikel 00001986
#         ... -Artikel 00001986 -Vergleiche tools/sage-artikel/sicherung/00001986_vorher_….json
# ==========================================================
param(
    [Parameter(Mandatory)][string]$Artikel,
    [string]$Vergleiche,
    [string]$Server = 'Meetra-SA',
    [string]$Datenbank = 'OLMeetra'
)
$ErrorActionPreference = 'Stop'
$dir = Join-Path $PSScriptRoot 'sicherung'
New-Item -ItemType Directory -Force $dir | Out-Null

$conn = New-Object System.Data.SqlClient.SqlConnection(
    "Server=$Server;Integrated Security=SSPI;Database=$Datenbank;Connect Timeout=10;Application Name=meetra-artikel-sichern")
$conn.Open()
function Frage($sql, $nr) {
    $cmd = $conn.CreateCommand(); $cmd.CommandText = $sql
    if ($nr) { [void]$cmd.Parameters.AddWithValue('@nr', $nr) }
    $t = New-Object System.Data.DataTable; $t.Load($cmd.ExecuteReader()); return ,$t
}

$tabellen = (Frage @"
SELECT DISTINCT c.TABLE_NAME FROM INFORMATION_SCHEMA.COLUMNS c
JOIN INFORMATION_SCHEMA.TABLES t ON t.TABLE_NAME = c.TABLE_NAME AND t.TABLE_TYPE = 'BASE TABLE'
WHERE c.TABLE_NAME LIKE 'KHK%Artikel%' AND c.COLUMN_NAME = 'Artikelnummer'
  AND c.TABLE_NAME NOT LIKE '%Archiv%' AND c.TABLE_NAME NOT LIKE '%Lagerbewegung%' AND c.TABLE_NAME NOT LIKE '%Planung%'
"@).TABLE_NAME

$stand = [ordered]@{ artikel = $Artikel; gesichert = (Get-Date -Format s) }
foreach ($t in $tabellen) {
    $r = Frage "SELECT * FROM dbo.[$t] WHERE Artikelnummer = @nr" $Artikel
    if (-not $r.Rows.Count) { continue }
    $stand[$t] = @($r.Rows | ForEach-Object {
        $row = $_; $h = [ordered]@{}
        foreach ($col in $r.Columns) {
            if ($col.ColumnName -eq 'Timestamp') { continue }
            $v = $row[$col]; $h[$col.ColumnName] = if ($v -is [DBNull]) { $null } else { "$v" }
        }
        $h
    })
}
$conn.Close()

$art = if ($Vergleiche) { 'nachher' } else { 'vorher' }
$datei = Join-Path $dir "${Artikel}_${art}_$(Get-Date -Format yyyyMMdd-HHmm).json"
$stand | ConvertTo-Json -Depth 5 | Set-Content $datei -Encoding UTF8
Write-Host "Gesichert: $datei"

if (-not $Vergleiche) { return }

# --- Vergleich: je Tabelle und Zeile jedes Feld ----------------------------
$alt = Get-Content $Vergleiche -Raw -Encoding UTF8 | ConvertFrom-Json
$neu = Get-Content $datei -Raw -Encoding UTF8 | ConvertFrom-Json
$tabs = @($alt.PSObject.Properties.Name) + @($neu.PSObject.Properties.Name) | Where-Object { $_ -like 'KHK*' } | Sort-Object -Unique
$aenderungen = 0
foreach ($t in $tabs) {
    $a = @($alt.$t); $n = @($neu.$t)
    if ($a.Count -ne $n.Count) { Write-Host "$t : Zeilen $($a.Count) -> $($n.Count)" -ForegroundColor Yellow; $aenderungen++ }
    for ($i = 0; $i -lt [Math]::Max($a.Count, $n.Count); $i++) {
        $felder = @($a[$i].PSObject.Properties.Name) + @($n[$i].PSObject.Properties.Name) | Where-Object { $_ } | Sort-Object -Unique
        foreach ($f in $felder) {
            $va = $a[$i].$f; $vn = $n[$i].$f
            if ("$va" -ne "$vn") { Write-Host ("{0}[{1}].{2}: '{3}' -> '{4}'" -f $t, $i, $f, $va, $vn); $aenderungen++ }
        }
    }
}
Write-Host "`n$aenderungen Unterschied(e)."
