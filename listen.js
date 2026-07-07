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

    // Füllt die Status- und Maschinen-Filter-Dropdowns (links vom Suchfeld) mit den aktuell
    // vorkommenden Werten. Vorherige Auswahl wird beibehalten, falls sie noch existiert.
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
            const labels = new Set();
            angeboteList.forEach(a => {
                const label = getAngebotMachineLabel(a);
                if (label) labels.add(label);
            });
            const sorted = [...labels].sort((a, b) => a.localeCompare(b, 'de'));
            machineSelect.innerHTML = '<option value="">Alle Maschinen</option>' +
                sorted.map(label => `<option value="${escapeHtml(label)}">${escapeHtml(label)}</option>`).join('');
            if (sorted.includes(prevValue)) machineSelect.value = prevValue;
            if (typeof window.initGlassSelect === 'function') window.initGlassSelect(machineSelect);
            machineSelect.dispatchEvent(new Event('change'));
        }
    }

    window.renderAngeboteList = function () {
        const container = document.getElementById('angebote-list-container');
        if (!container) return;

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

        container.innerHTML = `
            <div style="overflow-x:auto;">
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
                            const spanne = (a.nettobetrag !== null && a.nettobetrag !== undefined && a.ek_betrag !== null && a.ek_betrag !== undefined)
                                ? Number(a.nettobetrag) - Number(a.ek_betrag)
                                : null;
                            // Farbiger Akzent links an der Zeile, analog zur Buchhaltung — Farbe kommt
                            // direkt von der Status-Kategorie (Einstellungen -> Kategorien -> Angebots-Status),
                            // nicht hart im Code verdrahtet.
                            const statusCat = (window.categoryList || []).find(c => c.type === 'status' && c.name === a.status);
                            const accentStyle = statusCat?.color ? `box-shadow: inset 4px 0 0 0 ${statusCat.color};` : '';
                            return `
                            <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
                                <td style="padding:10px; color:rgba(255,255,255,0.8); font-size:0.88rem; ${accentStyle}">${fmtDate(a.belegdatum)}</td>
                                <td style="padding:10px; color:white; font-weight:700; font-size:0.88rem;">${escapeHtml(a.belegnummer)}</td>
                                <td style="padding:10px; color:white; font-size:0.88rem;">${escapeHtml(firmaDisplay)}</td>
                                <td style="padding:10px; text-align:right; color:rgba(255,255,255,0.8); font-size:0.88rem;">${fmtNumberInput(a.nettobetrag)}</td>
                                <td style="padding:10px; font-size:0.88rem; min-width:130px;">
                                    <input type="text" class="glass-form-input" value="${escapeHtml(fmtNumberInput(a.ek_betrag))}"
                                        placeholder="EK..." style="height:34px; font-size:0.85rem; text-align:right;"
                                        onblur="window.updateAngebotEk('${a.id}', this.value)"
                                        onkeydown="if(event.key==='Enter'){ this.blur(); }">
                                </td>
                                <td style="padding:10px; text-align:right; color:white; font-weight:600; font-size:0.88rem;">${spanne !== null ? fmtNumberInput(spanne) : ''}</td>
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
                </table>
            </div>
        `;

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
        if (!badge) return;
        const { ueberfaellig, zeitnah } = getAngeboteReminders();
        const total = ueberfaellig.length + zeitnah.length;
        if (total > 0) {
            badge.textContent = total;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
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
