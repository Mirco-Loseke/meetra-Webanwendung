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

    // Group by Month and Year
    const months = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
    const grouped = {};

    filtered.forEach(entry => {
        const date = new Date(entry.date);
        const monthIndex = date.getMonth();
        const year = date.getFullYear();
        const groupName = `${months[monthIndex]} ${year}`;
        if (!grouped[groupName]) grouped[groupName] = [];
        grouped[groupName].push(entry);
    });

    let html = '';

    // Sort groups by Year descending, then Month descending
    const activeMonths = Object.keys(grouped).sort((a, b) => {
        const [monthA, yearA] = a.split(' ');
        const [monthB, yearB] = b.split(' ');
        if (yearA !== yearB) return parseInt(yearB) - parseInt(yearA);
        return months.indexOf(monthB) - months.indexOf(monthA);
    });

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
                            <th style="padding: 12px; width: 30px;"></th>
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
                            <tr style="border-top: 1px solid rgba(255,255,255,0.03); transition: background 0.2s;" class="accounting-main-row" id="row-${e.id}">
                                <td style="padding: 12px; text-align: center; cursor: pointer; color: var(--color-primary-green);" onclick="window.toggleAccountingDetails('${e.id}', this)">
                                    <svg class="chevron-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="transition: transform 0.3s;"><path d="M9 18l6-6-6-6"></path></svg>
                                </td>
                                <td style="padding: 12px; text-align: center;">
                                    <label style="position: relative; display: inline-block; width: 32px; height: 18px; margin: 0; cursor: pointer;" title="Bezahlt">
                                        <input type="checkbox" ${e.is_paid ? 'checked' : ''} 
                                            onchange="window.togglePaidStatus('${e.id}', this.checked)"
                                            style="opacity: 0; width: 0; height: 0; position: absolute;">
                                        <span style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background-color: ${e.is_paid ? 'var(--color-primary-green)' : 'rgba(255,255,255,0.1)'}; border: 1px solid ${e.is_paid ? 'transparent' : 'rgba(255,255,255,0.2)'}; transition: .3s; border-radius: 20px;">
                                            <span style="position: absolute; height: 12px; width: 12px; left: ${e.is_paid ? '18px' : '2px'}; top: 2px; background-color: ${e.is_paid ? '#fff' : 'rgba(255,255,255,0.5)'}; transition: .3s; border-radius: 50%; box-shadow: 0 1px 2px rgba(0,0,0,0.3);"></span>
                                        </span>
                                    </label>
                                </td>
                                <td style="padding: 10px 12px; font-weight: 600; font-size: 0.85rem;">${e.invoice_number || '-'}</td>
                                <td style="padding: 10px 12px; font-size: 0.85rem;">
                                    <div style="font-weight: 600;">${new Date(e.date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}</div>
                                    ${e.due_date ? `<div style="font-size: 0.75rem; color: #f87171; margin-top: 2px; font-weight: 700;">fällig: ${new Date(e.due_date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}</div>` : ''}
                                </td>
                                <td style="padding: 10px 12px; font-weight: 700; color: #fff; font-size: 0.85rem;">${e.entity}</td>
                                <td style="padding: 10px 12px; font-size: 0.85rem;">${window.formatCurrency(e.amount_net)}</td>
                                <td style="padding: 10px 12px; font-size: 0.75rem; color: rgba(255,255,255,0.5);">${e.vat_rate}%</td>
                                <td style="padding: 10px 12px; font-size: 0.85rem;">
                                    <div style="font-weight: 800; color: #fff;">${window.formatCurrency(e.amount_gross)}</div>
                                    ${e.discount_amount && parseFloat(e.discount_amount) > 0 ? `
                                        <div style="font-size: 0.7rem; color: #10b981; margin-top: 2px; display: flex; flex-direction: column; gap: 1px;">
                                            <div style="display: flex; align-items: center; gap: 4px;">
                                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg> 
                                                -${window.formatCurrency(e.discount_amount)} ${e.discount_date ? 'bis ' + new Date(e.discount_date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) : ''}
                                            </div>
                                            <div style="font-weight: 700; color: #fff; background: rgba(16, 185, 129, 0.2); padding: 1px 4px; border-radius: 3px; width: fit-content; font-size: 0.7rem;">
                                                Zahlbetrag: ${window.formatCurrency(e.amount_gross - e.discount_amount)}
                                            </div>
                                        </div>` : ''}
                                </td>
                                <td style="padding: 10px 12px; font-size: 0.85rem;">
                                    <span style="color: var(--color-primary-green); font-weight: 700;">
                                        ${window.getMachineName(e.machine_id)}
                                    </span>
                                </td>
                                <td style="padding: 10px 12px; font-size: 0.8rem; color: rgba(255,255,255,0.5);" title="${e.comment || ''}">
                                    ${e.comment ? (e.comment.length > 20 ? e.comment.substring(0, 20) + '...' : e.comment) : '-'}
                                </td>
                                <td style="padding: 10px 12px; text-align: center;">
                                    <div style="display:flex; justify-content: center; gap: 6px;">
                                        <button onclick="window.editAccountingEntry('${e.id}')" class="btn-icon-soft" title="Bearbeiten" style="padding: 4px;">
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                        </button>
                                        <button onclick="window.deleteAccountingEntry('${e.id}')" class="btn-icon-soft delete" title="Löschen" style="padding: 4px; color: #ef4444;">
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                        </button>
                                    </div>
                                </td>
                            </tr>
                            <tr id="details-${e.id}" class="hidden" style="background: rgba(255,255,255,0.01);">
                                <td colspan="11" style="padding: 0 1.5rem 1.5rem 3rem;">
                                    <div id="details-content-${e.id}" style="padding: 1.5rem; border: 1px solid rgba(255,255,255,0.05); border-top: none; border-radius: 0 0 16px 16px; background: rgba(0,0,0,0.2);">
                                        <div style="color: rgba(255,255,255,0.3); font-size: 0.85rem; display: flex; align-items: center; gap: 10px;">
                                            <div class="spinner-small"></div>
                                            Lade Details...
                                        </div>
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
    return machine ? [machine.manufacturer, machine.name, machine.serial_number || machine.serial ? `#${machine.serial_number || machine.serial}` : null, machine.year ? `(${machine.year})` : null].filter(Boolean).join(' ') : '-';
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

        window.renderAccounting(); // UI neu rendern für Toggle-Animation
    } catch (err) {
        console.error('Error updating paid status:', err);
        alert('Fehler beim Aktualisieren des Zahlungsstatus.');
    }
};

