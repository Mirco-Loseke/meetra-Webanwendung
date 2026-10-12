// ==========================================================
// ONEDRIVE-EINGANG → ANGEBOTE
// ==========================================================
// Ein OneDrive-Ordner wird regelmäßig über Microsoft Graph abgefragt.
// Jede PDF darin wird einem Angebot (angebote.belegnummer) zugeordnet und
// als Dokument an dessen Vorgang gehängt (internal_processes.attachments,
// gleiches Format wie js/process-attachments.js). Danach wandert die Datei
// in den Unterordner „zugeordnet", damit sie nicht doppelt verarbeitet wird.
//
// Zuordnung: erst Zahlen im Dateinamen, sonst Text der PDF (pdf.js,
// erste 2 Seiten). Gezählt wird nur, was einer bekannten Belegnummer
// entspricht — genau EIN Treffer, sonst bleibt die Datei liegen und steht
// unter Einstellungen → Outlook als „nicht zugeordnet".
//
// Voraussetzungen:
//  - Anmeldung unter Einstellungen → Outlook (js/outlook-graph.js)
//  - Berechtigung Files.ReadWrite (delegiert) — wird NICHT beim normalen
//    Anmelden verlangt, sondern erst per Klick auf „Jetzt prüfen"
//    (graphFetchMit, Popup). Bis dahin läuft der Timer still ins Leere.
//  - Läuft nur, solange die App in einem Browser offen ist, in dem der
//    Eingang eingeschaltet ist (Einstellung je Browser, localStorage).
// ==========================================================
(function () {
    'use strict';

    const S_ORDNER = 'onedrive_angebote_ordner';
    const S_AKTIV = 'onedrive_angebote_aktiv';
    const S_OFFEN = 'onedrive_angebote_offen';   // { itemId: { name, grund, geaendert } }
    const SCOPES = ['Files.ReadWrite'];
    const ZIEL = 'zugeordnet';
    const TAKT_MS = 5 * 60 * 1000;
    const MAX_BYTES = 8 * 1024 * 1024;           // wie process-attachments.js

    let laeuft = false;
    let letzterLauf = null;

    const ls = {
        get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } },
        set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* egal */ } }
    };
    function ordner() { return (ls.get(S_ORDNER, '') || '').trim().replace(/^\/+|\/+$/g, ''); }
    function aktiv() { return ls.get(S_AKTIV, '') === '1'; }
    function offen() { try { return JSON.parse(ls.get(S_OFFEN, '{}')) || {}; } catch (e) { return {}; } }
    function offenSetzen(o) { ls.set(S_OFFEN, JSON.stringify(o)); }
    function pfadUrl(p) { return p.split('/').map(encodeURIComponent).join('/'); }
    function graph(pfad, methode, rumpf, interaktiv) { return window.graphFetchMit(SCOPES, pfad, methode, rumpf, interaktiv); }
    function norm(s) { return String(s || '').replace(/\D/g, '').replace(/^0+/, ''); }
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    // Zahlenfolgen (≥4 Ziffern, auch mit Trennzeichen wie AN-2026-0142 → 20260142 und 0142)
    function treffer(text, index) {
        const gefunden = new Map();
        const t = String(text || '');
        const kandidaten = new Set();
        (t.match(/\d{4,}/g) || []).forEach(z => kandidaten.add(norm(z)));
        (t.match(/\d+(?:[-\/. ]\d+)+/g) || []).forEach(z => kandidaten.add(norm(z)));
        kandidaten.forEach(k => { (index.get(k) || []).forEach(a => gefunden.set(a.id, a)); });
        let liste = Array.from(gefunden.values());
        // Sage vergibt Angebotsnummern jedes Jahr neu: gleiche Nummer aus mehreren
        // Jahren → das Jahr im Text entscheidet („Angebot 2027-30041"), sonst das neueste.
        if (liste.length > 1 && new Set(liste.map(a => norm(a.belegnummer))).size === 1) {
            const jahre = (t.match(/\b20\d\d\b/g) || []);
            const imJahr = liste.filter(a => a.belegdatum && jahre.includes(String(a.belegdatum).slice(0, 4)));
            liste = imJahr.length === 1 ? imJahr
                : [liste.slice().sort((a, b) => String(b.belegdatum || '').localeCompare(String(a.belegdatum || '')))[0]];
        }
        return liste;
    }

    async function angeboteIndex() {
        const { data, error } = await window.supabaseClient
            .from('angebote').select('id, belegnummer, belegdatum, process_id');
        if (error) throw error;
        const idx = new Map();   // Nummer → Angebote (mehrere Jahre möglich)
        (data || []).forEach(a => { const n = norm(a.belegnummer); if (n.length >= 4) { if (!idx.has(n)) idx.set(n, []); idx.get(n).push(a); } });
        return idx;
    }

    async function pdfText(blob) {
        if (!window.loadPDFReader) return '';
        await window.loadPDFReader();
        const doc = await window.pdfjsLib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
        let text = '';
        for (let i = 1; i <= Math.min(2, doc.numPages); i++) {
            const seite = await doc.getPage(i);
            const inhalt = await seite.getTextContent();
            text += inhalt.items.map(x => x.str).join(' ') + '\n';
        }
        return text;
    }

    async function zielOrdnerId(interaktiv) {
        const p = pfadUrl(ordner());
        try { return (await graph('/me/drive/root:/' + p + '/' + ZIEL, 'GET', null, interaktiv)).id; }
        catch (e) {
            if (e.status !== 404) throw e;
            return (await graph('/me/drive/root:/' + p + ':/children', 'POST',
                { name: ZIEL, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }, interaktiv)).id;
        }
    }

    // Anhangsliste frisch aus der DB (nicht aus eventsState — die ist evtl.
    // nicht geladen, dann würde die Liste überschrieben).
    async function anVorgangHaengen(processId, datei) {
        const sb = window.supabaseClient;
        const { data: p, error } = await sb.from('internal_processes').select('attachments').eq('id', processId).single();
        if (error) throw error;
        const liste = Array.isArray(p && p.attachments) ? p.attachments.slice() : [];
        if (liste.some(f => f.name === datei.name && Number(f.size) === datei.size)) return 'schon da';

        const pfad = 'vorgaenge/' + processId + '/' + Date.now() + '-od-' + datei.name.replace(/[^\w.\-]+/g, '_');
        const res = await window.FileUploadService.uploadFile(datei, { path: pfad, provider: 'cloudflare-r2', compress: false });
        liste.push({
            id: 'att_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
            name: datei.name, url: res.url, path: res.path, size: res.size,
            type: res.type || 'application/pdf', at: new Date().toISOString(),
            by: 'OneDrive-Eingang', step_id: null
        });
        const { error: e2 } = await sb.from('internal_processes').update({ attachments: liste }).eq('id', processId);
        if (e2) throw e2;
        const lokal = ((window.eventsState && window.eventsState.processes) || []).find(x => String(x.id) === String(processId));
        if (lokal) lokal.attachments = liste;
        return 'angehängt';
    }

    // Ein Durchlauf. interaktiv = per Klick ausgelöst (darf Zustimmungs-Popup zeigen).
    async function pruefen(interaktiv) {
        if (laeuft) return { hinweis: 'Läuft bereits.' };
        if (!ordner()) return { hinweis: 'Kein Ordner eingetragen.' };
        if (!window.outlookKonto || !window.outlookKonto()) return { hinweis: 'Nicht bei Microsoft angemeldet.' };
        laeuft = true;
        const erg = { zugeordnet: 0, offen: 0, fehler: 0, hinweis: '' };
        try {
            const d = await graph('/me/drive/root:/' + pfadUrl(ordner()) + ':/children?$top=200', 'GET', null, interaktiv);
            const pdfs = (d.value || []).filter(x => x.file && /\.pdf$/i.test(x.name));
            const merker = offen();
            // Was nicht mehr im Ordner liegt, aus der Offen-Liste nehmen.
            Object.keys(merker).forEach(id => { if (!pdfs.some(x => x.id === id)) delete merker[id]; });
            if (!pdfs.length) { offenSetzen(merker); return erg; }

            const index = await angeboteIndex();
            let zielId = null;

            for (const item of pdfs) {
                // Schon einmal ohne Erfolg geprüft und seitdem unverändert? Nicht erneut laden.
                const alt = merker[item.id];
                if (alt && alt.geaendert === item.lastModifiedDateTime && !interaktiv) { erg.offen++; continue; }
                try {
                    let passend = treffer(item.name.replace(/\.pdf$/i, ''), index);
                    let blob = null;
                    const url = item['@microsoft.graph.downloadUrl'];
                    if (passend.length !== 1) {
                        if (item.size > MAX_BYTES * 3) throw new Error('zu groß zum Durchsuchen');
                        blob = await (await fetch(url)).blob();
                        // Im PDF stehen viele Zahlen (PLZ, Telefon …): zuerst nur die
                        // hinter „Angebot…"/„Beleg…", erst dann alle.
                        const text = await pdfText(blob);
                        const naheWort = (text.match(/(?:Angebot|Beleg)\w*[^\d]{0,40}\d[\d\-\/. ]{2,}/gi) || []).join(' ');
                        passend = treffer(naheWort, index);
                        if (!passend.length) passend = treffer(text, index);
                    }
                    let grund = '';
                    if (!passend.length) grund = 'Keine bekannte Angebotsnummer gefunden';
                    else if (passend.length > 1) grund = 'Mehrere Angebote passen: ' + passend.map(a => a.belegnummer).join(', ');
                    else if (!passend[0].process_id) grund = 'Angebot ' + passend[0].belegnummer + ' hat keinen Vorgang';
                    else if (item.size > MAX_BYTES) grund = 'Größer als 8 MB';
                    if (grund) {
                        merker[item.id] = { name: item.name, grund, geaendert: item.lastModifiedDateTime };
                        erg.offen++;
                        continue;
                    }
                    if (!blob) blob = await (await fetch(url)).blob();
                    const datei = new File([blob], item.name, { type: 'application/pdf' });
                    await anVorgangHaengen(passend[0].process_id, datei);
                    if (!zielId) zielId = await zielOrdnerId(interaktiv);
                    await graph('/me/drive/items/' + item.id, 'PATCH',
                        { parentReference: { id: zielId }, '@microsoft.graph.conflictBehavior': 'rename' }, interaktiv);
                    delete merker[item.id];
                    erg.zugeordnet++;
                } catch (e) {
                    console.warn('OneDrive-Eingang:', item.name, e);
                    merker[item.id] = { name: item.name, grund: 'Fehler: ' + (e.message || e), geaendert: item.lastModifiedDateTime };
                    erg.fehler++;
                }
            }
            offenSetzen(merker);
            if (erg.zugeordnet && window.fetchAngebote) { try { window.fetchAngebote(true); } catch (e) { /* egal */ } }
        } catch (e) {
            if (e.zustimmung) erg.hinweis = 'Berechtigung „Dateien" noch nicht erteilt — einmal auf „Jetzt prüfen" klicken.';
            else if (e.status === 404) erg.hinweis = 'Ordner „' + ordner() + '" nicht gefunden.';
            else if (e.status === 403 || /consent|AADSTS65001|scope/i.test(e.message || '')) erg.hinweis = 'Microsoft verweigert den Dateizugriff — Berechtigung Files.ReadWrite in Entra fehlt (siehe unten).';
            else erg.hinweis = 'Fehler: ' + (e.message || e);
        } finally {
            laeuft = false;
            letzterLauf = { zeit: new Date(), erg };
            anzeigen();
        }
        return erg;
    }
    window.oneDriveAngebotePruefen = pruefen;

    function takt() { if (aktiv()) pruefen(false); }

    // ---------- Einstellungen → Outlook ----------
    function anzeigen() {
        const st = document.getElementById('oda-status');
        const liste = document.getElementById('oda-offen');
        if (!st || !liste) return;
        let t = aktiv() ? 'Eingeschaltet — prüft alle 5 Minuten, solange die App offen ist.' : 'Ausgeschaltet.';
        if (letzterLauf) {
            const e = letzterLauf.erg;
            t += ' Zuletzt ' + letzterLauf.zeit.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + ': ' +
                (e.hinweis || (e.zugeordnet + ' zugeordnet, ' + e.offen + ' offen' + (e.fehler ? ', ' + e.fehler + ' Fehler' : '')));
        }
        st.textContent = t;
        const o = offen();
        const ids = Object.keys(o);
        liste.innerHTML = ids.length
            ? '<p class="form-label-caps">Nicht zugeordnet (Datei umbenennen, z. B. Angebotsnummer an den Anfang):</p><ul class="oda-liste">' +
              ids.map(id => '<li><strong>' + esc(o[id].name) + '</strong><span class="text-muted-sm"> — ' + esc(o[id].grund) + '</span></li>').join('') + '</ul>'
            : '';
    }

    function einrichten() {
        const feld = document.getElementById('oda-ordner');
        const haken = document.getElementById('oda-aktiv');
        const knopf = document.getElementById('oda-pruefen');
        if (!feld || !haken || !knopf) return;
        feld.value = ordner();
        haken.checked = aktiv();
        feld.addEventListener('change', () => { ls.set(S_ORDNER, feld.value.trim()); offenSetzen({}); anzeigen(); });
        haken.addEventListener('change', () => { ls.set(S_AKTIV, haken.checked ? '1' : ''); anzeigen(); if (haken.checked) takt(); });
        knopf.addEventListener('click', async () => {
            ls.set(S_ORDNER, feld.value.trim());
            knopf.disabled = true;
            document.getElementById('oda-status').textContent = 'Prüfe …';
            try { await pruefen(true); } finally { knopf.disabled = false; }
        });
        anzeigen();
    }

    document.addEventListener('DOMContentLoaded', function () {
        einrichten();
        setInterval(takt, TAKT_MS);
    });
    // Nach der (stillen) Anmeldung einmal sofort — nicht erst nach 5 Minuten.
    let ersterLauf = false;
    document.addEventListener('outlook:status', function (e) {
        if (!ersterLauf && e.detail && e.detail.konto) { ersterLauf = true; setTimeout(takt, 5000); }
    });
})();
