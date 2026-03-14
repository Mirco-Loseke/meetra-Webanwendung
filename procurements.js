// procurements.js - Logic for the Order/Procurement Module

let allProcurements = [];
let currentProcurement = null;

const statusMap = {
    'new': { label: 'Offen', class: 'status-new', color: '#ef4444', step: 0 },
    'in_progress': { label: 'In Bearbeitung', class: 'status-in-progress', color: '#3b82f6', step: 1 },
    'ordered': { label: 'Bestellt', class: 'status-ordered', color: '#f59e0b', step: 2 },
    'received': { label: 'Erhalten', class: 'status-received', color: '#10b981', step: 3 }
};

document.addEventListener('DOMContentLoaded', () => {
    // Initial fetch if the view is active or on load
    if (window.location.hash === '#procurements') {
        fetchProcurements();
    }
});

// Detect hash change to load data
window.addEventListener('hashchange', () => {
    if (window.location.hash === '#procurements') {
        fetchProcurements();
    }
});

async function fetchProcurements() {
    try {
        const { data, error } = await window.supabaseClient
            .from('procurements')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        allProcurements = data || [];
        window.procurementList = allProcurements; // Expose globally for dashboard
        renderProcurements(allProcurements);
    } catch (err) {
        console.error('Error fetching procurements:', err);
        alert('Fehler beim Laden der Bestellungen: ' + err.message);
    }
}

window.currentProcurementView = 'offen'; // 'offen' or 'erledigt'

function renderProcurements(procurements) {
    const boardContainer = document.getElementById('procurement-cards-unified');
    const emptyState = document.getElementById('procurement-empty-state');
    
    if (boardContainer) boardContainer.innerHTML = '';

    // Filter by view ('offen' vs 'erledigt')
    let filtered = procurements;
    if (window.currentProcurementView === 'offen') {
        filtered = filtered.filter(p => p.status !== 'received');
    } else {
        filtered = filtered.filter(p => p.status === 'received');
    }

    if (!filtered || filtered.length === 0) {
        if (emptyState) emptyState.classList.remove('hidden');
        if (boardContainer) boardContainer.style.display = 'none';
        return;
    } else {
        if (emptyState) emptyState.classList.add('hidden');
        if (boardContainer) boardContainer.style.display = 'block';
    }

    if (window.currentProcurementView === 'erledigt') {
        const grid = document.createElement('div');
        grid.className = 'procurement-unified-grid';
        filtered.forEach(proc => {
            grid.appendChild(renderProcurementCard(proc));
        });
        boardContainer.appendChild(grid);
    } else {
        // Grouped 'Offen' view
        const groups = [
            { id: 'new', label: 'Offen' },
            { id: 'in_progress', label: 'In Bearbeitung' },
            { id: 'ordered', label: 'Bestellt' }
        ];

        groups.forEach(group => {
            const groupItems = filtered.filter(p => p.status === group.id);
            if (groupItems.length > 0) {
                const groupSection = document.createElement('div');
                groupSection.className = 'procurement-status-group';
                
                groupSection.innerHTML = `
                    <h2 class="procurement-group-title">
                        ${group.label} 
                        <span class="group-count">${groupItems.length}</span>
                    </h2>
                    <div class="procurement-unified-grid"></div>
                `;
                
                const grid = groupSection.querySelector('.procurement-unified-grid');
                groupItems.forEach(proc => {
                    grid.appendChild(renderProcurementCard(proc));
                });
                
                boardContainer.appendChild(groupSection);
            }
        });
    }
}

