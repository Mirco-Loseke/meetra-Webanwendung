/* ==========================================================================
   Supabase Authentication & User Switcher / Profile Logic
   ========================================================================== */

window.showLoginError = function(message) {
    document.getElementById('login-error-message').textContent = message;
    const modal = document.getElementById('login-error-modal');
    if (modal) {
        modal.style.display = 'flex';
        setTimeout(() => {
            modal.firstElementChild.style.transform = 'scale(1)';
        }, 10);
    }
};

window.closeLoginErrorModal = function() {
    const modal = document.getElementById('login-error-modal');
    if (modal) {
        modal.firstElementChild.style.transform = 'scale(0.9)';
        setTimeout(() => {
            modal.style.display = 'none';
        }, 150);
    }
};

window.supabaseLogout = async function() {
    if (window.supabaseClient) {
        await window.supabaseClient.auth.signOut();
    }
    localStorage.removeItem('activeUserId');
    localStorage.removeItem('lastActiveUserId');
    if (typeof window.activeUser !== 'undefined') window.activeUser = null;

    // Input-Felder leeren
    const idInput = document.getElementById('supabase-login-identifier');
    const pwInput = document.getElementById('supabase-login-password');
    if (idInput) idInput.value = '';
    if (pwInput) pwInput.value = '';

    document.getElementById('app-layout').style.display = 'none';
    document.getElementById('supabase-login-screen').style.display = 'flex';
};

