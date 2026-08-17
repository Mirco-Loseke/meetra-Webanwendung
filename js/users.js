// ==========================================
// USER MANAGEMENT LOGIC
// ==========================================
var userList = [];

async function fetchUsers() {
    window.fetchUsers = fetchUsers;
    const client = window.supabaseClient || (typeof supabaseClient !== 'undefined' ? supabaseClient : null);
    if (!client) return;

    // 1. Zuerst sofort aus Cache laden (falls vorhanden)
    let cacheLoaded = false;
    try {
        const cached = localStorage.getItem('offline_users');
        if (cached) {
            userList = JSON.parse(cached);
            window.userList = userList;
            if (typeof renderUserList === 'function') renderUserList();
            if (typeof renderUserDropdown === 'function') renderUserDropdown();
            cacheLoaded = true;
        }
    } catch(e) {}

    if (!navigator.onLine) {
        // Re-render service entries offline too as they depend on userList
        const serviceView = document.getElementById('service');
        if (serviceView && !serviceView.classList.contains('hidden')) {
            if (typeof renderServiceEntries === 'function') renderServiceEntries();
        }
        return;
    }

    // 2. Im Hintergrund frisch vom Netzwerk laden
    let data, error;
    try {
        const result = await window.withTimeout(
            client
                .from('users')
                .select('*')
                .order('created_at', { ascending: true }),
            6000
        );
        data = result.data; error = result.error;
    } catch (timeoutErr) {
        error = timeoutErr;
    }

    if (error) {
        console.error('Error fetching users:', error);
        return;
    }

    try { localStorage.setItem('offline_users', JSON.stringify(data || [])); } catch(e) {}

    userList = data || [];
    window.userList = userList;
    renderUserList();
    renderUserDropdown();

    // Update global list for service report if needed
    if (typeof renderTechDropdown === 'function') {
        renderTechDropdown();
    }
    if (window.activeUser) {
        const freshActiveUser = userList.find(u => String(u.id) === String(window.activeUser.id));
        if (freshActiveUser) {
            if (freshActiveUser.permissions && typeof freshActiveUser.permissions === 'string') {
                try {
                    freshActiveUser.permissions = JSON.parse(freshActiveUser.permissions);
                } catch(e){}
            }
            window.activeUser = freshActiveUser;
            if (typeof activeUser !== 'undefined') {
                activeUser = freshActiveUser;
            }
            window.applyUserPermissions(freshActiveUser);
            const nameEl = document.getElementById('user-welcome-name');
            if (nameEl) {
                nameEl.textContent = `Willkommen zurück, ${window.activeUser.name}! Schön Sie zu sehen.`;
            }
            
            if (typeof window.fetchDocuments === 'function') {
                window.fetchDocuments();
            }
            if (typeof window.fetchTasks === 'function') {
                window.fetchTasks();
            }
            if (typeof window.fetchProtocols === 'function') {
                window.fetchProtocols();
            }
        }
    }

    const serviceView = document.getElementById('service');
    if (serviceView && !serviceView.classList.contains('hidden')) {
        if (typeof renderServiceEntries === 'function') renderServiceEntries();
    }
}

