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

    const groups = {};
    const others = [];

    protocolTemplates.forEach(template => {
        const nameMatch = template.name.match(/^(Abnahmeprotokoll|Eingangsprotokoll)\s+(.+)$/i);
        if (nameMatch) {
            const type = nameMatch[1];
            const category = nameMatch[2];

            if (!groups[category]) {
                groups[category] = { categoryName: category };
            }
            if (type.toLowerCase() === 'eingangsprotokoll') {
                groups[category].eingang = template;
            } else if (type.toLowerCase() === 'abnahmeprotokoll') {
                groups[category].abnahme = template;
            } else {
                others.push(template);
            }
        } else {
            others.push(template);
        }
    });

    const createCardHtml = (template, isGrouped, typeLabel) => {
        if (!template) {
            return `
                <div class="settings-card" style="opacity: 0.3; cursor: default; border-style: dashed; display: flex; align-items: center; justify-content: center; height: 100%;">
                    <span style="color: rgba(255,255,255,0.5); font-family: 'Outfit', sans-serif;">Kein ${typeLabel} vorhanden</span>
                </div>
            `;
        }

        const nameMatch = template.name.match(/^(Abnahmeprotokoll|Eingangsprotokoll)\s+(.+)$/i);
        let cardContent = '';

        if (nameMatch) {
            const isEingang = nameMatch[1].toLowerCase() === 'eingangsprotokoll';
            const iconColor = isEingang ? '#3b82f6' : '#f59e0b'; // Blue for Eingang, Amber for Abnahme
            const iconBg = isEingang ? 'rgba(59, 130, 246, 0.1)' : 'rgba(245, 158, 11, 0.1)';

            cardContent = `
                <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 1.25rem;">
                    <div class="settings-icon-container" style="background: ${iconBg}; color: ${iconColor}; width: 42px; height: 42px; border-radius: 12px; display: flex; align-items: center; justify-content: center; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); border: 2px solid ${iconBg}; flex-shrink: 0;">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                            <polyline points="14 2 14 8 20 8"></polyline>
                        </svg>
                    </div>
                    <h2 style="margin: 0; font-size: 1.3rem; color: ${iconColor}; font-weight: 500; font-family: 'Outfit', sans-serif; word-break: break-word;">
                        ${nameMatch[1]}
                    </h2>
                </div>
                <div class="settings-content">
                    <h3 style="margin: 0; font-size: 1.6rem; color: var(--color-primary-green); font-family: 'Outfit', sans-serif; line-height: 1.25; word-break: break-word;">
                        ${nameMatch[2]}
                    </h3>
                    <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 0.75rem;">
                        <span style="font-size: 0.75rem; padding: 2px 8px; background: rgba(255,255,255,0.05); border-radius: 4px; color: rgba(255,255,255,0.5); font-family: 'Inter', sans-serif;">
                            ${Array.isArray(template.structure) ? template.structure.length : 0} GRUPPEN
                        </span>
                    </div>
                </div>
            `;
        } else {
            cardContent = `
                <div class="settings-icon-container" style="background: rgba(59, 130, 246, 0.1); color: #3b82f6; width: 56px; height: 56px; border-radius: 16px; display: flex; align-items: center; justify-content: center; margin-bottom: 1.25rem; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); border: 2px solid rgba(59, 130, 246, 0.1);">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                    </svg>
                </div>
                <div class="settings-content">
                    <h3 style="margin: 0; font-size: 1.15rem; color: #fff; font-family: 'Outfit', sans-serif; word-break: break-word;">${template.name}</h3>
                    <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 0.75rem;">
                        <span style="font-size: 0.75rem; padding: 2px 8px; background: rgba(255,255,255,0.05); border-radius: 4px; color: rgba(255,255,255,0.5); font-family: 'Inter', sans-serif;">
                            ${Array.isArray(template.structure) ? template.structure.length : 0} GRUPPEN
                        </span>
                    </div>
                </div>
            `;
        }

        return `
            <div class="settings-card template-card" style="cursor: pointer; height: 100%;" onclick="openTemplateEditor('${template.id}')">
                ${cardContent}
            </div>
        `;
    };

    const sortedCategories = Object.values(groups).sort((a, b) => a.categoryName.localeCompare(b.categoryName));

    sortedCategories.forEach(group => {
        const row = document.createElement('div');
        row.style.gridColumn = '1 / -1';
        row.style.display = 'grid';
        row.style.gridTemplateColumns = 'repeat(auto-fit, minmax(300px, 1fr))';
        row.style.gap = '1.5rem';
        row.style.marginBottom = '1.5rem';

        row.innerHTML = `
            ${createCardHtml(group.eingang, true, 'Eingangsprotokoll')}
            ${createCardHtml(group.abnahme, true, 'Abnahmeprotokoll')}
        `;
        listContainer.appendChild(row);
    });

    others.forEach(template => {
        const wrapper = document.createElement('div');
        wrapper.style.gridColumn = '1 / -1';
        wrapper.style.display = 'grid';
        wrapper.style.gridTemplateColumns = 'repeat(auto-fit, minmax(300px, 1fr))';
        wrapper.style.gap = '1.5rem';
        wrapper.style.marginBottom = '1.5rem';

        wrapper.innerHTML = `
            ${createCardHtml(template, false, '')}
            <div></div> <!-- placeholder if space is needed -->
        `;
        listContainer.appendChild(wrapper);
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
                    <span style="font-weight: 800; color: var(--color-primary-green); margin-right: 8px;">${groupIndex + 1}.</span>
                    <span class="editable-content" contenteditable="true" 
                          onblur="updateGroupTitle(${groupIndex}, this.textContent)"
                          onclick="event.stopPropagation()">${group.group_title ? group.group_title.replace(/^\\d+\\.\\s*/, '') : 'Neue Gruppe'}</span>
                </div>
                <div class="template-group-actions" onclick="event.stopPropagation()">
                    <button class="btn-icon-mini" onclick="moveGroup(${groupIndex}, -1)" ${groupIndex === 0 ? 'disabled style="opacity: 0.3; cursor: not-allowed;"' : ''} title="Gruppe nach oben">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>
                    </button>
                    <button class="btn-icon-mini" onclick="moveGroup(${groupIndex}, 1)" ${groupIndex === currentEditingTemplate.structure.length - 1 ? 'disabled style="opacity: 0.3; cursor: not-allowed;"' : ''} title="Gruppe nach unten">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                    </button>
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
                        <div class="item-main-content" style="flex: 1; display: flex; flex-direction: column; gap: 12px;">
                            <div style="display: flex; align-items: center; gap: 12px; width: 100%;">
                                ${item.type === 'checkbox' ? `
                                    <div class="glass-checkbox-wrapper">
                                        <input type="checkbox" class="glass-checkbox" checked disabled>
                                    </div>
                                ` : item.type === 'text' ? `
                                    <div class="text-input-indicator" style="width: 24px; color: rgba(255,255,255,0.2); display: flex; align-items: center; justify-content: center;">
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
                                    </div>
                                ` : `
                                    <div class="table-input-indicator" style="width: 24px; color: #3b82f6; display: flex; align-items: center; justify-content: center;">
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="3" y1="15" x2="21" y2="15"></line><line x1="9" y1="3" x2="9" y2="21"></line><line x1="15" y1="3" x2="15" y2="21"></line></svg>
                                    </div>
                                `}
                                <div class="item-text-fields" style="flex: 1;">
                                    <div style="display: flex; align-items: center;">
                                        <span class="editable-content" contenteditable="true" 
                                              onblur="updateItemLabel(${groupIndex}, ${itemIndex}, this.textContent)" style="flex: 1;">${item.label || ''}</span>
                                    </div>
                                    <div style="display: flex; align-items: center; gap: 8px; margin-top: 4px;">
                                        <span class="item-type-tag" onclick="toggleItemType(${groupIndex}, ${itemIndex})" style="cursor: pointer;">${item.type}</span>
                                        ${item.type !== 'table' ? `
                                            <span class="editable-content placeholder-red" contenteditable="true" 
                                                  onblur="updateItemPlaceholder(${groupIndex}, ${itemIndex}, this.textContent)" style="opacity: 0.5;">${item.placeholder || item.placeholder_label || 'Beschreibung / Platzhalter...'}</span>
                                        ` : ''}
                                    </div>
                                </div>
                                <div style="display: flex; gap: 4px; align-items: center;">
                                    <button class="btn-icon-mini" onclick="moveItem(${groupIndex}, ${itemIndex}, -1)" ${itemIndex === 0 ? 'disabled style="opacity: 0.3; cursor: not-allowed;"' : ''} title="Punkt nach oben">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>
                                    </button>
                                    <button class="btn-icon-mini" onclick="moveItem(${groupIndex}, ${itemIndex}, 1)" ${itemIndex === group.items.length - 1 ? 'disabled style="opacity: 0.3; cursor: not-allowed;"' : ''} title="Punkt nach unten">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                                    </button>
                                    <button class="btn-icon-mini delete" onclick="removeItem(${groupIndex}, ${itemIndex})" title="Punkt entfernen">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                            <polyline points="3 6 5 6 21 6"></polyline>
                                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                        </svg>
                                    </button>
                                </div>
                            </div>

                            ${item.type === 'table' ? `
                                <div class="template-table-editor" style="margin-top: 10px; padding: 15px; background: rgba(255,255,255,0.03); border-radius: 12px; border: 1px solid rgba(255,255,255,0.05); position: relative;">
                                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                                        <span style="font-size: 0.75rem; font-weight: 800; color: #3b82f6;">TABELLENSTRUKTUR</span>
                                        <div style="display: flex; gap: 8px;">
                                            <button class="btn-icon-mini" style="background: rgba(59, 130, 246, 0.1); color: #60a5fa;" onclick="addTableColumn(${groupIndex}, ${itemIndex})" title="Spalte hinzufügen (+)">
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                                            </button>
                                        </div>
                                    </div>
                                    <div style="overflow-x: auto; margin-bottom: 10px;">
                                        <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">
                                            <thead>
                                                <tr>
                                                    ${(item.columns || []).map((col, cIdx) => `
                                                        <th style="padding: 8px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.05);">
                                                            <div style="display: flex; align-items: center; gap: 5px;">
                                                                <span contenteditable="true" onblur="updateTableColumn(${groupIndex}, ${itemIndex}, ${cIdx}, this.textContent)" style="flex: 1; outline: none;">${col}</span>
                                                                <button onclick="removeTableColumn(${groupIndex}, ${itemIndex}, ${cIdx})" style="background: none; border: none; color: rgba(255,255,255,0.2); cursor: pointer; padding: 2px;">&times;</button>
                                                            </div>
                                                        </th>
                                                    `).join('')}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                ${(item.rows || []).map((row, rIdx) => `
                                                    <tr>
                                                        ${row.map((cell, cIdx) => {
                                                            const isPlaceholder = /^\s*\[(.*?)\]\s*$/.test(cell);
                                                            return `
                                                            <td style="padding: 8px; border: 1px solid rgba(255,255,255,0.1);">
                                                                <span class="${isPlaceholder ? 'placeholder-red' : ''}" contenteditable="true" onblur="updateTableCell(${groupIndex}, ${itemIndex}, ${rIdx}, ${cIdx}, this.textContent)" style="display: block; width: 100%; outline: none; min-height: 1.2em; ${isPlaceholder ? 'opacity: 0.7;' : ''}">${cell}</span>
                                                            </td>
                                                            `;
                                                        }).join('')}
                                                        <td style="width: 30px; border: none;">
                                                            <button onclick="removeTableRow(${groupIndex}, ${itemIndex}, ${rIdx})" style="background: none; border: none; color: rgba(255,255,255,0.2); cursor: pointer;">&times;</button>
                                                        </td>
                                                    </tr>
                                                `).join('')}
                                            </tbody>
                                        </table>
                                    </div>
                                    <div style="display: flex; justify-content: space-between; align-items: center;">
                                        <button class="btn-icon-mini" style="background: rgba(59, 130, 246, 0.1); color: #60a5fa; width: 30px; height: 30px;" onclick="addTableRow(${groupIndex}, ${itemIndex})" title="Zeile hinzufügen (+)">
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                                        </button>
                                        <span style="font-size: 0.75rem; color: rgba(255,255,255,0.4); font-family: 'Inter', sans-serif;">
                                            Platzhalter = [Beispieltext]
                                        </span>
                                    </div>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                `;
        }).join('')}
                <div style="display: flex; gap: 12px;">
                    <button class="btn-add-item" style="flex: 1;" onclick="addItem(${groupIndex})">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="12" y1="5" x2="12" y2="19"></line>
                            <line x1="5" y1="12" x2="19" y2="12"></line>
                        </svg>
                        FELD HINZUFÜGEN
                    </button>
                    <button class="btn-add-item" style="flex: 1; background: rgba(59, 130, 246, 0.1); color: #60a5fa; border-color: rgba(59, 130, 246, 0.2);" onclick="addTable(${groupIndex})">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                            <line x1="3" y1="9" x2="21" y2="9"></line>
                            <line x1="3" y1="15" x2="21" y2="15"></line>
                            <line x1="9" y1="3" x2="9" y2="21"></line>
                            <line x1="15" y1="3" x2="15" y2="21"></line>
                        </svg>
                        TABELLE HINZUFÜGEN
                    </button>
                </div>
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
        const types = ['checkbox', 'text', 'table'];
        const currentIdx = types.indexOf(item.type);
        item.type = types[(currentIdx + 1) % types.length];
        
        if (item.type === 'table') {
            if (!item.columns) item.columns = ['Spalte 1'];
            if (!item.rows) item.rows = [['Inhalt']];
        }
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
        delete currentEditingTemplate.structure[groupIndex].items[itemIndex].placeholder_label;
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

