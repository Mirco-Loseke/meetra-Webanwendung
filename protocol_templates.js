/* ==========================================
   PROTOCOL TEMPLATE MANAGEMENT
   ========================================== */

let protocolTemplates = [];
let currentEditingTemplate = null;

async function fetchProtocolTemplates() {
    if (!window.supabaseClient) return;

    try {
        const { data, error } = await window.supabaseClient
            .from('protocol_templates')
            .select('*')
            .order('name', { ascending: true });

        if (error) throw error;

        protocolTemplates = data || [];
        renderTemplateList();
    } catch (err) {
        console.error('Error fetching protocol templates:', err);
    }
}

function renderTemplateList() {
    const listContainer = document.getElementById('protocol-templates-list');
    if (!listContainer) return;

    listContainer.innerHTML = '';

    if (protocolTemplates.length === 0) {
        listContainer.innerHTML = '<div style="color: rgba(255,255,255,0.4); grid-column: 1/-1; text-align: center; padding: 2rem;">Keine Vorlagen gefunden.</div>';
        return;
    }

    protocolTemplates.forEach(template => {
        const card = document.createElement('div');
        card.className = 'settings-card';
        card.style.cursor = 'pointer';
        card.onclick = () => openTemplateEditor(template.id);

        card.innerHTML = `
            <div class="settings-icon-container" style="background: rgba(59, 130, 246, 0.1); color: #3b82f6; width: 56px; height: 56px; border-radius: 16px; display: flex; align-items: center; justify-content: center; margin-bottom: 1.25rem; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); border: 1px solid rgba(59, 130, 246, 0.1);">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                </svg>
            </div>
            <div class="settings-content">
                <h3 style="margin: 0; font-size: 1.15rem; color: #fff; font-family: 'Outfit', sans-serif;">${template.name}</h3>
                <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 0.75rem;">
                    <span style="font-size: 0.75rem; padding: 2px 8px; background: rgba(255,255,255,0.05); border-radius: 4px; color: rgba(255,255,255,0.5); font-family: 'Inter', sans-serif;">
                        ${Array.isArray(template.structure) ? template.structure.length : 0} GRUPPEN
                    </span>
                </div>
            </div>
        `;
        listContainer.appendChild(card);
    });
}

function openTemplateEditor(templateId) {
    const template = protocolTemplates.find(t => t.id === templateId);
    if (!template) return;

    // Use a deep clone of the structure to avoid mid-edit changes affecting global state until save
    currentEditingTemplate = {
        ...template,
        structure: JSON.parse(JSON.stringify(template.structure || []))
    };

    // Initialize all groups as collapsed by default
    if (Array.isArray(currentEditingTemplate.structure)) {
        currentEditingTemplate.structure.forEach(group => {
            group.is_collapsed = true;
        });
    }

    document.getElementById('editor-template-name').textContent = template.name;

    if (typeof window.switchView === 'function') {
        window.switchView('protocol-template-editor');
    }

    populateCategorySelect(template.category_id);
    renderEditor();
}

function populateCategorySelect(selectedCategoryId) {
    const select = document.getElementById('template-category-select');
    if (!select) return;

    // Use global categoryList
    const machineCategories = (window.categoryList || []).filter(c => c.type === 'machine' || !c.type);

    select.innerHTML = '<option value="">-- Keine Kategorie --</option>';
    machineCategories.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat.id;
        option.textContent = cat.name;
        option.style.background = '#1a1a1a'; // Dark background for options
        if (cat.id === selectedCategoryId) {
            option.selected = true;
        }
        select.appendChild(option);
    });
}

