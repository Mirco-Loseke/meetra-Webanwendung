$git = Get-Content "index github version.html" -Encoding UTF8
$act = Get-Content "index.html" -Encoding UTF8

$diffs = @()
$max = [Math]::Max($git.Length, $act.Length)
for ($i = 0; $i -lt $max; $i++) {
    $g = if ($i -lt $git.Length) { $git[$i] } else { $null }
    $a = if ($i -lt $act.Length) { $act[$i] } else { $null }
    if ($g -ne $a) {
        $start = [Math]::Max(0, $i - 3)
        $end = [Math]::Min($max - 1, $i + 3)
        $diffs += "--- GITHUB vs AKTUELL ab Zeile $($i+1) ---"
        for ($j = $start; $j -le $end; $j++) {
            $prefix = "  "
            if ($j -eq $i) { $prefix = "* " }
            $gVal = if ($j -lt $git.Length) { $git[$j] } else { "<EOF>" }
            $aVal = if ($j -lt $act.Length) { $act[$j] } else { "<EOF>" }
            if ($gVal -ne $aVal) {
                $diffs += "$prefix [GIT] $j : $gVal"
                $diffs += "$prefix [ACT] $j : $aVal"
            } else {
                $diffs += "$prefix [EQ]  $j : $gVal"
            }
        }
        $diffs += "--------------------------------------"
        $i = $end
    }
}
$diffs | Out-File -FilePath "precise_diff.txt" -Encoding UTF8
