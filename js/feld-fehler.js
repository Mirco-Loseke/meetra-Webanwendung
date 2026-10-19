/* feld-fehler.js — Pflichtfeld sichtbar markieren (UX-05, 2026-10-17)
 *
 * Die Formulare melden fehlende Angaben nur per Toast („Bitte einen Titel eingeben.").
 * Hier wird showToast umhüllt: beginnt die Meldung mit „Bitte" und ist ein Fenster offen,
 * sucht die Funktion das leere Feld, das zur Meldung passt (Wörter in Beschriftung,
 * Platzhalter, Name), setzt es rot um, scrollt hin, fokussiert es und schreibt die
 * Meldung darunter. Beim Tippen/Wählen verschwindet die Markierung wieder.
 * Findet sich kein passendes Feld, bleibt es beim Toast wie bisher.
 *
 * Von Hand nutzbar:  window.feldFehler(element, 'Text')   |   window.feldFehlerWeg(container)
 */
(function () {
    'use strict';
    const FENSTER = '.modal-backdrop, .modal-new, [id$="-modal"], .mz-overlay';
    const sichtbar = el => {
        if (!el || el.hidden || el.type === 'hidden' || el.classList.contains('hidden')) return false;
        const cs = getComputedStyle(el);
        return cs.display !== 'none' && cs.visibility !== 'hidden' && el.getClientRects().length > 0;
    };
    const norm = s => String(s || '').toLowerCase().replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss').replace(/ae/g, 'a').replace(/oe/g, 'o').replace(/ue/g, 'u');
    const STOPP = new Set(['bitte', 'einen', 'eine', 'einem', 'geben', 'sie', 'ein', 'ihre', 'eingeben', 'angeben', 'waehlen', 'wahlen', 'auswahlen', 'ausfullen', 'aus', 'der', 'die', 'das', 'und', 'oder', 'mindestens', 'zuerst', 'erst', 'noch', 'wirklich', 'liste', 'ihren', 'diese', 'dieser']);

    function obersterFenster() {
        const offen = Array.from(document.querySelectorAll(FENSTER)).filter(sichtbar);
        if (!offen.length) return null;
        const z = el => { const v = parseInt(getComputedStyle(el).zIndex, 10); return isNaN(v) ? 0 : v; };
        return offen.reduce((a, b) => (z(b) >= z(a) ? b : a));
    }

    function beschriftung(feld) {
        const t = [];
        if (feld.id) { const l = document.querySelector('label[for="' + (window.CSS && CSS.escape ? CSS.escape(feld.id) : feld.id) + '"]'); if (l) t.push(l.textContent); }
        const pl = feld.closest('label'); if (pl) t.push(pl.textContent);
        t.push(feld.placeholder, feld.getAttribute('aria-label'), feld.name, feld.id, feld.title);
        // vorangehende Beschriftung im selben Block
        let p = feld.previousElementSibling, n = 0;
        while (p && n < 2) { if (/^(LABEL|SPAN|DIV|H\d|P|SMALL)$/.test(p.tagName) && p.textContent.length < 80) t.push(p.textContent); p = p.previousElementSibling; n++; }
        const eltern = feld.parentElement && feld.parentElement.querySelector(':scope > label, :scope > .form-label-caps, :scope > span');
        if (eltern) t.push(eltern.textContent);
        return norm(t.filter(Boolean).join(' '));
    }

    const leer = f => {
        if (f.tagName === 'SELECT') return !f.value;
        if (f.type === 'checkbox' || f.type === 'radio') return false;
        return !String(f.value || '').trim();
    };

    function finden(fenster, meldung) {
        const felder = Array.from(fenster.querySelectorAll('input, select, textarea')).filter(f => sichtbar(f) && !f.disabled && f.type !== 'file' && f.type !== 'button' && f.type !== 'submit' && leer(f));
        if (!felder.length) return null;
        const worte = norm(meldung).split(/[^a-z0-9]+/).filter(w => w.length >= 4 && !STOPP.has(w));
        let best = null, bestPunkte = 0;
        felder.forEach(f => {
            const b = beschriftung(f);
            const punkte = worte.reduce((s, w) => s + (b.includes(w.slice(0, Math.max(4, w.length - 2))) ? 1 : 0), 0) + (f.required ? 0.5 : 0);
            if (punkte > bestPunkte) { best = f; bestPunkte = punkte; }
        });
        if (best && bestPunkte >= 1) return best;
        const pflicht = felder.filter(f => f.required || f.getAttribute('aria-required') === 'true');
        return pflicht.length === 1 ? pflicht[0] : null;
    }

    function weg(f) {
        f.classList.remove('feld-fehler');
        f.removeAttribute('aria-invalid');
        const t = f.parentElement && f.parentElement.querySelector(':scope > .feld-fehler-text[data-fuer]');
        if (t) t.remove();
    }

    function markieren(f, text) {
        document.querySelectorAll('.feld-fehler').forEach(weg);
        f.classList.add('feld-fehler');
        f.setAttribute('aria-invalid', 'true');
        const t = document.createElement('div');
        t.className = 'feld-fehler-text';
        t.dataset.fuer = '1';
        t.setAttribute('role', 'alert');
        t.textContent = text;
        f.insertAdjacentElement('afterend', t);
        const aufheben = () => { weg(f); f.removeEventListener('input', aufheben); f.removeEventListener('change', aufheben); };
        f.addEventListener('input', aufheben);
        f.addEventListener('change', aufheben);
        try { f.scrollIntoView({ block: 'center', behavior: 'smooth' }); f.focus({ preventScroll: true }); } catch (e) { /* egal */ }
    }

    window.feldFehler = markieren;
    window.feldFehlerWeg = (c) => (c || document).querySelectorAll('.feld-fehler').forEach(weg);

    function einhaengen() {
        const orig = window.showToast;
        if (typeof orig !== 'function' || orig._ff) return;
        const neu = function (message) {
            try {
                if (typeof message === 'string' && /^Bitte\b/.test(message)) {
                    const fenster = obersterFenster();
                    if (fenster) {
                        const f = finden(fenster, message);
                        if (f) markieren(f, message);
                    }
                }
            } catch (e) { console.warn('feld-fehler:', e); }
            return orig.apply(this, arguments);
        };
        neu._ff = true;
        window.showToast = neu;
    }
    einhaengen();
    document.addEventListener('DOMContentLoaded', () => { einhaengen(); setTimeout(einhaengen, 2000); });
})();