function renderProcurementCard(proc) {
    const status = statusMap[proc.status] || statusMap['new'];
    const accentColor = status.color;
    let creatorName = 'Unbekannt';
    let userColor = 'var(--primary-red)';
    let initials = '??';

    if (window.userList) {
        const creator = window.userList.find(u => u.id === proc.created_by || u.id === String(proc.created_by));
        if (creator) {
            creatorName = creator.name;
            userColor = creator.color || userColor;
            initials = creator.initials || creatorName.substring(0, 2).toUpperCase();
        }
    }

    const card = document.createElement('div');
    card.className = 'procurement-card glass-card';
    card.style.cssText = `border: 2px solid ${accentColor}44; border-left: 6.5px solid ${accentColor};`;
    card.onclick = () => openProcurementModal(proc.id);

    card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; position: relative; z-index: 2;">
            <span style="font-size: 0.65rem; color: rgba(255,255,255,0.4); font-weight: 700; background: rgba(0,0,0,0.2); padding: 2px 8px; border-radius: 4px;">${proc.order_number}</span>
            ${getCategoryBadge(proc.category)}
        </div>
        
        <h4 class="procurement-card-title">${proc.title}</h4>
        
        <div style="margin-bottom: 24px; position: relative; z-index: 2;">
            ${renderStatusStepper(proc.status, proc.id)}
        </div>

        <div class="detailed-machine-label" style="font-weight: 700; color: var(--color-primary-green); margin-bottom: 20px; position: relative; z-index: 2;">
            ${getMachineLabel(proc.location_ref)}
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: auto; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.05); position: relative; z-index: 2;">
            <div style="display: flex; align-items: center; gap: 8px;">
                <div class="user-avatar-small" style="width: 20px; height: 20px; border-radius: 50%; background-color: ${userColor}; border: 1.5px solid rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: center; font-size: 0.60rem; font-weight: 800; color: white;">
                    ${initials}
                </div>
                <span style="font-size: 0.70rem; opacity: 0.8; font-weight: 500;">${creatorName}</span>
            </div>
            <div style="font-size: 0.70rem; color: white; opacity: 0.8; font-weight: 600;">${new Date(proc.created_at).toLocaleDateString('de-DE')}</div>
        </div>
    `;
    return card;
}

function renderStatusStepper(currentStatus, procId, mini = false) {
    const statuses = ['new', 'in_progress', 'ordered', 'received'];
    const currentIndex = statuses.indexOf(currentStatus || 'new');
    
    let html = `<div class="status-stepper ${mini ? 'mini' : ''}" onclick="event.stopPropagation()">`;
    
    statuses.forEach((s, idx) => {
        const isActive = idx <= currentIndex;
        const isCurrent = idx === currentIndex;
        const color = statusMap[s].color;
        const label = statusMap[s].label;
        
        html += `
            <div class="stepper-item ${isActive ? 'active' : ''} ${isCurrent ? 'current' : ''}" 
                 onclick="window.updateProcurementStatus('${procId}', '${s}')">
                <div class="step-circle" style="
                    border-color: ${isActive ? '#10b981' : 'rgba(255,255,255,0.2)'};
                    background: ${isCurrent ? '#10b981' : (isActive ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255,255,255,0.05)')};
                ">
                    ${isActive ? '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>' : ''}
                </div>
                ${!mini ? `<span class="step-label">${label}</span>` : ''}
            </div>
            ${idx < statuses.length - 1 ? `<div class="step-line ${idx < currentIndex ? 'active' : ''}"></div>` : ''}
        `;
    });
    
    html += `</div>`;
    return html;
}

function getMachineLabel(ref) {
    if (!ref || !window.machineList) return '-';
    const machine = window.machineList.find(m => String(m.id) === String(ref));
    if (!machine) return ref;
    
    const parts = [
        machine.manufacturer,
        machine.name,
        machine.type,
        machine.serial ? '#' + machine.serial : null,
        machine.year ? '(' + machine.year + ')' : null
    ].filter(Boolean);
    
    return parts.join(' ');
}

window.switchProcurementView = function(view) {
    window.currentProcurementView = view;
    
    const btnOffen = document.getElementById('btn-procurement-view-offen');
    const btnErledigt = document.getElementById('btn-procurement-view-erledigt');

    if (view === 'offen') {
        btnOffen.classList.add('active');
        btnErledigt.classList.remove('active');
    } else {
        btnOffen.classList.remove('active');
        btnErledigt.classList.add('active');
    }
    
    renderProcurements(allProcurements);
};

window.updateProcurementStatus = async function(id, newStatus) {
    try {
        const { error } = await window.supabaseClient
            .from('procurements')
            .update({ status: newStatus })
            .eq('id', id);

        if (error) throw error;

        // Update local data
        const proc = allProcurements.find(p => p.id === id);
        if (proc) proc.status = newStatus;

        renderProcurements(allProcurements);
    } catch (err) {
        console.error('Error updating status:', err);
        alert('Fehler beim Aktualisieren: ' + err.message);
    }
}

function getCategoryBadge(category) {
    const map = {
        'machine_part': '🔧 Maschine',
        'workshop_supplies': '🧰 Werkstatt',
        'tools': '🔨 Werkzeug',
        'office_supplies': '✏️ Büro',
        'other': '📦 Sonstiges'
    };
    return map[category] || category;
}

function getPriorityBadge(priority) {
    let style = 'background: rgba(255,255,255,0.05); color: rgba(255,255,255,0.8);';
    let label = 'Normal';

    if (priority === 'high') {
        style = 'background: rgba(239, 68, 68, 0.15); color: #ef4444; border-color: rgba(239, 68, 68, 0.2);';
        label = 'HOCH';
    } else if (priority === 'low') {
        style = 'background: rgba(16, 185, 129, 0.1); color: #34d399;';
        label = 'Niedrig';
    }

    return `<span class="procurement-badge" style="${style}">${label}</span>`;
}


function getPriorityBadge(priority) {
    let style = 'padding: 2px 6px; border-radius: 4px; font-size: 0.7rem; text-transform: uppercase;';
    if (priority === 'high') style += 'background: rgba(239, 68, 68, 0.1); color: #ef4444;';
    if (priority === 'normal') style += 'background: rgba(59, 130, 246, 0.1); color: #60a5fa;';
    if (priority === 'low') style += 'background: rgba(16, 185, 129, 0.1); color: #34d399;';

    const label = priority === 'high' ? 'Hoch' : priority === 'normal' ? 'Normal' : 'Niedrig';
    return `<span style="${style}">${label}</span>`;
}

// Modal Logic
window.openProcurementModal = async function (id = null) {
    const modal = document.getElementById('procurement-modal');
    if (!modal) return;

    // Populate Machine Dropdown is no longer needed (now searchable)
    // window.machineList is used at search-time

    // Reset form
    document.getElementById('procurement-form').reset();
    document.getElementById('procurement-id').value = '';

    // Reset machine search input
    const procMachSearch = document.getElementById('proc-machine-search');
    if (procMachSearch) { procMachSearch.value = ''; procMachSearch.style.color = ''; }
    document.getElementById('proc-location').value = '';

    // Reset Image Uploads
    procurementFiles = [];
    existingProcurementFiles = [];
    renderProcurementFilePreviews();

    // Reset status dropdown
    const statusLabel = document.getElementById('proc-status-label');
    if (statusLabel) {
        statusLabel.textContent = '🔴 Neu';
        document.getElementById('proc-status').value = 'new';
    }

    if (id) {
        // Edit Mode
        const proc = allProcurements.find(p => p.id === id);
        if (proc) {
            document.getElementById('procurement-id').value = proc.id;
            document.getElementById('proc-title').value = proc.title;
            document.getElementById('proc-description').value = proc.description || '';
            document.getElementById('proc-category').value = proc.category;
            document.getElementById('proc-quantity').value = proc.quantity;
            const prioEl = document.getElementById('proc-priority');
            if (prioEl) prioEl.value = proc.priority;
            const dateEl = document.getElementById('proc-delivery-date');
            if (dateEl) dateEl.value = proc.delivery_date || '';
            const linkEl = document.getElementById('proc-link');
            if (linkEl) linkEl.value = proc.product_link || '';
            document.getElementById('proc-location').value = proc.location_ref || '';

            // Load existing files
            if (proc.files && Array.isArray(proc.files)) {
                existingProcurementFiles = [...proc.files];
                renderProcurementFilePreviews();
            }

            document.getElementById('procurement-modal-title').textContent = `Bestellung ${proc.order_number} bearbeiten`;

            // Handle status label restoration
            if (proc.status && statusLabel) {
                const labelMap = {
                    'new': '🔴 Aufgegeben',
                    'in_progress': '🔵 In Bearbeitung',
                    'ordered': '🟠 Bestellt',
                    'received': '🟢 Erhalten'
                };
                statusLabel.textContent = labelMap[proc.status] || '🔴 Aufgegeben';
                document.getElementById('proc-status').value = proc.status;
            }

            // Populate machine search input for edit mode
            if (proc.location_ref && window.machineList) {
                const selectedMachine = window.machineList.find(m => String(m.id) === String(proc.location_ref));
                if (selectedMachine) {
                    const label = [
                        selectedMachine.manufacturer || '',
                        selectedMachine.name || '',
                        selectedMachine.serial ? `#${selectedMachine.serial}` : '',
                        selectedMachine.year ? `(${selectedMachine.year})` : ''
                    ].filter(Boolean).join(' ');
                    const srch = document.getElementById('proc-machine-search');
                    if (srch) { srch.value = label; srch.style.color = 'var(--color-primary-green)'; }
                }
            }
        }
    } else {
        // New Mode
        document.getElementById('procurement-modal-title').textContent = 'Neue Bestellung';
    }

    modal.classList.remove('hidden');
    modal.classList.add('active');
    modal.style.display = 'flex';
};

