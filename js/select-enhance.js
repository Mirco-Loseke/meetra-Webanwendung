/* =========================================================
   NATIVE <select> -> EINHEITLICHES DROPDOWN
   =========================================================
   Warum es das gibt:
   Ein natives <select> klappt eine Liste auf, die das
   Betriebssystem zeichnet. Die laesst sich mit CSS nicht
   gestalten — deshalb sahen diese Felder aus wie Windows und
   nicht wie der Rest der App, egal was im Stylesheet stand.

   Loesung (dasselbe Muster wie schon bei Vorgangs-Typ/-Status
   in js/processes-ui.js): das <select> bleibt unveraendert im
   DOM, wird nur unsichtbar, und bekommt daneben einen
   .glass-select-Ausloeser plus ein .user-dropdown-menu.

   Dadurch laeuft aller bestehende Code weiter:
     - select.value lesen und setzen
     - onchange="..." im Markup
     - addEventListener('change', ...)
     - Optionen per JS nachfuellen
   Es aendert sich ausschliesslich, was der Nutzer sieht.

   Nicht angefasst werden:
     - <select multiple>       (Mehrfachauswahl, andere Bedienung)
     - bereits verstecktes <select> (hat schon ein Custom-Menue)
     - alles mit data-no-enhance

   Positionierung uebernimmt js/dropdown-position.js, das auf
   .user-dropdown-menu.show hoert — deshalb genau diese Klassen.
   ========================================================= */

