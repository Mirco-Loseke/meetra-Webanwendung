# PowerShell-Fassung von build.js - fuer Rechner ohne Node.
# Aufruf:  powershell -ExecutionPolicy Bypass -File tools/build.ps1
# Setzt die Bausteine aus partials/ zwischen die Marker im index.html:
#     <!-- @partial:views/mail.html --> ... <!-- /@partial:views/mail.html -->
$root  = Split-Path -Parent $PSScriptRoot
$index = Join-Path $root 'index.html'
$html  = [IO.File]::ReadAllText($index, [Text.Encoding]::UTF8)
$count = 0; $missing = @()
$re = [regex]'(?s)([ \t]*)<!-- @partial:([^ ]+?) -->.*?<!-- /@partial:\2 -->'
$out = $re.Replace($html, {
    param($m)
    $indent = $m.Groups[1].Value; $file = $m.Groups[2].Value
    $p = Join-Path (Join-Path $root 'partials') $file
    if (-not (Test-Path $p)) { $script:missing += $file; return $m.Value }
    $body = ([IO.File]::ReadAllText($p, [Text.Encoding]::UTF8)) -replace '\s+$', ''
    $lines = $body -split "`r?`n" | ForEach-Object { if ($_.Trim()) { $indent + $_ } else { $_ } }
    $script:count++
    return "$indent<!-- @partial:$file -->`n" + ($lines -join "`n") + "`n$indent<!-- /@partial:$file -->"
})
if ($missing.Count) { Write-Error ("Diese Bausteine fehlen in partials/:`n  " + ($missing -join "`n  ")); exit 1 }
if ($out -ne $html) {
    $utf8 = New-Object Text.UTF8Encoding($false)
    [IO.File]::WriteAllText($index, $out, $utf8)
    Write-Output "$count Bausteine ins index.html eingesetzt."
} else { Write-Output "$count Bausteine geprueft - index.html ist bereits aktuell." }
