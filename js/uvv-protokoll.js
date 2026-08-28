// ==========================================================
// UVV- & WARTUNGSPROTOKOLL (ohne Servicebericht)
// ----------------------------------------------------------
// Maschine → Aktionen → Anlegen → „UVV- & Wartungsprotokoll".
// Gedacht für Maschinen, die bei uns in der Werkstatt stehen:
// dort soll nur die Prüfliste ausgefüllt werden, ohne den ganzen
// Servicebericht (Kunde, Fahrzeit, Material, Unterschriften …).
//
// Die Prüftabellen selbst kommen unverändert aus js/checklists.js.
// Damit dieselben Tabellen in einem zweiten Fenster laufen können,
// ohne die IDs des Servicebericht-Formulars ein zweites Mal zu
// vergeben, meldet dieses Fenster über window.setChecklistContext
// seine eigenen Container an.
//
// Gespeichert wird als ganz normale Zeile in "service_entries"
// (title = UVV_TITEL, checklist_payload = Prüfliste). Dadurch
// erscheint das Protokoll ohne weiteres Zutun in der Historie der
// Maschine und in den Auswertungen, die auf checklist_payload
// schauen (nächste Wartung, Kalender, Wartungsarten).
//
// EIGENSTAENDIG: Datei + die beiden Knöpfe in index.html + der
// Historien-Zweig auf UVV_TITEL — mehr hängt nicht daran.
// ==========================================================

