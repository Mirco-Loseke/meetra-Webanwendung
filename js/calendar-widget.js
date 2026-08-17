// ==========================================
// KALENDER-WIDGET (Icon rechts oben in der Topbar)
// ==========================================
// Zeigt in einem Panel alle terminierten Dinge an einer Stelle:
//
//   - Wartungen (machines.next_maintenance + maintenance_events mit Maschine)
//   - Servicebericht-Termine (service_entries.date)
//   - Erinnerungen für Vorgänge (internal_processes.remind_at)
//   - Aufgaben mit Fälligkeitsdatum (tasks.due_date)
//   - Angebots-Erinnerungen (angebote.erinnerung)
//   - Sonstige Erinnerungen / eigene Einträge (maintenance_events ohne Maschine)
//
// Oben ein Monatsraster mit Punkten je Tag, darunter die Liste. Gefiltert
// werden kann nach Art, Zeitraum ("Tag / Monat / Alles ab heute"), nur eigene
// Einträge sowie per Freitextsuche. Über den Vollbild-Knopf wird daraus eine
// große Monatsansicht, in der die Einträge direkt in den Tagen stehen.
//
// Neue Einträge landen in `maintenance_events`; die Art wird in
// `maintenance_types` mitgeschrieben, damit keine Migration nötig ist.
// ==========================================
(function () {
    'use strict';

    const TYPES = {
        wartung: { label: 'Wartungen', color: '#34d399', short: 'Wartung' },
        service: { label: 'Serviceberichte', color: '#22d3ee', short: 'Service' },
        vorgang: { label: 'Vorgänge', color: '#60a5fa', short: 'Vorgang' },
        aufgabe: { label: 'Aufgaben', color: '#fbbf24', short: 'Aufgabe' },
        angebot: { label: 'Angebote', color: '#f472b6', short: 'Angebot' },
        sonstige: { label: 'Sonstige', color: '#a78bfa', short: 'Erinnerung' }
    };
    const TYPE_KEYS = Object.keys(TYPES);

    const STORE_KEY = 'meetra_calwidget_filters';
    const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
    const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli',
        'August', 'September', 'Oktober', 'November', 'Dezember'];

    let entries = [];
    let isOpen = false;
    let isLoading = false;
    let loadedOnce = false;
    let formOpen = false;
    let editingId = null;
    let focusForm = false;

    const state = {
        cursor: startOfMonth(new Date()),   // angezeigter Monat
        selectedDay: null,                  // 'YYYY-MM-DD' oder null = ganzer Monat
        types: new Set(TYPE_KEYS),
        onlyMine: false,
        range: 'month',                     // 'month' | 'upcoming'
        search: '',
        full: false                         // Vollansicht (großer Kalender)
    };

    function sb() { return window.supabaseClient; }

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    // ---------------------------------------------------------------
    // Datums-Hilfen (alles lokal, ohne Zeitzonen-Verschiebung)
    // ---------------------------------------------------------------
    function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
    function todayKey() { return dayKey(new Date()); }

    function dayKey(dateLike) {
        const d = dateLike instanceof Date ? dateLike : new Date(dateLike);
        if (isNaN(d)) return null;
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    // Alle Tagesschlüssel von startKey bis endKey (einschliesslich). Deckelt
    // bei 60 Tagen, damit ein Tippfehler im Enddatum nicht den ganzen Kalender
    // mit einem einzigen Bericht zupflastert.
    function daysBetween(startKey, endKey) {
        if (!startKey) return [];
        if (!endKey || endKey <= startKey) return [startKey];
        const [ys, ms, ds] = startKey.split('-').map(Number);
        const [ye, me, de] = endKey.split('-').map(Number);
        const cur = new Date(ys, ms - 1, ds);
        const end = new Date(ye, me - 1, de);
        const keys = [];
        while (cur <= end && keys.length < 60) {
            keys.push(dayKey(cur));
            cur.setDate(cur.getDate() + 1);
        }
        return keys;
    }

    function fmtDate(key) {
        if (!key) return '';
        const [y, m, d] = key.split('-');
        return `${d}.${m}.${y}`;
    }

    function dayDiff(key) {
        if (!key) return null;
        const [y, m, d] = key.split('-').map(Number);
        return Math.round((new Date(y, m - 1, d).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86400000);
    }

    function relLabel(diff) {
        if (diff === null) return '';
        if (diff < -1) return `seit ${Math.abs(diff)} Tagen überfällig`;
        if (diff === -1) return 'seit gestern überfällig';
        if (diff === 0) return 'heute';
        if (diff === 1) return 'morgen';
        return `in ${diff} Tagen`;
    }

    function severityOf(diff) {
        if (diff === null) return 'info';
        if (diff < 0) return 'overdue';
        if (diff === 0) return 'today';
        return 'soon';
    }

    // ---------------------------------------------------------------
    // Benutzer
    // ---------------------------------------------------------------
    function currentUser() { return window.activeUser || window.currentUser || null; }

    function currentUserId() {
        const u = currentUser();
        if (u && u.id) return String(u.id);
        const stored = localStorage.getItem('activeUserId');
        return stored ? String(stored) : null;
    }

    function isMine(assigned, creatorId) {
        const uid = currentUserId();
        if (!uid) return false;
        if (creatorId != null && String(creatorId) === uid) return true;
        if (!Array.isArray(assigned)) return false;
        const name = ((currentUser() || {}).name || '').toLowerCase().trim();
        return assigned.some(v => {
            const s = String(v).toLowerCase().trim();
            return s === uid.toLowerCase() || (name && s === name);
        });
    }

    // ---------------------------------------------------------------
    // Filter merken
    // ---------------------------------------------------------------
    function saveFilters() {
        try {
            localStorage.setItem(STORE_KEY, JSON.stringify({
                types: [...state.types], known: TYPE_KEYS,
                onlyMine: state.onlyMine, range: state.range, full: state.full
            }));
        } catch (e) { /* Speicher voll o.ä. – Filter sind dann eben nicht persistent */ }
    }

    function loadFilters() {
        try {
            const raw = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
            if (!raw) return;
            if (Array.isArray(raw.types) && raw.types.length) {
                state.types = new Set(raw.types.filter(t => TYPE_KEYS.includes(t)));
                // Später hinzugekommene Arten waren beim Speichern noch unbekannt
                // und sollen sichtbar sein, statt stumm ausgeblendet zu bleiben.
                const known = Array.isArray(raw.known) ? raw.known : [];
                TYPE_KEYS.forEach(t => { if (!known.includes(t)) state.types.add(t); });
            }
            state.onlyMine = !!raw.onlyMine;
            state.full = !!raw.full;
            if (raw.range === 'month' || raw.range === 'upcoming') state.range = raw.range;
        } catch (e) { /* kaputter Eintrag – Standardfilter behalten */ }
    }

    // ---------------------------------------------------------------
    // Daten sammeln
    // ---------------------------------------------------------------
    async function collect() {
        const out = [];
        if (!sb()) return out;

        // --- Manuelle Einträge / sonstige Erinnerungen (maintenance_events) ---
        try {
            const { data, error } = await sb()
                .from('maintenance_events')
                .select('*, machines(name, manufacturer, serial)')
                .limit(500);
            if (!error && data) {
                // Teilnehmer der Termine dazuladen — daraus entstehen die
                // Daumen-Knöpfe und die Zeile „Meier zugesagt · Schulz offen".
                let partsByEvent = new Map();
                if (typeof window.loadParticipantsForEvents === 'function') {
                    partsByEvent = await window.loadParticipantsForEvents(data.map(e => e.id));
                }
                const uid = currentUserId();

                data.forEach(ev => {
                    const key = dayKey(ev.event_date || ev.start_date);
                    if (!key) return;
                    const m = ev.machines;
                    const machineLabel = m
                        ? `${m.manufacturer || ''} ${m.name || ''}`.trim() + (m.serial ? ` #${m.serial}` : '')
                        : (ev.manual_machine || '');
                    const participants = partsByEvent.get(String(ev.id)) || [];
                    const mineInvite = participants.find(p => String(p.user_id) === uid);
                    // Ohne Maschinenbezug ist es eine sonstige Erinnerung, sonst eine Wartung.
                    const type = (ev.machine_id || ev.manual_machine) ? 'wartung' : 'sonstige';
                    out.push({
                        id: `event:${ev.id}`,
                        type,
                        day: key,
                        time: window.fmtAppointmentTime ? window.fmtAppointmentTime(ev.start_time) : '',
                        title: ev.title || (machineLabel || 'Eintrag'),
                        subject: machineLabel || ev.location_label || '',
                        note: ev.description || '',
                        tag: ev.maintenance_types || '',
                        // Eingeladene sehen den Termin ebenfalls als „meinen".
                        mine: isMine(null, ev.user_id) || !!mineInvite,
                        editableId: ev.id,
                        eventId: ev.id,
                        participants,
                        myStatus: mineInvite ? mineInvite.status : null,
                        targetType: null
                    });
                });
            }
        } catch (err) {
            console.warn('Kalender: Einträge nicht ladbar:', err.message || err);
        }

        // --- Wartungen aus den Maschinen (live berechneter Termin) ---
        try {
            let machines = window.machineList;
            if (!Array.isArray(machines) || !machines.length) {
                const { data } = await sb()
                    .from('machines')
                    .select('id, name, manufacturer, serial, next_maintenance')
                    .not('next_maintenance', 'is', null)
                    .limit(600);
                machines = data || [];
            }
            machines.forEach(m => {
                const key = dayKey(m.next_maintenance);
                if (!key) return;
                const label = `${m.manufacturer || ''} ${m.name || ''}`.trim() + (m.serial ? ` #${m.serial}` : '');
                out.push({
                    id: `maint:${m.id}:${key}`,
                    type: 'wartung',
                    day: key,
                    title: 'Wartung fällig',
                    subject: label || 'Maschine',
                    note: '',
                    tag: '',
                    mine: false,
                    targetType: 'machine',
                    targetId: m.id
                });
            });
        } catch (err) {
            console.warn('Kalender: Wartungen nicht ladbar:', err.message || err);
        }

        // --- Servicebericht-Termine (service_entries.date) ---
        try {
            let { data, error } = await sb()
                .from('service_entries')
                .select('id, title, date, datum_von, datum_bis, technicians, is_finalized, machines(name, manufacturer, serial), customers(name)')
                .order('date', { ascending: false })
                .limit(600);
            if (error) {
                // Ohne Kunden-Beziehung erneut versuchen (Join existiert evtl. nicht)
                ({ data, error } = await sb()
                    .from('service_entries')
                    .select('id, title, date, datum_von, datum_bis, technicians, is_finalized, machines(name, manufacturer, serial)')
                    .order('date', { ascending: false })
                    .limit(600));
            }
            if (!error && data) {
                data.forEach(s => {
                    // Ein Bericht kann über mehrere Tage gehen (datum_von/datum_bis).
                    // Dann steht er an jedem Tag des Zeitraums im Kalender, damit
                    // man den Einsatz über die Tage hinweg sieht. `date` ist der
                    // Rückfall für Berichte ohne Zeitraum.
                    const startKey = dayKey(s.datum_von || s.date);
                    if (!startKey) return;
                    const endKey = dayKey(s.datum_bis) || startKey;
                    const days = daysBetween(startKey, endKey);
                    const m = s.machines;
                    const subject = m
                        ? `${m.manufacturer || ''} ${m.name || ''}`.trim() + (m.serial ? ` #${m.serial}` : '')
                        : ((s.customers && s.customers.name) || '');
                    const techs = Array.isArray(s.technicians) ? s.technicians : [];
                    days.forEach((key, i) => {
                        out.push({
                            id: `service:${s.id}:${key}`,
                            type: 'service',
                            day: key,
                            title: s.title || 'Servicebericht',
                            subject,
                            note: '',
                            tag: s.is_finalized ? 'abgeschlossen' : '',
                            mine: isMine(techs, null),
                            targetType: 'service',
                            targetId: s.id,
                            spanStart: startKey,
                            spanEnd: endKey,
                            spanIndex: i + 1,
                            spanTotal: days.length,
                            spanPos: days.length === 1 ? '' : (i === 0 ? 'start' : (i === days.length - 1 ? 'end' : 'mid'))
                        });
                    });
                });
            }
        } catch (err) {
            console.warn('Kalender: Serviceberichte nicht ladbar:', err.message || err);
        }

        // --- Erinnerungen an Vorgängen ---
        try {
            let { data, error } = await sb()
                .from('internal_processes')
                .select('id, title, remind_at, status, assigned_users, user_id, machines(name, manufacturer, serial), customers(name)')
                .not('remind_at', 'is', null)
                .limit(400);
            if (error) {
                // customers-Join fehlt evtl. noch (Migration nicht gelaufen)
                ({ data, error } = await sb()
                    .from('internal_processes')
                    .select('id, title, remind_at, status, assigned_users, user_id, machines(name, manufacturer, serial)')
                    .not('remind_at', 'is', null)
                    .limit(400));
            }
            if (!error && data) {
                data.forEach(p => {
                    const key = dayKey(p.remind_at);
                    if (!key) return;
                    const m = p.machines;
                    const subject = m
                        ? `${m.manufacturer || ''} ${m.name || ''}`.trim() + (m.serial ? ` #${m.serial}` : '')
                        : ((p.customers && p.customers.name) || '');
                    out.push({
                        id: `proc:${p.id}`,
                        type: 'vorgang',
                        day: key,
                        title: p.title || 'Unbenannter Vorgang',
                        subject,
                        note: '',
                        tag: p.status === 'erledigt' ? 'erledigt' : '',
                        done: p.status === 'erledigt',
                        mine: isMine(p.assigned_users, p.user_id),
                        targetType: 'process',
                        targetId: p.id
                    });
                });
            }
        } catch (err) {
            console.warn('Kalender: Vorgänge nicht ladbar:', err.message || err);
        }

        // --- Aufgaben mit Fälligkeitsdatum ---
        try {
            const { data, error } = await sb()
                .from('tasks')
                .select('id, title, due_date, status, assigned_to, machines(name, manufacturer)')
                .not('due_date', 'is', null)
                .limit(400);
            if (!error && data) {
                data.forEach(t => {
                    const key = dayKey(t.due_date);
                    if (!key) return;
                    out.push({
                        id: `task:${t.id}`,
                        type: 'aufgabe',
                        day: key,
                        title: t.title || 'Unbenannte Aufgabe',
                        subject: t.machines ? `${t.machines.manufacturer || ''} ${t.machines.name || ''}`.trim() : '',
                        note: '',
                        tag: t.status === 'completed' ? 'erledigt' : '',
                        done: t.status === 'completed',
                        mine: isMine(t.assigned_to, null),
                        targetType: 'task',
                        targetId: t.id
                    });
                });
            }
        } catch (err) {
            console.warn('Kalender: Aufgaben nicht ladbar:', err.message || err);
        }

        // --- Angebots-Erinnerungen ---
        try {
            const { data, error } = await sb()
                .from('angebote')
                .select('id, belegnummer, erinnerung, status, kundenmatchcode, customers(name)')
                .not('erinnerung', 'is', null)
                .limit(400);
            if (!error && data) {
                data.forEach(a => {
                    const key = dayKey(a.erinnerung);
                    if (!key) return;
                    const firma = ((a.customers && a.customers.name) || a.kundenmatchcode || '').split(',')[0].trim();
                    out.push({
                        id: `angebot:${a.id}`,
                        type: 'angebot',
                        day: key,
                        title: `Angebot ${a.belegnummer || ''}`.trim(),
                        subject: firma,
                        note: '',
                        tag: a.status || '',
                        mine: false,
                        targetType: 'angebot',
                        targetId: a.id
                    });
                });
            }
        } catch (err) {
            console.warn('Kalender: Angebote nicht ladbar:', err.message || err);
        }

        out.sort((a, b) => a.day.localeCompare(b.day) || a.title.localeCompare(b.title));
        return out;
    }

    // ---------------------------------------------------------------
    // Filter anwenden
    // ---------------------------------------------------------------
    function passesFilters(e) {
        if (!state.types.has(e.type)) return false;
        if (state.onlyMine && !e.mine) return false;
        if (state.search) {
            const hay = `${e.title} ${e.subject} ${e.note} ${e.tag}`.toLowerCase();
            if (!hay.includes(state.search)) return false;
        }
        return true;
    }

    // Die Punkte im Raster hängen nur an Art/Suche, nicht am gewählten Tag.
    function monthEntries() {
        const y = state.cursor.getFullYear();
        const m = String(state.cursor.getMonth() + 1).padStart(2, '0');
        const prefix = `${y}-${m}-`;
        return entries.filter(e => e.day.startsWith(prefix) && passesFilters(e));
    }

    function listEntries() {
        if (state.selectedDay) {
            return entries.filter(e => e.day === state.selectedDay && passesFilters(e));
        }
        if (state.range === 'upcoming') {
            const today = todayKey();
            return entries.filter(e => e.day >= today && passesFilters(e)).slice(0, 200);
        }
        return monthEntries();
    }

    // ---------------------------------------------------------------
    // Darstellung
    // ---------------------------------------------------------------
    function renderGrid() {
        const first = startOfMonth(state.cursor);
        const offset = (first.getDay() + 6) % 7;           // Woche beginnt montags
        const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
        const today = todayKey();

        // Punkte je Tag nach Art zusammenfassen
        const byDay = {};
        const rowsByDay = {};
        monthEntries().forEach(e => {
            (byDay[e.day] = byDay[e.day] || new Set()).add(e.type);
            (rowsByDay[e.day] = rowsByDay[e.day] || []).push(e);
        });

        let html = WEEKDAYS.map(w => `<span class="calw-wd">${w}</span>`).join('');
        for (let i = 0; i < offset; i++) html += '<span class="calw-cell is-empty"></span>';

        for (let d = 1; d <= daysInMonth; d++) {
            const key = `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const types = byDay[key] ? [...byDay[key]] : [];
            const cls = [
                'calw-cell',
                key === today ? 'is-today' : '',
                key === state.selectedDay ? 'is-selected' : '',
                types.length ? 'has-events' : ''
            ].filter(Boolean).join(' ');
            const dots = types.slice(0, 5)
                .map(t => `<i style="background:${TYPES[t].color}"></i>`).join('');

            // In der Vollansicht ist Platz für die Titel selbst statt nur Punkte.
            let body = `<span class="calw-dots">${dots}</span>`;
            if (state.full) {
                const rows = rowsByDay[key] || [];
                body = rows.slice(0, 4).map(r => {
                    // Mehrtägiges: als durchgehender Balken über die Tage. Nur am
                    // ersten Tag steht der Titel, danach zeigt der Balken die
                    // Fortsetzung — sonst steht derselbe Text viermal im Monat.
                    const span = r.spanTotal > 1;
                    const cls = 'calw-cell-item' + (span ? ' is-span span-' + r.spanPos : '');
                    const tip = r.title + (r.subject ? ' – ' + r.subject : '')
                        + (span ? ` (${fmtDate(r.spanStart)} – ${fmtDate(r.spanEnd)}, Tag ${r.spanIndex} von ${r.spanTotal})` : '');
                    const label = (span && r.spanPos !== 'start') ? '' : esc(r.title);
                    return `<span class="${cls}" style="--calw-type:${TYPES[r.type].color};" title="${esc(tip)}">
                        <i></i>${label}
                    </span>`;
                }).join('');
                if (rows.length > 4) body += `<span class="calw-cell-more">+${rows.length - 4} weitere</span>`;
            }

            html += `<button type="button" class="${cls}" data-calw-day="${key}">
                <span class="calw-cell-num">${d}</span>
                ${body}
            </button>`;
        }
        return html;
    }

    function entryHtml(e) {
        const t = TYPES[e.type];
        const diff = dayDiff(e.day);
        const sev = e.done ? 'done' : severityOf(diff);
        const clickable = !!e.targetType;
        // Mehrtägiger Eintrag: Zeitraum und "Tag x von y" statt nur des Datums.
        const spanNote = e.spanTotal > 1
            ? `${fmtDate(e.spanStart)} – ${fmtDate(e.spanEnd)} · Tag ${e.spanIndex} von ${e.spanTotal}`
            : '';
        return `<div class="calw-entry sev-${sev}${e.done ? ' is-done' : ''}${clickable ? ' is-clickable' : ''}${e.spanTotal > 1 ? ' is-span span-' + e.spanPos : ''}"
                     style="--calw-type:${t.color};"
                     ${clickable ? `data-calw-target-type="${esc(e.targetType)}" data-calw-target-id="${esc(e.targetId)}"` : ''}>
            <span class="calw-entry-bar"></span>
            <div class="calw-entry-body">
                <div class="calw-entry-top">
                    <span class="calw-entry-title">${e.time ? `<span class="calw-entry-time">${esc(e.time)}</span> ` : ''}${esc(e.title)}</span>
                    <span class="calw-entry-type" style="color:${t.color};">${t.short}</span>
                </div>
                ${e.subject ? `<div class="calw-entry-subject">${esc(e.subject)}</div>` : ''}
                <div class="calw-entry-meta">${spanNote || fmtDate(e.day)}${e.time ? ' · ' + esc(e.time) + ' Uhr' : ''}${e.done ? ' · erledigt' : (diff !== null ? ' · ' + relLabel(diff) : '')}${e.tag && !e.done ? ' · ' + esc(e.tag) : ''}</div>
                ${e.note ? `<div class="calw-entry-note">${esc(e.note)}</div>` : ''}
                ${e.participants && e.participants.length && window.appointmentParticipantsLine
                    ? `<div class="calw-entry-parts">${window.appointmentParticipantsLine(e.participants)}</div>` : ''}
            </div>
            ${e.myStatus && window.appointmentResponseButtons
                ? window.appointmentResponseButtons(e.eventId, e.myStatus) : ''}
            ${e.editableId ? `<button type="button" class="calw-entry-edit" data-calw-edit="${esc(e.editableId)}" title="Eintrag bearbeiten">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"></path></svg>
            </button>` : ''}
        </div>`;
    }

    function renderList() {
        if (isLoading) return '<div class="calw-empty">Wird geladen …</div>';

        const rows = listEntries();
        if (!rows.length) {
            return `<div class="calw-empty"><strong>Nichts eingetragen</strong>
                <span>${state.selectedDay ? 'Für diesen Tag gibt es keine Einträge.' : 'In diesem Zeitraum gibt es nichts, was zu den Filtern passt.'}</span></div>`;
        }

        // Nach Tag gruppieren, damit die Liste lesbar bleibt
        let html = '';
        let lastDay = null;
        rows.forEach(e => {
            if (e.day !== lastDay) {
                lastDay = e.day;
                const diff = dayDiff(e.day);
                html += `<div class="calw-day-head"><span>${fmtDate(e.day)}</span><small>${relLabel(diff)}</small></div>`;
            }
            html += entryHtml(e);
        });
        return html;
    }

    function renderFilters() {
        const chips = TYPE_KEYS.map(k => {
            const on = state.types.has(k);
            return `<button type="button" class="calw-chip${on ? ' is-on' : ''}" data-calw-type="${k}"
                        style="--calw-type:${TYPES[k].color};">
                <i></i>${TYPES[k].label}
            </button>`;
        }).join('');

        return `
        <div class="calw-filters">
            <div class="calw-chips">${chips}</div>
            <div class="calw-filter-row">
                <div class="calw-search">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                    <input type="text" id="calw-search-input" placeholder="Suchen …" value="${esc(state.search)}" autocomplete="off">
                </div>
                <button type="button" class="calw-toggle${state.onlyMine ? ' is-on' : ''}" data-calw-mine="1">Nur meine</button>
                <button type="button" class="calw-toggle${state.range === 'upcoming' ? ' is-on' : ''}" data-calw-range="1" title="Alles ab heute statt nur diesen Monat">Ab heute</button>
            </div>
        </div>`;
    }

    function renderForm() {
        if (!formOpen) return '';
        const machines = (window.machineList || []).slice(0, 800);
        const opts = machines.map(m =>
            `<option value="${esc(m.id)}">${esc(`${m.manufacturer || ''} ${m.name || ''} (#${m.serial || '?'})`.trim())}</option>`).join('');
        return `
        <form class="calw-form" id="calw-form">
            <div class="calw-form-title">${editingId ? 'Eintrag bearbeiten' : 'Neuer Eintrag'}</div>
            <input type="text" id="calw-f-title" placeholder="Titel *" required>
            <div class="calw-form-row">
                <input type="date" id="calw-f-date" required>
                <select id="calw-f-kind">
                    <option value="Erinnerung">Erinnerung</option>
                    <option value="Termin">Termin</option>
                    <option value="Wartung">Wartung</option>
                </select>
            </div>
            <select id="calw-f-machine">
                <option value="">Keine Maschine zugeordnet</option>
                ${opts}
            </select>
            <textarea id="calw-f-note" rows="2" placeholder="Notiz (optional)"></textarea>
            <div class="calw-form-actions">
                ${editingId ? '<button type="button" class="calw-btn danger" data-calw-delete="1">Löschen</button>' : ''}
                <button type="button" class="calw-btn" data-calw-cancel="1">Abbrechen</button>
                <button type="submit" class="calw-btn primary">Speichern</button>
            </div>
        </form>`;
    }

    // In der Vollansicht muss das Panel direkt an <body> hängen. Im Topbar
    // (position:fixed, z-index:999) sitzt es sonst in dessen Stacking-Context —
    // sein z-index:10060 wirkt dann nur dort, und die Abdunkel-/Blur-Ebene
    // body.calw-full-open::before (z-index:10055, Root-Context) legt sich
    // darüber: Hintergrund verschwommen, Kalender unsichtbar.
    function placePanel(panel) {
        const wrapper = document.querySelector('.calw-wrapper');
        const target = state.full ? document.body : wrapper;
        if (target && panel.parentElement !== target) target.appendChild(panel);
    }

    function render() {
        const panel = document.getElementById('calw-panel');
        if (!panel) return;

        // Bereits Getipptes retten: das Panel wird beim Filtern/Blättern neu
        // aufgebaut, das offene Formular soll dabei nicht leer werden.
        if (formOpen && !formPreset) captureForm();

        const monthLabel = `${MONTHS[state.cursor.getMonth()]} ${state.cursor.getFullYear()}`;
        const listTitle = state.selectedDay
            ? fmtDate(state.selectedDay)
            : (state.range === 'upcoming' ? 'Ab heute' : monthLabel);

        panel.innerHTML = `
        <div class="calw-head">
            <div>
                <h3>Kalender</h3>
                <span class="calw-head-sub">Wartungen, Erinnerungen und Termine</span>
            </div>
            <div class="calw-head-actions">
                <button type="button" class="calw-icon-btn" data-calw-new="1" title="Neuen Eintrag anlegen">
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                </button>
                <button type="button" class="calw-icon-btn" data-calw-full="1" title="${state.full ? 'Vollansicht beenden' : 'Vollansicht'}">
                    ${state.full
                ? '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 14 10 14 10 20"></polyline><polyline points="20 10 14 10 14 4"></polyline><line x1="14" y1="10" x2="21" y2="3"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>'
                : '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>'}
                </button>
                <button type="button" class="calw-icon-btn" data-calw-close="1" title="Schließen">
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            </div>
        </div>

        <div class="calw-scroll">
            ${renderForm()}

            <div class="calw-main">
            <div class="calw-col-cal">
            <div class="calw-month">
                <button type="button" class="calw-nav" data-calw-month="-1" title="Voriger Monat">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
                </button>
                <span class="calw-month-label">${monthLabel}</span>
                <button type="button" class="calw-nav" data-calw-month="1" title="Nächster Monat">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                </button>
                <button type="button" class="calw-today-btn" data-calw-today="1">Heute</button>
            </div>

            <div class="calw-grid">${renderGrid()}</div>
            </div>

            <div class="calw-col-side">
            ${renderFilters()}

            <div class="calw-list-head">
                <span>${esc(listTitle)}</span>
                ${state.selectedDay ? '<button type="button" class="calw-clear-day" data-calw-clear-day="1">ganzer Monat</button>' : ''}
            </div>
            <div class="calw-list">${renderList()}</div>
            </div>
            </div>
        </div>`;

        panel.classList.toggle('is-full', state.full);
        document.body.classList.toggle('calw-full-open', state.full);
        placePanel(panel);

        if (formOpen) fillForm();
    }

    // ---------------------------------------------------------------
    // Formular
    // ---------------------------------------------------------------
    let formPreset = null;

    function captureForm() {
        const form = document.getElementById('calw-form');
        if (!form) return;
        const val = id => (document.getElementById(id) || {}).value || '';
        formPreset = {
            title: val('calw-f-title'),
            date: val('calw-f-date'),
            kind: val('calw-f-kind'),
            machineId: val('calw-f-machine'),
            note: val('calw-f-note')
        };
    }

    function fillForm() {
        const dateEl = document.getElementById('calw-f-date');
        if (dateEl && !dateEl.value) {
            dateEl.value = formPreset && formPreset.date
                ? formPreset.date
                : (state.selectedDay || todayKey());
        }
        if (formPreset) {
            const set = (id, val) => { const el = document.getElementById(id); if (el && val != null) el.value = val; };
            set('calw-f-title', formPreset.title);
            set('calw-f-kind', formPreset.kind);
            set('calw-f-machine', formPreset.machineId || '');
            set('calw-f-note', formPreset.note);
            formPreset = null;
        }
        // Nur beim Öffnen in den Titel springen – nicht bei jedem Filter-Klick.
        if (focusForm) {
            focusForm = false;
            const titleEl = document.getElementById('calw-f-title');
            if (titleEl) titleEl.focus();
        }
    }

    async function openEditForm(id) {
        if (!sb()) return;
        const { data, error } = await sb().from('maintenance_events').select('*').eq('id', id).single();
        if (error || !data) {
            if (window.showToast) window.showToast('Eintrag konnte nicht geladen werden.');
            return;
        }
        editingId = id;
        formOpen = true;
        focusForm = true;
        const kinds = (data.maintenance_types || '').split(',').map(s => s.trim());
        formPreset = {
            title: data.title || '',
            date: dayKey(data.event_date || data.start_date) || todayKey(),
            kind: ['Erinnerung', 'Termin', 'Wartung'].find(k => kinds.includes(k)) || 'Erinnerung',
            machineId: data.machine_id ? String(data.machine_id) : '',
            note: data.description || ''
        };
        render();
    }

    async function submitForm() {
        const title = (document.getElementById('calw-f-title') || {}).value || '';
        const date = (document.getElementById('calw-f-date') || {}).value || '';
        const kind = (document.getElementById('calw-f-kind') || {}).value || 'Erinnerung';
        const machineId = (document.getElementById('calw-f-machine') || {}).value || '';
        const note = (document.getElementById('calw-f-note') || {}).value || '';

        if (!title.trim() || !date) {
            if (window.showToast) window.showToast('Titel und Datum werden benötigt.');
            return;
        }
        if (!sb()) return;

        const payload = {
            title: title.trim(),
            event_date: date,
            start_date: date,
            machine_id: machineId || null,
            maintenance_types: kind,
            description: note.trim() || null
        };

        let error;
        if (editingId) {
            ({ error } = await sb().from('maintenance_events').update(payload).eq('id', editingId));
        } else {
            payload.status = 'geplant';
            const uid = currentUserId();
            if (uid) payload.user_id = uid;
            ({ error } = await sb().from('maintenance_events').insert([payload]));
        }

        if (error) {
            console.error('Kalender: Speichern fehlgeschlagen:', error);
            if (window.showToast) window.showToast('Fehler beim Speichern: ' + error.message);
            return;
        }

        if (window.showToast) window.showToast(editingId ? 'Eintrag aktualisiert.' : 'Eintrag angelegt.');
        formOpen = false;
        editingId = null;
        formPreset = null;
        state.selectedDay = date;
        state.cursor = startOfMonth(new Date(date));
        await refresh();
    }

    async function deleteEntry() {
        if (!editingId || !sb()) return;
        if (!confirm('Diesen Kalendereintrag wirklich löschen?')) return;
        const { error } = await sb().from('maintenance_events').delete().eq('id', editingId);
        if (error) {
            if (window.showToast) window.showToast('Löschen fehlgeschlagen: ' + error.message);
            return;
        }
        if (window.showToast) window.showToast('Eintrag gelöscht.');
        formOpen = false;
        editingId = null;
        formPreset = null;
        await refresh();
    }

    // Servicebericht öffnen: erst in die Serviceberichte-Ansicht wechseln,
    // dann warten bis deren Liste geladen ist (openEditServicebericht greift
    // auf die dort gefüllte Liste zu).
    function openServiceReport(id) {
        if (typeof window.switchView === 'function') window.switchView('service');
        let tries = 0;
        const tick = () => {
            const list = window.serviceEntryList || [];
            const hit = list.find(e => String(e.id) === String(id));
            if (hit) {
                if (typeof window.openEditServicebericht === 'function') {
                    window.openEditServicebericht(hit.id);
                }
                return;
            }
            // Die Liste der Berichte lädt asynchron – ein paar Mal nachfassen.
            if (++tries < 14) setTimeout(tick, 300);
        };
        setTimeout(tick, 250);
    }

    // ---------------------------------------------------------------
    // Laden / Panel
    // ---------------------------------------------------------------
    async function refresh() {
        isLoading = true;
        if (isOpen) render();
        try {
            entries = await collect();
            loadedOnce = true;
        } catch (err) {
            console.warn('Kalender: Laden fehlgeschlagen:', err);
        } finally {
            isLoading = false;
            if (isOpen) render();
        }
    }

    function openPanel() {
        const panel = document.getElementById('calw-panel');
        if (!panel) return;
        isOpen = true;
        panel.style.display = 'flex';
        render();
        refresh();
    }

    function closePanel() {
        const panel = document.getElementById('calw-panel');
        if (panel) {
            panel.style.display = 'none';
            panel.classList.remove('is-full');
            const wrapper = document.querySelector('.calw-wrapper');
            if (wrapper && panel.parentElement !== wrapper) wrapper.appendChild(panel);
        }
        document.body.classList.remove('calw-full-open');
        isOpen = false;
        formOpen = false;
        editingId = null;
        formPreset = null;
    }

    window.toggleCalendarWidget = function (ev) {
        if (ev) ev.stopPropagation();
        if (isOpen) closePanel(); else openPanel();
    };
    window.closeCalendarWidget = closePanel;

    // Von außen: Panel öffnen und direkt einen neuen Eintrag anlegen
    window.openCalendarWidgetNewEntry = function (dateKey) {
        formOpen = true;
        editingId = null;
        focusForm = true;
        formPreset = { date: dateKey || todayKey() };
        if (!isOpen) openPanel(); else render();
    };

    // ---------------------------------------------------------------
    // Verdrahtung
    // ---------------------------------------------------------------
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('#calw-btn');
        if (btn) { window.toggleCalendarWidget(e); return; }

        const panel = e.target.closest('#calw-panel');
        if (!panel) {
            if (isOpen) closePanel();
            return;
        }

        const hit = (attr) => e.target.closest(`[${attr}]`);
        let el;

        if (hit('data-calw-close')) { closePanel(); return; }

        if (hit('data-calw-full')) { state.full = !state.full; saveFilters(); render(); return; }

        if ((el = hit('data-calw-new'))) {
            formOpen = !formOpen;
            editingId = null;
            focusForm = formOpen;
            if (!formOpen) formPreset = null;
            render();
            return;
        }

        if (hit('data-calw-cancel')) { formOpen = false; editingId = null; formPreset = null; render(); return; }
        if (hit('data-calw-delete')) { deleteEntry(); return; }

        if ((el = hit('data-calw-month'))) {
            const delta = Number(el.getAttribute('data-calw-month'));
            state.cursor = new Date(state.cursor.getFullYear(), state.cursor.getMonth() + delta, 1);
            state.selectedDay = null;
            render();
            return;
        }

        if (hit('data-calw-today')) {
            state.cursor = startOfMonth(new Date());
            state.selectedDay = todayKey();
            render();
            return;
        }

        if ((el = hit('data-calw-day'))) {
            const key = el.getAttribute('data-calw-day');
            state.selectedDay = (state.selectedDay === key) ? null : key;
            render();
            return;
        }

        if (hit('data-calw-clear-day')) { state.selectedDay = null; render(); return; }

        if ((el = hit('data-calw-type'))) {
            const t = el.getAttribute('data-calw-type');
            if (state.types.has(t)) state.types.delete(t); else state.types.add(t);
            // Ganz ohne Art wäre die Liste immer leer – dann wieder alle zeigen.
            if (!state.types.size) state.types = new Set(TYPE_KEYS);
            saveFilters();
            render();
            return;
        }

        if (hit('data-calw-mine')) { state.onlyMine = !state.onlyMine; saveFilters(); render(); return; }
        if (hit('data-calw-range')) {
            state.range = state.range === 'upcoming' ? 'month' : 'upcoming';
            state.selectedDay = null;
            saveFilters();
            render();
            return;
        }

        if ((el = hit('data-calw-edit'))) {
            e.stopPropagation();
            openEditForm(el.getAttribute('data-calw-edit'));
            return;
        }

        if ((el = hit('data-calw-target-type'))) {
            const type = el.getAttribute('data-calw-target-type');
            const id = el.getAttribute('data-calw-target-id');
            closePanel();
            if (type === 'service') openServiceReport(id);
            else if (typeof window.openImportantItem === 'function') window.openImportantItem(type, id);
            return;
        }
    });

    document.addEventListener('submit', (e) => {
        if (e.target && e.target.id === 'calw-form') {
            e.preventDefault();
            submitForm();
        }
    });

    // Suche: live filtern, ohne das Feld neu zu rendern (Fokus bliebe sonst nicht)
    let searchTimer = null;
    document.addEventListener('input', (e) => {
        if (!e.target || e.target.id !== 'calw-search-input') return;
        const val = e.target.value.toLowerCase().trim();
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
            state.search = val;
            const list = document.querySelector('#calw-panel .calw-list');
            const grid = document.querySelector('#calw-panel .calw-grid');
            if (list) list.innerHTML = renderList();
            if (grid) grid.innerHTML = renderGrid();
        }, 180);
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isOpen) closePanel();
    });

    loadFilters();

    // Daten einmal im Hintergrund vorladen, damit das Panel sofort gefüllt ist
    window.addEventListener('load', () => {
        setTimeout(() => { if (!loadedOnce && sb()) refresh(); }, 2500);
    });

    // Nach dem Speichern anderer Module den Kalender aktualisieren
    window.refreshCalendarWidget = refresh;
})();