window.submitSupabaseLogin = async function() {
    const identifier = document.getElementById('supabase-login-identifier').value.trim();
    const password = document.getElementById('supabase-login-password').value;
    const btn = document.querySelector('#supabase-login-screen .btn-primary');

    if (!identifier || !password) {
        window.showLoginError('Bitte Benutzername/E-Mail und Passwort eingeben.');
        return;
    }

    btn.disabled = true;
    const originalText = btn.textContent;
    btn.textContent = 'Anmeldung läuft...';

    try {
        let email = identifier;
        
        // Wenn es keine E-Mail-Adresse ist (kein @-Zeichen), suchen wir in der users-Datenbank nach der E-Mail des Namens
        if (!identifier.includes('@')) {
            let lookupEmail = null;
            
            // Zuerst versuchen wir es sicher per RPC (umgeht RLS vor dem Login)
            try {
                const { data: rpcData, error: rpcErr } = await window.supabaseClient
                    .rpc('get_email_by_name', { username: identifier });
                
                if (!rpcErr && rpcData && rpcData.length > 0 && rpcData[0].email) {
                    lookupEmail = rpcData[0].email;
                }
            } catch (rpcErr) {
                console.warn('RPC Lookup fehlgeschlagen, versuche Tabellen-Select:', rpcErr);
            }

            // Fallback: Wenn RPC fehlschlug oder keine E-Mail zurücklieferte, direktes Select (falls RLS aus ist)
            if (!lookupEmail) {
                const { data, error: userErr } = await window.supabaseClient
                    .from('users')
                    .select('email')
                    .ilike('name', identifier)
                    .maybeSingle();

                if (data && data.email) {
                    lookupEmail = data.email;
                }
            }

            if (lookupEmail) {
                email = lookupEmail;
            } else {
                throw new Error('Benutzername nicht gefunden oder keine E-Mail-Adresse zugeordnet. Bitte versuchen Sie es zuerst mit Ihrer E-Mail.');
            }
        }

        // Supabase Login
        const { data: authData, error: authErr } = await window.supabaseClient.auth.signInWithPassword({
            email: email,
            password: password
        });

        if (authErr) throw authErr;

        console.log('Supabase Login erfolgreich:', authData);
        
        // Nach erfolgreichem Login laden wir die Daten
        if (typeof fetchUsers === 'function') await fetchUsers();
        if (typeof fetchCategories === 'function') await fetchCategories();
        if (typeof fetchMachines === 'function') await fetchMachines();
        if (typeof fetchServiceEntries === 'function') await fetchServiceEntries();
        if (typeof window.loadUvvWartungsplaene === 'function') await window.loadUvvWartungsplaene();
        if (typeof window.initRealtimeSubscriptions === 'function') window.initRealtimeSubscriptions();

        // Login-Screen ausblenden
        document.getElementById('supabase-login-screen').style.display = 'none';

        // Profil automatisch auswählen, wenn E-Mail übereinstimmt
        const sessionEmail = authData?.user?.email;
        let matchedUser = sessionEmail ? window.userList.find(u => u.email && u.email.toLowerCase() === sessionEmail.toLowerCase()) : null;

        // Fallback: Wenn kein Profil passt, nimm das erste verfügbare Profil
        if (!matchedUser && window.userList && window.userList.length > 0) {
            matchedUser = window.userList[0];
        }

        if (matchedUser) {
            window.executeLogin(matchedUser.id);
        } else {
            window.showLoginError('Keine Benutzerprofile in der Datenbank "users" gefunden! Bitte legen Sie dort Profile an.');
        }

    } catch (err) {
        console.error('Login-Fehler:', err);
        let msg = err.message;
        if (msg === 'Invalid login credentials') {
            msg = 'Benutzername, E-Mail oder Passwort ist falsch. Bitte überprüfen Sie Ihre Eingaben.';
        }
        window.showLoginError(msg);
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
};

window.checkAuth = async function() {
    if (!window.supabaseClient) return;

    // Offline: Session lässt sich nicht prüfen/erneuern — App trotzdem mit
    // zwischengespeicherten Daten öffnen, statt am Login-Bildschirm zu blockieren
    if (!navigator.onLine) {
        document.getElementById('supabase-login-screen').style.display = 'none';

        if (typeof window.fetchUsers === 'function') await window.fetchUsers();
        else if (typeof fetchUsers === 'function') await fetchUsers();

        if (typeof window.fetchCategories === 'function') await window.fetchCategories();
        else if (typeof fetchCategories === 'function') await fetchCategories();

        if (typeof window.fetchMachines === 'function') await window.fetchMachines();
        else if (typeof fetchMachines === 'function') await fetchMachines();

        if (typeof window.fetchServiceEntries === 'function') await window.fetchServiceEntries();
        else if (typeof fetchServiceEntries === 'function') await fetchServiceEntries();
        if (typeof window.loadUvvWartungsplaene === 'function') await window.loadUvvWartungsplaene();
        if (typeof window.initRealtimeSubscriptions === 'function') window.initRealtimeSubscriptions();

        const lastUserId = localStorage.getItem('activeUserId');
        const lastUser = lastUserId ? (window.userList || []).find(u => String(u.id) === String(lastUserId)) : null;
        if (lastUser) {
            window.executeLogin(lastUser.id);
        } else if (window.userList && window.userList.length > 0) {
            window.executeLogin(window.userList[0].id);
        } else {
            window.showLoginError('Offline: Es sind noch keine Benutzerdaten zwischengespeichert. Bitte einmal mit Internet anmelden.');
        }
        return;
    }

    let session, error;
    try {
        const result = await window.withTimeout(window.supabaseClient.auth.getSession());
        session = result.data.session; error = result.error;
    } catch (timeoutErr) {
        // Netzwerk hängt (z.B. WLAN ohne echtes Internet) — wie offline behandeln,
        // statt den Nutzer am Login-Bildschirm zu blockieren
        document.getElementById('supabase-login-screen').style.display = 'none';
        if (typeof window.fetchUsers === 'function') await window.fetchUsers();
        else if (typeof fetchUsers === 'function') await fetchUsers();

        if (typeof window.fetchCategories === 'function') await window.fetchCategories();
        else if (typeof fetchCategories === 'function') await fetchCategories();

        if (typeof window.fetchMachines === 'function') await window.fetchMachines();
        else if (typeof fetchMachines === 'function') await fetchMachines();

        if (typeof window.fetchServiceEntries === 'function') await window.fetchServiceEntries();
        else if (typeof fetchServiceEntries === 'function') await fetchServiceEntries();
        if (typeof window.loadUvvWartungsplaene === 'function') await window.loadUvvWartungsplaene();
        if (typeof window.initRealtimeSubscriptions === 'function') window.initRealtimeSubscriptions();
        const lastUserId = localStorage.getItem('activeUserId');
        const lastUser = lastUserId ? (window.userList || []).find(u => String(u.id) === String(lastUserId)) : null;
        if (lastUser) {
            window.executeLogin(lastUser.id);
        } else if (window.userList && window.userList.length > 0) {
            window.executeLogin(window.userList[0].id);
        } else {
            window.showLoginError('Keine Internetverbindung und keine zwischengespeicherten Benutzerdaten vorhanden.');
        }
        return;
    }

    if (error || !session) {
        document.getElementById('app-layout').style.display = 'none';
        document.getElementById('supabase-login-screen').style.display = 'flex';
    } else {
        document.getElementById('supabase-login-screen').style.display = 'none';
        
        // Daten laden, da wir eingeloggt sind
        if (typeof window.fetchUsers === 'function') await window.fetchUsers();
        else if (typeof fetchUsers === 'function') await fetchUsers();

        if (typeof window.fetchCategories === 'function') await window.fetchCategories();
        else if (typeof fetchCategories === 'function') await fetchCategories();

        if (typeof window.fetchMachines === 'function') await window.fetchMachines();
        else if (typeof fetchMachines === 'function') await fetchMachines();

        if (typeof window.fetchServiceEntries === 'function') await window.fetchServiceEntries();
        else if (typeof fetchServiceEntries === 'function') await fetchServiceEntries();
        if (typeof window.loadUvvWartungsplaene === 'function') await window.loadUvvWartungsplaene();
        if (typeof window.initRealtimeSubscriptions === 'function') window.initRealtimeSubscriptions();

        // Profil automatisch auswählen, wenn E-Mail übereinstimmt
        const sessionEmail = session?.user?.email;
        let matchedUser = sessionEmail ? (window.userList || []).find(u => u.email && u.email.toLowerCase() === sessionEmail.toLowerCase()) : null;

        // Fallback: Wenn kein Profil passt, nimm das erste verfügbare Profil
        if (!matchedUser && window.userList && window.userList.length > 0) {
            matchedUser = window.userList[0];
        }

        if (matchedUser) {
            window.executeLogin(matchedUser.id);
        } else {
            window.showLoginError('Keine Benutzerprofile in der Datenbank "users" gefunden! Bitte legen Sie dort Profile an.');
        }
    }
};

let pendingLoginUserId = null;

window.attemptUserLogin = function (userId) {
    const user = (window.userList || []).find(u => u.id === userId);
    if (!user) return;

    if (user.pin && user.pin.trim() !== '') {
        // User has a PIN, show prompt
        pendingLoginUserId = userId;
        document.getElementById('pin-prompt-user-name').textContent = user.name;
        document.getElementById('pin-input').value = '';
        document.getElementById('pin-prompt-modal').style.display = 'flex';
        setTimeout(() => document.getElementById('pin-input').focus(), 100);
    } else {
        // No PIN, login directly
        window.executeLogin(userId);
    }
};

window.submitPinLogin = function () {
    if (!pendingLoginUserId) return;
    const user = (window.userList || []).find(u => u.id === pendingLoginUserId);
    const enteredPin = document.getElementById('pin-input').value;

    if (user && user.pin === enteredPin) {
        document.getElementById('pin-prompt-modal').style.display = 'none';
        window.executeLogin(pendingLoginUserId);
        pendingLoginUserId = null;
    } else {
        window.showToast('Falsche PIN!');
        document.getElementById('pin-input').value = '';
        document.getElementById('pin-input').focus();
    }
};

window.cancelPinLogin = function () {
    document.getElementById('pin-prompt-modal').style.display = 'none';
    pendingLoginUserId = null;
};

window.executeLogin = function(userId) {
    const screen = document.getElementById('profile-selection-screen');
    if (screen) screen.style.display = 'none';

    const appLayout = document.getElementById('app-layout');
    if (appLayout) appLayout.style.display = 'flex';

    // Remember this user for next time
    localStorage.setItem('lastActiveUserId', userId);

    window.setActiveUser(userId);
};

window.setActiveUser = function(userId) {
    const user = (window.userList || []).find(u => u.id === userId);
    if (!user) return;

    if (user.permissions && typeof user.permissions === 'string') {
        try {
            user.permissions = JSON.parse(user.permissions);
        } catch(e){}
    }

    window.activeUser = user;

    // Update User Profile UI
    const profileName = document.querySelector('.sidebar-user-profile .user-name');
    const profileAvatar = document.querySelector('.sidebar-user-profile .user-avatar');

    if (profileName) profileName.textContent = user.name;
    if (profileAvatar) {
        profileAvatar.textContent = user.initials || user.name.substring(0, 2).toUpperCase();
        if (user.color) {
            profileAvatar.style.background = user.color;
        }
    }

    // Save to LocalStorage
    localStorage.setItem('activeUserId', userId);

    // Apply Permissions UI Filter
    if (typeof window.applyUserPermissions === 'function') {
        window.applyUserPermissions(user);
    }

    // Re-render dropdown to update highlights
    if (typeof window.renderUserDropdown === 'function') {
        window.renderUserDropdown();
    }

    // Re-render user list to update permissions/icons immediately
    if (typeof renderUserList === 'function') {
        renderUserList();
    }

    // Force modules to reload/re-render lists to reflect permission updates in real-time
    if (typeof window.fetchDocuments === 'function') {
        window.fetchDocuments();
    }
    if (typeof window.fetchTasks === 'function') {
        window.fetchTasks();
    }
    if (typeof window.fetchProtocols === 'function') {
        window.fetchProtocols();
    }
    if (typeof window.renderServiceEntries === 'function') {
        window.renderServiceEntries();
    }

    // Close dropdown
    const dropdown = document.querySelector('.sidebar-user-profile .user-dropdown-menu');
    if (dropdown) {
        dropdown.classList.remove('show');
    }

    // Refresh dashboard if on home view
    if (typeof renderDashboard === 'function') {
        renderDashboard();
    }
};
