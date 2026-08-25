// ==========================================
// RÜCKMELDUNGEN AN DEN BENUTZER (Toasts)
// ==========================================
// Ersetzt die blockierenden alert()-Meldungen durch Einblendungen unten rechts.
//
//     window.showToast('Gespeichert!');                 -> Typ wird erkannt
//     window.showToast('Fehler beim Laden', 'error');   -> Typ explizit
//
// Wird kein Typ angegeben, wird er am Text erkannt (Fehler/Erfolg/Hinweis).
// Fehler bleiben länger stehen und lassen sich anklicken zum Schließen.
//
// Rückfragen (confirm) bleiben bewusst echte Dialoge — dort muss der Benutzer
// eine Entscheidung treffen, das darf nicht wegblenden.
// ==========================================
(function () {
    'use strict';

    const MAX_VISIBLE = 4;
    // Erfolg ist bewusst kurz: „gespeichert" will man kurz sehen, nicht lesen.
    const DURATION = { error: 8000, warn: 6000, success: 2400, info: 4500 };

    function container() {
        let el = document.getElementById('toast-container');
        if (!el) {
            el = document.createElement('div');
            el.id = 'toast-container';
            document.body.appendChild(el);
        }
        return el;
    }

    // Typ am Meldungstext erkennen, damit die 300 vorhandenen Aufrufe
    // nicht alle einzeln angefasst werden müssen.
    function detectType(msg) {
        const s = String(msg || '').toLowerCase();
        if (/fehler|fehlgeschlagen|konnte nicht|nicht möglich|ungültig|keine berechtigung|nicht geladen|nicht gefunden|abgebrochen/.test(s)) return 'error';
        if (/bitte |achtung|hinweis|kein |keine |nicht ausgewählt|zuerst/.test(s)) return 'warn';
        if (/erfolgreich|gespeichert|angelegt|erstellt|aktualisiert|gelöscht|übernommen|kopiert|fertig/.test(s)) return 'success';
        return 'info';
    }

    const ICONS = {
        error: '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line>',
        warn: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line>',
        success: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>',
        info: '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line>'
    };

    function dismiss(el) {
        if (!el || el.dataset.closing) return;
        el.dataset.closing = '1';
        el.classList.remove('show');
        setTimeout(() => el.remove(), 260);
    }

    window.showToast = function (message, type, opts) {
        opts = opts || {};
        const msg = String(message == null ? '' : message);
        if (!msg.trim()) return;

        const t = type || detectType(msg);
        const box = container();

        // Zu viele gleichzeitig? Ältesten entfernen.
        while (box.children.length >= MAX_VISIBLE) dismiss(box.firstElementChild);

        const el = document.createElement('div');
        el.className = 'toast toast-' + t;
        el.setAttribute('role', t === 'error' ? 'alert' : 'status');
        el.innerHTML =
            '<span class="toast-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">' +
            (ICONS[t] || ICONS.info) + '</svg></span>' +
            '<span class="toast-msg"></span>' +
            '<span class="toast-close" title="Schließen">&times;</span>';
        // Text als textContent setzen, damit Meldungen mit < > nichts kaputtmachen
        el.querySelector('.toast-msg').textContent = msg;

        el.addEventListener('click', () => dismiss(el));
        box.appendChild(el);
        requestAnimationFrame(() => el.classList.add('show'));

        const ms = opts.duration || DURATION[t] || DURATION.info;
        const timer = setTimeout(() => dismiss(el), ms);
        // Beim Drüberfahren nicht wegblenden, damit man lange Texte lesen kann
        el.addEventListener('mouseenter', () => clearTimeout(timer));
        el.addEventListener('mouseleave', () => setTimeout(() => dismiss(el), 1500));

        return el;
    };

    // Kurzformen
    window.toastError = (m) => window.showToast(m, 'error');
    window.toastSuccess = (m) => window.showToast(m, 'success');
    window.toastInfo = (m) => window.showToast(m, 'info');

    // Ursprüngliches alert() für Notfälle erreichbar halten
    window.nativeAlert = window.alert.bind(window);
})();