window.closeProcurementModal = function () {
    const modal = document.getElementById('procurement-modal');
    if (modal) {
        modal.classList.remove('active');
        modal.classList.add('hidden');
        setTimeout(() => modal.style.display = 'none', 300); // Wait for transition
    }
};

window.deleteProcurement = async function (id) {
    const proc = allProcurements.find(p => p.id === id);
    if (!proc) return;

    const confirmMsg = `Bestellung "${proc.order_number}" wirklich löschen?\n\nTitel: ${proc.title}`;

    if (!confirm(confirmMsg)) return;

    try {
        const { error } = await window.supabaseClient
            .from('procurements')
            .delete()
            .eq('id', id);

        if (error) throw error;

        alert('Bestellung erfolgreich gelöscht!');
        fetchProcurements(); // Refresh list
    } catch (err) {
        console.error('Error deleting procurement:', err);
        alert('Fehler beim Löschen: ' + err.message);
    }
};

window.saveProcurement = async function () {
    const id = document.getElementById('procurement-id').value;
    const title = document.getElementById('proc-title').value;
    const category = document.getElementById('proc-category').value;
    const description = document.getElementById('proc-description').value;
    const quantity = document.getElementById('proc-quantity').value;
    const priority = document.getElementById('proc-priority')?.value || 'normal';
    const delivery_date = document.getElementById('proc-delivery-date')?.value || null;
    const product_link = document.getElementById('proc-link')?.value || '';
    const location_ref = document.getElementById('proc-location').value;

    const status = 'new'; // Default for new

    try {
        // Use activeUser directly, no alert if not found (or handle gracefully)
        const user = window.activeUser || (await window.supabaseClient.auth.getUser()).data.user;

        // If no user is selected/logged in, we might want to allow it or warn effectively.
        // The user requested to remove the "Bitte melden Sie sich an" check.
        // We will proceed. If user is null, created_by might be null (if DB allows) or we handle it.
        // Ideally we should have a fallback system user or just proceed.

        let order_number = null;
        if (!id) {
            // Generate Order Number logic (Simplified: Count + 1 or Random for now, ideally DB trigger)
            // We'll fetch the last order number to increment
            const { data: lastOrder } = await window.supabaseClient
                .from('procurements')
                .select('order_number')
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            let nextNum = 1;
            if (lastOrder && lastOrder.order_number) {
                const parts = lastOrder.order_number.split('-');
                if (parts.length === 3) {
                    nextNum = parseInt(parts[2]) + 1;
                }
            }
            const year = new Date().getFullYear();
            order_number = `BW-${year}-${String(nextNum).padStart(6, '0')}`;
        }

        const payload = {
            title,
            category,
            description,
            quantity: parseInt(quantity),
            priority,
            delivery_date,
            product_link,
            location_ref
            // status is only set on creation or separate status update
        };

        // Handle Images
        let finalFiles = [...existingProcurementFiles];
        if (procurementFiles.length > 0) {
            const newUploaded = await uploadProcurementFiles();
            finalFiles = [...finalFiles, ...newUploaded];
        }
        payload.files = finalFiles;

        if (!id) {
            payload.order_number = order_number;
            payload.status = 'new';
            // Use user.id if available, otherwise null. 
            // NOTE: If DB requires created_by, this might still fail on insert, but won't crash JS.
            payload.created_by = user ? user.id : null;

            const { error } = await window.supabaseClient.from('procurements').insert(payload);
            if (error) throw error;
        } else {
            const { error } = await window.supabaseClient.from('procurements').update(payload).eq('id', id);
            if (error) throw error;
        }

        closeProcurementModal();
        fetchProcurements();
        alert('Bestellung gespeichert!');

    } catch (err) {
        console.error('Save error:', err);
        alert('Fehler beim Speichern: ' + err.message);
    }
};

