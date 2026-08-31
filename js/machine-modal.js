// ==========================================================
// Maschinen-Modal: Dateien/Fotos, verknuepfte Maschinen, Zusatzausruestung, Upload
// ==========================================================
// Ausgelagert aus index.html (vormals Zeilen 9759-10487).
// Wird in index.html an unveraenderter Stelle per <script src> geladen;
// die Reihenfolge der Skripte entspricht der fruaeheren Reihenfolge im
// Inline-Block und darf nicht vertauscht werden.
// ==========================================================
        // Drag & Drop Logic state
        let machineFiles = [];
        let existingMachineFiles = [];
        let machineMainImage = null;
        let removedMachineFiles = [];
        window.machineRelatedIds = [];
        window.machineAdditionalEquipment = [];

        function parseMachineFilesMeta(files, key, defaultVal) {
            const entry = (files || []).find(f => f.type === 'meta' && f.key === key);
            if (!entry || entry.property == null || entry.property === '') return defaultVal;
            try {
                return JSON.parse(entry.property);
            } catch (e) {
                return defaultVal;
            }
        }

        window.syncBidirectionalLinks = syncBidirectionalLinks;
        async function syncBidirectionalLinks(machineId, newRelatedIds, prevRelatedIds) {
            const machineIdStr = String(machineId);
            const newSet = new Set(newRelatedIds.map(String));
            const prevSet = new Set(prevRelatedIds.map(String));

            const added = [...newSet].filter(id => !prevSet.has(id));
            const removed = [...prevSet].filter(id => !newSet.has(id));
            if (added.length === 0 && removed.length === 0) return;

            for (const otherId of [...added, ...removed]) {
                const isAdded = added.includes(otherId);
                try {
                    const { data: otherMachine, error } = await supabaseClient
                        .from('machines')
                        .select('id, files')
                        .eq('id', otherId)
                        .maybeSingle();
                    if (error || !otherMachine) continue;

                    const otherFiles = Array.isArray(otherMachine.files) ? [...otherMachine.files] : [];
                    const metaIdx = otherFiles.findIndex(f => f && f.type === 'meta' && f.key === 'related_machine_ids');

                    let otherRelated = [];
                    if (metaIdx >= 0) {
                        try { otherRelated = JSON.parse(otherFiles[metaIdx].property || '[]').map(String); } catch(e) {}
                        otherFiles.splice(metaIdx, 1);
                    }

                    if (isAdded) {
                        if (!otherRelated.includes(machineIdStr)) otherRelated.push(machineIdStr);
                    } else {
                        otherRelated = otherRelated.filter(id => id !== machineIdStr);
                    }

                    if (otherRelated.length > 0) {
                        otherFiles.push({ type: 'meta', key: 'related_machine_ids', property: JSON.stringify(otherRelated) });
                    }

                    await supabaseClient.from('machines').update({ files: otherFiles }).eq('id', otherId);
                } catch(e) {
                    console.error('Bidirektionale Sync fehlgeschlagen für Maschine', otherId, e);
                }
            }
        }

        // Trägt die Ansprechpartner dieser Maschine zusätzlich bei allen verknüpften Maschinen ein,
        // damit sie dort ebenfalls angezeigt werden und später z.B. bei Serviceberichten auswählbar sind.
        // Bereits vorhandene Ansprechpartner (gleicher Name + Telefon) werden nicht doppelt eingetragen.
        window.syncContactPersonsToRelatedMachines = syncContactPersonsToRelatedMachines;
        async function syncContactPersonsToRelatedMachines(machineId, relatedIds, contactPersons) {
            if (!relatedIds.length || !contactPersons.length) return;

            for (const otherId of relatedIds) {
                try {
                    const { data: otherMachine, error } = await supabaseClient
                        .from('machines')
                        .select('id, contact_persons')
                        .eq('id', otherId)
                        .maybeSingle();
                    if (error || !otherMachine) continue;

                    const existing = Array.isArray(otherMachine.contact_persons) ? [...otherMachine.contact_persons] : [];
                    let changed = false;

                    contactPersons.forEach(cp => {
                        const alreadyThere = existing.some(e =>
                            (e.name || '').trim().toLowerCase() === cp.name.trim().toLowerCase() &&
                            (e.phone || '').trim() === (cp.phone || '').trim()
                        );
                        if (!alreadyThere) {
                            existing.push(cp);
                            changed = true;
                        }
                    });

                    if (changed) {
                        await supabaseClient.from('machines').update({ contact_persons: existing }).eq('id', otherId);
                    }
                } catch (e) {
                    console.error('Ansprechpartner-Sync fehlgeschlagen für Maschine', otherId, e);
                }
            }
        }

        function applyMachineExtrasMeta(files) {
            const equipment = (typeof window.collectMachineEquipmentFromUI === 'function')
                ? window.collectMachineEquipmentFromUI()
                : (window.machineAdditionalEquipment || []);
            const related = (window.machineRelatedIds || [])
                .map(id => String(id))
                .filter(id => id && id !== 'null' && id !== 'undefined');
            const cleanedEquipment = equipment
                .map(eq => ({
                    serial: (eq.serial || '').trim(),
                    type: (eq.type || '').trim(),
                    designation: (eq.designation || '').trim(),
                    year: (eq.year || '').trim()
                }))
                .filter(eq => eq.serial || eq.type || eq.designation);

            let result = (files || []).filter(f => !(f.type === 'meta' && ['related_machine_ids', 'additional_equipment'].includes(f.key)));

            if (related.length > 0) {
                result.push({ type: 'meta', key: 'related_machine_ids', property: JSON.stringify(related) });
            }
            if (cleanedEquipment.length > 0) {
                result.push({ type: 'meta', key: 'additional_equipment', property: JSON.stringify(cleanedEquipment) });
            }
            return result;
        }

        window.loadMachineExtrasFromEditData = function (editData = null) {
            window.machineRelatedIds = [];
            window.machineAdditionalEquipment = [];

            if (editData) {
                if (Array.isArray(editData.related_machine_ids)) {
                    window.machineRelatedIds = editData.related_machine_ids.map(String);
                } else if (Array.isArray(editData.files)) {
                    const parsedRelated = parseMachineFilesMeta(editData.files, 'related_machine_ids', []);
                    window.machineRelatedIds = Array.isArray(parsedRelated) ? parsedRelated.map(String) : [];
                }

                if (Array.isArray(editData.additional_equipment)) {
                    window.machineAdditionalEquipment = editData.additional_equipment.map(eq => ({
                        serial: eq.serial || '',
                        type: eq.type || '',
                        designation: eq.designation || eq.name || '',
                        year: eq.year || ''
                    }));
                } else if (Array.isArray(editData.files)) {
                    const parsedEquipment = parseMachineFilesMeta(editData.files, 'additional_equipment', []);
                    window.machineAdditionalEquipment = Array.isArray(parsedEquipment)
                        ? parsedEquipment.map(eq => ({
                            serial: eq.serial || '',
                            type: eq.type || '',
                            designation: eq.designation || eq.name || '',
                            year: eq.year || ''
                        }))
                        : [];
                }
            }

            // Snapshot der vorherigen Verknüpfungen für bidirektionale Sync beim Speichern
            window.machineRelatedIdsBefore = [...window.machineRelatedIds];

            if (typeof currentEditingId !== 'undefined' && currentEditingId) {
                window.machineRelatedIds = window.machineRelatedIds.filter(id => String(id) !== String(currentEditingId));
            }

            const searchInput = document.getElementById('machine-related-search');
            if (searchInput) searchInput.value = '';
            window.closeMachineRelatedSuggestions();

            window.renderMachineRelatedChips();
            window.renderMachineEquipmentRows();
        };

        window.renderMachineRelatedChips = function () {
            const container = document.getElementById('machine-related-selected');
            if (!container) return;

            const ids = window.machineRelatedIds || [];
            if (!ids.length) {
                container.innerHTML = '';
                return;
            }

            container.innerHTML = ids.map(id => {
                const label = (typeof window.getMachineName === 'function')
                    ? window.getMachineName(id)
                    : `Maschine #${id}`;
                const safeLabel = label.replace(/</g, '&lt;').replace(/>/g, '&gt;');
                return `<div style="display:flex;align-items:center;justify-content:space-between;padding:7px 12px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:9px;margin-bottom:5px;">
                    <span style="font-weight:600;color:var(--color-primary-green);font-size:0.88rem;">${safeLabel}</span>
                    <button type="button" onclick="window.removeRelatedMachineFromModal('${id}')" title="Entfernen" style="background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.4);color:#ef4444;border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-size:1.1rem;line-height:1;cursor:pointer;padding:0;flex-shrink:0;">−</button>
                </div>`;
            }).join('');
        };

        window.positionMachineRelatedSuggestions = function () {
            const input = document.getElementById('machine-related-search');
            const box = document.getElementById('machine-related-suggestions');
            if (!input || !box || box.style.display === 'none') return;

            // Move to body to escape modal stacking context / overflow clipping
            if (box.parentElement !== document.body) {
                document.body.appendChild(box);
            }

            const rect = input.getBoundingClientRect();
            const maxHeight = Math.min(280, Math.max(120, window.innerHeight - rect.bottom - 16));

            box.style.position = 'fixed';
            box.style.top = `${rect.bottom + 4}px`;
            box.style.left = `${rect.left}px`;
            box.style.width = `${rect.width}px`;
            box.style.maxHeight = `${maxHeight}px`;
            box.style.overflowY = 'auto';
            box.style.zIndex = '999999';
        };

        window.closeMachineRelatedSuggestions = function () {
            const box = document.getElementById('machine-related-suggestions');
            const group = document.querySelector('.machine-related-search-group');
            if (box) {
                box.style.display = 'none';
                box.innerHTML = '';
            }
            if (group) group.classList.remove('is-dropdown-open');
        };

        window.searchRelatedMachinesForModal = function () {
            const input = document.getElementById('machine-related-search');
            const box = document.getElementById('machine-related-suggestions');
            const group = document.querySelector('.machine-related-search-group');
            if (!input || !box) return;

            const q = input.value.trim().toLowerCase();
            if (!q) {
                window.closeMachineRelatedSuggestions();
                return;
            }

            const excludeId = (typeof currentEditingId !== 'undefined') ? currentEditingId : null;
            const selected = new Set((window.machineRelatedIds || []).map(String));

            const machines = (window.machineList || []).filter(m => {
                if (excludeId && String(m.id) === String(excludeId)) return false;
                if (selected.has(String(m.id))) return false;
                const label = (typeof window.getMachineName === 'function')
                    ? window.getMachineName(m.id)
                    : `${m.manufacturer || ''} ${m.name || ''}`.trim();
                const serial = (m.serial || m.serial_number || '').toString().toLowerCase();
                const haystack = `${label} ${serial}`.toLowerCase();
                return haystack.includes(q);
            }).slice(0, 10);

            if (!machines.length) {
                box.innerHTML = '<div class="suggestion-item" style="color: rgba(255,255,255,0.45);">Keine Maschinen gefunden</div>';
            } else {
                box.innerHTML = machines.map(m => {
                    const label = (typeof window.getMachineName === 'function')
                        ? window.getMachineName(m.id)
                        : `${m.manufacturer || ''} ${m.name || ''}`.trim();
                    const safeLabel = label.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, "\\'");
                    return `<div class="suggestion-item" onclick="window.addRelatedMachineToModal('${m.id}')">${safeLabel}</div>`;
                }).join('');
            }
            box.style.display = 'block';
            if (group) group.classList.add('is-dropdown-open');
            window.positionMachineRelatedSuggestions();
        };

        window.addRelatedMachineToModal = function (machineId) {
            const id = String(machineId);
            if (!window.machineRelatedIds) window.machineRelatedIds = [];
            if (!window.machineRelatedIds.includes(id)) {
                window.machineRelatedIds.push(id);
            }
            const input = document.getElementById('machine-related-search');
            if (input) input.value = '';
            window.closeMachineRelatedSuggestions();
            window.renderMachineRelatedChips();
        };

        window.removeRelatedMachineFromModal = function (machineId) {
            const id = String(machineId);
            window.machineRelatedIds = (window.machineRelatedIds || []).filter(mid => String(mid) !== id);
            window.renderMachineRelatedChips();
        };

        window.renderMachineEquipmentRows = function () {
            const container = document.getElementById('machine-equipment-list');
            if (!container) return;

            const rows = window.machineAdditionalEquipment || [];
            if (!rows.length) {
                container.innerHTML = '';
                return;
            }

            container.innerHTML = rows.map((eq, index) => window.buildMachineEquipmentRowHtml(eq, index)).join('');
        };

        window.buildMachineEquipmentRowHtml = function (eq = {}, index = 0) {
            const esc = (val) => String(val || '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
            const name = esc(eq.designation) || 'Unbenannt';
            const sub = [eq.type && `Typ: ${esc(eq.type)}`, eq.serial && `SN: ${esc(eq.serial)}`, eq.year && `BJ: ${esc(eq.year)}`].filter(Boolean).join(' · ');
            return `<div class="machine-equipment-entry" data-index="${index}" style="display:flex;align-items:center;justify-content:space-between;padding:7px 12px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:9px;margin-bottom:5px;">
                <div>
                    <span style="font-weight:600;color:#fff;font-size:0.88rem;">${name}</span>
                    ${sub ? `<span style="color:rgba(255,255,255,0.8);font-size:0.78rem;margin-left:8px;">${sub}</span>` : ''}
                </div>
                <button type="button" onclick="window.removeMachineEquipmentRow(${index})" title="Entfernen" style="background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.4);color:#ef4444;border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-size:1.1rem;line-height:1;cursor:pointer;padding:0;flex-shrink:0;">−</button>
            </div>`;
        };

        window.addMachineEquipmentRow = function (data = null) {
            window.machineAdditionalEquipment = window.collectMachineEquipmentFromUI();
            window.machineAdditionalEquipment.push(data || { serial: '', type: '', designation: '', year: '' });
            window.renderMachineEquipmentRows();
        };

        window.collectMachineEquipmentFromUI = function () {
            return window.machineAdditionalEquipment || [];
        };

        window.removeMachineEquipmentRow = function (index) {
            window.machineAdditionalEquipment = (window.machineAdditionalEquipment || []).filter((_, i) => i !== index);
            window.renderMachineEquipmentRows();
        };

        window.showEquipmentAddForm = function () {
            const form = document.getElementById('machine-equipment-add-form');
            const btn = document.getElementById('btn-add-equipment');
            if (form) form.style.display = 'block';
            if (btn) btn.style.display = 'none';
            const first = document.getElementById('equip-add-designation');
            if (first) first.focus();
        };

        window.cancelAddEquipmentRow = function () {
            const form = document.getElementById('machine-equipment-add-form');
            const btn = document.getElementById('btn-add-equipment');
            if (form) {
                form.style.display = 'none';
                ['equip-add-designation','equip-add-type','equip-add-serial','equip-add-year'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.value = '';
                });
            }
            if (btn) btn.style.display = '';
        };

        window.confirmAddEquipmentRow = function () {
            const designation = document.getElementById('equip-add-designation')?.value.trim() || '';
            const type = document.getElementById('equip-add-type')?.value.trim() || '';
            const serial = document.getElementById('equip-add-serial')?.value.trim() || '';
            const year = document.getElementById('equip-add-year')?.value.trim() || '';
            if (!designation) { window.showToast('Bitte Bezeichnung eingeben.'); return; }
            if (!Array.isArray(window.machineAdditionalEquipment)) window.machineAdditionalEquipment = [];
            window.machineAdditionalEquipment.push({ designation, type, serial, year });
            window.renderMachineEquipmentRows();
            window.cancelAddEquipmentRow();
        };

        // Zusatzausrüstung aus Katalog (Mehrfachauswahl) — Vorschläge kommen aus den
        // Kategorien vom Typ "equipment" (Einstellungen), unabhängig von der freien Eingabe oben.
        window.machineEquipmentCatalogIds = [];

        function populateMachineEquipmentCatalogDropdown() {
            const list = document.getElementById('machine-equipment-catalog-options');
            if (!list) return;
            const allEquipment = (typeof categoryList !== 'undefined' && Array.isArray(categoryList))
                ? categoryList.filter(c => c.type === 'equipment')
                : [];
            list.innerHTML = '';
            if (!allEquipment.length) {
                list.innerHTML = '<li style="padding:9px 14px; color:rgba(255,255,255,0.4); font-size:0.85rem; cursor:default;">Keine Zusatzausrüstung angelegt</li>';
            } else {
                allEquipment.forEach(cat => {
                    const li = document.createElement('li');
                    li.dataset.value = String(cat.id);
                    li.textContent = cat.name;
                    if (window.machineEquipmentCatalogIds.map(String).includes(String(cat.id))) li.classList.add('selected');
                    li.addEventListener('click', e => {
                        e.stopPropagation();
                        window.toggleMachineEquipmentCatalogItem(cat.id);
                    });
                    list.appendChild(li);
                });
            }
            updateMachineEquipmentCatalogLabel();
        }

        function updateMachineEquipmentCatalogLabel() {
            const label = document.getElementById('machine-equipment-catalog-label');
            if (!label) return;
            const allEquipment = (typeof categoryList !== 'undefined' && Array.isArray(categoryList)) ? categoryList : [];
            const names = window.machineEquipmentCatalogIds
                .map(id => allEquipment.find(c => String(c.id) === String(id)))
                .filter(Boolean)
                .map(c => c.name);
            label.textContent = names.length ? names.join(', ') : 'Zusatzausrüstung wählen...';
        }

        window.toggleMachineEquipmentCatalogItem = function (id) {
            const idStr = String(id);
            if (window.machineEquipmentCatalogIds.map(String).includes(idStr)) {
                window.machineEquipmentCatalogIds = window.machineEquipmentCatalogIds.filter(i => String(i) !== idStr);
            } else {
                window.machineEquipmentCatalogIds.push(id);
            }
            populateMachineEquipmentCatalogDropdown();
            // Die Liste wurde neu gebaut, die Höhe kann sich geändert haben.
            if (typeof katalogPositionieren === 'function') katalogPositionieren();
        };

        // ---------------------------------------------------------------
        // Auf- und Zuklappen des Katalog-Menüs
        // ---------------------------------------------------------------
        // Das Menü liegt per position:absolute im Formularbereich des Modals.
        // Der scrollt (overflow-y:auto) und schnitt das aufgeklappte Menü ab —
        // je weiter unten das Feld steht, desto mehr; ganz unten war davon fast
        // nichts mehr zu sehen. Gleiche Lösung wie in js/dropdown-position.js:
        // beim Öffnen auf position:fixed umstellen und am Feld ausrichten,
        // beim Schließen zurücksetzen.
        //
        // Dazu fehlten zwei Selbstverständlichkeiten: ein Klick daneben schloss
        // es nicht, und ein Klick INS Menü (Rand, Bildlaufleiste) landete am
        // onclick des Rahmens und klappte es wieder zu.
        const KATALOG_ABSTAND = 8;
        const KATALOG_RAND = 12;

        function katalogMenu() {
            const dd = document.getElementById('machine-equipment-catalog-dropdown');
            return dd ? dd.querySelector('.custom-filter-menu') : null;
        }

        function katalogPositionieren() {
            const dd = document.getElementById('machine-equipment-catalog-dropdown');
            const menu = katalogMenu();
            if (!dd || !menu) return;

            const gescrollt = menu.scrollTop;
            const setz = (p, v) => menu.style.setProperty(p, v, 'important');

            // Zurücksetzen, damit die natürliche Höhe messbar ist
            menu.style.removeProperty('max-height');
            const hoehe = Math.min(menu.offsetHeight || 250, 250);

            const t0 = dd.getBoundingClientRect();
            const platzUnten = window.innerHeight - t0.bottom - KATALOG_ABSTAND - KATALOG_RAND;
            const platzOben = t0.top - KATALOG_ABSTAND - KATALOG_RAND;
            const nachOben = platzUnten < hoehe && platzOben > platzUnten;
            const maxHoehe = Math.min(250, Math.max(120, nachOben ? platzOben : platzUnten));

            setz('position', 'fixed');
            setz('min-width', '0');
            setz('right', 'auto');
            setz('bottom', 'auto');
            setz('margin', '0');
            setz('max-height', maxHoehe + 'px');

            // Das Modal hat backdrop-filter und ist dadurch SELBST der
            // Bezugsrahmen für position:fixed — Bildschirmkoordinaten landen
            // deshalb versetzt (das Menü stand oben rechts statt unter dem Feld).
            // Wie in js/dropdown-position.js wird der Versatz gemessen und
            // ausgeglichen, statt den Bezugsrahmen zu suchen. Zwei Durchläufe,
            // weil das Setzen der Breite einen Scrollbalken auslösen kann und
            // sich das Feld dadurch nochmals verschiebt.
            let versatzX = 0, versatzY = 0;
            for (let i = 0; i < 2; i++) {
                const feld = dd.getBoundingClientRect();
                setz('width', feld.width + 'px');

                const zielLinks = feld.left;
                const zielOben = nachOben
                    ? feld.top - menu.offsetHeight - KATALOG_ABSTAND
                    : feld.bottom + KATALOG_ABSTAND;

                setz('left', (zielLinks + versatzX) + 'px');
                setz('top', (zielOben + versatzY) + 'px');

                const ist = menu.getBoundingClientRect();
                const dx = zielLinks - ist.left;
                const dy = zielOben - ist.top;
                if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) break;
                versatzX += dx;
                versatzY += dy;
            }

            if (gescrollt) menu.scrollTop = gescrollt;
        }

        window.closeMachineEquipmentCatalogDropdown = function () {
            const dd = document.getElementById('machine-equipment-catalog-dropdown');
            if (!dd || !dd.classList.contains('active')) return;
            dd.classList.remove('active');
            dd.closest('.form-group')?.classList.remove('has-active-dropdown');
            const menu = katalogMenu();
            if (menu) {
                // Alles zurücknehmen, sonst hängt das Menü beim nächsten Öffnen
                // noch an der alten Stelle, bevor neu gerechnet wird.
                ['position', 'left', 'top', 'bottom', 'width', 'min-width', 'right', 'margin', 'max-height']
                    .forEach(p => menu.style.removeProperty(p));
            }
        };

        window.toggleMachineEquipmentCatalogDropdown = function (event) {
            const dropdown = document.getElementById('machine-equipment-catalog-dropdown');
            if (!dropdown) return;

            // Klick innerhalb des offenen Menüs: nichts tun. Die Einträge haben
            // ihren eigenen Handler; alles andere (Rand, Bildlaufleiste) darf
            // das Menü nicht zuklappen.
            if (event && event.target.closest('.custom-filter-menu')) {
                event.stopPropagation();
                return;
            }
            if (event) event.stopPropagation();

            const isOpen = dropdown.classList.contains('active');

            document.querySelectorAll('.custom-filter-dropdown.active').forEach(d => {
                d.classList.remove('active');
                d.closest('.form-group')?.classList.remove('has-active-dropdown');
            });

            if (isOpen) {
                window.closeMachineEquipmentCatalogDropdown();
                return;
            }

            dropdown.classList.add('active');
            dropdown.closest('.form-group')?.classList.add('has-active-dropdown');
            katalogPositionieren();
        };

        // Klick daneben, Escape, Scrollen und Größenänderung schließen bzw.
        // richten das Menü neu aus.
        document.addEventListener('click', (e) => {
            const dd = document.getElementById('machine-equipment-catalog-dropdown');
            if (!dd || !dd.classList.contains('active')) return;
            if (e.target.closest('#machine-equipment-catalog-dropdown')) return;
            window.closeMachineEquipmentCatalogDropdown();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') window.closeMachineEquipmentCatalogDropdown();
        });

        window.addEventListener('resize', () => {
            const dd = document.getElementById('machine-equipment-catalog-dropdown');
            if (dd && dd.classList.contains('active')) katalogPositionieren();
        });

        // Beim Scrollen im Modal mitwandern (capture, weil der Formularbereich
        // scrollt, nicht das Fenster).
        document.addEventListener('scroll', () => {
            const dd = document.getElementById('machine-equipment-catalog-dropdown');
            if (dd && dd.classList.contains('active')) katalogPositionieren();
        }, true);

        async function deleteR2FileHelper(url) {
            if (!url) return;
            const r2Url = window.R2_PUBLIC_URL || 'https://pub-28aab7dd73f540f38b6358d78f889a27.r2.dev';
            const prefix = r2Url + '/';
            let filePath = null;

            if (url.startsWith(prefix)) {
                filePath = url.substring(prefix.length);
            } else {
                try {
                    const parsed = new URL(url);
                    if (parsed.hostname.includes('r2.dev') || parsed.hostname.includes('cloudflarestorage.com')) {
                        filePath = decodeURIComponent(parsed.pathname.substring(1));
                    }
                } catch (parseErr) {
                    console.error('Failed to parse file URL for deletion:', url, parseErr);
                }
            }

            if (filePath) {
                console.log('Deleting file from Cloudflare R2:', filePath);
                try {
                    await window.FileUploadService.deleteFile(filePath, {
                        bucket: 'dateien',
                        provider: 'cloudflare-r2'
                    });
                } catch (fileErr) {
                    console.error('Failed to delete file from R2:', fileErr, 'path:', filePath);
                }
            }
        }

        async function deleteFileEntryStorage(file) {
            if (typeof file === 'string') {
                await deleteR2FileHelper(file);
            } else if (file && typeof file === 'object') {
                if (file.url) {
                    await deleteR2FileHelper(file.url);
                }
                if (file.thumbnail_url) {
                    await deleteR2FileHelper(file.thumbnail_url);
                }
            }
        }

        /**
         * Derives a thumbnail URL from a full image URL.
         * Convention: thumbnails are stored in a /thumbs/ subfolder within /Vorschaubilder/.
         * Falls back to the original URL if it doesn't match the convention.
         */
        window.getMachineThumbnailUrl = function(imageUrl) {
            if (!imageUrl) return null;
            // Only R2 URLs with /Vorschaubilder/ get thumbnail treatment
            if (imageUrl.includes('/Vorschaubilder/') && !imageUrl.includes('/Vorschaubilder/thumbs/')) {
                return imageUrl.replace('/Vorschaubilder/', '/Vorschaubilder/thumbs/');
            }
            return imageUrl; // Fallback: use original
        };

        async function handleMachineFiles(files) {
            // Schon ausgewaehlte oder bereits gespeicherte Dateien nicht erneut
            // aufnehmen — sonst landen sie ein zweites Mal in R2 und in der Liste.
            const vorhanden = machineFiles.concat(
                (existingMachineFiles || [])
                    .filter(f => f && f.type !== 'meta')
                    .map(f => (typeof f === 'string' ? { url: f } : f))
            );
            const { neu, doppelt } = await window.PhotoDedupe.pruefeAuswahl(files, vorhanden);
            window.PhotoDedupe.meldeDoppelte(doppelt);
            neu.forEach(eintrag => machineFiles.push(eintrag.file));
            renderMachineFilePreviews();
        }

        function renderMachineFilePreviews() {
            const previewGrid = document.getElementById('machine-file-previews');
            const imageSlot = document.getElementById('machine-image-slot');
            if (previewGrid) previewGrid.innerHTML = '';

            // Sync with Slot (Show machineMainImage if set, otherwise first available image)
            if (imageSlot) {
                let previewUrl = machineMainImage;

                // If no explicit main image is set, try to find a fallback
                if (!previewUrl) {
                    const firstExisting = existingMachineFiles.find(f => (f.type && f.type.startsWith('image/')) || (f.url && f.url.match(/\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i)));
                    const firstNew = machineFiles.find(f => (f.type && f.type.startsWith('image/')) || (f.name && f.name.match(/\.(jpg|jpeg|png|gif|webp)$/i)));

                    if (firstExisting) previewUrl = firstExisting.url;
                    else if (firstNew) {
                        try {
                            previewUrl = URL.createObjectURL(firstNew);
                        } catch (e) {
                            console.warn('Failed to create object URL for preview', e);
                        }
                    }
                }

                if (previewUrl) {
                    imageSlot.innerHTML = `<img src="${previewUrl}" alt="Maschinenbild" style="width: 100%; height: 100%; object-fit: contain; background: rgba(0,0,0,0.2); border-radius: 12px;">`;
                } else {
                    imageSlot.innerHTML = `
                        <div class="placeholder-content-inner" style="display: flex; flex-direction: column; align-items: center; gap: 12px; pointer-events: none;">
                            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.5;">
                                <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
                                <circle cx="12" cy="13" r="3" />
                            </svg>
                            <span class="placeholder-text" style="font-size: 0.9rem; color: rgba(255,255,255,0.4); font-weight: 500;">Foto hinzufügen</span>
                        </div>
                    `;
                }
            }

            if (!previewGrid) return;

            // 1. Render Existing Files
            existingMachineFiles.forEach((file, index) => {
                renderMachineFileItem(file, index, true, previewGrid);
            });

            // 2. Render New Files
            machineFiles.forEach((file, index) => {
                renderMachineFileItem(file, index, false, previewGrid);
            });
        }

        function renderMachineFileItem(file, index, isExisting, container) {
            const item = document.createElement('div');
            item.className = 'file-preview-item';
            item.style.position = 'relative';

            // Normalise data
            const isLegacy = typeof file === 'string'; // Should not happen for new 'files' column but maybe for 'image_url'
            // if we merge?
            // Actually machine 'files' column should be array of objects.

            const name = isExisting ? (file.name || 'Datei') : file.name;
            const type = isExisting ? (file.type || '?') : file.type;
            const url = isExisting ? file.url : null;

            const isImg = (type && type.startsWith('image/')) || (name && name.match(/\.(jpg|jpeg|png|gif|webp|bmp|tif|tiff)$/i)) || (url && url.match(/\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i));

            if (isImg) {
                const isMain = isExisting ? (url === machineMainImage) : false; // For new files, it's slightly trickier, handled in setMachineMainImage
                if (isMain) item.classList.add('is-main');
            }

            if (isExisting) {
                if (isImg) {
                    item.innerHTML = `
                        <img src="${url}">
                            <div style="position: absolute; bottom: 0; left: 0; right: 0; background: rgba(0,0,0,0.6); color: white; font-size: 0.6rem; padding: 2px 4px;">${name}</div>
                            <button class="set-main-btn" onclick="setMachineMainImage(${index}, true)" title="Als Titelbild festlegen">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="${item.classList.contains('is-main') ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                            </button>
                            <button class="remove-btn" onclick="removeMachineFile(${index}, true)">&times;</button>
                    `;
                } else {
                    // PDF/Doc
                    let typeLabel = 'DOK';
                    if (type === 'application/pdf' || (url && url.endsWith('.pdf'))) typeLabel = 'PDF';

                    item.innerHTML = `
                        <div style="padding: 0.5rem; text-align: center; color: white; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                                <span style="font-weight: 900; font-size: 0.8rem; opacity: 0.5;">${typeLabel}</span>
                                <span style="font-size: 0.7rem; word-break: break-all; overflow: hidden; max-height: 3em;">${name}</span>
                            </div>
                        <button class="remove-btn" onclick="removeMachineFile(${index}, true)">&times;</button>
                    `;
                }
            } else {
                // New File
                if (isImg) {
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        const blobUrl = e.target.result;
                        const isMain = (machineMainImage === blobUrl);
                        if (isMain) item.classList.add('is-main');

                        item.innerHTML = `
                        <img src="${blobUrl}">
                                <button class="set-main-btn" onclick="setMachineMainImage(${index}, false)" title="Als Titelbild festlegen">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="${isMain ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                                </button>
                                <button class="remove-btn" onclick="removeMachineFile(${index}, false)">&times;</button>
                    `;
                    };
                    reader.readAsDataURL(file);
                } else {
                    let typeLabel = 'DOK';
                    if (file.type === 'application/pdf') typeLabel = 'PDF';
                    item.innerHTML = `
                        <div style="padding: 0.5rem; text-align: center; color: white; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                                <span style="font-weight: 900; font-size: 0.8rem; opacity: 0.5;">${typeLabel}</span>
                                <span style="font-size: 0.7rem; word-break: break-all; overflow: hidden; max-height: 3em;">${file.name}</span>
                            </div>
                        <button class="remove-btn" onclick="removeMachineFile(${index}, false)">&times;</button>
                    `;
                }
            }
            container.appendChild(item);
        }

        window.setMachineMainImage = function (index, isExisting) {
            if (isExisting) {
                machineMainImage = existingMachineFiles[index].url;
            } else {
                const reader = new FileReader();
                reader.onload = (e) => {
                    machineMainImage = e.target.result;
                    renderMachineFilePreviews();
                };
                reader.readAsDataURL(machineFiles[index]);
                return; // Preview update will happen in onload
            }
            renderMachineFilePreviews();
        };

        window.removeMachineFile = function (index, isExisting) {
            let removedUrl = null;
            if (isExisting) {
                const removedFile = existingMachineFiles[index];
                if (removedFile) {
                    removedMachineFiles.push(removedFile);
                }
                removedUrl = existingMachineFiles[index].url;
                existingMachineFiles.splice(index, 1);
            } else {
                // For blob URLs, we'd need to track them or just check the reader result again
                // simplifying: if machineMainImage matches the preview of this file
                machineFiles.splice(index, 1);
            }

            // If we removed the main image, reset it
            if (machineMainImage === removedUrl) {
                machineMainImage = null;
            }

            renderMachineFilePreviews();
        };

        // Replaces uploadImageToSupabase with uploadMachineFiles
        // Now also generates thumbnails for image files
        async function uploadMachineFiles(machineId, manufacturer, name, serial, year) {
            const uploadedFiles = [];
            if (machineFiles.length > 0) {
                const folderName = getMachineFolderName(machineId, manufacturer, name, serial, year);

                const pathGenerator = (file, i) => {
                    const isImg = file.type && file.type.startsWith('image/');
                    const subfolder = isImg ? 'Vorschaubilder' : 'Dokumente';
                    const fileExt = file.name.split('.').pop();
                    const cleanName = file.name.split('.').slice(0, -1).join('.').replace(/[^a-zA-Z0-9_\- ]/g, '_');
                    return `${folderName}/${subfolder}/${cleanName}_${Date.now()}-${i}.${fileExt}`;
                };

                // Vorschaubild direkt nach jeder Datei erzeugen (onUploaded) statt
                // in einem zweiten Durchgang danach. Zwei Gewinne: es läuft neben
                // den übrigen Übertragungen, und es entsteht aus der bereits
                // verkleinerten Fassung — das Original musste vorher ein zweites
                // Mal vollständig dekodiert werden (bei Handyfotos der teuerste
                // Einzelschritt).
                const thumbResultsOrdered = new Array(machineFiles.length);
                const uploadResults = await window.FileUploadService.uploadFiles(
                    machineFiles,
                    pathGenerator,
                    {
                        bucket: 'dateien', compress: true, provider: 'cloudflare-r2',
                        onUploaded: async (i, res, fertigeDatei) => {
                            const originalFile = machineFiles[i];
                            const fileEntry = { name: res.name, type: res.type, url: res.url };

                            if (originalFile.type && originalFile.type.startsWith('image/') && res.path) {
                                try {
                                    const thumbFile = await window.FileUploadService.generateThumbnail(fertigeDatei || originalFile);
                                    if (thumbFile) {
                                        const thumbPath = res.path.replace('/Vorschaubilder/', '/Vorschaubilder/thumbs/');
                                        const thumbResult = await window.FileUploadService.uploadFile(thumbFile, {
                                            bucket: 'dateien',
                                            path: thumbPath,
                                            compress: false,
                                            provider: 'cloudflare-r2'
                                        });
                                        fileEntry.thumbnail_url = thumbResult.url;
                                    }
                                } catch (thumbErr) {
                                    console.warn('Thumbnail generation failed for', originalFile.name, thumbErr);
                                }
                            }

                            thumbResultsOrdered[i] = fileEntry;
                        }
                    }
                );
                // Sicherheitsnetz, falls onUploaded für einen Eintrag ausfiel.
                uploadResults.forEach((res, i) => {
                    if (!thumbResultsOrdered[i]) {
                        thumbResultsOrdered[i] = { name: res.name, type: res.type, url: res.url };
                    }
                });
                uploadedFiles.push(...thumbResultsOrdered);
            }
            return uploadedFiles;
        }
