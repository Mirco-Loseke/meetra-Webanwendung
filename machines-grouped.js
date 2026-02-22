// Enhanced renderMachines with category grouping, collapsible sections, dividers, and Workshop support
(function () {
    'use strict';

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

            // Search Keyword Filter
            let matchSearch = true;
            if (searchFilter.trim() !== '') {
                const queryTerms = searchFilter.toLowerCase().trim().split(/\s+/);
                const searchableText = [m.name, m.manufacturer, m.serial ? `#${m.serial}` : '', m.year ? `(${m.year})` : ''].join(' ').toLowerCase();
                matchSearch = queryTerms.every(term => searchableText.includes(term));
            }
            return matchCat && matchCon && matchSearch;
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

            // Category Header with Collapse Toggle
            const header = document.createElement('div');
            header.className = 'machine-category-header';
            header.innerHTML = `
                <h2 style="font-size: 1.8rem; color: #fff; margin: 0; font-family: 'Outfit', sans-serif; display: flex; align-items: center; gap: 15px;">
                    <svg class="chevron" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="color: #3b82f6;">
                        <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                    ${cat.name}
                    <span style="background: rgba(255,255,255,0.05); padding: 4px 12px; border-radius: 12px; font-size: 1rem; color: rgba(255,255,255,0.4); font-weight: 600;">${categoryMachines.length}</span>
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
        card.style.cssText = 'font-family: \'Inter\', sans-serif; overflow: hidden; display: flex; flex-direction: column; background: rgba(255,255,255,0.03); backdrop-filter: blur(16px); border: 1px solid rgba(255,255,255,0.1); border-radius: 20px; transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); cursor: pointer; position: relative;';
        card.onclick = () => window.openEditStammdaten(machine.id);

        // Image logic
        let imageHtml = '';
        if (machine.image_url) {
            imageHtml = `<img src="${machine.image_url.trim()}" alt="${machine.name}" style="width: 100%; height: 300px; object-fit: contain; display: block; border-bottom: 1px solid rgba(255,255,255,0.1);">`;
        } else {
            imageHtml = `
                <div class="card-image-placeholder" style="background: linear-gradient(135deg, rgba(255, 255, 255, 0.03), rgba(255, 255, 255, 0.01)); color: rgba(255,255,255,0.2); height: 300px; display: flex; align-items: center; justify-content: center; border-bottom: 1px solid rgba(255,255,255,0.1);">
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
                 onclick="event.stopPropagation(); window.toggleWorkshopStatus(${machine.id}, ${isInWorkshop})"
                 title="${isInWorkshop ? 'Aus Werkstatt entfernen' : 'In Werkstatt verschieben'}"
                 style="position: absolute; top: 1rem; right: 1rem; width: 44px; height: 44px; border-radius: 12px; display: flex; align-items: center; justify-content: center; z-index: 10; cursor: pointer; transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); 
                        background: ${isInWorkshop ? 'rgba(245, 158, 11, 0.9)' : 'rgba(255,255,255,0.1)'}; 
                        border: 1px solid ${isInWorkshop ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)'};
                        box-shadow: ${isInWorkshop ? '0 0 15px rgba(245, 158, 11, 0.4)' : 'none'};"
                 onmouseover="this.style.transform='scale(1.1)'; this.style.background='${isInWorkshop ? 'rgba(245, 158, 11, 1)' : 'rgba(255,255,255,0.2)'}'"
                 onmouseout="this.style.transform='scale(1)'; this.style.background='${isInWorkshop ? 'rgba(245, 158, 11, 0.9)' : 'rgba(255,255,255,0.1)'}'">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${isInWorkshop ? '#fff' : 'rgba(255,255,255,0.5)'}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="3"></circle>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1-1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                </svg>
            </div>
        `;

        // Maintenance logic
        const lastMaintDate = machine.last_maintenance ? new Date(machine.last_maintenance).toLocaleDateString('de-DE') : 'Keine Daten';
        const nextMaintDate = machine.next_maintenance ? new Date(machine.next_maintenance) : null;
        const nextMaintStr = nextMaintDate ? nextMaintDate.toLocaleDateString('de-DE') : 'Kein Termin';

        // Check if next maintenance was auto-calculated
        const isAuto = Array.isArray(machine.files) && machine.files.some(f => f.type === 'meta' && f.key === 'is_next_maintenance_auto' && f.property === 'true');
        const autoBadge = isAuto ? `<span class="badge" style="background: rgba(59, 130, 246, 0.2); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.3); font-size: 0.65rem; padding: 1px 5px; border-radius: 4px; font-weight: 800; margin-left: 8px; vertical-align: middle;">AUTO</span>` : '';

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

        card.innerHTML = `
            ${workshopIcon}
            ${imageHtml}
            <div class="card-content" style="padding: 1.75rem; flex: 1; display: flex; flex-direction: column;">
                <div style="margin-bottom: 1.5rem;">
                    <div style="flex: 1; overflow: hidden;">
                        <h2 class="card-title" style="margin: 0; font-size: 2.0rem; color: #fff; font-weight: 800; line-height: 1.3; font-family: 'Inter', sans-serif;">
                            ${[
                machine.manufacturer,
                machine.name,
                machine.serial ? `#${machine.serial}` : null,
                machine.year ? `(${machine.year})` : null
            ].filter(Boolean).join(' ')}
                        </h2>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.25rem; margin-bottom: 1.75rem; background: rgba(0,0,0,0.15); padding: 18px 1.75rem; border-radius: 14px; border: 1px solid rgba(255,255,255,0.06); margin-left: -1.75rem; margin-right: -1.75rem; position: relative;">
                    <div style="border-right: 1px solid rgba(255,255,255,0.05); padding-right: 12px;">
                        <div style="font-size: 0.85rem; color: rgba(255,255,255,0.4); margin-bottom: 5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">Letzte Wartung</div>
                        <div style="font-size: 1.05rem; color: #fff; display: flex; align-items: center; gap: 6px; font-weight: 700;">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: rgba(255,255,255,0.4);"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                            ${lastMaintDate}
                        </div>
                    </div>
                    <div style="padding-left: 6px;">
                        <div style="font-size: 0.85rem; color: rgba(255,255,255,0.4); margin-bottom: 5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">Nächste Wartung</div>
                        <div style="font-size: 1.05rem; color: ${maintStatusColor}; display: flex; align-items: center; gap: 6px; font-weight: 700;">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: ${maintStatusColor};"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                            ${nextMaintStr}${autoBadge}
                        </div>
                    </div>
                    <div style="position: absolute; top: -10px; right: 20px; background: ${maintStatusColor}; color: #fff; font-size: 0.7rem; font-weight: 900; padding: 2px 10px; border-radius: 20px; text-transform: uppercase; letter-spacing: 1px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);">
                        ${maintStatusText}
                    </div>
                </div>
                    <div style="padding-left: 6px; cursor: pointer;" onclick="event.stopPropagation(); window.open('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('${machine.location || ''}'), '_blank')">
                        <div style="font-size: 0.85rem; color: rgba(255,255,255,0.4); margin-bottom: 5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">Standort</div>
                        <div style="font-size: 1.05rem; color: #fff; display: flex; align-items: start; gap: 6px; font-weight: 600;">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: #3b82f6; margin-top: 3px; flex-shrink: 0;"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                            <span style="word-break: break-word; line-height: 1.4;">${machine.location || 'N/A'}</span>
                        </div>
                    </div>
                </div>

                <div class="card-actions" style="margin-top: auto; display: flex; align-items: center; gap: 12px; padding-top: 1.5rem; border-top: 1px solid rgba(255,255,255,0.06);">
                    <button class="btn-reports" style="flex: 1; min-height: 48px;" onclick="window.openServiceActionsModal(event, ${machine.id})">
                        Berichte & Protokolle
                    </button>
                    
                    <button class="btn-history" style="flex: 1; min-height: 48px;" onclick="event.stopPropagation(); window.openHistoryModal ? window.openHistoryModal(${machine.id}) : alert('Historie für ' + ${machine.id})">
                        Historie
                    </button>

                    <button class="btn-icon-soft delete" onclick="event.stopPropagation(); deleteMachine(${machine.id})" title="Maschine löschen" style="width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; background: rgba(239, 68, 68, 0.05); border: 1px solid rgba(239, 68, 68, 0.1); color: #ef4444; border-radius: 14px; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.background='rgba(239, 68, 68, 0.15)'" onmouseout="this.style.background='rgba(239, 68, 68, 0.05)'">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
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
})();
