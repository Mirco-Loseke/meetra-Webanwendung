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
            // Bemerkungsfeld gibt es nicht mehr — nur noch „E-Mail Inhalt" (description).
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
            // (Bemerkungsfeld entfernt)
            const standFeld = document.getElementById('process-add-status-input');
            if (standFeld) standFeld.value = '';
            document.getElementById('process-add-type-select').value = 'note';
            document.getElementById('process-add-status-select').value = 'offen';
            const addSender = document.getElementById('process-add-sender-input');
            const addRecipient = document.getElementById('process-add-recipient-input');
            const addBody = document.getElementById('process-add-body-input');
            if (addSender) addSender.value = '';
            if (addRecipient) addRecipient.value = '';
            if (addBody) addBody.value = '';
            window.syncProcessSelectDisplay('process-add', 'type');
            window.syncProcessSelectDisplay('process-add', 'status');
            if (typeof window.updateEmailBodyVisibility === 'function') window.updateEmailBodyVisibility('process-add');

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

            // Zuständig: der angemeldete Benutzer ist vorausgewählt — wer einen
            // Vorgang anlegt, ist in aller Regel selbst dafür zuständig.
            // Abwählen geht wie gehabt über das Aufklappmenü.
            // Die Kennung kommt aus window.userList (js/auth.js setzt daraus
            // window.activeUser), damit der Typ zum Vergleich im Menü passt.
            const me = window.activeUser && window.activeUser.id;
            window.processAssignedUsers['process-add'] = me ? [me] : [];
            document.getElementById('process-add-assigned-users').value =
                me ? JSON.stringify([me]) : '';
            document.getElementById('process-add-tech-dropdown-panel').style.display = 'none';
            renderProcessTechDropdown('process-add');

            // Reset Adresse / Ansprechpartner
            window.resetProcessAddressFields('process-add');

            // Reset Schritte
            window.processSteps['process-add'] = [];
            window.renderProcessSteps('process-add');

            // Reset gestapelte Dokumente (js/process-attachments.js)
            if (typeof window.clearProcessPendingFiles === 'function') window.clearProcessPendingFiles('process-add');

            // Reset Erinnerung
            const remindEl = document.getElementById('process-add-remind-input');
            if (remindEl) remindEl.value = '';

            if (typeof window.procAngebotFuerAddWaehlen === 'function') window.procAngebotFuerAddWaehlen('', '', '');
            // Adress- vs. Maschinen-Modus
            window.processPendingAddress = (opts && opts.customerId)
                ? { id: opts.customerId, name: opts.customerName || 'Adresse', contact: opts.contactName || '' }
                : null;
            const addrBanner = document.getElementById('process-add-address-banner');
            const machineGroup = document.getElementById('process-add-machine-group');
            const addrGroup = document.getElementById('process-add-address-group');
            if (window.processPendingAddress) {
                document.getElementById('process-add-address-name').textContent =
                    window.processPendingAddress.name +
                    (window.processPendingAddress.contact ? ' · ' + window.processPendingAddress.contact : '');
                if (addrBanner) addrBanner.style.display = 'block';
                // Ein Adress-Vorgang hängt nicht an einer Maschine.
                if (machineGroup) machineGroup.style.display = 'none';
                // Adresse ist über den Banner bereits fest gesetzt.
                if (addrGroup) addrGroup.style.display = 'none';
            } else {
                if (addrBanner) addrBanner.style.display = 'none';
                if (machineGroup) machineGroup.style.display = '';
                if (addrGroup) addrGroup.style.display = '';
            }
            // Vorhandene Vorgänge zur Adresse zeigen (bei Aufruf aus dem Adressbuch sofort)
            window.zeigeVorhandeneVorgaenge(window.processPendingAddress ? window.processPendingAddress.id : null);
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
                // „Bemerkung / Notiz" gibt es bei Vorgängen nicht mehr. Der einzige
                // Freitext ist „E-Mail Inhalt" (Spalte description), und der wird nur
                // beim Import einer Mail gefüllt — von Hand ist er nicht anlegbar.
                const standText = (document.getElementById('process-add-status-input')?.value || '').trim();
                const sender = document.getElementById('process-add-sender-input')?.value || '';
                const recipient = document.getElementById('process-add-recipient-input')?.value || '';
                const description = document.getElementById('process-add-body-input')?.value || '';

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
                    sender: sender || null,
                    recipient: recipient || null,
                    description: description || null,
                    assigned_users: window.processAssignedUsers['process-add'],
                    steps: (window.processSteps['process-add'] || []).filter(s => (s.text || '').trim()),
                    // Gleich beim Anlegen eingetragener Stand — selbes Format
                    // wie saveProcessStatusUpdate, damit Karte und Verlauf ihn
                    // ohne Sonderfall anzeigen.
                    status_updates: standText ? [{
                        text: standText,
                        by: (window.activeUser && window.activeUser.name) || 'Unbekannt',
                        by_id: (window.activeUser && window.activeUser.id) || null,
                        at: new Date().toISOString()
                    }] : []
                    // Ersteller setzt window.insertMitErsteller (app-core.js): die
                    // App-Nutzer haben bigint-IDs, internal_processes.user_id ist
                    // aber uuid — deshalb geht die bigint-ID nach created_by_user.
                };
                if (addr) {
                    payload.customer_id = addr.id;
                    if (addr.contact) payload.contact_name = addr.contact;
                } else {
                    // Inline im Formular gewählte Adresse (normaler Vorgang):
                    // Adresse UND Maschine dürfen hier gleichzeitig hängen.
                    const inlineCustomerId = document.getElementById('process-add-customer-id')?.value;
                    const inlineContact = document.getElementById('process-add-contact-name')?.value;
                    if (inlineCustomerId) {
                        // customers.id ist eine UUID — NICHT parseInt (das würde aus
                        // "6f2a…" die Zahl 6 machen und die uuid-Spalte ablehnen).
                        payload.customer_id = inlineCustomerId;
                        if (inlineContact) payload.contact_name = inlineContact;
                    }
                }
                if (remindRaw) payload.remind_at = new Date(remindRaw).toISOString();

                // Nur die tatsächlich fehlenden Spalten entfernen (nicht pauschal alle),
                // damit eine fehlende contact_name-Spalte nicht die gültige customer_id
                // mit wegwirft.
                const attempt = { ...payload };
                const optionalCols = ['customer_id', 'contact_name', 'remind_at', 'status_updates'];
                const dropped = [];
                let error, data;
                for (let i = 0; i < optionalCols.length + 1; i++) {
                    ({ error, data } = await window.insertMitErsteller('internal_processes', attempt));
                    if (!error) break;
                    const msg = error.message || '';
                    const offending = optionalCols.filter(c => (c in attempt) && msg.includes(c));
                    if (!offending.length) break;
                    offending.forEach(c => { delete attempt[c]; dropped.push(c); });
                }

                if (error) throw error;

                // Gestapelte Dokumente (vor dem Speichern ausgewaehlt) an die
                // frisch vergebene ID haengen.
                const newProcessId = data && data[0] && data[0].id;
                if (newProcessId && typeof window.flushProcessPendingFiles === 'function') {
                    await window.flushProcessPendingFiles('process-add', newProcessId);
                }

                if (dropped.length) {
                    const labelMap = { customer_id: 'Adresse', contact_name: 'Ansprechpartner', remind_at: 'Erinnerung', status_updates: 'Aktueller Stand' };
                    const fehlend = dropped.map(c => labelMap[c] || c).join(', ');
                    window.showToast('Vorgang gespeichert, aber NICHT übernommen: ' + fehlend + '.\n\nDazu fehlt eine Spalte – bitte supabase_add_process_customer.sql in Supabase ausführen.');
                } else {
                    window.showToast('Vorgang gespeichert.', 'success');
                }

                const savedAddressId = addr ? addr.id : null;
                window.closeProcessAddModal();
                // Beim Anlegen gewähltes Angebot jetzt an den neuen Vorgang hängen —
                // dafür muss der Vorgang in der geladenen Liste stehen.
                const angebotId = document.getElementById('process-add-angebot-id')?.value || '';
                await window.fetchProcesses();
                if (angebotId && newProcessId && typeof window.procAngebotVerknuepfen === 'function') {
                    try { await window.procAngebotVerknuepfen(angebotId, newProcessId); }
                    catch (e) { console.warn('Angebot nicht verknüpft:', e); window.showToast('Vorgang gespeichert, Angebot konnte nicht verknüpft werden.'); }
                }

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
            document.getElementById('edit-process-body-input').value = proc.description || '';

            window.statusUpdateProcessId = proc.id;
            const editStandText = document.getElementById('edit-process-status-text');
            if (editStandText) editStandText.value = '';
            window.renderProcessStatusHistory(proc);
            angeboteSucheCache = null;   // Angebotssuche frisch laden (Importe seit dem letzten Öffnen)
            angebotSucheAlle = false;
            const angBox = document.getElementById('edit-process-angebot-block');
            if (angBox) angBox.innerHTML = window.renderProcessAngebotBlock ? window.renderProcessAngebotBlock(proc, 'modal') : '';
            window.syncProcessSelectDisplay('edit-process', 'type');
            window.syncProcessSelectDisplay('edit-process', 'status');
            window.processSteps['edit-process'] = Array.isArray(proc.steps)
                ? proc.steps.map(s => ({ id: s.id || genStepId(), text: s.text || '', done: !!s.done, created_at: s.created_at || null, created_by: s.created_by || null, done_at: s.done_at || null, done_by: s.done_by || null, assigned_to: s.assigned_to || null, assigned_id: s.assigned_id || null, remind_at: s.remind_at || null }))
                : [];
            window.renderProcessSteps('edit-process');
            if (typeof window.updateProcessAttachButton === 'function') window.updateProcessAttachButton();
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

            // Adresse + Ansprechpartner sind jetzt bearbeitbar (Maschine bleibt daneben sichtbar).
            const editAddrBanner = document.getElementById('edit-process-address-banner');
            if (editAddrBanner) editAddrBanner.style.display = 'none';
            const editMachineGroup = document.getElementById('edit-process-machine-group');
            if (editMachineGroup) editMachineGroup.style.display = '';
            window.prefillProcessAddressFields('edit-process', proc);

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
                    // Während des Fensters aufgeschobenes Neuladen jetzt nachholen.
                    if (typeof window.processesRefetchIfPending === 'function') window.processesRefetchIfPending();
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
            // „E-Mail Inhalt" gibt es nur, wenn wirklich eine Mail importiert wurde.
            // Im Import-Fenster selbst (prefix 'email') reicht der Vorgangstyp, sonst
            // könnte man den mitgebrachten Text dort gar nicht mehr sehen.
            const show = hasContent || (prefix === 'email' && isEmailType);

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

            // Dokumente an einem Schritt gibt es erst, wenn der Vorgang
            // gespeichert ist — vorher fehlt die ID, unter der die Datei
            // abgelegt wuerde. Beim Neuanlegen bleibt der Knopf deshalb weg.
            const procIdFuerAnhang = prefix === 'edit-process'
                ? ((document.getElementById('edit-process-id') || {}).value || '')
                : (prefix === 'steps-modal' ? (window.stepsModalProcessId || '') : '');
            const attBtn = (stepId) => {
                if (!procIdFuerAnhang || typeof window.openProcessAttachments !== 'function') return '';
                const n = window.processAttachCount(procIdFuerAnhang, stepId);
                const farbe = n ? '#38bdf8' : 'rgba(255,255,255,0.4)';
                const rahmen = n ? 'none' : '1px dashed rgba(255,255,255,0.35)';
                const hg = n ? 'rgba(56,189,248,0.18)' : 'transparent';
                return `<button type="button" onclick="window.openProcessAttachments('${procIdFuerAnhang}','${stepId}', event)" title="${n ? n + ' Dokument(e)' : 'Dokument hinzufügen'}" style="flex-shrink:0; width:24px; height:24px; border-radius:50%; border:${rahmen}; background:${hg}; color:${farbe}; cursor:pointer; display:flex; align-items:center; justify-content:center; margin-top:1px; font-size:0.7rem; font-weight:800;">${n ? n : '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>'}</button>`;
            };
            list.innerHTML = steps.map((s, i) => {
                const createdMeta = (s.created_by || s.created_at) ? `erstellt${s.created_by ? ` von ${escStepAttr(s.created_by)}` : ''}${s.created_at ? ` am ${fmtDT(s.created_at)}` : ''}` : '';
                const doneMeta = s.done ? `✓ erledigt${s.done_by ? ` von ${escStepAttr(s.done_by)}` : ''}${s.done_at ? ` am ${fmtDT(s.done_at)}` : ''}` : '';
                const assignedUser = s.assigned_to ? (window.userList || []).find(u => u.name === s.assigned_to) : null;
                const assignInitials = s.assigned_to ? (assignedUser ? (assignedUser.initials || assignedUser.name.substring(0, 2).toUpperCase()) : s.assigned_to.substring(0, 2).toUpperCase()) : '';
                const assignColor = assignedUser ? (assignedUser.color || '#666') : '#64748b';
                const assignBtn = s.assigned_to
                    ? `<button type="button" onclick="window.openStepAssigneeMenu('${prefix}','${s.id}', event)" title="Zuständig: ${escStepAttr(s.assigned_to)}" style="flex-shrink:0; width:24px; height:24px; border-radius:50%; border:none; background:${assignColor}; color:#fff; font-size:0.62rem; font-weight:800; cursor:pointer; display:flex; align-items:center; justify-content:center; margin-top:1px;">${assignInitials}</button>`
                    : `<button type="button" onclick="window.openStepAssigneeMenu('${prefix}','${s.id}', event)" title="Zuständigen zuweisen" style="flex-shrink:0; width:24px; height:24px; border-radius:50%; border:1px dashed rgba(255,255,255,0.35); background:transparent; color:rgba(255,255,255,0.4); cursor:pointer; display:flex; align-items:center; justify-content:center; margin-top:1px;"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg></button>`;
                const assignMeta = s.assigned_to ? `zuständig: ${escStepAttr(s.assigned_to)}` : '';
                let remBtn, remindMeta = '';
                if (s.remind_at) {
                    const rd = new Date(s.remind_at);
                    const diffDays = Math.round((new Date(rd).setHours(0,0,0,0) - new Date().setHours(0,0,0,0)) / 86400000);
                    const rc = s.done ? 'rgba(255,255,255,0.35)' : (diffDays < 0 ? '#f87171' : (diffDays <= 3 ? '#fbbf24' : '#93c5fd'));
                    remBtn = `<button type="button" onclick="window.openStepReminderMenu('${prefix}','${s.id}', event)" title="Erinnerung: ${escStepAttr(fmtDT(s.remind_at))}" style="flex-shrink:0; width:24px; height:24px; border-radius:50%; border:none; background:${rc}22; color:${rc}; cursor:pointer; display:flex; align-items:center; justify-content:center; margin-top:1px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><polyline points="12 7 12 12 15 14"></polyline></svg></button>`;
                    remindMeta = `erinnert ${escStepAttr(fmtDT(s.remind_at))}`;
                } else {
                    remBtn = `<button type="button" onclick="window.openStepReminderMenu('${prefix}','${s.id}', event)" title="Erinnerung setzen" style="flex-shrink:0; width:24px; height:24px; border-radius:50%; border:1px dashed rgba(255,255,255,0.35); background:transparent; color:rgba(255,255,255,0.4); cursor:pointer; display:flex; align-items:center; justify-content:center; margin-top:1px;"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><polyline points="12 7 12 12 15 14"></polyline></svg></button>`;
                }
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
                        ${assignBtn}
                        ${remBtn}
                        ${attBtn(s.id)}
                        <button type="button" onclick="window.deleteProcessStep('${prefix}','${s.id}')" title="Entfernen"
                            style="flex-shrink:0; background:none; border:none; color:#ef4444; cursor:pointer; padding:4px; display:flex; align-items:center; margin-top:1px;">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    </div>
                    ${(createdMeta || doneMeta || assignMeta || remindMeta) ? `<div style="padding-left:80px; display:flex; flex-wrap:wrap; align-items:center; gap:12px;">
                        ${remindMeta ? `<span style="font-size:0.78rem; font-weight:600; color:#93c5fd; display:inline-flex; align-items:center; gap:4px;"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><polyline points="12 7 12 12 15 14"></polyline></svg>${remindMeta}</span>` : ''}
                        ${assignMeta ? `<span style="font-size:0.78rem; font-weight:600; color:${assignColor};">${assignMeta}</span>` : ''}
                        ${createdMeta ? `<span style="font-size:0.78rem; color:rgba(255,255,255,0.5);">${createdMeta}</span>` : ''}
                        ${doneMeta ? `<span style="font-size:0.78rem; color:rgba(16,185,129,0.75);">${doneMeta}</span>` : ''}
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

        window.deleteProcessStep = async function(prefix, id) {
            if (typeof window.canDelete === 'function' && !window.canDelete('Schritten')) return;

            // Hängen Dokumente an diesem Schritt, würden sie sonst unsichtbar
            // im Speicher zurückbleiben — niemand käme mehr an sie heran.
            const procId = prefix === 'edit-process'
                ? ((document.getElementById('edit-process-id') || {}).value || '')
                : (prefix === 'steps-modal' ? (window.stepsModalProcessId || '') : '');
            if (procId && typeof window.processAttachCount === 'function') {
                const n = window.processAttachCount(procId, id);
                if (n && !confirm(`An diesem Schritt hängen ${n} Dokument(e).\n\nBeim Löschen des Schritts werden sie endgültig aus dem Speicher entfernt. Fortfahren?`)) return;
                if (n && typeof window.deleteProcessStepFiles === 'function') {
                    try { await window.deleteProcessStepFiles(procId, id); }
                    catch (e) { console.warn('Dokumente des Schritts konnten nicht gelöscht werden:', e); }
                }
            }

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
                                metaEl.style.cssText = 'font-size:0.78rem; color:rgba(255,255,255,0.5); margin-top:2px; padding:0 4px;';
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
                ? proc.steps.map(s => ({ id: s.id || genStepId(), text: s.text || '', done: !!s.done, created_at: s.created_at || null, created_by: s.created_by || null, done_at: s.done_at || null, done_by: s.done_by || null, assigned_to: s.assigned_to || null, assigned_id: s.assigned_id || null, remind_at: s.remind_at || null }))
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

        // ==========================================
        // AKTUELLER STAND (status_updates)
        // Freitext-Meldung pro Vorgang; Benutzer + Zeitpunkt werden automatisch
        // gesetzt. Neuester Eintrag steht an Position 0, der Verlauf bleibt
        // erhalten. Anzeige auf der Karte: Zeile + Hover-Popover.
        // ==========================================
        window.statusUpdateProcessId = null;

        // Hilfen für das Zeitpunkt-Feld (datetime-local kennt keine Zeitzone,
        // deshalb von Hand aus den lokalen Bestandteilen bauen).
        window.isoToLocalInput = function(iso) {
            const d = iso ? new Date(iso) : new Date();
            if (isNaN(d)) return '';
            const pad = (n) => String(n).padStart(2, '0');
            return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
        };
        window.localInputToIso = function(val) {
            if (!val) return null;
            const d = new Date(val);
            return isNaN(d) ? null : d.toISOString();
        };

        // ------------------------------------------------------------------
        // ANGEBOT AM VORGANG
        // ------------------------------------------------------------------
        // Hängt an einem Vorgang ein Angebot (angebote.process_id, geladen in
        // js/processes.js → window.angeboteByProcess), werden Status, VK, EK
        // und Realisierbar hier gezeigt und geändert. Gespeichert wird in
        // `angebote` (window.angebotFeldSpeichern, js/listen.js) — die
        // Angebotsliste zeigt danach denselben Stand.
        const angEsc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        // Zahlen kommen aus der Datenbank als "12500.00" (Punkt) und aus dem
        // Feld als "12.500,00" (deutsch). Wie parseGermanNumber in listen.js:
        // Punkte sind nur dann Tausenderzeichen, wenn ein Komma dabei ist.
        const angParse = (s) => {
            if (s === null || s === undefined || s === '') return null;
            if (typeof s === 'number') return s;
            let t = String(s).trim().replace(/[€%\s]/g, '');
            if (!t) return null;
            if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
            const n = parseFloat(t);
            return isNaN(n) ? null : n;
        };
        const angZahl = (v) => {
            const n = angParse(v);
            return n === null ? '' : n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        };

        window.renderProcessAngebotBlock = function (proc, modus) {
            const a = window.angeboteByProcess && window.angeboteByProcess[String(proc.id)];
            if (!a) {
                if (modus !== 'modal') return '';
                // Noch kein Angebot am Vorgang: eines aus der Angebotsliste suchen
                // und verknüpfen (setzt angebote.process_id auf diesen Vorgang).
                return `
                <div class="form-group" style="margin-bottom:0.75rem; position:relative;">
                    <label class="form-label-caps">Angebot</label>
                    <input type="text" class="glass-input" id="edit-process-angebot-suche" placeholder="Angebot suchen (Belegnummer oder Firma) …" autocomplete="off"
                           oninput="window.procAngebotSuche(this.value, '${proc.id}')" onfocus="window.procAngebotSuche(this.value, '${proc.id}')"
                           onblur="setTimeout(() => { const d = document.getElementById('edit-process-angebot-treffer'); if (d) d.style.display = 'none'; }, 200)">
                    <div id="edit-process-angebot-treffer" class="autocomplete-suggestions" style="display:none; position:absolute; top:100%; left:0; right:0; z-index:9999; max-height:220px; overflow-y:auto; margin-top:4px;"></div>
                </div>`;
            }
            const optionen = (typeof window.angebotStatusOptionen === 'function')
                ? window.angebotStatusOptionen(a.status)
                : (window.categoryList || []).filter(c => c.type === 'status');
            const statusCat = (window.categoryList || []).find(c => c.type === 'status' && c.name === a.status);
            const vk = angParse(a.nettobetrag), ek = angParse(a.ek_betrag);
            const spanne = (vk !== null && ek !== null) ? vk - ek : null;
            const spannePct = (spanne !== null && vk > 0) ? (spanne / vk * 100) : null;
            const datum = a.belegdatum ? String(a.belegdatum).split('-').reverse().join('.') : '';
            const feld = (label, inhalt, stil) => `
                <div style="display:flex; flex-direction:column; gap:3px; min-width:0; ${stil || ''}">
                    <span style="font-size:0.66rem; font-weight:800; text-transform:uppercase; letter-spacing:0.5px; color:rgba(255,255,255,0.5);">${label}</span>
                    ${inhalt}
                </div>`;
            const eingabe = (wert, platz, onblur, extra) => `
                <input type="text" class="glass-input" value="${angEsc(wert)}" placeholder="${platz}"
                       style="height:32px; padding:0 9px; font-size:0.85rem; text-align:right; ${extra || ''}"
                       onclick="event.stopPropagation()" onkeydown="if(event.key==='Enter'){ this.blur(); }"
                       onblur="${onblur}">`;
            return `
                <div class="proc-angebot-block" onclick="event.stopPropagation()"
                     style="margin-bottom:8px; padding:9px 11px; border-radius:10px; background:rgba(250,204,21,0.07); border:1px solid rgba(250,204,21,0.3);">
                    <div style="display:flex; align-items:center; gap:8px; margin-bottom:7px;">
                        <a href="#" onclick="event.preventDefault(); event.stopPropagation(); window.vorgangZumAngebotSpringen('${a.id}', '${angEsc(a.belegnummer || '')}')" title="Angebot in der Angebotsliste öffnen"
                           style="font-size:0.72rem; font-weight:800; color:#facc15; text-transform:uppercase; letter-spacing:0.5px; text-decoration:underline; text-underline-offset:3px;">Angebot ${angEsc(a.belegnummer || '')} ↗</a>
                        ${datum ? `<span style="font-size:0.72rem; color:rgba(255,255,255,0.45);">vom ${datum}</span>` : ''}
                        ${modus === 'card' ? `<span onclick="window.switchView('listen'); window.switchListenTab && window.switchListenTab('angebote');" title="Zur Angebotsliste" style="margin-left:auto; font-size:0.72rem; color:#facc15; cursor:pointer; text-decoration:underline;">Liste</span>` : ''}
                    </div>
                    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(110px, 1fr)); gap:8px;">
                        ${feld('Status', `
                            <select class="glass-input" style="height:32px; padding:0 6px; font-size:0.85rem; ${statusCat && statusCat.color ? `border-color:${statusCat.color};` : ''}"
                                    onclick="event.stopPropagation()" onchange="window.procAngebotFeld('${a.id}', 'status', this.value)">
                                <option value="">-- kein Status --</option>
                                ${optionen.map(c => `<option value="${angEsc(c.name)}" ${c.name === a.status ? 'selected' : ''}>${angEsc(c.name)}</option>`).join('')}
                            </select>`, 'grid-column: span 2;')}
                        ${feld('VK (€)', eingabe(angZahl(a.nettobetrag), 'VK…', `window.procAngebotFeld('${a.id}', 'nettobetrag', this.value)`))}
                        ${feld('EK (€)', eingabe(angZahl(a.ek_betrag), 'EK…', `window.procAngebotFeld('${a.id}', 'ek_betrag', this.value)`))}
                        ${feld('Realisierbar (%)', eingabe(a.realisierbar == null ? '' : String(a.realisierbar), '…', `window.procAngebotFeld('${a.id}', 'realisierbar', this.value)`))}
                        ${spanne !== null ? feld('Spanne', `<div style="height:32px; display:flex; align-items:center; justify-content:flex-end; font-weight:800; font-size:0.9rem; color:${spannePct !== null && spannePct < 10 ? '#F87171' : '#22c55e'};">${angZahl(spanne)} €${spannePct !== null ? ` <span style="font-size:0.72rem; margin-left:5px; opacity:0.8;">${spannePct.toLocaleString('de-DE', { maximumFractionDigits: 1 })} %</span>` : ''}</div>`) : ''}
                    </div>
                </div>`;
        };

        // Vom Vorgang zum Angebot: Fenster zu, Angebotsliste auf, nach der
        // Belegnummer gefiltert (navigateToAngebot in js/listen.js).
        window.vorgangZumAngebotSpringen = function (angebotId, belegnummer) {
            const modal = document.getElementById('process-edit-modal');
            if (modal && !modal.classList.contains('hidden') && typeof window.closeEditProcessModal === 'function') window.closeEditProcessModal();
            if (typeof window.navigateToAngebot === 'function') window.navigateToAngebot(angebotId, belegnummer);
            else { window.switchView('listen'); window.switchListenTab && window.switchListenTab('angebote'); }
        };

        // Angebot suchen und an diesen Vorgang hängen.
        let angeboteSucheCache = null;
        let angebotSucheAlle = false;   // true = nicht auf die Adresse des Vorgangs eingrenzen
        async function angeboteFuerSuche() {
            if (angeboteSucheCache) return angeboteSucheCache;
            const { data, error } = await window.supabaseClient
                .from('angebote').select('id, belegnummer, belegdatum, nettobetrag, process_id, customer_id, machine_id, machine_label, kundenmatchcode, customers(name)')
                .order('belegdatum', { ascending: false }).limit(2000);
            if (error) { console.warn('Angebote für Suche:', error.message); return []; }
            angeboteSucheCache = data || [];
            return angeboteSucheCache;
        }
        // Zuerst nur die Angebote der im Vorgang hinterlegten Adresse; „Alle
        // durchsuchen" hebt die Eingrenzung auf.
        window.procAngebotSuche = async function (text, processId) {
            const box = document.getElementById('edit-process-angebot-treffer');
            if (!box) return;
            const liste = await angeboteFuerSuche();
            const t = String(text || '').trim().toLowerCase();
            const adresseId = document.getElementById('edit-process-customer-id')?.value || '';
            const eingegrenzt = !!adresseId && !angebotSucheAlle;
            const passt = (a) => !t
                || String(a.belegnummer || '').toLowerCase().includes(t)
                || String(a.customers?.name || a.kundenmatchcode || '').toLowerCase().includes(t);
            let treffer = liste.filter(a => passt(a) && (!eingegrenzt || String(a.customer_id) === String(adresseId)));
            const anzahlAlle = eingegrenzt ? liste.filter(passt).length : treffer.length;
            treffer = treffer.slice(0, 25);
            const zeilen = treffer.map(a => {
                const firma = (a.customers?.name || a.kundenmatchcode || '').split(',')[0].trim();
                const datum = a.belegdatum ? String(a.belegdatum).split('-').reverse().join('.') : '';
                const belegt = a.process_id && String(a.process_id) !== String(processId);
                return `<div onmousedown="event.preventDefault(); window.procAngebotVerknuepfen('${a.id}', '${processId}')"
                             style="padding:9px 12px; cursor:pointer; border-bottom:1px solid rgba(255,255,255,0.06); display:flex; gap:10px; align-items:center;">
                            <span style="font-weight:800; color:#facc15; white-space:nowrap;">${angEsc(a.belegnummer || '')}</span>
                            <span style="flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#fff; font-size:0.86rem;">${angEsc(firma)}</span>
                            <span style="font-size:0.74rem; color:rgba(255,255,255,0.45); white-space:nowrap;">${datum}${belegt ? ' · hat eigenen Vorgang → wird zusammengeführt' : ''}</span>
                        </div>`;
            });
            if (!treffer.length) {
                zeilen.push(`<div style="padding:9px 12px; color:rgba(255,255,255,0.45); font-size:0.84rem;">${eingegrenzt ? 'Kein Angebot dieser Adresse gefunden.' : 'Kein Angebot gefunden.'}</div>`);
            }
            if (eingegrenzt) {
                zeilen.push(`<div onmousedown="event.preventDefault(); window.procAngebotSucheAlle('${processId}')"
                                  style="padding:9px 12px; cursor:pointer; background:rgba(255,255,255,0.05); color:#34d399; font-weight:700; font-size:0.84rem;">
                                 🔍 Alle Angebote durchsuchen (${anzahlAlle}) — nicht nur die dieser Adresse
                             </div>`);
            }
            box.innerHTML = zeilen.join('');
            box.style.display = 'block';
        };
        // Gleiche Suche im Anlegen-Fenster: hier wird nur gemerkt, welches
        // Angebot gemeint ist — verknüpft wird, sobald der Vorgang gespeichert
        // ist (saveNewProcess ruft dann procAngebotVerknuepfen).
        window.procAngebotSucheAdd = async function (text) {
            const box = document.getElementById('process-add-angebot-treffer');
            if (!box) return;
            const liste = await angeboteFuerSuche();
            const t = String(text || '').trim().toLowerCase();
            const adresseId = document.getElementById('process-add-customer-id')?.value
                || (window.processPendingAddress && window.processPendingAddress.id) || '';
            const passt = (a) => !t
                || String(a.belegnummer || '').toLowerCase().includes(t)
                || String(a.customers?.name || a.kundenmatchcode || '').toLowerCase().includes(t);
            // Erst die Angebote dieser Adresse, dann der Rest — beides sichtbar.
            const eigene = liste.filter(a => passt(a) && adresseId && String(a.customer_id) === String(adresseId));
            const andere = liste.filter(a => passt(a) && !(adresseId && String(a.customer_id) === String(adresseId)));
            const treffer = eigene.concat(andere).slice(0, 25);
            const zeilen = treffer.map(a => {
                const firma = (a.customers?.name || a.kundenmatchcode || '').split(',')[0].trim();
                const datum = a.belegdatum ? String(a.belegdatum).split('-').reverse().join('.') : '';
                return `<div onmousedown="event.preventDefault(); window.procAngebotFuerAddWaehlen('${a.id}', '${angEsc(a.belegnummer || '')}', '${angEsc(firma)}')"
                             style="padding:9px 12px; cursor:pointer; border-bottom:1px solid rgba(255,255,255,0.06); display:flex; gap:10px; align-items:center;">
                            <span style="font-weight:800; color:#facc15; white-space:nowrap;">${angEsc(a.belegnummer || '')}</span>
                            <span style="flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#fff; font-size:0.86rem;">${angEsc(firma)}</span>
                            <span style="font-size:0.74rem; color:rgba(255,255,255,0.45); white-space:nowrap;">${datum}${a.process_id ? ' · hat schon einen Vorgang' : ''}</span>
                        </div>`;
            });
            if (!treffer.length) zeilen.push('<div style="padding:9px 12px; color:rgba(255,255,255,0.45); font-size:0.84rem;">Kein Angebot gefunden.</div>');
            box.innerHTML = zeilen.join('');
            box.style.display = 'block';
        };
        window.procAngebotFuerAddWaehlen = function (id, belegnummer, firma) {
            const hidden = document.getElementById('process-add-angebot-id');
            const input = document.getElementById('process-add-angebot-suche');
            if (hidden) hidden.value = id || '';
            if (input) { input.value = belegnummer ? `Angebot ${belegnummer}${firma ? ' – ' + firma : ''}` : ''; input.style.color = id ? '#facc15' : ''; }
            const box = document.getElementById('process-add-angebot-treffer');
            if (box) box.style.display = 'none';
        };

        window.procAngebotSucheAlle = function (processId) {
            angebotSucheAlle = true;
            const input = document.getElementById('edit-process-angebot-suche');
            window.procAngebotSuche(input ? input.value : '', processId);
            if (input) input.focus();
        };

        // Angebot an diesen Vorgang hängen. Hat das Angebot schon seinen
        // (automatisch angelegten) Vorgang, werden BEIDE zu einem: Schritte,
        // Zuständige, Stände und Dokumente wandern in diesen Vorgang, der
        // Titel wird „Angebot <Nr> – <Maschine> – <bisheriger Titel>", der
        // andere Vorgang wird gelöscht.
        window.procAngebotVerknuepfen = async function (angebotId, processId) {
            const box = document.getElementById('edit-process-angebot-treffer');
            if (box) box.style.display = 'none';
            const liste = await angeboteFuerSuche();
            const a = liste.find(x => String(x.id) === String(angebotId));
            if (!a) return;
            const proc = (window.eventsState.processes || []).find(p => String(p.id) === String(processId));
            if (!proc) { window.showToast('Vorgang nicht geladen.'); return; }

            let quelle = null;
            if (a.process_id && String(a.process_id) !== String(processId)) {
                quelle = (window.eventsState.processes || []).find(p => String(p.id) === String(a.process_id)) || null;
                if (!quelle) {
                    const { data: q } = await window.supabaseClient.from('internal_processes').select('*').eq('id', a.process_id).maybeSingle();
                    quelle = q || null;
                }
                if (quelle && !confirm(`Angebot ${a.belegnummer} hat bereits einen eigenen Vorgang („${quelle.title || ''}“).\n\nBeide zusammenführen? Schritte, Zuständige, Stände und Dokumente des anderen Vorgangs kommen in diesen; der andere wird danach gelöscht.`)) return;
            }

            const maschine = a.machine_id
                ? ((typeof window.getMachineName === 'function' && window.getMachineName(a.machine_id)) || '')
                : (a.machine_label || '');
            const titelAlt = (document.getElementById('edit-process-title-input')?.value || proc.title || '').trim();
            const kopf = `Angebot ${a.belegnummer || ''}${maschine ? ' – ' + maschine : ''}`.trim();
            const titelNeu = titelAlt && !titelAlt.startsWith('Angebot ' + (a.belegnummer || '')) ? `${kopf} – ${titelAlt}` : (titelAlt || kopf);

            const felder = { title: titelNeu };
            if (quelle) {
                // Listen zusammenführen — Vorhandenes bleibt vorn, Doppeltes fällt weg.
                const ohneDoppel = (x, y, key) => {
                    const alle = [].concat(Array.isArray(x) ? x : [], Array.isArray(y) ? y : []);
                    const gesehen = new Set();
                    return alle.filter(e => { const k = key(e); if (gesehen.has(k)) return false; gesehen.add(k); return true; });
                };
                felder.steps = ohneDoppel(proc.steps, quelle.steps, s => (s && s.id) || JSON.stringify(s));
                felder.assigned_users = ohneDoppel(proc.assigned_users, quelle.assigned_users, u => String(u));
                felder.status_updates = ohneDoppel(proc.status_updates, quelle.status_updates, u => (u && (u.at + '|' + u.text)) || JSON.stringify(u))
                    .sort((x, y) => String(y.at || '').localeCompare(String(x.at || '')));
                felder.attachments = ohneDoppel(proc.attachments, quelle.attachments, f => (f && (f.path || f.url || f.id)) || JSON.stringify(f));
                if (!proc.machine_id && quelle.machine_id) felder.machine_id = quelle.machine_id;
                if (!proc.customer_id && quelle.customer_id) felder.customer_id = quelle.customer_id;
                if (!proc.remind_at && quelle.remind_at) felder.remind_at = quelle.remind_at;
            } else {
                if (!proc.machine_id && a.machine_id) felder.machine_id = a.machine_id;
                if (!proc.customer_id && a.customer_id) felder.customer_id = a.customer_id;
            }

            const { error: pErr } = await window.supabaseClient.from('internal_processes').update(felder).eq('id', processId);
            if (pErr) { window.showToast('Zusammenführen fehlgeschlagen: ' + pErr.message); return; }
            const { data, error } = await window.supabaseClient
                .from('angebote').update({ process_id: processId }).eq('id', angebotId)
                .select('*, customers(name), angebot_notizen(id, content, created_at)').single();
            if (error) { window.showToast('Verknüpfen fehlgeschlagen: ' + error.message); return; }
            if (quelle) {
                const { error: dErr } = await window.supabaseClient.from('internal_processes').delete().eq('id', quelle.id);
                if (dErr) console.warn('Alter Angebots-Vorgang nicht gelöscht:', dErr.message);
            }

            a.process_id = processId;
            Object.assign(proc, felder);
            window.angeboteByProcess = window.angeboteByProcess || {};
            window.angeboteByProcess[String(processId)] = data;
            if (quelle) delete window.angeboteByProcess[String(quelle.id)];
            const titel = document.getElementById('edit-process-title-input');
            if (titel) titel.value = titelNeu;
            const boxA = document.getElementById('edit-process-angebot-block');
            if (boxA) boxA.innerHTML = window.renderProcessAngebotBlock(proc, 'modal');
            // Fenster-Inhalte nachziehen (Schritte, Zuständige, Stand-Verlauf)
            if (quelle) {
                window.processSteps['edit-process'] = (felder.steps || []).map(s => ({ ...s }));
                if (typeof window.renderProcessSteps === 'function') window.renderProcessSteps('edit-process');
                window.processAssignedUsers['edit-process'] = [...(felder.assigned_users || [])];
                const hidden = document.getElementById('edit-process-assigned-users');
                if (hidden) hidden.value = JSON.stringify(window.processAssignedUsers['edit-process']);
                if (typeof renderProcessTechDropdown === 'function') renderProcessTechDropdown('edit-process');
                if (typeof window.renderProcessStatusHistory === 'function') window.renderProcessStatusHistory(proc);
                if (typeof window.updateProcessAttachButton === 'function') window.updateProcessAttachButton();
            }
            // Angebot schon erhalten/verloren -> Vorgang gleich auf „Erledigt"
            if (typeof window.vorgangStatusNachAngebot === 'function') await window.vorgangStatusNachAngebot(data);
            if (typeof window.fetchProcesses === 'function') window.fetchProcesses();
            if (typeof window.fetchAngebote === 'function' && document.getElementById('listen')?.classList.contains('active')) window.fetchAngebote(true);
            window.showToast(quelle ? `Angebot ${data.belegnummer} zusammengeführt — ein Vorgang.` : `Angebot ${data.belegnummer} verknüpft.`);
        };

        window.procAngebotFeld = async function (angebotId, feld, wert) {
            if (typeof window.angebotFeldSpeichern !== 'function') return;
            const felder = {};
            if (feld === 'status') {
                felder.status = (wert || '').trim() || null;
                // Gleiche Automatik wie in der Liste (updateAngebotStatus).
                const n = (felder.status || '').toLowerCase();
                if (n === 'auftrag erhalten') felder.realisierbar = 100;
                else if (n === 'auftrag verloren') felder.realisierbar = 0;
                else if (n === 'warten auf reaktion') felder.realisierbar = 5;
            } else {
                felder[feld] = angParse(wert);
            }
            const neu = await window.angebotFeldSpeichern(angebotId, felder);
            if (!neu) return;
            if (window.angeboteByProcess && neu.process_id) window.angeboteByProcess[String(neu.process_id)] = neu;
            // Auftrag erhalten/verloren -> Vorgang gleich erledigt (und zurück auf
            // offen, wenn der Status wieder etwas Offenes wird) — wie in der Angebotsliste.
            if (feld === 'status' && typeof window.vorgangStatusNachAngebot === 'function') await window.vorgangStatusNachAngebot(neu);
            if (typeof window.renderProcesses === 'function') window.renderProcesses();
            const box = document.getElementById('edit-process-angebot-block');
            const proc = neu.process_id && (window.eventsState.processes || []).find(p => String(p.id) === String(neu.process_id));
            if (box && proc && !document.getElementById('process-edit-modal')?.classList.contains('hidden')) {
                box.innerHTML = window.renderProcessAngebotBlock(proc, 'modal');
                // Status-Feld im offenen Fenster nachziehen, sonst schriebe
                // „Speichern" den alten Status gleich wieder zurück.
                const sel = document.getElementById('edit-process-status-select');
                if (sel && feld === 'status' && String(document.getElementById('edit-process-id')?.value) === String(proc.id)) {
                    sel.value = proc.status || 'offen';
                    window.syncProcessSelectDisplay('edit-process', 'status');
                }
            }
        };

        window.openProcessStatusUpdateModal = async function(id, event) {
            if (event) event.stopPropagation();
            let proc = (window.eventsState.processes || []).find(p => String(p.id) === String(id));
            // Aus der Angebotsliste heraus sind die Vorgänge evtl. noch nicht
            // geladen — einmal nachladen statt still nichts zu tun.
            if (!proc && typeof window.fetchProcesses === 'function') {
                await window.fetchProcesses();
                proc = (window.eventsState.processes || []).find(p => String(p.id) === String(id));
            }
            if (!proc) { window.showToast('Vorgang nicht gefunden.'); return; }
            window.statusUpdateProcessId = id;
            const sub = document.getElementById('status-update-modal-subtitle');
            if (sub) sub.textContent = proc.title || 'Vorgang';
            const ta = document.getElementById('status-update-text');
            if (ta) ta.value = '';
            const when = document.getElementById('status-update-when');
            if (when) when.value = window.isoToLocalInput(null);
            window.renderProcessStatusHistory(proc);
            const modal = document.getElementById('process-status-update-modal');
            if (!modal) return;
            modal.classList.remove('hidden');
            modal.style.display = 'flex';
            requestAnimationFrame(() => {
                modal.classList.add('show');
                if (ta) ta.focus();
            });
        };

        // E-Mail-Inhalt (internal_processes.description) ansehen und anpassen.
        // Öffnet sich über den leuchtenden Mail-Knopf in der Vorgangsliste;
        // das Fenster wird beim ersten Aufruf an <body> gehängt.
        window.openProcessMailModal = async function(id) {
            let proc = (window.eventsState.processes || []).find(p => String(p.id) === String(id));
            if (!proc && typeof window.fetchProcesses === 'function') {
                await window.fetchProcesses();
                proc = (window.eventsState.processes || []).find(p => String(p.id) === String(id));
            }
            if (!proc) { window.showToast('Vorgang nicht gefunden.'); return; }
            let modal = document.getElementById('process-mail-modal');
            if (!modal) {
                modal = document.createElement('div');
                modal.id = 'process-mail-modal';
                modal.className = 'modal-new hidden';
                modal.style.cssText = 'z-index:10002; display:none; position:fixed; top:0; left:0; width:100%; height:100%; align-items:center; justify-content:center; background:rgba(0,0,0,0.85); backdrop-filter:blur(15px); -webkit-backdrop-filter:blur(15px);';
                modal.innerHTML = `
                    <div class="modal-content glass-card" style="max-width:760px; width:94%; max-height:88vh; display:flex; flex-direction:column; overflow:hidden; padding:2rem; border:1px solid rgba(167,139,250,0.3); box-shadow:0 20px 50px rgba(0,0,0,0.5);">
                        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:14px; flex-shrink:0;">
                            <div style="min-width:0;">
                                <h2 style="margin:0; color:#fff; font-size:1.6rem; font-weight:800; display:flex; align-items:center; gap:10px;">
                                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"></rect><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"></path></svg>
                                    E-Mail Inhalt
                                </h2>
                                <div id="process-mail-modal-subtitle" style="color:rgba(255,255,255,0.45); font-size:0.9rem; margin-top:4px; word-break:break-word;"></div>
                            </div>
                            <button type="button" class="btn-close" onclick="window.closeProcessMailModal()" style="background:none; border:none; color:rgba(255,255,255,0.4); cursor:pointer; flex-shrink:0;">
                                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                            </button>
                        </div>
                        <textarea id="process-mail-modal-text" class="glass-input" spellcheck="false" style="flex:1; min-height:280px; max-height:60vh; resize:vertical; width:100%; box-sizing:border-box; font-size:0.9rem; line-height:1.5; white-space:pre-wrap; color:#fff;"></textarea>
                        <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:16px; flex-shrink:0;">
                            <button type="button" onclick="window.closeProcessMailModal()" style="padding:10px 18px; border-radius:10px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.16); color:rgba(255,255,255,0.8); font-weight:700; cursor:pointer;">Abbrechen</button>
                            <button type="button" id="process-mail-modal-save" onclick="window.saveProcessMailModal()" style="padding:10px 18px; border-radius:10px; background:rgba(167,139,250,0.25); border:1px solid rgba(167,139,250,0.7); color:#ddd6fe; font-weight:800; cursor:pointer;">Speichern</button>
                        </div>
                    </div>`;
                modal.addEventListener('click', (e) => { if (e.target === modal) window.closeProcessMailModal(); });
                document.body.appendChild(modal);
            }
            window.mailModalProcessId = id;
            document.getElementById('process-mail-modal-subtitle').textContent = proc.title || 'Vorgang';
            const ta = document.getElementById('process-mail-modal-text');
            ta.value = proc.description || '';
            modal.classList.remove('hidden');
            modal.style.display = 'flex';
            requestAnimationFrame(() => { modal.classList.add('show'); ta.focus(); });
        };

        window.closeProcessMailModal = function() {
            const modal = document.getElementById('process-mail-modal');
            if (!modal) return;
            modal.classList.remove('show');
            setTimeout(() => { modal.classList.add('hidden'); modal.style.display = 'none'; }, 300);
        };

        window.saveProcessMailModal = async function() {
            const id = window.mailModalProcessId;
            const proc = (window.eventsState.processes || []).find(p => String(p.id) === String(id));
            const ta = document.getElementById('process-mail-modal-text');
            if (!proc || !ta) return;
            const text = ta.value;
            if (text === (proc.description || '')) { window.closeProcessMailModal(); return; }
            const btn = document.getElementById('process-mail-modal-save');
            if (btn) btn.disabled = true;
            try {
                const { error } = await window.supabaseClient
                    .from('internal_processes')
                    .update({ description: text })
                    .eq('id', proc.id);
                if (error) throw error;
                proc.description = text;
                if (typeof window.angeboteNachVorgangAktualisieren === 'function') window.angeboteNachVorgangAktualisieren(proc);
                if (typeof window.renderProcesses === 'function') window.renderProcesses();
                window.showToast && window.showToast('E-Mail Inhalt gespeichert.');
                window.closeProcessMailModal();
            } catch (err) {
                console.error('E-Mail Inhalt speichern fehlgeschlagen:', err);
                window.showToast && window.showToast('Speichern fehlgeschlagen: ' + (err.message || err));
            } finally {
                if (btn) btn.disabled = false;
            }
        };

        window.closeProcessStatusUpdateModal = function() {
            const modal = document.getElementById('process-status-update-modal');
            if (!modal) return;
            modal.classList.remove('show');
            setTimeout(() => { modal.classList.add('hidden'); modal.style.display = 'none'; if (typeof window.processesRefetchIfPending === 'function') window.processesRefetchIfPending(); }, 300);
        };

        // Zeichnet den Stand-Verlauf in alle vorhandenen Behälter: das eigene
        // Stand-Fenster und den Abschnitt „Bemerkung / Notiz" im Bearbeiten-Fenster.
        window.renderProcessStatusHistory = function(proc) {
            const boxes = ['status-update-history', 'edit-process-status-history']
                .map(id => document.getElementById(id))
                .filter(Boolean);
            if (!boxes.length) return;
            const list = Array.isArray(proc.status_updates) ? proc.status_updates : [];
            if (!list.length) {
                boxes.forEach(b => { b.innerHTML = `<div style="color:rgba(255,255,255,0.3); font-style:italic; font-size:0.85rem; padding:4px 2px;">Noch kein Stand eingetragen.</div>`; });
                return;
            }
            const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const html = list.map((u, i) => `
                <div style="padding:10px 12px; border-radius:10px; background:${i === 0 ? 'rgba(96,165,250,0.12)' : 'rgba(255,255,255,0.04)'}; border:1px solid ${i === 0 ? 'rgba(96,165,250,0.35)' : 'rgba(255,255,255,0.08)'};">
                    <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px; flex-wrap:wrap;">
                        <input type="datetime-local" value="${window.isoToLocalInput(u.at)}" onchange="window.updateProcessStatusUpdateDate(${i}, this.value)" onclick="try{this.showPicker()}catch(e){}" title="Zeitpunkt ändern — klicken zum Ändern" style="background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.12); color:#fff; color-scheme:dark; border-radius:8px; padding:4px 8px; font-size:0.78rem; cursor:pointer;">
                        <span style="font-size:0.75rem; color:rgba(255,255,255,0.5);">${esc(u.by || 'Unbekannt')}</span>
                        <button type="button" class="delete-permission-required" onclick="window.deleteProcessStatusUpdate(${i})" title="Eintrag löschen" style="margin-left:auto; background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.3); color:#ef4444; border-radius:8px; width:26px; height:26px; cursor:pointer; display:inline-flex; align-items:center; justify-content:center;">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path></svg>
                        </button>
                    </div>
                    <div contenteditable="true" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault(); this.blur();}" onfocus="this.style.background='rgba(255,255,255,0.08)'" onblur="this.style.background='transparent'; window.updateProcessStatusUpdateText(${i}, this.textContent)" title="Klicken zum Bearbeiten" style="color:#fff; font-size:0.9rem; white-space:pre-wrap; word-break:break-word; outline:none; border-radius:4px; padding:2px 4px; cursor:text;">${esc(u.text)}</div>
                </div>`).join('');
            boxes.forEach(b => { b.innerHTML = html; });
        };

        window.formatProcessStatusStamp = function(iso) {
            try {
                const d = new Date(iso);
                if (isNaN(d)) return '';
                return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
                    + ', ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + ' Uhr';
            } catch (e) { return ''; }
        };

        // Verlauf speichern; die Karten zeichnet der Aufrufer neu.
        async function persistStatusUpdates(proc, list) {
            const { error } = await window.supabaseClient
                .from('internal_processes')
                .update({ status_updates: list })
                .eq('id', proc.id);
            if (error) throw error;
            proc.status_updates = list;
            // Angebotsliste sofort nachziehen (Angebot = Vorgang) — nicht erst,
            // wenn fetchProcesses alle Vorgänge neu geladen hat.
            if (typeof window.angeboteNachVorgangAktualisieren === 'function') window.angeboteNachVorgangAktualisieren(proc);
            if (typeof window.renderProcesses === 'function') window.renderProcesses();
        }

        function currentStatusProcess() {
            const id = window.statusUpdateProcessId;
            if (!id) return null;
            return (window.eventsState.processes || []).find(p => String(p.id) === String(id)) || null;
        }

        // Im Fenster lassen sich alte Einträge direkt bearbeiten; die
        // speichern für sich beim Verlassen des Feldes. Ein Klick auf
        // „Speichern" löst dieses Verlassen erst aus — deshalb hier erst
        // abwarten, sonst schriebe das Speichern gleich darauf den alten
        // Stand zurück.
        let pendingStatusEdit = Promise.resolve();

        async function commitPendingStatusEdit() {
            const active = document.activeElement;
            if (active && active.isContentEditable &&
                active.closest('#status-update-history, #edit-process-status-history')) {
                active.blur();
            }
            try { await pendingStatusEdit; } catch (e) { /* Fehler meldet der Aufrufer schon */ }
        }

        window.saveProcessStatusUpdate = async function() {
            const proc = currentStatusProcess();
            if (!proc) return;

            await commitPendingStatusEdit();

            const ta = document.getElementById('status-update-text');
            const text = (ta ? ta.value : '').trim();
            if (!text) {
                // Kein neuer Text — das ist kein Fehler: wer nur einen alten
                // Eintrag bearbeitet hat, ist damit fertig, der ist längst
                // gespeichert. Nur wenn es überhaupt noch keinen Stand gibt,
                // ist das Feld tatsächlich Pflicht.
                const hasEntries = Array.isArray(proc.status_updates) && proc.status_updates.length > 0;
                if (!hasEntries) { window.showToast('Bitte einen Stand eingeben.'); return; }
                window.closeProcessStatusUpdateModal();
                window.fetchProcesses();
                return;
            }
            const when = document.getElementById('status-update-when');
            const at = window.localInputToIso(when ? when.value : '') || new Date().toISOString();
            const list = (Array.isArray(proc.status_updates) ? proc.status_updates.slice() : []);
            list.unshift({
                text: text,
                by: (window.activeUser && window.activeUser.name) || 'Unbekannt',
                by_id: (window.activeUser && window.activeUser.id) || null,
                at: at
            });
            list.sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));
            try {
                await persistStatusUpdates(proc, list);
                window.closeProcessStatusUpdateModal();
                window.fetchProcesses();
            } catch (e) {
                console.error('Fehler beim Speichern des Stands:', e);
                window.showToast('Fehler beim Speichern: ' + e.message);
            }
        };

        // Zeitpunkt eines bestehenden Eintrags nachträglich ändern.
        window.updateProcessStatusUpdateDate = async function(index, value) {
            const proc = currentStatusProcess();
            if (!proc || !Array.isArray(proc.status_updates) || !proc.status_updates[index]) return;
            const iso = window.localInputToIso(value);
            if (!iso) return;
            const list = proc.status_updates.slice();
            list[index] = Object.assign({}, list[index], { at: iso });
            list.sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));
            try {
                await persistStatusUpdates(proc, list);
                window.renderProcessStatusHistory(proc);
                window.renderProcesses();
            } catch (e) {
                console.error('Fehler beim Ändern des Zeitpunkts:', e);
                window.showToast('Fehler beim Speichern: ' + e.message);
            }
        };

        // Der Merker oben wartet auf genau diesen Schreibvorgang.
        window.updateProcessStatusUpdateText = function(index, text) {
            pendingStatusEdit = doUpdateStatusText(index, text);
            return pendingStatusEdit;
        };

        async function doUpdateStatusText(index, text) {
            const proc = currentStatusProcess();
            if (!proc || !Array.isArray(proc.status_updates) || !proc.status_updates[index]) return;
            const val = (text || '').trim();
            if (!val || proc.status_updates[index].text === val) return;
            const list = proc.status_updates.slice();
            list[index] = Object.assign({}, list[index], { text: val });
            try {
                await persistStatusUpdates(proc, list);
                window.renderProcesses();
            } catch (e) {
                console.error('Fehler beim Ändern des Stands:', e);
                window.showToast('Fehler beim Speichern: ' + e.message);
            }
        }

        // Löschen: nur mit Löschberechtigung, und der Eintrag verschwindet
        // sofort aus der Datenbank (die gekürzte Liste wird geschrieben) —
        // nicht erst beim Speichern irgendeines Formulars.
        window.deleteProcessStatusUpdate = async function(index) {
            if (typeof window.canDelete === 'function' && !window.canDelete('Stand-Einträgen')) return;
            const proc = currentStatusProcess();
            if (!proc || !Array.isArray(proc.status_updates) || !proc.status_updates[index]) return;
            if (!confirm('Diesen Stand-Eintrag unwiderruflich löschen?')) return;
            const list = proc.status_updates.slice();
            list.splice(index, 1);
            try {
                await persistStatusUpdates(proc, list);
                window.renderProcessStatusHistory(proc);
                window.renderProcesses();
            } catch (e) {
                console.error('Fehler beim Löschen des Eintrags:', e);
                window.showToast('Fehler beim Löschen: ' + e.message);
            }
        };

        // ------------------------------------------
        // Abschnitt „Bemerkung / Notiz" im Bearbeiten-Fenster: aufklappbar,
        // enthält die Bemerkung und den Stand-Verlauf.
        // ------------------------------------------
        window.setProcessNoteSectionOpen = function(open) {
            const body = document.getElementById('edit-process-note-body');
            const toggle = document.getElementById('edit-process-note-toggle');
            if (!body || !toggle) return;
            body.hidden = !open;
            toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        };

        window.toggleProcessNoteSection = function() {
            const toggle = document.getElementById('edit-process-note-toggle');
            if (!toggle) return;
            window.setProcessNoteSectionOpen(toggle.getAttribute('aria-expanded') !== 'true');
        };

        // Kurzhinweis in der Kopfzeile, damit man auch eingeklappt sieht,
        // dass etwas hinterlegt ist.
        window.updateProcessNoteHint = function(proc) {
            const hint = document.getElementById('edit-process-note-hint');
            if (!hint) return;
            // Nur noch die Bemerkung — der Stand steht jetzt sichtbar
            // darunter und braucht keinen Hinweis in der Kopfzeile.
            hint.textContent = (proc && proc.remark && String(proc.remark).trim())
                ? 'hinterlegt' : '';
        };

        window.addProcessStatusFromEdit = async function() {
            const proc = currentStatusProcess();
            if (!proc) return;
            const ta = document.getElementById('edit-process-status-text');
            const text = (ta ? ta.value : '').trim();
            if (!text) { window.showToast('Bitte einen Stand eingeben.'); return; }
            const list = (Array.isArray(proc.status_updates) ? proc.status_updates.slice() : []);
            list.unshift({
                text: text,
                by: (window.activeUser && window.activeUser.name) || 'Unbekannt',
                by_id: (window.activeUser && window.activeUser.id) || null,
                at: new Date().toISOString()
            });
            list.sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));
            try {
                await persistStatusUpdates(proc, list);
                if (ta) ta.value = '';
                window.renderProcessStatusHistory(proc);
                window.updateProcessNoteHint(proc);
                window.renderProcesses();
            } catch (e) {
                console.error('Fehler beim Speichern des Stands:', e);
                window.showToast('Fehler beim Speichern: ' + e.message);
            }
        };

        // ------------------------------------------
        // Dasselbe direkt auf der Karte (Hover-Popover) — dort ist kein
        // Fenster offen, deshalb kommt die Vorgangs-Kennung als Parameter.
        // ------------------------------------------
        function procById(processId) {
            return (window.eventsState.processes || []).find(p => String(p.id) === String(processId)) || null;
        }

        window.updateProcessCardStand = async function(processId, index, text) {
            const proc = procById(processId);
            if (!proc || !Array.isArray(proc.status_updates) || !proc.status_updates[index]) return;
            const val = (text || '').trim();
            if (!val || proc.status_updates[index].text === val) return;
            const list = proc.status_updates.slice();
            list[index] = Object.assign({}, list[index], { text: val });
            try {
                await persistStatusUpdates(proc, list);
            } catch (e) {
                console.error('Fehler beim Ändern des Stands:', e);
                window.showToast('Fehler beim Speichern: ' + e.message);
            }
        };

        window.updateProcessCardStandDate = async function(processId, index, value) {
            const proc = procById(processId);
            if (!proc || !Array.isArray(proc.status_updates) || !proc.status_updates[index]) return;
            const iso = window.localInputToIso(value);
            if (!iso) return;
            const list = proc.status_updates.slice();
            list[index] = Object.assign({}, list[index], { at: iso });
            list.sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));
            try {
                await persistStatusUpdates(proc, list);
                window.renderProcesses();
            } catch (e) {
                console.error('Fehler beim Ändern des Zeitpunkts:', e);
                window.showToast('Fehler beim Speichern: ' + e.message);
            }
        };

        window.deleteProcessCardStand = async function(processId, index) {
            if (typeof window.canDelete === 'function' && !window.canDelete('Stand-Einträgen')) return;
            const proc = procById(processId);
            if (!proc || !Array.isArray(proc.status_updates) || !proc.status_updates[index]) return;
            if (!confirm('Diesen Stand-Eintrag unwiderruflich löschen?')) return;
            const list = proc.status_updates.slice();
            list.splice(index, 1);
            try {
                await persistStatusUpdates(proc, list);
                window.renderProcesses();
            } catch (e) {
                console.error('Fehler beim Löschen des Eintrags:', e);
                window.showToast('Fehler beim Löschen: ' + e.message);
            }
        };

        // ------------------------------------------
        // ERINNERUNG DIREKT AUF DER KARTE
        // ------------------------------------------
        // Vorschlag für Karten ohne Erinnerung: morgen, 8 Uhr.
        window.defaultRemindInputValue = function() {
            const d = new Date();
            d.setDate(d.getDate() + 1);
            d.setHours(8, 0, 0, 0);
            return window.isoToLocalInput(d.toISOString());
        };

        window.setProcessRemind = async function(processId, value) {
            const proc = procById(processId);
            if (!proc) return;
            const iso = window.localInputToIso(value);
            if (!iso) return;
            try {
                const { error } = await window.supabaseClient
                    .from('internal_processes')
                    .update({ remind_at: iso })
                    .eq('id', processId);
                if (error) throw error;
                proc.remind_at = iso;
                window.renderProcesses();
                if (typeof window.angebotErinnerungNachVorgang === 'function') window.angebotErinnerungNachVorgang(proc);
                window.showToast('Erinnerung gesetzt: ' + window.formatProcessStatusStamp(iso));
            } catch (e) {
                console.error('Fehler beim Setzen der Erinnerung:', e);
                window.showToast('Fehler beim Speichern: ' + e.message);
            }
        };

        // Klick auf das Erinnerungs-Abzeichen der Karte: kleines Fenster mit
        // denselben Möglichkeiten wie im Bearbeiten-Dialog — Schnellwahl UND
        // ein sichtbares Feld, in das man Datum und Uhrzeit selbst schreibt.
        // Vorher lag nur ein unsichtbares datetime-local über dem Abzeichen;
        // damit gab es weder „morgen" noch eine erkennbare Eingabe.
        window.openProcessRemindPicker = function(processId, ev) {
            if (ev) ev.stopPropagation();
            const proc = procById(processId);
            const alt = document.getElementById('proc-remind-pop');
            if (alt) alt.remove();

            const gesetzt = proc && proc.remind_at;
            const start = gesetzt ? window.isoToLocalInput(proc.remind_at) : window.defaultRemindInputValue();

            const pop = document.createElement('div');
            pop.id = 'proc-remind-pop';
            pop.style.cssText = 'position: fixed; z-index: 100000; width: 290px; background: rgba(15,23,42,0.98); border: 1px solid rgba(251,191,36,0.35); border-radius: 14px; padding: 14px; box-shadow: 0 20px 60px rgba(0,0,0,0.65); color: #fff; font-family: inherit;';
            pop.innerHTML = `
                <div style="display:flex; align-items:center; gap:8px; margin-bottom:10px;">
                    <div style="flex:1; font-size:0.72rem; font-weight:800; color:#fbbf24; text-transform:uppercase; letter-spacing:0.6px;">Erinnerung</div>
                    <button type="button" id="proc-remind-pop-cancel" title="Abbrechen" style="flex:0 0 auto; width:26px; height:26px; display:inline-flex; align-items:center; justify-content:center; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.16); color:rgba(255,255,255,0.7); border-radius:8px; cursor:pointer; padding:0;">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>
                <div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:10px;">
                    <button type="button" data-tage="0" class="proc-remind-quick">Heute</button>
                    <button type="button" data-tage="1" class="proc-remind-quick">Morgen</button>
                    <button type="button" data-tage="3" class="proc-remind-quick">In 3 Tagen</button>
                    <button type="button" data-tage="7" class="proc-remind-quick">In 1 Woche</button>
                </div>
                <input type="datetime-local" id="proc-remind-pop-input" value="${start}" style="width:100%; box-sizing:border-box; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.18); color:#fff; color-scheme:dark; border-radius:10px; padding:9px 10px; font-size:0.9rem;">
                <div style="display:flex; align-items:center; justify-content:space-between; gap:6px; margin-top:12px;">
                    ${gesetzt ? `<button type="button" id="proc-remind-pop-del" class="delete-permission-required" title="Erinnerung löschen" style="width:38px; height:38px; display:inline-flex; align-items:center; justify-content:center; background:rgba(239,68,68,0.12); border:1px solid rgba(239,68,68,0.4); color:#f87171; border-radius:10px; cursor:pointer; padding:0;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"></path></svg>
                    </button>` : '<span></span>'}
                    <button type="button" id="proc-remind-pop-ok" title="Speichern" style="width:38px; height:38px; display:inline-flex; align-items:center; justify-content:center; background:rgba(251,191,36,0.2); border:1px solid rgba(251,191,36,0.6); color:#fde68a; border-radius:10px; cursor:pointer; padding:0;">
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    </button>
                </div>`;
            document.body.appendChild(pop);

            pop.querySelectorAll('.proc-remind-quick').forEach(b => {
                b.style.cssText = 'flex:1 1 calc(50% - 3px); background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.16); color:rgba(255,255,255,0.8); border-radius:10px; padding:7px 8px; font-size:0.8rem; font-weight:700; cursor:pointer; white-space:nowrap;';
                b.addEventListener('click', () => {
                    const d = new Date();
                    d.setDate(d.getDate() + parseInt(b.dataset.tage, 10));
                    d.setHours(8, 0, 0, 0);
                    pop.querySelector('#proc-remind-pop-input').value = window.isoToLocalInput(d.toISOString());
                });
            });

            // Am angeklickten Abzeichen ausrichten, aber im Fenster halten.
            const anker = ev && ev.currentTarget && ev.currentTarget.getBoundingClientRect
                ? ev.currentTarget.getBoundingClientRect()
                : { left: (window.innerWidth / 2) - 145, bottom: window.innerHeight / 2, top: window.innerHeight / 2 };
            const breite = pop.offsetWidth, hoehe = pop.offsetHeight;
            let links = Math.min(Math.max(8, anker.left), window.innerWidth - breite - 8);
            let oben = anker.bottom + 6;
            if (oben + hoehe > window.innerHeight - 8) oben = Math.max(8, anker.top - hoehe - 6);
            pop.style.left = links + 'px';
            pop.style.top = oben + 'px';

            const zu = () => {
                pop.remove();
                document.removeEventListener('mousedown', beiKlick, true);
                document.removeEventListener('keydown', beiTaste, true);
            };
            const beiKlick = (e) => { if (!pop.contains(e.target)) zu(); };
            const beiTaste = (e) => { if (e.key === 'Escape') zu(); };
            setTimeout(() => {
                document.addEventListener('mousedown', beiKlick, true);
                document.addEventListener('keydown', beiTaste, true);
            }, 0);

            pop.querySelector('#proc-remind-pop-cancel').addEventListener('click', zu);
            pop.querySelector('#proc-remind-pop-ok').addEventListener('click', () => {
                const wert = pop.querySelector('#proc-remind-pop-input').value;
                if (!wert) { window.showToast('Bitte Datum und Uhrzeit eintragen.'); return; }
                zu();
                window.setProcessRemind(processId, wert);
            });
            const del = pop.querySelector('#proc-remind-pop-del');
            if (del) del.addEventListener('click', () => { zu(); window.clearProcessRemind(processId); });
        };

        window.clearProcessRemind = async function(processId) {
            if (typeof window.canDelete === 'function' && !window.canDelete('Erinnerungen')) return;
            const proc = procById(processId);
            if (!proc) return;
            try {
                const { error } = await window.supabaseClient
                    .from('internal_processes')
                    .update({ remind_at: null })
                    .eq('id', processId);
                if (error) throw error;
                proc.remind_at = null;
                window.renderProcesses();
                if (typeof window.angebotErinnerungNachVorgang === 'function') window.angebotErinnerungNachVorgang(proc);
            } catch (e) {
                console.error('Fehler beim Entfernen der Erinnerung:', e);
                window.showToast('Fehler beim Speichern: ' + e.message);
            }
        };

        // ==========================================
        // ADRESSE + ANSPRECHPARTNER IM VORGANG (add / edit)
        // Suche über alle Adressen (Name / PLZ / Ort). Ist eine Adresse gewählt,
        // wird der Vorgang an ihr gespeichert (customer_id) und ihre
        // Ansprechpartner – inkl. verknüpfter Adressen – zur Auswahl angeboten.
        // ==========================================
        window.processAddressCache = null;   // [{id,name,zip_code,city,matchcode}]
        window.processContactCache = {};      // prefix -> [contacts]

        // Nutzt den gemeinsamen Kunden-Cache (js/lookup-cache.js): dieselbe Liste
        // wie die Suchfelder der Maschine, einmal geladen, per Realtime aktuell.
        async function ensureProcessAddresses() {
            try {
                window.processAddressCache = await window.customerCacheGet();
            } catch (e) {
                console.warn('Adressen für Vorgang konnten nicht geladen werden:', e);
                window.processAddressCache = window.processAddressCache || [];
            }
            return window.processAddressCache;
        }

        window.showProcessAddressDropdown = async function(prefix) {
            await ensureProcessAddresses();
            const input = document.getElementById(`${prefix}-address-search`);
            window.filterProcessAddressDropdown(prefix, input ? input.value : '');
        };

        window.filterProcessAddressDropdown = function(prefix, q) {
            const box = document.getElementById(`${prefix}-address-suggestions`);
            if (!box) return;
            // Vorbereiteter Suchindex aus js/lookup-cache.js (alle Wörter müssen vorkommen)
            const res = typeof window.customerCacheSearchSync === 'function'
                ? window.customerCacheSearchSync(q, 40)
                : (window.processAddressCache || []).slice(0, 40);
            if (!res.length) {
                box.innerHTML = `<div style="padding:10px 12px; color:rgba(255,255,255,0.4); font-size:0.85rem;">Keine Adresse gefunden</div>`;
                box.style.display = 'block';
                return;
            }
            box.innerHTML = res.map(a => {
                const sub = [a.zip_code, a.city].filter(Boolean).join(' ');
                return `<div onclick="window.selectProcessAddress('${prefix}', '${a.id}')" style="padding:9px 12px; cursor:pointer; border-radius:8px;" onmouseover="this.style.background='rgba(255,255,255,0.08)'" onmouseout="this.style.background='transparent'">
                    <div style="color:#fff; font-weight:600; font-size:0.9rem;">${escStepAttr(a.name || '—')}</div>
                    ${(sub || a.matchcode) ? `<div style="color:rgba(255,255,255,0.45); font-size:0.78rem;">${escStepAttr(sub)}${a.matchcode ? (sub ? ' · ' : '') + escStepAttr(a.matchcode) : ''}</div>` : ''}
                </div>`;
            }).join('');
            box.style.display = 'block';
        };

        window.selectProcessAddress = async function(prefix, id) {
            const a = (window.processAddressCache || []).find(x => String(x.id) === String(id));
            if (!a) return;
            zeigeProcessAddressBanner(prefix, a, a.name);
            const hidden = document.getElementById(`${prefix}-customer-id`);
            if (hidden) hidden.value = a.id;
            const input = document.getElementById(`${prefix}-address-search`);
            if (input) {
                const sub = [a.zip_code, a.city].filter(Boolean).join(' ');
                input.value = a.name + (sub ? ' · ' + sub : '');
                input.style.color = 'var(--color-primary-green)';
            }
            const box = document.getElementById(`${prefix}-address-suggestions`);
            if (box) box.style.display = 'none';
            // Ansprechpartner der Adresse (und verknüpfter Adressen) laden.
            window.selectProcessContact(prefix, '');
            await loadProcessContacts(prefix, a.id);
            if (prefix === 'process-add') window.zeigeVorhandeneVorgaenge(a.id);
        };

        // Neue Adresse direkt aus dem Vorgang-Dialog anlegen (inkl. .vcf-Import).
        // Nach dem Speichern wird die Adresse hier übernommen und ausgewählt.
        window.openProcessAddressCreate = function(prefix) {
            if (typeof window.openAddressForm !== 'function') {
                window.showToast && window.showToast('Adressformular nicht verfügbar.');
                return;
            }
            window._addressCreateCallback = async (addr) => {
                if (!addr) return;
                if (!window.processAddressCache) window.processAddressCache = [];
                const entry = {
                    id: addr.id, name: addr.name || 'Adresse',
                    zip_code: addr.zip_code || '', city: addr.city || '',
                    matchcode: addr.matchcode || ''
                };
                const idx = window.processAddressCache.findIndex(x => String(x.id) === String(addr.id));
                if (idx >= 0) window.processAddressCache[idx] = entry;
                else window.processAddressCache.push(entry);
                await window.selectProcessAddress(prefix, addr.id);
            };
            window.openAddressForm();
        };

        // Adresse wieder entfernen (leert Suche + Ansprechpartner).
        // ----------------------------------------------------------
        // „Vorgang erstellen": gibt es zu dieser Adresse schon offene
        // Vorgänge? Dann stehen sie unter der Adresse mit „Weiterbearbeiten" —
        // lieber den vorhandenen fortführen als einen zweiten anlegen.
        // Quelle: geladene Vorgangsliste; ist sie noch nicht da, eine schlanke
        // Abfrage nur für diese Adresse (keine Schritte/Anhänge).
        // ----------------------------------------------------------
        window.zeigeVorhandeneVorgaenge = async function (customerId) {
            const box = document.getElementById('process-add-vorhandene');
            if (!box) return;
            if (!customerId) { box.style.display = 'none'; box.innerHTML = ''; return; }
            let liste = (window.eventsState && Array.isArray(window.eventsState.processes) && window.eventsState.processes.length)
                ? window.eventsState.processes.filter(p => String(p.customer_id) === String(customerId))
                : null;
            if (!liste && window.supabaseClient) {
                try {
                    const { data } = await window.supabaseClient
                        .from('internal_processes')
                        .select('id, title, status, process_date, process_type, customer_id')
                        .eq('customer_id', customerId)
                        .order('process_date', { ascending: false })
                        .limit(30);
                    liste = data || [];
                } catch (e) { liste = []; }
            }
            liste = (liste || []).filter(p => p.status !== 'erledigt').slice(0, 8);
            if (!liste.length) { box.style.display = 'none'; box.innerHTML = ''; return; }
            const info = window.PROCESS_STATUS_INFO || {};
            const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
            box.innerHTML = `
                <div class="proc-vorhandene-kopf">
                    <span>Zu dieser Adresse gibt es bereits ${liste.length === 1 ? 'einen offenen Vorgang' : liste.length + ' offene Vorgänge'}</span>
                    <span class="proc-vorhandene-hinweis">Lieber weiterbearbeiten statt doppelt anlegen</span>
                </div>
                ${liste.map(p => {
                    const st = info[p.status] || { label: p.status || '–', color: 'rgba(255,255,255,0.4)' };
                    const datum = p.process_date ? new Date(p.process_date).toLocaleDateString('de-DE') : '';
                    return `<div class="proc-vorhandene-zeile">
                        <span class="proc-vorhandene-punkt" style="background:${st.color}"></span>
                        <span class="proc-vorhandene-titel" title="${esc(p.title)}">${esc(p.title || 'Vorgang')}</span>
                        <span class="proc-vorhandene-meta">${esc(st.label)}${datum ? ' · ' + datum : ''}</span>
                        <button type="button" class="proc-vorhandene-btn" onclick="window.vorhandenenVorgangOeffnen('${esc(p.id)}')">Weiterbearbeiten</button>
                    </div>`;
                }).join('')}`;
            box.style.display = 'block';
        };
        window.vorhandenenVorgangOeffnen = function (id) {
            // Ungespeichertes im Anlegen-Fenster verwerfen — es wurde nichts eingetragen,
            // was den vorhandenen Vorgang ersetzen soll.
            if (typeof window.closeProcessAddModal === 'function') window.closeProcessAddModal();
            if (typeof window.openEditProcessModal === 'function') window.openEditProcessModal(id);
        };

        window.clearProcessAddress = function(prefix) {
            if (prefix === 'process-add') window.zeigeVorhandeneVorgaenge(null);
            zeigeProcessAddressBanner(prefix, null, '');
            const hidden = document.getElementById(`${prefix}-customer-id`);
            if (hidden) hidden.value = '';
            const input = document.getElementById(`${prefix}-address-search`);
            if (input) { input.value = ''; input.style.color = ''; }
            window.processContactCache[prefix] = [];
            window.selectProcessContact(prefix, '');
            const grp = document.getElementById(`${prefix}-contact-group`);
            if (grp) grp.style.display = 'none';
        };

        async function loadProcessContacts(prefix, customerId) {
            let ids = [customerId];
            try {
                const { data: links } = await window.supabaseClient
                    .from('customer_links')
                    .select('customer_id, linked_customer_id')
                    .or(`customer_id.eq.${customerId},linked_customer_id.eq.${customerId}`);
                (links || []).forEach(l => { ids.push(l.customer_id); ids.push(l.linked_customer_id); });
            } catch (e) { /* Verknüpfungen optional */ }
            ids = [...new Set(ids.map(String))];
            let contacts = [];
            try {
                const { data, error } = await window.supabaseClient
                    .from('customer_contacts')
                    .select('*')
                    .in('customer_id', ids);
                if (error) throw error;
                contacts = data || [];
            } catch (e) {
                console.warn('Ansprechpartner konnten nicht geladen werden:', e);
            }
            window.processContactCache[prefix] = contacts;
            const grp = document.getElementById(`${prefix}-contact-group`);
            if (grp) grp.style.display = '';
            renderProcessContactMenu(prefix);
        }

        window.toggleProcessContactDropdown = function(prefix) {
            const box = document.getElementById(`${prefix}-contact-suggestions`);
            if (!box) return;
            const open = box.style.display !== 'none';
            document.querySelectorAll('.proc-contact-suggestions').forEach(b => b.style.display = 'none');
            if (!open) { renderProcessContactMenu(prefix); box.style.display = 'block'; }
        };

        function renderProcessContactMenu(prefix) {
            const box = document.getElementById(`${prefix}-contact-suggestions`);
            if (!box) return;
            const contacts = window.processContactCache[prefix] || [];
            const curEl = document.getElementById(`${prefix}-contact-name`);
            const cur = curEl ? curEl.value : '';
            let html = `<div onclick="window.selectProcessContact('${prefix}', '')" style="padding:9px 12px; cursor:pointer; border-radius:8px; color:rgba(255,255,255,0.6);" onmouseover="this.style.background='rgba(255,255,255,0.08)'" onmouseout="this.style.background='transparent'">— Kein Ansprechpartner —</div>`;
            html += contacts.map(c => {
                const label = [c.salutation, c.name].filter(Boolean).join(' ');
                const sub = [c.position, c.department].filter(Boolean).join(' · ');
                const active = c.name === cur;
                return `<div onclick="window.selectProcessContact('${prefix}', '${escStepAttr(c.name)}')" style="padding:9px 12px; cursor:pointer; border-radius:8px; ${active ? 'background:rgba(16,185,129,0.12);' : ''}" onmouseover="this.style.background='rgba(255,255,255,0.08)'" onmouseout="this.style.background='${active ? 'rgba(16,185,129,0.12)' : 'transparent'}'">
                    <div style="color:#fff; font-weight:600; font-size:0.9rem;">${escStepAttr(label || c.name)}</div>
                    ${sub ? `<div style="color:rgba(255,255,255,0.45); font-size:0.78rem;">${escStepAttr(sub)}</div>` : ''}
                </div>`;
            }).join('');
            if (!contacts.length) html += `<div style="padding:8px 12px; color:rgba(255,255,255,0.35); font-size:0.8rem;">Keine Ansprechpartner hinterlegt</div>`;
            box.innerHTML = html;
        }

        window.selectProcessContact = function(prefix, name) {
            const hidden = document.getElementById(`${prefix}-contact-name`);
            if (hidden) hidden.value = name || '';
            const txt = document.getElementById(`${prefix}-contact-text`);
            if (txt) {
                txt.textContent = name || 'Ansprechpartner wählen...';
                txt.style.color = name ? '#fff' : 'rgba(255,255,255,0.4)';
            }
            const box = document.getElementById(`${prefix}-contact-suggestions`);
            if (box) box.style.display = 'none';
        };

        // Adress-/Ansprechpartner-Felder für ein Modal zurücksetzen.
        // Großes Adress-Banner oben im Bearbeiten-Fenster: zeigt sofort, um wen es geht.
        // Nur für 'edit-process' vorhanden; `a` = Eintrag aus processAddressCache, `name` = Fallback.
        function zeigeProcessAddressBanner(prefix, a, name) {
            if (prefix !== 'edit-process') return;
            const banner = document.getElementById('edit-process-address-banner');
            const label = document.getElementById('edit-process-address-name');
            if (!banner || !label) return;
            const n = (a && a.name) || name || '';
            if (!n) { banner.style.display = 'none'; label.textContent = '-'; return; }
            const sub = a ? [a.zip_code, a.city].filter(Boolean).join(' ') : '';
            label.textContent = n + (sub ? ' · ' + sub : '');
            banner.style.display = '';
        }

        window.resetProcessAddressFields = function(prefix) {
            zeigeProcessAddressBanner(prefix, null, '');
            const hidden = document.getElementById(`${prefix}-customer-id`);
            if (hidden) hidden.value = '';
            const input = document.getElementById(`${prefix}-address-search`);
            if (input) { input.value = ''; input.style.color = ''; }
            const sugg = document.getElementById(`${prefix}-address-suggestions`);
            if (sugg) sugg.style.display = 'none';
            window.processContactCache[prefix] = [];
            window.selectProcessContact(prefix, '');
            const grp = document.getElementById(`${prefix}-contact-group`);
            if (grp) grp.style.display = 'none';
        };

        // Adress-/Ansprechpartner-Felder aus einem bestehenden Vorgang befüllen.
        window.prefillProcessAddressFields = async function(prefix, proc) {
            window.resetProcessAddressFields(prefix);
            if (!proc || !proc.customer_id) return;
            await ensureProcessAddresses();
            const hidden = document.getElementById(`${prefix}-customer-id`);
            if (hidden) hidden.value = proc.customer_id;
            const input = document.getElementById(`${prefix}-address-search`);
            const a = (window.processAddressCache || []).find(x => String(x.id) === String(proc.customer_id));
            const name = (proc.customers && proc.customers.name) || (a && a.name) || 'Adresse';
            zeigeProcessAddressBanner(prefix, a, name);
            if (input) {
                const sub = a ? [a.zip_code, a.city].filter(Boolean).join(' ') : '';
                input.value = name + (sub ? ' · ' + sub : '');
                input.style.color = 'var(--color-primary-green)';
            }
            await loadProcessContacts(prefix, proc.customer_id);
            if (proc.contact_name) window.selectProcessContact(prefix, proc.contact_name);
        };

        // Suggestion-Listen bei Klick außerhalb schließen.
        document.addEventListener('click', function(e) {
            ['process-add', 'edit-process'].forEach(prefix => {
                const addrBox = document.getElementById(`${prefix}-address-suggestions`);
                const addrInput = document.getElementById(`${prefix}-address-search`);
                if (addrBox && addrBox.style.display !== 'none' && !addrBox.contains(e.target) && e.target !== addrInput) {
                    addrBox.style.display = 'none';
                }
                const contBox = document.getElementById(`${prefix}-contact-suggestions`);
                const contTrig = document.getElementById(`${prefix}-contact-trigger`);
                if (contBox && contBox.style.display !== 'none' && !contBox.contains(e.target) && !(contTrig && contTrig.contains(e.target))) {
                    contBox.style.display = 'none';
                }
            });
        });

        // ==========================================
        // SCHRITT-ZUWEISUNG (pro Schritt ein Zuständiger)
        // ==========================================
        function closeStepAssigneeMenu() {
            const m = document.getElementById('step-assignee-menu');
            if (m) m.remove();
        }
        window.openStepAssigneeMenu = function(prefix, id, ev) {
            if (ev) ev.stopPropagation();
            closeStepAssigneeMenu();
            const btn = ev ? ev.currentTarget : null;
            const arr = window.processSteps[prefix] || [];
            const step = arr.find(x => x.id === id);
            const cur = step ? (step.assigned_to || '') : '';
            const users = window.userList || [];
            const menu = document.createElement('div');
            menu.id = 'step-assignee-menu';
            menu.style.cssText = 'position:fixed; z-index:1000000; background:#0f172a; border:1px solid rgba(255,255,255,0.2); border-radius:12px; padding:6px; box-shadow:0 16px 48px rgba(0,0,0,0.75); max-height:280px; overflow-y:auto; min-width:200px;';
            let html = `<div onclick="window.setStepAssignee('${prefix}','${id}','','')" style="display:flex; align-items:center; gap:10px; padding:9px 10px; border-radius:9px; cursor:pointer; color:rgba(255,255,255,0.6);" onmouseover="this.style.background='rgba(255,255,255,0.06)'" onmouseout="this.style.background='transparent'">— Niemand —</div>`;
            html += users.map(u => {
                const initials = u.initials || u.name.substring(0, 2).toUpperCase();
                const color = u.color || '#666';
                const active = u.name === cur;
                return `<div onclick="window.setStepAssignee('${prefix}','${id}','${u.id}','${escStepAttr(u.name)}')" style="display:flex; align-items:center; gap:10px; padding:8px 10px; border-radius:9px; cursor:pointer; ${active ? 'background:rgba(16,185,129,0.12);' : ''}" onmouseover="this.style.background='rgba(255,255,255,0.06)'" onmouseout="this.style.background='${active ? 'rgba(16,185,129,0.12)' : 'transparent'}'">
                    <div style="width:28px; height:28px; border-radius:50%; background:${color}; display:flex; align-items:center; justify-content:center; font-size:0.7rem; font-weight:800; color:#fff; flex-shrink:0;">${initials}</div>
                    <span style="flex:1; color:#fff; font-size:0.9rem; font-weight:500;">${escStepAttr(u.name)}</span>
                    ${active ? '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>' : ''}
                </div>`;
            }).join('');
            menu.innerHTML = html;
            document.body.appendChild(menu);
            if (btn) {
                const r = btn.getBoundingClientRect();
                menu.style.top = Math.min(r.bottom + 4, window.innerHeight - menu.offsetHeight - 8) + 'px';
                menu.style.left = Math.min(r.left, window.innerWidth - menu.offsetWidth - 8) + 'px';
            }
            setTimeout(() => document.addEventListener('click', closeStepAssigneeMenu, { once: true }), 0);
        };
        window.setStepAssignee = function(prefix, id, uid, name) {
            const arr = window.processSteps[prefix] || [];
            const s = arr.find(x => x.id === id);
            if (!s) { closeStepAssigneeMenu(); return; }
            s.assigned_to = name || null;
            s.assigned_id = uid || null;
            closeStepAssigneeMenu();
            window.renderProcessSteps(prefix);
        };

        // ==========================================
        // SCHRITT-ERINNERUNG (pro Schritt ein Datum)
        // ==========================================
        function closeStepReminderMenu() {
            const m = document.getElementById('step-reminder-menu');
            if (m) m.remove();
        }
        window.openStepReminderMenu = function(prefix, id, ev) {
            if (ev) ev.stopPropagation();
            closeStepReminderMenu();
            const btn = ev ? ev.currentTarget : null;
            const arr = window.processSteps[prefix] || [];
            const step = arr.find(x => x.id === id);
            if (!step) return;
            let cur = '';
            if (step.remind_at) {
                const d = new Date(step.remind_at);
                const tz = d.getTimezoneOffset() * 60000;
                cur = new Date(d.getTime() - tz).toISOString().slice(0, 16);
            }
            const menu = document.createElement('div');
            menu.id = 'step-reminder-menu';
            menu.style.cssText = 'position:fixed; z-index:1000000; background:#0f172a; border:1px solid rgba(255,255,255,0.2); border-radius:12px; padding:10px; box-shadow:0 16px 48px rgba(0,0,0,0.75); min-width:230px;';
            const quick = [['Heute', 0], ['Morgen', 1], ['In 3 Tagen', 3], ['In 1 Woche', 7]];
            menu.innerHTML = `
                <div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:8px;">
                    ${quick.map(q => `<button type="button" onclick="window.setStepReminderQuick('${prefix}','${id}',${q[1]})" style="flex:1 1 auto; padding:6px 8px; border-radius:8px; border:1px solid rgba(255,255,255,0.15); background:rgba(255,255,255,0.05); color:#fff; font-size:0.78rem; font-weight:600; cursor:pointer; white-space:nowrap;">${q[0]}</button>`).join('')}
                </div>
                <input type="datetime-local" id="step-reminder-input" value="${cur}" onchange="window.setStepReminder('${prefix}','${id}', this.value)" style="width:100%; box-sizing:border-box; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.2); border-radius:8px; color:#fff; padding:7px 9px; font-size:0.85rem; margin-bottom:8px; color-scheme:dark;">
                <button type="button" onclick="window.setStepReminder('${prefix}','${id}','')" style="width:100%; padding:7px; border-radius:8px; border:none; background:rgba(239,68,68,0.15); color:#f87171; font-size:0.8rem; font-weight:700; cursor:pointer;">Erinnerung löschen</button>`;
            document.body.appendChild(menu);
            if (btn) {
                const r = btn.getBoundingClientRect();
                menu.style.top = Math.min(r.bottom + 4, window.innerHeight - menu.offsetHeight - 8) + 'px';
                menu.style.left = Math.min(r.left, window.innerWidth - menu.offsetWidth - 8) + 'px';
            }
            setTimeout(() => document.addEventListener('click', function h(e) {
                if (!menu.contains(e.target)) { closeStepReminderMenu(); document.removeEventListener('click', h); }
            }), 0);
        };
        window.setStepReminderQuick = function(prefix, id, daysFromToday) {
            const d = new Date();
            d.setDate(d.getDate() + daysFromToday);
            d.setHours(8, 0, 0, 0);
            const arr = window.processSteps[prefix] || [];
            const s = arr.find(x => x.id === id);
            if (!s) { closeStepReminderMenu(); return; }
            s.remind_at = d.toISOString();
            closeStepReminderMenu();
            window.renderProcessSteps(prefix);
        };
        window.setStepReminder = function(prefix, id, val) {
            const arr = window.processSteps[prefix] || [];
            const s = arr.find(x => x.id === id);
            if (!s) { closeStepReminderMenu(); return; }
            s.remind_at = val ? new Date(val).toISOString() : null;
            closeStepReminderMenu();
            window.renderProcessSteps(prefix);
        };
