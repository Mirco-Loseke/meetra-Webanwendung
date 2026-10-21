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

    // ---------------------------------------------------------------
    // ARTEN — jede Karte gehört zu genau einer, erkennbar am Schlüssel.
    // Je Art eine Farbe (css/components/reminder-alarm.css, .meldung--ART)
    // und ein Schalter „bekomme ich das?" (prefs popup_ART, geräteübergreifend
    // über js/notifications.js gespeichert). Neue Kartenquelle ⇒ hier in
    // artVon() eintragen, sonst bleibt sie ungefärbt und ist nicht abschaltbar.
    // ---------------------------------------------------------------
    const ARTEN = [
        { art: 'faellig',  kurz: 'Zu erledigen', label: 'Erinnerungen',  info: 'Vorgänge und Schritte zur eingestellten Uhrzeit' },
        { art: 'termin',   kurz: 'Termin',      label: 'Termine',       info: 'Kalendertermine zur Uhrzeit' },
        { art: 'fuerdich', kurz: 'Für dich',    label: 'Für dich',      info: 'Ein Vorgang oder Schritt wurde dir zugewiesen' },
        { art: 'info',     kurz: 'Info',        label: 'Rückmeldungen', info: 'Kollegen haben etwas erhalten, angenommen oder erledigt — schließt sich nach 20 s selbst' }
    ];
    const INFO_ZU_MS = 20000;   // Info-Karten schließen sich selbst
    function artVon(key) {
        key = String(key || '');
        if (key.startsWith('handoff-ack:')) return 'info';
        if (key.startsWith('handoff:')) return 'fuerdich';
        if (key.startsWith('event:')) return 'termin';
        if (/^(proc|step):/.test(key)) return 'faellig';
        if (key === 'alarm-ask') return 'info';
        return null;   // z. B. 'glocke:' — nur Windows-Meldung, keine Karte
    }
    function artErlaubt(art) {
        if (!art) return true;
        try {
            const P = typeof window.notificationPrefs === 'function' ? window.notificationPrefs() : {};
            return P['popup_' + art] !== false;
        } catch (e) { return true; }
    }
    function artSetzen(art, an) {
        if (typeof window.saveNotificationPrefs === 'function') window.saveNotificationPrefs({ ['popup_' + art]: !!an });
        if (an) return;
        // Ausgeschaltet: Wartendes und Sichtbares dieser Art sofort weg.
        for (let i = schlange.length - 1; i >= 0; i--) if (artVon(schlange[i].key) === art) schlange.splice(i, 1);
        const box = document.getElementById('alarm-stack');
        if (box) box.querySelectorAll('[data-alarm-key]').forEach(el => { if (artVon(el.getAttribute('data-alarm-key')) === art) el.remove(); });
    }
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

    // AUF EIS (2026-10-21, auf Wunsch): alle Pop-ups/Windows-Meldungen sind für ALLE Geräte aus.
    // Code bleibt vollständig erhalten. Wieder einschalten = PAUSIERT auf false setzen.
    const PAUSIERT = true;

    function geraetStumm() {
        if (PAUSIERT) return true;
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

    // Höchstens EINE Karte gleichzeitig: solange eine steht, wartet die
    // nächste; der Beobachter unten ruft naechste(), sobald sie weg ist.
    function karteOffen() {
        const box = document.getElementById('alarm-stack');
        return !!(box && box.querySelector('[data-alarm-key]'));
    }

    function naechste() {
        timer = null;
        if (!schlange.length) return;
        if (karteOffen()) return;
        if (geraetStumm()) { schlange.length = 0; return; }
        const ruhe = pauseBis - Date.now();
        if (ruhe > 0) { timer = setTimeout(naechste, ruhe); return; }
        const warte = letzte + ABSTAND - Date.now();
        if (warte > 0) { timer = setTimeout(naechste, warte); return; }
        const m = schlange.shift();
        // Art inzwischen abgeschaltet? Dann gleich die nächste.
        if (!artErlaubt(artVon(m.key))) { naechste(); return; }
        letzte = Date.now();
        try { m.zeigen(); } catch (e) { console.warn('Meldung konnte nicht angezeigt werden:', e); }
    }

    // aktion(aktionsName) behandelt Knöpfe der Windows-Meldung; '' = Klick auf die Meldung selbst.
    function einreihen(key, zeigen, aktion) {
        if (!key || typeof zeigen !== 'function') return;
        if (geraetStumm()) return;
        if (!artErlaubt(artVon(key))) return;   // diese Art will der Nutzer nicht
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
        // Nur EINE Windows-Meldung: die zuletzt zurückgehaltene, deren Karte noch steht.
        let letzteArgs = null;
        zurueckgehalten.forEach((args, key) => { if (karteSteht(key)) letzteArgs = args; });
        zurueckgehalten.clear();
        if (letzteArgs) system(letzteArgs[0], letzteArgs[1], letzteArgs[2]);
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
        await systemAlleZu();   // nie mehr als eine Windows-Meldung gleichzeitig
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
        box.querySelectorAll('[data-alarm-key]').forEach(dekorieren);
        new MutationObserver(liste => {
            liste.forEach(m => m.removedNodes.forEach(n => {
                const key = n.getAttribute && n.getAttribute('data-alarm-key');
                if (key) { zurueckgehalten.delete(key); systemZu(key); }
            }));
            liste.forEach(m => m.addedNodes.forEach(n => { if (n.getAttribute && n.getAttribute('data-alarm-key')) dekorieren(n); }));
            // Karte weg → die nächste aus der Schlange (kurz Luft lassen).
            if (!karteOffen() && schlange.length && !timer) timer = setTimeout(naechste, 1500);
            leisteAktualisieren(box);
        }).observe(box, { childList: true });
    }

    // Jede neue Karte bekommt hier ihre Art: Farbe (.meldung--ART) und vorne im
    // Kopf ein Schild („Erinnerung", „Für dich", „Info"). Die Module bauen ihre
    // Karten weiter selbst — so bleibt die Einteilung an EINER Stelle.
    function dekorieren(el) {
        const key = el.getAttribute('data-alarm-key');
        const art = artVon(key);
        if (!art || el.dataset.meldungArt) return;
        el.dataset.meldungArt = art;
        el.classList.add('meldung', 'meldung--' + art);
        const a = ARTEN.find(x => x.art === art);
        const kopf = el.querySelector('.alarm-head');
        if (kopf && a) {
            const schild = document.createElement('span');
            schild.className = 'meldung-art';
            schild.textContent = a.kurz;
            kopf.prepend(schild);
            // Die Übergabe-Karte schrieb „Für dich" schon selbst in die Zeitspalte.
            const zeit = kopf.querySelector('.alarm-time');
            if (zeit && zeit.textContent.trim().toLowerCase() === a.kurz.toLowerCase()) zeit.remove();
        }
        if (art === 'info' && key !== 'alarm-ask') infoSelbstZu(el);
    }
    // Info-Karten verschwinden nach INFO_ZU_MS über ihren eigenen OK-Knopf
    // (damit das Modul z. B. „gesehen" vermerkt). Maus darauf = Uhr hält an.
    function infoSelbstZu(el) {
        const ok = el.querySelector('.alarm-btn-ok');
        if (!ok) return;
        const balken = document.createElement('div');
        balken.className = 'meldung-uhr';
        balken.style.animationDuration = INFO_ZU_MS + 'ms';
        balken.addEventListener('animationend', () => { if (el.isConnected) ok.click(); });
        el.appendChild(balken);
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
        if (anzahl < LEISTE_AB) {
            if (leiste) leiste.remove();
            const pop = box.querySelector('.meldung-einstellen');
            if (pop) pop.remove();
            return;
        }
        if (!leiste) {
            leiste = document.createElement('div');
            leiste.className = 'alarm-spaeter-leiste';
            leiste.innerHTML = '<span></span><div class="alarm-spaeter-wahl" data-no-enhance>'
                + '<button type="button" class="meldung-zahnrad" title="Welche Meldungen möchtest du bekommen?" aria-label="Meldungen einstellen" aria-expanded="false">'
                + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>'
                + '</button>'
                + '<select aria-label="Wie lange ausblenden" data-no-enhance>'
                + [[15, '15 Min'], [30, '30 Min'], [60, '1 Std'], [120, '2 Std'], [240, '4 Std']].map(([v, t]) => `<option value="${v}">${t}</option>`).join('')
                + '</select><button type="button" class="meldung-jetzt-nicht">Jetzt nicht</button></div>';
            const sel = leiste.querySelector('select');
            sel.value = String(dauerMin());
            if (!sel.value) sel.value = String(SPAETER_MIN);
            sel.addEventListener('change', () => { try { localStorage.setItem(DAUER_KEY, sel.value); } catch (e) { /* egal */ } });
            leiste.querySelector('.meldung-jetzt-nicht').addEventListener('click', () => spaeter(+sel.value || SPAETER_MIN));
            leiste.querySelector('.meldung-zahnrad').addEventListener('click', e => einstellenUmschalten(box, e.currentTarget));
            box.prepend(leiste);
        }
        leiste.querySelector('span').textContent = anzahl === 1 ? '1 Benachrichtigung' : `${anzahl} Benachrichtigungen`;
    }

    // Zahnrad in der Leiste: kleine Klappe direkt unter der Leiste — welche
    // Arten auf den Bildschirm dürfen. Gleiche Werte wie Einstellungen →
    // Benachrichtigungen (Abschnitt „Pop-ups auf dem Bildschirm").
    function einstellenHtml() {
        return '<div class="meldung-einstellen-kopf"><strong>Welche Meldungen willst du sehen?</strong>'
            + '<span>Gilt für dich auf allen Geräten.</span></div>'
            + ARTEN.map(a => {
                const an = artErlaubt(a.art);
                return `<label class="meldung-einstellen-zeile meldung--${a.art}">`
                    + `<span class="meldung-art">${a.kurz}</span>`
                    + `<span class="meldung-einstellen-text"><b>${a.label}</b><em>${a.info}</em></span>`
                    + `<span class="notifset-switch"><input type="checkbox" data-meldung-art="${a.art}" ${an ? 'checked' : ''}><span></span></span>`
                    + '</label>';
            }).join('')
            + '<button type="button" class="knopf knopf--text knopf--klein meldung-einstellen-alle">Alle Benachrichtigungs-Einstellungen …</button>';
    }
    function einstellenUmschalten(box, knopf) {
        let pop = box.querySelector('.meldung-einstellen');
        if (pop) { pop.remove(); knopf.setAttribute('aria-expanded', 'false'); return; }
        pop = document.createElement('div');
        pop.className = 'meldung-einstellen';
        pop.innerHTML = einstellenHtml();
        pop.addEventListener('change', e => {
            const art = e.target && e.target.getAttribute('data-meldung-art');
            if (!art) return;
            artSetzen(art, e.target.checked);
            const a = ARTEN.find(x => x.art === art);
            if (typeof window.showToast === 'function' && a) {
                window.showToast(e.target.checked ? `„${a.label}" kommen wieder.` : `„${a.label}" kommen nicht mehr auf den Bildschirm.`);
            }
        });
        pop.querySelector('.meldung-einstellen-alle').addEventListener('click', () => {
            pop.remove();
            knopf.setAttribute('aria-expanded', 'false');
            if (typeof window.openNotificationSettings === 'function') window.openNotificationSettings();
        });
        const leiste = box.querySelector('.alarm-spaeter-leiste');
        if (leiste) leiste.after(pop); else box.prepend(pop);
        knopf.setAttribute('aria-expanded', 'true');
        // Wer das Zahnrad einmal geöffnet hat, braucht kein Leuchten mehr.
        try { localStorage.setItem('meetra_meldung_zahnrad_gesehen', '1'); } catch (e) { /* egal */ }
        document.documentElement.classList.add('meldung-zahnrad-gesehen');
    }
    try { if (localStorage.getItem('meetra_meldung_zahnrad_gesehen') === '1') document.documentElement.classList.add('meldung-zahnrad-gesehen'); } catch (e) { /* egal */ }

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

    window.meldungsTakt = { einreihen, istEingereiht, entfernen, system, ausfuehren, geraetStumm, geraetStummSetzen, spaeter,
        arten: ARTEN, artVon, artErlaubt, artSetzen };
})();
