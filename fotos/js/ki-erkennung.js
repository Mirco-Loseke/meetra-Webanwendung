// =============================================================================
//  Adressen und Maschinen aus grob geschriebenem Text erkennen (2026-10-01)
// =============================================================================
//  Läuft komplett im Browser über Kunden-Cache (js/lookup-cache.js) und
//  window.machineList — keine Abfrage, nichts geht an die KI.
//  Genutzt vom KI-Chat (js/ki-chat.js): bessere Kandidatenliste für die KI und
//  eindeutige Treffer direkt eintragen.
//
//  window.kiErkennung.adressen(text)            → [{ k, score, grund }] absteigend
//  window.kiErkennung.maschinen(text, adressen) → [{ m, score, grund }] absteigend
//  window.kiErkennung.eindeutig(liste, min)     → bester Treffer, wenn klar vorn, sonst null
//
//  Punkte statt Stichwortsuche:
//  - Namensteile zählen nach Seltenheit (IDF): „Wessels" viel, „Recycling" wenig.
//  - Tippfehler: 1 Zeichen bei 5–7 Buchstaben, 2 ab 8; Umlaute ae/ä, ss/ß gleich.
//  - Wortanfang ab 4 Buchstaben („Wess" → Wessels), Ort, PLZ, Kunden-/Adressnr.,
//    Straße, E-Mail-Domain.
//  - Maschinen: Typ (auch ohne Punkt: 545 = 5.45), Seriennummer, Hersteller,
//    Firma/Standort und die erkannte Adresse (customer_id oder Firmenname).
// =============================================================================
(function () {
    'use strict';

    const RECHTSFORM = /^(gmbh|mbh|kg|ag|co|ug|ohg|gbr|ek|ev|se|kgaa|inh|und)$/;
    const FUELL = new Set(('der die das den dem des ein eine einen einem einer und oder aber auch noch mal bei beim von vom zum zur mit fuer '
        + 'nach wegen ist hat war wird wurde sind haben bitte heute morgen gestern uebermorgen woche montag dienstag mittwoch donnerstag freitag '
        + 'samstag sonntag kunde kunden firma herr frau herrn neuer neue neues anlegen anlage vorgang vorgaenge aufgabe aufgaben unteraufgabe '
        + 'unteraufgaben termin angebot schaden schadensbericht maschine maschinen foto bild bilder zur wieder soll muss kann koennen '
        + 'macht machen gemacht steht stehen ruft rief angerufen anrufen anruf wegen ueber unter dass weil wenn dann hier dort ich wir sie '
        + 'mir uns ihm ihr ihnen der sein seine seiner neu alte alten vorbei vorbeikommen besuch besuchen ersatzteil ersatzteile bestellt '
        + 'bestellen kaputt defekt geht nicht kein keine '
        // Technik/Werkstatt: kommen in Schadensmeldungen vor, sind aber auch Teil von
        // Firmennamen („Wittrock Öl", „LAG Lager …") — dürfen keine Adresse auslösen.
        + 'oel oele lager walze walzen kette ketten schlauch schlaeuche hydraulik motor getriebe filter sieb siebmaschine siebtrommel '
        + 'umsetzer shredder brecher zerkleinerer trommel band foerderband reifen rad achse pumpe ventil zylinder sensor kabel display '
        + 'steuerung geraeusch geraeusche wartung reparatur service uvv pruefung teile messer rotor zinken schaufel lackieren schweissen '
        + 'verliert laeuft leckt undicht wasser luft strom elektrik licht lampe tausch tauschen wechseln gewechselt').split(' '));

    function norm(s) {
        return String(s || '').toLowerCase()
            .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
            .replace(/[éèê]/g, 'e').replace(/[áàâ]/g, 'a');
    }
    function woerter(s) {
        return norm(s).replace(/(\d),(\d)/g, '$1.$2').split(/[^a-z0-9.]+/)
            .map(w => w.replace(/^\.+|\.+$/g, '')).filter(Boolean);
    }
    function abstand(a, b, max) {
        if (Math.abs(a.length - b.length) > max) return max + 1;
        let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
        for (let i = 1; i <= a.length; i++) {
            const cur = [i];
            let zeileMin = i;
            for (let j = 1; j <= b.length; j++) {
                cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
                if (cur[j] < zeileMin) zeileMin = cur[j];
            }
            if (zeileMin > max) return max + 1;
            prev = cur;
        }
        return prev[b.length];
    }
    const ohnePunkt = s => norm(s).replace(/[^a-z0-9]/g, '');
    const tippToleranz = w => (w.length >= 8 ? 2 : w.length >= 5 ? 1 : 0);
    function textTokens(text) {
        return [...new Set(woerter(text).filter(w => (w.length >= 3 || /\d/.test(w)) && !FUELL.has(w)))];
    }

    // ---------------------------------------------------------------- Adressen
    let idx = null, idxN = -1;
    function index() {
        const kunden = (typeof window.customerCacheSync === 'function' ? window.customerCacheSync() : []) || [];
        if (idx && idxN === kunden.length) return idx;
        const df = new Map();
        const eintraege = kunden.map(k => {
            const name = woerter(k.name).filter(w => !RECHTSFORM.test(w) && w.length >= 2);
            const mc = woerter(k.matchcode).filter(w => !RECHTSFORM.test(w) && w.length >= 3 && !name.includes(w));
            const e = {
                k, name, mc,
                voll: norm(k.name).replace(/[^a-z0-9]+/g, ' ').trim(),
                ort: woerter(k.city),
                plz: String(k.zip_code || '').trim(),
                nr: [k.customer_number, k.address_number].map(x => String(x || '').trim()).filter(x => x.length >= 3),
                str: woerter(k.street).filter(w => w.length >= 5 && !/^(strasse|str|weg|allee|platz|ring)$/.test(w)),
                dom: (String(k.email || '').split('@')[1] || '').toLowerCase().split('.').filter(x => x.length >= 4 && !/^(gmail|web|gmx|outlook|hotmail|yahoo|online|mail|t-online)$/.test(x))
            };
            new Set(e.name.concat(e.mc)).forEach(w => df.set(w, (df.get(w) || 0) + 1));
            return e;
        });
        const N = Math.max(eintraege.length, 1);
        const idf = w => Math.log((N + 1) / ((df.get(w) || 0) + 1));
        const maxIdf = Math.log(N + 1);
        idx = { eintraege, gewicht: w => Math.max(0.12, idf(w) / maxIdf) };
        idxN = kunden.length;
        return idx;
    }

    function adressen(text) {
        const tok = textTokens(text);
        if (!tok.length) return [];
        const { eintraege, gewicht } = index();
        const tnorm = ' ' + norm(text).replace(/[^a-z0-9]+/g, ' ') + ' ';
        // Kurze Zahlen nur als Kunden-/Adressnummer, wenn „Kunde/Nr." dabeisteht —
        // sonst wird „die 545" (Maschinentyp 5.45) zur Kundennummer 545.
        const nrKontext = /(kunde|kunden|kd|kdnr|kundennr|kundennummer|nr|nummer|adressnr|adressnummer)/.test(tnorm);
        const typen = new Set((window.machineList || []).map(m => ohnePunkt(m.name)).filter(x => /d/.test(x)));
        const out = [];
        for (const e of eintraege) {
            let s = 0;
            const grund = [];
            if (e.voll.length >= 5 && tnorm.includes(' ' + e.voll + ' ')) { s += 8; grund.push('Name'); }
            for (const t of tok) {
                if (/^\d+$/.test(t)) {
                    if (e.nr.includes(t) && (nrKontext || t.length >= 5) && !typen.has(t)) { s += 10; grund.push('Nr. ' + t); continue; }
                    if (t.length === 5 && t === e.plz) { s += 4; grund.push('PLZ'); continue; }
                    continue;
                }
                let best = 0, wo = '';
                for (const w of e.name.concat(e.mc)) {
                    const g = gewicht(w) * (e.name.includes(w) ? 1 : 0.8);
                    let p = 0;
                    if (t === w) p = 4 * g;
                    else if (t.length >= 4 && w.startsWith(t)) p = 2.6 * g;
                    else if (w.length >= 4 && t.startsWith(w) && t.length - w.length <= 3) p = 2.4 * g;
                    else { const tol = tippToleranz(w); if (tol && abstand(t, w, tol) <= tol) p = 2.2 * g; }
                    if (p > best) { best = p; wo = w; }
                }
                if (best) { s += best; grund.push(wo); continue; }
                if (e.ort.includes(t)) { s += 2.5; grund.push('Ort'); continue; }
                if (e.ort.some(o => tippToleranz(o) && abstand(t, o, tippToleranz(o)) <= tippToleranz(o))) { s += 1.5; grund.push('Ort~'); continue; }
                if (e.str.includes(t)) { s += 1.5; grund.push('Straße'); continue; }
                if (e.dom.includes(t)) { s += 3; grund.push('Mail-Domain'); }
            }
            if (s >= 2.2) out.push({ k: e.k, score: Math.round(s * 10) / 10, grund: [...new Set(grund)].join(', ') });
        }
        return out.sort((a, b) => b.score - a.score).slice(0, 15);
    }

    // ---------------------------------------------------------------- Maschinen
    function maschinen(text, adrTreffer) {
        const liste = window.machineList || [];
        const tok = textTokens(text);
        const tn = ' ' + norm(text).replace(/(\d),(\d)/g, '$1.$2') + ' ';
        const tz = tok.map(ohnePunkt);
        // Kundenverknüpfung zählt voll nur bei eindeutig erkannter Adresse,
        // sonst kaum — eine Adresse weiter hinten in der Liste ist nur geraten.
        const sicher = eindeutig(adrTreffer, 4);
        const kundeIds = new Map((adrTreffer || []).slice(0, 5).map(a => [String(a.k.id), sicher && a === sicher ? 4 : 1]));
        const kundeNamen = (sicher ? [sicher] : []).map(a => norm(a.k.name).replace(/[^a-z0-9]+/g, ' ').trim()).filter(Boolean);
        // Häufigkeit je Typ-Kürzel: gibt es „16.55" zweimal, zählt der Typ allein weniger
        const typAnzahl = new Map();
        liste.forEach(m => { const k = ohnePunkt(m.name); if (k) typAnzahl.set(k, (typAnzahl.get(k) || 0) + 1); });

        const out = [];
        for (const m of liste) {
            let s = 0;
            const grund = [];
            const typ = norm(m.name).trim();
            const typZ = ohnePunkt(m.name);
            const sn = ohnePunkt(m.serial || m.serial_number);
            // Typ wie geschrieben („5.45", „250 evo ii") oder ohne Punkt („545")
            if (typ.length >= 3 && /\d/.test(typ) && new RegExp('(?<![a-z0-9.,])' + typ.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![a-z0-9]|[.,]\\d)').test(tn)) {
                s += typAnzahl.get(typZ) > 1 ? 3 : 6; grund.push('Typ ' + m.name);
            } else if (typZ.length >= 3 && /\d/.test(typZ) && tz.includes(typZ)) {
                s += typAnzahl.get(typZ) > 1 ? 2 : 4; grund.push('Typ ' + m.name);
            }
            if (sn.length >= 3 && tz.includes(sn)) { s += 8; grund.push('SN ' + (m.serial || m.serial_number)); }
            else if (sn.length >= 6 && tz.some(t => t.length >= 4 && sn.endsWith(t))) { s += 3; grund.push('SN-Ende'); }
            const her = woerter(m.manufacturer).filter(w => w.length >= 3);
            if (her.some(h => tok.includes(h) || tok.some(t => t.length >= 4 && tippToleranz(h) && abstand(t, h, tippToleranz(h)) <= tippToleranz(h)))) { s += 1.5; grund.push(m.manufacturer); }
            // Kunde/Standort
            if (m.customer_id && kundeIds.has(String(m.customer_id))) { s += kundeIds.get(String(m.customer_id)); grund.push('Adresse'); }
            else {
                const firmen = [m.company, m.location_company].map(f => norm(f).replace(/[^a-z0-9]+/g, ' ').trim()).filter(f => f.length >= 4);
                if (firmen.some(f => kundeNamen.some(k => f === k || f.startsWith(k) || k.startsWith(f)))) { s += 3; grund.push('Firma'); }
                else {
                    const fw = woerter([m.company, m.location_company].join(' ')).filter(w => w.length >= 5 && !RECHTSFORM.test(w) && !/^(recycling|service|entsorgung|gesellschaft|deutschland|handel)$/.test(w));
                    if (fw.some(w => tok.includes(w))) { s += 2; grund.push('Firma'); }
                }
            }
            const orte = woerter([m.location_city, m.operator_city, m.location].join(' ')).filter(w => w.length >= 4);
            if (orte.some(o => tok.includes(o))) { s += 1; grund.push('Ort'); }
            if (s >= 2) out.push({ m, score: Math.round(s * 10) / 10, grund: [...new Set(grund)].join(', ') });
        }
        return out.sort((a, b) => b.score - a.score).slice(0, 25);
    }

    // Bester Treffer, wenn er klar vorn liegt: Mindestpunkte und deutlicher Abstand.
    // Zwei Wege: genug Punkte und deutlich vorn — oder etwas weniger Punkte,
    // aber kein ernsthafter Mitbewerber (Einzelname wie „Kirchmayr").
    function eindeutig(liste, min) {
        if (!liste || !liste.length) return null;
        const a = liste[0], b = liste[1];
        const m = min || 5;
        if (a.score >= m && (!b || b.score <= a.score * 0.7)) return a;
        if (a.score >= m * 0.7 && (!b || b.score <= a.score * 0.5)) return a;
        return null;
    }

    window.kiErkennung = { adressen, maschinen, eindeutig, _norm: norm };
})();
