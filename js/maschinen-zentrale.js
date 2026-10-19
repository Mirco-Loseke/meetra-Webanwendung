// ==========================================================
// MASCHINEN-ZENTRALE (2026-10-17) — die einzige Maschinen-Detailansicht
// ==========================================================
// Klick auf eine Maschinenkarte öffnet EIN Fenster mit allem zur Maschine:
// Kopf (Kategorie, Name, Betreiber, Standort, Wartung), Aktionen („Neu …",
// Servicebericht, ✨, Bearbeiten), Reiter und eine Übersicht mit „Offen",
// „Zuletzt", Fotos mit Ablage-Feld und den Stammdaten.
// Die Reiter und Aktionen öffnen die VORHANDENEN Fenster (Historie,
// Berichte & Protokolle, Mietvereinbarung …) — hier wird nichts dupliziert
// und keine Daten verändert. Entwurf: tools/maschinen-zentrale-vorschau.html
//
// ==========================================================
(function () {
    'use strict';
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const sb = () => window.supabaseClient;
    const toast = (m, t) => (typeof window.showToast === 'function' ? window.showToast(m, t) : console.log(m));
    const datum = v => { if (!v) return ''; const d = new Date(v); return isNaN(d) ? '' : d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }); };
    const kurz = v => { if (!v) return ''; const d = new Date(v); return isNaN(d) ? '' : d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }); };
    const ICON = {
        plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
        x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
        edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
        ki: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4Z"/></svg>',
        ab: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="m6 9 6 6 6-6"/></svg>',
        pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>',
        haus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6"/></svg>',
        wartung: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4Z"/></svg>',
        kamera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>'
    };
    const ART_SYMBOL = { note: '📝', phone: '📞', email: '✉️', photo: '📷', hours: '⏱️', wartung: '🛠️', angebot: '💶', auslieferung: '🚚', whatsapp: '💬', miete: '🔑', service: '📄', workshop: '🔧' };
    const ART_NAME = { note: 'Notiz', phone: 'Anruf', email: 'E-Mail', photo: 'Fotos / Videos', hours: 'Betriebsstunden', wartung: 'Wartung', angebot: 'Angebot', auslieferung: 'Auslieferung', whatsapp: 'WhatsApp', miete: 'Miete' };

    let klassisch = null;          // ursprüngliches openMachineDetails
    let aktuell = null;            // { id, m, daten }

    // ------------------------------------------------------ Daten
    // Mietfotos: Spalte photos = [{url, phase, position}], ältere Stände data.fotos = {phase: {position: url}}
    function mietFotos(v) {
        const aus = { uebergabe: [], ruecknahme: [] };
        (Array.isArray(v.photos) ? v.photos : []).forEach(f => { if (f && f.url && aus[f.phase]) aus[f.phase].push(f.url); });
        if (!aus.uebergabe.length && !aus.ruecknahme.length) {
            const mf = (v.data && v.data.fotos) || {};
            Object.keys(aus).forEach(k => aus[k] = Object.values(mf[k] || {}).filter(u => typeof u === 'string' && u));
        }
        return aus;
    }

    // Zahl aus Eingabe lesen: „1450.6“ / „1450,6“ = Dezimal; „1.450“, „1.450,6“, „1 450“ = Tausender
    function zahlLesen(v) {
        let t = String(v == null ? '' : v).trim().replace(/[\s\u00a0]/g, '');
        if (!t) return null;
        if (t.includes(',') && t.includes('.')) t = t.replace(/\./g, '').replace(',', '.');
        else if (t.includes(',')) t = t.replace(',', '.');
        else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
        const n = parseFloat(t);
        return isNaN(n) ? null : n;
    }
    async function laden(id) {
        if (window.zaehler) { try { await window.zaehler.laden(); } catch (e) { /* Standard */ } }
        const c = sb();
        const q = p => p.then(r => (r.error ? [] : r.data || [])).catch(() => []);
        const [berichte, verlauf, vorgaenge, mieten] = await Promise.all([
            q(c.from('service_entries').select('id, title, date, datum_von, created_at, description, pdf_url, technicians, operating_hours, is_finalized, category_ids, files, zaehler:checklist_payload->zaehler').eq('machine_id', id).order('date', { ascending: false }).limit(100)),
            q(c.from('manual_history_entries').select('*').eq('machine_id', id).order('created_at', { ascending: false }).limit(300)),
            q(c.from('internal_processes').select('id, title, status, remind_at').eq('machine_id', id).neq('status', 'erledigt').limit(30)),
            q(c.from('rental_agreements').select('*').eq('machine_id', id).order('created_at', { ascending: false }).limit(50))
        ]);
        // Miete: nach Mietbeginn sortieren (neueste Vermietung oben), nicht nach Speicherdatum
        const mietTag = v => { const mi = (v.data && v.data.miete) || {}; return String(mi.beginn || mi.abholdatum || v.created_at || ''); };
        mieten.sort((x, y) => mietTag(y).localeCompare(mietTag(x)));
        const fotos = [], fotoGruppen = [];
        const RE_VID = /\.(mp4|mov|webm|m4v|avi)(\?|$)/i;
        const urlVon = f => typeof f === 'string' ? f : (f && (f.url || f.thumb));
        let videoAnz = 0;
        verlauf.forEach(v => {
            const alle = (Array.isArray(v.files) ? v.files : []).filter(f => !(v.type === 'wartung' && f && typeof f === 'object' && f.original)).map(urlVon).filter(Boolean);
            const bildTyp = v.type === 'photo' || v.type === 'wartung';
            const urls = bildTyp ? alle.filter(u => !RE_VID.test(u) && !/\.(pdf|docx?|xlsx?|msg|zip)(\?|$)/i.test(u)) : [];   // nur Bilder ins Raster
            const videos = alle.filter(u => RE_VID.test(u));                       // Videos aus jedem Eintrag
            if (!urls.length && !videos.length) return;
            videoAnz += videos.length;
            fotoGruppen.push({ id: v.id, titel: v.title || (v.type === 'photo' ? 'Fotos / Videos' : 'Eintrag'), wann: v.created_at, start: fotos.length, urls, videos });
            fotos.push(...urls);
        });
        // Fotos, die hinter einem Servicebericht hängen: je Bericht eine Gruppe
        berichte.forEach(b => {
            const bf = (Array.isArray(b.files) ? b.files : []).filter(f => !(f && f.original)).map(urlVon).filter(Boolean);
            const urls = bf.filter(u => /\.(jpe?g|png|gif|webp|heic|bmp)(\?|$)/i.test(u));
            const videos = bf.filter(u => RE_VID.test(u));
            if (!urls.length && !videos.length) return;
            videoAnz += videos.length;
            fotoGruppen.push({ id: 'b' + b.id, titel: b.title || 'Servicebericht', wann: b.date || b.datum_von || b.created_at, start: fotos.length, urls, videos });
            fotos.push(...urls);
        });
        // Mietvereinbarungen: eine große Gruppe je Vermietung, getrennt in Übergabe und Rücknahme
        mieten.forEach(v => {
            const mf = mietFotos(v);
            const teile = [['uebergabe', 'Übergabe'], ['ruecknahme', 'Rücknahme']].map(([k, label]) => {
                const urls = mf[k];
                return urls.length ? { label, urls, start: 0 } : null;
            }).filter(Boolean);
            if (!teile.length) return;
            const mi = (v.data && v.data.miete) || {};
            const kd = (v.data && v.data.kunde) || {};
            const zeit = [mi.beginn ? datum(mi.beginn) : '', mi.ende ? datum(mi.ende) : ''].filter(Boolean).join(' – ');
            const kunde = (v.data && v.data.mieter && v.data.mieter.name) || kd.name || kd.firma || v.customer_name || '';
            const urls = [];
            teile.forEach(t => { t.start = fotos.length + urls.length; urls.push(...t.urls); });
            fotoGruppen.push({ id: 'm' + v.id, miete: true, titel: 'Miete', zeit, kunde, wann: mi.beginn || v.created_at, start: fotos.length, urls, teile });
            fotos.push(...urls);
        });
        fotoGruppen.sort((x, y) => String(y.wann).localeCompare(String(x.wann)));
        // Betriebsstunden: jüngster Wert aus Stunden-Einträgen und Serviceberichten
        const zahl = zahlLesen;
        const kand = [];
        const kand2 = [];
        verlauf.filter(v => v.type === 'hours').forEach(v => {
            const n = zahl(v.content); if (n != null) kand.push({ wert: n, wann: v.created_at, quelle: 'Stunden-Eintrag', label: v.title });
            const n2 = zahl(v.recipient); if (n2 != null) kand2.push({ wert: n2, wann: v.created_at, quelle: 'Stunden-Eintrag', label: v.sender || 'Zähler 2' });
        });
        berichte.forEach(b2 => {
            const zz = Array.isArray(b2.zaehler) ? b2.zaehler : [];
            const wann = b2.date || b2.datum_von || b2.created_at;
            const n = zahl(b2.operating_hours); if (n != null) kand.push({ wert: n, wann, quelle: 'Servicebericht', label: zz[0] && zz[0].name });
            const n2 = zz[1] ? zahl(zz[1].wert) : null; if (n2 != null) kand2.push({ wert: n2, wann, quelle: 'Servicebericht', label: zz[1].name });
        });
        kand.sort((x, y) => String(y.wann).localeCompare(String(x.wann)));
        kand2.sort((x, y) => String(y.wann).localeCompare(String(x.wann)));
        return { berichte, verlauf, vorgaenge, mieten, fotos, videoAnz, fotoGruppen, protokolle: null, stunden: kand[0] || null, stunden2: kand2[0] || null };
    }

    // ------------------------------------------------------ Aufbau
    function bhHtml(m) {
        const d = aktuell && aktuell.daten;
        const st = d && d.stunden ? d.stunden : (m.hours ? { wert: m.hours, wann: null, quelle: 'Stammdaten' } : null);
        if (!d && !st) return '';
        if (!st) return '<button type="button" class="mz-bh mz-bh-leer" data-mz="neu-hours">⏱️ Betriebsstunden eintragen</button>';
        const st2 = d && d.stunden2;
        const cfg = window.zaehler ? window.zaehler.namen(m.id) : ['Betriebsstunden'];
        const kurz = (s, fallback) => (String(s || '').replace(/stunden$/i, '').trim() || fallback);
        const nimm = (s, i) => (s.label && !/^betriebsstunden$/i.test(String(s.label).trim()) ? s.label : cfg[i]) || '';
        const knopf = (s, label) => `<button type="button" class="mz-bh" data-mz="neu-hours" title="${esc((label ? label + ' — ' : '') + s.quelle)} — klicken: neuen Zählerstand eintragen">
            <span class="mz-bh-zahl">⏱️ ${label ? esc(label) + ' ' : ''}${esc(Number(s.wert).toLocaleString('de-DE'))} <small>Bh</small></span>
            <span class="mz-bh-wann">${s.wann ? esc(datum(s.wann)) : 'ohne Datum'}</span></button>`;
        // Zwei Zähler (z. B. Maschine + Generator): beide mit Namen und Datum nebeneinander
        return knopf(st, st2 || cfg.length > 1 ? kurz(nimm(st, 0), 'Zähler 1') : '') + (st2 ? knopf(st2, kurz(nimm(st2, 1), 'Zähler 2')) : '');
    }

    function kartenUrl(m) {
        const teile = (m.location_street || m.location_city) ? [m.location_street, m.location_zip, m.location_city] : (m.operator_street ? [m.operator_street, m.operator_zip, m.operator_city] : [m.location, m.operator_city]);
        return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(teile.filter(Boolean).join(' '));
    }

    function kopfHtml(m) {
        const kat = (window.categoryList || []).find(c => String(c.id) === String(m.category_id));
        const betreiber = m.company || '';
        const ort = m.location_city || m.operator_city || '';
        const wartung = [m.last_maintenance || m.last_maintenance_date ? 'zuletzt ' + datum(m.last_maintenance || m.last_maintenance_date) : '',
            m.next_maintenance || m.next_maintenance_date ? 'nächste ' + datum(m.next_maintenance || m.next_maintenance_date) : ''].filter(Boolean).join(' · ');
        const meta = [m.serial ? '#' + m.serial : '', m.year ? 'Baujahr ' + m.year : ''].filter(Boolean).join(' · ');
        const bild = m.thumbnail_url || m.image_url || '';
        return `
        <div class="mz-kopf">
            <div class="mz-bild" data-mz="fotos" title="Fotos ansehen">
                ${bild ? `<img src="${esc(bild)}" alt="">` : ICON.kamera}
                <small class="mz-fotozahl" hidden></small>
            </div>
            <div class="mz-kopf-text">
                ${kat ? `<span class="mz-kat">${esc(kat.name)}</span>` : ''}
                <div class="mz-name-zeile">
                    <h2 class="mz-name">${esc([m.manufacturer, m.name].filter(Boolean).join(' ') || 'Maschine')}</h2>
                    ${bhHtml(m)}
                </div>
                ${meta ? `<div class="mz-meta">${esc(meta)}</div>` : ''}
                <div class="mz-chips">
                    ${betreiber ? `<button type="button" class="mz-chip mz-chip-lila" data-mz="adresse" title="Adresse öffnen">${ICON.haus}${esc(betreiber)}</button>` : ''}
                    ${ort ? `<a class="mz-chip mz-chip-link" href="${esc(kartenUrl(m))}" target="_blank" rel="noopener" title="In Google Maps öffnen">${ICON.pin}${esc(ort)}</a>` : ''}
                    ${wartung ? `<button type="button" class="mz-chip mz-chip-gruen" data-mz="wartung" title="Wartung pflegen">${ICON.wartung}Wartung ${esc(wartung)}</button>` : `<button type="button" class="mz-chip" data-mz="wartung">${ICON.wartung}Wartung eintragen</button>`}
                    ${m.is_in_workshop || m.in_workshop ? '<span class="mz-chip mz-chip-gelb">In der Werkstatt</span>' : ''}
                    <span class="mz-chip mz-chip-gelb mz-offen-chip" hidden></span>
                </div>
            </div>
            <div class="mz-aktionen">
                <div class="mz-reihe">
                    <button type="button" class="knopf knopf--ki" data-mz="ki" title="KI-Zusammenfassung: Historie, Wartung, Probleme" aria-label="KI-Zusammenfassung">${ICON.ki}<span class="mz-ki-text">Zusammenfassung</span></button>
                    <button type="button" class="knopf knopf--sekundaer knopf--icon" data-mz="bearbeiten" title="Maschine bearbeiten" aria-label="Maschine bearbeiten">${ICON.edit}</button>
                    <button type="button" class="knopf-x" data-mz="zu" aria-label="Schließen" title="Schließen">${ICON.x}</button>
                </div>
                <div class="mz-reihe">
                    <div class="mz-neu">
                        <button type="button" class="knopf knopf--sekundaer" data-mz="neu" aria-expanded="false">${ICON.plus}Anlegen${ICON.ab}</button>
                        <div class="mz-menue menu-panel" hidden>
                            <button type="button" data-mz="neu-servicebericht">📄 Servicebericht</button>
                            <button type="button" data-mz="neu-eingangsprotokoll">📥 Eingangsprotokoll</button>
                            <button type="button" data-mz="neu-abnahmeprotokoll">✅ Abnahmeprotokoll</button>
                            <button type="button" data-mz="neu-uvv-protokoll">🛡️ UVV- / Wartungsprotokoll</button>
                            <button type="button" data-mz="neu-mietvereinbarung">🔑 Mietvereinbarung</button>
                            <hr>
                            <button type="button" data-mz="neu-vorgang">📋 Vorgang zu dieser Maschine</button>
                            <button type="button" data-mz="neu-phone">📞 Telefon</button>
                            <button type="button" data-mz="neu-note">📝 Bemerkung</button>
                            <button type="button" data-mz="neu-photo">📷 Fotos / Videos</button>
                            <button type="button" data-mz="neu-hours">⏱️ Betriebsstunden</button>
                            <button type="button" data-mz="neu-wartung">🛠️ Manuelle Wartung / Reparatur</button>
                            <hr>
                            <button type="button" data-mz="wartung">📅 Wartungstermin pflegen</button>
                            <button type="button" data-mz="zaehler">⚙️ Stundenzähler einrichten</button>
                        </div>
                    </div>
                    <button type="button" class="knopf knopf--primaer" data-mz="neu-servicebericht">${ICON.plus}Servicebericht</button>
                </div>
            </div>
        </div>`;
    }

    // Abgelegte Dateien (keine Bilder) aus dem Verlauf — Liste und Zähler am Reiter nutzen dieselbe Quelle
    function abgelegteDateien(d) {
        const liste = [];
        d.verlauf.forEach(v => { if (v.type === 'wartung') return; dateiListe(v).filter(f => !istBild(f) && !(window.medienArt && window.medienArt(f) === 'video')).forEach(f => liste.push({ f, v })); });
        return liste;
    }

    // Originale (Foto/PDF des unterschriebenen Berichts) an Serviceberichten und manuellen Wartungen
    const originaleAnzahl = d => (d.berichte || []).reduce((n, b) => n + originaleVon(b).length, 0)
        + (d.verlauf || []).filter(v => v.type === 'wartung').reduce((n, v) => n + dateiListe(v).filter(f => f.original || (!istBild(f) && !(window.medienArt && window.medienArt(f) === 'video'))).length, 0);
    const REITER = [
        ['uebersicht', 'Übersicht', null],
        ['verlauf', 'Verlauf', d => d.verlauf.length + d.berichte.length],
        ['berichte', 'Dokumente', d => d.berichte.length + abgelegteDateien(d).length + originaleAnzahl(d) + (d.protokolle ? d.protokolle.eingang.length + d.protokolle.abnahme.length : 0)],
        ['fotos', 'Fotos & Videos', d => d.fotos.length + (d.videoAnz || 0)],
        ['miete', 'Miete', d => d.mieten.length],
        ['daten', 'Daten', null]
    ];
    function reiterHtml(d) {
        const tab = (aktuell && aktuell.tab) || 'uebersicht';
        return `<div class="mz-reiter" role="tablist">${REITER.map(([k, txt, n]) => {
            const z = d && n ? n(d) : 0;
            return `<button type="button" role="tab" class="${tab === k ? 'an' : ''}" aria-selected="${tab === k}" data-mz="tab-${k}">${esc(txt)}${z ? `<em>${z}</em>` : ''}</button>`;
        }).join('')}</div>`;
    }

    // ------------------------------------------------------ Reiter-Inhalte (im Fenster)
    const leer = t => `<p class="mz-leer mz-leer-gross">${esc(t)}</p>`;
    const techNamen = ids => (Array.isArray(ids) ? ids : []).map(id => (window.userList || []).find(u => String(u.id) === String(id))).filter(Boolean).map(u => u.name).join(', ');
    const INTERN = 'Servicebericht (Intern)';

    // Farben wie in der bisherigen Historie (js/history-modal.js, typeMap)
    const FARBE = { note: '#f59e0b', phone: '#10b981', email: '#3b82f6', photo: '#8b5cf6', hours: '#06b6d4', whatsapp: '#22c55e',
        wartung: '#f97316', auslieferung: '#6366f1', angebot: '#eab308', miete: '#22c55e', service: '#3b82f6', werkstatt: '#f59e0b',
        intake: '#8b5cf6', acceptance: '#ec4899', datei: '#94a3b8' };
    const istBild = f => /^image\//.test(f.type || '') || /\.(jpe?g|png|gif|webp|heic|bmp)(\?|$)/i.test(f.url || f.name || '');
    const dateiListe = v => (Array.isArray(v.files) ? v.files : []).map(f => typeof f === 'string' ? { url: f, name: decodeURIComponent(f.split('/').pop().split('?')[0]) } : f).filter(f => f && f.url);

    function verlaufEintraege(d) {
        const katFarbe = b => { const k = (window.categoryList || []).find(c => Array.isArray(b.category_ids) && b.category_ids.map(String).includes(String(c.id))); return (k && k.color) || FARBE.service; };
        const liste = d.berichte.map(b => {
            const werk = /werkstatt/i.test(b.title || '');
            return { quelle: 'bericht', wann: b.date || b.datum_von || b.created_at, sym: werk ? '🔧' : '📄', farbe: werk ? FARBE.werkstatt : katFarbe(b),
                art: werk ? 'Werkstatt' : (b.title === INTERN ? 'Intern' : 'Servicebericht'), titel: b.title || 'Servicebericht',
                text: b.description || '', techniker: techNamen(b.technicians),
                stunden: (() => { const z = Array.isArray(b.zaehler) ? b.zaehler : []; const l = []; if (b.operating_hours) l.push({ label: z[1] ? (z[0] && z[0].name) || 'Zähler 1' : '', wert: b.operating_hours }); if (z[1] && z[1].wert) l.push({ label: z[1].name || 'Zähler 2', wert: z[1].wert }); return l; })(),
                sub: b.is_finalized ? 'abgeschlossen' : 'offen', final: !!b.is_finalized,
                id: b.id, pdf: b.pdf_url || '', originale: originaleVon(b), origArt: 'bericht' };
        }).concat(d.verlauf.map(v => {
            const dateien = dateiListe(v);
            const art = v.type === 'wartung' && /reparatur/i.test(v.title || '') ? 'Reparatur' : (ART_NAME[v.type] || v.type || 'Eintrag');
            const istOrig = f => v.type === 'wartung' && (f.original || (!istBild(f) && !(window.medienArt && window.medienArt(f) === 'video')));
            return { quelle: 'verlauf', wann: v.created_at, sym: ART_SYMBOL[v.type] || '•', farbe: FARBE[v.type] || FARBE.datei, art,
                titel: v.title || art, text: v.type === 'email' ? '' : (v.type === 'hours' ? [v.content ? (v.recipient ? (v.title || 'Zähler 1') + ': ' : '') + v.content + ' Bh' : '', v.recipient ? (v.sender || 'Zähler 2') + ': ' + v.recipient + ' Bh' : ''].filter(Boolean).join('  ·  ') : [String(v.content || '').split(window.WARTUNG_OHNE_TERMIN || '[ohne Termin]').join('').trim(), v.type === 'wartung' ? v.remark : ''].filter(Boolean).join('\n')),
                sub: v.type === 'hours' ? '' : [v.sender, v.recipient].filter(Boolean).join(' → '), id: v.id, ohneTitel: v.type === 'hours',
                // Manuelle Wartung: alle angehängten Dateien sind Nachweise/Originale (Knopf „Original“), nicht Fotos/Dateien
                originale: dateien.filter(istOrig), origArt: v.type === 'wartung' ? 'wartung' : null,
                bilder: dateien.filter(f => !istOrig(f) && istBild(f)).map(f => f.url),
                videos: dateien.filter(f => !istOrig(f) && !istBild(f) && window.medienArt && window.medienArt(f) === 'video').map(f => f.url),
                dateien: dateien.filter(f => !istOrig(f) && !istBild(f) && !(window.medienArt && window.medienArt(f) === 'video')) };
        }));
        if (d.protokolle) {
            d.protokolle.eingang.forEach(p => liste.push({ quelle: 'prot', typ: 'intake', wann: p.created_at, sym: '📥', farbe: FARBE.intake, art: 'Eingangsprotokoll', titel: 'Eingangsprotokoll', text: '', sub: p.status === 'completed' ? 'abgeschlossen' : 'in Arbeit', id: p.id }));
            d.protokolle.abnahme.forEach(p => liste.push({ quelle: 'prot', typ: 'acceptance', wann: p.created_at, sym: '✅', farbe: FARBE.acceptance, art: 'Abnahmeprotokoll', titel: 'Abnahmeprotokoll', text: '', sub: p.status === 'completed' ? 'abgeschlossen' : 'in Arbeit', id: p.id }));
        }
        return liste.filter(x => x.wann).sort((x, y) => String(y.wann).localeCompare(String(x.wann)));
    }

    // Datum ändern darf nur, wer Benutzer verwalten darf (Admin) — wie bisher in der Historie
    const darfDatum = () => { const u = window.activeUser; return !!(u && (u.name === 'Mirco Loseke' || (u.permissions && u.permissions.users))); };
    const ymd = w => { if (!w) return ''; const t = String(w); if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t; const d = new Date(t); if (isNaN(d)) return ''; const p = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); };
    function datumKopf(x) {
        const t = esc(datum(x.wann));
        // Abgeschlossene Serviceberichte sind in der Datenbank gesperrt (supabase_protect_finalized_reports.sql)
        if (darfDatum() && ['bericht', 'verlauf', 'prot'].includes(x.quelle) && x.id != null && !(x.quelle === 'bericht' && x.final))
            return `<span class="mz-v-datum mz-v-datum-edit" title="Datum ändern (klicken)"><span>${t}</span><input type="date" value="${esc(ymd(x.wann))}" data-mz-datum data-quelle="${esc(x.quelle)}" data-typ="${esc(x.typ || '')}" data-id="${esc(x.id)}"></span>`;
        return `<div class="mz-v-datum"><span>${t}</span></div>`;
    }
    function metaZeilen(x) {
        const z = [];
        const zahlText = w => { const n = zahlLesen(w); return n == null ? String(w) : n.toLocaleString('de-DE'); };
        if (x.techniker) z.push(['Techniker', esc(x.techniker), '']);
        if (x.stunden && x.stunden.length) z.push(['Betriebsstunden', x.stunden.map(s => (s.label ? esc(s.label) + ' ' : '') + esc(zahlText(s.wert)) + ' Bh').join('<i> · </i>'), 'bh']);
        if (x.sub) z.push([x.quelle === 'bericht' || x.quelle === 'prot' ? 'Status' : (x.origArt === 'wartung' ? 'Durchgeführt von' : ''), esc(x.sub), '']);
        return z.map(([l, w, k]) => `<div class="mz-v-meta ${k}">${l ? '<span>' + l + '</span>' : ''}<b>${w}</b></div>`).join('');
    }
    async function datumAendern(el) {
        const tag = el.value; if (!tag || !aktuell) return;
        const q = sb(), iso = new Date(tag + 'T12:00:00').toISOString();
        let r;
        if (el.dataset.quelle === 'bericht') r = await q.from('service_entries').update({ date: tag, datum_von: tag }).eq('id', el.dataset.id);
        else if (el.dataset.quelle === 'verlauf') r = await q.from('manual_history_entries').update({ created_at: iso }).eq('id', el.dataset.id);
        else r = await q.from(el.dataset.typ === 'intake' ? 'intake_protocols' : 'acceptance_protocols').update({ created_at: iso }).eq('id', el.dataset.id);
        if (r.error) { toast('Datum konnte nicht geändert werden: ' + r.error.message, 'error'); return; }
        toast('Datum geändert', 'success');
        neuLaden(aktuell.id);
    }

    function verlaufHtml(d) {
        const alle = verlaufEintraege(d);
        if (!alle.length) return leer('Noch kein Verlauf zu dieser Maschine.');
        const filter = aktuell.filter || 'alle';
        const arten = ['alle', ...new Set(alle.map(x => x.art))];
        const liste = filter === 'alle' ? alle : alle.filter(x => x.art === filter);
        const farbeVon = a => (alle.find(x => x.art === a) || {}).farbe || FARBE.datei;
        let monat = '';
        return `<div class="mz-tab">
            <div class="mz-filter">${arten.map(a => `<button type="button" class="mz-filter-chip${a === filter ? ' an' : ''}" data-mz="filter" data-filter="${esc(a)}" style="--f:${a === 'alle' ? '#10b981' : farbeVon(a)}">${a === 'alle' ? 'Alle ' + alle.length : esc(a) + ' ' + alle.filter(x => x.art === a).length}</button>`).join('')}</div>
            <div class="mz-zeitleiste">${liste.map(x => {
                const d0 = new Date(x.wann);
                const m = isNaN(d0) ? '' : d0.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
                const kopf = m !== monat ? (monat = m, `<h4 class="mz-monat"><span>${esc(m)}</span></h4>`) : '';
                const fotos = x.bilder && x.bilder.length ? (aktuell.gal['v' + x.id] = x.bilder, aktuell.galT['v' + x.id] = x.titel + ' · ' + datum(x.wann), `<div class="mz-fotos mz-fotos-klein">${x.bilder.slice(0, 8).map((u, i) => `<button type="button" class="mz-foto" data-mz="foto" data-g="v${esc(x.id)}" data-i="${i}"><img src="${esc(u)}" alt="" loading="lazy" onerror="this.parentElement.hidden=true"></button>`).join('')}</div>`) : '';
                const videos = x.videos && x.videos.length && window.videoKachelHtml ? `<div class="mz-fotos mz-fotos-klein mz-videos">${x.videos.map(u => window.videoKachelHtml(u)).join('')}</div>` : '';
                const dateien = x.dateien && x.dateien.length ? `<div class="mz-dateien">${x.dateien.map(f => `<button type="button" class="mz-datei" data-mz="datei" data-url="${esc(f.url)}" data-name="${esc(f.name || '')}" data-typ="${esc(f.type || '')}">📎 ${esc(f.name || 'Datei')}</button>`).join('')}</div>` : '';
                const knopf = x.quelle === 'bericht' ? `<button type="button" class="knopf knopf--sekundaer knopf--klein" data-mz="oeffnen" data-typ="bericht" data-id="${esc(x.id)}">Öffnen</button>`
                    : x.quelle === 'prot' ? `<button type="button" class="knopf knopf--sekundaer knopf--klein" data-mz="prot-oeffnen" data-typ="${x.typ}" data-id="${esc(x.id)}">Öffnen</button>`
                    : `<button type="button" class="knopf knopf--sekundaer knopf--klein" data-mz="oeffnen" data-typ="eintrag" data-id="${esc(x.id)}">Bearbeiten</button>`;
                return kopf + `<article class="mz-v" style="--f:${esc(x.farbe)}">
                    <span class="mz-v-punkt">${x.sym}</span>
                    <div class="mz-v-karte">
                        <div class="mz-v-kopf"><div><span class="mz-v-art">${esc(x.art)}</span>${x.ohneTitel || String(x.titel || '').trim().toLowerCase() === String(x.art || '').trim().toLowerCase() ? '' : `<b>${esc(x.titel)}</b>`}
                            ${datumKopf(x)}${metaZeilen(x)}</div>
                            <div class="mz-v-knoepfe">${(x.originale || []).map((f, i) => `<button type="button" class="knopf knopf--sekundaer knopf--klein mz-original" data-mz="datei" data-url="${esc(f.url)}" data-name="${esc(f.name || 'Original')}" data-typ="${esc(f.type || '')}">📎 Original${x.originale.length > 1 ? ' ' + (i + 1) : ''}</button>`).join('')}${x.pdf ? `<button type="button" class="knopf knopf--text knopf--klein" data-mz="pdf" data-url="${esc(x.pdf)}">PDF</button>` : ''}${knopf}</div></div>
                        ${x.text ? `<p class="mz-v-text">${esc(x.text)}</p>` : ''}${fotos}${videos}${dateien}${x.origArt ? originalZone(x.origArt, x.id, (x.originale || []).length) : ''}
                    </div>
                </article>`;
            }).join('')}</div></div>`;
    }

    // Dokumente: Ablage-Feld oben, danach Formular (Titel, Datum, Notiz), dann die Listen
    function ablageFormHtml() {
        const w = aktuell.ablage;
        if (!w || !w.dateien.length) return '';
        const heute = new Date().toISOString().slice(0, 10);
        return `<form class="mz-ablage-form" data-mz-form>
            <div class="mz-ablage-dateien">${w.dateien.map(f => `<span>📎 ${esc(f.name)} <em>${(f.size / 1024 / 1024).toFixed(1)} MB</em></span>`).join('')}</div>
            <div class="mz-felder">
                <label><span>Titel</span><input type="text" name="titel" class="glass-form-input" required value="${esc(w.titel || '')}"></label>
                <label><span>Datum</span><input type="date" name="datum" class="glass-form-input" value="${esc(w.datum || heute)}"></label>
                <label class="mz-feld-breit"><span>Notiz (optional)</span><textarea name="notiz" class="glass-form-input" rows="2" placeholder="z. B. Rechnung Ersatzteile, Datenblatt Motor …"></textarea></label>
            </div>
            <div class="fenster-fuss">
                <button type="button" class="knopf knopf--sekundaer" data-mz="ablage-weg">Abbrechen</button>
                <button type="submit" class="knopf knopf--primaer" data-mz-speichern>Ablegen</button>
            </div>
        </form>`;
    }

    // Original (handschriftlich unterschrieben) hängt als files-Eintrag {original:true} am Servicebericht
    const originaleVon = b => (Array.isArray(b.files) ? b.files : []).filter(f => f && typeof f === 'object' && f.original && f.url);
    function originalKnoepfe(liste) {
        return liste.map((f, i) => `<button type="button" class="knopf knopf--sekundaer knopf--klein" data-mz="datei" data-url="${esc(f.url)}" data-name="${esc(f.name || 'Original')}" data-typ="${esc(f.type || '')}" title="${esc(f.name || 'Original')}">📎 Original${liste.length > 1 ? ' ' + (i + 1) : ''}</button>`).join('');
    }
    // Gestricheltes Feld: Datei hineinziehen oder anklicken (Foto/PDF des unterschriebenen Originals)
    function originalZone(art, id, hat) {
        return `<label class="mz-orig-drop" data-mz-orig data-art="${art}" data-id="${esc(id)}" title="Originalbericht mit Unterschrift (Foto oder PDF)">
            <input type="file" multiple hidden data-mz-orig-datei accept="application/pdf,image/*">
            ＋ Original ${hat ? 'weiteres ' : ''}hochladen — hierher ziehen oder <u>auswählen</u></label>`;
    }

    function berichteHtml(d) {
        const p = d.protokolle;
        const gruppe = (titel, art, liste, zeile) => `<section class="mz-gruppe">
            <h4>${esc(titel)} <em>${liste ? liste.length : '…'}</em>
                ${art ? `<button type="button" class="knopf knopf--text knopf--klein" data-mz="neu-${art}">+ Neu</button>` : ''}</h4>
            ${liste == null ? '<p class="mz-leer">Lade …</p>' : liste.length ? liste.map(zeile).join('') : '<p class="mz-leer">Noch keine.</p>'}
        </section>`;
        const berichtZeile = b => `<div class="mz-zeile">
            <span class="mz-dot mz-dot-${b.is_finalized ? 'gruen' : 'blau'}"></span>
            <div><b>${esc(datum(b.date || b.datum_von || b.created_at))} · ${esc(b.title || 'Servicebericht')}</b>
                <small>${esc([techNamen(b.technicians), b.operating_hours ? b.operating_hours + ' Bh' : '', b.is_finalized ? 'abgeschlossen' : 'offen'].filter(Boolean).join(' · '))}</small></div>
            <div class="mz-v-knoepfe">${b.pdf_url ? `<button type="button" class="knopf knopf--text knopf--klein" data-mz="pdf" data-url="${esc(b.pdf_url)}">PDF</button>` : ''}
                ${originalKnoepfe(originaleVon(b))}
                <button type="button" class="knopf knopf--sekundaer knopf--klein" data-mz="oeffnen" data-typ="bericht" data-id="${esc(b.id)}">Öffnen</button></div>${originalZone('bericht', b.id, originaleVon(b).length)}</div>`;
        const protZeile = typ => v => `<div class="mz-zeile">
            <span class="mz-dot mz-dot-${v.status === 'completed' ? 'gruen' : 'blau'}"></span>
            <div><b>${esc(datum(v.created_at))}</b><small>${esc([v.customer_name || v.company || '', v.status === 'completed' ? 'abgeschlossen' : 'in Arbeit'].filter(Boolean).join(' · '))}</small></div>
            <div class="mz-v-knoepfe">${v.status === 'completed' ? `<button type="button" class="knopf knopf--text knopf--klein" data-mz="prot-pdf" data-typ="${typ}" data-id="${esc(v.id)}">PDF</button>` : ''}
                <button type="button" class="knopf knopf--sekundaer knopf--klein" data-mz="prot-oeffnen" data-typ="${typ}" data-id="${esc(v.id)}">Öffnen</button></div></div>`;
        // Abgelegte Dateien (keine Bilder) aus dem Verlauf
        const abgelegt = abgelegteDateien(d);
        const dateiZeile = ({ f, v }) => `<div class="mz-zeile">
            <span class="mz-dot" style="background:${FARBE.datei}"></span>
            <div><b>${esc(v.title || f.name || 'Datei')}</b><small>${esc([datum(v.created_at), f.name].filter(Boolean).join(' · '))}</small></div>
            <div class="mz-v-knoepfe"><button type="button" class="knopf knopf--sekundaer knopf--klein" data-mz="datei" data-url="${esc(f.url)}" data-name="${esc(f.name || '')}" data-typ="${esc(f.type || '')}">Öffnen</button></div></div>`;
        const wartungZeile = v => { const alle = dateiListe(v); const o = alle.filter(f => f.original || (!istBild(f) && !(window.medienArt && window.medienArt(f) === 'video'))).map(f => Object.assign({}, f)); const nf = alle.length - o.length; return `<div class="mz-zeile">
            <span class="mz-dot" style="background:${FARBE.wartung}"></span>
            <div><b>${esc(datum(v.created_at))} · ${esc(v.title || 'Wartung')}</b><small>${esc([v.content ? String(v.content).replace(/\s*\[ohne Termin\]\s*/g, '').trim() : '', o.length ? o.length + (o.length === 1 ? ' Original' : ' Originale') : 'noch kein Original', nf ? nf + (nf === 1 ? ' Foto' : ' Fotos') : ''].filter(Boolean).join(' · '))}</small></div>
            <div class="mz-v-knoepfe">${originalKnoepfe(o)}</div>${originalZone('wartung', v.id, o.length)}</div>`; };
        const wartungen = (d.verlauf || []).filter(v => v.type === 'wartung').sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
        const service = d.berichte.filter(b => b.title !== INTERN);
        const intern = d.berichte.filter(b => b.title === INTERN);
        return `<div class="mz-tab mz-gruppen">
            <label class="mz-ablage" data-mz-ablage data-ziel="dokument">
                <input type="file" multiple hidden data-mz-datei data-ziel="dokument" accept="application/pdf,image/*,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip,.msg,.eml">
                <b>Dateien hierher ziehen</b> oder <u>auswählen</u><small>PDF, Bilder, Word, Excel … — danach Titel und Datum eingeben</small>
            </label>
            ${ablageFormHtml()}
            ${gruppe('Abgelegte Dateien', '', abgelegt, dateiZeile)}
            ${gruppe('Serviceberichte', 'servicebericht', service, berichtZeile)}
            ${gruppe('Interne UVV & Wartung', 'uvv-protokoll', intern, berichtZeile)}
            ${gruppe('Wartungen (manuell eingetragen)', '', wartungen, wartungZeile)}
            ${gruppe('Eingangsprotokolle', 'eingangsprotokoll', p && p.eingang, protZeile('intake'))}
            ${gruppe('Abnahmeprotokolle', 'abnahmeprotokoll', p && p.abnahme, protZeile('acceptance'))}
        </div>`;
    }

    async function originalSpeichern(art, zeilenId, dateien) {
        const mid = aktuell && aktuell.id;
        dateien = (dateien || []).filter(f => /^image\/|pdf/.test(f.type) || /\.(pdf|jpe?g|png|heic|webp)$/i.test(f.name));
        if (!dateien.length) { toast('Bitte ein Foto oder PDF wählen.'); return; }
        try {
            toast('Original wird hochgeladen …');
            const ordner = art === 'miete' ? 'mietvereinbarungen/anlagen' : art === 'wartung' ? 'wartung/originale' : 'serviceberichte/originale';
            const neu = [];
            for (const f of dateien) {
                const res = await window.FileUploadService.uploadFile(f, {
                    path: 'maschinen/' + mid + '/' + ordner + '/' + Date.now() + '-' + sicherName(f.name),
                    provider: 'cloudflare-r2', compress: false
                });
                neu.push({ url: res.url, name: f.name, type: res.type || f.type || '', original: true });
            }
            // frisch lesen, damit zwischenzeitlich angehängte Dateien nicht verloren gehen
            if (art === 'miete') {
                const { data, error } = await sb().from('rental_agreements').select('data').eq('id', zeilenId).single();
                if (error) throw error;
                const d = Object.assign({}, data.data || {});
                d.anlagen = (Array.isArray(d.anlagen) ? d.anlagen : []).concat(neu);
                const { error: e2 } = await sb().from('rental_agreements').update({ data: d }).eq('id', zeilenId);
                if (e2) throw e2;
            } else if (art === 'wartung') {
                const { data, error } = await sb().from('manual_history_entries').select('files').eq('id', zeilenId).single();
                if (error) throw error;
                const files = (Array.isArray(data.files) ? data.files : []).concat(neu);
                const { error: e2 } = await sb().from('manual_history_entries').update({ files }).eq('id', zeilenId);
                if (e2) throw e2;
            } else {
                const { data, error } = await sb().from('service_entries').select('files').eq('id', zeilenId).single();
                if (error) throw error;
                const files = (Array.isArray(data.files) ? data.files : []).concat(neu);
                const { error: e2 } = await sb().from('service_entries').update({ files }).eq('id', zeilenId);
                if (e2) throw e2;
            }
            toast(neu.length === 1 ? 'Original angehängt' : neu.length + ' Originale angehängt', 'success');
            aktuell.daten = await laden(mid);
            if (aktuell.tab === 'berichte') { aktuell.daten.protokolle = null; protokolleLaden(); }
            zeichnen();
        } catch (e) {
            console.error('Maschinen-Zentrale: Original anhängen fehlgeschlagen', e);
            toast('Original anhängen fehlgeschlagen: ' + (e.message || e), 'error');
        }
    }

    function sicherName(n) { return String(n || 'datei').replace(/[^\w.\-]+/g, '_').slice(-80); }
    async function ablageSpeichern(form) {
        const w = aktuell && aktuell.ablage;
        if (!w || !w.dateien.length) return;
        const fd = new FormData(form);
        const titel = String(fd.get('titel') || '').trim();
        if (!titel) { toast('Bitte einen Titel eingeben.'); return; }
        const knopf = form.querySelector('[data-mz-speichern]');
        const id = aktuell.id;
        knopf.disabled = true;
        try {
            const files = [];
            for (let i = 0; i < w.dateien.length; i++) {
                const f = w.dateien[i];
                knopf.textContent = 'Lädt ' + (i + 1) + '/' + w.dateien.length + ' …';
                const res = await window.FileUploadService.uploadFile(f, {
                    path: 'maschinen/' + id + '/dokumente/' + Date.now() + '-' + i + '-' + sicherName(f.name),
                    provider: 'cloudflare-r2', compress: false
                });
                files.push({ url: res.url, name: f.name, type: res.type || f.type || '' });
            }
            const tag = String(fd.get('datum') || '').trim();
            const zeile = { type: files.every(istBild) ? 'photo' : 'note', title: titel, content: String(fd.get('notiz') || '').trim() || null,
                files, machine_id: id, created_by: (window.activeUser && window.activeUser.id) || null };
            if (tag) zeile.created_at = new Date(tag + 'T12:00:00').toISOString();
            const { error } = await sb().from('manual_history_entries').insert([zeile]);
            if (error) throw error;
            toast(files.length + (files.length === 1 ? ' Datei' : ' Dateien') + ' abgelegt', 'success');
            aktuell.ablage = null;
            aktuell.daten = await laden(id);
            if (aktuell.tab === 'berichte') { aktuell.daten.protokolle = null; protokolleLaden(); }
            zeichnen();
        } catch (e) {
            console.error('Maschinen-Zentrale: Ablegen fehlgeschlagen', e);
            toast('Ablegen fehlgeschlagen: ' + (e.message || e), 'error');
            knopf.disabled = false; knopf.textContent = 'Ablegen';
        }
    }

    function fotosHtml(d) {
        const ablage = `<label class="mz-ablage" data-mz-ablage><input type="file" accept="image/*,video/*" multiple hidden data-mz-datei>
            <b>Fotos oder Videos hierher ziehen</b> oder <u>auswählen</u><small>öffnet „Fotos / Videos hinzufügen" — dort Titel ergänzen und speichern</small></label>`;
        if (!d.fotoGruppen.length) return `<div class="mz-tab">${ablage}${leer('Noch keine Fotos oder Videos.')}</div>`;
        const anz = n => n + (n === 1 ? ' Foto' : ' Fotos');
        let gz = 0;
        // Jede Gruppe öffnet NUR ihre eigenen Fotos (mit Titel und Datum in der Beschriftung)
        const raster = (urls, start, cap) => { const key = 'f' + (gz++); aktuell.gal[key] = urls; aktuell.galT[key] = cap || ''; return `<div class="mz-fotos mz-fotos-raster">${urls.map((u, i) => `<button type="button" class="mz-foto" data-mz="foto" data-g="${key}" data-i="${i}"><img src="${esc(u)}" alt="" loading="lazy" onerror="this.parentElement.hidden=true"></button>`).join('')}</div>`; };
        const videoRaster = vids => vids && vids.length && window.videoKachelHtml ? `<div class="mz-fotos mz-fotos-raster mz-videos">${vids.map(u => window.videoKachelHtml(u)).join('')}</div>` : '';
        return `<div class="mz-tab">${ablage}${d.fotoGruppen.map(g => g.miete ? `<section class="mz-gruppe mz-gruppe-miete">
            <h4>🔑 Miete${g.zeit ? ' · ' + esc(g.zeit) : ''}${g.kunde ? ' · ' + esc(g.kunde) : ''} <em>${anz(g.urls.length)}</em></h4>
            ${g.teile.map(t => `<div class="mz-untergruppe"><h5>${esc(t.label)} <em>${anz(t.urls.length)}</em></h5>${raster(t.urls, t.start, ['Miete', g.zeit, g.kunde, t.label].filter(Boolean).join(' · '))}</div>`).join('')}
        </section>` : `<section class="mz-gruppe">
            <h4>${esc(g.titel)} <em>${esc(datum(g.wann))} · ${[g.urls.length ? anz(g.urls.length) : '', g.videos && g.videos.length ? g.videos.length + (g.videos.length === 1 ? ' Video' : ' Videos') : ''].filter(Boolean).join(' · ')}</em></h4>
            ${g.urls.length ? raster(g.urls, g.start, g.titel + ' · ' + datum(g.wann)) : ''}${videoRaster(g.videos)}
        </section>`).join('')}</div>`;
    }

    function mieteHtml(d) {
        const kopf = '<div class="mz-tab-kopf"><button type="button" class="knopf knopf--primaer knopf--klein" data-mz="neu-mietvereinbarung">+ Neue Mietvereinbarung</button></div>';
        if (!d.mieten.length) return `<div class="mz-tab">${kopf}${leer('Noch keine Mietvereinbarung zu dieser Maschine.')}</div>`;
        return `<div class="mz-tab">${kopf}${d.mieten.map(v => {
            const mi = (v.data && v.data.miete) || {};
            const zeit = [mi.beginn ? datum(mi.beginn) : '', mi.ende ? datum(mi.ende) : ''].filter(Boolean).join(' – ');
            const kd = v.data && v.data.kunde;
            const kunde = (v.data && v.data.mieter && v.data.mieter.name) || (kd && (kd.name || kd.firma)) || v.customer_name || '';
            const mf = mietFotos(v);
            const phase = (k, label, urls) => {
                if (!urls.length) return '';
                aktuell.gal['m' + v.id + k] = urls;
                return `<div class="mz-miete-phase"><span class="mz-miete-phase-titel">${label} <em>${urls.length} ${urls.length === 1 ? 'Foto' : 'Fotos'}</em></span><div class="mz-fotos mz-fotos-klein">${urls.map((u, i) => `<button type="button" class="mz-foto" data-mz="foto" data-g="m${esc(v.id)}${k}" data-i="${i}"><img src="${esc(u)}" alt="" loading="lazy"></button>`).join('')}</div></div>`;
            };
            const bildHtml = (mf.uebergabe.length || mf.ruecknahme.length) ? `<div class="mz-miete-fotos">${phase('u', 'Übergabe', mf.uebergabe)}${phase('r', 'Rücknahme', mf.ruecknahme)}</div>` : '';
            const anl = ((v.data && v.data.anlagen) || []).filter(f => f && f.url);
            return `<div class="mz-zeile mz-zeile-miete"><span class="mz-dot mz-dot-gelb"></span>
                <div><b>${esc(v.title || 'Mietvereinbarung')}</b><small>${esc([zeit, kunde, 'gespeichert ' + datum(v.created_at)].filter(Boolean).join(' · '))}</small></div>
                <div class="mz-v-knoepfe">${v.pdf_url ? `<button type="button" class="knopf knopf--text knopf--klein" data-mz="pdf" data-url="${esc(v.pdf_url)}">PDF</button>` : ''}
                    ${originalKnoepfe(anl)}
                    <button type="button" class="knopf knopf--sekundaer knopf--klein" data-mz="miete-oeffnen" data-id="${esc(v.id)}">Öffnen</button></div>${bildHtml}${originalZone('miete', v.id, anl.length)}</div>`;
        }).join('')}</div>`;
    }

    function datenHtml(m) {
        const z = (k, v) => v != null && String(v).trim() !== '' && String(v).trim() !== '/' ? `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>` : '';
        const adr = (...t) => t.filter(Boolean).join(', ');
        return `<div class="mz-tab">
            <div class="mz-tab-kopf"><button type="button" class="knopf knopf--sekundaer knopf--klein" data-mz="bearbeiten">${ICON.edit}Bearbeiten</button></div>
            <div class="mz-daten-raster">
                <section class="mz-karte"><h3>Maschine</h3><dl class="mz-daten">${z('Hersteller', m.manufacturer)}${z('Typ', m.name)}${z('Serie', m.machine_series)}${z('Seriennummer', m.serial)}${z('Baujahr', m.year)}${z('Interne Nr.', m.internal_id)}${z('Betriebsstunden', m.hours)}</dl></section>
                <section class="mz-karte"><h3>Motor</h3><dl class="mz-daten">${z('Motortyp', m.motor_type)}${z('Motor-Nr.', m.motor_serial)}${z('Leistung', m.power)}</dl></section>
                <section class="mz-karte"><h3>Wartung</h3><dl class="mz-daten">${z('Zuletzt', datum(m.last_maintenance || m.last_maintenance_date))}${z('Nächste', datum(m.next_maintenance || m.next_maintenance_date))}${z('Intervall', m.maintenance_interval_months ? m.maintenance_interval_months + ' Monate' : '')}${z('Notiz', m.last_maintenance_note)}</dl></section>
                <section class="mz-karte"><h3>Betreiber &amp; Standort</h3><dl class="mz-daten">${z('Betreiber', m.company)}${z('Kd.-Nr.', m.customer_number)}${z('Anschrift', adr(m.operator_street, [m.operator_zip, m.operator_city].filter(Boolean).join(' ')))}${z('Standort', m.location_company)}${z('Standort-Adresse', adr(m.location_street, [m.location_zip, m.location_city].filter(Boolean).join(' ')) || m.location)}</dl></section>
            </div></div>`;
    }

    async function protokolleLaden() {
        if (!aktuell || !aktuell.daten || aktuell.daten.protokolle) return;
        const id = aktuell.id, c = sb();
        const q = p => p.then(r => (r.error ? [] : r.data || [])).catch(() => []);
        const [eingang, abnahme] = await Promise.all([
            q(c.from('intake_protocols').select('*').eq('machine_id', id).order('created_at', { ascending: false })),
            q(c.from('acceptance_protocols').select('*').eq('machine_id', id).order('created_at', { ascending: false }))
        ]);
        if (aktuell && String(aktuell.id) === String(id) && aktuell.daten) { aktuell.daten.protokolle = { eingang, abnahme }; zeichnen(); }
    }

    function uebersichtHtml(m, d) {
        if (!d) return '<div class="mz-laedt">Lade …</div>';
        // Offen: Vorgänge der Maschine + nicht abgeschlossene Berichte
        const offen = [];
        d.vorgaenge.forEach(p => offen.push({ farbe: 'gelb', titel: p.title || 'Vorgang', sub: 'Vorgang' + (p.remind_at ? ' · Wiedervorlage ' + kurz(p.remind_at) : ''), typ: 'vorgang', id: p.id }));
        d.berichte.filter(b => !b.is_finalized && !/werkstatt/i.test(b.title || '')).slice(0, 5).forEach(b => offen.push({ farbe: 'blau', titel: (b.title || 'Servicebericht') + ' vom ' + datum(b.date || b.datum_von), sub: 'nicht abgeschlossen', typ: 'bericht', id: b.id }));
        // Zuletzt: Berichte + Verlauf gemischt, neueste zuerst
        const zuletzt = d.berichte.map(b => ({ wann: b.date || b.datum_von, sym: '📄', titel: b.title || 'Servicebericht', sub: b.is_finalized ? 'abgeschlossen' : 'offen', typ: 'bericht', id: b.id }))
            .concat(d.verlauf.map(v => ({ wann: v.created_at, sym: ART_SYMBOL[v.type] || '•', titel: v.title || ART_NAME[v.type] || 'Eintrag', sub: ART_NAME[v.type] || v.type, typ: 'verlauf' })))
            .filter(x => x.wann).sort((a, b) => String(b.wann).localeCompare(String(a.wann))).slice(0, 6);
        const daten = [['Hersteller', m.manufacturer], ['Typ', m.name], ['Serie', m.machine_series], ['Seriennummer', m.serial], ['Baujahr', m.year], ['Motor', m.motor_type],
            ['Motor-Nr.', m.motor_serial], ['Leistung', m.power], ['Interne Nr.', m.internal_id], ['Wartungsintervall', m.maintenance_interval_months ? m.maintenance_interval_months + ' Monate' : ''],
            ['Standort', [m.location_street, [m.location_zip, m.location_city].filter(Boolean).join(' ')].filter(Boolean).join(', ') || m.location]]
            .filter(([, v]) => v != null && String(v).trim() !== '' && String(v).trim() !== '/');
        const zl = (s, fallback) => s ? [String(s.label || fallback).replace(/^./, c => c.toUpperCase()), Number(s.wert).toLocaleString('de-DE') + ' Bh' + (s.wann ? ' · ' + datum(s.wann) : '')] : null;
        const cfgN = window.zaehler ? window.zaehler.namen(m.id) : [];
        const lbl = (s, i, fb) => (s && s.label && !/^betriebsstunden$/i.test(String(s.label).trim()) ? s.label : cfgN[i] || fb);
        const s1 = d.stunden && Object.assign({}, d.stunden, { label: lbl(d.stunden, 0, 'Betriebsstunden') });
        const s2 = d.stunden2 && Object.assign({}, d.stunden2, { label: lbl(d.stunden2, 1, 'Zähler 2') });
        [s2 ? zl(s2, 'Zähler 2') : null, zl(s1, 'Betriebsstunden')].filter(Boolean).forEach(z => daten.unshift(z));
        const fehlen = !m.motor_type && !m.power ? '<button type="button" class="knopf knopf--text knopf--klein" data-mz="bearbeiten">+ Motor / Leistung ergänzen</button>' : '';
        return `
        <div class="mz-inhalt">
            <section class="mz-karte">
                <h3>Offen <em>${offen.length || ''}</em></h3>
                ${offen.length ? `<div class="mz-offen">${offen.map(o => `
                    <div class="mz-offen-z"><span class="mz-dot mz-dot-${o.farbe}"></span>
                        <div><b>${esc(o.titel)}</b><small>${esc(o.sub)}</small></div>
                        <button type="button" class="knopf knopf--text knopf--klein" data-mz="oeffnen" data-typ="${o.typ}" data-id="${esc(o.id)}">Öffnen</button></div>`).join('')}</div>`
                    : '<p class="mz-leer">Nichts offen — kein Vorgang, kein unfertiger Bericht.</p>'}
                <h3 class="mz-abstand">Zuletzt <button type="button" class="mz-mehr" data-mz="tab-verlauf">ganzer Verlauf ›</button></h3>
                ${zuletzt.length ? `<div class="mz-zeit">${zuletzt.map(x => `
                    <button type="button" class="mz-zeit-z" data-mz="oeffnen" data-typ="${x.typ}" data-id="${esc(x.id || '')}">
                        <time>${esc(kurz(x.wann))}</time><i>${x.sym}</i><span><b>${esc(x.titel)}</b><small>${esc(x.sub)}</small></span></button>`).join('')}</div>`
                    : '<p class="mz-leer">Noch kein Verlauf.</p>'}
            </section>
            <section class="mz-karte">
                <h3>Fotos &amp; Videos <button type="button" class="mz-mehr" data-mz="tab-fotos">${d.fotos.length + (d.videoAnz || 0) ? 'alle ' + (d.fotos.length + (d.videoAnz || 0)) + ' ›' : 'Historie ›'}</button></h3>
                ${d.fotos.length ? `<div class="mz-fotos">${d.fotos.slice(0, 6).map((u, i) => `<button type="button" class="mz-foto" data-mz="foto" data-i="${i}"><img src="${esc(u)}" alt="" loading="lazy" onerror="this.parentElement.hidden=true"></button>`).join('')}</div>` : ''}
                <label class="mz-ablage" data-mz-ablage>
                    <input type="file" accept="image/*,video/*" multiple hidden data-mz-datei>
                    <b>Fotos oder Videos hierher ziehen</b> oder <u>auswählen</u>
                    <small>öffnet „Fotos / Videos hinzufügen" — dort Titel ergänzen und speichern</small>
                </label>
            </section>
            <section class="mz-karte">
                <h3>Daten <button type="button" class="mz-mehr" data-mz="bearbeiten">bearbeiten ›</button></h3>
                <dl class="mz-daten">${daten.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
                ${fehlen}
            </section>
        </div>`;
    }

    function zeichnen() {
        const box = document.getElementById('mz-fenster');
        if (!box || !aktuell) return;
        const { m, daten } = aktuell;
        const tab = aktuell.tab || 'uebersicht';
        const inhalt = !daten && tab !== 'daten' ? '<div class="mz-laedt">Lade …</div>'
            : tab === 'verlauf' ? verlaufHtml(daten) : tab === 'berichte' ? berichteHtml(daten) : tab === 'fotos' ? fotosHtml(daten)
            : tab === 'miete' ? mieteHtml(daten) : tab === 'daten' ? datenHtml(m) : uebersichtHtml(m, daten);
        const scroll = box.scrollTop;
        box.querySelector('.mz-panel').innerHTML = kopfHtml(m) + reiterHtml(daten) + inhalt;
        box.scrollTop = scroll;
        if (daten) {
            const z = box.querySelector('.mz-fotozahl');
            if (z && daten.fotos.length) { z.hidden = false; z.textContent = daten.fotos.length + ' Fotos'; }
            const oc = box.querySelector('.mz-offen-chip');
            const n = daten.vorgaenge.length;
            if (oc && n) { oc.hidden = false; oc.textContent = n === 1 ? '1 Vorgang offen' : n + ' Vorgänge offen'; }
        }
    }

    // ------------------------------------------------------ Öffnen / Schließen
    async function oeffnen(id) {
        const m = (window.machineList || []).find(x => String(x.id) === String(id));
        if (!m) return klassisch ? klassisch(id) : undefined;
        let box = document.getElementById('mz-fenster');
        if (!box) {
            box = document.createElement('div');
            box.id = 'mz-fenster';
            box.className = 'mz-overlay';
            box.innerHTML = '<div class="mz-panel" role="dialog" aria-modal="true" aria-label="Maschine"></div>';
            box.addEventListener('click', klick);
            box.addEventListener('mousedown', e => { if (e.target === box) box.dataset.zuKlick = '1'; });
            box.addEventListener('mouseup', e => { if (e.target === box && box.dataset.zuKlick === '1') schliessen(); box.dataset.zuKlick = ''; });
            box.addEventListener('change', e => { if (e.target.matches('[data-mz-datei]')) { dateienAnnehmen(e.target.dataset.ziel, e.target.files); e.target.value = ''; } });
            box.addEventListener('submit', e => { if (e.target.matches('[data-mz-form]')) { e.preventDefault(); ablageSpeichern(e.target); } });
            box.addEventListener('change', e => { if (e.target.matches('[data-mz-datum]')) datumAendern(e.target); });
            box.addEventListener('dragover', e => { const z = e.target.closest('[data-mz-ablage]'); if (z) { e.preventDefault(); z.classList.add('ueber'); } });
            box.addEventListener('dragleave', e => { const z = e.target.closest('[data-mz-ablage]'); if (z) z.classList.remove('ueber'); });
            box.addEventListener('change', e => { if (e.target.matches('[data-mz-orig-datei]')) { const z = e.target.closest('[data-mz-orig]'); const fl = [...e.target.files]; e.target.value = ''; if (z && fl.length) originalSpeichern(z.dataset.art, z.dataset.id, fl); } });
            box.addEventListener('dragover', e => { const z = e.target.closest('[data-mz-orig]'); if (z) { e.preventDefault(); z.classList.add('ueber'); } });
            box.addEventListener('dragleave', e => { const z = e.target.closest('[data-mz-orig]'); if (z) z.classList.remove('ueber'); });
            box.addEventListener('drop', e => { const z = e.target.closest('[data-mz-orig]'); if (!z) return; e.preventDefault(); z.classList.remove('ueber'); originalSpeichern(z.dataset.art, z.dataset.id, [...e.dataTransfer.files]); });
            box.addEventListener('drop', e => { const z = e.target.closest('[data-mz-ablage]'); if (!z) return; e.preventDefault(); z.classList.remove('ueber'); dateienAnnehmen(z.dataset.ziel, e.dataTransfer.files); });
            document.body.appendChild(box);
        }
        aktuell = { id: m.id, m, daten: null, tab: 'uebersicht', filter: 'alle', gal: {}, galT: {} };
        box.hidden = false;
        document.body.classList.add('mz-offen');
        zeichnen();
        if (typeof window.updateLastViewed === 'function') { try { window.updateLastViewed('machine', m.id); } catch (e) { /* egal */ } }
        try {
            const daten = await laden(m.id);
            if (aktuell && String(aktuell.id) === String(m.id)) { aktuell.daten = daten; zeichnen(); }
        } catch (err) { console.warn('Maschinen-Zentrale: Laden fehlgeschlagen', err); }
    }

    function schliessen() {
        const box = document.getElementById('mz-fenster');
        if (box) box.hidden = true;
        document.body.classList.remove('mz-offen');
    }
    window.maschinenZentraleSchliessen = schliessen;

    // Andere Fenster (Historie, Bericht …) öffnen sich ÜBER der Zentrale?
    // Einfacher und sicher: Zentrale schließen, dann das Ziel öffnen.
    function weiter(fn) { const id = aktuell && aktuell.id; schliessen(); setTimeout(() => fn(id), 60); }

    // ------------------------------------------------------ Aktionen
    function bericht(typ) {
        weiter(id => {
            window.currentSelectedMachineForService = id;
            if (typeof window.startReportCreation === 'function') window.startReportCreation(typ);
        });
    }
    function verlaufFormular(typ, dateien) {
        if (typeof window.openEintragAnlegen !== 'function') { toast('Eintrag-Fenster nicht geladen.'); return; }
        window.openEintragAnlegen(aktuell.id, typ, { dateien: dateien });
    }
    // Von außen (Eintrag-Fenster, Foto-Eingang, KI-Chat …): Daten der offenen Maschine neu laden
    async function neuLaden(id) {
        if (!aktuell || (id != null && String(aktuell.id) !== String(id))) return;
        try {
            const mid = aktuell.id;
            aktuell.daten = await laden(mid);
            if (aktuell.tab === 'berichte' || aktuell.tab === 'verlauf') { aktuell.daten.protokolle = null; protokolleLaden(); }
            zeichnen();
        } catch (e) { console.warn('Maschinen-Zentrale: Neuladen fehlgeschlagen', e); }
    }
    window.maschinenZentraleNeuLaden = neuLaden;
    document.addEventListener('zaehler:geaendert', () => { if (aktuell && aktuell.daten) zeichnen(); });
    function dateienAnnehmen(ziel, liste) {
        if (ziel !== 'dokument') return fotosUebergeben(liste);
        const dateien = [...(liste || [])];
        if (!dateien.length) return;
        aktuell.ablage = { dateien, titel: dateien.length === 1 ? dateien[0].name.replace(/\.\w+$/, '') : '' };
        zeichnen();
        const t = document.querySelector('#mz-fenster [data-mz-form] input[name="titel"]');
        if (t) { t.focus(); t.select(); }
    }
    function fotosUebergeben(liste) {
        const bilder = [...(liste || [])].filter(f => /^(image|video)\//.test(f.type) || /\.(jpe?g|png|webp|heic|mp4|mov|webm|m4v)$/i.test(f.name));
        if (!bilder.length) { toast('Bitte Fotos oder Videos wählen (JPG, PNG, MP4, MOV …).'); return; }
        verlaufFormular('photo', bilder);
    }

    function klick(ev) {
        const a = ev.target.closest('[data-mz]');
        const box = document.getElementById('mz-fenster');
        const menue = box && box.querySelector('.mz-menue');
        if (menue && !menue.hidden && (!a || a.dataset.mz !== 'neu')) {
            menue.hidden = true;
            const k = box.querySelector('[data-mz="neu"]'); if (k) k.setAttribute('aria-expanded', 'false');
        }
        if (!a || !aktuell) return;
        const was = a.dataset.mz;
        const m = aktuell.m;
        if (was === 'zu') return schliessen();
        if (was === 'neu') {
            if (menue) { menue.hidden = !menue.hidden; a.setAttribute('aria-expanded', String(!menue.hidden)); }
            return;
        }
        if (was.startsWith('neu-')) {
            const art = was.slice(4);
            if (['servicebericht', 'eingangsprotokoll', 'abnahmeprotokoll', 'uvv-protokoll', 'mietvereinbarung'].includes(art)) return bericht(art);
            if (art === 'vorgang') return weiter(id => {
                if (typeof window.openProcessAddModal === 'function') window.openProcessAddModal();
                if (typeof window.selectProcessMachine === 'function') {
                    const lbl = typeof window.processMachineLabel === 'function' ? window.processMachineLabel(m) : [m.manufacturer, m.name].join(' ');
                    setTimeout(() => window.selectProcessMachine('process-add', id, lbl), 150);
                }
            });
            return verlaufFormular(art);   // note, phone, hours, photo, wartung (manuell)
        }
        if (was === 'ki') return weiter(id => window.openMachineSummary && window.openMachineSummary(id));
        if (was === 'bearbeiten') return weiter(id => window.openEditStammdaten && window.openEditStammdaten(id));
        if (was === 'wartung') return weiter(id => window.openMaintTerminModal && window.openMaintTerminModal(m.id));
        if (was === 'zaehler') { if (window.zaehler) window.zaehler.einrichten(m.id); return; }
        if (was === 'adresse') return weiter(() => {
            if (m.customer_id && typeof window.openAddressDetail === 'function') {
                if (typeof window.switchView === 'function') window.switchView('addressbook');
                setTimeout(() => window.openAddressDetail(String(m.customer_id), 'overview'), 250);
            } else toast('Für diese Maschine ist keine Adresse verknüpft.');
        });
        if (was.startsWith('tab-')) {
            aktuell.tab = was.slice(4);
            if (aktuell.tab === 'berichte' || aktuell.tab === 'verlauf') protokolleLaden();
            zeichnen();
            return;
        }
        if (was === 'datei') {
            if (typeof window.previewDocument === 'function') window.previewDocument(a.dataset.url, a.dataset.name || 'Datei', a.dataset.typ || '');
            else window.open(a.dataset.url, '_blank', 'noopener');
            return;
        }
        if (was === 'ablage-weg') { aktuell.ablage = null; zeichnen(); return; }
        if (was === 'filter') { aktuell.filter = a.dataset.filter || 'alle'; zeichnen(); return; }
        if (was === 'foto') {
            const urls = a.dataset.g ? (aktuell.gal[a.dataset.g] || []) : ((aktuell.daten && aktuell.daten.fotos) || []);
            const cap = a.dataset.g && aktuell.galT && aktuell.galT[a.dataset.g];
            if (urls.length && typeof window.openPhotosLightbox === 'function') window.openPhotosLightbox(urls, +a.dataset.i || 0, cap ? { titel: cap, namen: [] } : undefined);
            return;
        }
        if (was === 'pdf') {
            const url = a.dataset.url; if (!url) return;
            if (typeof window.previewDocument === 'function') window.previewDocument(url, 'Dokument', 'application/pdf'); else window.open(url, '_blank', 'noopener');
            return;
        }
        if (was === 'prot-oeffnen') {
            const typ = a.dataset.typ, pid = a.dataset.id;
            return weiter(mid => typ === 'intake' ? (window.openIntakeProtocol && window.openIntakeProtocol(mid, pid)) : (window.openAcceptanceProtocol && window.openAcceptanceProtocol(mid, pid)));
        }
        if (was === 'prot-pdf') { if (window.openProtocolPDF) window.openProtocolPDF(aktuell.id, a.dataset.id, a.dataset.typ); return; }
        if (was === 'miete-oeffnen') { const vid = a.dataset.id; return weiter(mid => window.openMietvereinbarung && window.openMietvereinbarung(mid, vid)); }
        if (was === 'oeffnen') {
            const typ = a.dataset.typ, id = a.dataset.id;
            if (typ === 'vorgang') return weiter(() => window.openEditProcessModal && window.openEditProcessModal(id));
            if (typ === 'bericht') return weiter(() => window.openEditServicebericht && window.openEditServicebericht(id));
            if (typ === 'eintrag') { if (window.openEintragAnlegen) window.openEintragAnlegen(aktuell.id, null, { id }); return; }
            aktuell.tab = 'verlauf'; zeichnen(); return;
        }
    }

    document.addEventListener('keydown', e => {
        if (e.key !== 'Escape' || !document.body.classList.contains('mz-offen')) return;
        const box = document.getElementById('mz-fenster');
        const menue = box && box.querySelector('.mz-menue');
        if (menue && !menue.hidden) { menue.hidden = true; return; }
        schliessen();
    });

    // ------------------------------------------------------ Einhängen
    function einhaengen() {
        const o = window.openMachineDetails;
        if (typeof o !== 'function' || o._mz) return;
        klassisch = o;
        const neu = function (id) {
            window._mzLetzteId = id;
            return oeffnen(id);
        };
        neu._mz = true;
        window.openMachineDetails = neu;
    }
    // Die alte Historie ist stillgelegt: alle bisherigen Einstiege öffnen die Maschinen-Zentrale (Reiter Verlauf).
    function historieUmleiten() {
        if (window.openHistoryModal && window.openHistoryModal._mz) return;
        const h = function (id) { window._mzLetzteId = id; return oeffnen(id).then(() => { if (aktuell && String(aktuell.id) === String(id)) { aktuell.tab = 'verlauf'; protokolleLaden(); zeichnen(); } }); };
        h._mz = true;
        window.openHistoryModal = h;
        window.updateHistoryViewExternally = neuLaden;
    }
    // machine-details-modal.js setzt openMachineDetails beim Laden — danach einhängen
    // und später noch einmal prüfen (falls es neu gesetzt wird).
    function einhaengenAlle() { einhaengen(); historieUmleiten(); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { einhaengenAlle(); setTimeout(einhaengenAlle, 3000); });
    else { einhaengenAlle(); setTimeout(einhaengenAlle, 3000); }
    window.openMaschinenZentrale = oeffnen;
})();
