// =========================================================
// TERMINE MIT TEILNEHMERN
// =========================================================
// Ein Termin ist ein normaler Kalendereintrag (maintenance_events) mit
// Uhrzeit, Adressbezug und eingeladenen Kollegen (event_participants,
// siehe supabase/supabase_add_event_participants.sql).
//
// Was hier drin steckt:
//   - openAppointmentDialog(...)  Fenster „Termin anlegen" (Routenplanung)
//   - respondToAppointment(...)   Zusage/Absage — genutzt von der
//                                 Benachrichtigungsliste UND vom Kalender
//   - loadAppointmentsForCustomers([ids])  für die Stoppliste der Route
//   - loadParticipantsForEvents([ids])     für Kalender & Benachrichtigungen
//
// Fehlt die Migration, geben alle Lesefunktionen leere Ergebnisse zurück
// und das Anlegen meldet einen verständlichen Hinweis — die App läuft
// weiter wie bisher.
// =========================================================
(function () {
    'use strict';

    const STATUS = {
        offen: { label: 'offen', color: 'rgba(255,255,255,0.55)' },
        zugesagt: { label: 'zugesagt', color: '#34d399' },
        abgesagt: { label: 'abgesagt', color: '#f87171' }
    };

    let tableMissing = false;   // Migration noch nicht gelaufen
    let dialogCtx = null;

    function sb() { return window.supabaseClient; }
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }
    function me() { return window.activeUser || null; }
    function myId() { const u = me(); return u && u.id != null ? String(u.id) : null; }
    function myName() { const u = me(); return (u && u.name) || ''; }

    function fmtDate(dateLike) {
        if (!dateLike) return '';
        const d = new Date(String(dateLike).slice(0, 10) + 'T00:00:00');
        return isNaN(d) ? '' : d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }
    function fmtTime(t) {
        if (!t) return '';
        const m = String(t).match(/^(\d{1,2}):(\d{2})/);
        return m ? `${m[1].padStart(2, '0')}:${m[2]}` : String(t);
    }
    function nowTimeLabel(ts) {
        const d = ts ? new Date(ts) : new Date();
        return isNaN(d) ? '' : d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    }
    window.appointmentStatusMeta = (s) => STATUS[s] || STATUS.offen;
    window.fmtAppointmentTime = fmtTime;

    // ---------------------------------------------------------------
    // Lesen
    // ---------------------------------------------------------------
    // Teilnehmer zu mehreren Terminen: eventId -> [Teilnehmer]
    window.loadParticipantsForEvents = async function (eventIds) {
        const ids = (eventIds || []).filter(v => v !== null && v !== undefined);
        const byEvent = new Map();
        if (!ids.length || !sb() || tableMissing) return byEvent;
        try {
            const { data, error } = await sb()
                .from('event_participants')
                .select('*')
                .in('event_id', ids);
            if (error) throw error;
            (data || []).forEach(p => {
                const k = String(p.event_id);
                if (!byEvent.has(k)) byEvent.set(k, []);
                byEvent.get(k).push(p);
            });
        } catch (err) {
            tableMissing = true;
            console.warn('Termin-Teilnehmer nicht verfügbar (supabase_add_event_participants.sql ausführen?):', err.message || err);
        }
        return byEvent;
    };

    // Termine je Adresse — für die Stoppliste der Routenplanung.
    // Ergebnis: customerId -> [{ id, date, time, title, participants }]
    window.loadAppointmentsForCustomers = async function (customerIds) {
        const ids = [...new Set((customerIds || []).filter(v => v !== null && v !== undefined).map(String))];
        const byCustomer = new Map();
        if (!ids.length || !sb()) return byCustomer;

        let events = [];
        try {
            const { data, error } = await sb()
                .from('maintenance_events')
                .select('*')
                .in('customer_id', ids)
                .limit(500);
            if (error) throw error;
            events = data || [];
        } catch (err) {
            // Spalte customer_id fehlt -> Migration noch nicht gelaufen
            console.warn('Termine je Adresse nicht ladbar:', err.message || err);
            return byCustomer;
        }

        const parts = await window.loadParticipantsForEvents(events.map(e => e.id));
        events.forEach(ev => {
            const k = String(ev.customer_id);
            if (!byCustomer.has(k)) byCustomer.set(k, []);
            byCustomer.get(k).push({
                id: ev.id,
                date: String(ev.event_date || ev.start_date || '').slice(0, 10),
                time: fmtTime(ev.start_time),
                title: ev.title || 'Termin',
                participants: parts.get(String(ev.id)) || []
            });
        });
        byCustomer.forEach(list => list.sort((a, b) =>
            (a.date + (a.time || '')).localeCompare(b.date + (b.time || ''))));
        return byCustomer;
    };

    // ---------------------------------------------------------------
    // Zusagen / Absagen
    // ---------------------------------------------------------------
    // Wird sowohl aus der Benachrichtigungsliste als auch aus dem
    // Kalender aufgerufen (Daumen hoch / runter).
    window.respondToAppointment = async function (eventId, status) {
        const uid = myId();
        if (!uid) { window.showToast('Bitte zuerst einen Benutzer auswählen.'); return false; }
        if (!sb()) return false;
        if (status !== 'zugesagt' && status !== 'abgesagt') return false;

        try {
            const { error } = await sb()
                .from('event_participants')
                .update({ status, responded_at: new Date().toISOString() })
                .eq('event_id', eventId)
                .eq('user_id', uid);
            if (error) throw error;
        } catch (err) {
            window.showToast('Antwort konnte nicht gespeichert werden: ' + (err.message || err));
            return false;
        }

        window.showToast(status === 'zugesagt' ? 'Termin zugesagt.' : 'Termin abgesagt.');
        if (typeof window.refreshNotifications === 'function') window.refreshNotifications({ force: true });
        if (typeof window.refreshCalendarWidget === 'function') window.refreshCalendarWidget();
        if (typeof window.refreshAppointmentInviteBadge === 'function') window.refreshAppointmentInviteBadge();
        if (typeof window.rp2RefreshAppointments === 'function') window.rp2RefreshAppointments();
        return true;
    };

    // Ein Klick auf Daumen hoch/runter — egal wo er steht. Läuft in der
    // Erfassungsphase, damit der Klick nicht vorher als „Eintrag öffnen"
    // im Benachrichtigungspanel oder Kalender landet.
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-appt-respond]');
        if (!btn) return;
        e.preventDefault();
        e.stopPropagation();
        window.respondToAppointment(btn.getAttribute('data-appt-event'), btn.getAttribute('data-appt-respond'));
    }, true);

    // Daumen-Knöpfe als Baustein — Kalender und Benachrichtigungen nutzen
    // dieselbe Darstellung.
    window.appointmentResponseButtons = function (eventId, myStatus) {
        const s = myStatus || 'offen';
        return `<span class="appt-actions">
            <button type="button" class="appt-thumb up${s === 'zugesagt' ? ' active' : ''}"
                    data-appt-respond="zugesagt" data-appt-event="${esc(eventId)}" title="Zusagen">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>
            </button>
            <button type="button" class="appt-thumb down${s === 'abgesagt' ? ' active' : ''}"
                    data-appt-respond="abgesagt" data-appt-event="${esc(eventId)}" title="Absagen">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"/></svg>
            </button>
        </span>`;
    };

    // Teilnehmerzeile („Meier zugesagt · Schulz offen")
    window.appointmentParticipantsLine = function (participants) {
        if (!participants || !participants.length) return '';
        return participants.map(p => {
            const meta = STATUS[p.status] || STATUS.offen;
            return `<span class="appt-part" style="color:${meta.color};">${esc(p.user_name || 'Kollege')} ${meta.label}</span>`;
        }).join('');
    };

    // ---------------------------------------------------------------
    // Anlegen (auch aus der KI-Erfassung heraus)
    // ---------------------------------------------------------------
    // { title, date, time, customerId, description, participants:[{id,name}] }
    // Gibt die neue Termin-ID zurück, oder null.
    window.createAppointment = async function (opts) {
        const o = opts || {};
        if (!sb() || !o.date) return null;

        const base = {
            title: o.title || 'Termin',
            event_date: o.date,
            start_date: o.date,
            status: 'geplant',
            description: o.description || null,
            user_id: typeof window.uuidUserId === 'function' ? window.uuidUserId() : null,
            created_by_user: (me() && me().id) || null
        };
        const full = Object.assign({}, base, {
            start_time: o.time || null,
            customer_id: o.customerId != null ? o.customerId : null,
            location_label: o.locationLabel || null
        });

        // Feldweise ausweichen statt pauschal alle Zusatzspalten zu verwerfen:
        // vorher ging bei einem Problem an EINER Spalte auch die Uhrzeit und
        // der Adressbezug verloren, ohne dass jemand davon erfuhr.
        // Bei einem Typkonflikt nennt Postgres nur den Wert, nicht die Spalte —
        // deshalb erkennt insertRobust (js/app-core.js) sie über den Wert.
        const versuch = Object.assign({}, full);
        const weggelassen = [];
        let res;
        const optional = ['customer_id', 'location_label', 'start_time', 'created_by_user'];
        for (let i = 0; i <= optional.length; i++) {
            res = await sb().from('maintenance_events').insert([versuch]).select('id').limit(1);
            if (!res.error) break;
            const msg = res.error.message || '';
            const stoerend = new Set();
            optional.forEach(k => { if (k in versuch && msg.includes(k)) stoerend.add(k); });
            const m = msg.match(/invalid input syntax for type \w+: "([^"]+)"/);
            if (m) optional.forEach(k => {
                if (k in versuch && versuch[k] != null && String(versuch[k]) === m[1]) stoerend.add(k);
            });
            if (!stoerend.size) { console.error('Termin nicht speicherbar:', msg); return null; }
            stoerend.forEach(k => { delete versuch[k]; weggelassen.push(k); });
        }
        if (weggelassen.includes('customer_id') && typeof window.showToast === 'function') {
            window.showToast('Termin angelegt, aber ohne Adressbezug — dazu muss supabase/supabase_add_event_customer.sql in Supabase laufen.');
        }
        const eventId = res.data && res.data.length ? res.data[0].id : null;

        if (eventId && Array.isArray(o.participants) && o.participants.length) {
            const rows = o.participants.map(u => ({
                event_id: eventId, user_id: u.id, user_name: u.name, status: 'offen',
                invited_by: (me() && me().id) || null, invited_by_name: myName() || null
            }));
            const { error } = await sb().from('event_participants').insert(rows);
            if (error) console.warn('Teilnehmer nicht speicherbar:', error.message);
        }
        return eventId;
    };

    // ---------------------------------------------------------------
    // Fenster „Termin anlegen"
    // ---------------------------------------------------------------
    function ensureModal() {
        if (document.getElementById('appt-modal')) return;
        const el = document.createElement('div');
        el.id = 'appt-modal';
        el.className = 'modal-backdrop';
        el.innerHTML = `
            <div class="modal-content appt-modal-content">
                <button type="button" class="appt-close" data-appt-close title="Schließen">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
                <h2 style="margin-top:0;">Termin anlegen</h2>
                <div id="appt-subject" class="appt-subject"></div>

                <label class="appt-label" for="appt-title">Betreff</label>
                <input type="text" id="appt-title" class="appt-input" placeholder="z. B. Wartung vor Ort">

                <div class="appt-row">
                    <div style="flex:1;">
                        <label class="appt-label" for="appt-date">Datum</label>
                        <input type="date" id="appt-date" class="appt-input">
                    </div>
                    <div style="flex:1;">
                        <label class="appt-label" for="appt-time">Uhrzeit</label>
                        <input type="time" id="appt-time" class="appt-input">
                    </div>
                </div>

                <label class="appt-label">Teilnehmer</label>
                <div id="appt-users" class="appt-users"></div>

                <label class="appt-label" for="appt-note">Notiz</label>
                <textarea id="appt-note" class="appt-input" rows="3" placeholder="Was ist vor Ort zu tun?"></textarea>

                <div id="appt-status" class="appt-status"></div>

                <div class="appt-actions-row">
                    <button type="button" class="appt-btn" data-appt-close>Abbrechen</button>
                    <button type="button" class="appt-btn appt-btn-primary" id="appt-save">Termin speichern</button>
                </div>
            </div>`;
        document.body.appendChild(el);

        el.addEventListener('click', (e) => {
            if (e.target === el || e.target.closest('[data-appt-close]')) closeModal();
        });
        document.getElementById('appt-save').addEventListener('click', saveAppointment);
    }

    function closeModal() {
        const el = document.getElementById('appt-modal');
        if (!el) return;
        el.classList.remove('show', 'active');
        document.body.style.overflow = '';
        dialogCtx = null;
    }
    window.closeAppointmentDialog = closeModal;

    function renderUserPicker() {
        const box = document.getElementById('appt-users');
        if (!box) return;
        const uid = myId();
        const users = (window.userList || []).filter(u => u && u.name && String(u.id) !== uid);
        if (!users.length) {
            box.innerHTML = '<div class="appt-hint">Keine weiteren Benutzer vorhanden — der Termin gehört dann nur dir.</div>';
            return;
        }
        box.innerHTML = users.map(u => `
            <label class="appt-user">
                <input type="checkbox" value="${esc(u.id)}" data-name="${esc(u.name)}">
                <span>${esc(u.name)}</span>
            </label>`).join('');
    }

    // ctx: { customerId, label, address, date, time }
    window.openAppointmentDialog = function (ctx) {
        const c = ctx || {};
        ensureModal();
        dialogCtx = c;

        const today = new Date().toISOString().slice(0, 10);
        document.getElementById('appt-title').value = c.title || 'Termin vor Ort';
        document.getElementById('appt-date').value = c.date || today;
        document.getElementById('appt-time').value = c.time || '';
        document.getElementById('appt-note').value = '';
        document.getElementById('appt-status').textContent = '';
        document.getElementById('appt-subject').innerHTML = c.label
            ? `<strong>${esc(c.label)}</strong>${c.address ? `<div class="appt-hint">${esc(c.address)}</div>` : ''}`
            : '';
        renderUserPicker();

        const el = document.getElementById('appt-modal');
        el.classList.add('show', 'active');
        document.body.style.overflow = 'hidden';
        setTimeout(() => document.getElementById('appt-title').focus(), 50);
    };

    async function saveAppointment() {
        if (!sb()) { window.showToast('Keine Verbindung zur Datenbank.'); return; }
        const btn = document.getElementById('appt-save');
        const status = document.getElementById('appt-status');
        const title = document.getElementById('appt-title').value.trim();
        const date = document.getElementById('appt-date').value;
        const time = document.getElementById('appt-time').value;
        const note = document.getElementById('appt-note').value.trim();

        if (!title) { status.textContent = 'Bitte einen Betreff angeben.'; status.classList.add('error'); return; }
        if (!date) { status.textContent = 'Bitte ein Datum wählen.'; status.classList.add('error'); return; }

        const chosen = [...document.querySelectorAll('#appt-users input:checked')]
            .map(i => ({ id: i.value, name: i.getAttribute('data-name') }));

        btn.disabled = true;
        const label = btn.textContent;
        btn.textContent = 'Speichert …';
        status.classList.remove('error');
        status.textContent = '';

        try {
            const c = dialogCtx || {};
            const eventId = await window.createAppointment({
                title, date, time,
                description: note || null,
                customerId: c.customerId,
                locationLabel: c.address || c.label || null,
                participants: chosen
            });
            if (!eventId) throw new Error('Der Termin konnte nicht angelegt werden.');

            if (!status.classList.contains('error')) {
                window.showToast(chosen.length
                    ? `Termin angelegt — ${chosen.length} ${chosen.length === 1 ? 'Kollege wurde' : 'Kollegen wurden'} eingeladen.`
                    : 'Termin im Kalender angelegt.');
                closeModal();
            }

            if (typeof window.refreshCalendarWidget === 'function') window.refreshCalendarWidget();
            if (typeof window.renderEvents === 'function') window.renderEvents();
            if (typeof window.refreshNotifications === 'function') window.refreshNotifications({ force: true });
            if (typeof window.rp2RefreshAppointments === 'function') window.rp2RefreshAppointments();
            if (dialogCtx && typeof dialogCtx.onSaved === 'function') dialogCtx.onSaved();
        } catch (err) {
            console.error('Termin konnte nicht gespeichert werden:', err);
            status.textContent = 'Fehler: ' + (err.message || err);
            status.classList.add('error');
        } finally {
            btn.disabled = false;
            btn.textContent = label;
        }
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && document.getElementById('appt-modal')?.classList.contains('show')) closeModal();
    });

    // ---------------------------------------------------------------
    // Offene Einladungen — Leuchtpunkt am Kalender in der Kopfleiste
    // ---------------------------------------------------------------
    // Wer eingeladen wurde und noch nicht geantwortet hat, soll das sehen,
    // ohne erst irgendwo hineinzuklicken: der Kalenderknopf oben leuchtet
    // und trägt die Anzahl. Termine, die länger als 14 Tage vorbei sind,
    // zählen nicht mehr mit — darauf muss niemand mehr reagieren.
    const VERGANGEN_TAGE = 14;

    window.loadOpenAppointmentInvites = async function () {
        const uid = myId();
        if (!uid || !sb() || tableMissing) return [];

        try {
            const { data: parts, error } = await sb()
                .from('event_participants')
                .select('*')
                .eq('user_id', uid)
                .eq('status', 'offen')
                .limit(200);
            if (error) throw error;
            if (!parts || !parts.length) return [];

            const { data: evs } = await sb()
                .from('maintenance_events')
                .select('*')
                .in('id', [...new Set(parts.map(p => p.event_id))]);
            const byId = new Map((evs || []).map(e => [String(e.id), e]));

            const heute = new Date(); heute.setHours(0, 0, 0, 0);
            const offen = [];

            parts.forEach(p => {
                const ev = byId.get(String(p.event_id));
                if (!ev) return;
                const tag = String(ev.event_date || ev.start_date || '').slice(0, 10);
                if (tag) {
                    const d = new Date(tag + 'T00:00:00');
                    if (!isNaN(d) && (heute - d) / 86400000 > VERGANGEN_TAGE) return;
                }
                offen.push({
                    eventId: ev.id,
                    title: ev.title || 'Termin',
                    day: tag,
                    time: fmtTime(ev.start_time),
                    place: ev.location_label || '',
                    from: p.invited_by_name || ''
                });
            });

            offen.sort((a, b) => String(a.day).localeCompare(String(b.day)));
            return offen;
        } catch (err) {
            tableMissing = true;
            console.warn('Offene Termin-Einladungen nicht ladbar:', err.message || err);
            return [];
        }
    };

    window.refreshAppointmentInviteBadge = async function () {
        const btn = document.getElementById('calw-btn');
        const badge = document.getElementById('calw-badge');
        if (!btn || !badge) return 0;

        const offen = await window.loadOpenAppointmentInvites();
        const n = offen.length;

        badge.textContent = n > 9 ? '9+' : String(n);
        badge.style.display = n ? 'flex' : 'none';
        btn.classList.toggle('has-invites', n > 0);
        btn.title = n
            ? `${n} Termineinladung${n === 1 ? '' : 'en'} ohne Antwort`
            : 'Kalender';
        return n;
    };

    // Beim Start einmal und danach alle zwei Minuten nachsehen. Der Aufruf
    // wartet bewusst kurz, bis der angemeldete Benutzer feststeht.
    function badgeStarten() {
        setTimeout(() => { window.refreshAppointmentInviteBadge(); }, 2500);
        setInterval(() => { window.refreshAppointmentInviteBadge(); }, 120000);
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', badgeStarten);
    } else {
        badgeStarten();
    }

    // Für die Benachrichtigungen: Antwortzeitpunkt lesbar machen.
    window.appointmentResponseLabel = function (p) {
        const verb = p.status === 'zugesagt' ? 'zugesagt' : 'abgesagt';
        const t = nowTimeLabel(p.responded_at);
        return `${p.user_name || 'Ein Kollege'} hat ${t ? 'um ' + t + ' Uhr ' : ''}${verb}`;
    };
})();
