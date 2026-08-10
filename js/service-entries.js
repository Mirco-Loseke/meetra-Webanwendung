/* ========================================================= */
/* ================= SERVICE ENTRIES MODULE ================ */
/* ========================================================= */

window.allServiceEntries = [];
window.serviceEntryList = [];
window.currentEditingServiceId = null;
window.serviceEntriesLimit = 40;
window.selectedServiceCategories = [];
window.selectedTechs = [];

window.fetchServiceEntries = async function() {
    if (!window.supabaseClient) return;

    const list = document.getElementById('service-entries-list');

    // 1. Zuerst SOFORT aus IndexedDB Cache laden (falls vorhanden)
    let cacheLoaded = false;
    if (window.offlineService) {
        try {
            const cached = await window.offlineService.getAllCachedEntries();
            if (cached && cached.length > 0) {
                window.allServiceEntries = cached;
                window.serviceEntryList = window.allServiceEntries;
                window.renderServiceEntries();
                cacheLoaded = true;
            }
        } catch (e) {
            console.error('Offline-Cache beim Vorsortieren nicht ladbar:', e);
        }
    }

    // Wenn offline, brechen wir nach dem Cache-Laden ab
    if (!navigator.onLine) {
        if (!cacheLoaded && list) {
            list.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: rgba(255,255,255,0.4); padding: 2rem;">Offline: Keine zwischengespeicherten Daten vorhanden.</div>';
        }
        return;
    }

    // Wenn kein Cache geladen wurde, Lade-Indikator zeigen
    if (!cacheLoaded && list) {
        list.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: white; padding: 2rem;">Lade Serviceeinsätze...</div>';
    }

    // 2. Frische Daten vom Server holen
    let data, error;
    try {
        const result = await window.withTimeout(
            window.supabaseClient
                .from('service_entries')
                .select('id, machine_id, category_id, category_ids, title, date, datum_von, datum_bis, hours, technicians, pdf_url, pdf_path, files, is_finalized, finalized_at, workshop_order_number, previous_report_id')
                .order('date', { ascending: false }),
            6000 // 6 Sekunden Timeout
        );
        data = result.data; error = result.error;
    } catch (timeoutErr) {
        error = timeoutErr;
    }

    if (error) {
        console.error('Error fetching service entries:', error);
        if (!cacheLoaded && list) {
            list.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: rgba(255,200,200,0.8);">Fehler beim Laden: ${error.message}</div>`;
        }
        return;
    }

    window.allServiceEntries = data || [];
    window.serviceEntryList = window.allServiceEntries;
    window.renderServiceEntries();

    // Cache aktualisieren
    if (window.offlineService) {
        window.offlineService.cacheEntries(window.allServiceEntries);
        window.syncFullServiceEntriesForOffline();
    }
};

window.syncFullServiceEntriesForOffline = async function() {
    if (!window.supabaseClient || !navigator.onLine || !window.offlineService) return;
    try {
        const lastSync = localStorage.getItem('last_service_entries_sync') || '1970-01-01T00:00:00.000Z';

        let { data, error } = await window.supabaseClient
            .from('service_entries')
            .select('*')
            .gt('updated_at', lastSync);

        if (error) {
            console.warn('Inkrementeller Filter fehlgeschlagen, lade alle Berichte ungefiltert:', error);
            const fullResult = await window.supabaseClient.from('service_entries').select('*');
            data = fullResult.data;
            error = fullResult.error;
        }

        if (error) throw error;

        if (data && data.length > 0) {
            await window.offlineService.cacheFullEntries(data);
            console.log(`[offlineSync] Sync durchgeführt: ${data.length} Berichte für Offline-Nutzung zwischengespeichert.`);
        }

        localStorage.setItem('last_service_entries_sync', new Date().toISOString());
    } catch (e) {
        console.warn('Offline-Vollsync der Serviceberichte fehlgeschlagen:', e);
    }
};

const SERVICEBERICHT_LOCK_TIMEOUT_MIN = 10;

window.tryAcquireServiceberichtLock = async function(entry) {
    const myName = (window.activeUser && window.activeUser.name) || 'Unbekannt';
    const lockedAtMs = entry.locked_at ? new Date(entry.locked_at).getTime() : 0;
    const lockAgeMin = (Date.now() - lockedAtMs) / 60000;

    if (entry.locked_by && entry.locked_by !== myName && lockAgeMin < SERVICEBERICHT_LOCK_TIMEOUT_MIN) {
        const minutesAgo = Math.max(1, Math.round(lockAgeMin));
        window.showToast(`Dieser Servicebericht wird gerade von ${entry.locked_by} bearbeitet (seit ${minutesAgo} Min.) und kann daher nicht geöffnet werden.`);
        return false;
    }

    try {
        await window.supabaseClient
            .from('service_entries')
            .update({ locked_by: myName, locked_at: new Date().toISOString() })
            .eq('id', entry.id);
    } catch (e) {
        console.warn('Konnte Bearbeitungssperre nicht setzen:', e);
    }
    return true;
};

