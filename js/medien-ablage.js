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
            '<video preload="metadata" muted playsinline src="' + esc(url) + '#t=0.1"></video>' +
            '<span class="mv-play" aria-hidden="true">▶</span><span class="mv-dauer"></span>' + (ohneKlick ? '</span>' : '</button>');
    }
    window.videoKachelHtml = videoKachelHtml;

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
        const rein = (f, datum, titel, quelle) => {
            const url = dateiUrl(f);
            if (!url || gesehen.has(url)) return;
            gesehen.add(url);
            posten.push({ url, name: dateiName(f), art: medienArt(f), datum: datum || '', titel: titel || '', quelle: quelle || '', typ: (f && f.type) || '' });
        };
        (detail.machineHistoryEntries || []).forEach(e => {
            const files = Array.isArray(e.files) ? e.files : [];
            let quelle = '';
            if (e.machine_id && typeof window.getMachineName === 'function') quelle = window.getMachineName(e.machine_id) || '';
            files.forEach(f => rein(f, e.entry_date || e.created_at, e.title || (e._sourceTable === 'service_entries' ? 'Servicebericht' : 'Eintrag'), quelle));
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
        return new Date(k + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: 'long', year: 'numeric' });
    }

    function postenHtml(p, alleBilder) {
        if (p.art === 'video') return '<div class="ab-ablage-item">' + videoKachelHtml(p.url) + '<span class="ab-ablage-name">' + esc(p.name) + '</span></div>';
        if (p.art === 'bild') {
            const idx = alleBilder.indexOf(p.url);
            return '<div class="ab-ablage-item"><img class="ab-ablage-bild" src="' + esc(p.url) + '" loading="lazy" alt="" data-ablage-bild="' + idx + '" title="Bild vergrößern"></div>';
        }
        const typ = /\.pdf$/i.test(p.url.split('?')[0]) ? 'application/pdf' : p.typ;
        return '<button type="button" class="ab-ablage-dok" data-dok-url="' + esc(p.url) + '" data-dok-name="' + esc(p.name) + '" data-dok-typ="' + esc(typ) + '">📄 <span>' + esc(p.name) + '</span></button>';
    }

    window.adressAblageHtml = function (detail, customerId) {
        const alle = sammeln(detail || {});
        const zahl = k => alle.filter(p => p.art === k).length;
        const liste = alle.filter(p => p.art === S.art);
        const alleBilder = liste.filter(p => p.art === 'bild').map(p => p.url);
        window.__ablageBilder = alleBilder;

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
        if (!liste.length) inhalt = '<div class="ab-empty"><div class="ab-empty-title">Noch keine ' + esc(ARTEN.find(a => a.key === S.art).label) + '</div></div>';
        tage.forEach((gruppen, tag) => {
            inhalt += '<section class="ab-ablage-tag"><h4 class="ab-ablage-datum">' + esc(tagText(tag)) + '</h4>';
            gruppen.forEach((posten, kopf) => {
                inhalt += '<div class="ab-ablage-gruppe">' + (kopf ? '<div class="ab-ablage-kopf">' + esc(kopf) + '</div>' : '') +
                    '<div class="ab-ablage-raster' + (S.art === 'dok' ? ' ab-ablage-raster-dok' : '') + '">' + posten.map(p => postenHtml(p, alleBilder)).join('') + '</div></div>';
            });
            inhalt += '</section>';
        });

        return '<div class="ab-ablage" data-ablage-kunde="' + esc(customerId) + '">' +
            '<div class="ab-ablage-leiste"><div class="ab-ablage-reiterleiste">' + reiter + '</div>' +
            '<button type="button" class="ab-btn ab-btn-primary" data-ablage-hoch>＋ Hochladen</button>' +
            '<input type="file" multiple hidden data-ablage-datei accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip,.msg,.eml"></div>' +
            '<div class="ab-ablage-inhalt">' + inhalt + '</div></div>';
    };
    window.adressAblageAnzahl = detail => sammeln(detail || {}).length;

    function sicherName(n) { return String(n || 'datei').replace(/[^\w.\-]+/g, '_').slice(-80); }

    async function hochladen(kundeId, dateien, knopf) {
        if (!dateien.length) return;
        const titel = window.prompt('Überschrift für diese Ablage:', dateien.length === 1 ? dateien[0].name.replace(/\.\w+$/, '') : 'Ablage');
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
                files.push({ url: res.url, name: f.name, type: res.type || f.type || '' });
            }
            const nurMedien = files.every(f => medienArt(f) !== 'dok');
            const { error } = await window.supabaseClient.from('manual_history_entries').insert([{
                type: nurMedien ? 'photo' : 'note',
                title: titel.trim() || 'Ablage',
                files,
                customer_id: kundeId,
                created_by: (window.activeUser && window.activeUser.id) || null
            }]);
            if (error) throw error;
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
        if (e.target.closest('[data-ablage-hoch]')) { box.querySelector('[data-ablage-datei]').click(); return; }
        const b = e.target.closest('[data-ablage-bild]');
        if (b && window.openPhotosLightbox) { window.openPhotosLightbox(window.__ablageBilder || [], Number(b.getAttribute('data-ablage-bild')) || 0); return; }
        const d = e.target.closest('[data-dok-url]');
        if (d) {
            if (window.previewDocument) window.previewDocument(d.dataset.dokUrl, d.dataset.dokName, d.dataset.dokTyp);
            else window.open(d.dataset.dokUrl, '_blank');
        }
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
})();
