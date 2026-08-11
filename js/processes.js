/* ========================================================= */
/* =================== PROCESSSES MODULE =================== */
/* ========================================================= */

// Vorgangs-Typ Metadaten: Icon, Farbe & Label je process_type
window.PROCESS_TYPE_INFO = {
    email_incoming: { label: 'E-Mail Eingang', color: '#60a5fa', bg: 'rgba(59, 130, 246, 0.15)', border: 'rgba(59, 130, 246, 0.3)', icon: '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline>' },
    email_outgoing: { label: 'E-Mail Ausgang', color: '#a78bfa', bg: 'rgba(167, 139, 250, 0.15)', border: 'rgba(167, 139, 250, 0.3)', icon: '<line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>' },
    note: { label: 'Interne Notiz', color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.15)', border: 'rgba(251, 191, 36, 0.3)', icon: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline>' },
    call: { label: 'Telefonat', color: '#34d399', bg: 'rgba(52, 211, 153, 0.15)', border: 'rgba(52, 211, 153, 0.3)', icon: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>' },
    appointment: { label: 'Termin / Besuch', color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.15)', border: 'rgba(56, 189, 248, 0.3)', icon: '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line>' },
    repair: { label: 'Reparatur', color: '#f87171', bg: 'rgba(248, 113, 113, 0.15)', border: 'rgba(248, 113, 113, 0.3)', icon: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94z"></path>' },
    maintenance: { label: 'Wartung', color: '#fb923c', bg: 'rgba(251, 146, 60, 0.15)', border: 'rgba(251, 146, 60, 0.3)', icon: '<circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>' },
    offer: { label: 'Angebot', color: '#facc15', bg: 'rgba(250, 204, 21, 0.15)', border: 'rgba(250, 204, 21, 0.3)', icon: '<path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>' },
    order: { label: 'Bestellung', color: '#818cf8', bg: 'rgba(129, 140, 248, 0.15)', border: 'rgba(129, 140, 248, 0.3)', icon: '<circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>' },
    complaint: { label: 'Reklamation', color: '#fb7185', bg: 'rgba(251, 113, 133, 0.15)', border: 'rgba(251, 113, 133, 0.3)', icon: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line>' },
    other: { label: 'Sonstiges', color: '#cbd5e1', bg: 'rgba(203, 213, 225, 0.15)', border: 'rgba(203, 213, 225, 0.3)', icon: '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line>' },
    manual: { label: 'Manuell', color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.15)', border: 'rgba(148, 163, 184, 0.3)', icon: '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="12" y2="12"></line>' }
};

// Alter eines Vorgangs in Tagen (bezogen auf process_date)
window.getProcessAgeDays = function (p) {
    if (!p.process_date) return null;
    const d = new Date(p.process_date); d.setHours(0, 0, 0, 0);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return Math.round((today - d) / 86400000);
};

window.fetchProcesses = async function() {
    if (!window.supabaseClient) return;
    
    try {
        let { data, error } = await window.supabaseClient
            .from('internal_processes')
            .select('*, machines(id, name, manufacturer, serial, year, company, operator_city), customers(id, name)')
            .order('process_date', { ascending: false });

        if (error) {
            console.warn('Vorgänge-Join auf customers fehlgeschlagen, lade ohne Adressbezug:', error.message);
            ({ data, error } = await window.supabaseClient
                .from('internal_processes')
                .select('*, machines(id, name, manufacturer, serial, year, company, operator_city)')
                .order('process_date', { ascending: false }));
        }

        if (error) throw error;

        const processes = data || [];

        const linkedIds = [...new Set(processes.map(p => p.linked_service_report_id).filter(Boolean))];
        if (linkedIds.length > 0) {
            try {
                const { data: linkedReports, error: linkErr } = await window.supabaseClient
                    .from('service_entries')
                    .select('id, title, date, is_finalized')
                    .in('id', linkedIds);
                if (!linkErr && linkedReports) {
                    const byId = {};
                    linkedReports.forEach(r => { byId[r.id] = r; });
                    processes.forEach(p => { p.service_entries = p.linked_service_report_id ? (byId[p.linked_service_report_id] || null) : null; });
                }
            } catch (linkErr) {
                console.warn('Verknuepfte Serviceberichte konnten nicht geladen werden:', linkErr);
            }
        }

        window.eventsState.processes = processes;
        window.renderProcesses();
    } catch (err) {
        console.error("Error loading internal processes:", err);
        const container = document.getElementById('processes-list-container');
        if (container) {
            container.innerHTML = `<div style="text-align:center; color: #f87171; padding: 2rem;">Fehler beim Laden der Vorgänge: ${err.message}</div>`;
        }
    }
};

window.toggleProcessKpiFilter = function (status) {
    const next = (window.eventsState.processStatusFilter === status) ? 'all' : status;
    window.setProcessStatusFilter(next);
};

window.renderProcesses = function(targetId, opts) {
    opts = opts || {};
    if (!targetId) {
        ['processes-list-container', 'standalone-processes-container'].forEach(id => {
            if (document.getElementById(id)) window.renderProcesses(id);
        });
        return;
    }
    const container = document.getElementById(targetId);
    if (!container) return;

    // In der Vorgänge-Ansicht bleibt der "Meine Vorgänge"-Tab auch bei einem
    // Neuaufbau ohne opts erhalten.
    if (targetId === 'standalone-processes-container' && !opts.onlyAssignedTo && window.isMyProcessesFilterActive) {
        opts = Object.assign({}, opts, {
            onlyAssignedTo: window.activeUser?.id || localStorage.getItem('activeUserId') || window.activeUser?.name
        });
    }

    const searchQuery = (document.getElementById('calendar-search-input')?.value || '').toLowerCase();
    const statusFilter = opts.compact ? 'all' : window.eventsState.processStatusFilter;

    let base = window.eventsState.processes || [];
    if (opts.onlyAssignedTo) {
        const targetStr = String(opts.onlyAssignedTo).toLowerCase().trim();
        const activeName = (window.activeUser?.name || '').toLowerCase().trim();
        base = base.filter(p => Array.isArray(p.assigned_users) && p.assigned_users.some(u => {
            const uStr = String(u).toLowerCase().trim();
            return uStr === targetStr || (activeName && uStr === activeName);
        }));
    }

    if (searchQuery) {
        base = base.filter(p =>
            (p.title && p.title.toLowerCase().includes(searchQuery)) ||
            (p.sender && p.sender.toLowerCase().includes(searchQuery)) ||
            (p.recipient && p.recipient.toLowerCase().includes(searchQuery)) ||
            (p.description && p.description.toLowerCase().includes(searchQuery)) ||
            (p.remark && p.remark.toLowerCase().includes(searchQuery))
        );
    }

    const isStale = p => {
        const age = window.getProcessAgeDays(p);
        return p.status !== 'erledigt' && age !== null && age > 7;
    };

    let filtered = base;
    if (statusFilter === 'stale') {
        filtered = base.filter(isStale);
    } else if (statusFilter !== 'all') {
        filtered = base.filter(p => p.status === statusFilter);
    }

    const counts = {
        offen: base.filter(p => p.status === 'offen').length,
        in_bearbeitung: base.filter(p => p.status === 'in_bearbeitung').length,
        erledigt: base.filter(p => p.status === 'erledigt').length,
        stale: base.filter(isStale).length
    };

    let html = '';

    const kpiActive = s => statusFilter === s ? ' active' : '';
    if (!opts.compact) html += `
        <div class="maint-kpi-grid">
            <div class="maint-kpi-tile${kpiActive('offen')}" onclick="window.toggleProcessKpiFilter('offen')" title="Nur offene Vorgänge anzeigen">
                <div class="maint-kpi-value" style="color: #ef4444;">${counts.offen}</div>
                <div class="maint-kpi-label">Offen</div>
            </div>
            <div class="maint-kpi-tile${kpiActive('in_bearbeitung')}" onclick="window.toggleProcessKpiFilter('in_bearbeitung')" title="Nur Vorgänge in Bearbeitung anzeigen">
                <div class="maint-kpi-value" style="color: #f59e0b;">${counts.in_bearbeitung}</div>
                <div class="maint-kpi-label">In Arbeit</div>
            </div>
            <div class="maint-kpi-tile${kpiActive('erledigt')}" onclick="window.toggleProcessKpiFilter('erledigt')" title="Nur erledigte Vorgänge anzeigen">
                <div class="maint-kpi-value" style="color: #10b981;">${counts.erledigt}</div>
                <div class="maint-kpi-label">Erledigt</div>
            </div>
            <div class="maint-kpi-tile${kpiActive('stale')}" onclick="window.toggleProcessKpiFilter('stale')" title="Unerledigte Vorgänge, die älter als 7 Tage sind">
                <div class="maint-kpi-value" style="color: #F87171;">${counts.stale}</div>
                <div class="maint-kpi-label">&gt; 7 Tage offen</div>
            </div>
        </div>
    `;

    const now = new Date();
    const monthBuckets = [];
    for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        monthBuckets.push({
            label: d.toLocaleDateString('de-DE', { month: 'short' }) + (d.getMonth() === 0 || i === 5 ? ' ' + String(d.getFullYear()).slice(2) : ''),
            year: d.getFullYear(),
            month: d.getMonth(),
            done: 0,
            open: 0
        });
    }
    base.forEach(p => {
        if (!p.process_date) return;
        const d = new Date(p.process_date);
        const bucket = monthBuckets.find(b => b.year === d.getFullYear() && b.month === d.getMonth());
        if (!bucket) return;
        if (p.status === 'erledigt') bucket.done++; else bucket.open++;
    });

    const typeCounts = {};
    base.forEach(p => {
        const key = window.PROCESS_TYPE_INFO[p.process_type] ? p.process_type : 'manual';
        typeCounts[key] = (typeCounts[key] || 0) + 1;
    });

    if (filtered.length === 0) {
        html += `
            <div style="padding: 3rem 2rem; text-align: center; border-radius: 12px; background: rgba(255,255,255,0.01); border: 1px dashed rgba(255,255,255,0.08);">
                <p style="color: #fff; font-size: 1rem; margin: 0;">Keine internen Vorgänge gefunden.</p>
            </div>
        `;
        container.innerHTML = html;
        return;
    }

    const openCards = [];
    const doneCards = [];
    filtered.forEach(p => {
        const typeInfo = window.PROCESS_TYPE_INFO[p.process_type] || window.PROCESS_TYPE_INFO.manual;
        const typeHtml = `<span title="${typeInfo.label}" style="color: ${typeInfo.color}; display: inline-flex; align-items: center; justify-content: center; background: ${typeInfo.bg}; width: 36px; height: 36px; border-radius: 10px; border: 1px solid ${typeInfo.border};">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${typeInfo.icon}</svg>
            </span>`;
        
        let statusBadge = '';
        let statusColor = '#10b981';
        if (p.status === 'offen') {
            statusColor = '#ef4444';
            statusBadge = `<span style="font-size: 0.86rem; padding: 6px 14px; border-radius: 8px; background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px;">Offen</span>`;
        } else if (p.status === 'in_bearbeitung') {
            statusColor = '#f59e0b';
            statusBadge = `<span style="font-size: 0.86rem; padding: 6px 14px; border-radius: 8px; background: rgba(245, 158, 11, 0.15); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.3); font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px;">In Arbeit</span>`;
        } else {
            statusColor = '#10b981';
            statusBadge = `<span style="font-size: 0.86rem; padding: 6px 14px; border-radius: 8px; background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3); font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px;">Erledigt</span>`;
        }

        const statusCell = `
            <div class="process-status-wrapper" style="position: relative; display: inline-block;">
                <div onclick="window.toggleProcessStatusMenu(event, '${p.id}')" style="cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">
                    ${statusBadge}
                </div>
                <div class="process-status-menu" id="process-status-menu-${p.id}" style="display: none; position: absolute; top: 100%; left: 50%; transform: translateX(-50%); margin-top: 6px; z-index: 50; min-width: 140px;">
                    <div onclick="window.setProcessStatus('${p.id}', 'offen')" style="padding: 8px 12px; border-radius: 6px; cursor: pointer; font-size: 0.75rem; font-weight: 800; color: #ef4444; text-transform: uppercase; letter-spacing: 0.5px; transition: background 0.15s;" onmouseover="this.style.background='rgba(239,68,68,0.15)'" onmouseout="this.style.background='transparent'">Offen</div>
                    <div onclick="window.setProcessStatus('${p.id}', 'in_bearbeitung')" style="padding: 8px 12px; border-radius: 6px; cursor: pointer; font-size: 0.75rem; font-weight: 800; color: #f59e0b; text-transform: uppercase; letter-spacing: 0.5px; transition: background 0.15s;" onmouseover="this.style.background='rgba(245,158,11,0.15)'" onmouseout="this.style.background='transparent'">In Arbeit</div>
                    <div onclick="window.setProcessStatus('${p.id}', 'erledigt')" style="padding: 8px 12px; border-radius: 6px; cursor: pointer; font-size: 0.75rem; font-weight: 800; color: #10b981; text-transform: uppercase; letter-spacing: 0.5px; transition: background 0.15s;" onmouseover="this.style.background='rgba(16,185,129,0.15)'" onmouseout="this.style.background='transparent'">Erledigt</div>
                </div>
            </div>
        `;

        let machineCell = '<span style="color: rgba(255,255,255,0.3); font-style: italic;">Nicht verknüpft</span>';
        if (p.machines) {
            const m = p.machines;
            const serialYear = `${m.serial ? `#${m.serial}` : ''}${m.year ? ` (${m.year})` : ''}`.trim();
            machineCell = `<div style="color: #34d399; font-weight: 800; font-size: 1.06rem; line-height: 1.2; word-break: break-word;">${m.manufacturer} ${m.name}${serialYear ? ` <span style="opacity: 0.8; font-weight: 700; font-size: 0.9rem; text-transform: uppercase;">${serialYear}</span>` : ''}</div>
                ${m.company ? `<div style="color: rgba(255,255,255,0.7); font-weight: 700; font-size: 0.9rem; margin-top: 4px; display: flex; align-items: center; gap: 5px; word-break: break-word;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>${m.company}</div>` : ''}`;
        } else if (p.workshop_order_number) {
            machineCell = `<div style="color: #60a5fa; font-weight: 800; font-size: 1.06rem; white-space: normal; word-break: break-word; line-height: 1.2;">Werkstattauftrag</div>
                <div style="color: #60a5fa; opacity: 0.8; font-weight: 700; font-size: 0.9rem; text-transform: uppercase; margin-top: 2px;">${p.workshop_order_number}</div>`;
        } else if (p.customers || p.customer_id) {
            const addrName = (p.customers && p.customers.name) || 'Adresse';
            machineCell = `<div style="display: inline-flex; align-items: center; gap: 7px; color: #a78bfa; font-weight: 800; font-size: 1.02rem; line-height: 1.25; word-break: break-word; background: rgba(167,139,250,0.14); border: 1px solid rgba(167,139,250,0.45); border-radius: 10px; padding: 6px 12px; max-width: 100%;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                    ${addrName}
                </div>
                ${p.contact_name ? `<div style="color: rgba(255,255,255,0.7); font-weight: 700; font-size: 0.9rem; margin-top: 4px;">${p.contact_name}</div>` : ''}`;
        }
        
        let dateStr = '-';
        let timeStr = '';
        let hasDate = false;
        if (p.process_date) {
            const d = new Date(p.process_date);
            dateStr = d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
            timeStr = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
            hasDate = true;
        }
        
        const cleanTitle = p.title || 'Unbenannter Vorgang';
        let senderRecText = '';
        if (p.sender) senderRecText += `Von: ${p.sender}`;
        if (p.recipient) senderRecText += (senderRecText ? ' | ' : '') + `An: ${p.recipient}`;

        let assignedHtml = '';
        if (Array.isArray(p.assigned_users) && p.assigned_users.length > 0) {
            const users = window.userList || [];
            assignedHtml = `<div style="display: flex; gap: 4px; flex-wrap: wrap; justify-content: center;">` +
                p.assigned_users.map(uid => {
                    const u = users.find(u => String(u.id) === String(uid));
                    if (!u) return '';
                    const initials = u.initials || u.name.substring(0, 2).toUpperCase();
                    const color = u.color || '#666';
                    return `<div title="${u.name}" style="width:24px; height:24px; border-radius:50%; background:${color}; display:flex; align-items:center; justify-content:center; font-size:0.69rem; font-weight:800; color:#fff; flex-shrink:0;">${initials}</div>`;
                }).join('') +
                `</div>`;
        }

        const procSteps = Array.isArray(p.steps) ? p.steps : [];
        const stepsDone = procSteps.filter(s => s.done).length;
        const escStep = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const fmtDay = (d) => { try { return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }); } catch (e) { return ''; } };
        let remindBadge = '';
        if (p.remind_at && p.status !== 'erledigt') {
            const rd = new Date(p.remind_at);
            if (!isNaN(rd)) {
                const diffDays = Math.round((new Date(rd).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86400000);
                const rc = diffDays < 0 ? '#f87171' : (diffDays <= 3 ? '#fbbf24' : 'rgba(255,255,255,0.55)');
                const rlabel = diffDays < 0 ? 'Erinnerung überfällig' : (diffDays === 0 ? 'Erinnerung heute' : 'Erinnerung');
                remindBadge = `<div style="margin-bottom: 8px;"><span style="display:inline-flex; align-items:center; gap:5px; color:${rc}; border:1px solid ${rc}55; background:${rc}18; padding:3px 9px; border-radius:999px; font-size:0.75rem; font-weight:700;">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><polyline points="12 7 12 12 15 14"></polyline></svg>
                    ${rlabel} ${rd.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                </span></div>`;
            }
        }

        const stepsCardHtml = `
            <div class="proc-card-steps" onmousemove="const _pop=this.querySelector('.proc-steps-pop'); if(_pop){ const _r=this.getBoundingClientRect(); _pop.style.display = ((event.clientX - _r.left) < _r.width/2) ? 'block' : 'none'; }" onmouseleave="const _pop=this.querySelector('.proc-steps-pop'); if(_pop) _pop.style.display='none';" style="position:relative; display:block; margin-bottom:8px;">
                <div class="proc-steps-trigger" style="display:inline-flex; align-items:center; gap:6px; font-size:0.82rem; font-weight:800; color:#34d399; text-transform:uppercase; letter-spacing:0.5px; cursor:default; padding:2px 0;">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
                    Schritte <span class="proc-steps-trigger-count" style="opacity:0.7;">${stepsDone}/${procSteps.length}</span>
                </div>
                ${procSteps.length ? `<div class="proc-steps-pop" style="display:none; position:absolute; top:100%; left:0; right:0; z-index:60; margin-top:4px; background:rgba(15,23,42,0.98); border:1px solid rgba(255,255,255,0.12); border-radius:12px; padding:8px; box-shadow:0 12px 40px rgba(0,0,0,0.6);">
                    ${procSteps.map((s, i) => {
                        const createdMetaS = (s.created_by || s.created_at) ? `erstellt${s.created_by ? ` von ${escStep(s.created_by)}` : ''}${s.created_at ? ` am ${fmtDay(s.created_at)}` : ''}` : '';
                        const doneMetaS = (s.done && s.done_at) ? `✓ ${s.done_by ? escStep(s.done_by) : ''}${s.done_by ? ' · ' : ''}${fmtDay(s.done_at)}` : '';
                        return `
                    <div class="proc-step-crow" style="display:flex; align-items:flex-start; gap:8px; padding:6px 8px; border-radius:8px;">
                        <span style="flex-shrink:0; color:rgba(255,255,255,0.4); font-weight:800; font-size:0.75rem; width:16px; padding-top:2px;">${i + 1}</span>
                        <span class="proc-step-check" onclick="window.toggleProcessCardStep('${p.id}', ${i}, event)" title="Abhaken" style="flex-shrink:0; width:20px; height:20px; border-radius:5px; border:2px solid ${s.done ? '#10b981' : 'rgba(255,255,255,0.3)'}; background:${s.done ? '#10b981' : 'transparent'}; display:flex; align-items:center; justify-content:center; cursor:pointer; margin-top:1px;">${s.done ? '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>' : ''}</span>
                        <div style="flex:1; min-width:0;">
                            <span class="proc-step-label" contenteditable="true" onclick="event.stopPropagation()" onkeydown="if(event.key==='Enter'){event.preventDefault(); this.blur();}" onblur="this.style.background='transparent'; window.updateProcessCardStepText('${p.id}', ${i}, this.textContent)" title="Klicken zum Bearbeiten" style="display:block; color:#fff; font-size:0.9rem; text-decoration:${s.done ? 'line-through' : 'none'}; opacity:${s.done ? '0.5' : '1'}; outline:none; border-radius:4px; padding:2px 4px; cursor:text;" onfocus="this.style.background='rgba(255,255,255,0.08)'">${escStep(s.text)}</span>
                            ${createdMetaS ? `<div class="proc-step-created-meta" style="font-size:0.6rem; color:rgba(255,255,255,0.3); margin-top:1px; padding:0 4px;">${createdMetaS}</div>` : ''}
                            ${doneMetaS ? `<div class="proc-step-meta" style="font-size:0.6rem; color:rgba(16,185,129,0.6); margin-top:1px; padding:0 4px;">${doneMetaS}</div>` : ''}
                        </div>
                    </div>`;
                    }).join('')}
                </div>` : ''}
            </div>`;

        let serviceLinkHtml = '';
        if (p.service_entries) {
            const sr = p.service_entries;
            const srDate = sr.date ? new Date(sr.date).toLocaleDateString('de-DE') : '';
            serviceLinkHtml = `
                <div onclick="event.stopPropagation(); window.jumpToServicebericht(${sr.id})" title="Zum Servicebericht springen"
                    style="cursor:pointer; display:inline-flex; align-items:center; gap:6px; margin-bottom:8px; background:rgba(16,185,129,0.12); border:1px solid rgba(16,185,129,0.4); color:var(--color-primary-green); border-radius:20px; padding:5px 12px; font-size:0.8rem; font-weight:700; max-width:100%;">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
                    <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${sr.title || 'Servicebericht'}${srDate ? ` — ${srDate}` : ''}</span>
                </div>`;
        }

        const ageDays = window.getProcessAgeDays(p);
        const ageBadge = (p.status !== 'erledigt' && ageDays !== null && ageDays > 7)
            ? `<span style="font-size: 0.68rem; padding: 3px 9px; border-radius: 6px; background: rgba(248,113,113,0.14); color: #F87171; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; white-space: nowrap;">seit ${ageDays} Tagen</span>`
            : '';

        const cardHtml = `
            <div class="proc-card" style="border-left-color: ${statusColor};">
                <div class="proc-card-head">
                    ${typeHtml}
                    <div class="proc-card-headmain">
                        <div class="proc-card-title">${cleanTitle}</div>
                        <div class="proc-card-meta">${typeInfo.label}${hasDate ? ` &middot; ${dateStr}, ${timeStr} Uhr` : ''}</div>
                    </div>
                    <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 6px; flex-shrink: 0;">
                        ${statusCell}
                        ${ageBadge}
                    </div>
                </div>
                <div class="proc-card-machine">${machineCell}</div>
                ${remindBadge}
                ${serviceLinkHtml}
                ${senderRecText ? `<div style="font-size: 0.82rem; color: rgba(255,255,255,0.4); margin-bottom: 8px; word-break: break-word;">${senderRecText}</div>` : ''}
                ${stepsCardHtml}
                <div class="proc-card-footer">
                    <div>${assignedHtml || '<span style="color: rgba(255,255,255,0.25); font-style: italic; font-size: 0.82rem;">Niemand zugewiesen</span>'}</div>
                    <div style="display: flex; gap: 8px;">
                        ${(() => { const n = procSteps.length; return `
                        <button onclick="window.openProcessStepsModal('${p.id}')" class="btn-icon-soft" title="Schritte verwalten" style="position: relative; background: ${n ? 'rgba(52,211,153,0.12)' : 'rgba(255,255,255,0.05)'}; color: #34d399; border: 1px solid ${n ? 'rgba(52,211,153,0.6)' : 'rgba(255,255,255,0.1)'}; box-shadow: ${n ? '0 0 10px rgba(52,211,153,0.45)' : 'none'}; width: 34px; height: 34px; border-radius: 8px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; transition: all 0.2s;" onmouseover="this.style.background='rgba(52,211,153,0.25)'" onmouseout="this.style.background='${n ? 'rgba(52,211,153,0.12)' : 'rgba(255,255,255,0.05)'}'">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
                            ${n ? `<span style="position: absolute; top: -6px; right: -6px; background: #10b981; color: #fff; font-size: 0.62rem; font-weight: 800; min-width: 16px; height: 16px; padding: 0 4px; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; border: 2px solid #1e293b; box-shadow: 0 2px 6px rgba(0,0,0,0.4);">${n}</span>` : ''}
                        </button>`; })()}
                        ${(() => {
                            const hasRemark = !!(p.remark && p.remark.trim());
                            const remarkEsc = escStep((p.remark || '').trim());
                            return `
                        <div style="position:relative; display:inline-flex;" onmouseenter="this.querySelector('.proc-remark-pop').style.display='block'" onmouseleave="this.querySelector('.proc-remark-pop').style.display='none'">
                            <button type="button" class="btn-icon-soft" title="Notiz" style="position: relative; background: ${hasRemark ? 'rgba(167,139,250,0.3)' : 'rgba(167,139,250,0.1)'}; color: #a78bfa; border: 1px solid ${hasRemark ? 'rgba(167,139,250,0.9)' : 'rgba(167,139,250,0.3)'}; box-shadow: ${hasRemark ? '0 0 14px rgba(167,139,250,0.75)' : 'none'}; width: 34px; height: 34px; border-radius: 8px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; transition: all 0.2s;" onmouseover="this.style.background='rgba(167,139,250,0.4)'" onmouseout="this.style.background='${hasRemark ? 'rgba(167,139,250,0.3)' : 'rgba(167,139,250,0.1)'}'">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
                                ${hasRemark ? `<span style="position: absolute; top: -6px; right: -6px; background: #a78bfa; color: #fff; font-size: 0.62rem; font-weight: 800; min-width: 16px; height: 16px; padding: 0 4px; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; border: 2px solid #1e293b; box-shadow: 0 2px 6px rgba(0,0,0,0.4);">1</span>` : ''}
                            </button>
                            <div class="proc-remark-pop" style="display:none; position:absolute; bottom:calc(100% + 8px); right:0; z-index:60; width:420px; max-width:85vw; background:rgba(15,23,42,0.98); border:1px solid rgba(167,139,250,0.3); border-radius:12px; padding:12px 14px; box-shadow:0 12px 40px rgba(0,0,0,0.6); color:#fff; font-size:0.85rem; line-height:1.5; white-space:pre-wrap; word-break:break-word; text-align:left;">
                                ${hasRemark ? remarkEsc : '<span style="color:rgba(255,255,255,0.4); font-style:italic;">Keine Notiz hinterlegt</span>'}
                            </div>
                        </div>`; })()}
                        <button onclick="window.openEditProcessModal('${p.id}')" class="btn-icon-soft" title="Bearbeiten" style="background: rgba(255,255,255,0.05); color: #60a5fa; border: 1px solid rgba(255,255,255,0.1); width: 34px; height: 34px; border-radius: 8px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; transition: all 0.2s;" onmouseover="this.style.background='rgba(59,130,246,0.15)'" onmouseout="this.style.background='rgba(255,255,255,0.05)'">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4Z"></path></svg>
                        </button>
                        <button onclick="window.deleteProcess('${p.id}')" class="btn-icon-soft delete-permission-required" title="Löschen" style="background: rgba(255,255,255,0.05); color: #ef4444; border: 1px solid rgba(255,255,255,0.1); width: 34px; height: 34px; border-radius: 8px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; transition: all 0.2s;" onmouseover="this.style.background='rgba(239,68,68,0.15)'" onmouseout="this.style.background='rgba(255,255,255,0.05)'">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                        </button>
                    </div>
                </div>
            </div>
        `;
        if (p.status === 'erledigt') doneCards.push(cardHtml); else openCards.push(cardHtml);
    });

    if (openCards.length) {
        html += `<div class="proc-cards-grid">${openCards.join('')}</div>`;
    }

    if (doneCards.length) {
        const expanded = !!window._procDoneExpanded || statusFilter === 'erledigt';
        html += `
            <div style="margin-top: ${openCards.length ? '1.25rem' : '0'};">
                <div onclick="window.toggleProcDoneGroup()" style="display:flex; align-items:center; gap:10px; cursor:pointer; padding:0.7rem 1rem; background:rgba(16,185,129,0.08); border:1px solid rgba(16,185,129,0.25); border-radius:12px; user-select:none;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="transition: transform 0.25s; transform: rotate(${expanded ? '0' : '-90'}deg);"><polyline points="6 9 12 15 18 9"></polyline></svg>
                    <span style="color:#10b981; font-weight:800; font-size:0.9rem; text-transform:uppercase; letter-spacing:0.5px;">Erledigt</span>
                    <span style="background:rgba(16,185,129,0.2); color:#10b981; font-size:0.72rem; font-weight:800; min-width:20px; height:20px; padding:0 6px; border-radius:10px; display:inline-flex; align-items:center; justify-content:center;">${doneCards.length}</span>
                </div>
                <div class="proc-cards-grid" style="margin-top:0.75rem; display:${expanded ? '' : 'none'};">${doneCards.join('')}</div>
            </div>`;
    }

    container.innerHTML = html;
};

