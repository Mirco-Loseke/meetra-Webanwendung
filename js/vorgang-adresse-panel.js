/* vorgang-adresse-panel.js — „Vorgang bearbeiten“: rechts neben dem Fenster die wichtigsten
 * Angaben der Adresse (Anschrift, Telefon, Mail, Ansprechpartner, Notiz, Typ, Hersteller,
 * Maschinentypen). Änderungen werden beim Verlassen des Feldes direkt in die Stammdaten
 * (customers / customer_contacts) geschrieben.
 * Entfernen = 1 Zeile index.html (script) + 1 (css) + 2 in sw.js. */
(function () {
    'use strict';

    const esc = s => (s == null ? '' : String(s)).replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const sb = () => window.supabaseClient;
    const S = { kunde: null, kontakte: [], kontaktId: null, maschinen: [], procId: null };

    function modal() { return document.getElementById('process-edit-modal'); }
    function panel() { return document.getElementById('vg-adr-panel'); }
    function entfernen() {
        const p = panel(); if (p) p.remove();
        const m = modal(); if (m) m.classList.remove('vg-mit-adr');
        S.kunde = null; S.kontakte = []; S.maschinen = [];
    }

    async function frage(tabelle, spalten, filter) {
        let r = await filter(sb().from(tabelle).select(spalten[0]));
        if (r.error && spalten[1]) r = await filter(sb().from(tabelle).select(spalten[1]));
        return r.error ? null : r.data;
    }

    async function laden(proc) {
        const cid = proc.customer_id || (proc.machines && proc.machines.customer_id) || null;
        if (!cid) return null;
        const kunde = await frage('customers',
            ['id, name, street, zip_code, city, phone, email, notes, address_type, manufacturer', 'id, name, street, zip_code, city, phone, email, notes, address_type'],
            q => q.eq('id', cid).maybeSingle());
        if (!kunde) return null;
        const kontakte = (await frage('customer_contacts', ['id, name, position, phone, mobile, email, is_primary', 'id, name, phone, mobile, email, is_primary'], q => q.eq('customer_id', cid).order('is_primary', { ascending: false }))) || [];
        const maschinen = (await frage('machines', ['id, name, manufacturer, category', 'id, name, manufacturer'], q => q.eq('customer_id', cid).limit(200))) || [];
        return { kunde, kontakte, maschinen };
    }

    function chips(text, farbe) {
        const liste = String(text || '').split(',').map(s => s.trim()).filter(Boolean);
        return liste.length ? liste.map(t => '<span class="vg-chip" style="--c:' + farbe + '">' + esc(t) + '</span>').join('') : '<span class="vg-leer">—</span>';
    }
    function feld(label, name, wert, art, extra) {
        const id = 'vg-f-' + name;
        return '<label class="vg-label" for="' + id + '">' + esc(label) + '</label>' +
            (art === 'text'
                ? '<textarea id="' + id + '" class="glass-input vg-in" data-vg="' + name + '" rows="3">' + esc(wert) + '</textarea>'
                : '<input id="' + id + '" class="glass-input vg-in" data-vg="' + name + '" type="' + (art || 'text') + '" value="' + esc(wert) + '"' + (extra || '') + '>');
    }

    function zeichnen() {
        const p = panel(); if (!p || !S.kunde) return;
        const k = S.kunde;
        const kon = S.kontakte.find(c => String(c.id) === String(S.kontaktId)) || null;
        const arten = [...new Set(S.maschinen.map(m => (m.category || '').trim()).filter(Boolean))].join(', ');
        const hersteller = k.manufacturer || [...new Set(S.maschinen.map(m => (m.manufacturer || '').trim()).filter(Boolean))].join(', ');
        p.innerHTML =
            '<div class="vg-kopf"><h3>Adresse</h3><button type="button" class="knopf knopf--text knopf--klein" data-vg-oeffnen>Adresse öffnen</button></div>' +
            '<div class="vg-zeile">' + feld('Zentrale / Firma', 'name', k.name) + '</div>' +
            '<div class="vg-zeile">' + feld('Straße', 'street', k.street) + '</div>' +
            '<div class="vg-paar"><div>' + feld('PLZ', 'zip_code', k.zip_code) + '</div><div>' + feld('Ort', 'city', k.city) + '</div></div>' +
            '<div class="vg-paar"><div>' + feld('Telefon', 'phone', k.phone, 'tel') + '</div><div>' + feld('E-Mail', 'email', k.email, 'email') + '</div></div>' +
            '<h4>Ansprechpartner</h4>' +
            (S.kontakte.length > 1 ? '<select class="glass-input vg-in" data-vg-kontakt data-no-enhance>' + S.kontakte.map(c => '<option value="' + esc(c.id) + '"' + (String(c.id) === String(S.kontaktId) ? ' selected' : '') + '>' + esc(c.name || '(ohne Name)') + '</option>').join('') + '</select>' : '') +
            (kon
                ? '<div class="vg-zeile">' + feld('Vor- und Nachname', 'k-name', kon.name) + '</div>' +
                  '<div class="vg-zeile">' + feld('Position', 'k-position', kon.position) + '</div>' +
                  '<div class="vg-paar"><div>' + feld('Telefon', 'k-phone', kon.phone || kon.mobile, 'tel') + '</div><div>' + feld('E-Mail', 'k-email', kon.email, 'email') + '</div></div>'
                : '<div class="vg-leer">Kein Ansprechpartner hinterlegt — in der Adresse anlegen.</div>') +
            '<h4>Einordnung</h4>' +
            '<div class="vg-zeile"><span class="vg-label">Adresstyp</span><div class="vg-chips">' + chips(k.address_type, '#38bdf8') + '</div></div>' +
            '<div class="vg-zeile"><span class="vg-label">Hersteller</span><div class="vg-chips">' + chips(hersteller, '#14b8a6') + '</div></div>' +
            '<div class="vg-zeile"><span class="vg-label">Maschinentypen</span><div class="vg-chips">' + chips(arten, '#a78bfa') + '</div></div>' +
            '<h4>Notiz</h4><div class="vg-zeile">' + feld('Notiz der Adresse', 'notes', k.notes, 'text') + '</div>' +
            '<div class="vg-status" data-vg-status></div>';
    }

    function status(t) { const s = document.querySelector('[data-vg-status]'); if (s) { s.textContent = t; if (t) setTimeout(() => { if (s.textContent === t) s.textContent = ''; }, 2500); } }

    async function speichern(name, wert) {
        const k = S.kunde; if (!k) return;
        wert = (wert || '').trim();
        try {
            if (name.startsWith('k-')) {
                const kon = S.kontakte.find(c => String(c.id) === String(S.kontaktId)); if (!kon) return;
                const spalte = { 'k-name': 'name', 'k-position': 'position', 'k-phone': 'phone', 'k-email': 'email' }[name];
                if (spalte === 'name' && !wert) { status('Name darf nicht leer sein'); return; }
                if ((kon[spalte] || '') === wert) return;
                const { error } = await sb().from('customer_contacts').update({ [spalte]: wert || null }).eq('id', kon.id);
                if (error) throw error;
                kon[spalte] = wert || null;
            } else {
                if (name === 'name' && !wert) { status('Name darf nicht leer sein'); return; }
                if ((k[name] || '') === wert) return;
                const { error } = await sb().from('customers').update({ [name]: wert || null }).eq('id', k.id);
                if (error) throw error;
                k[name] = wert || null;
            }
            status('✓ In den Stammdaten gespeichert');
            try { document.dispatchEvent(new CustomEvent('addressbook:changed', { detail: { id: k.id } })); } catch (e) { /* egal */ }
        } catch (er) {
            console.error('Adress-Panel: Speichern fehlgeschlagen', er);
            status('Speichern fehlgeschlagen: ' + (er.message || er));
        }
    }

    async function aufbauen(id) {
        const m = modal(); if (!m) return;
        const proc = (window.eventsState && window.eventsState.processes || []).find(p => String(p.id) === String(id));
        if (!proc) return;
        S.procId = id;
        const daten = await laden(proc);
        if (String(S.procId) !== String(id) || m.classList.contains('hidden')) return;
        entfernen();
        if (!daten) return;
        S.kunde = daten.kunde; S.kontakte = daten.kontakte; S.maschinen = daten.maschinen;
        const wunsch = String(proc.contact_name || '').toLowerCase().trim();
        const treffer = S.kontakte.find(c => wunsch && String(c.name || '').toLowerCase().trim() === wunsch) || S.kontakte.find(c => c.is_primary) || S.kontakte[0];
        S.kontaktId = treffer ? treffer.id : null;
        const p = document.createElement('aside');
        p.id = 'vg-adr-panel';
        p.className = 'vg-adr glass-card';
        m.appendChild(p);
        m.classList.add('vg-mit-adr');
        zeichnen();
    }

    document.addEventListener('change', e => {
        const f = e.target.closest && e.target.closest('#vg-adr-panel [data-vg]');
        if (f) { speichern(f.getAttribute('data-vg'), f.value); return; }
        const sel = e.target.closest && e.target.closest('#vg-adr-panel [data-vg-kontakt]');
        if (sel) { S.kontaktId = sel.value; zeichnen(); }
    });
    document.addEventListener('click', e => {
        if (e.target.closest && e.target.closest('#vg-adr-panel [data-vg-oeffnen]') && S.kunde && window.openAddressbookDetail) window.openAddressbookDetail(S.kunde.id);
    });

    const orig = window.openEditProcessModal;
    if (typeof orig === 'function') {
        window.openEditProcessModal = async function (id) {
            const res = await orig.apply(this, arguments);
            aufbauen(id).catch(er => console.warn('Adress-Panel:', er));
            return res;
        };
    }
    // Schließt das Fenster (egal wie), verschwindet auch das Panel.
    const m0 = modal();
    if (m0) new MutationObserver(() => { if (m0.classList.contains('hidden') || m0.style.display === 'none') entfernen(); })
        .observe(m0, { attributes: true, attributeFilter: ['class', 'style'] });
})();
