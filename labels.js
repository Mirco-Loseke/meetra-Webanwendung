// labels.js — Etikettendrucker: Artikel verwalten, per CSV/Excel importieren,
// Etiketten (Artikelnummer, 2 Bezeichnungen, Barcode, Mini-Logo) als PDF drucken.
(function () {
    'use strict';

    let labelArticles = [];
    let selectedLabelIds = new Set();
    let importParsedHeaders = [];
    let importParsedRows = [];

    // Menge & Mengeneinheit pro Artikel — nur für den Druck, wird NICHT in der Datenbank
    // gespeichert (rein flüchtiger UI-Zustand, geht beim Neuladen verloren).
    let labelQuantities = {}; // { [articleId]: { qty: number, unit: string } }
    function getLabelQty(id) {
        return labelQuantities[id] || { qty: 1, unit: '' };
    }

    // "Mehrere" — eigenständiges Feld, das NUR die Druckanzahl steuert (wie oft dasselbe
    // Etikett hintereinander gedruckt wird), unabhängig von Menge/Einheit.
    let labelRepeatCounts = {}; // { [articleId]: number }
    function getLabelRepeatCount(id) {
        return labelRepeatCounts[id] || 1;
    }

    window.fetchLabelArticles = async function () {
        const container = document.getElementById('label-articles-container');
        if (!window.supabaseClient) return;

        if (container) container.innerHTML = '<div style="text-align:center; color:rgba(255,255,255,0.4); padding:2rem;">Lade Artikel...</div>';

        const { data, error } = await window.supabaseClient
            .from('label_articles')
            .select('*')
            .order('article_number', { ascending: true });

        if (error) {
            console.error('Error fetching label articles:', error);
            if (container) container.innerHTML = `<div style="text-align:center; color:rgba(255,200,200,0.8); padding:2rem;">Fehler beim Laden: ${error.message}</div>`;
            return;
        }

        labelArticles = data || [];
        window.renderLabelArticles();
    };

    window.renderLabelArticles = function () {
        const container = document.getElementById('label-articles-container');
        if (!container) return;

        const searchInput = document.getElementById('label-search-input');
        const term = searchInput ? searchInput.value.trim().toLowerCase() : '';

        let entries = labelArticles;
        if (term) {
            entries = entries.filter(a =>
                (a.article_number || '').toLowerCase().includes(term) ||
                (a.bezeichnung_1 || '').toLowerCase().includes(term) ||
                (a.bezeichnung_2 || '').toLowerCase().includes(term)
            );
        }

        if (entries.length === 0) {
            container.innerHTML = `
                <div class="empty-state" style="text-align:center; padding:4rem 2rem; background: rgba(255,255,255,0.02); border-radius: 20px; border: 1px dashed rgba(255,255,255,0.1);">
                    <p style="color: rgba(255,255,255,0.4); font-size: 1.05rem;">Keine Artikel gefunden.</p>
                </div>`;
            updateLabelSelectedCount();
            return;
        }

        container.innerHTML = entries.map(a => {
            const checked = selectedLabelIds.has(a.id) ? 'checked' : '';
            const q = getLabelQty(a.id);
            const repeatCount = getLabelRepeatCount(a.id);
            return `
                <div class="label-article-row" style="display:flex; align-items:center; gap:14px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 12px 16px;">
                    <input type="checkbox" ${checked} onchange="window.toggleLabelSelection(${a.id}, this.checked)" style="width:18px; height:18px; cursor:pointer; flex-shrink:0;" title="Für Druck auswählen">
                    <div style="flex: 1; min-width: 0;">
                        <div style="color:#ef4444; font-weight:800; font-size:0.95rem;">${escapeHtml(a.article_number)}</div>
                        <div style="color:#fff; font-size:0.88rem; margin-top:2px;">${escapeHtml(a.bezeichnung_1 || '')}</div>
                        ${a.bezeichnung_2 ? `<div style="color:rgba(255,255,255,0.5); font-size:0.8rem; margin-top:1px;">${escapeHtml(a.bezeichnung_2)}</div>` : ''}
                    </div>
                    <div style="display:flex; flex-direction:column; align-items:center; gap:3px; flex-shrink:0;">
                        <label style="font-size:0.62rem; color:rgba(255,255,255,0.35); text-transform:uppercase; letter-spacing:0.4px;">Menge</label>
                        <input type="number" min="1" value="${q.qty}" onchange="window.updateLabelQty(${a.id}, this.value)" class="glass-form-input" style="width:54px; height:32px; text-align:center; padding: 0 4px;">
                    </div>
                    <div style="display:flex; flex-direction:column; align-items:center; gap:3px; flex-shrink:0;">
                        <label style="font-size:0.62rem; color:rgba(255,255,255,0.35); text-transform:uppercase; letter-spacing:0.4px;">Einheit</label>
                        <input type="text" value="${escapeHtml(q.unit)}" placeholder="stk" onchange="window.updateLabelUnit(${a.id}, this.value)" class="glass-form-input" style="width:64px; height:32px; text-align:center; padding: 0 4px;">
                    </div>
                    <div style="display:flex; flex-direction:column; align-items:center; gap:3px; flex-shrink:0;">
                        <label style="font-size:0.62rem; color:rgba(255,255,255,0.35); text-transform:uppercase; letter-spacing:0.4px;">Mehrere</label>
                        <input type="number" min="1" value="${repeatCount}" onchange="window.updateLabelRepeatCount(${a.id}, this.value)" class="glass-form-input" style="width:54px; height:32px; text-align:center; padding: 0 4px;" title="Wie oft dasselbe Etikett gedruckt werden soll">
                    </div>
                    <div style="display:flex; gap:8px; flex-shrink:0;">
                        <button onclick="window.openLabelArticleModal(${a.id})" class="btn-icon-soft" title="Bearbeiten" style="background: rgba(255,255,255,0.05); color: #60a5fa; border: 1px solid rgba(255,255,255,0.1); width: 34px; height: 34px; border-radius: 8px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center;">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4Z"></path></svg>
                        </button>
                        <button onclick="window.deleteLabelArticle(${a.id})" class="btn-icon-soft" title="Löschen" style="background: rgba(255,255,255,0.05); color: #ef4444; border: 1px solid rgba(255,255,255,0.1); width: 34px; height: 34px; border-radius: 8px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center;">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        </button>
                    </div>
                </div>`;
        }).join('');

        updateLabelSelectedCount();
    };

    window.updateLabelQty = function (id, value) {
        let qty = parseInt(value, 10);
        if (isNaN(qty) || qty < 1) qty = 1;
        const current = getLabelQty(id);
        labelQuantities[id] = { qty, unit: current.unit };
    };

    window.updateLabelRepeatCount = function (id, value) {
        let n = parseInt(value, 10);
        if (isNaN(n) || n < 1) n = 1;
        labelRepeatCounts[id] = n;
    };

    window.updateLabelUnit = function (id, value) {
        const current = getLabelQty(id);
        labelQuantities[id] = { qty: current.qty, unit: value || '' };
    };

    function escapeHtml(str) {
        return String(str || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    window.toggleLabelSelection = function (id, checked) {
        if (checked) selectedLabelIds.add(id); else selectedLabelIds.delete(id);
        updateLabelSelectedCount();
    };

    window.toggleAllLabelSelection = function (checked) {
        if (checked) labelArticles.forEach(a => selectedLabelIds.add(a.id));
        else selectedLabelIds.clear();
        window.renderLabelArticles();
    };

    function updateLabelSelectedCount() {
        const el = document.getElementById('label-selected-count');
        if (el) el.textContent = `${selectedLabelIds.size} ausgewählt`;
    }

    // ── Add / Edit Modal ────────────────────────────────────────────
    window.openLabelArticleModal = function (id) {
        const modal = document.getElementById('label-article-modal');
        const title = document.getElementById('label-article-modal-title');
        const idField = document.getElementById('label-article-id');
        const numField = document.getElementById('label-article-number');
        const bez1Field = document.getElementById('label-article-bez1');
        const bez2Field = document.getElementById('label-article-bez2');

        if (id) {
            const article = labelArticles.find(a => a.id === id);
            if (!article) return;
            title.textContent = 'Artikel bearbeiten';
            idField.value = article.id;
            numField.value = article.article_number || '';
            bez1Field.value = article.bezeichnung_1 || '';
            bez2Field.value = article.bezeichnung_2 || '';
        } else {
            title.textContent = 'Artikel anlegen';
            idField.value = '';
            numField.value = '';
            bez1Field.value = '';
            bez2Field.value = '';
        }

        modal.style.display = 'flex';
    };

    window.closeLabelArticleModal = function () {
        document.getElementById('label-article-modal').style.display = 'none';
    };

    window.saveLabelArticle = async function () {
        const id = document.getElementById('label-article-id').value;
        const articleNumber = document.getElementById('label-article-number').value.trim();
        const bez1 = document.getElementById('label-article-bez1').value.trim();
        const bez2 = document.getElementById('label-article-bez2').value.trim();

        if (!articleNumber) {
            alert('Bitte eine Artikelnummer eingeben.');
            return;
        }
        if (!/^[0-9]{1,8}$/.test(articleNumber)) {
            alert('Die Artikelnummer darf nur aus Ziffern bestehen (max. 8 Stellen).');
            return;
        }

        const payload = { article_number: articleNumber, bezeichnung_1: bez1 || null, bezeichnung_2: bez2 || null };

        try {
            if (id) {
                const { error } = await window.supabaseClient.from('label_articles').update(payload).eq('id', id);
                if (error) throw error;
            } else {
                const { error } = await window.supabaseClient.from('label_articles').insert([payload]);
                if (error) throw error;
            }
            window.closeLabelArticleModal();
            await window.fetchLabelArticles();
        } catch (err) {
            console.error('Error saving label article:', err);
            alert('Fehler beim Speichern: ' + err.message);
        }
    };

    window.deleteLabelArticle = async function (id) {
        if (!confirm('Diesen Artikel wirklich löschen?')) return;
        try {
            const { error } = await window.supabaseClient.from('label_articles').delete().eq('id', id);
            if (error) throw error;
            selectedLabelIds.delete(id);
            await window.fetchLabelArticles();
        } catch (err) {
            console.error('Error deleting label article:', err);
            alert('Fehler beim Löschen: ' + err.message);
        }
    };

    // ── CSV / Excel Import ──────────────────────────────────────────
    window.openLabelImportModal = function () {
        document.getElementById('label-import-modal').style.display = 'flex';
        document.getElementById('label-import-mapping').classList.add('hidden');
        document.getElementById('label-import-dropzone').classList.remove('hidden');
        document.getElementById('label-import-input').value = '';
        setupLabelImportListeners();
    };

    window.closeLabelImportModal = function () {
        document.getElementById('label-import-modal').style.display = 'none';
    };

    let labelImportListenersBound = false;
    function setupLabelImportListeners() {
        if (labelImportListenersBound) return;
        labelImportListenersBound = true;

        const dropzone = document.getElementById('label-import-dropzone');
        const fileInput = document.getElementById('label-import-input');

        dropzone.addEventListener('click', () => fileInput.click());
        dropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropzone.style.borderColor = '#ec4899';
            dropzone.style.background = 'rgba(236,72,153,0.05)';
        });
        dropzone.addEventListener('dragleave', () => {
            dropzone.style.borderColor = 'rgba(255,255,255,0.15)';
            dropzone.style.background = 'transparent';
        });
        dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropzone.style.borderColor = 'rgba(255,255,255,0.15)';
            dropzone.style.background = 'transparent';
            if (e.dataTransfer.files.length > 0) handleLabelImportFile(e.dataTransfer.files[0]);
        });
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) handleLabelImportFile(e.target.files[0]);
        });
    }

    async function handleLabelImportFile(file) {
        const ext = file.name.split('.').pop().toLowerCase();
        if (ext === 'xlsx' || ext === 'xls') {
            await parseLabelExcelFile(file);
        } else if (ext === 'csv') {
            await parseLabelCSVFile(file);
        } else {
            alert('Bitte eine gültige Excel- (.xlsx, .xls) oder CSV-Datei (.csv) auswählen.');
        }
    }

    async function parseLabelExcelFile(file) {
        try {
            await window.loadXLSXLibrary();
            const reader = new FileReader();
            reader.onload = function (e) {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const sheet = workbook.Sheets[workbook.SheetNames[0]];
                    const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 });
                    if (jsonData.length === 0) throw new Error('Die Excel-Datei scheint leer zu sein.');

                    importParsedHeaders = jsonData[0].map(h => h ? h.toString().trim() : '');
                    importParsedRows = jsonData.slice(1).filter(r => r.length > 0 && r.some(c => c !== null && c !== undefined && c !== ''));
                    showLabelImportMapping();
                } catch (err) {
                    alert('Fehler beim Lesen der Excel-Datei: ' + err.message);
                }
            };
            reader.readAsArrayBuffer(file);
        } catch (err) {
            alert(err.message);
        }
    }

    async function parseLabelCSVFile(file) {
        const reader = new FileReader();
        reader.onload = function (e) {
            try {
                const buffer = e.target.result;
                let text;
                try {
                    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
                } catch (utf8Err) {
                    text = new TextDecoder('windows-1252').decode(buffer);
                }

                const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
                if (lines.length === 0) throw new Error('Die CSV-Datei scheint leer zu sein.');

                const semicolonCount = (lines[0].match(/;/g) || []).length;
                const commaCount = (lines[0].match(/,/g) || []).length;
                const delimiter = semicolonCount >= commaCount ? ';' : ',';

                const splitLine = (line) => {
                    const result = [];
                    let cur = '';
                    let inQuotes = false;
                    for (let i = 0; i < line.length; i++) {
                        const ch = line[i];
                        if (ch === '"') { inQuotes = !inQuotes; continue; }
                        if (ch === delimiter && !inQuotes) { result.push(cur); cur = ''; continue; }
                        cur += ch;
                    }
                    result.push(cur);
                    return result.map(c => c.trim());
                };

                importParsedHeaders = splitLine(lines[0]);
                importParsedRows = lines.slice(1).map(splitLine);
                showLabelImportMapping();
            } catch (err) {
                alert('Fehler beim Lesen der CSV-Datei: ' + err.message);
            }
        };
        reader.readAsArrayBuffer(file);
    }

    function showLabelImportMapping() {
        document.getElementById('label-import-dropzone').classList.add('hidden');
        const mappingEl = document.getElementById('label-import-mapping');
        mappingEl.classList.remove('hidden');

        const fields = [
            { key: 'article_number', label: 'Artikelnummer', required: true },
            { key: 'bezeichnung_1', label: 'Bezeichnung 1', required: false },
            { key: 'bezeichnung_2', label: 'Bezeichnung 2', required: false }
        ];

        const fieldsContainer = document.getElementById('label-import-mapping-fields');
        fieldsContainer.innerHTML = fields.map((f, idx) => `
            <div style="display:flex; align-items:center; gap:12px;">
                <label style="flex: 0 0 140px; font-size:0.85rem; color:rgba(255,255,255,0.7); font-weight:600;">${f.label}${f.required ? ' *' : ''}</label>
                <select id="label-import-map-${f.key}" class="glass-input" style="flex:1; height:42px;">
                    <option value="">— nicht zuordnen —</option>
                    ${importParsedHeaders.map((h, i) => `<option value="${i}" ${i === idx ? 'selected' : ''}>${escapeHtml(h || `Spalte ${i + 1}`)}</option>`).join('')}
                </select>
            </div>
        `).join('') + `<p style="font-size:0.78rem; color:rgba(255,255,255,0.35); margin-top:0.5rem;">${importParsedRows.length} Zeile${importParsedRows.length !== 1 ? 'n' : ''} gefunden.</p>`;
    }

    window.confirmLabelImport = async function () {
        const numIdx = document.getElementById('label-import-map-article_number').value;
        const bez1Idx = document.getElementById('label-import-map-bezeichnung_1').value;
        const bez2Idx = document.getElementById('label-import-map-bezeichnung_2').value;

        if (numIdx === '') {
            alert('Bitte die Spalte für die Artikelnummer zuordnen.');
            return;
        }

        const rows = importParsedRows
            .map(r => ({
                article_number: (r[numIdx] != null ? String(r[numIdx]).trim() : ''),
                bezeichnung_1: bez1Idx !== '' && r[bez1Idx] != null ? String(r[bez1Idx]).trim() : null,
                bezeichnung_2: bez2Idx !== '' && r[bez2Idx] != null ? String(r[bez2Idx]).trim() : null
            }))
            .filter(r => r.article_number !== '');

        if (rows.length === 0) {
            alert('Keine gültigen Zeilen mit Artikelnummer gefunden.');
            return;
        }

        try {
            const { error } = await window.supabaseClient.from('label_articles').insert(rows);
            if (error) throw error;
            window.closeLabelImportModal();
            await window.fetchLabelArticles();
            alert(`${rows.length} Artikel erfolgreich importiert.`);
        } catch (err) {
            console.error('Error importing label articles:', err);
            alert('Fehler beim Importieren: ' + err.message);
        }
    };

    // ── Print Labels (PDF with barcode + mini logo) ─────────────────
    async function loadJsBarcode() {
        if (window.JsBarcode) return;
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'lib/jsbarcode.min.js';
            script.onload = () => resolve();
            script.onerror = () => reject(new Error('Barcode-Bibliothek konnte nicht geladen werden.'));
            document.head.appendChild(script);
        });
    }

    function generateBarcodeDataUrl(value) {
        const canvas = document.createElement('canvas');
        window.JsBarcode(canvas, value, {
            format: 'CODE128',
            displayValue: false,
            margin: 0,
            height: 40,
            width: 2
        });
        return canvas.toDataURL('image/png');
    }

    // Logo schwarz/weiß (Graustufen) aus dem eingebetteten Base64 (meetra_logo_base64.js) laden —
    // kein Datei-Fetch nötig, also keine Pfad-/Deploy-Abhängigkeit. Liefert auch das echte
    // Breite/Höhe-Verhältnis mit, damit das Logo beim Drucken nicht verzerrt wird.
    function loadEmbeddedLogoGrayscale() {
        return new Promise((resolve, reject) => {
            if (!window.MEETRA_LOGO_BASE64) { reject(new Error('Logo-Daten nicht gefunden (meetra_logo_base64.js nicht geladen).')); return; }
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.naturalWidth;
                canvas.height = img.naturalHeight;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const d = imgData.data;
                for (let i = 0; i < d.length; i += 4) {
                    const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
                    d[i] = d[i + 1] = d[i + 2] = gray;
                }
                ctx.putImageData(imgData, 0, 0);
                resolve({ url: canvas.toDataURL('image/png'), ratio: img.naturalWidth / img.naturalHeight });
            };
            img.onerror = () => reject(new Error('Logo konnte nicht verarbeitet werden.'));
            img.src = window.MEETRA_LOGO_BASE64;
        });
    }

    // Logo in Farbe (für die Beschriftung — auf den kleinen Etiketten bleibt es schwarz/weiß)
    function loadEmbeddedLogoColor() {
        return new Promise((resolve, reject) => {
            if (!window.MEETRA_LOGO_BASE64) { reject(new Error('Logo-Daten nicht gefunden (meetra_logo_base64.js nicht geladen).')); return; }
            const img = new Image();
            img.onload = () => resolve({ url: window.MEETRA_LOGO_BASE64, ratio: img.naturalWidth / img.naturalHeight });
            img.onerror = () => reject(new Error('Logo konnte nicht geladen werden.'));
            img.src = window.MEETRA_LOGO_BASE64;
        });
    }

    // Etiketten-Formate zur Auswahl.
    // mode "sheet": Raster mehrerer Etiketten auf einer Seite (mit Start-Position). pageFormat
    // kann ein jsPDF-Name ('a4') oder eine eigene [Breite,Höhe]-Größe sein, falls der reale
    // Bogen nicht exakt einem ISO-Format entspricht (z.B. "A5" hier ist breiter als echtes A5).
    // mode "single": ein Etikett = eine PDF-Seite in exakter Etikettengröße — für Rollendrucker
    // wie den DYMO LabelWriter, der keine A4/A5-Blätter, sondern einzelne Etiketten direkt bedruckt.
    const LABEL_PRESETS = {
        a5_80: {
            label: 'A5 - 38 x 19mm (80 Etiketten)',
            mode: 'sheet',
            pageFormat: [156, 210], // realer Bogen ist etwas breiter als echtes ISO-A5 (148mm),
            pageW: 156, pageH: 210, // sonst passt die 4. Spalte nicht vollständig auf die Seite
            labelW: 38, labelH: 19,
            cols: 4, rows: 10
        },
        a4_65: {
            label: 'A4 - 38,1 x 21,2mm (65 Etiketten)',
            mode: 'sheet',
            pageFormat: 'a4',
            pageW: 210, pageH: 297,
            labelW: 38.1, labelH: 21.2,
            cols: 5, rows: 13
        },
        dymo_duo: {
            label: 'DYMO LabelWriter Duo - 89 x 36mm',
            mode: 'single',
            labelW: 89, labelH: 36,
            cols: 1, rows: 1
        }
    };

    let currentFormatKey = 'a5_80';
    function getFormat() { return LABEL_PRESETS[currentFormatKey]; }

    // Verteilt den gesamten ungenutzten Platz gleichmäßig auf Außenrand UND alle Zwischenräume
    // (statt nur außen einen Rand zu lassen) — so liegt die letzte Reihe/Spalte ganz knapp an
    // der Kante, genau wie auf den echten Etikettenbögen mit gleichmäßigen Lücken zwischen
    // jedem Etikett.
    function computeGaps(format) {
        const gapX = (format.pageW - format.cols * format.labelW) / (format.cols + 1);
        const gapY = (format.pageH - format.rows * format.labelH) / (format.rows + 1);
        return { gapX, gapY };
    }

    // ── Live-Vorschau (reines HTML/CSS, keine PDF-Bibliothek nötig) ─
    // So lässt sich die Start-Position/das Format sofort bei jeder Änderung neu anzeigen,
    // ohne bei jedem Tastendruck/Klick ein PDF neu zu erzeugen.
    let previewArticles = [];  // [{ article, barcodeUrl }]
    let previewLogo = null;
    let labelStartPosition = 1;

    // Skalierung (px pro mm) wird anhand der verfügbaren Breite berechnet, statt fest auf
    // 2.8 zu stehen — sonst werden die Vorschau-Karten auf schmalen Bildschirmen (Handy)
    // breiter als der sichtbare Bereich und rechts abgeschnitten.
    function computePreviewScale(pageWmm) {
        const container = document.getElementById('label-preview-pages');
        const available = Math.max((container ? container.clientWidth : 600) - 8, 160);
        return Math.min(available / pageWmm, 3.2);
    }

    window.addEventListener('resize', () => {
        const modal = document.getElementById('label-preview-modal');
        if (modal && modal.style.display === 'flex') renderLabelPreviewUI();
    });

    function safeBarcodeUrl(numberText) {
        try { return generateBarcodeDataUrl(numberText || '0'); } catch (e) {
            console.warn('Barcode generation failed for', numberText, e);
            return null;
        }
    }

    window.printSelectedLabels = async function () {
        if (selectedLabelIds.size === 0) {
            alert('Bitte mindestens einen Artikel auswählen.');
            return;
        }

        const selected = labelArticles.filter(a => selectedLabelIds.has(a.id));

        try {
            await loadJsBarcode();

            let logo = null;
            try { logo = await loadEmbeddedLogoGrayscale(); } catch (e) {
                console.warn(e);
                alert('Hinweis: Logo konnte nicht geladen werden, Etiketten werden ohne Logo erzeugt.\n' + e.message);
            }

            // "Mehrere" reiht dasselbe Etikett entsprechend oft hintereinander ein — unabhängig
            // von Menge/Einheit. Menge + Einheit werden als "QTY: <Menge> <Einheit>" auf das
            // Etikett gedruckt, außer der "QTY nicht drucken"-Haken ist gesetzt — dann wird qty
            // hier auf null gesetzt, wodurch drawLabelCell/filledPreviewCell die Zeile ganz weglassen.
            const qtyDisabled = document.getElementById('label-qty-disabled')?.checked;
            previewArticles = [];
            selected.forEach(article => {
                const q = getLabelQty(article.id);
                const copies = getLabelRepeatCount(article.id);
                const barcodeUrl = safeBarcodeUrl(article.article_number);
                for (let i = 0; i < copies; i++) {
                    previewArticles.push({
                        article, barcodeUrl,
                        qty: qtyDisabled ? null : q.qty,
                        unit: q.unit || 'stk'
                    });
                }
            });
            previewLogo = logo;
            labelStartPosition = 1;

            const startInput = document.getElementById('label-start-position');
            if (startInput) startInput.value = 1;
            const formatSelect = document.getElementById('label-format-select');
            if (formatSelect) formatSelect.value = currentFormatKey;
            updateMaxPositionLabel();

            document.getElementById('label-preview-modal').style.display = 'flex';
            renderLabelPreviewUI();
        } catch (err) {
            console.error('Error preparing label preview:', err);
            alert('Fehler beim Erzeugen der Vorschau: ' + err.message);
        }
    };

    window.closeLabelPreview = function () {
        document.getElementById('label-preview-modal').style.display = 'none';
    };

    function updateMaxPositionLabel() {
        const format = getFormat();
        const perPage = format.cols * format.rows;
        const span = document.getElementById('label-position-max');
        if (span) span.textContent = 'von ' + perPage;
        const input = document.getElementById('label-start-position');
        if (input) input.max = perPage;
        // Start-Position ergibt nur bei Blatt-Rastern Sinn — bei Einzel-Etikettendruckern
        // (DYMO & Co.) ist jeder Druck frisch, da gibt es kein "schon verwendetes" Etikett.
        const wrapper = document.getElementById('label-start-position-wrapper');
        if (wrapper) wrapper.style.display = (format.mode === 'single') ? 'none' : 'flex';
    }

    window.updateLabelFormat = function (key) {
        if (!LABEL_PRESETS[key]) return;
        currentFormatKey = key;
        const perPage = getFormat().cols * getFormat().rows;
        if (labelStartPosition > perPage) labelStartPosition = perPage;
        updateMaxPositionLabel();
        const input = document.getElementById('label-start-position');
        if (input) input.value = labelStartPosition;
        renderLabelPreviewUI();
    };

    window.updateLabelStartPosition = function (value) {
        const perPage = getFormat().cols * getFormat().rows;
        let n = parseInt(value, 10);
        if (isNaN(n) || n < 1) n = 1;
        if (n > perPage) n = perPage;
        labelStartPosition = n;
        const input = document.getElementById('label-start-position');
        if (input) input.value = n;
        renderLabelPreviewUI();
    };

    function renderLabelPreviewUI() {
        const container = document.getElementById('label-preview-pages');
        if (!container) return;

        const format = getFormat();

        if (format.mode === 'single') {
            renderSingleModePreview(container, format);
            return;
        }

        const pageWmm = format.pageW;
        const pageHmm = format.pageH;
        const perPage = format.cols * format.rows;
        const scale = computePreviewScale(pageWmm);
        const pageW = pageWmm * scale;
        const pageH = pageHmm * scale;
        const labelW = format.labelW * scale;
        const labelH = format.labelH * scale;
        const { gapX, gapY } = computeGaps(format);
        const gapXpx = gapX * scale;
        const gapYpx = gapY * scale;

        let pagesHtml = '';
        let articleIdx = 0;
        let pageNum = 0;
        const total = previewArticles.length;

        while (articleIdx < total || pageNum === 0) {
            const startSlot = (pageNum === 0) ? (labelStartPosition - 1) : 0;
            let cellsHtml = '';

            for (let slot = 0; slot < perPage; slot++) {
                const col = slot % format.cols;
                const row = Math.floor(slot / format.cols);
                const cx = gapXpx + col * (labelW + gapXpx);
                const cy = gapYpx + row * (labelH + gapYpx);

                if (slot < startSlot || articleIdx >= total) {
                    cellsHtml += emptyPreviewCell(cx, cy, labelW, labelH);
                } else {
                    cellsHtml += filledPreviewCell(cx, cy, labelW, labelH, previewArticles[articleIdx], previewLogo, false);
                    articleIdx++;
                }
            }

            pagesHtml += `
                <div style="position:relative; width:${pageW}px; height:${pageH}px; background:#fff; border-radius:4px; box-shadow:0 4px 24px rgba(0,0,0,0.35); margin: 0 auto 28px auto;">
                    <div style="position:absolute; top:6px; left:10px; font-size:10px; color:rgba(0,0,0,0.25); font-family:Arial,sans-serif;">Seite ${pageNum + 1}</div>
                    ${cellsHtml}
                </div>
            `;

            pageNum++;
            if (articleIdx >= total) break;
            if (pageNum > 200) break; // Sicherheitsbremse gegen Endlosschleifen
        }

        container.innerHTML = pagesHtml;
    }

    // DYMO & ähnliche Einzel-Etikettendrucker: kein Blatt-Raster — jedes Etikett ist
    // eine eigene "Seite" in exakter Etikettengröße, ohne Start-Position (jeder Druck ist frisch).
    function renderSingleModePreview(container, format) {
        const scale = computePreviewScale(format.labelW);
        const pageW = format.labelW * scale;
        const pageH = format.labelH * scale;
        let pagesHtml = '';

        previewArticles.forEach((item, idx) => {
            pagesHtml += `
                <div style="position:relative; width:${pageW}px; height:${pageH}px; background:#fff; border-radius:6px; box-shadow:0 4px 24px rgba(0,0,0,0.35); margin: 0 auto 20px auto;">
                    <div style="position:absolute; top:4px; left:8px; font-size:9px; color:rgba(0,0,0,0.25); font-family:Arial,sans-serif;">Etikett ${idx + 1} / ${previewArticles.length}</div>
                    ${filledPreviewCell(0, 0, pageW, pageH, item, previewLogo, true)}
                </div>
            `;
        });

        container.innerHTML = pagesHtml || '<p style="text-align:center; color:rgba(255,255,255,0.4);">Keine Artikel ausgewählt.</p>';
    }

    function emptyPreviewCell(x, y, w, h) {
        return `<div style="position:absolute; left:${x}px; top:${y}px; width:${w}px; height:${h}px; border-radius:4px; border:1px dashed rgba(0,0,0,0.12); background:rgba(0,0,0,0.02);"></div>`;
    }

    function filledPreviewCell(x, y, w, h, item, logo, isSingleLabel) {
        const a = item.article;
        const bez1 = escapeHtml(a.bezeichnung_1 || '');
        const bez2 = escapeHtml(a.bezeichnung_2 || '');
        const num = escapeHtml(a.article_number || '');
        // DYMO: alle Werte 1:1 aus den echten mm/pt-Werten von drawLabelCell umgerechnet
        // (Etikett 89 x 36mm), damit die Vorschau wirklich genau dem späteren PDF entspricht
        // (Prozent = mm bzw. pt-in-mm geteilt durch 36mm Etikettenhöhe). jsPDF zeichnet Text
        // anhand der BASELINE, ein <div> mit "top" positioniert Text aber an dessen OBERKANTE —
        // deshalb wird hier von der Unterkante aus positioniert (wie bei Artikelnummer/QTY),
        // das trifft die echte Baseline-Position viel genauer als "top".
        const DYMO_H = 36;
        const ptToFrac = (pt) => (pt * 0.3528) / DYMO_H;
        const bottomFromBaseline = (baselineMm) => ((DYMO_H - baselineMm) / DYMO_H) * 100 + '%';

        const logoHeightPct = isSingleLabel ? ((7 / DYMO_H) * 100) + '%' : '13%';
        const logoBottomPct = isSingleLabel ? ((1 / DYMO_H) * 100) + '%' : '4%';
        const logoMaxWidthPct = isSingleLabel ? '36%' : '30%';
        const logoImg = (logo && logo.url) ? `<img src="${logo.url}" style="position:absolute; bottom:${logoBottomPct}; left:3%; height:${logoHeightPct}; max-width:${logoMaxWidthPct}; object-fit:contain;">` : '';

        const bez1Bottom = bottomFromBaseline(10);
        const bez1Size = isSingleLabel ? h * ptToFrac(14) : h * 0.115;
        const bez2Bottom = bottomFromBaseline(17);
        const bez2Size = isSingleLabel ? h * ptToFrac(11.5) : h * 0.095;
        const barcodeTop = isSingleLabel ? ((20 / DYMO_H) * 100) + '%' : '54%';
        const barcodeHeightPct = isSingleLabel ? ((7 / DYMO_H) * 100) + '%' : '23%';
        // Breite exakt wie im PDF berechnen (statt der natürlichen Bildbreite zu folgen) —
        // addImage() im PDF streckt den Barcode IMMER auf diese feste Breite, unabhängig vom
        // Seitenverhältnis des erzeugten Barcode-Bilds; ohne das war die Vorschau bei kurzen/
        // langen Artikelnummern schmaler bzw. breiter als später im PDF.
        const DYMO_W = 89;
        const barcodeWidthPct = isSingleLabel ? ((Math.min(26 * (DYMO_W / 38), (DYMO_W - 2) * 0.78) / DYMO_W) * 100) + '%' : null;
        const barcodeImg = item.barcodeUrl
            ? (isSingleLabel
                ? `<img src="${item.barcodeUrl}" style="position:absolute; top:${barcodeTop}; left:50%; transform:translateX(-50%); width:${barcodeWidthPct}; height:${barcodeHeightPct};">`
                : `<img src="${item.barcodeUrl}" style="position:absolute; top:${barcodeTop}; left:50%; transform:translateX(-50%); height:${barcodeHeightPct}; object-fit:contain;">`)
            : '';
        const numSize = isSingleLabel ? h * ptToFrac(11) : h * 0.105;
        const numBottom = isSingleLabel ? bottomFromBaseline(36 - 1 - 0.6 * (36 / 19)) : '3%';
        const qtyText = item.qty ? escapeHtml(`QTY: ${item.qty} ${item.unit || ''}`.trim()) : '';
        const qtySize = isSingleLabel ? h * ptToFrac(7.5) : h * 0.075;
        return `
            <div style="position:absolute; left:${x}px; top:${y}px; width:${w}px; height:${h}px; border-radius:4px; border:1px solid rgba(0,0,0,0.15); background:#fff; overflow:hidden; box-sizing:border-box; font-family:Helvetica,Arial,sans-serif;">
                <div style="position:absolute; ${isSingleLabel ? `bottom:${bez1Bottom};` : 'top:6%;'} left:2%; right:2%; text-align:center; font-weight:700; font-size:${bez1Size}px; color:#141414; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${bez1}</div>
                <div style="position:absolute; ${isSingleLabel ? `bottom:${bez2Bottom};` : 'top:24%;'} left:2%; right:2%; text-align:center; font-weight:400; font-size:${bez2Size}px; color:#464646; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${bez2}</div>
                ${barcodeImg}
                ${logoImg}
                <div style="position:absolute; bottom:${numBottom}; left:2%; right:2%; text-align:center; font-weight:700; font-size:${numSize}px; color:#141414; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${num}</div>
                ${qtyText ? `<div style="position:absolute; bottom:${numBottom}; right:3%; text-align:right; font-weight:700; font-size:${qtySize}px; color:#141414; white-space:nowrap;">${qtyText}</div>` : ''}
            </div>
        `;
    }

    // "Austausch Filtermedien"-Etikett (siehe Vorlagen-Tab weiter unten): kein Barcode/
    // Bezeichnung, sondern ein Formular mit Art.-Nr.- und Datum-Feld, beide vorausgefüllt.
    // Prozentwerte sind 1:1 dieselben wie in drawFiltermedienLabelPdf (mm-Werte / 36mm
    // Etikettenhöhe bzw. 89mm Etikettenbreite), damit die Vorschau exakt dem PDF entspricht.
    function buildFiltermedienLabelHtml(w, h, vorlage, dateText, logo) {
        const dateHtml = escapeHtml(dateText || '');
        const logoWidthPct = logo ? Math.min(((7 * logo.ratio) / 89) * 100, 40) : 0;
        const hasArticleNumber = !!vorlage.articleNumber;

        const titleTop = vorlage.subtitle ? 5 : 8;
        const subtitleHtml = vorlage.subtitle
            ? `<div style="position:absolute; left:4%; right:4%; top:17%; text-align:center; font-weight:400; font-size:${h * 0.08}px; color:#505050;">${escapeHtml(vorlage.subtitle)}</div>`
            : '';

        const rowsHtml = hasArticleNumber
            ? `
                <div style="position:absolute; left:7%; top:26%; font-weight:700; font-size:${h * 0.085}px; color:#141414;">Art.-Nr.:</div>
                <div style="position:absolute; left:31%; right:4.5%; top:24%; height:15%; border:1px solid #464646; display:flex; align-items:center; justify-content:center; font-size:${h * 0.085}px; color:#141414;">${escapeHtml(vorlage.articleNumber)}</div>
                <div style="position:absolute; left:7%; top:45%; font-weight:700; font-size:${h * 0.085}px; color:#141414;">Datum:</div>
                <div style="position:absolute; left:31%; right:4.5%; top:43%; height:15%; border:1px solid #464646; display:flex; align-items:center; justify-content:center; font-size:${h * 0.085}px; color:#141414;">${dateHtml}</div>
            `
            : `
                <div style="position:absolute; left:7%; top:35%; font-weight:700; font-size:${h * 0.09}px; color:#141414;">Datum:</div>
                <div style="position:absolute; left:31%; right:4.5%; top:32%; height:17%; border:1px solid #464646; display:flex; align-items:center; justify-content:center; font-size:${h * 0.09}px; color:#141414;">${dateHtml}</div>
            `;

        const logoTop = hasArticleNumber ? 63 : 57;
        const footerTop = hasArticleNumber ? 85 : 82;

        return `
            <div style="position:absolute; inset:0; box-sizing:border-box; background:#fff; overflow:hidden; font-family:Helvetica,Arial,sans-serif; border-radius:6px;">
                <div style="position:absolute; left:1.5%; top:3%; right:1.5%; bottom:3%; border:1.5px solid #141414; border-radius:6px;"></div>
                <div style="position:absolute; left:4%; right:4%; top:${titleTop}%; text-align:center; font-weight:700; font-size:${h * 0.11}px; color:#141414;">${escapeHtml(vorlage.title)}</div>
                ${subtitleHtml}
                ${rowsHtml}
                ${logo ? `<img src="${logo.url}" style="position:absolute; left:50%; top:${logoTop}%; height:19%; width:${logoWidthPct}%; transform:translateX(-50%); object-fit:contain;">` : ''}
                <div style="position:absolute; left:5%; right:5%; top:${footerTop}%; text-align:center; font-size:${h * 0.05}px; line-height:1.35; color:#5a5a5a;">
                    26203 Wardenburg / Rheinstr. 14<br>04407 / 92 22 69 / info@meetra-recycling.de
                </div>
            </div>
        `;
    }

    // ── Echtes PDF erzeugen (ohne Rahmen — die abgerundeten Linien in der Vorschau
    // sind nur eine Bildschirm-Hilfe und werden NICHT mitgedruckt) ───
    window.downloadLabelPreviewPDF = async function () {
        if (!previewArticles.length) return;

        try {
            if (typeof window.loadPDFGenerators === 'function') {
                await window.loadPDFGenerators();
            }

            const format = getFormat();
            const { jsPDF } = window.jspdf;

            if (format.mode === 'single') {
                // Ein Etikett = eine PDF-Seite in exakter Etikettengröße (für DYMO & Co.,
                // die keine A4/A5-Blätter, sondern einzelne Etiketten direkt bedrucken).
                // Ausrichtung explizit angeben — ohne das vertauscht jsPDF Breite/Höhe und
                // erzwingt Hochformat, sobald keine Orientierung übergeben wird.
                const orientation = format.labelW >= format.labelH ? 'l' : 'p';
                const doc = new jsPDF({ unit: 'mm', format: [format.labelW, format.labelH], orientation });
                previewArticles.forEach((item, idx) => {
                    if (idx > 0) doc.addPage([format.labelW, format.labelH], orientation);
                    drawLabelCell(doc, 0, 0, item.article, previewLogo, format, item);
                });
                doc.save(`Etiketten_${new Date().toISOString().slice(0, 10)}.pdf`);
                return;
            }

            const doc = new jsPDF({ unit: 'mm', format: format.pageFormat });
            const { gapX, gapY } = computeGaps(format);

            const perPage = format.cols * format.rows;
            let articleIdx = 0;
            let pageNum = 0;

            while (articleIdx < previewArticles.length) {
                if (pageNum > 0) doc.addPage(format.pageFormat);
                const startSlot = (pageNum === 0) ? (labelStartPosition - 1) : 0;

                for (let slot = startSlot; slot < perPage && articleIdx < previewArticles.length; slot++) {
                    const col = slot % format.cols;
                    const row = Math.floor(slot / format.cols);
                    const x = gapX + col * (format.labelW + gapX);
                    const y = gapY + row * (format.labelH + gapY);
                    drawLabelCell(doc, x, y, previewArticles[articleIdx].article, previewLogo, format, previewArticles[articleIdx]);
                    articleIdx++;
                }
                pageNum++;
            }

            doc.save(`Etiketten_${new Date().toISOString().slice(0, 10)}.pdf`);
        } catch (err) {
            console.error('Error generating label PDF:', err);
            alert('Fehler beim Erzeugen des PDF: ' + err.message);
        }
    };

    // Layout von oben nach unten: Bezeichnung 1 (fett, zentriert) / Bezeichnung 2 (normal, zentriert) /
    // Barcode (zentriert) / unterste Zeile: Logo (klein, links) + Artikelnummer (bleibt mittig zentriert,
    // unabhängig von der Logo-Position — wird dafür NICHT nach rechts verschoben).
    // Alle Positionen/Schriftgrößen sind proportional zur Etikettenhöhe (Referenz: 19mm),
    // damit das Layout bei jedem gewählten Format gleich ausgewogen aussieht.
    function drawLabelCell(doc, x, y, article, logo, format, qtyInfo) {
        const labelW = format.labelW;
        const labelH = format.labelH;
        const scaleH = labelH / 19;
        const scaleW = labelW / 38;
        const padding = 1;
        const fullCenterX = x + labelW / 2;
        const fullW = labelW - padding * 2;
        const numberText = article.article_number || '';

        // Kein Rahmen — die Etiketten sind bereits vorgestanzt, daher wird hier
        // bewusst keine Schnittlinie mitgedruckt (die abgerundeten Linien in der
        // Live-Vorschau sind nur eine Bildschirm-Hilfe, kein Bestandteil des PDFs).

        // DYMO (Einzel-Etikettendrucker, "single" Modus): deutlich größeres Etikett (89x36mm)
        // als die kleinen Bogen-Etiketten (Referenz 38x19mm) — eigene, großzügigere Positionen
        // für Bezeichnung 1/2 statt der für die kleinen Etiketten austarierten Proportional-Skalierung,
        // da sonst oben viel Platz frei bliebe.
        const isSingleLabel = format.mode === 'single';

        // Bezeichnung 1 — fett, mittig zentriert, oben
        doc.setTextColor(20, 20, 20);
        if (isSingleLabel) {
            fitCenteredText(doc, article.bezeichnung_1 || '', fullCenterX, y + 10, fullW, 14, 10, 'bold');
        } else {
            fitCenteredText(doc, article.bezeichnung_1 || '', fullCenterX, y + 3.2 * scaleH, fullW, 5.5 * scaleH, 3.2 * scaleH, 'bold');
        }

        // Bezeichnung 2 — normal, mittig zentriert, mehr Abstand zu Bezeichnung 1 (bei DYMO
        // ist unten noch Luft, daher rutscht Bezeichnung 2 dafür weiter runter)
        if (article.bezeichnung_2) {
            doc.setTextColor(70, 70, 70);
            if (isSingleLabel) {
                fitCenteredText(doc, article.bezeichnung_2, fullCenterX, y + 17, fullW, 11.5, 8.5, 'normal');
            } else {
                fitCenteredText(doc, article.bezeichnung_2, fullCenterX, y + 5.6 * scaleH, fullW, 4.5 * scaleH, 2.8 * scaleH, 'normal');
            }
        }

        // Barcode — zentriert, bei DYMO mehr Abstand zu Bezeichnung 2 (rutscht weiter runter,
        // da dort noch Platz bis zum Logo ist) und größer (höher + breiter). Breite skaliert
        // mit der Etikettenbreite, damit er auf einem großen Etikett (z.B. DYMO) nicht winzig wirkt.
        try {
            const barcodeUrl = generateBarcodeDataUrl(numberText || '0');
            const barcodeW = isSingleLabel ? Math.min(26 * scaleW, fullW * 0.78) : Math.min(22 * scaleW, fullW * 0.7);
            const barcodeH = isSingleLabel ? 7 : 4.2 * scaleH;
            const barcodeY = isSingleLabel ? y + 20 : y + 9.6 * scaleH;
            doc.addImage(barcodeUrl, 'PNG', fullCenterX - barcodeW / 2, barcodeY, barcodeW, barcodeH);
        } catch (e) { console.warn('Barcode generation failed for', numberText, e); }

        // Logo (sehr klein, schwarz/weiß), unten links — in derselben Zeile wie die Artikelnummer.
        // Bei DYMO etwas größer (höher + breiter), da dort genug Platz vorhanden ist.
        if (logo) {
            try {
                const logoH = isSingleLabel ? 7 : 2.3 * scaleH;
                const logoW = logoH * logo.ratio;
                doc.addImage(logo.url, 'PNG', x + padding, y + labelH - padding - logoH, logoW, logoH);
            } catch (e) {}
        }

        // Artikelnummer — letzte Zeile unten, bleibt mittig zentriert
        doc.setTextColor(20, 20, 20);
        if (isSingleLabel) {
            fitCenteredText(doc, numberText, fullCenterX, y + labelH - padding - 0.6 * scaleH, fullW, 11, 8, 'bold');
        } else {
            fitCenteredText(doc, numberText, fullCenterX, y + labelH - padding - 0.6 * scaleH, fullW, 5 * scaleH, 3.5 * scaleH, 'bold');
        }

        // QTY (Menge + Einheit) — unten rechts, klein. Wird nicht in der Datenbank gespeichert.
        if (qtyInfo && qtyInfo.qty) {
            const qtyText = `QTY: ${qtyInfo.qty} ${qtyInfo.unit || ''}`.trim();
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(isSingleLabel ? 7.5 : 3 * scaleH);
            doc.setTextColor(20, 20, 20);
            doc.text(qtyText, x + labelW - padding, y + labelH - padding - 0.6 * scaleH, { align: 'right' });
        }
    }

    // "Austausch Filtermedien"-Etikett (siehe Vorlagen-Tab): eigenes Formular-Layout statt
    // Bezeichnung/Barcode — Art.-Nr. und Datum werden beide vorausgefüllt gedruckt. Mit Rahmen
    // (im Gegensatz zu den vorgestanzten Barcode-Etiketten), da dieses Etikett als ausgefülltes
    // Formular erkennbar sein soll. Feste Größe 89 x 36mm (immer Einzel-Etikett, keine Bögen).
    function drawFiltermedienLabelPdf(doc, vorlage, dateText, logo) {
        const w = 89, h = 36, margin = 1;
        const centerX = w / 2;
        const hasArticleNumber = !!vorlage.articleNumber;

        doc.setDrawColor(20, 20, 20);
        doc.setLineWidth(0.35);
        doc.roundedRect(margin, margin, w - margin * 2, h - margin * 2, 2, 2, 'S');

        doc.setTextColor(20, 20, 20);
        const titleY = vorlage.subtitle ? 5.3 : 6.5;
        fitCenteredText(doc, vorlage.title, centerX, titleY, w - margin * 2 - 3, 12, 9, 'bold');

        if (vorlage.subtitle) {
            doc.setTextColor(80, 80, 80);
            fitCenteredText(doc, vorlage.subtitle, centerX, 9, w - margin * 2 - 3, 7.5, 6, 'normal');
        }

        const labelX = 6;
        const boxX = 28;
        const boxW = w - margin - 3 - boxX;

        const drawRow = (label, value, boxTop, boxH, fontSize) => {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(fontSize);
            doc.setTextColor(20, 20, 20);
            doc.text(label, labelX, boxTop + boxH / 2 + fontSize * 0.13);
            doc.setDrawColor(70, 70, 70);
            doc.setLineWidth(0.3);
            doc.rect(boxX, boxTop, boxW, boxH, 'S');
            if (value) {
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(fontSize);
                doc.text(value, boxX + boxW / 2, boxTop + boxH / 2 + fontSize * 0.13, { align: 'center' });
            }
        };

        let logoTop, footer1Y, footer2Y;
        if (hasArticleNumber) {
            drawRow('Art.-Nr.:', vorlage.articleNumber, 9.5, 5.5, 9);
            drawRow('Datum:', dateText || '', 16.5, 5.5, 9);
            logoTop = 22.8;
            footer1Y = 31.5;
            footer2Y = 33.8;
        } else {
            drawRow('Datum:', dateText || '', 12.8, 6.2, 9.5);
            logoTop = 20.8;
            footer1Y = 30.5;
            footer2Y = 32.8;
        }

        if (logo) {
            try {
                const logoH = 7;
                const logoW = logoH * logo.ratio;
                doc.addImage(logo.url, 'PNG', centerX - logoW / 2, logoTop, logoW, logoH);
            } catch (e) {}
        }

        doc.setTextColor(90, 90, 90);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6);
        doc.text('26203 Wardenburg / Rheinstr. 14', centerX, footer1Y, { align: 'center' });
        doc.text('04407 / 92 22 69 / info@meetra-recycling.de', centerX, footer2Y, { align: 'center' });
    }

    // ── Vorlagen: feste Schnelldruck-Etiketten, unabhängig von der Artikel-Auswahl oben —
    // für wiederkehrende Etiketten (z.B. immer dieselbe Art.-Nr.), die man ohne Suchen/
    // Auswählen sofort mit aktuellem (oder frei wählbarem) Datum drucken will.
    const LABEL_VORLAGEN = [
        { id: 'austausch_filtermedien', title: 'Austausch der Filtermedien', subtitle: null, articleNumber: '00000649' },
        { id: 'schutzbelueftungsanlage', title: 'Austausch der Filtermedien', subtitle: 'Schutzbelüftungsanlage', articleNumber: null }
    ];

    let vorlagenLogoColor = null;

    function todayIso() { return new Date().toISOString().slice(0, 10); }

    function fmtDateDe(iso) {
        if (!iso) return '';
        const p = iso.split('-');
        return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : iso;
    }

    window.renderVorlagen = async function () {
        const container = document.getElementById('vorlagen-list-container');
        if (!container) return;

        if (!vorlagenLogoColor) {
            try { vorlagenLogoColor = await loadEmbeddedLogoColor(); } catch (e) { console.warn(e); }
        }

        container.innerHTML = LABEL_VORLAGEN.map(v => {
            const dateVal = todayIso();
            return `
                <div class="label-article-row" style="display:flex; align-items:center; gap:20px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 16px 18px; flex-wrap:wrap;">
                    <div id="vorlage-preview-${v.id}" style="width:178px; height:72px; flex-shrink:0; position:relative;">
                        ${buildFiltermedienLabelHtml(178, 72, v, fmtDateDe(dateVal), vorlagenLogoColor)}
                    </div>
                    <div style="flex:1; min-width:180px;">
                        <div style="color:#fff; font-weight:700; font-size:1rem;">${escapeHtml(v.subtitle || v.title)}</div>
                        <div style="color:rgba(255,255,255,0.4); font-size:0.8rem; margin-top:2px;">${v.articleNumber ? 'Art.-Nr. ' + escapeHtml(v.articleNumber) : escapeHtml(v.title)}</div>
                    </div>
                    <div style="color:rgba(255,255,255,0.4); font-size:0.8rem; white-space:nowrap;">DYMO 89 x 36mm</div>
                    <div style="display:flex; flex-direction:column; gap:3px;">
                        <label style="font-size:0.62rem; color:rgba(255,255,255,0.35); text-transform:uppercase; letter-spacing:0.4px;">Datum</label>
                        <input type="date" id="vorlage-date-${v.id}" value="${dateVal}" class="glass-form-input" style="height:36px;" onchange="window.updateVorlagenPreview('${v.id}')">
                    </div>
                    <button class="btn-primary" style="padding: 10px 20px; font-weight:700; white-space:nowrap;" onclick="window.printVorlageLabel('${v.id}')">
                        Drucken
                    </button>
                </div>
            `;
        }).join('');
    };

    window.updateVorlagenPreview = function (vorlageId) {
        const vorlage = LABEL_VORLAGEN.find(v => v.id === vorlageId);
        const previewEl = document.getElementById(`vorlage-preview-${vorlageId}`);
        const dateInput = document.getElementById(`vorlage-date-${vorlageId}`);
        if (!vorlage || !previewEl) return;
        const dateVal = dateInput && dateInput.value ? dateInput.value : todayIso();
        previewEl.innerHTML = buildFiltermedienLabelHtml(178, 72, vorlage, fmtDateDe(dateVal), vorlagenLogoColor);
    };

    window.printVorlageLabel = async function (vorlageId) {
        const vorlage = LABEL_VORLAGEN.find(v => v.id === vorlageId);
        if (!vorlage) return;
        const dateInput = document.getElementById(`vorlage-date-${vorlageId}`);
        const dateVal = dateInput && dateInput.value ? dateInput.value : todayIso();

        try {
            if (typeof window.loadPDFGenerators === 'function') await window.loadPDFGenerators();
            if (!vorlagenLogoColor) {
                try { vorlagenLogoColor = await loadEmbeddedLogoColor(); } catch (e) { console.warn(e); }
            }

            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ unit: 'mm', format: [89, 36], orientation: 'l' });
            drawFiltermedienLabelPdf(doc, vorlage, fmtDateDe(dateVal), vorlagenLogoColor);
            doc.save(`${(vorlage.subtitle || vorlage.title).replace(/\s+/g, '_')}_${dateVal}.pdf`);
        } catch (err) {
            console.error('Error printing Vorlage label:', err);
            alert('Fehler beim Drucken: ' + err.message);
        }
    };

    // Zentrierten Text in maxWidthMm einpassen: Schriftgröße verkleinern, zuletzt kürzen mit "…"
    function fitCenteredText(doc, text, centerX, baselineY, maxWidthMm, startSize, minSize, style) {
        if (!text) return;
        doc.setFont('helvetica', style || 'normal');
        let size = startSize;
        doc.setFontSize(size);
        while (doc.getTextWidth(text) > maxWidthMm && size > minSize) {
            size -= 0.5;
            doc.setFontSize(size);
        }
        let displayText = text;
        while (doc.getTextWidth(displayText) > maxWidthMm && displayText.length > 1) {
            displayText = displayText.slice(0, -1);
        }
        if (displayText !== text && displayText.length > 1) displayText = displayText.slice(0, -1) + '…';
        doc.text(displayText, centerX, baselineY, { align: 'center' });
    }

    // ── Ansicht umschalten: Etiketten <-> Beschriftung (beide auf derselben Seite) ──
    window.switchLabelTab = function (tab) {
        const isEtiketten = tab === 'etiketten';
        const isBeschriftung = tab === 'beschriftung';
        const isVorlagen = tab === 'vorlagen';
        document.getElementById('label-tab-content-etiketten').classList.toggle('hidden', !isEtiketten);
        document.getElementById('label-tab-content-beschriftung').classList.toggle('hidden', !isBeschriftung);
        document.getElementById('label-tab-content-vorlagen').classList.toggle('hidden', !isVorlagen);
        document.getElementById('label-tab-btn-etiketten').classList.toggle('active', isEtiketten);
        document.getElementById('label-tab-btn-beschriftung').classList.toggle('active', isBeschriftung);
        document.getElementById('label-tab-btn-vorlagen').classList.toggle('active', isVorlagen);
        const actions = document.getElementById('label-etiketten-actions');
        if (actions) actions.classList.toggle('hidden', !isEtiketten);

        if (isBeschriftung) {
            renderBeschriftungPageTabs();
            loadBeschriftungPageIntoForm();
        } else if (isVorlagen) {
            window.renderVorlagen();
        }
    };

    // ── Beschriftung: A4/A3-Aushang mit Titel, Bild, Logo und optionaler Stückliste —
    // mehrere Seiten möglich, jede mit eigener Ausrichtung, werden zu einem PDF zusammengefasst.
    function createEmptyBeschriftungPage() {
        return { title: '', titleFontSize: 18, bez2: '', bez2FontSize: 11, imageDataUrl: null, imageRatio: 1, imageWidthMm: null, imageHeightMm: null, imageXMm: null, imageYMm: null, imageRotation: 0, stuecklisteEnabled: false, rows: [], orientation: 'p' };
    }

    // Feste Zeilenhöhen (mm), unabhängig von Hoch-/Querformat — Reihe 1 = Titel + Logo,
    // Reihe 2 = Kurzbeschreibung, dann erst das Bild. Als Modul-Konstanten, damit Vorschau,
    // PDF-Zeichnung und Bild-Box-Berechnung garantiert dieselben Werte verwenden.
    const BESCHRIFTUNG_ROW1_TOP = 6, BESCHRIFTUNG_ROW1_H = 13;
    const BESCHRIFTUNG_ROW2_TOP = BESCHRIFTUNG_ROW1_TOP + BESCHRIFTUNG_ROW1_H + 1, BESCHRIFTUNG_ROW2_H = 8;
    const BESCHRIFTUNG_IMAGE_TOP = BESCHRIFTUNG_ROW2_TOP + BESCHRIFTUNG_ROW2_H + 3;

    // jsPDF interpretiert setFontSize() immer in Punkt (pt), unabhängig von der Dokument-Einheit
    // (hier 'mm') — für die HTML-Live-Vorschau wird daher in mm umgerechnet (1pt = 0.3528mm).
    function ptToMm(pt) { return pt * 0.3528; }

    let beschriftungPages = [createEmptyBeschriftungPage()];
    let currentBeschriftungPageIndex = 0;

    function getCurrentBeschriftungPage() {
        return beschriftungPages[currentBeschriftungPageIndex];
    }

    function getPageDimensions(orientation) {
        return orientation === 'l' ? { w: 297, h: 210 } : { w: 210, h: 297 };
    }

    function newBeschriftungRow() {
        return { nummer: '', bez1: '', bez2: '', menge: '', einheit: '' };
    }

    function renderBeschriftungPageTabs() {
        const container = document.getElementById('beschriftung-page-tabs');
        if (!container) return;
        container.innerHTML = beschriftungPages.map((p, i) => {
            const active = i === currentBeschriftungPageIndex;
            return `<button onclick="window.switchBeschriftungPage(${i})" style="width:34px; height:34px; border-radius:9px; border:1.5px solid ${active ? '#ef4444' : 'rgba(255,255,255,0.15)'}; background:${active ? '#ef4444' : 'rgba(255,255,255,0.05)'}; color:#fff; font-weight:700; cursor:pointer;">${i + 1}</button>`;
        }).join('');
    }

    function loadBeschriftungPageIntoForm() {
        const page = getCurrentBeschriftungPage();
        const titleInput = document.getElementById('beschriftung-title');
        if (titleInput) titleInput.value = page.title;
        const fontSizeInput = document.getElementById('beschriftung-title-fontsize');
        if (fontSizeInput) fontSizeInput.value = page.titleFontSize || 18;
        const fontSizeValue = document.getElementById('beschriftung-title-fontsize-value');
        if (fontSizeValue) fontSizeValue.textContent = page.titleFontSize || 18;
        const bez2Input = document.getElementById('beschriftung-bez2');
        if (bez2Input) bez2Input.value = page.bez2 || '';
        const bez2FontSizeInput = document.getElementById('beschriftung-bez2-fontsize');
        if (bez2FontSizeInput) bez2FontSizeInput.value = page.bez2FontSize || 11;
        const bez2FontSizeValue = document.getElementById('beschriftung-bez2-fontsize-value');
        if (bez2FontSizeValue) bez2FontSizeValue.textContent = page.bez2FontSize || 11;
        const rotationInput = document.getElementById('beschriftung-image-rotation');
        if (rotationInput) rotationInput.value = page.imageRotation || 0;
        const rotationValue = document.getElementById('beschriftung-image-rotation-value');
        if (rotationValue) rotationValue.textContent = (page.imageRotation || 0) + '°';
        const stuecklisteToggle = document.getElementById('beschriftung-stueckliste-toggle');
        if (stuecklisteToggle) stuecklisteToggle.checked = page.stuecklisteEnabled;
        const editor = document.getElementById('beschriftung-stueckliste-editor');
        if (editor) editor.classList.toggle('hidden', !page.stuecklisteEnabled);
        renderBeschriftungRows();
        updateOrientationButtons();
        window.renderBeschriftungPreview();
    }

    function updateOrientationButtons() {
        const page = getCurrentBeschriftungPage();
        const btnP = document.getElementById('beschriftung-orientation-p');
        const btnL = document.getElementById('beschriftung-orientation-l');
        if (!btnP || !btnL) return;
        const activeStyle = 'border:1.5px solid #ef4444; background:#ef4444; color:#fff;';
        const inactiveStyle = 'border:1.5px solid rgba(255,255,255,0.15); background:rgba(255,255,255,0.05); color:rgba(255,255,255,0.6);';
        const base = 'padding:8px 18px; border-radius: 10px; font-weight:700; font-size:0.85rem; cursor:pointer;';
        btnP.style.cssText = base + (page.orientation === 'p' ? activeStyle : inactiveStyle);
        btnL.style.cssText = base + (page.orientation === 'l' ? activeStyle : inactiveStyle);
    }

    window.setBeschriftungOrientation = function (orientation) {
        getCurrentBeschriftungPage().orientation = orientation;
        updateOrientationButtons();
        window.renderBeschriftungPreview();
    };

    window.addBeschriftungPage = function () {
        beschriftungPages.push(createEmptyBeschriftungPage());
        currentBeschriftungPageIndex = beschriftungPages.length - 1;
        renderBeschriftungPageTabs();
        loadBeschriftungPageIntoForm();
    };

    window.removeBeschriftungPage = function () {
        if (beschriftungPages.length <= 1) {
            alert('Mindestens eine Seite muss vorhanden bleiben.');
            return;
        }
        beschriftungPages.splice(currentBeschriftungPageIndex, 1);
        currentBeschriftungPageIndex = Math.max(0, currentBeschriftungPageIndex - 1);
        renderBeschriftungPageTabs();
        loadBeschriftungPageIntoForm();
    };

    window.switchBeschriftungPage = function (index) {
        currentBeschriftungPageIndex = index;
        renderBeschriftungPageTabs();
        loadBeschriftungPageIntoForm();
    };

    window.updateBeschriftungTitle = function (value) {
        getCurrentBeschriftungPage().title = value;
        window.renderBeschriftungPreview();
    };

    window.updateBeschriftungTitleFontSize = function (value) {
        let n = parseInt(value, 10);
        if (isNaN(n) || n < 6) n = 6;
        if (n > 40) n = 40;
        getCurrentBeschriftungPage().titleFontSize = n;
        const valueLabel = document.getElementById('beschriftung-title-fontsize-value');
        if (valueLabel) valueLabel.textContent = n;
        window.renderBeschriftungPreview();
    };

    window.updateBeschriftungBez2 = function (value) {
        getCurrentBeschriftungPage().bez2 = value;
        window.renderBeschriftungPreview();
    };

    window.updateBeschriftungBez2FontSize = function (value) {
        let n = parseInt(value, 10);
        if (isNaN(n) || n < 6) n = 6;
        if (n > 40) n = 40;
        getCurrentBeschriftungPage().bez2FontSize = n;
        const valueLabel = document.getElementById('beschriftung-bez2-fontsize-value');
        if (valueLabel) valueLabel.textContent = n;
        window.renderBeschriftungPreview();
    };

    window.handleBeschriftungImage = function (file) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const page = getCurrentBeschriftungPage();
                page.imageDataUrl = e.target.result;
                page.imageRatio = img.naturalWidth / img.naturalHeight;
                page.imageWidthMm = null;
                page.imageHeightMm = null;
                page.imageXMm = null;
                page.imageYMm = null;
                page.imageRotation = 0;
                const rotationInput = document.getElementById('beschriftung-image-rotation');
                if (rotationInput) rotationInput.value = 0;
                const rotationValue = document.getElementById('beschriftung-image-rotation-value');
                if (rotationValue) rotationValue.textContent = '0°';
                window.renderBeschriftungPreview();
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    };

    window.removeBeschriftungImage = function () {
        const page = getCurrentBeschriftungPage();
        page.imageDataUrl = null;
        page.imageRatio = 1;
        page.imageWidthMm = null;
        page.imageHeightMm = null;
        page.imageXMm = null;
        page.imageYMm = null;
        page.imageRotation = 0;
        const input = document.getElementById('beschriftung-image-input');
        if (input) input.value = '';
        const rotationInput = document.getElementById('beschriftung-image-rotation');
        if (rotationInput) rotationInput.value = 0;
        const rotationValue = document.getElementById('beschriftung-image-rotation-value');
        if (rotationValue) rotationValue.textContent = '0°';
        window.renderBeschriftungPreview();
    };

    window.updateBeschriftungImageRotation = function (value) {
        let n = parseInt(value, 10);
        if (isNaN(n)) n = 0;
        if (n < -180) n = -180;
        if (n > 180) n = 180;
        getCurrentBeschriftungPage().imageRotation = n;
        const valueLabel = document.getElementById('beschriftung-image-rotation-value');
        if (valueLabel) valueLabel.textContent = n + '°';
        window.renderBeschriftungPreview();
    };

    window.resetBeschriftungImageRotation = function () {
        getCurrentBeschriftungPage().imageRotation = 0;
        const rotationInput = document.getElementById('beschriftung-image-rotation');
        if (rotationInput) rotationInput.value = 0;
        const rotationValue = document.getElementById('beschriftung-image-rotation-value');
        if (rotationValue) rotationValue.textContent = '0°';
        window.renderBeschriftungPreview();
    };

    window.toggleBeschriftungStueckliste = function (checked) {
        const page = getCurrentBeschriftungPage();
        page.stuecklisteEnabled = checked;
        const editor = document.getElementById('beschriftung-stueckliste-editor');
        editor.classList.toggle('hidden', !checked);
        if (checked && page.rows.length === 0) {
            page.rows.push(newBeschriftungRow());
        }
        renderBeschriftungRows();
        window.renderBeschriftungPreview();
    };

    window.addBeschriftungRow = function () {
        getCurrentBeschriftungPage().rows.push(newBeschriftungRow());
        renderBeschriftungRows();
        window.renderBeschriftungPreview();
    };

    window.removeBeschriftungRow = function (index) {
        getCurrentBeschriftungPage().rows.splice(index, 1);
        renderBeschriftungRows();
        window.renderBeschriftungPreview();
    };

    window.updateBeschriftungRow = function (index, field, value) {
        const rows = getCurrentBeschriftungPage().rows;
        if (!rows[index]) return;
        rows[index][field] = value;
        window.renderBeschriftungPreview();
    };

    function renderBeschriftungRows() {
        const container = document.getElementById('beschriftung-stueckliste-rows');
        if (!container) return;
        const rows = getCurrentBeschriftungPage().rows;
        container.innerHTML = rows.map((row, i) => `
            <div style="display:grid; grid-template-columns: 1fr 1.3fr 1.3fr 70px 80px 32px; gap:6px;">
                <input type="text" value="${escapeHtml(row.nummer)}" oninput="window.updateBeschriftungRow(${i}, 'nummer', this.value)" class="glass-form-input" style="height:34px; padding: 0 6px;">
                <input type="text" value="${escapeHtml(row.bez1)}" oninput="window.updateBeschriftungRow(${i}, 'bez1', this.value)" class="glass-form-input" style="height:34px; padding: 0 6px;">
                <input type="text" value="${escapeHtml(row.bez2)}" oninput="window.updateBeschriftungRow(${i}, 'bez2', this.value)" class="glass-form-input" style="height:34px; padding: 0 6px;">
                <input type="text" value="${escapeHtml(row.menge)}" oninput="window.updateBeschriftungRow(${i}, 'menge', this.value)" class="glass-form-input" style="height:34px; padding: 0 6px; text-align:center;">
                <input type="text" value="${escapeHtml(row.einheit)}" placeholder="stk" oninput="window.updateBeschriftungRow(${i}, 'einheit', this.value)" class="glass-form-input" style="height:34px; padding: 0 6px; text-align:center;">
                <button onclick="window.removeBeschriftungRow(${i})" style="background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.3); border-radius:6px; color:#ef4444; cursor:pointer; height:34px;">&times;</button>
            </div>
        `).join('');
    }

    // Bildgröße innerhalb einer Box berechnen, Seitenverhältnis beibehalten
    function fitBox(ratio, maxW, maxH) {
        let w = maxW;
        let h = w / ratio;
        if (h > maxH) {
            h = maxH;
            w = h * ratio;
        }
        return { w, h };
    }

    // Liefert die aktuelle Bild-Box (mm): per Eckpunkt manuell gesetzte Position/Größe hat
    // Vorrang, sonst die automatische Anpassung (zentriert, unterhalb Titel/Kurzbeschreibung).
    function getBeschriftungImageBox(page, pageW, pageH) {
        if (page.imageWidthMm != null && page.imageHeightMm != null) {
            const x = page.imageXMm != null ? page.imageXMm : (pageW - page.imageWidthMm) / 2;
            const y = page.imageYMm != null ? page.imageYMm : BESCHRIFTUNG_IMAGE_TOP;
            return { x, y, w: page.imageWidthMm, h: page.imageHeightMm };
        }
        const maxW = pageW - 40;
        const maxH = pageH * 0.45;
        const { w, h } = fitBox(page.imageRatio, maxW, maxH);
        return { x: (pageW - w) / 2, y: BESCHRIFTUNG_IMAGE_TOP, w, h };
    }

    // ── Bild per Eckpunkt ziehen: frei in Breite/Höhe skalieren (alle 4 Ecken), drehen und
    // per Ziehen auf dem Bild selbst frei verschieben ─────────────────────────────────────
    // Während des Ziehens wird NICHT die ganze Vorschau neu gerendert (innerHTML würde den
    // Ziehpunkt mitten in der Geste aus dem DOM entfernen und die Pointer-Capture abbrechen) —
    // stattdessen nur die Wrapper-Position/-Größe direkt per Style aktualisiert, am Ende
    // einmal final neu gerendert.
    // Da das Bild per CSS-transform gedreht wird, muss die Zeigerbewegung beim Skalieren erst
    // zurück in das ungedrehte lokale Koordinatensystem der Box rotiert werden, sonst würde bei
    // gedrehtem Bild in die falsche Richtung skaliert. Beim reinen Verschieben ist das nicht
    // nötig — die Boxmitte verschiebt sich unabhängig von ihrer eigenen Drehung 1:1 mit der Maus.
    let imageDrag = null;
    const MIN_IMAGE_SIZE_MM = 10;

    // Eigener Rotations-Cursor (zwei gebogene Pfeile) statt eines generischen Browser-Cursors —
    // wird als CSS "cursor" auf den Dreh-Ziehpunkt UND (während aktiv gezogen wird) auf
    // document.body gesetzt, damit er auch dann sichtbar bleibt, wenn die Maus beim schnellen
    // Drehen kurz den kleinen Ziehpunkt verlässt. SVG wird komplett über encodeURIComponent
    // kodiert (auch die doppelten Anführungszeichen darin), damit beim Einbetten in ein
    // HTML-style-Attribut (ebenfalls doppelte Anführungszeichen) nichts kollidiert.
    const ROTATE_CURSOR_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24">'
        + '<path fill="#111827" stroke="#ffffff" stroke-width="1" d="M17.65 6.35A7.95 7.95 0 0 0 12 4V1L8 5l4 4V6c1.66 0 3.14.67 4.22 1.78A5.98 5.98 0 0 1 18 12c0 3.31-2.69 6-6 6a5.98 5.98 0 0 1-5.65-4H4.26A8 8 0 1 0 17.65 6.35z"/>'
        + '</svg>';
    const ROTATE_CURSOR = `url('data:image/svg+xml,${encodeURIComponent(ROTATE_CURSOR_SVG)}') 11 11, grab`;

    document.addEventListener('pointerdown', (e) => {
        const rotateHandle = e.target.closest('.beschriftung-image-rotate-handle');
        const resizeHandle = !rotateHandle ? e.target.closest('.beschriftung-image-resize-handle') : null;
        const handle = rotateHandle || resizeHandle;
        const wrapper = handle ? handle.closest('.beschriftung-image-wrapper') : e.target.closest('.beschriftung-image-wrapper');
        // Das Bild sitzt immer auf der ersten physischen Vorschau-Seite — deren Element wird
        // über die Ancestor-Kette gesucht statt über eine feste ID, da die Vorschau je nach
        // Stückliste mehrere Seiten-Divs enthalten kann (siehe renderBeschriftungPreview).
        const pageEl = wrapper ? wrapper.closest('.beschriftung-preview-physical-page') : null;
        if (!wrapper || !pageEl) return;

        const page = getCurrentBeschriftungPage();
        const { w: pageWmm, h: pageHmm } = getPageDimensions(page.orientation);
        const scale = pageEl.clientWidth / pageWmm;
        const currentBox = getBeschriftungImageBox(page, pageWmm, pageHmm);

        if (rotateHandle) {
            const pageRect = pageEl.getBoundingClientRect();
            const centerX = pageRect.left + (currentBox.x + currentBox.w / 2) * scale;
            const centerY = pageRect.top + (currentBox.y + currentBox.h / 2) * scale;
            imageDrag = {
                page, wrapper, mode: 'rotate',
                centerX, centerY,
                startAngle: Math.atan2(e.clientY - centerY, e.clientX - centerX) * 180 / Math.PI,
                startRotation: page.imageRotation || 0
            };
            document.body.style.cursor = ROTATE_CURSOR;
        } else {
            imageDrag = {
                page, wrapper, scale, pageWmm, pageHmm,
                mode: resizeHandle ? 'resize' : 'move',
                corner: resizeHandle ? resizeHandle.dataset.corner : null,
                rotation: page.imageRotation || 0,
                startX: e.clientX,
                startY: e.clientY,
                startBox: currentBox
            };
        }
        (handle || wrapper).setPointerCapture(e.pointerId);
        e.preventDefault();
    });

    document.addEventListener('pointermove', (e) => {
        if (!imageDrag) return;
        const { wrapper, mode } = imageDrag;

        if (mode === 'rotate') {
            const { centerX, centerY, startAngle, startRotation } = imageDrag;
            const angle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * 180 / Math.PI;
            let newRotation = startRotation + (angle - startAngle);
            newRotation = ((newRotation + 180) % 360 + 360) % 360 - 180; // auf -180..180 normalisieren
            imageDrag.pendingRotation = newRotation;
            wrapper.style.transform = `rotate(${newRotation}deg)`;
            const rotationInput = document.getElementById('beschriftung-image-rotation');
            if (rotationInput) rotationInput.value = Math.round(newRotation);
            const rotationValue = document.getElementById('beschriftung-image-rotation-value');
            if (rotationValue) rotationValue.textContent = Math.round(newRotation) + '°';
            return;
        }

        const { scale, corner, rotation, startX, startY, startBox, pageWmm, pageHmm } = imageDrag;
        const dxMm = (e.clientX - startX) / scale;
        const dyMm = (e.clientY - startY) / scale;

        if (mode === 'move') {
            const x = startBox.x + dxMm;
            const y = startBox.y + dyMm;
            imageDrag.pendingBox = { x, y, w: startBox.w, h: startBox.h };
            wrapper.style.left = (x * scale) + 'px';
            wrapper.style.top = (y * scale) + 'px';
            return;
        }

        // Zeigerbewegung um -rotation zurückdrehen, um sie im ungedrehten Koordinatensystem
        // der Box zu erhalten (die Box selbst ist ja per CSS-transform gedreht dargestellt).
        const rad = -rotation * Math.PI / 180;
        const localDx = dxMm * Math.cos(rad) - dyMm * Math.sin(rad);
        const localDy = dxMm * Math.sin(rad) + dyMm * Math.cos(rad);

        let { x, y, w, h } = startBox;
        if (corner === 'br') { w = startBox.w + localDx; h = startBox.h + localDy; }
        else if (corner === 'bl') { w = startBox.w - localDx; h = startBox.h + localDy; }
        else if (corner === 'tr') { w = startBox.w + localDx; h = startBox.h - localDy; }
        else if (corner === 'tl') { w = startBox.w - localDx; h = startBox.h - localDy; }

        // Größe begrenzen (Minimum UND Maximum — das Bild darf nicht größer als die verfügbare
        // Seitenfläche werden, sonst kollidiert es mit Titel/Stückliste oder ragt über die Seite
        // hinaus). Die dem gezogenen Eck gegenüberliegende Kante bleibt dabei jeweils fix stehen.
        const maxW = pageWmm - 20;
        const maxH = pageHmm - BESCHRIFTUNG_IMAGE_TOP - 10;
        w = Math.min(Math.max(w, MIN_IMAGE_SIZE_MM), maxW);
        h = Math.min(Math.max(h, MIN_IMAGE_SIZE_MM), maxH);
        if (corner === 'tl' || corner === 'bl') x = (startBox.x + startBox.w) - w; // rechte Kante bleibt fix
        if (corner === 'tl' || corner === 'tr') y = (startBox.y + startBox.h) - h; // untere Kante bleibt fix

        imageDrag.pendingBox = { x, y, w, h };
        wrapper.style.left = (x * scale) + 'px';
        wrapper.style.top = (y * scale) + 'px';
        wrapper.style.width = (w * scale) + 'px';
        wrapper.style.height = (h * scale) + 'px';
    });

    document.addEventListener('pointerup', () => {
        if (!imageDrag) return;
        const { page, mode, pendingBox, pendingRotation } = imageDrag;
        if (mode === 'rotate' && pendingRotation != null) {
            page.imageRotation = pendingRotation;
        } else if (pendingBox) {
            page.imageXMm = pendingBox.x;
            page.imageYMm = pendingBox.y;
            page.imageWidthMm = pendingBox.w;
            page.imageHeightMm = pendingBox.h;
        }
        imageDrag = null;
        document.body.style.cursor = '';
        window.renderBeschriftungPreview();
    });

    // Baut die HTML-Tabelle für einen Stückliste-Abschnitt (mit Kopfzeile) an einer bestimmten
    // Position — wird sowohl für die erste Seite als auch für Fortsetzungsseiten verwendet.
    function buildStuecklisteTableHtml(rows, scale, pageW, topMm) {
        const tableW = pageW - 40;
        const rowsHtml = rows.map(r => `
            <tr>
                <td style="border:1px solid #ccc; padding:4px 6px; font-weight:700;">${escapeHtml(r.nummer)}</td>
                <td style="border:1px solid #ccc; padding:4px 6px; font-weight:700;">${escapeHtml(r.bez1)}</td>
                <td style="border:1px solid #ccc; padding:4px 6px; font-weight:700;">${escapeHtml(r.bez2)}</td>
                <td style="border:1px solid #ccc; padding:4px 6px; text-align:center; font-weight:700;">${escapeHtml(r.menge)}</td>
                <td style="border:1px solid #ccc; padding:4px 6px; text-align:center; font-weight:700;">${escapeHtml(r.einheit || 'stk')}</td>
            </tr>
        `).join('');
        return `
            <table style="position:absolute; left:${20 * scale}px; top:${topMm * scale}px; width:${tableW * scale}px; border-collapse:collapse; font-size:${3.2 * scale}px; font-family:Helvetica,Arial,sans-serif; color:#141414;">
                <thead>
                    <tr style="background:#1e293b; color:#fff;">
                        <th style="border:1px solid #ccc; padding:4px 6px; text-align:left; font-weight:700;">Art.-Nr.</th>
                        <th style="border:1px solid #ccc; padding:4px 6px; text-align:left; font-weight:700;">Bezeichnung 1</th>
                        <th style="border:1px solid #ccc; padding:4px 6px; text-align:left; font-weight:700;">Bezeichnung 2</th>
                        <th style="border:1px solid #ccc; padding:4px 6px; font-weight:700;">Menge</th>
                        <th style="border:1px solid #ccc; padding:4px 6px; font-weight:700;">Einheit</th>
                    </tr>
                </thead>
                <tbody>${rowsHtml}</tbody>
            </table>
        `;
    }

    // Feste Maße (mm) für eine Stückliste-Zeile/Kopfzeile — abgestimmt auf die fette 10pt-Schrift
    // (siehe styles/headStyles in drawBeschriftungPage). Als gemeinsame Konstanten von Vorschau
    // UND PDF-Export genutzt (siehe computeStuecklistePageBreaks), damit beide garantiert densel-
    // ben Umbruch berechnen — kein Rätselraten/Trockenlauf über eine externe PDF-Bibliothek nötig,
    // das war fehleranfällig (z.B. ohne Internetverbindung für die CDN-Bibliothek) und konnte dazu
    // führen, dass die Vorschau bei einem Fehler stumm ALLES auf eine Seite zwängte, obwohl es
    // nicht passte — sichtbar als über den Seitenrand hinausragende Tabelle.
    const STUECKLISTE_ROW_H_MM = 7.5;
    const STUECKLISTE_HEADER_H_MM = 7.5;
    const STUECKLISTE_BOTTOM_MARGIN_MM = 15; // Sicherheitsabstand zum unteren Seitenrand
    const STUECKLISTE_CONT_TOP_MM = 20; // oberer Rand auf Fortsetzungsseiten (kein Titel/Bild dort)

    // Teilt die Stückliste-Zeilen deterministisch auf so viele Seiten auf, wie tatsächlich
    // gebraucht werden — rein synchrone mm-Rechnung (keine PDF-Bibliothek nötig), damit Vorschau
    // und PDF-Export garantiert exakt denselben Umbruch verwenden (siehe drawBeschriftungPage,
    // das dieselbe Funktion für den echten Druck aufruft).
    function computeStuecklistePageBreaks(rows, imageBottomMm, pageH) {
        const firstAvail = pageH - STUECKLISTE_BOTTOM_MARGIN_MM - (imageBottomMm + 10) - STUECKLISTE_HEADER_H_MM;
        const firstRows = Math.max(0, Math.floor(firstAvail / STUECKLISTE_ROW_H_MM));

        if (rows.length <= firstRows) return [rows];

        const contAvail = pageH - STUECKLISTE_BOTTOM_MARGIN_MM - STUECKLISTE_CONT_TOP_MM - STUECKLISTE_HEADER_H_MM;
        const contRows = Math.max(1, Math.floor(contAvail / STUECKLISTE_ROW_H_MM));

        const chunks = [rows.slice(0, firstRows)];
        let idx = firstRows;
        while (idx < rows.length) {
            chunks.push(rows.slice(idx, idx + contRows));
            idx += contRows;
        }
        return chunks;
    }

    window.renderBeschriftungPreview = function () {
        const page = getCurrentBeschriftungPage();
        const container = document.getElementById('beschriftung-preview-pages');
        if (!container) return;

        const { w: pageW, h: pageH } = getPageDimensions(page.orientation);
        const scale = Math.min((container.clientWidth || 600) / pageW, 3.2); // px pro mm

        const ROW1_TOP = BESCHRIFTUNG_ROW1_TOP, ROW1_H = BESCHRIFTUNG_ROW1_H;
        const ROW2_TOP = BESCHRIFTUNG_ROW2_TOP;
        const IMAGE_TOP = BESCHRIFTUNG_IMAGE_TOP;
        const logoW = 36;

        let firstPageHtml = '';

        // Logo oben rechts (in Farbe — auf den kleinen Etiketten bleibt es schwarz/weiß)
        if (window.MEETRA_LOGO_BASE64) {
            firstPageHtml += `<img src="${window.MEETRA_LOGO_BASE64}" style="position:absolute; top:${ROW1_TOP * scale}px; right:${10 * scale}px; width:${logoW * scale}px;">`;
        }

        // Titel — eigene Reihe wie das Logo, aber unabhängig vom Logo mittig auf der gesamten
        // Seite zentriert (nicht im verbleibenden Platz neben dem Logo)
        if (page.title) {
            const titleFontSizeMm = ptToMm(page.titleFontSize || 18);
            firstPageHtml += `<div style="position:absolute; top:${ROW1_TOP * scale}px; left:${10 * scale}px; right:${10 * scale}px; height:${ROW1_H * scale}px; display:flex; align-items:center; justify-content:center; text-align:center; font-weight:800; font-size:${titleFontSizeMm * scale}px; line-height:1.1; color:#141414; font-family:Helvetica,Arial,sans-serif; overflow:hidden;">${escapeHtml(page.title)}</div>`;
        }

        // Kurzbeschreibung / Bezeichnung 2 — eigene Reihe darunter, zentriert über volle Breite
        if (page.bez2) {
            const bez2FontSizeMm = ptToMm(page.bez2FontSize || 11);
            firstPageHtml += `<div style="position:absolute; top:${ROW2_TOP * scale}px; left:${10 * scale}px; right:${10 * scale}px; text-align:center; font-weight:500; font-size:${bez2FontSizeMm * scale}px; color:#444; font-family:Helvetica,Arial,sans-serif;">${escapeHtml(page.bez2)}</div>`;
        }

        // Bild mittig, großzügige Box — erst eine Reihe unter Titel/Logo und Kurzbeschreibung,
        // wird bei großen Bildern automatisch passend verkleinert. Sind imageWidthMm/imageXMm etc.
        // gesetzt (Nutzer hat per Eckpunkt skaliert/verschoben), wird diese Box statt der
        // Auto-Anpassung verwendet. Die Drehung wird rein visuell per CSS-transform auf den
        // Wrapper angewendet (rotiert um die Boxmitte) — die Box selbst bleibt unrotiert, die
        // 4 Ziehpunkte sitzen an ihren Ecken und drehen sich mit.
        let imageBottomMm = IMAGE_TOP;
        if (page.imageDataUrl) {
            const box = getBeschriftungImageBox(page, pageW, pageH);
            const rotation = page.imageRotation || 0;
            firstPageHtml += `
                <div class="beschriftung-image-wrapper" style="position:absolute; left:${box.x * scale}px; top:${box.y * scale}px; width:${box.w * scale}px; height:${box.h * scale}px; transform:rotate(${rotation}deg); transform-origin:center center; cursor:move; touch-action:none;">
                    <img src="${page.imageDataUrl}" style="width:100%; height:100%; object-fit:fill; pointer-events:none; user-select:none; display:block;">
                    <div class="beschriftung-image-resize-handle" data-corner="tl" style="position:absolute; left:-7px; top:-7px; width:16px; height:16px; border-radius:50%; background:#ef4444; border:2px solid #fff; cursor:nwse-resize; box-shadow:0 2px 6px rgba(0,0,0,0.4); touch-action:none;"></div>
                    <div class="beschriftung-image-resize-handle" data-corner="tr" style="position:absolute; right:-7px; top:-7px; width:16px; height:16px; border-radius:50%; background:#ef4444; border:2px solid #fff; cursor:nesw-resize; box-shadow:0 2px 6px rgba(0,0,0,0.4); touch-action:none;"></div>
                    <div class="beschriftung-image-resize-handle" data-corner="bl" style="position:absolute; left:-7px; bottom:-7px; width:16px; height:16px; border-radius:50%; background:#ef4444; border:2px solid #fff; cursor:nesw-resize; box-shadow:0 2px 6px rgba(0,0,0,0.4); touch-action:none;"></div>
                    <div class="beschriftung-image-resize-handle" data-corner="br" style="position:absolute; right:-7px; bottom:-7px; width:16px; height:16px; border-radius:50%; background:#ef4444; border:2px solid #fff; cursor:nwse-resize; box-shadow:0 2px 6px rgba(0,0,0,0.4); touch-action:none;"></div>
                    <div style="position:absolute; left:50%; top:-24px; width:1.5px; height:15px; background:#3b82f6; transform:translateX(-50%); pointer-events:none;"></div>
                    <div class="beschriftung-image-rotate-handle" style="position:absolute; left:50%; top:-32px; width:15px; height:15px; margin-left:-7.5px; border-radius:50%; background:#3b82f6; border:2px solid #fff; cursor:${ROTATE_CURSOR}; box-shadow:0 2px 6px rgba(0,0,0,0.4); touch-action:none;"></div>
                </div>`;
            imageBottomMm = box.y + box.h;
        }

        // Stückliste ggf. auf mehrere Seiten aufteilen (siehe computeStuecklistePageBreaks) —
        // exakt dieselbe Berechnung, die später auch das echte PDF erzeugt (drawBeschriftungPage),
        // damit die Vorschau hier garantiert genauso umbricht.
        let pageChunks = [[]];
        if (page.stuecklisteEnabled && page.rows.length > 0) {
            pageChunks = computeStuecklistePageBreaks(page.rows, imageBottomMm, pageH);
        }

        if (pageChunks[0] && pageChunks[0].length) {
            firstPageHtml += buildStuecklisteTableHtml(pageChunks[0], scale, pageW, imageBottomMm + 10);
        }

        const totalPages = pageChunks.length;
        const pageWpx = pageW * scale;
        const pageHpx = pageH * scale;

        let pagesHtml = `
            <div class="beschriftung-preview-physical-page" style="position:relative; width:${pageWpx}px; height:${pageHpx}px; background:#fff; border-radius:6px; box-shadow:0 4px 24px rgba(0,0,0,0.35); flex-shrink:0;">
                ${totalPages > 1 ? `<div style="position:absolute; top:6px; left:10px; font-size:10px; color:rgba(0,0,0,0.25); font-family:Arial,sans-serif;">Seite 1 / ${totalPages}</div>` : ''}
                ${firstPageHtml}
            </div>`;

        // Fortsetzungsseiten: nur noch die weiterlaufende Stückliste-Tabelle (mit wiederholter
        // Kopfzeile), kein Titel/Bild — genau wie autoTable es im echten PDF handhabt.
        for (let i = 1; i < totalPages; i++) {
            const contRows = pageChunks[i] || [];
            const contTableHtml = buildStuecklisteTableHtml(contRows, scale, pageW, 20);
            pagesHtml += `
                <div class="beschriftung-preview-physical-page" style="position:relative; width:${pageWpx}px; height:${pageHpx}px; background:#fff; border-radius:6px; box-shadow:0 4px 24px rgba(0,0,0,0.35); flex-shrink:0;">
                    <div style="position:absolute; top:6px; left:10px; font-size:10px; color:rgba(0,0,0,0.25); font-family:Arial,sans-serif;">Seite ${i + 1} / ${totalPages} — Fortsetzung Stückliste</div>
                    ${contTableHtml}
                </div>`;
        }

        container.innerHTML = pagesHtml;
    };

    // Lädt eine Bild-Data-URL als Image-Objekt (asynchron, auch wenn Data-URLs meist synchron
    // laden — auf Nummer sicher, da wir hier vor dem PDF-Export korrekt warten müssen).
    function loadImageAsync(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('Bild konnte nicht geladen werden.'));
            img.src = src;
        });
    }

    // Rendert das gedrehte Bild in ein neues, vergrößertes Canvas (Bounding-Box der gedrehten
    // Rechteckfläche), damit beim Drehen nichts abgeschnitten wird — exakt dasselbe Prinzip wie
    // die CSS-Rotation in der Live-Vorschau (Drehung um die Boxmitte). Liefert die neue Bild-
    // Data-URL zusammen mit ihrer Größe in mm, damit sie zentriert auf der ursprünglichen Box
    // ins PDF eingefügt werden kann.
    async function getRotatedImageDataUrl(dataUrl, boxWmm, boxHmm, rotationDeg) {
        const img = await loadImageAsync(dataUrl);
        const PX_PER_MM = 6;
        const scaledW = boxWmm * PX_PER_MM;
        const scaledH = boxHmm * PX_PER_MM;
        const rad = rotationDeg * Math.PI / 180;
        const boundW = Math.abs(scaledW * Math.cos(rad)) + Math.abs(scaledH * Math.sin(rad));
        const boundH = Math.abs(scaledW * Math.sin(rad)) + Math.abs(scaledH * Math.cos(rad));

        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(boundW);
        canvas.height = Math.ceil(boundH);
        const ctx = canvas.getContext('2d');
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(rad);
        ctx.drawImage(img, -scaledW / 2, -scaledH / 2, scaledW, scaledH);

        return { url: canvas.toDataURL('image/png'), w: boundW / PX_PER_MM, h: boundH / PX_PER_MM };
    }

    async function drawBeschriftungPage(doc, page, pageW, pageH, logo) {
        const ROW1_TOP = BESCHRIFTUNG_ROW1_TOP, ROW1_H = BESCHRIFTUNG_ROW1_H;
        const ROW2_TOP = BESCHRIFTUNG_ROW2_TOP, ROW2_H = BESCHRIFTUNG_ROW2_H;
        const IMAGE_TOP = BESCHRIFTUNG_IMAGE_TOP;

        const logoW = 36;
        const logoRightEdge = pageW - 10 - logoW;

        if (logo) {
            const logoH = logoW / logo.ratio;
            doc.addImage(logo.url, 'PNG', logoRightEdge, ROW1_TOP, logoW, logoH);
        }

        // Titel — eigene Reihe wie das Logo, aber unabhängig vom Logo mittig auf der gesamten
        // Seite zentriert (nicht im verbleibenden Platz neben dem Logo)
        if (page.title) {
            doc.setTextColor(20, 20, 20);
            const titleFontSize = page.titleFontSize || 18;
            fitCenteredText(doc, page.title, pageW / 2, ROW1_TOP + ROW1_H / 2 + 3, pageW - 20, titleFontSize, Math.min(9, titleFontSize), 'bold');
        }

        // Kurzbeschreibung / Bezeichnung 2 — eigene Reihe darunter, zentriert über volle Breite
        if (page.bez2) {
            doc.setTextColor(70, 70, 70);
            const bez2FontSize = page.bez2FontSize || 11;
            fitCenteredText(doc, page.bez2, pageW / 2, ROW2_TOP + ROW2_H / 2 + 1.5, pageW - 20, bez2FontSize, Math.min(7, bez2FontSize), 'normal');
        }

        // Bild mittig, großzügige Box — erst eine Reihe unter Titel/Logo und Kurzbeschreibung,
        // wird bei großen Bildern automatisch passend verkleinert (oder per Eckpunkt in der
        // Vorschau manuell skaliert/verschoben, siehe getBeschriftungImageBox). Bei gesetzter
        // Drehung wird das Bild vorher auf ein vergrößertes Canvas gedreht (siehe
        // getRotatedImageDataUrl), damit das PDF exakt der Live-Vorschau entspricht.
        let imageBottomMm = IMAGE_TOP;
        if (page.imageDataUrl) {
            const box = getBeschriftungImageBox(page, pageW, pageH);
            const rotation = page.imageRotation || 0;
            if (rotation) {
                const rotated = await getRotatedImageDataUrl(page.imageDataUrl, box.w, box.h, rotation);
                const rx = box.x + box.w / 2 - rotated.w / 2;
                const ry = box.y + box.h / 2 - rotated.h / 2;
                doc.addImage(rotated.url, rx, ry, rotated.w, rotated.h);
                imageBottomMm = ry + rotated.h;
            } else {
                doc.addImage(page.imageDataUrl, box.x, box.y, box.w, box.h);
                imageBottomMm = box.y + box.h;
            }
        }

        // Stückliste ggf. auf mehrere Seiten aufteilen — dieselbe Berechnung wie in der Live-
        // Vorschau (computeStuecklistePageBreaks), damit die Seitenzahl und die Zeilen je Seite
        // hier garantiert exakt übereinstimmen, statt autoTable selbst (abweichend von der
        // Vorschau) intern umbrechen zu lassen.
        if (page.stuecklisteEnabled && page.rows.length > 0) {
            const orientation = pageW >= pageH ? 'l' : 'p';
            const chunks = computeStuecklistePageBreaks(page.rows, imageBottomMm, pageH);
            chunks.forEach((chunkRows, i) => {
                if (chunkRows.length === 0) return;
                if (i > 0) doc.addPage([pageW, pageH], orientation);
                doc.autoTable({
                    startY: i === 0 ? imageBottomMm + 10 : STUECKLISTE_CONT_TOP_MM,
                    margin: { left: 20, right: 20 },
                    head: [['Art.-Nr.', 'Bezeichnung 1', 'Bezeichnung 2', 'Menge', 'Einheit']],
                    body: chunkRows.map(r => [r.nummer, r.bez1, r.bez2, r.menge, r.einheit || 'stk']),
                    styles: { fontSize: 10, font: 'helvetica', fontStyle: 'bold' },
                    headStyles: { fillColor: [30, 41, 59], fontStyle: 'bold' }
                });
            });
        }
    }

    window.printBeschriftung = async function () {
        const hasContent = beschriftungPages.some(p => p.title || p.imageDataUrl);
        if (!hasContent) {
            alert('Bitte mindestens auf einer Seite einen Titel oder ein Bild angeben.');
            return;
        }

        try {
            if (typeof window.loadPDFGenerators === 'function') {
                await window.loadPDFGenerators();
            }

            let logo = null;
            try { logo = await loadEmbeddedLogoColor(); } catch (e) { console.warn(e); }

            const { jsPDF } = window.jspdf;
            let doc = null;

            for (let idx = 0; idx < beschriftungPages.length; idx++) {
                const page = beschriftungPages[idx];
                const { w: pageW, h: pageH } = getPageDimensions(page.orientation);
                if (idx === 0) {
                    doc = new jsPDF({ unit: 'mm', format: [pageW, pageH], orientation: page.orientation });
                } else {
                    doc.addPage([pageW, pageH], page.orientation);
                }
                await drawBeschriftungPage(doc, page, pageW, pageH, logo);
            }

            doc.save(`Beschriftung_${new Date().toISOString().slice(0, 10)}.pdf`);
        } catch (err) {
            console.error('Error generating Beschriftung PDF:', err);
            alert('Fehler beim Erzeugen des PDF: ' + err.message);
        }
    };
})();
