/* vorgaenge-druck.js — Vorgänge-Ansicht: aktuelle Liste drucken (Layout wie der ToDo-Druck).
 * Liest den Stand, den renderProcesses in window._procDruck ablegt (gefilterte, sortierte Liste
 * samt gesetzten Filtern). Erledigtes wird nicht gedruckt.
 * Gliederung: Übergruppe „Dir zugewiesen“ → „Meine Vorgänge“ → „Weitere Vorgänge“,
 * darin je „Heute unbedingt“ / „Wichtig (7 Tage)“ / „Später / ohne Termin“.
 * Je Eintrag: Kürzel Ersteller → Zuständige, Adresse + Ansprechpartner, Fälligkeit rechts. */
(function () {
    'use strict';

    const esc = s => (s == null ? '' : String(s)).replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const kurz = d => { const x = d ? new Date(d) : null; return x && !isNaN(x) ? x.toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric' }) : ''; };
    const STATUS = { all: 'Alle Status', offen: 'Offen', in_bearbeitung: 'In Arbeit', erledigt: 'Erledigt', stale: 'Länger als 7 Tage offen' };

    function kuerzel(u) { return u ? (u.initials || String(u.name || '?').substring(0, 2).toUpperCase()) : ''; }
    function userZu(wert) { return (window.userList || []).find(u => window.istPerson(wert, u)); }
    const tag0 = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

    // Frühester offener Termin: Vorgangs-Erinnerung oder Schritt-Erinnerung
    function faellig(p) {
        const t = [];
        if (p.remind_at) t.push(p.remind_at);
        (Array.isArray(p.steps) ? p.steps : []).forEach(s => { if (s && !s.done && s.remind_at) t.push(s.remind_at); });
        const ok = t.map(v => new Date(v)).filter(d => !isNaN(d)).sort((a, b) => a - b);
        return ok.length ? ok[0] : null;
    }
    function abstand(d) {
        if (!d) return null;
        const t = Math.round((tag0(d) - tag0(new Date())) / 864e5);
        if (t === 0) return { text: 'heute', art: 'heute', t };
        if (t < 0) return { text: 'seit ' + (-t) + ' T', art: 'ueber', t };
        return { text: 'in ' + t + ' T', art: 'bald', t };
    }
    function stufe(p) {
        const ab = abstand(faellig(p));
        if (ab && ab.t <= 0) return 0;
        if (ab && ab.t <= 7) return 1;
        return 2;
    }
    const STUFEN = ['Heute unbedingt (fällig / überfällig)', 'Wichtig (in den nächsten 7 Tagen)', 'Später / ohne Termin'];

    async function holen(tabelle, spalten, feld, ids) {
        if (!ids.length) return [];
        try {
            const { data, error } = await window.supabaseClient.from(tabelle).select(spalten).in(feld, ids);
            if (error) { console.warn('Vorgänge-Druck:', tabelle, error.message); return []; }
            return data || [];
        } catch (e) { return []; }
    }

    function adresseHtml(k, ap) {
        if (!k) return '';
        const ort = [k.zip_code, k.city].filter(Boolean).join(' ');
        const z1 = [`<b>${esc(k.name || '')}</b>`, [k.street, ort].filter(Boolean).map(esc).join(', ')].filter(Boolean).join(' · ');
        const zentrale = [k.phone ? '☎ ' + esc(k.phone) : '', k.mobile ? '📱 ' + esc(k.mobile) : '', k.email ? '✉ ' + esc(k.email) : ''].filter(Boolean).join(' · ');
        const apTel = ap ? (ap.phone || ap.mobile) : '';
        const z2 = ap ? ['AP: ' + esc(ap.name || ''), ap.position ? '(' + esc(ap.position) + ')' : '', apTel ? '☎ ' + esc(apTel) : '', ap.email ? '✉ ' + esc(ap.email) : ''].filter(Boolean).join(' ') : '';
        return `<div class="adresse"><div class="z">${z1}</div>${zentrale ? `<div class="z">${zentrale}</div>` : ''}${z2 ? `<div class="z">${z2}</div>` : ''}</div>`;
    }

    function eintragHtml(x, nr) {
        const p = x.p;
        const ers = window.procErsteller(p);
        const zust = [];
        (window.procZustaendige(p) || []).forEach(w => { const u = userZu(w); if (u && !zust.includes(kuerzel(u))) zust.push(kuerzel(u)); });
        const wer = (ers ? '<b>' + esc(kuerzel(ers)) + '</b> → ' : '') + (zust.length ? esc(zust.join(', ')) : '<span class="grau">niemand</span>');
        const sch = (Array.isArray(p.steps) ? p.steps : []).filter(s => s && !s.done && (s.text || '').trim())[0];
        const schZu = sch ? (userZu(sch.assigned_id) || userZu(sch.assigned_to)) : null;
        const schZusatz = sch ? [sch.remind_at ? 'bis ' + kurz(sch.remind_at) : '', schZu ? kuerzel(schZu) : (sch.assigned_to || '')].filter(Boolean).map(esc).join(' · ') : '';
        const stand = (Array.isArray(p.status_updates) ? p.status_updates : []).filter(u => u && u.text).sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')))[0];
        const ab = abstand(faellig(p));
        const wann = ab ? `<span class="wann ${ab.art}">${esc(ab.text)}</span>` : '';
        const zl = window.procZuletzt ? window.procZuletzt(p) : null;
        const info = [];
        if (sch) info.push(`<div class="z schritt"><span class="box klein"></span><span class="lbl">Nächster Schritt:</span> <b>${esc(sch.text)}</b>${schZusatz ? ` <span class="grau">(${schZusatz})</span>` : ''}</div>`);
        if (stand) info.push(`<div class="z"><span class="lbl">Stand ${esc(kurz(stand.at))}${stand.by ? ' (' + esc(stand.by) + ')' : ''}:</span> ${esc(stand.text)}</div>`);
        if (zl) info.push(`<div class="z grau">Zuletzt bearbeitet: ${esc(zl.toLocaleDateString('de-DE'))}</div>`);
        return `<div class="eintrag"><div class="inhalt">
            <div class="kopf"><span class="nr">${nr}</span><span class="box"></span><span class="art">Vorgang</span><span class="wer">${wer}</span>
                <span class="titel">${esc(p.title || 'Vorgang')}</span>${wann}</div>
            ${adresseHtml(x.kunde, x.ap)}
            ${info.length ? `<div class="info">${info.join('')}</div>` : ''}
        </div><div class="notiz"></div></div>`;
    }

    const CSS = `
  @page { size: A4; margin: 8mm 8mm 10mm; @bottom-right { content: "Seite " counter(page) " / " counter(pages); font: 7pt 'Segoe UI', Arial, sans-serif; color: #666; } }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 8pt; line-height: 1.2; color: #111; margin: 0; background: #fff; }
  header { border-bottom: 2px solid #111; padding-bottom: 4px; margin-bottom: 3px; }
  header h1 { font-size: 17pt; margin: 0; }
  header .liste { font-size: 11pt; margin: 3px 0 0; }
  header .meta { font-size: 7.5pt; color: #555; margin-top: 2px; }
  .legende { font-size: 6.8pt; color: #666; margin: 2px 0; }
  h2.uber { font-size: 14pt; font-weight: 800; margin: 10px 0 2px; padding: 2px 4px; color: #000; border: 2px solid #000; border-width: 2px 0; break-after: avoid; page-break-after: avoid; }
  h3.stufe { font-size: 8.6pt; margin: 5px 0 0; padding: 1.5px 5px; background: #e6e6e6; break-after: avoid; page-break-after: avoid; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  h2 .anzahl, h3 .anzahl { font-weight: normal; opacity: .75; }
  .eintrag { display: grid; grid-template-columns: 1fr 33%; border: 1px solid #999; border-top: none; break-inside: avoid; page-break-inside: avoid; }
  h3.stufe + .eintrag { border-top: 1px solid #999; }
  .inhalt { padding: 2px 6px 2.5px 4px; min-width: 0; }
  .kopf { display: flex; align-items: baseline; gap: 4px; font-weight: 700; }
  .nr { font-size: 6.8pt; color: #777; font-weight: 600; min-width: 13px; text-align: right; flex: none; }
  .box { width: 3.4mm; height: 3.4mm; border: 1.4px solid #111; display: inline-flex; flex: none; align-self: center; border-radius: 1px; }
  .box.klein { width: 2.6mm; height: 2.6mm; border-width: 1.1px; margin-right: 3px; vertical-align: -1px; display: inline-block; }
  .art { font-size: 6.2pt; text-transform: uppercase; letter-spacing: .03em; border: 1px solid #999; padding: 0 2px; color: #444; flex: none; }
  .wer { font-size: 7.4pt; border: 1px solid #555; padding: 0 3px; border-radius: 2px; flex: none; white-space: nowrap; }
  .titel { font-size: 8.8pt; flex: 1 1 auto; min-width: 0; overflow-wrap: anywhere; }
  .wann { flex: none; font-size: 7.6pt; font-weight: 700; color: #333; white-space: nowrap; }
  .wann.ueber { color: #b91c1c; }
  .wann.heute { text-decoration: underline; }
  .adresse, .info { margin-left: 22px; }
  .z { color: #222; overflow-wrap: anywhere; }
  .lbl { color: #555; font-weight: 600; }
  .grau { color: #777; font-weight: normal; }
  .notiz { border-left: 1px solid #999; min-height: 12.8mm; background: repeating-linear-gradient(to bottom, transparent 0, transparent calc(4.25mm - 1px), #c8c8c8 calc(4.25mm - 1px), #c8c8c8 4.25mm); -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .knopf { position: fixed; top: 10px; right: 10px; padding: 8px 14px; font-size: 11pt; cursor: pointer; }
  @media print { .knopf { display: none; } }`;

    window.vorgaengeDrucken = async function () {
        const d = window._procDruck;
        if (!d || !Array.isArray(d.liste)) { if (window.showToast) window.showToast('Die Liste ist noch nicht geladen.'); return; }
        const w = window.open('', '_blank');
        if (!w) { if (window.showToast) window.showToast('Das Druckfenster wurde blockiert — Popups für diese Seite erlauben.'); return; }
        w.document.write('<!doctype html><meta charset="utf-8"><title>Vorgänge</title><p style="font-family:sans-serif;padding:20px">Liste wird vorbereitet …</p>');

        const ich = window.activeUser || {};
        const offen = d.liste.filter(p => p.status !== 'erledigt');
        // Adressen + Ansprechpartner schmal nachladen
        const cids = [...new Set(offen.map(p => p.customer_id || (p.machines && p.machines.customer_id)).filter(Boolean).map(String))];
        const kunden = new Map(), kontakte = new Map();
        (await holen('customers', 'id, name, street, zip_code, city, phone, mobile, email', 'id', cids)).forEach(k => kunden.set(String(k.id), k));
        (await holen('customer_contacts', 'id, customer_id, name, position, phone, mobile, email, is_primary', 'customer_id', cids))
            .forEach(c => { const k = String(c.customer_id); if (!kontakte.has(k)) kontakte.set(k, []); kontakte.get(k).push(c); });
        const zeilen = offen.map(p => {
            const cid = String(p.customer_id || (p.machines && p.machines.customer_id) || '');
            const liste = kontakte.get(cid) || [];
            const wunsch = String(p.contact_name || '').toLowerCase().trim();
            const ap = liste.find(c => wunsch && String(c.name || '').toLowerCase().trim() === wunsch) || liste.find(c => c.is_primary) || liste[0] || null;
            return { p, kunde: kunden.get(cid) || (p.customers ? { name: p.customers.name } : null), ap };
        });

        const gruppen = [
            { titel: 'Dir zugewiesen', hinweis: 'von anderen an dich vergeben', immer: true, test: x => window.procFremdZugewiesen(x.p, ich) },
            { titel: 'Meine Vorgänge', hinweis: 'selbst angelegt / selbst zuständig', immer: true, test: x => window.procHatUser(x.p, ich) },
            { titel: 'Weitere Vorgänge', hinweis: '', test: () => true }
        ];
        let rest = zeilen.slice(), nr = 0, rumpf = '';
        gruppen.forEach(g => {
            const mit = rest.filter(g.test);
            rest = rest.filter(x => !mit.includes(x));
            if (!mit.length && !g.immer) return;
            rumpf += `<h2 class="uber">${esc(g.titel)} <span class="anzahl">${mit.length}${g.hinweis ? ' · ' + esc(g.hinweis) : ''}</span></h2>`;
            if (!mit.length) rumpf += '<p class="grau" style="margin:2px 0 4px 6px">Keine offenen Einträge.</p>';
            STUFEN.forEach((name, s) => {
                const teil = mit.filter(x => stufe(x.p) === s)
                    .sort((a, b) => (faellig(a.p) || new Date(8.64e15)) - (faellig(b.p) || new Date(8.64e15)));
                if (!teil.length) return;
                rumpf += `<h3 class="stufe">${esc(name)} <span class="anzahl">${teil.length}</span></h3>` + teil.map(x => eintragHtml(x, ++nr)).join('');
            });
        });

        const wer = ich.name || '';
        const jetzt = new Date();
        const filter = [
            'Liste: <b>' + (d.zust === 'me' ? 'Dir zugewiesen' : (d.meine ? 'Meine Vorgänge' : 'Alle Vorgänge')) + '</b>',
            'Status: <b>' + esc(STATUS[d.status] || 'Alle Status') + '</b>',
            d.suche ? 'Suche: <b>„' + esc(d.suche) + '“</b>' : ''
        ].filter(Boolean).join(' &nbsp;·&nbsp; ');
        const keinFilter = !d.meine && !d.zust && d.status === 'all' && !d.suche;
        const html = '<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Vorgänge</title><style>' + CSS + '</style></head><body>' +
            '<button class="knopf" onclick="window.print()">Drucken</button>' +
            '<header><h1>Vorgänge</h1><div class="liste">' + (keinFilter ? '<b>Kein Filter</b> — alle offenen Vorgänge' : filter) + '</div>' +
            '<div class="meta">' + zeilen.length + (zeilen.length === 1 ? ' offener Vorgang' : ' offene Vorgänge') + ' (Erledigtes wird nicht gedruckt) · ' + esc(wer) + (wer ? ' · ' : '') +
            'erstellt ' + jetzt.toLocaleDateString('de-DE') + ' ' + jetzt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + '</div>' +
            '<div class="legende">Kürzel „RT → JM“ = erstellt von RT, zuständig JM · ☐ groß = Vorgang erledigt · ☐ klein = nächster Schritt erledigt · rechts Platz für Notizen</div></header>' +
            (rumpf || '<p class="grau">Keine offenen Vorgänge in dieser Liste.</p>') + '</body></html>';
        w.document.open();
        w.document.write(html);
        w.document.close();
        w.focus();
        setTimeout(() => { try { w.print(); } catch (e) { /* Knopf im Fenster bleibt */ } }, 300);
    };
})();
