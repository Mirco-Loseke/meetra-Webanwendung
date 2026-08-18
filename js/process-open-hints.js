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
        in_bearbeitung: { label: 'In Bearbeitung', color: '#fbbf24' },
        wartet: { label: 'Wartet', color: '#c084fc' }
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

        const { list, machineId } = findOpenProcesses(prefix);
        if (!list.length) {
            box.style.display = 'none';
            box.innerHTML = '';
            return;
        }

        const bezug = machineId
            ? 'zu dieser Maschine' + (machineLabel(machineId) ? ' (' + esc(machineLabel(machineId)) + ')' : '')
            : 'zu dieser Adresse';

        const rows = list.map(p => {
            const meta = STATUS_META[p.status] || { label: p.status || 'Offen', color: '#94a3b8' };
            const tage = ageInDays(p.process_date);
            const altText = tage !== null && tage > 7 ? `<span class="proc-open-hint-old">seit ${tage} Tagen</span>` : '';
            return `
                <div class="proc-open-hint-row">
                    <div class="proc-open-hint-main">
                        <div class="proc-open-hint-title">${esc(p.title || 'Ohne Titel')}</div>
                        <div class="proc-open-hint-meta">
                            <span class="proc-open-hint-status" style="color:${meta.color}; border-color:${meta.color};">${esc(meta.label)}</span>
                            <span>${esc(formatDate(p.process_date))}</span>
                            ${altText}
                        </div>
                    </div>
                    <button type="button" class="proc-open-hint-btn" data-open-hint-id="${esc(p.id)}" data-open-hint-prefix="${esc(prefix)}">Bearbeiten</button>
                </div>`;
        }).join('');

        box.innerHTML = `
            <div class="proc-open-hint-head">
                ${list.length === 1 ? 'Es gibt bereits einen offenen Vorgang' : 'Es gibt bereits ' + list.length + ' offene Vorgänge'} ${bezug}
            </div>
            ${rows}`;
        box.style.display = 'block';

        box.querySelectorAll('[data-open-hint-id]').forEach(btn => {
            btn.addEventListener('click', () => {
                switchToProcess(btn.getAttribute('data-open-hint-prefix'), btn.getAttribute('data-open-hint-id'));
            });
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
