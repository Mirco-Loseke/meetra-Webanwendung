// ==========================================================
// Historie: Verlauf einer Maschine, manuelle Eintraege, Fotos, E-Mail- und WhatsApp-Darstellung
// ==========================================================
// Ausgelagert aus index.html (vormals Zeilen 11812-13448).
// Wird in index.html an unveraenderter Stelle per <script src> geladen;
// die Reihenfolge der Skripte entspricht der fruaeheren Reihenfolge im
// Inline-Block und darf nicht vertauscht werden.
// ==========================================================
        window.currentHistoryMachineId = null;

        window.openSingleMachineEvaluation = async function (machineId) {
            const modal = document.getElementById('single-machine-evaluation-modal');
            const content = document.getElementById('single-machine-evaluation-content');
            if (!modal || !content) return;

            const machine = (window.machineList || []).find(m => String(m.id) === String(machineId));
            console.log('[Evaluation] machineId:', machineId, 'found:', machine);
            const machineTitle = machine
                ? [machine.manufacturer, machine.name, (machine.serial_number || machine.serial) ? `#${machine.serial_number || machine.serial}` : null, machine.year ? `(${machine.year})` : null].filter(Boolean).join(' ')
                : `Maschine #${machineId}`;

            modal.classList.remove('hidden');
            modal.style.display = 'flex';
            requestAnimationFrame(() => modal.classList.add('show'));

            content.innerHTML = '<div style="text-align: center; color: rgba(255,255,255,0.4); padding: 2rem;">Lade Auswertung...</div>';

            try {
                // Belege mit Positionen für diese Maschine laden — die Positionen liegen als
                // JSONB-Array am Beleg (accounting.items); der contains-Filter (@>) findet
                // serverseitig alle Belege, deren Array ein Objekt mit dieser machine_id enthält.
                const { data, error } = await window.supabaseClient
                    .from('accounting')
                    .select('id, date, created_at, type, items')
                    .contains('items', JSON.stringify([{ machine_id: Number(machineId) }]));

                if (error) throw error;

                // Calculate total costs
                let totalCosts = 0;
                const monthlyBreakdown = {};
                let matchCount = 0;

                (data || []).forEach(entry => {
                    const items = Array.isArray(entry.items) ? entry.items : [];
                    items.forEach(item => {
                        if (String(item.machine_id) !== String(machineId)) return;
                        matchCount++;

                        const price = parseFloat(item.price_net) || 0;
                        const qty = parseFloat(item.quantity) || 1;
                        const sum = price * qty;
                        totalCosts += sum;

                        // Use date if available, otherwise created_at
                        const date = new Date(entry.date || entry.created_at);
                        const monthKey = date.toLocaleString('de-DE', { month: 'long', year: 'numeric' });

                        if (!monthlyBreakdown[monthKey]) monthlyBreakdown[monthKey] = 0;
                        monthlyBreakdown[monthKey] += sum;
                    });
                });

                if (matchCount === 0) {
                    content.innerHTML = '<div style="padding: 2rem; text-align: center; color: rgba(255,255,255,0.4);">Keine Buchungen für diese Maschine gefunden.</div>';
                    return;
                }

                // Sort months (simplified)
                const sortedMonths = Object.keys(monthlyBreakdown).sort((a, b) => {
                    const dateA = new Date(a.split(' ')[1], ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'].indexOf(a.split(' ')[0]));
                    const dateB = new Date(b.split(' ')[1], ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'].indexOf(b.split(' ')[0]));
                    return dateB - dateA;
                });

                let html = `
                        <div style="margin-bottom: 1.5rem; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 1rem;">
                            <div style="font-size: 0.65rem; color: rgba(255,255,255,0.35); font-weight: 800; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 0.2rem;">Auswertung für</div>
                            <div style="font-size: 0.95rem; font-weight: 700; color: var(--color-primary-green); line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${machineTitle}</div>
                        </div>
                        <div style="background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.2); padding: 0.85rem 1.25rem; border-radius: 14px; margin-bottom: 1.5rem; display: flex; align-items: center; justify-content: space-between;">
                            <div style="font-size: 0.75rem; color: rgba(16, 185, 129, 0.7); font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">Gesamtkosten (Netto)</div>
                            <div style="font-size: 1.5rem; font-weight: 800; color: white;">${totalCosts.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}</div>
                        </div>
                        <div style="max-height: 300px; overflow-y: auto; padding-right: 4px;">
                            <div style="font-size: 0.75rem; font-weight: 800; color: rgba(255,255,255,0.4); text-transform: uppercase; margin-bottom: 1rem; letter-spacing: 1px;">Monatliche Auflistung</div>
                            ${sortedMonths.map(month => `
                                <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; margin-bottom: 8px;">
                                    <span style="color: rgba(255,255,255,0.8); font-weight: 600;">${month}</span>
                                    <span style="color: white; font-weight: 800;">${monthlyBreakdown[month].toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}</span>
                                </div>
                            `).join('')}
                        </div>
                    `;
                content.innerHTML = html;

            } catch (error) {
                console.error("Error in machine evaluation:", error);
                content.innerHTML = '<div style="padding: 2rem; text-align: center; color: #ef4444;">Fehler beim Laden der Auswertung.</div>';
            }
        };

        window.closeSingleMachineEvaluation = function () {
            const modal = document.getElementById('single-machine-evaluation-modal');
            if (modal) {
                modal.classList.remove('show');
                setTimeout(() => modal.classList.add('hidden'), 300);
            }
        };

        // Zerlegt eingefügten WhatsApp-Verlauf ("[10:13, 19.6.2026] Name: Text") in einzelne
        // Nachrichten und stellt sie als Liste dar (Datum/Uhrzeit links, Text daneben) statt
        // als einen durchgehenden Fließtext. Mehrzeilige Nachrichten ohne neuen Zeitstempel
        // werden der vorherigen Nachricht angehängt.
        function escHistoryText(s) {
            if (s === null || s === undefined) return '';
            return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        }

        // Entfernt die spitze-Klammern-E-Mail-Adresse aus "Name <email>" (mehrere, durch ";"
        // getrennte Empfänger werden einzeln behandelt) — übrig bleibt nur der Anzeigename.
        // Steht kein Name davor (nur eine nackte E-Mail-Adresse), bleibt die Adresse als
        // einzige verfügbare Information stehen.
        function stripEmailAngleBrackets(str) {
            if (!str) return '';
            return str.split(';').map(part => {
                const trimmed = part.trim();
                const match = trimmed.match(/^(.*?)\s*<[^>]+>$/);
                return (match && match[1].trim()) ? match[1].trim() : trimmed;
            }).filter(Boolean).join('; ');
        }

        // Strukturierte, lesbare Darstellung eines manuellen E-Mail-Historieneintrags
        // (Von/An je eigene Zeile, hervorgehobene Bemerkung, eigentlicher E-Mail-Text) — analog
        // zur Vorgänge-Tabelle (internal_processes), nur als Zeitleisten-Karte statt Tabellenzeile.
        function buildEmailHistoryHtml(m) {
            const parts = [];
            const metaLines = [];
            if (m.sender) metaLines.push(`Von: ${stripEmailAngleBrackets(m.sender)}`);
            if (m.recipient) metaLines.push(`An: ${stripEmailAngleBrackets(m.recipient)}`);
            if (metaLines.length > 0) {
                parts.push(`<div style="font-size:0.8rem; color:rgba(255,255,255,0.45); font-weight:700; margin-bottom:8px; white-space:pre-wrap;">${escHistoryText(metaLines.join('\n'))}</div>`);
            }
            if (m.remark) {
                parts.push(`<div style="font-size:0.88rem; color:#fbbf24; background:rgba(245,158,11,0.08); border:1px solid rgba(245,158,11,0.25); border-radius:8px; padding:8px 12px; margin-bottom:8px; white-space:pre-wrap;"><strong style="color:#f59e0b;">Bemerkung:</strong> ${escHistoryText(m.remark)}</div>`);
            }
            if (m.content) {
                parts.push(`<div style="color: rgba(255,255,255,0.75); font-size:0.92rem; line-height:1.6; white-space:pre-wrap;">${escHistoryText(m.content)}</div>`);
            }
            return parts.join('') || null;
        }

        function renderWhatsAppMessages(text) {
            if (!text) return '';
            const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

            // Beim Kopieren direkt aus WhatsApp Web/Desktop (statt über "Chat exportieren")
            // landen zwischen den Nachrichten oft GAR KEINE echten Zeilenumbrüche, nur
            // Leerzeichen — dann ist der ganze Text nur eine einzige "Zeile". Deshalb wird hier
            // nicht zeilenweise gesucht, sondern der gesamte Text nach allen Zeitstempel-Mustern
            // durchsucht (egal ob mitten im Fließtext oder am Zeilenanfang), und an jeder
            // Fundstelle eine neue Nachricht begonnen. Erkennt sowohl "[Uhrzeit, Datum]" als
            // auch "[Datum, Uhrzeit]" (je nach Gerät/Sprache unterschiedliche Reihenfolge) sowie
            // das klammerlose Android-Format "Datum, Uhrzeit - Name: Text".
            const headerRegex = /\[([^,\]\n]+),\s*([^\]\n]+)\]\s*([^:\n]+):\s*|(?:^|\n)(\d{1,2}\.\d{1,2}\.\d{2,4}),?\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*-\s*([^:\n]+):\s*/g;

            const messages = [];
            let lastIndex = 0;
            let match;
            let pending = null;

            while ((match = headerRegex.exec(text)) !== null) {
                const between = text.slice(lastIndex, match.index).trim();
                if (pending) {
                    pending.text = between;
                    messages.push(pending);
                } else if (between) {
                    messages.push({ time: '', date: '', sender: '', text: between });
                }

                let time, date, sender;
                if (match[1] !== undefined) {
                    const p1 = match[1].trim();
                    const p2 = match[2].trim();
                    if (p1.includes(':')) { time = p1; date = p2; } else { time = p2; date = p1; }
                    sender = match[3].trim();
                } else {
                    date = match[4].trim();
                    time = match[5].trim();
                    sender = match[6].trim();
                }
                time = time.replace(/^(\d{1,2}:\d{2}):\d{2}$/, '$1'); // Sekunden für die Anzeige weglassen
                pending = { time, date, sender };
                lastIndex = headerRegex.lastIndex;
            }

            if (pending) {
                pending.text = text.slice(lastIndex).trim();
                messages.push(pending);
            } else {
                const rest = text.slice(lastIndex).trim();
                if (rest) messages.push({ time: '', date: '', sender: '', text: rest });
            }

            if (messages.length === 0) return '';

            // Pro Tag eine eigene, etwas größere Überschrift statt das Datum bei jeder
            // einzelnen Nachricht zu wiederholen. Der Kontaktname steht (grün) bereits einmal
            // im Titel über dem Trenner — pro Nachricht reicht daher die schlichte Form
            // "[Uhrzeit] Name: Text", direkt untereinander wie im echten Chatverlauf (kein
            // Absatzabstand dazwischen, sonst wirkt es wieder wie Fließtext).
            let html = '';
            let lastDate = null;
            messages.forEach(m => {
                if (m.date && m.date !== lastDate) {
                    html += `<div style="font-size:0.95rem; font-weight:800; color:#fff; margin: ${lastDate ? '18px' : '0'} 0 10px 0; padding-bottom:6px; border-bottom:1px solid rgba(255,255,255,0.08);">${esc(m.date)}</div>`;
                    lastDate = m.date;
                }
                const prefix = m.time ? `<span style="color:#22c55e;">[${esc(m.time)}]</span> ` : '';
                const senderPart = m.sender ? `${esc(m.sender)}: ` : '';
                html += `<div style="font-size:0.9rem; color:rgba(255,255,255,0.85); line-height:1.6; white-space:pre-wrap;">${prefix}${senderPart}${esc(m.text)}</div>`;
            });
            return html;
        }

        window.openHistoryModal = async function (machineId) {
            window.currentHistoryMachineId = machineId;
            window.toggleManualHistoryForm(null); // Reset form
            const modal = document.getElementById('machine-history-modal');
            const container = document.getElementById('history-timeline-container');
            if (!modal || !container || !window.supabaseClient) return;

            modal.classList.remove('hidden');
            modal.style.display = 'flex';
            requestAnimationFrame(() => {
                modal.classList.add('show');
            });
            container.innerHTML = '<div style="text-align: center; color: rgba(255,255,255,0.4); padding: 2rem;">Lade Historie...</div>';

            try {
                // Fetch data concurrently
                const [
                    serviceRes,
                    procRes,
                    calRes,
                    intakeRes,
                    acceptanceRes,
                    vorgangRes
                ] = await Promise.all([
                    // Schlanke Spaltenauswahl für die Zeitleisten-Anzeige — die schweren JSONB-Felder
                    // (work_log, materials) werden hier nicht gebraucht, da das Öffnen zum Bearbeiten
                    // (openEditServicebericht) ohnehin nochmal alles frisch lädt. checklist_payload
                    // wird trotzdem mitgeladen, um bei Wartungsberichten anzuzeigen, was davon
                    // tatsächlich gedruckt/gewartet wurde (siehe window.getMaintenanceScopeLabel).
                    window.supabaseClient.from('service_entries').select('id, machine_id, category_id, title, date, created_at, description, pdf_url, files, previous_report_id, checklist_payload, operating_hours').eq('machine_id', machineId),
                    window.supabaseClient.from('tasks').select('*').eq('machine_id', machineId),
                    window.supabaseClient.from('calendar_events').select('*').eq('machine_id', machineId),
                    window.supabaseClient.from('intake_protocols').select('*').eq('machine_id', machineId),
                    window.supabaseClient.from('acceptance_protocols').select('*').eq('machine_id', machineId),
                    window.supabaseClient.from('internal_processes').select('id, title, process_date, created_at, steps').eq('machine_id', machineId)
                ]);

                // Volle Datensätze weiterhin für die Offline-Bearbeitung cachen — bewusst NICHT
                // Teil des Promise.all oben, damit die Historie nicht auf die schweren JSONB-Felder
                // warten muss; läuft einfach im Hintergrund nach, sobald fertig.
                if (window.offlineService) {
                    window.supabaseClient.from('service_entries').select('*').eq('machine_id', machineId)
                        .then(({ data }) => { if (data) window.offlineService.cacheFullEntries(data).catch(() => {}); })
                        .catch(() => {});
                }

                let historyItems = [];

                if (serviceRes.data) {
                    // Verknuepfungs-Lookup (Folgebericht = umgekehrte Richtung von previous_report_id),
                    // lokal aus derselben Abfrage gebaut statt aus dem globalen allServiceEntries, damit
                    // sie unabhaengig vom Ladezustand der Serviceberichte-Liste zuverlaessig stimmt.
                    const followUpByPreviousId = {};
                    const serviceEntryById = {};
                    serviceRes.data.forEach(s => {
                        serviceEntryById[s.id] = s;
                        if (s.previous_report_id) followUpByPreviousId[s.previous_report_id] = s.id;
                    });

                    serviceRes.data.forEach(s => {
                        const isWorkshopStatus = s.title === 'Werkstattaufenthalt Beginn' || s.title === 'Werkstattaufenthalt Ende';

                        // Find category color
                        const cat = (window.categoryList || []).find(c => c.id === s.category_id);
                        const catColor = cat ? cat.color : (isWorkshopStatus ? '#f59e0b' : '#3b82f6');

                        historyItems.push({
                            id: s.id,
                            machineId: machineId,
                            date: new Date(s.date || s.created_at),
                            type: isWorkshopStatus ? 'Werkstatt-Status' : 'Servicebericht',
                            title: s.title || 'Servicebericht',
                            description: s.description || '',
                            color: catColor,
                            icon: isWorkshopStatus ? '🔧' : '📄',
                            itemType: isWorkshopStatus ? 'workshop' : 'service',
                            pdf_url: s.pdf_url,
                            files: s.files || [],
                            maintenanceScope: typeof window.getMaintenanceScopeLabel === 'function' ? window.getMaintenanceScopeLabel(s.checklist_payload) : null,
                            operatingHours: (s.operating_hours != null && String(s.operating_hours).trim() !== '') ? String(s.operating_hours).trim().replace(/\s*(h|std\.?|stunden)\s*$/i, '').trim() : null,
                            linkedReportId: s.previous_report_id || followUpByPreviousId[s.id] || null,
                            isFollowUpReport: !!s.previous_report_id,
                            linkedReportDate: (() => {
                                const linkedId = s.previous_report_id || followUpByPreviousId[s.id];
                                const linkedEntry = linkedId ? serviceEntryById[linkedId] : null;
                                return linkedEntry ? new Date(linkedEntry.date || linkedEntry.created_at).toLocaleDateString('de-DE') : '';
                            })()
                        });
                    });
                }

                if (procRes.data) {
                    procRes.data.filter(p => p.status === 'completed').forEach(p => {
                        let completingUser = null;
                        if (p.completed_by) {
                            completingUser = window.userList?.find(u => u.id == p.completed_by);
                        }
                        if (!completingUser && p.created_by) {
                            completingUser = window.userList?.find(u => u.id == p.created_by);
                        }
                        if (!completingUser && p.assigned_to && p.assigned_to.length > 0) {
                            completingUser = window.userList?.find(u => u.id == p.assigned_to[0]);
                        }

                        historyItems.push({
                            id: p.id,
                            machineId: machineId,
                            date: new Date(p.completed_at || p.updated_at || p.created_at),
                            type: 'Aufgabe',
                            title: p.title || p.task || 'Aufgabe',
                            description: p.description || '',
                            color: '#f59e0b',
                            icon: '📋',
                            itemType: 'procurement',
                            user: completingUser
                        });
                    });
                }

                if (calRes.data) {
                    calRes.data.forEach(c => {
                        historyItems.push({
                            id: c.id,
                            date: new Date(c.start_time || c.created_at),
                            type: 'Termin',
                            title: c.title || 'Termin',
                            description: c.description || '',
                            color: '#10b981',
                            icon: '📅',
                            itemType: 'calendar'
                        });
                    });
                }

                if (intakeRes.data) {
                    intakeRes.data.forEach(p => {
                        historyItems.push({
                            id: p.id,
                            machineId: machineId,
                            date: new Date(p.created_at),
                            type: 'Eingangsprotokoll',
                            title: 'Eingangsprotokoll',
                            status: p.status,
                            description: 'Erstellt am ' + new Date(p.created_at).toLocaleDateString(),
                            color: '#8b5cf6',
                            icon: '📥',
                            itemType: 'intake'
                        });
                    });
                }

                if (acceptanceRes.data) {
                    acceptanceRes.data.forEach(p => {
                        historyItems.push({
                            id: p.id,
                            machineId: machineId,
                            date: new Date(p.created_at),
                            type: 'Abnahmeprotokoll',
                            title: 'Abnahmeprotokoll',
                            status: p.status,
                            description: 'Erstellt am ' + new Date(p.created_at).toLocaleDateString(),
                            color: '#ec4899',
                            icon: '✅',
                            itemType: 'acceptance'
                        });
                    });
                }

                if (vorgangRes.data) {
                    vorgangRes.data.forEach(p => {
                        const steps = Array.isArray(p.steps) ? p.steps : [];
                        const stepsDone = steps.filter(s => s.done).length;
                        historyItems.push({
                            id: p.id,
                            machineId: machineId,
                            date: new Date(p.process_date || p.created_at),
                            type: 'Vorgang',
                            title: p.title || 'Vorgang',
                            description: steps.length ? `Schritte: ${stepsDone}/${steps.length} erledigt` : '',
                            color: '#818cf8',
                            icon: '🗂️',
                            itemType: 'process'
                        });
                    });
                }

                if (window.supabaseClient) {
                    const { data: manualEntries, error: manualError } = await window.supabaseClient
                        .from('manual_history_entries')
                        .select('*')
                        .eq('machine_id', machineId);

                    if (manualEntries) {
                        manualEntries.forEach(m => {
                            const typeMap = {
                                'phone': { label: 'Telefon', icon: '📞', color: '#10b981' },
                                'note': { label: 'Bemerkung', icon: '📝', color: '#f59e0b' },
                                'email': { label: 'E-Mail', icon: '✉️', color: '#3b82f6' },
                                'photo': {
                                    label: (m.files && Array.isArray(m.files) && m.files.length > 0) ? `Foto <span style="display:inline-flex; align-items:center; background:rgba(139,92,246,0.2); padding:2px 8px; border-radius:12px; font-size:0.7rem; margin-left:8px; color:#c4b5fd; border: 1px solid rgba(139,92,246,0.3);"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>${m.files.length}</span>` : 'Foto',
                                    icon: '📸',
                                    color: '#8b5cf6'
                                },
                                'hours': { label: 'Betriebsstunden', icon: '⏱️', color: '#06b6d4' },
                                'whatsapp': { label: 'WhatsApp', icon: '💬', color: '#22c55e' },
                                'wartung': { label: 'Wartung', icon: '🔧', color: '#f97316' },
                                'auslieferung': { label: 'Auslieferung', icon: '🚚', color: '#6366f1' },
                                'angebot': { label: 'Angebot', icon: '📃', color: '#eab308' }
                            };
                            const config = typeMap[m.type] || { label: 'Eintrag', icon: '📄', color: '#9ca3af' };

                            // Find user from global list since join might fail without FK
                            const user = window.userList?.find(u => u.id == m.created_by);

                            let mDescription = m.content;
                            let mEmailHtml = null;
                            let mOperatingHours = null;
                            if (m.type === 'hours' && m.content) {
                                // Stunden nicht mehr als "1450 Std."-Text, sondern als blaues Badge (mit "h").
                                mOperatingHours = String(m.content).trim().replace(/\s*(h|std\.?|stunden)\s*$/i, '').trim();
                                mDescription = '';
                            } else if (m.type === 'email') {
                                mEmailHtml = buildEmailHistoryHtml(m);
                            }

                            historyItems.push({
                                id: m.id,
                                date: new Date(m.created_at),
                                type: config.label,
                                title: m.title,
                                description: mDescription,
                                operatingHours: mOperatingHours,
                                emailHtml: mEmailHtml,
                                remark: m.remark || null,
                                rawType: m.type,
                                angebotId: m.angebot_id || null,
                                endDate: m.end_date || null,
                                color: config.color,
                                icon: config.icon,
                                source: 'manuell',
                                user: user, // Populated from global list
                                files: m.files // Added files here
                            });
                        });
                    }
                }

                // Sort descending (newest top)
                historyItems.sort((a, b) => b.date - a.date);

                if (historyItems.length === 0) {
                    container.innerHTML = '<div style="text-align: center; color: rgba(255,255,255,0.4); padding: 2rem;">Keine Einträge für diese Maschine vorhanden.</div>';
                    return;
                }

                let html = '';
                let lastYear = null;
                let clampCounter = 0;

                historyItems.forEach(item => {
                    const currentYear = item.date.getFullYear();
                    if (lastYear !== currentYear) {
                        html += `
                                <div class="history-item-premium history-item-year">
                                    <div class="history-icon" style="position: absolute; left: -48px; top: 1.25rem; width: 32px; height: 32px; border-radius: 50%; background: rgba(255,255,255,0.05); border: 2.5px solid rgba(255,255,255,0.2); display: flex; align-items: center; justify-content: center; font-size: 0.9rem; z-index: 2;">
                                        📅
                                    </div>
                                    <div class="history-content-inner">
                                        <h3>${currentYear}</h3>
                                    </div>
                                </div>
                            `;
                        lastYear = currentYear;
                    }

                    const dateStr = item.date.toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' });

                    const sourceTag = item.source === 'manuell'
                        ? `<span class="history-tag-badge" style="background: rgba(16,185,129,0.15); color: #10b981; border-color: rgba(16,185,129,0.3);">MANUELL</span>`
                        : `<span class="history-tag-badge" style="background: rgba(255,255,255,0.05); color: rgba(255,255,255,0.4);">SYSTEM</span>`;

                    const isAdmin = window.activeUser && (window.activeUser.name === 'Mirco Loseke');

                    // Datum: eigene Zeile UNTER dem Titel, gross, fett, weiss.
                    // Vorher stand es als kleine graue Pille oben rechts neben
                    // der Typ-Bezeichnung und war kaum zu lesen. Die Bearbeit-
                    // barkeit (Klick öffnet den Datumswähler) bleibt erhalten —
                    // nur bei manuellen Einträgen und für Admins bei den
                    // systemseitigen Arten.
                    const systemEditableTypes = ['service', 'workshop', 'procurement', 'intake', 'acceptance', 'calendar'];
                    const darfDatumAendern = item.source === 'manuell'
                        || (isAdmin && item.id && systemEditableTypes.includes(item.itemType));
                    const datumAendernFn = item.source === 'manuell'
                        ? `window.updateManualEntryDate('${item.id}', this.value)`
                        : `window.updateSystemEntryDate('${item.itemType}', '${item.id}', this.value)`;

                    const dateBlock = darfDatumAendern
                        ? `<div class="history-date-line is-editable" title="Datum ändern"
                                onclick="this.nextElementSibling.showPicker ? this.nextElementSibling.showPicker() : this.nextElementSibling.click()">${dateStr}</div>
                           <input type="date" value="${item.date.toISOString().split('T')[0]}" style="position: absolute; opacity: 0; width: 1px; height: 1px; pointer-events: none;" onchange="${datumAendernFn}">`
                        : `<div class="history-date-line">${dateStr}</div>`;
                    // Use string comparison or conversion to avoid UUID type mismatch if table expects Integer
                    const deleteBtn = (isAdmin && item.id) ? `
                            <button onclick="window.deleteHistoryEntry('${item.id}', '${item.itemType || 'manual'}')" class="btn-icon-circular delete" title="Löschen">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                            </button>
                        ` : '';

                    let actionButtons = `<div style="display: flex; gap: 0.75rem; margin-top: 1rem; align-items: center;">`;

                    if (item.itemType === 'service') {
                        const pdfIcon = item.pdf_url ? `
                                <button onclick="window.previewDocument('${item.pdf_url}', 'Servicebericht', 'application/pdf')" class="btn-icon-circular" style="background: rgba(236,72,153,0.15); border-color: rgba(236,72,153,0.4); color: #ec4899;" title="PDF Öffnen">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                                </button>
                            ` : '';

                        const hasAttachments = item.files && item.files.length > 0;
                        const attachmentIcon = hasAttachments ? `
                                <button onclick="window.openServiceAttachments(${JSON.stringify(item.files).replace(/"/g, '&quot;')})" class="btn-icon-circular" style="background: rgba(139,92,246,0.15); border-color: rgba(139,92,246,0.4); color: #a78bfa;" title="Anhänge öffnen (${item.files.length})">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>
                                </button>
                            ` : '';

                        const linkIcon = item.linkedReportId ? `
                                <button onclick="window.jumpToServicebericht(${item.linkedReportId})" class="btn-icon-circular" style="background: rgba(16,185,129,0.15); border-color: rgba(16,185,129,0.4); color: var(--color-primary-green);" title="${item.isFollowUpReport ? 'Verknüpft — zum vorherigen Bericht springen' : 'Verknüpft — zum Folgebericht springen'}">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
                                </button>
                            ` : '';

                        // Alle Einträge aus service_entries sind Serviceberichte —
                        // das eigenständige UVV-Fenster gibt es nicht mehr, auch
                        // seine Altbestände öffnen im Servicebericht-Editor.
                        const openCall = `window.openEditServicebericht(${item.id})`;

                        actionButtons += `
                                <button onclick="${openCall}" class="btn-icon-circular edit" title="Öffnen">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                </button>
                                ${linkIcon}
                                ${attachmentIcon}
                                ${pdfIcon}
                            `;
                    } else if (item.itemType === 'intake' || item.itemType === 'acceptance') {
                        const openFn = item.itemType === 'intake' ? 'openIntakeProtocol' : 'openAcceptanceProtocol';
                        const pdfIcon = item.status === 'completed' ? `
                                <button onclick="window.openProtocolPDF(${item.machineId}, '${item.id}', '${item.itemType}')" class="btn-icon-circular" style="background: rgba(236,72,153,0.15); border-color: rgba(236,72,153,0.4); color: #ec4899;" title="PDF Öffnen">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                                </button>
                            ` : '';

                        actionButtons += `
                                <button onclick="window.${openFn}(${item.machineId}, '${item.id}')" class="btn-icon-circular edit" title="Öffnen">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                </button>
                                ${pdfIcon}
                            `;

                    } else if (item.itemType === 'procurement') {
                        actionButtons += `
                                <button onclick="window.navigateToTask('${item.id}')" class="btn-icon-circular edit" title="Aufgabe öffnen">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                                </button>
                            `;
                    } else if (item.itemType === 'process') {
                        actionButtons += `
                                <button onclick="window.navigateToProcess('${item.id}')" class="btn-icon-circular edit" title="Vorgang öffnen">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                </button>
                            `;
                    } else if (item.rawType === 'angebot') {
                        actionButtons += `
                                <button onclick="window.navigateToAngebot('${item.angebotId}')" class="btn-icon-circular edit" title="Beleg in Listen öffnen">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                                </button>
                            `;
                    } else if (item.source === 'manuell') {
                        actionButtons += `
                                <button onclick="window.editManualHistoryEntry('${item.id}')" class="btn-icon-circular edit" title="Bearbeiten">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                </button>
                            `;
                    }

                    actionButtons += `${deleteBtn}</div>`;

                    let userBadge = '';
                    if (item.user) {
                        let initials = '?';
                        if (item.user.initials) {
                            initials = item.user.initials;
                        } else {
                            const name = item.user.name || '';
                            const parts = name.trim().split(' ');
                            if (parts.length >= 2) {
                                initials = (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
                            } else {
                                initials = name.substring(0, 2).toUpperCase() || '?';
                            }
                        }

                        let color = '#3b82f6';
                        if (item.user.color) {
                            color = item.user.color;
                        } else {
                            const name = item.user.name || '';
                            let hash = 0;
                            for (let i = 0; i < name.length; i++) {
                                hash = name.charCodeAt(i) + ((hash << 5) - hash);
                            }
                            const colors = [
                                'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                                'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
                                'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                                'linear-gradient(135deg, #ec4899 0%, #db2777 100%)',
                                'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)',
                                'linear-gradient(135deg, #eab308 0%, #ca8a04 100%)'
                            ];
                            const index = Math.abs(hash) % colors.length;
                            color = colors[index];
                        }

                        userBadge = `
                                <div title="${item.user.name}" style="width: 32px; height: 32px; border-radius: 50%; background: ${color}; display: flex; align-items: center; justify-content: center; color: white; font-weight: 700; font-size: 0.7rem; flex-shrink: 0; box-shadow: 0 0 10px ${color.includes('gradient') ? 'rgba(59,130,246,0.3)' : color}60; border: 2px solid rgba(255,255,255,0.15);">
                                    ${initials}
                                </div>
                            `;
                    }

                    let photoGallery = '';
                    if (item.source === 'manuell' && item.files && Array.isArray(item.files) && item.files.length > 0) {
                        photoGallery = `
                                <div style="display: flex; gap: 8px; margin-top: 1rem; overflow-x: auto; padding-bottom: 4px;">
                                    ${item.files.map((fileUrl, index) => `
                                        <div onclick="openPhotosLightbox(${JSON.stringify(item.files).replace(/"/g, '&quot;')}, ${index})" 
                                             style="width: 80px; height: 80px; flex-shrink: 0; border-radius: 8px; overflow: hidden; border: 1px solid rgba(255,255,255,0.1); cursor: pointer; transition: transform 0.2s; position: relative;"
                                             onmouseover="this.style.transform='scale(1.05)'; this.querySelector('.overlay').style.opacity='1'"
                                             onmouseout="this.style.transform='scale(1)'; this.querySelector('.overlay').style.opacity='0'">
                                            <img src="${fileUrl}" loading="lazy" style="width: 100%; height: 100%; object-fit: cover;">
                                            <div class="overlay" style="position: absolute; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.2s;">
                                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="11" y1="8" x2="11" y2="14"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>
                                            </div>
                                        </div>
                                    `).join('')}
                                </div>
                            `;
                    }

                    html += `
                            <div class="history-item-premium">
                                <div class="history-icon" style="position: absolute; left: -48px; top: 1.25rem; width: 32px; height: 32px; border-radius: 50%; background: ${item.color}20; border: 2.5px solid ${item.color}; display: flex; align-items: center; justify-content: center; font-size: 0.9rem; box-shadow: 0 0 15px ${item.color}40; z-index: 2;">
                                    ${item.icon}
                                </div>
                                <div class="history-content-inner">
                                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem; gap: 0.5rem;">
                                        <div style="display: flex; align-items: center; gap: 0.5rem;">
                                            <span style="font-size: 0.7rem; font-weight: 900; color: ${item.color}; text-transform: uppercase; letter-spacing: 1.5px;">${item.type}</span>
                                        </div>
                                        <div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
                                            ${sourceTag}
                                        </div>
                                    </div>
                                    ${(() => {
                                        // Titel weglassen, wenn er nur die Typ-Bezeichnung wiederholt
                                        // (z.B. "Servicebericht"/"Betriebsstunden") — die steht oben schon farbig.
                                        const t = (item.title || '').trim();
                                        const typeLabel = String(item.type || '').replace(/<[^>]*>/g, '').trim();
                                        if (!t || t.toLowerCase() === typeLabel.toLowerCase()) return '';
                                        return `<h4 style="margin: 0 0 0.35rem 0; color: #fff; font-size: 1rem; font-weight: 700; letter-spacing: -0.01em; white-space: pre-wrap;">${escHistoryText(t)}</h4>`;
                                    })()}
                                    <div class="history-date-row">${dateBlock}</div>
                                    ${item.maintenanceScope ? `
                                    <div style="display:inline-flex; align-items:center; gap:5px; background:rgba(16,185,129,0.12); border:1px solid rgba(16,185,129,0.35); color:var(--color-primary-green); border-radius:14px; padding:3px 10px; font-size:0.75rem; font-weight:700; margin-bottom:0.5rem;">
                                        Gewartet: ${escHistoryText(item.maintenanceScope)}
                                    </div>` : ''}
                                    ${item.operatingHours ? `
                                    <div style="display:inline-flex; align-items:center; gap:5px; background:rgba(59,130,246,0.12); border:1px solid rgba(59,130,246,0.35); color:#60a5fa; border-radius:14px; padding:3px 10px; font-size:0.75rem; font-weight:700; margin-bottom:0.5rem; margin-left:0.4rem;">
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                                        ${escHistoryText(item.operatingHours)} h
                                    </div>` : ''}
                                    ${item.linkedReportId ? `
                                    <div onclick="window.jumpToServicebericht(${item.linkedReportId})" title="Zum ${item.isFollowUpReport ? 'vorherigen Bericht' : 'Folgebericht'} springen"
                                        style="cursor:pointer; display:inline-flex; align-items:center; gap:5px; background:rgba(16,185,129,0.12); border:1px solid rgba(16,185,129,0.35); color:var(--color-primary-green); border-radius:14px; padding:3px 10px; font-size:0.75rem; font-weight:700; margin-bottom:0.5rem;">
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
                                        ${item.isFollowUpReport ? 'Folgebericht' : 'Hat Folgebericht'}${item.linkedReportDate ? ` vom ${item.linkedReportDate}` : ''}
                                    </div>` : ''}
                                    ${(() => {
                                        let inner = '';
                                        if (item.rawType === 'whatsapp' && item.description) {
                                            inner = `
                                                <div style="border-top: 1px solid rgba(255,255,255,0.06); padding-top: 0.6rem; margin-top: 0.25rem;">
                                                    ${item.endDate ? `<div style="font-size:0.75rem; color:rgba(255,255,255,0.4); font-weight:700; margin-bottom:10px;">Zeitraum bis ${new Date(item.endDate).toLocaleDateString('de-DE')}</div>` : ''}
                                                    ${renderWhatsAppMessages(item.description)}
                                                </div>
                                            `;
                                        } else if (item.rawType === 'email' && item.emailHtml) {
                                            inner = `
                                                <div style="border-top: 1px solid rgba(255,255,255,0.06); padding-top: 0.6rem; margin-top: 0.25rem;">
                                                    ${item.emailHtml}
                                                </div>
                                            `;
                                        } else if (item.description) {
                                            inner = `<p style="margin: 0; color: ${item.itemType === 'workshop' ? '#fff' : 'rgba(255,255,255,0.7)'}; font-size: 0.95rem; line-height: 1.6; font-weight: ${item.itemType === 'workshop' ? '700' : '400'}; white-space: pre-wrap;">${escHistoryText(item.description)}</p>`;
                                        }
                                        if (!inner) return '';
                                        const uid = 'hc' + (clampCounter++);
                                        return `
                                            <div class="history-clamp-wrap" id="hc-wrap-${uid}">
                                                ${inner}
                                                <div class="history-clamp-fade" id="hc-fade-${uid}"></div>
                                            </div>
                                            <button type="button" class="history-readmore-btn" id="hc-btn-${uid}" onclick="window.toggleHistoryClamp('${uid}')">
                                                <span id="hc-btn-label-${uid}">Mehr lesen</span>
                                                <svg id="hc-btn-icon-${uid}" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                                            </button>
                                        `;
                                    })()}
                                    ${item.remark && item.rawType !== 'email' ? `<div style="font-size:0.88rem; color:#fbbf24; background:rgba(245,158,11,0.08); border:1px solid rgba(245,158,11,0.25); border-radius:8px; padding:8px 12px; margin-top:0.6rem; white-space:pre-wrap;"><strong style="color:#f59e0b;">Notiz:</strong> ${escHistoryText(item.remark)}</div>` : ''}
                                    ${photoGallery}
                                    <div style="display: flex; gap: 0.5rem; margin-top: 0.75rem; align-items: center; width: 100%;">
                                        <div style="display: flex; gap: 0.5rem; align-items: center;">
                                            ${actionButtons.replace(/<div style="display: flex; gap: 0.75rem; margin-top: 1rem; align-items: center;">/g, '').replace(/<\/div>$/g, '')}
                                        </div>
                                        <div style="margin-left: auto; display: flex; align-items: center; gap: 8px;">
                                            ${userBadge}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        `;
                });

                container.innerHTML = `<div class="history-icon-connector"></div>` + html;

                // Nur bei Einträgen, die wirklich über die maximale Höhe hinausragen, die Fade
                // + den "Mehr lesen"-Button einblenden — bei kurzen Einträgen bleibt beides weg.
                container.querySelectorAll('.history-clamp-wrap').forEach(wrap => {
                    if (wrap.scrollHeight > wrap.clientHeight + 2) {
                        const uid = wrap.id.replace('hc-wrap-', '');
                        const btn = document.getElementById('hc-btn-' + uid);
                        if (btn) btn.style.display = 'inline-flex';
                    } else {
                        const fade = wrap.querySelector('.history-clamp-fade');
                        if (fade) fade.remove();
                    }
                });

            } catch (error) {
                console.error("Error loading machine history", error);
                container.innerHTML = '<div style="text-align: center; color: #ef4444; padding: 2rem;">Fehler beim Laden der Historie.</div>';
            }
        };

        // Klappt einen langen Historie-Eintrag (Bemerkung, WhatsApp, E-Mail, ...) auf/zu.
        window.toggleHistoryClamp = function (uid) {
            const wrap = document.getElementById('hc-wrap-' + uid);
            const fade = document.getElementById('hc-fade-' + uid);
            const label = document.getElementById('hc-btn-label-' + uid);
            const icon = document.getElementById('hc-btn-icon-' + uid);
            if (!wrap) return;
            const isExpanded = wrap.classList.toggle('expanded');
            if (isExpanded) {
                if (fade) fade.style.display = 'none';
                if (label) label.textContent = 'Weniger anzeigen';
                if (icon) icon.style.transform = 'rotate(180deg)';
            } else {
                if (fade) fade.style.display = '';
                if (label) label.textContent = 'Mehr lesen';
                if (icon) icon.style.transform = '';
                wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        };

        window.navigateToTask = async function (taskId) {
            if (!taskId) return;
            try {
                window.closeHistoryModal();
                if (typeof window.switchView === 'function') {
                    window.switchView('tasks');
                }

                // Check if task is completed via Supabase to expand completed tasks view
                if (window.supabaseClient) {
                    const { data: taskData } = await window.supabaseClient
                        .from('tasks')
                        .select('status')
                        .eq('id', taskId)
                        .single();

                    if (taskData && taskData.status === 'completed') {
                        window.showCompletedTasks = true;
                    }
                }

                if (typeof window.fetchTasks === 'function') {
                    await window.fetchTasks();
                }

                if (typeof window.openTaskModal === 'function') {
                    window.openTaskModal(taskId);
                }
            } catch (err) {
                console.error('Error navigating to task:', err);
            }
        };

        window.navigateToProcess = async function (processId) {
            if (!processId) return;
            try {
                window.closeHistoryModal();
                if (typeof window.switchView === 'function') {
                    window.switchView('processes');
                }
                if (typeof window.fetchProcesses === 'function') {
                    await window.fetchProcesses();
                }
                if (typeof window.openEditProcessModal === 'function') {
                    window.openEditProcessModal(processId);
                }
            } catch (err) {
                console.error('Error navigating to process:', err);
            }
        };

        window.updateManualEntryDate = async function (id, newDate) {
            if (!id || !newDate) return;
            try {
                const { error } = await window.supabaseClient
                    .from('manual_history_entries')
                    .update({ created_at: new Date(newDate + 'T12:00:00').toISOString() })
                    .eq('id', id);
                if (error) throw error;
                window.openHistoryModal(window.currentHistoryMachineId);
            } catch (err) {
                console.error('Error updating date:', err);
                window.showToast('Fehler beim Aktualisieren des Datums: ' + err.message);
            }
        };

        // Datum von "System"-Einträgen (nicht manuell angelegt) anpassen — nur für Admins
        // sichtbar (siehe isAdmin-Check beim Rendern der Historie). Jeder itemType liegt in
        // einer anderen Tabelle/Spalte, daher die Zuordnung hier zentral.
        window.updateSystemEntryDate = async function (itemType, id, newDate) {
            if (!id || !newDate) return;
            const newDateIso = new Date(newDate + 'T12:00:00').toISOString();

            const tableMap = {
                service:     { table: 'service_entries',     column: 'date' },
                workshop:    { table: 'service_entries',     column: 'date' },
                procurement: { table: 'tasks',                column: 'completed_at' },
                intake:      { table: 'intake_protocols',     column: 'created_at' },
                acceptance:  { table: 'acceptance_protocols', column: 'created_at' },
                calendar:    { table: 'calendar_events',      column: 'start_time' }
            };
            const target = tableMap[itemType];
            if (!target) return;

            try {
                const { error } = await window.supabaseClient
                    .from(target.table)
                    .update({ [target.column]: newDateIso })
                    .eq('id', id);
                if (error) throw error;
                window.openHistoryModal(window.currentHistoryMachineId);
            } catch (err) {
                console.error('Error updating system entry date:', err);
                window.showToast('Fehler beim Aktualisieren des Datums: ' + err.message);
            }
        };

        window.toggleManualHistoryForm = function (type) {
            const container = document.getElementById('manual-history-form-container');
            const fields = document.getElementById('manual-history-fields');
            const typeInput = document.getElementById('manual-history-type');

            if (!type || (container.style.display === 'block' && typeInput.value === type && !document.getElementById('manual-history-id').value)) {
                container.style.display = 'none';
                document.getElementById('manual-history-id').value = '';
                document.getElementById('existing-photos-container').style.display = 'none';
                return;
            }

            document.getElementById('manual-history-id').value = '';
            document.getElementById('existing-photos-container').style.display = 'none';

            // Reset button text and hide delete
            const saveBtn = document.querySelector('#manual-history-form-container .btn-primary');
            const deleteBtn = document.getElementById('btn-delete-manual');
            if (saveBtn) {
                const iconHtml = saveBtn.querySelector('svg').outerHTML;
                saveBtn.innerHTML = `${iconHtml} Eintrag speichern`;
            }
            if (deleteBtn) {
                deleteBtn.style.display = 'none';
            }

            typeInput.value = type;
            container.style.display = 'block';
            fields.innerHTML = '';

            let html = '';
            if (type === 'phone') {
                html = `
                        <input type="text" id="manual-title" placeholder="Gesprächspartner" class="glass-input" style="margin-bottom: 0.75rem;">
                        <textarea id="manual-content" placeholder="Ergebnis des Telefonats..." class="glass-input" style="min-height: 80px;"></textarea>
                    `;
            } else if (type === 'note') {
                html = `
                        <input type="text" id="manual-title" placeholder="Titel der Bemerkung" class="glass-input" style="margin-bottom: 0.75rem;">
                        <textarea id="manual-content" placeholder="Details..." class="glass-input" style="min-height: 80px;"></textarea>
                    `;
            } else if (type === 'photo') {
                html = `
                        <input type="text" id="manual-title" placeholder="Beschreibung der Fotos" class="glass-input" style="margin-bottom: 0.75rem;">
                        <div style="background: rgba(255,255,255,0.05); border: 2px dashed rgba(255,255,255,0.1); border-radius: 12px; padding: 1.5rem; text-align: center;">
                            <input type="file" id="manual-photos" multiple accept="image/*" style="display: none;" onchange="updatePhotoCount(this)">
                            <label for="manual-photos" style="cursor: pointer;">
                                <div style="font-size: 1.5rem; margin-bottom: 0.5rem;">📸</div>
                                <div id="photo-upload-label" style="font-size: 0.85rem; color: rgba(255,255,255,0.6);">Bilder zum Hochladen auswählen</div>
                            </label>
                        </div>
                    `;
            } else if (type === 'email') {
                html = `
                        <input type="text" id="manual-title" placeholder="Betreff der E-Mail" class="glass-input" style="margin-bottom: 0.75rem;">
                        <div id="manual-email-msg-dropzone"
                            onclick="document.getElementById('manual-email-msg-file-input').click()"
                            ondragover="event.preventDefault(); this.style.borderColor='var(--color-primary-green)'; this.style.background='rgba(52,211,153,0.06)';"
                            ondragleave="this.style.borderColor='rgba(255,255,255,0.15)'; this.style.background='transparent';"
                            ondrop="window.handleManualHistoryMsgDrop(event)"
                            style="border: 2px dashed rgba(255,255,255,0.15); border-radius: 12px; padding: 14px; text-align: center; cursor: pointer; color: rgba(255,255,255,0.45); font-size: 0.8rem; font-weight: 600; margin-bottom: 0.75rem; transition: border-color 0.2s, background 0.2s;">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: block; margin: 0 auto 4px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                            .msg-Datei hierher ziehen oder klicken (sucht Betreff, Absender, Empfänger, Datum/Uhrzeit und Text automatisch heraus)
                        </div>
                        <input type="file" id="manual-email-msg-file-input" accept=".msg" style="display:none;" onchange="window.handleManualHistoryMsgSelect(event)">
                        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 0.75rem;">
                            <label style="font-size: 0.7rem; font-weight: 700; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 1px; white-space: nowrap;">Uhrzeit (optional)</label>
                            <input type="time" id="manual-entry-time" class="glass-input" style="flex: 1; padding: 6px 12px; font-size: 0.85rem; color-scheme: dark;">
                        </div>
                        <input type="text" id="manual-sender" placeholder="Absender (Von)" class="glass-input" style="margin-bottom: 0.75rem;">
                        <input type="text" id="manual-recipient" placeholder="Empfänger (An)" class="glass-input" style="margin-bottom: 0.75rem;">
                        <textarea id="manual-content" placeholder="E-Mail-Text..." class="glass-input" style="min-height: 100px; margin-bottom: 0.75rem;"></textarea>
                        <textarea id="manual-remark" placeholder="Bemerkung (optional, interne Notiz)..." class="glass-input" style="min-height: 60px;"></textarea>
                    `;
            } else if (type === 'hours') {
                html = `
                        <input type="hidden" id="manual-title" value="Betriebsstunden">
                        <label style="font-size: 0.7rem; font-weight: 700; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 0.4rem; display: block;">Betriebsstunden</label>
                        <input type="number" id="manual-content" placeholder="z.B. 1234" class="glass-input" min="0" step="1" style="margin-bottom: 0.75rem;">
                    `;
            } else if (type === 'whatsapp') {
                html = `
                        <input type="text" id="manual-title" placeholder="Kontakt (Name)" class="glass-input" style="margin-bottom: 0.75rem;">
                        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 0.75rem;">
                            <label style="font-size: 0.7rem; font-weight: 700; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 1px; white-space: nowrap;">Bis (optional)</label>
                            <input type="date" id="manual-end-date" class="glass-input" style="flex: 1; padding: 6px 12px; font-size: 0.85rem; color-scheme: dark;">
                        </div>
                        <textarea id="manual-content" placeholder="WhatsApp-Nachrichten hier einfügen..." class="glass-input" style="min-height: 120px;"></textarea>
                    `;
            } else if (type === 'wartung') {
                html = `
                        <label style="font-size: 0.7rem; font-weight: 700; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 0.4rem; display: block;">Titel</label>
                        <input type="text" id="manual-title" value="Wartung" class="glass-input" style="margin-bottom: 0.75rem;">
                        <label style="font-size: 0.7rem; font-weight: 700; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 0.5rem; display: block;">Art der Wartung</label>
                        <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 0.75rem;">
                            ${['Motorwartung', 'SBA-Wartung', 'Hydraulikwartung', 'UVV-Wartung'].map(label => `
                                <label style="display: flex; align-items: center; gap: 10px; cursor: pointer; color: #fff; font-size: 0.9rem; padding: 8px 12px; border-radius: 8px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);">
                                    <input type="checkbox" class="manual-wartung-type" value="${label}" style="width: 18px; height: 18px; accent-color: #f97316; cursor: pointer;">
                                    ${label}
                                </label>
                            `).join('')}
                        </div>
                        <input type="hidden" id="manual-content">
                        <textarea id="manual-remark" placeholder="Notiz (optional)..." class="glass-input" style="min-height: 60px;"></textarea>
                    `;
            } else if (type === 'auslieferung') {
                html = `
                        <input type="hidden" id="manual-title" value="Auslieferung">
                    `;
            }
            const todayStr = new Date().toISOString().split('T')[0];
            const dateRow = `
                    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 0.75rem;">
                        <label style="font-size: 0.7rem; font-weight: 700; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 1px; white-space: nowrap;">Datum</label>
                        <input type="date" id="manual-entry-date" value="${todayStr}" class="glass-input" style="flex: 1; padding: 6px 12px; font-size: 0.85rem; color-scheme: dark;">
                    </div>
                `;
            fields.innerHTML = dateRow + html;

            // Scroll to form after a short delay to ensure rendering
            setTimeout(() => {
                container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }, 100);
        };

        window.handleManualHistoryMsgDrop = function(event) {
            event.preventDefault();
            event.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)';
            event.currentTarget.style.background = 'transparent';
            const file = event.dataTransfer.files && event.dataTransfer.files[0];
            if (file) window.processManualHistoryMsgFile(file);
        };

        window.handleManualHistoryMsgSelect = function(event) {
            const file = event.target.files && event.target.files[0];
            if (file) window.processManualHistoryMsgFile(file);
            event.target.value = '';
        };

        window.processManualHistoryMsgFile = function(file) {
            if (!file.name.toLowerCase().endsWith('.msg')) {
                window.showToast('Bitte eine .msg-Datei auswählen (Outlook-Nachricht).');
                return;
            }

            const MsgReaderClass = window.MSGReaderClass;
            if (!MsgReaderClass) {
                window.showToast('MSG-Reader Bibliothek konnte nicht geladen werden.');
                return;
            }

            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const msgReader = new MsgReaderClass(e.target.result);
                    const fileData = msgReader.getFileData();

                    if (fileData.subject) {
                        document.getElementById('manual-title').value = fileData.subject;
                    }

                    let sender = '';
                    if (fileData.senderName && fileData.senderEmail) {
                        sender = `${fileData.senderName} <${fileData.senderEmail}>`;
                    } else {
                        sender = fileData.senderEmail || fileData.senderName || '';
                    }
                    const senderEl = document.getElementById('manual-sender');
                    if (senderEl && sender) senderEl.value = sender;

                    const toRecipients = (fileData.recipients || [])
                        .filter(r => !r.recipType || r.recipType.toLowerCase() === 'to')
                        .map(r => (r.name && r.email) ? `${r.name} <${r.email}>` : (r.email || r.name))
                        .filter(Boolean);
                    const recipientEl = document.getElementById('manual-recipient');
                    if (recipientEl && toRecipients.length > 0) recipientEl.value = toRecipients.join('; ');

                    const body = (fileData.body || '').trim();
                    const contentEl = document.getElementById('manual-content');
                    if (contentEl) contentEl.value = body;

                    const dateRaw = fileData.messageDeliveryTime || fileData.creationTime || fileData.lastModificationTime;
                    if (dateRaw) {
                        const d = new Date(dateRaw);
                        if (!isNaN(d.getTime())) {
                            const dateInput = document.getElementById('manual-entry-date');
                            if (dateInput) dateInput.value = d.toISOString().split('T')[0];
                            const timeInput = document.getElementById('manual-entry-time');
                            if (timeInput) timeInput.value = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
                        }
                    }
                } catch (err) {
                    console.error('Error parsing .msg file:', err);
                    window.showToast('Fehler beim Lesen der .msg-Datei: ' + err.message);
                }
            };
            reader.readAsArrayBuffer(file);
        };

        window.updatePhotoCount = function (input) {
            const label = document.getElementById('photo-upload-label');
            let previewContainer = document.getElementById('new-photos-preview-list');

            if (!previewContainer) {
                previewContainer = document.createElement('div');
                previewContainer.id = 'new-photos-preview-list';
                previewContainer.style.display = 'flex';
                previewContainer.style.flexWrap = 'wrap';
                previewContainer.style.gap = '8px';
                previewContainer.style.marginTop = '1rem';
                previewContainer.style.justifyContent = 'center';
                input.parentElement.appendChild(previewContainer);
            }

            previewContainer.innerHTML = '';

            if (input.files && input.files.length > 0) {
                label.textContent = input.files.length + ' Bilder zum Upload bereit';
                label.style.color = '#10b981';

                Array.from(input.files).forEach(file => {
                    const reader = new FileReader();
                    reader.onload = function (e) {
                        const div = document.createElement('div');
                        div.style.width = '50px';
                        div.style.height = '50px';
                        div.style.borderRadius = '8px';
                        div.style.overflow = 'hidden';
                        div.style.border = '2px solid rgba(16,185,129,0.5)';
                        div.innerHTML = `<img src="${e.target.result}" style="width: 100%; height: 100%; object-fit: cover; opacity: 0.8;">`;
                        previewContainer.appendChild(div);
                    }
                    reader.readAsDataURL(file);
                });
            } else {
                label.textContent = 'Bilder zum Hochladen auswählen';
                label.style.color = 'rgba(255,255,255,0.6)';
            }
        };

        window.editManualHistoryEntry = async function (id) {
            try {
                const { data: entry, error } = await window.supabaseClient
                    .from('manual_history_entries')
                    .select('*')
                    .eq('id', id)
                    .single();

                if (error) throw error;

                // 1. Ensure Schnelleintrag is open
                const schnelleintragContent = document.getElementById('schnelleintrag-content');
                if (schnelleintragContent.style.display === 'none') {
                    window.toggleSchnelleintrag(document.querySelector('.section-header'));
                }

                // 2. Clear previous form state
                window.toggleManualHistoryForm(null);

                // 3. Open appropriate form type
                window.toggleManualHistoryForm(entry.type);

                // 4. Set ID and pre-fill fields
                document.getElementById('manual-history-id').value = id;
                document.getElementById('manual-title').value = entry.title;
                if (document.getElementById('manual-content')) {
                    document.getElementById('manual-content').value = entry.content;
                }
                // Prefill the date (and, for E-Mail, the time) from the entry's created_at
                const dateInput = document.getElementById('manual-entry-date');
                if (dateInput && entry.created_at) {
                    dateInput.value = new Date(entry.created_at).toISOString().split('T')[0];
                }
                const timeInput = document.getElementById('manual-entry-time');
                if (timeInput && entry.created_at) {
                    const d = new Date(entry.created_at);
                    timeInput.value = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
                }
                const senderInput = document.getElementById('manual-sender');
                if (senderInput) senderInput.value = entry.sender || '';
                const recipientInput = document.getElementById('manual-recipient');
                if (recipientInput) recipientInput.value = entry.recipient || '';
                const remarkInput = document.getElementById('manual-remark');
                if (remarkInput) remarkInput.value = entry.remark || '';

                // WhatsApp: optionales Bis-Datum vorausfüllen
                const endDateInput = document.getElementById('manual-end-date');
                if (endDateInput) {
                    endDateInput.value = entry.end_date || '';
                }

                // Wartung: angekreuzte Wartungsarten aus content (komma-getrennt) wiederherstellen
                if (entry.type === 'wartung' && entry.content) {
                    const checkedLabels = entry.content.split(',').map(s => s.trim());
                    document.querySelectorAll('.manual-wartung-type').forEach(cb => {
                        cb.checked = checkedLabels.includes(cb.value);
                    });
                }

                // 4.5 Change button text and show delete button
                const saveBtn = document.querySelector('#manual-history-form-container .btn-primary');
                const deleteBtn = document.getElementById('btn-delete-manual');
                if (saveBtn) {
                    const iconHtml = saveBtn.querySelector('svg').outerHTML;
                    saveBtn.innerHTML = `${iconHtml} Änderungen speichern`;
                }
                if (deleteBtn) {
                    deleteBtn.style.display = 'flex';
                }

                // 5. Handle existing photos
                if (entry.type === 'photo' && entry.files && entry.files.length > 0) {
                    const container = document.getElementById('existing-photos-container');
                    const list = document.getElementById('existing-photos-list');
                    container.style.display = 'block';
                    list.innerHTML = entry.files.map((url, index) => `
                            <div style="position: relative; width: 60px; height: 60px; border-radius: 8px; overflow: hidden; border: 1px solid rgba(255,255,255,0.1); cursor: pointer;"
                                 onclick="if(!event.target.closest('button')) window.openPhotosLightbox(${JSON.stringify(entry.files).replace(/"/g, '&quot;')}, ${index})">
                                <img src="${url}" loading="lazy" style="width: 100%; height: 100%; object-fit: cover; transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform='scale(1)'">
                                <button onclick="window.removeExistingPhoto('${url}', event)" style="position: absolute; top: -5px; right: -5px; background: #ef4444; color: white; border: none; border-radius: 50%; width: 22px; height: 22px; font-size: 14px; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 5px rgba(0,0,0,0.3); z-index: 10;">&times;</button>
                            </div>
                        `).join('');
                }

            } catch (err) {
                console.error("Error loading for edit:", err);
            }
        };

        window.removeExistingPhoto = function (url, event) {
            if (event) event.stopPropagation();
            const list = document.getElementById('existing-photos-list');
            const photoDiv = Array.from(list.children).find(div => div.querySelector('img').src === url);
            if (photoDiv) photoDiv.remove();

            // Hide container if empty
            if (list.children.length === 0) {
                document.getElementById('existing-photos-container').style.display = 'none';
            }
        };


        window.openImageViewer = function (url) {
            console.log('Opening images viewer:', url);
            if (typeof window.openPhotosLightbox === 'function') {
                const images = Array.isArray(url) ? url : [url];
                if (images.length === 0 || !images[0]) return;
                window.openPhotosLightbox(images, 0);
            } else {
                window.open(Array.isArray(url) ? url[0] : url, '_blank');
            }
        };

        window.saveManualHistoryEntry = async function () {
            const submitBtn = document.querySelector('.btn-modal-save');
            if (submitBtn) {
                if (submitBtn.disabled) return;
                submitBtn.disabled = true;
                submitBtn.dataset.originalText = submitBtn.textContent;
                submitBtn.textContent = 'Speichert...';
            }

            const id = document.getElementById('manual-history-id').value;
            const type = document.getElementById('manual-history-type').value;
            const title = document.getElementById('manual-title').value;
            let content = document.getElementById('manual-content') ? document.getElementById('manual-content').value : '';
            const machineId = window.currentHistoryMachineId;
            const entryDateInput = document.getElementById('manual-entry-date');
            const entryDate = entryDateInput ? entryDateInput.value : null;
            const entryTimeInput = document.getElementById('manual-entry-time');
            const entryTime = entryTimeInput ? entryTimeInput.value : null;
            const endDateInput = document.getElementById('manual-end-date');
            const endDate = endDateInput ? (endDateInput.value || null) : null;
            const senderInput = document.getElementById('manual-sender');
            const sender = senderInput ? (senderInput.value || null) : null;
            const recipientInput = document.getElementById('manual-recipient');
            const recipient = recipientInput ? (recipientInput.value || null) : null;
            const remarkInput = document.getElementById('manual-remark');
            const remark = remarkInput ? (remarkInput.value || null) : null;

            if (type === 'wartung') {
                const checkedTypes = Array.from(document.querySelectorAll('.manual-wartung-type:checked')).map(cb => cb.value);
                if (checkedTypes.length === 0) {
                    window.showToast('Bitte mindestens eine Wartungsart ankreuzen.');
                    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = submitBtn.dataset.originalText || 'Speichern'; }
                    return;
                }
                content = checkedTypes.join(', ');
            }

            if (!title) {
                window.showToast('Bitte geben Sie einen Titel/Betreff ein.');
                return;
            }
            if (type === 'hours' && !content.trim()) {
                window.showToast('Bitte Betriebsstunden eingeben.');
                if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = submitBtn.dataset.originalText || 'Speichern'; }
                return;
            }

            try {
                let filesArray = [];

                // 1. For edits, get existing photos that weren't deleted
                if (id && type === 'photo') {
                    const existingList = document.getElementById('existing-photos-list');
                    Array.from(existingList.children).forEach(div => {
                        filesArray.push(div.querySelector('img').src);
                    });
                }

                // 2. Upload new photos (Parallel & Compressed)
                const photoInput = document.getElementById('manual-photos');
                if (photoInput && photoInput.files && photoInput.files.length > 0) {
                    const machine = (window.machineList || []).find(m => m.id == machineId);
                    const mFolder = machine ? window.getMachineFolderName(machine.id, machine.manufacturer, machine.name, machine.serial || machine.serial_number, machine.year) : `Maschinen/${machineId}`;
                    const pathGenerator = (file, i) => `${mFolder}/Verlauf/${Date.now()}-${i}.${file.name.split('.').pop()}`;
                    // Nichts doppelt: dieselbe Aufnahme mehrfach ausgewaehlt
                    // wird nur einmal hochgeladen (js/photo-dedupe.js).
                    const auswahl = await window.PhotoDedupe.pruefeAuswahl(photoInput.files, []);
                    window.PhotoDedupe.meldeDoppelte(auswahl.doppelt);
                    const uploadResults = await window.FileUploadService.uploadFiles(
                        auswahl.neu.map(e => e.file),
                        pathGenerator,
                        { bucket: 'dateien', compress: true, concurrency: 5, provider: 'cloudflare-r2' }
                    );
                    uploadResults.forEach(res => filesArray.push(res.url));
                }

                const entryTimePart = entryTime ? `${entryTime}:00` : '12:00:00';

                if (id) {
                    // UPDATE existing entry
                    const updatePayload = {
                        title: title,
                        content: content,
                        files: filesArray,
                        end_date: endDate,
                        sender: sender,
                        recipient: recipient,
                        remark: remark,
                        updated_at: new Date()
                    };
                    if (entryDate) updatePayload.created_at = new Date(entryDate + 'T' + entryTimePart).toISOString();
                    const { error } = await window.supabaseClient
                        .from('manual_history_entries')
                        .update(updatePayload)
                        .eq('id', id);
                    if (error) throw error;
                } else {
                    const insertPayload = {
                        machine_id: machineId,
                        type: type,
                        title: title,
                        content: content,
                        files: filesArray,
                        end_date: endDate,
                        sender: sender,
                        recipient: recipient,
                        remark: remark,
                        created_by: window.activeUser?.id
                    };
                    if (entryDate) insertPayload.created_at = new Date(entryDate + 'T' + entryTimePart).toISOString();
                    const { error } = await window.supabaseClient
                        .from('manual_history_entries')
                        .insert([insertPayload]);
                    if (error) throw error;
                }

                // Schnelleintrag "Wartung" soll nicht nur in der Historie stehen, sondern auch
                // Letzte/Nächste Wartung auf der Maschinenkarte aktualisieren (und damit automatisch
                // auch auf der Ereignisse-Seite auftauchen, die next_maintenance direkt anzeigt).
                if (type === 'wartung') {
                    await window.recalculateMachineMaintenanceFromHistory(machineId);
                }

                window.toggleManualHistoryForm(null);
                window.openHistoryModal(machineId); // Refresh
            } catch (err) {
                console.error('Error saving manual entry:', err);
                const errorMsg = err.message || (err.error ? err.error.message : 'Unbekannter Fehler');
                window.showToast('Fehler beim Speichern des Eintrags: ' + errorMsg);
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = submitBtn.dataset.originalText || 'Speichern';
                }
            }
        };

        window.toggleSchnelleintrag = function (header) {
            const content = document.getElementById('schnelleintrag-content');
            const chevron = header.querySelector('.toggle-chevron');
            const isHidden = content.style.display === 'none';

            content.style.display = isHidden ? 'block' : 'none';
            chevron.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';

            if (!isHidden) {
                window.toggleManualHistoryForm(null); // Reset form if closing
            }
        };

        window.deleteManualHistoryEntry = async function () {
            if (typeof window.canDelete === 'function' && !window.canDelete('Historien-Einträgen')) return;
            const id = document.getElementById('manual-history-id').value;
            if (!id) return;
            await window.deleteHistoryEntry(id, 'manual');
        };

        window.deleteHistoryEntry = async function (id, type) {
            if (typeof window.canDelete === 'function' && !window.canDelete('Historien-Einträgen')) return;
            if (!confirm('Soll dieser Eintrag wirklich gelöscht werden?')) return;

            try {
                let table = 'manual_history_entries';
                if (type === 'service' || type === 'workshop') table = 'service_entries';
                else if (type === 'intake') table = 'intake_protocols';
                else if (type === 'acceptance') table = 'acceptance_protocols';

                // --- Delete associated service report files from Cloudflare R2 ---
                if (type === 'service' || type === 'workshop') {
                    const { data: entry, error: fetchError } = await window.supabaseClient
                        .from('service_entries')
                        .select('files')
                        .eq('id', id)
                        .single();

                    if (!fetchError && entry && entry.files && Array.isArray(entry.files)) {
                        console.log('Deleting service report files from history deletion:', id);
                        for (const file of entry.files) {
                            await deleteFileEntryStorage(file);
                        }
                    }

                    // Auch das verknüpfte PDF-Dokument unter "Dokumente" löschen (siehe deleteServiceEntry)
                    const { data: linkedDocs, error: docsFetchError } = await window.supabaseClient
                        .from('documents')
                        .select('id, url')
                        .eq('service_entry_id', id);

                    if (!docsFetchError && linkedDocs && linkedDocs.length > 0) {
                        for (const doc of linkedDocs) {
                            await deleteFileEntryStorage({ url: doc.url });
                        }
                        await window.supabaseClient
                            .from('documents')
                            .delete()
                            .eq('service_entry_id', id);
                        if (typeof window.fetchDocuments === 'function') window.fetchDocuments();
                    }
                }

                // --- Delete protocol photos from Supabase Storage and associated database records ---
                if (type === 'intake' || type === 'acceptance') {
                    // 1. Fetch related photos from Supabase Storage
                    const { data: photos, error: fetchPhotosError } = await window.supabaseClient
                        .from('protocol_photos')
                        .select('file_name')
                        .eq('protocol_id', id);

                    if (!fetchPhotosError && photos && photos.length > 0) {
                        const filePaths = photos.map(p => p.file_name);
                        console.log('Deleting protocol photos from storage for ID:', id, filePaths);
                        try {
                            const { error: storageError } = await window.supabaseClient.storage
                                .from('machine-images')
                                .remove(filePaths);
                            if (storageError) throw storageError;
                        } catch (storageErr) {
                            console.error('Failed to delete protocol photos from storage:', storageErr);
                        }
                    }

                    // 2. Delete protocol checkpoints and photos database records (since no CASCADE constraint exists)
                    const { error: cpDelError } = await window.supabaseClient
                        .from('protocol_checkpoints')
                        .delete()
                        .eq('protocol_id', id);
                    if (cpDelError) console.error('Failed to delete protocol checkpoints:', cpDelError);

                    const { error: photoDelError } = await window.supabaseClient
                        .from('protocol_photos')
                        .delete()
                        .eq('protocol_id', id);
                    if (photoDelError) console.error('Failed to delete protocol photos from DB:', photoDelError);
                }

                // Vor dem Löschen merken, ob es ein Wartung-Schnelleintrag war, damit danach
                // last_maintenance/next_maintenance der Maschine neu berechnet werden kann.
                let wasWartungEntry = false;
                if (type === 'manual') {
                    const { data: manualEntry } = await window.supabaseClient
                        .from('manual_history_entries')
                        .select('type')
                        .eq('id', id)
                        .maybeSingle();
                    wasWartungEntry = manualEntry && manualEntry.type === 'wartung';
                }

                const { error } = await window.supabaseClient
                    .from(table)
                    .delete()
                    .eq('id', id);

                if (error) throw error;

                if (wasWartungEntry && window.currentHistoryMachineId) {
                    await window.recalculateMachineMaintenanceFromHistory(window.currentHistoryMachineId);
                }

                // Bei Serviceberichten auch sofort aus den Offline-Caches entfernen, sonst kann
                // der gelöschte Bericht im Servicebericht-Listen-Cache wieder auftauchen (siehe deleteServiceEntry).
                if (type === 'service' || type === 'workshop') {
                    allServiceEntries = (allServiceEntries || []).filter(e => e.id !== id);
                    window.serviceEntryList = allServiceEntries;
                    if (window.offlineService) {
                        try { await window.offlineService.deleteCachedEntry(id); } catch (e) { console.warn('Cache-Bereinigung fehlgeschlagen:', e); }
                    }
                }

                // Close manual form if open
                if (type === 'manual') {
                    window.toggleManualHistoryForm(null);
                }

                // Refresh view
                window.openHistoryModal(window.currentHistoryMachineId);
            } catch (err) {
                console.error('Error deleting history entry:', err);
                window.showToast('Fehler beim Löschen des Eintrags: ' + err.message);
            }
        };

        window.closeHistoryModal = function () {
            const modal = document.getElementById('machine-history-modal');
            if (modal) {
                modal.classList.remove('show');
                setTimeout(() => {
                    modal.classList.add('hidden');
                }, 300);
            }
        };

        window.showServiceReportsForCurrentMachine = function (typeTitle) {
            closeServiceActionModal();
            if (!currentSelectedMachineForService) return;

            const machines = window.machineList || [];
            const machine = machines.find(m => m.id === currentSelectedMachineForService);
            if (!machine) return;

            const isProtocol = typeTitle === 'Eingangsprotokoll' || typeTitle === 'Abnahmeprotokoll';

            // 1. Switch View
            switchView(isProtocol ? 'protocols' : 'service');

            // 2. Pre-fill Search
            const searchInputId = isProtocol ? 'protocol-search-input' : 'service-search-input';
            const searchInput = document.getElementById(searchInputId);

            // Create a precise search string: Manufacturer Name #Serial (Year)
            const searchStr = [
                machine.manufacturer,
                machine.name,
                machine.serial ? `#${machine.serial}` : null,
                machine.year ? `(${machine.year})` : null
            ].filter(Boolean).join(' ');

            if (searchInput) {
                searchInput.value = searchStr;
            }

            // 3. Apply Filters and Fetch
            if (isProtocol) {
                const protocolType = typeTitle === 'Eingangsprotokoll' ? 'intake' : 'acceptance';
                if (window.handleProtocolSearch) window.handleProtocolSearch(searchStr);
                if (window.setProtocolFilter) window.setProtocolFilter(protocolType);
                if (window.fetchProtocols) window.fetchProtocols();
            } else {
                // Service behavior (existing/extended)
                if (typeof fetchServiceEntries === 'function') fetchServiceEntries();
            }
        };

        window.startReportCreation = function (type) {
            closeServiceActionModal();

            // Map internal type to readable title
            const titles = {
                'servicebericht': 'Servicebericht',
                'eingangsprotokoll': 'Eingangsprotokoll',
                'abnahmeprotokoll': 'Abnahmeprotokoll',
                // Das eigenständige Fenster (js/uvv-protokoll.js) ist entfernt.
                // Der Knopf öffnet jetzt einen ganz normalen Servicebericht,
                // nur mit vorbelegten Kategorien und angehakten Prüfplänen —
                // siehe window.applyUvvWartungPreset() weiter unten.
                // Der Titel trägt den Zusatz „(Intern)", damit im Ausdruck und
                // in der Historie erkennbar bleibt, wie der Bericht entstanden ist.
                'uvv-protokoll': 'Servicebericht (Intern)'
            };

            const title = titles[type] || 'Servicebericht';

            // Handle new Protocols if applicable
            if (type === 'eingangsprotokoll' && typeof window.openIntakeProtocol === 'function') {
                window.openIntakeProtocol(currentSelectedMachineForService);
                return;
            }
            if (type === 'abnahmeprotokoll' && typeof window.openAcceptanceProtocol === 'function') {
                window.openAcceptanceProtocol(currentSelectedMachineForService);
                return;
            }

            // MIETVEREINBARUNG — diesen Block loeschen = weg (js/mietvereinbarung.js)
            if (type === 'mietvereinbarung' && typeof window.openMietvereinbarung === 'function') {
                window.openMietvereinbarung(currentSelectedMachineForService);
                return;
            }

            // fallback to default service report modal
            if (typeof openServiceberichtModal === 'function') {
                openServiceberichtModal();

                // Set the title in the form
                const titleEl = document.getElementById('service-report-title');
                if (titleEl) titleEl.value = title;

                // --- Auto-select machine when opened from machine card ---
                if (currentSelectedMachineForService) {
                    const machines = window.machineList || [];
                    // Vergleich über String: die ID kommt mal als Zahl aus der
                    // Maschinenliste, mal als Text aus einem onclick-Attribut.
                    // Mit === blieb die Maschine dann unerkannt.
                    const m = machines.find(x => String(x.id) === String(currentSelectedMachineForService));
                    if (m) {
                        const cat = (window.categoryList || []).find(c => c.id === m.category_id);
                        const catName = cat ? cat.name : '';

                        // Pre-select the machine
                        selectServiceMachine(m.id, m.manufacturer, m.name, m.serial, m.image_url, catName, m.year);

                        // Hide the machine search panel (user shouldn't need to change it)
                        const machineSelector = document.querySelector('#servicebericht-modal .machine-selector-wrapper .search-input-container');
                        const machineList = document.getElementById('service-machine-list');
                        if (machineSelector) machineSelector.style.display = 'none';
                        if (machineList) machineList.style.display = 'none';

                        // Show or create a green "Fixiert" lock badge on the preview
                        const previewContainer = document.getElementById('selected-machine-preview');
                        if (previewContainer) {
                            // Remove old badge if present
                            const oldBadge = previewContainer.querySelector('.machine-locked-badge');
                            if (oldBadge) oldBadge.remove();

                            const badge = document.createElement('div');
                            badge.className = 'machine-locked-badge';
                            badge.style.cssText = 'display: inline-flex; align-items: center; gap: 6px; background: rgba(16,185,129,0.15); color: #10b981; border: 1px solid rgba(16,185,129,0.35); border-radius: 8px; padding: 4px 10px; font-size: 0.8rem; font-weight: 800; margin-top: 8px; font-family: \'Inter\', sans-serif; letter-spacing: 0.5px;';
                            badge.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg> Fixiert`;
                            previewContainer.appendChild(badge);
                        }
                    }
                }

                if (type === 'uvv-protokoll') window.applyUvvWartungPreset();
            }
        };

        // ---------------------------------------------------------------
        // „Internes UVV & Wartungsprotokoll" vorbelegen
        // ---------------------------------------------------------------
        // Setzt im frisch geöffneten Servicebericht die Kategorien UVV,
        // Wartung und Einweisung und hakt anschließend ALLE angebotenen
        // Prüfpläne an. Damit ersetzt der Servicebericht das frühere
        // eigenständige Fenster vollständig — samt PDF, Vorschau, Ablage und
        // Übersicht, die es dort alle noch einmal geben musste.
        //
        // In Schritten, weil beides nacheinander aufgebaut wird: erst muss die
        // Kategorienliste stehen, dann baut evaluateChecklistVisibility() die
        // Prüfplan-Auswahl, und erst danach gibt es Kästchen zum Anhaken.
        window.applyUvvWartungPreset = function () {
            const GESUCHT = ['uvv', 'wartung', 'einweisung'];

            const setzeKategorien = () => {
                const cats = window.categoryList || [];
                if (!cats.length || typeof window.selectServiceCategory !== 'function') return false;

                // Erst leeren, dann die drei setzen — selectServiceCategory
                // schaltet um, ein zweiter Aufruf würde sonst wieder abwählen.
                window.selectServiceCategory(null);
                let getroffen = 0;
                GESUCHT.forEach(schlagwort => {
                    const name = (c) => String(c.name || '').toLowerCase().trim();
                    // Genauer Name hat Vorrang, sonst der erste, der ihn enthält
                    // („Wartung" soll nicht die „Wartungsvorbereitung" treffen,
                    // solange es die Kategorie „Wartung" selbst gibt).
                    const treffer = cats.find(c => name(c) === schlagwort)
                        || cats.find(c => name(c).includes(schlagwort));
                    if (treffer) { window.selectServiceCategory(treffer.id, treffer.name); getroffen++; }
                });
                return getroffen > 0;
            };

            const hakeAllePlaeneAn = () => {
                const container = document.getElementById('service-checklist-selector-container');
                if (!container) return false;
                const kaesten = container.querySelectorAll('input[type="checkbox"][data-template-id]');
                if (!kaesten.length) return false;
                kaesten.forEach(cb => {
                    if (cb.checked) return;
                    cb.checked = true;
                    if (typeof window.onChecklistToggle === 'function') {
                        window.onChecklistToggle(cb.dataset.templateId, true);
                    }
                });
                return true;
            };

            // Bis zu zwei Sekunden auf die Listen warten, dann aufgeben.
            let versuche = 0;
            const lauf = () => {
                versuche++;
                if (setzeKategorien()) {
                    // Die Prüfpläne entstehen erst durch die Kategoriewahl.
                    let versuche2 = 0;
                    const lauf2 = () => {
                        versuche2++;
                        if (hakeAllePlaeneAn() || versuche2 > 20) return;
                        setTimeout(lauf2, 100);
                    };
                    setTimeout(lauf2, 120);
                    return;
                }
                if (versuche <= 20) setTimeout(lauf, 100);
            };
            setTimeout(lauf, 150);
        };
