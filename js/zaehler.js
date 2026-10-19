/* zaehler.js — mehrere Stundenzähler je Maschine (z. B. „Maschine“ + „Generator“)
 *
 * Einmal je Maschine einrichten (Namen), danach sind die Namen vorbelegt in:
 *   - Servicebericht (zweites Stundenfeld, Beschriftung) und im PDF/Ausdruck (je Zähler eine Zeile),
 *   - Historie-Einträgen „Betriebsstunden“ und „Manuelle Wartung / Reparatur“,
 *   - Kopf und Übersicht der Maschinen-Zentrale.
 * Ablage der Namen: app_settings, Schlüssel „maschinen_zaehler“, Wert { "<Maschinen-ID>": ["Maschine", "Generator"] }
 * (ohne Migration; ohne Eintrag gilt ein Zähler „Betriebsstunden“).
 * Die Werte: Zähler 1 = service_entries.operating_hours (wie bisher), weitere Zähler in
 * service_entries.checklist_payload.zaehler = [{ name, wert }, …]; in der Historie = Eintrag „hours“ (title/content, sender/recipient).
 *
 * API: window.zaehler = { laden, namen(id), speichern(id, namen), einrichten(id), berichtAktualisieren() }
 *      window.zaehlerBerichtWerte() → [{ name, wert }] aus dem offenen Servicebericht
 *      window.zaehlerInPayload(payload) → payload + zaehler (für service_entries.checklist_payload)
 */