window.releaseServiceberichtLock = async function (id) {
    if (!id || !navigator.onLine || !window.supabaseClient) return;
    try {
        await window.supabaseClient
            .from('service_entries')
            .update({ locked_by: null, locked_at: null })
            .eq('id', id);
    } catch (e) {
        console.warn('Konnte Bearbeitungssperre nicht freigeben:', e);
    }
};

window.createFolgebericht = function () {
    if (!window.currentEditingServiceId) return;
    if (typeof window.serviceberichtIsDirty !== 'undefined' && window.serviceberichtIsDirty) {
        window.showToast('Bitte zuerst die aktuellen Änderungen speichern, bevor ein Folgebericht erstellt wird.');
        return;
    }
    const machineId = parseInt(document.getElementById('selected-machine-id')?.value) || null;
    window._pendingFolgeberichtSource = {
        previousId: window.currentEditingServiceId,
        machineId: machineId,
        categoryIds: (typeof window.selectedServiceCategories !== 'undefined' && Array.isArray(window.selectedServiceCategories)) ? [...window.selectedServiceCategories] : [],
        technicians: Array.isArray(window.selectedTechs) ? [...window.selectedTechs] : [],
        workshopYearDigit: document.getElementById('service-workshop-year-digit')?.value.trim() || '',
        workshopOrderSuffix: document.getElementById('service-workshop-order-suffix')?.value.trim() || ''
    };
    window.closeServiceberichtModal(true);
    setTimeout(() => {
        window.openServiceberichtModal(null);
    }, 320);
};

window.jumpToServicebericht = function (id) {
    const entry = (window.allServiceEntries || []).find(e => e.id === id);
    if (!entry) {
        window.showToast('Verknüpfter Bericht wurde nicht gefunden (evtl. gelöscht).');
        return;
    }
    const modal = document.getElementById('servicebericht-modal');
    const modalIsOpen = modal && modal.classList.contains('show');

    const openTarget = () => {
        if (entry.is_finalized) {
            if (entry.pdf_url) {
                window.open(entry.pdf_url, '_blank');
            } else if (typeof window.showServiceQuickInfo === 'function') {
                window.showServiceQuickInfo(id);
            }
        } else if (typeof window.openEditServicebericht === 'function') {
            window.openEditServicebericht(id);
        }
    };

    if (modalIsOpen) {
        window.closeServiceberichtModal(true);
        setTimeout(openTarget, 320);
    } else {
        openTarget();
    }
};

window.openEditServicebericht = async function (id) {
    const entryHeader = (window.allServiceEntries || []).find(e => e.id === id);
    if (!entryHeader) return;

    if (entryHeader.is_finalized) {
        window.showToast('Dieser Servicebericht wurde abgeschlossen und kann nicht mehr bearbeitet werden.');
        return;
    }

    if (!navigator.onLine) {
        if (window.offlineService) {
            try {
                const cached = await window.offlineService.getCachedFullEntry(id);
                if (cached) {
                    if (cached.is_finalized) {
                        window.showToast('Dieser Servicebericht wurde abgeschlossen und kann nicht mehr bearbeitet werden.');
                        return;
                    }
                    window.openServiceberichtModal(cached);
                    return;
                }
            } catch (e) {
                console.error('Offline-Cache konnte nicht geladen werden:', e);
                window.showToast('Offline-Speicher nicht verfügbar: ' + (e.message || e));
                return;
            }
        }
        window.showToast('Dieser Servicebericht wurde noch nicht vollständig offline gespeichert. Bitte einmal mit Internet öffnen, danach kann offline weiterbearbeitet werden.');
        return;
    }

    try {
        document.body.style.cursor = 'wait';
        const { data, error } = await window.supabaseClient
            .from('service_entries')
            .select('*')
            .eq('id', id)
            .single();
        document.body.style.cursor = 'default';

        if (error) throw error;
        if (data) {
            if (data.is_finalized) {
                window.showToast('Dieser Servicebericht wurde abgeschlossen und kann nicht mehr bearbeitet werden.');
                if (typeof window.fetchServiceEntries === 'function') window.fetchServiceEntries();
                return;
            }
            const canOpen = await window.tryAcquireServiceberichtLock(data);
            if (!canOpen) return;
            if (window.offlineService) window.offlineService.cacheFullEntries([data]);
            window.openServiceberichtModal(data);
        }
    } catch (err) {
        document.body.style.cursor = 'default';
        console.error('Failed to load service entry details:', err);
        window.showToast('Verbindungsfehler: Details des Berichts konnten nicht geladen werden.');
    }
};

