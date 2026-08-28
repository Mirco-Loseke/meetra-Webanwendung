// ==========================================================
// AUFGABEN DRUCKEN
// ----------------------------------------------------------
// Knopf „Drucken" in der Aufgaben-Ansicht: Auswahlfenster mit allen offenen
// Aufgaben (Haken je Aufgabe), zusätzlich die Werkstatt-Liste, dazu die Wahl
// 1 / 2 / 3 Aufgaben nebeneinander auf einer A4-Seite.
//
// Gedruckt wird über ein verstecktes iframe auf echten A4-Seiten mit dem
// meetra-Briefbogen als Hintergrund (assets/images/vorlage_bg.jpg — dieselbe
// Vorlage wie Servicebericht und Mietvereinbarung). Bilder werden vor dem
// Druckdialog abgewartet, sonst bleiben die Rahmen leer.
//
// Datenquellen: window.getAllTasks() (js/tasks.js),
//               window.getWorkshopTasks() (js/workshop-tasks.js),
//               window.userList für die Zuständigen.
// ==========================================================
(function () {
    'use strict';

    const MODAL_ID = 'task-print-modal';
    const FRAME_ID = 'task-print-frame';

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function machineLabel(m) {
        if (typeof window.getTaskMachineLabel === 'function') return window.getTaskMachineLabel(m);
        if (!m) return '';
        let txt = `${m.manufacturer || ''} ${m.name || ''}`.trim();
        if (m.serial) txt += ` #${m.serial}`;
        if (m.year) txt += ` (${m.year})`;
        return txt;
    }

    function taskHeadline(task) {
        if (task.machines) return machineLabel(task.machines);
        if (task.workshop_order_number) return 'Werkstattauftrag ' + task.workshop_order_number;
        return '';
    }

    function userNames(assignedTo) {
        if (!Array.isArray(assignedTo) || !assignedTo.length) return [];
        return assignedTo.map(uid => {
            const u = (window.userList || []).find(x => String(x.id) === String(uid));
            return u ? (u.name || u.email || 'Unbekannt') : 'Unbekannt';
        });
    }

    function openTasks() {
        const all = typeof window.getAllTasks === 'function' ? window.getAllTasks() : [];
        return (all || []).filter(t => t.status !== 'completed');
    }

    // ---------------------------------------------------------------
    // Auswahlfenster
    // ---------------------------------------------------------------
    window.openTaskPrintModal = function () {
        const tasks = openTasks();
        if (!tasks.length) {
            window.showToast && window.showToast('Es gibt gerade keine offenen Aufgaben zum Drucken.');
            return;
        }

        document.getElementById(MODAL_ID)?.remove();

        const rows = tasks.map(t => {
            const kopf = taskHeadline(t);
            const offen = (t.subtasks || []).filter(s => s.status !== 'completed').length;
            const gesamt = (t.subtasks || []).length;
            return `
            <label class="tp-row">
                <input type="checkbox" class="tp-task" value="${esc(t.id)}" checked>
                <span class="tp-row-body">
                    ${kopf ? `<span class="tp-row-head">${esc(kopf)}</span>` : ''}
                    <span class="tp-row-title">${esc(t.title || 'Ohne Titel')}</span>
                    <span class="tp-row-sub">${gesamt ? `${offen} von ${gesamt} Unterpunkten offen` : 'keine Unterpunkte'}</span>
                </span>
            </label>`;
        }).join('');

        const werkstatt = typeof window.getWorkshopTasks === 'function' ? window.getWorkshopTasks() : [];
        const werkstattOffen = werkstatt.filter(i => !i.done).length;

        const wrap = document.createElement('div');
        wrap.id = MODAL_ID;
        wrap.className = 'modal-backdrop';
        wrap.innerHTML = `
        <div class="modal-new tp-modal" onclick="event.stopPropagation()">
            <div class="tp-head">
                <h2>Aufgaben drucken</h2>
                <button type="button" class="tp-close" onclick="window.closeTaskPrintModal()" title="Schließen">&times;</button>
            </div>

            <div class="tp-section">
                <div class="tp-label">Aufteilung auf der Seite</div>
                <div class="tp-layout-choice">
                    <label><input type="radio" name="tp-cols" value="1"> <span>1 Aufgabe pro A4-Seite</span></label>
                    <label><input type="radio" name="tp-cols" value="2" checked> <span>2 nebeneinander</span></label>
                    <label><input type="radio" name="tp-cols" value="3"> <span>3 nebeneinander</span></label>
                </div>
            </div>

            <div class="tp-section">
                <div class="tp-label-row">
                    <div class="tp-label">Offene Aufgaben (${tasks.length})</div>
                    <div class="tp-bulk">
                        <button type="button" onclick="window.taskPrintSelectAll(true)">Alle</button>
                        <button type="button" onclick="window.taskPrintSelectAll(false)">Keine</button>
                    </div>
                </div>
                <div class="tp-list">${rows}</div>
            </div>

            <div class="tp-section">
                <label class="tp-row tp-row-extra">
                    <input type="checkbox" id="tp-extra-on" onchange="window.taskPrintToggleExtra(this.checked)">
                    <span class="tp-row-body">
                        <span class="tp-row-title">Freie Felder hinzufügen</span>
                        <span class="tp-row-sub">Leere Zeilen zum Ausfüllen, unter der Überschrift „Ergänzungen"</span>
                    </span>
                    <span class="tp-extra-count">
                        <input type="number" id="tp-extra-n" min="1" max="30" value="3" disabled
                               onclick="event.preventDefault(); event.stopPropagation();">
                        <span>Zeilen</span>
                    </span>
                </label>
            </div>

            <div class="tp-section">
                <label class="tp-row tp-row-workshop">
                    <input type="checkbox" id="tp-workshop" ${werkstatt.length ? '' : 'disabled'}>
                    <span class="tp-row-body">
                        <span class="tp-row-title">Werkstatt-Liste mitdrucken</span>
                        <span class="tp-row-sub">${werkstatt.length ? `${werkstattOffen} offen von ${werkstatt.length} Einträgen` : 'keine Einträge vorhanden'}</span>
                    </span>
                </label>
            </div>

            <div class="tp-foot">
                <button type="button" class="tp-btn" onclick="window.closeTaskPrintModal()">Abbrechen</button>
                <button type="button" class="tp-btn tp-btn-primary" onclick="window.runTaskPrint()">Drucken</button>
            </div>
        </div>`;
        wrap.onclick = () => window.closeTaskPrintModal();
        document.body.appendChild(wrap);
        // .modal-backdrop steht ohne .show auf opacity:0 und pointer-events:none —
        // ohne diese Zeile ist das Fenster da, aber unsichtbar und nicht bedienbar.
        requestAnimationFrame(() => wrap.classList.add('show'));
    };

    window.closeTaskPrintModal = function () {
        document.getElementById(MODAL_ID)?.remove();
    };

    window.taskPrintToggleExtra = function (on) {
        const feld = document.getElementById('tp-extra-n');
        if (!feld) return;
        feld.disabled = !on;
        if (on) feld.focus();
    };

    window.taskPrintSelectAll = function (on) {
        document.querySelectorAll('#' + MODAL_ID + ' .tp-task').forEach(cb => { cb.checked = !!on; });
    };

    // ---------------------------------------------------------------
    // Karten — als einzelne Bausteine, nicht als ein Block
    // ---------------------------------------------------------------
    // Eine Aufgabe mit vielen Unterpunkten passt nicht immer in eine Spalte.
    // Damit sie umbrechen kann, wird sie in Bausteine zerlegt (Kopf, jede
    // Gruppenüberschrift, jede Zeile). Der Seitenaufbau setzt sie danach
    // zusammen und beginnt bei Bedarf eine Fortsetzungskarte — dort ohne Bild
    // und ohne Kopfdaten, nur mit der Liste, damit sie sauber weiterläuft.

    function gruppenTitel(name) {
        return `<div class="p-group-title">${esc(name)}</div>`;
    }

    function zeileHtml(text, erledigt) {
        return `<div class="p-sub${erledigt ? ' done' : ''}">` +
            `<span class="p-box">${erledigt ? '&#10003;' : ''}</span>` +
            `<span class="p-sub-text">${esc(text || '')}</span></div>`;
    }

    function leerzeileHtml() {
        return `<div class="p-sub p-sub-leer"><span class="p-box"></span><span class="p-leerzeile"></span></div>`;
    }

    // { kopf, kopfFortsetzung, teile: [{ art: 'gruppe'|'zeile', html }] }
    function buildTask(task, extra) {
        const kopf = taskHeadline(task);
        const titel = task.title || 'Ohne Titel';
        const bild = task.machines && task.machines.image_url ? task.machines.image_url : null;
        const namen = userNames(task.assigned_to);
        const gesamt = (task.subtasks || []).length;
        const erledigt = (task.subtasks || []).filter(s => s.status === 'completed').length;

        const kopfHtml = `
            <header class="p-card-head">
                <div class="p-card-headtext">
                    ${kopf ? `<div class="p-machine">${esc(kopf)}</div>` : ''}
                    <div class="p-title">${esc(titel)}</div>
                </div>
                ${bild ? `<img class="p-thumb" src="${esc(bild)}" alt="">` : ''}
            </header>
            <div class="p-meta">
                <div><span class="p-meta-key">Zuständig:</span> ${namen.length ? esc(namen.join(', ')) : 'nicht zugeordnet'}</div>
                ${gesamt ? `<div><span class="p-meta-key">Fortschritt:</span> ${erledigt} / ${gesamt} erledigt</div>` : ''}
            </div>`;

        // Fortsetzung: schmale Zeile ohne Bild, ohne Zuständige, ohne Fortschritt.
        const fortHtml = `
            <header class="p-card-head p-card-head-cont">
                <div class="p-card-headtext">
                    <div class="p-title">${esc(titel)} <span class="p-fort">(Fortsetzung)</span></div>
                </div>
            </header>`;

        const teile = [];
        const subs = task.subtasks || [];
        if (subs.length) {
            const grouped = {};
            subs.forEach(s => {
                const g = s.supergroup || 'Allgemein';
                if (!grouped[g]) grouped[g] = [];
                grouped[g].push(s);
            });
            Object.values(grouped).forEach(list => {
                list.sort((a, b) => (a.status === 'completed' ? 1 : 0) - (b.status === 'completed' ? 1 : 0));
            });
            Object.entries(grouped).forEach(([name, list]) => {
                teile.push({ art: 'gruppe', name: name, html: gruppenTitel(name) });
                list.forEach(s => teile.push({ art: 'zeile', html: zeileHtml(s.title, s.status === 'completed') }));
            });
        }

        if (extra) {
            teile.push({ art: 'gruppe', name: 'Ergänzungen', html: gruppenTitel('Ergänzungen') });
            for (let i = 0; i < extra; i++) teile.push({ art: 'zeile', html: leerzeileHtml() });
        }

        teile.push({
            art: 'zeile',
            html: `<div class="p-notes"><div class="p-notes-title">Notizen</div>` +
                `<div class="p-lines"><span></span><span></span><span></span></div></div>`
        });

        return { kopf: kopfHtml, fort: fortHtml, teile: teile };
    }

    function buildWorkshop(items, extra) {
        const kopfHtml = `
            <header class="p-card-head">
                <div class="p-card-headtext">
                    <div class="p-machine">Werkstatt</div>
                    <div class="p-title">Werkstatt-Liste</div>
                </div>
            </header>`;
        const fortHtml = `
            <header class="p-card-head p-card-head-cont">
                <div class="p-card-headtext">
                    <div class="p-title">Werkstatt-Liste <span class="p-fort">(Fortsetzung)</span></div>
                </div>
            </header>`;

        const teile = items.map(i => ({ art: 'zeile', html: zeileHtml(i.text, i.done) }));
        if (extra) {
            teile.push({ art: 'gruppe', name: 'Ergänzungen', html: gruppenTitel('Ergänzungen') });
            for (let i = 0; i < extra; i++) teile.push({ art: 'zeile', html: leerzeileHtml() });
        }
        return { kopf: kopfHtml, fort: fortHtml, teile: teile };
    }

    // ---------------------------------------------------------------
    // Seitenaufbau auf dem meetra-Briefbogen
    // ---------------------------------------------------------------
    // Seitenränder wie bei der Mietvereinbarung: oben 30mm, seitlich 25mm,
    // unten 27mm — darunter liegt die Fußzeile des Briefbogens.
    //
    // `@page { margin: 0 }` ist Absicht: in den Seitenrand druckt der Browser
    // sonst seine eigene Kopf-/Fußzeile (Titel, Datum, Dateipfad). Ohne Rand
    // bleibt dafür kein Platz — der Pfad unten und das doppelte Datum oben
    // verschwinden damit.
    const SEITE_H = 297, RAND_O = 30, RAND_U = 27, RAND_S = 25, SPALT = 8;
    const INHALT_H = SEITE_H - RAND_O - RAND_U;   // 240mm
    const INHALT_B = 210 - 2 * RAND_S;            // 160mm

    function vorlageUrl() {
        try { return new URL('assets/images/vorlage_bg.jpg', document.baseURI).href; }
        catch (e) { return 'assets/images/vorlage_bg.jpg'; }
    }

    function printStyles(cols) {
        const spaltenB = (INHALT_B - SPALT * (cols - 1)) / cols;
        const bildG = cols === 1 ? 50 : (cols === 2 ? 28 : 20);
        const titelG = cols === 1 ? '18pt' : (cols === 2 ? '14pt' : '12pt');
        const textG = cols === 1 ? '13pt' : (cols === 2 ? '10.5pt' : '9.5pt');

        return `
        @page { size: A4 portrait; margin: 0; }
        html, body { margin: 0; padding: 0; background: #fff; }
        body { font-family: Arial, Helvetica, sans-serif; color: #111; }
        * { box-sizing: border-box; }

        .p-page {
            position: relative;
            width: 210mm;
            height: ${SEITE_H}mm;
            padding: ${RAND_O}mm ${RAND_S}mm ${RAND_U}mm;
            background-image: url("${vorlageUrl()}");
            background-size: 210mm ${SEITE_H}mm;
            background-repeat: no-repeat;
            background-position: center;
            overflow: hidden;
            page-break-after: always;
            break-after: page;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
        }
        .p-page:last-child { page-break-after: auto; break-after: auto; }

        .p-head { display: flex; align-items: baseline; justify-content: space-between; gap: 6mm;
                  border-bottom: 1.2pt solid #111; padding-bottom: 2.5mm; margin-bottom: 4mm; }
        .p-head-left { display: flex; align-items: baseline; gap: 4mm; }
        .p-head h1 { font-size: 17pt; margin: 0; }
        .p-head span { font-size: 10.5pt; color: #444; }

        .p-cols { display: flex; gap: ${SPALT}mm; align-items: flex-start; }
        .p-col { width: ${spaltenB}mm; flex: 0 0 ${spaltenB}mm; }

        .p-card { border: 1pt solid #333; border-radius: 2.5mm; padding: 3.5mm; margin-bottom: 4mm;
                  background: rgba(255, 255, 255, 0.86); }
        .p-card-head { display: flex; gap: 3mm; align-items: flex-start; justify-content: space-between;
                       border-bottom: 0.7pt solid #bbb; padding-bottom: 2mm; margin-bottom: 2mm; }
        .p-card-headtext { min-width: 0; }
        .p-machine { font-size: ${cols === 1 ? '15.5pt' : (cols === 2 ? '13.5pt' : '12pt')}; font-weight: bold; text-transform: uppercase;
                     letter-spacing: 0.3pt; color: #10a068; }
        .p-title { font-weight: bold; margin-top: 1mm; line-height: 1.25; font-size: ${titelG}; }
        .p-thumb { width: ${bildG}mm; height: ${bildG}mm; object-fit: cover; border: 0.7pt solid #999;
                   border-radius: 1.5mm; flex-shrink: 0; }
        .p-meta { font-size: ${textG}; color: #222; margin-bottom: 2mm; line-height: 1.45; }
        .p-meta-key { font-weight: bold; }
        /* Fortsetzung nach einem Umbruch: kein Bild, keine Kopfdaten —
           nur eine schmale Zeile, damit die Liste sauber weiterläuft. */
        .p-card-head-cont { padding-bottom: 1.5mm; margin-bottom: 1.5mm; border-bottom: 0.5pt solid #ccc; }
        .p-card-head-cont .p-title { margin-top: 0; font-size: ${cols === 1 ? '14pt' : '11.5pt'}; }
        .p-fort { font-weight: normal; font-style: italic; color: #555; font-size: ${cols === 3 ? '8.5pt' : '9.5pt'}; }

        .p-group { margin-top: 2mm; }
        .p-group-title { margin-top: 2mm; font-size: ${cols === 3 ? '8.5pt' : '9.5pt'}; font-weight: bold; text-transform: uppercase;
                         letter-spacing: 0.4pt; color: #333; border-bottom: 0.5pt solid #ddd;
                         padding-bottom: 0.6mm; margin-bottom: 1.2mm; }
        .p-sub { display: flex; gap: 1.8mm; align-items: flex-start; padding: 0.6mm 0; font-size: ${textG}; line-height: 1.3; }
        .p-sub.done .p-sub-text { text-decoration: line-through; color: #666; }
        .p-box { display: inline-block; width: 4mm; height: 4mm; border: 0.9pt solid #333;
                 border-radius: 0.6mm; flex-shrink: 0; margin-top: 0.5mm; text-align: center;
                 line-height: 3.8mm; font-size: 8.5pt; }
        .p-sub-leer { padding: 1.2mm 0; }
        .p-leerzeile { flex: 1; border-bottom: 0.5pt dotted #999; height: ${cols === 1 ? '6mm' : '4.5mm'}; }
        .p-notes { margin-top: 2.5mm; }
        .p-notes-title { font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.4pt; color: #666; }
        .p-lines span { display: block; border-bottom: 0.5pt dotted #999; height: ${cols === 1 ? '7mm' : '5mm'}; }
        `;
    }

    // Karten auf Spalten und Seiten verteilen. Gemessen wird im Druckdokument
    // selbst bei echter Spaltenbreite — nur so passt die Aufteilung auch,
    // wenn eine Aufgabe zwanzig Unterpunkte hat. Passt eine Aufgabe nicht mehr
    // in die Spalte, bricht sie um und läuft in der nächsten Spalte bzw. auf
    // der nächsten Seite als Fortsetzung weiter (ohne Bild, nur die Liste).
    function verteile(doc, dokumente, cols) {
        const mess = doc.createElement('div');
        mess.className = 'p-col';
        mess.style.cssText = 'position:absolute; left:-10000mm; top:0; visibility:hidden;';
        const messKarte = doc.createElement('section');
        messKarte.className = 'p-card';
        mess.appendChild(messKarte);
        doc.body.appendChild(mess);

        const probe = doc.createElement('div');
        probe.style.cssText = 'height:100mm;';
        mess.appendChild(probe);
        const pxProMm = (probe.getBoundingClientRect().height / 100) || 3.78;
        probe.remove();

        const mm = (el) => el.getBoundingClientRect().height / pxProMm;
        // Rahmen, Innenabstand und Abstand zur nächsten Karte kosten Platz,
        // unabhängig vom Inhalt — einmal an der leeren Karte gemessen.
        messKarte.innerHTML = '';
        const rahmen = mm(messKarte) + 4;

        const hoehe = (html) => { messKarte.innerHTML = html; return mm(messKarte) - (rahmen - 4); };

        dokumente.forEach(d => {
            d.hKopf = hoehe(d.kopf);
            d.hFort = hoehe(d.fort);
            d.teile.forEach(t => { t.h = hoehe(t.html); });
        });
        mess.remove();

        // Kopfzeile auf jeder Seite: links „Aufgaben" (mit Stand nur auf der
        // ersten), rechts der Maschinentitel der ersten Aufgabe dieser Seite.
        const KOPF_H = 14;
        const seiten = [];
        let seite = null, spalte = null, frei = 0;

        const neueSpalte = () => {
            spalte = [];
            seite.spalten.push(spalte);
            frei = INHALT_H - KOPF_H;
        };
        const neueSeite = () => {
            seite = { spalten: [], stand: seiten.length === 0 };
            seiten.push(seite);
            neueSpalte();
        };
        const weiter = () => {
            if (seite.spalten.length >= cols) neueSeite();
            else neueSpalte();
        };

        neueSeite();

        dokumente.forEach(d => {
            // Eine Aufgabe je Seite: ausdrücklich so gewünscht, hier wird nur
            // umgebrochen, wenn der Inhalt selbst zu lang ist.
            if (cols === 1 && spalte.length) neueSeite();

            let i = 0;
            let ersteKarte = true;
            let offeneGruppe = null;   // für die Wiederholung nach dem Umbruch

            while (i < d.teile.length) {
                const kopfHtml = ersteKarte ? d.kopf : d.fort;
                let genutzt = ersteKarte ? d.hKopf : d.hFort;
                const stuecke = [kopfHtml];

                // Nach einem Umbruch die laufende Gruppenüberschrift wiederholen,
                // sonst stehen die Zeilen auf der neuen Seite ohne Bezug da.
                if (!ersteKarte && offeneGruppe) {
                    stuecke.push(offeneGruppe.html);
                    genutzt += offeneGruppe.h;
                }

                if (genutzt + rahmen > frei && spalte.length) { weiter(); continue; }

                let gesetzt = 0;
                while (i < d.teile.length) {
                    const t = d.teile[i];
                    // Eine Überschrift ganz unten wäre eine Waise — dann lieber
                    // gleich mit ihr umbrechen (nur wenn schon etwas dasteht).
                    const nachfolger = t.art === 'gruppe' && d.teile[i + 1] ? d.teile[i + 1].h : 0;
                    if (gesetzt > 0 && genutzt + t.h + nachfolger + rahmen > frei) break;

                    stuecke.push(t.html);
                    genutzt += t.h;
                    if (t.art === 'gruppe') offeneGruppe = t;
                    gesetzt++;
                    i++;
                }

                spalte.push(`<section class="p-card">${stuecke.join('')}</section>`);
                frei -= genutzt + rahmen;
                ersteKarte = false;

                if (i < d.teile.length) weiter();
            }
        });

        return seiten;
    }

    window.runTaskPrint = function () {
        const modal = document.getElementById(MODAL_ID);
        if (!modal) return;

        const ids = [...modal.querySelectorAll('.tp-task:checked')].map(cb => cb.value);
        const mitWerkstatt = !!modal.querySelector('#tp-workshop')?.checked;
        if (!ids.length && !mitWerkstatt) {
            window.showToast && window.showToast('Bitte mindestens eine Aufgabe auswählen.');
            return;
        }
        const cols = parseInt(modal.querySelector('input[name="tp-cols"]:checked')?.value || '2', 10);

        // Reihenfolge wie auf der Tafel, nicht die Klick-Reihenfolge.
        const gewaehlt = openTasks().filter(t => ids.includes(String(t.id)));
        const werkstatt = mitWerkstatt && typeof window.getWorkshopTasks === 'function'
            ? window.getWorkshopTasks() : [];

        // Freie Felder: Anzahl nur, wenn der Haken gesetzt ist.
        const extraAn = !!modal.querySelector('#tp-extra-on')?.checked;
        const extra = extraAn
            ? Math.min(30, Math.max(1, parseInt(modal.querySelector('#tp-extra-n')?.value || '3', 10) || 3))
            : 0;

        const dokumente = gewaehlt.map(t => buildTask(t, extra));
        if (werkstatt.length) dokumente.push(buildWorkshop(werkstatt, extra));

        const datum = new Date().toLocaleDateString('de-DE', {
            day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
        });

        window.closeTaskPrintModal();
        druckeInFrame(printStyles(cols), dokumente, cols, datum);
    };

    // Druck über ein verstecktes iframe: kein Popup-Blocker, und die dunkle
    // App-Oberfläche bleibt außen vor.
    function druckeInFrame(css, dokumente, cols, datum) {
        document.getElementById(FRAME_ID)?.remove();

        const frame = document.createElement('iframe');
        frame.id = FRAME_ID;
        frame.setAttribute('aria-hidden', 'true');
        // Volle A4-Breite: in einem 0px-Fenster käme beim Messen Unsinn heraus.
        frame.style.cssText = 'position:fixed; right:0; bottom:0; width:230mm; height:300mm; border:0; opacity:0; pointer-events:none; z-index:-1;';
        document.body.appendChild(frame);

        const doc = frame.contentWindow.document;
        doc.open();
        doc.write('<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><title>Aufgaben</title><style>' + css + '</style></head><body></body></html>');
        doc.close();

        const seiten = verteile(doc, dokumente, cols);
        // Kopfzeile je Seite: „Aufgaben", der Stand nur einmal auf der ersten Seite.
        const kopf = (s) => `
            <div class="p-head">
                <div class="p-head-left">
                    <h1>Aufgaben</h1>
                    ${s.stand ? `<span>Stand: ${esc(datum)} Uhr</span>` : ''}
                </div>
            </div>`;

        doc.body.innerHTML = seiten.map(s => `
            <div class="p-page">
                ${kopf(s)}
                <div class="p-cols">${s.spalten.map(sp => `<div class="p-col">${sp.join('')}</div>`).join('')}</div>
            </div>`).join('');

        // Erst drucken, wenn Briefbogen und Maschinenbilder da sind — sonst
        // bleiben die Rahmen leer. Nach 10 Sekunden wird ohne sie gedruckt.
        const bilder = [...doc.images];
        const briefbogen = new Image();
        briefbogen.src = vorlageUrl();

        let offen = bilder.filter(img => !img.complete).length + (briefbogen.complete ? 0 : 1);
        let gedruckt = false;

        const los = () => {
            if (gedruckt) return;
            gedruckt = true;
            frame.contentWindow.focus();
            frame.contentWindow.print();
            // Das iframe erst nach dem Dialog entfernen (Firefox bricht sonst ab).
            setTimeout(() => frame.remove(), 60000);
        };

        if (!offen) { setTimeout(los, 150); return; }
        const fertig = () => { if (--offen <= 0) setTimeout(los, 150); };
        bilder.forEach(img => {
            if (img.complete) return;
            img.addEventListener('load', fertig, { once: true });
            img.addEventListener('error', fertig, { once: true });
        });
        if (!briefbogen.complete) {
            briefbogen.addEventListener('load', fertig, { once: true });
            briefbogen.addEventListener('error', fertig, { once: true });
        }
        setTimeout(los, 10000);
    }
})();