window.currentProcurementStatusFilter = 'all';

window.filterProcurements = function (status) {
    if (status) {
        window.currentProcurementStatusFilter = status;
    } else {
        status = window.currentProcurementStatusFilter;
    }

    const term = document.getElementById('procurement-search-input').value.toLowerCase();

    // Update Dropdown UI
    const labelMap = {
        'all': 'Alle',
        'new': 'Aufgegeben',
        'in_progress': 'In Bearbeitung',
        'ordered': 'Bestellt',
        'received': 'Erhalten'
    };

    const statusNameSpan = document.getElementById('procurement-current-status-name');
    if (statusNameSpan) {
        statusNameSpan.textContent = labelMap[status] || 'Alle';
    }

    document.querySelectorAll('#procurement-status-filter-options li').forEach(li => {
        li.classList.remove('selected');
        if (li.getAttribute('onclick')?.includes(`('${status}')`)) {
            li.classList.add('selected');
        }
    });

    // Close dropdown menu if open
    const trigger = document.getElementById('procurement-status-filter-trigger');
    if (trigger) trigger.classList.remove('active');

    let filtered = allProcurements;

    if (status !== 'all' && ['new', 'in_progress', 'ordered', 'received'].includes(status)) {
        filtered = filtered.filter(p => p.status === status);
    }

    if (term) {
        filtered = filtered.filter(p =>
            p.title.toLowerCase().includes(term) ||
            p.order_number.toLowerCase().includes(term) ||
            (p.description && p.description.toLowerCase().includes(term))
        );
    }

    renderProcurements(filtered);
};

