
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
    let filters = {
        machine: 'all',
        search: ''
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
                    e.stopPropagation();
                    const isVisible = menu.style.display === 'block';
                    // Close others
                    document.querySelectorAll('.custom-filter-menu').forEach(m => m.style.display = 'none');
                    menu.style.display = isVisible ? 'none' : 'block';
                };
            }
        });

        document.addEventListener('click', () => {
            document.querySelectorAll('.custom-filter-menu').forEach(m => m.style.display = 'none');
        });
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
                    machines(manufacturer, name, serial, year),
                    subtasks(*)
                `)
                .order('created_at', { ascending: false });

            if (error) throw error;
            allTasks = data || [];

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

            return matchesSearch && matchesMachine && isServiceMatch;
        });

        if (viewMode === 'board') {
            renderBoard(filteredTasks);
        } else if (viewMode === 'list') {
            renderList(filteredTasks);
        } else if (viewMode === 'machines') {
            renderMachinesView(filteredTasks);
        }
    }
    window.renderTasks = renderTasks;

    function renderBoard(tasks) {
        document.getElementById('tasks-list').classList.add('hidden');
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

    function renderList(tasks) {
        document.getElementById('tasks-board').classList.add('hidden');
        const containerM = document.getElementById('tasks-machines');
        if (containerM) containerM.classList.add('hidden');
        document.getElementById('tasks-list').classList.remove('hidden');

        const tbody = document.getElementById('task-table-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        const openTasks = tasks.filter(t => t.status !== 'completed');
        const completedTasks = tasks.filter(t => t.status === 'completed');

            openTasks.forEach(task => {
                const tr = document.createElement('tr');
                const accentColor = '#ef4444'; // Red for open
                
                tr.className = 'task-list-row-premium status-open';
                tr.style.cursor = 'pointer';
                tr.style.overflow = 'hidden';

                tr.innerHTML = `
                    <td data-label="Aufgabe" style="font-weight: 600; display:flex; align-items:flex-start; gap:12px;">
                        <div style="padding-top: 4px;">
                            <div class="task-quick-complete ${task.status === 'completed' ? 'completed' : ''}" onclick="event.stopPropagation(); window.toggleTaskStatus('${task.id}', '${task.status}')" title="${task.status === 'completed' ? 'Wieder öffnen' : 'Als erledigt markieren'}">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                            </div>
                        </div>
                        <div style="display:flex; flex-direction:column; gap:4px;">
                            <span style="font-size: 1.1rem; font-weight: 700;">${task.title}</span>
                            ${task.subtasks && task.subtasks.length > 0 ? `
                            <div class="task-list-subtasks" style="display: flex; flex-direction: column; gap: 4px; margin-top: 4px;">
                                ${task.subtasks.map((sub, index) => `
                                    <div class="subtask-item" style="display:flex; align-items:center; gap: 8px; justify-content: space-between;">
                                        <div style="display: flex; align-items: center; gap: 8px; flex: 1;">
                                            <div class="task-quick-complete ${sub.status === 'completed' ? 'completed' : ''}" 
                                                 onclick="event.stopPropagation(); window.toggleSubtaskStatus('${task.id}', ${index}, '${sub.status}')" 
                                                 style="width: 18px; height: 18px; min-width: 18px;"
                                                 title="${sub.status === 'completed' ? 'Wieder öffnen' : 'Als erledigt markieren'}">
                                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                            </div>
                                            <span style="font-size: 0.9rem; color: rgba(255,255,255,0.8);">${sub.title}</span>
                                        </div>
                                        ${sub.action_type ? (() => {
                                             const isDoc = sub.action_type.startsWith('document:');
                                             const isService = sub.action_type.startsWith('servicebericht:');
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
                                                 clickHandler = `window.openServiceberichtFromTask('${task.machine_id}', '${sub.action_type}', '${task.id}', ${index}, '${sub.id || ''}')`;
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
                                             <div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
                                                 <span style="${badgeStyle} border-radius: 4px; padding: 2px 6px; font-size: 0.65rem; font-weight: 800; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${textLabel}">
                                                     ${textLabel}
                                                 </span>
                                                 <button onclick="event.stopPropagation(); ${clickHandler}" 
                                                     title="${btnTitle}"
                                                     style="${btnStyle} border-radius: 6px; width: 26px; height: 26px; display: flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; flex-shrink: 0; transition: all 0.2s;">
                                                     ${buttonIcon}
                                                 </button>
                                             </div>
                                             `;
                                        })() : ''}
                                    </div>
                                `).join('')}
                            </div>
                            ` : ''}
                        </div>
                    </td>
                    <td data-label="Maschine">
                        ${task.machines ? `<span style="color: var(--color-primary-green); font-weight: 700; font-size: 0.98rem;">${getMachineLabel(task.machines)}</span>` : '<span style="color: rgba(255,255,255,0.4)">-</span>'}
                    </td>
                    <td data-label="Beteiligte">${renderAvatars(task.assigned_to)}</td>
                    <td data-label="Fortschritt">${renderProgress(task)}</td>
                    <td data-label="Aktionen" onclick="event.stopPropagation()">
                        <div style="display: flex; gap: 8px; align-items: center; justify-content: flex-end;">
                            <button id="star-${task.id}" onclick="event.stopPropagation(); window.saveTaskAsQuickTemplate('${task.id}')" title="Als Schnellvorlage speichern"
                                class="btn-star-premium btn-premium-action" style="width: 36px; height: 36px;">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                                </svg>
                            </button>
                            <button onclick="event.stopPropagation(); window.openTaskModal('${task.id}')" title="Bearbeiten"
                                style="width:36px; height:36px; border-radius:50%; background: rgba(59,130,246,0.2); border: 1.5px solid rgba(59,130,246,0.5); color: #60a5fa; display:flex; align-items:center; justify-content:center; cursor:pointer; transition: all 0.2s;"
                                onmouseover="this.style.background='rgba(59,130,246,0.4)'" onmouseout="this.style.background='rgba(59,130,246,0.2)'">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                    <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                </svg>
                            </button>
                            <button class="delete-permission-required" onclick="event.stopPropagation(); window.deleteTask('${task.id}')" title="Löschen"
                                style="width:36px; height:36px; border-radius:50%; background: rgba(239,68,68,0.2); border: 1.5px solid rgba(239,68,68,0.5); color: #f87171; display:flex; align-items:center; justify-content:center; cursor:pointer; transition: all 0.2s;"
                                onmouseover="this.style.background='rgba(239,68,68,0.4)'" onmouseout="this.style.background='rgba(239,68,68,0.2)'">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                    <polyline points="3 6 5 6 21 6"></polyline>
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                </svg>
                            </button>
                        </div>
                `;
            tr.onclick = () => window.openTaskModal(task.id);
            tbody.appendChild(tr);
        });

        if (completedTasks.length > 0) {
            // Add a toggle row for completed tasks
            const toggleTr = document.createElement('tr');
            toggleTr.style.cursor = 'pointer';
            toggleTr.style.background = 'rgba(255,255,255,0.02)';
            toggleTr.innerHTML = `
                <td colspan="8" style="padding: 1rem 1.25rem;">
                    <div style="display: flex; align-items: center; justify-content: space-between; font-weight: 700; color: rgba(255,255,255,0.6);" onclick="event.stopPropagation(); window.showCompletedTasks = !window.showCompletedTasks; window.renderTasks();">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="font-size: 0.95rem;">Erledigte Aufgaben (${completedTasks.length})</span>
                        </div>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="transition: transform 0.2s; transform: ${window.showCompletedTasks ? 'rotate(180deg)' : 'rotate(0deg)'};">
                            <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                    </div>
                </td>
            `;
            tbody.appendChild(toggleTr);

            if (window.showCompletedTasks) {
                completedTasks.forEach(task => {
                    const tr = document.createElement('tr');
                    const accentColor = '#10b981'; // Green for completed
                    
                    tr.style.cursor = 'pointer';
                    tr.style.background = 'rgba(110, 122, 140, 0.45)';
                    tr.style.backdropFilter = 'blur(24px)';
                    tr.style.webkitBackdropFilter = 'blur(24px)';
                    tr.style.boxShadow = `inset 0 1.5px 0 0 ${accentColor}66, inset -1.5px 0 0 0 ${accentColor}66, inset 0 -1.5px 0 0 ${accentColor}66, 0 10px 30px rgba(0,0,0,0.4)`;
                    tr.style.borderRadius = '16px';
                    tr.style.overflow = 'hidden';
                    tr.style.opacity = '0.7';

                    tr.innerHTML = `
                        <td data-label="Aufgabe" style="font-weight: 600; display:flex; align-items:flex-start; gap:12px; box-shadow: inset 5px 0 0 0 ${accentColor}; border-top-left-radius: 16px; border-bottom-left-radius: 16px;">
                            <div style="padding-top: 4px;">
                                <div class="task-quick-complete ${task.status === 'completed' ? 'completed' : ''}" onclick="event.stopPropagation(); window.toggleTaskStatus('${task.id}', '${task.status}')" title="${task.status === 'completed' ? 'Wieder öffnen' : 'Als erledigt markieren'}">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                </div>
                            </div>
                            <div style="display:flex; flex-direction:column; gap:4px;">
                                <span style="font-size: 1.1rem; font-weight: 700;">${task.title}</span>
                                ${task.completed_at ? `
                                <span style="font-size: 0.8rem; color: rgba(255,255,255,0.5); margin-top: 2px;">
                                    Erledigt am ${new Date(task.completed_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })} Uhr
                                    ${task.completed_by ? `von ${(() => {
                                        const u = (window.userList || []).find(usr => String(usr.id) === String(task.completed_by));
                                        return u ? u.name : 'Unbekannt';
                                    })()}` : ''}
                                </span>
                                ` : ''}
                                  ${(function() {
                                     if (!task.subtasks || task.subtasks.length === 0) return '';
                                     const grouped = {};
                                     task.subtasks.forEach((sub, idx) => {
                                         const sg = sub.supergroup || 'Allgemein';
                                         if (!grouped[sg]) grouped[sg] = [];
                                         grouped[sg].push({ ...sub, idx });
                                     });
                                     
                                     let html = '<div style="margin-top: 10px; display: flex; flex-direction: column; gap: 10px;">';
                                     for (const [groupName, subs] of Object.entries(grouped)) {
                                         html += `<div>
                                             <div style="font-size: 0.7rem; font-weight: 800; color: var(--color-primary-green); margin-bottom: 4px; text-transform: uppercase; opacity: 0.6;">${groupName}</div>`;
                                         subs.forEach(sub => {
                                             html += `
                                             <div class="subtask-item" style="display:flex; align-items:center; gap: 8px; margin-bottom: 4px; justify-content: space-between;">
                                                 <div style="display: flex; align-items: center; gap: 8px; flex: 1;">
                                                     <div class="task-quick-complete ${sub.status === 'completed' ? 'completed' : ''}" 
                                                          onclick="event.stopPropagation(); window.toggleSubtaskStatus('${task.id}', ${sub.idx}, '${sub.status}')" 
                                                          style="width: 16px; height: 16px; min-width: 16px;">
                                                         <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                                     </div>
                                                     <input type="text" class="ghost-input" value="${sub.title}" 
                                                        onblur="window.updateSubtaskTitle('${task.id}', ${sub.idx}, this.value)"
                                                        onkeydown="if(event.key === 'Enter') this.blur()"
                                                        onclick="event.stopPropagation()"
                                                        style="color: rgba(255,255,255,${sub.status === 'completed' ? '0.4' : '0.8'}); ${sub.status === 'completed' ? 'text-decoration: line-through;' : ''}">
                                                 </div>
                                                 ${sub.action_type ? (() => {
                                                      const isDoc = sub.action_type.startsWith('document:');
                                                      const isService = sub.action_type.startsWith('servicebericht:');
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
                                                      <div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
                                                          <span style="${badgeStyle} border-radius: 4px; padding: 2px 6px; font-size: 0.65rem; font-weight: 800; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                                                              ${textLabel}
                                                          </span>
                                                          <button onclick="event.stopPropagation(); ${clickHandler}" 
                                                              title="${btnTitle}"
                                                              style="${btnStyle} border-radius: 6px; width: 26px; height: 26px; display: flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; flex-shrink: 0; transition: all 0.2s;">
                                                              ${buttonIcon}
                                                          </button>
                                                      </div>
                                                      `;
                                                  })() : ''}
                                             </div>`;
                                         });
                                         html += '</div>';
                                     }
                                     html += '</div>';
                                     return html;
                                 })()}
                            </div>
                        </td>
                        <td data-label="Maschine">
                            ${task.machines ? `<span style="color: var(--color-primary-green); font-weight: 700; font-size: 0.98rem;">${getMachineLabel(task.machines)}</span>` : '<span style="color: rgba(255,255,255,0.4)">-</span>'}
                        </td>
                        <td data-label="Beteiligte">${renderAvatars(task.assigned_to)}</td>
                        <td data-label="Fortschritt">${renderProgress(task)}</td>
                        <td data-label="Aktionen" onclick="event.stopPropagation()">
                            <div style="display: flex; gap: 12px; align-items: center; justify-content: flex-end;">
                                <!-- Protocol Button for List View -->
                                <div style="min-width: 150px;">
                                    ${getProtocolButtonForTask(task)}
                                </div>
                                <button onclick="event.stopPropagation(); window.openTaskModal('${task.id}')" title="Bearbeiten"
                                    style="width:36px; height:36px; border-radius:50%; background: rgba(59,130,246,0.2); border: 1.5px solid rgba(59,130,246,0.5); color: #60a5fa; display:flex; align-items:center; justify-content:center; cursor:pointer; transition: all 0.2s;"
                                    onmouseover="this.style.background='rgba(59,130,246,0.4)'" onmouseout="this.style.background='rgba(59,130,246,0.2)'">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                        <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                    </svg>
                                </button>
                                <button class="delete-permission-required" onclick="event.stopPropagation(); window.deleteTask('${task.id}')" title="Löschen"
                                    style="width:36px; height:36px; border-radius:50%; background: rgba(239,68,68,0.2); border: 1.5px solid rgba(239,68,68,0.5); color: #f87171; display:flex; align-items:center; justify-content:center; cursor:pointer; transition: all 0.2s;"
                                    onmouseover="this.style.background='rgba(239,68,68,0.4)'" onmouseout="this.style.background='rgba(239,68,68,0.2)'">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                        <polyline points="3 6 5 6 21 6"></polyline>
                                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                    </svg>
                                </button>
                            </div>
                        </td>
                    `;
                    tr.onclick = () => window.openTaskModal(task.id);
                    tbody.appendChild(tr);
                });
            }
        }
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

        const subtasksTotal = task.subtasks?.length || 0;
        const subtasksDone = task.subtasks?.filter(s => s.status === 'completed').length || 0;
        const progress = subtasksTotal > 0 ? Math.round((subtasksDone / subtasksTotal) * 100) : 0;

        div.innerHTML = `
            <div class="task-card-header">
                <div style="display:flex; align-items:flex-start; gap:8px; max-width:100%; word-break:break-word;">
                    <div class="task-quick-complete ${task.status === 'completed' ? 'completed' : ''}" onclick="event.stopPropagation(); window.toggleTaskStatus('${task.id}', '${task.status}')" title="${task.status === 'completed' ? 'Wieder öffnen' : 'Als erledigt markieren'}" style="margin-top: 2px;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    </div>
                    ${task.machines ? `<span style="color: var(--color-primary-green); font-weight: 800; font-size: 1.05rem; white-space:normal; line-height: 1.2;" title="${getMachineLabel(task.machines)}">${getMachineLabel(task.machines)}</span>` : ''}
                </div>
                <div class="task-card-actions" style="display: flex; gap: 6px; align-items: center;">
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
            ${task.description ? `<div class="task-card-desc">${task.description.substring(0, 60)}${task.description.length > 60 ? '...' : ''}</div>` : ''}
            
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
                    const sg = sub.supergroup || 'Allgemein';
                    if (!grouped[sg]) grouped[sg] = [];
                    grouped[sg].push({ ...sub, idx });
                });

                let html = '<div class="task-card-subtasks" style="margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.05); display: flex; flex-direction: column; gap: 12px;">';
                for (const [groupName, subs] of Object.entries(grouped)) {
                    html += `
                        <div class="subtask-group">
                            <div style="font-size: 0.75rem; font-weight: 800; text-transform: uppercase; color: var(--color-primary-green); margin-bottom: 6px; letter-spacing: 0.05em; opacity: 0.8;">${groupName}</div>
                            <div style="display: flex; flex-direction: column; gap: 6px;">`;
                    
                    subs.forEach(sub => {
                        html += `
                            <div class="subtask-item" style="display:flex; align-items:center; gap: 10px; justify-content: space-between;">
                                <div style="display: flex; align-items: center; gap: 10px; flex: 1;">
                                    <div class="task-quick-complete ${sub.status === 'completed' ? 'completed' : ''}" 
                                         onclick="event.stopPropagation(); window.toggleSubtaskStatus('${task.id}', ${sub.idx}, '${sub.status}')" 
                                         style="width: 18px; height: 18px; min-width: 18px;"
                                         title="${sub.status === 'completed' ? 'Wieder öffnen' : 'Als erledigt markieren'}">
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                    </div>
                                    <input type="text" class="ghost-input" value="${sub.title}" 
                                        onblur="window.updateSubtaskTitle('${task.id}', ${sub.idx}, this.value)"
                                        onkeydown="if(event.key === 'Enter') this.blur()"
                                        onclick="event.stopPropagation()"
                                        style="color: rgba(255,255,255,${sub.status === 'completed' ? '0.4' : '0.9'}); ${sub.status === 'completed' ? 'text-decoration: line-through;' : ''}">
                                </div>
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
                                           btnTitle = 'Dokument Ã¶ffnen';
                                           badgeStyle = 'background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.25); color: #10b981;';
                                           btnStyle = 'background: rgba(16, 185, 129, 0.2); border: 1px solid rgba(16, 185, 129, 0.4); color: #10b981;';
                                           buttonIcon = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>';
                                           clickHandler = `window.openProtocolFromTask('${task.machine_id}', null, '${sub.action_type}')`;
                                       } else if (isService) {
                                           const parts = sub.action_type.substring(15).split('|||');
                                           textLabel = parts[1] ? `Service: ${parts[1]}` : 'Servicebericht';
                                           btnTitle = 'Servicebericht Ã¶ffnen';
                                           badgeStyle = 'background: rgba(147, 51, 234, 0.1); border: 1px solid rgba(147, 51, 234, 0.25); color: #c084fc;';
                                           btnStyle = 'background: rgba(147, 51, 234, 0.2); border: 1px solid rgba(147, 51, 234, 0.4); color: #c084fc;';
                                           buttonIcon = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>';
                                           clickHandler = `window.openServiceberichtFromTask('${task.machine_id}', '${sub.action_type}', '${task.id}', ${sub.idx}, '${sub.id || ''}')`;
                                       } else {
                                           textLabel = sub.action_type === 'intake' ? 'Eingang' : 'Abnahme';
                                           btnTitle = sub.action_type === 'intake' ? 'Eingangsprotokoll Ã¶ffnen' : 'Abnahmeprotokoll Ã¶ffnen';
                                           const isIntake = sub.action_type === 'intake';
                                           badgeStyle = isIntake ? 'background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.25); color: #60a5fa;' : 'background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.25); color: #f59e0b;';
                                           btnStyle = isIntake ? 'background: rgba(59, 130, 246, 0.2); border: 1px solid rgba(59, 130, 246, 0.4); color: #60a5fa;' : 'background: rgba(245, 158, 11, 0.2); border: 1px solid rgba(245, 158, 11, 0.4); color: #f59e0b;';
                                           buttonIcon = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"></path></svg>';
                                           clickHandler = `window.openProtocolFromTask('${task.machine_id}', null, '${sub.action_type}')`;
                                       }
                                       return `
                                       <div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
                                           <span style="${badgeStyle} border-radius: 4px; padding: 2px 6px; font-size: 0.65rem; font-weight: 800; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                                               ${textLabel}
                                           </span>
                                           <button onclick="event.stopPropagation(); ${clickHandler}" 
                                               title="${btnTitle}"
                                               style="${btnStyle} border-radius: 6px; width: 26px; height: 26px; display: flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; flex-shrink: 0; transition: all 0.2s;">
                                               ${buttonIcon}
                                           </button>
                                       </div>
                                       `;
                                   })() : ''}
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

        // Buttons are always fully visible - no opacity fade needed

        div.addEventListener('dragstart', (e) => {
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
        document.getElementById('tasks-list').classList.add('hidden');

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
                            machines(manufacturer, name, serial, year),
                            subtasks(*)
                        `)
                        .eq('id', taskId)
                        .maybeSingle();
                    
                    if (error) {
                        console.error('Error fetching task from Supabase:', error);
                    } else if (data) {
                        task = data;
                        allTasks.push(task); // Add to local cache
                    }
                }

                if (!task) {
                    console.error('Task not found in memory or database for id:', taskId);
                    alert('Aufgabe konnte nicht im System gefunden werden.');
                    return;
                }

                currentTask = task;
                document.getElementById('task-modal-title').textContent = 'Aufgabe bearbeiten';
                fillModal(task);
                document.getElementById('task-details-section').style.display = 'block';
            } else {
                currentTask = null;
                document.getElementById('task-modal-title').textContent = 'Neue Aufgabe';
                resetModal();
                document.getElementById('task-details-section').style.display = 'none';
            }
        } catch (err) {
            console.error('Error in openTaskModal:', err);
            alert('Fehler beim Öffnen der Aufgabe: ' + err.message);
        }
    };

    window.closeTaskModal = function () {
        const modal = document.getElementById('task-modal');
        if (modal) {
            modal.classList.remove('active');
            modal.classList.remove('show');
            setTimeout(() => {
                modal.classList.add('hidden');
                modal.style.display = 'none';
            }, 300);
        }
    };

    window.onMachineSelected = function(machineId) {
        const details = document.getElementById('task-details-section');
        if (machineId) {
            details.style.display = 'block';
            // If it's a new task, load the default supergroups
            if (!currentTask) {
                if (typeof window.setupNewTaskGroups === 'function') {
                    window.setupNewTaskGroups();
                }
            }
        } else {
            details.style.display = 'none';
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
        document.getElementById('task-description').value = task.description || '';
        document.getElementById('task-machine').value = task.machine_id || '';
        const machineSearch = document.getElementById('task-machine-search');
        if (machineSearch && task.machines) {
            machineSearch.value = getMachineLabel(task.machines);
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

        if (typeof window.setupNewTaskGroups === 'function') {
            window.setupNewTaskGroups(task.subtasks);
        }
        renderAssignedUsers(task.assigned_to || []);
    }

    function resetModal() {
        document.getElementById('task-title').value = '';
        document.getElementById('task-description').value = '';
        document.getElementById('task-machine').value = '';
        const machineSearch = document.getElementById('task-machine-search');
        if (machineSearch) machineSearch.value = '';
        
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
            document.getElementById('task-description').value = t.description;
        }
    };

    window.saveTask = async function () {
        const title = document.getElementById('task-title').value.trim();
        if (!title) {
            alert('Bitte einen Titel eingeben.');
            return;
        }

        const taskData = {
            title: title,
            description: document.getElementById('task-description').value,
            status: 'open',
            machine_id: document.getElementById('task-machine').value || null,
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
                            action_type: st.action_type || null
                        });
                    });
                });

                // Clear existing subtasks if editing
                if (currentTask) {
                    await window.supabaseClient.from('subtasks').delete().eq('task_id', taskId);
                }

                if (allSubtasks.length > 0) {
                    const { error: stError } = await window.supabaseClient.from('subtasks').insert(allSubtasks);
                    if (stError) throw stError;
                }
            }

            closeTaskModal();
            fetchTasks();
        } catch (err) {
            console.error('Error in saveTask:', err);
            const msg = err.message || err.details || 'Unbekannter Fehler';
            alert('Fehler beim Speichern: ' + msg);
        }
    };

    // ==========================================
    // TASK RENDERING UTILS
    // ==========================================
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

        // Trigger detail section and template loading
        if (typeof window.onMachineSelected === 'function') {
            window.onMachineSelected(id);
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

    window.deleteSubtask = async function (id) {
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
    window.switchTaskView = function (view) {
        viewMode = view;
        document.querySelectorAll('.calendar-tab-btn').forEach(btn => btn.classList.remove('active'));
        const activeBtn = document.getElementById(`btn-view-${view}`);
        if (activeBtn) activeBtn.classList.add('active');
        renderTasks();
    };

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
    function setupDragAndDrop() {
        const columns = document.querySelectorAll('.kanban-column');
        columns.forEach(col => {
            col.addEventListener('dragover', (e) => {
                e.preventDefault();
                col.classList.add('drag-over');
            });

            col.addEventListener('dragleave', () => {
                col.classList.remove('drag-over');
            });

            col.addEventListener('drop', async (e) => {
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

                        if (error && error.code === '42703') {
                            console.warn('completed_at/completed_by columns missing, falling back to status only.');
                            const retry = await window.supabaseClient.from('tasks').update({ status: newStatus }).eq('id', taskId);
                            error = retry.error;
                        }

                        if (error) throw error;
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

    window.handleFocusModeBtnClick = function() {
        if (document.body.classList.contains('focus-mode-active')) {
            // Turn off completely
            window.toggleFocusMode(false);
        } else {
            // Show menu
            const menu = document.getElementById('focus-mode-menu');
            if (menu) {
                menu.style.display = menu.style.display === 'none' ? 'flex' : 'none';
            }
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

    window.toggleFocusMode = function (keepMode = false) {
        document.body.classList.toggle('focus-mode-active');
        const isActive = document.body.classList.contains('focus-mode-active');

        if (!isActive) {
            window.currentAppMode = 'normal';
        } else if (keepMode !== true) {
            window.currentAppMode = 'focus';
        }
        
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
        }
    };

    // ==========================================
    // CINEMA MODE
    // ==========================================
    let cinemaActive = false;
    let cinemaRequestId = null;

    window.toggleCinemaMode = function () {
        const btn = document.getElementById('btn-cinema-toggle');
        const floatingBtn = document.getElementById('cinema-floating-btn');
        cinemaActive = !cinemaActive;

        if (cinemaActive) {
            // Force Focus Mode if not active
            if (!document.body.classList.contains('focus-mode-active')) {
                window.toggleFocusMode();
            }
            btn.classList.add('active');
            if (floatingBtn) floatingBtn.classList.add('active');
            startCinemaScrolling();
        } else {
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

            alert(`Schnellvorlage "${templateName}" wurde erfolgreich gespeichert!`);
            
            // Fetch updated templates if the function exists
            if (typeof window.fetchQuickTemplates === 'function') {
                window.fetchQuickTemplates();
            }

        } catch (err) {
            console.error('Error saving template:', err);
            alert("Fehler beim Speichern der Vorlage.");
        } finally {
            if (btn) {
                btn.style.background = '';
                btn.style.borderColor = '';
                btn.style.color = '';
                btn.classList.remove('glow-yellow');
            }
        }
    };
    window.updateSubtaskTitle = async function(taskId, subtaskIndex, newTitle) {
        const task = allTasks.find(t => String(t.id).trim().toLowerCase() === String(taskId).trim().toLowerCase());
        if (!task || !task.subtasks) return;

        if (task.subtasks[subtaskIndex].title === newTitle) return;

        try {
            const updatedSubtasks = [...task.subtasks];
            updatedSubtasks[subtaskIndex].title = newTitle;

            const { error } = await window.supabaseClient
                .from('tasks')
                .update({ subtasks: updatedSubtasks })
                .eq('id', taskId);

            if (error) throw error;
            task.subtasks = updatedSubtasks;
            // No full re-render needed to avoid focus loss, but good for consistency
            // renderTasks(); 
        } catch (err) {
            console.error('Error updating subtask title:', err);
        }
    };

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

            if (error && error.code === '42703') {
                console.warn('completed_at/completed_by columns missing, falling back to status only.');
                const retry = await window.supabaseClient.from('tasks').update({ status: newStatus }).eq('id', taskId);
                error = retry.error;
            }

            if (error) throw error;
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
