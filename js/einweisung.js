/* einweisung.js — Einweisungserklärung / Übergabeprotokoll zu einer Maschine
 *
 *   window.openEinweisung(machineId)         vorhandene zeigen (Liste), sonst gleich ein neues Formular
 *   window.openEinweisung(machineId, 'neu')  neues Formular
 *   window.openEinweisung(machineId, docId)  vorhandene bearbeiten
 *
 * Aufbau nach der Vorlage „meetra VORLAGE Übergabe Protokoll“: Empfänger-Anschrift, Maschinendaten
 * (Bezeichnung, Typ, Maschinennummer, Motor, Betriebsstunden, lose beigelegt, Zustand, Sonstiges),
 * Einweisung (durch wen, wer, welche Punkte), Hinweis, Bestätigungstext, Ort/Datum und zwei Unterschriften.
 * Maschinendaten und Anschrift kommen aus der Maschine, alles bleibt bearbeitbar; steht die Maschine
 * in der Werkstatt, wird die Anschrift über das Adressbuch gesucht (customerCacheSearch).
 * Gespeichert wird ein PDF (jsPDF, Briefbogen) nach R2 `<Maschinenordner>/uebergabeprotokolle/` und als
 * Eintrag in `documents` (Ordner/Kategorie „Übergabeprotokolle“, machine_id). Die Formulardaten selbst
 * stehen in `documents.attachments` als `{ einweisung: {...} }` (ohne url/path — die Dokumentenansicht
 * überspringt solche Einträge), damit sich eine Erklärung später wieder öffnen und ändern lässt.
 * Erscheint in der Maschinen-Zentrale unter Dokumente und im Verlauf.
 */
