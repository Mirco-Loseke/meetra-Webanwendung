// ==========================================================
// DROPDOWN-POSITIONIERUNG IN SCROLLBAREN MODALS
// ==========================================================
// Problem: Die Auswahlmenüs (.user-dropdown-menu) liegen per position:absolute
// im Formularbereich des Modals. Der scrollt (overflow-y: auto) und schneidet
// das aufgeklappte Menü deshalb ab — je weiter unten das Feld steht, desto mehr.
//
// Lösung: Sobald ein Menü die Klasse "show" bekommt, wird es auf position:fixed
// umgestellt und an seinem Auswahlfeld ausgerichtet. Damit hängt es nicht mehr
// im Scroll-Container. Ist unter dem Feld zu wenig Platz, klappt es nach oben auf.
//
// Das JS der Felder bleibt unangetastet — es schaltet weiterhin nur "show" um.
// ==========================================================
(function () {
    'use strict';

    const MENU_SELECTOR = '.user-dropdown-menu';
    const ABSTAND = 8;      // Luft zwischen Feld und Menü
    const RAND = 12;        // Mindestabstand zum Fensterrand

    // Das zum Menü gehörende Auswahlfeld: liegt im selben Wrapper davor.
    function findeTrigger(menu) {
        const wrapper = menu.parentElement;
        if (!wrapper) return null;
        return wrapper.querySelector('.glass-select') || wrapper.firstElementChild;
    }

    function positionieren(menu) {
        if (istAusgenommen(menu)) return;
        const trigger = findeTrigger(menu);
        if (!trigger) return;

        const t = trigger.getBoundingClientRect();

        // Wie weit ist der Nutzer im Menü schon gescrollt? Ohne max-height
        // ist das Menü gleich nicht mehr scrollbar und der Browser wirft
        // den Wert weg — deshalb hier merken und unten wiederherstellen.
        const gescrollt = menu.scrollTop;

        // Zurücksetzen, damit die natürliche Höhe messbar ist
        menu.style.removeProperty('max-height');
        const hoehe = Math.min(menu.offsetHeight || 250, 250);

        const platzUnten = window.innerHeight - t.bottom - ABSTAND - RAND;
        const platzOben = t.top - ABSTAND - RAND;
        const nachOben = platzUnten < hoehe && platzOben > platzUnten;

        const maxHoehe = Math.min(250, Math.max(120, nachOben ? platzOben : platzUnten));

        // Das Modal-CSS setzt width/top mit !important — deshalb müssen die
        // berechneten Werte hier ebenfalls mit Priorität gesetzt werden.
        const setz = (p, v) => menu.style.setProperty(p, v, 'important');

        setz('position', 'fixed');
        setz('min-width', '0');
        setz('right', 'auto');
        setz('bottom', 'auto');
        setz('margin', '0');
        setz('max-height', maxHoehe + 'px');

        // Das Modal hat backdrop-filter und ist dadurch selbst der Bezugsrahmen
        // für position:fixed — die gesetzten Werte landen also versetzt. Statt den
        // Bezugsrahmen zu suchen, wird der Versatz gemessen und ausgeglichen.
        // Zwei Durchläufe, weil das Setzen der Breite einen Scrollbalken im
        // Formularbereich auslösen kann und sich das Feld dadurch nochmals
        // verschiebt.
        let versatzX = 0, versatzY = 0;

        for (let i = 0; i < 2; i++) {
            const feld = trigger.getBoundingClientRect();
            setz('width', feld.width + 'px');

            const zielLinks = feld.left;
            const zielOben = nachOben
                ? feld.top - menu.offsetHeight - ABSTAND
                : feld.bottom + ABSTAND;

            setz('left', (zielLinks + versatzX) + 'px');
            setz('top', (zielOben + versatzY) + 'px');

            const ist = menu.getBoundingClientRect();
            const dx = zielLinks - ist.left;
            const dy = zielOben - ist.top;
            if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) break;
            versatzX += dx;
            versatzY += dy;
        }

        if (gescrollt) menu.scrollTop = gescrollt;
    }

    function zuruecksetzen(menu) {
        ['position', 'left', 'top', 'bottom', 'width', 'min-width', 'right', 'margin', 'max-height']
            .forEach(p => menu.style.removeProperty(p));
    }

    function offeneMenus() {
        return document.querySelectorAll(MENU_SELECTOR + '.show');
    }

    // Auf das Umschalten von "show" reagieren
    const beobachter = new MutationObserver(mutationen => {
        mutationen.forEach(m => {
            const el = m.target;
            if (!el.matches || !el.matches(MENU_SELECTOR)) return;
            if (el.classList.contains('show')) positionieren(el);
            else zuruecksetzen(el);
        });
    });

    // Der Benutzerwechsel oben rechts in der Sidebar nutzt dieselbe Klasse
    // (.user-dropdown-menu), ist aber kein Feld in einem scrollenden Modal.
    // Ihn positioniert reines CSS (absolute; top:100%; right:0) — der
    // Modal-Positionierer darf ihn nicht anfassen, sonst landet er versetzt
    // und abgeschnitten unter dem schmalen Namensfeld.
    function istAusgenommen(menu) {
        return !!menu.closest('.sidebar-user-profile');
    }

    function beobachten(wurzel) {
        wurzel.querySelectorAll(MENU_SELECTOR).forEach(menu => {
            if (menu.dataset.posBeobachtet) return;
            if (istAusgenommen(menu)) { menu.dataset.posBeobachtet = '1'; return; }
            menu.dataset.posBeobachtet = '1';
            beobachter.observe(menu, { attributes: true, attributeFilter: ['class'] });
            if (menu.classList.contains('show')) positionieren(menu);
        });
    }

    // Beim Scrollen/Größenändern mitführen (capture: auch innerhalb des Modals)
    //
    // Scrollt der Nutzer IM Menü selbst (lange Listen, z.B. alle
    // Maschinenkategorien in den Protokollvorlagen), darf hier nichts
    // passieren: positionieren() nimmt zum Messen kurz die max-height
    // weg, das Menü ist in diesem Moment nicht mehr scrollbar und der
    // Browser setzt scrollTop auf 0. Bei jedem Mausrad-Schritt sprang
    // die Liste dadurch wieder an den Anfang — es sah aus, als hinge
    // sie fest, obwohl unten noch Einträge stehen.
    let wartend = false;
    function nachfuehren(e) {
        if (e && e.target && e.target.closest && e.target.closest(MENU_SELECTOR)) return;
        if (wartend) return;
        wartend = true;
        requestAnimationFrame(() => {
            wartend = false;
            offeneMenus().forEach(positionieren);
        });
    }

    function start() {
        beobachten(document);
        // Später nachgeladene Menüs ebenfalls erfassen
        new MutationObserver(() => beobachten(document))
            .observe(document.body, { childList: true, subtree: true });

        window.addEventListener('scroll', nachfuehren, true);
        window.addEventListener('resize', nachfuehren);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();
