// ==========================================================
// PSEUDONYMISIERUNG FÜR KI-ANFRAGEN
// ==========================================================
// Bevor Text an den KI-Anbieter geht, werden personenbezogene Angaben durch
// Platzhalter ersetzt; die Antwort wird im Browser zurückübersetzt. Die
// Zuordnungstabelle existiert nur hier im Speicher und verlässt das Gerät nie.
//
//   const p = window.kiPseudonym.erzeugen({ kontakte, firmen });
//   const anfrage = p.maskieren(text);      // "Jürgen Huber" → "Ansprechpartner A"
//   const antwort = p.demaskieren(kiText);  // zurück zu "Jürgen Huber"
//   p.anzahl                                // wie viele Ersetzungen gegriffen haben
//
// Ersetzt werden: Ansprechpartner (Kontaktliste), Mitarbeiter (window.userList),
// Firmennamen (optional), dazu im Freitext E-Mail-Adressen, Telefonnummern,
// Straßen mit Hausnummer und „Herr/Frau <Name>" für Personen, die nirgends
// hinterlegt sind. Orte, Maschinen, Beträge, Datumsangaben bleiben — sie sind
// keine personenbezogenen Daten und ohne sie ist die Auswertung wertlos.
// ==========================================================
(function () {
    'use strict';

    const escRe = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const BUCHSTABE = (i) => { let s = ''; i += 1; while (i > 0) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); } return s; };

    // Anreden, hinter denen ein Nachname folgt
    const ANREDE = '(?:Herrn?|Frau|Hr\\.|Fr\\.|Familie|Fam\\.)';

    function erzeugen(opts) {
        opts = opts || {};
        const regeln = [];          // { re, ersatz }  — Reihenfolge: lange Namen zuerst
        // Interne Schlüssel („§Firma#12") → Original. Der sichtbare Platzhalter („Firma K1")
        // wird erst beim ERSTEN Treffer fortlaufend vergeben — so heißt es „Firma K1",
        // nicht „Firma K397", auch wenn 900 Kunden im Cache stehen.
        const original = new Map();  // §schlüssel → Originaltext
        const sichtbar = new Map();  // §schlüssel → „Firma K1"
        const rueck = new Map();     // „Firma K1" → Originaltext (fürs Demaskieren)
        const laufend = {};          // Art → letzte vergebene Nummer
        let anzahl = 0;
        const treffer = new Map();   // sichtbarer Platzhalter → wie oft ersetzt
        function zaehl(key) {
            if (!sichtbar.has(key)) {
                const art = key.slice(1).split('#')[0];
                laufend[art] = (laufend[art] || 0) + 1;
                const ph = art === 'Ansprechpartner' ? art + ' ' + BUCHSTABE(laufend[art] - 1) : art === 'Firma' ? 'Firma K' + laufend[art] : art + ' ' + laufend[art];
                sichtbar.set(key, ph);
                rueck.set(ph, original.get(key) || '');
            }
            const ph = sichtbar.get(key);
            anzahl++; treffer.set(ph, (treffer.get(ph) || 0) + 1);
            return ph;
        }
        let lfd = 0;
        function merke(orig, art) {
            const key = '§' + art + '#' + (++lfd);
            original.set(key, String(orig || '').trim());
            return key;
        }

        // ---- Ansprechpartner: voller Name, zusätzlich „Herr/Frau Nachname" ----
        const kontakte = (opts.kontakte || []).map(k => (typeof k === 'string' ? k : (k && k.name) || '')).map(s => s.trim()).filter(s => s.length >= 3);
        [...new Set(kontakte)].forEach((name, i) => {
            const ph = merke(name, 'Ansprechpartner');
            regeln.push({ re: new RegExp(escRe(name), 'gi'), ersatz: ph, len: name.length });
            const teile = name.split(/\s+/);
            const nachname = teile[teile.length - 1];
            if (teile.length > 1 && nachname.length >= 3) {
                regeln.push({ re: new RegExp(ANREDE + '\\s+' + escRe(nachname) + '(?![\\wäöüß])', 'gi'), ersatz: ph, len: nachname.length + 5 });
            }
        });

        // ---- Mitarbeiter (Nutzer der App) ----
        const nutzer = (opts.mitarbeiter || (window.userList || []).map(u => u.name)).map(s => String(s || '').trim()).filter(s => s.length >= 3);
        [...new Set(nutzer)].forEach((name, i) => {
            const ph = merke(name, 'Mitarbeiter');
            regeln.push({ re: new RegExp(escRe(name), 'gi'), ersatz: ph, len: name.length });
            // Vorname allein (z. B. „Timo soll hin") — nur wenn er nicht auch ein Wort ist, das
            // ohnehin vorkommt; Vornamen ≥ 4 Zeichen mit Wortgrenzen.
            const vorname = name.split(/\s+/)[0];
            if (vorname.length >= 4 && vorname !== name) {
                // Nicht, wenn ein weiterer Name folgt: „Jürgen Huber" ist ein anderer Mensch als Mitarbeiter „Jürgen Meenken".
                regeln.push({ re: new RegExp('(?<![\\wäöüß])' + escRe(vorname) + '(?![\\wäöüß])(?!\\s+[A-ZÄÖÜ][a-zäöüß-]{2,})', 'g'), ersatz: ph, len: vorname.length });
            }
        });

        // ---- Firmen (optional): Inhaber-Namen stecken oft im Firmennamen ----
        const firmen = (opts.firmen || []).map(s => String(s || '').trim()).filter(s => s.length >= 3);
        [...new Set(firmen)].forEach((name, i) => {
            const ph = merke(name, 'Firma');
            regeln.push({ re: new RegExp('(?<![\\wäöüß])' + escRe(name) + '(?![\\wäöüß])', 'gi'), ersatz: ph, len: name.length });
            // Kurzform ohne Rechtsform („Huber Recyclingtechnik GmbH" → „Huber Recyclingtechnik")
            const kurz = name.replace(/\s+(GmbH|AG|KG|OHG|e\.?K\.?|GbR|UG|mbH|& Co\.? KG|Co\.|Ltd\.?|Inc\.?|SE)(\s*&\s*Co\.?\s*KG)?\.?$/i, '').trim();
            // Nur, wenn die Kurzform noch unverwechselbar ist (≥ 2 Wörter oder ≥ 10 Zeichen) —
            // sonst würde „Service GmbH" das Wort „Service" überall ersetzen.
            if (kurz !== name && (kurz.split(/\s+/).length >= 2 || kurz.length >= 10)) regeln.push({ re: new RegExp('(?<![\\wäöüß])' + escRe(kurz) + '(?![\\wäöüß])', 'gi'), ersatz: ph, len: kurz.length });
        });

        // ---- Quasi-Identifikatoren: Orte, Kunden-/Seriennummern, Belegnummern ----
        // Allein harmlos, zusammen erraten sie die Firma und damit die Personen.
        // Orte: "2442 Unterwaltersdorf" und "Unterwaltersdorf" → "Ort 1"
        const orte = (opts.orte || []).map(o => (typeof o === 'string' ? { city: o } : o) || {}).filter(o => o.city && String(o.city).trim().length >= 3);
        const ortNamen = [...new Set(orte.map(o => String(o.city).trim()))];
        ortNamen.forEach((stadt, i) => {
            const ph = merke(stadt, 'Ort');
            const plz = orte.filter(o => String(o.city).trim() === stadt && o.zip).map(o => String(o.zip).trim());
            plz.forEach(z => regeln.push({ re: new RegExp(escRe(z) + '\\s+' + escRe(stadt) + '(?![\\wäöüß])', 'gi'), ersatz: ph, len: (z + ' ' + stadt).length }));
            // Groß-/Kleinschreibung beachten: „Essen" ist ein Ort, „essen" nicht.
            regeln.push({ re: new RegExp('(?<![\\wäöüß])' + escRe(stadt) + '(?![\\wäöüß])', 'g'), ersatz: ph, len: stadt.length });
        });
        // Nummern, die nur in eurem System vorkommen: eindeutig genug, um zurückzuführen
        const nummern = (opts.nummern || []);   // [{ wert, art }]  art: 'Kundennr' | 'Seriennr' | 'Beleg' | 'Auftrag'

        nummern.map(n => (typeof n === 'string' ? { wert: n, art: 'Nr' } : n)).filter(n => n && n.wert && String(n.wert).trim().length >= 3).forEach(n => {
            const wert = String(n.wert).trim();
            // Kurze reine Zahlen („10", „632") sind als Listeneintrag zu gefährlich — „10 Uhr" wäre
            // eine Seriennummer. Die greifen nur über die Freitext-Muster („#632", „SN 632").
            if (/^\d+$/.test(wert) && wert.length < 4) return;
            // Vierstellige Zahlen, die wie Jahre aussehen (1990–2039), ebenfalls nicht.
            if (/^(19|20)\d\d$/.test(wert)) return;
            if ([...original.values()].includes(wert)) return;
            const ph = merke(wert, n.art || 'Nr');
            // Wortgrenzen, damit "1632" nicht in "11632" trifft; „#" davor darf mit.
            // Fünfstellig + Ortsname dahinter = Postleitzahl, keine Kundennummer.
            regeln.push({ re: new RegExp('(?<![\\w.,])#?' + escRe(wert) + '(?![\\w.,]*\\d)(?!\\s+[A-ZÄÖÜ][a-zäöüß]{2,})', 'g'), ersatz: ph, len: wert.length });
        });

        // Lange Muster zuerst, damit „Jürgen Huber" vor „Huber" greift
        regeln.sort((a, b) => (b.len || b.re.source.length) - (a.len || a.re.source.length));

        // ---- Muster im Freitext, die keiner Liste zugeordnet sind ----
        const unbekannt = new Map();   // "Herr Schulze" → Person 1
        const MUSTER = [
            { re: /[\w.+-]+@[\w-]+\.[\w.-]+/g, ersatz: '[E-Mail]' },
            // Telefon: mit Ländervorwahl, oder 0… mit Trennzeichen zwischen den Gruppen. Reine
            // Ziffernfolgen (Seriennummern, Zeitstempel, Dateinamen) und Beträge bleiben unberührt.
            { re: /(?<![\d.,€\w])(?:(?:\+49|0049)[\s\/-]?\d[\d\s\/-]{5,}\d|0\d{2,5}[\s\/-]+\d[\d\s\/-]{2,}\d)(?![\d.,]*\s?€)(?!\w)(?!\.\d)/g, ersatz: '[Telefon]' },
            // „Ahlhorner Str. 137", „Hauptstraße 5", „Am Ring 3" — Leerzeichen vor dem Straßenwort erlaubt
            { re: /\b[A-ZÄÖÜ][\wäöüß.-]+(?:\s?-?)(?:straße|strasse|str\.|weg|allee|platz|gasse|ring|damm|ufer)\s*\d+[a-z]?\b/gi, ersatz: '[Straße]' }
        ];

        function maskieren(text) {
            let t = String(text == null ? '' : text);
            regeln.forEach(r => { t = t.replace(r.re, () => zaehl(r.ersatz)); });
            MUSTER.forEach(m => { t = t.replace(m.re, () => { anzahl++; treffer.set(m.ersatz, (treffer.get(m.ersatz) || 0) + 1); return m.ersatz; }); });
            const person = (ganz, schluessel) => {
                if (!unbekannt.has(schluessel)) unbekannt.set(schluessel, merke(ganz, 'Person'));
                return zaehl(unbekannt.get(schluessel));
            };
            // „Herr Schulze", der nirgends hinterlegt ist → „Person 1" (stabil je Sitzung)
            t = t.replace(new RegExp(ANREDE + '\\s+([A-ZÄÖÜ][\\wäöüß-]{2,})', 'g'), (ganz, nachname) => {
                if (/^(Ansprechpartner|Mitarbeiter|Person|Firma)$/.test(nachname)) return ganz;
                return person(ganz, nachname);
            });
            // „vom Jürgen Huber", „mit Anna Schmidt": Vor- und Nachname hinter einer Präposition,
            // beide groß und nur Buchstaben (Maschinen wie „BACKHUS A50" fallen durch).
            t = t.replace(/\b(vom|von|mit|bei|an|für|durch|Kontakt:?|Ansprechpartner:?)\s+([A-ZÄÖÜ][a-zäöüß-]{2,})\s+([A-ZÄÖÜ][a-zäöüß-]{2,})(?![\wäöüß])/g, (ganz, prep, v, n) => {
                if (/^(Ansprechpartner|Mitarbeiter|Person|Firma)$/.test(v)) return ganz;
                return prep + ' ' + person(v + ' ' + n, n);
            });
            // Nummern im Freitext, die nirgends als Liste vorliegen: „#632", „SN 632", „Angebot 30065",
            // „Auftrag 4711" → eigene Platzhalter, die zurückübersetzt werden.
            const nummer = (art, wert) => {
                const key = art + ':' + wert;
                if (!unbekannt.has(key)) unbekannt.set(key, merke(wert, art));
                return zaehl(unbekannt.get(key));
            };
            t = t.replace(/(?<![\wäöüß])(?:#|S\/N\s*|SN\s*|Serien-?Nr\.?\s*|Seriennummer\s*)(\d{2,}[\w-]*)/gi, (ganz, w) => nummer('Seriennr', w));
            t = t.replace(/\b(Angebot(?:s-?Nr\.?)?|Beleg(?:-?Nr\.?)?|Rechnung(?:s-?Nr\.?)?|Auftrag(?:s-?Nr\.?)?|AB)\s+(\d{4,8})\b/g, (ganz, wort, w) => wort + ' ' + nummer(/Rechnung/i.test(wort) ? 'Rechnung' : /Auftrag|AB/.test(wort) ? 'Auftrag' : 'Beleg', w));

            // Zuletzt: bloße Nachnamen aller bekannten Personen („Email von Huber") — erst jetzt,
            // damit Firmennamen („Huber Recyclingtechnik") vorher schon ersetzt sind.
            [...original.entries()].forEach(([key, orig]) => {
                if (!/^§(Ansprechpartner|Mitarbeiter|Person)#/.test(key)) return;
                const ph = key;
                const teile = orig.replace(new RegExp('^' + ANREDE + '\\s+'), '').split(/\s+/);
                const nachname = teile[teile.length - 1];
                if (!nachname || nachname.length < 4 || !/^[A-ZÄÖÜ]/.test(nachname)) return;
                t = t.replace(new RegExp('(?<![\\wäöüß])' + escRe(nachname) + '(?![\\wäöüß])', 'g'), () => zaehl(ph));
            });
            return t;
        }

        function demaskieren(text) {
            let t = String(text == null ? '' : text);
            // Längere Platzhalter zuerst („Ansprechpartner AB" vor „Ansprechpartner A")
            [...rueck.entries()].sort((a, b) => b[0].length - a[0].length).forEach(([ph, orig]) => {
                t = t.replace(new RegExp(escRe(ph) + '(?![A-Z0-9])', 'g'), orig);
            });
            return t;
        }

        // Protokoll: welche Platzhalter wofür standen und wie oft sie griffen —
        // damit sich die Regeln gezielt schärfen oder lockern lassen.
        function bericht() {
            const art = ph => (ph.match(/^(Ansprechpartner|Mitarbeiter|Person|Firma|Ort|Kundennr|Adressnr|Seriennr|Beleg|Rechnung|Auftrag|Nr)/) || ['Sonstiges'])[0].replace(/^Nr$/, 'Nummer');
            const zeilen = [];
            treffer.forEach((n, ph) => zeilen.push({ art: art(ph.replace(/^\[|\]$/g, '')) === 'Sonstiges' && /^\[/.test(ph) ? ph.replace(/[\[\]]/g, '') : art(ph), platzhalter: ph, original: rueck.get(ph) || '(Muster)', anzahl: n }));
            zeilen.sort((a, b) => a.art.localeCompare(b.art) || b.anzahl - a.anzahl);
            return zeilen;
        }
        function berichtHtml() {
            const z = bericht();
            if (!z.length) return '<div class="ki-ps-bericht"><em>Nichts ersetzt — im Text wurden keine bekannten Namen, Orte oder Nummern gefunden.</em></div>';
            const gruppen = {};
            z.forEach(x => { (gruppen[x.art] = gruppen[x.art] || []).push(x); });
            const e = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
            return '<div class="ki-ps-bericht">' + Object.entries(gruppen).map(([art, liste]) =>
                '<div class="ki-ps-gruppe"><b>' + e(art) + '</b> (' + liste.reduce((s, x) => s + x.anzahl, 0) + ')<ul>'
                + liste.map(x => '<li><span class="ki-ps-orig">' + e(x.original) + '</span> → <code>' + e(x.platzhalter) + '</code>' + (x.anzahl > 1 ? ' ×' + x.anzahl : '') + '</li>').join('')
                + '</ul></div>').join('') + '</div>';
        }

        return {
            maskieren, demaskieren, bericht, berichtHtml,
            get anzahl() { return anzahl; },
            get platzhalter() { return [...rueck.keys()]; }
        };
    }

    // ---- Standard-Kontext aus dem, was die App ohnehin geladen hat ----
    // Kunden (js/lookup-cache.js), Maschinen (window.machineList), Mitarbeiter (userList).
    function standardKontext(extra) {
        const kunden = (typeof window.customerCacheSync === 'function' ? window.customerCacheSync() : []) || [];
        const maschinen = window.machineList || [];
        const k = {
            kontakte: [],
            firmen: kunden.map(c => c.name).filter(Boolean),
            orte: kunden.map(c => ({ city: c.city, zip: c.zip_code })).concat(maschinen.map(m => ({ city: m.operator_city || m.location }))),
            nummern: maschinen.map(m => ({ wert: m.serial || m.serial_number, art: 'Seriennr' })).concat(kunden.map(c => ({ wert: c.customer_number, art: 'Kundennr' })))
        };
        if (extra) Object.keys(extra).forEach(key => { k[key] = (k[key] || []).concat(extra[key] || []); });
        return k;
    }

    // Wie window.groqFetch, aber alle Nachrichten werden vorher maskiert und die
    // Antwort demaskiert. Liefert eine Response, deren json()/text() den
    // rückübersetzten Inhalt tragen. Das Pseudonym-Objekt hängt als resp.pseudonym
    // dran (für Bericht/Anzahl), zusätzlich in window.kiPseudonym.letztes.
    let letztes = null;
    async function fetchMaskiert(payload, extra) {
        const p = erzeugen(standardKontext(extra));
        const body = Object.assign({}, payload, {
            messages: (payload.messages || []).map((m, i) => Object.assign({}, m, {
                content: typeof m.content === 'string' ? p.maskieren(m.content) + (i === 0 && m.role === 'system' ? '\n\n' + PROMPT_HINWEIS : '') : m.content
            }))
        });
        letztes = { p, gesendet: body.messages.map(m => m.content).join('\n\n---\n\n') };
        const resp = await window.groqFetch(body);
        let text = '';
        try { text = await resp.text(); } catch (e) { text = ''; }
        let zurueck = text;
        try {
            const j = JSON.parse(text);
            if (j && j.choices) j.choices.forEach(c => { if (c.message && typeof c.message.content === 'string') c.message.content = p.demaskieren(c.message.content); });
            zurueck = JSON.stringify(j);
        } catch (e) { zurueck = p.demaskieren(text); }
        const neu = new Response(zurueck, { status: resp.status, statusText: resp.statusText, headers: resp.headers });
        neu.pseudonym = p;
        return neu;
    }

    // Hinweistext für den System-Prompt, damit das Modell die Platzhalter unverändert lässt.
    const PROMPT_HINWEIS = 'Personenbezogene und identifizierende Angaben sind durch Platzhalter ersetzt (Ansprechpartner A/B/…, Mitarbeiter 1/2/…, Person 1/…, Firma K1/…, Ort 1/…, Kundennr 1, Seriennr 1/…, Beleg 1/…, [E-Mail], [Telefon], [Straße]). '
        + 'Verwende diese Platzhalter in deiner Antwort GENAU so, wie sie vorkommen — nicht umschreiben, nicht abkürzen, nicht auflösen.';

    // ---- Kontrolle: Hat die Maskierung alles erwischt? ----
    // Durchsucht den MASKIERTEN Text nach Resten, die nach Personenbezug aussehen:
    // bekannte Kunden-/Mitarbeiternamen (sicher übersehen), dazu Muster wie
    // „Herr X", „… GmbH", Mail, Telefon, Straße, PLZ + Ort (Verdacht).
    // Liefert { html, ersetzt, verdacht }: Platzhalter grün, Verdachtsstellen rot.
    const PH_RE = /\b(?:Ansprechpartner [A-Z]{1,3}|Mitarbeiter \d+|Person \d+|Firma K\d+|Ort \d+|Kundennr \d+|Adressnr \d+|Seriennr \d+|Beleg \d+|Rechnung \d+|Auftrag \d+|Nr \d+)\b|\[(?:E-Mail|Telefon|Straße)\]/g;
    function pruefen(text) {
        const t = String(text || '');
        const funde = [];   // { von, bis, grund }
        const merk = (re, grund, filter) => { let m; re.lastIndex = 0; while ((m = re.exec(t))) { if (!filter || filter(m)) funde.push({ von: m.index, bis: m.index + m[0].length, grund }); } };
        // Sicher übersehen: Namen, die die App kennt
        const bekannt = [];
        ((typeof window.customerCacheSync === 'function' ? window.customerCacheSync() : []) || []).forEach(c => { if (c && c.name && c.name.trim().length >= 4) bekannt.push({ n: c.name.trim(), g: 'Kundenname nicht ersetzt' }); });
        (window.userList || []).forEach(u => { if (u && u.name && u.name.trim().length >= 4) bekannt.push({ n: u.name.trim(), g: 'Mitarbeitername nicht ersetzt' }); });
        bekannt.forEach(b => merk(new RegExp('(?<![\\wäöüß])' + escRe(b.n) + '(?![\\wäöüß])', 'g'), b.g));
        // Verdacht nach Muster
        merk(new RegExp(ANREDE + '\\s+[A-ZÄÖÜ][\\wäöüß-]{2,}', 'g'), 'Anrede + Name', m => !/\b(Ansprechpartner|Mitarbeiter|Person)\b/.test(m[0]));
        merk(/\b[A-ZÄÖÜ][\wäöüß&.-]+(?:\s+[A-ZÄÖÜ&][\wäöüß&.-]+){0,3}\s+(?:GmbH|AG|KG|OHG|GbR|e\.K\.|e\.V\.|UG|mbH|Co\.)\b[\w.& ]*/g, 'Firmenname', m => !/^Firma K\d+/.test(m[0]));
        merk(/[\w.+-]+@[\w-]+\.[\w.-]+/g, 'E-Mail');
        merk(/(?<![\d.,€\w])(?:\+49|0049|0\d{2,5}[\s\/-])[\d\s\/-]{5,}\d(?![\d.,]*\s?€)(?!\w)/g, 'Telefon');
        merk(/\b[A-ZÄÖÜ][\wäöüß.-]+(?:\s?-?)(?:straße|strasse|str\.|weg|allee|platz|gasse|ring|damm|ufer)\s*\d+[a-z]?\b/gi, 'Straße');
        merk(/\b\d{5}\s+[A-ZÄÖÜ][a-zäöüß]{2,}(?:[ -][A-ZÄÖÜ][a-zäöüß]{2,})?\b/g, 'PLZ + Ort');
        // Platzhalter selbst dürfen nie als Verdacht gelten
        const ph = []; let m; PH_RE.lastIndex = 0;
        while ((m = PH_RE.exec(t))) ph.push({ von: m.index, bis: m.index + m[0].length });
        const inPh = f => ph.some(p => f.von < p.bis && f.bis > p.von);
        const verdacht = funde.filter(f => !inPh(f)).sort((a, b) => a.von - b.von);
        // Überlappende Verdachtsfunde zusammenlegen
        const marken = [];
        [...ph.map(p => ({ von: p.von, bis: p.bis, art: 'ph' })), ...verdacht.map(v => ({ von: v.von, bis: v.bis, art: 'v', grund: v.grund }))]
            .sort((a, b) => a.von - b.von)
            .forEach(x => { const l = marken[marken.length - 1]; if (l && x.von < l.bis) { l.bis = Math.max(l.bis, x.bis); if (x.art === 'v' && l.art === 'v' && !l.grund.includes(x.grund)) l.grund += ', ' + x.grund; } else marken.push(Object.assign({}, x)); });
        const e = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        let html = '', pos = 0;
        marken.forEach(x => {
            html += e(t.slice(pos, x.von));
            html += x.art === 'ph' ? '<mark class="ki-ps-ph">' + e(t.slice(x.von, x.bis)) + '</mark>' : '<mark class="ki-ps-verdacht" title="' + e(x.grund) + '">' + e(t.slice(x.von, x.bis)) + '</mark>';
            pos = x.bis;
        });
        html += e(t.slice(pos));
        return { html, ersetzt: ph.length, verdacht: marken.filter(x => x.art === 'v').length, funde: marken.filter(x => x.art === 'v').map(x => ({ text: t.slice(x.von, x.bis), grund: x.grund })) };
    }
    // Fertiger Block für „Was geht raus?": Ampel-Zeile + markierter Text.
    function pruefHtml(text) {
        const r = pruefen(text);
        const e = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        const kopf = r.verdacht
            ? '<div class="ki-ps-ampel ki-ps-ampel-rot">⚠️ ' + r.verdacht + ' Stelle' + (r.verdacht > 1 ? 'n' : '') + ' sieht noch nach Personenbezug aus (rot markiert — bitte prüfen):<ul>' + r.funde.slice(0, 12).map(f => '<li><b>' + e(f.text) + '</b> <span class="text-muted-sm">' + e(f.grund) + '</span></li>').join('') + (r.funde.length > 12 ? '<li>…</li>' : '') + '</ul></div>'
            : '<div class="ki-ps-ampel ki-ps-ampel-gruen">✅ Keine Reste erkannt — ' + r.ersetzt + ' Platzhalter im Text (grün). Geprüft: bekannte Kunden- und Mitarbeiternamen, Anreden, Firmenzusätze, E-Mail, Telefon, Straße, PLZ + Ort.</div>';
        return kopf + '<pre class="ab-ai-summary-roh ki-ps-markiert">' + r.html + '</pre>';
    }

    // Kurzer Hinweis unter einer KI-Vorschau: „🔒 12 Angaben ersetzt · Details" —
    // Details klappen den Bericht (was → welcher Platzhalter) und den gesendeten Text auf.
    function hinweisHtml() {
        if (!letztes) return '';
        const n = letztes.p.anzahl;
        return '<div class="ki-ps-hinweis">🔒 ' + (n ? n + ' personenbezogene Angaben vor dem Senden ersetzt' : 'Keine personenbezogenen Angaben im Text erkannt')
            + ' · <a href="#" onclick="return window.kiPseudonymDetails(this)">Details</a>'
            + '<div class="ki-ps-details" hidden></div></div>';
    }
    window.kiPseudonymDetails = function (a) {
        const box = a.parentElement.querySelector('.ki-ps-details');
        if (!box) return false;
        if (!box.hidden) { box.hidden = true; a.textContent = 'Details'; return false; }
        const e = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        box.innerHTML = (letztes ? letztes.p.berichtHtml() : '') + '<details class="ki-ps-raus"><summary>Was ging raus?</summary>' + pruefHtml(letztes ? letztes.gesendet : '') + '</details>';
        box.hidden = false; a.textContent = 'Details ausblenden';
        return false;
    };

    window.kiPseudonym = { erzeugen, fetchMaskiert, standardKontext, hinweisHtml, pruefen, pruefHtml, PROMPT_HINWEIS, get letztes() { return letztes; } };
})();
