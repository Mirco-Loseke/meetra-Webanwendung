/* upload-feld.js — gemeinsame Upload-Komponente (UI-05, 2026-10-17)
 *
 *   const feld = window.uploadFeld(containerEl, {
 *       accept: 'application/pdf,image/*',   // erlaubte Typen (auch als Hilfetext)
 *       multiple: true,
 *       maxMB: 15,                           // Limit je Datei, wird angezeigt und geprüft
 *       kamera: true,                        // auf dem Handy zweiter Knopf „📷 Foto" (capture)
 *       text: 'Hierher ziehen oder auswählen',
 *       // Optional: sofort hochladen. pfad(datei, index) → R2-Pfad; Ergebnis je Datei { name, type, url }
 *       upload: { pfad: (f, i) => 'ordner/' + Date.now() + '-' + f.name, provider: 'cloudflare-r2' },
 *       onChange(dateien)                    // Liste der (hochgeladenen bzw. gewählten) Dateien
 *       nurZone: true, onFiles(dateien)      // nur die Zone: geprüfte Dateien gehen an onFiles, die Liste/Vorschau macht der Aufrufer
 *   });
 *   feld.dateien()  → aktuelle Liste     feld.leeren()
 *
 * Zeigt je Datei Name, Größe, Fortschritt/Fehler und ✕ zum Entfernen — überall gleich.
 * Die Zone hat die Klasse .upload-zone (css/components/upload-feld.css), die auch bestehende
 * Ablagefelder zusätzlich tragen, damit alle gleich aussehen.
 */