function addTable(groupIndex) {
    if (!currentEditingTemplate.structure[groupIndex]) return;
    if (!currentEditingTemplate.structure[groupIndex].items) currentEditingTemplate.structure[groupIndex].items = [];

    currentEditingTemplate.structure[groupIndex].is_collapsed = false;

    currentEditingTemplate.structure[groupIndex].items.push({
        id: 'item_' + Date.now(),
        type: 'table',
        label: 'Neue Tabelle',
        columns: ['Spalte 1'],
        rows: [[' ']],
        has_description: false
    });
    renderEditor();
}

function addTableRow(groupIndex, itemIndex) {
    const item = currentEditingTemplate.structure[groupIndex].items[itemIndex];
    const newRow = new Array(item.columns.length).fill(' ');
    item.rows.push(newRow);
    renderEditor();
}

function removeTableRow(groupIndex, itemIndex, rowIndex) {
    const item = currentEditingTemplate.structure[groupIndex].items[itemIndex];
    item.rows.splice(rowIndex, 1);
    renderEditor();
}

function addTableColumn(groupIndex, itemIndex) {
    const item = currentEditingTemplate.structure[groupIndex].items[itemIndex];
    item.columns.push('Neue Spalte');
    item.rows.forEach(row => row.push(' '));
    renderEditor();
}

