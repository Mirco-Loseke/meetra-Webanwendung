// ==========================================
// AI QUICK CAPTURE
// ==========================================
// Freitext -> KI (Groq) -> strukturierte Aufgaben (+Unteraufgaben) und
// Vorgänge. Ergebnis wird IMMER erst in einer Vorschau angezeigt und erst
// nach Klick gespeichert. Nutzt denselben Groq-Key wie die Buchhaltung
// (localStorage 'groq_api_key').

(function () {
    'use strict';

    // Modell umschaltbar über localStorage 'groq_model'. Bei ungültigem/nicht verfügbarem
    // Modell wird automatisch auf das zuverlässige Standardmodell zurückgefallen.
    const GROQ_FALLBACK_MODEL = 'llama-3.3-70b-versatile';
    function groqModel() { return localStorage.getItem('groq_model') || GROQ_FALLBACK_MODEL; }
    let lastResult = null; // zuletzt von der KI erzeugtes Objekt
    let lastInputText = ''; // Rohtext der Eingabe (für exakten Seriennummer-Abgleich)

    // Exakter, grenzengenauer Seriennummer-Abgleich gegen einen Text.
    // Findet die Maschine, deren Seriennummer als eigenständige Zahl im Text vorkommt
    // (Punkte/Leerzeichen/Bindestriche innerhalb erlaubt), NICHT als Teil einer längeren Zahl.
    // Bei mehreren Treffern gewinnt die längste (spezifischste) Seriennummer.
    function matchMachineBySerial(text) {
        const list = window.machineList || [];
        const s = String(text || '');
        if (!s.trim()) return null;
        let best = null, bestLen = 0;
        for (const m of list) {
            const digits = String(m.serial || '').replace(/[^a-z0-9]/gi, '');
            if (digits.length < 3) continue;
            const pat = digits.split('').map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[.\\s\\-\\/]?');
            let re;
            try { re = new RegExp('(?<![a-z0-9])' + pat + '(?![a-z0-9])', 'i'); }
            catch (e) { re = new RegExp(pat, 'i'); }
            if (re.test(s) && digits.length > bestLen) { best = m; bestLen = digits.length; }
        }
        return best ? best.id : null;
    }
    let existingTasks = [];      // offene Aufgaben (zum Zuordnen)
    let existingProcesses = [];  // vorhandene Vorgänge (zum Status-Anhängen)

    function openTasksForMachine(mId) {
        if (!mId) return [];
        return existingTasks.filter(t => String(t.machine_id) === String(mId));
    }

    // Vorhandene Vorgänge, die zur Maschine ODER zum Titel/Schlagwort passen
    function processesMatching(mId, title) {
        const norm = s => String(s || '').toLowerCase();
        const words = norm(title).split(/\s+/).filter(w => w.length > 3);
        return existingProcesses.filter(p => {
            if (mId && String(p.machine_id) === String(mId)) return true;
            const pt = norm(p.title);
            return words.some(w => pt.includes(w));
        });
    }

    function openTasksForWorkshop(wa) {
        const w = String(wa || '').trim().toLowerCase();
        if (!w) return [];
        return existingTasks.filter(t => String(t.workshop_order_number || '').trim().toLowerCase() === w);
    }

    function taskTargetOptions(mId) {
        const opts = ['<option value="new">➕ Neue Aufgabe anlegen</option>'];
        openTasksForMachine(mId).forEach(t => {
            opts.push(`<option value="${t.id}">→ zu vorhandener: ${escapeHtml(t.title || ('Aufgabe ' + t.id))}</option>`);
        });
        return opts.join('');
    }

    function taskWaTargetOptions(wa) {
        const opts = ['<option value="new">➕ Neue Aufgabe anlegen</option>'];
        openTasksForWorkshop(wa).forEach(t => {
            opts.push(`<option value="${t.id}">→ zu vorhandener: ${escapeHtml(t.title || ('Aufgabe ' + t.id))}</option>`);
        });
        return opts.join('');
    }

    function processTargetOptions(mId, title) {
        const opts = ['<option value="new">➕ Neuen Vorgang anlegen</option>'];
        processesMatching(mId, title).forEach(p => {
            opts.push(`<option value="${p.id}">→ Status zu vorhandenem: ${escapeHtml(p.title || ('Vorgang ' + p.id))}</option>`);
        });
        return opts.join('');
    }

    // ---- Maschinen-Optionen / Matching -------------------------------------
    function machineOptions(selectedId) {
        const list = window.machineList || [];
        let html = '<option value="">— keine Maschine —</option>';
        list.forEach(m => {
            const label = [m.manufacturer, m.name, m.serial ? '#' + m.serial : null, m.matchcode]
                .filter(Boolean).join(' · ');
            const sel = (selectedId != null && String(selectedId) === String(m.id)) ? ' selected' : '';
            html += `<option value="${m.id}"${sel}>${escapeHtml(label || ('Maschine ' + m.id))}</option>`;
        });
        return html;
    }

    function supergroupNames() {
        return (window.taskSupergroupNames && window.taskSupergroupNames.length)
            ? window.taskSupergroupNames.slice()
            : ['Schweißen', 'Wartung', 'Hydraulik', 'Elektrik', 'Mechanik', 'Motor', 'Allgemein'];
    }

    // Aktions-Typ + passende Übergruppe für eine Unteraufgabe erkennen
    // (Bausteine wie "Eingangsprotokoll"/"Abnahme"/"Service" bringen action_type -> Aktionsbutton).
    function detectSubtaskAction(title) {
        const norm = s => String(s || '').toLowerCase().trim();
        const t = norm(title);
        if (!t) return null;
        // 1) Exakter/enthaltener Baustein aus den Vorlagen
        const tpls = window.taskSubtaskTemplates || [];
        let tpl = tpls.find(x => norm(x.title) === t)
            || tpls.find(x => x.action_type && (t.includes(norm(x.title)) || norm(x.title).includes(t)) && norm(x.title).length > 3);
        if (tpl && tpl.action_type) return tpl.action_type;
        // 2) Schlagwort-Fallback (Eingang vs. Abnahme klar trennen)
        if (/eingangsprotokoll|wareneingang|eingang/.test(t)) return 'intake';
        if (/abnahmeprotokoll|endabnahme|abnahme/.test(t)) return 'acceptance';
        return null;
    }

    function actionBadge(action) {
        if (!action) return '';
        let label = '📄 Dokument', color = '#10b981', bg = 'rgba(16,185,129,0.15)';
        if (action === 'intake') { label = '📋 Eingang'; color = '#60a5fa'; bg = 'rgba(59,130,246,0.15)'; }
        else if (action === 'acceptance') { label = '📋 Abnahme'; color = '#f59e0b'; bg = 'rgba(245,158,11,0.15)'; }
        else if (action.startsWith('servicebericht:')) { label = '📋 Servicebericht'; color = '#a78bfa'; bg = 'rgba(139,92,246,0.15)'; }
        return `<span class="ai-cap-action-badge" style="font-size:0.68rem; font-weight:800; color:${color}; background:${bg}; border-radius:6px; padding:2px 6px; white-space:nowrap;">${label}</span>`;
    }

    // passende Übergruppe für protokoll-/eingang-/abnahmebezogene Unteraufgaben
    function supergroupForSubtask(title, action, fallback) {
        const names = supergroupNames();
        const norm = s => String(s || '').toLowerCase();
        const wantsProtocol = action === 'intake' || action === 'acceptance' || /eingang|abnahme|protokoll/.test(norm(title));
        if (wantsProtocol) {
            const g = names.find(n => /protokoll|abnahme|eingang/.test(norm(n)));
            if (g) return g;
        }
        return fallback || 'Allgemein';
    }

    function supergroupOptions(selected) {
        const names = supergroupNames();
        const sel = selected || 'Allgemein';
        if (sel && !names.includes(sel)) names.push(sel); // KI-Vorschlag beibehalten
        if (!names.includes('Allgemein')) names.push('Allgemein');
        return names.map(n => `<option value="${escapeHtml(n)}"${n === sel ? ' selected' : ''}>${escapeHtml(n)}</option>`).join('');
    }

    // Findet die am besten passende Maschine zu einem Freitext (Hint ODER ganzer Titel).
    // Punkte/Leerzeichen/Bindestriche werden ignoriert; Seriennummer hat Vorrang, dann Matchcode, dann Name.
    function matchMachineId(hint) {
        if (!hint) return null;
        const list = window.machineList || [];
        const norm = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
        const alnum = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const h = norm(hint);
        const hAl = alnum(hint);
        if (!h) return null;

        let best = null, bestScore = 0;
        for (const m of list) {
            const sn = alnum(m.serial), mc = norm(m.matchcode), nm = norm(m.name);
            let score = 0;
            if (sn && sn.length >= 3) {
                if (hAl === sn) score = Math.max(score, 1000);                          // exakte Serie
                else if (sn.length >= 4 && hAl.includes(sn)) score = Math.max(score, 500 + sn.length); // Serie im Text
            }
            if (mc && mc.length >= 3) {
                if (h === mc) score = Math.max(score, 900);
                else if (h.includes(mc)) score = Math.max(score, 300 + mc.length);      // Matchcode im Text
            }
            if (nm && nm.length >= 4) {
                if (h === nm) score = Math.max(score, 800);
                else if (h.includes(nm)) score = Math.max(score, 100 + nm.length);      // Maschinenname im Text
                else if (nm.includes(h) && h.length >= 5) score = Math.max(score, 40 + h.length);
            }
            if (score > bestScore) { bestScore = score; best = m; }
        }
        return best ? best.id : null;
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // Erkennt eine Werkstattauftragsnummer im Text: 2026-40123 oder 5-stellig mit 40 (40123)
    function detectWorkshopOrder(text) {
        const s = String(text || '');
        let m = s.match(/\b(20\d{2}-40\d{3})\b/);
        if (m) return m[1];
        m = s.match(/(?<!\d)(40\d{3})(?!\d)/);
        if (m) return m[1];
        return '';
    }

    // ---- Zuständig: Mehrfachauswahl im Stil des Serviceberichte-Mitarbeiter-Dropdowns ----
    function assigneePills(ids) {
        const users = window.userList || [];
        const sel = users.filter(u => ids.some(id => String(id) === String(u.id)));
        if (sel.length === 0) return '<span style="color:rgba(255,255,255,0.4); font-size:0.85rem;">Niemand zugewiesen</span>';
        return sel.map(u => {
            const initials = u.initials || (u.name || '').substring(0, 2).toUpperCase();
            const color = u.color || '#666';
            return `<span style="display:inline-flex; align-items:center; gap:6px; background:${color}22; border:1px solid ${color}55; border-radius:20px; padding:2px 10px 2px 3px; font-size:0.8rem; font-weight:700; color:#fff;"><span style="width:20px;height:20px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;font-size:0.6rem;font-weight:800;color:#fff;">${initials}</span>${escapeHtml(u.name)}</span>`;
        }).join('');
    }

    function assigneeListRows(uid, ids) {
        const users = window.userList || [];
        return users.map(u => {
            const isSel = ids.some(id => String(id) === String(u.id));
            const initials = u.initials || (u.name || '').substring(0, 2).toUpperCase();
            const color = u.color || '#666';
            return `<div onclick="window.aiCapToggleAssignee('${uid}', '${u.id}')" style="display:flex; align-items:center; gap:10px; padding:8px 10px; border-radius:8px; cursor:pointer; background:${isSel ? 'rgba(16,185,129,0.12)' : 'transparent'};" onmouseover="this.style.background='${isSel ? 'rgba(16,185,129,0.18)' : 'rgba(255,255,255,0.04)'}'" onmouseout="this.style.background='${isSel ? 'rgba(16,185,129,0.12)' : 'transparent'}'">
                <span style="width:28px;height:28px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;font-size:0.68rem;font-weight:800;color:#fff;flex-shrink:0;">${initials}</span>
                <span style="flex:1; color:#fff; font-size:0.9rem;">${escapeHtml(u.name)}</span>
                ${isSel ? '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>' : ''}
            </div>`;
        }).join('');
    }

    function assigneeControl(uid, preselectedIds) {
        const ids = (Array.isArray(preselectedIds) ? preselectedIds : []).filter(x => x != null);
        return `
        <div class="ai-cap-assignee" id="${uid}" data-selected='${escapeHtml(JSON.stringify(ids))}'>
            <div onclick="window.aiCapToggleAssigneePanel('${uid}')" class="glass-form-input" style="display:flex; align-items:center; gap:8px; cursor:pointer; min-height:42px; padding:6px 10px; box-sizing:border-box;">
                <div class="ai-cap-assignee-pills" style="display:flex; gap:6px; flex-wrap:wrap; flex:1; align-items:center;">${assigneePills(ids)}</div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.6; flex-shrink:0;"><polyline points="6 9 12 15 18 9"></polyline></svg>
            </div>
            <div class="ai-cap-assignee-panel" style="display:none; margin-top:6px; max-height:220px; overflow-y:auto; background:rgba(15,23,42,0.85); border:1px solid rgba(255,255,255,0.1); border-radius:10px; padding:6px;">${assigneeListRows(uid, ids)}</div>
        </div>`;
    }

    window.aiCapToggleAssigneePanel = function (uid) {
        const wrap = document.getElementById(uid);
        if (!wrap) return;
        const panel = wrap.querySelector('.ai-cap-assignee-panel');
        panel.style.display = (panel.style.display === 'none' || !panel.style.display) ? 'block' : 'none';
    };

    window.aiCapToggleAssignee = function (uid, userId) {
        const wrap = document.getElementById(uid);
        if (!wrap) return;
        let ids = [];
        try { ids = JSON.parse(wrap.dataset.selected || '[]'); } catch (e) { ids = []; }
        const idx = ids.findIndex(x => String(x) === String(userId));
        if (idx > -1) ids.splice(idx, 1); else ids.push(userId);
        wrap.dataset.selected = JSON.stringify(ids);
        const pills = wrap.querySelector('.ai-cap-assignee-pills');
        const panel = wrap.querySelector('.ai-cap-assignee-panel');
        if (pills) pills.innerHTML = assigneePills(ids);
        if (panel) panel.innerHTML = assigneeListRows(uid, ids);
    };

    // Ordnet einen genannten Vor-/Nachnamen einem Benutzer zu.
    function matchUserId(hint) {
        if (!hint) return null;
        const list = window.userList || [];
        const norm = s => String(s || '').toLowerCase().trim();
        const h = norm(hint);
        if (!h) return null;
        // exakter Worttreffer (Vor- oder Nachname), dann Teilstring, dann Initialen
        let hit = list.find(u => norm(u.name).split(/\s+/).includes(h));
        if (hit) return hit.id;
        hit = list.find(u => norm(u.name).includes(h) || norm(u.initials) === h);
        return hit ? hit.id : null;
    }

    // ---- Modal-Aufbau (dynamisch, damit index.html schlank bleibt) ---------
    function ensureModal() {
        let modal = document.getElementById('ai-capture-modal');
        if (modal) return modal;

        modal = document.createElement('div');
        modal.id = 'ai-capture-modal';
        modal.className = 'modal-backdrop hidden';
        modal.style.cssText = 'z-index: 1400; align-items: center; justify-content: center;';
        modal.innerHTML = `
            <div class="modal-content glass-card" style="max-width: 720px; width: 96%; padding: 1.75rem; display: flex; flex-direction: column; max-height: 92vh; border: 1px solid rgba(255,255,255,0.12);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem; flex-shrink:0;">
                    <h2 style="margin:0; font-size:1.35rem; color:#fff; display:flex; align-items:center; gap:10px;">
                        <span style="font-size:1.4rem;">✨</span> KI-Erfassung
                    </h2>
                    <button class="btn-close-modal" onclick="window.closeAiCaptureModal()" style="background:none;border:none;color:#fff;font-size:1.6rem;cursor:pointer;line-height:1;">&times;</button>
                </div>

                <div id="ai-capture-input-area" style="flex-shrink:0;">
                    <p style="color:rgba(255,255,255,0.55); font-size:0.85rem; margin:0 0 0.75rem 0; line-height:1.5;">
                        Beschreibe frei, was zu tun ist. Die KI schlägt Aufgaben (mit Unteraufgaben) und Vorgänge vor — du prüfst alles, bevor gespeichert wird.
                    </p>
                    <textarea id="ai-capture-text" class="glass-form-input" rows="6" placeholder="z.B. Beim Trommelsieb 4230 muss das Sieblager getauscht werden, vorher Ersatzteil bestellen und Kunde Meyer anrufen wegen Termin. Außerdem Angebot für neue Förderbänder rausschicken."
                        style="width:100%; box-sizing:border-box; resize:vertical; font-size:0.95rem;"></textarea>
                    <div style="display:flex; gap:0.6rem; margin-top:0.9rem;">
                        <button onclick="window.closeAiCaptureModal()" class="btn-modal-base btn-modal-cancel" style="flex:0 0 auto;">Abbrechen</button>
                        <button id="ai-capture-run-btn" onclick="window.runAiCapture()" class="btn-modal-base btn-modal-save" style="flex:1; gap:8px;">
                            <span>✨</span> Analysieren
                        </button>
                    </div>
                </div>

                <div id="ai-capture-status" style="display:none; text-align:center; color:#60a5fa; padding:1.5rem 0; font-weight:600;"></div>

                <div id="ai-capture-preview" style="display:none; overflow-y:auto; margin-top:0.5rem; flex:1 1 auto;"></div>

                <div id="ai-capture-preview-actions" style="display:none; gap:0.6rem; margin-top:1rem; flex-shrink:0;">
                    <button onclick="window.resetAiCapture()" class="btn-modal-base btn-modal-cancel" style="flex:0 0 auto;">Zurück</button>
                    <button onclick="window.saveAiCaptureResults()" id="ai-capture-save-btn" class="btn-modal-base btn-modal-save" style="flex:1; gap:8px;">
                        <span>💾</span> Ausgewählte anlegen
                    </button>
                </div>
            </div>`;
        document.body.appendChild(modal);
        return modal;
    }

    window.openAiCaptureModal = function () {
        const modal = ensureModal();
        window.resetAiCapture();
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
        requestAnimationFrame(() => modal.classList.add('show'));
    };

    window.closeAiCaptureModal = function () {
        const modal = document.getElementById('ai-capture-modal');
        if (!modal) return;
        modal.classList.remove('show');
        setTimeout(() => { modal.classList.add('hidden'); modal.style.display = 'none'; }, 250);
    };

    window.resetAiCapture = function () {
        lastResult = null;
        const inp = document.getElementById('ai-capture-input-area');
        const status = document.getElementById('ai-capture-status');
        const prev = document.getElementById('ai-capture-preview');
        const prevAct = document.getElementById('ai-capture-preview-actions');
        if (inp) inp.style.display = 'block';
        if (status) status.style.display = 'none';
        if (prev) { prev.style.display = 'none'; prev.innerHTML = ''; }
        if (prevAct) prevAct.style.display = 'none';
    };

    // ---- KI-Aufruf ---------------------------------------------------------
    window.runAiCapture = async function () {
        const text = (document.getElementById('ai-capture-text')?.value || '').trim();
        if (!text) { alert('Bitte zuerst etwas eingeben.'); return; }
        lastInputText = text;

        const apiKey = localStorage.getItem('groq_api_key');
        if (!apiKey) { alert('Bitte zuerst einen Groq API-Key in den Einstellungen hinterlegen (wie bei der Buchhaltung).'); return; }

        const inp = document.getElementById('ai-capture-input-area');
        const status = document.getElementById('ai-capture-status');
        if (inp) inp.style.display = 'none';
        if (status) { status.style.display = 'block'; status.textContent = 'KI analysiert deine Eingabe...'; }

        const machineHintList = (window.machineList || [])
            .map(m => [m.manufacturer, m.name, m.serial].filter(Boolean).join(' '))
            .filter(Boolean).slice(0, 60).join('; ');

        const groupNames = (window.taskSupergroupNames && window.taskSupergroupNames.length)
            ? window.taskSupergroupNames
            : ['Schweißen', 'Wartung', 'Hydraulik', 'Elektrik', 'Mechanik', 'Motor', 'Allgemein'];

        const userNames = (window.userList || []).map(u => u.name).filter(Boolean).slice(0, 40).join('; ');
        const blockTitles = (window.taskSubtaskTemplates || []).map(t => t.title).filter(Boolean).slice(0, 60).join('; ');

        const systemPrompt = `Du bist ein Assistent für eine Maschinen-Service-Firma. Wandle die folgende freie Beschreibung in strukturierte Daten um und antworte AUSSCHLIESSLICH mit einem JSON-Objekt (Deutsch), ohne Erklärtext.

Schema:
{
  "aufgaben": [
    { "title": "kurzer Titel", "description": "optional, Details",
      "machine_hint": "Maschinenname/Seriennr. falls genannt, sonst leer",
      "workshop_order": "Werkstattauftragsnummer, falls genannt: JEDE 5-stellige Zahl die mit 40 beginnt (z.B. 40123) ODER Form 2026-40123, oder wenn 'Werkstattauftrag'/'Auftrag' gesagt wird. Dann diese Nummer hier, sonst leer",
      "assignee_hint": "Vor- oder Nachname der Person, die es tun soll, falls genannt, sonst leer",
      "subtasks": [ { "title": "Arbeitsschritt", "supergroup": "eine Übergruppe", "suggested": false } ] }
  ],
  "vorgaenge": [
    { "title": "kurzer Titel", "process_type": "einer aus [note, call, appointment, repair, maintenance, offer, order, complaint, other]",
      "machine_hint": "falls genannt, sonst leer",
      "assignee_hint": "Vor- oder Nachname der zuständigen Person, falls genannt, sonst leer",
      "remark": "optional" }
  ]
}

process_type richtig wählen (wichtig):
- repair = Reparatur/Störung/Defekt/instandsetzen.
- maintenance = Wartung/Inspektion/Service/Ölwechsel/UVV.
- order = Bestellung/Ersatzteil ordern/nachbestellen.
- offer = Angebot erstellen/senden.
- complaint = Reklamation/Beschwerde/Mängelrüge.
- call = Telefonat/anrufen/zurückrufen.
- appointment = Termin/Besuch/vor Ort.
- note = interne Notiz/Information ohne Aktion.
- other = nur wenn nichts davon passt.

Bekannte Mitarbeiter (für assignee_hint, exakt so schreiben): ${userNames || 'keine'}.

Unterscheidung AUFGABE vs. VORGANG (wichtig!):
- AUFGABE = eine tatsächlich an einer Maschine auszuführende Arbeit/Reparatur/Wartung.
  Beispiele: "Bei Maschine XY eine Wartung machen", "Rotor instandsetzen", "Sieblager tauschen".
  Solche Arbeiten gehören zu einer Maschine. Zerlege sie in sinnvolle "subtasks".
- VORGANG = Kommunikation oder ein Geschäftsereignis rund um eine Maschine, KEINE Werkstattarbeit.
  Beispiele: "Angebot an Kunde XY für Maschine ... schicken" (process_type "offer"),
  "Kunde anrufen wegen Termin" ("call"), "Ersatzteil bestellen" ("order"), "Reklamation" ("complaint").

Übergruppen (supergroup) je subtask — wähle die thematisch passendste aus dieser Liste, sonst "Allgemein":
[${groupNames.join(', ')}].
Beispiel: Schweißarbeiten -> "Schweißen", Ölwechsel/Inspektion -> "Wartung", Hydraulikschlauch -> "Hydraulik".
Unteraufgaben zu Eingangsprotokoll/Eingang, Abnahme/Abnahmeprotokoll oder allgemein "Protokoll" der passenden Protokoll-/Abnahme-Übergruppe zuordnen, falls es eine gibt.

Vordefinierte Unteraufgaben-Bausteine (nutze GENAU diese Schreibweise als subtask-title, wenn eine Unteraufgabe dazu passt — z.B. "Service durchführen", "Eingangsprotokoll", "Abnahmeprotokoll"): [${blockTitles || 'keine'}].

Eingangsprotokoll vs. Abnahmeprotokoll NIEMALS verwechseln:
- Eingangsprotokoll = wenn eine Maschine ANKOMMT/angeliefert/hereingenommen wird (Wareneingang, Ankauf, Rücknahme, "kommt rein", "bei Anlieferung").
- Abnahmeprotokoll = wenn eine Maschine FERTIG ist / RAUSGEHT (Endabnahme, vor Auslieferung, Übergabe an Kunde, "fertig", "wird ausgeliefert").
Nur das jeweils passende als Unteraufgabe anlegen.

Regeln:
- Korrigiere offensichtliche Rechtschreib- und Tippfehler in Titeln, Unteraufgaben und Bemerkungen (Bedeutung/Inhalt unverändert lassen, nur sauber schreiben).
- ZAHLEN und SERIENNUMMERN NIEMALS ändern/„korrigieren" — exakt Ziffer für Ziffer übernehmen.
- Wenn NUR eine Seriennummer genannt wird (ohne Maschinennamen), schreibe genau diese Nummer unverändert in machine_hint.
- Denke als erfahrener Servicetechniker mit: Ergänze über die genannten Schritte hinaus sinnvolle, üblicherweise dazugehörige Unteraufgaben (z.B. Sicht-/Funktionsprüfung, Probelauf, Doku/Fotos, Ersatzteil prüfen, Entsorgung, Reinigung). Solche selbst ergänzten Schritte mit "suggested": true markieren; ausdrücklich genannte Schritte mit "suggested": false. Halte Vorschläge realistisch und knapp (max. 3-5 zusätzliche), keine erfundenen Fakten (keine erfundenen Maschinen, Namen, Nummern, Termine).
- Maschinen/Namen/Nummern/Personen NICHT erfinden. Leere Listen sind erlaubt. Wenn keine Maschine genannt ist, lasse machine_hint leer (nicht raten).
- Bekannte Maschinen (Auszug): ${machineHintList || 'keine'}.`;

        async function callGroq(model) {
            return fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                body: JSON.stringify({
                    model,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: text }
                    ],
                    temperature: 0.2,
                    response_format: { type: 'json_object' }
                })
            });
        }

        try {
            const chosenModel = groqModel();
            let response = await callGroq(chosenModel);

            // Fallback: ungültiges/nicht verfügbares Modell -> zuverlässiges Standardmodell
            if (!response.ok && chosenModel !== GROQ_FALLBACK_MODEL) {
                let emsg = '';
                try { const e = await response.clone().json(); emsg = (e.error?.message || '') + (e.error?.code || ''); } catch (_) {}
                if (/model|decommission|not found|does not exist|invalid/i.test(emsg) || response.status === 404 || response.status === 400) {
                    console.warn(`Groq-Modell "${chosenModel}" nicht nutzbar, weiche auf ${GROQ_FALLBACK_MODEL} aus.`);
                    response = await callGroq(GROQ_FALLBACK_MODEL);
                }
            }

            if (!response.ok) {
                let msg = response.statusText;
                try { const e = await response.json(); msg = e.error?.message || msg; } catch (_) {}
                throw new Error(msg);
            }

            const data = await response.json();
            let resultText = (data.choices?.[0]?.message?.content || '').replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            const parsed = JSON.parse(resultText);

            lastResult = {
                aufgaben: Array.isArray(parsed.aufgaben) ? parsed.aufgaben : [],
                vorgaenge: Array.isArray(parsed.vorgaenge) ? parsed.vorgaenge : []
            };

            // Vorhandene offene Aufgaben & Vorgänge laden (für "hinzufügen statt neu anlegen")
            try {
                const [tRes, pRes] = await Promise.all([
                    window.supabaseClient.from('tasks').select('id, title, machine_id, workshop_order_number, status').neq('status', 'completed'),
                    window.supabaseClient.from('internal_processes').select('id, title, machine_id, process_type')
                ]);
                existingTasks = tRes.data || [];
                existingProcesses = pRes.data || [];
            } catch (e) {
                console.warn('Konnte vorhandene Aufgaben/Vorgänge nicht laden:', e);
                existingTasks = []; existingProcesses = [];
            }

            renderPreview();
        } catch (err) {
            console.error('AI Capture Fehler:', err);
            if (status) status.style.display = 'none';
            if (inp) inp.style.display = 'block';
            alert('Fehler bei der KI-Analyse: ' + (err.message || err));
        }
    };

    // ---- Vorschau ----------------------------------------------------------
    function renderPreview() {
        const status = document.getElementById('ai-capture-status');
        const prev = document.getElementById('ai-capture-preview');
        const prevAct = document.getElementById('ai-capture-preview-actions');
        if (status) status.style.display = 'none';

        const aufgaben = lastResult.aufgaben || [];
        const vorgaenge = lastResult.vorgaenge || [];

        if (aufgaben.length === 0 && vorgaenge.length === 0) {
            prev.style.display = 'block';
            prev.innerHTML = '<p style="color:rgba(255,255,255,0.6); text-align:center; padding:1.5rem;">Die KI konnte nichts Konkretes erkennen. Formuliere es etwas ausführlicher.</p>';
            if (prevAct) prevAct.style.display = 'none';
            return;
        }

        const typeLabels = { note: 'Interne Notiz', call: 'Telefonat', appointment: 'Termin / Besuch', repair: 'Reparatur', maintenance: 'Wartung', offer: 'Angebot', order: 'Bestellung', complaint: 'Reklamation', other: 'Sonstiges' };
        const typeOptions = (sel) => Object.entries(typeLabels).map(([v, l]) =>
            `<option value="${v}"${v === sel ? ' selected' : ''}>${l}</option>`).join('');

        let html = '';

        if (aufgaben.length) {
            html += `<h3 style="color:var(--color-primary-green); font-size:0.8rem; text-transform:uppercase; letter-spacing:1px; margin:0.25rem 0 0.75rem 0;">Aufgaben (${aufgaben.length})</h3>`;
            aufgaben.forEach((a, i) => {
                // Maschine: exakte Seriennummer zuerst (Hint, dann Rohtext der Eingabe),
                // erst danach die unschärfere Namens-/Teilstring-Suche.
                const mId = matchMachineBySerial(a.machine_hint)
                    || matchMachineBySerial(`${a.title || ''} ${a.description || ''}`)
                    || matchMachineBySerial(lastInputText)
                    || matchMachineId(a.machine_hint)
                    || matchMachineId(`${a.title || ''} ${a.description || ''}`);
                // WA-Nummer aus KI-Feld; als Fallback aus Text NUR wenn keine Maschine gefunden wurde
                let waNum = (a.workshop_order || '').trim();
                if (!waNum && !mId) waNum = detectWorkshopOrder(`${a.title || ''} ${a.description || ''}`);
                const mode = waNum ? 'wa' : 'machine'; // WA-Nummer -> direkt Werkstattauftrag
                const subs = (Array.isArray(a.subtasks) ? a.subtasks : []).map(s => {
                    const st = (typeof s === 'string') ? { title: s, supergroup: 'Allgemein', suggested: false } : { title: s.title || '', supergroup: s.supergroup || 'Allgemein', suggested: !!s.suggested };
                    const action = detectSubtaskAction(st.title);
                    return { title: st.title, supergroup: supergroupForSubtask(st.title, action, st.supergroup), action, suggested: st.suggested };
                });
                const needMachine = mode === 'machine' && !mId;
                const needWa = mode === 'wa' && !waNum;
                const aUserId = matchUserId(a.assignee_hint);
                const modeBtn = (m, label) => `<button type="button" onclick="window.aiCapSetTaskMode(this, '${m}')" data-mode="${m}" class="ai-cap-mode-btn" style="flex:1; padding:6px 8px; border-radius:8px; cursor:pointer; font-size:0.8rem; font-weight:700; border:1px solid ${mode === m ? 'var(--color-primary-green)' : 'rgba(255,255,255,0.12)'}; background:${mode === m ? 'rgba(0,150,64,0.18)' : 'rgba(255,255,255,0.04)'}; color:${mode === m ? '#4ade80' : 'rgba(255,255,255,0.6)'};">${label}</button>`;
                html += `
                <div class="ai-cap-card" data-kind="task" data-index="${i}" data-assign="${mode}" style="background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.1); border-radius:14px; padding:1rem; margin-bottom:0.75rem;">
                    <label style="display:flex; align-items:center; gap:8px; margin-bottom:0.6rem; cursor:pointer;">
                        <input type="checkbox" class="ai-cap-include" checked style="width:18px;height:18px;accent-color:var(--color-primary-green);">
                        <span style="font-size:0.7rem; font-weight:800; color:#4ade80; text-transform:uppercase; letter-spacing:1px;">Aufgabe</span>
                    </label>
                    <input type="text" class="ai-cap-title glass-form-input" value="${escapeHtml(a.title || '')}" placeholder="Titel" style="width:100%; box-sizing:border-box; font-weight:700; margin-bottom:0.5rem;">
                    <textarea class="ai-cap-desc glass-form-input" rows="2" placeholder="Beschreibung (optional)" style="width:100%; box-sizing:border-box; resize:vertical; font-size:0.9rem; margin-bottom:0.5rem;">${escapeHtml(a.description || '')}</textarea>
                    <div style="display:flex; gap:6px; margin-bottom:0.5rem;">${modeBtn('machine', '🔧 Maschine')}${modeBtn('wa', '📋 Werkstattauftrag')}</div>
                    <div class="ai-cap-machine-block" style="${mode === 'machine' ? '' : 'display:none;'}">
                        <select class="ai-cap-machine glass-form-input" data-require="1" style="width:100%; box-sizing:border-box; margin-bottom:0.25rem;${needMachine ? ' border:2px solid #f87171;' : ''}">${machineOptions(mId)}</select>
                        <div class="ai-cap-machine-hint" style="font-size:0.72rem; color:#f87171; margin-bottom:0.5rem;${needMachine ? '' : ' display:none;'}">⚠ Bitte Maschine zuordnen</div>
                        <div class="ai-cap-task-target-wrap" style="margin-bottom:0.5rem;${openTasksForMachine(mId).length ? '' : ' display:none;'}">
                            <div style="font-size:0.72rem; color:#fbbf24; margin-bottom:3px;">Diese Maschine hat bereits offene Aufgaben:</div>
                            <select class="ai-cap-task-target glass-form-input" style="width:100%; box-sizing:border-box; font-size:0.85rem;">${taskTargetOptions(mId)}</select>
                        </div>
                    </div>
                    <div class="ai-cap-wa-block" style="${mode === 'wa' ? '' : 'display:none;'}">
                        <input type="text" class="ai-cap-wa-number glass-form-input" value="${escapeHtml(waNum)}" placeholder="Werkstattauftragsnummer z.B. 2026-40123" oninput="window.aiCapWaChanged(this)" style="width:100%; box-sizing:border-box; margin-bottom:0.25rem;${needWa ? ' border:2px solid #f87171;' : ''}">
                        <div class="ai-cap-wa-hint" style="font-size:0.72rem; color:#f87171; margin-bottom:0.5rem;${needWa ? '' : ' display:none;'}">⚠ Bitte Auftragsnummer eingeben</div>
                        <div class="ai-cap-wa-target-wrap" style="margin-bottom:0.5rem;${openTasksForWorkshop(waNum).length ? '' : ' display:none;'}">
                            <div style="font-size:0.72rem; color:#fbbf24; margin-bottom:3px;">Zu diesem Werkstattauftrag gibt es bereits Aufgaben:</div>
                            <select class="ai-cap-wa-target glass-form-input" style="width:100%; box-sizing:border-box; font-size:0.85rem;">${taskWaTargetOptions(waNum)}</select>
                        </div>
                    </div>
                    <div style="margin-bottom:0.5rem;">
                        <div style="font-size:0.72rem; color:rgba(255,255,255,0.4); text-transform:uppercase; letter-spacing:1px; margin-bottom:4px;">👤 Zuständig (Mehrfachauswahl)</div>
                        ${assigneeControl(`aicap-asg-t-${i}`, aUserId ? [aUserId] : [])}
                    </div>
                    ${subs.length ? `<div style="font-size:0.72rem; color:rgba(255,255,255,0.4); text-transform:uppercase; letter-spacing:1px; margin:0.3rem 0;">Unteraufgaben · Übergruppe</div>` : ''}
                    <div class="ai-cap-subs">
                        ${subs.map(s => `
                        <div class="ai-cap-sub-row" data-action="${escapeHtml(s.action || '')}" style="display:flex; gap:6px; margin-bottom:0.35rem; align-items:center; flex-wrap:wrap;">
                            <input type="text" class="ai-cap-sub glass-form-input" value="${escapeHtml(s.title)}" style="flex:1 1 40%; box-sizing:border-box; font-size:0.88rem;${s.suggested ? ' border-left:3px solid #fbbf24;' : ''}">
                            <select class="ai-cap-sub-group glass-form-input" style="flex:0 0 30%; box-sizing:border-box; font-size:0.82rem;">${supergroupOptions(s.supergroup)}</select>
                            ${s.suggested ? `<span title="Von der KI vorgeschlagen – prüfen oder mit × entfernen" style="font-size:0.66rem; font-weight:800; color:#fbbf24; background:rgba(251,191,36,0.15); border-radius:6px; padding:2px 6px; white-space:nowrap;">💡 Vorschlag</span>` : ''}
                            ${s.action ? actionBadge(s.action) : ''}
                            <button type="button" onclick="this.closest('.ai-cap-sub-row').remove()" title="Unteraufgabe entfernen" style="flex:0 0 auto; width:28px; height:28px; border-radius:7px; border:1px solid rgba(248,113,113,0.4); background:rgba(248,113,113,0.12); color:#f87171; cursor:pointer; font-size:1rem; line-height:1; display:inline-flex; align-items:center; justify-content:center;">×</button>
                        </div>`).join('')}
                    </div>
                </div>`;
            });
        }

        if (vorgaenge.length) {
            html += `<h3 style="color:#818cf8; font-size:0.8rem; text-transform:uppercase; letter-spacing:1px; margin:1rem 0 0.75rem 0;">Vorgänge (${vorgaenge.length})</h3>`;
            vorgaenge.forEach((v, i) => {
                const mId = matchMachineBySerial(v.machine_hint)
                    || matchMachineBySerial(`${v.title || ''} ${v.remark || ''}`)
                    || matchMachineId(v.machine_hint)
                    || matchMachineId(`${v.title || ''} ${v.remark || ''}`);
                const t = typeLabels[v.process_type] ? v.process_type : 'other';
                const vUserId = matchUserId(v.assignee_hint);
                html += `
                <div class="ai-cap-card" data-kind="process" data-index="${i}" style="background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.1); border-radius:14px; padding:1rem; margin-bottom:0.75rem;">
                    <label style="display:flex; align-items:center; gap:8px; margin-bottom:0.6rem; cursor:pointer;">
                        <input type="checkbox" class="ai-cap-include" checked style="width:18px;height:18px;accent-color:#818cf8;">
                        <span style="font-size:0.7rem; font-weight:800; color:#a5b4fc; text-transform:uppercase; letter-spacing:1px;">Vorgang</span>
                    </label>
                    <input type="text" class="ai-cap-title glass-form-input" value="${escapeHtml(v.title || '')}" placeholder="Titel" style="width:100%; box-sizing:border-box; font-weight:700; margin-bottom:0.5rem;">
                    <select class="ai-cap-type glass-form-input" style="width:100%; box-sizing:border-box; margin-bottom:0.5rem;">${typeOptions(t)}</select>
                    <select class="ai-cap-machine glass-form-input" style="width:100%; box-sizing:border-box; margin-bottom:0.5rem;">${machineOptions(mId)}</select>
                    <div class="ai-cap-proc-target-wrap" style="margin-bottom:0.5rem;${processesMatching(mId, v.title).length ? '' : ' display:none;'}">
                        <div style="font-size:0.72rem; color:#fbbf24; margin-bottom:3px;">Passender Vorgang existiert bereits:</div>
                        <select class="ai-cap-proc-target glass-form-input" style="width:100%; box-sizing:border-box; font-size:0.85rem;">${processTargetOptions(mId, v.title)}</select>
                    </div>
                    <div style="margin-bottom:0.5rem;">
                        <div style="font-size:0.72rem; color:rgba(255,255,255,0.4); text-transform:uppercase; letter-spacing:1px; margin-bottom:4px;">👤 Zuständig (Mehrfachauswahl)</div>
                        ${assigneeControl(`aicap-asg-v-${i}`, vUserId ? [vUserId] : [])}
                    </div>
                    <input type="text" class="ai-cap-remark glass-form-input" value="${escapeHtml(v.remark || '')}" placeholder="Bemerkung / Status-Text (optional)" style="width:100%; box-sizing:border-box; font-size:0.9rem;">
                </div>`;
            });
        }

        prev.style.display = 'block';
        prev.innerHTML = html;
        if (prevAct) prevAct.style.display = 'flex';

        // Bei Maschinenwechsel: Warnung ausblenden + Ziel-Auswahl (vorhandene Aufgaben/Vorgänge) neu aufbauen
        prev.querySelectorAll('.ai-cap-card').forEach(card => {
            const machineSel = card.querySelector('.ai-cap-machine');
            if (!machineSel) return;
            machineSel.addEventListener('change', function () {
                const mId = this.value ? parseInt(this.value) : null;
                const kind = card.dataset.kind;

                if (kind === 'task') {
                    const hint = card.querySelector('.ai-cap-machine-hint');
                    if (this.value) { this.style.border = ''; if (hint) hint.style.display = 'none'; }
                    else { this.style.border = '2px solid #f87171'; if (hint) hint.style.display = 'block'; }

                    const wrap = card.querySelector('.ai-cap-task-target-wrap');
                    const tsel = card.querySelector('.ai-cap-task-target');
                    if (wrap && tsel) {
                        const has = openTasksForMachine(mId).length;
                        tsel.innerHTML = taskTargetOptions(mId);
                        wrap.style.display = has ? 'block' : 'none';
                    }
                } else {
                    const title = card.querySelector('.ai-cap-title')?.value || '';
                    const wrap = card.querySelector('.ai-cap-proc-target-wrap');
                    const psel = card.querySelector('.ai-cap-proc-target');
                    if (wrap && psel) {
                        const has = processesMatching(mId, title).length;
                        psel.innerHTML = processTargetOptions(mId, title);
                        wrap.style.display = has ? 'block' : 'none';
                    }
                }
            });
        });
    }

    // Umschalten Maschine <-> Werkstattauftrag pro Aufgabe
    window.aiCapSetTaskMode = function (btn, mode) {
        const card = btn.closest('.ai-cap-card');
        if (!card) return;
        card.dataset.assign = mode;
        card.querySelectorAll('.ai-cap-mode-btn').forEach(b => {
            const active = b.dataset.mode === mode;
            b.style.border = '1px solid ' + (active ? 'var(--color-primary-green)' : 'rgba(255,255,255,0.12)');
            b.style.background = active ? 'rgba(0,150,64,0.18)' : 'rgba(255,255,255,0.04)';
            b.style.color = active ? '#4ade80' : 'rgba(255,255,255,0.6)';
        });
        const mBlock = card.querySelector('.ai-cap-machine-block');
        const wBlock = card.querySelector('.ai-cap-wa-block');
        if (mBlock) mBlock.style.display = mode === 'machine' ? '' : 'none';
        if (wBlock) wBlock.style.display = mode === 'wa' ? '' : 'none';
    };

    // Werkstattauftragsnummer geändert -> Warnung + Ziel-Auswahl aktualisieren
    window.aiCapWaChanged = function (input) {
        const card = input.closest('.ai-cap-card');
        if (!card) return;
        const wa = input.value.trim();
        const hint = card.querySelector('.ai-cap-wa-hint');
        if (wa) { input.style.border = ''; if (hint) hint.style.display = 'none'; }
        const wrap = card.querySelector('.ai-cap-wa-target-wrap');
        const sel = card.querySelector('.ai-cap-wa-target');
        if (wrap && sel) {
            const has = openTasksForWorkshop(wa).length;
            sel.innerHTML = taskWaTargetOptions(wa);
            wrap.style.display = has ? 'block' : 'none';
        }
    };

    // ---- Speichern ---------------------------------------------------------
    window.saveAiCaptureResults = async function () {
        const saveBtn = document.getElementById('ai-capture-save-btn');
        const cards = Array.from(document.querySelectorAll('#ai-capture-preview .ai-cap-card'));
        const chosen = cards.filter(c => c.querySelector('.ai-cap-include')?.checked);
        if (chosen.length === 0) { alert('Nichts ausgewählt.'); return; }

        // Rückfrage: neu anzulegende Aufgaben brauchen eine Maschine ODER (im WA-Modus) eine Auftragsnummer
        for (const c of chosen) {
            if (c.dataset.kind !== 'task') continue;
            const mode = c.dataset.assign || 'machine';
            if (mode === 'machine') {
                const isNew = (c.querySelector('.ai-cap-task-target')?.value || 'new') === 'new';
                if (isNew && !(c.querySelector('.ai-cap-machine')?.value)) {
                    const sel = c.querySelector('.ai-cap-machine');
                    const hint = c.querySelector('.ai-cap-machine-hint');
                    if (sel) { sel.style.border = '2px solid #f87171'; sel.scrollIntoView({ behavior: 'smooth', block: 'center' }); sel.focus(); }
                    if (hint) hint.style.display = 'block';
                    alert('Bitte ordne der Aufgabe eine Maschine zu – oder wechsle auf „Werkstattauftrag". Gehört sie zu nichts, entferne den Haken.');
                    return;
                }
            } else {
                const isNew = (c.querySelector('.ai-cap-wa-target')?.value || 'new') === 'new';
                if (isNew && !(c.querySelector('.ai-cap-wa-number')?.value.trim())) {
                    const inp = c.querySelector('.ai-cap-wa-number');
                    const hint = c.querySelector('.ai-cap-wa-hint');
                    if (inp) { inp.style.border = '2px solid #f87171'; inp.scrollIntoView({ behavior: 'smooth', block: 'center' }); inp.focus(); }
                    if (hint) hint.style.display = 'block';
                    alert('Bitte gib die Werkstattauftragsnummer ein.');
                    return;
                }
            }
        }

        if (!window.supabaseClient) { alert('Keine Datenbankverbindung.'); return; }

        if (saveBtn) { saveBtn.disabled = true; saveBtn.innerHTML = '<span>⏳</span> Speichere...'; }

        let createdTasks = 0, updatedTasks = 0, createdProcesses = 0, updatedProcesses = 0;
        try {
            for (const card of chosen) {
                const kind = card.dataset.kind;
                const title = (card.querySelector('.ai-cap-title')?.value || '').trim();
                if (!title) continue;
                const machineVal = card.querySelector('.ai-cap-machine')?.value || '';
                const machineId = machineVal ? parseInt(machineVal) : null;
                // Mehrere Zuständige aus dem Multi-Select (UUIDs, roh übernehmen)
                let assignedArr = [];
                try { assignedArr = JSON.parse(card.querySelector('.ai-cap-assignee')?.dataset.selected || '[]'); } catch (e) { assignedArr = []; }

                if (kind === 'task') {
                    const subRows = Array.from(card.querySelectorAll('.ai-cap-sub-row'))
                        .map(row => ({
                            title: (row.querySelector('.ai-cap-sub')?.value || '').trim(),
                            supergroup: row.querySelector('.ai-cap-sub-group')?.value || 'Allgemein',
                            action_type: row.dataset.action || null
                        }))
                        .filter(r => r.title);

                    const mode = card.dataset.assign || 'machine';
                    const target = (mode === 'wa'
                        ? card.querySelector('.ai-cap-wa-target')?.value
                        : card.querySelector('.ai-cap-task-target')?.value) || 'new';
                    const waNumber = mode === 'wa' ? (card.querySelector('.ai-cap-wa-number')?.value.trim() || null) : null;

                    if (target !== 'new') {
                        // Zu vorhandener Aufgabe hinzufügen: nur Unteraufgaben anhängen
                        // (keine Subtasks -> Aufgaben-Titel als eine Unteraufgabe übernehmen)
                        const rows = (subRows.length ? subRows : [{ title, supergroup: 'Allgemein', action_type: null }])
                            .map(r => ({ task_id: target, title: r.title, status: 'open', supergroup: r.supergroup, action_type: r.action_type || null }));
                        const { error: subErr } = await window.supabaseClient.from('subtasks').insert(rows);
                        if (subErr) throw subErr;
                        // Zuständige Personen zur vorhandenen Aufgabe ergänzen (mergen)
                        if (assignedArr.length) {
                            const { data: curT } = await window.supabaseClient.from('tasks').select('assigned_to').eq('id', target).single();
                            const cur = Array.isArray(curT?.assigned_to) ? curT.assigned_to.slice() : [];
                            const curStr = cur.map(String);
                            let changed = false;
                            assignedArr.forEach(id => { if (!curStr.includes(String(id))) { cur.push(id); changed = true; } });
                            if (changed) await window.supabaseClient.from('tasks').update({ assigned_to: cur }).eq('id', target);
                        }
                        updatedTasks++;
                    } else {
                        const description = card.querySelector('.ai-cap-desc')?.value || '';
                        const { data, error } = await window.supabaseClient.from('tasks').insert([{
                            title, description, status: 'open',
                            machine_id: mode === 'wa' ? null : machineId,
                            workshop_order_number: waNumber,
                            created_by: window.activeUser?.id || null, assigned_to: assignedArr,
                            updated_at: new Date().toISOString()
                        }]).select('id');
                        if (error) throw error;
                        const taskId = data && data[0] ? data[0].id : null;
                        if (taskId && subRows.length) {
                            const rows = subRows.map(r => ({ task_id: taskId, title: r.title, status: 'open', supergroup: r.supergroup, action_type: r.action_type || null }));
                            const { error: subErr } = await window.supabaseClient.from('subtasks').insert(rows);
                            if (subErr) throw subErr;
                        }
                        createdTasks++;
                    }
                } else {
                    const type = card.querySelector('.ai-cap-type')?.value || 'other';
                    const remark = (card.querySelector('.ai-cap-remark')?.value || '').trim() || null;
                    const target = card.querySelector('.ai-cap-proc-target')?.value || 'new';

                    if (target !== 'new') {
                        // Status an vorhandenen Vorgang anhängen (status_log)
                        const { data: cur, error: readErr } = await window.supabaseClient
                            .from('internal_processes').select('status_log, assigned_users').eq('id', target).single();
                        if (readErr) throw readErr;
                        const entry = {
                            text: remark ? `${title} — ${remark}` : title,
                            user: window.activeUser?.name || window.currentUser?.name || 'Unbekannt',
                            user_id: window.activeUser?.id || window.currentUser?.id || null,
                            at: new Date().toISOString()
                        };
                        const newLog = [...(Array.isArray(cur?.status_log) ? cur.status_log : []), entry];
                        const upd = { status_log: newLog };
                        // Zuständige Personen ergänzen (mergen)
                        if (assignedArr.length) {
                            const curU = Array.isArray(cur?.assigned_users) ? cur.assigned_users.slice() : [];
                            const curUStr = curU.map(String);
                            let changedU = false;
                            assignedArr.forEach(id => { if (!curUStr.includes(String(id))) { curU.push(id); changedU = true; } });
                            if (changedU) upd.assigned_users = curU;
                        }
                        const { error: upErr } = await window.supabaseClient
                            .from('internal_processes').update(upd).eq('id', target);
                        if (upErr) throw upErr;
                        updatedProcesses++;
                    } else {
                        const { error } = await window.supabaseClient.from('internal_processes').insert([{
                            title, process_type: type, process_date: new Date().toISOString(),
                            machine_id: machineId, workshop_order_number: null, status: 'offen',
                            remark, assigned_users: assignedArr,
                            user_id: window.currentUser?.id || window.activeUser?.id || null
                        }]);
                        if (error) throw error;
                        createdProcesses++;
                    }
                }
            }

            if (typeof window.fetchProcesses === 'function') window.fetchProcesses();
            if (typeof window.fetchTasks === 'function') window.fetchTasks();

            window.closeAiCaptureModal();
            const parts = [];
            if (createdTasks) parts.push(`${createdTasks} neue Aufgabe(n)`);
            if (updatedTasks) parts.push(`${updatedTasks} Aufgabe(n) ergänzt`);
            if (createdProcesses) parts.push(`${createdProcesses} neue(r) Vorgang/Vorgänge`);
            if (updatedProcesses) parts.push(`${updatedProcesses} Vorgang/Vorgänge mit Status ergänzt`);
            alert('Gespeichert: ' + (parts.join(', ') || 'nichts'));
        } catch (err) {
            console.error('AI Capture Speichern fehlgeschlagen:', err);
            alert('Fehler beim Speichern: ' + (err.message || err));
        } finally {
            if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<span>💾</span> Ausgewählte anlegen'; }
        }
    };

    console.log('AI Quick Capture geladen.');
})();
