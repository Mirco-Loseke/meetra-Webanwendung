// procurements.js - Logic for the Order/Procurement Module

let allProcurements = [];
let currentProcurement = null;

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

function renderProcurements(procurements) {
    const listContainer = document.getElementById('procurement-list');
    const emptyState = document.getElementById('procurement-empty-state');

    if (!listContainer) return;

    listContainer.innerHTML = '';

    if (procurements.length === 0) {
        emptyState.classList.remove('hidden');
        return;
    } else {
        emptyState.classList.add('hidden');
    }

    procurements.forEach(proc => {
        // Find creator name
        let creatorName = 'Unbekannt';
        let color = 'var(--primary-red)';
        let initials = '??';

        if (window.userList) {
            const creator = window.userList.find(u => u.id === proc.created_by || u.id === String(proc.created_by));
            if (creator) {
                creatorName = creator.name;
                color = creator.color || color;
                initials = creator.initials || creatorName.substring(0, 2).toUpperCase();
            }
        }

        // Status mapping
        const statusMap = {
            'new': { label: 'Neu', class: 'status-new', iconColor: '#ef4444' },
            'ordered': { label: 'Bestellt', class: 'status-ordered', iconColor: '#f59e0b' },
            'received': { label: 'Erhalten', class: 'status-received', iconColor: '#10b981' }
        };
        const status = statusMap[proc.status] || statusMap['new'];

        const tr = document.createElement('tr');
        tr.className = status.class;
        if (proc.status === 'received') tr.classList.add('completed-task');
        tr.style.cursor = 'pointer';
        tr.onclick = () => showStatusUpdateMenu(proc.id, tr);

        tr.innerHTML = `
            <td>
                <span class="status-pill" style="background: rgba(255,255,255,0.1); color: #fff; border: 1px solid rgba(255,255,255,0.15); padding: 5px 12px; border-radius: 10px; font-size: 0.85rem; font-weight: 700; display: inline-flex; align-items: center; gap: 8px;">
                    <span style="width: 10px; height: 10px; border-radius: 50%; background: ${status.iconColor}; box-shadow: 0 0 8px ${status.iconColor}88;"></span>
                    ${status.label}
                </span>
            </td>
            <td>${getCategoryBadge(proc.category)}</td>
            <td>
                <div style="font-size: 0.95rem; font-weight: 500; color: rgba(255,255,255,0.8);">
                    ${(() => {
                if (!proc.location_ref || !window.machineList) return '-';
                const machine = window.machineList.find(m => String(m.id) === String(proc.location_ref));
                if (!machine) return proc.location_ref;

                let parts = [
                    machine.manufacturer,
                    machine.name,
                    machine.type,
                    machine.serial ? '#' + machine.serial : null,
                    machine.year ? '(' + machine.year + ')' : null
                ].filter(Boolean);

                return parts.join(' ');
            })()}
                </div>
            </td>
            <td>
                <div style="display: flex; flex-direction: column; gap: 4px;">
                    <span style="font-weight: 600; font-size: 1.05rem;">${proc.title}</span>
                    <span style="font-size: 0.85rem; color: rgba(255,255,255,0.5);">${proc.description || ''}</span>
                </div>
            </td>
            <td>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <div class="user-avatar-small" style="width: 24px; height: 24px; border-radius: 50%; background-color: ${color}; display: flex; align-items: center; justify-content: center; font-size: 0.65rem; font-weight: bold; color: white;">
                        ${initials}
                    </div>
                    <span>${creatorName}</span>
                </div>
            </td>
            <td style="color: rgba(255,255,255,0.6);">${new Date(proc.created_at).toLocaleDateString('de-DE')}</td>
            <td>
                <div class="procurement-actions">
                    <button class="btn-icon-soft edit" onclick="event.stopPropagation(); openProcurementModal('${proc.id}')" title="Bearbeiten">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                    </button>
                    <button class="btn-icon-soft delete" onclick="event.stopPropagation(); deleteProcurement('${proc.id}')" title="Löschen">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                    </button>
                </div>
            </td>
        `;

        listContainer.appendChild(tr);
    });
}

