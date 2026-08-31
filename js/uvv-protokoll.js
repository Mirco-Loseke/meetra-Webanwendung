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
                        <label>Unterschrift Prüfer</label>
                        <div id="uvvp-sign"></div>
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
                    <button type="button" class="btn-secondary uvvp-preview" onclick="window.previewUvvProtokoll()"
                            title="PDF-Vorschau mit den eingetragenen Werten">Vorschau</button>
                    <button type="button" class="btn-secondary uvvp-hand" onclick="window.handberichtUvvProtokoll()"
                            title="Ausdruck zum Ausfüllen von Hand — Haken und Bemerkungen bleiben leer">Handbericht</button>
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
        const titelbild = titelbildUrl(maschine);
        el.innerHTML = `
            ${titelbild ? `<img src="${esc(titelbild)}" alt="" class="uvvp-machine-img">` : ''}
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

    // ------------------------------------------------------
    // Unterschrift des Prüfers
    // ------------------------------------------------------
    // Eigene kleine Zeichenfläche (wie in der Mietvereinbarung) — die Pads des
    // Serviceberichts hängen fest an dessen Formularfeldern. Gespeichert wird
    // in service_entries.tech_signature, also derselben Spalte, in der auch der
    // Servicebericht die Technikerunterschrift ablegt.
    let unterschrift = null;
    let unterschriftAuto = false;  // stammt aus dem Benutzerprofil, nicht selbst gezeichnet
    let padCtx = null;
    let padLeer = true;

    // Ist beim ersten gewählten Prüfer eine Unterschrift im Benutzerprofil
    // hinterlegt (Einstellungen → Benutzer), wird sie automatisch übernommen —
    // genau wie im Servicebericht. Eine selbst gezeichnete Unterschrift wird
    // dabei nie überschrieben.
    function unterschriftAusProfil() {
        if (unterschrift && !unterschriftAuto) return;
        const ersterId = gewaehlteTechniker.length ? gewaehlteTechniker[0] : null;
        const user = ersterId != null
            ? (window.userList || []).find(u => String(u.id) === String(ersterId)) : null;
        const hinterlegt = user && user.saved_signature ? user.saved_signature : null;
        unterschrift = hinterlegt;
        unterschriftAuto = !!hinterlegt;
    }

    function renderUnterschrift() {
        const el = document.getElementById('uvvp-sign');
        if (!el) return;
        el.innerHTML = unterschrift
            ? `<div class="uvvp-sign-box filled" onclick="window.uvvPadOpen()">
                   <img src="${unterschrift}" alt="Unterschrift">
               </div>
               <button type="button" class="uvvp-sign-clear" onclick="window.uvvSignLoeschen()">löschen</button>`
            : `<div class="uvvp-sign-box" onclick="window.uvvPadOpen()">
                   <span>Hier unterschreiben</span>
               </div>`;
    }

    window.uvvSignLoeschen = function () {
        // Bewusst OHNE erneutes Ziehen aus dem Profil — sonst ließe sich eine
        // hinterlegte Unterschrift nie entfernen.
        unterschrift = null;
        unterschriftAuto = false;
        renderUnterschrift();
    };

    function ensurePad() {
        if (document.getElementById('uvvp-pad-overlay')) return;
        const ov = document.createElement('div');
        ov.id = 'uvvp-pad-overlay';
        ov.className = 'uvvp-backdrop';
        ov.innerHTML = `
            <div class="uvvp-window uvvp-window-sm">
                <div class="uvvp-head">
                    <div><h2>Unterschrift Prüfer</h2></div>
                    <button type="button" class="btn-close-modal" onclick="window.uvvPadAbbrechen()">&times;</button>
                </div>
                <div class="uvvp-body">
                    <canvas id="uvvp-pad-canvas" class="uvvp-pad-canvas"></canvas>
                </div>
                <div class="uvvp-foot">
                    <button type="button" class="btn-secondary" onclick="window.uvvPadLeeren()">Leeren</button>
                    <button type="button" class="btn-secondary" onclick="window.uvvPadAbbrechen()">Abbrechen</button>
                    <button type="button" class="btn-primary" onclick="window.uvvPadSpeichern()">Übernehmen</button>
                </div>
            </div>`;
        document.body.appendChild(ov);
    }

    window.uvvPadOpen = function () {
        ensurePad();
        const ov = document.getElementById('uvvp-pad-overlay');
        const cv = document.getElementById('uvvp-pad-canvas');
        ov.classList.add('show');

        // Auflösung an die Anzeigegröße anpassen, sonst wird der Strich verzerrt.
        const rect = cv.getBoundingClientRect();
        cv.width = rect.width * 2;
        cv.height = rect.height * 2;
        padCtx = cv.getContext('2d');
        padCtx.scale(2, 2);
        padCtx.lineWidth = 2.2;
        padCtx.lineCap = 'round';
        padCtx.lineJoin = 'round';
        padCtx.strokeStyle = '#111';
        padLeer = true;

        let zeichnet = false;
        const pos = (e) => {
            const r = cv.getBoundingClientRect();
            const p = e.touches ? e.touches[0] : e;
            return { x: p.clientX - r.left, y: p.clientY - r.top };
        };
        const start = (e) => { e.preventDefault(); zeichnet = true; padLeer = false; const q = pos(e); padCtx.beginPath(); padCtx.moveTo(q.x, q.y); };
        const move = (e) => { if (!zeichnet) return; e.preventDefault(); const q = pos(e); padCtx.lineTo(q.x, q.y); padCtx.stroke(); };
        const stop = () => { zeichnet = false; };
        cv.onmousedown = start; cv.onmousemove = move; cv.onmouseup = stop; cv.onmouseleave = stop;
        cv.ontouchstart = start; cv.ontouchmove = move; cv.ontouchend = stop;
    };

    window.uvvPadLeeren = function () {
        const cv = document.getElementById('uvvp-pad-canvas');
        if (cv && padCtx) padCtx.clearRect(0, 0, cv.width, cv.height);
        padLeer = true;
    };

    window.uvvPadAbbrechen = function () {
        const ov = document.getElementById('uvvp-pad-overlay');
        if (ov) ov.classList.remove('show');
    };

    window.uvvPadSpeichern = function () {
        const cv = document.getElementById('uvvp-pad-canvas');
        if (cv && !padLeer) { unterschrift = cv.toDataURL("image/png"); unterschriftAuto = false; }
        window.uvvPadAbbrechen();
        renderUnterschrift();
    };

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
        unterschriftAusProfil();
        renderTechniker();
        renderUnterschrift();
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
        unterschrift = null;
        unterschriftAuto = false;
        unterschriftAusProfil();

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
        renderUnterschrift();
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
            unterschrift = data.tech_signature || null;

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
            tech_signature: unterschrift,
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
    // PDF: Vorschau und Handbericht
    // ------------------------------------------------------
    // Eigener, kleiner Erzeuger — die PDF-Erzeugung des Serviceberichts
    // (js/servicebericht-pdf.js) liest ihre Werte direkt aus dem Formular des
    // Serviceberichts und ist deshalb hier nicht verwendbar.
    //
    // handbericht = true: Bemerkungs-/Notizfelder bleiben leer (keine
    // Platzhalter), damit der Prüfer sie vor Ort von Hand ausfüllen kann.
    // Maschinenbild für das PDF: jsPDF braucht die Bilddaten selbst, eine URL
    // reicht nicht. Klappt das Laden nicht (fremde Domain ohne CORS, offline),
    // wird das Bild einfach weggelassen.
    // Weg 1 ist derselbe wie in js/protocols.js (dort seit jeher zuverlässig für
    // die Fotos aus Cloudflare R2): über ein <img> mit crossOrigin laden und auf
    // ein Canvas zeichnen. Erst wenn das scheitert, wird heruntergeladen.
    let letzterBildFehler = null;

    async function ladeBildDataUrl(url) {
        if (!url) return null;
        if (String(url).startsWith('data:')) return { dataUrl: url };

        // Weg 1: mit crossOrigin laden und aufs Canvas zeichnen (wie in
        // js/protocols.js).
        //
        // WICHTIG: mit Zusatz in der Adresse (?pdf=1). Das Bild hängt schon
        // OHNE crossOrigin im Fenster — der Browser hat es damit ohne
        // CORS-Kopfzeilen im Zwischenspeicher. Ein anschließender Aufruf MIT
        // crossOrigin bekommt genau diese gespeicherte Antwort zurück und
        // scheitert, obwohl der Speicher CORS längst erlaubt. Der Zusatz
        // erzwingt einen eigenen Eintrag im Zwischenspeicher — R2 ignoriert
        // unbekannte Parameter.
        const ueberCanvas = await bildUeberImg(mitCorsParam(url), true);
        if (ueberCanvas) return ueberCanvas;

        // Weg 2: herunterladen und in Base64 wandeln (ebenfalls an der
        // gespeicherten Antwort ohne CORS vorbei).
        try {
            const res = await fetch(mitCorsParam(url), { mode: 'cors', cache: 'reload' });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const blob = await res.blob();
            const dataUrl = await new Promise((resolve, reject) => {
                const r = new FileReader();
                r.onloadend = () => resolve(r.result);
                r.onerror = reject;
                r.readAsDataURL(blob);
            });
            const mass = await bildMasse(dataUrl);
            return { dataUrl: dataUrl, w: mass && mass.w, h: mass && mass.h };
        } catch (e) {
            letzterBildFehler = 'Download blockiert (' + (e.message || e) + ')';
            console.warn('Titelbild: Download nicht möglich —', e.message || e);
        }

        // Weg 3: ohne crossOrigin laden. Das Bild erscheint dann zwar, das
        // Canvas gilt aber als „verunreinigt" und toDataURL wirft — je nach
        // Browser und Speicher klappt genau das trotzdem, also probieren.
        const ohneCors = await bildUeberImg(url, false);
        if (ohneCors) return ohneCors;

        console.warn('Titelbild: keine Ladeart hat funktioniert. URL:', url);
        return null;
    }

    // Eigener Eintrag im Browser-Zwischenspeicher für den CORS-Abruf.
    function mitCorsParam(url) {
        if (!url || String(url).startsWith('data:')) return url;
        return url + (url.includes('?') ? '&' : '?') + 'pdf=1';
    }

    function bildUeberImg(url, mitCors) {
        return new Promise((resolve) => {
            const img = new Image();
            if (mitCors) img.crossOrigin = 'Anonymous';
            img.onload = () => {
                try {
                    const cv = document.createElement('canvas');
                    cv.width = img.naturalWidth || img.width;
                    cv.height = img.naturalHeight || img.height;
                    cv.getContext('2d').drawImage(img, 0, 0);
                    resolve({ dataUrl: cv.toDataURL('image/jpeg', 0.85), w: cv.width, h: cv.height });
                } catch (e) {
                    letzterBildFehler = mitCors ? 'Canvas gesperrt (CORS)' : 'Canvas verunreinigt (kein CORS)';
                    console.warn(`Titelbild: Canvas-Weg ${mitCors ? 'mit' : 'ohne'} CORS fehlgeschlagen —`, e.message || e);
                    resolve(null);
                }
            };
            img.onerror = () => {
                letzterBildFehler = mitCors ? 'Bild lädt nicht mit CORS' : 'Bild nicht erreichbar (404 / offline)';
                console.warn(`Titelbild: Laden ${mitCors ? 'mit' : 'ohne'} CORS fehlgeschlagen.`);
                resolve(null);
            };
            img.src = url;
        });
    }

    // Titelbild der Maschine: das Hauptbild, ersatzweise das erste Foto aus
    // der Dateiliste der Maschine.
    function titelbildUrl(m) {
        return titelbildKandidaten(m)[0] || null;
    }

    // Mehrere mögliche Quellen, in dieser Reihenfolge: Hauptbild, dessen
    // Vorschau-Fassung und schließlich die Fotos aus der Dateiliste. Ist eine
    // davon nicht ladbar, wird die nächste genommen.
    function titelbildKandidaten(m) {
        if (!m) return [];
        const raus = [];
        const dazu = (u) => { if (u && !raus.includes(u)) raus.push(u); };

        if (m.image_url) {
            const voll = String(m.image_url).trim();
            dazu(voll);
            if (typeof window.getMachineThumbnailUrl === 'function') {
                dazu(window.getMachineThumbnailUrl(voll));
            }
        }
        (Array.isArray(m.files) ? m.files : []).forEach(f => {
            const u = typeof f === 'string' ? f : (f && f.url) || '';
            const typ = (f && f.type) || '';
            if (!u) return;
            if (/\.(jpe?g|png|webp|gif)(\?|$)/i.test(u) || String(typ).startsWith('image/')) dazu(u);
        });
        return raus;
    }

    // Erste Quelle nehmen, die sich wirklich einbetten lässt.
    async function ladeTitelbild(m) {
        const kandidaten = titelbildKandidaten(m);
        letzterBildFehler = null;

        for (const u of kandidaten) {
            const bild = await ladeBildDataUrl(u);
            if (bild && bild.dataUrl) return bild;
        }

        // Nur melden, wenn es überhaupt ein Bild gäbe, aber keines nutzbar war —
        // eine Maschine ganz ohne Bild ist kein Fehler. Die Meldung nennt den
        // Grund und die URL, sonst ist der Hinweis für die Fehlersuche wertlos.
        const diagnose = {
            maschine: maschinenTitel(m),
            kandidaten: kandidaten,
            grund: letzterBildFehler || 'keine Bildquelle hinterlegt'
        };
        window.__uvvTitelbildDiagnose = diagnose;
        console.warn('Titelbild-Diagnose:', diagnose);

        if (kandidaten.length && typeof window.showToast === 'function') {
            const kurz = String(kandidaten[0]).replace(/^https?:\/\//, '').slice(0, 60);
            window.showToast(`Titelbild nicht ins PDF übernommen — ${diagnose.grund}. Quelle: ${kurz}…`);
        }
        return null;
    }

    function bildMasse(dataUrl) {
        return new Promise(resolve => {
            const img = new Image();
            img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
            img.onerror = () => resolve(null);
            img.src = dataUrl;
        });
    }

    // Unterschriftsfeld: Unterschrift über der Linie, darunter „Prüfer: Name".
    // Bewusst ohne Datum — das steht oben in den Angaben.
    function pruefUnterschrift(doc, y, name, bild) {
        if (bild && String(bild).startsWith('data:image')) {
            try { doc.addImage(bild, 'PNG', 20, y - 24, 70, 22); } catch (e) { }
        }
        doc.setDrawColor(100, 100, 100);
        doc.setLineWidth(0.5);
        doc.line(20, y, 95, y);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(60, 60, 60);
        doc.text(`Prüfer: ${name || ''}`.trim(), 20, y + 5);
    }

    async function baueProtokollPdf(handbericht) {
        if (typeof window.loadPDFGenerators === 'function') await window.loadPDFGenerators();
        if (typeof window.loadUnicodePdfFont === 'function') {
            try { await window.loadUnicodePdfFont(); } catch (e) { }
        }

        // Briefbogen wie beim Servicebericht erst hier nachladen.
        let bg = null;
        if (!window.VORLAGE_BASE64 && typeof window.ladeBriefbogen === 'function') {
            try { await window.ladeBriefbogen(); } catch (e) { }
        }
        if (window.VORLAGE_BASE64) bg = window.VORLAGE_BASE64;

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        if (typeof window.registerUnicodeFont === 'function' && window.registerUnicodeFont(doc)) {
            doc.setFont('helvetica', 'normal');
        }
        const hintergrund = () => { if (bg) doc.addImage(bg, 'JPEG', -5, -5, 220, 307, undefined, 'FAST'); };
        const addPage = doc.addPage.bind(doc);
        doc.addPage = function () { addPage(); hintergrund(); return doc; };
        hintergrund();

        const payload = typeof window.getChecklistPayload === 'function' ? window.getChecklistPayload() : null;
        const listen = (payload && Array.isArray(payload.checklists)) ? payload.checklists : [];

        const stunden = document.getElementById('uvvp-hours').value.trim();
        const datum = document.getElementById('uvvp-date').value || heute();
        const bemerkung = document.getElementById('uvvp-remark').value.trim();
        const pruefer = gewaehlteTechniker
            .map(id => (window.userList || []).find(u => String(u.id) === String(id)))
            .filter(Boolean).map(u => u.name).join(', ');
        const kopfzeile = `Maschine: ${maschinenTitel(maschine)} | Seriennummer: ${maschine.serial || maschine.serial_number || '—'}`
            + ` | Baujahr: ${maschine.year || '—'} | Betriebsstunden: ${stunden || '—'}`;

        // ---- Deckblatt ----
        // Ruhiger Aufbau: schmale Akzentlinie, großer Titel, rechts das
        // Titelbild der Maschine, darunter die Angaben als zweispaltige
        // Liste mit feinen Trennlinien — bewusst ohne Kästen, die den
        // Briefbogen zerschneiden.
        const AKZENT = [23, 37, 84];
        const kat = (window.categoryList || []).find(c => String(c.id) === String(maschine.category_id));

        // Titelbild oben rechts, seitenverhältnistreu in den Rahmen gesetzt.
        let bildBreite = 0;
        const bild = await ladeTitelbild(maschine);
        if (bild && bild.dataUrl) {
            try {
                const kasten = { x: 132, y: 42, b: 58, h: 44 };
                let b = kasten.b, h = kasten.h;
                if (bild.w && bild.h) {
                    const f = Math.min(kasten.b / bild.w, kasten.h / bild.h);
                    b = bild.w * f;
                    h = bild.h * f;
                }
                doc.addImage(bild.dataUrl, kasten.x + (kasten.b - b) / 2, kasten.y + (kasten.h - h) / 2, b, h,
                    undefined, 'FAST');
                bildBreite = 62;
            } catch (e) {
                console.warn('Titelbild konnte nicht gezeichnet werden:', e.message || e);
            }
        }

        // Kopf
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(21);
        doc.setTextColor(17, 24, 39);
        doc.text('UVV- & Wartungsprotokoll', 20, 52);

        doc.setDrawColor(AKZENT[0], AKZENT[1], AKZENT[2]);
        doc.setLineWidth(1.2);
        doc.line(20, 56, 48, 56);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(120, 120, 120);
        doc.text(handbericht
            ? 'Ausdruck zum Ausfüllen von Hand'
            : `Prüfung vom ${datum.split('-').reverse().join('.')}`, 20, 63);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(13);
        doc.setTextColor(17, 24, 39);
        doc.text(maschinenTitel(maschine), 20, 74);

        // Angaben, zweispaltig mit feinen Trennlinien
        let y = 88;
        const paare = [
            ['Seriennummer', maschine.serial || maschine.serial_number || '—'],
            ['Baujahr', String(maschine.year || '—')],
            ['Maschinenserie', maschine.machine_series || '—'],
            ['Kategorie', kat ? kat.name : '—'],
            ['Betriebsstunden', stunden || '—'],
            ['Datum', datum.split('-').reverse().join('.')]
        ];
        const spalteX = [20, 108];
        const spalteBreite = 72;
        paare.forEach(([k, v], i) => {
            const sp = i % 2;
            const zeile = Math.floor(i / 2);
            const px = spalteX[sp];
            const py = y + zeile * 14;
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7.5);
            doc.setTextColor(140, 140, 140);
            doc.text(String(k).toUpperCase(), px, py);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(10.5);
            doc.setTextColor(17, 24, 39);
            doc.text(doc.splitTextToSize(String(v), spalteBreite)[0] || '—', px, py + 5.5);
            doc.setDrawColor(232, 232, 232);
            doc.setLineWidth(0.2);
            doc.line(px, py + 8.5, px + spalteBreite, py + 8.5);
        });
        y += Math.ceil(paare.length / 2) * 14 + 4;
        void bildBreite;

        // Geprüft wird / Bemerkung
        const arten = [...new Set(listen.map(cl => cl.type).filter(Boolean))]
            .map(t => (TYPEN.find(x => x.key === t) || {}).label || t);
        if (arten.length) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7.5);
            doc.setTextColor(140, 140, 140);
            doc.text('PROTOKOLLIERT', 20, y);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(10.5);
            doc.setTextColor(17, 24, 39);
            doc.text(arten.join('   ·   '), 20, y + 5.5);
            y += 18;
        }

        if (!handbericht && bemerkung) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7.5);
            doc.setTextColor(140, 140, 140);
            doc.text('BEMERKUNG', 20, y);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(10);
            doc.setTextColor(40, 40, 40);
            const zeilen = doc.splitTextToSize(bemerkung, 170);
            doc.text(zeilen, 20, y + 5.5);
            y += 5.5 + zeilen.length * 5 + 10;
        }

        // Unterschrift steht nur einmal ganz am Ende des Protokolls (siehe unten).
        // ---- Je Prüfplan eine eigene Seite ----
        let letzteBemerkungY = 0;
        listen.forEach(cl => {
            if (!Array.isArray(cl.answers) || !cl.answers.length) return;
            const istWartung = cl.type === 'wartung';
            const farbe = istWartung ? [5, 102, 54] : [23, 37, 84];
            const titel = (cl.title || 'Prüfprotokoll').replace(/[^\w\s\/\-äöüÄÖÜß()]/g, '').trim();

            doc.addPage();
            const kopf = (seite) => {
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(16);
                doc.setTextColor(farbe[0], farbe[1], farbe[2]);
                doc.text(titel, 20, 30);
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(10);
                doc.setTextColor(100, 100, 100);
                doc.text(kopfzeile, 20, 37);
                void seite;
            };
            kopf(1);

            const body = [];
            const katZeilen = [];
            let kat = '';
            cl.answers.forEach(ans => {
                if (ans.category !== kat) {
                    kat = ans.category;
                    body.push(istWartung
                        ? [String(kat || '').toUpperCase(), '', '', '', '']
                        : [String(kat || '').toUpperCase(), '', '', '']);
                    katZeilen.push(body.length - 1);
                }
                const kommentar = handbericht ? '' : ((ans.comment && ans.comment.trim()) ? ans.comment : '');
                if (istWartung) {
                    body.push([
                        ans.pos || '', ans.description || '', ans.interval || '',
                        handbericht ? '' : (ans.checked === 'na' ? 'n. z.' : (ans.checked ? 'x' : '')),
                        kommentar
                    ]);
                } else {
                    body.push([
                        ans.pos || '', ans.description || '',
                        handbericht ? '' : (ans.io === 'ja' ? 'Ja' : (ans.io === 'nein' ? 'Nein' : '')),
                        kommentar
                    ]);
                }
            });

            doc.autoTable({
                startY: 44,
                head: [istWartung
                    ? ['Pos', 'Wartungsarbeit / Prüfpunkt', 'Intervall / Frist', 'Erledigt', 'Bemerkung']
                    : ['Pos', 'Prüfpunkt', 'i.O.', 'Bemerkung / Beanstandung']],
                body: body,
                rowPageBreak: 'avoid',
                margin: { top: 44, bottom: 20, left: 20, right: 20 },
                theme: 'grid',
                styles: { font: 'helvetica', fontSize: 7.5, cellPadding: 2, valign: 'middle' },
                headStyles: { fillColor: farbe, textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' },
                columnStyles: istWartung
                    ? { 0: { cellWidth: 15 }, 1: { cellWidth: 75 }, 2: { cellWidth: 33, halign: 'center' }, 3: { cellWidth: 22, halign: 'center' }, 4: { cellWidth: 25 } }
                    : { 0: { cellWidth: 15 }, 1: { cellWidth: 95 }, 2: { cellWidth: 18, halign: 'center' }, 3: { cellWidth: 42 } },
                didParseCell: function (data) {
                    if (katZeilen.includes(data.row.index) && data.cell.section === 'body') {
                        data.cell.styles.fillColor = [241, 245, 249];
                        data.cell.styles.fontStyle = 'bold';
                        data.cell.styles.textColor = [15, 23, 42];
                        if (data.column.index === 0) data.cell.colSpan = istWartung ? 5 : 4;
                    }
                },
                didDrawPage: function (data) { if (data.pageNumber > 1) kopf(data.pageNumber); }
            });

            // Bemerkungsfeld unter der Tabelle — im Handbericht bewusst leer.
            let by = doc.lastAutoTable.finalY + 10;
            if (by + 30 > 270) { doc.addPage(); by = 40; }
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(10);
            doc.setTextColor(30, 41, 59);
            doc.text('Bemerkungen:', 20, by);
            by += 5;
            doc.setDrawColor(180, 180, 180);
            doc.setLineWidth(0.3);
            doc.rect(20, by, 170, 22);
            if (!handbericht && cl.generalRemark && cl.generalRemark.trim()) {
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(9);
                doc.setTextColor(50, 50, 50);
                doc.text(doc.splitTextToSize(cl.generalRemark, 165), 23, by + 5);
            }

            // Unterschrieben wird EINMAL, ganz am Schluss (siehe unten) — nicht
            // unter jedem einzelnen Prüfplan.
            letzteBemerkungY = by + 22;
        });

        // ---- Unterschrift: einmal, ganz unten, deutlich unter dem
        //      Bemerkungsfeld des letzten Protokolls ----
        let sigY = (letzteBemerkungY || 60) + 34;
        if (sigY + 14 > 275) { doc.addPage(); sigY = 70; }
        pruefUnterschrift(doc, sigY, pruefer, handbericht ? null : unterschrift);

        const gesamt = doc.internal.getNumberOfPages();
        for (let i = 1; i <= gesamt; i++) {
            doc.setPage(i);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8);
            doc.setTextColor(100, 100, 100);
            doc.text(`Seite ${i} von ${gesamt}`, 190, 285, { align: 'right' });
        }
        return doc;
    }

    async function zeigePdf(handbericht) {
        if (!maschine) return;
        const payload = typeof window.getChecklistPayload === 'function' ? window.getChecklistPayload() : null;
        if (!payload || !Array.isArray(payload.checklists) || !payload.checklists.length) {
            window.showToast('Bitte zuerst einen Prüfplan aktivieren.');
            return;
        }
        try {
            const doc = await baueProtokollPdf(handbericht);
            const url = doc.output('bloburl');
            const titel = (handbericht ? 'Handbericht' : 'Vorschau') + ' — ' + UVV_TITEL;
            if (typeof window.previewDocument === 'function') {
                window.previewDocument(url, `${titel} (${maschinenTitel(maschine)})`, 'application/pdf');
            } else {
                window.open(url, '_blank');
            }
        } catch (e) {
            console.error('PDF konnte nicht erzeugt werden:', e);
            window.showToast('PDF konnte nicht erzeugt werden: ' + ((e && e.message) || 'unbekannter Fehler'));
        }
    }

    window.previewUvvProtokoll = function () { return zeigePdf(false); };
    window.handberichtUvvProtokoll = function () { return zeigePdf(true); };

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
