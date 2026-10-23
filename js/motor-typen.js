// ==========================================================
// MOTORTYPEN (2026-10-23) — eine gemeinsame Auswahl statt Freitext
// Quellen: Motortyp aller Maschinen + Motortypen im Filter-Katalog + von Hand angelegte (app_settings "motor_typen").
// Genutzt vom Filter-Katalog (Auswahl-Chips, "+" für neu) und vom Maschinen-Fenster (Vorschläge beim Tippen in #machine-motor-type).
// ==========================================================
(function () {
    'use strict';

    const KEY = 'motor_typen';
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9äöüß]/g, '');
    const sb = () => window.supabaseClient;

    let eigene = [];          // von Hand angelegt
    let geladen = false;

    async function laden() {
        if (geladen || !sb()) return;
        try {
            const { data } = await sb().from('app_settings').select('value').eq('key', KEY).maybeSingle();
            const v = data && data.value;
            eigene = Array.isArray(v) ? v : (v && Array.isArray(v.liste) ? v.liste : []);
            eigene = eigene.map(x => String(x || '').trim()).filter(Boolean);
            geladen = true;
        } catch (e) { console.warn('motor_typen:', e.message || e); }
    }

    // Alle bekannten Motortypen, ohne Dubletten (gleiche Schreibweise bis auf Leerzeichen/Bindestriche/Groß-Klein); Schreibweise der Maschine gewinnt.
    function alle() {
        const m = new Map();
        const dazu = t => { const s = String(t || '').trim(); if (s && !m.has(norm(s))) m.set(norm(s), s); };
        (window.machineList || []).forEach(x => dazu(x.motor_type));
        eigene.forEach(dazu);
        const kat = window.maschinenFilter && window.maschinenFilter.katalog ? window.maschinenFilter.katalog() : [];
        kat.forEach(f => (Array.isArray(f.motor_typen) ? f.motor_typen : []).forEach(dazu));
        return [...m.values()].sort((a, b) => a.localeCompare(b, 'de', { numeric: true }));
    }

    // Neuen Motortyp anlegen (oder den schon vorhandenen mit gleicher Schreibweise liefern)
    async function hinzufuegen(name) {
        const s = String(name || '').trim().replace(/\s+/g, ' ');
        if (!s) return null;
        await laden();
        const da = alle().find(x => norm(x) === norm(s));
        if (da) return da;
        eigene.push(s);
        const client = sb();
        if (client) {
            const { data: ex } = await client.from('app_settings').select('key').eq('key', KEY).maybeSingle();
            const r = ex ? await client.from('app_settings').update({ value: { liste: eigene } }).eq('key', KEY)
                : await client.from('app_settings').insert([{ key: KEY, value: { liste: eigene } }]);
            if (r.error) console.warn('motor_typen speichern:', r.error.message);
        }
        return s;
    }

    // ------------------------------------------------ Vorschläge beim Tippen (Maschinen-Fenster)
    let panel = null, aktiv = null, treffer = [], sel = -1;

    function schliessen() { if (panel) { panel.remove(); panel = null; } aktiv = null; sel = -1; }

    function zeichne(input) {
        const q = norm(input.value);
        const liste = alle();
        treffer = (q ? liste.filter(x => norm(x).includes(q)) : liste).slice(0, 12);
        const exakt = !!q && liste.some(x => norm(x) === q);
        if (!panel) { panel = document.createElement('div'); panel.className = 'mt-panel'; document.body.appendChild(panel); }
        panel.innerHTML = (treffer.length
            ? treffer.map((t, i) => `<div class="mt-eintrag${i === sel ? ' selected' : ''}" data-mt-i="${i}">${esc(t)}</div>`).join('')
            : '') + (q && !exakt ? `<div class="mt-neu">Neuer Motortyp: <b>${esc(input.value.trim())}</b> — wird mit der Maschine gespeichert</div>` : '');
        if (!panel.children.length) { schliessen(); return; }
        const r = input.getBoundingClientRect();
        panel.style.left = r.left + 'px'; panel.style.top = (r.bottom + 4) + 'px'; panel.style.width = r.width + 'px';
    }

    function waehlen(i) {
        if (!aktiv || !treffer[i]) return;
        aktiv.value = treffer[i];
        aktiv.dispatchEvent(new Event('input', { bubbles: true }));
        aktiv.dispatchEvent(new Event('change', { bubbles: true }));
        schliessen();
    }

    const istMotorFeld = el => el && el.id === 'machine-motor-type';
    document.addEventListener('focusin', e => { if (istMotorFeld(e.target)) { aktiv = e.target; laden().then(() => { if (aktiv === e.target) zeichne(e.target); }); } });
    document.addEventListener('input', e => { if (istMotorFeld(e.target)) { aktiv = e.target; sel = -1; zeichne(e.target); } });
    document.addEventListener('keydown', e => {
        if (!panel || !aktiv) return;
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(-1, Math.min(treffer.length - 1, sel + (e.key === 'ArrowDown' ? 1 : -1))); zeichne(aktiv); }
        else if (e.key === 'Enter' && sel >= 0) { e.preventDefault(); waehlen(sel); }
        else if (e.key === 'Escape') { e.stopPropagation(); schliessen(); }
    }, true);
    // mousedown statt click: das Feld soll den Fokus nicht verlieren, bevor gewählt ist
    document.addEventListener('mousedown', e => {
        const li = e.target.closest && e.target.closest('.mt-panel [data-mt-i]');
        if (li) { e.preventDefault(); waehlen(+li.dataset.mtI); return; }
        if (panel && !e.target.closest('.mt-panel') && !istMotorFeld(e.target)) schliessen();
    });
    document.addEventListener('focusout', e => { if (istMotorFeld(e.target)) setTimeout(() => { if (document.activeElement !== e.target) schliessen(); }, 150); });
    // Neuer Motortyp aus dem Maschinen-Fenster in die gemeinsame Liste aufnehmen (Maschinenliste liefert ihn ohnehin nach dem Speichern)
    window.addEventListener('scroll', () => { if (panel && aktiv) zeichne(aktiv); }, true);

    window.motorTypen = { laden, alle, hinzufuegen };
})();
