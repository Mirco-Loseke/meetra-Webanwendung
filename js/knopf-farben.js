// ==========================================================
// KNOPF-FARBEN: Bearbeiten = blau, Löschen = rot umrandet, PDF = rot gefüllt (2026-10-17, auf Wunsch)
// ==========================================================
// Viele Knöpfe haben weder eine eigene Klasse noch einen Titel — nur den Text
// „Bearbeiten" oder ein Papierkorb-Symbol. Dieses Modul erkennt sie an Text,
// title/aria-label oder onclick und setzt .knopf-farbe-bearbeiten bzw.
// .knopf-farbe-loeschen; das Aussehen steht in css/components/knopf.css
// (Abschnitt „BEARBEITEN BLAU, LÖSCHEN ROT").
// Neue Knöpfe: gleich class="knopf knopf--bearbeiten" bzw. "knopf knopf--gefahr" setzen.
// Rückgängig: diese Datei aus index.html + sw.js nehmen.
// ==========================================================
(function () {
    'use strict';
    const LOESCHEN = /^(🗑\s*)?(löschen|entfernen|endgültig löschen)$|\blöschen\b/i;
    const BEARBEITEN = /^(✎|✏️|✏)?\s*(bearbeiten|ändern|edit)$|\bbearbeiten\b/i;
    const AUSNAHME = '#mail, .ab-ablage-dok, .mz-mehr, .ql-toolbar, .knopf-x, [data-knopf-farbe="aus"]';

    function pruefen(b) {
        if (!b || b.nodeType !== 1 || b.dataset.knopfFarbe) return;
        if (b.closest(AUSNAHME)) { b.dataset.knopfFarbe = '-'; return; }
        const text = (b.textContent || '').replace(/\s+/g, ' ').trim();
        const hinweis = [b.getAttribute('title'), b.getAttribute('aria-label')].filter(Boolean).join(' ');
        const klick = b.getAttribute('onclick') || '';
        const del = b.hasAttribute('data-del-area')
            || (text.length <= 22 && LOESCHEN.test(text))
            || (!text || text.length <= 2) && LOESCHEN.test(hinweis)
            || /\b(delete\w*|loeschen\w*|deleteMachine)\s*\(/i.test(klick) && text.length <= 22;
        // PDF: alles, was ein PDF zeigt, erstellt oder speichert (aber „PDF löschen“ bleibt Löschen)
        const pdf = !del && ((text.length <= 40 && /\bpdf\b/i.test(text)) || (!text || text.length <= 2) && /\bpdf\b/i.test(hinweis)
            || /pdf\w*\s*\(/i.test(klick) && text.length <= 3);   // per Funktion nur reine Symbol-Knöpfe
        const edit = !del && !pdf && ((text.length <= 22 && BEARBEITEN.test(text))
            || (!text || text.length <= 2) && BEARBEITEN.test(hinweis)
            || /\b(openEdit\w*|edit\w*)\s*\(/.test(klick) && text.length <= 22);
        b.dataset.knopfFarbe = del ? 'loeschen' : pdf ? 'pdf' : edit ? 'bearbeiten' : '-';
        if (del) b.classList.add('knopf-farbe-loeschen');
        else if (pdf) b.classList.add('knopf-farbe-pdf');
        else if (edit) b.classList.add('knopf-farbe-bearbeiten');
    }
    function alle(wurzel) {
        if (wurzel.matches && wurzel.matches('button, [role="button"]')) pruefen(wurzel);
        if (wurzel.querySelectorAll) wurzel.querySelectorAll('button, [role="button"]').forEach(pruefen);
    }

    let warte = new Set(), geplant = false;
    function abarbeiten() { geplant = false; const l = [...warte]; warte = new Set(); l.forEach(alle); }
    const beobachter = new MutationObserver(liste => {
        liste.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1) warte.add(n); }));
        if (!geplant && warte.size) { geplant = true; (window.requestIdleCallback || requestAnimationFrame)(abarbeiten); }
    });
    function start() { alle(document.body); beobachter.observe(document.body, { childList: true, subtree: true }); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
