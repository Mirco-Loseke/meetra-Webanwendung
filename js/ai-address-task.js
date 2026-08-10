// ==========================================
// KI‑VORGANG AUS ADRESSE (mit Mikrofon + Schritt-Erkennung)
// ==========================================
// Öffnet einen Dialog, in dem man per Text ODER Mikrofon (Web Speech API)
// einen Vorgang beschreiben kann. Groq extrahiert daraus:
//   { title, description, due_date, subtasks: [{title, due_date}] }
// Beispiel-Eingabe:
//   "Ich soll bis Ende der Woche ein Angebot für die Siebtrommel machen
//    und danach den nächsten Termin absprechen"
// -> Vorgang "Angebot Siebtrommel + Termin", Fällig kommender Freitag,
//    Schritte "Angebot rüberschicken" (Freitag) und "Nächsten Termin
//    absprechen" (ohne Datum).
//
// Speichert am Ende:
//   - tasks-Zeile (mit customer_id + optional due_date)
//   - subtasks (mit optional due_date)
//   - customer_notes-Eintrag als Historie ('task' / Fallback 'system')
// ==========================================
(function () {
    'use strict';

    const GROQ_FALLBACK_MODEL = 'llama-3.3-70b-versatile';
    function groqModel() { return localStorage.getItem('groq_model') || GROQ_FALLBACK_MODEL; }

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    function sb() { return window.supabaseClient; }

    function todayInfo() {
        const d = new Date();
        const weekdays = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
        const iso = d.toISOString().slice(0, 10);
        return { iso, weekday: weekdays[d.getDay()], dow: d.getDay() };
    }

    function fmtDeDate(iso) {
        if (!iso) return '';
        const [y, m, d] = iso.split('-');
        return `${d}.${m}.${y}`;
    }

    // ---------------------------------------------------------------
    // Modal-Aufbau
    // ---------------------------------------------------------------
    let currentCustomerId = null;
    let currentAddressLabel = '';
    let currentContactName = '';
    let recognition = null;
    let recognitionActive = false;

    function ensureModal() {
        if (document.getElementById('ab-ai-task-modal')) return;
        const el = document.createElement('div');
        el.id = 'ab-ai-task-modal';
        el.className = 'modal-backdrop';
        el.innerHTML = `
            <div class="modal-content" style="max-width:640px; max-height:90vh; overflow-y:auto;">
                <button class="ab-icon-btn" data-abai-close style="position:absolute; top:14px; right:14px;" title="Schließen">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
                <h2 style="margin-top:0;">KI‑Vorgang aus Adresse</h2>
                <div id="ab-ai-task-subtitle" style="color:var(--color-secondary); margin-top:-8px; margin-bottom:12px; font-size:0.85rem;"></div>

                <label style="font-size:0.72rem; font-weight:800; letter-spacing:0.06em; text-transform:uppercase; color:var(--color-secondary); display:block; margin-bottom:6px;">
                    Beschreibung (Text oder Mikrofon)
                </label>
                <div style="position:relative;">
                    <textarea id="ab-ai-task-input" rows="6" placeholder="z. B. Bis Ende der Woche ein Angebot für die neue Siebtrommel schicken, dann Termin für die Vorführung nächste Woche absprechen …"
                              style="width:100%; padding:12px 48px 12px 12px; border-radius:12px; border:1px solid var(--glass-border); background:rgba(255,255,255,0.05); color:var(--color-text); font-family:var(--font-sans); font-size:0.9rem; resize:vertical;"></textarea>
                    <button type="button" id="ab-ai-task-mic" title="Diktieren (Mikrofon starten/stoppen)"
                            style="position:absolute; top:8px; right:8px; width:36px; height:36px; border-radius:10px; border:1px solid var(--glass-border); background:rgba(255,255,255,0.06); color:var(--color-text); cursor:pointer; display:flex; align-items:center; justify-content:center;">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
                    </button>
                </div>
                <div id="ab-ai-task-mic-status" style="font-size:0.72rem; color:var(--color-secondary); margin-top:4px; min-height:1em;"></div>

                <div style="display:flex; gap:10px; margin-top:12px;">
                    <button type="button" id="ab-ai-task-analyze" class="ab-btn ab-btn-primary" style="flex:1;">
                        KI analysieren
                    </button>
                </div>

                <div id="ab-ai-task-preview" style="display:none; margin-top:16px; padding:14px; border-radius:14px; border:1px solid rgba(167,139,250,0.35); background:rgba(167,139,250,0.06);"></div>

                <div id="ab-ai-task-actions" style="display:none; gap:8px; margin-top:14px; justify-content:flex-end;">
                    <button type="button" class="ab-btn ab-btn-ghost" data-abai-close>Abbrechen</button>
                    <button type="button" id="ab-ai-task-save" class="ab-btn ab-btn-primary">Vorgang speichern</button>
                </div>
            </div>`;
        document.body.appendChild(el);

        // Close-Wirings
        el.addEventListener('click', (e) => {
            if (e.target === el) closeModal();
            if (e.target.closest('[data-abai-close]')) closeModal();
        });

        document.getElementById('ab-ai-task-mic').addEventListener('click', toggleMic);
        document.getElementById('ab-ai-task-analyze').addEventListener('click', runAnalysis);
        document.getElementById('ab-ai-task-save').addEventListener('click', saveResult);
    }

    function closeModal() {
        stopMic();
        const el = document.getElementById('ab-ai-task-modal');
        if (el) { el.classList.remove('show', 'active'); }
        document.body.style.overflow = '';
    }

    window.openAddressTaskAiModal = function (customerId, addressLabel, contactName) {
        currentCustomerId = customerId;
        currentAddressLabel = addressLabel || '';
        currentContactName = contactName || '';
        ensureModal();
        document.getElementById('ab-ai-task-input').value = '';
        document.getElementById('ab-ai-task-preview').style.display = 'none';
        document.getElementById('ab-ai-task-preview').innerHTML = '';
        document.getElementById('ab-ai-task-actions').style.display = 'none';
        document.getElementById('ab-ai-task-subtitle').textContent = addressLabel
            ? `für ${addressLabel}${contactName ? ' · ' + contactName : ''}`
            : '';
        document.getElementById('ab-ai-task-mic-status').textContent = '';
        const el = document.getElementById('ab-ai-task-modal');
        el.classList.add('show', 'active');
        document.body.style.overflow = 'hidden';
        setTimeout(() => document.getElementById('ab-ai-task-input').focus(), 50);
    };

    // ---------------------------------------------------------------
    // Mikrofon (Web Speech API, deutsch)
    // ---------------------------------------------------------------
    function toggleMic() {
        const status = document.getElementById('ab-ai-task-mic-status');
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) {
            status.textContent = 'Spracheingabe ist in diesem Browser nicht verfügbar (nur Chrome/Edge).';
            status.style.color = '#fca5a5';
            return;
        }
        // Web Speech API funktioniert nur über HTTPS oder localhost. file:// und
        // plain http:// liefern beim Start meist gar keinen sichtbaren Fehler.
        const proto = location.protocol;
        const host = location.hostname;
        const isSecureCtx = proto === 'https:' || host === 'localhost' || host === '127.0.0.1';
        if (!isSecureCtx) {
            status.textContent = 'Mikrofon geht nur über HTTPS oder localhost. Aktuelle URL: ' + location.href;
            status.style.color = '#fca5a5';
            return;
        }
        if (recognitionActive) { stopMic(); return; }
        status.style.color = '';

        recognition = new SR();
        recognition.lang = 'de-DE';
        recognition.interimResults = true;
        recognition.continuous = true;

        const input = document.getElementById('ab-ai-task-input');
        const micBtn = document.getElementById('ab-ai-task-mic');
        let baseText = input.value ? input.value.trim() + ' ' : '';

        recognition.onstart = () => {
            recognitionActive = true;
            status.textContent = '🎙  Hört zu … erneut klicken zum Beenden.';
            micBtn.style.background = 'rgba(239,68,68,0.2)';
            micBtn.style.borderColor = 'rgba(239,68,68,0.6)';
            micBtn.style.color = '#fca5a5';
        };
        recognition.onerror = (e) => {
            status.textContent = 'Fehler: ' + (e.error || 'unbekannt');
            stopMic();
        };
        recognition.onend = () => {
            recognitionActive = false;
            micBtn.style.background = '';
            micBtn.style.borderColor = '';
            micBtn.style.color = '';
            if (status.textContent.startsWith('🎙')) status.textContent = '';
        };
        recognition.onresult = (event) => {
            let interim = '';
            let finalText = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const r = event.results[i];
                if (r.isFinal) finalText += r[0].transcript + ' ';
                else interim += r[0].transcript;
            }
            if (finalText) {
                baseText += finalText;
                input.value = baseText;
            } else {
                input.value = baseText + interim;
            }
        };
        try { recognition.start(); } catch (e) { status.textContent = 'Konnte Mikrofon nicht starten: ' + e.message; }
    }

    function stopMic() {
        if (recognition && recognitionActive) {
            try { recognition.stop(); } catch (e) { }
        }
        recognitionActive = false;
    }

    // ---------------------------------------------------------------
    // KI-Analyse
    // ---------------------------------------------------------------
    async function runAnalysis() {
        const input = document.getElementById('ab-ai-task-input').value.trim();
        if (!input) { window.showToast('Bitte einen Text eingeben oder diktieren.'); return; }

        const apiKey = localStorage.getItem('groq_api_key');
        if (!apiKey) { window.showToast('Kein Groq‑API‑Key hinterlegt (Einstellungen → KI).'); return; }

        const btn = document.getElementById('ab-ai-task-analyze');
        btn.disabled = true;
        const oldLabel = btn.textContent;
        btn.textContent = 'Analysiere …';

        const t = todayInfo();
        const systemPrompt = `Du bist ein Assistent, der aus einem kurzen deutschen Freitext einen strukturierten Vorgang mit Schritten und Fälligkeitsdaten extrahiert.
Heute ist ${t.iso} (${t.weekday}).

Regeln für Datumsangaben (immer als YYYY-MM-DD ausgeben oder null):
- "heute" -> heutiges Datum
- "morgen" -> heute + 1 Tag
- "übermorgen" -> heute + 2 Tage
- "diese Woche" / "bis Ende der Woche" / "bis Wochenende" -> kommender Freitag (falls heute schon Freitag oder später: dieser Freitag / heutiges Datum wenn heute Freitag ist)
- "nächste Woche" -> Montag der nächsten Woche
- "in X Tagen" -> heute + X Tage
- "am Freitag" / andere Wochentage -> nächster Wochentag ab heute
- konkrete Daten ("15.03." / "15. März") -> auf das nächste zukünftige Datum umrechnen

Antwortformat: NUR gültiges JSON, kein Fließtext davor/danach:
{
  "title": "Kurzer Titel des Vorgangs (max. 80 Zeichen)",
  "description": "Frei formulierte Zusammenfassung des Anliegens in 1-2 Sätzen",
  "due_date": "YYYY-MM-DD oder null (Fälligkeit des Gesamt-Vorgangs)",
  "subtasks": [
    { "title": "Kurzer, imperativer Schritt", "due_date": "YYYY-MM-DD oder null" }
  ]
}

Wichtig:
- Zerlege Aufzählungen ("... und dann ...", Kommas, Aufzählungen) in einzelne Schritte
- Wenn ein Datum sich nur auf einen Schritt bezieht, setze es NUR dort, nicht am Vorgang
- Wenn ein Datum sich auf den ganzen Vorgang bezieht, setze es unter "due_date" oben
- Wenn KEIN Datum genannt ist, IMMER null verwenden (nicht raten)
- Schritte im Imperativ ("Angebot rüberschicken", "Termin absprechen")
- Wenn nur ein einzelnes To-Do genannt ist, ist "subtasks" leer`;

        try {
            const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: groqModel(),
                    temperature: 0.1,
                    response_format: { type: 'json_object' },
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: input }
                    ]
                })
            });
            if (!resp.ok) {
                const errTxt = await resp.text();
                throw new Error('Groq HTTP ' + resp.status + ': ' + errTxt.slice(0, 200));
            }
            const data = await resp.json();
            const content = data?.choices?.[0]?.message?.content || '{}';
            let parsed;
            try { parsed = JSON.parse(content); } catch (e) {
                throw new Error('Antwort war kein gültiges JSON: ' + content.slice(0, 200));
            }
            renderPreview(parsed, input);
        } catch (err) {
            window.showToast('KI‑Analyse fehlgeschlagen: ' + (err.message || err));
        } finally {
            btn.disabled = false;
            btn.textContent = oldLabel;
        }
    }

    let lastResult = null;
    let lastInput = '';

    function renderPreview(res, rawInput) {
        lastResult = res || {};
        lastInput = rawInput || '';
        const preview = document.getElementById('ab-ai-task-preview');
        const actions = document.getElementById('ab-ai-task-actions');

        const title = res.title || '(kein Titel)';
        const desc = res.description || '';
        const dueGlobal = res.due_date || null;
        const subs = Array.isArray(res.subtasks) ? res.subtasks : [];

        preview.innerHTML = `
            <div style="font-size:0.72rem; font-weight:800; letter-spacing:0.06em; text-transform:uppercase; color:#c4b5fd; margin-bottom:8px;">
                Vorschau
            </div>
            <div style="margin-bottom:8px;">
                <div style="font-size:0.72rem; color:var(--color-secondary);">Titel</div>
                <input type="text" id="ab-ai-preview-title" value="${esc(title)}" style="width:100%; padding:8px 10px; border-radius:10px; border:1px solid var(--glass-border); background:rgba(255,255,255,0.05); color:var(--color-text); font-family:var(--font-sans); font-size:0.9rem; font-weight:700;">
            </div>
            <div style="margin-bottom:8px;">
                <div style="font-size:0.72rem; color:var(--color-secondary);">Beschreibung</div>
                <textarea id="ab-ai-preview-desc" rows="2" style="width:100%; padding:8px 10px; border-radius:10px; border:1px solid var(--glass-border); background:rgba(255,255,255,0.05); color:var(--color-text); font-family:var(--font-sans); font-size:0.85rem; resize:vertical;">${esc(desc)}</textarea>
            </div>
            <div style="margin-bottom:12px;">
                <div style="font-size:0.72rem; color:var(--color-secondary);">Erinnerung Gesamt‑Vorgang</div>
                <input type="date" id="ab-ai-preview-due" value="${esc(dueGlobal || '')}" style="padding:8px 10px; border-radius:10px; border:1px solid var(--glass-border); background:rgba(255,255,255,0.05); color:var(--color-text); font-family:var(--font-sans); font-size:0.85rem;">
                ${dueGlobal ? `<span style="margin-left:8px; font-size:0.78rem; color:#c4b5fd;">→ ${esc(fmtDeDate(dueGlobal))}</span>` : ''}
            </div>
            <div style="font-size:0.72rem; font-weight:800; letter-spacing:0.06em; text-transform:uppercase; color:#c4b5fd; margin-bottom:6px;">
                Schritte (${subs.length})
            </div>
            <div id="ab-ai-preview-subs" style="display:flex; flex-direction:column; gap:6px;">
                ${subs.map((s, i) => subRowHtml(i, s.title || '', s.due_date || '')).join('')}
                ${!subs.length ? '<div style="font-size:0.8rem; color:var(--color-secondary); padding:4px 0;">Keine Schritte erkannt.</div>' : ''}
            </div>
            <button type="button" id="ab-ai-preview-add-sub" class="ab-btn ab-btn-ghost" style="margin-top:8px;">+ Schritt hinzufügen</button>
        `;
        preview.style.display = 'block';
        actions.style.display = 'flex';

        document.getElementById('ab-ai-preview-add-sub').addEventListener('click', () => {
            const wrap = document.getElementById('ab-ai-preview-subs');
            // Wenn Placeholder ("Keine Schritte...") drin steht, entfernen
            if (wrap.children.length === 1 && wrap.children[0].tagName === 'DIV' && !wrap.children[0].dataset.sub) {
                wrap.innerHTML = '';
            }
            const idx = wrap.querySelectorAll('[data-sub]').length;
            wrap.insertAdjacentHTML('beforeend', subRowHtml(idx, '', ''));
        });

        preview.addEventListener('click', (e) => {
            const del = e.target.closest('[data-sub-del]');
            if (del) del.closest('[data-sub]').remove();
        });
    }

    function subRowHtml(idx, title, due) {
        return `
            <div data-sub="${idx}" style="display:flex; gap:6px; align-items:center;">
                <input type="text" class="ab-ai-sub-title" placeholder="Schritt" value="${esc(title)}" style="flex:1; padding:7px 9px; border-radius:9px; border:1px solid var(--glass-border); background:rgba(255,255,255,0.05); color:var(--color-text); font-family:var(--font-sans); font-size:0.82rem;">
                <input type="date" class="ab-ai-sub-due" value="${esc(due)}" style="padding:7px 9px; border-radius:9px; border:1px solid var(--glass-border); background:rgba(255,255,255,0.05); color:var(--color-text); font-family:var(--font-sans); font-size:0.82rem;">
                <button type="button" data-sub-del title="Schritt entfernen" style="width:30px; height:30px; border-radius:8px; border:1px solid var(--glass-border); background:rgba(239,68,68,0.1); color:#fca5a5; cursor:pointer;">×</button>
            </div>`;
    }

    // ---------------------------------------------------------------
    // Speichern
    // ---------------------------------------------------------------
    async function saveResult() {
        if (!currentCustomerId) { window.showToast('Keine Adresse ausgewählt.'); return; }
        const title = document.getElementById('ab-ai-preview-title').value.trim();
        if (!title) { window.showToast('Bitte einen Titel angeben.'); return; }
        const description = document.getElementById('ab-ai-preview-desc').value.trim();
        const dueDate = document.getElementById('ab-ai-preview-due').value || null;

        const subs = [...document.querySelectorAll('#ab-ai-preview-subs [data-sub]')].map(row => ({
            title: row.querySelector('.ab-ai-sub-title').value.trim(),
            due_date: row.querySelector('.ab-ai-sub-due').value || null
        })).filter(s => s.title);

        const saveBtn = document.getElementById('ab-ai-task-save');
        saveBtn.disabled = true;
        const oldLabel = saveBtn.textContent;
        saveBtn.textContent = 'Speichere …';

        try {
            // Vollständige Description mit Adress-/Kontakt-Kontext (wie bestehender Flow)
            const contextPrefix = [
                `[Adresse: ${currentCustomerId}] ${currentAddressLabel || ''}`,
                currentContactName ? `[Ansprechpartner: ${currentContactName}]` : ''
            ].filter(Boolean).join('\n');
            const fullDesc = [contextPrefix, description || lastInput].filter(Boolean).join('\n\n');

            // Vorgang im zentralen Vorgänge-Modul anlegen (internal_processes).
            // Die Schritte liegen dort als JSONB direkt am Vorgang, nicht in einer
            // eigenen Tabelle. So taucht der Vorgang sowohl im Adressbuch als auch
            // auf der Vorgänge-Seite (unter dem Firmennamen) auf.
            const creator = (window.activeUser && window.activeUser.name)
                || (window.currentUser && window.currentUser.name) || null;
            const nowIso = new Date().toISOString();

            const stepRows = subs.map((s, i) => ({
                id: 'st_' + Date.now().toString(36) + '_' + i,
                text: s.due_date ? `${s.title} (bis ${fmtDeDate(s.due_date)})` : s.title,
                done: false,
                created_at: nowIso,
                created_by: creator,
                done_at: null,
                done_by: null
            }));

            const basePayload = {
                title,
                process_type: 'note',
                process_date: nowIso,
                remark: fullDesc,
                status: 'offen',
                steps: stepRows,
                assigned_users: [],
                // internal_processes.user_id ist uuid, die App-Nutzer haben aber
                // bigint-IDs (public.users). Die bigint-ID gehört deshalb nach
                // created_by_user, sonst scheitert das Speichern mit
                // "invalid input syntax for type uuid".
                user_id: window.uuidUserId ? window.uuidUserId() : null,
                created_by_user: window.activeUser?.id || null
            };

            const payload = {
                ...basePayload,
                customer_id: currentCustomerId,
                contact_name: currentContactName || null,
                // Das erkannte Fälligkeitsdatum wird zur Erinnerung am Vorgang.
                remind_at: dueDate ? new Date(dueDate + 'T08:00:00').toISOString() : null
            };

            let { data, error } = await sb().from('internal_processes').insert([payload]).select();
            if (error && /customer_id|contact_name|remind_at|created_by_user/.test(error.message || '')) {
                // Migration supabase_add_process_customer.sql noch nicht gelaufen
                console.warn('Spalte fehlt, speichere Vorgang ohne Adressbezug:', error.message);
                const fallback = { ...basePayload };
                delete fallback.created_by_user;
                const r2 = await sb().from('internal_processes').insert([fallback]).select();
                if (r2.error) throw r2.error;
                data = r2.data;
                window.showToast('Der Vorgang wurde gespeichert, aber ohne Adressbezug.\n\nBitte die Datei supabase_add_process_customer.sql im Supabase SQL-Editor ausführen.');
            } else if (error) {
                throw error;
            }

            // Historie-Eintrag (customer_notes) — best effort
            try {
                const stepsText = subs.length
                    ? '\n\nSchritte:\n' + subs.map(s => `• ${s.title}${s.due_date ? ' (bis ' + fmtDeDate(s.due_date) + ')' : ''}`).join('\n')
                    : '';
                const dueText = dueDate ? ` (fällig ${fmtDeDate(dueDate)})` : '';
                const bodyText = (description || lastInput || '') + stepsText;
                const authorName = (window.activeUser && window.activeUser.name)
                    || (window.currentUser && window.currentUser.name) || null;
                const notePayload = {
                    customer_id: currentCustomerId,
                    entry_type: 'task',
                    title: `Vorgang: ${title}${dueText}`,
                    body: bodyText || null,
                    author: authorName,
                    entry_date: new Date().toISOString().slice(0, 10)
                };
                let noteRes = await sb().from('customer_notes').insert([notePayload]);
                if (noteRes.error) {
                    // Manche Setups erlauben nur note/call/email/visit/meeting/system
                    noteRes = await sb().from('customer_notes').insert([{ ...notePayload, entry_type: 'system' }]);
                    if (noteRes.error) console.warn('Historie-Eintrag konnte nicht gespeichert werden:', noteRes.error.message);
                }
            } catch (histErr) {
                console.warn('Historie-Eintrag fehlgeschlagen:', histErr);
            }

            closeModal();

            // Adress-Detail neu laden, damit der Vorgang direkt sichtbar ist
            if (typeof window.refreshAddressbookDetail === 'function') {
                window.refreshAddressbookDetail();
            }
            if (typeof window.fetchProcesses === 'function') {
                window.fetchProcesses();
            }
        } catch (err) {
            window.showToast('Speichern fehlgeschlagen: ' + (err.message || err));
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = oldLabel;
        }
    }
})();
