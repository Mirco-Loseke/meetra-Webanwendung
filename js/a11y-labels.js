/* a11y-labels.js — Icon-Knöpfe ohne Text bekommen einen Namen (UI-08, 2026-10-17)
 *
 * Knöpfe, die nur ein Symbol zeigen, hatten weder Text noch aria-label (Screenreader: „Schaltfläche"),
 * und mit der Maus gab es keinen Tooltip. Ein Beobachter ergänzt fehlende Namen aus
 * title → data-del-area → Funktionsname im onclick → Klassenname und setzt aria-label + title.
 * Bereits vorhandene Namen werden nie überschrieben. Neuer Icon-Knopf: weiterhin selbst
 * title + aria-label setzen — das hier ist nur das Netz darunter.
 */
(function () {
    'use strict';
    const REGELN = [
        // Schließen zuerst: closeEditProcessModal() enthält „edit“, closeDeleteModal() „delete“ — sonst hieße der Knopf Bearbeiten/Löschen.
        [/close|schliess|dismiss|\bcancel\b|abbrech/i, 'Schließen'],
        [/delete|remove|trash|loesch|entfern|papierkorb|\bdel\b/i, 'Löschen'],
        [/edit|bearbeit|stift|pencil/i, 'Bearbeiten'],
        [/download|herunter/i, 'Herunterladen'],
        [/upload|hochlad/i, 'Hochladen'],
        [/print|druck/i, 'Drucken'],
        [/pdf/i, 'PDF öffnen'],
        [/copy|kopier/i, 'Kopieren'],
        [/mail|email/i, 'E-Mail'],
        [/search|such/i, 'Suchen'],
        [/prev|zurueck|\bback\b|\bleft\b/i, 'Zurück'],
        [/next|weiter|\bright\b/i, 'Weiter'],
        [/add|plus|neu|create|anlegen|hinzu/i, 'Hinzufügen'],
        [/save|speicher/i, 'Speichern'],
        [/refresh|reload|aktualis/i, 'Aktualisieren'],
        [/filter/i, 'Filter'],
        [/history|historie|verlauf/i, 'Historie'],
        [/settings|einstell|zahnrad|gear/i, 'Einstellungen'],
        [/expand|collapse|toggle|chevron/i, 'Auf-/zuklappen'],
        [/mic|diktier|speech/i, 'Diktieren'],
        [/camera|kamera|foto|photo/i, 'Foto'],
        [/info/i, 'Info']
    ];
    const SEL = 'button, [role="button"], a.icon-btn, input[type="button"]';

    function hatName(el) {
        if (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.getAttribute('title')) return true;
        if (el.tagName === 'INPUT') return !!el.value;
        return !!(el.textContent || '').replace(/[\s ×✕✖✓+\-–—·•…]/g, '').length || !!el.querySelector('img[alt]:not([alt=""])');
    }

    function ableiten(el) {
        const quellen = [el.getAttribute('data-del-area') ? 'delete' : '', el.getAttribute('onclick') || '', el.id || '', el.className && el.className.baseVal === undefined ? el.className : '', (el.querySelector('svg title') || {}).textContent || ''].join(' ');
        for (const [re, name] of REGELN) if (re.test(quellen)) return name;
        const t = (el.textContent || '').trim();
        if (t === '×' || t === '✕' || t === '✖') return 'Schließen';
        if (t === '+') return 'Hinzufügen';
        return '';
    }

    function bearbeiten(el) {
        if (el.dataset.a11y === '1' || hatName(el)) return;
        const name = ableiten(el);
        el.dataset.a11y = '1';
        if (!name) return;
        el.setAttribute('aria-label', name);
        el.setAttribute('title', name);
    }

    function alle(wurzel) {
        if (wurzel.nodeType !== 1) return;
        if (wurzel.matches && wurzel.matches(SEL)) bearbeiten(wurzel);
        wurzel.querySelectorAll && wurzel.querySelectorAll(SEL).forEach(bearbeiten);
    }

    let geplant = false, offen = [];
    function planen(knoten) {
        offen.push(knoten);
        if (geplant) return;
        geplant = true;
        (window.requestIdleCallback || (f => setTimeout(f, 200)))(() => {
            geplant = false;
            const liste = offen; offen = [];
            liste.forEach(alle);
        });
    }

    function start() {
        alle(document.body);
        new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1) planen(n); })))
            .observe(document.body, { childList: true, subtree: true });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
