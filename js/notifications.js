// ==========================================
// BENACHRICHTIGUNGEN (Glocke in der Topbar)
// ==========================================
// Sammelt alles, was für den aktuell angemeldeten Mitarbeiter wichtig ist:
//
//   - Vorgänge (internal_processes) mit Erinnerung (remind_at), die überfällig
//     sind, heute anstehen oder in den nächsten Tagen fällig werden
//   - Vorgänge, bei denen ich neu als Mitarbeiter zugewiesen wurde
//   - Offene Schritte in meinen Vorgängen
//   - Aufgaben (tasks) mit Fälligkeitsdatum, die mir zugewiesen sind
//
// Ein Klick auf einen Eintrag führt direkt zur betreffenden Stelle
// (Vorgang bzw. Aufgabe wird geöffnet).
//
// Der Gelesen-Status liegt pro Benutzer im localStorage, damit die Glocke
// nicht dauerhaft rot bleibt.
// ==========================================
(function () {
    'use strict';

    const READ_KEY_PREFIX = 'meetra_notif_read_';
    const PREFS_KEY_PREFIX = 'meetra_notif_prefs_';

    // Voreinstellung, wenn der Benutzer nichts geändert hat.
    //   before      = Vorlauf in Tagen (wie früh wird erinnert)
    //   after       = Rückblick in Tagen (wie lange bleibt Überfälliges stehen)
    //   maintBefore = eigener Vorlauf für Wartungen, die kündigen sich länger an
    const DEFAULT_PREFS = {
        processes: true,
        tasks: true,
        maintenance: true,
        offers: true,
        appointments: true,
        before: 3,
        after: 14,
        maintBefore: 30
    };

    let items = [];
    let isOpen = false;
    let isLoading = false;

    function sb() { return window.supabaseClient; }

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    function currentUser() {
        return window.activeUser || window.currentUser || null;
    }

    function currentUserId() {
        const u = currentUser();
        if (u && u.id) return String(u.id);
        const stored = localStorage.getItem('activeUserId');
        return stored ? String(stored) : null;
    }

    // ---------------------------------------------------------------
    // Einstellungen je Benutzer (Zahnrad im Panel)
    // ---------------------------------------------------------------
    function prefs() {
        const uid = currentUserId();
        let stored = null;
        try { stored = JSON.parse(localStorage.getItem(PREFS_KEY_PREFIX + (uid || 'anon')) || 'null'); }
        catch (e) { stored = null; }
        return Object.assign({}, DEFAULT_PREFS, stored || {});
    }
    window.notificationPrefs = prefs;

    function savePrefs(patch) {
        const uid = currentUserId();
        const next = Object.assign({}, prefs(), patch);
        localStorage.setItem(PREFS_KEY_PREFIX + (uid || 'anon'), JSON.stringify(next));
        return next;
    }

    // Zahl aus einem Eingabefeld in einen sinnvollen Bereich zwingen
    function clampDays(v, fallback) {
        const n = parseInt(v, 10);
        if (isNaN(n)) return fallback;
        return Math.min(365, Math.max(0, n));
    }

    // ---------------------------------------------------------------
    // Gelesen-Status je Benutzer
    // ---------------------------------------------------------------
    function readKeys() {
        const uid = currentUserId();
        if (!uid) return new Set();
        try {
            return new Set(JSON.parse(localStorage.getItem(READ_KEY_PREFIX + uid) || '[]'));
        } catch (e) {
            return new Set();
        }
    }

    function saveReadKeys(set) {
        const uid = currentUserId();
        if (!uid) return;
        // Nur die letzten 500 behalten, damit der Speicher nicht unbegrenzt wächst.
        const arr = [...set].slice(-500);
        localStorage.setItem(READ_KEY_PREFIX + uid, JSON.stringify(arr));
    }

    function markRead(key) {
        const set = readKeys();
        set.add(key);
        saveReadKeys(set);
    }

    window.markAllNotificationsRead = function () {
        const set = readKeys();
        items.forEach(n => set.add(n.key));
        saveReadKeys(set);
        render();
        updateBadge();
    };

    // ---------------------------------------------------------------
    // Hilfen
    // ---------------------------------------------------------------
    function dayDiff(dateLike) {
        const d = new Date(dateLike);
        if (isNaN(d)) return null;
        return Math.round((new Date(d).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86400000);
    }

    function fmtDate(dateLike) {
        const d = new Date(dateLike);
        if (isNaN(d)) return '';
        return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }

    function relLabel(diff) {
        if (diff === null) return '';
        if (diff < -1) return `seit ${Math.abs(diff)} Tagen überfällig`;
        if (diff === -1) return 'seit gestern überfällig';
        if (diff === 0) return 'heute fällig';
        if (diff === 1) return 'morgen fällig';
        return `in ${diff} Tagen fällig`;
    }

    function isAssignedToMe(arr) {
        const uid = currentUserId();
        if (!uid || !Array.isArray(arr)) return false;
        const name = (currentUser() && currentUser().name || '').toLowerCase().trim();
        return arr.some(v => {
            const s = String(v).toLowerCase().trim();
            return s === uid.toLowerCase() || (name && s === name);
        });
    }

    // ---------------------------------------------------------------
    // Daten sammeln
    // ---------------------------------------------------------------
    async function collect() {
        const uid = currentUserId();
        if (!uid || !sb()) return [];

        const out = [];
        const P = prefs();

        // Alles, was länger überfällig ist als der eingestellte Rückblick,
        // taucht gar nicht erst auf.
        const inRange = (diff, before) => diff !== null && diff <= before && diff >= -P.after;

        // --- Vorgänge (internal_processes) ---
        let processes = [];
        if (P.processes) try {
            let { data, error } = await sb()
                .from('internal_processes')
                .select('*, machines(name, manufacturer, serial), customers(id, name)')
                .neq('status', 'erledigt')
                .order('process_date', { ascending: false })
                .limit(300);
            if (error) {
                // customers-Join fehlt evtl. noch (Migration nicht gelaufen)
                ({ data, error } = await sb()
                    .from('internal_processes')
                    .select('*, machines(name, manufacturer, serial)')
                    .neq('status', 'erledigt')
                    .order('process_date', { ascending: false })
                    .limit(300));
            }
            if (error) throw error;
            processes = data || [];
        } catch (err) {
            console.warn('Benachrichtigungen: Vorgänge nicht ladbar:', err.message || err);
        }

        processes.forEach(p => {
            const mine = isAssignedToMe(p.assigned_users);
            const isCreator = String(p.user_id) === uid;
            if (!mine && !isCreator) return;

            const subject = subjectLabel(p);
            const steps = Array.isArray(p.steps) ? p.steps : [];
            const openSteps = steps.filter(s => !s.done).length;

            // Pro Vorgang entsteht höchstens EIN Eintrag. Es können mehrere
            // Gründe zutreffen (Erinnerung + Zuweisung + offene Schritte) —
            // ausgegeben wird nur der dringendste. Die übrigen Gründe hängen
            // als Zusatz an der Meta-Zeile, damit nichts verloren geht.
            const reminderDiff = p.remind_at ? dayDiff(p.remind_at) : null;
            const hasReminder = inRange(reminderDiff, P.before);

            let item;
            if (hasReminder) {
                item = {
                    key: `proc:${p.id}:remind:${p.remind_at}`,
                    kind: 'reminder',
                    severity: reminderDiff < 0 ? 'overdue' : (reminderDiff === 0 ? 'today' : 'soon'),
                    meta: `Erinnerung · ${relLabel(reminderDiff)} · ${fmtDate(p.remind_at)}`,
                    sortAt: new Date(p.remind_at).getTime()
                };
            } else if (mine && openSteps > 0) {
                item = {
                    // Bewusst ohne Zähler im Schlüssel: sonst gilt der Eintrag
                    // nach jedem abgehakten Schritt wieder als ungelesen.
                    key: `proc:${p.id}:steps`,
                    kind: 'steps',
                    severity: 'info',
                    meta: `${openSteps} offene${openSteps === 1 ? 'r' : ''} Schritt${openSteps === 1 ? '' : 'e'} von ${steps.length}`,
                    sortAt: new Date(p.process_date || 0).getTime()
                };
            } else if (mine) {
                item = {
                    key: `proc:${p.id}:assigned`,
                    kind: 'assigned',
                    severity: 'info',
                    meta: `Dir zugewiesen · ${fmtDate(p.process_date || p.created_at)}`,
                    sortAt: new Date(p.process_date || p.created_at || 0).getTime()
                };
            } else {
                return; // nur Ersteller, ohne Erinnerung -> nicht melden
            }

            // Zusatzgründe anhängen, statt einen zweiten Eintrag zu erzeugen
            const extras = [];
            if (item.kind !== 'steps' && mine && openSteps > 0) {
                extras.push(`${openSteps} offene${openSteps === 1 ? 'r' : ''} Schritt${openSteps === 1 ? '' : 'e'}`);
            }
            if (item.kind === 'reminder' && mine) extras.push('dir zugewiesen');
            if (extras.length) item.meta += ' · ' + extras.join(' · ');

            item.title = p.title || 'Unbenannter Vorgang';
            item.subject = subject;
            item.targetType = 'process';
            item.targetId = p.id;
            out.push(item);

            // Schritt-Erinnerungen: jeder offene Schritt mit remind_at ergibt
            // einen eigenen Eintrag (unabhängig vom Vorgangs-Eintrag oben).
            steps.forEach((s, si) => {
                if (!s.remind_at || s.done) return;
                if (!mine && !isCreator) return;
                const sd = dayDiff(s.remind_at);
                if (!inRange(sd, P.before)) return;
                out.push({
                    key: `proc:${p.id}:step:${si}:remind:${s.remind_at}`,
                    kind: 'reminder',
                    severity: sd < 0 ? 'overdue' : (sd === 0 ? 'today' : 'soon'),
                    meta: `Schritt-Erinnerung · ${relLabel(sd)} · ${fmtDate(s.remind_at)}`,
                    sortAt: new Date(s.remind_at).getTime(),
                    title: (s.text || 'Schritt') + ' — ' + (p.title || 'Vorgang'),
                    subject: subject,
                    targetType: 'process',
                    targetId: p.id
                });
            });
        });

        // --- Aufgaben (tasks) mit Fälligkeitsdatum ---
        if (P.tasks) try {
            const { data, error } = await sb()
                .from('tasks')
                .select('id, title, due_date, status, assigned_to, machines(name, manufacturer)')
                .neq('status', 'completed')
                .not('due_date', 'is', null)
                .limit(200);
            if (!error && data) {
                data.forEach(t => {
                    if (!isAssignedToMe(t.assigned_to)) return;
                    const diff = dayDiff(t.due_date);
                    if (!inRange(diff, P.before)) return;
                    out.push({
                        key: `task-due:${t.id}:${t.due_date}`,
                        kind: 'deadline',
                        severity: diff < 0 ? 'overdue' : (diff === 0 ? 'today' : 'soon'),
                        title: t.title || 'Unbenannte Aufgabe',
                        subject: t.machines ? `${t.machines.manufacturer || ''} ${t.machines.name || ''}`.trim() : '',
                        meta: `Aufgabe · ${relLabel(diff)} · ${fmtDate(t.due_date)}`,
                        sortAt: new Date(t.due_date).getTime(),
                        targetType: 'task',
                        targetId: t.id
                    });
                });
            }
        } catch (err) {
            // tasks.due_date evtl. nicht vorhanden -> Aufgaben still überspringen
            console.warn('Benachrichtigungen: Aufgaben nicht ladbar:', err.message || err);
        }

        // --- Wartungen (machines.next_maintenance) ---
        // Betrifft alle, nicht nur den angemeldeten Benutzer: eine überfällige
        // Wartung ist für jeden wichtig. Deshalb hier ohne Zuweisungsfilter.
        if (P.maintenance) try {
            const { data, error } = await sb()
                .from('machines')
                .select('id, name, manufacturer, serial, next_maintenance')
                .not('next_maintenance', 'is', null)
                .limit(400);
            if (!error && data) {
                data.forEach(m => {
                    const diff = dayDiff(m.next_maintenance);
                    if (!inRange(diff, P.maintBefore)) return;
                    const label = [m.manufacturer, m.name].filter(Boolean).join(' ') +
                        (m.serial ? ` #${m.serial}` : '');
                    out.push({
                        key: `maint:${m.id}:${m.next_maintenance}`,
                        kind: 'maintenance',
                        severity: diff < 0 ? 'overdue' : (diff === 0 ? 'today' : 'soon'),
                        title: `Wartung ${diff < 0 ? 'überfällig' : (diff === 0 ? 'heute fällig' : 'fällig')}`,
                        subject: label || 'Maschine',
                        meta: `Wartung · ${relLabel(diff)} · ${fmtDate(m.next_maintenance)}`,
                        sortAt: new Date(m.next_maintenance).getTime(),
                        targetType: 'machine',
                        targetId: m.id
                    });
                });
            }
        } catch (err) {
            console.warn('Benachrichtigungen: Wartungen nicht ladbar:', err.message || err);
        }

        // --- Angebots-Erinnerungen (angebote.erinnerung) ---
        if (P.offers) try {
            const { data, error } = await sb()
                .from('angebote')
                .select('id, belegnummer, erinnerung, status, kundenmatchcode, customers(name)')
                .not('erinnerung', 'is', null)
                .limit(300);
            if (!error && data) {
                data.forEach(a => {
                    const diff = dayDiff(a.erinnerung);
                    if (!inRange(diff, P.before)) return;
                    // Abgeschlossene Angebote nicht mehr melden
                    const s = (a.status || '').toLowerCase();
                    if (/gewonnen|auftrag|bestellt|verkauft|angenommen|zusage|verloren|abgelehnt|absage|abgesagt|storniert|kein interesse/.test(s)) return;
                    const firma = ((a.customers && a.customers.name) || a.kundenmatchcode || '').split(',')[0].trim();
                    out.push({
                        key: `angebot:${a.id}:${a.erinnerung}`,
                        kind: 'offer',
                        severity: diff < 0 ? 'overdue' : (diff === 0 ? 'today' : 'soon'),
                        title: `Angebot ${a.belegnummer || ''}`.trim(),
                        subject: firma,
                        meta: `Angebot · Erinnerung ${relLabel(diff)} · ${fmtDate(a.erinnerung)}`,
                        sortAt: new Date(a.erinnerung).getTime(),
                        targetType: 'angebot',
                        targetId: a.id
                    });
                });
            }
        } catch (err) {
            console.warn('Benachrichtigungen: Angebote nicht ladbar:', err.message || err);
        }

        // --- Termine mit Teilnehmern (event_participants) ---
        // Zwei Sorten: Einladungen an mich, auf die ich noch nicht geantwortet
        // habe, und die Antworten der Kollegen auf meine eigenen Termine.
        if (P.appointments) try {
            const { data: parts, error } = await sb()
                .from('event_participants')
                .select('*')
                .or(`user_id.eq.${uid},invited_by.eq.${uid}`)
                .limit(400);
            if (error) throw error;

            const rows = parts || [];
            const eventIds = [...new Set(rows.map(p => p.event_id))];
            let eventsById = new Map();
            if (eventIds.length) {
                const { data: evs } = await sb()
                    .from('maintenance_events')
                    .select('*')
                    .in('id', eventIds);
                eventsById = new Map((evs || []).map(e => [String(e.id), e]));
            }

            rows.forEach(p => {
                const ev = eventsById.get(String(p.event_id));
                if (!ev) return;
                const day = ev.event_date || ev.start_date;
                const diff = dayDiff(day);
                const time = window.fmtAppointmentTime ? window.fmtAppointmentTime(ev.start_time) : '';
                const whenLabel = `${fmtDate(day)}${time ? ', ' + time + ' Uhr' : ''}`;
                const place = ev.location_label || '';

                // 1) Einladung an mich, noch unbeantwortet
                if (String(p.user_id) === uid && p.status === 'offen') {
                    if (diff !== null && diff < -P.after) return;   // längst vorbei
                    out.push({
                        key: `appt:${p.event_id}:invite`,
                        kind: 'appointment',
                        severity: diff !== null && diff < 0 ? 'overdue' : (diff === 0 ? 'today' : 'soon'),
                        title: ev.title || 'Termin',
                        subject: place,
                        meta: `Einladung von ${p.invited_by_name || 'einem Kollegen'} · ${whenLabel}`,
                        sortAt: new Date(day || 0).getTime(),
                        targetType: 'appointment',
                        targetId: p.event_id,
                        // Zusagen/Absagen direkt in der Liste
                        actionsHtml: window.appointmentResponseButtons
                            ? window.appointmentResponseButtons(p.event_id, p.status)
                            : ''
                    });
                    return;
                }

                // 2) Antwort auf einen Termin, zu dem ich eingeladen habe
                if (String(p.invited_by) === uid && p.status !== 'offen' && String(p.user_id) !== uid) {
                    const respDiff = p.responded_at ? dayDiff(p.responded_at) : null;
                    if (respDiff !== null && respDiff < -P.after) return;
                    out.push({
                        key: `appt:${p.event_id}:resp:${p.user_id}:${p.status}:${p.responded_at || ''}`,
                        kind: 'appointment',
                        severity: p.status === 'abgesagt' ? 'today' : 'info',
                        title: window.appointmentResponseLabel
                            ? window.appointmentResponseLabel(p)
                            : `${p.user_name || 'Ein Kollege'} hat ${p.status}`,
                        subject: ev.title || 'Termin',
                        meta: `Termin · ${whenLabel}`,
                        sortAt: new Date(p.responded_at || day || 0).getTime(),
                        targetType: 'appointment',
                        targetId: p.event_id
                    });
                }
            });
        } catch (err) {
            // Tabelle fehlt (Migration nicht gelaufen) -> Termine still überspringen
            console.warn('Benachrichtigungen: Termine nicht ladbar:', err.message || err);
        }

        // Wichtigstes zuerst: überfällig -> heute -> demnächst -> Rest
        const rank = { overdue: 0, today: 1, soon: 2, info: 3 };
        out.sort((a, b) => (rank[a.severity] - rank[b.severity]) || (a.sortAt - b.sortAt));

        // Sicherung: pro Vorgang/Aufgabe nur ein Eintrag. Da bereits nach
        // Dringlichkeit sortiert ist, gewinnt automatisch der wichtigste.
        const seen = new Set();
        return out.filter(n => {
            // Termine sind ausgenommen: Einladung und die Antworten mehrerer
            // Kollegen betreffen denselben Termin, sollen aber einzeln stehen.
            const id = n.kind === 'appointment' ? n.key : `${n.targetType}:${n.targetId}`;
            if (seen.has(id)) return false;
            seen.add(id);
            return true;
        });
    }

    // Woran hängt der Vorgang: Maschine, Adresse oder Werkstattauftrag?
    function subjectLabel(p) {
        if (p.machines) {
            return `${p.machines.manufacturer || ''} ${p.machines.name || ''}`.trim() +
                (p.machines.serial ? ` #${p.machines.serial}` : '');
        }
        if (p.customers && p.customers.name) return p.customers.name;
        if (p.customer_id) return 'Adresse';
        if (p.workshop_order_number) return `Werkstattauftrag ${p.workshop_order_number}`;
        return '';
    }

    // ---------------------------------------------------------------
    // Darstellung
    // ---------------------------------------------------------------
    const SEVERITY = {
        overdue: { color: '#f87171', bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.4)', label: 'Überfällig' },
        today: { color: '#fbbf24', bg: 'rgba(251,191,36,0.12)', border: 'rgba(251,191,36,0.4)', label: 'Heute' },
        soon: { color: '#38bdf8', bg: 'rgba(56,189,248,0.12)', border: 'rgba(56,189,248,0.35)', label: 'Demnächst' },
        info: { color: '#a78bfa', bg: 'rgba(167,139,250,0.12)', border: 'rgba(167,139,250,0.35)', label: 'Info' }
    };

    const KIND_ICON = {
        reminder: '<circle cx="12" cy="12" r="9"></circle><polyline points="12 7 12 12 15 14"></polyline>',
        deadline: '<circle cx="12" cy="12" r="9"></circle><polyline points="12 7 12 12 15 14"></polyline>',
        assigned: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle>',
        steps: '<line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line>',
        maintenance: '<circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>',
        offer: '<path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>',
        appointment: '<rect x="3" y="4" width="18" height="18" rx="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line>'
    };

    function unreadCount() {
        const read = readKeys();
        return items.filter(n => !read.has(n.key)).length;
    }

    function updateBadge() {
        const badge = document.getElementById('notif-badge');
        const bell = document.getElementById('notif-bell-btn');
        if (!badge || !bell) return;
        const n = unreadCount();
        if (n > 0) {
            badge.textContent = n > 99 ? '99+' : String(n);
            badge.style.display = 'flex';
            bell.classList.add('has-unread');
        } else {
            badge.style.display = 'none';
            bell.classList.remove('has-unread');
        }
    }

    function itemHtml(n, isRead) {
        const sev = SEVERITY[n.severity] || SEVERITY.info;
        // Einträge mit eigenen Knöpfen (Termin zusagen/absagen) dürfen kein
        // <button> sein — verschachtelte Knöpfe sind ungültig und der Browser
        // zieht sie aus dem Element heraus. Der Klick-Handler hängt ohnehin
        // an [data-notif-key], nicht am Elementtyp.
        const tag = n.actionsHtml ? 'div' : 'button';
        return `
        <${tag} ${tag === 'button' ? 'type="button"' : 'role="button" tabindex="0"'} class="notif-item${isRead ? ' is-read' : ''}" data-notif-key="${esc(n.key)}"
                data-notif-target-type="${esc(n.targetType)}" data-notif-target-id="${esc(n.targetId)}">
            <span class="notif-item-icon" style="color:${sev.color}; background:${sev.bg}; border-color:${sev.border};">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${KIND_ICON[n.kind] || KIND_ICON.assigned}</svg>
            </span>
            <span class="notif-item-body">
                <span class="notif-item-title">${esc(n.title)}</span>
                ${n.subject ? `<span class="notif-item-subject">${esc(n.subject)}</span>` : ''}
                <span class="notif-item-meta" style="color:${sev.color};">${esc(n.meta)}</span>
            </span>
            ${n.actionsHtml || ''}
            ${isRead ? '' : '<span class="notif-item-dot"></span>'}
        </${tag}>`;
    }

    function render() {
        const list = document.getElementById('notif-list');
        if (!list) return;

        if (isLoading) {
            list.innerHTML = '<div class="notif-empty">Wird geladen …</div>';
            return;
        }

        if (!currentUserId()) {
            list.innerHTML = '<div class="notif-empty"><strong>Kein Benutzer gewählt</strong><span>Wähle rechts oben einen Benutzer aus, um deine Benachrichtigungen zu sehen.</span></div>';
            return;
        }

        if (!items.length) {
            list.innerHTML = '<div class="notif-empty"><strong>Alles erledigt</strong><span>Keine offenen Erinnerungen, Fristen oder Zuweisungen für dich.</span></div>';
            return;
        }

        const read = readKeys();
        const groups = [
            { sev: 'overdue', title: 'Überfällig' },
            { sev: 'today', title: 'Heute' },
            { sev: 'soon', title: 'Demnächst' },
            { sev: 'info', title: 'Deine Vorgänge' }
        ];

        let html = '';
        groups.forEach(g => {
            const rows = items.filter(n => n.severity === g.sev);
            if (!rows.length) return;
            const sev = SEVERITY[g.sev];
            html += `<div class="notif-group-title" style="color:${sev.color};">${g.title} <span>${rows.length}</span></div>`;
            html += rows.map(n => itemHtml(n, read.has(n.key))).join('');
        });
        list.innerHTML = html;
    }

    // ---------------------------------------------------------------
    // Einstellungs-Klappe (Zahnrad)
    // ---------------------------------------------------------------
    const PREF_TOGGLES = [
        { key: 'processes', label: 'Vorgänge' },
        { key: 'tasks', label: 'Aufgaben' },
        { key: 'maintenance', label: 'Wartung' },
        { key: 'offers', label: 'Angebote' },
        { key: 'appointments', label: 'Termine' }
    ];

    function renderSettings() {
        const box = document.getElementById('notif-settings');
        if (!box) return;
        const P = prefs();
        box.innerHTML = `
            <div class="notif-settings-group">
                ${PREF_TOGGLES.map(t => `
                    <label class="notif-settings-check">
                        <input type="checkbox" data-notif-pref="${t.key}" ${P[t.key] ? 'checked' : ''}>
                        <span>${t.label}</span>
                    </label>`).join('')}
            </div>
            <div class="notif-settings-group notif-settings-nums">
                <label class="notif-settings-num">
                    <span>Vorlauf</span>
                    <input type="number" min="0" max="365" data-notif-pref-num="before" value="${P.before}">
                    <em>Tage vorher</em>
                </label>
                <label class="notif-settings-num">
                    <span>Wartung</span>
                    <input type="number" min="0" max="365" data-notif-pref-num="maintBefore" value="${P.maintBefore}">
                    <em>Tage vorher</em>
                </label>
                <label class="notif-settings-num">
                    <span>Rückblick</span>
                    <input type="number" min="0" max="365" data-notif-pref-num="after" value="${P.after}">
                    <em>Tage überfällig</em>
                </label>
            </div>
            <div class="notif-settings-hint">Überfälliges verschwindet nach dem Rückblick-Zeitraum von selbst.</div>`;
    }

    window.toggleNotificationSettings = function (event) {
        if (event) event.stopPropagation();
        const box = document.getElementById('notif-settings');
        if (!box) return;
        const show = box.style.display === 'none' || !box.style.display;
        if (show) renderSettings();
        box.style.display = show ? 'block' : 'none';
        const btn = document.getElementById('notif-settings-btn');
        if (btn) btn.classList.toggle('active', show);
    };

    // Änderung an einer Einstellung -> speichern und neu einsammeln
    function onPrefChange(el) {
        if (el.dataset.notifPref) {
            savePrefs({ [el.dataset.notifPref]: el.checked });
        } else if (el.dataset.notifPrefNum) {
            const k = el.dataset.notifPrefNum;
            const v = clampDays(el.value, DEFAULT_PREFS[k]);
            el.value = v;
            savePrefs({ [k]: v });
        } else {
            return;
        }
        cache = { at: 0, data: null };
        refresh({ push: false });
    }

    document.addEventListener('change', (e) => {
        const el = e.target.closest('[data-notif-pref], [data-notif-pref-num]');
        if (el) { e.stopPropagation(); onPrefChange(el); }
    });

    // ---------------------------------------------------------------
    // Öffnen / Schließen / Laden
    // ---------------------------------------------------------------
    // opts.push === false -> keine Systemmeldungen auslösen. Das nutzt das
    // Öffnen des Panels: wer gerade hinschaut, braucht keine Meldung obendrauf.
    async function refresh(opts) {
        if (!currentUserId()) { items = []; render(); updateBadge(); return; }
        isLoading = true;
        if (isOpen) render();
        try {
            // maxAgeMs: 0 -> immer frisch laden, aktualisiert dabei den Cache
            // für einen unmittelbar folgenden Dashboard-Aufbau.
            items = await window.collectImportantItems({ maxAgeMs: 0 });
        } catch (err) {
            console.warn('Benachrichtigungen konnten nicht geladen werden:', err);
            items = [];
        }
        isLoading = false;
        render();
        updateBadge();
        if (!opts || opts.push !== false) pushUrgent();
    }
    window.refreshNotifications = refresh;

    // Gemeinsame Datenquelle für Glocke UND den Dashboard-Block "Heute wichtig".
    // Vorher hatte jede Stelle ihre eigene Logik und zeigte jeweils nur einen
    // Teil — dadurch fehlte an beiden Stellen etwas.
    // Kurz zwischengespeichert, damit ein Dashboard-Aufbau direkt nach dem
    // Laden der Glocke nicht alles erneut abfragt.
    let cache = { at: 0, data: null };
    window.collectImportantItems = async function (opts) {
        opts = opts || {};
        const maxAge = opts.maxAgeMs === undefined ? 30000 : opts.maxAgeMs;
        if (cache.data && (Date.now() - cache.at) < maxAge) return cache.data;
        const data = await collect();
        cache = { at: Date.now(), data };
        return data;
    };

    window.toggleNotificationPanel = function (event) {
        if (event) event.stopPropagation();
        const panel = document.getElementById('notif-panel');
        if (!panel) return;
        isOpen = !isOpen;
        panel.style.display = isOpen ? 'flex' : 'none';
        if (isOpen) {
            render();
            refresh({ push: false });
        }
    };

    function closePanel() {
        const panel = document.getElementById('notif-panel');
        if (panel) panel.style.display = 'none';
        const box = document.getElementById('notif-settings');
        if (box) box.style.display = 'none';
        const btn = document.getElementById('notif-settings-btn');
        if (btn) btn.classList.remove('active');
        isOpen = false;
    }
    window.closeNotificationPanel = closePanel;

    // Klick auf einen Eintrag -> zur betreffenden Stelle springen.
    // key ist optional: das Dashboard springt ohne Gelesen-Markierung.
    function goTo(targetType, targetId, key) {
        if (key) markRead(key);
        closePanel();
        updateBadge();

        const go = (view) => { if (typeof window.switchView === 'function') window.switchView(view); };

        if (targetType === 'process') {
            go('processes');
            setTimeout(() => {
                if (typeof window.openEditProcessModal === 'function') window.openEditProcessModal(targetId);
            }, 120);
        } else if (targetType === 'task') {
            go('tasks');
            setTimeout(() => {
                if (typeof window.openTaskModal === 'function') window.openTaskModal(targetId);
            }, 120);
        } else if (targetType === 'machine') {
            // Wartung: in den Kalender, dort auf überfällige Wartungen gefiltert
            if (window.eventsState) window.eventsState.statusFilter = 'overdue';
            go('calendar');
            setTimeout(() => {
                if (typeof window.switchEventsSubView === 'function') window.switchEventsSubView('calendar');
            }, 120);
        } else if (targetType === 'appointment') {
            // Termin: in den Kalender, dort steht er mit Uhrzeit und Teilnehmern
            go('calendar');
            setTimeout(() => {
                if (typeof window.switchEventsSubView === 'function') window.switchEventsSubView('calendar');
            }, 120);
        } else if (targetType === 'angebot') {
            go('listen');
            setTimeout(() => {
                if (typeof window.jumpToAngebotFromReminder === 'function') {
                    window.jumpToAngebotFromReminder(targetId);
                }
            }, 200);
        }
    }

    // Damit auch der Dashboard-Block "Heute wichtig" dieselbe Navigation nutzt
    window.openImportantItem = function (targetType, targetId) {
        goTo(targetType, targetId, null);
    };

    // ---------------------------------------------------------------
    // Verdrahtung
    // ---------------------------------------------------------------
    document.addEventListener('click', (e) => {
        const item = e.target.closest('[data-notif-key]');
        if (item) {
            goTo(item.dataset.notifTargetType, item.dataset.notifTargetId, item.dataset.notifKey);
            return;
        }
        // Klick außerhalb schließt das Panel
        if (isOpen && !e.target.closest('#notif-panel') && !e.target.closest('#notif-bell-btn')) {
            closePanel();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isOpen) closePanel();
    });

    // ---------------------------------------------------------------
    // Echte Browser-Benachrichtigungen (Systemmeldung außerhalb der App)
    // ---------------------------------------------------------------
    // Nur für wirklich Dringendes (überfällig / heute fällig) und je Eintrag
    // höchstens einmal — sonst wird man zugespammt.
    const PUSHED_KEY = 'meetra_notif_pushed_';

    function pushedKeys() {
        const uid = currentUserId();
        if (!uid) return new Set();
        try { return new Set(JSON.parse(localStorage.getItem(PUSHED_KEY + uid) || '[]')); }
        catch (e) { return new Set(); }
    }

    function savePushed(set) {
        const uid = currentUserId();
        if (uid) localStorage.setItem(PUSHED_KEY + uid, JSON.stringify([...set].slice(-300)));
    }

    window.notificationsPushEnabled = function () {
        return typeof Notification !== 'undefined' &&
            Notification.permission === 'granted' &&
            localStorage.getItem('meetra_push_enabled') !== 'off';
    };

    // Wird über den Schalter im Benachrichtigungs-Panel aufgerufen
    window.toggleNotificationPush = async function (event) {
        if (event) event.stopPropagation();
        if (typeof Notification === 'undefined') {
            window.showToast('Dieser Browser unterstützt keine Benachrichtigungen.', 'warn');
            return;
        }
        if (window.notificationsPushEnabled()) {
            localStorage.setItem('meetra_push_enabled', 'off');
            window.showToast('Benachrichtigungen ausgeschaltet.', 'info');
        } else {
            if (Notification.permission !== 'granted') {
                const res = await Notification.requestPermission();
                if (res !== 'granted') {
                    window.showToast('Der Browser hat Benachrichtigungen blockiert. Bitte in den Browser-Einstellungen für diese Seite erlauben.', 'warn');
                    renderPushToggle();
                    return;
                }
            }
            localStorage.setItem('meetra_push_enabled', 'on');
            window.showToast('Benachrichtigungen eingeschaltet.', 'success');
        }
        renderPushToggle();
    };

    function renderPushToggle() {
        const btn = document.getElementById('notif-push-toggle');
        if (!btn) return;
        const on = window.notificationsPushEnabled();
        btn.textContent = on ? '🔔 Meldungen an' : '🔕 Meldungen aus';
        btn.title = on
            ? 'Systemmeldungen bei fälligen Erinnerungen sind eingeschaltet'
            : 'Systemmeldungen einschalten (einmalige Erlaubnis nötig)';
    }

    function pushUrgent() {
        const pushed = pushedKeys();

        // Termine melden sich immer, auch wenn sie erst nächste Woche sind:
        // eine Einladung oder eine Zu-/Absage will man sofort mitbekommen.
        const urgent = items.filter(n =>
            (n.severity === 'overdue' || n.severity === 'today' || n.kind === 'appointment') && !pushed.has(n.key));
        if (!urgent.length) return;

        // Ohne erlaubte Systemmeldungen wenigstens im Fenster darauf hinweisen.
        if (!window.notificationsPushEnabled()) {
            const appts = urgent.filter(n => n.kind === 'appointment');
            appts.forEach(n => {
                if (typeof window.showToast === 'function') window.showToast(`${n.title} — ${n.meta}`);
                pushed.add(n.key);
            });
            if (appts.length) savePushed(pushed);
            return;
        }

        // Höchstens drei Meldungen auf einmal, der Rest wird zusammengefasst.
        urgent.slice(0, 3).forEach(n => {
            try {
                const note = new Notification(n.title, {
                    body: [n.subject, n.meta].filter(Boolean).join('\n'),
                    tag: n.key,
                    icon: 'assets/icons/meetra_arrows_icon.png'
                });
                note.onclick = () => {
                    window.focus();
                    goTo(n.targetType, n.targetId, n.key);
                    note.close();
                };
            } catch (e) {
                console.warn('Benachrichtigung konnte nicht angezeigt werden:', e);
            }
            pushed.add(n.key);
        });
        if (urgent.length > 3) {
            try {
                new Notification(`${urgent.length - 3} weitere fällige Einträge`, {
                    body: 'In der App unter der Glocke ansehen.',
                    tag: 'meetra-rest',
                    icon: 'assets/icons/meetra_arrows_icon.png'
                });
            } catch (e) { /* ignorieren */ }
            urgent.slice(3).forEach(n => pushed.add(n.key));
        }
        savePushed(pushed);
    }

    function setupRealtimeSubscriptions() {
        const client = sb();
        if (!client || typeof client.channel !== 'function') return;

        try {
            client.channel('public-updates')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'internal_processes' }, () => {
                    if (typeof window.fetchProcesses === 'function') window.fetchProcesses();
                    refresh();
                })
                .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => {
                    if (typeof window.fetchTasks === 'function') window.fetchTasks();
                    refresh();
                })
                .on('postgres_changes', { event: '*', schema: 'public', table: 'service_entries' }, () => {
                    if (typeof window.fetchServiceEntries === 'function') window.fetchServiceEntries();
                    refresh();
                })
                .subscribe((status) => {
                    if (status === 'SUBSCRIBED') {
                        console.log('[Realtime] Live updates subscribed successfully.');
                    }
                });
        } catch (e) {
            console.warn('[Realtime] Subscription error:', e);
        }
    }

    function init() {
        if (!document.getElementById('notif-bell-btn')) return;
        renderPushToggle();
        refresh();
        setupRealtimeSubscriptions();
        // Regelmäßig aktualisieren, damit Fristen von selbst hochkommen.
        setInterval(() => { if (!isOpen) refresh(); }, 5 * 60 * 1000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(init, 1200));
    } else {
        setTimeout(init, 1200);
    }
})();