window.toggleProcDoneGroup = function() {
    window._procDoneExpanded = !window._procDoneExpanded;
    window.renderProcesses();
};

window.toggleProcessStatusMenu = function(event, id) {
    event.stopPropagation();
    document.querySelectorAll('.process-status-menu').forEach(el => {
        if (el.id !== `process-status-menu-${id}`) el.style.display = 'none';
    });
    const menu = document.getElementById(`process-status-menu-${id}`);
    if (menu) menu.style.display = (menu.style.display === 'block') ? 'none' : 'block';
};

document.addEventListener('click', function(e) {
    if (!e.target.closest('.process-status-wrapper')) {
        document.querySelectorAll('.process-status-menu').forEach(el => el.style.display = 'none');
    }
});

window.setProcessStatus = async function(id, status) {
    if (!window.supabaseClient) return;
    try {
        const { error } = await window.supabaseClient
            .from('internal_processes')
            .update({ status: status })
            .eq('id', id);

        if (error) throw error;

        const proc = (window.eventsState.processes || []).find(p => String(p.id) === String(id));
        if (proc) proc.status = status;
        window.renderProcesses();
    } catch (err) {
        console.error("Error updating process status:", err);
        window.showToast('Fehler beim Aktualisieren des Status: ' + err.message);
    }
};

