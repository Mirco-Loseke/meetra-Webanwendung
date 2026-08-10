/* ==========================================================================
   Dashboard Logic (Startseite / Home View)
   ========================================================================== */

window.updateLastViewed = async function(machineId) {
    if (!window.activeUser) return;
    if (!navigator.onLine) return;

    console.log('Updating last viewed for machine:', machineId);

    let lastViewed = window.activeUser.last_viewed || [];
    if (!Array.isArray(lastViewed)) lastViewed = [];

    const newEntry = {
        machine_id: machineId,
        viewed_at: new Date().toISOString()
    };

    lastViewed = lastViewed.filter(entry => entry.machine_id !== machineId);
    lastViewed.unshift(newEntry);
    lastViewed = lastViewed.slice(0, 2);

    window.activeUser.last_viewed = lastViewed;

    try {
        const { error } = await window.supabaseClient
            .from('users')
            .update({ last_viewed: lastViewed })
            .eq('id', window.activeUser.id);

        if (error) {
            console.error('Error updating last viewed:', error);
        } else {
            console.log('Successfully updated last viewed in Supabase');
            const homeView = document.getElementById('home');
            if (homeView && !homeView.classList.contains('hidden')) {
                window.renderDashboard();
            }
        }
    } catch (err) {
        console.error('Error updating last viewed (network):', err);
    }
};