// --- Custom Dropdown Logic for Procurement Modal ---

document.addEventListener('DOMContentLoaded', () => {
    setupProcurementDropdown('procurement-status-filter-trigger');
    setupProcurementDropdown('proc-category-dropdown');
    setupProcurementDropdown('proc-priority-dropdown');
    setupProcurementDropdown('proc-machine-dropdown');
    setupProcurementDropdown('proc-status-dropdown');
});

function setupProcurementDropdown(id) {
    const dropdown = document.getElementById(id);
    if (!dropdown) return;

    dropdown.addEventListener('click', function (e) {
        // Toggle active class
        const isActive = this.classList.toggle('active');
        e.stopPropagation();

        // Handle parent z-index to avoid overlap issues
        const parentGroup = this.closest('.form-group');
        if (parentGroup) {
            parentGroup.style.zIndex = isActive ? '100' : '';
        }

        // Close other dropdowns
        document.querySelectorAll('.custom-filter-dropdown').forEach(d => {
            if (d !== this) {
                d.classList.remove('active');
                const p = d.closest('.form-group');
                if (p) p.style.zIndex = '';
            }
        });
    });
}

// Close dropdowns when clicking outside
document.addEventListener('click', function (e) {
    if (!e.target.closest('.custom-filter-dropdown')) {
        document.querySelectorAll('.custom-filter-dropdown').forEach(d => {
            d.classList.remove('active');
            const p = d.closest('.form-group');
            if (p) p.style.zIndex = '';
        });
    }
});