window.saveImportedEmail = async function(event) {
    if (event) event.preventDefault();
    if (!window.supabaseClient) return;
    
    try {
        const title = document.getElementById('email-title-input').value;
        const type = document.getElementById('email-type-select').value;
        const date = document.getElementById('email-date-input').value;
        const sender = document.getElementById('email-sender-input').value;
        const recipient = document.getElementById('email-recipient-input').value;
        const machineId = document.getElementById('email-machine-select').value;
        const workshopOrderNumber = document.getElementById('email-workshop-order-select').value;
        const status = document.getElementById('email-status-select').value;
        const description = document.getElementById('email-body-input').value;
        const remark = document.getElementById('email-remark-input').value;

        const processDate = date ? new Date(date).toISOString() : new Date().toISOString();

        // Ersteller setzt window.insertMitErsteller (app-core.js) — user_id ist uuid,
        // die App-Nutzer haben bigint-IDs.
        const { error } = await window.insertMitErsteller('internal_processes', {
                title: title,
                process_type: type,
                process_date: processDate,
                sender: sender || null,
                recipient: recipient || null,
                machine_id: machineId ? parseInt(machineId) : null,
                workshop_order_number: workshopOrderNumber || null,
                status: status,
                description: description || null,
                remark: remark || null,
                assigned_users: window.processAssignedUsers['email']
            });

        if (error) throw error;

        window.closeEmailImportModal();
        window.fetchProcesses();
    } catch (err) {
        console.error("Error saving imported email:", err);
        window.showToast("Fehler beim Speichern: " + err.message);
    }
};

