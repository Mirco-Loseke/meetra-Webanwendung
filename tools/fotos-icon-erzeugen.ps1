# Erzeugt die Symbole für „meetra Fotos" (Entwurf A „Objektiv", tools/fotos-icon-entwuerfe.html)
# Aufruf: powershell -ExecutionPolicy Bypass -File tools/fotos-icon-erzeugen.ps1
Add-Type -AssemblyName System.Drawing
$root = Split-Path $PSScriptRoot -Parent
$icons = Join-Path $root 'assets\icons'
$pfeile = [System.Drawing.Image]::FromFile((Join-Path $icons 'meetra_arrows_icon.png'))

function Zeichnen([int]$groesse, [double]$inhalt, [string]$datei) {
    $bmp = New-Object System.Drawing.Bitmap $groesse, $groesse
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = 'AntiAlias'; $g.InterpolationMode = 'HighQualityBicubic'; $g.PixelOffsetMode = 'HighQuality'
    $s = $groesse / 512.0

    $rect = New-Object System.Drawing.RectangleF 0, 0, $groesse, $groesse
    $hg = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, ([System.Drawing.Color]::FromArgb(27, 36, 51)), ([System.Drawing.Color]::FromArgb(5, 7, 11)), 45
    $g.FillRectangle($hg, $rect)

    # Inhalt um die Mitte skalieren (maskable: kleiner, damit Android nichts abschneidet)
    $g.TranslateTransform($groesse / 2, $groesse / 2)
    $g.ScaleTransform($s * $inhalt, $s * $inhalt)
    $g.TranslateTransform(-256, -256)

    function Kreis($r, $farbe) { $g.FillEllipse((New-Object System.Drawing.SolidBrush $farbe), 256 - $r, 256 - $r, 2 * $r, 2 * $r) }
    function Rund([double]$x, [double]$y, [double]$w, [double]$h, [double]$r) {
        $p = New-Object System.Drawing.Drawing2D.GraphicsPath
        $p.AddArc($x, $y, 2 * $r, 2 * $r, 180, 90); $p.AddArc($x + $w - 2 * $r, $y, 2 * $r, 2 * $r, 270, 90)
        $p.AddArc($x + $w - 2 * $r, $y + $h - 2 * $r, 2 * $r, 2 * $r, 0, 90); $p.AddArc($x, $y + $h - 2 * $r, 2 * $r, 2 * $r, 90, 90)
        $p.CloseFigure(); return $p
    }
    # Kameragehäuse: Silber mit leichtem Verlauf, Aufsatz oben, Sucherfenster
    $silber = New-Object System.Drawing.Drawing2D.LinearGradientBrush (New-Object System.Drawing.RectangleF 0, 110, 512, 320), ([System.Drawing.Color]::FromArgb(246, 248, 251)), ([System.Drawing.Color]::FromArgb(196, 204, 215)), 90
    $g.FillPath($silber, (Rund 184 116 144 70 22))
    $g.FillPath($silber, (Rund 52 158 408 268 60))
    $g.FillPath((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(27, 36, 51))), (Rund 92 188 62 32 10))
    $g.FillRectangle((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(40, 15, 23, 32))), 52, 300, 408, 6)

    # Objektiv wie bisher, verkleinert auf die Gehäusemitte
    $g.TranslateTransform(256, 296); $g.ScaleTransform(0.68, 0.68); $g.TranslateTransform(-256, -256)
    Kreis 196 ([System.Drawing.Color]::FromArgb(15, 21, 32))
    Kreis 178 ([System.Drawing.Color]::FromArgb(233, 237, 242))
    Kreis 150 ([System.Drawing.Color]::FromArgb(185, 193, 204))

    $glas = New-Object System.Drawing.Drawing2D.GraphicsPath
    $glas.AddEllipse(122, 122, 268, 268)
    $pg = New-Object System.Drawing.Drawing2D.PathGradientBrush $glas
    $pg.CenterPoint = New-Object System.Drawing.PointF 220, 210
    $pg.CenterColor = [System.Drawing.Color]::FromArgb(45, 59, 82)
    $pg.SurroundColors = @([System.Drawing.Color]::FromArgb(5, 8, 13))
    $g.FillPath($pg, $glas)

    $g.DrawImage($pfeile, 168, 170, 176, 176)

    # Lichtreflex
    $st = $g.Save()
    $g.TranslateTransform(205, 190); $g.RotateTransform(-35)
    $g.FillEllipse((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(46, 255, 255, 255))), -38, -20, 76, 40)
    $g.Restore($st)


    $g.Dispose()
    $bmp.Save((Join-Path $icons $datei), [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Output "  $datei"
}

Zeichnen 512 1.0 'fotos-icon-512.png'
Zeichnen 192 1.0 'fotos-icon-192.png'
Zeichnen 180 1.0 'fotos-apple-touch-icon.png'
Zeichnen 512 0.78 'fotos-icon-maskable-512.png'
$pfeile.Dispose()
