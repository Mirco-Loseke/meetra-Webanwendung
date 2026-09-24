// ==========================================================
// MAIL: ANHANG AUS DER APP (Angebote / Dokumente)
// ==========================================================
// Knopf „Aus der App" im Schreiben-Fenster (partials/views/mail.html).
// Zeigt Angebots-PDFs (internal_processes.attachments des Angebots-Vorgangs)
// und Dokumente (documents, auch mehrteilige über .attachments), lädt die
// gewählten Dateien aus R2 (FileUploadService.downloadFile — der öffentliche
// r2.dev-Host schickt kein CORS) und übergibt sie als File an die normale
// Anhang-Logik von js/mail-view.js (window.mailDateienHinzufuegen).
// Geladen wird erst beim Öffnen, einmal je Sitzung (Egress).
// ==========================================================
(function () {
    'use strict';

    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const groesse = b => !b ? '' : b > 1048576 ? (b / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
    const datum = v => { const d = v ? new Date(v) : null; return d && !isNaN(d) ? d.toLocaleDateString('de-DE') : ''; };
    const toast = (m, t) => window.showToast ? window.showToast(m, t) : alert(m);

    let daten = null;          // { angebote: [...], dokumente: [...] } — je Eintrag eine Datei
    let reiter = 'angebote';
    let kunde = null;          // { id, name } aus dem Empfänger
    let nurKunde = false;
    const gewaehlt = new Map(); // schlüssel → Datei

    let geladenUm = 0;
    async function laden() {
        if (daten && Date.now() - geladenUm < 5 * 60 * 1000) return daten;
        const sb = window.supabaseClient;
        const angebote = [], dokumente = [];

        // Angebote + PDFs ihres Vorgangs
        const { data: ang, error: e1 } = await sb.from('angebote')
            .select('id, belegnummer, belegdatum, kundenmatchcode, customer_id, process_id, customers(name)')
            .not('process_id', 'is', null).order('belegdatum', { ascending: false }).limit(600);
        if (e1) throw e1;
        const ids = [...new Set((ang || []).map(a => a.process_id))];
        const anhaengeJe = {};
        for (let i = 0; i < ids.length; i += 150) {
            const { data } = await sb.from('internal_processes').select('id, attachments').in('id', ids.slice(i, i + 150));
            (data || []).forEach(p => { anhaengeJe[p.id] = Array.isArray(p.attachments) ? p.attachments : []; });
        }
        (ang || []).forEach(a => {
            const firma = (a.customers && a.customers.name) || a.kundenmatchcode || '';
            (anhaengeJe[a.process_id] || []).filter(f => f && (f.path || f.url) && !f.step_id).forEach(f => {
                angebote.push({
                    key: 'a:' + (f.id || f.path || f.url), name: f.name || 'Datei', size: f.size, type: f.type,
                    path: f.path, url: f.url, kundeId: a.customer_id,
                    titel: 'Angebot ' + (a.belegnummer || ''), unter: [firma, datum(a.belegdatum)].filter(Boolean).join(' · '),
                    suche: norm([f.name, a.belegnummer, firma].join(' '))
                });
            });
        });

        // Dokumente (mehrteilige einzeln)
        const { data: docs, error: e2 } = await sb.from('documents')
            .select('id, name, url, file_path, mime_type, size, created_at, attachments, machines(name, serial, manufacturer, customer_id)')
            .order('created_at', { ascending: false }).limit(600);
        if (e2) throw e2;
        (docs || []).forEach(d => {
            const m = d.machines;
            const maschine = m ? [m.manufacturer, m.name].filter(Boolean).join(' ') + (m.serial ? ' #' + m.serial : '') : '';
            const dateien = Array.isArray(d.attachments) && d.attachments.length
                ? d.attachments.filter(f => f && (f.url || f.path))
                : [{ name: d.name, url: d.url, path: d.file_path, size: d.size, type: d.mime_type }];
            dateien.forEach((f, i) => dokumente.push({
                key: 'd:' + d.id + ':' + i, name: f.name || d.name || 'Datei', size: f.size || d.size, type: f.type || d.mime_type,
                path: f.path, url: f.url, kundeId: m ? m.customer_id : null,
                titel: d.name || f.name, unter: [maschine, datum(d.created_at)].filter(Boolean).join(' · '),
                suche: norm([d.name, f.name, maschine].join(' '))
            }));
        });
        daten = { angebote, dokumente };
        geladenUm = Date.now();
        return daten;
    }

    function liste() {
        const box = document.getElementById('maa-liste');
        if (!box || !daten) return;
        const q = norm(document.getElementById('maa-suche').value).trim();
        let rows = daten[reiter];
        if (nurKunde && kunde) rows = rows.filter(r => String(r.kundeId) === String(kunde.id));
        if (q) rows = rows.filter(r => q.split(/\s+/).every(w => r.suche.includes(w)));
        // Dateien des erkannten Kunden zuerst
        if (kunde && !nurKunde) rows = rows.slice().sort((a, b) => (String(b.kundeId) === String(kunde.id)) - (String(a.kundeId) === String(kunde.id)));
        const gezeigt = rows.slice(0, 150);
        box.innerHTML = gezeigt.length ? gezeigt.map(r => `
            <label class="maa-zeile${gewaehlt.has(r.key) ? ' an' : ''}">
                <input type="checkbox" data-key="${esc(r.key)}" ${gewaehlt.has(r.key) ? 'checked' : ''}>
                <span class="maa-ico">${/pdf/i.test(r.type || r.name) ? 'PDF' : /image/i.test(r.type || '') ? 'BILD' : 'DATEI'}</span>
                <span class="maa-text"><b>${esc(r.titel)}</b>${kunde && String(r.kundeId) === String(kunde.id) ? ' <em class="maa-chip">' + esc(kunde.name) + '</em>' : ''}
                    <small>${esc(r.name !== r.titel ? r.name + ' · ' : '')}${esc(r.unter)}</small></span>
                <span class="maa-gr">${groesse(r.size)}</span>
            </label>`).join('') + (rows.length > 150 ? `<div class="maa-mehr">… ${rows.length - 150} weitere — Suche eingrenzen</div>` : '')
            : '<div class="maa-mehr">Nichts gefunden.</div>';
        zaehlen();
    }
    function zaehlen() {
        const n = gewaehlt.size;
        const summe = [...gewaehlt.values()].reduce((s, r) => s + (r.size || 0), 0);
        document.getElementById('maa-info').textContent = n ? `${n} ausgewählt · ${groesse(summe)}` : 'Nichts ausgewählt';
        document.getElementById('maa-ok').disabled = !n;
        document.querySelectorAll('#maa-dialog .maa-tab').forEach(t => {
            const k = t.dataset.r;
            const z = daten ? daten[k].length : '';
            t.querySelector('em').textContent = z;
        });
    }

    async function anhaengen() {
        const btn = document.getElementById('maa-ok');
        const dateien = [...gewaehlt.values()];
        btn.disabled = true;
        let ok = 0;
        for (const [i, r] of dateien.entries()) {
            btn.textContent = `Lade ${i + 1} / ${dateien.length} …`;
            try {
                const svc = window.FileUploadService;
                const pfad = r.path || (svc && r.url ? svc.r2PfadAusUrl(r.url) : null);
                let blob;
                if (pfad && svc) blob = await svc.downloadFile(pfad);
                else { const res = await fetch(r.url); if (!res.ok) throw new Error('HTTP ' + res.status); blob = await res.blob(); }
                // Endung sicherstellen — „servicebericht-18.09.2026" hat keine (".2026" ist keine),
                // ohne Endung kann der Empfänger die Datei nicht öffnen.
                const typ = r.type || blob.type || 'application/octet-stream';
                const ENDUNG = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
                    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx', 'application/msword': 'doc', 'application/vnd.ms-excel': 'xls' };
                const hatEndung = /\.[a-z][a-z0-9]{1,4}$/i.test(r.name);
                const name = hatEndung || !ENDUNG[typ] ? r.name : r.name + '.' + ENDUNG[typ];
                window.mailDateienHinzufuegen([new File([blob], name, { type: typ })]);
                ok++;
            } catch (e) {
                toast('„' + r.name + '" konnte nicht geladen werden: ' + (e.message || e), 'error');
            }
        }
        btn.textContent = 'Anhängen';
        if (ok) { toast(ok + (ok === 1 ? ' Datei' : ' Dateien') + ' angehängt.'); schliessen(); }
        else btn.disabled = false;
    }

    function schliessen() { const el = document.getElementById('maa-dialog'); if (el) el.remove(); }

    // kontext: { kunde: {id, name} | null }
    window.mailAnhangAusApp = async function (kontext) {
        if (typeof window.mailDateienHinzufuegen !== 'function') { toast('Mail-Ansicht nicht bereit.', 'error'); return; }
        kunde = kontext && kontext.kunde ? kontext.kunde : null;
        nurKunde = !!kunde;
        gewaehlt.clear();
        schliessen();
        const el = document.createElement('div');
        el.id = 'maa-dialog';
        el.className = 'maa-backdrop';
        el.innerHTML = `
            <div class="maa-box" role="dialog" aria-modal="true">
                <div class="maa-kopf">
                    <h3>Anhang aus der App</h3>
                    <button type="button" class="maa-x" data-maa-zu title="Schließen">×</button>
                </div>
                <div class="maa-leiste">
                    <div class="maa-tabs">
                        <button type="button" class="maa-tab aktiv" data-r="angebote">Angebote <em></em></button>
                        <button type="button" class="maa-tab" data-r="dokumente">Dokumente <em></em></button>
                    </div>
                    <input type="search" id="maa-suche" placeholder="Suchen: Belegnummer, Kunde, Maschine, Dateiname …" autocomplete="off">
                    ${kunde ? `<label class="maa-nur"><input type="checkbox" id="maa-nur" ${nurKunde ? 'checked' : ''}> nur ${esc(kunde.name)}</label>` : ''}
                </div>
                <div class="maa-liste" id="maa-liste"><div class="maa-mehr">Lade Angebote und Dokumente …</div></div>
                <div class="maa-fuss">
                    <span id="maa-info" class="text-muted-sm">Nichts ausgewählt</span>
                    <button type="button" class="btn-secondary" data-maa-zu>Abbrechen</button>
                    <button type="button" class="btn-primary" id="maa-ok" disabled>Anhängen</button>
                </div>
            </div>`;
        document.body.appendChild(el);
        el.addEventListener('click', e => {
            if (e.target === el || e.target.closest('[data-maa-zu]')) return schliessen();
            const tab = e.target.closest('.maa-tab');
            if (tab) {
                reiter = tab.dataset.r;
                el.querySelectorAll('.maa-tab').forEach(t => t.classList.toggle('aktiv', t === tab));
                liste();
            }
        });
        el.addEventListener('change', e => {
            if (e.target.id === 'maa-nur') { nurKunde = e.target.checked; liste(); return; }
            const key = e.target.dataset && e.target.dataset.key;
            if (!key) return;
            const r = daten[reiter].find(x => x.key === key);
            if (e.target.checked && r) gewaehlt.set(key, r); else gewaehlt.delete(key);
            e.target.closest('.maa-zeile').classList.toggle('an', e.target.checked);
            zaehlen();
        });
        document.getElementById('maa-suche').addEventListener('input', liste);
        document.getElementById('maa-ok').addEventListener('click', anhaengen);
        el.addEventListener('keydown', e => { if (e.key === 'Escape') schliessen(); });
        reiter = 'angebote';
        setTimeout(() => document.getElementById('maa-suche').focus(), 50);
        try { await laden(); liste(); }
        catch (e) { document.getElementById('maa-liste').innerHTML = '<div class="maa-mehr">Laden fehlgeschlagen: ' + esc(e.message || e) + '</div>'; }
    };
    // Nach Anlage/Löschen in der App beim nächsten Öffnen frisch laden
    window.mailAnhangAusAppNeuLaden = () => { daten = null; };
})();
