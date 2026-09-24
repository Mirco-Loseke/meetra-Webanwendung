# ==========================================================
# SAGE 100 — Zugriffstest (nur lesen)
# ==========================================================
# Prueft, ob von diesem Rechner aus die Sage-Datenbank gelesen werden kann,
# und zeigt, welche Tabellen/Spalten fuer einen spaeteren Abgleich in Frage
# kommen. Aendert NICHTS. Keine Installation noetig (.NET SqlClient).
#
# Aufruf:  powershell -ExecutionPolicy Bypass -File tools/sage-check.ps1
#          powershell -ExecutionPolicy Bypass -File tools/sage-check.ps1 -Server Meetra-SA
# ==========================================================
param(
    [string]$Server = 'Meetra-SA',
    [switch]$Spalten          # zusaetzlich alle Spalten der Kern-Tabellen ausgeben
)

$ErrorActionPreference = 'Stop'

function Frage($conn, $sql) {
    $cmd = $conn.CreateCommand()
    $cmd.CommandText = $sql
    $cmd.CommandTimeout = 30
    $tab = New-Object System.Data.DataTable
    $tab.Load($cmd.ExecuteReader())
    return $tab
}

function Verbinde($db) {
    $c = New-Object System.Data.SqlClient.SqlConnection(
        "Server=$Server;Integrated Security=SSPI;Database=$db;Connect Timeout=10;Application Name=meetra-sage-check")
    $c.Open()
    return $c
}

Write-Host "Server: $Server" -ForegroundColor Cyan
Write-Host "Angemeldet als: $env:USERDOMAIN\$env:USERNAME" -ForegroundColor Cyan

# --- 1. Erreichbarkeit -------------------------------------------------
$netz = Test-NetConnection -ComputerName $Server -Port 1433 -WarningAction SilentlyContinue
if (-not $netz.TcpTestSucceeded) {
    Write-Host "Port 1433 nicht erreichbar. Benannte Instanz? Dann -Server 'Meetra-SA\SAGE' probieren." -ForegroundColor Red
    exit 1
}
Write-Host "Port 1433 erreichbar ($($netz.RemoteAddress))" -ForegroundColor Green

# --- 2. Anmeldung + Datenbanken ---------------------------------------
try { $conn = Verbinde 'master' }
catch {
    Write-Host "Anmeldung abgelehnt: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "=> Der Windows-Benutzer hat keinen SQL-Zugang. Sage-Partner/Admin muss einen LESENDEN Benutzer anlegen." -ForegroundColor Yellow
    exit 1
}
Write-Host "Anmeldung am SQL Server erfolgreich" -ForegroundColor Green

$dbs = Frage $conn "SELECT name FROM sys.databases WHERE database_id > 4 ORDER BY name"
Write-Host "`nDatenbanken:" -ForegroundColor Cyan
$dbs | ForEach-Object { "  - $($_.name)" }
$conn.Close()

# --- 3. Mandanten-Datenbanken finden (die mit KHK-Tabellen) ------------
$kern = @('KHKAdressen','KHKAnschriften','KHKKunden','KHKVKBelege','KHKVKBelegePositionen')
foreach ($d in $dbs.name) {
    try { $c = Verbinde $d } catch { continue }
    try {
        $t = Frage $c "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME LIKE 'KHK%' ORDER BY TABLE_NAME"
        if ($t.Rows.Count -eq 0) { $c.Close(); continue }

        Write-Host "`n=== $d  ($($t.Rows.Count) KHK-Tabellen) ===" -ForegroundColor Green
        foreach ($k in $kern) {
            if ($t.TABLE_NAME -notcontains $k) { Write-Host "  $k : nicht vorhanden" -ForegroundColor DarkGray; continue }
            $n = (Frage $c "SELECT COUNT(*) AS n FROM dbo.[$k]").n
            Write-Host ("  {0,-24} {1,8} Zeilen" -f $k, $n)
            if ($Spalten) {
                $s = Frage $c "SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '$k' ORDER BY ORDINAL_POSITION"
                ($s | ForEach-Object { "$($_.COLUMN_NAME) ($($_.DATA_TYPE))" }) -join ', ' | ForEach-Object { Write-Host "      $_" -ForegroundColor DarkGray }
            }
        }
        # Belegarten: welche Nummer steht fuer Angebot?
        if ($t.TABLE_NAME -contains 'KHKVKBelege') {
            $sp = Frage $c "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='KHKVKBelege' AND COLUMN_NAME IN ('Belegart','BelegTyp','Belegtyp')"
            if ($sp.Rows.Count -gt 0) {
                $spalte = $sp.Rows[0].COLUMN_NAME
                Write-Host "  Belegarten in KHKVKBelege.$spalte :" -ForegroundColor Cyan
                Frage $c "SELECT [$spalte] AS art, COUNT(*) AS n FROM dbo.KHKVKBelege GROUP BY [$spalte] ORDER BY n DESC" |
                    ForEach-Object { Write-Host ("    Art {0,-6} {1,8} Belege" -f $_.art, $_.n) }
            }
        }
    } catch {
        Write-Host "  $d : $($_.Exception.Message)" -ForegroundColor DarkYellow
    } finally { $c.Close() }
}

Write-Host "`nFertig. Es wurde ausschliesslich gelesen." -ForegroundColor Cyan
