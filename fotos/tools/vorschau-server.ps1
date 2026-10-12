# ==========================================================
#  Kleiner Webserver fuer die Vorschau — ohne node, ohne npx
# ==========================================================
#  Auf diesem Rechner gibt es weder node/npx noch python; die
#  Konfiguration "static" in .claude/launch.json laeuft deshalb nicht.
#  Dieses Skript stellt den Projektordner mit Bordmitteln bereit
#  (System.Net.HttpListener), damit die App im Browser statt ueber
#  file:// laeuft — nur so lassen sich Anmeldung, Supabase und die
#  Edge Functions ueberhaupt testen.
#
#  Start:   powershell -ExecutionPolicy Bypass -File tools\vorschau-server.ps1
#  Stoppen: Fenster schliessen oder Strg+C
# ==========================================================
param(
    [int]$Port = 5187
)

$wurzel = Split-Path -Parent $PSScriptRoot
$praefix = "http://localhost:$Port/"

$typen = @{
    '.html' = 'text/html; charset=utf-8'
    '.js'   = 'application/javascript; charset=utf-8'
    '.css'  = 'text/css; charset=utf-8'
    '.json' = 'application/json; charset=utf-8'
    '.svg'  = 'image/svg+xml'
    '.png'  = 'image/png'
    '.jpg'  = 'image/jpeg'
    '.jpeg' = 'image/jpeg'
    '.webp' = 'image/webp'
    '.ico'  = 'image/x-icon'
    '.woff' = 'font/woff'
    '.woff2' = 'font/woff2'
    '.ttf'  = 'font/ttf'
    '.pdf'  = 'application/pdf'
    '.txt'  = 'text/plain; charset=utf-8'
    '.map'  = 'application/json; charset=utf-8'
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($praefix)
try {
    $listener.Start()
} catch {
    Write-Host "Port $Port ist belegt oder gesperrt: $($_.Exception.Message)"
    exit 1
}
Write-Host "Vorschau laeuft auf $praefix  (Wurzel: $wurzel)"

while ($listener.IsListening) {
    try {
        $ctx = $listener.GetContext()
    } catch {
        break
    }
    $pfad = [System.Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath)
    if ($pfad -eq '/' ) { $pfad = '/index.html' }
    $datei = Join-Path $wurzel ($pfad.TrimStart('/') -replace '/', '\')

    try {
        if (Test-Path -LiteralPath $datei -PathType Leaf) {
            $endung = [System.IO.Path]::GetExtension($datei).ToLower()
            $typ = $typen[$endung]
            if (-not $typ) { $typ = 'application/octet-stream' }
            $bytes = [System.IO.File]::ReadAllBytes($datei)
            $ctx.Response.ContentType = $typ
            # Kein Zwischenspeichern: sonst sieht man die eigenen Aenderungen nicht.
            $ctx.Response.Headers.Add('Cache-Control', 'no-store')
            $ctx.Response.ContentLength64 = $bytes.Length
            $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $ctx.Response.StatusCode = 404
            $fehler = [System.Text.Encoding]::UTF8.GetBytes("404 - $pfad")
            $ctx.Response.OutputStream.Write($fehler, 0, $fehler.Length)
        }
    } catch {
        $ctx.Response.StatusCode = 500
    } finally {
        $ctx.Response.OutputStream.Close()
    }
}
