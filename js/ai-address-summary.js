// ==========================================================
// KI-ZUSAMMENFASSUNG EINER ADRESSE
// ==========================================================
// Knopf „✨ Zusammenfassung" im Adress-Detail (js/addressbook.js, Kopfzeile).
// Sammelt alles, was das Detail schon geladen hat (window.abDetailDaten):
// Stammdaten, Ansprechpartner, Maschinen, Notizen/Verlauf, Maschinen-
// Historie, Vorgänge mit Schritten und Angeboten, Termine — und lässt die
// KI daraus einen Überblick schreiben: Vergangenheit, offene Vorgänge,
// nächste Schritte, Auffälligkeiten.
//
// Läuft über window.groqFetch (js/groq-proxy.js → Edge Function ki-proxy).
// Datenmenge wird gedeckelt (MAX_ZEICHEN), ältere Einträge fallen zuerst weg.
// Nur lesend — die KI schreibt nichts in die Datenbank.
// ==========================================================
(function () {
    'use strict';

    // Weniger Eingabe = schnellere Antwort. Erledigte Vorgänge gehen nur als Kopfzeile raus.
    const MAX_ZEICHEN = 24000;      // ~6k Token Eingabe
    const MAX_EINTRAEGE = 50;       // Historie/Notizen: die neuesten zuerst

    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const toast = (m, t) => (typeof window.showToast === 'function' ? window.showToast(m, t) : console.log(m));
    const datum = v => { if (!v) return ''; const d = new Date(v); return isNaN(d) ? String(v) : d.toLocaleDateString('de-DE'); };
    const kurz = (s, n) => { s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

    // Aus einem Datensatz die ersten brauchbaren Textfelder ziehen — die
    // Tabellen haben unterschiedliche Spaltennamen (description/body/text/…).
    function textVon(o, felder) {
        for (const f of felder) { if (o && o[f] && String(o[f]).trim()) return String(o[f]).trim(); }
        return '';
    }

    // internal_processes.process_type → Klartext
    const ART = { email_incoming: 'Mail eingegangen', email_outgoing: 'Mail gesendet', call_incoming: 'Anruf eingegangen', call_outgoing: 'Anruf getätigt', angebot: 'Angebot', auftrag: 'Auftrag', reklamation: 'Reklamation', intern: 'intern' };

    // assigned_users = Liste von users.id → Namen über window.userList
    function nutzerNamen(ids) {
        if (!Array.isArray(ids) || !ids.length) return '';
        const liste = window.userList || [];
        return ids.map(id => { const u = liste.find(x => String(x.id) === String(id)); return u ? u.name : null; }).filter(Boolean).join(', ');
    }

    function maschinenLabel(m) {
        if (!m) return '';
        if (typeof window.machineLabel === 'function') { try { const l = window.machineLabel(m); if (l) return l; } catch (e) { /* egal */ } }
        return [m.manufacturer, m.category || m.type, m.name || m.title, m.serial || m.serial_number ? 'SN ' + (m.serial || m.serial_number) : '', m.year].filter(Boolean).join(' ');
    }

    // ---------- Daten → kompakter Text für die KI ----------
    function datenText(D) {
        const a = D.adresse || {};
        const heute = new Date();
        const mById = new Map((D.maschinen || []).map(m => [String(m.id), m]));
        const zeilen = [];

        zeilen.push('## ADRESSE');
        // Ohne Straße, Telefon, E-Mail — für die Auswertung unnötig, und so gehen sie gar nicht erst raus.
        zeilen.push([a.name, [a.zip_code, a.city].filter(Boolean).join(' '), a.customer_number ? 'Kundennr. ' + a.customer_number : ''].filter(Boolean).join(' · '));
        if (a.notes) zeilen.push('Notiz: ' + kurz(a.notes, 400));
        if (D.verknuepfte.length) zeilen.push('Verknüpfte Adressen: ' + D.verknuepfte.map(v => v.name).join(', '));

        if (D.ansprechpartner.length) {
            zeilen.push('\n## ANSPRECHPARTNER');
            D.ansprechpartner.forEach(c => zeilen.push('- ' + [c.name, c.position, c.department, c.is_primary ? '(Hauptkontakt)' : ''].filter(Boolean).join(' · ') + (c.notes ? ' — ' + kurz(c.notes, 150) : '')));
        }

        if (D.maschinen.length) {
            zeilen.push('\n## MASCHINEN (' + D.maschinen.length + ')');
            D.maschinen.slice(0, 40).forEach(m => zeilen.push('- ' + maschinenLabel(m) + (m.location ? ' · Standort ' + m.location : '') + (m.next_maintenance ? ' · nächste Wartung ' + datum(m.next_maintenance) : '') + (m.operating_hours ? ' · ' + m.operating_hours + ' h' : '')));
        }

        // Vorgänge: offen zuerst, mit Schritten (offen/erledigt, wer)
        const vorg = (D.vorgaenge || []).slice().sort((x, y) => (x.status === 'erledigt') - (y.status === 'erledigt') || new Date(y.process_date || y.created_at || 0) - new Date(x.process_date || x.created_at || 0));
        if (vorg.length) {
            zeilen.push('\n## VORGÄNGE (' + vorg.length + ', davon offen: ' + vorg.filter(p => p.status !== 'erledigt').length + ')');
            const offen = vorg.filter(p => p.status !== 'erledigt');
            const erledigt = vorg.filter(p => p.status === 'erledigt').slice(0, 20);
            offen.slice(0, 30).concat(erledigt).forEach(p => {
                const ang = D.angeboteByProcess[String(p.id)];
                const m = p.machine_id ? mById.get(String(p.machine_id)) : null;
                const status = p.status === 'erledigt' ? 'ERLEDIGT' : (p.status === 'in_bearbeitung' || p.status === 'wartet') ? 'IN BEARBEITUNG' : 'OFFEN';
                const zust = nutzerNamen(p.assigned_users) || p.assigned_to || p.responsible || '';
                const kopf = ['[' + status + ']', datum(p.process_date || p.created_at), ART[p.process_type] ? '(' + ART[p.process_type] + ')' : '', ang ? 'Angebot ' + (ang.belegnummer || '') + (ang.nettobetrag ? ' ' + Number(ang.nettobetrag).toLocaleString('de-DE') + ' € netto' : '') + (ang.status ? ' (' + ang.status + ')' : '') : '', p.title || p.subject || p.name || '(ohne Titel)', m ? '· ' + maschinenLabel(m) : '', zust ? '· zuständig ' + zust : '', p.remind_at ? '· Wiedervorlage ' + datum(p.remind_at) : '', p.due_date || p.deadline ? '· fällig ' + datum(p.due_date || p.deadline) : ''].filter(Boolean).join(' ');
                zeilen.push('- ' + kopf);
                if (p.status === 'erledigt') return;   // Erledigtes: Kopfzeile reicht
                const txt = textVon(p, ['remark', 'description', 'notes', 'text']);
                if (txt) zeilen.push('  ' + kurz(txt, 300));
                const schritte = Array.isArray(p.steps) ? p.steps : [];
                if (schritte.length) {
                    schritte.slice(0, 15).forEach(s => zeilen.push('  ' + (s.done ? '[x]' : '[ ]') + ' ' + kurz(s.text, 160) + (s.done && s.done_by ? ' (erledigt ' + datum(s.done_at) + ' von ' + s.done_by + ')' : '') + (!s.done && s.assigned_to ? ' (' + s.assigned_to + ')' : '') + (!s.done && s.remind_at ? ' bis ' + datum(s.remind_at) : '')));
                }
                const sus = Array.isArray(p.status_updates) ? p.status_updates.slice(0, 3) : [];
                sus.forEach((su, i) => { if (su.text || su.note) zeilen.push('  ' + (i === 0 ? 'Letzter Stand ' : 'Stand ') + datum(su.at) + (su.by ? ' (' + su.by + ')' : '') + ': ' + kurz(su.text || su.note, 200)); });
            });
        }

        // Termine: anstehend + letzte vergangene
        const term = (D.termine || []).slice().sort((x, y) => new Date(x.date || x.start || x.event_date || 0) - new Date(y.date || y.start || y.event_date || 0));
        const kommend = term.filter(t => new Date(t.date || t.start || t.event_date) >= heute).slice(0, 10);
        const vergangen = term.filter(t => new Date(t.date || t.start || t.event_date) < heute).slice(-5);
        if (kommend.length || vergangen.length) {
            zeilen.push('\n## TERMINE');
            kommend.forEach(t => zeilen.push('- anstehend ' + datum(t.date || t.start || t.event_date) + ': ' + kurz(t.title || t.name || t.description || '', 120)));
            vergangen.forEach(t => zeilen.push('- vergangen ' + datum(t.date || t.start || t.event_date) + ': ' + kurz(t.title || t.name || t.description || '', 120)));
        }

        // Verlauf: Adress-Notizen + Maschinenhistorie, neueste zuerst, gedeckelt
        const verlauf = [];
        (D.notizen || []).forEach(n => verlauf.push({ t: new Date(n.entry_date || n.created_at).getTime() || 0, s: datum(n.entry_date || n.created_at) + ' ' + (n.entry_type && n.entry_type !== 'note' ? '[' + n.entry_type + '] ' : '') + kurz(textVon(n, ['body', 'text', 'content', 'title', 'description']), 260) }));
        (D.maschinenHistorie || []).forEach(h => {
            const m = h.machine_id ? mById.get(String(h.machine_id)) : null;
            const art = h.type || h.entry_type || (h.date ? 'Servicebericht' : 'Eintrag');
            const txt = textVon(h, ['description', 'work_description', 'problem', 'problem_description', 'text', 'notes', 'title', 'remarks']);
            verlauf.push({ t: new Date(h.created_at || h.entry_date || h.date).getTime() || 0, s: datum(h.created_at || h.entry_date || h.date) + ' [' + art + '] ' + (m ? maschinenLabel(m) + ': ' : '') + kurz(txt, 260) + (h.hours ? ' (' + h.hours + ' h)' : '') });
        });
        verlauf.sort((x, y) => y.t - x.t);
        if (verlauf.length) {
            zeilen.push('\n## VERLAUF (neueste zuerst, ' + Math.min(verlauf.length, MAX_EINTRAEGE) + ' von ' + verlauf.length + ')');
            verlauf.slice(0, MAX_EINTRAEGE).forEach(v => zeilen.push('- ' + v.s));
        }

        let text = zeilen.join('\n');
        if (text.length > MAX_ZEICHEN) text = text.slice(0, MAX_ZEICHEN) + '\n… (älterer Verlauf gekürzt)';
        // Umsatz steht am Ende, aber vor dem Kürzen geschützt (klein, fertig gerechnet).
        if (D.umsatzText) text += '\n\n' + D.umsatzText;
        return text;
    }

    // ---------- Umsatz aus den Sage-Rechnungen (Tabelle rechnungen) ----------
    // Nur für Nutzer mit permissions.belege. Die Summen rechnet der Browser —
    // an die KI gehen nur Jahreswerte und Entwicklung, keine einzelnen Belege.
    function darfBelege() {
        let p = window.activeUser && window.activeUser.permissions;
        if (typeof p === 'string') { try { p = JSON.parse(p); } catch (e) { p = null; } }
        return !!(p && p.belege === true);
    }

    async function umsatzText(customerId) {
        if (!darfBelege() || !customerId) return '';
        try {
            const { data, error } = await window.supabaseClient.from('rechnungen')
                .select('belegjahr, belegdatum, netto').eq('customer_id', customerId);
            if (error || !data || !data.length) return '';
            const euro = v => Math.round(v).toLocaleString('de-DE') + ' €';
            const heute = new Date(); const jahr = heute.getFullYear();
            const stichtag = (heute.getMonth() + 1) * 100 + heute.getDate();   // MMTT
            const jeJahr = {}, anzahl = {};
            let ytd = 0, vjZeitraum = 0;
            data.forEach(r => {
                const j = r.belegjahr || Number(String(r.belegdatum || '').slice(0, 4));
                if (!j) return;
                const n = Number(r.netto) || 0;
                jeJahr[j] = (jeJahr[j] || 0) + n; anzahl[j] = (anzahl[j] || 0) + 1;
                const mt = r.belegdatum ? Number(String(r.belegdatum).slice(5, 7) + String(r.belegdatum).slice(8, 10)) : 0;
                if (j === jahr) ytd += n;
                if (j === jahr - 1 && mt && mt <= stichtag) vjZeitraum += n;
            });
            const pro = (a, b) => b ? (a >= b ? '+' : '') + Math.round((a - b) / Math.abs(b) * 100) + ' %' : 'kein Vorjahreswert';
            const jahre = Object.keys(jeJahr).map(Number).sort();
            const z = ['## UMSATZ (netto, aus Sage-Rechnungen, fertig gerechnet — Zahlen exakt übernehmen)'];
            jahre.forEach((j, i) => {
                const vor = jeJahr[j - 1];
                z.push('- ' + j + (j === jahr ? ' (bis heute)' : '') + ': ' + euro(jeJahr[j]) + ' aus ' + anzahl[j] + ' Belegen'
                    + (j !== jahr && i > 0 && vor !== undefined ? ' · ggü. Vorjahr ' + pro(jeJahr[j], vor) : ''));
            });
            if (jeJahr[jahr] !== undefined || vjZeitraum) {
                z.push('- Vergleich gleicher Zeitraum: ' + jahr + ' bis heute ' + euro(ytd) + ' vs. ' + (jahr - 1) + ' bis zum selben Tag ' + euro(vjZeitraum) + ' · ' + pro(ytd, vjZeitraum));
            }
            const gesamt = data.reduce((s, r) => s + (Number(r.netto) || 0), 0);
            z.push('- Gesamt seit ' + jahre[0] + ': ' + euro(gesamt) + ' aus ' + data.length + ' Belegen');
            return z.join('\n');
        } catch (e) { return ''; }
    }

    function systemPrompt() {
        const heute = new Date().toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
        return `Du bist Assistent in einer Firma für Recycling-Maschinen (Service, Vermietung, Verkauf). Heute ist ${heute}.
Du bekommst die gesammelten Daten zu EINER Kundenadresse und schreibst daraus einen Überblick für einen Kollegen, der die Adresse gerade übernimmt oder gleich mit dem Kunden telefoniert.

Antworte auf Deutsch, in Markdown, mit genau diesen Abschnitten:

## Auf einen Blick
2–4 Sätze: Wer ist der Kunde, welche Maschinen, wie ist die Beziehung (Stammkunde, Mieter, Neukunde, Probleme?), was ist gerade das Wichtigste.

## Offene Vorgänge & nächste Schritte
Je offenem Vorgang eine Zeile: **Titel** – Stand – wer ist dran – was ist konkret als Nächstes zu tun (aus den offenen Schritten). Überfällige oder lange liegengebliebene Dinge deutlich markieren (⚠️). Keine offenen Vorgänge → das sagen.

## Umsatz
NUR wenn die Daten einen Abschnitt UMSATZ enthalten (sonst diesen Abschnitt ganz weglassen): Umsatz je Jahr als kurze Liste, dann in einem Satz die Entwicklung (mehr/weniger, Prozent, Vergleich gleicher Zeitraum). Zahlen exakt übernehmen, nicht selbst rechnen, keine einzelnen Belege.

## Was bisher war
Chronologisch, kurz (max. 6 Punkte): Kauf, Vermietungen, Wartungen, Reparaturen, Reklamationen, Angebote. Nur was in den Daten steht.

## Auffälligkeiten
Wiederkehrende Probleme, überfällige Wartungen, alte offene Angebote ohne Antwort, fehlende Ansprechpartner, Termine demnächst. Gibt es nichts, schreib „Nichts Auffälliges".

Regeln: Nichts erfinden — nur was in den Daten steht. Zahlen, Daten und Namen exakt übernehmen. Kurz und konkret, keine Floskeln, keine Einleitung und kein Schlusssatz. Wenn Daten fehlen, benenne das knapp.`;
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
        let el = document.getElementById('ab-ai-summary-modal');
        if (el) return el;
        el = document.createElement('div');
        el.id = 'ab-ai-summary-modal';
        el.className = 'modal-backdrop';
        el.innerHTML = `
            <div class="modal-content ab-ai-summary" style="max-width:760px;">
                <button class="ab-icon-btn" data-abs-close style="position:absolute; top:14px; right:14px;" title="Schließen">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
                <h2 style="margin-top:0; display:flex; align-items:center; gap:10px;"><span style="font-size:1.4rem;">✨</span> Zusammenfassung</h2>
                <div id="ab-ai-summary-sub" class="text-muted-sm" style="margin-top:-8px; margin-bottom:12px;"></div>
                <div id="ab-ai-summary-body" class="ab-ai-summary-body"></div>
                <div style="display:flex; gap:10px; margin-top:14px; justify-content:flex-end; flex-wrap:wrap;">
                    <span id="ab-ai-summary-meta" class="text-muted-sm" style="margin-right:auto; align-self:center;"></span>
                    <button type="button" class="ab-btn ab-btn-ghost" id="ab-ai-summary-raus" title="Zeigt den Text genau so, wie er an die KI gesendet wurde — nach der Pseudonymisierung">Was geht raus?</button>
                    <button type="button" class="ab-btn ab-btn-ghost" id="ab-ai-summary-copy">Kopieren</button>
                    <button type="button" class="ab-btn ab-btn-ghost" id="ab-ai-summary-again">Neu erzeugen</button>
                    <button type="button" class="ab-btn ab-btn-primary" data-abs-close>Schließen</button>
                </div>
            </div>`;
        document.body.appendChild(el);
        el.addEventListener('click', e => { if (e.target === el || e.target.closest('[data-abs-close]')) schliessen(); });
        document.getElementById('ab-ai-summary-again').addEventListener('click', () => erzeugen(true));
        document.getElementById('ab-ai-summary-raus').addEventListener('click', () => {
            const body = document.getElementById('ab-ai-summary-body');
            if (body.dataset.zeigtAnfrage === '1') { body.innerHTML = md(letzterText); body.dataset.zeigtAnfrage = ''; document.getElementById('ab-ai-summary-raus').textContent = 'Was geht raus?'; return; }
            body.innerHTML = '<p class="text-muted-sm">So kam der Text beim KI-Anbieter an — Namen, Orte und Nummern sind ersetzt, die Zuordnung liegt nur in diesem Browser:</p>' + (window.kiPseudonym && window.kiPseudonym.pruefHtml ? window.kiPseudonym.pruefHtml(letzteAnfrage || '(noch nichts gesendet)') : '<pre class="ab-ai-summary-roh">' + esc(letzteAnfrage || '(noch nichts gesendet)') + '</pre>');
            body.dataset.zeigtAnfrage = '1'; document.getElementById('ab-ai-summary-raus').textContent = 'Zusammenfassung zeigen';
        });
        document.getElementById('ab-ai-summary-copy').addEventListener('click', async () => {
            try { await navigator.clipboard.writeText(letzterText || ''); toast('Zusammenfassung kopiert.', 'success'); }
            catch (e) { toast('Kopieren nicht möglich — Text markieren und Strg+C.', 'error'); }
        });
        return el;
    }
    function schliessen() {
        const el = document.getElementById('ab-ai-summary-modal');
        if (el) el.classList.remove('show', 'active');
        document.body.style.overflow = '';
    }

    let letzterText = '';
    let letzteAnfrage = '';   // was zuletzt (maskiert) an die KI ging — für „Was geht raus?"
    let aktuelleId = null;
    const cache = new Map();   // adress-id → { text, zeit } — nur für diese Sitzung

    async function erzeugen(neu) {
        const body = document.getElementById('ab-ai-summary-body');
        const meta = document.getElementById('ab-ai-summary-meta');
        const D = window.abDetailDaten ? window.abDetailDaten() : null;
        if (!D || String(D.id) !== String(aktuelleId)) { body.innerHTML = '<p class="text-muted-sm">Adressdaten sind nicht geladen — bitte das Adress-Detail öffnen und erneut versuchen.</p>'; return; }

        const c = cache.get(String(aktuelleId));
        if (c && !neu) { letzterText = c.text; body.innerHTML = md(c.text); meta.textContent = 'Stand ' + c.zeit + (c.schutz ? ' · ' + c.schutz : ''); return; }

        body.innerHTML = '<div class="ab-ai-summary-laden"><span class="ab-ai-spinner"></span> Die KI liest ' + (D.vorgaenge.length + D.notizen.length + D.maschinenHistorie.length) + ' Einträge …</div>';
        meta.textContent = '';
        const t0 = performance.now();
        try {
            // Pseudonymisieren (js/ki-pseudonym.js): Ansprechpartner, Mitarbeiter und Firmen-
            // namen werden vor dem Senden durch Platzhalter ersetzt und in der Antwort wieder
            // eingesetzt. Die Zuordnung bleibt im Browser.
            const a = D.adresse || {};
            const p = window.kiPseudonym ? window.kiPseudonym.erzeugen({
                kontakte: D.ansprechpartner.concat(D.verknuepfteKontakte || [], (D.vorgaenge || []).map(p => p.contact_name).filter(Boolean)),
                firmen: [a.name].concat((D.verknuepfte || []).map(v => v.name)).filter(Boolean),
                // Orte: die Adresse, verknüpfte Adressen, Maschinenstandorte
                orte: [{ city: a.city, zip: a.zip_code }]
                    .concat((D.verknuepfte || []).map(v => ({ city: v.city, zip: v.zip_code })))
                    .concat((D.maschinen || []).map(m => ({ city: m.operator_city || m.location_city || m.location }))),
                // Nummern, die auf euch zurückführen: Kundennr, Seriennummern, Belegnummern
                nummern: [{ wert: a.customer_number, art: 'Kundennr' }, { wert: a.address_number, art: 'Adressnr' }]
                    .concat((D.maschinen || []).map(m => ({ wert: m.serial || m.serial_number, art: 'Seriennr' })))
                    .concat(Object.values(D.angeboteByProcess || {}).map(x => ({ wert: x.belegnummer, art: 'Beleg' })))
                    .concat((D.vorgaenge || []).map(x => ({ wert: x.workshop_order_number, art: 'Auftrag' })))
            }) : null;
            D.umsatzText = await umsatzText(D.id);
            const roh = datenText(D);
            const anfrage = p ? p.maskieren(roh) : roh;
            letzteAnfrage = anfrage;
            const resp = await window.groqFetch({
                messages: [{ role: 'system', content: systemPrompt() + (p ? '\n\n' + window.kiPseudonym.PROMPT_HINWEIS : '') }, { role: 'user', content: anfrage }],
                temperature: 0.2,
                max_tokens: 1400,   // kürzere Antwort = schneller fertig
                stream: true
            });
            // Gestreamt: der Text erscheint schon während des Schreibens (Platzhalter
            // werden bei jedem Stück zurückübersetzt).
            const erg = await window.kiAntwortLesen(resp, teil => { body.innerHTML = md(p ? p.demaskieren(teil) : teil); });
            const d = { usage: erg.usage };
            let text = erg.text;
            if (p) text = p.demaskieren(text);
            letzterText = text;
            const zeit = new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
            const schutz = p ? '🔒 ' + p.anzahl + ' personenbezogene Angaben vor dem Senden ersetzt' : '';
            cache.set(String(aktuelleId), { text, zeit, schutz });
            body.innerHTML = md(text); body.dataset.zeigtAnfrage = ''; document.getElementById('ab-ai-summary-raus').textContent = 'Was geht raus?';
            const tok = d.usage && d.usage.total_tokens;
            meta.textContent = 'Stand ' + zeit + ' · ' + ((performance.now() - t0) / 1000).toFixed(1) + ' s' + (tok ? ' · ' + tok.toLocaleString('de-DE') + ' Token' : '') + (resp.headers.get('x-ki-modell') ? ' · ' + resp.headers.get('x-ki-modell') : '') + (schutz ? ' · ' + schutz : '');
        } catch (e) {
            body.innerHTML = '<p style="color:#fca5a5;">Zusammenfassung fehlgeschlagen: ' + esc(e.message) + '</p>';
        }
    }

    window.openAddressSummary = function (customerId) {
        const D = window.abDetailDaten ? window.abDetailDaten() : null;
        aktuelleId = customerId || (D && D.id);
        const el = fenster();
        document.getElementById('ab-ai-summary-sub').textContent = D && D.adresse ? D.adresse.name + (D.adresse.city ? ' · ' + D.adresse.city : '') : '';
        el.classList.add('show', 'active');
        document.body.style.overflow = 'hidden';
        erzeugen(false);
    };

    // Ändert sich die Adresse (Speichern, Realtime), gilt die Zusammenfassung nicht mehr.
    document.addEventListener('addressbook:changed', e => { const id = e.detail && e.detail.id; if (id) cache.delete(String(id)); else cache.clear(); });
})();
