// =============================================================================
//  KI-Chat (2026-10-01) + Schnellzugriff-Leiste auf dem Handy
// =============================================================================
//  PC/iPad: runder Knopf unten rechts (#kic-fab) öffnet ein großes Chatfenster.
//  Handy (≤768px): Leiste unten (#kic-nav) mit den wichtigsten Ansichten, ganz
//  rechts „KI" — öffnet den Chat als Vollbild über der Leiste.
//
//  Der Chat legt NIE selbst etwas an. Die KI antwortet mit JSON
//  { antwort, aktionen[] }; jede Aktion wird als Karte gezeigt, die der Nutzer
//  prüft/ändert und per Klick ausführt:
//    vorgang         → internal_processes (optional customer_id, machine_id, Schritte)
//    vorgang_stand   → status_log eines vorhandenen Vorgangs
//    aufgabe         → tasks + subtasks
//    unteraufgaben   → subtasks an vorhandene Aufgabe
//    foto            → Bilder nach R2 + manual_history_entries (type 'photo') der Maschine
//
//  Datenschutz: Text geht über kiPseudonym.fetchMaskiert (Namen/Nummern ersetzt,
//  Antwort zurückübersetzt). Bilder gehen als image_url unverändert raus — das
//  steht im Fenster. Referenzen an die KI sind lokale Kürzel (adr1, m12, t3, v4),
//  damit sie keine UUIDs abschreiben muss.
//  Abfragen nur beim Senden, 2 min gepuffert (Egress-Regel in CLAUDE.md).
// =============================================================================
(function () {
    'use strict';

    const VISION_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';
    const textModel = () => localStorage.getItem('groq_model') || 'llama-3.3-70b-versatile';
    const TYP = { note: 'Interne Notiz', call: 'Telefonat', appointment: 'Termin / Besuch', repair: 'Reparatur', maintenance: 'Wartung', offer: 'Angebot', order: 'Bestellung', complaint: 'Reklamation', other: 'Sonstiges' };
    const ERLEDIGT = /^(erledigt|abgeschlossen|done|completed|closed|archiv)/i;

    const SVG = {
        home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
        tasks: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
        processes: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
        addressbook: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
        vermietung: '<rect x="1" y="6" width="14" height="10" rx="1"/><path d="M15 9h4l3 3v4h-7z"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
        mehr: '<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>',
        ki: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z"/>',
        kamera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
        senden: '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
        zu: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
        neu: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>'
    };
    const ico = (k, s) => `<svg width="${s || 20}" height="${s || 20}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${SVG[k]}</svg>`;
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const toast = t => (typeof window.showToast === 'function' ? window.showToast(t) : alert(t));

    // Belegung der Handy-Leiste: je Benutzer in permissions.schnellzugriff (Array
    // von Ansichts-IDs, max. 5), einstellbar in der Benutzerverwaltung → Ansichten.
    // „KI" steht immer ganz rechts und zählt nicht mit.
    const NAV_STANDARD = ['home', 'tasks', 'processes', 'addressbook', 'mehr'];
    const NAV_MAX = 5;
    const KURZ = {
        home: 'Start', tasks: 'Aufgaben', processes: 'Vorgänge', addressbook: 'Adressen', machines: 'Maschinen',
        service: 'Berichte', calendar: 'Wartung', timeline: 'Timeline', mail: 'Mail', routenplanung: 'Route',
        listen: 'Listen', accounting: 'Buchhalt.', documents: 'Dokumente', protocols: 'Protokolle',
        settings: 'Einstell.', vermietung: 'Vermietung', mehr: 'Menü'
    };
    // „vermietung“ ist keine eigene Ansicht: Timeline mit Voreinstellung Vermietflotte.
    const ALIAS = { vermietung: 'timeline' };
    function sidebarLink(t) { return document.querySelector(`.sidebar-nav li a[data-target="${ALIAS[t] || t}"]`); }
    function navSymbol(t, groesse) {
        if (SVG[t]) return ico(t, groesse);
        const svg = sidebarLink(t)?.querySelector('svg');
        if (!svg) return ico('mehr', groesse);
        const k = svg.cloneNode(true);
        k.setAttribute('width', groesse); k.setAttribute('height', groesse); k.removeAttribute('style'); k.removeAttribute('class');
        return k.outerHTML;
    }
    function navLabel(t) {
        if (KURZ[t]) return KURZ[t];
        const a = sidebarLink(t);
        return a ? a.textContent.replace(/\s+/g, ' ').trim() : t;
    }
    // Alle wählbaren Ziele (für die Benutzerverwaltung): Sidebar-Ansichten + Menü
    window.kicNavKatalog = function () {
        const seen = new Set();
        const liste = [...document.querySelectorAll('.sidebar-nav li a[data-target]')].map(a => a.getAttribute('data-target'))
            .filter(t => t && !seen.has(t) && seen.add(t));
        if (seen.has('timeline')) liste.push('vermietung');
        liste.push('mehr');
        return liste.map(t => ({ t, l: navLabel(t), svg: navSymbol(t, 20) }));
    };
    window.kicNavStandard = NAV_STANDARD.slice();
    window.kicNavMax = NAV_MAX;
    function navBelegung() {
        const p = window.activeUser && window.activeUser.permissions;
        const cfg = p && Array.isArray(p.schnellzugriff) ? p.schnellzugriff.filter(t => typeof t === 'string') : null;
        return (cfg && cfg.length ? cfg : NAV_STANDARD).slice(0, NAV_MAX);
    }
    let navSignatur = '';
    function navZeichnen() {
        const nav = document.getElementById('kic-nav');
        if (!nav) return;
        const ziele = navBelegung().concat('ki');
        const sig = ziele.join(',');
        if (sig === navSignatur && nav.childElementCount) return;
        navSignatur = sig;
        nav.innerHTML = ziele.map(t => `<button type="button" data-nav="${t}" class="${t === 'ki' ? 'kic-nav-ki' : ''}">${t === 'ki' ? ico('ki', 22) : navSymbol(t, 22)}<span>${esc(t === 'ki' ? 'KI' : navLabel(t))}</span></button>`).join('');
    }
    // Briefing (js/ai-briefing.js) hat eigene Datenabfrage und Fenster — der Chat ruft es nur auf.
    const BRIEFINGS = [
        { i: '☀️', l: 'Was steht heute an?', key: 'heute' },
        { i: '📆', l: 'Nächste 3 Tage', key: 'tage3' },
        { i: '🗓️', l: 'Wochenüberblick', key: 'woche' }
    ];
    function briefingAusText(t) {
        const s = String(t || '').toLowerCase();
        if (!/(was steht|was ist|was liegt|steht .* an|zusammenfassung|briefing|überblick|tagesplan|agenda|was gibt'?s|was muss ich)/.test(s)) return null;
        if (/(maschine|adresse|kunde|vorgang \d|aufgabe:)/.test(s)) return null;
        if (/woche/.test(s)) return 'woche';
        if (/(3|drei) tage|morgen|übermorgen|nächsten tage/.test(s)) return 'tage3';
        if (/heute|täglich|tages|zusammenfassung|briefing|steht .* an/.test(s)) return 'heute';
        return null;
    }
    function briefingOeffnen(key) {
        if (typeof window.openKiBriefing !== 'function') return toast('Das KI-Briefing ist nicht geladen.');
        if (window.innerWidth <= 768) schliessen();
        window.openKiBriefing(key);
    }
    const VORSCHLAEGE = [
        { i: '📋', l: 'Vorgang anlegen', text: 'Neuer Vorgang: ' },
        { i: '🏢', l: 'Vorgang zu einer Adresse', text: 'Neuer Vorgang für Kunde ' },
        { i: '✅', l: 'Aufgabe anlegen', text: 'Neue Aufgabe: ' },
        { i: '➕', l: 'Unteraufgaben ergänzen', text: 'Zur Aufgabe … folgende Unteraufgaben hinzufügen: ' },
        { i: '📷', l: 'Foto einer Maschine zuordnen', text: 'Foto zur Maschine ', foto: true },
        { i: '⚠️', l: 'Schadensbericht aufnehmen', text: 'Schadensbericht: Maschine … — Schaden: ' },
        { i: '🔍', l: 'Bild analysieren', text: 'Was ist auf dem Bild zu sehen?', foto: true },
        { i: '✍️', l: 'Handschrift abschreiben', text: 'Bitte den handschriftlichen Zettel abschreiben und als Eintrag ablegen bei ', foto: true },
        { i: '📊', l: 'Service-Statistik', text: 'Wie sieht unsere Service-Statistik der letzten 12 Monate aus? Welche Maschinen waren am häufigsten dran?' },
        { i: '💶', l: 'Angebots-Quote', text: 'Wie viele Angebote haben wir dieses Jahr gewonnen und verloren, wie ist die Abschlussquote?' },
        { i: '🔧', l: 'Häufige Probleme', text: 'Welche Probleme und Bauteile tauchen im Service am häufigsten auf?' }
    ];

    let verlauf = [];       // { rolle:'user'|'ki', text, bilder:[nr], aktionen:[], laedt, fehler }
    let wartend = [];       // Bilder vor dem Senden: { nr, url, file }
    const alleBilder = {};  // nr → { url, file }
    let bildNr = 0;
    let laeuft = false;
    let refs = null;        // Kürzel der letzten Anfrage: { adr:{}, m:{}, t:{}, v:{} }
    let cache = { zeit: 0, tasks: [], procs: [] };

    // ---------------------------------------------------------------- Aufbau
    function aufbauen() {
        if (document.getElementById('kic-panel')) return;
        const nav = document.createElement('nav');
        nav.id = 'kic-nav';
        nav.setAttribute('aria-label', 'Schnellzugriff');
        nav.addEventListener('click', e => {
            const b = e.target.closest('[data-nav]');
            if (!b) return;
            const t = b.dataset.nav;
            if (t === 'ki') return umschalten();
            schliessen();
            if (t === 'mehr') { if (window.toggleMobileSidebar) window.toggleMobileSidebar(); return; }
            if (t === 'vermietung' && window.timelineVermietung) {
                if (window.closeMobileSidebar) window.closeMobileSidebar();
                window.timelineVermietung(); navAktiv(); return;
            }
            if (window.closeMobileSidebar) window.closeMobileSidebar();
            // wie ein Klick auf den Sidebar-Link (href="#…"): Hash setzen, damit die
            // Ansichten ihre Lade-Logik am hashchange genauso durchlaufen
            if (location.hash.slice(1) !== t) location.hash = t;
            else if (window.switchView) window.switchView(t);
            navAktiv();
        });

        const fab = document.createElement('button');
        fab.id = 'kic-fab';
        fab.type = 'button';
        fab.title = 'KI-Assistent';
        fab.setAttribute('aria-label', 'KI-Assistent öffnen');
        fab.innerHTML = ico('ki', 26);
        fab.addEventListener('click', umschalten);

        const p = document.createElement('div');
        p.id = 'kic-panel';
        p.hidden = true;
        p.setAttribute('role', 'dialog');
        p.setAttribute('aria-label', 'KI-Assistent');
        p.setAttribute('data-no-enhance', '');
        p.innerHTML = `
            <div class="kic-kopf">
                <div class="kic-logo">${ico('ki', 18)}</div>
                <div class="kic-titel"><b>KI-Assistent</b><small>Vorgänge, Aufgaben, Fotos — du bestätigst jede Aktion</small></div>
                <button type="button" class="kic-rund" data-kic="neu" title="Neuer Chat">${ico('neu', 18)}</button>
                <button type="button" class="kic-rund" data-kic="zu" title="Schließen">${ico('zu', 18)}</button>
            </div>
            <div class="kic-verlauf" id="kic-verlauf"></div>
            <div class="kic-wartend" id="kic-wartend"></div>
            ${window.micStatusHtml ? window.micStatusHtml('kic-input') : ''}
            <form class="kic-eingabe" id="kic-form">
                ${window.micButtonHtml ? window.micButtonHtml('kic-input', { label: '' }) : ''}
                <button type="button" class="kic-rund" data-kic="foto" title="Foto aufnehmen oder hochladen">${ico('kamera', 20)}</button>
                <textarea id="kic-input" rows="1" placeholder="Schreiben oder diktieren …" enterkeyhint="send"></textarea>
                <button type="submit" class="kic-senden" title="Senden">${ico('senden', 18)}</button>
            </form>
            <input type="file" id="kic-datei" accept="image/*" multiple hidden>
            <datalist id="kic-dl-m"></datalist><datalist id="kic-dl-adr"></datalist>`;
        document.body.append(nav, fab, p);

        const inp = p.querySelector('#kic-input');
        const groesse = () => { inp.style.height = 'auto'; if (inp.value) inp.style.height = Math.min(inp.scrollHeight, 140) + 'px'; };
        inp.addEventListener('input', groesse);
        inp.addEventListener('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey && !window.matchMedia('(pointer: coarse)').matches) { e.preventDefault(); senden(); }
        });
        p.querySelector('#kic-form').addEventListener('submit', e => { e.preventDefault(); senden(); });
        p.querySelector('#kic-datei').addEventListener('change', e => { bilderDazu(e.target.files); e.target.value = ''; });
        p.addEventListener('click', klick);
        p.addEventListener('dragover', e => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { e.preventDefault(); p.classList.add('kic-drop'); } });
        p.addEventListener('dragleave', e => { if (e.target === p) p.classList.remove('kic-drop'); });
        p.addEventListener('drop', e => { e.preventDefault(); p.classList.remove('kic-drop'); bilderDazu(e.dataTransfer.files); });
        inp.addEventListener('paste', e => {
            const f = [...(e.clipboardData?.files || [])].filter(x => /^image\//.test(x.type));
            if (f.length) { e.preventDefault(); bilderDazu(f); }
        });
        document.addEventListener('keydown', e => { if (e.key === 'Escape' && !p.hidden && !document.querySelector('.ki-freigabe')) schliessen(); });
        window.addEventListener('hashchange', navAktiv);
        // Ansichtswechsel ohne Hash (switchView direkt) sofort in der Leiste zeigen
        if (typeof window.switchView === 'function' && !window.switchView._kic) {
            const orig = window.switchView;
            window.switchView = function () { const r = orig.apply(this, arguments); navAktiv(); return r; };
            window.switchView._kic = true;
        }

        render();
        sichtbarkeit();
        setInterval(sichtbarkeit, 2000);
    }

    // Leiste/Knopf nur angemeldet; Leisten-Punkte folgen den Rechten der Sidebar.
    function sichtbarkeit() {
        const an = !!window.activeUser;
        document.body.classList.toggle('kic-an', an);
        if (!an) schliessen();
        navZeichnen();
        document.querySelectorAll('#kic-nav [data-nav]').forEach(b => {
            const link = sidebarLink(b.dataset.nav);
            b.hidden = !!(link && link.parentElement.style.display === 'none');
        });
        navAktiv();
    }
    function navAktiv() {
        const auf = !document.getElementById('kic-panel')?.hidden;
        const v = window.currentActiveView || (location.hash || '#home').slice(1);
        document.querySelectorAll('#kic-nav [data-nav]').forEach(b => {
            const vm = v === 'timeline' && window.timelinePresetAktiv && window.timelinePresetAktiv() === 'vermiet'
                && document.querySelector('#kic-nav [data-nav="vermietung"]');
            b.classList.toggle('aktiv', auf ? b.dataset.nav === 'ki'
                : (vm ? b.dataset.nav === 'vermietung' : b.dataset.nav === v));
        });
    }

    function oeffnen(text) {
        const p = document.getElementById('kic-panel');
        if (!p) return;
        p.hidden = false;
        document.body.classList.add('kic-offen');
        navAktiv();
        const inp = document.getElementById('kic-input');
        if (text != null) { inp.value = text; inp.dispatchEvent(new Event('input')); }
        if (!window.matchMedia('(pointer: coarse)').matches || text != null) setTimeout(() => { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }, 30);
        if (typeof window.customerCacheGet === 'function') window.customerCacheGet().catch(() => {});
    }
    function schliessen() {
        const p = document.getElementById('kic-panel');
        if (!p || p.hidden) return;
        if (window.stopSpeechInput) window.stopSpeechInput();
        p.hidden = true;
        document.body.classList.remove('kic-offen');
        navAktiv();
    }
    function umschalten() { const p = document.getElementById('kic-panel'); if (p && p.hidden) oeffnen(); else schliessen(); }
    window.openKiChat = oeffnen;
    window.closeKiChat = schliessen;
    window.kiChatMaschineAusText = t => maschineAusText(t);

    function klick(e) {
        const b = e.target.closest('[data-kic]');
        if (!b) return;
        const a = b.dataset.kic;
        if (a === 'zu') schliessen();
        else if (a === 'neu') { if (laeuft) return; verlauf = []; wartend = []; render(); }
        else if (a === 'foto') document.getElementById('kic-datei').click();
        else if (a === 'briefing') briefingOeffnen(b.dataset.key);
        else if (a === 'adr-wahl') {
            const k = b.closest('.kic-karte');
            const f = k && k.querySelector('.kic-f-adr');
            if (f) { f.value = b.dataset.v; b.parentElement.remove(); }
        }
        else if (a === 'vorschlag') {
            const v = VORSCHLAEGE[+b.dataset.i];
            oeffnen(v.text);
            if (v.foto) document.getElementById('kic-datei').click();
        }
        else if (a === 'bild-weg') { wartend = wartend.filter(x => x.nr !== +b.dataset.nr); renderWartend(); }
        else if (a === 'bild') { const u = alleBilder[b.dataset.nr]; if (u) window.open(u.url, '_blank'); }
        else if (a === 'ausfuehren') ausfuehren(b.closest('.kic-karte'));
        else if (a === 'verwerfen') { const k = b.closest('.kic-karte'); const ak = aktionVon(k); if (ak) { ak.status = 'verworfen'; render(); } }
        else if (a === 'oeffnen') oeffneZiel(aktionVon(b.closest('.kic-karte')));
    }

    // ---------------------------------------------------------------- Bilder
    function verkleinern(file, max) {
        return new Promise((res, rej) => {
            const r = new FileReader();
            r.onerror = rej;
            r.onload = () => {
                const img = new Image();
                img.onerror = rej;
                img.onload = () => {
                    const f = Math.min(1, max / Math.max(img.width, img.height));
                    const c = document.createElement('canvas');
                    c.width = Math.round(img.width * f); c.height = Math.round(img.height * f);
                    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
                    res(c.toDataURL('image/jpeg', 0.82));
                };
                img.src = r.result;
            };
            r.readAsDataURL(file);
        });
    }
    async function bilderDazu(files) {
        const liste = [...(files || [])].filter(f => /^image\//.test(f.type));
        if (!liste.length) return;
        if (document.getElementById('kic-panel').hidden) oeffnen();
        for (const f of liste.slice(0, 6)) {
            try {
                const url = await verkleinern(f, 1280);
                const nr = ++bildNr;
                alleBilder[nr] = { url, file: f };
                wartend.push({ nr, url, file: f });
            } catch (e) { toast('Bild konnte nicht gelesen werden: ' + f.name); }
        }
        renderWartend();
        document.getElementById('kic-input').focus();
    }
    function renderWartend() {
        const el = document.getElementById('kic-wartend');
        el.innerHTML = wartend.map(b => `<div class="kic-thumb"><img src="${b.url}" alt="Bild ${b.nr}"><span>Bild ${b.nr}</span><button type="button" data-kic="bild-weg" data-nr="${b.nr}" title="Entfernen">×</button></div>`).join('');
        el.hidden = !wartend.length;
    }

    // ---------------------------------------------------------------- Kontext
    const machineLabel = m => (typeof window.machineLabel === 'function' ? window.machineLabel(m) : null)
        || [m.manufacturer, m.name, (m.serial || m.serial_number) ? 'SN ' + (m.serial || m.serial_number) : ''].filter(Boolean).join(' ');
    const worte = s => String(s || '').toLowerCase().split(/[^a-zà-ÿ0-9]+/i).filter(w => w.length > 3);
    function treffer(hay, text) {
        const w = worte(text);
        return w.reduce((n, x) => n + (hay.includes(x) ? 1 : 0), 0);
    }

    async function ladeOffene() {
        if (Date.now() - cache.zeit < 120000) return;
        const sb = window.supabaseClient;
        if (!sb) return;
        const [t, v, s] = await Promise.all([
            sb.from('tasks').select('id, title, machine_id, status').neq('status', 'completed').order('id', { ascending: false }).limit(300),
            sb.from('internal_processes').select('*').order('id', { ascending: false }).limit(300),
            // Serviceberichte schmal (ohne Unterschriften) — für „beim Servicebericht ergänzen"
            sb.from('service_entries').select('id, machine_id, title, date, created_at, is_finalized').order('id', { ascending: false }).limit(400)
        ]);
        cache = {
            zeit: Date.now(),
            tasks: t.data || [],
            berichte: s.data || [],
            procs: (v.data || []).filter(x => !ERLEDIGT.test(String(x.status || ''))).map(x => ({ id: x.id, title: x.title, customer_id: x.customer_id, machine_id: x.machine_id, status: x.status }))
        };
    }

    // OCR-typische Verwechsler angleichen (Typenschild-Fotos): O→0, I/L→1, S→5, B→8, Z→2
    const ocr = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1').replace(/S/g, '5').replace(/B/g, '8').replace(/Z/g, '2');
    function abstand(a, b) {
        if (Math.abs(a.length - b.length) > 1) return 9;
        const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
        for (let j = 1; j <= b.length; j++) d[0][j] = j;
        for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
            d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        return d[a.length][b.length];
    }
    // Typ-Kürzel einer Maschine: ganzer Name und Teile mit Ziffer UND anderem Zeichen
    // („5.45", „RS4", „SB-500") — reine Zahlen („250") wären zu unsicher.
    function typSchluessel(m) {
        const k = new Set();
        [m.name, m.matchcode].filter(Boolean).forEach(t => {
            const n = String(t).toLowerCase().replace(/\s+/g, ' ').trim();
            if (/\d/.test(n) && n.length >= 3) k.add(n);
            n.split(/[\s,;/()]+/).forEach(w => { if (/\d/.test(w) && /\D/.test(w) && w.length >= 3) k.add(w); });
        });
        return [...k];
    }
    const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const typRe = k => new RegExp('(?<![a-z0-9.,])' + escRe(k) + '(?![a-z0-9]|[.,]\\d)');
    // Maschine, die der Text EINDEUTIG meint: steht „5.45" im Text und gibt es nur
    // eine 5.45, ist sie es. Gibt es mehrere gleiche Typen, entscheidet Hersteller,
    // Firma oder Seriennummer im Text — sonst keine Wahl.
    function maschineAusText(text) {
        const t = ' ' + String(text || '').toLowerCase().replace(/(\d),(\d)/g, '$1.$2').replace(/\s+/g, ' ') + ' ';
        if (!t.trim()) return null;
        const liste = window.machineList || [];
        const woerter = t.split(/[^a-z0-9.\-/]+/).map(ocr).filter(w => w.length >= 3);
        const perSn = liste.filter(m => { const x = ocr(m.serial || m.serial_number); return x.length >= 3 && woerter.includes(x); });
        if (perSn.length === 1) return { m: perSn[0], sicher: true, grund: 'Seriennummer ' + (perSn[0].serial || perSn[0].serial_number) };
        let best = [], bestLen = 0;
        liste.forEach(m => {
            typSchluessel(m).forEach(k => {
                if (!typRe(k).test(t)) return;
                if (k.length > bestLen) { best = [m]; bestLen = k.length; }
                else if (k.length === bestLen && !best.includes(m)) best.push(m);
            });
        });
        if (best.length === 1) return { m: best[0], sicher: true, grund: 'Typ ' + best[0].name + ' (einzige im Bestand)' };
        if (best.length > 1) {
            const eng = best.filter(m => (m.company && t.includes(String(m.company).toLowerCase())) || (m.location && t.includes(String(m.location).toLowerCase())));
            if (eng.length === 1) return { m: eng[0], sicher: true, grund: 'Typ ' + eng[0].name + ' · ' + (eng[0].company || eng[0].location) };
            const sn = best.filter(m => { const x = ocr(m.serial || m.serial_number); return x.length >= 2 && woerter.concat(t.split(/\s+/).map(ocr)).includes(x); });
            if (sn.length === 1) return { m: sn[0], sicher: true, grund: 'Typ ' + sn[0].name + ' · SN ' + (sn[0].serial || sn[0].serial_number) };
        }
        return null;
    }
    // Maschine aus den von der KI gelesenen Angaben bestimmen.
    // Seriennummer: exakt (nach OCR-Angleich) > enthalten > 1 Zeichen daneben.
    // Ohne Seriennummer: Hersteller/Typ/Baujahr/Kunde punkten — nur eindeutig gewinnt.
    function maschineFinden(e) {
        const liste = window.machineList || [];
        const sn = ocr(e.seriennummer);
        if (sn.length >= 3) {
            const exakt = liste.filter(m => ocr(m.serial || m.serial_number) === sn);
            if (exakt.length === 1) return { m: exakt[0], sicher: true, grund: 'Seriennummer ' + e.seriennummer };
            if (sn.length >= 5) {
                const teil = liste.filter(m => { const x = ocr(m.serial || m.serial_number); return x.length >= 5 && (x.includes(sn) || sn.includes(x)); });
                if (teil.length === 1) return { m: teil[0], sicher: true, grund: 'Seriennummer ' + e.seriennummer };
                const nah = liste.filter(m => { const x = ocr(m.serial || m.serial_number); return x.length >= 5 && abstand(x, sn) <= 1; });
                if (nah.length === 1) return { m: nah[0], sicher: false, grund: 'Seriennummer ähnlich ' + e.seriennummer + ' — bitte prüfen' };
            }
        }
        const ausTyp = maschineAusText([e.hersteller, e.typ].filter(Boolean).join(' '));
        if (ausTyp) return ausTyp;
        const kundenIds = new Set();
        if (e.kunde && window.customerCacheSearchSync) window.customerCacheSearchSync(e.kunde, 5).forEach(k => kundenIds.add(String(k.id)));
        const her = String(e.hersteller || '').toLowerCase(), typ = String(e.typ || '').toLowerCase();
        const bewertet = liste.map(m => {
            let p = 0;
            if (her && String(m.manufacturer || '').toLowerCase().includes(her)) p += 2;
            if (typ && (treffer(String(m.name || '').toLowerCase() + ' ' + String(m.matchcode || '').toLowerCase(), typ) || String(m.name || '').toLowerCase().includes(typ))) p += 3;
            if (e.baujahr && String(m.year || '') === String(e.baujahr).trim()) p += 1;
            if (m.customer_id && kundenIds.has(String(m.customer_id))) p += 3;
            return { m, p };
        }).filter(x => x.p >= 4).sort((a, b) => b.p - a.p);
        if (bewertet.length && (bewertet.length === 1 || bewertet[0].p > bewertet[1].p))
            return { m: bewertet[0].m, sicher: false, grund: [e.hersteller, e.typ, e.kunde].filter(Boolean).join(' · ') + ' — bitte prüfen' };
        return null;
    }

    function kontextBauen(text) {
        const hay = String(text || '').toLowerCase();
        const hayZ = hay.replace(/[^a-z0-9]/g, '');
        refs = { adr: {}, m: {}, t: {}, v: {}, s: {} };
        const kunden = (window.customerCacheSync && window.customerCacheSync()) || [];
        const kundeById = new Map(kunden.map(k => [String(k.id), k]));

        // Adressen + Maschinen: Punkte-Erkennung (js/ki-erkennung.js) — Tippfehler,
        // Umlaute, Ort/PLZ/Nr., seltene Namensteile zählen mehr. Rückfall: Wortsuche.
        const E = window.kiErkennung;
        const adrTreffer = E ? E.adressen(text) : [];
        const adr = new Map(adrTreffer.slice(0, 10).map(a => [String(a.k.id), a.k]));
        if (!E) worte(text).forEach(w => {
            if (adr.size >= 10 || !window.customerCacheSearchSync) return;
            window.customerCacheSearchSync(w, 4).forEach(k => { if (adr.size < 10) adr.set(String(k.id), k); });
        });
        const maschTreffer = E ? E.maschinen(text, adrTreffer) : [];
        const maschPunkte = new Map(maschTreffer.map(x => [x.m.id, x.score]));

        // Maschinen: Wort-/Seriennummer-Treffer, dann Maschinen der gefundenen Adressen
        const ms = (window.machineList || []).map(m => {
            const sn = String(m.serial || m.serial_number || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
            let s = treffer(hay, [m.name, m.manufacturer, m.matchcode].join(' ')) + treffer(hay, [m.company, m.location].join(' ')) * 0.5;
            if (sn.length >= 3 && (hayZ.includes(sn) || ocr(hay).includes(ocr(sn)))) s += 5;
            if (m.customer_id && adr.has(String(m.customer_id))) s += 2;
            if (typSchluessel(m).some(k => typRe(k).test(hay))) s += 6;
            s += (maschPunkte.get(m.id) || 0) * 1.5;
            return { m, s };
        }).filter(x => x.s >= 1).sort((a, b) => b.s - a.s).slice(0, 25).map(x => x.m);

        const tasks = cache.tasks.map(t => ({ t, s: treffer(hay, t.title) + (ms.some(m => String(m.id) === String(t.machine_id)) ? 2 : 0) }))
            .sort((a, b) => b.s - a.s).slice(0, 20).map(x => x.t);
        const procs = cache.procs.map(v => ({ v, s: treffer(hay, v.title) + (v.customer_id && adr.has(String(v.customer_id)) ? 3 : 0) + (ms.some(m => String(m.id) === String(v.machine_id)) ? 2 : 0) }))
            .sort((a, b) => b.s - a.s).slice(0, 20).map(x => x.v);
        procs.forEach(v => { if (v.customer_id && !adr.has(String(v.customer_id)) && kundeById.has(String(v.customer_id))) adr.set(String(v.customer_id), kundeById.get(String(v.customer_id))); });

        const z = [];
        let i = 0;
        z.push('ADRESSEN:'); adr.forEach(k => { const r = 'adr' + (++i); refs.adr[r] = k; z.push(`${r} = ${k.name}${k.city ? ' (' + k.city + ')' : ''}`); });
        if (!i) z.push('(keine passende gefunden)');
        z.push('MASCHINEN:'); ms.forEach(m => { refs.m['m' + m.id] = m; z.push(`m${m.id} = ${machineLabel(m)}`); });
        if (!ms.length) z.push('(keine passende gefunden)');
        i = 0;
        z.push('OFFENE AUFGABEN:'); tasks.forEach(t => { const r = 't' + (++i); refs.t[r] = t; z.push(`${r} = ${t.title || 'Aufgabe'}${t.machine_id ? ' (Maschine m' + t.machine_id + ')' : ''}`); });
        i = 0;
        z.push('OFFENE VORGÄNGE:'); procs.forEach(v => { const r = 'v' + (++i); refs.v[r] = v; const k = kundeById.get(String(v.customer_id)); z.push(`${r} = ${v.title || 'Vorgang'}${k ? ' — ' + k.name : ''}`); });
        // Serviceberichte der erkannten Maschinen (neueste zuerst, je Maschine 4, gesamt 15)
        i = 0;
        const mIds = new Set(ms.slice(0, 6).map(m => String(m.id)));
        const jeM = {};
        let berichte = (cache.berichte || []).filter(b => mIds.has(String(b.machine_id)) && (jeM[b.machine_id] = (jeM[b.machine_id] || 0) + 1) <= 4).slice(0, 15);
        // Keine Maschine erkannt, aber vom Bericht die Rede → die neuesten zur Auswahl
        if (!berichte.length && /bericht|servicebericht|einsatz/i.test(hay)) berichte = (cache.berichte || []).slice(0, 8);
        z.push('SERVICEBERICHTE:');
        berichte.forEach(b => {
            const r = 's' + (++i); refs.s[r] = b;
            const d = b.date || b.created_at;
            z.push(`${r} = ${b.title || 'Servicebericht'}${d ? ' vom ' + new Date(d).toLocaleDateString('de-DE') : ''} (Maschine m${b.machine_id})${b.is_finalized ? ' [abgeschlossen]' : ''}`);
        });
        if (!berichte.length) z.push('(keiner zu den genannten Maschinen)');
        z.push('MITARBEITER: ' + (window.userList || []).map(u => u.name).filter(Boolean).join(', '));
        return z.join('\n');
    }

    function systemPrompt(kontext) {
        const heute = new Date().toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
        return `Du bist der KI-Assistent der meetra-Webapp (Hersteller/Service von Recycling-Maschinen, Werkstatt). Heute ist ${heute}. Angemeldet: ${window.activeUser?.name || 'Nutzer'}.
Du antwortest kurz und freundlich auf Deutsch und schlägst Aktionen vor. Der Nutzer bestätigt jede Aktion selbst — du legst nichts an, sage also nie "erledigt", sondern "Vorschlag unten".
Antworte AUSSCHLIESSLICH mit JSON: {"antwort":"Text an den Nutzer","aktionen":[...]}
Mögliche Aktionen:
{"art":"vorgang","titel":"kurz","beschreibung":"Details","typ":"${Object.keys(TYP).join('|')}","adresse":"adrN|null","maschine":"mID|null","schritte":["nächste Arbeitsschritte"],"zustaendig":["Mitarbeitername"]}
{"art":"vorgang_stand","vorgang":"vN","text":"neuer Stand"}
{"art":"aufgabe","titel":"kurz","beschreibung":"","maschine":"mID|null","unteraufgaben":["…"],"zustaendig":["Mitarbeitername"]}
{"art":"unteraufgaben","aufgabe":"tN","unteraufgaben":["…"]}
{"art":"foto","maschine":"mID|null","bilder":[Bildnummern],"titel":"kurz","notiz":"was zu sehen ist"}
{"art":"handschrift","adresse":"adrN|null","maschine":"mID|null","titel":"kurz, worum es geht","text":"vollständige wörtliche Abschrift","bilder":[Bildnummern],"unsicher":["schwer lesbare Wörter/Zahlen"]}
{"art":"servicebericht","bericht":"sN|null","maschine":"mID|null","bilder":[Bildnummern],"text":"Ergänzung/Bemerkung oder leer"}
{"art":"schaden","maschine":"mID|null","titel":"kurz, z. B. Hydraulikschlauch geplatzt","schaden":"was ist beschädigt/defekt, wie sieht es aus","bauteil":"betroffenes Bauteil","ursache":"vermutete Ursache oder leer","schwere":"gering|mittel|hoch","betriebsbereit":"ja|eingeschränkt|nein","massnahme":"empfohlene Reparatur/Sofortmaßnahme","bilder":[Bildnummern]}
Jede Aktion mit Maschinenbezug bekommt zusätzlich "erkannt":{"seriennummer":"","hersteller":"","typ":"","baujahr":"","kunde":""} — genau so, wie es im Text oder auf dem Bild (Typenschild!) steht, Ziffern exakt abschreiben, Unbekanntes leer. Damit ordnet die App die Maschine auch zu, wenn sie nicht in der Liste steht.
Regeln:
- Nur Kürzel aus den LISTEN verwenden. Passt nichts eindeutig: null setzen und in "antwort" kurz nachfragen.
- "Vorgang für Kunde X" → adresse setzen. Unteraufgaben zu einer vorhandenen Aufgabe nur, wenn der Nutzer das will oder die Aufgabe eindeutig gemeint ist.
- Ist keine passende Maschine in der Liste, "maschine": null lassen — aber "erkannt" immer ausfüllen.
- Bilder: kurz beschreiben, was zu sehen ist. Typenschild → Seriennummer/Hersteller lesen und die Maschine aus der Liste zuordnen. Will der Nutzer das Foto ablegen oder zuordnen → Aktion "foto".
- "Schaden", "Schadensbericht", "kaputt", "beschädigt" oder ein Schaden auf dem Foto → Aktion "schaden" (die App legt auf Wunsch selbst den Reparatur-Vorgang dazu an, also NICHT zusätzlich "vorgang"). Fehlt Wichtiges, trotzdem die Aktion liefern und in "antwort" kurz nachfragen.
- Handschriftlicher Zettel, Notiz, Aufmaß, Formular oder Liste auf dem Foto → Aktion "handschrift": den Text VOLLSTÄNDIG und WÖRTLICH abschreiben (Zeilenumbrüche als \n, Zahlen, Maße, Seriennummern und Telefonnummern exakt, Abkürzungen nicht auflösen), unleserliche Stellen als [?] markieren und in "unsicher" nennen. Adresse/Maschine aus Text oder Zettel zuordnen. Nicht zusammenfassen — die Zusammenfassung gehört höchstens in "titel".
- "Servicebericht", "Bericht", "Einsatz", "beim Bericht", "zum Bericht hinzufügen/ergänzen/nachtragen/anhängen" → Aktion "servicebericht": der Nutzer will etwas an einem VORHANDENEN Servicebericht ablegen (Bilder anhängen und/oder Text ergänzen). Bericht aus SERVICEBERICHTE wählen (passende Maschine, sonst der neueste); "letzter"/"heutiger" = neuester. Ist keiner eindeutig: "bericht": null, aber "maschine" setzen. Bilder dann NICHT zusätzlich als "foto" vorschlagen.
- Sonstige Defekte → gerne Vorgang (typ repair) oder Aufgabe vorschlagen.
- typ nach Inhalt: Störung/Defekt repair, Wartung maintenance, Preisanfrage offer, Bestellung order, Beschwerde complaint, Besuch/Termin appointment, Anruf call, reine Info note.
- Reine Fragen oder Smalltalk → "aktionen": [].
${window.kiAuswertung ? `
FRAGEN NACH ZAHLEN, STATISTIKEN, HÄUFIGKEITEN, VERLÄUFEN (z. B. „welche Maschinen oft im Service", „wie viele Angebote gewonnen", „was war bei Maschine X"):
Antworte ZUERST NUR mit {"abfragen":[{"name":"…", …Parameter}]} — ohne "antwort". Die App rechnet und schickt dir die ERGEBNISSE; dann antwortest du normal mit {"antwort":"…","aktionen":[]}.
In der Antwort mit Zahlen: konkrete Zahlen und Namen aus den ERGEBNISSEN nennen, nichts erfinden, nichts schätzen. Markdown erlaubt: **fett**, Listen mit "- ", kleine Tabellen mit | Spalte | Spalte |. Am Ende 1–2 Sätze Einordnung oder Empfehlung.
${window.kiAuswertung.KATALOG}` : ''}
LISTEN:
${kontext}`;
    }

    // ---------------------------------------------------------------- Senden
    async function senden() {
        if (laeuft) return;
        const inp = document.getElementById('kic-input');
        const text = inp.value.trim();
        if (!text && !wartend.length) return;
        if (window.stopSpeechInput) window.stopSpeechInput();
        const bk = !wartend.length && briefingAusText(text);
        if (bk) {
            inp.value = ''; inp.dispatchEvent(new Event('input'));
            verlauf.push({ rolle: 'user', text, bilder: [] }, { rolle: 'ki', text: 'Ich öffne das Briefing (' + BRIEFINGS.find(x => x.key === bk).l + ') — dort stehen Termine, fällige Wartungen, Wiedervorlagen und Aufgaben.', aktionen: [] });
            render();
            briefingOeffnen(bk);
            return;
        }
        const nutzer = { rolle: 'user', text, bilder: wartend.map(b => b.nr) };
        verlauf.push(nutzer);
        wartend = []; renderWartend();
        inp.value = ''; inp.dispatchEvent(new Event('input'));
        const ki = { rolle: 'ki', text: '', laedt: true, aktionen: [] };
        verlauf.push(ki);
        laeuft = true;
        render();
        nutzer._status = t => { ki.status = t; render(); };
        try {
            const r = await frageKi(nutzer);
            ki.text = r.antwort || (r.aktionen.length ? 'Hier mein Vorschlag:' : 'Keine Antwort erhalten.');
            ki.aktionen = r.aktionen;
            ki.abfragen = r.abfragen || null;
        } catch (e) {
            ki.fehler = true;
            ki.text = e && e.abgebrochen ? 'Nicht an die KI gesendet.' : ('⚠️ ' + (e && e.message || e));
        }
        ki.laedt = false;
        delete nutzer._status;
        laeuft = false;
        render();
    }

    async function frageKi(nutzer) {
        try { await ladeOffene(); } catch (e) { console.warn('KI-Chat: offene Einträge nicht geladen', e); }
        const bisher = verlauf.slice(0, -2).filter(m => !m.laedt).slice(-8);
        const kontextText = bisher.map(m => m.text).concat(nutzer.text).join(' ');
        const messages = [{ role: 'system', content: systemPrompt(kontextBauen(kontextText)) }];
        bisher.forEach(m => messages.push({
            role: m.rolle === 'user' ? 'user' : 'assistant',
            content: (m.text || '') + (m.bilder && m.bilder.length ? ` [Bild ${m.bilder.join(', ')} angehängt]` : '')
                + (m.aktionen && m.aktionen.length ? ' [Vorschläge: ' + m.aktionen.map(a => a.art + (a.status ? ' ' + a.status : '')).join(', ') + ']' : '')
        }));
        messages.push({ role: 'user', content: (nutzer.text || 'Bitte analysiere die Bilder.') + (nutzer.bilder.length ? ` [Bild ${nutzer.bilder.join(', ')} angehängt]` : '') });
        // Bilder als eigene Nachricht: Inhalts-Arrays werden nicht maskiert, deshalb dort kein Text außer der Nummer.
        if (nutzer.bilder.length) {
            messages.push({ role: 'user', content: nutzer.bilder.flatMap(nr => [{ type: 'text', text: 'Bild ' + nr + ':' }, { type: 'image_url', image_url: { url: alleBilder[nr].url } }]) });
        }
        const payload = { model: nutzer.bilder.length ? VISION_MODEL : textModel(), messages, temperature: 0.2, max_tokens: 2048, response_format: { type: 'json_object' } };
        const holen = window.kiPseudonym ? window.kiPseudonym.fetchMaskiert : window.groqFetch;
        let resp = await holen(payload);
        if (resp.status === 400 && nutzer.bilder.length === 0) {
            // Manche Modelle kennen response_format nicht — einmal ohne
            delete payload.response_format;
            resp = await holen(payload);
        }
        let roh = await inhaltVon(resp);
        // Auswertungs-Runde: KI wünscht Abfragen → App rechnet → zweiter Aufruf mit den Ergebnissen
        const w = jsonAus(roh);
        if (w && Array.isArray(w.abfragen) && w.abfragen.length && window.kiAuswertung) {
            nutzer._status && nutzer._status('Rechne Auswertung …');
            const erg = await window.kiAuswertung.ausfuehren(w.abfragen, refs);
            messages.push({ role: 'assistant', content: roh });
            messages.push({ role: 'user', content: 'ERGEBNISSE DER ABFRAGEN:\n' + erg.text + '\n\nBeantworte jetzt die ursprüngliche Frage mit diesen Zahlen. Antworte als JSON {"antwort":"…","aktionen":[]} — keine weiteren "abfragen".' });
            payload.max_tokens = 3000;
            nutzer._status && nutzer._status('Schreibe Antwort …');
            resp = await holen(payload);
            roh = await inhaltVon(resp);
            const r = auswerten(roh, nutzer.text);
            r.abfragen = erg.liste;
            return r;
        }
        return auswerten(roh, nutzer.text);
    }
    async function inhaltVon(resp) {
        let j = null;
        try { j = await resp.json(); } catch (e) { /* unten */ }
        if (!resp.ok) throw new Error((j && j.error && (j.error.message || j.error)) || ('KI-Fehler ' + resp.status));
        return j && j.choices && j.choices[0] && j.choices[0].message ? j.choices[0].message.content : '';
    }
    function jsonAus(roh) {
        const t = String(roh || '').replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
        try { return JSON.parse(t); } catch (e) {
            const a = t.indexOf('{'), b = t.lastIndexOf('}');
            if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch (e2) { return null; } }
            return null;
        }
    }

    function auswerten(roh, nutzerText) {
        // Eindeutige Treffer aus dem Nutzertext — die setzt die App selbst,
        // auch wenn die KI null liefert oder danebenliegt.
        const E = window.kiErkennung;
        const adrListe = E ? E.adressen(nutzerText) : [];
        const adrSicher = E ? E.eindeutig(adrListe, 4) : null;
        const maschSicher = E ? E.eindeutig(E.maschinen(nutzerText, adrListe), 5) : null;
        const ausText = maschineAusText(nutzerText) || (maschSicher ? { m: maschSicher.m, sicher: maschSicher.score >= 6, grund: maschSicher.grund } : null);
        const kundeVon = id => ((window.customerCacheSync && window.customerCacheSync()) || []).find(k => String(k.id) === String(id)) || null;
        let o = null;
        const s = String(roh || '').replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
        try { o = JSON.parse(s); } catch (e) {
            const a = s.indexOf('{'), b = s.lastIndexOf('}');
            if (a >= 0 && b > a) { try { o = JSON.parse(s.slice(a, b + 1)); } catch (e2) { o = null; } }
        }
        if (!o) return { antwort: s, aktionen: [] };
        const r = refs || { adr: {}, m: {}, t: {}, v: {} };
        const liste = (Array.isArray(o.aktionen) ? o.aktionen : []).map(a => {
            const x = Object.assign({}, a);
            x.maschine = a.maschine && r.m[a.maschine] ? r.m[a.maschine] : null;
            x.erkannt = a.erkannt || o.erkannt || null;
            const f = ausText || (x.erkannt ? maschineFinden(x.erkannt) : null);
            // Sicher gelesene Seriennummer schlägt die Wahl der KI
            if (f && (!x.maschine || (f.sicher && f.m.id !== x.maschine.id))) x.maschine = f.m;
            x.treffer = f ? (f.m === x.maschine ? f.grund : '') : '';
            x.adresse = a.adresse && r.adr[a.adresse] ? r.adr[a.adresse] : null;
            // Adresse: eindeutig im Text erkannt → setzen (bzw. KI-Wahl korrigieren,
            // wenn die KI eine andere als die klar genannte nimmt)
            if (adrSicher && (!x.adresse || String(x.adresse.id) !== String(adrSicher.k.id))) {
                x.adresse = adrSicher.k; x.adrTreffer = 'erkannt über ' + adrSicher.grund;
            }
            // Keine Adresse, aber Maschine mit Kundenverknüpfung → deren Kunde
            if (!x.adresse && x.maschine && x.maschine.customer_id) {
                const k = kundeVon(x.maschine.customer_id);
                if (k) { x.adresse = k; x.adrTreffer = 'von der Maschine übernommen'; }
            }
            // KI hat keine Adresse gesetzt, die Erkennung aber Vorschläge → auf der Karte nennen
            // Mehrdeutig (z. B. zwei „Ostendorf"): ohne Adresse → Vorschläge; hat die
            // KI eine gewählt, aber ähnlich gute Alternativen gibt es → „Oder:" zeigen.
            const nahe = adrListe.length ? adrListe.filter(t => t.score >= adrListe[0].score * 0.75) : [];
            x.adrVorschlaege = !x.adresse ? nahe.slice(0, 3).map(t => t.k)
                : (!x.adrTreffer && nahe.length > 1 ? nahe.filter(t => String(t.k.id) !== String(x.adresse.id)).slice(0, 2).map(t => t.k) : []);
            x.adrOder = !!x.adresse && x.adrVorschlaege.length > 0;
            x.aufgabe = a.aufgabe && r.t[a.aufgabe] ? r.t[a.aufgabe] : null;
            x.vorgang = a.vorgang && r.v[a.vorgang] ? r.v[a.vorgang] : null;
            x.bericht = a.bericht && r.s && r.s[a.bericht] ? r.s[a.bericht] : null;
            // Bericht gewählt, aber Maschine fehlt/abweichend → Maschine des Berichts
            if (x.bericht && x.bericht.machine_id) {
                const bm = (window.machineList || []).find(m => String(m.id) === String(x.bericht.machine_id));
                if (bm) x.maschine = bm;
            }
            x.kand = { t: Object.values(r.t), v: Object.values(r.v), s: Object.values(r.s || {}) };
            return x;
        }).filter(a => ['vorgang', 'vorgang_stand', 'aufgabe', 'unteraufgaben', 'foto', 'schaden', 'handschrift', 'servicebericht'].includes(a.art));
        return { antwort: String(o.antwort || ''), aktionen: liste };
    }

    // ---------------------------------------------------------------- Darstellung
    function render() {
        const el = document.getElementById('kic-verlauf');
        if (!el) return;
        if (!verlauf.length) {
            el.innerHTML = `<div class="kic-leer">
                <div class="kic-leer-logo">${ico('ki', 30)}</div>
                <h3>Hallo${window.activeUser?.name ? ' ' + esc(String(window.activeUser.name).split(' ')[0]) : ''}! Was soll ich erledigen?</h3>
                <p>Schreib oder diktiere frei — z. B. „Kunde Müller hat angerufen, Shredder macht Geräusche, bitte Termin" — oder schick ein Foto vom Typenschild.</p>
                <div class="kic-briefing">${BRIEFINGS.map(v => `<button type="button" data-kic="briefing" data-key="${v.key}"><span>${v.i}</span>${esc(v.l)}</button>`).join('')}</div>
                <div class="kic-chips">${VORSCHLAEGE.map((v, i) => `<button type="button" data-kic="vorschlag" data-i="${i}"><span>${v.i}</span>${esc(v.l)}</button>`).join('')}</div>
                <p class="kic-hinweis">🔒 Namen, Firmen und Nummern im Text werden vor dem Senden ersetzt. Fotos gehen unverändert an die KI.</p>
            </div>`;
            return;
        }
        el.innerHTML = verlauf.map((m, mi) => {
            if (m.rolle === 'user') {
                return `<div class="kic-msg kic-user">${m.bilder.length ? `<div class="kic-msg-bilder">${m.bilder.map(nr => `<img src="${alleBilder[nr].url}" alt="Bild ${nr}" data-kic="bild" data-nr="${nr}">`).join('')}</div>` : ''}${m.text ? `<div class="kic-blase">${esc(m.text)}</div>` : ''}</div>`;
            }
            if (m.laedt) return `<div class="kic-msg kic-ki"><div class="kic-blase kic-tippt"><span></span><span></span><span></span>${m.status ? `<em class="kic-status">${esc(m.status)}</em>` : ''}</div></div>`;
            return `<div class="kic-msg kic-ki"><div class="kic-blase${m.fehler ? ' kic-fehler' : ''}">${mdKlein(m.text)}${m.abfragen && m.abfragen.length ? `<div class="kic-quelle">📊 Ausgewertet: ${m.abfragen.map(a => esc(a.name.replace(/_/g, ' ')) + (a.monate ? ' (' + esc(a.monate) + ' Mon.)' : '')).join(', ')} — Zahlen aus der Datenbank, nur die Ergebnisse gingen an die KI</div>` : ''}</div>${(m.aktionen || []).map((a, ai) => karte(a, mi, ai)).join('')}</div>`;
        }).join('');
        datalistsFuellen();
        el.scrollTop = el.scrollHeight;
    }

    // Kleines Markdown für Antworten: **fett**, Listen, Überschriften, Tabellen
    function mdKlein(text) {
        const inl = t => esc(t).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        const out = []; let liste = null, tab = null;
        const flush = () => {
            if (liste) { out.push('<ul>' + liste.join('') + '</ul>'); liste = null; }
            if (tab) {
                const rows = tab.filter(r => !/^\s*\|?\s*:?-{2,}/.test(r));
                out.push('<div class="kic-tab"><table>' + rows.map((r, i) => '<tr>' + r.replace(/^\s*\||\|\s*$/g, '').split('|').map(c => (i ? '<td>' : '<th>') + inl(c.trim()) + (i ? '</td>' : '</th>')).join('') + '</tr>').join('') + '</table></div>');
                tab = null;
            }
        };
        String(text || '').split(/\r?\n/).forEach(z => {
            if (/^\s*\|.*\|\s*$/.test(z)) { if (liste) flush(); (tab = tab || []).push(z); return; }
            if (tab) flush();
            const li = /^\s*(?:[-*•]|\d+[.)])\s+(.*)$/.exec(z);
            if (li) { (liste = liste || []).push('<li>' + inl(li[1]) + '</li>'); return; }
            flush();
            const h = /^#{1,4}\s+(.*)$/.exec(z);
            if (h) out.push('<div class="kic-h">' + inl(h[1]) + '</div>');
            else if (z.trim()) out.push('<p>' + inl(z) + '</p>');
        });
        flush();
        return out.join('');
    }

    function datalistsFuellen() {
        const dm = document.getElementById('kic-dl-m');
        if (dm && !dm.childElementCount) dm.innerHTML = (window.machineList || []).map(m => `<option value="${esc(mLabel(m))}">`).join('');
        const da = document.getElementById('kic-dl-adr');
        const kunden = (window.customerCacheSync && window.customerCacheSync()) || [];
        if (da && da.childElementCount !== kunden.length) da.innerHTML = kunden.map(k => `<option value="${esc(aLabel(k))}">`).join('');
    }
    const mLabel = m => machineLabel(m) + ' #' + m.id;
    const aLabel = k => k.name + (k.city ? ' · ' + k.city : '') + (k.customer_number ? ' · ' + k.customer_number : '');
    function maschineAusFeld(v) {
        const m = /#(\d+)\s*$/.exec(String(v || ''));
        return m ? (window.machineList || []).find(x => String(x.id) === m[1]) || null : null;
    }
    function adresseAusFeld(v) {
        const s = String(v || '').trim();
        if (!s) return null;
        const kunden = (window.customerCacheSync && window.customerCacheSync()) || [];
        return kunden.find(k => aLabel(k) === s) || kunden.find(k => (k.name || '').toLowerCase() === s.toLowerCase()) || null;
    }

    const feld = (cls, label, inner) => `<label class="kic-feld ${cls || ''}"><span>${label}</span>${inner}</label>`;
    const inputMaschine = (m, a) => feld('', 'Maschine', `<input class="kic-f-m" list="kic-dl-m" value="${m ? esc(mLabel(m)) : ''}" placeholder="— keine — (tippen zum Suchen)">`)
        + (a && a.treffer ? `<div class="kic-zust">🔎 Erkannt über ${esc(a.treffer)}</div>`
            : a && a.erkannt && !m && (a.erkannt.seriennummer || a.erkannt.typ) ? `<div class="kic-zust">🔎 Gelesen: ${esc([a.erkannt.hersteller, a.erkannt.typ, a.erkannt.seriennummer && 'SN ' + a.erkannt.seriennummer].filter(Boolean).join(' · '))} — keine Maschine gefunden, bitte wählen</div>` : '');
    const zeilen = arr => esc((Array.isArray(arr) ? arr : []).filter(Boolean).join('\n'));

    function karte(a, mi, ai) {
        const id = `data-m="${mi}" data-a="${ai}"`;
        if (a.status === 'verworfen') return `<div class="kic-karte kic-verworfen" ${id}>Verworfen: ${esc(a.titel || a.art)}</div>`;
        if (a.status === 'fertig') {
            const link = (a.art === 'schaden' && a.zielId) || (a.art === 'servicebericht' && a.zielId) || a.art === 'vorgang' || a.art === 'vorgang_stand' || a.art === 'aufgabe' || a.art === 'unteraufgaben';
            return `<div class="kic-karte kic-fertig" ${id}><span>✓ ${esc(a.fertigText || 'Erledigt')}</span>${link ? '<button type="button" class="kic-link" data-kic="oeffnen">Öffnen →</button>' : ''}</div>`;
        }
        let kopf = '', body = '', knopf = '';
        if (a.art === 'vorgang') {
            kopf = '📋 Neuer Vorgang';
            body = feld('', 'Titel', `<input class="kic-f-titel" value="${esc(a.titel)}">`)
                + `<div class="kic-zwei">${feld('', 'Art', `<select class="kic-f-typ">${Object.entries(TYP).map(([k, l]) => `<option value="${k}"${k === (TYP[a.typ] ? a.typ : 'other') ? ' selected' : ''}>${l}</option>`).join('')}</select>`)}
                   ${feld('', 'Adresse', `<input class="kic-f-adr" list="kic-dl-adr" value="${a.adresse ? esc(aLabel(a.adresse)) : ''}" placeholder="— keine —">`)}</div>`
                + (a.adrTreffer ? `<div class="kic-zust">🏢 Adresse ${esc(a.adrTreffer)}</div>` : '')
                + (a.adrVorschlaege && a.adrVorschlaege.length ? `<div class="kic-adr-vorschlaege"><span>${a.adrOder ? 'Mehrere passen — oder doch:' : 'Meintest du:'}</span>${a.adrVorschlaege.map(k => `<button type="button" data-kic="adr-wahl" data-v="${esc(aLabel(k))}">${esc(k.name)}${k.city ? ' · ' + esc(k.city) : ''}</button>`).join('')}</div>` : '')
                + inputMaschine(a.maschine, a)
                + feld('', 'Beschreibung', `<textarea class="kic-f-text" rows="2">${esc(a.beschreibung)}</textarea>`)
                + feld('', 'Schritte (je Zeile einer)', `<textarea class="kic-f-liste" rows="2">${zeilen(a.schritte)}</textarea>`)
                + zustHtml(a);
            knopf = 'Vorgang anlegen';
        } else if (a.art === 'vorgang_stand') {
            kopf = '🗒️ Stand zu vorhandenem Vorgang';
            body = feld('', 'Vorgang', `<select class="kic-f-ziel">${(a.vorgang ? [a.vorgang] : []).concat(a.kand.v.filter(v => v !== a.vorgang)).map(v => `<option value="${v.id}">${esc(v.title || 'Vorgang ' + v.id)}</option>`).join('') || '<option value="">— kein offener Vorgang —</option>'}</select>`)
                + feld('', 'Neuer Stand', `<textarea class="kic-f-text" rows="2">${esc(a.text)}</textarea>`);
            knopf = 'Stand eintragen';
        } else if (a.art === 'aufgabe') {
            kopf = '✅ Neue Aufgabe';
            body = feld('', 'Titel', `<input class="kic-f-titel" value="${esc(a.titel)}">`)
                + inputMaschine(a.maschine, a)
                + feld('', 'Beschreibung', `<textarea class="kic-f-text" rows="2">${esc(a.beschreibung)}</textarea>`)
                + feld('', 'Unteraufgaben (je Zeile eine)', `<textarea class="kic-f-liste" rows="3">${zeilen(a.unteraufgaben)}</textarea>`)
                + zustHtml(a);
            knopf = 'Aufgabe anlegen';
        } else if (a.art === 'unteraufgaben') {
            kopf = '➕ Unteraufgaben zu vorhandener Aufgabe';
            body = feld('', 'Aufgabe', `<select class="kic-f-ziel">${(a.aufgabe ? [a.aufgabe] : []).concat(a.kand.t.filter(t => t !== a.aufgabe)).map(t => `<option value="${t.id}">${esc(t.title || 'Aufgabe ' + t.id)}</option>`).join('') || '<option value="">— keine offene Aufgabe —</option>'}</select>`)
                + feld('', 'Unteraufgaben (je Zeile eine)', `<textarea class="kic-f-liste" rows="3">${zeilen(a.unteraufgaben)}</textarea>`);
            knopf = 'Hinzufügen';
        } else if (a.art === 'schaden') {
            const nrs = (Array.isArray(a.bilder) ? a.bilder : []).map(Number).filter(n => alleBilder[n]);
            a.bilder = nrs;
            const sel = (cls, opts, v) => `<select class="${cls}">${opts.map(o => `<option${o === v ? ' selected' : ''}>${o}</option>`).join('')}</select>`;
            kopf = '⚠️ Schadensbericht';
            body = (nrs.length ? `<div class="kic-msg-bilder">${nrs.map(nr => `<img src="${alleBilder[nr].url}" alt="Bild ${nr}" data-kic="bild" data-nr="${nr}">`).join('')}</div>` : '')
                + inputMaschine(a.maschine, a)
                + feld('', 'Titel', `<input class="kic-f-titel" value="${esc(a.titel || 'Schaden')}">`)
                + feld('', 'Schaden', `<textarea class="kic-f-text" rows="3">${esc(a.schaden)}</textarea>`)
                + `<div class="kic-zwei">${feld('', 'Bauteil', `<input class="kic-f-bauteil" value="${esc(a.bauteil)}">`)}${feld('', 'Ursache', `<input class="kic-f-ursache" value="${esc(a.ursache)}">`)}</div>`
                + `<div class="kic-zwei">${feld('', 'Schwere', sel('kic-f-schwere', ['gering', 'mittel', 'hoch'], a.schwere || 'mittel'))}${feld('', 'Betriebsbereit', sel('kic-f-betrieb', ['ja', 'eingeschränkt', 'nein'], a.betriebsbereit || 'eingeschränkt'))}</div>`
                + feld('', 'Maßnahme', `<textarea class="kic-f-massnahme" rows="2">${esc(a.massnahme)}</textarea>`)
                + `<label class="kic-check"><input type="checkbox" class="kic-f-vorgang" checked> Reparatur-Vorgang dazu anlegen</label>`;
            knopf = 'Bericht speichern';
        } else if (a.art === 'foto') {
            const nrs = (Array.isArray(a.bilder) ? a.bilder : []).map(Number).filter(n => alleBilder[n]);
            if (!nrs.length) Object.keys(alleBilder).slice(-1).forEach(n => nrs.push(+n));
            a.bilder = nrs;
            kopf = '📷 Foto in Maschinen-Historie';
            body = `<div class="kic-msg-bilder">${nrs.map(nr => `<img src="${alleBilder[nr].url}" alt="Bild ${nr}" data-kic="bild" data-nr="${nr}">`).join('')}</div>`
                + inputMaschine(a.maschine, a)
                + feld('', 'Titel', `<input class="kic-f-titel" value="${esc(a.titel || 'Foto')}">`)
                + feld('', 'Notiz', `<textarea class="kic-f-text" rows="2">${esc(a.notiz)}</textarea>`);
            knopf = 'Foto speichern';
        } else if (a.art === 'servicebericht') {
            const nrs = (Array.isArray(a.bilder) ? a.bilder : []).map(Number).filter(n => alleBilder[n]);
            a.bilder = nrs;
            // Auswahl: gewählter Bericht, dann Berichte derselben Maschine, dann die übrigen Kandidaten
            const kand = (a.kand.s || []).filter(b => b !== a.bericht);
            const gleicheM = a.maschine ? kand.filter(b => String(b.machine_id) === String(a.maschine.id)) : [];
            const optionen = (a.bericht ? [a.bericht] : []).concat(gleicheM, kand.filter(b => !gleicheM.includes(b)));
            const bLabel = b => {
                const d = b.date || b.created_at;
                const m = (window.machineList || []).find(x => String(x.id) === String(b.machine_id));
                return [(b.title || 'Servicebericht'), d ? new Date(d).toLocaleDateString('de-DE') : '', m ? machineLabel(m) : ''].filter(Boolean).join(' · ') + (b.is_finalized ? ' 🔒' : '');
            };
            kopf = '📋 Beim Servicebericht ergänzen';
            body = (nrs.length ? `<div class="kic-msg-bilder">${nrs.map(nr => `<img src="${alleBilder[nr].url}" alt="Bild ${nr}" data-kic="bild" data-nr="${nr}">`).join('')}</div>` : '')
                + feld('', 'Servicebericht', `<select class="kic-f-ziel">${optionen.map(b => `<option value="${b.id}">${esc(bLabel(b))}</option>`).join('') || '<option value="">— kein Bericht zu dieser Maschine gefunden —</option>'}</select>`)
                + feld('', 'Ergänzung / Bemerkung (optional)', `<textarea class="kic-f-text" rows="2" placeholder="wird an die Bemerkungen angehängt">${esc(a.text)}</textarea>`)
                + '<div class="kic-zust">Bilder kommen zu den Anhängen des Berichts. Text wird an die Bemerkungen angehängt — bei abgeschlossenen Berichten (🔒) nur Bilder, das unterschriebene PDF bleibt unverändert.</div>';
            knopf = nrs.length ? 'Zum Bericht hinzufügen' : 'Ergänzung speichern';
        } else if (a.art === 'handschrift') {
            const nrs = (Array.isArray(a.bilder) ? a.bilder : []).map(Number).filter(n => alleBilder[n]);
            if (!nrs.length) Object.keys(alleBilder).slice(-1).forEach(n => nrs.push(+n));
            a.bilder = nrs;
            const unsicher = (Array.isArray(a.unsicher) ? a.unsicher : []).filter(Boolean);
            kopf = '✍️ Abschrift als Eintrag';
            body = (nrs.length ? `<div class="kic-msg-bilder">${nrs.map(nr => `<img src="${alleBilder[nr].url}" alt="Bild ${nr}" data-kic="bild" data-nr="${nr}">`).join('')}</div>` : '')
                + `<div class="kic-zwei">${feld('', 'Adresse', `<input class="kic-f-adr" list="kic-dl-adr" value="${a.adresse ? esc(aLabel(a.adresse)) : ''}" placeholder="— keine —">`)}</div>`
                + (a.adrTreffer ? `<div class="kic-zust">🏢 Adresse ${esc(a.adrTreffer)}</div>` : '')
                + (a.adrVorschlaege && a.adrVorschlaege.length ? `<div class="kic-adr-vorschlaege"><span>${a.adrOder ? 'Mehrere passen — oder doch:' : 'Meintest du:'}</span>${a.adrVorschlaege.map(k => `<button type="button" data-kic="adr-wahl" data-v="${esc(aLabel(k))}">${esc(k.name)}${k.city ? ' · ' + esc(k.city) : ''}</button>`).join('')}</div>` : '')
                + inputMaschine(a.maschine, a)
                + feld('', 'Titel', `<input class="kic-f-titel" value="${esc(a.titel || 'Handschriftliche Notiz')}">`)
                + feld('', 'Abschrift — bitte prüfen und korrigieren', `<textarea class="kic-f-text kic-f-abschrift" rows="8">${esc(a.text)}</textarea>`)
                + (unsicher.length ? `<div class="kic-unsicher">⚠️ Schwer lesbar: ${unsicher.map(esc).join(', ')} — im Text mit [?] markiert</div>` : '')
                + (nrs.length ? '<label class="kic-check"><input type="checkbox" class="kic-f-foto" checked> Foto mit ablegen</label>' : '')
                + '<div class="kic-zust">Landet in der Historie der Adresse und/oder Maschine. Mindestens eins von beiden wählen.</div>';
            knopf = 'Eintrag speichern';
        }
        return `<div class="kic-karte" ${id}><div class="kic-karte-kopf">${kopf}</div>${body}
            <div class="kic-karte-fuss"><button type="button" class="kic-btn-ghost" data-kic="verwerfen">Verwerfen</button><button type="button" class="kic-btn" data-kic="ausfuehren">${knopf}</button></div></div>`;
    }

    function zustIds(a) {
        const norm = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
        const namen = (Array.isArray(a.zustaendig) ? a.zustaendig : []).map(norm).filter(Boolean);
        return (window.userList || []).filter(u => u.name && namen.some(n => norm(u.name) === n || norm(u.name).split(' ')[0] === n || norm(u.name).includes(n))).map(u => u.id);
    }
    function zustHtml(a) {
        const ids = zustIds(a);
        if (!ids.length) return '';
        const namen = (window.userList || []).filter(u => ids.includes(u.id)).map(u => u.name);
        return `<div class="kic-zust">👤 Zuständig: ${esc(namen.join(', '))}</div>`;
    }

    function aktionVon(k) {
        if (!k) return null;
        const m = verlauf[+k.dataset.m];
        return m && m.aktionen ? m.aktionen[+k.dataset.a] : null;
    }

    // ---------------------------------------------------------------- Ausführen
    async function ausfuehren(k) {
        const a = aktionVon(k);
        if (!a || a.status) return;
        const sb = window.supabaseClient;
        if (!sb) return toast('Keine Datenbankverbindung.');
        const wert = c => (k.querySelector(c)?.value || '').trim();
        const liste = c => wert(c).split('\n').map(s => s.replace(/^[-•*\d.)\s]+/, '').trim()).filter(Boolean);
        const btn = k.querySelector('[data-kic="ausfuehren"]');
        btn.disabled = true; btn.textContent = 'Speichere …';
        try {
            if (a.art === 'vorgang') {
                const titel = wert('.kic-f-titel');
                if (!titel) throw new Error('Bitte einen Titel eingeben.');
                const adr = adresseAusFeld(wert('.kic-f-adr'));
                if (wert('.kic-f-adr') && !adr) throw new Error('Adresse nicht gefunden — bitte aus der Liste wählen oder leeren.');
                const m = maschineAusFeld(wert('.kic-f-m'));
                const jetzt = new Date().toISOString();
                const payload = {
                    title: titel, process_type: wert('.kic-f-typ') || 'other', process_date: jetzt,
                    machine_id: m ? m.id : null, status: 'offen', description: wert('.kic-f-text') || null,
                    assigned_users: zustIds(a),
                    steps: liste('.kic-f-liste').map(t => ({ id: 'st_' + Math.random().toString(36).slice(2, 9), text: t, done: false, created_at: jetzt, created_by: window.activeUser?.name || null, done_at: null, done_by: null }))
                };
                if (adr) payload.customer_id = adr.id;
                let { error, data } = await window.insertMitErsteller('internal_processes', payload);
                if (error && /customer_id/.test(error.message || '')) { delete payload.customer_id; ({ error, data } = await window.insertMitErsteller('internal_processes', payload)); }
                if (error) throw error;
                a.zielId = data && (data.id || (data[0] && data[0].id));
                a.fertigText = 'Vorgang „' + titel + '" angelegt' + (adr ? ' bei ' + adr.name : '');
            } else if (a.art === 'vorgang_stand') {
                const id = wert('.kic-f-ziel'), text = wert('.kic-f-text');
                if (!id || !text) throw new Error('Bitte Vorgang und Text angeben.');
                const { data: cur, error: e1 } = await sb.from('internal_processes').select('status_log').eq('id', id).single();
                if (e1) throw e1;
                const log = (Array.isArray(cur?.status_log) ? cur.status_log : []).concat([{ text, user: window.activeUser?.name || 'Unbekannt', user_id: window.activeUser?.id || null, at: new Date().toISOString() }]);
                const { error } = await sb.from('internal_processes').update({ status_log: log }).eq('id', id);
                if (error) throw error;
                a.zielId = id;
                a.fertigText = 'Stand eingetragen';
            } else if (a.art === 'aufgabe') {
                const titel = wert('.kic-f-titel');
                if (!titel) throw new Error('Bitte einen Titel eingeben.');
                const m = maschineAusFeld(wert('.kic-f-m'));
                const { data, error } = await sb.from('tasks').insert([{
                    title: titel, description: wert('.kic-f-text'), status: 'open', machine_id: m ? m.id : null,
                    created_by: window.activeUser?.id || null, assigned_to: zustIds(a), updated_at: new Date().toISOString()
                }]).select('id');
                if (error) throw error;
                const taskId = data && data[0] ? data[0].id : null;
                const subs = liste('.kic-f-liste');
                if (taskId && subs.length) {
                    const { error: e2 } = await sb.from('subtasks').insert(subs.map(t => ({ task_id: taskId, title: t, status: 'open', supergroup: 'Allgemein', action_type: null })));
                    if (e2) throw e2;
                }
                a.zielId = taskId;
                a.fertigText = 'Aufgabe „' + titel + '" angelegt' + (subs.length ? ' mit ' + subs.length + ' Unteraufgaben' : '');
                cache.zeit = 0;
            } else if (a.art === 'unteraufgaben') {
                const id = wert('.kic-f-ziel'), subs = liste('.kic-f-liste');
                if (!id || !subs.length) throw new Error('Bitte Aufgabe und mindestens eine Unteraufgabe angeben.');
                const { error } = await sb.from('subtasks').insert(subs.map(t => ({ task_id: id, title: t, status: 'open', supergroup: 'Allgemein', action_type: null })));
                if (error) throw error;
                a.zielId = id;
                a.fertigText = subs.length + ' Unteraufgabe' + (subs.length > 1 ? 'n' : '') + ' hinzugefügt';
            } else if (a.art === 'schaden') {
                const m = maschineAusFeld(wert('.kic-f-m'));
                if (!m) throw new Error('Bitte eine Maschine aus der Liste wählen.');
                const titel = wert('.kic-f-titel') || 'Schaden';
                const files = a.bilder.map(nr => alleBilder[nr] && alleBilder[nr].file).filter(Boolean);
                let urls = [];
                if (files.length) {
                    const ordner = window.getMachineFolderName ? window.getMachineFolderName(m.id, m.manufacturer, m.name, m.serial || m.serial_number, m.year) : 'Maschinen/' + m.id;
                    const erg = await window.FileUploadService.uploadFiles(files, (f, i) => `${ordner}/Schaden/${Date.now()}-${i}.${(f.name.split('.').pop() || 'jpg').toLowerCase()}`, { bucket: 'dateien', compress: true, concurrency: 4, provider: 'cloudflare-r2' });
                    urls = (erg || []).map(x => x.url).filter(Boolean);
                }
                const jetzt = new Date();
                const text = [
                    'SCHADENSBERICHT vom ' + jetzt.toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }) + ' — aufgenommen von ' + (window.activeUser?.name || 'unbekannt'),
                    'Maschine: ' + machineLabel(m),
                    'Schaden: ' + wert('.kic-f-text'),
                    wert('.kic-f-bauteil') && 'Bauteil: ' + wert('.kic-f-bauteil'),
                    wert('.kic-f-ursache') && 'Vermutete Ursache: ' + wert('.kic-f-ursache'),
                    'Schwere: ' + wert('.kic-f-schwere') + ' · Betriebsbereit: ' + wert('.kic-f-betrieb'),
                    wert('.kic-f-massnahme') && 'Maßnahme: ' + wert('.kic-f-massnahme'),
                    urls.length && 'Fotos: ' + urls.length
                ].filter(Boolean).join('\n');
                const { error } = await sb.from('manual_history_entries').insert([{ machine_id: m.id, type: 'note', title: '⚠️ Schadensbericht: ' + titel, content: text, files: urls, created_by: window.activeUser?.id || null }]);
                if (error) throw error;
                if (window.updateHistoryViewExternally) window.updateHistoryViewExternally(m.id);
                a.fertigText = 'Schadensbericht bei ' + machineLabel(m) + ' gespeichert';
                if (k.querySelector('.kic-f-vorgang')?.checked) {
                    const payload = {
                        title: 'Schaden: ' + titel, process_type: 'repair', process_date: jetzt.toISOString(),
                        machine_id: m.id, status: 'offen', description: text, assigned_users: [],
                        steps: wert('.kic-f-massnahme') ? [{ id: 'st_' + Math.random().toString(36).slice(2, 9), text: wert('.kic-f-massnahme'), done: false, created_at: jetzt.toISOString(), created_by: window.activeUser?.name || null, done_at: null, done_by: null }] : []
                    };
                    if (m.customer_id) payload.customer_id = m.customer_id;
                    let { error: e2, data } = await window.insertMitErsteller('internal_processes', payload);
                    if (e2 && /customer_id/.test(e2.message || '')) { delete payload.customer_id; ({ error: e2, data } = await window.insertMitErsteller('internal_processes', payload)); }
                    a.status = 'fertig';
                    if (e2) { a.fertigText += ' — Vorgang konnte nicht angelegt werden'; throw new Error('Bericht gespeichert, Vorgang aber nicht: ' + (e2.message || e2)); }
                    a.zielId = data && (data.id || (data[0] && data[0].id));
                    a.fertigText += ' + Reparatur-Vorgang angelegt';
                }
            } else if (a.art === 'foto') {
                const m = maschineAusFeld(wert('.kic-f-m'));
                if (!m) throw new Error('Bitte eine Maschine aus der Liste wählen.');
                const files = a.bilder.map(nr => alleBilder[nr] && alleBilder[nr].file).filter(Boolean);
                if (!files.length) throw new Error('Kein Bild vorhanden.');
                const ordner = window.getMachineFolderName ? window.getMachineFolderName(m.id, m.manufacturer, m.name, m.serial || m.serial_number, m.year) : 'Maschinen/' + m.id;
                const erg = await window.FileUploadService.uploadFiles(files, (f, i) => `${ordner}/Werkstatt/${Date.now()}-${i}.${(f.name.split('.').pop() || 'jpg').toLowerCase()}`, { bucket: 'dateien', compress: true, concurrency: 4, provider: 'cloudflare-r2' });
                const urls = (erg || []).map(r => r.url).filter(Boolean);
                if (!urls.length) throw new Error('Hochladen fehlgeschlagen.');
                const { error } = await sb.from('manual_history_entries').insert([{ machine_id: m.id, type: 'photo', title: wert('.kic-f-titel') || 'Foto', content: wert('.kic-f-text'), files: urls, created_by: window.activeUser?.id || null }]);
                if (error) throw error;
                if (window.updateHistoryViewExternally) window.updateHistoryViewExternally(m.id);
                a.fertigText = urls.length + ' Foto' + (urls.length > 1 ? 's' : '') + ' bei ' + machineLabel(m) + ' gespeichert';
            } else if (a.art === 'servicebericht') {
                const id = wert('.kic-f-ziel');
                if (!id) throw new Error('Bitte einen Servicebericht wählen.');
                const text = wert('.kic-f-text');
                const files = a.bilder.map(nr => alleBilder[nr] && alleBilder[nr].file).filter(Boolean);
                if (!files.length && !text) throw new Error('Keine Bilder und kein Text zum Ergänzen.');
                const { data: cur, error: e1 } = await sb.from('service_entries').select('id, machine_id, files, remarks, is_finalized').eq('id', id).single();
                if (e1) throw e1;
                if (text && cur.is_finalized && !files.length) throw new Error('Der Bericht ist abgeschlossen — Text kann nicht mehr ergänzt werden, nur Bilder.');
                let neu = [];
                if (files.length) {
                    const m = (window.machineList || []).find(x => String(x.id) === String(cur.machine_id));
                    const ordner = m && window.getMachineFolderName ? window.getMachineFolderName(m.id, m.manufacturer, m.name, m.serial || m.serial_number, m.year) : 'Maschinen/' + (cur.machine_id || 'ohne');
                    const erg = await window.FileUploadService.uploadFiles(files, (f, i) => `${ordner}/Serviceberichte/${Date.now()}-${i}-${(f.name || 'bild.jpg').replace(/[^a-zA-Z0-9.\-_]/g, '_')}`, { bucket: 'dateien', compress: true, concurrency: 4, provider: 'cloudflare-r2' });
                    neu = (erg || []).map((r, i) => r && r.url ? { name: files[i].name || 'Bild', type: files[i].type || 'image/jpeg', url: r.url } : null).filter(Boolean);
                    if (!neu.length) throw new Error('Hochladen fehlgeschlagen.');
                }
                const upd = {};
                if (neu.length) upd.files = (Array.isArray(cur.files) ? cur.files : []).concat(neu);
                const textMit = text && !cur.is_finalized;
                if (textMit) {
                    const stempel = new Date().toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) + ' · ' + (window.activeUser?.name || '');
                    upd.remarks = [cur.remarks, 'Ergänzung ' + stempel + ': ' + text].filter(Boolean).join('\n');
                }
                const { error } = await sb.from('service_entries').update(upd).eq('id', id);
                if (error) throw error;
                cache.zeit = 0;
                if (typeof window.fetchServiceEntries === 'function') { try { window.fetchServiceEntries(); } catch (e) { /* Liste lädt beim nächsten Öffnen */ } }
                a.zielId = id;
                a.fertigText = [neu.length ? neu.length + ' Bild' + (neu.length > 1 ? 'er' : '') + ' angehängt' : '', textMit ? 'Bemerkung ergänzt' : '', text && !textMit ? '(Text nicht übernommen — Bericht abgeschlossen)' : ''].filter(Boolean).join(', ');
            } else if (a.art === 'handschrift') {
                const m = wert('.kic-f-m') ? maschineAusFeld(wert('.kic-f-m')) : null;
                const kd = wert('.kic-f-adr') ? adresseAusFeld(wert('.kic-f-adr')) : null;
                if (wert('.kic-f-m') && !m) throw new Error('Maschine nicht gefunden — bitte aus der Liste wählen oder leeren.');
                if (wert('.kic-f-adr') && !kd) throw new Error('Adresse nicht gefunden — bitte aus der Liste wählen oder leeren.');
                if (!m && !kd) throw new Error('Bitte eine Adresse oder Maschine wählen.');
                const text = wert('.kic-f-abschrift');
                if (!text) throw new Error('Die Abschrift ist leer.');
                let urls = [];
                const fotoMit = k.querySelector('.kic-f-foto');
                const files = fotoMit && fotoMit.checked ? a.bilder.map(nr => alleBilder[nr] && alleBilder[nr].file).filter(Boolean) : [];
                if (files.length) {
                    const ordner = m && window.getMachineFolderName ? window.getMachineFolderName(m.id, m.manufacturer, m.name, m.serial || m.serial_number, m.year) + '/Notizen'
                        : 'Adressen/' + (kd ? kd.id : 'ohne') + '/Notizen';
                    const erg = await window.FileUploadService.uploadFiles(files, (f, i) => `${ordner}/${Date.now()}-${i}.${(f.name.split('.').pop() || 'jpg').toLowerCase()}`, { bucket: 'dateien', compress: true, concurrency: 4, provider: 'cloudflare-r2' });
                    urls = (erg || []).map(r => r.url).filter(Boolean);
                }
                const zeile = { type: 'note', title: wert('.kic-f-titel') || 'Handschriftliche Notiz', content: text, files: urls, created_by: window.activeUser?.id || null };
                if (m) zeile.machine_id = m.id;
                if (kd) zeile.customer_id = kd.id;
                const { error } = await sb.from('manual_history_entries').insert([zeile]);
                if (error) throw error;
                if (m && window.updateHistoryViewExternally) window.updateHistoryViewExternally(m.id);
                document.dispatchEvent(new CustomEvent('addressbook:changed'));
                a.fertigText = 'Abschrift gespeichert bei ' + [kd ? kd.name : '', m ? machineLabel(m) : ''].filter(Boolean).join(' und ') + (urls.length ? ' (mit Foto)' : '');
            }
            a.status = 'fertig';
            render();
        } catch (e) {
            console.error('KI-Chat Aktion:', e);
            toast(e.message || 'Speichern fehlgeschlagen.');
            if (a.status === 'fertig') return render();
            btn.disabled = false; btn.textContent = 'Nochmal versuchen';
        }
    }

    function oeffneZiel(a) {
        if (!a || !a.zielId) return;
        if (window.innerWidth <= 768) schliessen();
        if (a.art === 'aufgabe' || a.art === 'unteraufgaben') { if (window.navigateToTask) window.navigateToTask(a.zielId); }
        else if (a.art === 'servicebericht') { if (window.openEditServicebericht) window.openEditServicebericht(a.zielId); }
        else if (window.navigateToProcess) window.navigateToProcess(a.zielId);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', aufbauen);
    else aufbauen();
})();
