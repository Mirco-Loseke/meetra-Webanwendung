// ==========================================================
// Vorgaenge: Anlegen, Bearbeiten, Status, Zuweisung, Arbeitsschritte
// ==========================================================
// Ausgelagert aus index.html (vormals Zeilen 14571-15528).
// Wird in index.html an unveraenderter Stelle per <script src> geladen;
// die Reihenfolge der Skripte entspricht der fruaeheren Reihenfolge im
// Inline-Block und darf nicht vertauscht werden.
// ==========================================================
        // --- INTERNAL PROCESSES (EREIGNISSE SUB-TAB) SYSTEM ---
        window.eventsState.currentSubView = 'calendar';
        window.eventsState.processStatusFilter = 'all';
        window.eventsState.processes = [];

        window.switchEventsSubView = function(view) {
            window.eventsState.currentSubView = view;
            const btnCalendar = document.getElementById('btn-events-view-calendar');
            const btnProcesses = document.getElementById('btn-events-view-processes');
            const subviewCalendar = document.getElementById('events-calendar-subview');
            const subviewProcesses = document.getElementById('events-processes-subview');
            
            const filterCategory = document.getElementById('calendar-category-filter-trigger');
            const filterProcessStatus = document.getElementById('process-status-filter-trigger');
            
            const btnAddEvent = document.getElementById('btn-add-event-action');
            const btnImportEmail = document.getElementById('btn-import-email-action');
            const msgDropzoneHeader = document.getElementById('process-header-msg-dropzone');
            
            const searchInput = document.getElementById('calendar-search-input');
            
            if (view === 'processes') {
                if (btnCalendar) btnCalendar.classList.remove('active');
                if (btnProcesses) btnProcesses.classList.add('active');
                if (subviewCalendar) subviewCalendar.style.display = 'none';
                if (subviewProcesses) subviewProcesses.style.display = 'block';
                
                if (filterCategory) filterCategory.style.display = 'none';
                if (filterProcessStatus) filterProcessStatus.style.display = 'block';
                
                if (btnAddEvent) btnAddEvent.style.display = 'none';
                if (btnImportEmail) btnImportEmail.style.display = 'inline-flex';
                const btnAiProc = document.getElementById('btn-ai-capture-process');
                if (btnAiProc) btnAiProc.style.display = 'inline-flex';
                if (msgDropzoneHeader) msgDropzoneHeader.style.display = 'flex';

                if (searchInput) {
                    searchInput.value = '';
                    searchInput.placeholder = "Vorgänge suchen...";
                }
                
                window.fetchProcesses();
            } else {
                if (btnCalendar) btnCalendar.classList.add('active');
                if (btnProcesses) btnProcesses.classList.remove('active');
                if (subviewCalendar) subviewCalendar.style.display = 'block';
                if (subviewProcesses) subviewProcesses.style.display = 'none';
                
                if (filterCategory) filterCategory.style.display = 'block';
                if (filterProcessStatus) filterProcessStatus.style.display = 'none';
                
                if (btnAddEvent) btnAddEvent.style.display = 'inline-flex';
                if (btnImportEmail) btnImportEmail.style.display = 'none';
                const btnAiProcHide = document.getElementById('btn-ai-capture-process');
                if (btnAiProcHide) btnAiProcHide.style.display = 'none';
                if (msgDropzoneHeader) msgDropzoneHeader.style.display = 'none';

                if (searchInput) {
                    searchInput.value = '';
                    searchInput.placeholder = "Ereignisse suchen...";
                }
                
                window.renderEvents();
            }
        };

        window.setProcessStatusFilter = function(status) {
            window.eventsState.processStatusFilter = status;
            
            const labelEl = document.getElementById('process-current-status-name');
            if (labelEl) {
                if (status === 'all') labelEl.textContent = 'Status: Alle';
                else if (status === 'offen') labelEl.textContent = 'Status: Offen';
                else if (status === 'in_bearbeitung') labelEl.textContent = 'Status: In Bearbeitung';
                else if (status === 'erledigt') labelEl.textContent = 'Status: Erledigt';
                else if (status === 'stale') labelEl.textContent = 'Länger als 7 Tage offen';
            }
            
            const options = document.querySelectorAll('#process-status-filter-options li');
            options.forEach(li => {
                const onclickStr = li.getAttribute('onclick') || '';
                if (onclickStr.includes(`'${status}'`)) {
                    li.classList.add('selected');
                } else {
                    li.classList.remove('selected');
                }
            });
            
            const menu = document.getElementById('process-status-filter-menu');
            if (menu) menu.style.display = 'none';
            
            window.renderProcesses();
        };

        window.openEmailImportModal = function() {
            const modal = document.getElementById('email-import-modal');
            if (!modal) return;
            
            modal.classList.remove('hidden');
            modal.style.display = 'flex';
            requestAnimationFrame(() => {
                modal.classList.add('show');
            });
            
            // Reset fields
            document.getElementById('email-title-input').value = '';
            document.getElementById('email-sender-input').value = '';
            document.getElementById('email-recipient-input').value = '';
            document.getElementById('email-body-input').value = '';
            document.getElementById('email-remark-input').value = '';
            document.getElementById('email-type-select').value = 'email_incoming';
            document.getElementById('email-status-select').value = 'offen';
            window.syncProcessSelectDisplay('email', 'type');
            window.syncProcessSelectDisplay('email', 'status');
            window.updateEmailBodyVisibility('email');
            
            // Set default date to now
            const now = new Date();
            const tzOffset = now.getTimezoneOffset() * 60000;
            const localISOTime = (new Date(now.getTime() - tzOffset)).toISOString().slice(0, 16);
            document.getElementById('email-date-input').value = localISOTime;
            
            // Reset machine search field
            window.processMachineRecommended.email = [];
            document.getElementById('email-machine-select').value = '';
            document.getElementById('email-workshop-order-select').value = '';
            window.fetchProcessOpenWorkshopOrders();
            const machineSearch = document.getElementById('email-machine-search');
            if (machineSearch) {
                machineSearch.value = '';
                machineSearch.style.color = '';
            }

            // Reset assigned employees
            window.processAssignedUsers['email'] = [];
            document.getElementById('email-assigned-users').value = '';
            document.getElementById('email-tech-dropdown-panel').style.display = 'none';
            renderProcessTechDropdown('email');
        };

        window.closeEmailImportModal = function() {
            const modal = document.getElementById('email-import-modal');
            if (modal) {
                modal.classList.remove('show');
                setTimeout(() => {
                    modal.classList.add('hidden');
                    modal.style.display = 'none';
                }, 300);
            }
        };

        // ==========================================
        // PROCESS MITARBEITER-ZUWEISUNG (Add / Edit / Email-Import)
        // ==========================================
        window.processAssignedUsers = { 'process-add': [], 'edit-process': [], 'email': [] };

        function renderProcessTechDropdown(prefix) {
            const list = document.getElementById(`${prefix}-tech-option-list`);
            if (!list) return;

            const selected = window.processAssignedUsers[prefix] || [];
            const users = window.userList || [];
            list.innerHTML = users.map(u => {
                const isSelected = selected.includes(u.id);
                const initials = u.initials || u.name.substring(0, 2).toUpperCase();
                const color = u.color || '#666';
                return `
                        <div onclick="event.stopPropagation(); window.toggleProcessTech('${prefix}', ${u.id})"
                             style="display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 10px; cursor: pointer; transition: background 0.15s; background: ${isSelected ? 'rgba(16,185,129,0.12)' : 'transparent'};"
                             onmouseover="if(!${isSelected}) this.style.background='rgba(255,255,255,0.04)'"
                             onmouseout="this.style.background='${isSelected ? 'rgba(16,185,129,0.12)' : 'transparent'}'">
                            <div style="width:34px; height:34px; border-radius:50%; background:${color}; display:flex; align-items:center; justify-content:center; font-size:0.75rem; font-weight:800; color:#fff; flex-shrink:0; font-family:'Inter',sans-serif;">${initials}</div>
                            <span style="flex:1; color:#fff; font-size:0.95rem; font-weight:500; font-family:'Inter',sans-serif;">${u.name}</span>
                            ${isSelected ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>` : ''}
                        </div>
                    `;
            }).join('');

            const pillsContainer = document.getElementById(`${prefix}-tech-selected-pills`);
            const placeholder = document.getElementById(`${prefix}-tech-placeholder-text`);
            if (!pillsContainer) return;

            const selectedUsers = users.filter(u => selected.includes(u.id));
            pillsContainer.innerHTML = selectedUsers.map(u => {
                const initials = u.initials || u.name.substring(0, 2).toUpperCase();
                const color = u.color || '#666';
                return `<div style="display:inline-flex; align-items:center; gap:6px; background:${color}22; border:1px solid ${color}55; border-radius:20px; padding:3px 10px 3px 4px; font-size:0.82rem; font-weight:700; color:#fff; font-family:'Inter',sans-serif;">
                        <div style="width:22px; height:22px; border-radius:50%; background:${color}; display:flex; align-items:center; justify-content:center; font-size:0.65rem; font-weight:800; color:#fff;">${initials}</div>
                        ${u.name}
                    </div>`;
            }).join('');

            if (placeholder) placeholder.style.display = selectedUsers.length > 0 ? 'none' : 'flex';
        }

        // Panel wird als Portal an document.body gehaengt (wie das Maschinen-Such-Dropdown),
        // damit overflow/backdrop-filter des Modals es nicht mehr abschneiden oder
        // dahinter verstecken koennen — reines z-index-Erhoehen hat das nicht geloest,
        // weil backdrop-filter im Modal einen eigenen containing block erzeugt.
        window.toggleProcessTechDropdown = function(prefix) {
            const panel = document.getElementById(`${prefix}-tech-dropdown-panel`);
            const trigger = document.getElementById(`${prefix}-tech-dropdown-trigger`);
            const wrapper = document.getElementById(`${prefix}-tech-dropdown-wrapper`);
            if (!panel || !wrapper) return;
            const isOpen = panel.style.display !== 'none';
            if (isOpen) {
                panel.style.display = 'none';
                panel.classList.remove('show');
                if (trigger) trigger.style.borderColor = 'rgba(255,255,255,0.1)';
                return;
            }
            if (panel.parentElement !== document.body) {
                document.body.appendChild(panel);
            }
            const rect = wrapper.getBoundingClientRect();
            panel.style.position = 'fixed';
            panel.style.top = (rect.bottom + 6) + 'px';
            panel.style.left = rect.left + 'px';
            panel.style.width = rect.width + 'px';
            panel.style.right = 'auto';
            panel.style.zIndex = '999999';
            panel.style.display = 'block';
            panel.classList.add('show');
            if (trigger) trigger.style.borderColor = 'rgba(16,185,129,0.5)';
            renderProcessTechDropdown(prefix);
        };

        window.toggleProcessTech = function(prefix, id) {
            const selected = window.processAssignedUsers[prefix] || (window.processAssignedUsers[prefix] = []);
            const idx = selected.indexOf(id);
            if (idx > -1) {
                selected.splice(idx, 1);
            } else {
                selected.push(id);
            }
            const hidden = document.getElementById(`${prefix}-assigned-users`);
            if (hidden) hidden.value = JSON.stringify(selected);
            renderProcessTechDropdown(prefix);
        };

        document.addEventListener('click', function(e) {
            ['process-add', 'edit-process', 'email'].forEach(prefix => {
                const wrapper = document.getElementById(`${prefix}-tech-dropdown-wrapper`);
                const panel = document.getElementById(`${prefix}-tech-dropdown-panel`);
                const trigger = document.getElementById(`${prefix}-tech-dropdown-trigger`);
                if (wrapper && panel && panel.style.display !== 'none' &&
                    !wrapper.contains(e.target) && !panel.contains(e.target)) {
                    panel.style.display = 'none';
                    panel.classList.remove('show');
                    if (trigger) trigger.style.borderColor = 'rgba(255,255,255,0.1)';
                }
            });
        });

        // Adressbezug des gerade offenen "Vorgang hinzufügen"-Dialogs.
        // Wird gesetzt, wenn der Vorgang aus dem Adressbuch heraus angelegt wird.
        window.processPendingAddress = null; // { id, name, contact }

        // Schnellwahl für die Erinnerung (Tage ab heute, null = löschen).
        window.setProcessRemindQuick = function(prefix, daysFromToday) {
            const el = document.getElementById(prefix + '-remind-input');
            if (!el) return;
            if (daysFromToday === null || daysFromToday === undefined) {
                el.value = '';
                return;
            }
            const d = new Date();
            d.setDate(d.getDate() + daysFromToday);
            d.setHours(8, 0, 0, 0);
            const tzOffset = d.getTimezoneOffset() * 60000;
            el.value = new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
        };

        // opts: { customerId, customerName, contactName } -> Adress-Vorgang statt Maschinen-Vorgang
        window.openProcessAddModal = function(opts) {
            const modal = document.getElementById('process-add-modal');
            if (!modal) return;

            modal.classList.remove('hidden');
            modal.style.display = 'flex';
            requestAnimationFrame(() => {
                modal.classList.add('show');
            });

            // Reset fields
            document.getElementById('process-add-title-input').value = '';
            document.getElementById('process-add-remark-input').value = '';
            document.getElementById('process-add-type-select').value = 'note';
            document.getElementById('process-add-status-select').value = 'offen';
            window.syncProcessSelectDisplay('process-add', 'type');
            window.syncProcessSelectDisplay('process-add', 'status');

            // Set default date to now
            const now = new Date();
            const tzOffset = now.getTimezoneOffset() * 60000;
            const localISOTime = (new Date(now.getTime() - tzOffset)).toISOString().slice(0, 16);
            document.getElementById('process-add-date-input').value = localISOTime;

            // Reset machine search field
            window.processMachineRecommended['process-add'] = [];
            document.getElementById('process-add-machine-select').value = '';
            document.getElementById('process-add-workshop-order-select').value = '';
            window.fetchProcessOpenWorkshopOrders();
            const machineSearch = document.getElementById('process-add-machine-search');
            if (machineSearch) {
                machineSearch.value = '';
                machineSearch.style.color = '';
            }

            // Reset assigned employees
            window.processAssignedUsers['process-add'] = [];
            document.getElementById('process-add-assigned-users').value = '';
            document.getElementById('process-add-tech-dropdown-panel').style.display = 'none';
            renderProcessTechDropdown('process-add');

            // Reset Schritte
            window.processSteps['process-add'] = [];
            window.renderProcessSteps('process-add');

            // Reset Erinnerung
            const remindEl = document.getElementById('process-add-remind-input');
            if (remindEl) remindEl.value = '';

            // Adress- vs. Maschinen-Modus
            window.processPendingAddress = (opts && opts.customerId)
                ? { id: opts.customerId, name: opts.customerName || 'Adresse', contact: opts.contactName || '' }
                : null;
            const addrBanner = document.getElementById('process-add-address-banner');
            const machineGroup = document.getElementById('process-add-machine-group');
            if (window.processPendingAddress) {
                document.getElementById('process-add-address-name').textContent =
                    window.processPendingAddress.name +
                    (window.processPendingAddress.contact ? ' · ' + window.processPendingAddress.contact : '');
                if (addrBanner) addrBanner.style.display = 'block';
                // Ein Adress-Vorgang hängt nicht an einer Maschine.
                if (machineGroup) machineGroup.style.display = 'none';
            } else {
                if (addrBanner) addrBanner.style.display = 'none';
                if (machineGroup) machineGroup.style.display = '';
            }
        };

        window.closeProcessAddModal = function() {
            const techPanel = document.getElementById('process-add-tech-dropdown-panel');
            if (techPanel) { techPanel.style.display = 'none'; techPanel.classList.remove('show'); }
            const modal = document.getElementById('process-add-modal');
            if (modal) {
                modal.classList.remove('show');
                setTimeout(() => {
                    modal.classList.add('hidden');
                    modal.style.display = 'none';
                }, 300);
            }
        };

        window.saveNewProcess = async function(event) {
            if (event) event.preventDefault();
            if (!supabaseClient) return;

            try {
                const title = document.getElementById('process-add-title-input').value;
                const type = document.getElementById('process-add-type-select').value;
                const date = document.getElementById('process-add-date-input').value;
                const machineId = document.getElementById('process-add-machine-select').value;
                const workshopOrderNumber = document.getElementById('process-add-workshop-order-select').value;
                const status = document.getElementById('process-add-status-select').value;
                const remark = document.getElementById('process-add-remark-input').value;

                const processDate = date ? new Date(date).toISOString() : new Date().toISOString();

                const addr = window.processPendingAddress;
                const remindRaw = document.getElementById('process-add-remind-input')?.value;

                const payload = {
                    title: title,
                    process_type: type,
                    process_date: processDate,
                    // Ein Adress-Vorgang hängt an der Adresse, nicht an einer Maschine.
                    machine_id: (!addr && machineId) ? parseInt(machineId) : null,
                    workshop_order_number: (!addr && workshopOrderNumber) ? workshopOrderNumber : null,
                    status: status,
                    remark: remark || null,
                    assigned_users: window.processAssignedUsers['process-add'],
                    steps: (window.processSteps['process-add'] || []).filter(s => (s.text || '').trim())
                    // Ersteller setzt window.insertMitErsteller (app-core.js): die
                    // App-Nutzer haben bigint-IDs, internal_processes.user_id ist
                    // aber uuid — deshalb geht die bigint-ID nach created_by_user.
                };
                if (addr) {
                    payload.customer_id = addr.id;
                    if (addr.contact) payload.contact_name = addr.contact;
                }
                if (remindRaw) payload.remind_at = new Date(remindRaw).toISOString();

                let { error } = await window.insertMitErsteller('internal_processes', payload);

                // Falls die Migration supabase_add_process_customer.sql noch nicht
                // gelaufen ist, fehlen customer_id/contact_name/remind_at. Dann ohne
                // diese Felder speichern, damit der Vorgang nicht verloren geht.
                if (error && /customer_id|contact_name|remind_at/.test(error.message || '')) {
                    console.warn('Spalte fehlt, speichere Vorgang ohne Adressbezug/Erinnerung:', error.message);
                    const reduced = { ...payload };
                    delete reduced.customer_id;
                    delete reduced.contact_name;
                    delete reduced.remind_at;
                    ({ error } = await window.insertMitErsteller('internal_processes', reduced));
                    if (!error) {
                        window.showToast('Der Vorgang wurde gespeichert, aber ohne Adressbezug.\n\nBitte die Datei supabase_add_process_customer.sql im Supabase SQL-Editor ausführen.');
                    }
                }

                if (error) throw error;

                const savedAddressId = addr ? addr.id : null;
                window.closeProcessAddModal();
                window.fetchProcesses();

                // Zurück ins Adressbuch, wenn der Vorgang von dort angelegt wurde.
                if (savedAddressId && typeof window.openAddressbookDetail === 'function') {
                    window.openAddressbookDetail(savedAddressId, 'tasks');
                }
            } catch (err) {
                console.error("Error saving new process:", err);
                window.showToast("Fehler beim Speichern: " + err.message);
            }
        };

        window.openEditProcessModal = async function(id) {
            let proc = (window.eventsState.processes || []).find(p => String(p.id) === String(id));
            // Aus dem Adressbuch heraus ist die Vorgangsliste evtl. noch nicht
            // geladen -> einmal nachladen, statt still nichts zu tun.
            if (!proc && typeof window.fetchProcesses === 'function') {
                await window.fetchProcesses();
                proc = (window.eventsState.processes || []).find(p => String(p.id) === String(id));
            }
            if (!proc) {
                window.showToast('Vorgang konnte nicht geladen werden.');
                return;
            }
            
            const modal = document.getElementById('process-edit-modal');
            if (!modal) return;
            
            modal.classList.remove('hidden');
            modal.style.display = 'flex';
            requestAnimationFrame(() => {
                modal.classList.add('show');
            });
            
            document.getElementById('edit-process-id').value = proc.id;
            document.getElementById('edit-process-type-select').value = proc.process_type || 'email_incoming';
            document.getElementById('edit-process-title-input').value = proc.title || '';
            document.getElementById('edit-process-sender-input').value = proc.sender || '';
            document.getElementById('edit-process-recipient-input').value = proc.recipient || '';
            document.getElementById('edit-process-status-select').value = proc.status || 'offen';
            document.getElementById('edit-process-remark-input').value = proc.remark || '';
            document.getElementById('edit-process-body-input').value = proc.description || '';
            window.syncProcessSelectDisplay('edit-process', 'type');
            window.syncProcessSelectDisplay('edit-process', 'status');
            window.processSteps['edit-process'] = Array.isArray(proc.steps)
                ? proc.steps.map(s => ({ id: s.id || genStepId(), text: s.text || '', done: !!s.done, created_at: s.created_at || null, created_by: s.created_by || null, done_at: s.done_at || null, done_by: s.done_by || null }))
                : [];
            window.renderProcessSteps('edit-process');
            window.updateEmailBodyVisibility('edit-process');

            // Set up assigned employees
            window.processAssignedUsers['edit-process'] = Array.isArray(proc.assigned_users) ? [...proc.assigned_users] : [];
            document.getElementById('edit-process-assigned-users').value = JSON.stringify(window.processAssignedUsers['edit-process']);
            document.getElementById('edit-process-tech-dropdown-panel').style.display = 'none';
            renderProcessTechDropdown('edit-process');

            // Erinnerung
            const editRemind = document.getElementById('edit-process-remind-input');
            if (editRemind) {
                if (proc.remind_at) {
                    const rd = new Date(proc.remind_at);
                    const tz = rd.getTimezoneOffset() * 60000;
                    editRemind.value = new Date(rd.getTime() - tz).toISOString().slice(0, 16);
                } else {
                    editRemind.value = '';
                }
            }

            // Adress- vs. Maschinen-Vorgang
            const editAddrBanner = document.getElementById('edit-process-address-banner');
            const editMachineGroup = document.getElementById('edit-process-machine-group');
            if (proc.customer_id) {
                const addrName = (proc.customers && proc.customers.name) || 'Adresse';
                document.getElementById('edit-process-address-name').textContent =
                    addrName + (proc.contact_name ? ' · ' + proc.contact_name : '');
                if (editAddrBanner) editAddrBanner.style.display = 'block';
                if (editMachineGroup) editMachineGroup.style.display = 'none';
            } else {
                if (editAddrBanner) editAddrBanner.style.display = 'none';
                if (editMachineGroup) editMachineGroup.style.display = '';
            }

            // Verknuepfter Servicebericht
            window._editProcessServiceLink = proc.service_entries
                ? { id: proc.service_entries.id, title: proc.service_entries.title, date: proc.service_entries.date }
                : null;
            document.getElementById('edit-process-service-report-select').value = proc.linked_service_report_id || '';
            window.renderProcessServiceLinkSection();
            
            if (proc.process_date) {
                const date = new Date(proc.process_date);
                const tzOffset = date.getTimezoneOffset() * 60000;
                const localISOTime = (new Date(date.getTime() - tzOffset)).toISOString().slice(0, 16);
                document.getElementById('edit-process-date-input').value = localISOTime;
            } else {
                document.getElementById('edit-process-date-input').value = '';
            }
            
            // Set up machine search field
            window.processMachineRecommended['edit-process'] = [];
            const machineHidden = document.getElementById('edit-process-machine-select');
            const machineSearch = document.getElementById('edit-process-machine-search');
            const workshopHidden = document.getElementById('edit-process-workshop-order-select');
            if (workshopHidden) workshopHidden.value = '';
            window.fetchProcessOpenWorkshopOrders();
            if (proc.machine_id) {
                const activeMachine = (window.machineList || []).find(m => String(m.id) === String(proc.machine_id));
                if (activeMachine) {
                    if (machineHidden) machineHidden.value = activeMachine.id;
                    if (machineSearch) {
                        machineSearch.value = window.processMachineLabel(activeMachine);
                        machineSearch.style.color = 'var(--color-primary-green)';
                    }

                    // Find its customer and filter recommended machines for the dropdown
                    if (activeMachine.customer_id) {
                        (async () => {
                            try {
                                if (window.supabaseClient) {
                                    const { data: cust } = await window.supabaseClient
                                        .from('customers')
                                        .select('id, name')
                                        .eq('id', activeMachine.customer_id)
                                        .maybeSingle();
                                    if (cust) {
                                        window.filterMachinesForCustomer(cust.id, cust.name, 'edit');
                                    }
                                }
                            } catch (e) {
                                console.error("Error setting up recommended machines for edit modal:", e);
                            }
                        })();
                    }
                }
            } else if (proc.workshop_order_number) {
                if (machineHidden) machineHidden.value = '';
                if (workshopHidden) workshopHidden.value = proc.workshop_order_number;
                if (machineSearch) {
                    const match = (window.processOpenWorkshopOrders || []).find(t => t.workshop_order_number === proc.workshop_order_number);
                    machineSearch.value = `Werkstattauftrag ${proc.workshop_order_number}${match && match.title ? ' – ' + match.title : ''}`;
                    machineSearch.style.color = '#60a5fa';
                }
            } else {
                if (machineHidden) machineHidden.value = '';
                if (machineSearch) {
                    machineSearch.value = '';
                    machineSearch.style.color = '';
                }
            }
        };

        window.closeEditProcessModal = function() {
            const techPanel = document.getElementById('edit-process-tech-dropdown-panel');
            if (techPanel) { techPanel.style.display = 'none'; techPanel.classList.remove('show'); }
            const modal = document.getElementById('process-edit-modal');
            if (modal) {
                modal.classList.remove('show');
                setTimeout(() => {
                    modal.classList.add('hidden');
                    modal.style.display = 'none';
                }, 300);
            }
        };

        // ── Vorgang <-> Servicebericht Verknuepfung (Muster analog zur
        // Servicebericht-zu-Servicebericht-Verknuepfung, siehe renderServiceLinkSection).
        window.renderProcessServiceLinkSection = function() {
            const display = document.getElementById('edit-process-service-link-display');
            if (!display) return;
            const link = window._editProcessServiceLink;

            if (!link) {
                display.innerHTML = `
                    <button type="button" class="btn-secondary" onclick="window.openProcessServiceberichtPicker('edit-process')" style="padding:6px 14px; font-size:0.85rem; display:flex; align-items:center; gap:6px;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
                        Servicebericht verknüpfen
                    </button>`;
                return;
            }

            const dateStr = link.date ? new Date(link.date).toLocaleDateString('de-DE') : '';
            display.innerHTML = `
                <div style="display:flex; align-items:center; gap:8px;">
                    <div onclick="window.jumpToServiceberichtFromProcess(${link.id})" title="Zum Servicebericht springen"
                        style="cursor:pointer; display:inline-flex; align-items:center; gap:6px; background:rgba(16,185,129,0.12); border:1px solid rgba(16,185,129,0.4); color:var(--color-primary-green); border-radius:20px; padding:6px 12px; font-size:0.85rem; font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:80%;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
                        <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${link.title || 'Servicebericht'}${dateStr ? ` — ${dateStr}` : ''}</span>
                    </div>
                    <button type="button" onclick="window.removeProcessServiceLink()" title="Verknüpfung trennen"
                        style="width:26px; height:26px; padding:0; border-radius:999px; font-size:0.78rem; font-weight:700; cursor:pointer; background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.3); color:#f87171;">✕</button>
                </div>`;
        };

        window.selectProcessServiceReport = function(id, title, date) {
            window._editProcessServiceLink = { id: parseInt(id), title: title || 'Servicebericht', date: date || null };
            const hidden = document.getElementById('edit-process-service-report-select');
            if (hidden) hidden.value = id;
            window.renderProcessServiceLinkSection();
        };

        window.removeProcessServiceLink = function() {
            window._editProcessServiceLink = null;
            const hidden = document.getElementById('edit-process-service-report-select');
            if (hidden) hidden.value = '';
            window.renderProcessServiceLinkSection();
        };

        // Schliesst das Vorgang-Bearbeiten-Modal und springt danach zum verknuepften Servicebericht
        window.jumpToServiceberichtFromProcess = function(id) {
            window.closeEditProcessModal();
            setTimeout(() => {
                if (typeof window.jumpToServicebericht === 'function') window.jumpToServicebericht(id);
            }, 320);
        };

        // Zeigt das "E-Mail-Text"-Feld und Absender/Empfänger nur, wenn der Vorgangstyp eine E-Mail ist oder bereits Inhalt importiert wurde
        window.updateEmailBodyVisibility = function(prefix) {
            const typeSelect = document.getElementById(`${prefix}-type-select`);
            const bodyInput = document.getElementById(`${prefix}-body-input`);
            const type = typeSelect ? typeSelect.value : '';
            const isEmailType = type === 'email_incoming' || type === 'email_outgoing';
            const hasContent = !!(bodyInput && bodyInput.value.trim().length > 0);
            const show = isEmailType || hasContent;

            const group = document.getElementById(`${prefix}-body-group`);
            if (group) group.style.display = show ? '' : 'none';

            const senderRecipientGroup = document.getElementById(`${prefix}-sender-recipient-group`);
            if (senderRecipientGroup) senderRecipientGroup.style.display = show ? 'grid' : 'none';

            // "Schritte" gibt es jetzt bei allen Vorgangstypen
            const stepsGroup = document.getElementById(`${prefix}-steps-group`);
            if (stepsGroup) stepsGroup.style.display = '';
        };

        // ==========================================
        // VORGANGS-TYP / -STATUS ALS GLASS-DROPDOWN (statt natives <select>)
        // Gleiches Muster wie Mitarbeiter-Auswahl/Maschinen-Kategorie: das eigentliche
        // <select> bleibt unveraendert im DOM (versteckt) und liefert weiterhin .value fuer
        // saveNewProcess/updateProcess/saveImportedEmail — nur die Optik wird ersetzt.
        // ==========================================
        window.PROCESS_STATUS_INFO = {
            offen: { label: 'Offen', color: '#ef4444' },
            in_bearbeitung: { label: 'In Bearbeitung', color: '#f59e0b' },
            erledigt: { label: 'Erledigt', color: '#10b981' }
        };

        window.toggleProcessSelectDropdown = function(prefix, field) {
            const menu = document.getElementById(`${prefix}-${field}-menu`);
            if (!menu) return;
            const wasOpen = menu.classList.contains('show');
            document.querySelectorAll('.proc-select-menu.show').forEach(m => m.classList.remove('show'));
            if (!wasOpen) {
                window.renderProcessSelectMenu(prefix, field);
                menu.classList.add('show');
            }
        };

        window.renderProcessSelectMenu = function(prefix, field) {
            const menu = document.getElementById(`${prefix}-${field}-menu`);
            const select = document.getElementById(`${prefix}-${field}-select`);
            if (!menu || !select) return;
            const list = menu.querySelector('ul');
            if (!list) return;
            const infoMap = field === 'type' ? (window.PROCESS_TYPE_INFO || {}) : window.PROCESS_STATUS_INFO;
            const currentVal = select.value;
            // Optionen kommen aus dem tatsaechlichen <select> (jedes Modal hat eine eigene,
            // teils kleinere Teilmenge), Farbe/Punkt kommt zusaetzlich aus der globalen Info-Map.
            list.innerHTML = Array.from(select.options).map(opt => {
                const info = infoMap[opt.value];
                const color = info ? info.color : 'rgba(255,255,255,0.4)';
                const active = opt.value === currentVal;
                return `<li onclick="window.selectProcessSelectOption('${prefix}','${field}','${opt.value}')" style="display:flex; align-items:center; gap:10px; ${active ? 'background:rgba(255,255,255,0.06); font-weight:700;' : ''}">
                    <span style="flex-shrink:0; display:inline-block; width:9px; height:9px; border-radius:50%; background:${color};"></span>${opt.text}
                </li>`;
            }).join('');
        };

        window.selectProcessSelectOption = function(prefix, field, value) {
            const select = document.getElementById(`${prefix}-${field}-select`);
            if (select) select.value = value;
            window.syncProcessSelectDisplay(prefix, field);
            const menu = document.getElementById(`${prefix}-${field}-menu`);
            if (menu) menu.classList.remove('show');
            if (field === 'type' && typeof window.updateEmailBodyVisibility === 'function') {
                window.updateEmailBodyVisibility(prefix);
            }
        };

        // Aktualisiert nur die Anzeige (Text/Farbe) des Triggers passend zum aktuellen Wert des
        // versteckten <select> — wird nach jedem programmatischen .value-Set aufgerufen.
        window.syncProcessSelectDisplay = function(prefix, field) {
            const select = document.getElementById(`${prefix}-${field}-select`);
            const textEl = document.getElementById(`${prefix}-${field}-select-text`);
            const dotEl = document.getElementById(`${prefix}-${field}-select-dot`);
            if (!select || !textEl) return;
            const infoMap = field === 'type' ? (window.PROCESS_TYPE_INFO || {}) : window.PROCESS_STATUS_INFO;
            const info = infoMap[select.value];
            textEl.textContent = info ? info.label : (select.options[select.selectedIndex] ? select.options[select.selectedIndex].text : '');
            if (dotEl) dotEl.style.background = info ? info.color : 'rgba(255,255,255,0.3)';
        };

        document.addEventListener('click', (e) => {
            document.querySelectorAll('.proc-select-menu.show').forEach(menu => {
                const trigger = menu.previousElementSibling;
                if (!menu.contains(e.target) && !(trigger && trigger.contains(e.target))) {
                    menu.classList.remove('show');
                }
            });
        });

        // ==========================================
        // VORGANGS-SCHRITTE (Checkliste, Drag & Drop)
        // ==========================================
        window.processSteps = window.processSteps || {};
        let procStepDraggedId = null;

        function genStepId() { return 'st_' + Math.random().toString(36).slice(2, 9); }

        function escStepAttr(s) {
            return String(s == null ? '' : s)
                .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
                .replace(/</g, '&lt;').replace(/>/g, '&gt;');
        }

        window.renderProcessSteps = function(prefix) {
            const list = document.getElementById(`${prefix}-steps-list`);
            if (!list) return;
            const steps = window.processSteps[prefix] || [];
            if (steps.length === 0) {
                list.innerHTML = `<div style="color:rgba(255,255,255,0.3); font-style:italic; font-size:0.85rem; padding:4px 2px;">Noch keine Schritte – füge den ersten hinzu.</div>`;
                return;
            }
            const fmtDT = (d) => { if (!d) return ''; try { return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' · ' + new Date(d).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } };
            list.innerHTML = steps.map((s, i) => {
                const createdMeta = (s.created_by || s.created_at) ? `erstellt${s.created_by ? ` von ${escStepAttr(s.created_by)}` : ''}${s.created_at ? ` am ${fmtDT(s.created_at)}` : ''}` : '';
                const doneMeta = s.done ? `✓ erledigt${s.done_by ? ` von ${escStepAttr(s.done_by)}` : ''}${s.done_at ? ` am ${fmtDT(s.done_at)}` : ''}` : '';
                return `
                <div class="proc-step-row" draggable="true" data-step-id="${s.id}"
                     ondragstart="window.procStepDragStart(event,'${prefix}','${s.id}')"
                     ondragover="window.procStepDragOver(event)"
                     ondrop="window.procStepDrop(event,'${prefix}','${s.id}')"
                     ondragend="window.procStepDragEnd(event)"
                     style="display:flex; flex-direction:column; gap:2px; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.1); border-radius:10px; padding:8px 10px;">
                    <div style="display:flex; align-items:flex-start; gap:8px;">
                        <span class="proc-step-drag" title="Ziehen zum Sortieren" style="cursor:grab; color:rgba(255,255,255,0.3); flex-shrink:0; display:flex; align-items:center; margin-top:5px;">
                            <svg width="10" height="16" viewBox="0 0 8 14" fill="currentColor"><circle cx="2" cy="2" r="1.3"/><circle cx="6" cy="2" r="1.3"/><circle cx="2" cy="7" r="1.3"/><circle cx="6" cy="7" r="1.3"/><circle cx="2" cy="12" r="1.3"/><circle cx="6" cy="12" r="1.3"/></svg>
                        </span>
                        <span style="flex-shrink:0; width:26px; height:26px; border-radius:7px; background:rgba(52,211,153,0.15); color:#34d399; font-weight:800; font-size:0.8rem; display:flex; align-items:center; justify-content:center; margin-top:1px;">${i + 1}</span>
                        <span class="proc-step-editor-check" onclick="window.toggleProcessStepDoneEditor('${prefix}','${s.id}')" title="Abhaken" style="flex-shrink:0; width:22px; height:22px; border-radius:6px; border:2px solid ${s.done ? '#10b981' : 'rgba(255,255,255,0.3)'}; background:${s.done ? '#10b981' : 'transparent'}; display:flex; align-items:center; justify-content:center; cursor:pointer; margin-top:2px;">${s.done ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>' : ''}</span>
                        <textarea rows="1" placeholder="Schritt beschreiben..."
                            oninput="this.style.height='auto'; this.style.height=this.scrollHeight+'px'; window.updateProcessStepText('${prefix}','${s.id}', this.value)"
                            style="flex:1; min-width:0; background:transparent; border:none; color:#fff; font-size:0.9rem; outline:none; resize:none; overflow:hidden; word-break:break-word; white-space:pre-wrap; font-family:inherit; line-height:1.4; padding-top:3px; text-decoration:${s.done ? 'line-through' : 'none'}; opacity:${s.done ? '0.55' : '1'};">${escStepAttr(s.text)}</textarea>
                        <button type="button" onclick="window.deleteProcessStep('${prefix}','${s.id}')" title="Entfernen"
                            style="flex-shrink:0; background:none; border:none; color:#ef4444; cursor:pointer; padding:4px; display:flex; align-items:center; margin-top:1px;">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    </div>
                    ${(createdMeta || doneMeta) ? `<div style="padding-left:80px; display:flex; flex-wrap:wrap; align-items:center; gap:12px;">
                        ${createdMeta ? `<span style="font-size:0.6rem; color:rgba(255,255,255,0.35);">${createdMeta}</span>` : ''}
                        ${doneMeta ? `<span style="font-size:0.6rem; color:rgba(16,185,129,0.6);">${doneMeta}</span>` : ''}
                    </div>` : ''}
                </div>`;
            }).join('');
            requestAnimationFrame(() => {
                list.querySelectorAll('textarea').forEach(ta => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; });
            });
        };

        window.toggleProcessStepDoneEditor = function(prefix, id) {
            const arr = window.processSteps[prefix] || [];
            const s = arr.find(x => x.id === id);
            if (!s) return;
            s.done = !s.done;
            if (s.done) {
                s.done_at = new Date().toISOString();
                s.done_by = (window.activeUser?.name) || (window.currentUser?.name) || null;
            } else {
                s.done_at = null;
                s.done_by = null;
            }
            window.renderProcessSteps(prefix);
        };

        window.addProcessStep = function(prefix) {
            if (!window.processSteps[prefix]) window.processSteps[prefix] = [];
            const creator = (window.activeUser?.name) || (window.currentUser?.name) || null;
            window.processSteps[prefix].push({ id: genStepId(), text: '', done: false, created_at: new Date().toISOString(), created_by: creator, done_at: null, done_by: null });
            window.renderProcessSteps(prefix);
            const list = document.getElementById(`${prefix}-steps-list`);
            if (list) {
                const inputs = list.querySelectorAll('textarea');
                if (inputs.length) inputs[inputs.length - 1].focus();
            }
        };

        window.updateProcessStepText = function(prefix, id, val) {
            const arr = window.processSteps[prefix] || [];
            const s = arr.find(x => x.id === id);
            if (s) s.text = val;
        };

        window.deleteProcessStep = function(prefix, id) {
            if (typeof window.canDelete === 'function' && !window.canDelete('Schritten')) return;
            window.processSteps[prefix] = (window.processSteps[prefix] || []).filter(x => x.id !== id);
            window.renderProcessSteps(prefix);
        };

        window.procStepDragStart = function(e, prefix, id) {
            procStepDraggedId = id;
            e.dataTransfer.effectAllowed = 'move';
            e.currentTarget.style.opacity = '0.4';
        };
        window.procStepDragEnd = function(e) {
            e.currentTarget.style.opacity = '1';
            procStepDraggedId = null;
        };
        window.procStepDragOver = function(e) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        };
        window.procStepDrop = function(e, prefix, targetId) {
            e.preventDefault();
            const arr = window.processSteps[prefix] || [];
            if (!procStepDraggedId || procStepDraggedId === targetId) return;
            const from = arr.findIndex(x => x.id === procStepDraggedId);
            const to = arr.findIndex(x => x.id === targetId);
            if (from < 0 || to < 0) return;
            const [moved] = arr.splice(from, 1);
            arr.splice(to, 0, moved);
            window.renderProcessSteps(prefix);
        };

        // Schritt auf der Vorgänge-Karte abhaken (Hover-Popover)
        window.toggleProcessCardStep = async function(processId, index, event) {
            if (event) event.stopPropagation();
            const proc = (window.eventsState.processes || []).find(p => String(p.id) === String(processId));
            if (!proc || !Array.isArray(proc.steps) || !proc.steps[index]) return;
            const step = proc.steps[index];
            step.done = !step.done;
            if (step.done) {
                step.done_at = new Date().toISOString();
                step.done_by = (window.activeUser?.name) || (window.currentUser?.name) || null;
            } else {
                step.done_at = null;
                step.done_by = null;
            }
            const done = step.done;
            // event.currentTarget IST die Checkbox selbst (.proc-step-check) - nicht in ihr suchen, sondern sie direkt anfassen
            const box = event ? event.currentTarget : null;
            if (box) {
                box.style.background = done ? '#10b981' : 'transparent';
                box.style.borderColor = done ? '#10b981' : 'rgba(255,255,255,0.3)';
                box.innerHTML = done ? '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>' : '';
                const row = box.closest('.proc-step-crow');
                if (row) {
                    const lbl = row.querySelector('.proc-step-label');
                    if (lbl) {
                        lbl.style.textDecoration = done ? 'line-through' : 'none';
                        lbl.style.opacity = done ? '0.5' : '1';
                    }
                    const escStep = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                    const fmtDay = (d) => { try { return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }); } catch (e) { return ''; } };
                    let metaEl = row.querySelector('.proc-step-meta');
                    if (done && step.done_at) {
                        const metaHtml = `✓ ${step.done_by ? escStep(step.done_by) : ''}${step.done_by ? ' · ' : ''}${fmtDay(step.done_at)}`;
                        if (!metaEl) {
                            const wrapDiv = lbl ? lbl.parentElement : null;
                            if (wrapDiv) {
                                metaEl = document.createElement('div');
                                metaEl.className = 'proc-step-meta';
                                metaEl.style.cssText = 'font-size:0.6rem; color:rgba(255,255,255,0.35); margin-top:1px; padding:0 4px;';
                                wrapDiv.appendChild(metaEl);
                            }
                        }
                        if (metaEl) metaEl.innerHTML = metaHtml;
                    } else if (metaEl) {
                        metaEl.remove();
                    }
                }
                const wrap = box.closest('.proc-card-steps');
                if (wrap) {
                    const cnt = wrap.querySelector('.proc-steps-trigger-count');
                    if (cnt) cnt.textContent = `${proc.steps.filter(s => s.done).length}/${proc.steps.length}`;
                }
            }
            try {
                await window.supabaseClient.from('internal_processes').update({ steps: proc.steps }).eq('id', processId);
            } catch (e) {
                console.error('Fehler beim Speichern des Schritts:', e);
            }
        };

        // Schritt-Text auf der Karte inline bearbeiten
        window.updateProcessCardStepText = async function(processId, index, text) {
            const proc = (window.eventsState.processes || []).find(p => String(p.id) === String(processId));
            if (!proc || !Array.isArray(proc.steps) || !proc.steps[index]) return;
            const val = (text || '').trim();
            if (proc.steps[index].text === val) return;
            proc.steps[index].text = val;
            try {
                await window.supabaseClient.from('internal_processes').update({ steps: proc.steps }).eq('id', processId);
            } catch (e) {
                console.error('Fehler beim Speichern des Schritt-Textes:', e);
            }
        };

        // Eigenes Fenster nur für Schritte (hinzufügen / löschen / sortieren / bearbeiten)
        window.stepsModalProcessId = null;
        window.openProcessStepsModal = function(id) {
            const proc = (window.eventsState.processes || []).find(p => String(p.id) === String(id));
            if (!proc) return;
            window.stepsModalProcessId = id;
            window.processSteps['steps-modal'] = Array.isArray(proc.steps)
                ? proc.steps.map(s => ({ id: s.id || genStepId(), text: s.text || '', done: !!s.done, created_at: s.created_at || null, created_by: s.created_by || null, done_at: s.done_at || null, done_by: s.done_by || null }))
                : [];
            const sub = document.getElementById('steps-modal-subtitle');
            if (sub) sub.textContent = proc.title || 'Vorgang';
            window.renderProcessSteps('steps-modal');
            const modal = document.getElementById('process-steps-modal');
            if (!modal) return;
            modal.classList.remove('hidden');
            modal.style.display = 'flex';
            requestAnimationFrame(() => modal.classList.add('show'));
        };
        window.closeProcessStepsModal = function() {
            const modal = document.getElementById('process-steps-modal');
            if (!modal) return;
            modal.classList.remove('show');
            setTimeout(() => { modal.classList.add('hidden'); modal.style.display = 'none'; }, 300);
        };
        window.saveProcessStepsModal = async function() {
            const id = window.stepsModalProcessId;
            if (!id) return;
            const steps = (window.processSteps['steps-modal'] || []).filter(s => (s.text || '').trim());
            try {
                const { error } = await window.supabaseClient.from('internal_processes').update({ steps: steps }).eq('id', id);
                if (error) throw error;
                window.closeProcessStepsModal();
                window.fetchProcesses();
            } catch (e) {
                console.error('Fehler beim Speichern der Schritte:', e);
                window.showToast('Fehler beim Speichern: ' + e.message);
            }
        };
