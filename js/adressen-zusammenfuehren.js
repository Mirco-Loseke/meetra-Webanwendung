// Adressen zusammenführen (Dubletten) — Knopf „Zusammenführen" im Adress-Detail
// und Hinweis „Möglicherweise doppelt" (js/addressbook.js).
//
// Welche bleibt: die Adresse MIT Sage-Adressnummer. Der Sage-Abgleich
// (tools/sage-sync.ps1) erkennt Adressen zuerst an address_number — bleibt die
// Sage-Adresse bestehen, legt der nächste Abgleich nichts neu an.
// Haben beide eine Adressnummer, sind es in Sage zwei Adressen → hier abgelehnt.
//
// Reihenfolge (nie „erst löschen"): alle Verweise umhängen, leere Felder des
// Ziels aus der Quelle füllen, und NUR wenn alles fehlerfrei war, die Quelle löschen.
(function () {
    'use strict';
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const toast = (m, t) => (typeof window.showToast === 'function' ? window.showToast(m, t) : alert(m));

    // Tabelle → Spalten, die auf customers.id zeigen
    const VERWEISE = [
        ['customer_contacts', ['customer_id']],
        ['customer_notes', ['customer_id']],
        ['customer_links', ['customer_id', 'linked_customer_id']],
        ['internal_processes', ['customer_id']],
        ['angebote', ['customer_id']],
        ['rechnungen', ['customer_id']],
        ['machines', ['customer_id', 'location_customer_id', 'location_id']],
        ['manual_history_entries', ['customer_id']],
        ['maintenance_events', ['customer_id']],
        ['tasks', ['customer_id']],
        ['mail_zuordnungen', ['customer_id']],
        ['rental_agreements', ['customer_id']],
        ['invoice_todos', ['customer_id']]
    ];
    // Felder, die nie von der Quelle übernommen werden
    const NIE = new Set(['id', 'address_number', 'customer_number', 'matchcode', 'sage_stand', 'created_at', 'updated_at', 'user_id']);
    // Tabelle/Spalte gibt es (noch) nicht → überspringen, kein Fehler
    const fehlt = e => /does not exist|could not find|schema cache|relation .* does not exist|42P01|42703|PGRST204|PGRST205/i.test((e && (e.message || e.code)) || '');

    const FELD_DE = { phone: 'Telefon', email: 'E-Mail', mobile: 'Mobil', fax: 'Fax', website: 'Webseite', street: 'Straße', zip_code: 'PLZ', city: 'Ort', country: 'Land', notes: 'Notizen', name: 'Name' };
    const feldDe = k => FELD_DE[k] || k;

    function istLeer(v) { return v == null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length); }

    function feldUnterschiede(quelle, ziel) {
        const uebernahme = {};
        Object.keys(quelle).forEach(k => {
            if (NIE.has(k)) return;
            if (!istLeer(quelle[k]) && istLeer(ziel[k])) uebernahme[k] = quelle[k];
        });
        return uebernahme;
    }

    async function zusammenfuehren(quelle, ziel) {
        const sb = window.supabaseClient;
        const bericht = [];
        for (const [tab, spalten] of VERWEISE) {
            for (const sp of spalten) {
                const { data, error } = await sb.from(tab).update({ [sp]: ziel.id }).eq(sp, quelle.id).select('id');
                if (error && fehlt(error)) continue;
                // Verknüpfung/Zuordnung gibt es beim Ziel schon (eindeutiger Schlüssel) → die doppelte der Quelle entfällt
                if (error && /23505|duplicate key/i.test((error.code || '') + ' ' + (error.message || '')) && (tab === 'customer_links' || tab === 'mail_zuordnungen')) {
                    const { data: dd, error: e2 } = await sb.from(tab).delete().eq(sp, quelle.id).select('id');
                    if (e2) throw new Error(tab + '.' + sp + ': ' + (e2.message || e2));
                    if (dd && dd.length) bericht.push(dd.length + '× ' + tab + ' doppelt, entfernt');
                    continue;
                }
                if (error) throw new Error(tab + '.' + sp + ': ' + (error.message || error));
                if (data && data.length) bericht.push(data.length + '× ' + tab + (spalten.length > 1 ? ' (' + sp + ')' : ''));
            }
        }
        // Verknüpfung der beiden miteinander ist jetzt eine Selbst-Verknüpfung → weg
        const { error: eL } = await sb.from('customer_links').delete().eq('customer_id', ziel.id).eq('linked_customer_id', ziel.id);
        if (eL && !fehlt(eL)) throw new Error('customer_links: ' + eL.message);
        // Besuchsverlauf (je Nutzer + Adresse eindeutig) nicht umhängen, nur aufräumen
        const { error: eH } = await sb.from('address_history').delete().eq('customer_id', quelle.id);
        if (eH && !fehlt(eH)) throw new Error('address_history: ' + eH.message);

        const felder = feldUnterschiede(quelle, ziel);
        if (Object.keys(felder).length) {
            const { error } = await sb.from('customers').update(felder).eq('id', ziel.id);
            if (error) throw new Error('Felder übernehmen: ' + (error.message || error));
            bericht.push('übernommen: ' + Object.keys(felder).map(feldDe).join(', '));
        }
        // Erst jetzt, nach fehlerfreiem Umhängen
        const { error: eD } = await sb.from('customers').delete().eq('id', quelle.id);
        if (eD) throw new Error('Alte Adresse konnte nicht gelöscht werden (alles andere ist umgehängt): ' + (eD.message || eD));
        return bericht;
    }

    // Ermittelt Quelle (geht auf) und Ziel (bleibt): Sage-Adresse bleibt.
    function rollen(a, b) {
        if (a.address_number && b.address_number) return null;
        if (a.address_number) return { ziel: a, quelle: b };
        if (b.address_number) return { ziel: b, quelle: a };
        // Keine aus Sage: die ältere bleibt
        return String(a.created_at || '') <= String(b.created_at || '') ? { ziel: a, quelle: b } : { ziel: b, quelle: a };
    }

    function karte(x, rolle) {
        return `<div class="az-karte ${rolle}">
            <div class="az-rolle">${rolle === 'bleibt' ? '✓ bleibt' : '→ geht darin auf'}</div>
            <div class="az-name">${esc(x.name || 'Ohne Namen')}</div>
            <div class="az-sub">${esc([x.street, [x.zip_code, x.city].filter(Boolean).join(' ')].filter(Boolean).join(' · '))}</div>
            <div class="az-sub">${[x.address_number ? 'Adr. ' + esc(x.address_number) + ' (Sage)' : 'ohne Sage-Nummer', x.customer_number ? 'Kd. ' + esc(x.customer_number) : '', x.phone ? esc(x.phone) : '', x.email ? esc(x.email) : ''].filter(Boolean).join(' · ')}</div>
        </div>`;
    }

    function dialog(html) {
        let el = document.getElementById('adressen-zusammen');
        if (!el) {
            el = document.createElement('div');
            el.id = 'adressen-zusammen';
            el.className = 'az-backdrop';
            document.body.appendChild(el);
            el.addEventListener('click', e => { if (e.target === el || e.target.closest('[data-az="zu"]')) el.remove(); });
        }
        el.innerHTML = `<div class="az-box">${html}</div>`;
        return el;
    }

    function zeigen(aId, bId) {
        const I = window.abInternals;
        if (!I) return toast('Adressbuch ist noch nicht geladen.');
        const st = I.state;
        const a = st.byId.get(String(aId));
        if (!a) return toast('Adresse nicht gefunden.');
        if (!bId) return auswahl(a);
        const b = st.byId.get(String(bId));
        if (!b) return toast('Zweite Adresse nicht gefunden.');
        const r = rollen(a, b);
        if (!r) {
            dialog(`<h3>Beide stammen aus Sage</h3><p>„${esc(a.name)}" (Adr. ${esc(a.address_number)}) und „${esc(b.name)}" (Adr. ${esc(b.address_number)}) sind in Sage zwei eigene Adressen. Hier zusammengeführt, käme die zweite beim nächsten Abgleich wieder.</p><p><b>Bitte zuerst in Sage zusammenführen bzw. eine deaktivieren</b> — danach hier noch einmal.</p><div class="az-knoepfe"><button type="button" class="ab-btn ab-btn-primary" data-az="zu">Verstanden</button></div>`);
            return;
        }
        const felder = Object.keys(feldUnterschiede(r.quelle, r.ziel));
        const el = dialog(`<h3>Adressen zusammenführen</h3>
            <div class="az-paar">${karte(r.quelle, 'geht')}${karte(r.ziel, 'bleibt')}</div>
            <ul class="az-liste">
                <li>Ansprechpartner, Notizen, Vorgänge, Angebote, Belege, Maschinen, Historie, Termine, Mietvereinbarungen, Mail-Zuordnungen und Verknüpfungen hängen danach an <b>„${esc(r.ziel.name)}"</b>.</li>
                ${felder.length ? `<li>Fehlende Angaben werden übernommen: ${esc(felder.map(feldDe).join(', '))}.</li>` : ''}
                <li>„${esc(r.quelle.name)}" wird danach gelöscht.</li>
                ${r.ziel.address_number ? '<li>Die bleibende Adresse hat die Sage-Nummer — beim nächsten Sage-Abgleich wird <b>nichts neu angelegt</b>.</li>' : ''}
            </ul>
            <p class="az-warn">Lässt sich nicht rückgängig machen.</p>
            <div class="az-knoepfe">
                <button type="button" class="ab-btn ab-btn-ghost" data-az="tauschen" ${r.ziel.address_number || r.quelle.address_number ? 'disabled title="Die Sage-Adresse muss bleiben"' : ''}>Umgekehrt</button>
                <button type="button" class="ab-btn ab-btn-ghost" data-az="zu">Abbrechen</button>
                <button type="button" class="ab-btn ab-btn-primary" data-az="los">Zusammenführen</button>
            </div>`);
        el.querySelector('[data-az="tauschen"]').onclick = () => {
            const t = r.ziel; r.ziel = r.quelle; r.quelle = t;
            el.querySelector('.az-paar').innerHTML = karte(r.quelle, 'geht') + karte(r.ziel, 'bleibt');
        };
        el.querySelector('[data-az="los"]').onclick = async (ev) => {
            const btn = ev.currentTarget;
            btn.disabled = true; btn.textContent = 'Führe zusammen …';
            try {
                const bericht = await zusammenfuehren(r.quelle, r.ziel);
                el.remove();
                toast('Zusammengeführt: ' + (bericht.length ? bericht.join(', ') : 'nichts umzuhängen'), 'success');
                if (window.customerCacheInvalidate) { try { window.customerCacheInvalidate(); } catch (e) { /* egal */ } }
                if (typeof window.loadAddressbook === 'function') await window.loadAddressbook();
                document.dispatchEvent(new CustomEvent('addressbook:changed'));
                I.openDetail(r.ziel.id, 'overview');
            } catch (e) {
                console.error('Zusammenführen:', e);
                btn.disabled = false; btn.textContent = 'Nochmal versuchen';
                toast('Zusammenführen abgebrochen: ' + (e.message || e) + ' — die alte Adresse ist NICHT gelöscht.', 'error');
            }
        };
    }

    // Ohne Vorgabe: Verdachtsfälle zuerst, sonst Suche
    function auswahl(a) {
        const I = window.abInternals;
        const verdacht = I.dubletten(a, a.id);
        const el = dialog(`<h3>„${esc(a.name)}" zusammenführen mit …</h3>
            <input type="text" class="glass-form-input az-suche" placeholder="Name, Ort oder Adressnummer suchen …">
            <div class="az-treffer"></div>
            <div class="az-knoepfe"><button type="button" class="ab-btn ab-btn-ghost" data-az="zu">Abbrechen</button></div>`);
        const liste = el.querySelector('.az-treffer');
        const zeichne = eintraege => {
            liste.innerHTML = eintraege.length ? eintraege.map(x => `<button type="button" class="az-wahl" data-id="${esc(x.addr.id)}">
                <b>${esc(x.addr.name)}</b><span>${esc([x.addr.street, x.addr.zip_code, x.addr.city].filter(Boolean).join(' '))}${x.addr.address_number ? ' · Adr. ' + esc(x.addr.address_number) : ''}${x.reasons ? ' · ' + esc(x.reasons.join(', ')) : ''}</span></button>`).join('')
                : '<div class="text-muted-sm">Keine Treffer.</div>';
        };
        zeichne(verdacht);
        el.querySelector('.az-suche').addEventListener('input', e => {
            const q = e.target.value.trim().toLowerCase();
            if (q.length < 2) return zeichne(verdacht);
            const t = (I.state.addresses || []).filter(x => String(x.id) !== String(a.id)
                && [x.name, x.city, x.zip_code, x.address_number, x.customer_number].filter(Boolean).join(' ').toLowerCase().includes(q)).slice(0, 12);
            zeichne(t.map(x => ({ addr: x })));
        });
        liste.addEventListener('click', e => { const b = e.target.closest('.az-wahl'); if (b) zeigen(a.id, b.dataset.id); });
        setTimeout(() => el.querySelector('.az-suche').focus(), 50);
    }

    window.adresseZusammenfuehren = zeigen;
})();
