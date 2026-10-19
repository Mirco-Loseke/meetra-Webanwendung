/* ========================================================= */
/* ==================== UI MODALS MODULE =================== */
/* ========================================================= */

// showToast steht in js/ui-feedback.js (Einblendung unten rechts).
//
// Hier stand frueher eine zweite Fassung, die ein Element #toast erwartete —
// das es im Markup nirgends (mehr) gibt. Sie fiel deshalb immer auf das
// blockierende alert() des Browsers zurueck. Und weil ui-modals.js NACH
// ui-feedback.js geladen wird, hat diese Fassung die schoene ueberschrieben:
// jede Meldung der ganzen App kam als Browser-Kasten mit „OK". Nicht
// wieder einfuehren; wer etwas melden will, ruft window.showToast auf.

window.openModal = function (modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    requestAnimationFrame(() => {
        modal.classList.add('show');
    });
};

window.closeModal = function (modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.classList.remove('show');
    setTimeout(() => {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }, 300);
};

// ---------------------------------------------------------
// Fenster öffnen immer oben.
// Ein geschlossenes Fenster behält seine Scroll-Position (es wird nur
// ausgeblendet). Wer es weiter unten geschlossen hatte, bekam es beim
// nächsten Öffnen mittendrin — auf dem Handy waren Titel und X dann
// nicht zu sehen. Hier wird beim Übergang „zu → offen" einmal auf 0
// gesetzt, egal welche Funktion das Fenster öffnet. Gezieltes Scrollen
// danach (setTimeout, Fokus auf ein Feld) bleibt unberührt, weil der
// Beobachter vorher, im selben Durchlauf wie das Öffnen, greift.
// ---------------------------------------------------------
(function () {
    const FENSTER = '.modal-backdrop, .modal-new, [id$="-modal"]';
    const offen = new WeakMap();
    const istOffen = (el) => !el.classList.contains('hidden') && getComputedStyle(el).display !== 'none';

    function nachObenSetzen(el) {
        if (el.scrollTop) el.scrollTop = 0;
        el.querySelectorAll('*').forEach(k => { if (k.scrollTop) k.scrollTop = 0; });
    }

    const beobachter = new MutationObserver((liste) => {
        const gesehen = new Set();
        for (const m of liste) {
            const el = m.target;
            if (gesehen.has(el) || !el.matches || !el.matches(FENSTER)) continue;
            gesehen.add(el);
            const jetzt = istOffen(el);
            if (jetzt && offen.get(el) === false) nachObenSetzen(el);
            offen.set(el, jetzt);
        }
    });

    function start() {
        document.querySelectorAll(FENSTER).forEach(el => offen.set(el, istOffen(el)));
        beobachter.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
})();

// ---------------------------------------------------------
// Esc schließt das oberste Fenster — in ALLEN Fenstern (UX-03).
// Neuere Module (Adress-Detail, Suche, To-do …) behandeln Esc selbst. Damit nichts
// doppelt schließt, merkt sich dieser Handler vor den anderen (Capture) das oberste
// offene Fenster und schaut danach, ob sich etwas verändert hat. Nur wenn niemand
// reagiert hat, drückt er den Schließen-Knopf des Fensters — der enthält schon die
// Ungespeichert-Abfrage (Vorgang, Aufgabe, Maschine …).
// ---------------------------------------------------------
(function () {
    const FENSTER = '.modal-backdrop, .modal-new, [id$="-modal"]';
    const UEBERLAGEN = FENSTER + ', .menu-panel, .dropdown-menu, #photo-lightbox, #mv-player, .lightbox';
    const sichtbar = (el) => {
        if (!el || el.hidden || el.classList.contains('hidden')) return false;
        const cs = getComputedStyle(el);
        return cs.display !== 'none' && cs.visibility !== 'hidden' && el.getClientRects().length > 0;
    };
    const offene = () => Array.from(document.querySelectorAll(UEBERLAGEN)).filter(sichtbar);
    const zWert = (el) => { const z = parseInt(getComputedStyle(el).zIndex, 10); return isNaN(z) ? 0 : z; };
    const SCHLIESSEN = ['[data-esc-close]', '.btn-close-modal', '.btn-close', '.knopf-x', '.modal-close-btn', '.procurement-close-btn',
        'button[aria-label="Schließen"]', 'button[title="Schließen"]', 'button[onclick*="close" i]', 'button[onclick*="Close"]'];

    function schliessenKnopf(fenster) {
        for (const sel of SCHLIESSEN) {
            const k = Array.from(fenster.querySelectorAll(sel)).find(sichtbar);
            if (k) return k;
        }
        return Array.from(fenster.querySelectorAll('button')).find(b => sichtbar(b) && /^[×✕✖xX]$|^&times;$/.test((b.textContent || '').trim()));
    }

    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape' || e.defaultPrevented) return;
        // Eigene Rückfrage (Ungespeichert, App-Dialog) oder Eingabefeld mit offener Auswahl: nicht stören
        if (document.querySelector('[id*="unsaved" i], #app-dialog')) return;
        const vorher = offene();
        const fenster = vorher.filter(el => el.matches(FENSTER));
        if (!fenster.length) return;
        // oberstes: höchster z-index, bei Gleichstand das später im Dokument
        const oben = fenster.reduce((a, b) => (zWert(b) >= zWert(a) ? b : a));
        const anzahl = vorher.length;
        setTimeout(() => {
            if (e.defaultPrevented) return;
            if (offene().length !== anzahl) return;            // jemand hat reagiert
            if (!sichtbar(oben)) return;
            const k = schliessenKnopf(oben);
            if (k) k.click();
            else if (oben.id && typeof window.closeModal === 'function') window.closeModal(oben.id);
        }, 0);
    }, true);
})();

window.toggleCollapsibleSection = function (headerEl) {
    const section = headerEl.closest('.collapsible-section');
    if (!section) return;
    const content = section.querySelector('.section-content');
    const chevron = section.querySelector('.toggle-chevron');
    if (!content) return;

    const isHidden = content.style.display === 'none' || getComputedStyle(content).display === 'none';
    if (isHidden) {
        content.style.display = 'block';
        if (chevron) chevron.style.transform = 'rotate(180deg)';
    } else {
        content.style.display = 'none';
        if (chevron) chevron.style.transform = 'rotate(0deg)';
    }
};