window.selectProcurementCategory = function (event) {
    const li = event.target.closest('li');
    if (!li) return;

    const value = li.dataset.value;
    const text = li.textContent;

    document.getElementById('proc-category').value = value;
    document.getElementById('proc-category-label').textContent = text;
    document.getElementById('proc-category-label').style.color = '#fff'; // Highlight selected
}

window.selectProcurementPriority = function (event) {
    const li = event.target.closest('li');
    if (!li) return;

    const value = li.dataset.value;
    const text = li.textContent;

    document.getElementById('proc-priority').value = value;
    document.getElementById('proc-priority-label').textContent = text;
    document.getElementById('proc-priority-label').style.color = '#fff';
}

// --- Searchable Machine Dropdown for Procurement Modal ---
function buildProcMachineDropdown(machines) {
    let dropdown = document.getElementById('proc-machine-dropdown-portal');
    if (!dropdown) {
        dropdown = document.createElement('div');
        dropdown.id = 'proc-machine-dropdown-portal';
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

    const searchInput = document.getElementById('proc-machine-search');
    if (searchInput) {
        const rect = searchInput.getBoundingClientRect();
        dropdown.style.top = (rect.bottom + 4) + 'px';
        dropdown.style.left = rect.left + 'px';
        dropdown.style.width = rect.width + 'px';
    }

    dropdown.innerHTML = '';

    const noneItem = document.createElement('div');
    noneItem.textContent = 'Keine Maschine';
    noneItem.style.cssText = 'padding: 10px 14px; cursor: pointer; color: rgba(255,255,255,0.6); font-size: 0.9rem;';
    noneItem.onmousedown = (e) => { e.preventDefault(); selectProcMachine('', ''); };
    noneItem.onmouseover = () => { noneItem.style.background = 'rgba(255,255,255,0.08)'; };
    noneItem.onmouseout = () => { noneItem.style.background = ''; };
    dropdown.appendChild(noneItem);

    machines.forEach(m => {
        const label = [
            m.manufacturer || '',
            m.name || '',
            m.serial ? `#${m.serial}` : '',
            m.year ? `(${m.year})` : ''
        ].filter(Boolean).join(' ');

        const item = document.createElement('div');
        item.style.cssText = 'padding: 10px 14px; cursor: pointer; font-size: 0.9rem; border-top: 1px solid rgba(255,255,255,0.05);';
        item.innerHTML = `<span style="color: var(--color-primary-green); font-weight: 600;">${label}</span>`;
        item.onmousedown = (e) => { e.preventDefault(); selectProcMachine(m.id, label); };
        item.onmouseover = () => { item.style.background = 'rgba(255,255,255,0.06)'; };
        item.onmouseout = () => { item.style.background = ''; };
        dropdown.appendChild(item);
    });

    dropdown.style.display = 'block';
}

window.showProcMachineDropdown = function () {
    buildProcMachineDropdown(window.machineList || []);
};

window.filterProcMachineDropdown = function (query) {
    const machines = window.machineList || [];
    const tokens = query.toLowerCase().split(/\s+/).filter(t => t.length > 0);
    const filtered = machines.filter(m => {
        const searchable = [
            m.manufacturer || '',
            m.name || '',
            m.serial || '',
            m.year ? String(m.year) : ''
        ].join(' ').toLowerCase();
        return tokens.length === 0 || tokens.every(t => searchable.includes(t));
    });
    buildProcMachineDropdown(filtered);
    if (filtered.length === 1) {
        document.getElementById('proc-location').value = filtered[0].id;
    } else {
        document.getElementById('proc-location').value = '';
    }
};

window.selectProcMachine = function (id, label) {
    document.getElementById('proc-location').value = id;
    const searchInput = document.getElementById('proc-machine-search');
    if (searchInput) {
        searchInput.value = label;
        searchInput.style.color = id ? 'var(--color-primary-green)' : '';
    }
    const dropdown = document.getElementById('proc-machine-dropdown-portal');
    if (dropdown) dropdown.style.display = 'none';
};

// Close proc dropdown when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('#proc-machine-search') && !e.target.closest('#proc-machine-dropdown-portal')) {
        const d = document.getElementById('proc-machine-dropdown-portal');
        if (d) d.style.display = 'none';
    }
});