let selectedQuartersYear = new Date().getFullYear();

window.switchQuartersYear = function(year) {
    selectedQuartersYear = parseInt(year);
    window.renderQuarters();
};

window.renderQuarters = function () {
    const grid = document.getElementById('quarters-grid');
    const yearSelect = document.getElementById('quarters-year-select');
    if (!grid) return;

    const quarters = [
        { name: 'Q1', months: [0, 1, 2], label: 'Januar - März' },
        { name: 'Q2', months: [3, 4, 5], label: 'April - Juni' },
        { name: 'Q3', months: [6, 7, 8], label: 'Juli - September' },
        { name: 'Q4', months: [9, 10, 11], label: 'Oktober - Dezember' }
    ];

    // Sammle alle eindeutigen Jahre aus den Daten
    const years = [...new Set(allAccountingEntries.map(e => new Date(e.date).getFullYear()))].sort((a, b) => b - a);
    if (!years.includes(new Date().getFullYear())) {
        years.push(new Date().getFullYear());
        years.sort((a, b) => b - a);
    }

    // Dropdown befüllen falls vorhanden
    if (yearSelect) {
        const currentSelection = yearSelect.value || selectedQuartersYear;
        yearSelect.innerHTML = years.map(y => `<option value="${y}" ${String(y) === String(currentSelection) ? 'selected' : ''}>${y}</option>`).join('');
    }

    let html = '';

    quarters.forEach(q => {
        const quarterData = allAccountingEntries.filter(e => {
            const d = new Date(e.date);
            return d.getFullYear() === selectedQuartersYear && q.months.includes(d.getMonth());
        });

        const incomingNum = quarterData.filter(e => e.type === 'incoming').reduce((sum, e) => sum + parseFloat(e.amount_gross), 0);
        const outgoingNum = quarterData.filter(e => e.type === 'outgoing').reduce((sum, e) => sum + parseFloat(e.amount_gross), 0);
        const balance = outgoingNum - incomingNum;

        html += `
            <div class="glass-card" style="padding: 1.5rem; text-align: center; border: 2px solid ${balance >= 0 ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'};">
                <div style="font-size: 1.4rem; font-weight: 900; color: #fff;">${q.name} ${selectedQuartersYear}</div>
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
        });

    grid.innerHTML = html;
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
        machineSelect.innerHTML = '<option value="" style="color: #fff;">Keine Zuordnung</option>' +
            window.machineList.map(m => `<option value="${m.id}" style="color: var(--color-primary-green); font-weight: 600;">${window.getMachineName(m.id)}</option>`).join('');
    }

    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    // Small delay to ensure display: flex is applied before adding 'show' for transition
    requestAnimationFrame(() => {
        modal.classList.add('show');
    });

    // Clear Positions
    const itemsContainer = document.getElementById('accounting-items-container');
    if (itemsContainer) itemsContainer.innerHTML = '';

    console.log('Accounting Module: Modal shown');
};

window.addAccountingItemRow = function (data = {}) {
    const container = document.getElementById('accounting-items-container');
    if (!container) return;

    const rowId = 'item-row-' + Math.random().toString(36).substr(2, 9);
    const div = document.createElement('div');
    div.id = rowId;
    div.className = 'item-row';
    div.style.display = 'grid';
    div.style.gridTemplateColumns = '2fr 80px 80px 100px 100px 1.5fr 40px';
    div.style.gap = '10px';
    div.style.alignItems = 'center';
    div.style.padding = '10px';
    div.style.background = 'rgba(255,255,255,0.03)';
    div.style.borderRadius = '10px';
    div.style.border = '1px solid rgba(255,255,255,0.05)';

    const machineOptions = (window.machineList || []).map(m => `<option value="${m.id}" ${String(data.machine_id) === String(m.id) ? 'selected' : ''} style="color: var(--color-primary-green); font-weight: 600;">${window.getMachineName(m.id)}</option>`).join('');
    const initialLineTotal = ((parseFloat(data.quantity) || 1) * (parseFloat(data.price_net) || 0)).toFixed(2);

    div.innerHTML = `
        <input type="text" class="glass-form-input item-desc" value="${data.description || ''}" placeholder="Bezeichnung" style="padding: 8px;">
        <input type="number" step="0.01" class="glass-form-input item-qty" value="${data.quantity || 1}" placeholder="Menge" style="padding: 8px;" oninput="window.updateAccountingTotalFromItems()">
        <input type="text" class="glass-form-input item-unit" value="${data.unit || 'Stk'}" placeholder="Einh." style="padding: 8px;">
        <input type="number" step="0.01" class="glass-form-input item-price" value="${data.price_net || ''}" placeholder="Preis (€)" style="padding: 8px;" oninput="window.updateAccountingTotalFromItems()">
        <div class="item-line-total" style="color: var(--color-primary-green); font-weight: 700; text-align: right; padding-right: 5px;">${initialLineTotal} €</div>
        <select class="glass-form-input item-machine" style="padding: 8px; color: var(--color-primary-green); font-weight: 700;">
            <option value="" style="color: #fff;">Keine Maschine</option>
            ${machineOptions}
        </select>
        <button type="button" class="btn-icon-soft" onclick="document.getElementById('${rowId}').remove(); window.updateAccountingTotalFromItems();" style="color: #ef4444; padding: 5px;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
    `;

    container.appendChild(div);
};

window.updateAccountingTotalFromItems = function () {
    const rows = document.querySelectorAll('#accounting-items-container .item-row');
    if (rows.length === 0) return;

    let totalNet = 0;
    rows.forEach(row => {
        const qty = parseFloat(row.querySelector('.item-qty').value) || 0;
        const price = parseFloat(row.querySelector('.item-price').value) || 0;
        const lineTotal = qty * price;
        totalNet += lineTotal;
        
        const lineTotalEl = row.querySelector('.item-line-total');
        if (lineTotalEl) {
            lineTotalEl.innerText = lineTotal.toFixed(2) + ' €';
        }
    });

    const netInput = document.getElementById('acc-amount-net');
    if (netInput) {
        netInput.value = totalNet.toFixed(2);
        window.calculateGross();
    }
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
            comment: document.getElementById('acc-comment').value,
            due_date: document.getElementById('acc-due-date').value || null,
            discount_date: document.getElementById('acc-discount-date').value || null,
            discount_amount: parseFloat(document.getElementById('acc-discount-amount').value) || null
        };

        // Wenn created_by eine echte UUID ist (Länge > 30), mitsenden, sonst weglassen.
        if (window.activeUser && window.activeUser.id && String(window.activeUser.id).length > 30) {
            entryData.created_by = window.activeUser.id;
        }

        let result;
        if (id && id.length > 30) { // Check valid UUID for update
            result = await window.supabaseClient.from('accounting').update(entryData).eq('id', id);
        } else {
            result = await window.supabaseClient.from('accounting').insert([entryData]).select();
        }

        if (result.error) throw result.error;
        const accountingId = id || result.data[0].id;

        // Save Items
        const itemRows = document.querySelectorAll('#accounting-items-container .item-row');
        const items = Array.from(itemRows).map(row => ({
            accounting_id: accountingId,
            description: row.querySelector('.item-desc').value,
            quantity: parseFloat(row.querySelector('.item-qty').value) || 1,
            unit: row.querySelector('.item-unit').value,
            price_net: parseFloat(row.querySelector('.item-price').value) || 0,
            machine_id: row.querySelector('.item-machine').value ? parseInt(row.querySelector('.item-machine').value, 10) : null
        }));

        // Delete old items first if updating
        if (id) {
            await window.supabaseClient.from('accounting_items').delete().eq('accounting_id', id);
        }

        if (items.length > 0) {
            const { error: itemsError } = await window.supabaseClient.from('accounting_items').insert(items);
            if (itemsError) throw itemsError;
        }

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
    document.getElementById('acc-due-date').value = entry.due_date || '';
    document.getElementById('acc-discount-date').value = entry.discount_date || '';
    document.getElementById('acc-discount-amount').value = entry.discount_amount || '';

    document.getElementById('acc-discount-amount').value = entry.discount_amount || '';

    // Fetch and render items
    try {
        const { data: items, error: itemsError } = await window.supabaseClient
            .from('accounting_items')
            .select('*')
            .eq('accounting_id', id);
        
        if (itemsError) throw itemsError;
        
        const itemsContainer = document.getElementById('accounting-items-container');
        if (itemsContainer) itemsContainer.innerHTML = '';
        if (items && items.length > 0) {
            items.forEach(item => window.addAccountingItemRow(item));
        }
    } catch (err) {
        console.error('Error fetching accounting items:', err);
    }

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

    const apiKey = localStorage.getItem('groq_api_key');
    if (!apiKey) {
        alert('Bitte hinterlegen Sie einen Groq API-Key in den Einstellungen.');
        return;
    }

    const uploadBox = document.getElementById('acc-pdf-dropzone');
    const originalContent = uploadBox ? uploadBox.innerHTML : '';
    
    // UI Feedback Start
    if (uploadBox) {
        uploadBox.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: #60a5fa;">
                <svg class="spinner" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation: spin 1s linear infinite; margin-bottom: 10px;">
                    <line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line>
                    <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line>
                    <line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line>
                    <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line>
                </svg>
                <p style="margin:0;" id="ai-status-text">KI analysiert Beleg...</p>
            </div>`;
    }

    const updateStatus = (text) => {
        const el = document.getElementById('ai-status-text');
        if (el) el.innerText = text;
        console.log(`[AI-Status]: ${text}`);
    };

    try {
        const isImage = file.type.startsWith('image/');
        const systemPrompt = `Du bist ein präziser Buchhaltungs-Assistent für das Unternehmen 'Meetra'. Analysiere das Dokument und gib NUR valides JSON zurück. 
Schlüssel: invoice_number, date (YYYY-MM-DD), net_amount (Zahl), vat_rate (Zahl), type (incoming/outgoing), entity (Geschäftspartner), due_date (YYYY-MM-DD), discount_amount (Zahl), positions (Array aus {description, quantity, unit, price_net}). 

WICHTIG ZUR IDENTIFIKATION (entity):
- 'Meetra' ist DEIN UNTERNEHMEN. Bei EINGANG (incoming) ist 'entity' der ABSENDER. 'Meetra' darf NIEMALS als 'entity' eingetragen werden.

WICHTIG ZU PREISEN (price_net):
- 'price_net' MUSS der EINZELPREIS pro Einheit sein.
- Falls Bezeichnungen wie '230/100' oder 'EUR/1000' klein dabeistehen: Das bedeutet der Preis gilt für 100 Einheiten. Rechne den Einzelpreis (1 Einheit) aus!
- PRIORITÄT: Falls die Zeile einen GESAMTPREIS hat (z.B. rechts am Rand), nutze diesen als festen Anker. Wenn Einzelpreis * Menge nicht den Zeilengesamtpreis ergibt, korrigiere den 'price_net' (Einzelpreis = Gesamtpreis / Menge).
- Achte auf klein gedruckte Divisoren oder Rabattspalten.
Setze Unbekanntes auf null.`;

        let requestBody = {};

        if (isImage) {
            updateStatus('Lese Bilddaten...');
            const base64Image = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = () => reject(new Error('Fehler beim Lesen der Bilddatei.'));
                reader.readAsDataURL(file);
            });

            requestBody = {
                model: "meta-llama/llama-4-scout-17b-16e-instruct",
                messages: [{
                    role: "user",
                    content: [
                        { type: "text", text: systemPrompt },
                        { type: "image_url", image_url: { url: base64Image } }
                    ]
                }],
                temperature: 0.1,
                response_format: { type: "json_object" }
            };
        } else {
            updateStatus('Lese PDF aus...');
            const base64Images = await new Promise((resolve, reject) => {
                try {
                    const reader = new FileReader();
                    reader.onload = async function() {
                        try {
                            const typedarray = new Uint8Array(this.result);
                            const loadingTask = window.pdfjsLib.getDocument(typedarray);
                            const pdfDocument = await loadingTask.promise;
                            
                            // Max 3 pages to prevent payload size issues/rate limits
                            const numPages = Math.min(pdfDocument.numPages, 3);
                            let images = [];
                            
                            for (let i = 1; i <= numPages; i++) {
                                const page = await pdfDocument.getPage(i);
                                const viewport = page.getViewport({ scale: 3.0 }); // Even higher scale for razor-sharp OCR of tiny text (230/100 etc)
                                const canvas = document.createElement('canvas');
                                const context = canvas.getContext('2d');
                                canvas.height = viewport.height;
                                canvas.width = viewport.width;
                                await page.render({ canvasContext: context, viewport: viewport }).promise;
                                images.push(canvas.toDataURL('image/jpeg', 0.95));
                            }
                            resolve(images);
                        } catch (e) {
                            reject(new Error('Fehler beim Rendern der PDF: ' + e.message));
                        }
                    };
                    reader.onerror = () => {
                        const errName = reader.error ? reader.error.name : 'UnknownError';
                        const errMsg = reader.error ? reader.error.message : 'No detailed message available';
                        console.error('FileReader Error:', reader.error);
                        reject(new Error(`Fehler beim Einlesen der PDF-Datei (${errName}: ${errMsg}).`));
                    };
                    reader.readAsArrayBuffer(file);
                } catch (err) {
                    reject(new Error('Unerwarteter Fehler beim Dateizugriff: ' + err.message));
                }
            });

            const contentArray = [ { type: "text", text: systemPrompt } ];
            base64Images.forEach(b64 => {
                contentArray.push({ type: "image_url", image_url: { url: b64 } });
            });

            requestBody = {
                model: "meta-llama/llama-4-scout-17b-16e-instruct",
                messages: [{ role: "user", content: contentArray }],
                temperature: 0.1,
                response_format: { type: "json_object" }
            };
        }

        updateStatus('KI verarbeitet Daten...');
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(`Groq Fehler: ${errData.error?.message || response.statusText}`);
        }

        const data = await response.json();
        let resultText = data.choices[0].message.content;
        resultText = resultText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

        const parsedData = JSON.parse(resultText);
        updateStatus('Daten erfolgreich extrahiert!');

        // Populate Form
        if (parsedData.type) {
            const sel = document.getElementById('acc-type');
            if (sel) {
                sel.value = parsedData.type;
                if (window.updateAccountingEntityLabel) window.updateAccountingEntityLabel();
            }
        }
        if (parsedData.entity) document.getElementById('acc-entity').value = parsedData.entity;
        if (parsedData.invoice_number) document.getElementById('acc-invoice-number').value = parsedData.invoice_number;
        if (parsedData.date) document.getElementById('acc-date').value = parsedData.date;
        if (parsedData.net_amount !== null) document.getElementById('acc-amount-net').value = parseFloat(parsedData.net_amount).toFixed(2);
        
        if (parsedData.vat_rate !== null) {
            const vatSel = document.getElementById('acc-vat-rate');
            if (vatSel) vatSel.value = parsedData.vat_rate.toString();
        }

        if (parsedData.due_date) document.getElementById('acc-due-date').value = parsedData.due_date;
        if (parsedData.discount_date) document.getElementById('acc-discount-date').value = parsedData.discount_date;
        if (parsedData.discount_amount !== null) document.getElementById('acc-discount-amount').value = parseFloat(parsedData.discount_amount).toFixed(2);

        window.calculateGross();

        // Positions
        const cont = document.getElementById('accounting-items-container');
        if (cont) {
            cont.innerHTML = '';
            if (parsedData.positions && Array.isArray(parsedData.positions)) {
                parsedData.positions.forEach(pos => window.addAccountingItemRow(pos));
            }
        }

        alert('Analyse abgeschlossen!');

    } catch (err) {
        console.error("AI Analysis Error:", err);
        const errMsg = err.message || JSON.stringify(err) || "Unbekannter Fehler beim API-Aufruf.";
        
        if (errMsg.includes('insufficient_quota') || errMsg.includes('exceeded your current quota')) {
            alert('Fehler: Das Rate-Limit der kostenlosen Groq API wurde erreicht. Bitte kurz warten.');
        } else if (errMsg.includes('invalid_api_key') || errMsg.includes('Incorrect API key')) {
            alert('Fehler: Der eingegebene API-Key ist ungültig. Bitte prüfe die Einstellungen.');
        } else {
            alert(`Fehler bei der Analyse: ${errMsg}`);
        }
    } finally {
        if (uploadBox) uploadBox.innerHTML = originalContent;
        event.target.value = ''; 
    }
};

