// ==========================================
// ADRESS-VERLAUF — „zuletzt geöffnet / bearbeitet"
// ==========================================
// Kleiner Verlauf über die letzten 20 Adressen, die der angemeldete Benutzer
// geöffnet oder bearbeitet hat. Knopf im Kopf des Adressbuchs.
//
// Gespeichert wird in der Tabelle `address_history` (eine Zeile je Benutzer
// und Adresse), damit der Verlauf auf allen Geräten derselbe ist. Läuft das
// nicht — Tabelle noch nicht angelegt, offline, `file://` —, wird still auf
// localStorage zurückgefallen; angezeigt wird dann, was dieses Gerät weiß.
// Migration: supabase/supabase_add_address_history.sql
//
// Die Adressdaten selbst (Name, Ort, Kundennummer) kommen beim Anzeigen aus
// dem geladenen Adressbuch, nicht aus der Verlaufstabelle — dort stehen nur
// Kennung, Art und Zeitpunkt. So kann der Verlauf nicht veralten, wenn eine
// Adresse umbenannt wird.
//
// Öffentlich:
//   window.recordAddressVisit(address, 'view' | 'edit')
//   window.openAddressHistory()
// ==========================================
(function () {
    'use strict';

    const MAX = 20;
    const TABLE = 'address_history';

    function sb() { return window.supabaseClient || null; }

    function userId() {
        const u = window.activeUser || null;
        const id = u ? u.id : localStorage.getItem('activeUserId');
        return id === null || id === undefined || id === '' ? null : id;
    }

    // Fehlt die Tabelle, wird nach dem ersten Fehlschlag nicht weiter probiert.
    let remoteOff = false;

    function remoteAvailable() {
        return !remoteOff && !!sb() && navigator.onLine && userId() !== null;
    }

    function remoteFailed(err) {
        const msg = (err && (err.message || err.details)) || '';
        // 42P01 = Tabelle gibt es nicht. Dann dauerhaft auf localStorage bleiben.
        if ((err && err.code === '42P01') || /address_history/i.test(msg)) {
            remoteOff = true;
            console.warn('Adress-Verlauf: Tabelle address_history fehlt, nur lokaler Verlauf. ' +
                'Migration: supabase/supabase_add_address_history.sql');
        } else {
            console.warn('Adress-Verlauf (Supabase):', err);
        }
    }

    function storageKey() {
        const u = window.activeUser || null;
        const id = u ? String(u.id) : (localStorage.getItem('activeUserId') || 'anon');
        return 'ab_recent_' + id;
    }

    function read() {
        try {
            const raw = localStorage.getItem(storageKey());
            const list = raw ? JSON.parse(raw) : [];
            return Array.isArray(list) ? list : [];
        } catch (e) {
            return [];
        }
    }

    function write(list) {
        try { localStorage.setItem(storageKey(), JSON.stringify(list.slice(0, MAX))); } catch (e) { }
    }

    function esc(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // Datum kurz und lesbar: „vor 5 Min.", „Gestern 14:30", sonst Datum + Uhrzeit.
    function whenLabel(ts) {
        const d = new Date(ts);
        if (isNaN(d.getTime())) return '';
        const now = new Date();
        const diffMin = Math.round((now - d) / 60000);
        const time = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

        if (diffMin < 1) return 'gerade eben';
        if (diffMin < 60) return 'vor ' + diffMin + ' Min.';

        const sameDay = d.toDateString() === now.toDateString();
        if (sameDay) return 'Heute ' + time;

        const yesterday = new Date(now.getTime() - 86400000);
        if (d.toDateString() === yesterday.toDateString()) return 'Gestern ' + time;

        return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' }) + ' ' + time;
    }

    // =========================================================
    // EINTRAG MERKEN
    // =========================================================
    // Mehrfaches Öffnen derselben Adresse erzeugt keinen zweiten Eintrag —
    // der bestehende rutscht nur nach oben und bekommt den neuen Zeitstempel.
    // „Bearbeitet" gewinnt dabei über „Geöffnet".
    window.recordAddressVisit = function (address, action) {
        if (!address || !address.id) return;
        const id = String(address.id);
        const prev = read().find(e => String(e.id) === id);
        const act = action === 'edit' ? 'edit' : ((prev && prev.action === 'edit') ? 'edit' : 'view');

        // Immer auch lokal mitschreiben: das ist die Rückfallebene, wenn die
        // Tabelle fehlt oder das Gerät gerade offline ist.
        const list = read().filter(e => String(e.id) !== id);
        list.unshift({
            id: id,
            name: address.name || '(ohne Namen)',
            city: address.city || '',
            zip: address.zip_code || '',
            number: address.customer_number || '',
            action: act,
            ts: Date.now()
        });
        write(list);

        // Und geräteübergreifend. Eine Zeile je Benutzer und Adresse, deshalb
        // upsert auf (user_id, customer_id) — ein erneutes Öffnen aktualisiert
        // nur den Zeitstempel.
        if (remoteAvailable()) {
            sb().from(TABLE)
                .upsert({
                    user_id: userId(),
                    customer_id: id,
                    action: act,
                    viewed_at: new Date().toISOString()
                }, { onConflict: 'user_id,customer_id' })
                .then(res => { if (res && res.error) remoteFailed(res.error); })
                .catch(remoteFailed);
        }

        // Ist das Verlaufs-Fenster gerade offen, sofort aktualisieren.
        const modal = document.getElementById('ab-history-modal');
        if (modal && modal.classList.contains('show')) refresh();
    };

    window.clearAddressHistory = async function () {
        if (!confirm('Den Adress-Verlauf wirklich leeren?')) return;
        write([]);
        if (remoteAvailable()) {
            try {
                const { error } = await sb().from(TABLE).delete().eq('user_id', userId());
                if (error) remoteFailed(error);
            } catch (e) { remoteFailed(e); }
        }
        refresh();
    };

    // =========================================================
    // FENSTER
    // =========================================================
    function ensureModal() {
        if (document.getElementById('ab-history-modal')) return;
        const el = document.createElement('div');
        el.id = 'ab-history-modal';
        el.className = 'modal-backdrop ab-modal-backdrop';
        el.innerHTML =
            '<div class="modal-content ab-history-content">' +
            '<button class="ab-icon-btn ab-modal-close" data-abh-action="close" title="Schließen">' +
            '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
            '</button>' +
            '<div id="ab-history-body"></div>' +
            '</div>';
        document.body.appendChild(el);
        el.addEventListener('click', (e) => { if (e.target === el) close(); });
    }

    function open() {
        ensureModal();
        render(read(), true);   // sofort das, was lokal bekannt ist
        const el = document.getElementById('ab-history-modal');
        el.classList.add('show', 'active');
        document.body.style.overflow = 'hidden';
        refresh();              // dann der geräteübergreifende Stand
    }

    // Holt den Verlauf aus Supabase und zeichnet neu. Geht das nicht, bleibt
    // die lokale Liste stehen.
    async function refresh() {
        if (!remoteAvailable()) { render(read(), true); return; }
        try {
            const { data, error } = await sb()
                .from(TABLE)
                .select('customer_id, action, viewed_at')
                .eq('user_id', userId())
                .order('viewed_at', { ascending: false })
                .limit(MAX);
            if (error) { remoteFailed(error); render(read(), true); return; }

            const local = read();
            const byId = (window.abInternals && window.abInternals.state && window.abInternals.state.byId) || null;

            const list = (data || []).map(row => {
                const id = String(row.customer_id);
                // Stammdaten aus dem geladenen Adressbuch, sonst aus dem
                // lokalen Verlauf, sonst gar nicht.
                const a = byId ? byId.get(id) : null;
                const cached = local.find(e => String(e.id) === id) || {};
                return {
                    id: id,
                    name: (a && a.name) || cached.name || '(nicht mehr vorhanden)',
                    city: (a && a.city) || cached.city || '',
                    zip: (a && a.zip_code) || cached.zip || '',
                    number: (a && a.customer_number) || cached.number || '',
                    action: row.action === 'edit' ? 'edit' : 'view',
                    ts: new Date(row.viewed_at).getTime()
                };
            });
            render(list, false);
        } catch (e) {
            remoteFailed(e);
            render(read(), true);
        }
    }

    function close() {
        const el = document.getElementById('ab-history-modal');
        if (!el) return;
        el.classList.remove('show', 'active');
        if (!document.querySelector('.ab-modal-backdrop.show')) document.body.style.overflow = '';
    }

    function render(list, localOnly) {
        const body = document.getElementById('ab-history-body');
        if (!body) return;
        list = list || [];

        const rows = list.map((e, i) => {
            const sub = [e.number ? 'Nr. ' + e.number : '', [e.zip, e.city].filter(Boolean).join(' ')]
                .filter(Boolean).join('  ·  ');
            const isEdit = e.action === 'edit';
            return '<li class="ab-hist-row" data-abh-action="open" data-abh-id="' + esc(e.id) + '">' +
                '<span class="ab-hist-num">' + (i + 1) + '</span>' +
                '<span class="ab-hist-main">' +
                '<span class="ab-hist-name">' + esc(e.name) + '</span>' +
                (sub ? '<span class="ab-hist-sub">' + esc(sub) + '</span>' : '') +
                '</span>' +
                '<span class="ab-hist-badge ' + (isEdit ? 'is-edit' : 'is-view') + '">' +
                (isEdit ? 'Bearbeitet' : 'Geöffnet') + '</span>' +
                '<span class="ab-hist-when">' + esc(whenLabel(e.ts)) + '</span>' +
                '</li>';
        }).join('');

        body.innerHTML =
            '<div class="ab-hist-head">' +
            '<h2>Zuletzt verwendete Adressen</h2>' +
            '<p class="ab-hist-hint">Die letzten ' + MAX + ' Adressen, die du geöffnet oder bearbeitet hast.' +
            (localOnly ? ' <strong>Nur auf diesem Gerät</strong> — geräteübergreifend wird es, sobald die Tabelle <code>address_history</code> angelegt ist.' : ' Auf allen deinen Geräten gleich.') +
            '</p>' +
            '</div>' +
            (list.length
                ? '<ul class="ab-hist-list">' + rows + '</ul>' +
                '<div class="ab-hist-foot"><button class="ab-btn ab-btn-ghost" data-abh-action="clear">Verlauf leeren</button></div>'
                : '<div class="ab-hist-empty">Noch keine Adressen geöffnet.</div>');
    }

    window.openAddressHistory = open;

    // =========================================================
    // EVENTS
    // =========================================================
    document.addEventListener('click', (e) => {
        const el = e.target.closest('[data-abh-action]');
        if (!el) return;
        const action = el.getAttribute('data-abh-action');

        if (action === 'close') { close(); return; }
        if (action === 'clear') { window.clearAddressHistory(); return; }
        if (action === 'history') { open(); return; }
        if (action === 'open') {
            const id = el.getAttribute('data-abh-id');
            close();
            if (typeof window.openAddressbookDetail === 'function') window.openAddressbookDetail(id);
            else if (typeof window.openAddressDetail === 'function') window.openAddressDetail(id);
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        const el = document.getElementById('ab-history-modal');
        if (el && el.classList.contains('show')) close();
    });
})();
