// accounting.js - Logic for the Accounting Module

let allAccountingEntries = [];

// Lokales HTML-Escaping — die gleichnamigen Helfer in anderen Modulen stecken in
// IIFEs und sind hier nicht sichtbar (renderAccountingCharts warf sonst einen
// ReferenceError, sobald Belege mit Lieferant/Kunde existieren).
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
}
let currentAccountingType = 'incoming'; // Default view
let currentAccountingKpiFilter = null; // KPI click-to-filter state

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
        const yearLabels = document.querySelectorAll('.acc-year-display-label');
        const yearLists = document.querySelectorAll('.acc-year-list-shared');
        
        if (yearLists.length > 0) {
            const years = [...new Set(allAccountingEntries.map(e => new Date(e.date).getFullYear()))].sort((a, b) => b - a);
            const currentYear = new Date().getFullYear();
            if (!years.includes(currentYear)) years.unshift(currentYear);
            if (selectedAccountingYear === null) selectedAccountingYear = currentYear;

            const options = [{ value: 'alle', label: 'Alle' }, ...years.map(y => ({ value: y, label: String(y) }))];
            const listHtml = options.map(opt => `
                <div onclick="event.stopPropagation(); window.filterAccountingByYear('${opt.value}')"
                    style="padding: 8px 16px; font-size: 0.9rem; font-weight: 700; color: ${String(opt.value) === String(selectedAccountingYear) ? 'var(--color-primary-green)' : '#fff'}; cursor: pointer; transition: background 0.15s; white-space: nowrap;"
                    onmouseover="this.style.background='rgba(255,255,255,0.08)'" onmouseout="this.style.background='transparent'">
                    ${opt.label}
                </div>`).join('');
            
            yearLists.forEach(list => list.innerHTML = listHtml);
            yearLabels.forEach(label => label.textContent = selectedAccountingYear === 'alle' ? 'Alle' : selectedAccountingYear);
        }

        renderAccounting();
        window.renderQuarters();
    } catch (err) {
        console.error('Error fetching accounting:', err);
    }
};

window.toggleYearDropdown = function(e, listId) {
    if (e) e.stopPropagation();
    const list = document.getElementById(listId);
    if (!list) return;
    
    // Close other dropdowns first
    document.querySelectorAll('.acc-year-list-shared').forEach(l => {
        if(l.id !== listId) l.classList.add('hidden');
    });
    
    list.classList.toggle('hidden');
};

