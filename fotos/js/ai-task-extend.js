// =========================================================
// AUFGABE MIT KI ERWEITERN (✨-Knopf auf der Aufgabenkarte)
// Freitext/Diktat → die KI schlägt neue Unteraufgaben vor und sortiert sie
// in die vorhandenen Übergruppen (window.taskSupergroupNames). Vorschau mit
// Haken + Übergruppe je Zeile, gespeichert wird erst nach Klick
// (window.insertSubtasks aus js/tasks.js).
// Datenschutz: läuft über kiPseudonym.fetchMaskiert (siehe CLAUDE.md).
// =========================================================
(function () {
    'use strict';

    const MODAL_ID = 'ai-task-extend-modal';
    const FALLBACK_MODEL = 'llama-3.3-70b-versatile';
    let aktuelleAufgabe = null;
    let vorschlaege = [];

    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    function gruppen() {
        const n = (window.taskSupergroupNames && window.taskSupergroupNames.length)
            ? window.taskSupergroupNames.slice()
            : ['Schweißen', 'Wartung', 'Hydraulik', 'Elektrik', 'Mechanik', 'Motor', 'Allgemein'];
        if (!n.includes('Allgemein')) n.push('Allgemein');
        return n;
    }

    // Maschinenart (z. B. „Kompostumsetzer") aus dem Maschinen-Index.
    function kategorie(t) {
        const m = t && t.machine_id && typeof window.machineById === 'function' ? window.machineById(t.machine_id) : null;
        return m && m.category ? String(m.category) : '';
    }

    // „Lernen" ohne eigene Tabelle: Unteraufgaben früherer Aufgaben an
    // Maschinen derselben Art (sonst desselben Modells) zählen und die
    // häufigsten mitgeben. Wächst mit jeder angelegten Aufgabe mit; nutzt nur
    // die schon geladenen Aufgaben (kein Serverruf).
    function werkstattErfahrung(t, kat) {
        const alle = (typeof window.getAllTasks === 'function' ? window.getAllTasks() : []) || [];
        const modell = t.machines ? String(t.machines.name || '').toLowerCase() : '';
        const passt = x => {
            if (String(x.id) === String(t.id) || !x.machine_id) return false;
            if (kat) return kategorie(x) === kat;
            return modell && x.machines && String(x.machines.name || '').toLowerCase() === modell;
        };
        const zaehler = new Map();
        alle.filter(passt).forEach(x => (x.subtasks || []).forEach(s => {
            const titel = String(s.title || '').trim();
            if (!titel) return;
            const k = titel.toLowerCase();
            const e = zaehler.get(k) || { titel, n: 0 };
            e.n++;
            zaehler.set(k, e);
        }));
        return [...zaehler.values()].sort((a, b) => b.n - a.n).slice(0, 30)
            .map(e => `- ${e.titel} (${e.n})`).join('\n');
    }

    function gruppenOptionen(sel) {
        const n = gruppen();
        if (sel && !n.includes(sel)) n.push(sel);
        return n.map(g => `<option value="${esc(g)}"${g === sel ? ' selected' : ''}>${esc(g)}</option>`).join('');
    }

    function ensureModal() {
        if (document.getElementById(MODAL_ID)) return;
        const el = document.createElement('div');
        el.id = MODAL_ID;
        el.className = 'modal-backdrop';
        el.innerHTML = `
            <div class="modal-content" style="max-width:640px; max-height:90vh; overflow-y:auto;">
                <button class="ab-icon-btn" data-ate-close style="position:absolute; top:14px; right:14px;" title="Schließen">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
                <h2 style="margin-top:0; display:flex; align-items:center; gap:10px;">
                    <span style="font-size:1.4rem;">✨</span> Aufgabe mit KI erweitern
                </h2>
                <div id="ate-subtitle" style="color:var(--color-secondary); margin-top:-8px; margin-bottom:12px; font-size:0.85rem;"></div>
                <p style="color:rgba(255,255,255,0.55); font-size:0.85rem; margin:0 0 0.75rem 0; line-height:1.5;">
                    Beschreibe oder diktiere, was noch zu tun ist. Die KI macht daraus Unteraufgaben und ordnet sie den passenden Übergruppen zu — du prüfst alles, bevor gespeichert wird.
                </p>
                <textarea id="ate-input" rows="6" placeholder="z. B. Hydraulikschlauch am Kipper tauschen, Ölstand prüfen, Kabelbaum am Bedienpult neu verlegen, danach Probelauf …"
                          style="width:100%; padding:12px; border-radius:12px; border:1px solid var(--glass-border); background:rgba(255,255,255,0.05); color:var(--color-text); font-family:var(--font-sans); font-size:0.9rem; resize:vertical; box-sizing:border-box;"></textarea>
                <div style="display:flex; flex-wrap:wrap; gap:10px; margin-top:12px;">
                    <button type="button" class="ab-btn ab-btn-ghost" data-ate-close style="flex:0 0 auto;">Abbrechen</button>
                    ${window.micButtonHtml ? window.micButtonHtml('ate-input') : ''}
                    <button type="button" id="ate-analyze" class="ab-btn ab-btn-primary" style="flex:1 1 200px;"><span>✨</span> Unteraufgaben vorschlagen</button>
                </div>
                ${window.micStatusHtml ? window.micStatusHtml('ate-input') : ''}
                <div id="ate-preview" style="display:none; margin-top:16px; padding:14px; border-radius:14px; border:1px solid rgba(167,139,250,0.35); background:rgba(167,139,250,0.06);"></div>
                <div id="ate-actions" style="display:none; gap:8px; margin-top:14px; justify-content:flex-end;">
                    <button type="button" class="ab-btn ab-btn-ghost" data-ate-close>Abbrechen</button>
                    <button type="button" id="ate-save" class="ab-btn ab-btn-primary">Unteraufgaben hinzufügen</button>
                </div>
            </div>`;
        document.body.appendChild(el);
        el.addEventListener('click', e => {
            if (e.target === el || e.target.closest('[data-ate-close]')) schliessen();
        });
        document.getElementById('ate-analyze').addEventListener('click', analysieren);
        document.getElementById('ate-save').addEventListener('click', speichern);
    }

    function schliessen() {
        if (window.stopSpeechInput) window.stopSpeechInput();
        const el = document.getElementById(MODAL_ID);
        if (el) el.classList.remove('show', 'active');
        document.body.style.overflow = '';
    }

    window.openAiTaskExtend = function (taskId) {
        const alle = (typeof window.getAllTasks === 'function' ? window.getAllTasks() : []) || [];
        aktuelleAufgabe = alle.find(t => String(t.id) === String(taskId)) || null;
        if (!aktuelleAufgabe) { window.showToast && window.showToast('Aufgabe nicht gefunden.'); return; }
        ensureModal();
        vorschlaege = [];
        document.getElementById('ate-input').value = '';
        document.getElementById('ate-preview').style.display = 'none';
        document.getElementById('ate-preview').innerHTML = '';
        document.getElementById('ate-actions').style.display = 'none';
        const m = aktuelleAufgabe.machines;
        const maschine = m ? [m.manufacturer, m.name].filter(Boolean).join(' ') : '';
        document.getElementById('ate-subtitle').textContent =
            [aktuelleAufgabe.title, maschine].filter(Boolean).join(' · ');
        const el = document.getElementById(MODAL_ID);
        el.classList.add('show', 'active');
        document.body.style.overflow = 'hidden';
        setTimeout(() => document.getElementById('ate-input').focus(), 50);
    };

    async function analysieren() {
        const input = document.getElementById('ate-input').value.trim();
        if (!input) { window.showToast && window.showToast('Bitte erst beschreiben, was zu tun ist.'); return; }
        if (window.stopSpeechInput) window.stopSpeechInput();
        const btn = document.getElementById('ate-analyze');
        const alt = btn.innerHTML;
        btn.disabled = true; btn.textContent = 'KI denkt nach …';

        const t = aktuelleAufgabe;
        const m = t.machines;
        const kat = kategorie(t);
        const vorhanden = (t.subtasks || []).map(s => `- [${s.supergroup || 'Allgemein'}] ${s.title}`).join('\n') || '(keine)';
        const ueblich = werkstattErfahrung(t, kat);
        const systemPrompt = `Du bist erfahrener Werkstattmeister für Recycling- und Kompostiermaschinen (Kompostumsetzer, Siebanlagen, Zerkleinerer, Schaufeln, Anbaugeräte). Du ergänzt eine Werkstatt-Aufgabe um Unteraufgaben. Antworte NUR mit JSON:
{ "subtasks": [ { "title": "Arbeitsschritt", "supergroup": "Übergruppe" } ],
  "ideen":    [ { "title": "Arbeitsschritt", "supergroup": "Übergruppe", "grund": "kurz, warum" } ] }
Regeln:
- "subtasks": NUR Tätigkeiten, die wörtlich unter "Neu zu ergänzen" stehen — je eine kurze Unteraufgabe im Imperativ ("Hydraulikschlauch tauschen"). Nichts aus Aufgabentitel, vorhandenen Unteraufgaben oder Werkstatt-Erfahrung; alles Weitere gehört in "ideen".
- "ideen": genau 6 zusätzliche Arbeitsschritte, an die der Mechaniker denken sollte, obwohl er sie nicht genannt hat — Vorarbeiten (z. B. reinigen, abkleben, demontieren), Folgearbeiten (z. B. Schmieren, Spannung einstellen, Schrauben nachziehen), Prüfungen und Abschluss (z. B. Probelauf, Maschine im Einsatz testen, Sichtprüfung, Fotos/Doku). Passend zur Maschinenart. Nutze die Werkstatt-Erfahrung unten, wenn vorhanden. "grund" höchstens 8 Wörter.
- "supergroup": wähle die thematisch passendste aus dieser Liste, sonst "Allgemein": ${gruppen().join(', ')}
- Nichts doppelt anlegen, was schon als Unteraufgabe existiert, und Ideen nicht doppelt zu "subtasks".`;
        const kontext = `Aufgabe: ${t.title || ''}${m ? '\nMaschine: ' + [m.manufacturer, m.name].filter(Boolean).join(' ') : ''}${kat ? '\nMaschinenart: ' + kat : ''}
Vorhandene Unteraufgaben:
${vorhanden}
${ueblich ? `\nWerkstatt-Erfahrung — früher bei ${kat || 'ähnlichen Maschinen'} angelegt (Anzahl):\n${ueblich}\n` : ''}
Neu zu ergänzen:
${input}`;

        try {
            const holen = window.kiPseudonym ? window.kiPseudonym.fetchMaskiert : window.groqFetch;
            const resp = await holen({
                model: localStorage.getItem('groq_model') || FALLBACK_MODEL,
                temperature: 0.4,
                max_tokens: 2048,
                response_format: { type: 'json_object' },
                messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: kontext }]
            });
            if (!resp.ok) throw new Error('KI HTTP ' + resp.status + ': ' + (await resp.text()).slice(0, 200));
            const data = await resp.json();
            let text = data?.choices?.[0]?.message?.content || '{}';
            const a = text.indexOf('{'), b = text.lastIndexOf('}');
            if (a >= 0 && b > a) text = text.slice(a, b + 1);
            const res = JSON.parse(text);
            const schonDa = new Set((t.subtasks || []).map(s => String(s.title || '').trim().toLowerCase()));
            const lesen = (arr, idee) => (Array.isArray(arr) ? arr : [])
                .map(s => typeof s === 'string' ? { title: s, supergroup: 'Allgemein' } : { title: String(s.title || '').trim(), supergroup: s.supergroup || 'Allgemein', grund: String(s.grund || '').trim() })
                .map(s => Object.assign(s, { idee }))
                .filter(s => {
                    const k = s.title.toLowerCase();
                    if (!s.title || schonDa.has(k)) return false;
                    schonDa.add(k);
                    return true;
                });
            vorschlaege = lesen(res.subtasks, false).concat(lesen(res.ideen, true));
            zeigen();
        } catch (err) {
            window.showToast && window.showToast('KI-Analyse fehlgeschlagen: ' + (err.message || err));
        } finally {
            btn.disabled = false; btn.innerHTML = alt;
        }
    }

    function zeigen() {
        const box = document.getElementById('ate-preview');
        const actions = document.getElementById('ate-actions');
        if (!vorschlaege.length) {
            box.innerHTML = '<div style="color:rgba(255,255,255,0.6); font-size:0.88rem;">Die KI hat keine neuen Unteraufgaben gefunden.</div>';
            box.style.display = 'block'; actions.style.display = 'none';
            return;
        }
        // Genanntes ist vorausgewählt; Ideen der KI muss man bewusst anhaken.
        const zeile = (s, i) => `
                <div class="ate-row" data-i="${i}" style="display:flex; flex-wrap:wrap; gap:8px; align-items:center;">
                    <input type="checkbox" class="ate-on" ${s.idee ? '' : 'checked'} style="width:18px; height:18px; flex-shrink:0; accent-color:#a78bfa;">
                    <div style="flex:1 1 180px; min-width:0;">
                        <input type="text" class="ate-title glass-form-input" value="${esc(s.title)}" style="width:100%; box-sizing:border-box;">
                        ${s.idee && s.grund ? `<div style="font-size:0.74rem; color:rgba(255,255,255,0.5); margin:3px 0 0 4px;">💡 ${esc(s.grund)}</div>` : ''}
                    </div>
                    <select class="ate-group glass-form-input" style="flex:0 1 32%; min-width:130px; margin-left:auto; box-sizing:border-box; font-size:0.82rem;">${gruppenOptionen(s.supergroup)}</select>
                </div>`;
        const kopf = txt => `<div style="font-size:0.72rem; font-weight:800; text-transform:uppercase; letter-spacing:0.5px; color:#a78bfa; margin:4px 0 8px;">${txt}</div>`;
        const genannt = vorschlaege.map((s, i) => [s, i]).filter(([s]) => !s.idee);
        const ideen = vorschlaege.map((s, i) => [s, i]).filter(([s]) => s.idee);
        box.innerHTML = `
            ${genannt.length ? kopf(`${genannt.length} aus deinem Text`) + `<div style="display:flex; flex-direction:column; gap:6px;">${genannt.map(([s, i]) => zeile(s, i)).join('')}</div>` : ''}
            ${ideen.length ? `<div style="margin-top:${genannt.length ? 14 : 0}px;">${kopf(`💡 ${ideen.length} Vorschläge der KI — zum Übernehmen anhaken`)}</div><div style="display:flex; flex-direction:column; gap:6px;">${ideen.map(([s, i]) => zeile(s, i)).join('')}</div>` : ''}`;
        box.style.display = 'block';
        actions.style.display = 'flex';
    }

    async function speichern() {
        const t = aktuelleAufgabe;
        const zeilen = [...document.querySelectorAll('#ate-preview .ate-row')]
            .filter(r => r.querySelector('.ate-on').checked)
            .map(r => ({ title: r.querySelector('.ate-title').value.trim(), supergroup: r.querySelector('.ate-group').value || 'Allgemein' }))
            .filter(r => r.title);
        if (!zeilen.length) { window.showToast && window.showToast('Keine Unteraufgabe ausgewählt.'); return; }
        const btn = document.getElementById('ate-save');
        btn.disabled = true;
        try {
            let naechste = (t.subtasks || []).reduce((mx, s) => Math.max(mx, Number(s.sort_order) || 0), 0);
            const rows = zeilen.map(z => ({ task_id: t.id, title: z.title, status: 'open', supergroup: z.supergroup, sort_order: ++naechste }));
            const res = window.insertSubtasks
                ? await window.insertSubtasks(rows)
                : await window.supabaseClient.from('subtasks').insert(rows);
            if (res.error) throw res.error;
            window.showToast && window.showToast(`${rows.length} Unteraufgaben hinzugefügt.`);
            schliessen();
            if (typeof window.fetchTasks === 'function') window.fetchTasks();
        } catch (err) {
            window.showToast && window.showToast('Speichern fehlgeschlagen: ' + (err.message || err));
        } finally {
            btn.disabled = false;
        }
    }
})();
