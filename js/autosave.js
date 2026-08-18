// ==========================================
// AUTO-SPEICHERN (generisch)
// ==========================================
// Gemeinsamer Unterbau für Formulare, die während des Bearbeitens selbst
// speichern sollen — benutzt von js/addressbook-live.js (Adressen) und
// js/process-autosave.js (Vorgänge).
//
// Gespeichert wird an vier Stellen, das ist der ganze Zweck der Übung:
//   1) wenn ein Feld verlassen wird ('change'/'focusout')
//   2) wenn das Fenster geschlossen wird (auch nach „Abbrechen“)
//   3) beim Neuladen / Schließen der Seite ('pagehide'/'beforeunload')
//   4) wenn die App in den Hintergrund geht ('visibilitychange')
// Für 3) und 4) bricht der Browser jedes await ab, deshalb dort ein
// fetch(..., { keepalive: true }) direkt gegen die REST-Schnittstelle.
//
// Geschrieben werden immer nur die Spalten, die sich gegenüber dem zuletzt
// gespeicherten Stand geändert haben.
(function () {
    'use strict';

    // Kurz genug, dass ein Feldwechsel sofort wirkt, lang genug, dass eine
    // Gruppe Checkboxen in einem Rutsch rausgeht.
    const DEFAULT_DELAY = 250;

    function sameValue(a, b) {
        const na = a === undefined ? null : a;
        const nb = b === undefined ? null : b;
        if (na === nb) return true;
        // Arrays/Objekte (steps, assigned_users) über ihre JSON-Form vergleichen.
        if (na && nb && typeof na === 'object' && typeof nb === 'object') {
            try { return JSON.stringify(na) === JSON.stringify(nb); } catch (e) { return false; }
        }
        return false;
    }

    function timeNow() {
        return new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    }

    /**
     * cfg:
     *   table            Tabellenname in Supabase
     *   read()           liefert den aktuellen Formularstand als Objekt, oder
     *                    null, wenn gerade nichts Gültiges dasteht
     *   isOpen()         true, solange das zugehörige Formular sichtbar ist
     *   statusHost()     optional: Element, in das die Statuszeile gehängt wird
     *   statusClass      optional: CSS-Klasse der Statuszeile
     *   optionalColumns  optional: Spalten, die es in älteren Datenbanken noch
     *                    nicht gibt — sie fliegen bei Fehlermeldung raus
     *   onSaved(row)     optional: nach erfolgreichem Speichern
     *   delay            optional: Entprellung in ms
     */
    window.createAutosave = function (cfg) {
        const delay = cfg.delay || DEFAULT_DELAY;
        const dropped = new Set();

        let id = null;
        let last = null;
        let timer = null;
        let saving = false;
        let skipOnce = false;
        let statusEl = null;

        function setStatus(text, kind) {
            if (!cfg.statusHost) return;
            const host = cfg.statusHost();
            if (!host) return;
            if (!statusEl || !statusEl.isConnected || statusEl.parentElement !== host) {
                statusEl = document.createElement('span');
                statusEl.className = cfg.statusClass || 'autosave-status';
                host.insertBefore(statusEl, host.firstChild);
            }
            statusEl.textContent = text || '';
            statusEl.dataset.kind = kind || '';
        }

        // Nur die Felder, die sich gegenüber dem letzten Stand geändert haben.
        function changedFields(payload) {
            const diff = {};
            Object.keys(payload).forEach(k => {
                if (dropped.has(k)) return;
                if (!last || !sameValue(payload[k], last[k])) diff[k] = payload[k] === undefined ? null : payload[k];
            });
            return diff;
        }

        function pending() {
            if (!id) return null;
            const payload = cfg.read ? cfg.read() : null;
            if (!payload) return null;
            const diff = changedFields(payload);
            return Object.keys(diff).length ? { payload, diff } : null;
        }

        async function save(force) {
            if (!id || saving) return;
            if (!force && (!cfg.isOpen || !cfg.isOpen())) return;
            const job = pending();
            if (!job) return;

            saving = true;
            setStatus('Speichert …', 'busy');
            const currentId = id;
            try {
                let attempt = { ...job.diff };
                let error;
                // Fehlende Spalten (Migration noch nicht eingespielt) einzeln
                // aussortieren, statt den ganzen Schreibvorgang zu verlieren.
                for (let i = 0; i <= (cfg.optionalColumns || []).length; i++) {
                    const res = await window.supabaseClient.from(cfg.table).update(attempt).eq('id', currentId).select().maybeSingle();
                    error = res.error;
                    if (!error) {
                        last = job.payload;
                        if (cfg.onSaved) cfg.onSaved(res.data);
                        setStatus('Automatisch gespeichert · ' + timeNow(), 'ok');
                        return;
                    }
                    const msg = error.message || '';
                    const offending = (cfg.optionalColumns || []).filter(c => (c in attempt) && msg.includes(c));
                    if (!offending.length) break;
                    offending.forEach(c => { delete attempt[c]; dropped.add(c); });
                    if (!Object.keys(attempt).length) break;
                }
                if (error) throw error;
            } catch (err) {
                console.error('Auto-Speichern (' + cfg.table + ') fehlgeschlagen:', err);
                setStatus('Nicht gespeichert: ' + (err.message || err), 'error');
            } finally {
                saving = false;
            }
        }

        function schedule() {
            if (!id || !cfg.isOpen || !cfg.isOpen()) return;
            clearTimeout(timer);
            setStatus('Ungespeicherte Änderung …', 'busy');
            timer = setTimeout(() => save(false), delay);
        }

        // Notrettung: läuft auch dann noch zu Ende, wenn die Seite bereits
        // entladen wird — ein normales await käme dabei nicht mehr an.
        function flushOnUnload() {
            const job = pending();
            if (!job) return;
            const url = (typeof SUPABASE_URL !== 'undefined' && SUPABASE_URL) || '';
            const key = (typeof SUPABASE_ANON_KEY !== 'undefined' && SUPABASE_ANON_KEY) || '';
            if (!url || !key || typeof fetch !== 'function') return;
            try {
                fetch(url + '/rest/v1/' + cfg.table + '?id=eq.' + encodeURIComponent(id), {
                    method: 'PATCH',
                    keepalive: true,
                    headers: {
                        'apikey': key,
                        'Authorization': 'Bearer ' + key,
                        'Content-Type': 'application/json',
                        'Prefer': 'return=minimal'
                    },
                    body: JSON.stringify(job.diff)
                });
                last = job.payload;
            } catch (e) {
                console.warn('Notrettung (' + cfg.table + ') fehlgeschlagen:', e);
            }
        }

        const handle = {
            // Formular ist offen: ab jetzt wird mitgeschrieben.
            attach(newId, hint) {
                clearTimeout(timer);
                id = String(newId);
                last = cfg.read ? cfg.read() : null;
                skipOnce = false;
                setStatus(hint || 'Wird beim Verlassen eines Feldes automatisch gespeichert', '');
            },
            detach() {
                clearTimeout(timer);
                timer = null;
                id = null;
                last = null;
            },
            // Auf ein Element hängen, in dem die Felder liegen. Bewusst nicht
            // bei jedem Tastendruck ('input'), sondern beim Feldwechsel.
            wire(root) {
                if (!root || root.dataset.autosaveWired === '1') return;
                root.dataset.autosaveWired = '1';
                root.addEventListener('change', schedule);
                root.addEventListener('focusout', schedule);
            },
            schedule,
            // Beim Schließen: einmal alles wegschreiben, auch wenn das Formular
            // schon unsichtbar ist — die Werte stehen noch im DOM.
            async flush() {
                clearTimeout(timer);
                timer = null;
                if (skipOnce) { skipOnce = false; return; }
                await save(true);
            },
            // Nach einem regulären Speichern von außen: den Stand übernehmen,
            // damit nicht gleich noch einmal dasselbe geschrieben wird.
            markSaved() {
                last = cfg.read ? cfg.read() : last;
                skipOnce = true;
            },
            flushOnUnload,
            get id() { return id; }
        };

        window.addEventListener('pagehide', flushOnUnload);
        window.addEventListener('beforeunload', flushOnUnload);
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') flushOnUnload();
        });

        return handle;
    };

    console.log('Autosave engine loaded.');
})();
