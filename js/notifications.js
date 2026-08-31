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
    //   push_*      = darf diese Sorte ein Fenster aufmachen (Systemmeldung)?
    //   pushLevel   = ab welcher Dringlichkeit überhaupt ein Fenster aufgeht:
    //                 'overdue' nur Überfälliges, 'today' auch heute Fälliges,
    //                 'all' jede Meldung. Termine gehen davon aus (siehe unten).
    //   repeat_*    = Abstand in Stunden, nach dem sich derselbe Eintrag erneut
    //                 melden darf. 0 = nur einmal (das war früher das feste
    //                 Verhalten). Je Sorte einstellbar, weil ein überfälliger
    //                 Termin anders drängt als ein Angebot.
    const DEFAULT_PREFS = {
        processes: true,
        tasks: true,
        maintenance: true,
        offers: true,
        appointments: true,
        service: true,
        addresses: true,
        push_processes: true,
        push_tasks: true,
        push_maintenance: true,
        push_offers: true,
        push_appointments: true,
        push_service: false,
        push_addresses: false,
        repeat_processes: 24,
        repeat_tasks: 24,
        repeat_maintenance: 72,
        repeat_offers: 72,
        repeat_appointments: 12,
        repeat_service: 0,
        repeat_addresses: 0,
        pushLevel: 'today',
        before: 3,
        after: 14,
        maintBefore: 30
    };

    // Welche Meldungsart gehört zu welchem Schalter oben. Neue Art ergänzen,
    // sonst greifen für sie weder Ein/Aus noch die Fenster-Einstellung.
    const KIND_GROUP = {
        reminder: 'processes',
        steps: 'processes',
        assigned: 'processes',
        deadline: 'tasks',
        maintenance: 'maintenance',
        offer: 'offers',
        appointment: 'appointments',
        service: 'service',
        address: 'addresses'
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
        schreibeInDatenbank(next);
        return next;
    }

    // ---------------------------------------------------------------
    // Einstellungen geräteübergreifend (Tabelle notification_preferences)
    // ---------------------------------------------------------------
    // localStorage bleibt der schnelle Zwischenspeicher: prefs() liest immer
    // von dort, damit nichts auf eine Abfrage warten muss. Die Datenbank ist
    // die gemeinsame Ablage — beim Start wird von dort geholt, bei jeder
    // Änderung dorthin geschrieben (verzögert, damit das Tippen in einem
    // Zahlenfeld nicht jede Ziffer einzeln schickt).
    // Migration: supabase/supabase_add_notification_prefs.sql
    const PREFS_TABLE = 'notification_preferences';
    let schreibTimer = null;
    let prefsTabelleFehlt = false;

    function schreibeInDatenbank(next) {
        const uid = currentUserId();
        if (!uid || !sb() || prefsTabelleFehlt) return;
        clearTimeout(schreibTimer);
        schreibTimer = setTimeout(async () => {
            try {
                const { error } = await sb().from(PREFS_TABLE)
                    .upsert({ user_id: uid, prefs: next, updated_at: new Date().toISOString() },
                            { onConflict: 'user_id' });
                if (error) throw error;
            } catch (err) {
                // Tabelle fehlt (Migration nicht gelaufen) -> still bei
                // localStorage bleiben, aber nur einmal warnen.
                if (!prefsTabelleFehlt) {
                    prefsTabelleFehlt = true;
                    console.warn('Benachrichtigungs-Einstellungen bleiben lokal — Migration '
                        + 'supabase_add_notification_prefs.sql noch nicht ausgeführt.', err.message || err);
                }
            }
        }, 600);
    }

    async function ladeAusDatenbank() {
        const uid = currentUserId();
        if (!uid || !sb()) return;
        try {
            const { data, error } = await sb().from(PREFS_TABLE)
                .select('prefs').eq('user_id', uid).maybeSingle();
            if (error) throw error;
            if (data && data.prefs && typeof data.prefs === 'object') {
                localStorage.setItem(PREFS_KEY_PREFIX + uid, JSON.stringify(data.prefs));
                if (typeof window.renderNotificationSettingsPage === 'function') {
                    window.renderNotificationSettingsPage();
                }
            } else {
                // Erster Start auf diesem Konto: den lokalen Stand hochschieben,
                // damit bereits Eingestelltes nicht verloren geht.
                schreibeInDatenbank(prefs());
            }
        } catch (err) {
            prefsTabelleFehlt = true;
            console.warn('Benachrichtigungs-Einstellungen konnten nicht geladen werden '
                + '(Migration supabase_add_notification_prefs.sql?):', err.message || err);
        }
    }
    window.reloadNotificationPrefs = ladeAusDatenbank;
    // Die Einstellungsseite (js/notification-settings.js) schreibt hierüber.
    window.saveNotificationPrefs = savePrefs;

    window.resetNotificationPrefs = function () {
        const uid = currentUserId();
        localStorage.removeItem(PREFS_KEY_PREFIX + (uid || 'anon'));
        schreibeInDatenbank(Object.assign({}, DEFAULT_PREFS));
        cache = { at: 0, data: null };
        refresh({ push: false });
    };

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
    // Abwesenheit erkennen (Wochenende, Urlaub, freier Tag)
    // ---------------------------------------------------------------
    // Die Liste wird ohnehin bei jedem Login neu berechnet — verpasst wird
    // also nichts, solange die Meldung im Rückblick-Fenster liegt. Genau das
    // ist die Lücke: nach mehreren Tagen ohne Anmeldung schnitt der feste
    // Rückblick still ab. Deshalb merken wir uns den letzten Besuch, dehnen
    // den Rückblick auf die Abwesenheit aus und weisen oben darauf hin.
    const LASTSEEN_PREFIX = 'meetra_notif_lastseen_';
    const ABSENCE_SEEN_PREFIX = 'meetra_notif_absence_seen_';

    // Einmal je Sitzung ermittelt — der Heartbeat unten überschreibt den
    // gespeicherten Zeitpunkt sofort, die Lücke wäre danach nicht mehr lesbar.
    // Beim Benutzerwechsel neu bestimmen — sonst gälte die Lücke des Vorgängers.
    let absence = null;      // { days, sinceTs } oder { days: 0 }
    let absenceUid = null;

    function detectAbsence() {
        const uid = currentUserId();
        if (!uid) return { days: 0 };
        const raw = parseInt(localStorage.getItem(LASTSEEN_PREFIX + uid) || '0', 10);
        if (!raw) return { days: 0 };
        const days = Math.floor((Date.now() - raw) / 86400000);
        return days >= 1 ? { days, sinceTs: raw } : { days: 0 };
    }

    function touchLastSeen() {
        const uid = currentUserId();
        if (uid) localStorage.setItem(LASTSEEN_PREFIX + uid, String(Date.now()));
    }

    function currentAbsence() {
        const uid = currentUserId();
        if (!absence || absenceUid !== uid) {
            absence = detectAbsence();
            absenceUid = uid;
        }
        return absence;
    }

    // Rückblick: mindestens die eingestellten Tage, bei längerer Abwesenheit
    // aber so weit zurück, dass nichts aus der Abwesenheit verlorengeht.
    function lookbackDays(P) {
        const a = currentAbsence();
        return Math.max(P.after, a.days ? a.days + 1 : 0);
    }

    function absenceNoticeDismissed() {
        const uid = currentUserId();
        const a = currentAbsence();
        if (!uid || !a.days) return true;
        return localStorage.getItem(ABSENCE_SEEN_PREFIX + uid) === String(a.sinceTs);
    }

    window.dismissAbsenceNotice = function (event) {
        if (event) event.stopPropagation();
        const uid = currentUserId();
        const a = currentAbsence();
        if (uid && a.days) localStorage.setItem(ABSENCE_SEEN_PREFIX + uid, String(a.sinceTs));
        render();
    };

    // Wie viele Meldungen sind während der Abwesenheit fällig geworden?
    function absenceItemCount() {
        const a = currentAbsence();
        if (!a.days) return 0;
        const now = Date.now();
        return items.filter(n => typeof n.sortAt === 'number' && n.sortAt >= a.sinceTs && n.sortAt <= now).length;
    }

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
        const back = lookbackDays(P);
        const inRange = (diff, before) => diff !== null && diff <= before && diff >= -back;

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
                // '*' statt fester Spaltenliste: erinnerung_by gibt es erst nach
                // der Migration, eine fest verdrahtete Spalte ließe sonst die
                // ganze Abfrage scheitern.
                .from('angebote')
                .select('*, customers(name)')
                .not('erinnerung', 'is', null)
                .limit(300);
            if (!error && data) {
                data.forEach(a => {
                    const diff = dayDiff(a.erinnerung);
                    if (!inRange(diff, P.before)) return;
                    // Eine Erinnerung gehört dem, der sie gesetzt hat. Steht dort
                    // niemand (Altbestand vor der Migration), sieht sie weiterhin
                    // jeder — sie soll nicht still verschwinden.
                    if (a.erinnerung_by && String(a.erinnerung_by) !== String(uid)) return;
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
                    if (diff !== null && diff < -back) return;   // längst vorbei
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
                    if (respDiff !== null && respDiff < -back) return;
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

        // --- Meine eigenen Termine (auch ohne eingeladene Kollegen) ---
        // Der Block oben geht über event_participants und erreicht damit nur
        // Termine MIT Teilnehmern. Ein Termin, den ich mir an einer Adresse
        // selbst eintrage, hat keine Teilnehmerzeile — und tauchte deshalb
        // nirgends auf. Genau der gehört mir und sonst niemandem.
        if (P.appointments) try {
            const { data, error } = await sb()
                .from('maintenance_events')
                .select('*, customers(name)')
                .limit(400);
            if (!error && data) {
                data.forEach(ev => {
                    // Termin, nicht Wartung: maintenance_events enthält beides,
                    // ein Typkennzeichen gibt es in den Daten nicht (CLAUDE.md).
                    // Ein Termin hat weder Maschine noch Wartungsart.
                    if (ev.machine_id || ev.manual_machine || ev.maintenance_types) return;

                    // Nur meine eigenen. user_id ODER created_by_user, weil
                    // js/appointments.js beides schreibt.
                    const meiner = String(ev.created_by_user || '') === String(uid)
                        || String(ev.user_id || '') === String(uid);
                    if (!meiner) return;

                    // Steht der Termin schon als Einladung an mich in der Liste,
                    // nicht zweimal melden.
                    if (out.some(o => o.key === `appt:${ev.id}:invite`)) return;

                    const day = ev.event_date || ev.start_date;
                    const diff = dayDiff(day);
                    if (!inRange(diff, P.before)) return;

                    const time = window.fmtAppointmentTime ? window.fmtAppointmentTime(ev.start_time) : '';
                    const wo = ev.location_label || (ev.customers && ev.customers.name) || '';
                    out.push({
                        key: `appt-own:${ev.id}:${day}`,
                        kind: 'appointment',
                        severity: diff < 0 ? 'overdue' : (diff === 0 ? 'today' : 'soon'),
                        title: ev.title || 'Termin',
                        subject: wo,
                        meta: `Dein Termin · ${fmtDate(day)}${time ? ', ' + time + ' Uhr' : ''}`,
                        sortAt: new Date(day || 0).getTime(),
                        targetType: 'appointment',
                        targetId: ev.id
                    });
                });
            }
        } catch (err) {
            console.warn('Benachrichtigungen: eigene Termine nicht ladbar:', err.message || err);
        }

        // --- Serviceberichte ohne Kundenunterschrift ---
        // Ein Bericht, unter dem die Unterschrift des Kunden fehlt, ist nicht
        // abgeschlossen — und fällt sonst niemandem auf. Gemeldet wird nur, was
        // mir gehört: in dieser App heißt das ID ODER Name in `technicians`,
        // weil dort mal das eine, mal das andere steht (siehe CLAUDE.md).
        if (P.service) try {
            const { data, error } = await sb()
                .from('service_entries')
                .select('id, title, date, created_at, technicians, customer_signature, machine_id, machines(name, manufacturer, serial)')
                .order('date', { ascending: false })
                .limit(300);
            if (!error && data) {
                const me = String(uid);
                const meName = (currentUser() && currentUser().name) ? String(currentUser().name) : null;
                data.forEach(s => {
                    if (s.customer_signature) return; // unterschrieben, alles gut
                    const techs = Array.isArray(s.technicians) ? s.technicians.map(String) : [];
                    if (techs.length && !techs.includes(me) && !(meName && techs.includes(meName))) return;
                    if (!techs.length) return; // niemand zuständig -> nicht meine Baustelle

                    // Der Bericht ist ab dem Tag danach "offen"; älter als der
                    // Vorlauf gilt als überfällig.
                    const diff = dayDiff(s.date);
                    if (diff === null || diff < -lookbackDays(P) || diff > 0) return;
                    const tage = Math.abs(diff);
                    const m = s.machines || {};
                    out.push({
                        key: `service:${s.id}:unsigned`,
                        kind: 'service',
                        severity: tage > P.before ? 'overdue' : (tage > 0 ? 'today' : 'info'),
                        title: 'Unterschrift fehlt',
                        subject: `${m.manufacturer || ''} ${m.name || ''}`.trim() + (m.serial ? ` #${m.serial}` : ''),
                        meta: `Servicebericht · ${s.title || ''} · ${fmtDate(s.date)}`.replace(' ·  ·', ' ·'),
                        sortAt: new Date(s.date || s.created_at || 0).getTime(),
                        targetType: 'service',
                        targetId: s.id
                    });
                });
            }
        } catch (err) {
            console.warn('Benachrichtigungen: Serviceberichte nicht ladbar:', err.message || err);
        }

        // --- Adressen: Wiedervorlagen aus der Historie einer Adresse ---
        // Ein Eintrag an einer Adresse gehört DEM, DER IHN ANGELEGT HAT.
        // Zuerst war es umgekehrt (jeder sah die Einträge der Kollegen) — das
        // war falsch: wer sich unter einer Adresse etwas notiert, will selbst
        // daran erinnert werden, nicht die halbe Firma benachrichtigen.
        // Wer andere beteiligen will, legt einen Termin an und lädt sie ein.
        if (P.addresses) try {
            const seit = new Date(Date.now() - lookbackDays(P) * 86400000).toISOString();
            const { data, error } = await sb()
                .from('customer_notes')
                .select('id, customer_id, entry_type, title, body, author, created_at, customers(name)')
                .gte('created_at', seit)
                .order('created_at', { ascending: false })
                .limit(200);
            if (!error && data) {
                const meName = (currentUser() && currentUser().name) ? String(currentUser().name) : null;
                const ARTEN = { note: 'Notiz', call: 'Anruf', email: 'E-Mail', visit: 'Besuch', meeting: 'Termin', system: 'System' };
                data.forEach(n => {
                    if (n.entry_type === 'system') return;
                    // Nur eigene Einträge. Ohne Namen am Eintrag (Altbestand)
                    // gehört er niemandem und wird nicht gemeldet.
                    const autor = String(n.author || '');
                    if (!autor || !meName || autor !== meName) return;
                    const diff = dayDiff(n.created_at);
                    out.push({
                        key: `note:${n.id}`,
                        kind: 'address',
                        severity: diff === 0 ? 'today' : 'info',
                        title: `${ARTEN[n.entry_type] || 'Eintrag'}: ${n.title || (n.body || '').slice(0, 60) || 'ohne Titel'}`,
                        subject: (n.customers && n.customers.name) || 'Adresse',
                        meta: `Adresse · dein Eintrag · ${fmtDate(n.created_at)}`,
                        sortAt: new Date(n.created_at || 0).getTime(),
                        targetType: 'customer',
                        targetId: n.customer_id
                    });
                });
            }
        } catch (err) {
            console.warn('Benachrichtigungen: Adress-Einträge nicht ladbar:', err.message || err);
        }

        // Wichtigstes zuerst: überfällig -> heute -> demnächst -> Rest
        const rank = { overdue: 0, today: 1, soon: 2, info: 3 };
        out.sort((a, b) => (rank[a.severity] - rank[b.severity]) || (a.sortAt - b.sortAt));

        // Sicherung: pro Vorgang/Aufgabe nur ein Eintrag. Da bereits nach
        // Dringlichkeit sortiert ist, gewinnt automatisch der wichtigste.
        const seen = new Set();
        return out.filter(n => {
            // Termine und Adress-Einträge sind ausgenommen: mehrere Antworten
            // zu einem Termin bzw. mehrere Notizen zu einer Adresse gehören
            // zwar zusammen, sollen aber einzeln stehen.
            const id = (n.kind === 'appointment' || n.kind === 'address') ? n.key : `${n.targetType}:${n.targetId}`;
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
        appointment: '<rect x="3" y="4" width="18" height="18" rx="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line>',
        service: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="17" x2="8" y2="17"></line>',
        address: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle>'
    };

    // Was für eine Sorte ist das? Name und Farbe je Gruppe — beides steht jetzt
    // an jedem Eintrag, damit auf einen Blick erkennbar ist, worum es geht.
    // Vorher unterschieden sich die Einträge nur in der Dringlichkeitsfarbe;
    // ob eine Zeile ein Termin oder ein Angebot war, stand allein im Kleingedruckten.
    const GROUP_META = {
        processes:    { label: 'Vorgang',        color: '#a78bfa' },
        tasks:        { label: 'Aufgabe',        color: '#38bdf8' },
        appointments: { label: 'Termin',         color: '#34d399' },
        maintenance:  { label: 'Wartung',        color: '#fbbf24' },
        offers:       { label: 'Angebot',        color: '#f472b6' },
        service:      { label: 'Servicebericht', color: '#fb923c' },
        addresses:    { label: 'Adresse',        color: '#22d3ee' }
    };

    function groupMeta(n) {
        return GROUP_META[KIND_GROUP[n.kind]] || { label: 'Hinweis', color: '#94a3b8' };
    }

    // Welche Sorte ist gerade ausgewählt? null = alle.
    let kindFilter = null;

    // ---------------------------------------------------------------
    // Vollansicht (wie beim Kalender-Widget)
    // ---------------------------------------------------------------
    // Das Panel ist mit 460px schnell zu klein, wenn zwanzig Einträge offen
    // sind. Derselbe Aufbau wie in js/calendar-widget.js: eine Klasse am Panel,
    // eine am body für die Abdunklung dahinter.
    let isFull = false;

    const SYM_AUF = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>';
    const SYM_ZU = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 14 10 14 10 20"></polyline><polyline points="20 10 14 10 14 4"></polyline><line x1="14" y1="10" x2="21" y2="3"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>';

    function applyFull() {
        const panel = document.getElementById('notif-panel');
        if (panel) panel.classList.toggle('is-full', isFull);
        document.body.classList.toggle('notif-full-open', isFull);
        const btn = document.getElementById('notif-full-btn');
        if (btn) {
            btn.innerHTML = isFull ? SYM_ZU : SYM_AUF;
            btn.title = isFull ? 'Vollansicht beenden' : 'Vollansicht';
        }
    }

    window.toggleNotificationFull = function (event) {
        if (event) event.stopPropagation();
        isFull = !isFull;
        applyFull();
    };

    window.filterNotificationsByKind = function (group, event) {
        if (event) event.stopPropagation();
        kindFilter = (group === 'all' || kindFilter === group) ? null : group;
        render();
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
        const g = groupMeta(n);
        return `
        <${tag} ${tag === 'button' ? 'type="button"' : 'role="button" tabindex="0"'} class="notif-item${isRead ? ' is-read' : ''}" data-notif-key="${esc(n.key)}"
                data-notif-target-type="${esc(n.targetType)}" data-notif-target-id="${esc(n.targetId)}"
                style="--notif-kind:${g.color}; --notif-sev:${sev.color};">
            <span class="notif-item-icon" style="color:${g.color}; background:${g.color}1f; border-color:${g.color}59;">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${KIND_ICON[n.kind] || KIND_ICON.assigned}</svg>
            </span>
            <span class="notif-item-body">
                <span class="notif-item-tags">
                    <span class="notif-kind-badge" style="color:${g.color}; background:${g.color}1f; border-color:${g.color}59;">${esc(g.label)}</span>
                    <span class="notif-sev-badge" style="color:${sev.color}; background:${sev.bg}; border-color:${sev.border};">${esc(sev.label)}</span>
                </span>
                <span class="notif-item-title">${esc(n.title)}</span>
                ${n.subject ? `<span class="notif-item-subject">${esc(n.subject)}</span>` : ''}
                <span class="notif-item-meta" style="color:${sev.color};">${esc(n.meta)}</span>
            </span>
            ${n.actionsHtml || ''}
            ${isRead ? '' : '<span class="notif-item-dot"></span>'}
        </${tag}>`;
    }

    // Hinweisbalken beim ersten Öffnen nach mehreren Tagen ohne Anmeldung.
    // Ohne ihn sähe der Rückkehrer nur eine lange rote Liste und wüsste nicht,
    // was davon während seiner Abwesenheit aufgelaufen ist.
    function absenceNoticeHtml() {
        if (absenceNoticeDismissed()) return '';
        const a = currentAbsence();
        const count = absenceItemCount();
        if (!count) return '';
        const seit = new Date(a.sinceTs).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
        return `
        <div class="notif-absence">
            <div class="notif-absence-body">
                <strong>Willkommen zurück</strong>
                <span>Seit ${esc(seit)} (${a.days} ${a.days === 1 ? 'Tag' : 'Tage'} ohne Anmeldung) ${count === 1 ? 'ist 1 Meldung' : `sind ${count} Meldungen`} aufgelaufen — nichts davon wurde abgeschnitten.</span>
            </div>
            <button type="button" class="notif-absence-close" onclick="window.dismissAbsenceNotice(event)" title="Hinweis ausblenden">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
        </div>`;
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

        const notice = absenceNoticeHtml();

        if (!items.length) {
            list.innerHTML = notice +
                '<div class="notif-empty"><strong>Alles erledigt</strong><span>Keine offenen Erinnerungen, Fristen oder Zuweisungen für dich.</span></div>';
            return;
        }

        const read = readKeys();
        const groups = [
            { sev: 'overdue', title: 'Überfällig — sofort erledigen' },
            { sev: 'today', title: 'Heute' },
            { sev: 'soon', title: 'Demnächst — darauf vorbereiten' },
            { sev: 'info', title: 'Zur Kenntnis' }
        ];

        // Leiste zum Filtern nach Sorte, mit Anzahl je Sorte. So ist auf einen
        // Blick zu sehen, wie viel wovon offen ist — und mit einem Klick nur
        // noch die eine Sorte.
        const zaehler = {};
        items.forEach(n => {
            const key = KIND_GROUP[n.kind] || 'sonstiges';
            zaehler[key] = (zaehler[key] || 0) + 1;
        });
        let leiste = `<div class="notif-filterbar">
            <button type="button" class="notif-chip${kindFilter ? '' : ' is-active'}"
                onclick="window.filterNotificationsByKind('all', event)">Alles <b>${items.length}</b></button>`;
        Object.keys(GROUP_META).forEach(g => {
            if (!zaehler[g]) return;
            const m = GROUP_META[g];
            const aktiv = kindFilter === g;
            leiste += `<button type="button" class="notif-chip${aktiv ? ' is-active' : ''}"
                style="--notif-kind:${m.color};" onclick="window.filterNotificationsByKind('${g}', event)">
                ${m.label} <b>${zaehler[g]}</b></button>`;
        });
        leiste += '</div>';

        const sichtbar = kindFilter
            ? items.filter(n => KIND_GROUP[n.kind] === kindFilter)
            : items;

        let html = notice + leiste;
        groups.forEach(g => {
            const rows = sichtbar.filter(n => n.severity === g.sev);
            if (!rows.length) return;
            const sev = SEVERITY[g.sev];
            html += `<div class="notif-group-title" style="color:${sev.color};">${g.title} <span>${rows.length}</span></div>`;
            html += rows.map(n => itemHtml(n, read.has(n.key))).join('');
        });
        if (!sichtbar.length) {
            html += '<div class="notif-empty"><strong>Nichts in dieser Sorte</strong><span>Oben auf „Alles" tippen, um wieder alle zu sehen.</span></div>';
        }
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
        const pushOn = window.notificationsPushEnabled();
        box.innerHTML = `
            <!-- Eine Zeile je Sorte, zwei Spalten: taucht sie in der Liste auf,
                 und darf sie zusätzlich ein Fenster aufmachen. -->
            <div class="notif-pref-table">
                <div class="notif-pref-head">
                    <span></span>
                    <span title="Erscheint unter der Glocke">Liste</span>
                    <span title="Öffnet zusätzlich ein Fenster außerhalb der App">Fenster</span>
                </div>
                ${PREF_TOGGLES.map(t => `
                    <div class="notif-pref-row">
                        <span class="notif-pref-label">${t.label}</span>
                        <label class="notif-pref-cell">
                            <input type="checkbox" data-notif-pref="${t.key}" ${P[t.key] ? 'checked' : ''}>
                        </label>
                        <label class="notif-pref-cell">
                            <input type="checkbox" data-notif-pref="push_${t.key}"
                                ${P['push_' + t.key] ? 'checked' : ''} ${P[t.key] ? '' : 'disabled'}>
                        </label>
                    </div>`).join('')}
            </div>

            <div class="notif-settings-group notif-settings-level">
                <label class="notif-settings-num">
                    <span>Fenster ab</span>
                    <select data-notif-pref-sel="pushLevel">
                        <option value="overdue" ${P.pushLevel === 'overdue' ? 'selected' : ''}>nur Überfälligem</option>
                        <option value="today" ${P.pushLevel === 'today' ? 'selected' : ''}>heute Fälligem</option>
                        <option value="all" ${P.pushLevel === 'all' ? 'selected' : ''}>jeder Meldung</option>
                    </select>
                    <em>Termine melden sich immer sofort</em>
                </label>
            </div>

            ${pushOn ? '' : `<div class="notif-settings-warn">Fenster sind im Browser noch nicht erlaubt — oben auf „🔕 Meldungen aus" tippen. Bis dahin bleibt es bei der Liste unter der Glocke.</div>`}
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

    // Das Zahnrad öffnet die eigene Seite (js/notification-settings.js) statt
    // der früheren engen Klappe im Panel — dort war der Zusammenhang zwischen
    // Glocke und Fenster nicht zu erkennen.
    window.toggleNotificationSettings = function (event) {
        if (event) event.stopPropagation();
        if (typeof window.openNotificationSettings === 'function') {
            window.openNotificationSettings(event);
            return;
        }
        // Rückfall, falls die Seite nicht geladen ist.
        const box = document.getElementById('notif-settings');
        if (!box) return;
        const show = box.style.display === 'none' || !box.style.display;
        if (show) renderSettings();
        box.style.display = show ? 'block' : 'none';
    };

    // Änderung an einer Einstellung -> speichern und neu einsammeln
    function onPrefChange(el) {
        if (el.dataset.notifPref) {
            savePrefs({ [el.dataset.notifPref]: el.checked });
            // Sorte ganz abgeschaltet -> die Fenster-Spalte daneben ergibt
            // keinen Sinn mehr. Neu zeichnen erledigt das Ausgrauen mit.
            if (!el.dataset.notifPref.startsWith('push_')) renderSettings();
        } else if (el.dataset.notifPrefSel) {
            savePrefs({ [el.dataset.notifPrefSel]: el.value });
        } else if (el.dataset.notifPrefNum) {
            const k = el.dataset.notifPrefNum;
            const v = clampDays(el.value, DEFAULT_PREFS[k]);
            el.value = v;
            savePrefs({ [k]: v });
        } else if (el.dataset.notifPrefHours) {
            // Wiedererinnerung je Sorte, in Stunden. 0 = nur einmal melden.
            const k = el.dataset.notifPrefHours;
            let v = parseInt(el.value, 10);
            if (isNaN(v) || v < 0) v = 0;
            v = Math.min(720, v); // 30 Tage sind reichlich
            el.value = v;
            savePrefs({ [k]: v });
        } else {
            return;
        }
        // Die Einstellungsseite spiegelt den neuen Zustand (ausgegraute
        // Fenster-Schalter, wenn eine Sorte abgeschaltet wurde).
        if (typeof window.renderNotificationSettingsPage === 'function') {
            window.renderNotificationSettingsPage();
        }
        cache = { at: 0, data: null };
        refresh({ push: false });
    }

    document.addEventListener('change', (e) => {
        const el = e.target.closest('[data-notif-pref], [data-notif-pref-num], [data-notif-pref-sel], [data-notif-pref-hours]');
        if (el) { e.stopPropagation(); onPrefChange(el); }
    });

    // ---------------------------------------------------------------
    // Öffnen / Schließen / Laden
    // ---------------------------------------------------------------
    // opts.push === false -> keine Systemmeldungen auslösen. Das nutzt das
    // Öffnen des Panels: wer gerade hinschaut, braucht keine Meldung obendrauf.
    async function refresh(opts) {
        if (!currentUserId()) { items = []; render(); updateBadge(); return; }
        currentAbsence(); // Lücke feststellen, BEVOR der Heartbeat sie überschreibt
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
        touchLastSeen(); // „zuletzt am Rechner" fortschreiben
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
        if (!isOpen) isFull = false;
        applyFull();
        if (isOpen) {
            // Ein noch stehender Scroll-Zustand würde das Panel abdunkeln.
            document.body.classList.remove('topbar-scrolling');
            render();
            refresh({ push: false });
        }
    };

    function closePanel() {
        const panel = document.getElementById('notif-panel');
        if (panel) panel.style.display = 'none';
        // Vollansicht mit schließen — sonst bliebe die Abdunklung am body stehen.
        isFull = false;
        applyFull();
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
        } else if (targetType === 'service') {
            // Servicebericht direkt zum Bearbeiten öffnen
            if (typeof window.openEditServicebericht === 'function') {
                window.openEditServicebericht(targetId);
            }
        } else if (targetType === 'customer') {
            // Adresse aufschlagen — gleiche Weiche wie im Adress-Verlauf
            if (typeof window.openAddressbookDetail === 'function') window.openAddressbookDetail(targetId);
            else if (typeof window.openAddressDetail === 'function') window.openAddressDetail(targetId);
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

    // Gemerkt wird jetzt der ZEITPUNKT je Eintrag, nicht nur "schon gemeldet".
    // Nur so lässt sich "erinnere mich alle x Stunden erneut" umsetzen.
    // Altbestand (eine reine Liste von Schlüsseln) wird übernommen und gilt
    // als "gerade eben gemeldet".
    function pushedMap() {
        const uid = currentUserId();
        if (!uid) return {};
        try {
            const roh = JSON.parse(localStorage.getItem(PUSHED_KEY + uid) || '{}');
            if (Array.isArray(roh)) {
                const jetzt = Date.now();
                const map = {};
                roh.forEach(k => { map[k] = jetzt; });
                return map;
            }
            return roh && typeof roh === 'object' ? roh : {};
        } catch (e) { return {}; }
    }

    function savePushed(map) {
        const uid = currentUserId();
        if (!uid) return;
        // Nur die 300 jüngsten behalten, sonst wächst der Eintrag endlos.
        const paare = Object.keys(map).map(k => [k, map[k]])
            .sort((a, b) => b[1] - a[1]).slice(0, 300);
        const schlank = {};
        paare.forEach(([k, t]) => { schlank[k] = t; });
        localStorage.setItem(PUSHED_KEY + uid, JSON.stringify(schlank));
    }

    // Darf sich dieser Eintrag (wieder) melden?
    //   noch nie gemeldet            -> ja
    //   Abstand der Sorte ist 0      -> nein (einmal und gut)
    //   letzte Meldung länger her    -> ja
    function darfErneut(n, map, P) {
        const zuletzt = map[n.key];
        if (!zuletzt) return true;
        const group = KIND_GROUP[n.kind];
        const stunden = group ? Number(P['repeat_' + group]) : 0;
        if (!stunden || stunden <= 0) return false;
        return (Date.now() - zuletzt) >= stunden * 3600000;
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

        // Der Warnhinweis in der Einstellungs-Klappe hängt daran.
        const box = document.getElementById('notif-settings');
        if (box && box.style.display === 'block') renderSettings();
    }

    // Darf diese eine Meldung ein Fenster aufmachen? Zwei Bedingungen:
    // die Sorte muss dafür freigeschaltet sein, und die Dringlichkeit muss
    // die eingestellte Schwelle erreichen.
    function mayPush(n) {
        const P = prefs();
        const group = KIND_GROUP[n.kind];
        if (group && P['push_' + group] === false) return false;

        // Termine melden sich immer, auch wenn sie erst nächste Woche sind:
        // eine Einladung oder eine Zu-/Absage will man sofort mitbekommen.
        if (n.kind === 'appointment') return true;

        if (P.pushLevel === 'all') return true;
        if (P.pushLevel === 'overdue') return n.severity === 'overdue';
        return n.severity === 'overdue' || n.severity === 'today';
    }

    function pushUrgent() {
        const pushed = pushedMap();
        const P = prefs();
        // Glocke und Fenster arbeiten zusammen: was unter der Glocke schon
        // gelesen wurde, macht kein Fenster mehr auf. Vorher meldete sich ein
        // Eintrag noch einmal von aussen, obwohl man ihn längst gesehen hatte.
        const read = readKeys();

        const urgent = items.filter(n => mayPush(n) && !read.has(n.key) && darfErneut(n, pushed, P));
        if (!urgent.length) return;

        // Ohne erlaubte Systemmeldungen wenigstens im Fenster darauf hinweisen.
        if (!window.notificationsPushEnabled()) {
            const appts = urgent.filter(n => n.kind === 'appointment');
            appts.forEach(n => {
                if (typeof window.showToast === 'function') window.showToast(`${n.title} — ${n.meta}`);
                pushed[n.key] = Date.now();
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
            pushed[n.key] = Date.now();
        });
        if (urgent.length > 3) {
            try {
                new Notification(`${urgent.length - 3} weitere fällige Einträge`, {
                    body: 'In der App unter der Glocke ansehen.',
                    tag: 'meetra-rest',
                    icon: 'assets/icons/meetra_arrows_icon.png'
                });
            } catch (e) { /* ignorieren */ }
            urgent.slice(3).forEach(n => { pushed[n.key] = Date.now(); });
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

    async function init() {
        if (!document.getElementById('notif-bell-btn')) return;
        renderPushToggle();
        // Erst den geräteübergreifenden Stand holen, dann einsammeln — sonst
        // liefe der erste Durchlauf noch mit den Voreinstellungen dieses Geräts.
        await ladeAusDatenbank();
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
