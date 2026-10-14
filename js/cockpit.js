// ==========================================
// STARTSEITE-COCKPIT
// ==========================================
// Legt sich oben auf die Startseite (#home): Favoritenleiste, „Jetzt zuerst“
// (überfällig/heute, nur meine), „Demnächst“ (7 Tage: Termine, Service,
// Miete, Wartung) und eine Kennzahlen-Zeile. Die bisherige Startseite
// (renderDashboard) bleibt vollständig darunter, eingeklappt unter
// „Mehr anzeigen“.
//
// RÜCKGÄNGIG:
//  - je Browser: Knopf „Klassische Startseite“ (localStorage meetra_cockpit_aus=1)
//  - ganz: die zwei Zeilen js/cockpit.js + css/components/cockpit.css aus
//    index.html und sw.js entfernen. Sonst wird nichts verändert.
(function () {
    'use strict';

    const AUS_KEY = 'meetra_cockpit_aus';
    const FAV_KEY = 'meetra_cockpit_favoriten_';
    const MEHR_KEY = 'meetra_cockpit_mehr_offen';
    const PUFFER_MS = 2 * 60 * 1000;
    const MAX_FAV = 6;

    let daten = null, geladenAm = 0, laedt = null, zeichnet = false;

    // Die bisherige Startseite (renderDashboard) lädt alle Vorgänge, Angebote und
    // Aufgaben. Solange „Mehr anzeigen“ zu ist, wird sie gar nicht erst gebaut.
    let altRender = null, altWartet = false;
    function dashboardUmhuellen() {
        const o = window.renderDashboard;
        if (typeof o !== 'function' || o._cockpit) return;
        altRender = o;
        const w = function () {
            if (!aus() && lsGet(MEHR_KEY) !== '1') {
                altWartet = true;
                aktualisieren(false);
                return Promise.resolve();
            }
            altWartet = false;
            return o.apply(this, arguments);
        };
        w._cockpit = true;
        window.renderDashboard = w;
    }
    dashboardUmhuellen();

    const sb = () => window.supabaseClient;
    const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const isoTag = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const tagVon = v => v ? String(v).slice(0, 10) : '';
    function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function lsSet(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* gesperrt */ } }
    function ich() { const u = window.activeUser || {}; return { id: String(u.id || ''), name: String(u.name || '').toLowerCase() }; }
    function istMeins(v) { const me = ich(); return v != null && v !== '' && (String(v) === me.id || String(v).toLowerCase() === me.name); }
    function aus() { return lsGet(AUS_KEY) === '1'; }
    function maschine(id) { const n = id && window.getMachineName ? String(window.getMachineName(id) || '').trim() : ''; return /^[-–—?]*$/.test(n) ? '' : n; }
    const sauber = arr => arr.map(v => String(v == null ? '' : v).trim()).filter(v => v && !/^[-–—?]+$/.test(v));
    function uhrzeit(v) {
        if (!/T\d\d:\d\d/.test(String(v || '')) || /T00:00/.test(String(v))) return '';
        const d = new Date(v); return isNaN(d) ? '' : d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    }
    function tageText(tag, heute) {
        if (tag === heute) return { t: 'heute', k: 'gelb' };
        const n = Math.round((new Date(heute) - new Date(tag)) / 864e5);
        return { t: n === 1 ? 'seit gestern' : n + ' Tage über', k: 'rot' };
    }
    const angebotOffen = a => !/verloren|abgelehnt|absage|abgesagt|storniert|kein interesse|gewonnen|auftrag|bestellt|verkauft|angenommen|zusage/i.test(a.status || '');

    // ---------------------------------------------------------- Daten
    async function laden() {
        const c = sb();
        if (!c || !window.activeUser) return null;
        const jetzt = new Date();
        const heute = isoTag(jetzt);
        const bis7 = isoTag(new Date(Date.now() + 7 * 864e5));
        const q = p => p.then(r => (r.error ? [] : r.data || [])).catch(() => []);
        // Schmal und serverseitig gefiltert (Egress-Regel). Vorgänge mit select('*'),
        // weil openEditProcessModal den vollständigen Datensatz braucht.
        const anzahl = p => p.then(r => (r.error ? 0 : r.count || 0)).catch(() => 0);
        const [berichteOffen, aufgabenOffen, fotosNeu] = await Promise.all([
            anzahl(c.from('service_entries').select('id', { count: 'exact', head: true }).eq('is_finalized', false)),
            q(c.from('tasks').select('id, assigned_to, status').neq('status', 'completed').limit(1000)),
            anzahl(c.from('foto_eingang').select('id', { count: 'exact', head: true }).is('zugeordnet_am', null))
        ]);
        const meineAufgaben = aufgabenOffen.filter(t => (Array.isArray(t.assigned_to) ? t.assigned_to : [t.assigned_to]).some(istMeins)).length;
        const wartungUeber = (window.machineList || []).filter(m => m.next_maintenance && tagVon(m.next_maintenance) < heute).length;
        const [faelligeV, mitSchritten, termine, einsaetze, mieten, angebote, wartung] = await Promise.all([
            q(c.from('internal_processes').select('*').neq('status', 'erledigt').not('remind_at', 'is', null).lte('remind_at', heute + 'T23:59:59').limit(150)),
            q(c.from('internal_processes').select('*').neq('status', 'erledigt').contains('steps', JSON.stringify([{ done: false }])).limit(200)),
            q(c.from('maintenance_events').select('id, title, event_date, start_date, customer_id, machine_id, manual_machine, maintenance_types, location').or(`and(event_date.gte.${heute},event_date.lte.${bis7}T23:59:59),and(start_date.gte.${heute},start_date.lte.${bis7}T23:59:59)`).limit(80)),
            q(c.from('service_entries').select('id, title, date, datum_von, machine_id').or(`and(date.gte.${heute},date.lte.${bis7}),and(datum_von.gte.${heute},datum_von.lte.${bis7})`).limit(60)),
            q(c.from('rental_agreements').select('id, title, machine_id, data').order('created_at', { ascending: false }).limit(150)),
            q(c.from('angebote').select('id, belegnummer, status, nettobetrag, erinnerung, erinnerung_by, kundenmatchcode, customers(name)').limit(1000)),
            q(c.from('machines').select('id, next_maintenance, company, location').gte('next_maintenance', heute).lte('next_maintenance', bis7).limit(60))
        ]);

        const procs = new Map();
        const jetztListe = [];
        faelligeV.forEach(p => {
            if (!(window.procZustaendige ? window.procZustaendige(p) : (p.assigned_users || [])).some(istMeins)) return;
            procs.set(String(p.id), p);
            jetztListe.push({ tag: tagVon(p.remind_at), titel: p.title || 'Vorgang', sub: 'Wiedervorlage', typ: 'process', id: p.id });
        });
        mitSchritten.forEach(p => (p.steps || []).forEach(st => {
            if (st.done) return;
            const tag = tagVon(st.remind_at || p.remind_at);
            if (!tag || tag > heute) return;
            const persoenlich = (st.assigned_id != null && st.assigned_id !== '') || !!st.assigned_to;
            const meins = persoenlich ? (istMeins(st.assigned_id) || istMeins(st.assigned_to)) : (p.assigned_users || []).some(istMeins);
            if (!meins) return;
            procs.set(String(p.id), p);
            jetztListe.push({ tag, titel: st.text || 'Schritt', sub: 'Schritt · ' + (p.title || 'Vorgang'), typ: 'process', id: p.id });
        }));
        angebote.forEach(a => {
            if (!a.erinnerung || tagVon(a.erinnerung) > heute || !istMeins(a.erinnerung_by) || !angebotOffen(a)) return;
            const betrag = parseFloat(String(a.nettobetrag || '').replace(',', '.'));
            jetztListe.push({ tag: tagVon(a.erinnerung), titel: 'Angebot ' + (a.belegnummer || '') + ' nachfassen',
                sub: sauber([(a.customers && a.customers.name) || a.kundenmatchcode, betrag ? Math.round(betrag).toLocaleString('de-DE') + ' €' : '']).join(' · '),
                typ: 'angebot', id: a.id });
        });
        // Je Ziel nur der dringendste Eintrag, älteste zuerst.
        const je = new Map();
        jetztListe.forEach(x => { const k = x.typ + '|' + x.id + '|' + x.titel; const alt = je.get(k); if (!alt || x.tag < alt.tag) je.set(k, x); });
        const jetztFertig = [...je.values()].sort((a, b) => a.tag.localeCompare(b.tag)).slice(0, 12);

        const bald = [];
        termine.forEach(e => {
            const wann = e.event_date || e.start_date;
            const wartungTyp = !!(e.machine_id || e.manual_machine || e.maintenance_types);
            bald.push({ wann, titel: e.title || (wartungTyp ? 'Wartung' : 'Termin'),
                sub: sauber([maschine(e.machine_id) || e.manual_machine, e.location, uhrzeit(wann)]).join(' · '),
                art: wartungTyp ? 'Wartung' : 'Termin', k: wartungTyp ? 'gelb' : 'blau', typ: 'event', id: e.id });
        });
        einsaetze.forEach(s => bald.push({ wann: s.datum_von || s.date, titel: s.title || 'Serviceeinsatz', sub: maschine(s.machine_id), art: 'Service', k: 'blau', typ: 'service', id: s.id }));
        let inMiete = 0;
        mieten.forEach(r => {
            const mi = (r.data && r.data.miete) || {}; const mieter = (r.data && r.data.mieter) || {};
            const b = tagVon(mi.beginn), e = tagVon(mi.ende);
            if (b && b <= heute && (!e || e >= heute)) inMiete++;
            const was = sauber([maschine(r.machine_id), mieter.name || (r.title ? String(r.title).replace(/^Mietvereinbarung\s*[—–-]\s*/, '') : '')]).join(' · ');
            if (b && b >= heute && b <= bis7) bald.push({ wann: mi.beginn, titel: 'Übergabe Mietmaschine', sub: was, art: 'Miete', k: 'gruen', typ: 'machine', id: r.machine_id });
            if (e && e >= heute && e <= bis7) bald.push({ wann: mi.ende, titel: 'Rücknahme Mietmaschine', sub: was, art: 'Miete', k: 'gruen', typ: 'machine', id: r.machine_id });
        });
        wartung.forEach(m => bald.push({ wann: m.next_maintenance, titel: 'Wartung fällig', sub: sauber([maschine(m.id), m.company, m.location]).join(' · '), art: 'Wartung', k: 'gelb', typ: 'machine', id: m.id }));
        bald.sort((a, b) => String(a.wann).localeCompare(String(b.wann)));

        const offen = angebote.filter(angebotOffen);
        const summe = offen.reduce((s, a) => { const n = parseFloat(String(a.nettobetrag || '').replace(',', '.')); return s + (isNaN(n) ? 0 : n); }, 0);
        const werkstatt = (window.machineList || []).filter(m => m.is_in_workshop === true).length;

        return { heute, jetzt: jetztFertig, bald: bald.slice(0, 14), procs, kpi: { inMiete, angebote: offen.length, summe, werkstatt, berichteOffen, meineAufgaben, fotosNeu, wartungUeber } };
    }

    function holen(erzwingen) {
        if (!erzwingen && daten && Date.now() - geladenAm < PUFFER_MS) return Promise.resolve(daten);
        if (laedt) return laedt;
        laedt = laden().then(d => { if (d) { daten = d; geladenAm = Date.now(); } return daten; })
            .catch(e => { console.error('Cockpit laden:', e); return daten; })
            .finally(() => { laedt = null; });
        return laedt;
    }

    // ---------------------------------------------------------- Favoriten
    function alleAnsichten() {
        return Array.from(document.querySelectorAll('#sidebar .nav-link[data-target], .sidebar .nav-link[data-target]'))
            .filter((a, i, arr) => arr.findIndex(b => b.dataset.target === a.dataset.target) === i)
            .filter(a => a.dataset.target !== 'home' && !a.classList.contains('hidden') && a.style.display !== 'none'
                && !(a.parentElement && (a.parentElement.classList.contains('hidden') || a.parentElement.style.display === 'none')))
            .map(a => ({ id: a.dataset.target, label: (a.textContent || '').replace(/\s+/g, ' ').trim().replace(/\s*\d+$/, ''), icon: a.querySelector('svg') ? a.querySelector('svg').outerHTML : '' }));
    }
    function favoriten() {
        const alle = alleAnsichten();
        const ids = new Set(alle.map(a => a.id));
        let liste = null;
        try { liste = JSON.parse(lsGet(FAV_KEY + ich().id) || 'null'); } catch (e) { liste = null; }
        if (!Array.isArray(liste)) {
            const sz = window.activeUser && window.activeUser.permissions && window.activeUser.permissions.schnellzugriff;
            liste = Array.isArray(sz) && sz.length ? sz.filter(x => x !== 'mehr' && x !== 'home') : ['processes', 'tasks', 'addressbook', 'mail', 'machines'];
        }
        return liste.filter(id => ids.has(id)).slice(0, MAX_FAV).map(id => alle.find(a => a.id === id));
    }
    function favSpeichern(ids) { lsSet(FAV_KEY + ich().id, JSON.stringify(ids.slice(0, MAX_FAV))); }

    function favMenue(knopf) {
        const alt = document.getElementById('ck-fav-menue');
        if (alt) { alt.remove(); return; }
        const gewaehlt = new Set(favoriten().map(f => f.id));
        const m = document.createElement('div');
        m.id = 'ck-fav-menue';
        m.className = 'menu-panel ck-fav-menue';
        m.innerHTML = '<div class="ck-fav-menue-kopf">Favoriten wählen (max. ' + MAX_FAV + ')</div><ul class="menu-list">'
            + alleAnsichten().map(a => '<li data-ck-fav="' + esc(a.id) + '" class="' + (gewaehlt.has(a.id) ? 'selected' : '') + '">'
                + '<span class="ck-fav-haken">' + (gewaehlt.has(a.id) ? '✓' : '') + '</span>' + esc(a.label) + '</li>').join('') + '</ul>';
        document.body.appendChild(m);
        const r = knopf.getBoundingClientRect();
        m.style.top = Math.min(r.bottom + 6, window.innerHeight - 20) + 'px';
        m.style.left = Math.max(8, Math.min(r.left, window.innerWidth - m.offsetWidth - 8)) + 'px';
        m.addEventListener('click', e => {
            const li = e.target.closest('[data-ck-fav]');
            if (!li) return;
            const id = li.dataset.ckFav;
            const ids = favoriten().map(f => f.id);
            const i = ids.indexOf(id);
            if (i >= 0) ids.splice(i, 1);
            else if (ids.length >= MAX_FAV) { if (window.showToast) window.showToast('Höchstens ' + MAX_FAV + ' Favoriten.'); return; }
            else ids.push(id);
            favSpeichern(ids);
            m.remove();
            zeichnen();
        });
        setTimeout(() => document.addEventListener('click', function weg(e) {
            if (!m.contains(e.target)) { m.remove(); document.removeEventListener('click', weg); }
        }), 0);
    }

    // ---------------------------------------------------------- Zeichnen
    function zeile(x, links) {
        return '<button type="button" class="ck-zeile" data-ck-typ="' + esc(x.typ) + '" data-ck-id="' + esc(x.id) + '">'
            + links
            + '<span class="ck-text"><b>' + esc(x.titel) + '</b>' + (x.sub ? '<span>' + esc(x.sub) + '</span>' : '') + '</span>'
            + (x.art ? '<span class="ck-pill ck-' + x.k + '">' + esc(x.art) + '</span>' : '')
            + '<span class="ck-pfeil" aria-hidden="true">›</span></button>';
    }

    function cockpitHtml(d) {
        const name = (window.activeUser && window.activeUser.name ? String(window.activeUser.name).split(' ')[0] : '');
        const std = new Date().getHours();
        const gruss = std < 11 ? 'Guten Morgen' : std < 18 ? 'Hallo' : 'Guten Abend';
        const datum = new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
        const jetzt = d ? d.jetzt : null;
        const bald = d ? d.bald : null;

        const favs = favoriten();
        const favHtml = '<div class="ck-fav"><span class="ck-fav-titel">★ Favoriten</span>'
            + favs.map(f => '<button type="button" class="ck-fav-knopf" data-ck-nav="' + esc(f.id) + '">' + f.icon + '<span>' + esc(f.label) + '</span>'
                + (f.id === 'processes' && jetzt && jetzt.length ? '<span class="ck-zahl">' + jetzt.length + '</span>' : '') + '</button>').join('')
            + '<button type="button" class="ck-fav-knopf ck-fav-plus" data-ck-favwahl title="Favoriten anpassen">＋</button>'
            + '<span class="ck-fav-luecke"></span>'
            + '<button type="button" class="ck-fav-knopf ck-fav-suche" data-ck-suche title="Suche über alles (Strg+K)">⌕ <span>Suchen</span> <kbd>Strg+K</kbd></button></div>';

        const zahl = jetzt ? jetzt.length : null;
        const kopf = '<div class="ck-kopf"><div><div class="ck-gruss">' + esc(gruss + (name ? ', ' + name : '')) + '</div>'
            + '<div class="ck-unter">' + esc(datum) + (zahl == null ? ' · wird geladen …' : zahl ? ' · ' + zahl + (zahl === 1 ? ' Sache braucht' : ' Dinge brauchen') + ' dich' : ' · nichts Dringendes') + '</div></div>'
            + '<button type="button" class="ck-klassisch" data-ck-aus title="Zur bisherigen Startseite zurück">Klassische Startseite</button></div>';

        let bloecke = '';
        if (!d) {
            bloecke = '<div class="ck-karte ck-leer">Wird geladen …</div>';
        } else {
            if (jetzt.length) {
                bloecke += '<div class="ck-karte"><div class="ck-titel"><span class="ck-punkt ck-rot"></span>Jetzt zuerst</div>'
                    + jetzt.map(x => { const t = tageText(x.tag, d.heute); return zeile(x, '<span class="ck-pill ck-' + t.k + '">' + esc(t.t) + '</span>'); }).join('') + '</div>';
            }
            if (bald.length) {
                bloecke += '<div class="ck-karte"><div class="ck-titel"><span class="ck-punkt ck-blau"></span>Demnächst · 7 Tage</div>'
                    + bald.map(x => {
                        const dt = new Date(x.wann);
                        const tag = isNaN(dt) ? '' : '<span class="ck-datum"><b>' + dt.getDate() + '</b>' + esc(dt.toLocaleDateString('de-DE', { weekday: 'short' })) + '</span>';
                        return zeile(x, tag);
                    }).join('') + '</div>';
            }
            if (!jetzt.length && !bald.length) bloecke = '<div class="ck-karte ck-leer"><b>✓ Alles erledigt</b><span>Nichts überfällig, keine Termine in den nächsten 7 Tagen.</span></div>';
        }

        const k = d && d.kpi;
        const kpi = k ? '<div class="ck-kpis">'
            + (k.inMiete ? '<button type="button" class="ck-fav-knopf" data-ck-vermiet>🚚 ' + k.inMiete + ' in Vermietung</button>' : '')
            + (k.angebote ? '<button type="button" class="ck-fav-knopf" data-ck-nav="listen">📄 ' + k.angebote + ' offene Angebote · ' + Math.round(k.summe).toLocaleString('de-DE') + ' €</button>' : '')
            + (k.werkstatt ? '<button type="button" class="ck-fav-knopf" data-ck-werkstatt>🔧 ' + k.werkstatt + ' in der Werkstatt</button>' : '')
            + (k.meineAufgaben ? '<button type="button" class="ck-fav-knopf" data-ck-ziel="aufgaben">✅ ' + k.meineAufgaben + ' meine Aufgaben</button>' : '')
            + (k.wartungUeber ? '<button type="button" class="ck-fav-knopf ck-kpi-warn" data-ck-ziel="wartung">⏰ ' + k.wartungUeber + ' Wartungen überfällig</button>' : '')
            + (k.berichteOffen ? '<button type="button" class="ck-fav-knopf" data-ck-ziel="berichte">📝 ' + k.berichteOffen + ' Berichte nicht abgeschlossen</button>' : '')
            + (k.fotosNeu ? '<button type="button" class="ck-fav-knopf" data-ck-ziel="fotos">📷 ' + k.fotosNeu + ' Fotos zuordnen</button>' : '')
            + '</div>' : '';

        return favHtml + kopf + '<div class="ck-raster">' + bloecke + '</div>' + kpi;
    }

    function zeichnen() {
        const home = document.getElementById('home');
        if (!home || zeichnet) return;
        zeichnet = true;
        try {
            let wurzel = home.querySelector(':scope > .ck-wurzel');
            if (aus()) {
                // Rückgängig: alte Startseite wieder auspacken.
                if (wurzel) wurzel.remove();
                const mehr = home.querySelector(':scope > .ck-mehr');
                if (mehr) { const inh = mehr.querySelector('.ck-mehr-inhalt'); while (inh && inh.firstChild) home.appendChild(inh.firstChild); mehr.remove(); }
                if (!home.querySelector(':scope > .ck-einschalten')) {
                    const b = document.createElement('button');
                    b.type = 'button'; b.className = 'ck-einschalten'; b.dataset.ckAn = '1';
                    b.textContent = '✨ Neue Startseite (Cockpit) einschalten';
                    home.insertBefore(b, home.firstChild);
                }
                return;
            }
            const ein = home.querySelector(':scope > .ck-einschalten');
            if (ein) ein.remove();
            // Alles, was renderDashboard gezeichnet hat, in „Mehr anzeigen“ packen.
            let mehr = home.querySelector(':scope > .ck-mehr');
            const lose = Array.from(home.childNodes).filter(n => n !== wurzel && n !== mehr && !(n.nodeType === 3 && !n.textContent.trim()));
            if (lose.length) {
                if (!mehr) {
                    mehr = document.createElement('details');
                    mehr.className = 'ck-mehr';
                    mehr.innerHTML = '<summary>Mehr anzeigen — bisherige Startseite</summary><div class="ck-mehr-inhalt"></div>';
                    if (lsGet(MEHR_KEY) === '1') mehr.open = true;
                    mehr.addEventListener('toggle', () => {
                        lsSet(MEHR_KEY, mehr.open ? '1' : null);
                        // Erst jetzt die bisherige Startseite wirklich laden.
                        if (mehr.open && altWartet && altRender) { altWartet = false; altRender(); }
                    });
                    home.appendChild(mehr);
                }
                const inh = mehr.querySelector('.ck-mehr-inhalt');
                inh.innerHTML = '';
                lose.forEach(n => inh.appendChild(n));
            }
            if (!wurzel) {
                wurzel = document.createElement('div');
                wurzel.className = 'ck-wurzel';
                home.insertBefore(wurzel, home.firstChild);
            }
            wurzel.innerHTML = cockpitHtml(daten);
        } finally {
            zeichnet = false;
        }
    }

    function aktualisieren(erzwingen) {
        if (aus()) { zeichnen(); return; }
        zeichnen();
        holen(erzwingen).then(() => zeichnen());
    }

    // ---------------------------------------------------------- Klicks
    function oeffnen(typ, id) {
        if (typ === 'process') {
            const p = daten && daten.procs.get(String(id));
            if (p && window.eventsState) {
                if (!Array.isArray(window.eventsState.processes)) window.eventsState.processes = [];
                const i = window.eventsState.processes.findIndex(x => String(x.id) === String(id));
                if (i === -1) window.eventsState.processes.push(p);
            }
            if (window.openEditProcessModal) return window.openEditProcessModal(id);
        }
        if (typ === 'event' && window.editManualEvent) return window.editManualEvent(id);
        if (typ === 'angebot' && window.navigateToAngebot) return window.navigateToAngebot(id);
        if (typ === 'machine' && window.openMachineDetails) return window.openMachineDetails(id);
        if (typ === 'service' && window.openEditServicebericht) return window.openEditServicebericht(id);
        if (window.showToast) window.showToast('Kann diesen Eintrag hier nicht öffnen.');
    }
    function zielSprung(z) {
        if (z === 'aufgaben') { navigieren('tasks'); setTimeout(() => window.filterTasksByUser && window.filterTasksByUser('me'), 80); return; }
        if (z === 'wartung') {
            if (window.eventsState) window.eventsState.statusFilter = 'overdue';
            if (window.switchView) window.switchView('calendar');
            if (window.switchEventsSubView) window.switchEventsSubView('calendar');
            return;
        }
        if (z === 'berichte') return navigieren('service');
        if (z === 'fotos') return navigieren('foto-eingang');
    }
    function navigieren(ziel) {
        const a = document.querySelector('.nav-link[data-target="' + CSS.escape(ziel) + '"]');
        if (a) a.click(); else if (window.switchView) window.switchView(ziel);
    }

    document.addEventListener('click', function (e) {
        const t = e.target.closest && e.target.closest('[data-ck-typ], [data-ck-nav], [data-ck-favwahl], [data-ck-vermiet], [data-ck-werkstatt], [data-ck-ziel], [data-ck-suche], [data-ck-aus], [data-ck-an]');
        if (!t || !t.closest('#home')) return;
        if (t.dataset.ckTyp) return oeffnen(t.dataset.ckTyp, t.dataset.ckId);
        if (t.dataset.ckNav) return navigieren(t.dataset.ckNav);
        if (t.dataset.ckZiel) return zielSprung(t.dataset.ckZiel);
        if (t.hasAttribute("data-ck-werkstatt")) return window.showWorkshopMachinesAndSwitch ? window.showWorkshopMachinesAndSwitch() : navigieren("machines");
        if (t.hasAttribute("data-ck-vermiet")) return window.timelineVermietung ? window.timelineVermietung() : navigieren("timeline");
        if (t.hasAttribute('data-ck-favwahl')) { e.stopPropagation(); return favMenue(t); }
        if (t.hasAttribute('data-ck-suche')) {
            if (window.openGlobaleSuche) return window.openGlobaleSuche();
            return document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
        }
        if (t.hasAttribute('data-ck-aus')) {
            lsSet(AUS_KEY, '1');
            zeichnen();
            if (altWartet && altRender) { altWartet = false; altRender(); }
            return;
        }
        if (t.hasAttribute('data-ck-an')) { lsSet(AUS_KEY, null); return aktualisieren(true); }
    });

    // ---------------------------------------------------------- Start
    document.addEventListener('DOMContentLoaded', function () {
        dashboardUmhuellen();
        const home = document.getElementById('home');
        if (!home) return;
        // renderDashboard ersetzt den Inhalt von #home → danach neu einhängen.
        new MutationObserver(() => {
            if (zeichnet) return;
            const fremd = Array.from(home.childNodes).some(n => !(n.classList && (n.classList.contains('ck-wurzel') || n.classList.contains('ck-mehr') || n.classList.contains('ck-einschalten'))) && !(n.nodeType === 3 && !n.textContent.trim()));
            if (fremd && window.activeUser) aktualisieren(false);
        }).observe(home, { childList: true });
        // Zurück auf die Startseite / Tab wieder sichtbar → frisch, höchstens alle 2 min.
        new MutationObserver(() => { if (!home.classList.contains('hidden') && window.activeUser) aktualisieren(false); })
            .observe(home, { attributes: true, attributeFilter: ['class'] });
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && !home.classList.contains('hidden') && window.activeUser) aktualisieren(false);
        });
    });

    window.cockpitAktualisieren = () => aktualisieren(true);
})();
