/* ========================================================= */
/* ============= VOICE DICTATION MODULE ==================== */
/* ========================================================= */

(function() {
    'use strict';
    let recognition = null;
    let activeBtn = null;

    if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
        const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognition = new SpeechRec();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'de-DE';

        recognition.onresult = (e) => {
            if (!activeBtn) return;
            const targetId = activeBtn.getAttribute('data-target-id');
            const targetEl = document.getElementById(targetId);
            if (!targetEl) return;

            let finalTranscript = '';
            for (let i = e.resultIndex; i < e.results.length; ++i) {
                if (e.results[i].isFinal) {
                    finalTranscript += e.results[i][0].transcript;
                }
            }

            if (finalTranscript) {
                const existing = targetEl.value;
                const spacer = existing && !existing.endsWith(' ') ? ' ' : '';
                targetEl.value = existing + spacer + finalTranscript;
                targetEl.dispatchEvent(new Event('input', { bubbles: true }));
            }
        };

        recognition.onerror = (e) => {
            console.warn('Spracherkennung Fehler:', e.error);
            stopRecording();
        };

        recognition.onend = () => {
            stopRecording();
        };
    }

    function stopRecording() {
        if (activeBtn) {
            activeBtn.classList.remove('recording');
            activeBtn.title = 'Spracheingabe starten (Diktieren)';
            activeBtn = null;
        }
    }

    window.toggleVoiceDictation = function(btnOrId, event) {
        if (event) event.stopPropagation();
        const btn = typeof btnOrId === 'string' ? document.getElementById(btnOrId) : btnOrId;
        if (!btn) return;

        if (!recognition) {
            if (typeof window.showToast === 'function') {
                window.showToast('Ihr Browser unterstützt die eingebaute Spracherkennung nicht. Bitte nutzen Sie Google Chrome oder Microsoft Edge.');
            }
            return;
        }

        if (activeBtn === btn) {
            recognition.stop();
            stopRecording();
        } else {
            if (activeBtn) {
                recognition.stop();
                stopRecording();
            }
            activeBtn = btn;
            btn.classList.add('recording');
            btn.title = 'Aufnahme läuft… Klicken zum Stoppen';
            try {
                recognition.start();
            } catch(e) {
                console.warn('Speech recognition start failed:', e);
            }
        }
    };
})();
