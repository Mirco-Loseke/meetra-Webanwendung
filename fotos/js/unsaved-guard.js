// ==========================================
// SCHUTZ VOR VERLORENEN EINGABEN (Neu-Anlegen)
// ==========================================
// Beim BEARBEITEN speichert die App inzwischen selbst (js/autosave.js).
// Beim ANLEGEN geht das nicht — es gibt noch keinen Datensatz, in den
// geschrieben werden könnte. Dort muss deshalb nachgefragt werden, bevor
// etwas verfällt:
//   • Fenster schließen (X, Abbrechen, Klick daneben) -> Rückfrage
//   • Seite neu laden / Tab schließen -> Browser-Rückfrage
//
// Beides ist schon da: window.showUnsavedDialog und window.registerUnsavedCheck
// aus js/app-core.js (der Servicebericht nutzt sie seit jeher). Dieses Modul
// hängt dieselbe Mechanik an die übrigen Anlegen-Fenster.
(function () {
    'use strict';

    /**
     * cfg:
     *   root()      Element mit den Feldern (Formular). Wird bei jeder Eingabe
     *               als „schmutzig“ markiert.
     *   overlayId   eindeutige ID für den Rückfrage-Dialog
     *   submit()    speichert (in der Regel: den Speichern-Knopf auslösen)
     *   isActive()  optional: false = Wächter aus (z. B. weil für dieses
     *               Fenster gerade das Auto-Speichern zuständig ist)
     */
    window.createUnsavedGuard = function (cfg) {
        let dirty = false;

        function onEdit() { dirty = true; }

        const guard = {
            // Fenster frisch geöffnet: Zähler auf null.
            reset() {
                dirty = false;
                const root = cfg.root && cfg.root();
                if (root && root.dataset.unsavedWired !== '1') {
                    root.dataset.unsavedWired = '1';
                    root.addEventListener('input', onEdit);
                    root.addEventListener('change', onEdit);
                }
            },
            // Gespeichert (oder bewusst verworfen): nichts mehr zu schützen.
            markClean() { dirty = false; },
            isDirty() {
                if (cfg.isActive && !cfg.isActive()) return false;
                return dirty;
            },
            /**
             * Vor dem Schließen aufrufen. Liefert true, wenn nachgefragt wurde
             * — der Aufrufer bricht dann ab und überlässt dem Dialog das Feld.
             * Liefert false, wenn nichts zu retten ist und geschlossen werden darf.
             */
            confirmClose(proceed) {
                if (!guard.isDirty() || typeof window.showUnsavedDialog !== 'function') return false;
                window.showUnsavedDialog({
                    overlayId: cfg.overlayId,
                    onDiscard: () => { dirty = false; proceed(); },
                    onSave: () => { if (cfg.submit) cfg.submit(); }
                });
                return true;
            }
        };

        // Neuladen / Tab schließen: die Rückfrage stellt der Browser, den Text
        // bestimmt er selbst — wir melden nur, dass es etwas zu verlieren gibt.
        if (typeof window.registerUnsavedCheck === 'function') {
            window.registerUnsavedCheck(() => guard.isDirty());
        }

        return guard;
    };

    console.log('Unsaved guard loaded.');
})();
