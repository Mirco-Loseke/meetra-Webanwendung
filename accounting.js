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

let selectedAccountingYear = null; // null = alle Jahre / Standardwert: aktuelles Jahr

window.fetchAccountingEntries = async function () {
    console.log('Accounting Module: fetching entries');
    try {
        const { data, error } = await window.supabaseClient
            .from('accounting')
            .select('*')
            .order('date', { ascending: false });

        if (error) throw error;
        allAccountingEntries = data || [];
        
        // Jahr-Dropdown befüllen (custom)
        const yearDisplay = document.getElementById('acc-year-display');
        const yearList = document.getElementById('acc-year-list');
        if (yearDisplay && yearList) {
            const years = [...new Set(allAccountingEntries.map(e => new Date(e.date).getFullYear()))].sort((a, b) => b - a);
            const currentYear = new Date().getFullYear();
            if (!years.includes(currentYear)) years.unshift(currentYear);
            if (selectedAccountingYear === null) selectedAccountingYear = currentYear;

            const options = [{ value: 'alle', label: 'Alle' }, ...years.map(y => ({ value: y, label: String(y) }))];
            yearList.innerHTML = options.map(opt => `
                <div onclick="event.stopPropagation(); window.filterAccountingByYear('${opt.value}')"
                    style="padding: 8px 16px; font-size: 0.9rem; font-weight: 700; color: ${String(opt.value) === String(selectedAccountingYear) ? 'var(--color-primary-green)' : '#fff'}; cursor: pointer; transition: background 0.15s; white-space: nowrap;"
                    onmouseover="this.style.background='rgba(255,255,255,0.08)'" onmouseout="this.style.background='transparent'">
                    ${opt.label}
                </div>`).join('');
            yearDisplay.textContent = selectedAccountingYear === 'alle' ? 'Alle' : selectedAccountingYear;
        }

        renderAccounting();
        window.renderQuarters();
    } catch (err) {
        console.error('Error fetching accounting:', err);
    }
};

window.toggleYearDropdown = function(e) {
    e.stopPropagation();
    const list = document.getElementById('acc-year-list');
    if (!list) return;
    list.classList.toggle('hidden');
};

// --- Custom Glass Dropdown Utilities ---
window.openGlassDropdown = function(anchorEl, options, onSelectCallback) {
    let portal = document.getElementById('glass-dropdown-portal');
    if (!portal) {
        portal = document.createElement('div');
        portal.id = 'glass-dropdown-portal';
        portal.className = 'hide-scrollbar';
        portal.style.cssText = 'position: fixed; max-height: 250px; overflow-y: auto; background: rgba(15,23,42,0.85); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border: 1px solid rgba(255,255,255,0.15); border-radius: 12px; z-index: 999999; box-shadow: 0 10px 40px rgba(0,0,0,0.5); padding: 5px;';
        document.body.appendChild(portal);
    }
    
    const rect = anchorEl.getBoundingClientRect();
    portal.style.top = (rect.bottom + 4) + 'px';
    portal.style.left = rect.left + 'px';
    portal.style.width = Math.max(rect.width, 150) + 'px';
    portal.style.display = 'block';

    portal.innerHTML = options.map((opt, i) => `
        <div style="padding: 10px 12px; cursor: pointer; border-radius: 8px; font-size: 0.85rem; color: ${opt.selected ? 'var(--color-primary-green)' : '#fff'}; display: flex; align-items: center; justify-content: space-between; transition: background 0.2s; font-weight: ${opt.selected ? '700' : '500'}; background: ${opt.selected ? 'rgba(16,185,129,0.1)' : 'transparent'};" 
             onmouseover="if(!this.dataset.selected) this.style.background='rgba(255,255,255,0.05)'" 
             onmouseout="if(!this.dataset.selected) this.style.background='transparent'"
             data-selected="${opt.selected ? 'true' : ''}"
             data-index="${i}">
            ${opt.label}
            ${opt.selected ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>' : ''}
        </div>
    `).join('');

    Array.from(portal.children).forEach((child) => {
        child.onclick = (e) => {
            e.stopPropagation();
            portal.style.display = 'none';
            const idx = parseInt(child.dataset.index);
            onSelectCallback(options[idx].value, options[idx].label);
            document.removeEventListener('click', window._glassDropdownCloseListener);
        };
    });

    const closeListener = (e) => {
        if (!anchorEl.contains(e.target) && !portal.contains(e.target)) {
            portal.style.display = 'none';
            document.removeEventListener('click', closeListener);
        }
    };
    
    document.removeEventListener('click', window._glassDropdownCloseListener);
    window._glassDropdownCloseListener = closeListener;
    setTimeout(() => document.addEventListener('click', closeListener), 10);
};

window.initGlassSelect = function(selectEl) {
    if (!selectEl || selectEl.dataset.glassInitialized) return;
    selectEl.dataset.glassInitialized = "true";
    
    const wrapper = document.createElement('div');
    wrapper.className = selectEl.className;
    wrapper.style.cssText = selectEl.style.cssText;
    
    if (!wrapper.classList.contains('hidden')) wrapper.style.display = 'flex';
    wrapper.style.alignItems = 'center';
    wrapper.style.cursor = 'pointer';
    wrapper.style.position = 'relative'; 
    wrapper.style.userSelect = 'none';
    
    selectEl.className = 'real-select-hidden';
    selectEl.style.display = 'none';
    
    const textSpan = document.createElement('span');
    textSpan.style.flex = '1';
    textSpan.style.overflow = 'hidden';
    textSpan.style.textOverflow = 'ellipsis';
    textSpan.style.whiteSpace = 'nowrap';
    textSpan.style.pointerEvents = 'none';
    
    const icon = document.createElement('div');
    icon.style.pointerEvents = 'none';
    icon.style.display = 'flex';
    icon.style.marginLeft = '8px';
    icon.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: rgba(255,255,255,0.4);"><polyline points="6 9 12 15 18 9"></polyline></svg>';
    
    wrapper.appendChild(textSpan);
    wrapper.appendChild(icon);
    
    function updateText() {
        if (selectEl.selectedIndex >= 0) {
            const opt = selectEl.options[selectEl.selectedIndex];
            textSpan.textContent = opt.text;
            textSpan.style.color = opt.value ? (wrapper.style.color || '#fff') : 'rgba(255,255,255,0.4)';
            
            // Special styling for workshop machine dropdown placeholders
            if (wrapper.className.includes('machine-workshop')) {
                if (opt.value) {
                    textSpan.style.color = 'var(--color-primary-green)';
                    textSpan.style.textAlign = 'left';
                    textSpan.style.flex = '1';
                    wrapper.style.justifyContent = 'flex-start';
                    icon.style.display = 'flex';
                } else {
                    textSpan.style.textAlign = 'center';
                    textSpan.style.flex = '0 1 auto'; // Let the wrapper center it
                    wrapper.style.justifyContent = 'center';
                    icon.style.display = 'none';
                }
            } else {
                textSpan.style.textAlign = 'left';
                textSpan.style.flex = '1';
                wrapper.style.justifyContent = 'space-between';
                icon.style.display = 'flex';
            }
        } else {
            textSpan.textContent = '';
        }
    }
    updateText();
    selectEl.addEventListener('change', updateText);

    wrapper.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const validOptions = Array.from(selectEl.options).filter(o => !o.disabled);
        const mappedOptions = validOptions.map(opt => ({
             value: opt.value,
             label: opt.text,
             selected: opt.value === selectEl.value
        }));

        window.openGlassDropdown(wrapper, mappedOptions, (val, label) => {
            selectEl.value = val;
            updateText();
            selectEl.dispatchEvent(new Event('change', { bubbles: true }));
        });
    };

    selectEl.parentNode.insertBefore(wrapper, selectEl);
    wrapper.appendChild(selectEl); 
};
// ----------------------------------------

// Close dropdown when clicking outside
document.addEventListener('click', function() {
    const list = document.getElementById('acc-year-list');
    if (list) list.classList.add('hidden');
});

