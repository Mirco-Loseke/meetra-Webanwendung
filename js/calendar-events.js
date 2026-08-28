// ==========================================================
// Kalender und Termine: Ereignisse, Wartungstermine, Wartungs-E-Mails
// ==========================================================
// Ausgelagert aus index.html (vormals Zeilen 13449-14570).
// Wird in index.html an unveraenderter Stelle per <script src> geladen;
// die Reihenfolge der Skripte entspricht der fruaeheren Reihenfolge im
// Inline-Block und darf nicht vertauscht werden.
// ==========================================================
        // --- CALENDAR SYSTEM ---
        window.calendarState = {
            currentView: 'month',
            currentDate: new Date(),
            events: []
        };

        window.eventsState = {
            selectedCategoryId: null,
            statusFilter: 'all',
            events: []
        };

        async function fetchCalendarEvents() {
            if (!supabaseClient) return [];

            // Fetch hard events from maintenance_events
            const { data: maintEvents, error: e1 } = await supabaseClient
                .from('maintenance_events')
                .select('*, machines(name, manufacturer, serial, year)');

            // Alle Maschinen kommen aus window.machineList statt aus einer eigenen DB-Abfrage,
            // damit hier immer der live neu berechnete Wartungstermin (siehe applyMachineList /
            // computeRolledNextMaintenance) verwendet wird und nicht der ggf. veraltete next_maintenance-
            // Wert direkt aus der Datenbank.
            const machines = window.machineList || [];

            let allEvents = [];

            if (maintEvents) {
                maintEvents.forEach(ev => {
                    // Termine (window.createAppointment in js/appointments.js) landen in
                    // derselben Tabelle maintenance_events wie die Wartungen — ein eigenes
                    // Kennzeichen gibt es in den Daten nicht. Unterscheidbar sind sie nur
                    // daran, dass ein Termin weder auf eine Maschine verweist noch eine
                    // Wartungsart trägt. Ohne diese Zeile steht jeder Kundentermin mit in
                    // der Wartungsliste.
                    const istWartung = ev.machine_id || ev.manual_machine || ev.maintenance_types;
                    if (!istWartung) return;

                    const m = ev.machines;
                    const titleParts = m ? [
                        m.manufacturer,
                        m.name,
                        m.serial ? `#${m.serial}` : null,
                        m.year ? `(${m.year})` : null
                    ].filter(Boolean) : [];

                    let fullTitle = ev.title || (titleParts.length > 0 ? titleParts.join(' ') : 'Wartung');
                    // Manuell eingetragene Maschine (nicht im System) im Titel voranstellen.
                    if (!m && ev.manual_machine) {
                        fullTitle = ev.manual_machine + (ev.title ? ` – ${ev.title}` : '');
                    }
                    let desc = ev.description || '';
                    if (ev.maintenance_types) {
                        desc = (desc ? desc + '\n' : '') + 'Wartung: ' + ev.maintenance_types;
                    }

                    allEvents.push({
                        id: ev.id,
                        title: fullTitle,
                        date: new Date(ev.event_date || ev.start_date || ev.created_at),
                        description: desc,
                        type: 'manual',
                        machineId: ev.machine_id,
                        status: ev.status || 'geplant'
                    });
                });
            }

            if (machines) {
                machines.forEach(m => {
                    const titleParts = [
                        m.manufacturer,
                        m.name,
                        m.serial ? `#${m.serial}` : null,
                        m.year ? `(${m.year})` : null
                    ].filter(Boolean);

                    const fullTitle = (titleParts.length > 0 ? titleParts.join(' ') : 'Wartung') + ' (Geplant)';

                    if (m.next_maintenance) {
                        allEvents.push({
                            id: 'maint-' + m.id,
                            title: fullTitle,
                            date: new Date(m.next_maintenance),
                            type: 'automatic',
                            machineId: m.id,
                            status: 'automatisch'
                        });
                    } else {
                        // Push a special event for missing maintenance date
                        allEvents.push({
                            id: 'maint-missing-' + m.id,
                            title: (titleParts.length > 0 ? titleParts.join(' ') : 'Unbekannte Maschine') + ' (Kein Termin)',
                            date: null,
                            type: 'missing',
                            machineId: m.id,
                            status: 'fehlend'
                        });
                    }
                });
            }

            // Sort by date descending (null dates will be handled in rendering separately, but we keep this for planned events)
            allEvents.sort((a, b) => {
                if (!a.date && !b.date) return 0;
                if (!a.date) return 1;
                if (!b.date) return -1;
                return b.date - a.date;
            });

            return allEvents;
        }

        window.renderEvents = async function () {
            const container = document.getElementById('events-list-container');
            if (!container) return;

            const events = await fetchCalendarEvents();
            
            // --- Apply Search & Filter ---
            const searchQuery = (document.getElementById('calendar-search-input')?.value || '').toLowerCase();
            const selectedCatId = window.eventsState.selectedCategoryId;

            let filteredEvents = events;

            if (searchQuery) {
                filteredEvents = filteredEvents.filter(e => 
                    e.title.toLowerCase().includes(searchQuery) || 
                    (e.description && e.description.toLowerCase().includes(searchQuery))
                );
            }

            if (selectedCatId) {
                filteredEvents = filteredEvents.filter(e => {
                    const m = (window.machineList || []).find(mm => mm.id === e.machineId);
                    return m && m.category_id === parseInt(selectedCatId);
                });
            }

            if (filteredEvents.length === 0) {
                container.innerHTML = `
                    <div class="glass-card" style="padding: 4rem 2rem; text-align: center; background: rgba(255,255,255,0.02); border-radius: 24px; border: 1px dashed rgba(255,255,255,0.1);">
                        <p style="color: #fff; font-size: 1.1rem;">Keine Ereignisse gefunden.</p>
                    </div>
                `;
                return;
            }

            // --- Anreicherung: Dringlichkeit, Intervall, Fortschritt ---
            const MS_DAY = 86400000;
            const today = new Date(); today.setHours(0, 0, 0, 0);
            const machines = window.machineList || [];

            const enriched = filteredEvents.map(ev => {
                const m = machines.find(mm => mm.id === ev.machineId);
                const cat = m ? (window.categoryList || []).find(c => c.id === m.category_id) : null;
                const intervalMonths = (m && m.maintenance_interval_months) || (cat && cat.default_maintenance_interval_months) || 12;

                let daysUntil = null;
                if (ev.date) {
                    const d = new Date(ev.date); d.setHours(0, 0, 0, 0);
                    daysUntil = Math.round((d - today) / MS_DAY);
                }

                let urgency;
                if (ev.type === 'missing') urgency = 'missing';
                else if (daysUntil < 0) urgency = 'overdue';
                else if (daysUntil <= 30) urgency = 'soon';
                else urgency = 'ok';

                // Fortschritt: verstrichene Zeit relativ zum Intervall (letzte -> nächste Wartung).
                // Ohne letzte Wartung wird das Intervall vom Fälligkeitsdatum zurückgerechnet.
                let progress = null;
                if (ev.date) {
                    const next = new Date(ev.date); next.setHours(0, 0, 0, 0);
                    let start = (m && m.last_maintenance) ? new Date(m.last_maintenance) : new Date(next.getTime() - intervalMonths * 30.44 * MS_DAY);
                    start.setHours(0, 0, 0, 0);
                    const span = next - start;
                    progress = span > 0 ? Math.min(1, Math.max(0, (today - start) / span)) : 1;
                }

                return { ...ev, machine: m, intervalMonths, daysUntil, urgency, progress };
            });

            const counts = { overdue: 0, soon: 0, ok: 0, missing: 0 };
            enriched.forEach(e => counts[e.urgency]++);

            const statusFilter = window.eventsState.statusFilter || 'all';
            let visible = statusFilter === 'all' ? enriched : enriched.filter(e => e.urgency === statusFilter);

            // Sortierung: Überfällig zuerst (am längsten überfällig oben), dann nach Fälligkeit, "Termin fehlt" ans Ende
            const urgencyRank = { overdue: 0, soon: 1, ok: 2, missing: 3 };
            visible.sort((a, b) => {
                const r = urgencyRank[a.urgency] - urgencyRank[b.urgency];
                if (r !== 0) return r;
                if (a.daysUntil === null || b.daysUntil === null) return 0;
                return a.daysUntil - b.daysUntil;
            });

            const urgencyColors = {
                overdue: '#F87171',
                soon: '#FFA000',
                ok: '#22c55e',
                missing: 'rgba(248,113,113,0.55)'
            };

            let html = '';

            // --- KPI-Kacheln (klickbare Filter) ---
            const kpiActive = s => statusFilter === s ? ' active' : '';
            html += `
                <div class="maint-kpi-grid">
                    <div class="maint-kpi-tile${kpiActive('overdue')}" onclick="window.setMaintStatusFilter('overdue')" title="Nur überfällige anzeigen">
                        <div class="maint-kpi-value" style="color: #F87171;">${counts.overdue}</div>
                        <div class="maint-kpi-label">Überfällig</div>
                    </div>
                    <div class="maint-kpi-tile${kpiActive('soon')}" onclick="window.setMaintStatusFilter('soon')" title="Fällig in den nächsten 30 Tagen">
                        <div class="maint-kpi-value" style="color: #FFA000;">${counts.soon}</div>
                        <div class="maint-kpi-label">Nächste 30 Tage</div>
                    </div>
                    <div class="maint-kpi-tile${kpiActive('ok')}" onclick="window.setMaintStatusFilter('ok')" title="Alles im grünen Bereich">
                        <div class="maint-kpi-value" style="color: #22c55e;">${counts.ok}</div>
                        <div class="maint-kpi-label">Aktuell</div>
                    </div>
                    <div class="maint-kpi-tile${kpiActive('missing')}" onclick="window.setMaintStatusFilter('missing')" title="Maschinen ohne hinterlegten Termin">
                        <div class="maint-kpi-value" style="color: rgba(255,255,255,0.7);">${counts.missing}</div>
                        <div class="maint-kpi-label">Termin fehlt</div>
                    </div>
                </div>
            `;

            // --- Monats-Graf: Fälligkeiten der nächsten 12 Monate (+ Überfällig-Balken) ---
            const monthBuckets = [];
            for (let i = 0; i < 12; i++) {
                const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
                monthBuckets.push({
                    label: d.toLocaleDateString('de-DE', { month: 'short' }) + (d.getMonth() === 0 || i === 0 ? ' ' + String(d.getFullYear()).slice(2) : ''),
                    year: d.getFullYear(),
                    month: d.getMonth(),
                    count: 0
                });
            }
            let overdueCount = 0;
            enriched.forEach(e => {
                if (!e.date) return;
                if (e.daysUntil < 0) { overdueCount++; return; }
                const d = new Date(e.date);
                const bucket = monthBuckets.find(b => b.year === d.getFullYear() && b.month === d.getMonth());
                if (bucket) bucket.count++;
            });
            const maxCount = Math.max(overdueCount, ...monthBuckets.map(b => b.count), 1);
            const barCol = (label, count, color) => `
                <div class="maint-chart-col">
                    ${count > 0 ? `<div class="maint-chart-count">${count}</div>` : ''}
                    <div class="maint-chart-bar" style="height: ${Math.round((count / maxCount) * 100)}%; background: ${count > 0 ? color : 'rgba(255,255,255,0.06)'};"></div>
                    <div class="maint-chart-month">${label}</div>
                </div>
            `;
            html += `
                <div class="maint-chart-card">
                    <p class="maint-chart-title">Fällige Wartungen pro Monat</p>
                    <div class="maint-chart-bars">
                        ${barCol('Überf.', overdueCount, '#F87171')}
                        ${monthBuckets.map(b => barCol(b.label, b.count, '#60a5fa')).join('')}
                    </div>
                </div>
            `;

            // --- Karten ---
            if (visible.length === 0) {
                html += `
                    <div class="glass-card" style="padding: 3rem 2rem; text-align: center; background: rgba(255,255,255,0.02); border-radius: 24px; border: 1px dashed rgba(255,255,255,0.1);">
                        <p style="color: #fff; font-size: 1rem;">Keine Einträge für diesen Filter.</p>
                    </div>
                `;
            } else {
                const buildCard = (ev) => {
                    const m = ev.machine;
                    const machineLabel = m ? [m.manufacturer, m.name, (m.serial || m.serial_number) ? `#${m.serial || m.serial_number}` : null, m.year ? `(${m.year})` : null].filter(Boolean).join(' ') : (ev.title || 'Unbekannte Maschine');

                    let companyName = '';
                    if (m) {
                        companyName = m.customer_name || m.owner || m.company || '';
                        if (!companyName && m.customer_id) {
                            const cObj = (window.customerList || []).find(c => String(c.id) === String(m.customer_id))
                                || (window.addressbookState?.byId ? window.addressbookState.byId.get(String(m.customer_id)) : null);
                            if (cObj) companyName = cObj.name || cObj.matchcode || '';
                        }
                    }

                    const lastMaintStr = (m && m.last_maintenance) ? new Date(m.last_maintenance).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '–';
                    const nextMaintStr = ev.date ? new Date(ev.date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '–';

                    const color = urgencyColors[ev.urgency];

                    let badgeText;
                    if (ev.urgency === 'missing') badgeText = 'Termin fehlt';
                    else if (ev.urgency === 'overdue') badgeText = ev.daysUntil === -1 ? '1 Tag überfällig' : `${-ev.daysUntil} Tage überfällig`;
                    else if (ev.daysUntil === 0) badgeText = 'Heute fällig';
                    else if (ev.daysUntil === 1) badgeText = 'Morgen fällig';
                    else if (ev.daysUntil <= 60) badgeText = `in ${ev.daysUntil} Tagen`;
                    else badgeText = `in ${Math.round(ev.daysUntil / 30.44)} Mon.`;

                    const badgeBg = ev.urgency === 'ok' ? 'rgba(34,197,94,0.14)' : ev.urgency === 'soon' ? 'rgba(255,160,0,0.14)' : 'rgba(248,113,113,0.14)';
                    const badgeColor = ev.urgency === 'ok' ? '#22c55e' : ev.urgency === 'soon' ? '#FFA000' : '#F87171';

                    const manualTag = ev.type === 'manual'
                        ? `<span style="font-size: 0.65rem; padding: 2px 8px; border-radius: 6px; background: rgba(59,130,246,0.15); color: #60a5fa; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; margin-left: 8px; vertical-align: middle;">Manuell</span>`
                        : '';

                    const progressHtml = ev.progress !== null ? `
                        <div class="maint-progress-track">
                            <div class="maint-progress-fill" style="width: ${Math.round(ev.progress * 100)}%; background: ${color};"></div>
                        </div>
                    ` : '';

                    // Zuletzt durchgeführte Wartungsart: gespeicherter Wert (aus "Termin pflegen")
                    // hat Vorrang, sonst wird die Art nach dem Rendern aus der Historie nachgeladen.
                    const lastArtMeta = (m && Array.isArray(m.files)) ? m.files.find(f => f.type === 'meta' && f.key === 'last_maintenance_type') : null;
                    const lastArt = lastArtMeta?.property ? String(lastArtMeta.property).replace(/</g, '&lt;') : '';
                    const lastArtHtml = m ? `<div class="maint-card-lastart" data-mid="${m.id}"${lastArt ? '' : ' data-fetch="1"'} style="font-size: 0.8rem; color: rgba(255,255,255,0.85); margin: 2px 0 8px; display: ${lastArt ? 'block' : 'none'};">Zuletzt gemacht: <b class="maint-lastart-val">${lastArt}</b></div>` : '';

                    const actionsHtml = m ? `
                        <div class="maint-card-actions">
                            <button class="maint-action-btn" onclick="window.openMaintErledigtModal(${m.id})" title="Wartung für diesen Turnus abhaken" style="background: rgba(34,197,94,0.3); border-color: rgba(34,197,94,0.6); color: #4ade80;">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                Erledigt
                            </button>
                            <button class="maint-action-btn" onclick="window.openHistoryModal(${m.id})" title="Historie öffnen und Wartung erfassen" style="background: rgba(59,130,246,0.18); border-color: rgba(59,130,246,0.5); color: #60a5fa;">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                                Historie
                            </button>
                            <button class="maint-action-btn" onclick="window.openMaintTerminModal(${m.id})" title="Wartungstermin bearbeiten" style="background: rgba(34,197,94,0.18); border-color: rgba(34,197,94,0.5); color: #22c55e;">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                                Termin pflegen
                            </button>
                            <button class="maint-action-btn" onclick="window.openMaintEmailModal(${m.id})" title="Wartungserinnerung per E-Mail senden" style="background: rgba(249,115,22,0.18); border-color: rgba(249,115,22,0.5); color: #fb923c;">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"></rect><path d="m22 7-10 5L2 7"></path></svg>
                                Email versenden
                            </button>
                        </div>
                    ` : (ev.type === 'manual' ? `
                        <div class="maint-card-actions">
                            <button class="maint-action-btn" onclick="window.editManualEvent('${ev.id}')" title="Manuellen Eintrag bearbeiten" style="background: rgba(34,197,94,0.18); border-color: rgba(34,197,94,0.5); color: #22c55e;">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                                Termin pflegen
                            </button>
                            <button class="maint-action-btn" onclick="window.openManualEventEmail(${JSON.stringify(machineLabel).replace(/"/g, '&quot;')})" title="E-Mail zu diesem Eintrag senden" style="background: rgba(249,115,22,0.18); border-color: rgba(249,115,22,0.5); color: #fb923c;">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"></rect><path d="m22 7-10 5L2 7"></path></svg>
                                Email versenden
                            </button>
                            <button class="maint-action-btn" onclick="window.deleteEvent('${ev.id}')" title="Eintrag löschen" style="background: rgba(239,68,68,0.15); border-color: rgba(239,68,68,0.4); color: #f87171;">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path></svg>
                                Löschen
                            </button>
                        </div>
                    ` : '');

                    // Maschinennummer/-name: grün wenn Maschine im System, orange bei manuellem Eintrag.
                    const machineColor = m ? '#22c55e' : (ev.type === 'manual' ? '#fb923c' : '');
                    const machineStyle = machineColor ? ` style="color: ${machineColor};"` : '';
                    const companyHtml = companyName ? `<div style="font-size: 0.85rem; color: rgba(255,255,255,0.75); font-weight: 600; margin-top: 2px; display: flex; align-items: center; gap: 4px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>${_cpEsc(companyName)}</div>` : '';

                    return `
                        <div class="maint-card" style="border-left-color: ${color};">
                            <div class="maint-card-top">
                                <div>
                                    <div class="maint-card-machine"${machineStyle}>${machineLabel}${manualTag}</div>
                                    ${companyHtml}
                                </div>
                                <span class="maint-badge" style="background: ${badgeBg}; color: ${badgeColor};">${badgeText}</span>
                            </div>
                            ${ev.type === 'manual' && ev.description ? `<div style="font-size: 0.82rem; color: #fff; margin-bottom: 8px;">${ev.description}</div>` : ''}
                            <div class="maint-card-dates">
                                ${m ? `<span>Letzte: <b>${lastMaintStr}</b></span>` : ''}
                                <span>Nächste: <b>${nextMaintStr}</b></span>
                                <span>Intervall: <b>${ev.intervalMonths} Mon.</b></span>
                            </div>
                            ${lastArtHtml}
                            ${progressHtml}
                            ${actionsHtml}
                        </div>
                    `;
                };

                const mainCards = visible.filter(e => e.urgency !== 'missing');
                const missingCards = visible.filter(e => e.urgency === 'missing');

                if (mainCards.length) {
                    html += '<div class="maint-cards-grid">' + mainCards.map(buildCard).join('') + '</div>';
                }

                // "Termin fehlt"-Einträge in einen standardmäßig eingeklappten Bereich.
                if (missingCards.length) {
                    // Beim aktiven Filter "Termin fehlt" direkt aufgeklappt zeigen.
                    const expanded = statusFilter === 'missing';
                    html += `
                        <div style="margin-top: 1.25rem;">
                            <button type="button" onclick="window.toggleMaintMissing(this)" data-expanded="${expanded ? '1' : '0'}" style="width: 100%; display: flex; align-items: center; gap: 10px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 12px 16px; cursor: pointer; color: #fff; font-size: 0.95rem; font-weight: 700;">
                                <svg class="maint-missing-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="transition: transform 0.2s; transform: rotate(${expanded ? '90' : '0'}deg);"><polyline points="9 18 15 12 9 6"></polyline></svg>
                                <span>Termin fehlt</span>
                                <span style="background: rgba(248,113,113,0.2); color: #F87171; border-radius: 20px; padding: 2px 10px; font-size: 0.8rem;">${missingCards.length}</span>
                            </button>
                            <div class="maint-missing-body" style="display: ${expanded ? 'block' : 'none'}; margin-top: 0.75rem;">
                                <div class="maint-cards-grid">${missingCards.map(buildCard).join('')}</div>
                            </div>
                        </div>
                    `;
                }
            }

            container.innerHTML = html;
            if (typeof window.enrichMaintLastArt === 'function') window.enrichMaintLastArt(container);
        };

        // Lädt für Kacheln ohne gespeicherte Wartungsart die letzte Art aus der Historie nach.
        window.enrichMaintLastArt = async function (container) {
            const nodes = Array.from(container.querySelectorAll('.maint-card-lastart[data-fetch="1"]'));
            if (!nodes.length || !window.supabaseClient) return;
            const ids = [...new Set(nodes.map(n => parseInt(n.dataset.mid, 10)).filter(Boolean))];
            if (!ids.length) return;
            try {
                const [wartungRes, serviceRes] = await Promise.all([
                    window.supabaseClient.from('manual_history_entries').select('machine_id, created_at, content, title').in('machine_id', ids).eq('type', 'wartung'),
                    window.supabaseClient.from('service_entries').select('machine_id, date, created_at, checklist_payload').in('machine_id', ids)
                ]);
                const byMachine = {}; // machine_id -> {date, art}
                const consider = (mid, date, art) => {
                    if (!date) return;
                    // Nur echte Wartungsarten – "Werkstattaufenthalt"/generischer Bericht ignorieren.
                    if (!art || /werkstattaufenthalt/i.test(art)) return;
                    if (!byMachine[mid] || date.localeCompare(byMachine[mid].date) > 0) byMachine[mid] = { date, art };
                };
                (wartungRes.data || []).forEach(e => {
                    if (e.created_at) consider(e.machine_id, e.created_at.split('T')[0], (e.content || e.title || '').trim());
                });
                (serviceRes.data || []).forEach(e => {
                    const d = e.date ? String(e.date).split('T')[0] : (e.created_at ? e.created_at.split('T')[0] : null);
                    // Servicebericht nur, wenn dort explizit ein Wartungs-/UVV-Protokoll gewählt wurde.
                    const art = (typeof window.extractServiceMaintArt === 'function') ? window.extractServiceMaintArt(e.checklist_payload) : '';
                    consider(e.machine_id, d, art);
                });
                nodes.forEach(node => {
                    const mid = parseInt(node.dataset.mid, 10);
                    const info = byMachine[mid];
                    if (info && info.art) {
                        const valEl = node.querySelector('.maint-lastart-val');
                        if (valEl) valEl.textContent = info.art;
                        node.style.display = 'block';
                    }
                });
            } catch (e) {
                console.warn('enrichMaintLastArt Fehler:', e);
            }
        };

        window.toggleMaintMissing = function (btn) {
            const wrap = btn.parentElement;
            const body = wrap.querySelector('.maint-missing-body');
            const chevron = btn.querySelector('.maint-missing-chevron');
            const open = btn.dataset.expanded === '1';
            btn.dataset.expanded = open ? '0' : '1';
            if (body) body.style.display = open ? 'none' : 'block';
            if (chevron) chevron.style.transform = open ? 'rotate(0deg)' : 'rotate(90deg)';
        };

        // ─────────────────────────────────────────────────────────────────────
        // "Termin pflegen": schlankes Fenster zum Bearbeiten des Wartungstermins.
        // Die letzte Wartungsart wird aus der Historie (jüngster Eintrag) ermittelt.
        // ─────────────────────────────────────────────────────────────────────
        // Wartungsart aus einem Servicebericht NUR, wenn dort explizit ein
        // Wartungs-/UVV-Zusatzprotokoll ausgewählt wurde. Generische Berichte
        // ("Servicebericht", "Werkstattaufenthalt") liefern absichtlich nichts.
        window.extractServiceMaintArt = function (payload) {
            if (!payload || !Array.isArray(payload.checklists)) return '';
            const rel = payload.checklists.filter(cl => cl.type === 'wartung' || cl.type === 'uvv');
            if (!rel.length) return '';
            // Bevorzugt konkreten Umfang der Wartung (z.B. "SBA, Motor"), sonst Protokoll-Titel.
            let scope = '';
            if (typeof window.getMaintenanceScopeLabel === 'function') {
                scope = window.getMaintenanceScopeLabel(payload) || '';
            }
            const titles = [...new Set(rel.map(cl => (cl.title || (cl.type === 'uvv' ? 'UVV' : 'Wartung')).trim()).filter(Boolean))].join(', ');
            if (scope && scope !== 'Komplett') return titles ? `${titles} (${scope})` : scope;
            return titles;
        };

        window.getLastMaintenanceInfo = async function (machineId) {
            const numericId = parseInt(machineId, 10);
            if (!window.supabaseClient) return null;
            try {
                const [wartungRes, serviceRes] = await Promise.all([
                    window.supabaseClient.from('manual_history_entries').select('created_at, content, title').eq('machine_id', numericId).eq('type', 'wartung'),
                    window.supabaseClient.from('service_entries').select('date, created_at, checklist_payload').eq('machine_id', numericId)
                ]);
                const entries = [];
                const isMaintArt = (art) => art && !/werkstattaufenthalt/i.test(art);
                (wartungRes.data || []).forEach(e => {
                    const art = (e.content || e.title || '').trim();
                    if (e.created_at && isMaintArt(art)) entries.push({ date: e.created_at.split('T')[0], art });
                });
                (serviceRes.data || []).forEach(e => {
                    const d = e.date ? String(e.date).split('T')[0] : (e.created_at ? e.created_at.split('T')[0] : null);
                    if (!d) return;
                    const art = window.extractServiceMaintArt(e.checklist_payload);
                    if (isMaintArt(art)) entries.push({ date: d, art });
                });
                if (!entries.length) return null;
                entries.sort((a, b) => a.date.localeCompare(b.date));
                return entries[entries.length - 1];
            } catch (e) {
                console.warn('getLastMaintenanceInfo Fehler:', e);
                return null;
            }
        };

        window.ensureMaintTerminModal = function () {
            let modal = document.getElementById('maint-termin-modal');
            if (modal) return modal;
            modal = document.createElement('div');
            modal.id = 'maint-termin-modal';
            modal.style.cssText = 'position: fixed; inset: 0; z-index: 10000; display: none; align-items: center; justify-content: center; background: rgba(0,0,0,0.6); backdrop-filter: blur(4px); padding: 20px;';
            modal.innerHTML = `
                <div class="glass-card" style="width: 100%; max-width: 520px; max-height: 90vh; overflow-y: auto; padding: 0; border-radius: 20px; background: rgba(20,24,34,0.98); border: 1px solid rgba(255,255,255,0.12);">
                    <div style="display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid rgba(255,255,255,0.08);">
                        <h2 style="margin: 0; font-family: 'Outfit', sans-serif; font-size: 1.15rem; color: #fff;">Wartungstermin pflegen</h2>
                        <button type="button" onclick="window.closeMaintTerminModal()" style="border: none; background: rgba(255,255,255,0.08); color: #fff; width: 34px; height: 34px; border-radius: 10px; cursor: pointer; font-size: 1.1rem;">✕</button>
                    </div>
                    <div style="padding: 18px 20px; display: flex; flex-direction: column; gap: 14px;">
                        <div id="mt-machine" style="font-size: 0.95rem; color: #fff; font-weight: 700;"></div>
                        <div>
                            <label style="font-size: 0.72rem; font-weight: 700; color: rgba(255,255,255,0.5); text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 4px;">Letzte Wartung</label>
                            <input type="date" id="mt-last" class="glass-form-input" style="height: 44px; width: 100%;">
                        </div>
                        <div>
                            <label style="font-size: 0.72rem; font-weight: 700; color: rgba(255,255,255,0.5); text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 4px;">Letzte Wartungsart <span id="mt-art-auto" style="color: #22c55e; text-transform: none; font-weight: 600;"></span></label>
                            <input type="text" id="mt-art" class="glass-form-input" placeholder="z.B. UVV & Wartung, SBA-Wartung" style="height: 44px; width: 100%;">
                        </div>
                        <div>
                            <label style="font-size: 0.72rem; font-weight: 700; color: rgba(255,255,255,0.5); text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 4px;">Nächste Wartung</label>
                            <input type="date" id="mt-next" class="glass-form-input" style="height: 44px; width: 100%;">
                        </div>
                        <div>
                            <label style="font-size: 0.72rem; font-weight: 700; color: rgba(255,255,255,0.5); text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 4px;">Wartungsintervall (Monate)</label>
                            <input type="number" id="mt-interval" class="glass-form-input" min="1" placeholder="z.B. 12" style="height: 44px; width: 100%;">
                        </div>
                    </div>
                    <div style="display: flex; gap: 10px; justify-content: flex-end; padding: 14px 20px; border-top: 1px solid rgba(255,255,255,0.08);">
                        <button type="button" onclick="window.closeMaintTerminModal()" style="padding: 10px 18px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.15); background: transparent; color: #fff; font-weight: 700; cursor: pointer;">Abbrechen</button>
                        <button type="button" onclick="window.saveMaintTermin()" style="padding: 10px 20px; border-radius: 10px; border: none; background: #22c55e; color: #06231a; font-weight: 800; cursor: pointer;">Speichern</button>
                    </div>
                </div>
            `;
            modal.addEventListener('click', (e) => { if (e.target === modal) window.closeMaintTerminModal(); });
            document.body.appendChild(modal);
            return modal;
        };

        window.closeMaintTerminModal = function () {
            const modal = document.getElementById('maint-termin-modal');
            if (modal) modal.style.display = 'none';
        };

        window._mtMachineId = null;

        window.openMaintTerminModal = async function (machineId) {
            window.ensureMaintTerminModal();
            const m = (window.machineList || []).find(x => x.id === machineId);
            if (!m) { window.showToast('Maschine nicht gefunden.'); return; }
            window._mtMachineId = machineId;

            const machineLabel = [m.manufacturer, m.name, (m.serial || m.serial_number) ? `#${m.serial || m.serial_number}` : null, m.year ? `(${m.year})` : null].filter(Boolean).join(' ');
            const cat = (window.categoryList || []).find(c => c.id === m.category_id);
            const interval = m.maintenance_interval_months || (cat && cat.default_maintenance_interval_months) || 12;

            document.getElementById('mt-machine').textContent = machineLabel;
            document.getElementById('mt-last').value = m.last_maintenance ? String(m.last_maintenance).split('T')[0] : '';
            document.getElementById('mt-next').value = m.next_maintenance ? String(m.next_maintenance).split('T')[0] : '';
            document.getElementById('mt-interval').value = interval;
            document.getElementById('mt-art-auto').textContent = '';

            // Bereits gespeicherte Wartungsart (meta) vorbelegen.
            const savedArt = Array.isArray(m.files) ? m.files.find(f => f.type === 'meta' && f.key === 'last_maintenance_type') : null;
            document.getElementById('mt-art').value = savedArt?.property || '';

            document.getElementById('maint-termin-modal').style.display = 'flex';

            // Wenn noch keine Wartungsart hinterlegt ist: automatisch aus der Historie ermitteln.
            if (!document.getElementById('mt-art').value) {
                document.getElementById('mt-art-auto').textContent = '(wird ermittelt …)';
                const info = await window.getLastMaintenanceInfo(machineId);
                // Nur setzen, falls Nutzer inzwischen nichts getippt hat und noch dieselbe Maschine offen ist.
                if (window._mtMachineId === machineId && !document.getElementById('mt-art').value) {
                    if (info && info.art) {
                        document.getElementById('mt-art').value = info.art;
                        document.getElementById('mt-art-auto').textContent = '(autom. aus Historie)';
                        // Wenn das gespeicherte "Letzte Wartung"-Datum nicht zur letzten echten
                        // Wartung passt (z.B. weil ein Reparatur-Bericht neuer war), das korrekte
                        // Wartungsdatum vorschlagen und die nächste Wartung neu berechnen.
                        if (info.date && document.getElementById('mt-last').value !== info.date) {
                            document.getElementById('mt-last').value = info.date;
                            const iv = parseInt(document.getElementById('mt-interval').value, 10) || interval;
                            if (typeof window.computeRolledNextMaintenance === 'function') {
                                document.getElementById('mt-next').value = window.computeRolledNextMaintenance(info.date, iv);
                            }
                            document.getElementById('mt-art-auto').textContent = '(autom. aus Historie – Datum angepasst)';
                        }
                    } else {
                        document.getElementById('mt-art-auto').textContent = '';
                    }
                }
            }
        };

        window.saveMaintTermin = async function () {
            const machineId = window._mtMachineId;
            const m = (window.machineList || []).find(x => x.id === machineId);
            if (!m) { window.showToast('Maschine nicht gefunden.'); return; }

            const last = document.getElementById('mt-last').value || null;
            const next = document.getElementById('mt-next').value || null;
            const intervalRaw = document.getElementById('mt-interval').value;
            const interval = intervalRaw ? parseInt(intervalRaw, 10) : null;
            const art = document.getElementById('mt-art').value.trim();

            // Wartungsart als Meta in files ablegen (kein Schema-Umbau nötig).
            let files = Array.isArray(m.files) ? m.files.filter(f => !(f.type === 'meta' && f.key === 'last_maintenance_type')) : [];
            if (art) files.push({ type: 'meta', key: 'last_maintenance_type', property: art });

            const payload = {
                last_maintenance: last,
                next_maintenance: next,
                maintenance_interval_months: interval,
                files
            };

            try {
                const { error } = await window.supabaseClient.from('machines').update(payload).eq('id', machineId);
                if (error) throw error;
                // Lokalen Stand aktualisieren, damit die Kachel sofort stimmt.
                Object.assign(m, payload);
                window.closeMaintTerminModal();
                if (window.showSyncToast) window.showSyncToast('Wartungstermin gespeichert.', 'success');
                if (typeof window.renderEvents === 'function') window.renderEvents();
            } catch (e) {
                console.error('saveMaintTermin Fehler:', e);
                window.showToast('Fehler beim Speichern: ' + (e.message || e));
            }
        };

        // ─────────────────────────────────────────────────────────────────────
        // "Erledigt": Wartung für diesen Turnus abhaken. Zwei Fälle — die Wartung
        // wurde durchgeführt, oder der Kunde gibt keine Auskunft. Beide setzen
        // "Letzte Wartung" auf heute und rollen den nächsten Termin um das
        // Intervall weiter, damit die Maschine erst im nächsten Turnus wieder
        // auftaucht. Der Grund wird als Wartungsart (meta in files) hinterlegt.
        // ─────────────────────────────────────────────────────────────────────
        window.ensureMaintErledigtModal = function () {
            let modal = document.getElementById('maint-erledigt-modal');
            if (modal) return modal;
            modal = document.createElement('div');
            modal.id = 'maint-erledigt-modal';
            modal.style.cssText = 'position: fixed; inset: 0; z-index: 10000; display: none; align-items: center; justify-content: center; background: rgba(0,0,0,0.6); backdrop-filter: blur(4px); padding: 20px;';
            modal.innerHTML = `
                <div class="glass-card" style="width: 100%; max-width: 460px; padding: 0; border-radius: 20px; background: rgba(20,24,34,0.98); border: 1px solid rgba(255,255,255,0.12);">
                    <div style="display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid rgba(255,255,255,0.08);">
                        <h2 style="margin: 0; font-family: 'Outfit', sans-serif; font-size: 1.15rem; color: #fff;">Wartung erledigt</h2>
                        <button type="button" onclick="window.closeMaintErledigtModal()" style="border: none; background: rgba(255,255,255,0.08); color: #fff; width: 34px; height: 34px; border-radius: 10px; cursor: pointer; font-size: 1.1rem;">✕</button>
                    </div>
                    <div style="padding: 18px 20px; display: flex; flex-direction: column; gap: 12px;">
                        <div id="me-machine" style="font-size: 0.95rem; color: #fff; font-weight: 700;"></div>
                        <div id="me-hint" style="font-size: 0.85rem; color: rgba(255,255,255,0.7); line-height: 1.45;"></div>
                        <button type="button" onclick="window.markMaintErledigt('gemacht')" style="display: flex; align-items: center; gap: 10px; padding: 14px 16px; border-radius: 12px; border: 1px solid rgba(34,197,94,0.5); background: rgba(34,197,94,0.18); color: #fff; font-weight: 800; cursor: pointer; font-size: 0.95rem;">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                            Wurde gemacht
                        </button>
                        <button type="button" onclick="window.markMaintErledigt('keine-auskunft')" style="display: flex; align-items: center; gap: 10px; padding: 14px 16px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.18); background: rgba(255,255,255,0.06); color: #fff; font-weight: 800; cursor: pointer; font-size: 0.95rem;">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.75)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                            Keine Auskunft
                        </button>
                    </div>
                    <div style="display: flex; justify-content: flex-end; padding: 14px 20px; border-top: 1px solid rgba(255,255,255,0.08);">
                        <button type="button" onclick="window.closeMaintErledigtModal()" style="padding: 10px 18px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.15); background: transparent; color: #fff; font-weight: 700; cursor: pointer;">Abbrechen</button>
                    </div>
                </div>
            `;
            modal.addEventListener('click', (e) => { if (e.target === modal) window.closeMaintErledigtModal(); });
            document.body.appendChild(modal);
            return modal;
        };

        window.closeMaintErledigtModal = function () {
            const modal = document.getElementById('maint-erledigt-modal');
            if (modal) modal.style.display = 'none';
        };

        window._meMachineId = null;

        // Intervall einer Maschine: eigener Wert, sonst Kategorie-Vorgabe, sonst 12 Monate.
        window.getMaintIntervalMonths = function (m) {
            const cat = (window.categoryList || []).find(c => c.id === m.category_id);
            return m.maintenance_interval_months || (cat && cat.default_maintenance_interval_months) || 12;
        };

        window._maintHeuteStr = function () {
            const d = new Date();
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        };

        window.openMaintErledigtModal = function (machineId) {
            const m = (window.machineList || []).find(x => x.id === machineId);
            if (!m) { window.showToast('Maschine nicht gefunden.'); return; }
            window.ensureMaintErledigtModal();
            window._meMachineId = machineId;

            const machineLabel = [m.manufacturer, m.name, (m.serial || m.serial_number) ? `#${m.serial || m.serial_number}` : null, m.year ? `(${m.year})` : null].filter(Boolean).join(' ');
            const interval = window.getMaintIntervalMonths(m);
            const next = window.computeRolledNextMaintenance(window._maintHeuteStr(), interval);
            const nextLabel = new Date(next).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

            document.getElementById('me-machine').textContent = machineLabel;
            document.getElementById('me-hint').textContent = `Letzte Wartung wird auf heute gesetzt, nächste Wartung automatisch auf ${nextLabel} (Intervall ${interval} Monate).`;
            document.getElementById('maint-erledigt-modal').style.display = 'flex';
        };

        window.markMaintErledigt = async function (grund) {
            const machineId = window._meMachineId;
            const m = (window.machineList || []).find(x => x.id === machineId);
            if (!m) { window.showToast('Maschine nicht gefunden.'); return; }

            const art = grund === 'keine-auskunft' ? 'Keine Auskunft' : 'Wurde gemacht';
            const interval = window.getMaintIntervalMonths(m);
            const heuteStr = window._maintHeuteStr();
            const next = window.computeRolledNextMaintenance(heuteStr, interval);

            const files = Array.isArray(m.files) ? m.files.filter(f => !(f.type === 'meta' && f.key === 'last_maintenance_type')) : [];
            files.push({ type: 'meta', key: 'last_maintenance_type', property: art });

            const payload = {
                last_maintenance: heuteStr,
                next_maintenance: next,
                maintenance_interval_months: interval,
                files
            };

            try {
                const { error } = await window.supabaseClient.from('machines').update(payload).eq('id', machineId);
                if (error) throw error;
                // Lokalen Stand aktualisieren, damit die Kachel sofort stimmt.
                Object.assign(m, payload);
                window.closeMaintErledigtModal();
                const nextLabel = new Date(next).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
                if (window.showSyncToast) window.showSyncToast(`${art} — nächste Wartung am ${nextLabel}.`, 'success');
                if (typeof window.renderEvents === 'function') window.renderEvents();
            } catch (e) {
                console.error('markMaintErledigt Fehler:', e);
                window.showToast('Fehler beim Speichern: ' + (e.message || e));
            }
        };

        // ─────────────────────────────────────────────────────────────────────
        // Wartungserinnerung per E-Mail: Outlook-ähnliches Fenster, das Betreff
        // und Text vordefiniert. Nach dem Anpassen öffnet "In Outlook öffnen"
        // den Standard-Mailclient (mailto:) mit allen Feldern vorbelegt.
        // ─────────────────────────────────────────────────────────────────────
        window.ensureMaintEmailModal = function () {
            let modal = document.getElementById('maint-email-modal');
            if (modal) return modal;
            modal = document.createElement('div');
            modal.id = 'maint-email-modal';
            modal.style.cssText = 'position: fixed; inset: 0; z-index: 10000; display: none; align-items: center; justify-content: center; background: rgba(0,0,0,0.6); backdrop-filter: blur(4px); padding: 20px;';
            modal.innerHTML = `
                <div class="glass-card" style="width: 100%; max-width: 820px; max-height: 90vh; overflow-y: auto; padding: 0; border-radius: 20px; background: rgba(20,24,34,0.98); border: 1px solid rgba(255,255,255,0.12);">
                    <div style="display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid rgba(255,255,255,0.08);">
                        <h2 style="margin: 0; font-family: 'Outfit', sans-serif; font-size: 1.15rem; color: #fff;">Wartungserinnerung – E-Mail</h2>
                        <button type="button" onclick="window.closeMaintEmailModal()" style="border: none; background: rgba(255,255,255,0.08); color: #fff; width: 34px; height: 34px; border-radius: 10px; cursor: pointer; font-size: 1.1rem;">✕</button>
                    </div>
                    <div style="padding: 18px 20px; display: flex; flex-direction: column; gap: 12px;">
                        <div id="mem-contact-wrap" style="display: none;">
                            <label style="font-size: 0.72rem; font-weight: 700; color: rgba(255,255,255,0.5); text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 4px;">Ansprechpartner (Maschine)</label>
                            <select id="mem-contact" class="glass-form-input" style="height: auto; min-height: 44px; width: 100%; background: #1a2032; color: #fff; font-size: 0.9rem; line-height: 1.4; padding: 10px 34px 10px 12px;" onchange="window.applyMaintEmailContact()"></select>
                        </div>
                        <label style="display: flex; align-items: center; gap: 10px; cursor: pointer; background: rgba(249,115,22,0.1); border: 1px solid rgba(249,115,22,0.3); border-radius: 10px; padding: 10px 12px;">
                            <input type="checkbox" id="mem-angebot" onchange="window.rebuildMaintEmailBody()" style="width: 18px; height: 18px; cursor: pointer;">
                            <span style="font-size: 0.9rem; color: #fff; font-weight: 600;">Angebot ist im Anhang (Text ergänzen)</span>
                        </label>
                        <div>
                            <label style="font-size: 0.72rem; font-weight: 700; color: rgba(255,255,255,0.5); text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 4px;">An (Empfänger)</label>
                            <input type="text" id="mem-to" class="glass-form-input" placeholder="empfaenger@kunde.de" style="height: 42px; width: 100%;">
                        </div>
                        <div>
                            <label style="font-size: 0.72rem; font-weight: 700; color: rgba(255,255,255,0.5); text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 4px;">CC</label>
                            <input type="text" id="mem-cc" class="glass-form-input" placeholder="cc@firma.de (optional, mehrere mit Komma)" style="height: 42px; width: 100%;">
                        </div>
                        <div>
                            <label style="font-size: 0.72rem; font-weight: 700; color: rgba(255,255,255,0.5); text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 4px;">Betreff</label>
                            <input type="text" id="mem-subject" class="glass-form-input" style="height: 42px; width: 100%;">
                        </div>
                        <div>
                            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
                                <label style="font-size: 0.72rem; font-weight: 700; color: rgba(255,255,255,0.5); text-transform: uppercase; letter-spacing: 0.5px;">Nachricht</label>
                                <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 0.8rem; color: #fff; font-weight: 600;">
                                    <input type="checkbox" id="mem-english" onchange="window.rebuildMaintEmailBody()" style="width: 16px; height: 16px; cursor: pointer;"> English
                                </label>
                            </div>
                            <textarea id="mem-body" class="glass-form-input" style="min-height: 240px; width: 100%; resize: vertical; line-height: 1.5; font-family: inherit;"></textarea>
                        </div>
                    </div>
                    <div style="display: flex; gap: 10px; justify-content: flex-end; padding: 14px 20px; border-top: 1px solid rgba(255,255,255,0.08);">
                        <button type="button" onclick="window.closeMaintEmailModal()" style="padding: 10px 18px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.15); background: transparent; color: #fff; font-weight: 700; cursor: pointer;">Abbrechen</button>
                        <button type="button" onclick="window.sendMaintEmail()" style="padding: 10px 20px; border-radius: 10px; border: none; background: var(--color-primary-green, #22c55e); color: #06231a; font-weight: 800; cursor: pointer; display: inline-flex; align-items: center; gap: 8px;">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                            In Outlook öffnen
                        </button>
                    </div>
                </div>
            `;
            modal.addEventListener('click', (e) => { if (e.target === modal) window.closeMaintEmailModal(); });
            document.body.appendChild(modal);
            return modal;
        };

        window.closeMaintEmailModal = function () {
            const modal = document.getElementById('maint-email-modal');
            if (modal) modal.style.display = 'none';
        };

        window.sendMaintEmail = function () {
            const to = (document.getElementById('mem-to')?.value || '').trim();
            const cc = (document.getElementById('mem-cc')?.value || '').trim();
            const subject = document.getElementById('mem-subject')?.value || '';
            const body = document.getElementById('mem-body')?.value || '';
            const params = [];
            if (cc) params.push('cc=' + encodeURIComponent(cc));
            params.push('subject=' + encodeURIComponent(subject));
            params.push('body=' + encodeURIComponent(body));
            const mailto = 'mailto:' + encodeURIComponent(to) + '?' + params.join('&');
            window.location.href = mailto;
            window.closeMaintEmailModal();
        };

        // Kontext der aktuell im E-Mail-Dialog bearbeiteten Wartung.
        window._memCtx = null;

        // Baut die Anrede-Zeile aus einem Ansprechpartner (Anrede + Nachname), DE oder EN.
        window._memGreeting = function (contact, firma, lang) {
            const en = lang === 'en';
            if (contact && contact.anrede && contact.name) {
                const lastName = contact.name.trim().split(/\s+/).pop();
                if (contact.anrede === 'Herr') return en ? `Dear Mr ${lastName},` : `Sehr geehrter Herr ${lastName},`;
                if (contact.anrede === 'Frau') return en ? `Dear Ms ${lastName},` : `Sehr geehrte Frau ${lastName},`;
            }
            if (firma) return en ? `Dear Sir or Madam of ${firma},` : `Sehr geehrte Damen und Herren der Firma ${firma},`;
            return en ? 'Dear Sir or Madam,' : 'Sehr geehrte Damen und Herren,';
        };

        // Setzt Betreff + Nachricht neu zusammen (Anrede + Wartung + optional Angebot),
        // je nach Sprach-Häkchen auf Deutsch (Standard) oder Englisch.
        window.rebuildMaintEmailBody = function () {
            const ctx = window._memCtx;
            if (!ctx) return;
            const en = !!document.getElementById('mem-english')?.checked;
            const withAngebot = document.getElementById('mem-angebot')?.checked;
            const greeting = window._memGreeting(ctx.contact, ctx.firma, en ? 'en' : 'de');

            // Betreff passend zur Sprache.
            const subjEl = document.getElementById('mem-subject');
            if (subjEl) subjEl.value = (en ? 'Maintenance reminder – ' : 'Wartungserinnerung – ') + (ctx.machineLabel || '');

            let t = `${greeting}\n\n`;
            if (en) {
                t += `we would like to remind you of the upcoming maintenance of your machine:\n\n`;
                t += `Machine: ${ctx.machineLabel}\n`;
                if (ctx.lastStr) t += `Last maintenance: ${ctx.lastStr}\n`;
                if (ctx.nextStr) t += `Next maintenance due: ${ctx.nextStr}\n`;
                if (withAngebot) {
                    t += `\nPlease find our quotation for the planned maintenance attached. Kindly review it and do not hesitate to contact us with any questions.\n`;
                }
                t += `\nPlease get in touch with us to arrange an appointment so we can carry out the maintenance in good time.\n\n`;
                t += `Kind regards\n`;
            } else {
                t += `wir möchten Sie an die anstehende Wartung Ihrer Maschine erinnern:\n\n`;
                t += `Maschine: ${ctx.machineLabel}\n`;
                if (ctx.lastStr) t += `Letzte Wartung: ${ctx.lastStr}\n`;
                if (ctx.nextStr) t += `Nächste Wartung fällig: ${ctx.nextStr}\n`;
                if (withAngebot) {
                    t += `\nIm Anhang befindet sich unser Angebot bezüglich der angedachten Wartung. Bitte prüfen Sie dieses und melden Sie sich bei Fragen gerne bei uns.\n`;
                }
                t += `\nBitte melden Sie sich zur Terminvereinbarung bei uns, damit wir die Wartung rechtzeitig durchführen können.\n\n`;
                t += `Mit freundlichen Grüßen\n`;
            }
            document.getElementById('mem-body').value = t;
        };

        // Übernimmt den im Dropdown gewählten Ansprechpartner (E-Mail + Anrede/Nachname).
        window.applyMaintEmailContact = function () {
            const ctx = window._memCtx;
            if (!ctx) return;
            const idx = parseInt(document.getElementById('mem-contact')?.value, 10);
            const contact = (idx >= 0 && ctx.contacts) ? ctx.contacts[idx] : null;
            if (contact) {
                if (contact.email) document.getElementById('mem-to').value = contact.email;
                ctx.contact = contact;
            } else {
                ctx.contact = null;
                if (ctx.customerEmail) document.getElementById('mem-to').value = ctx.customerEmail;
            }
            window.rebuildMaintEmailBody();
        };

        window.openMaintEmailModal = async function (machineId) {
            window.ensureMaintEmailModal();
            const m = (window.machineList || []).find(x => x.id === machineId);
            if (!m) { window.showToast('Maschine nicht gefunden.'); return; }

            const machineLabel = [m.manufacturer, m.name, (m.serial || m.serial_number) ? `#${m.serial || m.serial_number}` : null, m.year ? `(${m.year})` : null].filter(Boolean).join(' ');
            const nextStr = m.next_maintenance ? new Date(m.next_maintenance).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
            const lastStr = m.last_maintenance ? new Date(m.last_maintenance).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
            const contacts = Array.isArray(m.contact_persons) ? m.contact_persons : [];

            window._memCtx = {
                machineLabel, nextStr, lastStr, contacts,
                firma: '', customerEmail: '', contact: null
            };

            document.getElementById('mem-to').value = '';
            document.getElementById('mem-cc').value = '';
            document.getElementById('mem-angebot').checked = false;
            document.getElementById('mem-english').checked = false;

            // Ansprechpartner-Dropdown befüllen (nur wenn welche hinterlegt sind).
            const contactWrap = document.getElementById('mem-contact-wrap');
            const contactSel = document.getElementById('mem-contact');
            if (contacts.length) {
                contactSel.innerHTML = '<option value="-1">– Kein Ansprechpartner (allgemeine Anrede) –</option>' +
                    contacts.map((p, i) => {
                        const label = [p.anrede, p.name].filter(Boolean).join(' ') + (p.position ? ` · ${p.position}` : '') + (p.email ? ` · ${p.email}` : '');
                        return `<option value="${i}">${label.replace(/</g, '&lt;')}</option>`;
                    }).join('');
                contactSel.value = '-1';
                contactWrap.style.display = 'block';
            } else {
                contactWrap.style.display = 'none';
            }

            window.rebuildMaintEmailBody();

            const modal = document.getElementById('maint-email-modal');
            modal.style.display = 'flex';

            // Kundendaten (E-Mail + Firmenname) asynchron nachladen und als Fallback nutzen.
            if (m.customer_id && window.supabaseClient) {
                try {
                    const { data: cust } = await window.supabaseClient
                        .from('customers')
                        .select('name, email')
                        .eq('id', m.customer_id)
                        .single();
                    if (cust) {
                        window._memCtx.firma = cust.name || '';
                        window._memCtx.customerEmail = cust.email || '';
                        // Nur vorbelegen, solange der Nutzer noch keinen Ansprechpartner gewählt hat.
                        if (!contacts.length || contactSel.value === '-1') {
                            if (cust.email && !document.getElementById('mem-to').value) {
                                document.getElementById('mem-to').value = cust.email;
                            }
                            window.rebuildMaintEmailBody();
                        }
                    }
                } catch (e) { console.warn('Kundendaten für E-Mail nicht ladbar:', e); }
            }
        };

        window.setMaintStatusFilter = function (status) {
            window.eventsState.statusFilter = (window.eventsState.statusFilter === status) ? 'all' : status;
            window.renderEvents();
        };

        window._editingEventId = null;

        window.openCreateEventModal = function() {
            const modal = document.getElementById('ereignis-modal');
            if (modal) {
                modal.classList.remove('hidden');
                modal.style.display = 'flex';

                window._editingEventId = null;
                const titleEl = document.getElementById('ereignis-modal-title');
                if (titleEl) titleEl.textContent = 'Neues Ereignis';
                // Formularfelder leeren.
                const t = document.getElementById('event-title'); if (t) t.value = '';
                const d = document.getElementById('event-date'); if (d) d.value = '';
                const desc = document.getElementById('event-description'); if (desc) desc.value = '';

                // Neue Zusatzfelder zurücksetzen.
                const manualInput = document.getElementById('event-machine-manual');
                if (manualInput) manualInput.value = '';
                document.querySelectorAll('#event-wartungsart-group .event-wartungsart').forEach(c => { c.checked = false; });

                // Populate machine list
                const machineSelect = document.getElementById('event-machine-select');
                if (machineSelect) {
                    machineSelect.innerHTML = '<option value="">Keine Maschine zugeordnet</option>';
                    (window.machineList || []).forEach(m => {
                        const opt = document.createElement('option');
                        opt.value = m.id;
                        opt.textContent = `${m.manufacturer} ${m.name} (#${m.serial || '?'})`;
                        machineSelect.appendChild(opt);
                    });
                }
            }
        };

        window.closeCreateEventModal = function() {
            const modal = document.getElementById('ereignis-modal');
            if (modal) {
                modal.classList.add('hidden');
                modal.style.display = 'none';
            }
        };

        window.saveEvent = async function(event) {
            event.preventDefault();
            if (!supabaseClient) return;

            const title = document.getElementById('event-title').value;
            const date = document.getElementById('event-date').value;
            const machineId = document.getElementById('event-machine-select').value;
            const description = document.getElementById('event-description').value;
            const manualMachine = document.getElementById('event-machine-manual')?.value.trim() || '';
            const wartungsarten = Array.from(document.querySelectorAll('#event-wartungsart-group .event-wartungsart:checked')).map(c => c.value).join(', ');

            const payload = {
                title: title,
                event_date: date,
                start_date: date,
                machine_id: machineId || null,
                manual_machine: (!machineId && manualMachine) ? manualMachine : null,
                maintenance_types: wartungsarten || null,
                description: description
            };

            let error;
            if (window._editingEventId) {
                ({ error } = await supabaseClient.from('maintenance_events').update(payload).eq('id', window._editingEventId));
            } else {
                payload.status = 'geplant';
                // maintenance_events.user_id ist uuid, die App-Nutzer haben bigint-IDs
                // (public.users) — die bigint-ID geht deshalb nach created_by_user.
                ({ error } = await window.insertMitErsteller('maintenance_events', payload));
            }

            if (error) {
                console.error('Error saving event:', error);
                window.showToast('Fehler beim Speichern des Ereignisses: ' + error.message);
                return;
            }

            window._editingEventId = null;
            window.closeCreateEventModal();
            window.renderEvents();
        };

        // Manuellen Wartungs-Eintrag (maintenance_events) im Ereignis-Fenster bearbeiten.
        window.editManualEvent = async function (eventId) {
            if (!supabaseClient) return;
            const { data: ev, error } = await supabaseClient.from('maintenance_events').select('*').eq('id', eventId).single();
            if (error || !ev) { window.showToast('Eintrag konnte nicht geladen werden.'); return; }

            window.openCreateEventModal();
            window._editingEventId = eventId;
            const titleEl = document.getElementById('ereignis-modal-title');
            if (titleEl) titleEl.textContent = 'Ereignis bearbeiten';

            document.getElementById('event-title').value = ev.title || '';
            document.getElementById('event-date').value = ev.event_date ? String(ev.event_date).split('T')[0] : (ev.start_date ? String(ev.start_date).split('T')[0] : '');
            document.getElementById('event-description').value = ev.description || '';
            const machineSel = document.getElementById('event-machine-select');
            if (machineSel) machineSel.value = ev.machine_id ? String(ev.machine_id) : '';
            const manualInput = document.getElementById('event-machine-manual');
            if (manualInput) manualInput.value = ev.manual_machine || '';

            const arten = (ev.maintenance_types || '').split(',').map(s => s.trim().toLowerCase());
            document.querySelectorAll('#event-wartungsart-group .event-wartungsart').forEach(c => {
                c.checked = arten.includes(c.value.toLowerCase());
            });
        };

        // E-Mail-Fenster für einen manuellen Eintrag (ohne verknüpfte System-Maschine).
        window.openManualEventEmail = function (label) {
            window.ensureMaintEmailModal();
            window._memCtx = {
                machineLabel: label || '', nextStr: '', lastStr: '', contacts: [],
                firma: '', customerEmail: '', contact: null
            };
            document.getElementById('mem-to').value = '';
            document.getElementById('mem-cc').value = '';
            document.getElementById('mem-angebot').checked = false;
            document.getElementById('mem-english').checked = false;
            document.getElementById('mem-contact-wrap').style.display = 'none';
            window.rebuildMaintEmailBody();
            document.getElementById('maint-email-modal').style.display = 'flex';
        };

        window.deleteEvent = async function(id) {
            if (typeof window.canDelete === 'function' && !window.canDelete('Terminen')) return;
            if (!confirm('Dieses Ereignis wirklich löschen?')) return;
            if (!supabaseClient) return;

            const { error } = await supabaseClient
                .from('maintenance_events')
                .delete()
                .eq('id', id);

            if (error) {
                console.error('Error deleting event:', error);
                window.showToast('Fehler beim Löschen: ' + error.message);
                return;
            }

            window.renderEvents();
        };

        // Global Initialization for Events
        document.addEventListener('DOMContentLoaded', () => {
            const searchInput = document.getElementById('calendar-search-input');
            if (searchInput) {
                searchInput.addEventListener('input', () => {
                    if (window.eventsState && window.eventsState.currentSubView === 'processes') {
                        window.renderProcesses();
                    } else {
                        window.renderEvents();
                    }
                });
            }

            const filterTrigger = document.getElementById('calendar-category-filter-trigger');
            if (filterTrigger) {
                filterTrigger.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const menu = document.getElementById('calendar-category-filter-menu');
                    if (menu) {
                        menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
                        if (menu.style.display === 'block') populateCalendarCategoryFilter();
                    }
                });
            }

            const processFilterTrigger = document.getElementById('process-status-filter-trigger');
            if (processFilterTrigger) {
                processFilterTrigger.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const menu = document.getElementById('process-status-filter-menu');
                    if (menu) {
                        menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
                    }
                });
            }

            // Global click handler to close dropdowns when clicking outside
            document.addEventListener('click', (e) => {
                const processMenu = document.getElementById('process-status-filter-menu');
                const processTrigger = document.getElementById('process-status-filter-trigger');
                if (processMenu && processMenu.style.display === 'block' && 
                    processTrigger && !processTrigger.contains(e.target) && !processMenu.contains(e.target)) {
                    processMenu.style.display = 'none';
                }
                
                const calendarMenu = document.getElementById('calendar-category-filter-menu');
                const calendarTrigger = document.getElementById('calendar-category-filter-trigger');
                if (calendarMenu && calendarMenu.style.display === 'block' && 
                    calendarTrigger && !calendarTrigger.contains(e.target) && !calendarMenu.contains(e.target)) {
                    calendarMenu.style.display = 'none';
                }
            });

            const senderInput = document.getElementById('email-sender-input');
            if (senderInput) {
                senderInput.addEventListener('change', (e) => {
                    const val = e.target.value;
                    let email = '';
                    const emailMatch = val.match(/<([^>]+)>/) || val.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
                    if (emailMatch) email = emailMatch[1] || emailMatch[0];
                    if (email) {
                        window.runSmartCustomerMatching(email, '');
                    }
                });
            }

            // Initialize Customer Autocomplete for Import Modal
            window.setupCustomerAutocomplete('email-sender-input', 'email-sender-suggestions', 'import');
            window.setupCustomerAutocomplete('email-recipient-input', 'email-recipient-suggestions', 'import');

            // Initialize Customer Autocomplete for Edit Modal
            window.setupCustomerAutocomplete('edit-process-sender-input', 'edit-process-sender-suggestions', 'edit');
            window.setupCustomerAutocomplete('edit-process-recipient-input', 'edit-process-recipient-suggestions', 'edit');

            // Initialize Type Selection Change Listeners (re-sync address when type changes)
            const emailTypeSelect = document.getElementById('email-type-select');
            if (emailTypeSelect) {
                emailTypeSelect.addEventListener('change', () => {
                    window.syncAddressFromMachine('email-machine-select', 'email-type-select', 'email-sender-input', 'email-recipient-input');
                    window.updateEmailBodyVisibility('email');
                });
            }
            const editTypeSelect = document.getElementById('edit-process-type-select');
            if (editTypeSelect) {
                editTypeSelect.addEventListener('change', () => {
                    window.syncAddressFromMachine('edit-process-machine-select', 'edit-process-type-select', 'edit-process-sender-input', 'edit-process-recipient-input');
                    window.updateEmailBodyVisibility('edit-process');
                });
            }
        });

        function populateCalendarCategoryFilter() {
            const list = document.getElementById('calendar-category-filter-options');
            if (!list) return;

            list.innerHTML = `<li onclick="selectCalendarCategory(null, 'Alle Kategorien')">Alle Kategorien</li>`;

            const machineCats = (window.categoryList || []).filter(c => c.type === 'machine');
            machineCats.forEach(cat => {
                const li = document.createElement('li');
                li.textContent = cat.name;
                li.onclick = (e) => {
                    e.stopPropagation();
                    selectCalendarCategory(cat.id, cat.name);
                };
                list.appendChild(li);
            });
        }

        window.selectCalendarCategory = function (id, name) {
            window.eventsState.selectedCategoryId = id;
            const label = document.getElementById('calendar-current-category-name');
            if (label) label.textContent = name;

            const menu = document.getElementById('calendar-category-filter-menu');
            if (menu) menu.style.display = 'none';

            window.renderEvents();
        };
