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

    const schlange = [];          // [{ key, zeigen }]
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

    function naechste() {
        timer = null;
        if (!schlange.length) return;
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
    async function system(titel, optionen, knoepfe) {
        if (typeof window.notificationsPushEnabled !== 'function' || !window.notificationsPushEnabled()) return;
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
        new MutationObserver(liste => {
            liste.forEach(m => m.removedNodes.forEach(n => {
                const key = n.getAttribute && n.getAttribute('data-alarm-key');
                if (key) systemZu(key);
            }));
        }).observe(box, { childList: true });
    }

    if (navigator.serviceWorker) {
        navigator.serviceWorker.addEventListener('message', (e) => {
            const d = e && e.data;
            if (d && d.type === 'meldung-aktion') ausfuehren(d.key, d.aktion, d);
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

    startParameter();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', beobachten);
    else beobachten();

    window.meldungsTakt = { einreihen, istEingereiht, entfernen, system, ausfuehren };
})();
