/* =========================================================
   VOICE DICTATION — nur noch ein Adapter
   =========================================================
   Hier lief früher eine ZWEITE, eigenständige Web-Speech-Anbindung neben
   js/speech-input.js. Zwei Recognizer im selben Dokument vertragen sich
   nicht: startet der eine, während der andere läuft, wirft Chrome ab und
   das Diktat brach ohne Meldung ab. Ausserdem fehlten hier der
   automatische Neustart nach einer Sprechpause und die Fehlermeldungen.

   Deshalb reicht dieser Knopf jetzt nur noch an window.startSpeechInput
   durch. Das Markup (`class="voice-mic-btn" data-target-id="…"
   onclick="window.toggleVoiceDictation(this, event)"`) bleibt unverändert
   gültig — speech-input.js erkennt diesen Knopf an `.voice-mic-btn` mit
   `data-target-id` und zeichnet seinen Zustand (Aufnahme läuft) mit.
   `data-mic-for` darf hier NICHT gesetzt werden: dann würde zusätzlich die
   Klick-Delegation in speech-input.js feuern und die gerade gestartete
   Aufnahme sofort wieder beenden.

   Für neue Knöpfe stattdessen window.micButtonHtml('<feld-id>') nutzen.
   ========================================================= */
(function () {
    'use strict';

    window.toggleVoiceDictation = function (btnOrId, event) {
        if (event) event.stopPropagation();
        const btn = typeof btnOrId === 'string' ? document.getElementById(btnOrId) : btnOrId;
        if (!btn) return;

        const targetId = btn.getAttribute('data-target-id') || btn.getAttribute('data-mic-for');
        if (!targetId) return;

        if (typeof window.startSpeechInput !== 'function') {
            if (typeof window.showToast === 'function') {
                window.showToast('Spracheingabe steht gerade nicht zur Verfügung.');
            }
            return;
        }
        window.startSpeechInput(targetId);
    };
})();