(function () {
    'use strict';
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const groesse = b => b >= 1048576 ? (b / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
    const handy = () => window.matchMedia && window.matchMedia('(max-width: 768px), (pointer: coarse)').matches;

    function passt(datei, accept) {
        if (!accept) return true;
        return accept.split(',').map(s => s.trim().toLowerCase()).filter(Boolean).some(a => {
            if (a.startsWith('.')) return datei.name.toLowerCase().endsWith(a);
            if (a.endsWith('/*')) return (datei.type || '').toLowerCase().startsWith(a.slice(0, -1));
            return (datei.type || '').toLowerCase() === a;
        });
    }
    const typText = accept => !accept ? '' : accept.split(',').map(s => s.trim()).map(a => a === 'application/pdf' ? 'PDF' : a === 'image/*' ? 'Bilder' : a.replace(/^\./, '').toUpperCase()).filter((v, i, l) => l.indexOf(v) === i).join(', ');

    window.uploadFeld = function (container, o) {
        o = o || {};
        const eintraege = [];     // { datei, status: 'wartet'|'laedt'|'fertig'|'fehler', fehler, ergebnis }
        container.classList.add('upload-feld');
        container.innerHTML =
            '<label class="upload-zone" tabindex="0">' +
                '<input type="file" hidden' + (o.multiple ? ' multiple' : '') + (o.accept ? ' accept="' + esc(o.accept) + '"' : '') + '>' +
                '<b>' + esc(o.text || (o.multiple ? 'Dateien hierher ziehen' : 'Datei hierher ziehen')) + '</b> oder <u>auswählen</u>' +
                '<small>' + esc([typText(o.accept), o.maxMB ? 'max. ' + o.maxMB + ' MB je Datei' : ''].filter(Boolean).join(' · ')) + '</small>' +
            '</label>' +
            (o.kamera && handy() ? '<label class="knopf knopf--sekundaer upload-kamera">📷 Foto aufnehmen<input type="file" hidden accept="image/*" capture="environment"></label>' : '') +
            '<div class="upload-hinweis" role="alert"></div><ul class="upload-liste"></ul>';
        const zone = container.querySelector('.upload-zone');
        const eingaben = container.querySelectorAll('input[type=file]');
        const liste = container.querySelector('.upload-liste');

        function zeichnen() {
            liste.innerHTML = eintraege.map((e, i) => '<li class="upload-eintrag upload-' + e.status + '">' +
                '<span class="upload-name">' + esc(e.datei.name) + '</span><em>' + groesse(e.datei.size) + '</em>' +
                (e.status === 'laedt' ? '<span class="upload-balken"><i></i></span>' : '') +
                (e.status === 'fehler' ? '<span class="upload-fehler">' + esc(e.fehler) + '</span>' : '') +
                (e.status === 'fertig' ? '<span class="upload-ok">✓</span>' : '') +
                '<button type="button" class="knopf-x" data-weg="' + i + '" aria-label="Entfernen" title="Entfernen">✕</button></li>').join('');
        }
        const ergebnis = () => eintraege.filter(e => e.status !== 'fehler').map(e => e.ergebnis || e.datei);
        const melden = () => { if (o.onChange) o.onChange(ergebnis()); };

        async function annehmen(dateien) {
            if (o.nurZone) {
                const gut = [], schlecht = [];
                [...dateien].forEach(d => {
                    if (!passt(d, o.accept)) schlecht.push(d.name + ' (Dateityp nicht erlaubt)');
                    else if (o.maxMB && d.size > o.maxMB * 1048576) schlecht.push(d.name + ' (zu groß, max. ' + o.maxMB + ' MB)');
                    else gut.push(d);
                });
                container.querySelector('.upload-hinweis').textContent = schlecht.length ? 'Nicht übernommen: ' + schlecht.join('; ') : '';
                if (gut.length && o.onFiles) await o.onFiles(o.multiple ? gut : gut.slice(0, 1));
                return;
            }
            const neu = [];
            [...dateien].forEach(d => {
                const e = { datei: d, status: 'wartet' };
                if (!passt(d, o.accept)) { e.status = 'fehler'; e.fehler = 'Dateityp nicht erlaubt'; }
                else if (o.maxMB && d.size > o.maxMB * 1048576) { e.status = 'fehler'; e.fehler = 'Zu groß (max. ' + o.maxMB + ' MB)'; }
                neu.push(e);
            });
            if (!o.multiple) eintraege.length = 0;
            eintraege.push(...(o.multiple ? neu : neu.slice(0, 1)));
            zeichnen();
            if (o.upload && window.FileUploadService) {
                for (const e of eintraege.filter(x => x.status === 'wartet')) {
                    e.status = 'laedt'; zeichnen();
                    try {
                        const r = await window.FileUploadService.uploadFile(e.datei, { path: o.upload.pfad(e.datei, eintraege.indexOf(e)), provider: o.upload.provider || 'cloudflare-r2', compress: !!o.upload.compress });
                        e.ergebnis = { name: e.datei.name, type: r.type || e.datei.type || '', url: r.url };
                        e.status = 'fertig';
                    } catch (err) { e.status = 'fehler'; e.fehler = (err && err.message) || 'Hochladen fehlgeschlagen'; }
                    zeichnen();
                }
            } else eintraege.filter(x => x.status === 'wartet').forEach(x => { x.status = 'fertig'; });
            zeichnen(); melden();
        }

        eingaben.forEach(inp => inp.addEventListener('change', () => { const f = [...inp.files]; inp.value = ''; if (f.length) annehmen(f); }));
        zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('ueber'); });
        zone.addEventListener('dragleave', () => zone.classList.remove('ueber'));
        zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('ueber'); if (e.dataTransfer && e.dataTransfer.files.length) annehmen(e.dataTransfer.files); });
        zone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); eingaben[0].click(); } });
        liste.addEventListener('click', e => {
            const b = e.target.closest('[data-weg]');
            if (!b) return;
            eintraege.splice(+b.dataset.weg, 1);
            zeichnen(); melden();
        });
        return { dateien: ergebnis, leeren() { eintraege.length = 0; zeichnen(); melden(); } };
    };

    // ------------------------------------------------------------------
    // Bestehende Upload-Felder übernehmen: das alte Feld wird versteckt (bleibt mit seinem
    // <input> im DOM), davor steht die gemeinsame Zone. Gewählte/gezogene Dateien werden in
    // das alte <input> gelegt und dessen change-Ereignis ausgelöst — die vorhandene Logik
    // (Import, Vorschau, Speichern) läuft unverändert. Wird ein Feld per JS neu gezeichnet,
    // greift der Beobachter erneut.
    // ------------------------------------------------------------------
    const UEBERNAHME = [
        { input: 'label-import-input', accept: '.csv,.xls,.xlsx', multiple: false, text: 'Excel- oder CSV-Datei hierher ziehen' },
        { input: 'customer-import-input', accept: '.csv,.xls,.xlsx', multiple: false, text: 'Excel- oder CSV-Datei hierher ziehen' },
        { input: 'angebote-import-input', accept: '.csv,.xls,.xlsx', multiple: false, text: 'Excel- oder CSV-Datei hierher ziehen' },
        { input: 'workshop-new-photo-input', accept: 'image/*', multiple: true, kamera: true, maxMB: 25, text: 'Fotos hierher ziehen' }
    ];

    function uebernehmen() {
        UEBERNAHME.forEach(r => {
            const inp = document.getElementById(r.input);
            if (!inp) return;
            const alt = inp.closest('.file-drop-zone') || inp.closest('[id$="dropzone"]') || inp.parentElement;
            if (!alt || alt.dataset.ufUebernommen) return;
            alt.dataset.ufUebernommen = '1';
            const box = document.createElement('div');
            box.className = 'upload-uebernommen';
            alt.parentElement.insertBefore(box, alt);
            alt.style.display = 'none';
            window.uploadFeld(box, {
                accept: r.accept, multiple: r.multiple, kamera: !!r.kamera, nurZone: true, maxMB: r.maxMB || 10, text: r.text,
                onFiles: (dateien) => {
                    try {
                        const dt = new DataTransfer();
                        dateien.forEach(f => dt.items.add(f));
                        inp.files = dt.files;
                    } catch (e) { console.warn('upload-feld: Dateien nicht ins Feld übertragbar', e); return; }
                    inp.dispatchEvent(new Event('change', { bubbles: true }));
                }
            });
        });
    }
    let uebGeplant = false;
    function uebPlanen() { if (uebGeplant) return; uebGeplant = true; setTimeout(() => { uebGeplant = false; uebernehmen(); }, 150); }
    function uebStart() {
        uebernehmen();
        new MutationObserver(uebPlanen).observe(document.body, { childList: true, subtree: true });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', uebStart); else uebStart();
})();
