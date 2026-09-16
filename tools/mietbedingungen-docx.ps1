# Erzeugt die zwei Rechtsseiten der Mietvereinbarung als Word-Dokument.
# Quelle: der Standard-Vertragstext in js/mietvereinbarung-vorlagen.js
# (Block `texte:`). Aufruf:
#   powershell -ExecutionPolicy Bypass -File tools\mietbedingungen-docx.ps1
# Ergebnis: Mietbedingungen.docx neben dieser Datei. Braucht nur PowerShell 5.1
# (kein node, kein Word) — das .docx wird direkt als ZIP mit WordprocessingML gebaut.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$src  = Join-Path $root 'js\mietvereinbarung-vorlagen.js'
$out  = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) 'Mietbedingungen.docx'

$lines = [System.IO.File]::ReadAllLines($src, [System.Text.Encoding]::UTF8)
$start = -1; $end = -1
for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($start -lt 0 -and $lines[$i] -match '^\s{8}texte: \{') { $start = $i; continue }
    if ($start -ge 0 -and $lines[$i] -match '^\s{8}\},?\s*$') { $end = $i; break }
}
if ($start -lt 0 -or $end -lt 0) { throw 'Block texte: nicht gefunden.' }

function Esc([string]$s) { $s.Replace('&','&amp;').Replace('<','&lt;').Replace('>','&gt;') }
function P([string]$text, [string]$style, [bool]$bold, [int]$after, [int]$indent, [bool]$keep) {
    $ppr = ''
    if ($style) { $ppr += "<w:pStyle w:val=`"$style`"/>" }
    if ($keep)  { $ppr += '<w:keepNext/>' }
    if ($after -ge 0) { $ppr += "<w:spacing w:after=`"$after`"/>" }
    if ($indent -gt 0) { $ppr += "<w:ind w:left=`"$indent`"/>" }
    $rpr = ''; if ($bold) { $rpr = '<w:rPr><w:b/></w:rPr>' }
    "<w:p><w:pPr>$ppr</w:pPr><w:r>$rpr<w:t xml:space=`"preserve`">$(Esc $text)</w:t></w:r></w:p>"
}

$body = [System.Text.StringBuilder]::new()
$titelGesehen = $false
for ($i = $start; $i -le $end; $i++) {
    $l = $lines[$i].Trim()
    if ($l -match "^titel: '(.*)',?$") {
        $t = $Matches[1]
        if (-not $titelGesehen) { $titelGesehen = $true; [void]$body.Append((P $t 'Title' $false -1 0 $false)); continue }
        # Zweite Rechtsseite beginnt mit „Geltungsbereich …" — neue Seite + Überschrift
        if ($t -like 'Geltungsbereich*') {
            [void]$body.Append('<w:p><w:r><w:br w:type="page"/></w:r></w:p>')
            [void]$body.Append((P 'Ergänzende Vereinbarungen' 'Title' $false -1 0 $false))
        }
        [void]$body.Append((P $t 'Heading2' $false -1 0 $true)); continue
    }
    if ($l -match "^'(.*)',?$") {
        $t = $Matches[1]
        if ($t -match '^[a-z]\)\s' -and $t.Length -lt 60) { [void]$body.Append((P $t '' $true 40 0 $true)); continue }
        if ($t -match '^-\s') { [void]$body.Append((P ('– ' + $t.Substring(1).TrimStart()) '' $false 60 360 $false)); continue }
        [void]$body.Append((P $t '' $false 120 0 $false))
    }
}

$document = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
'<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' + $body.ToString() +
'<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>'

$styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
'<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
'<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="19"/><w:lang w:val="de-DE"/></w:rPr></w:rPrDefault>' +
'<w:pPrDefault><w:pPr><w:spacing w:after="100" w:line="264" w:lineRule="auto"/><w:jc w:val="both"/></w:pPr></w:pPrDefault></w:docDefaults>' +
'<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>' +
'<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:jc w:val="left"/><w:spacing w:before="0" w:after="240"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style>' +
'<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:jc w:val="left"/><w:spacing w:before="200" w:after="80"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="22"/></w:rPr></w:style>' +
'</w:styles>'

$contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
'<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
'<Default Extension="xml" ContentType="application/xml"/>' +
'<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
'<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
'</Types>'

$rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
'</Relationships>'

$docRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
'</Relationships>'

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
if (Test-Path $out) { Remove-Item $out -Force }
$zip = [System.IO.Compression.ZipFile]::Open($out, [System.IO.Compression.ZipArchiveMode]::Create)
$utf8 = [System.Text.UTF8Encoding]::new($false)
function Put($zip, [string]$name, [string]$content) {
    $e = $zip.CreateEntry($name, [System.IO.Compression.CompressionLevel]::Optimal)
    $s = $e.Open(); $b = $utf8.GetBytes($content); $s.Write($b, 0, $b.Length); $s.Close()
}
Put $zip '[Content_Types].xml' $contentTypes
Put $zip '_rels/.rels' $rels
Put $zip 'word/document.xml' $document
Put $zip 'word/styles.xml' $styles
Put $zip 'word/_rels/document.xml.rels' $docRels
$zip.Dispose()
Write-Output "Geschrieben: $out"
