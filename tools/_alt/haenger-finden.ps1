# Findet heraus, wo die Webapp in Chrome haengt.
# 1. Chrome mit Debug-Anschluss starten (Befehl siehe Chat) - die App oeffnet sich.
# 2. Dieses Skript starten, BEVOR die App haengt (z. B. solange die Anmeldemaske da ist):
#      powershell -ExecutionPolicy Bypass -File tools\haenger-finden.ps1
# 3. In Chrome anmelden. Sobald die Seite nicht mehr antwortet, haelt das Skript
#    sie an und zeigt die Funktion, in der sie steckt.
param([int]$Port = 9222)
$ErrorActionPreference = 'Stop'

$tab = (Invoke-RestMethod "http://127.0.0.1:$Port/json") | Where-Object { $_.type -eq 'page' -and $_.url -like '*index.html*' } | Select-Object -First 1
if (-not $tab) { throw "Kein Tab mit index.html gefunden. Ist Chrome mit --remote-debugging-port=$Port gestartet?" }
$ws = New-Object Net.WebSockets.ClientWebSocket
$ws.ConnectAsync([Uri]$tab.webSocketDebuggerUrl, [Threading.CancellationToken]::None).Wait()
$puffer = New-Object byte[] 8388608
$script:id = 0
$script:offen = $null

function Senden($methode, $params) {
    $script:id++
    $json = @{ id = $script:id; method = $methode; params = $(if ($params) { $params } else { @{} }) } | ConvertTo-Json -Compress -Depth 5
    $b = [Text.Encoding]::UTF8.GetBytes($json)
    $ws.SendAsync([ArraySegment[byte]]$b, 'Text', $true, [Threading.CancellationToken]::None).Wait()
    return $script:id
}
# Eine Nachricht lesen; $null bei Zeitueberschreitung (die Leseaufgabe bleibt dann offen).
function Lesen($ms) {
    $sb = New-Object Text.StringBuilder
    while ($true) {
        if (-not $script:offen) { $script:offen = $ws.ReceiveAsync([ArraySegment[byte]]$puffer, [Threading.CancellationToken]::None) }
        if (-not $script:offen.Wait($ms)) { return $null }
        $r = $script:offen.Result; $script:offen = $null
        [void]$sb.Append([Text.Encoding]::UTF8.GetString($puffer, 0, $r.Count))
        if ($r.EndOfMessage) { return ($sb.ToString() | ConvertFrom-Json) }
    }
}
# Auf Antwort mit dieser id warten (andere Nachrichten ueberspringen).
function Warten($wartId, $ms) {
    $ende = (Get-Date).AddMilliseconds($ms)
    while ((Get-Date) -lt $ende) {
        $m = Lesen ([int][Math]::Max(1, ($ende - (Get-Date)).TotalMilliseconds))
        if (-not $m) { return $null }
        if ($m.id -eq $wartId -or $m.method -eq 'Debugger.paused') { return $m }
    }
    return $null
}

[void](Warten (Senden 'Debugger.enable') 10000)
Write-Host "Verbunden mit: $($tab.url)" -ForegroundColor Green
Write-Host "Jetzt in Chrome anmelden bzw. die App benutzen. Ich pruefe alle 2 Sekunden ..." -ForegroundColor Cyan

while ($true) {
    $antwort = Warten (Senden 'Runtime.evaluate' @{ expression = '1' }) 4000
    if ($antwort) { Start-Sleep -Seconds 2; continue }

    Write-Host "`nSeite antwortet nicht mehr - halte sie an ..." -ForegroundColor Yellow
    [void](Senden 'Debugger.pause')
    $ende = (Get-Date).AddSeconds(20); $p = $null
    while (-not $p -and (Get-Date) -lt $ende) { $m = Lesen 20000; if ($m -and $m.method -eq 'Debugger.paused') { $p = $m } elseif (-not $m) { break } }
    if (-not $p) { Write-Host 'Liess sich nicht anhalten.' -ForegroundColor Red; break }

    Write-Host "`nHier steckt die Seite (oberste Zeile = aktuelle Stelle):`n" -ForegroundColor Green
    foreach ($f in $p.params.callFrames) {
        $datei = (($f.url -split '/')[-1] -split '\?')[0]
        "  {0,-45} {1}:{2}" -f $(if ($f.functionName) { $f.functionName } else { '(anonym)' }), $datei, ($f.location.lineNumber + 1)
    }
    break
}
$ws.Dispose()
