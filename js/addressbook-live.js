// ==========================================
// ADRESSBUCH: AUTO-SPEICHERN + LIVE-UPDATE
// ==========================================
// Zwei Dinge, ein Thema — "Adressen live halten":
//   1) Auto-Speichern: das Bearbeiten-Formular schreibt selbst — sobald ein
//      Feld verlassen wird, beim Schließen und beim Neuladen/Verlassen der
//      Seite. Immer nur die geänderten Spalten. Der Speichern-Knopf bleibt,
//      er macht zusätzlich den Cluster-Sync und den Historieneintrag.
//   2) Live-Update: Änderungen anderer Clients an customers /
//      customer_contacts / customer_notes kommen per Supabase Realtime an
//      und werden in Liste und offener Detailansicht nachgezogen.
// Interna kommen über window.abInternals aus js/addressbook.js.
(function () {
    'use strict';

    // Kurz genug, dass ein Feldwechsel sofort wirkt, lang genug, dass eine
    // Gruppe Checkboxen (Adresstyp, Hersteller) in einem Rutsch rausgeht.
    const AUTOSAVE_DELAY = 250;
    const ECHO_WINDOW = 2500;        // ms, in denen eigene Schreibvorgänge ignoriert werden

    function api() { return window.abInternals || null; }
    function st() { const a = api(); return a ? a.state : null; }

    // ------------------------------------------
    // AUTO-SPEICHERN (Unterbau: js/autosave.js)
    // ------------------------------------------
    // Zeitstempel der eigenen Schreibvorgänge je Adress-ID — verhindert, dass
    // das zurückkommende Realtime-Echo die gerade getippten Daten neu rendert.
    const ownWrites = new Map();

    function markOwnWrite(id) { if (id) ownWrites.set(String(id), Date.now()); }
    function isOwnEcho(id) {
        const t = ownWrites.get(String(id));
        return !!t && (Date.now() - t) < ECHO_WINDOW;
    }

    let autosave = null;
    let closeObserved = false;

    function ensureAutosave() {
        if (autosave) return autosave;
        if (typeof window.createAutosave !== 'function') {
            console.warn('Adressen: Auto-Speichern nicht aktiv, js/autosave.js fehlt.');
            return null;
        }
        autosave = window.createAutosave({
            table: 'customers',
            delay: AUTOSAVE_DELAY,
            statusClass: 'ab-autosave-status',
            statusHost: () => document.querySelector('#addressbook-form .ab-form-actions'),
            // Dasselbe Modal wird auch für Ansprechpartner, Notizen usw.
            // benutzt — deshalb zusätzlich auf ein Adressfeld prüfen.
            isOpen: () => {
                const m = document.getElementById('addressbook-form-modal');
                return !!(m && m.classList.contains('show') && document.getElementById('ab-f-name'));
            },
            read: () => {
                const a = api();
                if (!a || !document.getElementById('ab-f-name')) return null;
                const payload = a.buildAddressPayload();
                // Ohne Namen nicht speichern — Pflichtfeld.
                if (!payload.name || !payload.name.trim()) return null;
                return payload;
            },
            onSaved: (row) => {
                const a = api();
                markOwnWrite(row ? row.id : (autosave && autosave.id));
                if (row) applyAddressRow(row);
                if (a) { try { a.renderList(); } catch (e) { /* Liste evtl. gar nicht sichtbar */ } }
            }
        });
        window.abAutosave = autosave;
        return autosave;
    }

    // Vom Adressbuch aufgerufen, sobald das Bearbeiten-Formular offen ist.
    window.abAttachAutosave = function (id) {
        const as = ensureAutosave();
        if (!as || !api()) return;

        const form = document.getElementById('addressbook-form');
        if (form) as.wire(form);
        as.attach(String(id));

        // Beim Schließen noch offene Änderungen wegschreiben — auch nach
        // „Abbrechen“, denn Getipptes soll unter keinen Umständen verfallen.
        // Ist nichts geändert, geht auch nichts raus.
        const modal = document.getElementById('addressbook-form-modal');
        if (modal && !closeObserved) {
            closeObserved = true;
            new MutationObserver(() => {
                if (!modal.classList.contains('show') && as.id) {
                    as.flush().finally(() => as.detach());
                }
            }).observe(modal, { attributes: true, attributeFilter: ['class'] });
        }
    };

    // ------------------------------------------
    // LIVE-UPDATE (Supabase Realtime)
    // ------------------------------------------
    let listTimer = null;
    function scheduleListRender() {
        const a = api();
        if (!a) return;
        clearTimeout(listTimer);
        listTimer = setTimeout(() => {
            try {
                a.buildCountryFilter();
                a.renderList();
                const s = st();
                const detail = document.getElementById('addressbook-detail-modal');
                if (s && s.currentId && detail && detail.classList.contains('show')) a.renderDetail();
            } catch (e) { console.warn('Adressbuch-Liste konnte nicht neu gezeichnet werden:', e); }
        }, 250);
    }

    let detailTimer = null;
    function scheduleDetailRefresh() {
        clearTimeout(detailTimer);
        detailTimer = setTimeout(() => {
            if (typeof window.refreshAddressDetail === 'function') window.refreshAddressDetail();
        }, 300);
    }

    // Eine geänderte customers-Zeile in state.addresses und state.byId nachziehen.
    function applyAddressRow(row) {
        const s = st();
        if (!s || !row) return;
        const key = String(row.id);
        const existing = s.byId.get(key);
        if (existing) {
            Object.assign(existing, row);
            const inList = s.addresses.find(x => String(x.id) === key);
            if (inList && inList !== existing) Object.assign(inList, row);
        } else {
            s.addresses.push(row);
            s.byId.set(key, row);
        }
    }

    function removeAddressRow(id) {
        const s = st();
        if (!s) return;
        const key = String(id);
        s.byId.delete(key);
        const idx = s.addresses.findIndex(x => String(x.id) === key);
        if (idx > -1) s.addresses.splice(idx, 1);
        if (s.currentId === key) {
            s.currentId = null;
            const el = document.getElementById('addressbook-detail-modal');
            if (el && el.classList.contains('show')) {
                el.classList.remove('show', 'active');
                document.body.style.overflow = '';
                if (window.showToast) window.showToast('Diese Adresse wurde gerade von jemand anderem gelöscht.');
            }
        }
    }

    function handleCustomerChange(payload) {
        const s = st();
        if (!s || !s.loaded) return;
        const row = payload.new && payload.new.id ? payload.new : null;
        const oldId = payload.old && payload.old.id ? payload.old.id : null;

        if (payload.eventType === 'DELETE') {
            removeAddressRow(oldId);
            scheduleListRender();
            return;
        }
        if (!row) return;
        // Eigenes Echo: der Stand steht lokal schon, nur nicht neu zeichnen
        // während getippt wird.
        if (isOwnEcho(row.id) && autosave && String(row.id) === String(autosave.id)) {
            applyAddressRow(row);
            return;
        }
        applyAddressRow(row);
        scheduleListRender();
    }

    function affectsOpenDetail(payload) {
        const s = st();
        if (!s || !s.currentId) return false;
        const detail = document.getElementById('addressbook-detail-modal');
        if (!detail || !detail.classList.contains('show')) return false;
        const cid = (payload.new && payload.new.customer_id) || (payload.old && payload.old.customer_id);
        // Beim DELETE liefert Supabase ohne REPLICA IDENTITY FULL nur die ID —
        // dann lieber einmal zu viel nachladen als einen Eintrag stehen lassen.
        if (cid == null) return payload.eventType === 'DELETE';
        return String(cid) === String(s.currentId);
    }

    let subscribed = false;
    window.initAddressbookLive = function () {
        if (subscribed || !window.supabaseClient) return;
        subscribed = true;

        window.supabaseClient
            .channel('customers_live')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, (payload) => {
                try { handleCustomerChange(payload); } catch (e) { console.error('Realtime customers Fehler:', e); }
            })
            .subscribe();

        // Ansprechpartner und Notizen hängen an der Detailansicht — dort wird
        // nachgeladen, in der Liste ändert sich höchstens der Zähler.
        ['customer_contacts', 'customer_notes', 'customer_links'].forEach(table => {
            window.supabaseClient
                .channel(table + '_live')
                .on('postgres_changes', { event: '*', schema: 'public', table: table }, (payload) => {
                    try {
                        if (affectsOpenDetail(payload)) scheduleDetailRefresh();
                    } catch (e) { console.error('Realtime ' + table + ' Fehler:', e); }
                })
                .subscribe();
        });
    };

    console.log('Addressbook live module loaded.');
})();