function showStatusUpdateMenu(procId, element) {
    const proc = allProcurements.find(p => p.id === procId);
    if (!proc) return;

    // Remove any existing menu
    const existingMenu = document.querySelector('.status-update-menu');
    if (existingMenu) existingMenu.remove();

    // Create status update menu
    const menu = document.createElement('div');
    menu.className = 'status-update-menu';
    menu.style.cssText = `
        position: absolute;
        background: rgba(15, 23, 42, 0.98);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 12px;
        padding: 8px;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
        z-index: 10000;
        backdrop-filter: blur(20px);
        min-width: 140px;
    `;

    const statuses = [
        { value: 'new', label: '🔴 Neu' },
        { value: 'ordered', label: '🟠 Bestellt' },
        { value: 'received', label: '🟢 Erhalten' }
    ];

    statuses.forEach(status => {
        const btn = document.createElement('button');
        btn.textContent = status.label;
        btn.style.cssText = `
            display: block;
            width: 100%;
            padding: 10px 14px;
            margin: 2px 0;
            background: ${proc.status === status.value ? 'rgba(255, 255, 255, 0.1)' : 'transparent'};
            border: none;
            border-radius: 8px;
            color: white;
            cursor: pointer;
            text-align: left;
            font-size: 0.95rem;
            font-weight: 600;
            transition: all 0.2s;
        `;
        btn.onmouseover = () => btn.style.background = 'rgba(255, 255, 255, 0.15)';
        btn.onmouseout = () => btn.style.background = proc.status === status.value ? 'rgba(255, 255, 255, 0.1)' : 'transparent';
        btn.onclick = (e) => {
            e.stopPropagation();
            updateProcurementStatus(procId, status.value);
            menu.remove();
        };
        menu.appendChild(btn);
    });

    // Position menu near the element
    const rect = element.getBoundingClientRect();
    menu.style.left = `${rect.left + (rect.width / 4)}px`;
    menu.style.top = `${rect.top + (rect.height / 2)}px`;

    document.body.appendChild(menu);

    // Close menu when clicking outside
    setTimeout(() => {
        document.addEventListener('click', function closeMenu(e) {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        });
    }, 10);
}

async function updateProcurementStatus(id, newStatus) {
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

    // Populate Machine Dropdown if window.machineList exists
    const machineListDropdown = document.getElementById('proc-machine-list');
    if (machineListDropdown && window.machineList) {
        let html = '<li data-value="">Ohne Zuordnung</li>';
        window.machineList.forEach(m => {
            let displayText = `${m.manufacturer || ''} ${m.name || ''}`.trim();
            if (m.serial) displayText += ` #${m.serial}`;
            if (m.year) displayText += ` (${m.year})`;
            html += `<li data-value="${m.id}">${displayText}</li>`;
        });
        machineListDropdown.innerHTML = html;
    }

    // Reset form
    document.getElementById('procurement-form').reset();
    document.getElementById('procurement-id').value = '';

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
            document.getElementById('proc-priority').value = proc.priority;
            document.getElementById('proc-delivery-date').value = proc.delivery_date || '';
            document.getElementById('proc-link').value = proc.product_link || '';
            document.getElementById('proc-location').value = proc.location_ref || '';

            // Load existing files
            if (proc.files && Array.isArray(proc.files)) {
                existingProcurementFiles = [...proc.files];
                renderProcurementFilePreviews();
            }

            document.getElementById('procurement-modal-title').textContent = `Bestellung ${proc.order_number} bearbeiten`;

            // Handle status label restoration
            if (proc.status && statusLabel) {
                const statusMap = {
                    'new': '🔴 Neu',
                    'ordered': '🟠 Bestellt',
                    'received': '🟢 Erhalten'
                };
                statusLabel.textContent = statusMap[proc.status] || '🔴 Neu';
                document.getElementById('proc-status').value = proc.status;
            }

            // Handle location label restoration
            const locLabel = document.getElementById('proc-machine-label');
            if (proc.location_ref && locLabel && window.machineList) {
                const selectedMachine = window.machineList.find(m => String(m.id) === String(proc.location_ref));
                if (selectedMachine) {
                    let displayText = `${selectedMachine.manufacturer || ''} ${selectedMachine.name || ''}`.trim();
                    if (selectedMachine.serial) displayText += ` #${selectedMachine.serial}`;
                    if (selectedMachine.year) displayText += ` (${selectedMachine.year})`;
                    locLabel.textContent = displayText;
                    locLabel.style.opacity = '1';
                } else {
                    locLabel.textContent = proc.location_ref;
                    locLabel.style.opacity = '1';
                }
            } else if (locLabel) {
                locLabel.textContent = 'Ohne Zuordnung';
                locLabel.style.opacity = '0.6';
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
    const priority = document.getElementById('proc-priority').value;
    const delivery_date = document.getElementById('proc-delivery-date').value || null;
    const product_link = document.getElementById('proc-link').value;
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
        'new': 'Neu',
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

window.selectProcurementMachine = function (event) {
    const li = event.target.closest('li');
    if (!li) return;

    const value = li.dataset.value;
    const text = li.textContent;

    document.getElementById('proc-location').value = value;
    const label = document.getElementById('proc-machine-label');
    label.textContent = text;

    if (value) {
        label.style.opacity = '1';
        label.style.color = '#fff';
    } else {
        label.style.opacity = '0.6';
        label.style.color = 'inherit';
    }
}

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
