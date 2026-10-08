// ==========================================================
// KI-BRIEFING: Heute · nächste 3 Tage · diese Woche
// ==========================================================
// Knopf „✨ Briefing" auf dem Dashboard („Heute wichtig") und im Kopf der
// Glocke. Sammelt für den gewählten Zeitraum alles mit Datum — Termine und
// Wartungen (maintenance_events), fällige Wartungen (machines.next_maintenance),
// Vorgänge mit Wiedervorlage / offenen Schritten, geplante Aufgaben und
// Unteraufgaben, Serviceeinsätze, Mietbeginn/-ende, Angebots-Erinnerungen,
// Werkstatt-Liste — und lässt die KI daraus ein Briefing schreiben.
//
// Abfragen filtern serverseitig auf den Zeitraum (Egress-Regel). Läuft über
// window.groqFetch mit stream:true und window.kiPseudonym.
// Nur lesend — die KI schreibt nichts in die Datenbank.
// ==========================================================
(function () {
    'use strict';

    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const toast = (m, t) => (typeof window.showToast === 'function' ? window.showToast(m, t) : console.log(m));
    const kurz = (s, n) => { s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
    const WT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
    const tag = v => { if (!v) return null; const d = new Date(v); return isNaN(d) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
    const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const datum = v => { const d = tag(v); return d ? WT[d.getDay()] + ' ' + d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) : ''; };
    const uhr = v => { if (!v || !/T\d\d:\d\d/.test(String(v))) return ''; const d = new Date(v); return isNaN(d) ? '' : ' ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }); };

    const ZEITRAEUME = {
        heute: { label: 'Heute', tage: 0 },
        tage3: { label: 'Nächste 3 Tage', tage: 2 },
        woche: { label: 'Diese Woche', tage: null }   // bis Sonntag
    };
    function zeitraum(key) {
        const heute = tag(new Date());
        const z = ZEITRAEUME[key] || ZEITRAEUME.heute;
        let bis;
        if (z.tage === null) { bis = new Date(heute); bis.setDate(bis.getDate() + ((7 - heute.getDay()) % 7 || 7) - 1); if (bis < heute) bis = new Date(heute); }
        else { bis = new Date(heute); bis.setDate(bis.getDate() + z.tage); }
        return { von: heute, bis, label: z.label, key };
    }
    const im = (v, Z) => { const d = tag(v); return !!d && d >= Z.von && d <= Z.bis; };
    const vorher = (v, Z) => { const d = tag(v); return !!d && d < Z.von; };

    function nutzerName(id) { const u = (window.userList || []).find(x => String(x.id) === String(id)); return u ? u.name : ''; }
    function nutzerNamen(arr) { return Array.isArray(arr) ? arr.map(v => nutzerName(v) || (typeof v === 'string' && /[a-zäöü]/i.test(v) ? v : '')).filter(Boolean).join(', ') : ''; }
    function meins(arr) {
        const me = window.activeUser; if (!me || !Array.isArray(arr)) return false;
        const n = String(me.name || '').toLowerCase();
        return arr.some(v => String(v) === String(me.id) || String(v).toLowerCase() === n);
    }
    function maschine(id) {
        const m = id && typeof window.machineById === 'function' ? window.machineById(id) : null;
        return m ? (typeof window.machineLabel === 'function' ? window.machineLabel(m) : m.name) : '';
    }
    // Wie classifyAngebotStatus in js/listen.js: verloren/gewonnen = erledigt, alles andere offen.
    function angebotOffen(a) {
        const s = String(a.status || '').toLowerCase();
        return !/verloren|abgelehnt|absage|abgesagt|storniert|kein interesse|gewonnen|auftrag|bestellt|verkauft|angenommen|zusage/.test(s);
    }
    function angebotMeins(a, D) {
        const p = a.process_id && D.vorgaenge.find(v => String(v.id) === String(a.process_id));
        return !!(p && meins((window.procZustaendige ? window.procZustaendige(p) : (p.assigned_users || []))));
    }
    const tageAlt = v => { const d = tag(v); return d ? Math.round((tag(new Date()) - d) / 86400000) : null; };
    const betrag = v => { const n = typeof v === 'number' ? v : parseFloat(String(v == null ? '' : v).replace(/\.(?=\d{3})/g, '').replace(',', '.')); return isNaN(n) ? '' : n.toLocaleString('de-DE', { maximumFractionDigits: 0 }) + ' €'; };
    // Wartet am längsten / steht auf „warten …" → zuerst
    function angeboteSortiert(D, nurMeins) {
        return D.angeboteOffen
            .filter(a => !nurMeins || angebotMeins(a, D))
            .map(a => ({ a, alter: tageAlt(a.belegdatum), warten: /warte|reaktion|rückmeld|nachfass|offen|versendet|verschickt/i.test(a.status || '') }))
            .filter(x => x.alter == null || x.alter >= 3)
            .sort((x, y) => (y.warten - x.warten) || ((y.alter || 0) - (x.alter || 0)));
    }

    function angebotFirma(a) { return ((a.customers && a.customers.name) || a.kundenmatchcode || '').split(',')[0].trim(); }
    function kunde(id) {
        const k = id && typeof window.customerCacheSync === 'function' ? (window.customerCacheSync() || []).find(c => String(c.id) === String(id)) : null;
        return k ? k.name : '';
    }

    // ---------- Daten laden (serverseitig auf den Zeitraum gefiltert) ----------
    async function laden(Z) {
        const sb = window.supabaseClient;
        const von = iso(Z.von), bis = iso(Z.bis);
        const ueber = new Date(Z.von); ueber.setDate(ueber.getDate() - 30);   // Überfälliges bis 30 Tage zurück
        const vonUeber = iso(ueber);
        const q = p => p.then(r => r.data || []).catch(e => { console.warn('Briefing:', e); return []; });
        const halbesJahr = new Date(Z.von); halbesJahr.setDate(halbesJahr.getDate() - 180);
        const [ereignisse, teilnehmer, faellig, vorgaenge, aufgaben, unteraufgaben, einsaetze, mieten, angebote, werkstatt, angeboteAlle] = await Promise.all([
            // Termine + Wartungen (eine Tabelle, siehe CLAUDE.md)
            q(sb.from('maintenance_events').select('id, title, event_date, start_date, machine_id, manual_machine, maintenance_types, description, customer_id, created_by_user').or(`and(event_date.gte.${von},event_date.lte.${bis}),and(start_date.gte.${von},start_date.lte.${bis})`).limit(200)),
            q(sb.from('event_participants').select('event_id, user_id, status').limit(500)),
            q(sb.from('machines').select('id, next_maintenance, customer_id, company, location').gte('next_maintenance', vonUeber).lte('next_maintenance', bis).limit(200)),
            q(sb.from('internal_processes').select('id, title, status, process_type, remind_at, assigned_users, customer_id, contact_name, steps, machine_id, created_at').neq('status', 'erledigt').limit(400)),
            q(sb.from('tasks').select('id, title, status, machine_id, workshop_order_number, assigned_to, start_date, end_date').neq('status', 'completed').limit(300)),
            q(sb.from('subtasks').select('id, task_id, title, status, assigned_to, start_date, end_date').gte('start_date', vonUeber).lte('start_date', bis).limit(300)),
            q(sb.from('service_entries').select('id, title, date, datum_von, datum_bis, machine_id, description').or(`and(date.gte.${von},date.lte.${bis}),and(datum_von.gte.${von},datum_von.lte.${bis})`).limit(100)),
            q(sb.from('rental_agreements').select('id, title, machine_id, data, created_at').order('created_at', { ascending: false }).limit(150)),
            q(sb.from('angebote').select('*, customers(name)').gte('erinnerung', vonUeber).lte('erinnerung', bis).limit(100)),
            q(sb.from('workshop_tasks').select('id, text, done').eq('done', false).limit(50)),
            // Offene Angebote der letzten 6 Monate (Status-Text entscheidet, siehe angebotOffen)
            q(sb.from('angebote').select('*, customers(name)').gte('belegdatum', iso(halbesJahr)).order('belegdatum', { ascending: false }).limit(300))
        ]);
        const mitErinnerung = new Set(angebote.map(a => String(a.id)));
        const angeboteOffen = angeboteAlle.filter(a => angebotOffen(a) && !mitErinnerung.has(String(a.id)));
        return { Z, ereignisse, teilnehmer, faellig, vorgaenge, aufgaben, unteraufgaben, einsaetze, mieten, angebote, werkstatt, angeboteOffen };
    }

    // ---------- Daten → Text ----------
    function datenText(D, nurMeins) {
        const Z = D.Z;
        const zeilen = [];
        const me = window.activeUser ? window.activeUser.name : '';
        zeilen.push('ZEITRAUM: ' + Z.label + ' — ' + datum(Z.von) + (Z.bis > Z.von ? ' bis ' + datum(Z.bis) : '') + (nurMeins && me ? ' · nur Einträge von ' + me : ''));

        // Termine und Wartungen aus maintenance_events
        const teiln = {};
        D.teilnehmer.forEach(t => { (teiln[t.event_id] = teiln[t.event_id] || []).push(t); });
        const termine = [], wartungen = [];
        D.ereignisse.forEach(e => {
            const wann = e.event_date || e.start_date;
            const istWartung = !!(e.machine_id || e.manual_machine || e.maintenance_types);
            const leute = (teiln[e.id] || []);
            const namen = leute.map(t => nutzerName(t.user_id) + (t.status && t.status !== 'accepted' ? ' (' + (t.status === 'declined' ? 'abgesagt' : 'offen') + ')' : '')).filter(Boolean);
            if (e.created_by_user && nutzerName(e.created_by_user) && !leute.some(t => String(t.user_id) === String(e.created_by_user))) namen.unshift(nutzerName(e.created_by_user));
            if (nurMeins && !meins(leute.map(t => t.user_id).concat(e.created_by_user ? [e.created_by_user] : []))) return;
            const s = datum(wann) + uhr(wann) + ': ' + kurz(e.title || '', 100) + (istWartung ? ' [' + (e.maintenance_types || 'Wartung') + '] ' + (maschine(e.machine_id) || e.manual_machine || '') : '') + (kunde(e.customer_id) ? ' · ' + kunde(e.customer_id) : '') + (namen.length ? ' · ' + namen.join(', ') : '') + (e.description ? ' — ' + kurz(e.description, 140) : '');
            (istWartung ? wartungen : termine).push({ t: new Date(wann).getTime(), s });
        });
        const sortiert = a => a.sort((x, y) => x.t - y.t).map(x => '- ' + x.s);
        if (termine.length) zeilen.push('\n## TERMINE (' + termine.length + ')', ...sortiert(termine));
        if (wartungen.length) zeilen.push('\n## GEPLANTE WARTUNGEN (' + wartungen.length + ')', ...sortiert(wartungen));

        // Fällige Wartungen laut Maschinenstamm
        if (!nurMeins && D.faellig.length) {
            zeilen.push('\n## WARTUNG FÄLLIG laut Maschinenstamm (' + D.faellig.length + ')');
            D.faellig.sort((a, b) => new Date(a.next_maintenance) - new Date(b.next_maintenance)).forEach(m => zeilen.push('- ' + datum(m.next_maintenance) + (vorher(m.next_maintenance, Z) ? ' ÜBERFÄLLIG' : '') + ': ' + (maschine(m.id) || 'Maschine') + (m.company ? ' · ' + m.company : '') + (m.location ? ' · ' + m.location : '')));
        }

        // Vorgänge: Wiedervorlage im Zeitraum oder überfällig, offene Schritte mit Erinnerung
        const vg = [];
        let offenGesamt = 0;
        D.vorgaenge.forEach(p => {
            const zust = nutzerNamen(p.assigned_users);
            if (nurMeins && !meins((window.procZustaendige ? window.procZustaendige(p) : (p.assigned_users || [])))) return;
            offenGesamt++;
            const steps = Array.isArray(p.steps) ? p.steps : [];
            const offen = steps.filter(s => !s.done);
            const stepHits = offen.filter(s => s.remind_at && (im(s.remind_at, Z) || vorher(s.remind_at, Z)));
            const hit = p.remind_at && (im(p.remind_at, Z) || vorher(p.remind_at, Z));
            if (!hit && !stepHits.length) return;
            const wann = hit ? p.remind_at : stepHits[0].remind_at;
            vg.push({ t: new Date(wann).getTime(), s: datum(wann) + uhr(wann) + (vorher(wann, Z) ? ' ÜBERFÄLLIG' : '') + ': ' + kurz(p.title || '(ohne Titel)', 100) + (kunde(p.customer_id) ? ' · ' + kunde(p.customer_id) : '') + (maschine(p.machine_id) ? ' · ' + maschine(p.machine_id) : '') + (zust ? ' · ' + zust : '') + (offen.length ? ' · offen: ' + offen.slice(0, 4).map(s => kurz(s.text, 60) + (s.remind_at ? ' (bis ' + datum(s.remind_at) + ')' : '')).join('; ') : '') });
        });
        if (vg.length) zeilen.push('\n## VORGÄNGE mit Wiedervorlage (' + vg.length + ' von ' + offenGesamt + ' offenen)', ...sortiert(vg));
        else if (offenGesamt) zeilen.push('\n## VORGÄNGE: keine Wiedervorlage im Zeitraum (' + offenGesamt + ' offen)');

        // Aufgaben: geplant im Zeitraum (start/end überlappt) oder mir zugewiesen
        const tasksById = {}; D.aufgaben.forEach(t => { tasksById[t.id] = t; });
        const ag = [];
        D.aufgaben.forEach(t => {
            if (nurMeins && !meins(t.assigned_to)) return;
            const s = tag(t.start_date), e = tag(t.end_date) || s;
            const geplant = s && e && s <= Z.bis && e >= Z.von;
            const ueberf = e && e < Z.von;
            if (!geplant && !ueberf) return;
            ag.push({ t: s ? s.getTime() : 0, s: (s ? datum(s) + (e && e > s ? '–' + datum(e) : '') : 'ohne Datum') + (ueberf ? ' ÜBERFÄLLIG' : '') + ': ' + kurz(t.title || '', 100) + (maschine(t.machine_id) ? ' · ' + maschine(t.machine_id) : '') + (t.workshop_order_number ? ' · WA ' + t.workshop_order_number : '') + (nutzerNamen(t.assigned_to) ? ' · ' + nutzerNamen(t.assigned_to) : '') + (t.status && t.status !== 'open' ? ' [' + t.status + ']' : '') });
        });
        D.unteraufgaben.forEach(u => {
            if (u.status === 'completed' || u.status === 'done') return;
            if (nurMeins && !meins(u.assigned_to)) return;
            const t = tasksById[u.task_id];
            ag.push({ t: tag(u.start_date).getTime(), s: datum(u.start_date) + (tag(u.end_date) && tag(u.end_date) > tag(u.start_date) ? '–' + datum(u.end_date) : '') + (vorher(u.start_date, Z) ? ' (begonnen)' : '') + ': ' + kurz(u.title || '', 80) + (t ? ' (zu: ' + kurz(t.title || '', 60) + (maschine(t.machine_id) ? ' · ' + maschine(t.machine_id) : '') + ')' : '') + (nutzerNamen(u.assigned_to) ? ' · ' + nutzerNamen(u.assigned_to) : '') });
        });
        if (ag.length) zeilen.push('\n## AUFGABEN geplant (' + ag.length + ')', ...sortiert(ag));
        const offeneAufg = D.aufgaben.filter(t => !nurMeins || meins(t.assigned_to)).length;
        if (offeneAufg > ag.length) zeilen.push('(dazu ' + (offeneAufg - ag.length) + ' offene Aufgaben ohne Termin im Zeitraum)');

        // Serviceeinsätze
        if (D.einsaetze.length && !nurMeins) {
            zeilen.push('\n## SERVICEEINSÄTZE (' + D.einsaetze.length + ')');
            D.einsaetze.sort((a, b) => new Date(a.datum_von || a.date) - new Date(b.datum_von || b.date)).forEach(s => zeilen.push('- ' + datum(s.datum_von || s.date) + (s.datum_bis && tag(s.datum_bis) > tag(s.datum_von || s.date) ? '–' + datum(s.datum_bis) : '') + ': ' + kurz(s.title || 'Servicebericht', 80) + (maschine(s.machine_id) ? ' · ' + maschine(s.machine_id) : '') + (s.description ? ' — ' + kurz(s.description, 120) : '')));
        }

        // Miete: Beginn / Ende im Zeitraum
        const mz = [];
        D.mieten.forEach(r => {
            const mi = (r.data && r.data.miete) || {}; const mieter = (r.data && r.data.mieter) || {};
            if (im(mi.beginn, Z)) mz.push({ t: tag(mi.beginn).getTime(), s: datum(mi.beginn) + ': Mietbeginn ' + (maschine(r.machine_id) || kurz(r.title || '', 60)) + (mieter.name ? ' · ' + mieter.name : '') });
            if (im(mi.ende, Z)) mz.push({ t: tag(mi.ende).getTime(), s: datum(mi.ende) + ': Mietende / Rücknahme ' + (maschine(r.machine_id) || kurz(r.title || '', 60)) + (mieter.name ? ' · ' + mieter.name : '') });
        });
        if (mz.length && !nurMeins) zeilen.push('\n## MIETE (' + mz.length + ')', ...sortiert(mz));

        // Angebots-Erinnerungen
        if (D.angebote.length && !nurMeins) {
            zeilen.push('\n## ANGEBOTE nachfassen (' + D.angebote.length + ')');
            D.angebote.sort((a, b) => new Date(a.erinnerung) - new Date(b.erinnerung)).forEach(a => zeilen.push('- ' + datum(a.erinnerung) + (vorher(a.erinnerung, Z) ? ' ÜBERFÄLLIG' : '') + ': Angebot ' + (a.belegnummer || '') + (angebotFirma(a) ? ' · ' + angebotFirma(a) : '') + (a.status ? ' [' + a.status + ']' : '')));
        }

        const wo = angeboteSortiert(D, nurMeins).slice(0, 30);
        if (wo.length) {
            zeilen.push('\n## ANGEBOTE offen — warten auf Reaktion (' + wo.length + ')');
            wo.forEach(x => zeilen.push('- Angebot ' + (x.a.belegnummer || '') + (angebotFirma(x.a) ? ' · ' + angebotFirma(x.a) : '') + ' [' + (x.a.status || 'offen') + ']' + (x.alter != null ? ' · seit ' + x.alter + ' Tagen' : '') + (betrag(x.a.nettobetrag) ? ' · ' + betrag(x.a.nettobetrag) : '')));
        }

        if (D.werkstatt.length && !nurMeins) zeilen.push('\n## WERKSTATT-LISTE offen (' + D.werkstatt.length + ')', ...D.werkstatt.slice(0, 15).map(w => '- ' + kurz(w.text || '', 80)));

        return zeilen.join('\n');
    }

    function systemPrompt(Z) {
        const heute = new Date().toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
        const mehrereTage = Z.bis > Z.von;
        return `Du bist Assistent in einer Firma für Recycling-Maschinen (Service, Vermietung, Verkauf). Heute ist ${heute}.
Du bekommst alle terminierten Dinge für den Zeitraum „${Z.label}" und schreibst daraus ein Briefing, wie es ein guter Disponent morgens dem Team vorliest.

Antworte auf Deutsch, in Markdown, mit genau diesen Abschnitten:

## Auf einen Blick
2–4 Sätze: Wie voll ist ${mehrereTage ? 'der Zeitraum' : 'der Tag'}, was ist das Wichtigste, gibt es Überfälliges oder Kollisionen (zwei Dinge zur selben Zeit, dieselbe Person doppelt verplant).

${mehrereTage ? '## Tag für Tag\nJe Tag eine Überschrift (**Wochentag, Datum**) und darunter chronologisch die Termine, Wartungen, Einsätze, Wiedervorlagen — mit Uhrzeit, Kunde/Maschine, wer. Tage ohne Einträge weglassen.' : '## Heute chronologisch\nAlle Termine, Wartungen, Einsätze und Wiedervorlagen in Zeitreihenfolge — mit Uhrzeit, Kunde/Maschine, wer.'}

## Vorgänge & Aufgaben
Was ist zu erledigen: offene Schritte mit Frist, geplante Aufgaben. Je Punkt eine Zeile, wer ist dran.

## Angebote
Angebote mit Erinnerung und offene Angebote, die auf eine Reaktion des Kunden warten: Belegnummer, Kunde, Status, seit wie vielen Tagen. Älteste und „warten auf Reaktion" zuerst, mit kurzer Empfehlung (anrufen / nachfassen per Mail). Gibt es keine, Abschnitt weglassen.

## ⚠️ Achtung
Überfälliges, fällige Wartungen ohne Termin, Termine ohne zugesagte Teilnehmer, Mietrücknahmen. Gibt es nichts, schreib „Nichts Auffälliges".

Regeln: Nichts erfinden — nur was in den Daten steht. Daten, Uhrzeiten, Namen exakt übernehmen. Kurz und konkret, keine Floskeln. Leerer Zeitraum → das in einem Satz sagen.`;
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

    // Offene Angebote als Liste mit Knöpfen (nicht von der KI — echte Daten, damit PDF und Mail stimmen).
    function angeboteHtml(D, nurMeins) {
        const liste = D.angebote.filter(angebotOffen).map(a => ({ a, alter: tageAlt(a.belegdatum), erinnerung: true }))
            .concat(angeboteSortiert(D, nurMeins).slice(0, 15));
        if (!liste.length) return '';
        return '<div class="kb-angebote"><h4>📄 Angebote — warten auf Reaktion</h4>' + liste.map(x => `
            <div class="kb-angebot">
                <div class="kb-angebot-text"><b>${esc(x.a.belegnummer || '')}</b> · ${esc(angebotFirma(x.a))}
                    <div class="text-muted-sm">${esc(x.a.status || 'offen')}${x.alter != null ? ' · seit ' + x.alter + ' Tagen' : ''}${betrag(x.a.nettobetrag) ? ' · ' + betrag(x.a.nettobetrag) : ''}${x.erinnerung && x.a.erinnerung ? ' · Erinnerung ' + datum(x.a.erinnerung) : ''}</div>
                </div>
                <div class="kb-angebot-knoepfe">
                    <button type="button" class="todo-kk" data-kb-angebot="pdf" data-id="${esc(x.a.id)}">📄 PDF</button>
                    <button type="button" class="todo-kk todo-kk-primaer" data-kb-angebot="mail" data-id="${esc(x.a.id)}">✉ Mail</button>
                    <button type="button" class="todo-kk" data-kb-angebot="todo" data-id="${esc(x.a.id)}" data-nr="${esc(x.a.belegnummer || '')}" data-firma="${esc(angebotFirma(x.a))}" data-status="${esc(x.a.status || '')}" data-kunde="${esc(x.a.customer_id || '')}" title="In die To-do-Liste">＋ To-do</button>
                </div>
            </div>`).join('') + '</div>';
    }

    // ---------- Fenster ----------
    let letzterText = '', letzteAnfrage = '', letzteAngebote = '', lauf = 0;
    let zeitraumKey = 'heute', nurMeins = true;   // Vorgabe: nur eigene Einträge
    const cache = new Map();   // key+meins → { text, zeit, schutz, anfrage }

    function fenster() {
        let el = document.getElementById('ki-briefing-modal');
        if (el) return el;
        el = document.createElement('div');
        el.id = 'ki-briefing-modal';
        el.className = 'modal-backdrop';
        el.innerHTML = `
            <div class="modal-content ab-ai-summary" style="max-width:760px;">
                <button class="ab-icon-btn" data-kb-close style="position:absolute; top:14px; right:14px;" title="Schließen">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
                <h2 style="margin-top:0; display:flex; align-items:center; gap:10px;"><span style="font-size:1.4rem;">✨</span> Briefing</h2>
                <div class="ki-briefing-wahl">
                    <div class="ki-briefing-seg" id="ki-briefing-seg">
                        <button type="button" data-z="heute">Heute</button>
                        <button type="button" data-z="tage3">Nächste 3 Tage</button>
                        <button type="button" data-z="woche">Diese Woche</button>
                    </div>
                    <label class="row-clickable"><input type="checkbox" class="clickable" id="ki-briefing-meins"> Nur meine Einträge</label>
                </div>
                <div id="ki-briefing-sub" class="text-muted-sm" style="margin-bottom:12px;"></div>
                <div id="ki-briefing-body" class="ab-ai-summary-body"></div>
                <div style="display:flex; gap:10px; margin-top:14px; justify-content:flex-end; flex-wrap:wrap;">
                    <span id="ki-briefing-meta" class="text-muted-sm" style="margin-right:auto; align-self:center;"></span>
                    <button type="button" class="ab-btn ab-btn-ghost" id="ki-briefing-raus" title="Zeigt den Text genau so, wie er an die KI gesendet wurde — nach der Pseudonymisierung">Was geht raus?</button>
                    <button type="button" class="ab-btn ab-btn-ghost" id="ki-briefing-copy">Kopieren</button>
                    <button type="button" class="ab-btn ab-btn-ghost" id="ki-briefing-again">Neu erzeugen</button>
                    <button type="button" class="ab-btn ab-btn-ghost" id="ki-briefing-todo" title="Die KI wählt das wirklich Wichtige aus und druckt es als ToDo-Liste mit Adressen und Notizfeld">🖨 Wichtigstes als ToDo</button>
                    <button type="button" class="ab-btn ab-btn-primary" id="ki-briefing-alstodo" title="Die KI wählt das Wichtige aus und legt es in deine To-do-Liste (Knopf unten rechts) — dort arbeitest du es Punkt für Punkt ab">✅ Als To-do übernehmen</button>
                </div>
            </div>`;
        document.body.appendChild(el);
        el.addEventListener('click', e => { if (e.target === el || e.target.closest('[data-kb-close]')) schliessen(); });
        el.addEventListener('click', e => {
            const b = e.target.closest('[data-kb-angebot]');
            if (!b || !window.todoAktion) return;
            const id = b.dataset.id;
            if (b.dataset.kbAngebot === 'pdf') return window.todoAktion.pdf(id);
            if (b.dataset.kbAngebot === 'mail') { schliessen(); return window.todoAktion.mail(id); }
            if (b.dataset.kbAngebot === 'todo' && window.todoUebernehmen) {
                schliessen();
                window.todoUebernehmen([{ typLabel: 'Angebot', title: 'Angebot ' + b.dataset.nr + ' nachfassen', subject: b.dataset.firma + (b.dataset.status ? ' · ' + b.dataset.status : ''),
                    gruppe: 'Wichtig', ki: 'Wartet auf Reaktion', targetType: 'angebot', targetId: id, customerId: b.dataset.kunde || null }]);
            }
        });
        document.getElementById('ki-briefing-seg').addEventListener('click', e => { const b = e.target.closest('button[data-z]'); if (!b) return; zeitraumKey = b.dataset.z; segMarkieren(); erzeugen(false); });
        document.getElementById('ki-briefing-meins').addEventListener('change', e => { nurMeins = e.target.checked; erzeugen(false); });
        document.getElementById('ki-briefing-again').addEventListener('click', () => erzeugen(true));
        document.getElementById('ki-briefing-todo').addEventListener('click', () => kiTodoDrucken());
        document.getElementById('ki-briefing-alstodo').addEventListener('click', () => alsTodo());
        document.getElementById('ki-briefing-raus').addEventListener('click', () => {
            const body = document.getElementById('ki-briefing-body'), btn = document.getElementById('ki-briefing-raus');
            if (body.dataset.zeigtAnfrage === '1') { body.innerHTML = md(letzterText) + letzteAngebote; body.dataset.zeigtAnfrage = ''; btn.textContent = 'Was geht raus?'; return; }
            body.innerHTML = '<p class="text-muted-sm">So kam der Text beim KI-Anbieter an — Namen, Orte und Nummern sind ersetzt, die Zuordnung liegt nur in diesem Browser:</p>' + (window.kiPseudonym && window.kiPseudonym.pruefHtml ? window.kiPseudonym.pruefHtml(letzteAnfrage || '(noch nichts gesendet)') : '<pre class="ab-ai-summary-roh">' + esc(letzteAnfrage) + '</pre>');
            body.dataset.zeigtAnfrage = '1'; btn.textContent = 'Briefing zeigen';
        });
        document.getElementById('ki-briefing-copy').addEventListener('click', async () => {
            try { await navigator.clipboard.writeText(letzterText || ''); toast('Briefing kopiert.', 'success'); }
            catch (e) { toast('Kopieren nicht möglich — Text markieren und Strg+C.', 'error'); }
        });
        return el;
    }
    function segMarkieren() {
        document.querySelectorAll('#ki-briefing-seg button').forEach(b => b.classList.toggle('active', b.dataset.z === zeitraumKey));
        const Z = zeitraum(zeitraumKey);
        document.getElementById('ki-briefing-sub').textContent = datum(Z.von) + (Z.bis > Z.von ? ' – ' + datum(Z.bis) : '') + ' · ' + new Date().getFullYear();
    }
    function schliessen() {
        const el = document.getElementById('ki-briefing-modal');
        if (el) el.classList.remove('show', 'active');
        if (!document.querySelector('.modal-backdrop.show, .modal-backdrop.active')) document.body.style.overflow = '';
    }

    async function erzeugen(neu) {
        const body = document.getElementById('ki-briefing-body');
        const meta = document.getElementById('ki-briefing-meta');
        const raus = document.getElementById('ki-briefing-raus');
        const key = zeitraumKey + (nurMeins ? ':meins' : '');
        const mein = ++lauf;

        const c = cache.get(key);
        if (c && !neu) { letzterText = c.text; letzteAnfrage = c.anfrage; letzteAngebote = c.angebHtml || ''; body.innerHTML = md(c.text) + letzteAngebote; body.dataset.zeigtAnfrage = ''; raus.textContent = 'Was geht raus?'; meta.textContent = 'Stand ' + c.zeit + (c.schutz ? ' · ' + c.schutz : ''); return; }

        body.innerHTML = '<div class="ab-ai-summary-laden"><span class="ab-ai-spinner"></span> Lade Termine, Wartungen, Vorgänge, Aufgaben …</div>';
        body.dataset.zeigtAnfrage = ''; raus.textContent = 'Was geht raus?';
        meta.textContent = '';
        const t0 = performance.now();
        try {
            if (!window.supabaseClient) throw new Error('Nicht angemeldet.');
            const Z = zeitraum(zeitraumKey);
            const D = await laden(Z);
            if (mein !== lauf) return;
            const n = D.ereignisse.length + D.faellig.length + D.vorgaenge.length + D.aufgaben.length + D.unteraufgaben.length + D.einsaetze.length + D.angebote.length;
            body.innerHTML = '<div class="ab-ai-summary-laden"><span class="ab-ai-spinner"></span> Die KI liest ' + n + ' Einträge …</div>';

            const roh = datenText(D, nurMeins);
            const p = window.kiPseudonym ? window.kiPseudonym.erzeugen(window.kiPseudonym.standardKontext({
                kontakte: D.vorgaenge.map(x => x.contact_name).filter(Boolean),
                firmen: D.mieten.map(r => r.data && r.data.mieter && r.data.mieter.name).concat(D.angebote.map(angebotFirma), D.faellig.map(m => m.company)).filter(Boolean)
            })) : null;
            const anfrage = p ? p.maskieren(roh) : roh;
            letzteAnfrage = anfrage;
            const resp = await window.groqFetch({
                messages: [{ role: 'system', content: systemPrompt(Z) + (p ? '\n\n' + window.kiPseudonym.PROMPT_HINWEIS : '') }, { role: 'user', content: anfrage }],
                temperature: 0.2,
                max_tokens: 3000,
                stream: true
            });
            const erg = await window.kiAntwortLesen(resp, teil => { if (mein === lauf) body.innerHTML = md(p ? p.demaskieren(teil) : teil) + (window.kiSchreibtHtml || ''); });
            if (mein !== lauf) return;
            let text = erg.text;
            if (p) text = p.demaskieren(text);
            letzterText = text;
            const zeit = new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
            const schutz = p ? '🔒 ' + p.anzahl + ' Angaben vor dem Senden ersetzt' : '';
            // Unvollständig (abgebrochen/abgeschnitten): deutlich sagen, nicht zwischenspeichern.
            if (erg.vollstaendig === false) {
                body.innerHTML = md(text) + window.kiUnvollstaendigHtml(erg.grund).replace('Die Zusammenfassung ist', 'Das Briefing ist');
                meta.textContent = 'Stand ' + zeit + ' · unvollständig';
                return;
            }
            const angebHtml = angeboteHtml(D, nurMeins);
            cache.set(key, { text, zeit, schutz, anfrage, angebHtml });
            letzteAngebote = angebHtml; body.innerHTML = md(text) + angebHtml;
            const tok = erg.usage && erg.usage.total_tokens;
            meta.textContent = 'Stand ' + zeit + ' · ' + ((performance.now() - t0) / 1000).toFixed(1) + ' s' + (tok ? ' · ' + tok.toLocaleString('de-DE') + ' Token' : '') + (resp.headers.get('x-ki-modell') ? ' · ' + resp.headers.get('x-ki-modell') : '') + (schutz ? ' · ' + schutz : '');
        } catch (e) {
            if (mein !== lauf) return;
            body.innerHTML = '<p style="color:#fca5a5;">Briefing fehlgeschlagen: ' + esc(e.message) + '</p>';
        }
    }

    // ---------- „Wichtigstes als ToDo drucken" ----------
    // Die KI wählt aus denselben Daten die wirklich wichtigen Punkte, ordnet sie
    // drei Stufen zu und begründet kurz. Gedruckt wird über js/kalender-todo-druck.js
    // (Adresse, letzter Stand, nächster Schritt, Notizfeld). Einträge laufen als
    // R1, R2 … zur KI — IDs, Adressen und Namen verlassen den Browser nicht
    // (Texte zusätzlich pseudonymisiert).
    const PRIO = ['', 'Heute unbedingt', 'Wichtig', 'Wenn Zeit bleibt'];

    function kandidaten(D, nurMeins) {
        const Z = D.Z, out = [];
        const add = (o) => out.push(Object.assign({ ref: 'R' + (out.length + 1) }, o));
        const teiln = {};
        D.teilnehmer.forEach(t => { (teiln[t.event_id] = teiln[t.event_id] || []).push(t); });
        D.ereignisse.forEach(e => {
            const wann = e.event_date || e.start_date;
            if (nurMeins && !meins((teiln[e.id] || []).map(t => t.user_id).concat(e.created_by_user ? [e.created_by_user] : []))) return;
            const wartung = !!(e.machine_id || e.manual_machine || e.maintenance_types);
            add({ wann, typ: wartung ? 'Wartung' : 'Termin', titel: e.title || 'Termin', targetType: 'event', targetId: e.id,
                subject: maschine(e.machine_id) || e.manual_machine || '', customerId: e.customer_id || null,
                zeile: kurz(e.title || '', 90) + (kunde(e.customer_id) ? ' · ' + kunde(e.customer_id) : '') + (e.description ? ' — ' + kurz(e.description, 100) : '') });
        });
        if (!nurMeins) D.faellig.forEach(m => add({ wann: m.next_maintenance, typ: 'Wartung', titel: 'Wartung fällig', subject: maschine(m.id), targetType: 'machine', targetId: m.id, customerId: m.customer_id || null,
            zeile: 'Wartung fällig ' + (maschine(m.id) || '') + (m.company ? ' · ' + m.company : '') }));
        D.vorgaenge.forEach(p => {
            if (nurMeins && !meins((window.procZustaendige ? window.procZustaendige(p) : (p.assigned_users || [])))) return;
            const offen = (Array.isArray(p.steps) ? p.steps : []).filter(s => !s.done);
            const stepHit = offen.find(s => s.remind_at && (im(s.remind_at, Z) || vorher(s.remind_at, Z)));
            const hit = p.remind_at && (im(p.remind_at, Z) || vorher(p.remind_at, Z));
            if (!hit && !stepHit) return;
            add({ wann: hit ? p.remind_at : stepHit.remind_at, typ: 'Vorgang', titel: p.title || 'Vorgang', targetType: 'process', targetId: p.id, customerId: p.customer_id || null,
                zeile: kurz(p.title || '', 90) + (kunde(p.customer_id) ? ' · ' + kunde(p.customer_id) : '') + (offen.length ? ' · offen: ' + offen.slice(0, 3).map(s => kurz(s.text, 50)).join('; ') : '') });
        });
        if (!nurMeins) D.einsaetze.forEach(s => add({ wann: s.datum_von || s.date, typ: 'Service', titel: s.title || 'Servicebericht', subject: maschine(s.machine_id), targetType: 'service', targetId: s.id,
            zeile: kurz(s.title || 'Servicebericht', 80) + (maschine(s.machine_id) ? ' · ' + maschine(s.machine_id) : '') }));
        if (!nurMeins) D.angebote.forEach(a => add({ wann: a.erinnerung, typ: 'Angebot', titel: 'Angebot ' + (a.belegnummer || ''), subject: angebotFirma(a), targetType: 'angebot', targetId: a.id, customerId: a.customer_id || null,
            zeile: 'Angebot nachfassen · ' + angebotFirma(a) + (a.status ? ' [' + a.status + ']' : '') }));
        angeboteSortiert(D, nurMeins).slice(0, 20).forEach(x => add({ wann: x.a.belegdatum, typ: 'Angebot', titel: 'Angebot ' + (x.a.belegnummer || '') + ' nachfassen', subject: angebotFirma(x.a) + (x.a.status ? ' · ' + x.a.status : ''), targetType: 'angebot', targetId: x.a.id, customerId: x.a.customer_id || null,
            zeile: 'Angebot wartet auf Reaktion · ' + angebotFirma(x.a) + ' [' + (x.a.status || 'offen') + ']' + (x.alter != null ? ' seit ' + x.alter + ' Tagen' : '') }));
        return out.map(x => Object.assign(x, { text: `${x.ref} | ${x.typ} | ${datum(x.wann)}${uhr(x.wann)}${vorher(x.wann, Z) ? ' ÜBERFÄLLIG' : ''} | ${x.zeile}` }));
    }

    // KI wählt aus den Kandidaten das Wichtige (ein Aufruf je Zeitraum, kurz zwischengespeichert —
    // Drucken und „Als To-do übernehmen" nutzen dieselbe Auswahl).
    const auswahlCache = new Map();
    async function kiAuswahl(Z) {
        const ckey = Z.key + (nurMeins ? ':meins' : '');
        const c = auswahlCache.get(ckey);
        if (c && Date.now() - c.zeit < 10 * 60 * 1000) return c.liste;
            const D = await laden(Z);
            const liste = kandidaten(D, nurMeins);
            if (!liste.length) return [];
            const p = window.kiPseudonym ? window.kiPseudonym.erzeugen(window.kiPseudonym.standardKontext({
                kontakte: D.vorgaenge.map(x => x.contact_name).filter(Boolean),
                firmen: D.angebote.map(angebotFirma).concat(D.faellig.map(m => m.company)).filter(Boolean)
            })) : null;
            const roh = liste.map(x => x.text).join('\n');
            const heute = new Date().toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
            const system = `Du bist Disponent in einer Firma für Recycling-Maschinen (Service, Vermietung, Verkauf). Heute ist ${heute}, Zeitraum „${Z.label}".
Du bekommst Einträge (Ref | Art | Datum | Inhalt). Wähle, was in diesem Zeitraum WIRKLICH erledigt werden muss, und gib eine ToDo-Liste zurück.
Stufen: 1 = heute unbedingt (feste Termine, Überfälliges mit Folgen, Kunde wartet), 2 = wichtig, 3 = wenn Zeit bleibt. Unwichtiges weglassen, höchstens 25 Einträge.
Antworte NUR mit JSON: {"liste":[{"ref":"R3","stufe":1,"warum":"max. 12 Wörter, konkret"}]} — sortiert nach Wichtigkeit. Nur Refs aus den Daten, nichts erfinden.`;
            const resp = await window.groqFetch({
                messages: [{ role: 'system', content: system + (p ? '\n\n' + window.kiPseudonym.PROMPT_HINWEIS : '') },
                    { role: 'user', content: p ? p.maskieren(roh) : roh }],
                temperature: 0.1, max_tokens: 1500, stream: false
            });
            const erg = await window.kiAntwortLesen(resp, () => {});
            const text = p ? p.demaskieren(erg.text || '') : (erg.text || '');
            const json = JSON.parse((text.match(/\{[\s\S]*\}/) || ['{}'])[0]);
            const byRef = new Map(liste.map(x => [x.ref, x]));
            const gewaehlt = (Array.isArray(json.liste) ? json.liste : [])
                .filter(v => v && byRef.has(String(v.ref).trim()))
                .map((v, i) => {
                    const x = byRef.get(String(v.ref).trim());
                    const stufe = Math.min(3, Math.max(1, parseInt(v.stufe, 10) || 2));
                    const d = tag(x.wann);
                    return { stufe, i, e: {
                        day: d ? iso(d) : '', datumText: datum(x.wann) + uhr(x.wann), time: '',
                        typLabel: x.typ, title: x.titel, subject: x.subject || '', note: '',
                        ki: String(v.warum || '').trim(), gruppe: PRIO[stufe],
                        targetType: x.targetType || null, targetId: x.targetId || null, customerId: x.customerId || null
                    } };
                })
                .sort((a, b) => a.stufe - b.stufe || a.i - b.i)
                .map(v => v.e);
            if (!gewaehlt.length) throw new Error('Die KI hat keine verwertbare Liste geliefert.');
            auswahlCache.set(ckey, { zeit: Date.now(), liste: gewaehlt });
            return gewaehlt;
    }

    async function kiTodoDrucken() {
        // Fenster sofort (Popup-Sperre), gefüllt wird nach der KI-Antwort.
        const w = window.kalenderTodoFenster && window.kalenderTodoFenster('Die KI wählt das Wichtigste aus …');
        if (!w) return;
        const Z = zeitraum(zeitraumKey);
        const btn = document.getElementById('ki-briefing-todo');
        if (btn) { btn.disabled = true; btn.textContent = 'KI wählt aus …'; }
        try {
            const gewaehlt = await kiAuswahl(Z);
            await window.kalenderTodoDrucken(gewaehlt, gewaehlt.length ? '✨ ' + Z.label + ' — das Wichtigste' : Z.label, w);
        } catch (e) {
            try { w.document.body.innerHTML = '<p style="font-family:sans-serif;padding:20px;color:#b91c1c">ToDo-Liste fehlgeschlagen: ' + esc(e.message) + '</p>'; } catch (x) { /* Fenster zu */ }
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = '🖨 Wichtigstes als ToDo'; }
        }
    }
    async function alsTodo() {
        if (typeof window.todoUebernehmen !== 'function') { toast('To-do-Liste nicht geladen.', 'error'); return; }
        const Z = zeitraum(zeitraumKey);
        const btn = document.getElementById('ki-briefing-alstodo');
        if (btn) { btn.disabled = true; btn.textContent = 'KI wählt aus …'; }
        try {
            const gewaehlt = await kiAuswahl(Z);
            if (!gewaehlt.length) { toast('Für ' + Z.label + ' gibt es nichts zu übernehmen.'); return; }
            schliessen();
            await window.todoUebernehmen(gewaehlt);
        } catch (e) {
            toast('Übernehmen fehlgeschlagen: ' + e.message, 'error');
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = '✅ Als To-do übernehmen'; }
        }
    }

    window.kiTodoDrucken = function (key) {
        if (key && ZEITRAEUME[key]) zeitraumKey = key;
        return kiTodoDrucken();
    };

    // key: 'heute' | 'tage3' | 'woche'
    window.openKiBriefing = function (key) {
        if (key && ZEITRAEUME[key]) zeitraumKey = key;
        const el = fenster();
        document.getElementById('ki-briefing-meins').checked = nurMeins;
        segMarkieren();
        el.classList.add('show', 'active');
        document.body.style.overflow = 'hidden';
        erzeugen(false);
    };

    // Nach 10 Minuten gilt das Briefing als alt (die Daten ändern sich laufend)
    setInterval(() => cache.clear(), 10 * 60 * 1000);
})();