function renderUserList() {
    const listContainer = document.getElementById('user-list');
    if (!listContainer) return;

    listContainer.innerHTML = '';

    // 1. HARDENED ADMIN CHECK WITH STATE FALLBACK
    let activeUserObj = window.activeUser;

    // Fallback to localStorage if state is missing
    if (!activeUserObj) {
        const storedId = localStorage.getItem('activeUserId');
        if (storedId && typeof userList !== 'undefined') {
            activeUserObj = userList.find(u => String(u.id) === String(storedId));
        }
    }

    activeUserObj = activeUserObj || {};
    const currentName = (activeUserObj.name || "").toLowerCase().trim();
    // Extremely robust admin check - Mirco is always Admin
    const isAdmin = currentName.includes("mirco") && currentName.includes("loseke");

    userList.forEach(user => {
        const li = document.createElement('li');
        li.className = 'user-item';
        li.style.setProperty('--user-color', user.color || '#999');

        const targetName = (user.name || "").toLowerCase().trim();
        const isTargetMirco = targetName.includes("mirco") && targetName.includes("loseke");

        // 2. HARDENED ID COMPARISON (Handles Numbers and UUIDs)
        const activeId = activeUserObj.id ? String(activeUserObj.id) : null;
        const targetId = user.id ? String(user.id) : null;
        const isSelf = activeId && targetId && activeId === targetId;

        // 3. PERMISSION LOGIC
        const canEdit = isAdmin || isSelf;
        const canDelete = isAdmin && !isTargetMirco;

        const showPinInList = isAdmin;

        const adminBadgeHtml = isTargetMirco ? `
                    <span class="admin-badge">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                        </svg>
                        Admin
                    </span>` : '';

        li.innerHTML = `
                <div class="user-item-content">
                    ${adminBadgeHtml}
                    <div class="user-info-group">
                        <div class="user-avatar-large" style="position: relative; cursor: pointer;" onclick="document.getElementById('color-picker-${user.id}').click()" title="Farbe ändern">
                            ${user.initials || user.name.substring(0, 2).toUpperCase()}
                            <input type="color" id="color-picker-${user.id}" 
                                   style="position: absolute; opacity: 0; width: 0; height: 0; bottom: 0; right: 0;"
                                   value="${user.color || '#999999'}"
                                   onchange="updateUserColor(${user.id}, this.value)">
                        </div>
                        <div class="user-details">
                            <span class="user-name-link">${user.name}</span>
                            ${showPinInList ? `<span class="user-pin-badge"><span class="user-pin-label">PIN:</span><span class="user-pin-value">${user.pin || '----'}</span></span>` : ''}
                        </div>
                    </div>

                    <div class="user-actions">
                        ${canEdit ? `
                        <button class="btn-icon-circular edit" onclick="editUser('${user.id}')" title="Bearbeiten">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                            </svg>
                        </button>` : ''}
                        ${canDelete ? `
                        <button class="btn-icon-circular delete" onclick="deleteUser('${user.id}')" title="Löschen">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                        </button>` : ''}
                    </div>
                </div>
            `;
        listContainer.appendChild(li);
    });
}

// Helper for random color
function getRandomColor() {
    const colors = ['#D32F2F', '#2ecc71', '#FFA000', '#1976D2', '#9C27B0'];
    return colors[Math.floor(Math.random() * colors.length)];
}

// Expose functions to global scope
window.fetchUsers = fetchUsers;
window.renderUserList = renderUserList;

window.updateUserColor = async function (id, newColor) {
    // Optimistic update
    const user = userList.find(u => u.id === id);
    if (user) {
        user.color = newColor;
        renderUserList(); // Re-render to show update immediately
    }

    console.log('Updating user color in Supabase:', { id, newColor });
    const { error } = await supabaseClient
        .from('users')
        .update({ color: newColor })
        .eq('id', id);

    if (error) {
        console.error('Supabase Error (updateUserColor):', error);
        window.showToast('Fehler beim Speichern der Farbe: ' + (error.message || JSON.stringify(error)));
        fetchUsers(); // Revert on failure
    } else {
        console.log('User color updated successfully');
    }
};

