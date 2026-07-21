// =========================================================
// ROUTENPLANER MIT UMKREISSUCHE
// Findet zu einer Maschine (Kunde) alle weiteren Maschinen-/Kundenstandorte
// im wählbaren Umkreis (Standard 50 km) und öffnet die Tour als
// Multi-Stopp-Route in Google Maps (Start: meetra-Firmenadresse).
// Geocodierung: OpenStreetMap Nominatim (kostenlos, 1 Anfrage/Sek.),
// Koordinaten werden in machines.lat/lng gecacht (supabase_add_machine_coords.sql).
// =========================================================
(function () {
    'use strict';

    // Google Maps erlaubt in der Directions-URL maximal 9 Zwischenstopps + Ziel
    const MAX_STOPS = 10;
    const NOMINATIM_DELAY_MS = 1150;

    let coordsPersistable = true; // false, wenn die SQL-Migration noch nicht gelaufen ist
    let plannerBaseMachine = null;
    let plannerCandidates = []; // [{ machine, distanceKm, address, label }]

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    // Adresse einer Maschine: Maschinenstandort hat Vorrang vor Betreiberadresse
    function machineAddress(m) {
        const street = m.location_street || m.operator_street;
        const zip = m.location_zip || m.operator_zip;
        const city = m.location_city || m.operator_city;
        const country = m.location_country || m.operator_country || 'Deutschland';
        if (!street && !city) return null;
        return [street, [zip, city].filter(Boolean).join(' '), country].filter(Boolean).join(', ');
    }

    function machineLabel(m) {
        return m.location_company || m.company || [m.manufacturer, m.name].filter(Boolean).join(' ') || 'Unbekannt';
    }

    function haversineKm(lat1, lng1, lat2, lng2) {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    function hqAddress() {
        let hq = null;
        try { hq = JSON.parse(localStorage.getItem('meetra_company_hq') || 'null'); } catch (e) { }
        const street = hq?.street || 'Am Alten Bahnhof 6';
        const zipCity = [hq?.zip || '38122', hq?.city || 'Braunschweig'].filter(Boolean).join(' ');
        const country = hq?.country || 'Deutschland';
        return [hq?.name || 'Meetra GmbH', street, zipCity, country].filter(Boolean).join(', ');
    }

    async function geocode(addr) {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addr)}&limit=1`);
        if (!res.ok) return null;
        const data = await res.json();
        if (data && data.length > 0) {
            return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
        }
        return null;
    }

    // Stellt sicher, dass alle Maschinen mit Adresse Koordinaten haben.
    // Cache-Logik: lat/lng gelten nur, solange geocoded_address der aktuellen Adresse entspricht.
    async function ensureCoords(statusCb) {
        const machines = (window.machineList || []).filter(m => machineAddress(m));
        const pending = machines.filter(m => {
            const addr = machineAddress(m);
            return !(typeof m.lat === 'number' && typeof m.lng === 'number' && m.geocoded_address === addr);
        });

        for (let i = 0; i < pending.length; i++) {
            const m = pending[i];
            const addr = machineAddress(m);
            if (statusCb) statusCb(`Adressen werden geortet… ${i + 1} / ${pending.length}`);
            try {
                let coords = await geocode(addr);
                // Fallback: nur PLZ + Ort (Hausnummern fehlen in OSM manchmal)
                if (!coords) {
                    const zip = m.location_zip || m.operator_zip;
                    const city = m.location_city || m.operator_city;
                    const country = m.location_country || m.operator_country || 'Deutschland';
                    const coarse = [[zip, city].filter(Boolean).join(' '), country].filter(Boolean).join(', ');
                    if (coarse.trim()) coords = await geocode(coarse);
                }
                if (coords) {
                    m.lat = coords.lat;
                    m.lng = coords.lng;
                    m.geocoded_address = addr;
                    if (coordsPersistable && window.supabaseClient) {
                        const { error } = await window.supabaseClient
                            .from('machines')
                            .update({ lat: coords.lat, lng: coords.lng, geocoded_address: addr })
                            .eq('id', m.id);
                        if (error) {
                            // Spalten fehlen noch (Migration nicht ausgeführt) → nur im Speicher weiterarbeiten
                            console.warn('Koordinaten konnten nicht gespeichert werden (supabase_add_machine_coords.sql schon ausgeführt?):', error.message);
                            coordsPersistable = false;
                        }
                    }
                }
            } catch (e) {
                console.warn('Geocoding fehlgeschlagen für', addr, e);
            }
            if (i < pending.length - 1) {
                await new Promise(r => setTimeout(r, NOMINATIM_DELAY_MS)); // Nominatim-Limit: 1 Anfrage/Sek.
            }
        }
    }

    function ensureModal() {
        if (document.getElementById('route-planner-modal')) return;
        const wrap = document.createElement('div');
        wrap.id = 'route-planner-modal';
        wrap.style.cssText = 'display:none; position:fixed; inset:0; z-index:100000; background:rgba(5,7,10,0.88); backdrop-filter:blur(12px); -webkit-backdrop-filter:blur(12px); align-items:center; justify-content:center;';
        wrap.innerHTML = `
            <div class="glass-card" style="width:92%; max-width:640px; max-height:90vh; overflow-y:auto; padding:1.75rem 2rem; border-radius:20px; border:1.5px solid rgba(255,255,255,0.12); background:rgba(15,23,42,0.92); backdrop-filter:blur(24px); -webkit-backdrop-filter:blur(24px); position:relative; box-shadow:0 30px 80px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.1);">
                <button onclick="window.closeRoutePlanner()" class="btn-close-modal" style="position:absolute; top:12px; right:16px;">&times;</button>
                <h2 style="margin:0 0 0.35rem 0; font-family:'Outfit',sans-serif; font-size:1.35rem; color:#fff;">Routenplaner — Umkreissuche</h2>
                <div id="rp-base-info" style="font-size:0.88rem; color:rgba(255,255,255,0.55); margin-bottom:1.25rem;"></div>

                <div style="display:flex; align-items:flex-end; gap:12px; flex-wrap:wrap; margin-bottom:1rem;">
                    <div>
                        <label style="font-size:0.78rem; color:rgba(255,255,255,0.5); font-weight:700; text-transform:uppercase; letter-spacing:0.5px; display:block; margin-bottom:6px;">Umkreis (km)</label>
                        <input type="number" id="rp-radius" class="glass-input" value="50" min="1" max="1000" style="width:110px; height:42px;">
                    </div>
                    <button class="btn-primary" style="height:42px; padding:0 22px; font-weight:700;" onclick="window.rpApplyRadius()">Suchen</button>
                    <div id="rp-status" style="font-size:0.82rem; color:rgba(255,255,255,0.45); flex:1;"></div>
                </div>

                <div id="rp-results" style="display:flex; flex-direction:column; gap:8px; margin-bottom:1.25rem;"></div>

                <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; border-top:1px solid rgba(255,255,255,0.08); padding-top:1.1rem; flex-wrap:wrap;">
                    <div id="rp-selected-count" style="font-size:0.85rem; color:rgba(255,255,255,0.55);"></div>
                    <div style="display:flex; gap:10px;">
                        <button class="btn-secondary" style="padding:10px 18px;" onclick="window.closeRoutePlanner()">Abbrechen</button>
                        <button class="btn-primary" style="padding:10px 22px; font-weight:700;" onclick="window.rpOpenGoogleRoute()">Route in Google Maps öffnen</button>
                    </div>
                </div>
            </div>`;
        document.body.appendChild(wrap);
    }

    window.closeRoutePlanner = function () {
        const modal = document.getElementById('route-planner-modal');
        if (modal) modal.style.display = 'none';
    };

    window.openRoutePlanner = async function (machineId) {
        const base = (window.machineList || []).find(m => String(m.id) === String(machineId));
        if (!base) return;
        if (!machineAddress(base)) {
            alert('Für diese Maschine ist keine Adresse hinterlegt.');
            return;
        }

        ensureModal();
        plannerBaseMachine = base;
        plannerCandidates = [];

        const modal = document.getElementById('route-planner-modal');
        modal.style.display = 'flex';
        document.getElementById('rp-base-info').innerHTML =
            `Ausgangspunkt: <strong style="color:#fff;">${esc(machineLabel(base))}</strong> — ${esc(machineAddress(base))}`;
        document.getElementById('rp-results').innerHTML = '';
        document.getElementById('rp-selected-count').textContent = '';

        const statusEl = document.getElementById('rp-status');
        statusEl.textContent = 'Adressen werden geortet…';

        await ensureCoords(msg => { statusEl.textContent = msg; });

        if (typeof plannerBaseMachine.lat !== 'number') {
            statusEl.textContent = '';
            document.getElementById('rp-results').innerHTML =
                '<div style="color:#f87171; font-size:0.88rem;">Die Adresse des Ausgangspunkts konnte nicht geortet werden. Bitte Adresse prüfen.</div>';
            return;
        }

        statusEl.textContent = coordsPersistable ? '' :
            'Hinweis: Koordinaten werden nur temporär gehalten — bitte supabase_add_machine_coords.sql in Supabase ausführen.';
        window.rpApplyRadius();
    };

    window.rpApplyRadius = function () {
        const base = plannerBaseMachine;
        if (!base || typeof base.lat !== 'number') return;

        const radius = Math.max(1, parseFloat(document.getElementById('rp-radius').value) || 50);
        const seenAddresses = new Set([machineAddress(base)]);

        plannerCandidates = (window.machineList || [])
            .filter(m => String(m.id) !== String(base.id) && typeof m.lat === 'number' && typeof m.lng === 'number')
            .map(m => ({
                machine: m,
                address: machineAddress(m),
                label: machineLabel(m),
                distanceKm: haversineKm(base.lat, base.lng, m.lat, m.lng)
            }))
            .filter(c => c.distanceKm <= radius)
            // Mehrere Maschinen am selben Standort nur einmal anfahren
            .filter(c => {
                if (!c.address || seenAddresses.has(c.address)) return false;
                seenAddresses.add(c.address);
                return true;
            })
            .sort((a, b) => a.distanceKm - b.distanceKm);

        const results = document.getElementById('rp-results');
        if (plannerCandidates.length === 0) {
            results.innerHTML = `<div style="color:rgba(255,255,255,0.5); font-size:0.88rem;">Keine weiteren Kunden im Umkreis von ${radius} km gefunden.</div>`;
        } else {
            results.innerHTML = plannerCandidates.map((c, i) => `
                <label style="display:flex; align-items:center; gap:12px; padding:10px 14px; border-radius:12px; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); cursor:pointer; transition:background 0.15s;"
                    onmouseover="this.style.background='rgba(255,255,255,0.07)'" onmouseout="this.style.background='rgba(255,255,255,0.04)'">
                    <input type="checkbox" class="rp-stop-cb" data-idx="${i}" onchange="window.rpUpdateCount()" style="cursor:pointer; flex-shrink:0;">
                    <div style="flex:1; min-width:0;">
                        <div style="color:#fff; font-weight:700; font-size:0.9rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(c.label)}</div>
                        <div style="color:rgba(255,255,255,0.45); font-size:0.78rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(c.address)}</div>
                    </div>
                    <span style="flex-shrink:0; font-weight:800; color:var(--color-primary-green); font-size:0.85rem;">${c.distanceKm.toFixed(1).replace('.', ',')} km</span>
                </label>`).join('');
        }
        window.rpUpdateCount();
    };

    window.rpUpdateCount = function () {
        const selected = document.querySelectorAll('.rp-stop-cb:checked').length;
        const el = document.getElementById('rp-selected-count');
        // Ausgangspunkt zählt immer als Stopp mit
        el.textContent = `${selected + 1} Stopp${selected ? 's' : ''} in der Route (max. ${MAX_STOPS})`;
        el.style.color = (selected + 1) > MAX_STOPS ? '#f87171' : 'rgba(255,255,255,0.55)';
    };

    window.rpOpenGoogleRoute = function () {
        const base = plannerBaseMachine;
        if (!base) return;

        const selected = Array.from(document.querySelectorAll('.rp-stop-cb:checked'))
            .map(cb => plannerCandidates[parseInt(cb.dataset.idx, 10)])
            .filter(Boolean);

        const stops = [
            { label: machineLabel(base), address: machineAddress(base), lat: base.lat, lng: base.lng },
            ...selected.map(c => ({ label: c.label, address: c.address, lat: c.machine.lat, lng: c.machine.lng }))
        ];

        if (stops.length > MAX_STOPS) {
            alert(`Google Maps unterstützt maximal ${MAX_STOPS} Stopps pro Route (Ausgangspunkt + ${MAX_STOPS - 1} weitere). Bitte Auswahl reduzieren.`);
            return;
        }

        // Reihenfolge optimieren: Nearest-Neighbor-Kette ab dem Ausgangspunkt,
        // damit die Tour nicht wild hin- und herspringt.
        const ordered = [stops[0]];
        const rest = stops.slice(1);
        while (rest.length > 0) {
            const last = ordered[ordered.length - 1];
            let bestIdx = 0;
            let bestDist = Infinity;
            rest.forEach((s, i) => {
                const d = haversineKm(last.lat, last.lng, s.lat, s.lng);
                if (d < bestDist) { bestDist = d; bestIdx = i; }
            });
            ordered.push(rest.splice(bestIdx, 1)[0]);
        }

        const toQuery = s => `${s.label}, ${s.address}`;
        const destination = ordered[ordered.length - 1];
        const waypoints = ordered.slice(0, -1);

        let url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(hqAddress())}` +
            `&destination=${encodeURIComponent(toQuery(destination))}`;
        if (waypoints.length > 0) {
            url += `&waypoints=${waypoints.map(s => encodeURIComponent(toQuery(s))).join('%7C')}`;
        }
        window.open(url, '_blank');
    };
})();
