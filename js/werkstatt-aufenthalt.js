/* werkstatt-aufenthalt.js — Werkstattaufenthalt einer Maschine mit Aufgaben und Abschlussbericht
 *
 *   Beginnen (Werkstatt-Knopf auf der Maschinenkarte → Auftragsnummer): nach dem Original
 *   `processWorkshopToggle` entsteht eine Zeile in `werkstatt_aufenthalte`, danach
 *   öffnet sich das normale Fenster „Neue Aufgabe“ mit Maschine und Nummer vorbelegt.
 *   Beenden: statt des Originals fragt ein Fenster nach Datum (vorbelegt heute), Betriebsstunden,
 *   Bemerkung und — falls offen — ob die verknüpften Aufgaben erledigt werden. Danach PDF-Bericht
 *   (KI-Zusammenfassung über kiPseudonym.fetchMaskiert, Kunde, Aufgaben + Unteraufgaben, Abschluss)
 *   nach R2 `<Maschinenordner>/werkstattberichte/` + `documents` (Kategorie „Werkstattberichte“).
 *   Verknüpfung Aufgabe ↔ Aufenthalt: `tasks.workshop_order_number` = Auftragsnummer (+ machine_id).
 *
 *   window.openWerkstattAufenthalt(machineId, berichtZeile?)  normales Fenster „Neue Aufgabe“ mit Maschine + Auftrag
 *   Migration supabase_add_werkstatt_aufenthalte.sql (ohne Tabelle läuft alles außer der Ablage der Eckdaten).
 */