window.editUser = function (id) {
    if (!supabaseClient) { window.showToast('Datenbank nicht verbunden'); return; }

    // Robust lookup using string IDs
    const user = userList.find(u => String(u.id) === String(id));
    if (!user) return;

    const activeUserObj = window.activeUser || {};
    const currentName = (activeUserObj.name || "").toLowerCase().trim();
    const isAdmin = currentName.includes("mirco") && currentName.includes("loseke");

    const activeId = activeUserObj.id ? String(activeUserObj.id) : null;
    const isSelf = activeId && String(user.id) === activeId;

    const targetName = (user.name || "").toLowerCase().trim();
    const isTargetMirco = targetName.includes("mirco") && targetName.includes("loseke");

    document.getElementById('edit-user-id').value = user.id;
    document.getElementById('edit-user-name').value = user.name || '';
    document.getElementById('edit-user-email').value = user.email || '';

    // Hinterlegte Unterschrift anzeigen
    document.getElementById('edit-user-signature').value = user.saved_signature || '';
    const sigImg = document.getElementById('user-signature-preview-img');
    const sigPh = document.getElementById('user-signature-placeholder');
    const sigBtn = document.getElementById('btn-clear-user-signature');
    if (user.saved_signature) {
        if (sigImg) { sigImg.src = user.saved_signature; sigImg.classList.remove('hidden'); sigImg.style.display = 'block'; }
        if (sigPh) sigPh.classList.add('hidden');
        if (sigBtn) sigBtn.classList.remove('hidden');
    } else {
        if (sigImg) { sigImg.src = ''; sigImg.classList.add('hidden'); sigImg.style.display = 'none'; }
        if (sigPh) sigPh.classList.remove('hidden');
        if (sigBtn) sigBtn.classList.add('hidden');
    }

    // PIN Logic: Admin sees all, users see their own
    const pinInput = document.getElementById('edit-user-pin');
    if (pinInput) {
        const canSeePin = isAdmin || isSelf;
        pinInput.value = canSeePin ? (user.pin || '') : '****';
        pinInput.disabled = !canSeePin;
        pinInput.type = canSeePin ? 'text' : 'password';
    }

    const permSection = document.getElementById('edit-permissions-section');
    if (permSection) {
        permSection.style.display = isAdmin ? 'block' : 'none';
    }

    const nameInput = document.getElementById('edit-user-name');
    if (nameInput) {
        nameInput.disabled = isTargetMirco;
        nameInput.style.opacity = isTargetMirco ? '0.5' : '1';
    }

    const defaultPerms = { home: true, tasks: true, machines: true, history: true, accounting: true, settings: true, can_delete: true };
    const perms = (typeof user.permissions === 'object' && user.permissions !== null) ? user.permissions : defaultPerms;

    // Menüpunkte-Liste immer aktuell aus der echten Sidebar erzeugen — so tauchen
    // neue/entfernte Seiten hier automatisch auf, ohne feste Liste pflegen zu müssen.
    const sidebarBox = document.getElementById('perm-sidebar-pages');
    if (sidebarBox) {
        const links = Array.from(document.querySelectorAll('.sidebar-nav li a[data-target]'));
        const seen = new Set();
        sidebarBox.innerHTML = links.map(a => {
            const target = a.getAttribute('data-target');
            if (!target || seen.has(target)) return '';
            seen.add(target);
            const label = (a.textContent || target).replace(/\s+/g, ' ').trim() || target;
            const checked = perms[target] !== false ? 'checked' : '';
            return `<label class="row-clickable"><input class="clickable" type="checkbox" id="perm-${target}" ${checked}> ${label}</label>`;
        }).join('');
    }

    // Restliche (fest hinterlegte) Häkchen — z. B. Einstellungen-Unterseiten — setzen.
    window.PERM_VIEW_KEYS.forEach(key => {
        const cb = document.getElementById('perm-' + key);
        if (cb) cb.checked = perms[key] !== false;
    });
    document.getElementById('perm-delete').checked = perms.can_delete !== false;

    document.getElementById('user-edit-modal').style.display = 'flex';
};

window.closeEditUserModal = function () {
    document.getElementById('user-edit-modal').style.display = 'none';
};