function renderEditor() {
    const container = document.getElementById('template-editor-container');
    if (!container) return;

    container.innerHTML = '';

    if (!currentEditingTemplate.structure || currentEditingTemplate.structure.length === 0) {
        container.innerHTML = '<div style="color: rgba(255,255,255,0.3); text-align: center; padding: 3rem; background: rgba(255,255,255,0.02); border-radius: 20px; border: 1px dashed rgba(255,255,255,0.1);">Diese Vorlage hat noch keine Inhalte.</div>';
        return;
    }

    currentEditingTemplate.structure.forEach((group, groupIndex) => {
        const groupEl = document.createElement('div');
        groupEl.className = `template-editor-group ${group.is_collapsed ? 'collapsed' : ''}`;
        groupEl.id = `group-${groupIndex}`;
        groupEl.style.animationDelay = `${groupIndex * 0.1}s`;

        groupEl.innerHTML = `
            <div class="template-editor-group-header" onclick="toggleGroupCollapse(${groupIndex})">
                <div class="template-group-title">
                    <div class="chevron-wrapper" style="width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.05); border-radius: 8px; transition: all 0.3s ease;">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="chevron" style="transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1); transform: ${group.is_collapsed ? 'rotate(-90deg)' : 'rotate(0deg)'}; color: rgba(255,255,255,0.7);">
                            <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                    </div>
                    <span class="editable-content" contenteditable="true" 
                          onblur="updateGroupTitle(${groupIndex}, this.textContent)"
                          onclick="event.stopPropagation()">${group.group_title || 'Neue Gruppe'}</span>
                </div>
                <div class="template-group-actions" onclick="event.stopPropagation()">
                    <button class="btn-icon-mini delete" onclick="removeGroup(${groupIndex})" title="Gruppe löschen">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            <line x1="10" y1="11" x2="10" y2="17"></line>
                            <line x1="14" y1="11" x2="14" y2="17"></line>
                        </svg>
                    </button>
                </div>
            </div>
            <div class="template-editor-items">
                ${(group.items || []).map((item, itemIndex) => {
            const isNumbered = /^\d+\./.test(item.label);
            return `
                    <div class="template-editor-item ${isNumbered ? 'heading-numbered' : ''}">
                        <div class="item-main-content" style="flex: 1; display: flex; align-items: center; gap: 12px;">
                            ${item.type === 'checkbox' ? `
                                <div class="glass-checkbox-wrapper">
                                    <input type="checkbox" class="glass-checkbox" checked disabled>
                                </div>
                            ` : `
                                <div class="text-input-indicator" style="width: 24px; color: rgba(255,255,255,0.2); display: flex; align-items: center; justify-content: center;">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
                                </div>
                            `}
                            <div class="item-text-fields" style="flex: 1;">
                                <span class="editable-content ${isNumbered ? 'heading-numbered' : ''}" contenteditable="true" 
                                      onblur="updateItemLabel(${groupIndex}, ${itemIndex}, this.textContent)">${item.label}</span>
                                <div style="display: flex; align-items: center; gap: 8px; margin-top: 4px;">
                                    <span class="item-type-tag" onclick="toggleItemType(${groupIndex}, ${itemIndex})" style="cursor: pointer;">${item.type}</span>
                                    ${item.has_description ? `
                                        <span class="editable-content placeholder-red" contenteditable="true" 
                                              onblur="updateItemPlaceholder(${groupIndex}, ${itemIndex}, this.textContent)">${item.placeholder || 'Beschreibung...'}</span>
                                    ` : ''}
                                </div>
                            </div>
                        </div>
                        <button class="btn-icon-mini delete" onclick="removeItem(${groupIndex}, ${itemIndex})" title="Punkt entfernen">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                <line x1="10" y1="11" x2="10" y2="17"></line>
                                <line x1="14" y1="11" x2="14" y2="17"></line>
                            </svg>
                        </button>
                    </div>
                `;
        }).join('')}
                <button class="btn-add-item" onclick="addItem(${groupIndex})">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="12" y1="5" x2="12" y2="19"></line>
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                    FELD HINZUFÜGEN
                </button>
            </div>
        `;
        container.appendChild(groupEl);
    });
}

function toggleGroupCollapse(index) {
    if (!currentEditingTemplate || !currentEditingTemplate.structure[index]) return;

    const group = currentEditingTemplate.structure[index];
    group.is_collapsed = !group.is_collapsed;

    const el = document.getElementById(`group-${index}`);
    if (el) {
        el.classList.toggle('collapsed', group.is_collapsed);

        // Rotate chevron
        const chevron = el.querySelector('.chevron');
        if (chevron) {
            chevron.style.transform = group.is_collapsed ? 'rotate(-90deg)' : 'rotate(0deg)';
        }
    }
}

function toggleItemType(groupIndex, itemIndex) {
    if (currentEditingTemplate.structure[groupIndex] && currentEditingTemplate.structure[groupIndex].items[itemIndex]) {
        const item = currentEditingTemplate.structure[groupIndex].items[itemIndex];
        item.type = item.type === 'checkbox' ? 'text' : 'checkbox';
        renderEditor();
    }
}

function updateGroupTitle(index, newTitle) {
    if (currentEditingTemplate.structure[index]) {
        currentEditingTemplate.structure[index].group_title = newTitle;
    }
}

function updateItemLabel(groupIndex, itemIndex, newLabel) {
    if (currentEditingTemplate.structure[groupIndex] && currentEditingTemplate.structure[groupIndex].items[itemIndex]) {
        currentEditingTemplate.structure[groupIndex].items[itemIndex].label = newLabel;
    }
}

function updateItemPlaceholder(groupIndex, itemIndex, newPlaceholder) {
    if (currentEditingTemplate.structure[groupIndex] && currentEditingTemplate.structure[groupIndex].items[itemIndex]) {
        currentEditingTemplate.structure[groupIndex].items[itemIndex].placeholder = newPlaceholder;
    }
}

