// ==========================================================
// MIETVEREINBARUNG — ÜBERSICHT JE MASCHINE
// ----------------------------------------------------------
// Maschine → Aktionen → Ansehen → "Mietvereinbarung": zeigt alle
// gespeicherten Mietvereinbarungen dieser Maschine. Von hier aus
// lässt sich eine öffnen (bearbeiten), das PDF ansehen oder der
// ganze Vorgang löschen (dann verschwinden PDF und Fotos auch aus
// Cloudflare R2 — siehe window.deleteRentalAgreement).
//
// Gespeichert wird in "rental_agreements"
// (Migration: supabase/migrationen/supabase_add_rental_agreements.sql).
//
// EIGENSTAENDIG: diese Datei gehört zum Mietvereinbarungs-Baustein
// und kann mit ihm zusammen ersatzlos entfernt werden.
// ==========================================================

(function () {
    'use strict';

    let liste = [];
    let maschineId = null;

    const esc = (s) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    function datum(iso) {
        if (!iso) return '';
        const d = new Date(iso);
        return `${d.toLocaleDateString('de-DE')}, ${d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr`;
    }

    // Die Maschine, für die das Aktionsfenster geöffnet wurde. Der Merker
    // ist ein Skript-Global aus js/service-list.js; js/service-picker.js
    // legt ihn zusätzlich auf window ab.
    function aktuelleMaschine() {
        if (typeof currentSelectedMachineForService !== 'undefined' && currentSelectedMachineForService) {
            return currentSelectedMachineForService;
        }
        return window.currentSelectedMachineForService || null;
    }

    window.showMietvereinbarungenForMachine = async function (machineId) {
        if (typeof window.closeServiceActionModal === 'function') window.closeServiceActionModal();

        maschineId = machineId || aktuelleMaschine();
        if (!maschineId) { window.showToast('Keine Maschine ausgewählt.'); return; }
        if (!window.supabaseClient) { window.showToast('Ohne Verbindung gibt es keine Übersicht.'); return; }

        zeichne('lade');

        try {
            const { data, error } = await window.supabaseClient
                .from('rental_agreements')
                .select('*')
                .eq('machine_id', maschineId)
                .order('created_at', { ascending: false });
            if (error) throw error;
            // Nach Mietbeginn, neueste zuerst; ohne Beginn ans Ende (dann nach Speicherdatum).
            const beginn = v => (v.data && v.data.miete && v.data.miete.beginn) || '';
            liste = (data || []).sort((a, b) => {
                const x = beginn(a), y = beginn(b);
                if (x && y) return y.localeCompare(x);
                if (x || y) return x ? -1 : 1;
                return String(b.created_at || '').localeCompare(String(a.created_at || ''));
            });
            zeichne();
        } catch (e) {
            console.error('Mietvereinbarungen konnten nicht geladen werden:', e);
            liste = [];
            zeichne(/rental_agreements/.test((e && e.message) || '') ? 'migration' : 'fehler');
        }
    };

    window.mietListeSchliessen = function () {
        const ov = document.getElementById('miet-liste-overlay');
        if (ov) ov.remove();
    };

    window.mietListeBearbeiten = function (id) {
        window.mietListeSchliessen();
        window.openMietvereinbarung(maschineId, id);
    };

    window.mietListeLoeschen = async function (id) {
        const eintrag = liste.find(x => String(x.id) === String(id));
        if (!eintrag) return;
        if (typeof window.canDelete === 'function' && !window.canDelete('Mietvereinbarungen')) return;
        if (!await window.appFrage('Diese Mietvereinbarung endgültig löschen?\n\nPDF und Fotos werden auch aus der Cloud entfernt.')) return;

        try {
            await window.deleteRentalAgreement(id);
            window.showToast('Mietvereinbarung gelöscht.');
            window.showMietvereinbarungenForMachine(maschineId);
        } catch (e) {
            console.error('Löschen fehlgeschlagen:', e);
            window.showToast('Löschen fehlgeschlagen: ' + ((e && e.message) || 'unbekannter Fehler'));
        }
    };

    window.mietListePdf = function (url) {
        if (!url) return;
        if (typeof window.previewDocument === 'function') {
            window.previewDocument(url, 'Mietvereinbarung', 'application/pdf');
        } else {
            window.open(url, '_blank');
        }
    };

    // ---------- Alle Dokumente einer Mietvereinbarung untereinander ----------
    // Online-PDF + Anlagen (z. B. das eingescannte, unterschriebene Original) in
    // EINEM Fenster: PDFs per pdf.js als Seiten gerendert, Bilder direkt, man scrollt
    // einfach durch. Oben je Dokument ein Sprungknopf. Nichts wird zusammengefügt.
    window.mietDokumenteAnsehen = async function (idOderZeile, startIndex) {
        let v = idOderZeile && typeof idOderZeile === 'object' ? idOderZeile : liste.find(x => String(x.id) === String(idOderZeile));
        if (!v && window.supabaseClient) {
            const { data } = await window.supabaseClient.from('rental_agreements').select('*').eq('id', idOderZeile).maybeSingle();
            v = data;
        }
        if (!v) { window.showToast('Mietvereinbarung nicht gefunden.'); return; }
        const d = v.data || {};
        const doks = [];
        if (v.pdf_url) doks.push({ name: 'Mietvereinbarung', url: v.pdf_url, type: 'application/pdf' });
        (Array.isArray(d.anlagen) ? d.anlagen : []).filter(a => a && a.url).forEach(a => doks.push({ name: a.name || 'Anlage', url: a.url, type: a.type || '', anlage: true }));
        if (!doks.length) { window.showToast('Zu dieser Mietvereinbarung gibt es noch kein Dokument.'); return; }

        const alt = document.getElementById('miet-doks-overlay'); if (alt) alt.remove();
        const mieter = (d.mieter && d.mieter.name) || 'Mietvereinbarung';
        const ov = document.createElement('div');
        ov.id = 'miet-doks-overlay';
        ov.className = 'miet-doks-overlay';
        ov.innerHTML = `
            <div class="miet-doks-fenster">
                <div class="miet-doks-kopf">
                    <div class="miet-doks-titel"><h2>${esc(mieter)}</h2>
                        <div class="miet-doks-sprung">${doks.map((x, i) => `<button type="button" data-sprung="${i}">${x.anlage ? '📎 ' : '📄 '}${esc(x.name)}</button>`).join('')}</div></div>
                    <button type="button" class="miet-close" data-zu title="Schließen">&times;</button>
                </div>
                <div class="miet-doks-inhalt">${doks.map((x, i) => `
                    <section class="miet-doks-teil" id="miet-dok-${i}">
                        <div class="miet-doks-teilkopf"><b>${x.anlage ? 'Anlage: ' : ''}${esc(x.name)}</b>
                            <a href="${esc(x.url)}" target="_blank" rel="noopener">In neuem Tab öffnen ↗</a></div>
                        <div class="miet-doks-seiten" data-i="${i}"><p class="miet-doks-laedt">Wird geladen …</p></div>
                    </section>`).join('')}
                </div>
            </div>`;
        document.body.appendChild(ov);
        const zu = () => { document.removeEventListener('keydown', taste); ov.remove(); };
        const taste = e => { if (e.key === 'Escape') zu(); };
        document.addEventListener('keydown', taste);
        ov.addEventListener('click', e => {
            if (e.target === ov || e.target.closest('[data-zu]')) return zu();
            const b = e.target.closest('[data-sprung]');
            if (b) document.getElementById('miet-dok-' + b.dataset.sprung).scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
        if (startIndex) setTimeout(() => { const z = document.getElementById('miet-dok-' + startIndex); if (z) z.scrollIntoView({ block: 'start' }); }, 50);

        const inhalt = ov.querySelector('.miet-doks-inhalt');
        for (let i = 0; i < doks.length; i++) {
            if (!document.body.contains(ov)) return;
            const x = doks[i];
            const ziel = ov.querySelector(`.miet-doks-seiten[data-i="${i}"]`);
            const art = (x.type || '') + ' ' + x.url;
            try {
                if (/pdf/i.test(art)) {
                    if (typeof window.loadPDFReader === 'function') await window.loadPDFReader();
                    if (!window.pdfjsLib) throw new Error('PDF-Leser nicht verfügbar');
                    const pdf = await window.pdfjsLib.getDocument({ url: x.url }).promise;
                    ziel.innerHTML = '';
                    const breite = Math.min(inhalt.clientWidth - 32, 1000);
                    for (let n = 1; n <= pdf.numPages; n++) {
                        if (!document.body.contains(ov)) return;
                        const seite = await pdf.getPage(n);
                        const basis = seite.getViewport({ scale: 1 });
                        const f = (breite / basis.width) * Math.min(window.devicePixelRatio || 1, 2);
                        const vp = seite.getViewport({ scale: f });
                        const c = document.createElement('canvas');
                        c.width = Math.round(vp.width); c.height = Math.round(vp.height);
                        c.className = 'miet-doks-seite';
                        ziel.appendChild(c);
                        await seite.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
                    }
                } else if (/image\/|\.(jpe?g|png|gif|webp|heic|avif|bmp)(\?|$)/i.test(art)) {
                    ziel.innerHTML = `<img class="miet-doks-seite" src="${esc(x.url)}" alt="">`;
                } else {
                    ziel.innerHTML = `<p class="miet-doks-laedt">Diese Datei lässt sich hier nicht anzeigen — oben „In neuem Tab öffnen“.</p>`;
                }
            } catch (e) {
                console.warn('Mietvereinbarung: Dokument nicht darstellbar', x, e);
                // pdf.js scheitert z. B. an fehlender CORS-Freigabe — dann den Viewer des Browsers nehmen.
                if (/pdf/i.test(art)) { ziel.innerHTML = `<iframe class="miet-doks-rahmen" src="${esc(x.url)}" title="${esc(x.name)}"></iframe>`; continue; }
                ziel.innerHTML = `<p class="miet-doks-laedt">Konnte nicht angezeigt werden (${esc(e.message || e)}) — oben „In neuem Tab öffnen“.</p>`;
            }
        }
    };

    // Lila Büroklammer: Fotos der Vermietung (Übergabe/Rücknahme) in der Anhang-Ansicht der App.
    window.mietListeFotos = function (id) {
        const v = liste.find(x => String(x.id) === String(id));
        const fotos = (v && Array.isArray(v.photos) ? v.photos : []).filter(f => f && f.url);
        if (!fotos.length) return;
        const PHASE = { uebergabe: 'Übergabe', ruecknahme: 'Rücknahme' };
        const dateien = fotos.map(f => ({
            name: [PHASE[f.phase] || '', f.position || ''].filter(Boolean).join(' · ') || 'Foto',
            url: f.url, type: 'image/jpeg'
        }));
        if (typeof window.openServiceAttachments === 'function') window.openServiceAttachments(dateien);
        else if (typeof window.openPhotosLightbox === 'function') window.openPhotosLightbox(dateien.map(d => d.url), 0);
    };

    function zeile(v) {
        const d = v.data || {};
        const mieter = (d.mieter && d.mieter.name) || 'ohne Mieter';
        const ort = (d.mieter && d.mieter.einsatzort) || '';
        const von = (d.miete && d.miete.beginn) || '';
        const bis = (d.miete && d.miete.ende) || '';
        const zeitraum = von || bis
            ? `${von ? von.split('-').reverse().join('.') : '—'} bis ${bis ? bis.split('-').reverse().join('.') : 'offen'}`
            : '';
        const bilder = Array.isArray(v.photos) ? v.photos.length : 0;
        const anlagen = (Array.isArray(d.anlagen) ? d.anlagen : []).filter(a => a && a.url);

        return `
        <div class="miet-liste-zeile">
            <div class="miet-liste-text">
                <strong>${esc(mieter)}</strong>
                <span>${esc(zeitraum)}${ort ? ' · ' + esc(ort) : ''}</span>
                <small>Gespeichert ${esc(datum(v.updated_at || v.created_at))}${bilder ? ` · ${bilder} Foto${bilder === 1 ? '' : 's'}` : ''}</small>
                ${anlagen.length ? `<div class="miet-liste-anlagen">${anlagen.map((a, i) => `<button type="button" class="miet-anlage-chip" onclick="window.mietDokumenteAnsehen('${esc(v.id)}', ${i + 1})" title="Anlage ansehen">📎 ${esc(a.name || 'Anlage')}</button>`).join('')}</div>` : ''}
            </div>
            <div class="miet-liste-knoepfe">
                ${bilder ? `<button type="button" class="btn-icon-circular hist-anhang-btn miet-liste-klammer" onclick="window.mietListeFotos('${esc(v.id)}')" title="${bilder} Foto${bilder === 1 ? '' : 's'} der Vermietung ansehen"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg><span class="hist-anhang-zahl">${bilder}</span></button>` : ''}
                ${v.pdf_url || anlagen.length ? `<button type="button" class="btn-secondary" onclick="window.mietDokumenteAnsehen('${esc(v.id)}')" title="Mietvereinbarung${anlagen.length ? ' und Anlagen' : ''} ansehen">PDF${anlagen.length ? ' + ' + anlagen.length : ''}</button>` : ''}
                <button type="button" class="btn-primary" onclick="window.mietListeBearbeiten('${esc(v.id)}')">Bearbeiten</button>
                <button type="button" class="btn-secondary delete-permission-required" data-del-area="mietvereinbarungen miet-liste-weg" onclick="window.mietListeLoeschen('${esc(v.id)}')" title="Löschen">&times;</button>
            </div>
        </div>`;
    }

    function zeichne(zustand) {
        window.mietListeSchliessen();

        const maschine = (window.machineList || []).find(m => String(m.id) === String(maschineId));
        const name = maschine
            ? [maschine.manufacturer, maschine.name, maschine.serial ? '#' + maschine.serial : ''].filter(Boolean).join(' ')
            : 'Maschine';

        let inhalt;
        if (zustand === 'lade') {
            inhalt = `<p class="miet-liste-leer">Wird geladen …</p>`;
        } else if (zustand === 'migration') {
            inhalt = `<p class="miet-liste-leer">Die Tabelle „rental_agreements" fehlt noch.<br>
                      Bitte <code>supabase/migrationen/supabase_add_rental_agreements.sql</code> in Supabase ausführen.</p>`;
        } else if (zustand === 'fehler') {
            inhalt = `<p class="miet-liste-leer">Die Übersicht konnte nicht geladen werden.</p>`;
        } else if (!liste.length) {
            inhalt = `<p class="miet-liste-leer">Für diese Maschine ist noch keine Mietvereinbarung gespeichert.</p>`;
        } else {
            inhalt = liste.map(zeile).join('');
        }

        const ov = document.createElement('div');
        ov.id = 'miet-liste-overlay';
        ov.className = 'miet-liste-overlay';
        ov.onclick = (e) => { if (e.target === ov) window.mietListeSchliessen(); };
        ov.innerHTML = `
            <div class="miet-liste-fenster">
                <div class="miet-liste-kopf">
                    <div>
                        <h2>Mietvereinbarungen</h2>
                        <span>${esc(name)}</span>
                    </div>
                    <button type="button" class="miet-close" onclick="window.mietListeSchliessen()" title="Schließen">&times;</button>
                </div>
                <div class="miet-liste-inhalt">
                    <button type="button" class="btn-primary" style="width:100%; margin-bottom:12px;" onclick="window.mietListeSchliessen(); window.openMietvereinbarung('${esc(maschineId)}')">＋ Neu anlegen</button>
                    ${inhalt}
                </div>
                <div class="miet-liste-fuss">
                    <button type="button" class="btn-secondary" onclick="window.mietListeSchliessen()">Schließen</button>
                </div>
            </div>`;
        document.body.appendChild(ov);
    }

    console.log('Mietvereinbarungs-Übersicht geladen.');
})();
