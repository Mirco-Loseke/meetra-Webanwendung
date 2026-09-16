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

        // ----------------------------------------------------------
        // Leistung: Früher wurden bei jedem Tastendruck ALLE Maschinen als
        // einzelne DOM-Knoten mit je drei Event-Handlern aufgebaut. Jetzt:
        //  - Suchtext je Maschine wird einmal vorberechnet (Index, neu bei
        //    geänderter machineList),
        //  - höchstens MAX_TREFFER Einträge werden gezeichnet, der Rest als
        //    Hinweis „weiter eingeben",
        //  - ein einziger innerHTML-Aufruf, Klicks per Event-Delegation,
        //    Hover per CSS-Klasse (.pm-item in css/components/dropdowns.css).
        // ----------------------------------------------------------
        const MAX_TREFFER = 60;
        let suchIndexQuelle = null, suchIndexLaenge = -1, suchIndex = [];
        function maschinenIndex() {
            const liste = window.machineList || [];
            if (liste !== suchIndexQuelle || liste.length !== suchIndexLaenge) {
                suchIndexQuelle = liste; suchIndexLaenge = liste.length;
                suchIndex = liste.map(m => ({
                    m,
                    text: [m.manufacturer || '', m.name || '', m.serial || m.serial_number || '', m.year ? String(m.year) : ''].join(' ').toLowerCase()
                }));
            }
            return suchIndex;
        }

        function escHtml(s) {
            return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        }

        const ITEM_STYLE = 'padding: 10px 14px; cursor: pointer; font-size: 0.9rem; border-top: 1px solid rgba(255,255,255,0.05);';
        const HEAD_STYLE = 'padding: 6px 14px; font-size: 0.7rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; border-top: 1px solid rgba(255,255,255,0.05);';

        function buildProcessMachineDropdown(prefix, machines, workshopOrders, restAnzahl) {
            workshopOrders = workshopOrders || window.processOpenWorkshopOrders || [];
            const portalId = `${prefix}-machine-dropdown-portal`;
            let dropdown = document.getElementById(portalId);
            if (!dropdown) {
                dropdown = document.createElement('div');
                dropdown.id = portalId;
                dropdown.className = 'proc-machine-portal';
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
                // Ein Handler für alle Einträge (mousedown, damit das Suchfeld den Fokus behält)
                dropdown.addEventListener('mousedown', (e) => {
                    const item = e.target.closest('.pm-item');
                    if (!item) return;
                    e.preventDefault();
                    if (item.hasAttribute('data-none')) { window.selectProcessMachine(prefix, '', ''); return; }
                    if (item.hasAttribute('data-wo')) {
                        window.selectProcessWorkshopOrder(prefix, item.getAttribute('data-wo'), item.getAttribute('data-title') || '');
                        return;
                    }
                    window.selectProcessMachine(prefix, item.getAttribute('data-mid'), item.textContent);
                });
                document.body.appendChild(dropdown);
            }

            const searchInput = document.getElementById(`${prefix}-machine-search`);
            if (searchInput) {
                const rect = searchInput.getBoundingClientRect();
                dropdown.style.top = (rect.bottom + 4) + 'px';
                dropdown.style.left = rect.left + 'px';
                dropdown.style.width = rect.width + 'px';
            }

            const html = [];
            html.push(`<div class="pm-item" data-none style="padding: 10px 14px; cursor: pointer; color: rgba(255,255,255,0.6); font-size: 0.9rem;">Keine Maschine zugeordnet</div>`);

            const itemHtml = (m) => `<div class="pm-item" data-mid="${escHtml(m.id)}" style="${ITEM_STYLE}"><span style="color: var(--color-primary-green); font-weight: 600;">${escHtml(window.processMachineLabel(m))}</span></div>`;

            const recSet = new Set((window.processMachineRecommended[prefix] || []).map(String));
            const recommended = recSet.size > 0 ? machines.filter(m => recSet.has(String(m.id))) : [];
            const others = recommended.length > 0 ? machines.filter(m => !recSet.has(String(m.id))) : machines;

            if (recommended.length > 0) {
                html.push(`<div style="${HEAD_STYLE} color: var(--color-primary-green);">Empfohlene Maschinen</div>`);
                recommended.forEach(m => html.push(itemHtml(m)));
                if (others.length > 0) html.push(`<div style="${HEAD_STYLE} color: rgba(255,255,255,0.4);">Alle Maschinen</div>`);
            }

            others.forEach(m => html.push(itemHtml(m)));

            if (restAnzahl > 0) {
                html.push(`<div style="padding: 8px 14px; font-size: 0.78rem; color: rgba(255,255,255,0.45); font-style: italic; border-top: 1px solid rgba(255,255,255,0.05);">… ${restAnzahl} weitere — zum Eingrenzen weiter eingeben</div>`);
            }

            if (workshopOrders.length > 0) {
                html.push(`<div style="${HEAD_STYLE} color: #60a5fa;">Werkstattaufträge</div>`);
                workshopOrders.forEach(t => {
                    const label = `Werkstattauftrag ${t.workshop_order_number}${t.title ? ' – ' + t.title : ''}`;
                    html.push(`<div class="pm-item" data-wo="${escHtml(t.workshop_order_number)}" data-title="${escHtml(t.title || '')}" style="${ITEM_STYLE}"><span style="color: #60a5fa; font-weight: 600;">${escHtml(label)}</span></div>`);
                });
            }

            dropdown.innerHTML = html.join('');
            dropdown.style.display = 'block';
        }

        window.showProcessMachineDropdown = function(prefix) {
            const input = document.getElementById(`${prefix}-machine-search`);
            if (!window.processOpenWorkshopOrders || window.processOpenWorkshopOrders.length === 0) {
                window.fetchProcessOpenWorkshopOrders().then(() => {
                    // Nur neu zeichnen, wenn wirklich Werkstattaufträge dazugekommen sind
                    // und die Liste noch offen ist — sonst würde ein spät eintreffendes
                    // Ergebnis den inzwischen getippten Filter überschreiben.
                    const dd = document.getElementById(`${prefix}-machine-dropdown-portal`);
                    if (!window.processOpenWorkshopOrders.length || !dd || dd.style.display === 'none') return;
                    window.filterProcessMachineDropdown(prefix, input ? input.value : '');
                });
            }
            window.filterProcessMachineDropdown(prefix, input ? input.value : '');
        };

        // Filtern gebündelt: bei schnellem Tippen wird nur der letzte Stand gezeichnet
        // (setTimeout statt requestAnimationFrame — das feuert in nicht sichtbaren
        // Fenstern gar nicht).
        const filterWartend = {};
        window.filterProcessMachineDropdown = function(prefix, query) {
            filterWartend[prefix] = query;
            if (filterWartend['_t_' + prefix]) return;
            filterWartend['_t_' + prefix] = setTimeout(() => {
                filterWartend['_t_' + prefix] = 0;
                filterProcessMachineDropdownJetzt(prefix, filterWartend[prefix] || '');
            }, 16);
        };

        function filterProcessMachineDropdownJetzt(prefix, query) {
            const tokens = (query || '').toLowerCase().split(/\s+/).filter(t => t.length > 0);
            const index = maschinenIndex();
            const recSet = new Set((window.processMachineRecommended[prefix] || []).map(String));
            const filtered = [];
            let rest = 0;
            for (let i = 0; i < index.length; i++) {
                const e = index[i];
                let ok = true;
                for (let t = 0; t < tokens.length; t++) {
                    if (e.text.indexOf(tokens[t]) === -1) { ok = false; break; }
                }
                if (!ok) continue;
                // Empfohlene immer mitnehmen, sonst nur bis zur Obergrenze
                if (filtered.length < MAX_TREFFER || recSet.has(String(e.m.id))) filtered.push(e.m);
                else rest++;
            }
            const workshopOrders = (window.processOpenWorkshopOrders || []).filter(t => {
                const searchable = [t.workshop_order_number || '', t.title || ''].join(' ').toLowerCase();
                return tokens.length === 0 || tokens.every(token => searchable.includes(token));
            });
            buildProcessMachineDropdown(prefix, filtered, workshopOrders, rest);
        }

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