(function () {
    'use strict';
    const sb = () => window.supabaseClient;
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const toast = (t, art) => { if (window.showToast) window.showToast(t, art); };
    const ORDNER = 'Übergabeprotokolle';
    const HINWEIS = 'Alle Pflichten, die durch den Einsatz der Maschine erforderlich sind, gehen zu Lasten des Kunden.';
    const BESTAETIGUNG = 'Hiermit wird bestätigt, dass die Maschine in einem einwandfreien Zustand übergeben wurde. Es hat eine Einweisung in den technischen Umgang und den sicheren Einsatz der Maschine gegeben.';
    const PUNKTE = ['Bedienung und Funktionen der Maschine', 'Sicherheitseinrichtungen und Not-Aus', 'Sicherer Einsatz und Unfallverhütung',
        'Tägliche Kontrollen, Wartung und Schmierung', 'Betriebsstoffe und Tanken', 'Transport und Verladung'];
    let S = null;

    const heute = () => new Date().toISOString().slice(0, 10);
    const datumDe = iso => (iso || '').split('-').reverse().join('.');
    const sauber = t => String(t || '').trim().replace(/[^a-zA-Z0-9äöüÄÖÜß_\-]+/g, '_').replace(/^_+|_+$/g, '');
    const box = () => document.getElementById('ew-fenster');
    const q = (sel) => { const b = box(); return b ? b.querySelector(sel) : null; };
    const wert = id => { const e = q('#ew-' + id); return e ? e.value.trim() : ''; };

    function maschine(id) {
        return (window.machineById && window.machineById(id)) || (window.machineList || []).find(m => String(m.id) === String(id)) || null;
    }

    async function letzteStunden(id) {
        try {
            const { data } = await sb().from('manual_history_entries').select('content, created_at')
                .eq('machine_id', id).eq('type', 'hours').order('created_at', { ascending: false }).limit(1);
            return data && data[0] && data[0].content ? String(data[0].content).trim() : '';
        } catch (e) { return ''; }
    }

    async function dokumente(machineId) {
        const { data, error } = await sb().from('documents').select('id, name, url, file_path, created_at, attachments')
            .eq('machine_id', parseInt(machineId, 10)).eq('category', ORDNER).order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    }
    const datenVon = doc => { const a = (doc && Array.isArray(doc.attachments) ? doc.attachments : []).find(x => x && x.einweisung); return a ? a.einweisung : null; };

    // ------------------------------------------------------------ Formular
    const feld = (id, label, v, extra) => `<label class="ew-feld${extra ? ' ' + extra : ''}"><span class="form-label-caps">${esc(label)}</span>
        <input type="text" class="glass-input" id="ew-${id}" value="${esc(v)}" autocomplete="off"></label>`;

    function formHtml() {
        const D = S.daten, e = D.empf;
        return `
        <section class="ew-block">
            <h3>Empfänger / Übergabeort</h3>
            <div class="ew-suche">
                <input type="text" class="glass-input" id="ew-suche" placeholder="Adresse im Adressbuch suchen …" autocomplete="off">
                <div class="menu-panel ew-treffer" id="ew-treffer" hidden></div>
            </div>
            ${S.werkstatt && !S.edit ? '<p class="text-muted-sm">Die Maschine steht bei meetra in der Werkstatt — Empfänger bitte aus dem Adressbuch wählen.</p>' : ''}
            ${feld('name', 'Firma / Name', e.name)}
            ${feld('strasse', 'Straße', e.strasse)}
            <div class="ew-zwei">${feld('plz', 'PLZ', e.plz)}${feld('ort-adr', 'Ort', e.ort)}</div>
            ${feld('land', 'Land', e.land)}
        </section>
        <section class="ew-block">
            <h3>Maschine</h3>
            ${feld('bezeichnung', 'Bezeichnung Maschine', D.bezeichnung)}
            ${feld('typ', 'Typ', D.typ)}
            ${feld('nummer', 'Maschinennummer', D.nummer)}
            ${feld('motor', 'Motortyp / Nummer', D.motor)}
            ${feld('stunden', 'Betriebsstunden', D.stunden)}
            ${feld('beigelegt', 'Lose beigelegt', D.beigelegt)}
            <label class="ew-feld"><span class="form-label-caps">Zustand bei Übergabe / Mängel</span>
                <textarea class="glass-input" id="ew-zustand" rows="2">${esc(D.zustand)}</textarea></label>
            <label class="ew-feld"><span class="form-label-caps">Sonstiges</span>
                <textarea class="glass-input" id="ew-sonstiges" rows="3">${esc(D.sonstiges)}</textarea></label>
        </section>
        <section class="ew-block">
            <h3>Einweisung</h3>
            ${feld('durch', 'Durchgeführt von', D.durch)}
            ${feld('teilnehmer', 'Eingewiesene Person(en)', D.teilnehmer)}
            <span class="form-label-caps">Besprochen</span>
            <div class="ew-punkte">${PUNKTE.map((t, i) => `<label class="ew-punkt"><input type="checkbox" data-ew-punkt="${i}"${D.punkte[i] ? ' checked' : ''}> ${esc(t)}</label>`).join('')}</div>
        </section>
        <section class="ew-block">
            <h3>Bestätigung</h3>
            <p class="ew-hinweis">&gt; ${esc(HINWEIS)} &lt;</p>
            <p class="text-muted-sm">${esc(BESTAETIGUNG)}</p>
            <div class="ew-zwei">${feld('ort', 'Ort der Übergabe', D.ort)}
                <label class="ew-feld"><span class="form-label-caps">Tag der Übergabe</span>
                    <input type="date" class="glass-input" id="ew-datum" value="${esc(D.datum)}"></label></div>
            <label class="ew-feld"><span class="form-label-caps">Tag der Rücknahme (freiwillig, z. B. bei Miete)</span>
                <input type="date" class="glass-input" id="ew-rueckgabe" value="${esc(D.rueckgabe)}"></label>
            <div class="ew-zwei">
                <div class="ew-sig"><span class="form-label-caps">Unterschrift links</span>
                    <canvas data-ew-pad="kaeufer" width="560" height="176"></canvas>
                    <button type="button" class="knopf knopf--text knopf--klein" data-ew="leeren" data-pad="kaeufer">Neu zeichnen</button></div>
                <div class="ew-sig"><span class="form-label-caps">Unterschrift rechts</span>
                    <canvas data-ew-pad="verkaeufer" width="560" height="176"></canvas>
                    <button type="button" class="knopf knopf--text knopf--klein" data-ew="leeren" data-pad="verkaeufer">Neu zeichnen</button></div>
            </div>
        </section>`;
    }

    function overlay(inhalt, klasse) {
        const alt = box(); if (alt) alt.remove();
        const b = document.createElement('div');
        b.id = 'ew-fenster';
        b.className = 'ea-overlay ew-overlay';
        b.innerHTML = '<div class="ea-panel ew-panel ' + (klasse || '') + '" role="dialog" aria-modal="true">' + inhalt + '</div>';
        document.body.appendChild(b);
        b.addEventListener('click', klick);
        return b;
    }

    function bauen() {
        const b = overlay('<div class="fenster-kopf"><h2>Einweisungserklärung' + (S.edit ? ' bearbeiten' : '') + '</h2><button type="button" class="knopf-x" data-ew="zu" aria-label="Schließen" title="Schließen">✕</button></div>' +
            '<div class="ea-body ew-body">' + formHtml() + '</div>' +
            '<div class="fenster-fuss"><span class="ea-platz"></span>' +
            '<button type="button" class="knopf knopf--sekundaer" data-ew="zu">Abbrechen</button>' +
            '<button type="button" class="knopf knopf--sekundaer" data-ew="vorschau">Vorschau</button>' +
            '<button type="button" class="knopf knopf--primaer" data-ew="speichern">' + (S.edit ? 'Änderungen speichern' : 'Speichern') + '</button></div>');
        b.addEventListener('input', e => { if (e.target.id === 'ew-suche') suchen(e.target.value); });
        b.querySelectorAll('canvas[data-ew-pad]').forEach(zeichenfeld);
        // Gespeicherte Unterschriften wieder ins Feld setzen
        ['kaeufer', 'verkaeufer'].forEach(art => { const url = S.daten.sig && S.daten.sig[art]; if (url) bildEinsetzen(art, url); });
        S.ausgang = stand();
    }

    // Liste der vorhandenen Erklärungen dieser Maschine
    function listeZeigen(docs) {
        const zeile = d => {
            const x = datenVon(d); const wer = (x && x.empf && x.empf.name) || '';
            return `<div class="ew-listenzeile"><div><b>${esc(datumDe((x && x.datum) || String(d.created_at).slice(0, 10)))}</b>
                <small>${esc(wer || 'ohne Empfänger')}</small></div>
                <div class="ew-listeknoepfe"><button type="button" class="knopf knopf--pdf knopf--klein" data-ew="liste-pdf" data-url="${esc(d.url)}">PDF</button>
                ${x ? `<button type="button" class="knopf knopf--bearbeiten knopf--klein" data-ew="liste-bearbeiten" data-id="${esc(d.id)}">Bearbeiten</button>` : ''}</div></div>`;
        };
        overlay('<div class="fenster-kopf"><h2>Einweisungserklärungen</h2><button type="button" class="knopf-x" data-ew="zu" aria-label="Schließen" title="Schließen">✕</button></div>' +
            '<div class="ea-body ew-body"><p class="text-muted-sm">Für diese Maschine gibt es schon ' + (docs.length === 1 ? 'eine Einweisungserklärung.' : docs.length + ' Einweisungserklärungen.') + '</p>' +
            docs.map(zeile).join('') + '</div>' +
            '<div class="fenster-fuss"><span class="ea-platz"></span><button type="button" class="knopf knopf--sekundaer" data-ew="zu">Schließen</button>' +
            '<button type="button" class="knopf knopf--primaer" data-ew="liste-neu">+ Neue Einweisungserklärung</button></div>');
        S.docs = docs;
    }

    // ------------------------------------------------------------ Unterschriften
    function zeichenfeld(c) {
        const ctx = c.getContext('2d');
        ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#111';
        let malt = false;
        const pos = e => { const r = c.getBoundingClientRect(); return [(e.clientX - r.left) * c.width / r.width, (e.clientY - r.top) * c.height / r.height]; };
        c.addEventListener('pointerdown', e => { malt = true; c.setPointerCapture(e.pointerId); const [x, y] = pos(e); ctx.beginPath(); ctx.moveTo(x, y); c.dataset.leer = '0'; e.preventDefault(); });
        c.addEventListener('pointermove', e => { if (!malt) return; const [x, y] = pos(e); ctx.lineTo(x, y); ctx.stroke(); });
        ['pointerup', 'pointercancel'].forEach(ev => c.addEventListener(ev, () => { malt = false; }));
        c.dataset.leer = '1';
    }
    function bildEinsetzen(art, url) {
        const c = q('canvas[data-ew-pad="' + art + '"]'); if (!c) return;
        const img = new Image();
        img.onload = () => {
            const f = Math.min(c.width / img.width, c.height / img.height);
            const w = img.width * f, h = img.height * f;
            c.getContext('2d').drawImage(img, (c.width - w) / 2, (c.height - h) / 2, w, h);
            c.dataset.leer = '0';
        };
        img.src = url;
    }
    function unterschrift(art) {
        const c = q('canvas[data-ew-pad="' + art + '"]');
        if (!c || c.dataset.leer === '1') return null;
        return window.signaturKlein ? window.signaturKlein(c) : c.toDataURL('image/png');
    }

    // ------------------------------------------------------------ Adresssuche
    function suchen(text) {
        const t = q('#ew-treffer'); if (!t) return;
        if (!String(text).trim() || !window.customerCacheSearch) { t.hidden = true; return; }
        window.customerCacheSearch(text, 8).then(liste => {
            if (!liste || !liste.length) { t.hidden = true; return; }
            t.innerHTML = '<ul class="menu-list">' + liste.map(k => `<li data-ew="adresse" data-id="${esc(k.id)}">${esc(k.name || '')}<small> ${esc([k.street, [k.zip_code, k.city].filter(Boolean).join(' ')].filter(Boolean).join(', '))}</small></li>`).join('') + '</ul>';
            t.hidden = false;
            S.treffer = liste;
        });
    }
    function adresseWaehlen(id) {
        const k = (S.treffer || []).find(x => String(x.id) === String(id)); if (!k) return;
        const set = (f, v) => { const e = q('#ew-' + f); if (e) e.value = v || ''; };
        set('name', k.name); set('strasse', k.street); set('plz', k.zip_code); set('ort-adr', k.city); set('land', k.country);
        if (!wert('ort')) set('ort', k.city);
        S.customerId = k.id;
        const t = q('#ew-treffer'); if (t) t.hidden = true;
        const s = q('#ew-suche'); if (s) s.value = '';
    }

    // ------------------------------------------------------------ Daten ein-/auslesen
    function sammeln() {
        return {
            empf: { name: wert('name'), strasse: wert('strasse'), plz: wert('plz'), ort: wert('ort-adr'), land: wert('land'), customer_id: S.customerId || null },
            bezeichnung: wert('bezeichnung'), typ: wert('typ'), nummer: wert('nummer'), motor: wert('motor'), stunden: wert('stunden'),
            beigelegt: wert('beigelegt'), zustand: wert('zustand'), sonstiges: wert('sonstiges'), durch: wert('durch'), teilnehmer: wert('teilnehmer'),
            punkte: PUNKTE.map((t, i) => { const c = q('[data-ew-punkt="' + i + '"]'); return !!(c && c.checked); }),
            ort: wert('ort'), datum: wert('datum'), rueckgabe: wert('rueckgabe')
        };
    }
    const stand = () => JSON.stringify(sammeln());

    // ------------------------------------------------------------ PDF
    // Vorschaubild der Maschine als JPEG-Daten fürs PDF (über r2-sign, kein CORS-Problem); ohne Bild → null
    async function maschinenBild(m) {
        const url = m && m.image_url;
        if (!url) return null;
        if (S && S.bild !== undefined && S.bildUrl === url) return S.bild;
        let daten = null;
        try {
            const FS = window.FileUploadService;
            const pfad = FS && FS.r2PfadAusUrl ? FS.r2PfadAusUrl(url) : null;
            const blob = pfad ? await FS.downloadFile(pfad, { bucket: 'dateien' }) : await fetch(url).then(r => r.blob());
            const bmp = await createImageBitmap(blob);
            const f = Math.min(1, 700 / Math.max(bmp.width, bmp.height));
            const c = document.createElement('canvas'); c.width = Math.round(bmp.width * f); c.height = Math.round(bmp.height * f);
            c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
            daten = { url: c.toDataURL('image/jpeg', 0.85), b: c.width, h: c.height };
        } catch (e) { console.warn('Maschinenbild nicht ladbar:', e); }
        if (S) { S.bild = daten; S.bildUrl = url; }
        return daten;
    }

    async function pdfErzeugen(d) {
        if (typeof window.loadPDFGenerators === 'function') await window.loadPDFGenerators();
        if (typeof window.loadUnicodePdfFont === 'function') { try { await window.loadUnicodePdfFont(); } catch (e) { /* Standardschrift */ } }
        if (!window.VORLAGE_BASE64 && typeof window.ladeBriefbogen === 'function') { try { await window.ladeBriefbogen(); } catch (e) { console.warn('Briefbogen nicht ladbar:', e); } }
        const bild = await maschinenBild(S.m);
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        if (typeof window.registerUnicodeFont === 'function' && window.registerUnicodeFont(doc)) doc.setFont('helvetica', 'normal');
        const hintergrund = () => { if (window.VORLAGE_BASE64) doc.addImage(window.VORLAGE_BASE64, 'JPEG', -5, -5, 220, 307, undefined, 'FAST'); };
        hintergrund();

        const L = 20, R = 190, UNTEN = 272, SPALTE = 72;
        const e = d.empf;
        const adresse = [e.name, e.strasse, [e.plz, e.ort].filter(Boolean).join(' '), e.land].filter(Boolean);
        doc.setTextColor(0); doc.setFontSize(10);

        // Maschinenbild oben rechts (in einem Rahmen von 55 × 34 mm, rechtsbündig)
        if (bild) {
            const f = Math.min(55 / bild.b, 34 / bild.h), w = bild.b * f, h = bild.h * f;
            try { doc.addImage(bild.url, 'JPEG', R - w, 27, w, h, undefined, 'FAST'); } catch (err) { /* ohne Bild */ }
        }

        const zeilen = [['Bezeichnung Maschine:', d.bezeichnung], ['Typ:', d.typ], ['Maschinennummer:', d.nummer], ['Motortyp / Nummer:', d.motor],
            ['Betriebsstunden:', d.stunden || '-'], ['Lose beigelegt:', d.beigelegt], ['Zustand / Mängel:', d.zustand], ['Sonstiges:', d.sonstiges],
            ['Einweisung durch:', d.durch], ['Eingewiesen wurde:', d.teilnehmer]];
        const umbruch = zeilen.map(([k, v]) => doc.splitTextToSize(v || ' ', R - SPALTE).length);
        const best = doc.splitTextToSize(BESTAETIGUNG, R - L);
        const haelfte = Math.ceil(PUNKTE.length / 2);
        const titelY = Math.max(28 + adresse.length * 5.2 + 7, 58);

        // Abstände so wählen, dass alles auf EINE Seite passt (letzte Stufe: dichtester Satz)
        const MIN_ZEILEN = { 'Zustand / Mängel:': 2, 'Sonstiges:': 3 };
        const zahl = (n, i) => Math.max(MIN_ZEILEN[zeilen[i][0]] || 1, n);
        const stufen = [{ z: 8.4, c: 6.6 }, { z: 7.6, c: 6 }, { z: 7, c: 5.4 }];
        const hoehe = (st, n, i) => zahl(n, i) * st.z;
        const ende = st => titelY + 9 + umbruch.reduce((a, n, i) => a + hoehe(st, n, i), 0) + st.z + 6 + 6 + haelfte * st.c + 3 + 3 + 8 + best.length * 4.6 + 6 + 38;
        const st = stufen.find(s => ende(s) <= UNTEN) || stufen[stufen.length - 1];

        let y = 28;
        adresse.forEach(z => { doc.text(z, L, y); y += 5.2; });
        y = titelY;
        doc.setFont('helvetica', 'bold'); doc.setFontSize(18);
        doc.text('Einweisungserklärung', L, y); y += 9;
        doc.setFontSize(10);

        doc.setDrawColor(150); doc.setLineWidth(0.2);
        // Jede Zeile hat mindestens ihre Schreibzeilen (Zustand 2, Sonstiges 3); alle Linien im gleichen Abstand und gleich stark
        zeilen.forEach(([k, v], i) => {
            const teile = doc.splitTextToSize(v || ' ', R - SPALTE);
            const n = zahl(teile.length, i);
            doc.setFont('helvetica', 'bold'); doc.text(k, L, y + st.z - 2.4);
            doc.setFont('helvetica', 'normal'); teile.forEach((t, j) => doc.text(t, SPALTE, y + (j + 1) * st.z - 2.4));
            for (let j = 1; j <= n; j++) doc.line(L, y + j * st.z, R, y + j * st.z);
            y += n * st.z;
        });
        // Übergabe und Rücknahme (gleiche Zeilenhöhe wie die übrigen Zeilen)
        const zb = y + st.z - 2.4;
        doc.setFont('helvetica', 'bold'); doc.text('Übergabe am:', L, zb);
        doc.setFont('helvetica', 'normal'); doc.text(datumDe(d.datum), 47, zb);
        doc.setFont('helvetica', 'bold'); doc.text('Rücknahme am:', 110, zb);
        doc.setFont('helvetica', 'normal'); doc.text(datumDe(d.rueckgabe), 140, zb);
        doc.line(L, y + st.z, R, y + st.z);
        y += st.z;

        // Besprochene Punkte: Kästchen, abgehakt wenn besprochen (links 3, rechts 3)
        y += 6;
        doc.setFont('helvetica', 'bold'); doc.text('Inhalt der Einweisung:', L, y); y += 6;
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setLineWidth(0.3); doc.setDrawColor(0);
        PUNKTE.forEach((t, i) => {
            const x = i < haelfte ? L : L + 88, zy = y + (i % haelfte) * st.c;
            doc.rect(x, zy - 3.2, 3.6, 3.6);
            if (d.punkte[i]) { doc.line(x + 0.6, zy - 2.6, x + 3, zy - 0.2); doc.line(x + 3, zy - 2.6, x + 0.6, zy - 0.2); }
            doc.text(t, x + 6, zy);
        });
        y += haelfte * st.c + 3;

        // Hinweis, Bestätigung und Unterschriften — passt es trotz engster Stufe nicht, auf eine neue Seite
        if (y + 3 + 8 + best.length * 4.6 + 6 + 38 > UNTEN) { doc.addPage(); hintergrund(); y = 40; }
        y += 3;
        doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.text('> ' + HINWEIS + ' <', L, y + 3, { maxWidth: R - L }); y += 8;
        doc.setFontSize(9.5); doc.setFont('helvetica', 'normal'); doc.text(best, L, y + 3); y += best.length * 4.6 + 6;

        const ortDatum = [d.ort, datumDe(d.datum)].filter(Boolean).join(' ');
        const spalten = [[L, 'kaeufer', 'Unterschrift'], [115, 'verkaeufer', 'Unterschrift']];
        spalten.forEach(([x, art, text]) => {
            const sig = S.sig[art];
            doc.setFontSize(10); doc.text(ortDatum, x, y + 4);
            doc.setLineWidth(0.3); doc.setDrawColor(0); doc.line(x, y + 5.5, x + 70, y + 5.5);
            doc.setFontSize(8); doc.text('(Ort, Tag der Übergabe)', x, y + 9);
            if (sig) { try { doc.addImage(sig, 'PNG', x, y + 13, 56, 17.6); } catch (err) { /* ohne Bild */ } }
            doc.line(x, y + 32, x + 70, y + 32);
            doc.text('(' + text + ')', x, y + 35.5);
        });
        return doc;
    }

    function sigErfassen() { S.sig = { kaeufer: unterschrift('kaeufer'), verkaeufer: unterschrift('verkaeufer') }; }

    async function vorschau() {
        try {
            sigErfassen();
            const doc = await pdfErzeugen(sammeln());
            window.open(URL.createObjectURL(doc.output('blob')), '_blank');
        } catch (e) { console.error(e); toast('Vorschau fehlgeschlagen: ' + (e.message || e), 'error'); }
    }

    // ------------------------------------------------------------ Speichern
    async function ordnerId() {
        let { data: o, error } = await sb().from('document_folders').select('id').eq('name', ORDNER).maybeSingle();
        if (error) throw error;
        if (!o) {
            const r = await sb().from('document_folders').insert([{ name: ORDNER, parent_id: null, machine_id: null }]).select('id').single();
            if (r.error) throw r.error;
            o = r.data;
        }
        return o.id;
    }

    async function speichern() {
        if (S.laeuft) return;
        const knopf = q('[data-ew="speichern"]');
        const text0 = knopf ? knopf.textContent : 'Speichern';
        S.laeuft = true; if (knopf) { knopf.disabled = true; knopf.textContent = 'Speichert …'; }
        try {
            sigErfassen();
            const m = S.m, d = sammeln();
            const doc = await pdfErzeugen(d);
            const name = `Einweisungserklaerung-${sauber(d.empf.name) || sauber(m.serial || m.serial_number) || 'ohne-empfaenger'}-${datumDe(d.datum)}.pdf`;
            const datei = new File([doc.output('blob')], name, { type: 'application/pdf' });
            const basis = typeof window.getMachineFolderName === 'function'
                ? window.getMachineFolderName(m.id, m.manufacturer, m.name, m.serial || m.serial_number, m.year) : 'Maschinen/' + m.id;
            let pfad = `${basis}/uebergabeprotokolle/${name}`;
            // Zweite Erklärung am selben Tag für denselben Empfänger: nicht die erste überschreiben
            if (!S.edit && S.docs && S.docs.some(x => x.file_path === pfad)) pfad = pfad.replace(/\.pdf$/, '-' + Date.now().toString(36) + '.pdf');
            const up = await window.FileUploadService.uploadFile(datei, { bucket: 'dateien', path: pfad, compress: false, provider: 'cloudflare-r2' });
            const zeile = {
                name: pfad.split('/').pop().replace(/\.pdf$/, ''), category: ORDNER, machine_id: parseInt(m.id, 10),
                url: up.url, file_path: up.path, size: datei.size, mime_type: 'application/pdf',
                attachments: [{ einweisung: Object.assign({}, d, { sig: S.sig }) }]
            };
            if (S.edit) {
                const { error } = await sb().from('documents').update(zeile).eq('id', S.edit.id);
                if (error) throw error;
                // Neuer Dateiname (anderer Empfänger/Datum): die alte PDF entfernen
                if (S.edit.file_path && S.edit.file_path !== up.path) {
                    try { await window.FileUploadService.deleteFile(S.edit.file_path, { bucket: 'dateien', provider: 'cloudflare-r2' }); } catch (e) { console.warn('Alte PDF nicht gelöscht:', e); }
                }
            } else {
                const { data: neu, error } = await sb().from('documents').insert([Object.assign({ folder_id: await ordnerId() }, zeile)]).select('id').single();
                if (error) throw error;
                S.neueId = neu.id;
            }
            // Gegenprobe: stehen die Formulardaten wirklich in der Datenbank (nicht nur im Browser)?
            const { data: pruef, error: pruefFehler } = await sb().from('documents').select('attachments').eq('id', S.edit ? S.edit.id : S.neueId).single();
            if (pruefFehler || !datenVon(pruef)) throw new Error('Die Formulardaten sind nicht in der Datenbank angekommen. Das PDF wurde gespeichert, ein späteres Bearbeiten ist deshalb nicht möglich.');
            if (typeof window.fetchDocuments === 'function' && document.getElementById('documents')) { try { window.fetchDocuments(); } catch (e) { /* Ansicht nicht offen */ } }
            toast('Einweisungserklärung gespeichert.', 'success');
            schliessen(true);
            if (window.maschinenZentraleNeuLaden) window.maschinenZentraleNeuLaden(m.id);
        } catch (e) {
            console.error('Einweisungserklärung:', e);
            toast('Speichern fehlgeschlagen: ' + (e.message || e), 'error');
            if (knopf) { knopf.disabled = false; knopf.textContent = text0; }
        } finally { S.laeuft = false; }
    }

    async function schliessen(still) {
        const b = box(); if (!b) return;
        if (!still && S && S.ausgang && stand() !== S.ausgang && window.appFrage) {
            const ja = await window.appFrage('Die Eingaben wurden nicht gespeichert. Fenster trotzdem schließen?', { gefahr: true, ja: 'Schließen', nein: 'Zurück' });
            if (!ja) return;
        }
        b.remove();
    }

    // ------------------------------------------------------------ Start
    function standard() {
        const m = S.m, werkstatt = S.werkstatt;
        return {
            empf: werkstatt ? { name: '', strasse: '', plz: '', ort: '', land: '' }
                : { name: m.company || '', strasse: m.operator_street || '', plz: m.operator_zip || '', ort: m.operator_city || '', land: m.operator_country || '' },
            bezeichnung: m.manufacturer || '', typ: m.name || '', nummer: m.serial || m.serial_number || '',
            motor: [m.motor_type, m.motor_serial ? '# ' + m.motor_serial : ''].filter(Boolean).join(' - '),
            stunden: S.stunden, beigelegt: '', zustand: '', sonstiges: '', durch: '', teilnehmer: '',
            punkte: PUNKTE.map(() => false), ort: '', datum: heute(), rueckgabe: '', sig: {}
        };
    }

    function formOeffnen(doc) {
        const alt = doc ? datenVon(doc) : null;
        S.edit = doc ? { id: doc.id, file_path: doc.file_path } : null;
        S.daten = alt ? Object.assign(standard(), alt, { empf: Object.assign({}, standard().empf, alt.empf || {}), punkte: PUNKTE.map((t, i) => !!(alt.punkte && alt.punkte[i])), sig: alt.sig || {} }) : standard();
        S.customerId = S.daten.empf.customer_id || S.customerId || null;
        if (!S.daten.empf.ort && !alt) S.daten.ort = '';
        bauen();
    }

    function klick(e) {
        const a = e.target.closest('[data-ew]');
        const t = q('#ew-treffer');
        if (t && !t.hidden && !e.target.closest('.ew-suche')) t.hidden = true;
        if (!a) return;
        const was = a.dataset.ew;
        if (was === 'zu') return schliessen();
        if (was === 'speichern') return speichern();
        if (was === 'vorschau') return vorschau();
        if (was === 'adresse') return adresseWaehlen(a.dataset.id);
        if (was === 'liste-neu') return void letzteStunden(S.m.id).then(h => { S.stunden = h; formOeffnen(null); });
        if (was === 'liste-pdf') return void window.open(a.dataset.url, '_blank');
        if (was === 'liste-bearbeiten') { const d = (S.docs || []).find(x => String(x.id) === String(a.dataset.id)); if (d) formOeffnen(d); return; }
        if (was === 'leeren') {
            const c = q('canvas[data-ew-pad="' + a.dataset.pad + '"]');
            if (c) { c.getContext('2d').clearRect(0, 0, c.width, c.height); c.dataset.leer = '1'; }
        }
    }

    window.openEinweisung = async function (machineId, was) {
        const m = maschine(machineId);
        if (!m) { toast('Maschine nicht gefunden.'); return; }
        const werkstatt = !!(m.is_in_workshop || m.in_workshop);
        S = { m, werkstatt, sig: {}, customerId: m.customer_id || null, laeuft: false, stunden: '', docs: [], edit: null };
        let docs = [];
        try { docs = await dokumente(m.id); } catch (e) { console.warn('Vorhandene Einweisungserklärungen nicht ladbar:', e); }
        S.docs = docs;
        if (was && was !== 'neu') {
            const d = docs.find(x => String(x.id) === String(was));
            if (!d) { toast('Einweisungserklärung nicht gefunden.'); return; }
            S.stunden = '';
            return formOeffnen(d);
        }
        if (!was && docs.length) return listeZeigen(docs);
        S.stunden = await letzteStunden(m.id);
        formOeffnen(null);
    };
})();
