// ==========================================================
// Werkstatt-Liste — schnelle kleine Aufgaben, gemeinsam für alle
// ==========================================================
// Rechte Spalte auf der Aufgaben-Seite. Bewusst minimal: Text eintippen +
// Enter = angelegt, Klick = erledigt (rutscht nach unten, durchgestrichen),
// ✕ = löschen. Live bei allen via Supabase Realtime (wie internal_processes).
//
// Tabelle workshop_tasks: id (uuid), text, done (bool), created_at.
// Migration: supabase_add_workshop_tasks.sql
// ==========================================================
(function () {
    'use strict';

    const state = { items: [], subscribed: false, loaded: false };

    function sb() { return window.supabaseClient; }
    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // Offen zuerst (nach Alter aufsteigend), Erledigte nach unten.
    function sortItems(list) {
        return list.slice().sort((a, b) => {
            if (!!a.done !== !!b.done) return a.done ? 1 : -1;
            const ta = new Date(a.created_at || 0).getTime();
            const tb = new Date(b.created_at || 0).getTime();
            return ta - tb;
        });
    }

    function render() {
        const listEl = document.getElementById('workshop-list');
        const countEl = document.getElementById('workshop-count');
        if (!listEl) return;

        const items = sortItems(state.items);
        const offen = items.filter(i => !i.done).length;
        if (countEl) countEl.textContent = String(offen);

        if (!items.length) {
            listEl.innerHTML = `<div class="workshop-empty">Noch nichts eingetragen.<br>Oben eintippen und Enter drücken.</div>`;
            return;
        }

        listEl.innerHTML = items.map(i => `
            <div class="workshop-row${i.done ? ' done' : ''}" data-id="${esc(i.id)}">
                <button type="button" class="workshop-check" title="${i.done ? 'Wieder öffnen' : 'Erledigt'}" onclick="window.workshopToggle('${esc(i.id)}')">
                    ${i.done
                        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>'
                        : ''}
                </button>
                <span class="workshop-text" contenteditable="true" spellcheck="false" title="Klicken zum Bearbeiten"
                    onclick="event.stopPropagation()"
                    onkeydown="if(event.key==='Enter'){event.preventDefault(); this.blur();} else if(event.key==='Escape'){this.textContent=this.dataset.orig||''; this.blur();}"
                    onfocus="this.dataset.orig=this.textContent"
                    onblur="window.workshopUpdateText('${esc(i.id)}', this.textContent)"
                    data-orig="${esc(i.text)}">${esc(i.text)}</span>
                <button type="button" class="workshop-del delete-permission-required" title="Löschen" onclick="window.workshopDelete('${esc(i.id)}')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            </div>`).join('');
    }

    async function fetchItems() {
        if (!sb()) return;
        try {
            const { data, error } = await sb().from('workshop_tasks').select('*');
            if (error) throw error;
            state.items = data || [];
            state.loaded = true;
            render();
        } catch (e) {
            console.warn('Werkstatt-Liste konnte nicht geladen werden:', e);
            const listEl = document.getElementById('workshop-list');
            if (listEl && !state.loaded) {
                listEl.innerHTML = `<div class="workshop-empty">Werkstatt-Liste nicht verfügbar.<br>Migration <b>supabase_add_workshop_tasks.sql</b> ausführen.</div>`;
            }
        }
    }
    window.fetchWorkshopTasks = fetchItems;
    // Für den Aufgaben-Druck (js/tasks-print.js): Zugriff auf die geladene Liste.
    window.getWorkshopTasks = function () { return sortItems(state.items); };

    window.workshopAddSubmit = async function (text) {
        const value = (text || '').trim();
        if (!value || !sb()) return;
        // Optimistisch: sofort anzeigen, Realtime/Refetch korrigiert bei Bedarf.
        try {
            const { error } = await sb().from('workshop_tasks').insert([{ text: value, done: false }]);
            if (error) throw error;
            if (!state.subscribed) fetchItems(); // ohne Realtime selbst nachladen
        } catch (e) {
            console.warn('Werkstatt-Eintrag anlegen fehlgeschlagen:', e);
            if (window.showToast) window.showToast('Werkstatt-Eintrag konnte nicht gespeichert werden.', 'error');
        }
    };

    window.workshopToggle = async function (id) {
        const item = state.items.find(i => String(i.id) === String(id));
        if (!item || !sb()) return;
        const newDone = !item.done;
        item.done = newDone; // optimistisch
        render();
        try {
            const { error } = await sb().from('workshop_tasks').update({ done: newDone }).eq('id', id);
            if (error) throw error;
            if (!state.subscribed) fetchItems();
        } catch (e) {
            item.done = !newDone; render();
            console.warn('Werkstatt-Eintrag umschalten fehlgeschlagen:', e);
        }
    };

    window.workshopUpdateText = async function (id, text) {
        const item = state.items.find(i => String(i.id) === String(id));
        if (!item || !sb()) return;
        const value = (text || '').replace(/\s+$/, '').replace(/^\s+/, '');
        if (value === (item.text || '')) return; // nichts geaendert
        if (!value) { render(); return; } // leer nicht speichern, Original zuruecksetzen
        const prev = item.text;
        item.text = value; // optimistisch
        try {
            const { error } = await sb().from('workshop_tasks').update({ text: value }).eq('id', id);
            if (error) throw error;
            if (!state.subscribed) fetchItems();
        } catch (e) {
            item.text = prev; render();
            console.warn('Werkstatt-Eintrag speichern fehlgeschlagen:', e);
            if (window.showToast) window.showToast('Werkstatt-Eintrag konnte nicht gespeichert werden.', 'error');
        }
    };

    window.workshopDelete = async function (id) {
        if (typeof window.canDelete === 'function' && !window.canDelete('Werkstatt-Einträgen')) return;
        if (!sb()) return;
        const prev = state.items;
        state.items = state.items.filter(i => String(i.id) !== String(id)); // optimistisch
        render();
        try {
            const { error } = await sb().from('workshop_tasks').delete().eq('id', id);
            if (error) throw error;
            if (!state.subscribed) fetchItems();
        } catch (e) {
            state.items = prev; render();
            console.warn('Werkstatt-Eintrag löschen fehlgeschlagen:', e);
        }
    };

    function subscribeRealtime() {
        if (state.subscribed || !sb()) return;
        try {
            sb().channel('workshop_tasks_live')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'workshop_tasks' }, () => {
                    fetchItems();
                })
                .subscribe();
            state.subscribed = true;
        } catch (e) { console.warn('Werkstatt-Realtime nicht verfügbar:', e); }
    }
    window.initWorkshopTasks = function () {
        fetchItems();
        subscribeRealtime();
    };

    // Formular-Handler binden, sobald das DOM steht.
    document.addEventListener('DOMContentLoaded', () => {
        const form = document.getElementById('workshop-add-form');
        const input = document.getElementById('workshop-add-input');
        if (form && input) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                window.workshopAddSubmit(input.value);
                input.value = '';
                input.focus();
            });
        }
    });
})();
