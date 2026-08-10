// =========================================================
// ROUTENPLANUNG (eigene Seite)
// Karte mit Firmenstandort als Tourstart, Suche nach Kunden/Maschinen,
// Umkreissuche, Reihenfolge per Drag & Drop oder Auto-Optimierung,
// Speichern/Laden von Touren und Export nach Google/Apple Maps.
//
// Verzahnt mit dem Adressbuch:
//   - Ansprechpartner (customer_contacts) direkt am Stopp inkl. Telefon
//   - verknüpfte Adressen (customer_links) als Zusatzstopp-Vorschlag
//   - Sprung in die Adress-Detailansicht
//   - Besuch als Historien-Eintrag (customer_notes) festhalten
//
// Geocodierung: OpenStreetMap Nominatim (kostenlos, 1 Anfrage/Sek.),
// Koordinaten werden in customers.lat/lng gecacht
// (supabase_add_customer_coords.sql).
// Gespeicherte Routen: supabase_add_saved_routes.sql (optional – ohne die
// Tabelle wird automatisch auf localStorage ausgewichen).
// =========================================================
(function () {
    'use strict';

    const NOMINATIM_DELAY_MS = 1150;
    const GMAPS_LEG_SIZE = 9; // Google Maps: max. 9 Wegpunkte + Ziel pro Route-Link
    const LS_ROUTES_KEY = 'meetra_saved_routes';

    let map = null;
    let markersLayer = null;
    let routeLine = null;
    let routeRequestSeq = 0;
    let hqInfo = null; // { name, address, lat, lng }
    let customerCoordsPersistable = true;

    let stops = []; // { id, kind:'customer', customerId, label, address, lat, lng, isCustomer }
    let nearbyCandidates = []; // Kunden im Umkreis, noch nicht in stops
    let linkedSuggestions = []; // über customer_links verknüpfte Adressen zu Stopps
    let contactsByCustomer = new Map(); // customerId -> [contact]
    let machineCountByCustomer = new Map();
    let routeMetrics = { km: null, min: null, estimated: false };
    let routeGeometry = null;   // vereinfachte Streckenpunkte [[lat,lng], …] für die Korridorsuche
    let searchTimeout = null;
    let lastGeocodeAt = 0;
    let savedRoutesTableOk = true;

    // Filter für die Umkreis-/Korridorsuche
    let nearbyOnlyCustomers = false;
    let nearbyOnlyWithMachines = false;
    let nearbyAddressTypes = new Set(); // gewählte Adresstypen (leer = alle)
    let nearbyRawRecords = [];  // letzte Trefferbasis, damit Filter ohne neue Abfrage wirken
    let nearbyBase = null;
    let nearbyRadius = 50;
    let machineCountAll = new Map(); // customerId -> Anzahl Maschinen (alle Kunden)
    let linkedCountAll = new Map();  // customerId -> Anzahl verknüpfte Adressen
    let nearbyManufacturer = '';     // gewählter Hersteller ('' = alle)
    let manufacturersByCustomer = new Map(); // customerId -> Set(Hersteller, kleingeschrieben)
    let manufacturerNames = new Map();       // kleingeschrieben -> Originalschreibweise

    // ---------------------------------------------------------------
    // Helfer
    // ---------------------------------------------------------------
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    function sb() {
        if (!window.supabaseClient) throw new Error('Supabase Client nicht initialisiert');
        return window.supabaseClient;
    }

    function customerAddress(c) {
        if (!c.street && !c.city) return null;
        return [c.street, [c.zip_code, c.city].filter(Boolean).join(' '), c.country || 'Deutschland'].filter(Boolean).join(', ');
    }
    function customerAddressParts(c) {
        if (!c.street && !c.city) return null;
        return { street: c.street, zip: c.zip_code, city: c.city, country: c.country || 'Deutschland' };
    }
    // Bewusst OHNE Matchcode: der enthält in den Sage-Daten meist nochmal
    // Firmenname + Ort und würde die Beschriftung nur verdoppeln.
    function customerLabel(c) {
        return c.name || 'Unbekannt';
    }
    function machineTitle(m) {
        return [m.manufacturer, m.name].filter(Boolean).join(' ') || 'Unbekannte Maschine';
    }
    function isCustomerRecord(c) {
        if (!c) return false;
        if (c.is_customer === true) return true;
        return !!(c.customer_number && String(c.customer_number).trim() !== '');
    }

    function initials(name) {
        if (!name) return '?';
        const parts = String(name).trim().split(/[\s\-\/]+/).filter(Boolean);
        if (!parts.length) return '?';
        if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
        return (parts[0][0] + parts[1][0]).toUpperCase();
    }

    function avatarHue(name) {
        let hash = 0;
        const s = String(name || '');
        for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) % 360;
        return hash;
    }

    function fmtKm(km) {
        if (typeof km !== 'number' || !isFinite(km)) return '–';
        return km.toFixed(1).replace('.', ',') + ' km';
    }

    function fmtMin(min) {
        if (typeof min !== 'number' || !isFinite(min)) return '–';
        const h = Math.floor(min / 60);
        const m = Math.round(min % 60);
        return h > 0 ? `${h} Std ${m} Min` : `${m} Min`;
    }

    function currentAuthor() {
        return (window.activeUser && window.activeUser.name)
            || (window.currentUser && window.currentUser.name)
            || null;
    }

    function haversineKm(lat1, lng1, lat2, lng2) {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    // Kürzester Abstand eines Punktes zu einer Strecke (Segment) in km.
    // Lokale Ebenen-Projektion (equirectangular) um den Punkt herum — bei den hier
    // relevanten Entfernungen (< einige hundert km) genau genug und deutlich
    // schneller als eine exakte Kugelrechnung pro Segment.
    function pointToSegmentKm(lat, lng, aLat, aLng, bLat, bLng) {
        const latRef = (lat + aLat + bLat) / 3;
        const kx = 111.32 * Math.cos(latRef * Math.PI / 180);
        const ky = 110.57;
        const px = lng * kx, py = lat * ky;
        const ax = aLng * kx, ay = aLat * ky;
        const bx = bLng * kx, by = bLat * ky;

        const dx = bx - ax, dy = by - ay;
        const lenSq = dx * dx + dy * dy;
        let t = lenSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));
        const cx = ax + t * dx, cy = ay + t * dy;
        return Math.hypot(px - cx, py - cy);
    }

    // Kürzester Abstand zur gesamten Streckenlinie (Korridorsuche).
    function distanceToRouteKm(lat, lng) {
        if (!routeGeometry || routeGeometry.length < 2) return null;
        let min = Infinity;
        for (let i = 1; i < routeGeometry.length; i++) {
            const d = pointToSegmentKm(lat, lng, routeGeometry[i - 1][0], routeGeometry[i - 1][1], routeGeometry[i][0], routeGeometry[i][1]);
            if (d < min) min = d;
            if (min === 0) break;
        }
        return min;
    }

    // OSRM liefert bei "overview=full" mehrere tausend Punkte. Für die Korridorsuche
    // reicht eine gleichmäßige Ausdünnung — sonst kostet jede Suche unnötig Rechenzeit
    // (Kundenanzahl × Segmentanzahl Abstandsberechnungen).
    function simplifyGeometry(latlngs, maxPoints) {
        const limit = maxPoints || 500;
        if (latlngs.length <= limit) return latlngs;
        const step = latlngs.length / limit;
        const out = [];
        for (let i = 0; i < limit; i++) out.push(latlngs[Math.floor(i * step)]);
        out.push(latlngs[latlngs.length - 1]);
        return out;
    }

    const icon = {
        pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>',
        phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>',
        user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
        machine: '<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"><rect x="38" y="30" width="28" height="22" rx="3"/><line x1="62" y1="34" x2="88" y2="18"/><line x1="88" y1="18" x2="92" y2="46"/><rect x="20" y="54" width="58" height="14" rx="4"/><rect x="14" y="63" width="70" height="10" rx="5"/><circle cx="22" cy="68" r="7"/><circle cx="76" cy="68" r="7"/></svg>',
        grip: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>',
        close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
        plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
        up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>',
        down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>',
        bolt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
        save: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>',
        folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
        trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
        note: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
        book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 3H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1z"/><line x1="3" y1="8" x2="6" y2="8"/><line x1="3" y1="12" x2="6" y2="12"/><line x1="3" y1="16" x2="6" y2="16"/></svg>',
        home: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>',
        maps: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="1 6 8 3 16 6 23 3 23 18 16 21 8 18 1 21 1 6"/><line x1="8" y1="3" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="21"/></svg>'
    };

    function ic(name, size) {
        const svg = icon[name] || '';
        if (!svg) return '';
        const s = size || 15;
        return svg.replace('<svg ', `<svg width="${s}" height="${s}" `);
    }

    // ---------------------------------------------------------------
    // Geocoding
    // ---------------------------------------------------------------
    function splitStreetHouseNumber(street) {
        if (!street) return { streetName: null };
        const m = String(street).trim().match(/^(.*?)[\s,]+(\d+[a-zA-Z]?)\s*$/);
        return m ? { streetName: m[1].trim() } : { streetName: String(street).trim() };
    }

    const GEOCACHE_KEY = 'meetra_geocache_v1';
    let geoCache = null;
    function loadGeoCache() {
        if (geoCache) return geoCache;
        try { geoCache = JSON.parse(localStorage.getItem(GEOCACHE_KEY) || '{}'); }
        catch (e) { geoCache = {}; }
        return geoCache;
    }
    function saveGeoCache() {
        try { localStorage.setItem(GEOCACHE_KEY, JSON.stringify(geoCache || {})); } catch (e) { }
    }
    function cacheKey(parts) {
        return [parts.street || '', parts.zip || '', parts.city || '', parts.country || 'Deutschland']
            .join('|').toLowerCase().replace(/\s+/g, ' ').trim();
    }

    // Photon (Komoot): OSM-basiert, deutlich schneller und toleranter als Nominatim,
    // kein striktes 1/Sek.-Limit. Wir nutzen ihn als primären Geocoder.
    async function geocodePhoton(query, opts) {
        try {
            const qs = new URLSearchParams({ q: query, limit: '1', lang: 'de' });
            const res = await fetch(`https://photon.komoot.io/api/?${qs.toString()}`);
            if (!res.ok) return null;
            const data = await res.json();
            const f = data && data.features && data.features[0];
            if (!f || !f.geometry || !f.geometry.coordinates) return null;
            const [lng, lat] = f.geometry.coordinates;
            if (typeof lat !== 'number' || typeof lng !== 'number') return null;
            // Wenn PLZ gefordert war, prüfen ob sie auch getroffen wurde — sonst als
            // ungenau markieren, damit wir noch eine Runde probieren.
            const props = f.properties || {};
            let precision = opts && opts.precision ? opts.precision : (props.housenumber ? 'exact' : (props.street ? 'street' : 'city'));
            return { lat, lng, precision };
        } catch (e) {
            console.warn('Photon-Anfrage fehlgeschlagen:', query, e);
            return null;
        }
    }

    async function geocodeNominatim(params) {
        // Nominatim-Limit: max. 1 Anfrage/Sek. — global drosseln.
        const wait = NOMINATIM_DELAY_MS - (Date.now() - lastGeocodeAt);
        if (wait > 0) await new Promise(r => setTimeout(r, wait));
        lastGeocodeAt = Date.now();
        try {
            const qs = new URLSearchParams({ format: 'json', limit: '1', 'accept-language': 'de', ...params });
            const res = await fetch(`https://nominatim.openstreetmap.org/search?${qs.toString()}`);
            if (!res.ok) return null;
            const data = await res.json();
            if (data && data.length > 0) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
        } catch (e) {
            console.warn('Nominatim-Anfrage fehlgeschlagen:', params, e);
        }
        return null;
    }

    // Stufenweise vergröbern und über zwei Geocoder versuchen.
    async function geocode(parts) {
        if (!parts) return null;
        const { street, zip, city, country } = parts;
        const cache = loadGeoCache();
        const key = cacheKey(parts);
        if (cache[key]) return { ...cache[key] };

        const setCache = (val) => { if (val) { cache[key] = val; saveGeoCache(); } return val; };

        const cityCountry = [zip, city, country || 'Deutschland'].filter(Boolean).join(' ');

        // 1) Photon: volle Adresse
        if (street) {
            const full = [street, cityCountry].filter(Boolean).join(', ');
            const p = await geocodePhoton(full, { precision: 'exact' });
            if (p) return setCache(p);

            // ohne Hausnummer
            const { streetName } = splitStreetHouseNumber(street);
            if (streetName && streetName !== street) {
                const p2 = await geocodePhoton([streetName, cityCountry].filter(Boolean).join(', '), { precision: 'street' });
                if (p2) return setCache(p2);
            }
        }

        // 2) Nominatim mit strukturierter Anfrage (Fallback)
        const nomBase = { city: city || '', postalcode: zip || '', country: country || '' };
        if (street) {
            const exact = await geocodeNominatim({ ...nomBase, street });
            if (exact) return setCache({ ...exact, precision: 'exact' });

            const { streetName } = splitStreetHouseNumber(street);
            if (streetName && streetName !== street) {
                const noNumber = await geocodeNominatim({ ...nomBase, street: streetName });
                if (noNumber) return setCache({ ...noNumber, precision: 'street' });
            }
        }

        // 3) Nur PLZ + Ort
        if (city || zip) {
            const pCity = await geocodePhoton(cityCountry, { precision: 'city' });
            if (pCity) return setCache(pCity);
            const approx = await geocodeNominatim(nomBase);
            if (approx) return setCache({ ...approx, precision: 'city' });
        }

        return null;
    }

    async function getHqInfo() {
        if (hqInfo) return hqInfo;
        let hq = null;
        try { hq = JSON.parse(localStorage.getItem('meetra_company_hq') || 'null'); } catch (e) { }
        const street = hq?.street || 'Am Alten Bahnhof 6';
        const zip = hq?.zip || '38122';
        const city = hq?.city || 'Braunschweig';
        const country = hq?.country || 'Deutschland';
        const name = hq?.name || 'Meetra GmbH';
        const address = [street, [zip, city].filter(Boolean).join(' '), country].filter(Boolean).join(', ');

        let cached = null;
        try { cached = JSON.parse(localStorage.getItem('meetra_hq_coords') || 'null'); } catch (e) { }
        if (cached && cached.address === address && typeof cached.lat === 'number') {
            hqInfo = { name, address, lat: cached.lat, lng: cached.lng };
            return hqInfo;
        }

        const coords = await geocode({ street, zip, city, country });
        if (coords) {
            hqInfo = { name, address, lat: coords.lat, lng: coords.lng };
            localStorage.setItem('meetra_hq_coords', JSON.stringify({ address, lat: coords.lat, lng: coords.lng }));
        } else {
            hqInfo = { name, address, lat: null, lng: null };
        }
        return hqInfo;
    }

    async function resolveCoords(record) {
        const address = customerAddress(record);
        if (!address) return null;

        if (typeof record.lat === 'number' && typeof record.lng === 'number' && record.geocoded_address === address) {
            return { lat: record.lat, lng: record.lng, address };
        }

        const coords = await geocode(customerAddressParts(record));
        if (!coords) return null;

        record.lat = coords.lat;
        record.lng = coords.lng;
        record.geocoded_address = address;

        if (customerCoordsPersistable && window.supabaseClient) {
            const { error } = await sb()
                .from('customers')
                .update({ lat: coords.lat, lng: coords.lng, geocoded_address: address })
                .eq('id', record.id);
            if (error) {
                console.warn('Koordinaten für customers konnten nicht gespeichert werden (Migration schon ausgeführt?):', error.message);
                customerCoordsPersistable = false;
            }
        }
        if (coords.precision === 'city') {
            console.warn(`Adresse "${address}" konnte nicht exakt geortet werden (nur PLZ/Ort).`);
        }
        return { lat: coords.lat, lng: coords.lng, address };
    }

    function stopIdFor(kind, id) { return `${kind}-${id}`; }

    // ---------------------------------------------------------------
    // Karte
    // ---------------------------------------------------------------
    async function ensureMap() {
        const container = document.getElementById('rp2-map');
        if (!container) return;
        if (map) {
            setTimeout(() => map.invalidateSize(), 50);
            return;
        }
        try {
            await window.loadLeaflet();
        } catch (e) {
            container.innerHTML = '<p style="color:#fff; padding:16px;">Karte konnte nicht geladen werden (Verbindungsfehler).</p>';
            return;
        }
        await new Promise(r => setTimeout(r, 150));
        if (map) return;
        map = L.map('rp2-map').setView([51.1657, 10.4515], 6);
        // Deutschsprachige Kacheln + Ansichtswechsel Karte/Luftbild/Gelände (siehe customers.js)
        window.addGermanBaseLayers(map, 'routenplanung');
        L.control.scale({ metric: true, imperial: false }).addTo(map);
        markersLayer = L.layerGroup().addTo(map);
        setTimeout(() => map.invalidateSize(), 200);
    }

    function glowIcon(color, content) {
        return L.divIcon({
            className: 'rp2-marker-wrap',
            html: `<div class="rp2-marker" style="--rp2-color:${color};">${content != null ? `<span>${esc(String(content))}</span>` : ''}</div>`,
            iconSize: [26, 26],
            iconAnchor: [13, 13]
        });
    }

    // Popup-Inhalt einer Adresse: Maschinen und verknüpfte Adressen stehen
    // direkt darunter — früher lagen beide hinter einem Knopf, wodurch die
    // manuell angelegten Maschinen auf der Karte praktisch unsichtbar waren.
    // Gefüllt wird beim Öffnen des Popups (siehe bindAddressPopup).
    function machinesButtonHtml(point) {
        if (!point.customerId) return '';
        const key = String(point.customerId);
        const hasLinked = (linkedCountAll.get(key) || 0) > 0;
        let html = `<div class="rp2-popup-section-title">Maschinen</div>` +
            `<div id="rp2-mach-${point.id}" class="rp2-popup-machines"></div>`;
        if (hasLinked) {
            html += `<div class="rp2-popup-section-title">Verknüpfte Adressen &amp; deren Maschinen</div>` +
                `<div id="rp2-linked-${point.id}" class="rp2-popup-machines"></div>`;
        }
        return html;
    }

    // Popup an einen Marker hängen und beim Öffnen beide Listen nachladen.
    function bindAddressPopup(marker, point, html) {
        marker.bindPopup(html);
        if (!point.customerId) return marker;
        marker.on('popupopen', () => {
            window.rp2ShowMachines(point.customerId, `rp2-mach-${point.id}`);
            if ((linkedCountAll.get(String(point.customerId)) || 0) > 0) {
                window.rp2ShowLinked(point.customerId, `rp2-linked-${point.id}`);
            }
        });
        return marker;
    }

    // Zeigt im Karten-Popup die verknüpften Adressen einer Adresse UND je
    // verknüpfter Adresse deren Maschinen — damit erkennbar ist, an welchem
    // Standort eine Maschine tatsächlich steht.
    window.rp2ShowLinked = async function (customerId, containerId) {
        const el = document.getElementById(containerId);
        if (!el) return;
        el.innerHTML = '<div class="rp2-hint">Verknüpfungen werden geladen…</div>';
        try {
            const { data: links, error } = await sb()
                .from('customer_links')
                .select('id, customer_id, linked_customer_id, link_type')
                .or(`customer_id.eq.${customerId},linked_customer_id.eq.${customerId}`);
            if (error) throw error;

            const otherIds = [...new Set((links || []).map(l =>
                String(l.customer_id) === String(customerId) ? l.linked_customer_id : l.customer_id
            ))];

            if (!otherIds.length) {
                el.innerHTML = '<div class="rp2-hint">Keine verknüpften Adressen hinterlegt.</div>';
                return;
            }

            const [{ data: others, error: cErr }, machRes] = await Promise.all([
                sb().from('customers').select('id, name, street, zip_code, city, customer_number').in('id', otherIds),
                sb().from('machines').select('id, name, manufacturer, serial, year, customer_id').in('customer_id', otherIds)
            ]);
            if (cErr) throw cErr;
            if (machRes.error) console.warn('Maschinen verknüpfter Adressen nicht ladbar:', machRes.error.message);

            const machinesBy = new Map();
            (machRes.data || []).forEach(m => {
                const k = String(m.customer_id);
                if (!machinesBy.has(k)) machinesBy.set(k, []);
                machinesBy.get(k).push(m);
            });

            const typeOf = (otherId) => {
                const l = (links || []).find(x =>
                    String(x.customer_id) === String(otherId) || String(x.linked_customer_id) === String(otherId));
                return l ? (LINK_TYPE_LABEL[l.link_type] || 'Verknüpft') : 'Verknüpft';
            };

            el.innerHTML = (others || []).map(o => {
                // Manuell angelegte Maschinen (localStorage, siehe Adressbuch)
                // gehören genauso dazu wie die aus dem Maschinenpark.
                let custom = [];
                try {
                    const raw = localStorage.getItem('ab_custom_machines_' + o.id);
                    custom = raw ? JSON.parse(raw) : [];
                } catch (e) { }
                const ms = [
                    ...custom.map(c => ({ ...c, isCustom: true })),
                    ...(machinesBy.get(String(o.id)) || [])
                ];
                const machineHtml = ms.length
                    ? ms.map(m => `<div class="rp2-popup-machine-sub">${m.isCustom ? '<span class="rp2-tag-manual">(Manuell)</span> ' : ''}${esc(machineTitle(m))}${m.serial ? ' · SN ' + esc(m.serial) : ''}</div>`).join('')
                    : '<div class="rp2-popup-machine-sub rp2-muted">keine Maschinen</div>';
                return `<div class="rp2-popup-machine">
                    <strong>${esc(o.name)}</strong>
                    <div class="rp2-popup-linktype">${esc(typeOf(o.id))}${o.city ? ' · ' + esc([o.zip_code, o.city].filter(Boolean).join(' ')) : ''}</div>
                    ${machineHtml}
                </div>`;
            }).join('');
        } catch (err) {
            console.error('Verknüpfte Adressen konnten nicht geladen werden:', err);
            el.innerHTML = '<div class="rp2-hint" style="color:#f87171;">Verknüpfungen nicht verfügbar.</div>';
        }
    };

    function renderMarkers() {
        if (!map || !markersLayer) return;
        markersLayer.clearLayers();

        if (hqInfo && typeof hqInfo.lat === 'number') {
            L.marker([hqInfo.lat, hqInfo.lng], { icon: glowIcon('#38bdf8', 'S') })
                .addTo(markersLayer)
                .bindPopup(`<div class="rp2-popup-title">${esc(hqInfo.name)}</div><div class="rp2-popup-address">${esc(hqInfo.address)}</div><span class="rp2-badge">Start</span>`);
        }

        stops.forEach((s, i) => {
            if (typeof s.lat !== 'number') return;
            const marker = L.marker([s.lat, s.lng], { icon: glowIcon('#10b981', i + 1) })
                .addTo(markersLayer);
            bindAddressPopup(marker, s,
                `<div class="rp2-popup-title">${esc(s.label)}</div>` +
                `<div class="rp2-popup-address">${esc(s.address)}</div>` +
                `<button class="rp2-btn rp2-btn-sm rp2-popup-btn" onclick="window.rp2RemoveStop('${s.id}')">Aus Route entfernen</button>` +
                machinesButtonHtml(s)
            );
        });

        nearbyCandidates.forEach(c => {
            if (typeof c.lat !== 'number') return;
            const color = firstAddressTypeColor(c.addressType) || '#f59e0b';
            const marker = L.marker([c.lat, c.lng], { icon: glowIcon(color) })
                .addTo(markersLayer);
            bindAddressPopup(marker, c,
                `<div class="rp2-popup-title">${esc(c.label)}</div>` +
                `<div class="rp2-popup-address">${esc(c.address)}</div>` +
                `<div class="rp2-distance">${c.distanceKm.toFixed(1).replace('.', ',')} km entfernt</div>` +
                `<button class="rp2-btn rp2-btn-sm rp2-btn-primary rp2-popup-btn" onclick="window.rp2AddCandidate('${c.id}')">Zur Route hinzufügen</button>` +
                machinesButtonHtml(c)
            );
        });
    }

    window.rp2ShowMachines = async function (customerId, containerId) {
        const el = document.getElementById(containerId);
        if (!el) return;
        el.innerHTML = '<div class="rp2-hint">Maschinen werden geladen…</div>';
        try {
            let customList = [];
            try {
                const raw = localStorage.getItem('ab_custom_machines_' + customerId);
                customList = raw ? JSON.parse(raw) : [];
            } catch (e) { }

            const { data, error } = await sb()
                .from('machines')
                .select('id, name, manufacturer, serial, year')
                .eq('customer_id', customerId)
                .order('manufacturer', { ascending: true });
            if (error) throw error;

            const allMach = [
                ...customList.map(c => ({ ...c, isCustom: true })),
                ...(data || [])
            ];

            if (allMach.length === 0) {
                el.innerHTML = '<div class="rp2-hint">Keine Maschinen bei dieser Adresse hinterlegt.</div>';
                return;
            }

            el.innerHTML = allMach.map(m => {
                const title = [m.manufacturer, m.name].filter(Boolean).join(' ') || 'Maschine';
                const details = [m.serial ? 'SN ' + m.serial : '', m.year || ''].filter(Boolean).join(' · ');
                const tag = m.isCustom ? '<span class="rp2-tag-manual">(Manuell)</span> ' : '';
                return `<div class="rp2-popup-machine">${tag}<strong>${esc(title)}</strong>${details ? `<br><span style="color:rgba(255,255,255,0.6);">${esc(details)}</span>` : ''}</div>`;
            }).join('');
        } catch (err) {
            console.error('Maschinen konnten nicht geladen werden:', err);
            el.innerHTML = '<div class="rp2-hint" style="color:#f87171;">Fehler beim Laden der Maschinen.</div>';
        }
    };

    // ---------------------------------------------------------------
    // Routenlinie (echte Straßenroute via OSRM, Luftlinie als Fallback)
    // ---------------------------------------------------------------
    async function updateRouteLine() {
        const seq = ++routeRequestSeq;
        const points = [];
        if (hqInfo && typeof hqInfo.lat === 'number') points.push(hqInfo);
        stops.forEach(s => { if (typeof s.lat === 'number' && typeof s.lng === 'number') points.push(s); });

        if (routeLine) {
            map && map.removeLayer(routeLine);
            routeLine = null;
        }

        if (points.length < 2) {
            routeMetrics = { km: null, min: null, estimated: false };
            routeGeometry = null;
            renderRouteSummary();
            renderNearbyHeader();
            return;
        }

        const drawStraightFallback = () => {
            if (seq !== routeRequestSeq || !map) return;
            const straight = points.map(p => [p.lat, p.lng]);
            routeLine = L.polyline(straight, { color: '#38bdf8', weight: 3, opacity: 0.6, dashArray: '6, 8' }).addTo(map);
            let km = 0;
            for (let i = 1; i < points.length; i++) km += haversineKm(points[i - 1].lat, points[i - 1].lng, points[i].lat, points[i].lng);
            routeMetrics = { km, min: null, estimated: true };
            // Auch ohne Straßendaten entlang der Luftlinie suchen können.
            routeGeometry = straight;
            renderRouteSummary();
            renderNearbyHeader();
        };

        try {
            const coordsParam = points.map(p => `${p.lng},${p.lat}`).join(';');
            const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${coordsParam}?overview=full&geometries=geojson`);
            if (seq !== routeRequestSeq) return;
            if (!res.ok) { drawStraightFallback(); return; }
            const data = await res.json();
            if (seq !== routeRequestSeq) return;

            const route = data && data.routes && data.routes[0];
            if (!route || !route.geometry || !route.geometry.coordinates) { drawStraightFallback(); return; }

            const latlngs = route.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
            if (!map) return;
            routeLine = L.polyline(latlngs, { color: '#38bdf8', weight: 4, opacity: 0.85 }).addTo(map);
            routeLine.bringToBack();

            routeMetrics = { km: route.distance / 1000, min: route.duration / 60, estimated: false };
            routeGeometry = simplifyGeometry(latlngs);
            renderRouteSummary();
            renderNearbyHeader();
        } catch (err) {
            console.warn('Routenberechnung fehlgeschlagen, zeige Luftlinie:', err);
            drawStraightFallback();
        }
    }

    function renderRouteSummary() {
        const el = document.getElementById('rp2-route-summary');
        const countEl = document.getElementById('rp2-stops-count');
        if (countEl) countEl.textContent = stops.length;
        if (!el) return;

        if (stops.length === 0) { el.innerHTML = ''; return; }

        const parts = [`<span class="rp2-metric">${ic('pin', 13)} <strong>${stops.length}</strong> ${stops.length === 1 ? 'Stopp' : 'Stopps'}</span>`];

        if (typeof routeMetrics.km === 'number') {
            const cls = routeMetrics.estimated ? 'rp2-metric estimate' : 'rp2-metric';
            parts.push(`<span class="${cls}">🚗 <strong>${fmtKm(routeMetrics.km)}</strong>${routeMetrics.estimated ? ' Luftlinie' : ''}</span>`);
        }
        if (typeof routeMetrics.min === 'number') {
            parts.push(`<span class="rp2-metric">⏱ <strong>${fmtMin(routeMetrics.min)}</strong></span>`);
        }
        el.innerHTML = parts.join('');
    }

    // ---------------------------------------------------------------
    // Adressbuch-Verzahnung: Ansprechpartner, Verknüpfungen, Maschinen
    // ---------------------------------------------------------------
    const LINK_TYPE_LABEL = {
        lieferadresse: 'Lieferadresse',
        rechnungsadresse: 'Rechnungsadresse',
        zentrale: 'Zentrale',
        filiale: 'Filiale',
        konzern: 'Konzern',
        sonstige: 'Verknüpft'
    };

    async function loadStopExtras() {
        const ids = stops.map(s => s.customerId).filter(v => v !== null && v !== undefined);
        contactsByCustomer = new Map();
        machineCountByCustomer = new Map();
        linkedSuggestions = [];

        if (!ids.length) {
            renderStops();
            renderLinked();
            return;
        }

        // Ansprechpartner – Tabelle stammt aus supabase_add_addressbook.sql und
        // kann fehlen; die Route muss trotzdem funktionieren.
        try {
            const { data, error } = await sb()
                .from('customer_contacts')
                .select('id, customer_id, name, position, phone, mobile, email, is_primary')
                .in('customer_id', ids);
            if (error) throw error;
            (data || []).forEach(c => {
                const key = String(c.customer_id);
                if (!contactsByCustomer.has(key)) contactsByCustomer.set(key, []);
                contactsByCustomer.get(key).push(c);
            });
            contactsByCustomer.forEach(list => list.sort((a, b) => (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0)));
        } catch (err) {
            console.warn('Ansprechpartner nicht verfügbar (supabase_add_addressbook.sql ausgeführt?)', err.message || err);
        }

        // Maschinenanzahl je Stopp
        try {
            const { data, error } = await sb()
                .from('machines')
                .select('id, customer_id')
                .in('customer_id', ids);
            if (error) throw error;
            (data || []).forEach(m => {
                const key = String(m.customer_id);
                machineCountByCustomer.set(key, (machineCountByCustomer.get(key) || 0) + 1);
            });
        } catch (err) {
            console.warn('Maschinenanzahl konnte nicht geladen werden:', err.message || err);
        }

        // Verknüpfte Adressen als Zusatzstopp-Vorschlag
        try {
            const orFilter = `customer_id.in.(${ids.join(',')}),linked_customer_id.in.(${ids.join(',')})`;
            const { data: links, error } = await sb()
                .from('customer_links')
                .select('id, customer_id, linked_customer_id, link_type')
                .or(orFilter);
            if (error) throw error;

            const idSet = new Set(ids.map(String));
            const stopIds = new Set(stops.map(s => s.id));
            const wanted = new Map(); // otherId -> { id, linkType, via }

            (links || []).forEach(l => {
                const aIn = idSet.has(String(l.customer_id));
                const otherId = aIn ? l.linked_customer_id : l.customer_id;
                const viaId = aIn ? l.customer_id : l.linked_customer_id;
                if (idSet.has(String(otherId))) return;                  // schon in der Route
                if (stopIds.has(stopIdFor('customer', otherId))) return;
                const via = stops.find(s => String(s.customerId) === String(viaId));
                if (!wanted.has(String(otherId))) {
                    wanted.set(String(otherId), { id: otherId, linkType: l.link_type, via: via ? via.label : null });
                }
            });

            if (wanted.size > 0) {
                const { data: others, error: cErr } = await sb()
                    .from('customers')
                    .select('id, name, customer_number, street, zip_code, city, country, lat, lng, geocoded_address')
                    .in('id', [...wanted.values()].map(w => w.id));
                if (cErr) throw cErr;

                linkedSuggestions = (others || [])
                    .filter(c => customerAddress(c))
                    .map(c => {
                        const meta = wanted.get(String(c.id));
                        return {
                            id: stopIdFor('customer', c.id),
                            customerId: c.id,
                            record: c,
                            label: customerLabel(c),
                            address: customerAddress(c),
                            isCustomer: isCustomerRecord(c),
                            linkType: meta ? meta.linkType : 'sonstige',
                            via: meta ? meta.via : null
                        };
                    });
            }
        } catch (err) {
            console.warn('Verknüpfte Adressen nicht verfügbar (supabase_add_addressbook.sql ausgeführt?)', err.message || err);
        }

        renderStops();
        renderLinked();
    }

    // ---------------------------------------------------------------
    // Stopp-Liste
    // ---------------------------------------------------------------
    function renderStops() {
        const list = document.getElementById('rp2-stops-list');
        if (!list) return;
        renderRouteSummary();

        const optimizeBtn = document.getElementById('rp2-optimize-btn');
        const saveBtn = document.getElementById('rp2-save-btn');
        if (optimizeBtn) optimizeBtn.disabled = stops.length < 2;
        if (saveBtn) saveBtn.disabled = stops.length === 0;

        if (stops.length === 0) {
            list.innerHTML = '<div class="rp2-hint">Noch keine Stopps ausgewählt — oben nach Kunde, Ort, PLZ, Straße oder Maschine suchen.</div>';
            return;
        }

        list.innerHTML = stops.map((s, i) => {
            const contacts = contactsByCustomer.get(String(s.customerId)) || [];
            const contact = contacts[0];
            const machineCount = machineCountByCustomer.get(String(s.customerId)) || 0;
            const tel = contact ? (contact.mobile || contact.phone) : null;

            const contactHtml = contact
                ? `<div class="rp2-stop-contact">${ic('user', 13)}<span>${esc(contact.name)}${contact.position ? ' · ' + esc(contact.position) : ''}</span>` +
                (tel ? `<a href="tel:${esc(String(tel).replace(/\s/g, ''))}">${ic('phone', 12)} ${esc(tel)}</a>` : '') + `</div>`
                : '';

            const meta = [];
            if (s.isCustomer) meta.push('<span class="rp2-badge customer">Kunde</span>');
            if (machineCount) meta.push(`<span class="rp2-chip">${ic('machine', 12)} ${machineCount}</span>`);

            return `
            <div class="rp2-stop" data-rp2-stop="${esc(s.id)}" data-rp2-index="${i}">
                <div class="rp2-drag-handle" data-rp2-drag="${esc(s.id)}" title="Zum Sortieren ziehen">${ic('grip', 18)}</div>
                <div class="rp2-stop-num">${i + 1}</div>
                <div class="rp2-stop-main">
                    <div class="rp2-stop-head"><span class="rp2-stop-label">${esc(s.label)}</span></div>
                    <div class="rp2-stop-address">${ic('pin', 13)}<span>${esc(s.address)}</span></div>
                    ${contactHtml}
                    ${meta.length ? `<div class="rp2-stop-meta">${meta.join('')}</div>` : ''}
                    ${s.customerId ? `<div class="rp2-stop-tools">
                        <button class="rp2-btn rp2-btn-sm" data-rp2-action="open-address" data-rp2-id="${esc(String(s.customerId))}">${ic('book', 13)} Adresse</button>
                        <button class="rp2-btn rp2-btn-sm" data-rp2-action="note-visit" data-rp2-id="${esc(String(s.customerId))}">${ic('note', 13)} Besuch notieren</button>
                    </div>` : ''}
                </div>
                <div class="rp2-stop-side">
                    <button class="rp2-icon-btn" data-rp2-action="move-up" data-rp2-id="${esc(s.id)}" title="Nach oben" ${i === 0 ? 'disabled' : ''}>${ic('up', 15)}</button>
                    <button class="rp2-icon-btn" data-rp2-action="move-down" data-rp2-id="${esc(s.id)}" title="Nach unten" ${i === stops.length - 1 ? 'disabled' : ''}>${ic('down', 15)}</button>
                    <button class="rp2-icon-btn danger" data-rp2-action="remove" data-rp2-id="${esc(s.id)}" title="Entfernen">${ic('close', 15)}</button>
                </div>
            </div>`;
        }).join('');
    }

    function renderLinked() {
        const wrap = document.getElementById('rp2-linked-section');
        const list = document.getElementById('rp2-linked-list');
        if (!wrap || !list) return;

        if (!linkedSuggestions.length) {
            wrap.style.display = 'none';
            list.innerHTML = '';
            return;
        }

        wrap.style.display = '';
        list.innerHTML = linkedSuggestions.map(s => `
            <div class="rp2-suggest linked">
                <div class="rp2-avatar" style="--rp2-hue:${avatarHue(s.label)}">${esc(initials(s.label))}</div>
                <div class="rp2-suggest-body">
                    <div class="rp2-suggest-name">${esc(s.label)}${s.isCustomer ? '<span class="rp2-badge customer">Kunde</span>' : ''}</div>
                    <div class="rp2-suggest-sub">${esc(LINK_TYPE_LABEL[s.linkType] || 'Verknüpft')}${s.via ? ' von ' + esc(s.via) : ''} · ${esc(s.address)}</div>
                </div>
                <button class="rp2-add-btn" data-rp2-action="add-linked" data-rp2-id="${esc(s.id)}" title="Zur Route hinzufügen">${ic('plus', 17)}</button>
            </div>`).join('');
    }

    function renderNearby() {
        const list = document.getElementById('rp2-nearby-list');
        const countEl = document.getElementById('rp2-nearby-count');
        if (!list) return;
        if (countEl) countEl.textContent = nearbyCandidates.length;

        if (nearbyCandidates.length === 0) {
            // Unterscheiden, ob noch nicht gesucht wurde oder ob die Filter alles
            // wegschneiden — sonst sucht man den Fehler an der falschen Stelle.
            const searched = nearbyRawRecords.length > 0;
            const filters = [];
            if (nearbyOnlyCustomers) filters.push('Nur Kunden');
            if (nearbyOnlyWithMachines) filters.push('Nur mit Maschinen');
            if (nearbyAddressTypes.size) filters.push('Adresstyp');
            if (nearbyManufacturer) filters.push('Hersteller: ' + nearbyManufacturer);

            list.innerHTML = !searched
                ? '<div class="rp2-hint">Noch keine Umkreissuche durchgeführt — Radius wählen und „Suchen“ drücken.</div>'
                : `<div class="rp2-hint">Keine Adresse im Umkreis${filters.length ? ` mit diesen Filtern (${esc(filters.join(', '))})` : ''}. Radius vergrößern oder Filter zurücksetzen.</div>`;
            return;
        }

        list.innerHTML = nearbyCandidates.map(c => `
            <div class="rp2-suggest">
                <div class="rp2-avatar" style="--rp2-hue:${avatarHue(c.label)}">${esc(initials(c.label))}</div>
                <div class="rp2-suggest-body">
                    <div class="rp2-suggest-name">${esc(c.label)}${c.isCustomer ? '<span class="rp2-badge customer">Kunde</span>' : ''}${c.machineCount ? `<span class="rp2-chip">${ic('machine', 12)} ${c.machineCount}</span>` : ''}</div>
                    <div class="rp2-suggest-sub">${esc(c.address)}</div>
                </div>
                <span class="rp2-distance">${c.distanceKm.toFixed(1).replace('.', ',')} km</span>
                <button class="rp2-add-btn" data-rp2-action="add-candidate" data-rp2-id="${esc(c.id)}" title="Zur Route hinzufügen">${ic('plus', 17)}</button>
            </div>`).join('');
    }

    // ---------------------------------------------------------------
    // Stopps verwalten
    // ---------------------------------------------------------------
    function addStopObject(stop) {
        if (stops.some(s => s.id === stop.id)) return;
        stops.push(stop);
        nearbyCandidates = nearbyCandidates.filter(c => c.id !== stop.id);
        linkedSuggestions = linkedSuggestions.filter(c => c.id !== stop.id);
        renderStops();
        renderNearby();
        renderLinked();
        renderMarkers();
        updateRouteLine();
        loadStopExtras();
    }

    window.rp2RemoveStop = function (id) {
        stops = stops.filter(s => s.id !== id);
        renderStops();
        renderMarkers();
        updateRouteLine();
        loadStopExtras();
    };

    window.rp2MoveStop = function (id, dir) {
        const i = stops.findIndex(s => s.id === id);
        if (i < 0) return;
        const j = i + dir;
        if (j < 0 || j >= stops.length) return;
        [stops[i], stops[j]] = [stops[j], stops[i]];
        renderStops();
        renderMarkers();
        updateRouteLine();
    };

    window.rp2AddCandidate = function (id) {
        const c = nearbyCandidates.find(x => x.id === id);
        if (!c) return;
        addStopObject({ id: c.id, kind: 'customer', customerId: c.customerId, label: c.label, address: c.address, lat: c.lat, lng: c.lng, isCustomer: c.isCustomer });
    };

    async function addLinkedSuggestion(id) {
        const s = linkedSuggestions.find(x => x.id === id);
        if (!s) return;
        setStatus(`Adresse wird geortet: ${s.label}…`);
        const coords = await resolveCoords(s.record);
        setStatus('');
        if (!coords) { window.showToast(`Die Adresse von "${s.label}" konnte nicht geortet werden.`); return; }
        addStopObject({ id: s.id, kind: 'customer', customerId: s.customerId, label: s.label, address: coords.address, lat: coords.lat, lng: coords.lng, isCustomer: s.isCustomer });
    }

    function setStatus(text, isError) {
        const el = document.getElementById('rp2-status');
        if (!el) return;
        el.textContent = text || '';
        el.classList.toggle('error', !!isError);
    }

    // ---------------------------------------------------------------
    // Reihenfolge optimieren (Nearest Neighbour + 2-opt auf Luftlinie)
    // ---------------------------------------------------------------
    window.rp2Optimize = function () {
        const located = stops.filter(s => typeof s.lat === 'number' && typeof s.lng === 'number');
        const unlocated = stops.filter(s => !(typeof s.lat === 'number' && typeof s.lng === 'number'));
        if (located.length < 2) return;

        const start = (hqInfo && typeof hqInfo.lat === 'number') ? hqInfo : located[0];

        // Nearest Neighbour ab Start
        const remaining = [...located];
        const order = [];
        let current = start;
        while (remaining.length) {
            let bestIdx = 0, bestDist = Infinity;
            remaining.forEach((s, i) => {
                const d = haversineKm(current.lat, current.lng, s.lat, s.lng);
                if (d < bestDist) { bestDist = d; bestIdx = i; }
            });
            current = remaining[bestIdx];
            order.push(current);
            remaining.splice(bestIdx, 1);
        }

        // 2-opt: Teilstrecken umdrehen, solange es kürzer wird
        const legLength = (arr) => {
            let total = 0;
            let prev = start;
            for (const s of arr) { total += haversineKm(prev.lat, prev.lng, s.lat, s.lng); prev = s; }
            return total;
        };
        let improved = true;
        let guard = 0;
        while (improved && guard++ < 60) {
            improved = false;
            const currentLength = legLength(order);
            for (let i = 0; i < order.length - 1; i++) {
                for (let k = i + 1; k < order.length; k++) {
                    const candidate = order.slice(0, i).concat(order.slice(i, k + 1).reverse(), order.slice(k + 1));
                    if (legLength(candidate) < currentLength - 0.0001) {
                        order.splice(0, order.length, ...candidate);
                        improved = true;
                        break;
                    }
                }
                if (improved) break;
            }
        }

        stops = order.concat(unlocated);
        renderStops();
        renderMarkers();
        updateRouteLine();
        setStatus('Reihenfolge optimiert (kürzeste Strecke ab Start).');
        setTimeout(() => setStatus(''), 4000);
    };

    // ---------------------------------------------------------------
    // Drag & Drop (Pointer-Events – funktioniert mit Maus UND Touch)
    // ---------------------------------------------------------------
    let dragState = null;

    function initDragAndDrop() {
        const list = document.getElementById('rp2-stops-list');
        if (!list || list.dataset.rp2DragReady === '1') return;
        list.dataset.rp2DragReady = '1';

        list.addEventListener('pointerdown', (e) => {
            const handle = e.target.closest('[data-rp2-drag]');
            if (!handle) return;
            const card = handle.closest('.rp2-stop');
            if (!card) return;
            e.preventDefault();
            try { handle.setPointerCapture(e.pointerId); } catch (err) { }
            dragState = { id: handle.getAttribute('data-rp2-drag'), card, pointerId: e.pointerId, targetIndex: null };
            card.classList.add('dragging');
        });

        list.addEventListener('pointermove', (e) => {
            if (!dragState || e.pointerId !== dragState.pointerId) return;
            e.preventDefault();
            const cards = [...list.querySelectorAll('.rp2-stop')];
            let target = null;
            for (const c of cards) {
                const r = c.getBoundingClientRect();
                if (e.clientY >= r.top && e.clientY <= r.bottom) { target = c; break; }
            }
            cards.forEach(c => c.classList.remove('drop-target'));
            if (target && target !== dragState.card) {
                target.classList.add('drop-target');
                dragState.targetIndex = parseInt(target.getAttribute('data-rp2-index'), 10);
            } else {
                dragState.targetIndex = null;
            }
        });

        const finish = (e) => {
            if (!dragState || (e && e.pointerId !== dragState.pointerId)) return;
            const from = stops.findIndex(s => s.id === dragState.id);
            const to = dragState.targetIndex;
            dragState.card.classList.remove('dragging');
            list.querySelectorAll('.rp2-stop').forEach(c => c.classList.remove('drop-target'));
            dragState = null;

            if (from >= 0 && to !== null && to !== from) {
                const [moved] = stops.splice(from, 1);
                stops.splice(to, 0, moved);
                renderStops();
                renderMarkers();
                updateRouteLine();
            }
        };

        list.addEventListener('pointerup', finish);
        list.addEventListener('pointercancel', finish);
    }

    // ---------------------------------------------------------------
    // Suche
    // ---------------------------------------------------------------
    window.rp2Search = function () {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(runSearch, 280);
    };

    async function runSearch() {
        const input = document.getElementById('rp2-search-input');
        const box = document.getElementById('rp2-search-results');
        if (!input || !box) return;
        const query = input.value.trim();

        if (!query || query.length < 2) {
            box.classList.remove('open');
            box.innerHTML = '';
            return;
        }

        box.classList.add('open');
        box.innerHTML = '<div class="rp2-hint">Suche…</div>';

        try {
            // Kunden direkt über Name/Matchcode/Adresse treffen UND Kunden finden, bei denen eine
            // Maschine zum Suchbegriff passt — angezeigt wird immer der KUNDE, nie die Maschine allein.
            const [{ data: custData, error: custErr }, { data: machMatches, error: machErr }] = await Promise.all([
                sb().from('customers')
                    .select('id, name, matchcode, customer_number, address_number, street, zip_code, city, country, lat, lng, geocoded_address')
                    .or(`name.ilike.%${query}%,matchcode.ilike.%${query}%,street.ilike.%${query}%,zip_code.ilike.%${query}%,city.ilike.%${query}%,customer_number.ilike.%${query}%`)
                    .limit(12),
                sb().from('machines')
                    .select('id, customer_id, name, manufacturer, serial, year')
                    .not('customer_id', 'is', null)
                    .or(`name.ilike.%${query}%,manufacturer.ilike.%${query}%,serial.ilike.%${query}%`)
                    .limit(20)
            ]);

            if (custErr) throw custErr;
            if (machErr) console.warn('Maschinensuche fehlgeschlagen:', machErr.message);

            const customers = new Map((custData || []).map(c => [c.id, c]));

            const missingCustomerIds = [...new Set((machMatches || []).map(m => m.customer_id))]
                .filter(id => id && !customers.has(id));
            if (missingCustomerIds.length > 0) {
                const { data: extraCustomers, error: extraErr } = await sb()
                    .from('customers')
                    .select('id, name, matchcode, customer_number, address_number, street, zip_code, city, country, lat, lng, geocoded_address')
                    .in('id', missingCustomerIds);
                if (extraErr) console.warn('Kunden zu Maschinentreffern konnten nicht geladen werden:', extraErr.message);
                (extraCustomers || []).forEach(c => customers.set(c.id, c));
            }

            const customersWithAddress = [...customers.values()].filter(c => customerAddress(c));

            if (customersWithAddress.length === 0) {
                box.innerHTML = '<div class="rp2-hint">Keine Treffer gefunden</div>';
                return;
            }

            const customerIds = customersWithAddress.map(c => c.id);
            const { data: allMachines, error: allMachErr } = await sb()
                .from('machines')
                .select('id, customer_id, name, manufacturer, serial, year')
                .in('customer_id', customerIds)
                .limit(500);
            if (allMachErr) console.warn('Maschinenliste je Kunde konnte nicht geladen werden:', allMachErr.message);

            const machinesByCustomer = {};
            (allMachines || []).forEach(m => {
                if (!m.customer_id) return;
                (machinesByCustomer[m.customer_id] = machinesByCustomer[m.customer_id] || []).push(m);
            });

            window.rp2SearchResults = customersWithAddress.map(c => ({
                kind: 'customer',
                id: stopIdFor('customer', c.id),
                record: c,
                label: customerLabel(c),
                address: customerAddress(c),
                isCustomer: isCustomerRecord(c),
                machines: machinesByCustomer[c.id] || []
            }));

            box.innerHTML = window.rp2SearchResults.map(r => {
                const machineChip = r.machines.length
                    ? `<span class="rp2-chip">${ic('machine', 12)} ${r.machines.length}</span>` : '';
                return `
                <button type="button" class="rp2-search-item" data-rp2-action="pick-search" data-rp2-id="${esc(r.id)}">
                    <div class="rp2-avatar" style="--rp2-hue:${avatarHue(r.label)}">${esc(initials(r.label))}</div>
                    <div class="rp2-search-body">
                        <div class="rp2-search-name">${esc(r.label)}${r.isCustomer ? '<span class="rp2-badge customer">Kunde</span>' : ''}${machineChip}</div>
                        <div class="rp2-search-sub">${esc(r.address)}</div>
                    </div>
                </button>`;
            }).join('');
        } catch (err) {
            console.error('Routenplanung-Suche fehlgeschlagen:', err);
            box.innerHTML = '<div class="rp2-hint" style="color:#f87171;">Fehler bei der Suche</div>';
        }
    }

    async function selectSearchResult(id) {
        const r = (window.rp2SearchResults || []).find(x => x.id === id);
        if (!r) return;

        const box = document.getElementById('rp2-search-results');
        const input = document.getElementById('rp2-search-input');
        if (box) { box.classList.remove('open'); box.innerHTML = ''; }
        if (input) input.value = '';

        setStatus(`Adresse wird geortet: ${r.label}…`);
        const coords = await resolveCoords(r.record);
        setStatus('');

        if (!coords) {
            window.showToast(`Die Adresse von "${r.label}" konnte nicht geortet werden.\n\nMögliche Ursachen: Straße/Hausnummer fehlt oder ist fehlerhaft erfasst, oder die Adresse ist in OpenStreetMap nicht bekannt. Bitte Adresse prüfen.`);
            return;
        }

        addStopObject({ id: r.id, kind: 'customer', customerId: r.record.id, label: r.label, address: coords.address, lat: coords.lat, lng: coords.lng, isCustomer: r.isCustomer });
    }

    // ---------------------------------------------------------------
    // Umkreissuche
    // ---------------------------------------------------------------
    window.rp2RunNearbySearch = function () { runNearbySearch(); };

    async function runNearbySearch() {
        isRadiusFilterEnabled = true; // Suchen-Klick schaltet Radius-Filter garantiert wieder ein
        const base = stops.length > 0 ? stops[stops.length - 1] : (hqInfo && typeof hqInfo.lat === 'number' ? { lat: hqInfo.lat, lng: hqInfo.lng } : null);
        const radiusInput = document.getElementById('rp2-radius');
        const radius = Math.max(1, parseFloat(radiusInput?.value) || 50);

        if (!base && !routeGeometry) { nearbyCandidates = []; renderNearby(); return; }
        if (!window.supabaseClient) return;

        nearbyBase = base;
        nearbyRadius = radius;
        setStatus(routeGeometry ? 'Kunden entlang der Route werden gesucht…' : 'Kunden im Umkreis werden geladen…');

        try {
            const [{ data: customers, error }, machineRes, linksRes] = await Promise.all([
                sb().from('customers')
                    .select('id, name, matchcode, customer_number, address_type, street, zip_code, city, country, lat, lng, geocoded_address')
                    .not('city', 'is', null)
                    .limit(2000),
                sb().from('machines').select('id, customer_id, manufacturer').not('customer_id', 'is', null).limit(5000),
                sb().from('customer_links').select('customer_id, linked_customer_id').limit(10000)
            ]);
            if (error) throw error;

            // Maschinenanzahl je Adresse — Grundlage für den Filter „nur mit Maschinen“.
            machineCountAll = new Map();
            manufacturersByCustomer = new Map();
            manufacturerNames = new Map();
            if (machineRes.error) console.warn('Maschinenanzahl konnte nicht geladen werden:', machineRes.error.message);
            else (machineRes.data || []).forEach(m => {
                const k = String(m.customer_id);
                machineCountAll.set(k, (machineCountAll.get(k) || 0) + 1);

                const man = (m.manufacturer || '').trim();
                if (man) {
                    const key = man.toLowerCase();
                    if (!manufacturersByCustomer.has(k)) manufacturersByCustomer.set(k, new Set());
                    manufacturersByCustomer.get(k).add(key);
                    if (!manufacturerNames.has(key)) manufacturerNames.set(key, man);
                }
            });

            linkedCountAll = new Map();
            if (linksRes.error) console.warn('Verknüpfungsanzahl konnte nicht geladen werden:', linksRes.error.message);
            else (linksRes.data || []).forEach(l => {
                [l.customer_id, l.linked_customer_id].forEach(cid => {
                    if (!cid) return;
                    const k = String(cid);
                    linkedCountAll.set(k, (linkedCountAll.get(k) || 0) + 1);
                });
            });

            renderAddressTypeFilter();
            renderManufacturerFilter();

            const withAddress = (customers || []).filter(c => customerAddress(c));
            const alreadyGeocoded = withAddress.filter(c => typeof c.lat === 'number' && typeof c.lng === 'number' && c.geocoded_address === customerAddress(c));
            const needsGeocoding = withAddress.filter(c => !(typeof c.lat === 'number' && typeof c.lng === 'number' && c.geocoded_address === customerAddress(c)));

            // Erste, schnelle Runde nur mit bereits gecachten Koordinaten.
            nearbyRawRecords = alreadyGeocoded;
            applyNearbyFilter();
            setStatus('');

            // Fehlende Koordinaten im Hintergrund nachladen (rate-limitiert).
            if (needsGeocoding.length > 0) {
                for (let i = 0; i < needsGeocoding.length; i++) {
                    await resolveCoords(needsGeocoding[i]);
                    setStatus(`Weitere Adressen werden geortet… ${i + 1} / ${needsGeocoding.length}`);
                }
                setStatus('');
                nearbyRawRecords = alreadyGeocoded.concat(needsGeocoding);
                applyNearbyFilter();
            }
        } catch (err) {
            console.error('Umkreissuche fehlgeschlagen:', err);
            setStatus('Fehler bei der Umkreissuche.', true);
        }
    }

    let isRadiusFilterEnabled = true;

    window.rp2ToggleRadiusActive = function () {
        isRadiusFilterEnabled = !isRadiusFilterEnabled;
        applyNearbyFilter();
    };

    window.rp2OnRadiusInput = function () {
        if (!isRadiusFilterEnabled) {
            isRadiusFilterEnabled = true;
            applyNearbyFilter();
        }
    };

    // Wandelt die geladenen Adressen in Kandidaten um und wendet Radius +
    // Kunden-/Maschinen-Filter an. Läuft rein lokal, damit das Umschalten der
    // Filter keine neue Datenbankabfrage auslöst.
    function applyNearbyFilter() {
        const stopIds = new Set(stops.map(s => s.id));
        const useCorridor = !!(routeGeometry && routeGeometry.length >= 2);

        const radiusInput = document.getElementById('rp2-radius');
        const activeRadius = Math.max(1, parseFloat(radiusInput?.value) || nearbyRadius || 50);
        nearbyRadius = activeRadius;

        nearbyCandidates = nearbyRawRecords
            .filter(c => typeof c.lat === 'number' && typeof c.lng === 'number')
            .map(c => {
                const dist = useCorridor
                    ? distanceToRouteKm(c.lat, c.lng)
                    : (nearbyBase ? haversineKm(nearbyBase.lat, nearbyBase.lng, c.lat, c.lng) : null);
                return {
                    id: stopIdFor('customer', c.id),
                    kind: 'customer',
                    customerId: c.id,
                    label: customerLabel(c),
                    address: customerAddress(c),
                    isCustomer: isCustomerRecord(c),
                    addressType: c.address_type ? String(c.address_type) : null,
                    machineCount: machineCountAll.get(String(c.id)) || 0,
                    lat: c.lat,
                    lng: c.lng,
                    distanceKm: dist
                };
            })
            .filter(c => {
                if (!isRadiusFilterEnabled) return true; // Radius disabled via X button -> show all matching
                return typeof c.distanceKm === 'number' && c.distanceKm <= activeRadius && !stopIds.has(c.id);
            })
            .filter(c => !stopIds.has(c.id))
            .filter(c => !nearbyOnlyCustomers || c.isCustomer)
            .filter(c => !nearbyOnlyWithMachines || c.machineCount > 0)
            .filter(c => {
                if (!nearbyManufacturer) return true;
                const set = manufacturersByCustomer.get(String(c.customerId));
                return !!(set && set.has(nearbyManufacturer.toLowerCase()));
            })
            .filter(c => {
                if (!nearbyAddressTypes.size) return true;
                const types = (c.addressType || '').split(',').map(s => s.trim()).filter(Boolean);
                return types.some(t => nearbyAddressTypes.has(t));
            })
            .sort((a, b) => (a.distanceKm || 0) - (b.distanceKm || 0));

        renderNearby();
        renderNearbyHeader();
        renderMarkers();
    }

    // Überschrift + Filterzustand der Trefferliste
    function renderNearbyHeader() {
        const modeEl = document.getElementById('rp2-nearby-mode');
        if (modeEl) {
            const useCorridor = !!(routeGeometry && routeGeometry.length >= 2);
            modeEl.textContent = useCorridor ? 'entlang der Route' : 'um den Startpunkt';
        }
        const btnC = document.getElementById('rp2-filter-customers');
        const btnM = document.getElementById('rp2-filter-machines');
        if (btnC) btnC.classList.toggle('active', nearbyOnlyCustomers);
        if (btnM) btnM.classList.toggle('active', nearbyOnlyWithMachines);

        const radiusInput = document.getElementById('rp2-radius');
        const clearBtn = document.getElementById('rp2-radius-clear-btn');
        if (radiusInput) {
            radiusInput.classList.toggle('radius-active', isRadiusFilterEnabled);
        }
        if (clearBtn) {
            clearBtn.style.color = isRadiusFilterEnabled ? '#4ade80' : 'rgba(255,255,255,0.4)';
        }
    }

    window.rp2ToggleNearbyFilter = function (which) {
        if (which === 'customers') nearbyOnlyCustomers = !nearbyOnlyCustomers;
        if (which === 'machines') nearbyOnlyWithMachines = !nearbyOnlyWithMachines;
        applyNearbyFilter();
    };

    window.rp2ToggleAddressType = function (name) {
        if (nearbyAddressTypes.has(name)) nearbyAddressTypes.delete(name);
        else nearbyAddressTypes.add(name);
        renderAddressTypeFilter();
        applyNearbyFilter();
    };

    // Hersteller-Auswahl: Es stehen IMMER alle in den Einstellungen angelegten
    // Hersteller-Kategorien zur Wahl – unabhängig davon, ob schon eine
    // Umkreissuche gelaufen ist. Ergänzt werden Hersteller, die nur an Maschinen
    // stehen, aber noch nicht als Kategorie angelegt sind.
    function renderManufacturerFilter() {
        const select = document.getElementById('rp2-filter-manufacturer');
        if (!select) return;

        const seen = new Map();
        (window.categoryList || [])
            .filter(c => c.type === 'manufacturer')
            .forEach(c => {
                const name = (c.name || '').trim();
                if (name) seen.set(name.toLowerCase(), name);
            });

        // Aus dem Maschinenbestand ergänzen (Umkreissuche bzw. globale Liste).
        const fromMachines = new Set();
        manufacturersByCustomer.forEach(set => set.forEach(m => fromMachines.add(m)));
        (window.machineList || []).forEach(m => {
            const man = (m.manufacturer || '').trim();
            if (man) {
                fromMachines.add(man.toLowerCase());
                if (!manufacturerNames.has(man.toLowerCase())) manufacturerNames.set(man.toLowerCase(), man);
            }
        });
        fromMachines.forEach(lower => {
            if (!seen.has(lower)) seen.set(lower, manufacturerNames.get(lower) || lower);
        });

        const names = [...seen.values()].sort((a, b) => a.localeCompare(b, 'de'));
        const previous = nearbyManufacturer;

        select.innerHTML = '<option value="">Alle Hersteller</option>'
            + names.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('');

        // Auswahl beibehalten, solange der Hersteller noch vorkommt.
        if (previous && seen.has(previous.toLowerCase())) select.value = previous;
        else { nearbyManufacturer = ''; select.value = ''; }

        if (!select.dataset.rp2Bound) {
            select.dataset.rp2Bound = '1';
            select.addEventListener('change', () => {
                nearbyManufacturer = select.value || '';
                applyNearbyFilter();
            });
        }
    }

    function addressTypeColor(name) {
        const cat = (window.categoryList || []).find(c => c.type === 'address_type' && c.name === name);
        return (cat && cat.color) || null;
    }

    function firstAddressTypeColor(addressTypeString) {
        if (!addressTypeString) return null;
        const first = String(addressTypeString).split(',').map(s => s.trim()).filter(Boolean)[0];
        return first ? addressTypeColor(first) : null;
    }

    function renderAddressTypeFilter() {
        const row = document.getElementById('rp2-filter-addresstype-row');
        if (!row) return;
        const cats = (window.categoryList || []).filter(c => c.type === 'address_type');
        if (!cats.length) { row.innerHTML = ''; return; }
        row.innerHTML = cats.map(c => {
            const active = nearbyAddressTypes.has(c.name);
            const color = c.color || '#38bdf8';
            const style = active
                ? `style="color:${esc(color)}; border-color:${esc(color)}; background:${esc(color)}22; box-shadow:0 0 12px -2px ${esc(color)};"`
                : `style="color:${esc(color)}; border-color:${esc(color)}66;"`;
            return `<button class="rp2-filter-chip rp2-filter-chip-addr${active ? ' active' : ''}" data-rp2-action="filter-addresstype" data-rp2-id="${esc(c.name)}" title="Adresstyp: ${esc(c.name)}" ${style}><span style="width:8px;height:8px;border-radius:50%;background:${esc(color)};display:inline-block;margin-right:5px;"></span>${esc(c.name)}</button>`;
        }).join('');
    }

    // ---------------------------------------------------------------
    // Adressbuch öffnen / Besuch notieren
    // ---------------------------------------------------------------
    function openAddressInAddressbook(customerId) {
        if (typeof window.switchView === 'function') window.switchView('addressbook');
        const open = () => {
            if (typeof window.openAddressDetail === 'function') window.openAddressDetail(customerId);
        };
        // Das Adressbuch lädt seine Daten beim Wechsel nach; kurz warten, damit
        // die Adresse im Cache liegt, bevor das Detailfenster geöffnet wird.
        if (window.addressbookState && window.addressbookState.loaded) open();
        else setTimeout(open, 1200);
    }

    function noteVisit(customerId) {
        const stop = stops.find(s => String(s.customerId) === String(customerId));
        const today = new Date().toISOString().slice(0, 10);
        openDialog('Besuch notieren', `
            <div class="rp2-section">
                <div class="rp2-hq-name">${esc(stop ? stop.label : '')}</div>
                <label class="rp2-label" for="rp2-visit-date">Datum</label>
                <input type="date" id="rp2-visit-date" class="rp2-input" value="${today}">
                <label class="rp2-label" for="rp2-visit-title">Betreff</label>
                <input type="text" id="rp2-visit-title" class="rp2-input" value="Besuch vor Ort" placeholder="z. B. Wartung durchgeführt">
                <label class="rp2-label" for="rp2-visit-body">Notiz</label>
                <textarea id="rp2-visit-body" class="rp2-input" rows="4" placeholder="Was wurde besprochen oder gemacht?"></textarea>
            </div>`, 'Eintrag speichern', async () => {
            const title = document.getElementById('rp2-visit-title').value.trim();
            const body = document.getElementById('rp2-visit-body').value.trim();
            if (!title && !body) { window.showToast('Bitte Betreff oder Notiz ausfüllen.'); return; }
            const { error } = await sb().from('customer_notes').insert([{
                customer_id: customerId,
                entry_type: 'visit',
                title: title || null,
                body: body || null,
                author: currentAuthor(),
                entry_date: document.getElementById('rp2-visit-date').value || today
            }]);
            if (error) {
                throw new Error('Historie nicht verfügbar — bitte supabase_add_addressbook.sql ausführen. (' + error.message + ')');
            }
            closeDialog();
            setStatus('Besuch in der Historie festgehalten.');
            setTimeout(() => setStatus(''), 4000);
        });
    }

    // ---------------------------------------------------------------
    // Routen speichern / laden
    // ---------------------------------------------------------------
    function localRoutes() {
        try { return JSON.parse(localStorage.getItem(LS_ROUTES_KEY) || '[]'); } catch (e) { return []; }
    }
    function setLocalRoutes(list) {
        localStorage.setItem(LS_ROUTES_KEY, JSON.stringify(list));
    }

    function saveRouteDialog() {
        if (!stops.length) return;
        const suggestion = `Tour ${new Date().toLocaleDateString('de-DE')}`;
        openDialog('Route speichern', `
            <div class="rp2-section">
                <label class="rp2-label" for="rp2-route-name">Name der Tour</label>
                <input type="text" id="rp2-route-name" class="rp2-input" value="${esc(suggestion)}">
                <div class="rp2-status">${stops.length} ${stops.length === 1 ? 'Stopp' : 'Stopps'}${typeof routeMetrics.km === 'number' ? ' · ' + fmtKm(routeMetrics.km) : ''}</div>
            </div>`, 'Speichern', async () => {
            const name = document.getElementById('rp2-route-name').value.trim();
            if (!name) { window.showToast('Bitte einen Namen angeben.'); return; }

            const payload = {
                name,
                stops: stops.map(s => ({ customerId: s.customerId, label: s.label, address: s.address, lat: s.lat, lng: s.lng, isCustomer: !!s.isCustomer })),
                total_km: typeof routeMetrics.km === 'number' ? Number(routeMetrics.km.toFixed(2)) : null,
                total_min: typeof routeMetrics.min === 'number' ? Math.round(routeMetrics.min) : null,
                author: currentAuthor()
            };

            let savedToCloud = false;
            if (savedRoutesTableOk && window.supabaseClient) {
                const { error } = await sb().from('saved_routes').insert([payload]);
                if (error) {
                    console.warn('saved_routes nicht verfügbar, speichere lokal:', error.message);
                    savedRoutesTableOk = false;
                } else {
                    savedToCloud = true;
                }
            }

            if (!savedToCloud) {
                const list = localRoutes();
                list.unshift({ ...payload, id: 'local-' + Date.now(), created_at: new Date().toISOString(), local: true });
                setLocalRoutes(list);
            }

            closeDialog();
            setStatus(savedToCloud
                ? 'Route gespeichert.'
                : 'Route nur lokal auf diesem Gerät gespeichert — für geräteübergreifend supabase_add_saved_routes.sql ausführen.');
            setTimeout(() => setStatus(''), 7000);
        });
    }

    async function loadRouteDialog() {
        openDialog('Gespeicherte Routen', '<div class="rp2-hint">Wird geladen…</div>', null, null);

        let cloud = [];
        if (savedRoutesTableOk && window.supabaseClient) {
            const { data, error } = await sb().from('saved_routes').select('*').order('created_at', { ascending: false }).limit(50);
            if (error) { savedRoutesTableOk = false; console.warn('saved_routes nicht verfügbar:', error.message); }
            else cloud = data || [];
        }
        const all = cloud.concat(localRoutes());
        window.rp2SavedRoutes = all;

        const body = document.getElementById('rp2-dialog-body');
        if (!body) return;

        if (!all.length) {
            body.innerHTML = '<div class="rp2-hint">Noch keine Route gespeichert.</div>';
            return;
        }

        body.innerHTML = `<div class="rp2-saved-list">${all.map(r => `
            <div class="rp2-saved-row">
                <div class="rp2-saved-body">
                    <div class="rp2-saved-name">${esc(r.name)}${r.local ? ' <span class="rp2-badge">nur lokal</span>' : ''}</div>
                    <div class="rp2-saved-sub">${(r.stops || []).length} Stopps${r.total_km ? ' · ' + fmtKm(Number(r.total_km)) : ''}${r.created_at ? ' · ' + new Date(r.created_at).toLocaleDateString('de-DE') : ''}${r.author ? ' · ' + esc(r.author) : ''}</div>
                </div>
                <button class="rp2-btn rp2-btn-sm rp2-btn-primary" data-rp2-action="load-route" data-rp2-id="${esc(String(r.id))}">Laden</button>
                <button class="rp2-icon-btn danger" data-rp2-action="delete-route" data-rp2-id="${esc(String(r.id))}" title="Löschen">${ic('trash', 15)}</button>
            </div>`).join('')}</div>`;
    }

    function applySavedRoute(id) {
        const r = (window.rp2SavedRoutes || []).find(x => String(x.id) === String(id));
        if (!r) return;
        stops = (r.stops || []).map(s => ({
            id: stopIdFor('customer', s.customerId),
            kind: 'customer',
            customerId: s.customerId,
            label: s.label,
            address: s.address,
            lat: s.lat,
            lng: s.lng,
            isCustomer: !!s.isCustomer
        }));
        closeDialog();
        renderStops();
        renderMarkers();
        updateRouteLine();
        loadStopExtras();
        setStatus(`Route „${r.name}“ geladen.`);
        setTimeout(() => setStatus(''), 4000);
    }

    async function deleteSavedRoute(id) {
        const r = (window.rp2SavedRoutes || []).find(x => String(x.id) === String(id));
        if (!r) return;
        if (!confirm(`Gespeicherte Route "${r.name}" löschen?`)) return;

        if (r.local) {
            setLocalRoutes(localRoutes().filter(x => String(x.id) !== String(id)));
        } else {
            const { error } = await sb().from('saved_routes').delete().eq('id', id);
            if (error) { window.showToast('Löschen fehlgeschlagen: ' + error.message); return; }
        }
        loadRouteDialog();
    }

    // ---------------------------------------------------------------
    // Export nach Google Maps / Apple Maps
    // ---------------------------------------------------------------
    function buildLegs() {
        // [HQ, ...stops] in Beinen von je max. GMAPS_LEG_SIZE Zielen aufteilen,
        // damit beliebig viele Stopps möglich sind, auch wenn eine einzelne
        // Kartenlink-URL nur begrenzt viele Ziele unterstützt.
        const all = [{ label: hqInfo.name, address: hqInfo.address, lat: hqInfo.lat, lng: hqInfo.lng }, ...stops];
        const legs = [];
        for (let i = 0; i < all.length - 1; i += GMAPS_LEG_SIZE) {
            const chunk = all.slice(i, i + GMAPS_LEG_SIZE + 1);
            if (chunk.length >= 2) legs.push(chunk);
        }
        return legs;
    }

    window.rp2ExportGoogleMaps = function () {
        if (!hqInfo || typeof hqInfo.lat !== 'number') { window.showToast('Firmenadresse konnte nicht geortet werden.'); return; }
        if (stops.length === 0) { window.showToast('Bitte zuerst mindestens einen Stopp zur Route hinzufügen.'); return; }

        const legs = buildLegs();
        legs.forEach(leg => {
            const origin = leg[0];
            const destination = leg[leg.length - 1];
            const waypoints = leg.slice(1, -1);
            let url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(`${origin.label}, ${origin.address}`)}` +
                `&destination=${encodeURIComponent(`${destination.label}, ${destination.address}`)}`;
            if (waypoints.length > 0) {
                url += `&waypoints=${waypoints.map(s => encodeURIComponent(`${s.label}, ${s.address}`)).join('%7C')}`;
            }
            window.open(url, '_blank');
        });
        if (legs.length > 1) {
            window.showToast(`Die Route wurde in ${legs.length} Etappen aufgeteilt (Google Maps unterstützt max. ${GMAPS_LEG_SIZE} Ziele pro Link) und in ${legs.length} Tabs geöffnet.`);
        }
    };

    window.rp2ExportAppleMaps = function () {
        if (!hqInfo || typeof hqInfo.lat !== 'number') { window.showToast('Firmenadresse konnte nicht geortet werden.'); return; }
        if (stops.length === 0) { window.showToast('Bitte zuerst mindestens einen Stopp zur Route hinzufügen.'); return; }

        const legs = buildLegs();
        legs.forEach(leg => {
            const origin = leg[0];
            const rest = leg.slice(1);

            const formatLoc = (item) => {
                if (typeof item.lat === 'number' && typeof item.lng === 'number') {
                    return `${item.lat},${item.lng}`;
                }
                return `${item.label || ''} ${item.address || ''}`.trim();
            };

            const saddr = encodeURIComponent(formatLoc(origin));
            const daddrList = rest.map(s => encodeURIComponent(formatLoc(s)));

            // Apple Maps URL: saddr=Start&daddr=Ziel1+to:Ziel2+to:Ziel3&dirflg=d
            const url = `https://maps.apple.com/?saddr=${saddr}&daddr=${daddrList.join('+to:')}&dirflg=d`;
            window.open(url, '_blank');
        });
        if (legs.length > 1) {
            window.showToast(`Die Route wurde in ${legs.length} Etappen aufgeteilt und in ${legs.length} Tabs geöffnet.`);
        }
    };

    // ---------------------------------------------------------------
    // Übernahme aus dem Adressbuch
    // ---------------------------------------------------------------
    // Wird vom Adressbuch aufgerufen: wechselt auf die Routenplanung und legt
    // die übergebenen Adressen in der gegebenen Reihenfolge als Stopps an.
    // `append = true` hängt an eine bestehende Route an statt sie zu ersetzen.
    window.rp2StartRouteWithAddresses = async function (addresses, append) {
        if (!Array.isArray(addresses) || !addresses.length) return;

        if (typeof window.switchView === 'function') window.switchView('routenplanung');
        await new Promise(r => setTimeout(r, 60));
        await window.rp2Init();

        if (!append) stops = [];

        let added = 0, failed = [];
        for (let i = 0; i < addresses.length; i++) {
            const a = addresses[i];
            const label = a.name || 'Unbekannt';
            setStatus(`Adressen werden geortet… ${i + 1} / ${addresses.length} (${label})`);

            const id = stopIdFor('customer', a.id);
            if (stops.some(s => s.id === id)) continue;

            const coords = await resolveCoords(a);
            if (!coords) { failed.push(label); continue; }

            stops.push({
                id, kind: 'customer', customerId: a.id, label,
                address: coords.address, lat: coords.lat, lng: coords.lng,
                isCustomer: isCustomerRecord(a)
            });
            added++;
            renderStops();
            renderMarkers();
        }

        setStatus('');
        renderStops();
        renderNearby();
        renderMarkers();
        updateRouteLine();
        loadStopExtras();

        if (failed.length) {
            setStatus(`${added} übernommen, ${failed.length} ohne Koordinaten: ${failed.slice(0, 3).join(', ')}${failed.length > 3 ? ' …' : ''}`, true);
        } else {
            setStatus(`${added} ${added === 1 ? 'Adresse' : 'Adressen'} als Route übernommen.`);
            setTimeout(() => setStatus(''), 5000);
        }
    };

    // ---------------------------------------------------------------
    // Dialog
    // ---------------------------------------------------------------
    let dialogSubmit = null;

    function ensureDialog() {
        if (document.getElementById('rp2-dialog')) return;
        const el = document.createElement('div');
        el.id = 'rp2-dialog';
        el.className = 'modal-backdrop';
        el.innerHTML = `
            <div class="modal-content rp2-dialog-content">
                <button class="rp2-icon-btn" data-rp2-action="close-dialog" style="position:absolute; top:14px; right:14px;" title="Schließen">${ic('close', 18)}</button>
                <h2 id="rp2-dialog-title" style="margin-top:0;">Dialog</h2>
                <div id="rp2-dialog-body"></div>
                <div id="rp2-dialog-actions" class="rp2-route-actions" style="justify-content:flex-end; margin-top:1.5rem;"></div>
            </div>`;
        document.body.appendChild(el);
        el.addEventListener('click', (e) => { if (e.target === el) closeDialog(); });
    }

    function openDialog(title, bodyHtml, submitLabel, onSubmit) {
        ensureDialog();
        document.getElementById('rp2-dialog-title').textContent = title;
        document.getElementById('rp2-dialog-body').innerHTML = bodyHtml;
        const actions = document.getElementById('rp2-dialog-actions');
        dialogSubmit = onSubmit || null;
        actions.innerHTML = submitLabel
            ? `<button class="rp2-btn" data-rp2-action="close-dialog">Abbrechen</button>
               <button class="rp2-btn rp2-btn-primary" data-rp2-action="submit-dialog">${esc(submitLabel)}</button>`
            : `<button class="rp2-btn" data-rp2-action="close-dialog">Schließen</button>`;
        const el = document.getElementById('rp2-dialog');
        el.classList.add('show', 'active');
        document.body.style.overflow = 'hidden';
    }

    function closeDialog() {
        const el = document.getElementById('rp2-dialog');
        if (!el) return;
        el.classList.remove('show', 'active');
        document.body.style.overflow = '';
        dialogSubmit = null;
    }

    // ---------------------------------------------------------------
    // Events (Delegation)
    // ---------------------------------------------------------------
    document.addEventListener('click', async (e) => {
        const el = e.target.closest('[data-rp2-action]');
        if (!el) return;
        const action = el.getAttribute('data-rp2-action');
        const id = el.getAttribute('data-rp2-id');

        switch (action) {
            case 'pick-search': selectSearchResult(id); break;
            case 'add-candidate': window.rp2AddCandidate(id); break;
            case 'add-linked': addLinkedSuggestion(id); break;
            case 'remove': window.rp2RemoveStop(id); break;
            case 'move-up': window.rp2MoveStop(id, -1); break;
            case 'move-down': window.rp2MoveStop(id, 1); break;
            case 'open-address': openAddressInAddressbook(id); break;
            case 'note-visit': noteVisit(id); break;
            case 'optimize': window.rp2Optimize(); break;
            case 'nearby': window.rp2RunNearbySearch(); break;
            case 'filter-customers': window.rp2ToggleNearbyFilter('customers'); break;
            case 'filter-machines': window.rp2ToggleNearbyFilter('machines'); break;
            case 'filter-addresstype': window.rp2ToggleAddressType(id); break;
            case 'export-google': window.rp2ExportGoogleMaps(); break;
            case 'export-apple': window.rp2ExportAppleMaps(); break;
            case 'save-route': saveRouteDialog(); break;
            case 'load-route-dialog': loadRouteDialog(); break;
            case 'load-route': applySavedRoute(id); break;
            case 'delete-route': deleteSavedRoute(id); break;
            case 'close-dialog': closeDialog(); break;
            case 'submit-dialog': {
                if (!dialogSubmit) return;
                el.disabled = true;
                const label = el.textContent;
                el.textContent = 'Speichert …';
                try { await dialogSubmit(); }
                catch (err) { console.error(err); window.showToast(err.message || err); }
                finally { el.disabled = false; el.textContent = label; }
                break;
            }
        }
    });

    // Suchvorschläge schließen bei Klick daneben
    document.addEventListener('click', (e) => {
        const box = document.getElementById('rp2-search-results');
        if (!box || !box.classList.contains('open')) return;
        if (e.target.closest('.rp2-search-wrap')) return;
        box.classList.remove('open');
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && document.getElementById('rp2-dialog')?.classList.contains('show')) closeDialog();
    });

    // ---------------------------------------------------------------
    // Init (wird beim Öffnen der Seite aufgerufen)
    // ---------------------------------------------------------------
    let rp2InitPromise = null;
    window.rp2Init = function () {
        // Mehrfachaufrufe (z. B. gleichzeitig aus switchView UND
        // rp2StartRouteWithAddresses) auf denselben Init-Lauf bündeln.
        if (rp2InitPromise) return rp2InitPromise;
        rp2InitPromise = rp2InitInternal().finally(() => {
            // Neustarts (Reload nach Fehler) weiter erlauben.
            setTimeout(() => { rp2InitPromise = null; }, 200);
        });
        return rp2InitPromise;
    };

    async function rp2InitInternal() {
        await ensureMap();
        initDragAndDrop();

        setStatus('Firmenadresse wird geortet…');
        await getHqInfo();
        setStatus('');

        const hqEl = document.getElementById('rp2-hq-info');
        if (hqEl) {
            const ok = hqInfo && typeof hqInfo.lat === 'number';
            hqEl.innerHTML = `
                <div class="rp2-hq-icon">${ic('home', 17)}</div>
                <div class="rp2-hq-text">
                    <div class="rp2-hq-title">Start der Tour</div>
                    <div class="rp2-hq-name">${esc(hqInfo.name)}</div>
                    <div class="rp2-hq-address">${esc(hqInfo.address)}${ok ? '' : ' — Ortung fehlgeschlagen'}</div>
                </div>`;
        }

        renderStops();
        renderNearby();
        renderNearbyHeader();
        renderAddressTypeFilter();
        renderManufacturerFilter();
        // Kategorien werden vom App-Start asynchron geladen — falls sie beim
        // ersten Render noch fehlen, nach kurzer Zeit erneut versuchen.
        setTimeout(() => { renderAddressTypeFilter(); renderManufacturerFilter(); }, 800);
        setTimeout(() => { renderAddressTypeFilter(); renderManufacturerFilter(); }, 2500);
        renderLinked();
        renderMarkers();
        updateRouteLine();
        runNearbySearch();
    }
})();