(function () {
    'use strict';

    var ATTR = 'data-enhanced';

    function istVersteckt(el) {
        // Nur ein per Inline-Stil ausgeblendetes <select> wird uebersprungen:
        // das wird bereits von einem vorhandenen Custom-Dropdown bedient
        // (z. B. Vorgaenge).
        //
        // Frueher wurde hier zusaetzlich offsetParent geprueft. Das war der
        // Grund, warum die meisten Felder der App nie umgebaut wurden: beim
        // Laden sind alle Views ausser der Startseite .hidden und saemtliche
        // Modals zu — die Felder darin galten damit als "versteckt" und
        // behielten das Windows-Aussehen, sobald man die Ansicht oeffnete.
        return !!(el.style && el.style.display === 'none');
    }

    function darfUmgebaut(sel) {
        if (!sel || sel.tagName !== 'SELECT') return false;
        if (sel.hasAttribute(ATTR)) return false;
        if (sel.multiple) return false;
        if (sel.hasAttribute('data-no-enhance')) return false;
        if (sel.closest('[data-no-enhance]')) return false;
        if (istVersteckt(sel)) return false;
        return true;
    }

    function textVon(sel) {
        var o = sel.options[sel.selectedIndex];
        return o ? o.text : '';
    }

    var SUCHE_AB = 10;   // ab so vielen Optionen bekommt das Menue ein Suchfeld

    // Suchfeld oben im Menue: tippen filtert die Eintraege (alle Woerter
    // muessen vorkommen, Reihenfolge egal). Enter waehlt den ersten Treffer.
    function sucheEinbauen(sel, menu) {
        var alt = menu.querySelector('.menu-such');
        if (alt) alt.remove();
        if (sel.options.length <= SUCHE_AB) return;
        var box = document.createElement('div');
        box.className = 'menu-such';
        var inp = document.createElement('input');
        inp.type = 'text';
        inp.placeholder = 'Suchen …';
        inp.setAttribute('autocomplete', 'off');
        box.appendChild(inp);
        menu.insertBefore(box, menu.firstChild);
        function filtern() {
            var tokens = inp.value.toLowerCase().split(/s+/).filter(Boolean);
            Array.prototype.forEach.call(menu.querySelectorAll('ul > li'), function (li) {
                var t = li.textContent.toLowerCase();
                li.hidden = !tokens.every(function (tok) { return t.indexOf(tok) !== -1; });
            });
        }
        inp.addEventListener('input', filtern);
        inp.addEventListener('click', function (e) { e.stopPropagation(); });
        inp.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') { menu.classList.remove('show'); return; }
            if (e.key === 'Enter') {
                e.preventDefault();
                var erster = Array.prototype.filter.call(menu.querySelectorAll('ul > li'), function (li) { return !li.hidden; })[0];
                if (erster) erster.click();
            }
        });
        setTimeout(function () { try { inp.focus(); } catch (e) {} }, 0);
    }

    function menueFuellen(sel, menu) {
        var ul = menu.querySelector('ul');
        ul.innerHTML = '';
        // Lange Listen (Laender, Kunden, Maschinen) enger setzen, damit man
        // ohne endloses Scrollen etwas findet.
        menu.classList.toggle('menu-compact', sel.options.length > 10);
        sucheEinbauen(sel, menu);
        Array.prototype.forEach.call(sel.options, function (opt) {
            var li = document.createElement('li');
            li.textContent = opt.text;
            if (opt.disabled) {
                li.style.opacity = '0.45';
                li.style.cursor = 'default';
            }
            // .selected faerbt den Eintrag markenrot (dropdown-look.css)
            if (opt.selected) li.classList.add('selected');
            li.addEventListener('click', function (e) {
                e.stopPropagation();
                if (opt.disabled) return;
                sel.value = opt.value;
                // Beide Ereignisse, damit sowohl onchange="" als auch
                // addEventListener('input') bestehender Module greifen.
                sel.dispatchEvent(new Event('input', { bubbles: true }));
                sel.dispatchEvent(new Event('change', { bubbles: true }));
                menu.classList.remove('show');
                anzeigeAktualisieren(sel);
            });
            ul.appendChild(li);
        });
    }

    function anzeigeAktualisieren(sel) {
        var w = sel._ddWrapper;
        if (!w) return;
        w.querySelector('.glass-select > span').textContent = textVon(sel);
    }

    function umbauen(sel) {
        if (!darfUmgebaut(sel)) return;
        sel.setAttribute(ATTR, '1');

        var wrapper = document.createElement('div');
        wrapper.style.position = 'relative';
        // Breite des urspruenglichen Feldes uebernehmen, damit die
        // Filterzeile nicht umbricht. In Formularen fuellt ein Feld die
        // Zeile (100 %), in Filterzeilen (flex) richtet es sich nach dem
        // Inhalt — sonst wuerde ein einzelner Filter die ganze Leiste
        // einnehmen.
        var elternAnzeige = sel.parentElement
            ? getComputedStyle(sel.parentElement).display
            : 'block';
        var istFlexZeile = elternAnzeige === 'flex' || elternAnzeige === 'inline-flex';
        wrapper.style.width = sel.style.width || (istFlexZeile ? 'auto' : '100%');

        var trigger = document.createElement('div');
        trigger.className = 'glass-select';
        var span = document.createElement('span');
        span.textContent = textVon(sel);
        trigger.appendChild(span);
        if (sel.getAttribute('aria-label')) {
            trigger.setAttribute('aria-label', sel.getAttribute('aria-label'));
        }
        trigger.setAttribute('role', 'button');
        trigger.setAttribute('tabindex', '0');

        var menu = document.createElement('div');
        menu.className = 'user-dropdown-menu';
        menu.appendChild(document.createElement('ul'));

        sel.parentNode.insertBefore(wrapper, sel);
        wrapper.appendChild(trigger);
        wrapper.appendChild(menu);
        wrapper.appendChild(sel);

        // Das <select> bleibt bedienbar fuer Code, verschwindet nur optisch.
        sel.style.display = 'none';
        sel._ddWrapper = wrapper;

        function auf() {
            var offen = menu.classList.contains('show');
            document.querySelectorAll('.user-dropdown-menu.show')
                .forEach(function (m) { m.classList.remove('show'); });
            if (!offen) {
                menueFuellen(sel, menu);
                menu.classList.add('show');
            }
        }

        trigger.addEventListener('click', function (e) {
            e.stopPropagation();
            auf();
        });
        trigger.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); auf(); }
            if (e.key === 'Escape') menu.classList.remove('show');
        });

        // Wenn anderer Code den Wert setzt, muss die Anzeige folgen.
        sel.addEventListener('change', function () { anzeigeAktualisieren(sel); });

        // Viele Felder werden erst spaeter per JS mit Optionen gefuellt.
        new MutationObserver(function () {
            anzeigeAktualisieren(sel);
            if (menu.classList.contains('show')) menueFuellen(sel, menu);
        }).observe(sel, { childList: true, subtree: true });
    }

    function alleUmbauen(wurzel) {
        (wurzel || document).querySelectorAll('select').forEach(umbauen);
    }

    // Klick daneben schliesst offene Menues. Wichtig: das Menue, zu dessen
    // eigenem Feld der Klick gehoert, bleibt offen. Die hier selbst gebauten
    // Ausloeser stoppen die Weitergabe, fremde (z.B. Vorgangs-Typ/-Status mit
    // inline-onclick) tun das nicht — ohne diese Ausnahme wurden sie sofort
    // nach dem Aufklappen wieder zugeklappt und liessen sich gar nicht bedienen.
    document.addEventListener('click', function (e) {
        document.querySelectorAll('.user-dropdown-menu.show')
            .forEach(function (m) {
                var feld = m.parentElement;
                if (feld && feld.contains(e.target)) return;
                m.classList.remove('show');
            });
    });

    document.addEventListener('DOMContentLoaded', function () {
        alleUmbauen(document);
        // Modals und Listen entstehen erst zur Laufzeit.
        new MutationObserver(function (eintraege) {
            eintraege.forEach(function (e) {
                e.addedNodes.forEach(function (n) {
                    if (n.nodeType !== 1) return;
                    if (n.tagName === 'SELECT') umbauen(n);
                    else if (n.querySelectorAll) alleUmbauen(n);
                });
            });
        }).observe(document.body, { childList: true, subtree: true });
    });

    // Falls ein Modul Felder komplett neu aufbaut.
    window.dropdownsAktualisieren = alleUmbauen;
})();