window.saveUserEdit = async function () {
    const id = document.getElementById('edit-user-id').value;
    const newName = document.getElementById('edit-user-name').value;
    const newPin = document.getElementById('edit-user-pin').value;
    const newEmail = document.getElementById('edit-user-email').value.trim() || null;
    const newSignature = document.getElementById('edit-user-signature').value || null;

    const activeUserObj = window.activeUser || {};
    const currentName = (activeUserObj.name || "").toLowerCase().trim();
    const isAdmin = currentName.includes("mirco") && currentName.includes("loseke");

    const userToUpdate = userList.find(u => String(u.id) === String(id));
    const isTargetMirco = userToUpdate && userToUpdate.name === 'Mirco Loseke';

    // Safety check: only admins can change permissions
    // If not admin, we use existing permissions
    let permsToSave;
    if (isAdmin) {
        permsToSave = {};
        // Alle Berechtigungs-Häkchen generisch einsammeln (dynamische Menüpunkte
        // aus der Sidebar + fest hinterlegte Unterseiten), damit nichts fehlt.
        document.querySelectorAll('#edit-permissions-section input[type="checkbox"][id^="perm-"]').forEach(cb => {
            if (cb.id === 'perm-delete') return;
            permsToSave[cb.id.slice(5)] = cb.checked;
        });
        permsToSave.can_delete = document.getElementById('perm-delete').checked;
    } else {
        permsToSave = userToUpdate.permissions;
    }

    if (!newName || newName.trim() === '') {
        window.showToast('Bitte einen Namen eingeben.');
        return;
    }

    const initials = isTargetMirco ? userToUpdate.initials : newName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

    const updatePayload = {
        pin: newPin,
        email: newEmail,
        permissions: permsToSave,
        saved_signature: newSignature
    };

    // Only update name/initials if not Mirco
    if (!isTargetMirco) {
        updatePayload.name = newName;
        updatePayload.initials = initials;
        updatePayload.role = 'Kürzel: ' + initials;
    }

    const { error } = await supabaseClient
        .from('users')
        .update(updatePayload)
        .eq('id', id);

    if (error) {
        window.showToast('Fehler beim Aktualisieren: ' + (error.message || JSON.stringify(error)));
    } else {
        closeEditUserModal();
        fetchUsers();
    }
};

window.deleteUser = async function (id) {
    if (typeof window.canDelete === 'function' && !window.canDelete('Benutzern')) return;
    if (!supabaseClient) { window.showToast('Datenbank nicht verbunden'); return; }

    const user = userList.find(u => String(u.id) === String(id));
    if (!user) return;

    if (!confirm(`Möchten Sie den Benutzer "${user.name}" wirklich unwiderruflich löschen?`)) {
        return;
    }

    console.log('Deleting user from Supabase:', id);
    const { error } = await supabaseClient
        .from('users')
        .delete()
        .eq('id', id);

    if (error) {
        console.error('Supabase Error (deleteUser):', error);
        window.showToast('Fehler beim Löschen: ' + (error.message || JSON.stringify(error)));
    } else {
        console.log('User deleted successfully');
        fetchUsers();
    }
};

// DOM listener helper for user management setup
document.addEventListener('DOMContentLoaded', () => {
    const addUserBtn = document.getElementById('add-user-btn');
    if (addUserBtn) {
        const newBtn = addUserBtn.cloneNode(true);
        addUserBtn.parentNode.replaceChild(newBtn, addUserBtn);

        newBtn.addEventListener('click', async () => {
            if (!supabaseClient) { window.showToast('Datenbank nicht verbunden'); return; }
            const name = prompt('Name des neuen Benutzers:');
            if (name) {
                const initials = name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
                const newUser = {
                    name: name,
                    initials: initials,
                    role: 'Kürzel: ' + initials,
                    color: getRandomColor()
                };
                const { error } = await supabaseClient
                    .from('users')
                    .insert([newUser]);

                if (error) {
                    window.showToast('Fehler beim Anlegen: ' + error.message);
                } else {
                    fetchUsers();
                }
            }
        });
    }
});
window.fetchUsers = fetchUsers;
