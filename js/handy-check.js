// Handy-Check: öffnet alle Ansichten und Fenster nacheinander und misst, was auf
// dem Handy nicht passt. Tut nichts, bis man ihn aufruft:
//   - Konsole: handyCheck()           (Fenster vorher auf Handy-Breite ≤ 768 px)
//   - Adresse: index.html?handycheck  (startet nach der Anmeldung von selbst)
// Speichert/sendet nie etwas — Fenster werden nur geöffnet und wieder geschlossen.
//
// Gemessen wird je Ansicht/Fenster:
//   raus      Elemente, die rechts über den Bildschirm ragen (außer in eigenen Querlauf-Bereichen)
//   ueberlapp Geschwister-Elemente, die sich überdecken (Symbole/SVG ausgenommen)
//   gross     Text über 18,5 px (Seitentitel h1 und reine Symbole ausgenommen)
//   klein     Knöpfe mit Tippfläche unter 22 px
// Neues Fenster? Unten in FENSTER eintragen.
(function () {
    'use strict';
    const warte = ms => new Promise(r => setTimeout(r, ms));
    const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const IGNORIEREN = ['kic-nav', 'topbar', 'sidebar', 'main-content', 'alarm-stack', 'todo-fab', 'sidebar-overlay', 'handy-check-bericht'];
    const nurSymbol = t => !t || t.length <= 2 || /^[\p{Extended_Pictographic}←-⇿☀-➿️‍×✕+−–\s]+$/u.test(t);

    function sichtbar(e) {
        const cs = getComputedStyle(e), b = e.getBoundingClientRect();
        return b.width > 0 && b.height > 0 && cs.visibility !== 'hidden' && +cs.opacity > 0;
    }
    function inQuerlauf(e, wurzel) {
        for (let p = e.parentElement; p && p !== wurzel.parentElement; p = p.parentElement) {
            const ox = getComputedStyle(p).overflowX;
            if ((ox === 'auto' || ox === 'scroll' || ox === 'hidden') && p.scrollWidth > p.clientWidth + 1) return true;
        }
        return false;
    }
    const name = e => ((e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/)[0] : '') || e.tagName.toLowerCase());

    function messen(wurzel) {
        const W = document.documentElement.clientWidth;
        const r = { raus: new Set(), ueberlapp: [], gross: new Set(), klein: new Set() };
        wurzel.querySelectorAll('*').forEach(e => {
            if (e.closest('svg') || !sichtbar(e)) return;
            const b = e.getBoundingClientRect();
            if (b.right > W + 1 && b.left < W && !inQuerlauf(e, wurzel)) r.raus.add(name(e));
            const text = [...e.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim();
            if (text && !/INPUT|TEXTAREA|SELECT|H1/.test(e.tagName) && !nurSymbol(text)) {
                const fs = parseFloat(getComputedStyle(e).fontSize);
                if (fs > 18.5) r.gross.add(`${name(e)} ${Math.round(fs)}px «${text.slice(0, 20)}»`);
            }
            if ((e.tagName === 'BUTTON' || e.getAttribute('role') === 'button') && (b.width < 22 || b.height < 22)) r.klein.add(`${name(e)} ${Math.round(b.width)}×${Math.round(b.height)}`);
            // Fließtext (display:inline) bricht um — dessen Rahmen überschneiden sich immer, kein Fehler
            const kinder = [...e.children].filter(c => c.tagName !== 'svg' && sichtbar(c) && !/absolute|fixed|sticky/.test(getComputedStyle(c).position) && getComputedStyle(c).display !== 'inline');
            for (let i = 0; i < kinder.length && r.ueberlapp.length < 6; i++) {
                for (let j = i + 1; j < kinder.length; j++) {
                    const a = kinder[i].getBoundingClientRect(), c = kinder[j].getBoundingClientRect();
                    const ox = Math.min(a.right, c.right) - Math.max(a.left, c.left);
                    const oy = Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top);
                    if (ox > 8 && oy > 8) { r.ueberlapp.push(`${name(kinder[i])} ⟂ ${name(kinder[j])} (${Math.round(oy)}px)`); break; }
                }
            }
        });
        return { raus: [...r.raus].slice(0, 8), ueberlapp: r.ueberlapp, gross: [...r.gross].slice(0, 8), klein: [...r.klein].slice(0, 8) };
    }

    // Was ist gerade obenauf? Neu sichtbare, festgestellte Ebene gegenüber vorher.
    function ebenen() {
        return [...document.querySelectorAll('body > *, .modal-backdrop, .modal')].filter(e => {
            const cs = getComputedStyle(e), b = e.getBoundingClientRect();
            return /fixed/.test(cs.position) && cs.display !== 'none' && +cs.opacity > 0.5 && b.width > 280 && b.height > 250 && !IGNORIEREN.includes(e.id);
        });
    }
    // Ausgangszustand (inline display) aller Fenster, beim Start des Checks gemerkt
    const ausgang = new Map();
    function alleZu() {
        try { window.closeTaskPrintModal && document.getElementById('task-print-modal') && window.closeTaskPrintModal(); } catch (e) { /* egal */ }
        try { if (document.querySelector('#miet-overlay.open')) window.closeMietvereinbarung(true); } catch (e) { /* egal */ }
        document.getElementById('tlv-plan-dlg')?.remove();
        document.querySelectorAll('.modal-backdrop.show, .modal-backdrop.active').forEach(m => m.classList.remove('show', 'active'));
        // .modal-backdrop-Fenster nur über die Klasse schließen — ein display:none
        // bliebe kleben und das Fenster ginge danach nicht mehr auf. Alte .modal-Fenster
        // (per style.display geöffnet) dagegen über display, gemerkt zum Zurücksetzen.
        // Jedes Fenster auf seinen Ausgangszustand (beim Start gemerkt) — dann alles,
        // was trotzdem noch sichtbar ist, per display:none weg.
        document.querySelectorAll('[id$="-modal"], .modal').forEach(m => {
            if (ausgang.has(m)) m.style.display = ausgang.get(m);
            const cs = getComputedStyle(m);
            // .modal-backdrop-Fenster schließt die Klasse (Ausblenden läuft noch an) — kein display:none,
            // sonst gehen sie danach nicht mehr auf
            if (m.classList.contains('modal-backdrop')) return;
            if (cs.display !== 'none' && +cs.opacity > 0.5 && m.getBoundingClientRect().height > 100) m.style.display = 'none';
        });
        ['adressen-zusammen'].forEach(id => document.getElementById(id)?.remove());
        const gs = document.getElementById('gs-overlay'); if (gs && !gs.hidden) { gs.hidden = true; document.body.classList.remove('gs-offen'); }
        if (document.body.classList.contains('todo-offen')) document.querySelector('#todo-panel [data-todo="zu"]')?.click();   // NICHT .todo-x — der erste ist der Vollbild-Umschalter
        const kic = document.getElementById('kic-panel'); if (kic && !kic.hidden) document.querySelector('#kic-panel [data-kic="zu"]')?.click();
        document.body.style.overflow = '';
    }

    // IDs aus den gezeichneten Karten holen (die Datenlisten liegen nicht global)
    async function idAus(view, re) {
        try { window.switchView(view); } catch (e) { return null; }
        await warte(1500);
        const el = document.querySelector(`#${view} [onclick]`) && [...document.querySelectorAll(`#${view} [onclick]`)].find(x => re.test(x.getAttribute('onclick')));
        const m = el && re.exec(el.getAttribute('onclick'));
        return m ? m[1] : null;
    }

    async function fensterListe() {
        const ms = window.machineList || [];
        const m = (ms.find(x => x.next_maintenance) || ms[0] || {}).id;
        const p = await idAus('processes', /openEditProcessModal\('([^']+)'/);
        const t = await idAus('tasks', /openTaskModal\('?([^')]+)'?\)/);
        const L = [
            ['Servicebericht neu', () => window.openServiceberichtModal()],
            ['Bericht-Art wählen', () => window.openReportTypeModal()],
            ['Servicebericht-Auswahl', () => window.openServiceberichtPicker()],
            ['KI-Servicebericht', () => window.openAiServiceReportModal()],
            ['Vorgang anlegen', () => window.openProcessAddModal()],
            ['Mail-Import', () => window.openEmailImportModal()],
            ['KI-Erfassung', () => window.openAiCaptureModal('alles')],
            ['Aufgabe anlegen', () => window.openAddTaskModal()],
            ['Aufgaben drucken', () => window.openTaskPrintModal()],
            ['Schnellvorlage', () => window.openQTModal()],
            ['Maschine anlegen', () => window.openAddMachineModal()],
            ['Termin anlegen', () => window.openCreateEventModal()],
            ['Buchhaltung neu', () => window.openAccountingModal()],
            ['Dokument hochladen', () => window.openDocumentUploadModal()],
            ['Dokument wählen', () => window.openDocumentPicker()],
            ['Ordner', () => window.openFolderModal()],
            ['Etiketten-Import', () => window.openLabelImportModal()],
            ['Benachrichtigungs-Einstellungen', () => window.openNotificationSettings()]
        ];
        if (m) L.push(
            ['Maschinen-Detail', () => window.openMachineDetails(m)],
            ['Maschinen-Historie', () => window.openHistoryModal(m)],
            ['Wartung: Termin', () => window.openMaintTerminModal(m)],
            ['Wartung: Erledigt', () => window.openMaintErledigtModal(m)],
            ['Wartung: Mail', () => window.openMaintEmailModal(m)]
        );
        if (p) L.push(
            ['Vorgang bearbeiten', () => window.openEditProcessModal(p)],
            ['Vorgang: Schritte', () => window.openProcessStepsModal(p)],
            ['Vorgang: Stand', () => window.openProcessStatusUpdateModal(p)],
            ['Vorgang: Mails', () => window.openProcessMailModal(p)],
            ['Vorgang: Dokumente', () => window.openProcessAttachments(p)]
        );
        if (t) L.push(['Aufgabe bearbeiten', () => window.openTaskModal(t)]);
        const I = window.abInternals;
        if (I && I.state && (I.state.addresses || []).length) {
            const a = I.state.addresses[0].id;
            ['overview', 'contacts', 'machines', 'tasks', 'history'].forEach(tab => L.push(['Adresse: ' + tab, () => I.openDetail(a, tab)]));
        }
        L.push(['Suche (leer)', () => window.openGlobaleSuche && window.openGlobaleSuche()]);
        L.push(['Suche mit Treffern', async () => { await window.openGlobaleSuche(); await warte(2500); const i = document.getElementById('gs-input'); if (i) { i.value = 'backhus'; i.dispatchEvent(new Event('input')); } }]);
        L.push(['To-do-Liste', () => window.openTodoListe()]);
        L.push(['KI-Chat', () => window.openKiChat()]);
        L.push(['Mietvereinbarung', async () => {
            const { data } = await window.supabaseClient.from('rental_agreements').select('id, machine_id').order('created_at', { ascending: false }).limit(1);
            if (data && data[0]) await window.openMietvereinbarung(data[0].machine_id, data[0].id);
            else await window.openMietvereinbarung(m, null);
        }]);
        L.push(['Timeline: Vermietung hinzufügen', async () => {
            window.timelineVermietung(); await warte(1500);
            document.getElementById('tlv-plan-neu')?.click();
        }]);
        return L.filter(([, fn]) => { try { return typeof fn === 'function'; } catch (e) { return false; } });
    }

    function ansichten() {
        const ids = [...document.querySelectorAll('[data-target]')].map(e => e.dataset.target).filter(Boolean);
        return [...new Set(ids)].filter(id => document.getElementById(id));
    }

    function zeigeBericht(erg, dauer) {
        document.getElementById('handy-check-bericht')?.remove();
        const fehler = erg.filter(x => x.fehler || x.raus.length || x.ueberlapp.length || x.gross.length || x.klein.length);
        const box = document.createElement('div');
        box.id = 'handy-check-bericht';
        box.style.cssText = 'position:fixed;inset:max(8px,env(safe-area-inset-top)) 8px max(8px,env(safe-area-inset-bottom));z-index:100001;background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:14px;display:flex;flex-direction:column;font:13px/1.4 system-ui,sans-serif;box-shadow:0 20px 60px rgba(0,0,0,.6)';
        const zeile = (k, v) => v.length ? `<div style="margin:2px 0 0 8px"><b style="color:#fbbf24">${k}:</b> ${v.map(esc).join(' · ')}</div>` : '';
        box.innerHTML = `
            <div style="display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid #334155">
                <b style="font-size:15px">📱 Handy-Check</b>
                <span style="color:#94a3b8">${erg.length} geprüft · ${fehler.length} mit Befund · ${Math.round(dauer / 1000)} s · ${document.documentElement.clientWidth}px breit</span>
                <button type="button" data-hc="kopieren" style="margin-left:auto;padding:6px 10px;border-radius:8px;border:1px solid #475569;background:#1e293b;color:#e2e8f0">Kopieren</button>
                <button type="button" data-hc="zu" style="padding:6px 10px;border-radius:8px;border:1px solid #475569;background:#1e293b;color:#e2e8f0">✕</button>
            </div>
            <div style="overflow:auto;padding:8px 12px">
                ${fehler.length ? fehler.map(x => `<div style="padding:6px 0;border-bottom:1px solid #1e293b"><b>${esc(x.was)}</b>${x.fehler ? ` <span style="color:#f87171">${esc(x.fehler)}</span>` : ''}
                    ${zeile('ragt raus', x.raus)}${zeile('überlappt', x.ueberlapp)}${zeile('zu groß', x.gross)}${zeile('zu klein zum Tippen', x.klein)}</div>`).join('')
                : '<div style="padding:20px;text-align:center;color:#34d399">✓ Keine Befunde.</div>'}
                <div style="margin-top:10px;color:#64748b">Ohne Befund: ${esc(erg.filter(x => !fehler.includes(x)).map(x => x.was).join(', '))}</div>
            </div>`;
        document.body.appendChild(box);
        box.querySelector('[data-hc="zu"]').onclick = () => box.remove();
        box.querySelector('[data-hc="kopieren"]').onclick = () => {
            const txt = JSON.stringify(fehler, null, 1);
            (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(
                () => window.showToast && window.showToast('Bericht kopiert.'),
                () => console.log(txt));
        };
    }

    let laeuft = false;
    window.handyCheck = async function (opt) {
        if (laeuft) return;
        opt = Object.assign({ ansichten: true, fenster: true, bericht: true }, opt || {});
        if (document.documentElement.clientWidth > 768) {
            const t = 'Handy-Check: Fenster ist breiter als 768 px — bitte erst auf Handy-Breite stellen (z. B. Entwicklertools → Gerätemodus).';
            if (window.showToast) window.showToast(t); console.warn(t);
            if (!opt.trotzdem) return;
        }
        laeuft = true;
        const t0 = Date.now();
        const vorher = location.hash;
        ausgang.clear();
        document.querySelectorAll('[id$="-modal"], .modal').forEach(m => ausgang.set(m, m.style.display));
        const erg = [];
        try {
            alleZu();
            if (opt.ansichten) {
                for (const v of ansichten()) {
                    try { window.switchView(v); } catch (e) { erg.push({ was: 'Ansicht ' + v, fehler: e.message, raus: [], ueberlapp: [], gross: [], klein: [] }); continue; }
                    await warte(1300);
                    const el = document.getElementById(v);
                    erg.push(Object.assign({ was: 'Ansicht ' + v }, messen(el || document.getElementById('main-content'))));
                }
            }
            if (opt.fenster) {
                for (const [was, fn] of await fensterListe()) {
                    alleZu(); await warte(300);
                    const vor = new Set(ebenen());
                    try { await fn(); } catch (e) { erg.push({ was, fehler: 'Öffnen: ' + e.message, raus: [], ueberlapp: [], gross: [], klein: [] }); continue; }
                    await warte(1600);
                    let neu = ebenen().filter(e => !vor.has(e)).pop() || ebenen().pop();
                    // Manche Fenster laden erst Daten — einmal nachwarten statt Fehlalarm
                    if (!neu) { await warte(2500); neu = ebenen().filter(e => !vor.has(e)).pop() || ebenen().pop(); }
                    if (!neu) { erg.push({ was, fehler: 'kein Fenster erschienen', raus: [], ueberlapp: [], gross: [], klein: [] }); continue; }
                    erg.push(Object.assign({ was }, messen(neu)));
                }
            }
        } finally {
            alleZu();
            // Exakt den Ausgangszustand jedes Fensters wiederherstellen
            ausgang.forEach((d, m) => { m.style.display = d; });
            ausgang.clear();
            try { window.switchView((vorher || '#home').slice(1) || 'home'); } catch (e) { /* egal */ }
            laeuft = false;
        }
        if (opt.bericht) zeigeBericht(erg, Date.now() - t0);
        console.table(erg.map(x => ({ was: x.was, raus: x.raus.length, ueberlapp: x.ueberlapp.length, gross: x.gross.length, klein: x.klein.length, fehler: x.fehler || '' })));
        return erg;
    };

    // ?handycheck in der Adresse: nach der Anmeldung von selbst starten
    if (/[?&]handycheck\b/.test(location.search)) {
        const t = setInterval(() => {
            if (!window.activeUser || !window.switchView) return;
            clearInterval(t);
            setTimeout(() => window.handyCheck(), 3000);
        }, 1000);
    }
})();
