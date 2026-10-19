/* eintrag-anlegen.js — Einträge zu einer Maschine anlegen/bearbeiten (Ersatz für die alte Historie)
 *
 *   window.openEintragAnlegen(machineId, typ, { dateien, id })
 *     typ: 'phone' (Telefon) | 'note' (Bemerkung) | 'photo' (Fotos) | 'hours' (Betriebsstunden)
 *          | 'wartung' (manuelle Wartung / Reparatur, auch rückwirkend)
 *     id:  vorhandenen Eintrag (manual_history_entries) bearbeiten — Typ ergibt sich aus der Zeile
 *
 * Die manuelle Wartung/Reparatur ist EIN geschlossener Eintrag wie ein Servicebericht: Art(en), Betriebsstunden,
 * Firma/Person, Notiz, Originale (PDF/Foto, files-Eintrag {original:true}) und Fotos. Betriebsstunden legen zusätzlich
 * einen Zähler-Eintrag (type 'hours') zum selben Datum an, damit der Maschinenzähler weiterläuft.
 * Nach dem Speichern lädt die Maschinen-Zentrale neu (window.maschinenZentraleNeuLaden).
 */
(function () {
    'use strict';
    const sb = () => window.supabaseClient;
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const toast = (t, art) => { if (window.showToast) window.showToast(t, art); };
    const MAX_MB = 10;          // Originale / Dokumente
    const MAX_MB_MEDIEN = 25;   // Fotos und Videos
    const ARTEN = ['Motorwartung', 'SBA-Wartung', 'Hydraulikwartung', 'AdBlue-Wartung', 'UVV-Wartung'];
    const TITEL = { phone: 'Telefon', note: 'Bemerkung', photo: 'Fotos / Videos hinzufügen', hours: 'Betriebsstunden eintragen', wartung: 'Manuelle Wartung / Reparatur', generic: 'Eintrag bearbeiten' };
    const groesse = b => b >= 1048576 ? (b / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
    const sauber = n => String(n || 'datei').replace(/[^\w.\-]+/g, '_').replace(/_+/g, '_').slice(-80);
    const istBild = f => /^image\//.test(f.type || '') || /\.(jpe?g|png|gif|webp|heic|bmp)(\?|$)/i.test(f.url || f.name || '');
    const urlVon = f => typeof f === 'string' ? f : (f && f.url) || '';
    const istVideo = f => /^video\//.test((f && f.type) || '') || /\.(mp4|mov|webm|m4v|avi)(\?|$)/i.test((f && (f.name || f.url)) || (typeof f === 'string' ? f : ''));
    const nameVon = f => (f && f.name) || decodeURIComponent((urlVon(f).split('?')[0].split('/').pop() || 'Datei')).replace(/^\d{10,}[-_](\d+[-_])?/, '');
    const heute = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); };
    const marker = () => window.WARTUNG_OHNE_TERMIN || '[ohne Termin]';

    let S = null;   // { mid, typ, id, row, art, neuOrig, neuFotos, bestOrig, bestFotos, entfernt }
    const box = () => document.getElementById('ea-fenster');
    const q = s => box().querySelector(s);

    function dateiOk(f, mb) {
        if (f.size > mb * 1048576) { toast(f.name + ' ist größer als ' + mb + ' MB und wurde übersprungen.', 'error'); return false; }
        return true;
    }
    function neuDazu(liste, dateien, mb) {
        let doppelt = 0;
        [...dateien].forEach(f => {
            if (!dateiOk(f, mb)) return;
            if (liste.some(x => x.name === f.name && x.size === f.size)) { doppelt++; return; }
            liste.push(f);
        });
        if (doppelt) toast(doppelt + ' Datei(en) schon ausgewählt — nicht doppelt aufgenommen.');
    }

    // ------------------------------------------------------------ Formular
    function zone(art, text, accept, klein) {
        return '<label class="upload-zone ea-zone" data-ea-zone="' + art + '"><input type="file" hidden multiple accept="' + accept + '">' +
            '<b>' + esc(text) + '</b> oder <u>auswählen</u><small>' + esc(klein) + '</small></label><div class="ea-liste" data-ea-liste="' + art + '"></div>';
    }
    function formHtml() {
        const t = S.typ, r = S.row || {};
        const zn = window.zaehler ? window.zaehler.namen(S.mid) : ['Betriebsstunden'];
        const datumWert = r.created_at ? String(r.created_at).slice(0, 10) : heute();
        const feld = (name, label, wert, opt) => '<label class="form-label-caps" for="ea-' + name + '">' + esc(label) + '</label>' +
            (opt && opt.area ? '<textarea id="ea-' + name + '" class="glass-input" rows="' + (opt.rows || 3) + '" placeholder="' + esc(opt.ph || '') + '">' + esc(wert || '') + '</textarea>'
                : '<input id="ea-' + name + '" class="glass-input" type="' + ((opt && opt.type) || 'text') + '" value="' + esc(wert || '') + '" placeholder="' + esc((opt && opt.ph) || '') + '"' + (opt && opt.step ? ' step="' + opt.step + '" min="0"' : '') + '>');
        let h = '<div class="ea-zeile">' + feld('datum', 'Datum', datumWert, { type: 'date' }) + '</div>';
        if (t === 'phone') {
            h += feld('titel', 'Gesprächspartner', r.title, { ph: 'Gesprächspartner' }) + feld('inhalt', 'Ergebnis des Telefonats', r.content, { area: 1, rows: 4 });
        } else if (t === 'note') {
            h += feld('titel', 'Titel', r.title, { ph: 'Titel der Bemerkung' }) + feld('inhalt', 'Details', r.content, { area: 1, rows: 5 });
        } else if (t === 'generic') {
            h += feld('titel', 'Titel', r.title) + feld('inhalt', 'Text', r.content, { area: 1, rows: 5 }) + feld('notiz', 'Bemerkung (intern)', r.remark, { area: 1, rows: 2 });
        } else if (t === 'hours') {
            h += '<div class="ea-zeile ea-zwei">' + feld('titel', 'Zähler 1 — Bezeichnung', r.title || zn[0]) + feld('inhalt', 'Stand (h)', r.content, { type: 'number', step: 1, ph: 'z. B. 1234' }) + '</div>' +
                '<div class="ea-zeile ea-zwei">' + feld('sender', 'Zähler 2 (optional) — Bezeichnung', r.sender || (S.id ? '' : zn[1] || ''), { ph: 'z. B. Generatorstunden' }) + feld('recipient', 'Stand (h)', r.recipient, { type: 'number', step: 1 }) + '</div>' +
                '<button type="button" class="knopf knopf--text knopf--klein ea-sammel" data-ea="zaehler">⚙ Stundenzähler dieser Maschine einrichten</button>';
        } else if (t === 'photo') {
            h += feld('titel', 'Beschreibung der Fotos', r.title, { ph: 'z. B. Zustand nach Reparatur' }) + feld('inhalt', 'Text (optional)', r.content, { area: 1, rows: 2 }) +
                '<span class="form-label-caps">Fotos / Videos</span>' + zone('fotos', 'Fotos oder Videos hierher ziehen', 'image/*,video/*', 'Bilder und Videos · max. ' + MAX_MB_MEDIEN + ' MB je Datei');
        } else if (t === 'wartung') {
            const ohne = r.content && String(r.content).includes(marker());
            const gewaehlt = String(r.content || '').split(marker()).join('').split(',').map(x => x.trim());
            h += '<div class="ea-art" role="radiogroup" aria-label="Art des Eintrags"><label><input type="radio" name="ea-art" value="wartung"' + (S.art === 'wartung' ? ' checked' : '') + '> Wartung</label>' +
                '<label><input type="radio" name="ea-art" value="reparatur"' + (S.art === 'reparatur' ? ' checked' : '') + '> Reparatur</label></div>' +
                '<span class="form-label-caps">Was wurde gemacht? (mehrere möglich)</span><div class="ea-arten">' +
                ARTEN.map(a => '<label class="ea-chip"><input type="checkbox" data-ea-art="' + a + '"' + (gewaehlt.includes(a) ? ' checked' : '') + '> ' + a + '</label>').join('') + '</div>' +
                '<div class="ea-zeile ea-zwei">' + feld('firma', 'Durchgeführt von (Firma / Person)', r.sender, { ph: 'z. B. eigene Werkstatt, Firma XY' }) +
                (S.id ? '<div></div>' : '') + '</div>' +
                (S.id ? '' : '<span class="form-label-caps">Betriebsstunden bei dieser Wartung (optional)</span>' +
                    '<div class="ea-zeile ea-zwei">' + feld('z1name', 'Zähler 1 — Bezeichnung', zn[0]) + feld('stunden', 'Stand (h)', '', { type: 'number', step: 1, ph: 'z. B. 1234' }) + '</div>' +
                    '<div class="ea-zeile ea-zwei">' + feld('z2name', 'Zähler 2 (optional) — Bezeichnung', zn[1] || '', { ph: 'z. B. Generatorstunden' }) + feld('stunden2', 'Stand (h)', '', { type: 'number', step: 1 }) + '</div>' +
                    '<button type="button" class="knopf knopf--text knopf--klein ea-sammel" data-ea="zaehler">⚙ Stundenzähler dieser Maschine einrichten</button>') +
                feld('notiz', 'Notiz / was wurde repariert', r.remark, { area: 1, rows: 3, ph: 'Optional' }) +
                '<label class="ea-termin" data-ea-termin><input type="checkbox" id="ea-termin"' + (S.id ? (ohne ? '' : ' checked') : ' checked') + '> <span><b>Nächste Wartung neu setzen</b> (Intervall ab diesem Datum)<small>Ohne Haken bleibt der Termin der nächsten Wartung unverändert — z. B. bei einer reinen Reparatur oder einer alten Wartung.</small></span></label>' +
                '<span class="form-label-caps">Original (Bericht der Firma / unterschrieben)</span>' + zone('orig', 'Originalbericht hierher ziehen', 'application/pdf,image/*,.doc,.docx,.xls,.xlsx', 'PDF, Foto, Word, Excel · max. ' + MAX_MB + ' MB je Datei') +
                '<span class="form-label-caps">Fotos / Videos</span>' + zone('fotos', 'Fotos oder Videos hierher ziehen', 'image/*,video/*', 'Bilder und Videos · max. ' + MAX_MB_MEDIEN + ' MB je Datei') +
                (S.id ? '' : '<button type="button" class="knopf knopf--text knopf--klein ea-sammel" data-ea="sammel">Mehrere alte Wartungen auf einmal nachtragen …</button>');
        }
        return h;
    }

    function listeZeichnen() {
        const orig = q('[data-ea-liste="orig"]'), fotos = q('[data-ea-liste="fotos"]');
        const x = (art, i) => '<button type="button" class="knopf-x" data-ea-weg="' + art + '|' + i + '" aria-label="Entfernen" title="Entfernen">✕</button>';
        const zeile = (name, gr, neu, art, i) => '<div class="ea-datei"><span class="ea-name">📄 ' + esc(name) + '</span>' + (gr ? '<em>' + esc(gr) + '</em>' : '') + (neu ? '<span class="ea-neu">neu</span>' : '') + x(art, i) + '</div>';
        if (orig) {
            orig.innerHTML = S.bestOrig.map((f, i) => zeile(nameVon(f), '', false, 'bo', i)).join('') + S.neuOrig.map((f, i) => zeile(f.name, groesse(f.size), true, 'no', i)).join('');
        }
        if (fotos) {
            const medium = (url, video) => video && window.videoKachelHtml ? window.videoKachelHtml(url, '', true) : '<img src="' + esc(url) + '" alt="">';
            const best = S.bestFotos.map((f, i) => '<div class="ea-thumb">' + medium(urlVon(f), istVideo(f)) + x('bf', i) + '</div>').join('');
            const neu = S.neuFotos.map((f, i) => '<div class="ea-thumb neu">' + medium(URL.createObjectURL(f), istVideo(f)) + x('nf', i) + '</div>').join('');
            fotos.innerHTML = '<div class="ea-thumbs">' + best + neu + '</div>';
        }
    }

    function artUmschalten() {
        const rep = S.art === 'reparatur';
        const t = q('[data-ea-termin]'); if (t) { t.hidden = rep; if (rep) q('#ea-termin').checked = false; else if (!S.id) q('#ea-termin').checked = true; }
    }

    // ------------------------------------------------------------ Fenster
    function bauen() {
        let b = box();
        if (b) b.remove();
        b = document.createElement('div');
        b.id = 'ea-fenster';
        b.className = 'ea-overlay';
        b.innerHTML = '<div class="ea-panel" role="dialog" aria-modal="true">' +
            '<div class="fenster-kopf"><h2>' + esc(TITEL[S.typ] || 'Eintrag') + '</h2><button type="button" class="knopf-x" data-ea="zu" aria-label="Schließen" title="Schließen">✕</button></div>' +
            '<div class="ea-body" data-ea-form>' + formHtml() + '</div>' +
            '<div class="fenster-fuss">' + (S.id ? '<button type="button" class="knopf knopf--gefahr delete-permission-required" data-del-area="historie" data-ea="loeschen">Löschen</button>' : '') +
            '<span class="ea-platz"></span><button type="button" class="knopf knopf--sekundaer" data-ea="zu">Abbrechen</button>' +
            '<button type="button" class="knopf knopf--primaer" data-ea="speichern">' + (S.id ? 'Änderungen speichern' : 'Eintrag speichern') + '</button></div></div>';
        document.body.appendChild(b);
        b.addEventListener('mousedown', e => { if (e.target === b) b.dataset.zuKlick = '1'; });
        b.addEventListener('mouseup', e => { if (e.target === b && b.dataset.zuKlick === '1') schliessen(true); b.dataset.zuKlick = ''; });
        b.addEventListener('click', klick);
        b.addEventListener('change', e => {
            const z = e.target.closest('[data-ea-zone]');
            if (e.target.matches('input[type=file]') && z) { annehmen(z.dataset.eaZone, e.target.files); e.target.value = ''; }
            if (e.target.matches('input[name="ea-art"]')) { S.art = e.target.value; artUmschalten(); }
        });
        ['dragenter', 'dragover'].forEach(ev => b.addEventListener(ev, e => { const z = e.target.closest('[data-ea-zone]'); if (z) { e.preventDefault(); z.classList.add('ueber'); } }));
        b.addEventListener('dragleave', e => { const z = e.target.closest('[data-ea-zone]'); if (z && !z.contains(e.relatedTarget)) z.classList.remove('ueber'); });
        b.addEventListener('drop', e => { const z = e.target.closest('[data-ea-zone]'); if (!z) return; e.preventDefault(); z.classList.remove('ueber'); annehmen(z.dataset.eaZone, e.dataTransfer.files); });
        document.addEventListener('keydown', taste, true);
        listeZeichnen(); artUmschalten();
        if (window.applyDeletePermissions) { try { window.applyDeletePermissions(); } catch (e) { /* egal */ } }
    }
    function taste(e) { if (e.key === 'Escape' && box()) { e.stopPropagation(); e.preventDefault(); schliessen(true); } }
    async function schliessen(fragen) {
        if (fragen && S && S.geaendert && window.appFrage && !(await window.appFrage('Wirklich schließen? Deine Eingaben gehen verloren.'))) return;
        const b = box(); if (b) b.remove();
        document.removeEventListener('keydown', taste, true);
        S = null;
    }
    function annehmen(art, dateien) {
        S.geaendert = true;
        const liste = [...dateien];
        if (art === 'fotos') neuDazu(S.neuFotos, liste.filter(f => /^(image|video)\//.test(f.type) || /\.(jpe?g|png|webp|heic|mp4|mov|webm|m4v)$/i.test(f.name)), MAX_MB_MEDIEN);
        else neuDazu(S.neuOrig, liste, MAX_MB);
        listeZeichnen();
    }

    function klick(e) {
        const a = e.target.closest('[data-ea]');
        const weg = e.target.closest('[data-ea-weg]');
        if (weg) {
            const [art, i] = weg.dataset.eaWeg.split('|'); const n = +i; S.geaendert = true;
            if (art === 'no') S.neuOrig.splice(n, 1);
            else if (art === 'nf') S.neuFotos.splice(n, 1);
            else if (art === 'bo') S.entfernt.push(S.bestOrig.splice(n, 1)[0]);
            else if (art === 'bf') S.entfernt.push(S.bestFotos.splice(n, 1)[0]);
            listeZeichnen(); return;
        }
        if (!a) return;
        if (a.dataset.ea === 'zu') schliessen(true);
        else if (a.dataset.ea === 'speichern') speichern(a);
        else if (a.dataset.ea === 'loeschen') loeschen();
        else if (a.dataset.ea === 'zaehler') { if (window.zaehler) window.zaehler.einrichten(S.mid); }
        else if (a.dataset.ea === 'sammel') { const mid = S.mid; schliessen(false); if (window.openWartungImport) window.openWartungImport(mid); }
    }
    document.addEventListener('input', e => { if (S && box() && box().contains(e.target)) S.geaendert = true; });
    document.addEventListener('zaehler:geaendert', () => {
        if (!S || !box() || !window.zaehler) return;
        const n = window.zaehler.namen(S.mid);
        const setze = (id, v) => { const el = box().querySelector('#ea-' + id); if (el) el.value = v; };
        if (S.typ === 'hours') { setze('titel', n[0]); setze('sender', n[1] || ''); }
        if (S.typ === 'wartung') { setze('z1name', n[0]); setze('z2name', n[1] || ''); }
    });

    // ------------------------------------------------------------ Speichern
    function r2Pfad(url) {
        const basis = (window.R2_PUBLIC_URL || 'https://pub-28aab7dd73f540f38b6358d78f889a27.r2.dev') + '/';
        try { if (url.startsWith(basis)) return decodeURIComponent(url.slice(basis.length)); const u = new URL(url); if (/r2\.dev|cloudflarestorage\.com/.test(u.hostname)) return decodeURIComponent(u.pathname.slice(1)); } catch (e) { /* ignorieren */ }
        return null;
    }
    // Wird die Datei noch von einem anderen Eintrag der Historie benutzt? Dann bleibt sie liegen.
    async function nochBenutzt(url, ohneId) {
        try {
            for (const probe of [[url], [{ url }]]) {
                let q = sb().from('manual_history_entries').select('id').filter('files', 'cs', JSON.stringify(probe)).limit(1);
                if (ohneId) q = q.neq('id', ohneId);
                const { data } = await q;
                if (data && data.length) return true;
            }
        } catch (e) { /* im Zweifel behalten */ return true; }
        return false;
    }
    async function ausSpeicher(urls, ohneId) {
        for (const u of urls) {
            if (u && await nochBenutzt(u, ohneId)) { console.info('Datei bleibt, wird noch benutzt:', u); continue; }
            const p = u && r2Pfad(u);
            if (p && window.FileUploadService) {
                try { await window.FileUploadService.deleteFile(p, { provider: 'cloudflare-r2' }); } catch (err) { console.warn('Datei blieb im Speicher:', p, err); }
                // Zeile im Foto-Eingang (falls das Foto von dort kam) mit entfernen — die Datei gibt es nicht mehr
                try { await sb().from('foto_eingang').delete().eq('pfad', p); } catch (err) { /* egal */ }
            }
        }
    }
    async function hochladen(dateien, unterordner, komprimieren) {
        if (!dateien.length) return [];
        const m = window.machineById ? window.machineById(S.mid) : (window.machineList || []).find(x => String(x.id) === String(S.mid));
        const ordner = m && window.getMachineFolderName ? window.getMachineFolderName(m.id, m.manufacturer, m.name, m.serial || m.serial_number, m.year) : 'Maschinen/' + S.mid;
        // Nichts doppelt: gleiche Datei nicht noch einmal hochladen (photo-dedupe.js)
        let liste = dateien;
        if (window.PhotoDedupe) {
            const g = await window.PhotoDedupe.pruefeAuswahl(dateien, []);
            liste = g.neu.map(x => x.file);
        }
        return window.FileUploadService.uploadFiles(liste,
            (f, i) => ordner + '/' + unterordner + '/' + Date.now() + '-' + i + '-' + sauber(f.name),
            { bucket: 'dateien', compress: komprimieren, concurrency: 3, provider: 'cloudflare-r2' });
    }
    const wert = id => { const el = q('#ea-' + id); return el ? el.value : ''; };

    async function speichern(knopf) {
        const typ = S.typ;
        const datum = wert('datum');
        const jetzt = new Date();
        let wann = null;
        if (datum) { const d = new Date(datum + 'T12:00:00'); if (d.toDateString() === jetzt.toDateString()) d.setHours(jetzt.getHours(), jetzt.getMinutes(), jetzt.getSeconds()); wann = d.toISOString(); }
        let zeile = { type: typ === 'generic' ? S.row.type : typ, title: wert('titel').trim(), content: wert('inhalt'), remark: null, sender: null, recipient: null, files: Array.isArray(S.row && S.row.files) ? S.row.files : [] };
        let stunden = '', stunden2 = '';

        if (typ === 'phone' || typ === 'note') {
            if (!zeile.title) { toast('Bitte einen Titel / Gesprächspartner eingeben.'); return; }
        } else if (typ === 'generic') {
            zeile.remark = wert('notiz') || null; zeile.sender = S.row.sender || null; zeile.recipient = S.row.recipient || null;
            if (!zeile.title) { toast('Bitte einen Titel eingeben.'); return; }
        } else if (typ === 'hours') {
            zeile.title = zeile.title || 'Betriebsstunden';
            if (!String(zeile.content).trim()) { toast('Bitte den Stand der Betriebsstunden eingeben.'); return; }
            zeile.recipient = wert('recipient') || null;
            zeile.sender = zeile.recipient ? (wert('sender') || 'Zähler 2') : null;
            zeile.files = [];
        } else if (typ === 'photo') {
            if (!S.neuFotos.length && !S.bestFotos.length) { toast('Bitte mindestens ein Foto oder Video auswählen.'); return; }
            zeile.title = zeile.title || 'Fotos';
        } else if (typ === 'wartung') {
            const arten = [...box().querySelectorAll('[data-ea-art]:checked')].map(c => c.dataset.eaArt);
            const rep = S.art === 'reparatur';
            if (!arten.length && !(rep && wert('notiz').trim())) { toast(rep ? 'Bitte eine Art ankreuzen oder beschreiben, was repariert wurde.' : 'Bitte mindestens eine Wartungsart ankreuzen.'); return; }
            const ohneTermin = rep || !q('#ea-termin').checked;
            zeile.title = rep ? 'Reparatur' : 'Wartung';
            zeile.content = (arten.join(', ') + (ohneTermin ? ' ' + marker() : '')).trim();
            zeile.remark = wert('notiz').trim() || null;
            zeile.sender = wert('firma').trim() || null;
            stunden = String(wert('stunden') || '').trim();
            stunden2 = String(wert('stunden2') || '').trim();
        }

        knopf.disabled = true; const alt = knopf.textContent; knopf.textContent = 'Speichert …';
        try {
            if (typ === 'photo') {
                const neu = await hochladen(S.neuFotos, 'Verlauf', true);
                zeile.files = S.bestFotos.concat(neu.map(r => r.url));
            } else if (typ === 'wartung') {
                const orig = await hochladen(S.neuOrig, 'Wartung', false);
                const fotos = await hochladen(S.neuFotos, 'Verlauf', true);
                zeile.files = S.bestOrig.concat(S.bestFotos)
                    .concat(orig.map(r => ({ url: r.url, type: r.type, name: r.name, original: true })))
                    .concat(fotos.map(r => ({ url: r.url, type: r.type, name: r.name })));
            }
            if (wann) zeile.created_at = wann;
            if (S.id) {
                zeile.updated_at = new Date();
                const { error } = await sb().from('manual_history_entries').update(zeile).eq('id', S.id);
                if (error) throw error;
                if (typ === 'wartung' || typ === 'photo') await ausSpeicher(S.entfernt.map(urlVon), S.id);
            } else {
                zeile.machine_id = S.mid; zeile.created_by = window.activeUser && window.activeUser.id;
                const zeilen = [zeile];
                if (typ === 'wartung' && (stunden || stunden2)) zeilen.push({ machine_id: S.mid, type: 'hours', title: wert('z1name').trim() || 'Betriebsstunden', content: stunden || '', sender: stunden2 ? (wert('z2name').trim() || 'Zähler 2') : null, recipient: stunden2 || null, created_at: wann || undefined, created_by: zeile.created_by, files: [] });
                const { error } = await sb().from('manual_history_entries').insert(zeilen);
                if (error) throw error;
            }
            if (typ === 'wartung' && window.recalculateMachineMaintenanceFromHistory) await window.recalculateMachineMaintenanceFromHistory(S.mid);
            // Zweiten Zähler benannt und noch nicht eingerichtet? Dann merken: ab jetzt überall vorbelegt.
            if (!S.id && window.zaehler) {
                const n1 = (typ === 'hours' ? zeile.title : wert('z1name')).trim(), n2 = (typ === 'hours' ? (zeile.sender || '') : (stunden2 ? wert('z2name') : '')).trim();
                if (n2 && window.zaehler.namen(S.mid).length < 2) { try { await window.zaehler.speichern(S.mid, [n1 || 'Betriebsstunden', n2]); } catch (e) { console.warn('Zähler merken:', e); } }
            }
            const mid = S.mid;
            toast(S.id ? 'Änderungen gespeichert' : 'Eintrag gespeichert', 'success');
            await schliessen(false);
            if (window.maschinenZentraleNeuLaden) window.maschinenZentraleNeuLaden(mid);
            document.dispatchEvent(new CustomEvent('addressbook:changed'));
        } catch (err) {
            console.error('Eintrag speichern:', err);
            toast('Speichern fehlgeschlagen: ' + (err.message || err), 'error');
            knopf.disabled = false; knopf.textContent = alt;
        }
    }

    async function loeschen() {
        if (typeof window.canDelete === 'function' && !window.canDelete('Historien-Einträgen')) return;
        if (!(window.appFrage ? await window.appFrage('Soll dieser Eintrag wirklich gelöscht werden?', { gefahr: true, ja: 'Löschen' }) : confirm('Soll dieser Eintrag wirklich gelöscht werden?'))) return;
        try {
            const typ = S.row.type, mid = S.mid;
            const dateien = (S.row.files || []).map(urlVon).filter(Boolean);
            const { error } = await sb().from('manual_history_entries').delete().eq('id', S.id);
            if (error) throw error;
            // erst nach dem Löschen der Zeile: Originale und Fotos sofort aus dem Speicher (R2) entfernen
            await ausSpeicher(dateien, null);
            if (typ === 'wartung' && window.recalculateMachineMaintenanceFromHistory) await window.recalculateMachineMaintenanceFromHistory(mid);
            toast('Eintrag gelöscht', 'success');
            await schliessen(false);
            if (window.maschinenZentraleNeuLaden) window.maschinenZentraleNeuLaden(mid);
        } catch (err) { console.error('Eintrag löschen:', err); toast('Löschen fehlgeschlagen: ' + (err.message || err), 'error'); }
    }

    // ------------------------------------------------------------ Einstieg
    window.openEintragAnlegen = async function (machineId, typ, opt) {
        opt = opt || {};
        S = { mid: machineId, typ, id: opt.id || null, row: null, art: 'wartung', neuOrig: [], neuFotos: [], bestOrig: [], bestFotos: [], entfernt: [], geaendert: false };
        if (S.id) {
            const { data, error } = await sb().from('manual_history_entries').select('*').eq('id', S.id).single();
            if (error || !data) { toast('Eintrag konnte nicht geladen werden.', 'error'); S = null; return; }
            S.row = data; S.mid = data.machine_id || machineId;
            S.typ = ['phone', 'note', 'hours', 'photo', 'wartung'].includes(data.type) ? data.type : 'generic';
            const dateien = (Array.isArray(data.files) ? data.files : []).map(f => typeof f === 'string' ? { url: f } : f).filter(f => f && f.url);
            if (S.typ === 'wartung') {
                S.art = /reparatur/i.test(data.title || '') ? 'reparatur' : 'wartung';
                S.bestOrig = dateien.filter(f => f.original || (!istBild(f) && !istVideo(f)));
                S.bestFotos = dateien.filter(f => !(f.original || (!istBild(f) && !istVideo(f))));
            } else if (S.typ === 'photo') S.bestFotos = (Array.isArray(data.files) ? data.files : []).filter(f => urlVon(f));
        }
        bauen();
        if (opt.dateien && opt.dateien.length) annehmen(S.typ === 'wartung' && !opt.alsFotos ? 'orig' : 'fotos', opt.dateien);
        S.geaendert = !!(opt.dateien && opt.dateien.length);
        const erstes = box().querySelector('input:not([type=hidden]):not([type=file]):not([type=radio]):not([type=checkbox]), textarea');
        if (erstes) setTimeout(() => erstes.focus(), 50);
    };
})();
