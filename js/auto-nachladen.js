// ==========================================================
// AUTOMATISCHES NACHLADEN LANGER LISTEN
// ==========================================================
// Lange Listen (Adressbuch, Serviceberichte) werden in Schritten geladen und
// hatten dafuer je einen "Mehr laden"-Knopf. Dieses Modul laesst den Knopf von
// selbst ausloesen, sobald er in die Naehe des sichtbaren Bereichs kommt —
// mit Vorlauf, damit der Nachschub schon da ist, bevor man unten ankommt.
//
// Verwendung:
//     window.autoNachladen(knopfElement, () => naechsteSeiteLaden());
//
// Der Knopf bleibt sichtbar und anklickbar:
//   - als Rueckfallebene, falls der Browser IntersectionObserver nicht kennt
//   - als Fortschrittsanzeige waehrend des Ladens
//   - fuer Bedienung per Tastatur
//
// Aufrufe fuer denselben Knopf ersetzen die vorherige Beobachtung, es sammeln
// sich also keine Beobachter an, wenn die Liste neu gezeichnet wird.
// ==========================================================
(function () {
    'use strict';

    const VORLAUF = '800px 0px';   // so frueh wird nachgeladen
    const beobachtungen = new WeakMap();

    // Naechster tatsaechlich scrollender Vorfahre; null heisst: das Fenster scrollt.
    function findeScrollContainer(el) {
        for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
            const overflowY = getComputedStyle(p).overflowY;
            if ((overflowY === 'auto' || overflowY === 'scroll') && p.scrollHeight > p.clientHeight) return p;
        }
        return null;
    }

    window.autoNachladen = function (knopf, aktion, optionen) {
        if (!knopf || typeof aktion !== 'function') return;

        // Vorherige Beobachtung dieses Knopfes beenden
        const alt = beobachtungen.get(knopf);
        if (alt) { alt.disconnect(); beobachtungen.delete(knopf); }

        // Wichtig: Manche Listen (Adressbuch) verwenden denselben Knopf weiter,
        // statt ihn neu zu erzeugen. Ohne dieses Zuruecksetzen bliebe er nach dem
        // ersten automatischen Nachladen dauerhaft deaktiviert und waere als
        // Rueckfallebene nicht mehr anklickbar.
        knopf.disabled = false;

        if (typeof IntersectionObserver === 'undefined') return;   // Knopf bleibt klickbar

        const ladeText = (optionen && optionen.ladeText) || 'Wird geladen …';
        let laeuft = false;

        const beobachter = new IntersectionObserver(eintraege => {
            if (laeuft || !eintraege.some(e => e.isIntersecting)) return;
            laeuft = true;

            const vorher = knopf.textContent;
            knopf.textContent = ladeText;
            knopf.disabled = true;

            // Im naechsten Frame ausfuehren, damit der Hinweistext noch gezeichnet
            // wird und das Nachladen das Scrollen nicht ruckeln laesst.
            requestAnimationFrame(() => {
                try {
                    aktion();
                } catch (e) {
                    console.error('Nachladen fehlgeschlagen:', e);
                    knopf.textContent = vorher;
                    knopf.disabled = false;
                } finally {
                    laeuft = false;
                }
            });
        }, { root: findeScrollContainer(knopf), rootMargin: VORLAUF, threshold: 0 });

        beobachter.observe(knopf);
        beobachtungen.set(knopf, beobachter);
    };
})();
