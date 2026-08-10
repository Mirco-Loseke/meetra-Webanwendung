// ==========================================================
// Servicebericht-Auswahl aus Aufgaben und Vorgaengen (Picker)
// ==========================================================
// Ausgelagert aus index.html (vormals Zeilen 5117-5373).
// Wird in index.html an unveraenderter Stelle per <script src> geladen;
// die Reihenfolge der Skripte entspricht der fruaeheren Reihenfolge im
// Inline-Block und darf nicht vertauscht werden.
// ==========================================================
        // Init Search Listener
        document.addEventListener('DOMContentLoaded', () => {
            const searchInput = document.getElementById('service-search-input');
            if (searchInput) {
                searchInput.addEventListener('input', () => renderServiceEntries());
            }
            // NOTE: fetchServiceEntries on nav click is handled by switchView (see above)

            // Datum Techniker / Datum Kunde sollen dem oberen "Datum (von)" folgen, solange sie
            // noch auf dem zuletzt automatisch übernommenen Wert stehen (also nicht manuell auf ein
            // abweichendes Datum gesetzt wurden) — sonst blieb dort nach einer Änderung von oben
            // weiterhin das alte Datum stehen.
            const serviceDateStartEl = document.getElementById('service-date-start');
            const techSigDateEl = document.getElementById('service-tech-sig-date');
            const custSigDateEl = document.getElementById('service-customer-sig-date');
            if (serviceDateStartEl && techSigDateEl && custSigDateEl) {
                serviceDateStartEl.addEventListener('change', () => {
                    const newVal = serviceDateStartEl.value;
                    if (!newVal) return;
                    if (!techSigDateEl.value || techSigDateEl.value === window._serviceDateStartAutoVal) {
                        techSigDateEl.value = newVal;
                    }
                    if (!custSigDateEl.value || custSigDateEl.value === window._serviceDateStartAutoVal) {
                        custSigDateEl.value = newVal;
                    }
                    window._serviceDateStartAutoVal = newVal;
                });
            }
        });

        // Override submit to refresh list and perform subtask linkage
        window.activeSubtaskSource = null;
        let serviceberichtPickerSearchTimeout = null;
        let pickerActiveTaskMachineId = null;
        let serviceberichtPickerMode = 'subtask'; // 'subtask' | 'process'
        let serviceberichtPickerProcessPrefix = null;

        window.openServiceberichtFromTask = async function(machineId, actionType, taskId, subtaskIndex, subtaskId) {
            console.log('openServiceberichtFromTask:', { machineId, actionType, taskId, subtaskIndex, subtaskId });
            window.activeSubtaskSource = { taskId, subtaskIndex, subtaskId };

            if (actionType === 'servicebericht:new') {
                if (machineId && machineId !== 'null' && machineId !== 'undefined') {
                    window.currentSelectedMachineForService = parseInt(machineId);
                } else {
                    window.currentSelectedMachineForService = null;
                }
                window.openServiceberichtModal(null);
            } else {
                const parts = actionType.substring(15).split('|||');
                const reportId = parseInt(parts[0]);
                if (!isNaN(reportId)) {
                    window.openEditServicebericht(reportId);
                } else {
                    window.showToast('Ungültige Servicebericht-Verknüpfung.');
                }
            }
        };

        window.openServiceberichtPicker = async function() {
            serviceberichtPickerMode = 'subtask';
            serviceberichtPickerProcessPrefix = null;
            const machineSelect = document.getElementById('task-machine');
            pickerActiveTaskMachineId = machineSelect ? machineSelect.value : null;

            const modal = document.getElementById('servicebericht-picker-modal');
            if (modal) {
                modal.classList.remove('hidden');
                modal.style.display = 'flex';
                requestAnimationFrame(() => modal.classList.add('show'));
            }

            const newOption = document.getElementById('servicebericht-picker-new-option');
            if (newOption) newOption.style.display = '';

            const searchInput = document.getElementById('servicebericht-picker-search');
            if (searchInput) searchInput.value = '';

            await window.filterServiceberichtPickerContent();
        };

        // Oeffnet denselben Picker im "Vorgang verknuepfen"-Modus (keine Subtask-Aktion, sondern
        // Setzen von linked_service_report_id auf dem gerade bearbeiteten Vorgang).
        window.openProcessServiceberichtPicker = async function(prefix) {
            serviceberichtPickerMode = 'process';
            serviceberichtPickerProcessPrefix = prefix;
            const machineHidden = document.getElementById(`${prefix}-machine-select`);
            pickerActiveTaskMachineId = machineHidden ? machineHidden.value : null;

            const modal = document.getElementById('servicebericht-picker-modal');
            if (modal) {
                modal.classList.remove('hidden');
                modal.style.display = 'flex';
                requestAnimationFrame(() => modal.classList.add('show'));
            }

            const newOption = document.getElementById('servicebericht-picker-new-option');
            if (newOption) newOption.style.display = 'none';

            const searchInput = document.getElementById('servicebericht-picker-search');
            if (searchInput) searchInput.value = '';

            await window.filterServiceberichtPickerContent();
        };

        window.closeServiceberichtPicker = function() {
            const modal = document.getElementById('servicebericht-picker-modal');
            if (modal) {
                modal.classList.remove('show');
                setTimeout(() => {
                    modal.classList.add('hidden');
                    modal.style.display = 'none';
                }, 300);
            }
        };

        window.filterServiceberichtPickerContent = async function() {
            const list = document.getElementById('servicebericht-picker-list');
            if (list) {
                list.innerHTML = '<div style="padding: 1rem; color: rgba(255,255,255,0.4); text-align: center;">Lade Serviceberichte...</div>';
            }

            try {
                const searchVal = (document.getElementById('servicebericht-picker-search')?.value || '').trim().toLowerCase();

                let query = supabaseClient.from('service_entries').select('id, title, date, is_finalized, machines(manufacturer, name, serial)');

                if (pickerActiveTaskMachineId) {
                    query = query.eq('machine_id', parseInt(pickerActiveTaskMachineId));
                }
                if (serviceberichtPickerMode === 'process') {
                    query = query.eq('is_finalized', false);
                }

                const { data, error } = await query.order('date', { ascending: false }).limit(50);
                if (error) throw error;

                let entries = data || [];

                // Werkstattaufenthalte ausschließen
                entries = entries.filter(e => {
                    const title = (e.title || '').toLowerCase();
                    return !title.includes('werkstattaufenthalt');
                });

                if (searchVal) {
                    entries = entries.filter(e => {
                        const mLabel = e.machines ? `${e.machines.manufacturer} ${e.machines.name} ${e.machines.serial || ''}` : '';
                        return (e.title && e.title.toLowerCase().includes(searchVal)) || 
                               (mLabel.toLowerCase().includes(searchVal)) ||
                               (e.date && e.date.includes(searchVal));
                    });
                }

                if (entries.length === 0) {
                    if (list) {
                        list.innerHTML = '<div style="padding: 1rem; color: rgba(255,255,255,0.4); text-align: center;">Keine passenden Serviceberichte gefunden.</div>';
                    }
                    return;
                }

                let html = '';
                entries.forEach(e => {
                    const mText = e.machines ? `${e.machines.manufacturer} ${e.machines.name} (${e.machines.serial || 'Ohne S/N'})` : 'Keine Maschine';
                    const dateStr = new Date(e.date).toLocaleDateString('de-DE');
                    html += `
                        <div onclick="window.selectPickerServicebericht('${e.id}', '${e.title.replace(/'/g, "\\'")}', '${e.date || ''}')"
                             style="display: flex; align-items: center; gap: 15px; padding: 12px 18px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; cursor: pointer; transition: all 0.2s;"
                             onmouseover="this.style.background='rgba(255,255,255,0.08)'; this.style.borderColor='rgba(255,255,255,0.15)';"
                             onmouseout="this.style.background='rgba(255,255,255,0.03)'; this.style.borderColor='rgba(255,255,255,0.08)';">
                            <span style="font-size: 1.5rem;">📄</span>
                            <div style="text-align: left; flex: 1;">
                                <span style="color: #fff; font-size: 0.95rem; font-weight: 700; display: block;">${e.title}</span>
                                <span style="color: rgba(255,255,255,0.4); font-size: 0.8rem; display: block; margin-top: 2px;">${mText} | ${dateStr}</span>
                            </div>
                        </div>
                    `;
                });

                if (list) list.innerHTML = html;
            } catch (err) {
                console.error('Error fetching service reports for picker:', err);
                if (list) {
                    list.innerHTML = '<div style="padding: 1rem; color: #ef4444; text-align: center;">Fehler beim Laden.</div>';
                }
            }
        };

        window.selectPickerServicebericht = async function(id, title, date) {
            if (serviceberichtPickerMode === 'process') {
                if (id === 'new') { window.closeServiceberichtPicker(); return; }
                if (typeof window.selectProcessServiceReport === 'function') {
                    window.selectProcessServiceReport(id, title, date);
                }
                window.closeServiceberichtPicker();
                return;
            }
            const actionValue = 'servicebericht:' + id + '|||' + title;
            if (typeof window.applySubtaskAction === 'function') {
                await window.applySubtaskAction(actionValue);
            }
            window.closeServiceberichtPicker();
        };

        const originalSubmitServicebericht = window.submitServicebericht;
        window.submitServicebericht = async function () {
            try {
                await originalSubmitServicebericht();
                
                if (typeof fetchServiceEntries === 'function') fetchServiceEntries();

                if (window.activeSubtaskSource) {
                    const { taskId, subtaskIndex, subtaskId } = window.activeSubtaskSource;
                    const newReportId = currentEditingServiceId;
                    const reportTitle = document.getElementById('service-report-title')?.value || 'Servicebericht';

                    if (newReportId) {
                        const newActionVal = `servicebericht:${newReportId}|||${reportTitle}`;
                        console.log('Linking new Servicebericht to subtask:', { taskId, subtaskIndex, subtaskId, newActionVal });

                        const { data: taskData, error: taskFetchErr } = await supabaseClient
                            .from('tasks')
                            .select('subtasks')
                            .eq('id', taskId)
                            .single();

                        if (!taskFetchErr && taskData && taskData.subtasks) {
                            const subtasks = [...taskData.subtasks];
                            if (subtasks[subtaskIndex]) {
                                subtasks[subtaskIndex].action_type = newActionVal;
                                
                                await supabaseClient
                                    .from('tasks')
                                    .update({ subtasks })
                                    .eq('id', taskId);
                            }
                        }

                        if (subtaskId && subtaskId !== 'null') {
                            await supabaseClient
                                .from('subtasks')
                                .update({ action_type: newActionVal })
                                .eq('id', subtaskId);
                        }

                        if (typeof fetchTasks === 'function') {
                            await fetchTasks();
                        }
                    }
                    window.activeSubtaskSource = null;
                }
            } catch (e) {
                console.error(e);
            }
        };
