// Suche über alles — Lupe in der Kopfleiste (oder Strg+K).
// Adressen, Maschinen, Vorgänge, Serviceberichte, Angebote, Aufgaben — nach Art
// gruppiert, je Treffer mit kurzer zweiter Zeile; Antippen öffnet direkt.
//
// EIGENSTÄNDIGER BAUSTEIN — rückgängig machen: die zwei Zeilen
//   <link … css/components/globale-suche.css …>  und  <script … js/globale-suche.js …>
// aus index.html (und die zwei Einträge in sw.js PRECACHE) löschen. Sonst hängt
// nichts daran; der Lupen-Knopf wird von hier aus eingefügt.
//
// Gesucht wird im Browser: Adressen/Maschinen aus den vorhandenen Listen,
// Vorgänge/Berichte/Angebote/Aufgaben einmal schmal geladen (5 min Puffer).
(function () {
    'use strict';
    const ZULETZT_KEY = 'meetra_suche_zuletzt';
    const PUFFER_MS = 5 * 60 * 1000;
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const norm = s => String(s == null ? '' : s).toLowerCase()
        .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, ' ').trim();
    const datum = d => { if (!d) return ''; const x = new Date(d); return isNaN(x) ? '' : x.toLocaleDateString('de-DE'); };
    const eur = v => { const n = parseFloat(v); return isNaN(n) ? '' : n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }); };

    const ARTEN = {
        adresse: { titel: 'Adressen', icon: '📍', farbe: '#a78bfa' },
        kontakt: { titel: 'Ansprechpartner', icon: '👤', farbe: '#c4b5fd' },
        maschine: { titel: 'Maschinen', icon: '⚙️', farbe: '#34d399' },
        vorgang: { titel: 'Vorgänge', icon: '📁', farbe: '#818cf8' },
        bericht: { titel: 'Serviceberichte', icon: '📋', farbe: '#10b981' },
        angebot: { titel: 'Angebote', icon: '📄', farbe: '#f87171' },
        aufgabe: { titel: 'Aufgaben', icon: '✅', farbe: '#60a5fa' },
        dokument: { titel: 'Dokumente', icon: '📎', farbe: '#fbbf24' }
    };
    const REIHENFOLGE = ['adresse', 'kontakt', 'maschine', 'vorgang', 'bericht', 'angebot', 'aufgabe', 'dokument'];

    // ------------------------------------------------------------ Daten
    let puffer = null, pufferZeit = 0, laedt = null;
    const kundenById = () => {
        const liste = (window.customerCacheSync && window.customerCacheSync()) || [];
        return new Map(liste.map(k => [String(k.id), k]));
    };
    const mLabel = m => (window.machineLabel ? window.machineLabel(m) : [m.manufacturer, m.name, m.serial ? '#' + m.serial : ''].filter(Boolean).join(' '));

    async function datenLaden() {
        if (puffer && Date.now() - pufferZeit < PUFFER_MS) return puffer;
        if (laedt) return laedt;
        laedt = (async () => {
            const sb = window.supabaseClient;
            if (window.customerCacheGet) { try { await window.customerCacheGet(); } catch (e) { /* ohne */ } }
            const q = p => p.then(r => r.data || []).catch(() => []);
            const [vorgaenge, berichte, angebote, aufgaben, kontakte, telefone, dokumente, ordner] = sb ? await Promise.all([
                q(sb.from('internal_processes').select('id, title, status, customer_id, machine_id, created_at, workshop_order_number').order('created_at', { ascending: false }).limit(1500)),
                q(sb.from('service_entries').select('id, machine_id, title, date, created_at, is_finalized').order('id', { ascending: false }).limit(1500)),
                q(sb.from('angebote').select('id, belegnummer, belegdatum, kundenmatchcode, nettobetrag, status, customer_id').order('belegdatum', { ascending: false }).limit(1500)),
                q(sb.from('tasks').select('id, title, machine_id, status').order('id', { ascending: false }).limit(800)),
                q(sb.from('customer_contacts').select('id, customer_id, salutation, name, position, department, phone, mobile, email').limit(5000)),
                // Der Kunden-Speicher (lookup-cache) hat keine Telefonnummer — hier schmal dazuladen
                q(sb.from('customers').select('id, phone').not('phone', 'is', null).limit(10000)),
                // Dokumente: nur Name/Kategorie/Ordner/Maschine — der Text IN den Dateien wird nicht durchsucht
                q(sb.from('documents').select('id, name, category, url, mime_type, machine_id, folder_id, created_at, machine_series').order('created_at', { ascending: false }).limit(3000)),
                q(sb.from('document_folders').select('id, name'))
            ]) : [[], [], [], [], [], [], [], []];
            puffer = { vorgaenge, berichte, angebote, aufgaben, kontakte, dokumente, ordner, telefon: new Map(telefone.map(t => [String(t.id), t.phone])) };
            pufferZeit = Date.now();
            laedt = null;
            return puffer;
        })();
        return laedt;
    }

    // Einträge mit Suchtext, Titel, Unterzeile und Öffnen-Aktion
    function eintraege(d) {
        const kd = kundenById();
        const ms = window.machineList || [];
        const mById = new Map(ms.map(m => [String(m.id), m]));
        const kName = id => (kd.get(String(id)) || {}).name || '';
        const out = [];
        const kontakteJe = new Map();
        (d.kontakte || []).forEach(c => { const l = kontakteJe.get(String(c.customer_id)) || []; l.push(c); kontakteJe.set(String(c.customer_id), l); });
        kd.forEach(k => out.push({
            art: 'adresse', id: k.id, titel: k.name || 'Adresse',
            sub: [[k.zip_code, k.city].filter(Boolean).join(' '), k.customer_number ? 'Kd. ' + k.customer_number : '', k.address_number ? 'Adr. ' + k.address_number : ''].filter(Boolean).join(' · '),
            text: [k.name, k.city, k.zip_code, k.street, k.customer_number, k.address_number, k.phone || (d.telefon && d.telefon.get(String(k.id))), k.email, k.country, k.matchcode].join(' ')
                + ' ' + (kontakteJe.get(String(k.id)) || []).map(c => c.name).join(' ')
        }));
        // Ansprechpartner: eigener Treffer, öffnet die Adresse auf dem Reiter Ansprechpartner
        (d.kontakte || []).forEach(c => {
            const firma = kName(c.customer_id);
            out.push({
                art: 'kontakt', id: c.customer_id, kontaktId: c.id,
                titel: [c.salutation, c.name].filter(Boolean).join(' ') || 'Ansprechpartner',
                sub: [firma, c.position || c.department, c.mobile || c.phone, c.email].filter(Boolean).join(' · '),
                text: [c.name, c.salutation, c.position, c.department, c.phone, c.mobile, c.email, firma].join(' ')
            });
        });
        ms.forEach(m => out.push({
            art: 'maschine', id: m.id, titel: mLabel(m),
            sub: [m.year ? 'Bj. ' + m.year : '', kName(m.customer_id) || m.company || '', m.location || m.operator_city || ''].filter(Boolean).join(' · '),
            text: [mLabel(m), m.serial, m.serial_number, m.manufacturer, m.name, m.matchcode, m.year, m.company, kName(m.customer_id), m.location, m.operator_city].join(' ')
        }));
        (d.vorgaenge || []).forEach(v => {
            const m = mById.get(String(v.machine_id));
            out.push({
                art: 'vorgang', id: v.id, titel: v.title || 'Vorgang',
                sub: [kName(v.customer_id), m ? mLabel(m) : '', v.status || '', datum(v.created_at)].filter(Boolean).join(' · '),
                text: [v.title, kName(v.customer_id), m ? mLabel(m) : '', v.workshop_order_number, v.status].join(' '),
                erledigt: /erledigt|abgeschlossen|done/i.test(v.status || '')
            });
        });
        (d.berichte || []).forEach(b => {
            const m = mById.get(String(b.machine_id));
            out.push({
                art: 'bericht', id: b.id, titel: (b.title || 'Servicebericht') + (b.date || b.created_at ? ' · ' + datum(b.date || b.created_at) : ''),
                sub: [m ? mLabel(m) : '', m ? (kName(m.customer_id) || m.company || '') : '', b.is_finalized ? 'abgeschlossen' : ''].filter(Boolean).join(' · '),
                text: [b.title, m ? mLabel(m) : '', m ? kName(m.customer_id) : '', m ? m.company : '', m ? m.serial : '', datum(b.date || b.created_at)].join(' ')
            });
        });
        (d.angebote || []).forEach(a => out.push({
            art: 'angebot', id: a.id, beleg: a.belegnummer, titel: 'Angebot ' + (a.belegnummer || ''),
            sub: [kName(a.customer_id) || (a.kundenmatchcode || '').split(',')[0], eur(a.nettobetrag), a.status || '', datum(a.belegdatum)].filter(Boolean).join(' · '),
            text: [a.belegnummer, a.kundenmatchcode, kName(a.customer_id), a.status].join(' ')
        }));
        (d.aufgaben || []).forEach(t => {
            const m = mById.get(String(t.machine_id));
            out.push({
                art: 'aufgabe', id: t.id, titel: t.title || 'Aufgabe',
                sub: [m ? mLabel(m) : '', t.status === 'completed' ? 'erledigt' : 'offen'].filter(Boolean).join(' · '),
                text: [t.title, m ? mLabel(m) : ''].join(' '),
                erledigt: t.status === 'completed'
            });
        });
        const ordnerName = new Map((d.ordner || []).map(o => [String(o.id), o.name]));
        (d.dokumente || []).forEach(x => {
            const m = mById.get(String(x.machine_id));
            const typ = /pdf/i.test(x.mime_type || x.url || '') ? 'PDF' : (/^image\//.test(x.mime_type || '') ? 'Bild' : ((x.url || '').split('.').pop() || '').toUpperCase().slice(0, 4));
            const ord = ordnerName.get(String(x.folder_id)) || '';
            out.push({
                art: 'dokument', id: x.id, url: x.url, mime: x.mime_type, titel: x.name || 'Dokument',
                sub: [typ, x.category, ord ? '📁 ' + ord : '', m ? mLabel(m) : (Array.isArray(x.machine_series) ? x.machine_series.join(', ') : ''), datum(x.created_at)].filter(Boolean).join(' · '),
                text: [x.name, x.category, ord, m ? mLabel(m) : '', Array.isArray(x.machine_series) ? x.machine_series.join(' ') : '', typ].join(' ')
            });
        });
        out.forEach(e => {
            e.n = norm(e.text);
            // Telefon/Nummern auch zusammengeschrieben finden („04761933910“ = „04761-933910“)
            const ziffern = (String(e.text).match(/\d[\d\s\/-]{4,}\d/g) || []).map(x => x.replace(/\D/g, ''));
            // +49 / 0049 zusätzlich national mit 0 („+49 163 …“ ⇒ auch „0163…“)
            const national = ziffern.map(z => z.replace(/^(00)?49(?=[1-9])/, '0')).filter((z, k) => z !== ziffern[k]);
            if (ziffern.length) e.n += ' ' + ziffern.concat(national).join(' ');
            e.nt = norm(e.titel);
        });
        return out;
    }

    // Alle Wörter müssen vorkommen; Wortanfang und Titel zählen mehr; Erledigtes nach hinten
    function suchen(liste, anfrage) {
        // Nur Ziffern (mit Leerzeichen/Strich/+): als EINE Nummer suchen, +49 → 0
        const nurNummer = /^[\d\s\/+()-]+$/.test(String(anfrage).trim()) && /\d{3}/.test(String(anfrage).replace(/\D/g, ''));
        const worte = nurNummer
            ? [String(anfrage).replace(/\D/g, '').replace(/^(00)?49(?=[1-9])/, '0')]
            : norm(anfrage).split(' ').filter(Boolean);
        if (!worte.length) return [];
        const treffer = [];
        for (const e of liste) {
            let s = 0, ok = true;
            for (const w of worte) {
                const i = e.n.indexOf(w);
                if (i < 0) { ok = false; break; }
                s += 1;
                if (i === 0 || e.n[i - 1] === ' ') s += 2;
                if (e.nt.includes(w)) s += 2;
                if (e.art === 'maschine' && e.nt.includes(w)) s += 1;   // Maschinenname schlägt Matchcode einer Adresse
                if (/^\d{3,}$/.test(w) && new RegExp('(^| )' + w + '( |$)').test(e.n)) s += 4;   // Nummer exakt
            }
            if (!ok) continue;
            if (e.erledigt) s -= 1.5;
            treffer.push({ e, s });
        }
        return treffer.sort((a, b) => b.s - a.s).map(x => Object.assign(x.e, { _s: x.s }));
    }

    // ------------------------------------------------------------ Öffnen
    function oeffnen(e) {
        merken(e);
        schliessen();
        const f = {
            adresse: () => window.openAddressbookDetail && window.openAddressbookDetail(String(e.id)),
            kontakt: () => window.openAddressbookDetail && window.openAddressbookDetail(String(e.id), 'contacts'),
            maschine: () => window.openMachineDetails && window.openMachineDetails(e.id),
            vorgang: () => window.navigateToProcess && window.navigateToProcess(e.id),
            bericht: () => window.openEditServicebericht && window.openEditServicebericht(e.id),
            angebot: () => window.navigateToAngebot && window.navigateToAngebot(e.id, e.beleg),
            aufgabe: () => window.navigateToTask && window.navigateToTask(e.id),
            dokument: () => window.previewDocument ? window.previewDocument(e.url, e.titel, e.mime || '') : window.open(e.url, '_blank', 'noopener')
        }[e.art];
        try { f && f(); } catch (err) { console.warn('Suche: Öffnen fehlgeschlagen', err); }
    }
    function zuletzt() { try { return JSON.parse(localStorage.getItem(ZULETZT_KEY) || '[]'); } catch (e) { return []; } }
    function merken(e) {
        try {
            const l = zuletzt().filter(x => !(x.art === e.art && String(x.id) === String(e.id)));
            l.unshift({ art: e.art, id: e.id, titel: e.titel, sub: e.sub, beleg: e.beleg, url: e.url, mime: e.mime });
            localStorage.setItem(ZULETZT_KEY, JSON.stringify(l.slice(0, 8)));
        } catch (err) { /* ohne Speicher */ }
    }

    // ------------------------------------------------------------ Oberfläche
    let liste = [], filter = 'alle', auswahl = 0, sichtbar = [];
    function aufbauen() {
        if (document.getElementById('gs-overlay')) return;
        const ov = document.createElement('div');
        ov.id = 'gs-overlay';
        ov.hidden = true;
        ov.innerHTML = `
            <div class="gs-box" role="dialog" aria-label="Suche">
                <div class="gs-kopf">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/></svg>
                    <input id="gs-input" type="search" autocomplete="off" spellcheck="false" placeholder="Suchen: Firma, Person, Maschine, Seriennr., Angebot, Dokument …">
                    <button type="button" class="gs-zu" data-gs="zu" aria-label="Schließen">Abbrechen</button>
                </div>
                <div class="gs-chips" id="gs-chips"></div>
                <div class="gs-liste" id="gs-liste"></div>
            </div>`;
        document.body.appendChild(ov);
        ov.addEventListener('click', ev => {
            if (ev.target === ov || ev.target.closest('[data-gs="zu"]')) return schliessen();
            const chip = ev.target.closest('[data-gs-filter]');
            if (chip) { filter = chip.dataset.gsFilter; auswahl = 0; zeichnen(); document.getElementById('gs-input').focus(); return; }
            const z = ev.target.closest('[data-gs-i]');
            if (z) oeffnen(sichtbar[+z.dataset.gsI]);
        });
        const inp = ov.querySelector('#gs-input');
        inp.addEventListener('input', () => { auswahl = 0; zeichnen(); });
        inp.addEventListener('keydown', ev => {
            if (ev.key === 'Escape') { ev.preventDefault(); schliessen(); }
            else if (ev.key === 'ArrowDown') { ev.preventDefault(); auswahl = Math.min(auswahl + 1, sichtbar.length - 1); markieren(); }
            else if (ev.key === 'ArrowUp') { ev.preventDefault(); auswahl = Math.max(auswahl - 1, 0); markieren(); }
            else if (ev.key === 'Enter' && sichtbar[auswahl]) { ev.preventDefault(); oeffnen(sichtbar[auswahl]); }
        });
    }
    function markieren() {
        document.querySelectorAll('#gs-liste .gs-zeile').forEach((z, i) => z.classList.toggle('aktiv', i === auswahl));
        const a = document.querySelector('#gs-liste .gs-zeile.aktiv');
        if (a) a.scrollIntoView({ block: 'nearest' });
    }
    function zeileHtml(e, i) {
        const a = ARTEN[e.art];
        return `<button type="button" class="gs-zeile${i === auswahl ? ' aktiv' : ''}" data-gs-i="${i}" style="--gs-farbe:${a.farbe}">
            <span class="gs-icon">${a.icon}</span>
            <span class="gs-text"><span class="gs-titel">${esc(e.titel)}</span>${e.sub ? `<span class="gs-sub">${esc(e.sub)}</span>` : ''}</span>
        </button>`;
    }
    function zeichnen() {
        const q = document.getElementById('gs-input').value;
        const box = document.getElementById('gs-liste');
        const chips = document.getElementById('gs-chips');
        sichtbar = [];
        if (!norm(q)) {
            chips.innerHTML = '';
            const z = zuletzt();
            if (!z.length) { box.innerHTML = '<div class="gs-leer">Tippe einen Namen, Ort, eine Seriennummer, Kunden- oder Angebotsnummer …</div>'; return; }
            sichtbar = z;
            box.innerHTML = '<div class="gs-gruppe">🕘 Zuletzt geöffnet</div>' + z.map(zeileHtml).join('');
            return;
        }
        if (laedt && !liste.length) { box.innerHTML = '<div class="gs-leer">Lade …</div>'; return; }
        const alle = suchen(liste, q);
        const jeArt = {};
        alle.forEach(e => (jeArt[e.art] = jeArt[e.art] || []).push(e));
        chips.innerHTML = [['alle', 'Alle', alle.length]].concat(REIHENFOLGE.filter(a => jeArt[a]).map(a => [a, ARTEN[a].titel, jeArt[a].length]))
            .map(([k, t, n]) => `<button type="button" class="gs-chip${filter === k ? ' aktiv' : ''}" data-gs-filter="${k}">${esc(t)} <span>${n}</span></button>`).join('');
        if (!alle.length) { box.innerHTML = `<div class="gs-leer">Nichts gefunden für „${esc(q)}“.</div>`; return; }
        let html = '';
        // Gruppen nach ihrem besten Treffer ordnen (bei Gleichstand feste Reihenfolge)
        const arten = filter === 'alle'
            ? REIHENFOLGE.filter(a => jeArt[a]).sort((a, b) => (jeArt[b][0]._s - jeArt[a][0]._s) || (REIHENFOLGE.indexOf(a) - REIHENFOLGE.indexOf(b)))
            : [filter];
        arten.forEach(art => {
            const l = jeArt[art] || [];
            if (!l.length) return;
            const zeig = filter === 'alle' ? l.slice(0, 3) : l.slice(0, 50);
            html += `<div class="gs-gruppe">${ARTEN[art].icon} ${esc(ARTEN[art].titel)}${filter === 'alle' && l.length > 3 ? ` <button type="button" class="gs-mehr" data-gs-filter="${art}">alle ${l.length} →</button>` : ''}</div>`;
            html += zeig.map(e => { sichtbar.push(e); return zeileHtml(e, sichtbar.length - 1); }).join('');
        });
        box.innerHTML = html;
    }

    async function oeffnenSuche() {
        aufbauen();
        const ov = document.getElementById('gs-overlay');
        ov.hidden = false;
        document.body.classList.add('gs-offen');
        filter = 'alle'; auswahl = 0;
        const inp = document.getElementById('gs-input');
        inp.value = '';
        zeichnen();
        setTimeout(() => inp.focus(), 30);
        try {
            const d = await datenLaden();
            liste = eintraege(d);
            if (!ov.hidden) zeichnen();
        } catch (e) { console.warn('Suche: Laden fehlgeschlagen', e); }
    }
    function schliessen() {
        const ov = document.getElementById('gs-overlay');
        if (ov) ov.hidden = true;
        document.body.classList.remove('gs-offen');
    }
    window.openGlobaleSuche = oeffnenSuche;

    // Lupe in die Kopfleiste (links neben den Kalender)
    function knopfEinsetzen() {
        if (document.getElementById('gs-btn')) return;
        const ziel = document.querySelector('#topbar .calw-wrapper') || document.querySelector('#topbar .topbar-right');
        if (!ziel) return;
        const b = document.createElement('button');
        b.type = 'button';
        b.id = 'gs-btn';
        b.title = 'Suchen (Strg+K)';
        b.setAttribute('aria-label', 'Suchen');
        b.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/></svg>';
        b.addEventListener('click', oeffnenSuche);
        if (ziel.classList.contains('calw-wrapper')) ziel.parentElement.insertBefore(b, ziel);
        else ziel.prepend(b);
    }
    document.addEventListener('keydown', ev => {
        if ((ev.ctrlKey || ev.metaKey) && (ev.key === 'k' || ev.key === 'K')) { ev.preventDefault(); oeffnenSuche(); }
    });
    // Daten veralten bei Änderungen im Adressbuch
    document.addEventListener('addressbook:changed', () => { pufferZeit = 0; });

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', knopfEinsetzen);
    else knopfEinsetzen();
})();