// --- Procurement Image Upload Logic ---
window.selectProcurementStatus = function (event) {
    const li = event.target.closest('li');
    if (!li) return;

    const value = li.dataset.value;
    const text = li.textContent;

    document.getElementById('proc-status').value = value;
    const label = document.getElementById('proc-status-label');
    if (label) {
        label.textContent = text;
        label.style.color = '#fff';
    }
};

let procurementFiles = [];
let existingProcurementFiles = [];

document.addEventListener('DOMContentLoaded', () => {
    const procFileInput = document.getElementById('proc-image-upload');
    const procImageSlot = document.getElementById('proc-image-slot');

    if (procFileInput) {
        procFileInput.addEventListener('change', () => {
            handleProcurementFiles(procFileInput.files);
        });
    }

    if (procImageSlot) {
        procImageSlot.addEventListener('dragover', (e) => {
            e.preventDefault();
            procImageSlot.classList.add('drag-over');
        });
        procImageSlot.addEventListener('dragleave', () => {
            procImageSlot.classList.remove('drag-over');
        });
        procImageSlot.addEventListener('drop', (e) => {
            e.preventDefault();
            procImageSlot.classList.remove('drag-over');
            handleProcurementFiles(e.dataTransfer.files);
        });
    }
});

function handleProcurementFiles(files) {
    Array.from(files).forEach(file => {
        if (file.type && file.type.startsWith('image/')) {
            procurementFiles.push(file);
        } else if (file.name && file.name.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
            procurementFiles.push(file);
        } else {
            alert('Bitte nur Bilder hochladen!');
        }
    });
    renderProcurementFilePreviews();
}

function renderProcurementFilePreviews() {
    const previewGrid = document.getElementById('proc-file-previews');
    if (!previewGrid) return;
    previewGrid.innerHTML = '';

    // Render Existing Files
    existingProcurementFiles.forEach((file, index) => {
        renderProcurementFileItem(file, index, true, previewGrid);
    });

    // Render New Files
    procurementFiles.forEach((file, index) => {
        renderProcurementFileItem(file, index, false, previewGrid);
    });
}

function renderProcurementFileItem(file, index, isExisting, container) {
    const item = document.createElement('div');
    item.className = 'file-preview-item';
    item.style.position = 'relative';

    const objectUrl = isExisting ? file.url : URL.createObjectURL(file);
    item.innerHTML = `
        <img src="${objectUrl}" style="width:100%; height:100px; object-fit:cover; border-radius:12px; border: 1px solid rgba(255,255,255,0.1);">
        <button type="button" class="btn-icon-soft delete" style="position:absolute; top:4px; right:4px; width:28px; height:28px; padding:0; background:rgba(239, 68, 68, 0.9); color:white; border-radius: 50%; box-shadow: 0 2px 5px rgba(0,0,0,0.3);"
            onclick="event.stopPropagation(); window.removeProcurementFile(${index}, ${isExisting})">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"></path></svg>
        </button>
    `;
    container.appendChild(item);
}

window.removeProcurementFile = function (index, isExisting) {
    if (isExisting) {
        existingProcurementFiles.splice(index, 1);
    } else {
        procurementFiles.splice(index, 1);
    }
    renderProcurementFilePreviews();
};

async function uploadProcurementFiles() {
    const uploadedFiles = [];
    for (const file of procurementFiles) {
        const cleanName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
        const fileName = `procurements/${Date.now()}-${cleanName}`;

        const { error } = await window.supabaseClient.storage.from('meetra-storage').upload(fileName, file);
        if (error) {
            console.error('Procurement Upload error:', error);
            throw error;
        }

        const { data: pubData } = window.supabaseClient.storage.from('meetra-storage').getPublicUrl(fileName);
        uploadedFiles.push({
            name: file.name,
            type: file.type,
            url: pubData.publicUrl
        });
    }
    return uploadedFiles;
}