window.filterAccountingByYear = function(year) {
    selectedAccountingYear = year === 'alle' ? 'alle' : parseInt(year);

    // Update custom dropdown display
    const yearDisplay = document.getElementById('acc-year-display');
    const yearList = document.getElementById('acc-year-list');
    if (yearDisplay) yearDisplay.textContent = selectedAccountingYear === 'alle' ? 'Alle' : selectedAccountingYear;
    if (yearList) {
        // Refresh active highlight
        yearList.querySelectorAll('div').forEach(div => {
            const val = div.getAttribute('onclick').match(/'([^']+)'\)/)?.[1];
            div.style.color = val && String(val) === String(selectedAccountingYear) ? 'var(--color-primary-green)' : '#fff';
        });
        yearList.classList.add('hidden');
    }

    renderAccounting();
    window.renderQuarters();
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

    const filtered = allAccountingEntries.filter(e => {
        if (e.type !== currentAccountingType) return false;
        if (selectedAccountingYear !== 'alle' && selectedAccountingYear !== null) {
            const year = new Date(e.date).getFullYear();
            if (year !== selectedAccountingYear) return false;
        }
        return true;
    });

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
    let html = `
        <div class="table-responsive-wrapper">
            <table class="data-table" style="width: 100%; border-collapse: collapse; table-layout: auto;">
                <thead>
                    <tr style="text-align: left; color: rgba(255,255,255,0.4); font-size: 0.75rem; text-transform: uppercase; letter-spacing: 1px;">
                        <th style="padding: 12px; width: 40px;"></th>
                        <th style="padding: 12px; width: 6%;">Blt.</th>
                        <th style="padding: 12px; width: 13%;">Nr.</th>
                        <th style="padding: 12px; width: 12%;">Datum</th>
                        <th style="padding: 12px; width: 25%;">${currentAccountingType === 'incoming' ? 'Lieferant' : 'Kunde'}</th>
                        <th style="padding: 12px; width: 10%;">Netto</th>
                        <th style="padding: 12px; width: 6%;">MwSt.</th>
                        <th style="padding: 12px; width: 14%;">Brutto</th>
                        <th style="padding: 12px; width: 11%; text-align: center;">Aktion</th>
                    </tr>
                </thead>
                <tbody>
    `;

    // Sort groups by Year descending, then Month descending
    const activeMonths = Object.keys(grouped).sort((a, b) => {
        const [monthA, yearA] = a.split(' ');
        const [monthB, yearB] = b.split(' ');
        if (yearA !== yearB) return parseInt(yearB) - parseInt(yearA);
        return months.indexOf(monthB) - months.indexOf(monthA);
    });

    activeMonths.forEach(monthName => {
        // Month Header Row
        html += `
            <tr class="accounting-month-header">
                <td colspan="9">
                    <h3>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                        ${monthName}
                    </h3>
                </td>
            </tr>
        `;

        // Entry Rows
        html += grouped[monthName].map(e => `
            <tr style="border-top: 1px solid rgba(255,255,255,0.03); transition: background 0.2s;" class="accounting-main-row" id="row-${e.id}">
                <td data-label="Details" style="padding: 12px; text-align: center; cursor: pointer; color: var(--color-primary-green);" onclick="window.toggleAccountingDetails('${e.id}', this)">
                    <svg class="chevron-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="transition: transform 0.3s;"><path d="M9 18l6-6-6-6"></path></svg>
                </td>
                <td data-label="Bezahlt" style="padding: 8px 12px; text-align: center; vertical-align: middle;">
                    <label style="position: relative; display: inline-block; width: 32px; height: 18px; margin: 0; cursor: pointer;" title="Bezahlt">
                        <input type="checkbox" ${e.is_paid ? 'checked' : ''} 
                            onchange="window.togglePaidStatus('${e.id}', this.checked)"
                            style="opacity: 0; width: 0; height: 0; position: absolute;">
                        <span style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background-color: ${e.is_paid ? 'var(--color-primary-green)' : 'rgba(255,255,255,0.1)'}; border: 1px solid ${e.is_paid ? 'transparent' : 'rgba(255,255,255,0.2)'}; transition: .3s; border-radius: 20px;">
                            <span style="position: absolute; height: 12px; width: 12px; left: ${e.is_paid ? '18px' : '2px'}; top: 2px; background-color: ${e.is_paid ? '#fff' : 'rgba(255,255,255,0.5)'}; transition: .3s; border-radius: 50%; box-shadow: 0 1px 2px rgba(0,0,0,0.3);"></span>
                        </span>
                    </label>
                    ${e.paid_at ? `<div style="font-size: 0.65rem; color: var(--color-primary-green); margin-top: 3px; font-weight: 600; opacity: 0.8; white-space: nowrap;">${new Date(e.paid_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })}</div>` : ''}
                </td>
                <td data-label="Nummer" style="padding: 10px 12px; font-weight: 600; font-size: 0.85rem;">${e.invoice_number || '-'}</td>
                <td data-label="Datum" style="padding: 10px 12px; font-size: 0.85rem; white-space: nowrap;">
                    <div style="font-weight: 600;">${new Date(e.date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}</div>
                    ${e.due_date ? `<div style="font-size: 0.75rem; color: #f87171; margin-top: 2px; font-weight: 700; white-space: nowrap;">fällig: ${e.due_date === 'sofort' ? 'sofort' : new Date(e.due_date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}</div>` : ''}
                </td>
                <td data-label="${currentAccountingType === 'incoming' ? 'Lieferant' : 'Kunde'}" style="padding: 10px 12px; font-weight: 700; color: #fff; font-size: 0.85rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${e.entity}</td>
                <td data-label="Netto" style="padding: 10px 12px; font-size: 0.85rem;">${window.formatCurrency(e.amount_net)}</td>
                <td data-label="MwSt" style="padding: 10px 12px; font-size: 0.75rem; color: rgba(255,255,255,0.5);">${e.vat_rate}%</td>
                <td data-label="Brutto" style="padding: 10px 12px; font-size: 0.85rem;">
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
                <td data-label="Aktionen" style="padding: 10px 12px; text-align: center;">
                    <div style="display:flex; justify-content: center; gap: 8px;">
                        <button onclick="window.editAccountingEntry('${e.id}')" title="Bearbeiten"
                            style="width:30px; height:30px; border-radius:50%; background: rgba(59,130,246,0.2); border: 1.5px solid rgba(59,130,246,0.5); color: #60a5fa; display:flex; align-items:center; justify-content:center; cursor:pointer; transition: all 0.2s;"
                            onmouseover="this.style.background='rgba(59,130,246,0.4)'" onmouseout="this.style.background='rgba(59,130,246,0.2)'">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        </button>
                        <button onclick="window.deleteAccountingEntry('${e.id}')" title="Löschen"
                            style="width:30px; height:30px; border-radius:50%; background: rgba(239,68,68,0.2); border: 1.5px solid rgba(239,68,68,0.5); color: #f87171; display:flex; align-items:center; justify-content:center; cursor:pointer; transition: all 0.2s;"
                            onmouseover="this.style.background='rgba(239,68,68,0.4)'" onmouseout="this.style.background='rgba(239,68,68,0.2)'">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        </button>
                    </div>
                </td>
            </tr>
                </td>
            </tr>
            <tr id="details-${e.id}" class="hidden">
                <td colspan="9" class="acc-details-cell" style="padding: 1rem 0;">
                    <div id="details-content-${e.id}" style="width: 100%;">
                    </div>
                </td>
            </tr>
        `).join('');
    });

    html += `
                </tbody>
            </table>
        </div>
    `;

    if (activeMonths.length === 0) {
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
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        const updateData = {
            is_paid: checked,
            paid_at: checked ? today : null
        };
        const { error } = await window.supabaseClient
            .from('accounting')
            .update(updateData)
            .eq('id', id);
        if (error) throw error;

        const entry = allAccountingEntries.find(e => e.id === id);
        if (entry) {
            entry.is_paid = checked;
            entry.paid_at = checked ? today : null;
        }

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
    if (!grid) return;

    const quarters = [
        { name: 'Q1', months: [0, 1, 2], label: 'Jan–Mär' },
        { name: 'Q2', months: [3, 4, 5], label: 'Apr–Jun' },
        { name: 'Q3', months: [6, 7, 8], label: 'Jul–Sep' },
        { name: 'Q4', months: [9, 10, 11], label: 'Okt–Dez' }
    ];

    // Determine which years to show
    let allYears = [...new Set(allAccountingEntries.map(e => new Date(e.date).getFullYear()))].sort((a, b) => b - a);
    const currentYear = new Date().getFullYear();
    if (!allYears.includes(currentYear)) allYears.unshift(currentYear);

    const yearsToShow = (selectedAccountingYear === 'alle' || selectedAccountingYear === null)
        ? allYears
        : [typeof selectedAccountingYear === 'number' ? selectedAccountingYear : parseInt(selectedAccountingYear)];

    let html = '';

    yearsToShow.forEach(yr => {
        html += `
        <div style="margin-bottom: 2rem;">
            <div style="font-size: 1.1rem; font-weight: 900; color: rgba(255,255,255,0.5); margin-bottom: 1rem; display: flex; align-items: center; gap: 10px;">
                <span style="color: #fff;">${yr}</span>
                <span style="display: inline-block; height: 1px; flex: 1; background: rgba(255,255,255,0.08);"></span>
            </div>
            <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem;">
        `;

        quarters.forEach(q => {
            const quarterData = allAccountingEntries.filter(e => {
                const d = new Date(e.date);
                return d.getFullYear() === yr && q.months.includes(d.getMonth());
            });

            const incomingNum = quarterData.filter(e => e.type === 'incoming').reduce((sum, e) => sum + parseFloat(e.amount_gross || 0), 0);
            const outgoingNum = quarterData.filter(e => e.type === 'outgoing').reduce((sum, e) => sum + parseFloat(e.amount_gross || 0), 0);
            const balance = outgoingNum - incomingNum;
            const hasData = quarterData.length > 0;

            html += `
                <div class="glass-card" style="padding: 1.25rem; text-align: center; border: 2px solid ${hasData ? (balance >= 0 ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)') : 'rgba(255,255,255,0.04)'}; opacity: ${hasData ? '1' : '0.4'};">
                    <div style="font-size: 1.2rem; font-weight: 900; color: #fff; margin-bottom: 2px;">${q.name}</div>
                    <div style="font-size: 0.75rem; color: rgba(255,255,255,0.4); margin-bottom: 1rem; font-weight: 600;">${q.label}</div>
                    <div style="display: flex; flex-direction: column; gap: 6px;">
                        <div style="display: flex; justify-content: space-between; font-size: 0.85rem;">
                            <span style="color: rgba(255,255,255,0.5);">Ausgang:</span>
                            <span style="color: var(--color-primary-green); font-weight: 800;">${window.formatCurrency(outgoingNum)}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; font-size: 0.85rem;">
                            <span style="color: rgba(255,255,255,0.5);">Eingang:</span>
                            <span style="color: #f87171; font-weight: 800;">${window.formatCurrency(incomingNum)}</span>
                        </div>
                        <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.1); display: flex; justify-content: space-between; font-weight: 900; font-size: 1rem;">
                            <span style="color: rgba(255,255,255,0.6);">Bilanz:</span>
                            <span style="color: ${balance >= 0 ? 'var(--color-primary-green)' : '#f87171'};">${window.formatCurrency(balance)}</span>
                        </div>
                    </div>
                </div>
            `;
        });

        html += `</div></div>`;
    });

    grid.innerHTML = html;
};

