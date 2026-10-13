// ==========================================
// VORGÄNGE: NICHTS GEHT VERLOREN
// ==========================================
// Ergänzt js/process-autosave.js (Felder im Bearbeiten-Fenster) um alles,
// was dort nicht erfasst war:
//  - Stand-Felder (Fenster „Aktueller Stand“ und Stand im Bearbeiten-Fenster):
//    jeder Tastendruck liegt sofort als Entwurf in localStorage (überlebt
//    Absturz/Neuladen, wird beim nächsten Öffnen wieder eingesetzt). Beim
//    Schließen, Abbrechen oder Wegwechseln vom Tab wird der Text als Stand
//    eingetragen.
//  - Fenster „Schritte“: speichert 1,2 s nach jeder Änderung selbst, beim
//    Schließen/Abbrechen sofort — der Knopf SPEICHERN ist nur noch Abschluss.
//  - Bearbeiten-Fenster: Tippen, Schritte ziehen/löschen, Menüs (Zuständig,
//    Erinnerung) lösen das Auto-Speichern aus, nicht erst das Verlassen.
// Muss nach processes-ui.js, process-autosave.js und process-open-hints.js
// geladen werden (umhüllt deren window-Funktionen).
(function () {
    'use strict';

    const KEY = 'meetra_vorgang_entwurf';
    const STAND_MODAL = 'status-update-text';
    const STAND_EDIT = 'edit-process-status-text';

    function el(id) { return document.getElementById(id); }
    function offen(id) {
        const m = el(id);
        return !!(m && !m.classList.contains('hidden') && m.style.display !== 'none');
    }

    // ---------- Entwürfe (localStorage) ----------
    function lesen() { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } }
    function schreiben(o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) { /* voll/gesperrt */ } }
    function entwurfSetzen(feld, pid, text) {
        if (!pid) return;
        const o = lesen();
        const k = feld + '|' + pid;
        if (text && text.trim()) o[k] = { text: text, at: Date.now() };
        else delete o[k];
        schreiben(o);
    }
    function entwurfHolen(feld, pid) {
        const e = pid ? lesen()[feld + '|' + pid] : null;
        return (e && e.text) || '';
    }

    function standPid(feld) {
        if (feld === STAND_EDIT) { const f = el('edit-process-id'); return (f && f.value) || window.statusUpdateProcessId; }
        return window.statusUpdateProcessId;
    }
    function standMerken(feld) {
        const ta = el(feld);
        if (ta) entwurfSetzen(feld, standPid(feld), ta.value);
    }
    function standEinsetzen(feld) {
        const ta = el(feld);
        if (!ta || ta.value.trim()) return;
        const t = entwurfHolen(feld, standPid(feld));
        if (!t) return;
        ta.value = t;
        if (window.showToast) window.showToast('Nicht eingetragener Stand wiederhergestellt — wird beim Schließen gespeichert.');
    }

    // ---------- Schritte-Fenster: selbst speichern ----------
    let schritteZuletzt = null;
    let schritteTimer = null;
    let schritteLaeuft = null;

    function schritteJetzt() {
        const id = window.stepsModalProcessId;
        if (!id || !window.processSteps) return Promise.resolve();
        const steps = (window.processSteps['steps-modal'] || []).filter(s => (s.text || '').trim());
        const json = JSON.stringify(steps);
        if (json === schritteZuletzt) return Promise.resolve();
        const vorher = schritteLaeuft || Promise.resolve();
        schritteLaeuft = vorher.then(async () => {
            const { error } = await window.supabaseClient.from('internal_processes').update({ steps: steps }).eq('id', id);
            if (error) throw error;
            schritteZuletzt = json;
            const proc = ((window.eventsState && window.eventsState.processes) || []).find(p => String(p.id) === String(id));
            if (proc) proc.steps = JSON.parse(json);
        }).catch(e => {
            console.error('Schritte automatisch speichern:', e);
            if (window.showToast) window.showToast('Schritte nicht gespeichert: ' + (e.message || e));
        });
        return schritteLaeuft;
    }
    function schritteBald() {
        if (!offen('process-steps-modal')) return;
        clearTimeout(schritteTimer);
        schritteTimer = setTimeout(schritteJetzt, 1200);
    }

    // ---------- Einhängen ----------
    document.addEventListener('DOMContentLoaded', function () {
        // Jeder Tastendruck in einem Stand-Feld → Entwurf.
        document.addEventListener('input', function (e) {
            const id = e.target && e.target.id;
            if (id === STAND_MODAL || id === STAND_EDIT) standMerken(id);
            if (e.target.closest && e.target.closest('#process-steps-modal')) schritteBald();
            if (e.target.closest && e.target.closest('#process-edit-modal') && window.processAutosaveSchedule) window.processAutosaveSchedule();
        }, true);
        // Diktieren schreibt per value= und löst kein input aus → nachfassen.
        setInterval(function () {
            if (offen('process-status-update-modal')) standMerken(STAND_MODAL);
            if (offen('process-edit-modal')) standMerken(STAND_EDIT);
        }, 1500);

        // Schrittlisten werden bei jeder Änderung (Haken, Ziehen, Löschen,
        // Zuständig, Erinnerung) neu gezeichnet → daran erkennen.
        [['steps-modal-steps-list', schritteBald],
         ['edit-process-steps-list', () => window.processAutosaveSchedule && window.processAutosaveSchedule()]]
            .forEach(([id, fn]) => {
                const box = el(id);
                if (box) new MutationObserver(fn).observe(box, { childList: true, subtree: true, attributes: true, attributeFilter: ['checked', 'class'] });
            });

        // --- Fenster „Aktueller Stand“ ---
        let standSpeichert = false;
        const origStandSave = window.saveProcessStatusUpdate;
        if (typeof origStandSave === 'function') {
            window.saveProcessStatusUpdate = async function () {
                standSpeichert = true;
                try { return await origStandSave.apply(this, arguments); }
                finally { standSpeichert = false; }
            };
        }
        const origStandClose = window.closeProcessStatusUpdateModal;
        if (typeof origStandClose === 'function') {
            window.closeProcessStatusUpdateModal = function () {
                const ta = el(STAND_MODAL);
                const pid = window.statusUpdateProcessId;
                if (standSpeichert || !ta || !ta.value.trim()) {
                    // Erfolgreich eingetragen (oder leer) → Entwurf weg.
                    entwurfSetzen(STAND_MODAL, pid, '');
                    return origStandClose.apply(this, arguments);
                }
                // Abbrechen/X mit Text → eintragen statt verwerfen. Bei Fehler
                // bleibt das Fenster offen und der Entwurf erhalten.
                return window.saveProcessStatusUpdate();
            };
        }
        const origStandOpen = window.openProcessStatusUpdateModal;
        if (typeof origStandOpen === 'function') {
            window.openProcessStatusUpdateModal = async function () {
                const res = await origStandOpen.apply(this, arguments);
                standEinsetzen(STAND_MODAL);
                return res;
            };
        }

        // --- Stand im Bearbeiten-Fenster ---
        const origEditAdd = window.addProcessStatusFromEdit;
        if (typeof origEditAdd === 'function') {
            window.addProcessStatusFromEdit = async function () {
                const pid = standPid(STAND_EDIT);
                const res = await origEditAdd.apply(this, arguments);
                const ta = el(STAND_EDIT);
                if (ta && !ta.value.trim()) entwurfSetzen(STAND_EDIT, pid, '');
                return res;
            };
        }
        const origEditOpen = window.openEditProcessModal;
        if (typeof origEditOpen === 'function') {
            window.openEditProcessModal = async function () {
                const res = await origEditOpen.apply(this, arguments);
                standEinsetzen(STAND_EDIT);
                return res;
            };
        }
        const origEditClose = window.closeEditProcessModal;
        if (typeof origEditClose === 'function') {
            window.closeEditProcessModal = function () {
                const ta = el(STAND_EDIT);
                // addProcessStatusFromEdit liest Text und Vorgang sofort,
                // deshalb darf das Fenster gleich danach zugehen.
                if (ta && ta.value.trim()) window.addProcessStatusFromEdit();
                return origEditClose.apply(this, arguments);
            };
        }

        // --- Schritte-Fenster ---
        const origStepsOpen = window.openProcessStepsModal;
        if (typeof origStepsOpen === 'function') {
            window.openProcessStepsModal = function () {
                const res = origStepsOpen.apply(this, arguments);
                schritteZuletzt = JSON.stringify(((window.processSteps && window.processSteps['steps-modal']) || []).filter(s => (s.text || '').trim()));
                return res;
            };
        }
        const origStepsClose = window.closeProcessStepsModal;
        if (typeof origStepsClose === 'function') {
            window.closeProcessStepsModal = function () {
                clearTimeout(schritteTimer);
                if (window.stepsModalProcessId) {
                    schritteJetzt().then(() => { if (typeof window.renderProcesses === 'function') window.renderProcesses(); });
                }
                return origStepsClose.apply(this, arguments);
            };
        }

        // --- Tab weg / Handy gesperrt / Seite zu ---
        function wegsichern() {
            if (offen('process-steps-modal')) { clearTimeout(schritteTimer); schritteJetzt(); }
            if (offen('process-status-update-modal')) standMerken(STAND_MODAL);
            if (offen('process-edit-modal')) standMerken(STAND_EDIT);
        }
        document.addEventListener('visibilitychange', function () { if (document.hidden) wegsichern(); });
        window.addEventListener('pagehide', wegsichern);
    });
})();
