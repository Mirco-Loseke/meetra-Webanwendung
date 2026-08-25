// ==========================================
// ERINNERUNG ZUR UHRZEIT (Bildschirm-Meldung)
// ==========================================
// Die Glocke (js/notifications.js) arbeitet TAGWEISE: sie zeigt, was heute
// ansteht, und aktualisiert alle fünf Minuten. Für „um 14:30 meldet sich der
// Rechner" ist das zu grob. Dieses Modul ist der minutengenaue Wecker:
//
//   - alle 20 Sekunden wird geprüft, was JETZT fällig ist
//   - fällig = geplante Uhrzeit erreicht oder gerade überschritten
//   - dann erscheint eine grosse Karte auf dem Bildschirm (sichtbar auch
//     quer durch die Werkstatt) und zusätzlich eine Systemmeldung, falls
//     der Nutzer die erlaubt hat
//
// Quellen (nur Einträge mit echter Uhrzeit):
//   - maintenance_events.start_time  -> Termine/Erinnerungen aus dem Kalender
//   - internal_processes.remind_at   -> Erinnerung an einem Vorgang
//
// Was schon gemeldet wurde, steht pro Benutzer und Tag im localStorage.
// Dadurch meldet ein Neuladen der Seite nicht alles noch einmal, ein
// wirklich verpasster Termin aber schon (er ist ja noch nicht vermerkt).
//
// Grenze, die man kennen muss: das läuft nur, solange die App im Browser
// offen ist. Ein geschlossener Browser kann sich nicht melden — dafür
// bräuchte es echte Push-Nachrichten über einen Server.
// ==========================================
(function () {
    'use strict';

    const PRUEF_INTERVALL = 20 * 1000;   // wie oft geprüft wird
    const NACHLAUF_MIN = 30;             // so lange gilt Verpasstes noch als „jetzt"
    const KEY_PREFIX = 'meetra_alarm_gezeigt_';
    const SNOOZE_KEY = 'meetra_alarm_spaeter_';

    // „Später erinnern": feste Auswahl statt stumm 10 Minuten.
    const SPAETER = [
        { label: '10 Min.', min: 10 },
        { label: '30 Min.', min: 30 },
        { label: '1 Std.', min: 60 },
        { label: '1 Tag', min: 24 * 60 },
        { label: '2 Tage', min: 48 * 60 }
    ];

    let timer = null;
    let laeuft = false;

    // Verschobene Erinnerungen liegen im localStorage, nicht nur im Speicher:
    // faellige() findet einen Eintrag nur innerhalb von NACHLAUF_MIN und nur am
    // Tag selbst — ein „1 Tag"/„2 Tage" käme sonst nie wieder. Deshalb wird die
    // ganze Karte mitgesichert und zur gewählten Zeit von hier aus gezeigt.
    function spaeterLaden() {
        try {
            const roh = JSON.parse(localStorage.getItem(SNOOZE_KEY + (uid() || 'anon')) || '[]');
            return Array.isArray(roh) ? roh : [];
        } catch (e) { return []; }
    }

    function spaeterSpeichern(liste) {
        try {
            localStorage.setItem(SNOOZE_KEY + (uid() || 'anon'), JSON.stringify(liste.slice(-100)));
        } catch (e) { /* Speicher voll — dann eben nur bis zum Neuladen */ }
    }

    function spaeterMerken(eintrag, minuten) {
        const liste = spaeterLaden().filter(x => x.eintrag && x.eintrag.key !== eintrag.key);
        liste.push({ faellig: Date.now() + minuten * 60 * 1000, eintrag: eintrag });
        spaeterSpeichern(liste);
    }

    function sb() { return window.supabaseClient; }
    function user() { return window.activeUser || null; }
    function uid() { const u = user(); return u && u.id != null ? String(u.id) : null; }
    function uname() { const u = user(); return (u && u.name || '').toLowerCase().trim(); }

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    function heuteKey() {
        const d = new Date();
        const p = n => String(n).padStart(2, '0');
        return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
    }

    // Gemeldetes wird pro Tag abgelegt; alte Tage fliegen dabei raus.
    function gezeigtLaden() {
        try {
            const roh = JSON.parse(localStorage.getItem(KEY_PREFIX + (uid() || 'anon')) || 'null');
            if (roh && roh.tag === heuteKey() && Array.isArray(roh.keys)) return new Set(roh.keys);
        } catch (e) { /* kaputter Eintrag -> neu anfangen */ }
        return new Set();
    }

    function gezeigtSpeichern(set) {
        try {
            localStorage.setItem(KEY_PREFIX + (uid() || 'anon'),
                JSON.stringify({ tag: heuteKey(), keys: [...set].slice(-200) }));
        } catch (e) { /* Speicher voll — dann meldet es sich eben erneut */ }
    }

    function istMeins(werte) {
        const id = uid(), name = uname();
        if (!id || !Array.isArray(werte)) return false;
        return werte.some(v => {
            const s = String(v).toLowerCase().trim();
            return s === id.toLowerCase() || (name && s === name);
        });
    }

    function hhmm(d) {
        const p = n => String(n).padStart(2, '0');
        return p(d.getHours()) + ':' + p(d.getMinutes());
    }

    // ---------------------------------------------------------------
    // Fällige Einträge sammeln
    // ---------------------------------------------------------------
    async function faellige() {
        if (!sb() || !uid()) return [];
        const jetzt = Date.now();
        const frueheste = jetzt - NACHLAUF_MIN * 60 * 1000;
        const treffer = [];

        // 1) Kalendereinträge mit Uhrzeit (heute)
        try {
            const { data, error } = await sb()
                .from('maintenance_events')
                .select('*')
                .eq('event_date', heuteKey())
                .limit(200);
            if (error) throw error;

            // Wer ist eingeladen? Daraus ergibt sich, wen es etwas angeht.
            let teilnehmer = new Map();
            const ids = (data || []).map(e => e.id);
            if (ids.length && typeof window.loadParticipantsForEvents === 'function') {
                try { teilnehmer = await window.loadParticipantsForEvents(ids); } catch (e) { /* egal */ }
            }

            (data || []).forEach(ev => {
                if (!ev.start_time) return; // ohne Uhrzeit kein Wecker
                const [h, m] = String(ev.start_time).split(':');
                const wann = new Date();
                wann.setHours(parseInt(h, 10) || 0, parseInt(m, 10) || 0, 0, 0);
                const t = wann.getTime();
                if (t > jetzt || t < frueheste) return;

                const eingeladen = (teilnehmer.get(String(ev.id)) || [])
                    .some(p => String(p.user_id) === uid());
                const meins = eingeladen
                    || String(ev.created_by_user) === uid()
                    || String(ev.user_id) === uid();
                if (!meins) return;

                treffer.push({
                    key: 'event:' + ev.id,
                    titel: ev.title || 'Termin',
                    zeit: hhmm(wann),
                    notiz: ev.description || '',
                    ort: ev.location_label || '',
                    art: (ev.maintenance_types || 'Termin'),
                    zielTyp: 'event',
                    zielId: ev.id
                });
            });
        } catch (e) {
            console.warn('Wecker: Kalendereinträge nicht prüfbar:', e);
        }

        // 2) Vorgänge mit Erinnerungs-Zeitpunkt
        try {
            const { data, error } = await sb()
                .from('internal_processes')
                .select('*')
                .not('remind_at', 'is', null)
                .limit(300);
            if (error) throw error;

            (data || []).forEach(p => {
                const wann = new Date(p.remind_at);
                if (isNaN(wann)) return;
                const t = wann.getTime();
                if (t > jetzt || t < frueheste) return;
                if (p.status === 'erledigt' || p.status === 'abgeschlossen') return;

                const meins = istMeins(p.assigned_users)
                    || String(p.user_id) === uid()
                    || String(p.created_by_user) === uid();
                if (!meins) return;

                treffer.push({
                    key: 'proc:' + p.id + ':' + t,
                    titel: p.title || 'Vorgang',
                    zeit: hhmm(wann),
                    notiz: p.remark || '',
                    ort: '',
                    art: 'Vorgang',
                    zielTyp: 'process',
                    zielId: p.id
                });
            });
        } catch (e) {
            console.warn('Wecker: Vorgänge nicht prüfbar:', e);
        }

        return treffer;
    }

    // ---------------------------------------------------------------
    // Anzeige
    // ---------------------------------------------------------------
    function behaelter() {
        let el = document.getElementById('alarm-stack');
        if (!el) {
            el = document.createElement('div');
            el.id = 'alarm-stack';
            document.body.appendChild(el);
        }
        return el;
    }

    function zeigen(eintrag) {
        const box = behaelter();
        if (box.querySelector(`[data-alarm-key="${CSS.escape(eintrag.key)}"]`)) return;

        const karte = document.createElement('div');
        karte.className = 'alarm-card';
        karte.setAttribute('data-alarm-key', eintrag.key);
        karte.innerHTML = `
            <div class="alarm-head">
                <span class="alarm-bell">⏰</span>
                <span class="alarm-time">${esc(eintrag.zeit)}</span>
                <span class="alarm-kind">${esc(eintrag.art)}</span>
            </div>
            <div class="alarm-title">${esc(eintrag.titel)}</div>
            ${eintrag.ort ? `<div class="alarm-sub">${esc(eintrag.ort)}</div>` : ''}
            ${eintrag.notiz ? `<div class="alarm-note">${esc(eintrag.notiz)}</div>` : ''}
            <div class="alarm-actions">
                <button type="button" class="alarm-btn alarm-btn-snooze" aria-expanded="false">Später erinnern</button>
                <button type="button" class="alarm-btn alarm-btn-edit">Bearbeiten</button>
                <button type="button" class="alarm-btn alarm-btn-ok">Verstanden</button>
            </div>
            <div class="alarm-snooze-list" hidden>
                ${SPAETER.map((s, i) => `<button type="button" class="alarm-btn alarm-snooze-pick" data-i="${i}">${esc(s.label)}</button>`).join('')}
            </div>`;

        karte.querySelector('.alarm-btn-ok').addEventListener('click', () => karte.remove());
        karte.querySelector('.alarm-btn-edit').addEventListener('click', () => {
            karte.remove();
            window.oeffneErinnerungsZiel(eintrag.zielTyp, eintrag.zielId);
        });
        // Die Auswahl klappt erst auf Klick auf — fünf Knöpfe von Anfang an
        // machen die Karte unruhig und man verklickt sich.
        const spaeterBox = karte.querySelector('.alarm-snooze-list');
        const spaeterKnopf = karte.querySelector('.alarm-btn-snooze');
        spaeterKnopf.addEventListener('click', () => {
            spaeterBox.hidden = !spaeterBox.hidden;
            spaeterKnopf.setAttribute('aria-expanded', spaeterBox.hidden ? 'false' : 'true');
        });
        spaeterBox.querySelectorAll('.alarm-snooze-pick').forEach(btn => {
            btn.addEventListener('click', () => {
                const wahl = SPAETER[parseInt(btn.dataset.i, 10)];
                if (!wahl) return;
                spaeterMerken(eintrag, wahl.min);
                karte.remove();
                if (window.showToast) window.showToast(`Erinnerung in ${wahl.label} noch einmal.`);
            });
        });

        box.appendChild(karte);
        requestAnimationFrame(() => karte.classList.add('show'));

        systemMeldung(eintrag);
    }

    // ---------------------------------------------------------------
    // "Bearbeiten": direkt zu dem, worum es geht
    // ---------------------------------------------------------------
    // Wird sowohl vom Knopf auf der Karte als auch vom Klick auf die
    // Windows-Meldung aufgerufen (ueber den Service Worker, siehe sw.js).
    window.oeffneErinnerungsZiel = function (typ, id) {
        if (!id) return;
        try {
            if (typ === 'process') {
                if (typeof window.switchView === 'function') window.switchView('processes');
                if (typeof window.openEditProcessModal === 'function') {
                    window.openEditProcessModal(id);
                    return;
                }
            } else if (typ === 'event') {
                if (typeof window.openCalendarEntryEdit === 'function') {
                    window.openCalendarEntryEdit(id);
                    return;
                }
            }
            if (window.showToast) window.showToast('Der Eintrag laesst sich gerade nicht oeffnen.');
        } catch (e) {
            console.warn('Erinnerung: Ziel konnte nicht geoeffnet werden:', e);
            if (window.showToast) window.showToast('Der Eintrag laesst sich gerade nicht oeffnen.');
        }
    };

    // Klick auf die Windows-Meldung: der Service Worker holt das Fenster nach
    // vorn und schickt hierher, was gemeint war.
    if (navigator.serviceWorker) {
        navigator.serviceWorker.addEventListener('message', (e) => {
            const d = e && e.data;
            if (d && d.type === 'alarm-open') window.oeffneErinnerungsZiel(d.zielTyp, d.zielId);
        });
    }

    // Systemmeldung ausserhalb des Browserfensters (Windows-Info-Center).
    // Bevorzugt über den Service Worker: new Notification(...) wird von
    // Chrome auf manchen Systemen still verworfen, showNotification über
    // die Registrierung dagegen zuverlässig zugestellt — und die Meldung
    // bleibt im Info-Center stehen, statt nach Sekunden zu verschwinden.
    async function systemMeldung(eintrag) {
        if (typeof window.notificationsPushEnabled !== 'function' || !window.notificationsPushEnabled()) return;
        const titel = '⏰ ' + eintrag.titel;
        const optionen = {
            body: [eintrag.zeit + ' Uhr', eintrag.ort, eintrag.notiz].filter(Boolean).join('\n'),
            tag: eintrag.key,
            icon: 'assets/icons/meetra_arrows_icon.png',
            badge: 'assets/icons/meetra_arrows_icon.png',
            requireInteraction: true,   // bleibt stehen, bis man sie wegklickt
            renotify: true,
            // Damit der Klick auf die Meldung zum richtigen Eintrag fuehrt —
            // der Service Worker reicht das an die Seite zurueck.
            data: { zielTyp: eintrag.zielTyp, zielId: String(eintrag.zielId) }
        };
        try {
            if (navigator.serviceWorker && navigator.serviceWorker.ready) {
                const reg = await navigator.serviceWorker.ready;
                if (reg && typeof reg.showNotification === 'function') {
                    await reg.showNotification(titel, optionen);
                    return;
                }
            }
        } catch (e) { /* dann eben der direkte Weg unten */ }
        try {
            new Notification(titel, optionen);
        } catch (e) { /* Browser mag nicht — die Karte steht ja da */ }
    }

    // ---------------------------------------------------------------
    // Takt
    // ---------------------------------------------------------------
    async function pruefen() {
        if (laeuft || !uid()) return;
        laeuft = true;
        try {
            const gezeigt = gezeigtLaden();

            // 1) Verschobenes, dessen Zeit gekommen ist — unabhängig davon,
            //    ob der Eintrag heute noch in faellige() auftauchen würde.
            const verschoben = spaeterLaden();
            const offen = [];
            verschoben.forEach(x => {
                if (!x || !x.eintrag) return;
                if (Date.now() >= x.faellig) zeigen(x.eintrag);
                else offen.push(x);
            });
            if (offen.length !== verschoben.length) spaeterSpeichern(offen);
            const wartet = new Set(offen.map(x => x.eintrag.key));

            // 2) Was jetzt regulär fällig ist.
            const liste = await faellige();
            let geaendert = false;
            liste.forEach(e => {
                if (wartet.has(e.key)) return;      // liegt auf „Später"
                if (gezeigt.has(e.key)) return;
                zeigen(e);
                gezeigt.add(e.key);
                geaendert = true;
            });
            if (geaendert) gezeigtSpeichern(gezeigt);
        } catch (e) {
            console.warn('Wecker: Prüfung fehlgeschlagen:', e);
        } finally {
            laeuft = false;
        }
    }

    // ---------------------------------------------------------------
    // Einmalige Nachfrage: Systemmeldungen einschalten?
    // ---------------------------------------------------------------
    // Bewusst als eigene Karte MIT Knopf und nicht als automatischer Aufruf
    // von Notification.requestPermission() beim Laden:
    //   - Firefox und Safari verlangen eine echte Nutzeraktion, ein Aufruf
    //     beim Laden wird dort einfach abgelehnt.
    //   - Chrome zeigt ungefragte Abfragen nur noch klein am Rand und
    //     blockiert sie dauerhaft, wenn man sie wegklickt. Danach lässt sich
    //     das nur noch über die Browser-Einstellungen wieder aufheben.
    // Deshalb erst fragen, wenn der Nutzer auf „Einschalten" klickt — dann
    // erscheint die richtige Abfrage und sie wird viel eher erlaubt.
    const FRAGE_KEY = 'meetra_alarm_frage_';
    const SPAETER_TAGE = 7;

    function frageUnterdrueckt() {
        try {
            const bis = parseInt(localStorage.getItem(FRAGE_KEY + (uid() || 'anon')) || '0', 10);
            return bis && Date.now() < bis;
        } catch (e) { return false; }
    }

    function frageVerschieben(tage) {
        try {
            localStorage.setItem(FRAGE_KEY + (uid() || 'anon'),
                String(Date.now() + tage * 24 * 60 * 60 * 1000));
        } catch (e) { /* egal */ }
    }

    function frageZeigen() {
        if (typeof Notification === 'undefined') return;        // Browser kann es nicht
        if (Notification.permission !== 'default') return;      // schon entschieden
        if (frageUnterdrueckt()) return;
        if (document.getElementById('alarm-ask')) return;

        const karte = document.createElement('div');
        karte.className = 'alarm-card alarm-ask';
        karte.id = 'alarm-ask';
        karte.innerHTML = `
            <div class="alarm-head">
                <span class="alarm-bell">🔔</span>
                <span class="alarm-time">Erinnerungen</span>
            </div>
            <div class="alarm-title">Meldungen auf dem Bildschirm?</div>
            <div class="alarm-note">Dann meldet sich der Rechner zur eingetragenen Uhrzeit — auch wenn gerade ein anderes Fenster vorne ist.</div>
            <div class="alarm-actions">
                <button type="button" class="alarm-btn" id="alarm-ask-later">Später</button>
                <button type="button" class="alarm-btn alarm-btn-ok" id="alarm-ask-yes">Einschalten</button>
            </div>`;
        behaelter().appendChild(karte);
        requestAnimationFrame(() => karte.classList.add('show'));

        karte.querySelector('#alarm-ask-later').addEventListener('click', () => {
            frageVerschieben(SPAETER_TAGE);
            karte.remove();
        });

        // Der Klick IST die Nutzeraktion, die die Browser verlangen.
        karte.querySelector('#alarm-ask-yes').addEventListener('click', async () => {
            try {
                const res = await Notification.requestPermission();
                if (res === 'granted') {
                    localStorage.setItem('meetra_push_enabled', 'on');
                    if (window.showToast) window.showToast('Meldungen sind eingeschaltet.', 'success');
                } else {
                    frageVerschieben(SPAETER_TAGE);
                    if (window.showToast) window.showToast('Der Browser hat Meldungen abgelehnt. Über das Schloss-Symbol in der Adresszeile lässt sich das ändern.', 'warn');
                }
            } catch (e) {
                console.warn('Berechtigung konnte nicht abgefragt werden:', e);
            }
            karte.remove();
        });
    }

    window.starteErinnerungsWecker = function () {
        if (timer) return;
        // Kurz warten, damit die Karte nicht mitten in den Seitenaufbau platzt.
        setTimeout(frageZeigen, 4000);
        pruefen();
        timer = setInterval(pruefen, PRUEF_INTERVALL);
    };

    // Nach dem Anmelden starten. Vorher gibt es keinen Benutzer, und ohne
    // Benutzer weiss der Wecker nicht, wessen Termine er melden soll.
    document.addEventListener('DOMContentLoaded', () => {
        const warten = setInterval(() => {
            if (uid()) {
                clearInterval(warten);
                window.starteErinnerungsWecker();
            }
        }, 3000);
    });
})();