window.renderDashboard = async function() {
    const homeSection = document.getElementById('home');
    if (!homeSection) return;

    const machines = window.machineList || [];
    const categories = window.categoryList || [];
    const MS_DAY = 86400000;
    const now = new Date();
    const today0 = new Date(); today0.setHours(0, 0, 0, 0);
    const todayStr = now.toISOString().split('T')[0];
    const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    const inWorkshop = machines.filter(m => m.is_in_workshop === true).length;
    const lastViewed = (window.activeUser && window.activeUser.last_viewed) ? window.activeUser.last_viewed : [];

    // --- Externe Daten (Vorgänge, Angebote, Aufgaben) parallel laden ---
    let processes = [], angebote = [], tasks = [];
    if (window.supabaseClient) {
        try {
            const [procRes, angRes, taskRes] = await Promise.all([
                window.supabaseClient.from('internal_processes').select('id, status, process_date, title'),
                window.supabaseClient.from('angebote').select('id, belegnummer, status, nettobetrag, erinnerung, kundenmatchcode, customers(name)'),
                window.supabaseClient.from('tasks').select('id, status, assigned_to')
            ]);
            processes = procRes.data || [];
            angebote = angRes.data || [];
            tasks = taskRes.data || [];
        } catch (err) {
            console.error('Dashboard: Fehler beim Laden der Zusatzdaten:', err);
        }
    }

    // --- Wartung ---
    const overdueList = [], dueSoonList = [];
    machines.forEach(m => {
        if (!m.next_maintenance) return;
        const diff = Math.ceil((new Date(m.next_maintenance) - now) / MS_DAY);
        if (diff < 0) overdueList.push({ machine: m, diff });
        else if (diff <= 30) dueSoonList.push({ machine: m, diff });
    });
    overdueList.sort((a, b) => a.diff - b.diff);
    dueSoonList.sort((a, b) => a.diff - b.diff);

    // --- Vorgänge ---
    const procAge = p => p.process_date ? Math.round((today0 - new Date(p.process_date)) / MS_DAY) : null;
    const openProcs = processes.filter(p => p.status !== 'erledigt');
    const staleProcs = openProcs
        .map(p => ({ p, age: procAge(p) }))
        .filter(x => x.age !== null && x.age > 7)
        .sort((a, b) => b.age - a.age);

    // --- Angebote ---
    const parseNum = v => { const n = parseFloat(String(v === null || v === undefined ? '' : v).replace(',', '.')); return isNaN(n) ? 0 : n; };
    const classifyAngebot = a => {
        const s = (a.status || '').toLowerCase();
        if (/gewonnen|auftrag|bestellt|verkauft|angenommen|zusage/.test(s)) return 'won';
        if (/verloren|abgelehnt|absage|abgesagt|storniert|kein interesse/.test(s)) return 'lost';
        return 'open';
    };
    const openAngebote = angebote.filter(a => classifyAngebot(a) === 'open');
    const openAngeboteVolume = openAngebote.reduce((s, a) => s + parseNum(a.nettobetrag), 0);

    // --- Aufgaben: dem aktiven Nutzer zugewiesen; ohne Nutzerkontext alle offenen ---
    const openTasks = tasks.filter(t => t.status !== 'completed');
    const myTasks = window.activeUser
        ? openTasks.filter(t => Array.isArray(t.assigned_to) && t.assigned_to.some(u => String(u) === String(window.activeUser.id)))
        : openTasks;

    const fmtTe = v => v >= 1000 ? Math.round(v / 1000).toLocaleString('de-DE') + ' T€' : Math.round(v).toLocaleString('de-DE') + ' €';

    // --- KPI-Zeile (5 klickbare Kacheln) ---
    function dashKpi(value, label, color, onclick, sub) {
        return `
            <div class="maint-kpi-tile" style="border-left: 4px solid ${color};" onclick="${onclick}">
                <div class="maint-kpi-value" style="color: ${color};">${value}</div>
                <div class="maint-kpi-label">${label}</div>
                ${sub ? `<div style="font-size:0.7rem; color:#fff; font-weight:600; margin-top:2px;">${sub}</div>` : ''}
            </div>`;
    }
    const kpiHtml = `
        <div class="maint-kpi-grid dash-kpi-grid">
            ${dashKpi(overdueList.length, 'Wartung überfällig', '#ef4444', "window.eventsState.statusFilter='overdue'; window.switchView('calendar'); window.switchEventsSubView && window.switchEventsSubView('calendar');", dueSoonList.length + ' fällig in 30 Tagen')}
            ${dashKpi(openProcs.length, 'Offene Vorgänge', '#f59e0b', "window.switchView('calendar'); window.switchEventsSubView && window.switchEventsSubView('processes');", staleProcs.length + ' länger als 7 Tage')}
            ${dashKpi(fmtTe(openAngeboteVolume), 'Offene Angebote', '#60a5fa', "window.switchView('listen');", openAngebote.length + ' Angebote')}
            ${dashKpi(inWorkshop, 'In der Werkstatt', '#22c55e', "window.showWorkshopMachinesAndSwitch()", machines.length + ' Maschinen gesamt')}
            <div class="maint-kpi-tile double-kpi-tile" style="border-left: 4px solid #a78bfa;">
                <div class="double-kpi-subtile" onclick="window.showAllTasksAndSwitch()">
                    <div class="maint-kpi-value" style="color: #a78bfa;">${openTasks.length}</div>
                    <div class="maint-kpi-label">Alle Aufgaben</div>
                </div>
                <div class="double-kpi-subtile" onclick="window.showMyTasksAndSwitch()">
                    <div class="maint-kpi-value" style="color: #a78bfa;">${myTasks.length}</div>
                    <div class="maint-kpi-label">Meine Aufgaben</div>
                </div>
            </div>
        </div>`;

    // --- "Heute wichtig": gemischte Dringlichkeitsliste über alle Module ---
    const icons = {
        warn: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
        bell: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>',
        cal: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>',
        mail: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>'
    };
    const todoItems = [];
    const SEV_COLOR = { overdue: '#ef4444', today: '#f59e0b', soon: '#60a5fa', info: '#a78bfa' };
    const KIND_ICON_DASH = {
        maintenance: icons.warn, offer: icons.bell, reminder: icons.bell,
        deadline: icons.cal, assigned: icons.mail, steps: icons.mail
    };
    try {
        const shared = (typeof window.collectImportantItems === 'function')
            ? await window.collectImportantItems()
            : [];
        shared.forEach(it => {
            const color = SEV_COLOR[it.severity] || SEV_COLOR.info;
            const label = [it.subject, it.title].filter(Boolean).join(' — ');
            todoItems.push({
                color,
                icon: KIND_ICON_DASH[it.kind] || icons.mail,
                text: `${esc(label)} <span style="opacity:0.7;">· ${esc(it.meta)}</span>`,
                onclick: `window.openImportantItem && window.openImportantItem('${it.targetType}','${String(it.targetId).replace(/'/g, "\\'")}')`
            });
        });
    } catch (err) {
        console.warn('Dashboard: "Heute wichtig" konnte nicht geladen werden:', err);
    }

    staleProcs.slice(0, 3).forEach(x => {
        todoItems.push({ color: '#a78bfa', icon: icons.mail, text: `Vorgang "${esc(x.p.title || 'Unbenannt')}" seit ${x.age} Tagen offen`, onclick: "window.switchView('calendar'); window.switchEventsSubView && window.switchEventsSubView('processes');" });
    });
    const todoHtml = todoItems.length > 0
        ? todoItems.slice(0, 8).map(it => `
            <div class="dash-todo-row" style="background: ${it.color}14; border-left: 3px solid ${it.color};" onclick="${it.onclick}">
                <span style="color: ${it.color}; display:flex; flex-shrink:0;">${it.icon}</span>
                <span style="flex:1; min-width:0; color: #fff;">${it.text}</span>
            </div>`).join('')
        : `<div style="text-align:center; color:#fff; padding:2rem 1rem; font-size:0.9rem;">Nichts Dringendes — alles im grünen Bereich.</div>`;

    // --- Graf: Wartungen nächste 6 Monate (+ Überfällig-Balken) ---
    const maintBuckets = [];
    for (let i = 0; i < 6; i++) {
        const d = new Date(today0.getFullYear(), today0.getMonth() + i, 1);
        maintBuckets.push({ label: d.toLocaleDateString('de-DE', { month: 'short' }), year: d.getFullYear(), month: d.getMonth(), count: 0 });
    }
    machines.forEach(m => {
        if (!m.next_maintenance) return;
        const d = new Date(m.next_maintenance);
        if (d < today0) return;
        const b = maintBuckets.find(b => b.year === d.getFullYear() && b.month === d.getMonth());
        if (b) b.count++;
    });
    const maxMaint = Math.max(overdueList.length, ...maintBuckets.map(b => b.count), 1);
    const maintChartHtml = `
        <div class="maint-chart-bars" style="height: 64px;">
            <div class="maint-chart-col">
                ${overdueList.length > 0 ? `<div class="maint-chart-count">${overdueList.length}</div>` : ''}
                <div class="maint-chart-bar" style="height: ${Math.round(overdueList.length / maxMaint * 100)}%; background: ${overdueList.length > 0 ? '#ef4444' : 'rgba(255,255,255,0.06)'};"></div>
                <div class="maint-chart-month">Überf.</div>
            </div>
            ${maintBuckets.map(b => `
                <div class="maint-chart-col">
                    ${b.count > 0 ? `<div class="maint-chart-count">${b.count}</div>` : ''}
                    <div class="maint-chart-bar" style="height: ${Math.round(b.count / maxMaint * 100)}%; background: ${b.count > 0 ? '#60a5fa' : 'rgba(255,255,255,0.06)'};"></div>
                    <div class="maint-chart-month">${b.label}</div>
                </div>`).join('')}
        </div>`;

    // --- Graf: Angebots-Pipeline als gestapelte Leiste ---
    const statusGroups = {};
    angebote.forEach(a => {
        const name = a.status || 'Ohne Status';
        if (!statusGroups[name]) {
            const cat = categories.find(c => c.type === 'status' && c.name === a.status);
            statusGroups[name] = { name, sum: 0, color: cat?.color || 'rgba(255,255,255,0.3)' };
        }
        statusGroups[name].sum += parseNum(a.nettobetrag);
    });
    const pipelineSegs = Object.values(statusGroups).filter(g => g.sum > 0).sort((a, b) => b.sum - a.sum);
    const pipelineTotal = pipelineSegs.reduce((s, g) => s + g.sum, 0);
    const pipelineHtml = pipelineTotal > 0 ? `
        <div style="display:flex; height:14px; border-radius:7px; overflow:hidden; background:rgba(255,255,255,0.06);">
            ${pipelineSegs.map(g => `<div style="width:${Math.max(2, g.sum / pipelineTotal * 100)}%; background:${g.color};" title="${esc(g.name)}: ${fmtTe(g.sum)}"></div>`).join('')}
        </div>
        <div style="display:flex; flex-wrap:wrap; gap:4px 14px; margin-top:8px;">
            ${pipelineSegs.slice(0, 4).map(g => `<span style="font-size:0.7rem; font-weight:700; color:#fff; display:inline-flex; align-items:center; gap:5px;"><span style="width:8px; height:8px; border-radius:2px; background:${g.color}; display:inline-block;"></span>${esc(g.name)} ${fmtTe(g.sum)}</span>`).join('')}
        </div>`
        : '<div style="color:#fff; font-size:0.82rem; padding:0.5rem 0;">Keine Angebotsdaten</div>';

    // --- Graf: Vorgänge letzte 8 Wochen (offen vs. erledigt) ---
    const firstMonday = new Date(today0);
    firstMonday.setDate(firstMonday.getDate() - ((firstMonday.getDay() + 6) % 7) - 7 * 7);
    const weekBuckets = [];
    for (let i = 0; i < 8; i++) {
        const start = new Date(firstMonday.getTime() + i * 7 * MS_DAY);
        weekBuckets.push({ start, label: start.getDate() + '.' + (start.getMonth() + 1) + '.', open: 0, done: 0 });
    }
    processes.forEach(p => {
        if (!p.process_date) return;
        const idx = Math.floor((new Date(p.process_date) - firstMonday) / (7 * MS_DAY));
        if (idx < 0 || idx > 7) return;
        if (p.status === 'erledigt') weekBuckets[idx].done++; else weekBuckets[idx].open++;
    });
    const maxWeek = Math.max(...weekBuckets.map(b => b.open + b.done), 1);
    const procChartHtml = `
        <div class="maint-chart-bars" style="height: 54px;">
            ${weekBuckets.map(b => {
                const total = b.open + b.done;
                return `
                <div class="maint-chart-col">
                    ${total > 0 ? `<div class="maint-chart-count">${total}</div>` : ''}
                    <div class="proc-chart-stack" style="height: ${Math.round(total / maxWeek * 100)}%;">
                        ${b.open > 0 ? `<div style="flex:${b.open}; background:#f59e0b;"></div>` : ''}
                        ${b.done > 0 ? `<div style="flex:${b.done}; background:#10b981;"></div>` : ''}
                        ${total === 0 ? '<div style="flex:1; background:rgba(255,255,255,0.06);"></div>' : ''}
                    </div>
                    <div class="maint-chart-month">${b.label}</div>
                </div>`;
            }).join('')}
        </div>`;

    // --- Zuletzt angesehene Maschinen als premium Karten ---
    function recentlyViewedMachineCard(machine) {
        const cat = categories.find(c => c.id === machine.category_id);
        const catColor = cat ? cat.color : '#10b981';
        const catLabel = cat ? cat.name : 'Allgemein';
        
        const machineTitle = [machine.manufacturer, machine.name].filter(Boolean).join(' ') || 'Unbekannte Maschine';
        const serialAndYear = [
            machine.serial ? `SN: ${machine.serial}` : null,
            machine.year ? `BJ: ${machine.year}` : null
        ].filter(Boolean).join(' | ');

        const locationCity = machine.location_city || machine.operator_city || '';
        const companyName = machine.company || 'Unbekannter Betreiber';

        let maintHtml = '';
        if (machine.next_maintenance) {
            const maintDate = new Date(machine.next_maintenance);
            const dateStr = maintDate.toLocaleDateString('de-DE');
            const diffDays = Math.ceil((maintDate - new Date()) / (1000 * 60 * 60 * 24));
            
            let badgeBg = 'rgba(255,255,255,0.06)';
            let badgeColor = '#fff';
            if (diffDays < 0) {
                badgeBg = 'rgba(239, 68, 68, 0.15)';
                badgeColor = '#f87171';
            } else if (diffDays <= 30) {
                badgeBg = 'rgba(245, 158, 11, 0.15)';
                badgeColor = '#fbbf24';
            }
            maintHtml = `
                <div style="font-size:0.75rem; background:${badgeBg}; color:${badgeColor}; padding:4px 8px; border-radius:6px; font-weight:700; display:inline-flex; align-items:center; gap:4px; margin-top:2px;">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"></polyline></svg>
                    Wartung: ${dateStr}
                </div>`;
        } else {
            maintHtml = `
                <div style="font-size:0.75rem; background:rgba(255,255,255,0.03); color:#fff; padding:4px 8px; border-radius:6px; font-weight:600; display:inline-flex; align-items:center; gap:4px; margin-top:2px;">
                    Kein Wartungstermin
                </div>`;
        }

        const imgUrlFull = machine.image_url || '';
        const imgUrl = imgUrlFull && window.getMachineThumbnailUrl ? window.getMachineThumbnailUrl(imgUrlFull) : imgUrlFull;
        const imgHtml = imgUrl 
            ? `<img src="${imgUrl}" onerror="if(this.src!=='${imgUrlFull}'){this.onerror=null;this.src='${imgUrlFull}';}" style="width: 85px; height: 85px; object-fit: cover; border-radius: 12px; background: rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.1); flex-shrink: 0;" />`
            : `<div style="width: 85px; height: 85px; border-radius: 12px; background: rgba(255,255,255,0.05); display: flex; align-items: center; justify-content: center; border:1px dashed rgba(255,255,255,0.1); flex-shrink: 0;">
                   <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity: 0.35;"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"></polyline></svg>
               </div>`;

        return `
            <div onclick="window.openMachineDetails && window.openMachineDetails(${machine.id})" style="flex:1; font-family:'Inter',sans-serif; overflow:hidden; display:flex; flex-direction:column; background:rgba(255,255,255,0.055); backdrop-filter:blur(18px) saturate(150%); -webkit-backdrop-filter:blur(18px) saturate(150%); box-shadow:0 6px 20px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.14); border:1.5px solid rgba(255,255,255,0.22); border-left:5px solid ${catColor}; border-radius:16px; cursor:pointer; transition:transform 0.45s cubic-bezier(0.16,1,0.3,1), background 0.45s cubic-bezier(0.16,1,0.3,1), box-shadow 0.45s cubic-bezier(0.16,1,0.3,1), border-color 0.45s cubic-bezier(0.16,1,0.3,1);"
                 onmouseover="this.style.borderColor='rgba(255,255,255,0.4)'; this.style.borderLeftColor='${catColor}'; this.style.background='rgba(255,255,255,0.09)'; this.style.transform='translateY(-3px) scale(1.015)'; this.style.boxShadow='0 14px 36px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.22)';"
                 onmouseout="this.style.borderColor='rgba(255,255,255,0.22)'; this.style.borderLeftColor='${catColor}'; this.style.background='rgba(255,255,255,0.055)'; this.style.transform='translateY(0) scale(1)'; this.style.boxShadow='0 6px 20px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.14)';"
                 style="width: 100%; box-sizing: border-box;">
                <div style="padding:1.1rem 1.25rem; display:flex; gap:12px; align-items:flex-start;">
                    <div style="flex:1; display:flex; flex-direction:column; gap:0.4rem; min-width:0; text-align:left;">
                        <span style="font-size:0.6rem; font-weight:800; color:${catColor}; text-transform:uppercase; letter-spacing:0.8px; width:fit-content;">${catLabel}</span>
                        <h3 class="dash-card-truncate" style="margin:0; color:#fff; font-size:1.05rem; font-weight:800; line-height:1.2; font-family:'Outfit',sans-serif; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${esc(machineTitle)}">${esc(machineTitle)}</h3>
                        ${serialAndYear ? `<div style="font-size:0.75rem; color:#fff; font-weight:600;">${esc(serialAndYear)}</div>` : ''}
                        <div style="font-size: 0.82rem; color:#fff; font-weight:600; display:flex; align-items:flex-start; gap:4px; margin-top:2px; min-width:0;">
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="opacity:0.6; flex-shrink: 0; margin-top:3px;"><path d="M3 21h18"></path><path d="M5 21V7l8-4v18"></path><path d="M19 21V11l-6-4"></path></svg>
                            <span class="dash-card-truncate" style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0;">${esc(companyName)}${locationCity ? ` (${esc(locationCity)})` : ''}</span>
                        </div>
                        <div style="margin-top:2px;">
                            ${maintHtml}
                        </div>
                    </div>
                    ${imgHtml}
                </div>
            </div>`;
    }

    const recentlyViewedCards = lastViewed.slice(0, 3).map(entry => {
        const machine = machines.find(m => m.id === entry.machine_id);
        if (!machine) return '';
        return recentlyViewedMachineCard(machine);
    }).filter(Boolean);

    // --- Begrüßung ---
    const hour = now.getHours();
    const greeting = hour < 11 ? 'Guten Morgen' : (hour > 17 ? 'Guten Abend' : 'Guten Tag');
    const greetingName = window.activeUser ? `, ${esc(window.activeUser.name)}` : '';

    // --- Upcoming Service Appointments / Servicetermine ---
    function upcomingAppointmentCard(entry) {
        const machine = machines.find(m => m.id === entry.machine_id);
        const machineCat = machine ? categories.find(c => c.id === machine.category_id) : null;
        const serviceCat = categories.find(c => c.id === entry.category_id);
        
        const borderColor = (serviceCat && serviceCat.color) ? serviceCat.color
            : (machineCat && machineCat.color) ? machineCat.color
                : '#38bdf8';

        const reportDate = entry.date ? new Date(entry.date) : new Date();
        const dateStr = reportDate.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
        
        const machineTitle = machine
            ? [machine.manufacturer, machine.name, (machine.serial || machine.serial_number) ? `#${machine.serial || machine.serial_number}` : null, machine.year ? `(${machine.year})` : null].filter(Boolean).join(' ')
            : 'Unbekannte Maschine';

        const locationCity = machine ? (machine.location_city || machine.operator_city || '') : '';
        const companyName = machine ? (machine.company || 'Unbekannter Betreiber') : '';
        const orderNumVal = entry.workshop_order_number || entry.auftragsnummer || '';
        const orderNum = orderNumVal ? `<span class="dash-order-pill" style="font-size: 0.75rem; color: ${borderColor}; background: ${borderColor}1a; border: 1px solid ${borderColor}33; padding: 2px 8px; border-radius: 99px; font-weight: 700; margin-left: auto; letter-spacing: 0.5px;">Auftrag ${orderNumVal}</span>` : '';

        const typeLabel = entry.title || 'Servicebericht';
        const catLabel = serviceCat ? serviceCat.name : (machineCat ? machineCat.name : 'Service');
        
        const techniciansList = Array.isArray(entry.technicians) && entry.technicians.length > 0
            ? entry.technicians.map(tid => {
                  const u = (window.userList || []).find(usr => String(usr.id) === String(tid));
                  return u ? u.name : null;
              }).filter(Boolean).join(', ')
            : '';

        const imgUrlFull = machine ? (machine.image_url || '') : '';
        const imgUrl = imgUrlFull && window.getMachineThumbnailUrl ? window.getMachineThumbnailUrl(imgUrlFull) : imgUrlFull;
        const imgHtml = imgUrl 
            ? `<img src="${imgUrl}" onerror="if(this.src!=='${imgUrlFull}'){this.onerror=null;this.src='${imgUrlFull}';}" style="width: 75px; height: 75px; object-fit: cover; border-radius: 10px; background: rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.1); flex-shrink: 0;" />`
            : '';

        return `<div onclick="window.openEditServicebericht && window.openEditServicebericht(${entry.id})" style="flex:1; font-family:'Inter',sans-serif; overflow:hidden; display:flex; flex-direction:column; background:rgba(255,255,255,0.055); backdrop-filter:blur(18px) saturate(150%); -webkit-backdrop-filter:blur(18px) saturate(150%); box-shadow:0 6px 20px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.14); border:3.5px solid ${borderColor}44; border-left:7px solid ${borderColor}; border-radius:18px; cursor:pointer; transition:transform 0.45s cubic-bezier(0.16,1,0.3,1), background 0.45s cubic-bezier(0.16,1,0.3,1), box-shadow 0.45s cubic-bezier(0.16,1,0.3,1), border-color 0.45s cubic-bezier(0.16,1,0.3,1); position:relative;"
                onmouseover="this.style.borderColor='${borderColor}88'; this.style.borderLeftColor='${borderColor}'; this.style.background='rgba(255,255,255,0.09)'; this.style.transform='translateY(-3px) scale(1.015)'; this.style.boxShadow='0 14px 36px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.22)';"
                onmouseout="this.style.borderColor='${borderColor}44'; this.style.borderLeftColor='${borderColor}'; this.style.background='rgba(255,255,255,0.055)'; this.style.transform='translateY(0) scale(1)'; this.style.boxShadow='0 6px 20px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.14)';"
                style="width: 100%; box-sizing: border-box;">
                <div style="padding:1.2rem 1.4rem; display:flex; gap:12px; align-items:stretch;">
                    <div style="flex:1; display:flex; flex-direction:column; gap:0.6rem; min-width:0;">
                        <div style="display:flex; align-items:center; justify-content:space-between; width:100%;">
                            <span style="font-size:0.65rem; font-weight:800; color:${borderColor}; background:${borderColor}1a; border: 1px solid ${borderColor}33; padding: 2px 8px; border-radius: 99px; text-transform:uppercase; letter-spacing:0.8px;">${catLabel}</span>
                            <span style="font-size:0.75rem; color:#fff; font-weight:600;">${dateStr}</span>
                        </div>
                        <div style="display:flex; align-items:center; gap:8px; width:100%; margin-top:2px;">
                            <h3 style="margin:0; color:#fff; font-size: 1.15rem; font-weight:900; line-height:1.2; font-family:'Outfit',sans-serif;">${typeLabel}</h3>
                            ${orderNum}
                        </div>
                        <div style="width:100%; height:1px; background:rgba(255,255,255,0.18); margin: 2px 0;"></div>
                        <div style="display:flex; flex-direction:column; gap:2px; text-align:left;">
                            <div style="font-size: 0.92rem; color:#fff; font-weight:700; display:flex; align-items:center; gap:6px;">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="opacity:0.6; flex-shrink: 0;"><path d="M3 21h18"></path><path d="M5 21V7l8-4v18"></path><path d="M19 21V11l-6-4"></path></svg>
                                <span class="dash-card-truncate" style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${esc(companyName)}">${esc(companyName)}</span>
                            </div>
                            ${locationCity ? `
                            <div style="font-size:0.78rem; color:#fff; font-weight:600; display:flex; align-items:center; gap:4px; padding-left:19px;">
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="opacity:0.6;"><path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                                <span>${esc(locationCity)}</span>
                            </div>` : ''}
                        </div>
                        <div style="display:flex; align-items:center; width:100%; margin-top:2px;">
                            <div class="dash-machine-pill" style="font-size: 0.8rem; color: var(--color-primary-green); font-weight: 700; background: rgba(52, 211, 153, 0.08); border: 1px solid rgba(52, 211, 153, 0.2); padding: 4px 10px; border-radius: 8px; display: inline-flex; align-items: center; gap: 6px; max-width:100%;">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="flex-shrink:0;"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
                                <span class="dash-card-truncate" style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${esc(machineTitle)}">${esc(machineTitle)}</span>
                            </div>
                        </div>
                        ${techniciansList ? `
                        <div style="font-size: 0.75rem; color: #fff; display:flex; align-items:center; gap:5px; margin-top:1px;">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="opacity:0.6;"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                            <span><span style="font-weight:700;">Techniker:</span> ${esc(techniciansList)}</span>
                        </div>` : ''}
                        ${entry.description ? `<p style="margin:2px 0 0 0; font-size:0.82rem; color:#fff; line-height:1.4; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; text-align:left;">${entry.description}</p>` : ''}
                    </div>
                    ${imgHtml ? `
                    <div style="display:flex; align-items:flex-end; justify-content:flex-end; flex-shrink:0; padding-bottom:2px;">
                        ${imgHtml}
                    </div>` : ''}
                </div>
            </div>`;
    }

    const upcomingServices = (window.serviceEntryList || [])
        .filter(e => e.title !== 'Werkstattaufenthalt Beginn' && e.title !== 'Werkstattaufenthalt Ende' && e.date && e.date >= todayStr)
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(0, 3);
    const upcomingAppointmentCards = upcomingServices.map(upcomingAppointmentCard);

    homeSection.innerHTML = `
            <!-- Kopfzeile: Begrüßung + Schnellzugriff -->
            <div class="dash-header">
                <div>
                    <h1 style="margin:0; font-size:1.8rem; font-weight:900; font-family:'Inter',sans-serif;">${greeting}${greetingName}</h1>
                    <p style="margin:6px 0 0; color:#fff; font-size:0.9rem; font-family:'Inter',sans-serif;">${now.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
                </div>
                <div class="dash-quick-actions">
                    <button class="dash-quick-btn" onclick="window.switchView('service')">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94z"></path></svg>
                        Servicebericht
                    </button>
                    <button class="dash-quick-btn" onclick="window.switchView('calendar'); window.switchEventsSubView && window.switchEventsSubView('processes'); window.openProcessAddModal && window.openProcessAddModal();">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                        Vorgang anlegen
                    </button>
                    <button class="dash-quick-btn" onclick="window.switchView('accounting')">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1z"></path>
                            <path d="M16 8h-6"></path>
                            <path d="M16 12h-9"></path>
                            <path d="M15 16h-8"></path>
                        </svg>
                        Buchhaltung
                    </button>
                    <button class="dash-quick-btn" onclick="window.switchView('listen')">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
                        Angebote
                    </button>
                </div>
            </div>

            ${kpiHtml}

            <!-- Heute wichtig + Grafen -->
            <div class="dash-main-grid">
                <div class="maint-chart-card" style="margin-bottom:0;">
                    <p class="maint-chart-title">Heute wichtig</p>
                    <div style="display:flex; flex-direction:column; gap:6px;">${todoHtml}</div>
                </div>
                <div style="display:flex; flex-direction:column; gap:12px;">
                    <div class="maint-chart-card" style="margin-bottom:0;">
                        <p class="maint-chart-title">Wartungen nächste 6 Monate</p>
                        ${maintChartHtml}
                    </div>
                    <div class="maint-chart-card" style="margin-bottom:0;">
                        <p class="maint-chart-title">Angebots-Pipeline (VK)</p>
                        ${pipelineHtml}
                    </div>
                    <div class="maint-chart-card" style="margin-bottom:0;">
                        <p class="maint-chart-title">Vorgänge letzte 8 Wochen
                            <span style="float:right; text-transform:none; letter-spacing:0; font-weight:600;">
                                <span style="display:inline-block; width:8px; height:8px; border-radius:2px; background:#f59e0b; margin-right:4px;"></span>Offen
                                <span style="display:inline-block; width:8px; height:8px; border-radius:2px; background:#10b981; margin:0 4px 0 10px;"></span>Erledigt
                            </span>
                        </p>
                        ${procChartHtml}
                    </div>
                </div>
            </div>

            ${upcomingAppointmentCards.length > 0 ? `
            <div style="margin-top:1.5rem;">
                <p class="maint-chart-title" style="margin-bottom:10px;">Anstehende Servicetermine</p>
                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:1rem;">${upcomingAppointmentCards.join('')}</div>
            </div>` : ''}

            ${recentlyViewedCards.length > 0 ? `
            <div style="margin-top:1.5rem;">
                <p class="maint-chart-title" style="margin-bottom:10px;">Zuletzt angesehen</p>
                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:1rem;">${recentlyViewedCards.join('')}</div>
            </div>` : ''}
        `;
};