window.handleAccountingPDFDrop = async function (event) {
    if (event.dataTransfer.files && event.dataTransfer.files.length > 0) {
        const file = event.dataTransfer.files[0];
        if (file.type === "application/pdf" || file.type.startsWith("image/")) {
            const simulatedEvent = { target: { files: [file] } };
            window.handleAccountingPDFUpload(simulatedEvent);
        } else {
            alert('Bitte nur PDF-Dateien oder Bilder hochladen.');
        }
    }
};

window.openFinancialDashboard = function () {
    const modal = document.getElementById('financial-dashboard-modal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.style.display = 'flex';

        // Anzeige des heutigen Datums
        const dateSpan = document.getElementById('fin-today-date');
        if (dateSpan) {
            dateSpan.textContent = '(Heute: ' + new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ')';
        }

        requestAnimationFrame(() => {
            modal.classList.add('show');
        });
        window.updateFinancialDashboard();
    }
};

window.closeFinancialDashboard = function () {
    const modal = document.getElementById('financial-dashboard-modal');
    if (modal) {
        modal.classList.remove('show');
        setTimeout(() => {
            modal.classList.add('hidden');
            modal.style.display = 'none';
        }, 300);
    }
};

window.updateFinancialDashboard = function () {
    const direction = document.getElementById('fin-direction').value || 'future';
    const days = parseInt(document.getElementById('fin-days').value) || 14;
    const content = document.getElementById('financial-dashboard-content');
    if (!content) return;

    const now = new Date();
    // Normalisiere heute auf Start des Tages für saubere Vergleiche
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const limitDate = new Date(today);
    if (direction === 'future') {
        limitDate.setDate(today.getDate() + days);
    } else {
        limitDate.setDate(today.getDate() - days);
    }

    const unpaid = allAccountingEntries.filter(e => !e.is_paid);

    let incomingItems = [];
    let outgoingItems = [];
    let skontoDeals = [];
    let overdueItems = [];

    unpaid.forEach(e => {
        const dueDate = e.due_date ? new Date(e.due_date) : null;
        const discDate = e.discount_date ? new Date(e.discount_date) : null;

        // ÜBERFÄLLIG Logik (nur wenn fällig in der Vergangenheit)
        if (dueDate && dueDate < today) {
            overdueItems.push(e);
        }

        // ZUKÜNFTIG / VERGANGEN Filter
        if (direction === 'future') {
            // Zukünftig: Nur was ab HEUTE fällig wird (oder Skonto hat) bis zum Limit
            if (dueDate && dueDate >= today && dueDate <= limitDate) {
                if (e.type === 'incoming') incomingItems.push(e);
                else outgoingItems.push(e);
            }
            // Skonto Check
            if (e.type === 'incoming' && discDate && discDate >= today && discDate <= limitDate) {
                skontoDeals.push(e);
            }
        } else {
            // Vergangen: Was im Zeitraum VOR heute liegt (bereits abgelaufen/vergangen)
            if (dueDate && dueDate < today && dueDate >= limitDate) {
                if (e.type === 'incoming') incomingItems.push(e);
                else outgoingItems.push(e);
            }
        }
    });

    const sumIncoming = incomingItems.reduce((sum, e) => sum + parseFloat(e.amount_gross), 0);
    const sumSkontoSafe = skontoDeals.reduce((sum, e) => sum + (parseFloat(e.discount_amount) || 0), 0);
    const sumOutgoing = outgoingItems.reduce((sum, e) => sum + parseFloat(e.amount_gross), 0);

    let html = `
        <div class="fin-total-banner">
            <div>
                <div style="font-size: 0.8rem; color: rgba(255,255,255,0.4); text-transform: uppercase;">Eingang (Offen)</div>
                <div style="font-size: 1.5rem; font-weight: 800; color: #f87171;">${window.formatCurrency(sumIncoming)}</div>
            </div>
            <div style="border-left: 1px solid rgba(255,255,255,0.1);"></div>
            <div>
                <div style="font-size: 0.8rem; color: rgba(255,255,255,0.4); text-transform: uppercase;">Skonto Potenzial</div>
                <div style="font-size: 1.5rem; font-weight: 800; color: #10b981;">${window.formatCurrency(sumSkontoSafe)}</div>
            </div>
            <div style="border-left: 1px solid rgba(255,255,255,0.1);"></div>
            <div>
                <div style="font-size: 0.8rem; color: rgba(255,255,255,0.4); text-transform: uppercase;">Ausgang (Erwartet)</div>
                <div style="font-size: 1.5rem; font-weight: 800; color: #10b981;">${window.formatCurrency(sumOutgoing)}</div>
            </div>
        </div>
    `;

    // Sektionen
    if (overdueItems.length > 0) {
        html += renderDashboardSection('⚠️ Überfällig (Eingang & Ausgang)', overdueItems, 'ef4444', 'due_date');
    }

    if (direction === 'future') {
        html += renderDashboardSection('📥 Eingang: Demnächst fällig', incomingItems, 'f87171', 'due_date');
        html += renderDashboardSection('🏷️ Eingang: Skonto-Fristen', skontoDeals, '10b981', 'discount_date', true);
        html += renderDashboardSection('📤 Ausgang: Erwartete Zahlungen', outgoingItems, '10b981', 'due_date');
    } else {
        html += renderDashboardSection('Rechnungen im gewählten Zeitraum', [...incomingItems, ...outgoingItems], '60a5fa', 'due_date');
    }

    content.innerHTML = html;
};

