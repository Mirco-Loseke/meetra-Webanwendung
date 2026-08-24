// ==========================================
// VORGANG ÜBERGEBEN — quittieren und zurückmelden
// ==========================================
// Wird ein Vorgang jemandem zugewiesen, geht bei ihm ein Fenster auf:
//
//     „Jetzt erledigen"   -> quittiert, öffnet den Vorgang, und der Ersteller
//                            bekommt „X hat den Vorgang erhalten"
//     „Später erinnern"   -> 10 Min. / 30 Min. / 1 Std. / 2 Std. / morgen 8:00
//                            Danach geht dasselbe Fenster wieder auf.
//
// Getragen wird das von der Tabelle `assignment_responses`
// (supabase/supabase_add_assignment_responses.sql). Fehlt sie, tut dieses
// Modul nichts — die App läuft unverändert weiter.
//
// WARUM DIE ZEILEN DER EMPFÄNGER SELBST ANLEGT:
// Vorgänge entstehen an vielen Stellen — Anlegen-Fenster, Bearbeiten,
// Auto-Speichern, KI-Erfassung, Adressbuch. Ein Haken an jeder dieser Stellen
// wäre beim nächsten Umbau wieder unvollständig. Stattdessen sieht jeder
// Client nach, welche Vorgänge IHM zugewiesen sind, und legt sich die fehlende
// Quittungszeile selbst an. Ein Ort statt sechs.
//
// GRENZE, die man kennen muss: das läuft nur, solange die App im Browser
// offen ist — wie beim Wecker (js/reminder-alarm.js). Ein geschlossener
// Browser kann sich nicht melden.
// ==========================================
(function () {
    'use strict';

    const TABLE = 'assignment_responses';
    const TAKT = 20 * 1000;          // gleicher Takt wie der Wecker
    const MORGENS_STUNDE = 8;        // „morgen" heißt: morgen früh um 8

    // Später-Erinnern-Auswahl. Minuten, oder morgens = fester Zeitpunkt.
    const SPAETER = [
        { label: '10 Min.', min: 10 },
        { label: '30 Min.', min: 30 },
        { label: '1 Std.', min: 60 },
        { label: '2 Std.', min: 120 },
        { label: 'Morgen 8:00', morgens: true }
    ];

    let timer = null;
    let laeuft = false;
    let tabelleFehlt = false;
    let bisNachziehen = 1;   // beim ersten Takt sofort nachziehen

    function sb() { return window.supabaseClient; }
    function user() { return window.activeUser || null; }
    function uid() { const u = user(); return u && u.id != null ? u.id : null; }
    function uidStr() { const i = uid(); return i == null ? null : String(i); }
    function uname() { const u = user(); return (u && u.name) || ''; }

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    // Fehlt die Tabelle, wird nach dem ersten Fehlschlag nicht weiter geprüft.
    function fehlgeschlagen(err) {
        const msg = (err && (err.message || err.details)) || '';
        if ((err && err.code === '42P01') || /assignment_responses/i.test(msg)) {
            tabelleFehlt = true;
            console.warn('Vorgangs-Quittung: Tabelle assignment_responses fehlt. ' +
                'Migration: supabase/supabase_add_assignment_responses.sql');
        } else {
            console.warn('Vorgangs-Quittung:', err);
        }
    }

    // Gehört mir? In diesem Projekt steht in assigned_users mal die ID,
    // mal der Name — deshalb beides prüfen (wie in js/tasks.js).
    function istMeins(werte) {
        const id = uidStr(), name = uname().toLowerCase().trim();
        if (!id || !Array.isArray(werte)) return false;
        return werte.some(v => {
            const s = String(v).toLowerCase().trim();
            return s === id.toLowerCase() || (name && s === name);
        });
    }

    function namensSuche(id) {
        if (id == null) return null;
        const u = (window.userList || []).find(x => String(x.id) === String(id));
        return u ? u.name : null;
    }

    // Umgekehrt: an Schritten steht nur der Name des Erstellers, keine Kennung.
    function namensZuId(name) {
        const n = String(name || '').toLowerCase().trim();
        if (!n) return null;
        const u = (window.userList || []).find(x => String(x.name || '').toLowerCase().trim() === n);
        return u ? u.id : null;
    }

    function morgenFrueh() {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        d.setHours(MORGENS_STUNDE, 0, 0, 0);
        return d;
    }

    function hhmm(d) {
        const p = n => String(n).padStart(2, '0');
        return p(d.getHours()) + ':' + p(d.getMinutes());
    }

    // =========================================================
    // 1) FEHLENDE QUITTUNGSZEILEN ANLEGEN
    // =========================================================
    async function zeilenNachziehen() {
        const meine = uid();
        if (meine == null) return;

        // Nur offene Vorgänge — erledigte will niemand mehr quittieren.
        const { data, error } = await sb()
            .from('internal_processes')
            .select('id, title, assigned_users, status, created_by_user, steps')
            .order('process_date', { ascending: false })
            .limit(300);
        if (error) { console.warn('Vorgangs-Quittung: Vorgänge nicht lesbar:', error); return; }

        const offen = (data || []).filter(p =>
            p.status !== 'erledigt' && p.status !== 'abgeschlossen');
        if (!offen.length) return;

        const meinName = uname().toLowerCase().trim();
        const rows = [];

        offen.forEach(p => {
            const erstellerId = p.created_by_user != null ? p.created_by_user : null;

            // (A) Der ganze Vorgang ist mir zugewiesen.
            // Wer ihn selbst angelegt hat, muss sich nichts quittieren — und
            // der Ersteller ist seit 20.08.2026 automatisch vorausgewählt.
            if (istMeins(p.assigned_users) && String(erstellerId || '') !== String(meine)) {
                rows.push({
                    target_type: 'process',
                    target_id: String(p.id),
                    title: p.title || 'Vorgang',
                    user_id: meine,
                    user_name: uname(),
                    invited_by: erstellerId,
                    // Namen gleich mitschreiben: auf der Karte steht „von Marcel",
                    // dafür soll kein zweiter Zugriff nötig sein.
                    invited_by_name: namensSuche(erstellerId)
                });
            }

            // (B) Ein einzelner SCHRITT ist mir zugewiesen. Am Schritt steht
            // assigned_id (Kennung) und/oder assigned_to (Name) — beides prüfen,
            // ältere Schritte haben nur den Namen.
            (Array.isArray(p.steps) ? p.steps : []).forEach(s => {
                if (!s || s.done) return;
                const passtId = s.assigned_id != null && String(s.assigned_id) === String(meine);
                const passtName = meinName && String(s.assigned_to || '').toLowerCase().trim() === meinName;
                if (!passtId && !passtName) return;

                // Wer den Schritt angelegt hat, steht dort nur als Name.
                const vonId = namensZuId(s.created_by);
                if (String(vonId || erstellerId || '') === String(meine)) return;   // selbst vergeben

                rows.push({
                    target_type: 'step',
                    target_id: String(p.id) + '::' + String(s.id),
                    title: (s.text || 'Schritt') + ' — ' + (p.title || 'Vorgang'),
                    user_id: meine,
                    user_name: uname(),
                    invited_by: vonId != null ? vonId : erstellerId,
                    invited_by_name: s.created_by || namensSuche(erstellerId)
                });
            });
        });

        if (!rows.length) return;

        // ignoreDuplicates: bestehende Zeilen NICHT anfassen — sonst würde ein
        // schon Quittiertes oder ein laufender Aufschub jedes Mal zurückgesetzt.
        const { error: upErr } = await sb()
            .from(TABLE)
            .upsert(rows, { onConflict: 'target_type,target_id,user_id', ignoreDuplicates: true });
        if (upErr) fehlgeschlagen(upErr);
    }

    // =========================================================
    // 2) WAS MUSS ICH QUITTIEREN?
    // =========================================================
    async function offeneHolen() {
        const meine = uid();
        if (meine == null) return [];
        const jetzt = new Date().toISOString();

        const { data, error } = await sb()
            .from(TABLE)
            .select('*')
            .eq('user_id', meine)
            .eq('status', 'offen')
            .or(`snooze_until.is.null,snooze_until.lte.${jetzt}`)
            .limit(50);
        if (error) { fehlgeschlagen(error); return []; }
        return data || [];
    }

    // =========================================================
    // 3) RÜCKMELDUNGEN AN DEN ERSTELLER
    // =========================================================
    async function rueckmeldungenHolen() {
        const meine = uid();
        if (meine == null) return [];
        const { data, error } = await sb()
            .from(TABLE)
            .select('*')
            .eq('invited_by', meine)
            .eq('seen_by_owner', false)
            .not('responded_at', 'is', null)
            .limit(20);
        if (error) { fehlgeschlagen(error); return []; }
        // Eigene Antworten an sich selbst nicht zurückmelden.
        return (data || []).filter(r => String(r.user_id) !== String(meine));
    }

    // =========================================================
    // ANZEIGE — nutzt die Karten des Weckers (js/reminder-alarm.js)
    // =========================================================
    function behaelter() {
        let el = document.getElementById('alarm-stack');
        if (!el) {
            el = document.createElement('div');
            el.id = 'alarm-stack';
            document.body.appendChild(el);
        }
        return el;
    }

    function schonDa(key) {
        return !!behaelter().querySelector(`[data-alarm-key="${CSS.escape(key)}"]`);
    }

    function karteZeigen(row) {
        const key = 'handoff:' + row.id;
        if (schonDa(key)) return;

        const istSchritt = row.target_type === 'step';
        const von = row.invited_by_name ? ` von ${row.invited_by_name}` : '';
        const karte = document.createElement('div');
        karte.className = 'alarm-card handoff-card';
        karte.setAttribute('data-alarm-key', key);
        karte.innerHTML = `
            <div class="alarm-head">
                <span class="alarm-bell">${istSchritt ? '☑️' : '📋'}</span>
                <span class="alarm-time">Für dich</span>
                <span class="alarm-kind">${istSchritt ? 'Schritt' : 'Vorgang'}</span>
            </div>
            <div class="alarm-title">${esc(row.title || 'Vorgang')}</div>
            <div class="alarm-sub">${istSchritt ? 'Schritt' : 'Vorgang'} dir zugewiesen${esc(von)}</div>
            <div class="alarm-actions">
                <button type="button" class="alarm-btn handoff-later">Später erinnern</button>
                <button type="button" class="alarm-btn alarm-btn-ok handoff-now">Jetzt erledigen</button>
            </div>
            <div class="handoff-snooze" hidden>
                ${SPAETER.map((s, i) => `<button type="button" class="alarm-btn handoff-snooze-btn" data-i="${i}">${esc(s.label)}</button>`).join('')}
            </div>`;

        karte.querySelector('.handoff-now').addEventListener('click', () => {
            karte.remove();
            annehmen(row);
        });

        // Die Auswahl klappt erst auf Klick auf — fünf Knöpfe von Anfang an
        // machen die Karte unruhig und man verklickt sich.
        const box = karte.querySelector('.handoff-snooze');
        karte.querySelector('.handoff-later').addEventListener('click', () => {
            box.hidden = !box.hidden;
        });
        box.querySelectorAll('.handoff-snooze-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                karte.remove();
                spaeter(row, SPAETER[parseInt(btn.dataset.i, 10)]);
            });
        });

        behaelter().appendChild(karte);
        requestAnimationFrame(() => karte.classList.add('show'));
        systemMeldung(istSchritt ? '☑️ Schritt für dich' : '📋 Vorgang für dich',
            (row.title || 'Vorgang') + (von ? '\n' + von.trim() : ''), key, row.target_id);
    }

    function rueckmeldungZeigen(row) {
        const key = 'handoff-ack:' + row.id;
        if (schonDa(key)) return;

        const wer = row.user_name || 'Ein Kollege';
        const was = row.target_type === 'step' ? 'Schritt' : 'Vorgang';
        const karte = document.createElement('div');
        karte.className = 'alarm-card handoff-card handoff-ack';
        karte.setAttribute('data-alarm-key', key);
        karte.innerHTML = `
            <div class="alarm-head">
                <span class="alarm-bell">✅</span>
                <span class="alarm-time">${esc(hhmm(new Date(row.responded_at)))}</span>
                <span class="alarm-kind">Rückmeldung</span>
            </div>
            <div class="alarm-title">${esc(wer)} hat den ${was} erhalten</div>
            <div class="alarm-sub">${esc(row.title || 'Vorgang')} — wird jetzt bearbeitet</div>
            <div class="alarm-actions">
                <button type="button" class="alarm-btn handoff-open">Ansehen</button>
                <button type="button" class="alarm-btn alarm-btn-ok handoff-ok">Alles klar</button>
            </div>`;

        const wegUndMerken = () => { karte.remove(); alsGesehenMerken(row); };
        karte.querySelector('.handoff-ok').addEventListener('click', wegUndMerken);
        karte.querySelector('.handoff-open').addEventListener('click', () => {
            wegUndMerken();
            zielOeffnen(row.target_id);
        });

        behaelter().appendChild(karte);
        requestAnimationFrame(() => karte.classList.add('show'));
        systemMeldung('✅ ' + wer + ' hat den ' + was + ' erhalten', row.title || 'Vorgang', key, row.target_id);
    }

    // Ein Schritt hat keine eigene Ansicht — er liegt als JSON im Vorgang.
    // target_id ist deshalb "<vorgang>::<schritt>"; geöffnet wird der Vorgang.
    function vorgangsId(targetId) {
        return String(targetId || '').split('::')[0];
    }

    function zielOeffnen(targetId) {
        const id = vorgangsId(targetId);
        if (!id) return;
        if (typeof window.oeffneErinnerungsZiel === 'function') {
            window.oeffneErinnerungsZiel('process', id);
        } else if (typeof window.openEditProcessModal === 'function') {
            window.openEditProcessModal(id);
        }
    }

    // Meldung außerhalb des Browserfensters. Gleicher Weg wie beim Wecker:
    // über den Service Worker, weil new Notification(...) in Chrome auf
    // manchen Systemen still verworfen wird.
    async function systemMeldung(titel, text, key, zielId) {
        if (typeof window.notificationsPushEnabled !== 'function' || !window.notificationsPushEnabled()) return;
        const optionen = {
            body: text,
            tag: key,
            icon: 'assets/icons/meetra_arrows_icon.png',
            badge: 'assets/icons/meetra_arrows_icon.png',
            requireInteraction: true,
            renotify: true,
            data: { zielTyp: 'process', zielId: String(zielId) }
        };
        try {
            if (navigator.serviceWorker && navigator.serviceWorker.ready) {
                const reg = await navigator.serviceWorker.ready;
                if (reg && typeof reg.showNotification === 'function') {
                    await reg.showNotification(titel, optionen);
                    return;
                }
            }
        } catch (e) { /* dann der direkte Weg */ }
        try { new Notification(titel, optionen); } catch (e) { /* Karte steht ja da */ }
    }

    // =========================================================
    // AKTIONEN
    // =========================================================
    async function annehmen(row) {
        try {
            const { error } = await sb().from(TABLE).update({
                status: 'angenommen',
                responded_at: new Date().toISOString(),
                snooze_until: null,
                user_name: uname() || row.user_name
            }).eq('id', row.id);
            if (error) throw error;
            if (window.showToast) {
                window.showToast((row.target_type === 'step' ? 'Schritt' : 'Vorgang') +
                    ' übernommen — der Ersteller wird benachrichtigt.', 'success');
            }
        } catch (e) {
            fehlgeschlagen(e);
            if (window.showToast) window.showToast('Die Rückmeldung konnte nicht gespeichert werden.', 'error');
        }
        zielOeffnen(row.target_id);
    }

    async function spaeter(row, wahl) {
        const wann = wahl.morgens ? morgenFrueh() : new Date(Date.now() + wahl.min * 60 * 1000);
        try {
            const { error } = await sb().from(TABLE)
                .update({ snooze_until: wann.toISOString() })
                .eq('id', row.id);
            if (error) throw error;
            if (window.showToast) {
                window.showToast('Erinnerung um ' + hhmm(wann) + ' Uhr' + (wahl.morgens ? ' (morgen)' : '') + '.', 'info');
            }
        } catch (e) {
            fehlgeschlagen(e);
        }
    }

    async function alsGesehenMerken(row) {
        try {
            const { error } = await sb().from(TABLE).update({ seen_by_owner: true }).eq('id', row.id);
            if (error) throw error;
        } catch (e) { fehlgeschlagen(e); }
    }

    // =========================================================
    // TAKT
    // =========================================================
    async function pruefen() {
        if (laeuft || tabelleFehlt || !sb() || uid() == null) return;
        laeuft = true;
        try {
            // Neue Zuweisungen ändern sich selten — nicht bei jedem Takt die
            // Vorgangsliste holen, das wäre alle 20 Sekunden eine Abfrage über
            // 300 Zeilen. Alle 100 Sekunden reicht; wer gerade zuweist, löst
            // ohnehin über Realtime aus.
            if (--bisNachziehen <= 0) {
                bisNachziehen = 5;
                await zeilenNachziehen();
            }
            if (tabelleFehlt) return;
            (await offeneHolen()).forEach(karteZeigen);
            (await rueckmeldungenHolen()).forEach(rueckmeldungZeigen);
        } catch (e) {
            console.warn('Vorgangs-Quittung: Prüfung fehlgeschlagen:', e);
        } finally {
            laeuft = false;
        }
    }

    window.pruefeVorgangsQuittungen = pruefen;

    // Sofort reagieren, wenn jemand etwas zuweist oder quittiert — sonst
    // dauert es bis zum nächsten Takt.
    function realtime() {
        const client = sb();
        if (!client || typeof client.channel !== 'function') return;
        try {
            client.channel('assignment-responses-live')
                .on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, () => { pruefen(); })
                .subscribe();
        } catch (e) { /* ohne Realtime bleibt der 20-Sekunden-Takt */ }
    }

    document.addEventListener('DOMContentLoaded', () => {
        const warten = setInterval(() => {
            if (uid() == null) return;
            clearInterval(warten);
            realtime();
            // Kurz warten, damit die Karte nicht in den Seitenaufbau platzt.
            setTimeout(pruefen, 5000);
            timer = setInterval(pruefen, TAKT);
        }, 3000);
    });

    console.log('Vorgangs-Quittung geladen.');
})();
