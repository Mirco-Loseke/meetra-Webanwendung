// Enhanced renderMachines with category grouping, collapsible sections, dividers, and Workshop support
(function () {
    'use strict';

    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        const div = document.createElement('div');
        div.textContent = String(str);
        return div.innerHTML;
    }

    function renderMachinesGrouped(targetId = 'machine-list-container') {
        const container = document.getElementById(targetId);
        if (!container) return;
        container.innerHTML = '';

        const allMachines = window.machineList || [];

        if (targetId === 'workshop-machines-container') {
            // Workshop view: ONLY shows machines with is_in_workshop = true
            const workshopMachines = allMachines.filter(m => m.is_in_workshop === true);

            if (workshopMachines.length === 0) {
                container.innerHTML = `
                    <div class="empty-state" style="grid-column: 1 / -1; text-align: center; padding: 5rem 2rem; background: rgba(55, 65, 81, 0.3); border-radius: 24px; border: 1px dashed rgba(255,255,255,0.1);">
                        <div style="font-size: 3rem; margin-bottom: 1rem; opacity: 0.5;">🛠️</div>
                        <h2 style="color: #fff; margin-bottom: 0.5rem; font-weight: 800;">Keine Maschinen in der Werkstatt</h2>
                        <p style="color: rgba(255,255,255,0.5);">Nutzen Sie das Werkstatt-Symbol auf den Maschinenkarten, um Geräte hierher zu verschieben.</p>
                    </div>
                `;
                return;
            }

            workshopMachines.forEach(machine => {
                const card = createMachineCard(machine);
                container.appendChild(card);
            });
            return;
        }

        // Main machines view: Apply all filters
        const catFilters = window.activeMachineCategoryFilters || ['all'];
        const conFilters = window.activeMachineContactFilters || ['all'];
        const seriesFilters = window.activeMachineSeriesFilters || ['all'];
        const searchFilter = window.machineSearchFilter || '';

        let displayMachines = allMachines.filter(m => {
            // Category Filter
            const matchCat = catFilters.includes('all') || (m.category_id && catFilters.includes(m.category_id.toString()));

            // Contact Type Filter
            let matchCon = conFilters.includes('all');
            if (!matchCon && m.contact_type) {
                try {
                    const machineTypes = Array.isArray(m.contact_type) ? m.contact_type : JSON.parse(m.contact_type);
                    matchCon = machineTypes.some(t => conFilters.includes(t.toString()));
                } catch (e) { }
            }

            // Machine Series Filter
            const matchSeries = seriesFilters.includes('all') || (m.machine_series && seriesFilters.includes(m.machine_series));

            // Search Keyword Filter — Name/Hersteller/Seriennummer/Baujahr sowie Firma,
            // Betreiberstandort (operator_*) und Maschinenstandort (location*).
            let matchSearch = true;
            if (searchFilter.trim() !== '') {
                const queryTerms = searchFilter.toLowerCase().trim().split(/\s+/);
                const searchableText = [
                    m.name, m.manufacturer, m.serial ? `#${m.serial}` : '', m.year ? `(${m.year})` : '',
                    m.company,
                    m.operator_address, m.operator_street, m.operator_zip, m.operator_city,
                    m.location, m.location_street, m.location_zip, m.location_city
                ].join(' ').toLowerCase();
                matchSearch = queryTerms.every(term => searchableText.includes(term));
            }
            return matchCat && matchCon && matchSeries && matchSearch;
        });

        // Group by category
        const grouped = {};
        (window.categoryList || []).filter(c => c.type === 'machine').forEach(cat => grouped[cat.id] = []);
        displayMachines.forEach(machine => {
            if (grouped[machine.category_id]) {
                grouped[machine.category_id].push(machine);
            }
        });

        const sortedCategories = [...(window.categoryList || [])].filter(c => c.type === 'machine').sort((a, b) => (a.order || 0) - (b.order || 0));

        let categoryCount = 0;
        sortedCategories.forEach(cat => {
            const categoryMachines = grouped[cat.id] || [];
            if (categoryMachines.length === 0) return;

            // Add Divider if not the first category
            if (categoryCount > 0) {
                const divider = document.createElement('div');
                divider.className = 'category-separator';
                container.appendChild(divider);
            }
            categoryCount++;

            const categorySection = document.createElement('div');
            categorySection.className = 'machine-category-section';
            categorySection.style.marginBottom = '3rem';

            const catColor = cat.color || '#fff';

            // Category Header with Collapse Toggle
            const header = document.createElement('div');
            header.className = 'machine-category-header';
            header.innerHTML = `
                <h2 style="font-size: 1.8rem; color: ${catColor}; margin: 0; font-family: 'Outfit', sans-serif; display: flex; align-items: center; gap: 15px;">
                    <svg class="chevron" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${catColor}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                    ${cat.name}
                    <span style="background: rgba(255,255,255,0.15); padding: 4px 12px; border-radius: 12px; font-size: 1rem; color: #ffffff; font-weight: 800;">${categoryMachines.length}</span>
                </h2>
            `;

            const grid = document.createElement('div');
            grid.className = 'card-grid';
            grid.style.marginTop = '1.5rem';

            // Check persistent state
            const storageKey = `category_collapsed_${cat.id}`;
            const isCollapsed = localStorage.getItem(storageKey) === 'true';
            if (isCollapsed) {
                header.classList.add('collapsed');
            }

            header.onclick = () => {
                const nowCollapsed = header.classList.toggle('collapsed');
                localStorage.setItem(storageKey, nowCollapsed);
            };

            categoryMachines.forEach(machine => {
                grid.appendChild(createMachineCard(machine));
            });

            categorySection.appendChild(header);
            categorySection.appendChild(grid);
            container.appendChild(categorySection);
        });

        // Add "New Machine" Card (only for main view)
        const addCard = document.createElement('div');
        addCard.className = 'card';
        addCard.style.cssText = 'font-family: \'Inter\', sans-serif; border: 2px dashed rgba(255,255,255,0.1); background: rgba(255,255,255,0.01); justify-content: center; align-items: center; cursor: pointer; min-height: 500px; display: flex; flex-direction: column; border-radius: 20px; transition: all 0.3s ease; grid-column: 1 / -1; margin-top: 3rem;';
        addCard.onmouseover = () => { addCard.style.borderColor = 'rgba(59, 130, 246, 0.3)'; addCard.style.background = 'rgba(59, 130, 246, 0.03)'; };
        addCard.onmouseout = () => { addCard.style.borderColor = 'rgba(255,255,255,0.1)'; addCard.style.background = 'rgba(255,255,255,0.01)'; };
        addCard.onclick = () => window.openAddMachineModal();
        addCard.innerHTML = `
            <div style="color: #666; text-align: center; padding: 2rem; display: flex; flex-direction: column; align-items: center;">
                <div style="width: 64px; height: 64px; border-radius: 50%; background: rgba(59, 130, 246, 0.1); display: flex; align-items: center; justify-content: center; margin-bottom: 1.25rem; color: #3b82f6;">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="12" y1="5" x2="12" y2="19"></line>
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                </div>
                <p style="margin: 0; font-weight: 800; color: #aaa; font-size: 1.1rem;">Neue Maschine</p>
                <p style="margin: 0.5rem 0 0 0; font-size: 0.85rem; color: #666; max-width: 150px; line-height: 1.4; font-weight: 600;">Legen Sie ein neues Gerät im System an.</p>
            </div>
        `;
        container.appendChild(addCard);
    }

    function createMachineCard(machine) {
        const card = document.createElement('div');
        card.className = 'card';

        let catColor = null;
        if (window.categoryList && machine.category_id) {
            const cat = window.categoryList.find(c => c.id == machine.category_id);
            if (cat && cat.color) {
                catColor = cat.color;
            }
        }

        // Standardize the glass background across all cards with improved contrast
        const glassBg = 'background: rgba(110, 122, 140, 0.45); backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px); box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6);';

        // padding-bottom overrides the .card class's default 32px bottom padding, which left a
        // large empty gap below the Bearbeiten/Löschen buttons and the card's bottom edge.
        if (catColor) {
            card.style.cssText = `font-family: 'Inter', sans-serif; overflow: visible; display: flex; flex-direction: column; ${glassBg} border: 3px solid ${catColor}66; border-top: 7px solid ${catColor}; border-radius: 20px; transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); cursor: pointer; position: relative; padding-top: 35px; padding-bottom: 14px; min-width: 0; width: 100%;`;
        } else {
            card.style.cssText = `font-family: 'Inter', sans-serif; overflow: visible; display: flex; flex-direction: column; ${glassBg} border: 3px solid rgba(255,255,255,0.3); border-radius: 20px; transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); cursor: pointer; position: relative; padding-top: 35px; padding-bottom: 14px; min-width: 0; width: 100%;`;
        }

        card.onclick = () => window.openMachineDetails(machine.id);

        // Image logic - use thumbnail if available for faster loading
        let imageHtml = '';
        if (machine.image_url) {
            const fullUrl = machine.image_url.trim();
            const thumbUrl = window.getMachineThumbnailUrl ? window.getMachineThumbnailUrl(fullUrl) : fullUrl;
            imageHtml = `<img src="${thumbUrl}" alt="${machine.name}" loading="lazy" onerror="if(this.src!=='${fullUrl}'){this.onerror=null;this.src='${fullUrl}';}" style="width: 100%; height: var(--machine-image-height, 300px); object-fit: contain; display: block; object-position: center;">`;
        } else {
            imageHtml = `
                <div class="card-image-placeholder" style="background: linear-gradient(135deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01)); color: rgba(255,255,255,0.2); height: var(--machine-image-height, 300px); display: flex; align-items: center; justify-content: center;">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.4;">
                        <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
                        <circle cx="9" cy="9" r="2"/>
                        <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
                    </svg>
                </div>`;
        }

        // Workshop Toggle Icon
        const isInWorkshop = machine.is_in_workshop === true;
        const workshopIcon = `
            <div class="workshop-toggle ${isInWorkshop ? 'active' : ''}" 
                 onclick="if(typeof event !== 'undefined' && event.stopPropagation) event.stopPropagation(); window.toggleWorkshopStatus('${machine.id}', ${isInWorkshop})"
                 title="${isInWorkshop ? 'Aus Werkstatt entfernen' : 'In Werkstatt verschieben'}"
                 style="position: absolute; top: -20px; right: 10px;
                        width: 40px; height: 40px; border-radius: 50%;
                        display: flex; align-items: center; justify-content: center;
                        z-index: 20; cursor: pointer;
                        transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
                        background: ${isInWorkshop ? 'rgba(245, 158, 11, 0.95)' : 'rgba(30, 35, 50, 0.85)'};
                        border: 2px solid ${isInWorkshop ? 'rgba(255,220,100,0.6)' : 'rgba(255,255,255,0.25)'};
                        box-shadow: ${isInWorkshop ? '0 4px 18px rgba(245, 158, 11, 0.5)' : '0 4px 14px rgba(0,0,0,0.5)'};
                        backdrop-filter: blur(12px);"
                 onmouseover="this.style.transform='scale(1.12)'"
                 onmouseout="this.style.transform='scale(1)'">
                <svg width="22" height="22" viewBox="-10 -10 120 120" fill="none" stroke="${isInWorkshop ? '#fff' : 'rgba(255,255,255,0.7)'}" stroke-width="8.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M43 8h14l3 11a31 31 0 0 1 9 4l10-5 10 10-5 10a31 31 0 0 1 4 9l11 3v14l-11 3a31 31 0 0 1-4 9l5 10-10 10-10-5a31 31 0 0 1-9 4l-3 11H43l-3-11a31 31 0 0 1-9-4l-10 5-10-10 5-10a31 31 0 0 1-4-9L1 57V43l11-3a31 31 0 0 1 4-9L11 21l10-10 10 5a31 31 0 0 1 9-4Z" />
                    <circle cx="50" cy="50" r="22" />
                    <path d="M38 34a12 12 0 0 1 12 12 12 12 0 0 1-2.5 7.5L60 66a3 3 0 0 1 0 4.2 3 3 0 0 1-4.2 0L43.5 57.5A12 12 0 0 1 38 58a12 12 0 0 1-12-12 12 12 0 0 1 6-10.4l5.5 5.5 3.4-3.4-5.5-5.5A12 12 0 0 1 38 34z" />
                </svg>
            </div>
        `;



         // Workshop Photo Icon
        const photoIcon = isInWorkshop ? `
            <div class="workshop-photo-btn"
                 onclick="if(typeof event !== 'undefined' && event.stopPropagation) event.stopPropagation(); window.openWorkshopPhotoModal('${machine.id}')"
                 title="Werkstatt-Fotos verwalten"
                 style="position: absolute; top: -20px; right: 58px;
                        width: 40px; height: 40px; border-radius: 50%;
                        display: flex; align-items: center; justify-content: center;
                        z-index: 20; cursor: pointer;
                        transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
                        background: rgba(139, 92, 246, 0.92);
                        border: 2px solid rgba(200,170,255,0.4);
                        box-shadow: 0 4px 18px rgba(139, 92, 246, 0.5);
                        backdrop-filter: blur(12px);"
                 onmouseover="this.style.transform='scale(1.12)'"
                 onmouseout="this.style.transform='scale(1)'">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                    <circle cx="12" cy="13" r="4"></circle>
                </svg>
            </div>
        ` : '';

        // Maintenance logic
        const lastMaintDate = machine.last_maintenance ? new Date(machine.last_maintenance).toLocaleDateString('de-DE') : '/';
        const nextMaintDate = machine.next_maintenance ? new Date(machine.next_maintenance) : null;
        const nextMaintStr = nextMaintDate ? nextMaintDate.toLocaleDateString('de-DE') : '/';

        // Check if next maintenance was auto-calculated
        const isAuto = Array.isArray(machine.files) && machine.files.some(f => f.type === 'meta' && f.key === 'is_next_maintenance_auto' && f.property === 'true');
        // We'll place the auto badge absolutely like the workshop icon
        const autoBadge = '';

        // Determine status color for urgency
        let maintStatusColor = '#10b981'; // Default Green (OK)
        let maintStatusText = 'Aktuell';

        if (nextMaintDate) {
            const now = new Date();
            const diffDays = Math.ceil((nextMaintDate - now) / (1000 * 60 * 60 * 24));

            if (diffDays < 0) {
                maintStatusColor = '#ef4444'; // Red (Overdue)
                maintStatusText = 'Überfällig';
            } else if (diffDays <= 30) {
                maintStatusColor = '#f59e0b'; // Yellow/Orange (Due soon)
                maintStatusText = 'Bald fällig';
            }
        }

        if (isInWorkshop) {
            maintStatusColor = '#f59e0b';
            maintStatusText = 'IN WERKSTATT';
        }

        // Workshop order number tag
        const workshopCat = (window.categoryList || []).find(c => c.id === 16);
        const workshopColor = workshopCat ? workshopCat.color : '#f59e0b';
        const orderNumberTag = (isInWorkshop && machine.workshop_order_number) ? `
            <div style="position: absolute; top: -20px; left: 24px; height: 40px; padding: 0 16px; background: ${workshopColor}e6; color: #ffffff; border-radius: 20px; font-size: 0.85rem; font-weight: 800; box-shadow: 0 4px 14px rgba(245, 158, 11, 0.4); border: 2px solid rgba(255, 220, 100, 0.6); backdrop-filter: blur(12px); z-index: 10; letter-spacing: 0.5px; display: flex; align-items: center; justify-content: center; gap: 8px;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>
                ${machine.workshop_order_number}
            </div>
        ` : '';

        const normalizeMachineIdList = (source) => {
            if (Array.isArray(source)) return source.filter(Boolean).map(String);
            if (typeof source === 'string' && source.trim()) {
                try {
                    const parsed = JSON.parse(source);
                    if (Array.isArray(parsed)) return parsed.filter(Boolean).map(String);
                } catch (e) {
                    return source.split(',').map(item => item.trim()).filter(Boolean);
                }
            }
            return [];
        };

        const extractMetaProperty = (files, key) => {
            if (!Array.isArray(files)) return null;
            const entry = files.find(item => item && item.type === 'meta' && item.key === key && item.property != null);
            return entry ? entry.property : null;
        };

        const relatedMachineIds = Array.from(new Set([
            ...normalizeMachineIdList(machine.related_machine_ids),
            ...normalizeMachineIdList(extractMetaProperty(machine.files, 'related_machine_ids'))
        ]));

        const linkedBadge = relatedMachineIds.length > 0 ? `
            <div title="${relatedMachineIds.length} ${relatedMachineIds.length === 1 ? 'verknüpfte Maschine' : 'verknüpfte Maschinen'}"
                 style="position: absolute; top: -14px; left: 10px;
                        width: 26px; height: 26px; border-radius: 50%;
                        display: flex; align-items: center; justify-content: center;
                        z-index: 15; cursor: pointer;
                        background: rgba(59, 130, 246, 0.92);
                        border: 1.5px solid rgba(147, 197, 253, 0.5);
                        box-shadow: 0 2px 8px rgba(59, 130, 246, 0.5);
                        backdrop-filter: blur(12px);
                        font-size: 0.72rem; font-weight: 900; color: #fff; font-family: 'Inter', sans-serif;
                        transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);"
                 onmouseover="this.style.transform='scale(1.12)'"
                 onmouseout="this.style.transform='scale(1)'">
                ${relatedMachineIds.length}
            </div>
        ` : '';

        card.innerHTML = `
            ${linkedBadge}
            ${orderNumberTag}
            ${workshopIcon}
            ${photoIcon}
            <div style="position: relative; width: 100%; background: linear-gradient(135deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01)); overflow: hidden; border-radius: 16px 16px 0 0;">
                ${imageHtml}
            </div>
            <div style="height: 1px; background: rgba(255,255,255,0.1); margin: 0;"></div>
            <div class="card-content" style="padding: 1.25rem 1.25rem 2px 1.25rem; flex: 1; display: flex; flex-direction: column;">
                <div style="margin-bottom: 1.5rem;">
                    <div style="flex: 1; overflow: hidden;">
                        <h2 class="card-title" style="margin: 0; font-size: clamp(0.95rem, 3.2vw, 1.75rem); color: var(--color-primary-green); font-weight: 900; line-height: 1.2; font-family: 'Outfit', sans-serif; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                            ${machine.manufacturer} ${machine.name}
                        </h2>
                        <div style="font-size: clamp(0.9rem, 3vw, 1.25rem); color: var(--color-primary-green); opacity: 0.8; font-weight: 700; text-transform: uppercase; margin-top: 4px;">
                            ${machine.serial ? `#${machine.serial}` : ''} ${machine.year ? `(${machine.year})` : ''}
                        </div>
                    </div>
                </div>
                ${machine.company ? `<div style="font-size: 0.95rem; color: #fff; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 0.75rem; margin-top: -0.75rem; display:flex; align-items:center; gap:5px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;opacity:0.6;"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>${machine.company}</div>` : ''}

                <div class="machine-info-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 1rem; margin-bottom: 0.6rem; background: rgba(0,0,0,0.15); padding: 18px 1.25rem; border-radius: 14px; border: 1px solid rgba(255,255,255,0.06); margin-left: -1.25rem; margin-right: -1.25rem; position: relative;">
                    <div style="border-right: 1px solid rgba(255,255,255,0.05); padding-right: 12px; display: flex; flex-direction: column; align-items: center; text-align: center;">
                        <div style="font-size: 0.85rem; color: rgba(255,255,255,0.4); margin-bottom: 5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; width: 100%;">Letzte Wartung</div>
                        <div style="font-size: 1.05rem; color: #fff; display: flex; align-items: center; justify-content: center; gap: 6px; font-weight: 700; width: 100%;">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: rgba(255,255,255,0.4);"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                            ${lastMaintDate}
                        </div>
                    </div>
                    <div style="padding-left: 6px; display: flex; flex-direction: column; align-items: center; text-align: center;">
                        <div style="font-size: 0.85rem; color: rgba(255,255,255,0.4); margin-bottom: 5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; width: 100%;">Nächste Wartung</div>
                        <div style="font-size: 1.05rem; color: ${maintStatusColor}; display: flex; align-items: center; justify-content: center; gap: 6px; font-weight: 700; width: 100%;">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: ${maintStatusColor};"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                            ${nextMaintStr}${autoBadge}
                        </div>
                    </div>
                    ${isAuto ? `
                    <div style="position: absolute; top: -10px; right: 20px; background: rgba(59, 130, 246, 0.9); color: #fff; font-size: 0.7rem; font-weight: 900; padding: 2px 10px; border-radius: 20px; text-transform: uppercase; letter-spacing: 1px; box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4); border: 1px solid rgba(255,255,255,0.3); cursor: default; transition: all 0.3s ease;"
                         onmouseover="this.style.transform='scale(1.1)'"
                         onmouseout="this.style.transform='scale(1)'"
                         title="Nächste Wartung wird automatisch berechnet">
                        AUTO
                    </div>
                    ` : ''}
                </div>
                <div class="card-actions" style="margin-top: auto; display: flex; align-items: center; justify-content: center; gap: 8px; padding-top: 0.75rem; border-top: 1px solid rgba(255,255,255,0.06); margin-left: -1.25rem; margin-right: -1.25rem;">
                    <button class="btn-reports" style="padding: 8px 10px !important; font-size: 0.85rem !important;" onclick="if(typeof event !== 'undefined' && event.stopPropagation) event.stopPropagation(); window.openServiceActionsModal(event, '${machine.id}')" title="Berichte & Protokolle">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                        Protokolle
                    </button>
                    
                    <button class="btn-history" style="flex: 1 !important; padding: 8px 10px !important; font-size: 0.85rem !important;" onclick="if(typeof event !== 'undefined' && event.stopPropagation) event.stopPropagation(); window.openHistoryModal ? window.openHistoryModal('${machine.id}') : alert('Historie für ' + '${machine.id}')" title="Historie">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                        Historie
                    </button>

                    <button class="btn-edit-card" onclick="if(typeof event !== 'undefined' && event.stopPropagation) event.stopPropagation(); window.openEditStammdaten(${machine.id})" title="Bearbeiten">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                            <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                    </button>

                    <button class="btn-delete-card delete-permission-required" onclick="if(typeof event !== 'undefined' && event.stopPropagation) event.stopPropagation(); deleteMachine('${machine.id}')" title="Maschine löschen">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M3 6h18"></path>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2-2v2"></path>
                        </svg>
                    </button>
                </div>
            </div>
        `;


        return card;
    }

    // Set globally
    window.renderMachines = renderMachinesGrouped;
    window.createMachineCard = createMachineCard;
})();