function renderDashboardSection(title, items, color, dateField, showSkonto = false) {
    if (items.length === 0) return '';

    return `
        <div class="fin-card">
            <div class="fin-section-title" style="color: #${color};">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                ${title}
            </div>
            ${items.map(e => {
        const isOutgoing = e.type === 'outgoing';
        const itemColor = isOutgoing ? '10b981' : (showSkonto ? '10b981' : color);
        const displayDate = e[dateField] ? new Date(e[dateField]).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-';

        return `
                <div class="fin-item">
                    <div style="font-weight: 600; color: rgba(255,255,255,0.5);">${displayDate}</div>
                    <div style="font-weight: 800; color: #fff;">
                        <span style="color: ${isOutgoing ? '#10b981' : '#f87171'}; font-size: 0.7rem; text-transform: uppercase; margin-right: 5px;">${isOutgoing ? 'Ausgang' : 'Eingang'}</span>
                        ${e.entity} 
                        <span style="font-weight: 400; color: rgba(255,255,255,0.3); font-size: 0.75rem; margin-left: 8px;">${e.invoice_number || ''}</span>
                    </div>
                    <div style="text-align: right; font-weight: 700;">${window.formatCurrency(e.amount_gross)}</div>
                    <div style="text-align: right; color: #${itemColor}; font-weight: 800;">
                        ${showSkonto ? '-' + window.formatCurrency(e.discount_amount) : window.formatCurrency(e.amount_gross)}
                    </div>
                </div>
                `;
    }).join('')}
        </div>
    `;
}

