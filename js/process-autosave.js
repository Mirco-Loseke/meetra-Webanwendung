// ==========================================
// VORGÄNGE: AUTO-SPEICHERN
// ==========================================
// Gleiche Logik wie bei den Adressen (js/addressbook-live.js), gebaut auf
// dem gemeinsamen Unterbau js/autosave.js: gespeichert wird beim Verlassen
// eines Feldes, beim Schließen des Fensters und beim Neuladen der Seite.
//
// Nur beim BEARBEITEN. Ein neuer Vorgang hat noch keine id, dort bleibt es
// beim Knopf. Der Knopf „Änderungen speichern“ bleibt ebenfalls — er lädt
// zusätzlich die Liste neu und meldet fehlende Datenbankspalten.
(function () {
    'use strict';

    const PREFIX = 'edit-process';

    function el(id) { return document.getElementById(id); }
    function v(id) { const e = el(id); return e ? e.value : ''; }

    function isOpen() {
        const modal = el('process-edit-modal');
        if (!modal || modal.classList.contains('hidden')) return false;
        const idField = el(PREFIX + '-id');
        return !!(idField && idField.value);
    }

    // Spiegelt window.updateProcess (js/processes.js). Wer dort ein Feld
    // ergänzt, muss es hier ebenfalls eintragen — sonst wird es zwar per
    // Knopf, aber nicht automatisch gespeichert.
    function read() {
        if (!isOpen()) return null;
        const title = v(PREFIX + '-title-input');
        // Ohne Titel nicht speichern: das ist ein Pflichtfeld, ein leerer
        // Titel wäre eine Verschlimmbesserung des vorhandenen Datensatzes.
        if (!title.trim()) return null;

        const date = v(PREFIX + '-date-input');
        const remindRaw = v(PREFIX + '-remind-input');
        const machineId = v(PREFIX + '-machine-select');
        const serviceReportId = v(PREFIX + '-service-report-select');

        return {
            title: title,
            process_type: v(PREFIX + '-type-select'),
            process_date: date ? new Date(date).toISOString() : null,
            sender: v(PREFIX + '-sender-input') || null,
            recipient: v(PREFIX + '-recipient-input') || null,
            machine_id: machineId ? parseInt(machineId) : null,
            workshop_order_number: v(PREFIX + '-workshop-order-select') || null,
            status: v(PREFIX + '-status-select'),
            remark: v(PREFIX + '-remark-input') || null,
            description: v(PREFIX + '-body-input') || null,
            assigned_users: (window.processAssignedUsers && window.processAssignedUsers[PREFIX]) || [],
            steps: ((window.processSteps && window.processSteps[PREFIX]) || []).filter(s => (s.text || '').trim()),
            linked_service_report_id: serviceReportId ? parseInt(serviceReportId) : null,
            remind_at: remindRaw ? new Date(remindRaw).toISOString() : null,
            customer_id: v(PREFIX + '-customer-id') || null, // UUID — kein parseInt
            contact_name: v(PREFIX + '-contact-name') || null
        };
    }

    // Statuszeile links neben „Abbrechen / Änderungen speichern“.
    function statusHost() {
        const form = el('process-edit-form');
        const submit = form && form.querySelector('button[type="submit"]');
        return submit ? submit.parentElement : null;
    }

    let autosave = null;

    document.addEventListener('DOMContentLoaded', function () {
        if (typeof window.createAutosave !== 'function') {
            console.warn('Vorgänge: Auto-Speichern nicht aktiv, js/autosave.js fehlt.');
            return;
        }

        autosave = window.createAutosave({
            table: 'internal_processes',
            read: read,
            isOpen: isOpen,
            statusHost: statusHost,
            statusClass: 'autosave-status',
            // Spalten aus späteren Migrationen — fehlt eine, fliegt sie raus,
            // statt den ganzen Schreibvorgang scheitern zu lassen.
            optionalColumns: ['remind_at', 'customer_id', 'contact_name', 'linked_service_report_id'],
            onSaved: function () {
                // Die Liste zieht über Realtime nach (internal_processes_live),
                // hier ist deshalb nichts weiter zu tun.
            }
        });
        window.processAutosave = autosave;

        // Öffnen: mitschreiben ab jetzt.
        const origOpen = window.openEditProcessModal;
        if (typeof origOpen === 'function') {
            window.openEditProcessModal = async function (id) {
                const res = await origOpen.apply(this, arguments);
                const form = el('process-edit-form');
                if (form && isOpen()) {
                    autosave.wire(form);
                    autosave.attach(el(PREFIX + '-id').value);
                }
                return res;
            };
        }

        // Schließen: einmal alles wegschreiben — auch nach „Abbrechen“, damit
        // Getipptes nicht verfällt. Ohne Änderung geht auch nichts raus.
        const origClose = window.closeEditProcessModal;
        if (typeof origClose === 'function') {
            window.closeEditProcessModal = function () {
                if (autosave && autosave.id) {
                    // Erst lesen, dann schließen: danach stehen die Werte zwar
                    // noch im DOM, aber isOpen() wäre bereits false.
                    autosave.flush().finally(() => autosave.detach());
                }
                return origClose.apply(this, arguments);
            };
        }

        // Regulär gespeichert: den Stand übernehmen, damit das anschließende
        // Schließen nicht dieselben Werte ein zweites Mal schreibt.
        const origUpdate = window.updateProcess;
        if (typeof origUpdate === 'function') {
            window.updateProcess = async function () {
                if (autosave) autosave.markSaved();
                return origUpdate.apply(this, arguments);
            };
        }

        wireAddModalGuard();
    });

    // ------------------------------------------
    // NEUER VORGANG: Rückfrage statt Auto-Speichern
    // ------------------------------------------
    // Hier gibt es noch keinen Datensatz, in den geschrieben werden könnte.
    // Also nachfragen, bevor die Eingabe verfällt.
    function wireAddModalGuard() {
        if (typeof window.createUnsavedGuard !== 'function') return;

        const guard = window.createUnsavedGuard({
            root: () => el('process-add-form'),
            overlayId: 'process-add-unsaved-overlay',
            isActive: () => {
                const m = el('process-add-modal');
                return !!(m && !m.classList.contains('hidden'));
            },
            submit: () => {
                const form = el('process-add-form');
                const btn = form && form.querySelector('button[type="submit"]');
                if (btn) btn.click();
            }
        });
        window.processAddGuard = guard;

        const origOpen = window.openProcessAddModal;
        if (typeof origOpen === 'function') {
            window.openProcessAddModal = function () {
                const res = origOpen.apply(this, arguments);
                guard.reset();
                return res;
            };
        }

        const origClose = window.closeProcessAddModal;
        if (typeof origClose === 'function') {
            window.closeProcessAddModal = function () {
                if (guard.confirmClose(() => window.closeProcessAddModal())) return;
                guard.markClean();
                return origClose.apply(this, arguments);
            };
        }

        const origSave = window.saveNewProcess;
        if (typeof origSave === 'function') {
            window.saveNewProcess = async function () {
                guard.markClean();
                return origSave.apply(this, arguments);
            };
        }
    }

    console.log('Vorgänge: Auto-Speichern geladen.');
})();
