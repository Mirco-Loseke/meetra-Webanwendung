// ==========================================================
// Rechnungsliste — „wem muss noch eine Rechnung geschrieben werden"
// ==========================================================
// Ausklappbare Leiste am rechten Rand der Vorgänge-Ansicht (Knopf
// „Rechnungen" mit Zähler). Gleiches Bedienmuster wie die Werkstatt-Liste
// (js/workshop-tasks.js) und dieselben CSS-Bausteine (.workshop-*):
// Text + Enter = Eintrag, Haken = erledigt (rutscht nach unten), ✕ = löschen,
// Text anklicken = bearbeiten. Live bei allen per Realtime.
//
// Sichtbarkeit: Benutzerverwaltung → Haken „Rechnungsliste"
// (permissions.rechnungsliste). Fehlt der Schlüssel, ist sie sichtbar.
// Tabelle invoice_todos — Migration supabase_add_invoice_todos.sql.
// ==========================================================
(function () {
    'use strict';

    const state = { items: [], subscribed: false, loaded: false };
    const OFFEN_KEY = 'meetra_rechnungsliste_offen';

    function sb() { return window.supabaseClient; }
    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function meinName() { return (window.activeUser && window.activeUser.name) || null; }

    // Darf der angemeldete Benutzer die Liste sehen?
    function darfSehen() {
        const u = window.activeUser;
        if (!u) return false;
        let p = u.permissions;
        if (typeof p === 'string') { try { p = JSON.parse(p); } catch (e) { p = null; } }
        return !(p && p.rechnungsliste === false);
    }

    // Offene zuerst (älteste oben), Erledigte nach unten (zuletzt erledigte oben).
    function sortItems(list) {
        return list.slice().sort((a, b) => {
            if (!!a.done !== !!b.done) return a.done ? 1 : -1;
            if (a.done) return new Date(b.done_at || 0) - new Date(a.done_at || 0);
            return new Date(a.created_at || 0) - new Date(b.created_at || 0);
        });
    }

    function datumKurz(iso) {
        if (!iso) return '';
        const d = new Date(iso);
        return isNaN(d) ? '' : d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
    }

    function render() {
        const listEl = document.getElementById('rechnungen-list');
        const countEls = document.querySelectorAll('.rechnungen-count');
        const items = sortItems(state.items);
        const offen = items.filter(i => !i.done).length;
        countEls.forEach(el => { el.textContent = String(offen); el.classList.toggle('leer', offen === 0); });
        if (!listEl) return;

        if (!items.length) {
            listEl.innerHTML = '<div class="workshop-empty">Noch nichts eingetragen.<br>Oben eintippen und Enter drücken.</div>';
            return;
        }
        listEl.innerHTML = items.map(i => `
            <div class="workshop-row${i.done ? ' done' : ''}" data-id="${esc(i.id)}">
                <button type="button" class="workshop-check" title="${i.done ? 'Wieder öffnen' : 'Rechnung geschrieben'}" onclick="window.rechnungenToggle('${esc(i.id)}')">
                    ${i.done ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>' : ''}
                </button>
                <span class="workshop-text" contenteditable="true" spellcheck="false" title="Klicken zum Bearbeiten"
                    onclick="event.stopPropagation()"
                    onkeydown="if(event.key==='Enter'){event.preventDefault(); this.blur();} else if(event.key==='Escape'){this.textContent=this.dataset.orig||''; this.blur();}"
                    onfocus="this.dataset.orig=this.textContent"
                    onblur="window.rechnungenUpdateText('${esc(i.id)}', this.textContent)"
                    data-orig="${esc(i.text)}">${esc(i.text)}</span>
                <span class="rechnungen-meta" title="${i.done ? 'erledigt' : 'eingetragen'}${i.done && i.done_by ? ' von ' + esc(i.done_by) : (!i.done && i.created_by ? ' von ' + esc(i.created_by) : '')}">${datumKurz(i.done ? i.done_at : i.created_at)}</span>
                <button type="button" class="workshop-del delete-permission-required" data-del-area="rechnungen" title="Löschen" onclick="window.rechnungenDelete('${esc(i.id)}')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            </div>`).join('');
    }

    async function fetchItems() {
        if (!sb() || !darfSehen()) return;
        try {
            const { data, error } = await sb().from('invoice_todos').select('*');
            if (error) throw error;
            state.items = data || [];
            state.loaded = true;
            render();
        } catch (e) {
            console.warn('Rechnungsliste konnte nicht geladen werden:', e);
            const listEl = document.getElementById('rechnungen-list');
            if (listEl && !state.loaded) {
                listEl.innerHTML = '<div class="workshop-empty">Rechnungsliste nicht verfügbar.<br>Migration <b>supabase_add_invoice_todos.sql</b> ausführen.</div>';
            }
        }
    }
    window.fetchRechnungsliste = fetchItems;

    window.rechnungenAddSubmit = async function (text) {
        const value = (text || '').trim();
        if (!value || !sb()) return;
        try {
            const { error } = await sb().from('invoice_todos').insert([{ text: value, done: false, created_by: meinName() }]);
            if (error) throw error;
            if (!state.subscribed) fetchItems();
        } catch (e) {
            console.warn('Rechnungs-Eintrag anlegen fehlgeschlagen:', e);
            if (window.showToast) window.showToast('Eintrag konnte nicht gespeichert werden.', 'error');
        }
    };

    window.rechnungenToggle = async function (id) {
        const item = state.items.find(i => String(i.id) === String(id));
        if (!item || !sb()) return;
        const neu = !item.done;
        const vorher = { done: item.done, done_at: item.done_at, done_by: item.done_by };
        item.done = neu; item.done_at = neu ? new Date().toISOString() : null; item.done_by = neu ? meinName() : null;
        render();
        try {
            const { error } = await sb().from('invoice_todos')
                .update({ done: neu, done_at: item.done_at, done_by: item.done_by }).eq('id', id);
            if (error) throw error;
            if (!state.subscribed) fetchItems();
        } catch (e) {
            Object.assign(item, vorher); render();
            console.warn('Rechnungs-Eintrag umschalten fehlgeschlagen:', e);
        }
    };

    window.rechnungenUpdateText = async function (id, text) {
        const item = state.items.find(i => String(i.id) === String(id));
        if (!item || !sb()) return;
        const value = (text || '').trim();
        if (value === (item.text || '')) return;
        if (!value) { render(); return; }
        const prev = item.text;
        item.text = value;
        try {
            const { error } = await sb().from('invoice_todos').update({ text: value }).eq('id', id);
            if (error) throw error;
            if (!state.subscribed) fetchItems();
        } catch (e) {
            item.text = prev; render();
            console.warn('Rechnungs-Eintrag speichern fehlgeschlagen:', e);
        }
    };

    window.rechnungenDelete = async function (id) {
        if (typeof window.canDelete === 'function' && !window.canDelete('Rechnungs-Einträgen')) return;
        if (!sb()) return;
        const prev = state.items;
        state.items = state.items.filter(i => String(i.id) !== String(id));
        render();
        try {
            const { error } = await sb().from('invoice_todos').delete().eq('id', id);
            if (error) throw error;
            if (!state.subscribed) fetchItems();
        } catch (e) {
            state.items = prev; render();
            console.warn('Rechnungs-Eintrag löschen fehlgeschlagen:', e);
        }
    };

    // Auf-/Zuklappen; Stand bleibt je Gerät gemerkt.
    window.rechnungenToggleLeiste = function (offen) {
        const panel = document.getElementById('rechnungen-panel');
        const btn = document.getElementById('rechnungen-toggle');
        if (!panel) return;
        const neu = typeof offen === 'boolean' ? offen : !panel.classList.contains('offen');
        panel.classList.toggle('offen', neu);
        if (btn) btn.setAttribute('aria-expanded', String(neu));
        try { localStorage.setItem(OFFEN_KEY, neu ? '1' : '0'); } catch (e) {}
        if (neu) {
            if (!state.loaded) fetchItems();
            const inp = document.getElementById('rechnungen-add-input');
            if (inp) setTimeout(() => inp.focus(), 150);
        }
    };

    // Knopf und Leiste liegen im Markup in der Vorgänge-Unteransicht, werden
    // aber an <body> gehängt: #main-content hat backdrop-filter und wird
    // dadurch zum Bezugsrahmen für position:fixed — die Leiste stünde sonst
    // versetzt und abgeschnitten (siehe CLAUDE.md, dropdown-position.js).
    // Deshalb wird die Sichtbarkeit hier selbst nachgeführt: nur in der
    // Ansicht „Vorgänge" (Kalender-Sektion + Unteransicht Vorgänge) und nur
    // mit Recht.
    // „Vorgänge" ist die eigene Ansicht #processes (Sidebar-Ziel `processes`);
    // die Unteransicht im Kalender (#events-processes-subview) zählt ebenfalls.
    function inVorgaengeAnsicht() {
        const proc = document.getElementById('processes');
        if (proc && !proc.classList.contains('hidden') && proc.classList.contains('active')) return true;
        const view = document.getElementById('calendar');
        const sub = document.getElementById('events-processes-subview');
        if (!view || !sub) return false;
        if (view.classList.contains('hidden') || !view.classList.contains('active')) return false;
        return getComputedStyle(sub).display !== 'none';
    }
    function sichtbarkeitAktualisieren() {
        const zeigen = darfSehen() && inVorgaengeAnsicht();
        ['rechnungen-toggle', 'rechnungen-panel'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = zeigen ? '' : 'none';
        });
    }
    function anBodyHaengen() {
        ['rechnungen-toggle', 'rechnungen-panel'].forEach(id => {
            const el = document.getElementById(id);
            if (el && el.parentElement !== document.body) document.body.appendChild(el);
        });
        const view = document.getElementById('calendar');
        const sub = document.getElementById('events-processes-subview');
        const mo = new MutationObserver(sichtbarkeitAktualisieren);
        const proc = document.getElementById('processes');
        if (proc) mo.observe(proc, { attributes: true, attributeFilter: ['class', 'style'] });
        if (view) mo.observe(view, { attributes: true, attributeFilter: ['class', 'style'] });
        if (sub) mo.observe(sub, { attributes: true, attributeFilter: ['style', 'class'] });
    }

    // Sichtbarkeit nach Rechten — wird von applyUserPermissions (js/permissions.js)
    // und beim Start aufgerufen.
    window.rechnungslisteRechtePruefen = function () {
        sichtbarkeitAktualisieren();
        if (darfSehen() && !state.loaded) fetchItems();
    };

    // Realtime: Einträge sind klein — die Liste komplett zu holen ist hier billig.
    function subscribeRealtime() {
        if (state.subscribed || !sb()) return;
        try {
            sb().channel('invoice_todos_live')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'invoice_todos' }, () => { fetchItems(); })
                .subscribe();
            state.subscribed = true;
        } catch (e) { console.warn('Rechnungsliste-Realtime nicht verfügbar:', e); }
    }
    window.initRechnungsliste = function () {
        anBodyHaengen();
        window.rechnungslisteRechtePruefen();
        subscribeRealtime();
        let offen = false;
        try { offen = localStorage.getItem(OFFEN_KEY) === '1'; } catch (e) {}
        if (offen) window.rechnungenToggleLeiste(true);
    };

    document.addEventListener('DOMContentLoaded', () => {
        const form = document.getElementById('rechnungen-add-form');
        const input = document.getElementById('rechnungen-add-input');
        if (form && input) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                window.rechnungenAddSubmit(input.value);
                input.value = '';
                input.focus();
            });
        }
    });
})();
