// ==========================================================
// Servicebericht-Formular: Maschinenauswahl, Ansprechpartner, Techniker, Speichern
// ==========================================================
// Ausgelagert aus index.html (vormals Zeilen 10488-11520).
// Wird in index.html an unveraenderter Stelle per <script src> geladen;
// die Reihenfolge der Skripte entspricht der fruaeheren Reihenfolge im
// Inline-Block und darf nicht vertauscht werden.
// ==========================================================
        // ==========================================
        // SERVICEEINSÄTZE LOGIC
        // ==========================================
        window.openReportTypeModal = function () {
            const modal = document.getElementById('report-type-modal');
            if (modal) {
                modal.classList.remove('hidden');
                modal.style.display = 'flex';
                requestAnimationFrame(() => {
                    modal.classList.add('show');
                });
            }
        };

        window.closeReportTypeModal = function () {
            const modal = document.getElementById('report-type-modal');
            if (modal) {
                modal.classList.remove('show');
                setTimeout(() => {
                    modal.classList.add('hidden');
                    modal.style.display = 'none';
                }, 300);
            }
        };


        let currentEditingServiceId = null;



        window.closeServiceberichtModal = function (force = false) {
            if (!force && serviceberichtIsDirty) {
                window.showUnsavedDialog({
                    overlayId: 'servicebericht-confirm-close-overlay',
                    onDiscard: () => window.closeServiceberichtModal(true),
                    onSave: () => window.saveAndCloseServicebericht()
                });
                return;
            }
            serviceberichtIsDirty = false;
            if (currentEditingServiceId) {
                window.releaseServiceberichtLock(currentEditingServiceId);
            }
            const modal = document.getElementById('servicebericht-modal');
            if (modal) {
                modal.removeEventListener('input', onServiceberichtFieldChange);
                modal.removeEventListener('change', onServiceberichtFieldChange);
                modal.classList.remove('show');
                setTimeout(() => {
                    modal.classList.add('hidden');
                    modal.style.display = 'none';
                }, 300);
            }
        };

        // Machine Selection Logic
        function renderServiceMachineList(filter = '') {
            console.log('Rendering Service Machine List. Filter:', filter);
            const list = document.getElementById('service-machine-list');
            if (!list) { console.error('Service machine list element not found'); return; }

            // Ensure data availability
            const machines = window.machineList || machineList || [];
            const categories = window.categoryList || categoryList || [];


            const filtered = machines.filter(m => {
                // Resolve Category Name
                const cat = categories.find(c => c.id === m.category_id);
                const catName = cat ? cat.name : '';

                const fullSearchString = `${m.manufacturer || ''} ${m.name || ''} ${m.serial || ''} ${m.year || ''}
        ${catName} `.toLowerCase();
                return fullSearchString.includes(filter.toLowerCase());
            });

            if (filtered.length === 0) {
                list.innerHTML = `<div class="empty-hint"
                    style="text-align: center; padding: 2rem; color: rgba(255,255,255,0.3);">Keine Maschinen gefunden.</div>`;
                return;
            }

            list.innerHTML = filtered.map(m => {
                const cat = categories.find(c => c.id === m.category_id);
                const catName = cat ? cat.name : 'Unkategorisiert';

                // Build full title string: "Manufacturer Name #Serial (Year)"
                const titleParts = [
                    m.manufacturer,
                    m.name,
                    m.serial ? `#${m.serial} ` : '',
                    m.year ? `(${m.year})` : ''
                ].filter(Boolean).join(' ');

                return `
                        <div class="premium-item"
                    onclick="selectServiceMachine(${m.id}, '${m.manufacturer}', '${m.name}', '${m.serial || ''}', '${m.image_url || ''}', '${catName}', '${m.year || ''}')"
                    id="machine-item-${m.id}" style="font-family: 'Inter', sans-serif;">
            <div class="premium-item-img">
                ${m.image_url ? `<img src="${window.getMachineThumbnailUrl ? window.getMachineThumbnailUrl(m.image_url) : m.image_url}" loading="lazy" onerror="this.onerror=null;this.src='${m.image_url}';">` : `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="12" cy="12" r="3"></circle>
                                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                </svg>`}
            </div >
                        <div class="premium-item-info">
                            <strong style="color: white; font-weight: 600;">${titleParts}</strong>
                            <small style="display: flex; gap: 8px; align-items: center; color: rgba(255,255,255,0.6);">
                                <span style="color: var(--color-primary-green);">${catName}</span>
                            </small>
                        </div>
        </div >
                        `;
            }).join('');
        }

        window.filterServiceMachines = function () {
            const search = document.getElementById('service-machine-search').value;
            renderServiceMachineList(search);
        };

        window.selectServiceMachine = function (id, manufacturer, name, serial, imageUrl, categoryName, year) {
            document.getElementById('selected-machine-id').value = id;
            document.querySelectorAll('#service-machine-list .premium-item').forEach(el => el.classList.remove('selected'));
            const selectedItem = document.getElementById(`machine-item-${id}`);
            if (selectedItem) selectedItem.classList.add('selected');

            // Update Preview
            const previewContainer = document.getElementById('selected-machine-preview');
            const previewImg = document.getElementById('preview-image');
            const previewName = document.getElementById('preview-name');
            const previewCategory = document.getElementById('preview-category');
            const previewSerial = document.getElementById('preview-serial');

            if (previewContainer) {
                previewContainer.classList.remove('hidden');
                previewContainer.style.display = 'block'; // Ensure visibility

                const machineTitle = `${manufacturer} ${name}`;
                const metaSuffix = `${serial ? ` #${serial}` : ''}${year ? ` (${year})` : ''}`;

                previewName.textContent = machineTitle;
                if (previewCategory) previewCategory.textContent = categoryName || '';
                previewSerial.textContent = metaSuffix.trim();

                if (imageUrl && imageUrl !== 'undefined' && imageUrl !== 'null') {
                    previewImg.innerHTML = `<img src="${imageUrl}" style="width: 100%; height: 100%; object-fit: cover;">`;
                } else {
                                        previewImg.innerHTML = `<div
            style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;"><svg
                width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="3"></circle>
                <path
                    d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z">
                </path>
            </svg></div>`;
                }

                // Load associated customer details
                if (typeof window.updateServiceCustomerPreview === 'function') {
                    window.updateServiceCustomerPreview(id);
                }
            }
            if (typeof window.handleChecklistMachineChange === 'function') {
                window.handleChecklistMachineChange();
            }
        };

        // Update customer details in Servicebericht modal
        window.updateServiceCustomerPreview = async function (machineId) {
            const custPreview = document.getElementById('selected-machine-customer-preview');
            const custNameEl = document.getElementById('service-customer-name');
            const custAddrEl = document.getElementById('service-customer-address');
            const custRouteEl = document.getElementById('service-customer-route');
            const custRouteLink = document.getElementById('service-customer-route-link');

            if (!custPreview) return;

            const machine = (window.machineList || []).find(m => m.id == machineId);
            if (!machine) {
                custPreview.classList.add('hidden');
                custPreview.style.display = 'none';
                const locFieldsWrapper = document.getElementById('service-location-fields-wrapper');
                if (locFieldsWrapper) {
                    locFieldsWrapper.classList.add('hidden');
                    locFieldsWrapper.style.display = 'none';
                }
                const locToggleBtnReset = document.getElementById('btn-toggle-location');
                if (locToggleBtnReset) locToggleBtnReset.textContent = '+ Abw. Maschinenstandort hinzufügen';
                if (typeof window.renderServiceCpSuggestions === 'function') window.renderServiceCpSuggestions(null);
                return;
            }

            const locFieldsWrapper = document.getElementById('service-location-fields-wrapper');
            const locToggleBtn = document.getElementById('btn-toggle-location');
            if (locFieldsWrapper) {
                document.getElementById('service-location-company').value = machine.location_company || '';
                document.getElementById('service-location-street').value = machine.location_street || '';
                document.getElementById('service-location-zip').value = machine.location_zip || '';
                document.getElementById('service-location-city').value = machine.location_city || '';
                document.getElementById('service-location-country').value = machine.location_country || 'Deutschland';
                const hasLocation = !!(machine.location_street || machine.location_city || machine.location_zip);
                const norm = s => (s || '').trim().toLowerCase();
                const sameAsOperator = hasLocation &&
                    norm(machine.location_street) === norm(machine.operator_street) &&
                    norm(machine.location_zip) === norm(machine.operator_zip) &&
                    norm(machine.location_city) === norm(machine.operator_city);
                const showLocation = hasLocation && !sameAsOperator;
                locFieldsWrapper.classList.toggle('hidden', !showLocation);
                locFieldsWrapper.style.display = showLocation ? 'block' : 'none';
                if (locToggleBtn) locToggleBtn.textContent = showLocation ? '- Abw. Maschinenstandort entfernen' : '+ Abw. Maschinenstandort hinzufügen';
            }

            if (typeof window.renderServiceCpSuggestions === 'function') window.renderServiceCpSuggestions(machine);

            if (machine.customer_id) {
                custPreview.classList.remove('hidden');
                custPreview.style.display = 'block';
                custNameEl.textContent = 'Lade Kundendaten...';
                custAddrEl.textContent = '';
                if (custRouteEl) custRouteEl.style.display = 'none';

                try {
                    const { data: cust, error } = await window.supabaseClient
                        .from('customers')
                        .select('id, name, matchcode, customer_number, street, zip_code, city, country')
                        .eq('id', machine.customer_id)
                        .single();

                    if (!error && cust) {
                        custNameEl.innerHTML = cust.customer_number ? `Kundennummer: ${cust.customer_number}<br><strong>${cust.name}</strong>` : `<strong>${cust.name}</strong>`;
                        
                        const addrParts = [cust.street, [cust.zip_code, cust.city].filter(Boolean).join(' '), cust.country].filter(Boolean);
                        custAddrEl.innerHTML = addrParts.join('<br>');

                        // Setup route planning link
                        if (custRouteEl && custRouteLink) {
                            custRouteEl.style.display = 'block';
                            const destination = addrParts.join(', ');
                            
                            // Fetch own HQ address from app_settings
                            let origin = '';
                            try {
                                const { data: hqData } = await window.supabaseClient
                                    .from('app_settings')
                                    .select('value')
                                    .eq('key', 'company_hq')
                                    .single();
                                if (hqData && hqData.value) {
                                    const hq = hqData.value;
                                    origin = [hq.street, [hq.zip, hq.city].filter(Boolean).join(' '), hq.country].filter(Boolean).join(', ');
                                }
                            } catch(e){}

                            // Fallback to local cache if offline
                            if (!origin) {
                                const cached = localStorage.getItem('meetra_company_hq');
                                if (cached) {
                                    try {
                                        const hq = JSON.parse(cached);
                                        origin = [hq.street, [hq.zip, hq.city].filter(Boolean).join(' '), hq.country].filter(Boolean).join(', ');
                                    } catch(e){}
                                }
                            }

                            custRouteLink.href = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}`;
                        }
                    } else {
                        useMachineAddressFallback(machine);
                    }
                } catch (err) {
                    console.error('Failed to fetch customer for service preview:', err);
                    useMachineAddressFallback(machine);
                }
            } else if (machine.company || machine.operator_street) {
                useMachineAddressFallback(machine);
            } else {
                custPreview.classList.add('hidden');
                custPreview.style.display = 'none';
            }

            async function useMachineAddressFallback(m) {
                custPreview.classList.remove('hidden');
                custPreview.style.display = 'block';
                
                const company = m.company || 'Unbekannter Betreiber';
                custNameEl.innerHTML = m.customer_number ? `Kundennummer: ${m.customer_number}<br><strong>${company}</strong>` : `<strong>${company}</strong>`;

                const addrParts = [
                    m.operator_street,
                    [m.operator_zip, m.operator_city].filter(Boolean).join(' '),
                    m.operator_country
                ].filter(Boolean);

                if (addrParts.length > 0) {
                    custAddrEl.innerHTML = addrParts.join('<br>');
                    
                    // Setup route planning link
                    if (custRouteEl && custRouteLink) {
                        custRouteEl.style.display = 'block';
                        const destination = addrParts.join(', ');
                        
                        let origin = '';
                        const cached = localStorage.getItem('meetra_company_hq');
                        if (cached) {
                            try {
                                const hq = JSON.parse(cached);
                                origin = [hq.street, [hq.zip, hq.city].filter(Boolean).join(' '), hq.country].filter(Boolean).join(', ');
                            } catch(e){}
                        }
                        
                        custRouteLink.href = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}`;
                    }
                } else {
                    custAddrEl.textContent = 'Keine Adresse hinterlegt.';
                    if (custRouteEl) custRouteEl.style.display = 'none';
                }
            }
        };

        // Hotel / Unterkunft Felder ein-/ausblenden
        window.toggleHotelFields = function () {
            const wrapper = document.getElementById('service-hotel-fields-wrapper');
            const btn = document.getElementById('btn-toggle-hotel');
            if (!wrapper) return;

            const show = wrapper.classList.contains('hidden');
            if (!show && !confirm('Hotel / Unterkunft wirklich entfernen?')) return;
            wrapper.classList.toggle('hidden', !show);
            wrapper.style.display = show ? 'block' : 'none';

            if (btn) btn.textContent = show ? '- Hotel entfernen' : '+ Hotel hinzufügen';

            if (!show) {
                ['service-hotel-company', 'service-hotel-street', 'service-hotel-zip', 'service-hotel-city', 'service-hotel-country'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.value = '';
                });
            }
        };

        // ── Contact person helpers (machine edit form) ──────────────────────────
        function _cpEsc(s) { return (s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'); }

        window.createMachineContactPersonRow = function(data) {
            const row = document.createElement('div');
            row.className = 'contact-person-row';
            row.style.cssText = 'position:relative;padding:0.9rem 0.9rem 0.9rem 0.9rem;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:12px;margin-bottom:0.6rem;';
            const _anr = _cpEsc(data?.anrede);
            const _opt = (v) => `<option value="${v}" ${_anr === v ? 'selected' : ''}>${v || '—'}</option>`;
            row.innerHTML = `
                <button type="button" onclick="if(confirm('Ansprechpartner entfernen?'))this.closest('.contact-person-row').remove()" style="position:absolute;top:7px;right:7px;width:22px;height:22px;border-radius:50%;background:rgba(190,30,45,0.9);border:none;color:white;cursor:pointer;font-size:1.1rem;line-height:1;padding:0;display:flex;align-items:center;justify-content:center;">−</button>
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0.6rem;padding-right:28px;">
                    <div><label style="font-size:0.7rem;color:rgba(255,255,255,0.45);margin-bottom:3px;display:block;">Anrede</label><select class="cp-anrede" style="width:100%;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.15);border-radius:8px;color:white;padding:6px 9px;font-size:0.85rem;box-sizing:border-box;">${_opt('')}${_opt('Herr')}${_opt('Frau')}${_opt('Divers')}</select></div>
                    <div><label style="font-size:0.7rem;color:rgba(255,255,255,0.45);margin-bottom:3px;display:block;">Name</label><input type="text" class="cp-name" value="${_cpEsc(data?.name)}" placeholder="Max Mustermann" style="width:100%;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.15);border-radius:8px;color:white;padding:6px 9px;font-size:0.85rem;box-sizing:border-box;"></div>
                    <div><label style="font-size:0.7rem;color:rgba(255,255,255,0.45);margin-bottom:3px;display:block;">Position</label><input type="text" class="cp-position" value="${_cpEsc(data?.position)}" placeholder="z.B. Geschäftsführer" style="width:100%;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.15);border-radius:8px;color:white;padding:6px 9px;font-size:0.85rem;box-sizing:border-box;"></div>
                    <div><label style="font-size:0.7rem;color:rgba(255,255,255,0.45);margin-bottom:3px;display:block;">Telefon</label><input type="text" class="cp-phone" value="${_cpEsc(data?.phone)}" placeholder="0123 456789" style="width:100%;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.15);border-radius:8px;color:white;padding:6px 9px;font-size:0.85rem;box-sizing:border-box;"></div>
                    <div style="grid-column:span 2;"><label style="font-size:0.7rem;color:rgba(255,255,255,0.45);margin-bottom:3px;display:block;">E-Mail</label><input type="email" class="cp-email" value="${_cpEsc(data?.email)}" placeholder="max@firma.de" style="width:100%;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.15);border-radius:8px;color:white;padding:6px 9px;font-size:0.85rem;box-sizing:border-box;"></div>
                </div>`;
            return row;
        };
        window.addMachineContactPerson = function() {
            const list = document.getElementById('machine-contact-persons-list');
            if (list) list.appendChild(window.createMachineContactPersonRow({}));
        };
        window.renderMachineContactPersons = function(persons) {
            const list = document.getElementById('machine-contact-persons-list');
            if (!list) return;
            list.innerHTML = '';
            (persons || []).forEach(p => list.appendChild(window.createMachineContactPersonRow(p)));
        };
        window.collectMachineContactPersons = function() {
            return Array.from(document.querySelectorAll('#machine-contact-persons-list .contact-person-row')).map(row => ({
                anrede: row.querySelector('.cp-anrede')?.value.trim() || '',
                name: row.querySelector('.cp-name')?.value.trim() || '',
                phone: row.querySelector('.cp-phone')?.value.trim() || '',
                position: row.querySelector('.cp-position')?.value.trim() || '',
                email: row.querySelector('.cp-email')?.value.trim() || ''
            })).filter(p => p.name || p.phone || p.position || p.email);
        };

        // ── Contact person helpers (service report form) ─────────────────────
        window.addServiceContactPerson = function(prefill) {
            const list = document.getElementById('service-contact-persons-list');
            if (!list) return;
            const row = document.createElement('div');
            row.className = 'service-cp-row';
            row.style.cssText = 'position:relative;padding:0.45rem 0.65rem 0.5rem;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:9px;margin-bottom:0.35rem;';
            row.innerHTML = `
                <button type="button" onclick="if(confirm('Ansprechpartner entfernen?'))this.closest('.service-cp-row').remove()" style="position:absolute;top:5px;right:5px;width:18px;height:18px;border-radius:50%;background:rgba(190,30,45,0.9);border:none;color:white;cursor:pointer;font-size:0.9rem;line-height:1;padding:0;display:flex;align-items:center;justify-content:center;">−</button>
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0.4rem;padding-right:22px;">
                    <div><label style="font-size:0.65rem;color:rgba(255,255,255,0.4);margin-bottom:2px;display:block;">Name</label><input type="text" class="scp-name glass-form-input" value="${_cpEsc(prefill?.name)}" placeholder="Max Mustermann" style="width:100%;box-sizing:border-box;padding:4px 8px;font-size:0.8rem;"></div>
                    <div><label style="font-size:0.65rem;color:rgba(255,255,255,0.4);margin-bottom:2px;display:block;">Telefon</label><input type="text" class="scp-phone glass-form-input" value="${_cpEsc(prefill?.phone)}" placeholder="0123 456789" style="width:100%;box-sizing:border-box;padding:4px 8px;font-size:0.8rem;"></div>
                    <div><label style="font-size:0.65rem;color:rgba(255,255,255,0.4);margin-bottom:2px;display:block;">Position</label><input type="text" class="scp-position glass-form-input" value="${_cpEsc(prefill?.position)}" placeholder="z.B. Geschäftsführer" style="width:100%;box-sizing:border-box;padding:4px 8px;font-size:0.8rem;"></div>
                </div>`;
            list.appendChild(row);
        };
        window.collectServiceContactPersons = function() {
            return Array.from(document.querySelectorAll('#service-contact-persons-list .service-cp-row')).map(row => ({
                name: row.querySelector('.scp-name')?.value.trim() || '',
                phone: row.querySelector('.scp-phone')?.value.trim() || '',
                position: row.querySelector('.scp-position')?.value.trim() || ''
            })).filter(p => p.name || p.phone || p.position);
        };
        window.renderServiceCpSuggestions = function(machine) {
            const cps = machine?.contact_persons;
            const box = document.getElementById('service-cp-suggestions');
            const chips = document.getElementById('service-cp-suggestion-chips');
            const btn = document.getElementById('btn-show-cp-suggestions');
            if (!box || !chips) return;
            if (!cps || !cps.length) { box.style.display = 'none'; if (btn) btn.style.display = 'none'; return; }
            chips.innerHTML = cps.map((p, i) => `<button type="button" onclick="window.addServiceContactPerson(${JSON.stringify(p).replace(/"/g,'&quot;')})" style="background:rgba(16,185,129,0.12);border:1px solid rgba(16,185,129,0.3);color:rgba(255,255,255,0.85);padding:3px 8px;border-radius:16px;font-size:0.75rem;cursor:pointer;white-space:nowrap;">${_cpEsc(p.name)||'Ansprechpartner '+(i+1)}${p.position?' · '+_cpEsc(p.position):''}</button>`).join('');
            if (btn) btn.style.display = '';
            box.style.display = 'block';
        };
        window.toggleServiceCpSuggestions = function() {
            const box = document.getElementById('service-cp-suggestions');
            if (!box) return;
            box.style.display = box.style.display === 'none' ? 'block' : 'none';
        };

        // Maschinenstandort toggle
        window.toggleLocationFields = function() {
            const wrapper = document.getElementById('service-location-fields-wrapper');
            const btn = document.getElementById('btn-toggle-location');
            if (!wrapper) return;
            const show = wrapper.classList.contains('hidden');
            if (!show && !confirm('Abweichenden Maschinenstandort wirklich entfernen?')) return;
            if (show) {
                const machineId = document.getElementById('selected-machine-id')?.value;
                const machine = machineId ? (window.machineList || []).find(m => String(m.id) === String(machineId)) : null;
                if (machine && (machine.location_street || machine.location_city || machine.location_zip)) {
                    document.getElementById('service-location-company').value = machine.location_company || '';
                    document.getElementById('service-location-street').value = machine.location_street || '';
                    document.getElementById('service-location-zip').value = machine.location_zip || '';
                    document.getElementById('service-location-city').value = machine.location_city || '';
                    document.getElementById('service-location-country').value = machine.location_country || '';
                }
            } else {
                // Beim Entfernen die Felder wirklich leeren, damit der Bericht einen leeren
                // Standort-Snapshot speichert und der Standort nach dem Neuladen NICHT wieder auftaucht.
                ['service-location-company','service-location-street','service-location-zip','service-location-city']
                    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
                const countryEl = document.getElementById('service-location-country');
                if (countryEl) countryEl.value = 'Deutschland';
            }
            wrapper.classList.toggle('hidden', !show);
            wrapper.style.display = show ? 'block' : 'none';
            if (btn) btn.textContent = show ? '− Abw. Maschinenstandort entfernen' : '+ Abw. Maschinenstandort';
        };

        // Google Maps route helpers
        window.openMapsRoute = function(destAddress) {
            if (!destAddress || !destAddress.trim()) return;
            let origin = '';
            try {
                const hq = JSON.parse(localStorage.getItem('meetra_company_hq') || '{}');
                if (hq.street || hq.city) {
                    origin = [hq.street, hq.zip, hq.city, hq.country].filter(Boolean).join(', ');
                }
            } catch(e) {}
            const url = 'https://www.google.com/maps/dir/?api=1' +
                (origin ? '&origin=' + encodeURIComponent(origin) : '') +
                '&destination=' + encodeURIComponent(destAddress);
            window.open(url, '_blank');
        };
        window.openMapsRouteForBetreiber = function() {
            const name = document.getElementById('service-customer-name')?.textContent?.trim() || '';
            const addr = document.getElementById('service-customer-address')?.textContent?.trim() || '';
            window.openMapsRoute([name, addr].filter(Boolean).join(', '));
        };
        window.openMapsRouteForLocation = function() {
            const parts = ['service-location-street','service-location-zip','service-location-city','service-location-country']
                .map(id => document.getElementById(id)?.value?.trim() || '').filter(Boolean);
            window.openMapsRoute(parts.join(', '));
        };
        window.openMapsRouteForHotel = function() {
            const parts = ['service-hotel-company','service-hotel-street','service-hotel-zip','service-hotel-city','service-hotel-country']
                .map(id => document.getElementById(id)?.value?.trim() || '').filter(Boolean);
            window.openMapsRoute(parts.join(', '));
        };

        // Technician Dropdown Multi-Select Logic
        let selectedTechs = [];

        function renderTechDropdown() {
            const list = document.getElementById('tech-option-list');
            if (!list) return;

            const users = window.userList || [];
            list.innerHTML = users.map(u => {
                const isSelected = selectedTechs.includes(u.id);
                const initials = u.initials || u.name.substring(0, 2).toUpperCase();
                const color = u.color || '#666';
                return `
                        <div onclick="toggleTechnician(${u.id})"
                             style="display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 10px; cursor: pointer; transition: background 0.15s; background: ${isSelected ? 'rgba(16,185,129,0.12)' : 'transparent'};"
                             onmouseover="if(!${isSelected}) this.style.background='rgba(255,255,255,0.04)'"
                             onmouseout="this.style.background='${isSelected ? 'rgba(16,185,129,0.12)' : 'transparent'}'">
                            <div style="width:34px; height:34px; border-radius:50%; background:${color}; display:flex; align-items:center; justify-content:center; font-size:0.75rem; font-weight:800; color:#fff; flex-shrink:0; font-family:'Inter',sans-serif;">${initials}</div>
                            <span style="flex:1; color:#fff; font-size:0.95rem; font-weight:500; font-family:'Inter',sans-serif;">${u.name}</span>
                            ${isSelected ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>` : ''}
                        </div>
                    `;
            }).join('');

            // Update trigger pills
            const pillsContainer = document.getElementById('tech-selected-pills');
            const placeholder = document.getElementById('tech-placeholder-text');
            if (!pillsContainer) return;

            const selectedUsers = users.filter(u => selectedTechs.includes(u.id));
            pillsContainer.innerHTML = selectedUsers.map(u => {
                const initials = u.initials || u.name.substring(0, 2).toUpperCase();
                const color = u.color || '#666';
                return `<div style="display:inline-flex; align-items:center; gap:6px; background:${color}22; border:1px solid ${color}55; border-radius:20px; padding:3px 10px 3px 4px; font-size:0.82rem; font-weight:700; color:#fff; font-family:'Inter',sans-serif;">
                        <div style="width:22px; height:22px; border-radius:50%; background:${color}; display:flex; align-items:center; justify-content:center; font-size:0.65rem; font-weight:800; color:#fff;">${initials}</div>
                        ${u.name}
                    </div>`;
            }).join('');

            if (placeholder) placeholder.style.display = selectedUsers.length > 0 ? 'none' : 'flex';
        }

        window.toggleTechDropdown = function () {
            const panel = document.getElementById('tech-dropdown-panel');
            const trigger = document.getElementById('tech-dropdown-trigger');
            if (!panel) return;
            const isOpen = panel.style.display !== 'none';
            panel.style.display = isOpen ? 'none' : 'block';
            if (trigger) trigger.style.borderColor = isOpen ? 'rgba(255,255,255,0.1)' : 'rgba(16,185,129,0.5)';
            if (!isOpen) renderTechDropdown();
        };

        window.toggleTechnician = function (id) {
            const idx = selectedTechs.indexOf(id);
            if (idx > -1) {
                selectedTechs.splice(idx, 1);
            } else {
                selectedTechs.push(id);
            }
            const hiddenInput = document.getElementById('selected-technician-ids');
            if (hiddenInput) hiddenInput.value = JSON.stringify(selectedTechs);
            renderTechDropdown();
            applyAutoTechSignature();
        };

        // Füllt die Techniker-Unterschrift mit der hinterlegten Unterschrift des ersten
        // ausgewählten Technikers (bei mehreren Technikern bewusst nur einer, nicht alle).
        // Rührt eine vom Nutzer selbst gezeichnete/gelöschte Unterschrift nicht an.
        function applyAutoTechSignature() {
            const techSigInput = document.getElementById('service-tech-signature');
            if (!techSigInput) return;
            if (techSigInput.value && !window._techSigIsAutofilled) return;

            const primaryTechId = selectedTechs.length > 0 ? selectedTechs[0] : null;
            const primaryTech = primaryTechId != null ? (window.userList || []).find(u => String(u.id) === String(primaryTechId)) : null;
            const sig = primaryTech?.saved_signature || '';

            techSigInput.value = sig;
            const img = document.getElementById('tech-signature-preview-img');
            const ph = document.getElementById('tech-signature-placeholder');
            const btn = document.getElementById('btn-clear-tech-signature');
            if (sig) {
                if (img) { img.src = sig; img.classList.remove('hidden'); img.style.display = 'block'; }
                if (ph) ph.classList.add('hidden');
                if (btn) btn.classList.remove('hidden');
                window._techSigIsAutofilled = true;
            } else {
                if (img) { img.src = ''; img.classList.add('hidden'); img.style.display = 'none'; }
                if (ph) ph.classList.remove('hidden');
                if (btn) btn.classList.add('hidden');
                window._techSigIsAutofilled = false;
            }
        }

        // Close dropdown when clicking outside
        document.addEventListener('click', function (e) {
            const wrapper = document.getElementById('tech-dropdown-wrapper');
            const panel = document.getElementById('tech-dropdown-panel');
            const trigger = document.getElementById('tech-dropdown-trigger');
            if (wrapper && !wrapper.contains(e.target) && panel && panel.style.display !== 'none') {
                panel.style.display = 'none';
                if (trigger) trigger.style.borderColor = 'rgba(255,255,255,0.1)';
            }
        });

        let serviceFiles = []; // New files to upload
        let existingServiceFiles = []; // Files already in DB
        let removedServiceFiles = [];
        let serviceberichtIsDirty = false;
        function markServiceberichtDirty() { serviceberichtIsDirty = true; }
        function onServiceberichtFieldChange() { serviceberichtIsDirty = true; }

        function handleServiceFiles(files) {
            Array.from(files).forEach(file => {
                serviceFiles.push(file);
            });
            renderServiceFilePreviews();
        }

        function renderServiceFilePreviews() {
            const previewGrid = document.getElementById('service-file-previews');
            if (!previewGrid) return;
            previewGrid.innerHTML = '';

            // 1. Render Existing Files
            existingServiceFiles.forEach((file, index) => {
                const item = document.createElement('div');
                item.className = 'file-preview-item';
                item.style.position = 'relative'; // Ensure relative positioning for overlays

                // Handle legacy string URLs vs new Object structure
                const isLegacy = typeof file === 'string';
                const url = isLegacy ? file : file.url;
                const name = isLegacy ? 'Datei' : file.name;
                const type = isLegacy ? '?' : file.type;

                const isImg = (type && type.startsWith('image/')) || (url && url.match(/\.(jpg|jpeg|png|gif|webp)$/i));

                if (isImg) {
                    item.innerHTML = `<img src="${url}">
        <div
            style="position: absolute; bottom: 0; left: 0; right: 0; background: rgba(0,0,0,0.6); color: white; font-size: 0.6rem; padding: 2px 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
            ${name}
        </div>
        <button class="remove-btn" onclick="removeExistingServiceFile(${index})">&times;</button>`;
                } else {
                    // PDF/Doc
                    let typeLabel = 'DOK';
                    if (type === 'application/pdf' || (url && url.endsWith('.pdf'))) typeLabel = 'PDF';

                    item.innerHTML = `<div
                            style="padding: 0.5rem; text-align: center; color: white; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                            <span style="font-weight: 900; font-size: 0.8rem; opacity: 0.5;">${typeLabel}</span>
                            <span
                                style="font-size: 0.7rem; word-break: break-all; overflow: hidden; max-height: 3em; line-height: 1.2;">${name}</span>
                        </div>
                        <button class="remove-btn" onclick="removeExistingServiceFile(${index})">&times;</button>`;
                }
                previewGrid.appendChild(item);
            });

            // 2. Render New Files
            serviceFiles.forEach((file, index) => {
                const item = document.createElement('div');
                item.className = 'file-preview-item';
                item.style.position = 'relative';

                if (file.type.startsWith('image/')) {
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        item.innerHTML = `<img src="${e.target.result}">
        <div
            style="position: absolute; bottom: 0; left: 0; right: 0; background: rgba(0,0,0,0.6); color: white; font-size: 0.6rem; padding: 2px 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
            ${file.name}
        </div>
        <button class="remove-btn" onclick="removeServiceFile(${index})">&times;</button>`;
                    };
                    reader.readAsDataURL(file);
                } else {
                    let typeLabel = 'DOK';
                    if (file.type === 'application/pdf') typeLabel = 'PDF';

                    item.innerHTML = `<div
                            style="padding: 0.5rem; text-align: center; color: white; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                            <span style="font-weight: 900; font-size: 0.8rem; opacity: 0.5;">${typeLabel}</span>
                            <span
                                style="font-size: 0.7rem; word-break: break-all; overflow: hidden; max-height: 3em; line-height: 1.2;">${file.name}</span>
                        </div>
                        <button class="remove-btn" onclick="removeServiceFile(${index})">&times;</button>`;
                }
                previewGrid.appendChild(item);
            });
        }

        window.removeServiceFile = function (index) {
            serviceFiles.splice(index, 1);
            renderServiceFilePreviews();
        };

        window.removeExistingServiceFile = function (index) {
            const file = existingServiceFiles[index];
            if (file) {
                removedServiceFiles.push(file);
            }
            existingServiceFiles.splice(index, 1);
            renderServiceFilePreviews();
        };

        // Collects current form state into a plain object — used both for online save and offline draft
        window._buildServiceReportData = function () {
            const machineId = document.getElementById('selected-machine-id')?.value;
            const catIdsVal = document.getElementById('service-category-id')?.value;
            let categoryIds = [];
            try { categoryIds = catIdsVal ? JSON.parse(catIdsVal) : []; } catch (e) { categoryIds = catIdsVal ? [parseInt(catIdsVal)] : []; }

            const dateStart = document.getElementById('service-date-start')?.value;
            const dateEnd   = document.getElementById('service-date-end')?.value;

            return {
                machine_id:             parseInt(machineId),
                category_id:            categoryIds.length > 0 ? categoryIds[0] : null,
                category_ids:           categoryIds,
                title:                  document.getElementById('service-report-title')?.value || 'Servicebericht',
                date:                   dateStart,
                datum_von:              dateStart,
                datum_bis:              dateEnd || null,
                hours:                  0,
                previous_report_id:     window._servicePreviousReportId || null,
                technicians:            (typeof selectedTechs !== 'undefined') ? selectedTechs : [],
                files:                  [...existingServiceFiles],
                description:            document.getElementById('service-description')?.value,
                remarks:                document.getElementById('service-remarks')?.value || null,
                travel_distance_km:     parseFloat(document.getElementById('service-driving-distance')?.value) || null,
                travel_time_minutes:    parseInt(document.getElementById('service-driving-time')?.value) || null,
                customer_signature:     document.getElementById('service-customer-signature')?.value || null,
                customer_name:          document.getElementById('service-customer-signee-name')?.value.trim() || null,
                tech_signature:         document.getElementById('service-tech-signature')?.value || null,
                operating_hours:        document.getElementById('service-operating-hours')?.value || null,
                workshop_order_number:  (function() {
                    const y = document.getElementById('service-workshop-year-digit')?.value.trim() || '';
                    const s = document.getElementById('service-workshop-order-suffix')?.value.trim() || '';
                    return s ? `202${y}-40${s.padStart(3, '0')}` : null;
                })(),
                work_log:               typeof window.getWorkLogTableData   === 'function' ? window.getWorkLogTableData()   : [],
                tasks:                  typeof window.getTasksTableData     === 'function' ? window.getTasksTableData()     : [],
                materials:              typeof window.getMaterialsTableData === 'function' ? window.getMaterialsTableData() : [],
                checklist_payload:      typeof window.getChecklistPayload   === 'function' ? window.getChecklistPayload()   : null,
                status_repaired:        document.getElementById('service-status-repaired')?.checked || false,
                status_repaired_en:     document.getElementById('service-status-repaired-en')?.checked || false,
                tech_sig_date:          document.getElementById('service-tech-sig-date')?.value || null,
                customer_sig_date:      document.getElementById('service-customer-sig-date')?.value || null,
                contact_persons:        typeof window.collectServiceContactPersons === 'function' ? window.collectServiceContactPersons() : [],
                hotel_company:          document.getElementById('service-hotel-company')?.value.trim() || null,
                hotel_street:           document.getElementById('service-hotel-street')?.value.trim() || null,
                hotel_zip:              document.getElementById('service-hotel-zip')?.value.trim() || null,
                hotel_city:             document.getElementById('service-hotel-city')?.value.trim() || null,
                hotel_country:          document.getElementById('service-hotel-country')?.value.trim() || null,
                location_snapshot:      window._buildServiceLocationSnapshot()
            };
        };

        // Standort-Snapshot: nur wenn die Standort-Felder sichtbar sind, wird ein abweichender
        // Standort gespeichert. Ausgeblendet (= entfernt) => leerer Snapshot, damit der Standort
        // nach dem Neuladen nicht wieder aus dem Maschinen-Stammsatz erscheint.
        window._buildServiceLocationSnapshot = function () {
            const wrapper = document.getElementById('service-location-fields-wrapper');
            const visible = wrapper && !wrapper.classList.contains('hidden');
            const val = id => (visible ? (document.getElementById(id)?.value.trim() || null) : null);
            return {
                company: val('service-location-company'),
                street:  val('service-location-street'),
                zip:     val('service-location-zip'),
                city:    val('service-location-city'),
                country: val('service-location-country')
            };
        };

        // Submit Logic
        window.saveServiceberichtData = async function () {
            if (!supabaseClient) throw new Error('Supabase client ist nicht initialisiert!');

            const machineId = document.getElementById('selected-machine-id').value;
            const dateStart = document.getElementById('service-date-start').value;
            const dateEnd = document.getElementById('service-date-end').value;
            const description = document.getElementById('service-description').value;

            if (!machineId || !dateStart || !description) {
                if (!dateStart) {
                    toggleServiceReportSection('service-group-1-header', true);
                }
                if (!description) {
                    toggleServiceReportSection('service-group-2-header', true);
                }
                window.showToast('Bitte Maschine, Datum und Beschreibung ausfüllen.');
                throw new Error('validation_error');
            }

            // ── Offline path ───────────────────────────────────────────────
            if (window.offlineService && await window.isLikelyOffline()) {
                const reportDataOffline = window._buildServiceReportData();
                const action   = (typeof currentEditingServiceId !== 'undefined' && currentEditingServiceId) ? 'update' : 'insert';
                const serverId = (typeof currentEditingServiceId !== 'undefined') ? currentEditingServiceId : null;
                const baseline = window._serviceReportBaseline || null;
                const pendingFiles = [...serviceFiles]; // Fotos/Dokumente: Upload erfolgt automatisch beim nächsten Sync

                // Stabiler Schlüssel für noch nicht angelegte Berichte (action 'insert'): bleibt
                // über mehrere Offline-Speicherungen DERSELBEN Sitzung gleich, damit saveDraft
                // denselben Entwurf aktualisiert statt jedes Mal einen weiteren anzulegen
                // (sonst würden beim Sync mehrere doppelte Berichte entstehen).
                if (action === 'insert' && !window._offlineDraftKey) {
                    window._offlineDraftKey = 'tmp_' + Date.now() + '_' + Math.random().toString(36).slice(2);
                }

                await window.offlineService.saveDraft(action, serverId, baseline, reportDataOffline, pendingFiles, window._offlineDraftKey);
                serviceFiles = [];
                window.updatePendingBadge();
                const fileNote = pendingFiles.length > 0
                    ? ` Inkl. ${pendingFiles.length} Anhang${pendingFiles.length > 1 ? 'ängen' : ''}, wird automatisch mit hochgeladen.`
                    : '';
                window.showSyncToast('Offline gespeichert — wird synchronisiert sobald Verbindung besteht.' + fileNote, 'info');
                return; // skip online save
            }

            console.log('Preparing files for Servicebericht...');

            // 1. Prepare Final Files Array
            const finalFiles = [...existingServiceFiles];

            // 2. Upload New Files via Cloudflare R2 (parallelisiert statt nacheinander)
            if (serviceFiles.length > 0) {
                const machine = (window.machineList || []).find(m => m.id == machineId);
                const folderName = machine ? window.getMachineFolderName(machine.id, machine.manufacturer, machine.name, machine.serial || machine.serial_number, machine.year) : `Maschinen/${machineId}`;
                const pathGenerator = (file, i) => {
                    const cleanName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
                    return `${folderName}/Serviceberichte/${Date.now()}-${i}-${cleanName}`;
                };

                const uploadResults = await window.FileUploadService.uploadFiles(
                    serviceFiles,
                    pathGenerator,
                    { bucket: 'dateien', compress: true, concurrency: 5, provider: 'cloudflare-r2' }
                );

                uploadResults.forEach((result, i) => {
                    finalFiles.push({
                        name: serviceFiles[i].name,
                        type: serviceFiles[i].type,
                        url: result.url
                    });
                });
            }
            
            // Clear new files array since they are uploaded and now in existingServiceFiles
            serviceFiles = [];
            existingServiceFiles = [...finalFiles];

            // 3. Save to database
            const reportTitle = document.getElementById('service-report-title')?.value || 'Servicebericht';
            const catIdsVal = document.getElementById('service-category-id')?.value;
            let categoryIds = [];
            try {
                categoryIds = catIdsVal ? JSON.parse(catIdsVal) : [];
            } catch (e) {
                categoryIds = catIdsVal ? [parseInt(catIdsVal)] : [];
            }

            const reportData = {
                machine_id: parseInt(machineId),
                category_id: categoryIds.length > 0 ? categoryIds[0] : null,
                category_ids: categoryIds,
                title: reportTitle,
                date: dateStart,
                datum_von: dateStart,
                datum_bis: dateEnd || null,
                hours: 0,
                previous_report_id: window._servicePreviousReportId || null,
                technicians: (typeof selectedTechs !== 'undefined') ? selectedTechs : [],
                files: finalFiles,
                description: description,
                remarks: document.getElementById('service-remarks')?.value || null,
                travel_distance_km: parseFloat(document.getElementById('service-driving-distance')?.value) || null,
                travel_time_minutes: parseInt(document.getElementById('service-driving-time')?.value) || null,
                customer_signature: document.getElementById('service-customer-signature')?.value || null,
                customer_name: document.getElementById('service-customer-signee-name')?.value.trim() || null,
                tech_signature: document.getElementById('service-tech-signature')?.value || null,
                operating_hours: document.getElementById('service-operating-hours')?.value || null,
                workshop_order_number: (function() {
                    const yearDigit = document.getElementById('service-workshop-year-digit')?.value.trim() || '';
                    const suffix = document.getElementById('service-workshop-order-suffix')?.value.trim() || '';
                    if (suffix) {
                        return `202${yearDigit}-40${suffix.padStart(3, '0')}`;
                    }
                    return null;
                })(),
                work_log: typeof window.getWorkLogTableData === 'function' ? window.getWorkLogTableData() : [],
                tasks: typeof window.getTasksTableData === 'function' ? window.getTasksTableData() : [],
                materials: typeof window.getMaterialsTableData === 'function' ? window.getMaterialsTableData() : [],
                checklist_payload: typeof window.getChecklistPayload === 'function' ? window.getChecklistPayload() : null,
                status_repaired: document.getElementById('service-status-repaired')?.checked || false,
                status_repaired_en: document.getElementById('service-status-repaired-en')?.checked || false,
                tech_sig_date: document.getElementById('service-tech-sig-date')?.value || null,
                customer_sig_date: document.getElementById('service-customer-sig-date')?.value || null,
                contact_persons: typeof window.collectServiceContactPersons === 'function' ? window.collectServiceContactPersons() : [],
                hotel_company: document.getElementById('service-hotel-company')?.value.trim() || null,
                hotel_street: document.getElementById('service-hotel-street')?.value.trim() || null,
                hotel_zip: document.getElementById('service-hotel-zip')?.value.trim() || null,
                hotel_city: document.getElementById('service-hotel-city')?.value.trim() || null,
                hotel_country: document.getElementById('service-hotel-country')?.value.trim() || null,
                // Per-Bericht-Snapshot des Maschinenstandorts. Damit bleibt ein abweichender
                // Standort auf DIESEN Bericht beschränkt und "wandert" nicht auf andere Berichte
                // derselben Maschine (der Maschinen-Stammstandort wird bewusst NICHT überschrieben).
                location_snapshot: window._buildServiceLocationSnapshot()
            };

            console.log('Sending Servicebericht data to Supabase:', reportData);

            let dbError;
            if (typeof currentEditingServiceId !== 'undefined' && currentEditingServiceId) {
                // If it already has PDF fields, keep them during normal save
                const { data: currentRecord } = await supabaseClient
                    .from('service_entries')
                    .select('pdf_url, pdf_path, pdf_created_at')
                    .eq('id', currentEditingServiceId)
                    .single();
                if (currentRecord) {
                    reportData.pdf_url = currentRecord.pdf_url;
                    reportData.pdf_path = currentRecord.pdf_path;
                    reportData.pdf_created_at = currentRecord.pdf_created_at;
                }

                const { error: updateError } = await supabaseClient
                    .from('service_entries')
                    .update(reportData)
                    .eq('id', currentEditingServiceId);
                dbError = updateError;
            } else {
                const { data: insertData, error: insertError } = await supabaseClient
                    .from('service_entries')
                    .insert([reportData])
                    .select('id');
                dbError = insertError;
                if (!dbError && insertData && insertData.length > 0) {
                    currentEditingServiceId = insertData[0].id;
                }
            }

            if (dbError) {
                console.error('Supabase DB Error (Servicebericht):', dbError);
                throw dbError;
            }

            // Delete removed files from Cloudflare R2
            if (removedServiceFiles.length > 0) {
                for (const file of removedServiceFiles) {
                    await deleteFileEntryStorage(file);
                }
                removedServiceFiles = [];
            }

            // --- Maintenance Logic Integration ---
            const targetMachineId = reportData.machine_id;
            const serviceDate = reportData.date;
            const overrideDate = document.getElementById('service-next-maintenance-override')?.value;

            const machineRef = machineList.find(m => m.id === targetMachineId);
            if (machineRef) {
                const categoryRef = categoryList.find(c => c.id === machineRef.category_id);

                // Nur wenn im Servicebericht wirklich eine Wartung/UVV gewählt wurde, zählt der
                // Bericht als Wartungstermin. Reine Reparatur-/Serviceberichte lassen "Letzte/
                // Nächste Wartung" unberührt (kein Überschreiben mit dem Reparaturdatum).
                const maintArt = (typeof window.extractServiceMaintArt === 'function')
                    ? window.extractServiceMaintArt(reportData.checklist_payload) : '';
                const isMaintenanceReport = !!maintArt;

                // WICHTIG: Der Standort wird NICHT mehr in den Maschinen-Stammsatz zurückgeschrieben.
                // Ein (evtl. abweichender) Standort gehört zum jeweiligen Bericht (location_snapshot)
                // und darf nicht auf andere Berichte derselben Maschine durchschlagen. Der
                // Stamm-Maschinenstandort wird ausschließlich im Maschinen-Formular gepflegt.
                const machineUpdate = {};

                if (isMaintenanceReport) {
                    let nextMaintDate;
                    if (overrideDate) {
                        nextMaintDate = new Date(overrideDate).toISOString();
                    } else {
                        const interval = machineRef.maintenance_interval_months || (categoryRef ? categoryRef.default_maintenance_interval_months : 12) || 12;
                        nextMaintDate = window.computeRolledNextMaintenance(serviceDate, interval);
                    }

                    let updatedFiles = machineRef.files ? [...machineRef.files] : [];
                    updatedFiles = updatedFiles.filter(f => f.type !== 'meta' || f.key !== 'is_next_maintenance_auto');
                    if (!overrideDate) {
                        updatedFiles.push({ type: 'meta', key: 'is_next_maintenance_auto', property: 'true' });
                    }

                    machineUpdate.last_maintenance = serviceDate;
                    machineUpdate.next_maintenance = nextMaintDate;
                    machineUpdate.files = updatedFiles;
                }

                if (Object.keys(machineUpdate).length > 0) {
                    const { error: machineUpdateError } = await supabaseClient
                        .from('machines')
                        .update(machineUpdate)
                        .eq('id', targetMachineId);

                    if (machineUpdateError) {
                        console.error('Error updating machine maintenance dates:', machineUpdateError);
                    }
                }
            }

            if (typeof fetchServiceEntries === 'function') await fetchServiceEntries();
            if (typeof fetchMachines === 'function') await fetchMachines();

            return currentEditingServiceId;
        };

        window.submitServicebericht = async function () {
            const submitBtn = document.querySelector('button[onclick="submitServicebericht()"]');
            const originalText = submitBtn ? submitBtn.textContent : 'Speichern';

            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = 'Speichere...';
            }

            try {
                await window.saveServiceberichtData();
                serviceberichtIsDirty = false;
                window.showToast('Servicebericht wurde erfolgreich gespeichert!');
                closeServiceberichtModal();
            } catch (err) {
                if (err.message !== 'validation_error') {
                    console.error('CRITICAL ERROR saving service report:', err);
                    window.showToast('Fehler beim Speichern: ' + (err.message || JSON.stringify(err)));
                }
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = originalText;
                }
            }
        };

        window.saveAndCloseServicebericht = async function () {
            serviceberichtIsDirty = false;
            await window.submitServicebericht();
        };
