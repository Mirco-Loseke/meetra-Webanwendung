/* medien-ablage.js
 * 1) Video-Vorschau: Standbild + Dauer unten rechts, Klick spielt im Overlay ab.
 *    window.medienArt(f) → 'bild' | 'video' | 'dok' | null
 *    window.videoKachelHtml(url, klasse?) → Kachel-Markup
 * 2) Reiter „Ablage" an der Adresse: Dokumente / Fotos / Videos, nach Datum
 *    gruppiert mit Überschrift. Hochladen → manual_history_entries mit customer_id.
 *    window.adressAblageHtml(detail, customerId)  (aufgerufen aus addressbook.js)
 */
(function () {
    'use strict';

    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const RE_BILD = /\.(jpe?g|png|gif|webp|heic|avif|bmp)$/i;
    const RE_VIDEO = /\.(mp4|mov|m4v|webm|3gp|ogv|avi|mkv)$/i;

    function dateiUrl(f) { return typeof f === 'string' ? f : (f && f.url) || null; }
    function dateiName(f) {
        const u = dateiUrl(f) || '';
        if (f && typeof f === 'object' && f.name) return f.name;
        try { return decodeURIComponent(u.split('?')[0].split('/').pop() || 'Datei').replace(/^\d{10,}[-_](\d+-)?/, ''); } catch (e) { return 'Datei'; }
    }

    function medienArt(f) {
        const url = dateiUrl(f);
        if (!url) return null;
        const typ = (f && typeof f === 'object' && f.type) || '';
        const pfad = url.split('?')[0].split('#')[0];
        if (/^video\//.test(typ) || RE_VIDEO.test(pfad)) return 'video';
        if (/^image\//.test(typ) || RE_BILD.test(pfad)) return 'bild';
        return 'dok';
    }
    window.medienArt = medienArt;

    // ohneKlick: nur Vorschau (z. B. Foto-Eingang, dort wählt ein Klick aus)
    function videoKachelHtml(url, klasse, ohneKlick) {
        return (ohneKlick ? '<span class="mv-video' : '<button type="button" class="mv-video') + (klasse ? ' ' + klasse : '') + '"' + (ohneKlick ? '>' : ' data-mv-video="' + esc(url) + '" title="Video abspielen">') +
            '<video preload="none" muted playsinline data-lazy-src="' + esc(url) + '#t=0.1"></video>' +
            '<span class="mv-play" aria-hidden="true">▶</span><span class="mv-dauer"></span>' + (ohneKlick ? '</span>' : '</button>');
    }
    window.videoKachelHtml = videoKachelHtml;

    // Videos erst laden, wenn die Kachel (fast) im Sichtfeld ist
    const videoBeob = typeof IntersectionObserver === 'function' ? new IntersectionObserver(eintraege => {
        eintraege.forEach(en => {
            if (!en.isIntersecting) return;
            const v = en.target;
            videoBeob.unobserve(v);
            if (v.dataset.lazySrc) { v.preload = 'metadata'; v.src = v.dataset.lazySrc; delete v.dataset.lazySrc; }
        });
    }, { rootMargin: '300px' }) : null;
    function videosPruefen() {
        document.querySelectorAll('video[data-lazy-src]:not([data-beob])').forEach(v => {
            v.setAttribute('data-beob', '1');
            if (videoBeob) videoBeob.observe(v);
            else { v.src = v.dataset.lazySrc; }
        });
    }
    new MutationObserver(videosPruefen).observe(document.documentElement, { childList: true, subtree: true });
    videosPruefen();

    // Bilder, die wegen eines Netzwackelns nicht kamen: bis zu 2 weitere Versuche
    document.addEventListener('error', e => {
        const im = e.target;
        if (!(im instanceof HTMLImageElement) || !im.classList.contains('ab-ablage-bild')) return;
        const n = Number(im.dataset.versuch || 0);
        if (n >= 2) { im.classList.add('ab-fehler'); return; }
        im.dataset.versuch = n + 1;
        const basis = im.dataset.orig || (im.dataset.orig = im.getAttribute('src'));
        setTimeout(() => { im.src = basis + (basis.includes('?') ? '&' : '?') + 'r=' + Date.now(); }, 1500 * (n + 1));
    }, true);

    function dauerText(s) {
        if (!isFinite(s) || s <= 0) return '';
        s = Math.round(s);
        const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sek = s % 60;
        return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(sek).padStart(2, '0');
    }

    // loadedmetadata blubbert nicht → im Capture abfangen, gilt für jede Kachel überall.
    document.addEventListener('loadedmetadata', e => {
        const v = e.target;
        if (!(v instanceof HTMLVideoElement)) return;
        const k = v.closest('.mv-video');
        const d = k && k.querySelector('.mv-dauer');
        if (d) d.textContent = dauerText(v.duration);
    }, true);
    document.addEventListener('error', e => {
        const v = e.target;
        if (v instanceof HTMLVideoElement && v.closest('.mv-video')) v.closest('.mv-video').classList.add('mv-fehler');
    }, true);

    function videoAbspielen(url) {
        let o = document.getElementById('mv-player');
        if (o) o.remove();
        o = document.createElement('div');
        o.id = 'mv-player';
        o.innerHTML = '<div class="mv-player-box"><video controls autoplay playsinline src="' + esc(url) + '"></video>' +
            '<div class="mv-player-leiste"><a href="' + esc(url) + '" target="_blank" rel="noopener" download>Herunterladen</a>' +
            '<button type="button" data-mv-zu>Schließen</button></div></div>';
        document.body.appendChild(o);
        const zu = () => { o.remove(); document.removeEventListener('keydown', esc_); };
        const esc_ = ev => { if (ev.key === 'Escape') zu(); };
        o.addEventListener('click', ev => { if (ev.target === o || ev.target.closest('[data-mv-zu]')) zu(); });
        document.addEventListener('keydown', esc_);
    }
    window.videoAbspielen = videoAbspielen;

    document.addEventListener('click', e => {
        const k = e.target.closest('[data-mv-video]');
        if (!k) return;
        e.preventDefault(); e.stopPropagation();
        videoAbspielen(k.getAttribute('data-mv-video'));
    }, true);

    /* ---------- Reiter „Ablage" an der Adresse ---------- */

    const S = { art: 'bild' };
    try { S.art = localStorage.getItem('meetra_ablage_art') || 'bild'; } catch (e) { /* egal */ }
    const ARTEN = [
        { key: 'dok', label: 'Dokumente', icon: '📄' },
        { key: 'bild', label: 'Fotos', icon: '🖼️' },
        { key: 'video', label: 'Videos', icon: '🎬' }
    ];

    function sammeln(detail) {
        const posten = [];   // { url, name, art, datum, titel, quelle }
        const gesehen = new Set();
        const rein = (f, datum, titel, quelle, eid) => {
            const url = dateiUrl(f);
            if (!url || gesehen.has(url)) return;
            gesehen.add(url);
            posten.push({ url, name: dateiName(f), art: medienArt(f), datum: datum || '', titel: titel || '', quelle: quelle || '', typ: (f && f.type) || '', eid: eid || null });
        };
        (detail.machineHistoryEntries || []).forEach(e => {
            const files = Array.isArray(e.files) ? e.files : [];
            let quelle = '';
            if (e.machine_id && typeof window.getMachineName === 'function') quelle = window.getMachineName(e.machine_id) || '';
            const titel = e.title || (e._sourceTable === 'service_entries' ? 'Servicebericht' : 'Eintrag');
            const bearb = e._sourceTable === 'manual' ? e.id : null;   // nur eigene Ablage-Einträge sind änderbar
            files.forEach(f => rein(f, e.entry_date || e.created_at, titel, quelle, bearb));
            // Servicebericht: das PDF zählt auch dann, wenn zusätzlich Fotos/Dateien dranhängen
            if (e.rawService && e.rawService.pdf_url) rein({ url: e.rawService.pdf_url, name: titel + '.pdf', type: 'application/pdf' }, e.entry_date || e.created_at, titel, quelle);
        });
        (detail.processes || []).forEach(p => {
            (Array.isArray(p.attachments) ? p.attachments : []).forEach(f => rein(f, f.at || p.process_date || p.created_at, p.title ? 'Vorgang: ' + p.title : 'Vorgang', ''));
        });
        return posten;
    }

    function tagSchluessel(d) {
        const x = d ? new Date(d) : null;
        return x && !isNaN(x) ? x.toISOString().slice(0, 10) : '0000-00-00';
    }
    function tagText(k) {
        if (k === '0000-00-00') return 'Ohne Datum';
        return new Date(k + 'T12:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }

    function zieh(p) { return p.eid ? ' draggable="true" data-ab-url="' + esc(p.url) + '" data-ab-eid="' + esc(p.eid) + '"' : ''; }

    const LIMIT = 30;
    function postenHtml(p, alleBilder, gi) {
        if (p.art === 'video') return '<div class="ab-ablage-item"' + zieh(p) + '>' + videoKachelHtml(p.url) + '<span class="ab-ablage-name">' + esc(p.name) + '</span></div>';
        if (p.art === 'bild') {
            const grp = gi != null && window.__ablageGruppen && window.__ablageGruppen[gi];
            const idx = grp ? grp.urls.indexOf(p.url) : alleBilder.indexOf(p.url);
            return '<div class="ab-ablage-item"' + zieh(p) + '><img draggable="false" class="ab-ablage-bild" src="' + esc(p.url) + '" loading="lazy" alt="" data-ablage-bild="' + idx + '"' + (grp ? ' data-ablage-gruppe="' + gi + '"' : '') + ' title="Bild vergrößern"></div>';
        }
        const typ = /\.pdf$/i.test(p.url.split('?')[0]) ? 'application/pdf' : p.typ;
        return '<button type="button" class="ab-ablage-dok"' + zieh(p) + ' data-dok-url="' + esc(p.url) + '" data-dok-name="' + esc(p.name) + '" data-dok-typ="' + esc(typ) + '">📄 <span>' + esc(p.name) + '</span></button>';
    }

    window.adressAblageHtml = function (detail, customerId) {
        const alle = sammeln(detail || {});
        const zahl = k => alle.filter(p => p.art === k).length;
        const liste = alle.filter(p => p.art === S.art);
        const alleBilder = liste.filter(p => p.art === 'bild').map(p => p.url);
        window.__ablageBilder = alleBilder;
        window.__ablageGruppen = [];

        // Tag → Überschrift (Eintragstitel) → Dateien
        const tage = new Map();
        liste.slice().sort((a, b) => String(b.datum).localeCompare(String(a.datum))).forEach(p => {
            const t = tagSchluessel(p.datum);
            if (!tage.has(t)) tage.set(t, new Map());
            const kopf = p.titel + (p.quelle ? ' · ' + p.quelle : '');
            const g = tage.get(t);
            if (!g.has(kopf)) g.set(kopf, []);
            g.get(kopf).push(p);
        });

        const reiter = ARTEN.map(a => '<button type="button" class="ab-ablage-reiter' + (S.art === a.key ? ' active' : '') + '" data-ablage-art="' + a.key + '">' +
            a.icon + ' ' + a.label + ' <span class="ab-tab-count">' + zahl(a.key) + '</span></button>').join('');

        let inhalt = '';
        if (!liste.length) inhalt = '<div class="ab-ablage-leer"><b>Hierhin ziehen zum Hochladen</b><span>Fotos, Videos und Dokumente werden automatisch richtig einsortiert</span></div>';
        tage.forEach((gruppen, tag) => {
            inhalt += '<section class="ab-ablage-tag"><h4 class="ab-ablage-datum">' + esc(tagText(tag)) + '</h4>';
            gruppen.forEach((posten, kopf) => {
                // Jede Gruppe (Tag + Überschrift) öffnet nur ihre eigenen Bilder, mit Titel und Datum
                const eids = [...new Set(posten.map(p => p.eid).filter(Boolean))];
                const gi = window.__ablageGruppen.push({ urls: posten.filter(p => p.art === 'bild').map(p => p.url), titel: [kopf, tagText(tag)].filter(Boolean).join(' · '), roh: posten[0].titel, datum: tag === '0000-00-00' ? '' : tag, eids, posten: posten.map(p => ({ url: p.url, name: p.name, art: p.art, eid: p.eid })) }) - 1;
                inhalt += '<div class="ab-ablage-gruppe" data-ablage-gi="' + gi + '">' + (kopf ? (eids.length ? '<button type="button" class="ab-ablage-kopf ab-ablage-kopf-edit" data-ablage-edit="' + gi + '" title="Überschrift ändern, Dateien entfernen oder hinzufügen">' + esc(kopf) + ' <span class="ab-ablage-stift">✎</span></button>' : '<div class="ab-ablage-kopf">' + esc(kopf) + '</div>') : '') +
                    '<div class="ab-ablage-raster' + (S.art === 'dok' ? ' ab-ablage-raster-dok' : '') + '">' + posten.map((p, i) => { const h = postenHtml(p, alleBilder, gi); return i >= LIMIT ? h.replace(/^<(div|button)/, '<$1 hidden data-ab-mehr') : h; }).join('') + '</div>' +
                    (posten.length > LIMIT ? '<button type="button" class="knopf knopf--text knopf--klein" data-ablage-mehr>Weitere ' + (posten.length - LIMIT) + ' anzeigen</button>' : '') + '</div>';
            });
            inhalt += '</section>';
        });

        if (liste.length) inhalt += '<div class="ab-ablage-neu" data-ablage-neu><b>＋ Neue Gruppe</b><span>Datei hierher ziehen, um eine neue Gruppe zu starten (z. B. „Motorfehler November“)</span></div>';

        return '<div class="ab-ablage" data-ablage-kunde="' + esc(customerId) + '">' +
            '<div class="ab-ablage-leiste"><div class="ab-ablage-reiterleiste">' + reiter + '</div>' +
            '<button type="button" class="ab-btn ab-btn-primary" data-ablage-hoch>＋ Hochladen</button>' +
            '<input type="file" multiple hidden data-ablage-datei accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip,.msg,.eml"></div>' +
            '<div class="ab-ablage-drop"><div class="ab-ablage-inhalt">' + inhalt + '</div></div></div>';
    };
    window.adressAblageAnzahl = detail => sammeln(detail || {}).length;

    function sicherName(n) { return String(n || 'datei').replace(/[^\w.\-]+/g, '_').slice(-80); }

    async function hochladen(kundeId, dateien, knopf) {
        // Fotos, Videos und Dokumente: höchstens 25 MB je Datei
        const zuGross = dateien.filter(f => f.size > 25 * 1048576);
        if (zuGross.length && window.showToast) window.showToast(zuGross.map(f => f.name).join(', ') + (zuGross.length === 1 ? ' ist' : ' sind') + ' größer als 25 MB und wurde(n) übersprungen.', 'error');
        dateien = dateien.filter(f => f.size <= 25 * 1048576);
        if (!dateien.length) return;
        const titel = await window.appEingabe('Überschrift für diese Ablage:', dateien.length === 1 ? dateien[0].name.replace(/\.\w+$/, '') : 'Ablage');
        if (titel === null) return;
        const alt = knopf.textContent;
        knopf.disabled = true;
        try {
            const files = [];
            for (let i = 0; i < dateien.length; i++) {
                const f = dateien[i];
                knopf.textContent = 'Lädt ' + (i + 1) + '/' + dateien.length + ' …';
                const res = await window.FileUploadService.uploadFile(f, {
                    path: 'adressen/' + kundeId + '/ablage/' + Date.now() + '-' + i + '-' + sicherName(f.name),
                    provider: 'cloudflare-r2',
                    compress: false
                });
                files.push({ url: res.url, name: f.name, type: res.type || f.type || (RE_VIDEO.test(f.name) ? 'video/mp4' : RE_BILD.test(f.name) ? 'image/jpeg' : '') });
            }
            // Je Art ein eigener Eintrag — so landet alles im richtigen Reiter,
            // egal in welchem man gerade steht (Foto/Video → type photo, Rest → note).
            const jeArt = { bild: [], video: [], dok: [] };
            files.forEach(f => jeArt[medienArt(f) || 'dok'].push(f));
            const zeilen = [];
            Object.keys(jeArt).forEach(art => {
                if (!jeArt[art].length) return;
                const zusatz = Object.values(jeArt).filter(l => l.length).length > 1 ? ' (' + ARTEN.find(x => x.key === art).label + ')' : '';
                zeilen.push({ type: art === 'dok' ? 'note' : 'photo', title: (titel.trim() || 'Ablage') + zusatz, files: jeArt[art],
                    customer_id: kundeId, created_by: (window.activeUser && window.activeUser.id) || null });
            });
            const { error } = await window.supabaseClient.from('manual_history_entries').insert(zeilen);
            if (error) throw error;
            // Reiter mit den meisten neuen Dateien öffnen
            const haupt = Object.keys(jeArt).sort((x, y) => jeArt[y].length - jeArt[x].length)[0];
            S.art = haupt;
            try { localStorage.setItem('meetra_ablage_art', S.art); } catch (er) { /* egal */ }
            if (window.showToast) window.showToast(files.length + (files.length === 1 ? ' Datei' : ' Dateien') + ' abgelegt', 'success');
            if (window.refreshAddressDetail) await window.refreshAddressDetail();
        } catch (e) {
            console.error('Ablage: Hochladen fehlgeschlagen', e);
            alert('Hochladen fehlgeschlagen: ' + (e.message || e));
        } finally {
            knopf.disabled = false; knopf.textContent = alt;
        }
    }

    document.addEventListener('click', e => {
        const box = e.target.closest('.ab-ablage');
        if (!box) return;
        const r = e.target.closest('[data-ablage-art]');
        if (r) {
            S.art = r.getAttribute('data-ablage-art');
            try { localStorage.setItem('meetra_ablage_art', S.art); } catch (er) { /* egal */ }
            if (window.refreshAddressDetailAnsicht) window.refreshAddressDetailAnsicht();
            return;
        }
        const mehr = e.target.closest('[data-ablage-mehr]');
        if (mehr) { mehr.parentElement.querySelectorAll('[data-ab-mehr]').forEach(x => { x.hidden = false; x.removeAttribute('data-ab-mehr'); }); mehr.remove(); return; }
        const ed = e.target.closest('[data-ablage-edit]');
        if (ed) { gruppeBearbeiten(Number(ed.getAttribute('data-ablage-edit')), box.getAttribute('data-ablage-kunde')); return; }
        if (e.target.closest('[data-ablage-hoch]')) { box.querySelector('[data-ablage-datei]').click(); return; }
        const b = e.target.closest('[data-ablage-bild]');
        if (b && window.openPhotosLightbox) {
            const grp = (window.__ablageGruppen || [])[Number(b.getAttribute('data-ablage-gruppe'))];
            if (grp) window.openPhotosLightbox(grp.urls, Math.max(0, Number(b.getAttribute('data-ablage-bild')) || 0), { titel: grp.titel, namen: [] });
            else window.openPhotosLightbox(window.__ablageBilder || [], Number(b.getAttribute('data-ablage-bild')) || 0);
            return;
        }
        const d = e.target.closest('[data-dok-url]');
        if (d) {
            if (window.previewDocument) window.previewDocument(d.dataset.dokUrl, d.dataset.dokName, d.dataset.dokTyp);
            else window.open(d.dataset.dokUrl, '_blank');
        }
    });
    // Drag & Drop auf die ganze Ablage — egal in welchem Reiter
    const dateienDrag = ev => ev.dataTransfer && [...(ev.dataTransfer.types || [])].includes('Files');
    document.addEventListener('dragover', e => {
        const box = e.target.closest && e.target.closest('.ab-ablage');
        if (!box || !dateienDrag(e)) return;
        e.preventDefault();
        box.classList.add('ab-ablage-ueber');
    });
    document.addEventListener('dragleave', e => {
        const box = e.target.closest && e.target.closest('.ab-ablage');
        if (box && !box.contains(e.relatedTarget)) box.classList.remove('ab-ablage-ueber');
    });
    document.addEventListener('drop', e => {
        const box = e.target.closest && e.target.closest('.ab-ablage');
        if (!box || !dateienDrag(e)) return;
        e.preventDefault();
        box.classList.remove('ab-ablage-ueber');
        hochladen(box.getAttribute('data-ablage-kunde'), Array.from(e.dataTransfer.files || []), box.querySelector('[data-ablage-hoch]'));
    });
    document.addEventListener('change', e => {
        const inp = e.target.closest && e.target.closest('[data-ablage-datei]');
        if (!inp) return;
        const box = inp.closest('.ab-ablage');
        hochladen(box.getAttribute('data-ablage-kunde'), Array.from(inp.files || []), box.querySelector('[data-ablage-hoch]'));
        inp.value = '';
    });

    // Dateien direkt auf den Reiter ziehen
    document.addEventListener('dragover', e => { if (e.target.closest && e.target.closest('.ab-ablage')) e.preventDefault(); });
    document.addEventListener('drop', e => {
        const box = e.target.closest && e.target.closest('.ab-ablage');
        if (!box || !e.dataTransfer || !e.dataTransfer.files.length) return;
        e.preventDefault();
        hochladen(box.getAttribute('data-ablage-kunde'), Array.from(e.dataTransfer.files), box.querySelector('[data-ablage-hoch]'));
    });
    /* ---------- Ablage bearbeiten: Dateien verschieben, Überschrift ändern, Dateien entfernen ---------- */
    const sb = () => window.supabaseClient;
    const urlVon = f => (typeof f === 'string' ? f : (f && f.url) || '');
    const TABELLE = 'manual_history_entries';

    function r2Pfad(url) {
        const basis = (window.R2_PUBLIC_URL || 'https://pub-28aab7dd73f540f38b6358d78f889a27.r2.dev') + '/';
        try { if (url.startsWith(basis)) return decodeURIComponent(url.slice(basis.length)); const u = new URL(url); if (/r2\.dev|cloudflarestorage\.com/.test(u.hostname)) return decodeURIComponent(u.pathname.slice(1)); } catch (e) { /* ignorieren */ }
        return null;
    }
    async function eintragHolen(id) {
        const { data, error } = await sb().from(TABELLE).select('*').eq('id', id).maybeSingle();
        if (error) throw error;
        return data;
    }
    async function dateienSetzen(id, files) {
        const { error } = await sb().from(TABELLE).update({ files }).eq('id', id);
        if (error) throw error;
    }
    function hatText(e) { return !!(e && (e.content || e.description || e.notes || e.text || '').toString().trim()); }
    async function nochBenutzt(url) {
        try {
            for (const probe of [[url], [{ url }]]) {
                const { data } = await sb().from(TABELLE).select('id').filter('files', 'cs', JSON.stringify(probe)).limit(1);
                if (data && data.length) return true;
            }
        } catch (er) { return true; }   // im Zweifel behalten
        return false;
    }
    async function ausSpeicherLoeschen(url) {
        if (await nochBenutzt(url)) return false;
        const pfad = r2Pfad(url);
        if (!pfad || !window.FileUploadService) return false;
        await window.FileUploadService.deleteFile(pfad, { bucket: 'dateien', provider: 'cloudflare-r2' });
        try { await sb().from('foto_eingang').delete().eq('pfad', pfad); } catch (er) { /* egal */ }
        return true;
    }
    // Eintrag ohne Dateien und ohne Text bleibt nicht als leere Hülle stehen.
    async function leereHuelleEntfernen(e, rest) {
        if (!e) return false;
        if (!rest.length && !hatText(e) && (e.type === 'photo' || e.type === 'note')) {
            await sb().from(TABELLE).delete().eq('id', e.id);
            return true;
        }
        return false;
    }

    async function dateiVerschieben(url, vonId, nachId) {
        if (!vonId || !nachId || String(vonId) === String(nachId)) return false;
        const von = await eintragHolen(vonId), nach = await eintragHolen(nachId);
        if (!von || !nach) throw new Error('Eintrag nicht gefunden');
        const vonDateien = Array.isArray(von.files) ? von.files : [];
        const obj = vonDateien.find(f => urlVon(f) === url);
        if (!obj) return false;
        const nachDateien = Array.isArray(nach.files) ? nach.files : [];
        await dateienSetzen(nachId, nachDateien.concat([obj]));          // erst ablegen …
        const rest = vonDateien.filter(f => urlVon(f) !== url);
        if (!(await leereHuelleEntfernen(von, rest))) await dateienSetzen(vonId, rest);   // … dann entfernen
        return true;
    }

    async function dateiInNeueGruppe(url, vonId, titel, kundeId, iso) {
        const von = await eintragHolen(vonId);
        if (!von) throw new Error('Eintrag nicht gefunden');
        const vonDateien = Array.isArray(von.files) ? von.files : [];
        const obj = vonDateien.find(f => urlVon(f) === url);
        if (!obj) return false;
        const { error } = await sb().from(TABELLE).insert({ type: medienArt(obj) === 'dok' ? 'note' : 'photo', title: titel, files: [obj], customer_id: kundeId, ...(iso && !isNaN(new Date(iso + 'T12:00:00')) ? { created_at: new Date(iso + 'T12:00:00').toISOString() } : {}), created_by: (window.activeUser && window.activeUser.id) || null });
        if (error) throw error;
        const rest = vonDateien.filter(f => urlVon(f) !== url);
        if (!(await leereHuelleEntfernen(von, rest))) await dateienSetzen(vonId, rest);
        return true;
    }

    // ---- Ziehen zwischen Gruppen
    document.addEventListener('dragstart', e => {
        const k = e.target.closest && e.target.closest('[data-ab-eid]');
        if (!k || !e.dataTransfer) return;
        e.dataTransfer.setData('text/x-ablage', JSON.stringify({ url: k.getAttribute('data-ab-url'), eid: k.getAttribute('data-ab-eid') }));
        e.dataTransfer.effectAllowed = 'move';
        k.classList.add('ab-zieht');
    });
    document.addEventListener('dragend', e => {
        document.querySelectorAll('.ab-zieht, .ab-drop-ziel').forEach(x => x.classList.remove('ab-zieht', 'ab-drop-ziel'));
    });
    const internerDrag = ev => ev.dataTransfer && [...(ev.dataTransfer.types || [])].includes('text/x-ablage');
    document.addEventListener('dragover', e => {
        if (!internerDrag(e)) return;
        const neu = e.target.closest && e.target.closest('[data-ablage-neu]');
        const g = neu || (e.target.closest && e.target.closest('[data-ablage-gi]'));
        document.querySelectorAll('.ab-drop-ziel').forEach(x => { if (x !== g) x.classList.remove('ab-drop-ziel'); });
        if (!g) return;
        if (neu) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; g.classList.add('ab-drop-ziel'); return; }
        const grp = (window.__ablageGruppen || [])[Number(g.getAttribute('data-ablage-gi'))];
        if (!grp || !grp.eids.length) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        g.classList.add('ab-drop-ziel');
    });
    document.addEventListener('drop', async e => {
        if (!internerDrag(e)) return;
        const neu = e.target.closest && e.target.closest('[data-ablage-neu]');
        const g = e.target.closest && e.target.closest('[data-ablage-gi]');
        document.querySelectorAll('.ab-drop-ziel, .ab-zieht').forEach(x => x.classList.remove('ab-drop-ziel', 'ab-zieht'));
        if (neu) {
            e.preventDefault(); e.stopPropagation();
            let d; try { d = JSON.parse(e.dataTransfer.getData('text/x-ablage')); } catch (er) { return; }
            const kunde = neu.closest('.ab-ablage').getAttribute('data-ablage-kunde');
            const titel = await window.appEingabe('Name der neuen Gruppe:', '');
            if (titel === null) return;
            const heute = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
            const dtxt = await window.appEingabe('Datum der Gruppe (TT.MM.JJJJ):', heute);
            if (dtxt === null) return;
            const m = /^(d{1,2}).(d{1,2}).(d{4})$/.exec((dtxt || '').trim());
            const iso = m ? m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0') : null;
            try {
                if (await dateiInNeueGruppe(d.url, d.eid, (titel || '').trim() || 'Neue Gruppe', kunde, iso)) {
                    if (window.showToast) window.showToast('Neue Gruppe angelegt', 'success');
                    if (window.refreshAddressDetail) await window.refreshAddressDetail();
                }
            } catch (er) {
                console.error('Ablage: Neue Gruppe fehlgeschlagen', er);
                if (window.showToast) window.showToast('Neue Gruppe fehlgeschlagen: ' + (er.message || er), 'error');
            }
            return;
        }
        if (!g) return;
        e.preventDefault(); e.stopPropagation();
        const grp = (window.__ablageGruppen || [])[Number(g.getAttribute('data-ablage-gi'))];
        let daten; try { daten = JSON.parse(e.dataTransfer.getData('text/x-ablage')); } catch (er) { return; }
        if (!grp || !grp.eids.length || !daten) return;
        if (grp.eids.map(String).includes(String(daten.eid))) return;   // liegt schon in dieser Gruppe
        try {
            if (await dateiVerschieben(daten.url, daten.eid, grp.eids[0])) {
                if (window.showToast) window.showToast('Verschoben nach „' + (grp.roh || 'Ablage') + '“', 'success');
                if (window.refreshAddressDetail) await window.refreshAddressDetail();
            }
        } catch (er) {
            console.error('Ablage: Verschieben fehlgeschlagen', er);
            if (window.showToast) window.showToast('Verschieben fehlgeschlagen: ' + (er.message || er), 'error');
        }
    }, true);

    // ---- Fenster „Gruppe bearbeiten"
    function gruppeBearbeiten(gi, kundeId) {
        const grp = (window.__ablageGruppen || [])[gi];
        if (!grp || !grp.eids.length) return;
        let geaendert = false;
        let dateien = grp.posten.filter(p => p.eid).map(p => Object.assign({}, p));
        const alt = document.getElementById('ab-edit'); if (alt) alt.remove();
        const o = document.createElement('div');
        o.id = 'ab-edit';
        o.className = 'ab-edit-overlay';
        document.body.appendChild(o);

        const zu = async () => {
            o.remove(); document.removeEventListener('keydown', esc_);
            if (geaendert && window.refreshAddressDetail) await window.refreshAddressDetail();
        };
        const esc_ = ev => { if (ev.key === 'Escape' && !document.getElementById('app-dialog')) { ev.stopPropagation(); zu(); } };
        document.addEventListener('keydown', esc_, true);

        function kachel(p, i) {
            const inhalt = p.art === 'bild' ? '<img src="' + esc(p.url) + '" alt="" draggable="false">'
                : p.art === 'video' ? '<span class="ab-edit-symbol">🎬</span>' : '<span class="ab-edit-symbol">📄</span>';
            return '<div class="ab-edit-kachel" title="' + esc(p.name) + '">' + inhalt +
                '<button type="button" class="ab-edit-x" data-i="' + i + '" aria-label="Entfernen" title="Entfernen">×</button>' +
                '<span class="ab-edit-name">' + esc(p.name) + '</span></div>';
        }
        function zeichnen() {
            o.innerHTML = '<div class="ab-edit-box" role="dialog" aria-label="Ablage bearbeiten">' +
                '<div class="ab-edit-kopf"><h3>Ablage bearbeiten</h3><button type="button" class="knopf-x" data-ab-zu aria-label="Schließen">×</button></div>' +
                '<label class="ab-edit-label" for="ab-edit-titel">Überschrift</label>' +
                '<input id="ab-edit-titel" class="glass-input" type="text" value="' + esc(grp.roh) + '">' +
                '<label class="ab-edit-label" for="ab-edit-datum">Datum</label>' +
                '<input id="ab-edit-datum" class="glass-input" type="date" value="' + esc(grp.datum || '') + '">' +
                '<div class="ab-edit-label">Dateien <span>' + dateien.length + '</span></div>' +
                '<div class="ab-edit-raster">' + (dateien.length ? dateien.map(kachel).join('') : '<div class="ab-ablage-leer"><span>Keine Dateien mehr in dieser Gruppe.</span></div>') + '</div>' +
                '<div class="ab-edit-hinweis">Tipp: Dateien lassen sich in der Ablage auch einfach auf eine andere Gruppe ziehen.</div>' +
                '<div class="ab-edit-fuss"><button type="button" class="knopf knopf--sekundaer" data-ab-hoch>＋ Dateien hinzufügen</button>' +
                '<span class="ab-edit-fuss-platz"></span>' +
                '<button type="button" class="knopf knopf--sekundaer" data-ab-zu>Schließen</button>' +
                '<button type="button" class="knopf knopf--primaer" data-ab-titel>Speichern</button></div>' +
                '<input type="file" multiple hidden data-ab-datei accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip,.msg,.eml"></div>';
        }
        zeichnen();

        o.addEventListener('click', async ev => {
            if (ev.target === o || ev.target.closest('[data-ab-zu]')) return zu();
            if (ev.target.closest('[data-ab-hoch]')) { o.querySelector('[data-ab-datei]').click(); return; }
            const x = ev.target.closest('.ab-edit-x');
            if (x) {
                const p = dateien[Number(x.dataset.i)];
                if (!p) return;
                const ja = await window.appFrage('„' + p.name + '“ endgültig löschen?\n\nDie Datei wird auch aus dem Speicher (R2) entfernt und kann nicht wiederhergestellt werden.', { gefahr: true, ja: 'Endgültig löschen', nein: 'Abbrechen' });
                if (!ja) return;
                try {
                    const e = await eintragHolen(p.eid);
                    if (!e) throw new Error('Der Eintrag existiert nicht mehr — bitte die Ablage neu laden.');
                    const rest = (Array.isArray(e && e.files) ? e.files : []).filter(f => urlVon(f) !== p.url);
                    if (!(await leereHuelleEntfernen(e, rest))) await dateienSetzen(p.eid, rest);
                    await ausSpeicherLoeschen(p.url);
                    dateien = dateien.filter(d => d !== p);
                    grp.posten = grp.posten.filter(d => d.url !== p.url);
                    geaendert = true;
                    if (!dateien.length) { zu(); return; }
                    zeichnen();
                } catch (er) {
                    console.error('Ablage: Löschen fehlgeschlagen', er);
                    if (window.showToast) window.showToast('Löschen fehlgeschlagen: ' + (er.message || er), 'error');
                }
                return;
            }
            if (ev.target.closest('[data-ab-titel]')) {
                const neu = (o.querySelector('#ab-edit-titel').value || '').trim();
                if (!neu) { if (window.showToast) window.showToast('Bitte eine Überschrift eingeben.'); return; }
                const dat = o.querySelector('#ab-edit-datum').value;
                if (neu === grp.roh && dat === (grp.datum || '')) { if (window.showToast) window.showToast('Nichts geändert.'); return; }
                try {
                    const upd = { title: neu };
                    if (dat && dat !== grp.datum) upd.created_at = new Date(dat + 'T12:00:00').toISOString();
                    const { error } = await sb().from(TABELLE).update(upd).in('id', grp.eids);
                    if (error) throw error;
                    grp.roh = neu; grp.datum = dat; geaendert = true;
                    if (window.showToast) window.showToast('Gespeichert', 'success');
                    zu();
                } catch (er) {
                    console.error('Ablage: Überschrift speichern fehlgeschlagen', er);
                    if (window.showToast) window.showToast('Speichern fehlgeschlagen: ' + (er.message || er), 'error');
                }
            }
        });
        o.addEventListener('change', async ev => {
            const inp = ev.target.closest('[data-ab-datei]');
            if (!inp) return;
            const liste = Array.from(inp.files || []).filter(f => f.size <= 25 * 1048576);
            inp.value = '';
            if (!liste.length) { if (window.showToast) window.showToast('Keine Datei bis 25 MB gewählt.', 'error'); return; }
            const knopf = o.querySelector('[data-ab-hoch]'); const alt = knopf.textContent; knopf.disabled = true;
            try {
                const eid = grp.eids[0];
                const neu = [];
                for (let i = 0; i < liste.length; i++) {
                    knopf.textContent = 'Lädt ' + (i + 1) + '/' + liste.length + ' …';
                    const f = liste[i];
                    const res = await window.FileUploadService.uploadFile(f, {
                        path: 'adressen/' + kundeId + '/ablage/' + Date.now() + '-' + i + '-' + sicherName(f.name),
                        provider: 'cloudflare-r2', compress: false
                    });
                    neu.push({ url: res.url, name: f.name, type: res.type || f.type || '' });
                }
                const e = await eintragHolen(eid);
                await dateienSetzen(eid, (Array.isArray(e && e.files) ? e.files : []).concat(neu));
                neu.forEach(f => { const p = { url: f.url, name: f.name, art: medienArt(f), eid }; dateien.push(p); grp.posten.push(p); });
                geaendert = true;
                zeichnen();
            } catch (er) {
                console.error('Ablage: Hinzufügen fehlgeschlagen', er);
                if (window.showToast) window.showToast('Hinzufügen fehlgeschlagen: ' + (er.message || er), 'error');
                knopf.disabled = false; knopf.textContent = alt;
            }
        });
        setTimeout(() => { const t = o.querySelector('#ab-edit-titel'); if (t) { t.focus(); t.select(); } }, 30);
    }

})();
