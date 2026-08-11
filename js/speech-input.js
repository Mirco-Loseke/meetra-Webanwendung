// =========================================================
// SPRACHEINGABE (Diktieren) für Textfelder
// Eine einzige Umsetzung für alle KI-Eingabefelder: KI-Erfassung,
// KI-Servicebericht und Vorgang an einer Adresse. Früher steckte die
// Web-Speech-Anbindung nur in js/ai-address-task.js — an den anderen
// Stellen fehlte sie deshalb ganz.
//
// Verwendung im Markup eines Modals:
//     ${window.micButtonHtml('ai-capture-text')}
// Der Knopf trägt `data-mic-for="<id des Textfelds>"`; geklickt wird über
// eine Delegation am Dokument, damit die Knöpfe auch in nachträglich
// erzeugten Modals funktionieren.
//
// Hinweis: Die Web Speech API gibt es nur in Chrome/Edge und nur in einem
// sicheren Kontext (HTTPS oder localhost) — per Doppelklick über file://
// meldet der Knopf das verständlich, statt stumm nichts zu tun.
// =========================================================
(function () {
    'use strict';

    const MIC_SVG = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>';
    const STOP_SVG = '<svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';

    let recognition = null;
    let activeTargetId = null;
    let baseText = '';

    function el(id) { return id ? document.getElementById(id) : null; }

    // Nur der Knopf — gedacht für die Knopfreihe eines Modals (zwischen
    // „Abbrechen" und „Analysieren"). Die Statuszeile gehört dann darunter,
    // siehe micStatusHtml.
    window.micButtonHtml = function (targetId, opts) {
        const o = opts || {};
        const label = o.label === undefined ? 'Diktieren' : o.label;
        return `<button type="button" class="mic-btn" data-mic-for="${targetId}"
                    title="Diktieren — Text wird direkt ins Feld geschrieben">
                <span class="mic-btn-icon">${MIC_SVG}</span>${label ? `<span class="mic-btn-label">${label}</span>` : ''}
            </button>`;
    };

    // Statuszeile („Hört zu …", Fehlermeldungen) für ein Feld.
    window.micStatusHtml = function (targetId) {
        return `<div class="mic-status" data-mic-status-for="${targetId}"></div>`;
    };

    function setStatus(targetId, text, isError) {
        document.querySelectorAll(`[data-mic-status-for="${targetId}"]`).forEach(s => {
            s.textContent = text || '';
            s.classList.toggle('error', !!isError);
        });
    }

    function setButtonState(targetId, listening) {
        document.querySelectorAll(`[data-mic-for="${targetId}"]`).forEach(btn => {
            btn.classList.toggle('listening', listening);
            const icon = btn.querySelector('.mic-btn-icon');
            if (icon) icon.innerHTML = listening ? STOP_SVG : MIC_SVG;
            const label = btn.querySelector('.mic-btn-label');
            if (label) label.textContent = listening ? 'Aufnahme beenden' : 'Diktieren';
        });
    }

    window.stopSpeechInput = function () {
        if (recognition) {
            try { recognition.stop(); } catch (e) { }
        }
    };

    window.startSpeechInput = function (targetId) {
        const input = el(targetId);
        if (!input) return;

        // Zweiter Klick beendet die laufende Aufnahme.
        if (activeTargetId === targetId && recognition) { window.stopSpeechInput(); return; }
        if (recognition) window.stopSpeechInput();

        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) {
            setStatus(targetId, 'Spracheingabe gibt es in diesem Browser nicht (Chrome oder Edge nutzen).', true);
            return;
        }
        if (!window.isSecureContext && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
            setStatus(targetId, 'Das Mikrofon geht nur über HTTPS oder localhost — nicht beim Öffnen der Datei direkt.', true);
            return;
        }

        recognition = new SR();
        recognition.lang = 'de-DE';
        recognition.interimResults = true;
        recognition.continuous = true;

        activeTargetId = targetId;
        // Bereits getippter Text bleibt stehen, Diktiertes wird angehängt.
        baseText = input.value ? input.value.replace(/\s+$/, '') + ' ' : '';

        recognition.onstart = () => {
            setButtonState(targetId, true);
            setStatus(targetId, 'Hört zu … zum Beenden erneut klicken.');
        };

        recognition.onresult = (event) => {
            let interim = '', final = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const r = event.results[i];
                if (r.isFinal) final += r[0].transcript + ' ';
                else interim += r[0].transcript;
            }
            if (final) baseText += final;
            input.value = baseText + interim;
            // Damit Felder mit Auto-Höhe/Zeichenzähler mitbekommen, dass sich
            // der Inhalt geändert hat.
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.scrollTop = input.scrollHeight;
        };

        recognition.onerror = (e) => {
            const msg = e.error === 'not-allowed' || e.error === 'service-not-allowed'
                ? 'Zugriff auf das Mikrofon wurde abgelehnt. Bitte im Browser erlauben.'
                : (e.error === 'no-speech' ? 'Nichts gehört — bitte erneut versuchen.' : 'Fehler bei der Spracheingabe: ' + (e.error || 'unbekannt'));
            setStatus(targetId, msg, true);
        };

        recognition.onend = () => {
            setButtonState(targetId, false);
            const status = document.querySelector(`[data-mic-status-for="${targetId}"]`);
            if (status && !status.classList.contains('error')) setStatus(targetId, '');
            recognition = null;
            activeTargetId = null;
        };

        try {
            recognition.start();
        } catch (e) {
            setStatus(targetId, 'Mikrofon konnte nicht gestartet werden: ' + (e.message || e), true);
            recognition = null;
            activeTargetId = null;
        }
    };

    // Klick-Delegation: gilt auch für Knöpfe in später erzeugten Modals.
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-mic-for]');
        if (!btn) return;
        e.preventDefault();
        window.startSpeechInput(btn.getAttribute('data-mic-for'));
    });

    // Wird das Feld ausgeblendet (Modal zu), läuft die Aufnahme nicht weiter.
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') window.stopSpeechInput();
    });
})();
