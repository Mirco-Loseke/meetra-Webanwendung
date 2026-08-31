// ==========================================================
// Maschinen-Detailansicht: Modal, letzter Serviceeinsatz, Routen-Link
// ==========================================================
// Herausgeloest aus js/app-init.js (vormals Zeilen 1960-2602).
// Der Rumpf lief dort direkt im DOMContentLoaded-Handler und wird jetzt von
// dort per initMachineDetailsModal() an genau derselben Stelle aufgerufen.
// Die Zeilen sind unveraendert uebernommen; lokale Variablen sind damit
// lokal zu dieser Funktion geworden.
// ==========================================================

// Betriebsstunden stehen mal als Zahl, mal als Text in der Datenbank
// ("1234", "1.234", "1234,5", "1234 Std."). Für den Vergleich zweier
// Ablesungen braucht es eine echte Zahl — ohne diese Umwandlung würde
// "900" als größer gelten als "1.200" (Textvergleich).
window.stundenZahl = function (roh) {
    if (roh == null) return null;
    if (typeof roh === 'number') return isFinite(roh) ? roh : null;

    let s = String(roh).trim().replace(/[^\d.,-]/g, ''); // Einheiten weg
    if (!s) return null;

    const hatPunkt = s.indexOf('.') !== -1;
    const hatKomma = s.indexOf(',') !== -1;
    if (hatPunkt && hatKomma) {
        // Beides: das hintere Zeichen ist das Dezimaltrennzeichen.
        s = s.lastIndexOf(',') > s.lastIndexOf('.')
            ? s.replace(/\./g, '').replace(',', '.')
            : s.replace(/,/g, '');
    } else if (hatKomma) {
        s = s.replace(',', '.');
    } else if (hatPunkt) {
        // Nur Punkte: "1.234" ist der Tausenderpunkt, "1234.5" die Nachkommastelle.
        const teile = s.split('.');
        const letzter = teile[teile.length - 1];
        if (teile.length > 2 || letzter.length === 3) s = teile.join('');
    }

    const n = parseFloat(s);
    return isFinite(n) ? n : null;
};
const stundenZahl = window.stundenZahl;

