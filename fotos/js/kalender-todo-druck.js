// ==========================================================
// Kalender → ToDo-Liste drucken
// ==========================================================
// Aufruf aus js/calendar-widget.js (Drucker-Knopf) mit den gerade gelisteten
// Einträgen (Tag, per Umschalt+Klick gewählter Zeitraum oder Monat).
// Je Eintrag: Art, Titel, Adresse mit Telefon/Mail, letzter Stand und
// nächster offener Schritt des Vorgangs, dazu Linien für Notizen.
// Die Seite öffnet sich in einem eigenen Fenster und startet den Druckdialog.
// Das Fenster wird SOFORT beim Klick geöffnet (sonst blockt der Browser es
// als Popup), die Daten werden danach nachgeladen.
// ==========================================================
(function () {
    'use strict';

    const esc = s => (s == null ? '' : String(s)).replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const sb = () => window.supabaseClient;
    const datum = d => { if (!d) return ''; const x = new Date(d); return isNaN(x) ? '' : x.toLocaleDateString('de-DE'); };
    const idNach = (e, typ) => e.targetType === typ && e.targetId != null ? String(e.targetId) : null;
    const einmal = a => [...new Set(a.filter(Boolean).map(String))];

    async function holen(tabelle, spalten, feld, ids) {
        if (!ids.length) return [];
        try {
            const { data, error } = await sb().from(tabelle).select(spalten).in(feld, ids);
            if (error) { console.warn('ToDo-Druck:', tabelle, error.message); return []; }
            return data || [];
        } catch (e) { return []; }
    }

    function letzterStand(p) {
        const l = Array.isArray(p && p.status_updates) ? p.status_updates.filter(u => u && u.text) : [];
        if (!l.length) return null;
        const u = l.slice().sort((a, b) => String(a.at || '').localeCompare(String(b.at || ''))).pop();
        return { text: u.text, am: datum(u.at), von: u.by || '' };
    }
    function naechsterSchritt(p) {
        const s = Array.isArray(p && p.steps) ? p.steps.find(x => x && !x.done && (x.text || '').trim()) : null;
        return s ? s.text : null;
    }

    async function anreichern(eintraege) {
        const procIds = einmal(eintraege.map(e => idNach(e, 'process')));
        const servIds = einmal(eintraege.map(e => idNach(e, 'service')));
        const angIds = einmal(eintraege.map(e => idNach(e, 'angebot')));

        const [procs, servs, angs] = await Promise.all([
            holen('internal_processes', '*', 'id', procIds),
            holen('service_entries', 'id, customer_id', 'id', servIds),
            holen('angebote', 'id, customer_id, process_id', 'id', angIds)
        ]);
        const procById = new Map(procs.map(p => [String(p.id), p]));
        const servById = new Map(servs.map(s => [String(s.id), s]));
        const angById = new Map(angs.map(a => [String(a.id), a]));

        // Angebote hängen an einem Vorgang — den gleich mitladen.
        const angProcIds = einmal(angs.map(a => a.process_id)).filter(id => !procById.has(id));
        (await holen('internal_processes', '*', 'id', angProcIds)).forEach(p => procById.set(String(p.id), p));

        const kundeVon = e => {
            if (e.customerId) return String(e.customerId);
            const p = procById.get(idNach(e, 'process') || '');
            if (p && p.customer_id) return String(p.customer_id);
            const s = servById.get(idNach(e, 'service') || '');
            if (s && s.customer_id) return String(s.customer_id);
            const a = angById.get(idNach(e, 'angebot') || '');
            if (a && a.customer_id) return String(a.customer_id);
            if (e.targetType === 'machine' && window.machineById) {
                const m = window.machineById(e.targetId);
                if (m && m.customer_id) return String(m.customer_id);
            }
            return null;
        };
        const kundenIds = einmal(eintraege.map(kundeVon));
        const [kunden, offeneVorgaenge] = await Promise.all([
            holen('customers', '*', 'id', kundenIds),
            holen('internal_processes', '*', 'customer_id', kundenIds)
        ]);
        const kundeById = new Map(kunden.map(k => [String(k.id), k]));
        // Je Adresse der zuletzt angelegte, noch offene Vorgang.
        const vorgangJeKunde = new Map();
        offeneVorgaenge
            .filter(p => p.status !== 'erledigt')
            .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
            .forEach(p => { const k = String(p.customer_id); if (!vorgangJeKunde.has(k)) vorgangJeKunde.set(k, p); });

        return eintraege.map(e => {
            const kid = kundeVon(e);
            const angebot = angById.get(idNach(e, 'angebot') || '');
            const eigenerVorgang = procById.get(idNach(e, 'process') || '')
                || (angebot && angebot.process_id ? procById.get(String(angebot.process_id)) : null);
            const vorgang = eigenerVorgang || (kid ? vorgangJeKunde.get(kid) : null) || null;
            return {
                e,
                kunde: kid ? kundeById.get(kid) || null : null,
                vorgang,
                vorgangFremd: !!vorgang && !eigenerVorgang,
                ansprechpartner: vorgang && vorgang.contact_name ? vorgang.contact_name : ''
            };
        });
    }

    function adresseHtml(k, ansprechpartner) {
        if (!k) return '';
        const ort = [k.zip_code, k.city].filter(Boolean).join(' ');
        // Platzsparend: Name + Anschrift in einer Zeile, Kontakt in der zweiten.
        const z1 = [`<b>${esc(k.name || k.matchcode || '')}</b>${k.customer_number ? ` <span class="grau">(${esc(k.customer_number)})</span>` : ''}`,
            [k.street, ort].filter(Boolean).map(esc).join(', ')].filter(Boolean).join(' · ');
        const z2 = [ansprechpartner ? 'AP: ' + esc(ansprechpartner) : '', k.phone ? '☎ ' + esc(k.phone) : '',
            k.mobile ? '📱 ' + esc(k.mobile) : '', k.email ? '✉ ' + esc(k.email) : ''].filter(Boolean).join(' · ');
        return `<div class="adresse">${z1}${z2 ? '<br>' + z2 : ''}</div>`;
    }

    function eintragHtml(x) {
        const e = x.e;
        const p = x.vorgang;
        const stand = letzterStand(p);
        const schritt = naechsterSchritt(p);
        const info = [];
        if (e.ki) info.push(`<div><span class="lbl">✨ Warum:</span> ${esc(e.ki)}</div>`);
        if (p && x.vorgangFremd) info.push(`<div><span class="lbl">Offener Vorgang:</span> ${esc(p.title || '')}</div>`);
        if (stand) info.push(`<div><span class="lbl">Letzter Stand${stand.am ? ' (' + esc(stand.am) + (stand.von ? ', ' + esc(stand.von) : '') + ')' : ''}:</span> ${esc(stand.text)}</div>`);
        if (schritt) info.push(`<div><span class="lbl">Nächster Schritt:</span> ${esc(schritt)}</div>`);
        if (e.note) info.push(`<div><span class="lbl">Notiz:</span> ${esc(e.note)}</div>`);
        const kopfSub = e.subject && !(x.kunde && e.subject === x.kunde.name) ? ` — ${esc(e.subject)}` : '';
        // Links der Inhalt, rechts das Notizfeld — so kostet der Platz für
        // Notizen keine zusätzliche Höhe, das Feld wächst mit dem Eintrag.
        return `
        <div class="eintrag${e.done ? ' erledigt' : ''}">
            <div class="inhalt">
                <div class="kopf">
                    <span class="box">${e.done ? '✓' : ''}</span>
                    <span class="art">${esc(e.typLabel || '')}</span>
                    ${e.gruppe && e.datumText ? `<span class="zeit">${esc(e.datumText)}</span>` : ''}
                    ${e.time ? `<span class="zeit">${esc(e.time)}</span>` : ''}
                    <span class="titel">${esc(e.title)}${kopfSub}</span>
                </div>
                ${adresseHtml(x.kunde, x.ansprechpartner)}
                ${info.length ? `<div class="info">${info.join('')}</div>` : ''}
            </div>
            <div class="notiz"></div>
        </div>`;
    }

    function seiteHtml(titel, daten) {
        const wer = (window.activeUser && window.activeUser.name) || '';
        const jetzt = new Date();
        const tage = [];
        daten.forEach(x => {
            // Gruppiert nach Tag — oder nach e.gruppe (KI-Priorität), wenn gesetzt.
            const g = x.e.gruppe || x.e.day;
            let t = tage.find(y => y.day === g);
            if (!t) tage.push(t = { day: g, text: x.e.gruppe || x.e.datumText, liste: [] });
            t.liste.push(x);
        });
        const rumpf = tage.length
            ? tage.map(t => `<h2>${esc(t.text)}</h2>${t.liste.map(eintragHtml).join('')}`).join('')
            : '<p class="grau">Keine Einträge in diesem Zeitraum (Filter im Kalender beachten).</p>';
        return `<!doctype html><html lang="de"><head><meta charset="utf-8">
<title>ToDo ${esc(titel)}</title>
<style>
  /* Kompakt für viele Einträge: ~11–13 je A4-Seite. Einträge werden nie
     zerteilt, Tagesüberschriften bleiben beim ersten Eintrag. */
  @page { size: A4; margin: 9mm 9mm 10mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 8.4pt; line-height: 1.28; color: #111; margin: 0; background: #fff; }
  header { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 1.5px solid #111; padding-bottom: 2px; margin-bottom: 3px; }
  header h1 { font-size: 12pt; margin: 0; }
  header .meta { font-size: 7.5pt; color: #555; }
  h2 { font-size: 9pt; margin: 6px 0 0; padding: 2px 5px; background: #e6e6e6; break-after: avoid; page-break-after: avoid; }
  .eintrag { display: grid; grid-template-columns: 1fr 36%; border: 1px solid #999; border-top: none; break-inside: avoid; page-break-inside: avoid; }
  h2 + .eintrag { border-top: 1px solid #999; }
  .eintrag.erledigt .inhalt { color: #888; text-decoration: line-through; }
  .inhalt { padding: 3px 6px 3px 5px; min-width: 0; }
  .kopf { display: flex; align-items: baseline; gap: 5px; font-weight: 700; }
  .box { width: 10px; height: 10px; border: 1.3px solid #111; display: inline-flex; align-items: center; justify-content: center; font-size: 7pt; flex: none; align-self: center; }
  .art { font-size: 6.5pt; text-transform: uppercase; letter-spacing: .03em; border: 1px solid #999; padding: 0 3px; color: #444; flex: none; }
  .zeit { flex: none; }
  .titel { font-size: 9pt; }
  .adresse, .info { margin-left: 15px; }
  .info div { overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
  .lbl { color: #555; font-weight: 600; }
  .grau { color: #666; font-weight: normal; }
  /* Notizfeld rechts: Linien im 5,5-mm-Takt, mindestens drei Zeilen hoch */
  .notiz { border-left: 1px solid #999; min-height: 17mm;
           background: repeating-linear-gradient(to bottom, transparent 0, transparent calc(5.5mm - 1px), #c4c4c4 calc(5.5mm - 1px), #c4c4c4 5.5mm);
           -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .knopf { position: fixed; top: 10px; right: 10px; padding: 8px 14px; font-size: 11pt; cursor: pointer; }
  @media print { .knopf { display: none; } }
</style></head><body>
<button class="knopf" onclick="window.print()">Drucken</button>
<header><h1>ToDo · ${esc(titel)}</h1><span class="meta">${esc(wer)}${wer ? ' · ' : ''}erstellt ${jetzt.toLocaleDateString('de-DE')} ${jetzt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</span></header>
${rumpf}
</body></html>`;
    }

    // Fenster muss im Klick selbst aufgehen (Popup-Sperre) — wer vorher noch
    // länger rechnet (KI), öffnet es damit zuerst und reicht es weiter.
    window.kalenderTodoFenster = function (text) {
        const w = window.open('', '_blank');
        if (!w) { window.showToast && window.showToast('Das Druckfenster wurde vom Browser blockiert — Popups für diese Seite erlauben.'); return null; }
        w.document.write('<!doctype html><meta charset="utf-8"><title>ToDo</title><p style="font-family:sans-serif;padding:20px">' + esc(text || 'ToDo-Liste wird vorbereitet …') + '</p>');
        return w;
    };

    window.kalenderTodoDrucken = async function (eintraege, titel, fenster) {
        const w = fenster || window.kalenderTodoFenster();
        if (!w) return;
        let daten;
        // Erledigtes gehört nicht auf eine ToDo-Liste.
        const offen = (eintraege || []).filter(e => !e.done);
        try {
            daten = await anreichern(offen);
        } catch (err) {
            console.warn('ToDo-Druck: Anreichern fehlgeschlagen', err);
            daten = offen.map(e => ({ e, kunde: null, vorgang: null }));
        }
        w.document.open();
        w.document.write(seiteHtml(titel, daten));
        w.document.close();
        w.focus();
        setTimeout(() => { try { w.print(); } catch (e) { /* Knopf im Fenster bleibt */ } }, 300);
    };
})();
