// ==========================================
// TASK TEMPLATES & SNIPPETS MODULE
// ==========================================

(function () {
    'use strict';

    let supergroupTemplates = [];
    let subtaskTemplates = [];
    let quickTemplates = [];
    let modalGroups = []; // State of groups in the current task modal

    // Quick Template Builder State
    let qtBuilderGroups = [];

    // ==========================================
    // INITIALIZATION
    // ==========================================
    window.initTaskTemplates = async function () {
        await fetchTemplates();
        renderTemplatesInSettings();
        window.resetQTBuilder();
    };

    async function fetchTemplates() {
        try {
            const { data: sg, error: sgErr } = await window.supabaseClient
                .from('task_supergroups_templates')
                .select('*')
                .order('sort_order');
            
            const { data: st, error: stErr } = await window.supabaseClient
                .from('task_subtask_templates')
                .select('*')
                .order('title');

            const { data: qt, error: qtErr } = await window.supabaseClient
                .from('task_quick_templates')
                .select('*')
                .order('name');

            if (sgErr || stErr || qtErr) throw (sgErr || stErr || qtErr);

            supergroupTemplates = sg || [];
            subtaskTemplates = st || [];
            quickTemplates = qt || [];
        } catch (err) {
            console.error('Error fetching templates:', err);
        }
    }

    // ==========================================
    // SETTINGS UI
    // ==========================================
    window.switchTextSnippetTab = function (tab) {
        document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
        document.querySelector(`.settings-tab[data-tab="${tab}"]`).classList.add('active');

        document.querySelectorAll('.tab-content').forEach(c => {
            c.classList.add('hidden');
            c.classList.remove('active');
        });
        document.getElementById(`${tab}-tab-content`).classList.remove('hidden');
        document.getElementById(`${tab}-tab-content`).classList.add('active');
        
        const createBtn = document.getElementById('btn-create-qt');
        if (createBtn) createBtn.style.display = tab === 'quicktemplates' ? 'flex' : 'none';

        if (tab === 'quicktemplates') renderQuickTemplates();
    };

    function renderTemplatesInSettings() {
        const sgList = document.getElementById('supergroup-list');
        const stList = document.getElementById('subtask-template-list');
        if (!sgList || !stList) return;

        sgList.innerHTML = supergroupTemplates.map(t => `
            <div class="template-item glass-card" style="padding: 12px 20px; display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.02); border-radius: 12px; border: 1px solid rgba(255,255,255,0.05);">
                <span style="font-weight: 600; color: #fff;">${t.name}</span>
                <div style="display: flex; gap: 8px;">
                    <button onclick="window.editSupergroupTemplate('${t.id}', '${t.name}')" class="btn-doc-action" style="background: rgba(59,130,246,0.1); border: 1px solid rgba(59,130,246,0.2); color: #60a5fa; width: 32px; height: 32px; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                    </button>
                    <button onclick="window.deleteSupergroupTemplate('${t.id}')" class="btn-doc-action" style="background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.2); color: #ef4444; width: 32px; height: 32px; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    </button>
                </div>
            </div>
        `).join('');

        stList.innerHTML = subtaskTemplates.map(t => {
            const isDoc = t.action_type && t.action_type.startsWith('document:');
            let actionBadge = '';
            if (t.action_type) {
                if (isDoc) {
                    const parts = t.action_type.substring(9).split('|||');
                    actionBadge = `<span style="font-size: 0.7rem; background: rgba(16, 185, 129, 0.1); color: #10b981; padding: 2px 6px; border-radius: 4px; font-weight: 700; border: 1px solid rgba(16, 185, 129, 0.2); max-width: 145px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">📄 ${parts[1] || 'Dokument'}</span>`;
                } else {
                    actionBadge = `<span style="font-size: 0.7rem; background: ${t.action_type === 'intake' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(245, 158, 11, 0.1)'}; color: ${t.action_type === 'intake' ? '#60a5fa' : '#f59e0b'}; padding: 2px 6px; border-radius: 4px; font-weight: 700; border: 1px solid ${t.action_type === 'intake' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(245, 158, 11, 0.2)'};">${t.action_type === 'intake' ? 'Eingang' : 'Abnahme'}</span>`;
                }
            }
            const glowClass = t.action_type ? (isDoc ? 'glow-green' : (t.action_type === 'intake' ? 'glow-blue' : 'glow-orange')) : '';
            const btnBg = t.action_type ? (isDoc ? 'rgba(16,185,129,0.2)' : (t.action_type === 'intake' ? 'rgba(59,130,246,0.2)' : 'rgba(245,158,11,0.2)')) : 'rgba(255,255,255,0.05)';
            const btnBorder = t.action_type ? (isDoc ? 'rgba(16,185,129,0.4)' : (t.action_type === 'intake' ? 'rgba(59,130,246,0.4)' : 'rgba(245,158,11,0.4)')) : 'rgba(255,255,255,0.1)';
            const btnColor = t.action_type ? (isDoc ? '#10b981' : (t.action_type === 'intake' ? '#60a5fa' : '#f59e0b')) : 'rgba(255,255,255,0.3)';

            return `
            <div class="template-item glass-card" style="padding: 12px 20px; display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.02); border-radius: 12px; border: 1px solid rgba(255,255,255,0.05);">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <span style="font-weight: 500; color: #fff;">${t.title}</span>
                </div>
                <div style="display: flex; gap: 8px; align-items: center;">
                    ${actionBadge}
                    <button onclick="window.setSubtaskAction('${t.id}', '${t.action_type || ''}')" class="btn-doc-action ${glowClass}" title="Aktion hinzufügen" 
                        style="background: ${btnBg}; 
                                border: 1px solid ${btnBorder}; 
                                color: ${btnColor}; 
                                width: 32px; height: 32px; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"></path></svg>
                    </button>
                    <button onclick="window.editSubtaskTemplate('${t.id}', '${t.title}')" class="btn-doc-action" style="background: rgba(59,130,246,0.1); border: 1px solid rgba(59,130,246,0.2); color: #60a5fa; width: 32px; height: 32px; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                    </button>
                    <button onclick="window.deleteSubtaskTemplate('${t.id}')" class="btn-doc-action" style="background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.2); color: #ef4444; width: 32px; height: 32px; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    </button>
                </div>
            </div>
            `;
        }).join('');
    }

    // --- Actions for Subtasks ---
    let pendingSubtaskActionId = null;
    let pendingQTActionSource = null; // { gIdx, sIdx } for builder
    let pendingTaskModalActionSource = null; // { gIdx, sIdx } for active task modal

    // For Document Picker
    let pickerCurrentFolderId = null;
    let pickerFolderPath = [];
    let pickerAllFolders = [];
    let pickerAllDocuments = [];

    window.setSubtaskAction = function(id, currentAction, source = null) {
        pendingSubtaskActionId = id;
        pendingQTActionSource = null;
        pendingTaskModalActionSource = null;

        if (source && source.gIdx !== undefined && source.sIdx !== undefined) {
            if (source.taskModal) {
                pendingTaskModalActionSource = source;
            } else {
                pendingQTActionSource = source;
            }
        }

        const modal = document.getElementById('subtask-action-modal');
        if (modal) {
            modal.classList.remove('hidden');
            modal.classList.add('active');
            modal.style.display = 'flex';
        }
    };

    window.closeSubtaskActionModal = function() {
        const modal = document.getElementById('subtask-action-modal');
        if (modal) {
            modal.classList.remove('active');
            modal.classList.add('hidden');
            setTimeout(() => modal.style.display = 'none', 300);
        }
        pendingSubtaskActionId = null;
        pendingQTActionSource = null;
        pendingTaskModalActionSource = null;
    };

    window.applySubtaskAction = async function(action) {
        if (action === 'servicebericht') {
            const modal = document.getElementById('subtask-action-modal');
            if (modal) {
                modal.classList.remove('active');
                modal.classList.add('hidden');
                setTimeout(() => modal.style.display = 'none', 300);
            }
            window.openServiceberichtPicker();
            return;
        }

        if (action === 'servicebericht') {
            const modal = document.getElementById('subtask-action-modal');
            if (modal) {
                modal.classList.remove('active');
                modal.classList.add('hidden');
                setTimeout(() => modal.style.display = 'none', 300);
            }
            window.openServiceberichtPicker();
            return;
        }

        if (action === 'document') {
            const modal = document.getElementById('subtask-action-modal');
            if (modal) {
                modal.classList.remove('active');
                modal.classList.add('hidden');
                setTimeout(() => modal.style.display = 'none', 300);
            }
            window.openDocumentPicker();
            return;
        }

        // Case A: Task Modal
        if (pendingTaskModalActionSource) {
            const { gIdx, sIdx } = pendingTaskModalActionSource;
            modalGroups[gIdx].subtasks[sIdx].action_type = action;
            renderModalGroups();
            
            // If editing an existing task in DB, update immediately
            if (window.currentTask && window.currentTask.id) {
                const flatSubtasks = [];
                modalGroups.forEach(group => {
                    group.subtasks.forEach(st => {
                        flatSubtasks.push({
                            title: st.title,
                            status: st.status || 'open',
                            action_type: st.action_type || null,
                            supergroup: group.name
                        });
                    });
                });
                try {
                    await window.supabaseClient
                        .from('tasks')
                        .update({ subtasks: flatSubtasks, updated_at: new Date().toISOString() })
                        .eq('id', window.currentTask.id);
                    if (typeof window.fetchTasks === 'function') {
                        await window.fetchTasks();
                    }
                } catch (e) {
                    console.error('Error saving subtask update:', e);
                }
            }
            
            window.closeSubtaskActionModal();
            return;
        }

        // Case B: QT Builder
        if (pendingQTActionSource) {
            const { gIdx, sIdx } = pendingQTActionSource;
            qtBuilderGroups[gIdx].subtasks[sIdx].action_type = action;
            renderQTBuilder();
            window.closeSubtaskActionModal();
            return;
        }

        // Case C: Database (Templates Settings)
        if (!pendingSubtaskActionId) return;
        try {
            const { error } = await window.supabaseClient
                .from('task_subtask_templates')
                .update({ action_type: action })
                .eq('id', pendingSubtaskActionId);
            if (error) throw error;
            
            await fetchTemplates();
            renderTemplatesInSettings();
            window.closeSubtaskActionModal();
        } catch (err) {
            alert('Fehler: ' + err.message);
        }
    };

    // --- Document Picker ---
    window.openDocumentPicker = async function() {
        const modal = document.getElementById('document-picker-modal');
        if (modal) {
            modal.classList.remove('hidden');
            modal.classList.add('active');
            modal.style.display = 'flex';
        }
        
        pickerCurrentFolderId = null;
        pickerFolderPath = [];
        const searchInput = document.getElementById('picker-search-input');
        if (searchInput) searchInput.value = '';
        
        await window.fetchPickerFolderContent();
    };

    window.closeDocumentPicker = function() {
        const modal = document.getElementById('document-picker-modal');
        if (modal) {
            modal.classList.remove('active');
            modal.classList.add('hidden');
            setTimeout(() => modal.style.display = 'none', 300);
        }
        // Cleanup target references
        pendingSubtaskActionId = null;
        pendingQTActionSource = null;
        pendingTaskModalActionSource = null;
    };

    window.fetchPickerFolderContent = async function() {
        const pickerContentArea = document.getElementById('picker-content-area');
        if (pickerContentArea) {
            pickerContentArea.innerHTML = '<div style="padding: 2rem; text-align: center; color: rgba(255,255,255,0.4); grid-column: 1/-1;">Lade Inhalt...</div>';
        }
        
        try {
            // Fetch folders
            let folderQuery = window.supabaseClient.from('document_folders').select('*');
            if (pickerCurrentFolderId) {
                folderQuery = folderQuery.eq('parent_id', pickerCurrentFolderId);
            } else {
                folderQuery = folderQuery.is('parent_id', null);
            }
            const { data: folders, error: folderError } = await folderQuery.order('name');
            if (folderError) throw folderError;
            pickerAllFolders = folders || [];

            // Fetch documents
            let docQuery = window.supabaseClient.from('documents').select('*');
            if (pickerCurrentFolderId) {
                docQuery = docQuery.eq('folder_id', pickerCurrentFolderId);
            } else {
                docQuery = docQuery.is('folder_id', null);
            }
            const { data: docs, error: docError } = await docQuery.order('name');
            if (docError) throw docError;
            pickerAllDocuments = docs || [];

            window.renderPickerContent();
        } catch (err) {
            console.error('Error fetching picker content:', err);
            if (pickerContentArea) {
                pickerContentArea.innerHTML = '<div style="padding: 2rem; text-align: center; color: #ef4444; grid-column: 1/-1;">Fehler beim Laden des Inhalts.</div>';
            }
        }
    };

    window.renderPickerContent = function() {
        const pickerContentArea = document.getElementById('picker-content-area');
        const breadcrumbsContainer = document.getElementById('picker-breadcrumbs');
        if (!pickerContentArea) return;

        // Render breadcrumbs
        let breadcrumbsHtml = `<span onclick="window.navigatePickerToFolder(null, 'Dokumente')" style="cursor: pointer; font-weight: 700; color: #10b981;">Dokumente</span>`;
        pickerFolderPath.forEach((folder, idx) => {
            breadcrumbsHtml += ` <span style="opacity: 0.5;">/</span> <span onclick="window.navigatePickerToFolder('${folder.id}', '${folder.name}')" style="cursor: pointer; color: #fff; font-weight: 600;">${folder.name}</span>`;
        });
        if (breadcrumbsContainer) {
            breadcrumbsContainer.innerHTML = breadcrumbsHtml;
        }

        const searchTerm = document.getElementById('picker-search-input')?.value.toLowerCase() || '';

        const filteredFolders = pickerAllFolders.filter(f => f.name.toLowerCase().includes(searchTerm));
        const filteredDocuments = pickerAllDocuments.filter(d => d.name.toLowerCase().includes(searchTerm));

        if (filteredFolders.length === 0 && filteredDocuments.length === 0) {
            pickerContentArea.innerHTML = '<div style="padding: 2rem; text-align: center; color: rgba(255,255,255,0.4); grid-column: 1/-1;">Keine Ordner oder Dokumente gefunden.</div>';
            return;
        }

        let html = '';
        
        filteredFolders.forEach(folder => {
            html += `
                <div onclick="window.navigatePickerToFolder('${folder.id}', '${folder.name.replace(/'/g, "\\'")}')" 
                     style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 15px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; cursor: pointer; text-align: center; transition: all 0.2s;"
                     onmouseover="this.style.background='rgba(255,255,255,0.08)'; this.style.borderColor='rgba(255,255,255,0.15)';"
                     onmouseout="this.style.background='rgba(255,255,255,0.03)'; this.style.borderColor='rgba(255,255,255,0.08)';">
                    <span style="font-size: 2.2rem; margin-bottom: 8px;">📁</span>
                    <span style="color: #fff; font-size: 0.85rem; font-weight: 600; width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${folder.name}</span>
                </div>
            `;
        });

        filteredDocuments.forEach(doc => {
            html += `
                <div onclick="window.selectPickerDocument('${doc.url.replace(/'/g, "\\'")}', '${doc.name.replace(/'/g, "\\'")}', '${doc.mime_type || ''}')" 
                     style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 15px; background: rgba(16,185,129,0.05); border: 1px solid rgba(16,185,129,0.15); border-radius: 12px; cursor: pointer; text-align: center; transition: all 0.2s;"
                     onmouseover="this.style.background='rgba(16,185,129,0.12)'; this.style.borderColor='rgba(16,185,129,0.3)';"
                     onmouseout="this.style.background='rgba(16,185,129,0.05)'; this.style.borderColor='rgba(16,185,129,0.15)';">
                    <span style="font-size: 2.2rem; margin-bottom: 8px;">📄</span>
                    <span style="color: #fff; font-size: 0.85rem; font-weight: 600; width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${doc.name}">${doc.name}</span>
                </div>
            `;
        });

        pickerContentArea.innerHTML = html;
    };

    window.navigatePickerToFolder = async function(folderId, folderName) {
        if (folderId === null) {
            pickerCurrentFolderId = null;
            pickerFolderPath = [];
        } else {
            const existingIdx = pickerFolderPath.findIndex(f => f.id === folderId);
            if (existingIdx !== -1) {
                pickerFolderPath = pickerFolderPath.slice(0, existingIdx + 1);
            } else {
                pickerFolderPath.push({ id: folderId, name: folderName });
            }
            pickerCurrentFolderId = folderId;
        }
        await window.fetchPickerFolderContent();
    };

    window.filterPickerContent = function() {
        window.renderPickerContent();
    };

    window.selectPickerDocument = async function(url, name, mimeType) {
        const actionValue = 'document:' + url + '|||' + name + '|||' + mimeType;

        // Case A: Task Modal
        if (pendingTaskModalActionSource) {
            const { gIdx, sIdx } = pendingTaskModalActionSource;
            modalGroups[gIdx].subtasks[sIdx].action_type = actionValue;
            renderModalGroups();
            
            // If editing an existing task in DB, update immediately
            if (window.currentTask && window.currentTask.id) {
                const flatSubtasks = [];
                modalGroups.forEach(group => {
                    group.subtasks.forEach(st => {
                        flatSubtasks.push({
                            title: st.title,
                            status: st.status || 'open',
                            action_type: st.action_type || null,
                            supergroup: group.name
                        });
                    });
                });
                try {
                    await window.supabaseClient
                        .from('tasks')
                        .update({ subtasks: flatSubtasks, updated_at: new Date().toISOString() })
                        .eq('id', window.currentTask.id);
                    if (typeof window.fetchTasks === 'function') {
                        await window.fetchTasks();
                    }
                } catch (e) {
                    console.error('Error saving subtask update:', e);
                }
            }
            
            // Close picker (which also resets pending flags)
            const pickerModal = document.getElementById('document-picker-modal');
            if (pickerModal) {
                pickerModal.classList.remove('active');
                pickerModal.classList.add('hidden');
                setTimeout(() => pickerModal.style.display = 'none', 300);
            }
            return;
        }

        // Case B: QT Builder
        if (pendingQTActionSource) {
            const { gIdx, sIdx } = pendingQTActionSource;
            qtBuilderGroups[gIdx].subtasks[sIdx].action_type = actionValue;
            renderQTBuilder();
            
            const pickerModal = document.getElementById('document-picker-modal');
            if (pickerModal) {
                pickerModal.classList.remove('active');
                pickerModal.classList.add('hidden');
                setTimeout(() => pickerModal.style.display = 'none', 300);
            }
            return;
        }

        // Case C: Database (Templates Settings)
        if (!pendingSubtaskActionId) return;
        try {
            const { error } = await window.supabaseClient
                .from('task_subtask_templates')
                .update({ action_type: actionValue })
                .eq('id', pendingSubtaskActionId);
            if (error) throw error;
            
            await fetchTemplates();
            renderTemplatesInSettings();
            
            const pickerModal = document.getElementById('document-picker-modal');
            if (pickerModal) {
                pickerModal.classList.remove('active');
                pickerModal.classList.add('hidden');
                setTimeout(() => pickerModal.style.display = 'none', 300);
            }
        } catch (err) {
            alert('Fehler: ' + err.message);
        }
    };

    // --- Supergroups ---
    window.addSupergroupTemplate = async function () {
        const input = document.getElementById('new-supergroup-name');
        const name = input.value.trim();
        if (!name) return;

        try {
            const { error } = await window.supabaseClient
                .from('task_supergroups_templates')
                .insert([{ name, sort_order: supergroupTemplates.length + 1 }]);

            if (error) throw error;
            input.value = '';
            await fetchTemplates();
            renderTemplatesInSettings();
        } catch (err) {
            alert('Fehler beim Hinzufügen: ' + err.message);
        }
    };

    window.editSupergroupTemplate = async function (id, currentName) {
        const newName = prompt('Übergruppe umbenennen:', currentName);
        if (!newName || newName === currentName) return;
        try {
            const { error } = await window.supabaseClient
                .from('task_supergroups_templates')
                .update({ name: newName })
                .eq('id', id);
            if (error) throw error;
            await fetchTemplates();
            renderTemplatesInSettings();
        } catch (err) {
            alert('Fehler beim Bearbeiten: ' + err.message);
        }
    };

    window.deleteSupergroupTemplate = async function (id) {
        if (!confirm('Übergruppe wirklich löschen?')) return;
        try {
            const { error } = await window.supabaseClient
                .from('task_supergroups_templates')
                .delete()
                .eq('id', id);

            if (error) throw error;
            await fetchTemplates();
            renderTemplatesInSettings();
        } catch (err) {
            alert('Fehler beim Löschen: ' + err.message);
        }
    };

    // --- Subtasks ---
    window.addSubtaskTemplate = async function () {
        const input = document.getElementById('new-subtask-template-title');
        const title = input.value.trim();
        if (!title) return;

        try {
            const { error } = await window.supabaseClient
                .from('task_subtask_templates')
                .insert([{ title }]);

            if (error) throw error;
            input.value = '';
            await fetchTemplates();
            renderTemplatesInSettings();
        } catch (err) {
            alert('Fehler beim Hinzufügen: ' + err.message);
        }
    };

    window.editSubtaskTemplate = async function (id, currentTitle) {
        const newTitle = prompt('Baustein umbenennen:', currentTitle);
        if (!newTitle || newTitle === currentTitle) return;
        try {
            const { error } = await window.supabaseClient
                .from('task_subtask_templates')
                .update({ title: newTitle })
                .eq('id', id);
            if (error) throw error;
            await fetchTemplates();
            renderTemplatesInSettings();
        } catch (err) {
            alert('Fehler beim Bearbeiten: ' + err.message);
        }
    };

    window.deleteSubtaskTemplate = async function (id) {
        if (!confirm('Baustein wirklich löschen?')) return;
        try {
            const { error } = await window.supabaseClient
                .from('task_subtask_templates')
                .delete()
                .eq('id', id);

            if (error) throw error;
            await fetchTemplates();
            renderTemplatesInSettings();
        } catch (err) {
            alert('Fehler beim Löschen: ' + err.message);
        }
    };

    // --- Quick Templates (Schnellvorlagen) ---
    window.openQTModal = function() {
        const modal = document.getElementById('qt-modal');
        if (modal) {
            modal.classList.remove('hidden');
            modal.classList.add('active');
            modal.style.display = 'flex';
            renderQTBuilder();
        }
    };

    window.closeQTModal = function() {
        const modal = document.getElementById('qt-modal');
        if (modal) {
            modal.classList.remove('active');
            modal.classList.add('hidden');
            setTimeout(() => modal.style.display = 'none', 300);
        }
    };

    window.editQuickTemplate = function(id) {
        const qt = quickTemplates.find(t => t.id === id);
        if (!qt) return;
        
        document.getElementById('new-qt-name').value = qt.name;
        // Normalize structure: handle both old (strings) and new (objects) formats
        qtBuilderGroups = qt.structure.map(g => ({
            name: g.name,
            subtasks: g.subtasks.map(st => typeof st === 'string' ? { title: st, action_type: null } : st)
        }));
        
        window.openQTModal();
    };

    function renderQuickTemplates() {
        const list = document.getElementById('quicktemplate-list');
        if (!list) return;
        list.innerHTML = quickTemplates.map(qt => {
            return `
            <div class="glass-card template-card-premium" style="padding: 28px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 24px; position: relative; overflow: hidden; transition: all 0.3s ease;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; position: relative; z-index: 2;">
                    <div style="flex: 1;">
                        <h4 style="margin: 0; color: var(--color-primary-green); font-size: 1.4rem; font-weight: 800; margin-bottom: 8px;">${qt.name}</h4>
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <button onclick="window.editQuickTemplate('${qt.id}')" class="btn-doc-action btn-premium-action glow-blue" style="background: rgba(59,130,246,0.1); border: 1px solid rgba(59,130,246,0.3); color: #60a5fa; width: 40px; height: 40px; border-radius: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center;">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        </button>
                        <button onclick="window.deleteQuickTemplate('${qt.id}')" class="btn-delete-mini btn-premium-action glow-red" style="background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); color: #ef4444; width: 40px; height: 40px; border-radius: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center;">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        </button>
                    </div>
                </div>
                <div style="display: flex; flex-direction: column; gap: 20px; position: relative; z-index: 2;">
                    ${qt.structure.map(g => `
                        <div style="background: rgba(255,255,255,0.02); padding: 16px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.05); border-left: 4px solid var(--color-primary-green);">
                            <div style="font-size: 0.85rem; font-weight: 800; color: var(--color-primary-green); text-transform: uppercase; margin-bottom: 12px; letter-spacing: 0.05em; display: flex; align-items: center; gap: 8px;">
                                <div style="width: 20px; height: 20px; border-radius: 50%; background: var(--color-primary-green); color: #000; font-size: 0.7rem; display: flex; align-items: center; justify-content: center;">${qt.structure.indexOf(g) + 1}</div>
                                ${g.name}
                            </div>
                            <div style="display: flex; flex-direction: column; gap: 8px;">
                                ${g.subtasks.map(st => {
                                    const title = typeof st === 'string' ? st : st.title;
                                    const action = typeof st === 'string' ? null : st.action_type;
                                    return `
                                    <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.95rem; color: rgba(255,255,255,0.8); background: rgba(255,255,255,0.02); padding: 8px 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.03);">
                                        <span>${title}</span>
                                        ${action ? `
                                            <div style="display: flex; align-items: center; gap: 4px; color: ${action === 'intake' ? '#60a5fa' : '#f59e0b'}; font-size: 0.7rem; font-weight: 800;">
                                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"></path></svg>
                                                ${action === 'intake' ? 'EINGANG' : 'ABNAHME'}
                                            </div>
                                        ` : ''}
                                    </div>
                                    `;
                                }).join('')}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
            `;
        }).join('');
    }

    window.resetQTBuilder = function() {
        qtBuilderGroups = [{ name: '', subtasks: [{title: '', action_type: null}] }];
        renderQTBuilder();
        const nameInput = document.getElementById('new-qt-name');
        if (nameInput) nameInput.value = '';
    };

    window.addQTGroupToBuilder = function() {
        qtBuilderGroups.push({ name: '', subtasks: [{title: '', action_type: null}] });
        renderQTBuilder();
    };

    window.addQTSubtaskToGroup = function(gIdx) {
        qtBuilderGroups[gIdx].subtasks.push({title: '', action_type: null});
        renderQTBuilder();
    };

    window.toggleQTGroupDropdown = function(gIdx) {
        const dropdown = document.getElementById(`qt-group-dropdown-${gIdx}`);
        const isHidden = dropdown.classList.contains('hidden');
        document.querySelectorAll('.snippet-dropdown').forEach(d => d.classList.add('hidden'));
        if (isHidden) dropdown.classList.remove('hidden');
    };

    window.toggleQTSubtaskDropdown = function(gIdx, sIdx) {
        const dropdown = document.getElementById(`qt-subtask-dropdown-${gIdx}-${sIdx}`);
        const isHidden = dropdown.classList.contains('hidden');
        document.querySelectorAll('.snippet-dropdown').forEach(d => d.classList.add('hidden'));
        if (isHidden) dropdown.classList.remove('hidden');
    };

    window.selectQTGroupName = function(gIdx, name) {
        qtBuilderGroups[gIdx].name = name;
        renderQTBuilder();
        document.getElementById(`qt-group-dropdown-${gIdx}`)?.classList.add('hidden');
    };

    window.selectQTSubtask = function(gIdx, sIdx, title) {
        const template = subtaskTemplates.find(t => t.title === title);
        qtBuilderGroups[gIdx].subtasks[sIdx] = { 
            title: title, 
            action_type: template?.action_type || null 
        };
        renderQTBuilder();
        document.getElementById(`qt-subtask-dropdown-${gIdx}-${sIdx}`)?.classList.add('hidden');
    };

    function renderQTBuilder() {
        const container = document.getElementById('qt-builder-groups');
        if (!container) return;
        container.innerHTML = qtBuilderGroups.map((group, gIdx) => `
            <div class="glass-card qt-builder-card" style="padding: 24px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 20px; position: relative;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; gap: 15px;">
                    <div style="display: flex; align-items: center; gap: 12px; flex: 1; position: relative;">
                        <div style="background: var(--color-primary-green); color: #000; width: 30px; height: 30px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 0.9rem;">${gIdx + 1}</div>
                        <input type="text" class="glass-input" placeholder="Name der Übergruppe..." value="${group.name}" style="flex: 1; height: 45px; font-weight: 700; border-color: rgba(16, 185, 129, 0.3);" oninput="window.updateQTGroupName(${gIdx}, this.value)">
                        
                        <button onclick="window.removeQTGroup(${gIdx})" class="btn-trash-glow">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        </button>
                    </div>
                </div>
                <div style="display: flex; flex-direction: column; gap: 12px; padding-left: 42px;">
                    ${group.subtasks.map((st, sIdx) => {
                        const hasAction = !!st.action_type;
                        const isDoc = st.action_type && st.action_type.startsWith('document:');
                        const isService = st.action_type && st.action_type.startsWith('servicebericht:');
                        
                        let actionColor = 'rgba(255,255,255,0.02)';
                        let actionBorder = 'rgba(255,255,255,0.05)';
                        let actionIndicator = 'rgba(255,255,255,0.2)';
                        
                        if (hasAction) {
                            if (isDoc) {
                                actionColor = 'rgba(16,185,129,0.05)';
                                actionBorder = 'rgba(16,185,129,0.3)';
                                actionIndicator = '#10b981';
                            } else if (isService) {
                                actionColor = 'rgba(167,139,250,0.05)';
                                actionBorder = 'rgba(167,139,250,0.3)';
                                actionIndicator = '#a78bfa';
                            } else if (st.action_type === 'intake') {
                                actionColor = 'rgba(59,130,246,0.05)';
                                actionBorder = 'rgba(59,130,246,0.3)';
                                actionIndicator = '#60a5fa';
                            } else {
                                actionColor = 'rgba(245,158,11,0.05)';
                                actionBorder = 'rgba(245,158,11,0.3)';
                                actionIndicator = '#f59e0b';
                            }
                        }
                        
                        const glowClass = st.action_type ? (isDoc ? 'glow-green' : (isService ? 'glow-purple' : (st.action_type === 'intake' ? 'glow-blue' : 'glow-orange'))) : '';
                        const btnBg = st.action_type ? (isDoc ? 'rgba(16,185,129,0.2)' : (isService ? 'rgba(167,139,250,0.2)' : (st.action_type === 'intake' ? 'rgba(59,130,246,0.2)' : 'rgba(245,158,11,0.2)'))) : 'rgba(255,255,255,0.05)';
                        const btnBorder = st.action_type ? (isDoc ? 'rgba(16,185,129,0.4)' : (isService ? 'rgba(167,139,250,0.4)' : (st.action_type === 'intake' ? 'rgba(59,130,246,0.4)' : 'rgba(245,158,11,0.4)'))) : 'rgba(255,255,255,0.1)';
                        const btnColor = st.action_type ? (isDoc ? '#10b981' : (isService ? '#a78bfa' : (st.action_type === 'intake' ? '#60a5fa' : '#f59e0b'))) : 'rgba(255,255,255,0.4)';
                        
                        return `
                        <div style="display: flex; gap: 10px; align-items: center; position: relative;">
                            <div style="width: 6px; height: 6px; border-radius: 50%; background: ${actionIndicator}; flex-shrink: 0;"></div>
                            <input type="text" class="glass-input" placeholder="Unteraufgabe..." value="${st.title}" 
                                style="flex: 1; height: 40px; font-size: 0.95rem; background: ${actionColor}; border-color: ${actionBorder};" 
                                oninput="window.updateQTSubtask(${gIdx}, ${sIdx}, this.value)">
                            
                            <button onclick="window.setSubtaskAction(null, '${st.action_type || ''}', {gIdx: ${gIdx}, sIdx: ${sIdx}})" class="btn-doc-action ${glowClass}" 
                                style="height: 40px; width: 40px; border-radius: 10px; background: ${btnBg}; border: 1px solid ${btnBorder}; color: ${btnColor}; display: flex; align-items: center; justify-content: center;">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"></path></svg>
                            </button>
                            
                            <button onclick="window.removeQTSubtask(${gIdx}, ${sIdx})" style="color: rgba(255,255,255,0.2); background: none; border: none; cursor: pointer; font-size: 1.2rem; transition: all 0.2s;" onmouseover="this.style.color='#ef4444'">&times;</button>
                        </div>
                    `; }).join('')}
                    <button onclick="window.addQTSubtaskToGroup(${gIdx})" class="btn-add-st-mini" style="background: rgba(16, 185, 129, 0.05); border: 1px dashed rgba(16, 185, 129, 0.3); color: var(--color-primary-green); font-size: 0.85rem; font-weight: 700; cursor: pointer; padding: 10px; border-radius: 10px; transition: all 0.2s; margin-top: 5px;">
                        + UNTERAUFGABE HINZUFÜGEN
                    </button>
                </div>
            </div>
        `).join('');
    }

    window.updateQTGroupName = (gIdx, val) => qtBuilderGroups[gIdx].name = val;
    window.updateQTSubtask = (gIdx, sIdx, val) => qtBuilderGroups[gIdx].subtasks[sIdx].title = val;
    window.removeQTGroup = (idx) => { qtBuilderGroups.splice(idx, 1); renderQTBuilder(); };
    window.removeQTSubtask = (gIdx, sIdx) => { qtBuilderGroups[gIdx].subtasks.splice(sIdx, 1); renderQTBuilder(); };

    window.saveQuickTemplate = async function() {
        const name = document.getElementById('new-qt-name').value.trim();
        if (!name) return alert('Bitte einen Namen für die Vorlage eingeben.');
        
        // Filter out empty groups/subtasks
        const structure = qtBuilderGroups
            .filter(g => g.name.trim())
            .map(g => ({
                name: g.name.trim(),
                subtasks: g.subtasks
                    .filter(st => st.title.trim())
                    .map(st => ({
                        title: st.title.trim(),
                        action_type: st.action_type || null
                    }))
            }))
            .filter(g => g.subtasks.length > 0);

        if (structure.length === 0) return alert('Bitte mindestens eine Gruppe mit Unteraufgaben anlegen.');

        try {
            // Check if we are updating an existing template or creating a new one
            const existing = quickTemplates.find(t => t.name === name);
            let res;
            if (existing) {
                if (!confirm('Eine Vorlage mit diesem Namen existiert bereits. Möchtest du sie überschreiben?')) return;
                res = await window.supabaseClient
                    .from('task_quick_templates')
                    .update({ structure })
                    .eq('id', existing.id);
            } else {
                res = await window.supabaseClient
                    .from('task_quick_templates')
                    .insert([{ name, structure }]);
            }
            
            if (res.error) throw res.error;
            await fetchTemplates();
            renderQuickTemplates();
            window.resetQTBuilder();
            window.closeQTModal();
            alert('Schnellvorlage erfolgreich gespeichert!');
        } catch (err) {
            alert('Fehler beim Speichern: ' + err.message);
        }
    };

    window.deleteQuickTemplate = async function(id) {
        if (!confirm('Schnellvorlage wirklich löschen?')) return;
        try {
            const { error } = await window.supabaseClient.from('task_quick_templates').delete().eq('id', id);
            if (error) throw error;
            await fetchTemplates();
            renderQuickTemplates();
        } catch (err) {
            alert('Fehler beim Löschen: ' + err.message);
        }
    };

    // ==========================================
    // TASK MODAL LOGIC
    // ==========================================
    window.setupNewTaskGroups = function (existingTasks = null) {
        try {
            console.log('setupNewTaskGroups called with:', existingTasks);
            const cleanTasks = Array.isArray(existingTasks) ? existingTasks.filter(Boolean) : [];

            if (cleanTasks.length > 0) {
                // Initialize modalGroups with the default template groups
                modalGroups = supergroupTemplates.map(t => ({
                    name: t.name,
                    subtasks: cleanTasks.filter(st => st && st.supergroup === t.name)
                }));
                
                // Extract unique custom supergroups that are not part of the default templates
                const customSgs = [...new Set(cleanTasks.map(st => st && st.supergroup).filter(Boolean))];
                customSgs.forEach(sgName => {
                    if (!supergroupTemplates.some(t => t.name === sgName)) {
                        modalGroups.push({
                            name: sgName,
                            subtasks: cleanTasks.filter(st => st && st.supergroup === sgName)
                        });
                    }
                });

                // Fallback for subtasks that have no supergroup assigned
                const otherSubtasks = cleanTasks.filter(st => st && !st.supergroup);
                if (otherSubtasks.length > 0) {
                    modalGroups.push({ name: 'Sonstiges', subtasks: otherSubtasks });
                }
            } else {
                // New task: Load default supergroups
                modalGroups = supergroupTemplates.map(t => ({
                    name: t.name,
                    subtasks: []
                }));
            }
            renderModalGroups();
            renderQuickTemplatePicker();
        } catch (e) {
            console.error('Error in setupNewTaskGroups:', e);
        }
    };

    function renderQuickTemplatePicker() {
        const container = document.getElementById('quick-template-picker-container');
        if (!container || quickTemplates.length === 0) return;
        
        container.innerHTML = `
            <div style="margin-bottom: 20px; padding: 15px; background: rgba(16, 185, 129, 0.05); border: 1px solid rgba(16, 185, 129, 0.1); border-radius: 12px;">
                <label style="display: block; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-primary-green); margin-bottom: 10px; font-weight: 800;">Schnellvorlage laden</label>
                <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                    ${quickTemplates.map(qt => `
                        <button class="filter-chip" style="padding: 6px 12px; font-size: 0.8rem;" onclick="window.applyQuickTemplate('${qt.id}')">${qt.name}</button>
                    `).join('')}
                </div>
            </div>
        `;
    }

    window.applyQuickTemplate = function(id) {
        const qt = quickTemplates.find(t => t.id === id);
        if (!qt) return;
        
        if (modalGroups.some(g => g.subtasks.length > 0) && !confirm('Bestehende Unteraufgaben werden beibehalten, neue Gruppen werden hinzugefügt. Fortfahren?')) return;
        
        qt.structure.forEach(stGroup => {
            let existing = modalGroups.find(mg => mg.name === stGroup.name);
            if (existing) {
                stGroup.subtasks.forEach(st => {
                    const title = typeof st === 'string' ? st : st.title;
                    const action = typeof st === 'string' ? (subtaskTemplates.find(t => t.title === title)?.action_type || null) : st.action_type;
                    
                    if (!existing.subtasks.some(est => est.title === title)) {
                        existing.subtasks.push({ title, status: 'open', action_type: action });
                    }
                });
            } else {
                modalGroups.push({
                    name: stGroup.name,
                    subtasks: stGroup.subtasks.map(st => {
                        const title = typeof st === 'string' ? st : st.title;
                        const action = typeof st === 'string' ? (subtaskTemplates.find(t => t.title === title)?.action_type || null) : st.action_type;
                        return { title, status: 'open', action_type: action };
                    })
                });
            }
        });
        
        renderModalGroups();
    };

    function renderModalGroups() {
        try {
            const container = document.getElementById('task-supergroups-list');
            if (!container) return;
            container.innerHTML = '';

            modalGroups.forEach((group, gIdx) => {
                if (!group) return;
                const groupDiv = document.createElement('div');
                groupDiv.className = 'modal-supergroup-card glass-card';
                groupDiv.style.cssText = 'padding: 18px; border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.02); border-radius: 16px;';

                const subtasks = Array.isArray(group.subtasks) ? group.subtasks.filter(Boolean) : [];

                groupDiv.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                        <h4 style="margin: 0; color: #fff; font-weight: 700; font-size: 1.05rem;">${group.name || 'Unbenannt'}</h4>
                        <button onclick="window.removeSupergroupFromModal(${gIdx})" style="background: rgba(255,255,255,0.05); border: none; color: rgba(255,255,255,0.4); width: 28px; height: 28px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s;" onmouseover="this.style.background='rgba(239,68,68,0.2)'; this.style.color='#ef4444';" onmouseout="this.style.background='rgba(255,255,255,0.05)'; this.style.color='rgba(255,255,255,0.4)';">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    </div>
                    <div id="modal-subtasks-${gIdx}" ondragover="event.preventDefault();" ondrop="window.handleModalSubtaskDrop(event, ${gIdx})" style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 15px; min-height: 30px;">
                        ${subtasks.map((st, sIdx) => `
                            <div draggable="true" ondragstart="window.handleModalSubtaskDragStart(event, ${gIdx}, ${sIdx})" style="display: flex; align-items: center; gap: 12px; background: rgba(255,255,255,0.03); padding: 8px 12px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.05); cursor: grab;">
                                <div class="task-quick-complete ${st.status === 'completed' ? 'completed' : ''}" onclick="window.toggleModalSubtaskStatus(${gIdx}, ${sIdx})">
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                </div>
                                <div style="flex: 1; display: flex; align-items: center; gap: 10px;">
                                    <input type="text" value="${st.title || ''}" class="glass-input-minimal" style="flex: 1; background: none; border: none; color: #fff; font-size: 0.95rem;" onblur="window.updateModalSubtask(${gIdx}, ${sIdx}, this.value)">
                                    <span onclick="window.setSubtaskAction(null, '${st.action_type || ''}', { taskModal: true, gIdx: ${gIdx}, sIdx: ${sIdx} })" style="font-size: 0.65rem; cursor: pointer; background: ${st.action_type ? (st.action_type.startsWith('document:') ? 'rgba(16, 185, 129, 0.2)' : st.action_type.startsWith('servicebericht:') ? 'rgba(147, 51, 234, 0.2)' : (st.action_type === 'intake' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(245, 158, 11, 0.2)')) : 'rgba(255,255,255,0.05)'}; color: ${st.action_type ? (st.action_type.startsWith('document:') ? '#10b981' : st.action_type.startsWith('servicebericht:') ? '#c084fc' : (st.action_type === 'intake' ? '#60a5fa' : '#f59e0b')) : 'rgba(255,255,255,0.4)'}; padding: 2px 5px; border-radius: 4px; font-weight: 800; border: 1px solid ${st.action_type ? (st.action_type.startsWith('document:') ? 'rgba(16, 185, 129, 0.3)' : st.action_type.startsWith('servicebericht:') ? 'rgba(147, 51, 234, 0.3)' : (st.action_type === 'intake' ? 'rgba(59, 130, 246, 0.3)' : 'rgba(245, 158, 11, 0.3)')) : 'rgba(255,255,255,0.1)'}; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                                        ${st.action_type ? (st.action_type.startsWith('document:') ? '📄 ' + (st.action_type.substring(9).split('|||')[1] || 'Dokument') : st.action_type.startsWith('servicebericht:') ? '🔧 ' + (st.action_type.substring(15).split('|||')[1] ? 'Service: ' + st.action_type.substring(15).split('|||')[1] : 'Servicebericht') : (st.action_type === 'intake' ? '⚡ Eingang' : '⚡ Endcheck')) : '+ Aktion'}
                                    </span>
                                </div>
                                <button onclick="window.removeModalSubtask(${gIdx}, ${sIdx})" style="color: rgba(255,255,255,0.2); background: none; border: none; cursor: pointer; font-size: 1.2rem; transition: color 0.2s;" onmouseover="this.style.color='#ef4444'">&times;</button>
                            </div>
                        `).join('')}
                    </div>
                    <div style="display: flex; gap: 10px; align-items: center;">
                        <input type="text" id="add-subtask-input-${gIdx}" class="glass-input" style="font-size: 0.9rem; height: 40px; border-color: rgba(255,255,255,0.1);" placeholder="Unteraufgabe hinzufügen..." onkeypress="if(event.key === 'Enter') window.addSubtaskToGroup(${gIdx})">
                        <div style="position: relative;">
                            <button onclick="window.toggleSnippetDropdown(${gIdx})" class="btn-circle-premium btn-circle-blue">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                            </button>
                            <div id="snippet-dropdown-${gIdx}" class="snippet-dropdown hidden" style="position: absolute; bottom: 100%; right: 0; background: #1e293b; border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; min-width: 250px; max-height: 250px; overflow-y: auto; z-index: 1000; margin-bottom: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
                                ${subtaskTemplates.filter(st => st && st.title).map(st => `
                                    <div onclick="window.addSnippetToGroup(${gIdx}, '${st.title.replace(/'/g, "\\'")}')" style="padding: 12px 16px; cursor: pointer; font-size: 0.95rem; color: rgba(255,255,255,0.85); border-bottom: 1px solid rgba(255,255,255,0.05); display: flex; justify-content: space-between; align-items: center;" onmouseover="this.style.background='rgba(59, 130, 246, 0.1)'; this.style.color='#fff';" onmouseout="this.style.background='none'; this.style.color='rgba(255,255,255,0.85)';">
                                        <span>${st.title}</span>
                                        ${st.action_type ? `<span style="font-size: 0.65rem; background: rgba(16, 185, 129, 0.15); color: #10b981; padding: 2px 4px; border-radius: 4px; font-weight: 800;">⚡</span>` : ''}
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                        <button class="btn-circle-premium btn-circle-green" onclick="window.addSubtaskToGroup(${gIdx})">
                            <span style="font-size: 1.6rem; font-weight: 300; line-height: 1; display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; margin-top: -1px;">+</span>
                        </button>
                    </div>
                `;
                container.appendChild(groupDiv);
            });
        } catch (e) {
            console.error('Error in renderModalGroups:', e);
        }
    }

    window.addNewSupergroupToTask = function() {
        const name = prompt('Name der neuen Übergruppe:');
        if (!name) return;
        modalGroups.push({ name, subtasks: [] });
        renderModalGroups();
    };

    window.removeSupergroupFromModal = function (idx) {
        modalGroups.splice(idx, 1);
        renderModalGroups();
    };

    window.toggleModalSubtaskStatus = function (gIdx, sIdx) {
        const st = modalGroups[gIdx].subtasks[sIdx];
        st.status = st.status === 'completed' ? 'open' : 'completed';
        renderModalGroups();
    };

    window.updateModalSubtask = function (gIdx, sIdx, val) {
        modalGroups[gIdx].subtasks[sIdx].title = val;
    };

    window.removeModalSubtask = function (gIdx, sIdx) {
        modalGroups[gIdx].subtasks.splice(sIdx, 1);
        renderModalGroups();
    };

    window.handleModalSubtaskDragStart = function(event, gIdx, sIdx) {
        event.dataTransfer.setData('sourceGroupIdx', gIdx);
        event.dataTransfer.setData('sourceSubtaskIdx', sIdx);
    };

    window.handleModalSubtaskDrop = function(event, targetGIdx) {
        event.preventDefault();
        const sourceGIdx = parseInt(event.dataTransfer.getData('sourceGroupIdx'), 10);
        const sourceSIdx = parseInt(event.dataTransfer.getData('sourceSubtaskIdx'), 10);
        
        if (isNaN(sourceGIdx) || isNaN(sourceSIdx)) return;
        
        // Move from source group to target group
        const [subtaskToMove] = modalGroups[sourceGIdx].subtasks.splice(sourceSIdx, 1);
        if (subtaskToMove) {
            modalGroups[targetGIdx].subtasks.push(subtaskToMove);
            renderModalGroups();
        }
    };

    window.addSubtaskToGroup = function (gIdx) {
        const input = document.getElementById(`add-subtask-input-${gIdx}`);
        const title = input.value.trim();
        if (!title) return;

        modalGroups[gIdx].subtasks.push({ title, status: 'open', action_type: null });
        input.value = '';
        renderModalGroups();
    };

    window.toggleSnippetDropdown = function (gIdx) {
        const dropdown = document.getElementById(`snippet-dropdown-${gIdx}`);
        const isHidden = dropdown.classList.contains('hidden');
        document.querySelectorAll('.snippet-dropdown').forEach(d => d.classList.add('hidden'));
        if (isHidden) dropdown.classList.remove('hidden');
    };

    window.addSnippetToGroup = function (gIdx, title) {
        const template = subtaskTemplates.find(t => t.title === title);
        modalGroups[gIdx].subtasks.push({ title, status: 'open', action_type: template?.action_type || null });
        document.getElementById(`snippet-dropdown-${gIdx}`).classList.add('hidden');
        renderModalGroups();
    };

    // Close dropdowns on click outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.snippet-dropdown') && !e.target.closest('button[onclick*="toggleSnippetDropdown"]')) {
            document.querySelectorAll('.snippet-dropdown').forEach(d => d.classList.add('hidden'));
        }
    });

    window.getModalGroupsData = function() {
        return modalGroups;
    };

})();
