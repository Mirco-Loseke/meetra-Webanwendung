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
    const kurzDatum = d => { if (!d) return ''; const x = new Date(d); return isNaN(x) ? '' : x.toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric' }); };
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
        return { text: u.text, am: kurzDatum(u.at), von: u.by || '' };
    }
    // Der nächste offene Schritt samt Fälligkeit und Zuständigem — das ist auf
    // dem Blatt die wichtigste Zeile („was muss jetzt passieren?").
    function naechsterSchritt(p) {
        const offen = Array.isArray(p && p.steps) ? p.steps.filter(x => x && !x.done && (x.text || '').trim()) : [];
        if (!offen.length) return null;
        const s = offen[0];
        const ich = (window.activeUser && window.activeUser.name) || '';
        return { text: s.text, faellig: kurzDatum(s.remind_at), wer: s.assigned_to && s.assigned_to !== ich ? s.assigned_to : '' };
    }
    // „seit 3 T" / „heute" / „in 2 T" aus dem Tag des Eintrags
    function abstand(tag) {
        if (!tag) return null;
        const d = new Date(String(tag).slice(0, 10) + 'T00:00:00');
        if (isNaN(d)) return null;
        const h = new Date(); h.setHours(0, 0, 0, 0);
        const t = Math.round((d - h) / 864e5);
        if (t === 0) return { text: 'heute', art: 'heute' };
        if (t < 0) return { text: 'seit ' + (-t) + ' T', art: 'ueber' };
        return { text: 'in ' + t + ' T', art: 'bald' };
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
            k.mobile ? '📱 ' + esc(k.mobile) : '', k.email && !k.phone && !k.mobile ? '✉ ' + esc(k.email) : ''].filter(Boolean).join(' · ');
        return `<div class="adresse"><div class="zeile1">${z1}</div>${z2 ? `<div class="zeile1">${z2}</div>` : ''}</div>`;
    }

    // Ein Eintrag = zwei bis fünf Zeilen links, Notizfeld rechts:
    // Kopf (Nr., Kästchen, Art, Titel, Fälligkeit) → Adresse/Telefon →
    // NÄCHSTER SCHRITT (fett, eigenes Kästchen) → letzter Stand (eine Zeile) → Notiz.
    function eintragHtml(x, nr) {
        const e = x.e;
        const p = x.vorgang;
        const stand = letzterStand(p);
        const schritt = naechsterSchritt(p);
        const ab = abstand(e.day);
        const info = [];
        if (schritt) {
            const zusatz = [schritt.faellig ? 'bis ' + schritt.faellig : '', schritt.wer ? esc(schritt.wer) : ''].filter(Boolean).join(' · ');
            info.push(`<div class="schritt"><span class="box klein"></span><span class="lbl">Nächster Schritt:</span> <b>${esc(schritt.text)}</b>${zusatz ? ` <span class="grau">(${zusatz})</span>` : ''}</div>`);
        }
        if (p && x.vorgangFremd) info.push(`<div class="zeile1"><span class="lbl">Offener Vorgang:</span> ${esc(p.title || '')}</div>`);
        if (stand) info.push(`<div class="zeile1"><span class="lbl">Stand${stand.am ? ' ' + esc(stand.am) : ''}${stand.von ? ' (' + esc(stand.von) + ')' : ''}:</span> ${esc(stand.text)}</div>`);
        if (e.note) info.push(`<div class="zeile1"><span class="lbl">Notiz:</span> ${esc(e.note)}</div>`);
        const kopfSub = e.subject && !(x.kunde && e.subject === x.kunde.name) ? ` <span class="sub">— ${esc(e.subject)}</span>` : '';
        // Rechts im Kopf: wann (überfällig fett), darunter klein der Grund
        const wann = ab ? `<span class="wann ${ab.art}">${esc(ab.text)}</span>` : (e.time ? `<span class="wann">${esc(e.time)}</span>` : '');
        // Links der Inhalt, rechts das Notizfeld — so kostet der Platz für
        // Notizen keine zusätzliche Höhe, das Feld wächst mit dem Eintrag.
        return `
        <div class="eintrag${e.done ? ' erledigt' : ''}">
            <div class="inhalt">
                <div class="kopf">
                    <span class="nr">${nr}</span>
                    <span class="box">${e.done ? '✓' : ''}</span>
                    <span class="art">${esc(e.typLabel || '')}</span>
                    <span class="titel">${esc(e.title)}${kopfSub}</span>
                    ${wann}
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
        // Durchlaufende Nummer — damit man sich am Telefon oder in der Notiz
        // auf „Nr. 12" beziehen kann.
        let nr = 0;
        const rumpf = tage.length
            ? tage.map(t => `<h2>${esc(t.text || '')} <span class="anzahl">${t.liste.length}</span></h2>${t.liste.map(x => eintragHtml(x, ++nr)).join('')}`).join('')
            : '<p class="grau">Keine Einträge in diesem Zeitraum (Filter im Kalender beachten).</p>';
        const ueber = daten.filter(x => { const ab = abstand(x.e.day); return ab && ab.art === 'ueber'; }).length;
        const zusammen = `${daten.length} ${daten.length === 1 ? 'Eintrag' : 'Einträge'}${ueber ? ` · <b>${ueber} überfällig</b>` : ''}`;
        return `<!doctype html><html lang="de"><head><meta charset="utf-8">
<title>ToDo ${esc(titel)}</title>
<style>
  /* Kompakt für viele Einträge: ~15–18 je A4-Seite (30 Vorgänge ≈ 2 Blatt).
     Einträge werden nie zerteilt, Überschriften bleiben beim ersten Eintrag. */
  @page { size: A4; margin: 8mm 8mm 10mm;
          @bottom-right { content: "Seite " counter(page) " / " counter(pages); font: 7pt 'Segoe UI', Arial, sans-serif; color: #666; } }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 8pt; line-height: 1.2; color: #111; margin: 0; background: #fff; }
  header { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; border-bottom: 1.5px solid #111; padding-bottom: 2px; margin-bottom: 2px; }
  header h1 { font-size: 12pt; margin: 0; }
  header .meta { font-size: 7.5pt; color: #555; text-align: right; }
  header .meta b { color: #b91c1c; }
  .legende { font-size: 6.8pt; color: #666; margin: 0 0 2px; }
  h2 { font-size: 8.6pt; margin: 5px 0 0; padding: 1.5px 5px; background: #e6e6e6; break-after: avoid; page-break-after: avoid;
       -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  h2 .anzahl { font-weight: normal; color: #555; }
  .eintrag { display: grid; grid-template-columns: 1fr 33%; border: 1px solid #999; border-top: none; break-inside: avoid; page-break-inside: avoid; }
  h2 + .eintrag { border-top: 1px solid #999; }
  .eintrag.erledigt .inhalt { color: #888; text-decoration: line-through; }
  .inhalt { padding: 2px 6px 2.5px 4px; min-width: 0; }
  .kopf { display: flex; align-items: baseline; gap: 4px; font-weight: 700; }
  .nr { font-size: 6.8pt; color: #777; font-weight: 600; min-width: 13px; text-align: right; flex: none; }
  /* Abhak-Kästchen: groß genug für einen Stift-Haken */
  .box { width: 3.4mm; height: 3.4mm; border: 1.4px solid #111; display: inline-flex; align-items: center; justify-content: center; font-size: 7pt; flex: none; align-self: center; border-radius: 1px; }
  .box.klein { width: 2.6mm; height: 2.6mm; border-width: 1.1px; margin-right: 3px; vertical-align: -1px; display: inline-block; }
  .art { font-size: 6.2pt; text-transform: uppercase; letter-spacing: .03em; border: 1px solid #999; padding: 0 2px; color: #444; flex: none; }
  .titel { font-size: 8.8pt; flex: 1 1 auto; min-width: 0; }
  .titel .sub { font-weight: 600; color: #444; }
  .wann { flex: none; font-size: 7.4pt; font-weight: 700; color: #333; white-space: nowrap; }
  .wann.ueber { color: #b91c1c; }
  .wann.heute { text-decoration: underline; }
  .adresse, .info { margin-left: 22px; }
  .adresse { color: #222; }
  .schritt { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .zeile1 { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; color: #333; }
  .lbl { color: #555; font-weight: 600; }
  .grau { color: #666; font-weight: normal; }
  /* Notizfeld rechts: Linien im 4,25-mm-Takt, mindestens drei Zeilen hoch */
  .notiz { border-left: 1px solid #999; min-height: 12.8mm;
           background: repeating-linear-gradient(to bottom, transparent 0, transparent calc(4.25mm - 1px), #c8c8c8 calc(4.25mm - 1px), #c8c8c8 4.25mm);
           -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .knopf { position: fixed; top: 10px; right: 10px; padding: 8px 14px; font-size: 11pt; cursor: pointer; }
  @media print { .knopf { display: none; } }
</style></head><body>
<button class="knopf" onclick="window.print()">Drucken</button>
<header><h1>ToDo · ${esc(titel)}</h1><span class="meta">${zusammen}<br>${esc(wer)}${wer ? ' · ' : ''}erstellt ${jetzt.toLocaleDateString('de-DE')} ${jetzt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</span></header>
<div class="legende">☐ groß = Eintrag erledigt · ☐ klein = nächster Schritt erledigt · rechts Platz für Notizen</div>
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
