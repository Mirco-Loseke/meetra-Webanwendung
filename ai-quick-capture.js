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

    function userOptions(selectedId) {
        const list = window.userList || [];
        let html = '<option value="">— niemand —</option>';
        list.forEach(u => {
            const sel = (selectedId != null && String(selectedId) === String(u.id)) ? ' selected' : '';
            html += `<option value="${u.id}"${sel}>${escapeHtml(u.name || ('Benutzer ' + u.id))}</option>`;
        });
        return html;
    }

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
      "subtasks": [ { "title": "Arbeitsschritt", "supergroup": "eine Übergruppe" } ] }
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
- Wenn NUR eine Seriennummer genannt wird (ohne Maschinennamen), schreibe genau diese Nummer in machine_hint.
- Erfinde nichts. Leere Listen sind erlaubt. Wenn keine Maschine genannt ist, lasse machine_hint leer (nicht raten).
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
                // Maschine über Hint, sonst per Seriennummer aus Titel/Beschreibung
                const mId = matchMachineId(a.machine_hint) || matchMachineId(`${a.title || ''} ${a.description || ''}`);
                // WA-Nummer aus KI-Feld; als Fallback aus Text NUR wenn keine Maschine gefunden wurde
                let waNum = (a.workshop_order || '').trim();
                if (!waNum && !mId) waNum = detectWorkshopOrder(`${a.title || ''} ${a.description || ''}`);
                const mode = waNum ? 'wa' : 'machine'; // WA-Nummer -> direkt Werkstattauftrag
                const subs = (Array.isArray(a.subtasks) ? a.subtasks : []).map(s => {
                    const st = (typeof s === 'string') ? { title: s, supergroup: 'Allgemein' } : { title: s.title || '', supergroup: s.supergroup || 'Allgemein' };
                    const action = detectSubtaskAction(st.title);
                    return { title: st.title, supergroup: supergroupForSubtask(st.title, action, st.supergroup), action };
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
                    <div style="display:flex; align-items:center; gap:8px; margin-bottom:0.5rem;">
                        <span style="font-size:0.75rem; color:rgba(255,255,255,0.5); white-space:nowrap;">👤 Zuständig:</span>
                        <select class="ai-cap-assignee glass-form-input" style="flex:1; box-sizing:border-box; font-size:0.85rem;">${userOptions(aUserId)}</select>
                    </div>
                    ${subs.length ? `<div style="font-size:0.72rem; color:rgba(255,255,255,0.4); text-transform:uppercase; letter-spacing:1px; margin:0.3rem 0;">Unteraufgaben · Übergruppe</div>` : ''}
                    <div class="ai-cap-subs">
                        ${subs.map(s => `
                        <div class="ai-cap-sub-row" data-action="${escapeHtml(s.action || '')}" style="display:flex; gap:6px; margin-bottom:0.35rem; align-items:center; flex-wrap:wrap;">
                            <input type="text" class="ai-cap-sub glass-form-input" value="${escapeHtml(s.title)}" style="flex:1 1 40%; box-sizing:border-box; font-size:0.88rem;">
                            <select class="ai-cap-sub-group glass-form-input" style="flex:0 0 30%; box-sizing:border-box; font-size:0.82rem;">${supergroupOptions(s.supergroup)}</select>
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
                const mId = matchMachineId(v.machine_hint) || matchMachineId(`${v.title || ''} ${v.remark || ''}`);
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
                    <div style="display:flex; align-items:center; gap:8px; margin-bottom:0.5rem;">
                        <span style="font-size:0.75rem; color:rgba(255,255,255,0.5); white-space:nowrap;">👤 Zuständig:</span>
                        <select class="ai-cap-assignee glass-form-input" style="flex:1; box-sizing:border-box; font-size:0.85rem;">${userOptions(vUserId)}</select>
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
                // Benutzer-IDs sind UUIDs -> NICHT parseInt (das würde "1" o.ä. erzeugen)
                const assigneeId = card.querySelector('.ai-cap-assignee')?.value || null;
                const assignedArr = assigneeId ? [assigneeId] : [];

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
                        // Zuständige Person zur vorhandenen Aufgabe ergänzen
                        if (assigneeId) {
                            const { data: curT } = await window.supabaseClient.from('tasks').select('assigned_to').eq('id', target).single();
                            const cur = Array.isArray(curT?.assigned_to) ? curT.assigned_to.map(String) : [];
                            if (!cur.includes(String(assigneeId))) {
                                await window.supabaseClient.from('tasks').update({ assigned_to: [...(curT?.assigned_to || []), assigneeId] }).eq('id', target);
                            }
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
                        // Zuständige Person ergänzen
                        if (assigneeId) {
                            const curU = Array.isArray(cur?.assigned_users) ? cur.assigned_users.map(String) : [];
                            if (!curU.includes(String(assigneeId))) upd.assigned_users = [...(cur?.assigned_users || []), assigneeId];
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