window.resetAccountingForm = function () {
    const form = document.getElementById('accounting-form');
    if (form) form.reset();
    document.getElementById('accounting-id').value = '';
    
    const typeSelect = document.getElementById('acc-type');
    if (typeSelect) { 
        typeSelect.value = window.currentAccountingType || 'incoming'; 
        typeSelect.dispatchEvent(new Event('change')); 
    }
    
    const vatSelect = document.getElementById('acc-vat-rate');
    if (vatSelect) { vatSelect.value = '19'; vatSelect.dispatchEvent(new Event('change')); }
    
    document.getElementById('acc-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('accounting-modal-title').textContent = 'Neuer Eintrag';
    
    const paidCheck = document.getElementById('acc-is-paid');
    if (paidCheck) paidCheck.checked = false;
    
    document.getElementById('accounting-items-container').innerHTML = '';
    window.updateAccountingEntityLabel();
};

window.openAccountingModal = function () {
    window.resetAccountingForm();
    const modal = document.getElementById('accounting-modal');
    if (!modal) {
        console.error('Accounting Modal not found!');
        return;
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

    setTimeout(() => {
        const typeSelect = document.getElementById('acc-type');
        if (typeSelect) window.initGlassSelect(typeSelect);
        const vatSelect = document.getElementById('acc-vat-rate');
        if (vatSelect) window.initGlassSelect(vatSelect);
    }, 0);

    console.log('Accounting Module: Modal shown');
};

// --- Enhanced Assignment UI Logic ---

function buildAccMachineDropdown(machines, rowId) {
    let dropdown = document.getElementById('acc-machine-dropdown-portal');
    if (!dropdown) {
        dropdown = document.createElement('div');
        dropdown.id = 'acc-machine-dropdown-portal';
        dropdown.style.cssText = [
            'position: fixed',
            'z-index: 999999',
            'background: rgba(15,23,42,0.98)',
            'border: 1px solid rgba(255,255,255,0.15)',
            'border-radius: 12px',
            'max-height: 260px',
            'overflow-y: auto',
            'box-shadow: 0 16px 48px rgba(0,0,0,0.7)',
            'display: none'
        ].join(';');
        document.body.appendChild(dropdown);
    }

    const row = document.getElementById(rowId);
    const searchInput = row ? row.querySelector('.item-machine-search') : null;
    if (searchInput) {
        const rect = searchInput.getBoundingClientRect();
        dropdown.style.top = (rect.bottom + 4) + 'px';
        dropdown.style.left = rect.left + 'px';
        dropdown.style.width = rect.width + 'px';
    }

    dropdown.innerHTML = '';

    const noneItem = document.createElement('div');
    noneItem.textContent = 'Keine Maschine';
    noneItem.style.cssText = 'padding: 10px 14px; cursor: pointer; color: rgba(255,255,255,0.6); font-size: 0.9rem;';
    noneItem.onmousedown = (e) => { e.preventDefault(); selectAccMachine('', '', rowId); };
    noneItem.onmouseover = () => { noneItem.style.background = 'rgba(255,255,255,0.08)'; };
    noneItem.onmouseout = () => { noneItem.style.background = ''; };
    dropdown.appendChild(noneItem);

    machines.forEach(m => {
        const label = window.getMachineName(m.id);
        const item = document.createElement('div');
        item.style.cssText = 'padding: 10px 14px; cursor: pointer; font-size: 0.9rem; border-top: 1px solid rgba(255,255,255,0.05);';
        item.innerHTML = `<span style="color: var(--color-primary-green); font-weight: 600;">${label}</span>`;
        item.onmousedown = (e) => { e.preventDefault(); selectAccMachine(m.id, label, rowId); };
        item.onmouseover = () => { item.style.background = 'rgba(255,255,255,0.06)'; };
        item.onmouseout = () => { item.style.background = ''; };
        dropdown.appendChild(item);
    });

    dropdown.style.display = 'block';
}

window.filterAccMachineDropdown = function (query, rowId) {
    const machines = window.machineList || [];
    const tokens = query.toLowerCase().split(/\s+/).filter(t => t.length > 0);
    const filtered = machines.filter(m => {
        const searchable = [
            m.manufacturer || '',
            m.name || '',
            m.serial || '',
            m.year ? String(m.year) : ''
        ].join(' ').toLowerCase();
        return tokens.length === 0 || tokens.every(t => searchable.includes(t));
    });
    buildAccMachineDropdown(filtered, rowId);
};

window.selectAccMachine = function (id, label, rowId) {
    const row = document.getElementById(rowId);
    if (!row) return;

    row.dataset.machineId = id;
    const searchInput = row.querySelector('.item-machine-search');
    if (searchInput) {
        searchInput.value = label;
        searchInput.style.color = id ? 'var(--color-primary-green)' : '';
    }
    const dropdown = document.getElementById('acc-machine-dropdown-portal');
    if (dropdown) dropdown.style.display = 'none';
};

// Toggle Assignment Type (Maschine vs Andere)
window.toggleAccAssignmentType = function (rowId, type) {
    const row = document.getElementById(rowId);
    if (!row) return;

    row.dataset.assignmentType = type;
    const machineUI = row.querySelector('.machine-ui');
    const otherUI = row.querySelector('.other-ui');
    const btns = row.querySelectorAll('.type-btn');

    btns.forEach(btn => {
        const isActive = btn.classList.contains(type === 'machine' ? 'mac' : 'and');
        btn.classList.toggle('active', isActive);
        btn.style.background = isActive ? (type === 'machine' ? 'var(--color-primary-green)' : '#6366f1') : 'transparent';
        btn.style.color = isActive ? 'white' : 'rgba(255,255,255,0.4)';
    });

    if (type === 'machine') {
        if (machineUI) machineUI.classList.remove('hidden');
        if (otherUI) otherUI.classList.add('hidden');
        row.dataset.assignmentArea = '';
    } else {
        if (machineUI) machineUI.classList.add('hidden');
        if (otherUI) otherUI.classList.remove('hidden');
        row.dataset.machineId = '';
        const searchInput = row.querySelector('.item-machine-search');
        if (searchInput) searchInput.value = '';
    }
};

// Toggle Machine Filter (Werkstatt vs Alle)
window.toggleAccMachineFilter = function (rowId, filter) {
    const row = document.getElementById(rowId);
    if (!row) return;

    row.dataset.machineFilter = filter;
    const workshopDropdown = row.querySelector('.item-machine-workshop');
    const allSearch = row.querySelector('.search-input-wrapper');
    const btns = row.querySelectorAll('.filter-btn');

    btns.forEach(btn => {
        const isActive = btn.classList.contains(filter === 'all' ? 'all' : 'wrk');
        btn.classList.toggle('active', isActive);
        btn.style.background = isActive ? 'rgba(255,255,255,0.1)' : 'transparent';
        btn.style.color = isActive ? 'white' : 'rgba(255,255,255,0.4)';
    });

    if (filter === 'workshop') {
        if (workshopDropdown) workshopDropdown.classList.remove('hidden');
        if (allSearch) allSearch.classList.add('hidden');
    } else {
        if (workshopDropdown) workshopDropdown.classList.add('hidden');
        if (allSearch) allSearch.classList.remove('hidden');
    }
};

// Global click to close portal
document.addEventListener('click', (e) => {
    if (!e.target.closest('.item-machine-search') && !e.target.closest('#acc-machine-dropdown-portal')) {
        const d = document.getElementById('acc-machine-dropdown-portal');
        if (d) d.style.display = 'none';
    }
});

window.addAccountingItemRow = function (data = {}) {
    const container = document.getElementById('accounting-items-container');
    if (!container) return;

    const rowId = 'item-' + (data.id || Math.random().toString(36).substr(2, 9));
    const row = document.createElement('div');
    row.id = rowId;
    row.className = 'item-row';
    row.dataset.assignmentType = data.assignment_type || 'machine';
    row.dataset.machineId = data.machine_id || '';
    row.dataset.assignmentArea = data.assignment_area || '';
    row.dataset.machineFilter = data.machine_filter || 'all';

    row.style.cssText = `
        background: rgba(255,255,255,0.03);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 14px;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 14px;
        margin-bottom: 12px;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    `;

    // Row Header (Description and Actions)
    const header = document.createElement('div');
    header.style.cssText = 'display: grid; grid-template-columns: 1fr 100px 100px 100px auto; gap: 12px; align-items: start;';
    
    header.innerHTML = `
        <div class="form-group" style="margin: 0;">
            <input type="text" class="item-desc glass-form-input" placeholder="Beschreibung der Position" value="${data.description || ''}" required style="font-weight: 600;">
        </div>
        <div class="form-group" style="margin: 0;">
            <input type="number" step="0.01" class="item-qty glass-form-input" placeholder="Menge" value="${data.quantity || 1}" required style="text-align: center;" oninput="window.updateAccountingTotalFromItems()">
        </div>
        <div class="form-group" style="margin: 0;">
            <input type="text" class="item-unit glass-form-input" placeholder="Einh." value="${data.unit || 'Stk'}" required style="text-align: center;">
        </div>
        <div class="form-group" style="margin: 0;">
            <input type="number" step="0.01" class="item-price glass-form-input" placeholder="Preis Netto" value="${data.price_net || 0}" required style="text-align: right; color: var(--color-primary-green); font-weight: 700;" oninput="window.updateAccountingTotalFromItems()">
        </div>
        <button type="button" title="Position löschen" onclick="this.closest('.item-row').remove(); window.updateAccountingTotalFromItems();" 
            style="width:42px; height:42px; border-radius:50%; background: rgba(239,68,68,0.2); border: 1.5px solid rgba(239,68,68,0.5); color: #f87171; display:flex; align-items:center; justify-content:center; cursor:pointer; transition: all 0.2s;"
            onmouseover="this.style.background='rgba(239,68,68,0.4)'" onmouseout="this.style.background='rgba(239,68,68,0.2)'">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        </button>
    `;
    row.appendChild(header);

    // Assignment Section
    const assignmentBox = document.createElement('div');
    assignmentBox.style.cssText = `
        border-top: 1px solid rgba(255,255,255,0.06);
        padding-top: 14px;
        display: flex;
        align-items: center;
        gap: 16px;
    `;

    // Assignment Type Toggle (Segmented Control style)
    const typeLabel = document.createElement('div');
    typeLabel.style.cssText = 'font-size: 0.75rem; color: rgba(255,255,255,0.4); text-transform: uppercase; font-weight: 700; min-width: 80px;';
    typeLabel.textContent = 'Zuordnung:';
    assignmentBox.appendChild(typeLabel);

    const typeToggleContainer = document.createElement('div');
    typeToggleContainer.style.cssText = `
        display: flex;
        background: rgba(0,0,0,0.3);
        padding: 4px;
        border-radius: 10px;
        border: 1px solid rgba(255,255,255,0.05);
    `;
    
    const isMachine = (data.assignment_type || 'machine') === 'machine';
    
    typeToggleContainer.innerHTML = `
        <button type="button" class="type-btn mac ${isMachine ? 'active' : ''}" onclick="window.toggleAccAssignmentType('${rowId}', 'machine')" 
            style="padding: 6px 14px; border-radius: 8px; border: none; font-size: 0.8rem; font-weight: 700; cursor: pointer; transition: 0.2s; 
            ${isMachine ? 'background: var(--color-primary-green); color: white;' : 'background: transparent; color: rgba(255,255,255,0.4);'}">
            Maschine
        </button>
        <button type="button" class="type-btn and ${!isMachine ? 'active' : ''}" onclick="window.toggleAccAssignmentType('${rowId}', 'other')" 
            style="padding: 6px 14px; border-radius: 8px; border: none; font-size: 0.8rem; font-weight: 700; cursor: pointer; transition: 0.2s; 
            ${!isMachine ? 'background: #6366f1; color: white;' : 'background: transparent; color: rgba(255,255,255,0.4);'}">
            Andere
        </button>
    `;
    assignmentBox.appendChild(typeToggleContainer);

    // Dynamic UI Container
    const dynamicUI = document.createElement('div');
    dynamicUI.className = 'dynamic-assignment-ui';
    dynamicUI.style.cssText = 'flex: 1; display: flex; align-items: center; gap: 12px;';
    
    // Machine Filter Toggle & Input
    const machineUI = document.createElement('div');
    machineUI.className = 'machine-ui' + (isMachine ? '' : ' hidden');
    machineUI.style.cssText = 'display: flex; align-items: center; gap: 12px; flex: 1;';
    
    const filterToggle = document.createElement('div');
    filterToggle.style.cssText = 'display: flex; background: rgba(255,255,255,0.05); padding: 3px; border-radius: 8px;';
    const isAll = (data.machine_filter || 'all') === 'all';
    filterToggle.innerHTML = `
        <button type="button" class="filter-btn all ${isAll ? 'active' : ''}" onclick="window.toggleAccMachineFilter('${rowId}', 'all')" 
            style="padding: 4px 10px; border-radius: 6px; border: none; font-size: 0.75rem; font-weight: 600; cursor: pointer; transition: 0.2s; ${isAll ? 'background: rgba(255,255,255,0.1); color: white;' : 'background: transparent; color: rgba(255,255,255,0.4);'}">Alle</button>
        <button type="button" class="filter-btn wrk ${!isAll ? 'active' : ''}" onclick="window.toggleAccMachineFilter('${rowId}', 'workshop')" 
            style="padding: 4px 10px; border-radius: 6px; border: none; font-size: 0.75rem; font-weight: 600; cursor: pointer; transition: 0.2s; ${!isAll ? 'background: rgba(255,255,255,0.1); color: white;' : 'background: transparent; color: rgba(255,255,255,0.4);'}">Werkstatt</button>
    `;
    machineUI.appendChild(filterToggle);

    const machineSearchBox = document.createElement('div');
    machineSearchBox.className = 'search-input-wrapper' + (!isAll ? ' hidden' : '');
    machineSearchBox.style.cssText = 'position: relative; flex: 1;';
    const initName = data.machine_id ? window.getMachineName(data.machine_id) : '';
    machineSearchBox.innerHTML = `
        <div style="position: relative;">
            <svg style="position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: rgba(255,255,255,0.3);" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
            <input type="text" class="item-machine-search glass-form-input" placeholder="Maschine suchen..." 
                value="${initName}" oninput="window.filterAccMachineDropdown(this.value, '${rowId}')" 
                onfocus="window.filterAccMachineDropdown(this.value, '${rowId}')"
                style="padding: 0 12px 0 32px; font-size: 0.85rem; height: 36px; border-color: rgba(255,255,255,0.1);">
        </div>
    `;
    machineUI.appendChild(machineSearchBox);

    const workshopSelect = document.createElement('select');
    workshopSelect.className = 'item-machine-workshop glass-form-input' + (isAll ? ' hidden' : '');
    workshopSelect.style.cssText = 'flex: 1; font-size: 0.85rem; height: 36px; padding: 0 12px; border-color: rgba(255,255,255,0.1); color: var(--color-primary-green); font-weight: 600;';
    workshopSelect.onchange = (e) => { row.dataset.machineId = e.target.value; };
    const workshopMachines = (window.machineList || []).filter(m => m.is_in_workshop);
    workshopSelect.innerHTML = '<option value="">Maschine wählen...</option>' + 
        workshopMachines.map(m => `<option value="${m.id}" ${String(m.id) === String(data.machine_id) ? 'selected' : ''}>${window.getMachineName(m.id)}</option>`).join('');
    machineUI.appendChild(workshopSelect);
    setTimeout(() => window.initGlassSelect(workshopSelect), 0);
    
    dynamicUI.appendChild(machineUI);

    // Other Area Selection
    const otherUI = document.createElement('div');
    otherUI.className = 'other-ui' + (!isMachine ? '' : ' hidden');
    otherUI.style.cssText = 'display: flex; align-items: center; gap: 12px; flex: 1;';
    
    const areaSelect = document.createElement('select');
    areaSelect.className = 'item-area-select glass-form-input';
    areaSelect.style.cssText = 'flex: 1; font-size: 0.85rem; height: 36px; padding: 0 12px; border-color: rgba(255,255,255,0.1); color: #fff;';
    areaSelect.onchange = (e) => { row.dataset.assignmentArea = e.target.value; };
    const areas = ['Lager', 'Werkstatt', 'Büro', 'Verkauf', 'Sonstiges'];
    areaSelect.innerHTML = '<option value="">Bereich wählen...</option>' + 
        areas.map(a => `<option value="${a}" ${a === data.assignment_area ? 'selected' : ''}>${a}</option>`).join('');
    otherUI.appendChild(areaSelect);
    setTimeout(() => window.initGlassSelect(areaSelect), 0);
    
    dynamicUI.appendChild(otherUI);
    assignmentBox.appendChild(dynamicUI);
    row.appendChild(assignmentBox);

    container.appendChild(row);
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
    if (event && event.preventDefault) event.preventDefault();
    console.log('Accounting Module: submitting entry');

    try {
        const id = document.getElementById('accounting-id').value;
        const entryData = {
            type: document.getElementById('acc-type').value,
            invoice_number: document.getElementById('acc-invoice-number').value,
            date: document.getElementById('acc-date').value,
            entity: document.getElementById('acc-entity').value,
            amount_net: parseFloat(document.getElementById('acc-amount-net').value),
            vat_rate: parseFloat(document.getElementById('acc-vat-rate').value),
            amount_gross: parseFloat(document.getElementById('acc-amount-gross').value),
            due_date: document.getElementById('acc-due-date').value || null,
            discount_date: document.getElementById('acc-discount-date').value || null,
            discount_amount: parseFloat(document.getElementById('acc-discount-amount').value) || null,
            is_paid: document.getElementById('acc-is-paid').checked,
            paid_at: document.getElementById('acc-paid-at').value || null
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
            quantity: parseFloat(row.querySelector('.item-qty').value) || 0,
            unit: row.querySelector('.item-unit').value,
            price_net: parseFloat(row.querySelector('.item-price').value) || 0,
            machine_id: row.dataset.machineId ? parseInt(row.dataset.machineId) : null,
            assignment_type: row.dataset.assignmentType || 'machine',
            assignment_area: row.dataset.assignmentArea || null,
            machine_filter: row.dataset.machineFilter || 'all'
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
    
    // Wir müssen kurz warten, bis openAccountingModal (inkl. initGlassSelect in setTimeout) fertig ist.
    setTimeout(() => {
        document.getElementById('accounting-modal-title').textContent = 'Eintrag bearbeiten';
        document.getElementById('accounting-id').value = entry.id;
        
        const typeSelect = document.getElementById('acc-type');
        if (typeSelect) { typeSelect.value = entry.type; typeSelect.dispatchEvent(new Event('change')); }
        
        document.getElementById('acc-invoice-number').value = entry.invoice_number || '';
        document.getElementById('acc-date').value = entry.date;
        document.getElementById('acc-entity').value = entry.entity;
        document.getElementById('acc-amount-net').value = entry.amount_net;
        
        const vatSelect = document.getElementById('acc-vat-rate');
        if (vatSelect) { vatSelect.value = entry.vat_rate; vatSelect.dispatchEvent(new Event('change')); }
        
        document.getElementById('acc-amount-gross').value = entry.amount_gross;
        document.getElementById('acc-due-date').value = entry.due_date || '';
        document.getElementById('acc-discount-date').value = entry.discount_date || '';
        document.getElementById('acc-discount-amount').value = entry.discount_amount || '';

        const paidCheck = document.getElementById('acc-is-paid');
        if (paidCheck) paidCheck.checked = !!entry.is_paid;
        
        window.updateAccountingEntityLabel();
    }, 10);

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
Schlüssel: invoice_number, date (YYYY-MM-DD), net_amount (Zahl), vat_rate (Zahl), type (incoming/outgoing), entity (Geschäftspartner), due_date (YYYY-MM-DD oder "sofort"), paid_at (YYYY-MM-DD), discount_amount (Zahl), is_paid (boolean), positions (Array aus {description, quantity, unit, price_net}). 

ERKENNUNG DES GESCHÄFTSPARTNERS (entity):
1. STRIKTE VERBOTE: "Dietmar Meenken", "Mirco Loseke", "Simon Gabbert", "Meetra", "meetra Recycling Maschinen" dürfen NIEMALS die 'entity' sein.
2. PRIORITÄT: Wenn "verkauft durch", "verkauf von", "Verkäufer", "Lieferant" oder "Absender" vorkommt, ist der Name dahinter die 'entity'.
3. TYP: Interner Name im Kopf = 'incoming'.

WICHTIG ZUM STATUS (is_paid & paid_at):
- Setze 'is_paid' auf true bei Hinweisen wie "bezahlt", "dankend erhalten", "Amazon Pay".
- Suche nach dem ZAHLUNGSDATUM (paid_at). Falls im Text steht "bezahlt am 12.01.", nutze "2026-01-12".
- Falls 'is_paid' true ist aber kein Datum da steht, nutze das Belegdatum (date) oder null.

WICHTIG ZUM FÄLLIGKEITSDATUM (due_date):
- Falls im Text steht "Zahlbar sofort", "fällig sofort" oder ähnlich, setze 'due_date' auf "sofort". Ansonsten YYYY-MM-DD.

WICHTIG ZU PREISEN:
- 'price_net' ist der EINZELPREIS. Korrigiere ihn, damit Menge * Einzelpreis = Zeilengesamtpreis ergibt.
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

        if (parsedData.is_paid !== undefined) {
            const paidCheck = document.getElementById('acc-is-paid');
            if (paidCheck) paidCheck.checked = !!parsedData.is_paid;
        }
        if (parsedData.paid_at) document.getElementById('acc-paid-at').value = parsedData.paid_at;

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

        // Initialize glass select for direction
        const dirSelect = document.getElementById('fin-direction');
        if (dirSelect) window.initGlassSelect(dirSelect);

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
    const daysInput = document.getElementById('fin-days');
    const days = parseInt(daysInput.value) || 14;
    const content = document.getElementById('financial-dashboard-content');
    if (!content) return;

    // UI Handling: Hide days input wrapper if "all" is selected
    const daysWrapper = document.getElementById('fin-days-wrapper');
    if (direction === 'all') {
        if (daysWrapper) daysWrapper.style.display = 'none';
    } else {
        if (daysWrapper) daysWrapper.style.display = 'flex';
    }

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const limitDate = new Date(today);
    if (direction === 'future') {
        limitDate.setDate(today.getDate() + days);
    } else if (direction === 'past') {
        limitDate.setDate(today.getDate() - days);
    }

    const unpaid = allAccountingEntries.filter(e => !e.is_paid);

    let incomingItems = [];
    let outgoingItems = [];
    let skontoDeals = [];
    let overdueIncoming = [];
    let overdueOutgoing = [];

    unpaid.forEach(e => {
        const dueDate = e.due_date ? new Date(e.due_date) : null;
        const discDate = e.discount_date ? new Date(e.discount_date) : null;

        if (direction === 'all') {
            // INCLUDE EVERYTHING
            if (dueDate && dueDate < today) {
                if (e.type === 'incoming') overdueIncoming.push(e);
                else overdueOutgoing.push(e);
            } else {
                if (e.type === 'incoming') incomingItems.push(e);
                else outgoingItems.push(e);
            }
            if (e.type === 'incoming' && discDate && discDate >= today) {
                skontoDeals.push(e);
            }
        } else if (direction === 'future') {
            // ONLY FUTURE (Starting from today)
            if (dueDate && dueDate >= today && dueDate <= limitDate) {
                if (e.type === 'incoming') incomingItems.push(e);
                else outgoingItems.push(e);
            }
            if (e.type === 'incoming' && discDate && discDate >= today && discDate <= limitDate) {
                skontoDeals.push(e);
            }
        } else if (direction === 'past') {
            // ONLY PAST
            if (dueDate && dueDate < today && dueDate >= limitDate) {
                if (e.type === 'incoming') overdueIncoming.push(e);
                else overdueOutgoing.push(e);
            }
        }
    });

    let html = '';

    if (direction === 'all') {
        if (overdueOutgoing.length > 0) html += renderDashboardSection('⚠️ Überfällig: Ausgang (Kunden)', overdueOutgoing, '10b981', 'due_date', false, '#10b981', null, today);
        if (overdueIncoming.length > 0) html += renderDashboardSection('⚠️ Überfällig: Eingang (Lieferanten)', overdueIncoming, 'ea580c', 'due_date', false, '#ea580c', null, today);
        if (skontoDeals.length > 0) html += renderDashboardSection('🏷️ Eingang: Skonto-Fristen', skontoDeals, 'facc15', 'discount_date', true, '#facc15', null, today);
        if (incomingItems.length > 0) html += renderDashboardSection('📥 Eingang: Zukünftig fällig', incomingItems, 'f87171', 'due_date', false, '#f87171', null, today);
        if (outgoingItems.length > 0) html += renderDashboardSection('📤 Ausgang: Erwartete Zahlungen', outgoingItems, '10b981', 'due_date', false, '#10b981', null, today);
    } else if (direction === 'future') {
        html += renderDashboardSection('📥 Eingang: Demnächst fällig', incomingItems, 'f87171', 'due_date', false, '#f87171', null, today);
        html += renderDashboardSection('🏷️ Eingang: Skonto-Fristen', skontoDeals, 'facc15', 'discount_date', true, '#facc15', null, today);
        html += renderDashboardSection('📤 Ausgang: Erwartete Zahlungen', outgoingItems, '10b981', 'due_date', false, '#10b981', null, today);
    } else if (direction === 'past') {
        html += renderDashboardSection('Vergangene Ausgangsrechnungen (Kunden)', overdueOutgoing, '10b981', 'due_date', false, null, null, today);
        html += renderDashboardSection('Vergangene Eingangsrechnungen (Lieferanten)', overdueIncoming, 'ea580c', 'due_date', false, null, null, today);
    }

    if (!html) {
        html = `<div style="padding: 4rem 2rem; text-align: center; color: rgba(255,255,255,0.2);">Keine passenden Einträge gefunden.</div>`;
    }

    content.innerHTML = html;
};

function renderDashboardSection(title, items, color, dateField, showSkonto = false, borderColor = null, timeLabel = null, today = new Date()) {
    if (items.length === 0) return '';

    const borderStyle = borderColor ? `border: 2px solid ${borderColor}; box-shadow: 0 0 15px ${borderColor}1a;` : '';
    const sectionSum = items.reduce((sum, e) => sum + (showSkonto ? (parseFloat(e.discount_amount) || 0) : (parseFloat(e.amount_gross) || 0)), 0);

    return `
        <div class="fin-card" style="${borderStyle} height: auto; min-height: min-content;">
            <div class="fin-section-title" style="color: #${color.startsWith('#') ? color.slice(1) : color}; justify-content: space-between; width: 100%;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                    ${title}
                </div>
                ${timeLabel ? `<span style="color: rgba(255,255,255,0.4); font-size: 0.8rem; font-weight: 400; text-transform: none; letter-spacing: 0;">${timeLabel}</span>` : ''}
            </div>
            ${items.map(e => {
        const isOutgoing = e.type === 'outgoing';
        const itemColor = isOutgoing ? '10b981' : (showSkonto ? 'facc15' : color);
        const itemDate = e[dateField] ? new Date(e[dateField]) : null;
        const displayDate = itemDate ? itemDate.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-';

        // Berechnung relative Tage
        let relativeText = '';
        if (itemDate) {
            const diffTime = itemDate.getTime() - today.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            if (diffDays === 0) {
                relativeText = 'heute fällig';
            } else if (diffDays < 0) {
                const absDays = Math.abs(diffDays);
                if (isOutgoing) {
                    relativeText = `Zahlung überfällig seit ${absDays} ${absDays === 1 ? 'Tag' : 'Tagen'}`;
                } else {
                    relativeText = `überfällig seit ${absDays} ${absDays === 1 ? 'Tag' : 'Tagen'}`;
                }
            } else {
                if (showSkonto) {
                    relativeText = `Skontofrist endet in ${diffDays} ${diffDays === 1 ? 'Tag' : 'Tagen'}`;
                } else {
                    relativeText = `fällig in ${diffDays} ${diffDays === 1 ? 'Tag' : 'Tagen'}`;
                }
            }
        }

        return `
                <div class="fin-item">
                    <div style="font-weight: 600; color: #fff;">${displayDate}</div>
                    <div style="font-weight: 800; color: #fff; overflow: visible;">
                        <span style="color: ${isOutgoing ? '#10b981' : '#f87171'}; font-size: 0.7rem; text-transform: uppercase; margin-right: 5px;">${isOutgoing ? 'Ausgang' : 'Eingang'}</span>
                        ${e.entity} 
                        <span style="font-weight: 400; color: rgba(255,255,255,0.3); font-size: 0.75rem; margin-left: 8px;">${e.invoice_number || ''}</span>
                        <div style="font-size: 0.75rem; font-weight: 500; color: rgba(255,255,255,0.4); margin-top: 2px;">${relativeText}</div>
                    </div>
                    <div style="text-align: right; color: #${itemColor.startsWith('#') ? itemColor.slice(1) : itemColor}; font-weight: 800;">
                        ${showSkonto ? '-' + window.formatCurrency(e.discount_amount) : window.formatCurrency(e.amount_gross)}
                    </div>
                </div>
                `;
    }).join('')}
            <div style="margin-top: 15px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.1); display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 0.85rem; color: #fff; font-weight: 700; text-transform: uppercase;">Gesamt:</span>
                <span style="font-size: 1.1rem; font-weight: 900; color: #${color.startsWith('#') ? color.slice(1) : color};">${window.formatCurrency(sectionSum)}</span>
            </div>
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

    const timeRange = document.getElementById('eval-time-range')?.value || 'last_3_months';
    const now = new Date();
    let startDate = null;
    let endDate = null;

    if (timeRange === 'current_month') {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (timeRange === 'last_2_months') {
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    } else if (timeRange === 'last_3_months') {
        startDate = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    } else if (timeRange === 'current_year') {
        startDate = new Date(now.getFullYear(), 0, 1);
    } else if (timeRange === 'last_year') {
        startDate = new Date(now.getFullYear() - 1, 0, 1);
        endDate = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59);
    }

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
                assignment_type,
                assignment_area,
                price_net, 
                quantity,
                accounting ( id, date, type )
            `);

        if (itemsError) throw itemsError;
        console.log(`Found ${items?.length || 0} items with machine assignment.`);

        // 2. Refresh main entries if needed (for direct assignments and UI sync)
        if (!allAccountingEntries || allAccountingEntries.length === 0) {
            console.log('Main entries empty, fetching...');
            await window.fetchAccountingEntries();
        }

        const groupedMachines = {};
        const groupedAreas = {};
        const months = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
        const itemAccountingIds = new Set();

        // 3. Process items O(N)
        (items || []).forEach(item => {
            const entry = item.accounting;
            if (!entry || entry.type !== 'incoming') return;
            
            const date = new Date(entry.date);
            if (startDate && date < startDate) return;
            if (endDate && date > endDate) return;

            itemAccountingIds.add(item.accounting_id);

            const monthYear = `${months[date.getMonth()]} ${date.getFullYear()}`;
            const cost = (parseFloat(item.price_net) || 0) * (parseFloat(item.quantity) || 1);

            if (item.assignment_type === 'machine' && item.machine_id) {
                if (!groupedMachines[item.machine_id]) groupedMachines[item.machine_id] = {};
                if (!groupedMachines[item.machine_id][monthYear]) groupedMachines[item.machine_id][monthYear] = 0;
                groupedMachines[item.machine_id][monthYear] += cost;
            } else if (item.assignment_type === 'other' && item.assignment_area) {
                // Normalize area name
                const area = item.assignment_area.charAt(0).toUpperCase() + item.assignment_area.slice(1);
                if (!groupedAreas[area]) groupedAreas[area] = {};
                if (!groupedAreas[area][monthYear]) groupedAreas[area][monthYear] = 0;
                groupedAreas[area][monthYear] += cost;
            }
        });

        // 4. Process direct assignments O(M) (Legacy support for entries with direct machine_id)
        allAccountingEntries.forEach(entry => {
            if (entry.machine_id && entry.type === 'incoming' && !itemAccountingIds.has(entry.id)) {
                const date = new Date(entry.date);
                if (startDate && date < startDate) return;
                if (endDate && date > endDate) return;

                const monthYear = `${months[date.getMonth()]} ${date.getFullYear()}`;
                const cost = parseFloat(entry.amount_net) || 0;
                
                if (!groupedMachines[entry.machine_id]) groupedMachines[entry.machine_id] = {};
                if (!groupedMachines[entry.machine_id][monthYear]) groupedMachines[entry.machine_id][monthYear] = 0;
                groupedMachines[entry.machine_id][monthYear] += cost;
            }
        });

        const sortMonths = (a, b) => {
            const partsA = a.split(' ');
            const partsB = b.split(' ');
            if (partsA[1] !== partsB[1]) return parseInt(partsB[1]) - parseInt(partsA[1]);
            return months.indexOf(partsB[0]) - months.indexOf(partsA[0]);
        };

        const allMonths = [...new Set([
            ...Object.values(groupedMachines).flatMap(Object.keys),
            ...Object.values(groupedAreas).flatMap(Object.keys)
        ])].sort(sortMonths);

        if (Object.keys(groupedMachines).length === 0 && Object.keys(groupedAreas).length === 0) {
            content.innerHTML = '<div style="padding: 4rem; text-align: center; color: rgba(255,255,255,0.2);">Keine Kosten-Zuordnungen gefunden.</div>';
            return;
        }

        let html = '';

        // Render Machine Evaluation
        if (Object.keys(groupedMachines).length > 0) {
            html += `
                <h3 style="color: #60a5fa; margin: 24px 0 12px 0; font-size: 1.1rem; display: flex; align-items: center; gap: 8px;">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg>
                    Kosten-Auswertung (Maschinen)
                </h3>
                <table class="data-table" style="width: 100%; border-collapse: collapse; margin-bottom: 32px;">
                    <thead>
                        <tr style="text-align: left; color: rgba(255,255,255,0.4); font-size: 0.75rem; text-transform: uppercase;">
                            <th style="padding: 12px;">Maschine</th>
                            ${allMonths.map(m => `<th style="padding: 12px; text-align: right;">${m}</th>`).join('')}
                            <th style="padding: 12px; text-align: right;">Gesamt</th>
                        </tr>
                    </thead>
                    <tbody>
            `;

            Object.keys(groupedMachines).forEach(mId => {
                const machineName = window.getMachineName(mId);
                let machineTotal = 0;
                html += `
                    <tr style="border-top: 1px solid rgba(255,255,255,0.05);">
                        <td style="padding: 12px; font-weight: 700; color: var(--color-primary-green);">${machineName}</td>
                        ${allMonths.map(m => {
                            const val = groupedMachines[mId][m] || 0;
                            machineTotal += val;
                            return `<td style="padding: 12px; text-align: right; color: ${val > 0 ? '#fff' : 'rgba(255,255,255,0.1)'};">${val > 0 ? window.formatCurrency(val) : '-'}</td>`;
                        }).join('')}
                        <td style="padding: 12px; text-align: right; font-weight: 800; background: rgba(255,255,255,0.02);">${window.formatCurrency(machineTotal)}</td>
                    </tr>
                `;
            });
            html += '</tbody></table>';
        }

        // Render Area Evaluation
        if (Object.keys(groupedAreas).length > 0) {
            html += `
                <h3 style="color: #6366f1; margin: 24px 0 12px 0; font-size: 1.1rem; display: flex; align-items: center; gap: 8px;">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                    Bereichs-Auswertung (Andere)
                </h3>
                <table class="data-table" style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="text-align: left; color: rgba(255,255,255,0.4); font-size: 0.75rem; text-transform: uppercase;">
                            <th style="padding: 12px;">Bereich</th>
                            ${allMonths.map(m => `<th style="padding: 12px; text-align: right;">${m}</th>`).join('')}
                            <th style="padding: 12px; text-align: right;">Gesamt</th>
                        </tr>
                    </thead>
                    <tbody>
            `;

            Object.keys(groupedAreas).forEach(area => {
                let areaTotal = 0;
                html += `
                    <tr style="border-top: 1px solid rgba(255,255,255,0.05);">
                        <td style="padding: 12px; font-weight: 700; color: #fff;">${area}</td>
                        ${allMonths.map(m => {
                            const val = groupedAreas[area][m] || 0;
                            areaTotal += val;
                            return `<td style="padding: 12px; text-align: right; color: ${val > 0 ? '#fff' : 'rgba(255,255,255,0.1)'};">${val > 0 ? window.formatCurrency(val) : '-'}</td>`;
                        }).join('')}
                        <td style="padding: 12px; text-align: right; font-weight: 800; background: rgba(255,255,255,0.02);">${window.formatCurrency(areaTotal)}</td>
                    </tr>
                `;
            });
            html += '</tbody></table>';
        }

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
    // Prevent event bubbling
    if (window.event) {
        window.event.preventDefault();
        window.event.stopPropagation();
    }
    
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
        content.innerHTML = '<div style="color: rgba(255,255,255,0.3); font-size: 0.85rem; display: flex; align-items: center; gap: 10px;"><div class="spinner-small"></div>Lade Details...</div>';
        
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
            <div class="acc-details-grid">
                <div>Bezeichnung</div>
                <div>Menge</div>
                <div>Einh.</div>
                <div style="text-align: right;">Preis (€)</div>
                <div style="text-align: right;">Gesamt (€)</div>
                <div style="padding-left: 1rem;">Zuordnung</div>
                <div style="text-align: center;">Split</div>
            </div>
        `;

        // Find items that represent a "split" (multiple items with same description and price in the same receipt)
        const counts = {};
        items.forEach(i => {
            const key = i.description + '|' + i.price_net;
            counts[key] = (counts[key] || 0) + 1;
        });

        // Sort so split items are grouped together
        items.sort((a,b) => a.description.localeCompare(b.description));

        // Keep track of which split group we are in and our index
        let currentSplitKey = null;
        let splitGroupIndex = 0;

        items.forEach((item, i) => {
            const qty = parseFloat(item.quantity) || 1;
            const canSplit = qty > 1; // Nur Positionen mit Menge > 1 aufteilen
            
            const key = item.description + '|' + item.price_net;
            const isSplitPart = counts[key] > 1;
            const splitGroupTotal = isSplitPart ? counts[key] : 1;
            
            if (isSplitPart) {
                if (key !== currentSplitKey) {
                    currentSplitKey = key;
                    splitGroupIndex = 0;
                }
                splitGroupIndex++;
            } else {
                currentSplitKey = null;
                splitGroupIndex = 0;
            }

            const isFirstInGroup = isSplitPart && splitGroupIndex === 1;
            const isLastInGroup = isSplitPart && splitGroupIndex === splitGroupTotal;
            
            let assignmentText = '-';
            if (item.assignment_type === 'machine' && item.machine_id) {
                assignmentText = window.getMachineName(item.machine_id);
            } else if (item.assignment_type === 'filter' && item.assignment_area) {
                assignmentText = item.assignment_area; // Simplied from "Bereich: Lager ..." to just "Lager"
            } else if (item.machine_id) {
                 assignmentText = window.getMachineName(item.machine_id); // legacy fallback
            }

            const splitBadge = isFirstInGroup ? `<span style="margin-left:8px; font-size:0.65rem; color:var(--color-primary-green); background:rgba(16,185,129,0.1); padding:2px 6px; border-radius:4px; border:1px solid rgba(16,185,129,0.2);">Aufgeteilt</span>` : '';

            itemsHtml += `
                <div class="acc-details-row">
                    <div data-label="Bezeichnung" style="font-weight: 600; color: #fff; display: flex; align-items: center;">
                        ${isFirstInGroup ? `<svg style="margin-right:6px; color:rgba(255,255,255,0.4);" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>` : (isSplitPart ? `<div style="width: 18px;"></div>` : '')}
                        ${item.description} ${splitBadge}
                    </div>
                    <div data-label="Menge" style="color: rgba(255,255,255,0.6); font-weight: 700;">${qty}</div>
                    <div data-label="Einheit" style="color: rgba(255,255,255,0.4);">${item.unit || '-'}</div>
                    <div data-label="Preis" style="text-align: right; font-weight: 700;">${window.formatCurrency(item.price_net)}</div>
                    <div data-label="Gesamt" style="text-align: right; font-weight: 800; color: #fff;">${window.formatCurrency((parseFloat(item.price_net) || 0) * qty)}</div>
                    <div data-label="Zuordnung" style="padding-left: 1rem; color: var(--color-primary-green); font-weight: 600; font-size: 0.8rem; line-height: 1.2;">${assignmentText}</div>
                    <div data-label="Split" style="text-align: center;">
                        ${isFirstInGroup ? `
                        <button onclick='window.revertSplit(${JSON.stringify(item).replace(/'/g, "&#39;")})' title="Aufteilung rückgängig machen"
                            style="width:28px; height:28px; border-radius:8px; background: rgba(239,68,68,0.15); border: 1px solid rgba(239,68,68,0.3); color: #f87171; display:flex; align-items:center; justify-content:center; cursor:pointer; transition: all 0.2s; margin: auto;"
                            onmouseover="this.style.background='rgba(239,68,68,0.3)'" onmouseout="this.style.background='rgba(239,68,68,0.15)'">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3l-3 2.7"/></svg>
                        </button>
                        ` : (isSplitPart ? '' : (canSplit ? `
                        <button onclick='window.openSplitDialog(${JSON.stringify(item).replace(/'/g, "&#39;")})' title="Position aufteilen"
                            style="width:28px; height:28px; border-radius:8px; background: rgba(16,185,129,0.15); border: 1px solid rgba(16,185,129,0.3); color: var(--color-primary-green); display:flex; align-items:center; justify-content:center; cursor:pointer; transition: all 0.2s; margin: auto;"
                            onmouseover="this.style.background='rgba(16,185,129,0.3)'" onmouseout="this.style.background='rgba(16,185,129,0.15)'">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="3" x2="12" y2="8"/><path d="M12 8 L5 21"/><path d="M12 8 L19 21"/><circle cx="12" cy="3" r="2" fill="currentColor"/></svg>
                        </button>` : ''))}
                    </div>
                </div>
            `;
        });

        content.innerHTML = itemsHtml;

    } catch (err) {
        console.error('Error loading details:', err);
        content.innerHTML = '<div style="color: #ef4444; font-size: 0.85rem;">Fehler beim Laden der Details.</div>';
    }
};

// --- Split Position Logic ---
let currentSplitItem = null;

window.revertSplit = async function(item) {
    if (!confirm('Möchten Sie die Aufteilung dieser Position wirklich rückgängig machen?\nAlle zusammengehörigen Positionen ("' + item.description + '") werden wieder zu einer einzigen Zeile zusammengefasst.')) return;

    try {
        // Find all split parts for this item
        const { data: parts, error: fetchErr } = await window.supabaseClient
            .from('accounting_items')
            .select('*')
            .eq('accounting_id', item.accounting_id)
            .eq('description', item.description)
            .eq('price_net', item.price_net);

        if (fetchErr) throw fetchErr;
        if (!parts || parts.length === 0) return;

        let totalQty = 0;
        const idsToDelete = [];
        parts.forEach(p => {
            totalQty += parseFloat(p.quantity) || 0;
            idsToDelete.push(p.id);
        });

        // Delete all parts
        const { error: delErr } = await window.supabaseClient
            .from('accounting_items')
            .delete()
            .in('id', idsToDelete);
        if (delErr) throw delErr;

        // Insert single combined item
        const newItem = {
            accounting_id: item.accounting_id,
            description: item.description,
            quantity: totalQty,
            unit: item.unit,
            price_net: item.price_net,
            assignment_type: null,
            assignment_area: null,
            machine_id: null,
            machine_filter: 'all'
        };

        const { error: insErr } = await window.supabaseClient
            .from('accounting_items')
            .insert([newItem]);
        if (insErr) throw insErr;

        // Trigger detail reload
        const detailsBtn = document.querySelector(`#row-${item.accounting_id} td[onclick]`);
        if (detailsBtn) {
            // Close details
            await window.toggleAccountingDetails(item.accounting_id, detailsBtn);
            // Open details again to fetch new rows
            await window.toggleAccountingDetails(item.accounting_id, detailsBtn);
        }

    } catch (err) {
        console.error('Error reverting split:', err);
        alert('Fehler beim Rückgängigmachen der Aufteilung: ' + err.message);
    }
};

window.openSplitDialog = function(item) {
    currentSplitItem = item;
    const modal = document.getElementById('split-item-modal');
    const displayTotal = document.getElementById('split-total-display');
    const infoDisplay = document.getElementById('split-item-info');
    const rowsContainer = document.getElementById('split-rows');

    if (!modal) return;

    displayTotal.textContent = `${item.quantity} ${item.unit || 'Stk'}`;
    infoDisplay.textContent = `${item.description} | ${window.formatCurrency(item.price_net)} / ${item.unit || 'Stk'}`;
    
    // Clear old rows
    rowsContainer.innerHTML = '';
    
    // Default: split in 2 parts initially
    window.addSplitRow({ qty: Math.floor((item.quantity / 2) * 100) / 100 });
    window.addSplitRow({ qty: item.quantity - (Math.floor((item.quantity / 2) * 100) / 100) });

    modal.classList.remove('hidden');
    requestAnimationFrame(() => modal.classList.add('show'));
};

window.closeSplitDialog = function() {
    const modal = document.getElementById('split-item-modal');
    if (!modal) return;
    modal.classList.remove('show');
    currentSplitItem = null;
    setTimeout(() => modal.classList.add('hidden'), 300);
};

window.addSplitRow = function(defaults = {}) {
    const container = document.getElementById('split-rows');
    const rowId = 'split-row-' + Math.random().toString(36).substr(2, 9);
    const row = document.createElement('div');
    row.id = rowId;
    row.className = 'split-row';
    row.dataset.assignmentType = 'machine';
    row.dataset.machineId = '';
    row.dataset.assignmentArea = '';
    row.dataset.machineFilter = 'all';

    row.style.cssText = 'display: grid; grid-template-columns: 80px 1fr 40px; gap: 10px; align-items: center; background: rgba(0,0,0,0.2); padding: 12px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.05);';

    // Menge Input
    const qtyHTML = `
        <div>
            <div style="font-size: 0.75rem; color: rgba(255,255,255,0.4); text-transform: uppercase; font-weight: 700; margin-bottom: 4px;">Menge</div>
            <input type="number" step="0.01" class="split-qty glass-form-input" value="${defaults.qty || 0}" style="text-align: center; font-weight: 700; height: 38px; width: 100%;" oninput="window.updateSplitTotal()">
        </div>
    `;

    // Assignment UI (same as in addAccountingItemRow)
    const workshopMachines = (window.machineList || []).filter(m => m.is_in_workshop);
    let workshopOptions = '<option value="">Maschine wählen...</option>' + 
        workshopMachines.map(m => `<option value="${m.id}">${window.getMachineName(m.id)}</option>`).join('');
    
    const areas = ['Lager', 'Werkstatt', 'Büro', 'Verkauf', 'Sonstiges'];
    let areaOptions = '<option value="">Bereich wählen...</option>' + 
        areas.map(a => `<option value="${a}">${a}</option>`).join('');

    const assignHTML = `
        <div>
            <div style="font-size: 0.75rem; color: rgba(255,255,255,0.4); text-transform: uppercase; font-weight: 700; margin-bottom: 4px;">Zuordnung</div>
            <div style="display: flex; align-items: center; gap: 12px;">
                <div style="display: flex; background: rgba(0,0,0,0.3); padding: 3px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05);">
                    <button type="button" class="type-btn mac active" onclick="window.toggleSplitAssignmentType('${rowId}', 'machine')" 
                        style="padding: 5px 12px; border-radius: 6px; border: none; font-size: 0.75rem; font-weight: 700; cursor: pointer; transition: 0.2s; background: var(--color-primary-green); color: white;">
                        Maschine
                    </button>
                    <button type="button" class="type-btn and" onclick="window.toggleSplitAssignmentType('${rowId}', 'other')" 
                        style="padding: 5px 12px; border-radius: 6px; border: none; font-size: 0.75rem; font-weight: 700; cursor: pointer; transition: 0.2s; background: transparent; color: rgba(255,255,255,0.4);">
                        Andere
                    </button>
                </div>
                
                <div class="dynamic-assignment-ui" style="flex: 1; display: flex; align-items: center; gap: 12px;">
                    <div class="machine-ui" style="display: flex; align-items: center; gap: 8px; flex: 1;">
                        <div style="display: flex; background: rgba(255,255,255,0.05); padding: 2px; border-radius: 6px;">
                            <button type="button" class="filter-btn all active" onclick="window.toggleSplitMachineFilter('${rowId}', 'all')" 
                                style="padding: 4px 8px; border-radius: 4px; border: none; font-size: 0.7rem; font-weight: 600; cursor: pointer; transition: 0.2s; background: rgba(255,255,255,0.1); color: white;">Alle</button>
                            <button type="button" class="filter-btn wrk" onclick="window.toggleSplitMachineFilter('${rowId}', 'workshop')" 
                                style="padding: 4px 8px; border-radius: 4px; border: none; font-size: 0.7rem; font-weight: 600; cursor: pointer; transition: 0.2s; background: transparent; color: rgba(255,255,255,0.4);">Werkstatt</button>
                        </div>
                        <div class="search-input-wrapper" style="position: relative; flex: 1;">
                            <svg style="position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: rgba(255,255,255,0.3);" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                            <input type="text" class="split-machine-search glass-form-input" placeholder="Suchen..." oninput="window.filterSplitMachineDropdown(this.value, '${rowId}')" onfocus="window.filterSplitMachineDropdown(this.value, '${rowId}')" style="padding: 0 10px 0 28px; font-size: 0.8rem; height: 32px; border-color: rgba(255,255,255,0.1);">
                        </div>
                        <select class="split-machine-workshop glass-form-input hidden" onchange="document.getElementById('${rowId}').dataset.machineId = this.value" style="flex: 1; font-size: 0.8rem; height: 32px; padding: 0 10px; border-color: rgba(255,255,255,0.1); color: var(--color-primary-green); font-weight: 600;">
                            ${workshopOptions}
                        </select>
                    </div>
                    <div class="other-ui hidden" style="display: flex; align-items: center; gap: 8px; flex: 1;">
                        <select class="split-area-select glass-form-input" onchange="document.getElementById('${rowId}').dataset.assignmentArea = this.value" style="flex: 1; font-size: 0.8rem; height: 32px; padding: 0 10px; border-color: rgba(255,255,255,0.1); color: #fff;">
                            ${areaOptions}
                        </select>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Delete Button
    const btnHTML = `
        <div style="display: flex; flex-direction: column; justify-content: flex-end; height: 100%;">
            <div style="height: 16px;"></div>
            <button onclick="document.getElementById('${rowId}').remove(); window.updateSplitTotal()" style="height: 38px; background: rgba(239,68,68,0.15); color: #f87171; border: 1px solid rgba(239,68,68,0.3); border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: background 0.2s;" onmouseover="this.style.background='rgba(239,68,68,0.3)'" onmouseout="this.style.background='rgba(239,68,68,0.15)'">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
        </div>
    `;

    row.innerHTML = qtyHTML + assignHTML + btnHTML;
    container.appendChild(row);
    window.updateSplitTotal();

    setTimeout(() => {
        const wSelect = row.querySelector('.split-machine-workshop');
        if (wSelect) window.initGlassSelect(wSelect);
        const aSelect = row.querySelector('.split-area-select');
        if (aSelect) window.initGlassSelect(aSelect);
    }, 0);
};

window.toggleSplitAssignmentType = function (rowId, type) {
    const row = document.getElementById(rowId);
    if (!row) return;
    row.dataset.assignmentType = type;
    const isMachine = type === 'machine';
    
    // Update Tabs
    const macBtn = row.querySelector('.type-btn.mac');
    const andBtn = row.querySelector('.type-btn.and');
    if (macBtn && andBtn) {
        macBtn.className = 'type-btn mac ' + (isMachine ? 'active' : '');
        macBtn.style.background = isMachine ? 'var(--color-primary-green)' : 'transparent';
        macBtn.style.color = isMachine ? 'white' : 'rgba(255,255,255,0.4)';
        
        andBtn.className = 'type-btn and ' + (!isMachine ? 'active' : '');
        andBtn.style.background = !isMachine ? '#6366f1' : 'transparent';
        andBtn.style.color = !isMachine ? 'white' : 'rgba(255,255,255,0.4)';
    }

    // Update UI Panels
    const machineUI = row.querySelector('.machine-ui');
    const otherUI = row.querySelector('.other-ui');
    if (machineUI) isMachine ? machineUI.classList.remove('hidden') : machineUI.classList.add('hidden');
    if (otherUI) !isMachine ? otherUI.classList.remove('hidden') : otherUI.classList.add('hidden');
};

window.toggleSplitMachineFilter = function (rowId, filter) {
    const row = document.getElementById(rowId);
    if (!row) return;
    row.dataset.machineFilter = filter;
    const isAll = filter === 'all';
    
    const allBtn = row.querySelector('.filter-btn.all');
    const wrkBtn = row.querySelector('.filter-btn.wrk');
    if (allBtn && wrkBtn) {
        allBtn.className = 'filter-btn all ' + (isAll ? 'active' : '');
        allBtn.style.background = isAll ? 'rgba(255,255,255,0.1)' : 'transparent';
        allBtn.style.color = isAll ? 'white' : 'rgba(255,255,255,0.4)';
        
        wrkBtn.className = 'filter-btn wrk ' + (!isAll ? 'active' : '');
        wrkBtn.style.background = !isAll ? 'rgba(255,255,255,0.1)' : 'transparent';
        wrkBtn.style.color = !isAll ? 'white' : 'rgba(255,255,255,0.4)';
    }

    const searchBox = row.querySelector('.search-input-wrapper');
    const workshopSelect = row.querySelector('.split-machine-workshop');
    
    if (isAll) {
        if(searchBox) searchBox.classList.remove('hidden');
        if(workshopSelect) workshopSelect.classList.add('hidden');
    } else {
        if(searchBox) searchBox.classList.add('hidden');
        if(workshopSelect) workshopSelect.classList.remove('hidden');
    }
};

window.filterSplitMachineDropdown = function(term, rowId) {
    const row = document.getElementById(rowId);
    if (!row) return;

    // Verwende ein Portal, um Clipping durch overflow:hidden oder z-index Konflikte in den Eltern-Containern zu entgehen
    let list = document.getElementById('split-machine-dropdown-portal');
    
    if (!list) {
        list = document.createElement('div');
        list.id = 'split-machine-dropdown-portal';
        list.style.cssText = 'position: fixed; max-height: 200px; overflow-y: auto; background: rgba(15,23,42,0.85); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border: 1px solid rgba(255,255,255,0.15); border-radius: 12px; z-index: 999999; box-shadow: 0 10px 40px rgba(0,0,0,0.5); padding: 5px;';
        document.body.appendChild(list);
    }
    
    const wrapper = row.querySelector('.search-input-wrapper');
    if (!wrapper) return;

    // Position the portal exactly below the input wrapper
    const rect = wrapper.getBoundingClientRect();
    list.style.top = (rect.bottom + 4) + 'px';
    list.style.left = rect.left + 'px';
    list.style.width = rect.width + 'px';
    list.style.display = 'block';

    // Close listener
    const closeListener = (e) => {
        if (!wrapper.contains(e.target) && !list.contains(e.target)) {
            list.style.display = 'none';
            document.removeEventListener('click', closeListener);
        }
    };
    // Clean up old listener before adding new one
    document.removeEventListener('click', window._splitDropdownCloseListener);
    window._splitDropdownCloseListener = closeListener;
    setTimeout(() => document.addEventListener('click', closeListener), 10);
    
    const lowerTerm = term.toLowerCase();
    
    const matches = (window.machineList || []).filter(m => 
        (m.name || '').toLowerCase().includes(lowerTerm) || 
        (m.manufacturer || '').toLowerCase().includes(lowerTerm) ||
        (m.inventory_number || '').toLowerCase().includes(lowerTerm)
    );
    
    if (matches.length > 0) {
        list.innerHTML = matches.map(m => `
            <div style="padding: 8px 12px; cursor: pointer; border-radius: 8px; font-size: 0.8rem; color: #fff;" 
                 onmouseover="this.style.background='rgba(255,255,255,0.05)'" 
                 onmouseout="this.style.background='transparent'"
                 onclick="document.getElementById('${rowId}').dataset.machineId='${m.id}'; 
                          document.getElementById('${rowId}').querySelector('.split-machine-search').value='${window.getMachineName(m.id).replace(/'/g, "\\'")}';
                          document.getElementById('split-machine-dropdown-portal').style.display='none';">
                <div style="font-weight: 600;">${m.manufacturer} ${m.name}</div>
                ${m.inventory_number ? `<div style="font-size: 0.7rem; color: rgba(255,255,255,0.4);">${m.inventory_number}</div>` : ''}
            </div>
        `).join('');
    } else {
        list.innerHTML = '<div style="padding: 10px; color: rgba(255,255,255,0.4); font-size: 0.8rem; text-align: center;">Keine Maschinen gefunden</div>';
    }
};

window.updateSplitTotal = function() {
    if (!currentSplitItem) return;
    
    const rows = document.querySelectorAll('.split-qty');
    let totalDistributed = 0;
    
    rows.forEach(input => {
        totalDistributed += parseFloat(input.value) || 0;
    });
    
    const remaining = (currentSplitItem.quantity - totalDistributed).toFixed(2);
    
    const distElement = document.getElementById('split-distributed-display');
    const remElement = document.getElementById('split-remaining-display');
    const btn = document.getElementById('split-confirm-btn');
    
    if (distElement) distElement.textContent = totalDistributed.toFixed(2);
    if (remElement) {
        remElement.textContent = remaining;
        remElement.style.color = remaining == 0 ? 'var(--color-primary-green)' : '#f87171';
    }
    
    if (btn) {
        if (remaining == 0 && totalDistributed > 0 && rows.length > 0) {
            btn.style.opacity = '1';
            btn.style.cursor = 'pointer';
            btn.disabled = false;
        } else {
            btn.style.opacity = '0.5';
            btn.style.cursor = 'not-allowed';
            btn.disabled = true;
        }
    }
};

window.submitSplit = async function() {
    if (!currentSplitItem) return;
    const btn = document.getElementById('split-confirm-btn');
    if (btn.disabled) return;

    btn.innerHTML = '<div class="spinner-small" style="display:inline-block; margin-right:8px;"></div> Speichere...';
    btn.disabled = true;

    try {
        const rows = document.querySelectorAll('.split-row');
        const newItems = [];

        rows.forEach(row => {
            const qty = parseFloat(row.querySelector('.split-qty').value) || 0;
            if (qty <= 0) return;

            const assignType = row.dataset.assignmentType || 'machine';
            let assignArea = null;
            let mId = null;

            if (assignType === 'filter' || assignType === 'other') { // 'other' is used in UI
                assignArea = row.dataset.assignmentArea || null;
            } else if (assignType === 'machine') {
                mId = (!row.dataset.machineId || row.dataset.machineId === 'undefined') ? null : parseInt(row.dataset.machineId);
            }

            // Omit brand and item_number because they do not exist in the schema 'accounting_items'
            newItems.push({
                accounting_id: currentSplitItem.accounting_id,
                description: currentSplitItem.description,
                quantity: qty,
                unit: currentSplitItem.unit,
                price_net: currentSplitItem.price_net,
                machine_id: mId,
                assignment_type: assignType === 'other' ? 'filter' : assignType, // DB expects 'filter' or 'machine', UI uses 'other'
                assignment_area: assignArea,
                machine_filter: (assignType === 'other' || assignType === 'filter') ? 'all' : (row.dataset.machineFilter || 'all')
            });
        });

        if (newItems.length === 0) throw new Error("Keine validen Positionen.");

        // 1. Original Item löschen
        const { error: delErr } = await window.supabaseClient
            .from('accounting_items')
            .delete()
            .eq('id', currentSplitItem.id);
        if (delErr) throw delErr;

        // 2. Neue Items einfügen
        const { error: insErr } = await window.supabaseClient
            .from('accounting_items')
            .insert(newItems);
        if (insErr) throw insErr;

        const savedAccId = currentSplitItem.accounting_id;
        window.closeSplitDialog();
        
        // Modal-Button zurücksetzen und das Haupt-Accounting-Listing neu laden um die Details zu refreshen
        btn.innerHTML = 'Aufteilen bestätigen';
        btn.disabled = false;
        
        // Trigger detail reload
        const detailsBtn = document.querySelector(`#row-${savedAccId} td[onclick]`);
        if (detailsBtn) {
            // Close details
            await window.toggleAccountingDetails(savedAccId, detailsBtn);
            // Open details again to fetch new rows
            await window.toggleAccountingDetails(savedAccId, detailsBtn);
        }

    } catch (err) {
        console.error('Error splitting item:', err);
        alert('Fehler beim Aufteilen der Position: ' + err.message);
        btn.innerHTML = 'Aufteilen bestätigen';
        btn.disabled = false;
    }
};
