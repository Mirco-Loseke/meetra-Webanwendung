// =========================================================
// SPRACHEINGABE (Diktieren) für Textfelder
// Eine einzige Umsetzung für alle Diktier-Knöpfe: KI-Erfassung,
// KI-Servicebericht, Vorgang an einer Adresse und die Notiz im
// Adressbuch. Früher steckte die Web-Speech-Anbindung nur in
// js/ai-address-task.js — an den anderen Stellen fehlte sie deshalb ganz.
//
// Verwendung im Markup eines Modals:
//     ${window.micButtonHtml('ai-capture-text')}
// Der Knopf trägt `data-mic-for="<id des Textfelds>"`; geklickt wird über
// eine Delegation am Dokument, damit die Knöpfe auch in nachträglich
// erzeugten Modals funktionieren.
//
// WICHTIG — automatischer Neustart:
// Chrome beendet die Erkennung nach wenigen Sekunden Stille von selbst
// (`onend`), auch bei `continuous = true`. Vorher hörte das Diktat dann
// mitten im Satz einfach auf, ohne Hinweis. Deshalb wird hier so lange neu
// gestartet, bis der Nutzer selbst stoppt oder das Feld verschwindet.
//
// Hinweis: Die Web Speech API gibt es nur in Chrome/Edge/Safari und nur in
// einem sicheren Kontext (HTTPS oder localhost) — per Doppelklick über
// file:// meldet der Knopf das verständlich, statt stumm nichts zu tun.
// =========================================================
(function () {
    'use strict';

    const MIC_SVG = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>';
    const STOP_SVG = '<svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';

    let recognition = null;
    let activeTargetId = null;
    let baseText = '';        // alles, was bereits endgültig im Feld steht
    let manualStop = false;   // true = der Nutzer hat gestoppt, kein Neustart
    let startedAt = 0;        // Beginn der Aufnahme (für die Dauer-Anzeige)
    let tickTimer = null;     // Dauer-Anzeige
    let hardErrors = 0;       // Fehler, die keinen Neustart mehr rechtfertigen

    function el(id) { return id ? document.getElementById(id) : null; }

    // Feld noch da und sichtbar? Sonst wurde das Fenster geschlossen.
    function targetLebt(id) {
        const t = el(id);
        return !!(t && document.contains(t) && t.offsetParent !== null);
    }

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
        const felder = document.querySelectorAll(`[data-mic-status-for="${targetId}"]`);
        felder.forEach(s => {
            s.textContent = text || '';
            s.classList.toggle('error', !!isError);
        });
        // Knöpfe ohne eigene Statuszeile (z. B. die Notiz im Adressbuch) würden
        // Fehler sonst schlucken — dort wenigstens eine Meldung einblenden.
        if (!felder.length && isError && typeof window.showToast === 'function') {
            window.showToast(text);
        }
    }

    function setButtonState(targetId, listening) {
        // `data-target-id` ist der ältere runde Knopf im Adressbuch, der über
        // window.toggleVoiceDictation läuft (js/voice-dictation.js).
        const sel = `[data-mic-for="${targetId}"], .voice-mic-btn[data-target-id="${targetId}"]`;
        document.querySelectorAll(sel).forEach(btn => {
            btn.classList.toggle('listening', listening);
            // Der runde Knopf im Adressbuch nutzt die ältere Klasse.
            btn.classList.toggle('recording', listening);
            const icon = btn.querySelector('.mic-btn-icon');
            if (icon) icon.innerHTML = listening ? STOP_SVG : MIC_SVG;
            const label = btn.querySelector('.mic-btn-label');
            if (label) label.textContent = listening ? 'Aufnahme beenden' : 'Diktieren';
            btn.title = listening ? 'Aufnahme läuft — klicken zum Beenden' : 'Diktieren — Text wird direkt ins Feld geschrieben';
        });
    }

    function mmss(ms) {
        const s = Math.max(0, Math.floor(ms / 1000));
        return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
    }

    function startTicker(targetId) {
        stopTicker();
        startedAt = startedAt || Date.now();
        const zeigen = () => setStatus(targetId, `● Hört zu … ${mmss(Date.now() - startedAt)} — zum Beenden erneut klicken.`);
        zeigen();
        tickTimer = setInterval(zeigen, 1000);
    }

    function stopTicker() {
        if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
    }

    window.stopSpeechInput = function () {
        manualStop = true;
        stopTicker();
        if (recognition) {
            try { recognition.stop(); } catch (e) { /* schon beendet */ }
        }
    };

    // Baut einen frischen Recognizer und hängt die Ereignisse an. Wird auch
    // für jeden automatischen Neustart benutzt — einen gestoppten Recognizer
    // erneut zu starten ist in Chrome nicht zuverlässig.
    function starteErkennung(targetId) {
        const input = el(targetId);
        if (!input) return false;
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

        recognition = new SR();
        recognition.lang = 'de-DE';
        recognition.interimResults = true;
        recognition.continuous = true;
        recognition.maxAlternatives = 1;

        recognition.onstart = () => {
            setButtonState(targetId, true);
            startTicker(targetId);
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
            const art = e.error || 'unbekannt';
            // „no-speech" und „aborted" sind normal: einfach weiterhören.
            if (art === 'no-speech' || art === 'aborted') return;
            if (art === 'not-allowed' || art === 'service-not-allowed') {
                manualStop = true;
                stopTicker();
                setStatus(targetId, 'Zugriff auf das Mikrofon wurde abgelehnt. Bitte im Browser erlauben (Schloss-Symbol in der Adresszeile).', true);
                return;
            }
            if (art === 'audio-capture') {
                manualStop = true;
                stopTicker();
                setStatus(targetId, 'Kein Mikrofon gefunden. Bitte Gerät anschließen und Eingabegerät im Browser prüfen.', true);
                return;
            }
            // Netzwerk & Co.: zwei Versuche, dann aufgeben.
            hardErrors++;
            if (hardErrors >= 3) {
                manualStop = true;
                stopTicker();
                setStatus(targetId, 'Spracheingabe abgebrochen: ' + art, true);
            }
        };

        recognition.onend = () => {
            recognition = null;
            // Vom Nutzer beendet, Feld weg oder zu viele Fehler -> Schluss.
            if (manualStop || !targetLebt(targetId)) {
                stopTicker();
                setButtonState(targetId, false);
                const status = document.querySelector(`[data-mic-status-for="${targetId}"]`);
                if (status && !status.classList.contains('error')) setStatus(targetId, '');
                activeTargetId = null;
                startedAt = 0;
                return;
            }
            // Chrome hat wegen einer Sprechpause abgeschaltet — nahtlos weiter.
            // Was gerade als Zwischenergebnis im Feld steht, gilt jetzt als fest,
            // sonst ginge es beim nächsten Ergebnis verloren.
            baseText = el(targetId) ? el(targetId).value : baseText;
            if (baseText && !/\s$/.test(baseText)) baseText += ' ';
            setTimeout(() => {
                if (manualStop || !targetLebt(targetId)) return;
                try { starteErkennung(targetId); } catch (e) {
                    setStatus(targetId, 'Spracheingabe konnte nicht fortgesetzt werden.', true);
                    setButtonState(targetId, false);
                    activeTargetId = null;
                }
            }, 150);
        };

        recognition.start();
        return true;
    }

    window.startSpeechInput = function (targetId) {
        const input = el(targetId);
        if (!input) return;

        // Zweiter Klick beendet die laufende Aufnahme.
        if (activeTargetId === targetId && recognition) { window.stopSpeechInput(); return; }
        if (recognition) { window.stopSpeechInput(); }

        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) {
            setStatus(targetId, 'Spracheingabe gibt es in diesem Browser nicht (Chrome, Edge oder Safari nutzen).', true);
            return;
        }
        if (!window.isSecureContext && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
            setStatus(targetId, 'Das Mikrofon geht nur über HTTPS oder localhost — nicht beim Öffnen der Datei direkt.', true);
            return;
        }

        activeTargetId = targetId;
        manualStop = false;
        hardErrors = 0;
        startedAt = Date.now();
        // Bereits getippter Text bleibt stehen, Diktiertes wird angehängt.
        baseText = input.value ? input.value.replace(/\s+$/, '') + ' ' : '';

        try {
            starteErkennung(targetId);
        } catch (e) {
            setStatus(targetId, 'Mikrofon konnte nicht gestartet werden: ' + (e.message || e), true);
            recognition = null;
            activeTargetId = null;
            startedAt = 0;
        }
    };

    // Klick-Delegation: gilt auch für Knöpfe in später erzeugten Modals.
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-mic-for]');
        if (!btn) return;
        e.preventDefault();
        window.startSpeechInput(btn.getAttribute('data-mic-for'));
    });

    // Tippt der Nutzer während der Aufnahme selbst, gilt der Feldinhalt als
    // neuer Ausgangstext — sonst würde das nächste Erkennungsergebnis das
    // Getippte überschreiben.
    document.addEventListener('input', (e) => {
        if (!activeTargetId || !e.isTrusted) return;
        if (!e.target || e.target.id !== activeTargetId) return;
        baseText = e.target.value;
    });

    // Wird das Feld ausgeblendet (Modal zu) oder der Tab gewechselt, läuft
    // die Aufnahme nicht weiter.
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') window.stopSpeechInput();
    });
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) window.stopSpeechInput();
    });
})();