window.updateProcess = async function(event) {
    if (event) event.preventDefault();
    if (!window.supabaseClient) return;
    
    try {
        const id = document.getElementById('edit-process-id').value;
        const title = document.getElementById('edit-process-title-input').value;
        const type = document.getElementById('edit-process-type-select').value;
        const date = document.getElementById('edit-process-date-input').value;
        const sender = document.getElementById('edit-process-sender-input').value;
        const recipient = document.getElementById('edit-process-recipient-input').value;
        const machineId = document.getElementById('edit-process-machine-select').value;
        const workshopOrderNumber = document.getElementById('edit-process-workshop-order-select').value;
        const status = document.getElementById('edit-process-status-select').value;
        const remark = document.getElementById('edit-process-remark-input').value;
        const description = document.getElementById('edit-process-body-input').value;
        const serviceReportId = document.getElementById('edit-process-service-report-select').value;

        const processDate = date ? new Date(date).toISOString() : new Date().toISOString();
        const remindRaw = document.getElementById('edit-process-remind-input')?.value;

        const patch = {
            title: title,
            process_type: type,
            process_date: processDate,
            sender: sender || null,
            recipient: recipient || null,
            machine_id: machineId ? parseInt(machineId) : null,
            workshop_order_number: workshopOrderNumber || null,
            status: status,
            remark: remark || null,
            description: description || null,
            assigned_users: window.processAssignedUsers['edit-process'],
            steps: (window.processSteps['edit-process'] || []).filter(s => (s.text || '').trim()),
            linked_service_report_id: serviceReportId ? parseInt(serviceReportId) : null,
            remind_at: remindRaw ? new Date(remindRaw).toISOString() : null
        };

        let { error } = await window.supabaseClient
            .from('internal_processes')
            .update(patch)
            .eq('id', id);

        if (error && /remind_at/.test(error.message || '')) {
            console.warn('Spalte remind_at fehlt, speichere ohne Erinnerung:', error.message);
            const reduced = { ...patch };
            delete reduced.remind_at;
            ({ error } = await window.supabaseClient.from('internal_processes').update(reduced).eq('id', id));
        }

        if (error) throw error;

        window.closeEditProcessModal();
        window.fetchProcesses();
        if (typeof window.refreshAddressbookDetail === 'function') {
            window.refreshAddressbookDetail();
        }
    } catch (err) {
        console.error("Error updating process:", err);
        window.showToast("Fehler beim Aktualisieren: " + err.message);
    }
};

