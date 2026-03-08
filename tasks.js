
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

            return matchesSearch && matchesMachine;
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
            if (task.status === 'completed') {
                tr.classList.add('completed-task');
            }
            if (task.status) {
                tr.classList.add(`status-${task.status}`);
            }
            tr.innerHTML = `
                <td><span class="status-pill status-${task.status}">${formatStatus(task.status)}</span></td>
                <td style="font-weight: 600; display:flex; align-items:flex-start; gap:8px;">
                    <div style="padding-top: 2px;">
                        <div class="task-quick-complete ${task.status === 'completed' ? 'completed' : ''}" onclick="event.stopPropagation(); window.toggleTaskStatus('${task.id}', '${task.status}')" title="${task.status === 'completed' ? 'Wieder öffnen' : 'Als erledigt markieren'}">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        </div>
                    </div>
                    <div style="display:flex; flex-direction:column; gap:4px;">
                        <span style="font-size: clamp(1rem, 1.3vw, 1.2rem);">${task.title}</span>
                        ${task.subtasks && task.subtasks.length > 0 ? `
                        <div class="task-list-subtasks" style="display: flex; flex-direction: column; gap: 4px; margin-top: 4px;">
                            ${task.subtasks.map((sub, index) => `
                                <div class="subtask-item" style="display:flex; align-items:center; gap: 6px;">
                                    <div class="task-quick-complete ${sub.status === 'completed' ? 'completed' : ''}" 
                                         onclick="event.stopPropagation(); window.toggleSubtaskStatus('${task.id}', ${index}, '${sub.status}')" 
                                         style="width: 18px; height: 18px; min-width: 18px;"
                                         title="${sub.status === 'completed' ? 'Wieder öffnen' : 'Als erledigt markieren'}">
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                    </div>
                                    <span style="font-size: clamp(0.8rem, 1vw, 0.95rem); font-weight: 400; line-height: 1.3; color: rgba(255,255,255,0.8);">${sub.title}</span>
                                </div>
                            `).join('')}
                        </div>
                        ` : ''}
                    </div>
                </td>
                <td>
                    ${task.machines ? `<span style="color: var(--color-primary-green); font-weight: 600;">${getMachineLabel(task.machines)}</span>` : '<span style="color: rgba(255,255,255,0.4)">-</span>'}
                </td>
                <td>${renderAvatars(task.assigned_to)}</td>
                <td>${renderProgress(task)}</td>
                <td>
                    <div style="display: flex; gap: 8px;">
                        <button onclick="event.stopPropagation(); window.openTaskModal('${task.id}')" title="Bearbeiten" style="width:36px; height:36px; border-radius:50%; background: rgba(59,130,246,0.2); border: 1.5px solid rgba(59,130,246,0.5); color: #60a5fa; display:flex; align-items:center; justify-content:center; cursor:pointer; transition: all 0.2s;" onmouseover="this.style.background='rgba(59,130,246,0.4)'" onmouseout="this.style.background='rgba(59,130,246,0.2)'">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        </button>
                        <button onclick="event.stopPropagation(); window.deleteTask('${task.id}')" title="Löschen" style="width:36px; height:36px; border-radius:50%; background: rgba(239,68,68,0.2); border: 1.5px solid rgba(239,68,68,0.5); color: #f87171; display:flex; align-items:center; justify-content:center; cursor:pointer; transition: all 0.2s;" onmouseover="this.style.background='rgba(239,68,68,0.4)'" onmouseout="this.style.background='rgba(239,68,68,0.2)'">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        </button>
                    </div>
                </td>
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
                    tr.classList.add('completed-task');
                    if (task.status) {
                        tr.classList.add(`status-${task.status}`);
                    }
                    tr.style.opacity = '0.6';
                    tr.innerHTML = `
                        <td><span class="status-pill status-${task.status}">${formatStatus(task.status)}</span></td>
                        <td style="font-weight: 600; display:flex; align-items:flex-start; gap:8px;">
                            <div style="padding-top: 2px;">
                                <div class="task-quick-complete completed" onclick="event.stopPropagation(); window.toggleTaskStatus('${task.id}', '${task.status}')" title="Wieder öffnen">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                </div>
                            </div>
                            <div style="display:flex; flex-direction:column; gap:4px;">
                                <span style="font-size: clamp(1rem, 1.3vw, 1.2rem);">${task.title}</span>
                                ${task.subtasks && task.subtasks.length > 0 ? `
                                <div class="task-list-subtasks" style="display: flex; flex-direction: column; gap: 4px; margin-top: 4px;">
                                    ${task.subtasks.map((sub, index) => `
                                        <div class="subtask-item" style="display:flex; align-items:center; gap: 6px;">
                                            <div class="task-quick-complete ${sub.status === 'completed' ? 'completed' : ''}" 
                                                 onclick="event.stopPropagation(); window.toggleSubtaskStatus('${task.id}', ${index}, '${sub.status}')" 
                                                 style="width: 18px; height: 18px; min-width: 18px;"
                                                 title="${sub.status === 'completed' ? 'Wieder öffnen' : 'Als erledigt markieren'}">
                                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                            </div>
                                            <span style="font-size: clamp(0.8rem, 1vw, 0.95rem); font-weight: 400; line-height: 1.3; color: rgba(255,255,255,0.8);">${sub.title}</span>
                                        </div>
                                    `).join('')}
                                </div>
                                ` : ''}
                            </div>
                        </td>
                        <td>
                            ${task.machines ? `<span style="color: var(--color-primary-green); font-weight: 600;">${getMachineLabel(task.machines)}</span>` : '<span style="color: rgba(255,255,255,0.4)">-</span>'}
                        </td>
                        <td>${renderAvatars(task.assigned_to)}</td>
                        <td>${renderProgress(task)}</td>
                        <td>
                            <div style="display: flex; gap: 8px;">
                                <button onclick="event.stopPropagation(); window.openTaskModal('${task.id}')" title="Bearbeiten" style="width:36px; height:36px; border-radius:50%; background: rgba(59,130,246,0.2); border: 1.5px solid rgba(59,130,246,0.5); color: #60a5fa; display:flex; align-items:center; justify-content:center; cursor:pointer; transition: all 0.2s;" onmouseover="this.style.background='rgba(59,130,246,0.4)'" onmouseout="this.style.background='rgba(59,130,246,0.2)'">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                </button>
                                <button onclick="event.stopPropagation(); window.deleteTask('${task.id}')" title="Löschen" style="width:36px; height:36px; border-radius:50%; background: rgba(239,68,68,0.2); border: 1.5px solid rgba(239,68,68,0.5); color: #f87171; display:flex; align-items:center; justify-content:center; cursor:pointer; transition: all 0.2s;" onmouseover="this.style.background='rgba(239,68,68,0.4)'" onmouseout="this.style.background='rgba(239,68,68,0.2)'">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
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
                <div style="display:flex; align-items:center; gap:8px;">
                    <div class="task-quick-complete ${task.status === 'completed' ? 'completed' : ''}" onclick="event.stopPropagation(); window.toggleTaskStatus('${task.id}', '${task.status}')" title="${task.status === 'completed' ? 'Wieder öffnen' : 'Als erledigt markieren'}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    </div>
                    ${task.machines ? `<span class="project-tag" style="color: var(--color-primary-green); font-size: 0.95rem; font-weight: 600; opacity: 1;">${getMachineLabel(task.machines)}</span>` : ''}
                </div>
                <div class="task-card-actions" style="display: flex; gap: 6px; align-items: center;">
                    <button onclick="event.stopPropagation(); window.openTaskModal('${task.id}')" title="Bearbeiten" style="width:32px; height:32px; border-radius:50%; background: rgba(59,130,246,0.2); border: 1.5px solid rgba(59,130,246,0.5); color: #60a5fa; display:flex; align-items:center; justify-content:center; cursor:pointer; transition: all 0.2s;" onmouseover="this.style.background='rgba(59,130,246,0.4)'" onmouseout="this.style.background='rgba(59,130,246,0.2)'">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                    </button>
                    <button onclick="event.stopPropagation(); window.deleteTask('${task.id}')" title="Löschen" style="width:32px; height:32px; border-radius:50%; background: rgba(239,68,68,0.2); border: 1.5px solid rgba(239,68,68,0.5); color: #f87171; display:flex; align-items:center; justify-content:center; cursor:pointer; transition: all 0.2s;" onmouseover="this.style.background='rgba(239,68,68,0.4)'" onmouseout="this.style.background='rgba(239,68,68,0.2)'">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    </button>
                </div>
            </div>
            <div class="task-card-title">${task.title}</div>
            ${task.description ? `<div class="task-card-desc">${task.description.substring(0, 60)}${task.description.length > 60 ? '...' : ''}</div>` : ''}
            
            ${task.subtasks && task.subtasks.length > 0 ? `
            <div class="task-card-subtasks" style="margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.05);">
                ${task.subtasks.map((sub, index) => `
                    <div class="subtask-item" style="display:flex; align-items:center; margin-bottom: 6px; gap: 8px;">
                        <div class="task-quick-complete ${sub.status === 'completed' ? 'completed' : ''}" 
                             onclick="event.stopPropagation(); window.toggleSubtaskStatus('${task.id}', ${index}, '${sub.status}')" 
                             style="width: 18px; height: 18px; min-width: 18px;"
                             title="${sub.status === 'completed' ? 'Wieder öffnen' : 'Als erledigt markieren'}">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        </div>
                        <span style="font-size: 0.8rem; line-height: 1.3; color: rgba(255,255,255,0.8);">${sub.title}</span>
                    </div>
                `).join('')}
            </div>
            ` : ''}

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

        div.onmouseenter = () => {
            const actions = div.querySelector('.task-card-actions');
            if (actions) actions.style.opacity = '1';
        };

        div.onmouseleave = () => {
            const actions = div.querySelector('.task-card-actions');
            if (actions) actions.style.opacity = '0.2';
        };

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
            grid.style.display = 'grid';
            grid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(calc(50% - 15px), 1fr))';
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
            section.className = 'glass-card';
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

    window.openTaskModal = async function (taskId = null) {
        const modal = document.getElementById('task-modal');
        if (!modal) return;

        // Ensure user list is available
        if (!window.userList || window.userList.length === 0) {
            if (typeof window.fetchUsers === 'function') {
                await window.fetchUsers();
            }
        }

        modal.classList.remove('hidden');
        modal.classList.add('active');
        modal.style.display = 'flex';

        if (taskId) {
            const task = allTasks.find(t => t.id === taskId);
            currentTask = task;
            document.getElementById('task-modal-title').textContent = 'Aufgabe bearbeiten';
            fillModal(task);
        } else {
            currentTask = null;
            document.getElementById('task-modal-title').textContent = 'Neue Aufgabe';
            resetModal();
        }
    };

    window.closeTaskModal = function () {
        const modal = document.getElementById('task-modal');
        if (modal) {
            modal.classList.remove('active');
            modal.classList.add('hidden');
            setTimeout(() => modal.style.display = 'none', 300);
        }
    };

    window.deleteTask = async function (id) {
        if (!confirm('Möchten Sie diese Aufgabe wirklich löschen?')) return;
        try {
            const { error } = await window.supabaseClient
                .from('tasks')
                .delete()
                .eq('id', id);

            if (error) throw error;
            fetchTasks();
        } catch (err) {
            console.error('Error deleting task:', err);
            alert('Fehler beim Löschen der Aufgabe');
        }
    };

    window.toggleTaskStatus = async function (id, currentStatus) {
        // Find task locally to immediately stop propagation if it's already reacting
        const newStatus = currentStatus === 'completed' ? 'open' : 'completed';

        try {
            const { error } = await window.supabaseClient
                .from('tasks')
                .update({ status: newStatus })
                .eq('id', id);

            if (error) throw error;
            // Instantly refresh whole list from DB
            fetchTasks();
        } catch (err) {
            console.error('Error toggling task status:', err);
            alert('Fehler beim Ändern des Status');
        }
    };

    window.toggleSubtaskStatus = async function (taskId, subtaskIndex, currentState) {
        const taskObj = allTasks.find(t => t.id === taskId);
        if (!taskObj || !taskObj.subtasks) return;

        const subtask = taskObj.subtasks[subtaskIndex];
        if (!subtask) return;

        // Support both old boolean parameter or new status string
        let newStatus = 'open';
        if (typeof currentState === 'boolean') {
            newStatus = currentState ? 'completed' : 'open';
        } else {
            newStatus = currentState === 'completed' ? 'open' : 'completed';
        }

        try {
            // Update the subtask in the DB
            const { error: subtaskError } = await window.supabaseClient
                .from('subtasks')
                .update({ status: newStatus })
                .eq('id', subtask.id);

            if (subtaskError) throw subtaskError;

            // Intentionally not auto-completing the main task here based on user preference

            fetchTasks(); // Reload everything to reflect changes visually
        } catch (err) {
            console.error('Error toggling subtask status:', err);
            alert('Fehler beim Aktualisieren des Unterpunktes.');
        }
    };

    function fillModal(task) {
        document.getElementById('task-title').value = task.title || '';
        document.getElementById('task-description').value = task.description || '';
        document.getElementById('task-status').value = task.status || 'open';
        document.getElementById('task-priority').value = task.priority || 'medium';
        document.getElementById('task-machine').value = task.machine_id || '';
        document.getElementById('task-deadline').value = task.end_date ? task.end_date.split('T')[0] : '';

        renderSubtasks(task.subtasks || []);
        renderAssignedUsers(task.assigned_to || []);
    }

    function resetModal() {
        document.getElementById('task-title').value = '';
        document.getElementById('task-description').value = '';
        document.getElementById('task-status').value = 'open';
        document.getElementById('task-priority').value = 'medium';
        document.getElementById('task-machine').value = '';
        document.getElementById('task-deadline').value = '';
        document.getElementById('subtask-list').innerHTML = '';
        window.tempAssigned = [];
        window.tempSubtasks = [];
        renderSubtasks([]);
        renderAssignedUsers([]);
    }

    window.saveTask = async function () {
        const title = document.getElementById('task-title').value.trim();
        if (!title) {
            alert('Bitte einen Titel eingeben.');
            return;
        }

        const taskData = {
            title: title,
            description: document.getElementById('task-description').value,
            status: document.getElementById('task-status').value,
            priority: document.getElementById('task-priority').value,
            machine_id: document.getElementById('task-machine').value || null,
            end_date: document.getElementById('task-deadline').value || null,
            updated_at: new Date().toISOString()
        };

        try {
            let error;
            if (currentTask) {
                const res = await window.supabaseClient.from('tasks').update(taskData).eq('id', currentTask.id);
                error = res.error;
            } else {
                taskData.created_by = window.activeUser?.id;
                taskData.assigned_to = window.tempAssigned || [];
                const { data, error: insertError } = await window.supabaseClient.from('tasks').insert([taskData]).select();
                error = insertError;

                if (!error && data && data[0] && window.tempSubtasks && window.tempSubtasks.length > 0) {
                    const taskId = data[0].id;
                    const subtasksToInsert = window.tempSubtasks.map(st => ({
                        task_id: taskId,
                        title: st.title,
                        status: st.status || 'open'
                    }));
                    const { error: stError } = await window.supabaseClient.from('subtasks').insert(subtasksToInsert);
                    if (stError) throw stError;
                }
            }

            if (error) {
                console.error('Task Save Error:', error);
                throw error;
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
    // SUBTASKS
    // ==========================================
    window.addSubtask = async function () {
        const input = document.getElementById('new-subtask-input');
        const title = input.value.trim();
        if (!title) return;

        if (currentTask) {
            try {
                const { data, error } = await window.supabaseClient
                    .from('subtasks')
                    .insert([{ task_id: currentTask.id, title: title }])
                    .select();

                if (error) throw error;
                input.value = '';
                input.focus();

                if (!currentTask.subtasks) currentTask.subtasks = [];
                currentTask.subtasks.push(data[0]);
                renderSubtasks(currentTask.subtasks);
                fetchTasks();
            } catch (err) {
                console.error('Error adding subtask:', err);
            }
        } else {
            // Temp subtask for new task
            if (!window.tempSubtasks) window.tempSubtasks = [];
            window.tempSubtasks.push({
                id: 'temp-' + Date.now(),
                title: title,
                status: 'open'
            });
            input.value = '';
            input.focus();
            renderSubtasks(window.tempSubtasks);
        }
    };

    function renderSubtasks(subtasks) {
        const container = document.getElementById('subtask-list');
        if (!container) return;
        container.innerHTML = '';
        subtasks.forEach(st => {
            const div = document.createElement('div');
            div.className = 'subtask-item';
            div.innerHTML = `
                <input type="checkbox" ${st.status === 'completed' ? 'checked' : ''} onchange="toggleSubtask('${st.id}', this.checked)">
                <span class="${st.status === 'completed' ? 'done' : ''}">${st.title}</span>
                <button class="delete-st" onclick="deleteSubtask('${st.id}')">&times;</button>
            `;
            container.appendChild(div);
        });
    }

    window.toggleSubtask = async function (id, isChecked) {
        const status = isChecked ? 'completed' : 'open';

        if (id.startsWith('temp-')) {
            const st = window.tempSubtasks.find(s => s.id === id);
            if (st) st.status = status;
            renderSubtasks(window.tempSubtasks);
            return;
        }

        try {
            await window.supabaseClient.from('subtasks').update({ status }).eq('id', id);

            // Local state update
            if (currentTask && currentTask.subtasks) {
                const st = currentTask.subtasks.find(s => s.id === id);
                if (st) st.status = status;
                renderSubtasks(currentTask.subtasks);
            }
            fetchTasks();
        } catch (err) {
            console.error(err);
        }
    };

    window.deleteSubtask = async function (id) {
        if (!confirm('Unteraufgabe löschen?')) return;

        if (id.startsWith('temp-')) {
            window.tempSubtasks = window.tempSubtasks.filter(s => s.id !== id);
            renderSubtasks(window.tempSubtasks);
            return;
        }

        try {
            await window.supabaseClient.from('subtasks').delete().eq('id', id);

            if (currentTask && currentTask.subtasks) {
                currentTask.subtasks = currentTask.subtasks.filter(s => s.id !== id);
                renderSubtasks(currentTask.subtasks);
            }
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
        const label = document.getElementById('task-assigned-users-label');
        if (!container || !label) return;

        container.innerHTML = '';
        if (window.userList && window.userList.length > 0) {
            window.userList.forEach(user => {
                const isChecked = assignedIds.includes(user.id);
                const li = document.createElement('li');
                li.style.display = 'flex';
                li.style.alignItems = 'center';
                li.style.gap = '12px';
                li.style.padding = '10px 15px';
                li.style.cursor = 'pointer';

                li.innerHTML = `
                    <input type="checkbox" id="user-cb-${user.id}" ${isChecked ? 'checked' : ''} style="pointer-events: none;">
                    <div style="display: flex; align-items: center; gap: 10px; flex: 1;">
                        <span class="avatar-mini" style="background: ${getUserColor(user)}; width: 24px; height: 24px; font-size: 0.7rem; flex-shrink: 0;" title="${user.name}">
                            ${getUserInitials(user)}
                        </span>
                        <label style="margin: 0; cursor: pointer; line-height: 1;">${user.name}</label>
                    </div>
                `;

                li.onclick = (e) => {
                    e.stopPropagation();
                    toggleUserAssignmentCheckbox(user.id);
                };
                container.appendChild(li);
            });

            // Update label
            const assignedNames = assignedIds.map(uid => window.userList.find(u => u.id === uid)?.name).filter(Boolean);
            label.textContent = assignedNames.length > 0 ? assignedNames.join(', ') : 'Niemand zugewiesen';
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
                const task = allTasks.find(t => t.id === taskId);
                if (task && task.status !== newStatus) {
                    const oldStatus = task.status;
                    task.status = newStatus;
                    renderTasks();

                    // Supabase update
                    try {
                        const { error } = await window.supabaseClient.from('tasks').update({ status: newStatus }).eq('id', taskId);
                        if (error) throw error;
                    } catch (err) {
                        console.error('Drag drop save error:', err);
                        task.status = oldStatus;
                        fetchTasks(); // Rollback if failed
                    }
                }
            });
        });
    }


})();
