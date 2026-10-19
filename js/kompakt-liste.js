/* kompakt-liste.js — Umschalter „Kompakte Listen" (UX-12 / UX-13, 2026-10-17)
 *
 * Ein Knopf in der Kopfleiste schaltet body.liste-kompakt um (je Browser gemerkt):
 * Maschinen-, Serviceberichte- und Vorgangs-Karten werden zu schlanken Zeilen
 * ohne Foto und Zusatzblöcke, eine Karte pro Zeile. Handy: ca. 4× mehr Einträge pro
 * Bildschirm; Desktop: Listenmodus für Serviceberichte.
 * Rückgängig = diese Datei + css/components/kompakt-liste.css aus index.html und sw.js löschen.
 */
(function () {
    'use strict';
    const KEY = 'meetra_kompakt';
    const lesen = () => { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } };
    const schreiben = an => { try { if (an) localStorage.setItem(KEY, '1'); else localStorage.removeItem(KEY); } catch (e) { /* egal */ } };
    const ICON = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>';

    function anwenden(an) {
        document.body.classList.toggle('liste-kompakt', an);
        const b = document.getElementById('kompakt-btn');
        if (b) { b.setAttribute('aria-pressed', String(an)); b.title = an ? 'Zurück zur Kartenansicht' : 'Kompakte Listenansicht'; b.classList.toggle('an', an); }
    }

    // Der Knopf erscheint nur dort, wo er etwas bewirkt: Maschinen, Serviceberichte, Vorgänge.
    const ANSICHTEN = ['machines', 'service', 'processes'];
    function sichtbarkeit() {
        const b = document.getElementById('kompakt-btn');
        if (!b) return;
        const offen = document.querySelector('.view:not(.hidden)');
        b.hidden = !(offen && ANSICHTEN.includes(offen.id));
    }

    function aufbauen() {
        if (document.getElementById('kompakt-btn')) return;
        const rechts = document.querySelector('.topbar-right');
        if (!rechts) return;
        const b = document.createElement('button');
        b.type = 'button';
        b.id = 'kompakt-btn';
        b.className = 'knopf knopf--sekundaer knopf--icon';
        b.setAttribute('aria-label', 'Kompakte Listenansicht');
        b.innerHTML = ICON;
        b.addEventListener('click', () => { const an = !document.body.classList.contains('liste-kompakt'); schreiben(an); anwenden(an); });
        rechts.insertBefore(b, rechts.firstChild);
        anwenden(lesen());
        sichtbarkeit();
    }

    function start() {
        aufbauen(); setTimeout(aufbauen, 1500); setTimeout(aufbauen, 4000);
        // bei jedem Ansichtswechsel prüfen (switchView umhüllen + Klassenänderungen der Ansichten beobachten)
        const wrap = () => {
            const o = window.switchView;
            if (typeof o !== 'function' || o._kompakt) return;
            const n = function () { const r = o.apply(this, arguments); setTimeout(sichtbarkeit, 0); return r; };
            n._kompakt = true; window.switchView = n;
        };
        wrap(); setTimeout(wrap, 2500);
        window.addEventListener('hashchange', () => setTimeout(sichtbarkeit, 50));
        setInterval(sichtbarkeit, 1500);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
    document.body && anwenden(lesen());
})();