(function () {
    'use strict';
    const sb = () => window.supabaseClient;
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const toast = (t, art) => { if (window.showToast) window.showToast(t, art); };
    const ORDNER = 'Werkstattberichte';
    const heute = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
    const datumDe = iso => (iso || '').slice(0, 10).split('-').reverse().join('.');
    const sauber = t => String(t || '').trim().replace(/[^a-zA-Z0-9äöüÄÖÜß_\-]+/g, '_').replace(/^_+|_+$/g, '');
    const offen = t => t.status !== 'completed';
    let S = null;

    function maschine(id) {
        return (window.machineById && window.machineById(id)) || (window.machineList || []).find(m => String(m.id) === String(id)) || null;
    }
    const maschinenName = m => m ? [m.manufacturer, m.name].filter(Boolean).join(' ') + (m.serial ? ' · SN ' + m.serial : '') : '';

    // ------------------------------------------------------------ Daten
    async function aufenthaltSuchen(mid, nr) {
        try {
            let q = sb().from('werkstatt_aufenthalte').select('*').eq('machine_id', parseInt(mid, 10));
            if (nr) q = q.eq('auftragsnummer', nr);
            const { data, error } = await q.order('beginn', { ascending: false }).limit(1);
            if (error) return null;
            return data && data[0] || null;
        } catch (e) { return null; }
    }

    async function aufgabenLaden(mid, nr) {
        const { data, error } = await sb().from('tasks').select('*, subtasks(*)').eq('workshop_order_number', nr).order('created_at', { ascending: true });
        if (error) throw error;
        // Gleiche Nummer an anderer Maschine (Nummern wiederholen sich jährlich nicht, aber sicher ist sicher)
        return (data || []).filter(t => !t.machine_id || String(t.machine_id) === String(mid));
    }

    async function letzteStunden(id) {
        try {
            const { data } = await sb().from('manual_history_entries').select('content')
                .eq('machine_id', id).eq('type', 'hours').order('created_at', { ascending: false }).limit(1);
            return data && data[0] && data[0].content ? String(data[0].content).trim() : '';
        } catch (e) { return ''; }
    }

    // ------------------------------------------------------------ Fenster
    function box() { return document.getElementById('wa-fenster'); }
    function overlay(inhalt) {
        const alt = box(); if (alt) alt.remove();
        const b = document.createElement('div');
        b.id = 'wa-fenster';
        b.className = 'ea-overlay wa-overlay';
        b.innerHTML = '<div class="ea-panel wa-panel" role="dialog" aria-modal="true">' + inhalt + '</div>';
        document.body.appendChild(b);
        b.addEventListener('click', klick);
        b.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'wa-neu-titel') { e.preventDefault(); aufgabeAnlegen(); } });
        return b;
    }
    const kopf = titel => `<div class="fenster-kopf"><h2>${esc(titel)}</h2><button type="button" class="knopf-x" data-wa="zu" aria-label="Schließen" title="Schließen">✕</button></div>`;

    function klick(e) {
        const a = e.target.closest('[data-wa]'); if (!a) return;
        const was = a.dataset.wa, id = a.dataset.id;
        if (was === 'zu') { const b = box(); if (b) b.remove(); if (window.maschinenZentraleNeuLaden) window.maschinenZentraleNeuLaden(S.m.id); return; }
        if (was === 'ende-ok') return beendenAusfuehren();
        if (was === 'ende-abbrechen') { const b = box(); if (b) b.remove(); return; }
    }

    // Einstieg aus der Zentrale (Verlauf „Werkstattaufenthalt Beginn/Ende“) oder nach dem Beginnen:
    // das normale Fenster „Neue Aufgabe“ mit Maschine und Werkstattauftrag vorbelegt
    window.openWerkstattAufenthalt = async function (machineId, bericht, opts) {
        const m = maschine(machineId);
        if (!m) { toast('Maschine nicht gefunden.'); return; }
        const ausText = bericht && /Auftrag:\s*(\S+)/i.exec(bericht.description || '');
        let nr = (opts && opts.nr) || (ausText && ausText[1]) || null;
        if (!nr) { const zeile = await aufenthaltSuchen(m.id, null); nr = zeile && zeile.auftragsnummer; }
        if (!nr && (m.is_in_workshop || m.in_workshop)) nr = m.workshop_order_number || null;
        if (!window.openTaskModalFuerAuftrag) { toast('Aufgaben-Fenster nicht verfügbar.'); return; }
        // Hängt schon eine Aufgabe am Auftrag → diese zum Weiterbearbeiten öffnen (zuerst eine offene,
        // die jüngste). Leeres Fenster „Neue Aufgabe“ nur, solange noch keine verknüpft ist.
        if (nr) {
            let dran = [];
            try { dran = await aufgabenLaden(m.id, nr); } catch (e) { dran = []; }
            const ziel = dran.filter(offen).pop() || dran[dran.length - 1];
            if (ziel && window.openTaskModal) return window.openTaskModal(ziel.id);
        }
        await window.openTaskModalFuerAuftrag(m.id, nr);
        if (nr) vorhandeneZeigen(m, nr);
    };

    // Im Fenster „Neue Aufgabe“ oben: was es zu diesem Auftrag schon gibt (öffnen) und offene
    // Aufgaben der Maschine ohne Auftrag (verknüpfen = Nummer ergänzen) — damit nichts doppelt entsteht.
    async function vorhandeneZeigen(m, nr) {
        const wrap = document.getElementById('task-workshop-order-wrapper');
        if (!wrap) return;
        let box = document.getElementById('task-wa-vorhanden');
        if (!box) { box = document.createElement('div'); box.id = 'task-wa-vorhanden'; box.className = 'wa-vorh'; wrap.parentNode.insertBefore(box, wrap.nextSibling); box.addEventListener('click', vorhandeneKlick); }
        box.dataset.mid = m.id; box.dataset.nr = nr;
        box.innerHTML = '<div class="wa-vorh-leer">Lade vorhandene Aufgaben …</div>';
        let dran = [], frei = [];
        const zeileA = await aufenthaltSuchen(m.id, nr);
        try {
            dran = await aufgabenLaden(m.id, nr);
            const { data } = await sb().from('tasks').select('id, title, status, workshop_order_number, subtasks(status)')
                .eq('machine_id', m.id).neq('status', 'completed').order('created_at', { ascending: false }).limit(40);
            frei = (data || []).filter(t => !t.workshop_order_number);
        } catch (e) { console.warn('Vorhandene Aufgaben:', e); }
        if (!document.getElementById('task-wa-vorhanden')) return;
        const fortschritt = t => { const s = t.subtasks || []; return s.length ? ` · ${s.filter(x => x.status === 'completed').length}/${s.length}` : ''; };
        const zeile = (t, knopf) => `<div class="wa-vorh-zeile${offen(t) ? '' : ' erledigt'}"><span>${esc(t.title || 'Aufgabe')}<small>${offen(t) ? 'offen' : 'erledigt'}${fortschritt(t)}</small></span>${knopf}</div>`;
        box.innerHTML = `
            <div class="wa-vorh-kopf"><b>Werkstattauftrag ${esc(nr)}</b>${berichtKnopf(m, nr, zeileA)}</div>
            ${dran.length ? `<div class="wa-vorh-titel">Schon an diesem Auftrag</div>${dran.map(t => zeile(t, `<button type="button" class="knopf knopf--bearbeiten knopf--klein" data-wav="oeffnen" data-id="${esc(t.id)}">Öffnen</button>`)).join('')}` : ''}
            ${frei.length ? `<div class="wa-vorh-titel">Offene Aufgaben dieser Maschine — zum Auftrag nehmen?</div>${frei.map(t => zeile(t, `<button type="button" class="knopf knopf--sekundaer knopf--klein" data-wav="verknuepfen" data-id="${esc(t.id)}">Verknüpfen</button>`)).join('')}` : ''}
            <div class="wa-vorh-leer">${dran.length || frei.length ? 'Oder unten eine neue Aufgabe anlegen.' : 'Noch keine Aufgaben — unten die erste anlegen.'}</div>`;
    }

    async function vorhandeneKlick(e) {
        const a = e.target.closest('[data-wav]'); if (!a) return;
        const box = document.getElementById('task-wa-vorhanden'); if (!box) return;
        const m = maschine(box.dataset.mid), nr = box.dataset.nr, id = a.dataset.id;
        if (a.dataset.wav === 'oeffnen') { if (window.openTaskModal) window.openTaskModal(id); return; }
        if (a.dataset.wav === 'vorschau') return berichtVorschau(m, nr, a);
        if (a.dataset.wav === 'bericht') return void window.open(a.dataset.url, '_blank');
        if (a.dataset.wav === 'verknuepfen') {
            a.disabled = true;
            const { error } = await sb().from('tasks').update({ workshop_order_number: nr, updated_at: new Date().toISOString() }).eq('id', id);
            if (error) { a.disabled = false; toast('Nicht verknüpft: ' + error.message, 'error'); return; }
            if (window.fetchTasks) { try { window.fetchTasks(); } catch (err) { /* Ansicht nicht offen */ } }
            vorhandeneZeigen(m, nr);
        }
    }

    // Läuft der Aufenthalt noch? Dann Vorschau; danach gibt es nur noch den abgelegten Bericht.
    function laeuft(m, nr, zeile) {
        if (zeile && zeile.ende) return false;
        return !!(m && (m.is_in_workshop || m.in_workshop) && m.workshop_order_number === nr);
    }
    function berichtKnopf(m, nr, zeile) {
        if (laeuft(m, nr, zeile)) return '<button type="button" class="knopf knopf--pdf knopf--klein" data-wav="vorschau">Bericht-Vorschau</button>';
        if (zeile && zeile.pdf_url) return '<button type="button" class="knopf knopf--pdf knopf--klein" data-wav="bericht" data-url="' + esc(zeile.pdf_url) + '">Werkstattbericht</button>';
        return '';
    }

    // PDF wie beim Beenden, nur angezeigt (nichts gespeichert). Ende = gespeichertes Ende oder heute.
    async function berichtVorschau(m, nr, knopf) {
        const t0 = knopf ? knopf.textContent : '';
        if (knopf) { knopf.disabled = true; knopf.textContent = 'Wird erstellt …'; }
        const fenster = window.open('', '_blank');
        try {
            const zeile = await aufenthaltSuchen(m.id, nr);
            let aufgaben = []; try { aufgaben = await aufgabenLaden(m.id, nr); } catch (e) { aufgaben = []; }
            delete posPuffer[nr];
            const d = {
                nr, aufgaben, sage: await sagePositionen(nr),
                beginn: (zeile && zeile.beginn) || await beginnAusVerlauf(m.id, nr) || '',
                ende: (zeile && zeile.ende) || heute(), laufend: !(zeile && zeile.ende),
                stunden: (zeile && zeile.stunden_ende) || await letzteStunden(m.id),
                bemerkung: (zeile && zeile.bemerkung) || ''
            };
            d.ki = (zeile && zeile.ki_text) || await kiZusammenfassung(m, d);
            const doc = await pdfErzeugen(m, d);
            const url = URL.createObjectURL(doc.output('blob'));
            if (fenster) fenster.location.href = url; else window.open(url, '_blank');
        } catch (e) {
            if (fenster) fenster.close();
            console.error('Vorschau:', e); toast('Vorschau fehlgeschlagen: ' + (e.message || e), 'error');
        } finally { if (knopf) { knopf.disabled = false; knopf.textContent = t0; } }
    }

    // ------------------------------------------------------------ Beenden
    async function beendenFragen(id) {
        const m = maschine(id);
        if (!m) { toast('Maschine nicht gefunden.'); return; }
        const nr = m.workshop_order_number || null;
        const zeile = await aufenthaltSuchen(m.id, nr);
        let aufgaben = [];
        if (nr) { try { aufgaben = await aufgabenLaden(m.id, nr); } catch (e) { aufgaben = []; } }
        const stunden = await letzteStunden(m.id);
        S = { m, nr, zeile, aufgaben, beenden: true };
        const offene = aufgaben.filter(offen);
        overlay(kopf('Werkstattaufenthalt beenden') +
            `<div class="ea-body wa-body">
                <p class="text-muted-sm">${esc(maschinenName(m))}${nr ? ' · Auftrag ' + esc(nr) : ''}</p>
                <section class="ew-block">
                    <label class="ew-feld"><span class="form-label-caps">Maschine hat die Werkstatt verlassen am</span>
                        <input type="date" class="glass-input" id="wa-ende-datum" value="${heute()}" max="${heute()}"></label>
                    <label class="ew-feld"><span class="form-label-caps">Betriebsstunden beim Verlassen</span>
                        <input type="text" class="glass-input" id="wa-ende-stunden" value="${esc(stunden)}" inputmode="decimal" autocomplete="off"></label>
                    <label class="ew-feld"><span class="form-label-caps">Abschlussbemerkung (kommt ins PDF)</span>
                        <textarea class="glass-input" id="wa-ende-bemerkung" rows="3"></textarea></label>
                    ${offene.length ? `<label class="ew-punkt"><input type="checkbox" id="wa-ende-erledigt"> ${offene.length === 1 ? 'Die offene Aufgabe' : 'Die ' + offene.length + ' offenen Aufgaben'} als erledigt markieren</label>
                        <p class="text-muted-sm">Ohne Haken bleiben sie offen und stehen im Bericht unter „Offen“.</p>` : ''}
                    <p class="text-muted-sm">${aufgaben.length ? aufgaben.length + ' Aufgabe(n) verknüpft. ' : ''}Beim Beenden entsteht automatisch der Werkstattbericht als PDF (Zentrale → Dokumente).</p>
                </section>
            </div>
            <div class="fenster-fuss"><span class="ea-platz"></span>
                <button type="button" class="knopf knopf--sekundaer" data-wa="ende-abbrechen">Abbrechen</button>
                <button type="button" class="knopf knopf--primaer" data-wa="ende-ok">Aufenthalt beenden</button></div>`);
    }

    async function beendenAusfuehren() {
        if (S.laeuft) return;
        const b = box(), wert = id => { const e = b.querySelector('#' + id); return e ? (e.type === 'checkbox' ? e.checked : e.value.trim()) : ''; };
        const datum = wert('wa-ende-datum') || heute();
        if (datum > heute()) { toast('Bitte kein Datum in der Zukunft wählen.'); return; }
        const stunden = wert('wa-ende-stunden'), bemerkung = wert('wa-ende-bemerkung'), alleErledigt = !!wert('wa-ende-erledigt');
        const knopf = b.querySelector('[data-wa="ende-ok"]');
        S.laeuft = true; if (knopf) { knopf.disabled = true; knopf.textContent = 'Wird beendet …'; }
        const m = S.m, nr = S.nr;
        const wann = new Date(datum + 'T12:00:00').toISOString();
        try {
            const { error } = await sb().from('machines').update({ is_in_workshop: false, workshop_order_number: null }).eq('id', m.id);
            if (error) throw error;
            m.is_in_workshop = false; m.workshop_order_number = null;
            await sb().from('service_entries').insert([{ machine_id: m.id, title: 'Werkstattaufenthalt Ende', date: wann, description: nr ? 'Auftrag: ' + nr : '', category_id: 16 }]);
            if (stunden) await sb().from('manual_history_entries').insert([{ machine_id: m.id, type: 'hours', title: 'Betriebsstunden', content: stunden, created_at: wann, created_by: window.activeUser && window.activeUser.id, files: [] }]);
            if (alleErledigt) {
                const ids = S.aufgaben.filter(offen).map(t => t.id);
                if (ids.length) await sb().from('tasks').update({ status: 'completed', completed_at: wann, updated_at: new Date().toISOString() }).in('id', ids);
            }
            if (window.renderMachines) { try { window.renderMachines('machine-list-container'); } catch (e) { /* egal */ } }
            if (knopf) knopf.textContent = 'Bericht wird erstellt …';
            // Aufgaben frisch (Status nach dem Abhaken)
            let aufgaben = S.aufgaben;
            if (nr) { try { aufgaben = await aufgabenLaden(m.id, nr); } catch (e) { /* alte Liste */ } }
            const beginn = (S.zeile && S.zeile.beginn) || await beginnAusVerlauf(m.id, nr) || '';
            const daten = { nr, beginn, ende: datum, stunden, bemerkung, aufgaben };
            let pdfErgebnis = null;
            try { pdfErgebnis = await berichtAblegen(m, daten); } catch (e) { console.error('Werkstattbericht:', e); toast('Aufenthalt beendet, aber das PDF ist gescheitert: ' + (e.message || e), 'error'); }
            const felder = { ende: datum, stunden_ende: stunden || null, bemerkung: bemerkung || null, ki_text: daten.ki || null,
                pdf_url: pdfErgebnis && pdfErgebnis.url || null, document_id: pdfErgebnis && pdfErgebnis.id != null ? String(pdfErgebnis.id) : null };
            try {
                if (S.zeile) await sb().from('werkstatt_aufenthalte').update(felder).eq('id', S.zeile.id);
                else await sb().from('werkstatt_aufenthalte').insert([Object.assign({ machine_id: parseInt(m.id, 10), auftragsnummer: nr, beginn: beginn || null }, felder)]);
            } catch (e) { console.warn('werkstatt_aufenthalte nicht gepflegt:', e); }
            if (box()) box().remove();
            if (pdfErgebnis) toast('Werkstattaufenthalt beendet, Bericht abgelegt.', 'success');
            if (pdfErgebnis && pdfErgebnis.url) window.open(pdfErgebnis.url, '_blank');
            if (window.maschinenZentraleNeuLaden) window.maschinenZentraleNeuLaden(m.id);
        } catch (e) {
            console.error('Beenden:', e);
            toast('Beenden fehlgeschlagen: ' + (e.message || e), 'error');
            if (knopf) { knopf.disabled = false; knopf.textContent = 'Aufenthalt beenden'; }
        } finally { S.laeuft = false; }
    }

    async function beginnAusVerlauf(mid, nr) {
        try {
            let q = sb().from('service_entries').select('date').eq('machine_id', mid).eq('title', 'Werkstattaufenthalt Beginn');
            if (nr) q = q.ilike('description', '%' + nr + '%');
            const { data } = await q.order('date', { ascending: false }).limit(1);
            return data && data[0] ? String(data[0].date).slice(0, 10) : '';
        } catch (e) { return ''; }
    }

    // ------------------------------------------------------------ KI + PDF
    function aufgabenText(aufgaben) {
        return aufgaben.map(t => {
            const subs = (t.subtasks || []).map(s => '  - [' + (s.status === 'completed' ? 'x' : ' ') + '] ' + (s.title || '')).join('\n');
            return '- [' + (offen(t) ? ' ' : 'x') + '] ' + (t.title || '') + (t.description ? ': ' + t.description : '') + (subs ? '\n' + subs : '');
        }).join('\n');
    }

    async function kiZusammenfassung(m, d) {
        if (!window.kiPseudonym || !window.kiPseudonym.fetchMaskiert || !d.aufgaben.length) return '';
        try {
            const anfrage = 'Maschine: ' + maschinenName(m) + '\nWerkstattaufenthalt ' + datumDe(d.beginn) + ' bis ' + (d.laufend ? 'heute (Maschine ist noch in der Werkstatt)' : datumDe(d.ende))
                + (d.stunden ? '\nBetriebsstunden beim Verlassen: ' + d.stunden : '') + '\n\nAufgaben ([x] = erledigt):\n' + aufgabenText(d.aufgaben)
                + (d.sage && Array.isArray(d.sage.positionen) && d.sage.positionen.length ? '\n\nIn Sage gebuchtes Material / Leistungen:\n'
                    + d.sage.positionen.filter(p => p.typ === 'artikel').map(p => '- ' + mengeDe(p.menge) + ' ' + (p.einheit || '') + ' ' + (p.text || '')).join('\n') : '')
                + (d.bemerkung ? '\n\nBemerkung: ' + d.bemerkung : '');
            const resp = await window.kiPseudonym.fetchMaskiert({
                messages: [
                    { role: 'system', content: 'Du schreibst für einen Werkstattbericht einer Recycling-Maschinen-Werkstatt eine kurze Zusammenfassung auf Deutsch: höchstens 2 bis 3 Sätze Fließtext, ohne Überschrift, ohne Aufzählung, ohne Markdown. Inhalt: worum es grob geht (Anlass/Problem) und was im Groben gemacht wird bzw. wurde. Die einzelnen Aufgaben stehen darunter im Bericht — zähle sie NICHT auf und wiederhole sie nicht. Nenne keine Maschinenbezeichnung, Seriennummer, Kunden, Auftragsnummer oder Datum (stehen schon im Kopf). Nichts erfinden.' },
                    { role: 'user', content: anfrage }
                ], temperature: 0.3
            });
            if (!resp.ok) return '';
            const j = await resp.json();
            return String((j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '').replace(/[*#_`]/g, '').trim();
        } catch (e) { console.warn('KI-Zusammenfassung:', e); return ''; }
    }

    // Maschinenbild als JPEG-Daten fürs PDF (über r2-sign wie js/einweisung.js, kein CORS-Problem); ohne Bild → null
    const bildPuffer = {};
    async function maschinenBild(m) {
        const url = m && m.image_url;
        if (!url) return null;
        if (url in bildPuffer) return bildPuffer[url];
        let daten = null;
        try {
            const FS = window.FileUploadService;
            const pfad = FS && FS.r2PfadAusUrl ? FS.r2PfadAusUrl(url) : null;
            const blob = pfad ? await FS.downloadFile(pfad, { bucket: 'dateien' }) : await fetch(url).then(r => r.blob());
            const bmp = await createImageBitmap(blob);
            // Quadratisch aus der Mitte zuschneiden (wie object-fit: cover im Aufgaben-Ausdruck)
            const seite = Math.min(bmp.width, bmp.height), ziel = Math.min(600, seite);
            const c = document.createElement('canvas'); c.width = c.height = ziel;
            c.getContext('2d').drawImage(bmp, (bmp.width - seite) / 2, (bmp.height - seite) / 2, seite, seite, 0, 0, ziel, ziel);
            daten = { url: c.toDataURL('image/jpeg', 0.85), b: ziel, h: ziel };
        } catch (e) { console.warn('Maschinenbild nicht ladbar:', e); }
        bildPuffer[url] = daten;
        return daten;
    }

    // Alle Zuständigen aus Aufgaben und Unteraufgaben (assigned_to = Benutzer-IDs, mal auch Namen)
    function mitarbeiter(aufgaben) {
        const ids = [];
        (aufgaben || []).forEach(t => [t].concat(t.subtasks || []).forEach(x => (Array.isArray(x.assigned_to) ? x.assigned_to : []).forEach(id => { if (id != null && !ids.some(v => String(v) === String(id))) ids.push(id); })));
        const nutzer = window.userList || [];
        return ids.map(id => { const u = nutzer.find(n => String(n.id) === String(id) || n.name === id); return u ? u.name : (typeof id === 'string' && isNaN(id) ? id : ''); }).filter(Boolean).join(', ');
    }

    async function pdfErzeugen(m, d) {
        if (typeof window.loadPDFGenerators === 'function') await window.loadPDFGenerators();
        if (typeof window.loadUnicodePdfFont === 'function') { try { await window.loadUnicodePdfFont(); } catch (e) { /* Standardschrift */ } }
        if (!window.VORLAGE_BASE64 && typeof window.ladeBriefbogen === 'function') { try { await window.ladeBriefbogen(); } catch (e) { console.warn('Briefbogen nicht ladbar:', e); } }
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        if (typeof window.registerUnicodeFont === 'function' && window.registerUnicodeFont(doc)) doc.setFont('helvetica', 'normal');
        const hintergrund = () => { if (window.VORLAGE_BASE64) doc.addImage(window.VORLAGE_BASE64, 'JPEG', -5, -5, 220, 307, undefined, 'FAST'); };
        hintergrund();
        const L = 20, R = 190, UNTEN = 270, B = R - L;
        let y = 30;
        const platz = h => { if (y + h > UNTEN) { doc.addPage(); hintergrund(); y = 40; } };
        const text = (t, x, opt) => { const z = doc.splitTextToSize(t || '', (opt && opt.b) || (R - x)); z.forEach(s => { platz(5); doc.text(s, x, y); y += (opt && opt.lh) || 5; }); };
        const ueberschrift = t => { y += 3; platz(12); doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.text(t, L, y); y += 2; doc.setDrawColor(160); doc.setLineWidth(0.2); doc.line(L, y, R, y); y += 6; doc.setFont('helvetica', 'normal'); doc.setFontSize(10); };

        // Maschinenbild oben rechts wie im Aufgaben-Ausdruck: Quadrat 50 mm mit feinem Rahmen; Kunde oben links
        const bild = await maschinenBild(m);
        let bildB = 0, bildUnten = 0;
        if (bild) {
            const G = 50;
            try {
                doc.addImage(bild.url, 'JPEG', R - G, 27, G, G, undefined, 'FAST');
                doc.setDrawColor(150); doc.setLineWidth(0.25); doc.roundedRect(R - G, 27, G, G, 1.5, 1.5);
                bildB = G; bildUnten = 27 + G;
            } catch (err) { /* ohne Bild */ }
        }
        doc.setTextColor(0); doc.setFontSize(10);
        const adr = [m.company, m.operator_street, [m.operator_zip, m.operator_city].filter(Boolean).join(' ')].filter(Boolean);
        adr.forEach(z => { doc.text(z, L, y); y += 5.2; });
        y = Math.max(y + 8, 58);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.text('Werkstattbericht', L, y); y += 8;
        doc.setFontSize(10); doc.setFont('helvetica', 'normal');
        const kv = [['Auftrag:', d.nr || '-'], ['Maschine:', [m.manufacturer, m.name].filter(Boolean).join(' ')], ['Seriennummer:', m.serial || '-'],
            ['Zeitraum:', (d.beginn ? datumDe(d.beginn) : '?') + ' – ' + (d.laufend ? 'laufend' : datumDe(d.ende))], ['Betriebsstunden:', d.stunden || '-'],
            ['Zuständig / Mitarbeiter:', mitarbeiter(d.aufgaben) || '-']];
        if (m.customer_number) kv.splice(1, 0, ['Kunden-Nr.:', m.customer_number]);
        // Werte neben dem Bild schmaler umbrechen
        const WX = L + 44;
        kv.forEach(([k, v]) => {
            const breite = (y - 4 < bildUnten ? R - bildB - 4 : R) - WX;
            const z = doc.splitTextToSize(String(v), breite);
            doc.setFont('helvetica', 'bold'); doc.text(k, L, y); doc.setFont('helvetica', 'normal');
            z.forEach((t, i) => doc.text(t, WX, y + i * 4.8));
            y += 5.5 + (z.length - 1) * 4.8;
        });
        y = Math.max(y, bildUnten + 4);

        if (d.ki) { ueberschrift('Zusammenfassung'); text(d.ki, L); }

        // Aufgaben als Karten wie im Werkstatt-Ausdruck (js/tasks-print.js): Rahmen, Titel, Übergruppen
        // in Großbuchstaben, je Unteraufgabe ein Kästchen (abgehakt + grau, wenn erledigt).
        // karte(t, zeichnen=false) misst nur die Höhe; passt die Karte nicht mehr, beginnt sie auf neuer Seite.
        const P = 3.5, IX = L + P, IB = B - 2 * P;
        const gruppen = t => {
            const g = {};
            (t.subtasks || []).slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
                .forEach(s => { const n = s.supergroup || 'Allgemein'; (g[n] = g[n] || []).push(s); });
            return Object.entries(g);
        };
        const haken = (x, yy) => { doc.setLineWidth(0.5); doc.line(x + 0.7, yy + 1.9, x + 1.6, yy + 3); doc.line(x + 1.6, yy + 3, x + 3.1, yy + 0.7); doc.setLineWidth(0.3); };
        const karte = (t, zeichnen, y0) => {
            let yy = y0 + P + 4;
            const subs = t.subtasks || [], fertigS = subs.filter(s => s.status === 'completed').length;
            const status = (offen(t) ? 'offen' : 'erledigt') + (subs.length ? ' · ' + fertigS + '/' + subs.length : '');
            doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
            const titel = doc.splitTextToSize(t.title || 'Aufgabe', IB - 30);
            if (zeichnen) {
                titel.forEach((s, i) => doc.text(s, IX, yy + i * 5.4));
                doc.setFontSize(8.5); doc.setTextColor(offen(t) ? 180 : 16, offen(t) ? 110 : 140, offen(t) ? 0 : 90);
                doc.text(status, L + B - P, y0 + P + 4, { align: 'right' }); doc.setTextColor(0);
            }
            yy += (titel.length - 1) * 5.4 + 2.5;
            if (zeichnen) { doc.setDrawColor(190); doc.setLineWidth(0.2); doc.line(IX, yy, IX + IB, yy); }
            yy += 4.5;
            doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
            if (t.description) {
                const z = doc.splitTextToSize(t.description, IB);
                if (zeichnen) { doc.setTextColor(70); z.forEach((s, i) => doc.text(s, IX, yy + i * 4.2)); doc.setTextColor(0); }
                yy += z.length * 4.2 + 1.5;
            }
            gruppen(t).forEach(([name, liste]) => {
                yy += 1.5;
                doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
                if (zeichnen) { doc.setTextColor(60); doc.text(name.toUpperCase(), IX, yy); doc.setTextColor(0); doc.setDrawColor(220); doc.setLineWidth(0.2); doc.line(IX, yy + 1.2, IX + IB, yy + 1.2); }
                yy += 5;
                doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
                liste.forEach(s => {
                    const fertig = s.status === 'completed';
                    const z = doc.splitTextToSize(s.title || '', IB - 7);
                    if (zeichnen) {
                        doc.setDrawColor(50); doc.setLineWidth(0.3); doc.roundedRect(IX, yy - 3.1, 3.8, 3.8, 0.5, 0.5);
                        if (fertig) haken(IX, yy - 3.1);
                        doc.setTextColor(fertig ? 120 : 0);
                        z.forEach((s2, i) => {
                            doc.text(s2, IX + 6, yy + i * 4.4);
                            if (fertig) { const w = doc.getTextWidth(s2); doc.setDrawColor(140); doc.setLineWidth(0.2); doc.line(IX + 6, yy + i * 4.4 - 1.1, IX + 6 + w, yy + i * 4.4 - 1.1); }
                        });
                        doc.setTextColor(0);
                    }
                    yy += z.length * 4.4 + 1.4;
                });
            });
            return yy - y0 + P - 3.5;
        };
        const aufgabenSortiert = d.aufgaben.filter(t => !offen(t)).concat(d.aufgaben.filter(offen));
        ueberschrift('Aufgaben');
        if (!aufgabenSortiert.length) text('Keine Aufgaben erfasst.', L);
        aufgabenSortiert.forEach(t => {
            const h = karte(t, false, y);
            if (y + h > UNTEN && h < UNTEN - 40) { doc.addPage(); hintergrund(); y = 40; }
            karte(t, true, y);
            doc.setDrawColor(60); doc.setLineWidth(0.35); doc.roundedRect(L, y, B, h, 2.5, 2.5);
            y += h + 4;
        });
        doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(0);

        const sagePos = d.sage && Array.isArray(d.sage.positionen) ? d.sage.positionen : [];
        if (sagePos.length) {
            ueberschrift('Material & Leistungen (Werkstattauftrag ' + (d.nr || '') + ')');
            sagePos.forEach(p => {
                if (p.typ !== 'artikel') { doc.setFont('helvetica', 'bold'); text(p.text || '', L); doc.setFont('helvetica', 'normal'); return; }
                platz(5);
                const menge = mengeDe(p.menge) + ' ' + (p.einheit || '');
                doc.text(menge.trim(), L + 22, y, { align: 'right' });
                const z = doc.splitTextToSize((p.text || '') + (p.text2 ? ' – ' + p.text2 : ''), R - (L + 26) - 24);
                if (p.artikel) { doc.setFontSize(8); doc.setTextColor(110); doc.text(String(p.artikel), R, y, { align: 'right' }); doc.setTextColor(0); doc.setFontSize(10); }
                z.forEach((t, i) => { if (i) platz(5); doc.text(t, L + 26, y); y += 5; });
            });
        }

        ueberschrift('Abschluss');
        text(d.laufend ? 'Stand ' + datumDe(d.ende) + ': Die Maschine ist noch in der Werkstatt' + (d.stunden ? ', letzter Stundenstand ' + d.stunden : '') + '.'
            : 'Die Maschine hat die Werkstatt am ' + datumDe(d.ende) + ' verlassen' + (d.stunden ? ', Betriebsstunden ' + d.stunden : '') + '.', L);
        if (d.bemerkung) { y += 1; text(d.bemerkung, L); }
        const n = doc.getNumberOfPages();
        for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFontSize(8); doc.setTextColor(120); doc.text('Seite ' + i + ' / ' + n, R, 285, { align: 'right' }); doc.setTextColor(0); }
        return doc;
    }

    async function ordnerId() {
        let { data: o, error } = await sb().from('document_folders').select('id').eq('name', ORDNER).maybeSingle();
        if (error) throw error;
        if (!o) {
            const r = await sb().from('document_folders').insert([{ name: ORDNER, parent_id: null, machine_id: null }]).select('id').single();
            if (r.error) throw r.error;
            o = r.data;
        }
        return o.id;
    }

    async function berichtAblegen(m, d) {
        if (d.nr) { delete posPuffer[d.nr]; d.sage = await sagePositionen(d.nr); }
        d.ki = await kiZusammenfassung(m, d);
        const doc = await pdfErzeugen(m, d);
        const name = `Werkstattbericht-${sauber(d.nr) || 'ohne-auftrag'}-${datumDe(d.ende)}.pdf`;
        const datei = new File([doc.output('blob')], name, { type: 'application/pdf' });
        const basis = typeof window.getMachineFolderName === 'function'
            ? window.getMachineFolderName(m.id, m.manufacturer, m.name, m.serial || m.serial_number, m.year) : 'Maschinen/' + m.id;
        const pfad = `${basis}/werkstattberichte/${name.replace(/\.pdf$/, '')}-${Date.now().toString(36)}.pdf`;
        const up = await window.FileUploadService.uploadFile(datei, { bucket: 'dateien', path: pfad, compress: false, provider: 'cloudflare-r2' });
        const { data: neu, error } = await sb().from('documents').insert([{
            folder_id: await ordnerId(), name: name.replace(/\.pdf$/, ''), category: ORDNER, machine_id: parseInt(m.id, 10),
            url: up.url, file_path: up.path, size: datei.size, mime_type: 'application/pdf'
        }]).select('id').single();
        if (error) throw error;
        if (typeof window.fetchDocuments === 'function' && document.getElementById('documents')) { try { window.fetchDocuments(); } catch (e) { /* Ansicht nicht offen */ } }
        return { url: up.url, id: neu.id };
    }

    // ------------------------------------------------------------ Sage-Positionen
    // werkstatt_positionen (Sage-Abgleich): was in Sage auf den Werkstattauftrag geschrieben ist.
    // Preise nur mit Recht „Belege“ (permissions.belege), wie die Rechnungsbelege.
    const posPuffer = {};
    async function sagePositionen(nr) {
        if (!nr) return null;
        const p = posPuffer[nr];
        if (p && Date.now() - p.t < 120000) return p.d;
        try {
            const { data, error } = await sb().from('werkstatt_positionen').select('auftragsnummer, belegdatum, kundenmatchcode, netto, positionen, aktualisiert_am').eq('auftragsnummer', nr).maybeSingle();
            if (error) return null;
            posPuffer[nr] = { t: Date.now(), d: data || null };
            return data || null;
        } catch (e) { return null; }
    }
    window.werkstattSagePositionen = sagePositionen;
    const mitPreisen = () => !!(window.activeUser && window.activeUser.permissions && window.activeUser.permissions.belege === true);
    const zahlDe = (v, n) => v == null ? '' : Number(v).toLocaleString('de-DE', { minimumFractionDigits: n, maximumFractionDigits: n });
    const mengeDe = v => v == null ? '' : Number(v).toLocaleString('de-DE', { maximumFractionDigits: 3 });

    function positionenHtml(d, nr) {
        if (!d) return `<div class="wa-sage-leer">In Sage ist zum Werkstattauftrag ${esc(nr)} (noch) nichts gefunden. Der Abgleich läuft werktags alle 30 Minuten.</div>`;
        const pos = Array.isArray(d.positionen) ? d.positionen : [];
        const preise = mitPreisen();
        const zeilen = pos.map(p => p.typ === 'artikel'
            ? `<tr><td class="wa-sage-menge">${esc(mengeDe(p.menge))} ${esc(p.einheit || '')}</td><td>${esc(p.text || '')}${p.text2 ? `<small>${esc(p.text2)}</small>` : ''}</td><td class="wa-sage-art">${esc(p.artikel || '')}</td>${preise ? `<td class="wa-sage-preis">${esc(zahlDe(p.gesamt, 2))} €</td>` : ''}</tr>`
            : `<tr class="wa-sage-ueber"><td colspan="${preise ? 4 : 3}">${esc(p.text || '')}</td></tr>`).join('');
        return `<details class="wa-sage">
            <summary>In Sage gebucht: ${pos.filter(p => p.typ === 'artikel').length} Positionen${preise && d.netto != null ? ' · ' + esc(zahlDe(d.netto, 2)) + ' € netto' : ''}</summary>
            ${pos.length ? `<table class="wa-sage-tab"><tbody>${zeilen}</tbody></table>` : '<div class="wa-sage-leer">Noch keine Positionen.</div>'}
            <div class="wa-sage-stand">Stand Sage: ${esc(d.aktualisiert_am ? new Date(d.aktualisiert_am).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : '')}</div>
        </details>`;
    }

    // Im Aufgaben-Fenster unter der Werkstattauftragsnummer
    function nrImAufgabenFenster() {
        const j = document.getElementById('task-workshop-year-digit'), s = document.getElementById('task-workshop-order-suffix');
        if (!j || !s || !j.value.trim() || !s.value.trim()) return null;
        return `202${j.value.trim()}-40${s.value.trim().padStart(3, '0')}`;
    }
    let posLauf = 0;
    async function aufgabenFensterPositionen() {
        const wrap = document.getElementById('task-workshop-order-wrapper');
        if (!wrap) return;
        let box = document.getElementById('task-sage-positionen');
        if (!box) { box = document.createElement('div'); box.id = 'task-sage-positionen'; wrap.appendChild(box); }
        const nr = nrImAufgabenFenster(), lauf = ++posLauf;
        if (!nr || nr.length < 10) { box.innerHTML = ''; return; }
        const d = await sagePositionen(nr);
        if (lauf === posLauf) box.innerHTML = positionenHtml(d, nr);
    }
    let posTimer = null;
    document.addEventListener('input', e => {
        if (e.target && (e.target.id === 'task-workshop-year-digit' || e.target.id === 'task-workshop-order-suffix')) { clearTimeout(posTimer); posTimer = setTimeout(aufgabenFensterPositionen, 400); }
    });

    // ------------------------------------------------------------ Verlauf der Zentrale
    // Eintrag „Werkstattaufenthalt Beginn“ trägt <div class="mz-wa-info" data-mid data-nr> (maschinen-zentrale.js).
    // Hier: Kurzfassung (Aufgaben/erledigt, Unteraufgaben, Sage-Positionen, Zeitraum) + aufklappbar alles.
    // Sage-Positionen im Verlauf: gut lesbar und ohne Aufklappen (Menge | Bezeichnung | Artikelnummer [| Preis])
    function verlaufSageHtml(d) {
        const pos = d && Array.isArray(d.positionen) ? d.positionen : [];
        if (!pos.length) return '';
        const preise = mitPreisen();
        const art = pos.filter(p => p.typ === 'artikel').length;
        return `<details class="wa-v-sage">
            <summary class="wa-v-sage-kopf">In Sage auf den Auftrag gebucht <span>${art} ${art === 1 ? 'Position' : 'Positionen'}${preise && d.netto != null ? ' · ' + esc(zahlDe(d.netto, 2)) + ' € netto' : ''}</span></summary>
            <table><tbody>${pos.map(p => p.typ === 'artikel'
                ? `<tr><td class="wa-v-sage-menge">${esc(mengeDe(p.menge))} ${esc(p.einheit || '')}</td><td>${esc(p.text || '')}${p.text2 ? `<small>${esc(p.text2)}</small>` : ''}</td><td class="wa-v-sage-art">${esc(p.artikel || '')}</td>${preise ? `<td class="wa-v-sage-menge">${esc(zahlDe(p.gesamt, 2))} €</td>` : ''}</tr>`
                : `<tr class="wa-v-sage-ueber"><td colspan="${preise ? 4 : 3}">${esc(p.text || '')}</td></tr>`).join('')}</tbody></table>
        </details>`;
    }

    // Die Zentrale zeichnet oft neu → fertiges HTML 60 s je Auftrag merken (keine Abfrage je Neuzeichnen)
    const verlaufPuffer = {};
    // Knopf oben rechts am Eintrag: mit verknüpfter Aufgabe „Bearbeiten“ (öffnet sie), sonst „Aufgabe anlegen“
    function knopfBeschriften(el, anzahl) {
        const k = el.closest('.mz-v-karte') && el.closest('.mz-v-karte').querySelector('[data-mz="oeffnen"]');
        if (!k) return;
        k.textContent = anzahl ? 'Bearbeiten' : 'Aufgabe anlegen';
        k.classList.toggle('knopf--bearbeiten', !!anzahl);
        k.classList.toggle('knopf--sekundaer', !anzahl);
    }
    async function verlaufFuellen(el) {
        el.dataset.gefuellt = '1';
        const mid = el.dataset.mid, nr = el.dataset.nr, m = maschine(mid);
        const p = verlaufPuffer[mid + '|' + nr];
        if (p && Date.now() - p.t < 60000) { el.innerHTML = p.html; knopfBeschriften(el, p.anzahl); return; }
        el.innerHTML = '<div class="wa-vorh-leer">Lade Aufgaben …</div>';
        let aufgaben = [];
        try { aufgaben = await aufgabenLaden(mid, nr); } catch (e) { aufgaben = []; }
        const [sage, zeile] = await Promise.all([sagePositionen(nr), aufenthaltSuchen(mid, nr)]);
        const fertig = aufgaben.filter(t => !offen(t)).length;
        const subs = aufgaben.reduce((a, t) => a.concat(t.subtasks || []), []);
        const subsFertig = subs.filter(s => s.status === 'completed').length;
        const artikel = sage && Array.isArray(sage.positionen) ? sage.positionen.filter(p => p.typ === 'artikel').length : 0;
        const teile = [
            `<b>${aufgaben.length}</b> ${aufgaben.length === 1 ? 'Aufgabe' : 'Aufgaben'} · <b>${fertig}</b> erledigt`,
            subs.length ? `Unteraufgaben ${subsFertig}/${subs.length}` : '',
            artikel ? `${artikel} Sage-Positionen` : '',
            zeile && zeile.ende ? 'beendet ' + datumDe(zeile.ende) : (m && (m.is_in_workshop || m.in_workshop) && m.workshop_order_number === nr ? 'läuft noch' : '')
        ].filter(Boolean);
        const aufgabeHtml = t => {
            const s = (t.subtasks || []).slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
            return `<div class="wa-v-aufgabe${offen(t) ? '' : ' erledigt'}"><div class="wa-v-titel">${offen(t) ? '○' : '✓'} ${esc(t.title || 'Aufgabe')}${s.length ? ` <small>${s.filter(x => x.status === 'completed').length}/${s.length}</small>` : ''}</div>
                ${s.length ? `<ul>${s.map(x => `<li class="${x.status === 'completed' ? 'erledigt' : ''}">${x.status === 'completed' ? '✓' : '○'} ${esc(x.title || '')}</li>`).join('')}</ul>` : ''}</div>`;
        };
        el.innerHTML = `<div class="wa-v-zeile"><div class="wa-v-kurz">${teile.join('<i> · </i>')}</div>${berichtKnopf(m, nr, zeile)}</div>
            ${verlaufSageHtml(sage)}
            <details class="wa-v-details"><summary>Aufgaben anzeigen</summary>
                ${aufgaben.length ? aufgaben.map(aufgabeHtml).join('') : '<div class="wa-vorh-leer">Noch keine Aufgaben zu diesem Auftrag.</div>'}
            </details>`;
        verlaufPuffer[mid + '|' + nr] = { t: Date.now(), html: el.innerHTML, anzahl: aufgaben.length };
        knopfBeschriften(el, aufgaben.length);
    }
    document.addEventListener('click', e => {
        const a = e.target.closest('.mz-wa-info [data-wav]'); if (!a) return;
        const el = a.closest('.mz-wa-info');
        if (a.dataset.wav === 'vorschau') return berichtVorschau(maschine(el.dataset.mid), el.dataset.nr, a);
        if (a.dataset.wav === 'bericht') window.open(a.dataset.url, '_blank');
    });
    new MutationObserver(() => {
        document.querySelectorAll('.mz-wa-info:not([data-gefuellt])').forEach(verlaufFuellen);
    }).observe(document.body, { childList: true, subtree: true });

    // ------------------------------------------------------------ Einhängen
    function setzerEinhaengen() {
        const orig = window.setTaskWorkshopOrder;
        if (typeof orig !== 'function' || orig._wa) return;
        const neu = function () { const r = orig.apply(this, arguments); aufgabenFensterPositionen(); return r; };
        neu._wa = true;
        window.setTaskWorkshopOrder = neu;
    }
    setzerEinhaengen();
    // Fenster geleert (neue Aufgabe) → Liste weg
    const leerenOrig = window.hideWorkshopOrderInput;
    if (typeof leerenOrig === 'function') window.hideWorkshopOrderInput = function () { const r = leerenOrig.apply(this, arguments); const b = document.getElementById('task-sage-positionen'); if (b) b.innerHTML = ''; const v = document.getElementById('task-wa-vorhanden'); if (v) v.remove(); return r; };

    function einhaengen() {
        const orig = window.processWorkshopToggle;
        if (typeof orig !== 'function' || orig._wa) return false;
        const neu = async function (id, newStatus, nr) {
            if (!newStatus) return beendenFragen(id);
            await orig.apply(this, arguments);
            const m = maschine(id);
            if (!m || !m.is_in_workshop) return;   // Original ist gescheitert
            try { await sb().from('werkstatt_aufenthalte').insert([{ machine_id: parseInt(id, 10), auftragsnummer: nr, beginn: heute(), created_by: window.activeUser && window.activeUser.id }]); }
            catch (e) { console.warn('werkstatt_aufenthalte nicht angelegt:', e); }
            window.openWerkstattAufenthalt(id, null, { nr });
        };
        neu._wa = true;
        window.processWorkshopToggle = neu;
        return true;
    }
    // processWorkshopToggle entsteht im DOMContentLoaded-Handler von app-init.js
    if (!einhaengen()) document.addEventListener('DOMContentLoaded', () => { if (!einhaengen()) setTimeout(einhaengen, 0); });
})();
