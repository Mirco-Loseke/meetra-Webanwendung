// accounting.js - Logic for the Accounting Module

let allAccountingEntries = [];
let currentAccountingType = 'incoming'; // Default view

document.addEventListener('DOMContentLoaded', () => {
    console.log('Accounting Module: DOMContentLoaded');
    if (window.location.hash === '#accounting') {
        fetchAccountingEntries();
    }
});

window.addEventListener('hashchange', () => {
    console.log('Accounting Module: Hash changed to', window.location.hash);
    if (window.location.hash === '#accounting') {
        fetchAccountingEntries();
    }
});

window.fetchAccountingEntries = async function () {
    console.log('Accounting Module: fetching entries');
    try {
        const { data, error } = await window.supabaseClient
            .from('accounting')
            .select('*')
            .order('date', { ascending: false });

        if (error) throw error;
        allAccountingEntries = data || [];
        renderAccounting();
    } catch (err) {
        console.error('Error fetching accounting:', err);
    }
};

window.switchAccountingTab = function (type) {
    currentAccountingType = type;
    document.querySelectorAll('.calendar-tab-btn').forEach(btn => btn.classList.remove('active'));
    const targetBtn = document.getElementById(`tab-${type}`);
    if (targetBtn) targetBtn.classList.add('active');
    renderAccounting();
};

window.renderAccounting = function () {
    const container = document.getElementById('accounting-table-container');
    if (!container) return;

    const filtered = allAccountingEntries.filter(e => e.type === currentAccountingType);

    // Group by Month (January to December)
    const months = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
    const grouped = {};

    filtered.forEach(entry => {
        const date = new Date(entry.date);
        const monthIndex = date.getMonth();
        const monthName = months[monthIndex];
        if (!grouped[monthName]) grouped[monthName] = [];
        grouped[monthName].push(entry);
    });

    let html = '';

    // Sort months Jan -> Dec (using index)
    const activeMonths = Object.keys(grouped).sort((a, b) => months.indexOf(a) - months.indexOf(b));

    activeMonths.forEach(monthName => {
        html += `
            <div class="month-section" style="padding: 1.5rem; border-bottom: 1px solid rgba(255,255,255,0.05);">
                <h3 style="color: var(--color-primary-green); margin-bottom: 1rem; display: flex; align-items: center; gap: 10px; font-weight: 800; font-family: 'Outfit', sans-serif;">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                    ${monthName}
                </h3>
                <table class="data-table" style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="text-align: left; color: rgba(255,255,255,0.4); font-size: 0.75rem; text-transform: uppercase; letter-spacing: 1px;">
                            <th style="padding: 12px; width: 40px;">Blt.</th>
                            <th style="padding: 12px;">Nr.</th>
                            <th style="padding: 12px;">Datum</th>
                            <th style="padding: 12px;">${currentAccountingType === 'incoming' ? 'Lieferant' : 'Kunde'}</th>
                            <th style="padding: 12px;">Netto</th>
                            <th style="padding: 12px;">MwSt.</th>
                            <th style="padding: 12px;">Brutto</th>
                            <th style="padding: 12px;">Maschine</th>
                            <th style="padding: 12px;">Zweck</th>
                            <th style="padding: 12px; width: 80px; text-align: center;">Aktion</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${grouped[monthName].map(e => `
                            <tr style="border-top: 1px solid rgba(255,255,255,0.03);">
                                <td style="padding: 12px;">
                                    <input type="checkbox" ${e.is_paid ? 'checked' : ''} 
                                        onclick="window.togglePaidStatus('${e.id}', this.checked)"
                                        style="width: 20px; height: 20px; cursor: pointer; accent-color: var(--color-primary-green); border-radius: 4px;">
                                </td>
                                <td style="padding: 12px; font-family: monospace; font-weight: 600;">${e.invoice_number || '-'}</td>
                                <td style="padding: 12px;">${new Date(e.date).toLocaleDateString('de-DE')}</td>
                                <td style="padding: 12px; font-weight: 700; color: #fff;">${e.entity}</td>
                                <td style="padding: 12px;">${window.formatCurrency(e.amount_net)}</td>
                                <td style="padding: 12px; font-size: 0.8rem; color: rgba(255,255,255,0.5);">${e.vat_rate}%</td>
                                <td style="padding: 12px; font-weight: 800; color: var(--color-primary-green);">${window.formatCurrency(e.amount_gross)}</td>
                                <td style="padding: 12px;">
                                    <span style="color: #60a5fa; font-weight: 600;">
                                        ${window.getMachineName(e.machine_id)}
                                    </span>
                                </td>
                                <td style="padding: 12px; font-size: 0.9rem; color: rgba(255,255,255,0.6);" title="${e.comment || ''}">
                                    ${e.comment ? (e.comment.length > 25 ? e.comment.substring(0, 25) + '...' : e.comment) : '-'}
                                </td>
                                <td style="padding: 12px; text-align: center;">
                                    <div style="display:flex; justify-content: center; gap: 8px;">
                                        <button onclick="window.editAccountingEntry('${e.id}')" class="btn-icon-soft" title="Bearbeiten" style="padding: 6px;">
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                        </button>
                                        <button onclick="window.deleteAccountingEntry('${e.id}')" class="btn-icon-soft delete" title="Löschen" style="padding: 6px; color: #ef4444;">
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    });

    if (html === '') {
        html = `<div style="padding: 5rem 2rem; text-align: center; color: rgba(255,255,255,0.2); font-size: 1.1rem;">
                    <div style="margin-bottom: 1rem; opacity: 0.1;"><svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg></div>
                    Noch keine ${currentAccountingType === 'incoming' ? 'Eingangsrechnungen' : 'Ausgangsrechnungen'} vorhanden.
                </div>`;
    }

    container.innerHTML = html;
    window.renderQuarters();
};