window.openMachineEvaluation = function () {
    const modal = document.getElementById('machine-evaluation-modal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
        requestAnimationFrame(() => {
            modal.classList.add('show');
        });
        window.updateMachineEvaluation();
    }
};

window.closeMachineEvaluation = function () {
    const modal = document.getElementById('machine-evaluation-modal');
    if (modal) {
        modal.classList.remove('show');
        setTimeout(() => {
            modal.classList.add('hidden');
            modal.style.display = 'none';
        }, 300);
    }
};

window.updateMachineEvaluation = async function () {
    const content = document.getElementById('machine-evaluation-content');
    if (!content) return;

    console.time('MachineEvaluation');
    content.innerHTML = '<div style="padding: 2rem; text-align: center; color: rgba(255,255,255,0.4);">Optimiere Datenzugriff...</div>';

    try {
        if (!window.supabaseClient) throw new Error('Supabase client not initialized');

        // 1. Fetch Items with joined accounting data
        console.log('Fetching accounting items...');
        const { data: items, error: itemsError } = await window.supabaseClient
            .from('accounting_items')
            .select(`
                accounting_id, 
                machine_id, 
                price_net, 
                quantity,
                accounting ( id, date, type )
            `)
            .not('machine_id', 'is', null);

        if (itemsError) throw itemsError;
        console.log(`Found ${items?.length || 0} items with machine assignment.`);

        // 2. Refresh main entries if needed (for direct assignments and UI sync)
        if (!allAccountingEntries || allAccountingEntries.length === 0) {
            console.log('Main entries empty, fetching...');
            await window.fetchAccountingEntries();
        }

        const grouped = {};
        const months = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
        const itemAccountingIds = new Set();

        // 3. Process items O(N)
        (items || []).forEach(item => {
            const entry = item.accounting;
            // Ignore items where parent accounting is deleted or not incoming
            if (!entry || entry.type !== 'incoming') return;
            
            itemAccountingIds.add(item.accounting_id);

            const date = new Date(entry.date);
            const monthYear = `${months[date.getMonth()]} ${date.getFullYear()}`;

            if (!grouped[item.machine_id]) grouped[item.machine_id] = {};
            if (!grouped[item.machine_id][monthYear]) grouped[item.machine_id][monthYear] = 0;
            
            grouped[item.machine_id][monthYear] += (parseFloat(item.price_net) || 0) * (parseFloat(item.quantity) || 1);
        });

        // 4. Process direct assignments O(M)
        allAccountingEntries.forEach(entry => {
            if (entry.machine_id && entry.type === 'incoming' && !itemAccountingIds.has(entry.id)) {
                const date = new Date(entry.date);
                const monthYear = `${months[date.getMonth()]} ${date.getFullYear()}`;
                
                if (!grouped[entry.machine_id]) grouped[entry.machine_id] = {};
                if (!grouped[entry.machine_id][monthYear]) grouped[entry.machine_id][monthYear] = 0;
                grouped[entry.machine_id][monthYear] += parseFloat(entry.amount_net) || 0;
            }
        });

        const allMonths = [...new Set(Object.values(grouped).flatMap(Object.keys))].sort((a,b) => {
             const partsA = a.split(' ');
             const partsB = b.split(' ');
             if (partsA.length < 2 || partsB.length < 2) return 0;
             if (partsA[1] !== partsB[1]) return parseInt(partsB[1]) - parseInt(partsA[1]);
             return months.indexOf(partsB[0]) - months.indexOf(partsA[0]);
        });

        if (Object.keys(grouped).length === 0) {
            content.innerHTML = '<div style="padding: 4rem; text-align: center; color: rgba(255,255,255,0.2);">Keine Kosten-Zuordnungen gefunden.</div>';
            return;
        }

        let html = `
            <table class="data-table" style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr style="text-align: left; color: rgba(255,255,255,0.4); font-size: 0.75rem; text-transform: uppercase;">
                        <th style="padding: 12px;">Maschine</th>
                        ${allMonths.map(m => `<th style="padding: 12px; text-align: right;">${m}</th>`).join('')}
                        <th style="padding: 12px; text-align: right;">Gesamt</th>
                    </tr>
                </thead>
                <tbody>
        `;

        Object.keys(grouped).forEach(mId => {
            const machineName = window.getMachineName(mId);
            let machineTotal = 0;
            html += `
                <tr style="border-top: 1px solid rgba(255,255,255,0.05);">
                    <td style="padding: 12px; font-weight: 700; color: var(--color-primary-green);">${machineName}</td>
                    ${allMonths.map(m => {
                        const val = grouped[mId][m] || 0;
                        machineTotal += val;
                        return `<td style="padding: 12px; text-align: right; color: ${val > 0 ? '#fff' : 'rgba(255,255,255,0.1)'};">${val > 0 ? window.formatCurrency(val) : '-'}</td>`;
                    }).join('')}
                    <td style="padding: 12px; text-align: right; font-weight: 800; background: rgba(255,255,255,0.02);">${window.formatCurrency(machineTotal)}</td>
                </tr>
            `;
        });

        html += '</tbody></table>';
        content.innerHTML = html;
        console.timeEnd('MachineEvaluation');

    } catch (err) {
        console.error('Error updating machine evaluation:', err);
        content.innerHTML = `<div style="padding: 2rem; color: #ef4444; text-align: center;">
            <div style="font-weight: 800; margin-bottom: 0.5rem;">Fehler beim Laden</div>
            <div style="font-size: 0.8rem; opacity: 0.7;">${err.message || 'Unbekannter Fehler'}</div>
            <button onclick="window.updateMachineEvaluation()" class="btn-primary" style="margin-top: 1rem; padding: 5px 15px; font-size: 0.8rem;">Erneut versuchen</button>
        </div>`;
    }
};