function addTemplateGroup() {
    if (!currentEditingTemplate) return;
    currentEditingTemplate.structure.push({
        group_title: 'Neue Gruppe',
        items: [],
        is_collapsed: false // Open new groups by default so user can edit instantly
    });
    renderEditor();
}

function removeGroup(index) {
    if (confirm('Gruppe wirklich löschen?')) {
        currentEditingTemplate.structure.splice(index, 1);
        renderEditor();
    }
}

function addItem(groupIndex) {
    if (!currentEditingTemplate.structure[groupIndex]) return;
    if (!currentEditingTemplate.structure[groupIndex].items) currentEditingTemplate.structure[groupIndex].items = [];

    // Ensure the group is open when adding an item
    currentEditingTemplate.structure[groupIndex].is_collapsed = false;

    currentEditingTemplate.structure[groupIndex].items.push({
        id: 'item_' + Date.now(),
        type: 'checkbox',
        label: 'Neuer Punkt',
        has_description: true,
        placeholder: 'Beschreibung hier einfügen...'
    });
    renderEditor();
}

function removeItem(groupIndex, itemIndex) {
    if (currentEditingTemplate.structure[groupIndex] && currentEditingTemplate.structure[groupIndex].items) {
        currentEditingTemplate.structure[groupIndex].items.splice(itemIndex, 1);
        renderEditor();
    }
}

async function saveTemplate() {
    if (!window.supabaseClient || !currentEditingTemplate) return;

    const btn = document.getElementById('save-template-btn');
    const originalHTML = btn.innerHTML;
    btn.innerHTML = 'SPEICHERN...';
    btn.disabled = true;

    const categorySelect = document.getElementById('template-category-select');
    const categoryId = categorySelect ? categorySelect.value : null;

    // Auto-infer type from name
    let templateType = currentEditingTemplate.type || 'acceptance';
    const nameLower = currentEditingTemplate.name.toLowerCase();
    if (nameLower.includes('eingang')) {
        templateType = 'intake';
    } else if (nameLower.includes('abnahme')) {
        templateType = 'acceptance';
    }

    const updateData = {
        structure: currentEditingTemplate.structure,
        type: templateType,
        updated_at: new Date().toISOString()
    };

    // Only add category_id if it's supported by the schema or explicitly requested
    // We try to include it but we'll catch the error if the column is missing
    if (categoryId) {
        updateData.category_id = categoryId;
    } else {
        updateData.category_id = null;
    }

    try {
        // Try with category_id first
        let { error } = await window.supabaseClient
            .from('protocol_templates')
            .update(updateData)
            .eq('id', currentEditingTemplate.id);

        if (error) {
            // If column is missing (code 42703 or message check), retry without it
            if (error.code === '42703' || (error.message && error.message.includes('category_id'))) {
                console.warn('category_id column missing, retrying without it...');
                delete updateData.category_id;
                const retryResponse = await window.supabaseClient
                    .from('protocol_templates')
                    .update(updateData)
                    .eq('id', currentEditingTemplate.id);
                if (retryResponse.error) throw retryResponse.error;
            } else {
                throw error;
            }
        }

        alert('Vorlage erfolgreich gespeichert!');

        // Update local list
        const idx = protocolTemplates.findIndex(t => t.id === currentEditingTemplate.id);
        if (idx !== -1) {
            protocolTemplates[idx].structure = currentEditingTemplate.structure;
            protocolTemplates[idx].category_id = categoryId || null;
            protocolTemplates[idx].type = templateType;
        }

        renderTemplateList();
    } catch (err) {
        console.error('Error saving template:', err);
        alert('Fehler beim Speichern: ' + err.message);
    } finally {
        btn.innerHTML = originalHTML;
        btn.disabled = false;
    }
}

// Global exposure for event handlers
window.addTemplateGroup = addTemplateGroup;
window.toggleGroupCollapse = toggleGroupCollapse;
window.toggleItemType = toggleItemType;
window.updateGroupTitle = updateGroupTitle;
window.updateItemLabel = updateItemLabel;
window.updateItemPlaceholder = updateItemPlaceholder;
window.removeGroup = removeGroup;
window.addItem = addItem;
window.removeItem = removeItem;

// Initial Load
document.addEventListener('DOMContentLoaded', () => {
    if (window.supabaseClient) {
        fetchProtocolTemplates();
    } else {
        const checkSupabase = setInterval(() => {
            if (window.supabaseClient) {
                fetchProtocolTemplates();
                clearInterval(checkSupabase);
            }
        }, 500);
    }

    const saveBtn = document.getElementById('save-template-btn');
    if (saveBtn) {
        saveBtn.addEventListener('click', saveTemplate);
    }
});
