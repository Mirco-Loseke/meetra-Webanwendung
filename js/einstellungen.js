// ==========================================================
// EINSTELLUNGEN — Suche in der Übersicht (partials/settings/settings.html)
// Filtert die Kacheln nach Titel/Beschreibung, blendet leere Gruppen aus.
// Kacheln, die js/permissions.js per style.display versteckt, bleiben versteckt.
// ==========================================================
(function () {
    'use strict';

    const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

    function filtern(q) {
        const root = document.getElementById('settings');
        if (!root) return;
        const such = norm(q).trim();
        let treffer = 0;
        root.querySelectorAll('.est-gruppe').forEach(g => {
            let sichtbar = 0;
            g.querySelectorAll('.est-karte').forEach(k => {
                const passt = !such || norm(k.textContent).includes(such);
                k.classList.toggle('est-aus', !passt);
                if (passt && k.style.display !== 'none') sichtbar++;
            });
            g.hidden = sichtbar === 0;
            treffer += sichtbar;
        });
        const leer = document.getElementById('est-leer');
        if (leer) leer.hidden = treffer > 0;
    }

    document.addEventListener('input', e => { if (e.target && e.target.id === 'est-suche') filtern(e.target.value); });
    document.addEventListener('keydown', e => {
        if (e.key !== 'Enter' || !e.target || e.target.id !== 'est-suche') return;
        // Enter öffnet den ersten Treffer
        const erste = [...document.querySelectorAll('#settings .est-karte')].find(k => !k.classList.contains('est-aus') && k.style.display !== 'none');
        if (erste) erste.click();
    });
    // Gruppen neu prüfen, wenn die Rechte Kacheln aus-/einblenden (nach dem Anmelden)
    document.addEventListener('DOMContentLoaded', () => {
        const root = document.getElementById('settings');
        if (!root || typeof MutationObserver !== 'function') return;
        new MutationObserver(() => filtern((document.getElementById('est-suche') || {}).value || ''))
            .observe(root, { subtree: true, attributes: true, attributeFilter: ['style'] });
    });
})();