window.toggleAccountingDetails = async function (id, btn) {
    const detailsRow = document.getElementById(`details-${id}`);
    const mainRow = document.getElementById(`row-${id}`);
    const content = document.getElementById(`details-content-${id}`);
    const chevron = btn.querySelector('.chevron-icon');

    if (!detailsRow || !content) return;

    if (!detailsRow.classList.contains('hidden')) {
        detailsRow.classList.add('hidden');
        if (chevron) chevron.style.transform = 'rotate(0deg)';
        if (mainRow) mainRow.style.background = 'transparent';
        return;
    }

    // Show and rotate
    detailsRow.classList.remove('hidden');
    if (chevron) chevron.style.transform = 'rotate(90deg)';
    if (mainRow) mainRow.style.background = 'rgba(255,255,255,0.02)';

    // Lazy Load
    try {
        const { data: items, error } = await window.supabaseClient
            .from('accounting_items')
            .select('*')
            .eq('accounting_id', id);

        if (error) throw error;

        if (!items || items.length === 0) {
            content.innerHTML = '<div style="color: rgba(255,255,255,0.3); font-size: 0.85rem;">Keine Einzelpositionen für diesen Beleg gefunden.</div>';
            return;
        }

        let itemsHtml = `
            <div style="display: grid; grid-template-columns: 2fr 80px 80px 100px 100px 1.5fr; gap: 1rem; color: rgba(255,255,255,0.4); font-size: 0.75rem; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 0.75rem; padding-bottom: 0.5rem; border-bottom: 1px solid rgba(255,255,255,0.05);">
                <div>Bezeichnung</div>
                <div>Menge</div>
                <div>Einh.</div>
                <div style="text-align: right;">Preis (€)</div>
                <div style="text-align: right;">Gesamt (€)</div>
                <div style="padding-left: 1rem;">Maschine</div>
            </div>
        `;

        items.forEach(item => {
            const machineName = window.getMachineName(item.machine_id);
            itemsHtml += `
                <div style="display: grid; grid-template-columns: 2fr 80px 80px 100px 100px 1.5fr; gap: 1rem; align-items: center; padding: 0.5rem 0; border-bottom: 1px solid rgba(255,255,255,0.02); font-size: 0.85rem;">
                    <div style="font-weight: 600; color: #fff;">${item.description}</div>
                    <div style="color: rgba(255,255,255,0.6);">${item.quantity || 1}</div>
                    <div style="color: rgba(255,255,255,0.4);">${item.unit || '-'}</div>
                    <div style="text-align: right; font-weight: 700;">${window.formatCurrency(item.price_net)}</div>
                    <div style="text-align: right; font-weight: 800; color: #fff;">${window.formatCurrency((parseFloat(item.price_net) || 0) * (parseFloat(item.quantity) || 1))}</div>
                    <div style="padding-left: 1rem; color: var(--color-primary-green); font-weight: 600;">${machineName}</div>
                </div>
            `;
        });

        content.innerHTML = itemsHtml;

    } catch (err) {
        console.error('Error loading details:', err);
        content.innerHTML = '<div style="color: #ef4444; font-size: 0.85rem;">Fehler beim Laden der Details.</div>';
    }
};