(function () {
    'use strict';
    const KEY = 'maschinen_zaehler';
    const STANDARD = 'Betriebsstunden';
    const MAX = 3;
    const sb = () => window.supabaseClient;
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    let karte = null, geladenUm = 0, letzteMaschine = null;

    async function laden(erzwingen) {
        if (karte && !erzwingen && Date.now() - geladenUm < 300000) return karte;
        try {
            const { data } = await sb().from('app_settings').select('value').eq('key', KEY).maybeSingle();
            karte = data && data.value && typeof data.value === 'object' ? data.value : {};
        } catch (e) { karte = karte || {}; }
        geladenUm = Date.now();
        return karte;
    }
    function namen(id) {
        const n = karte && id != null ? karte[String(id)] : null;
        return Array.isArray(n) && n.length ? n.slice(0, MAX) : [STANDARD];
    }
    async function speichern(id, liste) {
        const sauber = liste.map(x => String(x || '').trim()).filter(Boolean).slice(0, MAX);
        const { data: ex } = await sb().from('app_settings').select('key, value').eq('key', KEY).maybeSingle();
        const neu = Object.assign({}, ex && ex.value && typeof ex.value === 'object' ? ex.value : {});
        if (sauber.length <= 1 && (!sauber[0] || sauber[0] === STANDARD)) delete neu[String(id)]; else neu[String(id)] = sauber;
        const r = ex ? await sb().from('app_settings').update({ value: neu }).eq('key', KEY)
            : await sb().from('app_settings').insert([{ key: KEY, value: neu }]);
        if (r.error) throw r.error;
        karte = neu; geladenUm = Date.now();
        document.dispatchEvent(new CustomEvent('zaehler:geaendert', { detail: { id } }));
    }

    // ------------------------------------------------------------ Einrichten
    function einrichten(id) {
        const m = window.machineById ? window.machineById(id) : null;
        const alt = document.getElementById('zh-fenster'); if (alt) alt.remove();
        let liste = namen(id).slice();
        const hg = document.createElement('div');
        hg.id = 'zh-fenster'; hg.className = 'ea-overlay'; hg.style.zIndex = '9800';
        const zeichnen = () => {
            hg.innerHTML = '<div class="ea-panel" role="dialog" aria-modal="true" style="max-width:520px"><div class="fenster-kopf"><h2>Stundenzähler einrichten</h2><button type="button" class="knopf-x" data-zh="zu" aria-label="Schließen" title="Schließen">✕</button></div>' +
                '<div class="ea-body">' + (m ? '<p style="margin:0;color:var(--text-2)">' + esc([m.manufacturer, m.name].filter(Boolean).join(' ')) + (m.serial ? ' · ' + esc(m.serial) : '') + '</p>' : '') +
                '<p style="margin:0 0 var(--space-2);color:var(--text-3);font-size:var(--fs-sm)">Einmal benennen — danach stehen die Namen in jedem neuen Servicebericht, im Ausdruck und in jedem Historie-Eintrag dieser Maschine schon da.</p>' +
                liste.map((n, i) => '<div class="ea-zeile"><label class="form-label-caps" for="zh-n' + i + '">Zähler ' + (i + 1) + '</label><div style="display:flex;gap:var(--space-2)"><input id="zh-n' + i + '" class="glass-input" data-zh-name="' + i + '" value="' + esc(n) + '" placeholder="' + (i === 0 ? 'z. B. Maschine' : 'z. B. Generator') + '" style="flex:1">' +
                    (i > 0 ? '<button type="button" class="knopf-x" data-zh-weg="' + i + '" aria-label="Zähler entfernen" title="Zähler entfernen">✕</button>' : '') + '</div></div>').join('') +
                (liste.length < MAX ? '<button type="button" class="knopf knopf--sekundaer knopf--klein" data-zh="plus" style="align-self:flex-start">＋ ' + (liste.length === 1 ? '2. Stundenzähler hinzufügen' : 'weiteren Zähler hinzufügen') + '</button>' : '') + '</div>' +
                '<div class="fenster-fuss"><span class="ea-platz"></span><button type="button" class="knopf knopf--sekundaer" data-zh="zu">Abbrechen</button><button type="button" class="knopf knopf--primaer" data-zh="ok">Speichern</button></div></div>';
        };
        const lesen = () => hg.querySelectorAll('[data-zh-name]').forEach(el => { liste[+el.dataset.zhName] = el.value; });
        zeichnen();
        hg.addEventListener('click', async e => {
            const a = e.target.closest('[data-zh]'), w = e.target.closest('[data-zh-weg]');
            if (e.target === hg) { hg.remove(); return; }
            if (w) { lesen(); liste.splice(+w.dataset.zhWeg, 1); zeichnen(); return; }
            if (!a) return;
            if (a.dataset.zh === 'zu') hg.remove();
            else if (a.dataset.zh === 'plus') { lesen(); liste.push(''); zeichnen(); const l = hg.querySelectorAll('[data-zh-name]'); l[l.length - 1].focus(); }
            else if (a.dataset.zh === 'ok') {
                lesen();
                const sauber = liste.map(x => x.trim());
                if (sauber.some((x, i) => i > 0 && !x)) { if (window.showToast) window.showToast('Bitte jeden Zähler benennen oder entfernen.'); return; }
                if (!sauber[0]) sauber[0] = STANDARD;
                try { await speichern(id, sauber); hg.remove(); if (window.showToast) window.showToast('Stundenzähler gespeichert', 'success'); }
                catch (err) { console.error('Zähler speichern:', err); if (window.showToast) window.showToast('Speichern fehlgeschlagen: ' + (err.message || err), 'error'); }
            }
        });
        hg.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); hg.remove(); } });
        document.body.appendChild(hg);
        setTimeout(() => { const f = hg.querySelector('input'); if (f) f.focus(); }, 50);
    }

    // ------------------------------------------------------------ Servicebericht (Formular)
    const maschinenId = () => window.currentSelectedMachineForService != null ? window.currentSelectedMachineForService : null;

    function berichtNamen() {
        const n = namen(maschinenId()).slice();
        const g = window._zaehlerGeladen;
        if (Array.isArray(g)) for (let i = n.length; i < g.length; i++) if (g[i] && g[i].name) n.push(g[i].name);
        return n;
    }
    function werteLesen() {
        const n = berichtNamen(), e1 = document.getElementById('service-operating-hours');
        return n.map((name, i) => {
            const el = i === 0 ? e1 : document.querySelector('[data-zaehler-i="' + i + '"]');
            return { name, wert: ((el && el.value) || '').trim() };
        });
    }
    window.zaehlerBerichtWerte = werteLesen;
    window.zaehlerInPayload = function (payload) {
        const z = werteLesen();
        if (z.length < 2) return payload;
        const p = payload && typeof payload === 'object' ? Object.assign({}, payload) : { checklists: [] };
        p.zaehler = z;
        return p;
    };

    async function berichtAktualisieren(neu) {
        const f = document.getElementById('service-operating-hours');
        if (!f) return;
        await laden();
        const id = maschinenId();
        if (neu || String(id) !== String(letzteMaschine)) { letzteMaschine = id; if (!neu && window._zaehlerGeladen == null) { /* Maschinenwechsel: Zusatzwerte verwerfen */ document.querySelectorAll('[data-zaehler-i]').forEach(el => { el.value = ''; }); } }
        const n = berichtNamen();
        const mehrere = n.length > 1 || n[0] !== STANDARD;
        const feld1 = f.closest('.sb-feld');
        const label = feld1 && feld1.querySelector('label');
        if (label) label.textContent = mehrere ? 'Betriebsstunden ' + n[0] + ' (h)' : 'Betriebsstunden (h)';
        const alt = {};
        document.querySelectorAll('[data-zaehler-i]').forEach(el => { alt[el.dataset.zaehlerI] = el.value; const o = el.closest('.sb-feld'); if (o) o.remove(); });
        const g = window._zaehlerGeladen;
        let anker = feld1;
        for (let i = 1; i < n.length; i++) {
            const d = document.createElement('div');
            d.className = 'sb-feld';
            const vorgabe = alt[i] != null ? alt[i] : (Array.isArray(g) && g[i] && g[i].wert != null ? g[i].wert : '');
            d.innerHTML = '<label for="service-zaehler-' + i + '">Betriebsstunden ' + esc(n[i]) + ' (h)</label><input type="text" id="service-zaehler-' + i + '" data-zaehler-i="' + i + '" class="glass-form-input" inputmode="decimal" placeholder="z. B. 560" value="' + esc(vorgabe) + '">';
            anker.insertAdjacentElement('afterend', d);
            anker = d;
        }
        let knopf = feld1 && feld1.querySelector('[data-zaehler-einrichten]');
        if (feld1 && !knopf) {
            knopf = document.createElement('button');
            knopf.type = 'button'; knopf.className = 'knopf knopf--text knopf--klein'; knopf.setAttribute('data-zaehler-einrichten', '1');
            knopf.style.alignSelf = 'flex-start';
            feld1.appendChild(knopf);
        }
        if (knopf) knopf.textContent = n.length < 2 ? '＋ 2. Stundenzähler hinzufügen' : '⚙ Stundenzähler ändern';
    }
    document.addEventListener('click', e => {
        const k = e.target.closest('[data-zaehler-einrichten]');
        if (!k) return;
        const id = maschinenId();
        if (id == null) { if (window.showToast) window.showToast('Bitte zuerst die Maschine wählen.'); return; }
        einrichten(id);
    });
    document.addEventListener('zaehler:geaendert', () => berichtAktualisieren());

    // Bei jedem Wechsel von Maschine/Kategorie im Servicebericht (und beim Öffnen) nachziehen
    function einhaengen() {
        const p = window.populateChecklistSelector;
        if (typeof p !== 'function' || p._zaehler) return;
        const neu = function () { const r = p.apply(this, arguments); berichtAktualisieren(); return r; };
        neu._zaehler = true;
        window.populateChecklistSelector = neu;
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { einhaengen(); setTimeout(einhaengen, 2000); laden(); });
    else { einhaengen(); setTimeout(einhaengen, 2000); laden(); }

    window.zaehler = { laden, namen, speichern, einrichten, berichtAktualisieren, STANDARD };
})();
