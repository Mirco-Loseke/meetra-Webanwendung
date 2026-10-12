// ==========================================
// MELDUNGS-TAKT — eine Meldung nach der anderen
// ==========================================
// Beim Öffnen der App lag bisher alles gleichzeitig an: Wecker, zugewiesene
// Vorgänge/Schritte, fällige Einträge der Glocke — zehn Karten und zehn
// Windows-Meldungen auf einmal. Jetzt reihen alle drei Module
// (reminder-alarm.js, assignment-handoff.js, notifications.js) ihre Meldung
// hier ein: die erste kommt sofort, jede weitere frühestens ABSTAND später.
//
// Zweitens hält dieses Modul Windows-Meldung und Karte in der App zusammen:
//   - Knöpfe in der Windows-Meldung (actions) kommen über sw.js hier an und
//     laufen durch dieselbe Aktion wie der Knopf auf der Karte.
//   - Wird etwas an einer Stelle erledigt, verschwindet es an der anderen:
//     Karte weg ⇒ Windows-Meldung zu, Aktion in Windows ⇒ Karte weg und
//     nicht mehr in der Warteschlange.
// ==========================================
(function () {
    'use strict';

    const ABSTAND = 60 * 1000;   // frühestens alle 60 s die nächste Meldung
    const ICON = 'assets/icons/meetra_arrows_icon.png';

    const STUMM_KEY = 'meetra_geraet_stumm';   // je Gerät: gar keine Meldungen
    const LEISTE_AB = 1;                       // ab so vielen Karten: Leiste „Jetzt nicht"
    const SPAETER_MIN = 30;                    // Standard-Ruhezeit nach „Jetzt nicht"
    const PAUSE_KEY = 'meetra_meldung_pause';  // Ende der Ruhe (ms) — überlebt Neuladen
    const DAUER_KEY = 'meetra_meldung_pause_min';   // zuletzt gewählte Ruhezeit

    const schlange = [];          // [{ key, zeigen }]
    let pauseBis = 0;             // Zeitstempel: bis dahin keine Karten zeigen
    try { pauseBis = +localStorage.getItem(PAUSE_KEY) || 0; } catch (e) { /* ohne Speicher */ }
    function pausiert() { return pauseBis > Date.now(); }
    const handler = new Map();    // key -> fn(aktion)
    const offenAusStart = new Map();   // key -> { aktion, zielTyp, zielId } (App war zu)
    let letzte = 0;
    let timer = null;

    function karteZu(key) {
        const box = document.getElementById('alarm-stack');
        const el = box && box.querySelector(`[data-alarm-key="${CSS.escape(key)}"]`);
        if (el) el.remove();
    }

    async function systemZu(key) {
        try {
            if (!navigator.serviceWorker) return;
            const reg = await navigator.serviceWorker.getRegistration();
            if (!reg || typeof reg.getNotifications !== 'function') return;
            (await reg.getNotifications({ tag: key })).forEach(n => n.close());
        } catch (e) { /* nichts offen */ }
    }

    function geraetStumm() {
        try { return localStorage.getItem(STUMM_KEY) === '1'; } catch (e) { return false; }
    }

    function geraetStummSetzen(an) {
        try { if (an) localStorage.setItem(STUMM_KEY, '1'); else localStorage.removeItem(STUMM_KEY); } catch (e) { /* ohne Speicher */ }
        stummKlasse();
        if (an) {
            // Alles, was schon ansteht oder offen ist, sofort weg.
            schlange.length = 0;
            const box = document.getElementById('alarm-stack');
            if (box) box.querySelectorAll('[data-alarm-key]').forEach(el => el.remove());
            systemAlleZu();
        }
    }

    async function systemAlleZu() {
        try {
            if (!navigator.serviceWorker) return;
            const reg = await navigator.serviceWorker.getRegistration();
            if (!reg || typeof reg.getNotifications !== 'function') return;
            (await reg.getNotifications()).forEach(n => n.close());
        } catch (e) { /* nichts offen */ }
    }

    function naechste() {
        timer = null;
        if (!schlange.length) return;
        if (geraetStumm()) { schlange.length = 0; return; }
        const ruhe = pauseBis - Date.now();
        if (ruhe > 0) { timer = setTimeout(naechste, ruhe); return; }
        const warte = letzte + ABSTAND - Date.now();
        if (warte > 0) { timer = setTimeout(naechste, warte); return; }
        const m = schlange.shift();
        letzte = Date.now();
        try { m.zeigen(); } catch (e) { console.warn('Meldung konnte nicht angezeigt werden:', e); }
        if (schlange.length) timer = setTimeout(naechste, ABSTAND);
    }

    // aktion(aktionsName) behandelt Knöpfe der Windows-Meldung; '' = Klick auf die Meldung selbst.
    function einreihen(key, zeigen, aktion) {
        if (!key || typeof zeigen !== 'function') return;
        if (geraetStumm()) return;
        if (typeof aktion === 'function') handler.set(key, aktion);

        // Wurde in Windows schon geklickt, während die App zu war: nicht mehr zeigen.
        const vorab = offenAusStart.get(key);
        if (vorab) {
            offenAusStart.delete(key);
            ausfuehren(key, vorab.aktion, vorab);
            return;
        }
        if (schlange.some(m => m.key === key)) return;
        schlange.push({ key, zeigen });
        if (!timer) naechste();
    }

    function istEingereiht(key) {
        return schlange.some(m => m.key === key);
    }

    function entfernen(key) {
        const i = schlange.findIndex(m => m.key === key);
        if (i >= 0) schlange.splice(i, 1);
        karteZu(key);
        systemZu(key);
    }

    function ausfuehren(key, aktion, daten) {
        const fn = handler.get(key);
        const ziel = daten || {};
        // Erst aus Schlange und Anzeige nehmen, damit dieselbe Meldung nicht
        // noch einmal in der App auftaucht.
        const i = schlange.findIndex(m => m.key === key);
        if (i >= 0) schlange.splice(i, 1);
        karteZu(key);
        if (fn) {
            try { fn(aktion || ''); } catch (e) { console.warn('Meldungs-Aktion fehlgeschlagen:', e); }
        } else if (ziel.zielId && typeof window.oeffneErinnerungsZiel === 'function') {
            window.oeffneErinnerungsZiel(ziel.zielTyp, ziel.zielId);
        }
    }

    // Windows-Meldung, möglichst mit Knöpfen. Knöpfe gehen nur über den
    // Service Worker; Chrome unter Windows zeigt höchstens Notification.maxActions (meist 2).
    // Nur EINE Meldung zur selben Zeit: Ist die App im Vordergrund, reicht die Karte.
    // Die Windows-Meldung wird gemerkt und erst gezeigt, wenn man die App verlässt
    // und die Karte dann noch steht. Zurück in der App ⇒ Windows-Meldungen zu.
    const zurueckgehalten = new Map();
    function appImVordergrund() {
        return !document.hidden && (typeof document.hasFocus !== 'function' || document.hasFocus());
    }
    function karteSteht(key) {
        const box = document.getElementById('alarm-stack');
        return !!(key && box && box.querySelector(`[data-alarm-key="${CSS.escape(key)}"]`));
    }
    function zurueckgehalteneZeigen() {
        if (appImVordergrund()) return;
        zurueckgehalten.forEach((args, key) => {
            zurueckgehalten.delete(key);
            if (karteSteht(key)) system(args[0], args[1], args[2]);
        });
    }
    window.addEventListener('blur', () => setTimeout(zurueckgehalteneZeigen, 300));
    window.addEventListener('focus', () => systemAlleZu());
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) zurueckgehalteneZeigen();
        else systemAlleZu();
    });

    async function system(titel, optionen, knoepfe) {
        if (geraetStumm()) return;
        if (typeof window.notificationsPushEnabled !== 'function' || !window.notificationsPushEnabled()) return;
        if (appImVordergrund() || pausiert()) {
            const key = optionen && optionen.tag;
            if (key) zurueckgehalten.set(key, [titel, optionen, knoepfe]);
            return;
        }
        const opt = Object.assign({
            icon: ICON,
            badge: ICON,
            requireInteraction: true,
            renotify: true
        }, optionen || {});
        const max = (typeof Notification !== 'undefined' && Notification.maxActions) || 2;
        try {
            if (navigator.serviceWorker && navigator.serviceWorker.ready) {
                const reg = await navigator.serviceWorker.ready;
                if (reg && typeof reg.showNotification === 'function') {
                    const mitKnoepfen = Array.isArray(knoepfe) && knoepfe.length
                        ? Object.assign({}, opt, { actions: knoepfe.slice(0, max) }) : opt;
                    await reg.showNotification(titel, mitKnoepfen);
                    return;
                }
            }
        } catch (e) { /* dann ohne Service Worker */ }
        try {
            const n = new Notification(titel, opt);
            n.onclick = () => { window.focus(); ausfuehren(opt.tag, '', opt.data); n.close(); };
        } catch (e) { /* Karte in der App reicht */ }
    }

    // Karte in der App weggeklickt ⇒ Windows-Meldung schließen.
    function beobachten() {
        let box = document.getElementById('alarm-stack');
        if (!box) {
            box = document.createElement('div');
            box.id = 'alarm-stack';
            document.body.appendChild(box);
        }
        pauseAnwenden();
        new MutationObserver(liste => {
            liste.forEach(m => m.removedNodes.forEach(n => {
                const key = n.getAttribute && n.getAttribute('data-alarm-key');
                if (key) { zurueckgehalten.delete(key); systemZu(key); }
            }));
            leisteAktualisieren(box);
        }).observe(box, { childList: true });
    }

    // Sobald eine Karte steht: oben die Leiste „Jetzt nicht". Sie blendet ALLE
    // Karten für die gewählte Zeit aus (auch solche, die in der Zeit dazukommen) —
    // nichts wird erledigt oder gelöscht, danach kommen sie genau so wieder.
    // Das Ende steht in localStorage (überlebt Neuladen/Homebildschirm-Neustart)
    // und wird per Intervall + Sichtbarkeit geprüft statt per langem setTimeout,
    // den Handys im Hintergrund schlafen legen.
    function dauerMin() {
        try { const v = +localStorage.getItem(DAUER_KEY); return v > 0 ? v : SPAETER_MIN; } catch (e) { return SPAETER_MIN; }
    }
    function leisteAktualisieren(box) {
        const anzahl = box.querySelectorAll('[data-alarm-key]').length;
        let leiste = box.querySelector('.alarm-spaeter-leiste');
        if (anzahl < LEISTE_AB) { if (leiste) leiste.remove(); return; }
        if (!leiste) {
            leiste = document.createElement('div');
            leiste.className = 'alarm-spaeter-leiste';
            leiste.innerHTML = '<span></span><div class="alarm-spaeter-wahl" data-no-enhance>'
                + '<select aria-label="Wie lange ausblenden" data-no-enhance>'
                + [[15, '15 Min'], [30, '30 Min'], [60, '1 Std'], [120, '2 Std'], [240, '4 Std']].map(([v, t]) => `<option value="${v}">${t}</option>`).join('')
                + '</select><button type="button">Jetzt nicht</button></div>';
            const sel = leiste.querySelector('select');
            sel.value = String(dauerMin());
            if (!sel.value) sel.value = String(SPAETER_MIN);
            sel.addEventListener('change', () => { try { localStorage.setItem(DAUER_KEY, sel.value); } catch (e) { /* egal */ } });
            leiste.querySelector('button').addEventListener('click', () => spaeter(+sel.value || SPAETER_MIN));
            box.prepend(leiste);
        }
        leiste.querySelector('span').textContent = anzahl === 1 ? '1 Benachrichtigung' : `${anzahl} Benachrichtigungen`;
    }

    function pauseAnwenden() {
        const box = document.getElementById('alarm-stack');
        if (box) box.classList.toggle('alarm-pausiert', pausiert());
    }
    function pauseEndePruefen() {
        if (!pauseBis || pausiert()) return;
        pauseBis = 0;
        try { localStorage.removeItem(PAUSE_KEY); } catch (e) { /* egal */ }
        pauseAnwenden();
        // Ein während der Ruhe gestellter Wecker (auf das alte Ende) darf das
        // Nachholen nicht blockieren — jetzt sofort weiter.
        if (timer) { clearTimeout(timer); timer = null; }
        naechste();
    }
    setInterval(pauseEndePruefen, 20000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) pauseEndePruefen(); });
    window.addEventListener('focus', pauseEndePruefen);
    // Andere Tabs desselben Browsers ruhen mit
    window.addEventListener('storage', e => {
        if (e.key !== PAUSE_KEY) return;
        pauseBis = +e.newValue || 0;
        pauseAnwenden();
        pauseEndePruefen();
    });

    function spaeter(minuten) {
        const min = +minuten > 0 ? +minuten : dauerMin();
        pauseBis = Date.now() + min * 60000;
        try { localStorage.setItem(PAUSE_KEY, String(pauseBis)); } catch (e) { /* ohne Speicher: nur bis Neuladen */ }
        pauseAnwenden();
        if (timer) { clearTimeout(timer); timer = null; }
        systemAlleZu();
        if (typeof window.showToast === 'function') {
            const bis = new Date(pauseBis).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
            window.showToast(`Benachrichtigungen ruhen bis ${bis} Uhr — danach kommen sie wieder.`);
        }
    }

    if (navigator.serviceWorker) {
        navigator.serviceWorker.addEventListener('message', (e) => {
            const d = e && e.data;
            if (d && d.type === 'meldung-aktion') ausfuehren(d.key, d.aktion, d);
            if (d && d.type === 'meldung-zu' && d.key) {
                const i = schlange.findIndex(m => m.key === d.key);
                if (i >= 0) schlange.splice(i, 1);
                zurueckgehalten.delete(d.key);
                karteZu(d.key);
            }
        });
    }

    // App war zu und wurde über einen Knopf der Windows-Meldung geöffnet (sw.js ⇒ ?meldung=…).
    function startParameter() {
        try {
            const p = new URLSearchParams(location.search);
            const key = p.get('meldung');
            if (!key) return;
            const daten = { aktion: p.get('aktion') || '', zielTyp: p.get('zielTyp') || '', zielId: p.get('zielId') || '' };
            history.replaceState(null, '', location.pathname + location.hash);
            offenAusStart.set(key, daten);
            // Meldet sich kein Modul für diesen Schlüssel, wenigstens das Ziel öffnen.
            const warten = setInterval(() => {
                if (!window.activeUser) return;
                clearInterval(warten);
                setTimeout(() => {
                    if (!offenAusStart.has(key)) return;
                    offenAusStart.delete(key);
                    if (daten.zielId && (daten.aktion === '' || daten.aktion === 'jetzt' || daten.aktion === 'oeffnen')
                        && typeof window.oeffneErinnerungsZiel === 'function') {
                        window.oeffneErinnerungsZiel(daten.zielTyp, daten.zielId);
                    }
                }, 20000);
            }, 1000);
        } catch (e) { /* ohne Parameter */ }
    }

    // body.geraet-stumm blendet alles aus, was sich meldet (Karten, Glocken-Zähler,
    // Pulsieren) — Regeln in css/components/reminder-alarm.css.
    function stummKlasse() {
        const an = geraetStumm();
        if (document.body) document.body.classList.toggle('geraet-stumm', an);
        if (an) {
            const box = document.getElementById('alarm-stack');
            if (box) box.querySelectorAll('[data-alarm-key]').forEach(el => el.remove());
        }
    }
    window.addEventListener('storage', e => { if (e.key === STUMM_KEY) { stummKlasse(); if (geraetStumm()) { schlange.length = 0; systemAlleZu(); } } });
    if (document.body) stummKlasse(); else document.addEventListener('DOMContentLoaded', stummKlasse);

    startParameter();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', beobachten);
    else beobachten();

    window.meldungsTakt = { einreihen, istEingereiht, entfernen, system, ausfuehren, geraetStumm, geraetStummSetzen, spaeter };
})();
