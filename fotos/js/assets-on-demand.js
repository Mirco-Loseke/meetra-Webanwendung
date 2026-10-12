// ==========================================================
// GROSSE BILDDATEN ERST BEI BEDARF LADEN
// ----------------------------------------------------------
// assets/data/vorlage_base64.js (233 KB, Briefbogen) und
// assets/data/meetra_logo_base64.js (180 KB, Logo) hingen bisher fest
// im index.html. Damit wurden bei JEDEM Start 413 KB geladen, obwohl
// die Daten nur beim Erzeugen von PDFs und Etiketten gebraucht werden.
//
// Hier werden sie stattdessen nachgeladen, wenn sie das erste Mal
// gebraucht werden — danach stehen sie wie vorher als
// window.VORLAGE_BASE64 bzw. window.MEETRA_LOGO_BASE64 bereit.
//
// Bewusst ueber ein <script>-Element und nicht per fetch: die App muss
// auch per Doppelklick ueber file:// laufen, und dort verbietet der
// Browser fetch auf lokale Dateien.
// ==========================================================

(function () {
    'use strict';

    const QUELLEN = {
        vorlage: { datei: 'assets/data/vorlage_base64.js?v=38', global: 'VORLAGE_BASE64' },
        logo: { datei: 'assets/data/meetra_logo_base64.js?v=2', global: 'MEETRA_LOGO_BASE64' }
    };

    const laufend = {};

    // window.ladeBildDaten('vorlage') / ('logo')
    window.ladeBildDaten = function (name) {
        const q = QUELLEN[name];
        if (!q) return Promise.reject(new Error('Unbekannte Bilddaten: ' + name));
        if (window[q.global]) return Promise.resolve(window[q.global]);
        if (laufend[name]) return laufend[name];

        laufend[name] = new Promise((fertig, fehler) => {
            const s = document.createElement('script');
            s.src = q.datei;
            s.onload = () => fertig(window[q.global]);
            s.onerror = () => {
                laufend[name] = null;
                fehler(new Error(q.datei + ' konnte nicht geladen werden.'));
            };
            document.head.appendChild(s);
        });
        return laufend[name];
    };

    // Kurzformen für die Aufrufstellen
    window.ladeBriefbogen = () => window.ladeBildDaten('vorlage');
    window.ladeLogoDaten = () => window.ladeBildDaten('logo');
})();
