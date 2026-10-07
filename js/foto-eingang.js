// ==========================================
// FOTO-EINGANG
// ==========================================
// Fotos, die Handys ohne Anmeldung über „meetra Fotos" (fotos/index.html →
// Edge Function foto-eingang) geschickt haben, liegen in foto_eingang.
// Hier werden sie gesichtet und zugeordnet:
//   Maschine / Adresse → manual_history_entries (files = URLs)
//   Servicebericht     → service_entries.files ({name,type,url})
//   Vorgang            → internal_processes.attachments (Format wie process-attachments.js)
// Die Datei bleibt dabei an ihrem Platz in R2 (foto-eingang/…), nur die URL
// wird eingetragen; die Eingangszeile bekommt zugeordnet_* gesetzt.
// „Handys": Geräte-Schlüssel anlegen, Einrichtungs-Link teilen, sperren.
// Migration: supabase/supabase_add_foto_eingang.sql
(function () {
    'use strict';

    const sb = () => window.supabaseClient;
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const toast = (t, art) => { if (window.showToast) window.showToast(t, art); };
    const istBild = r => /^image\//.test(r.typ || '') || /\.(jpe?g|png|webp|gif|heic)$/i.test(r.pfad || '');
    const machineLabel = m => (typeof window.machineLabel === 'function' ? window.machineLabel(m) : (m.name || ''));

    const S = { filter: 'offen', zeilen: [], gewaehlt: new Set(), tabelleFehlt: false };

    // ------------------------------------------------------------
    // Laden + Zeichnen
    // ------------------------------------------------------------
    async function laden() {
        const liste = document.getElementById('fe-liste');
        if (!liste || !sb()) return;
        liste.innerHTML = '<div class="fe-leer">Lädt …</div>';
        let q = sb().from('foto_eingang').select('*').order('created_at', { ascending: false }).limit(500);
        q = S.filter === 'offen' ? q.is('zugeordnet_am', null) : q.not('zugeordnet_am', 'is', null);
        const { data, error } = await q;
        if (error) {
            S.tabelleFehlt = /foto_eingang/.test(error.message || '');
            liste.innerHTML = '<div class="fe-leer">' + (S.tabelleFehlt
                ? 'Die Tabelle fehlt noch — bitte <b>supabase/supabase_add_foto_eingang.sql</b> in Supabase ausführen.'
                : 'Fehler beim Laden: ' + esc(error.message)) + '</div>';
            return;
        }
        S.zeilen = data || [];
        S.gewaehlt.forEach(id => { if (!S.zeilen.some(z => z.id === id)) S.gewaehlt.delete(id); });
        zeichnen();
        if (S.filter === 'offen') zahlSetzen(S.zeilen.length);
    }

    // Gruppen: Tag + Absender + Notiz (eine Sendung vom Handy)
    function gruppieren(zeilen) {
        const gruppen = [];
        const index = new Map();
        zeilen.forEach(z => {
            const tag = (z.created_at || '').slice(0, 10);
            const key = tag + '|' + (z.absender || '') + '|' + (z.notiz || '');
            let g = index.get(key);
            if (!g) { g = { key, tag, absender: z.absender || 'Unbekannt', notiz: z.notiz || '', zeilen: [] }; index.set(key, g); gruppen.push(g); }
            g.zeilen.push(z);
        });
        return gruppen;
    }

    function zeichnen() {
        const liste = document.getElementById('fe-liste');
        if (!liste) return;
        if (!S.zeilen.length) {
            liste.innerHTML = '<div class="fe-leer">' + (S.filter === 'offen' ? 'Keine offenen Fotos. 🎉' : 'Noch nichts zugeordnet.') + '</div>';
            leisteSetzen();
            return;
        }
        liste.innerHTML = gruppieren(S.zeilen).map(g => {
            const datum = new Date(g.tag + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
            const zeit = new Date(g.zeilen[g.zeilen.length - 1].created_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
            return '<div class="fe-gruppe">' +
                '<div class="fe-gruppe-kopf" data-fe-gruppe="' + esc(g.key) + '" title="Ganze Sendung auswählen">' +
                    '<b>' + esc(datum) + ' · ' + esc(g.absender) + '</b><span>' + zeit + ' Uhr · ' + g.zeilen.length + (g.zeilen.length === 1 ? ' Datei' : ' Dateien') + '</span>' +
                '</div>' +
                (g.notiz ? '<p class="fe-notiz">' + esc(g.notiz) + '</p>' : '') +
                '<div class="fe-raster">' + g.zeilen.map(kachel).join('') + '</div>' +
            '</div>';
        }).join('');
        leisteSetzen();
    }

    const ZIEL_ICON = { maschine: '⚙️', adresse: '📍', servicebericht: '🔧', vorgang: '📋' };
    function zielTitel(z) {
        return 'Zugeordnet: ' + z.zugeordnet_text + (z.zugeordnet_von ? ' — von ' + z.zugeordnet_von : '') +
            (z.zugeordnet_am ? ' am ' + new Date(z.zugeordnet_am).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : '') + ' · Klick öffnet';
    }
    function zielOeffnen(z) {
        const id = z.zugeordnet_id;
        try {
            if (z.zugeordnet_typ === 'maschine' && window.openMachineDetails) return window.openMachineDetails(id);
            if (z.zugeordnet_typ === 'adresse' && window.openAddressDetail) { if (window.switchView) window.switchView('addressbook'); return window.openAddressDetail(id); }
            if (z.zugeordnet_typ === 'servicebericht' && window.openEditServicebericht) return window.openEditServicebericht(id);
            if (z.zugeordnet_typ === 'vorgang' && window.oeffneErinnerungsZiel) return window.oeffneErinnerungsZiel('process', id);
        } catch (e) { console.warn('Foto-Eingang: Ziel öffnen', e); }
        toast('Das Ziel lässt sich gerade nicht öffnen.', 'warn');
    }

    function kachel(z) {
        const an = S.gewaehlt.has(z.id);
        const inhalt = istBild(z)
            ? '<img src="' + esc(z.url) + '" loading="lazy" alt="" draggable="false">'
            : '<div class="fe-datei">' + esc(z.dateiname || z.pfad.split('/').pop()) + '</div>';
        return '<div class="fe-kachel' + (an ? ' gewaehlt' : '') + '" draggable="true" title="Ziehen: in einen Windows-Ordner, ins Mail-Fenster der App oder in eine Mail" data-fe-id="' + esc(z.id) + '">' + inhalt +
            '<span class="fe-haken">' + (an ? '✓' : '') + '</span>' +
            (istBild(z) ? '<button type="button" class="fe-kopie" data-fe-kopie="' + esc(z.id) + '" title="Bild kopieren — in Mail mit Strg+V einfügen">📋</button>' : '') +
            '<button type="button" class="fe-lupe" data-fe-lupe="' + esc(z.id) + '" title="Groß ansehen">🔍</button>' +
            (z.zugeordnet_text ? '<button type="button" class="fe-ziel" data-fe-oeffnen="' + esc(z.id) + '" title="' + esc(zielTitel(z)) + '">' + (ZIEL_ICON[z.zugeordnet_typ] || '→') + ' ' + esc(z.zugeordnet_text) + '</button>' : '') +
        '</div>';
    }

    function leisteSetzen() {
        const leiste = document.getElementById('fe-leiste');
        if (!leiste) return;
        const n = S.gewaehlt.size;
        leiste.hidden = !n;
        const t = document.getElementById('fe-auswahl-text');
        if (t) t.textContent = n + (n === 1 ? ' Datei ausgewählt' : ' Dateien ausgewählt');
    }

    function zahlSetzen(n) {
        const z = document.getElementById('fe-zahl');
        if (z) z.textContent = n ? '(' + n + ' offen)' : '';
        const nav = document.getElementById('fe-nav-zahl');
        if (nav) nav.textContent = n ? (n > 99 ? '99+' : String(n)) : '';
    }

    async function zahlLaden() {
        if (!sb() || S.tabelleFehlt) return;
        const { count, error } = await sb().from('foto_eingang').select('id', { count: 'exact', head: true }).is('zugeordnet_am', null);
        if (error) { if (/foto_eingang/.test(error.message || '')) S.tabelleFehlt = true; return; }
        zahlSetzen(count || 0);
    }

    // ------------------------------------------------------------
    // Klicks in der Liste
    // ------------------------------------------------------------
    function klick(e) {
        const ziel = e.target.closest('[data-fe-oeffnen]');
        if (ziel) {
            e.stopPropagation();
            const z = S.zeilen.find(x => x.id === ziel.dataset.feOeffnen);
            if (z) zielOeffnen(z);
            return;
        }
        const kopie = e.target.closest('[data-fe-kopie]');
        if (kopie) {
            e.stopPropagation();
            const z = S.zeilen.find(x => x.id === kopie.dataset.feKopie);
            if (z) bildKopieren(z);
            return;
        }
        const lupe = e.target.closest('[data-fe-lupe]');
        if (lupe) {
            e.stopPropagation();
            const bilder = S.zeilen.filter(istBild);
            const z = S.zeilen.find(x => x.id === lupe.dataset.feLupe);
            if (!z) return;
            if (!istBild(z)) { window.open(z.url, '_blank', 'noopener'); return; }
            if (window.openPhotosLightbox) window.openPhotosLightbox(bilder.map(b => b.url), bilder.indexOf(z));
            else window.open(z.url, '_blank', 'noopener');
            return;
        }
        const kopf = e.target.closest('[data-fe-gruppe]');
        if (kopf) {
            const g = gruppieren(S.zeilen).find(x => x.key === kopf.dataset.feGruppe);
            if (!g) return;
            const alle = g.zeilen.every(z => S.gewaehlt.has(z.id));
            g.zeilen.forEach(z => alle ? S.gewaehlt.delete(z.id) : S.gewaehlt.add(z.id));
            zeichnen();
            return;
        }
        const k = e.target.closest('[data-fe-id]');
        if (!k) return;
        const id = k.dataset.feId;
        if (S.gewaehlt.has(id)) S.gewaehlt.delete(id); else S.gewaehlt.add(id);
        k.classList.toggle('gewaehlt', S.gewaehlt.has(id));
        k.querySelector('.fe-haken').textContent = S.gewaehlt.has(id) ? '✓' : '';
        leisteSetzen();
    }

    // Ziehen aus dem Eingang — das BILD selbst, kein Link:
    //  - Beim Drüberfahren wird die Datei vorab geladen (dragstart ist synchron, dort darf
    //    nicht mehr geladen werden) und dann als echte Datei mitgegeben → Outlook, Mail-Programme,
    //    Windows-Ordner bekommen das Foto. Zusätzlich „DownloadURL" (Chrome/Edge → Ordner/Desktop).
    //  - Kein text/uri-list / text/plain / text/html mehr: daraus machten Mail-Programme einen Link.
    //  - Mail-Fenster der App: alle gewählten Dateien über application/x-meetra-dateien (js/mail-view.js).
    const dateiPuffer = new Map();   // id → File
    function dateiname(z) {
        const n = z.dateiname || z.pfad.split('/').pop();
        return n.replace(/[:\/*?"<>|]+/g, '_');
    }
    async function dateiHolen(z) {
        if (dateiPuffer.has(z.id)) return dateiPuffer.get(z.id);
        const r = await fetch(z.url);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const b = await r.blob();
        const f = new File([b], dateiname(z), { type: z.typ || b.type || 'image/jpeg' });
        dateiPuffer.set(z.id, f);
        return f;
    }
    function vorladen(e) {
        const k = e.target.closest && e.target.closest('[data-fe-id]');
        if (!k) return;
        const z = S.zeilen.find(x => x.id === k.dataset.feId);
        const liste = z && S.gewaehlt.has(z.id) ? gewaehlteZeilen() : (z ? [z] : []);
        liste.forEach(x => { if (!dateiPuffer.has(x.id)) dateiHolen(x).catch(() => {}); });
    }
    function ziehenStart(e) {
        const k = e.target.closest && e.target.closest('[data-fe-id]');
        if (!k || !e.dataTransfer) return;
        const z = S.zeilen.find(x => x.id === k.dataset.feId);
        if (!z) return;
        const liste = S.gewaehlt.has(z.id) ? [z].concat(gewaehlteZeilen().filter(x => x.id !== z.id)) : [z];
        const dt = e.dataTransfer;
        try { dt.clearData(); } catch (x) { /* nicht überall erlaubt */ }
        dt.effectAllowed = 'copy';
        let mitDatei = 0;
        liste.forEach(x => { const f = dateiPuffer.get(x.id); if (f && dt.items) { try { dt.items.add(f); mitDatei++; } catch (y) { /* Browser lässt es nicht zu */ } } });
        dt.setData('DownloadURL', (z.typ || 'image/jpeg') + ':' + dateiname(z) + ':' + z.url);
        dt.setData('application/x-meetra-dateien', JSON.stringify(liste.map(x => ({ name: dateiname(x), url: x.url, type: x.typ || 'image/jpeg' }))));
        const img = k.querySelector('img');
        if (img) dt.setDragImage(img, 40, 40);
        if (!mitDatei) toast('Foto lädt noch — falls nichts ankommt, kurz warten und nochmal ziehen, oder „📋 Bild kopieren“ und mit Strg+V einfügen.');
    }

    // Bild in die Zwischenablage → in jeder Mail mit Strg+V als Bild einfügbar.
    // Zwischenablage nimmt nur PNG sicher an, daher über ein Canvas umwandeln.
    async function bildKopieren(z) {
        try {
            const f = await dateiHolen(z);
            const bmp = await createImageBitmap(f);
            const c = document.createElement('canvas');
            c.width = bmp.width; c.height = bmp.height;
            c.getContext('2d').drawImage(bmp, 0, 0);
            const png = await new Promise(r => c.toBlob(r, 'image/png'));
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
            toast('Bild kopiert — in der Mail mit Strg+V einfügen.', 'success');
        } catch (e) {
            console.warn('Foto-Eingang: kopieren', e);
            toast('Kopieren ging nicht: ' + (e.message || e), 'error');
        }
    }

    function gewaehlteZeilen() { return S.zeilen.filter(z => S.gewaehlt.has(z.id)); }

    // ------------------------------------------------------------
    // Fenster-Gerüst
    // ------------------------------------------------------------
    function fenster(titel, inhaltHtml, fussHtml) {
        const hg = document.createElement('div');
        hg.className = 'fe-fenster-hg';
        hg.innerHTML = '<div class="fe-fenster" role="dialog" aria-modal="true">' +
            '<div class="fe-fenster-kopf"><h2>' + esc(titel) + '</h2><button type="button" data-fe-zu aria-label="Schließen">×</button></div>' +
            '<div class="fe-fenster-inhalt">' + inhaltHtml + '</div>' +
            (fussHtml ? '<div class="fe-fenster-fuss">' + fussHtml + '</div>' : '') +
        '</div>';
        const zu = () => { hg.remove(); document.removeEventListener('keydown', taste); };
        const taste = e => { if (e.key === 'Escape') zu(); };
        hg.addEventListener('click', e => { if (e.target === hg || e.target.closest('[data-fe-zu]')) zu(); });
        document.addEventListener('keydown', taste);
        document.body.appendChild(hg);
        return { el: hg, zu };
    }

    // ------------------------------------------------------------
    // Zuordnen
    // ------------------------------------------------------------
    const ARTEN = [
        { id: 'maschine', label: 'Maschine (Historie)' },
        { id: 'adresse', label: 'Adresse (Historie)' },
        { id: 'servicebericht', label: 'Servicebericht' },
        { id: 'vorgang', label: 'Vorgang' }
    ];

    async function quellen(art, text) {
        const q = (text || '').toLowerCase().trim();
        const passt = s => !q || q.split(/\s+/).every(t => s.toLowerCase().includes(t));
        if (art === 'maschine') {
            return (window.machineList || [])
                .map(m => ({ id: m.id, titel: machineLabel(m), sub: [m.customer_name, m.location].filter(Boolean).join(' · '), m }))
                .filter(x => passt(x.titel + ' ' + x.sub + ' ' + (m => m.serial || m.serial_number || '')(x.m)))
                .slice(0, 60);
        }
        if (art === 'adresse') {
            const kunden = window.customerCacheSearch ? await window.customerCacheSearch(q, 60) : [];
            return kunden.map(k => ({ id: k.id, titel: k.name || '', sub: [k.zip_code, k.city, k.customer_number].filter(Boolean).join(' ') }));
        }
        if (art === 'servicebericht') {
            if (!S.berichte) {
                const { data } = await sb().from('service_entries').select('id, machine_id, title, date, created_at, is_finalized').order('id', { ascending: false }).limit(300);
                S.berichte = data || [];
            }
            return S.berichte.map(b => {
                const m = window.machineById ? window.machineById(b.machine_id) : null;
                const datum = b.date || b.created_at;
                return { id: b.id, titel: (b.title || 'Servicebericht') + (b.is_finalized ? ' 🔒' : ''), sub: [datum ? new Date(datum).toLocaleDateString('de-DE') : '', m ? machineLabel(m) : ''].filter(Boolean).join(' · ') };
            }).filter(x => passt(x.titel + ' ' + x.sub)).slice(0, 60);
        }
        if (art === 'vorgang') {
            let procs = (window.eventsState && window.eventsState.processes) || [];
            if (!procs.length) {
                const { data } = await sb().from('internal_processes').select('*').order('created_at', { ascending: false }).limit(300);
                procs = data || [];
            }
            return procs
                .filter(p => p.status !== 'erledigt')
                .map(p => ({ id: p.id, titel: p.title || ('Vorgang ' + p.id), sub: [p.status, p.contact_name || p.customer_name].filter(Boolean).join(' · ') }))
                .filter(x => passt(x.titel + ' ' + x.sub)).slice(0, 60);
        }
        return [];
    }

    function zuordnen() {
        const zeilen = gewaehlteZeilen();
        if (!zeilen.length) return;
        const notizen = [...new Set(zeilen.map(z => z.notiz).filter(Boolean))].join('\n');
        let art = 'maschine', ziel = null;
        const f = fenster(zeilen.length + (zeilen.length === 1 ? ' Datei zuordnen' : ' Dateien zuordnen'),
            '<div class="fe-arten">' + ARTEN.map(a => '<button type="button" data-fe-art="' + a.id + '"' + (a.id === art ? ' class="active"' : '') + '>' + a.label + '</button>').join('') + '</div>' +
            '<input type="search" class="fe-feld" id="fe-such" placeholder="Suchen …" autocomplete="off">' +
            '<ul class="fe-treffer" id="fe-treffer"></ul>' +
            '<div id="fe-text-block"><label class="form-label-caps" for="fe-titel">Titel</label>' +
            '<input class="fe-feld" id="fe-titel" value="Fotos aus der Werkstatt">' +
            '<label class="form-label-caps" for="fe-text" style="margin-top:var(--space-2);display:block">Text</label>' +
            '<textarea class="fe-feld" id="fe-text">' + esc(notizen) + '</textarea></div>' +
            '<p class="fe-hinweis" id="fe-hinweis"></p>',
            '<button type="button" class="btn-secondary" data-fe-zu>Abbrechen</button><button type="button" class="btn-primary" id="fe-ok" disabled>Zuordnen</button>');
        const $ = s => f.el.querySelector(s);

        async function treffer() {
            const liste = await quellen(art, $('#fe-such').value);
            $('#fe-treffer').innerHTML = liste.length
                ? liste.map(x => '<li data-fe-ziel="' + esc(x.id) + '"' + (ziel && String(ziel.id) === String(x.id) ? ' class="selected"' : '') + '>' + esc(x.titel) + (x.sub ? '<small>' + esc(x.sub) + '</small>' : '') + '</li>').join('')
                : '<li style="cursor:default">Nichts gefunden</li>';
            $('#fe-treffer').__liste = liste;
        }
        function artSetzen(neu) {
            art = neu; ziel = null; $('#fe-ok').disabled = true;
            f.el.querySelectorAll('[data-fe-art]').forEach(b => b.classList.toggle('active', b.dataset.feArt === art));
            $('#fe-text-block').style.display = (art === 'maschine' || art === 'adresse') ? '' : 'none';
            $('#fe-hinweis').textContent = {
                maschine: 'Neuer Eintrag in der Historie der Maschine, mit allen gewählten Fotos.',
                adresse: 'Neuer Eintrag im Verlauf der Adresse, mit allen gewählten Fotos.',
                servicebericht: 'Die Fotos werden an den Bericht angehängt (auch bei abgeschlossenen Berichten).',
                vorgang: 'Die Fotos erscheinen unter den Dokumenten des Vorgangs.'
            }[art];
            treffer();
        }
        f.el.querySelectorAll('[data-fe-art]').forEach(b => b.addEventListener('click', () => artSetzen(b.dataset.feArt)));
        let warte;
        $('#fe-such').addEventListener('input', () => { clearTimeout(warte); warte = setTimeout(treffer, 150); });
        $('#fe-treffer').addEventListener('click', e => {
            const li = e.target.closest('[data-fe-ziel]');
            if (!li) return;
            ziel = ($('#fe-treffer').__liste || []).find(x => String(x.id) === li.dataset.feZiel) || null;
            f.el.querySelectorAll('#fe-treffer li').forEach(x => x.classList.toggle('selected', x === li));
            $('#fe-ok').disabled = !ziel;
        });
        $('#fe-ok').addEventListener('click', async () => {
            if (!ziel) return;
            const knopf = $('#fe-ok');
            knopf.disabled = true; knopf.textContent = 'Speichert …';
            try {
                await eintragen(art, ziel, zeilen, $('#fe-titel').value.trim(), $('#fe-text').value.trim());
                f.zu();
                toast(zeilen.length + (zeilen.length === 1 ? ' Datei' : ' Dateien') + ' zugeordnet: ' + ziel.titel, 'success');
                zeilen.forEach(z => S.gewaehlt.delete(z.id));
                laden();
            } catch (e) {
                console.error('Foto-Eingang: Zuordnen fehlgeschlagen', e);
                toast('Zuordnen fehlgeschlagen: ' + (e.message || e), 'error');
                knopf.disabled = false; knopf.textContent = 'Zuordnen';
            }
        });
        artSetzen(art);
        setTimeout(() => $('#fe-such').focus(), 30);
    }

    async function eintragen(art, ziel, zeilen, titel, text) {
        const wer = (window.activeUser && window.activeUser.id) || null;
        if (art === 'maschine' || art === 'adresse') {
            const zeile = {
                type: art === 'maschine' ? 'photo' : 'note',
                title: titel || 'Fotos aus der Werkstatt',
                content: text || null,
                files: zeilen.map(z => z.url),
                created_by: wer
            };
            if (art === 'maschine') {
                zeile.machine_id = ziel.id;
                const m = ziel.m;
                const kid = m && m.customer_id;
                if (kid) zeile.customer_id = kid;
            } else zeile.customer_id = ziel.id;
            const { error } = await sb().from('manual_history_entries').insert([zeile]);
            if (error) throw error;
            if (art === 'maschine' && window.updateHistoryViewExternally) window.updateHistoryViewExternally(ziel.id);
            document.dispatchEvent(new CustomEvent('addressbook:changed'));
        } else if (art === 'servicebericht') {
            const { data: cur, error: e1 } = await sb().from('service_entries').select('id, files').eq('id', ziel.id).single();
            if (e1) throw e1;
            const files = Array.isArray(cur.files) ? cur.files.slice() : [];
            zeilen.forEach(z => { if (!files.some(f => f && f.url === z.url)) files.push({ name: z.dateiname || z.pfad.split('/').pop(), type: z.typ || 'image/jpeg', url: z.url }); });
            const { error } = await sb().from('service_entries').update({ files }).eq('id', ziel.id);
            if (error) throw error;
            if (typeof window.fetchServiceEntries === 'function') { try { window.fetchServiceEntries(); } catch (e) { /* lädt beim nächsten Öffnen */ } }
        } else if (art === 'vorgang') {
            const { data: p, error: e1 } = await sb().from('internal_processes').select('attachments').eq('id', ziel.id).single();
            if (e1) throw e1;
            const liste = Array.isArray(p && p.attachments) ? p.attachments.slice() : [];
            const von = (window.activeUser && window.activeUser.name) || 'Foto-Eingang';
            zeilen.forEach(z => {
                if (liste.some(a => a && a.url === z.url)) return;
                liste.push({
                    id: 'att_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
                    name: z.dateiname || z.pfad.split('/').pop(), url: z.url, path: z.pfad, size: z.groesse || 0,
                    type: z.typ || 'image/jpeg', at: new Date().toISOString(), by: von + ' (Foto-Eingang, ' + (z.absender || '') + ')', step_id: null
                });
            });
            const { error } = await sb().from('internal_processes').update({ attachments: liste }).eq('id', ziel.id);
            if (error) throw error;
            const lokal = ((window.eventsState && window.eventsState.processes) || []).find(x => String(x.id) === String(ziel.id));
            if (lokal) lokal.attachments = liste;
        }
        const { error } = await sb().from('foto_eingang').update({
            zugeordnet_am: new Date().toISOString(),
            zugeordnet_von: (window.activeUser && (window.activeUser.name || String(window.activeUser.id))) || null,
            zugeordnet_typ: art, zugeordnet_id: String(ziel.id),
            zugeordnet_text: (ARTEN.find(a => a.id === art) || {}).label.split(' (')[0] + ': ' + ziel.titel
        }).in('id', zeilen.map(z => z.id));
        if (error) throw error;
    }

    // ------------------------------------------------------------
    // Löschen (nur offene: zugeordnete Dateien werden woanders benutzt)
    // ------------------------------------------------------------
    // Verweis auf das Foto aus dem Ziel entfernen (die Datei liegt nur einmal in R2).
    async function ausZielEntfernen(z) {
        const url = z.url, id = z.zugeordnet_id;
        const urlVon = u => (u && u.url ? u.url : u);
        if (z.zugeordnet_typ === 'maschine' || z.zugeordnet_typ === 'adresse') {
            const { data, error } = await sb().from('manual_history_entries').select('id, files, content')
                .eq(z.zugeordnet_typ === 'maschine' ? 'machine_id' : 'customer_id', id);
            if (error) throw error;
            for (const h of (data || []).filter(h => Array.isArray(h.files) && h.files.some(u => urlVon(u) === url))) {
                const rest = h.files.filter(u => urlVon(u) !== url);
                // Eintrag bestand nur aus Fotos und ist jetzt leer → ganz weg, sonst nur das Foto raus
                const r = !rest.length && !(h.content || '').trim()
                    ? await sb().from('manual_history_entries').delete().eq('id', h.id)
                    : await sb().from('manual_history_entries').update({ files: rest }).eq('id', h.id);
                if (r.error) throw r.error;
            }
            if (z.zugeordnet_typ === 'maschine' && window.updateHistoryViewExternally) window.updateHistoryViewExternally(id);
            document.dispatchEvent(new CustomEvent('addressbook:changed'));
        } else if (z.zugeordnet_typ === 'servicebericht') {
            const { data, error } = await sb().from('service_entries').select('id, files').eq('id', id).maybeSingle();
            if (error) throw error;
            if (data && Array.isArray(data.files)) {
                const r = await sb().from('service_entries').update({ files: data.files.filter(x => urlVon(x) !== url) }).eq('id', id);
                if (r.error) throw r.error;
            }
            if (typeof window.fetchServiceEntries === 'function') { try { window.fetchServiceEntries(); } catch (e) { /* lädt beim nächsten Öffnen */ } }
        } else if (z.zugeordnet_typ === 'vorgang') {
            const { data, error } = await sb().from('internal_processes').select('id, attachments').eq('id', id).maybeSingle();
            if (error) throw error;
            if (data && Array.isArray(data.attachments)) {
                const rest = data.attachments.filter(x => urlVon(x) !== url);
                const r = await sb().from('internal_processes').update({ attachments: rest }).eq('id', id);
                if (r.error) throw r.error;
                const lokal = ((window.eventsState && window.eventsState.processes) || []).find(x => String(x.id) === String(id));
                if (lokal) lokal.attachments = rest;
            }
        }
    }

    // Große rote Rückfrage; nennt jedes Ziel, aus dem das Foto mit verschwindet.
    function loeschenFragen(zeilen) {
        const zugeordnet = zeilen.filter(z => z.zugeordnet_am);
        const ziele = [...new Set(zugeordnet.map(z => (ZIEL_ICON[z.zugeordnet_typ] || '') + ' ' + z.zugeordnet_text))];
        return new Promise(fertig => {
            const f = fenster('Endgültig löschen?',
                '<div class="fe-warnung">' +
                    '<div class="fe-warnung-titel">⚠️ ' + zeilen.length + (zeilen.length === 1 ? ' Foto wird' : ' Fotos werden') + ' endgültig gelöscht</div>' +
                    (zugeordnet.length
                        ? '<p><b>' + zugeordnet.length + ' davon ' + (zugeordnet.length === 1 ? 'ist' : 'sind') + ' schon zugeordnet und ' + (zugeordnet.length === 1 ? 'verschwindet' : 'verschwinden') + ' auch dort:</b></p><ul>' + ziele.map(t => '<li>' + esc(t) + '</li>').join('') + '</ul>'
                        : '<p>Die Fotos sind noch nirgends zugeordnet.</p>') +
                    '<p>Das lässt sich <b>nicht rückgängig</b> machen — es gibt keinen Papierkorb.</p>' +
                '</div>',
                '<button type="button" class="btn-secondary" data-fe-zu>Abbrechen</button><button type="button" class="fe-btn-rot" id="fe-wirklich">Endgültig löschen</button>');
            let ok = false;
            f.el.querySelector('#fe-wirklich').addEventListener('click', () => { ok = true; f.zu(); });
            new MutationObserver((m, o) => { if (!f.el.isConnected) { o.disconnect(); fertig(ok); } }).observe(document.body, { childList: true });
        });
    }

    async function loeschen() {
        const zeilen = gewaehlteZeilen();
        if (!zeilen.length) return;
        if (typeof window.canDelete === 'function' && !window.canDelete('Fotos')) return;
        if (!(await loeschenFragen(zeilen))) return;
        let fehler = 0;
        for (const z of zeilen) {
            try {
                // Erst aus dem Ziel, dann die Datei — nie umgekehrt, sonst bleibt ein toter Verweis stehen.
                if (z.zugeordnet_am) await ausZielEntfernen(z);
                if (window.FileUploadService) await window.FileUploadService.deleteFile(z.pfad, { bucket: 'dateien', provider: 'cloudflare-r2' });
                const { error } = await sb().from('foto_eingang').delete().eq('id', z.id);
                if (error) throw error;
                S.gewaehlt.delete(z.id);
            } catch (e) { fehler++; console.error('Foto-Eingang: Löschen', e); }
        }
        toast(fehler ? fehler + ' Datei(en) konnten nicht gelöscht werden.' : 'Endgültig gelöscht.', fehler ? 'error' : 'success');
        laden();
    }

    // ------------------------------------------------------------
    // Handys (Geräte-Schlüssel)
    // ------------------------------------------------------------
    function neuerSchluessel() {
        const b = new Uint8Array(24);
        crypto.getRandomValues(b);
        return btoa(String.fromCharCode.apply(null, b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }

    function einrichtungsLink(schluessel) {
        return new URL('fotos/index.html?k=' + encodeURIComponent(schluessel), location.href.split('#')[0]).href;
    }

    // iPhone: Web-Apps erscheinen dort nicht im Teilen-Menü. Ein Apple-Kurzbefehl
    // schickt die gewählten Fotos direkt an die Function foto-eingang.
    const FUNKTION_URL = 'https://rtnpyziwyaqrlfazxkyr.supabase.co/functions/v1/foto-eingang';
    function kurzbefehlZeigen(box, schluessel) {
        if (box.innerHTML) { box.innerHTML = ''; return; }
        const kopie = (wert, label) => '<div class="fe-link" style="display:flex;gap:var(--space-2);align-items:center"><span style="flex:1">' + esc(wert) + '</span><button type="button" class="btn-secondary" data-fe-kopie="' + esc(wert) + '">' + label + '</button></div>';
        box.innerHTML = '<p class="fe-hinweis" style="margin-top:var(--space-3)"><b>Auf dem iPhone in der App „Kurzbefehle“</b> (einmalig, ca. 3 Minuten):</p>' +
            '<ol class="fe-hinweis" style="padding-left:1.2em;display:flex;flex-direction:column;gap:6px">' +
            '<li>„+“ → Name oben: <b>An meetra senden</b>. Unten auf ⓘ (Details) → <b>„Im Share-Sheet anzeigen“</b> an, Typen nur <b>Bilder</b> (und ggf. Medien/PDF).</li>' +
            '<li>Oben steht dann „Empfange <b>Bilder</b> aus Share-Sheet“ — dort „Wenn keine Eingabe“ auf <b>„Fotos auswählen“</b> stellen (dann geht es auch per Antippen vom Home-Bildschirm). Bei „Fotos auswählen“ <b>„Mehrere auswählen“</b> an.</li>' +
            '<li>Aktion <b>„Text anfordern“</b> hinzufügen, Frage: <i>Wozu? (leer lassen geht)</i>. Optional — kann auch weg.</li>' +
            '<li>Aktion <b>„Wiederholen mit jedem“</b> hinzufügen, Eingabe: <b>Kurzbefehleingabe</b>.</li>' +
            '<li>Darin Aktion <b>„Inhalte von URL abrufen“</b>. URL:</li></ol>' + kopie(FUNKTION_URL, 'Kopieren') +
            '<ol start="6" class="fe-hinweis" style="padding-left:1.2em;display:flex;flex-direction:column;gap:6px">' +
            '<li>Auf den Pfeil der Aktion tippen: Methode <b>POST</b>. Header hinzufügen: Schlüssel <b>x-foto-schluessel</b>, Wert:</li></ol>' + kopie(schluessel, 'Kopieren') +
            '<ol start="7" class="fe-hinweis" style="padding-left:1.2em;display:flex;flex-direction:column;gap:6px">' +
            '<li>Anfragetext: <b>Formular</b>. Feld hinzufügen → Typ <b>Datei</b>, Schlüssel <b>fotos</b>, Wert: <b>Wiederholungsobjekt</b>. Wenn Schritt 3 benutzt: zweites Feld Typ <b>Text</b>, Schlüssel <b>notiz</b>, Wert: <b>Bereitgestellte Eingabe</b>.</li>' +
            '<li>Nach „Ende der Wiederholung“ Aktion <b>„Mitteilung anzeigen“</b>: <i>✓ Fotos angekommen</i>.</li>' +
            '<li>Fertig. Benutzen: in Fotos Bilder markieren → Teilen → <b>An meetra senden</b>. Optional über Teilen → „Zum Home-Bildschirm“ ein Symbol anlegen.</li></ol>' +
            '<p class="fe-hinweis">Der Schlüssel gehört zu diesem Handy — wird es gesperrt, nimmt die Function vom Kurzbefehl nichts mehr an.</p>';
        box.querySelectorAll('[data-fe-kopie]').forEach(b => b.onclick = async () => {
            try { await navigator.clipboard.writeText(b.dataset.feKopie); toast('Kopiert.', 'success'); } catch (e) { toast('Kopieren nicht möglich — bitte markieren.', 'warn'); }
        });
    }

    async function handys() {
        const f = fenster('📱 Handys für „meetra Fotos"',
            '<p class="fe-hinweis">Jedes Handy bekommt einen eigenen Einrichtungs-Link. Damit kann es <b>nur</b> Fotos in den Eingang schicken — ohne Anmeldung, ohne Zugriff auf andere Daten. Gesperrte Handys können nichts mehr schicken.</p>' +
            (location.protocol === 'file:' ? '<p class="fe-hinweis" style="color:var(--warning)">Die App läuft gerade per Datei (file://) — der Link funktioniert nur, wenn die App über ihre Internet-Adresse geöffnet ist.</p>' : '') +
            '<div style="display:flex;gap:var(--space-2)"><input class="fe-feld" id="fe-neu-name" placeholder="Name, z. B. Werkstatt-Handy Jan"><button type="button" class="btn-primary" id="fe-neu">Anlegen</button></div>' +
            '<div id="fe-neu-link"></div>' +
            '<div id="fe-geraete">Lädt …</div>' +
            '<p class="fe-hinweis"><b>Android:</b> Link öffnen → Menü ⋮ → „Zum Startbildschirm hinzufügen". Danach steht „meetra Fotos" auch im Teilen-Menü der Galerie.<br>' +
            '<b>iPhone:</b> Link in Safari öffnen → Teilen → „Zum Home-Bildschirm".</p>');
        const $ = s => f.el.querySelector(s);

        async function liste() {
            const { data, error } = await sb().from('foto_geraete').select('*').order('created_at', { ascending: true });
            if (error) { $('#fe-geraete').innerHTML = '<p class="fe-hinweis">Fehler: ' + esc(error.message) + '</p>'; return; }
            $('#fe-geraete').innerHTML = (data || []).length ? data.map(g =>
                '<div class="fe-geraet' + (g.gesperrt ? ' gesperrt' : '') + '">' +
                    '<b>' + esc(g.name) + '</b>' +
                    '<button type="button" class="btn-secondary" data-fe-link="' + esc(g.schluessel) + '">Link</button>' +
                    '<button type="button" class="btn-secondary" data-fe-sperren="' + esc(g.id) + '" data-an="' + (g.gesperrt ? '0' : '1') + '">' + (g.gesperrt ? 'Entsperren' : 'Sperren') + '</button>' +
                    '<button type="button" class="btn-secondary" data-fe-weg="' + esc(g.id) + '" title="Handy entfernen">🗑</button>' +
                    '<small>' + (g.gesperrt ? 'Gesperrt · ' : '') + (g.letzte_nutzung ? 'zuletzt ' + new Date(g.letzte_nutzung).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : 'noch nicht benutzt') + '</small>' +
                '</div>').join('') : '<p class="fe-hinweis">Noch kein Handy eingerichtet.</p>';
        }

        function linkZeigen(schluessel, name) {
            const link = einrichtungsLink(schluessel);
            $('#fe-neu-link').innerHTML = '<p class="fe-hinweis">Einrichtungs-Link' + (name ? ' für <b>' + esc(name) + '</b>' : '') + ' — auf dem Handy öffnen:</p>' +
                '<div class="fe-link">' + esc(link) + '</div>' +
                '<div style="display:flex;flex-wrap:wrap;gap:var(--space-2);margin-top:var(--space-2)"><button type="button" class="btn-secondary" id="fe-kopieren">Kopieren</button>' +
                (navigator.share ? '<button type="button" class="btn-secondary" id="fe-teilen">Teilen …</button>' : '') +
                '<a class="btn-secondary" style="text-decoration:none" href="mailto:?subject=' + encodeURIComponent('meetra Fotos einrichten') + '&body=' + encodeURIComponent('Auf dem Handy öffnen und zum Startbildschirm hinzufügen:\n' + link) + '">Per Mail</a>' +
                '<button type="button" class="btn-secondary" id="fe-iphone">iPhone-Kurzbefehl</button></div><div id="fe-iphone-block"></div>';
            $('#fe-iphone').onclick = () => kurzbefehlZeigen($('#fe-iphone-block'), schluessel);
            $('#fe-kopieren').onclick = async () => { try { await navigator.clipboard.writeText(link); toast('Link kopiert.', 'success'); } catch (e) { toast('Kopieren nicht möglich — bitte markieren.', 'warn'); } };
            const t = $('#fe-teilen');
            if (t) t.onclick = () => navigator.share({ title: 'meetra Fotos', text: 'meetra Fotos einrichten', url: link }).catch(() => {});
        }

        $('#fe-neu').addEventListener('click', async () => {
            const name = $('#fe-neu-name').value.trim();
            if (!name) { $('#fe-neu-name').focus(); return; }
            const schluessel = neuerSchluessel();
            const { error } = await sb().from('foto_geraete').insert([{ name, schluessel, created_by: (window.activeUser && window.activeUser.name) || null }]);
            if (error) { toast('Anlegen fehlgeschlagen: ' + error.message, 'error'); return; }
            $('#fe-neu-name').value = '';
            linkZeigen(schluessel, name);
            liste();
        });
        $('#fe-geraete').addEventListener('click', async e => {
            const l = e.target.closest('[data-fe-link]');
            if (l) { linkZeigen(l.dataset.feLink, l.closest('.fe-geraet').querySelector('b').textContent); return; }
            const s = e.target.closest('[data-fe-sperren]');
            if (s) {
                const { error } = await sb().from('foto_geraete').update({ gesperrt: s.dataset.an === '1' }).eq('id', s.dataset.feSperren);
                if (error) toast(error.message, 'error');
                liste();
                return;
            }
            const w = e.target.closest('[data-fe-weg]');
            if (w && confirm('Dieses Handy entfernen? Es kann danach nichts mehr schicken. Bereits geschickte Fotos bleiben.')) {
                const { error } = await sb().from('foto_geraete').delete().eq('id', w.dataset.feWeg);
                if (error) toast(error.message, 'error');
                $('#fe-neu-link').innerHTML = '';
                liste();
            }
        });
        liste();
    }

    // ------------------------------------------------------------
    // Start
    // ------------------------------------------------------------
    function start() {
        const liste = document.getElementById('fe-liste');
        if (liste) { liste.addEventListener('click', klick); liste.addEventListener('dragstart', ziehenStart); liste.addEventListener('pointerover', vorladen); liste.addEventListener('pointerdown', vorladen); }
        document.querySelectorAll('[data-fe-filter]').forEach(b => b.addEventListener('click', () => {
            S.filter = b.dataset.feFilter;
            S.gewaehlt.clear();
            document.querySelectorAll('[data-fe-filter]').forEach(x => x.classList.toggle('active', x === b));
            laden();
        }));

        // Ansicht geöffnet → laden (switchView stammt aus js/app-init.js)
        const alt = window.switchView;
        if (typeof alt === 'function') {
            window.switchView = function (id) {
                const r = alt.apply(this, arguments);
                if (id === 'foto-eingang') laden();
                return r;
            };
        }
        if (window.currentActiveView === 'foto-eingang' || location.hash === '#foto-eingang') laden();

        // Zähler in der Seitenleiste: einmal beim Start, dann live
        let versuche = 0;
        const warteAufLogin = setInterval(() => {
            if (!sb() || !window.activeUser) { if (++versuche > 60) clearInterval(warteAufLogin); return; }
            clearInterval(warteAufLogin);
            zahlLaden();
            try {
                let buendel;
                sb().channel('foto-eingang').on('postgres_changes', { event: '*', schema: 'public', table: 'foto_eingang' }, () => {
                    clearTimeout(buendel);
                    buendel = setTimeout(() => {
                        if (window.currentActiveView === 'foto-eingang' && !document.querySelector('.fe-fenster-hg')) laden();
                        else zahlLaden();
                    }, 1500);
                }).subscribe();
            } catch (e) { /* ohne Realtime: Zähler beim nächsten Start */ }
        }, 1000);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();

    window.fotoEingang = { laden, zuordnen, loeschen, handys, auswahlLeeren: () => { S.gewaehlt.clear(); zeichnen(); } };
})();
