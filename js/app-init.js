// ==========================================================
// App-Start: alles, was beim Laden der Seite eingerichtet wird (DOMContentLoaded)
// ==========================================================
// Ausgelagert aus index.html (vormals Zeilen 5151-9758).
// Wird in index.html an unveraenderter Stelle per <script src> geladen;
// die Reihenfolge der Skripte entspricht der fruaeheren Reihenfolge im
// Inline-Block und darf nicht vertauscht werden.
// ==========================================================
        document.addEventListener('DOMContentLoaded', () => {
            console.log('DOM Ready');
            const sidebar = document.getElementById('sidebar');
            const mainWrapper = document.getElementById('main-wrapper');

            // ---- Sidebar toggle via addEventListener (no onclick attribute) ----
            var _sidebarToggling = false;
            var _sidebarBtn = document.getElementById('sidebar-toggle');
            if (_sidebarBtn) {
                _sidebarBtn.addEventListener('click', function (e) {
                    e.stopPropagation();
                    e.preventDefault();
                    if (_sidebarToggling) return; // debounce guard
                    _sidebarToggling = true;
                    setTimeout(function () { _sidebarToggling = false; }, 200);

                    var sb = document.getElementById('sidebar');
                    var mw = document.getElementById('main-wrapper');
                    if (!sb) return;
                    sb.classList.toggle('collapsed');
                    if (mw) mw.classList.toggle('collapsed-sidebar');
                });
            }

            // Also expose as global for mobile compatibility
            window.toggleSidebar = function () {
                var sb = document.getElementById('sidebar');
                var mw = document.getElementById('main-wrapper');
                if (!sb) return;
                sb.classList.toggle('collapsed');
                if (mw) mw.classList.toggle('collapsed-sidebar');
            };

            // Default: start collapsed on page load
            (function () {
                var sb = document.getElementById('sidebar');
                var mw = document.getElementById('main-wrapper');
                if (sb) sb.classList.add('collapsed');
                if (mw) mw.classList.add('collapsed-sidebar');
            })();

            // Load Users if on user view or just generally on startup after authentication
            if (supabaseClient) {
                // Add keydown listeners for Enter key on login fields
                const loginIdentifier = document.getElementById('supabase-login-identifier');
                const loginPassword = document.getElementById('supabase-login-password');
                if (loginIdentifier && loginPassword) {
                    const handleEnter = (e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            window.submitSupabaseLogin();
                        }
                    };
                    loginIdentifier.addEventListener('keydown', handleEnter);
                    loginPassword.addEventListener('keydown', handleEnter);
                }

                // Initialize Machine Category Filter Trigger
                const categoryFilterTrigger = document.getElementById('machine-category-filter-trigger');
                if (categoryFilterTrigger) {
                    categoryFilterTrigger.addEventListener('click', toggleCategoryFilter);
                }

                // Initialize Machine Series Filter Trigger
                const seriesFilterTrigger = document.getElementById('machine-series-filter-trigger');
                if (seriesFilterTrigger) {
                    seriesFilterTrigger.addEventListener('click', toggleSeriesFilter);
                }

                // Initialize Machine Contact Filter Trigger
                const contactFilterTrigger = document.getElementById('machine-contact-filter-trigger');
                if (contactFilterTrigger) {
                    contactFilterTrigger.addEventListener('click', toggleContactFilter);
                }

                // Initialize Service Category Filter Trigger
                const serviceCategoryFilterTrigger = document.getElementById('service-category-filter-trigger');
                if (serviceCategoryFilterTrigger) {
                    serviceCategoryFilterTrigger.addEventListener('click', toggleServiceCategoryFilter);
                }
            }

            // Shared Navigation Function
            window.navigateTo = function (targetId) {
                if (targetId === 'machines') {
                    // Filter zurücksetzen bei Klick auf "Maschinen gesamt"
                    window.activeMachineCategoryFilters = ['all'];
                    window.activeMachineContactFilters = ['all'];
                    window.activeMachineSeriesFilters = ['all'];
                    window.machineSearchFilter = '';
                    const searchInput = document.getElementById('machine-search-input');
                    if (searchInput) searchInput.value = '';
                }
                window.switchView(targetId);
            };

            // History and Back/Forward support for Navigation Highlight
            window.addEventListener('hashchange', () => {
                const hash = window.location.hash.replace('#', '') || 'home';
                if (window.currentActiveView !== hash) {
                    window.switchView(hash);
                }
            });

            window.switchView = function (targetId) {
                console.log('Switching to view:', targetId);
                const views = document.querySelectorAll('.view');
                const navLinks = document.querySelectorAll('.nav-link');
                let found = false;

                views.forEach(view => {
                    if (view.id === targetId) {
                        view.classList.remove('hidden');
                        view.classList.add('active');
                        view.style.display = 'block';
                        found = true;
                    } else {
                        view.classList.remove('active');
                        view.classList.add('hidden');
                        view.style.display = 'none';
                    }
                });

                // Update sidebar active states (including settings sub-views)
                navLinks.forEach(link => {
                    const target = link.getAttribute('data-target');
                    let isActive = false;

                    if (target === targetId) {
                        isActive = true;
                    } else if (target === 'settings') {
                        const settingsSubViews = [
                            'settings',
                            'settings-firmeneinstellungen',
                            'settings-import',
                            'settings-textbausteine',
                            'settings-ai',
                            'settings-uvv-wartungsplaene',
                            'settings-etiketten',
                            'users',
                            'categories',
                            'protocol-templates',
                            'protocol-template-editor'
                        ];
                        if (settingsSubViews.includes(targetId)) {
                            isActive = true;
                        }
                    }

                    if (isActive) {
                        link.classList.add('active');
                    } else {
                        link.classList.remove('active');
                    }
                });

                // Update URL hash so the active state survives soft navigations
                if (history.replaceState) {
                    history.replaceState(null, '', '#' + targetId);
                }

                // Synchronize tracker variable
                window.currentActiveView = targetId;

                // Special logic for specific views (trigger data rendering/fetching immediately)
                if (targetId === 'home') {
                    renderDashboard();
                } else if (targetId === 'machines') {
                    if (typeof window.renderMachines === 'function') {
                        window.renderMachines('machine-list-container');
                    }
                } else if (targetId === 'addressbook') {
                    if (typeof window.loadAddressbook === 'function') {
                        window.loadAddressbook();
                    }
                } else if (targetId === 'categories') {
                    // Nach alten Kategorie-Namen suchen, die noch an Datensätzen hängen.
                    if (typeof window.scanOrphanCategoryNames === 'function') {
                        window.scanOrphanCategoryNames();
                    }
                } else if (targetId === 'tasks') {
                    if (typeof window.switchTaskView === 'function') {
                        window.switchTaskView('board');
                    }
                    if (typeof window.fetchTasks === 'function') {
                        window.fetchTasks();
                    }
                    if (typeof window.fetchMachinesForTasks === 'function') {
                        window.fetchMachinesForTasks();
                    }
                } else if (targetId === 'service') {
                    if (typeof fetchServiceEntries === 'function') {
                        fetchServiceEntries();
                    }
                } else if (targetId === 'processes') {
                    // Über filterProcessesByUser, damit der zuletzt gewählte Tab
                    // ("Vorgänge" / "Meine Vorgänge") auch optisch stimmt.
                    if (typeof window.filterProcessesByUser === 'function') {
                        window.filterProcessesByUser(window.isMyProcessesFilterActive ? 'me' : 'all');
                    } else if (typeof window.renderProcesses === 'function') {
                        window.renderProcesses('standalone-processes-container');
                    }
                    if (!window.eventsState || !Array.isArray(window.eventsState.processes) || window.eventsState.processes.length === 0) {
                        if (typeof window.fetchProcesses === 'function') window.fetchProcesses();
                    }
                } else if (targetId === 'protocols') {
                    if (typeof window.fetchProtocols === 'function') {
                        window.fetchProtocols();
                    }
                } else if (targetId === 'accounting') {
                    if (typeof fetchAccountingEntries === 'function') {
                        fetchAccountingEntries();
                    }
                } else if (targetId === 'documents') {
                    if (typeof window.fetchDocuments === 'function') {
                        window.fetchDocuments();
                    }
                } else if (targetId === 'listen') {
                    if (typeof window.fetchAngebote === 'function') {
                        window.fetchAngebote();
                    }
                } else if (targetId === 'routenplanung') {
                    // Wenn gerade eine Adresse im Adressbuch-Detail geöffnet ist,
                    // diese Adresse direkt als ersten Stopp übernehmen.
                    const abState = window.addressbookState;
                    const detailModal = document.getElementById('addressbook-detail-modal');
                    const detailOpen = detailModal && (detailModal.classList.contains('show') || detailModal.classList.contains('active'));
                    const openAddr = abState && detailOpen && abState.currentId
                        ? abState.byId.get(String(abState.currentId))
                        : null;
                    if (openAddr && typeof window.rp2StartRouteWithAddresses === 'function') {
                        if (typeof window.closeModal === 'function') window.closeModal('addressbook-detail-modal');
                        window.rp2StartRouteWithAddresses([openAddr]);
                    } else if (typeof window.rp2Init === 'function') {
                        window.rp2Init();
                    }
                } else if (targetId === 'calendar') {
                    if (typeof window.renderEvents === 'function') {
                        window.renderEvents();
                    }
                } else if (targetId === 'settings-ai') {
                    // Kein Schlüsselfeld mehr — der Zugang liegt serverseitig.
                    // Beim Öffnen gleich zeigen, ob der Dienst antwortet.
                    if (typeof window.pruefeKiVerbindung === 'function') window.pruefeKiVerbindung();
                } else if (targetId === 'settings-uvv-wartungsplaene') {
                    if (typeof window.loadUvvWartungsplaene === 'function') {
                        window.loadUvvWartungsplaene();
                    }
                } else if (targetId === 'settings-etiketten') {
                    if (typeof window.fetchLabelArticles === 'function') {
                        window.fetchLabelArticles();
                    }
                }

                // Floating Focus Mode button: only visible on the Aufgaben (tasks) page
                const focusModeContainer = document.getElementById('focus-mode-container');
                if (focusModeContainer) {
                    focusModeContainer.style.display = (targetId === 'tasks') ? 'flex' : 'none';
                }

                if (!found) {
                    console.warn('View ID not found:', targetId);
                }
            };

            // Initialize Settings Card Listeners
            const initSettingsNavigation = () => {
                const settingsCards = document.querySelectorAll('.settings-card');
                settingsCards.forEach(card => {
                    card.addEventListener('click', () => {
                        const target = card.getAttribute('data-target');
                        if (target) window.switchView(target);
                    });
                });

                const backBtns = document.querySelectorAll('.btn-back-custom');
                backBtns.forEach(btn => {
                    btn.addEventListener('click', () => {
                        const target = btn.getAttribute('data-target');
                        if (target) window.switchView(target);
                    });
                });
            };

            // Initialize Settings Card Listeners directly since we are already inside a DOMContentLoaded
            initSettingsNavigation();

            // Navigation Listeners (Sidebar)
            const navLinks = document.querySelectorAll('.nav-link');
            navLinks.forEach(link => {
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    const targetId = link.getAttribute('data-target');
                    if (targetId) switchView(targetId);
                });
            });

            // Initialize User Dropdown
            const userTrigger = document.getElementById('userProfileTrigger');
            if (userTrigger) {
                const dropdown = userTrigger.querySelector('.user-dropdown-menu');

                userTrigger.addEventListener('click', (e) => {
                    e.stopPropagation();
                    dropdown.classList.toggle('show');
                });

                document.addEventListener('click', () => {
                    dropdown.classList.remove('show');
                });
            }

            // ==========================================
            // USER SWITCHER LOGIC
            // ==========================================
            window.renderUserDropdown = function() {
                const dropdownList = document.getElementById('user-dropdown-list');
                if (!dropdownList) return;

                dropdownList.innerHTML = '';
                const uList = window.userList || [];
                console.log('Rendering user dropdown with', uList.length, 'users');

                uList.forEach(user => {
                    const li = document.createElement('li');
                    li.style.display = 'flex';
                    li.style.alignItems = 'center';
                    li.style.gap = '12px';
                    li.style.padding = '12px 16px';

                    const initials = user.initials || user.name.substring(0, 2).toUpperCase();
                    li.innerHTML = `
                            <div class="user-avatar-small" style="width: 28px; height: 28px; border-radius: 50%; background-color: ${user.color || 'var(--primary-red)'}; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: bold; color: white;">
                                ${initials}
                            </div>
                            <span style="flex: 1;">${user.name}</span>
                        `;

                    // Highlight active user
                    if (window.activeUser && window.activeUser.id === user.id) {
                        li.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                        li.style.borderLeft = '3px solid ' + (user.color || 'var(--primary-red)');
                    }

                    li.onclick = (e) => {
                        e.stopPropagation();
                        console.log('User clicked:', user.name);
                        window.attemptUserLogin(user.id);
                    };
                    dropdownList.appendChild(li);
                });

                // Add Logout Option
                const logoutLi = document.createElement('li');
                logoutLi.style.display = 'flex';
                logoutLi.style.alignItems = 'center';
                logoutLi.style.gap = '12px';
                logoutLi.style.padding = '10px 16px';
                logoutLi.style.color = '#ef4444';
                logoutLi.style.fontWeight = 'bold';
                logoutLi.innerHTML = `
                    <div style="width: 24px; height: 24px; border-radius: 50%; background-color: #ef4444; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                            <polyline points="16 17 21 12 16 7"></polyline>
                            <line x1="21" y1="12" x2="9" y2="12"></line>
                        </svg>
                    </div>
                    <span style="flex: 1;">Abmelden (Logout)</span>
                `;
                logoutLi.onclick = (e) => {
                    e.stopPropagation();
                    window.supabaseLogout();
                };
                dropdownList.appendChild(logoutLi);
            };

            // Alle steuerbaren Ansichten: Schlüssel = data-target der Sidebar-Links bzw. der
            // Einstellungs-Karten. Fehlende Schlüssel in user.permissions gelten als erlaubt.
            window.PERM_VIEW_KEYS = [
                'home', 'tasks', 'machines', 'workshop', 'service', 'protocols',
                'settings-etiketten', 'documents', 'listen', 'history', 'accounting', 'calendar', 'settings',
                'users', 'categories', 'protocol-templates', 'settings-textbausteine',
                'settings-firmeneinstellungen', 'settings-import', 'settings-uvv-wartungsplaene', 'settings-ai'
            ];

            function updateLastViewed(machineId) {
                if (typeof window.updateLastViewed === 'function') window.updateLastViewed(machineId);
            }

            async function renderDashboard() {
                if (typeof window.renderDashboard === 'function') {
                    await window.renderDashboard();
                }
            }

            // ==========================================
            // MACHINE CATEGORY FILTER LOGIC
            // ==========================================
            window.activeMachineCategoryFilters = ['all'];
            window.machineSearchFilter = '';

            function toggleCategoryFilter(event) {
                event.stopPropagation();
                const menu = document.getElementById('machine-category-filter-menu');
                const trigger = document.getElementById('machine-category-filter-trigger');
                if (!menu || !trigger) return;

                // Ensure window access for selection
                window.selectCategoryFilter = selectCategoryFilter;

                const isShowing = menu.classList.contains('show');

                // Close user dropdown if open
                const userDropdown = document.querySelector('.user-dropdown-menu');
                if (userDropdown) {
                    userDropdown.classList.remove('show');
                    userDropdown.style.display = 'none';
                }

                if (isShowing) {
                    menu.classList.remove('show');
                    trigger.classList.remove('active');
                } else {
                    menu.classList.add('show');
                    trigger.classList.add('active');
                }
            }

            window.selectCategoryFilter = function (id, name) {
                console.log('Selecting category filter:', id, name);
                if (id === 'all') {
                    window.activeMachineCategoryFilters = ['all'];
                } else {
                    // Remove 'all' if present
                    window.activeMachineCategoryFilters = window.activeMachineCategoryFilters.filter(f => f !== 'all');

                    // Toggle ID
                    const sId = id.toString();
                    const idx = window.activeMachineCategoryFilters.indexOf(sId);
                    if (idx > -1) {
                        window.activeMachineCategoryFilters.splice(idx, 1);
                    } else {
                        window.activeMachineCategoryFilters.push(sId);
                    }

                    // If empty, reset to all
                    if (window.activeMachineCategoryFilters.length === 0) {
                        window.activeMachineCategoryFilters = ['all'];
                    }
                }

                // Update Trigger Label
                const label = document.getElementById('current-category-name');
                if (label) {
                    if (window.activeMachineCategoryFilters.includes('all')) {
                        label.textContent = 'Maschinenkategorien';
                    } else if (window.activeMachineCategoryFilters.length === 1) {
                        label.textContent = name;
                    } else {
                        const firstCat = categoryList.find(c => c.id.toString() === window.activeMachineCategoryFilters[0].toString());
                        const firstName = firstCat ? firstCat.name : 'Mehrere';
                        label.textContent = `${firstName} +${window.activeMachineCategoryFilters.length - 1}`;
                    }
                }

                // Re-render
                renderCategoryList();
                renderMachines();

                // Only close menu if 'all' was selected
                if (id === 'all') {
                    const menu = document.getElementById('machine-category-filter-menu');
                    const trigger = document.getElementById('machine-category-filter-trigger');
                    if (menu) menu.classList.remove('show');
                    if (trigger) trigger.classList.remove('active');
                }
            };

            // ==========================================
            // MACHINE SERIES FILTER LOGIC
            // ==========================================
            window.activeMachineSeriesFilters = ['all'];

            function toggleSeriesFilter(event) {
                event.stopPropagation();
                const menu = document.getElementById('machine-series-filter-menu');
                const trigger = document.getElementById('machine-series-filter-trigger');
                if (!menu || !trigger) return;

                const isShowing = menu.classList.contains('show');

                // Close other dropdowns
                const catMenu = document.getElementById('machine-category-filter-menu');
                const catTrigger = document.getElementById('machine-category-filter-trigger');
                if (catMenu) catMenu.classList.remove('show');
                if (catTrigger) catTrigger.classList.remove('active');

                const userDropdown = document.querySelector('.user-dropdown-menu');
                if (userDropdown) {
                    userDropdown.classList.remove('show');
                    userDropdown.style.display = 'none';
                }

                if (isShowing) {
                    menu.classList.remove('show');
                    trigger.classList.remove('active');
                } else {
                    menu.classList.add('show');
                    trigger.classList.add('active');
                }
            }

            // Maschinenserie wird pro Maschine als Name (Text) gespeichert, nicht als ID —
            // daher arbeitet dieser Filter direkt mit den Serien-Namen statt mit IDs.
            window.selectSeriesFilter = function (name) {
                if (name === 'all') {
                    window.activeMachineSeriesFilters = ['all'];
                } else {
                    window.activeMachineSeriesFilters = window.activeMachineSeriesFilters.filter(f => f !== 'all');

                    const idx = window.activeMachineSeriesFilters.indexOf(name);
                    if (idx > -1) {
                        window.activeMachineSeriesFilters.splice(idx, 1);
                    } else {
                        window.activeMachineSeriesFilters.push(name);
                    }

                    if (window.activeMachineSeriesFilters.length === 0) {
                        window.activeMachineSeriesFilters = ['all'];
                    }
                }

                // Update Trigger Label
                const label = document.getElementById('current-series-filter-name');
                if (label) {
                    if (window.activeMachineSeriesFilters.includes('all')) {
                        label.textContent = 'Maschinenserie';
                    } else if (window.activeMachineSeriesFilters.length === 1) {
                        label.textContent = window.activeMachineSeriesFilters[0];
                    } else {
                        label.textContent = `${window.activeMachineSeriesFilters[0]} +${window.activeMachineSeriesFilters.length - 1}`;
                    }
                }

                // Re-render options/machines
                renderMachineSeriesFilterOptions();
                renderMachines();

                // Only close menu if 'all' was selected
                if (name === 'all') {
                    const menu = document.getElementById('machine-series-filter-menu');
                    const trigger = document.getElementById('machine-series-filter-trigger');
                    if (menu) menu.classList.remove('show');
                    if (trigger) trigger.classList.remove('active');
                }
            };

            function renderMachineSeriesFilterOptions() {
                const list = document.getElementById('machine-series-filter-options');
                if (!list) return;
                list.innerHTML = '';

                const allLi = document.createElement('li');
                allLi.textContent = 'Maschinenserie';
                allLi.setAttribute('data-id', 'all');
                if (window.activeMachineSeriesFilters.includes('all')) allLi.classList.add('selected');
                allLi.addEventListener('click', (e) => {
                    e.stopPropagation();
                    window.selectSeriesFilter('all');
                });
                list.appendChild(allLi);

                const allSeries = (typeof categoryList !== 'undefined' && Array.isArray(categoryList))
                    ? categoryList.filter(c => c.type === 'series')
                    : [];
                allSeries.forEach(cat => {
                    const li = document.createElement('li');
                    li.setAttribute('data-id', cat.name);

                    const isSelected = window.activeMachineSeriesFilters.includes(cat.name);
                    if (isSelected) li.classList.add('selected');

                    li.innerHTML = `
                            <span>${cat.name}</span>
                            ${isSelected ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>' : ''}
                        `;

                    li.addEventListener('click', (e) => {
                        e.stopPropagation();
                        window.selectSeriesFilter(cat.name);
                    });
                    list.appendChild(li);
                });
            }
            window.renderMachineSeriesFilterOptions = renderMachineSeriesFilterOptions;

            // ==========================================
            // MACHINE CONTACT FILTER LOGIC
            // ==========================================
            window.activeMachineContactFilters = ['all'];

            function toggleContactFilter(event) {
                event.stopPropagation();
                const menu = document.getElementById('machine-contact-filter-menu');
                const trigger = document.getElementById('machine-contact-filter-trigger');
                if (!menu || !trigger) return;

                const isShowing = menu.classList.contains('show');

                // Close other dropdowns
                const catMenu = document.getElementById('machine-category-filter-menu');
                const catTrigger = document.getElementById('machine-category-filter-trigger');
                if (catMenu) catMenu.classList.remove('show');
                if (catTrigger) catTrigger.classList.remove('active');

                const userDropdown = document.querySelector('.user-dropdown-menu');
                if (userDropdown) {
                    userDropdown.classList.remove('show');
                    userDropdown.style.display = 'none';
                }

                if (isShowing) {
                    menu.classList.remove('show');
                    trigger.classList.remove('active');
                } else {
                    menu.classList.add('show');
                    trigger.classList.add('active');
                }
            }

            window.selectContactFilter = function (id, name) {
                if (id === 'all') {
                    window.activeMachineContactFilters = ['all'];
                } else {
                    // Remove 'all' if present
                    window.activeMachineContactFilters = window.activeMachineContactFilters.filter(f => f !== 'all');

                    // Toggle ID
                    const sId = id.toString();
                    const idx = window.activeMachineContactFilters.indexOf(sId);
                    if (idx > -1) {
                        window.activeMachineContactFilters.splice(idx, 1);
                    } else {
                        window.activeMachineContactFilters.push(sId);
                    }

                    // If empty, reset to all
                    if (window.activeMachineContactFilters.length === 0) {
                        window.activeMachineContactFilters = ['all'];
                    }
                }

                // Update Trigger Label
                const label = document.getElementById('current-contact-type-name');
                if (label) {
                    if (window.activeMachineContactFilters.includes('all')) {
                        label.textContent = 'Art des Kontaktes';
                    } else if (window.activeMachineContactFilters.length === 1) {
                        label.textContent = name;
                    } else {
                        const firstCat = categoryList.find(c => c.id.toString() === window.activeMachineContactFilters[0].toString());
                        const firstName = firstCat ? firstCat.name : 'Mehrere';
                        label.textContent = `${firstName} +${window.activeMachineContactFilters.length - 1}`;
                    }
                }

                // Re-render options/machines
                renderCategoryList();
                renderMachines();

                // Only close menu if 'all' was selected
                if (id === 'all') {
                    const menu = document.getElementById('machine-contact-filter-menu');
                    const trigger = document.getElementById('machine-contact-filter-trigger');
                    if (menu) menu.classList.remove('show');
                    if (trigger) trigger.classList.remove('active');
                }
            };

            // Global listener for closing overview filters when clicking outside
            document.addEventListener('click', (e) => {
                const dropdowns = [
                    { menuId: 'machine-category-filter-menu', triggerId: 'machine-category-filter-trigger' },
                    { menuId: 'machine-series-filter-menu', triggerId: 'machine-series-filter-trigger' },
                    { menuId: 'machine-contact-filter-menu', triggerId: 'machine-contact-filter-trigger' },
                    { menuId: 'ab-contact-filter-menu', triggerId: 'ab-contact-filter-trigger' }
                ];

                dropdowns.forEach(({ menuId, triggerId }) => {
                    const menu = document.getElementById(menuId);
                    const trigger = document.getElementById(triggerId);
                    if (menu && menu.classList.contains('show') &&
                        !trigger.contains(e.target) && !menu.contains(e.target)) {
                        menu.classList.remove('show');
                        trigger.classList.remove('active');
                    }
                });
            });

            // Machine Search Listener
            const machineSearchInput = document.getElementById('machine-search-input');
            if (machineSearchInput) {
                machineSearchInput.addEventListener('input', (e) => {
                    window.machineSearchFilter = e.target.value;
                    renderMachines();
                });
            }

            // ==========================================
            // CATEGORY MANAGEMENT LOGIC
            // ==========================================
            window.toggleWorkshopStatus = async function (id, currentStatus) {
                if (typeof event !== 'undefined' && event && event.stopPropagation) event.stopPropagation();
                if (typeof event !== 'undefined' && event && event.preventDefault) event.preventDefault();

                if (!supabaseClient) { window.showToast('Datenbank nicht verbunden'); return; }

                const isCurrentlyInWorkshop = (String(currentStatus) === 'true');
                const newStatus = !isCurrentlyInWorkshop;

                const actionMsg = newStatus ? 'Maschine in die Werkstatt verschieben?' : 'Maschine aus der Werkstatt entfernen?';
                if (!confirm(actionMsg)) return;

                if (newStatus) {
                    window.openWorkshopOrderModal(id);
                    return;
                }

                await window.processWorkshopToggle(id, false, null);
            };

            window.openWorkshopOrderModal = function (machineId) {
                const modal = document.getElementById('workshop-order-modal');
                const input = document.getElementById('workshop-order-number-input');
                const yearInput = document.getElementById('workshop-year-input');

                if (modal) {
                    modal.dataset.machineId = machineId;
                    modal.classList.remove('hidden');
                    modal.style.display = 'flex';
                    // Required for .modal-backdrop to set opacity: 1 and pointer-events: auto
                    requestAnimationFrame(() => modal.classList.add('show'));
                }

                if (yearInput) yearInput.value = new Date().getFullYear();
                if (input) {
                    input.value = '';
                    setTimeout(() => input.focus(), 150);
                }
            };

            window.closeWorkshopOrderModal = function () {
                const modal = document.getElementById('workshop-order-modal');
                if (modal) {
                    modal.classList.remove('show');
                    modal.classList.add('hidden');
                    setTimeout(() => modal.style.display = 'none', 300);
                }
            };

            window.confirmWorkshopOrder = async function () {
                try {
                    const modal = document.getElementById('workshop-order-modal');
                    const input = document.getElementById('workshop-order-number-input');
                    const yearInput = document.getElementById('workshop-year-input');
                    let num = input ? input.value : '';
                    let year = yearInput ? yearInput.value.trim() : new Date().getFullYear();

                    const targetMachineId = modal ? modal.dataset.machineId : null;

                    if (!targetMachineId) {
                        window.showToast("Systemfehler: Maschinen-ID konnte nicht gelesen werden.");
                        return;
                    }

                    if (!num || num.trim() === '') {
                        window.showToast('Bitte geben Sie eine Auftragsnummer ein.');
                        if (input) input.focus();
                        return;
                    }

                    num = String(num.trim()).padStart(5, '0');
                    const fullOrderNumber = `${year}-${num}`;

                    window.closeWorkshopOrderModal();

                    setTimeout(async () => {
                        await window.processWorkshopToggle(targetMachineId, true, fullOrderNumber);
                    }, 50);
                } catch (err) {
                    console.error("Error confirming workshop order:", err);
                    window.showToast("Fehler: " + err.message);
                }
            };

            window.processWorkshopToggle = async function (id, newStatus, workshopOrderNumber) {
                if (!supabaseClient) { window.showToast('Datenbank nicht verbunden'); return; }

                const { error } = await supabaseClient
                    .from('machines')
                    .update({
                        is_in_workshop: newStatus,
                        workshop_order_number: newStatus ? workshopOrderNumber : null
                    })
                    .eq('id', id);

                if (error) {
                    console.error('Error toggling workshop status:', error);
                    window.showToast('Fehler: ' + error.message);
                } else {
                    const now = new Date();
                    const title = newStatus ? 'Werkstattaufenthalt Beginn' : 'Werkstattaufenthalt Ende';

                    try {
                        let finalDescription = '';
                        if (newStatus) {
                            finalDescription = workshopOrderNumber ? `Auftrag: ${workshopOrderNumber}` : '';
                        } else {
                            // For "Ende", try to find the starting order number from machine state
                            const m = (window.machineList || []).find(m => m.id == id);
                            if (m && m.workshop_order_number) {
                                finalDescription = `Auftrag: ${m.workshop_order_number}`;
                            }
                        }

                        // Log Start/End Status in service_entries (History)
                        await supabaseClient.from('service_entries').insert([{
                            machine_id: id,
                            title: title,
                            date: now.toISOString(),
                            description: finalDescription,
                            category_id: 16 // Werkstattaufenthalt
                        }]);

                        // Update local list if it exists
                        if (window.machineList) {
                            const m = window.machineList.find(m => m.id == id);
                            if (m) {
                                m.is_in_workshop = newStatus;
                                m.workshop_order_number = newStatus ? workshopOrderNumber : null;
                            }
                        }

                        // Re-render machine list
                        if (typeof window.renderMachines === 'function') {
                            window.renderMachines('machine-list-container');
                        } else if (typeof renderMachines === 'function') {
                            renderMachines('machine-list-container');
                        } else {
                            // Fallback: force page reload if rendering functions disappeared
                            window.location.reload();
                        }
                    } catch (err) {
                        console.error('Crash during processWorkshopToggle execution:', err);
                        window.showToast('Systemfehler: ' + err.message);
                    }
                }
            };

            categoryList = [];

            function applyCategoryList(data) {
                categoryList = data || [];
                window.categoryList = categoryList; // GLOBAL EXPOSURE
                renderCategoryList();
                if (typeof renderServiceCategoryFilterList === 'function') renderServiceCategoryFilterList();
                if (typeof renderMachines === 'function') renderMachines();
                if (typeof window.populateDocumentTypeDropdowns === 'function') {
                    window.populateDocumentTypeDropdowns();
                }
            }

            async function fetchCategories() {
                if (!supabaseClient) return;

                // 1. Zuerst sofort aus Cache laden (falls vorhanden)
                try {
                    const cached = localStorage.getItem('offline_categories');
                    if (cached) applyCategoryList(JSON.parse(cached));
                } catch(e) {}

                if (!navigator.onLine) return;

                // 2. Frische Daten aus der DB holen
                let data, error;
                try {
                    const result = await window.withTimeout(
                        supabaseClient.from('categories').select('*').order('sort_order', { ascending: true }).order('name', { ascending: true }),
                        6000
                    );
                    data = result.data; error = result.error;
                } catch (timeoutErr) {
                    error = timeoutErr;
                }

                if (error) {
                    console.error('Error fetching categories:', error);
                    return;
                }

                // Cache für Offline speichern
                try { localStorage.setItem('offline_categories', JSON.stringify(data || [])); } catch(e) {}

                applyCategoryList(data);
            }

            // Auch von anderen Modulen aus aufrufbar (z. B. wenn das Adressbuch
            // eine neue Hersteller-Kategorie anlegt und die Liste frisch braucht).
            window.fetchCategories = fetchCategories;

            window.renderCategoryList = function () {
                const listMachine = document.getElementById('category-list-machine');
                const listService = document.getElementById('category-list-service');
                const listContact = document.getElementById('category-list-contact');
                const listAddressType = document.getElementById('category-list-address_type');
                const listLink = document.getElementById('category-list-link');
                const listDocument = document.getElementById('category-list-document');
                const listManufacturer = document.getElementById('category-list-manufacturer');
                const listSeries = document.getElementById('category-list-series');
                const listEquipment = document.getElementById('category-list-equipment');
                const listStatus = document.getElementById('category-list-status');
                const listArea = document.getElementById('category-list-area');

                // Safety check
                if (!listMachine || !listService) return;

                listMachine.innerHTML = '';
                listService.innerHTML = '';
                if (listContact) listContact.innerHTML = '';
                if (listAddressType) listAddressType.innerHTML = '';
                if (listLink) listLink.innerHTML = '';
                if (listDocument) listDocument.innerHTML = '';
                if (listManufacturer) listManufacturer.innerHTML = '';
                if (listSeries) listSeries.innerHTML = '';
                if (listEquipment) listEquipment.innerHTML = '';
                if (listStatus) listStatus.innerHTML = '';
                if (listArea) listArea.innerHTML = '';

                // Populate custom machine category filter dropdown
                const filterOptionsList = document.getElementById('machine-category-filter-options');
                if (filterOptionsList) {
                    filterOptionsList.innerHTML = '';

                    // Option: Maschinenkategorien
                    const allLi = document.createElement('li');
                    allLi.textContent = 'Maschinenkategorien';
                    allLi.setAttribute('data-id', 'all');
                    if (window.activeMachineCategoryFilters.includes('all')) allLi.classList.add('selected');
                    allLi.addEventListener('click', (e) => {
                        e.stopPropagation();
                        window.selectCategoryFilter('all', 'Maschinenkategorien');
                    });
                    filterOptionsList.appendChild(allLi);

                    categoryList.filter(c => c.type === 'machine').forEach(cat => {
                        const li = document.createElement('li');
                        li.setAttribute('data-id', cat.id);

                        const isSelected = window.activeMachineCategoryFilters.includes(cat.id.toString()) || window.activeMachineCategoryFilters.includes(cat.id);
                        if (isSelected) li.classList.add('selected');

                        li.innerHTML = `
                                <span>${cat.name}</span>
                                ${isSelected ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>' : ''}
                            `;

                        li.addEventListener('click', (e) => {
                            e.stopPropagation();
                            window.selectCategoryFilter(cat.id, cat.name);
                        });
                        filterOptionsList.appendChild(li);
                    });
                }

                // Populate custom machine series filter dropdown
                if (typeof renderMachineSeriesFilterOptions === 'function') renderMachineSeriesFilterOptions();

                // Populate custom contact type filter dropdown
                const contactFilterOptionsList = document.getElementById('machine-contact-filter-options');
                if (contactFilterOptionsList) {
                    contactFilterOptionsList.innerHTML = '';

                    // Option: Alle Kontaktarten
                    const allLi = document.createElement('li');
                    allLi.textContent = 'Alle Kontaktarten';
                    allLi.setAttribute('data-id', 'all');
                    if (window.activeMachineContactFilters.includes('all')) allLi.classList.add('selected');
                    allLi.addEventListener('click', (e) => {
                        e.stopPropagation();
                        window.selectContactFilter('all', 'Art des Kontaktes');
                    });
                    contactFilterOptionsList.appendChild(allLi);

                    categoryList.filter(c => c.type === 'contact').forEach(cat => {
                        const li = document.createElement('li');
                        li.setAttribute('data-id', cat.id);

                        const isSelected = window.activeMachineContactFilters.includes(cat.id.toString()) || window.activeMachineContactFilters.includes(cat.id);
                        if (isSelected) li.classList.add('selected');

                        li.innerHTML = `
                                <span>${cat.name}</span>
                                ${isSelected ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>' : ''}
                            `;

                        li.addEventListener('click', (e) => {
                            e.stopPropagation();
                            window.selectContactFilter(cat.id, cat.name);
                        });
                        contactFilterOptionsList.appendChild(li);
                    });
                }

                // Populate custom addressbook contact & address_type filter dropdowns
                if (typeof window.renderABContactFilterOptions === 'function') {
                    window.renderABContactFilterOptions();
                }
                if (typeof window.renderABAddressTypeFilterOptions === 'function') {
                    window.renderABAddressTypeFilterOptions();
                }

                categoryList.forEach(cat => {
                    const li = document.createElement('li');
                    li.className = 'user-item';

                    // Determine type and styling
                    let savedColor, accentColor;

                    // Default colors
                    const colors = {
                        machine: '#e67e22',
                        service: '#2980b9',
                        contact: '#9b59b6',
                        address_type: '#ec4899',
                        link: '#38bdf8',
                        document: '#f97316',
                        manufacturer: '#14b8a6',
                        series: '#06b6d4',
                        equipment: '#a855f7',
                        status: '#3b82f6',
                        area: '#6366f1'
                    };

                    const type = cat.type || 'machine';
                    savedColor = localStorage.getItem(`cat_group_color_${type}`);

                    // Use individual color if set, else fallback to group color, else fallback to hardcoded default
                    accentColor = cat.color || savedColor || colors[type] || '#999';

                    li.style.setProperty('--user-color', accentColor);
                    li.dataset.catId = cat.id;

                    // Maschinenkategorien & Maschinenserien: per Ziehen-und-Halten in der Reihenfolge sortierbar
                    const dragHandle = (type === 'machine' || type === 'series' || type === 'manufacturer') ? `
                                <span class="cat-drag-handle" title="Ziehen zum Sortieren" style="cursor: grab; touch-action: none; color: rgba(255,255,255,0.35); display: inline-flex; align-items: center; padding: 4px 8px; margin-right: 2px; flex-shrink: 0;">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="8" cy="6" r="1.6"></circle><circle cx="16" cy="6" r="1.6"></circle><circle cx="8" cy="12" r="1.6"></circle><circle cx="16" cy="12" r="1.6"></circle><circle cx="8" cy="18" r="1.6"></circle><circle cx="16" cy="18" r="1.6"></circle></svg>
                                </span>` : '';

                    li.innerHTML = `
                            <div class="user-item-content" style="display: flex; align-items: center;">
                                    ${dragHandle}
                                    <div class="user-details" style="display: flex; align-items: center; justify-content: space-between; padding-left: 0.5rem; width: 100%;">
                                        <span class="user-name-link" style="color: ${accentColor}; font-weight: 700; font-family: 'Inter', sans-serif; font-size: 1.1rem;">${cat.name}</span>
                                        ${type === 'machine' ? `<span style="font-size: 0.85rem; color: rgba(255,255,255,0.4); font-weight: 600; padding-right: 1rem;">Intervall: ${cat.default_maintenance_interval_months || 12}M</span>` : ''}
                                        ${type === 'series' ? `<span style="font-size: 0.85rem; color: rgba(255,255,255,0.4); font-weight: 600; padding-right: 1rem; text-align: right;">${[cat.manufacturer, cat.machine_categories].filter(Boolean).join(' · ')}</span>` : ''}
                                        ${type === 'equipment' && cat.remark ? `<span style="font-size: 0.85rem; color: rgba(255,255,255,0.4); font-weight: 500; padding-right: 1rem; text-align: right;">${cat.remark}</span>` : ''}
                                    </div>
                                <div class="user-actions">
                                    <button class="btn-icon-soft edit" onclick="editCategory(${cat.id})" title="Bearbeiten">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                    </button>
                                    <button class="btn-icon-soft delete" onclick="deleteCategory(${cat.id})" title="Löschen">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2-2v2"></path></svg>
                                    </button>
                                </div>
                            </div>
                        `;

                    if (type === 'machine') {
                        listMachine.appendChild(li);
                    } else if (type === 'service') {
                        listService.appendChild(li);
                    } else if (type === 'contact' && listContact) {
                        listContact.appendChild(li);
                    } else if (type === 'address_type' && listAddressType) {
                        listAddressType.appendChild(li);
                    } else if (type === 'link' && listLink) {
                        listLink.appendChild(li);
                    } else if (type === 'document' && listDocument) {
                        listDocument.appendChild(li);
                    } else if (type === 'manufacturer' && listManufacturer) {
                        listManufacturer.appendChild(li);
                    } else if (type === 'series' && listSeries) {
                        listSeries.appendChild(li);
                    } else if (type === 'equipment' && listEquipment) {
                        listEquipment.appendChild(li);
                    } else if (type === 'status' && listStatus) {
                        listStatus.appendChild(li);
                    } else if (type === 'area' && listArea) {
                        listArea.appendChild(li);
                    }
                });

                window.setupCategoryDragReorder(listMachine, 'machine');
                if (listSeries) window.setupCategoryDragReorder(listSeries, 'series');
                if (listManufacturer) window.setupCategoryDragReorder(listManufacturer, 'manufacturer');

                // Hersteller-Auswahl im Maschinen-Formular und in der Adress-Ansicht
                // aktuell halten, sobald sich die Kategorien ändern.
                if (typeof window.populateMachineManufacturerDropdown === 'function') {
                    window.populateMachineManufacturerDropdown();
                }

                // Verwaiste Namen nur suchen, wenn die Kategorien-Seite offen ist —
                // beim Programmstart wäre das nur unnötige Last.
                const catView = document.getElementById('categories');
                if (catView && catView.offsetParent !== null && typeof window.scanOrphanCategoryNames === 'function') {
                    window.scanOrphanCategoryNames();
                }
            }

            // ── Kategorien per Ziehen-und-Halten sortieren (Pointer Events statt HTML5
            // Drag&Drop, damit es auch auf iPad/Touch zuverlässig funktioniert) ──
            // Sobald ein Element über die Mitte eines Nachbarn gezogen wird, tauschen beide
            // sofort die Position im DOM — die finale Reihenfolge wird beim Loslassen gespeichert.
            const categoryDragBoundLists = new WeakSet();
            window.setupCategoryDragReorder = function (listEl, type) {
                if (!listEl || categoryDragBoundLists.has(listEl)) return;
                categoryDragBoundLists.add(listEl);

                let dragEl = null;

                listEl.addEventListener('pointerdown', (e) => {
                    const handle = e.target.closest('.cat-drag-handle');
                    if (!handle) return;
                    dragEl = handle.closest('li');
                    if (!dragEl) return;
                    dragEl.style.opacity = '0.5';
                    dragEl.style.background = 'rgba(255,255,255,0.08)';
                    try { handle.setPointerCapture(e.pointerId); } catch (err) {}
                    e.preventDefault();
                });

                listEl.addEventListener('pointermove', (e) => {
                    if (!dragEl) return;
                    const siblings = Array.from(listEl.children);
                    for (const sib of siblings) {
                        if (sib === dragEl) continue;
                        const rect = sib.getBoundingClientRect();
                        if (e.clientY >= rect.top && e.clientY <= rect.bottom) {
                            const midY = rect.top + rect.height / 2;
                            if (e.clientY < midY) {
                                listEl.insertBefore(dragEl, sib);
                            } else {
                                listEl.insertBefore(dragEl, sib.nextElementSibling);
                            }
                            break;
                        }
                    }
                });

                const finishDrag = () => {
                    if (!dragEl) return;
                    dragEl.style.opacity = '';
                    dragEl.style.background = '';
                    const orderedIds = Array.from(listEl.children)
                        .map(li => parseInt(li.dataset.catId, 10))
                        .filter(id => !isNaN(id));
                    dragEl = null;
                    window.saveCategoryOrder(type, orderedIds);
                };
                listEl.addEventListener('pointerup', finishDrag);
                listEl.addEventListener('pointercancel', finishDrag);
            };

            // Speichert die neue Reihenfolge in der DB und hält window.categoryList synchron,
            // damit sich die geänderte Reihenfolge sofort überall (Filter, Dropdowns, Maschinenliste) zeigt.
            window.saveCategoryOrder = async function (type, orderedIds) {
                if (!orderedIds || !orderedIds.length) return;
                try {
                    await Promise.all(orderedIds.map((id, index) =>
                        supabaseClient.from('categories').update({ sort_order: index }).eq('id', id)
                    ));

                    (window.categoryList || []).forEach(c => {
                        const idx = orderedIds.indexOf(c.id);
                        if (idx !== -1) c.sort_order = idx;
                    });
                    window.categoryList.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
                    categoryList = window.categoryList;

                    if (typeof renderServiceCategoryFilterList === 'function') renderServiceCategoryFilterList();
                    if (typeof renderMachines === 'function') renderMachines();
                    if (typeof window.populateDocumentTypeDropdowns === 'function') window.populateDocumentTypeDropdowns();
                    renderCategoryList();
                } catch (err) {
                    console.error('Error saving category order:', err);
                    window.showToast('Fehler beim Speichern der Reihenfolge: ' + (err.message || err));
                    fetchCategories();
                }
            };

            window.editCategory = function (id) {
                const cat = categoryList.find(c => c.id === id);
                if (cat) {
                    openModal(cat);
                }
            };

            window.deleteCategory = async function (id) {
                if (typeof window.canDelete === 'function' && !window.canDelete('Kategorien')) return;
                if (!supabaseClient) { window.showToast('Datenbank nicht verbunden'); return; }
                if (confirm('Kategorie wirklich löschen?')) {
                    const { error } = await supabaseClient
                        .from('categories')
                        .delete()
                        .eq('id', id);

                    if (error) {
                        window.showToast('Fehler: ' + error.message);
                    } else {
                        fetchCategories();
                    }
                }
            };

            // CATEGORY MODAL LOGIC
            const addCatBtn = document.getElementById('add-category-btn');
            const catModal = document.getElementById('category-modal');
            const cancelCatBtn = document.getElementById('cancel-cat-btn');
            const saveCatBtn = document.getElementById('save-cat-btn');
            const catNameInput = document.getElementById('cat-name-input');
            const catIntervalInput = document.getElementById('cat-interval-input');
            const catIntervalGroup = document.getElementById('cat-interval-group');
            const catSeriesGroup = document.getElementById('cat-series-group');
            const catSeriesManufacturerInput = document.getElementById('cat-series-manufacturer');
            const catEquipmentGroup = document.getElementById('cat-equipment-group');
            const catEquipmentRemarkInput = document.getElementById('cat-equipment-remark');
            const catTypeRadios = document.getElementsByName('cat-type');
            const catModalId = document.getElementById('cat-modal-id');
            const catModalTitle = document.getElementById('cat-modal-title');
            let activeCatSeriesMachineCategories = [];

            // Toggle interval/series/equipment field visibility
            catTypeRadios.forEach(radio => {
                radio.addEventListener('change', (e) => {
                    if (catIntervalGroup) {
                        catIntervalGroup.style.display = e.target.value === 'machine' ? 'block' : 'none';
                    }
                    if (catSeriesGroup) {
                        catSeriesGroup.style.display = e.target.value === 'series' ? 'block' : 'none';
                    }
                    if (catEquipmentGroup) {
                        catEquipmentGroup.style.display = e.target.value === 'equipment' ? 'block' : 'none';
                    }
                });
            });

            // Hersteller-Vorschlaege (Datalist) aus bereits angelegten Maschinen, freie Eingabe bleibt moeglich
            function populateCatSeriesManufacturerOptions() {
                const datalist = document.getElementById('cat-series-manufacturer-options');
                if (!datalist) return;
                const manufacturers = [...new Set([
                    ...(window.categoryList || []).filter(c => c.type === 'manufacturer').map(c => (c.name || '').trim()),
                    ...(window.machineList || []).map(m => (m.manufacturer || '').trim())
                ].filter(Boolean))].sort((a, b) => a.localeCompare(b));
                datalist.innerHTML = manufacturers.map(m => `<option value="${m.replace(/"/g, '&quot;')}"></option>`).join('');
            }

            // Maschinenkategorie-Dropdown (Mehrfachauswahl) fuer Kategorie-Typ "Maschinenserie"
            function populateCatSeriesMachineCatOptions() {
                const list = document.getElementById('cat-series-machine-cat-options');
                if (!list) return;
                list.innerHTML = '';
                (window.categoryList || []).filter(c => c.type === 'machine').forEach(cat => {
                    const li = document.createElement('li');
                    li.dataset.value = cat.name;
                    li.textContent = cat.name;
                    if (activeCatSeriesMachineCategories.includes(cat.name)) li.classList.add('selected');
                    li.addEventListener('click', e => {
                        e.stopPropagation();
                        window.toggleCatSeriesMachineCategory(cat.name);
                    });
                    list.appendChild(li);
                });
                updateCatSeriesMachineCatLabel();
            }

            function updateCatSeriesMachineCatLabel() {
                const label = document.getElementById('cat-series-machine-cat-label');
                if (label) {
                    label.textContent = activeCatSeriesMachineCategories.length > 0 ? activeCatSeriesMachineCategories.join(', ') : 'Maschinenkategorie wählen...';
                }
            }

            window.toggleCatSeriesMachineCategory = function (catName) {
                if (activeCatSeriesMachineCategories.includes(catName)) {
                    activeCatSeriesMachineCategories = activeCatSeriesMachineCategories.filter(c => c !== catName);
                } else {
                    activeCatSeriesMachineCategories.push(catName);
                }
                updateCatSeriesMachineCatLabel();
                document.querySelectorAll('#cat-series-machine-cat-options li').forEach(li => {
                    li.classList.toggle('selected', activeCatSeriesMachineCategories.includes(li.dataset.value));
                });
            };

            window.toggleCatSeriesMachineCatDropdown = function (event) {
                if (event) event.stopPropagation();
                const dropdown = document.getElementById('cat-series-machine-cat-dropdown');
                if (!dropdown) return;
                const isOpen = dropdown.classList.contains('active');

                document.querySelectorAll('.custom-filter-dropdown.active').forEach(d => {
                    d.classList.remove('active');
                    d.closest('.form-group')?.classList.remove('has-active-dropdown');
                });

                if (!isOpen) {
                    dropdown.classList.add('active');
                    dropdown.closest('.form-group')?.classList.add('has-active-dropdown');
                }
            };

            function openModal(editData = null) {
                if (catModal) {
                    // Reset form
                    if (catModalId) catModalId.value = editData ? editData.id : '';
                    if (catModalTitle) catModalTitle.textContent = editData ? 'Kategorie bearbeiten' : 'Neue Kategorie';

                    if (catNameInput) catNameInput.value = editData ? editData.name : '';
                    if (catIntervalInput) catIntervalInput.value = editData ? (editData.default_maintenance_interval_months || 12) : 12;

                    // Load color
                    const colorToLoad = (editData && editData.color) ? editData.color : '#10b981';
                    selectCatColor(colorToLoad);

                    if (editData && catTypeRadios) {
                        catTypeRadios.forEach(r => {
                            r.checked = (r.value === editData.type);
                            if (r.checked && r.value === 'machine' && catIntervalGroup) {
                                catIntervalGroup.style.display = 'block';
                            } else if (r.checked && catIntervalGroup) {
                                catIntervalGroup.style.display = 'none';
                            }
                            if (r.checked && catSeriesGroup) {
                                catSeriesGroup.style.display = r.value === 'series' ? 'block' : 'none';
                            }
                            if (r.checked && catEquipmentGroup) {
                                catEquipmentGroup.style.display = r.value === 'equipment' ? 'block' : 'none';
                            }
                        });
                    } else if (!editData && catTypeRadios) {
                        catTypeRadios[0].checked = true; // Default to machine
                        if (catIntervalGroup) catIntervalGroup.style.display = 'block';
                        if (catSeriesGroup) catSeriesGroup.style.display = 'none';
                        if (catEquipmentGroup) catEquipmentGroup.style.display = 'none';
                    }

                    // Felder fuer Kategorie-Typ "Maschinenserie"
                    if (catSeriesManufacturerInput) catSeriesManufacturerInput.value = editData ? (editData.manufacturer || '') : '';
                    activeCatSeriesMachineCategories = (editData && editData.machine_categories)
                        ? editData.machine_categories.split(',').map(c => c.trim()).filter(Boolean)
                        : [];
                    populateCatSeriesMachineCatOptions();
                    populateCatSeriesManufacturerOptions();

                    // Feld fuer Kategorie-Typ "Zusatzausrüstung"
                    if (catEquipmentRemarkInput) catEquipmentRemarkInput.value = editData ? (editData.remark || '') : '';

                    catModal.classList.remove('hidden');
                    catModal.style.display = 'flex';
                    requestAnimationFrame(() => {
                        catModal.classList.add('show');
                    });
                    if (catNameInput && !editData) {
                        catNameInput.focus();
                    }
                }
            }

            // Color picker helper
            window.selectCatColor = function (color) {
                const preview = document.getElementById('cat-color-preview');
                const hidden = document.getElementById('cat-color-value');
                const customInput = document.getElementById('cat-color-custom');
                if (preview) { preview.style.background = color; preview.style.boxShadow = `0 0 12px ${color}`; }
                if (hidden) hidden.value = color;
                if (customInput) customInput.value = color;
                // Highlight selected swatch
                document.querySelectorAll('#cat-color-swatches div').forEach(s => {
                    s.style.border = s.style.background === color || s.style.backgroundColor === color
                        ? '2px solid white' : '2px solid transparent';
                });
            };

            function closeModal() {
                if (catModal) {
                    catModal.classList.remove('show');
                    setTimeout(() => {
                        catModal.classList.add('hidden');
                        catModal.style.display = 'none';
                    }, 300);
                }
            }

            if (cancelCatBtn) {
                cancelCatBtn.addEventListener('click', closeModal);
            }

            if (saveCatBtn) {
                // Clone to remove old listeners
                const newBtn = saveCatBtn.cloneNode(true);
                saveCatBtn.parentNode.replaceChild(newBtn, saveCatBtn);

                newBtn.addEventListener('click', async () => {
                    if (!supabaseClient) { window.showToast('Datenbank nicht verbunden'); return; }

                    const name = catNameInput ? catNameInput.value.trim() : '';
                    if (!name) {
                        window.showToast('Bitte einen Namen eingeben.');
                        return;
                    }

                    let typeValue = 'machine';
                    if (catTypeRadios) {
                        for (const radio of catTypeRadios) {
                            if (radio.checked) { typeValue = radio.value; break; }
                        }
                    }

                    const intervalValue = typeValue === 'machine' ? parseInt(catIntervalInput.value) || 12 : null;
                    const editingId = catModalId ? catModalId.value : '';

                    const colorValue = document.getElementById('cat-color-value');
                    const payload = {
                        name: name,
                        type: typeValue,
                        default_maintenance_interval_months: intervalValue,
                        color: colorValue ? colorValue.value : '#10b981',
                        manufacturer: typeValue === 'series' ? (catSeriesManufacturerInput?.value.trim() || null) : null,
                        machine_categories: typeValue === 'series' ? activeCatSeriesMachineCategories.join(', ') : null,
                        remark: typeValue === 'equipment' ? (catEquipmentRemarkInput?.value.trim() || null) : null
                    };

                    let response;
                    if (editingId) {
                        // Check for interval change
                        const oldCat = (window.categoryList || []).find(c => c.id == editingId);
                        const intervalChanged = oldCat && oldCat.default_maintenance_interval_months !== intervalValue;

                        // UPDATE
                        response = await supabaseClient
                            .from('categories')
                            .update(payload)
                            .eq('id', editingId);

                        if (!response.error && intervalChanged && typeValue === 'machine') {
                            console.log('Interval changed, updating affected machines...');
                            await updateAffectedMachines(editingId, intervalValue);
                        }

                        // Name geändert? Vieles hängt per ID (unkritisch), aber etliche
                        // Zuordnungen speichern den Kategorie-NAMEN als Text — Adresstyp und
                        // Hersteller an Adressen, Serie/Kategorien an Maschinen und Dokumenten,
                        // Angebots-Status. Die werden hier nachgezogen, sonst zeigen die
                        // Datensätze weiter den alten Namen und die Auswahl greift nicht mehr.
                        if (!response.error && oldCat && oldCat.name && oldCat.name.trim() !== name) {
                            await cascadeCategoryRename(oldCat.name, name, typeValue);
                        }
                    } else {
                        // INSERT — ans Ende der Liste dieses Typs anhängen
                        const sameTypeCats = (window.categoryList || []).filter(c => c.type === typeValue);
                        const maxOrder = sameTypeCats.reduce((max, c) => Math.max(max, c.sort_order || 0), 0);
                        payload.sort_order = maxOrder + 1;

                        response = await supabaseClient
                            .from('categories')
                            .insert([payload]);
                    }

                    if (response.error) {
                        window.showToast('Fehler: ' + response.error.message);
                    } else {
                        closeModal();
                        fetchCategories();
                        if (typeof fetchMachines === 'function') fetchMachines();
                    }
                });
            }

            // ==========================================
            // KATEGORIE UMBENENNEN -> ÜBERALL NACHZIEHEN
            // ==========================================
            // Ein Teil der Zuordnungen hängt an der Kategorie-ID (Maschinen,
            // Serviceberichte, Kontaktarten, Zusatzausrüstung) — die sind vom
            // Umbenennen gar nicht betroffen. Der Rest speichert den NAMEN als
            // Text; genau dort steht sonst weiter der alte Name und die
            // Auswahl-Kästchen greifen nicht mehr.
            //
            // Pro Kategorie-Typ die Stellen, an denen der Name als Text liegt.
            // `csv: true` = kommagetrennte Mehrfachauswahl in einer Textspalte.
            const CATEGORY_NAME_REFS = {
                machine: [
                    { table: 'categories', column: 'machine_categories', csv: true, filter: q => q.eq('type', 'series') },
                    { table: 'documents',  column: 'machine_categories', csv: true }
                ],
                series: [
                    { table: 'machines',  column: 'machine_series', csv: false },
                    { table: 'documents', column: 'machine_series', csv: true }
                ],
                manufacturer: [
                    { table: 'customers',  column: 'manufacturer', csv: true },
                    { table: 'machines',   column: 'manufacturer', csv: false },
                    { table: 'categories', column: 'manufacturer', csv: false, filter: q => q.eq('type', 'series') }
                ],
                address_type: [
                    { table: 'customers', column: 'address_type', csv: true }
                ],
                document: [
                    { table: 'documents', column: 'category', csv: true }
                ],
                status: [
                    { table: 'angebote', column: 'status', csv: false }
                ]
            };

            // Verknüpfungsarten liegen als Kürzel ("technischer_partner") in
            // customer_links.link_type — dieselbe Umwandlung wie in getLinkTypes().
            const linkTypeSlug = (s) => (s || '').toLowerCase().replace(/\s+/g, '_');

            async function cascadeCategoryRename(oldName, newName, typeValue) {
                const oldN = (oldName || '').trim();
                const newN = (newName || '').trim();
                if (!oldN || !newN || oldN === newN) return;

                const norm = s => (s || '').trim().toLowerCase();
                // Kommagetrennte Liste: alten Namen ersetzen; null = nichts zu tun.
                const replaceInList = (csv) => {
                    const parts = (csv || '').split(',').map(s => s.trim()).filter(Boolean);
                    let changed = false;
                    const out = parts.map(p => {
                        if (norm(p) === norm(oldN)) { changed = true; return newN; }
                        return p;
                    });
                    return changed ? [...new Set(out)].join(', ') : null;
                };
                // Einzelwert: nur bei exakter (case-insensitiver) Übereinstimmung.
                const replaceSingle = (val) => (norm(val) === norm(oldN) && val !== newN) ? newN : null;

                const refs = CATEGORY_NAME_REFS[typeValue] || [];
                const fehlgeschlagen = [];

                for (const ref of refs) {
                    try {
                        // Ganze Spalte holen und im Browser vergleichen — eine
                        // fehlende Spalte darf nicht die ganze Umbenennung kippen.
                        let query = supabaseClient.from(ref.table).select('id, ' + ref.column);
                        if (ref.filter) query = ref.filter(query);
                        const { data, error } = await query;
                        if (error) throw error;

                        for (const row of (data || [])) {
                            const neu = ref.csv ? replaceInList(row[ref.column]) : replaceSingle(row[ref.column]);
                            if (neu === null) continue;
                            const patch = {};
                            patch[ref.column] = neu;
                            const { error: updErr } = await supabaseClient
                                .from(ref.table).update(patch).eq('id', row.id);
                            if (updErr) throw updErr;
                        }
                    } catch (e) {
                        console.warn(`Umbenennen konnte in ${ref.table}.${ref.column} nicht nachgezogen werden:`, e);
                        fehlgeschlagen.push(ref.table);
                    }
                }

                // Verknüpfungsarten: Kürzel statt Klartext.
                if (typeValue === 'link') {
                    try {
                        const alt = linkTypeSlug(oldN);
                        const neu = linkTypeSlug(newN);
                        if (alt !== neu) {
                            const { error } = await supabaseClient
                                .from('customer_links').update({ link_type: neu }).eq('link_type', alt);
                            if (error) throw error;
                        }
                    } catch (e) {
                        console.warn('Umbenennen konnte in customer_links.link_type nicht nachgezogen werden:', e);
                        fehlgeschlagen.push('customer_links');
                    }
                }

                // UVV-/Wartungsplan-Zuordnungen liegen als JSON in app_settings
                // (Serien stehen dort im Klartext).
                if (typeValue === 'series') {
                    try {
                        const { data } = await supabaseClient
                            .from('app_settings').select('value').eq('key', 'uvv_plan_assignments').maybeSingle();
                        const zuord = (data && data.value) ? data.value : null;
                        let geaendert = false;
                        if (zuord && typeof zuord === 'object') {
                            Object.values(zuord).forEach(a => {
                                if (!a || !Array.isArray(a.machine_series)) return;
                                a.machine_series = a.machine_series.map(s => {
                                    if (norm(s) === norm(oldN)) { geaendert = true; return newN; }
                                    return s;
                                });
                            });
                        }
                        if (geaendert) {
                            const { error } = await supabaseClient
                                .from('app_settings').update({ value: zuord }).eq('key', 'uvv_plan_assignments');
                            if (error) throw error;
                        }
                    } catch (e) {
                        console.warn('Umbenennen konnte in den UVV-Zuordnungen nicht nachgezogen werden:', e);
                        fehlgeschlagen.push('app_settings');
                    }
                }

                // Zwischengespeicherte Listen neu laden, sonst zeigt die
                // Adress-/Dokumentenansicht weiter den alten Namen.
                try {
                    if (typeof window.loadAddressbook === 'function') await window.loadAddressbook(true);
                } catch (e) { /* Ansicht evtl. nie geöffnet — unkritisch */ }

                if (fehlgeschlagen.length) {
                    window.showToast('Kategorie umbenannt, aber nicht überall übernommen: '
                        + [...new Set(fehlgeschlagen)].join(', ') + '. Details in der Konsole.');
                }
            }

            // ==========================================
            // VERWAISTE KATEGORIE-NAMEN
            // ==========================================
            // Frühere Umbenennungen wurden nicht nachgezogen — an den Datensätzen
            // steht dann ein Name, zu dem es keine Kategorie mehr gibt (z. B. ein
            // Adresstyp, der überall angezeigt, aber nirgends mehr angehakt wird).
            // Hier werden sie gesucht und lassen sich per Auswahl umschreiben;
            // das Umschreiben nutzt dieselbe Kaskade wie das Umbenennen.
            const CATEGORY_TYPE_LABELS = {
                machine: 'Maschinenkategorie',
                series: 'Maschinenserie',
                manufacturer: 'Hersteller',
                address_type: 'Adresstyp',
                document: 'Dokumententyp',
                status: 'Angebots-Status'
            };

            window.scanOrphanCategoryNames = async function () {
                const panel = document.getElementById('orphan-categories-panel');
                const box = document.getElementById('orphan-categories-list');
                if (!panel || !box || !supabaseClient) return;

                const norm = s => (s || '').trim().toLowerCase();
                const gefunden = []; // { type, name, anzahl }

                // Dokumententypen bleiben außen vor: die PDF-Erzeugung setzt dort
                // auch Werte ohne passende Kategorie ('Servicebericht'), das wäre
                // eine Warnung, die sich nie auflösen lässt.
                const SCAN_TYPES = ['machine', 'series', 'manufacturer', 'address_type', 'status'];

                for (const [typeValue, refs] of Object.entries(CATEGORY_NAME_REFS)) {
                    if (!SCAN_TYPES.includes(typeValue)) continue;
                    const bekannt = new Set(
                        (window.categoryList || [])
                            .filter(c => c.type === typeValue)
                            .map(c => norm(c.name))
                    );
                    const zaehler = new Map(); // norm -> { name, anzahl }

                    for (const ref of refs) {
                        try {
                            let query = supabaseClient.from(ref.table).select('id, ' + ref.column);
                            if (ref.filter) query = ref.filter(query);
                            const { data, error } = await query;
                            if (error) throw error;
                            for (const row of (data || [])) {
                                const roh = row[ref.column];
                                if (!roh) continue;
                                const werte = ref.csv
                                    ? String(roh).split(',').map(s => s.trim()).filter(Boolean)
                                    : [String(roh).trim()].filter(Boolean);
                                werte.forEach(w => {
                                    if (bekannt.has(norm(w))) return;
                                    const eintrag = zaehler.get(norm(w)) || { name: w, anzahl: 0 };
                                    eintrag.anzahl++;
                                    zaehler.set(norm(w), eintrag);
                                });
                            }
                        } catch (e) {
                            console.warn(`Verwaiste Namen in ${ref.table}.${ref.column} nicht prüfbar:`, e);
                        }
                    }

                    zaehler.forEach(e => gefunden.push({ type: typeValue, name: e.name, anzahl: e.anzahl }));
                }

                if (!gefunden.length) {
                    panel.style.display = 'none';
                    box.innerHTML = '';
                    return;
                }

                const esc = s => String(s == null ? '' : s)
                    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

                box.innerHTML = gefunden.map((o, i) => {
                    const ziele = (window.categoryList || [])
                        .filter(c => c.type === o.type)
                        .map(c => `<option value="${esc(c.name)}">${esc(c.name)}</option>`).join('');
                    return `
                        <div class="orphan-row">
                            <div class="orphan-row-label">
                                <span class="orphan-name">${esc(o.name)}</span>
                                <span class="orphan-meta">${esc(CATEGORY_TYPE_LABELS[o.type] || o.type)} · ${o.anzahl}× hinterlegt</span>
                            </div>
                            <select id="orphan-target-${i}" class="glass-form-input">
                                <option value="">— Ziel wählen —</option>
                                ${ziele}
                            </select>
                            <button type="button" class="orphan-apply" onclick="window.applyOrphanCategoryFix('${esc(o.type)}', ${JSON.stringify(o.name).replace(/"/g, '&quot;')}, ${i})">Übernehmen</button>
                        </div>`;
                }).join('');
                panel.style.display = '';
            };

            window.applyOrphanCategoryFix = async function (typeValue, altName, index) {
                const sel = document.getElementById('orphan-target-' + index);
                const ziel = sel ? sel.value : '';
                if (!ziel) { window.showToast('Bitte erst eine Ziel-Kategorie wählen.'); return; }
                if (!confirm(`"${altName}" überall durch "${ziel}" ersetzen?`)) return;
                try {
                    await cascadeCategoryRename(altName, ziel, typeValue);
                    window.showToast(`"${altName}" wurde durch "${ziel}" ersetzt.`);
                    await fetchCategories();
                    if (typeof fetchMachines === 'function') fetchMachines();
                    await window.scanOrphanCategoryNames();
                } catch (e) {
                    console.error('Verwaisten Namen ersetzen fehlgeschlagen:', e);
                    window.showToast('Fehler: ' + e.message);
                }
            };

            async function updateAffectedMachines(categoryId, newInterval) {
                try {
                    const oldCat = (window.categoryList || []).find(c => c.id == categoryId);
                    const oldInterval = oldCat ? (oldCat.default_maintenance_interval_months || 12) : 12;

                    const { data: machines, error } = await supabaseClient
                        .from('machines')
                        .select('id, last_maintenance, next_maintenance, files')
                        .eq('category_id', categoryId);

                    if (error) throw error;
                    if (!machines || machines.length === 0) return;

                    for (const m of machines) {
                        if (!m.last_maintenance) continue;

                        // Check if it's currently considered "AUTO" OR if it matches the old logic (migration)
                        const isAuto = Array.isArray(m.files) && m.files.some(f => f.type === 'meta' && f.key === 'is_next_maintenance_auto' && f.property === 'true');

                        // Heuristic migration: if next_maintenance matches last + oldInterval, it was likely auto-calculated
                        let shouldUpdate = isAuto;
                        if (!isAuto && m.next_maintenance) {
                            const last = new Date(m.last_maintenance);
                            const next = new Date(m.next_maintenance);
                            const expectedNext = new Date(last);
                            expectedNext.setMonth(expectedNext.getMonth() + parseInt(oldInterval));
                            if (next.toISOString().split('T')[0] === expectedNext.toISOString().split('T')[0]) {
                                shouldUpdate = true;
                            }
                        }

                        if (shouldUpdate) {
                            const nextDateStr = window.computeRolledNextMaintenance(m.last_maintenance, newInterval);

                            // Update machine and ensure meta is set
                            let finalFiles = m.files ? [...m.files] : [];
                            finalFiles = finalFiles.filter(f => f.type !== 'meta' || f.key !== 'is_next_maintenance_auto');
                            finalFiles.push({ type: 'meta', key: 'is_next_maintenance_auto', property: 'true' });

                            await supabaseClient
                                .from('machines')
                                .update({
                                    next_maintenance: nextDateStr,
                                    files: finalFiles
                                })
                                .eq('id', m.id);
                        }
                    }
                } catch (err) {
                    console.error('Error in updateAffectedMachines:', err);
                }
            }

            // --- Calendar Interaction Handlers ---
            window.handleCalendarDragStart = function (event, machineId) {
                event.dataTransfer.setData('text/plain', machineId);
                if (event.target) event.target.style.opacity = '0.5';
            };

            let calendarNavPendingMachineId = null;

            window.handleCalendarEventClick = function (machineId) {
                const event = window.event;
                if (!event) return;

                calendarNavPendingMachineId = machineId;

                const popover = document.getElementById('calendar-nav-popover');
                if (!popover) return;

                // Position popover near click
                const x = Math.min(event.clientX, window.innerWidth - 300);
                const y = Math.min(event.clientY, window.innerHeight - 200);

                popover.style.left = x + 'px';
                popover.style.top = y + 'px';
                popover.classList.add('active');

                // Stop propagation to prevent immediate close from document listener
                event.stopPropagation();
            };

            window.closeCalendarNavPopover = function () {
                const popover = document.getElementById('calendar-nav-popover');
                if (popover) popover.classList.remove('active');
                calendarNavPendingMachineId = null;
            };

            window.confirmCalendarNavigation = function () {
                if (!calendarNavPendingMachineId) return;

                const machine = (window.machineList || []).find(m => m.id == calendarNavPendingMachineId);

                // Switch to machines view
                if (typeof window.switchView === 'function') {
                    window.switchView('machines');
                }

                // Apply Search Filter automatically (highly specific, matches title format)
                const searchInput = document.getElementById('machine-search-input');
                if (machine) {
                    const machineTitle = [
                        machine.manufacturer,
                        machine.name,
                        machine.serial ? `#${machine.serial}` : null,
                        machine.year ? `(${machine.year})` : null
                    ].filter(Boolean).join(' ');

                    // Update global filter state
                    window.machineSearchFilter = machineTitle;

                    // Update UI
                    if (searchInput) {
                        searchInput.value = machineTitle;
                    }

                    // Trigger re-render of machines list based on new search value
                    if (typeof window.renderMachines === 'function') {
                        window.renderMachines();
                    }
                }

                // Open modal
                if (typeof window.openEditStammdaten === 'function') {
                    setTimeout(() => {
                        window.openEditStammdaten(calendarNavPendingMachineId);
                        window.closeCalendarNavPopover();
                    }, 100);
                }
            };

            // Close popover on click outside
            document.addEventListener('click', (e) => {
                const popover = document.getElementById('calendar-nav-popover');
                if (popover && !popover.contains(e.target)) {
                    window.closeCalendarNavPopover();
                }
            });

            window.handleCalendarDrop = async function (event, dateStr) {
                event.preventDefault();
                if (event.currentTarget) event.currentTarget.style.background = '';
                const machineId = event.dataTransfer.getData('text/plain');
                if (!machineId) return;

                // Reset opacity for all pills (simplest way since we don't track the element easily)
                document.querySelectorAll('.calendar-event-pill').forEach(p => p.style.opacity = '1');

                if (!supabaseClient) return;

                try {
                    const m = (window.machineList || []).find(mm => mm.id == machineId);
                    if (!m) return;

                    // dateStr is already YYYY-MM-DD from the ondrop attribute
                    const finalDateStr = dateStr;

                    // Remove "AUTO" flag when manually dragged
                    let updatedFiles = Array.isArray(m.files) ? [...m.files] : [];
                    updatedFiles = updatedFiles.filter(f => f.type !== 'meta' || f.key !== 'is_next_maintenance_auto');

                    const { error } = await supabaseClient
                        .from('machines')
                        .update({
                            next_maintenance: finalDateStr,
                            files: updatedFiles
                        })
                        .eq('id', machineId);

                    if (error) throw error;

                    // Update local state
                    m.next_maintenance = finalDateStr;
                    m.files = updatedFiles;

                    // Re-render
                    if (typeof window.renderEvents === 'function') window.renderEvents();
                    if (typeof renderMachines === 'function') renderMachines();

                    // Also update dashboard if visible
                    const homeView = document.getElementById('home');
                    if (homeView && !homeView.classList.contains('hidden') && typeof renderDashboard === 'function') {
                        renderDashboard();
                    }

                    console.log(`Updated machine ${machineId} to ${finalDateStr} (Manual Move)`);
                } catch (err) {
                    console.error('Error updating maintenance date via calendar:', err);
                    window.showToast('Fehler beim Aktualisieren des Datums.');
                }
            };

            // Add Category Button Listener (Open Modal)
            if (addCatBtn) {
                const newBtn = addCatBtn.cloneNode(true);
                addCatBtn.parentNode.replaceChild(newBtn, addCatBtn);
                newBtn.addEventListener('click', () => openModal());
            }

            window.editCategory = function (id) {
                const cat = (window.categoryList || []).find(c => c.id === id);
                if (cat) {
                    openModal(cat);
                }
            };


            // ==========================================
            // MACHINES MANAGEMENT LOGIC
            // ==========================================


            function applyMachineList(data) {
                // Wartungstermin bei jedem Laden live neu berechnen (nicht nur beim Speichern),
                // damit ein längst überfälliger Termin sich automatisch auf den nächsten
                // sinnvollen Zyklus weiterschiebt, auch ohne dass zwischenzeitlich eine neue
                // Wartung erfasst wurde. "last_maintenance" bleibt dabei unangetastet.
                (data || []).forEach(m => {
                    if (!m.last_maintenance) return;
                    const cat = (window.categoryList || []).find(c => c.id === m.category_id);
                    const interval = m.maintenance_interval_months || (cat ? cat.default_maintenance_interval_months : 12) || 12;
                    if (typeof window.computeRolledNextMaintenance === 'function') {
                        m.next_maintenance = window.computeRolledNextMaintenance(m.last_maintenance, interval);
                    }
                });

                const sorted = (data || []).sort((a, b) => {
                    const mA = (a.manufacturer || '').trim().toLowerCase();
                    const mB = (b.manufacturer || '').trim().toLowerCase();
                    if (mA !== mB) return mA.localeCompare(mB, 'de', { sensitivity: 'base' });
                    const tA = (a.name || '').trim().toLowerCase();
                    const tB = (b.name || '').trim().toLowerCase();
                    if (tA !== tB) return tA.localeCompare(tB, 'de', { numeric: true, sensitivity: 'base' });
                    const sA = a.serial || a.serial_number || '';
                    const sB = b.serial || b.serial_number || '';
                    return sA.localeCompare(sB, 'de', { numeric: true, sensitivity: 'base' });
                });
                window.machineList = sorted;
                if (typeof machineList !== 'undefined') machineList = sorted;
                if (typeof window.renderMachines === 'function') window.renderMachines();
                else if (typeof renderMachines === 'function') renderMachines();
                const homeView = document.getElementById('home');
                if (homeView && !homeView.classList.contains('hidden')) renderDashboard();
                const serviceView = document.getElementById('service');
                if (serviceView && !serviceView.classList.contains('hidden')) {
                    if (typeof renderServiceEntries === 'function') renderServiceEntries();
                }
                if (typeof window.renderEvents === 'function') window.renderEvents();
                // Angebote-Liste zeigt Maschinennamen per window.getMachineName an — falls sie schon
                // gerendert war, bevor die Maschinen fertig geladen waren (z.B. direkt nach Login),
                // sonst bleiben die Namen leer, bis man zufällig irgendwo neu rendert.
                // Maschinen-Filter-Dropdown neu befüllen: waren die Angebote schneller geladen
                // als die Maschinen, fehlen dort sonst alle per machine_id verknüpften Maschinen
                // und es bleiben nur die Freitext-Bezeichnungen übrig.
                if (typeof window.populateAngeboteFilterOptions === 'function') {
                    window.populateAngeboteFilterOptions();
                }
                const listenView = document.getElementById('listen');
                if (listenView && !listenView.classList.contains('hidden') && typeof window.renderAngeboteList === 'function') {
                    window.renderAngeboteList();
                }
            }
            window.applyMachineList = applyMachineList;

            async function fetchMachines() {
                const client = window.supabaseClient || (typeof supabaseClient !== 'undefined' ? supabaseClient : null);
                if (!client) return;

                // 1. Zuerst sofort aus Cache laden (falls vorhanden)
                try {
                    const cached = localStorage.getItem('offline_machines');
                    if (cached) {
                        const parsed = JSON.parse(cached);
                        if (Array.isArray(parsed) && parsed.length > 0) {
                            applyMachineList(parsed);
                        }
                    }
                } catch(e) {}

                if (!navigator.onLine) return;

                // 2. Frische Daten aus der DB holen
                let data, error;
                try {
                    const query = client.from('machines').select('*').order('created_at', { ascending: true });
                    if (typeof window.withTimeout === 'function') {
                        const result = await window.withTimeout(query, 12000);
                        data = result.data; error = result.error;
                    } else {
                        const result = await query;
                        data = result.data; error = result.error;
                    }
                } catch (err) {
                    error = err;
                }

                if (error) {
                    console.error('Error fetching machines from Supabase:', error);
                    // Fallback to cache if request timed out or erred
                    try {
                        const cached = localStorage.getItem('offline_machines');
                        if (cached) applyMachineList(JSON.parse(cached));
                    } catch(e) {}
                    return;
                }

                if (Array.isArray(data)) {
                    try { localStorage.setItem('offline_machines', JSON.stringify(data)); } catch(e) {}
                    applyMachineList(data);
                }
            }
            // Muss außerhalb des Funktionsrumpfs stehen: auth.js ruft window.fetchMachines()
            // direkt nach dem Login auf — läge der Export drinnen, wäre er dort noch nicht
            // gesetzt und die Maschinenliste bliebe stumm leer.
            window.fetchMachines = fetchMachines;

            // ==========================================
            // LIVE-AKTUALISIERUNG (Supabase Realtime)
            // ==========================================
            // Eine einzige dauerhafte Verbindung pro geöffnetem Tab — kein Polling. Aktualisiert
            // nur die Hintergrund-Listen (allServiceEntries / machineList) und rendert sie neu;
            // ein gerade offenes Bearbeitungsformular (Servicebericht-/Maschinen-Modal) wird NIE
            // angefasst, damit niemandem mitten im Tippen Daten überschrieben werden — das Modal
            // arbeitet ohnehin mit einer eigenen Kopie, die erst beim Speichern abgeglichen wird.
            let realtimeSubscribed = false;
            window.initRealtimeSubscriptions = function () {
                if (realtimeSubscribed || !window.supabaseClient) return;
                realtimeSubscribed = true;

                window.supabaseClient
                    .channel('service_entries_live')
                    .on('postgres_changes', { event: '*', schema: 'public', table: 'service_entries' }, (payload) => {
                        try { window.handleServiceEntryRealtimeChange(payload); } catch (e) { console.error('Realtime service_entries Fehler:', e); }
                    })
                    .subscribe();

                window.supabaseClient
                    .channel('machines_live')
                    .on('postgres_changes', { event: '*', schema: 'public', table: 'machines' }, (payload) => {
                        try { window.handleMachineRealtimeChange(payload); } catch (e) { console.error('Realtime machines Fehler:', e); }
                    })
                    .subscribe();

                // Vorgänge live bei allen Clients. Der Realtime-Payload enthält keine
                // Joins (machines/customers), daher wird komplett neu geladen — aber
                // gebündelt (Debounce), damit ein Schwall Änderungen nur einmal lädt.
                window.supabaseClient
                    .channel('internal_processes_live')
                    .on('postgres_changes', { event: '*', schema: 'public', table: 'internal_processes' }, () => {
                        try { window.scheduleProcessesRefetch(); } catch (e) { console.error('Realtime internal_processes Fehler:', e); }
                    })
                    .subscribe();

                // Aufgaben und Unteraufgaben live bei allen Clients — die
                // Aufgaben-Ansicht läuft als Anzeigetafel auf dem Fernseher in
                // der Werkstatt und darf dafür nicht neu geladen werden müssen.
                ['tasks', 'subtasks'].forEach(tabelle => {
                    window.supabaseClient
                        .channel(tabelle + '_live')
                        .on('postgres_changes', { event: '*', schema: 'public', table: tabelle }, () => {
                            try { window.scheduleTasksRefetch(); } catch (e) { console.error('Realtime ' + tabelle + ' Fehler:', e); }
                        })
                        .subscribe();
                });

                // Adressbuch live halten (eigene Kanäle in addressbook-live.js)
                if (typeof window.initAddressbookLive === 'function') {
                    try { window.initAddressbookLive(); } catch (e) { console.error('Adressbuch-Live init Fehler:', e); }
                }

                // Werkstatt-Liste laden + live halten (eigener Kanal in workshop-tasks.js)
                if (typeof window.initWorkshopTasks === 'function') {
                    try { window.initWorkshopTasks(); } catch (e) { console.error('Werkstatt-Liste init Fehler:', e); }
                }
            };

            let _processesRefetchTimer = null;
            window.scheduleProcessesRefetch = function () {
                if (typeof window.fetchProcesses !== 'function') return;
                clearTimeout(_processesRefetchTimer);
                _processesRefetchTimer = setTimeout(() => { window.fetchProcesses(); }, 400);
            };

            window.handleServiceEntryRealtimeChange = function (payload) {
                if (!Array.isArray(allServiceEntries)) return;
                if (payload.eventType === 'DELETE') {
                    const id = payload.old && payload.old.id;
                    if (id == null) return;
                    allServiceEntries = allServiceEntries.filter(e => e.id !== id);
                } else {
                    const r = payload.new;
                    if (!r) return;
                    // Auf dieselbe schlanke Form bringen wie fetchServiceEntries, damit die Liste
                    // konsistent bleibt (keine schweren JSONB-Felder wie work_log/materials anhäufen).
                    const slim = {
                        id: r.id, machine_id: r.machine_id, category_id: r.category_id, category_ids: r.category_ids,
                        title: r.title, date: r.date, datum_von: r.datum_von, datum_bis: r.datum_bis,
                        hours: r.hours, technicians: r.technicians, pdf_url: r.pdf_url, pdf_path: r.pdf_path,
                        files: r.files, is_finalized: r.is_finalized, finalized_at: r.finalized_at,
                        workshop_order_number: r.workshop_order_number, previous_report_id: r.previous_report_id
                    };
                    const idx = allServiceEntries.findIndex(e => e.id === slim.id);
                    if (idx !== -1) allServiceEntries[idx] = slim; else allServiceEntries.push(slim);
                }

                window.serviceEntryList = allServiceEntries;
                if (typeof renderServiceEntries === 'function') renderServiceEntries();
                if (window.offlineService) window.offlineService.cacheEntries(allServiceEntries).catch(() => {});
            };

            window.handleMachineRealtimeChange = function (payload) {
                if (!Array.isArray(machineList)) return;
                let merged;
                if (payload.eventType === 'DELETE') {
                    const id = payload.old && payload.old.id;
                    if (id == null) return;
                    merged = machineList.filter(m => m.id !== id);
                } else {
                    const r = payload.new;
                    if (!r) return;
                    const idx = machineList.findIndex(m => m.id === r.id);
                    merged = [...machineList];
                    if (idx !== -1) merged[idx] = r; else merged.push(r);
                }
                applyMachineList(merged);
                try { localStorage.setItem('offline_machines', JSON.stringify(merged)); } catch (e) {}
            };

            function getStatusColor(status) {
                if (status === 'Betriebsbereit') return 'var(--color-primary-green)';
                if (status === 'Wartung') return '#FFA000'; // Orange
                if (status === 'Defekt') return '#D32F2F'; // Red
                return '#333';
            }

            function formatDate(dateStr) {
                if (!dateStr) return 'Kein Termin';
                return new Date(dateStr).toLocaleDateString('de-DE');
            }

            // Helper for Creating Machine
            window.createMachine = async function () {
                if (!supabaseClient) { window.showToast('Datenbank nicht verbunden'); return; }

                const name = prompt('Name der Maschine:');
                if (!name) return;

                // Category Selection (simple prompt for now, could be improved)
                // In a real app we'd use a modal with dropdown
                let catId = null;
                if (categoryList.length > 0) {
                    // Simple way: show list and ask for ID (terrible UX but MVP step 1)
                    // Better: just pick first or ask for name match?
                    // Let's iterate categories and build a prompt string
                    const catString = categoryList.map(c => `${c.id}: ${c.name}`).join('\n');
                    const idInput = prompt(`Wähle eine Kategorie-ID:\n${catString}`);
                    catId = parseInt(idInput);
                    if (isNaN(catId)) catId = null;
                }

                const status = 'Betriebsbereit'; // Default

                const { error } = await supabaseClient
                    .from('machines')
                    .insert([{ name: name, category_id: catId, status: status }]);

                if (error) {
                    window.showToast('Fehler: ' + error.message);
                } else {
                    fetchMachines();
                }
            };

            window.deleteMachine = async function (id) {
                if (typeof window.canDelete === 'function' && !window.canDelete('Maschinen')) return;
                if (!supabaseClient) { window.showToast('Datenbank nicht verbunden'); return; }
                if (confirm('Maschine wirklich löschen?')) {
                    try {
                        // Fetch files associated with the machine first
                        const { data: machineData, error: fetchError } = await supabaseClient
                            .from('machines')
                            .select('files')
                            .eq('id', id)
                            .single();

                        if (!fetchError && machineData && machineData.files && Array.isArray(machineData.files)) {
                            console.log('Deleting associated machine files from storage for machine ID:', id);
                            for (const file of machineData.files) {
                                await deleteFileEntryStorage(file);
                            }
                        }

                        const { error } = await supabaseClient.from('machines').delete().eq('id', id);
                        if (error) throw error;
                        
                        fetchMachines();
                    } catch (err) {
                        window.showToast('Fehler beim Löschen: ' + err.message);
                    }
                }
            }

            let currentEditingId = null;

            window.openEditStammdaten = function (id) {
                const machines = window.machineList || [];
                const machine = machines.find(m => m.id === id);
                if (!machine) return;
                updateLastViewed(id);
                currentEditingId = id;
                openAddMachineModal(machine);
            };

            window.closeMachineDetailsModal = function () {
                const modal = document.getElementById('machine-details-modal');
                if (modal) {
                    modal.classList.remove('show');
                    setTimeout(() => {
                        modal.classList.add('hidden');
                        modal.style.display = 'none';
                    }, 300);
                }
            };
            // Maschinen-Detailansicht: Modal, letzter Serviceeinsatz, Routen-Link — ausgelagert nach js/machine-details-modal.js
            window.initMachineDetailsModal();
            // Einstellungen: UVV- und Wartungsplaene, Gruppenfarben — ausgelagert nach js/settings-uvv-plans.js
            window.initUvvWartungsplaene();
            // GLOBAL NAVIGATION HELPER (for Settings Cards and Back Buttons)
            // Map and Modal Logic
            let map = null;
            let marker = null;

            window.openAddMachineModal = async function (editData = null) {
                try {
                    const modal = document.getElementById('add-machine-modal');
                    if (!modal) { window.showToast('Fehler: Modal-Element nicht gefunden!'); return; }

                    const titleEl = modal.querySelector('h2');
                    const submitBtn = document.querySelector('button[onclick="submitNewMachine()"]');

                    if (editData) {
                        currentEditingId = editData.id;
                        if (titleEl) titleEl.textContent = 'Maschine bearbeiten';
                        if (submitBtn) submitBtn.textContent = 'Speichern';
                    } else {
                        currentEditingId = null;
                        if (titleEl) titleEl.textContent = 'Neue Maschine anlegen';
                        if (submitBtn) submitBtn.textContent = 'Maschine anlegen';
                    }

                    modal.classList.remove('hidden');
                    modal.style.display = 'flex';
                    requestAnimationFrame(() => {
                        modal.classList.add('show');
                    });

                    // Reset Files
                    machineFiles = [];
                    existingMachineFiles = editData ? (editData.files || []).filter(f => f.type !== 'meta') : [];
                    machineMainImage = editData ? (editData.image_url || null) : null;
                    removedMachineFiles = [];
                    renderMachineFilePreviews();

                                        // Reset fields or populate with editData
                    document.getElementById('machine-name').value = editData ? (editData.name || '') : '';
                    document.getElementById('machine-manufacturer').value = editData ? (editData.manufacturer || '') : '';
                    {
                        // Hersteller-Dropdown auf den hinterlegten Wert vorauswählen
                        const manuTextEl = document.getElementById('machine-manufacturer-text');
                        if (manuTextEl) {
                            const manuVal = editData ? (editData.manufacturer || '') : '';
                            manuTextEl.textContent = manuVal || 'Bitte wählen...';
                            manuTextEl.style.color = manuVal ? 'white' : '';
                        }
                        if (typeof window.populateMachineManufacturerDropdown === 'function') {
                            window.populateMachineManufacturerDropdown();
                        }
                    }
                    document.getElementById('machine-serial').value = editData ? (editData.serial || '') : '';
                    document.getElementById('machine-series').value = editData ? (editData.machine_series || '') : '';
                    {
                        const seriesTextEl = document.getElementById('machine-series-text');
                        if (seriesTextEl) {
                            if (editData && editData.machine_series) {
                                seriesTextEl.textContent = editData.machine_series;
                                seriesTextEl.style.color = 'white';
                            } else {
                                seriesTextEl.textContent = 'Bitte wählen...';
                                seriesTextEl.style.color = '';
                            }
                        }
                    }
                    document.getElementById('machine-year').value = editData ? (editData.year || '') : '';
                    document.getElementById('machine-motor-type').value = editData ? (editData.motor_type || '') : '';
                    document.getElementById('machine-motor-serial').value = editData ? (editData.motor_serial || '') : '';
                    document.getElementById('machine-power').value = editData ? (editData.power || '') : '';
                    document.getElementById('machine-owner').value = editData ? (editData.company || '') : '';
                    document.getElementById('machine-address-input').value = editData ? (editData.operator_address || '') : '';
                    document.getElementById('machine-location-input').value = editData ? (editData.location || '') : '';
                    document.getElementById('machine-last-maintenance').value = editData ? (editData.last_maintenance || '') : '';
                    document.getElementById('machine-next-maintenance').value = editData ? (editData.next_maintenance || '') : '';
                    document.getElementById('machine-maintenance-interval').value = editData ? (editData.maintenance_interval_months || '') : '';
                    document.getElementById('machine-image-url').value = editData ? (editData.image_url || '') : '';

                    // Populating in_workshop status
                    const inWorkshopVal = editData ? (editData.in_workshop || false) : false;
                    const cbInWorkshop = document.getElementById('machine-in-workshop');
                    if (cbInWorkshop) {
                        cbInWorkshop.checked = inWorkshopVal;
                        if (typeof window.toggleMachineWorkshopUI === 'function') {
                            window.toggleMachineWorkshopUI(inWorkshopVal);
                        }
                    }

                    // Populating split address fields
                    document.getElementById('machine-customer-id').value = editData ? (editData.customer_id || '') : '';
                    const locCustIdField = document.getElementById('machine-location-customer-id');
                    if (locCustIdField) locCustIdField.value = editData ? (editData.location_customer_id || '') : '';
                    document.getElementById('machine-customer-number').value = editData ? (editData.customer_number || '') : '';
                    document.getElementById('machine-operator-street').value = editData ? (editData.operator_street || '') : '';
                    document.getElementById('machine-operator-zip').value = editData ? (editData.operator_zip || '') : '';
                    document.getElementById('machine-operator-city').value = editData ? (editData.operator_city || '') : '';
                    document.getElementById('machine-operator-country').value = editData ? (editData.operator_country || 'Deutschland') : 'Deutschland';

                    document.getElementById('machine-location-company').value = editData ? (editData.location_company || '') : '';
                    document.getElementById('machine-location-street').value = editData ? (editData.location_street || '') : '';
                    document.getElementById('machine-location-zip').value = editData ? (editData.location_zip || '') : '';
                    document.getElementById('machine-location-city').value = editData ? (editData.location_city || '') : '';
                    document.getElementById('machine-location-country').value = editData ? (editData.location_country || '') : '';
                    // Show location group only if there's actual location data
                    const hasLocData = editData && (editData.location_street || editData.location_city || editData.location_zip);
                    const locGroup = document.getElementById('machine-location-address-group');
                    const locToggleBtn = document.getElementById('btn-toggle-machine-location');
                    if (locGroup) locGroup.style.display = hasLocData ? 'block' : 'none';
                    if (locToggleBtn) locToggleBtn.textContent = hasLocData ? '− Abweichenden Maschinenstandort entfernen' : '+ Abweichenden Maschinenstandort hinzufügen';

                    // Contact persons
                    if (typeof window.renderMachineContactPersons === 'function') {
                        window.renderMachineContactPersons(editData ? (editData.contact_persons || []) : []);
                    }

                    // Clear all search/suggestion fields on every open
                    ['machine-customer-search','machine-operator-search','machine-location-search'].forEach(id => {
                        const el = document.getElementById(id);
                        if (el) { el.value = ''; el.disabled = false; }
                    });
                    ['machine-customer-suggestions','machine-operator-suggestions','machine-location-suggestions'].forEach(id => {
                        const el = document.getElementById(id);
                        if (el) { el.style.display = 'none'; el.innerHTML = ''; }
                    });

                    // Update customer search UI
                    if (editData && editData.customer_id) {
                        try {
                            const { data: custData, error: custErr } = await window.supabaseClient
                                .from('customers')
                                .select('name, matchcode')
                                .eq('id', editData.customer_id)
                                .single();
                            if (custData && !custErr) {
                                document.getElementById('machine-customer-search').value = custData.matchcode ? `[${custData.matchcode}] ${custData.name}` : custData.name;
                                document.getElementById('machine-customer-search').disabled = true;
                                document.getElementById('btn-clear-customer').style.display = 'block';
                            } else {
                                document.getElementById('machine-customer-search').value = '';
                                document.getElementById('machine-customer-search').disabled = false;
                                document.getElementById('btn-clear-customer').style.display = 'none';
                            }
                        } catch (err) {
                            console.error('Error fetching customer details:', err);
                        }
                    } else {
                        document.getElementById('machine-customer-search').value = '';
                        document.getElementById('machine-customer-search').disabled = false;
                        document.getElementById('btn-clear-customer').style.display = 'none';
                    }

                    // Handle Auto Badge in Modal
                    const badge = document.getElementById('maint-auto-badge');
                    if (badge) {
                        const isAuto = editData && Array.isArray(editData.files) && editData.files.some(f => f.type === 'meta' && f.key === 'is_next_maintenance_auto' && f.property === 'true');
                        if (isAuto) badge.classList.remove('hidden');
                        else badge.classList.add('hidden');
                    }

                    // Update Image Slot Preview
                    const imageSlot = document.getElementById('machine-image-slot');
                    if (imageSlot) {
                        if (editData && editData.image_url) {
                            imageSlot.innerHTML = `<img src="${editData.image_url}" alt="Maschinenbild" style="width: 100%; height: 100%; object-fit: contain;">`;
                        } else {
                            imageSlot.innerHTML = `
                                    <div class="placeholder-content-inner" style="display: flex; flex-direction: column; align-items: center; gap: 12px; pointer-events: none;">
                                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.5;">
                                            <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/>
                                            <circle cx="12" cy="13" r="3"/>
                                        </svg>
                                        <span class="placeholder-text" style="font-size: 0.9rem; color: rgba(255,255,255,0.4); font-weight: 500;">Foto hinzufügen</span>
                                    </div>
                                `;
                        }
                    }

                    // Populate Files
                    if (editData) {
                        if (editData.files && Array.isArray(editData.files)) {
                            existingMachineFiles = editData.files.filter(f => f.type !== 'meta');
                        } else if (editData.image_url) {
                            // Legacy support: if no files array but image_url exists
                            existingMachineFiles.push({
                                name: 'Aktuelles Bild',
                                type: 'image/jpeg',
                                url: editData.image_url
                            });
                        }
                    }

                    // Render Previews
                    if (typeof renderMachineFilePreviews === 'function') {
                        renderMachineFilePreviews();
                    }

                    // Reset Contact Dropdown
                    const contactText = document.getElementById('contact-text');
                    const contactInput = document.getElementById('machine-contact-type');
                    const checkboxes = document.querySelectorAll('#contact-list input[type="checkbox"]');
                    if (contactText) contactText.textContent = 'Bitte wählen...';
                    if (contactInput) contactInput.value = '';
                    checkboxes.forEach(cb => cb.checked = false);

                    // Initialize Map dynamically if not already done
                    if (!map) {
                        try {
                            await window.loadLeaflet();
                            setTimeout(() => {
                                try {
                                    if (map) return; // Prevent double initialization
                                    map = L.map('machine-map').setView([51.1657, 10.4515], 6); // Center of Germany
                                    // Deutschsprachige Kacheln + Ansichtswechsel Karte/Luftbild/Gelände (siehe customers.js)
                                    window.addGermanBaseLayers(map, 'maschinenstandort');
                                    L.control.scale({ metric: true, imperial: false }).addTo(map);

                                    // Click to set pin
                                    map.on('click', function (e) {
                                        setMapPin(e.latlng.lat, e.latlng.lng);
                                    });
                                } catch (err) {
                                    console.error('Map init error:', err);
                                    document.getElementById('machine-map').innerHTML = '<p style="color:white; padding:10px;">Karte konnte nicht geladen werden.</p>';
                                }
                            }, 300); // Small delay for modal transition
                        } catch (err) {
                            console.error('Leaflet loading failed:', err);
                            document.getElementById('machine-map').innerHTML = '<p style="color:white; padding:10px;">Karte konnte nicht geladen werden (Verbindungsfehler).</p>';
                        }
                    }

                    // POPULATE Categories
                    const catList = document.getElementById('machine-category-list');
                    const catText = document.getElementById('machine-category-text');
                    const catInput = document.getElementById('machine-category');

                    const contactList = document.getElementById('contact-list');

                    if (typeof categoryList === 'undefined' || !Array.isArray(categoryList) || categoryList.length === 0) {
                        await fetchCategories();
                    }

                    // Maschinenserie-Vorschläge (gefiltert auf den bereits eingetragenen Hersteller)
                    // erst jetzt befüllen, da sie von categoryList abhängen, das ggf. erst eben geladen wurde.
                    populateMachineSeriesDropdown();

                    // Populate Machine Categories
                    if (catList && catText && catInput) {
                        catList.innerHTML = '';
                        if (editData && editData.category_id) {
                            const selectedCat = categoryList.find(c => c.id === editData.category_id);
                            if (selectedCat) {
                                catText.textContent = selectedCat.name;
                                catText.style.color = 'white';
                                catInput.value = selectedCat.id;
                            } else {
                                catText.textContent = 'Bitte wählen...';
                                catInput.value = '';
                            }
                        } else {
                            catText.textContent = 'Bitte wählen...';
                            catInput.value = '';
                        }

                        const cats = (typeof categoryList !== 'undefined' && Array.isArray(categoryList))
                            ? categoryList.filter(cat => cat.type === 'machine' && !['UVV', 'Wartung', 'DGUV'].includes(cat.name))
                            : [];

                        if (cats.length === 0) {
                            catList.innerHTML = '<li class="suggestion-item" style="color: #aaa;">Keine Kategorien gefunden</li>';
                        } else {
                            cats.forEach(cat => {
                                const li = document.createElement('li');
                                li.className = 'suggestion-item';
                                li.textContent = cat.name;
                                // Aktuelle Kategorie rot hinterlegen
                                if (catInput.value && String(catInput.value) === String(cat.id)) {
                                    li.classList.add('selected');
                                }
                                li.onclick = (e) => {
                                    e.stopPropagation();
                                    selectCategory(cat.id, cat.name);
                                };
                                catList.appendChild(li);
                            });
                        }
                    }

                    // Populate Contact Types
                    // Populate Contact Types
                    if (contactList) {
                        contactList.innerHTML = '';
                        const contactCats = (typeof categoryList !== 'undefined' && Array.isArray(categoryList))
                            ? categoryList.filter(cat => cat.type === 'contact')
                            : [];

                        if (contactCats.length === 0) {
                            contactList.innerHTML = '<li class="suggestion-item" style="color: #aaa;">Keine Kontaktarten gefunden</li>';
                        } else {
                            contactCats.forEach(cat => {
                                const li = document.createElement('li');
                                li.className = 'suggestion-item';
                                li.onclick = function () { toggleContactSelection(this, cat.name); };

                                // Custom Checkmark HTML
                                li.innerHTML = `
                                        <div class="checkmark-icon">
                                            <svg class="checkmark-svg" viewBox="0 0 24 24">
                                                <polyline points="20 6 9 17 4 12"></polyline>
                                            </svg>
                                        </div>
                                        <span class="contact-name" style="margin-left: 10px;">${cat.name}</span>
                                        <input type="checkbox" style="display: none;" value="${cat.name}">
                                    `;
                                contactList.appendChild(li);
                            });
                        }
                    }

                    // Updated Toggle Function (make sure this is global/accessible)
                    window.toggleContactSelection = function (li, value) {
                        const checkbox = li.querySelector('input[type="checkbox"]');
                        checkbox.checked = !checkbox.checked;

                        // Visual Toggle
                        if (checkbox.checked) {
                            li.classList.add('selected');
                        } else {
                            li.classList.remove('selected');
                        }

                        updateContactDisplay();
                    };

                    if (typeof window.loadMachineExtrasFromEditData === 'function') {
                        window.loadMachineExtrasFromEditData(editData);
                    }

                    // Zusatzausrüstung aus Katalog (Mehrfachauswahl) vorbelegen
                    window.machineEquipmentCatalogIds = (editData && Array.isArray(editData.equipment_category_ids))
                        ? [...editData.equipment_category_ids]
                        : [];
                    if (typeof populateMachineEquipmentCatalogDropdown === 'function') populateMachineEquipmentCatalogDropdown();

                } catch (e) {
                    window.showToast('Ein Fehler ist aufgetreten: ' + e.message);
                    console.error(e);
                }
            };

            // Custom Dropdown Logic
            window.toggleCategoryDropdown = function (e) {
                if (e) e.stopPropagation();
                const dropdown = document.getElementById('machine-category-dropdown');
                if (dropdown) dropdown.classList.toggle('show');
            };

            window.selectCategory = function (id, name) {
                document.getElementById('machine-category').value = id;
                document.getElementById('machine-category-text').textContent = name;
                document.getElementById('machine-category-text').style.color = 'white';
                const dropdown = document.getElementById('machine-category-dropdown');
                if (dropdown) {
                    // Markierung mitziehen, sonst bliebe der alte Eintrag rot
                    dropdown.querySelectorAll('li').forEach(li => {
                        li.classList.toggle('selected', li.textContent === name);
                    });
                    dropdown.classList.remove('show');
                }

                // Auto-calculate next maintenance date if category changes
                if (typeof calculateNextMaintenanceDate === 'function') calculateNextMaintenanceDate();
            };

            // Hersteller: Einzelauswahl aus den Kategorien vom Typ "manufacturer"
            // (Einstellungen > Kategorien). Gespeichert wird weiterhin der Klartext-Name
            // in machines.manufacturer, damit alle bestehenden Auswertungen weiterlaufen.
            window.toggleMachineManufacturerDropdown = function (e) {
                if (e) e.stopPropagation();
                const dropdown = document.getElementById('machine-manufacturer-dropdown');
                if (!dropdown) return;
                window.populateMachineManufacturerDropdown();
                dropdown.classList.toggle('show');
            };

            window.selectMachineManufacturer = function (name) {
                const input = document.getElementById('machine-manufacturer');
                const textEl = document.getElementById('machine-manufacturer-text');
                if (input) input.value = name || '';
                if (textEl) {
                    textEl.textContent = name || 'Bitte wählen...';
                    textEl.style.color = name ? 'white' : '';
                }
                const dropdown = document.getElementById('machine-manufacturer-dropdown');
                if (dropdown) dropdown.classList.remove('show');
                window.onMachineManufacturerChange();
            };

            // Liste der Hersteller: Kategorien vom Typ "manufacturer" plus – falls an einer
            // Maschine noch ein alter Freitext-Hersteller hängt – dessen Wert, damit die
            // Auswahl beim Bearbeiten nie leer wirkt.
            window.getManufacturerOptions = function () {
                const fromCats = (window.categoryList || [])
                    .filter(c => c.type === 'manufacturer')
                    .map(c => (c.name || '').trim())
                    .filter(Boolean);
                const fromMachines = (window.machineList || [])
                    .map(m => (m.manufacturer || '').trim())
                    .filter(Boolean);
                const current = (document.getElementById('machine-manufacturer')?.value || '').trim();
                const seen = new Map();
                [...fromCats, ...fromMachines, current].filter(Boolean).forEach(n => {
                    if (!seen.has(n.toLowerCase())) seen.set(n.toLowerCase(), n);
                });
                return [...seen.values()].sort((a, b) => a.localeCompare(b));
            };

            window.populateMachineManufacturerDropdown = function () {
                const list = document.getElementById('machine-manufacturer-list');
                if (!list) return;
                const current = (document.getElementById('machine-manufacturer')?.value || '').trim().toLowerCase();
                const options = window.getManufacturerOptions();

                list.innerHTML = '';

                // Nur die Hersteller selbst — die Eintraege "+ Neuen Hersteller
                // anlegen" und "Auswahl zuruecksetzen" sind bewusst raus.
                // Hersteller werden unter Einstellungen > Kategorien gepflegt.
                if (options.length === 0) {
                    const empty = document.createElement('li');
                    empty.className = 'suggestion-item';
                    empty.style.color = '#aaa';
                    empty.textContent = 'Keine Hersteller angelegt';
                    list.appendChild(empty);
                    return;
                }

                options.forEach(name => {
                    const li = document.createElement('li');
                    li.className = 'suggestion-item';
                    li.textContent = name;
                    // Markierung nur ueber .selected — die rote Hinterlegung
                    // kommt aus dropdown-look.css. Ein Inline-color hier hat
                    // frueher die weisse Schrift auf Rot durch Gruen ersetzt.
                    if (name.toLowerCase() === current) li.classList.add('selected');
                    li.onclick = (e) => { e.stopPropagation(); window.selectMachineManufacturer(name); };
                    list.appendChild(li);
                });
            };

            // Neuen Hersteller direkt aus dem Maschinen-Formular als Kategorie anlegen.
            window.createManufacturerFromMachineForm = async function () {
                const name = (prompt('Name des neuen Herstellers:') || '').trim();
                if (!name) return;
                const exists = (window.categoryList || [])
                    .some(c => c.type === 'manufacturer' && (c.name || '').trim().toLowerCase() === name.toLowerCase());
                if (!exists) {
                    try {
                        const { error } = await supabaseClient.from('categories').insert([{
                            name: name,
                            type: 'manufacturer',
                            color: '#14b8a6'
                        }]);
                        if (error) throw error;
                        await fetchCategories();
                    } catch (err) {
                        window.showToast('Hersteller konnte nicht angelegt werden: ' + (err.message || err));
                        return;
                    }
                }
                window.selectMachineManufacturer(name);
            };

            // Maschinenserie: Einzelauswahl, Vorschläge kommen aus den Kategorien vom Typ
            // "series" (in den Einstellungen angelegt) — gefiltert auf den dort hinterlegten
            // Hersteller, damit z.B. bei "Hersteller: BACKHUS" nur BACKHUS-Serien erscheinen.
            window.toggleMachineSeriesDropdown = function (e) {
                if (e) e.stopPropagation();
                const dropdown = document.getElementById('machine-series-dropdown');
                if (dropdown) dropdown.classList.toggle('show');
            };

            window.selectMachineSeries = function (name) {
                document.getElementById('machine-series').value = name;
                document.getElementById('machine-series-text').textContent = name;
                document.getElementById('machine-series-text').style.color = 'white';
                const dropdown = document.getElementById('machine-series-dropdown');
                if (dropdown) {
                    dropdown.querySelectorAll('li').forEach(li => {
                        li.classList.toggle('selected', li.textContent === name);
                    });
                    dropdown.classList.remove('show');
                }
            };

            function populateMachineSeriesDropdown() {
                const list = document.getElementById('machine-series-list');
                if (!list) return;
                const manufacturerVal = (document.getElementById('machine-manufacturer').value || '').trim().toLowerCase();
                const allSeries = (typeof categoryList !== 'undefined' && Array.isArray(categoryList))
                    ? categoryList.filter(cat => cat.type === 'series')
                    : [];
                const filtered = manufacturerVal
                    ? allSeries.filter(cat => (cat.manufacturer || '').trim().toLowerCase() === manufacturerVal)
                    : allSeries;

                list.innerHTML = '';
                if (filtered.length === 0) {
                    list.innerHTML = `<li class="suggestion-item" style="color: #aaa;">${manufacturerVal ? 'Keine Serien für diesen Hersteller' : 'Keine Maschinenserien gefunden'}</li>`;
                    return;
                }
                // Aktuelle Serie markieren (.selected = rot hinterlegt)
                const currentSeries = (document.getElementById('machine-series')?.value || '').trim().toLowerCase();
                filtered.forEach(cat => {
                    const li = document.createElement('li');
                    li.className = 'suggestion-item';
                    li.textContent = cat.name;
                    if (currentSeries && (cat.name || '').trim().toLowerCase() === currentSeries) {
                        li.classList.add('selected');
                    }
                    li.onclick = (e) => {
                        e.stopPropagation();
                        selectMachineSeries(cat.name);
                    };
                    list.appendChild(li);
                });
            }

            // Bei Hersteller-Änderung Vorschläge neu filtern; eine bereits gewählte Serie,
            // die zum neuen Hersteller nicht mehr passt, wird wieder zurückgesetzt.
            window.onMachineManufacturerChange = function () {
                populateMachineSeriesDropdown();
                const currentVal = document.getElementById('machine-series').value;
                if (!currentVal) return;
                const manufacturerVal = (document.getElementById('machine-manufacturer').value || '').trim().toLowerCase();
                const match = (typeof categoryList !== 'undefined' && Array.isArray(categoryList))
                    ? categoryList.find(cat => cat.type === 'series' && cat.name === currentVal)
                    : null;
                const stillValid = match && (!manufacturerVal || (match.manufacturer || '').trim().toLowerCase() === manufacturerVal);
                if (!stillValid) {
                    document.getElementById('machine-series').value = '';
                    const textEl = document.getElementById('machine-series-text');
                    if (textEl) { textEl.textContent = 'Bitte wählen...'; textEl.style.color = ''; }
                }
            };

            window.toggleContactDropdown = function (e) {
                if (e) e.stopPropagation();
                const dropdown = document.getElementById('contact-dropdown');
                if (dropdown) dropdown.classList.toggle('show');
            };

            // window.toggleContactSelection is now defined above in openAddMachineModal 
            // to capture the closure scope if needed, or just globally.
            // We moved it to be global but defined inside the modal openeing? 
            // Actually, defining it inside openAddMachineModal repeatedly is bad practice.
            // Let's keep the one I added and remove this old one.

            function updateContactDisplay() {
                const checkboxes = document.querySelectorAll('#contact-list input[type="checkbox"]:checked');
                // Use .value instead of textContent for robustness
                const selectedValues = Array.from(checkboxes).map(cb => cb.value);

                const textEl = document.getElementById('contact-text');
                const inputEl = document.getElementById('machine-contact-type');

                if (selectedValues.length === 0) {
                    textEl.textContent = 'Bitte wählen...';
                    textEl.style.color = '';
                    inputEl.value = '';
                } else {
                    textEl.textContent = selectedValues.join(', ');
                    textEl.style.color = 'white';
                    inputEl.value = JSON.stringify(selectedValues);
                }
            }

            // Close dropdowns when clicking outside
            // Close dropdowns when clicking outside
            document.addEventListener('click', (e) => {
                // Category Dropdown
                const catDropdown = document.getElementById('machine-category-dropdown');
                const catTrigger = document.getElementById('machine-category-trigger');
                if (catDropdown && catDropdown.classList.contains('show') && !catTrigger.contains(e.target)) {
                    catDropdown.classList.remove('show');
                }

                // Contact Dropdown
                const contactDropdown = document.getElementById('contact-dropdown');
                const contactTrigger = document.getElementById('contact-trigger');
                // Prevent closing if clicking inside the dropdown list (to allow multiple selections)
                if (contactDropdown && contactDropdown.classList.contains('show') &&
                    !contactTrigger.contains(e.target) && !contactDropdown.contains(e.target)) {
                    contactDropdown.classList.remove('show');
                }

                // Machine Series Dropdown
                const seriesDropdown = document.getElementById('machine-series-dropdown');
                const seriesTrigger = document.getElementById('machine-series-trigger');
                if (seriesDropdown && seriesDropdown.classList.contains('show') && seriesTrigger && !seriesTrigger.contains(e.target)) {
                    seriesDropdown.classList.remove('show');
                }

                // Hersteller Dropdown
                const manuDropdown = document.getElementById('machine-manufacturer-dropdown');
                const manuTrigger = document.getElementById('machine-manufacturer-trigger');
                if (manuDropdown && manuDropdown.classList.contains('show') && manuTrigger && !manuTrigger.contains(e.target) && !manuDropdown.contains(e.target)) {
                    manuDropdown.classList.remove('show');
                }

                const relatedSearch = document.getElementById('machine-related-search');
                const relatedSuggestions = document.getElementById('machine-related-suggestions');
                if (relatedSuggestions && relatedSuggestions.style.display !== 'none' &&
                    relatedSearch && !relatedSearch.contains(e.target) && !relatedSuggestions.contains(e.target)) {
                    window.closeMachineRelatedSuggestions();
                }
            });

            window.addEventListener('resize', function () {
                if (typeof window.positionMachineRelatedSuggestions === 'function') {
                    window.positionMachineRelatedSuggestions();
                }
            });

            const addMachineModalScroll = document.querySelector('#add-machine-modal .modal-form-area');
            if (addMachineModalScroll) {
                addMachineModalScroll.addEventListener('scroll', function () {
                    if (typeof window.positionMachineRelatedSuggestions === 'function') {
                        window.positionMachineRelatedSuggestions();
                    }
                }, { passive: true });
            }

            window.closeAddMachineModal = function () {
                const modal = document.getElementById('add-machine-modal');
                if (modal) {
                    modal.classList.remove('show');
                    setTimeout(() => {
                        modal.classList.add('hidden');
                        modal.style.display = 'none';
                    }, 300);
                }
            };

            // Override the old createMachine to open modal
            window.createMachine = function () {
                openAddMachineModal();
            };

            function setMapPin(lat, lng) {
                if (marker) map.removeLayer(marker);
                marker = L.marker([lat, lng]).addTo(map);
                document.getElementById('machine-lat').value = lat;
                document.getElementById('machine-lng').value = lng;
            }

            // Open Google Maps
            window.openGoogleMaps = function () {
                const query = document.getElementById('machine-address-input').value;
                if (!query) { window.showToast('Bitte erst eine Adresse eingeben.'); return; }
                window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`, '_blank');
            };

            let searchTimeout;
            window.debounceSearchAddress = function () {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(window.searchAddress, 500);
            };

            // Address Search (Nominatim)
            window.searchAddress = async function () {
                const query = document.getElementById('machine-address-input').value;
                if (!query || query.length < 3) return; // Min length

                const suggestionsBox = document.getElementById('address-suggestions');
                suggestionsBox.style.display = 'block';
                suggestionsBox.innerHTML = '<div class="suggestion-item">Lade Vorschläge...</div>';

                try {
                    const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&accept-language=de&q=${encodeURIComponent(query)}`);
                    // ... rest of search logic remains same ...
                    const data = await response.json();

                    suggestionsBox.innerHTML = '';
                    if (data.length === 0) {
                        suggestionsBox.innerHTML = '<div class="suggestion-item">Keine Ergebnisse</div>';
                        return;
                    }

                    data.forEach(item => {
                        const div = document.createElement('div');
                        div.className = 'suggestion-item';
                        div.innerText = item.display_name;
                        div.onclick = () => {
                            selectAddress(item);
                        };
                        suggestionsBox.appendChild(div);
                    });
                } catch (e) {
                    suggestionsBox.innerHTML = '<div class="suggestion-item">Fehler bei der Suche</div>';
                }
            };

            function selectAddress(item) {
                document.getElementById('machine-address-input').value = item.display_name;
                document.getElementById('address-suggestions').style.display = 'none';

                const lat = parseFloat(item.lat);
                const lon = parseFloat(item.lon);

                map.setView([lat, lon], 16);
                setMapPin(lat, lon);
            }

            // Berechnet die nächste Wartung ausgehend vom letzten Wartungsdatum — einfache Addition
            // des Intervalls. Liegt das Ergebnis in einem bereits vergangenen Jahr (z.B. letzte
            // Wartung 2024 + 1 Jahr = 2025, aktuelles Jahr aber schon 2026), wird NUR das Jahr auf
            // das aktuelle Jahr angehoben (Monat/Tag bleiben gleich) — kein Vorrollen über mehrere
            // Jahre/Intervalle, nur eine Mindestgrenze: "nächste Wartung" zeigt nie ein Jahr, das
            // schon komplett vorbei ist.
            // Rechnet den Wartungstermin von "Letzte Wartung" + Intervall aus und schreibt ihn,
            // falls er bereits weiter in der Vergangenheit liegt, automatisch um ganze Intervalle
            // weiter — nicht nur einmal, sondern so oft, bis er höchstens noch GRACE_MONTHS (3)
            // in der Vergangenheit liegt. So zeigt ein seit Jahren nicht gewartetes Gerät nicht
            // ewig denselben (dann sinnlos weit zurückliegenden) Termin, sondern automatisch den
            // nächsten sinnvollen Zieltermin. Innerhalb der 3-Monats-Kulanzfrist nach Fälligkeit
            // bleibt der Termin bewusst stehen (und wird als "überfällig" angezeigt); erst danach
            // springt er auf den nächsten Zyklus (z.B. letzte Wartung Januar 2025, Termin Januar
            // 2026: bis April 2026 "überfällig", danach automatisch "nächste Wartung Januar 2027").
            window.computeRolledNextMaintenance = function (lastDateStr, intervalMonths, referenceDate) {
                const parts = String(lastDateStr).split('-');
                const next = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
                const months = parseInt(intervalMonths, 10) || 12;
                next.setMonth(next.getMonth() + months);

                const GRACE_MONTHS = 3;
                const now = referenceDate || new Date();
                let graceLimit = new Date(next);
                graceLimit.setMonth(graceLimit.getMonth() + GRACE_MONTHS);
                while (graceLimit < now) {
                    next.setMonth(next.getMonth() + months);
                    graceLimit = new Date(next);
                    graceLimit.setMonth(graceLimit.getMonth() + GRACE_MONTHS);
                }

                const yyyy = next.getFullYear();
                const mm = String(next.getMonth() + 1).padStart(2, '0');
                const dd = String(next.getDate()).padStart(2, '0');
                return `${yyyy}-${mm}-${dd}`;
            };

            // Berechnet "Letzte Wartung" für eine Maschine komplett neu, als jüngstes Datum aus
            // ALLEN echten Serviceberichten UND ALLEN Wartung-Schnelleinträgen — bewusst nicht nur
            // "ist der gerade gespeicherte Eintrag neuer als der bisherige Wert", denn das würde
            // beim Korrigieren eines Datums (z.B. von 22.06. auf 12.06.) die Korrektur ignorieren,
            // weil der alte, falsche Wert zufällig später lag. So spiegelt last_maintenance immer
            // den tatsächlich aktuellen Stand aller bekannten Wartungs-/Service-Termine wider.
            window.recalculateMachineMaintenanceFromHistory = async function (machineId) {
                const numericMachineId = parseInt(machineId, 10);
                try {
                    const [wartungRes, serviceRes, machineRes] = await Promise.all([
                        window.supabaseClient.from('manual_history_entries').select('created_at, content').eq('machine_id', numericMachineId).eq('type', 'wartung'),
                        window.supabaseClient.from('service_entries').select('date, checklist_payload').eq('machine_id', numericMachineId),
                        window.supabaseClient.from('machines').select('id, category_id, maintenance_interval_months, files').eq('id', numericMachineId).single()
                    ]);

                    if (wartungRes.error) console.warn('recalculateMachineMaintenanceFromHistory: Wartung-Abfrage Fehler:', wartungRes.error);
                    if (serviceRes.error) console.warn('recalculateMachineMaintenanceFromHistory: Servicebericht-Abfrage Fehler:', serviceRes.error);

                    if (machineRes.error || !machineRes.data) {
                        console.error('recalculateMachineMaintenanceFromHistory: Maschine konnte nicht geladen werden:', machineRes.error);
                        if (window.showSyncToast) window.showSyncToast('Wartungsdatum konnte nicht auf der Maschine gespeichert werden (Maschine nicht gefunden).', 'error');
                        return;
                    }

                    // "Letzte Wartung" darf NUR aus echten Wartungen stammen: manuelle
                    // Wartungs-Schnelleinträge und Serviceberichte, in denen explizit ein
                    // Wartungs-/UVV-Zusatzprotokoll gewählt wurde. Reine Reparatur-/Service-
                    // berichte (ohne Wartungsprotokoll) setzen das Datum NICHT.
                    const entries = [];
                    (wartungRes.data || []).forEach(e => {
                        if (e.created_at) entries.push({ date: e.created_at.split('T')[0], source: 'manual', note: e.content || null });
                    });
                    (serviceRes.data || []).forEach(e => {
                        if (!e.date) return;
                        const art = (typeof window.extractServiceMaintArt === 'function') ? window.extractServiceMaintArt(e.checklist_payload) : '';
                        if (!art) return; // kein Wartungsprotokoll -> zählt nicht als Wartung
                        entries.push({ date: String(e.date).split('T')[0], source: 'service', note: art });
                    });

                    if (!entries.length) {
                        console.warn('recalculateMachineMaintenanceFromHistory: Keine echten Wartungs-Daten für Maschine', numericMachineId, 'gefunden.');
                        return;
                    }

                    entries.sort((a, b) => a.date.localeCompare(b.date)); // YYYY-MM-DD sortiert sich lexikografisch korrekt chronologisch
                    const latest = entries[entries.length - 1];
                    const latestDate = latest.date;

                    const machineRow = machineRes.data;
                    const cat = (window.categoryList || []).find(c => c.id === machineRow.category_id);
                    const interval = machineRow.maintenance_interval_months || (cat ? cat.default_maintenance_interval_months : 12) || 12;
                    const nextMaintDate = window.computeRolledNextMaintenance(latestDate, interval);

                    let updatedFiles = machineRow.files ? [...machineRow.files] : [];
                    updatedFiles = updatedFiles.filter(f => f.type !== 'meta' || f.key !== 'is_next_maintenance_auto');
                    updatedFiles.push({ type: 'meta', key: 'is_next_maintenance_auto', property: 'true' });

                    const { error: updateErr } = await window.supabaseClient
                        .from('machines')
                        .update({
                            last_maintenance: latestDate,
                            next_maintenance: nextMaintDate,
                            last_maintenance_source: latest.source,
                            last_maintenance_note: latest.note,
                            files: updatedFiles
                        })
                        .eq('id', numericMachineId);

                    if (updateErr) {
                        console.error('recalculateMachineMaintenanceFromHistory: Update fehlgeschlagen:', updateErr);
                        if (window.showSyncToast) window.showSyncToast('Fehler beim Speichern der Wartungsdaten: ' + updateErr.message, 'error');
                        return;
                    }

                    if (typeof fetchMachines === 'function') await fetchMachines();
                    if (window.showSyncToast) {
                        window.showSyncToast(`Letzte Wartung aktualisiert: ${new Date(latestDate + 'T12:00:00').toLocaleDateString('de-DE')}`, 'success');
                    }
                } catch (err) {
                    console.error('Error recalculating machine maintenance from history:', err);
                    if (window.showSyncToast) window.showSyncToast('Fehler beim Aktualisieren der Wartungsdaten: ' + (err.message || err), 'error');
                }
            };

            window.calculateNextMaintenanceDate = function () {
                const lastDateVal = document.getElementById('machine-last-maintenance').value;
                const catId = document.getElementById('machine-category').value;
                const manualIntervalVal = document.getElementById('machine-maintenance-interval')?.value.trim();

                if (!lastDateVal) return;

                // Manueller Wartungsintervall (pro Maschine) hat Vorrang vor dem Kategorie-Standard.
                let months = manualIntervalVal ? parseInt(manualIntervalVal) : null;
                if (!months) {
                    if (!catId) return;
                    const cat = (window.categoryList || []).find(c => c.id == catId);
                    if (!cat) return;
                    months = cat.default_maintenance_interval_months || 12;
                }

                document.getElementById('machine-next-maintenance').value = window.computeRolledNextMaintenance(lastDateVal, months);

                // Show "Auto" badge
                const badge = document.getElementById('maint-auto-badge');
                if (badge) badge.classList.remove('hidden');
            };

            // Submit Logic
            // Submit Logic
            
            // Helper to generate machine folder name in R2
            window.getMachineFolderName = function (id, manufacturer, name, serial, year) {
                const cleanMan = (manufacturer || '').trim().replace(/[^a-zA-Z0-9_\-]/g, '_');
                const cleanName = (name || '').trim().replace(/[^a-zA-Z0-9_\-]/g, '_');
                const serialStr = serial ? `_${(serial || '').trim().replace(/[^a-zA-Z0-9_\-]/g, '_')}` : '';
                const yearStr = year ? `_Baujahr_${year}` : '';
                return `Maschinen/${id}_${cleanMan}_${cleanName}${serialStr}${yearStr}`;
            }

            window.submitNewMachine = async function () {
                const submitBtn = document.querySelector('button[onclick="submitNewMachine()"]');
                if (submitBtn) {
                    if (submitBtn.disabled) return;
                    submitBtn.disabled = true;
                    submitBtn.dataset.originalText = submitBtn.textContent;
                    submitBtn.textContent = 'Speichert...';
                }

                try {
                    if (!supabaseClient) throw new Error('Supabase ist nicht initialisiert!');

                                        // 1. Gather Data
                    const categoryId = document.getElementById('machine-category').value;
                    const manufacturer = document.getElementById('machine-manufacturer').value;
                    const name = document.getElementById('machine-name').value;
                    const machineSeries = document.getElementById('machine-series').value;
                    const serial = document.getElementById('machine-serial').value;
                    const year = document.getElementById('machine-year').value;
                    const motorType = document.getElementById('machine-motor-type').value.trim() || null;
                    const motorSerial = document.getElementById('machine-motor-serial').value.trim() || null;
                    const power = document.getElementById('machine-power').value.trim() || null;
                    const contactType = document.getElementById('machine-contact-type').value; // JSON string
                    const lastMaintenance = document.getElementById('machine-last-maintenance').value;
                    const nextMaintenance = document.getElementById('machine-next-maintenance').value;
                    const maintenanceIntervalVal = document.getElementById('machine-maintenance-interval')?.value.trim();
                    const maintenanceIntervalMonths = maintenanceIntervalVal ? parseInt(maintenanceIntervalVal) : null;
                    
                    const inWorkshop = document.getElementById('machine-in-workshop')?.checked || false;

                    // Split fields
                    const customerId = inWorkshop ? null : (document.getElementById('machine-customer-id').value || null);
                    const customerNumber = inWorkshop ? null : (document.getElementById('machine-customer-number').value.trim() || null);
                    const owner = inWorkshop ? '' : document.getElementById('machine-owner').value.trim();
                    const operatorStreet = inWorkshop ? null : (document.getElementById('machine-operator-street').value.trim() || null);
                    const operatorZip = inWorkshop ? null : (document.getElementById('machine-operator-zip').value.trim() || null);
                    const operatorCity = inWorkshop ? null : (document.getElementById('machine-operator-city').value.trim() || null);
                    const operatorCountry = inWorkshop ? 'Deutschland' : (document.getElementById('machine-operator-country').value.trim() || 'Deutschland');
                    
                    const locationCompany = inWorkshop ? null : (document.getElementById('machine-location-company').value.trim() || null);
                    const locationStreet = inWorkshop ? null : (document.getElementById('machine-location-street').value.trim() || null);
                    const locationZip = inWorkshop ? null : (document.getElementById('machine-location-zip').value.trim() || null);
                    const locationCity = inWorkshop ? null : (document.getElementById('machine-location-city').value.trim() || null);
                    const locationCountry = inWorkshop ? null : (document.getElementById('machine-location-country').value.trim() || null);

                    // Combined hidden fields
                    const operatorAddress = [operatorStreet, [operatorZip, operatorCity].filter(Boolean).join(' '), operatorCountry].filter(Boolean).join(', ');
                    const hasRealLocFields = !!(locationStreet || locationCity || locationZip);
                    const locationAddress = hasRealLocFields ? [locationStreet, [locationZip, locationCity].filter(Boolean).join(' '), locationCountry].filter(Boolean).join(', ') : null;

                    // Basic Validation
                    if (!categoryId) {
                        throw new Error('Bitte eine Kategorie wählen.');
                    }
                    if (!name) {
                        throw new Error('Bitte eine Typbezeichnung angeben.');
                    }

                    const isAuto = !document.getElementById('maint-auto-badge').classList.contains('hidden');
                    let machineId = currentEditingId;

                    // ── Offline-Pfad: nur Bearbeiten bestehender Maschinen, kein Neuanlegen ──────────
                    if (await window.isLikelyOffline()) {
                        if (!machineId) {
                            throw new Error('Neue Maschinen können nur online angelegt werden. Bitte später erneut versuchen.');
                        }
                        if (!window.offlineService) {
                            throw new Error('Keine Internetverbindung — Offline-Speicher nicht verfügbar.');
                        }

                        const machineDataOffline = {
                            name: name,
                            category_id: parseInt(categoryId),
                            manufacturer: manufacturer,
                            machine_series: machineSeries || null,
                            serial: serial,
                            year: year ? parseInt(year) : null,
                            motor_type: motorType,
                            motor_serial: motorSerial,
                            power: power,
                            contact_type: (contactType && contactType.trim() !== '') ? JSON.parse(contactType) : [],
                            last_maintenance: lastMaintenance || null,
                            next_maintenance: nextMaintenance || null,
                            maintenance_interval_months: maintenanceIntervalMonths,
                            company: owner,
                            operator_address: operatorAddress,
                            operator_street: operatorStreet,
                            operator_zip: operatorZip,
                            operator_city: operatorCity,
                            operator_country: operatorCountry,
                            location: locationAddress,
                            location_company: locationCompany,
                            location_street: locationStreet,
                            location_zip: locationZip,
                            location_city: locationCity,
                            location_country: locationCountry,
                            customer_id: customerId,
                            customer_number: customerNumber,
                            status: 'Betriebsbereit',
                            in_workshop: inWorkshop,
                            contact_persons: typeof window.collectMachineContactPersons === 'function' ? window.collectMachineContactPersons() : [],
                            // Wird erst beim Sync (online) final mit hochgeladenen Dateien zusammengeführt:
                            existing_files: [...existingMachineFiles],
                            main_image_url_raw: machineMainImage,
                            is_auto: isAuto,
                            related_machine_ids: (window.machineRelatedIds || []).map(String).filter(id => id && id !== 'null'),
                            additional_equipment: (typeof window.collectMachineEquipmentFromUI === 'function')
                                ? window.collectMachineEquipmentFromUI()
                                : (window.machineAdditionalEquipment || []),
                            equipment_category_ids: window.machineEquipmentCatalogIds || []
                        };

                        const pendingFiles = [...machineFiles];
                        const removedFiles = [...removedMachineFiles];

                        await window.offlineService.saveMachineDraft(
                            machineId, machineDataOffline, pendingFiles, removedFiles,
                            manufacturer, name, serial, year
                        );

                        machineFiles = [];
                        removedMachineFiles = [];
                        window.updatePendingBadge();
                        const fileNote = pendingFiles.length > 0
                            ? ` Inkl. ${pendingFiles.length} Datei${pendingFiles.length > 1 ? 'en' : ''}, wird automatisch mit hochgeladen.`
                            : '';
                        window.showSyncToast('Offline gespeichert — wird synchronisiert sobald Verbindung besteht.' + fileNote, 'info');
                        closeAddMachineModal();
                        return;
                    }

                    if (machineId) {
                        // 1. Upload files first since we have the ID
                        let finalFiles = [...existingMachineFiles];
                        finalFiles = finalFiles.filter(f => f.type !== 'meta' || f.key !== 'is_next_maintenance_auto');
                        finalFiles = applyMachineExtrasMeta(finalFiles);
                        if (isAuto) {
                            finalFiles.push({ type: 'meta', key: 'is_next_maintenance_auto', property: 'true' });
                        }

                        if (machineFiles.length > 0) {
                            const newUploaded = await uploadMachineFiles(machineId, manufacturer, name, serial, year);
                            finalFiles = [...finalFiles, ...newUploaded];
                        }

                        // Determine main image_url
                        let mainImageUrl = machineMainImage;

                        // If machineMainImage is still a DataURL (newly added but not yet mapped),
                        // or if it's null but we have images, pick the first available image.
                        if (!mainImageUrl || mainImageUrl.startsWith('data:')) {
                            const firstImage = finalFiles.find(f => (f.type && f.type.startsWith('image/')) || (f.url && f.url.match(/\.(jpg|jpeg|png|gif|webp|bmp|tif|tiff)(\?.*)?$/i)));
                            if (firstImage) {
                                mainImageUrl = firstImage.url;
                            } else {
                                mainImageUrl = null;
                            }
                        }

                        // 2. Update Database Record
                        const machineData = {
                            name: name,
                            category_id: parseInt(categoryId),
                            manufacturer: manufacturer,
                            machine_series: machineSeries || null,
                            serial: serial,
                            year: year ? parseInt(year) : null,
                            motor_type: motorType,
                            motor_serial: motorSerial,
                            power: power,
                            contact_type: (contactType && contactType.trim() !== '') ? JSON.parse(contactType) : [],
                            last_maintenance: lastMaintenance || null,
                            next_maintenance: nextMaintenance || null,
                            maintenance_interval_months: maintenanceIntervalMonths,
                            company: owner,
                            operator_address: operatorAddress,
                            operator_street: operatorStreet,
                            operator_zip: operatorZip,
                            operator_city: operatorCity,
                            operator_country: operatorCountry,
                            location: locationAddress,
                            location_company: locationCompany,
                            location_street: locationStreet,
                            location_zip: locationZip,
                            location_city: locationCity,
                            location_country: locationCountry,
                            customer_id: customerId,
                            customer_number: customerNumber,
                            image_url: mainImageUrl,
                            files: finalFiles,
                            status: 'Betriebsbereit',
                            in_workshop: inWorkshop,
                            contact_persons: typeof window.collectMachineContactPersons === 'function' ? window.collectMachineContactPersons() : [],
                            equipment_category_ids: window.machineEquipmentCatalogIds || []
                        };

                        let updateResult;
                        try {
                            updateResult = await window.withTimeout(
                                supabaseClient.from('machines').update(machineData).eq('id', machineId),
                                8000
                            );
                        } catch (timeoutErr) {
                            throw new Error('Keine Verbindung zum Server — bitte Internetverbindung prüfen und erneut versuchen.');
                        }

                        if (updateResult.error) throw updateResult.error;

                        // Delete removed files from Cloudflare R2
                        if (removedMachineFiles.length > 0) {
                            for (const file of removedMachineFiles) {
                                await deleteFileEntryStorage(file);
                            }
                            removedMachineFiles = [];
                        }
                    } else {
                        // NEW MACHINE
                        // 1. Insert temporary record first to get ID
                        const tempMachineData = {
                            name: name,
                            category_id: parseInt(categoryId),
                            manufacturer: manufacturer,
                            machine_series: machineSeries || null,
                            serial: serial,
                            year: year ? parseInt(year) : null,
                            motor_type: motorType,
                            motor_serial: motorSerial,
                            power: power,
                            contact_type: (contactType && contactType.trim() !== '') ? JSON.parse(contactType) : [],
                            last_maintenance: lastMaintenance || null,
                            next_maintenance: nextMaintenance || null,
                            maintenance_interval_months: maintenanceIntervalMonths,
                            company: owner,
                            operator_address: operatorAddress,
                            operator_street: operatorStreet,
                            operator_zip: operatorZip,
                            operator_city: operatorCity,
                            operator_country: operatorCountry,
                            location: locationAddress,
                            location_company: locationCompany,
                            location_street: locationStreet,
                            location_zip: locationZip,
                            location_city: locationCity,
                            location_country: locationCountry,
                            customer_id: customerId,
                            customer_number: customerNumber,
                            image_url: null,
                            files: [],
                            status: 'Betriebsbereit',
                            in_workshop: inWorkshop,
                            contact_persons: typeof window.collectMachineContactPersons === 'function' ? window.collectMachineContactPersons() : [],
                            equipment_category_ids: window.machineEquipmentCatalogIds || []
                        };

                        let insertResult;
                        try {
                            insertResult = await window.withTimeout(
                                supabaseClient.from('machines').insert([tempMachineData]).select('id'),
                                8000
                            );
                        } catch (timeoutErr) {
                            throw new Error('Keine Verbindung zum Server — bitte Internetverbindung prüfen und erneut versuchen.');
                        }

                        if (insertResult.error) throw insertResult.error;
                        machineId = insertResult.data[0].id;

                        // 2. Upload files with the newly created ID
                        let finalFiles = applyMachineExtrasMeta([]);
                        if (isAuto) {
                            finalFiles.push({ type: 'meta', key: 'is_next_maintenance_auto', property: 'true' });
                        }

                        if (machineFiles.length > 0) {
                            const newUploaded = await uploadMachineFiles(machineId, manufacturer, name, serial, year);
                            finalFiles = [...finalFiles, ...newUploaded];
                        }

                        // Determine main image_url
                        let mainImageUrl = null;
                        const firstImage = finalFiles.find(f => (f.type && f.type.startsWith('image/')) || (f.url && f.url.match(/\.(jpg|jpeg|png|gif|webp|bmp|tif|tiff)(\?.*)?$/i)));
                        if (firstImage) {
                            mainImageUrl = firstImage.url;
                        }

                        // 3. Update the record with files and image_url
                        const updateResult = await supabaseClient
                            .from('machines')
                            .update({
                                files: finalFiles,
                                image_url: mainImageUrl
                            })
                            .eq('id', machineId);

                        if (updateResult.error) throw updateResult.error;
                    }

                    // Bidirektionale Verknüpfung synchronisieren
                    const finalRelatedIds = (window.machineRelatedIds || []).map(String).filter(id => id && id !== 'null');
                    const prevRelatedIds = (window.machineRelatedIdsBefore || []).map(String).filter(id => id && id !== 'null');
                    await syncBidirectionalLinks(machineId, finalRelatedIds, prevRelatedIds);
                    window.machineRelatedIdsBefore = [];

                    // Ansprechpartner dieser Maschine auch bei allen verknüpften Maschinen eintragen
                    const machineContactPersonsForSync = (typeof window.collectMachineContactPersons === 'function' ? window.collectMachineContactPersons() : []).filter(p => p.name);
                    await syncContactPersonsToRelatedMachines(machineId, finalRelatedIds, machineContactPersonsForSync);

                    // Success
                    window.showToast(typeof currentEditingId !== 'undefined' && currentEditingId ? 'Maschine aktualisiert!' : 'Maschine erfolgreich angelegt!');
                    closeAddMachineModal();

                    if (typeof fetchMachines === 'function') {
                        fetchMachines();
                    } else {
                        location.reload();
                    }

                } catch (err) {
                    console.error('CRITICAL ERROR in submitNewMachine:', err);
                    const errorMsg = err.message || err.error_description || JSON.stringify(err);
                    window.showToast('Fehler beim Speichern: ' + errorMsg);
                } finally {
                    if (submitBtn) {
                        submitBtn.textContent = submitBtn.dataset.originalText || 'Speichern';
                        submitBtn.disabled = false;
                    }
                }
            };

            // Close suggestions on click outside
            document.addEventListener('click', function (e) {
                if (!e.target.closest('.form-group')) {
                    const suggs = document.getElementById('address-suggestions');
                    if (suggs) suggs.style.display = 'none';

                    const custSuggs = document.getElementById('machine-customer-suggestions');
                    if (custSuggs) custSuggs.style.display = 'none';

                    const opSuggs = document.getElementById('machine-operator-suggestions');
                    if (opSuggs) opSuggs.style.display = 'none';

                    const locSuggs = document.getElementById('machine-location-suggestions');
                    if (locSuggs) locSuggs.style.display = 'none';
                }
            });


            // File Upload Listeners (moved inside DOMContentLoaded for reliable element availability)
            const machineFileInput = document.getElementById('machine-image-upload');
            const machineImageSlot = document.getElementById('machine-image-slot');

            if (machineFileInput) {
                machineFileInput.addEventListener('change', () => {
                    handleMachineFiles(machineFileInput.files);
                });
            }

            const lastMaintInput = document.getElementById('machine-last-maintenance');
            if (lastMaintInput) {
                lastMaintInput.addEventListener('change', () => {
                    window.calculateNextMaintenanceDate();
                });
            }

            const nextMaintInput = document.getElementById('machine-next-maintenance');
            if (nextMaintInput) {
                nextMaintInput.addEventListener('input', () => {
                    const badge = document.getElementById('maint-auto-badge');
                    if (badge) badge.classList.add('hidden');
                });
            }

            if (machineImageSlot) {
                machineImageSlot.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    machineImageSlot.classList.add('drag-over');
                });
                machineImageSlot.addEventListener('dragleave', () => {
                    machineImageSlot.classList.remove('drag-over');
                });
                machineImageSlot.addEventListener('drop', (e) => {
                    e.preventDefault();
                    machineImageSlot.classList.remove('drag-over');
                    handleMachineFiles(e.dataTransfer.files);
                });
            }

            const dropzone = document.getElementById('service-file-dropzone');
            const serviceFileInput = document.getElementById('service-file-input');

            if (dropzone) {
                dropzone.onclick = () => serviceFileInput.click();
                dropzone.ondragover = (e) => { e.preventDefault(); dropzone.classList.add('drag-over'); };
                dropzone.ondragleave = () => dropzone.classList.remove('drag-over');
                dropzone.ondrop = (e) => {
                    e.preventDefault();
                    dropzone.classList.remove('drag-over');
                    handleServiceFiles(e.dataTransfer.files);
                };
            }

            if (serviceFileInput) {
                serviceFileInput.onchange = (e) => handleServiceFiles(e.target.files);
            }

            // --- Initial View Activation ---
            // Read the URL hash to determine the starting view, default to 'home'
            const initialHash = window.location.hash ? window.location.hash.replace('#', '') : 'home';
            const validTargets = Array.from(document.querySelectorAll('.view')).map(v => v.id).filter(Boolean);
            const startView = validTargets.includes(initialHash) ? initialHash : 'home';
            
            if (typeof window.initChecklists === 'function') {
                window.initChecklists();
            }
            
            window.switchView(startView);
            
            // Check authentication now that all helper functions and window objects are defined
            if (supabaseClient) {
                window.checkAuth();
            }

        }); // End of DOMContentLoaded