window.formatCurrency = function (val) {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(val);
};

window.getMachineName = function (id) {
    if (!id || !window.machineList) return '-';
    // Fallback if ID is string/number mismatch
    const machine = window.machineList.find(m => String(m.id) === String(id));
    return machine ? `${machine.manufacturer} ${machine.name}` : '-';
};

window.togglePaidStatus = async function (id, checked) {
    try {
        const { error } = await window.supabaseClient
            .from('accounting')
            .update({ is_paid: checked })
            .eq('id', id);
        if (error) throw error;

        const entry = allAccountingEntries.find(e => e.id === id);
        if (entry) entry.is_paid = checked;
    } catch (err) {
        console.error('Error updating paid status:', err);
        alert('Fehler beim Aktualisieren des Zahlungsstatus.');
    }
};

window.renderQuarters = function () {
    const grid = document.getElementById('quarters-grid');
    if (!grid) return;

    const quarters = [
        { name: 'Q1', months: [0, 1, 2], label: 'Januar - März' },
        { name: 'Q2', months: [3, 4, 5], label: 'April - Juni' },
        { name: 'Q3', months: [6, 7, 8], label: 'Juli - September' },
        { name: 'Q4', months: [9, 10, 11], label: 'Oktober - Dezember' }
    ];

    grid.innerHTML = quarters.map(q => {
        const quarterData = allAccountingEntries.filter(e => {
            const m = new Date(e.date).getMonth();
            return q.months.includes(m);
        });

        const incomingNum = quarterData.filter(e => e.type === 'incoming').reduce((sum, e) => sum + parseFloat(e.amount_gross), 0);
        const outgoingNum = quarterData.filter(e => e.type === 'outgoing').reduce((sum, e) => sum + parseFloat(e.amount_gross), 0);
        const balance = outgoingNum - incomingNum;

        return `
            <div class="glass-card" style="padding: 1.5rem; text-align: center; border: 2px solid ${balance >= 0 ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'};">
                <div style="font-size: 1.4rem; font-weight: 900; color: #fff;">${q.name}</div>
                <div style="font-size: 0.8rem; color: rgba(255,255,255,0.4); margin-bottom: 1.25rem; font-weight: 600;">${q.label}</div>
                <div style="display: flex; flex-direction: column; gap: 10px;">
                    <div style="display: flex; justify-content: space-between; font-size: 0.95rem;">
                        <span style="color: rgba(255,255,255,0.6);">Ausgang:</span>
                        <span style="color: var(--color-primary-green); font-weight: 800;">${window.formatCurrency(outgoingNum)}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; font-size: 0.95rem;">
                        <span style="color: rgba(255,255,255,0.6);">Eingang:</span>
                        <span style="color: #f87171; font-weight: 800;">${window.formatCurrency(incomingNum)}</span>
                    </div>
                    <div style="margin-top: 10px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.1); display: flex; justify-content: space-between; font-weight: 900; font-size: 1.1rem;">
                        <span>Bilanz:</span>
                        <span style="color: ${balance >= 0 ? 'var(--color-primary-green)' : '#f87171'};">${window.formatCurrency(balance)}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
};

window.openAccountingModal = function () {
    console.log('Accounting Module: openAccountingModal called');
    const modal = document.getElementById('accounting-modal');
    const form = document.getElementById('accounting-form');
    if (!modal) {
        console.error('Accounting Modal not found!');
        return;
    }
    if (!form) {
        console.error('Accounting Form not found!');
        return;
    }

    form.reset();
    const idField = document.getElementById('accounting-id');
    if (idField) idField.value = '';

    const titleField = document.getElementById('accounting-modal-title');
    if (titleField) titleField.textContent = 'Neuer Buchhaltungseintrag';

    // Set current type as default
    const typeField = document.getElementById('acc-type');
    if (typeField) {
        typeField.value = currentAccountingType;
        window.updateAccountingEntityLabel();
    }

    // Populate Machines Dropdown
    const machineSelect = document.getElementById('acc-machine-id');
    if (machineSelect && window.machineList) {
        machineSelect.innerHTML = '<option value="">Keine Zuordnung</option>' +
            window.machineList.map(m => `<option value="${m.id}">${m.manufacturer} ${m.name} (${m.serial || '-'})</option>`).join('');
    }

    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    // Small delay to ensure display: flex is applied before adding 'show' for transition
    requestAnimationFrame(() => {
        modal.classList.add('show');
    });
    console.log('Accounting Module: Modal shown');
};

window.closeAccountingModal = function () {
    const modal = document.getElementById('accounting-modal');
    if (modal) {
        modal.classList.remove('show');
        setTimeout(() => {
            modal.classList.add('hidden');
            modal.style.display = 'none';
        }, 300);
    }
};

window.updateAccountingEntityLabel = function () {
    const typeField = document.getElementById('acc-type');
    if (!typeField) return;
    const type = typeField.value;
    const label = document.getElementById('acc-entity-label');
    const input = document.getElementById('acc-entity');

    if (type === 'incoming') {
        if (label) label.textContent = 'Lieferant';
        if (input) input.placeholder = 'Name des Lieferanten';
    } else {
        if (label) label.textContent = 'Kunde';
        if (input) input.placeholder = 'Name des Kunden';
    }
};

window.calculateGross = function () {
    const netInput = document.getElementById('acc-amount-net');
    const vatSelect = document.getElementById('acc-vat-rate');
    const grossInput = document.getElementById('acc-amount-gross');

    if (!netInput || !vatSelect || !grossInput) return;

    const net = parseFloat(netInput.value) || 0;
    const vatRate = parseFloat(vatSelect.value) || 0;
    const gross = net * (1 + vatRate / 100);
    grossInput.value = gross.toFixed(2);
};

window.submitAccountingEntry = async function (event) {
    if (event) event.preventDefault();
    console.log('Accounting Module: submitting entry');

    try {
        const id = document.getElementById('accounting-id').value;
        const machineVal = document.getElementById('acc-machine-id').value;
        const entryData = {
            type: document.getElementById('acc-type').value,
            invoice_number: document.getElementById('acc-invoice-number').value,
            date: document.getElementById('acc-date').value,
            entity: document.getElementById('acc-entity').value,
            amount_net: parseFloat(document.getElementById('acc-amount-net').value),
            vat_rate: parseFloat(document.getElementById('acc-vat-rate').value),
            amount_gross: parseFloat(document.getElementById('acc-amount-gross').value),
            machine_id: machineVal ? parseInt(machineVal, 10) : null,
            comment: document.getElementById('acc-comment').value
        };

        // Wenn created_by eine echte UUID ist (Länge > 30), mitsenden, sonst weglassen.
        if (window.activeUser && window.activeUser.id && String(window.activeUser.id).length > 30) {
            entryData.created_by = window.activeUser.id;
        }

        let result;
        if (id && id.length > 30) { // Check valid UUID for update
            result = await window.supabaseClient.from('accounting').update(entryData).eq('id', id);
        } else {
            result = await window.supabaseClient.from('accounting').insert([entryData]);
        }

        if (result.error) throw result.error;

        window.closeAccountingModal();
        window.fetchAccountingEntries();
    } catch (err) {
        console.error('Error saving accounting entry:', err);
        alert('Fehler beim Speichern: ' + err.message);
    }
};

window.editAccountingEntry = async function (id) {
    const entry = allAccountingEntries.find(e => e.id === id);
    if (!entry) return;

    window.openAccountingModal();
    document.getElementById('accounting-modal-title').textContent = 'Eintrag bearbeiten';
    document.getElementById('accounting-id').value = entry.id;
    document.getElementById('acc-type').value = entry.type;
    document.getElementById('acc-invoice-number').value = entry.invoice_number || '';
    document.getElementById('acc-date').value = entry.date;
    document.getElementById('acc-entity').value = entry.entity;
    document.getElementById('acc-amount-net').value = entry.amount_net;
    document.getElementById('acc-vat-rate').value = entry.vat_rate;
    document.getElementById('acc-amount-gross').value = entry.amount_gross;
    document.getElementById('acc-machine-id').value = entry.machine_id || '';
    document.getElementById('acc-comment').value = entry.comment || '';

    window.updateAccountingEntityLabel();
};

window.deleteAccountingEntry = async function (id) {
    if (!confirm('Möchten Sie diesen Eintrag wirklich löschen?')) return;

    try {
        const { error } = await window.supabaseClient.from('accounting').delete().eq('id', id);
        if (error) throw error;
        window.fetchAccountingEntries();
    } catch (err) {
        console.error('Error deleting accounting entry:', err);
        alert('Fehler beim Löschen.');
    }
};

window.handleAccountingPDFUpload = async function (event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!window.pdfjsLib) {
        alert('PDF-Bibliothek konnte nicht geladen werden. Bitte prüfen Sie Ihre Internetverbindung.');
        return;
    }

    try {
        const fileReader = new FileReader();
        fileReader.onload = async function () {
            const typedarray = new Uint8Array(this.result);
            const loadingTask = window.pdfjsLib.getDocument(typedarray);
            const pdfDocument = await loadingTask.promise;

            let fullText = '';
            for (let i = 1; i <= pdfDocument.numPages; i++) {
                const page = await pdfDocument.getPage(i);
                const textContent = await page.getTextContent();
                const pageText = textContent.items.map(item => item.str).join(' ');
                fullText += pageText + '\n';
            }

            // --- NEU: Groq API Integration (Kostenlose KI) ---
            const apiKey = localStorage.getItem('groq_api_key');

            if (!apiKey) {
                alert('Bitte hinterlegen Sie zunächst einen Groq API-Key in den Einstellungen (Zahnrad-Symbol oben rechts).');
                event.target.value = '';
                return;
            }

            // UI Feedback: Button Text anpassen oder Alert zeigen
            const uploadBox = document.getElementById('acc-pdf-dropzone');
            const originalContent = uploadBox ? uploadBox.innerHTML : '';
            if (uploadBox) {
                uploadBox.innerHTML = '<div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: #60a5fa;"><svg class="spinner" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation: spin 1s linear infinite; margin-bottom: 10px;"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line></svg><p style="margin:0;">KI analysiert Beleg...</p></div>';
            }

            try {
                const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`
                    },
                    body: JSON.stringify({
                        model: "llama-3.3-70b-versatile",
                        messages: [
                            {
                                role: "system",
                                content: "Du bist ein präziser Buchhaltungs-Assistent. Deine einzige Aufgabe ist es, den angehängten rohen Text aus einem Rechnungs-PDF (oder OCR-Text) zu analysieren und als JSON-Objekt zurückzugeben. Antworte AUSSCHLIESSLICH mit dem validen JSON-Objekt, ohne jeglichen Markdown-Text drumherum. Extraghiere folgende Schlüssel:\n\n1. 'invoice_number': Die Rechnungsnummer (String).\n2. 'date': Das Rechnungsdatum im Format YYYY-MM-DD.\n3. 'net_amount': Der reine Netto-Betrag als Zahl (z.B. 1234.56, nutze Punkt als Dezimaltrennzeichen).\n4. 'vat_rate': Der anwendbare Mehrwertsteuersatz in Prozent als String (z.B. '19', '7' oder '0').\n5. 'type': Bestimme, ob es eine Eingangsrechnung oder Ausgangsrechnung ist. EURE EIGENE FIRMA ist 'Meetra', 'Meetra Recycling', 'Meetra Recycling Maschinen' oder 'Mirco Loseke'. Wenn eure eigene Firma der Absender/Rechnungssteller ist (also ihr das Geld bekommt), ist es eine Ausgangsrechnung ('outgoing'). Wenn eure Firma der Rechnungsempfänger ist und jemand anderes euch eine Rechnung stellt (ihr müsst bezahlen), ist es eine Eingangsrechnung ('incoming'). Antworte strikt mit 'incoming' oder 'outgoing'.\n6. 'entity': Name des logischen Geschäftspartners (Name des Kunden oder des Lieferanten). Trage hier NIEMALS eure eigene Firma ('Meetra', 'Mirco Loseke' etc.) ein, sondern immer die ANDERE Firma/Person auf dem Beleg.\n\nFalls ein Wert absolut nicht gefunden wird, setze ihn auf null."
                            },
                            {
                                role: "user",
                                content: `Hier ist der Rohtext des PDFs:\n\n${fullText}`
                            }
                        ],
                        temperature: 0.1,
                        response_format: { type: "json_object" }
                    })
                });

                if (!response.ok) {
                    const errData = await response.json();
                    throw new Error(`Groq API Fehler: ${errData.error?.message || response.statusText}`);
                }

                const data = await response.json();
                let resultText = data.choices[0].message.content;

                // Remove potential markdown fences from Groq response
                resultText = resultText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

                let parsedData;

                try {
                    parsedData = JSON.parse(resultText);
                } catch (e) {
                    console.error("Fehler beim Parsen der Groq Antwort:", resultText);
                    throw new Error("Die KI hat keine gültigen Daten geliefert.");
                }

                // Fill Form Fields with OpenAI Data

                if (parsedData.type) {
                    const typeSelect = document.getElementById('acc-type');
                    if (typeSelect) {
                        typeSelect.value = parsedData.type; // 'incoming' or 'outgoing'
                    }
                }

                if (parsedData.entity) {
                    const entityInput = document.getElementById('acc-entity');
                    if (entityInput) {
                        entityInput.value = parsedData.entity;
                    }
                }

                if (parsedData.invoice_number) {
                    const invInput = document.getElementById('acc-invoice-number');
                    if (invInput) invInput.value = parsedData.invoice_number;
                }

                if (parsedData.date) {
                    const dateInput = document.getElementById('acc-date');
                    // Gpt should format it YYYY-MM-DD
                    if (dateInput) dateInput.value = parsedData.date;
                }

                if (parsedData.net_amount !== null && parsedData.net_amount !== undefined) {
                    const netInput = document.getElementById('acc-amount-net');
                    if (netInput && !isNaN(parsedData.net_amount)) {
                        netInput.value = parseFloat(parsedData.net_amount).toFixed(2);
                    }
                }

                if (parsedData.vat_rate) {
                    const vatSelect = document.getElementById('acc-vat-rate');
                    if (vatSelect) {
                        Array.from(vatSelect.options).forEach(opt => {
                            if (opt.value === parsedData.vat_rate.toString()) {
                                vatSelect.value = parsedData.vat_rate.toString();
                            }
                        });
                    }
                }

                // Trigger Brutto Calculation
                window.calculateGross();
                alert('Beleg wurde erfolgreich durch die KI analysiert!');

            } catch (apiError) {
                console.error("Groq Fehler:", apiError);
                if (apiError.message.includes('insufficient_quota') || apiError.message.includes('exceeded your current quota')) {
                    alert('Fehler: Das Rate-Limit der kostenlosen Groq API wurde erreicht. Bitte kurz warten.');
                } else if (apiError.message.includes('invalid_api_key') || apiError.message.includes('Incorrect API key')) {
                    alert('Fehler: Der eingegebene API-Key ist ungültig. Bitte prüfe die Einstellungen.');
                } else {
                    alert(`Fehler bei der KI-Analyse: ${apiError.message}`);
                }
            } finally {
                // Restore UI
                if (uploadBox && originalContent) {
                    uploadBox.innerHTML = originalContent;
                }
                event.target.value = ''; // Reset file input
            }
        };
        fileReader.readAsArrayBuffer(file);
    } catch (err) {
        console.error("Error parsing PDF:", err);
        alert('Fehler beim Analysieren der PDF-Datei.');
    }
};

window.handleAccountingPDFDrop = async function (event) {
    if (event.dataTransfer.files && event.dataTransfer.files.length > 0) {
        const file = event.dataTransfer.files[0];
        if (file.type === "application/pdf") {
            const simulatedEvent = { target: { files: [file] } };
            window.handleAccountingPDFUpload(simulatedEvent);
        } else {
            alert('Bitte nur PDF-Dateien hochladen.');
        }
    }
};
