// ==========================================================
// Vorgaenge: Maschinenauswahl und offene Werkstattauftraege
// ==========================================================
// Ausgelagert aus index.html (vormals Zeilen 15669-15851).
// Wird in index.html an unveraenderter Stelle per <script src> geladen;
// die Reihenfolge der Skripte entspricht der fruaeheren Reihenfolge im
// Inline-Block und darf nicht vertauscht werden.
// ==========================================================
        window.processMachineRecommended = { 'email': [], 'edit-process': [], 'process-add': [] };

        // Einheitliches Label "Hersteller Name (#Serie, Baujahr)" fuer die Maschinen-Suche in Vorgaengen
        window.processMachineLabel = function(m) {
            if (!m) return '';
            const serialYear = `#${m.serial || '?'}${m.year ? ', ' + m.year : ''}`;
            return `${m.manufacturer || ''} ${m.name || ''} (${serialYear})`.trim();
        };

        // Offene Werkstattauftraege (Aufgaben ohne Maschinenbezug) fuer die Maschinen-Suche in Vorgaengen
        window.processOpenWorkshopOrders = [];
        window.fetchProcessOpenWorkshopOrders = async function() {
            if (!window.supabaseClient) return;
            try {
                const { data, error } = await window.supabaseClient
                    .from('tasks')
                    .select('id, title, workshop_order_number')
                    .not('workshop_order_number', 'is', null)
                    .is('machine_id', null)
                    .neq('status', 'completed');
                if (error) throw error;
                window.processOpenWorkshopOrders = data || [];
            } catch (err) {
                console.error('Error fetching open workshop orders:', err);
            }
        };

        function buildProcessMachineDropdown(prefix, machines, workshopOrders) {
            workshopOrders = workshopOrders || window.processOpenWorkshopOrders || [];
            const portalId = `${prefix}-machine-dropdown-portal`;
            let dropdown = document.getElementById(portalId);
            if (!dropdown) {
                dropdown = document.createElement('div');
                dropdown.id = portalId;
                dropdown.style.cssText = [
                    'position: fixed',
                    'z-index: 999999',
                    'background: rgba(15,23,42,0.98)',
                    'border: 1px solid rgba(255,255,255,0.15)',
                    'border-radius: 12px',
                    'max-height: 260px',
                    'overflow-y: auto',
                    'box-shadow: 0 16px 48px rgba(0,0,0,0.7)',
                    'display: none'
                ].join(';');
                document.body.appendChild(dropdown);
            }

            const searchInput = document.getElementById(`${prefix}-machine-search`);
            if (searchInput) {
                const rect = searchInput.getBoundingClientRect();
                dropdown.style.top = (rect.bottom + 4) + 'px';
                dropdown.style.left = rect.left + 'px';
                dropdown.style.width = rect.width + 'px';
            }

            dropdown.innerHTML = '';

            const buildItem = (m) => {
                const label = window.processMachineLabel(m);
                const item = document.createElement('div');
                item.style.cssText = 'padding: 10px 14px; cursor: pointer; font-size: 0.9rem; border-top: 1px solid rgba(255,255,255,0.05);';
                item.innerHTML = `<span style="color: var(--color-primary-green); font-weight: 600;">${label}</span>`;
                item.onmousedown = (e) => { e.preventDefault(); window.selectProcessMachine(prefix, m.id, label); };
                item.onmouseover = () => { item.style.background = 'rgba(255,255,255,0.06)'; };
                item.onmouseout = () => { item.style.background = ''; };
                return item;
            };

            const noneItem = document.createElement('div');
            noneItem.textContent = 'Keine Maschine zugeordnet';
            noneItem.style.cssText = 'padding: 10px 14px; cursor: pointer; color: rgba(255,255,255,0.6); font-size: 0.9rem;';
            noneItem.onmousedown = (e) => { e.preventDefault(); window.selectProcessMachine(prefix, '', ''); };
            noneItem.onmouseover = () => { noneItem.style.background = 'rgba(255,255,255,0.08)'; };
            noneItem.onmouseout = () => { noneItem.style.background = ''; };
            dropdown.appendChild(noneItem);

            const recommendedIds = window.processMachineRecommended[prefix] || [];
            const recommended = recommendedIds.length > 0 ? machines.filter(m => recommendedIds.includes(m.id)) : [];
            const others = recommended.length > 0 ? machines.filter(m => !recommendedIds.includes(m.id)) : machines;

            if (recommended.length > 0) {
                const header = document.createElement('div');
                header.textContent = 'Empfohlene Maschinen';
                header.style.cssText = 'padding: 6px 14px; font-size: 0.7rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: var(--color-primary-green); border-top: 1px solid rgba(255,255,255,0.05);';
                dropdown.appendChild(header);
                recommended.forEach(m => dropdown.appendChild(buildItem(m)));

                if (others.length > 0) {
                    const header2 = document.createElement('div');
                    header2.textContent = 'Alle Maschinen';
                    header2.style.cssText = 'padding: 6px 14px; font-size: 0.7rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: rgba(255,255,255,0.4); border-top: 1px solid rgba(255,255,255,0.05);';
                    dropdown.appendChild(header2);
                }
            }

            others.forEach(m => dropdown.appendChild(buildItem(m)));

            if (workshopOrders.length > 0) {
                const header3 = document.createElement('div');
                header3.textContent = 'Werkstattaufträge';
                header3.style.cssText = 'padding: 6px 14px; font-size: 0.7rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: #60a5fa; border-top: 1px solid rgba(255,255,255,0.05);';
                dropdown.appendChild(header3);

                workshopOrders.forEach(t => {
                    const label = `Werkstattauftrag ${t.workshop_order_number}${t.title ? ' – ' + t.title : ''}`;
                    const item = document.createElement('div');
                    item.style.cssText = 'padding: 10px 14px; cursor: pointer; font-size: 0.9rem; border-top: 1px solid rgba(255,255,255,0.05);';
                    item.innerHTML = `<span style="color: #60a5fa; font-weight: 600;">${label}</span>`;
                    item.onmousedown = (e) => { e.preventDefault(); window.selectProcessWorkshopOrder(prefix, t.workshop_order_number, t.title); };
                    item.onmouseover = () => { item.style.background = 'rgba(255,255,255,0.06)'; };
                    item.onmouseout = () => { item.style.background = ''; };
                    dropdown.appendChild(item);
                });
            }

            dropdown.style.display = 'block';
        }

        window.showProcessMachineDropdown = function(prefix) {
            if (!window.processOpenWorkshopOrders || window.processOpenWorkshopOrders.length === 0) {
                window.fetchProcessOpenWorkshopOrders().then(() => buildProcessMachineDropdown(prefix, window.machineList || []));
            }
            buildProcessMachineDropdown(prefix, window.machineList || []);
        };

        window.filterProcessMachineDropdown = function(prefix, query) {
            const machines = window.machineList || [];
            const tokens = query.toLowerCase().split(/\s+/).filter(t => t.length > 0);
            const filtered = machines.filter(m => {
                const searchable = [m.manufacturer || '', m.name || '', m.serial || '', m.year ? String(m.year) : ''].join(' ').toLowerCase();
                return tokens.length === 0 || tokens.every(token => searchable.includes(token));
            });
            const workshopOrders = (window.processOpenWorkshopOrders || []).filter(t => {
                const searchable = [t.workshop_order_number || '', t.title || ''].join(' ').toLowerCase();
                return tokens.length === 0 || tokens.every(token => searchable.includes(token));
            });
            buildProcessMachineDropdown(prefix, filtered, workshopOrders);
        };

        window.selectProcessMachine = function(prefix, id, label) {
            const hidden = document.getElementById(`${prefix}-machine-select`);
            const search = document.getElementById(`${prefix}-machine-search`);
            const workshopHidden = document.getElementById(`${prefix}-workshop-order-select`);
            if (hidden) hidden.value = id;
            if (workshopHidden) workshopHidden.value = '';
            if (search) {
                search.value = label || '';
                search.style.color = id ? 'var(--color-primary-green)' : '';
            }
            const dropdown = document.getElementById(`${prefix}-machine-dropdown-portal`);
            if (dropdown) dropdown.style.display = 'none';

            if (prefix === 'email') {
                window.syncAddressFromMachine('email-machine-select', 'email-type-select', 'email-sender-input', 'email-recipient-input');
            } else if (prefix === 'edit-process') {
                window.syncAddressFromMachine('edit-process-machine-select', 'edit-process-type-select', 'edit-process-sender-input', 'edit-process-recipient-input');
            }
        };

        window.selectProcessWorkshopOrder = function(prefix, orderNumber, title) {
            const machineHidden = document.getElementById(`${prefix}-machine-select`);
            const workshopHidden = document.getElementById(`${prefix}-workshop-order-select`);
            const search = document.getElementById(`${prefix}-machine-search`);
            if (machineHidden) machineHidden.value = '';
            if (workshopHidden) workshopHidden.value = orderNumber;
            if (search) {
                search.value = `Werkstattauftrag ${orderNumber}${title ? ' – ' + title : ''}`;
                search.style.color = '#60a5fa';
            }
            const dropdown = document.getElementById(`${prefix}-machine-dropdown-portal`);
            if (dropdown) dropdown.style.display = 'none';
        };

        document.addEventListener('click', (e) => {
            ['email', 'edit-process', 'process-add'].forEach(prefix => {
                const dropdown = document.getElementById(`${prefix}-machine-dropdown-portal`);
                if (dropdown && !e.target.closest(`#${prefix}-machine-search`) && !e.target.closest(`#${prefix}-machine-dropdown-portal`)) {
                    dropdown.style.display = 'none';
                }
            });
        });
