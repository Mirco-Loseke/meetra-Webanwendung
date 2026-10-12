// ==========================================
// VORGÄNGE: HINWEIS AUF SCHON OFFENE VORGÄNGE
// ==========================================
// Sobald im Vorgangs-Fenster eine Maschine oder eine Adresse gewählt wird,
// erscheint darunter eine Liste der dazu noch offenen Vorgänge — mit einem
// Knopf, der direkt in den bestehenden Vorgang springt. So legt niemand zum
// dritten Mal „Ölwechsel Maschine 4711“ an, weil er den vorhandenen Vorgang
// nicht gesehen hat.
//
// Gefiltert wird aus window.eventsState.processes, also aus den ohnehin
// geladenen Daten — keine zusätzliche Abfrage, kein zusätzlicher Verkehr.
(function () {
    'use strict';

    const STATUS_META = {
        offen: { label: 'Offen', color: '#38bdf8' },
        in_bearbeitung: { label: 'In Bearbeitung', color: '#fbbf24' }
    };

    // Fenster je Vorsilbe: welche Vorsilbe gehört zu welchem Modal.
    const MODAL_BY_PREFIX = {
        'process-add': 'process-add-modal',
        'edit-process': 'process-edit-modal'
    };

    function el(id) { return document.getElementById(id); }
    function esc(s) {
        return String(s === null || s === undefined ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function formatDate(value) {
        if (!value) return '';
        const d = new Date(value);
        if (isNaN(d.getTime())) return '';
        return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }

    // Wie viele Tage liegt der Vorgang zurück? Alt = auffällig, das ist in
    // der Vorgangsliste schon so und hier genauso hilfreich.
    function ageInDays(value) {
        if (!value) return null;
        const d = new Date(value);
        if (isNaN(d.getTime())) return null;
        return Math.floor((Date.now() - d.getTime()) / 86400000);
    }

    function machineLabel(machineId) {
        const m = (window.machineList || []).find(x => String(x.id) === String(machineId));
        if (!m) return '';
        if (typeof window.processMachineLabel === 'function') {
            try { return window.processMachineLabel(m); } catch (e) { /* faellt unten zurueck */ }
        }
        return [m.machine_number, m.manufacturer, m.model].filter(Boolean).join(' · ');
    }

    // ---- Verknüpfte Adressen (customer_links, auch über mehrere Stufen) ----
    // Einmal je Adresse geladen und gemerkt; wenige Zeilen je Abfrage.
    const verknuepftCache = new Map();   // customerId → Set der verknüpften IDs (ohne sich selbst); null = lädt

    async function ladeVerknuepfte(customerId, prefix) {
        verknuepftCache.set(customerId, null);
        const gesehen = new Set([String(customerId)]);
        let front = [String(customerId)];
        try {
            for (let stufe = 0; stufe < 4 && front.length; stufe++) {
                const liste = front.join(',');
                const { data, error } = await window.supabaseClient.from('customer_links')
                    .select('customer_id, linked_customer_id')
                    .or(`customer_id.in.(${liste}),linked_customer_id.in.(${liste})`);
                if (error) throw error;
                const neu = [];
                (data || []).forEach(l => [l.customer_id, l.linked_customer_id].forEach(x => {
                    const k = String(x);
                    if (x && !gesehen.has(k)) { gesehen.add(k); neu.push(k); }
                }));
                front = neu;
            }
        } catch (e) { console.warn('Verknüpfte Adressen nicht geladen:', e); }
        gesehen.delete(String(customerId));
        verknuepftCache.set(customerId, gesehen);
        // Noch dieselbe Adresse gewählt? Dann Hinweis neu zeichnen.
        if (String((el(prefix + '-customer-id') || {}).value || '') === String(customerId)) window.renderProcessOpenHints(prefix);
    }

    function adressName(id) {
        const k = (typeof window.customerCacheSync === 'function' ? window.customerCacheSync() : []).find(c => String(c.id) === String(id));
        return k ? k.name : 'verknüpfte Adresse';
    }

    // Offene Vorgänge der verknüpften Adressen (ohne die gewählte selbst).
    function findVerknuepfte(prefix, customerId, schonGezeigt) {
        if (!customerId) return [];
        if (!verknuepftCache.has(customerId)) { ladeVerknuepfte(customerId, prefix); return []; }
        const ids = verknuepftCache.get(customerId);
        if (!ids || !ids.size) return [];
        const ownId = (el('edit-process-id') || {}).value || '';
        return (window.eventsState && window.eventsState.processes ? window.eventsState.processes : [])
            .filter(p => p && p.status !== 'erledigt' && ids.has(String(p.customer_id || ''))
                && !(prefix === 'edit-process' && ownId && String(p.id) === String(ownId))
                && !schonGezeigt.includes(p))
            .sort((a, b) => new Date(b.process_date || 0) - new Date(a.process_date || 0));
    }

    // Alle offenen Vorgänge zur gewählten Maschine bzw. Adresse.
    function findOpenProcesses(prefix) {
        const machineId = (el(prefix + '-machine-select') || {}).value || '';
        const customerId = (el(prefix + '-customer-id') || {}).value || '';
        if (!machineId && !customerId) return { list: [], machineId, customerId };

        // Der gerade bearbeitete Vorgang ist kein Hinweis auf sich selbst.
        const ownId = (el('edit-process-id') || {}).value || '';
        const editModalOpen = prefix === 'edit-process';

        const list = (window.eventsState && window.eventsState.processes ? window.eventsState.processes : [])
            .filter(p => {
                if (!p || p.status === 'erledigt') return false;
                if (editModalOpen && ownId && String(p.id) === String(ownId)) return false;
                const gleicheMaschine = machineId && String(p.machine_id || '') === String(machineId);
                const gleicheAdresse = customerId && String(p.customer_id || '') === String(customerId);
                return gleicheMaschine || gleicheAdresse;
            })
            .sort((a, b) => new Date(b.process_date || 0) - new Date(a.process_date || 0));

        return { list, machineId, customerId };
    }
    // Der Kasten sitzt ganz unten im Fenster, direkt über den Knöpfen.
    // Mitten im Formular (unter der Maschinenauswahl) war er eingequetscht
    // und drückte die restlichen Felder nach unten.
    function ensureContainer(prefix) {
        const id = prefix + '-open-hints';
        let box = el(id);
        if (box) return box;

        const anchor = el(prefix + '-machine-search') || el(prefix + '-address-search');
        if (!anchor) return null;

        box = document.createElement('div');
        box.id = id;
        box.className = 'proc-open-hints';
        box.style.display = 'none';

        const form = el(prefix === 'process-add' ? 'process-add-form' : 'process-edit-form') || anchor.closest('form');
        if (form) {
            const submit = form.querySelector('button[type="submit"]');
            let btnRow = submit;
            while (btnRow && btnRow.parentElement !== form) btnRow = btnRow.parentElement;
            if (btnRow) form.insertBefore(box, btnRow);
            else form.appendChild(box);
            return box;
        }

        const group = anchor.closest('.form-group') || anchor.parentElement;
        if (!group || !group.parentElement) return null;
        group.parentElement.insertBefore(box, group.nextSibling);
        return box;
    }


    window.renderProcessOpenHints = function (prefix) {
        const box = ensureContainer(prefix);
        if (!box) return;

        const { list, machineId, customerId } = findOpenProcesses(prefix);
        const beiVerknuepften = findVerknuepfte(prefix, customerId, list);
        if (!list.length && !beiVerknuepften.length) {
            box.style.display = 'none';
            box.innerHTML = '';
            return;
        }

        // Zwei Gruppen: erst die Adresse (aufgeklappt — das ist, was im Alltag
        // zählt), darunter die Maschine (eingeklappt — wie oft z. B. eine A30
        // angeboten wurde, interessiert selten). Ein Vorgang, der zu beidem
        // passt, steht bei der Adresse.
        const zurAdresse = customerId ? list.filter(p => String(p.customer_id || '') === String(customerId)) : [];
        const zurMaschine = machineId ? list.filter(p => String(p.machine_id || '') === String(machineId) && !zurAdresse.includes(p)) : [];

        const zeile = (p, mitAdresse) => {
            const meta = STATUS_META[p.status] || { label: p.status || 'Offen', color: '#94a3b8' };
            const tage = ageInDays(p.process_date);
            const altText = tage !== null && tage > 7 ? `<span class="proc-open-hint-old">seit ${tage} Tagen</span>` : '';
            return `
                <div class="proc-open-hint-row">
                    <div class="proc-open-hint-main">
                        <div class="proc-open-hint-title">${esc(p.title || 'Ohne Titel')}${mitAdresse ? ` <span class="proc-open-hint-adresse">· ${esc(adressName(p.customer_id))}</span>` : ''}</div>
                        <div class="proc-open-hint-meta">
                            <span class="proc-open-hint-status" style="color:${meta.color}; border-color:${meta.color};">${esc(meta.label)}</span>
                            <span>${esc(formatDate(p.process_date))}</span>
                            ${altText}
                        </div>
                    </div>
                    <button type="button" class="proc-open-hint-btn" data-open-hint-id="${esc(p.id)}" data-open-hint-prefix="${esc(prefix)}">Bearbeiten</button>
                </div>`;
        };
        const gruppe = (eintraege, bezug, offen) => {
            if (!eintraege.length) return '';
            const kopf = (eintraege.length === 1 ? 'Es gibt bereits einen offenen Vorgang ' : 'Es gibt bereits ' + eintraege.length + ' offene Vorgänge ') + bezug;
            return `
                <details class="proc-open-hint-group"${offen ? ' open' : ''}>
                    <summary class="proc-open-hint-head" style="cursor:pointer; list-style:none; display:flex; align-items:center; gap:8px;">
                        <span class="proc-open-hint-chevron" style="display:inline-block; transition:transform .15s;">▸</span>${kopf}
                    </summary>
                    ${eintraege.map(p => zeile(p, false)).join('')}
                </details>`;
        };
        // Oranger Kasten: offene Vorgänge bei verknüpften Adressen (z. B. Mutterfirma, Standort).
        const verknuepftGruppe = !beiVerknuepften.length ? '' : `
            <details class="proc-open-hint-group proc-open-hint-verknuepft" open>
                <summary class="proc-open-hint-head" style="cursor:pointer; list-style:none; display:flex; align-items:center; gap:8px;">
                    <span class="proc-open-hint-chevron" style="display:inline-block; transition:transform .15s;">▸</span>${beiVerknuepften.length === 1 ? 'Offener Vorgang bei einer verknüpften Adresse' : beiVerknuepften.length + ' offene Vorgänge bei verknüpften Adressen'}
                </summary>
                ${beiVerknuepften.slice(0, 8).map(p => zeile(p, true)).join('')}
                ${beiVerknuepften.length > 8 ? `<div class="proc-open-hint-meta" style="padding:4px 2px;">… und ${beiVerknuepften.length - 8} weitere</div>` : ''}
            </details>`;

        const maschinenText = machineLabel(machineId) ? ' (' + esc(machineLabel(machineId)) + ')' : '';
        box.innerHTML = gruppe(zurAdresse, 'zu dieser Adresse', true)
            + verknuepftGruppe
            + gruppe(zurMaschine, 'zu dieser Maschine' + maschinenText, false);
        box.style.display = 'block';

        box.querySelectorAll('[data-open-hint-id]').forEach(btn => {
            btn.addEventListener('click', () => {
                switchToProcess(btn.getAttribute('data-open-hint-prefix'), btn.getAttribute('data-open-hint-id'));
            });
        });
        box.querySelectorAll('details').forEach(d => {
            const dreh = () => { const c = d.querySelector('.proc-open-hint-chevron'); if (c) c.style.transform = d.open ? 'rotate(90deg)' : ''; };
            d.addEventListener('toggle', dreh); dreh();
        });
    };

    // Zum vorhandenen Vorgang wechseln: erst das aktuelle Fenster schließen
    // (dabei greifen Auto-Speichern bzw. die Ungespeichert-Rückfrage), dann
    // den bestehenden Vorgang öffnen. Deshalb wird auf das tatsächliche
    // Schließen gewartet, statt einfach beide Fenster übereinanderzulegen.
    function switchToProcess(prefix, id) {
        const modalId = MODAL_BY_PREFIX[prefix];
        const modal = modalId ? el(modalId) : null;
        const open = () => {
            if (typeof window.openEditProcessModal === 'function') window.openEditProcessModal(id);
        };

        if (!modal) { open(); return; }

        let erledigt = false;
        const obs = new MutationObserver(() => {
            if (erledigt) return;
            if (modal.classList.contains('hidden')) {
                erledigt = true;
                obs.disconnect();
                open();
            }
        });
        obs.observe(modal, { attributes: true, attributeFilter: ['class'] });

        // Bricht der Nutzer im Ungespeichert-Dialog ab, bleibt das Fenster
        // offen — dann soll auch nichts nachträglich aufspringen.
        setTimeout(() => { if (!erledigt) { erledigt = true; obs.disconnect(); } }, 8000);

        if (prefix === 'process-add' && typeof window.closeProcessAddModal === 'function') window.closeProcessAddModal();
        else if (typeof window.closeEditProcessModal === 'function') window.closeEditProcessModal();
    }

    // An die vorhandenen Auswahl-Funktionen anhängen, statt sie umzuschreiben.
    document.addEventListener('DOMContentLoaded', function () {
        const nachRender = (prefix) => {
            try { window.renderProcessOpenHints(prefix); } catch (e) { console.warn('Offene-Vorgänge-Hinweis fehlgeschlagen:', e); }
        };

        const origMachine = window.selectProcessMachine;
        if (typeof origMachine === 'function') {
            window.selectProcessMachine = function (prefix) {
                const res = origMachine.apply(this, arguments);
                nachRender(prefix);
                return res;
            };
        }

        const origAddress = window.selectProcessAddress;
        if (typeof origAddress === 'function') {
            window.selectProcessAddress = async function (prefix) {
                const res = await origAddress.apply(this, arguments);
                nachRender(prefix);
                return res;
            };
        }

        // Auswahl zurückgenommen -> Hinweis verschwindet.
        const origClearAddress = window.clearProcessAddress;
        if (typeof origClearAddress === 'function') {
            window.clearProcessAddress = function (prefix) {
                const res = origClearAddress.apply(this, arguments);
                nachRender(prefix);
                return res;
            };
        }

        const origWorkshop = window.selectProcessWorkshopOrder;
        if (typeof origWorkshop === 'function') {
            window.selectProcessWorkshopOrder = function (prefix) {
                const res = origWorkshop.apply(this, arguments);
                nachRender(prefix);
                return res;
            };
        }

        // Beim Öffnen des Bearbeiten-Fensters ist Maschine/Adresse schon
        // gesetzt — der Hinweis gehört dann sofort dazu.
        const origOpenEdit = window.openEditProcessModal;
        if (typeof origOpenEdit === 'function') {
            window.openEditProcessModal = async function () {
                const res = await origOpenEdit.apply(this, arguments);
                nachRender('edit-process');
                return res;
            };
        }

        // Anlegen-Fenster: frisch geöffnet ist nichts gewählt, alter Hinweis weg.
        const origOpenAdd = window.openProcessAddModal;
        if (typeof origOpenAdd === 'function') {
            window.openProcessAddModal = function () {
                const res = origOpenAdd.apply(this, arguments);
                nachRender('process-add');
                return res;
            };
        }
    });

    console.log('Vorgänge: Hinweis auf offene Vorgänge geladen.');
})();
