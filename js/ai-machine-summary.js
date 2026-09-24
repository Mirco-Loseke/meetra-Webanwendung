// ==========================================================
// KI-ZUSAMMENFASSUNG EINER MASCHINE
// ==========================================================
// Knopf „✨" auf der Maschinenkarte (js/machines-grouped.js) und im Kopf der
// Historie (index.html, #machine-history-modal). Lädt selbst, was zur Maschine
// gehört — Serviceberichte, Historie-Einträge, Wartungstermine, Vorgänge,
// Mietvereinbarungen — und lässt die KI daraus einen Überblick schreiben:
// Zustand, Wartung, wiederkehrende Probleme, was ansteht.
//
// Nur die Maschine, nicht die Adresse — dafür gibt es js/ai-address-summary.js.
// Läuft über window.groqFetch mit stream:true (Text erscheint beim Schreiben)
// und window.kiPseudonym (Namen, Firma, Orte, Nummern werden ersetzt).
// Nur lesend — die KI schreibt nichts in die Datenbank.
// ==========================================================
(function () {
    'use strict';

    const MAX_ZEICHEN = 40000;
    const MAX_EINTRAEGE = 100;

    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const toast = (m, t) => (typeof window.showToast === 'function' ? window.showToast(m, t) : console.log(m));
    const datum = v => { if (!v) return ''; const d = new Date(v); return isNaN(d) ? String(v) : d.toLocaleDateString('de-DE'); };
    const kurz = (s, n) => { s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

    const TYP = { phone: 'Telefon', note: 'Bemerkung', email: 'E-Mail', photo: 'Foto', hours: 'Betriebsstunden', whatsapp: 'WhatsApp', wartung: 'Wartung', auslieferung: 'Auslieferung', angebot: 'Angebot', miete: 'Miete' };

    function nutzerName(id) {
        const u = (window.userList || []).find(x => String(x.id) === String(id));
        return u ? u.name : '';
    }

    function label(m) {
        if (typeof window.machineLabel === 'function') { try { const l = window.machineLabel(m); if (l) return l; } catch (e) { /* egal */ } }
        return [m.manufacturer, m.name, m.serial ? 'SN ' + m.serial : '', m.year].filter(Boolean).join(' ');
    }

    // ---------- Daten laden ----------
    async function laden(machineId) {
        const sb = window.supabaseClient;
        const m = (typeof window.machineById === 'function' && window.machineById(machineId)) || (window.machineList || []).find(x => String(x.id) === String(machineId)) || null;
        const q = (t, sel) => sb.from(t).select(sel).eq('machine_id', machineId).then(r => r.data || []).catch(() => []);
        const [berichte, historie, wartungen, vorgaenge, mieten] = await Promise.all([
            q('service_entries', 'id, title, date, created_at, description, operating_hours, checklist_payload'),
            q('manual_history_entries', 'id, type, title, content, remark, created_at, end_date, created_by'),
            q('maintenance_events', 'id, title, event_date, start_date, maintenance_types, description'),
            q('internal_processes', 'id, title, status, process_type, process_date, created_at, remark, steps, assigned_users'),
            q('rental_agreements', 'id, title, data, created_at')
        ]);
        return { id: machineId, maschine: m, berichte, historie, wartungen, vorgaenge, mieten };
    }

    // ---------- Daten → kompakter Text für die KI ----------
    function datenText(D) {
        const m = D.maschine || {};
        const zeilen = [];
        zeilen.push('## MASCHINE');
        zeilen.push([label(m), m.category_id && window.categoryList ? (window.categoryList.find(c => String(c.id) === String(m.category_id)) || {}).name : '', m.year ? 'Baujahr ' + m.year : ''].filter(Boolean).join(' · '));
        if (m.company || m.location_company) zeilen.push('Betreiber: ' + (m.company || '') + (m.location_company && m.location_company !== m.company ? ' · Standort bei ' + m.location_company : ''));
        if (m.motor_type || m.power) zeilen.push('Motor: ' + [m.motor_type, m.power].filter(Boolean).join(' · '));
        if (m.last_maintenance) zeilen.push('Letzte Wartung: ' + datum(m.last_maintenance) + (m.last_maintenance_note ? ' (' + kurz(m.last_maintenance_note, 120) + ')' : ''));
        if (m.next_maintenance) zeilen.push('Nächste Wartung: ' + datum(m.next_maintenance));
        if (m.is_in_workshop || m.in_workshop) zeilen.push('Aktuell in der Werkstatt.');

        // Betriebsstunden-Verlauf: aus Berichten und Stunden-Einträgen
        const std = [];
        D.berichte.forEach(b => { const h = parseFloat(String(b.operating_hours || '').replace(',', '.')); if (h) std.push({ t: new Date(b.date || b.created_at).getTime(), h }); });
        D.historie.filter(h => h.type === 'hours' && h.content).forEach(h => { const v = parseFloat(String(h.content).replace(',', '.')); if (v) std.push({ t: new Date(h.created_at).getTime(), h: v }); });
        std.sort((a, b) => a.t - b.t);
        if (std.length) zeilen.push('Betriebsstunden: ' + std.slice(-8).map(s => datum(s.t) + ' ' + s.h + ' h').join(' → '));

        // Geplante Wartungstermine
        const heute = Date.now();
        const wart = D.wartungen.slice().sort((a, b) => new Date(a.event_date || a.start_date) - new Date(b.event_date || b.start_date));
        if (wart.length) {
            zeilen.push('\n## WARTUNGSTERMINE (' + wart.length + ')');
            wart.slice(-15).forEach(w => zeilen.push('- ' + (new Date(w.event_date || w.start_date) >= heute ? 'geplant ' : '') + datum(w.event_date || w.start_date) + ': ' + kurz(w.title || '', 100) + (w.maintenance_types ? ' [' + w.maintenance_types + ']' : '') + (w.description ? ' — ' + kurz(w.description, 150) : '')));
        }

        // Offene Vorgänge
        const offen = D.vorgaenge.filter(p => p.status !== 'erledigt').sort((a, b) => new Date(b.process_date || b.created_at) - new Date(a.process_date || a.created_at));
        if (offen.length) {
            zeilen.push('\n## OFFENE VORGÄNGE (' + offen.length + ')');
            offen.slice(0, 20).forEach(p => {
                const zust = Array.isArray(p.assigned_users) ? p.assigned_users.map(nutzerName).filter(Boolean).join(', ') : '';
                zeilen.push('- ' + datum(p.process_date || p.created_at) + ' ' + kurz(p.title || '(ohne Titel)', 120) + (zust ? ' · zuständig ' + zust : '') + (p.remark ? ' — ' + kurz(p.remark, 200) : ''));
                (Array.isArray(p.steps) ? p.steps : []).slice(0, 10).forEach(s => zeilen.push('  ' + (s.done ? '[x]' : '[ ]') + ' ' + kurz(s.text, 140)));
            });
        }

        // Mietvereinbarungen
        if (D.mieten.length) {
            zeilen.push('\n## MIETVEREINBARUNGEN (' + D.mieten.length + ')');
            D.mieten.slice(0, 15).forEach(r => {
                const d = r.data || {}; const mi = d.miete || {}; const mieter = d.mieter || {};
                zeilen.push('- ' + datum(r.created_at) + ' ' + kurz(r.title || '', 100) + (mieter.name ? ' · Mieter ' + kurz(mieter.name, 80) : '') + (mi.beginn || mi.ende ? ' · ' + datum(mi.beginn) + ' – ' + (mi.ende ? datum(mi.ende) : 'offen') : '') + (mi.beginn_bs || mi.ende_bs ? ' · Stunden ' + (mi.beginn_bs || '?') + ' → ' + (mi.ende_bs || '?') : '') + (mi.tagessatz ? ' · ' + mi.tagessatz + ' €/Tag' : ''));
            });
        }

        // Verlauf: Serviceberichte + Historie-Einträge + erledigte Vorgänge, neueste zuerst
        const verlauf = [];
        D.berichte.forEach(b => {
            const cp = b.checklist_payload;
            const plaene = cp && Array.isArray(cp.checklists) ? cp.checklists.map(c => c.title || c.name).filter(Boolean).join(', ') : (cp && cp.title ? cp.title : '');
            verlauf.push({ t: new Date(b.date || b.created_at).getTime() || 0, s: datum(b.date || b.created_at) + ' [Servicebericht] ' + kurz(b.title || '', 100) + (plaene ? ' (Prüfplan: ' + kurz(plaene, 80) + ')' : '') + (b.description ? ': ' + kurz(b.description, 300) : '') + (b.operating_hours ? ' (' + b.operating_hours + ' h)' : '') });
        });
        D.historie.forEach(h => {
            if (h.type === 'hours') return;
            const txt = [h.title, h.content, h.remark].filter(Boolean).join(' — ');
            verlauf.push({ t: new Date(h.created_at).getTime() || 0, s: datum(h.created_at) + ' [' + (TYP[h.type] || 'Eintrag') + '] ' + kurz(txt, 280) + (h.end_date ? ' (bis ' + datum(h.end_date) + ')' : '') + (h.created_by && nutzerName(h.created_by) ? ' · ' + nutzerName(h.created_by) : '') });
        });
        D.vorgaenge.filter(p => p.status === 'erledigt').forEach(p => verlauf.push({ t: new Date(p.process_date || p.created_at).getTime() || 0, s: datum(p.process_date || p.created_at) + ' [Vorgang erledigt] ' + kurz(p.title || '', 120) + (p.remark ? ' — ' + kurz(p.remark, 160) : '') }));
        verlauf.sort((a, b) => b.t - a.t);
        if (verlauf.length) {
            zeilen.push('\n## VERLAUF (neueste zuerst, ' + Math.min(verlauf.length, MAX_EINTRAEGE) + ' von ' + verlauf.length + ')');
            verlauf.slice(0, MAX_EINTRAEGE).forEach(v => zeilen.push('- ' + v.s));
        }

        let text = zeilen.join('\n');
        if (text.length > MAX_ZEICHEN) text = text.slice(0, MAX_ZEICHEN) + '\n… (älterer Verlauf gekürzt)';
        return text;
    }

    function systemPrompt() {
        const heute = new Date().toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
        return `Du bist Servicetechniker-Assistent in einer Firma für Recycling-Maschinen. Heute ist ${heute}.
Du bekommst die gesammelten Daten zu EINER Maschine und schreibst daraus einen Überblick für einen Techniker, der gleich zu dieser Maschine fährt oder sie übernimmt.

Antworte auf Deutsch, in Markdown, mit genau diesen Abschnitten:

## Auf einen Blick
3–4 Sätze: Was ist das für eine Maschine, wo steht sie, wie ist ihr Zustand, was ist gerade das Wichtigste.

## Wartung & Betriebsstunden
Letzte Wartung, nächste Wartung (überfällig? ⚠️), Stundenverlauf, welche Prüfpläne zuletzt gemacht wurden. Fehlt etwas, sag es.

## Wiederkehrende Probleme
Störungen, Reparaturen, Ersatzteile, die mehrfach vorkommen — mit Datum. Nichts erkennbar → „Keine wiederkehrenden Probleme erkennbar".

## Was ansteht
Offene Vorgänge, geplante Termine, laufende Miete, offene Schritte — je eine Zeile, konkret.

## Verlauf kurz
Chronologisch, max. 8 Punkte: Auslieferung, Wartungen, Reparaturen, Vermietungen, Werkstattaufenthalte.

Regeln: Nichts erfinden — nur was in den Daten steht. Zahlen, Daten und Bezeichnungen exakt übernehmen. Kurz und konkret, keine Floskeln.`;
    }

    // ---------- Markdown (klein) → HTML ----------
    function md(text) {
        const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`(.+?)`/g, '<code>$1</code>');
        const out = []; let liste = null;
        String(text || '').split(/\r?\n/).forEach(z => {
            const h = /^#{1,3}\s+(.*)$/.exec(z);
            const li = /^\s*[-*•]\s+(.*)$/.exec(z) || /^\s*\d+[.)]\s+(.*)$/.exec(z);
            if (li) { if (!liste) { liste = []; } liste.push('<li>' + inline(li[1]) + '</li>'); return; }
            if (liste) { out.push('<ul>' + liste.join('') + '</ul>'); liste = null; }
            if (h) out.push('<h4>' + inline(h[1]) + '</h4>');
            else if (z.trim()) out.push('<p>' + inline(z) + '</p>');
        });
        if (liste) out.push('<ul>' + liste.join('') + '</ul>');
        return out.join('');
    }

    // ---------- Fenster ----------
    function fenster() {
        let el = document.getElementById('ma-ai-summary-modal');
        if (el) return el;
        el = document.createElement('div');
        el.id = 'ma-ai-summary-modal';
        el.className = 'modal-backdrop';
        el.innerHTML = `
            <div class="modal-content ab-ai-summary" style="max-width:760px;">
                <button class="ab-icon-btn" data-mas-close style="position:absolute; top:14px; right:14px;" title="Schließen">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
                <h2 style="margin-top:0; display:flex; align-items:center; gap:10px;"><span style="font-size:1.4rem;">✨</span> Maschinen-Zusammenfassung</h2>
                <div id="ma-ai-summary-sub" class="text-muted-sm" style="margin-top:-8px; margin-bottom:12px;"></div>
                <div id="ma-ai-summary-body" class="ab-ai-summary-body"></div>
                <div style="display:flex; gap:10px; margin-top:14px; justify-content:flex-end; flex-wrap:wrap;">
                    <span id="ma-ai-summary-meta" class="text-muted-sm" style="margin-right:auto; align-self:center;"></span>
                    <button type="button" class="ab-btn ab-btn-ghost" id="ma-ai-summary-raus" title="Zeigt den Text genau so, wie er an die KI gesendet wurde — nach der Pseudonymisierung">Was geht raus?</button>
                    <button type="button" class="ab-btn ab-btn-ghost" id="ma-ai-summary-copy">Kopieren</button>
                    <button type="button" class="ab-btn ab-btn-ghost" id="ma-ai-summary-again">Neu erzeugen</button>
                    <button type="button" class="ab-btn ab-btn-primary" data-mas-close>Schließen</button>
                </div>
            </div>`;
        document.body.appendChild(el);
        el.addEventListener('click', e => { if (e.target === el || e.target.closest('[data-mas-close]')) schliessen(); });
        document.getElementById('ma-ai-summary-again').addEventListener('click', () => erzeugen(true));
        document.getElementById('ma-ai-summary-raus').addEventListener('click', () => {
            const body = document.getElementById('ma-ai-summary-body');
            const btn = document.getElementById('ma-ai-summary-raus');
            if (body.dataset.zeigtAnfrage === '1') { body.innerHTML = md(letzterText); body.dataset.zeigtAnfrage = ''; btn.textContent = 'Was geht raus?'; return; }
            body.innerHTML = '<p class="text-muted-sm">So kam der Text beim KI-Anbieter an — Namen, Orte und Nummern sind ersetzt, die Zuordnung liegt nur in diesem Browser:</p>' + (window.kiPseudonym && window.kiPseudonym.pruefHtml ? window.kiPseudonym.pruefHtml(letzteAnfrage || '(noch nichts gesendet)') : '<pre class="ab-ai-summary-roh">' + esc(letzteAnfrage || '(noch nichts gesendet)') + '</pre>');
            body.dataset.zeigtAnfrage = '1'; btn.textContent = 'Zusammenfassung zeigen';
        });
        document.getElementById('ma-ai-summary-copy').addEventListener('click', async () => {
            try { await navigator.clipboard.writeText(letzterText || ''); toast('Zusammenfassung kopiert.', 'success'); }
            catch (e) { toast('Kopieren nicht möglich — Text markieren und Strg+C.', 'error'); }
        });
        return el;
    }
    function schliessen() {
        const el = document.getElementById('ma-ai-summary-modal');
        if (el) el.classList.remove('show', 'active');
        if (!document.querySelector('.modal-backdrop.show, .modal-backdrop.active')) document.body.style.overflow = '';
    }

    let letzterText = '';
    let letzteAnfrage = '';
    let aktuelleId = null;
    const cache = new Map();   // machine-id → { text, zeit, schutz } — nur für diese Sitzung

    async function erzeugen(neu) {
        const body = document.getElementById('ma-ai-summary-body');
        const meta = document.getElementById('ma-ai-summary-meta');
        const raus = document.getElementById('ma-ai-summary-raus');
        const id = aktuelleId;

        const c = cache.get(String(id));
        if (c && !neu) { letzterText = c.text; letzteAnfrage = c.anfrage; body.innerHTML = md(c.text); body.dataset.zeigtAnfrage = ''; raus.textContent = 'Was geht raus?'; meta.textContent = 'Stand ' + c.zeit + (c.schutz ? ' · ' + c.schutz : ''); return; }

        body.innerHTML = '<div class="ab-ai-summary-laden"><span class="ab-ai-spinner"></span> Lade Maschinendaten …</div>';
        body.dataset.zeigtAnfrage = ''; raus.textContent = 'Was geht raus?';
        meta.textContent = '';
        const t0 = performance.now();
        try {
            const D = await laden(id);
            if (String(aktuelleId) !== String(id)) return;
            const m = D.maschine || {};
            document.getElementById('ma-ai-summary-sub').textContent = label(m) + (m.company ? ' · ' + m.company : '');
            const n = D.berichte.length + D.historie.length + D.wartungen.length + D.vorgaenge.length + D.mieten.length;
            body.innerHTML = '<div class="ab-ai-summary-laden"><span class="ab-ai-spinner"></span> Die KI liest ' + n + ' Einträge …</div>';

            const p = window.kiPseudonym ? window.kiPseudonym.erzeugen({
                kontakte: (Array.isArray(m.contact_persons) ? m.contact_persons : []).concat(D.vorgaenge.map(x => x.contact_name).filter(Boolean)),
                firmen: [m.company, m.location_company].concat(D.mieten.map(r => r.data && r.data.mieter && r.data.mieter.name)).filter(Boolean),
                orte: [{ city: m.operator_city, zip: m.operator_zip }, { city: m.location_city, zip: m.location_zip }, { city: m.location }],
                nummern: [{ wert: m.serial, art: 'Seriennr' }, { wert: m.motor_serial, art: 'Seriennr' }, { wert: m.customer_number, art: 'Kundennr' }]
            }) : null;
            const roh = datenText(D);
            const anfrage = p ? p.maskieren(roh) : roh;
            letzteAnfrage = anfrage;
            const resp = await window.groqFetch({
                messages: [{ role: 'system', content: systemPrompt() + (p ? '\n\n' + window.kiPseudonym.PROMPT_HINWEIS : '') }, { role: 'user', content: anfrage }],
                temperature: 0.2,
                max_tokens: 1500,
                stream: true
            });
            const erg = await window.kiAntwortLesen(resp, teil => { if (String(aktuelleId) === String(id)) body.innerHTML = md(p ? p.demaskieren(teil) : teil); });
            if (String(aktuelleId) !== String(id)) return;
            let text = erg.text;
            if (p) text = p.demaskieren(text);
            letzterText = text;
            const zeit = new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
            const schutz = p ? '🔒 ' + p.anzahl + ' Angaben vor dem Senden ersetzt' : '';
            cache.set(String(id), { text, zeit, schutz, anfrage });
            body.innerHTML = md(text);
            const tok = erg.usage && erg.usage.total_tokens;
            meta.textContent = 'Stand ' + zeit + ' · ' + ((performance.now() - t0) / 1000).toFixed(1) + ' s' + (tok ? ' · ' + tok.toLocaleString('de-DE') + ' Token' : '') + (resp.headers.get('x-ki-modell') ? ' · ' + resp.headers.get('x-ki-modell') : '') + (schutz ? ' · ' + schutz : '');
        } catch (e) {
            body.innerHTML = '<p style="color:#fca5a5;">Zusammenfassung fehlgeschlagen: ' + esc(e.message) + '</p>';
        }
    }

    window.openMachineSummary = function (machineId) {
        if (!machineId) return;
        aktuelleId = machineId;
        const el = fenster();
        const m = (typeof window.machineById === 'function' && window.machineById(machineId)) || null;
        document.getElementById('ma-ai-summary-sub').textContent = m ? label(m) + (m.company ? ' · ' + m.company : '') : '';
        el.classList.add('show', 'active');
        document.body.style.overflow = 'hidden';
        erzeugen(false);
    };

    // Neuer Servicebericht / Historie-Eintrag ⇒ Zusammenfassung veraltet.
    ['history:changed', 'servicebericht:saved', 'machines:changed'].forEach(ev => document.addEventListener(ev, e => { const id = e.detail && (e.detail.machineId || e.detail.machine_id); if (id) cache.delete(String(id)); else cache.clear(); }));
})();
