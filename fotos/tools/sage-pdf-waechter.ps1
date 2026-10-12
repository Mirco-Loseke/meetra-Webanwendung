# ==========================================================
# ORDNER-WAECHTER fuer Angebots-PDFs (laeuft dauerhaft auf dem Server)
# ==========================================================
# Sobald im Angebots-Ordner ($AngebotePdfOrdner aus sage-sync.config.ps1) eine
# PDF ankommt, wird sofort abgeglichen - nicht erst beim naechsten 30-min-Lauf:
#   1. Angebote aus Sage (falls das Angebot gerade erst geschrieben wurde)
#   2. PDFs zuordnen und hochladen
# Mehrere Dateien kurz hintereinander = ein Durchlauf (10 s Sammelzeit).
# Start: geplante Aufgabe "meetra PDF-Waechter" (beim Systemstart), siehe
# sage-sync-server-einrichten.ps1 -MitWaechter.
# ==========================================================
$ErrorActionPreference = 'Stop'
$Basis = Split-Path -Parent $MyInvocation.MyCommand.Path
$Log   = Join-Path $Basis 'sage-sync.log'
function Sag($t) { "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  [Waechter] $t" | Out-File $Log -Append -Encoding utf8 }

. (Join-Path $Basis 'sage-sync.config.ps1')
if (-not $AngebotePdfOrdner) { Sag 'Kein $AngebotePdfOrdner in der Config - Waechter beendet.'; exit 1 }

# Ordner evtl. beim Systemstart noch nicht erreichbar (Freigabe) - warten.
for ($i = 0; -not (Test-Path -LiteralPath $AngebotePdfOrdner); $i++) {
    if ($i -eq 0) { Sag "Warte auf Ordner $AngebotePdfOrdner ..." }
    Start-Sleep -Seconds 30
}

$w = New-Object IO.FileSystemWatcher $AngebotePdfOrdner, '*.pdf'
$w.IncludeSubdirectories = $false        # "zugeordnet" nicht beobachten
$w.NotifyFilter = [IO.NotifyFilters]'FileName, LastWrite, Size'
$w.EnableRaisingEvents = $true
Register-ObjectEvent $w Created -SourceIdentifier pdfNeu | Out-Null
Register-ObjectEvent $w Renamed -SourceIdentifier pdfUmbenannt | Out-Null
Sag "Beobachte $AngebotePdfOrdner"

$skript = Join-Path $Basis 'sage-sync.ps1'
while ($true) {
    $e = Wait-Event -Timeout 3600
    if (-not $e) { continue }
    # Sammelzeit: Sage/Explorer schreiben die Datei evtl. noch; weitere Dateien mitnehmen.
    Start-Sleep -Seconds 10
    Get-Event | Remove-Event
    Sag 'Neue PDF erkannt - gleiche ab'
    # Reihenfolge je Durchgang: erst Angebot aus Sage eintragen, dann PDF anhaengen
    # (legt fehlenden Vorgang selbst an). Liegt danach noch eine PDF im Ordner -
    # z. B. weil Sage die PDF schneller schreibt als den Beleg -, bis zu 3x nach 60 s erneut.
    for ($versuch = 1; $versuch -le 4; $versuch++) {
        try {
            & powershell -NoProfile -ExecutionPolicy Bypass -File $skript -Nur angebote -Schreiben | Out-Null
            & powershell -NoProfile -ExecutionPolicy Bypass -File $skript -Nur pdf -Schreiben | Out-Null
        } catch { Sag "Fehler: $($_.Exception.Message)" }
        $rest = @(Get-ChildItem -LiteralPath $AngebotePdfOrdner -File -Filter *.pdf -ErrorAction SilentlyContinue)
        if ($rest.Count -eq 0 -or $versuch -eq 4) { break }
        Sag ("{0} PDF noch nicht zugeordnet - neuer Versuch in 60 s ({1}/3)" -f $rest.Count, $versuch)
        Start-Sleep -Seconds 60
        Get-Event | Remove-Event
    }
}