function removeTableColumn(groupIndex, itemIndex, colIndex) {
    const item = currentEditingTemplate.structure[groupIndex].items[itemIndex];
    item.columns.splice(colIndex, 1);
    item.rows.forEach(row => row.splice(colIndex, 1));
    renderEditor();
}

function updateTableColumn(groupIndex, itemIndex, colIndex, val) {
    currentEditingTemplate.structure[groupIndex].items[itemIndex].columns[colIndex] = val;
}

function updateTableCell(groupIndex, itemIndex, rowIndex, colIndex, val) {
    if (currentEditingTemplate.structure[groupIndex] && currentEditingTemplate.structure[groupIndex].items[itemIndex]) {
        currentEditingTemplate.structure[groupIndex].items[itemIndex].rows[rowIndex][colIndex] = val.trim();
        renderEditor();
    }
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

function moveGroup(index, direction) {
    if (!currentEditingTemplate || !currentEditingTemplate.structure) return;
    const structure = currentEditingTemplate.structure;
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= structure.length) return;

    // Swap groups
    const temp = structure[index];
    structure[index] = structure[targetIndex];
    structure[targetIndex] = temp;

    renderEditor();
}

function moveItem(groupIndex, itemIndex, direction) {
    if (!currentEditingTemplate || !currentEditingTemplate.structure[groupIndex]) return;
    const items = currentEditingTemplate.structure[groupIndex].items;
    const targetIndex = itemIndex + direction;
    if (targetIndex < 0 || targetIndex >= items.length) return;

    // Swap items
    const temp = items[itemIndex];
    items[itemIndex] = items[targetIndex];
    items[targetIndex] = temp;

    renderEditor();
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
window.addTable = addTable;
window.addTableRow = addTableRow;
window.removeTableRow = removeTableRow;
window.addTableColumn = addTableColumn;
window.removeTableColumn = removeTableColumn;
window.updateTableColumn = updateTableColumn;
window.updateTableCell = updateTableCell;
window.moveGroup = moveGroup;
window.moveItem = moveItem;

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
