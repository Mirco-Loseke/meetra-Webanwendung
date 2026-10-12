// =============================================================================
//  KI-Auswertungen für den KI-Chat (2026-10-02)
// =============================================================================
//  Die KI rechnet nicht selbst und sieht keine Rohdaten. Sie wählt aus dem
//  KATALOG passende Abfragen ({"abfragen":[{"name":…, …}]}), die App rechnet
//  hier im Browser (Zählen, Summen, Ranglisten) und gibt nur die Ergebnisse als
//  kurzen Text zurück — der läuft wie alles im Chat über kiPseudonym.
//  Abfragen werden 5 min gepuffert (Egress-Regel), Spalten schmal gehalten
//  (keine Unterschriften, kein checklist_payload).
//  window.kiAuswertung = { KATALOG, ausfuehren(abfragen, refs) → { text, liste } }
// =============================================================================
(function () {
    'use strict';

    const FRISCH = 5 * 60 * 1000;
    const puffer = new Map();
    const sb = () => window.supabaseClient;

    async function lade(key, holen) {
        const p = puffer.get(key);
        if (p && Date.now() - p.zeit < FRISCH) return p.daten;
        const { data, error } = await holen();
        if (error) throw new Error(key + ': ' + error.message);
        puffer.set(key, { zeit: Date.now(), daten: data || [] });
        return data || [];
    }
    const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    function seit(monate) { const d = new Date(); d.setMonth(d.getMonth() - (Number(monate) || 12)); return iso(d); }
    const monat = v => String(v || '').slice(0, 7);
    const zahl = v => { const n = typeof v === 'number' ? v : parseFloat(String(v == null ? '' : v).replace(/\.(?=\d{3})/g, '').replace(',', '.')); return isNaN(n) ? 0 : n; };
    const eur = n => Math.round(n).toLocaleString('de-DE') + ' €';
    const pct = (a, b) => b ? Math.round(a / b * 100) + ' %' : '–';

    // ---------------------------------------------------------------- Nachschlagen
    const maschinen = () => window.machineList || [];
    function maschine(id) { return (window.machineById && window.machineById(id)) || maschinen().find(m => String(m.id) === String(id)) || null; }
    function mName(id) { const m = maschine(id); return m ? (window.machineLabel ? window.machineLabel(m) : [m.manufacturer, m.name, m.serial].filter(Boolean).join(' ')) : 'Maschine #' + id; }
    function kunden() { return (window.customerCacheSync && window.customerCacheSync()) || []; }
    function kName(id) { const k = kunden().find(x => String(x.id) === String(id)); return k ? k.name : ''; }
    function mKunde(m) { return (m && (kName(m.customer_id) || m.company)) || 'ohne Kunde'; }
    function katName(id) { const c = (window.categoryList || []).find(x => String(x.id) === String(id)); return c ? c.name : (id ? 'Kategorie ' + id : 'ohne Kategorie'); }
    function nutzer(v) { const u = (window.userList || []).find(x => String(x.id) === String(v) || x.name === v); return u ? u.name : String(v); }
    function zaehle(liste, schl) { const m = new Map(); liste.forEach(x => { [].concat(schl(x)).filter(k => k != null && k !== '').forEach(k => m.set(k, (m.get(k) || 0) + 1)); }); return [...m.entries()].sort((a, b) => b[1] - a[1]); }
    const zeilen = (paare, n, fmt) => paare.slice(0, n || 15).map(([k, v], i) => `${i + 1}. ${k}: ${fmt ? fmt(v) : v}`).join('\n');

    // Maschine aus Kürzel (mID), ID oder Name finden
    function maschineAus(v, refs) {
        if (!v) return null;
        if (refs && refs.m && refs.m[v]) return refs.m[v];
        const id = String(v).replace(/^m/i, '');
        const m = maschine(id);
        if (m) return m;
        const q = String(v).toLowerCase();
        return maschinen().find(x => [x.name, x.manufacturer, x.serial, x.serial_number].join(' ').toLowerCase().includes(q)) || null;
    }
    function kundeAus(v, refs) {
        if (!v) return null;
        if (refs && refs.adr && refs.adr[v]) return refs.adr[v];
        const q = String(v).toLowerCase();
        return kunden().find(k => String(k.id) === String(v)) || kunden().find(k => (k.name || '').toLowerCase().includes(q)) || null;
    }

    // ---------------------------------------------------------------- Daten
    const SERVICE_SP = 'id, machine_id, category_id, category_ids, title, date, datum_von, technicians, travel_distance_km, travel_time_minutes, operating_hours, workshop_order_number';
    const service = mon => lade('service:' + mon, () => sb().from('service_entries').select(SERVICE_SP).gte('date', seit(mon)).order('date', { ascending: false }).limit(5000));
    const serviceAlle = () => lade('service:alle', () => sb().from('service_entries').select(SERVICE_SP).order('date', { ascending: false }).limit(8000));
    const kats = s => (Array.isArray(s.category_ids) && s.category_ids.length ? s.category_ids : [s.category_id]).map(katName);

    // ---------------------------------------------------------------- Abfragen
    const A = {
        async service_uebersicht(p) {
            const mon = p.monate || 12, l = await service(mon);
            const km = l.map(s => zahl(s.travel_distance_km)).filter(Boolean);
            return [`Serviceberichte der letzten ${mon} Monate: ${l.length}`,
                'Je Monat:\n' + zaehle(l, s => monat(s.date)).sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => `${k}: ${v}`).join('\n'),
                'Je Kategorie:\n' + zeilen(zaehle(l, kats), 12),
                'Je Techniker:\n' + zeilen(zaehle(l, s => (Array.isArray(s.technicians) ? s.technicians : []).map(nutzer)), 12),
                'Verschiedene Maschinen: ' + new Set(l.map(s => s.machine_id)).size,
                km.length ? `Anfahrt: Ø ${Math.round(km.reduce((a, b) => a + b, 0) / km.length)} km, gesamt ${Math.round(km.reduce((a, b) => a + b, 0)).toLocaleString('de-DE')} km (${km.length} Berichte mit km)` : ''].filter(Boolean).join('\n\n');
        },
        async service_je_maschine(p) {
            const mon = p.monate || 12, l = await service(mon);
            const nach = new Map();
            l.forEach(s => { const k = String(s.machine_id); if (!nach.has(k)) nach.set(k, []); nach.get(k).push(s); });
            const top = [...nach.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, p.top || 10);
            return `Maschinen mit den meisten Serviceberichten (letzte ${mon} Monate, ${l.length} Berichte gesamt):\n` + top.map(([id, ls], i) =>
                `${i + 1}. ${mName(id)} — Kunde: ${mKunde(maschine(id))} — ${ls.length} Berichte (${zaehle(ls, kats).map(([k, v]) => k + ' ' + v).join(', ')}), zuletzt ${ls[0].date || '?'}; Titel: ${ls.slice(0, 4).map(s => s.title).filter(Boolean).join(' | ')}`).join('\n');
        },
        async service_je_kunde(p) {
            const mon = p.monate || 12, l = await service(mon);
            return `Serviceberichte je Kunde (letzte ${mon} Monate):\n` + zeilen(zaehle(l, s => mKunde(maschine(s.machine_id))), p.top || 15);
        },
        async service_je_hersteller(p) {
            const mon = p.monate || 12, l = await service(mon);
            return `Serviceberichte je Hersteller (letzte ${mon} Monate):\n` + zeilen(zaehle(l, s => (maschine(s.machine_id) || {}).manufacturer || 'unbekannt'), 12)
                + `\n\nJe Maschinentyp:\n` + zeilen(zaehle(l, s => { const m = maschine(s.machine_id) || {}; return [m.manufacturer, m.name].filter(Boolean).join(' ') || 'unbekannt'; }), p.top || 12);
        },
        async haeufige_probleme(p) {
            const mon = p.monate || 12;
            const [l, h] = await Promise.all([service(mon),
                lade('hist:' + mon, () => sb().from('manual_history_entries').select('id, machine_id, type, title, created_at').gte('created_at', seit(mon)).limit(5000))]);
            const STOP = new Set('und der die das mit von für an am im in zu zur zum bei auf aus ein eine einer eines nach vor über unter wartung servicebericht service uvv prüfung kontrolle maschine anlage neu alt sowie wurde wurden ist sind war hat haben teil teile durchgeführt jährliche jahres inkl ca st stk'.split(' '));
            const titel = l.map(s => ({ t: s.title, m: s.machine_id })).concat(h.filter(x => /repair|reparatur|schaden|note/i.test(x.type || '')).map(x => ({ t: x.title, m: x.machine_id })));
            const worte = zaehle(titel, x => [...new Set(String(x.t || '').toLowerCase().replace(/[^a-zäöüß0-9 -]/g, ' ').split(/\s+/).filter(w => w.length > 3 && !STOP.has(w) && !/^\d+$/.test(w)))]);
            return `Häufigste Begriffe in Service- und Reparatur-Titeln (letzte ${mon} Monate, ${titel.length} Einträge) — Hinweis auf wiederkehrende Bauteile/Probleme:\n` + zeilen(worte, p.top || 20);
        },
        async maschine_verlauf(p, refs) {
            const m = maschineAus(p.maschine, refs);
            if (!m) return 'Maschine nicht gefunden: ' + p.maschine;
            const [l, h] = await Promise.all([
                lade('mservice:' + m.id, () => sb().from('service_entries').select(SERVICE_SP).eq('machine_id', m.id).order('date', { ascending: false }).limit(300)),
                lade('mhist:' + m.id, () => sb().from('manual_history_entries').select('id, type, title, created_at, entry_date').eq('machine_id', m.id).order('created_at', { ascending: false }).limit(300))
            ]);
            const std = l.filter(s => zahl(s.operating_hours)).map(s => `${s.date}: ${zahl(s.operating_hours)} h`).slice(0, 8);
            return [`Maschine ${mName(m.id)} — Kunde: ${mKunde(m)}${m.year ? ', Baujahr ' + m.year : ''}${m.next_maintenance ? ', nächste Wartung ' + m.next_maintenance : ''}`,
                `Serviceberichte gesamt: ${l.length}; je Jahr: ${zaehle(l, s => String(s.date || '').slice(0, 4)).sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => k + ': ' + v).join(', ')}`,
                'Je Kategorie: ' + zaehle(l, kats).map(([k, v]) => k + ' ' + v).join(', '),
                'Letzte Berichte:\n' + l.slice(0, 12).map(s => `- ${s.date}: ${s.title || ''} [${kats(s).join(', ')}]${(s.technicians || []).length ? ' · ' + s.technicians.map(nutzer).join(', ') : ''}`).join('\n'),
                h.length ? 'Weitere Historie (' + h.length + '):\n' + h.slice(0, 10).map(x => `- ${String(x.entry_date || x.created_at).slice(0, 10)}: ${x.type || ''} ${x.title || ''}`).join('\n') : '',
                std.length ? 'Betriebsstunden laut Berichten:\n' + std.join('\n') : ''].filter(Boolean).join('\n\n');
        },
        async kunde_uebersicht(p, refs) {
            const k = kundeAus(p.kunde, refs);
            if (!k) return 'Adresse nicht gefunden: ' + p.kunde;
            const ms = maschinen().filter(m => String(m.customer_id) === String(k.id));
            const ids = ms.map(m => m.id);
            const [l, v, a] = await Promise.all([
                ids.length ? lade('kservice:' + k.id, () => sb().from('service_entries').select(SERVICE_SP).in('machine_id', ids).limit(2000)) : [],
                lade('kvorg:' + k.id, () => sb().from('internal_processes').select('id, title, status, created_at').eq('customer_id', k.id).limit(500)),
                lade('kang:' + k.id, () => sb().from('angebote').select('*').eq('customer_id', k.id).limit(500))
            ]);
            const offenA = a.filter(x => !/verloren|abgelehnt|absage|storniert|gewonnen|auftrag|bestellt|angenommen|zusage/i.test(x.status || ''));
            const gew = a.filter(x => /gewonnen|auftrag erhalten|bestellt|angenommen|zusage/i.test(x.status || ''));
            return [`Adresse ${k.name}${k.city ? ' (' + k.city + ')' : ''}`,
                `Maschinen: ${ms.length}${ms.length ? ' — ' + ms.slice(0, 15).map(m => mName(m.id)).join('; ') : ''}`,
                `Serviceberichte: ${l.length} (je Jahr: ${zaehle(l, s => String(s.date || '').slice(0, 4)).sort((x, y) => x[0].localeCompare(y[0])).map(([j, n]) => j + ': ' + n).join(', ') || '–'})`,
                `Vorgänge: ${v.length}, davon offen ${v.filter(x => x.status !== 'erledigt').length}`,
                `Angebote: ${a.length} (Summe ${eur(a.reduce((s, x) => s + zahl(x.nettobetrag), 0))}), gewonnen ${gew.length} (${eur(gew.reduce((s, x) => s + zahl(x.nettobetrag), 0))}), offen ${offenA.length}`].join('\n');
        },
        async vorgaenge_statistik(p) {
            const mon = p.monate || 12;
            const l = await lade('vorg:' + mon, () => sb().from('internal_processes').select('id, title, status, process_type, assigned_users, created_at, customer_id, remind_at').gte('created_at', seit(mon)).limit(5000));
            const heute = Date.now();
            const offen = l.filter(x => x.status !== 'erledigt');
            const alt = n => offen.filter(x => (heute - new Date(x.created_at)) / 86400000 > n).length;
            const ueberf = offen.filter(x => x.remind_at && new Date(x.remind_at) < heute).length;
            return [`Vorgänge angelegt in den letzten ${mon} Monaten: ${l.length}, davon offen ${offen.length}, erledigt ${l.length - offen.length}`,
                `Offen und älter als 14 Tage: ${alt(14)}, älter als 30 Tage: ${alt(30)}, Wiedervorlage überfällig: ${ueberf}`,
                'Je Status:\n' + zeilen(zaehle(l, x => x.status || 'ohne'), 12),
                'Je Art:\n' + zeilen(zaehle(l, x => x.process_type || 'ohne'), 12),
                'Offene je Zuständigem:\n' + zeilen(zaehle(offen, x => (Array.isArray(x.assigned_users) && x.assigned_users.length ? x.assigned_users : ['niemand']).map(nutzer)), 12),
                'Kunden mit den meisten Vorgängen:\n' + zeilen(zaehle(l, x => kName(x.customer_id) || null), 10),
                'Je Monat: ' + zaehle(l, x => monat(x.created_at)).sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => k + ': ' + v).join(', ')].join('\n\n');
        },
        async angebote_statistik(p) {
            const mon = p.monate || 12;
            const l = await lade('ang:' + mon, () => sb().from('angebote').select('*').gte('belegdatum', seit(mon)).limit(5000));
            const gew = l.filter(x => /gewonnen|auftrag erhalten|bestellt|verkauft|angenommen|zusage/i.test(x.status || ''));
            const verl = l.filter(x => /verloren|abgelehnt|absage|abgesagt|storniert|kein interesse/i.test(x.status || ''));
            const offen = l.filter(x => !gew.includes(x) && !verl.includes(x));
            const sum = a => a.reduce((s, x) => s + zahl(x.nettobetrag), 0);
            const entschieden = gew.length + verl.length;
            return [`Angebote der letzten ${mon} Monate: ${l.length}, Summe netto ${eur(sum(l))}`,
                `Gewonnen: ${gew.length} (${eur(sum(gew))}), verloren: ${verl.length} (${eur(sum(verl))}), offen: ${offen.length} (${eur(sum(offen))})`,
                `Abschlussquote der entschiedenen: ${pct(gew.length, entschieden)} nach Anzahl, ${pct(sum(gew), sum(gew) + sum(verl))} nach Wert`,
                'Je Status:\n' + zeilen(zaehle(l, x => x.status || 'ohne Status'), 12),
                'Je Monat (Anzahl / Summe):\n' + zaehle(l, x => monat(x.belegdatum)).sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => `${k}: ${v} / ${eur(sum(l.filter(x => monat(x.belegdatum) === k)))}`).join('\n'),
                'Größte offene Angebote:\n' + offen.sort((a, b) => zahl(b.nettobetrag) - zahl(a.nettobetrag)).slice(0, 8).map(x => `- ${x.belegnummer} ${kName(x.customer_id) || x.kundenmatchcode || ''}: ${eur(zahl(x.nettobetrag))} [${x.status || 'offen'}] vom ${x.belegdatum}`).join('\n'),
                'Kunden mit dem höchsten Angebotswert:\n' + [...l.reduce((m, x) => { const k = kName(x.customer_id) || x.kundenmatchcode || '?'; m.set(k, (m.get(k) || 0) + zahl(x.nettobetrag)); return m; }, new Map()).entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v], i) => `${i + 1}. ${k}: ${eur(v)}`).join('\n')].join('\n\n');
        },
        async wartung_status(p) {
            const heute = iso(new Date());
            const in30 = iso(new Date(Date.now() + 30 * 86400000));
            const ms = maschinen().filter(m => m.next_maintenance);
            const ueber = ms.filter(m => String(m.next_maintenance).slice(0, 10) < heute).sort((a, b) => String(a.next_maintenance).localeCompare(String(b.next_maintenance)));
            const bald = ms.filter(m => { const d = String(m.next_maintenance).slice(0, 10); return d >= heute && d <= in30; }).sort((a, b) => String(a.next_maintenance).localeCompare(String(b.next_maintenance)));
            return [`Maschinen mit Wartungstermin: ${ms.length} von ${maschinen().length}`,
                `Überfällig: ${ueber.length}\n` + ueber.slice(0, p.top || 15).map(m => `- ${String(m.next_maintenance).slice(0, 10)}: ${mName(m.id)} (${mKunde(m)})`).join('\n'),
                `Fällig in den nächsten 30 Tagen: ${bald.length}\n` + bald.slice(0, p.top || 15).map(m => `- ${String(m.next_maintenance).slice(0, 10)}: ${mName(m.id)} (${mKunde(m)})`).join('\n')].join('\n\n');
        },
        async maschinen_bestand() {
            const ms = maschinen();
            return [`Maschinen gesamt: ${ms.length}`,
                'Je Hersteller:\n' + zeilen(zaehle(ms, m => m.manufacturer || 'unbekannt'), 15),
                'Je Kategorie/Typ:\n' + zeilen(zaehle(ms, m => m.category || m.type || 'unbekannt'), 15),
                'Je Baujahr-Jahrzehnt:\n' + zaehle(ms, m => m.year ? Math.floor(zahl(m.year) / 10) * 10 + 'er' : 'unbekannt').sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => k + ': ' + v).join(', '),
                'Kunden mit den meisten Maschinen:\n' + zeilen(zaehle(ms, mKunde), 10)].join('\n\n');
        },
        async aufgaben_statistik() {
            const l = await lade('tasks', () => sb().from('tasks').select('id, title, status, assigned_to, created_at, machine_id').limit(5000));
            const offen = l.filter(t => t.status !== 'completed');
            return [`Aufgaben gesamt: ${l.length}, offen ${offen.length}`,
                'Je Status:\n' + zeilen(zaehle(l, t => t.status || 'ohne'), 10),
                'Offene je Mitarbeiter:\n' + zeilen(zaehle(offen, t => (Array.isArray(t.assigned_to) && t.assigned_to.length ? t.assigned_to : ['niemand']).map(nutzer)), 12),
                'Maschinen mit den meisten offenen Aufgaben:\n' + zeilen(zaehle(offen.filter(t => t.machine_id), t => mName(t.machine_id)), 8)].join('\n\n');
        },
        async techniker_statistik(p) {
            const mon = p.monate || 12, l = await service(mon);
            const je = new Map();
            l.forEach(s => (Array.isArray(s.technicians) ? s.technicians : []).forEach(t => {
                const n = nutzer(t); if (!je.has(n)) je.set(n, { n: 0, km: 0, min: 0, kat: [] });
                const x = je.get(n); x.n++; x.km += zahl(s.travel_distance_km); x.min += zahl(s.travel_time_minutes); x.kat.push(...kats(s));
            }));
            return `Techniker in den letzten ${mon} Monaten:\n` + [...je.entries()].sort((a, b) => b[1].n - a[1].n).map(([n, x]) =>
                `- ${n}: ${x.n} Berichte, ${Math.round(x.km).toLocaleString('de-DE')} km, ${Math.round(x.min / 60)} h Fahrzeit; ${zaehle(x.kat, k => k).slice(0, 4).map(([k, v]) => k + ' ' + v).join(', ')}`).join('\n');
        }
    };

    const KATALOG = `AUSWERTUNGEN (die App rechnet, du bekommst die Ergebnisse):
- service_uebersicht {monate} — Anzahl Serviceberichte je Monat, Kategorie, Techniker, Anfahrt-km
- service_je_maschine {monate, top} — welche Maschinen am häufigsten Service hatten (mit Kunde, Kategorien, Titeln)
- service_je_kunde {monate, top} — Service-Häufigkeit je Kunde
- service_je_hersteller {monate} — je Hersteller und Maschinentyp
- haeufige_probleme {monate, top} — häufigste Begriffe in Service-/Reparatur-Titeln (wiederkehrende Bauteile/Fehler)
- maschine_verlauf {maschine:"mID oder Name/Seriennr."} — kompletter Service-Verlauf einer Maschine, Betriebsstunden
- kunde_uebersicht {kunde:"adrN oder Name"} — Maschinen, Service, Vorgänge, Angebote einer Adresse
- vorgaenge_statistik {monate} — Vorgänge je Status/Art/Zuständigem, alte offene, überfällige
- angebote_statistik {monate} — Anzahl, Summen, gewonnen/verloren/offen, Abschlussquote, je Monat, größte offene
- wartung_status {top} — überfällige und bald fällige Wartungen
- maschinen_bestand {} — Maschinen je Hersteller, Typ, Baujahr, Kunde
- aufgaben_statistik {} — Aufgaben je Status und Mitarbeiter
- techniker_statistik {monate} — Berichte, km und Fahrzeit je Techniker
Standard: monate 12. Mehrere Abfragen auf einmal sind erlaubt (max. 4).`;

    async function ausfuehren(abfragen, refs) {
        const liste = (Array.isArray(abfragen) ? abfragen : []).filter(a => a && A[a.name]).slice(0, 4);
        const teile = [];
        for (const a of liste) {
            try { teile.push(`### ${a.name}${a.monate ? ' (' + a.monate + ' Monate)' : ''}\n` + await A[a.name](a, refs)); }
            catch (e) { teile.push(`### ${a.name}\nFEHLER: ${e.message || e}`); }
        }
        return { text: teile.join('\n\n') || 'Keine gültige Abfrage.', liste };
    }

    window.kiAuswertung = { KATALOG, ausfuehren, namen: Object.keys(A) };
})();
