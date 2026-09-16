// ==========================================================
// NACHSCHLAGE-CACHES: Kunden-Suche und Maschinen-Index
// ==========================================================
// Warum: Die Kunden-Suchfelder (Maschine anlegen: Kunde/Betreiber/Standort,
// Vorgang: Absender/Empfänger/Adresse) schickten bei jedem Tippen eine
// eigene Abfrage an Supabase — jede Eingabe wartete auf den Server.
// Hier wird die Kundenliste EINMAL geladen (schlanke Spalten) und danach
// im Browser durchsucht; das Ergebnis steht sofort.
// Realtime (addressbook-live.js) meldet Änderungen und wirft den Cache weg,
// beim nächsten Zugriff wird neu geladen.
//
// Zusätzlich: window.machineById(id) — Index über window.machineList, damit
// getMachineName & Co. nicht bei jedem Aufruf die ganze Liste durchlaufen.
// ==========================================================
(function () {
    'use strict';

    const SPALTEN = 'id, name, matchcode, customer_number, address_number, street, zip_code, city, country, email';

    let kunden = null;          // Array der Kunden oder null (= muss geladen werden)
    let ladeVorgang = null;     // laufendes Promise, damit parallele Aufrufe nur einmal laden
    let suchIndex = null;       // [{ k, text }] – lowercased Suchtext je Kunde

    function baueIndex(liste) {
        return liste.map(k => ({
            k,
            text: [k.name, k.matchcode, k.customer_number, k.address_number, k.email, k.city, k.zip_code]
                .map(v => (v == null ? '' : String(v)).toLowerCase()).join(' ')
        }));
    }

    // Liefert die komplette Kundenliste (sortiert nach Name). Lädt nur beim ersten
    // Aufruf bzw. nach customerCacheInvalidate().
    window.customerCacheGet = function () {
        if (kunden) return Promise.resolve(kunden);
        if (ladeVorgang) return ladeVorgang;
        if (!window.supabaseClient) return Promise.resolve([]);
        ladeVorgang = window.supabaseClient
            .from('customers')
            .select(SPALTEN)
            .order('name')
            .then(({ data, error }) => {
                ladeVorgang = null;
                if (error) { console.warn('Kunden-Cache konnte nicht laden:', error); return kunden || []; }
                kunden = data || [];
                suchIndex = baueIndex(kunden);
                return kunden;
            }, err => {
                ladeVorgang = null;
                console.warn('Kunden-Cache konnte nicht laden:', err);
                return kunden || [];
            });
        return ladeVorgang;
    };

    // Ohne Netz: was schon da ist (oder leer). Für synchrone Filterfunktionen.
    window.customerCacheSync = function () { return kunden || []; };

    // Realtime meldet eine Änderung → beim nächsten Zugriff frisch laden.
    // Bei INSERT/UPDATE mit vollständiger Zeile wird direkt eingepflegt, damit
    // nicht bei jedem Tippen im Adressbuch die ganze Liste neu geladen wird.
    window.customerCacheInvalidate = function (payload) {
        if (!kunden) return;
        const neu = payload && payload.new && payload.new.id != null ? payload.new : null;
        const alt = payload && payload.old && payload.old.id != null ? payload.old.id : null;
        if (payload && payload.eventType === 'DELETE' && alt != null) {
            kunden = kunden.filter(k => String(k.id) !== String(alt));
            suchIndex = baueIndex(kunden);
            return;
        }
        if (neu && ('name' in neu)) {
            const idx = kunden.findIndex(k => String(k.id) === String(neu.id));
            const eintrag = {};
            SPALTEN.split(',').map(s => s.trim()).forEach(sp => { eintrag[sp] = neu[sp] !== undefined ? neu[sp] : (idx >= 0 ? kunden[idx][sp] : null); });
            if (idx >= 0) kunden[idx] = eintrag; else kunden.push(eintrag);
            kunden.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'de'));
            suchIndex = baueIndex(kunden);
            return;
        }
        kunden = null;
        suchIndex = null;
    };

    // Suche im Browser: alle Wörter der Eingabe müssen vorkommen (Reihenfolge egal).
    // Treffer, bei denen der Name mit dem Suchbegriff beginnt, stehen vorn.
    window.customerCacheSearch = async function (query, limit) {
        await window.customerCacheGet();
        return window.customerCacheSearchSync(query, limit);
    };

    window.customerCacheSearchSync = function (query, limit) {
        if (!suchIndex) return [];
        const q = (query || '').toLowerCase().trim();
        const tokens = q.split(/\s+/).filter(Boolean);
        const max = limit || 10;
        if (!tokens.length) return kunden.slice(0, max);
        const vorn = [], hinten = [];
        for (let i = 0; i < suchIndex.length; i++) {
            const e = suchIndex[i];
            let ok = true;
            for (let t = 0; t < tokens.length; t++) {
                if (e.text.indexOf(tokens[t]) === -1) { ok = false; break; }
            }
            if (!ok) continue;
            const name = (e.k.name || '').toLowerCase();
            if (name.startsWith(q) || (e.k.matchcode || '').toLowerCase().startsWith(q)) vorn.push(e.k);
            else hinten.push(e.k);
            if (vorn.length >= max) break;
        }
        return vorn.concat(hinten).slice(0, max);
    };

    // Im Hintergrund vorladen (nach dem Login), damit die erste Suche nicht wartet.
    window.customerCachePrefetch = function () {
        try { window.customerCacheGet(); } catch (e) { /* egal */ }
    };

    // ----------------------------------------------------------
    // Maschinen-Index: id → Maschine. Wird neu gebaut, sobald sich
    // window.machineList (Referenz oder Länge) geändert hat.
    // ----------------------------------------------------------
    let indexQuelle = null, indexLaenge = -1, indexMap = null;
    window.machineById = function (id) {
        const liste = window.machineList || [];
        if (liste !== indexQuelle || liste.length !== indexLaenge) {
            indexQuelle = liste; indexLaenge = liste.length;
            indexMap = new Map();
            for (let i = 0; i < liste.length; i++) indexMap.set(String(liste[i].id), liste[i]);
        }
        return indexMap.get(String(id)) || null;
    };
})();

// Anzeigename einer Maschine ("Hersteller Name #Serie (Baujahr)") direkt aus
// dem Objekt — gleiche Form wie window.getMachineName(id), aber ohne Suche.
window.machineLabel = function (m) {
    if (!m) return '-';
    const serial = m.serial_number || m.serial;
    return [m.manufacturer, m.name, serial ? `#${serial}` : null, m.year ? `(${m.year})` : null].filter(Boolean).join(' ');
};
