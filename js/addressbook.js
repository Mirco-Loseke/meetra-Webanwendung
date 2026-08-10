// ==========================================
// ADRESSBUCH MODULE
// ==========================================
// Outlook-artige Kontaktseite: alle Adressen aus `customers` als Glas-Visitenkarten,
// mit Suche, Filtern, Detailansicht (Ansprechpartner / Maschinen / Verknüpfungen /
// Historie), Anlegen, Bearbeiten und endgültigem Löschen.
//
// Benötigt die Migration `supabase_add_addressbook.sql`
// (Spalten website/notes/is_customer + Tabellen customer_contacts,
//  customer_links, customer_notes).

(function () {
    'use strict';

    console.log('Loading addressbook module...');

    const PAGE_SIZE = 60;          // Karten pro Render-Schritt (Infinite Scroll)
    const FETCH_CHUNK = 1000;      // Supabase-Range pro Request

    let LINK_TYPES = [
        { value: 'lieferadresse', label: 'Lieferadresse', color: '#38bdf8' },
        { value: 'rechnungsadresse', label: 'Rechnungsadresse', color: '#f59e0b' },
        { value: 'zentrale', label: 'Zentrale / Hauptsitz', color: '#22c55e' },
        { value: 'filiale', label: 'Filiale / Standort', color: '#a78bfa' },
        { value: 'konzern', label: 'Konzernverbund', color: '#f472b6' },
        { value: 'sonstige', label: 'Sonstige', color: '#94a3b8' }
    ];

    function getLinkTypes() {
        const custom = (window.categoryList || []).filter(c => c.type === 'link');
        if (!custom || custom.length === 0) return LINK_TYPES;
        return custom.map(c => ({
            value: c.name.toLowerCase().replace(/\s+/g, '_'),
            label: c.name,
            color: c.color || '#38bdf8'
        }));
    }

    const ENTRY_TYPES = [
        { value: 'note', label: 'Notiz', icon: 'note', color: '#94a3b8' },
        { value: 'call', label: 'Telefonat', icon: 'phone', color: '#38bdf8' },
        { value: 'email', label: 'E-Mail', icon: 'mail', color: '#a78bfa' },
        { value: 'visit', label: 'Besuch', icon: 'pin', color: '#22c55e' },
        { value: 'meeting', label: 'Termin', icon: 'cal', color: '#f59e0b' },
        { value: 'system', label: 'System', icon: 'gear', color: '#64748b' }
    ];

    const state = {
        addresses: [],
        byId: new Map(),
        machinesByCustomer: new Map(),
        unassignedMachines: [],
        machineCount: 0,
        workshopAddressId: null,
        ownCompanyTokens: null,
        ownCompanyNorm: '',
        contactCount: new Map(),
        linkCount: new Map(),
        filtered: [],
        rendered: 0,
        search: '',
        contactFilter: ['all'],
        addressTypeFilter: ['all'],
        typeFilter: 'all',      // all | customers | noncustomers | withmachines
        countryFilter: 'all',
        sort: 'name',           // name | city | machines | customer_number
        loading: false,
        loaded: false,
        migrationMissing: false,
        manufacturerMissing: false,
        currentId: null,
        // Auswahlmodus zum Zusammenstellen einer Route: selection hält die
        // Adress-IDs in der Reihenfolge, in der sie angeklickt wurden.
        selectMode: false,
        selection: [],
        detailTab: 'overview',
        detail: { contacts: [], links: [], notes: [], machines: [], tasks: [], linkedMachines: new Map(), linkedContacts: new Map(), clusterMeta: new Map() }
    };

    window.addressbookState = state;

    // ==========================================
    // HELFER
    // ==========================================
    function esc(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function val(id) {
        const el = document.getElementById(id);
        return el ? el.value.trim() : '';
    }

    function checked(id) {
        const el = document.getElementById(id);
        return !!(el && el.checked);
    }

    function isCustomer(a) {
        if (!a) return false;
        if (a.is_customer === true) return true;
        return !!(a.customer_number && String(a.customer_number).trim() !== '');
    }

    function initials(name) {
        if (!name) return '?';
        const parts = String(name).trim().split(/[\s\-\/]+/).filter(Boolean);
        if (!parts.length) return '?';
        if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
        return (parts[0][0] + parts[1][0]).toUpperCase();
    }

    // Stabile Farbe pro Adresse, damit Karten optisch unterscheidbar bleiben.
    function avatarHue(name) {
        let hash = 0;
        const s = String(name || '');
        for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) % 360;
        return hash;
    }

    function normalizeUrl(url) {
        if (!url) return '';
        const u = String(url).trim();
        if (!u) return '';
        if (/^https?:\/\//i.test(u)) return u;
        return 'https://' + u;
    }

    // Die Spalte heißt in der Datenbank is_in_workshop; an einzelnen Stellen
    // taucht historisch in_workshop auf – beide Schreibweisen akzeptieren.
    function isInWorkshop(m) {
        return m.is_in_workshop === true || m.in_workshop === true;
    }

    // ---------- Normalisierung für den Adressabgleich ----------
    // Der Maschinenstandort ist an der Maschine reiner Freitext. Damit
    // "Hauptstr. 5" und "Hauptstraße 5" bzw. "Groß-Umstadt" und "Gross Umstadt"
    // als dieselbe Adresse erkannt werden, wird beides hart normalisiert.
    function normText(value) {
        return String(value || '')
            .toLowerCase()
            .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
            .replace(/[^a-z0-9]+/g, ' ')
            .trim();
    }

    function normStreet(value) {
        return normText(value)
            .replace(/\b(strasse|str|st)\b/g, 'strasse')
            .replace(/\s+/g, ' ')
            .trim();
    }

    // Firmenbezeichnungen ohne Rechtsform vergleichen ("Muster GmbH & Co. KG" ≈ "Muster")
    function normCompany(value) {
        return normText(value)
            .replace(/\b(gmbh|mbh|ag|kg|ohg|gbr|co|ug|se|ev|eg|und|the|inc|ltd)\b/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    // BFS über die Verknüpfungen im Cluster. Für jede Cluster-Adresse liefern
    // wir Meta-Info: entweder eine direkte Verknüpfung (mit link-Row zum
    // Löschen) oder eine transitive (via = ID der Zwischenadresse, über die
    // sie erreichbar ist).
    function buildClusterMeta(currentKey, allLinks) {
        const neighbors = new Map();
        const add = (a, b, link) => {
            if (!neighbors.has(a)) neighbors.set(a, []);
            neighbors.get(a).push({ other: b, link });
        };
        allLinks.forEach(l => {
            add(String(l.customer_id), String(l.linked_customer_id), l);
            add(String(l.linked_customer_id), String(l.customer_id), l);
        });

        const meta = new Map();
        const visited = new Set([currentKey]);
        let frontier = [{ id: currentKey, depth: 0 }];
        while (frontier.length) {
            const next = [];
            frontier.forEach(({ id, depth }) => {
                (neighbors.get(id) || []).forEach(({ other, link }) => {
                    if (visited.has(other)) return;
                    visited.add(other);
                    meta.set(other, depth === 0
                        ? { direct: true, link }
                        : { direct: false, viaId: id, viaLinkType: link.link_type });
                    next.push({ id: other, depth: depth + 1 });
                });
            });
            frontier = next;
        }
        return meta;
    }

    function linkTypeMeta(type) {
        const types = getLinkTypes();
        return types.find(t => t.value === type || t.label.toLowerCase() === (type || '').toLowerCase()) ||
               LINK_TYPES.find(t => t.value === type) ||
               { value: type, label: type, color: '#38bdf8' };
    }

    function entryTypeMeta(type) {
        return ENTRY_TYPES.find(t => t.value === type) || ENTRY_TYPES[0];
    }

    function formatDate(value) {
        if (!value) return '';
        const d = new Date(value);
        if (isNaN(d.getTime())) return '';
        return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }

    function formatDateTime(value) {
        if (!value) return '';
        const d = new Date(value);
        if (isNaN(d.getTime())) return '';
        return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
            + ', ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    }

    function currentAuthor() {
        return (window.activeUser && window.activeUser.name)
            || (window.currentUser && window.currentUser.name)
            || null;
    }

    function sb() {
        if (!window.supabaseClient) throw new Error('Supabase Client nicht initialisiert');
        return window.supabaseClient;
    }

    function toast(msg, isError) {
        if (typeof window.showToast === 'function') {
            window.showToast(msg, isError ? 'error' : 'success');
            return;
        }
        if (isError) window.showToast(msg); else console.log('[Adressbuch]', msg);
    }

    const icon = {
        phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>',
        mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>',
        globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
        pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>',
        user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
        link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
        machine: '<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><rect x="38" y="30" width="28" height="22" rx="3"/><line x1="62" y1="34" x2="88" y2="18"/><line x1="88" y1="18" x2="92" y2="46"/><path d="M92 46 L80 56 L72 50 L84 40 Z"/><rect x="20" y="54" width="58" height="14" rx="4"/><rect x="14" y="63" width="70" height="10" rx="5"/><circle cx="22" cy="68" r="7"/><circle cx="76" cy="68" r="7"/></svg>',
        note: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg>',
        cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
        gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.2.61.75 1.03 1.51 1.09H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
        trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
        edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>',
        plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
        close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
        check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
        route: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="7" r="3"/><circle cx="18" cy="17" r="3"/><path d="M8.5 8.5c1.5 2 3 2.5 4.5 2.5s5-1 5.5 3"/></svg>',
        history: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><path d="M12 7v5l4 2"/></svg>'
    };

    function ic(name, size, cls) {
        const svg = icon[name] || '';
        if (!svg) return '';
        const s = size || 16;
        return svg.replace('<svg ', `<svg class="ab-ic ${cls || ''}" width="${s}" height="${s}" `);
    }

    // ==========================================
    // DATEN LADEN
    // ==========================================
    async function fetchAllRows(table, columns, orderCol) {
        const out = [];
        let from = 0;
        for (;;) {
            let query = sb().from(table).select(columns).range(from, from + FETCH_CHUNK - 1);
            if (orderCol) query = query.order(orderCol, { ascending: true });
            const { data, error } = await query;
            if (error) throw error;
            out.push(...(data || []));
            if (!data || data.length < FETCH_CHUNK) break;
            from += FETCH_CHUNK;
        }
        return out;
    }

    window.loadAddressbook = async function (force) {
        if (state.loading) return;
        if (state.loaded && !force) {
            renderAddressList();
            return;
        }
        state.loading = true;
        renderLoading();

        try {
            const BASE_COLS = 'id, address_number, customer_number, address_type, contact_type, name, matchcode, street, zip_code, city, country, phone, email';
            const EXTRA_COLS = ', website, notes, is_customer';

            // manufacturer kommt aus supabase_add_manufacturer_category.sql und wird
            // separat behandelt, damit ein fehlendes Feld nicht auch Webseite/Notiz kippt.
            const MANUFACTURER_COL = ', manufacturer';
            const isMissingColumn = (err) => err && (err.code === '42703' || /does not exist/i.test(err.message || ''));

            // Adressen mit absteigendem Spaltenumfang laden: fehlt eine Migration,
            // bleibt die Seite nutzbar – nur ohne die betroffenen Felder.
            async function ladeAdressen() {
                try {
                    const rows = await fetchAllRows('customers', BASE_COLS + EXTRA_COLS + MANUFACTURER_COL, 'name');
                    state.migrationMissing = false;
                    state.manufacturerMissing = false;
                    return rows;
                } catch (errManu) {
                    if (!isMissingColumn(errManu)) throw errManu;
                    state.manufacturerMissing = true;
                    console.warn('Adressbuch: Spalte "manufacturer" fehlt – bitte supabase_add_manufacturer_category.sql ausführen.');
                    try {
                        const rows = await fetchAllRows('customers', BASE_COLS + EXTRA_COLS, 'name');
                        state.migrationMissing = false;
                        return rows;
                    } catch (err) {
                        // 42703 = undefined_column: supabase_add_addressbook.sql wurde noch nicht ausgeführt.
                        if (!isMissingColumn(err)) throw err;
                        console.warn('Adressbuch: Zusatzspalten fehlen – bitte supabase_add_addressbook.sql ausführen.');
                        state.migrationMissing = true;
                        return await fetchAllRows('customers', BASE_COLS, 'name');
                    }
                }
            }

            // Die vier Tabellen hängen beim LADEN nicht voneinander ab – nur beim
            // Auswerten. Früher lief jede Abfrage erst nach der vorherigen, die
            // Wartezeiten addierten sich. Jetzt laufen sie gleichzeitig; es zählt
            // nur noch die langsamste statt der Summe.
            // Nur die Adressen sind zwingend: fehlt eine der anderen Tabellen
            // (Migration nicht ausgeführt), bleibt das Adressbuch benutzbar.
            const optional = (name, p) => p.catch(err => {
                console.warn('Adressbuch: ' + name + ' konnten nicht geladen werden', err);
                return null;
            });

            const [addresses, machinesRows, contactRows, linkRows] = await Promise.all([
                ladeAdressen(),
                optional('Maschinen', fetchAllRows('machines', '*')),
                optional('Ansprechpartner', fetchAllRows('customer_contacts', 'id, customer_id')),
                optional('Verknüpfungen', fetchAllRows('customer_links', 'id, customer_id, linked_customer_id'))
            ]);

            state.addresses = addresses;
            state.byId = new Map(addresses.map(a => [String(a.id), a]));

            // Maschinen je Adresse (nur IDs/Kurzdaten – für Zähler auf der Karte)
            // Priorität: Maschinenstandort (location) hat Vorrang vor Betreiber (customer_id).
            // Wenn ein Standort gesetzt ist, erscheint die Maschine NUR dort – nicht beim Betreiber.
            state.machinesByCustomer = new Map();
            state.unassignedMachines = [];
            try {
                const machines = machinesRows || [];
                state.machineCount = machines.length;
                state.workshopMachineCount = machines.filter(isInWorkshop).length;
                const byCustomerNumber = buildCustomerNumberIndex(addresses);
                state.workshopAddressId = await resolveWorkshopAddressId(addresses);

                machines.forEach(m => {
                    const match = resolveMachineAddress(m, addresses, byCustomerNumber);

                    // Wie sicher die Zuordnung ist, hängt an der Maschine – die
                    // Karte zeigt bei geratenen Treffern einen Hinweis an.
                    m.__abMatch = match ? match.reason : null;
                    m.__abGuessed = !!(match && match.guessed);

                    if (!match) {
                        state.unassignedMachines.push(m);
                        return;
                    }

                    const key = String(match.id);
                    if (!state.machinesByCustomer.has(key)) state.machinesByCustomer.set(key, new Map());
                    state.machinesByCustomer.get(key).set(String(m.id), m);
                });
                // Map<addrId, Map<machineId, machine>> → Map<addrId, machine[]>
                state.machinesByCustomer.forEach((machMap, key) => {
                    state.machinesByCustomer.set(key, Array.from(machMap.values()));
                });

                // Hersteller der Maschinen als Tag an der Adresse hinterlegen.
                await syncManufacturersFromMachines();
            } catch (err) {
                console.warn('Adressbuch: Maschinen konnten nicht geladen werden', err);
            }

            state.contactCount = new Map();
            try {
                const contacts = contactRows || [];
                contacts.forEach(c => {
                    const key = String(c.customer_id);
                    state.contactCount.set(key, (state.contactCount.get(key) || 0) + 1);
                });
            } catch (err) {
                console.warn('Adressbuch: Ansprechpartner-Tabelle nicht verfügbar (Migration ausgeführt?)', err);
            }

            state.linkCount = new Map();
            state.allLinks = [];
            try {
                const links = linkRows || [];
                state.allLinks = links;
                links.forEach(l => {
                    [l.customer_id, l.linked_customer_id].forEach(id => {
                        const key = String(id);
                        state.linkCount.set(key, (state.linkCount.get(key) || 0) + 1);
                    });
                });

                // Rückwirkenden Abgleich aller Adresstypen & Hersteller in bestehenden Cluster-Netzwerken ausführen
                await syncClusterTags();
            } catch (err) {
                console.warn('Adressbuch: Verknüpfungs-Tabelle nicht verfügbar (Migration ausgeführt?)', err);
            }

            state.loaded = true;
            buildCountryFilter();
            if (typeof window.renderABContactFilterOptions === 'function') window.renderABContactFilterOptions();
            if (typeof window.renderABAddressTypeFilterOptions === 'function') window.renderABAddressTypeFilterOptions();
            renderAddressList();
        } catch (err) {
            console.error('Adressbuch konnte nicht geladen werden:', err);
            const container = document.getElementById('addressbook-list');
            if (container) {
                container.innerHTML = `<div class="ab-empty">
                    <div class="ab-empty-title">Adressen konnten nicht geladen werden</div>
                    <div class="ab-empty-text">${esc(err.message || err)}</div>
                </div>`;
            }
        } finally {
            state.loading = false;
        }
    };

    // ─────────────────────────────────────────────────────────────────────────
    // Automatische Zuordnung Maschine → Adresse
    // ─────────────────────────────────────────────────────────────────────────
    // An einer Maschine stehen bis zu drei voneinander unabhängige Hinweise:
    // die Kundennummer, der Standort (location_*) und der Betreiber (customer_id
    // bzw. company/operator_*). Die Kaskade probiert sie der Reihe nach durch,
    // damit möglichst jede Maschine ohne Handarbeit an einer Adresse landet.
    //
    // Punkte: Firma 3 · Straße 3 · PLZ 2 · Ort 1. Ein "sicherer" Treffer braucht
    // 4 Punkte (also zwei unabhängige Übereinstimmungen) und muss eindeutig sein.
    // Bleibt sonst nichts übrig, wird der eindeutig beste Treffer auch mit
    // weniger Punkten genommen – dann aber als "vermutet" gekennzeichnet, statt
    // die Maschine gar nicht anzuzeigen.
    const MATCH_MIN_SCORE = 4;
    const MATCH_MIN_SCORE_GUESS = 1;

    // ─────────────────────────────────────────────────────────────────────────
    // Eigene Firmenadresse (Werkstatt)
    // ─────────────────────────────────────────────────────────────────────────
    // Maschinen in der Werkstatt stehen physisch bei uns, nicht beim Kunden.
    // Der Firmensitz kommt aus den Einstellungen (app_settings.company_hq,
    // lokal gespiegelt als meetra_company_hq) und wird über denselben
    // Punkte-Abgleich auf eine Adresse des Adressbuchs abgebildet.
    async function loadCompanyHq() {
        let hq = null;
        try {
            const { data } = await sb().from('app_settings').select('value').eq('key', 'company_hq').maybeSingle();
            if (data && data.value) hq = data.value;
        } catch (e) { /* offline oder Tabelle fehlt – gleich der lokale Fallback */ }

        if (!hq) {
            try { hq = JSON.parse(localStorage.getItem('meetra_company_hq') || 'null'); } catch (e) {}
        }
        return hq;
    }

    async function resolveWorkshopAddressId(addresses) {
        const hq = await loadCompanyHq();
        if (!hq) return null;

        const parts = {
            company: normCompany(hq.name),
            street: normStreet(hq.street),
            zip: normText(hq.zip),
            city: normText(hq.city)
        };

        let ownAddress = null;
        const hit = bestAddressMatch(parts, addresses, MATCH_MIN_SCORE, null);
        if (hit) ownAddress = hit.address;

        // Notnagel: Adresse, deren Name den Firmennamen enthält (z. B. "meetra
        // Recycling Maschinen GmbH" gegenüber "meetra GmbH" in den Einstellungen).
        const firstWord = parts.company ? parts.company.split(' ')[0] : '';
        if (!ownAddress && firstWord && firstWord.length >= 4) {
            const candidates = addresses.filter(a => normCompany(a.name).split(' ').includes(firstWord));
            if (candidates.length === 1) ownAddress = candidates[0];
        }

        if (!ownAddress) return null;

        // Erkennungsmerkmale der eigenen Firma merken. Damit reicht später schon
        // ein "meetra" im Firmen- oder Standortfeld einer Maschine, um sie hier
        // einzusortieren – auch ohne Straße oder PLZ.
        //
        // Wichtig: nur Wörter behalten, die in KEINER anderen Adresse vorkommen.
        // Sonst würde ein Allerweltswort aus dem eigenen Firmennamen ("Recycling",
        // "Maschinen") jede gleichnamige Kundenadresse zu uns umleiten.
        const foreignWords = new Set();
        addresses.forEach(a => {
            if (String(a.id) === String(ownAddress.id)) return;
            normCompany(a.name).split(' ').forEach(w => { if (w) foreignWords.add(w); });
            normCompany(a.matchcode).split(' ').forEach(w => { if (w) foreignWords.add(w); });
        });

        state.ownCompanyTokens = new Set(
            [firstWord, ...normCompany(ownAddress.name).split(' ')]
                .filter(w => w && w.length >= 4 && !foreignWords.has(w))
        );
        state.ownCompanyNorm = normCompany(ownAddress.name);

        return String(ownAddress.id);
    }

    // Bezeichnet dieser Freitext unsere eigene Firma? Wird bewusst großzügig
    // geprüft (Teilwort genügt), weil die eigene Firma eindeutig ist – anders
    // als bei Kundenadressen droht hier keine Verwechslung.
    function mentionsOwnCompany(value) {
        const tokens = state.ownCompanyTokens;
        if (!tokens || !tokens.size) return false;
        const words = normCompany(value).split(' ').filter(Boolean);
        if (!words.length) return false;
        return words.some(w => tokens.has(w));
    }

    function buildCustomerNumberIndex(addresses) {
        const index = new Map();
        addresses.forEach(a => {
            const num = normText(a.customer_number);
            if (!num) return;
            // Doppelt vergebene Nummern sind nicht eindeutig → unbrauchbar.
            index.set(num, index.has(num) ? null : a);
        });
        return index;
    }

    function scoreAddress(a, parts) {
        let score = 0;
        if (parts.company) {
            const name = normCompany(a.name);
            const match = normCompany(a.matchcode);
            if ((name && name === parts.company) || (match && match === parts.company)) score += 3;
        }
        if (parts.street && normStreet(a.street) === parts.street) score += 3;
        if (parts.zip && normText(a.zip_code) === parts.zip) score += 2;
        if (parts.city && normText(a.city) === parts.city) score += 1;
        return score;
    }

    function hasParts(parts) {
        return !!(parts.company || parts.street || parts.zip || parts.city);
    }

    // Bester eindeutiger Treffer. Gleichstand zählt nicht als Treffer – lieber
    // gar keine Zuordnung als die falsche von fünf gleich guten.
    function bestAddressMatch(parts, addresses, minScore, excludeId) {
        if (!hasParts(parts)) return null;
        let best = null, bestScore = 0, tie = false;
        addresses.forEach(a => {
            if (excludeId && String(a.id) === String(excludeId)) return;
            const score = scoreAddress(a, parts);
            if (score > bestScore) {
                bestScore = score; best = a; tie = false;
            } else if (score === bestScore && score > 0) {
                tie = true;
            }
        });
        if (!best || tie || bestScore < minScore) return null;
        return { address: best, score: bestScore };
    }

    function locationParts(m) {
        return {
            company: normCompany(m.location_company),
            street: normStreet(m.location_street),
            zip: normText(m.location_zip),
            city: normText(m.location_city)
        };
    }

    function operatorParts(m) {
        return {
            company: normCompany(m.company),
            street: normStreet(m.operator_street),
            zip: normText(m.operator_zip),
            city: normText(m.operator_city)
        };
    }

    function resolveMachineAddress(m, addresses, byCustomerNumber) {
        const locParts = locationParts(m);
        const opParts = operatorParts(m);

        // ── Stufe 0: bei uns im Haus ─────────────────────────────────────────
        // Zwei Fälle landen bei der eigenen Firmenadresse: die als Werkstatt
        // markierten Maschinen UND alle, bei denen als Standort oder Betreiber
        // schlicht die eigene Firma eingetragen ist. Für Letzteres genügt der
        // Firmenname im Freitext – Straße/PLZ müssen nicht gepflegt sein.
        if (state.workshopAddressId) {
            if (isInWorkshop(m)) {
                return { id: state.workshopAddressId, reason: 'In der Werkstatt', guessed: false };
            }
            if (mentionsOwnCompany(m.location_company)) {
                return { id: state.workshopAddressId, reason: 'Standort: eigene Firma', guessed: false };
            }
            // Betreiber "eigene Firma" nur, wenn kein abweichender Standort
            // gepflegt ist – sonst steht die Maschine ja beim Kunden.
            const hasOtherLocation = !!(m.location_street || m.location_city || m.location_company);
            if (!hasOtherLocation && mentionsOwnCompany(m.company)) {
                return { id: state.workshopAddressId, reason: 'Betreiber: eigene Firma', guessed: false };
            }
            if (!hasOtherLocation && m.customer_id && String(m.customer_id) === String(state.workshopAddressId)) {
                return { id: state.workshopAddressId, reason: 'Betreiber: eigene Firma', guessed: false };
            }
        }

        // ── Stufe 1: Standort ────────────────────────────────────────────────
        // Der Standort hat Vorrang – dort steht die Maschine tatsächlich.
        const explicitLoc = m.location_customer_id || m.location_id;
        if (explicitLoc && state.byId.has(String(explicitLoc))) {
            return { id: String(explicitLoc), reason: 'Standort (hinterlegt)', guessed: false };
        }

        // Ist der Standort nur die abgeschriebene Betreiberadresse, zählt er
        // nicht als eigener Standort und wir gehen weiter zum Betreiber.
        const operator = m.customer_id ? state.byId.get(String(m.customer_id)) : null;
        const locIsOperator = operator && scoreAddress(operator, locParts) >= MATCH_MIN_SCORE;

        if (!locIsOperator) {
            const loc = bestAddressMatch(locParts, addresses, MATCH_MIN_SCORE, operator && operator.id);
            if (loc) return { id: String(loc.address.id), reason: 'Standort erkannt', guessed: false };
        }

        // ── Stufe 2: Betreiber ───────────────────────────────────────────────
        if (operator) {
            return { id: String(operator.id), reason: 'Betreiber', guessed: false };
        }

        // ── Stufe 3: Kundennummer ────────────────────────────────────────────
        // Eindeutiger Schlüssel, wenn er auf beiden Seiten gepflegt ist.
        const custNum = normText(m.customer_number);
        if (custNum && byCustomerNumber.get(custNum)) {
            return { id: String(byCustomerNumber.get(custNum).id), reason: 'Kundennummer', guessed: false };
        }

        // ── Stufe 4: Betreiberadresse aus dem Freitext ───────────────────────
        // Maschinen ohne customer_id, aber mit Firma/Straße/Ort des Betreibers.
        const op = bestAddressMatch(opParts, addresses, MATCH_MIN_SCORE, null);
        if (op) return { id: String(op.address.id), reason: 'Betreiber erkannt', guessed: false };

        // ── Stufe 5: bester eindeutiger Treffer, auch schwach ────────────────
        // Lieber eine markierte Vermutung als eine Maschine, die nirgends auftaucht.
        const guess = bestAddressMatch(locParts, addresses, MATCH_MIN_SCORE_GUESS, null)
                   || bestAddressMatch(opParts, addresses, MATCH_MIN_SCORE_GUESS, null);
        if (guess) return { id: String(guess.address.id), reason: 'vermutet', guessed: true };

        return null;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Hersteller-Tags aus den Maschinen übernehmen
    // ─────────────────────────────────────────────────────────────────────────
    // Steht an einer Adresse eine Maschine, gehört deren Hersteller auch als Tag
    // an die Adresse. Das läuft bei jedem Laden des Adressbuchs und nach jedem
    // Zuordnen automatisch mit.
    //
    // Bewusst nur ERGÄNZEND: bereits gesetzte Hersteller bleiben stehen, auch
    // wenn gerade keine passende Maschine (mehr) dort hängt. Sonst würde eine
    // von Hand gepflegte Angabe beim nächsten Laden kommentarlos verschwinden.
    async function syncManufacturersFromMachines() {
        if (state.manufacturerMissing) return;

        // Schreibweise der bereits angelegten Hersteller-Kategorien gewinnt,
        // damit nicht "backhus" und "BACKHUS" nebeneinander landen.
        const canonical = new Map();
        (window.categoryList || [])
            .filter(c => c.type === 'manufacturer')
            .forEach(c => {
                const name = (c.name || '').trim();
                if (name) canonical.set(name.toLowerCase(), name);
            });

        const pendingUpdates = [];
        const newCategories = new Set();

        state.machinesByCustomer.forEach((machines, addressId) => {
            const address = state.byId.get(String(addressId));
            if (!address) return;

            const existing = (address.manufacturer || '')
                .split(',').map(s => s.trim()).filter(Boolean);
            const existingLower = new Set(existing.map(s => s.toLowerCase()));

            const additions = [];
            machines.forEach(m => {
                const raw = (m.manufacturer || '').trim();
                if (!raw) return;
                const lower = raw.toLowerCase();
                if (existingLower.has(lower)) return;

                const name = canonical.get(lower) || raw;
                existingLower.add(lower);
                additions.push(name);
                if (!canonical.has(lower)) newCategories.add(name);
            });

            if (additions.length) {
                pendingUpdates.push({ address, value: existing.concat(additions).join(', ') });
            }
        });

        if (!pendingUpdates.length && !newCategories.size) return;

        // Fehlende Hersteller zusätzlich als Kategorie anlegen – sonst gäbe es
        // ein Tag an der Adresse, das in keiner Auswahlliste auftaucht.
        if (newCategories.size) {
            try {
                const { error } = await sb().from('categories').insert(
                    [...newCategories].map(name => ({ name, type: 'manufacturer', color: '#14b8a6' }))
                );
                if (error) throw error;
                if (typeof window.fetchCategories === 'function') await window.fetchCategories();
            } catch (err) {
                console.warn('Hersteller-Kategorien konnten nicht angelegt werden', err);
            }
        }

        for (const upd of pendingUpdates) {
            try {
                const { error } = await sb().from('customers')
                    .update({ manufacturer: upd.value }).eq('id', upd.address.id);
                if (error) throw error;
                upd.address.manufacturer = upd.value;
            } catch (err) {
                console.warn('Hersteller konnte an der Adresse nicht gespeichert werden', upd.address.id, err);
            }
        }
    }

    // Synchronisiert hersteller & adresstypen rückwirkend über alle bestehenden Cluster hinweg
    async function syncClusterTags() {
        if (!state.allLinks || !state.allLinks.length) return;

        const visited = new Set();
        const pendingUpdates = [];

        state.allLinks.forEach(l => {
            const startId = String(l.customer_id);
            if (visited.has(startId)) return;

            const clusterMeta = buildClusterMeta(startId, state.allLinks);
            const clusterIds = [startId, ...Array.from(clusterMeta.keys())];
            clusterIds.forEach(id => visited.add(id));

            if (clusterIds.length < 2) return;

            const mfgSet = new Set();
            const typeSet = new Set();

            clusterIds.forEach(cid => {
                const addr = state.byId.get(String(cid));
                if (addr) {
                    (addr.manufacturer || '').split(',').map(s => s.trim()).filter(Boolean).forEach(m => mfgSet.add(m));
                    (addr.address_type || '').split(',').map(s => s.trim()).filter(Boolean).forEach(t => typeSet.add(t));
                }
            });

            const combinedMfg = Array.from(mfgSet).join(', ') || null;
            const combinedTypes = Array.from(typeSet).join(', ') || null;

            clusterIds.forEach(cid => {
                const addr = state.byId.get(String(cid));
                if (addr && (addr.manufacturer !== combinedMfg || addr.address_type !== combinedTypes)) {
                    pendingUpdates.push({ id: cid, addr, manufacturer: combinedMfg, address_type: combinedTypes });
                }
            });
        });

        if (!pendingUpdates.length) return;

        for (const upd of pendingUpdates) {
            try {
                await sb().from('customers')
                    .update({ manufacturer: upd.manufacturer, address_type: upd.address_type })
                    .eq('id', upd.id);

                upd.addr.manufacturer = upd.manufacturer;
                upd.addr.address_type = upd.address_type;

                const mainObj = state.addresses.find(x => String(x.id) === String(upd.id));
                if (mainObj) {
                    mainObj.manufacturer = upd.manufacturer;
                    mainObj.address_type = upd.address_type;
                }
            } catch (err) {
                console.warn('Cluster-Tag Sync fehlgeschlagen für ID:', upd.id, err);
            }
        }
    }

    // Panel über der Adressliste: welche Maschinen hängen an keiner Adresse?
    // Aufklappbar, damit es im Normalfall (alles zugeordnet) nicht stört – und
    // ganz verschwindet, sobald nichts mehr offen ist.
    function unassignedMachinesPanelHtml() {
        const list = state.unassignedMachines || [];

        // Werkstattmaschinen können nur dann bei uns einsortiert werden, wenn
        // der Firmensitz aus den Einstellungen auch als Adresse existiert.
        const workshopOrphans = !state.workshopAddressId
            ? (state.workshopMachineCount || 0)
            : 0;
        const workshopWarning = workshopOrphans
            ? `<div class="ab-warning" style="margin:0 0 12px 0;">
                   <strong>${workshopOrphans} Maschine${workshopOrphans === 1 ? '' : 'n'} in der Werkstatt ohne eigene Firmenadresse</strong>
                   Der Firmensitz aus den Einstellungen konnte keiner Adresse im Adressbuch zugeordnet werden.
                   Lege die eigene Firma als Adresse an (oder gleiche Name/Straße/Ort an), dann landen
                   Werkstattmaschinen automatisch dort.
               </div>`
            : '';

        if (!list.length) return workshopWarning;

        const rows = list.map(m => {
            const title = [m.manufacturer, m.name].filter(Boolean).join(' ') || ('Maschine #' + m.id);
            const details = [
                m.serial ? 'SN ' + m.serial : '',
                m.year || '',
                m.company || '',
                [m.operator_zip, m.operator_city].filter(Boolean).join(' '),
                [m.location_zip, m.location_city].filter(Boolean).join(' ')
            ].filter(Boolean).join(' · ');

            // Konkret benennen, was fehlt – sonst rätselt man, warum die
            // Automatik hier nicht greifen konnte.
            const missing = [];
            if (!m.customer_id) missing.push('kein Betreiber');
            if (!m.company && !m.operator_street && !m.operator_city) missing.push('keine Betreiberadresse');
            if (!m.location_street && !m.location_city && !m.location_company) missing.push('kein Standort');
            if (!m.customer_number) missing.push('keine Kundennummer');
            const hasSomeText = m.operator_city || m.location_city || m.company;
            if (hasSomeText && !missing.includes('kein Standort')) missing.push('Angabe nicht eindeutig');

            return `
            <div class="ab-unassigned-row">
                <div class="ab-unassigned-main">
                    <div class="ab-sub-name">${esc(title)}</div>
                    ${details ? `<div class="ab-muted ab-small">${esc(details)}</div>` : ''}
                    <div class="ab-muted ab-small">${esc(missing.join(' · ') || 'zu wenig Angaben')}</div>
                </div>
                <button class="ab-btn ab-btn-ghost ab-btn-sm" data-ab-action="machine-open" data-ab-id="${esc(String(m.id))}"
                        title="Maschine öffnen und Adresse eintragen">Maschine öffnen</button>
            </div>`;
        }).join('');

        return workshopWarning + `
        <details class="ab-warning ab-unassigned-panel">
            <summary>
                <strong>${list.length} von ${state.machineCount} Maschinen ohne Adresszuordnung</strong>
                <span class="ab-muted ab-small">— antippen für die Liste</span>
            </summary>
            <div class="ab-unassigned-list">${rows}</div>
            <div class="ab-muted ab-small" style="margin-top:8px;">
                Zuordnen geht auf zwei Wegen: Maschine öffnen und Betreiber/Standort eintragen,
                oder eine Adresse öffnen und dort „Maschine zuordnen“ wählen.
            </div>
        </details>`;
    }

    function migrationBannerHtml() {
        return `<div class="ab-warning">
            <strong>Datenbank-Erweiterung fehlt</strong>
            Webseite, Notiz, Ansprechpartner, Verknüpfungen und Historie sind erst verfügbar,
            wenn <code>supabase_add_addressbook.sql</code> einmalig im Supabase-SQL-Editor
            ausgeführt wurde. Suche, Karten und Maschinen funktionieren bereits.
        </div>`;
    }

    function renderLoading() {
        const container = document.getElementById('addressbook-list');
        if (container) {
            container.innerHTML = '<div class="ab-empty"><div class="ab-empty-title">Adressen werden geladen …</div></div>';
        }
    }

    // Wird von buildSingleFilter('country', …) gesetzt, sobald die Filter stehen.
    let renderCountryFilterOptions = null;

    function buildCountryFilter() {
        const countries = [...new Set(state.addresses.map(a => (a.country || '').trim()).filter(Boolean))].sort();
        if (!countries.includes(state.countryFilter)) state.countryFilter = 'all';
        if (renderCountryFilterOptions) renderCountryFilterOptions();
    }

    // ==========================================
    // FILTER + KARTENLISTE
    // ==========================================
    function matchesSearch(a, terms) {
        if (!terms.length) return true;
        const haystack = [
            a.name, a.matchcode, a.customer_number, a.address_number,
            a.street, a.zip_code, a.city, a.country, a.email, a.phone, a.website
        ].filter(Boolean).join(' ').toLowerCase();
        return terms.every(t => haystack.includes(t));
    }

    function applyFilters() {
        const terms = state.search.toLowerCase().split(/\s+/).filter(Boolean);

        state.filtered = state.addresses.filter(a => {
            if (!matchesSearch(a, terms)) return false;

            if (state.typeFilter === 'customers' && !isCustomer(a)) return false;
            if (state.typeFilter === 'noncustomers' && isCustomer(a)) return false;
            if (state.typeFilter === 'withmachines' && !(state.machinesByCustomer.get(String(a.id)) || []).length) return false;

            if (state.countryFilter !== 'all' && (a.country || '').trim() !== state.countryFilter) return false;

            if (state.contactFilter && !state.contactFilter.includes('all')) {
                const aContactType = (a.contact_type || '').toString();
                if (!state.contactFilter.includes(aContactType)) return false;
            }

            if (state.addressTypeFilter && !state.addressTypeFilter.includes('all')) {
                const aAddressTypeString = (a.address_type || '').toString();
                const aTypes = aAddressTypeString.split(',').map(s => s.trim()).filter(Boolean);
                // Convert state.addressTypeFilter (which contains category IDs) to their corresponding category names
                const filterNames = state.addressTypeFilter.map(id => {
                    const cat = (window.categoryList || []).find(c => c.id.toString() === id.toString());
                    return cat ? cat.name : id; // fallback to ID if not found
                });
                // Check if there is an intersection between filterNames and the address's types
                const match = filterNames.some(filterName => aTypes.includes(filterName));
                if (!match) return false;
            }

            return true;
        });

        const machineCount = a => (state.machinesByCustomer.get(String(a.id)) || []).length;
        state.filtered.sort((a, b) => {
            if (state.sort === 'city') {
                const cmp = (a.city || 'zzz').localeCompare(b.city || 'zzz', 'de');
                if (cmp !== 0) return cmp;
            } else if (state.sort === 'machines') {
                const cmp = machineCount(b) - machineCount(a);
                if (cmp !== 0) return cmp;
            } else if (state.sort === 'customer_number') {
                const an = (a.customer_number || '').padStart(12, '0');
                const bn = (b.customer_number || '').padStart(12, '0');
                const cmp = an.localeCompare(bn, 'de');
                if (cmp !== 0) return cmp;
            }
            return (a.name || '').localeCompare(b.name || '', 'de');
        });
    }

    function addressCardHtml(a) {
        const id = String(a.id);
        const kunde = isCustomer(a);

        // Eigene + manuelle Maschinen dieser Adresse
        const ownMachines = state.machinesByCustomer.get(id) || [];
        const customMachines = getAddressCustomMachines(id);

        // Verknüpfte Cluster-Adressen ermitteln und deren Maschinen mitzählen
        const clusterMeta = buildClusterMeta(id, state.allLinks || []);
        const clusterIds = Array.from(clusterMeta.keys());

        let linkedMachineCount = 0;
        clusterIds.forEach(cid => {
            const lm = state.machinesByCustomer.get(String(cid)) || [];
            const lcm = getAddressCustomMachines(String(cid));
            linkedMachineCount += lm.length + lcm.length;
        });

        const totalMachines = ownMachines.length + customMachines.length + linkedMachineCount;
        const contacts = state.contactCount.get(id) || 0;
        const links = state.linkCount.get(id) || 0;
        const hue = avatarHue(a.name);

        const addressLine = [a.street, [a.zip_code, a.city].filter(Boolean).join(' ')]
            .filter(Boolean).join(' · ');

        const chips = [];
        if (totalMachines > 0) {
            chips.push(`<span class="ab-chip ab-chip-machine">${ic('machine', 13)} ${totalMachines} ${totalMachines === 1 ? 'Maschine' : 'Maschinen'}</span>`);
        }
        if (contacts) chips.push(`<span class="ab-chip ab-chip-contact">${ic('user', 13)} ${contacts} ${contacts === 1 ? 'Kontakt' : 'Kontakte'}</span>`);
        if (links) chips.push(`<span class="ab-chip ab-chip-link">${ic('link', 13)} ${links} verknüpft</span>`);

        const pos = state.selectMode ? state.selection.indexOf(id) : -1;
        const selected = pos >= 0;

        // Current Adresstypen list
        const addressTypes = a.address_type ? a.address_type.split(',').map(s => s.trim()).filter(Boolean) : [];
        const typePills = addressTypes.map(t => {
            const cat = (window.categoryList || []).find(c => c.type === 'address_type' && c.name === t);
            const color = cat ? cat.color : '#38bdf8';
            return `<span class="ab-type-badge-inline" style="background:rgba(255,255,255,0.06); border:1px solid ${esc(color)}; color:${esc(color)}; padding:2px 8px; border-radius:10px; font-size:0.75rem; font-weight:600; display:inline-flex; align-items:center; gap:4px;">
                <span style="width:5px; height:5px; border-radius:50%; background:${esc(color)};"></span>
                ${esc(t)}
            </span>`;
        }).join('');

        return `
        <article class="ab-card ${kunde ? 'is-customer' : ''} ${state.selectMode ? 'ab-selectable' : ''} ${selected ? 'ab-selected' : ''}"
                 data-ab-action="${state.selectMode ? 'toggle-select' : 'open'}" data-ab-id="${esc(id)}" tabindex="0" role="button">
            ${selected ? `<div class="ab-select-order">${pos + 1}</div>` : ''}
            <div class="ab-card-top">
                <div class="ab-avatar" style="--ab-hue:${hue}">${esc(initials(a.name))}</div>
                <div class="ab-card-heading">
                    <div class="ab-card-name">${esc(a.name || 'Ohne Namen')}</div>
                    <div class="ab-card-sub">
                        ${a.address_number ? `<span>Adr. ${esc(a.address_number)}</span>` : ''}
                        ${a.customer_number ? `<span>Kd. ${esc(a.customer_number)}</span>` : ''}
                    </div>
                </div>
                ${kunde ? '<span class="ab-badge-customer">Kunde</span>' : '<span class="ab-badge-address">Adresse</span>'}
            </div>

            <!-- Adresstyp Row (Only Display, non-editable here) -->
            ${addressTypes.length ? `
            <div class="ab-card-types-row" style="margin: 6px 0 0 0; display:flex; flex-wrap:wrap; align-items:center; gap:4px;">
                ${typePills}
            </div>` : ''}

            <div class="ab-card-body">
                ${addressLine ? `<div class="ab-line">${ic('pin', 14)}<span>${esc(addressLine)}</span></div>` : ''}
                ${a.phone ? `<div class="ab-line">${ic('phone', 14)}<span>${esc(a.phone)}</span></div>` : ''}
                ${a.email ? `<div class="ab-line">${ic('mail', 14)}<span>${esc(a.email)}</span></div>` : ''}
                ${a.website ? `<div class="ab-line">${ic('globe', 14)}<span>${esc(a.website)}</span></div>` : ''}
            </div>

            ${chips.length ? `<div class="ab-card-chips">${chips.join('')}</div>` : ''}
        </article>`;
    }

    function renderAddressList(mode) {
        const container = document.getElementById('addressbook-list');
        const countEl = document.getElementById('addressbook-count');
        if (!container) return;

        const isAppend = mode === 'append';

        if (!isAppend) {
            applyFilters();
            // Wenn nicht ausdrücklich 'reset' verlangt ist und bereits mehr Karten geladen wurden,
            // behalten wir diese Anzahl für die aktuelle Sitzung bei.
            const targetCount = (mode === 'reset') ? PAGE_SIZE : Math.max(PAGE_SIZE, state.rendered || PAGE_SIZE);
            state.rendered = 0;
            container.innerHTML = (state.migrationMissing ? migrationBannerHtml() : '')
                + unassignedMachinesPanelHtml();

            if (!state.filtered.length) {
                if (countEl) countEl.textContent = '0 Adressen';
                container.insertAdjacentHTML('beforeend', `<div class="ab-empty">
                    <div class="ab-empty-title">Keine Adressen gefunden</div>
                    <div class="ab-empty-text">Suchbegriff oder Filter anpassen — oder oben rechts eine neue Adresse anlegen.</div>
                </div>`);
                return;
            }

            const slice = state.filtered.slice(0, targetCount);
            const grid = document.createElement('div');
            grid.className = 'ab-grid';
            grid.innerHTML = slice.map(addressCardHtml).join('');
            container.appendChild(grid);
            state.rendered = slice.length;
        } else {
            // Append next page
            if (state.rendered >= state.filtered.length) return;
            const slice = state.filtered.slice(state.rendered, state.rendered + PAGE_SIZE);
            const grid = container.querySelector('.ab-grid');
            if (grid) {
                grid.insertAdjacentHTML('beforeend', slice.map(addressCardHtml).join(''));
            }
            state.rendered += slice.length;
        }

        if (countEl) {
            const total = state.addresses.length;
            const shown = state.filtered.length;
            const kunden = state.filtered.filter(isCustomer).length;
            countEl.textContent = shown === total
                ? `${total} Adressen · ${kunden} Kunden`
                : `${shown} von ${total} Adressen · ${kunden} Kunden`;
        }

        let more = container.querySelector('.ab-more');
        if (state.rendered < state.filtered.length) {
            if (!more) {
                more = document.createElement('button');
                more.className = 'ab-more';
                more.setAttribute('data-ab-action', 'more');
                container.appendChild(more);
            }
            const offen = state.filtered.length - state.rendered;
            more.textContent = `Weitere ${Math.min(PAGE_SIZE, offen)} von ${offen} anzeigen`;
            container.appendChild(more);
            // Laedt beim Scrollen von selbst nach (js/auto-nachladen.js); der
            // Knopf bleibt als Rueckfallebene und Fortschrittsanzeige erhalten.
            if (typeof window.autoNachladen === 'function') {
                window.autoNachladen(more, () => renderAddressList('append'),
                    { ladeText: 'Weitere Adressen werden geladen …' });
            }
        } else if (more) {
            more.remove();
        }
    }

    window.renderAddressbook = renderAddressList;

    // ==========================================
    // AUSWAHLMODUS → ROUTE ZUSAMMENSTELLEN
    // ==========================================
    function setSelectMode(on) {
        state.selectMode = on;
        if (!on) state.selection = [];
        const btn = document.getElementById('addressbook-select-btn');
        if (btn) {
            btn.classList.toggle('active', on);
            btn.textContent = on ? 'Auswahl abbrechen' : 'Route zusammenstellen';
        }
        renderAddressList();
        renderSelectionBar();
    }

    function toggleSelect(id) {
        const key = String(id);
        const i = state.selection.indexOf(key);
        if (i >= 0) state.selection.splice(i, 1);
        else state.selection.push(key);
        // Neu rendern, damit sich die Nummerierung aller Karten anpasst.
        renderAddressList();
        renderSelectionBar();
    }

    function ensureSelectionBar() {
        if (document.getElementById('ab-selection-bar')) return;
        const bar = document.createElement('div');
        bar.id = 'ab-selection-bar';
        bar.className = 'ab-selection-bar';
        document.body.appendChild(bar);
    }

    function renderSelectionBar() {
        ensureSelectionBar();
        const bar = document.getElementById('ab-selection-bar');
        if (!state.selectMode) { bar.classList.remove('show'); bar.innerHTML = ''; return; }

        const names = state.selection
            .map(id => state.byId.get(id))
            .filter(Boolean)
            .map((a, i) => `${i + 1}. ${a.name}`);

        bar.classList.add('show');
        bar.innerHTML = `
            <div class="ab-selection-info">
                <strong>${state.selection.length}</strong> ${state.selection.length === 1 ? 'Adresse' : 'Adressen'} in Reihenfolge gewählt
                ${names.length ? `<div class="ab-selection-names">${esc(names.join('  ·  '))}</div>` : '<div class="ab-selection-names">Karten in der gewünschten Reihenfolge antippen — Suche und Filter bleiben nutzbar.</div>'}
            </div>
            <div class="ab-selection-actions">
                <button class="ab-btn ab-btn-ghost" data-ab-action="selection-clear">Zurücksetzen</button>
                <button class="ab-btn ab-btn-ghost" data-ab-action="selection-cancel">Abbrechen</button>
                <button class="ab-btn ab-btn-primary" data-ab-action="selection-done" ${state.selection.length ? '' : 'disabled'}>Fertig — Route öffnen</button>
            </div>`;
    }

    function finishSelection() {
        const addresses = state.selection.map(id => state.byId.get(id)).filter(Boolean);
        if (!addresses.length) return;
        if (typeof window.rp2StartRouteWithAddresses !== 'function') {
            window.showToast('Die Routenplanung ist nicht verfügbar.');
            return;
        }
        setSelectMode(false);
        closeModal('addressbook-detail-modal');
        window.rp2StartRouteWithAddresses(addresses);
    }

    function planRouteForAddress(id) {
        const a = state.byId.get(String(id));
        if (!a) return;
        if (typeof window.rp2StartRouteWithAddresses !== 'function') {
            window.showToast('Die Routenplanung ist nicht verfügbar.');
            return;
        }
        closeModal('addressbook-detail-modal');
        window.rp2StartRouteWithAddresses([a]);
    }

    // ==========================================
    // DETAILANSICHT
    // ==========================================
    async function openDetail(id, tab) {
        const address = state.byId.get(String(id));
        if (!address) return;

        state.currentId = String(id);
        state.detailTab = tab || 'overview';
        state.detail = { contacts: [], links: [], notes: [], machines: [], linkedMachines: new Map(), linkedContacts: new Map(), clusterMeta: new Map() };

        ensureDetailModal();
        renderDetail(true);
        openModal('addressbook-detail-modal');

        await loadDetailData(String(id));
        renderDetail();
    }

    window.openAddressDetail = openDetail;
    window.openAddressForm = openAddressForm;

    // Öffnet das Bearbeiten-Formular einer Adresse direkt aus anderen Modulen
    // heraus (z. B. dem Maschinen-Formular über Betreiber-/Standort-Buttons).
    window.openAddressEditById = async function (id) {
        if (!id) {
            window.showToast('Es ist noch keine Adresse verknüpft. Bitte zuerst über die Suche eine Adresse auswählen.');
            return;
        }
        if (typeof window.loadAddressbook === 'function') {
            await window.loadAddressbook();
        }
        if (!state.byId.has(String(id))) {
            window.showToast('Diese Adresse konnte im Adressbuch nicht gefunden werden.');
            return;
        }
        openAddressForm(String(id));
    };

    // Öffnet die Detailansicht einer Adresse direkt im Tab "Ansprechpartner"
    window.openAddressContactsById = async function (id) {
        let targetId = id;
        if (!targetId) {
            targetId = document.getElementById('machine-customer-id')?.value || document.getElementById('machine-location-customer-id')?.value;
        }
        if (!targetId) {
            window.showToast('Es ist noch keine Adresse verknüpft. Bitte zuerst über die Suche eine Betreiber- oder Standortadresse auswählen.');
            return;
        }
        if (typeof window.loadAddressbook === 'function') {
            await window.loadAddressbook();
        }
        if (!state.byId.has(String(targetId))) {
            window.showToast('Diese Adresse konnte im Adressbuch nicht gefunden werden.');
            return;
        }
        openDetail(String(targetId), 'contacts');
    };

    async function loadDetailData(id) {
        const tasks = [];

        tasks.push((async () => {
            try {
                const { data, error } = await sb()
                    .from('customer_contacts').select('*').eq('customer_id', id)
                    .order('is_primary', { ascending: false }).order('name', { ascending: true });
                if (error) throw error;
                state.detail.contacts = data || [];
                state.contactCount.set(id, state.detail.contacts.length);
            } catch (err) {
                console.warn('Ansprechpartner konnten nicht geladen werden', err);
                state.detail.contacts = [];
            }
        })());

        tasks.push((async () => {
            try {
                // Cluster-Erkennung: alle Adressen, die über eine Kette von
                // Verknüpfungen mit der aktuellen Adresse verbunden sind.
                // So sieht Adresse C auch B als verknüpft, wenn A beide
                // verknüpft hat — Verknüpfungen wirken transitiv.
                const currentKey = String(id);
                const cluster = new Set([currentKey]);
                const allLinks = [];
                const linkIdsSeen = new Set();
                let frontier = [currentKey];
                for (let depth = 0; depth < 6 && frontier.length; depth++) {
                    const { data: rows, error } = await sb()
                        .from('customer_links')
                        .select('id, customer_id, linked_customer_id, link_type, note')
                        .or(`customer_id.in.(${frontier.join(',')}),linked_customer_id.in.(${frontier.join(',')})`);
                    if (error) throw error;

                    const next = [];
                    (rows || []).forEach(l => {
                        if (linkIdsSeen.has(String(l.id))) return;
                        linkIdsSeen.add(String(l.id));
                        allLinks.push(l);
                        [l.customer_id, l.linked_customer_id].forEach(x => {
                            const k = String(x);
                            if (!cluster.has(k)) { cluster.add(k); next.push(k); }
                        });
                    });
                    frontier = next;
                }

                // Direkte Verknüpfungen (für Löschen-Button im Links-Tab)
                state.detail.links = allLinks.filter(l =>
                    String(l.customer_id) === currentKey || String(l.linked_customer_id) === currentKey
                );
                state.linkCount.set(id, state.detail.links.length);

                // BFS-Meta: jede Cluster-Adresse bekommt entweder eine direkte
                // Verknüpfung oder eine transitive (via = Zwischenadresse).
                const clusterMeta = buildClusterMeta(currentKey, allLinks);
                state.detail.clusterMeta = clusterMeta;

                const otherIds = [...clusterMeta.keys()];
                if (otherIds.length) {
                    // ZUERST alle verknüpften Adressen in den state.byId Cache laden,
                    // damit e.other.name beim Erstellen der Verknüpfungskarten NIEMALS fehlt!
                    const missing = otherIds.filter(oid => !state.byId.has(String(oid)));
                    if (missing.length) {
                        try {
                            const { data: extra } = await sb()
                                .from('customers')
                                .select('id, name, zip_code, city')
                                .in('id', missing);
                            (extra || []).forEach(c => state.byId.set(String(c.id), c));
                        } catch (e) {
                            console.warn('Fehler beim Laden verknüpfter Adress-Namen', e);
                        }
                    }

                    // Ansprechpartner aller Cluster-Adressen laden.
                    const contactRes = await sb()
                        .from('customer_contacts')
                        .select('id, customer_id, salutation, name, position, department, phone, mobile, email, notes, is_primary')
                        .in('customer_id', otherIds);
                    if (contactRes.error) throw contactRes.error;
 
                    otherIds.forEach(oid => {
                        // Greife auf die präzise gematchten Maschinen (Betreiber + Standort + Ort/Straße) der verknüpften Adresse zu
                        const clusterAddrMachines = state.machinesByCustomer.get(String(oid)) || [];
                        state.detail.linkedMachines.set(String(oid), clusterAddrMachines);
                        state.detail.linkedContacts.set(String(oid), []);
                    });
                    
                    (contactRes.data || []).forEach(c => {
                        const k = String(c.customer_id);
                        if (!state.detail.linkedContacts.has(k)) state.detail.linkedContacts.set(k, []);
                        state.detail.linkedContacts.get(k).push(c);
                    });
                    state.detail.linkedContacts.forEach(list =>
                        list.sort((a, b) => (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0)));
                }
            } catch (err) {
                console.warn('Verknüpfungen konnten nicht geladen werden', err);
                state.detail.links = [];
                state.detail.clusterMeta = new Map();
            }
        })());

        tasks.push((async () => {
            try {
                // Notizen dieser Adresse + aller verknüpften Cluster-Adressen laden
                const allClusterCustomerIds = [id, ...Array.from(state.detail.clusterMeta.keys())];
                const { data, error } = await sb()
                    .from('customer_notes').select('*').in('customer_id', allClusterCustomerIds)
                    .order('created_at', { ascending: false });
                if (error) throw error;
                state.detail.notes = data || [];
            } catch (err) {
                console.warn('Historie konnte nicht geladen werden', err);
                state.detail.notes = [];
            }
        })());

        tasks.push((async () => {
            try {
                // Alle Maschinen der eigenen Adresse + aller verknüpften Cluster-Adressen sammeln
                const allClusterCustomerIds = [id, ...Array.from(state.detail.clusterMeta.keys())];
                let allClusterMachines = [];
                const machineIdMap = new Map();

                allClusterCustomerIds.forEach(cid => {
                    const cMachines = state.machinesByCustomer.get(String(cid)) || [];
                    cMachines.forEach(m => {
                        if (!machineIdMap.has(String(m.id))) {
                            machineIdMap.set(String(m.id), m);
                            allClusterMachines.push(m);
                        }
                    });
                });

                state.detail.machines = state.machinesByCustomer.get(String(id)) || [];
                state.detail.allClusterMachines = allClusterMachines;

                // Lade zusätzlich Maschinen-Historie (manual_history_entries & service_entries) für ALLE Maschinen im Cluster
                if (allClusterMachines.length > 0) {
                    const mIds = allClusterMachines.map(m => m.id);
                    const [mHistRes, sEntriesRes] = await Promise.all([
                        sb().from('manual_history_entries').select('*').in('machine_id', mIds).order('created_at', { ascending: false }),
                        sb().from('service_entries').select('*').in('machine_id', mIds).order('date', { ascending: false })
                    ]);

                    const manualEntries = (mHistRes.data || []).map(e => ({ ...e, _sourceTable: 'manual' }));
                    const serviceEntries = (sEntriesRes.data || []).map(s => ({
                        id: s.id,
                        machine_id: s.machine_id,
                        type: 'service',
                        title: s.title || 'Servicebericht',
                        content: s.description || '',
                        files: s.files || (s.pdf_url ? [s.pdf_url] : []),
                        created_at: s.date || s.created_at,
                        entry_date: s.date || s.created_at,
                        rawService: s,
                        _sourceTable: 'service_entries'
                    }));

                    state.detail.machineHistoryEntries = [...manualEntries, ...serviceEntries];
                } else {
                    state.detail.machineHistoryEntries = [];
                }
            } catch (err) {
                console.warn('Maschinen konnten nicht geladen werden', err);
                state.detail.machines = [];
                state.detail.allClusterMachines = [];
                state.detail.machineHistoryEntries = [];
            }
        })());

        // Vorgänge dieser Adresse + aller Cluster-Maschinen aus dem Vorgänge-Modul
        tasks.push((async () => {
            try {
                const allClusterCustomerIds = [id, ...Array.from(state.detail.clusterMeta.keys())];
                const allClusterMachines = state.detail.allClusterMachines || [];
                const mIds = allClusterMachines.map(m => m.id);

                let procQuery = sb().from('internal_processes').select('*');
                if (mIds.length > 0) {
                    procQuery = procQuery.or(`customer_id.in.(${allClusterCustomerIds.join(',')}),machine_id.in.(${mIds.join(',')})`);
                } else {
                    procQuery = procQuery.in('customer_id', allClusterCustomerIds);
                }

                const { data, error } = await procQuery.order('process_date', { ascending: false });
                if (error) throw error;
                state.detail.processes = data || [];
            } catch (err) {
                console.warn('Vorgänge zur Adresse konnten nicht geladen werden:', err.message || err);
                state.detail.processes = [];
                state.detail.processesError = true;
            }
        })());

        // Aufgaben (tasks-Tabelle) für alle Cluster-Maschinen laden
        tasks.push((async () => {
            try {
                const allClusterMachines = state.detail.allClusterMachines || [];
                const mIds = allClusterMachines.map(m => m.id);
                if (mIds.length > 0) {
                    const { data, error } = await sb().from('tasks').select('*').in('machine_id', mIds).order('created_at', { ascending: false });
                    if (!error && data) state.detail.machineTasks = data;
                    else state.detail.machineTasks = [];
                } else {
                    state.detail.machineTasks = [];
                }
            } catch (err) {
                console.warn('Aufgaben zu Maschinen konnten nicht geladen werden:', err);
                state.detail.machineTasks = [];
            }
        })());

        await Promise.all(tasks);
    }

    function ensureDetailModal() {
        if (document.getElementById('addressbook-detail-modal')) return;
        const el = document.createElement('div');
        el.id = 'addressbook-detail-modal';
        el.className = 'modal-backdrop ab-modal-backdrop';
        el.innerHTML = `
            <div class="modal-content ab-detail-content">
                <button class="ab-icon-btn ab-modal-close" data-ab-action="close-detail" title="Schließen">${ic('close', 20)}</button>
                <div id="addressbook-detail-body"></div>
            </div>`;
        document.body.appendChild(el);
        el.addEventListener('click', (e) => {
            if (e.target === el) closeModal('addressbook-detail-modal');
        });
    }

    function renderDetail(skeleton) {
        const body = document.getElementById('addressbook-detail-body');
        const a = state.byId.get(state.currentId);
        if (!body || !a) return;

        const kunde = isCustomer(a);
        const hue = avatarHue(a.name);
        const machines = state.detail.machines || [];
        const contacts = state.detail.contacts || [];
        const links = state.detail.links || [];
        const notes = state.detail.notes || [];

        // Gesamtzahl Ansprechpartner (direkt an dieser Adresse + an verknüpften Adressen)
        let totalContactsCount = contacts.length;
        if (state.detail.linkedContacts) {
            state.detail.linkedContacts.forEach(list => { totalContactsCount += (list || []).length; });
        }

        // Gesamtzahl Maschinen (direkt an dieser Adresse + manuelle Maschinen an dieser Adresse + Maschinen an verknüpften Adressen)
        // Duplikate über ID-Set vermeiden: eine Maschine wird nur einmal gezählt
        const customMachines = getAddressCustomMachines(state.currentId);
        const countedMachineIds = new Set(machines.map(m => String(m.id)));
        const groups = linkedGroupsForCurrent();
        groups.forEach(g => {
            const list = state.detail.linkedMachines.get(g.otherId) || [];
            list.forEach(m => countedMachineIds.add(String(m.id)));
        });
        let totalMachinesCount = countedMachineIds.size + customMachines.length;
        groups.forEach(g => {
            totalMachinesCount += getAddressCustomMachines(g.otherId).length;
        });

        // Gesamtzahl Verknüpfungen (alle verknüpften Adressen im Cluster)
        const totalLinksCount = state.detail.clusterMeta ? state.detail.clusterMeta.size : links.length;

        const tasksList = state.detail.tasks || [];

        const tabs = [
            { key: 'overview', label: 'Übersicht' },
            { key: 'contacts', label: 'Ansprechpartner', count: totalContactsCount },
            { key: 'machines', label: 'Maschinen', count: totalMachinesCount },
            { key: 'links', label: 'Verknüpfungen', count: totalLinksCount },
            { key: 'tasks', label: 'Vorgänge', count: tasksList.length },
            { key: 'history', label: 'Historie', count: notes.length }
        ];

        body.innerHTML = `
            <header class="ab-detail-head">
                <div class="ab-avatar ab-avatar-lg" style="--ab-hue:${hue}">${esc(initials(a.name))}</div>
                <div class="ab-detail-title">
                    <h2>${esc(a.name || 'Ohne Namen')}</h2>
                    <div class="ab-detail-meta">
                        ${kunde ? '<span class="ab-badge-customer">Kunde</span>' : '<span class="ab-badge-address">Adresse</span>'}
                        ${a.address_number ? `<span>Adressnr. ${esc(a.address_number)}</span>` : ''}
                        ${a.customer_number ? `<span>Kundennr. ${esc(a.customer_number)}</span>` : ''}
                    </div>
                </div>
                <div class="ab-detail-actions">
                    <button class="ab-btn ab-btn-ghost" data-ab-action="plan-route" data-ab-id="${esc(state.currentId)}">${ic('route', 16)} Route planen</button>
                    <button class="ab-btn ab-btn-ghost" data-ab-action="edit" data-ab-id="${esc(state.currentId)}">${ic('edit', 16)} Bearbeiten</button>
                    <button class="ab-btn ab-btn-danger delete-permission-required" data-ab-action="delete" data-ab-id="${esc(state.currentId)}">${ic('trash', 16)} Löschen</button>
                </div>
            </header>

            <nav class="ab-tabs">
                ${tabs.map(t => `
                    <button class="ab-tab ${state.detailTab === t.key ? 'active' : ''}" data-ab-action="tab" data-ab-tab="${t.key}">
                        ${esc(t.label)}${t.count !== undefined ? `<span class="ab-tab-count">${t.count}</span>` : ''}
                    </button>`).join('')}
            </nav>

            <div class="ab-tab-panel">
                ${skeleton && state.detailTab !== 'overview'
                ? '<div class="ab-empty"><div class="ab-empty-title">Wird geladen …</div></div>'
                : renderTab(a)}
            </div>`;
    }

    function renderTab(a) {
        switch (state.detailTab) {
            case 'contacts': return renderContactsTab();
            case 'machines': return renderMachinesTab();
            case 'links': return renderLinksTab();
            case 'tasks': return renderTasksTab();
            case 'history': return renderHistoryTab();
            default: return renderOverviewTab(a);
        }
    }

    function renderOverviewTab(a) {
        const addressBlock = [
            a.street,
            [a.zip_code, a.city].filter(Boolean).join(' '),
            a.country
        ].filter(Boolean);

        const mapsQuery = encodeURIComponent([a.name, a.street, a.zip_code, a.city, a.country].filter(Boolean).join(', '));

        function row(label, value, html) {
            if (!value) return '';
            return `<div class="ab-kv"><span class="ab-kv-label">${esc(label)}</span><span class="ab-kv-value">${html || esc(value)}</span></div>`;
        }

        const website = normalizeUrl(a.website);

        return `
        <div class="ab-overview">
            <section class="ab-panel">
                <h3>${ic('pin', 16)} Anschrift</h3>
                ${addressBlock.length
                ? `<div class="ab-address-block">${addressBlock.map(l => `<div>${esc(l)}</div>`).join('')}</div>
                       <a class="ab-btn ab-btn-ghost ab-maps" href="https://www.google.com/maps/search/?api=1&query=${mapsQuery}" target="_blank" rel="noopener">
                           <svg width="16" height="16" viewBox="0 0 24 24" fill="#EA4335"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z"/></svg>
                           Google Maps
                       </a>`
                : '<div class="ab-muted">Keine Anschrift hinterlegt</div>'}
            </section>

            <section class="ab-panel">
                <h3>${ic('phone', 16)} Kontakt</h3>
                ${(a.phone || a.email || website)
                ? `${row('Telefon', a.phone, a.phone ? `<a href="tel:${esc(String(a.phone).replace(/\s/g, ''))}">${esc(a.phone)}</a>` : '')}
                       ${row('E-Mail', a.email, a.email ? `<a href="mailto:${esc(a.email)}">${esc(a.email)}</a>` : '')}
                       ${row('Webseite', website, website ? `<a href="${esc(website)}" target="_blank" rel="noopener">${esc(a.website)}</a>` : '')}`
                : '<div class="ab-muted">Keine Kontaktdaten hinterlegt</div>'}
            </section>

            <section class="ab-panel">
                <h3>${ic('note', 16)} Stammdaten</h3>
                ${row('Adressnummer', a.address_number)}
                ${row('Kundennummer', a.customer_number)}
                ${row('Matchcode', a.matchcode)}
                ${row('Land', a.country)}
                ${!a.address_number && !a.customer_number && !a.matchcode && !a.country ? '<div class="ab-muted">Keine Stammdaten hinterlegt</div>' : ''}
            </section>

            <!-- Adresstyp Section (Eigenes breites Panel dazwischen) -->
            <section class="ab-panel ab-panel-wide" style="display:flex; flex-direction:column; gap:8px; align-items:flex-start;">
                <h3 style="margin-bottom: 4px;">📂 Adresstyp (Mehrfachauswahl)</h3>
                <div style="display:flex; flex-wrap:wrap; gap:8px; width:100%; margin-top: 4px;">
                    ${((window.categoryList || []).filter(c => c.type === 'address_type')).map(cat => {
                        const active = (a.address_type || '').split(',').map(s => s.trim()).includes(cat.name);
                        return `
                        <button type="button" class="ab-pill-btn" onclick="window.toggleInlineAddressType('${esc(a.id)}', '${esc(cat.name)}', event)" 
                                style="background:${active ? 'rgba(56,189,248,0.15)' : 'rgba(255,255,255,0.03)'}; 
                                       border:1px solid ${active ? '#38bdf8' : 'rgba(255,255,255,0.1)'}; 
                                       color:${active ? '#38bdf8' : '#fff'}; 
                                       padding:6px 14px; border-radius:20px; font-size:0.8rem; cursor:pointer; 
                                       transition:all 0.15s; display:inline-flex; align-items:center; gap:6px; font-weight:600;"
                                onmouseover="this.style.borderColor='#38bdf8'" 
                                onmouseout="if(!${active}) this.style.borderColor='rgba(255,255,255,0.1)'">
                            <span style="width:8px; height:8px; border-radius:50%; background:${esc(cat.color || '#38bdf8')}; display:inline-block;"></span>
                            ${esc(cat.name)}
                        </button>
                        `;
                    }).join('') || '<span class="ab-muted ab-small">Keine Adresstypen definiert. Richten Sie diese in den Einstellungen unter Kategorien ein.</span>'}
                </div>
            </section>

            <!-- Hersteller-Zuordnung (Kategorien vom Typ "Hersteller") -->
            <section class="ab-panel ab-panel-wide" style="display:flex; flex-direction:column; gap:8px; align-items:flex-start;">
                <h3 style="margin-bottom: 4px;">🏭 Hersteller (Mehrfachauswahl)</h3>
                ${state.manufacturerMissing
                    ? '<span class="ab-muted ab-small">Spalte „manufacturer" fehlt noch – bitte supabase_add_manufacturer_category.sql in Supabase ausführen.</span>'
                    : `<div style="display:flex; flex-wrap:wrap; gap:8px; width:100%; margin-top: 4px;">
                    ${((window.categoryList || []).filter(c => c.type === 'manufacturer')).map(cat => {
                        const active = (a.manufacturer || '').split(',').map(s => s.trim()).includes(cat.name);
                        return `
                        <button type="button" class="ab-pill-btn" onclick="window.toggleInlineManufacturer('${esc(a.id)}', '${esc(cat.name)}', event)"
                                style="background:${active ? 'rgba(20,184,166,0.15)' : 'rgba(255,255,255,0.03)'};
                                       border:1px solid ${active ? '#14b8a6' : 'rgba(255,255,255,0.1)'};
                                       color:${active ? '#14b8a6' : '#fff'};
                                       padding:6px 14px; border-radius:20px; font-size:0.8rem; cursor:pointer;
                                       transition:all 0.15s; display:inline-flex; align-items:center; gap:6px; font-weight:600;"
                                onmouseover="this.style.borderColor='#14b8a6'"
                                onmouseout="if(!${active}) this.style.borderColor='rgba(255,255,255,0.1)'">
                            <span style="width:8px; height:8px; border-radius:50%; background:${esc(cat.color || '#14b8a6')}; display:inline-block;"></span>
                            ${esc(cat.name)}
                        </button>
                        `;
                    }).join('') || '<span class="ab-muted ab-small">Keine Hersteller definiert. Richten Sie diese in den Einstellungen unter Kategorien ein.</span>'}
                </div>`}
            </section>

            <section class="ab-panel ab-panel-wide">
                <h3>${ic('note', 16)} Notiz</h3>
                ${a.notes ? `<div class="ab-notes-text">${esc(a.notes)}</div>` : '<div class="ab-muted">Keine Notiz hinterlegt — über „Bearbeiten“ ergänzen.</div>'}
            </section>
        </div>`;
    }

    // ---------- Ansprechpartner ----------
    // Alle Cluster-Adressen für die Gruppen-Anzeige in den Tabs Ansprechpartner
    // und Maschinen. Bei direkten Verknüpfungen ist die Beschriftung der
    // konkrete Typ (Lieferadresse …); bei transitiven „verbunden über [Name]".
    function linkedGroupsForCurrent() {
        const clusterMeta = state.detail.clusterMeta || new Map();
        const groups = [];
        clusterMeta.forEach((info, otherId) => {
            const other = state.byId.get(String(otherId));
            let label, color;
            if (info.direct) {
                const meta = linkTypeMeta(info.link.link_type);
                label = meta.label;
                color = meta.color;
            } else {
                const via = state.byId.get(String(info.viaId));
                label = 'über ' + (via ? via.name : '…');
                color = '#94a3b8';
            }
            groups.push({
                otherId: String(otherId),
                name: other ? other.name : 'Verknüpfte Adresse',
                linkTypeLabel: label,
                linkTypeColor: color,
                direct: info.direct,
                linkId: info.direct ? String(info.link.id) : null
            });
        });
        // Direkte zuerst, dann alphabetisch
        groups.sort((a, b) => (a.direct !== b.direct) ? (b.direct - a.direct) : a.name.localeCompare(b.name, 'de'));
        return groups;
    }

    function groupHeaderHtml(g) {
        return `
        <div class="ab-linked-group-head" style="--ab-link-color:${g.linkTypeColor}">
            <div class="ab-linked-group-title">
                ${ic('link', 14)}
                <span>Von: ${esc(g.name)}</span>
                ${g.linkId
                    ? `<button type="button" class="ab-pill ab-pill-editable" data-ab-action="link-type" data-ab-id="${esc(g.linkId)}"
                            title="Art der Verknüpfung ändern"
                            style="border-color:${g.linkTypeColor}55; color:${g.linkTypeColor}; cursor:pointer; background:transparent;">${esc(g.linkTypeLabel)} ${ic('edit', 11)}</button>`
                    : `<span class="ab-pill" style="border-color:${g.linkTypeColor}55; color:${g.linkTypeColor}">${esc(g.linkTypeLabel)}</span>`}
            </div>
            <button class="ab-btn ab-btn-ghost ab-btn-sm" data-ab-action="open" data-ab-id="${esc(g.otherId)}">Öffnen</button>
        </div>`;
    }

    function renderContactsTab() {
        const contacts = state.detail.contacts || [];
        const groups = linkedGroupsForCurrent();

        // Eigene Ansprechpartner
        const ownBlock = `
            <div class="ab-linked-group ab-linked-group-own">
                <div class="ab-linked-group-head">
                    <div class="ab-linked-group-title">
                        ${ic('home', 14)}
                        <span>Diese Adresse</span>
                        <span class="ab-pill">${contacts.length}</span>
                    </div>
                </div>
                ${contacts.length
                    ? `<div class="ab-sub-grid">${contacts.map(contactCardHtml).join('')}</div>`
                    : '<div class="ab-empty ab-empty-compact"><div class="ab-empty-text">Noch keine Ansprechpartner hinterlegt.</div></div>'}
            </div>`;

        // Gruppen der verknüpften Adressen
        const linkedBlocks = groups.map(g => {
            const list = state.detail.linkedContacts.get(g.otherId) || [];
            if (!list.length) return '';
            return `
            <div class="ab-linked-group">
                ${groupHeaderHtml(g)}
                <div class="ab-sub-grid">${list.map(contactCardReadonlyHtml).join('')}</div>
            </div>`;
        }).filter(Boolean).join('');

        const totalLinked = groups.reduce((s, g) => s + (state.detail.linkedContacts.get(g.otherId) || []).length, 0);

        return `
        <div class="ab-section-head">
            <span class="ab-muted">${contacts.length} an dieser Adresse${totalLinked ? ` · ${totalLinked} über verknüpfte Adressen` : ''}</span>
            <button class="ab-btn ab-btn-primary" data-ab-action="contact-new">${ic('plus', 16)} Ansprechpartner</button>
        </div>
        <div class="ab-linked-stack">${ownBlock}${linkedBlocks}</div>`;
    }

    // Bezeichnung der Maschinen-Kategorie (Siebtrommel, Zerkleinerer …)
    // via window.categoryList – wird von index.html beim App-Start befüllt.
    function machineCategoryName(m) {
        if (!m || m.category_id == null) return null;
        const list = window.categoryList;
        if (!Array.isArray(list)) return null;
        const cat = list.find(c => String(c.id) === String(m.category_id));
        return cat ? cat.name : null;
    }

    function machineThumbUrl(m) {
        if (!m || !m.image_url) return null;
        const url = String(m.image_url).trim();
        if (!url) return null;
        return (typeof window.getMachineThumbnailUrl === 'function')
            ? window.getMachineThumbnailUrl(url)
            : url;
    }

    // Kompakt-Ansprechpartner für die Gruppen aus verknüpften Adressen.
    // Ohne Bearbeiten/Löschen-Buttons – die Daten „gehören“ dort einer anderen
    // Adresse und werden nur zur Info gespiegelt.
    function contactCardReadonlyHtml(c) {
        return `
        <div class="ab-sub-card ab-sub-card-readonly">
            <div class="ab-sub-card-head">
                <div class="ab-avatar ab-avatar-sm" style="--ab-hue:${avatarHue(c.name)}">${esc(initials(c.name))}</div>
                <div class="ab-sub-card-title">
                    <div class="ab-sub-name">${esc([c.salutation, c.name].filter(Boolean).join(' '))}${c.is_primary ? '<span class="ab-pill">Haupt</span>' : ''}</div>
                    ${(c.position || c.department) ? `<div class="ab-muted ab-small">${esc([c.position, c.department].filter(Boolean).join(' · '))}</div>` : ''}
                </div>
            </div>
            <div class="ab-sub-card-body">
                ${c.phone ? `<div class="ab-line">${ic('phone', 14)}<a href="tel:${esc(String(c.phone).replace(/\s/g, ''))}">${esc(c.phone)}</a></div>` : ''}
                ${c.mobile ? `<div class="ab-line">${ic('phone', 14)}<a href="tel:${esc(String(c.mobile).replace(/\s/g, ''))}">${esc(c.mobile)} <span class="ab-muted ab-small">(mobil)</span></a></div>` : ''}
                ${c.email ? `<div class="ab-line">${ic('mail', 14)}<a href="mailto:${esc(c.email)}">${esc(c.email)}</a></div>` : ''}
                ${c.notes ? `<div class="ab-line ab-muted ab-small">${esc(c.notes)}</div>` : ''}
            </div>
        </div>`;
    }

    function contactCardHtml(c) {
        return `
        <div class="ab-sub-card">
            <div class="ab-sub-card-head">
                <div class="ab-avatar ab-avatar-sm" style="--ab-hue:${avatarHue(c.name)}">${esc(initials(c.name))}</div>
                <div class="ab-sub-card-title">
                    <div class="ab-sub-name">${esc([c.salutation, c.name].filter(Boolean).join(' '))}${c.is_primary ? '<span class="ab-pill">Haupt</span>' : ''}</div>
                    ${(c.position || c.department) ? `<div class="ab-muted ab-small">${esc([c.position, c.department].filter(Boolean).join(' · '))}</div>` : ''}
                </div>
                <div class="ab-sub-card-actions">
                    <button class="ab-icon-btn" data-ab-action="contact-edit" data-ab-id="${esc(c.id)}" title="Bearbeiten">${ic('edit', 15)}</button>
                    <button class="ab-icon-btn ab-danger delete-permission-required" data-ab-action="contact-delete" data-ab-id="${esc(c.id)}" title="Löschen">${ic('trash', 15)}</button>
                </div>
            </div>
            <div class="ab-sub-card-body">
                ${c.phone ? `<div class="ab-line">${ic('phone', 14)}<a href="tel:${esc(String(c.phone).replace(/\s/g, ''))}">${esc(c.phone)}</a></div>` : ''}
                ${c.mobile ? `<div class="ab-line">${ic('phone', 14)}<a href="tel:${esc(String(c.mobile).replace(/\s/g, ''))}">${esc(c.mobile)} <span class="ab-muted ab-small">(mobil)</span></a></div>` : ''}
                ${c.email ? `<div class="ab-line">${ic('mail', 14)}<a href="mailto:${esc(c.email)}">${esc(c.email)}</a></div>` : ''}
                ${c.notes ? `<div class="ab-line ab-muted ab-small">${esc(c.notes)}</div>` : ''}
            </div>
        </div>`;
    }

    // ---------- Maschinen ----------
    // Lokaler Speicher für manuelle Maschinen pro Adresse (nicht im zentralen Maschinenpark)
    function getAddressCustomMachines(addressId) {
        try {
            const raw = localStorage.getItem('ab_custom_machines_' + addressId);
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            return [];
        }
    }

    function saveAddressCustomMachines(addressId, list) {
        try {
            localStorage.setItem('ab_custom_machines_' + addressId, JSON.stringify(list));
        } catch (e) {
            console.error('Fehler beim Speichern manueller Maschinen', e);
        }
    }

    function renderMachinesTab() {
        // Werkstattmaschinen nach oben – an der eigenen Firmenadresse ist das
        // die Liste, die man tatsächlich abarbeitet.
        const machines = [...(state.detail.machines || [])]
            .sort((a, b) => (isInWorkshop(b) ? 1 : 0) - (isInWorkshop(a) ? 1 : 0));
        const workshopCount = machines.filter(isInWorkshop).length;
        const customMachines = getAddressCustomMachines(state.currentId);
        const groups = linkedGroupsForCurrent();

        const currentAddress = state.byId.get(state.currentId);
        const ownerSelf = currentAddress ? { id: currentAddress.id, name: currentAddress.name } : null;

        const ownBlock = `
            <div class="ab-linked-group ab-linked-group-own">
                <div class="ab-linked-group-head">
                    <div class="ab-linked-group-title">
                        ${ic('home', 14)}
                        <span>Diese Adresse</span>
                        <span class="ab-pill">${machines.length + customMachines.length}</span>
                    </div>
                </div>
                ${(machines.length || customMachines.length)
                    ? `<div class="ab-sub-grid">
                        ${customMachines.map(cm => customMachineCardHtml(cm)).join('')}
                        ${machines.map(m => machineCardHtml(m, { readonly: false, ownerAddress: ownerSelf })).join('')}
                       </div>`
                    : '<div class="ab-empty ab-empty-compact"><div class="ab-empty-text">Noch keine Maschinen an dieser Adresse.</div></div>'}
            </div>`;

        // IDs aller Maschinen, die bereits im "Diese Adresse"-Block erscheinen,
        // damit sie in den verknüpften Blöcken nicht nochmal auftauchen.
        const alreadyShownIds = new Set(machines.map(m => String(m.id)));

        const linkedBlocks = groups.map(g => {
            const rawList = state.detail.linkedMachines.get(g.otherId) || [];
            // Duplikate entfernen: Maschinen die bereits oben gezeigt werden rausfiltern
            const list = rawList.filter(m => !alreadyShownIds.has(String(m.id)));
            const linkedCustom = getAddressCustomMachines(g.otherId);
            if (!list.length && !linkedCustom.length) return '';
            const ownerLinked = { id: g.otherId, name: g.name };
            return `
            <div class="ab-linked-group">
                ${groupHeaderHtml(g)}
                <div class="ab-sub-grid">
                    ${linkedCustom.map(cm => customMachineCardHtml(cm, true)).join('')}
                    ${list.map(m => machineCardHtml(m, { readonly: true, ownerAddress: ownerLinked })).join('')}
                </div>
            </div>`;
        }).filter(Boolean).join('');

        const totalLinked = groups.reduce((s, g) => {
            const rawList = state.detail.linkedMachines.get(g.otherId) || [];
            const deduped = rawList.filter(m => !alreadyShownIds.has(String(m.id)));
            return s + deduped.length + getAddressCustomMachines(g.otherId).length;
        }, 0);

        return `
        <div class="ab-section-head">
            <span class="ab-muted">${machines.length + customMachines.length} an dieser Adresse${workshopCount ? ` · davon ${workshopCount} in der Werkstatt` : ''}${totalLinked ? ` · ${totalLinked} über verknüpfte Adressen` : ''}</span>
            <button class="ab-btn ab-btn-primary ab-btn-sm" data-ab-action="custom-machine-new">${ic('plus', 14)} Manuelle Maschine hinzufügen</button>
        </div>
        <div class="ab-linked-stack">${ownBlock}${linkedBlocks}</div>`;
    }

    // Karte für manuell zur Adresse hinzugefügte Maschinen (getrennt von zentralen Maschinen)
    function customMachineCardHtml(cm, readonly = false) {
        const title = [cm.manufacturer, cm.name].filter(Boolean).join(' ') || 'Manuelle Maschine';
        const category = cm.category || cm.series || 'Manuell erfasst';
        const thumbHtml = `<div class="ab-machine-thumb ab-machine-thumb-fallback">${ic('machine', 26)}</div>`;

        return `
        <div class="ab-sub-card ab-machine-card${readonly ? ' ab-sub-card-readonly' : ''}">
            <div class="ab-sub-card-head">
                ${thumbHtml}
                <div class="ab-sub-card-title">
                    <div class="ab-machine-category"><span class="ab-pill ab-pill-warn" style="font-size:0.65rem; padding:2px 6px; margin-right:4px;">Manuell</span>${esc(category)}</div>
                    <div class="ab-sub-name">${esc(title)}</div>
                    <div class="ab-muted ab-small">${esc([cm.serial ? 'SN ' + cm.serial : '', cm.year || ''].filter(Boolean).join(' · '))}</div>
                </div>
                ${readonly ? '' : `
                <div class="ab-sub-card-actions-column">
                    <button class="ab-icon-btn" data-ab-action="custom-machine-edit" data-ab-id="${esc(cm.id)}" title="Bearbeiten">${ic('edit', 15)}</button>
                    <button class="ab-icon-btn ab-danger delete-permission-required" data-ab-action="custom-machine-delete" data-ab-id="${esc(cm.id)}" title="Löschen">${ic('trash', 15)}</button>
                </div>`}
            </div>
            <div class="ab-sub-card-body">
                ${cm.notes ? `<div class="ab-line">${ic('note', 14)}<span>${esc(cm.notes)}</span></div>` : ''}
            </div>
        </div>`;
    }

    // Wiederverwendbare Maschinen-Karte.
    function machineCardHtml(m, opts) {
        const readonly = !!(opts && opts.readonly);
        const title = [m.manufacturer, m.name].filter(Boolean).join(' ') || 'Maschine';
        const category = machineCategoryName(m) || m.machine_series || 'Maschine';
        const thumb = machineThumbUrl(m);

        // Zugeordnete Adresse — kommt aus m.customer_id oder alternativ aus
        // opts.ownerAddress (falls die Karte vom Aufrufer explizit benannt wird).
        // Wird auf JEDER Maschinenkarte angezeigt, damit sofort erkennbar ist,
        // an welcher Adresse die Maschine hängt.
        let owner = (opts && opts.ownerAddress) || null;
        if (!owner && m.customer_id) {
            const c = state.byId.get(String(m.customer_id));
            if (c) owner = { id: c.id, name: c.name };
        }
        // Bei Werkstattmaschinen ist der Betreiber die eigentlich spannende Info –
        // die Karte steht ja unter der eigenen Firmenadresse.
        let operatorHtml = '';
        if (isInWorkshop(m) && m.customer_id && (!owner || String(m.customer_id) !== String(owner.id))) {
            const op = state.byId.get(String(m.customer_id));
            if (op) {
                operatorHtml = `<div class="ab-line ab-muted ab-small">Betreiber: <a href="#" data-ab-action="open" data-ab-id="${esc(String(op.id))}">${esc(op.name)}</a></div>`;
            }
        }

        // Bei schwacher Datenlage wurde die Adresse nur geraten – das muss man
        // sehen können, sonst wirkt eine falsche Zuordnung wie gepflegt.
        const guessPill = m.__abGuessed
            ? '<span class="ab-pill ab-pill-warn" title="Automatisch anhand von Ort/Firma vermutet – bitte prüfen">vermutet</span>'
            : '';

        const ownerHtml = owner
            ? `<div class="ab-line ab-machine-owner">${ic('home', 14)}<span>bei: ${owner.id
                ? `<a href="#" data-ab-action="open" data-ab-id="${esc(String(owner.id))}">${esc(owner.name)}</a>`
                : esc(owner.name)}</span>${guessPill}</div>`
            : '';

        const thumbHtml = thumb
            ? `<div class="ab-machine-thumb"><img src="${esc(thumb)}" alt="" loading="lazy" onerror="this.parentNode.classList.add('ab-machine-thumb-fallback'); this.remove();"></div>`
            : `<div class="ab-machine-thumb ab-machine-thumb-fallback">${ic('machine', 26)}</div>`;

        // Status filtern: "betriebsbereit" ausblenden
        const rawStatus = (m.status || '').trim();
        const displayStatus = (rawStatus.toLowerCase() === 'betriebsbereit') ? '' : rawStatus;
        const statusHtml = (displayStatus || isInWorkshop(m))
            ? `<div class="ab-line">${displayStatus ? `<span class="ab-pill">${esc(displayStatus)}</span>` : ''}${isInWorkshop(m) ? '<span class="ab-pill ab-pill-warn">In der Werkstatt</span>' : ''}</div>`
            : '';

        return `
        <div class="ab-sub-card ab-machine-card${readonly ? ' ab-sub-card-readonly' : ''}">
            <div class="ab-sub-card-head">
                ${thumbHtml}
                <div class="ab-sub-card-title">
                    <div class="ab-machine-category">${esc(category)}</div>
                    <div class="ab-sub-name">${esc(title)}</div>
                    <div class="ab-muted ab-small">${esc([m.serial ? 'SN ' + m.serial : '', m.year || ''].filter(Boolean).join(' · '))}</div>
                </div>
                <div class="ab-sub-card-actions-column">
                    <button class="ab-icon-btn" data-ab-action="machine-open" data-ab-id="${esc(m.id)}" title="Maschine bearbeiten / öffnen" style="background: rgba(59, 130, 246, 0.15); color: #3b82f6; border: 1px solid rgba(59, 130, 246, 0.3);">${ic('edit', 15)}</button>
                    <button class="ab-icon-btn" data-ab-action="machine-history" data-ab-id="${esc(m.id)}" title="Historie der Maschine" style="background: rgba(59, 130, 246, 0.15); color: #3b82f6; border: 1px solid rgba(59, 130, 246, 0.3);">${ic('history', 15)}</button>
                </div>
            </div>
            <div class="ab-sub-card-body">
                ${ownerHtml}
                ${operatorHtml}
                ${statusHtml}
                ${(m.location_city || m.location_street) ? `<div class="ab-line">${ic('pin', 14)}<span>${esc([m.location_street, m.location_city].filter(Boolean).join(', '))}</span></div>` : ''}
                ${m.next_maintenance ? `<div class="ab-line">${ic('cal', 14)}<span>Nächste Wartung: ${esc(formatDate(m.next_maintenance))}</span></div>` : ''}
            </div>
            <div class="ab-machine-history" id="ab-mhist-${esc(m.id)}"></div>
        </div>`;
    }

    // Historie einer Maschine (Serviceberichte / Werkstattaufenthalte) direkt
    // in der Maschinenkarte aufklappen.
    async function toggleMachineHistory(machineId) {
        const el = document.getElementById('ab-mhist-' + machineId);
        if (!el) return;

        if (el.classList.contains('open')) {
            el.classList.remove('open');
            el.innerHTML = '';
            return;
        }

        el.classList.add('open');
        el.innerHTML = '<div class="ab-muted ab-small" style="padding:8px 0;">Historie wird geladen …</div>';

        try {
            const { data, error } = await sb()
                .from('service_entries')
                .select('id, date, title, description, technicians, workshop_order_number')
                .eq('machine_id', machineId)
                .order('date', { ascending: false })
                .limit(40);
            if (error) throw error;

            if (!data || !data.length) {
                el.innerHTML = '<div class="ab-muted ab-small" style="padding:8px 0;">Keine Einträge zu dieser Maschine.</div>';
                return;
            }

            el.innerHTML = `<div class="ab-timeline ab-timeline-compact">${data.map(s => {
                const techs = Array.isArray(s.technicians) ? s.technicians.filter(Boolean).join(', ') : '';
                return `
                <div class="ab-timeline-item" style="--ab-entry-color:#38bdf8">
                    <div class="ab-timeline-dot">${ic('note', 12)}</div>
                    <div class="ab-timeline-body">
                        <div class="ab-timeline-head">
                            ${s.title ? `<strong>${esc(s.title)}</strong>` : '<strong>Servicebericht</strong>'}
                            <span class="ab-muted ab-small">${esc(formatDate(s.date))}${techs ? ' · ' + esc(techs) : ''}${s.workshop_order_number ? ' · Auftrag ' + esc(s.workshop_order_number) : ''}</span>
                        </div>
                        ${s.description ? `<div class="ab-timeline-text">${esc(s.description)}</div>` : ''}
                    </div>
                </div>`;
            }).join('')}</div>`;
        } catch (err) {
            console.error('Maschinen-Historie konnte nicht geladen werden:', err);
            el.innerHTML = '<div class="ab-muted ab-small" style="padding:8px 0; color:#fca5a5;">Historie konnte nicht geladen werden.</div>';
        }
    }

    // ---------- Verknüpfungen ----------
    // Zeigt alle mit dieser Adresse verknüpften Adressen — direkt UND transitiv
    // in einer einheitlichen Liste, ohne die Unterscheidung sichtbar zu machen.
    // Nur der Löschen-Button hängt an einer direkten Verknüpfung; bei
    // transitiven müsste man die Zwischenverknüpfung entfernen, deshalb dort
    // kein Löschen-Icon.
    function renderLinksTab() {
        const currentId = state.currentId;
        const clusterMeta = state.detail.clusterMeta || new Map();

        const entries = [];
        clusterMeta.forEach((info, otherId) => {
            const other = state.byId.get(String(otherId));
            entries.push({
                otherId: String(otherId),
                other,
                direct: !!info.direct,
                link: info.direct ? info.link : null,
                linkType: info.direct ? info.link.link_type : null
            });
        });
        entries.sort((a, b) => {
            if (a.direct !== b.direct) return b.direct - a.direct;
            return (a.other ? a.other.name : '').localeCompare(b.other ? b.other.name : '', 'de');
        });

        const rows = entries.map(e => {
            const meta = e.direct ? linkTypeMeta(e.linkType) : null;
            const color = meta ? meta.color : '#7dd3fc';
            const outgoing = e.direct && String(e.link.customer_id) === String(currentId);
            // Der Typ-Tag ist bei direkten Verknüpfungen klickbar und lässt sich
            // nachträglich auf Rechnungsadresse/Lieferadresse/Filiale … umstellen.
            const pill = meta
                ? `<button type="button" class="ab-pill ab-pill-editable" data-ab-action="link-type" data-ab-id="${esc(e.link.id)}"
                        title="Art der Verknüpfung ändern"
                        style="border-color:${color}55; color:${color}; cursor:pointer; background:transparent;">${esc(meta.label)} ${ic('edit', 11)}</button>`
                : '';
            return `
            <div class="ab-sub-card ab-link-card" style="--ab-link-color:${color}">
                <div class="ab-sub-card-head">
                    <div class="ab-link-icon">${ic('link', 18)}</div>
                    <div class="ab-sub-card-title">
                        <div class="ab-sub-name">${esc(e.other ? e.other.name : 'Unbekannte Adresse')}</div>
                        <div class="ab-muted ab-small">
                            ${pill}
                            ${e.direct ? `<span>${outgoing ? 'zugeordnet' : 'zugeordnet von'}</span>` : ''}
                            ${e.other && (e.other.zip_code || e.other.city) ? `${pill || e.direct ? '· ' : ''}${esc([e.other.zip_code, e.other.city].filter(Boolean).join(' '))}` : ''}
                        </div>
                    </div>
                    <div class="ab-sub-card-actions">
                        ${e.other ? `<button class="ab-icon-btn" data-ab-action="open" data-ab-id="${esc(e.otherId)}" title="Adresse öffnen">${ic('edit', 15)}</button>` : ''}
                        ${e.direct ? `<button class="ab-icon-btn ab-danger delete-permission-required" data-ab-action="link-delete" data-ab-id="${esc(e.link.id)}" title="Verknüpfung entfernen">${ic('trash', 15)}</button>` : ''}
                    </div>
                </div>
                ${e.direct && e.link.note ? `<div class="ab-sub-card-body"><div class="ab-muted ab-small">${esc(e.link.note)}</div></div>` : ''}
            </div>`;
        }).join('');

        return `
        <div class="ab-section-head">
            <span class="ab-muted">${entries.length} ${entries.length === 1 ? 'verknüpfte Adresse' : 'verknüpfte Adressen'}</span>
            <button class="ab-btn ab-btn-primary" data-ab-action="link-new">${ic('plus', 16)} Adresse verknüpfen</button>
        </div>
        ${entries.length
            ? `<div class="ab-sub-grid">${rows}</div>`
            : '<div class="ab-empty"><div class="ab-empty-title">Keine verknüpften Adressen</div><div class="ab-empty-text">Verknüpfe Liefer- und Rechnungsadressen oder Schwesterfirmen, um zu sehen, wer zusammengehört.</div></div>'}`;
    }

    // renderLinkedMachines wurde entfernt: die Maschinen der verknüpften
    // Adressen stehen jetzt ausschließlich im Maschinen-Tab (dort gruppiert
    // nach Herkunft), damit der Verknüpfungen-Tab schlank bleibt.

    // ---------- Historie ----------
    state.historyFilter = 'all'; // 'all', 'address', 'machine'

    function renderHistoryTab() {
        const addr = state.byId.get(state.currentId);
        const addrName = addr ? addr.name : 'Adresse';

        // 1) Adress-Notizen/Historie (aus der eigenen Adresse + allen verknüpften Cluster-Adressen)
        const notes = (state.detail.notes || []).map(n => {
            const noteAddr = state.byId.get(String(n.customer_id));
            const noteAddrName = noteAddr ? noteAddr.name : (n.customer_id == state.currentId ? addrName : `Adresse #${n.customer_id}`);
            return {
                type: 'address',
                timestamp: new Date(n.entry_date || n.created_at).getTime(),
                dateStr: formatDate(n.entry_date) || formatDateTime(n.created_at),
                sourceLabel: `📍 ${noteAddrName}`,
                sourceColor: '#38bdf8',
                raw: n
            };
        });

        // 2) Maschinen-Historie (Servicereporte, Werkstatt-Einträge aller Cluster-Maschinen)
        const machinesMap = new Map((state.detail.allClusterMachines || state.detail.machines || []).map(m => [String(m.id), m]));
        const machineEntries = (state.detail.machineHistoryEntries || []).map(mh => {
            const m = machinesMap.get(String(mh.machine_id));
            
            // Maschinentitel vollständig zusammensetzen: Hersteller + Kategorie/Typ + Name + SN + Baujahr
            let mFullTitle = '';
            if (m) {
                const parts = [
                    m.manufacturer || '',
                    m.category || m.type || '',
                    m.name || m.title || '',
                    m.serial || m.serial_number ? `${m.serial || m.serial_number}` : '',
                    m.year ? `${m.year}` : ''
                ].filter(Boolean);
                mFullTitle = parts.join(' ');
            }
            if (!mFullTitle) mFullTitle = `Maschine #${mh.machine_id}`;

            return {
                type: 'machine',
                timestamp: new Date(mh.created_at || mh.entry_date).getTime(),
                dateStr: formatDateTime(mh.created_at || mh.entry_date),
                sourceLabel: mFullTitle,
                machineId: mh.machine_id,
                raw: mh
            };
        });

        // 3) Vorgänge (internal_processes) - falls machine_id vorhanden -> Maschinen-Header (Grün), sonst Adress-Header (Blau)
        const processEntries = (state.detail.processes || []).map(p => {
            const m = p.machine_id ? machinesMap.get(String(p.machine_id)) : null;
            let label = '';
            let isMachine = false;
            if (m) {
                isMachine = true;
                const parts = [m.manufacturer || '', m.category || m.type || '', m.name || m.title || '', m.serial || m.serial_number ? `${m.serial || m.serial_number}` : '', m.year ? `${m.year}` : ''].filter(Boolean);
                label = parts.join(' ') || `Maschine #${p.machine_id}`;
            } else {
                const procAddr = p.customer_id ? state.byId.get(String(p.customer_id)) : null;
                label = `📍 ${procAddr ? procAddr.name : addrName}`;
            }

            return {
                type: isMachine ? 'machine' : 'address',
                timestamp: new Date(p.process_date || p.created_at).getTime(),
                dateStr: formatDate(p.process_date) || formatDateTime(p.created_at),
                sourceLabel: isMachine ? label : label,
                raw: {
                    id: p.id,
                    type: 'process',
                    title: p.title || 'Vorgang',
                    content: p.remark || (Array.isArray(p.steps) ? `Schritte: ${p.steps.filter(s => s.done).length}/${p.steps.length} erledigt` : ''),
                    created_at: p.process_date || p.created_at
                }
            };
        });

        // 4) Aufgaben (tasks) - Maschinen-Aufgaben
        const taskEntries = (state.detail.machineTasks || []).map(t => {
            const m = t.machine_id ? machinesMap.get(String(t.machine_id)) : null;
            let label = '';
            if (m) {
                const parts = [m.manufacturer || '', m.category || m.type || '', m.name || m.title || '', m.serial || m.serial_number ? `${m.serial || m.serial_number}` : '', m.year ? `${m.year}` : ''].filter(Boolean);
                label = parts.join(' ') || `Maschine #${t.machine_id}`;
            } else {
                label = `📍 ${addrName}`;
            }

            return {
                type: m ? 'machine' : 'address',
                timestamp: new Date(t.created_at).getTime(),
                dateStr: formatDateTime(t.created_at),
                sourceLabel: label,
                raw: {
                    id: t.id,
                    type: 'task',
                    title: t.title || t.task || 'Aufgabe',
                    content: t.description || '',
                    created_at: t.created_at
                }
            };
        });

        // Alle Einträge zusammenführen & sortieren (neueste zuerst)
        let combined = [...notes, ...machineEntries, ...processEntries, ...taskEntries].sort((a, b) => b.timestamp - a.timestamp);

        // Filtern nach gewähltem Filter
        const filter = state.historyFilter || 'all';
        if (filter === 'address') {
            combined = combined.filter(item => item.type === 'address');
        } else if (filter === 'machine') {
            combined = combined.filter(item => item.type === 'machine');
        }

        const totalCount = notes.length + machineEntries.length;

        return `
        <div class="ab-section-head" style="flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between; margin-bottom: 1.25rem;">
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                <span class="ab-muted" style="font-weight: 600;">Filter:</span>
                <button class="ab-btn ${filter === 'all' ? 'ab-btn-primary' : 'ab-btn-secondary'}" onclick="window.setAddressbookHistoryFilter('all')" style="padding: 4px 12px; font-size: 0.82rem; border-radius: 20px;">Alle (${totalCount})</button>
                <button class="ab-btn ${filter === 'address' ? 'ab-btn-primary' : 'ab-btn-secondary'}" onclick="window.setAddressbookHistoryFilter('address')" style="padding: 4px 12px; font-size: 0.82rem; border-radius: 20px;">Nur Adress-Einträge (${notes.length})</button>
                <button class="ab-btn ${filter === 'machine' ? 'ab-btn-primary' : 'ab-btn-secondary'}" onclick="window.setAddressbookHistoryFilter('machine')" style="padding: 4px 12px; font-size: 0.82rem; border-radius: 20px;">Nur Maschinen-Historie (${machineEntries.length})</button>
            </div>
            <button class="ab-btn ab-btn-primary" data-ab-action="note-new">${ic('plus', 16)} Adress-Eintrag hinzufügen</button>
        </div>
        ${combined.length ? `<div class="ab-timeline">${combined.map(unifiedHistoryItemHtml).join('')}</div>`
                : '<div class="ab-empty"><div class="ab-empty-title">Keine Historien-Einträge gefunden</div><div class="ab-empty-text">Für die gewählte Filter-Einstellung liegen keine Notizen oder Maschinen-Historien vor.</div></div>'}`;
    }

    window.setAddressbookHistoryFilter = function(filter) {
        state.historyFilter = filter;
        const body = document.getElementById('addressbook-detail-body');
        if (body && typeof renderDetail === 'function') {
            renderDetail(false);
        }
    };

    function unifiedHistoryItemHtml(item) {
        if (item.type === 'address') {
            const n = item.raw;
            const meta = entryTypeMeta(n.entry_type);
            return `
            <div class="ab-timeline-item" style="--ab-entry-color:${meta.color}">
                <div class="ab-timeline-dot">${ic(meta.icon, 14)}</div>
                <div class="ab-timeline-body">
                    <div style="font-size: 0.82rem; font-weight: 700; color: #38bdf8; margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
                        ${esc(item.sourceLabel)}
                    </div>
                    <div class="ab-timeline-head">
                        <span class="ab-pill" style="border-color:${meta.color}55; color:${meta.color}">${esc(meta.label)}</span>
                        ${n.title ? `<strong>${esc(n.title)}</strong>` : ''}
                        <span class="ab-muted ab-small">${esc(item.dateStr)}${n.author ? ' · ' + esc(n.author) : ''}</span>
                        <button class="ab-icon-btn ab-danger ab-timeline-del delete-permission-required" data-ab-action="note-delete" data-ab-id="${esc(n.id)}" title="Eintrag löschen">${ic('trash', 14)}</button>
                    </div>
                    ${n.body ? `<div class="ab-timeline-text">${esc(n.body)}</div>` : ''}
                </div>
            </div>`;
        } else {
            const mh = item.raw;
            const typeMap = {
                'phone': { label: 'Telefonat', icon: '📞', color: '#10b981' },
                'note': { label: 'Bemerkung', icon: '📝', color: '#f59e0b' },
                'email': { label: 'E-Mail', icon: '✉️', color: '#3b82f6' },
                'photo': { label: 'Foto / Werkstatt', icon: '📸', color: '#8b5cf6' },
                'hours': { label: 'Betriebsstunden', icon: '⏱️', color: '#06b6d4' },
                'whatsapp': { label: 'WhatsApp', icon: '💬', color: '#22c55e' },
                'wartung': { label: 'Wartung', icon: '🔧', color: '#f97316' },
                'auslieferung': { label: 'Auslieferung', icon: '🚚', color: '#6366f1' },
                'angebot': { label: 'Angebot', icon: '📃', color: '#eab308' },
                'service': { label: 'Servicebericht', icon: '📄', color: '#3b82f6' },
                'process': { label: 'Vorgang', icon: '🗂️', color: '#818cf8' },
                'task': { label: 'Aufgabe', icon: '📋', color: '#f59e0b' }
            };
            const config = typeMap[mh.type] || { label: mh.type || 'Eintrag', icon: '⚙️', color: '#22c55e' };

            let filesHtml = '';
            // Normalisiere Bilder-URLs: s.files kann Strings oder Objekte {url, name, type} enthalten
            const rawFiles = Array.isArray(mh.files) ? mh.files : [];
            const imageUrls = [];
            rawFiles.forEach(f => {
                const url = typeof f === 'string' ? f : (f && f.url ? f.url : null);
                if (url) {
                    const isImg = url.match(/\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i) || (typeof f === 'object' && f.type && f.type.startsWith('image/'));
                    if (isImg || mh.type === 'photo') {
                        imageUrls.push(url);
                    }
                }
            });

            if (imageUrls.length > 0) {
                const jsonFiles = JSON.stringify(imageUrls).replace(/"/g, '&quot;');
                filesHtml = `
                    <div style="display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap; align-items: center;">
                        ${imageUrls.slice(0, 6).map((imgUrl, idx) => `
                            <img src="${esc(imgUrl)}" 
                                 onclick="event.stopPropagation(); window.openPhotosLightbox && window.openPhotosLightbox(${jsonFiles}, ${idx})" 
                                 style="width: 56px; height: 56px; object-fit: cover; border-radius: 8px; border: 1px solid rgba(255,255,255,0.2); cursor: pointer; transition: transform 0.2s;" 
                                 onmouseover="this.style.transform='scale(1.06)'" 
                                 onmouseout="this.style.transform='scale(1)'" 
                                 loading="lazy" 
                                 title="Bild vergrößern">
                        `).join('')}
                        ${imageUrls.length > 6 ? `<span style="font-size: 0.75rem; color: rgba(255,255,255,0.5);">+${imageUrls.length - 6} weitere Bilder</span>` : ''}
                    </div>`;
            }

            let pdfBtnHtml = '';
            if (mh.rawService && mh.rawService.pdf_url) {
                const pdfUrl = esc(mh.rawService.pdf_url);
                pdfBtnHtml = `
                    <button onclick="event.stopPropagation(); window.previewDocument && window.previewDocument('${pdfUrl}', 'Servicebericht', 'application/pdf')" 
                            title="PDF Servicebericht öffnen" 
                            style="padding: 4px 10px; font-size: 0.78rem; font-weight: 700; background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.4); border-radius: 6px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; margin-left: auto;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
                        PDF öffnen
                    </button>`;
            }

            const headerColor = item.type === 'machine' ? '#22c55e' : '#38bdf8';
            return `
            <div class="ab-timeline-item" style="--ab-entry-color:${config.color}">
                <div class="ab-timeline-dot">${config.icon}</div>
                <div class="ab-timeline-body">
                    <div style="font-size: 0.88rem; font-weight: 700; color: ${headerColor}; margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
                        ${esc(item.sourceLabel)}
                    </div>
                    <div class="ab-timeline-head" style="align-items: center;">
                        <span class="ab-pill" style="border-color:${config.color}55; color:${config.color}">${esc(config.label)}</span>
                        ${mh.title ? `<strong>${esc(mh.title)}</strong>` : ''}
                        <span class="ab-muted ab-small">${esc(item.dateStr)}</span>
                        ${pdfBtnHtml}
                    </div>
                    ${mh.content ? `<div class="ab-timeline-text" style="white-space: pre-wrap;">${esc(mh.content)}</div>` : ''}
                    ${filesHtml}
                </div>
            </div>`;
        }
    }

    // ---------- Vorgänge ----------
    // Status-Wortlaut wie im Vorgänge-Modul (internal_processes.status)
    const PROC_STATUS = {
        offen: { label: 'Offen', cls: '' },
        in_bearbeitung: { label: 'In Bearbeitung', cls: 'ab-pill-warn' },
        erledigt: { label: 'Erledigt', cls: 'ab-pill-success' }
    };

    function renderTasksTab() {
        const procList = state.detail.processes || [];

        const rows = procList.map(p => {
            const st = PROC_STATUS[p.status] || PROC_STATUS.offen;
            const steps = Array.isArray(p.steps) ? p.steps : [];
            const stepsDone = steps.filter(s => s.done).length;
            const typeLabel = (window.PROCESS_TYPE_INFO && window.PROCESS_TYPE_INFO[p.process_type])
                ? window.PROCESS_TYPE_INFO[p.process_type].label
                : (p.process_type || 'Vorgang');

            // Zugewiesene Mitarbeiter (assigned_users hält User-IDs)
            const assignedNames = (Array.isArray(p.assigned_users) ? p.assigned_users : [])
                .map(uid => {
                    const u = (window.userList || []).find(usr => String(usr.id) === String(uid));
                    return u ? u.name : null;
                })
                .filter(Boolean)
                .join(', ');

            // Erinnerung
            let remindHtml = '';
            if (p.remind_at && p.status !== 'erledigt') {
                const rd = new Date(p.remind_at);
                if (!isNaN(rd)) {
                    const diff = Math.round((new Date(rd).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86400000);
                    const color = diff < 0 ? '#f87171' : (diff <= 3 ? '#fbbf24' : 'rgba(255,255,255,0.6)');
                    const label = diff < 0 ? 'Erinnerung überfällig' : (diff === 0 ? 'Erinnerung heute' : 'Erinnerung');
                    remindHtml = `<div style="margin-top:6px;"><span class="ab-pill" style="color:${color}; border-color:${color}55;">⏰ ${label} ${formatDate(p.remind_at)}</span></div>`;
                }
            }

            return `
            <div class="ab-sub-card">
                <div class="ab-sub-card-head">
                    <div class="ab-link-icon" style="color:#a78bfa; border-color:rgba(167,139,250,0.3); background:rgba(167,139,250,0.1);">${ic('note', 18)}</div>
                    <div class="ab-sub-card-title">
                        <div class="ab-sub-name">
                            <span>${esc(p.title || 'Unbenannter Vorgang')}</span>
                            <span class="ab-pill ${st.cls}">${esc(st.label)}</span>
                        </div>
                        <div class="ab-muted ab-small" style="margin-top:4px;">
                            ${esc(typeLabel)}${p.process_date ? ` · ${formatDate(p.process_date)}` : ''}
                            ${steps.length ? ` · Schritte: ${stepsDone}/${steps.length}` : ''}
                            ${p.contact_name ? ` · ${esc(p.contact_name)}` : ''}
                            ${assignedNames ? ` · Zuständig: ${esc(assignedNames)}` : ''}
                        </div>
                        ${remindHtml}
                        ${steps.length ? `
                        <div style="margin-top:8px; display:flex; flex-direction:column; gap:4px;">
                            ${steps.slice(0, 5).map(s => `
                                <div class="ab-small" style="display:flex; align-items:center; gap:6px; color:${s.done ? 'rgba(255,255,255,0.4)' : 'var(--color-text)'};">
                                    <span style="width:14px; height:14px; border-radius:4px; flex-shrink:0; display:inline-flex; align-items:center; justify-content:center; border:1.5px solid ${s.done ? '#10b981' : 'rgba(255,255,255,0.25)'}; background:${s.done ? 'rgba(16,185,129,0.2)' : 'transparent'}; color:#10b981; font-size:10px; font-weight:900;">${s.done ? '✓' : ''}</span>
                                    <span style="${s.done ? 'text-decoration:line-through;' : ''}">${esc(s.text)}</span>
                                </div>`).join('')}
                            ${steps.length > 5 ? `<div class="ab-muted ab-small">… und ${steps.length - 5} weitere</div>` : ''}
                        </div>` : ''}
                    </div>
                    <div class="ab-sub-card-actions">
                        <button class="ab-icon-btn" data-ab-action="open-task-main" data-ab-id="${esc(p.id)}" title="Im Vorgänge-Modul öffnen">${ic('edit', 15)}</button>
                    </div>
                </div>
                ${p.remark ? `<div class="ab-sub-card-body"><div class="ab-muted ab-small">${esc(p.remark)}</div></div>` : ''}
            </div>`;
        }).join('');

        const migrationHint = state.detail.processesError
            ? `<div class="ab-empty" style="border-color:rgba(248,113,113,0.4);"><div class="ab-empty-title" style="color:#f87171;">Adressbezug fehlt in der Datenbank</div><div class="ab-empty-text">Bitte <strong>supabase_add_process_customer.sql</strong> im Supabase SQL-Editor ausführen. Danach lassen sich Vorgänge an Adressen hängen.</div></div>`
            : '';

        return `
        <div class="ab-section-head">
            <span class="ab-muted">${procList.length} ${procList.length === 1 ? 'Vorgang' : 'Vorgänge'} an dieser Adresse</span>
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
                <button class="ab-btn ab-btn-ghost" data-ab-action="task-ai" title="Freitext/Diktat per KI zu Vorgang + Schritten machen">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
                    KI‑Analyse
                </button>
                <button class="ab-btn ab-btn-primary" data-ab-action="task-new">${ic('plus', 16)} Vorgang erstellen</button>
            </div>
        </div>
        ${migrationHint}
        ${procList.length
            ? `<div class="ab-sub-grid">${rows}</div>`
            : (migrationHint ? '' : '<div class="ab-empty"><div class="ab-empty-title">Noch keine Vorgänge</div><div class="ab-empty-text">Erstelle Vorgänge für diese Adresse. Sie liegen in derselben Tabelle wie die Vorgänge auf der Vorgänge-Seite und erscheinen dort unter dem Firmennamen.</div></div>')}`;
    }

    // Öffnet das echte Vorgangs-Modal aus dem Vorgänge-Modul, nur an diese
    // Adresse gebunden statt an eine Maschine. Damit stehen hier dieselben
    // Funktionen zur Verfügung: Typ, Status, Schritte, Mitarbeiter, Erinnerung.
    function openAddressTaskForm() {
        const currentAddr = state.byId.get(state.currentId);

        if (typeof window.openProcessAddModal !== 'function') {
            window.showToast('Vorgänge-Modul nicht geladen.');
            return;
        }

        closeModal('addressbook-detail-modal');
        window.openProcessAddModal({
            customerId: state.currentId,
            customerName: currentAddr ? currentAddr.name : 'Adresse'
        });
    }

    function historyItemHtml(n) {
        const meta = entryTypeMeta(n.entry_type);
        return `
        <div class="ab-timeline-item" style="--ab-entry-color:${meta.color}">
            <div class="ab-timeline-dot">${ic(meta.icon, 14)}</div>
            <div class="ab-timeline-body">
                <div class="ab-timeline-head">
                    <span class="ab-pill" style="border-color:${meta.color}55; color:${meta.color}">${esc(meta.label)}</span>
                    ${n.title ? `<strong>${esc(n.title)}</strong>` : ''}
                    <span class="ab-muted ab-small">${esc(formatDate(n.entry_date) || formatDateTime(n.created_at))}${n.author ? ' · ' + esc(n.author) : ''}</span>
                    <button class="ab-icon-btn ab-danger ab-timeline-del delete-permission-required" data-ab-action="note-delete" data-ab-id="${esc(n.id)}" title="Eintrag löschen">${ic('trash', 14)}</button>
                </div>
                ${n.body ? `<div class="ab-timeline-text">${esc(n.body)}</div>` : ''}
            </div>
        </div>`;
    }

    // ==========================================
    // GENERISCHES FORMULAR-MODAL
    // ==========================================
    let formSubmitHandler = null;

    function ensureFormModal() {
        if (document.getElementById('addressbook-form-modal')) return;
        const el = document.createElement('div');
        el.id = 'addressbook-form-modal';
        el.className = 'modal-backdrop ab-modal-backdrop';
        el.innerHTML = `
            <div class="modal-content ab-form-content">
                <button class="ab-icon-btn ab-modal-close" data-ab-action="close-form" title="Schließen">${ic('close', 20)}</button>
                <h2 id="addressbook-form-title">Formular</h2>
                <form id="addressbook-form" autocomplete="off">
                    <div id="addressbook-form-fields"></div>
                    <div class="ab-form-actions">
                        <button type="button" class="ab-btn ab-btn-ghost" data-ab-action="close-form">Abbrechen</button>
                        <button type="submit" class="ab-btn ab-btn-primary" id="addressbook-form-submit">Speichern</button>
                    </div>
                </form>
            </div>`;
        document.body.appendChild(el);

        el.addEventListener('click', (e) => {
            if (e.target === el) closeFormModal();
        });

        document.getElementById('addressbook-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!formSubmitHandler) return;
            const btn = document.getElementById('addressbook-form-submit');
            const original = btn.innerHTML;
            btn.disabled = true;
            btn.textContent = 'Speichert …';
            try {
                await formSubmitHandler();
            } catch (err) {
                console.error(err);
                window.showToast('Speichern fehlgeschlagen: ' + (err.message || err));
            } finally {
                btn.disabled = false;
                btn.innerHTML = original;
            }
        });
    }

    function openFormModal(title, fieldsHtml, submitLabel, onSubmit) {
        ensureFormModal();
        document.getElementById('addressbook-form-title').textContent = title;
        document.getElementById('addressbook-form-fields').innerHTML = fieldsHtml;
        document.getElementById('addressbook-form-submit').textContent = submitLabel || 'Speichern';
        formSubmitHandler = onSubmit;
        openModal('addressbook-form-modal');
        const first = document.querySelector('#addressbook-form-fields input, #addressbook-form-fields textarea');
        if (first) setTimeout(() => first.focus(), 80);
    }

    function closeFormModal() {
        formSubmitHandler = null;
        closeModal('addressbook-form-modal');
    }

    let modalBaseZIndex = 10000;

    function openModal(id) {
        const el = document.getElementById(id);
        if (!el) return;
        modalBaseZIndex += 10;
        el.style.zIndex = modalBaseZIndex;
        el.classList.add('show', 'active');
        document.body.style.overflow = 'hidden';
    }

    function closeModal(id) {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.remove('show', 'active');
        el.style.zIndex = '';
        // Body-Scroll nur freigeben, wenn kein weiteres Adressbuch-Modal offen ist
        const stillOpen = document.querySelector('.ab-modal-backdrop.show');
        if (!stillOpen) {
            document.body.style.overflow = '';
            modalBaseZIndex = 10000;
        }
    }

    function field(label, id, value, opts) {
        const o = opts || {};
        const type = o.type || 'text';
        if (type === 'textarea') {
            return `<label class="ab-field ${o.wide ? 'ab-field-wide' : ''}">
                <span>${esc(label)}</span>
                <textarea id="${id}" rows="${o.rows || 4}" placeholder="${esc(o.placeholder || '')}">${esc(value || '')}</textarea>
            </label>`;
        }
        if (type === 'checkbox') {
            return `<label class="ab-field ab-field-check ${o.wide ? 'ab-field-wide' : ''}">
                <input type="checkbox" id="${id}" ${value ? 'checked' : ''}>
                <span>${esc(label)}</span>
            </label>`;
        }
        if (type === 'select') {
            return `<label class="ab-field ${o.wide ? 'ab-field-wide' : ''}">
                <span>${esc(label)}</span>
                <select id="${id}">
                    ${(o.options || []).map(op => `<option value="${esc(op.value)}" ${String(op.value) === String(value) ? 'selected' : ''}>${esc(op.label)}</option>`).join('')}
                </select>
            </label>`;
        }
        return `<label class="ab-field ${o.wide ? 'ab-field-wide' : ''}">
            <span>${esc(label)}${o.required ? ' *' : ''}</span>
            <input type="${type}" id="${id}" value="${esc(value || '')}" placeholder="${esc(o.placeholder || '')}" ${o.required ? 'required' : ''}>
        </label>`;
    }

    // ==========================================
    // ADRESSE: ANLEGEN / BEARBEITEN / LÖSCHEN
    // ==========================================
    function openAddressForm(id) {
        const a = id ? state.byId.get(String(id)) : null;
        const isEdit = !!a;

        const fields = `
        <div class="ab-form-grid">
            ${field('Firma / Name', 'ab-f-name', a && a.name, { required: true, wide: true, placeholder: 'z. B. Mustermann Recycling GmbH' })}
            ${field('Matchcode', 'ab-f-matchcode', a && a.matchcode)}
            ${field('Adressnummer', 'ab-f-address-number', a && a.address_number)}
            ${field('Kundennummer', 'ab-f-customer-number', a && a.customer_number)}
            ${state.migrationMissing ? '' : field('Als Kunde kennzeichnen', 'ab-f-is-customer', a ? isCustomer(a) : false, { type: 'checkbox' })}
            ${field('Straße & Nr.', 'ab-f-street', a && a.street, { wide: true })}
            ${field('PLZ', 'ab-f-zip', a && a.zip_code)}
            ${field('Ort', 'ab-f-city', a && a.city)}
            ${field('Land', 'ab-f-country', a ? a.country : 'Deutschland')}
            ${field('Telefon', 'ab-f-phone', a && a.phone, { type: 'tel' })}
            ${field('E-Mail', 'ab-f-email', a && a.email, { type: 'email' })}
            ${state.migrationMissing ? '' : field('Webseite', 'ab-f-website', a && a.website, { placeholder: 'www.beispiel.de' })}
            
            <div class="ab-field ab-field-wide">
                <span>Adresstyp (Mehrfachauswahl)</span>
                <div class="custom-multiselect-container" style="display:flex; flex-wrap:wrap; gap:8px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.1); padding:10px; border-radius:12px; min-height:44px;">
                    ${((window.categoryList || []).filter(c => c.type === 'address_type')).map(cat => {
                        const isSelected = a && a.address_type && a.address_type.split(',').map(s => s.trim()).includes(cat.name);
                        return `
                        <label style="display:flex; align-items:center; gap:6px; background:${isSelected ? 'rgba(56,189,248,0.15)' : 'rgba(255,255,255,0.05)'}; border:1px solid ${isSelected ? '#38bdf8' : 'rgba(255,255,255,0.1)'}; padding:6px 12px; border-radius:20px; font-size:0.82rem; cursor:pointer; color:${isSelected ? '#38bdf8' : '#fff'}; transition:all 0.15s; margin:0;" onmouseover="this.style.borderColor='#38bdf8'" onmouseout="if(!this.querySelector('input').checked) this.style.borderColor='rgba(255,255,255,0.1)'">
                            <input type="checkbox" name="ab-f-address-type" value="${esc(cat.name)}" ${isSelected ? 'checked' : ''} style="display:none;" onchange="this.parentElement.style.background=this.checked?'rgba(56,189,248,0.15)':'rgba(255,255,255,0.05)'; this.parentElement.style.color=this.checked?'#38bdf8':'#fff'; this.parentElement.style.borderColor=this.checked?'#38bdf8':'rgba(255,255,255,0.1)'">
                            <span style="width:8px; height:8px; border-radius:50%; background:${esc(cat.color || '#38bdf8')}; display:inline-block;"></span>
                            <span>${esc(cat.name)}</span>
                        </label>
                        `;
                    }).join('') || '<span style="font-size:0.8rem; color:rgba(255,255,255,0.4)">Keine Adresstypen in den Einstellungen definiert.</span>'}
                </div>
            </div>

            ${state.manufacturerMissing ? '' : `
            <div class="ab-field ab-field-wide">
                <span>Hersteller (Mehrfachauswahl)</span>
                <div class="custom-multiselect-container" style="display:flex; flex-wrap:wrap; gap:8px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.1); padding:10px; border-radius:12px; min-height:44px;">
                    ${((window.categoryList || []).filter(c => c.type === 'manufacturer')).map(cat => {
                        const isSelected = a && a.manufacturer && a.manufacturer.split(',').map(s => s.trim()).includes(cat.name);
                        return `
                        <label style="display:flex; align-items:center; gap:6px; background:${isSelected ? 'rgba(20,184,166,0.15)' : 'rgba(255,255,255,0.05)'}; border:1px solid ${isSelected ? '#14b8a6' : 'rgba(255,255,255,0.1)'}; padding:6px 12px; border-radius:20px; font-size:0.82rem; cursor:pointer; color:${isSelected ? '#14b8a6' : '#fff'}; transition:all 0.15s; margin:0;" onmouseover="this.style.borderColor='#14b8a6'" onmouseout="if(!this.querySelector('input').checked) this.style.borderColor='rgba(255,255,255,0.1)'">
                            <input type="checkbox" name="ab-f-manufacturer" value="${esc(cat.name)}" ${isSelected ? 'checked' : ''} style="display:none;" onchange="this.parentElement.style.background=this.checked?'rgba(20,184,166,0.15)':'rgba(255,255,255,0.05)'; this.parentElement.style.color=this.checked?'#14b8a6':'#fff'; this.parentElement.style.borderColor=this.checked?'#14b8a6':'rgba(255,255,255,0.1)'">
                            <span style="width:8px; height:8px; border-radius:50%; background:${esc(cat.color || '#14b8a6')}; display:inline-block;"></span>
                            <span>${esc(cat.name)}</span>
                        </label>
                        `;
                    }).join('') || '<span style="font-size:0.8rem; color:rgba(255,255,255,0.4)">Keine Hersteller in den Einstellungen definiert.</span>'}
                </div>
            </div>`}

            ${state.migrationMissing ? '' : field('Notiz', 'ab-f-notes', a && a.notes, { type: 'textarea', wide: true, placeholder: 'Interne Notizen zu dieser Adresse …' })}
        </div>`;

        openFormModal(isEdit ? 'Adresse bearbeiten' : 'Neue Adresse', fields, isEdit ? 'Änderungen speichern' : 'Adresse anlegen', async () => {
            const name = val('ab-f-name');
            if (!name) { window.showToast('Bitte einen Firmen-/Namen angeben.'); return; }

            const payload = {
                name: name,
                matchcode: val('ab-f-matchcode') || null,
                address_number: val('ab-f-address-number') || null,
                customer_number: val('ab-f-customer-number') || null,
                street: val('ab-f-street') || null,
                zip_code: val('ab-f-zip') || null,
                city: val('ab-f-city') || null,
                country: val('ab-f-country') || null,
                phone: val('ab-f-phone') || null,
                email: val('ab-f-email') || null
            };

            // Collect selected address types from checkboxes
            const selectedAddressTypes = Array.from(document.querySelectorAll('input[name="ab-f-address-type"]:checked')).map(el => el.value).join(', ');
            payload.address_type = selectedAddressTypes || null;

            if (!state.manufacturerMissing) {
                const selectedManufacturers = Array.from(document.querySelectorAll('input[name="ab-f-manufacturer"]:checked')).map(el => el.value).join(', ');
                payload.manufacturer = selectedManufacturers || null;
            }

            // Zusatzfelder nur senden, wenn die Migration eingespielt ist – sonst
            // scheitert der ganze Insert/Update an unbekannten Spalten.
            if (!state.migrationMissing) {
                payload.is_customer = checked('ab-f-is-customer');
                payload.website = val('ab-f-website') || null;
                payload.notes = val('ab-f-notes') || null;
            }

            if (isEdit) {
                const { data, error } = await sb().from('customers').update(payload).eq('id', a.id).select().single();
                if (error) throw error;
                Object.assign(a, data);
                state.byId.set(String(a.id), a);

                // Cluster-Erkennung: alle verknüpften Adressen über Supabase ermitteln
                try {
                    const currentKey = String(a.id);
                    const clusterIds = new Set();
                    let frontier = [currentKey];
                    for (let depth = 0; depth < 6 && frontier.length; depth++) {
                        const { data: rows } = await sb()
                            .from('customer_links')
                            .select('customer_id, linked_customer_id')
                            .or(`customer_id.in.(${frontier.join(',')}),linked_customer_id.in.(${frontier.join(',')})`);
                        
                        const next = [];
                        (rows || []).forEach(l => {
                            [l.customer_id, l.linked_customer_id].forEach(x => {
                                const k = String(x);
                                if (k !== currentKey && !clusterIds.has(k)) {
                                    clusterIds.add(k);
                                    next.push(k);
                                }
                            });
                        });
                        frontier = next;
                    }

                    const linkedIds = Array.from(clusterIds);
                    if (linkedIds.length > 0) {
                        const clusterPayload = {};
                        if ('address_type' in payload) clusterPayload.address_type = payload.address_type;
                        if ('manufacturer' in payload) clusterPayload.manufacturer = payload.manufacturer;

                        if (Object.keys(clusterPayload).length > 0) {
                            const { error: clusterErr } = await sb()
                                .from('customers')
                                .update(clusterPayload)
                                .in('id', linkedIds);
                            
                            if (!clusterErr) {
                                linkedIds.forEach(lid => {
                                    const linkedAddr = state.byId.get(String(lid));
                                    if (linkedAddr) {
                                        Object.assign(linkedAddr, clusterPayload);
                                    }
                                    const mainAddrObj = state.addresses.find(x => String(x.id) === String(lid));
                                    if (mainAddrObj) {
                                        Object.assign(mainAddrObj, clusterPayload);
                                    }
                                });
                            }
                        }
                    }
                } catch (cErr) {
                    console.warn('Fehler beim Cluster-Sync:', cErr);
                }

                await addHistoryEntry(String(a.id), 'system', 'Stammdaten geändert (Cluster synchronisiert)', null, true);
            } else {
                const { data, error } = await sb().from('customers').insert([payload]).select().single();
                if (error) throw error;
                state.addresses.push(data);
                state.byId.set(String(data.id), data);
                await addHistoryEntry(String(data.id), 'system', 'Adresse angelegt', null, true);
            }

            closeFormModal();
            buildCountryFilter();
            renderAddressList();
            if (isEdit && state.currentId === String(a.id)) renderDetail();
            toast(isEdit ? 'Adresse gespeichert.' : 'Adresse angelegt.');
        });
    }

    async function deleteAddress(id) {
        if (typeof window.canDelete === 'function' && !window.canDelete('Adressen')) return;
        const a = state.byId.get(String(id));
        if (!a) return;

        const machines = state.machinesByCustomer.get(String(id)) || [];
        const contacts = state.contactCount.get(String(id)) || 0;
        const links = state.linkCount.get(String(id)) || 0;

        const details = [];
        if (contacts) details.push(`${contacts} Ansprechpartner`);
        if (links) details.push(`${links} Verknüpfungen`);
        details.push('die komplette Historie');

        let msg = `Adresse "${a.name}" ENDGÜLTIG aus der Datenbank löschen?\n\n`
            + `Mitgelöscht werden: ${details.join(', ')}.\n`;
        if (machines.length) {
            msg += `\n${machines.length} ${machines.length === 1 ? 'Maschine bleibt' : 'Maschinen bleiben'} erhalten, `
                + `verliert aber die Zuordnung zu dieser Adresse.\n`;
        }
        msg += '\nDieser Vorgang kann nicht rückgängig gemacht werden.';

        if (!confirm(msg)) return;

        try {
            // Maschinenzuordnung vorher lösen, damit das Löschen nicht an der
            // Fremdschlüsselbeziehung scheitert (falls ON DELETE SET NULL fehlt).
            if (machines.length) {
                const { error: mErr } = await sb().from('machines').update({ customer_id: null }).eq('customer_id', a.id);
                if (mErr) throw mErr;
            }

            const { error } = await sb().from('customers').delete().eq('id', a.id);
            if (error) throw error;

            state.addresses = state.addresses.filter(x => String(x.id) !== String(id));
            state.byId.delete(String(id));
            state.machinesByCustomer.delete(String(id));
            state.contactCount.delete(String(id));
            state.linkCount.delete(String(id));

            closeModal('addressbook-detail-modal');
            state.currentId = null;
            renderAddressList();
            toast('Adresse endgültig gelöscht.');
        } catch (err) {
            console.error('Löschen fehlgeschlagen:', err);
            window.showToast('Löschen fehlgeschlagen: ' + (err.message || err));
        }
    }

    // ==========================================
    // ANSPRECHPARTNER CRUD
    // ==========================================
    function openContactForm(contactId) {
        const c = contactId ? state.detail.contacts.find(x => String(x.id) === String(contactId)) : null;
        const isEdit = !!c;

        const fields = `
        <div class="ab-form-grid">
            ${field('Anrede', 'ab-c-salutation', c && c.salutation, { placeholder: 'Herr / Frau' })}
            ${field('Name', 'ab-c-name', c && c.name, { required: true })}
            ${field('Funktion / Position', 'ab-c-position', c && c.position, { placeholder: 'z. B. Betriebsleiter' })}
            ${field('Abteilung', 'ab-c-department', c && c.department)}
            ${field('Telefon', 'ab-c-phone', c && c.phone, { type: 'tel' })}
            ${field('Mobil', 'ab-c-mobile', c && c.mobile, { type: 'tel' })}
            ${field('E-Mail', 'ab-c-email', c && c.email, { type: 'email' })}
            ${field('Notiz', 'ab-c-notes', c && c.notes, { type: 'textarea', wide: true, rows: 3 })}
        </div>`;

        openFormModal(isEdit ? 'Ansprechpartner bearbeiten' : 'Neuer Ansprechpartner', fields, 'Speichern', async () => {
            const name = val('ab-c-name');
            if (!name) { window.showToast('Bitte einen Namen angeben.'); return; }

            const payload = {
                customer_id: state.byId.get(state.currentId).id,
                salutation: val('ab-c-salutation') || null,
                name: name,
                position: val('ab-c-position') || null,
                department: val('ab-c-department') || null,
                phone: val('ab-c-phone') || null,
                mobile: val('ab-c-mobile') || null,
                email: val('ab-c-email') || null,
                notes: val('ab-c-notes') || null
            };

            if (isEdit) {
                const { error } = await sb().from('customer_contacts').update(payload).eq('id', c.id);
                if (error) throw error;
                await addHistoryEntry(state.currentId, 'system', `Ansprechpartner „${name}“ geändert`, null, true);
            } else {
                const { error } = await sb().from('customer_contacts').insert([payload]);
                if (error) throw error;
                await addHistoryEntry(state.currentId, 'system', `Ansprechpartner „${name}“ angelegt`, null, true);
            }

            closeFormModal();
            await refreshDetail();
            toast('Ansprechpartner gespeichert.');
        });
    }

    async function deleteContact(contactId) {
        if (typeof window.canDelete === 'function' && !window.canDelete('Ansprechpartnern')) return;
        const c = state.detail.contacts.find(x => String(x.id) === String(contactId));
        if (!c) return;
        if (!confirm(`Ansprechpartner "${c.name}" endgültig löschen?`)) return;
        try {
            const { error } = await sb().from('customer_contacts').delete().eq('id', c.id);
            if (error) throw error;
            await addHistoryEntry(state.currentId, 'system', `Ansprechpartner „${c.name}“ gelöscht`, null, true);
            await refreshDetail();
            renderAddressList();
            toast('Ansprechpartner gelöscht.');
        } catch (err) {
            window.showToast('Löschen fehlgeschlagen: ' + (err.message || err));
        }
    }

    // ==========================================
    // VERKNÜPFUNGEN
    // ==========================================
    function openLinkForm() {
        const fields = `
        <div class="ab-form-grid">
            <div class="ab-field ab-field-wide">
                <span>Adresse suchen *</span>
                <input type="text" id="ab-l-search" placeholder="Firma, Matchcode, Ort oder Nummer …" autocomplete="off">
                <input type="hidden" id="ab-l-target">
                <div id="ab-l-results" class="ab-suggest"></div>
                <div id="ab-l-selected" class="ab-selected-hint"></div>
            </div>
            ${field('Art der Verknüpfung', 'ab-l-type', getLinkTypes()[0]?.value || 'lieferadresse', {
            type: 'select',
            options: getLinkTypes().map(t => ({ value: t.value, label: t.label }))
        })}
            ${field('Bemerkung', 'ab-l-note', '', { placeholder: 'optional' })}
        </div>`;

        openFormModal('Adresse verknüpfen', fields, 'Verknüpfen', async () => {
            const targetId = val('ab-l-target');
            if (!targetId) { window.showToast('Bitte eine Adresse aus der Liste auswählen.'); return; }
            if (String(targetId) === String(state.currentId)) { window.showToast('Eine Adresse kann nicht mit sich selbst verknüpft werden.'); return; }

            const linkType = val('ab-l-type') || 'sonstige';
            const target = state.byId.get(String(targetId));

            const newLinkRow = {
                customer_id: state.byId.get(state.currentId).id,
                linked_customer_id: target.id,
                link_type: linkType,
                note: val('ab-l-note') || null
            };

            const { data: insertedData, error } = await sb().from('customer_links').insert([newLinkRow]).select().single();
            if (error) {
                if (String(error.message || '').toLowerCase().includes('duplicate')) {
                    window.showToast('Diese Verknüpfung besteht bereits.');
                    return;
                }
                throw error;
            }

            if (insertedData) {
                if (!state.allLinks) state.allLinks = [];
                state.allLinks.push(insertedData);
            }

            // Beim Verknüpfen zweier Adressen: Hersteller & Adresstypen des gesamten Clusters zusammenführen & synchronisieren
            try {
                const clusterMeta = buildClusterMeta(String(state.currentId), state.allLinks || []);
                const allClusterIds = [String(state.currentId), ...Array.from(clusterMeta.keys())];

                const mfgSet = new Set();
                const typeSet = new Set();

                allClusterIds.forEach(cid => {
                    const addr = state.byId.get(String(cid));
                    if (addr) {
                        (addr.manufacturer || '').split(',').map(s => s.trim()).filter(Boolean).forEach(m => mfgSet.add(m));
                        (addr.address_type || '').split(',').map(s => s.trim()).filter(Boolean).forEach(t => typeSet.add(t));
                    }
                });

                const combinedMfg = Array.from(mfgSet).join(', ') || null;
                const combinedTypes = Array.from(typeSet).join(', ') || null;

                const clusterUpdatePayload = {
                    manufacturer: combinedMfg,
                    address_type: combinedTypes
                };

                const { error: syncErr } = await sb()
                    .from('customers')
                    .update(clusterUpdatePayload)
                    .in('id', allClusterIds);

                if (!syncErr) {
                    allClusterIds.forEach(cid => {
                        const addr = state.byId.get(String(cid));
                        if (addr) {
                            addr.manufacturer = combinedMfg;
                            addr.address_type = combinedTypes;
                        }
                    });
                }
            } catch (syncError) {
                console.warn('Fehler bei der Verknüpfungs-Synchronisierung:', syncError);
            }

            await addHistoryEntry(state.currentId, 'system',
                `Verknüpft mit „${target.name}“ (${linkTypeMeta(linkType).label})`, null, true);

            closeFormModal();
            await refreshDetail();
            renderAddressList();
            toast('Adresse verknüpft.');
        });

        setupAddressSearchInput('ab-l-search', 'ab-l-results', 'ab-l-target', 'ab-l-selected');
    }

    // Client-seitige Adresssuche im bereits geladenen Bestand
    function setupAddressSearchInput(inputId, resultsId, hiddenId, selectedId) {
        const input = document.getElementById(inputId);
        const results = document.getElementById(resultsId);
        const hidden = document.getElementById(hiddenId);
        const selected = document.getElementById(selectedId);
        if (!input || !results) return;

        input.addEventListener('input', () => {
            const q = input.value.trim().toLowerCase();
            hidden.value = '';
            if (selected) selected.textContent = '';
            if (q.length < 2) { results.innerHTML = ''; results.classList.remove('open'); return; }

            const terms = q.split(/\s+/).filter(Boolean);
            const hits = state.addresses
                .filter(a => String(a.id) !== String(state.currentId) && matchesSearch(a, terms))
                .slice(0, 12);

            if (!hits.length) {
                results.innerHTML = '<div class="ab-suggest-empty">Keine Adresse gefunden</div>';
            } else {
                results.innerHTML = hits.map(a => `
                    <button type="button" class="ab-suggest-item" data-ab-pick="${esc(String(a.id))}">
                        <span class="ab-suggest-name">${esc(a.name)}${isCustomer(a) ? '<span class="ab-pill ab-pill-green">Kunde</span>' : ''}</span>
                        <span class="ab-suggest-sub">${esc([a.zip_code, a.city, a.address_number ? 'Adr. ' + a.address_number : ''].filter(Boolean).join(' · '))}</span>
                    </button>`).join('');
            }
            results.classList.add('open');
        });

        results.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-ab-pick]');
            if (!btn) return;
            const a = state.byId.get(btn.getAttribute('data-ab-pick'));
            if (!a) return;
            hidden.value = String(a.id);
            input.value = a.name;
            results.innerHTML = '';
            results.classList.remove('open');
            if (selected) selected.textContent = 'Ausgewählt: ' + [a.name, a.zip_code, a.city].filter(Boolean).join(', ');
        });
    }

    // Art einer bestehenden Verknüpfung nachträglich ändern (Klick auf den Tag).
    function openLinkTypeForm(linkId) {
        const link = (state.detail.links || []).find(l => String(l.id) === String(linkId));
        if (!link) { window.showToast('Verknüpfung nicht gefunden.'); return; }

        const otherId = String(link.customer_id) === String(state.currentId)
            ? link.linked_customer_id
            : link.customer_id;
        const other = state.byId.get(String(otherId));
        const currentType = linkTypeMeta(link.link_type).value;

        const fields = `
        <div class="ab-form-grid">
            <div class="ab-field ab-field-wide ab-hint">
                Verknüpfung mit <strong>${esc(other ? other.name : 'dieser Adresse')}</strong>
            </div>
            ${field('Art der Verknüpfung', 'ab-lt-type', currentType, {
                type: 'select',
                options: getLinkTypes().map(t => ({ value: t.value, label: t.label }))
            })}
            ${field('Bemerkung', 'ab-lt-note', link.note || '', { placeholder: 'optional' })}
        </div>`;

        openFormModal('Art der Verknüpfung ändern', fields, 'Speichern', async () => {
            const newType = val('ab-lt-type') || 'sonstige';
            const { error } = await sb().from('customer_links')
                .update({ link_type: newType, note: val('ab-lt-note') || null })
                .eq('id', link.id);
            if (error) throw error;

            await addHistoryEntry(state.currentId, 'system',
                `Verknüpfung mit „${other ? other.name : 'Adresse'}" geändert auf ${linkTypeMeta(newType).label}`, null, true);

            closeFormModal();
            await refreshDetail();
            toast('Art der Verknüpfung geändert.');
        });
    }

    async function deleteLink(linkId) {
        if (typeof window.canDelete === 'function' && !window.canDelete('Verknüpfungen')) return;
        if (!confirm('Verknüpfung entfernen?')) return;
        try {
            const { error } = await sb().from('customer_links').delete().eq('id', linkId);
            if (error) throw error;
            await refreshDetail();
            renderAddressList();
            toast('Verknüpfung entfernt.');
        } catch (err) {
            window.showToast('Entfernen fehlgeschlagen: ' + (err.message || err));
        }
    }

    // ==========================================
    // MASCHINEN VERKNÜPFEN
    // ==========================================
    function openMachineLinkForm() {
        const fields = `
        <div class="ab-form-grid">
            <div class="ab-field ab-field-wide">
                <span>Maschine suchen *</span>
                <input type="text" id="ab-m-search" placeholder="Hersteller, Typ oder Seriennummer …" autocomplete="off">
                <input type="hidden" id="ab-m-target">
                <div id="ab-m-results" class="ab-suggest"></div>
                <div id="ab-m-selected" class="ab-selected-hint"></div>
            </div>
            <div class="ab-field ab-field-wide ab-hint">
                Die Maschine wird dieser Adresse als Betreiber/Kunde zugeordnet. Eine bestehende
                Zuordnung zu einer anderen Adresse wird dabei ersetzt.
            </div>
            ${field('Diese Adresse auch als Maschinenstandort eintragen', 'ab-m-setloc', true, { type: 'checkbox', wide: true })}
            <div class="ab-field ab-field-wide ab-hint">
                Empfohlen: Der Standort hat Vorrang vor dem Betreiber. Bleibt an der Maschine ein
                abweichender Standort stehen, erscheint sie weiterhin dort statt hier.
            </div>
        </div>`;

        openFormModal('Maschine verknüpfen', fields, 'Verknüpfen', async () => {
            const machineId = val('ab-m-target');
            if (!machineId) { window.showToast('Bitte eine Maschine aus der Liste auswählen.'); return; }

            const address = state.byId.get(state.currentId);
            const payload = { customer_id: address.id };
            if (address.customer_number) payload.customer_number = address.customer_number;

            // Standort mitschreiben, damit die Maschine eindeutig hier landet –
            // ein abweichender Alt-Standort hätte sonst weiterhin Vorrang.
            if (checked('ab-m-setloc')) {
                payload.location_company = address.name || null;
                payload.location_street = address.street || null;
                payload.location_zip = address.zip_code || null;
                payload.location_city = address.city || null;
            }

            const { error } = await sb().from('machines').update(payload).eq('id', machineId);
            if (error) throw error;

            await addHistoryEntry(state.currentId, 'system', 'Maschine verknüpft', null, true);

            closeFormModal();
            // Maschinen-Index neu aufbauen, sonst zeigt der Tab noch den alten Stand.
            await window.loadAddressbook(true);
            await refreshDetail();
            toast('Maschine verknüpft.');
        });

        setupMachineSearchInput();
    }

    function setupMachineSearchInput() {
        const input = document.getElementById('ab-m-search');
        const results = document.getElementById('ab-m-results');
        const hidden = document.getElementById('ab-m-target');
        const selected = document.getElementById('ab-m-selected');
        if (!input || !results) return;

        // Ohne Sucheingabe stehen die nicht zugeordneten Maschinen direkt zur
        // Auswahl – das ist der Normalfall beim Aufräumen. Erst beim Tippen
        // wird im gesamten Maschinenpark gesucht.
        const machineSuggestHtml = (m, note) =>
            `<button type="button" class="ab-suggest-item" data-ab-pick-machine="${esc(String(m.id))}"
                data-ab-machine-label="${esc([m.manufacturer, m.name, m.serial ? 'SN ' + m.serial : ''].filter(Boolean).join(' '))}">
                <span class="ab-suggest-name">${esc([m.manufacturer, m.name].filter(Boolean).join(' ') || 'Maschine')}</span>
                <span class="ab-suggest-sub">${esc([m.serial ? 'SN ' + m.serial : '', m.year || '', note].filter(Boolean).join(' · '))}</span>
            </button>`;

        const showUnassigned = () => {
            const open = state.unassignedMachines || [];
            if (!open.length) {
                results.innerHTML = '<div class="ab-suggest-empty">Alle Maschinen sind bereits zugeordnet — zum Suchen tippen.</div>';
            } else {
                results.innerHTML = `<div class="ab-suggest-head">${open.length} Maschine${open.length === 1 ? '' : 'n'} ohne Zuordnung</div>`
                    + open.map(m => machineSuggestHtml(m, 'ohne Zuordnung')).join('');
            }
            results.classList.add('open');
        };

        showUnassigned();
        input.addEventListener('focus', () => { if (!input.value.trim()) showUnassigned(); });

        let timer = null;
        input.addEventListener('input', () => {
            clearTimeout(timer);
            hidden.value = '';
            if (selected) selected.textContent = '';
            const q = input.value.trim();
            if (q.length < 2) { showUnassigned(); return; }

            results.innerHTML = '<div class="ab-suggest-empty">Suche …</div>';
            results.classList.add('open');

            timer = setTimeout(async () => {
                try {
                    const { data, error } = await sb()
                        .from('machines')
                        .select('id, name, manufacturer, serial, year, customer_id')
                        .or(`name.ilike.%${q}%,manufacturer.ilike.%${q}%,serial.ilike.%${q}%`)
                        .limit(15);
                    if (error) throw error;

                    if (!data || !data.length) {
                        results.innerHTML = '<div class="ab-suggest-empty">Keine Maschine gefunden</div>';
                        return;
                    }

                    // Nicht zugeordnete Maschinen zuerst – die will man hier meistens.
                    const openIds = new Set((state.unassignedMachines || []).map(x => String(x.id)));
                    const sorted = [...data].sort((a, b) =>
                        (openIds.has(String(b.id)) ? 1 : 0) - (openIds.has(String(a.id)) ? 1 : 0));

                    results.innerHTML = sorted.map(m => {
                        const owner = m.customer_id ? state.byId.get(String(m.customer_id)) : null;
                        const note = openIds.has(String(m.id))
                            ? 'ohne Zuordnung'
                            : (owner ? 'aktuell: ' + owner.name : 'bereits zugeordnet');
                        return machineSuggestHtml(m, note);
                    }).join('');
                } catch (err) {
                    results.innerHTML = '<div class="ab-suggest-empty">Fehler bei der Suche</div>';
                    console.error(err);
                }
            }, 250);
        });

        results.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-ab-pick-machine]');
            if (!btn) return;
            hidden.value = btn.getAttribute('data-ab-pick-machine');
            input.value = btn.getAttribute('data-ab-machine-label');
            results.innerHTML = '';
            results.classList.remove('open');
            if (selected) selected.textContent = 'Ausgewählt: ' + btn.getAttribute('data-ab-machine-label');
        });
    }

    async function unlinkMachine(machineId) {
        const m = state.detail.machines.find(x => String(x.id) === String(machineId));
        if (!m) return;
        const label = [m.manufacturer, m.name].filter(Boolean).join(' ') || 'Maschine';
        if (!confirm(`Verknüpfung zu "${label}" lösen?\n\nDie Maschine selbst bleibt erhalten.`)) return;
        try {
            const payload = { customer_id: null };

            // Zeigt der hinterlegte Standort auf genau diese Adresse, muss er mit
            // gelöscht werden – sonst bliebe die Maschine über den Standort hier hängen.
            const current = state.byId.get(state.currentId);
            if (current) {
                const score = scoreAddress(current, locationParts(m));
                if (score >= MATCH_MIN_SCORE) {
                    payload.location_company = null;
                    payload.location_street = null;
                    payload.location_zip = null;
                    payload.location_city = null;
                }
            }

            const { error } = await sb().from('machines').update(payload).eq('id', m.id);
            if (error) throw error;
            await addHistoryEntry(state.currentId, 'system', `Maschine „${label}“ entkoppelt`, null, true);
            await window.loadAddressbook(true);
            await refreshDetail();
            toast('Verknüpfung gelöst.');
        } catch (err) {
            window.showToast('Lösen fehlgeschlagen: ' + (err.message || err));
        }
    }

    function openMachine(machineId) {
        closeModal('addressbook-detail-modal');
        if (typeof window.switchView === 'function') window.switchView('machines');
        if (typeof window.openMachineDetail === 'function') {
            window.openMachineDetail(machineId);
        } else if (typeof window.openEditMachineModal === 'function') {
            window.openEditMachineModal(machineId);
        }
    }

    // ---------- Manuelle (lokale) Maschinen für Adressen ----------
    function openCustomMachineForm(customId) {
        const list = getAddressCustomMachines(state.currentId);
        const cm = customId ? list.find(x => String(x.id) === String(customId)) : null;
        const isEdit = !!cm;

        const mfgOptions = [
            { value: '', label: '-- Hersteller wählen / Sonstige --' },
            ...((window.categoryList || [])
                .filter(c => c.type === 'manufacturer')
                .map(c => ({ value: c.name, label: c.name })))
        ];

        const catOptions = [
            { value: '', label: '-- Maschinentyp wählen / Sonstige --' },
            ...((window.categoryList || [])
                .filter(c => c.type === 'machine')
                .map(c => ({ value: c.name, label: c.name })))
        ];

        const fields = `
        <div class="ab-form-grid">
            ${field('Hersteller', 'ab-cm-manufacturer', cm && cm.manufacturer, { type: 'select', options: mfgOptions })}
            ${field('Maschinenbezeichnung / Modell', 'ab-cm-name', cm && cm.name, { required: true, placeholder: 'z. B. Urraco 75, Miura 850 …' })}
            ${field('Maschinentyp / Kategorie', 'ab-cm-category', cm && cm.category, { type: 'select', options: catOptions })}
            ${field('Seriennummer', 'ab-cm-serial', cm && cm.serial, { placeholder: 'z. B. SN-123456' })}
            ${field('Baujahr', 'ab-cm-year', cm && cm.year, { placeholder: 'z. B. 2021' })}
            ${field('Bemerkungen', 'ab-cm-notes', cm && cm.notes, { type: 'textarea', wide: true, placeholder: 'Zusätzliche Infos zu dieser Maschine …' })}
        </div>`;

        openFormModal(isEdit ? 'Manuelle Maschine bearbeiten' : 'Manuelle Maschine hinzufügen', fields, 'Speichern', async () => {
            const name = val('ab-cm-name');
            if (!name) { window.showToast('Bitte eine Maschinenbezeichnung angeben.'); return; }

            const currentList = getAddressCustomMachines(state.currentId);
            if (isEdit) {
                const idx = currentList.findIndex(x => String(x.id) === String(customId));
                if (idx !== -1) {
                    currentList[idx] = {
                        ...currentList[idx],
                        manufacturer: val('ab-cm-manufacturer') || null,
                        name: name,
                        category: val('ab-cm-category') || null,
                        serial: val('ab-cm-serial') || null,
                        year: val('ab-cm-year') || null,
                        notes: val('ab-cm-notes') || null
                    };
                }
            } else {
                currentList.push({
                    id: 'cm_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                    manufacturer: val('ab-cm-manufacturer') || null,
                    name: name,
                    category: val('ab-cm-category') || null,
                    serial: val('ab-cm-serial') || null,
                    year: val('ab-cm-year') || null,
                    notes: val('ab-cm-notes') || null,
                    created_at: new Date().toISOString()
                });
            }

            saveAddressCustomMachines(state.currentId, currentList);
            closeFormModal();
            renderDetail();
            toast(isEdit ? 'Manuelle Maschine gespeichert.' : 'Manuelle Maschine hinzugefügt.');
        });
    }

    function deleteCustomMachine(customId) {
        if (typeof window.canDelete === 'function' && !window.canDelete('Maschinen')) return;
        if (!confirm('Diese manuelle Maschine von der Adresse entfernen?')) return;
        const currentList = getAddressCustomMachines(state.currentId);
        const newList = currentList.filter(x => String(x.id) !== String(customId));
        saveAddressCustomMachines(state.currentId, newList);
        renderDetail();
        toast('Manuelle Maschine entfernt.');
    }

    // ==========================================
    // HISTORIE
    // ==========================================
    function openNoteForm() {
        const today = new Date().toISOString().slice(0, 10);
        const fields = `
        <div class="ab-form-grid">
            ${field('Art', 'ab-n-type', 'note', {
            type: 'select',
            options: ENTRY_TYPES.filter(t => t.value !== 'system').map(t => ({ value: t.value, label: t.label }))
        })}
            ${field('Datum', 'ab-n-date', today, { type: 'date' })}
            ${field('Betreff', 'ab-n-title', '', { wide: true, placeholder: 'z. B. Rückruf wegen Ersatzteil' })}
            ${field('Text', 'ab-n-body', '', { type: 'textarea', wide: true, rows: 5 })}
            <div style="grid-column: 1 / -1; display: flex; justify-content: flex-end; margin-top: -10px;">
                <button type="button" class="voice-mic-btn" data-target-id="ab-n-body" onclick="window.toggleVoiceDictation(this, event)" title="Spracheingabe starten (Diktieren)">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                        <line x1="12" y1="19" x2="12" y2="23"></line>
                        <line x1="8" y1="23" x2="16" y2="23"></line>
                    </svg>
                </button>
            </div>
        </div>`;

        openFormModal('Historien-Eintrag', fields, 'Eintrag speichern', async () => {
            const title = val('ab-n-title');
            const body = val('ab-n-body');
            if (!title && !body) { window.showToast('Bitte Betreff oder Text ausfüllen.'); return; }

            const { error } = await sb().from('customer_notes').insert([{
                customer_id: state.byId.get(state.currentId).id,
                entry_type: val('ab-n-type') || 'note',
                title: title || null,
                body: body || null,
                author: currentAuthor(),
                entry_date: val('ab-n-date') || null
            }]);
            if (error) throw error;

            closeFormModal();
            await refreshDetail();
            toast('Eintrag gespeichert.');
        });
    }

    async function addHistoryEntry(customerId, type, title, body, silent) {
        try {
            const address = state.byId.get(String(customerId));
            if (!address) return;
            const { error } = await sb().from('customer_notes').insert([{
                customer_id: address.id,
                entry_type: type || 'system',
                title: title || null,
                body: body || null,
                author: currentAuthor(),
                entry_date: new Date().toISOString().slice(0, 10)
            }]);
            if (error) throw error;
        } catch (err) {
            // Historie ist Beiwerk – niemals den eigentlichen Vorgang blockieren
            if (!silent) console.warn('Historien-Eintrag fehlgeschlagen', err);
        }
    }

    async function deleteNote(noteId) {
        if (typeof window.canDelete === 'function' && !window.canDelete('Historien-Einträgen')) return;
        if (!confirm('Historien-Eintrag löschen?')) return;
        try {
            const { error } = await sb().from('customer_notes').delete().eq('id', noteId);
            if (error) throw error;
            await refreshDetail();
        } catch (err) {
            window.showToast('Löschen fehlgeschlagen: ' + (err.message || err));
        }
    }

    async function refreshDetail() {
        if (!state.currentId) return;
        await loadDetailData(state.currentId);
        renderDetail();
    }
    // Für externe Module (ai-address-task.js, Vorgänge-Modul in index.html)
    window.refreshAddressbookDetail = refreshDetail;
    // Öffnet das Adress-Detail erneut, z. B. nachdem im Vorgangs-Modal
    // gespeichert wurde. tab = 'tasks' springt direkt auf die Vorgänge.
    window.openAddressbookDetail = (id, tab) => openDetail(String(id), tab);

    // ==========================================
    // EVENTS
    // ==========================================
    document.addEventListener('click', (e) => {
        const el = e.target.closest('[data-ab-action]');
        if (!el) return;

        const action = el.getAttribute('data-ab-action');
        const id = el.getAttribute('data-ab-id');

        switch (action) {
            case 'open':
                e.preventDefault();
                openDetail(id);
                break;
            case 'more':
                renderAddressList('append');
                break;
            case 'close-detail':
                closeModal('addressbook-detail-modal');
                break;
            case 'close-form':
                closeFormModal();
                break;
            case 'tab':
                state.detailTab = el.getAttribute('data-ab-tab');
                renderDetail();
                break;
            case 'new':
                openAddressForm(null);
                break;
            case 'edit':
                openAddressForm(id);
                break;
            case 'delete':
                deleteAddress(id);
                break;
            case 'contact-new':
                openContactForm(null);
                break;
            case 'contact-edit':
                openContactForm(id);
                break;
            case 'contact-delete':
                deleteContact(id);
                break;
            case 'link-new':
                openLinkForm();
                break;
            case 'link-type':
                e.preventDefault();
                openLinkTypeForm(id);
                break;
            case 'link-delete':
                deleteLink(id);
                break;
            case 'machine-link':
                openMachineLinkForm();
                break;
            case 'custom-machine-new':
                openCustomMachineForm(null);
                break;
            case 'custom-machine-edit':
                openCustomMachineForm(id);
                break;
            case 'custom-machine-delete':
                deleteCustomMachine(id);
                break;
            case 'machine-unlink':
                unlinkMachine(id);
                break;
            case 'machine-open':
                openMachine(id);
                break;
            case 'machine-history':
                e.preventDefault();
                if (typeof window.openHistoryModal === 'function') {
                    window.openHistoryModal(id);
                } else if (typeof toggleMachineHistory === 'function') {
                    toggleMachineHistory(id);
                }
                break;
            case 'plan-route':
                planRouteForAddress(id);
                break;
            case 'select-mode':
                setSelectMode(!state.selectMode);
                break;
            case 'toggle-select':
                e.preventDefault();
                toggleSelect(id);
                break;
            case 'selection-clear':
                state.selection = [];
                renderAddressList();
                renderSelectionBar();
                break;
            case 'selection-cancel':
                setSelectMode(false);
                break;
            case 'selection-done':
                finishSelection();
                break;
            case 'note-new':
                openNoteForm();
                break;
            case 'note-delete':
                deleteNote(id);
                break;
            case 'task-new':
                openAddressTaskForm();
                break;
            case 'task-ai': {
                const cur = state.byId.get(state.currentId);
                if (typeof window.openAddressTaskAiModal === 'function') {
                    window.openAddressTaskAiModal(state.currentId, cur ? cur.name : '', null);
                } else {
                    window.showToast('KI-Modul nicht geladen.');
                }
                break;
            }
            case 'open-task-main':
                // Vorgang im Vorgänge-Modul öffnen (internal_processes)
                closeModal('addressbook-detail-modal');
                if (typeof window.openEditProcessModal === 'function') {
                    window.openEditProcessModal(id);
                }
                break;
        }
    });

    // Karten auch per Tastatur öffnen (Barrierefreiheit)
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (document.getElementById('addressbook-form-modal')?.classList.contains('show')) {
                closeFormModal();
                return;
            }
            if (document.getElementById('addressbook-detail-modal')?.classList.contains('show')) {
                closeModal('addressbook-detail-modal');
                return;
            }
            if (state.selectMode) setSelectMode(false);
            return;
        }
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const card = e.target.closest && e.target.closest('.ab-card');
        if (!card) return;
        e.preventDefault();
        const cardId = card.getAttribute('data-ab-id');
        if (state.selectMode) toggleSelect(cardId);
        else openDetail(cardId);
    });

    document.addEventListener('DOMContentLoaded', () => {
        const search = document.getElementById('addressbook-search');
        if (search) {
            let t = null;
            search.addEventListener('input', () => {
                clearTimeout(t);
                t = setTimeout(() => {
                    state.search = search.value.trim();
                    renderAddressList();
                }, 180);
            });
        }

        // Einfachauswahl-Dropdowns (Adressart, Land, Sortierung) im Stil des
        // Adresstyp-Menüs. buildSingleFilter liefert eine render()-Funktion,
        // damit die Optionen später neu aufgebaut werden können (Länderliste).
        function buildSingleFilter(prefix, getOptions, getValue, setValue) {
            const trigger = document.getElementById(`ab-${prefix}-filter-trigger`);
            const menu = document.getElementById(`ab-${prefix}-filter-menu`);
            const list = document.getElementById(`ab-${prefix}-filter-options`);
            const label = document.getElementById(`ab-current-${prefix}-name`);
            if (!trigger || !menu || !list || !label) return () => { };

            function close() {
                menu.classList.remove('show');
                trigger.classList.remove('active');
            }

            function render() {
                const options = getOptions();
                const current = getValue();
                list.innerHTML = '';
                options.forEach(opt => {
                    const li = document.createElement('li');
                    li.setAttribute('data-id', opt.value);
                    const isSelected = opt.value === current;
                    if (isSelected) li.classList.add('selected');
                    li.innerHTML = `<span>${esc(opt.label)}</span>`
                        + (isSelected ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>' : '');
                    li.addEventListener('click', (e) => {
                        e.stopPropagation();
                        setValue(opt.value);
                        label.textContent = opt.label;
                        close();
                        render();
                        renderAddressList();
                    });
                    list.appendChild(li);
                });
                const active = options.find(o => o.value === current) || options[0];
                if (active) label.textContent = active.label;
            }

            trigger.addEventListener('click', (e) => {
                e.stopPropagation();
                document.querySelectorAll('.ab-toolbar .custom-filter-menu.show').forEach(m => {
                    if (m !== menu) {
                        m.classList.remove('show');
                        const t = m.closest('.custom-filter-dropdown');
                        if (t) t.classList.remove('active');
                    }
                });
                const isShowing = menu.classList.contains('show');
                menu.classList.toggle('show', !isShowing);
                trigger.classList.toggle('active', !isShowing);
            });

            document.addEventListener('click', (e) => {
                if (!trigger.contains(e.target)) close();
            });

            render();
            return render;
        }

        buildSingleFilter('kind', () => ([
            { value: 'all', label: 'Alle Adressen' },
            { value: 'customers', label: 'Nur Kunden' },
            { value: 'noncustomers', label: 'Ohne Kundennummer' },
            { value: 'withmachines', label: 'Mit Maschinen' }
        ]), () => state.typeFilter || 'all', v => { state.typeFilter = v; });

        renderCountryFilterOptions = buildSingleFilter('country', () => ([
            { value: 'all', label: 'Alle Länder' },
            ...[...new Set(state.addresses.map(a => (a.country || '').trim()).filter(Boolean))]
                .sort().map(c => ({ value: c, label: c }))
        ]), () => state.countryFilter || 'all', v => { state.countryFilter = v; });

        buildSingleFilter('sort', () => ([
            { value: 'name', label: 'Name A–Z' },
            { value: 'city', label: 'Ort A–Z' },
            { value: 'machines', label: 'Meiste Maschinen' },
            { value: 'customer_number', label: 'Kundennummer' }
        ]), () => state.sort || 'name', v => { state.sort = v; });

        // Global click listener to close filter dropdowns when clicking outside
        document.addEventListener('click', (e) => {
            const contactTrigger = document.getElementById('ab-contact-filter-trigger');
            const contactMenu = document.getElementById('ab-contact-filter-menu');
            if (contactTrigger && contactMenu && !contactTrigger.contains(e.target)) {
                contactMenu.classList.remove('show');
                contactTrigger.classList.remove('active');
            }

            const addressTypeTrigger = document.getElementById('ab-address-type-filter-trigger');
            const addressTypeMenu = document.getElementById('ab-address-type-filter-menu');
            if (addressTypeTrigger && addressTypeMenu && !addressTypeTrigger.contains(e.target)) {
                addressTypeMenu.classList.remove('show');
                addressTypeTrigger.classList.remove('active');
            }
        });

        // Initialize addressbook Kontakttyp dropdown
        const abContactTrigger = document.getElementById('ab-contact-filter-trigger');
        if (abContactTrigger) {
            abContactTrigger.addEventListener('click', (e) => {
                e.stopPropagation();
                // Close other dropdown
                const otherMenu = document.getElementById('ab-address-type-filter-menu');
                const otherTrigger = document.getElementById('ab-address-type-filter-trigger');
                if (otherMenu) otherMenu.classList.remove('show');
                if (otherTrigger) otherTrigger.classList.remove('active');

                const menu = document.getElementById('ab-contact-filter-menu');
                if (menu) {
                    const isShowing = menu.classList.contains('show');
                    menu.classList.toggle('show', !isShowing);
                    abContactTrigger.classList.toggle('active', !isShowing);
                }
            });
        }

        window.renderABContactFilterOptions = function () {
            const list = document.getElementById('ab-contact-filter-options');
            if (!list) return;
            list.innerHTML = '';

            // Option: Kontakttyp (Alle)
            const allLi = document.createElement('li');
            allLi.textContent = 'Kontakttyp';
            allLi.setAttribute('data-id', 'all');
            if (state.contactFilter.includes('all')) allLi.classList.add('selected');
            allLi.addEventListener('click', (e) => {
                e.stopPropagation();
                window.selectABContactFilter('all', 'Kontakttyp');
            });
            list.appendChild(allLi);

            const contactCats = (window.categoryList || []).filter(c => c.type === 'contact');
            contactCats.forEach(cat => {
                const li = document.createElement('li');
                li.setAttribute('data-id', cat.id);
                const isSelected = state.contactFilter.includes(cat.id.toString()) || state.contactFilter.includes(cat.id);
                if (isSelected) li.classList.add('selected');

                li.innerHTML = `
                    <span>${esc(cat.name)}</span>
                    ${isSelected ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>' : ''}
                `;

                li.addEventListener('click', (e) => {
                    e.stopPropagation();
                    window.selectABContactFilter(cat.id, cat.name);
                });
                list.appendChild(li);
            });
        };

        window.selectABContactFilter = function (id, name) {
            if (id === 'all') {
                state.contactFilter = ['all'];
            } else {
                state.contactFilter = state.contactFilter.filter(f => f !== 'all');
                const sId = id.toString();
                const idx = state.contactFilter.indexOf(sId);
                if (idx > -1) {
                    state.contactFilter.splice(idx, 1);
                } else {
                    state.contactFilter.push(sId);
                }
                if (state.contactFilter.length === 0) state.contactFilter = ['all'];
            }

            const label = document.getElementById('ab-current-contact-type-name');
            if (label) {
                if (state.contactFilter.includes('all')) {
                    label.textContent = 'Kontakttyp';
                } else if (state.contactFilter.length === 1) {
                    const firstCat = (window.categoryList || []).find(c => c.id.toString() === state.contactFilter[0].toString());
                    label.textContent = firstCat ? firstCat.name : name;
                } else {
                    const firstCat = (window.categoryList || []).find(c => c.id.toString() === state.contactFilter[0].toString());
                    const firstName = firstCat ? firstCat.name : 'Mehrere';
                    label.textContent = `${firstName} +${state.contactFilter.length - 1}`;
                }
            }

            window.renderABContactFilterOptions();
            renderAddressList();

            if (id === 'all') {
                const menu = document.getElementById('ab-contact-filter-menu');
                const trigger = document.getElementById('ab-contact-filter-trigger');
                if (menu) menu.classList.remove('show');
                if (trigger) trigger.classList.remove('active');
            }
        };

        // Initialize addressbook Adresstyp dropdown
        const abAddressTypeTrigger = document.getElementById('ab-address-type-filter-trigger');
        if (abAddressTypeTrigger) {
            abAddressTypeTrigger.addEventListener('click', (e) => {
                e.stopPropagation();
                // Close other dropdown
                const otherMenu = document.getElementById('ab-contact-filter-menu');
                const otherTrigger = document.getElementById('ab-contact-filter-trigger');
                if (otherMenu) otherMenu.classList.remove('show');
                if (otherTrigger) otherTrigger.classList.remove('active');

                const menu = document.getElementById('ab-address-type-filter-menu');
                if (menu) {
                    const isShowing = menu.classList.contains('show');
                    menu.classList.toggle('show', !isShowing);
                    abAddressTypeTrigger.classList.toggle('active', !isShowing);
                }
            });
        }

        window.renderABAddressTypeFilterOptions = function () {
            const list = document.getElementById('ab-address-type-filter-options');
            if (!list) return;
            list.innerHTML = '';

            // Option: Adresstyp (Alle)
            const allLi = document.createElement('li');
            allLi.textContent = 'Adresstyp';
            allLi.setAttribute('data-id', 'all');
            if (state.addressTypeFilter.includes('all')) allLi.classList.add('selected');
            allLi.addEventListener('click', (e) => {
                e.stopPropagation();
                window.selectABAddressTypeFilter('all', 'Adresstyp');
            });
            list.appendChild(allLi);

            const addressTypeCats = (window.categoryList || []).filter(c => c.type === 'address_type');
            addressTypeCats.forEach(cat => {
                const li = document.createElement('li');
                li.setAttribute('data-id', cat.id);
                const isSelected = state.addressTypeFilter.includes(cat.id.toString()) || state.addressTypeFilter.includes(cat.id);
                if (isSelected) li.classList.add('selected');

                li.innerHTML = `
                    <span>${esc(cat.name)}</span>
                    ${isSelected ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>' : ''}
                `;

                li.addEventListener('click', (e) => {
                    e.stopPropagation();
                    window.selectABAddressTypeFilter(cat.id, cat.name);
                });
                list.appendChild(li);
            });
        };

        window.selectABAddressTypeFilter = function (id, name) {
            if (id === 'all') {
                state.addressTypeFilter = ['all'];
            } else {
                state.addressTypeFilter = state.addressTypeFilter.filter(f => f !== 'all');
                const sId = id.toString();
                const idx = state.addressTypeFilter.indexOf(sId);
                if (idx > -1) {
                    state.addressTypeFilter.splice(idx, 1);
                } else {
                    state.addressTypeFilter.push(sId);
                }
                if (state.addressTypeFilter.length === 0) state.addressTypeFilter = ['all'];
            }

            const label = document.getElementById('ab-current-address-type-name');
            if (label) {
                if (state.addressTypeFilter.includes('all')) {
                    label.textContent = 'Adresstyp';
                } else if (state.addressTypeFilter.length === 1) {
                    const firstCat = (window.categoryList || []).find(c => c.id.toString() === state.addressTypeFilter[0].toString() || c.name === name);
                    label.textContent = firstCat ? firstCat.name : name;
                } else {
                    const firstCat = (window.categoryList || []).find(c => c.id.toString() === state.addressTypeFilter[0].toString());
                    const firstName = firstCat ? firstCat.name : 'Mehrere';
                    label.textContent = `${firstName} +${state.addressTypeFilter.length - 1}`;
                }
            }

            window.renderABAddressTypeFilterOptions();
            renderAddressList();

            if (id === 'all') {
                const menu = document.getElementById('ab-address-type-filter-menu');
                const trigger = document.getElementById('ab-address-type-filter-trigger');
                if (menu) menu.classList.remove('show');
                if (trigger) trigger.classList.remove('active');
            }
        };

        // Add window methods for inline address_type editing
        window.toggleInlineTypeMenu = function (id, event) {
            if (event) event.stopPropagation();
            // Close all other inline menus first
            document.querySelectorAll('.inline-ab-type-dropdown .custom-filter-menu').forEach(menu => {
                if (menu.id !== `inline-type-menu-${id}`) {
                    menu.classList.remove('show');
                }
            });
            const menu = document.getElementById(`inline-type-menu-${id}`);
            if (menu) {
                menu.classList.toggle('show');
            }
        };

        window.toggleInlineAddressType = async function (addressId, typeName, event) {
            if (event) event.stopPropagation();
            const a = state.byId.get(String(addressId));
            if (!a) return;

            let types = a.address_type ? a.address_type.split(',').map(s => s.trim()).filter(Boolean) : [];
            const idx = types.indexOf(typeName);
            if (idx > -1) {
                types.splice(idx, 1);
            } else {
                types.push(typeName);
            }

            const updatedString = types.join(', ');
            
            try {
                // Update Supabase
                const { error } = await sb().from('customers').update({ address_type: updatedString || null }).eq('id', a.id);
                if (error) throw error;
                
                // Update local state
                a.address_type = updatedString || null;
                state.byId.set(String(a.id), a);
                
                // Update in the address array as well
                const addrInList = state.addresses.find(x => String(x.id) === String(a.id));
                if (addrInList) addrInList.address_type = updatedString || null;

                // Re-render overview list
                renderAddressList();
                
                // If we are editing the currently open detail address, refresh the overview panel UI instantly
                if (String(a.id) === state.currentId) {
                    renderDetail();
                }
                
                // Keep the menu open so they can add/remove multiple types easily (if trigger menu exists)
                setTimeout(() => {
                    const menu = document.getElementById(`inline-type-menu-${addressId}`);
                    if (menu) menu.classList.add('show');
                }, 50);

            } catch (err) {
                window.showToast('Fehler beim Aktualisieren des Adresstyps: ' + err.message);
            }
        };

        // Hersteller-Pills in der Übersicht direkt umschalten (analog zum Adresstyp)
        window.toggleInlineManufacturer = async function (addressId, manufacturerName, event) {
            if (event) event.stopPropagation();
            const a = state.byId.get(String(addressId));
            if (!a) return;

            let names = a.manufacturer ? a.manufacturer.split(',').map(s => s.trim()).filter(Boolean) : [];
            const idx = names.indexOf(manufacturerName);
            if (idx > -1) {
                names.splice(idx, 1);
            } else {
                names.push(manufacturerName);
            }

            const updatedString = names.join(', ');

            try {
                const { error } = await sb().from('customers').update({ manufacturer: updatedString || null }).eq('id', a.id);
                if (error) throw error;

                a.manufacturer = updatedString || null;
                state.byId.set(String(a.id), a);

                const addrInList = state.addresses.find(x => String(x.id) === String(a.id));
                if (addrInList) addrInList.manufacturer = updatedString || null;

                renderAddressList();
                if (String(a.id) === state.currentId) renderDetail();
            } catch (err) {
                window.showToast('Fehler beim Aktualisieren des Herstellers: ' + err.message);
            }
        };

        // Close inline type menus on click outside
        document.addEventListener('click', () => {
            document.querySelectorAll('.inline-ab-type-dropdown .custom-filter-menu').forEach(menu => {
                menu.classList.remove('show');
            });
        });

        window.renderABAddressTypeFilterOptions();

        // Also update options immediately when addressbook opens or categories update
        if (typeof window.renderABAddressTypeFilterOptions === 'function') {
            window.renderABAddressTypeFilterOptions();
        }
    });

    console.log('Addressbook module loaded.');
})();