window.openServiceberichtModal = function (editData = null) {
    try {
        const modal = document.getElementById('servicebericht-modal');
        if (modal) {
            modal.classList.remove('hidden');
            modal.style.display = 'flex';
            requestAnimationFrame(() => {
                modal.classList.add('show');
                const scrollArea = modal.querySelector('.modal-scroll-area');
                if (scrollArea) scrollArea.scrollTop = 0;
            });

            const serviceCollapsibles = modal.querySelectorAll('.collapsible-section');
            serviceCollapsibles.forEach(section => {
                const content = section.querySelector('.section-content');
                const chevron = section.querySelector('.toggle-chevron');
                if (content) content.style.display = 'none';
                if (chevron) chevron.style.transform = 'rotate(0deg)';
            });

            const titleEl = modal.querySelector('h2');
            const machineSelector = modal.querySelector('.machine-selector-wrapper .search-input-container');
            const machineList = document.getElementById('service-machine-list');
            const lockHint = document.getElementById('selection-lock-hint');
            const previewArea = document.getElementById('selected-machine-preview');

            const custPreview = document.getElementById('selected-machine-customer-preview');
            if (custPreview) { custPreview.classList.add('hidden'); custPreview.style.display = 'none'; }
            if (previewArea) { previewArea.classList.add('hidden'); previewArea.style.display = 'none'; }
            if (lockHint) lockHint.classList.add('hidden');
            if (machineSelector) machineSelector.style.display = 'block';
            if (machineList) machineList.style.display = 'block';

            const selectedTechIds = document.getElementById('selected-technician-ids');
            if (selectedTechIds) selectedTechIds.value = '';

            const filePreviews = document.getElementById('service-file-previews');
            if (filePreviews) filePreviews.innerHTML = '';

            const drivingDistance = document.getElementById('service-driving-distance');
            if (drivingDistance) drivingDistance.value = '';
            const drivingTime = document.getElementById('service-driving-time');
            if (drivingTime) drivingTime.value = '';
            if (typeof window.updateDrivingTimeHoursPreview === 'function') window.updateDrivingTimeHoursPreview();
            const customerSignature = document.getElementById('service-customer-signature');
            if (customerSignature) customerSignature.value = '';
            const customerSigneeName = document.getElementById('service-customer-signee-name');
            if (customerSigneeName) customerSigneeName.value = '';

            const operatingHours = document.getElementById('service-operating-hours');
            if (operatingHours) operatingHours.value = '';
            const serviceYearDigit = document.getElementById('service-workshop-year-digit');
            if (serviceYearDigit) {
                const curYear = String(new Date().getFullYear());
                serviceYearDigit.value = curYear.charAt(3) || '6';
            }
            const serviceSuffix = document.getElementById('service-workshop-order-suffix');
            if (serviceSuffix) serviceSuffix.value = '';
            const cloudPdfBtn = document.getElementById('btn-servicebericht-cloud-pdf');
            if (cloudPdfBtn) cloudPdfBtn.classList.remove('hidden');
            const pdfStatusEl = document.getElementById('servicebericht-pdf-status');
            if (pdfStatusEl) pdfStatusEl.textContent = 'Noch kein PDF gespeichert';
            const workLogTableBody = document.getElementById('service-work-log-table-body');
            if (workLogTableBody) workLogTableBody.innerHTML = '';
            const tasksTableBody = document.getElementById('service-tasks-table-body');
            if (tasksTableBody) tasksTableBody.innerHTML = '';
            const materialsTableBody = document.getElementById('service-materials-table-body');
            if (materialsTableBody) materialsTableBody.innerHTML = '';
            const statusRepaired = document.getElementById('service-status-repaired');
            if (statusRepaired) statusRepaired.checked = false;
            const statusRepairedEn = document.getElementById('service-status-repaired-en');
            if (statusRepairedEn) statusRepairedEn.checked = false;

            const locCompanyInput = document.getElementById('service-location-company');
            if (locCompanyInput) locCompanyInput.value = '';
            const locStreetInput = document.getElementById('service-location-street');
            if (locStreetInput) locStreetInput.value = '';
            const locZipInput = document.getElementById('service-location-zip');
            if (locZipInput) locZipInput.value = '';
            const locCityInput = document.getElementById('service-location-city');
            if (locCityInput) locCityInput.value = '';
            const locCountryInput = document.getElementById('service-location-country');
            if (locCountryInput) locCountryInput.value = 'Deutschland';
            const locFieldsWrapper = document.getElementById('service-location-fields-wrapper');
            if (locFieldsWrapper) { locFieldsWrapper.classList.add('hidden'); locFieldsWrapper.style.display = 'none'; }

            const cpListReset = document.getElementById('service-contact-persons-list');
            if (cpListReset) cpListReset.innerHTML = '';

            ['service-hotel-company', 'service-hotel-street', 'service-hotel-zip', 'service-hotel-city', 'service-hotel-country'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
            const hotelFieldsWrapper = document.getElementById('service-hotel-fields-wrapper');
            if (hotelFieldsWrapper) { hotelFieldsWrapper.classList.add('hidden'); hotelFieldsWrapper.style.display = 'none'; }

            window.serviceFiles = [];
            window.existingServiceFiles = [];
            window.removedServiceFiles = [];
            window.selectedTechs = [];

            if (editData) {
                window.currentEditingServiceId = editData.id;
                window._serviceReportBaseline = Object.assign({}, editData);
                if (titleEl) titleEl.textContent = 'Servicebericht bearbeiten';
            } else {
                window.currentEditingServiceId = null;
                window._serviceReportBaseline = null;
                if (titleEl) titleEl.textContent = 'Neuer Servicebericht';
            }
        }
    } catch (err) {
        console.error('Error opening Servicebericht modal:', err);
    }
};

window.renderServiceEntries = function () {
    try {
        const list = document.getElementById('service-entries-list');
        const searchInput = document.getElementById('service-search-input');
        if (!list) return;

        const searchVal = searchInput ? searchInput.value.trim() : '';
        const activeFiltersStr = JSON.stringify(window.activeServiceCategoryFilters);
        if (window._lastServiceSearchVal !== searchVal || window._lastActiveServiceCategoryFilters !== activeFiltersStr) {
            window.serviceEntriesLimit = 40;
            window._lastServiceSearchVal = searchVal;
            window._lastActiveServiceCategoryFilters = activeFiltersStr;
        }

        window.serviceEntriesLimit = window.serviceEntriesLimit || 40;

        let entries = (window.allServiceEntries || []).filter(e =>
            e.title !== 'Werkstattaufenthalt Beginn' &&
            e.title !== 'Werkstattaufenthalt Ende'
        );

        // Filter by Category
        if (window.activeServiceCategoryFilters && !window.activeServiceCategoryFilters.includes('all')) {
            entries = entries.filter(e => {
                const catId = e.category_id ? e.category_id.toString() : 'null';
                return window.activeServiceCategoryFilters.includes(catId);
            });
        }

        // Filter by Search
        if (searchInput && searchInput.value.trim() !== '') {
            const term = searchInput.value.toLowerCase();
            entries = entries.filter(e => {
                const machines = window.machineList || [];
                const machine = machines.find(m => m.id === e.machine_id);
                const machineName = machine ? `${machine.manufacturer} ${machine.name} ${machine.serial ? `#${machine.serial}` : ''} ${machine.year ? `(${machine.year})` : ''}` : '';

                const text = `${e.title} ${e.description} ${e.date} ${machineName}`.toLowerCase();
                return term.split(' ').every(word => text.includes(word));
            });
        }

        if (entries.length === 0) {
            const rawCount = (window.allServiceEntries || []).length;
            const hasActiveFilter = (window.activeServiceCategoryFilters && !window.activeServiceCategoryFilters.includes('all'))
                || (searchInput && searchInput.value.trim() !== '');
            let message = 'Keine Serviceeinsätze gefunden.';
            let showResetBtn = false;
            if (rawCount > 0 && hasActiveFilter) {
                message = `${rawCount} Servicebericht${rawCount > 1 ? 'e' : ''} vorhanden, aber durch Suche/Filter ausgeblendet.`;
                showResetBtn = true;
            } else if (!navigator.onLine && rawCount === 0) {
                message = 'Offline: Noch keine Serviceberichte zwischengespeichert. Bitte einmal mit Internet öffnen.';
            }
            const emptyState = `
<div class="empty-state" style="grid-column: 1 / -1; text-align: center; padding: 4rem 2rem; background: rgba(255,255,255,0.02); border-radius: 24px; border: 1px dashed rgba(255,255,255,0.1);">
    <p style="color: rgba(255,255,255,0.4); font-size: 1.1rem;">${message}</p>
    ${showResetBtn ? `<button onclick="window.activeServiceCategoryFilters=['all']; const si=document.getElementById('service-search-input'); if(si) si.value=''; window.renderServiceEntries();" style="margin-top:1rem; padding:8px 18px; border-radius:10px; background:rgba(59,130,246,0.15); color:#60a5fa; border:1px solid rgba(59,130,246,0.3); cursor:pointer; font-weight:700;">Filter zurücksetzen</button>` : ''}
</div>`;
            list.innerHTML = emptyState;
            return;
        }

        const totalEntriesCount = entries.length;
        const hasMore = totalEntriesCount > window.serviceEntriesLimit;
        const slicedEntries = entries.slice(0, window.serviceEntriesLimit);

        const followUpByPreviousId = {};
        (window.allServiceEntries || []).forEach(e => {
            if (e.previous_report_id) followUpByPreviousId[e.previous_report_id] = e.id;
        });

        const renderServiceLinkBadge = (entry, position) => {
            const linkedId = entry.previous_report_id || followUpByPreviousId[entry.id];
            if (!linkedId) return '';
            const title = entry.previous_report_id ? 'Folgebericht — zum vorherigen Bericht springen' : 'Hat einen Folgebericht — springen';
            return `
                <button class="service-link-badge" onclick="event.stopPropagation(); window.jumpToServicebericht(${linkedId})" title="${title}"
                    style="position: absolute; ${position} z-index: 12; width: 22px; height: 22px; border-radius: 50%; border: 1.5px solid rgba(16,185,129,0.5); background: rgba(15,23,42,0.75); backdrop-filter: blur(6px); color: var(--color-primary-green); display: flex; align-items: center; justify-content: center; cursor: pointer; padding: 0;"
                    onmouseover="this.style.background='rgba(16,185,129,0.85)'; this.style.color='#fff'" onmouseout="this.style.background='rgba(15,23,42,0.75)'; this.style.color='var(--color-primary-green)'">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
                </button>`;
        };

        const cardsHtml = slicedEntries.map(e => {
            const machines = window.machineList || [];
            const machine = machines.find(m => m.id === e.machine_id);
            const machineImgFull = machine ? (machine.image_url || '') : '';
            const machineImg = machineImgFull && window.getMachineThumbnailUrl ? window.getMachineThumbnailUrl(machineImgFull) : machineImgFull;
            const dateObj = new Date(e.date);
            const dateStr = dateObj.toLocaleDateString('de-DE');

            let displayedCategories = [];
            if (e.category_ids && Array.isArray(e.category_ids) && e.category_ids.length > 0) {
                displayedCategories = e.category_ids.map(id => (window.categoryList || []).find(c => c.id === id)).filter(Boolean);
            } else if (e.category_id) {
                const cat = (window.categoryList || []).find(c => c.id === e.category_id);
                if (cat) displayedCategories = [cat];
            }

            if (displayedCategories.length === 0) {
                displayedCategories = [{ name: 'Allgemein', color: '#10b981', id: 0 }];
            }

            const mainCat = displayedCategories[0];
            const fallbackPalette = ['#f59e0b', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899', '#ef4444', '#06b6d4', '#84cc16'];
            const primaryCatColor = mainCat.color || fallbackPalette[mainCat.id % fallbackPalette.length];

            let durationStr = '';
            if (e.datum_von) {
                const d1 = new Date(e.datum_von);
                const d2 = e.datum_bis ? new Date(e.datum_bis) : new Date(e.datum_von);
                d1.setHours(0, 0, 0, 0);
                d2.setHours(0, 0, 0, 0);
                const diffDays = Math.round(Math.abs(d2 - d1) / (1000 * 60 * 60 * 24)) + 1;

                if (diffDays >= 30) {
                    const months = Math.floor(diffDays / 30);
                    const remainingDays = diffDays % 30;
                    durationStr = ` (${months}. Monat${remainingDays > 0 ? ` ${remainingDays}. Tage` : ''})`;
                } else {
                    durationStr = diffDays === 1 ? ` (1. Tag)` : ` (${diffDays}. Tage)`;
                }
            }

            let cleanDesc = e.description || '';
            const lowDesc = cleanDesc.toLowerCase();
            const isAutoEntry = lowDesc.includes('automatischer systemeintrag');

            let displayOrderNum = e.auftragsnummer || e.workshop_order_number || '';
            if (!displayOrderNum) {
                const match = cleanDesc.match(/Werkstattauftrag[:\s]+([^\s\n]+)/i);
                if (match && match[1]) {
                    displayOrderNum = match[1].trim();
                }
            }

            const hasOrderTag = !!displayOrderNum && displayOrderNum !== '—';

            if (isAutoEntry) {
                if (hasOrderTag) {
                    cleanDesc = '';
                } else {
                    const parts = cleanDesc.split('\n');
                    const titlePart = parts[0] || '';
                    const numberPart = parts.slice(1).join('\n') || '';
                    cleanDesc = `<span style="color: var(--color-primary-red, #ef4444); font-weight: 800;">${titlePart}</span>\n<span style="color: #ffffff; font-weight: 700;">${numberPart}</span>`;
                }
            } else {
                cleanDesc = cleanDesc.replace(/Zeitraum:.*?\n?/gi, '').replace(/Auftragsnummer:.*?\n?/gi, '').replace(/Werkstattauftrag[:\s]+.*?\n?/gi, '').trim() || '';
            }

            const images = [];
            const docs = [];
            if (e.files && Array.isArray(e.files)) {
                e.files.forEach(file => {
                    const url = typeof file === 'string' ? file : file.url;
                    const type = typeof file === 'string' ? '?' : file.type;
                    const name = typeof file === 'string' ? 'Datei' : file.name;
                    const isImg = url.match(/\.(jpg|jpeg|png|gif|webp)$/i) || (type && type.startsWith('image/'));
                    if (isImg) images.push(url);
                    else docs.push({ url, name });
                });
            }

            window[`_sf${e.id}`] = e.files || [];

            const isLinkedReport = !!(e.previous_report_id || followUpByPreviousId[e.id]);
            const orderTagColor = isLinkedReport
                ? { bg: 'rgba(245, 158, 11, 0.2)', border: 'rgba(252, 211, 77, 0.5)', text: '#fbbf24' }
                : { bg: 'rgba(59, 130, 246, 0.2)', border: 'rgba(147, 197, 253, 0.5)', text: '#93c5fd' };

            return `
                    <div class="card" style="font-family: 'Inter', sans-serif; overflow: visible; display: flex; flex-direction: column; background: rgba(110, 122, 140, 0.45); backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px); box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6); border: 3px solid ${primaryCatColor}66; border-top: 7px solid ${primaryCatColor}; border-radius: 20px; transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); position: relative; padding-top: 35px; padding-bottom: 14px; width: 100%; box-sizing: border-box; min-width: 0;">

                        <div class="service-card-badge-row" style="position: absolute; top: -26px; right: 24px; left: auto; display: flex; flex-direction: row-reverse; gap: 8px; z-index: 10;">
                            ${displayedCategories.map(cat => {
                                const cColor = cat.color || fallbackPalette[cat.id % fallbackPalette.length];
                                return `
                                    <div class="service-card-badge" style="height: 40px; padding: 0 18px; background: ${cColor}; color: #ffffff; border-radius: 20px; font-size: 0.9rem; font-weight: 700; box-shadow: 0 0 15px ${cColor}60; border: 2.5px solid color-mix(in srgb, ${cColor}, #ffffff 60%); backdrop-filter: blur(8px); letter-spacing: 0.5px; display: flex; align-items: center; justify-content: center; gap: 8px; white-space: nowrap; font-family: 'Inter', sans-serif;">
                                        ${cat.name}
                                    </div>`;
                            }).join('')}
                        </div>

                        <button class="service-quickinfo-btn" onclick="event.stopPropagation(); window.showServiceQuickInfo(${e.id})" title="Stundenübersicht anzeigen"
                            style="position: absolute; top: 8px; right: 8px; z-index: 12; width: 22px; height: 22px; border-radius: 50%; border: 1.5px solid rgba(255,255,255,0.35); background: rgba(15,23,42,0.75); backdrop-filter: blur(6px); color: rgba(255,255,255,0.85); font-size: 0.78rem; font-weight: 700; font-style: italic; font-family: Georgia, serif; line-height: 1; display: flex; align-items: center; justify-content: center; cursor: pointer; padding: 0;"
                            onmouseover="this.style.background='rgba(59,130,246,0.85)'; this.style.borderColor='rgba(147,197,253,0.9)'" onmouseout="this.style.background='rgba(15,23,42,0.75)'; this.style.borderColor='rgba(255,255,255,0.35)'">i</button>
                        ${renderServiceLinkBadge(e, 'top: 8px; left: 8px;')}

                        <div style="position: relative; width: 100%; height: var(--machine-image-height, 300px); overflow: hidden; background: linear-gradient(135deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01));">
                            <div onclick="openPhotosLightbox([${machineImgFull ? `'${machineImgFull}'` : ''}], 0)"
                                 style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; cursor: ${machineImg ? 'pointer' : 'default'};">
                                ${machineImg
                                    ? `<img src="${machineImg}" loading="lazy" onerror="if(this.src!=='${machineImgFull}'){this.onerror=null;this.src='${machineImgFull}';}" style="width: 100%; height: 100%; object-fit: contain; display: block;">`
                                    : `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" style="opacity: 0.15;"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>`}
                            </div>
                        </div>
                        <div class="card-content" style="padding: 1.25rem 1.25rem 2px 1.25rem; flex: 1; display: flex; flex-direction: column; gap: 0.75rem;">
                            ${hasOrderTag ? `
                            <div style="display: flex; justify-content: center; margin-bottom: 0.25rem; width: 100%;">
                                <div title="${isLinkedReport ? 'Teil einer verknüpften Berichtskette' : ''}" style="height: 32px; padding: 0 16px; background: ${orderTagColor.bg}; border: 1.5px solid ${orderTagColor.border}; border-radius: 16px; color: ${orderTagColor.text}; font-size: 0.85rem; font-weight: 800; display: flex; align-items: center; justify-content: center; gap: 4px; letter-spacing: 0.5px; backdrop-filter: blur(12px); text-transform: uppercase;">
                                    Auftrag ${displayOrderNum}
                                </div>
                            </div>` : ''}

                            <div style="display: flex; align-items: center; gap: 8px; color: #ffffff; font-size: 0.95rem; font-weight: 700; letter-spacing: 0.5px; text-align: left; width: 100%;">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.8;"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                                ${(e.datum_von && e.datum_bis && new Date(e.datum_von).toLocaleDateString('de-DE') !== new Date(e.datum_bis).toLocaleDateString('de-DE'))
                                    ? new Date(e.datum_von).toLocaleDateString('de-DE') + ' - ' + new Date(e.datum_bis).toLocaleDateString('de-DE')
                                    : (e.datum_von ? new Date(e.datum_von).toLocaleDateString('de-DE') : dateStr)}${durationStr}
                            </div>

                            ${machine && machine.company ? `
                            <div class="service-card-company" style="display: flex; align-items: center; gap: 8px; color: #ffffff; font-size: 0.95rem; font-weight: 700; letter-spacing: 0.5px; text-align: left; width: 100%; white-space: nowrap; overflow: hidden;">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.8; flex-shrink: 0;"><path d="M3 21h18"></path><path d="M5 21V7l8-4v18"></path><path d="M19 21V11l-6-4"></path></svg>
                                <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${machine.company}</span>
                            </div>` : ''}

                            <div style="min-width: 0; text-align: left; width: 100%;">
                                <h2 style="margin: 0; font-size: clamp(0.95rem, 3.2vw, 1.75rem); color: var(--color-primary-green); font-weight: 900; line-height: 1.2; font-family: 'Outfit', sans-serif; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                    ${machine ? [machine.manufacturer, machine.name].filter(Boolean).join(' ') : 'Unbekannte Maschine'}
                                </h2>
                                ${machine ? `
                                <div style="color: var(--color-primary-green); font-size: clamp(0.9rem, 3vw, 1.25rem); font-weight: 700; margin-top: 4px; opacity: 0.8; text-transform: uppercase;">
                                    ${[machine.serial_number || machine.serial ? `#${machine.serial_number || machine.serial}` : null, machine.year ? `(${machine.year})` : null].filter(Boolean).join(' ')}
                                </div>` : ''}
                            </div>

                            ${cleanDesc ? `
                            <div style="margin-top: 4px; text-align: left; width: 100%;">
                                <div style="font-size: 0.75rem; color: rgba(255,255,255,0.4); font-weight: 800; text-transform: uppercase; letter-spacing: 1.2px; margin-bottom: 0.5rem;">Fehlerbeschreibung / Kurzbeschreibung Einsatz</div>
                                <p style="margin: 0; font-size: 0.95rem; color: rgba(255,255,255,0.7); line-height: 1.6; font-weight: 500; white-space: pre-wrap;">${cleanDesc}</p>
                            </div>` : ''}
                        </div>

                        <div class="service-card-actions" style="margin-top: auto; display: flex; align-items: center; justify-content: center; gap: 10px; padding-top: 0.75rem; border-top: 1px solid rgba(255,255,255,0.06); margin-left: -0.25rem; margin-right: -0.25rem; padding-left: 1.25rem; padding-right: 1.25rem;">
                            ${!e.is_finalized ? `
                            <button class="btn-primary" onclick="openEditServicebericht(${e.id})" title="Bearbeiten"
                                style="flex: 1; height: 44px; background: rgba(59, 130, 246, 0.85); color: #ffffff; border: 2.5px solid rgba(147, 197, 253, 0.8); border-radius: 20px; transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); display: flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer; box-shadow: 0 4px 18px rgba(59, 130, 246, 0.6); backdrop-filter: blur(12px); padding: 0 16px; font-weight: 700; font-family: 'Inter', sans-serif;">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                Bearbeiten
                            </button>
                            ` : `
                            <div title="Abgeschlossen — keine Bearbeitung mehr möglich" style="flex: 1; height: 44px; background: rgba(255,255,255,0.04); color: rgba(255,255,255,0.45); border: 2px solid rgba(255,255,255,0.1); border-radius: 20px; display: flex; align-items: center; justify-content: center; gap: 8px; font-weight: 700; font-family: 'Inter', sans-serif;">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                                Abgeschlossen
                            </div>
                            `}
                            ${(images.length > 0 || docs.length > 0) ? `
                            <div style="position: relative; flex: none;">
                                <button onclick="event.stopPropagation(); window.openServiceAttachments(window._sf${e.id})" title="Anhänge öffnen"
                                    style="width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; background: rgba(139,92,246,0.85); border: 2.5px solid rgba(196,181,253,0.8); color: #ffffff; border-radius: 50%; cursor: pointer; transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); box-shadow: 0 4px 18px rgba(139,92,246,0.6); backdrop-filter: blur(12px); padding: 0;">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>
                                </button>
                                <span style="position: absolute; top: -4px; left: -4px; background: #ffffff; color: #7c3aed; font-size: 0.6rem; font-weight: 800; border-radius: 999px; min-width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; padding: 0 3px; line-height: 1; pointer-events: none;">${images.length + docs.length}</span>
                            </div>` : ''}
                            ${e.pdf_url ? `
                            <button onclick="event.stopPropagation(); window.previewDocument('${e.pdf_url}', 'Servicebericht', 'application/pdf')" title="PDF öffnen"
                                style="flex: none; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; background: rgba(16, 185, 129, 0.85); border: 2.5px solid rgba(167, 243, 208, 0.8); color: #ffffff; border-radius: 50%; cursor: pointer; transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); box-shadow: 0 4px 18px rgba(16, 185, 129, 0.6); backdrop-filter: blur(12px); padding: 0;">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                    <polyline points="14 2 14 8 20 8"></polyline>
                                </svg>
                            </button>
                            ` : ''}
                            <button class="btn-icon-circular delete delete-permission-required" onclick="deleteServiceEntry(${e.id})" title="Löschen"
                                style="flex: none; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; background: rgba(239, 68, 68, 0.85); border: 2.5px solid rgba(252, 165, 165, 0.8); color: #ffffff; border-radius: 50%; cursor: pointer; transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); box-shadow: 0 4px 18px rgba(239, 68, 68, 0.6); backdrop-filter: blur(12px); padding: 0;">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M3 6h18"></path>
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2-2v2"></path>
                                </svg>
                            </button>
                        </div>
                    </div>`;
        });

        const activeCards = [];
        const doneCards = [];
        slicedEntries.forEach((e, i) => {
            if (e.pdf_url) doneCards.push(cardsHtml[i]);
            else activeCards.push(cardsHtml[i]);
        });

        let boardHtml = activeCards.join('');
        if (doneCards.length > 0) {
            boardHtml += `
                <div style="grid-column: 1 / -1; margin-top: 1rem;">
                    <div onclick="window.toggleServiceErledigtGroup()" style="display: flex; align-items: center; gap: 10px; cursor: pointer; padding: 14px 22px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; user-select: none; transition: background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.07)'" onmouseout="this.style.background='rgba(255,255,255,0.04)'">
                        <svg id="service-erledigt-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="transition: transform 0.25s; color: rgba(255,255,255,0.6); transform: rotate(180deg);"><polyline points="6 9 12 15 18 9"></polyline></svg>
                        <span style="font-weight: 800; font-size: 1rem; color: rgba(255,255,255,0.85); text-transform: uppercase; letter-spacing: 0.5px;">Erledigt (${doneCards.length})</span>
                    </div>
                    <div id="service-erledigt-group" class="card-grid" style="margin-top: 1rem;">
                        ${doneCards.join('')}
                    </div>
                </div>`;
        }

        if (hasMore) {
            boardHtml += `
                <div style="grid-column: 1 / -1; display: flex; justify-content: center; margin-top: 2rem; margin-bottom: 2rem; width: 100%;">
                    <button id="service-entries-more" onclick="window.loadMoreServiceEntries()" class="btn-premium" style="padding: 12px 30px; border-radius: 14px; background: linear-gradient(135deg, #3b82f6, #1d4ed8); color: white; font-weight: 700; border: none; cursor: pointer; box-shadow: 0 4px 15px rgba(59, 130, 246, 0.4); transition: transform 0.2s;">
                        Mehr Berichte laden (${totalEntriesCount - window.serviceEntriesLimit} verbleibend)
                    </button>
                </div>`;
        }

        list.innerHTML = boardHtml;

        // Beim Scrollen von selbst nachladen (js/auto-nachladen.js).
        // Muss nach dem Setzen von innerHTML passieren — vorher gibt es den
        // Knopf noch nicht.
        const mehrKnopf = document.getElementById('service-entries-more');
        if (mehrKnopf && typeof window.autoNachladen === 'function') {
            window.autoNachladen(mehrKnopf, () => window.loadMoreServiceEntries(),
                { ladeText: 'Weitere Berichte werden geladen …' });
        }
    } catch (error) {
        console.error('Error rendering service entries:', error);
    }
};

window.loadMoreServiceEntries = function () {
    window.serviceEntriesLimit = (window.serviceEntriesLimit || 40) + 40;
    window.renderServiceEntries();
};

window.toggleServiceErledigtGroup = function() {
    const group = document.getElementById('service-erledigt-group');
    const chevron = document.getElementById('service-erledigt-chevron');
    if (group) {
        group.classList.toggle('hidden');
        if (chevron) chevron.style.transform = group.classList.contains('hidden') ? 'rotate(0deg)' : 'rotate(180deg)';
    }
};
