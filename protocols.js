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
    let protocolIsDirty = false; // Tracks unsaved changes

    function markProtocolDirty() {
        protocolIsDirty = true;
    }

    // Expose functions early and robustly
    window.openIntakeProtocol = async function (machineId, protocolId = null) {
        console.log('--- Opening Intake Protocol ---');
        console.log('Arguments:', { machineId, protocolId });
        
        // Handle stringified 'null' or 'undefined'
        if (machineId === 'null' || machineId === 'undefined') machineId = null;
        if (protocolId === 'null' || protocolId === 'undefined') protocolId = null;

        currentProtocolType = 'intake';
        try {
            await openProtocolModal(machineId, protocolId, 'intake');
        } catch (err) {
            console.error('Error in window.openIntakeProtocol:', err);
            alert('Fehler beim Öffnen des Protokolls: ' + err.message);
        }
    };

    window.openAcceptanceProtocol = async function (machineId, protocolId = null) {
        console.log('--- Opening Acceptance Protocol ---');
        console.log('Arguments:', { machineId, protocolId });
        
        // Handle stringified 'null' or 'undefined'
        if (machineId === 'null' || machineId === 'undefined') machineId = null;
        if (protocolId === 'null' || protocolId === 'undefined') protocolId = null;

        currentProtocolType = 'acceptance';
        try {
            await openProtocolModal(machineId, protocolId, 'acceptance');
        } catch (err) {
            console.error('Error in window.openAcceptanceProtocol:', err);
            alert('Fehler beim Öffnen des Protokolls: ' + err.message);
        }
    };

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
                        border-radius: 12px;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                    " onmouseover="this.style.transform='rotate(90deg) scale(1.1)'; this.style.background='rgba(255, 100, 100, 0.1)'; this.style.borderColor='rgba(255, 100, 100, 0.3)';" onmouseout="this.style.transform='rotate(0deg) scale(1)'; this.style.background='rgba(255, 255, 255, 0.05)'; this.style.borderColor='var(--glass-border)';">
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
                    <div style="margin-bottom: 1.5rem;">
                        <span class="protocol-section-title">Maschine</span>
                        <div style="position: relative;">
                            <input type="text" id="protocol-machine-title" readonly class="glass-form-input" style="opacity: 0.9; font-weight: 700; padding-right: 80px; color: #10b981 !important; border-color: rgba(16, 185, 129, 0.4) !important; background: rgba(16, 185, 129, 0.05) !important;">
                            <div style="position: absolute; right: 12px; top: 50%; transform: translateY(-50%); font-size: 0.75rem; font-weight: 800; color: #10b981; background: rgba(16, 185, 129, 0.1); padding: 4px 8px; border-radius: 6px; pointer-events: none; border: 1px solid rgba(16, 185, 129, 0.2); text-transform: uppercase;">Fixiert</div>
                        </div>
                    </div>

                    <!-- Machine Customer & Location info (Read-only) -->
                    <div id="protocol-location-info-section" style="margin-bottom: 2.5rem; display: none; padding: 1.25rem; background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 12px;">
                        <div style="display: flex; flex-direction: column; gap: 8px;">
                            <div>
                                <span style="font-size: 0.75rem; color: rgba(255,255,255,0.4); text-transform: uppercase; font-weight: 800;">Betreiber / Kunde</span>
                                <div id="protocol-customer-display" style="color: #fff; font-weight: 700; font-size: 0.95rem; margin-top: 2px;">-</div>
                            </div>
                            <div>
                                <span style="font-size: 0.75rem; color: rgba(255,255,255,0.4); text-transform: uppercase; font-weight: 800;">Standort / Adresse</span>
                                <div id="protocol-location-display" style="color: rgba(255,255,255,0.8); font-size: 0.9rem; margin-top: 2px; line-height: 1.4;">-</div>
                            </div>
                        </div>
                    </div>

                    <!-- Predefined Checkpoints -->
                    <div id="predefined-checkpoints-section" style="margin-bottom: 3rem;">
                        <h3 class="protocol-section-title">🔍 Vordefinierte Prüfpunkte</h3>
                        <div id="predefined-checkpoints-list"></div>
                    </div>

                    <!-- Photos (collapsible, collapsed by default) -->
                    <div id="photos-section" style="margin-bottom: 1rem;">
                        <button type="button" onclick="window.toggleProtocolCollapsible('photos-collapsible-content', 'photos-chevron')"
                            style="width: 100%; display: flex; align-items: center; justify-content: space-between; padding: 1rem 1.25rem; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 14px; cursor: pointer; color: #fff; font-family: 'Inter', sans-serif; transition: background 0.2s;"
                            onmouseover="this.style.background='rgba(255,255,255,0.07)'" onmouseout="this.style.background='rgba(255,255,255,0.04)'">
                            <span style="display: flex; align-items: center; gap: 10px; font-size: 1rem; font-weight: 700;">
                                <span>📸</span> Fotos
                            </span>
                            <svg id="photos-chevron" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="transition: transform 0.3s; transform: rotate(-90deg);">
                                <polyline points="6 9 12 15 18 9"></polyline>
                            </svg>
                        </button>
                        <div id="photos-collapsible-content" style="display: none; padding: 1.25rem 0.25rem 0.5rem 0.25rem;">
                            <div id="protocol-photos-grid" class="protocol-photo-grid"></div>
                            <input type="file" id="protocol-photo-input" accept="image/*" multiple style="display: none;">
                            <button onclick="document.getElementById('protocol-photo-input').click()" class="report-type-btn compact" style="width: auto; background: rgba(16, 185, 129, 0.1); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.2); margin-top: 0.75rem;">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                                    <circle cx="8.5" cy="8.5" r="1.5"></circle>
                                    <polyline points="21 15 16 10 5 21"></polyline>
                                </svg>
                                <span>Fotos hochladen</span>
                            </button>
                        </div>
                    </div>

                    <!-- Free Text Fields / Kommentare (collapsible, collapsed by default) -->
                    <div id="text-fields-section" style="margin-bottom: 1rem;">
                        <button type="button" onclick="window.toggleProtocolCollapsible('comments-collapsible-content', 'comments-chevron')"
                            style="width: 100%; display: flex; align-items: center; justify-content: space-between; padding: 1rem 1.25rem; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 14px; cursor: pointer; color: #fff; font-family: 'Inter', sans-serif; transition: background 0.2s;"
                            onmouseover="this.style.background='rgba(255,255,255,0.07)'" onmouseout="this.style.background='rgba(255,255,255,0.04)'">
                            <span style="display: flex; align-items: center; gap: 10px; font-size: 1rem; font-weight: 700;">
                                <span>💬</span> Kommentare
                            </span>
                            <svg id="comments-chevron" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="transition: transform 0.3s; transform: rotate(-90deg);">
                                <polyline points="6 9 12 15 18 9"></polyline>
                            </svg>
                        </button>
                        <div id="comments-collapsible-content" style="display: none; padding: 1.25rem 0.25rem 0.5rem 0.25rem;">
                            <div id="protocol-text-fields"></div>
                        </div>
                    </div>

                    <!-- Edit History -->
                    <div id="edit-history-section" style="display: none; margin-bottom: 2rem; margin-top: 1rem; padding: 1.5rem; background: rgba(255, 255, 255, 0.02); border-radius: 20px; border: 1px solid var(--glass-border);">
                        <h3 class="protocol-section-title">🕒 Bearbeitungshistorie</h3>
                        <div id="edit-history-list"></div>
                    </div>

                    <!-- Action Buttons at the very bottom of scrollable content -->
                    <div class="protocol-modal-actions" style="margin-top: 4rem; border-top: 1px solid rgba(255,255,255,0.05);">
                        <button onclick="window.closeProtocolModal()" class="btn-modal-base btn-modal-cancel">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                            Abbrechen
                        </button>
                        <button onclick="window.previewProtocolPDF()" class="btn-modal-base" style="background: rgba(139, 92, 246, 0.15); border: 1px solid rgba(139, 92, 246, 0.35); color: #a78bfa; gap: 8px;" onmouseover="this.style.background='rgba(139,92,246,0.28)'" onmouseout="this.style.background='rgba(139,92,246,0.15)'">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                            Vorschau
                        </button>
                        <button onclick="window.saveProtocol()" class="btn-modal-base btn-modal-save">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
                            Speichern
                        </button>
                        <button onclick="window.completeProtocol()" id="complete-protocol-btn" class="btn-modal-base btn-modal-complete">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                            Abschließen
                        </button>
                    </div>

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
    // Re-exposure not strictly needed but kept for structure
    // window.openIntakeProtocol...

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

        // Populate Customer & Location preview info
        const locationInfoSection = document.getElementById('protocol-location-info-section');
        const customerDisplay = document.getElementById('protocol-customer-display');
        const locationDisplay = document.getElementById('protocol-location-display');

        if (locationInfoSection && machine) {
            locationInfoSection.style.display = 'block';
            if (machine.in_workshop) {
                if (customerDisplay) customerDisplay.textContent = 'Intern (Eigene Werkstatt)';
                if (locationDisplay) {
                    const cached = localStorage.getItem('meetra_company_hq');
                    let hqAddr = '';
                    if (cached) {
                        try {
                            const hq = JSON.parse(cached);
                            hqAddr = [hq.name || 'Meetra GmbH', hq.street || '', [hq.zip, hq.city].filter(Boolean).join(' '), hq.country].filter(Boolean).join(', ');
                        } catch(e){}
                    }
                    locationDisplay.textContent = hqAddr || 'Meetra GmbH, Am Alten Bahnhof 6, 38122 Braunschweig, Deutschland';
                }
            } else {
                if (customerDisplay) {
                    const codeStr = machine.customer_number ? ` (Kundennummer: ${machine.customer_number})` : '';
                    customerDisplay.textContent = (machine.company || 'Unbekannt') + codeStr;
                }
                if (locationDisplay) {
                    locationDisplay.textContent = machine.location || machine.operator_address || 'Keine Adresse hinterlegt';
                }
            }
        }

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

        // Hide "Abschließen" button for completed protocols
        if (currentProtocol.status === 'completed') {
            const completeBtn = document.getElementById('complete-protocol-btn');
            if (completeBtn) completeBtn.style.display = 'none';
        }

        // Show modal
        overlay.style.display = 'flex';

        // Reset dirty flag when opening
        protocolIsDirty = false;
    }

    window.closeProtocolModal = function (force = false) {
        if (!force && protocolIsDirty) {
            // Show custom confirmation dialog
            const confirmOverlay = document.createElement('div');
            confirmOverlay.id = 'protocol-confirm-close-overlay';
            confirmOverlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.75);z-index:99999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(6px);';
            confirmOverlay.innerHTML = `
                <div style="background:linear-gradient(135deg,rgba(30,41,59,0.98),rgba(15,23,42,0.99));border:1px solid rgba(255,255,255,0.12);border-radius:20px;padding:2rem 2.5rem;max-width:420px;width:90%;box-shadow:0 30px 80px rgba(0,0,0,0.6);font-family:'Inter',sans-serif;text-align:center;">
                    <div style="font-size:2.5rem;margin-bottom:1rem;">⚠️</div>
                    <h3 style="color:#fff;font-size:1.2rem;font-weight:800;margin:0 0 0.75rem 0;">Ungespeicherte Änderungen</h3>
                    <p style="color:rgba(255,255,255,0.6);font-size:0.95rem;margin:0 0 2rem 0;line-height:1.5;">Sie haben Änderungen vorgenommen, die noch nicht gespeichert wurden. Wenn Sie jetzt schließen, gehen diese verloren.</p>
                    <div style="display:flex;gap:1rem;justify-content:center;">
                        <button onclick="document.getElementById('protocol-confirm-close-overlay').remove()" style="padding:0.75rem 1.5rem;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);border-radius:12px;color:#fff;font-weight:700;cursor:pointer;font-family:'Inter',sans-serif;font-size:0.95rem;transition:background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.15)'" onmouseout="this.style.background='rgba(255,255,255,0.08)'">
                            Zurück
                        </button>
                        <button onclick="document.getElementById('protocol-confirm-close-overlay').remove(); window.closeProtocolModal(true);" style="padding:0.75rem 1.5rem;background:rgba(239,68,68,0.2);border:1px solid rgba(239,68,68,0.4);border-radius:12px;color:#f87171;font-weight:700;cursor:pointer;font-family:'Inter',sans-serif;font-size:0.95rem;transition:background 0.2s;" onmouseover="this.style.background='rgba(239,68,68,0.35)'" onmouseout="this.style.background='rgba(239,68,68,0.2)'">
                            Trotzdem schließen
                        </button>
                    </div>
                </div>
            `;
            document.body.appendChild(confirmOverlay);
            return;
        }

        const overlay = document.getElementById('protocol-modal-overlay');
        if (overlay) {
            overlay.style.display = 'none';
            overlay.remove();
        }
        currentProtocol = null;
        currentProtocolType = null;
        customCheckpoints = [];
        protocolPhotos = [];
        protocolIsDirty = false;
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
                    } else if (labelLower.includes('modell') || labelLower.includes('name')) {
                        initialResult = machine.name || '';
                    }
                }

                // For table types, initialize with template structure but empty cells
                let tableData = null;
                if (item.type === 'table') {
                    tableData = {
                        columns: item.columns || [],
                        rows: item.rows || [],
                        values: (item.rows || []).map(row => row.map(() => ''))
                    };
                }

                return {
                    label: item.label,
                    type: item.type,
                    result: initialResult || false, 
                    comment: initialResult || '', // Use machine data as comment/value for text fields
                    placeholder: item.placeholder || item.placeholder_label, 
                    id: item.id || Date.now() + Math.random(),
                    table_data: tableData
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
        if (!container) return;
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

                const cleanGroupTitle = group.group_title ? group.group_title.replace(/^\\d+\\.\\s*/, '') : 'Kategorie';
                header.innerHTML = `
                    <h4>${gIdx + 1}. ${cleanGroupTitle}</h4>
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
                row.style.flexDirection = item.type === 'table' ? 'column' : 'row';
                row.style.alignItems = item.type === 'table' ? 'stretch' : 'center';

                // 1. Checkbox (Only for checkbox type)
                if (item.type === 'checkbox') {
                    const checkboxWrapper = document.createElement('div');
                    checkboxWrapper.className = 'protocol-single-checkbox-wrapper';
                    checkboxWrapper.innerHTML = `
                        <input type="checkbox" class="protocol-single-checkbox" 
                               ${item.result === true ? 'checked' : ''} 
                               onchange="window.updateStructuredCheckpoint(${gIdx}, ${iIdx}, 'result', this.checked)">
                    `;
                    row.appendChild(checkboxWrapper);
                }

                // 2. Label (Container for all types)
                const labelContainer = document.createElement('div');
                labelContainer.style.flex = item.type === 'table' ? 'none' : '1';
                labelContainer.style.marginBottom = item.type === 'table' ? '10px' : '0';
                
                const label = document.createElement('span');
                label.className = 'protocol-item-label';
                label.textContent = item.label || '';
                label.style.fontWeight = '700';
                labelContainer.appendChild(label);
                row.appendChild(labelContainer);

                // 3. Main Input (Text or Table)
                if (item.type === 'table') {
                    const tableDiv = document.createElement('div');
                    tableDiv.className = 'protocol-table-container';
                    tableDiv.style.marginTop = '5px';
                    
                    const data = item.table_data || { columns: [], rows: [] };
                    
                    let tableHtml = `
                        <div style="overflow-x: auto; background: rgba(255,255,255,0.02); border-radius: 12px; border: 1px solid rgba(255,255,255,0.05); padding: 2px;">
                            <table style="width: 100%; border-collapse: collapse; font-size: 0.9rem;">
                                <thead>
                                    <tr>
                                        ${data.columns.map(col => `
                                            <th style="padding: 10px; border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.03); color: rgba(255,255,255,0.6); text-align: left; font-size: 0.75rem; text-transform: uppercase;">${col}</th>
                                        `).join('')}
                                    </tr>
                                </thead>
                                <tbody>
                                    ${data.rows.map((rowLayout, rIdx) => `
                                        <tr>
                                            ${rowLayout.map((cellLayout, cIdx) => {
                                                const hasValues = !!data.values;
                                                const cellValue = hasValues ? (data.values[rIdx][cIdx] || '') : (cellLayout !== ' ' ? cellLayout : '');
                                                
                                                if (!hasValues) {
                                                    // Legacy rendering
                                                    return `
                                                        <td style="padding: 0; border: 1px solid rgba(255,255,255,0.08);">
                                                            <input type="text" value="${cellValue}" 
                                                                   style="width: 100%; background: transparent; border: none; color: #fff; padding: 10px; outline: none; font-size: 0.9rem;"
                                                                   onblur="window.updateProtocolTableCell(${gIdx}, ${iIdx}, ${rIdx}, ${cIdx}, this.value)">
                                                        </td>
                                                    `;
                                                }

                                                const matchPlaceholder = cellLayout.match(/^\s*\[(.*?)\]\s*$/);
                                                if (matchPlaceholder) {
                                                    const placeholderText = matchPlaceholder[1];
                                                    return `
                                                        <td style="padding: 0; border: 1px solid rgba(255,255,255,0.08);">
                                                            <input type="text" value="${cellValue}" placeholder="${placeholderText}"
                                                                   style="width: 100%; background: transparent; border: none; color: #fff; padding: 10px; outline: none; font-size: 0.9rem;"
                                                                   onblur="window.updateProtocolTableCell(${gIdx}, ${iIdx}, ${rIdx}, ${cIdx}, this.value)">
                                                        </td>
                                                    `;
                                                } else {
                                                    return `
                                                        <td style="padding: 10px; border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.02); color: rgba(255,255,255,0.8); font-size: 0.9rem;">
                                                            ${cellLayout}
                                                        </td>
                                                    `;
                                                }
                                            }).join('')}
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    `;
                    tableDiv.innerHTML = tableHtml;
                    row.appendChild(tableDiv);
                } else {
                    // Integrated Text Input for checkbox and text types
                    const input = document.createElement('input');
                    input.type = 'text';
                    input.className = 'protocol-integrated-input';
                    input.style.flex = '2';
                    input.value = item.comment || '';
                    input.placeholder = item.placeholder || item.placeholder_label || 'Bemerkung...';
                    input.onblur = (e) => window.updateStructuredCheckpoint(gIdx, iIdx, 'comment', e.target.value);
                    row.appendChild(input);
                }

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

    // Toggle collapsible sections (Fotos / Kommentare)
    window.toggleProtocolCollapsible = function (contentId, chevronId) {
        const content = document.getElementById(contentId);
        const chevron = document.getElementById(chevronId);
        if (!content) return;

        const isOpen = content.style.display !== 'none';
        content.style.display = isOpen ? 'none' : 'block';
        if (chevron) {
            chevron.style.transform = isOpen ? 'rotate(-90deg)' : 'rotate(0deg)';
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
            markProtocolDirty();
        }
    };

    window.updatePredefinedCheckpoint = function (key, value) {
        currentProtocol.predefined_checkpoints[key] = value;
        markProtocolDirty();
    };

    window.updateProtocolTableCell = function(gIdx, iIdx, rIdx, cIdx, val) {
        if (currentProtocol.predefined_checkpoints[gIdx] && 
            currentProtocol.predefined_checkpoints[gIdx].items[iIdx] &&
            currentProtocol.predefined_checkpoints[gIdx].items[iIdx].table_data) {
            const data = currentProtocol.predefined_checkpoints[gIdx].items[iIdx].table_data;
            if (data.values) {
                data.values[rIdx][cIdx] = val;
            } else {
                data.rows[rIdx][cIdx] = val;
            }
            markProtocolDirty();
        }
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

        markProtocolDirty();
        renderCustomCheckpoints();
        window.cancelNewCheckpoint();
    };

    function renderCustomCheckpoints() {
        const container = document.getElementById('custom-checkpoints-list');
        if (!container) return;
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
        if (!container) return;
        container.innerHTML = '';

        if (hideAll) return;

        container.innerHTML = `
            <div class="form-group" style="margin-bottom: 2rem;">
                <label style="display: block; margin-bottom: 0.75rem; color: rgba(255, 255, 255, 0.6); font-weight: 700; font-size: 0.95rem;">💬 KOMMENTARE</label>
                <textarea id="protocol-comments" rows="6" class="glass-form-input" placeholder="Allgemeine Kommentare oder Anmerkungen eingeben...">${currentProtocol.comments || ''}</textarea>
            </div>
        `;
    }

    // ==========================================
    // PHOTO FUNCTIONS
    // ==========================================
    async function handlePhotoUpload(event) {
        const files = event.target.files;
        if (!files || files.length === 0) return;

        const uploadBtn = event.target.nextElementSibling;
        const originalText = uploadBtn.textContent;
        uploadBtn.textContent = 'Wird hochgeladen...';
        uploadBtn.disabled = true;

        try {
            for (let file of files) {
                const cleanName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
                const fileName = `protocols/${Date.now()}_${cleanName}`;

                const { data, error } = await window.supabaseClient
                    .storage
                    .from('machine-images')
                    .upload(fileName, file);

                if (error) throw error;

                const { data: urlData } = window.supabaseClient
                    .storage
                    .from('machine-images')
                    .getPublicUrl(fileName);

                protocolPhotos.push({
                    id: Date.now() + Math.random(), // Temporary ID
                    file_name: fileName,
                    file_url: urlData.publicUrl,
                    file_size: file.size
                });
            }

            renderPhotos();
            markProtocolDirty();
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
        if (!container) return;
        container.innerHTML = '';

        // Prepare an array of string URLs for the lightbox
        const imageUrls = protocolPhotos.map(p => p.file_url);

        protocolPhotos.forEach((photo, index) => {
            const photoCard = document.createElement('div');
            photoCard.className = 'protocol-photo-card';

            const img = document.createElement('img');
            img.src = photo.file_url;
            img.loading = 'lazy';
            img.className = 'clickable-image';
            img.style.cursor = 'pointer';
            img.onclick = () => window.openPhotosLightbox(imageUrls, index);

            const removeBtn = document.createElement('button');
            removeBtn.className = 'protocol-photo-remove';
            removeBtn.onclick = () => window.deleteProtocolPhoto(index);
            removeBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" class="stroke-current" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';

            photoCard.appendChild(img);
            photoCard.appendChild(removeBtn);

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

            // Mark as clean after successful save
            protocolIsDirty = false;

            // Refresh protocols list if view is active
            if (typeof window.fetchProtocols === 'function') {
                window.fetchProtocols();
            }
            if (typeof window.fetchTasks === 'function') {
                window.fetchTasks();
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
        const completeBtn = document.getElementById('complete-protocol-btn');
        if (completeBtn) completeBtn.style.display = 'none';
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
        if (!section || !list) return;

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
            // Limit to the 5 most recent entries
            [...currentProtocol.edit_history].reverse().slice(0, 5).forEach(edit => {
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
    async function getTemplateBackground() {
        if (window.VORLAGE_BASE64) {
            return window.VORLAGE_BASE64;
        }
        try {
            const res = await fetch('vorlage_bg.jpg');
            if (!res.ok) throw new Error('Vorlage nicht gefunden');
            const blob = await res.blob();
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        } catch (err) {
            console.warn('Konnte Hintergrundvorlage nicht laden:', err);
            return null;
        }
    }

    async function getBase64ImageFromUrl(imageUrl) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'Anonymous';
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                resolve({
                    dataUrl: canvas.toDataURL('image/jpeg', 0.8),
                    width: img.width,
                    height: img.height
                });
            };
            img.onerror = (e) => {
                console.warn('Fehler beim Laden des Bildes für PDF:', e);
                resolve(null);
            };
            img.src = imageUrl;
        });
    }

    window.generateProtocolPDF = async function (previewOpen = false) {
        try {
            await window.loadPDFGenerators();
            const { jsPDF } = window.jspdf;

            // Show loading state
            const loadingOverlay = document.createElement('div');
            loadingOverlay.innerHTML = '<div style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.8);z-index:9999;display:flex;align-items:center;justify-content:center;color:white;font-size:1.5rem;font-weight:bold;font-family:\'Inter\',sans-serif;">PDF wird generiert...</div>';
            document.body.appendChild(loadingOverlay);

            const doc = new jsPDF('p', 'mm', 'a4');
            const bgImage = await getTemplateBackground();

            // Helper to add background
            const addBackground = () => {
                if (bgImage) {
                    // Slight zoom to push borders out: left: -5, top: -5, width: 220, height: 307
                    doc.addImage(bgImage, 'JPEG', -5, -5, 220, 307, undefined, 'FAST');
                }
            };

            // Overlay doc.addPage to automatically add background
            const originalAddPage = doc.addPage.bind(doc);
            doc.addPage = function () {
                originalAddPage();
                addBackground();
                return doc;
            };

            addBackground();

            const title = currentProtocolType === 'intake' ? 'Eingangsprotokoll' : 'Abnahmeprotokoll';
            const machineTitle = currentProtocol.title || 'Ohne Titel';

            // Header area below template letterhead (start around Y = 36)
            doc.setFontSize(22);
            doc.setFont(undefined, 'bold');
            doc.setTextColor(30, 41, 59);
            doc.text(title, 20, 36);

            doc.setFontSize(12);
            doc.setFont(undefined, 'normal');
            doc.setTextColor(71, 85, 105);
            const dateStr = new Date(currentProtocol.created_at || Date.now()).toLocaleDateString('de-DE');
            doc.text(`Datum: ${dateStr}`, 145, 36);

            doc.setFontSize(14);
            doc.setFont(undefined, 'bold');
            doc.setTextColor(15, 23, 42); // Dokument-Schwarz/Blau
            doc.text(`Maschine: `, 20, 46);

            const prefixWidth = doc.getTextWidth(`Maschine: `);
            doc.setTextColor(34, 197, 94); // Primär-Grün
            doc.text(`${machineTitle}`, 20 + prefixWidth, 46);

            doc.setFont(undefined, 'normal');
            doc.setTextColor(15, 23, 42); // Reset auf dunkles Blau/Grau
            doc.text(`Status: ${currentProtocol.status === 'completed' ? 'Abgeschlossen' : 'Entwurf'}`, 20, 54);

            // Let's get the machine details
            const machine = (window.machineList || []).find(m => m.id === currentProtocol.machine_id);
            
            let startY = 64;

            if (machine) {
                doc.setFontSize(11);
                if (machine.in_workshop) {
                    doc.setFont(undefined, 'bold');
                    doc.text('Standort:', 20, 62);
                    doc.setFont(undefined, 'normal');
                    doc.text('Eigene Werkstatt (Meetra HQ)', 45, 62);
                    startY = 72;
                } else {
                    doc.setFont(undefined, 'bold');
                    doc.text('Kunde:', 20, 62);
                    doc.setFont(undefined, 'normal');
                    
                    // Format customer name nicely
                    const customerName = machine.company || '-';
                    const codeStr = machine.customer_number ? ` (Kundennummer: ${machine.customer_number})` : '';
                    doc.text(customerName + codeStr, 40, 62);

                    doc.setFont(undefined, 'bold');
                    doc.text('Standort:', 20, 70);
                    doc.setFont(undefined, 'normal');
                    const locLines = doc.splitTextToSize(machine.location || '-', 145);
                    doc.text(locLines, 45, 70);
                    
                    startY = 70 + (locLines.length * 5) + 8;
                }
            }

            doc.setFontSize(16);
            doc.setFont(undefined, 'bold');
            doc.setTextColor(15, 23, 42);
            doc.text('Prüfpunkte', 20, startY);
            startY += 6;

            const tableData = [];

            if (Array.isArray(currentProtocol.predefined_checkpoints)) {
                currentProtocol.predefined_checkpoints.forEach((group, gIdx) => {
                    const cleanGroupTitle = group.group_title ? group.group_title.replace(/^\\d+\\.\\s*/, '') : 'Kategorie';
                    tableData.push([{ content: `${gIdx + 1}. ${cleanGroupTitle}`, colSpan: 3, styles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' } }]);
                    group.items.forEach(item => {
                        const result = item.result === true ? 'Ja' : (item.result === false ? 'Nein' : '-');
                        tableData.push([item.label || '', result, item.comment || '']);
                    });
                });
            } else if (currentProtocol.predefined_checkpoints) {
                Object.keys(currentProtocol.predefined_checkpoints).forEach(key => {
                    const label = getCheckpointLabel(key, currentProtocolType);
                    const value = currentProtocol.predefined_checkpoints[key];
                    const result = value === true ? 'Ja' : (value === false ? 'Nein' : '-');
                    tableData.push([label, result, '']);
                });
            }

            if (customCheckpoints && customCheckpoints.length > 0) {
                tableData.push([{ content: 'Zusätzliche Prüfpunkte', colSpan: 3, styles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' } }]);
                customCheckpoints.forEach(cp => {
                    const result = cp.result === true ? 'Ja' : (cp.result === false ? 'Nein' : '-');
                    tableData.push([cp.description, result, '']);
                });
            }

            doc.autoTable({
                startY: startY,
                head: [[
                    { content: 'Prüfpunkt', styles: { halign: 'left' } },
                    { content: 'Ergebnis', styles: { halign: 'center' } },
                    { content: 'Bemerkung', styles: { halign: 'center' } }
                ]],
                body: tableData,
                theme: 'grid',
                headStyles: { fillColor: [203, 213, 225], textColor: [15, 23, 42], lineWidth: 0.1, lineColor: [148, 163, 184] },
                styles: { fontSize: 10, cellPadding: 4, lineWidth: 0.1, lineColor: [148, 163, 184] },
                columnStyles: {
                    0: { cellWidth: 70 },
                    1: { cellWidth: 25, halign: 'center' },
                    2: { cellWidth: 'auto', halign: 'left' }
                },
                margin: { top: 36, bottom: 20, left: 20, right: 20 }
            });

            startY = doc.lastAutoTable.finalY + 15;

            // Text fields
            const addTextField = (label, text) => {
                if (!text) return;
                if (startY > 255) { doc.addPage(); startY = 36; }
                doc.setFontSize(14);
                doc.setFont(undefined, 'bold');
                doc.setTextColor(15, 23, 42);
                doc.text(label, 20, startY);
                startY += 8;
                doc.setFontSize(10);
                doc.setFont(undefined, 'normal');
                doc.setTextColor(51, 65, 85);
                const lines = doc.splitTextToSize(text, 170);
                doc.text(lines, 20, startY);
                startY += lines.length * 5 + 10;
            };

            if (currentProtocolType === 'intake') {
                addTextField('Fehlerbeschreibung / Arbeitsauftrag', currentProtocol.error_description);
            } else {
                addTextField('Durchgeführte Arbeiten', currentProtocol.work_performed);
                addTextField('Getauschte Teile', currentProtocol.parts_replaced);
                addTextField('Einstellungen / Kalibrierungen', currentProtocol.settings_calibrations);
                addTextField('Restmängel', currentProtocol.remaining_defects);
            }

            if (currentProtocol.completed_at) {
                if (startY > 255) { doc.addPage(); startY = 36; }
                doc.setFontSize(12);
                doc.setFont(undefined, 'bold');
                doc.setTextColor(220, 38, 38); // Rot
                doc.text('Abschlussinformationen', 105, startY, { align: 'center' });
                startY += 8;
                doc.setFontSize(10);
                doc.setFont(undefined, 'normal');
                doc.setTextColor(220, 38, 38); // Rot für alle Textzeilen
                const completedDate = new Date(currentProtocol.completed_at).toLocaleString('de-DE');
                const completedUser = window.userList?.find(u => u.id === currentProtocol.completed_by);
                doc.text(`Abgeschlossen am: ${completedDate}`, 105, startY, { align: 'center' });
                startY += 6;
                doc.text(`Abgeschlossen von: ${completedUser?.name || 'Unbekannt'}`, 105, startY, { align: 'center' });
            }

            // Photos
            if (protocolPhotos && protocolPhotos.length > 0) {
                doc.addPage();
                let photoY = 36;
                doc.setFontSize(16);
                doc.setFont(undefined, 'bold');
                doc.setTextColor(15, 23, 42);
                doc.text('Fotodokumentation', 20, photoY);
                photoY += 15;

                const pageWidth = 210;
                const margin = 20;
                const photoWidth = (pageWidth - margin * 2 - 10) / 2;
                const maxPhotoHeight = 100; // Allow dynamic height up to 100mm per row

                let col = 0;
                let rowMaxHeight = 0;

                for (let i = 0; i < protocolPhotos.length; i++) {
                    const photo = protocolPhotos[i];

                    if (photoY + maxPhotoHeight > 277) {
                        doc.addPage();
                        photoY = 36;
                        col = 0;
                        rowMaxHeight = 0;
                    }

                    const imgResult = await getBase64ImageFromUrl(photo.file_url);
                    if (imgResult && imgResult.dataUrl) {
                        const { dataUrl, width, height } = imgResult;
                        const imgRatio = height / width;

                        let finalRenderWidth = photoWidth;
                        let finalRenderHeight = photoWidth * imgRatio;

                        if (finalRenderHeight > maxPhotoHeight) {
                            finalRenderHeight = maxPhotoHeight;
                            finalRenderWidth = finalRenderHeight / imgRatio;
                        }

                        if (finalRenderHeight > rowMaxHeight) {
                            rowMaxHeight = finalRenderHeight;
                        }

                        const finalX = margin + (col * (photoWidth + 10)) + ((photoWidth - finalRenderWidth) / 2);

                        try {
                            doc.addImage(dataUrl, 'JPEG', finalX, photoY, finalRenderWidth, finalRenderHeight, undefined, 'FAST');
                        } catch (e) { console.warn('Konnte Foto nicht zeichnen:', e); }
                    }

                    col++;
                    if (col > 1) {
                        col = 0;
                        photoY += rowMaxHeight + 10;
                        rowMaxHeight = 0;
                    }
                }
            }

            const cleanFileName = (title + '_' + machineTitle).replace(/[^a-zA-Z0-9_-]/g, '_');
            const fileName = `${cleanFileName}_${new Date().toISOString().split('T')[0]}.pdf`;

            document.body.removeChild(loadingOverlay);

            if (previewOpen) {
                window.open(doc.output('bloburl'), '_blank');
            } else {
                doc.save(fileName);
                alert('PDF erfolgreich erstellt!');
            }
        } catch (err) {
            console.error('PDF generation error:', err);
            const overlay = document.querySelector('div[style*="PDF wird generiert"]');
            if (overlay) overlay.remove();
            alert('Fehler beim Erstellen des PDFs: ' + err.message);
        }
    };

    window.generateProtocolPDFPreview = async function () {
        await window.generateProtocolPDF(true);
    };

    // Show PDF in an in-page overlay with iframe + print/download buttons
    window.previewProtocolPDF = async function () {
        try {
            await window.loadPDFGenerators();
            const { jsPDF } = window.jspdf;

            // Loading indicator
            const loadingEl = document.createElement('div');
            loadingEl.id = 'pdf-preview-loading';
            loadingEl.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.88);z-index:100000;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;font-family:\'Inter\',sans-serif;backdrop-filter:blur(8px);';
            loadingEl.innerHTML = `
                <div style="width:48px;height:48px;border:4px solid rgba(139,92,246,0.2);border-top:4px solid #a78bfa;border-radius:50%;animation:spin 0.9s linear infinite;margin-bottom:1.25rem;"></div>
                <div style="font-size:1.1rem;font-weight:700;color:#a78bfa;">PDF wird vorbereitet...</div>
                <div style="font-size:0.85rem;color:rgba(255,255,255,0.45);margin-top:0.4rem;">Bitte warten</div>
            `;
            document.body.appendChild(loadingEl);

            // Generate PDF as blob URL
            await window.loadPDFGenerators();
            const docPDF = new jsPDF('p', 'mm', 'a4');
            const bgImage = await getTemplateBackground();
            const addBg = () => { if (bgImage) docPDF.addImage(bgImage, 'JPEG', -5, -5, 220, 307, undefined, 'FAST'); };
            const origAddPage = docPDF.addPage.bind(docPDF);
            docPDF.addPage = function() { origAddPage(); addBg(); return docPDF; };
            addBg();

            const title = currentProtocolType === 'intake' ? 'Eingangsprotokoll' : 'Abnahmeprotokoll';
            const machineTitle = currentProtocol.title || 'Ohne Titel';
            docPDF.setFontSize(22); docPDF.setFont(undefined,'bold'); docPDF.setTextColor(30,41,59);
            docPDF.text(title, 20, 36);
            docPDF.setFontSize(12); docPDF.setFont(undefined,'normal'); docPDF.setTextColor(71,85,105);
            const dateStr = new Date(currentProtocol.created_at || Date.now()).toLocaleDateString('de-DE');
            docPDF.text(`Datum: ${dateStr}`, 145, 36);
            docPDF.setFontSize(14); docPDF.setFont(undefined,'bold'); docPDF.setTextColor(15,23,42);
            docPDF.text('Maschine: ', 20, 46);
            const pW = docPDF.getTextWidth('Maschine: ');
            docPDF.setTextColor(34,197,94);
            docPDF.text(`${machineTitle}`, 20+pW, 46);
            docPDF.setFont(undefined,'normal'); docPDF.setTextColor(15,23,42);
            docPDF.text(`Status: ${currentProtocol.status === 'completed' ? 'Abgeschlossen' : 'Entwurf'}`, 20, 54);

            const machine = (window.machineList||[]).find(m=>m.id===currentProtocol.machine_id);
            let startY = 64;
            if (machine) {
                docPDF.setFontSize(11);
                if (machine.in_workshop) {
                    docPDF.setFont(undefined,'bold'); docPDF.text('Standort:', 20, 62);
                    docPDF.setFont(undefined,'normal'); docPDF.text('Eigene Werkstatt (Meetra HQ)', 45, 62);
                    startY = 72;
                } else {
                    docPDF.setFont(undefined,'bold'); docPDF.text('Kunde:', 20, 62);
                    docPDF.setFont(undefined,'normal');
                    const cName = machine.company||'-';
                    const cCode = machine.customer_number ? ` (Kundennummer: ${machine.customer_number})` : '';
                    docPDF.text(cName+cCode, 40, 62);
                    docPDF.setFont(undefined,'bold'); docPDF.text('Standort:', 20, 70);
                    docPDF.setFont(undefined,'normal');
                    const locLines = docPDF.splitTextToSize(machine.location||'-', 145);
                    docPDF.text(locLines, 45, 70);
                    startY = 70+(locLines.length*5)+8;
                }
            }

            docPDF.setFontSize(16); docPDF.setFont(undefined,'bold'); docPDF.setTextColor(15,23,42);
            docPDF.text('Prüfpunkte', 20, startY); startY += 6;

            const tableData = [];
            if (Array.isArray(currentProtocol.predefined_checkpoints)) {
                currentProtocol.predefined_checkpoints.forEach((group,gIdx) => {
                    const cleanTitle = group.group_title ? group.group_title.replace(/^\\d+\\.\\s*/,'') : 'Kategorie';
                    tableData.push([{content:`${gIdx+1}. ${cleanTitle}`,colSpan:3,styles:{fillColor:[241,245,249],textColor:[15,23,42],fontStyle:'bold'}}]);
                    group.items.forEach(item => {
                        const r = item.result===true?'Ja':(item.result===false?'Nein':'-');
                        tableData.push([item.label||'',r,item.comment||'']);
                    });
                });
            }
            docPDF.autoTable({
                startY, head:[[{content:'Prüfpunkt',styles:{halign:'left'}},{content:'Ergebnis',styles:{halign:'center'}},{content:'Bemerkung',styles:{halign:'center'}}]],
                body:tableData, theme:'grid',
                headStyles:{fillColor:[203,213,225],textColor:[15,23,42],lineWidth:0.1,lineColor:[148,163,184]},
                styles:{fontSize:10,cellPadding:4,lineWidth:0.1,lineColor:[148,163,184]},
                columnStyles:{0:{cellWidth:70},1:{cellWidth:25,halign:'center'},2:{cellWidth:'auto',halign:'left'}},
                margin:{top:36,bottom:20,left:20,right:20}
            });

            const cleanFileName = (title+'_'+machineTitle).replace(/[^a-zA-Z0-9_-]/g,'_');
            const fileName = `${cleanFileName}_${new Date().toISOString().split('T')[0]}.pdf`;
            const blobUrl = docPDF.output('bloburl');

            // Remove loading
            document.getElementById('pdf-preview-loading')?.remove();

            // Build preview overlay
            const previewOverlay = document.createElement('div');
            previewOverlay.id = 'pdf-preview-overlay';
            previewOverlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(5,10,20,0.97);z-index:100001;display:flex;flex-direction:column;font-family:\'Inter\',sans-serif;';
            previewOverlay.innerHTML = `
                <div style="display:flex;align-items:center;justify-content:space-between;padding:0.4rem 1rem;background:rgba(15,23,42,0.96);border-bottom:1px solid rgba(255,255,255,0.08);flex-shrink:0;">
                    <div style="display:flex;align-items:center;gap:8px;overflow:hidden;min-width:0;">
                        <span style="color:rgba(255,255,255,0.4);font-size:0.76rem;font-weight:600;white-space:nowrap;flex-shrink:0;">PDF-Vorschau</span>
                        <span style="color:rgba(255,255,255,0.18);font-size:0.76rem;flex-shrink:0;">|</span>
                        <span style="color:#fff;font-size:0.82rem;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${title} &ndash; ${machineTitle}</span>
                    </div>
                    <button onclick="document.getElementById('pdf-preview-overlay').remove()"
                        style="flex-shrink:0;margin-left:0.75rem;width:26px;height:26px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:6px;color:rgba(255,255,255,0.55);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.2s;"
                        onmouseover="this.style.background='rgba(239,68,68,0.2)';this.style.borderColor='rgba(239,68,68,0.4)';this.style.color='#f87171';" onmouseout="this.style.background='rgba(255,255,255,0.06)';this.style.borderColor='rgba(255,255,255,0.12)';this.style.color='rgba(255,255,255,0.55)';">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>
                <iframe id="pdf-preview-frame" src="${blobUrl}" style="flex:1;width:100%;border:none;background:#525659;"></iframe>
            `;
            document.body.appendChild(previewOverlay);


        } catch (err) {
            document.getElementById('pdf-preview-loading')?.remove();
            alert('Fehler bei der Vorschau: ' + err.message);
        }
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
        document.querySelectorAll('#protocols .calendar-tab-btn').forEach(btn => {
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
                const m = p.machines || {};
                const machineStr = `${m.manufacturer || ''} ${m.name || ''} ${m.serial ? `#${m.serial}` : ''} ${m.year ? `(${m.year})` : ''}`;
                const searchString = `${p.title} ${p.type === 'intake' ? 'Eingang' : 'Abnahme'} ${machineStr}`.toLowerCase();

                // Split search term into words and check if ALL words are present
                return protocolSearchTerm.split(' ').every(word => searchString.includes(word));
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
                const createdDate = new Date(p.created_at).toLocaleDateString('de-DE');
                const lastChangeDate = new Date(p.completed_at || p.updated_at || p.created_at).toLocaleDateString('de-DE');
                const dateLabel = p.status === 'completed' ? 'Abgeschlossen am' : 'Zuletzt geändert';

                const badgeText = p.status === 'completed' ? 'Abgeschlossen' : 'Entwurf';
                const badgeColor = p.status === 'completed' ? '#10b981' : '#f59e0b';
                const typeLabel = isAcceptance ? 'Abnahmeprotokoll' : 'Eingangsprotokoll';
                // Typ-Farbe: Abnahmeprotokoll = Orange, Eingangsprotokoll = Blau
                const typeBgColor = isAcceptance ? 'rgba(249, 115, 22, 0.2)' : 'rgba(59, 130, 246, 0.2)';
                const typeBorderColor = isAcceptance ? 'rgba(249, 115, 22, 0.5)' : 'rgba(59, 130, 246, 0.4)';
                const typeTextColor = isAcceptance ? '#fb923c' : '#93c5fd';

                return `
                    <div class="card" onclick="${isAcceptance ? 'window.openAcceptanceProtocol' : 'window.openIntakeProtocol'}('${p.machine_id}', '${p.id}')" style="font-family: 'Inter', sans-serif; overflow: visible; display: flex; flex-direction: column; background: rgba(110, 122, 140, 0.45); backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px); box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6); border: 3px solid ${badgeColor}66; border-top: 7px solid ${badgeColor}; border-radius: 20px; transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); cursor: pointer; position: relative; padding-top: 35px; width: 100%; box-sizing: border-box; min-width: 0;">
                        
                        <!-- Premium Badge Top Right -->
                        <div style="position: absolute; top: -20px; right: 24px; left: auto; height: 40px; padding: 0 16px; background: ${badgeColor}D9; color: #ffffff; border-radius: 20px; font-size: 0.85rem; font-weight: 800; box-shadow: 0 4px 14px ${badgeColor}80; border: 2px solid rgba(255, 255, 255, 0.4); backdrop-filter: blur(12px); z-index: 10; letter-spacing: 0.5px; display: flex; align-items: center; justify-content: center; gap: 8px;">
                            ${badgeText}
                        </div>
                        
                        <!-- Full-Width Machine Image Container -->
                        <div style="position: relative; width: 100%; height: var(--machine-image-height, 300px); overflow: hidden; background: linear-gradient(135deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01)); display: flex; align-items: center; justify-content: center;">
                            ${p.machines && p.machines.image_url ?
                        `<img src="${p.machines.image_url}" alt="${p.title}" loading="lazy" style="width: 100%; height: 100%; object-fit: contain; display: block;">` :
                        `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" style="opacity: 0.15;">
                                    <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
                                    <circle cx="9" cy="9" r="2"/>
                                    <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
                                </svg>`
                    }
                        </div>
                        
                        <div style="height: 1px; background: rgba(255,255,255,0.1); margin: 0;"></div>
                        
                        <div class="card-content" style="padding: 1.25rem 1.25rem 2px 1.25rem; flex: 1; display: flex; flex-direction: column; gap: 0.75rem;">
                            <!-- First Row: Centered Tag -->
                            <div style="display: flex; justify-content: center; margin-bottom: 0.25rem;">
                                <div style="padding: 4px 12px; background: ${typeBgColor}; border: 1px solid ${typeBorderColor}; border-radius: 12px; color: ${typeTextColor}; font-size: 0.8rem; font-weight: 800; display: flex; align-items: center; gap: 4px; text-transform: uppercase;">
                                    ${typeLabel}
                                </div>
                            </div>
                            
                            <!-- Second Row: Dates -->
                            <div style="display: flex; flex-direction: column; gap: 4px; color: rgba(255,255,255,0.6); font-size: 0.85rem; font-weight: 700; letter-spacing: 0.3px; margin-bottom: 0.25rem;">
                                <div style="display: flex; align-items: center; gap: 6px;">
                                    <span style="opacity: 0.7;">Erstellt am:</span>
                                    <span style="color: #ffffff;">${createdDate}</span>
                                </div>
                                <div style="display: flex; align-items: center; gap: 6px;">
                                    <span style="opacity: 0.7;">${dateLabel}:</span>
                                    <span style="color: #ffffff;">${lastChangeDate}</span>
                                </div>
                            </div>
                            
                            <!-- Third Row: Main Title: Machine Name (Manufacturer + Type) -->
                            <div style="min-width: 0; text-align: left; width: 100%;">
                                <h2 style="margin: 0; font-size: clamp(0.95rem, 3.2vw, 1.75rem); color: var(--color-primary-green); font-weight: 900; line-height: 1.2; font-family: 'Outfit', sans-serif; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                    ${p.machines ? [p.machines.manufacturer, p.machines.name].filter(Boolean).join(' ') : p.title}
                                </h2>
                                ${p.machines ? `
                                <div style="color: var(--color-primary-green); font-size: clamp(0.9rem, 3vw, 1.25rem); font-weight: 700; margin-top: 4px; opacity: 0.8; text-transform: uppercase;">
                                    ${[p.machines.serial ? `#${p.machines.serial}` : null, p.machines.year ? `(${p.machines.year})` : null].filter(Boolean).join(' ')}
                                </div>` : ''}
                            </div>
                            
                            <!-- Action buttons -->
                            <div class="card-actions" style="margin-top: auto; padding-top: 0.75rem; display: flex; gap: 8px; align-items: stretch;">
                                <button class="btn-reports" style="cursor: pointer !important; pointer-events: auto !important; display: flex; align-items: center; justify-content: center; gap: 8px; flex: 1; min-height: 44px; background: rgba(59, 130, 246, 0.2); border: 1.5px solid rgba(59, 130, 246, 0.5); color: #60a5fa; border-radius: 12px; font-weight: 700;" 
                                        onclick="event.stopPropagation(); ${isAcceptance ? 'window.openAcceptanceProtocol' : 'window.openIntakeProtocol'}('${p.machine_id || ''}', '${p.id || ''}')">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                                    Öffnen
                                </button>
                                ${p.status === 'completed' ? `
                                <button class="btn-reports-red" onclick="event.stopPropagation(); window.openProtocolPDF('${p.machine_id}', '${p.id}', '${p.type}')">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="stroke: white;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
                                    PDF öffnen
                                </button>` : ''}
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
                const badgeColor = p.status === 'completed' ? '#10b981' : '#f59e0b';
                // Typ-Farbe: Abnahmeprotokoll = Orange, Eingangsprotokoll = Blau
                const typeIconColor = isAcceptance ? '#fb923c' : '#60a5fa';
                const iconPath = isAcceptance
                    ? '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><path d="M9 15l2 2 4-4"></path>'
                    : '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline>';

                return `
                    <tr style="cursor: pointer; background: rgba(110, 122, 140, 0.45); backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px); box-shadow: inset 5px 0 0 0 ${badgeColor}, inset 0 1.5px 0 0 ${badgeColor}66, inset -1.5px 0 0 0 ${badgeColor}66, inset 0 -1.5px 0 0 ${badgeColor}66, 0 10px 30px rgba(0,0,0,0.4); border-radius: 16px; overflow: hidden;" onclick="${isAcceptance ? 'window.openAcceptanceProtocol' : 'window.openIntakeProtocol'}('${p.machine_id}', '${p.id}')">
                        <td data-label="Typ">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <div style="display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 8px; background: ${typeIconColor}22; color: ${typeIconColor};">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        ${iconPath}
                                    </svg>
                                </div>
                                <span style="font-weight: 600; font-size: 0.95rem; color: ${typeIconColor};">${typeLabel}</span>
                            </div>
                        </td>
                        <td data-label="Maschine" style="color: var(--color-primary-green); font-weight: 700; font-size: 0.98rem; line-height: 1.3;">
                            ${p.machines ? `
                                <div style="font-weight: 900; font-family: 'Outfit', sans-serif; font-size: 1.1rem;">${[p.machines.manufacturer, p.machines.name].filter(Boolean).join(' ')}</div>
                                <div style="font-size: 0.85rem; opacity: 0.8; text-transform: uppercase;">
                                    ${[p.machines.serial ? `#${p.machines.serial}` : null, p.machines.year ? `(${p.machines.year})` : null].filter(Boolean).join(' ')}
                                </div>` : 'Unbekannt'}
                        </td>
                        <td data-label="Datum">
                            <div style="font-weight: 600;">${dateStr}</div>
                            <div style="font-size: 0.8rem; color: rgba(255,255,255,0.4);">${timeStr} Uhr</div>
                        </td>
                        <td data-label="Status">
                            <span class="status-badge ${statusClass}" style="background: ${badgeColor}25; color: ${badgeColor}; border: 1px solid ${badgeColor}60; border-radius: 20px; padding: 4px 12px; font-size: 0.8rem; font-weight: 800;">${statusLabel}</span>
                        </td>
                        <td data-label="Aktionen" onclick="event.stopPropagation()">
                            <div style="display: flex; gap: 0.5rem; align-items: center; justify-content: flex-end;">
                                <button onclick="event.stopPropagation(); ${isAcceptance ? 'window.openAcceptanceProtocol' : 'window.openIntakeProtocol'}('${p.machine_id}', '${p.id}')" title="Ansehen"
                                    style="width:36px; height:36px; border-radius:50%; background: rgba(59,130,246,0.2); border: 1.5px solid rgba(59,130,246,0.5); color: #60a5fa; display:flex; align-items:center; justify-content:center; cursor:pointer; transition: all 0.2s;"
                                    onmouseover="this.style.background='rgba(59,130,246,0.4)'" onmouseout="this.style.background='rgba(59,130,246,0.2)'">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                                </button>
                                ${p.status === 'completed' ? `
                                <button onclick="event.stopPropagation(); window.openProtocolPDF('${p.machine_id}', '${p.id}', '${p.type}')" title="PDF öffnen"
                                    style="width:36px; height:36px; border-radius:50%; background: rgba(239,68,68,0.2); border: 1.5px solid rgba(239,68,68,0.5); color: #f87171; display:flex; align-items:center; justify-content:center; cursor:pointer; transition: all 0.2s;"
                                    onmouseover="this.style.background='rgba(239,68,68,0.4)'" onmouseout="this.style.background='rgba(239,68,68,0.2)'">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
                                </button>` : ''}
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
