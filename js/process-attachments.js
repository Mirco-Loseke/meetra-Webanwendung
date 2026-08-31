// ==========================================
// DOKUMENTE AN VORGÄNGEN UND SCHRITTEN
// ==========================================
// Hochgeladen wird nach Cloudflare R2 über den vorhandenen
// window.FileUploadService (js/file-upload-service-r2.js) — dieselbe
// Anbindung wie bei Maschinenfotos und Dokumenten.
//
// ABLAGE
// Der Pfad im Bucket beginnt IMMER mit der Vorgangs-ID:
//     vorgaenge/<vorgang-id>/<zeitstempel>-<dateiname>
// Damit liegt im Speicher alles zu einem Vorgang beieinander, auch wenn
// später jemand direkt im Bucket nachsieht. Der Zeitstempel verhindert,
// dass zwei gleichnamige Dateien einander überschreiben.
//
// VERWEISE
// Die Liste steht in internal_processes.attachments (JSONB):
//     { id, name, url, path, size, type, at, by, step_id }
// step_id = null  -> Dokument hängt am VORGANG
// step_id = "..." -> Dokument hängt an genau DIESEM Schritt
//
// Bewusst EINE gemeinsame Liste statt Dateien in steps[] zu verschachteln:
// die Schritte werden an mehreren Stellen komplett neu geschrieben
// (Sortieren, Abhaken, Text ändern) — verschachtelte Dateien gingen dabei
// leicht verloren. So ist ein Schritt löschbar, ohne dass die Datei-Liste
// angefasst werden muss.
//
// Voraussetzung: supabase/supabase_add_process_attachments.sql
// ==========================================
(function () {
    'use strict';

    const MAX_MB = 5;
    const MAX_BYTES = MAX_MB * 1024 * 1024;

    let aktuelleId = null;     // Vorgang, dessen Fenster gerade offen ist
    let aktuellerStep = null;  // null = Dokumente am Vorgang

    function sb() { return window.supabaseClient; }

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    function proc(id) {
        return (window.eventsState && window.eventsState.processes || [])
            .find(p => String(p.id) === String(id)) || null;
    }

    function liste(p) {
        return Array.isArray(p && p.attachments) ? p.attachments : [];
    }

    // Dokumente eines Vorgangs bzw. eines einzelnen Schritts.
    window.processAttachmentsFor = function (p, stepId) {
        return liste(p).filter(f => stepId
            ? String(f.step_id) === String(stepId)
            : !f.step_id);
    };

    window.processAttachCount = function (processId, stepId) {
        return window.processAttachmentsFor(proc(processId), stepId).length;
    };

    function groesse(bytes) {
        const n = Number(bytes) || 0;
        if (n < 1024) return n + ' B';
        if (n < 1024 * 1024) return (n / 1024).toFixed(0) + ' KB';
        return (n / 1024 / 1024).toFixed(1) + ' MB';
    }

    function symbol(typ, name) {
        const t = (typ || '') + ' ' + (name || '');
        if (/pdf/i.test(t)) return '📕';
        if (/image|png|jpe?g|webp|gif|heic/i.test(t)) return '🖼️';
        if (/word|doc/i.test(t)) return '📘';
        if (/excel|sheet|xls|csv/i.test(t)) return '📗';
        if (/zip|rar|7z/i.test(t)) return '🗜️';
        return '📄';
    }

    // ---------------------------------------------------------------
    // Fenster
    // ---------------------------------------------------------------
    function ensureModal() {
        if (document.getElementById('proc-att-modal')) return;
        const el = document.createElement('div');
        el.id = 'proc-att-modal';
        el.className = 'modal-backdrop hidden';
        el.style.cssText = 'z-index: 10070; display:none; align-items:flex-start; justify-content:center;';
        el.innerHTML =
            '<div class="modal-content glass-card proc-att-box">' +
                '<div class="proc-att-head">' +
                    '<div>' +
                        '<h2>Dokumente</h2>' +
                        '<div id="proc-att-subtitle" class="proc-att-sub"></div>' +
                    '</div>' +
                    '<button type="button" class="proc-att-close" onclick="window.closeProcessAttachments()" title="Schliessen">&times;</button>' +
                '</div>' +
                '<label class="proc-att-drop" id="proc-att-drop">' +
                    '<input type="file" id="proc-att-input" multiple style="display:none;">' +
                    '<span class="proc-att-drop-ic">📎</span>' +
                    '<span class="proc-att-drop-txt">Datei wählen oder hierher ziehen</span>' +
                    '<span class="proc-att-drop-hint">höchstens ' + MAX_MB + ' MB je Datei</span>' +
                '</label>' +
                '<div id="proc-att-status" class="proc-att-status"></div>' +
                '<div id="proc-att-list" class="proc-att-list"></div>' +
            '</div>';
        document.body.appendChild(el);

        el.addEventListener('click', (e) => { if (e.target === el) window.closeProcessAttachments(); });

        const input = el.querySelector('#proc-att-input');
        input.addEventListener('change', () => {
            if (input.files && input.files.length) hochladen(Array.from(input.files));
            input.value = '';
        });

        const drop = el.querySelector('#proc-att-drop');
        ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, (e) => {
            e.preventDefault(); e.stopPropagation(); drop.classList.add('is-over');
        }));
        ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, (e) => {
            e.preventDefault(); e.stopPropagation(); drop.classList.remove('is-over');
        }));
        drop.addEventListener('drop', (e) => {
            const f = e.dataTransfer && e.dataTransfer.files;
            if (f && f.length) hochladen(Array.from(f));
        });
    }

    function status(text, fehler) {
        const box = document.getElementById('proc-att-status');
        if (!box) return;
        box.textContent = text || '';
        box.classList.toggle('is-error', !!fehler);
    }

    window.openProcessAttachments = function (processId, stepId, event) {
        if (event) event.stopPropagation();
        const p = proc(processId);
        if (!p) { window.showToast('Vorgang nicht gefunden.'); return; }

        ensureModal();
        aktuelleId = processId;
        aktuellerStep = stepId || null;

        const sub = document.getElementById('proc-att-subtitle');
        if (sub) {
            const schritt = aktuellerStep
                ? (Array.isArray(p.steps) ? p.steps.find(s => String(s.id) === String(aktuellerStep)) : null)
                : null;
            sub.textContent = schritt
                ? 'Schritt: ' + (schritt.text || '').slice(0, 80)
                : (p.title || 'Vorgang');
        }
        status('');
        zeichnen();

        const modal = document.getElementById('proc-att-modal');
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
        requestAnimationFrame(() => modal.classList.add('show'));
    };

    window.closeProcessAttachments = function () {
        const modal = document.getElementById('proc-att-modal');
        if (!modal) return;
        modal.classList.remove('show');
        setTimeout(() => { modal.classList.add('hidden'); modal.style.display = 'none'; }, 250);
        aktuelleId = null;
        aktuellerStep = null;
    };

    function zeichnen() {
        const box = document.getElementById('proc-att-list');
        if (!box) return;
        const dateien = window.processAttachmentsFor(proc(aktuelleId), aktuellerStep);
        if (!dateien.length) {
            box.innerHTML = '<div class="proc-att-empty">Noch keine Dokumente hinterlegt.</div>';
            return;
        }
        box.innerHTML = dateien.map(f => {
            const wann = f.at ? new Date(f.at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
            return '<div class="proc-att-item">' +
                '<span class="proc-att-ic">' + symbol(f.type, f.name) + '</span>' +
                '<a class="proc-att-name" href="' + esc(f.url) + '" target="_blank" rel="noopener" title="Öffnen">' + esc(f.name) + '</a>' +
                '<span class="proc-att-meta">' + esc(groesse(f.size)) + (wann ? ' · ' + esc(wann) : '') + (f.by ? ' · ' + esc(f.by) : '') + '</span>' +
                '<button type="button" class="proc-att-del delete-permission-required" title="Löschen" ' +
                    'onclick="window.deleteProcessAttachment(\'' + esc(f.id) + '\')">&times;</button>' +
            '</div>';
        }).join('');
    }

    // ---------------------------------------------------------------
    // Hochladen
    // ---------------------------------------------------------------
    function sicherName(name) {
        return String(name || 'datei')
            .replace(/[^\w.\-]+/g, '_')
            .replace(/_+/g, '_')
            .slice(-120);
    }

    async function speichern(neueListe) {
        const { error } = await sb().from('internal_processes')
            .update({ attachments: neueListe }).eq('id', aktuelleId);
        if (error) throw error;
        const p = proc(aktuelleId);
        if (p) p.attachments = neueListe;
    }

    async function hochladen(dateien) {
        if (!aktuelleId) return;
        if (!window.FileUploadService) { status('Der Datei-Dienst ist nicht geladen.', true); return; }

        const zuGross = dateien.filter(f => f.size > MAX_BYTES);
        if (zuGross.length) {
            status(zuGross.map(f => f.name + ' (' + groesse(f.size) + ')').join(', ')
                + ' — zu gross. Erlaubt sind ' + MAX_MB + ' MB je Datei.', true);
            dateien = dateien.filter(f => f.size <= MAX_BYTES);
            if (!dateien.length) return;
        }

        const p = proc(aktuelleId);
        const neu = liste(p).slice();

        // Nichts doppelt: was am Vorgang schon haengt, wird uebersprungen
        // (Inhaltsvergleich bzw. Dateiname + Groesse, js/photo-dedupe.js).
        if (window.PhotoDedupe) {
            const geprueft = await window.PhotoDedupe.pruefeAuswahl(dateien, neu);
            if (geprueft.doppelt.length) {
                status(geprueft.doppelt.length === 1
                    ? '„' + geprueft.doppelt[0] + '" hängt bereits am Vorgang — übersprungen.'
                    : geprueft.doppelt.length + ' Dateien hängen bereits am Vorgang — übersprungen.');
            }
            dateien = geprueft.neu.map(e => e.file);
            if (!dateien.length) return;
        }

        let fehler = 0;

        for (let i = 0; i < dateien.length; i++) {
            const f = dateien[i];
            status('Lade hoch … ' + (i + 1) + ' von ' + dateien.length + ' (' + f.name + ')');
            try {
                // Pfad beginnt mit der Vorgangs-ID -> im Bucket liegt alles
                // zu einem Vorgang beieinander.
                const pfad = 'vorgaenge/' + aktuelleId + '/' + Date.now() + '-' + sicherName(f.name);
                const res = await window.FileUploadService.uploadFile(f, {
                    path: pfad,
                    provider: 'cloudflare-r2',
                    // Nicht komprimieren: ein hochgeladenes Dokument soll
                    // unverändert bleiben, auch wenn es ein Scan/Foto ist.
                    compress: false
                });
                neu.push({
                    id: 'att_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
                    name: f.name,
                    url: res.url,
                    path: res.path,
                    size: res.size,
                    type: res.type || f.type || '',
                    at: new Date().toISOString(),
                    by: (window.activeUser && window.activeUser.name) || null,
                    step_id: aktuellerStep || null
                });
            } catch (e) {
                console.error('Dokument konnte nicht hochgeladen werden:', e);
                fehler++;
            }
        }

        try {
            await speichern(neu);
            status(fehler
                ? (fehler + ' Datei(en) konnten nicht hochgeladen werden — Rest gespeichert.')
                : '', !!fehler);
        } catch (e) {
            console.error('Dokumentliste nicht speicherbar:', e);
            status(/attachments|column|schema cache|42703|PGRST204/i.test(e.message || '')
                ? 'In der Datenbank fehlt die Spalte attachments. Bitte supabase/supabase_add_process_attachments.sql ausführen.'
                : 'Konnte nicht gespeichert werden: ' + (e.message || e), true);
            return;
        }

        zeichnen();
        aktualisiereAnzeigen();
    }

    window.deleteProcessAttachment = async function (attId) {
        if (typeof window.canDelete === 'function' && !window.canDelete('Dokumenten')) return;
        const p = proc(aktuelleId);
        const eintrag = liste(p).find(f => String(f.id) === String(attId));
        if (!eintrag) return;
        if (!confirm('„' + eintrag.name + '" wirklich löschen?')) return;

        // Erst die Datenbank, dann der Speicher: bleibt die Datei im Bucket
        // liegen, ist das nur Ballast — ein Verweis auf eine geloeschte Datei
        // waere dagegen ein toter Link in der Liste.
        try {
            await speichern(liste(p).filter(f => String(f.id) !== String(attId)));
        } catch (e) {
            status('Konnte nicht gelöscht werden: ' + (e.message || e), true);
            return;
        }
        try {
            if (window.FileUploadService && eintrag.path) {
                await window.FileUploadService.deleteFile(eintrag.path, { provider: 'cloudflare-r2' });
            }
        } catch (e) {
            console.warn('Datei blieb im Speicher liegen:', e);
        }
        zeichnen();
        aktualisiereAnzeigen();
    };

    // Zähler an den Knöpfen aktualisieren, ohne das ganze Fenster neu zu bauen.
    function aktualisiereAnzeigen() {
        if (typeof window.renderProcessSteps === 'function') {
            ['edit-process', 'steps-modal'].forEach(pre => {
                if (document.getElementById(pre + '-steps-list')) window.renderProcessSteps(pre);
            });
        }
        if (typeof window.updateProcessAttachButton === 'function') window.updateProcessAttachButton();
        if (typeof window.renderProcesses === 'function') window.renderProcesses();
    }

    // Dokumente eines einzelnen Schritts entfernen — Datei UND Verweis.
    // Wird beim Löschen eines Schritts aufgerufen (js/processes-ui.js).
    window.deleteProcessStepFiles = async function (processId, stepId) {
        const p = proc(processId);
        if (!p || !stepId) return 0;
        const betroffen = liste(p).filter(f => String(f.step_id) === String(stepId));
        if (!betroffen.length) return 0;

        const rest = liste(p).filter(f => String(f.step_id) !== String(stepId));
        const { error } = await sb().from('internal_processes')
            .update({ attachments: rest }).eq('id', processId);
        if (error) throw error;
        p.attachments = rest;

        for (const f of betroffen) {
            try {
                if (window.FileUploadService && f.path) {
                    await window.FileUploadService.deleteFile(f.path, { provider: 'cloudflare-r2' });
                }
            } catch (e) {
                console.warn('Datei blieb im Speicher liegen:', f.path, e);
            }
        }
        return betroffen.length;
    };

    // ---------------------------------------------------------------
    // Aufräumen, wenn ein Vorgang gelöscht wird
    // ---------------------------------------------------------------
    // Wird VOR dem Löschen des Datensatzes aufgerufen (js/processes.js).
    // Danach wäre die Liste der Verweise weg und die Dateien lägen für immer
    // im Bucket, ohne dass jemand noch wüsste, wozu sie gehören.
    //
    // Zwei Wege, absichtlich beide:
    //   1) die in attachments vermerkten Pfade — der Normalfall
    //   2) zusätzlich alles unter vorgaenge/<id>/ auflisten und löschen.
    //      Das erwischt auch Dateien, deren Verweis mal verloren ging (z. B.
    //      wenn ein Speichern nach dem Hochladen fehlschlug).
    window.deleteProcessFiles = async function (processId) {
        if (!processId || !window.FileUploadService) return;
        const p = proc(processId);
        const pfade = new Set(liste(p).map(f => f.path).filter(Boolean));

        // Alles im Ordner des Vorgangs einsammeln.
        try {
            if (typeof window.loadAWSSDK === 'function') {
                await window.loadAWSSDK();
                const s3 = new AWS.S3({
                    endpoint: 'https://855feaccf4d0215922275100e91c4656.r2.cloudflarestorage.com',
                    accessKeyId: '49a3cbad28594d9d5a90e46f3965133b',
                    secretAccessKey: '0642e23714ce5c9f805d0c2f8f59e7c9df01ba8ba7a728b9640b0db5341de797',
                    region: 'auto',
                    signatureVersion: 'v4'
                });
                const bucket = window.R2_BUCKET_NAME || 'dateien';
                let token;
                do {
                    const res = await s3.listObjectsV2({
                        Bucket: bucket,
                        Prefix: 'vorgaenge/' + processId + '/',
                        ContinuationToken: token
                    }).promise();
                    (res.Contents || []).forEach(o => { if (o.Key) pfade.add(o.Key); });
                    token = res.IsTruncated ? res.NextContinuationToken : null;
                } while (token);
            }
        } catch (e) {
            console.warn('Ordner des Vorgangs konnte nicht aufgelistet werden — es werden nur die vermerkten Dateien gelöscht:', e);
        }

        for (const pfad of pfade) {
            try {
                await window.FileUploadService.deleteFile(pfad, { provider: 'cloudflare-r2' });
            } catch (e) {
                console.warn('Datei konnte nicht gelöscht werden:', pfad, e);
            }
        }
        return pfade.size;
    };

    // Knopf-Beschriftung im Bearbeiten-Fenster.
    window.updateProcessAttachButton = function () {
        const btn = document.getElementById('edit-process-att-btn');
        if (!btn) return;
        const id = (document.getElementById('edit-process-id') || {}).value;
        const n = id ? window.processAttachCount(id, null) : 0;
        btn.textContent = n ? '📎 Dokumente (' + n + ')' : '📎 Dokument hinzufügen';
    };
})();
