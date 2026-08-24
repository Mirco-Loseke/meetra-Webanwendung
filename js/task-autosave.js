// ==========================================
// AUFGABEN: AUTO-SPEICHERN
// ==========================================
// Gleiche Bauart wie bei Adressen (js/addressbook-live.js) und Vorgängen
// (js/process-autosave.js), auf dem gemeinsamen Unterbau js/autosave.js.
//
//   • BEARBEITEN einer Aufgabe -> wird laufend selbst gespeichert. Beim
//     Schließen entfällt die Rückfrage, weil nichts mehr verfallen kann.
//   • NEUE Aufgabe -> es gibt noch keinen Datensatz, in den geschrieben werden
//     könnte. Dort bleibt es beim Speichern-Knopf, und beim Schließen wird
//     nachgefragt (window.showUnsavedDialog, schon in js/tasks.js verdrahtet).
//
// UNTERAUFGABEN sind der eigentliche Grund für dieses Modul: sie leben in der
// Tabelle `subtasks` und werden von window.getModalGroupsData()
// (js/task_templates.js) im Speicher gehalten. Änderungen daran — löschen,
// verschieben, Gruppe anlegen, Haken setzen — laufen komplett über JavaScript
// und lösen KEIN input/change am Formular aus. Der Merker „ungespeichert"
// blieb dadurch aus, und beim Schließen war die Arbeit still weg.
// Erkannt werden sie hier über einen MutationObserver auf
// #task-supergroups-list: jede Änderung endet in renderModalGroups(), das
// diesen Container neu aufbaut. Ein einziger Beobachtungspunkt statt einer
// Liste von Funktionen, die beim nächsten Umbau unvollständig wäre.
//
// Geschrieben werden Unteraufgaben weiterhin so wie im Speichern-Knopf:
// alle löschen, alle neu anlegen. Das passiert aber nur, wenn sich ihr Inhalt
// gegenüber dem zuletzt geschriebenen Stand tatsächlich unterscheidet —
// sonst würde bei jedem Feldwechsel die halbe Tabelle neu geschrieben.
(function () {
    'use strict';

    // Entprellung für die Unteraufgaben. Etwas länger als beim Formular:
    // beim Umsortieren per Drag & Drop fallen mehrere Änderungen hintereinander an.
    const SUBTASK_DELAY = 700;

    function el(id) { return document.getElementById(id); }
    function v(id) { const e = el(id); return e ? e.value : ''; }

    function isEditing() {
        const modal = el('task-modal');
        if (!modal || modal.classList.contains('hidden')) return false;
        return !!window.currentTaskId;
    }

    // Spiegelt window.saveTask (js/tasks.js) — ohne `status` (den ändert das
    // Formular gar nicht) und ohne `updated_at` (das wäre bei jedem Lesen neu
    // und würde deshalb dauernd einen Schreibvorgang auslösen).
    function read() {
        if (!isEditing()) return null;
        const title = v('task-title').trim();
        // Der Titel ist Pflichtfeld. Ein leerer Titel wäre eine
        // Verschlimmbesserung des vorhandenen Datensatzes.
        if (!title) return null;

        const payload = {
            title: title,
            description: v('task-description') || '',
            machine_id: v('task-machine') || null
        };

        // Werkstattauftragsnummer nur mitschreiben, wenn sie vollständig ist —
        // halb getippt ergäbe eine kaputte Nummer.
        const wrapper = el('task-workshop-order-wrapper');
        if (wrapper && wrapper.style.display !== 'none') {
            const yearDigit = v('task-workshop-year-digit').trim();
            const suffix = v('task-workshop-order-suffix').trim();
            if (yearDigit && suffix) {
                payload.workshop_order_number = `202${yearDigit}-40${suffix.padStart(3, '0')}`;
            }
        } else {
            payload.workshop_order_number = null;
        }

        return payload;
    }

    // Statuszeile links neben „Abbrechen / Speichern".
    function statusHost() {
        const modal = el('task-modal');
        return modal ? modal.querySelector('.modal-actions') : null;
    }

    // ------------------------------------------
    // UNTERAUFGABEN
    // ------------------------------------------
    // Vergleichsform: nur das, was auch in der Datenbank landet, in der
    // Reihenfolge der Gruppen. Damit erkennen wir echte Änderungen und
    // ignorieren Nebensachen wie „Gruppe zugeklappt".
    function subtaskFingerprint() {
        if (typeof window.getModalGroupsData !== 'function') return null;
        const groups = window.getModalGroupsData() || [];
        const flat = [];
        groups.forEach(g => {
            if (!g || !Array.isArray(g.subtasks)) return;
            g.subtasks.forEach(st => {
                if (!st || !(st.title || '').trim()) return;
                flat.push({
                    title: st.title,
                    status: st.status || 'open',
                    supergroup: g.name,
                    action_type: st.action_type || null
                });
            });
        });
        return flat;
    }

    let lastSubtaskJson = null;
    let subtaskTimer = null;
    let subtaskSaving = false;

    // Beim Öffnen baut fillModal/resetModal die Gruppenliste einmal komplett
    // auf. Das ist keine Änderung des Benutzers — würde den Beobachter unten
    // aber auslösen und ein frisch geöffnetes Fenster als „ungespeichert"
    // markieren. Deshalb kurz taub stellen.
    let quietUntil = 0;
    function isQuiet() { return Date.now() < quietUntil; }
    function beQuiet() { quietUntil = Date.now() + 800; }

    // taskId wird beim Schließen ausdrücklich übergeben: window.currentTaskId
    // ist dann schon geleert, die Unteraufgaben müssen aber noch raus.
    async function saveSubtasks(force, explicitId) {
        if (subtaskSaving) return;
        const taskId = explicitId || window.currentTaskId;
        if (!taskId) return;
        if (!force && !isEditing()) return;

        const flat = subtaskFingerprint();
        if (flat === null) return;
        const json = JSON.stringify(flat);
        if (json === lastSubtaskJson) return;

        subtaskSaving = true;
        try {
            await window.supabaseClient.from('subtasks').delete().eq('task_id', taskId);
            if (flat.length) {
                const rows = flat.map(s => ({ ...s, task_id: taskId }));
                const { error } = await window.supabaseClient.from('subtasks').insert(rows);
                if (error) throw error;
            }
            lastSubtaskJson = json;
            if (typeof window.fetchTasks === 'function') window.fetchTasks();
        } catch (err) {
            console.error('Auto-Speichern (subtasks) fehlgeschlagen:', err);
            window.showToast('Unteraufgaben nicht gespeichert: ' + (err.message || err), 'error');
        } finally {
            subtaskSaving = false;
        }
    }

    function scheduleSubtasks() {
        if (!isEditing()) return;
        clearTimeout(subtaskTimer);
        subtaskTimer = setTimeout(() => saveSubtasks(false), SUBTASK_DELAY);
    }

    // ------------------------------------------
    // VERDRAHTUNG
    // ------------------------------------------
    let autosave = null;

    document.addEventListener('DOMContentLoaded', function () {
        if (typeof window.createAutosave !== 'function') {
            console.warn('Aufgaben: Auto-Speichern nicht aktiv, js/autosave.js fehlt.');
            return;
        }

        autosave = window.createAutosave({
            table: 'tasks',
            read: read,
            isOpen: isEditing,
            statusHost: statusHost,
            statusClass: 'autosave-status',
            onSaved: function () {
                // Liste erst nach dem Schließen neu aufbauen — ein Neuaufbau
                // mitten im Tippen würde das offene Fenster überrumpeln.
            }
        });
        window.taskAutosave = autosave;

        // Änderungen an den Unteraufgaben erkennen. renderModalGroups() baut
        // diesen Container bei jeder Änderung neu auf.
        const list = el('task-supergroups-list');
        if (list && typeof MutationObserver === 'function') {
            new MutationObserver(() => {
                const modal = el('task-modal');
                if (!modal || modal.classList.contains('hidden')) return;
                if (isQuiet()) return;
                if (isEditing()) {
                    scheduleSubtasks();
                } else if (typeof window.markTaskDirty === 'function') {
                    // Neue Aufgabe: nichts zu speichern, aber die Rückfrage
                    // beim Schließen muss greifen.
                    window.markTaskDirty();
                }
            }).observe(list, { childList: true, subtree: true });
        }

        // Öffnen: ab jetzt mitschreiben.
        const origOpen = window.openTaskModal;
        if (typeof origOpen === 'function') {
            window.openTaskModal = async function () {
                beQuiet();
                const res = await origOpen.apply(this, arguments);
                beQuiet();
                clearTimeout(subtaskTimer);
                lastSubtaskJson = JSON.stringify(subtaskFingerprint() || []);
                if (isEditing()) {
                    const modal = el('task-modal');
                    if (modal) autosave.wire(modal);
                    autosave.attach(window.currentTaskId);
                }
                return res;
            };
        }

        // „Neue Aufgabe" ruft intern die Originalfassung auf, läuft also nicht
        // durch den Umbau oben. Hier reicht das Taubstellen beim Aufbau.
        const origAdd = window.openAddTaskModal;
        if (typeof origAdd === 'function') {
            window.openAddTaskModal = function () {
                beQuiet();
                const res = origAdd.apply(this, arguments);
                beQuiet();
                return res;
            };
        }

        // Schließen: einmal alles wegschreiben — auch nach „Abbrechen", damit
        // Getipptes nicht verfällt. Ohne Änderung geht auch nichts raus.
        // Beim Bearbeiten entfällt dadurch die Rückfrage.
        const origClose = window.closeTaskModal;
        if (typeof origClose === 'function') {
            window.closeTaskModal = function (force) {
                if (isEditing() && autosave && autosave.id) {
                    const id = window.currentTaskId;
                    clearTimeout(subtaskTimer);
                    // flush() liest das Formular noch synchron aus, bevor der
                    // erste await kommt — deshalb hier starten, solange das
                    // Fenster offen ist. Danach wäre isEditing() bereits false.
                    Promise.resolve(autosave.flush())
                        .then(() => saveSubtasks(true, id))
                        .finally(() => {
                            autosave.detach();
                            if (typeof window.fetchTasks === 'function') window.fetchTasks();
                        });
                    if (typeof window.markTaskClean === 'function') window.markTaskClean();
                    return origClose.call(this, true);
                }
                return origClose.apply(this, arguments);
            };
        }

        // Regulär über den Knopf gespeichert: den Stand übernehmen, damit
        // anschließend nicht dieselben Werte ein zweites Mal geschrieben werden.
        const origSave = window.saveTask;
        if (typeof origSave === 'function') {
            window.saveTask = async function () {
                if (autosave) autosave.markSaved();
                clearTimeout(subtaskTimer);
                lastSubtaskJson = JSON.stringify(subtaskFingerprint() || []);
                return origSave.apply(this, arguments);
            };
        }
    });

    console.log('Aufgaben: Auto-Speichern geladen.');
})();