window.deleteProcess = async function(id) {
    if (typeof window.canDelete === 'function' && !window.canDelete('Vorgängen')) return;
    if (!confirm("Diesen Vorgang wirklich unwiderruflich löschen?")) return;
    if (!window.supabaseClient) return;
    
    try {
        const { error } = await window.supabaseClient
            .from('internal_processes')
            .delete()
            .eq('id', id);
            
        if (error) throw error;
        
        window.fetchProcesses();
    } catch (err) {
        console.error("Error deleting process:", err);
        window.showToast("Fehler beim Löschen: " + err.message);
    }
};

window.isMyProcessesFilterActive = false;

// Ansicht umschalten: 'all' = alle Vorgänge, 'me' = nur mir zugewiesene
window.filterProcessesByUser = function (mode) {
    const isMe = mode === 'me';
    window.isMyProcessesFilterActive = isMe;

    const btnAll = document.getElementById('btn-process-tab-all');
    const btnMe = document.getElementById('btn-process-user-me');
    if (btnAll) btnAll.classList.toggle('active', !isMe);
    if (btnMe) btnMe.classList.toggle('active', isMe);

    window.renderProcesses('standalone-processes-container');
};

window.toggleMyProcessesFilter = function () {
    window.filterProcessesByUser(window.isMyProcessesFilterActive ? 'all' : 'me');
};

