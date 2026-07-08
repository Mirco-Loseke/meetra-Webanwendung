// ==========================================
// LISTEN MODULE
// ==========================================
// "Listen"-Übersicht mit mehreren Unterlisten (Tabs). Aktuell: Angebote (CSV/Excel-Import aus
// Sage 100, analog zum Adressimport in customers.js) und Maschinen (folgt später).

(function () {
    'use strict';

    // Global state for Angebote import
    let angeboteHeaders = [];
    let angeboteRows = [];
    let angeboteList = [];
    let editingAngebotMachineId = null;
    let editingAngebotMachineMode = 'search'; // 'search' (Dropdown) oder 'freitext' (reines Textfeld)
    let pendingFreitextValue = '';

    // Vollständiges deutsches Währungsformat: 1.234.567 € — keine Abkürzungen
    function fmtEurFull(v) {
        return Math.round(v).toLocaleString('de-DE') + ' €';
    }

    document.addEventListener('DOMContentLoaded', () => {
        setupAngeboteImportListeners();
    });

    // Schliesst die Maschinen-Such-Dropdown/-Eingabe, wenn irgendwo ausserhalb geklickt wird.
    document.addEventListener('click', (e) => {
        if (editingAngebotMachineId !== null &&
            !e.target.closest('.angebot-machine-search') &&
            !e.target.closest('#angebot-machine-dropdown-portal') &&
            !e.target.closest('.angebot-machine-edit-btn')) {
            editingAngebotMachineId = null;
            const dropdown = document.getElementById('angebot-machine-dropdown-portal');
            if (dropdown) dropdown.style.display = 'none';
            window.renderAngeboteList();
        }
    });

    // ==========================================
    // TAB NAVIGATION
    // ==========================================
    window.switchListenTab = function (tab) {
        const isAngebote = tab === 'angebote';
        document.getElementById('listen-tab-content-angebote').classList.toggle('hidden', !isAngebote);
        document.getElementById('listen-tab-content-maschinen').classList.toggle('hidden', isAngebote);
        document.getElementById('listen-tab-btn-angebote').classList.toggle('active', isAngebote);
        document.getElementById('listen-tab-btn-maschinen').classList.toggle('active', !isAngebote);
    };

    // ==========================================
    // ANGEBOTE: LISTE LADEN & ANZEIGEN
    // ==========================================
    window.fetchAngebote = async function () {
        const container = document.getElementById('angebote-list-container');
        if (!window.supabaseClient) return;

        const { data, error } = await window.supabaseClient
            .from('angebote')
            .select('*, customers(name), angebot_notizen(id, content, created_at)')
            .order('belegdatum', { ascending: false });

        if (error) {
            console.error('Error fetching Angebote:', error);
            if (container) container.innerHTML = `<div style="text-align:center; color:rgba(255,200,200,0.8); padding:2rem;">Fehler beim Laden: ${error.message}</div>`;
            return;
        }

        angeboteList = data || [];
        populateAngeboteFilterOptions();
        window.renderAngeboteList();
        window.renderAngebotReminderBadge();
    };

    // Liefert für eine Angebot-Zeile die anzuzeigende Maschinen-Bezeichnung — egal ob echte
    // Maschine oder selbsterstellte Freitext-Bezeichnung, damit Filter/Anzeige beides gleich behandeln.
    function getAngebotMachineLabel(a) {
        if (a.machine_id) {
            return (typeof window.getMachineName === 'function') ? window.getMachineName(a.machine_id) : null;
        }
        return a.machine_label || null;
    }

    // Ordnet einen Angebots-Status grob als gewonnen/verloren/offen ein — rein über den Namen
    // der Status-Kategorie (die Namen werden unter Einstellungen -> Kategorien frei gepflegt,
    // deshalb hier eine Wortliste statt fester IDs).
    function classifyAngebotStatus(a) {
        const s = (a.status || '').toLowerCase();
        // WICHTIG: "lost" zuerst prüfen, damit "Auftrag verloren" nicht fälschlich als 'won' gilt
        if (/verloren|abgelehnt|absage|abgesagt|storniert|kein interesse/.test(s)) return 'lost';
        if (/gewonnen|auftrag|bestellt|verkauft|angenommen|zusage/.test(s)) return 'won';
        return 'open';
    }

    // Jüngste Aktivität eines Angebots: Belegdatum oder die neueste Notiz — Basis für den
    // "Nachfassen"-Block (Angebote, bei denen lange nichts passiert ist).
    function getAngebotLastActivityDate(a) {
        let latest = a.belegdatum ? new Date(a.belegdatum + 'T00:00:00') : null;
        (a.angebot_notizen || []).forEach(n => {
            const d = new Date(n.created_at);
            if (!latest || d > latest) latest = d;
        });
        return latest;
    }

    function getAngebotStilleDays(a) {
        const last = getAngebotLastActivityDate(a);
        if (!last) return null;
        return Math.round((new Date() - last) / 86400000);
    }

    // Setzt den Status-Filter (Dropdown oben) programmatisch, z.B. per Klick auf einen
    // Pipeline-Balken. dispatchEvent aktualisiert auch das Glass-Dropdown-Label.
    window.setAngeboteStatusFilter = function (name) {
        const sel = document.getElementById('angebote-filter-status');
        if (!sel) return;
        sel.value = (sel.value === name) ? '' : name;
        sel.dispatchEvent(new Event('change'));
    };

    // Liefert die Angebote nach Anwendung aller aktiven Filter (Jahr/Status/Maschine/Suche) —
    // gemeinsame Basis für Liste, Dashboard und CSV-Export.
    function getFilteredAngebote() {
        const searchInput = document.getElementById('angebote-search-input');
        const term = searchInput ? searchInput.value.trim().toLowerCase() : '';
        const jahrFilter = document.getElementById('angebote-filter-jahr')?.value || '';
        const statusFilter = document.getElementById('angebote-filter-status')?.value || '';
        const machineFilter = document.getElementById('angebote-filter-maschine')?.value || '';

        let entries = angeboteList;

        if (jahrFilter) {
            entries = entries.filter(a => a.belegdatum && String(new Date(a.belegdatum).getFullYear()) === jahrFilter);
        }
        if (statusFilter) {
            entries = entries.filter(a => a.status === statusFilter);
        }
        if (machineFilter) {
            entries = entries.filter(a => getAngebotMachineLabel(a) === machineFilter);
        }

        if (term) {
            entries = entries.filter(a => {
                const firma = a.customers?.name || a.kundenmatchcode || '';
                const notizTreffer = (a.angebot_notizen || []).some(n => (n.content || '').toLowerCase().includes(term));
                return (a.belegnummer || '').toLowerCase().includes(term) ||
                    firma.toLowerCase().includes(term) ||
                    (a.bemerkung || '').toLowerCase().includes(term) ||
                    (a.status || '').toLowerCase().includes(term) ||
                    notizTreffer;
            });
        }

        return entries;
    }

    // ==========================================
    // EXCEL-EXPORT (.xlsx mit Formatierung + Diagrammen)
    // ==========================================
    // ExcelJS (~1 MB) wird erst beim ersten Export nachgeladen, damit der App-Start schnell bleibt.
    function loadExcelJs() {
        return new Promise((resolve, reject) => {
            if (window.ExcelJS) return resolve();
            const s = document.createElement('script');
            s.src = 'lib/exceljs.min.js';
            s.onload = () => resolve();
            s.onerror = () => reject(new Error('lib/exceljs.min.js konnte nicht geladen werden'));
            document.head.appendChild(s);
        });
    }

    function parseNumDe(v) {
        if (v === null || v === undefined || v === '') return null;
        const n = parseFloat(String(v).replace(',', '.'));
        return isNaN(n) ? null : n;
    }

    // Excel kann aus dem Browser keine "echten" nativen Diagramme bekommen — deshalb werden die
    // Grafen hier auf ein Canvas gezeichnet und als PNG-Bild ins Dashboard-Blatt eingebettet.
    function drawMonthlyChartPng(buckets) {
        const W = 900, H = 420, padL = 70, padR = 20, padT = 60, padB = 60;
        const c = document.createElement('canvas'); c.width = W; c.height = H;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#111827'; ctx.font = 'bold 20px Arial';
        ctx.fillText('Angebotsvolumen pro Monat (VK)', padL, 32);
        const max = Math.max(...buckets.map(b => b.sum), 1);
        const innerW = W - padL - padR, innerH = H - padT - padB;
        const barW = Math.min(48, innerW / buckets.length * 0.6);
        ctx.strokeStyle = '#d1d5db'; ctx.beginPath();
        ctx.moveTo(padL, H - padB); ctx.lineTo(W - padR, H - padB); ctx.stroke();
        buckets.forEach((b, i) => {
            const cx = padL + innerW / buckets.length * (i + 0.5);
            const h = Math.round(b.sum / max * innerH);
            ctx.fillStyle = '#3b82f6';
            ctx.fillRect(cx - barW / 2, H - padB - h, barW, h);
            ctx.fillStyle = '#374151'; ctx.font = '13px Arial'; ctx.textAlign = 'center';
            ctx.fillText(b.label, cx, H - padB + 20);
            if (b.sum > 0) {
                ctx.font = 'bold 12px Arial';
                ctx.fillText(b.sum >= 1000 ? Math.round(b.sum / 1000).toLocaleString('de-DE') + ' T€' : Math.round(b.sum) + ' €', cx, H - padB - h - 8);
            }
        });
        ctx.textAlign = 'left';
        return c.toDataURL('image/png');
    }

    function drawPipelineChartPng(pipeline) {
        const rowH = 44, padL = 230, padR = 110, padT = 60;
        const W = 900, H = padT + pipeline.length * rowH + 20;
        const c = document.createElement('canvas'); c.width = W; c.height = H;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#111827'; ctx.font = 'bold 20px Arial';
        ctx.fillText('Pipeline nach Status (Summe VK)', 20, 32);
        const max = Math.max(...pipeline.map(g => g.sum), 1);
        const innerW = W - padL - padR;
        pipeline.forEach((g, i) => {
            const y = padT + i * rowH;
            ctx.fillStyle = '#374151'; ctx.font = '14px Arial'; ctx.textAlign = 'left';
            let label = `${g.name} (${g.count})`;
            if (label.length > 26) label = label.slice(0, 25) + '…';
            ctx.fillText(label, 20, y + rowH / 2 + 5);
            ctx.fillStyle = '#e5e7eb';
            ctx.fillRect(padL, y + 10, innerW, rowH - 20);
            ctx.fillStyle = g.color || '#94a3b8';
            ctx.fillRect(padL, y + 10, Math.max(3, Math.round(g.sum / max * innerW)), rowH - 20);
            ctx.fillStyle = '#111827'; ctx.font = 'bold 13px Arial';
            ctx.fillText(g.sum >= 1000 ? Math.round(g.sum / 1000).toLocaleString('de-DE') + ' T€' : Math.round(g.sum) + ' €', padL + innerW + 10, y + rowH / 2 + 5);
        });
        return c.toDataURL('image/png');
    }

    window.exportAngeboteXlsx = async function () {
        try {
            await loadExcelJs();
        } catch (err) {
            alert('Excel-Bibliothek konnte nicht geladen werden: ' + err.message);
            return;
        }
        const entries = getFilteredAngebote();
        if (entries.length === 0) {
            alert('Keine Angebote in der aktuellen Ansicht.');
            return;
        }

        const wb = new ExcelJS.Workbook();
        wb.creator = 'meetra Webapp';
        wb.created = new Date();

        const GREEN = 'FF15803D';
        const BORDER_COLOR = 'FFB0B7C3';
        const thinBorder = {
            top: { style: 'thin', color: { argb: BORDER_COLOR } },
            left: { style: 'thin', color: { argb: BORDER_COLOR } },
            bottom: { style: 'thin', color: { argb: BORDER_COLOR } },
            right: { style: 'thin', color: { argb: BORDER_COLOR } }
        };

        // ---- Blatt 1: Angebote (formatierte Tabelle) ----
        const ws = wb.addWorksheet('Angebote', { views: [{ state: 'frozen', ySplit: 1 }] });
        ws.columns = [
            { header: 'Belegdatum', key: 'datum', width: 13 },
            { header: 'Belegnummer', key: 'nr', width: 16 },
            { header: 'Firma', key: 'firma', width: 34 },
            { header: 'VK (€)', key: 'vk', width: 14 },
            { header: 'EK (€)', key: 'ek', width: 14 },
            { header: 'Spanne (€)', key: 'spanne', width: 14 },
            { header: 'Spanne (%)', key: 'spannePct', width: 12 },
            { header: 'Realisierbar (%)', key: 'real', width: 15 },
            { header: 'Status', key: 'status', width: 20 },
            { header: 'Bemerkung', key: 'bem', width: 32 },
            { header: 'Maschine', key: 'maschine', width: 30 },
            { header: 'Erinnerung', key: 'erinnerung', width: 13 }
        ];

        const headerRow = ws.getRow(1);
        headerRow.height = 22;
        headerRow.eachCell(cell => {
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN } };
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
            cell.border = thinBorder;
        });

        entries.forEach((a, idx) => {
            const vk = parseNumDe(a.nettobetrag);
            const ek = parseNumDe(a.ek_betrag);
            const spanne = (vk !== null && ek !== null) ? vk - ek : null;
            const spannePct = (spanne !== null && vk > 0) ? spanne / vk : null;
            const real = parseNumDe(a.realisierbar);
            const row = ws.addRow({
                datum: a.belegdatum ? new Date(a.belegdatum + 'T00:00:00') : null,
                nr: a.belegnummer || '',
                firma: (a.customers?.name || a.kundenmatchcode || ''),
                vk: vk, ek: ek, spanne: spanne, spannePct: spannePct,
                real: real !== null ? real / 100 : null,
                status: a.status || '',
                bem: a.bemerkung || '',
                maschine: getAngebotMachineLabel(a) || '',
                erinnerung: a.erinnerung ? new Date(a.erinnerung + 'T00:00:00') : null
            });
            row.getCell('datum').numFmt = 'DD.MM.YYYY';
            row.getCell('erinnerung').numFmt = 'DD.MM.YYYY';
            ['vk', 'ek', 'spanne'].forEach(k => row.getCell(k).numFmt = '#,##0.00 "€"');
            row.getCell('spannePct').numFmt = '0.0 %';
            row.getCell('real').numFmt = '0 %';
            if (spannePct !== null) {
                row.getCell('spannePct').font = { bold: true, color: { argb: spannePct < 0.10 ? 'FFB91C1C' : 'FF15803D' } };
            }
            row.eachCell({ includeEmpty: true }, cell => {
                cell.border = thinBorder;
                if (idx % 2 === 1 && !cell.fill) {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
                }
            });
        });

        // Summenzeile
        const sumRow = ws.addRow({
            firma: `Summe (${entries.length} Angebote)`,
            vk: entries.reduce((s, a) => s + (parseNumDe(a.nettobetrag) || 0), 0),
            ek: entries.reduce((s, a) => s + (parseNumDe(a.ek_betrag) || 0), 0),
            spanne: entries.reduce((s, a) => {
                const vk = parseNumDe(a.nettobetrag), ek = parseNumDe(a.ek_betrag);
                return s + ((vk !== null && ek !== null) ? vk - ek : 0);
            }, 0)
        });
        sumRow.eachCell({ includeEmpty: true }, cell => {
            cell.font = { bold: true };
            cell.border = { ...thinBorder, top: { style: 'double', color: { argb: 'FF111827' } } };
        });
        ['vk', 'ek', 'spanne'].forEach(k => sumRow.getCell(k).numFmt = '#,##0.00 "€"');

        ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 12 } };

        // ---- Blatt 2: Dashboard (KPIs + Diagramme als Bilder) ----
        const wsDash = wb.addWorksheet('Dashboard');
        wsDash.getColumn(1).width = 30;
        wsDash.getColumn(2).width = 20;

        const titleCell = wsDash.getCell('A1');
        titleCell.value = 'Angebote – Übersicht (' + new Date().toLocaleDateString('de-DE') + ')';
        titleCell.font = { bold: true, size: 16 };

        const openEntries = entries.filter(a => classifyAngebotStatus(a) === 'open');
        const wonEntries = entries.filter(a => classifyAngebotStatus(a) === 'won');
        const lostEntries = entries.filter(a => classifyAngebotStatus(a) === 'lost');
        const decided = wonEntries.length + lostEntries.length;
        const kpis = [
            ['Anzahl Angebote (gefiltert)', entries.length, '#,##0'],
            ['Offenes Volumen (€)', openEntries.reduce((s, a) => s + (parseNumDe(a.nettobetrag) || 0), 0), '#,##0.00 "€"'],
            ['Erwarteter Umsatz (€)', openEntries.reduce((s, a) => {
                const vk = parseNumDe(a.nettobetrag) || 0;
                const real = parseNumDe(a.realisierbar);
                return s + (real !== null ? vk * real / 100 : 0);
            }, 0), '#,##0.00 "€"'],
            ['Trefferquote', decided > 0 ? wonEntries.length / decided : null, '0 %'],
            ['Gewonnen / Verloren', `${wonEntries.length} / ${lostEntries.length}`, null]
        ];
        kpis.forEach((kpi, i) => {
            const labelCell = wsDash.getCell(3 + i, 1);
            const valueCell = wsDash.getCell(3 + i, 2);
            labelCell.value = kpi[0];
            labelCell.font = { bold: true };
            valueCell.value = kpi[1];
            if (kpi[2]) valueCell.numFmt = kpi[2];
            labelCell.border = thinBorder;
            valueCell.border = thinBorder;
        });

        // Diagramm-Daten (identisch zur Web-Ansicht berechnet)
        const statusGroups = {};
        entries.forEach(a => {
            const name = a.status || 'Ohne Status';
            if (!statusGroups[name]) {
                const statusCat = (window.categoryList || []).find(c => c.type === 'status' && c.name === a.status);
                statusGroups[name] = { name, sum: 0, count: 0, color: statusCat?.color || '#94a3b8' };
            }
            statusGroups[name].sum += parseNumDe(a.nettobetrag) || 0;
            statusGroups[name].count++;
        });
        const pipeline = Object.values(statusGroups).sort((a, b) => b.sum - a.sum).slice(0, 8);

        const now = new Date();
        const monthBuckets = [];
        for (let i = 11; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            monthBuckets.push({
                label: d.toLocaleDateString('de-DE', { month: 'short' }) + ' ' + String(d.getFullYear()).slice(2),
                year: d.getFullYear(), month: d.getMonth(), sum: 0
            });
        }
        entries.forEach(a => {
            if (!a.belegdatum) return;
            const d = new Date(a.belegdatum);
            const bucket = monthBuckets.find(b => b.year === d.getFullYear() && b.month === d.getMonth());
            if (bucket) bucket.sum += parseNumDe(a.nettobetrag) || 0;
        });

        if (pipeline.length > 0) {
            const pipelineImg = wb.addImage({ base64: drawPipelineChartPng(pipeline), extension: 'png' });
            wsDash.addImage(pipelineImg, { tl: { col: 0, row: 9 }, ext: { width: 675, height: Math.round((60 + pipeline.length * 44 + 20) * 0.75) } });
        }
        const monthImg = wb.addImage({ base64: drawMonthlyChartPng(monthBuckets), extension: 'png' });
        const monthRowOffset = 9 + Math.ceil((60 + pipeline.length * 44 + 20) * 0.75 / 20) + 2;
        wsDash.addImage(monthImg, { tl: { col: 0, row: monthRowOffset }, ext: { width: 675, height: 315 } });

        // ---- Datei erzeugen und herunterladen ----
        const buf = await wb.xlsx.writeBuffer();
        const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'Angebote_' + new Date().toISOString().split('T')[0] + '.xlsx';
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    };

    // Füllt die Status- und Maschinen-Filter-Dropdowns (links vom Suchfeld) mit den aktuell
    // vorkommenden Werten. Vorherige Auswahl wird beibehalten, falls sie noch existiert.
    // Auch global verfügbar: muss erneut laufen, sobald die Maschinenliste fertig geladen ist,
    // sonst fehlen im Maschinen-Filter alle echten (per machine_id verknüpften) Maschinen,
    // wenn die Angebote schneller da waren als die Maschinen (Race beim App-Start).
    window.populateAngeboteFilterOptions = populateAngeboteFilterOptions;
    function populateAngeboteFilterOptions() {
        const jahrSelect = document.getElementById('angebote-filter-jahr');
        if (jahrSelect) {
            const prevValue = jahrSelect.value;
            const years = new Set();
            angeboteList.forEach(a => {
                if (a.belegdatum) years.add(new Date(a.belegdatum).getFullYear());
            });
            const sortedYears = [...years].sort((a, b) => b - a); // neuestes Jahr zuerst
            jahrSelect.innerHTML = '<option value="">Alle Jahre</option>' +
                sortedYears.map(y => `<option value="${y}">${y}</option>`).join('');
            if (sortedYears.some(y => String(y) === prevValue)) jahrSelect.value = prevValue;
            if (typeof window.initGlassSelect === 'function') window.initGlassSelect(jahrSelect);
            jahrSelect.dispatchEvent(new Event('change'));
        }

        const statusSelect = document.getElementById('angebote-filter-status');
        if (statusSelect) {
            const prevValue = statusSelect.value;
            const statusOptions = (window.categoryList || []).filter(c => c.type === 'status');
            statusSelect.innerHTML = '<option value="">Alle Status</option>' +
                statusOptions.map(cat => `<option value="${escapeHtml(cat.name)}">${escapeHtml(cat.name)}</option>`).join('');
            if (statusOptions.some(c => c.name === prevValue)) statusSelect.value = prevValue;
            // Natives Dropdown durch das im Rest der App genutzte gestylte Dropdown ersetzen.
            if (typeof window.initGlassSelect === 'function') window.initGlassSelect(statusSelect);
            statusSelect.dispatchEvent(new Event('change'));
        }

        const machineSelect = document.getElementById('angebote-filter-maschine');
        if (machineSelect) {
            const prevValue = machineSelect.value;
            // Zwei Gruppen: echte Maschinen (per machine_id verknüpft) grün, selbsterstellte
            // Freitext-Bezeichnungen orange — Farbe kommt per data-color im gestylten Dropdown an.
            const realLabels = new Set();
            const freitextLabels = new Set();
            angeboteList.forEach(a => {
                if (a.machine_id) {
                    const label = getAngebotMachineLabel(a);
                    if (label) realLabels.add(label);
                } else if (a.machine_label) {
                    freitextLabels.add(a.machine_label);
                }
            });
            const sortedReal = [...realLabels].sort((a, b) => a.localeCompare(b, 'de'));
            const sortedFrei = [...freitextLabels].filter(l => !realLabels.has(l)).sort((a, b) => a.localeCompare(b, 'de'));
            machineSelect.innerHTML = '<option value="">Alle Maschinen</option>' +
                sortedReal.map(label => `<option value="${escapeHtml(label)}" data-color="#34d399">${escapeHtml(label)}</option>`).join('') +
                sortedFrei.map(label => `<option value="${escapeHtml(label)}" data-color="#f59e0b">${escapeHtml(label)}</option>`).join('');
            if (sortedReal.includes(prevValue) || sortedFrei.includes(prevValue)) machineSelect.value = prevValue;
            if (typeof window.initGlassSelect === 'function') window.initGlassSelect(machineSelect);
            machineSelect.dispatchEvent(new Event('change'));
        }
    }

    window.renderAngeboteList = function () {
        const container = document.getElementById('angebote-list-container');
        if (!container) return;

        const entries = getFilteredAngebote();

        if (entries.length === 0) {
            container.innerHTML = `
                <div class="empty-state" style="text-align:center; padding:3rem 2rem; background: rgba(255,255,255,0.02); border-radius: 16px; border: 1px dashed rgba(255,255,255,0.1);">
                    <p style="color: rgba(255,255,255,0.4); font-size: 1rem;">Keine Angebote vorhanden. Oben importieren.</p>
                </div>`;
            return;
        }

        const fmtDate = (d) => {
            if (!d) return '';
            const p = String(d).split('-');
            return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : d;
        };
        const fmtNumberInput = (v) => (v === null || v === undefined || v === '') ? '' : Number(v).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const fmtPercentInput = (v) => (v === null || v === undefined || v === '') ? '' : String(v).replace('.', ',');
        const fmtEur = (v) => Math.round(v).toLocaleString('de-DE') + ' €';
        const parseNum = (v) => {
            if (v === null || v === undefined || v === '') return null;
            const n = parseFloat(String(v).replace(',', '.'));
            return isNaN(n) ? null : n;
        };

        // ==========================================
        // DASHBOARD: KPIs, Pipeline, Monats-Graf, Top-Kunden, Nachfassen
        // (alles bezogen auf die aktuell gefilterten Angebote)
        // ==========================================
        const openEntries = entries.filter(a => classifyAngebotStatus(a) === 'open');
        const wonEntries = entries.filter(a => classifyAngebotStatus(a) === 'won');
        const lostEntries = entries.filter(a => classifyAngebotStatus(a) === 'lost');
        const sumVK = arr => arr.reduce((s, a) => s + (parseNum(a.nettobetrag) || 0), 0);

        const openVolume = sumVK(openEntries);
        const weighted = openEntries.reduce((s, a) => {
            const vk = parseNum(a.nettobetrag) || 0;
            const real = parseNum(a.realisierbar);
            return s + (real !== null ? vk * real / 100 : 0);
        }, 0);
        const decided = wonEntries.length + lostEntries.length;
        const quoteStr = decided > 0 ? Math.round(wonEntries.length / decided * 100) + ' %' : '–';

        const marginPcts = entries
            .map(a => {
                const vk = parseNum(a.nettobetrag);
                const ek = parseNum(a.ek_betrag);
                return (vk && vk > 0 && ek !== null) ? (vk - ek) / vk * 100 : null;
            })
            .filter(v => v !== null);
        const avgMarginStr = marginPcts.length > 0
            ? (marginPcts.reduce((s, v) => s + v, 0) / marginPcts.length).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' %'
            : '–';

        // --- MoM Trend Calculations ---
        const today = new Date();
        const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);

        const currentMonthEntries = entries.filter(a => {
            if (!a.belegdatum) return false;
            const d = new Date(a.belegdatum);
            return d >= currentMonthStart;
        });

        const lastMonthEntries = entries.filter(a => {
            if (!a.belegdatum) return false;
            const d = new Date(a.belegdatum);
            return d >= lastMonthStart && d <= lastMonthEnd;
        });

        // 1. Open volume trend
        const curOpenVol = sumVK(currentMonthEntries.filter(a => classifyAngebotStatus(a) === 'open'));
        const prevOpenVol = sumVK(lastMonthEntries.filter(a => classifyAngebotStatus(a) === 'open'));
        let openVolTrendHtml = '';
        if (prevOpenVol > 0) {
            const diffVal = curOpenVol - prevOpenVol;
            const diffPct = (diffVal / prevOpenVol) * 100;
            const dir = diffPct >= 0 ? '+' : '';
            const valSign = diffVal >= 0 ? '+' : '-';
            const color = diffPct >= 0 ? '#10b981' : '#f87171';
            const fmtVal = fmtEur(Math.abs(diffVal));
            openVolTrendHtml = `
                <div style="display:flex; flex-direction:column; align-items:flex-end; line-height:1.2; text-align:right;">
                    <span style="font-size:0.75rem; color:${color}; font-weight:700; white-space:nowrap;">${dir}${Math.round(diffPct)}% vs. Vm.</span>
                    <span style="font-size:0.68rem; color:${color}; font-weight:600; white-space:nowrap; margin-top:2px;">${valSign} ${fmtVal}</span>
                </div>
            `;
        }

        // 2. Expected revenue trend
        const curWeighted = currentMonthEntries.filter(a => classifyAngebotStatus(a) === 'open').reduce((s, a) => s + ((parseNum(a.nettobetrag) || 0) * (parseNum(a.realisierbar) || 0) / 100), 0);
        const prevWeighted = lastMonthEntries.filter(a => classifyAngebotStatus(a) === 'open').reduce((s, a) => s + ((parseNum(a.nettobetrag) || 0) * (parseNum(a.realisierbar) || 0) / 100), 0);
        let weightedTrendHtml = '';
        if (prevWeighted > 0) {
            const diffVal = curWeighted - prevWeighted;
            const diffPct = (diffVal / prevWeighted) * 100;
            const dir = diffPct >= 0 ? '+' : '';
            const valSign = diffVal >= 0 ? '+' : '-';
            const color = diffPct >= 0 ? '#10b981' : '#f87171';
            const fmtVal = fmtEur(Math.abs(diffVal));
            weightedTrendHtml = `
                <div style="display:flex; flex-direction:column; align-items:flex-end; line-height:1.2; text-align:right;">
                    <span style="font-size:0.75rem; color:${color}; font-weight:700; white-space:nowrap;">${dir}${Math.round(diffPct)}% vs. Vm.</span>
                    <span style="font-size:0.68rem; color:${color}; font-weight:600; white-space:nowrap; margin-top:2px;">${valSign} ${fmtVal}</span>
                </div>
            `;
        }

        // 3. Hit rate trend
        const curWon = currentMonthEntries.filter(a => classifyAngebotStatus(a) === 'won').length;
        const curDecided = currentMonthEntries.filter(a => classifyAngebotStatus(a) === 'won' || classifyAngebotStatus(a) === 'lost').length;
        const curQuote = curDecided > 0 ? (curWon / curDecided) : null;

        const prevWon = lastMonthEntries.filter(a => classifyAngebotStatus(a) === 'won').length;
        const prevDecided = lastMonthEntries.filter(a => classifyAngebotStatus(a) === 'won' || classifyAngebotStatus(a) === 'lost').length;
        const prevQuote = prevDecided > 0 ? (prevWon / prevDecided) : null;

        let quoteTrendHtml = '';
        if (curQuote !== null && prevQuote !== null && prevQuote > 0) {
            const diffPct = (curQuote - prevQuote) * 100;
            const dir = diffPct >= 0 ? '+' : '';
            const color = diffPct >= 0 ? '#10b981' : '#f87171';
            quoteTrendHtml = `
                <div style="display:flex; flex-direction:column; align-items:flex-end; line-height:1.2; text-align:right;">
                    <span style="font-size:0.75rem; color:${color}; font-weight:700; white-space:nowrap;">${dir}${Math.round(diffPct)}% vs. Vm.</span>
                </div>
            `;
        }

        // 4. Margin trend
        const getMarginPctForSet = (set) => {
            const pcts = set.map(a => {
                const vk = parseNum(a.nettobetrag);
                const ek = parseNum(a.ek_betrag);
                return (vk && vk > 0 && ek !== null) ? (vk - ek) / vk * 100 : null;
            }).filter(v => v !== null);
            return pcts.length > 0 ? pcts.reduce((s, v) => s + v, 0) / pcts.length : null;
        };
        const curMargin = getMarginPctForSet(currentMonthEntries);
        const prevMargin = getMarginPctForSet(lastMonthEntries);
        let marginTrendHtml = '';
        if (curMargin !== null && prevMargin !== null && prevMargin > 0) {
            const diffPct = curMargin - prevMargin;
            const dir = diffPct >= 0 ? '+' : '';
            const color = diffPct >= 0 ? '#10b981' : '#f87171';
            marginTrendHtml = `
                <div style="display:flex; flex-direction:column; align-items:flex-end; line-height:1.2; text-align:right;">
                    <span style="font-size:0.75rem; color:${color}; font-weight:700; white-space:nowrap;">${dir}${diffPct.toFixed(1)}% vs. Vm.</span>
                </div>
            `;
        }

        let html = `
            <div class="maint-kpi-grid" style="margin-top: 0.75rem;">
                <div class="maint-kpi-tile" style="cursor: default;" title="Summe VK aller offenen (nicht gewonnenen/verlorenen) Angebote">
                    <div style="display:flex; justify-content:space-between; align-items:center; width:100%;">
                        <div class="maint-kpi-value" style="color: #60a5fa;">${fmtEur(openVolume)}</div>
                        ${openVolTrendHtml}
                    </div>
                    <div class="maint-kpi-label">Offenes Volumen (${openEntries.length})</div>
                </div>
                <div class="maint-kpi-tile" style="cursor: default;" title="Summe VK × Realisierbar-% der offenen Angebote">
                    <div style="display:flex; justify-content:space-between; align-items:center; width:100%;">
                        <div class="maint-kpi-value" style="color: #a78bfa;">${fmtEur(weighted)}</div>
                        ${weightedTrendHtml}
                    </div>
                    <div class="maint-kpi-label">Erwarteter Umsatz</div>
                </div>
                <div class="maint-kpi-tile" style="cursor: default;" title="Gewonnen / entschieden — erkannt am Status-Namen (gewonnen/Auftrag/verkauft bzw. verloren/abgelehnt/storniert)">
                    <div style="display:flex; justify-content:space-between; align-items:center; width:100%;">
                        <div class="maint-kpi-value" style="color: #34d399;">${quoteStr}</div>
                        ${quoteTrendHtml}
                    </div>
                    <div class="maint-kpi-label">Trefferquote (${wonEntries.length} von ${decided})</div>
                </div>
                <div class="maint-kpi-tile" style="cursor: default;" title="Durchschnittliche Spanne in % über alle Angebote mit gepflegtem EK">
                    <div style="display:flex; justify-content:space-between; align-items:center; width:100%;">
                        <div class="maint-kpi-value" style="color: #fff;">${avgMarginStr}</div>
                        ${marginTrendHtml}
                    </div>
                    <div class="maint-kpi-label">Ø Spanne (${marginPcts.length} mit EK)</div>
                </div>
            </div>
        `;

        // --- Pipeline nach Status (Summe VK, Balkenfarbe = Status-Kategorie-Farbe) ---
        const statusGroups = {};
        entries.forEach(a => {
            const name = a.status || 'Ohne Status';
            if (!statusGroups[name]) statusGroups[name] = { name, sum: 0, count: 0 };
            statusGroups[name].sum += parseNum(a.nettobetrag) || 0;
            statusGroups[name].count++;
        });
        const pipeline = Object.values(statusGroups).sort((a, b) => b.sum - a.sum).slice(0, 8);
        const maxPipeline = Math.max(...pipeline.map(g => g.sum), 1);
        window.__angebotePipelineNames = pipeline.map(g => g.name);
        const pipelineHtml = pipeline.map((g, i) => {
            const statusCat = (window.categoryList || []).find(c => c.type === 'status' && c.name === g.name);
            const color = statusCat?.color || 'rgba(255,255,255,0.45)';
            const clickable = g.name !== 'Ohne Status';
            const sumLabel = fmtEurFull(g.sum);
            const pct = Math.round((g.sum / maxPipeline) * 100);
            return `
                <div style="display:flex; flex-direction:column; gap:3px; ${clickable ? 'cursor:pointer;' : ''}" 
                     ${clickable ? `onclick="window.setAngeboteStatusFilter(window.__angebotePipelineNames[${i}])" title="Klick: nach diesem Status filtern"` : ''}>
                    <div style="display:flex; justify-content:space-between; align-items:baseline;">
                        <span style="font-size:0.78rem; font-weight:700; color:${color}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:70%;">${escapeHtml(g.name)}</span>
                        <span style="font-size:0.72rem; font-weight:700; color:rgba(255,255,255,0.5); white-space:nowrap;"><strong style="color:#fff; font-weight:800;">${g.count} Stk.</strong> &middot; ${sumLabel}</span>
                    </div>
                    <div style="width:100%; height:10px; background:rgba(255,255,255,0.06); border-radius:4px; overflow:hidden;">
                        <div style="width:${pct}%; height:100%; background:${color}; border-radius:4px; transition: width 0.4s ease;"></div>
                    </div>
                </div>
            `;
        }).join('') || '<div style="color: rgba(255,255,255,0.3); font-size: 0.85rem; padding: 1rem 0;">Keine Daten</div>';

        // --- Angebotsvolumen pro Monat (letzte 6 Monate, Summe VK) ---
        const now = new Date();
        const monthBuckets = [];
        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            monthBuckets.push({
                label: d.toLocaleDateString('de-DE', { month: 'short' }) + (d.getMonth() === 0 || i === 5 ? ' \'' + String(d.getFullYear()).slice(2) : ''),
                year: d.getFullYear(),
                month: d.getMonth(),
                sum: 0
            });
        }
        entries.forEach(a => {
            if (!a.belegdatum) return;
            const d = new Date(a.belegdatum);
            const bucket = monthBuckets.find(b => b.year === d.getFullYear() && b.month === d.getMonth());
            if (bucket) bucket.sum += parseNum(a.nettobetrag) || 0;
        });
        const maxMonth = Math.max(...monthBuckets.map(b => b.sum), 1);
        const monthBarsHtml = monthBuckets.map(b => {
            const pct = Math.round((b.sum / maxMonth) * 100);
            const hasVal = b.sum > 0;
            return `
                <div style="flex: 1; display:flex; flex-direction:column; align-items:center; justify-content:flex-end; gap:0; height:100%;">
                    ${hasVal ? `<div style="font-size:0.58rem; font-weight:800; color:#60a5fa; margin-bottom:3px; white-space:nowrap; writing-mode:horizontal-tb; text-align:center; max-width:100%; overflow:hidden; text-overflow:ellipsis; letter-spacing:-0.3px;">${fmtEurFull(b.sum)}</div>` : ''}
                    <div style="width:80%; background:${hasVal ? 'linear-gradient(0deg,#3b82f6,#60a5fa)' : 'rgba(255,255,255,0.04)'}; border-radius:4px 4px 0 0; height:${pct}%; min-height:${hasVal ? '3px' : '0'}; transition:height 0.4s ease;"></div>
                    <div style="font-size:0.7rem; font-weight:700; color:rgba(255,255,255,0.45); margin-top:5px; white-space:nowrap;">${b.label}</div>
                </div>
            `;
        }).join('');

        // --- Top 4 Kunden nach Angebotsvolumen ---
        const customerGroups = {};
        entries.forEach(a => {
            const firma = (a.customers?.name || a.kundenmatchcode || 'Unbekannt').split(',')[0].trim();
            if (!customerGroups[firma]) customerGroups[firma] = { firma, sum: 0, count: 0 };
            customerGroups[firma].sum += parseNum(a.nettobetrag) || 0;
            customerGroups[firma].count++;
        });
        const topCustomers = Object.values(customerGroups).sort((a, b) => b.sum - a.sum).slice(0, 4);
        const maxCustomer = Math.max(...topCustomers.map(c => c.sum), 1);
        const topCustomersHtml = topCustomers.map(c => {
            const pct = Math.round((c.sum / maxCustomer) * 100);
            return `
                <div style="display:flex; flex-direction:column; gap:3px;">
                    <div style="display:flex; justify-content:space-between; align-items:baseline;">
                        <span style="font-size:0.78rem; font-weight:700; color:rgba(255,255,255,0.8); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:65%;" title="${escapeHtml(c.firma)}">${escapeHtml(c.firma)}</span>
                        <span style="font-size:0.72rem; font-weight:700; color:rgba(255,255,255,0.5); white-space:nowrap;"><strong style="color:#fff; font-weight:800;">${c.count} Stk.</strong> &middot; ${fmtEurFull(c.sum)}</span>
                    </div>
                    <div style="width:100%; height:10px; background:rgba(255,255,255,0.06); border-radius:4px; overflow:hidden;">
                        <div style="width:${pct}%; height:100%; background:linear-gradient(90deg, #22c55e, #4ade80); border-radius:4px; transition: width 0.4s ease;"></div>
                    </div>
                </div>
            `;
        }).join('') || '<div style="color: rgba(255,255,255,0.3); font-size: 0.85rem; padding: 1rem 0;">Keine Daten</div>';

        const wonPct  = entries.length > 0 ? Math.round(wonEntries.length  / entries.length * 100) : 0;
        const lostPct = entries.length > 0 ? Math.round(lostEntries.length / entries.length * 100) : 0;
        const openPct = entries.length > 0 ? Math.round(openEntries.length  / entries.length * 100) : 0;

        const funnelHtml = `
                <div class="maint-chart-card" style="margin-bottom: 0;">
                    <p class="maint-chart-title">Anzahl Angebote</p>
                    <div style="display:flex; flex-direction:column; gap:0.6rem; padding-top:4px;">

                        <!-- Step 1: Gesamt -->
                        <div style="display:flex; flex-direction:column; gap:2px;">
                            <div style="display:flex; justify-content:space-between; font-size:0.75rem; font-weight:700; color:rgba(255,255,255,0.7);">
                                <span>1. Angebote gesamt</span>
                                <span>${entries.length}</span>
                            </div>
                            <div style="width:100%; height:14px; background:rgba(255,255,255,0.06); border-radius:4px; overflow:hidden; position:relative;">
                                <div style="width:100%; height:100%; background:linear-gradient(90deg, #60a5fa, #3b82f6); border-radius:4px;"></div>
                                <span style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-size:0.68rem; font-weight:900; color:#fff;">100%</span>
                            </div>
                        </div>

                        <!-- Step 2: Offen -->
                        <div style="display:flex; flex-direction:column; gap:2px;">
                            <div style="display:flex; justify-content:space-between; font-size:0.75rem; font-weight:700; color:rgba(255,255,255,0.7);">
                                <span>2. Offen / In Verhandlung</span>
                                <span>${openEntries.length}</span>
                            </div>
                            <div style="width:100%; height:14px; background:rgba(255,255,255,0.06); border-radius:4px; overflow:hidden; position:relative;">
                                <div style="width:${openPct}%; height:100%; background:linear-gradient(90deg, #fbbf24, #f59e0b); border-radius:4px;"></div>
                                <span style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-size:0.68rem; font-weight:900; color:#fff;">${openPct}%</span>
                            </div>
                        </div>

                        <!-- Step 3: Gewonnen -->
                        <div style="display:flex; flex-direction:column; gap:2px;">
                            <div style="display:flex; justify-content:space-between; font-size:0.75rem; font-weight:700; color:rgba(255,255,255,0.7);">
                                <span style="display:flex; align-items:center; gap:5px;">
                                    <span style="width:7px; height:7px; background:#10b981; border-radius:50%; display:inline-block;"></span>
                                    3. Aufträge / Gewonnen
                                </span>
                                <span style="color:#34d399;">${wonEntries.length}</span>
                            </div>
                            <div style="width:100%; height:14px; background:rgba(255,255,255,0.06); border-radius:4px; overflow:hidden; position:relative;">
                                <div style="width:${wonPct}%; height:100%; background:linear-gradient(90deg, #34d399, #10b981); border-radius:4px;"></div>
                                <span style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-size:0.68rem; font-weight:900; color:#fff;">${wonPct}%</span>
                            </div>
                        </div>

                        <!-- Step 4: Verloren -->
                        <div style="display:flex; flex-direction:column; gap:2px;">
                            <div style="display:flex; justify-content:space-between; font-size:0.75rem; font-weight:700; color:rgba(255,255,255,0.7);">
                                <span style="display:flex; align-items:center; gap:5px;">
                                    <span style="width:7px; height:7px; background:#ef4444; border-radius:50%; display:inline-block;"></span>
                                    4. Aufträge Verloren
                                </span>
                                <span style="color:#f87171;">${lostEntries.length}</span>
                            </div>
                            <div style="width:100%; height:14px; background:rgba(255,255,255,0.06); border-radius:4px; overflow:hidden; position:relative;">
                                <div style="width:${lostPct}%; height:100%; background:linear-gradient(90deg, #f87171, #ef4444); border-radius:4px;"></div>
                                <span style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-size:0.68rem; font-weight:900; color:#fff;">${lostPct}%</span>
                            </div>
                        </div>

                    </div>
                </div>`;

        html += `
            <div class="ang-charts-row">
                ${funnelHtml}
                <div class="maint-chart-card" style="margin-bottom: 0;">
                    <p class="maint-chart-title">nach Status (Summe VK)</p>
                    <div style="display:flex; flex-direction:column; gap:10px; padding-top:4px;">
                        ${pipelineHtml}
                    </div>
                </div>
                <div class="maint-chart-card" style="margin-bottom: 0; display:flex; flex-direction:column;">
                    <p class="maint-chart-title" style="margin-bottom:0;">Angebotsvolumen pro Monat</p>
                    <div style="display:flex; align-items:flex-end; gap:6px; flex:1; padding-top:8px; min-height:160px;">
                        ${monthBarsHtml}
                    </div>
                </div>
                <div class="maint-chart-card" style="margin-bottom: 0;">
                    <p class="maint-chart-title">Top 4 Kunden nach Volumen</p>
                    <div style="display:flex; flex-direction:column; gap:10px; padding-top:4px;">
                        ${topCustomersHtml}
                    </div>
                </div>
            </div>
        `;

        // --- Nachfassen: offene Angebote ohne Aktivität (Notiz/Beleg) seit 14+ Tagen ---
        const allStille = openEntries
            .map(a => ({ a, stille: getAngebotStilleDays(a) }))
            .filter(x => x.stille !== null && x.stille >= 14);

        const rote = allStille
            .filter(x => x.stille >= 21)
            .sort((x, y) => (parseNum(y.a.nettobetrag) || 0) - (parseNum(x.a.nettobetrag) || 0))
            .slice(0, 5);

        const orangene = allStille
            .filter(x => x.stille >= 14 && x.stille < 21)
            .sort((x, y) => (parseNum(y.a.nettobetrag) || 0) - (parseNum(x.a.nettobetrag) || 0))
            .slice(0, 5);

        if (rote.length > 0 || orangene.length > 0) {
            html += `
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px; margin-bottom: 1.5rem;">
                    <!-- Rote (21+ Tage) -->
                    <div class="maint-chart-card" style="margin-bottom: 0;">
                        <p class="maint-chart-title" style="color: #F87171; display:flex; align-items:center; gap:6px;">
                            <span style="width:8px; height:8px; background:#F87171; border-radius:50%; display:inline-block;"></span>
                            Nachfassen rot (stille &ge; 21 Tage)
                        </p>
                        <div style="display:flex; flex-direction:column; gap:8px; padding-top:4px;">
                            ${rote.length > 0 ? rote.map(x => {
                                const firma = (x.a.customers?.name || x.a.kundenmatchcode || '').split(',')[0].trim();
                                const vk = parseNum(x.a.nettobetrag);
                                return `
                                    <div onclick="window.jumpToAngebotFromReminder('${x.a.id}')" class="ang-nachfass-row" style="background: rgba(248,113,113,0.1); display:flex; justify-content:space-between; align-items:center; cursor:pointer;">
                                        <span style="color: #F87171; font-weight: 700; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(x.a.belegnummer)}${firma ? ' · ' + escapeHtml(firma) : ''}${vk ? ' · ' + fmtEur(vk) : ''}</span>
                                        <span style="color: #F87171; font-weight: 800; white-space: nowrap; font-size: 0.78rem;">${x.stille} Tage still</span>
                                    </div>
                                `;
                            }).join('') : '<div style="color: rgba(255,255,255,0.3); font-size: 0.85rem; padding: 0.5rem 0;">Keine roten Angebote</div>'}
                        </div>
                    </div>

                    <!-- Orangene (14-20 Tage) -->
                    <div class="maint-chart-card" style="margin-bottom: 0;">
                        <p class="maint-chart-title" style="color: #FFA000; display:flex; align-items:center; gap:6px;">
                            <span style="width:8px; height:8px; background:#FFA000; border-radius:50%; display:inline-block;"></span>
                            Nachfassen orange (stille 14-20 Tage)
                        </p>
                        <div style="display:flex; flex-direction:column; gap:8px; padding-top:4px;">
                            ${orangene.length > 0 ? orangene.map(x => {
                                const firma = (x.a.customers?.name || x.a.kundenmatchcode || '').split(',')[0].trim();
                                const vk = parseNum(x.a.nettobetrag);
                                return `
                                    <div onclick="window.jumpToAngebotFromReminder('${x.a.id}')" class="ang-nachfass-row" style="background: rgba(255,160,0,0.08); display:flex; justify-content:space-between; align-items:center; cursor:pointer;">
                                        <span style="color: #FFA000; font-weight: 700; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(x.a.belegnummer)}${firma ? ' · ' + escapeHtml(firma) : ''}${vk ? ' · ' + fmtEur(vk) : ''}</span>
                                        <span style="color: #FFA000; font-weight: 800; white-space: nowrap; font-size: 0.78rem;">${x.stille} Tage still</span>
                                    </div>
                                `;
                            }).join('') : '<div style="color: rgba(255,255,255,0.3); font-size: 0.85rem; padding: 0.5rem 0;">Keine orangenen Angebote</div>'}
                        </div>
                    </div>
                </div>
            `;
        }

        // ==========================================
        // SUMMEN (gefilterte Auswahl) für die Fußzeile
        // ==========================================
        const totalVK = sumVK(entries);
        const totalEK = entries.reduce((s, a) => s + (parseNum(a.ek_betrag) || 0), 0);
        const entriesWithEk = entries.filter(a => parseNum(a.ek_betrag) !== null && parseNum(a.nettobetrag) !== null);
        const totalSpanne = entriesWithEk.reduce((s, a) => s + (parseNum(a.nettobetrag) - parseNum(a.ek_betrag)), 0);
        const spanneVkBasis = entriesWithEk.reduce((s, a) => s + parseNum(a.nettobetrag), 0);
        const totalSpannePct = spanneVkBasis > 0 ? (totalSpanne / spanneVkBasis * 100).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' %' : '';

        const todayMs = new Date().setHours(0, 0, 0, 0);

        // ==========================================
        // DESKTOP-TABELLE
        // ==========================================
        html += `
            <div class="angebote-table-wrap" style="overflow-x:auto;">
                <table style="width:100%; border-collapse:collapse;">
                    <thead>
                        <tr style="border-bottom:2px solid rgba(255,255,255,0.15);">
                            <th style="padding:10px; text-align:left; font-size:0.8rem; color:rgba(255,255,255,0.5); font-weight:700;">Belegdatum</th>
                            <th style="padding:10px; text-align:left; font-size:0.8rem; color:rgba(255,255,255,0.5); font-weight:700;">Belegnummer</th>
                            <th style="padding:10px; text-align:left; font-size:0.8rem; color:rgba(255,255,255,0.5); font-weight:700;">Firma</th>
                            <th style="padding:10px; text-align:right; font-size:0.8rem; color:rgba(255,255,255,0.5); font-weight:700;">VK</th>
                            <th style="padding:10px; text-align:right; font-size:0.8rem; color:rgba(255,255,255,0.5); font-weight:700;">EK</th>
                            <th style="padding:10px; text-align:right; font-size:0.8rem; color:rgba(255,255,255,0.5); font-weight:700;">Spanne</th>
                            <th style="padding:10px; text-align:left; font-size:0.8rem; color:rgba(255,255,255,0.5); font-weight:700;">Realisierbar</th>
                            <th style="padding:10px; text-align:left; font-size:0.8rem; color:rgba(255,255,255,0.5); font-weight:700;">Status</th>
                            <th style="padding:10px; text-align:left; font-size:0.8rem; color:rgba(255,255,255,0.5); font-weight:700;">Bemerkung</th>
                            <th style="padding:10px; text-align:left; font-size:0.8rem; color:rgba(255,255,255,0.5); font-weight:700;">Maschine</th>
                            <th style="padding:10px; text-align:left; font-size:0.8rem; color:rgba(255,255,255,0.5); font-weight:700;">Erinnerung</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${entries.map(a => {
                            const firma = a.customers?.name || a.kundenmatchcode || '';
                            const firmaDisplay = firma.split(',')[0].trim();
                            const vk = parseNum(a.nettobetrag);
                            const ek = parseNum(a.ek_betrag);
                            const spanne = (vk !== null && ek !== null) ? vk - ek : null;
                            const spannePct = (spanne !== null && vk > 0) ? spanne / vk * 100 : null;
                            const spannePctHtml = spannePct !== null
                                ? `<div style="font-size:0.75rem; font-weight:700; color:${spannePct < 10 ? '#F87171' : '#22c55e'};">${spannePct.toLocaleString('de-DE', { maximumFractionDigits: 1 })} %</div>`
                                : '';
                            // Alters-Hinweis nur bei offenen Angeboten älter als 30 Tage
                            const isOpen = classifyAngebotStatus(a) === 'open';
                            const ageDays = a.belegdatum ? Math.round((todayMs - new Date(a.belegdatum + 'T00:00:00')) / 86400000) : null;
                            const ageHtml = (isOpen && ageDays !== null && ageDays > 30)
                                ? `<div style="font-size:0.72rem; color:${ageDays > 60 ? '#F87171' : 'rgba(255,255,255,0.35)'};">vor ${ageDays} Tg.</div>`
                                : '';
                            // Farbiger Akzent links an der Zeile, analog zur Buchhaltung — Farbe kommt
                            // direkt von der Status-Kategorie (Einstellungen -> Kategorien -> Angebots-Status),
                            // nicht hart im Code verdrahtet.
                            const statusCat = (window.categoryList || []).find(c => c.type === 'status' && c.name === a.status);
                            const accentStyle = statusCat?.color ? `box-shadow: inset 4px 0 0 0 ${statusCat.color};` : '';
                            return `
                            <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
                                <td style="padding:10px; color:rgba(255,255,255,0.8); font-size:0.88rem; ${accentStyle}">${fmtDate(a.belegdatum)}${ageHtml}</td>
                                <td style="padding:10px; color:white; font-weight:700; font-size:0.88rem;">${escapeHtml(a.belegnummer)}</td>
                                <td style="padding:10px; color:white; font-size:0.88rem;">${escapeHtml(firmaDisplay)}</td>
                                <td style="padding:10px; text-align:right; color:rgba(255,255,255,0.8); font-size:0.88rem;">${fmtNumberInput(a.nettobetrag)}</td>
                                <td style="padding:10px; font-size:0.88rem; min-width:130px;">
                                    <input type="text" class="glass-form-input" value="${escapeHtml(fmtNumberInput(a.ek_betrag))}"
                                        placeholder="EK..." style="height:34px; font-size:0.85rem; text-align:right;"
                                        onblur="window.updateAngebotEk('${a.id}', this.value)"
                                        onkeydown="if(event.key==='Enter'){ this.blur(); }">
                                </td>
                                <td style="padding:10px; text-align:right; color:white; font-weight:600; font-size:0.88rem;">${spanne !== null ? fmtNumberInput(spanne) : ''}${spannePctHtml}</td>
                                <td style="padding:10px; font-size:0.88rem; min-width:110px;">
                                    <div style="display:flex; align-items:center; gap:4px;">
                                        <input type="text" class="glass-form-input" value="${escapeHtml(fmtPercentInput(a.realisierbar))}"
                                            placeholder="..." style="height:34px; font-size:0.85rem; width:70px;"
                                            onblur="window.updateAngebotRealisierbar('${a.id}', this.value)"
                                            onkeydown="if(event.key==='Enter'){ this.blur(); }">
                                        <span style="color:rgba(255,255,255,0.4); font-size:0.85rem;">%</span>
                                    </div>
                                </td>
                                <td style="padding:10px; font-size:0.88rem; min-width:180px;">${renderAngebotStatusCell(a)}</td>
                                <td style="padding:10px; font-size:0.88rem; min-width:160px;">${renderAngebotBemerkungCell(a)}</td>
                                <td style="padding:10px; font-size:0.88rem; min-width:200px;">${renderAngebotMachineCell(a)}</td>
                                <td style="padding:10px; font-size:0.88rem; min-width:150px;">${renderAngebotErinnerungCell(a)}</td>
                            </tr>
                        `;
                        }).join('')}
                    </tbody>
                    <tfoot>
                        <tr style="border-top:2px solid rgba(255,255,255,0.15);">
                            <td colspan="3" style="padding:12px 10px; color:rgba(255,255,255,0.5); font-size:0.8rem; font-weight:700; text-transform:uppercase;">Summe (${entries.length} Angebote)</td>
                            <td style="padding:12px 10px; text-align:right; color:white; font-weight:800; font-size:0.9rem;">${fmtNumberInput(totalVK)}</td>
                            <td style="padding:12px 10px; text-align:right; color:white; font-weight:800; font-size:0.9rem;">${fmtNumberInput(totalEK)}</td>
                            <td style="padding:12px 10px; text-align:right; color:#22c55e; font-weight:800; font-size:0.9rem;">${fmtNumberInput(totalSpanne)}${totalSpannePct ? `<div style="font-size:0.75rem;">${totalSpannePct}</div>` : ''}</td>
                            <td colspan="5"></td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        `;

        // ==========================================
        // MOBILE KARTEN (gleiche Daten & Eingabefelder, gestapelt)
        // ==========================================
        html += `
            <div class="angebote-cards">
                ${entries.map(a => {
                    const firma = (a.customers?.name || a.kundenmatchcode || '').split(',')[0].trim();
                    const vk = parseNum(a.nettobetrag);
                    const ek = parseNum(a.ek_betrag);
                    const spanne = (vk !== null && ek !== null) ? vk - ek : null;
                    const spannePct = (spanne !== null && vk > 0) ? spanne / vk * 100 : null;
                    const statusCat = (window.categoryList || []).find(c => c.type === 'status' && c.name === a.status);
                    const accentColor = statusCat?.color || 'rgba(255,255,255,0.15)';
                    return `
                    <div class="ang-card" style="border-left-color: ${accentColor};">
                        <div class="ang-card-top">
                            <div style="min-width:0; flex:1 1 auto;">
                                <div style="color:#fff; font-weight:800; font-size:0.95rem;">${escapeHtml(a.belegnummer)}</div>
                                <div style="color:rgba(255,255,255,0.45); font-size:0.78rem; font-weight:600; white-space:normal; word-break:break-word;">${fmtDate(a.belegdatum)}${firma ? ' · ' + escapeHtml(firma) : ''}</div>
                            </div>
                            <div style="text-align:right; flex-shrink:0;">
                                <div style="color:#fff; font-weight:800; font-size:0.95rem;">${vk !== null ? fmtNumberInput(vk) + ' €' : '–'}</div>
                                ${spanne !== null ? `<div style="font-size:0.75rem; font-weight:700; color:${spannePct !== null && spannePct < 10 ? '#F87171' : '#22c55e'};">Spanne ${fmtNumberInput(spanne)}${spannePct !== null ? ' (' + spannePct.toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' %)' : ''}</div>` : ''}
                            </div>
                        </div>
                        <div class="ang-card-fields">
                            <div><label>EK</label>
                                <input type="text" class="glass-form-input" value="${escapeHtml(fmtNumberInput(a.ek_betrag))}" placeholder="EK..."
                                    style="height:36px; font-size:0.85rem; text-align:right; width:100%;"
                                    onblur="window.updateAngebotEk('${a.id}', this.value)" onkeydown="if(event.key==='Enter'){ this.blur(); }">
                            </div>
                            <div><label>Realisierbar %</label>
                                <input type="text" class="glass-form-input" value="${escapeHtml(fmtPercentInput(a.realisierbar))}" placeholder="..."
                                    style="height:36px; font-size:0.85rem; width:100%;"
                                    onblur="window.updateAngebotRealisierbar('${a.id}', this.value)" onkeydown="if(event.key==='Enter'){ this.blur(); }">
                            </div>
                            <div style="grid-column: 1 / -1;"><label>Status</label>${renderAngebotStatusCell(a)}</div>
                            <div style="grid-column: 1 / -1;"><label>Bemerkung</label>${renderAngebotBemerkungCell(a)}</div>
                            <div style="grid-column: 1 / -1;"><label>Maschine</label>${renderAngebotMachineCell(a)}</div>
                            <div style="grid-column: 1 / -1;"><label>Erinnerung</label>${renderAngebotErinnerungCell(a)}</div>
                        </div>
                    </div>
                `;
                }).join('')}
                <div style="padding:12px 4px; color:rgba(255,255,255,0.6); font-size:0.82rem; font-weight:700;">
                    Summe (${entries.length}): VK ${fmtEur(totalVK)} · EK ${fmtEur(totalEK)} · Spanne ${fmtEur(totalSpanne)}${totalSpannePct ? ' (' + totalSpannePct + ')' : ''}
                </div>
            </div>
        `;

        container.innerHTML = html;

        // Natives Dropdown durch das im Rest der App genutzte gestylte Dropdown ersetzen
        // (siehe accounting.js) — sonst rendert der Browser die Optionsliste schwarz.
        if (typeof window.initGlassSelect === 'function') {
            container.querySelectorAll('.angebot-status-select').forEach(sel => window.initGlassSelect(sel));
        }
    };

    function renderAngebotBemerkungCell(a) {
        return `
            <input type="text" class="glass-form-input" value="${escapeHtml(a.bemerkung || '')}"
                placeholder="Bemerkung..." onblur="window.updateAngebotBemerkung('${a.id}', this.value)"
                onkeydown="if(event.key==='Enter'){ this.blur(); }"
                style="height:34px; font-size:0.85rem; min-width:160px;">
        `;
    }

    // Status-Optionen werden unter Einstellungen -> Kategorien (Typ "status") gepflegt, genau wie
    // z.B. Maschinenserien oder Zusatzausrüstung. Gespeichert wird der Name (Text), nicht die ID.
    function renderAngebotStatusCell(a) {
        const options = (window.categoryList || []).filter(c => c.type === 'status');
        return `
            <div style="display:flex; align-items:center; gap:6px;">
                <select class="glass-form-input angebot-status-select" style="height:34px; font-size:0.85rem; flex:1;"
                    onchange="window.updateAngebotStatus('${a.id}', this.value)">
                    <option value="">-- kein Status --</option>
                    ${options.map(cat => `<option value="${escapeHtml(cat.name)}" ${a.status === cat.name ? 'selected' : ''}>${escapeHtml(cat.name)}</option>`).join('')}
                </select>
                ${renderAngebotNotizButton(a)}
            </div>
        `;
    }

    // Zeitgestempelte Notizen pro Angebot (z.B. fürs Nachhaken) — immer neben Status verfügbar,
    // unabhängig vom gewählten Status-Wert. "+" wenn noch keine Notiz existiert, sonst die Anzahl.
    function renderAngebotNotizButton(a) {
        const notes = a.angebot_notizen || [];
        const hasNotes = notes.length > 0;
        return `
            <button type="button" class="angebot-notiz-btn" onclick="event.stopPropagation(); window.toggleAngebotNotizPanel('${a.id}', this)"
                title="${hasNotes ? notes.length + ' Notiz(en)' : 'Notiz hinzufügen'}"
                style="flex-shrink:0; width:26px; height:26px; padding:0; border-radius:999px; font-size:0.78rem; font-weight:700; cursor:pointer; display:flex; align-items:center; justify-content:center;
                    background:${hasNotes ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.06)'};
                    border:1px solid ${hasNotes ? 'rgba(16,185,129,0.4)' : 'rgba(255,255,255,0.15)'};
                    color:${hasNotes ? 'var(--color-primary-green)' : 'rgba(255,255,255,0.6)'};">${hasNotes ? notes.length : '+'}</button>
        `;
    }

    window.toggleAngebotNotizPanel = function (angebotId, anchorEl) {
        let panel = document.getElementById('angebot-notiz-panel');
        editingNotizId = null;
        if (panel && panel.dataset.angebotId === angebotId && panel.style.display === 'block') {
            panel.style.display = 'none';
            return;
        }
        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'angebot-notiz-panel';
            panel.style.cssText = 'position:fixed; z-index:999999; background:rgba(15,23,42,0.98); backdrop-filter:blur(16px); -webkit-backdrop-filter:blur(16px); border:1px solid rgba(255,255,255,0.15); border-radius:14px; box-shadow:0 16px 48px rgba(0,0,0,0.6); overflow-y:auto; overflow-x:hidden; padding:1.25rem; display:none;';
            document.body.appendChild(panel);
        }
        panel.dataset.angebotId = angebotId;

        // Auf dem Rechner deutlich breiter (mehr Platz zum Lesen/Schreiben), auf kleinen
        // Bildschirmen an die verfügbare Breite begrenzt.
        const panelWidth = Math.min(520, window.innerWidth - 32);
        panel.style.width = panelWidth + 'px';

        if (anchorEl) {
            const rect = anchorEl.getBoundingClientRect();
            const margin = 16;
            const spaceBelow = window.innerHeight - rect.bottom - margin;
            const spaceAbove = rect.top - margin;
            const desiredHeight = 600;

            if (spaceBelow >= 320 || spaceBelow >= spaceAbove) {
                // Unterhalb des Buttons öffnen, Höhe an den verfügbaren Platz anpassen statt
                // über den unteren Bildschirmrand hinauszuragen — der Rest scrollt innerhalb
                // des Panels selbst (overflow-y:auto), keine horizontale Verschiebung nötig.
                panel.style.top = (rect.bottom + 8) + 'px';
                panel.style.bottom = 'auto';
                panel.style.maxHeight = Math.max(200, Math.min(desiredHeight, spaceBelow)) + 'px';
            } else {
                // Zu wenig Platz unterhalb (Button nah am unteren Bildschirmrand) — Panel
                // stattdessen nach oben aufklappen, damit nichts abgeschnitten wird.
                panel.style.top = 'auto';
                panel.style.bottom = (window.innerHeight - rect.top + 8) + 'px';
                panel.style.maxHeight = Math.max(200, Math.min(desiredHeight, spaceAbove)) + 'px';
            }

            const left = Math.min(rect.left, window.innerWidth - panelWidth - 16);
            panel.style.left = Math.max(8, left) + 'px';
        }

        renderAngebotNotizPanelContent(angebotId);
        panel.style.display = 'block';
    };

    let editingNotizId = null;

    function renderAngebotNotizPanelContent(angebotId) {
        const panel = document.getElementById('angebot-notiz-panel');
        if (!panel) return;

        const angebot = angeboteList.find(a => a.id === angebotId);
        const notes = (angebot?.angebot_notizen || []).slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        const fmtTimestamp = (iso) => {
            const d = new Date(iso);
            return d.toLocaleDateString('de-DE') + ', ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
        };

        const notesHtml = notes.length ? notes.map(n => {
            if (editingNotizId === n.id) {
                return `
                    <div style="padding:8px 0; border-bottom:1px solid rgba(255,255,255,0.06);">
                        <div style="color:rgba(255,255,255,0.4); font-size:0.72rem; margin-bottom:3px;">${fmtTimestamp(n.created_at)}</div>
                        <textarea id="angebot-notiz-edit-${n.id}" class="glass-form-input" rows="5" style="width:100%; font-size:0.9rem; resize:vertical;">${escapeHtml(n.content)}</textarea>
                        <div style="display:flex; justify-content:flex-end; gap:6px; margin-top:6px;">
                            <button type="button" onclick="event.stopPropagation(); window.cancelEditAngebotNotiz('${angebotId}')" class="btn-secondary" style="padding:4px 10px; font-size:0.75rem;">Abbrechen</button>
                            <button type="button" onclick="event.stopPropagation(); window.saveEditAngebotNotiz('${angebotId}', '${n.id}')" class="btn-primary" style="padding:4px 10px; font-size:0.75rem;">Speichern</button>
                        </div>
                    </div>
                `;
            }
            return `
                <div onclick="event.stopPropagation(); window.startEditAngebotNotiz('${angebotId}', '${n.id}')" title="Klicken zum Bearbeiten" style="padding:8px; margin:0 -8px; border-radius:8px; border-bottom:1px solid rgba(255,255,255,0.06); cursor:pointer; transition:background 0.15s;" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='transparent'">
                    <div style="color:rgba(255,255,255,0.4); font-size:0.72rem; margin-bottom:3px;">${fmtTimestamp(n.created_at)}</div>
                    <div style="color:#fff; font-size:0.85rem; white-space:pre-wrap;">${escapeHtml(n.content)}</div>
                </div>
            `;
        }).join('') : '<div style="color:rgba(255,255,255,0.4); font-size:0.82rem; padding:6px 0 12px;">Noch keine Notizen.</div>';

        panel.innerHTML = `
            <div style="font-size:0.8rem; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; color:rgba(255,255,255,0.4); margin-bottom:0.6rem;">Notizen</div>
            <div style="margin-bottom:0.6rem; max-height:260px; overflow-y:auto; overflow-x:hidden;">${notesHtml}</div>
            <div style="border-top:1px solid rgba(255,255,255,0.1); padding-top:0.85rem;">
                <div style="color:rgba(255,255,255,0.4); font-size:0.75rem; margin-bottom:5px;">Neue Notiz · ${fmtTimestamp(new Date().toISOString())}</div>
                <textarea id="angebot-notiz-input" class="glass-form-input" rows="5" placeholder="Notiz eingeben..." style="width:100%; font-size:0.9rem; resize:vertical;"></textarea>
                <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:8px;">
                    <button type="button" onclick="window.toggleAngebotNotizPanel('${angebotId}')" class="btn-secondary" style="padding:6px 14px; font-size:0.8rem;">Schließen</button>
                    <button type="button" onclick="window.saveAngebotNotiz('${angebotId}')" class="btn-primary" style="padding:6px 14px; font-size:0.8rem;">Speichern</button>
                </div>
            </div>
        `;
    }

    window.saveAngebotNotiz = async function (angebotId) {
        const input = document.getElementById('angebot-notiz-input');
        const text = input ? input.value.trim() : '';
        if (!text || !window.supabaseClient) return;

        try {
            const { data, error } = await window.supabaseClient
                .from('angebot_notizen')
                .insert([{ angebot_id: angebotId, content: text }])
                .select()
                .single();
            if (error) throw error;

            const idx = angeboteList.findIndex(x => x.id === angebotId);
            if (idx !== -1) {
                if (!angeboteList[idx].angebot_notizen) angeboteList[idx].angebot_notizen = [];
                angeboteList[idx].angebot_notizen.push(data);
            }

            renderAngebotNotizPanelContent(angebotId);
            window.renderAngeboteList();
        } catch (err) {
            console.error('Error saving Notiz:', err);
            alert('Fehler beim Speichern der Notiz: ' + err.message);
        }
    };

    window.startEditAngebotNotiz = function (angebotId, notizId) {
        editingNotizId = notizId;
        renderAngebotNotizPanelContent(angebotId);
        requestAnimationFrame(() => {
            const ta = document.getElementById(`angebot-notiz-edit-${notizId}`);
            // Bewusst kein ta.select() -- Cursor soll an die Stelle springen, wo man hinklickt,
            // statt beim Öffnen automatisch den ganzen Text zu markieren.
            if (ta) ta.focus();
        });
    };

    window.cancelEditAngebotNotiz = function (angebotId) {
        editingNotizId = null;
        renderAngebotNotizPanelContent(angebotId);
    };

    window.saveEditAngebotNotiz = async function (angebotId, notizId) {
        const ta = document.getElementById(`angebot-notiz-edit-${notizId}`);
        const text = ta ? ta.value.trim() : '';
        if (!text || !window.supabaseClient) return;

        try {
            const { data, error } = await window.supabaseClient
                .from('angebot_notizen')
                .update({ content: text })
                .eq('id', notizId)
                .select()
                .single();
            if (error) throw error;

            const idx = angeboteList.findIndex(x => x.id === angebotId);
            if (idx !== -1 && angeboteList[idx].angebot_notizen) {
                const noteIdx = angeboteList[idx].angebot_notizen.findIndex(n => n.id === notizId);
                if (noteIdx !== -1) angeboteList[idx].angebot_notizen[noteIdx] = data;
            }

            editingNotizId = null;
            renderAngebotNotizPanelContent(angebotId);
        } catch (err) {
            console.error('Error updating Notiz:', err);
            alert('Fehler beim Speichern der Notiz: ' + err.message);
        }
    };

    document.addEventListener('click', (e) => {
        const panel = document.getElementById('angebot-notiz-panel');
        if (panel && panel.style.display === 'block' &&
            !e.target.closest('#angebot-notiz-panel') &&
            !e.target.closest('.angebot-notiz-btn')) {
            panel.style.display = 'none';
        }
    });

    // EK, Spanne (berechnet, nicht gespeichert), Realisierbar (%) und Status sind reine manuelle
    // Kalkulationsfelder in der App — kommen nicht aus dem Sage-Import.
    window.updateAngebotEk = async function (angebotId, value) {
        if (!window.supabaseClient) return;
        const ek = parseGermanNumber(value);
        try {
            const { data, error } = await window.supabaseClient
                .from('angebote')
                .update({ ek_betrag: ek })
                .eq('id', angebotId)
                .select('*, customers(name), angebot_notizen(id, content, created_at)')
                .single();
            if (error) throw error;
            const idx = angeboteList.findIndex(x => x.id === angebotId);
            if (idx !== -1) angeboteList[idx] = data;
            window.renderAngeboteList(); // Spanne hängt von EK ab -> neu rendern
        } catch (err) {
            console.error('Error updating EK:', err);
            alert('Fehler beim Speichern des Einkaufspreises: ' + err.message);
        }
    };

    window.updateAngebotRealisierbar = async function (angebotId, value) {
        if (!window.supabaseClient) return;
        const val = parseGermanNumber(value);
        try {
            const { data, error } = await window.supabaseClient
                .from('angebote')
                .update({ realisierbar: val })
                .eq('id', angebotId)
                .select('*, customers(name), angebot_notizen(id, content, created_at)')
                .single();
            if (error) throw error;
            const idx = angeboteList.findIndex(x => x.id === angebotId);
            if (idx !== -1) angeboteList[idx] = data;
            window.renderAngeboteList();
        } catch (err) {
            console.error('Error updating Realisierbar:', err);
            alert('Fehler beim Speichern: ' + err.message);
        }
    };

    window.updateAngebotStatus = async function (angebotId, value) {
        if (!window.supabaseClient) return;
        const text = (value || '').trim() || null;
        try {
            const { data, error } = await window.supabaseClient
                .from('angebote')
                .update({ status: text })
                .eq('id', angebotId)
                .select('*, customers(name), angebot_notizen(id, content, created_at)')
                .single();
            if (error) throw error;
            const idx = angeboteList.findIndex(x => x.id === angebotId);
            if (idx !== -1) angeboteList[idx] = data;
            window.renderAngeboteList(); // Farbakzent links an der Zeile richtet sich nach dem Status
        } catch (err) {
            console.error('Error updating status:', err);
            alert('Fehler beim Speichern des Status: ' + err.message);
        }
    };

    function renderAngebotErinnerungCell(a) {
        return `
            <input type="date" class="glass-form-input" value="${a.erinnerung || ''}"
                style="height:34px; font-size:0.85rem; color-scheme: dark;"
                onchange="window.updateAngebotErinnerung('${a.id}', this.value)">
        `;
    }

    window.updateAngebotErinnerung = async function (angebotId, value) {
        if (!window.supabaseClient) return;
        const date = value || null;
        try {
            const { data, error } = await window.supabaseClient
                .from('angebote')
                .update({ erinnerung: date })
                .eq('id', angebotId)
                .select('*, customers(name), angebot_notizen(id, content, created_at)')
                .single();
            if (error) throw error;
            const idx = angeboteList.findIndex(x => x.id === angebotId);
            if (idx !== -1) angeboteList[idx] = data;
            window.renderAngebotReminderBadge();
        } catch (err) {
            console.error('Error updating Erinnerung:', err);
            alert('Fehler beim Speichern der Erinnerung: ' + err.message);
        }
    };

    // ==========================================
    // ANGEBOTE: ERINNERUNGEN (Glocke im Seiten-Header)
    // ==========================================
    // Ueberfaellig: Erinnerungsdatum liegt in der Vergangenheit. Zeitnah: heute bis in 5 Tagen.
    function getAngeboteReminders() {
        const todayStr = new Date().toISOString().split('T')[0];
        const today = new Date(todayStr + 'T00:00:00');
        const in5Days = new Date(today);
        in5Days.setDate(in5Days.getDate() + 5);

        const ueberfaellig = [];
        const zeitnah = [];

        angeboteList.forEach(a => {
            if (!a.erinnerung) return;
            const d = new Date(a.erinnerung + 'T00:00:00');
            if (d < today) {
                ueberfaellig.push(a);
            } else if (d <= in5Days) {
                zeitnah.push(a);
            }
        });

        const byDate = (x, y) => new Date(x.erinnerung) - new Date(y.erinnerung);
        ueberfaellig.sort(byDate);
        zeitnah.sort(byDate);

        return { ueberfaellig, zeitnah };
    }

    window.renderAngebotReminderBadge = function () {
        const badge = document.getElementById('angebote-reminder-badge');
        const bell = document.getElementById('angebote-reminder-bell');
        const bellIcon = document.getElementById('angebote-reminder-bell-icon');
        if (!badge) return;
        const { ueberfaellig, zeitnah } = getAngeboteReminders();
        const total = ueberfaellig.length + zeitnah.length;
        const hasUrgent = ueberfaellig.length > 0;

        if (total > 0) {
            badge.textContent = total;
            badge.classList.remove('hidden');

            if (bell) {
                if (hasUrgent) {
                    // Overdue: bright pulsing red glow
                    bell.classList.add('reminder-bell-urgent');
                    bell.classList.remove('reminder-bell-soon');
                } else {
                    // Upcoming: softer amber glow
                    bell.classList.add('reminder-bell-soon');
                    bell.classList.remove('reminder-bell-urgent');
                }
            }
            if (bellIcon) {
                bellIcon.style.stroke = hasUrgent ? '#ef4444' : '#fbbf24';
            }
        } else {
            badge.classList.add('hidden');
            if (bell) {
                bell.classList.remove('reminder-bell-urgent', 'reminder-bell-soon');
            }
            if (bellIcon) {
                bellIcon.style.stroke = '';
            }
        }
    };

    window.toggleAngeboteReminderPanel = function (e) {
        if (e) e.stopPropagation();

        let panel = document.getElementById('angebote-reminder-panel');
        if (panel && panel.style.display === 'block') {
            panel.style.display = 'none';
            return;
        }
        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'angebote-reminder-panel';
            panel.style.cssText = 'position:fixed; z-index:999999; background:rgba(15,23,42,0.98); backdrop-filter:blur(16px); -webkit-backdrop-filter:blur(16px); border:1px solid rgba(255,255,255,0.15); border-radius:14px; box-shadow:0 16px 48px rgba(0,0,0,0.6); max-height:420px; overflow-y:auto; min-width:300px; max-width:380px; padding:0.85rem; display:none;';
            document.body.appendChild(panel);
        }

        const btn = document.getElementById('angebote-reminder-bell');
        if (btn) {
            const rect = btn.getBoundingClientRect();
            panel.style.top = (rect.bottom + 8) + 'px';
            panel.style.left = '';
            panel.style.right = (window.innerWidth - rect.right) + 'px';
        }

        const { ueberfaellig, zeitnah } = getAngeboteReminders();

        const renderItem = (a) => {
            const firma = (a.customers?.name || a.kundenmatchcode || '').split(',')[0].trim();
            const label = firma || a.belegnummer;
            const dateStr = new Date(a.erinnerung + 'T00:00:00').toLocaleDateString('de-DE');
            return `
                <div onclick="window.jumpToAngebotFromReminder('${a.id}')" style="padding:8px 10px; border-radius:8px; cursor:pointer; transition:background 0.15s;" onmouseover="this.style.background='rgba(255,255,255,0.06)'" onmouseout="this.style.background='transparent'">
                    <div style="color:#fff; font-weight:600; font-size:0.88rem;">${escapeHtml(label)}</div>
                    <div style="color:rgba(255,255,255,0.5); font-size:0.78rem;">${escapeHtml(a.belegnummer)} · ${dateStr}</div>
                </div>
            `;
        };

        const renderGroup = (title, color, items) => {
            if (items.length === 0) return '';
            return `
                <div style="margin-bottom:0.6rem;">
                    <div style="font-size:0.72rem; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; color:${color}; padding:4px 10px 6px;">${title} (${items.length})</div>
                    ${items.map(renderItem).join('')}
                </div>
            `;
        };

        const html = renderGroup('Überfällig', '#ef4444', ueberfaellig) + renderGroup('Zeitnah', '#f59e0b', zeitnah);
        panel.innerHTML = html || '<div style="padding:1rem; text-align:center; color:rgba(255,255,255,0.4); font-size:0.85rem;">Keine anstehenden Erinnerungen</div>';
        panel.style.display = 'block';
    };

    window.jumpToAngebotFromReminder = function (angebotId) {
        const panel = document.getElementById('angebote-reminder-panel');
        if (panel) panel.style.display = 'none';

        const angebot = angeboteList.find(a => a.id === angebotId);
        if (typeof window.switchListenTab === 'function') window.switchListenTab('angebote');
        const searchInput = document.getElementById('angebote-search-input');
        if (searchInput && angebot) {
            searchInput.value = angebot.belegnummer;
            window.renderAngeboteList();
        }
    };

    document.addEventListener('click', (e) => {
        const panel = document.getElementById('angebote-reminder-panel');
        if (panel && panel.style.display === 'block' &&
            !e.target.closest('#angebote-reminder-panel') &&
            !e.target.closest('#angebote-reminder-bell')) {
            panel.style.display = 'none';
        }
    });

    // ==========================================
    // ANGEBOTE: MASCHINEN-ZUORDNUNG (automatisch + manuell)
    // ==========================================
    function renderAngebotMachineCell(a) {
        if (editingAngebotMachineId === a.id) {
            if (editingAngebotMachineMode === 'freitext') {
                return `
                    <input type="text" class="glass-form-input angebot-machine-search" data-angebot-id="${a.id}"
                        value="${escapeHtml(pendingFreitextValue)}" placeholder="Eigene Bezeichnung..."
                        style="height:34px; font-size:0.85rem; width:100%;"
                        onblur="window.commitAngebotMachineFreitext('${a.id}', this.value)"
                        onkeydown="if(event.key==='Enter'){ this.blur(); }">
                `;
            }
            return `
                <input type="text" class="glass-form-input angebot-machine-search" data-angebot-id="${a.id}"
                    placeholder="Maschine suchen..."
                    style="height:34px; font-size:0.85rem; width:100%;"
                    oninput="window.filterAngebotMachineDropdown(this.value, '${a.id}')"
                    onfocus="window.filterAngebotMachineDropdown(this.value, '${a.id}')"
                    onkeydown="if(event.key==='Enter'){ window.commitAngebotMachineFreitext('${a.id}', this.value); }">
            `;
        }

        const hasMachine = !!(a.machine_id || a.machine_label);
        const nameHtml = a.machine_id
            ? `<span style="color:var(--color-primary-green); font-weight:600;">${escapeHtml((typeof window.getMachineName === 'function') ? window.getMachineName(a.machine_id) : a.machine_id)}</span>`
            : a.machine_label
                ? `<span style="color:#f59e0b;" title="Freitext, keine echte Maschine im System">${escapeHtml(a.machine_label)}</span>`
                : '';

        return `
            <div style="display:flex; align-items:flex-start; gap:8px;">
                <button type="button" class="angebot-machine-edit-btn" onclick="event.stopPropagation(); window.startEditAngebotMachine('${a.id}')"
                    title="${hasMachine ? 'Maschine bearbeiten' : 'Maschine hinzufügen'}"
                    style="flex-shrink:0; width:26px; height:26px; padding:0; border-radius:999px; font-size:0.78rem; font-weight:700; cursor:pointer; display:flex; align-items:center; justify-content:center;
                        background:${hasMachine ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.06)'};
                        border:1px solid ${hasMachine ? 'rgba(16,185,129,0.4)' : 'rgba(255,255,255,0.15)'};
                        color:${hasMachine ? 'var(--color-primary-green)' : 'rgba(255,255,255,0.6)'};">${hasMachine ? '✎' : '+'}</button>
                ${nameHtml ? `<span style="white-space:normal; word-break:break-word; line-height:1.3; padding-top:3px;">${nameHtml}</span>` : ''}
            </div>
        `;
    }

    window.startEditAngebotMachine = function (angebotId) {
        editingAngebotMachineId = angebotId;
        editingAngebotMachineMode = 'search';
        window.renderAngeboteList();
        requestAnimationFrame(() => {
            const input = document.querySelector(`.angebot-machine-search[data-angebot-id="${angebotId}"]`);
            if (input) {
                input.focus();
                input.select();
                window.filterAngebotMachineDropdown(input.value, angebotId);
            }
        });
    };

    // Wechselt das Suchfeld in ein reines Textfeld zum Eintippen einer eigenen Bezeichnung
    // (kein Dropdown mehr) — ausgelöst über den "Eigene Bezeichnung"-Eintrag im Dropdown.
    window.switchAngebotMachineToFreitext = function (angebotId, prefillText) {
        const dropdown = document.getElementById('angebot-machine-dropdown-portal');
        if (dropdown) dropdown.style.display = 'none';
        editingAngebotMachineMode = 'freitext';
        pendingFreitextValue = (prefillText || '').trim();
        window.renderAngeboteList();
        requestAnimationFrame(() => {
            const input = document.querySelector(`.angebot-machine-search[data-angebot-id="${angebotId}"]`);
            if (input) { input.focus(); input.select(); }
        });
    };

    // Bereits verwendete Freitext-Maschinenbezeichnungen (nur fürs Angebote-Dropdown, gelten an
    // keiner anderen Stelle der App) — werden direkt aus der schon geladenen Angebote-Liste
    // ermittelt, keine eigene Tabelle/Abfrage dafür nötig.
    function getDistinctMachineLabels() {
        const set = new Set();
        angeboteList.forEach(a => { if (a.machine_label) set.add(a.machine_label); });
        return [...set].sort((a, b) => a.localeCompare(b, 'de'));
    }

    window.filterAngebotMachineDropdown = function (query, angebotId) {
        const machines = window.machineList || [];
        const tokens = query.toLowerCase().split(/\s+/).filter(t => t.length > 0);
        const filtered = machines.filter(m => {
            const searchable = [m.manufacturer || '', m.name || '', m.serial_number || m.serial || '', m.year ? String(m.year) : ''].join(' ').toLowerCase();
            return tokens.length === 0 || tokens.every(t => searchable.includes(t));
        });
        const filteredLabels = getDistinctMachineLabels().filter(label =>
            tokens.length === 0 || tokens.every(t => label.toLowerCase().includes(t))
        );

        let dropdown = document.getElementById('angebot-machine-dropdown-portal');
        if (!dropdown) {
            dropdown = document.createElement('div');
            dropdown.id = 'angebot-machine-dropdown-portal';
            dropdown.style.cssText = 'position:fixed;z-index:999999;background:rgba(15,23,42,0.98);border:1px solid rgba(255,255,255,0.15);border-radius:12px;max-height:320px;overflow-y:auto;box-shadow:0 16px 48px rgba(0,0,0,0.7);display:none;min-width:200px;';
            document.body.appendChild(dropdown);
        }

        const searchInput = document.querySelector(`.angebot-machine-search[data-angebot-id="${angebotId}"]`);
        if (searchInput) {
            const rect = searchInput.getBoundingClientRect();
            const margin = 8;
            const width = Math.max(rect.width, 220);
            // Immer unter dem Feld aufklappen, aber Breite/Höhe an den Viewport anpassen, damit
            // das Dropdown nicht rechts oder unten abgeschnitten aus dem sichtbaren Bereich ragt.
            const spaceBelow = window.innerHeight - rect.bottom - margin;
            dropdown.style.top = (rect.bottom + 4) + 'px';
            dropdown.style.bottom = 'auto';
            dropdown.style.maxHeight = Math.max(120, Math.min(320, spaceBelow)) + 'px';
            dropdown.style.width = width + 'px';
            const left = Math.min(rect.left, window.innerWidth - width - margin);
            dropdown.style.left = Math.max(margin, left) + 'px';
        }

        dropdown.innerHTML = '';

        const noneItem = document.createElement('div');
        noneItem.textContent = 'Keine Maschine';
        noneItem.style.cssText = 'padding:10px 14px;cursor:pointer;color:rgba(255,255,255,0.6);font-size:0.9rem;';
        noneItem.onmousedown = (e) => { e.preventDefault(); window.selectAngebotMachine(angebotId, null); };
        noneItem.onmouseover = () => { noneItem.style.background = 'rgba(255,255,255,0.08)'; };
        noneItem.onmouseout = () => { noneItem.style.background = ''; };
        dropdown.appendChild(noneItem);

        // Direkt unter "Keine Maschine": eigene Bezeichnung eintippen, grau hinterlegt. Übernimmt
        // einfach den aktuell eingetippten Text als Freitext-Maschine (genau wie Enter im Feld).
        const trimmedQuery = query.trim();
        const freitextItem = document.createElement('div');
        freitextItem.textContent = trimmedQuery ? `✎ Eigene Bezeichnung „${trimmedQuery}“ übernehmen` : '✎ Eigene Bezeichnung eintippen...';
        freitextItem.style.cssText = 'padding:10px 14px;cursor:pointer;font-size:0.9rem;color:rgba(255,255,255,0.7);background:rgba(255,255,255,0.05);border-top:1px solid rgba(255,255,255,0.05);';
        // onclick + stopPropagation statt onmousedown: dieser Eintrag lässt editingAngebotMachineId
        // bewusst gesetzt (wechselt nur den Modus), darum darf das nachfolgende click-Event nicht
        // erst beim Dokument landen und die Bearbeitung über den Außerhalb-Klick-Listener sofort
        // wieder beenden.
        freitextItem.onclick = (e) => { e.stopPropagation(); window.switchAngebotMachineToFreitext(angebotId, query); };
        freitextItem.onmouseover = () => { freitextItem.style.background = 'rgba(255,255,255,0.1)'; };
        freitextItem.onmouseout = () => { freitextItem.style.background = 'rgba(255,255,255,0.05)'; };
        dropdown.appendChild(freitextItem);

        if (filtered.length === 0 && filteredLabels.length === 0) {
            const empty = document.createElement('div');
            empty.textContent = 'Keine Maschine gefunden';
            empty.style.cssText = 'padding:10px 14px;color:rgba(255,255,255,0.3);font-size:0.85rem;font-style:italic;';
            dropdown.appendChild(empty);
        }

        filtered.slice(0, 50).forEach(m => {
            const label = (typeof window.getMachineName === 'function') ? window.getMachineName(m.id) : (m.name || '');
            const item = document.createElement('div');
            item.style.cssText = 'padding:10px 14px;cursor:pointer;font-size:0.9rem;border-top:1px solid rgba(255,255,255,0.05);';
            item.innerHTML = `<span style="color:var(--color-primary-green);font-weight:600;">${escapeHtml(label)}</span>`;
            item.onmousedown = (e) => { e.preventDefault(); window.selectAngebotMachine(angebotId, m.id); };
            item.onmouseover = () => { item.style.background = 'rgba(255,255,255,0.06)'; };
            item.onmouseout = () => { item.style.background = ''; };
            dropdown.appendChild(item);
        });

        // Bereits anderswo verwendete Freitext-Bezeichnungen — rot, damit klar erkennbar ist:
        // das ist keine echte Maschine aus der Maschinenübersicht.
        filteredLabels.slice(0, 30).forEach(label => {
            const item = document.createElement('div');
            item.style.cssText = 'padding:10px 14px;cursor:pointer;font-size:0.9rem;border-top:1px solid rgba(255,255,255,0.05);';
            item.innerHTML = `<span style="color:#ef4444;font-weight:600;">${escapeHtml(label)}</span>`;
            item.onmousedown = (e) => { e.preventDefault(); window.commitAngebotMachineFreitext(angebotId, label); };
            item.onmouseover = () => { item.style.background = 'rgba(255,255,255,0.06)'; };
            item.onmouseout = () => { item.style.background = ''; };
            dropdown.appendChild(item);
        });

        dropdown.style.display = 'block';
    };

    window.selectAngebotMachine = async function (angebotId, machineId) {
        const dropdown = document.getElementById('angebot-machine-dropdown-portal');
        if (dropdown) dropdown.style.display = 'none';
        editingAngebotMachineId = null;
        await window.assignAngebotMachine(angebotId, machineId || null);
    };

    window.assignAngebotMachine = async function (angebotId, machineId) {
        if (!window.supabaseClient) return;
        try {
            // Echte Maschine zugeordnet (oder bewusst per Dropdown auf "Keine Maschine" geleert) ->
            // ein zuvor eingetragenes Freitext-Label ist damit hinfällig.
            const updatePayload = { machine_id: machineId, machine_label: null };
            if (machineId) {
                // Maschine ist bekannt -> der zugehörige Kunde steht damit auch fest, selbst wenn
                // der Kundenmatchcode zuvor nicht eindeutig aufgelöst werden konnte.
                const machine = (window.machineList || []).find(m => String(m.id) === String(machineId));
                if (machine && machine.customer_id) updatePayload.customer_id = machine.customer_id;
            }

            const { data, error } = await window.supabaseClient
                .from('angebote')
                .update(updatePayload)
                .eq('id', angebotId)
                .select('*, customers(name), angebot_notizen(id, content, created_at)')
                .single();

            if (error) throw error;

            const idx = angeboteList.findIndex(x => x.id === angebotId);
            if (idx !== -1) angeboteList[idx] = data;

            await window.syncAngebotMachineHistory(data);
            window.renderAngeboteList();
        } catch (err) {
            console.error('Error assigning machine to Angebot:', err);
            alert('Fehler beim Zuordnen der Maschine: ' + err.message);
        }
    };

    // Freitext-Bezeichnung für Maschinen, die (noch) keinen echten Datensatz in "machines"
    // haben — z.B. weil sich eine volle Anlage nicht lohnt. Schließt sich mit machine_id aus.
    window.commitAngebotMachineFreitext = async function (angebotId, value) {
        const dropdown = document.getElementById('angebot-machine-dropdown-portal');
        if (dropdown) dropdown.style.display = 'none';
        editingAngebotMachineId = null;
        editingAngebotMachineMode = 'search';
        pendingFreitextValue = '';

        if (!window.supabaseClient) return;
        const text = (value || '').trim() || null;
        try {
            const { data, error } = await window.supabaseClient
                .from('angebote')
                .update({ machine_label: text, machine_id: null })
                .eq('id', angebotId)
                .select('*, customers(name), angebot_notizen(id, content, created_at)')
                .single();

            if (error) throw error;

            const idx = angeboteList.findIndex(x => x.id === angebotId);
            if (idx !== -1) angeboteList[idx] = data;

            await window.syncAngebotMachineHistory(data); // kein machine_id -> löscht ggf. alten Historie-Eintrag
            window.renderAngeboteList();
        } catch (err) {
            console.error('Error saving machine label for Angebot:', err);
            alert('Fehler beim Speichern der Maschinenbezeichnung: ' + err.message);
        }
    };

    // Manuelles Bemerkungsfeld pro Beleg (kommt nicht aus dem Sage-Import) — direkt in der
    // Angebote-Liste editierbar. Aktualisiert bei Bedarf auch den zugehörigen Historie-Eintrag.
    window.updateAngebotBemerkung = async function (angebotId, value) {
        if (!window.supabaseClient) return;
        const text = (value || '').trim() || null;
        try {
            const { data, error } = await window.supabaseClient
                .from('angebote')
                .update({ bemerkung: text })
                .eq('id', angebotId)
                .select('*, customers(name), angebot_notizen(id, content, created_at)')
                .single();

            if (error) throw error;

            const idx = angeboteList.findIndex(x => x.id === angebotId);
            if (idx !== -1) angeboteList[idx] = data;

            if (data.machine_id) await window.syncAngebotMachineHistory(data);
        } catch (err) {
            console.error('Error updating Bemerkung:', err);
            alert('Fehler beim Speichern der Bemerkung: ' + err.message);
        }
    };

    // Pflegt den passenden Historie-Eintrag bei der Maschine synchron zur Zuordnung im
    // Angebot: anlegen/aktualisieren, wenn eine Maschine gesetzt ist, sonst löschen.
    window.syncAngebotMachineHistory = async function (angebot) {
        if (!window.supabaseClient || !angebot) return;

        if (!angebot.machine_id) {
            await window.supabaseClient.from('manual_history_entries').delete().eq('angebot_id', angebot.id);
            return;
        }

        const fmtMoney = (v) => (v === null || v === undefined || v === '') ? null : Number(v).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
        const parts = [];
        if (angebot.kundenmatchcode) parts.push(angebot.kundenmatchcode);
        const netto = fmtMoney(angebot.nettobetrag);
        if (netto) parts.push(`Netto: ${netto}`);
        const brutto = fmtMoney(angebot.bruttobetrag);
        if (brutto) parts.push(`Brutto: ${brutto}`);
        if (angebot.bemerkung) parts.push(angebot.bemerkung);

        const payload = {
            angebot_id: angebot.id,
            machine_id: angebot.machine_id,
            type: 'angebot',
            title: `Angebot ${angebot.belegnummer}`,
            content: parts.join(' · '),
            created_by: window.activeUser?.id || null
        };
        if (angebot.belegdatum) payload.created_at = new Date(angebot.belegdatum + 'T12:00:00').toISOString();

        const { error } = await window.supabaseClient
            .from('manual_history_entries')
            .upsert(payload, { onConflict: 'angebot_id' });

        if (error) console.error('Error syncing Angebot history entry:', error);
    };

    // Versucht für alle noch nicht zugeordneten Angebote automatisch erst den Kunden und darauf
    // aufbauend die Maschine zu finden. Phase 1: kundenmatchcode -> customers.matchcode (nur
    // eindeutige Treffer). Phase 2: customer_id -> machines.customer_id (nur wenn der Kunde
    // genau eine Maschine hat). Bei Mehrfach- oder keinen Treffern bleibt die jeweilige
    // Zuordnung der manuellen Auswahl überlassen.
    window.autoAssignAngeboteMachines = async function () {
        if (!window.supabaseClient) return;
        try {
            // --- Phase 1: Kunde anhand des Kundenmatchcodes ermitteln ---
            const { data: unresolvedCustomers, error: custFetchError } = await window.supabaseClient
                .from('angebote')
                .select('id, kundenmatchcode')
                .is('customer_id', null)
                .not('kundenmatchcode', 'is', null);

            if (custFetchError) throw custFetchError;

            if (unresolvedCustomers && unresolvedCustomers.length > 0) {
                const matchcodes = [...new Set(unresolvedCustomers.map(a => (a.kundenmatchcode || '').trim()).filter(Boolean))];

                if (matchcodes.length > 0) {
                    // Alle Kunden mit Matchcode laden (nicht per .in() exakt filtern) und in JS
                    // case-insensitiv vergleichen — Sage liefert Groß-/Kleinschreibung zwischen
                    // Beleg- und Adressexport nicht immer identisch, ein exakter DB-Vergleich
                    // würde solche Belege sonst dauerhaft unaufgelöst lassen.
                    const { data: customers, error: custError } = await window.supabaseClient
                        .from('customers')
                        .select('id, matchcode')
                        .not('matchcode', 'is', null);

                    if (custError) throw custError;

                    if (customers && customers.length > 0) {
                        const normalizeMatchcode = (s) => (s || '').toString().trim().toLowerCase().replace(/\s+/g, ' ');
                        const customerIdsByMatchcode = {};
                        customers.forEach(c => {
                            const key = normalizeMatchcode(c.matchcode);
                            if (!key) return;
                            if (!customerIdsByMatchcode[key]) customerIdsByMatchcode[key] = [];
                            customerIdsByMatchcode[key].push(c.id);
                        });

                        for (const angebot of unresolvedCustomers) {
                            const key = normalizeMatchcode(angebot.kundenmatchcode);
                            const customerIds = customerIdsByMatchcode[key] || [];
                            if (customerIds.length !== 1) continue; // Matchcode nicht eindeutig einem Kunden zuordenbar

                            const { error: updError } = await window.supabaseClient
                                .from('angebote')
                                .update({ customer_id: customerIds[0] })
                                .eq('id', angebot.id);

                            if (updError) console.error('Error auto-assigning customer to Angebot:', updError);
                        }
                    }
                }
            }

            // --- Phase 2: Maschine anhand des (ggf. gerade ermittelten) Kunden finden ---
            const { data: unresolvedMachines, error: machFetchError } = await window.supabaseClient
                .from('angebote')
                .select('id, customer_id')
                .is('machine_id', null)
                .not('customer_id', 'is', null);

            if (machFetchError) throw machFetchError;
            if (!unresolvedMachines || unresolvedMachines.length === 0) return;

            const customerIds = [...new Set(unresolvedMachines.map(a => a.customer_id))];
            const { data: machines, error: machError } = await window.supabaseClient
                .from('machines')
                .select('id, customer_id')
                .in('customer_id', customerIds);

            if (machError) throw machError;

            const machineIdsByCustomer = {};
            (machines || []).forEach(m => {
                if (!m.customer_id) return;
                if (!machineIdsByCustomer[m.customer_id]) machineIdsByCustomer[m.customer_id] = [];
                machineIdsByCustomer[m.customer_id].push(m.id);
            });

            for (const angebot of unresolvedMachines) {
                const machineIds = machineIdsByCustomer[angebot.customer_id] || [];
                if (machineIds.length !== 1) continue; // Kunde hat keine oder mehrere Maschinen -> manuell zuordnen

                const { data: updated, error: updError } = await window.supabaseClient
                    .from('angebote')
                    .update({ machine_id: machineIds[0] })
                    .eq('id', angebot.id)
                    .select()
                    .single();

                if (updError) {
                    console.error('Error auto-assigning machine to Angebot:', updError);
                    continue;
                }
                await window.syncAngebotMachineHistory(updated);
            }
        } catch (err) {
            console.error('Error in autoAssignAngeboteMachines:', err);
        }
    };

    // Springt aus der Maschinenhistorie zurück zur Angebote-Liste und filtert direkt auf den
    // jeweiligen Beleg (per Belegnummer), damit der Eintrag dort einfach wiedergefunden wird.
    window.navigateToAngebot = function (angebotId) {
        if (!angebotId) return;
        const angebot = angeboteList.find(a => a.id === angebotId);
        if (typeof window.closeHistoryModal === 'function') window.closeHistoryModal();
        if (typeof window.switchView === 'function') window.switchView('listen');
        if (typeof window.switchListenTab === 'function') window.switchListenTab('angebote');
        setTimeout(() => {
            const searchInput = document.getElementById('angebote-search-input');
            if (searchInput && angebot) {
                searchInput.value = angebot.belegnummer;
                window.renderAngeboteList();
            }
        }, 50);
    };

    function escapeHtml(str) {
        return String(str || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    // ==========================================
    // ANGEBOTE: DYNAMIC EXCEL/CSV PARSER & SAGE IMPORT
    // (Aufbau analog zum Adressimport in customers.js)
    // ==========================================
    function setupAngeboteImportListeners() {
        const dropzone = document.getElementById('angebote-import-dropzone');
        const fileInput = document.getElementById('angebote-import-input');
        if (!dropzone || !fileInput) return;

        dropzone.addEventListener('click', () => fileInput.click());

        dropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropzone.style.borderColor = 'var(--color-primary-green)';
            dropzone.style.background = 'rgba(0, 150, 64, 0.05)';
        });

        dropzone.addEventListener('dragleave', () => {
            dropzone.style.borderColor = 'rgba(255,255,255,0.15)';
            dropzone.style.background = 'rgba(255,255,255,0.02)';
        });

        dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropzone.style.borderColor = 'rgba(255,255,255,0.15)';
            dropzone.style.background = 'rgba(255,255,255,0.02)';
            if (e.dataTransfer.files.length > 0) {
                handleAngeboteImportFile(e.dataTransfer.files[0]);
            }
        });

        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                handleAngeboteImportFile(e.target.files[0]);
            }
        });
    }

    async function handleAngeboteImportFile(file) {
        const ext = file.name.split('.').pop().toLowerCase();
        if (ext === 'xlsx' || ext === 'xls') {
            await parseAngeboteExcelFile(file);
        } else if (ext === 'csv') {
            await parseAngeboteCSVFile(file);
        } else {
            alert('Bitte wählen Sie eine gültige Excel- (.xlsx, .xls) oder CSV-Datei (.csv) aus.');
        }
    }

    async function parseAngeboteExcelFile(file) {
        try {
            const dropzone = document.getElementById('angebote-import-dropzone');
            const originalHtml = dropzone.innerHTML;
            dropzone.innerHTML = `
                <div style="display:flex; flex-direction:column; align-items:center; gap:12px;">
                    <div class="loading-spinner" style="border:4px solid rgba(255,255,255,0.1); border-top:4px solid var(--color-primary-green); border-radius:50%; width:32px; height:32px; animation:spin 1s linear infinite;"></div>
                    <span>Lade Excel-Bibliothek und verarbeite Datei...</span>
                </div>
            `;

            // SheetJS wird bereits von customers.js geladen/zwischengespeichert
            if (typeof window.loadXLSXLibrary === 'function') {
                await window.loadXLSXLibrary();
            }

            const reader = new FileReader();
            reader.onload = function (e) {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];
                    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

                    if (jsonData.length === 0) {
                        throw new Error('Die Excel-Datei scheint leer zu sein.');
                    }

                    angeboteHeaders = jsonData[0].map(h => h ? h.toString().trim() : '');
                    angeboteRows = jsonData.slice(1).filter(r => r.length > 0 && r.some(cell => cell !== null && cell !== undefined && cell !== ''));

                    showAngeboteMappingConfig();
                } catch (err) {
                    alert('Fehler beim Lesen der Excel-Datei: ' + err.message);
                    dropzone.innerHTML = originalHtml;
                }
            };
            reader.readAsArrayBuffer(file);
        } catch (err) {
            alert(err.message);
            window.resetAngeboteImportUI();
        }
    }

    async function parseAngeboteCSVFile(file) {
        const reader = new FileReader();
        reader.onload = function (e) {
            try {
                const buffer = e.target.result;
                let text;
                try {
                    const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
                    text = utf8Decoder.decode(buffer);
                } catch (utf8Err) {
                    const ansiDecoder = new TextDecoder('windows-1252');
                    text = ansiDecoder.decode(buffer);
                }

                const lines = text.split(/\r?\n/);
                if (lines.length === 0 || (lines.length === 1 && lines[0] === '')) {
                    throw new Error('Die CSV-Datei scheint leer zu sein.');
                }

                const firstLine = lines[0];
                const semicolonCount = (firstLine.match(/;/g) || []).length;
                const commaCount = (firstLine.match(/,/g) || []).length;
                const delimiter = semicolonCount >= commaCount ? ';' : ',';

                const parsedData = lines.map(line => {
                    const result = [];
                    let current = '';
                    let inQuotes = false;
                    for (let i = 0; i < line.length; i++) {
                        const char = line[i];
                        if (char === '"') {
                            inQuotes = !inQuotes;
                        } else if (char === delimiter && !inQuotes) {
                            result.push(current.trim().replace(/^"|"$/g, ''));
                            current = '';
                        } else {
                            current += char;
                        }
                    }
                    result.push(current.trim().replace(/^"|"$/g, ''));
                    return result;
                }).filter(row => row.length > 0 && row.some(cell => cell !== ''));

                if (parsedData.length === 0) {
                    throw new Error('Es konnten keine gültigen Zeilen in der CSV gefunden werden.');
                }

                angeboteHeaders = parsedData[0];
                angeboteRows = parsedData.slice(1);

                showAngeboteMappingConfig();
            } catch (err) {
                alert('Fehler beim Parsen der CSV-Datei: ' + err.message);
                window.resetAngeboteImportUI();
            }
        };
        reader.readAsArrayBuffer(file);
    }

    function showAngeboteMappingConfig() {
        const dropzone = document.getElementById('angebote-import-dropzone');
        const configSection = document.getElementById('angebote-import-config-section');
        const statsEl = document.getElementById('angebote-import-stats');

        if (dropzone) dropzone.classList.add('hidden');
        if (configSection) configSection.classList.remove('hidden');
        if (statsEl) statsEl.textContent = `${angeboteRows.length} Angebote zum Import bereit.`;

        const dropdownIds = ['map-angebot-belegnummer', 'map-angebot-belegdatum', 'map-angebot-matchcode', 'map-angebot-netto', 'map-angebot-brutto'];

        dropdownIds.forEach(id => {
            const select = document.getElementById(id);
            if (!select) return;

            select.innerHTML = '<option value="">-- Nicht zugeordnet --</option>';
            angeboteHeaders.forEach((header, index) => {
                const opt = document.createElement('option');
                opt.value = index;
                opt.textContent = `${header} (Spalte ${index + 1})`;
                select.appendChild(opt);
            });

            const defaultIndex = findAngeboteMatchingHeaderIndex(id, angeboteHeaders);
            if (defaultIndex !== -1) select.value = defaultIndex;
        });
    }

    function findAngeboteMatchingHeaderIndex(fieldId, headers) {
        const mappingKeywords = {
            'map-angebot-belegnummer': ['belegnummer', 'beleg-nr', 'belegnr', 'angebotsnummer', 'angebot-nr', 'nummer'],
            'map-angebot-belegdatum': ['belegdatum', 'beleg-datum', 'datum', 'angebotsdatum'],
            'map-angebot-matchcode': ['match', 'matchcode', 'kundenmatchcode', 'suchbegriff', 'kurzname'],
            'map-angebot-netto': ['netto', 'nettobetrag', 'netto-betrag', 'net amount'],
            'map-angebot-brutto': ['brutto', 'bruttobetrag', 'brutto-betrag', 'gross amount']
        };

        const keywords = mappingKeywords[fieldId] || [];
        for (let i = 0; i < headers.length; i++) {
            const h = (headers[i] || '').toLowerCase();
            if (keywords.includes(h)) return i;
            if (keywords.some(kw => h.includes(kw))) return i;
        }
        return -1;
    }

    window.cancelAngeboteImport = function () {
        window.resetAngeboteImportUI();
    };

    window.resetAngeboteImportUI = function () {
        angeboteHeaders = [];
        angeboteRows = [];

        const dropzone = document.getElementById('angebote-import-dropzone');
        const configSection = document.getElementById('angebote-import-config-section');
        const progressSection = document.getElementById('angebote-import-progress-section');
        const resultSection = document.getElementById('angebote-import-result-section');
        const fileInput = document.getElementById('angebote-import-input');

        if (dropzone) {
            dropzone.classList.remove('hidden');
            dropzone.innerHTML = `
                <input type="file" id="angebote-import-input" accept=".csv, .xls, .xlsx" class="hidden-file-input" style="display: none;">
                <div style="display: flex; flex-direction: column; align-items: center; gap: 12px;">
                    <span style="font-size: 3rem;">📥</span>
                    <span style="font-weight: 700; color: #fff; font-size: 1.1rem;">Datei auswählen oder hierher ziehen</span>
                    <span style="font-size: 0.85rem; color: rgba(255,255,255,0.4);">Unterstützte Formate: Excel (.xlsx, .xls) oder CSV (.csv)</span>
                </div>
            `;
            setupAngeboteImportListeners();
        }
        if (fileInput) fileInput.value = '';
        if (configSection) configSection.classList.add('hidden');
        if (progressSection) progressSection.classList.add('hidden');
        if (resultSection) resultSection.classList.add('hidden');
    };

    // Sage-Datumsformate (z.B. 31.12.2025 oder 2025-12-31) nach ISO (YYYY-MM-DD) wandeln
    function parseGermanDate(str) {
        if (!str) return null;
        const s = str.toString().trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
        const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
        if (m) {
            let [, d, mo, y] = m;
            if (y.length === 2) y = '20' + y;
            return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
        }
        return null;
    }

    // Deutsche Zahlenformate (1.234,56 oder 1234,56) nach Standard-Dezimalzahl wandeln
    function parseGermanNumber(str) {
        if (str === null || str === undefined || str === '') return null;
        if (typeof str === 'number') return str;
        let s = str.toString().trim().replace(/[€\s]/g, '');
        if (s === '') return null;
        if (s.includes(',')) {
            s = s.replace(/\./g, '').replace(',', '.');
        }
        const n = parseFloat(s);
        return isNaN(n) ? null : n;
    }

    window.executeAngeboteImport = async function () {
        const configSection = document.getElementById('angebote-import-config-section');
        const progressSection = document.getElementById('angebote-import-progress-section');
        const progressBar = document.getElementById('angebote-import-progress-bar');
        const progressDetails = document.getElementById('angebote-import-progress-details');
        const resultSection = document.getElementById('angebote-import-result-section');
        const resultMessage = document.getElementById('angebote-import-result-message');

        const mapBelegnummer = document.getElementById('map-angebot-belegnummer').value;
        const mapBelegdatum = document.getElementById('map-angebot-belegdatum').value;
        const mapMatchcode = document.getElementById('map-angebot-matchcode').value;
        const mapNetto = document.getElementById('map-angebot-netto').value;
        const mapBrutto = document.getElementById('map-angebot-brutto').value;

        if (mapBelegnummer === '') {
            alert('Das Feld "Belegnummer" ist Pflichtfeld und muss zugeordnet werden.');
            return;
        }

        if (configSection) configSection.classList.add('hidden');
        if (progressSection) progressSection.classList.remove('hidden');

        const angeboteToUpsert = [];
        angeboteRows.forEach(row => {
            const belegnummer = row[mapBelegnummer]?.toString().trim();
            if (!belegnummer) return; // Skip invalid rows

            angeboteToUpsert.push({
                belegnummer: belegnummer,
                belegdatum: mapBelegdatum !== '' ? parseGermanDate(row[mapBelegdatum]) : null,
                kundenmatchcode: mapMatchcode !== '' ? (row[mapMatchcode]?.toString().trim() || null) : null,
                nettobetrag: mapNetto !== '' ? parseGermanNumber(row[mapNetto]) : null,
                bruttobetrag: mapBrutto !== '' ? parseGermanNumber(row[mapBrutto]) : null
            });
        });

        if (angeboteToUpsert.length === 0) {
            alert('Keine gültigen Zeilen mit Belegnummer zum Importieren gefunden.');
            window.resetAngeboteImportUI();
            return;
        }

        try {
            if (!window.supabaseClient) throw new Error('Supabase Client nicht initialisiert');

            const chunkSize = 100;
            const total = angeboteToUpsert.length;

            for (let i = 0; i < total; i += chunkSize) {
                const chunk = angeboteToUpsert.slice(i, i + chunkSize);

                const { error } = await window.supabaseClient
                    .from('angebote')
                    .upsert(chunk, { onConflict: 'belegnummer' });

                if (error) throw error;

                const progress = Math.min(100, Math.round(((i + chunk.length) / total) * 100));
                if (progressBar) progressBar.style.width = `${progress}%`;
                if (progressDetails) progressDetails.textContent = `${Math.min(total, i + chunk.length)} von ${total} verarbeitet...`;
            }

            if (progressSection) progressSection.classList.add('hidden');
            if (resultSection) resultSection.classList.remove('hidden');
            if (resultMessage) {
                resultMessage.textContent = `Erfolgreich ${total} Angebote aus Sage 100 importiert und aktualisiert.`;
            }

            window.fetchAngebote();
        } catch (err) {
            alert('Fehler beim Datenbankimport: ' + err.message);
            window.resetAngeboteImportUI();
        }
    };

})();
