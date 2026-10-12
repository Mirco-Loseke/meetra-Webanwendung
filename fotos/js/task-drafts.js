// ==========================================================
// AUFGABEN: ENTWUERFE UEBERLEBEN NEULADEN UND WEGKLICKEN
// ==========================================================
// Ergaenzung zu js/task-autosave.js. Dort wird nur eine BESTEHENDE Aufgabe
// laufend in die Datenbank geschrieben — beim Anlegen gibt es noch keinen
// Datensatz, in den geschrieben werden koennte. Getippter Text war deshalb weg,
// sobald die Seite neu geladen oder das Fenster geschlossen wurde.
//
// Hier wird stattdessen lokal zwischengespeichert (localStorage), sofort beim
// Tippen. Zwei Stellen auf der Aufgaben-Seite:
//
//   • Werkstatt-Liste (#workshop-add-input): halb getippte Zeile ohne Enter.
//   • Fenster „Neue Aufgabe": alle Felder plus die Unteraufgaben-Gruppen.
//
// Wiederhergestellt wird beim naechsten Oeffnen bzw. beim Laden der Seite.
// Geloescht wird der Entwurf, wenn die Aufgabe gespeichert wurde, wenn der
// Nutzer im Ungespeichert-Dialog bewusst verwirft, und wenn nichts mehr drin
// steht. localStorage ist bewusst gewaehlt: es ueberlebt auch den Absturz des
// Browsers und braucht keine Verbindung.
(function () {
    'use strict';

    const K_WORKSHOP = 'meetra_draft_workshop';
    const K_TASK = 'meetra_draft_newtask';

    function el(id) { return document.getElementById(id); }
    function v(id) { const e = el(id); return e ? e.value : ''; }

    function read(key) {
        try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; }
        catch (e) { return null; }
    }
    function write(key, data) {
        try { localStorage.setItem(key, JSON.stringify(data)); } catch (e) { /* voll oder gesperrt */ }
    }
    function drop(key) {
        try { localStorage.removeItem(key); } catch (e) { /* egal */ }
    }

    // ------------------------------------------------------
    // 1) Werkstatt-Liste
    // ------------------------------------------------------
    function initWorkshopDraft() {
        const input = el('workshop-add-input');
        const form = el('workshop-add-form');
        if (!input) return;

        const saved = read(K_WORKSHOP);
        if (saved && saved.text && !input.value) input.value = saved.text;

        input.addEventListener('input', () => {
            const t = input.value;
            if (t.trim()) write(K_WORKSHOP, { text: t }); else drop(K_WORKSHOP);
        });

        // Der Submit-Handler in js/workshop-tasks.js leert das Feld selbst —
        // hier nur den Entwurf mit wegraeumen. Reihenfolge ist gleichgueltig.
        if (form) form.addEventListener('submit', () => drop(K_WORKSHOP));
    }

    // ------------------------------------------------------
    // 2) Fenster „Neue Aufgabe"
    // ------------------------------------------------------
    function newTaskModalOpen() {
        const modal = el('task-modal');
        if (!modal || modal.classList.contains('hidden')) return false;
        return !window.currentTaskId; // bestehende Aufgaben laufen ueber task-autosave.js
    }

    function collect() {
        const wrapper = el('task-workshop-order-wrapper');
        const workshopOn = !!(wrapper && wrapper.style.display !== 'none');

        const subtasks = [];
        if (typeof window.getModalGroupsData === 'function') {
            (window.getModalGroupsData() || []).forEach(g => {
                (g.subtasks || []).forEach(st => {
                    if (!st || !st.title) return;
                    subtasks.push({
                        title: st.title,
                        status: st.status || 'open',
                        supergroup: g.name,
                        action_type: st.action_type || null
                    });
                });
            });
        }

        return {
            title: v('task-title'),
            description: v('task-description'),
            machine_id: v('task-machine'),
            machine_label: v('task-machine-search'),
            workshop_on: workshopOn,
            workshop_year: v('task-workshop-year-digit'),
            workshop_suffix: v('task-workshop-order-suffix'),
            assigned: Array.isArray(window.tempAssigned) ? window.tempAssigned.slice() : [],
            subtasks: subtasks,
            saved_at: Date.now()
        };
    }

    function isEmpty(d) {
        return !String(d.title || '').trim() &&
               !String(d.description || '').trim() &&
               !d.machine_id && !d.workshop_on &&
               !d.subtasks.length && !d.assigned.length;
    }

    let saveTimer = null;
    function scheduleSave() {
        if (!newTaskModalOpen()) return;
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            if (!newTaskModalOpen()) return;
            const d = collect();
            if (isEmpty(d)) drop(K_TASK); else write(K_TASK, d);
        }, 300);
    }

    function restore() {
        const d = read(K_TASK);
        if (!d) return false;

        const title = el('task-title');
        const desc = el('task-description');
        if (title) title.value = d.title || '';
        if (desc) {
            desc.value = d.description || '';
            desc.style.height = 'auto';
            desc.style.height = desc.scrollHeight + 'px';
        }

        // Werkstattauftrag statt Maschine: der Modus schaltet das Feld frei.
        if (d.workshop_on && typeof window.selectWorkshopOrderMode === 'function') {
            window.selectWorkshopOrderMode();
            const yearEl = el('task-workshop-year-digit');
            const sufEl = el('task-workshop-order-suffix');
            if (yearEl) yearEl.value = d.workshop_year || '';
            if (sufEl) sufEl.value = d.workshop_suffix || '';
        } else if (d.machine_id && typeof window.selectMachine === 'function') {
            window.selectMachine(d.machine_id, d.machine_label || '');
        }

        // Unteraufgaben: setupNewTaskGroups nimmt genau diese Form entgegen
        // (title/status/supergroup/action_type) und baut die Gruppen daraus neu.
        // Muss NACH selectMachine laufen — das ruft setupNewTaskGroups() leer auf.
        if (Array.isArray(d.subtasks) && d.subtasks.length &&
            typeof window.setupNewTaskGroups === 'function') {
            window.setupNewTaskGroups(d.subtasks);
        }

        if (Array.isArray(d.assigned) && d.assigned.length) {
            window.tempAssigned = d.assigned.slice();
            if (typeof window.renderAssignedUsers === 'function') {
                window.renderAssignedUsers(window.tempAssigned);
            }
        }

        const details = el('task-details-section');
        if (details && (d.machine_id || d.workshop_on || (d.subtasks || []).length)) {
            details.style.display = 'block';
        }

        return true;
    }

    function bindModal() {
        const modal = el('task-modal');
        if (!modal) return;

        modal.addEventListener('input', scheduleSave);
        modal.addEventListener('change', scheduleSave);

        // Unteraufgaben werden per JavaScript umgebaut und loesen kein input aus —
        // gleiche Erkennung wie in js/task-autosave.js.
        const list = el('task-supergroups-list');
        if (list && window.MutationObserver) {
            new MutationObserver(scheduleSave).observe(list, { childList: true, subtree: true });
        }

        // Oeffnen: nach dem Original den Entwurf einspielen.
        const origOpen = window.openTaskModal;
        if (typeof origOpen === 'function') {
            window.openTaskModal = async function (taskId) {
                const res = await origOpen.call(this, taskId || null);
                if (!taskId && !window.currentTaskId && read(K_TASK)) {
                    if (restore() && window.showToast) {
                        window.showToast('Nicht gespeicherter Entwurf wiederhergestellt.');
                    }
                }
                return res;
            };
        }

        // Gespeichert: Entwurf wegraeumen. Erfolg erkennt man daran, dass
        // saveTask am Ende closeTaskModal(true) ruft und 'active' entfernt.
        const origSave = window.saveTask;
        if (typeof origSave === 'function') {
            window.saveTask = async function () {
                const res = await origSave.apply(this, arguments);
                if (!modal.classList.contains('active')) drop(K_TASK);
                return res;
            };
        }

        // Bewusstes Verwerfen im Ungespeichert-Dialog: dann soll der Entwurf
        // auch wirklich weg sein, sonst kaeme er beim naechsten Oeffnen zurueck.
        const origDialog = window.showUnsavedDialog;
        if (typeof origDialog === 'function') {
            window.showUnsavedDialog = function (opts) {
                if (opts && opts.overlayId === 'task-confirm-close-overlay') {
                    const inner = opts.onDiscard;
                    opts = Object.assign({}, opts, {
                        onDiscard: function () { drop(K_TASK); if (inner) inner(); }
                    });
                }
                return origDialog.call(this, opts);
            };
        }
    }

    document.addEventListener('DOMContentLoaded', function () {
        initWorkshopDraft();
        bindModal();
    });
})();
