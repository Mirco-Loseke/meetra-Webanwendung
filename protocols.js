// ==========================================
// PROTOCOLS MODULE
// ==========================================
// Handles intake and acceptance protocols with custom checkpoints,
// photo uploads, edit history, and PDF generation

(function () {
    'use strict';

    console.log('Loading protocols module...');

    // ==========================================
    // GLOBAL STATE
    // ==========================================
    let currentProtocol = null;
    let currentProtocolType = null; // 'intake' or 'acceptance'
    let protocolPhotos = [];
    let customCheckpoints = [];

    // ==========================================
    // MODAL CREATION
    // ==========================================
    function createProtocolModal() {
        // Remove existing modal if present
        const existing = document.getElementById('protocol-modal-overlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'protocol-modal-overlay';
        overlay.className = 'protocol-modal-overlay';

        overlay.innerHTML = `
            <div class="protocol-modal">
                <div class="protocol-modal-header">
                    <div>
                        <h2 id="protocol-modal-title"></h2>
                        <div id="protocol-status-badge" style="margin-top: 0.75rem;"></div>
                    </div>
                    <button onclick="window.closeProtocolModal()" class="sidebar-user-profile" style="
                        background: rgba(255, 255, 255, 0.05);
                        border: 1px solid var(--glass-border);
                        color: #fff;
                        width: 44px;
                        height: 44px;
                        border-radius: 50%;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                    " onmouseover="this.style.transform='rotate(90deg) scale(1.1)'; this.style.background='rgba(255, 100, 100, 0.1)';" onmouseout="this.style.transform='rotate(0deg) scale(1)'; this.style.background='rgba(255, 255, 255, 0.05)';">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>

                <div class="protocol-modal-content">
                    <!-- Template Selection (Only for new protocols) -->
                    <div id="template-selection-section" style="margin-bottom: 2.5rem; display: none;">
                        <span class="protocol-section-title">📝 Vorlage auswählen</span>
                        <select id="protocol-template-select" class="glass-form-input" style="cursor: pointer; font-weight: 700;">
                            <option value="">-- Standard Protokoll --</option>
                        </select>
                        <p style="font-size: 0.75rem; color: rgba(255,255,255,0.4); margin-top: 0.5rem; font-style: italic;">
                            Wählen Sie eine Vorlage aus, die für diese Maschinenkategorie definiert wurde.
                        </p>
                    </div>

                    <!-- Machine Title (Read-only) -->
                    <div style="margin-bottom: 2.5rem;">
                        <span class="protocol-section-title">Maschine</span>
                        <div style="position: relative;">
                            <input type="text" id="protocol-machine-title" readonly class="glass-form-input" style="opacity: 0.7; font-weight: 600; padding-right: 80px;">
                            <div style="position: absolute; right: 12px; top: 50%; transform: translateY(-50%); font-size: 0.75rem; font-weight: 800; color: #10b981; background: rgba(16, 185, 129, 0.1); padding: 4px 8px; border-radius: 6px; pointer-events: none; border: 1px solid rgba(16, 185, 129, 0.2); text-transform: uppercase;">Fixiert</div>
                        </div>
                    </div>

                    <!-- Predefined Checkpoints -->
                    <div id="predefined-checkpoints-section" style="margin-bottom: 3rem;">
                        <h3 class="protocol-section-title">🔍 Vordefinierte Prüfpunkte</h3>
                        <div id="predefined-checkpoints-list"></div>
                    </div>

                    <!-- Custom Checkpoints -->
                    <div id="custom-checkpoints-section" style="margin-bottom: 3rem;">
                        <h3 class="protocol-section-title">➕ Zusätzliche Prüfpunkte</h3>
                        <div id="custom-checkpoints-list"></div>
                        <div id="add-checkpoint-form" style="display: none; margin-top: 1.5rem; padding: 1.5rem; background: rgba(255, 255, 255, 0.03); border-radius: 20px; border: 1px solid var(--glass-border);">
                            <input type="text" id="new-checkpoint-description" class="glass-form-input" placeholder="Beschreibung des Prüfpunkts" style="margin-bottom: 1.25rem;">
                            <div style="display: flex; gap: 1.5rem; align-items: center; margin-bottom: 1.5rem; padding-left: 0.5rem;">
                                <label style="color: rgba(255, 255, 255, 0.6); font-size: 0.95rem; font-weight: 600;">Ergebnis:</label>
                                <label class="protocol-checkbox-label yes">
                                    <input type="radio" name="new-checkpoint-result" value="true" style="width: 20px; height: 20px;">
                                    <span>Ja</span>
                                </label>
                                <label class="protocol-checkbox-label no">
                                    <input type="radio" name="new-checkpoint-result" value="false" style="width: 20px; height: 20px;">
                                    <span>Nein</span>
                                </label>
                            </div>
                            <div style="display: flex; gap: 1rem;">
                                <button onclick="window.saveNewCheckpoint()" class="btn-primary" style="flex: 2; border-radius: 14px;">Hinzufügen</button>
                                <button onclick="window.cancelNewCheckpoint()" class="btn-secondary" style="flex: 1; border-radius: 14px;">Abbrechen</button>
                            </div>
                        </div>
                        <button onclick="window.showAddCheckpointForm()" id="add-checkpoint-btn" class="report-type-btn compact" style="margin-top:0.5rem; width: auto; background: rgba(59, 130, 246, 0.1); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.2);">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                <line x1="12" y1="5" x2="12" y2="19"></line>
                                <line x1="5" y1="12" x2="19" y2="12"></line>
                            </svg>
                            <span>Prüfpunkt hinzufügen</span>
                        </button>
                    </div>

                    <!-- Free Text Fields -->
                    <div id="text-fields-section" style="margin-bottom: 3rem;">
                        <h3 class="protocol-section-title">ℹ️ Zusätzliche Informationen</h3>
                        <div id="protocol-text-fields"></div>
                    </div>

                    <!-- Photos -->
                    <div id="photos-section" style="margin-bottom: 3rem;">
                        <h3 class="protocol-section-title">📸 Fotos</h3>
                        <div id="protocol-photos-grid" class="protocol-photo-grid"></div>
                        <input type="file" id="protocol-photo-input" accept="image/*" multiple style="display: none;">
                        <button onclick="document.getElementById('protocol-photo-input').click()" class="report-type-btn compact" style="width: auto; background: rgba(16, 185, 129, 0.1); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.2);">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                                <circle cx="8.5" cy="8.5" r="1.5"></circle>
                                <polyline points="21 15 16 10 5 21"></polyline>
                            </svg>
                            <span>Fotos hochladen</span>
                        </button>
                    </div>

                    <!-- Edit History -->
                    <div id="edit-history-section" style="display: none; margin-bottom: 2rem; padding: 1.5rem; background: rgba(255, 255, 255, 0.02); border-radius: 20px; border: 1px solid var(--glass-border);">
                        <h3 class="protocol-section-title">🕒 Bearbeitungshistorie</h3>
                        <div id="edit-history-list"></div>
                    </div>
                </div>

                <div class="protocol-modal-actions">
                    <button onclick="window.closeProtocolModal()" class="btn-secondary" style="flex: 1; border-radius: 16px; min-height: 54px; font-weight: 700;">Abbrechen</button>
                    <button onclick="window.saveProtocol()" class="btn-primary" style="flex: 1; border-radius: 16px; min-height: 54px; font-weight: 700;">Speichern</button>
                    <button onclick="window.completeProtocol()" id="complete-protocol-btn" class="btn-primary" style="flex: 1.5; background: rgba(16, 185, 129, 0.2); border-color: rgba(16, 185, 129, 0.3); color: #10b981; border-radius: 16px; min-height: 54px; font-weight: 800;">Abschließen</button>
                    <button onclick="window.generateProtocolPDF()" id="generate-pdf-btn" style="display: none; flex: 1.5; background: rgba(239, 68, 68, 0.2); border: 1px solid rgba(239, 68, 68, 0.3); color: #ef4444; border-radius: 16px; min-height: 54px; font-weight: 800; cursor: pointer; font-family: 'Inter', sans-serif;">PDF erstellen</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        // Add photo input change listener
        document.getElementById('protocol-photo-input').addEventListener('change', handlePhotoUpload);

        return overlay;
    }

    // ==========================================
    // MODAL FUNCTIONS
    // ==========================================
    window.openIntakeProtocol = async function (machineId, protocolId = null) {
        currentProtocolType = 'intake';
        await openProtocolModal(machineId, protocolId, 'intake');
    };

    window.openAcceptanceProtocol = async function (machineId, protocolId = null) {
        currentProtocolType = 'acceptance';
        await openProtocolModal(machineId, protocolId, 'acceptance');
    };

    async function openProtocolModal(machineId, protocolId, type) {
        const modal = createProtocolModal();
        const overlay = document.getElementById('protocol-modal-overlay');

        // Get machine data
        const machine = window.machineList.find(m => String(m.id) === String(machineId));
        if (!machine) {
            alert('Maschine nicht gefunden');
            return;
        }

        // Generate title from machine data
        const machineTitle = [
            machine.manufacturer,
            machine.name,
            machine.serial ? `#${machine.serial}` : null,
            machine.year ? `(${machine.year})` : null
        ].filter(Boolean).join(' ');

        // Set modal title
        const modalTitle = type === 'intake' ? '📋 Eingangsprotokoll' : '✅ Abnahmeprotokoll';
        document.getElementById('protocol-modal-title').textContent = modalTitle;
        document.getElementById('protocol-machine-title').value = machineTitle;

        // Apply category theme
        if (overlay) {
            // Clear previous themes
            overlay.className = 'protocol-modal-overlay';

            const categories = window.categoryList || [];
            const cat = machine ? categories.find(c => c.id === machine.category_id) : null;
            const catNameLower = (cat ? cat.name : '').toLowerCase();

            if (catNameLower.includes('rotorschaufel')) overlay.classList.add('theme-rotorschaufel');
            else if (catNameLower.includes('umsetzer')) overlay.classList.add('theme-umsetzer');
            else if (catNameLower.includes('brecher')) overlay.classList.add('theme-brecher');
        }

        // Load or create protocol
        if (protocolId) {
            await loadProtocol(protocolId, type);
            document.getElementById('template-selection-section').style.display = 'none';
        } else {
            // New protocol
            currentProtocol = {
                machine_id: machineId,
                title: machineTitle,
                status: 'draft',
                predefined_checkpoints: type === 'intake' ? getIntakeCheckpoints() : getAcceptanceCheckpoints()
            };
            customCheckpoints = [];
            protocolPhotos = [];

            // Fetch and show templates
            await setupTemplateSelection(machine.category_id, type);
        }

        // Conditionally hide sections for Rotorschaufel Acceptance
        const categories = window.categoryList || [];
        const catObj = machine ? categories.find(c => c.id === machine.category_id) : null;
        const isRotorschaufel = (catObj ? catObj.name : '').toLowerCase().includes('rotorschaufel');
        const isAcceptance = type === 'acceptance';

        const customSection = document.getElementById('custom-checkpoints-section');
        const textSection = document.getElementById('text-fields-section');

        if (isRotorschaufel && isAcceptance) {
            if (customSection) customSection.style.display = 'none';
            if (textSection) textSection.style.display = 'none';
        } else {
            if (customSection) customSection.style.display = 'block';
            if (textSection) textSection.style.display = 'block';
        }

        // Render predefined checkpoints
        renderPredefinedCheckpoints();

        // Render custom checkpoints
        renderCustomCheckpoints();

        // Render text fields (will be empty if section is hidden anyway, but for completeness)
        renderTextFields(type, isRotorschaufel && isAcceptance);

        // Render photos
        renderPhotos();

        // Render edit history if exists
        if (currentProtocol.completed_at || (currentProtocol.edit_history && currentProtocol.edit_history.length > 0)) {
            renderEditHistory();
        }

        // Update status badge
        updateStatusBadge();

        // Show/hide PDF button
        if (currentProtocol.status === 'completed') {
            document.getElementById('generate-pdf-btn').style.display = 'block';
            document.getElementById('complete-protocol-btn').style.display = 'none';
        }

        // Show modal
        overlay.style.display = 'flex';
    }

    window.closeProtocolModal = function () {
        const overlay = document.getElementById('protocol-modal-overlay');
        if (overlay) {
            overlay.style.display = 'none';
            overlay.remove();
        }
        currentProtocol = null;
        currentProtocolType = null;
        customCheckpoints = [];
        protocolPhotos = [];
    };

    async function setupTemplateSelection(categoryId, type) {
        const section = document.getElementById('template-selection-section');
        const select = document.getElementById('protocol-template-select');
        if (!section || !select) return;

        try {
            // Fetch templates for this category or general ones
            let query = window.supabaseClient
                .from('protocol_templates')
                .select('*');

            if (categoryId) {
                query = query.or(`category_id.eq.${categoryId},category_id.is.null`);
            } else {
                query = query.is('category_id', null);
            }

            if (type) {
                query = query.or(`type.eq.${type},type.is.null`);
            }

            const { data: templates } = await query.order('name');

            if (templates && templates.length > 0) {
                section.style.display = 'block';
                select.innerHTML = '<option value="">-- Standard Protokoll --</option>';
                templates.forEach(t => {
                    const option = document.createElement('option');
                    option.value = t.id;
                    option.textContent = t.name;
                    select.appendChild(option);
                });

                select.onchange = (e) => {
                    const selectedId = e.target.value;
                    const template = templates.find(t => t.id == selectedId);
                    if (template) {
                        applyTemplate(template);
                    } else {
                        // Reset to defaults
                        currentProtocol.predefined_checkpoints = currentProtocolType === 'intake' ? getIntakeCheckpoints() : getAcceptanceCheckpoints();
                        renderPredefinedCheckpoints();
                    }
                };

                // Zero-Click Workflow: Auto-select if only one matching template exists
                if (templates.length === 1) {
                    console.log('Zero-Click: Auto-applying single matching template:', templates[0].name);
                    section.style.display = 'none'; // Hide selection UI for "built-in" feel
                    select.value = templates[0].id;
                    applyTemplate(templates[0]);
                }
            } else {
                section.style.display = 'none';
            }
        } catch (err) {
            console.error('Error setting up template selection:', err);
        }
    }

    function applyTemplate(template) {
        if (!template || !template.structure) return;

        // Intelligent Placeholders: Pre-fill machine data
        const machine = (window.machineList || []).find(m => m.id === currentProtocol.machine_id);

        currentProtocol.predefined_checkpoints = template.structure.map(group => ({
            group_title: group.group_title,
            items: (group.items || []).map(item => {
                let initialResult = null;

                // Pre-fill logic based on label keywords
                if (machine) {
                    const labelLower = item.label.toLowerCase();
                    if (labelLower.includes('seriennummer') || labelLower.includes('serial')) {
                        initialResult = machine.serial || '';
                    } else if (labelLower.includes('baujahr') || labelLower.includes('year')) {
                        initialResult = machine.year || '';
                    } else if (labelLower.includes('hersteller') || labelLower.includes('manufacturer')) {
                        initialResult = machine.manufacturer || '';
                    }
                }

                return {
                    label: item.label,
                    type: item.type,
                    result: initialResult || false, // Default to false for single checkbox
                    comment: '', // Initialize empty comment
                    placeholder_label: item.placeholder_label, // Keep from template
                    id: item.id || Date.now() + Math.random()
                };
            })
        }));

        renderPredefinedCheckpoints();
    }

    // ==========================================
    // CHECKPOINT FUNCTIONS
    // ==========================================
    function getIntakeCheckpoints() {
        return {
            machine_clean: null,
            machine_dirty: null,
            visible_damage: null,
            accessories_complete: null,
            machine_starts: null,
            emergency_stop_works: null,
            display_ok: null,
            error_messages_present: null,
            protective_covers_present: null,
            cables_undamaged: null,
            plug_ok: null
        };
    }

    function getAcceptanceCheckpoints() {
        return {
            test_run_ok: null,
            electrical_ok: null,
            safety_ok: null,
            functionality_ok: null,
            visual_inspection_ok: null
        };
    }

    function getCheckpointLabel(key, type) {
        const intakeLabels = {
            machine_clean: 'Maschine sauber',
            machine_dirty: 'Maschine verschmutzt',
            visible_damage: 'Äußere Beschädigungen sichtbar',
            accessories_complete: 'Zubehör vollständig',
            machine_starts: 'Maschine startet',
            emergency_stop_works: 'Not-Aus funktioniert',
            display_ok: 'Anzeige / Display ok',
            error_messages_present: 'Fehlermeldungen vorhanden',
            protective_covers_present: 'Schutzhauben vorhanden',
            cables_undamaged: 'Kabel unbeschädigt',
            plug_ok: 'Stecker ok'
        };

        const acceptanceLabels = {
            test_run_ok: 'Probelauf erfolgreich',
            electrical_ok: 'Elektrik in Ordnung',
            safety_ok: 'Sicherheit gewährleistet',
            functionality_ok: 'Funktionalität geprüft',
            visual_inspection_ok: 'Sichtprüfung bestanden'
        };

        return type === 'intake' ? intakeLabels[key] : acceptanceLabels[key];
    }

    function renderPredefinedCheckpoints() {
        const container = document.getElementById('predefined-checkpoints-list');
        container.innerHTML = '';

        const checkpoints = currentProtocol.predefined_checkpoints;
        if (!checkpoints) return;

        if (Array.isArray(checkpoints)) {
            // New structured format from template
            renderStructuredCheckpoints(container, checkpoints);
        } else {
            // Legacy object format
            renderLegacyCheckpoints(container, checkpoints);
        }
    }

    function renderStructuredCheckpoints(container, groups) {
        groups.forEach((group, gIdx) => {
            const groupDiv = document.createElement('div');
            groupDiv.className = 'protocol-checkpoint-group';
            groupDiv.style.marginBottom = '1.5rem';

            // Accordion Header
            if (group.group_title) {
                const header = document.createElement('div');
                header.className = 'protocol-group-header';
                header.onclick = () => window.toggleProtocolGroup(gIdx);
                header.id = `protocol-group-header-${gIdx}`;

                header.innerHTML = `
                    <h4>${group.group_title}</h4>
                    <svg class="protocol-toggle-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                `;
                groupDiv.appendChild(header);
            }

            // Accordion Content
            const itemsContainer = document.createElement('div');
            itemsContainer.className = 'protocol-group-content';
            itemsContainer.id = `protocol-group-content-${gIdx}`;

            group.items.forEach((item, iIdx) => {
                const row = document.createElement('div');
                row.className = 'protocol-checkpoint-row';

                // Checkbox (Single toggle)
                const checkboxWrapper = document.createElement('div');
                checkboxWrapper.className = 'protocol-single-checkbox-wrapper';
                checkboxWrapper.innerHTML = `
                    <input type="checkbox" class="protocol-single-checkbox" 
                           ${item.result === true ? 'checked' : ''} 
                           onchange="window.updateStructuredCheckpoint(${gIdx}, ${iIdx}, 'result', this.checked)">
                `;

                // Label
                const label = document.createElement('span');
                label.className = 'protocol-item-label';
                label.textContent = item.label;

                // Integrated Text Input
                const input = document.createElement('input');
                input.type = 'text';
                input.className = 'protocol-integrated-input';
                input.value = item.comment || '';
                // Use placeholder from template or generic fallback
                input.placeholder = item.placeholder_label || 'Bemerkung...';
                input.onblur = (e) => window.updateStructuredCheckpoint(gIdx, iIdx, 'comment', e.target.value);

                row.appendChild(checkboxWrapper);
                row.appendChild(label);
                row.appendChild(input);

                itemsContainer.appendChild(row);
            });

            groupDiv.appendChild(itemsContainer);
            container.appendChild(groupDiv);
        });
    }

    window.toggleProtocolGroup = function (gIdx) {
        const content = document.getElementById(`protocol-group-content-${gIdx}`);
        const header = document.getElementById(`protocol-group-header-${gIdx}`);
        if (content && header) {
            content.classList.toggle('collapsed');
            header.classList.toggle('collapsed-header');
        }
    };

    function renderLegacyCheckpoints(container, checkpoints) {
        Object.keys(checkpoints).forEach(key => {
            const value = checkpoints[key];
            const label = getCheckpointLabel(key, currentProtocolType);

            const row = document.createElement('div');
            row.className = 'protocol-checkpoint-row';

            row.innerHTML = `
                <span style="color: #fff; font-weight: 600; font-size: 1rem;">${label}</span>
                <div style="display: flex; gap: 0.75rem;">
                    <label class="protocol-checkbox-label yes">
                        <input type="radio" name="checkpoint-${key}" value="true" ${value === true ? 'checked' : ''} onchange="window.updatePredefinedCheckpoint('${key}', true)" style="width: 20px; height: 20px;">
                        <span>Ja</span>
                    </label>
                    <label class="protocol-checkbox-label no">
                        <input type="radio" name="checkpoint-${key}" value="false" ${value === false ? 'checked' : ''} onchange="window.updatePredefinedCheckpoint('${key}', false)" style="width: 20px; height: 20px;">
                        <span>Nein</span>
                    </label>
                </div>
            `;

            container.appendChild(row);
        });
    }

    window.updateStructuredCheckpoint = function (gIdx, iIdx, field, value) {
        if (currentProtocol.predefined_checkpoints[gIdx] && currentProtocol.predefined_checkpoints[gIdx].items[iIdx]) {
            // field can be 'result' or 'comment'
            currentProtocol.predefined_checkpoints[gIdx].items[iIdx][field] = value;
        }
    };

    window.updatePredefinedCheckpoint = function (key, value) {
        currentProtocol.predefined_checkpoints[key] = value;
    };

    window.showAddCheckpointForm = function () {
        document.getElementById('add-checkpoint-form').style.display = 'block';
        document.getElementById('add-checkpoint-btn').style.display = 'none';
        document.getElementById('new-checkpoint-description').focus();
    };

    window.cancelNewCheckpoint = function () {
        document.getElementById('add-checkpoint-form').style.display = 'none';
        document.getElementById('add-checkpoint-btn').style.display = 'flex';
        document.getElementById('new-checkpoint-description').value = '';
        document.querySelectorAll('input[name="new-checkpoint-result"]').forEach(r => r.checked = false);
    };

    window.saveNewCheckpoint = function () {
        const description = document.getElementById('new-checkpoint-description').value.trim();
        const resultRadio = document.querySelector('input[name="new-checkpoint-result"]:checked');

        if (!description) {
            alert('Bitte geben Sie eine Beschreibung ein');
            return;
        }

        const result = resultRadio ? (resultRadio.value === 'true') : null;

        customCheckpoints.push({
            id: Date.now(), // Temporary ID for new checkpoints
            description,
            result,
            sort_order: customCheckpoints.length
        });

        renderCustomCheckpoints();
        window.cancelNewCheckpoint();
    };

    function renderCustomCheckpoints() {
        const container = document.getElementById('custom-checkpoints-list');
        container.innerHTML = '';

        customCheckpoints.forEach((checkpoint, index) => {
            const row = document.createElement('div');
            row.className = 'protocol-checkpoint-row';
            row.style.background = 'rgba(59, 130, 246, 0.03)';
            row.style.borderColor = 'rgba(59, 130, 246, 0.1)';

            row.innerHTML = `
                <span style="color: #fff; font-weight: 600; font-size: 1rem;">${checkpoint.description}</span>
                <div style="display: flex; gap: 1rem; align-items: center;">
                    <div style="display: flex; gap: 0.75rem;">
                        <label class="protocol-checkbox-label yes">
                            <input type="radio" name="custom-checkpoint-${checkpoint.id}" value="true" ${checkpoint.result === true ? 'checked' : ''} onchange="window.updateCustomCheckpoint(${index}, true)" style="width: 20px; height: 20px;">
                            <span>Ja</span>
                        </label>
                        <label class="protocol-checkbox-label no">
                            <input type="radio" name="custom-checkpoint-${checkpoint.id}" value="false" ${checkpoint.result === false ? 'checked' : ''} onchange="window.updateCustomCheckpoint(${index}, false)" style="width: 20px; height: 20px;">
                            <span>Nein</span>
                        </label>
                    </div>
                    <button onclick="window.deleteCustomCheckpoint(${index})" style="
                        background: rgba(239, 68, 68, 0.1);
                        border: 1px solid rgba(239, 68, 68, 0.2);
                        color: #ef4444;
                        width: 36px;
                        height: 36px;
                        border-radius: 10px;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        transition: all 0.2s;
                    " onmouseover="this.style.background='rgba(239, 68, 68, 0.2)'" onmouseout="this.style.background='rgba(239, 68, 68, 0.1)'">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M3 6h18"></path>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2-2v2"></path>
                        </svg>
                    </button>
                </div>
            `;

            container.appendChild(row);
        });
    }

    window.updateCustomCheckpoint = function (index, value) {
        customCheckpoints[index].result = value;
    };

    window.deleteCustomCheckpoint = function (index) {
        if (confirm('Prüfpunkt wirklich löschen?')) {
            customCheckpoints.splice(index, 1);
            renderCustomCheckpoints();
        }
    };

    // ==========================================
    // TEXT FIELDS
    // ==========================================
    function renderTextFields(type, hideAll = false) {
        const container = document.getElementById('protocol-text-fields');
        container.innerHTML = '';

        if (hideAll) return;

        if (type === 'intake') {
            container.innerHTML = `
                <div class="form-group" style="margin-bottom: 2rem;">
                    <label style="display: block; margin-bottom: 0.75rem; color: rgba(255, 255, 255, 0.6); font-weight: 700; font-size: 0.95rem;">🚩 FEHLERBESCHREIBUNG / ARBEITSAUFTRAG</label>
                    <textarea id="protocol-error-description" rows="5" class="glass-form-input" placeholder="Detaillierte Fehlerbeschreibung eingeben...">${currentProtocol.error_description || ''}</textarea>
                </div>
            `;
        } else {
            container.innerHTML = `
                <div class="form-group" style="margin-bottom: 2rem;">
                    <label style="display: block; margin-bottom: 0.75rem; color: rgba(255, 255, 255, 0.6); font-weight: 700; font-size: 0.95rem;">🛠️ DURCHGEFÜHRTE ARBEITEN</label>
                    <textarea id="protocol-work-performed" rows="4" class="glass-form-input" placeholder="Zusammenfassung der Arbeiten...">${currentProtocol.work_performed || ''}</textarea>
                </div>
                <div class="form-group" style="margin-bottom: 2rem;">
                    <label style="display: block; margin-bottom: 0.75rem; color: rgba(255, 255, 255, 0.6); font-weight: 700; font-size: 0.95rem;">⚙️ GETAUSCHTE TEILE</label>
                    <textarea id="protocol-parts-replaced" rows="3" class="glass-form-input" placeholder="Liste der Ersatzteile...">${currentProtocol.parts_replaced || ''}</textarea>
                </div>
                <div class="form-group" style="margin-bottom: 2rem;">
                    <label style="display: block; margin-bottom: 0.75rem; color: rgba(255, 255, 255, 0.6); font-weight: 700; font-size: 0.95rem;">📐 EINSTELLUNGEN / KALIBRIERUNGEN</label>
                    <textarea id="protocol-settings-calibrations" rows="3" class="glass-form-input" placeholder="Vorgenommene Einstellungen...">${currentProtocol.settings_calibrations || ''}</textarea>
                </div>
                <div class="form-group" style="margin-bottom: 2rem;">
                    <label style="display: block; margin-bottom: 0.75rem; color: rgba(255, 255, 255, 0.6); font-weight: 700; font-size: 0.95rem;">⚠️ RESTMÄNGEL</label>
                    <textarea id="protocol-remaining-defects" rows="3" class="glass-form-input" placeholder="Bekannte Restmängel...">${currentProtocol.remaining_defects || ''}</textarea>
                </div>
            `;
        }
    }

    // ==========================================
    // PHOTO FUNCTIONS
    // ==========================================
    async function handlePhotoUpload(event) {
        const files = event.target.files;
        if (!files || files.length === 0) return;

        const uploadBtn = event.target.previousElementSibling;
        const originalText = uploadBtn.textContent;
        uploadBtn.textContent = 'Wird hochgeladen...';
        uploadBtn.disabled = true;

        try {
            for (let file of files) {
                const cleanName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
                const fileName = `Protokolle / ${Date.now()} -${cleanName} `;

                const { data, error } = await window.supabaseClient
                    .storage
                    .from('meetra-storage')
                    .upload(fileName, file);

                if (error) throw error;

                const { data: urlData } = window.supabaseClient
                    .storage
                    .from('meetra-storage')
                    .getPublicUrl(fileName);

                protocolPhotos.push({
                    id: Date.now() + Math.random(), // Temporary ID
                    file_name: fileName,
                    file_url: urlData.publicUrl,
                    file_size: file.size
                });
            }

            renderPhotos();
            event.target.value = ''; // Reset input
        } catch (err) {
            console.error('Photo upload error:', err);
            alert('Fehler beim Hochladen: ' + err.message);
        } finally {
            uploadBtn.textContent = originalText;
            uploadBtn.disabled = false;
        }
    }

    function renderPhotos() {
        const container = document.getElementById('protocol-photos-grid');
        container.innerHTML = '';

        protocolPhotos.forEach((photo, index) => {
            const photoCard = document.createElement('div');
            photoCard.className = 'protocol-photo-card';

            photoCard.innerHTML = `
                <img src="${photo.file_url}" loading="lazy">
                <button onclick="window.deleteProtocolPhoto(${index})" class="protocol-photo-remove">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            `;

            container.appendChild(photoCard);
        });
    }

    window.deleteProtocolPhoto = function (index) {
        if (confirm('Foto wirklich löschen?')) {
            protocolPhotos.splice(index, 1);
            renderPhotos();
        }
    };

    // ==========================================
    // SAVE & COMPLETE
    // ==========================================
    window.saveProtocol = async function () {
        try {
            // Collect text field data
            if (currentProtocolType === 'intake') {
                currentProtocol.error_description = document.getElementById('protocol-error-description')?.value || '';
            } else {
                currentProtocol.work_performed = document.getElementById('protocol-work-performed')?.value || '';
                currentProtocol.parts_replaced = document.getElementById('protocol-parts-replaced')?.value || '';
                currentProtocol.settings_calibrations = document.getElementById('protocol-settings-calibrations')?.value || '';
                currentProtocol.remaining_defects = document.getElementById('protocol-remaining-defects')?.value || '';
            }

            // Add edit history entry
            if (!currentProtocol.edit_history) currentProtocol.edit_history = [];
            currentProtocol.edit_history.push({
                edited_at: new Date().toISOString(),
                edited_by: window.activeUser?.id || null,
                edited_by_name: window.activeUser?.name || 'Unbekannt'
            });

            currentProtocol.updated_at = new Date().toISOString();

            // Save to database
            const tableName = currentProtocolType === 'intake' ? 'intake_protocols' : 'acceptance_protocols';

            let result;
            if (currentProtocol.id) {
                // Update existing
                result = await window.supabaseClient
                    .from(tableName)
                    .update(currentProtocol)
                    .eq('id', currentProtocol.id);
            } else {
                // Insert new
                currentProtocol.created_by = window.activeUser?.id || null;
                result = await window.supabaseClient
                    .from(tableName)
                    .insert([currentProtocol])
                    .select();

                if (result.data && result.data[0]) {
                    currentProtocol.id = result.data[0].id;
                }
            }

            if (result.error) throw result.error;

            // Save custom checkpoints
            await saveCustomCheckpoints();

            // Save photos
            await saveProtocolPhotos();

            // Refresh protocols list if view is active
            if (typeof window.fetchProtocols === 'function') {
                window.fetchProtocols();
            }

            alert('Protokoll erfolgreich gespeichert!');
        } catch (err) {
            console.error('Save protocol error:', err);
            alert('Fehler beim Speichern: ' + err.message);
        }
    };

    window.completeProtocol = async function () {
        // Mandatory Field Check: Ensure all checkboxes are answered
        const pendingCheckpoints = [];
        if (Array.isArray(currentProtocol.predefined_checkpoints)) {
            currentProtocol.predefined_checkpoints.forEach(group => {
                group.items.forEach(item => {
                    if (item.type === 'checkbox' && (item.result === null || item.result === undefined)) {
                        pendingCheckpoints.push(item.label);
                    }
                });
            });
        }

        // Check custom checkpoints too
        customCheckpoints.forEach(cp => {
            if (cp.result === null || cp.result === undefined) {
                pendingCheckpoints.push(cp.description);
            }
        });

        if (pendingCheckpoints.length > 0) {
            alert('Bitte füllen Sie alle Prüfpunkte aus, bevor Sie das Protokoll abschließen:\n\n- ' + pendingCheckpoints.slice(0, 5).join('\n- ') + (pendingCheckpoints.length > 5 ? '\n... und weitere' : ''));
            return;
        }

        if (!confirm('Protokoll abschließen? Nach dem Abschluss können Sie weiterhin Änderungen vornehmen.')) return;

        currentProtocol.status = 'completed';
        currentProtocol.completed_at = new Date().toISOString();
        currentProtocol.completed_by = window.activeUser?.id || null;

        await window.saveProtocol();

        // Update UI
        updateStatusBadge();
        document.getElementById('generate-pdf-btn').style.display = 'block';
        document.getElementById('complete-protocol-btn').style.display = 'none';
        renderEditHistory();
    };

    async function saveCustomCheckpoints() {
        if (!currentProtocol.id) return;

        // Delete existing custom checkpoints for this protocol
        await window.supabaseClient
            .from('protocol_checkpoints')
            .delete()
            .eq('protocol_id', currentProtocol.id)
            .eq('protocol_type', currentProtocolType);

        // Insert new ones
        if (customCheckpoints.length > 0) {
            const checkpointsToSave = customCheckpoints.map(cp => ({
                protocol_id: currentProtocol.id,
                protocol_type: currentProtocolType,
                description: cp.description,
                result: cp.result,
                sort_order: cp.sort_order,
                created_by: window.activeUser?.id || null
            }));

            await window.supabaseClient
                .from('protocol_checkpoints')
                .insert(checkpointsToSave);
        }
    }

    async function saveProtocolPhotos() {
        if (!currentProtocol.id) return;

        // Delete existing photos for this protocol
        await window.supabaseClient
            .from('protocol_photos')
            .delete()
            .eq('protocol_id', currentProtocol.id)
            .eq('protocol_type', currentProtocolType);

        // Insert new ones
        if (protocolPhotos.length > 0) {
            const photosToSave = protocolPhotos.map(photo => ({
                protocol_id: currentProtocol.id,
                protocol_type: currentProtocolType,
                file_name: photo.file_name,
                file_url: photo.file_url,
                file_size: photo.file_size,
                uploaded_by: window.activeUser?.id || null
            }));

            await window.supabaseClient
                .from('protocol_photos')
                .insert(photosToSave);
        }
    }

    async function loadProtocol(protocolId, type) {
        const tableName = type === 'intake' ? 'intake_protocols' : 'acceptance_protocols';

        const { data, error } = await window.supabaseClient
            .from(tableName)
            .select('*')
            .eq('id', protocolId)
            .single();

        if (error) {
            console.error('Load protocol error:', error);
            alert('Fehler beim Laden: ' + error.message);
            return;
        }

        currentProtocol = data;

        // Load custom checkpoints
        const { data: checkpointsData } = await window.supabaseClient
            .from('protocol_checkpoints')
            .select('*')
            .eq('protocol_id', protocolId)
            .eq('protocol_type', type)
            .order('sort_order');

        customCheckpoints = checkpointsData || [];

        // Load photos
        const { data: photosData } = await window.supabaseClient
            .from('protocol_photos')
            .select('*')
            .eq('protocol_id', protocolId)
            .eq('protocol_type', type);

        protocolPhotos = photosData || [];
    }

    // ==========================================
    // UI HELPERS
    // ==========================================
    function updateStatusBadge() {
        const container = document.getElementById('protocol-status-badge');
        if (!container) return;

        const status = currentProtocol.status || 'draft';
        const isDraft = status === 'draft';

        container.innerHTML = `
            <div class="protocol-status-badge ${isDraft ? 'draft' : 'completed'}">
                ${isDraft ? `
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19l7-7 3 3-7 7-3-3z"></path><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"></path><path d="M2 2l7.586 7.586"></path><circle cx="11" cy="11" r="2"></circle></svg>
                    Entwurf
                ` : `
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    Abgeschlossen
                `}
            </div>
        `;
    }

    function renderEditHistory() {
        const section = document.getElementById('edit-history-section');
        const list = document.getElementById('edit-history-list');

        section.style.display = 'block';
        list.innerHTML = '';

        // Completion info
        if (currentProtocol.completed_at) {
            const completedDate = new Date(currentProtocol.completed_at).toLocaleString('de-DE');
            const completedUser = window.userList?.find(u => u.id === currentProtocol.completed_by);
            const completedUserName = completedUser?.name || 'Unbekannt';

            list.innerHTML += `
                <div style="padding: 1.25rem; background: rgba(16, 185, 129, 0.05); border-left: 4px solid #10b981; border-radius: 12px; margin-bottom: 1rem; backdrop-filter: blur(8px);">
                    <div style="color: #10b981; font-weight: 800; margin-bottom: 0.5rem; display: flex; align-items: center; gap: 0.5rem;">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        STATUS: ABGESCHLOSSEN
                    </div>
                    <div style="color: rgba(255, 255, 255, 0.6); font-size: 0.95rem; font-weight: 500;">
                        ${completedDate} von ${completedUserName}
                    </div>
                </div>
            `;
        }

        // Edit history
        if (currentProtocol.edit_history && currentProtocol.edit_history.length > 0) {
            [...currentProtocol.edit_history].reverse().forEach(edit => {
                const editDate = new Date(edit.edited_at).toLocaleString('de-DE');
                const editorUser = window.userList?.find(u => u.id === edit.edited_by);
                const editorName = editorUser ? editorUser.name : (edit.edited_by_name || 'Unbekannt');

                list.innerHTML += `
                    <div style="padding: 1.25rem; background: rgba(255, 255, 255, 0.02); border-left: 4px solid rgba(59, 130, 246, 0.4); border-radius: 12px; margin-bottom: 1rem; border: 1px solid rgba(255, 255, 255, 0.05); border-left-width: 4px;">
                        <div style="color: #60a5fa; font-weight: 800; margin-bottom: 0.5rem; display: flex; align-items: center; gap: 0.5rem;">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                            LETZTE ÄNDERUNG
                        </div>
                        <div style="color: rgba(255, 255, 255, 0.6); font-size: 0.95rem; font-weight: 500;">
                            ${editDate} von ${editorName}
                        </div>
                    </div>
                `;
            });
        }
    }

    // ==========================================
    // PDF GENERATION
    // ==========================================
    window.generateProtocolPDF = async function (previewOpen = false) {
        try {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();

            const title = currentProtocolType === 'intake' ? 'Eingangsprotokoll' : 'Abnahmeprotokoll';
            const machineTitle = currentProtocol.title;

            // Title
            doc.setFontSize(18);
            doc.setFont(undefined, 'bold');
            doc.text(title, 20, 20);

            // Machine
            doc.setFontSize(12);
            doc.setFont(undefined, 'normal');
            doc.text(`Maschine: ${machineTitle}`, 20, 30);

            // Status
            doc.text(`Status: ${currentProtocol.status === 'completed' ? 'Abgeschlossen' : 'Entwurf'}`, 20, 37);

            let yPos = 50;

            // Predefined checkpoints
            doc.setFontSize(14);
            doc.setFont(undefined, 'bold');
            doc.text('Vordefinierte Prüfpunkte', 20, yPos);
            yPos += 10;

            doc.setFontSize(10);
            doc.setFont(undefined, 'normal');

            if (Array.isArray(currentProtocol.predefined_checkpoints)) {
                // New structured format from template
                currentProtocol.predefined_checkpoints.forEach(group => {
                    if (yPos > 260) {
                        doc.addPage();
                        yPos = 20;
                    }
                    doc.setFont(undefined, 'bold');
                    doc.text(group.group_title || 'Gruppe', 20, yPos);
                    yPos += 7;
                    doc.setFont(undefined, 'normal');

                    group.items.forEach(item => {
                        const result = item.result === true ? 'Ja' : 'Nein';
                        const comment = item.comment ? ` (${item.comment})` : '';
                        doc.text(`${item.label}: ${result}${comment}`, 25, yPos);
                        yPos += 6;
                        if (yPos > 275) {
                            doc.addPage();
                            yPos = 20;
                        }
                    });
                    yPos += 4;
                });
            } else {
                // Legacy object format
                Object.keys(currentProtocol.predefined_checkpoints).forEach(key => {
                    const label = getCheckpointLabel(key, currentProtocolType);
                    const value = currentProtocol.predefined_checkpoints[key];
                    const result = value === true ? 'Ja' : (value === false ? 'Nein' : 'Nicht beantwortet');
                    doc.text(`${label}: ${result}`, 20, yPos);
                    yPos += 6;

                    if (yPos > 270) {
                        doc.addPage();
                        yPos = 20;
                    }
                });
            }

            // Custom checkpoints
            if (customCheckpoints.length > 0) {
                yPos += 5;
                doc.setFontSize(14);
                doc.setFont(undefined, 'bold');
                doc.text('Zusätzliche Prüfpunkte', 20, yPos);
                yPos += 10;

                doc.setFontSize(10);
                doc.setFont(undefined, 'normal');
                customCheckpoints.forEach(cp => {
                    const result = cp.result === true ? 'Ja' : (cp.result === false ? 'Nein' : 'Nicht beantwortet');
                    doc.text(`${cp.description}: ${result}`, 20, yPos);
                    yPos += 6;

                    if (yPos > 270) {
                        doc.addPage();
                        yPos = 20;
                    }
                });
            }

            // Text fields
            yPos += 5;
            if (currentProtocolType === 'intake' && currentProtocol.error_description) {
                doc.setFontSize(14);
                doc.setFont(undefined, 'bold');
                doc.text('Fehlerbeschreibung / Arbeitsauftrag', 20, yPos);
                yPos += 10;
                doc.setFontSize(10);
                doc.setFont(undefined, 'normal');
                const lines = doc.splitTextToSize(currentProtocol.error_description, 170);
                doc.text(lines, 20, yPos);
                yPos += lines.length * 6 + 5;
            } else if (currentProtocolType === 'acceptance') {
                if (currentProtocol.work_performed) {
                    doc.setFontSize(14);
                    doc.setFont(undefined, 'bold');
                    doc.text('Durchgeführte Arbeiten', 20, yPos);
                    yPos += 10;
                    doc.setFontSize(10);
                    doc.setFont(undefined, 'normal');
                    const lines = doc.splitTextToSize(currentProtocol.work_performed, 170);
                    doc.text(lines, 20, yPos);
                    yPos += lines.length * 6 + 5;
                }

                if (currentProtocol.parts_replaced) {
                    if (yPos > 250) {
                        doc.addPage();
                        yPos = 20;
                    }
                    doc.setFontSize(14);
                    doc.setFont(undefined, 'bold');
                    doc.text('Getauschte Teile', 20, yPos);
                    yPos += 10;
                    doc.setFontSize(10);
                    doc.setFont(undefined, 'normal');
                    const lines = doc.splitTextToSize(currentProtocol.parts_replaced, 170);
                    doc.text(lines, 20, yPos);
                    yPos += lines.length * 6 + 5;
                }
            }

            // Completion info
            if (currentProtocol.completed_at) {
                if (yPos > 250) {
                    doc.addPage();
                    yPos = 20;
                }
                yPos += 5;
                doc.setFontSize(12);
                doc.setFont(undefined, 'bold');
                doc.text('Abschlussinformationen', 20, yPos);
                yPos += 10;
                doc.setFontSize(10);
                doc.setFont(undefined, 'normal');
                const completedDate = new Date(currentProtocol.completed_at).toLocaleString('de-DE');
                const completedUser = window.userList?.find(u => u.id === currentProtocol.completed_by);
                doc.text(`Abgeschlossen am: ${completedDate}`, 20, yPos);
                yPos += 6;
                doc.text(`Abgeschlossen von: ${completedUser?.name || 'Unbekannt'}`, 20, yPos);
            }

            // Save or Preview PDF
            const fileName = `${title}_${machineTitle.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;

            if (previewOpen) {
                window.open(doc.output('bloburl'), '_blank');
            } else {
                doc.save(fileName);
                alert('PDF erfolgreich erstellt!');
            }
        } catch (err) {
            console.error('PDF generation error:', err);
            alert('Fehler beim Erstellen des PDFs: ' + err.message);
        }
    };

    window.generateProtocolPDFPreview = async function () {
        await window.generateProtocolPDF(true);
    };

    // ==========================================
    // LIST RENDERING & FILTERING
    // ==========================================
    let allLoadedProtocols = [];
    let protocolFilterType = 'all'; // 'all', 'intake', 'acceptance'
    let protocolSearchTerm = '';
    window.protocolViewMode = 'board';

    window.switchProtocolView = function (view) {
        window.protocolViewMode = view;

        const boardBtn = document.getElementById('btn-protocol-view-board');
        const listBtn = document.getElementById('btn-protocol-view-list');
        const boardView = document.getElementById('protocol-board-view');
        const listView = document.getElementById('protocol-list-view');

        if (view === 'board') {
            if (boardBtn) boardBtn.classList.add('active');
            if (listBtn) listBtn.classList.remove('active');
            if (boardView) boardView.classList.remove('hidden');
            if (listView) listView.classList.add('hidden');
        } else {
            if (boardBtn) boardBtn.classList.remove('active');
            if (listBtn) listBtn.classList.add('active');
            if (boardView) boardView.classList.add('hidden');
            if (listView) listView.classList.remove('hidden');
        }

        applyFilters();
    };

    window.fetchProtocols = async function () {
        const boardContainer = document.getElementById('protocol-list-container');
        const listContainer = document.getElementById('protocol-table-body');
        if (!boardContainer && !listContainer) return;

        try {
            // Fetch both types
            const [intakeRes, acceptanceRes] = await Promise.all([
                window.supabaseClient.from('intake_protocols').select('*, machines(manufacturer, name, serial, year, image_url)').order('created_at', { ascending: false }),
                window.supabaseClient.from('acceptance_protocols').select('*, machines(manufacturer, name, serial, year, image_url)').order('created_at', { ascending: false })
            ]);

            if (intakeRes.error) throw intakeRes.error;
            if (acceptanceRes.error) throw acceptanceRes.error;

            // Combine and sort
            allLoadedProtocols = [
                ...intakeRes.data.map(p => ({ ...p, type: 'intake' })),
                ...acceptanceRes.data.map(p => ({ ...p, type: 'acceptance' }))
            ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

            applyFilters();
        } catch (err) {
            console.error('Error fetching protocols:', err);
            if (boardContainer) boardContainer.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1;"><p style="color: #ef4444;">Fehler beim Laden: ${err.message}</p></div>`;
        }
    };

    window.handleProtocolSearch = function (query) {
        protocolSearchTerm = query.toLowerCase().trim();
        applyFilters();
    };

    window.setProtocolFilter = function (type) {
        protocolFilterType = type;

        // Update UI active state
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.classList.toggle('active', btn.id === `filter-${type}`);
        });

        applyFilters();
    };

    function applyFilters() {
        let filtered = [...allLoadedProtocols];

        // 1. Filter by Type
        if (protocolFilterType !== 'all') {
            filtered = filtered.filter(p => p.type === protocolFilterType);
        }

        // 2. Filter by Search Term
        if (protocolSearchTerm) {
            filtered = filtered.filter(p => {
                const searchString = `${p.title} ${p.type === 'intake' ? 'Eingang' : 'Abnahme'}`.toLowerCase();
                return searchString.includes(protocolSearchTerm);
            });
        }

        renderProtocols(filtered);
    }

    function renderProtocols(protocols) {
        const boardContainer = document.getElementById('protocol-list-container');
        const listBody = document.getElementById('protocol-table-body');

        if (!boardContainer || !listBody) return;

        if (protocols.length === 0) {
            const message = protocolSearchTerm || protocolFilterType !== 'all'
                ? 'Keine Protokolle für die aktuelle Suche/Filterung gefunden.'
                : 'Noch keine Protokolle angelegt.';

            boardContainer.innerHTML = `
                <div class="empty-state" style="grid-column: 1 / -1; text-align: center; padding: 4rem 2rem; background: rgba(255,255,255,0.02); border-radius: 24px; border: 1px dashed rgba(255,255,255,0.1);">
                    <p style="color: rgba(255,255,255,0.4); font-size: 1.1rem;">${message}</p>
                </div>
            `;
            listBody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 2rem; opacity: 0.6;">${message}</td></tr>`;
            return;
        }

        if (window.protocolViewMode === 'board') {
            // Render Board (like machine cards)
            boardContainer.innerHTML = protocols.map(p => {
                const isAcceptance = p.type === 'acceptance';
                const dateHeader = isAcceptance ? 'Abnahmedatum' : 'Eingangsdatum';
                const protocolDate = new Date(p.created_at).toLocaleDateString('de-DE');
                const badgeText = p.status === 'completed' ? 'Abgeschlossen' : 'Entwurf';
                const badgeColor = p.status === 'completed' ? '#10b981' : '#f59e0b';
                const typeLabel = isAcceptance ? 'Abnahmeprotokoll' : 'Eingangsprotokoll';

                return `
                    <div class="card" onclick="${isAcceptance ? 'window.openAcceptanceProtocol' : 'window.openIntakeProtocol'}('${p.machine_id}', '${p.id}')" style="font-family: 'Inter', sans-serif; overflow: hidden; display: flex; flex-direction: column; background: rgba(255,255,255,0.03); backdrop-filter: blur(16px); border: 1px solid rgba(255,255,255,0.1); border-radius: 20px; transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); cursor: pointer; position: relative;">
                        <!-- Status Badge Top Right -->
                        <div style="position: absolute; top: 1rem; right: 1rem; z-index: 10; background: ${badgeColor}; color: #fff; font-size: 0.75rem; font-weight: 900; padding: 4px 12px; border-radius: 20px; text-transform: uppercase; letter-spacing: 1px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);">
                            ${badgeText}
                        </div>
                        
                        <div style="background: linear-gradient(135deg, rgba(255, 255, 255, 0.03), rgba(255, 255, 255, 0.01)); display: flex; align-items: center; justify-content: center; border-bottom: 1px solid rgba(255,255,255,0.1);">
                            ${p.machines && p.machines.image_url ?
                        `<img src="${p.machines.image_url}" alt="${p.title}" style="width: 100%; height: 300px; object-fit: contain; display: block;">` :
                        `<div style="height: 300px; display: flex; align-items: center; justify-content: center; color: rgba(255,255,255,0.2);">
                                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.4;">
                                        <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
                                        <circle cx="9" cy="9" r="2"/>
                                        <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
                                    </svg>
                                </div>`
                    }
                        </div>
                        
                        <div class="card-content" style="padding: 1.75rem; flex: 1; display: flex; flex-direction: column;">
                            <div style="margin-bottom: 1.5rem; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 1.5rem;">
                                <h2 class="card-title" style="margin: 0; font-size: 1.5rem; color: #fff; font-weight: 800; line-height: 1.3;">
                                    ${p.title}
                                </h2>
                            </div>
                            
                            <!-- Middle section like Machine Cards -->
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.25rem; margin-bottom: 1.75rem; background: rgba(0,0,0,0.15); padding: 18px 1.75rem; border-radius: 14px; border: 1px solid rgba(255,255,255,0.06); margin-left: -1.75rem; margin-right: -1.75rem;">
                                <div style="border-right: 1px solid rgba(255,255,255,0.05); padding-right: 12px;">
                                    <div style="font-size: 0.85rem; color: rgba(255,255,255,0.4); margin-bottom: 5px; font-weight: 700; text-transform: uppercase;">Typ</div>
                                    <div style="font-size: 1.05rem; color: #fff; display: flex; align-items: center; font-weight: 700; word-break: break-word;">
                                        ${typeLabel}
                                    </div>
                                </div>
                                <div style="padding-left: 6px;">
                                    <div style="font-size: 0.85rem; color: rgba(255,255,255,0.4); margin-bottom: 5px; font-weight: 700; text-transform: uppercase;">${dateHeader}</div>
                                    <div style="font-size: 1.05rem; color: #fff; display: flex; align-items: center; font-weight: 700;">
                                        ${protocolDate}
                                    </div>
                                </div>
                            </div>
                            
                            <div class="card-actions" style="margin-top: auto;">
                                <button class="btn-primary" style="width: 100%; min-height: 48px; border-radius: 14px; font-weight: 800; font-size: 1.1rem;">Öffnen</button>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        } else {
            // Render List
            listBody.innerHTML = protocols.map(p => {
                const dateStr = new Date(p.created_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
                const timeStr = new Date(p.created_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
                const statusLabel = p.status === 'completed' ? 'Abgeschlossen' : 'Entwurf';
                const statusClass = p.status === 'completed' ? 'completed' : 'in-progress';
                const isAcceptance = p.type === 'acceptance';
                const typeLabel = isAcceptance ? 'Abnahmeprotokoll' : 'Eingangsprotokoll';
                const iconPath = isAcceptance
                    ? '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><path d="M9 15l2 2 4-4"></path>'
                    : '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline>';

                const tr = document.createElement('tr');
                tr.style.cursor = 'pointer';
                tr.onclick = () => isAcceptance ? window.openAcceptanceProtocol(p.machine_id, p.id) : window.openIntakeProtocol(p.machine_id, p.id);

                return `
                    <tr style="cursor: pointer;" onclick="${isAcceptance ? 'window.openAcceptanceProtocol' : 'window.openIntakeProtocol'}('${p.machine_id}', '${p.id}')">
                        <td>
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <div style="display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 8px; background: rgba(255,255,255,0.05); color: #60a5fa;">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        ${iconPath}
                                    </svg>
                                </div>
                                <span style="font-weight: 600; font-size: 0.95rem;">${typeLabel}</span>
                            </div>
                        </td>
                        <td>${p.machines ? p.machines.name : 'Unbekannt'}</td>
                        <td>
                            <span style="font-weight: 600;">${p.title}</span><br>
                            <span style="font-size: 0.8rem; color: rgba(255,255,255,0.4);">${isAcceptance && p.work_performed ? p.work_performed.substring(0, 40) + '...' : ''}</span>
                        </td>
                        <td>
                            <div style="font-weight: 600;">${dateStr}</div>
                            <div style="font-size: 0.8rem; color: rgba(255,255,255,0.4);">${timeStr} Uhr</div>
                        </td>
                        <td>
                            <span class="status-badge ${statusClass}">${statusLabel}</span>
                        </td>
                        <td>
                            <div style="display: flex; gap: 0.5rem;">
                                <button class="btn-icon-soft" title="Öffnen" onclick="event.stopPropagation(); ${isAcceptance ? 'window.openAcceptanceProtocol' : 'window.openIntakeProtocol'}('${p.machine_id}', '${p.id}')">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                        <circle cx="12" cy="12" r="3"></circle>
                                    </svg>
                                </button>
                            </div>
                        </td>
                    </tr>
                `;
            }).join('');
        }
    }

    // Export fetch to global for view switching
    window.fetchFiles = function () {
        // Redirect legacy call if needed, or keep both
        window.fetchProtocols();
    };

    console.log('Protocols module loaded successfully');
    window.openProtocolPDF = async function (machineId, protocolId, type) {
        try {
            currentProtocolType = type;
            await loadProtocol(protocolId, type);
            if (currentProtocol) {
                await window.generateProtocolPDF(true); // true for preview in new tab
            }
        } catch (err) {
            console.error('Error opening protocol PDF from history:', err);
            alert('Fehler beim Öffnen des PDFs');
        }
    };

})();