(function () {
    'use strict';

    const UVV_TITEL = 'UVV- & Wartungsprotokoll';
    window.UVV_PROTOKOLL_TITEL = UVV_TITEL;

    const TYPEN = [
        { key: 'wartung', label: 'Wartungsprotokoll' },
        { key: 'uvv', label: 'UVV-Protokoll' },
        { key: 'einweisung', label: 'Einweisung' }
    ];

    let maschine = null;
    let eintragId = null;       // gesetzt = bestehendes Protokoll wird bearbeitet
    let gewaehlteTypen = [];    // 'wartung' | 'uvv' | 'einweisung'
    let gewaehlteTechniker = [];
    let speichert = false;

    const esc = (s) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    function sb() { return window.supabaseClient; }

    function heute() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    function maschinenTitel(m) {
        if (!m) return '';
        return [m.manufacturer, m.name].filter(Boolean).join(' ');
    }

    // Der Merker aus js/service-list.js, auf den auch die Mietvereinbarung zugreift.
    function aktuelleMaschinenId() {
        if (typeof currentSelectedMachineForService !== 'undefined' && currentSelectedMachineForService) {
            return currentSelectedMachineForService;
        }
        return window.currentSelectedMachineForService || null;
    }

    // ------------------------------------------------------
    // Fenster aufbauen (einmalig, wie beim Routenplaner)
    // ------------------------------------------------------
    function ensureModal() {
        if (document.getElementById('uvv-protokoll-modal')) return;
        const wrap = document.createElement('div');
        wrap.id = 'uvv-protokoll-modal';
        wrap.className = 'uvvp-backdrop';
        wrap.innerHTML = `
            <div class="uvvp-window">
                <div class="uvvp-head">
                    <div>
                        <h2 id="uvvp-title">${esc(UVV_TITEL)}</h2>
                        <span class="uvvp-sub">Prüfliste ohne Servicebericht — für Maschinen in der Werkstatt</span>
                    </div>
                    <button type="button" class="btn-close-modal" onclick="window.closeUvvProtokoll()">&times;</button>
                </div>

                <div class="uvvp-body">
                    <div class="uvvp-machine" id="uvvp-machine"></div>

                    <div class="uvvp-grid">
                        <div class="form-group">
                            <label for="uvvp-date">Datum</label>
                            <input type="date" id="uvvp-date" class="glass-form-input">
                        </div>
                        <div class="form-group">
                            <label for="uvvp-hours">Betriebsstunden</label>
                            <input type="text" id="uvvp-hours" class="glass-form-input" placeholder="z.B. 1450">
                        </div>
                    </div>

                    <div class="form-group">
                        <label>Prüfer</label>
                        <div id="uvvp-techs" class="uvvp-chips"></div>
                    </div>

                    <div class="form-group">
                        <label>Was wird protokolliert?</label>
                        <div id="uvvp-types" class="uvvp-chips"></div>
                    </div>

                    <div class="form-group">
                        <label>Prüfpläne (Mehrfachauswahl möglich)</label>
                        <div id="uvvp-selector"></div>
                    </div>

                    <div id="uvvp-questions"></div>

                    <div class="form-group" style="margin-top:1.25rem;">
                        <label for="uvvp-remark">Bemerkung</label>
                        <textarea id="uvvp-remark" class="glass-form-input" rows="3" placeholder="Auffälligkeiten, Hinweise …"></textarea>
                    </div>
                </div>

                <div class="uvvp-foot">
                    <button type="button" class="btn-secondary" onclick="window.closeUvvProtokoll()">Abbrechen</button>
                    <button type="button" class="btn-primary" id="uvvp-save" onclick="window.saveUvvProtokoll()">Speichern</button>
                </div>
            </div>`;
        document.body.appendChild(wrap);
        wrap.addEventListener('click', (e) => { if (e.target === wrap) window.closeUvvProtokoll(); });
    }

    // ------------------------------------------------------
    // Kopf: Angaben über die Maschine
    // ------------------------------------------------------
    function renderMaschine() {
        const el = document.getElementById('uvvp-machine');
        if (!el || !maschine) return;
        const kat = (window.categoryList || []).find(c => String(c.id) === String(maschine.category_id));
        const felder = [
            ['Maschine', maschinenTitel(maschine)],
            ['Seriennummer', maschine.serial || maschine.serial_number || '—'],
            ['Baujahr', maschine.year || '—'],
            ['Maschinenserie', maschine.machine_series || '—'],
            ['Kategorie', kat ? kat.name : '—'],
            ['Standort', [maschine.location_company || maschine.company,
                          maschine.location_city || maschine.operator_city].filter(Boolean).join(', ') || '—']
        ];
        el.innerHTML = `
            ${maschine.image_url ? `<img src="${esc(maschine.image_url)}" alt="" class="uvvp-machine-img">` : ''}
            <div class="uvvp-machine-facts">
                ${felder.map(([k, v]) => `<div><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`).join('')}
            </div>`;
    }

    function renderTechniker() {
        const el = document.getElementById('uvvp-techs');
        if (!el) return;
        const users = window.userList || [];
        if (!users.length) {
            el.innerHTML = '<span class="uvvp-hint">Keine Benutzer geladen.</span>';
            return;
        }
        el.innerHTML = users.map(u => `
            <button type="button" class="uvvp-chip${gewaehlteTechniker.includes(u.id) ? ' active' : ''}"
                    onclick="window.uvvToggleTechniker('${esc(String(u.id))}')">${esc(u.name || 'Unbenannt')}</button>`).join('');
    }

    function renderTypen() {
        const el = document.getElementById('uvvp-types');
        if (!el) return;
        el.innerHTML = TYPEN.map(t => `
            <button type="button" class="uvvp-chip${gewaehlteTypen.includes(t.key) ? ' active' : ''}"
                    onclick="window.uvvToggleTyp('${t.key}')">${esc(t.label)}</button>`).join('');
    }

    // Der Kontext entscheidet, welche Prüfpläne angeboten werden: checklists.js
    // filtert die Pläne über diesen Text (enthält 'wartung' / 'uvv' / 'einweisung').
    function applyContext() {
        if (typeof window.setChecklistContext !== 'function') return;
        window.setChecklistContext({
            selectorId: 'uvvp-selector',
            questionsId: 'uvvp-questions',
            categoryText: gewaehlteTypen.join(' '),
            machineId: maschine ? maschine.id : null,
            machineName: maschinenTitel(maschine)
        });
    }

    function renderChecklisten() {
        applyContext();
        const sel = document.getElementById('uvvp-selector');
        if (!gewaehlteTypen.length) {
            if (sel) sel.innerHTML = '<span class="uvvp-hint">Oben auswählen, was protokolliert werden soll.</span>';
            const q = document.getElementById('uvvp-questions');
            if (q) q.innerHTML = '';
            return;
        }
        if (typeof window.populateChecklistSelector === 'function') window.populateChecklistSelector();
        if (typeof window.renderActiveChecklists === 'function') window.renderActiveChecklists();
    }

    window.uvvToggleTyp = function (key) {
        const i = gewaehlteTypen.indexOf(key);
        if (i > -1) {
            gewaehlteTypen.splice(i, 1);
            // Prüflisten der abgewählten Art wieder entfernen, sonst blieben sie
            // unsichtbar im Payload stehen und landeten mit im gespeicherten Protokoll.
            const payload = typeof window.getChecklistPayload === 'function' ? window.getChecklistPayload() : null;
            if (payload && Array.isArray(payload.checklists)) {
                const rest = payload.checklists.filter(cl => cl.type !== key);
                if (typeof window.loadChecklistPayload === 'function') {
                    applyContext();
                    window.loadChecklistPayload(rest.length ? { checklists: rest } : null);
                }
            }
        } else {
            gewaehlteTypen.push(key);
        }
        renderTypen();
        renderChecklisten();
    };

    window.uvvToggleTechniker = function (id) {
        const users = window.userList || [];
        const user = users.find(u => String(u.id) === String(id));
        const realId = user ? user.id : id;
        const i = gewaehlteTechniker.findIndex(x => String(x) === String(realId));
        if (i > -1) gewaehlteTechniker.splice(i, 1);
        else gewaehlteTechniker.push(realId);
        renderTechniker();
    };

    // ------------------------------------------------------
    // Öffnen
    // ------------------------------------------------------
    window.openUvvProtokoll = async function (machineId, entryIdArg) {
        if (typeof window.closeServiceActionModal === 'function') window.closeServiceActionModal();

        const id = machineId || aktuelleMaschinenId();
        maschine = (window.machineList || []).find(m => String(m.id) === String(id)) || null;
        if (!maschine) { window.showToast('Keine Maschine ausgewählt.'); return; }

        ensureModal();
        eintragId = entryIdArg || null;
        speichert = false;
        gewaehlteTypen = ['wartung', 'uvv'];
        const aktiv = window.activeUser;
        gewaehlteTechniker = aktiv && aktiv.id ? [aktiv.id] : [];

        document.getElementById('uvvp-title').textContent =
            eintragId ? UVV_TITEL + ' bearbeiten' : UVV_TITEL;
        document.getElementById('uvvp-date').value = heute();
        document.getElementById('uvvp-hours').value = '';
        document.getElementById('uvvp-remark').value = '';

        const modal = document.getElementById('uvv-protokoll-modal');
        modal.classList.add('show');
        document.body.style.overflow = 'hidden';

        renderMaschine();
        renderTechniker();
        renderTypen();

        // Leerer Start: eine noch offene Prüfliste aus dem Servicebericht darf
        // hier nicht mit hereinrutschen.
        applyContext();
        if (typeof window.loadChecklistPayload === 'function') window.loadChecklistPayload(null);
        renderChecklisten();

        if (eintragId) await ladeEintrag();
        else await ladeBetriebsstunden();
    };

    window.closeUvvProtokoll = function () {
        const modal = document.getElementById('uvv-protokoll-modal');
        if (modal) modal.classList.remove('show');
        document.body.style.overflow = '';
        // Erst leeren (noch mit eigenem Kontext, damit nur DIESE Container
        // betroffen sind), dann den Kontext zurückgeben — sonst zeichnete der
        // Servicebericht seine Prüftabellen anschließend in dieses (versteckte)
        // Fenster bzw. verlöre seine eigene Prüfliste.
        if (typeof window.loadChecklistPayload === 'function') {
            try { window.loadChecklistPayload(null); } catch (e) { }
        }
        if (typeof window.setChecklistContext === 'function') window.setChecklistContext(null);
        maschine = null;
        eintragId = null;
    };

    // Betriebsstunden wie in der Mietvereinbarung vorbelegen: jüngster Wert aus
    // Servicebericht oder handerfasstem Historieneintrag.
    async function ladeBetriebsstunden() {
        if (!maschine || !sb()) return;
        try {
            const [bericht, manuell] = await Promise.all([
                sb().from('service_entries')
                    .select('operating_hours, date')
                    .eq('machine_id', maschine.id)
                    .not('operating_hours', 'is', null)
                    .neq('operating_hours', '')
                    .order('date', { ascending: false })
                    .limit(1),
                sb().from('manual_history_entries')
                    .select('content, created_at')
                    .eq('machine_id', maschine.id)
                    .eq('type', 'hours')
                    .order('created_at', { ascending: false })
                    .limit(1)
            ]);
            const a = (bericht.data && bericht.data[0])
                ? { stunden: bericht.data[0].operating_hours, am: new Date(bericht.data[0].date) } : null;
            const b = (manuell.data && manuell.data[0])
                ? { stunden: manuell.data[0].content, am: new Date(manuell.data[0].created_at) } : null;
            const neuester = (a && b) ? (a.am >= b.am ? a : b) : (a || b);
            if (!neuester || neuester.stunden == null) return;
            const wert = String(neuester.stunden).trim().replace(/\s*(h|std\.?|stunden)\s*$/i, '').trim();
            const feld = document.getElementById('uvvp-hours');
            if (feld && !feld.value.trim()) feld.value = wert;
        } catch (e) {
            console.warn('Betriebsstunden konnten nicht vorbelegt werden:', e.message || e);
        }
    }

    async function ladeEintrag() {
        if (!sb() || !eintragId) return;
        try {
            const { data, error } = await sb().from('service_entries').select('*').eq('id', eintragId).single();
            if (error) throw error;

            document.getElementById('uvvp-date').value = (data.date || '').slice(0, 10) || heute();
            document.getElementById('uvvp-hours').value = data.operating_hours || '';
            document.getElementById('uvvp-remark').value = data.description || '';
            if (Array.isArray(data.technicians)) gewaehlteTechniker = [...data.technicians];

            const payload = data.checklist_payload;
            const typen = (payload && Array.isArray(payload.checklists))
                ? [...new Set(payload.checklists.map(cl => cl.type).filter(Boolean))] : [];
            if (typen.length) gewaehlteTypen = typen;

            renderTechniker();
            renderTypen();
            applyContext();
            if (typeof window.loadChecklistPayload === 'function') window.loadChecklistPayload(payload || null);
            renderChecklisten();
        } catch (e) {
            console.error('Protokoll konnte nicht geladen werden:', e);
            window.showToast('Das gespeicherte Protokoll konnte nicht geladen werden.');
        }
    }

    // ------------------------------------------------------
    // Speichern
    // ------------------------------------------------------
    // Die gewählten Protokollarten werden auf die vorhandenen Kategorien
    // abgebildet (Wartung / UVV / Einweisung). Fehlt eine davon in den
    // Einstellungen, bleibt das Feld einfach leer — gespeichert wird trotzdem.
    function kategorieIds() {
        const cats = window.categoryList || [];
        const ids = [];
        gewaehlteTypen.forEach(typ => {
            const treffer = cats.find(c => String(c.name || '').toLowerCase().includes(typ));
            if (treffer && !ids.includes(treffer.id)) ids.push(treffer.id);
        });
        return ids;
    }

    window.saveUvvProtokoll = async function () {
        if (speichert) return;
        if (!maschine) { window.showToast('Keine Maschine ausgewählt.'); return; }
        if (!sb()) { window.showToast('Ohne Verbindung lässt sich nichts speichern.'); return; }

        const payload = typeof window.getChecklistPayload === 'function' ? window.getChecklistPayload() : null;
        if (!payload || !Array.isArray(payload.checklists) || !payload.checklists.length) {
            window.showToast('Bitte mindestens einen Prüfplan aktivieren.');
            return;
        }

        const btn = document.getElementById('uvvp-save');
        speichert = true;
        if (btn) { btn.disabled = true; btn.textContent = 'Speichert …'; }

        const datum = document.getElementById('uvvp-date').value || heute();
        const catIds = kategorieIds();
        const daten = {
            machine_id: parseInt(maschine.id, 10),
            title: UVV_TITEL,
            date: new Date(datum).toISOString(),
            datum_von: new Date(datum).toISOString(),
            category_id: catIds.length ? catIds[0] : null,
            category_ids: catIds,
            technicians: gewaehlteTechniker,
            operating_hours: document.getElementById('uvvp-hours').value.trim() || null,
            description: document.getElementById('uvvp-remark').value.trim() || null,
            checklist_payload: payload
        };

        try {
            if (eintragId) {
                const { error } = await sb().from('service_entries').update(daten).eq('id', eintragId);
                if (error) throw error;
            } else {
                const { data, error } = await sb().from('service_entries').insert([daten]).select('id');
                if (error) throw error;
                if (data && data[0]) eintragId = data[0].id;
            }

            await schreibeWartungsdatum(datum);

            window.showToast('Protokoll gespeichert.');
            window.closeUvvProtokoll();
            if (typeof window.openHistoryModal === 'function' && window.currentHistoryMachineId) {
                window.openHistoryModal(window.currentHistoryMachineId);
            }
        } catch (e) {
            console.error('Protokoll konnte nicht gespeichert werden:', e);
            window.showToast('Speichern fehlgeschlagen: ' + ((e && e.message) || 'unbekannter Fehler'));
        } finally {
            speichert = false;
            if (btn) { btn.disabled = false; btn.textContent = 'Speichern'; }
        }
    };

    // „Letzte / nächste Wartung" wie beim Servicebericht fortschreiben — aber
    // nur, wenn wirklich ein Wartungs- oder UVV-Protokoll ausgefüllt wurde.
    async function schreibeWartungsdatum(datum) {
        if (!maschine || !sb()) return;
        if (!gewaehlteTypen.includes('wartung') && !gewaehlteTypen.includes('uvv')) return;
        try {
            const kat = (window.categoryList || []).find(c => String(c.id) === String(maschine.category_id));
            const monate = maschine.maintenance_interval_months
                || (kat && kat.default_maintenance_interval_months) || 12;
            const letzte = new Date(datum);
            const naechste = new Date(letzte);
            naechste.setMonth(naechste.getMonth() + monate);

            const update = {
                last_maintenance: letzte.toISOString(),
                next_maintenance: naechste.toISOString()
            };
            const { error } = await sb().from('machines').update(update).eq('id', maschine.id);
            if (error) throw error;

            const lokal = (window.machineList || []).find(m => String(m.id) === String(maschine.id));
            if (lokal) Object.assign(lokal, update);
        } catch (e) {
            console.warn('Wartungsdatum konnte nicht fortgeschrieben werden:', e.message || e);
        }
    }

    // ------------------------------------------------------
    // Übersicht je Maschine (Aktionen → Ansehen)
    // ------------------------------------------------------
    let liste = [];
    let listeMaschinenId = null;

    window.showUvvProtokolleForMachine = async function (machineId) {
        if (typeof window.closeServiceActionModal === 'function') window.closeServiceActionModal();

        listeMaschinenId = machineId || aktuelleMaschinenId();
        if (!listeMaschinenId) { window.showToast('Keine Maschine ausgewählt.'); return; }
        if (!sb()) { window.showToast('Ohne Verbindung gibt es keine Übersicht.'); return; }

        zeichneListe('lade');
        try {
            const { data, error } = await sb()
                .from('service_entries')
                .select('*')
                .eq('machine_id', listeMaschinenId)
                .eq('title', UVV_TITEL)
                .order('date', { ascending: false });
            if (error) throw error;
            liste = data || [];
            zeichneListe();
        } catch (e) {
            console.error('Protokolle konnten nicht geladen werden:', e);
            liste = [];
            zeichneListe('fehler');
        }
    };

    window.uvvListeSchliessen = function () {
        const ov = document.getElementById('uvvp-liste-overlay');
        if (ov) ov.remove();
    };

    window.uvvListeOeffnen = function (id) {
        const mid = listeMaschinenId;
        window.uvvListeSchliessen();
        window.openUvvProtokoll(mid, id);
    };

    window.uvvListeLoeschen = async function (id) {
        if (typeof window.canDelete === 'function' && !window.canDelete('Historien-Einträgen')) return;
        if (!confirm('Dieses Protokoll endgültig löschen?')) return;
        try {
            const { error } = await sb().from('service_entries').delete().eq('id', id);
            if (error) throw error;
            window.showToast('Protokoll gelöscht.');
            window.showUvvProtokolleForMachine(listeMaschinenId);
        } catch (e) {
            console.error('Löschen fehlgeschlagen:', e);
            window.showToast('Löschen fehlgeschlagen: ' + ((e && e.message) || 'unbekannter Fehler'));
        }
    };

    function listenZeile(v) {
        const arten = (v.checklist_payload && Array.isArray(v.checklist_payload.checklists))
            ? [...new Set(v.checklist_payload.checklists.map(cl => (cl.type || '').toUpperCase()).filter(Boolean))]
            : [];
        const datum = v.date ? new Date(v.date).toLocaleDateString('de-DE') : '';
        const namen = (v.technicians || [])
            .map(id => (window.userList || []).find(u => String(u.id) === String(id)))
            .filter(Boolean).map(u => u.name).join(', ');
        return `
        <div class="uvvp-liste-zeile">
            <div class="uvvp-liste-text">
                <strong>${esc(datum)}${arten.length ? ' · ' + esc(arten.join(' / ')) : ''}</strong>
                <span>${esc(namen || 'ohne Prüfer')}${v.operating_hours ? ' · ' + esc(v.operating_hours) + ' Bh' : ''}</span>
                ${v.description ? `<small>${esc(v.description)}</small>` : ''}
            </div>
            <div class="uvvp-liste-actions">
                <button type="button" class="btn-secondary" onclick="window.uvvListeOeffnen('${esc(String(v.id))}')">Öffnen</button>
                <button type="button" class="btn-secondary uvvp-danger" onclick="window.uvvListeLoeschen('${esc(String(v.id))}')">Löschen</button>
            </div>
        </div>`;
    }

    function zeichneListe(zustand) {
        let ov = document.getElementById('uvvp-liste-overlay');
        if (!ov) {
            ov = document.createElement('div');
            ov.id = 'uvvp-liste-overlay';
            ov.className = 'uvvp-backdrop show';
            document.body.appendChild(ov);
            ov.addEventListener('click', (e) => { if (e.target === ov) window.uvvListeSchliessen(); });
        }
        let inhalt;
        if (zustand === 'lade') inhalt = '<div class="uvvp-hint">Wird geladen …</div>';
        else if (zustand === 'fehler') inhalt = '<div class="uvvp-hint">Die Protokolle konnten nicht geladen werden.</div>';
        else if (!liste.length) inhalt = '<div class="uvvp-hint">Für diese Maschine ist noch kein Protokoll gespeichert.</div>';
        else inhalt = liste.map(listenZeile).join('');

        ov.innerHTML = `
            <div class="uvvp-window uvvp-window-sm">
                <div class="uvvp-head">
                    <div>
                        <h2>${esc(UVV_TITEL)}</h2>
                        <span class="uvvp-sub">Gespeicherte Protokolle dieser Maschine</span>
                    </div>
                    <button type="button" class="btn-close-modal" onclick="window.uvvListeSchliessen()">&times;</button>
                </div>
                <div class="uvvp-body">${inhalt}</div>
                <div class="uvvp-foot">
                    <button type="button" class="btn-secondary" onclick="window.uvvListeSchliessen()">Schließen</button>
                    <button type="button" class="btn-primary" onclick="window.uvvListeSchliessen(); window.openUvvProtokoll(${JSON.stringify(listeMaschinenId)});">Neues Protokoll</button>
                </div>
            </div>`;
    }
})();
