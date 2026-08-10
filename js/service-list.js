// ==========================================================
// Serviceberichte-Liste: Kategorienfilter, Ansichtswechsel, Loeschen, Aktionen
// ==========================================================
// Ausgelagert aus index.html (vormals Zeilen 11521-11811).
// Wird in index.html an unveraenderter Stelle per <script src> geladen;
// die Reihenfolge der Skripte entspricht der fruaeheren Reihenfolge im
// Inline-Block und darf nicht vertauscht werden.
// ==========================================================
        // ==========================================
        // NEW SERVICE INTERACTION LOGIC
        // ==========================================
        let currentSelectedMachineForService = null;
        let allServiceEntries = [];
        let serviceViewMode = 'board';
        window.activeServiceCategoryFilters = ['all'];

        window.toggleServiceCategoryFilter = function (e) {
            if (e) e.stopPropagation();
            const menu = document.getElementById('service-category-filter-menu');
            if (menu) menu.classList.toggle('show');
        };

        window.selectServiceCategoryFilter = function (id, name) {
            const label = document.getElementById('service-current-category-name');
            if (id === 'all') {
                window.activeServiceCategoryFilters = ['all'];
                if (label) label.textContent = 'Kategorien';
            } else {
                const sid = id.toString();
                if (window.activeServiceCategoryFilters.includes('all')) {
                    window.activeServiceCategoryFilters = [sid];
                } else {
                    const index = window.activeServiceCategoryFilters.indexOf(sid);
                    if (index > -1) {
                        window.activeServiceCategoryFilters.splice(index, 1);
                    } else {
                        window.activeServiceCategoryFilters.push(sid);
                    }
                }

                if (window.activeServiceCategoryFilters.length === 0) {
                    window.activeServiceCategoryFilters = ['all'];
                }

                if (label) {
                    if (window.activeServiceCategoryFilters.includes('all')) {
                        label.textContent = 'Kategorien';
                    } else {
                        label.textContent = `${window.activeServiceCategoryFilters.length} gewählt`;
                    }
                }
            }

            renderServiceCategoryFilterList();
            renderServiceEntries();
        };

        function renderServiceCategoryFilterList() {
            const list = document.getElementById('service-category-filter-options');
            if (!list) return;

            list.innerHTML = '';
            const cats = (window.categoryList || []).filter(c => c.type === 'service');

            // Option: Alle
            const allLi = document.createElement('li');
            allLi.textContent = 'Alle Servicearten';
            if (window.activeServiceCategoryFilters.includes('all')) allLi.classList.add('selected');
            allLi.onclick = (e) => {
                e.stopPropagation();
                selectServiceCategoryFilter('all', 'Kategorien');
            };
            list.appendChild(allLi);

            cats.forEach(cat => {
                const li = document.createElement('li');
                const sid = cat.id.toString();
                const isSelected = window.activeServiceCategoryFilters.includes(sid);
                if (isSelected) li.classList.add('selected');

                li.innerHTML = `
                        <span>${cat.name}</span>
                        ${isSelected ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>' : ''}
                    `;
                li.onclick = (e) => {
                    e.stopPropagation();
                    selectServiceCategoryFilter(cat.id, cat.name);
                };
                list.appendChild(li);
            });
        }

        // Service Category Logic
        window.toggleServiceCategoryDropdown = function (e) {
            if (e) e.stopPropagation();
            const dropdown = document.getElementById('service-category-dropdown');
            if (dropdown) dropdown.classList.toggle('show');
        };

        let selectedServiceCategories = [];

        window.selectServiceCategory = function (id, name) {
            if (id === null) {
                selectedServiceCategories = [];
            } else {
                const sid = parseInt(id);
                const index = selectedServiceCategories.indexOf(sid);
                if (index > -1) {
                    selectedServiceCategories.splice(index, 1);
                } else {
                    selectedServiceCategories.push(sid);
                }
            }
            updateServiceCategoryUI();
        };

        function updateServiceCategoryUI() {
            const textEl = document.getElementById('service-category-text');
            if (textEl) {
                if (selectedServiceCategories.length === 0) {
                    textEl.textContent = 'Bitte wählen...';
                    textEl.style.color = 'rgba(255,255,255,0.4)';
                } else {
                    const cats = window.categoryList || [];
                    const names = selectedServiceCategories.map(id => {
                        const c = cats.find(cat => cat.id.toString() === id.toString());
                        return c ? c.name : '';
                    }).filter(n => n !== '');
                    textEl.textContent = names.join(', ');
                    textEl.style.color = 'white';
                }
            }
            const idInput = document.getElementById('service-category-id');
            if (idInput) idInput.value = JSON.stringify(selectedServiceCategories);

            renderServiceCategoryList();
        }

        window.renderServiceCategoryList = function () {
            const list = document.getElementById('service-category-list');
            if (!list) return;

            const categories = window.categoryList || [];
            const serviceCats = categories.filter(c => c.type === 'service');

            list.innerHTML = `<li class="suggestion-item" onclick="selectServiceCategory(null, 'Keine Kategorie')">Auswahl zurücksetzen</li>`;

            serviceCats.forEach(cat => {
                const sid = parseInt(cat.id);
                const isSelected = selectedServiceCategories.includes(sid);
                const li = document.createElement('li');
                li.className = 'suggestion-item';
                li.style.display = 'flex';
                li.style.alignItems = 'center';
                li.style.justifyContent = 'space-between';
                li.innerHTML = `
                        <span>${cat.name}</span>
                        ${isSelected ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary-green)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>' : ''}
                    `;
                li.onclick = (e) => {
                    e.stopPropagation();
                    selectServiceCategory(cat.id, cat.name);
                };
                list.appendChild(li);
            });
        };

        window.switchServicePage = function (targetView) {
            if (typeof window.switchView === 'function') {
                window.switchView(targetView);
            }
        };

        window.switchServiceView = function (view) {
            // Deprecated view mode handler, keep for safety
            if (typeof renderServiceEntries === 'function') renderServiceEntries();
        };

        window.deleteServiceEntry = async function (id) {
            if (window.activeUser && window.activeUser.permissions && window.activeUser.permissions.can_delete === false) {
                window.showToast('Keine Berechtigung zum Löschen von Serviceberichten.');
                return;
            }
            if (confirm('Möchten Sie diesen Servicebericht wirklich löschen?')) {
                try {
                    console.log('Deleting service entry:', id);
                    
                    // Fetch files from service entry first
                    const { data: entry, error: fetchError } = await supabaseClient
                        .from('service_entries')
                        .select('files')
                        .eq('id', id)
                        .single();

                    if (!fetchError && entry && entry.files && Array.isArray(entry.files)) {
                        console.log('Deleting associated service report files for ID:', id);
                        for (const file of entry.files) {
                            await deleteFileEntryStorage(file);
                        }
                    }

                    // Auch das verknüpfte PDF-Dokument unter "Dokumente" (documents-Tabelle,
                    // verknüpft über service_entry_id) inkl. Datei in Cloudflare R2 löschen,
                    // sonst bleibt es dort verwaist liegen.
                    const { data: linkedDocs, error: docsFetchError } = await supabaseClient
                        .from('documents')
                        .select('id, url')
                        .eq('service_entry_id', id);

                    if (!docsFetchError && linkedDocs && linkedDocs.length > 0) {
                        console.log('Deleting linked documents for service entry ID:', id);
                        for (const doc of linkedDocs) {
                            await deleteFileEntryStorage({ url: doc.url });
                        }
                        await supabaseClient
                            .from('documents')
                            .delete()
                            .eq('service_entry_id', id);
                    }

                    const { error } = await supabaseClient
                        .from('service_entries')
                        .delete()
                        .eq('id', id);

                    if (error) {
                        console.error('Supabase Error (deleteServiceEntry):', error);
                        throw error;
                    }
                    console.log('Service entry deleted successfully');

                    // Sofort aus allen lokalen/offline Caches entfernen, sonst kann der gelöschte
                    // Bericht aus dem Listen-Cache (Offline-Vorlade-Anzeige) wieder auftauchen.
                    allServiceEntries = (allServiceEntries || []).filter(e => e.id !== id);
                    window.serviceEntryList = allServiceEntries;
                    if (window.offlineService) {
                        try { await window.offlineService.deleteCachedEntry(id); } catch (e) { console.warn('Cache-Bereinigung fehlgeschlagen:', e); }
                    }

                    fetchServiceEntries();
                    if (typeof window.fetchDocuments === 'function') window.fetchDocuments();
                } catch (err) {
                    window.showToast('Fehler beim Löschen: ' + (err.message || JSON.stringify(err)));
                }
            }
        };

        window.openServiceActionsModal = function (event, machineId) {
            if (event) event.stopPropagation();
            currentSelectedMachineForService = machineId;
            const modal = document.getElementById('service-action-modal');
            if (modal) {
                modal.classList.remove('hidden');
                modal.style.display = 'flex';
                requestAnimationFrame(() => {
                    modal.classList.add('show');

                    // Set contextual button labels
                    const machine = (window.machineList || []).find(m => m.id === machineId);
                    const categories = window.categoryList || [];
                    const cat = machine ? categories.find(c => c.id === machine.category_id) : null;
                    const catSuffix = cat ? ` (${cat.name})` : '';

                    const intakeBtnText = document.querySelector('#action-btn-intake strong');
                    const acceptanceBtnText = document.querySelector('#action-btn-acceptance strong');
                    if (intakeBtnText) intakeBtnText.textContent = `Eingangsprotokoll${catSuffix}`;
                    if (acceptanceBtnText) acceptanceBtnText.textContent = `Abnahmeprotokoll${catSuffix}`;

                    // Expand both sections by default
                    const createSection = document.getElementById('create-section');
                    const viewSection = document.getElementById('view-section');
                    const createIcon = document.getElementById('create-section-icon');
                    const viewIcon = document.getElementById('view-section-icon');

                    if (createSection) {
                        createSection.style.maxHeight = '600px';
                        createSection.style.opacity = '1';
                        if (createIcon) createIcon.style.transform = 'rotate(0deg)';
                    }
                    if (viewSection) {
                        viewSection.style.maxHeight = '600px';
                        viewSection.style.opacity = '1';
                        if (viewIcon) viewIcon.style.transform = 'rotate(0deg)';
                    }
                });
            }
        };

        window.closeServiceActionModal = function () {
            const modal = document.getElementById('service-action-modal');
            if (modal) {
                modal.classList.remove('show');
                setTimeout(() => {
                    modal.classList.add('hidden');
                }, 300);
            }
        };