// --- Custom Glass Dropdown Utilities ---
window.openGlassDropdown = function(anchorEl, options, onSelectCallback) {
    let portal = document.getElementById('glass-dropdown-portal');
    if (!portal) {
        portal = document.createElement('div');
        portal.id = 'glass-dropdown-portal';
        portal.className = 'hide-scrollbar';
        portal.style.cssText = 'position: fixed; max-height: 250px; overflow-y: auto; background: #0f172a; border: 1px solid rgba(255,255,255,0.15); border-radius: 12px; z-index: 999999; box-shadow: 0 10px 40px rgba(0,0,0,0.5); padding: 5px;';
        document.body.appendChild(portal);
    } else {
        portal.style.background = '#0f172a';
    }
    
    portal.innerHTML = options.map((opt, i) => `
        <div style="padding: 10px 12px; cursor: pointer; border-radius: 8px; font-size: 0.85rem; color: ${opt.selected ? 'var(--color-primary-green)' : (opt.color || '#fff')}; display: flex; align-items: center; justify-content: space-between; transition: background 0.2s; font-weight: ${opt.selected ? '700' : '500'}; background: ${opt.selected ? 'rgba(16,185,129,0.1)' : 'transparent'};"
             onmouseover="if(!this.dataset.selected) this.style.background='rgba(255,255,255,0.05)'" 
             onmouseout="if(!this.dataset.selected) this.style.background='transparent'"
             data-selected="${opt.selected ? 'true' : ''}"
             data-index="${i}">
            ${opt.label}
            ${opt.selected ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>' : ''}
        </div>
    `).join('');

    const rect = anchorEl.getBoundingClientRect();
    portal.style.display = 'block';
    const portalHeight = portal.offsetHeight;
    const viewportHeight = window.innerHeight;

    if (rect.bottom + portalHeight > viewportHeight && rect.top - portalHeight > 0) {
        portal.style.top = (rect.top - portalHeight - 4) + 'px';
    } else {
        portal.style.top = (rect.bottom + 4) + 'px';
    }
    portal.style.left = rect.left + 'px';
    portal.style.width = Math.max(rect.width, 150) + 'px';

    portal.innerHTML = options.map((opt, i) => `
        <div style="padding: 10px 12px; cursor: pointer; border-radius: 8px; font-size: 0.85rem; color: ${opt.selected ? 'var(--color-primary-green)' : (opt.color || '#fff')}; display: flex; align-items: center; justify-content: space-between; transition: background 0.2s; font-weight: ${opt.selected ? '700' : '500'}; background: ${opt.selected ? 'rgba(16,185,129,0.1)' : 'transparent'};"
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
    icon.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color:#fff;"><polyline points="6 9 12 15 18 9"></polyline></svg>';
    
    wrapper.appendChild(textSpan);
    wrapper.appendChild(icon);
    
    function updateText() {
        if (selectEl.selectedIndex >= 0) {
            const opt = selectEl.options[selectEl.selectedIndex];
            textSpan.textContent = opt.text;
            textSpan.style.color = opt.value ? (wrapper.style.color || '#fff') : 'rgba(255,255,255,0.4)';
            
            // Special styling for workshop machine dropdown placeholders or centered selects
            if (wrapper.className.includes('machine-workshop') || wrapper.className.includes('centered-select')) {
                textSpan.style.flex = '1';
                textSpan.style.textAlign = 'center';
                wrapper.style.justifyContent = 'center';
                
                if (opt.value) {
                    textSpan.style.color = 'var(--color-primary-green)';
                    icon.style.display = 'flex';
                } else {
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
             selected: opt.value === selectEl.value,
             // Optionale Textfarbe pro Eintrag via <option data-color="..."> (z.B. Angebote-
             // Maschinenfilter: grün = echte Maschine, orange = Freitext-Bezeichnung)
             color: (opt.dataset && opt.dataset.color) || null
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
    document.querySelectorAll('.acc-year-list-shared').forEach(list => list.classList.add('hidden'));
});

window.filterAccountingByYear = function(year) {
    selectedAccountingYear = year === 'alle' ? 'alle' : parseInt(year);

    // Update custom dropdown displays
    const yearLabels = document.querySelectorAll('.acc-year-display-label');
    const yearLists = document.querySelectorAll('.acc-year-list-shared');
    
    yearLabels.forEach(label => label.textContent = selectedAccountingYear === 'alle' ? 'Alle' : selectedAccountingYear);
    
    yearLists.forEach(list => {
        // Refresh active highlight
        list.querySelectorAll('div').forEach(div => {
            const val = div.getAttribute('onclick').match(/'([^']+)'\)/)?.[1];
            div.style.color = val && String(val) === String(selectedAccountingYear) ? 'var(--color-primary-green)' : '#fff';
        });
        list.classList.add('hidden');
    });

    renderAccounting();
    window.renderQuarters();
};

window.switchAccountingTab = function (type) {
    currentAccountingType = type;
    document.querySelectorAll('.calendar-tab-btn').forEach(btn => {
        if (btn.id === `tab-${type}` || btn.id === `tab-${type}-desktop`) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    renderAccounting();
};

window.renderAccounting = function () {
    const container = document.getElementById('accounting-table-container');
    if (!container) return;

    // Calculate KPIs
    const todayStr = new Date().toISOString().split('T')[0];
    const openOutgoing = allAccountingEntries.filter(e => e.type === 'outgoing' && !e.is_paid);
    const openIncoming = allAccountingEntries.filter(e => e.type === 'incoming' && !e.is_paid);
    
    const sumGross = arr => arr.reduce((s, e) => s + (parseFloat(e.amount_gross) || 0), 0);
    const openOutgoingSum = sumGross(openOutgoing);
    const openIncomingSum = sumGross(openIncoming);
    
    // Skonto potential
    const skontoPotential = openIncoming.reduce((s, e) => {
        if (e.discount_amount && e.discount_date && e.discount_date >= todayStr) {
            return s + (parseFloat(e.discount_amount) || 0);
        }
        return s;
    }, 0);
    
    // Overdue count
    const overdueCount = allAccountingEntries.filter(e => {
        if (e.is_paid) return false;
        if (!e.due_date || e.due_date === 'sofort') return false;
        return e.due_date < todayStr;
    }).length;

    const kpiContainer = document.getElementById('accounting-kpi-container');
    if (kpiContainer) {
        const getKpiTileStyle = (filterName, activeColor) => {
            const isActive = currentAccountingKpiFilter === filterName;
            return `cursor: pointer; transition: all 0.2s ease; ${isActive ? `border: 1.5px solid ${activeColor}; box-shadow: 0 0 12px ${activeColor}2a; transform: translateY(-2px); background: rgba(255,255,255,0.06);` : 'border: 1.5px solid rgba(255,255,255,0.05);'}`;
        };

        kpiContainer.innerHTML = `
            <div class="maint-kpi-grid" style="margin-bottom: 1.5rem;">
                <div class="maint-kpi-tile" style="${getKpiTileStyle('open_outgoing', 'var(--color-primary-green)')}" onclick="window.setAccountingKpiFilter('open_outgoing')" title="Ausgangsrechnungen, die noch nicht als bezahlt markiert wurden (Klicken zum Filtern)">
                    <div class="maint-kpi-value" style="color: var(--color-primary-green);">${window.formatCurrency(openOutgoingSum)}</div>
                    <div class="maint-kpi-label">Offene Einnahmen (${openOutgoing.length})</div>
                </div>
                <div class="maint-kpi-tile" style="${getKpiTileStyle('open_incoming', '#f87171')}" onclick="window.setAccountingKpiFilter('open_incoming')" title="Eingangsrechnungen, die noch nicht als bezahlt markiert wurden (Klicken zum Filtern)">
                    <div class="maint-kpi-value" style="color: #f87171;">${window.formatCurrency(openIncomingSum)}</div>
                    <div class="maint-kpi-label">Offene Ausgaben (${openIncoming.length})</div>
                </div>
                <div class="maint-kpi-tile" style="${getKpiTileStyle('skonto', '#fbbf24')}" onclick="window.setAccountingKpiFilter('skonto')" title="Mögliche Ersparnis durch fristgerechtes Zahlen bei Eingangsrechnungen mit Skonto (Klicken zum Filtern)">
                    <div class="maint-kpi-value" style="color: #fbbf24;">${window.formatCurrency(skontoPotential)}</div>
                    <div class="maint-kpi-label">Skonto-Potenzial</div>
                </div>
                <div class="maint-kpi-tile" style="${getKpiTileStyle('overdue', '#ef4444')}" onclick="window.setAccountingKpiFilter('overdue')" title="Rechnungen, deren Fälligkeitsdatum überschritten ist (Klicken zum Filtern)">
                    <div class="maint-kpi-value" style="color: #ef4444;">${overdueCount} Rechnungen</div>
                    <div class="maint-kpi-label">Überfällig</div>
                </div>
            </div>
            ${currentAccountingKpiFilter ? `
                <div style="margin-bottom: 1.25rem; display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 0.85rem; color:#fff;">Aktiver Filter:</span>
                    <span style="font-size: 0.8rem; font-weight: 700; color: #fff; background: rgba(255,255,255,0.08); padding: 4px 10px; border-radius: 99px; display: flex; align-items: center; gap: 6px; border: 1px solid rgba(255,255,255,0.12);">
                        ${currentAccountingKpiFilter === 'open_outgoing' ? 'Offene Einnahmen' : 
                          currentAccountingKpiFilter === 'open_incoming' ? 'Offene Ausgaben' : 
                          currentAccountingKpiFilter === 'skonto' ? 'Skonto-Potenzial' : 'Überfällig'}
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="cursor: pointer; opacity: 0.7; display: inline-block; vertical-align: middle;" onclick="window.setAccountingKpiFilter('${currentAccountingKpiFilter}')"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </span>
                </div>
            ` : ''}
        `;
    }

    const filtered = allAccountingEntries.filter(e => {
        // Apply KPI filter
        if (currentAccountingKpiFilter === 'open_outgoing') {
            if (e.type !== 'outgoing' || e.is_paid) return false;
        } else if (currentAccountingKpiFilter === 'open_incoming') {
            if (e.type !== 'incoming' || e.is_paid) return false;
        } else if (currentAccountingKpiFilter === 'skonto') {
            if (e.type !== 'incoming' || e.is_paid) return false;
            if (!e.discount_amount || parseFloat(e.discount_amount) <= 0) return false;
            if (!e.discount_date || e.discount_date < todayStr) return false;
        } else if (currentAccountingKpiFilter === 'overdue') {
            if (e.is_paid) return false;
            if (!e.due_date || e.due_date === 'sofort') return false;
            if (e.due_date >= todayStr) return false;
        } else {
            // Normal tab filter
            if (e.type !== currentAccountingType) return false;
        }

        // Year filter
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
                    <tr style="text-align: left; color:#fff; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 1px;">
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
        const monthSum = grouped[monthName].reduce((sum, e) => sum + (parseFloat(e.amount_gross) || 0), 0);
        
        // Month Header Row
        html += `
            <tr class="accounting-month-header">
                <td colspan="12">
                        <h3 class="acc-month-header-content" style="display: flex; flex-direction: column; gap: 4px; align-items: flex-start; padding: 10px 15px;">
                            <div class="acc-month-name" style="font-weight: 800; font-size: 1.15rem; white-space: nowrap; line-height: 1;">
                                ${monthName}
                            </div>
                            <div style="font-size: 0.95rem; font-weight: 800; color: #fff; white-space: nowrap; line-height: 1.2;">
                                Gesamt: ${window.formatCurrency(monthSum)}
                            </div>
                        </h3>
                </td>
            </tr>
        `;

        // Entry Rows
        html += grouped[monthName].map((e, rowIdx) => {
            const hasDiscount = e.discount_amount && parseFloat(e.discount_amount) > 0;
            const discountDate = e.discount_date ? new Date(e.discount_date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
            const finalAmount = e.amount_gross - (parseFloat(e.discount_amount) || 0);

            let skontoAlarmHtml = '';
            if (hasDiscount && !e.is_paid && e.discount_date) {
                const discMs = new Date(e.discount_date + 'T00:00:00').getTime();
                const nowMs = new Date().setHours(0, 0, 0, 0);
                const diffDays = Math.round((discMs - nowMs) / 86400000);
                if (diffDays >= 0) {
                    const label = diffDays === 0 ? 'Heute!' : `noch ${diffDays} Tage`;
                    const color = diffDays <= 2 ? '#f87171' : 'var(--color-primary-green)';
                    const bg = diffDays <= 2 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)';
                    const border = diffDays <= 2 ? 'rgba(239, 68, 68, 0.3)' : 'rgba(16, 185, 129, 0.3)';
                    skontoAlarmHtml = `
                        <div style="font-size: 0.7rem; font-weight: 800; color: ${color}; background: ${bg}; border: 1px solid ${border}; padding: 2px 6px; border-radius: 5px; width: fit-content; display: inline-flex; align-items: center; gap: 4px; margin-top: 3px; border-radius: 4px;">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                            Skonto: ${label}
                        </div>
                    `;
                }
            }
            
            return `
            <tr style="border-top: 1px solid rgba(255,255,255,0.03); transition: background 0.2s;" class="accounting-main-row ${rowIdx % 2 === 1 ? 'acc-row-striped' : ''} ${e.is_paid ? 'status-paid' : 'status-unpaid'}" id="row-${e.id}">
                <td data-label="Details" style="padding: 12px; text-align: center; cursor: pointer; color: var(--color-primary-green);" onclick="window.toggleAccountingDetails('${e.id}', this, event)">
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
                    ${e.is_debited ? 
                        `<div style="font-size: 0.75rem; color: #ef4444; margin-top: 2px; font-weight: 700; white-space: nowrap;">Konto abgebucht</div>` :
                        (e.is_paid ? 
                            `<div style="font-size: 0.75rem; color: #be1e2d; margin-top: 2px; font-weight: 700; white-space: nowrap;">Online bezahlt</div>` : 
                            (e.due_date && window.innerWidth >= 1024 ? 
                                `<div style="font-size: 0.75rem; margin-top: 2px; font-weight: 700; white-space: nowrap;">
                                    <span style="color: #f87171;">fällig:</span> 
                                    <span style="color: ${e.due_date === 'sofort' ? '#be1e2d' : '#f87171'};">${e.due_date === 'sofort' ? 'sofort' : new Date(e.due_date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
                                </div>` : '')
                        )
                    }
                </td>
                <td data-label="${currentAccountingType === 'incoming' ? 'Lieferant' : 'Kunde'}" style="padding: 10px 12px; font-weight: 700; color: #fff; font-size: 0.85rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${e.entity}</td>
                <td data-label="Netto" style="padding: 10px 12px; font-size: 0.85rem;">${window.formatCurrency(e.amount_net)}</td>
                <td data-label="MwSt" style="padding: 10px 12px; font-size: 0.75rem; color:#fff;">${e.vat_rate}%</td>
                <td data-label="Brutto" style="padding: 10px 12px; font-size: 0.85rem;">
                    <div style="font-weight: 800; color: #fff;">${window.formatCurrency(e.amount_gross)}</div>
                    ${hasDiscount ? `
                        <div style="font-size: 0.7rem; color: #10b981; margin-top: 2px; display: flex; flex-direction: column; gap: 1px;" class="acc-desktop-only">
                            <div style="display: flex; align-items: center; gap: 4px;">
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg> 
                                -${window.formatCurrency(e.discount_amount)} ${e.discount_date ? 'bis ' + new Date(e.discount_date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) : ''}
                            </div>
                            <div style="font-weight: 700; color: #fff; background: rgba(16, 185, 129, 0.2); padding: 1px 4px; border-radius: 3px; width: fit-content; font-size: 0.7rem;">
                                Zahlbetrag: ${window.formatCurrency(e.amount_gross - e.discount_amount)}
                            </div>
                            ${skontoAlarmHtml}
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
            <tr id="details-${e.id}" class="hidden">
                <td colspan="12" class="acc-details-cell" style="padding: 1rem 0;">
                    <div id="details-content-${e.id}" style="width: 100%;">
                    </div>
                </td>
            </tr>
        `;
        }).join('');
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
    window.renderAccountingCharts();
    window.renderYoYComparison();
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
            <div style="font-size: 1.1rem; font-weight: 900; color:#fff; margin-bottom: 1rem; display: flex; align-items: center; gap: 10px;">
                <span style="color: #fff;">Quartale ${yr}</span>
                <span style="display: inline-block; height: 1px; flex: 1; background: rgba(255,255,255,0.08);"></span>
            </div>
            <div class="quarters-stats-grid">
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

            let barHtml = '';
            if (hasData) {
                const total = incomingNum + outgoingNum;
                const outPct = total > 0 ? Math.round(outgoingNum / total * 100) : 50;
                const incPct = total > 0 ? Math.round(incomingNum / total * 100) : 50;
                barHtml = `
                    <div style="width: 100%; height: 5px; background: rgba(255,255,255,0.06); border-radius: 99px; overflow: hidden; display: flex; margin: 12px 0;">
                        <div style="width: ${outPct}%; height: 100%; background: var(--color-primary-green);" title="Ausgang: ${outPct}%"></div>
                        <div style="width: ${incPct}%; height: 100%; background: #ef4444;" title="Eingang: ${incPct}%"></div>
                    </div>
                `;
            } else {
                barHtml = `
                    <div style="width: 100%; height: 5px; background: rgba(255,255,255,0.03); border-radius: 99px; margin: 12px 0;"></div>
                `;
            }

            html += `
                <div class="glass-card" style="padding: 1.25rem; display: flex; flex-direction: column; justify-content: space-between; border: 1px solid ${hasData ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)'}; opacity: ${hasData ? '1' : '0.45'}; transition: transform 0.2s ease, box-shadow 0.2s ease;"
                     onmouseover="if(${hasData}){ this.style.transform='translateY(-3px)'; this.style.boxShadow='0 8px 16px rgba(0,0,0,0.3)'; }" 
                     onmouseout="this.style.transform='none'; this.style.boxShadow='none';">
                    <div>
                        <div style="display: flex; justify-content: space-between; align-items: baseline;">
                            <span style="font-size: 1.25rem; font-weight: 800; color: #fff; font-family: 'Outfit', sans-serif;">${q.name}</span>
                            <span style="font-size: 0.72rem; color:#fff; font-weight: 700; text-transform: uppercase;">${q.label}</span>
                        </div>
                        
                        ${barHtml}
                        
                        <div style="display: flex; flex-direction: column; gap: 6px; margin-top: 10px;">
                            <div style="display: flex; justify-content: space-between; font-size: 0.82rem; font-weight: 600;">
                                <span style="color:#fff;">Ausgang:</span>
                                <span style="color: var(--color-primary-green);">${window.formatCurrency(outgoingNum)}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; font-size: 0.82rem; font-weight: 600;">
                                <span style="color:#fff;">Eingang:</span>
                                <span style="color: #f87171;">${window.formatCurrency(incomingNum)}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div style="margin-top: 14px; padding: 8px 10px; background: ${hasData ? (balance >= 0 ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)') : 'rgba(255,255,255,0.02)'}; border: 1px solid ${hasData ? (balance >= 0 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)') : 'rgba(255,255,255,0.05)'}; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; font-weight: 700; font-size: 0.88rem;">
                        <span style="color:#fff; font-size: 0.72rem; text-transform: uppercase; font-weight: 700;">Bilanz:</span>
                        <span style="color: ${balance >= 0 ? 'var(--color-primary-green)' : '#f87171'}; font-weight: 800; font-size: 0.95rem;">${window.formatCurrency(balance)}</span>
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

    // Reset Global Assignment
    if (window.resetGlobalAssignment) window.resetGlobalAssignment();
    if (window.hideAccAiBanner) window.hideAccAiBanner();

    setTimeout(() => {
        const typeSelect = document.getElementById('acc-type');
        if (typeSelect) window.initGlassSelect(typeSelect);
        const vatSelect = document.getElementById('acc-vat-rate');
        if (vatSelect) window.initGlassSelect(vatSelect);
        const globalAreaSelect = document.getElementById('acc-global-assignment-area');
        if (globalAreaSelect) window.initGlassSelect(globalAreaSelect);
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
            'background: #0f172a',
            'border: 1px solid rgba(255,255,255,0.15)',
            'border-radius: 12px',
            'max-height: 260px',
            'overflow-y: auto',
            'box-shadow: 0 16px 48px rgba(0,0,0,0.7)',
            'display: none'
        ].join(';');
        document.body.appendChild(dropdown);
    } else {
        dropdown.style.background = '#0f172a';
    }

    dropdown.innerHTML = '';

    const noneItem = document.createElement('div');
    noneItem.textContent = 'Keine Maschine';
    noneItem.style.cssText = 'padding: 10px 14px; cursor: pointer; color:#fff; font-size: 0.9rem;';
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

    const row = document.getElementById(rowId);
    const searchInput = row ? row.querySelector('.item-machine-search') : null;
    if (searchInput) {
        const rect = searchInput.getBoundingClientRect();
        const dropdownHeight = dropdown.offsetHeight;
        const viewportHeight = window.innerHeight;
        if (rect.bottom + dropdownHeight > viewportHeight && rect.top - dropdownHeight > 0) {
            dropdown.style.top = (rect.top - dropdownHeight - 4) + 'px';
        } else {
            dropdown.style.top = (rect.bottom + 4) + 'px';
        }
        dropdown.style.left = rect.left + 'px';
        dropdown.style.width = rect.width + 'px';
    }
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

// Fest definierte Bereiche für die Zuordnung "Andere" — gepflegt unter Einstellungen >
// Kategorien > Buchhaltungs-Bereiche (categories-Tabelle, type 'area'). Solange dort noch
// nichts angelegt ist, gilt die bisherige Standard-Liste, damit nichts kaputt geht.
function getAssignmentAreas() {
    const defined = (window.categoryList || [])
        .filter(c => c.type === 'area')
        .map(c => c.name)
        .filter(Boolean);
    return defined.length > 0 ? defined : ['Lager', 'Werkstatt', 'Büro', 'Verkauf', 'Sonstiges'];
}

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
    header.className = 'item-row-header';
    header.style.cssText = 'display: grid; grid-template-columns: 1fr 100px 100px 100px auto; gap: 12px; align-items: start;';
    
    // Note: The grid layout is overridden by CSS (style.css) for mobile and tablet to stack vertically.
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
    assignmentBox.className = 'acc-assignment-box';

    // Assignment Type Toggle (Segmented Control style)
    const typeLabel = document.createElement('div');
    typeLabel.style.cssText = 'font-size: 0.75rem; color:#fff; text-transform: uppercase; font-weight: 700; min-width: 80px;';
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
            ${isMachine ? 'background: var(--color-primary-green); color: white;' : 'background: transparent; color:#fff;'}">
            Maschine
        </button>
        <button type="button" class="type-btn and ${!isMachine ? 'active' : ''}" onclick="window.toggleAccAssignmentType('${rowId}', 'other')" 
            style="padding: 6px 14px; border-radius: 8px; border: none; font-size: 0.8rem; font-weight: 700; cursor: pointer; transition: 0.2s; 
            ${!isMachine ? 'background: #6366f1; color: white;' : 'background: transparent; color:#fff;'}">
            Andere
        </button>
    `;
    assignmentBox.appendChild(typeToggleContainer);

    // Dynamic UI Container
    const dynamicUI = document.createElement('div');
    dynamicUI.className = 'dynamic-assignment-ui';
    dynamicUI.style.cssText = 'flex: 1; display: flex; align-items: center; gap: 12px; min-width: 0;';
    
    // Machine Filter Toggle & Input
    const machineUI = document.createElement('div');
    machineUI.className = 'machine-ui' + (isMachine ? '' : ' hidden');
    machineUI.style.cssText = 'display: flex; align-items: center; gap: 12px; flex: 1;';
    
    const filterToggle = document.createElement('div');
    filterToggle.style.cssText = 'display: flex; background: rgba(255,255,255,0.05); padding: 3px; border-radius: 8px;';
    const isAll = (data.machine_filter || 'all') === 'all';
    filterToggle.innerHTML = `
        <button type="button" class="filter-btn all ${isAll ? 'active' : ''}" onclick="window.toggleAccMachineFilter('${rowId}', 'all')" 
            style="padding: 4px 10px; border-radius: 6px; border: none; font-size: 0.75rem; font-weight: 600; cursor: pointer; transition: 0.2s; ${isAll ? 'background: rgba(255,255,255,0.1); color: white;' : 'background: transparent; color:#fff;'}">Alle</button>
        <button type="button" class="filter-btn wrk ${!isAll ? 'active' : ''}" onclick="window.toggleAccMachineFilter('${rowId}', 'workshop')" 
            style="padding: 4px 10px; border-radius: 6px; border: none; font-size: 0.75rem; font-weight: 600; cursor: pointer; transition: 0.2s; ${!isAll ? 'background: rgba(255,255,255,0.1); color: white;' : 'background: transparent; color:#fff;'}">Werkstatt</button>
    `;
    machineUI.appendChild(filterToggle);

    const machineSearchBox = document.createElement('div');
    machineSearchBox.className = 'search-input-wrapper' + (!isAll ? ' hidden' : '');
    machineSearchBox.style.cssText = 'position: relative; flex: 1;';
    const initName = data.machine_id ? window.getMachineName(data.machine_id) : '';
    machineSearchBox.innerHTML = `
        <div style="position: relative;">
            <svg style="position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color:#fff;" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
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
    // Fest definierte Bereiche (Einstellungen > Kategorien > Buchhaltungs-Bereiche);
    // ein abweichender, bereits gespeicherter Wert bleibt als eigene Option wählbar
    const areas = getAssignmentAreas();
    if (data.assignment_area && !areas.includes(data.assignment_area)) areas.push(data.assignment_area);
    areaSelect.innerHTML = '<option value="">Bereich wählen...</option>' +
        areas.map(a => `<option value="${a}" ${a === data.assignment_area ? 'selected' : ''}>${a}</option>`).join('');
    otherUI.appendChild(areaSelect);
    setTimeout(() => window.initGlassSelect(areaSelect), 0);
    
    dynamicUI.appendChild(otherUI);
    assignmentBox.appendChild(dynamicUI);
    row.appendChild(assignmentBox);

    container.appendChild(row);

    // NEUE Zeilen ohne eigene Zuordnung erben sichtbar die globale Zuordnung (falls
    // "Auf alle Positionen übertragen" aktiv ist und dort etwas gewählt wurde).
    // Aus der Datenbank geladene Zeilen (_fromDb, siehe editAccountingEntry) sind
    // ausgenommen — gespeicherte Zuordnungen bleiben beim Bearbeiten exakt erhalten.
    if (!data._fromDb && !data.machine_id && !data.assignment_area) {
        const g = getGlobalAssignmentValues();
        if (g.apply && globalAssignmentHasValue(g)) applyGlobalAssignmentToRow(row, g);
    }
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

// --- Global Assignment Controls ---
window._globalAssignmentType = 'machine';
window._globalMachineFilter = 'all';

window.toggleGlobalAssignmentType = function (type) {
    window._globalAssignmentType = type;
    const machineBtn = document.getElementById('acc-global-type-machine');
    const otherBtn = document.getElementById('acc-global-type-other');
    const machineUI = document.getElementById('acc-global-machine-ui');
    const otherUI = document.getElementById('acc-global-other-ui');
    if (machineBtn) {
        machineBtn.style.background = type === 'machine' ? 'var(--color-primary-green)' : 'transparent';
        machineBtn.style.color = type === 'machine' ? 'white' : 'rgba(255,255,255,0.4)';
    }
    if (otherBtn) {
        otherBtn.style.background = type === 'other' ? '#6366f1' : 'transparent';
        otherBtn.style.color = type === 'other' ? 'white' : 'rgba(255,255,255,0.4)';
    }
    if (machineUI) machineUI.style.display = type === 'machine' ? 'flex' : 'none';
    if (otherUI) otherUI.style.display = type === 'other' ? 'flex' : 'none';
};

window.toggleGlobalMachineFilter = function (filter) {
    window._globalMachineFilter = filter;
    const allBtn = document.getElementById('acc-global-filter-all');
    const wrkBtn = document.getElementById('acc-global-filter-workshop');
    const searchWrapper = document.getElementById('acc-global-machine-search-wrapper');
    const workshopDropdown = document.getElementById('acc-global-workshop-dropdown');
    if (allBtn) { allBtn.style.background = filter === 'all' ? 'rgba(255,255,255,0.1)' : 'transparent'; allBtn.style.color = filter === 'all' ? 'white' : 'rgba(255,255,255,0.4)'; }
    if (wrkBtn) { wrkBtn.style.background = filter === 'workshop' ? 'rgba(255,255,255,0.1)' : 'transparent'; wrkBtn.style.color = filter === 'workshop' ? 'white' : 'rgba(255,255,255,0.4)'; }
    if (searchWrapper) searchWrapper.style.display = filter === 'all' ? 'block' : 'none';
    if (workshopDropdown) {
        workshopDropdown.style.display = filter === 'workshop' ? 'flex' : 'none';
        if (filter === 'workshop') {
            // Populate workshop dropdown
            const sel = document.getElementById('acc-global-workshop-machine');
            if (sel) {
                const machines = (window.machineList || []).filter(m => m.is_in_workshop);
                sel.innerHTML = '<option value="">-- Maschine wählen --</option>' +
                    machines.map(m => `<option value="${m.id}">${window.getMachineName(m.id)}</option>`).join('');
                
                // Ensure Glass-Select is initialized (it won't re-initialize if dataset.glassInitialized is set)
                if (window.initGlassSelect) window.initGlassSelect(sel);
                // Trigger change to update display text
                sel.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }
    }
};

window.filterGlobalMachineDropdown = function (query) {
    const machines = window.machineList || [];
    const tokens = query.toLowerCase().split(/\s+/).filter(t => t.length > 0);
    const filtered = machines.filter(m => {
        const searchable = [m.manufacturer || '', m.name || '', m.serial || '', m.year ? String(m.year) : ''].join(' ').toLowerCase();
        return tokens.length === 0 || tokens.every(t => searchable.includes(t));
    });

    let dropdown = document.getElementById('acc-global-machine-dropdown-portal');
    if (!dropdown) {
        dropdown = document.createElement('div');
        dropdown.id = 'acc-global-machine-dropdown-portal';
        dropdown.style.cssText = 'position:fixed;z-index:999999;background:#0f172a;border:1px solid rgba(255,255,255,0.15);border-radius:12px;max-height:260px;overflow-y:auto;box-shadow:0 16px 48px rgba(0,0,0,0.7);display:none;min-width:200px;';
        document.body.appendChild(dropdown);
    } else {
        dropdown.style.background = '#0f172a';
    }
    const searchInput = document.getElementById('acc-global-machine-search');
    dropdown.innerHTML = '';
    const noneItem = document.createElement('div');
    noneItem.textContent = 'Keine Maschine';
    noneItem.style.cssText = 'padding:10px 14px;cursor:pointer;color:#fff;font-size:0.9rem;';
    noneItem.onmousedown = (e) => { e.preventDefault(); window.selectGlobalMachine('', ''); };
    noneItem.onmouseover = () => { noneItem.style.background = 'rgba(255,255,255,0.08)'; };
    noneItem.onmouseout = () => { noneItem.style.background = ''; };
    dropdown.appendChild(noneItem);
    filtered.forEach(m => {
        const label = window.getMachineName(m.id);
        const item = document.createElement('div');
        item.style.cssText = 'padding:10px 14px;cursor:pointer;font-size:0.9rem;border-top:1px solid rgba(255,255,255,0.05);';
        item.innerHTML = `<span style="color:var(--color-primary-green);font-weight:600;">${label}</span>`;
        item.onmousedown = (e) => { e.preventDefault(); window.selectGlobalMachine(m.id, label); };
        item.onmouseover = () => { item.style.background = 'rgba(255,255,255,0.06)'; };
        item.onmouseout = () => { item.style.background = ''; };
        dropdown.appendChild(item);
    });
    dropdown.style.display = 'block';

    if (searchInput) {
        const rect = searchInput.getBoundingClientRect();
        const dropdownHeight = dropdown.offsetHeight;
        const viewportHeight = window.innerHeight;
        if (rect.bottom + dropdownHeight > viewportHeight && rect.top - dropdownHeight > 0) {
            dropdown.style.top = (rect.top - dropdownHeight - 4) + 'px';
        } else {
            dropdown.style.top = (rect.bottom + 4) + 'px';
        }
        dropdown.style.left = rect.left + 'px';
        dropdown.style.width = rect.width + 'px';
    }
    document.addEventListener('click', function closeGlobal(e) {
        if (!dropdown.contains(e.target) && e.target.id !== 'acc-global-machine-search') {
            dropdown.style.display = 'none';
            document.removeEventListener('click', closeGlobal);
        }
    });
};

window.selectGlobalMachine = function (id, label) {
    const searchInput = document.getElementById('acc-global-machine-search');
    const hiddenInput = document.getElementById('acc-global-machine-id');
    if (searchInput) { searchInput.value = label; searchInput.style.color = id ? 'var(--color-primary-green)' : ''; }
    if (hiddenInput) hiddenInput.value = id;
    const dropdown = document.getElementById('acc-global-machine-dropdown-portal');
    if (dropdown) dropdown.style.display = 'none';
    window.applyGlobalAssignmentToItemRows();
};

window.selectGlobalWorkshopMachine = function (id) {
    const machineId = parseInt(id) || null;
    const label = machineId ? window.getMachineName(machineId) : '';
    const hiddenInput = document.getElementById('acc-global-machine-id');
    if (hiddenInput) hiddenInput.value = id;
    // Update search box for consistency
    const searchInput = document.getElementById('acc-global-machine-search');
    if (searchInput) { searchInput.value = label; searchInput.style.color = id ? 'var(--color-primary-green)' : ''; }
    window.applyGlobalAssignmentToItemRows();
};

// --- Globale Zuordnung sichtbar auf die Positionszeilen übertragen ---
// Früher wurde die globale Zuordnung erst UNSICHTBAR beim Speichern über alle Positionen
// gestülpt (submitAccountingEntry) — mit fatalem Nebeneffekt: War das standardmäßig
// angehakte "Auf alle Positionen anwenden" aktiv, aber KEINE globale Maschine gewählt,
// wurden alle mühsam einzeln gesetzten Positions-Zuordnungen beim Speichern auf leer
// überschrieben. Jetzt gilt: Die Übertragung passiert sofort und sichtbar in den Zeilen,
// sobald eine globale Maschine/ein Bereich gewählt wird — gespeichert wird immer genau
// das, was in den Zeilen steht (WYSIWYG), ohne versteckte Überschreibung.
function getGlobalAssignmentValues() {
    return {
        type: window._globalAssignmentType || 'machine',
        machineId: document.getElementById('acc-global-machine-id')?.value || '',
        area: document.getElementById('acc-global-assignment-area')?.value.trim() || '',
        filter: window._globalMachineFilter || 'all',
        apply: document.getElementById('acc-global-apply-to-items')?.checked ?? false
    };
}

function globalAssignmentHasValue(g) {
    return g.type === 'machine' ? !!g.machineId : !!g.area;
}

function applyGlobalAssignmentToRow(row, g) {
    window.toggleAccAssignmentType(row.id, g.type);
    if (g.type === 'machine') {
        window.toggleAccMachineFilter(row.id, g.filter);
        const label = window.getMachineName(parseInt(g.machineId)) || '';
        window.selectAccMachine(g.machineId, label, row.id);
        if (g.filter === 'workshop') {
            const ws = row.querySelector('.item-machine-workshop');
            if (ws) {
                ws.value = String(g.machineId);
                ws.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }
    } else {
        row.dataset.assignmentArea = g.area;
        const sel = row.querySelector('.item-area-select');
        if (sel) {
            if (![...sel.options].some(o => o.value === g.area)) {
                const opt = document.createElement('option');
                opt.value = g.area;
                opt.textContent = g.area;
                sel.appendChild(opt);
            }
            sel.value = g.area;
            sel.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }
}

window.applyGlobalAssignmentToItemRows = function () {
    const g = getGlobalAssignmentValues();
    if (!g.apply || !globalAssignmentHasValue(g)) return;
    document.querySelectorAll('#accounting-items-container .item-row').forEach(row => {
        applyGlobalAssignmentToRow(row, g);
    });
};

// Befüllt das globale Bereichs-Auswahlfeld mit den fest definierten Bereichen
// (Einstellungen > Kategorien > Buchhaltungs-Bereiche). Ein bereits gespeicherter,
// abweichender Wert (Altdaten aus der früheren Freitext-Eingabe) bleibt wählbar.
function populateGlobalAreaSelect(selected) {
    const sel = document.getElementById('acc-global-assignment-area');
    if (!sel) return;
    const areas = getAssignmentAreas();
    if (selected && !areas.includes(selected)) areas.push(selected);
    sel.innerHTML = '<option value="">Bereich wählen...</option>' +
        areas.map(a => `<option value="${a}" ${a === selected ? 'selected' : ''}>${a}</option>`).join('');
    sel.dispatchEvent(new Event('change', { bubbles: true }));
}

window.resetGlobalAssignment = function () {
    window._globalAssignmentType = 'machine';
    window._globalMachineFilter = 'all';
    window.toggleGlobalAssignmentType('machine');
    window.toggleGlobalMachineFilter('all');
    populateGlobalAreaSelect('');
    const searchInput = document.getElementById('acc-global-machine-search');
    if (searchInput) { searchInput.value = ''; searchInput.style.color = ''; }
    const hiddenInput = document.getElementById('acc-global-machine-id');
    if (hiddenInput) hiddenInput.value = '';
    const areaInput = document.getElementById('acc-global-assignment-area');
    if (areaInput) {
        areaInput.value = '';
        areaInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const applyCheck = document.getElementById('acc-global-apply-to-items');
    if (applyCheck) applyCheck.checked = true;
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

window.syncAccountDebitedStatus = function() {
    const debitedCheck = document.getElementById('acc-is-debited');
    if (!debitedCheck) return;
    
    if (debitedCheck.checked) {
        const paidCheck = document.getElementById('acc-is-paid');
        const paidAt = document.getElementById('acc-paid-at');
        const invoiceDate = document.getElementById('acc-date').value;
        
        if (paidCheck) paidCheck.checked = true;
        if (paidAt && invoiceDate) {
            paidAt.value = invoiceDate;
        }
    }
};

window.submitAccountingEntry = async function (event) {
    if (event && event.preventDefault) event.preventDefault();
    console.log('Accounting Module: submitting entry');

    try {
        const id = document.getElementById('accounting-id').value;

        // Read global assignment values
        const globalType = window._globalAssignmentType || 'machine';
        const globalMachineId = parseInt(document.getElementById('acc-global-machine-id')?.value) || null;
        const globalArea = document.getElementById('acc-global-assignment-area')?.value || null;
        const globalMachineFilter = window._globalMachineFilter || 'all';

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
            paid_at: document.getElementById('acc-paid-at').value || null,
            is_debited: document.getElementById('acc-is-debited')?.checked || false,
            global_assignment_type: globalType,
            global_assignment_machine_id: globalType === 'machine' ? globalMachineId : null,
            global_assignment_area: globalType === 'other' ? globalArea : null,
            global_machine_filter: globalMachineFilter,
            document_url: document.getElementById('acc-document-url')?.value || null
        };

        // Wenn created_by eine echte UUID ist (Länge > 30), mitsenden, sonst weglassen.
        if (window.activeUser && window.activeUser.id && String(window.activeUser.id).length > 30) {
            entryData.created_by = window.activeUser.id;
        }

        // Positionen als JSONB-Array direkt am Beleg speichern (Spalte accounting.items,
        // siehe supabase_migration_accounting_items_jsonb.sql) statt als einzelne Zeilen
        // in einer eigenen Tabelle — 1 DB-Zeile pro Beleg statt 1+N, und das Speichern
        // ist atomar (ein einziger Request statt Update + Delete + Insert).
        // Die Zeilen sind die alleinige Quelle der Wahrheit — die globale Zuordnung wurde
        // (falls gewünscht) bereits sichtbar per applyGlobalAssignmentToItemRows in die
        // Zeilen übertragen. Keine versteckte Überschreibung beim Speichern mehr.
        const itemRows = document.querySelectorAll('#accounting-items-container .item-row');
        entryData.items = Array.from(itemRows).map(row => {
            const machineId = row.dataset.machineId ? parseInt(row.dataset.machineId) : null;
            const assignmentType = row.dataset.assignmentType || 'machine';
            const assignmentArea = row.dataset.assignmentArea || null;
            const machineFilter = row.dataset.machineFilter || 'all';

            return {
                description: row.querySelector('.item-desc').value,
                quantity: parseFloat(row.querySelector('.item-qty').value) || 0,
                unit: row.querySelector('.item-unit').value,
                price_net: parseFloat(row.querySelector('.item-price').value) || 0,
                machine_id: machineId,
                assignment_type: assignmentType,
                assignment_area: assignmentArea,
                machine_filter: machineFilter
            };
        });

        let result;
        if (id && id.length > 30) { // Check valid UUID for update
            result = await window.supabaseClient.from('accounting').update(entryData).eq('id', id);
        } else {
            result = await window.supabaseClient.from('accounting').insert([entryData]).select();
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
        document.getElementById('acc-document-url').value = entry.document_url || '';

        const paidCheck = document.getElementById('acc-is-paid');
        if (paidCheck) paidCheck.checked = !!entry.is_paid;
        document.getElementById('acc-paid-at').value = entry.paid_at || '';

        const debitedCheck = document.getElementById('acc-is-debited');
        if (debitedCheck) debitedCheck.checked = !!entry.is_debited;

        // Restore global assignment
        const globalType = entry.global_assignment_type || 'machine';
        window.toggleGlobalAssignmentType(globalType);
        const globalMachineFilter = entry.global_machine_filter || 'all';
        window.toggleGlobalMachineFilter(globalMachineFilter);
        if (globalType === 'machine' && entry.global_assignment_machine_id) {
            const machineName = window.getMachineName(entry.global_assignment_machine_id);
            const searchInput = document.getElementById('acc-global-machine-search');
            const hiddenInput = document.getElementById('acc-global-machine-id');
            if (searchInput) { searchInput.value = machineName; searchInput.style.color = 'var(--color-primary-green)'; }
            if (hiddenInput) hiddenInput.value = entry.global_assignment_machine_id;
        } else if (globalType === 'other') {
            populateGlobalAreaSelect(entry.global_assignment_area || '');
        }
        
        window.updateAccountingEntityLabel();
    }, 10);

    // Positionen kommen direkt aus dem Beleg (JSONB-Spalte items) — kein extra Fetch nötig.
    // _fromDb markiert die Zeilen als "aus der Datenbank geladen", damit sie NICHT die
    // globale Zuordnung erben (gespeicherte Zuordnungen bleiben beim Bearbeiten unangetastet).
    const itemsContainer = document.getElementById('accounting-items-container');
    if (itemsContainer) itemsContainer.innerHTML = '';
    (entry.items || []).forEach(item => window.addAccountingItemRow({ ...item, _fromDb: true }));
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

// --- Hilfsfunktionen für die KI-Beleganalyse ---

// Ergebnis-/Warnbanner im Modal (ersetzt die störenden alert()-Popups nach der Analyse)
window.showAccAiBanner = function (kind, html) {
    const b = document.getElementById('acc-ai-result-banner');
    if (!b) return;
    const styles = {
        success: 'background: rgba(16,185,129,0.1); border: 1px solid rgba(16,185,129,0.35); color: #6ee7b7;',
        warning: 'background: rgba(245,158,11,0.12); border: 1px solid rgba(245,158,11,0.4); color: #fcd34d;',
        error: 'background: rgba(239,68,68,0.12); border: 1px solid rgba(239,68,68,0.4); color: #fca5a5;'
    };
    b.style.cssText = 'margin: -0.75rem 0 1.5rem 0; padding: 12px 16px; border-radius: 12px; font-size: 0.85rem; line-height: 1.5; display: block;' + (styles[kind] || styles.success);
    b.innerHTML = html;
    b.classList.remove('hidden');
};

window.hideAccAiBanner = function () {
    const b = document.getElementById('acc-ai-result-banner');
    if (b) { b.style.display = 'none'; b.classList.add('hidden'); }
};

// Datei nativ per FileReader in eine Data-URL wandeln — ersetzt die alte
// Byte-für-Byte-Schleife (String-Konkatenation in einer Schleife über Millionen
// Bytes), die bei Handyfotos den Browser für mehrere Sekunden einfrieren konnte.
function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden.'));
        reader.readAsDataURL(file);
    });
}

// Bild auf max. Kantenlänge herunterskalieren und als JPEG neu kodieren.
// Grund: Die Groq-API lehnt zu große Anfragen ab (Base64-Bilder max. ~4 MB) —
// unverkleinerte Handyfotos (4000px+, mehrere MB) ließen die Analyse deshalb
// regelmäßig fehlschlagen. 2000px reichen für die Texterkennung locker aus.
function downscaleImageForAI(dataUrl, maxDim = 2000, quality = 0.85) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const longest = Math.max(img.naturalWidth, img.naturalHeight);
            if (longest <= maxDim) { resolve(dataUrl); return; }
            const scale = maxDim / longest;
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(img.naturalWidth * scale);
            canvas.height = Math.round(img.naturalHeight * scale);
            canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL('image/jpeg', quality));
        };
        // Falls das Format nicht dekodierbar ist, Original unverändert weiterreichen
        img.onerror = () => resolve(dataUrl);
        img.src = dataUrl;
    });
}

// Plausibilitätsprüfung + Auto-Korrektur der KI-Positionen gegen den Netto-Betrag.
// Die zwei häufigsten KI-Fehler werden automatisch erkannt und repariert:
// 1. price_net enthält die ZEILENSUMME statt des Einzelpreises (Summe der Preise = Netto)
// 2. price_net ist BRUTTO statt Netto (Summe / (1+MwSt) = Netto)
// Bleibt danach eine Abweichung, wird sie als Warnung gemeldet statt stillschweigend
// falsche Positionen zu übernehmen.
function validateAndFixAiPositions(parsedData) {
    const notes = [];
    const positions = Array.isArray(parsedData.positions)
        ? parsedData.positions.filter(p => p && p.description)
        : [];
    const net = parseFloat(parsedData.net_amount);
    if (!positions.length || isNaN(net) || net <= 0) return { positions, notes, mismatch: false };

    const qtyOf = p => { const q = parseFloat(p.quantity); return (isNaN(q) || q <= 0) ? 1 : q; };
    const priceOf = p => parseFloat(p.price_net) || 0;
    const close = (a, b) => Math.abs(a - b) <= Math.max(0.05, Math.abs(b) * 0.005);

    let total = positions.reduce((s, p) => s + qtyOf(p) * priceOf(p), 0);
    if (close(total, net)) return { positions, notes, mismatch: false };

    const lineTotalSum = positions.reduce((s, p) => s + priceOf(p), 0);
    if (close(lineTotalSum, net)) {
        positions.forEach(p => {
            const q = qtyOf(p);
            if (q !== 1) p.price_net = Math.round((priceOf(p) / q) * 100) / 100;
        });
        notes.push('Einzelpreise wurden automatisch aus den erkannten Zeilensummen berechnet.');
        return { positions, notes, mismatch: false };
    }

    const vat = parseFloat(parsedData.vat_rate);
    if (!isNaN(vat) && vat > 0) {
        const factor = 1 + vat / 100;
        if (close(total / factor, net)) {
            positions.forEach(p => { p.price_net = Math.round((priceOf(p) / factor) * 100) / 100; });
            notes.push('Positionspreise waren Brutto und wurden automatisch in Netto umgerechnet.');
            return { positions, notes, mismatch: false };
        }
    }

    notes.push(`Die Positionssumme (${total.toFixed(2)} €) weicht vom Netto-Betrag der Rechnung (${net.toFixed(2)} €) ab — bitte Positionen und Beträge prüfen.`);
    return { positions, notes, mismatch: true };
}

window.handleAccountingPDFUpload = async function (event) {
    const file = event.target.files[0];
    if (!file) return;

    const apiKey = localStorage.getItem('groq_api_key');
    if (!apiKey) {
        alert('Bitte hinterlegen Sie einen Groq API-Key in den Einstellungen.');
        return;
    }

    window.hideAccAiBanner();

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
        // --- NEW: Upload File to Supabase Storage ---
        updateStatus('Datei wird hochgeladen...');
        const path = `accounting/${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
        const uploadResult = await window.FileUploadService.uploadFile(file, {
            bucket: 'accounting-documents',
            path: path,
            compress: true
        });
        
        // Save URL in hidden input
        const urlInput = document.getElementById('acc-document-url');
        if (urlInput) urlInput.value = uploadResult.url;
        console.log('File uploaded safely to:', uploadResult.url);
        // ---------------------------------------------

        const isImage = file.type.startsWith('image/');
        const systemPrompt = `Du bist ein präziser Buchhaltungs-Assistent für das Unternehmen 'Meetra'. Analysiere das Dokument (Deutsch oder Englisch) und gib NUR valides JSON zurück. 
Schlüssel: invoice_number, date (YYYY-MM-DD), net_amount (Zahl), vat_rate (Zahl), type (incoming/outgoing), entity (Geschäftspartner), due_date (YYYY-MM-DD oder "sofort"), paid_at (YYYY-MM-DD), discount_date (YYYY-MM-DD), discount_amount (Zahl), is_paid (boolean), is_debited (boolean), positions (Array aus {description, quantity, unit, price_net}).

ERKENNUNG DES DATUMS (date):
- PRIORITÄT: Das Rechnungsdatum ("Invoice Date") steht meist OBEN RECHTS.
- WARNUNG: Ein Datum bei "Auftragsnummer", "Order Number", "Bestellnummer" oder "Lieferdatum" / "Delivery Date" ist meist FALSCH. Suche explizit nach "Rechnungsdatum" oder dem Datum im Briefkopf.

ERKENNUNG DES TYPS (type) & GESCHÄFTSPARTNERS (entity):
1. 'outgoing' (Ausgangsrechnung): Wenn "Meetra" oder "meetra Recycling Maschinen" der ABSENDER (Sender/Issuer) ist und ein anderer Name bei "Rechnungsadresse", "Kundenadresse", "Invoice Address", "Sold to", "Bill to" oder "Customer" steht.
2. 'incoming' (Eingangsrechnung): Wenn "Meetra" der EMPFÄNGER ist und ein anderer Name als Absender/Vendor/Supplier fungiert.
3. STRIKTE VERBOTE: "Dietmar Meenken", "Mirco Loseke", "Simon Gabbert", "Meetra" dürfen NIEMALS die 'entity' sein. Die 'entity' ist immer der EXTERNE Partner.
4. IGNORIEREN: Namen/Adressen, die unter "Lieferadresse", "Lieferanschrift", "Delivery Address" oder "Shipping Address" stehen, sind NICHT die 'entity' (Vertragspartner).
5. PRIORITÄT: Suche nach "sold to", "bill to", "customer", "verkauft durch", "vendor", "supplier".

STEUERSATZ (vat_rate):
- Erkenne Steuerbefreiungen oder 0% Sätze (z.B. "Steuerfreie innergemeinschaftliche Lieferung", "Reverse Charge", "Tax Rate: 0%"). 
- Suche gezielt nach dem Prozentsatz in der Nähe von "Tax", "Steuer", "VAT", "MwSt." oder "USt.". Wenn dort z.B. "incl. 19% Tax" oder "zzgl. 7% MwSt" steht, nutze 19 bzw 7.

STATUS (is_paid & paid_at):
- 'is_paid' = true bei "paid", "amount received", "bezahlt", "Amazon Pay".
- 'paid_at': Suche nach "paid on", "bezahlt am". Falls unklar aber bezahlt, nutze 'date'.

FÄLLIGKEIT (due_date):
- "Due immediately", "payable now", "sofort fällig" -> "sofort". Ansonsten YYYY-MM-DD.

SKONTO (discount_date & discount_amount):
- Suche nach "Skonto", z.B. "2% Skonto bei Zahlung bis 15.01.2025" oder "innerhalb 14 Tagen 2% Skonto".
- 'discount_date' = das späteste Datum, bis zu dem Skonto gewährt wird (ggf. aus Rechnungsdatum + Fristtagen berechnen).
- 'discount_amount' = der Skonto-BETRAG in Euro (Prozentsatz mal Bruttobetrag), NICHT der Prozentsatz.

KONTO ABBUCHUNG (is_debited):
- Setze 'is_debited' = true, wenn auf der Rechnung steht, dass der Betrag automatisch vom Konto abgebucht wird: z.B. "wird von folgendem Konto abgebucht", "Einzugsermächtigung", "SEPA-Lastschrift", "Lastschrift", "wird automatisch abgebucht", "direct debit", "charged to your account", "wird abgebucht", "Abbuchung", "Bankeinzug".
- Falls 'is_debited' = true: Setze 'due_date' = "sofort" (außer es ist explizit ein anderes Datum angegeben).

WICHTIG ZU PREISEN:
- 'price_net' ist der NETTO-EINZELPREIS (Stückpreis ohne MwSt), NICHT die Zeilensumme und NICHT brutto.
- KONTROLLE: Die Summe aller (quantity × price_net) MUSS dem 'net_amount' entsprechen. Prüfe das, bevor du antwortest, und korrigiere die Positionen falls nötig.
Setze Unbekanntes auf null.`;

        let requestBody = {};

        if (isImage) {
            updateStatus('Lese Bilddaten...');
            // Nativ einlesen und auf API-taugliche Größe herunterskalieren (siehe
            // fileToDataUrl/downscaleImageForAI) — große Handyfotos ließen die Analyse
            // vorher am Request-Limit der Groq-API scheitern.
            const rawDataUrl = await fileToDataUrl(file);
            const base64Image = await downscaleImageForAI(rawDataUrl);

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
            const base64Images = [];
            try {
                await window.loadPDFReader();
                // Use file.arrayBuffer() instead of FileReader to avoid NotReadableError
                const arrayBuf = await file.arrayBuffer();
                const typedarray = new Uint8Array(arrayBuf);
                const loadingTask = window.pdfjsLib.getDocument({ data: typedarray });
                const pdfDocument = await loadingTask.promise;

                // Max 3 pages to prevent payload size issues/rate limits
                const numPages = Math.min(pdfDocument.numPages, 3);

                for (let i = 1; i <= numPages; i++) {
                    const page = await pdfDocument.getPage(i);
                    // Auflösung dynamisch begrenzen (längste Kante ~2000px) statt fest
                    // Scale 3.0 / Qualität 0.95: Das erzeugte pro A4-Seite mehrere MB
                    // Base64 und ließ die Groq-API bei mehrseitigen PDFs am
                    // Request-Größenlimit abbrechen. 2000px reichen für Texterkennung.
                    const baseViewport = page.getViewport({ scale: 1.0 });
                    const scale = Math.min(3.0, 2000 / Math.max(baseViewport.width, baseViewport.height));
                    const viewport = page.getViewport({ scale });
                    const canvas = document.createElement('canvas');
                    const context = canvas.getContext('2d');
                    canvas.height = viewport.height;
                    canvas.width = viewport.width;
                    await page.render({ canvasContext: context, viewport: viewport }).promise;
                    base64Images.push(canvas.toDataURL('image/jpeg', 0.85));
                }
            } catch (pdfErr) {
                throw new Error('Fehler beim Rendern der PDF: ' + pdfErr.message);
            }

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
                sel.dispatchEvent(new Event('change', { bubbles: true }));
                if (window.updateAccountingEntityLabel) window.updateAccountingEntityLabel();
            }
        }
        if (parsedData.entity) document.getElementById('acc-entity').value = parsedData.entity;
        if (parsedData.invoice_number) document.getElementById('acc-invoice-number').value = parsedData.invoice_number;
        if (parsedData.date) document.getElementById('acc-date').value = parsedData.date;
        if (parsedData.net_amount !== null) document.getElementById('acc-amount-net').value = parseFloat(parsedData.net_amount).toFixed(2);
        
        if (parsedData.vat_rate !== null) {
            const vatSel = document.getElementById('acc-vat-rate');
            if (vatSel) {
                vatSel.value = parsedData.vat_rate.toString();
                vatSel.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }

        if (parsedData.due_date) document.getElementById('acc-due-date').value = parsedData.due_date;
        if (parsedData.discount_date) document.getElementById('acc-discount-date').value = parsedData.discount_date;
        if (parsedData.discount_amount !== null) document.getElementById('acc-discount-amount').value = parseFloat(parsedData.discount_amount).toFixed(2);

        if (parsedData.is_debited !== undefined) {
            const debitedCheck = document.getElementById('acc-is-debited');
            if (debitedCheck) {
                debitedCheck.checked = !!parsedData.is_debited;
                if (debitedCheck.checked) window.syncAccountDebitedStatus();
            }
        }

        if (parsedData.is_paid !== undefined && !parsedData.is_debited) {
            const paidCheck = document.getElementById('acc-is-paid');
            if (paidCheck) paidCheck.checked = !!parsedData.is_paid;
        }
        if (parsedData.paid_at && !parsedData.is_debited) document.getElementById('acc-paid-at').value = parsedData.paid_at;

        window.calculateGross();

        // Positionen: erst gegen den Netto-Betrag validieren (und typische KI-Fehler wie
        // Zeilensumme-statt-Einzelpreis oder Brutto-statt-Netto automatisch korrigieren),
        // dann einfügen. Neue Zeilen erben dabei automatisch die globale Zuordnung,
        // falls dort bereits eine Maschine/ein Bereich gewählt wurde.
        const { positions, notes, mismatch } = validateAndFixAiPositions(parsedData);
        const cont = document.getElementById('accounting-items-container');
        if (cont) {
            cont.innerHTML = '';
            positions.forEach(pos => window.addAccountingItemRow(pos));
        }

        const summaryParts = [`<strong>Analyse abgeschlossen:</strong> ${positions.length} Position${positions.length !== 1 ? 'en' : ''} erkannt.`];
        notes.forEach(n => summaryParts.push(n));
        summaryParts.push('Bitte alle Werte kurz gegen den Beleg prüfen, bevor gespeichert wird.');
        window.showAccAiBanner(mismatch ? 'warning' : 'success', summaryParts.join('<br>'));

    } catch (err) {
        console.error("AI Analysis Error:", err);
        const errMsg = err.message || JSON.stringify(err) || "Unbekannter Fehler beim API-Aufruf.";

        if (errMsg.includes('insufficient_quota') || errMsg.includes('exceeded your current quota') || errMsg.includes('rate_limit')) {
            window.showAccAiBanner('error', '<strong>Rate-Limit erreicht:</strong> Die kostenlose Groq API ist gerade ausgelastet. Bitte kurz warten und erneut versuchen.');
        } else if (errMsg.includes('invalid_api_key') || errMsg.includes('Incorrect API key')) {
            window.showAccAiBanner('error', '<strong>API-Key ungültig:</strong> Bitte den Groq API-Key in den Einstellungen prüfen.');
        } else {
            window.showAccAiBanner('error', `<strong>Fehler bei der Analyse:</strong> ${errMsg}`);
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

// Ansichts-Filter der Finanzübersicht: 'all' | 'incoming' | 'outgoing'
let finTypeFilter = 'all';

window.switchFinType = function (type) {
    finTypeFilter = type;
    document.querySelectorAll('#fin-type-tabs .fin-type-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.type === type);
    });
    window.updateFinancialDashboard();
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

        // Reiter-Zustand syncen + rendern
        window.switchFinType(finTypeFilter);
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

    const unpaid = allAccountingEntries.filter(e =>
        !e.is_paid && (finTypeFilter === 'all' || e.type === finTypeFilter));

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

    // --- Liquiditäts-Zusammenfassung über den Listen (abhängig vom Eingang/Ausgang-Reiter) ---
    const sumGrossOf = arr => arr.reduce((s, e) => s + (parseFloat(e.amount_gross) || 0), 0);
    const skontoSaving = skontoDeals.reduce((s, e) => s + (parseFloat(e.discount_amount) || 0), 0);
    const kpiTile = (value, label, color, borderColor) => `
        <div class="acc-eval-kpi"${borderColor ? ` style="border-color: ${borderColor};"` : ''}>
            <div class="acc-eval-kpi-value" style="color: ${color};">${value}</div>
            <div class="acc-eval-kpi-label">${label}</div>
        </div>`;

    let html = '';

    if (finTypeFilter === 'incoming') {
        const futureSum = sumGrossOf(incomingItems);
        const overdueSum = sumGrossOf(overdueIncoming);
        const openTotal = futureSum + overdueSum;
        if (openTotal > 0 || skontoSaving > 0) {
            html += `<div class="fin-summary-grid">
                ${kpiTile(window.formatCurrency(openTotal), `Offene Zahlungen (${incomingItems.length + overdueIncoming.length})`, '#f87171')}
                ${kpiTile(window.formatCurrency(overdueSum), `Davon überfällig (${overdueIncoming.length})`, '#ea580c', overdueIncoming.length > 0 ? 'rgba(234,88,12,0.3)' : null)}
                ${kpiTile(window.formatCurrency(futureSum), `Zukünftig fällig (${incomingItems.length})`, '#fff')}
                ${kpiTile(window.formatCurrency(skontoSaving), `Mögl. Skonto-Ersparnis (${skontoDeals.length})`, '#fbbf24')}
            </div>`;
        }
    } else if (finTypeFilter === 'outgoing') {
        const futureSum = sumGrossOf(outgoingItems);
        const overdueSum = sumGrossOf(overdueOutgoing);
        const openTotal = futureSum + overdueSum;
        const biggest = [...outgoingItems, ...overdueOutgoing].sort((a, b) => (parseFloat(b.amount_gross) || 0) - (parseFloat(a.amount_gross) || 0))[0];
        if (openTotal > 0) {
            html += `<div class="fin-summary-grid">
                ${kpiTile(window.formatCurrency(openTotal), `Erwartete Eingänge (${outgoingItems.length + overdueOutgoing.length})`, 'var(--color-primary-green)')}
                ${kpiTile(window.formatCurrency(overdueSum), `Überfällige Kundenzahlungen (${overdueOutgoing.length})`, '#ea580c', overdueOutgoing.length > 0 ? 'rgba(234,88,12,0.3)' : null)}
                ${kpiTile(window.formatCurrency(futureSum), `Zukünftig erwartet (${outgoingItems.length})`, '#fff')}
                ${kpiTile(biggest ? window.formatCurrency(biggest.amount_gross) : '-', `Größter offener Posten${biggest ? ' · ' + escapeHtml(String(biggest.entity).split(',')[0].substring(0, 18)) : ''}`, '#60a5fa')}
            </div>`;
        }
    } else {
        const expectedIn = sumGrossOf(outgoingItems) + sumGrossOf(overdueOutgoing);   // Kunden zahlen an uns
        const dueOut = sumGrossOf(incomingItems) + sumGrossOf(overdueIncoming);       // Wir zahlen an Lieferanten
        const netForecast = expectedIn - dueOut;
        const overdueTotal = overdueIncoming.length + overdueOutgoing.length;
        if (expectedIn > 0 || dueOut > 0 || skontoSaving > 0 || overdueTotal > 0) {
            html += `<div class="fin-summary-grid">
                ${kpiTile(window.formatCurrency(expectedIn), `Erwartete Eingänge (${outgoingItems.length + overdueOutgoing.length})`, 'var(--color-primary-green)')}
                ${kpiTile(window.formatCurrency(dueOut), `Fällige Zahlungen (${incomingItems.length + overdueIncoming.length})`, '#f87171')}
                ${kpiTile((netForecast >= 0 ? '+' : '') + window.formatCurrency(netForecast), `Netto-Prognose${overdueTotal > 0 ? ' · ' + overdueTotal + ' überfällig' : ''}`, netForecast >= 0 ? 'var(--color-primary-green)' : '#f87171', netForecast >= 0 ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)')}
                ${kpiTile(window.formatCurrency(skontoSaving), `Mögl. Skonto-Ersparnis (${skontoDeals.length})`, '#fbbf24')}
            </div>`;
        }
    }

    let listHtml = '';
    if (direction === 'all') {
        if (overdueOutgoing.length > 0) listHtml += renderDashboardSection('⚠️ Überfällig: Ausgang (Kunden)', overdueOutgoing, '10b981', 'due_date', false, '#10b981', null, today);
        if (overdueIncoming.length > 0) listHtml += renderDashboardSection('⚠️ Überfällig: Eingang (Lieferanten)', overdueIncoming, 'ea580c', 'due_date', false, '#ea580c', null, today);
        if (skontoDeals.length > 0) listHtml += renderDashboardSection('🏷️ Eingang: Skonto-Fristen', skontoDeals, 'facc15', 'discount_date', true, '#facc15', null, today);
        if (incomingItems.length > 0) listHtml += renderDashboardSection('📥 Eingang: Zukünftig fällig', incomingItems, 'f87171', 'due_date', false, '#f87171', null, today);
        if (outgoingItems.length > 0) listHtml += renderDashboardSection('📤 Ausgang: Erwartete Zahlungen', outgoingItems, '10b981', 'due_date', false, '#10b981', null, today);
    } else if (direction === 'future') {
        listHtml += renderDashboardSection('📥 Eingang: Demnächst fällig', incomingItems, 'f87171', 'due_date', false, '#f87171', null, today);
        listHtml += renderDashboardSection('🏷️ Eingang: Skonto-Fristen', skontoDeals, 'facc15', 'discount_date', true, '#facc15', null, today);
        listHtml += renderDashboardSection('📤 Ausgang: Erwartete Zahlungen', outgoingItems, '10b981', 'due_date', false, '#10b981', null, today);
    } else if (direction === 'past') {
        listHtml += renderDashboardSection('Vergangene Ausgangsrechnungen (Kunden)', overdueOutgoing, '10b981', 'due_date', false, null, null, today);
        listHtml += renderDashboardSection('Vergangene Eingangsrechnungen (Lieferanten)', overdueIncoming, 'ea580c', 'due_date', false, null, null, today);
    }

    if (!listHtml) {
        listHtml = `<div style="padding: 4rem 2rem; text-align: center; color: rgba(255,255,255,0.2);">Keine passenden Einträge gefunden.</div>`;
    }

    content.innerHTML = html + listHtml;
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
                ${timeLabel ? `<span style="color:#fff; font-size: 0.8rem; font-weight: 400; text-transform: none; letter-spacing: 0;">${timeLabel}</span>` : ''}
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
                        <span style="font-weight: 400; color:#fff; font-size: 0.75rem; margin-left: 8px;">${e.invoice_number || ''}</span>
                        <div style="font-size: 0.75rem; font-weight: 500; color:#fff; margin-top: 2px;">${relativeText}</div>
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

        // Initialize glass select for time range
        const rangeSelect = document.getElementById('eval-time-range');
        if (rangeSelect) window.initGlassSelect(rangeSelect);

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
    content.innerHTML = '<div style="padding: 2rem; text-align: center; color:#fff;">Optimiere Datenzugriff...</div>';

    try {
        if (!window.supabaseClient) throw new Error('Supabase client not initialized');

        // 1. Belege laden (die Positionen hängen als JSONB-Array direkt an jedem Beleg —
        // keine separate Abfrage mit Join mehr nötig)
        if (!allAccountingEntries || allAccountingEntries.length === 0) {
            console.log('Main entries empty, fetching...');
            await window.fetchAccountingEntries();
        }

        const groupedMachines = {};
        const groupedAreas = {};
        const months = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

        // 2. Positionen aller Eingangsbelege auswerten
        allAccountingEntries.forEach(entry => {
            if (entry.type !== 'incoming') return;

            const date = new Date(entry.date);
            if (startDate && date < startDate) return;
            if (endDate && date > endDate) return;

            const monthYear = `${months[date.getMonth()]} ${date.getFullYear()}`;
            const items = Array.isArray(entry.items) ? entry.items : [];

            items.forEach(item => {
                const cost = (parseFloat(item.price_net) || 0) * (parseFloat(item.quantity) || 1);

                if (item.assignment_type === 'machine' && item.machine_id) {
                    if (!groupedMachines[item.machine_id]) groupedMachines[item.machine_id] = {};
                    if (!groupedMachines[item.machine_id][monthYear]) groupedMachines[item.machine_id][monthYear] = 0;
                    groupedMachines[item.machine_id][monthYear] += cost;
                } else if ((item.assignment_type === 'other' || item.assignment_type === 'filter') && item.assignment_area) {
                    // 'filter' = Altlast der früheren Split-Funktion, zählt ebenfalls als Bereich
                    const area = item.assignment_area.charAt(0).toUpperCase() + item.assignment_area.slice(1);
                    if (!groupedAreas[area]) groupedAreas[area] = {};
                    if (!groupedAreas[area][monthYear]) groupedAreas[area][monthYear] = 0;
                    groupedAreas[area][monthYear] += cost;
                }
            });

            // Legacy: Belege mit direkter Maschinen-Zuordnung, aber ohne Positionen
            if (items.length === 0 && entry.machine_id) {
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

        // --- Aggregationen für KPIs, Ranking und Trend ---
        const sumVals = obj => Object.values(obj).reduce((s, v) => s + v, 0);
        const machineTotal = Object.values(groupedMachines).reduce((s, o) => s + sumVals(o), 0);
        const areaTotal = Object.values(groupedAreas).reduce((s, o) => s + sumVals(o), 0);
        const grandTotal = machineTotal + areaTotal;

        // Kostenstellen (Maschinen + Bereiche) kombiniert für das Ranking
        const costCenters = [
            ...Object.keys(groupedMachines).map(id => ({ label: window.getMachineName(id), total: sumVals(groupedMachines[id]), color: 'var(--color-primary-green)' })),
            ...Object.keys(groupedAreas).map(a => ({ label: a, total: sumVals(groupedAreas[a]), color: '#6366f1' }))
        ].sort((a, b) => b.total - a.total);
        const topCenter = costCenters[0];

        // Monats-Trend (chronologisch)
        const trendMonths = [...allMonths].reverse();
        const monthTotals = trendMonths.map(m => ({
            month: m,
            total: Object.values(groupedMachines).reduce((s, o) => s + (o[m] || 0), 0)
                 + Object.values(groupedAreas).reduce((s, o) => s + (o[m] || 0), 0)
        }));
        const maxMonthTotal = Math.max(...monthTotals.map(t => t.total), 1);
        const shortMonth = m => {
            const [name, yr] = m.split(' ');
            return name.substring(0, 3) + ' ' + yr.slice(2);
        };

        let html = `
            <div class="acc-eval-kpi-grid">
                <div class="acc-eval-kpi">
                    <div class="acc-eval-kpi-value" style="color: #fff;">${window.formatCurrency(grandTotal)}</div>
                    <div class="acc-eval-kpi-label">Gesamtkosten (netto)</div>
                </div>
                <div class="acc-eval-kpi">
                    <div class="acc-eval-kpi-value" style="color: var(--color-primary-green);">${window.formatCurrency(machineTotal)}</div>
                    <div class="acc-eval-kpi-label">Maschinen (${Object.keys(groupedMachines).length})${grandTotal > 0 ? ' · ' + Math.round(machineTotal / grandTotal * 100) + '%' : ''}</div>
                </div>
                <div class="acc-eval-kpi">
                    <div class="acc-eval-kpi-value" style="color: #818cf8;">${window.formatCurrency(areaTotal)}</div>
                    <div class="acc-eval-kpi-label">Bereiche (${Object.keys(groupedAreas).length})${grandTotal > 0 ? ' · ' + Math.round(areaTotal / grandTotal * 100) + '%' : ''}</div>
                </div>
                <div class="acc-eval-kpi">
                    <div class="acc-eval-kpi-value" style="color: #fbbf24; font-size: 0.95rem; line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(topCenter ? topCenter.label : '-')}">${escapeHtml(topCenter ? topCenter.label : '-')}</div>
                    <div class="acc-eval-kpi-label">Top-Kostenstelle${topCenter ? ' · ' + window.formatCurrency(topCenter.total) : ''}</div>
                </div>
            </div>

            <div class="acc-eval-charts-grid">
                <!-- Kostenstellen-Ranking -->
                <div class="glass-card" style="padding: 1rem 1.25rem;">
                    <h4 style="margin: 0 0 12px 0; color: #fff; font-size: 0.85rem; font-weight: 800; font-family: 'Outfit', sans-serif;">Top Kostenstellen</h4>
                    <div style="display: flex; flex-direction: column; gap: 9px;">
                        ${costCenters.slice(0, 8).map(c => {
                            const pct = Math.round((c.total / costCenters[0].total) * 100);
                            const share = grandTotal > 0 ? Math.round(c.total / grandTotal * 100) : 0;
                            return `
                            <div style="display: flex; flex-direction: column; gap: 3px;">
                                <div style="display: flex; justify-content: space-between; gap: 8px; font-size: 0.72rem; font-weight: 700;">
                                    <span style="color:#fff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(c.label)}</span>
                                    <span style="color: #fff; white-space: nowrap;">${window.formatCurrency(c.total)} <span style="color:#fff; font-weight: 600;">(${share}%)</span></span>
                                </div>
                                <div style="width: 100%; height: 7px; background: rgba(255,255,255,0.05); border-radius: 4px; overflow: hidden;">
                                    <div style="width: ${pct}%; height: 100%; background: ${c.color}; border-radius: 4px; min-width: 2px;"></div>
                                </div>
                            </div>`;
                        }).join('')}
                    </div>
                </div>

                <!-- Monats-Trend -->
                <div class="glass-card" style="padding: 1rem 1.25rem; display: flex; flex-direction: column;">
                    <h4 style="margin: 0 0 12px 0; color: #fff; font-size: 0.85rem; font-weight: 800; font-family: 'Outfit', sans-serif;">Kosten pro Monat</h4>
                    <div class="hide-scrollbar" style="display: flex; align-items: flex-end; gap: 10px; height: 130px; overflow-x: auto; flex: 1; padding-top: 4px;">
                        ${monthTotals.map(t => {
                            // Feste Pixelhöhe: Prozent-Höhen kollabieren hier, weil die
                            // Spalten-Container im Flex-Layout keine definierte Höhe erben
                            const barPx = Math.max(Math.round((t.total / maxMonthTotal) * 85), 3);
                            return `
                            <div style="flex: 1; min-width: 44px; display: flex; flex-direction: column; align-items: center; justify-content: flex-end;">
                                <div style="font-size: 0.62rem; font-weight: 800; color:#fff; margin-bottom: 3px; white-space: nowrap;">${Math.round(t.total).toLocaleString('de-DE')} €</div>
                                <div title="${t.month}: ${window.formatCurrency(t.total)}" style="width: 70%; max-width: 34px; height: ${barPx}px; background: linear-gradient(0deg, #f59e0b 0%, #fbbf24 100%); border-radius: 4px 4px 0 0;"></div>
                                <div style="font-size: 0.6rem; font-weight: 700; color:#fff; margin-top: 5px; white-space: nowrap;">${shortMonth(t.month)}</div>
                            </div>`;
                        }).join('')}
                    </div>
                </div>
            </div>
        `;

        // Render Machine Evaluation
        if (Object.keys(groupedMachines).length > 0) {
            html += `
                <h3 style="color: #60a5fa; margin: 24px 0 12px 0; font-size: 1.1rem; display: flex; align-items: center; gap: 8px;">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg>
                    Auswertung (Maschinen)
                </h3>
                <div style="overflow-x: auto; -webkit-overflow-scrolling: touch; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05); margin-bottom: 24px;">
                    <table class="eval-table" style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="text-align: left; color:#fff; font-size: 0.75rem; text-transform: uppercase;">
                                <th style="padding: 12px;">Maschine</th>
                                ${allMonths.map(m => `<th style="padding: 12px; text-align: right;">${m}</th>`).join('')}
                                <th style="padding: 12px; text-align: right;">Gesamt</th>
                            </tr>
                        </thead>
                        <tbody>
            `;

            Object.keys(groupedMachines)
                .sort((a, b) => sumVals(groupedMachines[b]) - sumVals(groupedMachines[a]))
                .forEach(mId => {
                const machineName = window.getMachineName(mId);
                let rowTotal = 0;
                html += `
                    <tr style="border-top: 1px solid rgba(255,255,255,0.05);">
                        <td style="padding: 12px; font-weight: 700; color: var(--color-primary-green);">${machineName}</td>
                        ${allMonths.map(m => {
                            const val = groupedMachines[mId][m] || 0;
                            rowTotal += val;
                            return `<td style="padding: 12px; text-align: right; color: ${val > 0 ? '#fff' : 'rgba(255,255,255,0.1)'};">${val > 0 ? window.formatCurrency(val) : '-'}</td>`;
                        }).join('')}
                        <td style="padding: 12px; text-align: right; font-weight: 800; background: rgba(255,255,255,0.02);">${window.formatCurrency(rowTotal)}</td>
                    </tr>
                `;
            });
            html += `
                    <tr style="border-top: 2px solid rgba(255,255,255,0.12);">
                        <td style="padding: 12px; font-weight: 800; color: #fff; text-transform: uppercase; font-size: 0.72rem;">Summe</td>
                        ${allMonths.map(m => {
                            const val = Object.values(groupedMachines).reduce((s, o) => s + (o[m] || 0), 0);
                            return `<td style="padding: 12px; text-align: right; font-weight: 800; color: ${val > 0 ? '#fff' : 'rgba(255,255,255,0.15)'};">${val > 0 ? window.formatCurrency(val) : '-'}</td>`;
                        }).join('')}
                        <td style="padding: 12px; text-align: right; font-weight: 900; color: var(--color-primary-green); background: rgba(16,185,129,0.06);">${window.formatCurrency(machineTotal)}</td>
                    </tr>
                </tbody></table></div>`;
        }

        // Render Area Evaluation
        if (Object.keys(groupedAreas).length > 0) {
            html += `
                <h3 style="color: #6366f1; margin: 24px 0 12px 0; font-size: 1.1rem; display: flex; align-items: center; gap: 8px;">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                    Auswertung (Bereich)
                </h3>
                <div style="overflow-x: auto; -webkit-overflow-scrolling: touch; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05);">
                    <table class="eval-table" style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="text-align: left; color:#fff; font-size: 0.75rem; text-transform: uppercase;">
                                <th style="padding: 12px;">Bereich</th>
                                ${allMonths.map(m => `<th style="padding: 12px; text-align: right;">${m}</th>`).join('')}
                                <th style="padding: 12px; text-align: right;">Gesamt</th>
                            </tr>
                        </thead>
                        <tbody>
            `;

            Object.keys(groupedAreas)
                .sort((a, b) => sumVals(groupedAreas[b]) - sumVals(groupedAreas[a]))
                .forEach(area => {
                let rowTotal = 0;
                html += `
                    <tr style="border-top: 1px solid rgba(255,255,255,0.05);">
                        <td style="padding: 12px; font-weight: 700; color: #fff;">${area}</td>
                        ${allMonths.map(m => {
                            const val = groupedAreas[area][m] || 0;
                            rowTotal += val;
                            return `<td style="padding: 12px; text-align: right; color: ${val > 0 ? '#fff' : 'rgba(255,255,255,0.1)'};">${val > 0 ? window.formatCurrency(val) : '-'}</td>`;
                        }).join('')}
                        <td style="padding: 12px; text-align: right; font-weight: 800; background: rgba(255,255,255,0.02);">${window.formatCurrency(rowTotal)}</td>
                    </tr>
                `;
            });
            html += `
                    <tr style="border-top: 2px solid rgba(255,255,255,0.12);">
                        <td style="padding: 12px; font-weight: 800; color: #fff; text-transform: uppercase; font-size: 0.72rem;">Summe</td>
                        ${allMonths.map(m => {
                            const val = Object.values(groupedAreas).reduce((s, o) => s + (o[m] || 0), 0);
                            return `<td style="padding: 12px; text-align: right; font-weight: 800; color: ${val > 0 ? '#fff' : 'rgba(255,255,255,0.15)'};">${val > 0 ? window.formatCurrency(val) : '-'}</td>`;
                        }).join('')}
                        <td style="padding: 12px; text-align: right; font-weight: 900; color: #818cf8; background: rgba(99,102,241,0.08);">${window.formatCurrency(areaTotal)}</td>
                    </tr>
                </tbody></table></div>`;
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

window.toggleAccountingDetails = async function (id, btn, event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    
    const detailsRow = document.getElementById(`details-${id}`);
    const mainRow = document.getElementById(`row-${id}`);
    const content = document.getElementById(`details-content-${id}`);
    const chevron = btn.querySelector('.chevron-icon');

    if (!detailsRow || !content) return;

    // Use a precise check for the hidden state
    const currentlyHidden = detailsRow.classList.contains('hidden');
    
    if (!currentlyHidden) {
        // Collapse
        detailsRow.classList.add('hidden');
        if (chevron) chevron.style.transform = 'rotate(0deg)';
        if (mainRow) mainRow.style.background = 'transparent';
        return;
    }

    // Expand
    detailsRow.classList.remove('hidden');
    if (chevron) chevron.style.transform = 'rotate(90deg)';
    if (mainRow) mainRow.style.background = 'rgba(255,255,255,0.02)';

    renderAccountingDetailsContent(id);
};

// Rendert die Positionsliste eines Belegs in die (bereits geöffnete) Detail-Zeile —
// direkt aus den lokal geladenen Belegdaten (JSONB-Spalte items), ganz ohne DB-Abfrage.
// Als eigene Funktion, damit Split/Revert die Ansicht danach zuverlässig neu aufbauen
// können (der frühere Schließen/Öffnen-Trick scheiterte am Content-Cache in
// toggleAccountingDetails und zeigte veraltete Positionen an).
function renderAccountingDetailsContent(id) {
    const content = document.getElementById(`details-content-${id}`);
    if (!content) return;

    const entry = allAccountingEntries.find(e => e.id === id);
    const rawItems = (entry && Array.isArray(entry.items)) ? entry.items : [];

    if (rawItems.length === 0) {
        content.innerHTML = '<div style="color:#fff; font-size: 0.85rem;">Keine Einzelpositionen für diesen Beleg gefunden.</div>';
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

    // Original-Index merken (für Split/Revert), dann für die Anzeige sortieren,
    // damit zusammengehörige Split-Teile untereinander stehen
    const items = rawItems.map((it, idx) => ({ ...it, _idx: idx }));

    // Split-Gruppen: mehrere Positionen mit gleicher Bezeichnung + gleichem Preis im selben Beleg
    const counts = {};
    items.forEach(i => {
        const key = i.description + '|' + i.price_net;
        counts[key] = (counts[key] || 0) + 1;
    });

    items.sort((a, b) => String(a.description).localeCompare(String(b.description)));

    let currentSplitKey = null;
    let splitGroupIndex = 0;

    items.forEach(item => {
        const qty = parseFloat(item.quantity) || 1;
        const canSplit = qty > 1; // Nur Positionen mit Menge > 1 aufteilen

        const key = item.description + '|' + item.price_net;
        const isSplitPart = counts[key] > 1;

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

        let assignmentText = '-';
        if (item.assignment_type === 'machine' && item.machine_id) {
            assignmentText = window.getMachineName(item.machine_id);
        } else if (item.assignment_area) {
            assignmentText = item.assignment_area;
        } else if (item.machine_id) {
            assignmentText = window.getMachineName(item.machine_id); // legacy fallback
        }

        const splitBadge = isFirstInGroup ? `<span style="margin-left:8px; font-size:0.65rem; color:var(--color-primary-green); background:rgba(16,185,129,0.1); padding:2px 6px; border-radius:4px; border:1px solid rgba(16,185,129,0.2);">Aufgeteilt</span>` : '';

        itemsHtml += `
            <div class="acc-details-row">
                <div data-label="Bezeichnung" style="font-weight: 600; color: #fff; display: flex; align-items: center;">
                    ${isFirstInGroup ? `<svg style="margin-right:6px; color:#fff;" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>` : (isSplitPart ? `<div style="width: 18px;"></div>` : '')}
                    ${item.description} ${splitBadge}
                </div>
                <div data-label="Menge" style="color:#fff; font-weight: 700;">${qty}</div>
                <div data-label="Einheit" style="color:#fff;">${item.unit || '-'}</div>
                <div data-label="Preis" style="text-align: right; font-weight: 700;">${window.formatCurrency(item.price_net)}</div>
                <div data-label="Gesamt" style="text-align: right; font-weight: 800; color: #fff;">${window.formatCurrency((parseFloat(item.price_net) || 0) * qty)}</div>
                <div data-label="Zuordnung" style="padding-left: 1rem; color: var(--color-primary-green); font-weight: 600; font-size: 0.8rem; line-height: 1.2;">${assignmentText}</div>
                <div data-label="Split" style="text-align: center;">
                    ${isFirstInGroup ? `
                    <button onclick='window.revertSplit("${id}", ${item._idx})' title="Aufteilung rückgängig machen"
                        style="width:28px; height:28px; border-radius:8px; background: rgba(239,68,68,0.15); border: 1px solid rgba(239,68,68,0.3); color: #f87171; display:flex; align-items:center; justify-content:center; cursor:pointer; transition: all 0.2s; margin: auto;"
                        onmouseover="this.style.background='rgba(239,68,68,0.3)'" onmouseout="this.style.background='rgba(239,68,68,0.15)'">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3l-3 2.7"/></svg>
                    </button>
                    ` : (isSplitPart ? '' : (canSplit ? `
                    <button onclick='window.openSplitDialog("${id}", ${item._idx})' title="Position aufteilen"
                        style="width:28px; height:28px; border-radius:8px; background: rgba(16,185,129,0.15); border: 1px solid rgba(16,185,129,0.3); color: var(--color-primary-green); display:flex; align-items:center; justify-content:center; cursor:pointer; transition: all 0.2s; margin: auto;"
                        onmouseover="this.style.background='rgba(16,185,129,0.3)'" onmouseout="this.style.background='rgba(16,185,129,0.15)'">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="3" x2="12" y2="8"/><path d="M12 8 L5 21"/><path d="M12 8 L19 21"/><circle cx="12" cy="3" r="2" fill="currentColor"/></svg>
                    </button>` : ''))}
                </div>
            </div>
        `;
    });

    content.innerHTML = itemsHtml;
}

// --- Split Position Logic ---
// Arbeitet direkt auf dem JSONB-Positions-Array des Belegs (accounting.items):
// ein einziges Update des Beleg-Datensatzes statt Delete+Insert einzelner Zeilen.
let currentSplitItem = null; // { accountingId, itemIdx, item }

// Schreibt das neue Positions-Array in die DB und hält die lokale Liste synchron,
// damit die Detail-Ansicht ohne Neuladen sofort den aktuellen Stand zeigt.
async function updateAccountingItemsArray(accountingId, newItems) {
    const { error } = await window.supabaseClient
        .from('accounting')
        .update({ items: newItems })
        .eq('id', accountingId);
    if (error) throw error;
    const entry = allAccountingEntries.find(e => e.id === accountingId);
    if (entry) entry.items = newItems;
}

window.revertSplit = async function(accountingId, itemIdx) {
    const entry = allAccountingEntries.find(e => e.id === accountingId);
    const items = (entry && Array.isArray(entry.items)) ? entry.items : [];
    const item = items[itemIdx];
    if (!item) return;

    if (!confirm('Möchten Sie die Aufteilung dieser Position wirklich rückgängig machen?\nAlle zusammengehörigen Positionen ("' + item.description + '") werden wieder zu einer einzigen Zeile zusammengefasst.')) return;

    try {
        // Alle Split-Teile = gleiche Bezeichnung + gleicher Preis im selben Beleg
        const isPart = p => p.description === item.description && p.price_net === item.price_net;
        const parts = items.filter(isPart);
        if (parts.length === 0) return;

        const totalQty = parts.reduce((s, p) => s + (parseFloat(p.quantity) || 0), 0);
        const merged = {
            description: item.description,
            quantity: totalQty,
            unit: item.unit,
            price_net: item.price_net,
            assignment_type: null,
            assignment_area: null,
            machine_id: null,
            machine_filter: 'all'
        };

        const newItems = items.filter(p => !isPart(p));
        newItems.push(merged);

        await updateAccountingItemsArray(accountingId, newItems);
        renderAccountingDetailsContent(accountingId);
    } catch (err) {
        console.error('Error reverting split:', err);
        alert('Fehler beim Rückgängigmachen der Aufteilung: ' + err.message);
    }
};

window.openSplitDialog = function(accountingId, itemIdx) {
    const entry = allAccountingEntries.find(e => e.id === accountingId);
    const item = (entry && Array.isArray(entry.items)) ? entry.items[itemIdx] : null;
    if (!item) return;

    currentSplitItem = { accountingId, itemIdx, item };
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
            <div style="font-size: 0.75rem; color:#fff; text-transform: uppercase; font-weight: 700; margin-bottom: 4px;">Menge</div>
            <input type="number" step="0.01" class="split-qty glass-form-input" value="${defaults.qty || 0}" style="text-align: center; font-weight: 700; height: 38px; width: 100%;" oninput="window.updateSplitTotal()">
        </div>
    `;

    // Assignment UI (same as in addAccountingItemRow)
    const workshopMachines = (window.machineList || []).filter(m => m.is_in_workshop);
    let workshopOptions = '<option value="">Maschine wählen...</option>' + 
        workshopMachines.map(m => `<option value="${m.id}">${window.getMachineName(m.id)}</option>`).join('');
    
    // Fest definierte Bereiche (Einstellungen > Kategorien > Buchhaltungs-Bereiche)
    const areas = getAssignmentAreas();
    let areaOptions = '<option value="">Bereich wählen...</option>' +
        areas.map(a => `<option value="${a}">${a}</option>`).join('');

    const assignHTML = `
        <div>
            <div style="font-size: 0.75rem; color:#fff; text-transform: uppercase; font-weight: 700; margin-bottom: 4px;">Zuordnung</div>
            <div style="display: flex; align-items: center; gap: 12px;">
                <div style="display: flex; background: rgba(0,0,0,0.3); padding: 3px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05);">
                    <button type="button" class="type-btn mac active" onclick="window.toggleSplitAssignmentType('${rowId}', 'machine')" 
                        style="padding: 5px 12px; border-radius: 6px; border: none; font-size: 0.75rem; font-weight: 700; cursor: pointer; transition: 0.2s; background: var(--color-primary-green); color: white;">
                        Maschine
                    </button>
                    <button type="button" class="type-btn and" onclick="window.toggleSplitAssignmentType('${rowId}', 'other')" 
                        style="padding: 5px 12px; border-radius: 6px; border: none; font-size: 0.75rem; font-weight: 700; cursor: pointer; transition: 0.2s; background: transparent; color:#fff;">
                        Andere
                    </button>
                </div>
                
                <div class="dynamic-assignment-ui" style="flex: 1; display: flex; align-items: center; gap: 12px;">
                    <div class="machine-ui" style="display: flex; align-items: center; gap: 8px; flex: 1;">
                        <div style="display: flex; background: rgba(255,255,255,0.05); padding: 2px; border-radius: 6px;">
                            <button type="button" class="filter-btn all active" onclick="window.toggleSplitMachineFilter('${rowId}', 'all')" 
                                style="padding: 4px 8px; border-radius: 4px; border: none; font-size: 0.7rem; font-weight: 600; cursor: pointer; transition: 0.2s; background: rgba(255,255,255,0.1); color: white;">Alle</button>
                            <button type="button" class="filter-btn wrk" onclick="window.toggleSplitMachineFilter('${rowId}', 'workshop')" 
                                style="padding: 4px 8px; border-radius: 4px; border: none; font-size: 0.7rem; font-weight: 600; cursor: pointer; transition: 0.2s; background: transparent; color:#fff;">Werkstatt</button>
                        </div>
                        <div class="search-input-wrapper" style="position: relative; flex: 1;">
                            <svg style="position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color:#fff;" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
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
                ${m.inventory_number ? `<div style="font-size: 0.7rem; color:#fff;">${m.inventory_number}</div>` : ''}
            </div>
        `).join('');
    } else {
        list.innerHTML = '<div style="padding: 10px; color:#fff; font-size: 0.8rem; text-align: center;">Keine Maschinen gefunden</div>';
    }
};

window.updateSplitTotal = function() {
    if (!currentSplitItem) return;
    
    const rows = document.querySelectorAll('.split-qty');
    let totalDistributed = 0;
    
    rows.forEach(input => {
        totalDistributed += parseFloat(input.value) || 0;
    });
    
    const remaining = (currentSplitItem.item.quantity - totalDistributed).toFixed(2);
    
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
        const { accountingId, itemIdx, item } = currentSplitItem;
        const rows = document.querySelectorAll('.split-row');
        const parts = [];

        rows.forEach(row => {
            const qty = parseFloat(row.querySelector('.split-qty').value) || 0;
            if (qty <= 0) return;

            const assignType = (row.dataset.assignmentType === 'other' || row.dataset.assignmentType === 'filter') ? 'other' : 'machine';
            let assignArea = null;
            let mId = null;

            if (assignType === 'other') {
                assignArea = row.dataset.assignmentArea || null;
            } else {
                mId = (!row.dataset.machineId || row.dataset.machineId === 'undefined') ? null : parseInt(row.dataset.machineId);
            }

            parts.push({
                description: item.description,
                quantity: qty,
                unit: item.unit,
                price_net: item.price_net,
                machine_id: mId,
                assignment_type: assignType,
                assignment_area: assignArea,
                machine_filter: assignType === 'other' ? 'all' : (row.dataset.machineFilter || 'all')
            });
        });

        if (parts.length === 0) throw new Error("Keine validen Positionen.");

        // Original-Position im Array durch die Teile ersetzen — ein einziges Update
        const entry = allAccountingEntries.find(e => e.id === accountingId);
        const items = (entry && Array.isArray(entry.items)) ? [...entry.items] : [];
        items.splice(itemIdx, 1, ...parts);
        await updateAccountingItemsArray(accountingId, items);

        window.closeSplitDialog();
        btn.innerHTML = 'Aufteilen bestätigen';
        btn.disabled = false;

        renderAccountingDetailsContent(accountingId);

    } catch (err) {
        console.error('Error splitting item:', err);
        alert('Fehler beim Aufteilen der Position: ' + err.message);
        btn.innerHTML = 'Aufteilen bestätigen';
        btn.disabled = false;
    }
};

window.setAccountingKpiFilter = function (filterName) {
    if (currentAccountingKpiFilter === filterName) {
        currentAccountingKpiFilter = null; // Clear filter
    } else {
        currentAccountingKpiFilter = filterName;
        // Auto-switch tabs based on filter
        if (filterName === 'open_outgoing') {
            currentAccountingType = 'outgoing';
        } else if (filterName === 'open_incoming' || filterName === 'skonto') {
            currentAccountingType = 'incoming';
        }
    }
    
    // Update tab UI
    document.querySelectorAll('.calendar-tab-btn').forEach(btn => {
        const isActive = (btn.id === `tab-${currentAccountingType}` || btn.id === `tab-${currentAccountingType}-desktop`);
        if (isActive) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    
    renderAccounting();
};

window.renderAccountingCharts = function () {
    const row = document.getElementById('accounting-charts-row');
    if (!row) return;

    // --- Chart 1: Cashflow (incoming vs. outgoing for last 12 months) ---
    const now = new Date();
    const months = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
    const buckets = [];

    for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        buckets.push({
            label: months[d.getMonth()] + ' ' + String(d.getFullYear()).slice(2),
            year: d.getFullYear(),
            month: d.getMonth(),
            incoming: 0,
            outgoing: 0
        });
    }

    allAccountingEntries.forEach(e => {
        if (!e.date) return;
        const d = new Date(e.date);
        const bucket = buckets.find(b => b.year === d.getFullYear() && b.month === d.getMonth());
        if (bucket) {
            const val = parseFloat(e.amount_gross) || 0;
            if (e.type === 'incoming') {
                bucket.incoming += val;
            } else if (e.type === 'outgoing') {
                bucket.outgoing += val;
            }
        }
    });

    const maxVal = Math.max(...buckets.map(b => Math.max(b.incoming, b.outgoing)), 100);
    const fmtEur = (v) => Math.round(v).toLocaleString('de-DE') + ' €';

    const cashflowColsHtml = buckets.map(b => {
        const incPct = Math.round((b.incoming / maxVal) * 100);
        const outPct = Math.round((b.outgoing / maxVal) * 100);
        const balance = b.outgoing - b.incoming;
        const balanceColor = balance >= 0 ? 'var(--color-primary-green)' : '#f87171';
        const balanceText = balance !== 0 ? (balance >= 0 ? '+' : '') + Math.round(balance / 1000) + 'k' : '';

        return `
            <div style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; min-width: 32px;">
                <div style="font-size: 0.62rem; font-weight: 800; color: ${balanceColor}; margin-bottom: 2px; height: 12px; white-space: nowrap;">
                    ${balanceText}
                </div>
                <div style="display: flex; align-items: flex-end; gap: 2px; height: 90px; width: 100%; justify-content: center;">
                    <div title="Ausgang: ${fmtEur(b.outgoing)}" 
                         style="width: 10px; height: ${outPct}%; background: linear-gradient(0deg, #10b981 0%, #34d399 100%); border-radius: 2px 2px 0 0; min-height: 1px;">
                    </div>
                    <div title="Eingang: ${fmtEur(b.incoming)}" 
                         style="width: 10px; height: ${incPct}%; background: linear-gradient(0deg, #ef4444 0%, #f87171 100%); border-radius: 2px 2px 0 0; min-height: 1px;">
                    </div>
                </div>
                <div style="font-size: 0.6rem; font-weight: 700; color:#fff; margin-top: 6px; white-space: nowrap;">
                    ${b.label.split(' ')[0]}
                </div>
            </div>
        `;
    }).join('');

    // Summary calculations
    const totalIncoming = buckets.reduce((s, b) => s + b.incoming, 0);
    const totalOutgoing = buckets.reduce((s, b) => s + b.outgoing, 0);
    const totalBalance = totalOutgoing - totalIncoming;

    // --- Chart 2: Top 5 entities (Suppliers / Customers) ---
    const activeEntries = allAccountingEntries.filter(e => e.type === currentAccountingType);
    const entityVolumeMap = {};
    activeEntries.forEach(e => {
        if (!e.entity) return;
        const amt = parseFloat(e.amount_gross) || 0;
        entityVolumeMap[e.entity] = (entityVolumeMap[e.entity] || 0) + amt;
    });

    const sortedEntities = Object.keys(entityVolumeMap)
        .map(key => ({ name: key, volume: entityVolumeMap[key] }))
        .sort((a, b) => b.volume - a.volume)
        .slice(0, 5);

    const maxEntityVol = sortedEntities.length > 0 ? sortedEntities[0].volume : 100;

    const topEntitiesHtml = sortedEntities.length > 0 ? sortedEntities.map((ent, idx) => {
        const pct = Math.round((ent.volume / maxEntityVol) * 100);
        const rankColor = idx === 0 ? 'var(--color-primary-green)' : (idx === 1 ? '#60a5fa' : 'rgba(255,255,255,0.5)');
        const shortName = ent.name.split(',')[0].trim().substring(0, 20);
        return `
            <div style="display: flex; flex-direction: column; gap: 4px;">
                <div style="display: flex; justify-content: space-between; font-size: 0.72rem; font-weight: 700; color:#fff;">
                    <span style="display: flex; gap: 6px; align-items: center; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                        <span style="color: ${rankColor}; font-weight: 900;">#${idx + 1}</span>
                        ${escapeHtml(shortName)}
                    </span>
                    <span style="font-weight: 800; color: #fff;">${fmtEur(ent.volume)}</span>
                </div>
                <div style="width: 100%; height: 8px; background: rgba(255,255,255,0.05); border-radius: 4px; overflow: hidden;">
                    <div style="width: ${pct}%; height: 100%; background: linear-gradient(90deg, ${idx % 2 === 0 ? '#10b981' : '#3b82f6'}, ${idx % 2 === 0 ? '#34d399' : '#60a5fa'}); border-radius: 4px;"></div>
                </div>
            </div>
        `;
    }).join('') : `<div style="padding: 2rem 0; text-align: center; color: rgba(255,255,255,0.25); font-style: italic; font-size: 0.85rem;">Keine Rechnungsdaten vorhanden.</div>`;

    // --- Chart 3: Paid vs Unpaid Distribution ---
    const paidSum = activeEntries.filter(e => e.is_paid).reduce((s, e) => s + (parseFloat(e.amount_gross) || 0), 0);
    const unpaidSum = activeEntries.filter(e => !e.is_paid).reduce((s, e) => s + (parseFloat(e.amount_gross) || 0), 0);
    const totalSum = paidSum + unpaidSum;

    const paidPct = totalSum > 0 ? Math.round((paidSum / totalSum) * 100) : 0;
    const unpaidPct = totalSum > 0 ? Math.round((unpaidSum / totalSum) * 100) : 0;

    row.innerHTML = `
        <!-- Card 1: Cashflow -->
        <div class="glass-card" style="padding: 1.25rem; display: flex; flex-direction: column; gap: 0.75rem; min-height: 240px;">
            <div>
                <h3 style="margin: 0; color: #fff; font-size: 0.95rem; font-weight: 800; font-family: 'Outfit', sans-serif;">Finanz- & Cashflow-Übersicht</h3>
                <p style="margin: 2px 0 0 0; font-size: 0.72rem; color:#fff; font-weight: 600;">Letzte 12 Monate · Einnahmen vs. Ausgaben</p>
            </div>
            
            <div class="hide-scrollbar" style="display: flex; align-items: flex-end; justify-content: space-between; gap: 8px; height: 120px; overflow-x: auto; padding-top: 5px;">
                ${cashflowColsHtml}
            </div>
            
            <div style="height: 1px; background: rgba(255,255,255,0.06); margin: 2px 0;"></div>
            
            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.78rem;">
                <span style="color:#fff; font-weight: 600;">Netto-Bilanz gesamt:</span>
                <span style="font-weight: 900; color: ${totalBalance >= 0 ? 'var(--color-primary-green)' : '#f87171'};">${fmtEur(totalBalance)}</span>
            </div>
        </div>

        <!-- Card 2: Top Entities -->
        <div class="glass-card" style="padding: 1.25rem; display: flex; flex-direction: column; gap: 0.75rem; min-height: 240px;">
            <div>
                <h3 style="margin: 0; color: #fff; font-size: 0.95rem; font-weight: 800; font-family: 'Outfit', sans-serif;">
                    Top 5 ${currentAccountingType === 'incoming' ? 'Lieferanten (Ausgaben)' : 'Kunden (Einnahmen)'}
                </h3>
                <p style="margin: 2px 0 0 0; font-size: 0.72rem; color:#fff; font-weight: 600;">Gesamtvolumen brutto</p>
            </div>
            
            <div style="display: flex; flex-direction: column; gap: 10px; flex: 1; justify-content: center;">
                ${topEntitiesHtml}
            </div>
        </div>

        <!-- Card 3: Paid vs Unpaid Distribution -->
        <div class="glass-card" style="padding: 1.25rem; display: flex; flex-direction: column; gap: 0.75rem; min-height: 240px;">
            <div>
                <h3 style="margin: 0; color: #fff; font-size: 0.95rem; font-weight: 800; font-family: 'Outfit', sans-serif;">Statusverteilung nach Volumen</h3>
                <p style="margin: 2px 0 0 0; font-size: 0.72rem; color:#fff; font-weight: 600;">Aufteilung der Belegsummen (${currentAccountingType === 'incoming' ? 'Ausgaben' : 'Einnahmen'})</p>
            </div>
            
            <div style="display: flex; flex-direction: column; gap: 14px; flex: 1; justify-content: center;">
                <div style="display: flex; flex-direction: column; gap: 4px;">
                    <div style="display: flex; justify-content: space-between; font-size: 0.75rem; font-weight: 700;">
                        <span style="color: var(--color-primary-green); display: flex; align-items: center; gap: 4px;">
                            <span style="width: 8px; height: 8px; background: var(--color-primary-green); border-radius: 2px;"></span>
                            Bezahlt (${paidPct}%)
                        </span>
                        <span style="color: #fff; font-weight: 800;">${fmtEur(paidSum)}</span>
                    </div>
                    <div style="width: 100%; height: 8px; background: rgba(255,255,255,0.05); border-radius: 4px; overflow: hidden;">
                        <div style="width: ${paidPct}%; height: 100%; background: linear-gradient(90deg, #10b981, #34d399); border-radius: 4px;"></div>
                    </div>
                </div>

                <div style="display: flex; flex-direction: column; gap: 4px;">
                    <div style="display: flex; justify-content: space-between; font-size: 0.75rem; font-weight: 700;">
                        <span style="color: #ef4444; display: flex; align-items: center; gap: 4px;">
                            <span style="width: 8px; height: 8px; background: #ef4444; border-radius: 2px;"></span>
                            Offen (${unpaidPct}%)
                        </span>
                        <span style="color: #fff; font-weight: 800;">${fmtEur(unpaidSum)}</span>
                    </div>
                    <div style="width: 100%; height: 8px; background: rgba(255,255,255,0.05); border-radius: 4px; overflow: hidden;">
                        <div style="width: ${unpaidPct}%; height: 100%; background: linear-gradient(90deg, #ef4444, #f87171); border-radius: 4px;"></div>
                    </div>
                </div>
            </div>
            
            <div style="height: 1px; background: rgba(255,255,255,0.06); margin: 2px 0;"></div>
            
            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.78rem;">
                <span style="color:#fff; font-weight: 600;">Volumen gesamt:</span>
                <span style="font-weight: 900; color: #fff;">${fmtEur(totalSum)}</span>
            </div>
        </div>
    `;
};

window.renderYoYComparison = function () {
    const grid = document.getElementById('accounting-yoy-grid');
    if (!grid) return;

    // Determine target year
    let targetYear = new Date().getFullYear();
    if (selectedAccountingYear && selectedAccountingYear !== 'alle') {
        targetYear = typeof selectedAccountingYear === 'number' ? selectedAccountingYear : parseInt(selectedAccountingYear);
    }
    const prevYear = targetYear - 1;

    // Outgoing (Einnahmen)
    const outCur = allAccountingEntries.filter(e => e.type === 'outgoing' && new Date(e.date).getFullYear() === targetYear).reduce((s, e) => s + (parseFloat(e.amount_gross) || 0), 0);
    const outPrev = allAccountingEntries.filter(e => e.type === 'outgoing' && new Date(e.date).getFullYear() === prevYear).reduce((s, e) => s + (parseFloat(e.amount_gross) || 0), 0);

    // Incoming (Ausgaben)
    const incCur = allAccountingEntries.filter(e => e.type === 'incoming' && new Date(e.date).getFullYear() === targetYear).reduce((s, e) => s + (parseFloat(e.amount_gross) || 0), 0);
    const incPrev = allAccountingEntries.filter(e => e.type === 'incoming' && new Date(e.date).getFullYear() === prevYear).reduce((s, e) => s + (parseFloat(e.amount_gross) || 0), 0);

    // Profit (Bilanz)
    const profitCur = outCur - incCur;
    const profitPrev = outPrev - incPrev;

    const fmtEur = (v) => Math.round(v).toLocaleString('de-DE') + ' €';

    const getTrendBadge = (cur, prev, isProfit = false) => {
        if (prev === 0) return `<span style="font-size:0.72rem; color:#fff; font-weight:700;">Keine VJ-Daten</span>`;
        const diffPct = ((cur - prev) / Math.abs(prev)) * 100;
        const dir = diffPct >= 0 ? '+' : '';
        let color = '#10b981'; // Green
        if (diffPct < 0) {
            color = '#f87171'; // Red
        }
        
        // If it's expenses (Incoming), lower expenses is better!
        if (!isProfit && cur < prev && cur !== 0 && prev !== 0 && cur === incCur) {
            color = '#10b981'; // Expenses went down -> Green!
        } else if (!isProfit && cur > prev && cur === incCur) {
            color = '#f87171'; // Expenses went up -> Red!
        }

        return `<span style="font-size: 0.75rem; font-weight: 800; color: ${color}; background: ${color}1a; border: 1px solid ${color}33; padding: 2px 8px; border-radius: 99px;">${dir}${Math.round(diffPct)}% vs. VJ</span>`;
    };

    grid.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px;">
            <!-- Einnahmen (YoY) -->
            <div class="glass-card" style="padding: 1.25rem; display: flex; flex-direction: column; gap: 8px; border: 1px solid rgba(255,255,255,0.06);">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-size: 0.75rem; font-weight: 700; color:#fff; text-transform: uppercase; letter-spacing: 0.5px;">Einnahmen (YoY)</span>
                    ${getTrendBadge(outCur, outPrev)}
                </div>
                <div style="font-size: 1.5rem; font-weight: 900; color: var(--color-primary-green); font-family: 'Outfit', sans-serif; margin-top: 4px;">
                    ${fmtEur(outCur)}
                </div>
                <div style="font-size: 0.78rem; color:#fff; font-weight: 600;">
                    Vorjahr (${prevYear}): <span style="color:#fff; font-weight: 700;">${fmtEur(outPrev)}</span>
                </div>
            </div>

            <!-- Ausgaben (YoY) -->
            <div class="glass-card" style="padding: 1.25rem; display: flex; flex-direction: column; gap: 8px; border: 1px solid rgba(255,255,255,0.06);">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-size: 0.75rem; font-weight: 700; color:#fff; text-transform: uppercase; letter-spacing: 0.5px;">Ausgaben (YoY)</span>
                    ${getTrendBadge(incCur, incPrev)}
                </div>
                <div style="font-size: 1.5rem; font-weight: 900; color: #f87171; font-family: 'Outfit', sans-serif; margin-top: 4px;">
                    ${fmtEur(incCur)}
                </div>
                <div style="font-size: 0.78rem; color:#fff; font-weight: 600;">
                    Vorjahr (${prevYear}): <span style="color:#fff; font-weight: 700;">${fmtEur(incPrev)}</span>
                </div>
            </div>

            <!-- Netto-Ergebnis (YoY) -->
            <div class="glass-card" style="padding: 1.25rem; display: flex; flex-direction: column; gap: 8px; border: 1px solid rgba(255,255,255,0.06);">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-size: 0.75rem; font-weight: 700; color:#fff; text-transform: uppercase; letter-spacing: 0.5px;">Netto-Bilanz (YoY)</span>
                    ${getTrendBadge(profitCur, profitPrev, true)}
                </div>
                <div style="font-size: 1.5rem; font-weight: 900; color: ${profitCur >= 0 ? 'var(--color-primary-green)' : '#f87171'}; font-family: 'Outfit', sans-serif; margin-top: 4px;">
                    ${fmtEur(profitCur)}
                </div>
                <div style="font-size: 0.78rem; color:#fff; font-weight: 600;">
                    Vorjahr (${prevYear}): <span style="color:#fff; font-weight: 700;">${fmtEur(profitPrev)}</span>
                </div>
            </div>
        </div>
    `;
};