window.initMachineDetailsModal = function () {
            // Baut eine Google-Maps-Routenplanung (Start: meetra-Firmenadresse) statt nur einer Orts-Suche.
            window.buildGoogleRouteUrl = function (destinationQuery) {
                let hq = null;
                try { hq = JSON.parse(localStorage.getItem('meetra_company_hq') || 'null'); } catch (e) {}
                const street = hq?.street || 'Am Alten Bahnhof 6';
                const zipCity = [hq?.zip || '38122', hq?.city || 'Braunschweig'].filter(Boolean).join(' ');
                const country = hq?.country || 'Deutschland';
                const hqName = hq?.name || 'Meetra GmbH';
                const origin = [hqName, street, zipCity, country].filter(Boolean).join(', ');
                return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destinationQuery)}`;
            };

            window.openMachineDetails = async function (id) {
                const machines = window.machineList || [];
                const machine = machines.find(m => m.id == id);
                if (!machine) return;
                
                // Frueher der lokale Wrapper aus app-init.js; der delegierte
                // ohnehin nur an window.updateLastViewed.
                if (typeof window.updateLastViewed === 'function') {
                    window.updateLastViewed(id);
                }

                const modal = document.getElementById('machine-details-modal');
                if (!modal) {
                    window.showToast('Fehler: Detail-Modal nicht gefunden!');
                    return;
                }

                modal.classList.remove('hidden');
                modal.style.display = 'flex';
                requestAnimationFrame(() => {
                    modal.classList.add('show');
                });

                let catColor = '#10b981';
                let catName = 'Unkategorisiert';
                if (window.categoryList && machine.category_id) {
                    const cat = window.categoryList.find(c => c.id == machine.category_id);
                    if (cat) {
                        catColor = cat.color || '#10b981';
                        catName = cat.name;
                    }
                }

                const accentEl = document.getElementById('machine-details-accent');
                if (accentEl) accentEl.style.background = catColor;

                const catBadge = document.getElementById('machine-details-category-badge');
                if (catBadge) {
                    catBadge.textContent = catName;
                    catBadge.style.background = `${catColor}22`;
                    catBadge.style.borderColor = `${catColor}66`;
                    catBadge.style.color = catColor;
                }

                const statusBadge = document.getElementById('machine-details-status-badge');
                const lastMaintEl = document.getElementById('machine-details-last-maint');
                const nextMaintEl = document.getElementById('machine-details-next-maint');
                const nextMaintIconBg = document.getElementById('machine-details-next-maint-icon-bg');

                const lastMaintStr = machine.last_maintenance ? new Date(machine.last_maintenance).toLocaleDateString('de-DE') : '/';
                const nextMaintDate = machine.next_maintenance ? new Date(machine.next_maintenance) : null;
                const nextMaintStr = nextMaintDate ? nextMaintDate.toLocaleDateString('de-DE') : '/';

                let statusColor = '#10b981';
                let statusText = 'Aktuell';
                let nextMaintColor = '#10b981';

                if (nextMaintDate) {
                    const now = new Date();
                    const diffDays = Math.ceil((nextMaintDate - now) / (1000 * 60 * 60 * 24));
                    if (diffDays < 0) {
                        statusColor = '#ef4444';
                        statusText = 'Überfällig';
                        nextMaintColor = '#ef4444';
                    } else if (diffDays <= 30) {
                        statusColor = '#f59e0b';
                        statusText = 'Bald fällig';
                        nextMaintColor = '#f59e0b';
                    }
                }

                if (machine.is_in_workshop === true) {
                    statusColor = '#f59e0b';
                    statusText = 'IN WERKSTATT';
                    nextMaintColor = '#f59e0b';
                }

                if (statusBadge) {
                    statusBadge.textContent = statusText;
                    statusBadge.style.background = `${statusColor}22`;
                    statusBadge.style.borderColor = `${statusColor}66`;
                    statusBadge.style.color = statusColor;
                }

                if (lastMaintEl) lastMaintEl.textContent = lastMaintStr;
                const lastMaintNoteEl = document.getElementById('machine-details-last-maint-note');
                if (lastMaintNoteEl) {
                    const isManual = machine.last_maintenance_source === 'manual';
                    const note = machine.last_maintenance_note || '';
                    lastMaintNoteEl.textContent = isManual ? (note || 'Manueller Eintrag') : '';
                }
                if (nextMaintEl) {
                    nextMaintEl.textContent = nextMaintStr;
                    nextMaintEl.style.color = nextMaintColor;
                }
                if (nextMaintIconBg) {
                    nextMaintIconBg.style.background = `${nextMaintColor}1a`;
                    nextMaintIconBg.style.color = nextMaintColor;
                }

                const maintenanceCard = document.getElementById('machine-details-maintenance-card');
                if (maintenanceCard) {
                    maintenanceCard.style.display = (machine.last_maintenance || machine.next_maintenance) ? 'flex' : 'none';
                }

                const titleEl = document.getElementById('machine-details-title');
                if (titleEl) {
                    titleEl.textContent = `${machine.manufacturer || ''} ${machine.name || ''}`.trim();
                    titleEl.style.color = catColor;
                }

                const subtitleEl = document.getElementById('machine-details-subtitle');
                if (subtitleEl) {
                    const serialStr = machine.serial ? `#${machine.serial}` : '/';
                    const yearStr = machine.year ? machine.year : '/';
                    subtitleEl.textContent = `Seriennummer: ${serialStr} | Baujahr: ${yearStr}`;
                }

                const motorLineEl = document.getElementById('machine-details-motor-line');
                if (motorLineEl) {
                    if (machine.motor_type || machine.motor_serial || machine.power) {
                        const motorTypeStr = machine.motor_type || '/';
                        const motorSerialStr = machine.motor_serial ? `#${machine.motor_serial}` : '/';
                        let text = `Motortyp: ${motorTypeStr} | Motornummer: ${motorSerialStr}`;
                        if (machine.power) text += ` | Leistung: ${machine.power}`;
                        motorLineEl.textContent = text;
                        motorLineEl.style.display = 'block';
                    } else {
                        motorLineEl.style.display = 'none';
                    }
                }

                const imageContainer = document.getElementById('machine-details-image-container');
                if (imageContainer) {
                    if (machine.image_url) {
                        imageContainer.innerHTML = `<img src="${machine.image_url}" alt="${machine.name}" style="width: 100%; max-height: 250px; object-fit: contain; display: block;">`;
                    } else {
                        imageContainer.innerHTML = `
                            <div style="color: rgba(255,255,255,0.15); display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 3rem; width: 100%;">
                                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: 12px; opacity: 0.3;">
                                    <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
                                    <circle cx="9" cy="9" r="2"/>
                                    <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
                                </svg>
                                <span style="font-size: 0.9rem; font-weight: 600;">Kein Bild vorhanden</span>
                            </div>`;
                    }
                }

                const locAddressEl = document.getElementById('machine-details-loc-address');
                const locMapsLink = document.getElementById('machine-details-loc-maps-link');
                
                // Check if machine is in workshop (Meetra HQ)
                const isInWorkshop = machine.is_in_workshop === true || machine.in_workshop === true;

                if (isInWorkshop) {
                    let hq = null;
                    const cached = localStorage.getItem('meetra_company_hq');
                    if (cached) {
                        try { hq = JSON.parse(cached); } catch(e){}
                    }
                    
                    const renderHqAddress = (hqObj) => {
                        const street = hqObj?.street || 'Am Alten Bahnhof 6';
                        const zipCity = [hqObj?.zip || '38122', hqObj?.city || 'Braunschweig'].filter(Boolean).join(' ');
                        const country = hqObj?.country || 'Deutschland';
                        const hqName = hqObj?.name || 'Meetra GmbH';
                        
                        locAddressEl.innerHTML = `<strong>${hqName}</strong><br>${street}<br>${zipCity}<br>${country}`;
                        const mapQuery = [hqName, street, zipCity, country].filter(Boolean).join(', ');
                        locMapsLink.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`;
                        locMapsLink.style.display = 'inline-flex';
                    };

                    if (hq) {
                        renderHqAddress(hq);
                    } else {
                        renderHqAddress(null);
                        if (window.supabaseClient) {
                            window.supabaseClient
                                .from('app_settings')
                                .select('value')
                                .eq('key', 'company_hq')
                                .maybeSingle()
                                .then(({ data, error }) => {
                                    if (data && data.value && !error) {
                                        localStorage.setItem('meetra_company_hq', JSON.stringify(data.value));
                                        renderHqAddress(data.value);
                                    }
                                });
                        }
                    }
                } else {
                    const hasRealLoc = !!(machine.location_street?.trim() || machine.location_city?.trim() || machine.location_zip?.trim());
                    const _locDflt = (c) => !c || ['de', 'deutschland', 'germany'].includes(c.trim().toLowerCase());
                    if (hasRealLoc) {
                        const locCompanyRaw = machine.location_company || machine.company;
                        const locCompanyName = locCompanyRaw ? `<strong>${locCompanyRaw}</strong>` : '';
                        const locParts = [
                            locCompanyName,
                            machine.location_street,
                            [machine.location_zip, machine.location_city].filter(Boolean).join(' '),
                            !_locDflt(machine.location_country) ? machine.location_country : ''
                        ].filter(Boolean);
                        const rawPartsForMap = [
                            machine.location_street,
                            [machine.location_zip, machine.location_city].filter(Boolean).join(' '),
                            machine.location_country
                        ].filter(Boolean);
                        const mapQuery = [locCompanyRaw, ...rawPartsForMap].filter(Boolean).join(', ');
                        locAddressEl.innerHTML = locParts.join('<br>');
                        locAddressEl.style.textAlign = '';
                        locAddressEl.style.paddingLeft = '20px';
                        locMapsLink.href = window.buildGoogleRouteUrl(mapQuery);
                        locMapsLink.style.display = 'inline-flex';
                    } else if (machine.location && !_locDflt(machine.location.trim())) {
                        const locCompanyRaw = machine.location_company || machine.company;
                        locAddressEl.innerHTML = (locCompanyRaw ? `<strong>${locCompanyRaw}</strong><br>` : '') + machine.location;
                        const mapQuery = [locCompanyRaw, machine.location].filter(Boolean).join(', ');
                        locMapsLink.href = window.buildGoogleRouteUrl(mapQuery);
                        locMapsLink.style.display = 'inline-flex';
                    } else {
                        locAddressEl.textContent = '/';
                        locAddressEl.style.textAlign = 'center';
                        locAddressEl.style.paddingLeft = '0';
                        locMapsLink.style.display = 'none';
                    }
                }

                const editBtn = document.getElementById('machine-details-edit-btn');
                if (editBtn) {
                    editBtn.onclick = () => {
                        closeMachineDetailsModal();
                        window.openEditStammdaten(machine.id);
                    };
                }

                // Verknüpfte Maschinen & Zusatzausrüstung
                const normMachineIds = (src) => {
                    if (Array.isArray(src)) return src.filter(Boolean).map(String);
                    if (typeof src === 'string' && src.trim()) {
                        try { const p = JSON.parse(src); if (Array.isArray(p)) return p.filter(Boolean).map(String); } catch(e) {}
                        return src.split(',').map(s => s.trim()).filter(Boolean);
                    }
                    return [];
                };
                const extractMetaVal = (files, key) => {
                    if (!Array.isArray(files)) return null;
                    const e = files.find(f => f && f.type === 'meta' && f.key === key && f.property != null);
                    return e ? e.property : null;
                };
                const normalizeEquipList = (src) => {
                    if (!src) return [];
                    let items = Array.isArray(src) ? src : (() => { try { const p = JSON.parse(src); return Array.isArray(p) ? p : []; } catch(e) { return []; } })();
                    const seen = new Map();
                    return items.filter(Boolean).map(eq => ({
                        serial: eq.serial ? String(eq.serial).trim() : '',
                        type: eq.type ? String(eq.type).trim() : '',
                        designation: (eq.designation || eq.name) ? String(eq.designation || eq.name).trim() : '',
                        year: eq.year ? String(eq.year).trim() : ''
                    })).filter(eq => {
                        const k = `${eq.type}|${eq.serial}|${eq.designation}`;
                        if (seen.has(k)) return false;
                        seen.set(k, true);
                        return eq.serial || eq.type || eq.designation;
                    });
                };

                const relatedIds = Array.from(new Set([
                    ...normMachineIds(machine.related_machine_ids),
                    ...normMachineIds(extractMetaVal(machine.files, 'related_machine_ids'))
                ]));
                const additionalEquip = [
                    ...normalizeEquipList(machine.additional_equipment),
                    ...normalizeEquipList(extractMetaVal(machine.files, 'additional_equipment'))
                ];
                const equipmentCatalogItems = (Array.isArray(machine.equipment_category_ids) ? machine.equipment_category_ids : [])
                    .map(id => (window.categoryList || []).find(c => c.type === 'equipment' && String(c.id) === String(id)))
                    .filter(Boolean);

                const relatedCard = document.getElementById('machine-details-related-card');
                const relatedList = document.getElementById('machine-details-related-list');
                const equipCard = document.getElementById('machine-details-equipment-card');
                const equipList = document.getElementById('machine-details-equipment-list');

                const hasRelated = relatedIds.length > 0;
                const hasEquip = additionalEquip.length > 0 || equipmentCatalogItems.length > 0;

                if (relatedCard) relatedCard.style.display = hasRelated ? 'flex' : 'none';
                if (equipCard) equipCard.style.display = hasEquip ? 'flex' : 'none';

                if (relatedList) {
                    if (hasRelated) {
                        const allMachinesRef = window.machineList || [];
                        relatedList.innerHTML = relatedIds.map(rid => {
                            const rm = allMachinesRef.find(m => String(m.id) === rid);
                            if (!rm) return `<div style="padding: 8px 0; font-size: 0.9rem; color: rgba(255,255,255,0.35);">Maschine #${rid}</div>`;
                            const sub = [rm.serial ? `SN: ${rm.serial}` : '', rm.year ? rm.year : ''].filter(Boolean).join(' · ');
                            return `<div onclick="closeMachineDetailsModal(); window.openMachineDetails(${rm.id})"
                                         style="padding: 10px 12px; background: rgba(59,130,246,0.08); border: 1px solid rgba(59,130,246,0.2); border-radius: 10px; cursor: pointer; transition: background 0.2s;"
                                         onmouseover="this.style.background='rgba(59,130,246,0.18)'"
                                         onmouseout="this.style.background='rgba(59,130,246,0.08)'">
                                        <div style="font-size: 0.95rem; color: white; font-weight: 700; line-height: 1.3;">${rm.manufacturer || ''} ${rm.name || ''}</div>
                                        ${sub ? `<div style="font-size: 0.78rem; color: rgba(255,255,255,0.4); font-weight: 400; margin-top: 3px;">${sub}</div>` : ''}
                                    </div>`;
                        }).join('');
                    } else {
                        relatedList.innerHTML = '';
                    }
                }

                if (equipList) {
                    if (hasEquip) {
                        const escEquip = (val) => String(val || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                        const catalogEntries = equipmentCatalogItems.map(cat => {
                            return `<div style="padding: 10px 12px; background: rgba(16,185,129,0.08); border: 1px solid rgba(16,185,129,0.25); border-radius: 10px;">
                                        <div style="font-size: 0.95rem; color: white; font-weight: 700; line-height: 1.3;">${escEquip(cat.name)}</div>
                                        ${cat.remark ? `<div style="font-size: 0.78rem; color: rgba(255,255,255,0.4); font-weight: 400; margin-top: 3px;">${escEquip(cat.remark)}</div>` : ''}
                                    </div>`;
                        });
                        const freeEntries = additionalEquip.map(eq => {
                            const title = [eq.designation, eq.type].filter(Boolean).join(' · ') || 'Unbekannt';
                            const sub = [eq.serial ? `SN: ${eq.serial}` : '', eq.year ? eq.year : ''].filter(Boolean).join(' · ');
                            return `<div style="padding: 10px 12px; background: rgba(139,92,246,0.08); border: 1px solid rgba(139,92,246,0.2); border-radius: 10px;">
                                        <div style="font-size: 0.95rem; color: white; font-weight: 700; line-height: 1.3;">${escEquip(title)}</div>
                                        ${sub ? `<div style="font-size: 0.78rem; color: rgba(255,255,255,0.4); font-weight: 400; margin-top: 3px;">${escEquip(sub)}</div>` : ''}
                                    </div>`;
                        });
                        equipList.innerHTML = [...catalogEntries, ...freeEntries].join('');
                    } else {
                        equipList.innerHTML = '';
                    }
                }

                const custAddressEl = document.getElementById('machine-details-cust-address');
                const custMapsLink = document.getElementById('machine-details-cust-maps-link');
                const _isDfltCountry = (c) => !c || ['de', 'deutschland', 'germany'].includes(c.trim().toLowerCase());

                // Fallback-Anzeige der Betreiberadresse direkt aus den Maschinenfeldern
                // (operator_street/zip/city/country) — greift, wenn kein Sage-Kunde verknüpft ist
                // oder der Kundenabruf fehlschlägt, damit eine über die Sage-Suche korrekt
                // hinterlegte Adresse trotzdem vollständig angezeigt wird, statt nur Firma+Kdnr.
                function renderOperatorAddressFallback(m, addressEl, mapsLink) {
                    const kdnrLine = m.customer_number ? `Kundennummer: ${m.customer_number}` : '';
                    const parts = [
                        kdnrLine,
                        m.company ? `<strong>${m.company}</strong>` : '',
                        m.operator_street,
                        [m.operator_zip, m.operator_city].filter(Boolean).join(' '),
                        !_isDfltCountry(m.operator_country) ? m.operator_country : ''
                    ].filter(Boolean);

                    if (parts.length > 0) {
                        addressEl.innerHTML = parts.join('<br>');
                        const mapParts = [m.operator_street, [m.operator_zip, m.operator_city].filter(Boolean).join(' '), m.operator_country].filter(Boolean);
                        const mapQuery = [m.company, ...mapParts].filter(Boolean).join(', ');
                        mapsLink.href = window.buildGoogleRouteUrl(mapQuery);
                        mapsLink.style.display = 'inline-flex';
                    } else {
                        addressEl.textContent = 'Kein Kunde verknüpft';
                        mapsLink.style.display = 'none';
                    }
                }

                // Leerer Zustand "Letzter Service": nur ein großes "/" statt mehrerer Text-Zeilen.
                function renderEmptyLastService(titleEl, dateEl, techsEl, descEl) {
                    titleEl.style.display = '';
                    titleEl.style.textAlign = 'center';
                    titleEl.style.fontSize = '1.8rem';
                    titleEl.textContent = '/';
                    dateEl.textContent = '';
                    // Only hide the row — its "Techniker:" label + avatar-list child spans are
                    // static markup, clearing textContent here would delete them permanently.
                    techsEl.style.display = 'none';
                    descEl.textContent = '';
                    const descWrapperEl = document.getElementById('machine-details-last-service-desc-wrapper');
                    if (descWrapperEl) descWrapperEl.style.display = 'none';
                    const orderEl = document.getElementById('machine-details-last-service-order');
                    if (orderEl) orderEl.style.display = 'none';
                }

                const initialKdnrLine = machine.customer_number ? `Kundennummer: ${machine.customer_number}` : '';
                const initialCustParts = [
                    initialKdnrLine,
                    machine.company ? `<strong>${machine.company}</strong>` : '',
                    machine.operator_street,
                    [machine.operator_zip, machine.operator_city].filter(Boolean).join(' '),
                    !_isDfltCountry(machine.operator_country) ? machine.operator_country : ''
                ].filter(Boolean);

                if (initialCustParts.length > 0) {
                    custAddressEl.innerHTML = initialCustParts.join('<br>');
                    const rawCustPartsForMap = [
                        machine.operator_street,
                        [machine.operator_zip, machine.operator_city].filter(Boolean).join(' '),
                        machine.operator_country
                    ].filter(Boolean);
                    const mapQuery = [machine.company, ...rawCustPartsForMap].filter(Boolean).join(', ');
                    custMapsLink.href = window.buildGoogleRouteUrl(mapQuery);
                    custMapsLink.style.display = 'inline-flex';
                } else {
                    custAddressEl.textContent = 'Kein Kunde verknüpft';
                    custMapsLink.style.display = 'none';
                }

                // Umkreis-Routenplaner: nur anbieten, wenn die Maschine eine Adresse hat
                const radiusRouteBtn = document.getElementById('machine-details-radius-route-btn');
                if (radiusRouteBtn) {
                    const hasAddress = !!(machine.location_street || machine.location_city || machine.operator_street || machine.operator_city);
                    radiusRouteBtn.style.display = hasAddress ? 'inline-flex' : 'none';
                    radiusRouteBtn.onclick = () => window.openRoutePlanner(machine.id);
                }

                // Contact persons on machine details
                const cpWrapper = document.getElementById('machine-details-contact-persons-wrapper');
                const cpList = document.getElementById('machine-details-contact-persons');
                const cps = machine.contact_persons || [];
                if (cpWrapper && cpList) {
                    if (cps.length > 0) {
                        cpList.innerHTML = cps.map(p => `
                            <div style="padding:8px 12px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;">
                                <div style="font-weight:700;color:white;font-size:0.9rem;">${p.name || '—'}</div>
                                ${p.position ? `<div style="font-size:0.75rem;color:rgba(255,255,255,0.45);margin-top:2px;">${p.position}</div>` : ''}
                                ${p.phone ? `<a href="tel:${p.phone}" style="font-size:0.82rem;color:var(--color-primary-green);margin-top:4px;display:block;text-decoration:none;">${p.phone}</a>` : ''}
                            </div>`).join('');
                        cpWrapper.style.display = 'block';
                    } else {
                        cpWrapper.style.display = 'none';
                    }
                }

                const hoursEl = document.getElementById('machine-details-hours');
                const hoursDateEl = document.getElementById('machine-details-hours-date');
                hoursEl.textContent = 'Lade...';
                hoursDateEl.textContent = 'Letzte Ablesung: ...';

                const serviceTitleEl = document.getElementById('machine-details-last-service-title');
                const serviceDateEl = document.getElementById('machine-details-last-service-date');
                const serviceTechsEl = document.getElementById('machine-details-last-service-techs');
                const serviceDescEl = document.getElementById('machine-details-last-service-desc');
                
                serviceTitleEl.style.display = '';
                serviceTitleEl.style.textAlign = '';
                serviceTitleEl.style.fontSize = '';
                serviceTitleEl.textContent = 'Suche nach Einträgen...';
                serviceDateEl.textContent = '';
                serviceTechsEl.style.display = 'flex';
                const serviceTechsListElReset = document.getElementById('machine-details-last-service-techs-list');
                if (serviceTechsListElReset) serviceTechsListElReset.textContent = '/';
                const serviceDescWrapperElReset = document.getElementById('machine-details-last-service-desc-wrapper');
                if (serviceDescWrapperElReset) serviceDescWrapperElReset.style.display = '';
                serviceDescEl.textContent = 'Wird geladen...';
                const serviceOrderElReset = document.getElementById('machine-details-last-service-order');
                if (serviceOrderElReset) serviceOrderElReset.style.display = 'none';

                if (machine.customer_id) {
                    try {
                        const { data: custData, error: custErr } = await window.supabaseClient
                            .from('customers')
                            .select('*')
                            .eq('id', machine.customer_id)
                            .maybeSingle();

                        if (custData && !custErr) {
                            const kdnr = machine.customer_number || custData.customer_number || '';
                            const kdnrLine = kdnr ? `Kundennummer: ${kdnr}` : '';

                            // Manuell bearbeitete Betreiber-/Rechnungsadresse der Maschine hat Vorrang vor den Sage-Stammdaten
                            const custName = machine.company || custData.name;
                            const custStreet = machine.operator_street || custData.street;
                            const custZipCity = [machine.operator_zip || custData.zip_code, machine.operator_city || custData.city].filter(Boolean).join(' ');
                            const custCountry = machine.operator_country || custData.country;

                            const custAddrParts = [
                                kdnrLine,
                                `<strong>${custName}</strong>`,
                                custStreet,
                                custZipCity,
                                !_isDfltCountry(custCountry) ? custCountry : ''
                            ].filter(Boolean);

                            custAddressEl.innerHTML = custAddrParts.join('<br>');

                            const mapQueryParts = [
                                custStreet,
                                custZipCity,
                                custCountry
                            ].filter(Boolean);
                            const fullCustAddrForMap = [custName, ...mapQueryParts].join(', ');
                            custMapsLink.href = window.buildGoogleRouteUrl(fullCustAddrForMap);
                            custMapsLink.style.display = 'inline-flex';

                            if (!isInWorkshop) {
                                const hasRealLocAsync = !!(machine.location_street?.trim() || machine.location_city?.trim() || machine.location_zip?.trim());
                                if (hasRealLocAsync) {
                                    const locCompanyRawAsync = machine.location_company || custData.name;
                                    const asyncLocParts = [
                                        locCompanyRawAsync ? `<strong>${locCompanyRawAsync}</strong>` : '',
                                        machine.location_street,
                                        [machine.location_zip, machine.location_city].filter(Boolean).join(' '),
                                        !_isDfltCountry(machine.location_country) ? machine.location_country : ''
                                    ].filter(Boolean);
                                    locAddressEl.innerHTML = asyncLocParts.join('<br>');
                                    const rawLocPartsForMap = [
                                        machine.location_street,
                                        [machine.location_zip, machine.location_city].filter(Boolean).join(' '),
                                        machine.location_country
                                    ].filter(Boolean);
                                    const locMapQuery = [locCompanyRawAsync, ...rawLocPartsForMap].filter(Boolean).join(', ');
                                    locMapsLink.href = window.buildGoogleRouteUrl(locMapQuery);
                                    locMapsLink.style.display = 'inline-flex';
                                } else if (machine.location && !_isDfltCountry(machine.location.trim())) {
                                    const locCompanyRawAsync = machine.location_company || custData.name;
                                    locAddressEl.innerHTML = (locCompanyRawAsync ? `<strong>${locCompanyRawAsync}</strong><br>` : '') + machine.location;
                                    locMapsLink.style.display = 'none';
                                } else {
                                    locAddressEl.textContent = '/';
                                    locAddressEl.style.textAlign = 'center';
                                    locAddressEl.style.paddingLeft = '0';
                                    locMapsLink.style.display = 'none';
                                }
                            }
                        } else {
                            renderOperatorAddressFallback(machine, custAddressEl, custMapsLink);
                        }
                    } catch (err) {
                        console.error('Error loading customer details for machine view:', err);
                        renderOperatorAddressFallback(machine, custAddressEl, custMapsLink);
                    }
                } else {
                    renderOperatorAddressFallback(machine, custAddressEl, custMapsLink);
                }

                try {
                    // Nicht nur die letzte Ablesung holen, sondern alle: bei
                    // älteren Maschinen mit analogem Zähler kommt es vor, dass
                    // der Zähler stehenbleibt und getauscht wird — danach zählt
                    // er wieder bei null. Die neueste Ablesung allein sieht dann
                    // so aus, als hätte die Maschine kaum gelaufen. Deshalb wird
                    // zusätzlich der höchste je abgelesene Stand gesucht.
                    const [opRes, manualHoursRes] = await Promise.all([
                        window.supabaseClient
                            .from('service_entries')
                            .select('operating_hours, date')
                            .eq('machine_id', id)
                            .not('operating_hours', 'is', null)
                            .neq('operating_hours', '')
                            .order('date', { ascending: false })
                            .limit(500),
                        window.supabaseClient
                            .from('manual_history_entries')
                            .select('content, created_at')
                            .eq('machine_id', id)
                            .eq('type', 'hours')
                            .order('created_at', { ascending: false })
                            .limit(500)
                    ]);

                    const ablesungen = []
                        .concat((opRes.data || []).map(r => ({ roh: r.operating_hours, date: new Date(r.date) })))
                        .concat((manualHoursRes.data || []).map(r => ({ roh: r.content, date: new Date(r.created_at) })))
                        .map(a => ({ roh: a.roh, date: a.date, zahl: stundenZahl(a.roh) }))
                        .filter(a => a.zahl !== null && !isNaN(a.date.getTime()))
                        .sort((a, b) => b.date - a.date); // neueste zuerst

                    const latestHours = ablesungen[0] || null;

                    if (latestHours) {
                        // Höchster Stand vor der letzten Ablesung. Nur wenn der
                        // größer ist, hat der Zähler tatsächlich neu angefangen.
                        let hoechsterFrueher = null;
                        ablesungen.slice(1).forEach(a => {
                            if (!hoechsterFrueher || a.zahl > hoechsterFrueher.zahl) hoechsterFrueher = a;
                        });

                        const zaehlertausch = hoechsterFrueher && hoechsterFrueher.zahl > latestHours.zahl;

                        if (zaehlertausch) {
                            // Groß steht die Gesamtleistung der Maschine, in
                            // Klammern der Stand des heutigen Zählers — sonst
                            // wirkt die Maschine jünger, als sie ist.
                            const summe = hoechsterFrueher.zahl + latestHours.zahl;
                            hoursEl.innerHTML =
                                `${summe.toLocaleString('de-DE')} Std. ` +
                                `<span style="font-size:0.95rem; font-weight:700; color:rgba(255,255,255,0.5);">` +
                                `(${latestHours.roh} Std.)</span>`;
                            hoursDateEl.innerHTML =
                                `Letzte Ablesung: ${latestHours.date.toLocaleDateString('de-DE')}` +
                                `<div style="margin-top:4px; color:#fbbf24; font-weight:700;">` +
                                `Zähler neu ab 0 — vorher ${hoechsterFrueher.roh} Std. ` +
                                `(${hoechsterFrueher.date.toLocaleDateString('de-DE')})</div>`;
                        } else {
                            hoursEl.textContent = `${latestHours.roh} Std.`;
                            hoursDateEl.textContent = `Letzte Ablesung: ${latestHours.date.toLocaleDateString('de-DE')}`;
                        }
                    } else {
                        hoursEl.textContent = '0 Std.';
                        hoursDateEl.textContent = 'Keine Betriebsstunden erfasst';
                    }
                } catch (err) {
                    console.error('Error loading operating hours:', err);
                    hoursEl.textContent = '/';
                    hoursDateEl.textContent = 'Fehler beim Laden';
                }

                try {
                    const { data: serviceData, error: serviceErr } = await window.supabaseClient
                        .from('service_entries')
                        .select('*')
                        .eq('machine_id', id)
                        .order('date', { ascending: false })
                        .limit(1);

                    if (serviceData && serviceData.length > 0 && !serviceErr) {
                        const entry = serviceData[0];
                        // Titel-Text nicht mehr anzeigen — die Auftrag-Badge daneben reicht,
                        // "Servicebericht" stand ohnehin schon redundant über der Sektion.
                        serviceTitleEl.style.display = 'none';
                        const sDate = entry.date ? new Date(entry.date).toLocaleDateString('de-DE') : '/';
                        serviceDateEl.textContent = sDate;

                        // Werkstatt-/Auftragsnummer: wird live aus der DB nachgeladen, sobald das
                        // Fenster erneut geöffnet wird — trägt man sie also erst nachträglich in
                        // den Servicebericht ein, taucht sie beim nächsten Öffnen automatisch hier auf.
                        const orderEl = document.getElementById('machine-details-last-service-order');
                        if (orderEl) {
                            if (entry.workshop_order_number) {
                                orderEl.textContent = `Auftrag ${entry.workshop_order_number}`;
                                orderEl.style.display = 'flex';
                            } else {
                                orderEl.style.display = 'none';
                            }
                        }

                        serviceTechsEl.style.display = 'flex';
                        const serviceTechsListEl = document.getElementById('machine-details-last-service-techs-list');
                        if (serviceTechsListEl) {
                            if (entry.technicians && Array.isArray(entry.technicians) && entry.technicians.length > 0) {
                                serviceTechsListEl.innerHTML = entry.technicians.map(tid => {
                                    const u = (window.userList || []).find(user => user.id == tid);
                                    if (!u) return '';
                                    const initials = u.initials || u.name.substring(0, 2).toUpperCase();
                                    const color = u.color || '#666';
                                    return `<div title="${u.name}" style="width:22px; height:22px; border-radius:50%; background:${color}; display:flex; align-items:center; justify-content:center; font-size:0.65rem; font-weight:800; color:#fff; flex-shrink:0;">${initials}</div>`;
                                }).join('') || '/';
                            } else {
                                serviceTechsListEl.textContent = '/';
                            }
                        }

                        const serviceDescWrapperEl = document.getElementById('machine-details-last-service-desc-wrapper');
                        if (serviceDescWrapperEl) serviceDescWrapperEl.style.display = '';
                        serviceDescEl.textContent = entry.description || 'Keine Beschreibung hinterlegt.';
                    } else {
                        renderEmptyLastService(serviceTitleEl, serviceDateEl, serviceTechsEl, serviceDescEl);
                    }
                } catch (err) {
                    console.error('Error loading latest service entry:', err);
                    renderEmptyLastService(serviceTitleEl, serviceDateEl, serviceTechsEl, serviceDescEl);
                }
            };
};
