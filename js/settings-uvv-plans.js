// ==========================================================
// Einstellungen: UVV- und Wartungsplaene, Gruppenfarben
// ==========================================================
// Herausgeloest aus js/app-init.js (vormals Zeilen 2603-3330).
// Der Rumpf lief dort direkt im DOMContentLoaded-Handler und wird jetzt von
// dort per initUvvWartungsplaene() an genau derselben Stelle aufgerufen.
// Die Zeilen sind unveraendert uebernommen; lokale Variablen sind damit
// lokal zu dieser Funktion geworden.
// ==========================================================

window.initUvvWartungsplaene = function () {
            // ============================================================
            // UVV & Wartungspläne Settings
            // ============================================================

            let uvvPlanAssignments = {}; // { planId: { category_ids: [], machine_ids: [] } }
            let uvvMachineChips = {};    // { planId: Set of machine IDs currently in the chip UI }

            window.loadUvvWartungsplaene = async function () {
                try {
                    const { data, error } = await supabaseClient
                        .from('app_settings').select('value')
                        .eq('key', 'uvv_plan_assignments').maybeSingle();
                    uvvPlanAssignments = (data && !error && data.value) ? data.value : {};
                } catch(e) { uvvPlanAssignments = {}; }
                window.uvvPlanAssignments = uvvPlanAssignments;

                // Merge built-in + custom templates
                try {
                    const { data } = await supabaseClient
                        .from('app_settings').select('value')
                        .eq('key', 'custom_checklist_templates').maybeSingle();
                    const custom = (data && Array.isArray(data.value)) ? data.value : [];
                    const builtInIds = new Set((window.MOCK_CHECKLIST_TEMPLATES || []).map(t => t.id));
                    const customMap = Object.fromEntries(custom.map(t => [t.id, t]));
                    window.ACTIVE_CHECKLIST_TEMPLATES = [
                        ...(window.MOCK_CHECKLIST_TEMPLATES || []).map(t => customMap[t.id] || t),
                        ...custom.filter(t => !builtInIds.has(t.id))
                    ];
                } catch(e) {
                    window.ACTIVE_CHECKLIST_TEMPLATES = [...(window.MOCK_CHECKLIST_TEMPLATES || [])];
                }

                uvvMachineChips = {};
                renderUvvPlanCards('all');
            };

            function renderUvvPlanCards(filter) {
                const container = document.getElementById('uvv-plan-cards-container');
                if (!container) return;

                const templates = window.ACTIVE_CHECKLIST_TEMPLATES || window.MOCK_CHECKLIST_TEMPLATES || [];
                const filtered = filter === 'all' ? templates : templates.filter(t => t.type === filter);

                if (!filtered.length) {
                    container.innerHTML = '<div style="text-align:center; padding: 3rem; color: rgba(255,255,255,0.4);">Keine Pläne vorhanden.</div>';
                    return;
                }

                const builtInIds = new Set((window.MOCK_CHECKLIST_TEMPLATES || []).map(t => t.id));

                const planTypeStyles = {
                    uvv: { color: '#ef4444', bg: 'rgba(239,68,68,0.15)', border: 'rgba(239,68,68,0.4)', label: 'UVV' },
                    wartung: { color: '#3b82f6', bg: 'rgba(59,130,246,0.15)', border: 'rgba(59,130,246,0.4)', label: 'WARTUNG' },
                    einweisung: { color: '#8b5cf6', bg: 'rgba(139,92,246,0.15)', border: 'rgba(139,92,246,0.4)', label: 'EINWEISUNG' }
                };

                container.innerHTML = filtered.map(plan => {
                    const assignment = uvvPlanAssignments[plan.id] || { category_ids: [], machine_series: [] };
                    const planStyle = planTypeStyles[plan.type] || planTypeStyles.wartung;
                    const badgeColor = planStyle.color;
                    const badgeBg = planStyle.bg;
                    const badgeBorder = planStyle.border;
                    const badgeLabel = planStyle.label;
                    const itemCount = plan.items ? plan.items.length : 0;
                    const assignedSeries = assignment.machine_series || [];
                    const models = assignedSeries.length > 0 ? assignedSeries.join(', ') : ((plan.machine_series || []).length ? plan.machine_series.join(', ') : 'Alle Maschinen');
                    const isCustom = !builtInIds.has(plan.id);

                    // Category dropdown + tags
                    const categories = (window.categoryList || []).filter(c => c.type === 'machine');
                    const selectedCatIds = new Set((assignment.category_ids || []).map(String));
                    const catDropdownItems = categories.map(c => {
                        const sel = selectedCatIds.has(String(c.id));
                        const bg = sel ? 'rgba(59,130,246,0.15)' : 'transparent';
                        const bgHover = sel ? 'rgba(59,130,246,0.25)' : 'rgba(255,255,255,0.06)';
                        return `<div onclick="uvvToggleCat('${plan.id}','${c.id}')"
                            style="padding:9px 14px; cursor:pointer; font-size:0.88rem; color:${sel ? '#60a5fa' : 'white'};
                            border-bottom:1px solid rgba(255,255,255,0.06); transition:background 0.15s; background:${bg};"
                            onmouseover="this.style.background='${bgHover}'"
                            onmouseout="this.style.background='${bg}'">${sel ? '✓ ' : ''}${c.name}</div>`;
                    }).join('');
                    const catSelectedTags = [...selectedCatIds].map(cid => {
                        const cat = categories.find(c => String(c.id) === cid);
                        if (!cat) return '';
                        return `<span style="display:inline-flex; align-items:center; gap:6px; background:rgba(59,130,246,0.15); border:1px solid rgba(59,130,246,0.35); border-radius:20px; padding:4px 12px; font-size:0.82rem; color:#60a5fa; font-weight:700;">${cat.name}<span onclick="uvvToggleCat('${plan.id}','${cat.id}')" style="cursor:pointer; opacity:0.7; font-size:1rem; line-height:1;">&times;</span></span>`;
                    }).join('');

                    // Maschinenserie dropdown + tags (Vorschläge aus den Kategorien vom Typ "series")
                    const allSeriesCats = (window.categoryList || []).filter(c => c.type === 'series');
                    const selectedSeriesNames = new Set(assignedSeries);
                    const seriesDropdownItems = allSeriesCats.map(s => {
                        const sel = selectedSeriesNames.has(s.name);
                        const safe = s.name.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
                        const bg = sel ? 'rgba(16,185,129,0.15)' : 'transparent';
                        const bgHover = sel ? 'rgba(16,185,129,0.25)' : 'rgba(255,255,255,0.06)';
                        return `<div onclick="uvvToggleSeries('${plan.id}','${safe}')"
                            style="padding:9px 14px; cursor:pointer; font-size:0.88rem; color:${sel ? '#10b981' : 'white'};
                            border-bottom:1px solid rgba(255,255,255,0.06); transition:background 0.15s; background:${bg};"
                            onmouseover="this.style.background='${bgHover}'"
                            onmouseout="this.style.background='${bg}'">${sel ? '✓ ' : ''}${s.name}</div>`;
                    }).join('');
                    const seriesSelectedTags = [...selectedSeriesNames].map(name => {
                        const safe = name.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
                        return `<span style="display:inline-flex; align-items:center; gap:6px; background:rgba(16,185,129,0.15); border:1px solid rgba(16,185,129,0.35); border-radius:20px; padding:4px 12px; font-size:0.82rem; color:#10b981; font-weight:700;">
                            ${name}
                            <span onclick="uvvToggleSeries('${plan.id}','${safe}')" style="cursor:pointer; opacity:0.7; font-size:1rem; line-height:1;">&times;</span>
                        </span>`;
                    }).join('');

                    return `<div class="glass-card uvv-plan-card" data-plan-type="${plan.type}" style="padding: 1.25rem 1.5rem; position: relative;">
                        <div style="flex:1; min-width:0;">
                            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:4px;">
                                <span style="font-size:0.68rem; font-weight:900; text-transform:uppercase; letter-spacing:1px; padding:3px 9px; border-radius:20px; background:${badgeBg}; border:1px solid ${badgeBorder}; color:${badgeColor};">${badgeLabel}</span>
                                <div style="display:flex; gap:6px;">
                                    <button class="btn-icon-soft edit" onclick="openPlanModal('${plan.id}')" title="Bearbeiten">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                    </button>
                                    ${isCustom ? `<button class="btn-icon-soft delete" onclick="deletePlan('${plan.id}')" title="Löschen">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                    </button>` : ''}
                                </div>
                            </div>
                            <div style="margin-bottom:0.65rem;">
                                <span style="font-size:0.76rem; color:rgba(255,255,255,0.35); font-weight:500;">${itemCount} Prüfpunkte · ${models}</span>
                            </div>
                            <h3 style="margin:0 0 0.9rem 0; font-family:'Outfit',sans-serif; font-size:1.15rem; font-weight:800; color:#fff;">${plan.title}</h3>

                            <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem; align-items:start;">
                                <div>
                                    <label style="font-size:0.75rem; color:rgba(255,255,255,0.4); text-transform:uppercase; font-weight:700; letter-spacing:0.5px; display:block; margin-bottom:7px;">Maschinentyp</label>
                                    <div style="position:relative;">
                                        <button onclick="uvvToggleCatDropdown('${plan.id}')" id="uvv-cat-btn-${plan.id}"
                                            style="width:100%; padding:9px 12px; border-radius:9px; border:1px solid rgba(255,255,255,0.12); background:rgba(255,255,255,0.04); color:${selectedCatIds.size ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.3)'}; font-family:'Inter',sans-serif; font-size:0.86rem; cursor:pointer; text-align:left; display:flex; justify-content:space-between; align-items:center;">
                                            <span id="uvv-cat-btn-text-${plan.id}">${selectedCatIds.size ? selectedCatIds.size + ' ausgewählt' : 'Maschinentyp wählen...'}</span>
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="opacity:0.5; flex-shrink:0;"><polyline points="6 9 12 15 18 9"></polyline></svg>
                                        </button>
                                        <div id="uvv-cat-dropdown-${plan.id}" style="display:none; position:absolute; top:100%; left:0; right:0; z-index:500; background:#0b1220; border:1px solid rgba(255,255,255,0.15); border-radius:10px; margin-top:4px; max-height:200px; overflow-y:auto; box-shadow:0 12px 40px rgba(0,0,0,0.7);">
                                            ${catDropdownItems || '<div style="padding:10px 14px; color:rgba(255,255,255,0.4); font-size:0.85rem;">Keine Kategorien</div>'}
                                        </div>
                                    </div>
                                    <div id="uvv-cat-tags-${plan.id}" style="display:flex; flex-wrap:wrap; gap:5px; margin-top:8px;">${catSelectedTags}</div>
                                </div>
                                <div>
                                    <label style="font-size:0.75rem; color:rgba(255,255,255,0.4); text-transform:uppercase; font-weight:700; letter-spacing:0.5px; display:block; margin-bottom:7px;">Maschinenserie</label>
                                    <div style="position:relative;">
                                        <button onclick="uvvToggleSeriesDropdown('${plan.id}')" id="uvv-series-btn-${plan.id}"
                                            style="width:100%; padding:9px 12px; border-radius:9px; border:1px solid rgba(255,255,255,0.12); background:rgba(255,255,255,0.04); color:${selectedSeriesNames.size ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.3)'}; font-family:'Inter',sans-serif; font-size:0.86rem; cursor:pointer; text-align:left; display:flex; justify-content:space-between; align-items:center;">
                                            <span id="uvv-series-btn-text-${plan.id}">${selectedSeriesNames.size ? selectedSeriesNames.size + ' ausgewählt' : 'Maschinenserie wählen...'}</span>
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="opacity:0.5; flex-shrink:0;"><polyline points="6 9 12 15 18 9"></polyline></svg>
                                        </button>
                                        <div id="uvv-series-dropdown-${plan.id}" style="display:none; position:absolute; top:100%; left:0; right:0; z-index:500; background:#0b1220; border:1px solid rgba(255,255,255,0.15); border-radius:10px; margin-top:4px; max-height:200px; overflow-y:auto; box-shadow:0 12px 40px rgba(0,0,0,0.7);">
                                            ${seriesDropdownItems || '<div style="padding:10px 14px; color:rgba(255,255,255,0.4); font-size:0.85rem;">Keine Maschinenserien angelegt</div>'}
                                        </div>
                                    </div>
                                    <div id="uvv-series-tags-${plan.id}" style="display:flex; flex-wrap:wrap; gap:5px; margin-top:8px;">${seriesSelectedTags}</div>
                                </div>
                            </div>
                        </div>
                        <div style="display:flex; justify-content:flex-end; margin-top:0.9rem; padding-top:0.75rem; border-top:1px solid rgba(255,255,255,0.06);">
                            <button class="uvv-assignment-save" onclick="saveUvvPlanAssignment('${plan.id}')"
                                style="padding:8px 20px; border-radius:10px; background:rgba(16,185,129,0.2); border:1.5px solid rgba(16,185,129,0.4); color:#10b981; font-weight:800; font-size:0.82rem; cursor:pointer; transition:all 0.2s; text-transform:uppercase; letter-spacing:0.5px;"
                                onmouseover="this.style.background='rgba(16,185,129,0.35)'"
                                onmouseout="this.style.background='rgba(16,185,129,0.2)'">
                                Zuordnung speichern
                            </button>
                        </div>
                    </div>`;
                }).join('');
            }

            window.filterUvvPlanCards = function (filter) {
                const filterColors = {
                    uvv: { bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.4)' },
                    wartung: { bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.4)' },
                    einweisung: { bg: 'rgba(139,92,246,0.08)', border: 'rgba(139,92,246,0.4)' }
                };
                document.querySelectorAll('.uvv-filter-btn').forEach(btn => {
                    const isActive = btn.dataset.filter === filter;
                    const c = filterColors[btn.dataset.filter];
                    btn.style.background = isActive ? 'rgba(255,255,255,0.15)' : (c ? c.bg : 'rgba(255,255,255,0.08)');
                    btn.style.borderColor = isActive ? 'rgba(255,255,255,0.4)' : (c ? c.border : 'rgba(255,255,255,0.2)');
                });
                renderUvvPlanCards(filter);
            };

            // Maschinenserie-Dropdown auf der Plan-Karte: Mehrfachauswahl aus den Kategorien
            // vom Typ "series" (analog zum Maschinentyp-Dropdown daneben).
            window.uvvToggleSeriesDropdown = function (planId) {
                const dropdown = document.getElementById(`uvv-series-dropdown-${planId}`);
                if (!dropdown) return;
                const isOpen = dropdown.style.display !== 'none';
                document.querySelectorAll('[id^="uvv-series-dropdown-"]').forEach(d => { d.style.display = 'none'; });
                if (!isOpen) dropdown.style.display = 'block';
            };

            window.uvvToggleSeries = function (planId, name) {
                if (!uvvPlanAssignments[planId]) uvvPlanAssignments[planId] = { category_ids: [], machine_series: [] };
                if (!uvvPlanAssignments[planId].machine_series) uvvPlanAssignments[planId].machine_series = [];
                const arr = uvvPlanAssignments[planId].machine_series;
                const idx = arr.indexOf(name);
                if (idx === -1) { arr.push(name); } else { arr.splice(idx, 1); }
                const selectedSeriesNames = new Set(arr);

                // Dropdown-Liste (Häkchen) neu zeichnen
                const dropdown = document.getElementById(`uvv-series-dropdown-${planId}`);
                if (dropdown) {
                    const allSeriesCats = (window.categoryList || []).filter(c => c.type === 'series');
                    dropdown.innerHTML = allSeriesCats.map(s => {
                        const sel = selectedSeriesNames.has(s.name);
                        const safe = s.name.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
                        const bg = sel ? 'rgba(16,185,129,0.15)' : 'transparent';
                        const bgHover = sel ? 'rgba(16,185,129,0.25)' : 'rgba(255,255,255,0.06)';
                        return `<div onclick="uvvToggleSeries('${planId}','${safe}')"
                            style="padding:9px 14px; cursor:pointer; font-size:0.88rem; color:${sel ? '#10b981' : 'white'};
                            border-bottom:1px solid rgba(255,255,255,0.06); transition:background 0.15s; background:${bg};"
                            onmouseover="this.style.background='${bgHover}'"
                            onmouseout="this.style.background='${bg}'">${sel ? '✓ ' : ''}${s.name}</div>`;
                    }).join('') || '<div style="padding:10px 14px; color:rgba(255,255,255,0.4); font-size:0.85rem;">Keine Maschinenserien angelegt</div>';
                }
                // Tags neu zeichnen
                const tagsEl = document.getElementById(`uvv-series-tags-${planId}`);
                if (tagsEl) {
                    tagsEl.innerHTML = [...selectedSeriesNames].map(name2 => {
                        const safe = name2.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
                        return `<span style="display:inline-flex; align-items:center; gap:6px; background:rgba(16,185,129,0.15); border:1px solid rgba(16,185,129,0.35); border-radius:20px; padding:4px 12px; font-size:0.82rem; color:#10b981; font-weight:700;">
                            ${name2}
                            <span onclick="uvvToggleSeries('${planId}','${safe}')" style="cursor:pointer; opacity:0.7; font-size:1rem; line-height:1;">&times;</span>
                        </span>`;
                    }).join('');
                }
                // Button-Label aktualisieren
                const btnText = document.getElementById(`uvv-series-btn-text-${planId}`);
                if (btnText) btnText.textContent = selectedSeriesNames.size ? selectedSeriesNames.size + ' ausgewählt' : 'Maschinenserie wählen...';
            };

            window.saveUvvPlanAssignment = async function (planId) {
                if (!uvvPlanAssignments[planId]) uvvPlanAssignments[planId] = { category_ids: [], machine_series: [] };

                try {
                    const { data: existing } = await supabaseClient
                        .from('app_settings').select('key').eq('key', 'uvv_plan_assignments').maybeSingle();

                    if (existing) {
                        await supabaseClient.from('app_settings')
                            .update({ value: uvvPlanAssignments })
                            .eq('key', 'uvv_plan_assignments');
                    } else {
                        await supabaseClient.from('app_settings')
                            .insert([{ key: 'uvv_plan_assignments', value: uvvPlanAssignments }]);
                    }

                    // Brief visual feedback
                    const btn = event && event.target ? event.target : null;
                    if (btn) {
                        const orig = btn.textContent;
                        btn.textContent = '✓ Gespeichert';
                        btn.style.background = 'rgba(16,185,129,0.4)';
                        setTimeout(() => { btn.textContent = orig; btn.style.background = 'rgba(16,185,129,0.2)'; }, 1800);
                    }
                } catch(e) {
                    window.showToast('Fehler beim Speichern: ' + (e.message || e));
                }
            };

            // Close machine series dropdowns on outside click
            document.addEventListener('click', function(e) {
                if (!e.target.closest('[id^="uvv-series-btn-"]') && !e.target.closest('[id^="uvv-series-dropdown-"]')) {
                    document.querySelectorAll('[id^="uvv-series-dropdown-"]').forEach(d => d.style.display = 'none');
                }
            });

            // Toggle category selection
            window.uvvToggleCat = function(planId, catId) {
                if (!uvvPlanAssignments[planId]) uvvPlanAssignments[planId] = { category_ids: [], machine_ids: [] };
                const ids = uvvPlanAssignments[planId].category_ids;
                const cid = String(catId);
                const idx = ids.indexOf(cid);
                if (idx === -1) { ids.push(cid); } else { ids.splice(idx, 1); }
                const selectedCatIds = new Set(ids);
                const categories = (window.categoryList || []).filter(c => c.type === 'machine');
                // Update button text
                const btnText = document.getElementById(`uvv-cat-btn-text-${planId}`);
                if (btnText) btnText.textContent = selectedCatIds.size ? `${selectedCatIds.size} ausgewählt` : 'Maschinentyp wählen...';
                const btn = document.getElementById(`uvv-cat-btn-${planId}`);
                if (btn) btn.style.color = selectedCatIds.size ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.3)';
                // Re-render dropdown items
                const dropdown = document.getElementById(`uvv-cat-dropdown-${planId}`);
                if (dropdown) {
                    dropdown.innerHTML = categories.map(c => {
                        const sel = selectedCatIds.has(String(c.id));
                        const bg = sel ? 'rgba(59,130,246,0.15)' : 'transparent';
                        const bgHover = sel ? 'rgba(59,130,246,0.25)' : 'rgba(255,255,255,0.06)';
                        return `<div onclick="uvvToggleCat('${planId}','${c.id}')"
                            style="padding:9px 14px; cursor:pointer; font-size:0.88rem; color:${sel ? '#60a5fa' : 'white'};
                            border-bottom:1px solid rgba(255,255,255,0.06); transition:background 0.15s; background:${bg};"
                            onmouseover="this.style.background='${bgHover}'"
                            onmouseout="this.style.background='${bg}'">${sel ? '✓ ' : ''}${c.name}</div>`;
                    }).join('');
                }
                // Re-render tags
                const tagsEl = document.getElementById(`uvv-cat-tags-${planId}`);
                if (tagsEl) {
                    tagsEl.innerHTML = [...selectedCatIds].map(cid2 => {
                        const cat = categories.find(c => String(c.id) === cid2);
                        if (!cat) return '';
                        return `<span style="display:inline-flex; align-items:center; gap:6px; background:rgba(59,130,246,0.15); border:1px solid rgba(59,130,246,0.35); border-radius:20px; padding:4px 12px; font-size:0.82rem; color:#60a5fa; font-weight:700;">${cat.name}<span onclick="uvvToggleCat('${planId}','${cat.id}')" style="cursor:pointer; opacity:0.7; font-size:1rem; line-height:1;">&times;</span></span>`;
                    }).join('');
                }
            };

            window.uvvToggleCatDropdown = function(planId) {
                const dropdown = document.getElementById(`uvv-cat-dropdown-${planId}`);
                if (!dropdown) return;
                const isOpen = dropdown.style.display !== 'none';
                document.querySelectorAll('[id^="uvv-cat-dropdown-"]').forEach(d => { d.style.display = 'none'; });
                if (!isOpen) dropdown.style.display = 'block';
            };
            document.addEventListener('click', function(e) {
                if (!e.target.closest('[id^="uvv-cat-btn-"]') && !e.target.closest('[id^="uvv-cat-dropdown-"]')) {
                    document.querySelectorAll('[id^="uvv-cat-dropdown-"]').forEach(d => { d.style.display = 'none'; });
                }
            });

            // Plan Editor Modal
            let planEditorState = { id: null, isNew: false, type: 'wartung', items: [] };
            let pmeSelectedSeries = [];

            window.openPlanModal = function(planId) {
                const modal = document.getElementById('plan-editor-modal');
                if (!modal) return;
                if (!planId) {
                    planEditorState = { id: 'custom-' + Date.now(), isNew: true, type: 'wartung', items: [] };
                    document.getElementById('plan-modal-title').textContent = 'Neuer Wartungsplan';
                    document.getElementById('pme-title').value = '';
                    pmeSelectedSeries = [];
                    setPmeType('wartung');
                } else {
                    const templates = window.ACTIVE_CHECKLIST_TEMPLATES || window.MOCK_CHECKLIST_TEMPLATES || [];
                    const plan = templates.find(t => t.id === planId);
                    if (!plan) return;
                    planEditorState = { id: planId, isNew: false, type: plan.type || 'wartung', items: (plan.items || []).map(item => ({...item})) };
                    document.getElementById('plan-modal-title').textContent = 'Wartungsplan bearbeiten';
                    document.getElementById('pme-title').value = plan.title || '';
                    // Vorbelegen aus der Zuordnung (Plan-Karten-Auswahl), sonst aus dem Plan selbst
                    const asgn = uvvPlanAssignments[planId] || {};
                    pmeSelectedSeries = (asgn.machine_series && asgn.machine_series.length)
                        ? [...asgn.machine_series]
                        : [...(plan.machine_series || [])];
                    setPmeType(plan.type || 'wartung');
                }
                populatePmeSeriesOptions();
                renderPmeItems();
                modal.style.display = 'flex';
            };

            // Maschinenserie (Mehrfachauswahl) im Plan-Editor: Vorschläge kommen aus den
            // Kategorien vom Typ "series" (Einstellungen) — analog zu cat-series-machine-cat-*.
            function populatePmeSeriesOptions() {
                const list = document.getElementById('pme-series-options');
                if (!list) return;
                list.innerHTML = '';
                const allSeries = (typeof categoryList !== 'undefined' && Array.isArray(categoryList))
                    ? categoryList.filter(c => c.type === 'series')
                    : [];
                if (!allSeries.length) {
                    list.innerHTML = '<li style="padding:9px 14px; color:rgba(255,255,255,0.4); font-size:0.85rem; cursor:default;">Keine Maschinenserien angelegt</li>';
                } else {
                    allSeries.forEach(cat => {
                        const li = document.createElement('li');
                        li.dataset.value = cat.name;
                        li.textContent = cat.name;
                        if (pmeSelectedSeries.includes(cat.name)) li.classList.add('selected');
                        li.addEventListener('click', e => {
                            e.stopPropagation();
                            window.togglePmeSeriesItem(cat.name);
                        });
                        list.appendChild(li);
                    });
                }
                updatePmeSeriesLabel();
            }

            function updatePmeSeriesLabel() {
                const label = document.getElementById('pme-series-label');
                if (label) label.textContent = pmeSelectedSeries.length > 0 ? pmeSelectedSeries.join(', ') : 'Maschinenserie wählen...';
            }

            window.togglePmeSeriesItem = function (name) {
                if (pmeSelectedSeries.includes(name)) {
                    pmeSelectedSeries = pmeSelectedSeries.filter(n => n !== name);
                } else {
                    pmeSelectedSeries.push(name);
                }
                updatePmeSeriesLabel();
                document.querySelectorAll('#pme-series-options li').forEach(li => {
                    li.classList.toggle('selected', pmeSelectedSeries.includes(li.dataset.value));
                });
            };

            window.togglePmeSeriesDropdown = function (event) {
                if (event) event.stopPropagation();
                const dropdown = document.getElementById('pme-series-dropdown');
                if (!dropdown) return;
                const isOpen = dropdown.classList.contains('active');

                document.querySelectorAll('.custom-filter-dropdown.active').forEach(d => {
                    d.classList.remove('active');
                    d.closest('.form-group')?.classList.remove('has-active-dropdown');
                });

                if (!isOpen) {
                    dropdown.classList.add('active');
                    dropdown.closest('.form-group')?.classList.add('has-active-dropdown');
                }
            };

            window.closePlanModal = function() {
                const modal = document.getElementById('plan-editor-modal');
                if (modal) modal.style.display = 'none';
            };

            window.setPmeType = function(type) {
                planEditorState.type = type;
                const wBtn = document.getElementById('pme-type-wartung');
                const uBtn = document.getElementById('pme-type-uvv');
                const eBtn = document.getElementById('pme-type-einweisung');
                if (!wBtn || !uBtn || !eBtn) return;

                const inactiveStyle = 'padding:7px 18px; border-radius:20px; border:1.5px solid rgba(255,255,255,0.1); background:rgba(255,255,255,0.04); color:rgba(255,255,255,0.4); font-weight:700; font-size:0.83rem; cursor:pointer; transition:all 0.15s;';
                wBtn.style.cssText = inactiveStyle;
                uBtn.style.cssText = inactiveStyle;
                eBtn.style.cssText = inactiveStyle;

                if (type === 'wartung') {
                    wBtn.style.cssText = 'padding:7px 18px; border-radius:20px; border:1.5px solid rgba(59,130,246,0.55); background:rgba(59,130,246,0.22); color:#60a5fa; font-weight:700; font-size:0.83rem; cursor:pointer; transition:all 0.15s;';
                } else if (type === 'uvv') {
                    uBtn.style.cssText = 'padding:7px 18px; border-radius:20px; border:1.5px solid rgba(239,68,68,0.55); background:rgba(239,68,68,0.22); color:#f87171; font-weight:700; font-size:0.83rem; cursor:pointer; transition:all 0.15s;';
                } else if (type === 'einweisung') {
                    eBtn.style.cssText = 'padding:7px 18px; border-radius:20px; border:1.5px solid rgba(139,92,246,0.55); background:rgba(139,92,246,0.22); color:#a78bfa; font-weight:700; font-size:0.83rem; cursor:pointer; transition:all 0.15s;';
                }

                // Bei Einweisung gibt es kein Intervall, dafür pro Punkt ein Ja/Nein- oder
                // Bemerkungsfeld — Spaltenkopf entsprechend umbenennen und Zeilen neu zeichnen,
                // damit der Editor sofort die passende Spalte zeigt (auch bei Typwechsel mitten im Bearbeiten).
                const col5Header = document.getElementById('pme-col5-header');
                if (col5Header) col5Header.textContent = type === 'einweisung' ? 'Erledigt / Bemerkung' : 'Intervall';
                renderPmeItems();
            };

            let pmeDragSrc = null;

            function renderPmeItems() {
                const container = document.getElementById('pme-items');
                if (!container) return;
                if (!planEditorState.items.length) {
                    container.innerHTML = '<div style="text-align:center; padding:1.5rem; color:rgba(255,255,255,0.25); font-size:0.85rem;">Noch keine Prüfpunkte. Klicke "Hinzufügen" um einen hinzuzufügen.</div>';
                    return;
                }
                container.innerHTML = planEditorState.items.map((item, i) => `
                    <div draggable="true" data-idx="${i}"
                        ondragstart="pmeItemDragStart(event,${i})"
                        ondragover="pmeItemDragOver(event)"
                        ondragleave="pmeItemDragLeave(event)"
                        ondrop="pmeItemDrop(event,${i})"
                        ondragend="pmeItemDragEnd(event)"
                        style="display:grid; grid-template-columns:20px 55px 1fr 2fr 110px 32px; gap:6px; align-items:center; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.06); border-radius:9px; padding:7px 10px; transition:border-color 0.15s, background 0.15s;">
                        <div onmousedown="this.closest('[draggable]').style.cursor='grabbing'" onmouseup="this.closest('[draggable]').style.cursor='default'"
                            style="cursor:grab; color:rgba(255,255,255,0.22); display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                            <svg width="12" height="16" viewBox="0 0 8 14" fill="currentColor"><circle cx="2" cy="2" r="1.2"/><circle cx="6" cy="2" r="1.2"/><circle cx="2" cy="7" r="1.2"/><circle cx="6" cy="7" r="1.2"/><circle cx="2" cy="12" r="1.2"/><circle cx="6" cy="12" r="1.2"/></svg>
                        </div>
                        <input type="text" value="${(item.pos||'').replace(/"/g,'&quot;')}" oninput="uvvUpdateItem(${i},'pos',this.value)" placeholder="Pos."
                            style="background:transparent; border:none; border-bottom:1px solid rgba(255,255,255,0.15); color:white; font-size:0.81rem; padding:2px 3px; outline:none; width:100%;">
                        <input type="text" value="${(item.category||'').replace(/"/g,'&quot;')}" oninput="uvvUpdateItem(${i},'category',this.value)" placeholder="Kategorie"
                            style="background:transparent; border:none; border-bottom:1px solid rgba(255,255,255,0.15); color:white; font-size:0.81rem; padding:2px 3px; outline:none; width:100%;">
                        <input type="text" value="${(item.description||'').replace(/"/g,'&quot;')}" oninput="uvvUpdateItem(${i},'description',this.value)" placeholder="Beschreibung"
                            style="background:transparent; border:none; border-bottom:1px solid rgba(255,255,255,0.15); color:white; font-size:0.81rem; padding:2px 3px; outline:none; width:100%;">
                        ${planEditorState.type === 'einweisung' ? pmeAnswerTypeToggleHtml(item, i) : `
                        <input type="text" value="${(item.interval||'').replace(/"/g,'&quot;')}" oninput="uvvUpdateItem(${i},'interval',this.value)" placeholder="Intervall"
                            style="background:transparent; border:none; border-bottom:1px solid rgba(255,255,255,0.15); color:white; font-size:0.81rem; padding:2px 3px; outline:none; width:100%;">
                        `}
                        <button onclick="uvvRemoveItem(${i})" style="background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.25); border-radius:6px; color:#ef4444; cursor:pointer; width:28px; height:28px; display:flex; align-items:center; justify-content:center; font-size:1rem; flex-shrink:0;">&times;</button>
                    </div>`).join('');
            }

            // Einweisung-Punkt: standardmäßig ein rundes Ja/Nein-Ankreuzfeld; per Klick auf das
            // kleine Icon oben rechts wird daraus ein Bemerkungsfeld (und zurück) — entscheidet,
            // welches Eingabefeld später beim Ausfüllen der Einweisungserklärung erscheint.
            function pmeAnswerTypeToggleHtml(item, i) {
                const isRemark = item.answerType === 'remark';
                const icon = isRemark
                    ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="7" x2="20" y2="7"></line><line x1="4" y1="12" x2="20" y2="12"></line><line x1="4" y1="17" x2="14" y2="17"></line></svg>`
                    : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="M8 12.5l2.5 2.5L16 9.5"></path></svg>`;
                const title = isRemark ? 'Bemerkungsfeld — klicken für Ankreuzfeld' : 'Ankreuzfeld (Ja/Nein) — klicken für Bemerkungsfeld';
                return `
                        <div style="position:relative; height:28px; display:flex; align-items:center; justify-content:center; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.1); border-radius:6px;" title="${title}">
                            ${icon}
                            <button onclick="pmeToggleAnswerType(${i})" title="Feldtyp umschalten" style="position:absolute; top:-6px; right:-6px; width:16px; height:16px; border-radius:50%; background:#1f2937; border:1px solid rgba(255,255,255,0.25); color:rgba(255,255,255,0.6); display:flex; align-items:center; justify-content:center; cursor:pointer; padding:0; line-height:1;">
                                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"></polyline><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><polyline points="7 23 3 19 7 15"></polyline><path d="M21 13v2a4 4 0 0 1-4 4H3"></path></svg>
                            </button>
                        </div>`;
            }

            window.pmeToggleAnswerType = function(idx) {
                const item = planEditorState.items[idx];
                if (!item) return;
                item.answerType = item.answerType === 'remark' ? 'checkbox' : 'remark';
                renderPmeItems();
            };

            window.pmeItemDragStart = function(e, idx) {
                pmeDragSrc = idx;
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', idx);
                setTimeout(() => { const el = document.querySelector(`#pme-items [data-idx="${idx}"]`); if (el) el.style.opacity = '0.35'; }, 0);
            };

            window.pmeItemDragOver = function(e) {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                e.currentTarget.style.background = 'rgba(59,130,246,0.12)';
                e.currentTarget.style.borderColor = 'rgba(59,130,246,0.45)';
            };

            window.pmeItemDragLeave = function(e) {
                e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)';
            };

            window.pmeItemDragEnd = function(e) {
                e.currentTarget.style.opacity = '1';
                document.querySelectorAll('#pme-items > div').forEach(el => {
                    el.style.background = 'rgba(255,255,255,0.03)';
                    el.style.borderColor = 'rgba(255,255,255,0.06)';
                });
                pmeDragSrc = null;
            };

            window.pmeItemDrop = function(e, targetIdx) {
                e.preventDefault();
                e.stopPropagation();
                if (pmeDragSrc === null || pmeDragSrc === targetIdx) return;
                const items = planEditorState.items;
                const [moved] = items.splice(pmeDragSrc, 1);
                items.splice(targetIdx, 0, moved);
                renderPmeItems();
            };

            window.uvvAddItem = function() {
                // Auto-increment pos from last item
                let nextPos = String(planEditorState.items.length + 1);
                const last = planEditorState.items[planEditorState.items.length - 1];
                if (last && last.pos) {
                    const n = parseFloat(last.pos);
                    if (!isNaN(n)) {
                        // If integer-like, just +1; if decimal, increment the integer part
                        nextPos = last.pos.includes('.') ? String(Math.floor(n) + 1) : String(Math.round(n) + 1);
                    }
                }
                planEditorState.items.push({ pos: nextPos, category: '', description: '', interval: '500Bh' });
                renderPmeItems();
                const c = document.getElementById('pme-items');
                if (c) c.scrollTop = c.scrollHeight;
            };

            window.uvvUpdateItem = function(idx, field, value) {
                if (planEditorState.items[idx]) planEditorState.items[idx][field] = value;
            };

            window.uvvRemoveItem = function(idx) {
                planEditorState.items.splice(idx, 1);
                renderPmeItems();
            };

            window.savePlanModal = async function() {
                const title = document.getElementById('pme-title').value.trim();
                if (!title) { window.showToast('Bitte einen Plan-Titel eingeben.'); return; }
                const plan = {
                    id: planEditorState.id,
                    title,
                    type: planEditorState.type,
                    machine_series: [...pmeSelectedSeries],
                    items: planEditorState.items
                };
                // Maschinenserie-Zuordnung synchronisieren (steuert die "Empfohlen"-Markierung)
                if (!uvvPlanAssignments[plan.id]) uvvPlanAssignments[plan.id] = { category_ids: [], machine_series: [] };
                if (pmeSelectedSeries.length) uvvPlanAssignments[plan.id].machine_series = [...pmeSelectedSeries];
                let custom = await loadCustomTemplates();
                const idx = custom.findIndex(t => t.id === plan.id);
                if (idx !== -1) { custom[idx] = plan; } else { custom.push(plan); }
                const savedOk = await saveCustomTemplates(custom);
                if (!savedOk) return; // Fehler wurde bereits per window.showToast() gemeldet — Modal nicht schließen, Auswahl bleibt erhalten
                // Sync existing service entries with updated template
                syncServiceEntriesWithTemplate(plan).catch(e => console.error('Sync failed:', e));
                // Persist updated assignments (machine_series sync) — Fehler hier NICHT mehr
                // stillschweigend verschlucken, sonst wirkt das Speichern erfolgreich, obwohl die
                // Maschinenserie-Zuordnung in der Datenbank gar nicht ankommt.
                try {
                    const { data: ex } = await supabaseClient.from('app_settings').select('key').eq('key', 'uvv_plan_assignments').maybeSingle();
                    const assignResult = ex
                        ? await supabaseClient.from('app_settings').update({ value: uvvPlanAssignments }).eq('key', 'uvv_plan_assignments')
                        : await supabaseClient.from('app_settings').insert([{ key: 'uvv_plan_assignments', value: uvvPlanAssignments }]);
                    if (assignResult.error) {
                        window.showToast('Plan wurde gespeichert, aber die Maschinenserie-Zuordnung konnte nicht gespeichert werden: ' + assignResult.error.message);
                    }
                } catch(e) {
                    window.showToast('Plan wurde gespeichert, aber die Maschinenserie-Zuordnung konnte nicht gespeichert werden: ' + (e.message || e));
                }
                closePlanModal();
                await window.loadUvvWartungsplaene();
            };

            async function syncServiceEntriesWithTemplate(plan) {
                const { data: entries, error } = await supabaseClient
                    .from('service_entries')
                    .select('id, checklist_payload')
                    .not('checklist_payload', 'is', null);
                if (error || !entries?.length) return;
                const newItems = plan.items || [];
                const updates = [];
                for (const entry of entries) {
                    const payload = entry.checklist_payload;
                    if (!payload?.checklists?.length) continue;
                    const matchIdx = payload.checklists.findIndex(c => String(c.template_id) === String(plan.id));
                    if (matchIdx === -1) continue;
                    const existing = payload.checklists[matchIdx];
                    const answerMap = {};
                    (existing.answers || []).forEach(a => { answerMap[String(a.pos)] = a; });
                    // Rebuild answers from new template items, preserving user input
                    const newAnswers = newItems.map(item => {
                        const old = answerMap[String(item.pos)] || {};
                        return {
                            pos: item.pos,
                            category: item.category || '',
                            description: item.description || '',
                            interval: item.interval || '',
                            checked: old.checked !== undefined ? old.checked : false,
                            comment: old.comment || '',
                            io: old.io || ''
                        };
                    });
                    const updatedPayload = { ...payload, checklists: [...payload.checklists] };
                    updatedPayload.checklists[matchIdx] = { ...existing, title: plan.title, answers: newAnswers };
                    updates.push({ id: entry.id, checklist_payload: updatedPayload });
                }
                if (!updates.length) return;
                await Promise.all(updates.map(u =>
                    supabaseClient.from('service_entries').update({ checklist_payload: u.checklist_payload }).eq('id', u.id)
                ));
            }

            window.deletePlan = async function(planId) {
                if (typeof window.canDelete === 'function' && !window.canDelete('Wartungsplänen')) return;
                if (!confirm('Diesen Wartungsplan wirklich löschen?')) return;
                let custom = await loadCustomTemplates();
                custom = custom.filter(t => t.id !== planId);
                await saveCustomTemplates(custom);
                await window.loadUvvWartungsplaene();
            };

            async function loadCustomTemplates() {
                try {
                    const { data } = await supabaseClient.from('app_settings').select('value')
                        .eq('key', 'custom_checklist_templates').maybeSingle();
                    return (data && Array.isArray(data.value)) ? data.value : [];
                } catch(e) { return []; }
            }

            async function saveCustomTemplates(templates) {
                try {
                    const { data: ex } = await supabaseClient.from('app_settings').select('key')
                        .eq('key', 'custom_checklist_templates').maybeSingle();
                    // .update()/.insert() werfen bei RLS-Verweigerung oder Spalten-/Schemafehlern
                    // KEINE Exception, sondern liefern nur { error: ... } zurück — das muss explizit
                    // geprüft werden, sonst "speichert" es scheinbar erfolgreich, ohne dass etwas
                    // in der Datenbank ankommt.
                    let result;
                    if (ex) {
                        result = await supabaseClient.from('app_settings').update({ value: templates }).eq('key', 'custom_checklist_templates');
                    } else {
                        result = await supabaseClient.from('app_settings').insert([{ key: 'custom_checklist_templates', value: templates }]);
                    }
                    if (result.error) {
                        window.showToast('Fehler beim Speichern der Pläne: ' + result.error.message);
                        return false;
                    }
                    return true;
                } catch(e) {
                    window.showToast('Fehler beim Speichern: ' + (e.message || e));
                    return false;
                }
            }

            // Group Color Persistence
            window.updateGroupColor = function (type, color) {
                localStorage.setItem(`cat_group_color_${type}`, color);
                applyGroupStyles(type, color);
                // Re-render categories to apply the new accent color to items
                renderCategoryList();
            };

            function applyGroupStyles(type, color) {
                const iconWrapper = document.getElementById(`icon-group-${type}`);
                if (iconWrapper) {
                    iconWrapper.style.color = color;
                }
                // Update the color input value to stay in sync
                const input = document.getElementById(`color-${type}`);
                if (input) input.value = color;
            }

            function loadGroupColors() {
                ['machine', 'service', 'contact'].forEach(type => {
                    const saved = localStorage.getItem(`cat_group_color_${type}`);
                    if (saved) {
                        applyGroupStyles(type, saved);
                    } else {
                        // Defaults
                        const defaults = { machine: '#e67e22', service: '#2980b9', contact: '#9b59b6' };
                        applyGroupStyles(type, defaults[type]);
                    }
                });
            }

            // Call on start
            loadGroupColors();
};
