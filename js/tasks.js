
// ==========================================
// TASKS MODULE
// ==========================================
// Handles Kanban board, Task lists, Subtasks, 
// Comments, History and Time Tracking.

(function () {
    'use strict';

    console.log('Loading tasks module...');

    // ==========================================
    // GLOBAL STATE
    // ==========================================
    let allTasks = [];
    let currentTask = null;
    let viewMode = 'board'; // 'board' or 'list'
    let taskIsDirty = false;
    function onTaskFieldChange() { taskIsDirty = true; }
    // Reload-Schutz: der Merker ist modul-lokal, deshalb als Prueffunktion anmelden.
    if (typeof window.registerUnsavedCheck === 'function') window.registerUnsavedCheck(() => taskIsDirty);

    // Zugriff auf den Merker von außen — js/task-autosave.js braucht beides:
    // „schmutzig" für Änderungen an den Unteraufgaben (die lösen kein input-
    // Ereignis am Formular aus) und „sauber", sobald automatisch gespeichert
    // wurde und die Rückfrage beim Schließen entfallen soll.
    window.markTaskDirty = function () { taskIsDirty = true; };
    window.markTaskClean = function () { taskIsDirty = false; };
    window.isTaskDirty = function () { return taskIsDirty; };
    // Für den Aufgaben-Druck (js/tasks-print.js): die geladenen Aufgaben samt
    // Maschine und Unteraufgaben, ohne sie erneut abzufragen.
    window.getAllTasks = function () { return allTasks; };
    window.getTaskMachineLabel = function (m) { return getMachineLabel(m); };
    let filters = {
        machine: 'all',
        search: '',
        user: 'all'
    };
    window.showCompletedTasks = false;

    // ==========================================
    // INITIALIZATION
    // ==========================================
    document.addEventListener('DOMContentLoaded', () => {
        initTasksModule();
    });

    async function initTasksModule() {
        console.log('Initializing Tasks Module...');

        // Navigation Listeners (Sidebar)
        const tasksNavLink = document.querySelector('.nav-link[data-target="tasks"]');
        if (tasksNavLink) {
            tasksNavLink.addEventListener('click', (e) => {
                // Ensure the view is switched before fetching
                setTimeout(() => {
                    fetchTasks();
                    fetchMachinesForTasks();
                }, 50);
            });
        }

        // Search Input
        const searchInput = document.getElementById('task-search-input');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                filters.search = e.target.value.toLowerCase();
                renderTasks();
            });
        }

        // Dropdown triggers
        setupFilterDropdowns();

        // Initial fetch if already on tasks view
        if (document.getElementById('tasks') && !document.getElementById('tasks').classList.contains('hidden')) {
            fetchTasks();
            fetchMachinesForTasks();
        }

        // Setup Drag & Drop
        setupDragAndDrop();
    }

    /* Das Menü „Zuständig" liegt im Formularbereich des Modals, und der
       scrollt (overflow-y: auto) — dort wurde es abgeschnitten und lag hinter
       dem nächsten Feld. Deshalb beim Aufklappen auf position:fixed umstellen
       und am Auslöser ausrichten. Das Modal hat backdrop-filter und ist damit
       selbst Bezugsrahmen für fixed — der Versatz wird gemessen und in einem
       zweiten Durchgang ausgeglichen (wie in js/dropdown-position.js). */
    function menuFreistellen(trigger, menu) {
        const setz = (p, v) => menu.style.setProperty(p, v, 'important');
        const RAND = 12, LUFT = 6;

        setz('position', 'fixed');
        setz('margin', '0');
        setz('right', 'auto');
        setz('bottom', 'auto');
        setz('min-width', '0');
        setz('z-index', '100000');

        const t0 = trigger.getBoundingClientRect();
        menu.style.removeProperty('max-height');
        const hoehe = Math.min(menu.offsetHeight || 250, 260);
        const platzUnten = window.innerHeight - t0.bottom - LUFT - RAND;
        const platzOben = t0.top - LUFT - RAND;
        const nachOben = platzUnten < hoehe && platzOben > platzUnten;
        setz('max-height', Math.min(260, Math.max(140, nachOben ? platzOben : platzUnten)) + 'px');
        setz('overflow-y', 'auto');

        let vx = 0, vy = 0;
        for (let i = 0; i < 2; i++) {
            const f = trigger.getBoundingClientRect();
            setz('width', f.width + 'px');
            const zielL = f.left;
            const zielO = nachOben ? f.top - menu.offsetHeight - LUFT : f.bottom + LUFT;
            setz('left', (zielL + vx) + 'px');
            setz('top', (zielO + vy) + 'px');
            const ist = menu.getBoundingClientRect();
            const dx = zielL - ist.left, dy = zielO - ist.top;
            if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) break;
            vx += dx; vy += dy;
        }
    }

    function menuLoesen(menu) {
        ['position', 'left', 'top', 'right', 'bottom', 'width', 'min-width',
            'margin', 'max-height', 'overflow-y', 'z-index']
            .forEach(p => menu.style.removeProperty(p));
    }

    function setupFilterDropdowns() {
        const triggers = {
            'task-machine-filter-trigger': 'task-machine-filter-menu',
            'task-user-select-trigger': 'task-user-select-menu'
        };

        Object.keys(triggers).forEach(id => {
            const trigger = document.getElementById(id);
            const menu = document.getElementById(triggers[id]);
            if (trigger && menu) {
                trigger.onclick = (e) => {
                    // Klick INNERHALB des Menüs darf es nicht wieder zuklappen —
                    // das Menü liegt im Auslöser, sein Klick landet also hier.
                    if (menu.contains(e.target)) { e.stopPropagation(); return; }
                    e.stopPropagation();
                    const isVisible = menu.style.display === 'block';
                    // Close others
                    document.querySelectorAll('.custom-filter-menu').forEach(m => {
                        m.style.display = 'none';
                        menuLoesen(m);
                    });
                    menu.style.display = isVisible ? 'none' : 'block';
                    if (!isVisible) menuFreistellen(trigger, menu);
                };
            }
        });

        document.addEventListener('click', () => {
            document.querySelectorAll('.custom-filter-menu').forEach(m => {
                m.style.display = 'none';
                menuLoesen(m);
            });
        });

        // Offene Menüs beim Rollen/Größenändern mitführen (capture: auch im Modal).
        const nachfuehren = () => {
            Object.keys(triggers).forEach(id => {
                const trigger = document.getElementById(id);
                const menu = document.getElementById(triggers[id]);
                if (trigger && menu && menu.style.display === 'block') menuFreistellen(trigger, menu);
            });
        };
        window.addEventListener('scroll', nachfuehren, true);
        window.addEventListener('resize', nachfuehren);
    }

    // ==========================================
    // DATA FETCHING
    // ==========================================
    window.fetchTasks = async function () {
        try {
            const { data, error } = await window.supabaseClient
                .from('tasks')
                .select(`
                    *,
                    machines(manufacturer, name, serial, year, image_url),
                    subtasks(*)
                `)
                .order('created_at', { ascending: false });

            if (error) throw error;
            allTasks = data || [];
            allTasks.forEach(subtasksSortieren);

            // Fetch protocol metadata for machines in current tasks
            const machineIds = [...new Set(allTasks.map(t => t.machine_id).filter(Boolean))];
            if (machineIds.length > 0) {
                const { data: intakeData } = await window.supabaseClient
                    .from('intake_protocols')
                    .select('id, machine_id, status')
                    .in('machine_id', machineIds);
                
                const { data: acceptanceData } = await window.supabaseClient
                    .from('acceptance_protocols')
                    .select('id, machine_id, status')
                    .in('machine_id', machineIds);
                
                window.machineProtocols = {
                    intake: intakeData || [],
                    acceptance: acceptanceData || []
                };
            }

            renderTasks();
        } catch (err) {
            console.error('Error fetching tasks:', err);
        }
    };

    // ------------------------------------------------------------------
    // Live-Aktualisierung (Realtime, siehe supabase_add_tasks_realtime.sql)
    // ------------------------------------------------------------------
    // Der Realtime-Payload bringt weder die Maschine noch die Unteraufgaben
    // mit — deshalb wird komplett neu geladen, aber gebündelt: ein Schwall
    // Änderungen löst nur einen Ladevorgang aus.
    //
    // Zwei Rücksichtnahmen:
    //   * Ist gerade ein Aufgaben-Fenster offen, wird nicht neu gebaut —
    //     das würde dem Bearbeiter die Eingabe unter den Händen wegziehen.
    //     Der Nachlauf holt es nach dem Schließen nach.
    //   * Die Scrollposition bleibt erhalten (Fernseher/Kinomodus).
    let _tasksRefetchTimer = null;
    let _tasksRefetchPending = false;

    function taskModalOpen() {
        const m = document.getElementById('task-modal');
        if (m && !m.classList.contains('hidden')) return true;
        // Auch beim direkten Schreiben in eine Unteraufgabe auf der Tafel nicht
        // neu aufbauen — der Cursor wäre sonst mitten im Wort weg.
        const a = document.activeElement;
        return !!(a && a.classList && a.classList.contains('ghost-input'));
    }

    window.scheduleTasksRefetch = function () {
        clearTimeout(_tasksRefetchTimer);
        _tasksRefetchTimer = setTimeout(async () => {
            if (taskModalOpen()) { _tasksRefetchPending = true; return; }
            _tasksRefetchPending = false;
            const y = window.pageYOffset;
            await window.fetchTasks();
            if (!cinemaActive && Math.abs(window.pageYOffset - y) > 1) window.scrollTo(0, y);
        }, 500);
    };

    // Wurde während eines offenen Fensters etwas geändert, nach dem Schließen
    // nachziehen — sonst steht die Tafel bis zum nächsten Ereignis auf altem Stand.
    window.tasksRefetchIfPending = function () {
        if (!_tasksRefetchPending) return;
        _tasksRefetchPending = false;
        window.scheduleTasksRefetch();
    };

    window.fetchMachinesForTasks = async function () {
        try {
            // We can rely on global machineList if available, but fetching ensures freshness
            if (window.machineList && window.machineList.length > 0) {
                populateMachineFilters(window.machineList);
                return;
            }

            const { data, error } = await window.supabaseClient
                .from('machines')
                .select('*')
                .is('status', null) // Default to active
                .order('name');

            if (error) throw error;
            populateMachineFilters(data || []);
        } catch (err) {
            console.error('Error fetching machines for tasks:', err);
        }
    };

    function getMachineLabel(m) {
        if (!m) return '-';
        let txt = `${m.manufacturer || ''} ${m.name || ''}`.trim();
        if (m.serial) txt += ` #${m.serial}`;
        if (m.year) txt += ` (${m.year})`;
        return txt || 'Unbenannt';
    }

    // ==========================================
    // RENDERING
    // ==========================================
    function renderTasks() {
        const filteredTasks = allTasks.filter(task => {
            const title = task.title ? task.title.toLowerCase() : '';
            const desc = task.description ? task.description.toLowerCase() : '';
            const matchesSearch = title.includes(filters.search) || desc.includes(filters.search);
            const matchesMachine = filters.machine === 'all' || String(task.machine_id) === String(filters.machine);

            let isServiceMatch = true;
            if (window.currentAppMode === 'service') {
                isServiceMatch = task.subtasks && task.subtasks.some(s => s.action_type && s.action_type.startsWith('servicebericht:'));
            }

            let matchesUser = true;
            if (filters.user === 'me') {
                const activeId = window.activeUser?.id || localStorage.getItem('activeUserId');
                const activeName = (window.activeUser?.name || '').toLowerCase().trim();
                if (activeId || activeName) {
                    const isCreatedBy = task.created_by && String(task.created_by) === String(activeId);
                    const isAssigned = Array.isArray(task.assigned_to) && task.assigned_to.some(u => {
                        const str = String(u).toLowerCase().trim();
                        return (activeId && str === String(activeId).toLowerCase().trim()) || (activeName && str === activeName);
                    });
                    matchesUser = isCreatedBy || isAssigned;
                }
            }

            return matchesSearch && matchesMachine && isServiceMatch && matchesUser;
        });

        if (viewMode === 'board') {
            renderBoard(filteredTasks);
        } else if (viewMode === 'machines') {
            renderMachinesView(filteredTasks);
        } else {
            renderBoard(filteredTasks);
        }

        if (typeof window.applyCinemaColumns === 'function') window.applyCinemaColumns();
        if (typeof window.applyCinemaWorkshopVisibility === 'function') window.applyCinemaWorkshopVisibility();
    }
    window.renderTasks = renderTasks;

    function updateTaskTabActiveStates() {
        const isMe = filters.user === 'me';
        window.isMyTasksFilterActive = isMe;
        const allBtn = document.getElementById('btn-task-tab-all');
        const meBtn = document.getElementById('btn-task-user-me');
        if (allBtn) allBtn.classList.toggle('active', !isMe);
        if (meBtn) meBtn.classList.toggle('active', isMe);
    }

    // Ansicht umschalten: 'all' = alle Aufgaben, 'me' = nur meine.
    // Vorgänge erscheinen hier bewusst nicht mehr — dafür gibt es die
    // eigene Ansicht "Vorgänge" mit demselben Umschalter.
    window.filterTasksByUser = function (userFilter) {
        filters.user = userFilter;
        updateTaskTabActiveStates();
        renderTasks();
    };

    window.toggleMyTasksFilter = function () {
        window.filterTasksByUser(filters.user === 'me' ? 'all' : 'me');
    };

    window.showMyTasksAndSwitch = function () {
        window.switchView('tasks');
        setTimeout(() => {
            if (typeof window.filterTasksByUser === 'function') {
                window.filterTasksByUser('me');
            }
            if (typeof window.fetchTasks === 'function') {
                window.fetchTasks();
            }
        }, 50);
    };

    window.showAllTasksAndSwitch = function () {
        window.switchView('tasks');
        setTimeout(() => {
            if (typeof window.filterTasksByUser === 'function') {
                window.filterTasksByUser('all');
            }
            if (typeof window.fetchTasks === 'function') {
                window.fetchTasks();
            }
        }, 50);
    };

    function renderBoard(tasks) {
        const listEl = document.getElementById('tasks-list');
        if (listEl) listEl.classList.add('hidden');
        const containerM = document.getElementById('tasks-machines');
        if (containerM) containerM.classList.add('hidden');
        document.getElementById('tasks-board').classList.remove('hidden');

        const columns = {
            'open': document.getElementById('list-open'),
            'completed': document.getElementById('list-completed')
        };

        // Clear existing
        Object.values(columns).forEach(col => {
            if (col) col.innerHTML = '';
        });

        tasks.forEach(task => {
            const column = columns[task.status] || columns['open'];
            if (column) {
                const card = createTaskCard(task);
                column.appendChild(card);
            }
        });

        // Update counts and toggle logic for completed
        Object.keys(columns).forEach(status => {
            const colElem = document.querySelector(`.kanban-column[data-status="${status}"]`);
            if (colElem) {
                const countLabel = colElem.querySelector('.task-count');
                if (countLabel) {
                    const count = tasks.filter(t => t.status === status).length;
                    countLabel.textContent = count;
                }

                if (status === 'completed') {
                    // Inject toggle UI into completed column header
                    const titleElem = colElem.querySelector('.column-title');
                    if (titleElem && !titleElem.hasAttribute('data-toggle-bound')) {
                        titleElem.setAttribute('data-toggle-bound', 'true');
                        titleElem.style.cursor = 'pointer';
                        titleElem.style.display = 'flex';
                        titleElem.style.alignItems = 'center';
                        titleElem.style.justifyContent = 'space-between';

                        const countHTML = titleElem.querySelector('.task-count').outerHTML;
                        const textNode = Array.from(titleElem.childNodes).find(n => n.nodeType === 3 && n.textContent.trim()).textContent.trim();
                        titleElem.innerHTML = `
                            <span>${textNode}</span>
                            <div style="display:flex; align-items:center; gap: 16px;">
                                ${countHTML}
                                <svg id="board-completed-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="transition: transform 0.2s; transform: ${window.showCompletedTasks ? 'rotate(180deg)' : 'rotate(0deg)'}; color: rgba(255,255,255,0.5);">
                                    <polyline points="6 9 12 15 18 9"></polyline>
                                </svg>
                            </div>
                        `;

                        titleElem.onclick = () => {
                            window.showCompletedTasks = !window.showCompletedTasks;
                            renderTasks();
                        };
                    }

                    // Apply visibility
                    const listElem = columns['completed'];
                    if (listElem) {
                        listElem.style.display = window.showCompletedTasks ? 'flex' : 'none';
                    }
                }
            }
        });
    }


    function createTaskCard(task) {
        const div = document.createElement('div');
        div.className = 'task-card';
        if (task.status === 'completed') {
            div.classList.add('completed-task');
        }
        if (task.status) {
            div.classList.add(`status-${task.status}`);
        }
        div.draggable = true;
        div.id = `task-${task.id}`;
        div.dataset.id = task.id;
        if (window.isTaskCinemaHidden(task.id)) div.classList.add('cinema-hidden');

        const subtasksTotal = task.subtasks?.length || 0;
        const subtasksDone = task.subtasks?.filter(s => s.status === 'completed').length || 0;
        const progress = subtasksTotal > 0 ? Math.round((subtasksDone / subtasksTotal) * 100) : 0;

        div.innerHTML = `
            <div class="task-card-header">
                <div style="display:flex; align-items:flex-start; gap:8px; max-width:100%; min-width:0; word-break:break-word;">
                    <div class="task-quick-complete ${task.status === 'completed' ? 'completed' : ''}" onclick="event.stopPropagation(); window.toggleTaskStatus('${task.id}', '${task.status}')" title="${task.status === 'completed' ? 'Wieder öffnen' : 'Als erledigt markieren'}" style="margin-top: 2px;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    </div>
                    ${task.machines ? `<span class="task-card-machine" style="color: var(--color-primary-green); font-weight: 800; font-size: 1.35rem; white-space:normal; line-height: 1.2;" title="${getMachineLabel(task.machines)}">${getMachineLabel(task.machines)}</span>` : ''}
                    ${!task.machines && task.workshop_order_number ? `<span class="task-card-machine" style="color: #60a5fa; font-weight: 800; font-size: 1.05rem; white-space:normal; line-height: 1.2;" title="Werkstattauftrag ${task.workshop_order_number}">Werkstattauftrag ${task.workshop_order_number}</span>` : ''}
                    ${(task.address_id || task.customer_id || (task.description && task.description.includes('[Adresse:'))) ? `<span class="task-card-machine" style="color: #a78bfa; background: rgba(167, 139, 250, 0.15); border: 1px solid rgba(167, 139, 250, 0.4); padding: 2px 8px; border-radius: 999px; font-weight: 800; font-size: 0.72rem; letter-spacing: 0.04em;" title="Aus Ansprechpartner/Adresse erstellt">📍 ADRESSE</span>` : ''}
                </div>
                ${task.machines && task.machines.image_url ? `<img src="${task.machines.image_url}" alt="" class="task-card-machine-thumb" onclick="event.stopPropagation(); window.openMachineDetails && window.openMachineDetails('${task.machine_id}')" style="width:121px; height:121px; border-radius:8px; object-fit:cover; flex-shrink:0; align-self:center; margin:0 auto; border:1px solid rgba(255,255,255,0.12); cursor:pointer;" onerror="this.remove()">` : ''}
                <div class="task-card-actions" style="display: flex; gap: 6px; align-items: center;">
                    ${window.cinemaHideButtonHtml(task.id)}
                    <button id="star-card-${task.id}" onclick="event.stopPropagation(); window.saveTaskAsQuickTemplate('${task.id}')" title="Als Schnellvorlage speichern"
                        class="btn-star-premium btn-premium-action">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                        </svg>
                    </button>
                    <button onclick="event.stopPropagation(); window.openTaskModal('${task.id}')" title="Bearbeiten" style="width:32px; height:32px; border-radius:50%; background: rgba(59,130,246,0.2); border: 1.5px solid rgba(59,130,246,0.5); color: #60a5fa; display:flex; align-items:center; justify-content:center; cursor:pointer; transition: all 0.2s;" onmouseover="this.style.background='rgba(59,130,246,0.4)'" onmouseout="this.style.background='rgba(59,130,246,0.2)'">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                    </button>
                    <button class="delete-permission-required" onclick="event.stopPropagation(); window.deleteTask('${task.id}')" title="Löschen" style="width:32px; height:32px; border-radius:50%; background: rgba(239,68,68,0.2); border: 1.5px solid rgba(239,68,68,0.5); color: #f87171; display:flex; align-items:center; justify-content:center; cursor:pointer; transition: all 0.2s;" onmouseover="this.style.background='rgba(239,68,68,0.4)'" onmouseout="this.style.background='rgba(239,68,68,0.2)'">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    </button>
                </div>
            </div>
            <div class="task-card-title">${task.title}</div>

            ${task.status === 'completed' && task.completed_at ? `
            <div class="task-card-completed-info" style="font-size: 0.75rem; color: rgba(255,255,255,0.45); margin-top: 6px; padding-top: 4px; display: flex; flex-direction: column; gap: 2px;">
                <span>Erledigt am: ${new Date(task.completed_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })} Uhr</span>
                ${task.completed_by ? `<span>von: ${(() => {
                    const u = (window.userList || []).find(usr => String(usr.id) === String(task.completed_by));
                    return u ? u.name : 'Unbekannt';
                })()}</span>` : ''}
            </div>
            ` : ''}

            ${(function() {
                if (!task.subtasks || task.subtasks.length === 0) return '';
                const grouped = {};
                task.subtasks.forEach((sub, idx) => {
                    if (window.currentAppMode === 'focus' && sub.status === 'completed') return;
                    const sg = sub.supergroup || 'Allgemein';
                    if (!grouped[sg]) grouped[sg] = [];
                    grouped[sg].push({ ...sub, idx });
                });

                if (Object.keys(grouped).length === 0) return '';

                // Open subtasks first, completed ones sink to the bottom (stable order within each group)
                Object.values(grouped).forEach(subs => {
                    subs.sort((a, b) => (a.status === 'completed' ? 1 : 0) - (b.status === 'completed' ? 1 : 0));
                });

                let html = '<div class="task-card-subtasks" style="margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.05); display: flex; flex-direction: column; gap: 12px;">';
                for (const [groupName, subs] of Object.entries(grouped)) {
                    if (subs.length === 0) continue;
                    html += `
                        <div class="subtask-group" data-supergroup="${String(groupName).replace(/"/g, '&quot;')}" data-task-id="${task.id}"
                             oncontextmenu="window.subtaskKontextmenu(event, '${task.id}', null, this.dataset.supergroup)">
                            <div class="subtask-group-title" style="font-size: 0.75rem; font-weight: 800; text-transform: uppercase; color: var(--color-primary-green); margin-bottom: 6px; letter-spacing: 0.05em; opacity: 0.8;">${groupName}</div>
                            <div style="display: flex; flex-direction: column; gap: 6px;">`;

                    subs.forEach(sub => {
                        html += `
                            <div class="subtask-item" draggable="true"
                                 data-subtask-id="${sub.id}" data-task-id="${task.id}"
                                 ondragstart="window.startSubtaskDrag(event,'${sub.id}','${task.id}')"
                                 oncontextmenu="window.subtaskKontextmenu(event, '${task.id}', '${sub.id}', this.closest('.subtask-group').dataset.supergroup)"
                                 style="display:flex; align-items:flex-start; gap: 6px; border-radius:6px; padding:2px 4px; transition:background 0.15s;">
                                <div class="subtask-drag-handle" title="Verschieben" style="cursor:grab; color:rgba(255,255,255,0.18); flex-shrink:0; display:flex; align-items:center; padding:2px; margin-top:3px;">
                                    <svg width="8" height="12" viewBox="0 0 8 14" fill="currentColor"><circle cx="2" cy="2" r="1.2"/><circle cx="6" cy="2" r="1.2"/><circle cx="2" cy="7" r="1.2"/><circle cx="6" cy="7" r="1.2"/><circle cx="2" cy="12" r="1.2"/><circle cx="6" cy="12" r="1.2"/></svg>
                                </div>
                                <div style="display:flex; flex-wrap:wrap; align-items:center; gap:5px; flex:1; min-width:0;">
                                <div class="subtask-text-row" style="display: flex; align-items: center; gap: 10px; flex: 1; min-width: 100px;">
                                    <div class="task-quick-complete ${sub.status === 'completed' ? 'completed' : ''}" 
                                         onclick="event.stopPropagation(); window.toggleSubtaskStatus('${task.id}', ${sub.idx}, '${sub.status}')" 
                                         style="width: 18px; height: 18px; min-width: 18px;"
                                         title="${sub.status === 'completed' ? 'Wieder öffnen' : 'Als erledigt markieren'}">
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                    </div>
                                    <div class="ghost-input" contenteditable="true"
                                        data-subtask-input="${sub.id}"
                                        oninput="window.scheduleSubtaskSave(this, '${sub.id}')"
                                        onblur="window.saveSubtaskNow(this, '${sub.id}')"
                                        onkeydown="if(event.key === 'Enter') { event.preventDefault(); this.blur(); }"
                                        onclick="event.stopPropagation()"
                                        style="color: rgba(255,255,255,${sub.status === 'completed' ? '0.4' : '0.9'}); ${sub.status === 'completed' ? 'text-decoration: line-through;' : ''}">${sub.title}</div>
                                </div>
                                ${window.subtaskPlanBadge(sub)}
                                ${sub.action_type ? (() => {
                                       const isDoc = sub.action_type.startsWith('document:');
                                       const isService = sub.action_type.startsWith('servicebericht:');
                                       let label = 'AKTION';
                                       let title = '';
                                       let textLabel = '';
                                       let btnTitle = '';
                                       let badgeStyle = '';
                                       let btnStyle = '';
                                       let buttonIcon = '';
                                       let clickHandler = '';
                                       if (isDoc) {
                                           const parts = sub.action_type.substring(9).split('|||');
                                           textLabel = parts[1] || 'Dokument';
                                           btnTitle = 'Dokument öffnen';
                                           badgeStyle = 'background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.25); color: #10b981;';
                                           btnStyle = 'background: rgba(16, 185, 129, 0.2); border: 1px solid rgba(16, 185, 129, 0.4); color: #10b981;';
                                           buttonIcon = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>';
                                           clickHandler = `window.openProtocolFromTask('${task.machine_id}', null, '${sub.action_type}')`;
                                       } else if (isService) {
                                           const parts = sub.action_type.substring(15).split('|||');
                                           textLabel = parts[1] ? `Service: ${parts[1]}` : 'Servicebericht';
                                           btnTitle = 'Servicebericht öffnen';
                                           badgeStyle = 'background: rgba(147, 51, 234, 0.1); border: 1px solid rgba(147, 51, 234, 0.25); color: #c084fc;';
                                           btnStyle = 'background: rgba(147, 51, 234, 0.2); border: 1px solid rgba(147, 51, 234, 0.4); color: #c084fc;';
                                           buttonIcon = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>';
                                           clickHandler = `window.openServiceberichtFromTask('${task.machine_id}', '${sub.action_type}', '${task.id}', ${sub.idx}, '${sub.id || ''}')`;
                                       } else {
                                           textLabel = sub.action_type === 'intake' ? 'Eingang' : 'Abnahme';
                                           btnTitle = sub.action_type === 'intake' ? 'Eingangsprotokoll öffnen' : 'Abnahmeprotokoll öffnen';
                                           const isIntake = sub.action_type === 'intake';
                                           badgeStyle = isIntake ? 'background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.25); color: #60a5fa;' : 'background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.25); color: #f59e0b;';
                                           btnStyle = isIntake ? 'background: rgba(59, 130, 246, 0.2); border: 1px solid rgba(59, 130, 246, 0.4); color: #60a5fa;' : 'background: rgba(245, 158, 11, 0.2); border: 1px solid rgba(245, 158, 11, 0.4); color: #f59e0b;';
                                           buttonIcon = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"></path></svg>';
                                           clickHandler = `window.openProtocolFromTask('${task.machine_id}', null, '${sub.action_type}')`;
                                       }
                                       return `
                                       <button onclick="event.stopPropagation(); ${clickHandler}"
                                           title="${btnTitle}"
                                           class="subtask-action-btn"
                                           style="${btnStyle} border-radius: 8px; height: 30px; padding: 0 10px; display: flex; align-items: center; gap: 6px; cursor: pointer; flex-shrink: 0; transition: all 0.2s; font-size: 0.75rem; font-weight: 800; white-space: nowrap; max-width: 160px;">
                                           ${buttonIcon}
                                           <span style="overflow:hidden; text-overflow:ellipsis;">${textLabel}</span>
                                       </button>
                                       `;
                                   })() : ''}
                                </div>
                            </div>`;
                    });
                    html += '</div></div>';
                }
                html += '</div>';
                return html;
            })()}

            <!-- Protocol Integration Button -->
            <div id="protocol-btn-container-${task.id}" style="margin-top: 12px;">
                ${getProtocolButtonForTask(task)}
            </div>

            <div class="task-card-footer" style="margin-top: 12px;">
                <div class="task-progress-mini">
                    <div class="progress-bar-bg"><div class="progress-bar-fg" style="width: ${progress}%"></div></div>
                    <span>${subtasksDone}/${subtasksTotal}</span>
                </div>
                <div class="assigned-users-mini">
                    ${renderAvatars(task.assigned_to)}
                </div>
            </div>
        `;

        div.onclick = (e) => {
            e.stopPropagation();
            window.openTaskModal(task.id);
        };
        // Rechtsklick auf die Karte (nicht auf eine Unteraufgabe/Gruppe —
        // die haben ihr eigenes Menü): Aufgabe duplizieren, Unteraufgabe einfügen.
        div.oncontextmenu = (e) => {
            if (e.target.closest('.subtask-item, .subtask-group, .ghost-input, input, textarea')) return;
            window.subtaskKontextmenu(e, task.id, null, null);
        };

        // Buttons are always fully visible - no opacity fade needed

        div.addEventListener('dragstart', (e) => {
            if (e.target.closest('.subtask-item[draggable]')) return;
            e.dataTransfer.setData('text/plain', task.id);
            div.classList.add('dragging');
        });

        div.addEventListener('dragend', () => {
            div.classList.remove('dragging');
        });

        return div;
    }

    function renderMachinesView(tasks) {
        document.getElementById('tasks-board').classList.add('hidden');
        const listEl = document.getElementById('tasks-list');
        if (listEl) listEl.classList.add('hidden');

        const container = document.getElementById('tasks-machines');
        if (!container) return;
        container.classList.remove('hidden');
        container.innerHTML = '';

        const openTasks = tasks.filter(t => t.status !== 'completed');
        const completedTasks = tasks.filter(t => t.status === 'completed');

        // Group only open tasks by machine
        const grouped = {};
        openTasks.forEach(t => {
            const mid = t.machine_id || 'unassigned';
            if (!grouped[mid]) {
                grouped[mid] = [];
            }
            grouped[mid].push(t);
        });

        const machineOrder = Object.keys(grouped).sort((a, b) => {
            if (a === 'unassigned') return 1;
            if (b === 'unassigned') return -1;
            const mA = grouped[a][0].machines;
            const mB = grouped[b][0].machines;
            const labelA = getMachineLabel(mA);
            const labelB = getMachineLabel(mB);
            return labelA.localeCompare(labelB);
        });

        machineOrder.forEach(mid => {
            const mTasks = grouped[mid];
            const mLabel = mid === 'unassigned' ? 'Keine Maschine zugewiesen' : getMachineLabel(mTasks[0].machines);

            const section = document.createElement('div');
            section.className = 'glass-card';
            section.style.marginBottom = '20px';

            const header = document.createElement('h3');
            header.style.marginTop = '0';
            header.style.borderBottom = '1px solid rgba(255,255,255,0.1)';
            header.style.paddingBottom = '10px';
            header.style.marginBottom = '15px';
            header.style.color = '#fff';
            header.innerHTML = `${mLabel} <span class="task-count" style="margin-left:10px; background: rgba(255,255,255,0.1); padding: 2px 8px; border-radius: 6px; font-size: 0.85rem;">${mTasks.length}</span>`;

            const grid = document.createElement('div');
            grid.className = 'task-machine-grid';
            grid.style.gap = '15px';

            mTasks.forEach(task => {
                grid.appendChild(createTaskCard(task));
            });

            section.appendChild(header);
            section.appendChild(grid);
            container.appendChild(section);
        });

        if (completedTasks.length > 0) {
            const section = document.createElement('div');
            section.className = 'glass-card completed-tasks-section';
            section.style.marginBottom = '20px';
            section.style.background = 'rgba(255,255,255,0.02)';

            const header = document.createElement('div');
            header.style.display = 'flex';
            header.style.alignItems = 'center';
            header.style.justifyContent = 'space-between';
            header.style.cursor = 'pointer';
            header.style.fontWeight = '700';
            header.style.color = 'rgba(255,255,255,0.8)';
            header.style.background = 'rgba(255,255,255,0.05)';
            header.style.borderRadius = '12px';
            header.style.padding = '16px 20px';
            header.style.marginBottom = window.showCompletedTasks ? '20px' : '0';

            header.innerHTML = `
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 1.1rem;">Erledigte Aufgaben</span>
                    <span class="task-count" style="margin-left:10px; background: rgba(255,255,255,0.1); padding: 2px 8px; border-radius: 6px; font-size: 0.85rem;">${completedTasks.length}</span>
                </div>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="transition: transform 0.2s; transform: ${window.showCompletedTasks ? 'rotate(180deg)' : 'rotate(0deg)'};">
                    <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
            `;

            header.onclick = (e) => {
                e.stopPropagation();
                window.showCompletedTasks = !window.showCompletedTasks;
                window.renderTasks();
            };

            section.appendChild(header);

            if (window.showCompletedTasks) {
                const grid = document.createElement('div');
                grid.style.display = 'grid';
                grid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(calc(50% - 15px), 1fr))';
                grid.style.gap = '15px';

                completedTasks.forEach(task => {
                    grid.appendChild(createTaskCard(task));
                });
                section.appendChild(grid);
            }

            container.appendChild(section);
        }

        if (machineOrder.length === 0 && completedTasks.length === 0) {
            container.innerHTML = '<div style="text-align:center; color:rgba(255,255,255,0.5); padding: 40px;">Keine Aufgaben gefunden</div>';
        }
    }

    // ==========================================
    // MODAL & ACTIONS
    // ==========================================
    window.openAddTaskModal = function () {
        openTaskModal(null);
    };

    function getProtocolButtonForTask(task) {
        if (!task.title || !task.machine_id) return '';
        const title = task.title.toLowerCase();
        let type = '';
        let label = '';

        if (title.includes('eingangsprotokoll')) {
            type = 'intake';
            label = 'Eingangsprotokoll';
        } else if (title.includes('endcheck') || title.includes('abnahme')) {
            type = 'acceptance';
            label = 'Endcheck / Abnahme';
        }

        if (!type) return '';

        // Check if protocol already exists in window.machineProtocols
        const protocols = window.machineProtocols?.[type] || [];
        const existing = protocols.find(p => p.machine_id === task.machine_id);

        const btnLabel = existing ? 'Bearbeiten' : 'Erstellen';
        const protocolId = existing ? existing.id : null;

        const isIntake = type === 'intake';
        const color = isIntake ? '#3b82f6' : '#f59e0b';
        const bg = isIntake ? 'rgba(59, 130, 246, 0.1)' : 'rgba(245, 158, 11, 0.1)';
        const border = isIntake ? 'rgba(59, 130, 246, 0.4)' : 'rgba(245, 158, 11, 0.4)';

        return `
            <button onclick="event.stopPropagation(); openProtocolFromTask('${task.machine_id}', '${protocolId}', '${type}')" 
                class="btn-protocol-link ${existing ? 'exists' : 'new'} ${isIntake ? 'glow-blue' : 'glow-orange'}"
                style="width: 100%; padding: 10px; border-radius: 12px; border: 1.5px solid ${existing ? '#10b981' : border}; background: ${existing ? 'rgba(16, 185, 129, 0.1)' : bg}; color: ${existing ? '#10b981' : color}; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; transition: all 0.2s;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                ${label}: ${btnLabel}
            </button>
        `;
    }

    window.openProtocolFromTask = function(machineId, protocolId, type) {
        if (type === 'intake') {
            if (typeof window.openIntakeProtocol === 'function') {
                window.openIntakeProtocol(machineId, protocolId === 'null' ? null : protocolId);
            }
        } else {
            if (typeof window.openAcceptanceProtocol === 'function') {
                window.openAcceptanceProtocol(machineId, protocolId === 'null' ? null : protocolId);
            }
        }
    };

    // ==========================================
    // MODAL LOGIC (OVERHAUL)
    // ==========================================
    window.openTaskModal = async function (taskId = null) {
        try {
            console.log('openTaskModal called with taskId:', taskId);
            const modal = document.getElementById('task-modal');
            if (!modal) {
                console.error('task-modal element not found');
                return;
            }

            // Ensure user list is available
            if (!window.userList || window.userList.length === 0) {
                if (typeof window.fetchUsers === 'function') {
                    await window.fetchUsers();
                }
            }

            modal.classList.remove('hidden');
            modal.style.display = 'flex';
            requestAnimationFrame(() => {
                modal.classList.add('active');
                modal.classList.add('show');
            });

            if (taskId) {
                let task = allTasks.find(t => String(t.id).trim().toLowerCase() === String(taskId).trim().toLowerCase());
                if (!task) {
                    console.log('Task not found in memory, fetching from Supabase...');
                    const { data, error } = await window.supabaseClient
                        .from('tasks')
                        .select(`
                            *,
                            machines(manufacturer, name, serial, year, image_url),
                            subtasks(*)
                        `)
                        .eq('id', taskId)
                        .maybeSingle();
                    
                    if (error) {
                        console.error('Error fetching task from Supabase:', error);
                    } else if (data) {
                        task = data;
                        subtasksSortieren(task);
                        allTasks.push(task); // Add to local cache
                    }
                }

                if (!task) {
                    console.error('Task not found in memory or database for id:', taskId);
                    window.showToast('Aufgabe konnte nicht im System gefunden werden.');
                    return;
                }

                currentTask = task;
                window.currentTaskId = String(task.id); // fuer js/task-autosave.js
                document.getElementById('task-modal-title').textContent = 'Aufgabe bearbeiten';
                fillModal(task);
                document.getElementById('task-details-section').style.display = 'block';
            } else {
                currentTask = null;
                window.currentTaskId = null;
                document.getElementById('task-modal-title').textContent = 'Neue Aufgabe';
                resetModal();
                // Titel, Zuständig und Zeitraum sind ab sofort von Anfang an
                // sichtbar. Vorher war der ganze Block bis zur Maschinenwahl
                // ausgeblendet — dadurch schien es, als gäbe es die Felder nicht.
                document.getElementById('task-details-section').style.display = 'block';
            }

            // Dirty tracking: reset + event delegation
            taskIsDirty = false;
            const taskModal = document.getElementById('task-modal');
            if (taskModal) {
                taskModal.removeEventListener('input', onTaskFieldChange);
                taskModal.removeEventListener('change', onTaskFieldChange);
                taskModal.addEventListener('input', onTaskFieldChange);
                taskModal.addEventListener('change', onTaskFieldChange);
            }
        } catch (err) {
            console.error('Error in openTaskModal:', err);
            window.showToast('Fehler beim Öffnen der Aufgabe: ' + err.message);
        }
    };

    window.closeTaskModal = function (force = false) {
        if (!force && taskIsDirty) {
            window.showUnsavedDialog({
                overlayId: 'task-confirm-close-overlay',
                onDiscard: () => window.closeTaskModal(true),
                onSave: () => { document.getElementById('task-confirm-close-overlay')?.remove(); window.saveTask(); }
            });
            return;
        }
        taskIsDirty = false;
        window.currentTaskId = null;
        const modal = document.getElementById('task-modal');
        if (modal) {
            modal.removeEventListener('input', onTaskFieldChange);
            modal.removeEventListener('change', onTaskFieldChange);
            modal.classList.remove('active');
            modal.classList.remove('show');
            setTimeout(() => {
                modal.classList.add('hidden');
                modal.style.display = 'none';
                // Während des Bearbeitens zurückgehaltene Live-Änderungen nachziehen.
                window.tasksRefetchIfPending();
            }, 300);
        }
    };

    window.onMachineSelected = function(machineId) {
        const details = document.getElementById('task-details-section');
        const workshopWrapper = document.getElementById('task-workshop-order-wrapper');
        const workshopActive = workshopWrapper && workshopWrapper.style.display !== 'none';
        // Der Block bleibt immer sichtbar — die Maschine ist nur der erste
        // Schritt, kein Schalter für den Rest des Fensters.
        details.style.display = 'block';
        if ((machineId || workshopActive) && !currentTask) {
            // Bei einer neuen Aufgabe die Standard-Übergruppen laden.
            if (typeof window.setupNewTaskGroups === 'function') {
                window.setupNewTaskGroups();
            }
        }
    };

    // Update the machine selection logic to trigger the above
    const oldFilterMachineDropdown = window.filterMachineDropdown;
    window.selectMachine = function(id, label) {
        document.getElementById('task-machine').value = id;
        document.getElementById('task-machine-search').value = label;
        document.getElementById('task-machine-dropdown').style.display = 'none';
        window.onMachineSelected(id);
    };

    function fillModal(task) {
        document.getElementById('task-title').value = task.title || '';
        const descEl = document.getElementById('task-description');
        descEl.value = task.description || '';
        descEl.style.height = 'auto';
        descEl.style.height = descEl.scrollHeight + 'px';
        document.getElementById('task-machine').value = task.machine_id || '';
        const machineSearch = document.getElementById('task-machine-search');
        window.hideWorkshopOrderInput();
        if (machineSearch && task.machines) {
            machineSearch.value = getMachineLabel(task.machines);
            machineSearch.style.color = 'var(--color-primary-green)';
        } else if (task.workshop_order_number) {
            const match = task.workshop_order_number.match(/^202(\d)-40(\d{1,3})$/);
            if (match) {
                document.getElementById('task-workshop-year-digit').value = match[1];
                document.getElementById('task-workshop-order-suffix').value = match[2];
            }
            document.getElementById('task-workshop-order-wrapper').style.display = 'block';
            if (machineSearch) {
                machineSearch.value = 'Werkstattauftrag';
                machineSearch.style.color = '#60a5fa';
            }
        } else if (machineSearch) {
            machineSearch.value = '';
            machineSearch.style.color = '';
        }

        const compInfo = document.getElementById('task-completion-info');
        if (compInfo) {
            if (task.status === 'completed' && task.completed_at) {
                const dateStr = new Date(task.completed_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                let userStr = 'Unbekannt';
                if (task.completed_by) {
                    const u = (window.userList || []).find(usr => String(usr.id) === String(task.completed_by));
                    if (u) userStr = u.name;
                }
                compInfo.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 8px; color: #10b981; font-weight: 800; font-size: 1rem; text-shadow: 0 0 10px rgba(16,185,129,0.3);">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        ERLEDIGTE AUFGABE
                    </div>
                    <div style="font-size: 0.85rem; color: rgba(255,255,255,0.7); margin-top: 4px; line-height: 1.4;">
                        Erledigt am: <strong>${dateStr} Uhr</strong><br>
                        Erledigt von: <strong>${userStr}</strong>
                    </div>
                `;
                compInfo.style.display = 'block';
            } else {
                compInfo.style.display = 'none';
            }
        }

        // Zeitraum — dieselben Spalten wie in der Timeline.
        const startEl = document.getElementById('task-start-date');
        const endEl = document.getElementById('task-end-date');
        if (startEl) startEl.value = task.start_date ? String(task.start_date).split('T')[0] : '';
        if (endEl) endEl.value = task.end_date ? String(task.end_date).split('T')[0] : '';

        if (typeof window.setupNewTaskGroups === 'function') {
            window.setupNewTaskGroups(task.subtasks);
        }
        renderAssignedUsers(task.assigned_to || []);
    }

    function resetModal() {
        document.getElementById('task-title').value = '';
        const descEl = document.getElementById('task-description');
        descEl.value = '';
        descEl.style.height = 'auto';
        document.getElementById('task-machine').value = '';
        const machineSearch = document.getElementById('task-machine-search');
        if (machineSearch) {
            machineSearch.value = '';
            machineSearch.style.color = '';
        }
        window.hideWorkshopOrderInput();

        const startEl = document.getElementById('task-start-date');
        const endEl = document.getElementById('task-end-date');
        if (startEl) startEl.value = '';
        if (endEl) endEl.value = '';

        const compInfo = document.getElementById('task-completion-info');
        if (compInfo) compInfo.style.display = 'none';

        if (typeof window.setupNewTaskGroups === 'function') {
            window.setupNewTaskGroups();
        }
        window.tempAssigned = [];
        renderAssignedUsers([]);
    }

    window.applyTaskTemplate = function(type) {
        const templates = {
            intake: { title: 'Eingangsprotokoll ausführen', description: 'Vollständiges Eingangsprotokoll für die Maschine erstellen.' },
            acceptance: { title: 'Endcheck durchführen', description: 'Abnahmeprotokoll und Endkontrolle vor Auslieferung.' },
            repair: { title: 'Reparatur durchführen', description: 'Fehler beheben und Funktion prüfen.' }
        };
        const t = templates[type];
        if (t) {
            document.getElementById('task-title').value = t.title;
            const descEl = document.getElementById('task-description');
            descEl.value = t.description;
            descEl.style.height = 'auto';
            descEl.style.height = descEl.scrollHeight + 'px';
        }
    };

    // Unteraufgaben werden beim Speichern gelöscht und neu angelegt. Die in der
    // Timeline gesetzte Planung (start_date/end_date/assigned_to) ginge dabei
    // verloren — deshalb vorher lesen und über Gruppe+Titel wieder anheften.
    // Fehlen die Spalten noch (supabase_add_subtask_planung.sql), passiert nichts.
    window.mergeSubtaskPlanung = async function (taskId, rows) {
        if (!taskId || !rows || !rows.length) return rows;
        try {
            const { data, error } = await window.supabaseClient
                .from('subtasks').select('*').eq('task_id', taskId);
            if (error || !data || !data.length) return rows;
            const alt = {};
            data.forEach(s => { alt[(s.supergroup || '') + ' ' + (s.title || '')] = s; });
            rows.forEach(r => {
                const a = alt[(r.supergroup || '') + ' ' + (r.title || '')];
                if (!a) return;
                // Nur auffüllen, was im Fenster nicht gesetzt wurde — sonst
                // würde die gerade eingetragene Planung wieder überschrieben.
                ['start_date', 'end_date', 'assigned_to', 'expected_time'].forEach(f => {
                    if (a[f] === undefined || a[f] === null) return;
                    const leer = r[f] == null || (Array.isArray(r[f]) && !r[f].length);
                    if (leer) r[f] = a[f];
                });
            });
        } catch (e) { console.warn('Unteraufgaben-Planung nicht übernommen:', e); }
        return rows;
    };

    // Unteraufgaben schreiben. Solange supabase_add_subtask_planung.sql nicht
    // gelaufen ist, gibt es die vier Planungsspalten nicht — dann würde der
    // ganze Insert scheitern und die Unteraufgaben wären weg. Deshalb einmal
    // ohne diese Felder nachfassen und deutlich sagen, was fehlt.
    // Gleiches Spiel mit `sort_order` (supabase_add_subtask_sort_order.sql):
    // fehlt die Spalte, wird sie weggelassen — die Reihenfolge hält dann nur
    // bis zum nächsten Laden.
    const PLANUNGSFELDER = ['start_date', 'end_date', 'assigned_to', 'expected_time'];
    let planungFehltGemeldet = false;
    let sortOrderFehltGemeldet = false;
    function sortOrderFehltMelden() {
        if (sortOrderFehltGemeldet) return;
        sortOrderFehltGemeldet = true;
        window.showToast('Reihenfolge der Unteraufgaben wird nicht gespeichert — '
            + 'dafür muss supabase/supabase_add_subtask_sort_order.sql in Supabase laufen.');
    }
    window.insertSubtasks = async function (rows) {
        if (!rows || !rows.length) return { error: null };
        let res = await window.supabaseClient.from('subtasks').insert(rows);
        if (!res.error) return res;
        let msg = res.error.message || '';
        if (msg.includes('sort_order')) {
            rows = rows.map(r => { const k = { ...r }; delete k.sort_order; return k; });
            res = await window.supabaseClient.from('subtasks').insert(rows);
            if (!res.error) { sortOrderFehltMelden(); return res; }
            msg = res.error.message || '';
        }
        if (!PLANUNGSFELDER.some(f => msg.includes(f))) return res;

        const ohne = rows.map(r => {
            const kopie = { ...r };
            PLANUNGSFELDER.forEach(f => delete kopie[f]);
            return kopie;
        });
        res = await window.supabaseClient.from('subtasks').insert(ohne);
        if (!res.error && !planungFehltGemeldet) {
            planungFehltGemeldet = true;
            window.showToast('Unteraufgaben gespeichert — aber ohne Termin und Zuständigen. '
                + 'Dafür muss supabase/supabase_add_subtask_planung.sql in Supabase laufen.');
        }
        return res;
    };

    // Eine Unteraufgabe ändern; fehlt `sort_order` in der Datenbank, ohne
    // dieses Feld noch einmal — so bleibt Verschieben trotzdem möglich.
    async function updateSubtask(id, felder) {
        let res = await window.supabaseClient.from('subtasks').update(felder).eq('id', id);
        if (res.error && 'sort_order' in felder && (res.error.message || '').includes('sort_order')) {
            const ohne = { ...felder }; delete ohne.sort_order;
            if (!Object.keys(ohne).length) { sortOrderFehltMelden(); return { error: null }; }
            res = await window.supabaseClient.from('subtasks').update(ohne).eq('id', id);
            if (!res.error) sortOrderFehltMelden();
        }
        return res;
    }

    // Reihenfolge einer Aufgabe festschreiben: sort_order = Platz in der
    // Liste. Nur Zeilen schreiben, deren Platz sich geändert hat.
    async function subtaskReihenfolgeSpeichern(task) {
        const subs = (task && task.subtasks) || [];
        const arbeit = [];
        subs.forEach((s, i) => {
            if (s.sort_order === i) return;
            s.sort_order = i;
            arbeit.push(updateSubtask(s.id, { sort_order: i }));
        });
        const ergebnisse = await Promise.all(arbeit);
        const fehler = ergebnisse.find(r => r && r.error);
        if (fehler) throw fehler.error;
    }

    // Unteraufgaben in Anzeigereihenfolge bringen: erst sort_order, dann
    // Anlagezeit (Altbestand ohne Position).
    function subtasksSortieren(task) {
        if (!task || !Array.isArray(task.subtasks)) return;
        task.subtasks.sort((a, b) => {
            const ao = a.sort_order == null ? Infinity : a.sort_order;
            const bo = b.sort_order == null ? Infinity : b.sort_order;
            if (ao !== bo) return ao - bo;
            return String(a.created_at || '').localeCompare(String(b.created_at || ''));
        });
    }

    window.saveTask = async function () {
        const title = document.getElementById('task-title').value.trim();
        if (!title) {
            window.showToast('Bitte einen Titel eingeben.');
            return;
        }

        const workshopWrapper = document.getElementById('task-workshop-order-wrapper');
        let workshopOrderNumber = null;
        if (workshopWrapper && workshopWrapper.style.display !== 'none') {
            const yearDigit = document.getElementById('task-workshop-year-digit').value.trim();
            const suffix = document.getElementById('task-workshop-order-suffix').value.trim();
            if (!yearDigit || !suffix) {
                window.showToast('Bitte eine vollständige Werkstattauftragsnummer eingeben.');
                return;
            }
            workshopOrderNumber = `202${yearDigit}-40${suffix.padStart(3, '0')}`;
        }

        // Zeitraum: leeres Feld heisst ausdrücklich „ungeplant" (null), nicht
        // „unverändert" — sonst liesse sich ein Datum nie wieder entfernen.
        const startVal = (document.getElementById('task-start-date') || {}).value || null;
        let endVal = (document.getElementById('task-end-date') || {}).value || null;
        if (startVal && endVal && endVal < startVal) endVal = startVal;

        const taskData = {
            title: title,
            description: document.getElementById('task-description').value,
            status: currentTask ? (currentTask.status || 'open') : 'open',
            machine_id: document.getElementById('task-machine').value || null,
            workshop_order_number: workshopOrderNumber,
            start_date: startVal,
            end_date: endVal,
            updated_at: new Date().toISOString()
        };

        try {
            let taskId = currentTask?.id;
            let error;

            if (currentTask) {
                const res = await window.supabaseClient.from('tasks').update(taskData).eq('id', currentTask.id);
                error = res.error;
            } else {
                taskData.created_by = window.activeUser?.id;
                taskData.assigned_to = window.tempAssigned || [];
                const { data, error: insertError } = await window.supabaseClient.from('tasks').insert([taskData]).select();
                error = insertError;
                if (data && data[0]) taskId = data[0].id;
            }

            if (error) throw error;

            // Handle Subtasks with Supergroups
            if (taskId && typeof window.getModalGroupsData === 'function') {
                const groups = window.getModalGroupsData();
                const allSubtasks = [];
                groups.forEach(g => {
                    g.subtasks.forEach(st => {
                        allSubtasks.push({
                            task_id: taskId,
                            title: st.title,
                            status: st.status || 'open',
                            supergroup: g.name,
                            sort_order: allSubtasks.length,
                            action_type: st.action_type || null,
                            // Planung je Unteraufgabe (wer · ab wann · wie lange)
                            start_date: st.start_date || null,
                            end_date: st.end_date || null,
                            assigned_to: Array.isArray(st.assigned_to) ? st.assigned_to : []
                        });
                    });
                });

                // Clear existing subtasks if editing
                if (currentTask) {
                    await window.mergeSubtaskPlanung(taskId, allSubtasks);
                    await window.supabaseClient.from('subtasks').delete().eq('task_id', taskId);
                }

                if (allSubtasks.length > 0) {
                    const { error: stError } = await window.insertSubtasks(allSubtasks);
                    if (stError) throw stError;
                }
            }

            taskIsDirty = false;
            closeTaskModal(true);
            fetchTasks();
            window.showToast('Aufgabe gespeichert.', 'success');
        } catch (err) {
            console.error('Error in saveTask:', err);
            const msg = err.message || err.details || 'Unbekannter Fehler';
            window.showToast('Fehler beim Speichern: ' + msg);
        }
    };

    // ==========================================
    // TASK RENDERING UTILS
    // ==========================================
    // Kleines Schild hinter einer Unteraufgabe: wer · ab wann · wie viele Tage.
    // Die Werte kommen aus subtasks.assigned_to / start_date / end_date —
    // dieselben Felder, die das Aufgaben-Fenster und die Timeline schreiben.
    window.subtaskPlanBadge = function (sub) {
        if (!sub) return '';
        const tag = w => (w ? String(w).slice(0, 10) : '');
        const von = tag(sub.start_date), bis = tag(sub.end_date);
        const ids = Array.isArray(sub.assigned_to) ? sub.assigned_to : [];
        const namen = ids.map(id => {
            const u = (window.userList || []).find(x => String(x.id) === String(id));
            return u ? (u.name || '').split(' ')[0] : null;
        }).filter(Boolean);
        if (!von && !namen.length) return '';

        const kurz = d => d ? d.slice(8, 10) + '.' + d.slice(5, 7) + '.' : '';
        let zeit = '';
        if (von) {
            const t = bis && bis > von
                ? Math.round((new Date(bis + 'T00:00:00') - new Date(von + 'T00:00:00')) / 86400000) + 1
                : 1;
            zeit = kurz(von) + (t > 1 ? ' · ' + t + ' T' : '');
        }
        const text = [namen.join(', '), zeit].filter(Boolean).join(' · ');
        return `<span title="${text}" style="font-size: 0.65rem; font-weight: 800; color: #93c5fd;
                    background: rgba(59,130,246,0.12); border: 1px solid rgba(59,130,246,0.25);
                    padding: 2px 6px; border-radius: 4px; white-space: nowrap;">${text}</span>`;
    };

    function renderAvatars(userIds) {
        if (!userIds || userIds.length === 0) return '';
        return userIds.map(id => {
            const user = (window.userList || []).find(u => u.id === id);
            const initial = user && user.name ? user.name.charAt(0).toUpperCase() : '?';
            const color = user && user.color ? user.color : 'rgba(255,255,255,0.1)';
            return `<div class="user-avatar-mini" style="background: ${color};" title="${user ? user.name : 'Unbekannt'}">${initial}</div>`;
        }).join('');
    }

    // ==========================================
    // MACHINE SEARCH DROPDOWN
    // ==========================================
    function getMachineListForSearch() {
        return window.machineList || [];
    }

    function buildMachineDropdown(machines) {
        // Use a body-level overlay so it escapes any overflow/stacking context
        let dropdown = document.getElementById('task-machine-dropdown-portal');
        if (!dropdown) {
            dropdown = document.createElement('div');
            dropdown.id = 'task-machine-dropdown-portal';
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

        // Position under the search input
        const searchInput = document.getElementById('task-machine-search');
        if (searchInput) {
            const rect = searchInput.getBoundingClientRect();
            dropdown.style.top = (rect.bottom + 4) + 'px';
            dropdown.style.left = rect.left + 'px';
            dropdown.style.width = rect.width + 'px';
        }

        dropdown.innerHTML = '';

        // "Keine Maschine" option
        const noneItem = document.createElement('div');
        noneItem.textContent = 'Keine Maschine';
        noneItem.style.cssText = 'padding: 10px 14px; cursor: pointer; color: rgba(255,255,255,0.6); font-size: 0.9rem;';
        noneItem.onmousedown = (e) => { e.preventDefault(); selectMachine('', 'Keine Maschine'); };
        noneItem.onmouseover = () => { noneItem.style.background = 'rgba(255,255,255,0.08)'; };
        noneItem.onmouseout = () => { noneItem.style.background = ''; };
        dropdown.appendChild(noneItem);

        // "Werkstattauftrag" option (Aufgabe ohne Maschinenbezug, mit Auftragsnummer)
        const workshopItem = document.createElement('div');
        workshopItem.innerHTML = '<span style="color: #60a5fa; font-weight: 700;">Werkstattauftrag (ohne Maschine)</span>';
        workshopItem.style.cssText = 'padding: 10px 14px; cursor: pointer; font-size: 0.9rem; border-top: 1px solid rgba(255,255,255,0.05); border-bottom: 1px solid rgba(255,255,255,0.05);';
        workshopItem.onmousedown = (e) => { e.preventDefault(); window.selectWorkshopOrderMode(); };
        workshopItem.onmouseover = () => { workshopItem.style.background = 'rgba(96,165,250,0.08)'; };
        workshopItem.onmouseout = () => { workshopItem.style.background = ''; };
        dropdown.appendChild(workshopItem);

        machines.forEach(m => {
            const label = getMachineLabel(m);
            const item = document.createElement('div');
            item.style.cssText = 'padding: 10px 14px; cursor: pointer; font-size: 0.9rem; border-top: 1px solid rgba(255,255,255,0.05);';
            item.innerHTML = `<span style="color: var(--color-primary-green); font-weight: 600;">${label}</span>`;
            item.onmousedown = (e) => { e.preventDefault(); selectMachine(m.id, label); };
            item.onmouseover = () => { item.style.background = 'rgba(255,255,255,0.06)'; };
            item.onmouseout = () => { item.style.background = ''; };
            dropdown.appendChild(item);
        });

        dropdown.style.display = 'block';
    }

    window.showMachineDropdown = function () {
        const machines = getMachineListForSearch();
        buildMachineDropdown(machines);
    };

    window.filterMachineDropdown = function (query) {
        const machines = getMachineListForSearch();
        const tokens = query.toLowerCase().split(/\s+/).filter(t => t.length > 0);
        const filtered = machines.filter(m => {
            const searchable = [
                m.manufacturer || '',
                m.name || '',
                m.serial || '',
                m.year ? String(m.year) : '',
                getMachineLabel(m)
            ].join(' ').toLowerCase();
            return tokens.length === 0 || tokens.every(token => searchable.includes(token));
        });
        buildMachineDropdown(filtered);
    };

    window.selectMachine = function (id, label) {
        document.getElementById('task-machine').value = id;
        const searchInput = document.getElementById('task-machine-search');
        if (searchInput) {
            searchInput.value = label !== 'Keine Maschine' ? label : '';
            searchInput.style.color = id ? 'var(--color-primary-green)' : '';
        }
        const dropdown = document.getElementById('task-machine-dropdown-portal');
        if (dropdown) dropdown.style.display = 'none';

        window.hideWorkshopOrderInput();

        // Trigger detail section and template loading
        if (typeof window.onMachineSelected === 'function') {
            window.onMachineSelected(id);
        }
    };

    window.hideWorkshopOrderInput = function () {
        const wrapper = document.getElementById('task-workshop-order-wrapper');
        if (wrapper) wrapper.style.display = 'none';
        const yearDigit = document.getElementById('task-workshop-year-digit');
        const suffix = document.getElementById('task-workshop-order-suffix');
        if (yearDigit) yearDigit.value = '';
        if (suffix) suffix.value = '';
    };

    window.selectWorkshopOrderMode = function () {
        document.getElementById('task-machine').value = '';
        const searchInput = document.getElementById('task-machine-search');
        if (searchInput) {
            searchInput.value = 'Werkstattauftrag';
            searchInput.style.color = '#60a5fa';
        }
        const dropdown = document.getElementById('task-machine-dropdown-portal');
        if (dropdown) dropdown.style.display = 'none';

        const wrapper = document.getElementById('task-workshop-order-wrapper');
        if (wrapper) wrapper.style.display = 'block';

        if (typeof window.onMachineSelected === 'function') {
            window.onMachineSelected('');
        }
    };

    // Close machine dropdown when clicking outside
    document.addEventListener('click', (e) => {
        const d = document.getElementById('task-machine-dropdown-portal');
        if (d && !e.target.closest('#task-machine-search') && !e.target.closest('#task-machine-dropdown-portal')) {
            d.style.display = 'none';
        }
    });

    window.toggleSubtask = async function (id, isChecked) {
        const status = isChecked ? 'completed' : 'open';

        try {
            await window.supabaseClient.from('subtasks').update({ status }).eq('id', id);
            fetchTasks();
        } catch (err) {
            console.error(err);
        }
    };

    window.deleteTask = async function (taskId) {
        if (window.activeUser && window.activeUser.permissions && window.activeUser.permissions.can_delete === false) {
            window.showToast('Keine Berechtigung zum Löschen von Aufgaben.');
            return;
        }
        if (!confirm('Möchten Sie diese Aufgabe wirklich unwiderruflich löschen?')) return;

        try {
            await window.supabaseClient.from('subtasks').delete().eq('task_id', taskId);
            const { error } = await window.supabaseClient.from('tasks').delete().eq('id', taskId);
            if (error) throw error;
            fetchTasks();
        } catch (err) {
            console.error('Error in deleteTask:', err);
            window.showToast('Fehler beim Löschen: ' + (err.message || 'Unbekannter Fehler'));
        }
    };

    window.deleteSubtask = async function (id) {
        if (typeof window.canDelete === 'function' && !window.canDelete('Unteraufgaben')) return;
        if (!confirm('Unteraufgabe löschen?')) return;
        try {
            await window.supabaseClient.from('subtasks').delete().eq('id', id);
            fetchTasks();
        } catch (err) {
            console.error(err);
        }
    };

    // ==========================================
    // ASSIGNMENTS
    // ==========================================
    // Auch nach aussen: js/task-drafts.js stellt damit einen Entwurf wieder her.
    window.renderAssignedUsers = renderAssignedUsers;
    function renderAssignedUsers(assignedIds) {
        const container = document.getElementById('task-user-options');
        const labelContainer = document.getElementById('task-assigned-users-label');
        if (!container || !labelContainer) return;

        container.innerHTML = '';
        if (window.userList && window.userList.length > 0) {
            window.userList.forEach(user => {
                const isChecked = assignedIds.includes(user.id);
                const li = document.createElement('li');
                li.className = 'task-user-list-item';
                li.style.display = 'flex';
                li.style.alignItems = 'center';
                li.style.gap = '12px';
                li.style.padding = '12px 16px';
                li.style.cursor = 'pointer';
                li.style.transition = 'background 0.2s';
                li.style.borderRadius = '10px';

                li.innerHTML = `
                    <input type="checkbox" id="user-cb-${user.id}" ${isChecked ? 'checked' : ''} style="pointer-events: none; accent-color: var(--color-primary-green); width: 18px; height: 18px;">
                    <div style="display: flex; align-items: center; gap: 12px; flex: 1;">
                        <span class="avatar-mini" style="background: ${getUserColor(user)}; width: 32px; height: 32px; font-size: 0.8rem; flex-shrink: 0; border: 2px solid rgba(255,255,255,0.1);" title="${user.name}">
                            ${getUserInitials(user)}
                        </span>
                        <div style="display: flex; flex-direction: column;">
                            <span style="font-weight: 600; color: white; font-size: 0.95rem;">${user.name}</span>
                            <span style="font-size: 0.75rem; color: rgba(255,255,255,0.4);">${user.initials || ''}</span>
                        </div>
                    </div>
                `;

                li.onclick = (e) => {
                    e.stopPropagation();
                    toggleUserAssignmentCheckbox(user.id);
                };
                container.appendChild(li);
            });

            // Update label area with Avatars instead of text
            labelContainer.innerHTML = '';
            if (assignedIds.length > 0) {
                assignedIds.forEach(uid => {
                    const user = window.userList.find(u => u.id === uid);
                    if (user) {
                        const avatar = document.createElement('span');
                        avatar.className = 'avatar-mini';
                        avatar.style.background = getUserColor(user);
                        avatar.style.width = '32px';
                        avatar.style.height = '32px';
                        avatar.style.fontSize = '0.8rem';
                        avatar.style.border = '2px solid rgba(15,23,42,0.8)';
                        avatar.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
                        avatar.title = user.name;
                        avatar.textContent = getUserInitials(user);
                        labelContainer.appendChild(avatar);
                    }
                });
            } else {
                labelContainer.innerHTML = '<span style="color: rgba(255,255,255,0.4);">Niemand zugewiesen</span>';
            }
        } else {
            container.innerHTML = '<li style="padding: 10px; opacity: 0.5;">Keine Benutzer gefunden</li>';
        }
    }

    async function toggleUserAssignmentCheckbox(userId) {
        const cb = document.getElementById(`user-cb-${userId}`);
        if (!cb) return;

        // Note: Task modal handles temporary selection IF it's a new task, 
        // OR updates database directly if editing.
        // For simplicity, let's keep direct updates if currentTask exists.

        let currentAssigned = currentTask ? (currentTask.assigned_to || []) : (window.tempAssigned || []);

        if (currentAssigned.includes(userId)) {
            currentAssigned = currentAssigned.filter(id => id !== userId);
        } else {
            currentAssigned.push(userId);
        }

        if (currentTask) {
            try {
                const { error } = await window.supabaseClient
                    .from('tasks')
                    .update({ assigned_to: currentAssigned })
                    .eq('id', currentTask.id);

                if (error) throw error;
                currentTask.assigned_to = currentAssigned;
                renderAssignedUsers(currentAssigned);
                fetchTasks();
            } catch (err) {
                console.error(err);
                cb.checked = !cb.checked; // Rollback
            }
        } else {
            // New task handling
            window.tempAssigned = currentAssigned;
            renderAssignedUsers(currentAssigned);
            cb.checked = currentAssigned.includes(userId);
        }
    }

    // ==========================================
    // HELPERS & VIEW CONTROLS
    // ==========================================
    // Die Aufgaben-Ansicht kennt nur noch das Board. Der frühere Tab
    // "Vorgänge" lebt jetzt in der eigenen Ansicht "Vorgänge".
    window.switchTaskView = function (view) {
        viewMode = (view === 'vorgaenge') ? 'board' : view;
        updateTaskTabActiveStates();

        const board = document.getElementById('tasks-board');
        if (board) board.classList.remove('hidden');
        const btnAddTask = document.getElementById('btn-add-task-header');
        if (btnAddTask) btnAddTask.style.display = '';

        renderTasks();
    };

    window.selectTaskViewTab = function (view) {
        filters.user = 'all';
        window.switchTaskView(view);
    };

    // Beibehalten, weil ältere Aufrufer sie noch anstoßen — tut nichts mehr.
    window.renderMyProcessesSection = function () { };

    function formatStatus(status) {
        const map = { 'open': 'Offen', 'in_progress': 'In Arbeit', 'completed': 'Fertig' };
        return map[status] || status;
    }

    function formatPriority(p) {
        const map = { 'low': 'Niedrig', 'medium': 'Mittel', 'high': 'Hoch', 'critical': 'Kritisch' };
        return map[p] || p;
    }

    // ==========================================
    // HELPERS
    // ==========================================
    function getUserInitials(user) {
        if (!user) return '?';
        if (user.initials) return user.initials; // Prioritize DB value

        const name = user.name || '';
        const parts = name.trim().split(' ');
        if (parts.length >= 2) {
            return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        }
        return name.substring(0, 2).toUpperCase() || '?';
    }

    function getUserColor(user) {
        if (!user) return 'rgba(255, 255, 255, 0.2)';
        if (user.color) return user.color; // Prioritize DB value

        const name = user.name || '';
        // Consistent hash function for colors
        let hash = 0;
        for (let i = 0; i < name.length; i++) {
            hash = name.charCodeAt(i) + ((hash << 5) - hash);
        }

        // Curated set of premium colors that look good in dark mode
        const colors = [
            'linear-gradient(135deg, #10b981 0%, #059669 100%)', // Emerald
            'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', // Blue
            'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)', // Violet
            'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', // Amber
            'linear-gradient(135deg, #ec4899 0%, #db2777 100%)', // Pink
            'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)', // Cyan
            'linear-gradient(135deg, #eab308 0%, #ca8a04 100%)'  // Yellow
        ];

        const index = Math.abs(hash) % colors.length;
        return colors[index];
    }

    function renderAvatars(assignedTo) {
        if (!assignedTo || assignedTo.length === 0) return '<span style="color: rgba(255,255,255,0.4); font-size: 0.85rem;">Nicht zugeordnet</span>';

        return assignedTo.map(uid => {
            const user = window.userList?.find(u => u.id === uid);
            if (!user) return '<span class="avatar-mini" title="Unbekannt">?</span>';
            const initials = getUserInitials(user);
            const bg = getUserColor(user);
            return `<span class="avatar-mini" style="background: ${bg};" title="${user.name || 'Unbekannt'}">${initials}</span>`;
        }).join('');
    }

    function renderProgress(task) {
        const total = task.subtasks?.length || 0;
        const done = task.subtasks?.filter(s => s.status === 'completed').length || 0;
        const pct = total > 0 ? (done / total) * 100 : 0;
        return `
            <div style="display: flex; align-items: center; gap: 8px;">
                <div class="progress-bar-bg" style="width: 60px; height: 6px;">
                    <div class="progress-bar-fg" style="width: ${pct}%"></div>
                </div>
                <span style="font-size: 0.8rem; opacity: 0.6;">${done}/${total}</span>
            </div>
        `;
    }

    function populateMachineFilters(machines) {
        // Filter menu
        const menu = document.getElementById('task-machine-filter-options');
        if (menu) {
            menu.innerHTML = '<li onclick="window.filterTasksByMachine(\'all\')" class="selected">Alle Maschinen</li>';
            machines.forEach(m => {
                const li = document.createElement('li');
                li.textContent = getMachineLabel(m);
                li.onclick = () => window.filterTasksByMachine(m.id);
                menu.appendChild(li);
            });
        }

        // Modal dropdown
        const select = document.getElementById('task-machine');
        if (select) {
            select.innerHTML = '<option value="">Keine Maschine</option>';
            machines.forEach(m => {
                const opt = document.createElement('option');
                opt.value = m.id;
                opt.textContent = getMachineLabel(m);
                select.appendChild(opt);
            });
        }
    }

    window.filterTasksByMachine = function (mid) {
        filters.machine = mid;
        let name = 'Alle Maschinen';
        if (mid !== 'all') {
            const mach = allTasks.find(t => String(t.machine_id) === String(mid))?.machines;
            name = mach ? getMachineLabel(mach) : 'Maschine';
        }
        const label = document.getElementById('task-current-machine-name');
        if (label) label.textContent = name;

        // Update selected class in menu
        document.querySelectorAll('#task-machine-filter-options li').forEach(li => {
            li.classList.toggle('selected', (mid === 'all' && li.textContent.includes('Alle')) || (li.textContent === name));
        });

        renderTasks();
    };



    // ==========================================
    // DRAG & DROP
    // ==========================================
    // ---- Subtask cross-task drag (registered once globally) ----
    if (!window._subtaskDragSetup) {
        window._subtaskDragSetup = true;
        window._subtaskDragInfo = null;

        window.startSubtaskDrag = function(e, subtaskId, fromTaskId) {
            window._subtaskDragInfo = { subtaskId: String(subtaskId), fromTaskId: String(fromTaskId) };
            e.dataTransfer.setData('subtask-move', subtaskId);
            e.dataTransfer.effectAllowed = 'move';
            e.stopPropagation();
            const el = e.currentTarget;
            setTimeout(() => { if (el) el.style.opacity = '0.35'; }, 0);
        };

        // Wohin soll die Unteraufgabe? Aus dem Element unter dem Zeiger:
        //   Karte  → Aufgabe (Ziel-Aufgabe)
        //   Gruppe → Übergruppe (sonst behält die Unteraufgabe ihre eigene)
        //   Zeile  → davor oder dahinter, je nach oberer/unterer Hälfte
        function subtaskZiel(e) {
            const card = e.target.closest('.task-card');
            if (!card) return null;
            const gruppe = e.target.closest('.subtask-group');
            const zeile = e.target.closest('.subtask-item');
            let nach = false;
            if (zeile) {
                const r = zeile.getBoundingClientRect();
                nach = e.clientY > r.top + r.height / 2;
            }
            return {
                toTaskId: String(card.dataset.id),
                supergroup: gruppe ? gruppe.dataset.supergroup : null,
                beforeId: zeile ? String(zeile.dataset.subtaskId) : null,
                nach: nach,
                card: card, gruppe: gruppe, zeile: zeile
            };
        }

        // Einwurf-Markierung: Linie über/unter der Zeile, sonst Rahmen um
        // Gruppe bzw. Karte.
        let zielMarkiert = [];
        function zielMarkieren(z) {
            zielMarkiert.forEach(el => { el.style.boxShadow = ''; el.style.outline = ''; });
            zielMarkiert = [];
            if (!z) return;
            if (z.zeile) {
                z.zeile.style.boxShadow = z.nach
                    ? '0 2px 0 0 #60a5fa' : '0 -2px 0 0 #60a5fa';
                zielMarkiert.push(z.zeile);
            } else if (z.gruppe) {
                z.gruppe.style.outline = '2px dashed rgba(96,165,250,0.7)';
                z.gruppe.style.outlineOffset = '2px';
                zielMarkiert.push(z.gruppe);
            } else {
                z.card.style.outline = '2px solid rgba(59,130,246,0.6)';
                z.card.style.outlineOffset = '-2px';
                zielMarkiert.push(z.card);
            }
        }

        document.addEventListener('dragover', (e) => {
            if (!window._subtaskDragInfo) return;
            const z = subtaskZiel(e);
            if (!z) { zielMarkieren(null); return; }
            if (z.beforeId === window._subtaskDragInfo.subtaskId) { zielMarkieren(null); return; }
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'move';
            zielMarkieren(z);
        }, true);

        document.addEventListener('dragend', (e) => {
            if (!window._subtaskDragInfo) return;
            const el = e.target.closest('.subtask-item');
            if (el) el.style.opacity = '1';
            zielMarkieren(null);
            window._subtaskDragInfo = null;
        });

        document.addEventListener('drop', async (e) => {
            if (!window._subtaskDragInfo) return;
            const z = subtaskZiel(e);
            if (!z) return;
            e.preventDefault();
            e.stopPropagation();
            const { subtaskId, fromTaskId } = window._subtaskDragInfo;
            window._subtaskDragInfo = null;
            zielMarkieren(null);
            if (z.beforeId === subtaskId) return;
            await subtaskVerschieben(subtaskId, fromTaskId, z);
        }, true);
    }

    // Wo eine Unteraufgabe in der Zielaufgabe landet: vor/hinter einer
    // Zeile, sonst ans Ende ihrer Übergruppe, sonst ans Ende der Aufgabe.
    function einfuegeIndex(toTask, supergroup, beforeId, nach) {
        const subs = toTask.subtasks || [];
        if (beforeId) {
            const i = subs.findIndex(s => String(s.id) === String(beforeId));
            if (i !== -1) return i + (nach ? 1 : 0);
        }
        let letzte = -1;
        subs.forEach((s, i) => { if ((s.supergroup || 'Allgemein') === (supergroup || 'Allgemein')) letzte = i; });
        return letzte === -1 ? subs.length : letzte + 1;
    }

    // Unteraufgabe verschieben — innerhalb der Aufgabe, in eine andere
    // Übergruppe oder in eine andere Aufgabe. Erst lokal umhängen und
    // zeichnen, dann speichern; schlägt das fehl, wird neu geladen.
    async function subtaskVerschieben(subtaskId, fromTaskId, ziel) {
        const fromTask = allTasks.find(t => String(t.id) === String(fromTaskId));
        const toTask = allTasks.find(t => String(t.id) === String(ziel.toTaskId));
        if (!fromTask || !toTask) return;
        const subIdx = (fromTask.subtasks || []).findIndex(s => String(s.id) === String(subtaskId));
        if (subIdx === -1) return;

        const [sub] = fromTask.subtasks.splice(subIdx, 1);
        if (!toTask.subtasks) toTask.subtasks = [];
        const supergroup = ziel.supergroup != null ? ziel.supergroup : (sub.supergroup || 'Allgemein');
        const idx = einfuegeIndex(toTask, supergroup, ziel.beforeId, ziel.nach);
        sub.supergroup = supergroup;
        sub.task_id = toTask.id;
        toTask.subtasks.splice(idx, 0, sub);
        renderTasks();

        try {
            const { error } = await updateSubtask(sub.id, { task_id: toTask.id, supergroup: supergroup });
            if (error) throw error;
            await subtaskReihenfolgeSpeichern(toTask);
            if (fromTask !== toTask) await subtaskReihenfolgeSpeichern(fromTask);
        } catch (err) {
            console.error('Unteraufgabe verschieben fehlgeschlagen:', err);
            window.showToast('Verschieben fehlgeschlagen: ' + (err.message || 'unbekannter Fehler'));
            window.fetchTasks();
        }
    }

    // Kopie einer Unteraufgabe an einer Stelle anlegen. Die Zeile wird
    // vollständig übernommen (auch Aktion, Planung), nur neu und offen.
    async function subtaskKopieAnlegen(quelle, toTask, supergroup, beforeId, nach) {
        const idx = einfuegeIndex(toTask, supergroup, beforeId, nach);
        const zeile = { ...quelle };
        delete zeile.id; delete zeile.created_at;
        zeile.task_id = toTask.id;
        zeile.supergroup = supergroup;
        zeile.status = 'open';
        zeile.sort_order = idx;
        try {
            // Platz schaffen: alles ab idx rückt eins nach hinten.
            const arbeit = (toTask.subtasks || []).slice(idx).map((s, i) => updateSubtask(s.id, { sort_order: idx + 1 + i }));
            const ergebnisse = await Promise.all(arbeit);
            const fehler = ergebnisse.find(r => r && r.error);
            if (fehler) throw fehler.error;
            const { error } = await window.insertSubtasks([zeile]);
            if (error) throw error;
            await window.fetchTasks();
        } catch (err) {
            console.error('Unteraufgabe kopieren fehlgeschlagen:', err);
            window.showToast('Einfügen fehlgeschlagen: ' + (err.message || 'unbekannter Fehler'));
            window.fetchTasks();
        }
    }

    // Ganze Aufgabe samt Unteraufgaben duplizieren.
    async function taskDuplizieren(task) {
        const zeile = { ...task };
        ['id', 'created_at', 'updated_at', 'completed_at', 'completed_by', 'machines', 'subtasks'].forEach(k => delete zeile[k]);
        zeile.title = (task.title || 'Aufgabe') + ' (Kopie)';
        zeile.status = 'open';
        if (window.activeUser && window.activeUser.id) zeile.created_by = window.activeUser.id;
        try {
            const { data, error } = await window.supabaseClient.from('tasks').insert([zeile]).select();
            if (error) throw error;
            const neu = data && data[0];
            if (neu && (task.subtasks || []).length) {
                const rows = task.subtasks.map((s, i) => {
                    const r = { ...s };
                    delete r.id; delete r.created_at;
                    r.task_id = neu.id; r.status = 'open'; r.sort_order = i;
                    return r;
                });
                const { error: subErr } = await window.insertSubtasks(rows);
                if (subErr) throw subErr;
            }
            window.showToast('Aufgabe dupliziert.');
            await window.fetchTasks();
        } catch (err) {
            console.error('Aufgabe duplizieren fehlgeschlagen:', err);
            window.showToast('Duplizieren fehlgeschlagen: ' + (err.message || 'unbekannter Fehler'));
        }
    }

    // ---- Rechtsklick-Menü: Duplizieren / Kopieren / Ausschneiden / Einfügen ----
    // Zwischenablage nur für diese Sitzung. 'schnitt' verschiebt beim
    // Einfügen, 'kopie' legt eine neue Zeile an.
    let subtaskZwischenablage = null;   // { sub, fromTaskId, modus }
    let kontextMenuEl = null;

    function kontextMenuSchliessen() {
        if (kontextMenuEl) { kontextMenuEl.remove(); kontextMenuEl = null; }
    }
    document.addEventListener('click', kontextMenuSchliessen);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') kontextMenuSchliessen(); });
    document.addEventListener('scroll', kontextMenuSchliessen, true);

    // Rechtsklick auf Unteraufgabe (subtaskId gesetzt), Übergruppe
    // (supergroup gesetzt) oder Karte (beides null).
    window.subtaskKontextmenu = function (e, taskId, subtaskId, supergroup) {
        e.preventDefault();
        e.stopPropagation();
        kontextMenuSchliessen();
        const task = allTasks.find(t => String(t.id) === String(taskId));
        if (!task) return;
        const sub = subtaskId ? (task.subtasks || []).find(s => String(s.id) === String(subtaskId)) : null;
        const gruppe = supergroup != null ? supergroup : (sub ? (sub.supergroup || 'Allgemein') : null);
        const ab = subtaskZwischenablage;
        const eintraege = [];

        if (sub) {
            eintraege.push({ text: 'Duplizieren', tu: () => subtaskKopieAnlegen(sub, task, gruppe, sub.id, true) });
            eintraege.push({ text: 'Kopieren', tu: () => { subtaskZwischenablage = { sub: { ...sub }, fromTaskId: task.id, modus: 'kopie' }; window.showToast('Kopiert — Rechtsklick auf die Zielstelle → Einfügen.'); } });
            eintraege.push({ text: 'Ausschneiden', tu: () => { subtaskZwischenablage = { sub: { ...sub }, fromTaskId: task.id, modus: 'schnitt' }; window.showToast('Ausgeschnitten — Rechtsklick auf die Zielstelle → Einfügen.'); } });
        } else if (gruppe == null) {
            eintraege.push({ text: 'Aufgabe duplizieren', tu: () => taskDuplizieren(task) });
        }
        if (ab && !(sub && String(ab.sub.id) === String(sub.id))) {
            const sicher = String(gruppe || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const wo = sub ? 'dahinter' : (gruppe != null ? `in „${sicher}"` : 'in diese Aufgabe');
            eintraege.push({
                text: `Einfügen ${wo}${ab.modus === 'schnitt' ? ' (verschieben)' : ''}`,
                tu: async () => {
                    const zielGruppe = gruppe != null ? gruppe : (ab.sub.supergroup || 'Allgemein');
                    if (ab.modus === 'schnitt') {
                        subtaskZwischenablage = null;
                        await subtaskVerschieben(ab.sub.id, ab.fromTaskId, {
                            toTaskId: task.id, supergroup: zielGruppe, beforeId: sub ? sub.id : null, nach: true
                        });
                    } else {
                        await subtaskKopieAnlegen(ab.sub, task, zielGruppe, sub ? sub.id : null, true);
                    }
                }
            });
        }
        if (!eintraege.length) return;

        const menu = document.createElement('div');
        menu.className = 'task-kontextmenu';
        menu.style.cssText = `position:fixed; left:${e.clientX}px; top:${e.clientY}px; z-index:100000; min-width:210px;
            background:#0b1220; border:1px solid rgba(255,255,255,0.15); border-radius:10px; padding:4px;
            box-shadow:0 12px 40px rgba(0,0,0,0.7); font-size:0.88rem; color:#fff;`;
        menu.innerHTML = eintraege.map((x, i) =>
            `<div data-i="${i}" style="padding:9px 14px; cursor:pointer; border-radius:7px;"
                  onmouseover="this.style.background='rgba(255,255,255,0.08)'" onmouseout="this.style.background=''">${x.text}</div>`).join('');
        menu.addEventListener('click', (ev) => {
            ev.stopPropagation();
            const li = ev.target.closest('[data-i]');
            if (!li) return;
            kontextMenuSchliessen();
            eintraege[Number(li.dataset.i)].tu();
        });
        menu.addEventListener('contextmenu', (ev) => ev.preventDefault());
        document.body.appendChild(menu);
        // Nicht aus dem Fenster laufen
        const r = menu.getBoundingClientRect();
        if (r.right > window.innerWidth) menu.style.left = Math.max(4, window.innerWidth - r.width - 4) + 'px';
        if (r.bottom > window.innerHeight) menu.style.top = Math.max(4, window.innerHeight - r.height - 4) + 'px';
        kontextMenuEl = menu;
    };
    // ---- End subtask drag ----

    function setupDragAndDrop() {
        const columns = document.querySelectorAll('.kanban-column');
        columns.forEach(col => {
            col.addEventListener('dragover', (e) => {
                if (window._subtaskDragInfo) return; // subtask drag, skip column highlight
                e.preventDefault();
                col.classList.add('drag-over');
            });

            col.addEventListener('dragleave', () => {
                col.classList.remove('drag-over');
            });

            col.addEventListener('drop', async (e) => {
                if (window._subtaskDragInfo) return; // handled by subtask drop listener
                e.preventDefault();
                col.classList.remove('drag-over');
                const taskId = e.dataTransfer.getData('text/plain');
                const newStatus = col.dataset.status;

                // Optimistic UI update
                const task = allTasks.find(t => String(t.id).trim().toLowerCase() === String(taskId).trim().toLowerCase());
                if (task && task.status !== newStatus) {
                    const oldStatus = task.status;
                    const oldCompletedAt = task.completed_at;
                    const oldCompletedBy = task.completed_by;

                    const completedAt = newStatus === 'completed' ? new Date().toISOString() : null;
                    const completedBy = newStatus === 'completed' ? (window.activeUser?.id || null) : null;

                    task.status = newStatus;
                    task.completed_at = completedAt;
                    task.completed_by = completedBy;
                    renderTasks();

                    // Supabase update
                    try {
                        let { error } = await window.supabaseClient.from('tasks').update({
                            status: newStatus,
                            completed_at: completedAt,
                            completed_by: completedBy
                        }).eq('id', taskId);

                        if (error) {
                            const retry = await window.supabaseClient.from('tasks').update({ status: newStatus }).eq('id', taskId);
                            if (retry.error) throw retry.error;
                        }
                    } catch (err) {
                        console.error('Drag drop save error:', err);
                        task.status = oldStatus;
                        task.completed_at = oldCompletedAt;
                        task.completed_by = oldCompletedBy;
                        fetchTasks(); // Rollback if failed
                    }
                }
            });
        });
    }

    // ==========================================
    window.currentAppMode = 'normal';

    window.updateFocusModeVisuals = function() {
        const btn = document.getElementById('focus-mode-btn');
        if (!btn) return;
        
        if (window.currentAppMode === 'service') {
            btn.style.color = 'var(--color-primary-green)';
            btn.style.borderColor = 'var(--color-primary-green)';
        } else if (window.currentAppMode === 'focus') {
            btn.style.color = ''; // defaults to red via css
            btn.style.borderColor = ''; 
        } else {
            btn.style.color = '';
            btn.style.borderColor = '';
        }
    };

    window.activateMode = function(mode) {
        window.currentAppMode = mode;
        if (!document.body.classList.contains('focus-mode-active')) {
            window.toggleFocusMode(true);
        } else {
            renderTasks();
            window.updateFocusModeVisuals();
        }
    };

    let _focusModeContainerOriginalParent = null;
    let _focusModeContainerNextSibling = null;

    function _repositionFocusModeContainer(isActive) {
        const container = document.getElementById('focus-mode-container');
        if (!container) return;

        if (isActive) {
            _focusModeContainerOriginalParent = container.parentNode;
            _focusModeContainerNextSibling = container.nextSibling;
            document.body.appendChild(container);
            container.style.cssText = 'position: fixed; bottom: 27px; right: 20px; z-index: 10000; display: flex; align-items: center; justify-content: center;';
        } else {
            if (_focusModeContainerOriginalParent) {
                _focusModeContainerOriginalParent.insertBefore(container, _focusModeContainerNextSibling);
                _focusModeContainerOriginalParent = null;
                _focusModeContainerNextSibling = null;
            }
            container.style.cssText = 'display: flex; align-items: center; position: relative;';
        }
    }

    window.toggleFocusMode = function (keepMode = false) {
        document.body.classList.toggle('focus-mode-active');
        const isActive = document.body.classList.contains('focus-mode-active');

        if (!isActive) {
            window.currentAppMode = 'normal';
        } else if (keepMode !== true) {
            window.currentAppMode = 'focus';
        }

        _repositionFocusModeContainer(isActive);
        window.updateFocusModeVisuals();
        renderTasks();

        // Stop Cinema Mode if leaving Focus Mode
        if (!isActive && cinemaActive) {
            window.toggleCinemaMode();
        }

        if (isActive) {
            // Automatically switch to tasks view and force board mode
            if (window.navigateTo) {
                window.navigateTo('tasks');
            }
            if (typeof window.switchTaskView === 'function') {
                window.switchTaskView('board');
            }
            if (typeof window.applyCinemaColumns === 'function') {
                window.applyCinemaColumns();
            }
        }
    };

    // ==========================================
    // CINEMA MODE
    // ==========================================
    let cinemaActive = false;
    let cinemaRequestId = null;

    // Anzahl der nebeneinander angezeigten Aufgaben (1–3) im Fokus-/Kino-Modus.
    window.applyCinemaColumns = function () {
        const board = document.getElementById('tasks-board');
        if (!board) return;
        const n = parseInt(localStorage.getItem('cinemaColumns') || '2', 10);
        board.classList.remove('cinema-cols-1', 'cinema-cols-2', 'cinema-cols-3');
        board.classList.add('cinema-cols-' + (n >= 1 && n <= 3 ? n : 2));
        document.querySelectorAll('#cinema-cols-ui .cinema-col-btn').forEach(b => {
            b.classList.toggle('active', String(b.dataset.cols) === String(n));
        });
    };
    window.setCinemaColumns = function (n) {
        localStorage.setItem('cinemaColumns', String(n));
        window.applyCinemaColumns();
    };

    // Werkstatt-Liste im Kino-Modus ein-/ausblenden (Haken neben der
    // Spaltenwahl). Die Wahl bleibt im localStorage; ausserhalb des
    // Kino-Modus ist die Liste immer sichtbar.
    window.applyCinemaWorkshopVisibility = function () {
        const visible = localStorage.getItem('cinemaShowWorkshop') !== '0';
        document.body.classList.toggle('cinema-hide-workshop', !visible);
        const cb = document.getElementById('cinema-workshop-toggle');
        if (cb) cb.checked = visible;
    };
    window.setCinemaWorkshopVisible = function (visible) {
        localStorage.setItem('cinemaShowWorkshop', visible ? '1' : '0');
        window.applyCinemaWorkshopVisibility();
    };

    // ==========================================
    // EINZELNE AUFGABEN AUS DEM KINO-MODUS NEHMEN
    // ==========================================
    // Auge oben rechts auf der Karte. Durchgestrichenes Auge = die Karte
    // läuft im Kino-Modus nicht mit, überall sonst bleibt sie sichtbar.
    // Bewusst gerätebezogen (localStorage, wie cinemaColumns und
    // cinemaShowWorkshop): der Kino-Modus ist die Fernseher-Darstellung in
    // der Werkstatt, was dort durchläuft, geht andere Geräte nichts an.
    const CINEMA_HIDDEN_KEY = 'cinemaHiddenTasks';

    function readCinemaHidden() {
        try {
            const raw = localStorage.getItem(CINEMA_HIDDEN_KEY);
            const list = raw ? JSON.parse(raw) : [];
            return new Set(Array.isArray(list) ? list.map(String) : []);
        } catch (e) {
            return new Set();
        }
    }

    let cinemaHidden = readCinemaHidden();

    window.isTaskCinemaHidden = function (id) {
        return cinemaHidden.has(String(id));
    };

    window.cinemaHideButtonHtml = function (id) {
        const hidden = window.isTaskCinemaHidden(id);
        const eye = hidden
            // Auge mit Strich — wird im Kino-Modus ausgeblendet
            ? '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"></path><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"></path><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"></path><line x1="2" y1="2" x2="22" y2="22"></line>'
            : '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>';
        const title = hidden ? 'Läuft im Kino-Modus nicht mit — klicken zum Einblenden' : 'Im Kino-Modus ausblenden';
        return `<button class="btn-cinema-hide${hidden ? ' is-hidden' : ''}" id="cinema-hide-${id}"
                    onclick="event.stopPropagation(); window.toggleTaskCinemaHidden('${id}')" title="${title}">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${eye}</svg>
                </button>`;
    };

    window.toggleTaskCinemaHidden = function (id) {
        const key = String(id);
        if (cinemaHidden.has(key)) cinemaHidden.delete(key);
        else cinemaHidden.add(key);

        try { localStorage.setItem(CINEMA_HIDDEN_KEY, JSON.stringify(Array.from(cinemaHidden))); } catch (e) { }

        // Nur die eine Karte anfassen — ein Neuaufbau des Boards würde im
        // laufenden Kino-Modus mitten im Scrollen springen.
        const card = document.getElementById('task-' + key);
        if (card) {
            card.classList.toggle('cinema-hidden', cinemaHidden.has(key));
            const btn = document.getElementById('cinema-hide-' + key);
            if (btn) btn.outerHTML = window.cinemaHideButtonHtml(key);
        }

        if (typeof window.showToast === 'function') {
            window.showToast(cinemaHidden.has(key)
                ? 'Aufgabe läuft im Kino-Modus nicht mehr mit.'
                : 'Aufgabe läuft im Kino-Modus wieder mit.');
        }
    };

    window.toggleCinemaMode = function () {
        const btn = document.getElementById('btn-cinema-toggle');
        const floatingBtn = document.getElementById('cinema-floating-btn');
        cinemaActive = !cinemaActive;

        if (cinemaActive) {
            // Force Focus Mode if not active
            if (!document.body.classList.contains('focus-mode-active')) {
                window.toggleFocusMode();
            }
            document.body.classList.add('cinema-mode-active');
            window.applyCinemaWorkshopVisibility();
            btn.classList.add('active');
            if (floatingBtn) floatingBtn.classList.add('active');
            startCinemaScrolling();
        } else {
            document.body.classList.remove('cinema-mode-active');
            window.closeMobileSidebar && window.closeMobileSidebar();
            btn.classList.remove('active');
            if (floatingBtn) floatingBtn.classList.remove('active');
            if (cinemaRequestId) {
                cancelAnimationFrame(cinemaRequestId);
                cinemaRequestId = null;
            }
        }
    };

    function startCinemaScrolling() {
        if (!cinemaActive) return;

        let lastTime = performance.now();
        let bottomReachedTime = null;
        let isResetting = false;
        
        // In Focus Mode, the whole body scrolls. In normal mode, it's also the body/documentElement.
        // We always use document.documentElement for global scrolling consistency.
        const scrollContainer = document.documentElement;

        // Keep track of the precise scroll position for sub-pixel smoothness
        let preciseScrollTop = window.pageYOffset || scrollContainer.scrollTop;

        function scrollStep(currentTime) {
            if (!cinemaActive || isResetting) return;

            const deltaTime = currentTime - lastTime;
            lastTime = currentTime;

            const speed = parseFloat(document.getElementById('cinema-speed-slider')?.value || 1.0);
            
            // Smoother speed calculation: 0.8 pixels per frame at 60fps (base speed 1.0)
            const pixelsToScroll = (speed * 0.8) * (deltaTime / 16.67);

            const maxScroll = scrollContainer.scrollHeight - scrollContainer.clientHeight;

            // If content is shorter than viewport, nothing to scroll
            if (maxScroll <= 0) {
                cinemaRequestId = requestAnimationFrame(scrollStep);
                return;
            }

            if (preciseScrollTop < maxScroll - 2) {
                preciseScrollTop += pixelsToScroll;
                // Apply the scroll
                window.scrollTo(0, preciseScrollTop);
                
                bottomReachedTime = null;
                cinemaRequestId = requestAnimationFrame(scrollStep);
            } else {
                // Bottom reached
                if (!bottomReachedTime) bottomReachedTime = currentTime;

                // Wait 4 seconds at the bottom
                if (currentTime - bottomReachedTime > 4000) {
                    isResetting = true;
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                    
                    // Wait for smooth scroll to finish (approx 1s) + pause at top
                    setTimeout(() => {
                        if (cinemaActive) {
                            isResetting = false;
                            lastTime = performance.now();
                            preciseScrollTop = 0; // Reset tracking
                            cinemaRequestId = requestAnimationFrame(scrollStep);
                        }
                    }, 4000); 
                } else {
                    cinemaRequestId = requestAnimationFrame(scrollStep);
                }
            }
        }
        cinemaRequestId = requestAnimationFrame(scrollStep);
    }

    window.openProtocolFromTask = function (machineId, protocolId, actionType) {
        if (actionType && actionType.startsWith('document:')) {
            const rawData = actionType.substring(9);
            const parts = rawData.split('|||');
            const url = parts[0] || '';
            const name = parts[1] || 'Dokument';
            const mimeType = parts[2] || '';
            if (typeof window.previewDocument === 'function') {
                window.previewDocument(url, name, mimeType);
            } else {
                window.open(url, '_blank');
            }
            return;
        }

        if (actionType === 'intake' && typeof window.openIntakeProtocol === 'function') {
            window.openIntakeProtocol(machineId, protocolId === 'null' ? null : protocolId);
        } else if (actionType === 'acceptance' && typeof window.openAcceptanceProtocol === 'function') {
            window.openAcceptanceProtocol(machineId, protocolId === 'null' ? null : protocolId);
        } else {
            console.warn('Unknown action type or protocol function missing:', actionType);
        }
    };
    window.saveTaskAsQuickTemplate = async function(taskId) {
        const task = allTasks.find(t => String(t.id).trim().toLowerCase() === String(taskId).trim().toLowerCase());
        if (!task) return;

        // Visual feedback
        const btn = document.getElementById(`star-${taskId}`) || document.getElementById(`star-card-${taskId}`);
        if (btn) btn.classList.add('active');

        const confirmSave = confirm("Möchtest du diese Aufgabe als Schnellvorlage speichern?");
        if (!confirmSave) {
            if (btn) btn.classList.remove('active');
            return;
        }

        const templateName = prompt("Name der Schnellvorlage:", task.title);
        if (!templateName) {
            if (btn) btn.classList.remove('active');
            return;
        }

        try {
            // Structure task into template groups
            const grouped = {};
            task.subtasks.forEach(sub => {
                const sg = sub.supergroup || 'Allgemein';
                if (!grouped[sg]) grouped[sg] = [];
                grouped[sg].push({ title: sub.title, action_type: sub.action_type });
            });

            const structure = Object.keys(grouped).map(name => ({
                name: name,
                subtasks: grouped[name]
            }));

            const { error } = await window.supabaseClient
                .from('task_quick_templates')
                .insert([{
                    name: templateName,
                    structure: structure
                }]);

            if (error) throw error;

            window.showToast(`Schnellvorlage "${templateName}" wurde erfolgreich gespeichert!`);
            
            // Fetch updated templates if the function exists
            if (typeof window.fetchQuickTemplates === 'function') {
                window.fetchQuickTemplates();
            }

        } catch (err) {
            console.error('Error saving template:', err);
            window.showToast("Fehler beim Speichern der Vorlage.");
        } finally {
            if (btn) {
                btn.style.background = '';
                btn.style.borderColor = '';
                btn.style.color = '';
                btn.classList.remove('glow-yellow');
            }
        }
    };
    // ------------------------------------------------------------------
    // Direktes Schreiben in eine Unteraufgabe auf der Tafel
    // ------------------------------------------------------------------
    // Gespeichert wird beim Tippen (kurz gebündelt), nicht erst beim Verlassen
    // des Feldes — und mit Rückmeldung, damit man sieht, dass es drin ist.
    //
    // Wichtig: die Unteraufgaben stehen in der Tabelle `subtasks` (fetchTasks
    // holt sie per Join). Die frühere Fassung schrieb in eine Spalte
    // `tasks.subtasks` — das lief ohne Fehler durch, war beim nächsten Laden
    // aber wieder weg.
    const subtaskSaveTimer = new Map();
    let subtaskSaveToast = 0;

    // Nach dem Schreiben zurückgehaltene Live-Änderungen nachziehen.
    document.addEventListener('focusout', (e) => {
        if (e.target && e.target.classList && e.target.classList.contains('ghost-input')) {
            setTimeout(() => window.tasksRefetchIfPending(), 100);
        }
    });

    window.scheduleSubtaskSave = function (el, subtaskId) {
        clearTimeout(subtaskSaveTimer.get(subtaskId));
        subtaskSaveTimer.set(subtaskId, setTimeout(() => saveSubtaskTitle(el, subtaskId), 700));
    };

    window.saveSubtaskNow = function (el, subtaskId) {
        clearTimeout(subtaskSaveTimer.get(subtaskId));
        subtaskSaveTimer.delete(subtaskId);
        saveSubtaskTitle(el, subtaskId);
    };

    async function saveSubtaskTitle(el, subtaskId) {
        if (!el || !subtaskId) return;
        const neu = el.textContent.trim();

        // Bestand im Speicher finden, damit unnötige Schreibvorgänge entfallen
        // und die Tafel nach dem Speichern nicht springt.
        let treffer = null;
        for (const t of allTasks) {
            const s = (t.subtasks || []).find(x => String(x.id) === String(subtaskId));
            if (s) { treffer = s; break; }
        }
        if (treffer && treffer.title === neu) return;

        try {
            const { error } = await window.supabaseClient
                .from('subtasks')
                .update({ title: neu })
                .eq('id', subtaskId);
            if (error) throw error;

            if (treffer) treffer.title = neu;
            el.dataset.saved = '1';
            setTimeout(() => { delete el.dataset.saved; }, 1200);

            // Beim Tippen nicht bei jedem Halbsatz eine Meldung — höchstens
            // alle drei Sekunden eine.
            if (Date.now() - subtaskSaveToast > 3000) {
                subtaskSaveToast = Date.now();
                window.showToast && window.showToast('Gespeichert');
            }
        } catch (err) {
            console.error('Unteraufgabe konnte nicht gespeichert werden:', err);
            window.showToast && window.showToast('Nicht gespeichert: ' + (err.message || err), 'error');
        }
    }

    window.toggleTaskStatus = async function (taskId, currentStatus) {
        const newStatus = currentStatus === 'completed' ? 'open' : 'completed';
        const completedAt = newStatus === 'completed' ? new Date().toISOString() : null;
        const completedBy = newStatus === 'completed' ? (window.activeUser?.id || null) : null;
        try {
            const task = allTasks.find(t => String(t.id).trim().toLowerCase() === String(taskId).trim().toLowerCase());
            if (task) {
                task.status = newStatus;
                task.completed_at = completedAt;
                task.completed_by = completedBy;
                renderTasks();
            }
            let { error } = await window.supabaseClient.from('tasks').update({
                status: newStatus,
                completed_at: completedAt,
                completed_by: completedBy
            }).eq('id', taskId);

            if (error) {
                // Fallback: column missing or NOT NULL constraint — try status-only update
                const retry = await window.supabaseClient.from('tasks').update({ status: newStatus }).eq('id', taskId);
                if (retry.error) throw retry.error;
            }
        } catch (err) {
            console.error('Error toggling task status:', err);
            fetchTasks();
        }
    };

    window.toggleSubtaskStatus = async function (taskId, subtaskIndex, currentStatus) {
        const newStatus = currentStatus === 'completed' ? 'open' : 'completed';
        try {
            const task = allTasks.find(t => String(t.id).trim().toLowerCase() === String(taskId).trim().toLowerCase());
            if (task && task.subtasks && task.subtasks[subtaskIndex]) {
                const subtask = task.subtasks[subtaskIndex];
                subtask.status = newStatus;
                renderTasks();
                
                const { error } = await window.supabaseClient
                    .from('subtasks')
                    .update({ status: newStatus })
                    .eq('id', subtask.id);
                if (error) throw error;
            }
        } catch (err) {
            console.error('Error toggling subtask status:', err);
            fetchTasks();
        }
    };
})();
