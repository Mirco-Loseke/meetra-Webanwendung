/* =========================================================
   TIMELINE — Werkstatt / Service / Vermietung auf einer Achse
   ---------------------------------------------------------
   Markup: partials/views/timeline.html
   Stil:   css/views/timeline.css

   Diese Ansicht liest aus mehreren Tabellen und bringt sie auf
   EIN Format (siehe normalisieren()). Alle Darstellungen unten
   kennen nur noch dieses Format — eine neue Quelle anzuschliessen
   heisst, eine weitere lade-Funktion zu schreiben, sonst nichts.

   Schreiben ist bewusst abschaltbar (Schalter "Aenderungen
   speichern", standardmaessig AUS). Geschrieben wird nur dort,
   wo es auch Spalten gibt:

     service_entries     datum_von / datum_bis   (+ work_log wandert mit)
     tasks               start_date / end_date
     rental_agreements   data.miete.beginn / .ende   (im JSONB)

   NICHT schreibbar, weil es die Spalten nicht gibt:
     subtasks        (nur title/status/created_at)
   Diese erscheinen deshalb gesperrt bzw. in der Ungeplant-Leiste.
   ========================================================= */
(function () {
    'use strict';

    // ------------------------------------------------------------------
    // Stammdaten der Ansicht
    // ------------------------------------------------------------------
    /* Die Timeline zeigt bewusst nur diese drei Sorten. Wartungen, Termine,
       Werkstattaufgaben, Vorgaenge und Angebots-Erinnerungen laufen weiterhin
       im Kalender-Fenster oben rechts bzw. in der Wartungsansicht. */
    var SORTEN = {
        miete:     { label: 'Vermietung',    farbe: 'var(--tlv-miete)' },
        service:   { label: 'Serviceeinsatz', farbe: 'var(--tlv-service)' },
        aufgabe:   { label: 'Aufgabe',       farbe: 'var(--tlv-aufgabe)' }
    };
    var SORTE_QUELLE = {
        miete: 'rental_agreements', service: 'service_entries', aufgabe: 'tasks'
    };
    var QUELLEN = {
        service_entries:    { von: 'datum_von', bis: 'datum_bis', schreibbar: true },
        tasks:              { von: 'start_date', bis: 'end_date', schreibbar: true },
        rental_agreements:  { von: 'data.miete.beginn', bis: 'data.miete.ende', schreibbar: true,
                              hinweis: 'Die Daten liegen im JSONB-Feld data. Fuer Filtern und Sortieren '
                                     + 'in der Datenbank waeren echte Spalten noetig.' },
        subtasks:           { von: 'start_date', bis: 'end_date', schreibbar: true,
                              braucht: 'supabase_add_subtask_planung.sql' }
    };
    /* Standort der Maschine. Ohne Werkstatt- und Wartungsdaten bleiben nur
       zwei Zustaende uebrig: bei uns oder vermietet. */
    var ORTE = {
        hof:       { label: 'bei uns',   farbe: '#94a3b8' },
        vermietet: { label: 'vermietet', farbe: '#22c55e' }
    };
    /* Eigene Gruppe fuer alles ohne Monteur — steht in der Monteur-Ansicht
       unter dem Team und ist beim Oeffnen zugeklappt. */
    var GRP_OHNE = 'ohne Zuordnung';
    var PRESETS = {
        vermiet:   { label: 'Vermietflotte',    achse: 'maschine', sorten: ['miete'] },
        service:   { label: 'Serviceeinsätze',  achse: 'monteur',  sorten: ['service'] },
        aufgaben:  { label: 'Aufgaben',         achse: 'aufgabe',  sorten: ['aufgabe'] }
    };
    var FEIERTAGE = {
        '2026-01-01': 'Neujahr', '2026-04-03': 'Karfreitag', '2026-04-06': 'Ostermontag',
        '2026-05-01': 'Tag der Arbeit', '2026-05-14': 'Christi Himmelfahrt', '2026-05-25': 'Pfingstmontag',
        '2026-10-03': 'Tag der Deutschen Einheit', '2026-10-31': 'Reformationstag',
        '2026-12-25': '1. Weihnachtstag', '2026-12-26': '2. Weihnachtstag',
        '2027-01-01': 'Neujahr', '2027-03-26': 'Karfreitag', '2027-03-29': 'Ostermontag',
        '2027-05-01': 'Tag der Arbeit', '2027-05-06': 'Christi Himmelfahrt', '2027-05-17': 'Pfingstmontag',
        '2027-10-03': 'Tag der Deutschen Einheit', '2027-10-31': 'Reformationstag',
        '2027-12-25': '1. Weihnachtstag', '2027-12-26': '2. Weihnachtstag'
    };

    // ------------------------------------------------------------------
    // Datums-Helfer — alles laeuft auf 'YYYY-MM-DD' in Ortszeit
    // ------------------------------------------------------------------
    function heuteDatum() { var x = new Date(); x.setHours(0, 0, 0, 0); return x; }
    var HEUTE = heuteDatum();

    function key(x) {
        return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0')
             + '-' + String(x.getDate()).padStart(2, '0');
    }
    function parse(s) { var p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
    function ausDB(wert) {
        if (!wert) return null;
        var d = new Date(wert);
        if (isNaN(d.getTime())) return null;
        return key(d);
    }
    function tage(a, b) { return Math.round((parse(b) - parse(a)) / 86400000); }
    function dez(x) { return x.toLocaleDateString('de-DE'); }

    // Dauer im Seitenpanel: Wochen <-> Stunden. Eine Woche = 7 Kalendertage
    // fuer die Balkenlaenge, 40 Stunden fuer die Umrechnung (5 Werktage a 8h) —
    // reine Faustregel zur Aufwandsschaetzung, keine Kalenderrechnung.
    var STD_JE_WOCHE = 40;
    function wochenAusTagen(t) { return t / 7; }
    function tageAusWochen(w) { return Math.max(1, Math.round(w * 7)); }
    function stundenAusWochen(w) { return w * STD_JE_WOCHE; }
    function wochenAusStunden(h) { return h / STD_JE_WOCHE; }
    function fmtDe(n) {
        var s = (Math.round(n * 100) / 100).toString().replace('.', ',');
        return s;
    }
    function parseDe(s) {
        return parseFloat(String(s == null ? '' : s).trim().replace(',', '.'));
    }
    function montag(x) { var y = new Date(x); y.setDate(y.getDate() - ((y.getDay() + 6) % 7)); y.setHours(0, 0, 0, 0); return y; }
    function istFrei(x) { return x.getDay() === 0 || x.getDay() === 6 || !!FEIERTAGE[key(x)]; }
    function naechsterFreier(x) { var y = new Date(x); while (istFrei(y)) y.setDate(y.getDate() + 1); return y; }
    function kw(x) {
        var t = new Date(x); t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7));
        var e = new Date(t.getFullYear(), 0, 4);
        return 1 + Math.round(((t - e) / 86400000 - 3 + ((e.getDay() + 6) % 7)) / 7);
    }
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
        });
    }

    // ------------------------------------------------------------------
    // Zustand
    // ------------------------------------------------------------------
    var S = {
        geladen: false, laedt: false,
        achse: 'aufgabe', preset: 'aufgaben',
        anker: heuteDatum(), raster: 'tag', spalten: 14, basisSpalten: 14,
        sorten: new Set(PRESETS.aufgaben.sorten),
        suche: '', person: '', gewaehlt: null, leereZeilen: false,
        auswahl: new Set(), zu: new Set([GRP_OHNE]), aufAufg: new Set(),   /* von Hand AUFgeklappte Aufgaben */
        schreiben: true
    };
    var ITEMS = [], UNGEPLANT = [], MASCHINEN = [], MONTEURE = [], UNDO = [], KUNDEN = {};
    /* Termine und Abwesenheiten stehen bewusst NICHT in ITEMS: die Timeline
       zeigt seit dem 03.09. nur Miete, Service und Aufgaben. Gebraucht werden
       sie allein in der Uebersicht "Wer ist frei?". */
    var TERMINE = [], ABWESEND = [];
    // Steht die Tabelle `absences` schon? Erst dann gibt es das Formular.
    var ABWESEND_DA = false;
    /* Wann die Daten zuletzt aus der Datenbank kamen. Ohne das hier stand die
       Timeline auf dem Stand des ERSTEN Oeffnens: eine zwischendurch
       gespeicherte Mietvereinbarung tauchte bis zum Neuladen der Seite nicht
       auf — man sucht dann eine Maschine, die es in der Ansicht gar nicht
       geben kann. */
    var GELADEN_AM = 0;
    // 3 Minuten statt 20 s: die Timeline lädt Aufgaben, Berichte, Mieten und
    // Termine komplett — bei jedem Ansichtswechsel war das unnötiger Egress.
    // „Neu laden" holt jederzeit frisch.
    var NEULADEN_NACH = 180000;   // ms

    function sb() { return window.supabaseClient || null; }

    // ------------------------------------------------------------------
    // Laden und Normalisieren
    // ------------------------------------------------------------------
    function machineKat(m) {
        return (m.categories && m.categories.name) || m.category_name || m.category
            || m.manufacturer || 'Maschinen';
    }

    async function ladeAlles() {
        if (S.laedt) return;
        S.laedt = true;
        var buehne = document.getElementById('tlv-buehne');
        if (buehne && !S.geladen) buehne.innerHTML = '<div class="tlv-laedt">Daten werden geladen …</div>';

        ITEMS = []; UNGEPLANT = [];

        // Maschinen kommen aus der bereits geladenen Liste der App.
        MASCHINEN = (window.machineList || []).map(function (m) {
            // machine_series wiederholt oft nur `name` — dann nicht doppelt zeigen.
            var serie = (m.machine_series && m.machine_series !== m.name) ? m.machine_series : '';
            return {
                id: String(m.id),
                name: [m.manufacturer, m.name].filter(Boolean).join(' ') || ('Maschine ' + m.id),
                voll: [m.manufacturer, m.name, serie].filter(Boolean).join(' ') || ('Maschine ' + m.id),
                nr: m.serial ? '#' + m.serial : '',
                serial: m.serial || '', jahr: m.year || '',
                motor: m.motor_type || '', status: m.status || '',
                firma: m.company || m.location_company || '',
                kundenNr: m.customer_number || '',
                kundeId: m.customer_id != null ? String(m.customer_id) : null,
                ort: [m.location_zip || m.operator_zip, m.location_city || m.operator_city]
                     .filter(Boolean).join(' '),
                kat: machineKat(m),
                basis: 'hof'
            };
        }).sort(function (a, b) {
            // Nach Gruppe sortieren, sonst taucht dieselbe Kategorie-
            // Ueberschrift mehrfach auf (die Zwischenzeile bricht nur um,
            // wenn sich der Wert von Zeile zu Zeile aendert).
            return a.kat.localeCompare(b.kat, 'de') || a.name.localeCompare(b.name, 'de');
        });

        var client = sb();
        if (!client) {
            S.laedt = false;
            zeichne();
            meldung('Keine Verbindung zur Datenbank — es wird nichts angezeigt.', false);
            return;
        }

        var abfragen = [
            client.from('users').select('id, name'),
            client.from('service_entries')
                  .select('id, machine_id, title, date, datum_von, datum_bis, hours, technicians, '
                        + 'is_finalized, work_log, customer_name, contact_person, location_snapshot'),
            client.from('tasks').select('*'),
            client.from('subtasks').select('*'),
            client.from('rental_agreements').select('id, machine_id, title, data'),
            client.from('customers').select('id, name, customer_number, matchcode, city'),
            /* Nur fuer die Uebersicht "Wer ist frei?" — die Timeline selbst
               zeigt Termine und Abwesenheiten bewusst nicht (Stand 03.09.).
               `absences` gibt es erst nach supabase_add_absences.sql; fehlt
               sie, bleibt die Liste leer und alles andere laeuft weiter. */
            client.from('maintenance_events').select('*'),
            client.from('event_participants').select('event_id, user_id, user_name'),
            client.from('absences').select('*')
        ];

        var erg = await Promise.all(abfragen.map(function (p) {
            return p.then(function (r) { return r; }).catch(function (e) { return { error: e, data: null }; });
        }));

        var fehler = [];
        function daten(i, name) {
            if (erg[i] && erg[i].error) { fehler.push(name); return []; }
            return (erg[i] && erg[i].data) || [];
        }

        KUNDEN = {};
        daten(5, 'customers').forEach(function (k) {
            KUNDEN[String(k.id)] = {
                name: k.name || k.matchcode || ('Kunde ' + k.id),
                nr: k.customer_number || '', ort: k.city || ''
            };
        });

        MONTEURE = daten(0, 'users').map(function (u) {
            return { id: String(u.id), name: u.name || ('Benutzer ' + u.id), rolle: 'Team' };
        });

        ladeServiceberichte(daten(1, 'service_entries'));
        ladeAufgaben(daten(2, 'tasks'), daten(3, 'subtasks'));
        ladeMieten(daten(4, 'rental_agreements'));
        // Fehlt `absences` noch, ist das kein Fehler zum Melden — deshalb
        // steht sie nicht in der Fehlerliste (siehe unten: fehler.length).
        ladeTermine(daten(6, 'maintenance_events'), daten(7, 'event_participants'));
        ABWESEND = [];
        ABWESEND_DA = !!(erg[8] && !erg[8].error);
        if (ABWESEND_DA) ladeAbwesenheiten(erg[8].data || []);

        S.geladen = true;
        S.laedt = false;
        GELADEN_AM = Date.now();
        fuellePersonen();
        zeichne();

        if (fehler.length) {
            meldung('Diese Tabellen konnten nicht gelesen werden: ' + fehler.join(', ')
                  + ' — pruefe die Zugriffsregeln (RLS).', false);
        }
    }

    function ladeServiceberichte(rows) {
        rows.forEach(function (r) {
            var von = ausDB(r.datum_von) || ausDB(r.date);
            if (!von) return;
            var bis = ausDB(r.datum_bis) || von;
            if (bis < von) bis = von;
            var techs = Array.isArray(r.technicians) ? r.technicians : [];
            // Alle Serviceberichte laufen unter einer Sorte — Reparatur und
            // Service sind in der Tabelle nicht unterscheidbar.
            var sorte = 'service';
            ITEMS.push({
                id: 'se-' + r.id, dbId: r.id, quelle: 'service_entries', sorte: sorte,
                titel: r.title || 'Servicebericht',
                maschine: r.machine_id != null ? String(r.machine_id) : null,
                monteur: techs.length ? String(techs[0]) : null,
                von: von, bis: bis,
                std: r.hours ? Number(r.hours) : null,
                gesperrt: !!r.is_finalized,
                work_log: Array.isArray(r.work_log) ? r.work_log : null,
                // Der Bericht haelt seinen eigenen Kunden fest (location_snapshot),
                // sonst greift der Betreiber der Maschine.
                kunde: r.customer_name || ausSnapshot(r.location_snapshot) || null,
                ansprech: r.contact_person || null
            });
        });
    }

    /* Der Standort-Schnappschuss eines Serviceberichts kennt je nach Alter
       verschiedene Feldnamen — deshalb der Reihe nach probieren. */
    function ausSnapshot(s) {
        if (!s || typeof s !== 'object') return null;
        return s.company || s.firma || s.name || s.location_company || null;
    }
    function kundeText(k) {
        if (!k) return null;
        var e = KUNDEN[String(k)];
        return e ? e.name + (e.nr ? ' (' + e.nr + ')' : '') : null;
    }

    /* Termine und Wartungen aus `maintenance_events`. Personen: der Ersteller
       (`created_by_user`, bigint aus public.users) plus alle Teilnehmer.
       ACHTUNG: `maintenance_events.user_id` ist eine uuid und passt NICHT zu
       den App-Nutzern — dafuer nie verwenden. */
    function ladeTermine(rows, teilnehmer) {
        var proEvent = {};
        (teilnehmer || []).forEach(function (t) {
            if (t.user_id == null) return;
            (proEvent[String(t.event_id)] = proEvent[String(t.event_id)] || []).push(String(t.user_id));
        });
        TERMINE = [];
        (rows || []).forEach(function (e) {
            var von = ausDB(e.event_date) || ausDB(e.start_date);
            if (!von) return;
            var bis = ausDB(e.end_date) || von;
            if (bis < von) bis = von;
            var leute = proEvent[String(e.id)] || [];
            if (e.created_by_user != null) {
                var c = String(e.created_by_user);
                if (leute.indexOf(c) < 0) leute = leute.concat([c]);
            }
            if (!leute.length) return;   // ohne Person sagt der Termin nichts ueber freie Zeit
            TERMINE.push({
                id: 'ev-' + e.id, sorte: 'termin',
                titel: e.title || e.manual_machine || 'Termin',
                maschine: e.machine_id != null ? String(e.machine_id) : null,
                personen: leute, von: von, bis: bis
            });
        });
    }

    /* Abwesenheiten (Urlaub, Krank, Schulung) — Tabelle `absences`,
       supabase_add_absences.sql. */
    function ladeAbwesenheiten(rows) {
        ABWESEND = [];
        (rows || []).forEach(function (a) {
            var von = ausDB(a.von), bis = ausDB(a.bis) || von;
            if (!von) return;
            if (bis < von) bis = von;
            ABWESEND.push({
                id: 'ab-' + a.id, dbId: a.id, sorte: 'abwesend',
                titel: a.grund || 'Abwesend',
                notiz: a.notiz || '',
                personen: a.user_id != null ? [String(a.user_id)] : [],
                name: a.user_name || '', von: von, bis: bis
            });
        });
    }

    function personenAus(wert) {
        return (Array.isArray(wert) ? wert : []).map(String).filter(Boolean);
    }

    function ladeAufgaben(tasks, subtasks) {
        // Erst die Unteraufgaben nach Aufgabe sortieren, denn eine Aufgabe
        // ohne eigene Termine bekommt ihren Zeitraum aus ihren Kindern.
        var kinderProTask = {};
        subtasks.forEach(function (s) {
            (kinderProTask[s.task_id] = kinderProTask[s.task_id] || []).push({
                dbId: s.id,
                titel: s.title || 'Unteraufgabe',
                status: s.status || null,
                // Die vier Spalten gibt es erst nach supabase_add_subtask_planung.sql.
                // Vorher sind sie schlicht undefined — der Code laeuft trotzdem.
                von: ausDB(s.start_date),
                bis: ausDB(s.end_date),
                personen: personenAus(s.assigned_to)
            });
        });

        tasks.forEach(function (t) {
            /* Erledigte Aufgaben kommen gar nicht erst in die Timeline: kein
               Balken, keine Zeile — und damit auch keine Maschine bzw.
               Werkstattauftragsnummer mehr. Ihre Unteraufgaben ebenso wenig. */
            if (t.status === 'completed') return;
            var von = ausDB(t.start_date), bis = ausDB(t.end_date);
            var personen = personenAus(t.assigned_to);
            var kinder = kinderProTask[t.id] || [];
            var erledigt = kinder.filter(function (k) { return k.status === 'completed'; }).length;

            // Zeitraum der Aufgabe: eigener, sonst die Spanne ihrer Kinder.
            var abgeleitet = false;
            if (!von && !bis) {
                var mitDatum = kinder.filter(function (k) { return k.von; });
                if (mitDatum.length) {
                    abgeleitet = true;
                    von = mitDatum.reduce(function (a, k) { return !a || k.von < a ? k.von : a; }, null);
                    bis = mitDatum.reduce(function (a, k) {
                        var e = k.bis || k.von; return !a || e > a ? e : a;
                    }, null);
                }
            }

            /* Weder eigene noch abgeleitete Termine: die Aufgabe legt sich
               vorlaeufig auf ihren Erstellungstag. So steht sie sofort in der
               Timeline und laesst sich mit der Maus dorthin ziehen, wo sie
               hingehoert — frueher landete sie in der Leiste darunter und
               musste erst hineingezogen werden. */
            var vorlaeufig = false;
            if (!von && !bis) {
                von = bis = ausDB(t.created_at) || key(HEUTE);
                vorlaeufig = true;
            }
            von = von || bis; bis = bis || von;
            if (bis < von) bis = von;

            var aufgabe = {
                id: 'ta-' + t.id, dbId: t.id, quelle: 'tasks', sorte: 'aufgabe',
                titel: t.title || 'Aufgabe',
                // Aufgaben hängen an einer Maschine ODER an einer
                // Werkstattauftragsnummer (Auftrag ohne Maschinenbezug).
                maschine: t.machine_id != null ? String(t.machine_id) : null,
                werkstattNr: t.workshop_order_number || null,
                personen: personen, monteur: personen[0] || null,
                von: von, bis: bis, status: t.status || null,
                gesperrt: t.status === 'completed',
                klammer: abgeleitet,           // Zeitraum kommt aus den Kindern
                vorlaeufig: vorlaeufig,        // liegt nur auf dem Erstellungstag
                anzKinder: kinder.length, anzErledigt: erledigt,
                // Abhaengigkeiten: Liste von tasks.id, von denen diese Aufgabe
                // abhaengt (supabase_add_task_dependencies.sql). Nur auf
                // Aufgaben-Ebene, nicht auf Unteraufgaben — sonst wird die
                // Pflege schnell unuebersichtlich.
                abhaengigVon: Array.isArray(t.depends_on) ? t.depends_on.map(String) : []
            };
            ITEMS.push(aufgabe);

            kinder.forEach(function (k) {
                var kVon = k.von, kBis = k.bis || k.von;
                var ohneDatum = !kVon;
                if (ohneDatum) { kVon = aufgabe.von; kBis = aufgabe.bis; }
                if (kBis < kVon) kBis = kVon;
                ITEMS.push({
                    id: 'st-' + k.dbId, dbId: k.dbId, quelle: 'subtasks', sorte: 'aufgabe',
                    titel: k.titel, eltern: aufgabe.id,
                    // Maschine/Auftragsnummer erbt die Unteraufgabe von ihrer Aufgabe.
                    maschine: aufgabe.maschine, werkstattNr: aufgabe.werkstattNr,
                    personen: k.personen.length ? k.personen : [],
                    monteur: k.personen[0] || null,
                    von: kVon, bis: kBis,
                    status: k.status || null,
                    ohneDatum: ohneDatum,
                    gesperrt: k.status === 'completed'
                });
            });
        });
    }

    function ladeMieten(rows) {
        rows.forEach(function (r) {
            var dat = r.data || {}, miete = dat.miete || {}, mieter = dat.mieter || {};
            var von = ausDB(miete.beginn), bis = ausDB(miete.ende) || von;
            /* Ohne Mietbeginn verschwand die Vereinbarung frueher spurlos —
               die Maschine stand dann trotz gespeicherter Mietvereinbarung
               gar nicht in der Vermietflotte. Jetzt legt sie sich vorlaeufig
               auf heute (wie eine Aufgabe ohne Termin) und laesst sich an die
               richtige Stelle ziehen. `vorlaeufig` sorgt dafuer, dass sie die
               Maschine nicht faelschlich als „vermietet" markiert. */
            var vorlaeufig = false;
            if (!von) { von = bis = key(HEUTE); vorlaeufig = true; }
            if (!bis) bis = von;
            if (bis < von) bis = von;
            var satz = parseFloat(String(miete.tagessatz || '').replace(',', '.'));
            ITEMS.push({
                id: 'ra-' + r.id, dbId: r.id, quelle: 'rental_agreements', sorte: 'miete',
                titel: mieter.name || r.title || 'Vermietung',
                maschine: r.machine_id != null ? String(r.machine_id) : null,
                von: von, bis: bis, vorlaeufig: vorlaeufig,
                preis: isNaN(satz) ? null : satz,
                kunde: mieter.name || kundeText(mieter.customer_id) || null,
                einsatzort: mieter.einsatzort || null,
                status: bis < key(HEUTE) ? 'zurueck' : (von > key(HEUTE) ? 'reserviert' : 'draussen')
            });
        });
    }

    // ------------------------------------------------------------------
    // Nachschlagen / Ableitungen
    // ------------------------------------------------------------------
    function maschine(id) { for (var i = 0; i < MASCHINEN.length; i++) if (MASCHINEN[i].id === id) return MASCHINEN[i]; return null; }
    function monteur(id) { for (var i = 0; i < MONTEURE.length; i++) if (MONTEURE[i].id === id) return MONTEURE[i]; return null; }
    function eintrag(id) { for (var i = 0; i < ITEMS.length; i++) if (ITEMS[i].id === id) return ITEMS[i]; return null; }
    /* Eine Miete ohne eingetragenen Zeitraum liegt nur vorlaeufig auf heute —
       sie darf die Maschine nicht als belegt/vermietet ausweisen. */
    function blockt(i) { return i.sorte === 'miete' && !i.vorlaeufig; }
    function belegtSorte(i) { return i.sorte === 'miete'; }
    function schreibbar(i) {
        var q = QUELLEN[i.quelle];
        return !!(q && q.schreibbar) && !i.gesperrt && !i.ohneDatum;
    }
    /* Wie schreibbar(), aber ohne die Bedingung „hat schon einen Termin“ —
       genau dafuer wird beim Aufziehen ja erst einer gesetzt. */
    function schreibbarRoh(i) {
        var q = QUELLEN[i.quelle];
        return !!(q && q.schreibbar) && !i.gesperrt;
    }

    function standort(mid, x) {
        var s = 'hof';
        ITEMS.forEach(function (i) {
            if (i.maschine !== mid) return;
            if (!(parse(i.von) <= x && x <= parse(i.bis))) return;
            if (blockt(i)) s = 'vermietet';
        });
        return s;
    }
    function gehoertZu(i, pid) {
        if (!pid) return true;
        if (i.personen && i.personen.length) return i.personen.indexOf(pid) >= 0;
        return i.monteur === pid;
    }
    function sichtbar() {
        return ITEMS.filter(function (i) {
            return S.sorten.has(i.sorte) && gehoertZu(i, S.person);
        });
    }
    function trifft(i) {
        if (!S.suche) return null;
        var m = maschine(i.maschine), p = monteur(i.monteur);
        var txt = [i.titel, m && m.name, m && m.nr, p && p.name, i.status]
                  .filter(Boolean).join(' ').toLowerCase();
        return txt.indexOf(S.suche.toLowerCase()) >= 0;
    }
    function konflikte(list) {
        var k = {}, proM = {};
        list.forEach(function (i) {
            if (!i.maschine || !belegtSorte(i)) return;
            (proM[i.maschine] = proM[i.maschine] || []).push(i);
        });
        Object.keys(proM).forEach(function (mid) {
            var arr = proM[mid].slice().sort(function (a, b) { return a.von < b.von ? -1 : 1; });
            for (var a = 0; a < arr.length; a++) for (var b = a + 1; b < arr.length; b++)
                if (arr[b].von <= arr[a].bis) { k[arr[a].id] = 1; k[arr[b].id] = 1; }
        });
        return k;
    }

    /* Aufgaben mit Abhaengigkeit, deren eigener Start noch vor dem Ende der
       Aufgabe liegt, von der sie abhaengen — dieselbe gelbe "warnung"-Optik
       wie bei doppelt belegten Maschinen (konflikte()), nur ohne die Buchung
       zu blockieren. Rein visuell, es wird nichts automatisch verschoben. */
    function abhaengigkeitsWarnungen(list) {
        var w = {};
        list.forEach(function (i) {
            if (i.quelle !== 'tasks' || !i.abhaengigVon || !i.abhaengigVon.length) return;
            i.abhaengigVon.forEach(function (depId) {
                var dep = eintrag('ta-' + depId);
                if (dep && i.von < dep.bis) w[i.id] = 1;
            });
        });
        return w;
    }

    function schritt() { return S.raster === 'woche' ? 7 : 1; }
    function fensterStart() {
        var s;
        if (S.raster === 'woche') { s = montag(S.anker); s.setDate(s.getDate() - 14); }
        else { s = new Date(S.anker); s.setDate(s.getDate() - 7); s.setHours(0, 0, 0, 0); }
        return s;
    }
    function spalteVon(datum, start) {
        return Math.floor((parse(datum) - start) / 86400000 / schritt());
    }

    // ------------------------------------------------------------------
    // Meldung + Rueckgaengig
    // ------------------------------------------------------------------
    function toastEl() {
        var t = document.getElementById('tlv-toast');
        if (!t) {
            t = document.createElement('div');
            t.id = 'tlv-toast';
            // Bewusst wortkarg: beim Planen zaehlt nur die eine Frage.
            t.innerHTML = '<span id="tlv-toast-text"></span>'
                        + '<button id="tlv-toast-undo">Rückgängig?</button>';
            document.body.appendChild(t);
            t.querySelector('#tlv-toast-undo').onclick = function () {
                t.classList.remove('an'); rueckgaengig();
            };
        }
        return t;
    }
    function meldung(text, mitUndo) {
        var t = toastEl();
        var mit = mitUndo !== false;
        // Mit Rueckgaengig-Knopf steht nur der Knopf da — was gerade passiert
        // ist, sieht man in der Timeline. Ohne Knopf traegt der Text die
        // ganze Meldung (z. B. "lässt sich nicht einplanen").
        t.querySelector('#tlv-toast-text').textContent = mit ? '' : text;
        t.querySelector('#tlv-toast-text').style.display = mit ? 'none' : '';
        t.querySelector('#tlv-toast-undo').style.display = mit ? '' : 'none';
        t.title = mit ? text : '';
        t.classList.toggle('knapp', mit);
        t.classList.add('an');
        clearTimeout(t._t);
        t._t = setTimeout(function () { t.classList.remove('an'); }, 7000);
    }
    function schnappschuss(items) {
        return items.map(function (i) {
            return {
                id: i.id, von: i.von, bis: i.bis, maschine: i.maschine, monteur: i.monteur,
                work_log: i.work_log ? JSON.parse(JSON.stringify(i.work_log)) : null
            };
        });
    }
    function rueckgaengig() {
        var u = UNDO.pop();
        if (!u) { meldung('Nichts mehr rückgängig zu machen.', false); return; }
        var betroffen = [];
        if (u.entfernen) {
            // Ein Einplanen zuruecknehmen: Eintrag zurueck in die Leiste und,
            // falls schon geschrieben, die Termine wieder leeren.
            var weg = eintrag(u.entfernen);
            ITEMS = ITEMS.filter(function (i) { return i.id !== u.entfernen; });
            if (u.zurueck) UNGEPLANT.push(u.zurueck);
            if (S.schreiben && weg && weg.quelle === 'tasks' && sb()) {
                sb().from('tasks').update({ start_date: null, end_date: null }).eq('id', weg.dbId)
                    .then(function (r) { if (r && r.error) console.error('[timeline]', r.error); });
            }
            meldung(u.text + ' — zurückgenommen', false);
            zeichne();
            return;
        }
        u.stand.forEach(function (s) {
            var it = eintrag(s.id); if (!it) return;
            it.von = s.von; it.bis = s.bis; it.maschine = s.maschine; it.monteur = s.monteur;
            if (s.work_log) it.work_log = s.work_log;
            betroffen.push(it);
        });
        meldung(u.text + ' — zurückgenommen', false);
        if (S.schreiben) betroffen.forEach(speichern);
        zeichne();
    }

    // ------------------------------------------------------------------
    // Speichern — nur bei eingeschaltetem Schalter
    // ------------------------------------------------------------------
    async function speichern(it) {
        if (!S.schreiben) return;
        var client = sb();
        if (!client || !schreibbar(it)) return;
        try {
            if (it.quelle === 'service_entries') {
                var nutz = { datum_von: it.von, datum_bis: it.bis };
                if (it.work_log) nutz.work_log = it.work_log;
                await pruefe(client.from('service_entries').update(nutz).eq('id', it.dbId));

            } else if (it.quelle === 'tasks' || it.quelle === 'subtasks') {
                var f = { start_date: it.von, end_date: it.bis };
                // Personen nur schreiben, wenn sie sich geaendert haben —
                // sonst wuerde jedes Verschieben die Zuordnung mit anfassen.
                if (it.personenGeaendert) {
                    f.assigned_to = (it.personen || []).map(Number).filter(function (x) { return !isNaN(x); });
                    it.personenGeaendert = false;
                }
                await pruefe(client.from(it.quelle).update(f).eq('id', it.dbId));

            } else if (it.quelle === 'rental_agreements') {
                // Die Termine liegen im JSONB — deshalb lesen, aendern, schreiben.
                var res = await client.from('rental_agreements').select('data').eq('id', it.dbId).single();
                if (res.error) throw res.error;
                var dat = res.data.data || {};
                dat.miete = dat.miete || {};
                dat.miete.beginn = it.von;
                dat.miete.ende = it.bis;
                await pruefe(client.from('rental_agreements').update({ data: dat }).eq('id', it.dbId));
            }
        } catch (e) {
            console.error('[timeline] Speichern fehlgeschlagen', e);
            meldung('Nicht gespeichert: ' + (e && e.message ? e.message : 'unbekannter Fehler')
                  + ' — mit Rückgängig zurücksetzen.', true);
        }
    }
    async function pruefe(p) { var r = await p; if (r && r.error) throw r.error; return r; }

    // ------------------------------------------------------------------
    // Abhaengigkeiten (Aufgabe A muss vor Aufgabe B fertig sein)
    // ------------------------------------------------------------------
    async function speichernAbhaengigkeiten(it) {
        var client = sb();
        if (!client) return;
        try {
            await pruefe(client.from('tasks').update({ depends_on: it.abhaengigVon }).eq('id', it.dbId));
        } catch (e) {
            console.error('[timeline] Abhängigkeit nicht gespeichert', e);
            meldung('Spalte depends_on fehlt noch — bitte '
                + 'supabase_add_task_dependencies.sql ausführen.', false);
        }
    }
    function abhaengigkeitHinzufuegen(it, depId) {
        depId = String(depId);
        if (depId === String(it.dbId)) return;
        it.abhaengigVon = it.abhaengigVon || [];
        if (it.abhaengigVon.indexOf(depId) >= 0) return;
        it.abhaengigVon = it.abhaengigVon.concat([depId]);
        speichernAbhaengigkeiten(it);
        zeichne();
    }
    function abhaengigkeitEntfernen(it, depId) {
        depId = String(depId);
        it.abhaengigVon = (it.abhaengigVon || []).filter(function (x) { return x !== depId; });
        speichernAbhaengigkeiten(it);
        zeichne();
    }

    // ------------------------------------------------------------------
    // Zeichnen
    // ------------------------------------------------------------------
    /* Liegt der Eintrag im sichtbaren Zeitraum? Ein Balken zaehlt auch dann,
       wenn er nur hineinragt — sonst verschwaende eine laufende Vermietung. */
    function imFenster(i, vonK, bisK) { return !(i.bis < vonK || i.von > bisK); }

    /* Zweite Zeile der Beschriftung in der Aufgaben-Achse: woran haengt die
       Aufgabe (Maschine oder Werkstattauftrag) und wer macht sie. Der Titel
       allein sagt oft nicht, um welche Maschine es geht. */
    function zweiteZeile(i, nurPerson) {
        var teile = [];
        if (!nurPerson) {
            var m = maschine(i.maschine);
            if (m) teile.push(m.name + (m.nr ? ' ' + m.nr : ''));
            else if (i.werkstattNr) teile.push('WA ' + i.werkstattNr);
        }
        var leute = (i.personen && i.personen.length)
            ? i.personen.map(function (p) { return (monteur(p) || {}).name || p; })
            : (i.monteur ? [(monteur(i.monteur) || {}).name || i.monteur] : []);
        if (leute.length) teile.push(leute.join(', '));
        return esc(teile.join(' · '));
    }

    /* Eigene Farbe je Zeile. Der Farbstreifen links macht auf einen Blick
       klar, welche Balken zusammengehoeren — bei zwoelf Aufgaben untereinander
       sagt eine einheitlich tuerkise Reihe nichts mehr aus.
       Der Farbton haengt am Schluessel (Aufgabe, Maschine, Person) und ist
       deshalb stabil: dieselbe Aufgabe hat morgen dieselbe Farbe.
       Der goldene Winkel (137,5°) verteilt aufeinanderfolgende Farbtoene
       moeglichst weit auseinander. */
    function farbeVon(schluessel) {
        var s = String(schluessel || ''), h = 0;
        for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 100000;
        return 'hsl(' + Math.round((h * 137.508) % 360) + ' 62% 58%)';
    }

    /* Ein Kalenderwochen-Feld im Kopf, ueber seine Tage gespannt. Es kann am
       Rand angeschnitten sein — dann steht die KW trotzdem darueber. */
    function kwBlock(b) {
        var heute = kw(HEUTE) === b.kw && HEUTE.getFullYear() === b.erste.getFullYear();
        return '<div class="tlv-kw' + (heute ? ' heute' : '') + '"'
             + ' style="width:calc(var(--tlv-day-w)*' + b.n + ')">'
             + '<span>KW ' + b.kw + '</span></div>';
    }

    /* Der Zeitraum-Filter oben zeigt immer das, was gerade wirklich zu sehen
       ist. Wird das Fenster mit "›" oder beim Ziehen verbreitert, passt keine
       der festen Auswahlen mehr — dann bekommt das Menue einen zusaetzlichen
       Eintrag ("5 Wochen"), der laufend nachgefuehrt wird. */
    function spanneLabel(tageGesamt) {
        if (tageGesamt % 7 === 0) {
            var w = tageGesamt / 7;
            return w === 1 ? '1 Woche' : w + ' Wochen';
        }
        return tageGesamt + (tageGesamt === 1 ? ' Tag' : ' Tage');
    }
    var SPANNE_TAGE = { t14: 14, t28: 28, t56: 56, w13: 91 };
    function spanneAnzeigen(tageGesamt) {
        var sel = document.getElementById('tlv-spanne');
        if (!sel) return;
        var fest = null;
        Object.keys(SPANNE_TAGE).forEach(function (k) {
            if (SPANNE_TAGE[k] === tageGesamt) fest = k;
        });
        var eigen = sel.querySelector('option[value="__akt"]');
        if (fest) {
            if (eigen) eigen.remove();
            sel.value = fest;
            return;
        }
        if (!eigen) {
            eigen = document.createElement('option');
            eigen.value = '__akt';
            sel.appendChild(eigen);
        }
        eigen.textContent = spanneLabel(tageGesamt);
        sel.value = '__akt';
    }

    /* Kurzinfo fuer den Tooltip. Bewusst das native title-Attribut: es steht
       zuverlaessig ueber allem, folgt der Maus und kostet kein Layout. */
    function wochentag(k) {
        return ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][parse(k).getDay()];
    }
    function zeitraumText(i) {
        var d = tage(i.von, i.bis) + 1;
        var s = wochentag(i.von) + ' ' + dez(parse(i.von));
        if (i.von !== i.bis) s += ' – ' + wochentag(i.bis) + ' ' + dez(parse(i.bis));
        return s + '  (' + d + (d === 1 ? ' Tag)' : ' Tage)');
    }
    /* Tag als "02.09." — kurz genug, um auf einen Balken zu passen. */
    function tagKurz(k) {
        var d = parse(k);
        return String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.';
    }
    /* Dauer als "5 T" bzw. ab einer Woche zusaetzlich in Wochen:
       "14 T / 2 W", "10 T / 1,4 W". */
    function dauerKurz(d) {
        if (d < 7) return d + ' T';
        var w = Math.round(d / 7 * 10) / 10;
        return d + ' T / ' + String(w).replace('.', ',') + ' W';
    }
    /* Beschriftung auf dem Balken: Zeitraum statt der frueheren Personenzahl. */
    function balkenZeitraum(i) {
        var s = 'Zeitraum: ' + tagKurz(i.von);
        if (i.von !== i.bis) s += ' – ' + tagKurz(i.bis);
        return s + ' · ' + dauerKurz(tage(i.von, i.bis) + 1);
    }
    function relativText(i) {
        var h = key(HEUTE);
        if (i.bis < h) return 'vorbei seit ' + tage(i.bis, h) + ' Tagen';
        if (i.von > h) return 'beginnt in ' + tage(h, i.von) + ' Tagen';
        return 'läuft — noch ' + (tage(h, i.bis) + 1) + ' Tage';
    }
    function kurzinfo(i) {
        var z = [SORTEN[i.sorte].label.toUpperCase() + ' · ' + i.titel, ''];
        if (i.ohneDatum) {
            z.push('Noch kein eigener Termin.');
            z.push('Auf die Spur drücken und nach rechts ziehen.');
        } else {
            z.push(zeitraumText(i));
            z.push(relativText(i));
            if (i.vorlaeufig) z.push('⚠ liegt nur vorläufig auf dem Erstellungstag');
        }
        var m = maschine(i.maschine);
        if (m) z.push('Maschine: ' + m.name + (m.nr ? ' ' + m.nr : ''));
        else if (i.werkstattNr) z.push('Werkstattauftrag: ' + i.werkstattNr);
        var kunde = i.kunde || (m && m.firma);
        if (kunde) z.push('Kunde: ' + kunde);
        if (i.ansprech) z.push('Ansprechpartner: ' + i.ansprech);
        if (i.einsatzort) z.push('Einsatzort: ' + i.einsatzort);
        var leute = (i.personen && i.personen.length)
            ? i.personen.map(function (p) { return (monteur(p) || {}).name || p; })
            : (i.monteur ? [(monteur(i.monteur) || {}).name || i.monteur] : []);
        if (leute.length) z.push((leute.length > 1 ? 'Personen: ' : 'Person: ') + leute.join(', '));
        if (i.std) z.push('Arbeitszeit: ' + i.std + ' h');
        if (i.preis) z.push('Miete: ' + i.preis.toLocaleString('de-DE') + ' €/Tag · '
            + (i.preis * (tage(i.von, i.bis) + 1)).toLocaleString('de-DE') + ' € gesamt');
        if (i.anzKinder) z.push('Unteraufgaben: ' + i.anzErledigt + ' von ' + i.anzKinder + ' erledigt');
        if (i.klammer) z.push('Zeitraum aus den Unteraufgaben abgeleitet');
        if (i.status) z.push('Status: ' + statusText(i));
        if (i.gesperrt) z.push('🔒 abgeschlossen — wird nicht verschoben');
        z.push('');
        z.push(i.gesperrt ? 'Klicken für alle Details.'
                          : 'Klicken für alle Details · Ziehen verschiebt · Kante verlängert');
        return z.join('\n');
    }
    /* Der Mietstatus steht in der Datenbank als Kuerzel — hier ausgeschrieben. */
    function statusText(i) {
        var t = { draussen: 'vermietet, draußen', reserviert: 'reserviert',
                  zurueck: 'zurück', completed: 'erledigt', open: 'offen' };
        return t[i.status] || i.status;
    }

    /* Zweite Zeile unter dem Aufgabentitel: woran haengt die Aufgabe?
       Maschine in Gruen; ohne Maschine die Werkstattauftragsnummer. */
    function maschineZeile(i) {
        var m = maschine(i.maschine);
        if (m) return '<span class="maschine">' + esc(m.name + (m.nr ? ' ' + m.nr : '')) + '</span>';
        if (i.werkstattNr) return '<span class="maschine wa">WA ' + esc(i.werkstattNr) + '</span>';
        return '';
    }

    /* Zweite Zeile "Zuständig: …" auf dem Aufgabenbalken — mehr als Titel und
       Zustaendige steht dort bewusst nicht. */
    function verantwortlichZeile(i) {
        var leute = (i.personen && i.personen.length)
            ? i.personen.map(function (p) { return (monteur(p) || {}).name || p; })
            : (i.monteur ? [(monteur(i.monteur) || {}).name || i.monteur] : []);
        return leute.length ? 'Zuständig: ' + esc(leute.join(', ')) : '';
    }

    function zeilenBauen(list, vonK, bisK) {
        // Nur Zeilen zeigen, in denen im gewaehlten Zeitraum wirklich etwas
        // ansteht. Sonst stehen bei 61 Maschinen 55 leere Zeilen im Weg.
        function nurImFenster(arr) {
            return arr.filter(function (i) { return imFenster(i, vonK, bisK); });
        }
        function behalten(z) { return S.leereZeilen || z.items.length; }

        if (S.achse === 'maschine') {
            var mZeilen = MASCHINEN.map(function (m) {
                var o = ORTE[standort(m.id, HEUTE)];
                return {
                    schluessel: m.id, grp: m.kat, band: true, zuweisung: 'maschine',
                    rc: farbeVon('m' + m.id),
                    n: esc(m.name),
                    m: '<span class="ort"><i style="background:' + o.farbe + '"></i>' + o.label + '</span>'
                       + (m.nr ? ' · ' + esc(m.nr) : ''),
                    items: nurImFenster(list.filter(function (i) { return i.maschine === m.id; }))
                };
            }).filter(behalten);
            /* Eintraege ohne Maschine (z. B. eine Mietvereinbarung, in der
               keine Maschine hinterlegt ist) hatten hier keine Zeile und
               fielen stillschweigend unter den Tisch — man sucht dann in der
               Vermietflotte nach einer Maschine, die gar nicht verknuepft
               ist. Jetzt stehen sie sichtbar am Ende. */
            var ohneM = nurImFenster(list.filter(function (i) { return !i.maschine; }));
            if (ohneM.length) mZeilen.push({
                schluessel: '', grp: 'ohne Maschine', zuweisung: null,
                n: 'ohne Maschine', m: 'keine Maschine hinterlegt', items: ohneM
            });
            return mZeilen;
        }
        if (S.achse === 'monteur') {
            var zeilen = MONTEURE.map(function (p) {
                return {
                    schluessel: p.id, grp: 'Team', zuweisung: 'monteur', n: esc(p.name), m: '',
                    rc: farbeVon('p' + p.id),
                    // Mehrfachzuordnung: eine Unteraufgabe mit zwei Personen
                    // erscheint in beiden Zeilen.
                    items: nurImFenster(list.filter(function (i) {
                        return (i.personen && i.personen.length)
                            ? i.personen.indexOf(p.id) >= 0
                            : i.monteur === p.id;
                    }))
                };
            }).filter(behalten);
            var ohne = nurImFenster(list.filter(function (i) {
                return !i.monteur && !(i.personen && i.personen.length);
            }));
            // Eigene Gruppe statt einer Zeile unter „Team": nur so laesst sie
            // sich zuklappen — und das ist die Vorgabe (S.zu, siehe Zustand),
            // weil das Unverplante die Monteurszeilen sonst zudeckt.
            if (ohne.length) zeilen.push({ schluessel: '', grp: GRP_OHNE, zuweisung: null,
                n: 'ohne Zuordnung', m: '', items: ohne });
            return zeilen;
        }

        var out = [];
        // In der Aufgaben-Achse steht JEDE Aufgabe — auch die, die gerade
        // ausserhalb des Zeitraums liegt, und auch die ganz ohne Termin.
        // So kann man sich alles an Ort und Stelle zurechtschieben, statt
        // erst den passenden Zeitraum suchen zu muessen.
        list.filter(function (i) {
            return i.quelle === 'tasks';
        }).forEach(function (t) {
            var kinder = ITEMS.filter(function (k) { return k.eltern === t.id; });
            // Vorgabe: ZUgeklappt — die Ansicht zeigt erst einmal nur die
            // Aufgaben selbst. S.aufAufg haelt deshalb die von Hand
            // AUFgeklappten Aufgaben.
            var zu = !S.aufAufg.has(t.id);
            // Auf dem Balken selbst steht der Titel und darunter genau eine
            // Zeile "Zuständig: …" — mehr nicht, sonst wird der Strich
            // unruhig. Die Zusatzzeile laesst den Balken (und seine Zeile)
            // etwas wachsen, siehe .tlv-bar.mit-zusatz im CSS.
            var elternZusatz = [];
            var elternM = maschineZeile(t);
            var resp = verantwortlichZeile(t);
            if (resp) elternZusatz.push(resp);
            /* Links steht die Maschine im Vordergrund, nicht der Aufgabentitel:
               beim Planen ist "um welche Maschine geht es" die erste Frage.
                 • Maschine hinterlegt → grün und groß, Seriennummer fett;
                   der Aufgabentitel entfällt dann ganz.
                 • Nur eine Werkstattauftragsnummer → "WA <Nr>" in Bernstein,
                   dahinter groß der Titel.
                 • Weder noch → wie bisher der Titel. */
            var mObj = maschine(t.maschine);
            var kopfN, kopfM;
            if (mObj) {
                kopfN = '<span class="maschine">' + esc(mObj.name)
                      + (mObj.nr ? ' <b class="nr">' + esc(mObj.nr) + '</b>' : '')
                      + (mObj.jahr ? ' <b class="nr">(' + esc(mObj.jahr) + ')</b>' : '')
                      + '</span>';
                kopfM = '';
            } else if (t.werkstattNr) {
                kopfN = '<span class="maschine wa">WA <b class="nr">'
                      + esc(t.werkstattNr) + '</b></span> ' + esc(t.titel);
                kopfM = '';
            } else {
                kopfN = esc(t.titel);
                kopfM = elternM;
            }
            out.push({
                schluessel: t.id, grp: 'Aufgaben', zuweisung: null, n: kopfN,
                rc: farbeVon(t.id),
                m: kopfM, items: [t], eltern: true,
                zusatz: elternZusatz,
                klapp: kinder.length ? { id: t.id, zu: zu, anz: kinder.length } : null
            });
            if (!zu) {
                var kindZeile = function (k) {
                    var kM = maschineZeile(k);
                    out.push({ schluessel: k.id, grp: 'Aufgaben', zuweisung: null, kind: true,
                        // Unteraufgabe: gleiche Farbe wie ihre Aufgabe.
                        rc: farbeVon(t.id),
                        // Unteraufgaben zeigen die Maschine im Label bewusst nicht
                        // (sie hat sie ja von der Aufgabe geerbt) — auf dem Balken
                        // steht sie trotzdem, damit man sie ohne Hochscrollen sieht.
                        n: esc(k.titel), m: '', zusatz: kM ? [kM] : [],
                        items: [k] });
                };
                /* Aufgeklappt stehen erst die offenen Unteraufgaben da. Die
                   erledigten liegen darunter hinter einer eigenen Zeile
                   „Erledigt" mit Pfeil — sonst deckt fertige Arbeit die
                   laufende zu. Eigener Klapp-Schluessel 'erl:<id>' im selben
                   Merker S.aufAufg. */
                var offeneK = kinder.filter(function (k) { return k.status !== 'completed'; });
                var erlK = kinder.filter(function (k) { return k.status === 'completed'; });
                offeneK.forEach(kindZeile);
                if (erlK.length) {
                    var erlZu = !S.aufAufg.has('erl:' + t.id);
                    out.push({ schluessel: '', grp: 'Aufgaben', zuweisung: null, kind: true,
                        rc: farbeVon(t.id), n: 'Erledigt', m: '', items: [],
                        erlKopf: true,
                        klapp: { id: 'erl:' + t.id, zu: erlZu, anz: erlK.length } });
                    if (!erlZu) erlK.forEach(kindZeile);
                }
                // Die Verbindungslinie endet beim letzten Kind auf halber
                // Hoehe — daran sieht man, wo der Block aufhoert.
                var letzte = out[out.length - 1];
                if (letzte && letzte.kind) letzte.letztes = true;
            }
        });

        // Aufgaben ohne jeden Termin bekommen eine leere Zeile. Ihre Karte
        // steht unter der Timeline und wird in genau diese Zeile gezogen —
        // damit ist auch das Ungeplante immer sichtbar und einplanbar.
        UNGEPLANT.forEach(function (u) {
            if (u.quelle !== 'tasks') return;
            if (S.person && !gehoertZu(u, S.person)) return;
            out.push({
                schluessel: u.id, grp: 'Aufgaben', zuweisung: null,
                n: esc(u.titel),
                m: [zweiteZeile(u), 'ohne Termin'].filter(Boolean).join(' · '),
                items: [], ohneTermin: true
            });
        });
        return out;
    }

    function auswertung(z, start, tageGesamt) {
        var el = document.getElementById('timeline');
        if (!el || !el.classList.contains('tlv-mit-summe')) return '';
        var ende = new Date(start); ende.setDate(ende.getDate() + tageGesamt - 1);
        var vonK = key(start), bisK = key(ende);
        if (S.achse === 'maschine') {
            var belegtTage = 0, umsatz = 0;
            z.items.forEach(function (i) {
                if (!blockt(i)) return;
                var a = i.von > vonK ? i.von : vonK, b = i.bis < bisK ? i.bis : bisK;
                if (a > b) return;
                var t = tage(a, b) + 1;
                belegtTage += t;
                if (i.sorte === 'miete' && i.preis) umsatz += i.preis * t;
            });
            var q = Math.min(100, Math.round(belegtTage / tageGesamt * 100));
            return '<b>' + q + ' % belegt</b><u>' + belegtTage + ' von ' + tageGesamt + ' Tagen</u>'
                 + (umsatz ? '<b>' + umsatz.toLocaleString('de-DE') + ' €</b>' : '');
        }
        var std = 0;
        z.items.forEach(function (i) {
            if (!i.std) return;
            var a = i.von > vonK ? i.von : vonK, b = i.bis < bisK ? i.bis : bisK;
            if (a > b) return;
            std += i.std / (tage(i.von, i.bis) + 1) * (tage(a, b) + 1);
        });
        return '<b>' + Math.round(std) + ' h</b><u>im Zeitraum</u>';
    }

    function zeichne() {
        var buehne = document.getElementById('tlv-buehne');
        if (!buehne) return;

        var wurzel = document.getElementById('timeline');
        presetAbgleichen();
        filterZahlAbgleichen();

        if (!S.geladen) { buehne.innerHTML = '<div class="tlv-laedt">Daten werden geladen …</div>'; return; }

        var start = fensterStart(), n = S.spalten, sw = schritt();
        var ende = new Date(start); ende.setDate(ende.getDate() + n * sw - 1);

        /* Beginnt ein Eintrag im Fenster, reicht aber ueber sein Ende hinaus
           (laengere Vermietung, Aufgabe mit spaeterem Ende …), wird das
           Fenster automatisch verbreitert — ohne dass oben am Filter
           gedreht werden muss, siehe weiterRechts(). */
        (function () {
            var vonK0 = key(start), bisK0 = key(ende), maxBis = bisK0;
            sichtbar().forEach(function (i) {
                if (i.ohneDatum) return;
                if (i.von <= bisK0 && i.von >= vonK0 && i.bis > maxBis) maxBis = i.bis;
            });
            if (maxBis > bisK0) {
                // In runden Schuben erweitern (7 Tage bzw. 4 Wochen) statt
                // genau passend — sonst muesste bei jedem weiteren Tag, um
                // den ein Balken waechst, erneut nachgezogen werden.
                var deckel = SPALTEN_DECKEL[S.raster] || 180;
                var schrittSp = S.raster === 'woche' ? 4 : 7;
                var neu = S.spalten;
                var bisNeu = bisK0;
                while (bisNeu < maxBis && neu < deckel) {
                    neu += schrittSp;
                    var e2 = new Date(start); e2.setDate(e2.getDate() + neu * sw - 1);
                    bisNeu = key(e2);
                }
                if (neu > S.spalten) {
                    S.spalten = neu; n = S.spalten;
                    ende = new Date(start); ende.setDate(ende.getDate() + n * sw - 1);
                }
            }
        })();

        spanneAnzeigen(n * sw);

        var rangeEl = document.getElementById('tlv-range');
        if (rangeEl) rangeEl.textContent =
            start.toLocaleDateString('de-DE', { day: '2-digit', month: 'short' }) + ' – '
            + ende.toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' });

        var sp = [];
        for (var i = 0; i < n; i++) { var x = new Date(start); x.setDate(x.getDate() + i * sw); sp.push(x); }

        var list = sichtbar(), konf = konflikte(list), warn = abhaengigkeitsWarnungen(list);
        /* Kopfzeile: bei Tagesraster zwei Zeilen — oben die Kalenderwoche
           ueber ihre Tage gespannt, darunter jeder Tag mit vollem Datum
           (02.09.). Beim Wochenraster ist jede Spalte schon eine Woche. */
        var kopf = '<div class="tlv-head"><div class="tlv-corner">'
            + (S.achse === 'maschine' ? 'Maschine' : S.achse === 'monteur' ? 'Monteur' : 'Aufgabe')
            + '</div><div class="tlv-headcols">';

        if (S.raster === 'tag') {
            kopf += '<div class="tlv-kws">';
            var block = null;
            sp.forEach(function (x) {
                var w = kw(x);
                if (block && block.kw === w) { block.n++; return; }
                if (block) kopf += kwBlock(block);
                block = { kw: w, n: 1, heute: false, erste: x };
            });
            if (block) kopf += kwBlock(block);
            kopf += '</div>';
        }

        kopf += '<div class="tlv-days">';
        sp.forEach(function (x) {
            if (S.raster === 'woche') {
                var w = new Date(x); w.setDate(w.getDate() + 7);
                kopf += '<div class="tlv-day' + (x <= HEUTE && HEUTE < w ? ' heute' : '')
                     + (x.getDate() <= 7 ? ' mstart' : '') + '">KW<b>' + kw(x) + '</b></div>';
            } else {
                var f = FEIERTAGE[key(x)];
                kopf += '<div class="tlv-day' + (istFrei(x) ? ' we' : '') + (f ? ' feier' : '')
                     + (key(x) === key(HEUTE) ? ' heute' : '')
                     + (x.getDay() === 1 ? ' wstart' : '') + '"'
                     + (f ? ' title="' + esc(f) + '"' : '') + '>'
                     + '<span class="wt">'
                     + x.toLocaleDateString('de-DE', { weekday: 'short' }).slice(0, 2)
                     + '</span><b>' + String(x.getDate()).padStart(2, '0') + '.'
                     + String(x.getMonth() + 1).padStart(2, '0') + '.</b></div>';
            }
        });
        kopf += '</div></div><div class="tlv-summe-kopf">'
             + (S.achse === 'maschine' ? 'Auslastung' : 'Stunden') + '</div></div>';

        /* Trennlinien an den Montagen — sie machen die Wochen im Raster
           sichtbar, ohne dass man die Kopfzeile lesen muss. */
        var wochenLinien = S.raster === 'woche' ? '' : sp.map(function (x, ix) {
            return x.getDay() === 1 && ix > 0
                ? '<div class="tlv-wgrenze" style="left:calc(var(--tlv-day-w)*' + ix + ')"></div>' : '';
        }).join('');


        var wedivs = S.raster === 'woche' ? '' : sp.map(function (x, ix) {
            if (!istFrei(x)) return '';
            return '<div class="tlv-we' + (FEIERTAGE[key(x)] ? ' feier' : '')
                 + '" style="left:calc(var(--tlv-day-w)*' + ix + ');width:var(--tlv-day-w)"></div>';
        }).join('');
        var nowPos = (HEUTE - start) / 86400000 / sw;
        // Liegt heute ausserhalb des Fensters, leuchtet der Heute-Knopf gruen —
        // so sieht man sofort, wie man zurueckkommt.
        var heuteBtn = document.getElementById('tlv-heute');
        if (heuteBtn) heuteBtn.classList.toggle('weg', !(nowPos >= 0 && nowPos < n));
        var nowLine = (nowPos >= 0 && nowPos < n)
            ? '<div class="tlv-now" style="left:calc(var(--tlv-day-w)*'
              + (nowPos + (S.raster === 'woche' ? 0 : 0.5)) + ')"></div>' : '';

        var zeilen = zeilenBauen(list, key(start), key(ende));
        if (!zeilen.length) {
            buehne.innerHTML = '<div class="tlv-leer">In diesem Zeitraum steht nichts an. '
                + '<button type="button" class="tlv-leer-heute" onclick="window.timelineHeute()">Zurück zu heute</button> '
                + '— oder anderen Zeitraum wählen, eine andere Voreinstellung nehmen '
                + 'oder „auch leere Zeilen" einschalten.</div>';
            zeichneUngeplant();
            return;
        }

        var html = '<div class="tlv">' + kopf;

        /* Die Auslastungszeile unter dem Datumskopf (Stunden je Spalte gegen
           die Tageskapazitaet) ist auf Wunsch entfernt — sie kostete Hoehe
           und wurde nicht gebraucht. */

        var letzteGrp = null;
        zeilen.forEach(function (z) {
            if (z.grp !== letzteGrp) {
                letzteGrp = z.grp;
                html += '<div class="tlv-group" data-grp="' + esc(z.grp) + '"><span>'
                     + (S.zu.has(z.grp) ? '▸' : '▾') + ' ' + esc(z.grp) + '</span></div>';
            }
            if (S.zu.has(z.grp)) return;

            var bars = '';
            if (z.band) {
                var von0 = 0, akt = standort(z.schluessel, sp[0]);
                for (var t2 = 1; t2 <= n; t2++) {
                    var s2 = t2 < n ? standort(z.schluessel, sp[t2]) : null;
                    if (s2 !== akt) {
                        bars += '<div class="tlv-stand ' + akt + '" title="' + ORTE[akt].label
                             + '" style="left:calc(var(--tlv-day-w)*' + von0
                             + ');width:calc(var(--tlv-day-w)*' + (t2 - von0) + ')"></div>';
                        von0 = t2; akt = s2;
                    }
                }
                var bel = z.items.filter(function (i) { return blockt(i); })
                    .map(function (i) {
                        return [Math.max(0, spalteVon(i.von, start)), Math.min(n - 1, spalteVon(i.bis, start))];
                    }).sort(function (a, b) { return a[0] - b[0]; });
                var cur = 0;
                bel.forEach(function (p) {
                    if (p[0] > cur + 1) bars += luecke(cur, p[0] - 1);
                    cur = Math.max(cur, p[1] + 1);
                });
                if (cur < n - 1) bars += luecke(cur, n - 1);
            }

            // Unteraufgaben-Zeilen der Aufgaben-Achse: leerer Balken (siehe
            // unten) — dann braucht die Zeile auch keine Zusatzhöhe.
            var kindLeer = z.kind && S.achse === 'aufgabe';

            z.items.forEach(function (i) {
                var a = Math.max(0, spalteVon(i.von, start)), b = Math.min(n - 1, spalteVon(i.bis, start));
                if (b < 0 || a > n - 1) return;
                var cls = [];
                if (i.status === 'angefragt') cls.push('angefragt');
                if (konf[i.id]) cls.push('konflikt'); else if (warn[i.id]) cls.push('warnung');
                if (i.gesperrt) cls.push('gesperrt');
                if (i.ohneDatum) cls.push('ohne-datum');
                if (S.auswahl.has(i.id)) cls.push('gewaehlt');
                if (z.kind) cls.push('kind');
                var tr = trifft(i);
                if (tr === true) cls.push('treffer'); else if (tr === false) cls.push('blass');
                if (i.klammer) cls.push('klammer');
                /* Gesamtaufgabe: als flacher Sammelbalken mit Endmarken
                   zeichnen — so wie es in Ablaufplänen üblich ist. Der
                   Unterschied zur Unteraufgabe ist damit die Form, nicht
                   nur die Einrückung. */
                if (z.eltern && S.achse === 'aufgabe') cls.push('summe');
                if (i.vorlaeufig) cls.push('vorlaeufig');
                // Maschine/WA (und bei eingeklappter Aufgabe "Verantwortlich: …")
                // stehen zusaetzlich AUF dem Balken — jede Zeile laesst ihn
                // (und seine Zeile) etwas hoeher werden, siehe zeilenBauen()
                // und .tlv-bar.mit-zusatz im CSS.
                var barZusatzZeilen = (z.zusatz || []).map(function (txt) {
                    return '<span class="tlv-bar-resp">' + txt + '</span>';
                }).join('');
                /* Der Balken ist immer dreizeilig aufgebaut: Titel, darunter
                   der Zeitraum, darunter "Zuständig: …" bzw. die Maschine.
                   Deshalb waechst er in die Hoehe statt alles in eine Zeile
                   zu quetschen — die Zeilenhoehe zieht unten nach. */
                cls.push('mit-zusatz');
                var zusatz = i.preis
                    ? '<span class="s">' + (i.preis * (tage(i.von, i.bis) + 1)).toLocaleString('de-DE') + ' €</span>'
                    : (i.std ? '<span class="s">' + i.std + ' h</span>' : '');
                // Fortschritt ("4/7") nur ausserhalb der Aufgaben-Achse. Dort
                // ist der Platz auf dem Balken fuer den Titel da — der Zaehler
                // hat ihn bei kurzen Balken ganz verdraengt. Die Zahl steht
                // weiter im Kurzinfo und in den Details.
                var zaehler = (i.anzKinder && S.achse !== 'aufgabe')
                    ? '<span class="s zaehler">' + i.anzErledigt + '/' + i.anzKinder + '</span>' : '';
                // Frueher stand hier die Personenzahl ("4 Pers.") — beim Planen
                // sagt der Zeitraum mehr. Die Personen stehen weiter im
                // Kurzinfo, im Panel und (bei Aufgaben) auf der Zusatzzeile.
                var wer = '<span class="s zeitspanne">' + esc(balkenZeitraum(i)) + '</span>';
                /* Nur der Eintagesbalken hat wirklich keinen Platz — der
                   traegt seinen Text RECHTS DANEBEN (.schmal → .tlv-aussen,
                   siehe CSS). Ab zwei Tagen steht die Beschriftung wieder
                   auf dem Balken selbst, notfalls verkleinert und gekuerzt. */
                var schmal = (b - a + 1) <= 1;
                if (schmal) cls.push('schmal');
                var inhalt = '<span class="t">' + esc(i.titel) + '</span>'
                           + zaehler + zusatz + wer + barZusatzZeilen;
                if (schmal) inhalt = '<div class="tlv-aussen">' + inhalt + '</div>';
                /* Aufgeklappte Unteraufgabe: der Balken bleibt leer. Titel,
                   Zeitraum und Zuständige stehen links in der Zeile bzw. im
                   Kurzinfo — auf dem Balken war es nur Wiederholung. */
                if (kindLeer) {
                    inhalt = '';
                    cls = cls.filter(function (c) { return c !== 'mit-zusatz' && c !== 'schmal'; });
                }
                bars += '<div class="tlv-bar ' + cls.join(' ') + '" data-id="' + esc(i.id) + '"'
                     + ' title="' + esc(kurzinfo(i)) + '"'
                     // In der Aufgaben-Achse traegt der Balken die Farbe seiner
                     // Aufgabe — dort ist ohnehin alles dieselbe Sorte, und so
                     // passen Balken und Farbstreifen links zusammen.
                     + ' style="--c:' + (z.rc && S.achse === 'aufgabe' ? z.rc : SORTEN[i.sorte].farbe)
                     + ';left:calc(var(--tlv-day-w)*' + a + ' + 2px)'
                     + ';width:calc(var(--tlv-day-w)*' + (b - a + 1) + ' - 4px)">'
                     + '<div class="grip l"></div>'
                     + '<i class="punkt"></i>'
                     + (i.gesperrt ? '<span class="s">🔒</span>' : '')
                     + inhalt
                     + '<div class="grip r"></div></div>';
            });

            // Je Zusatzzeile auf dem Balken (Maschine, ggf. Verantwortlich)
            // braucht die ganze Zeile etwas mehr Hoehe — der Balken selbst
            // waechst per Flex-Umbruch von allein (siehe CSS), die Zeile
            // drumherum aber nicht von selbst, weil der Balken absolut in
            // seiner Spur positioniert ist.
            // Die Zeitraum-Zeile kommt bei jedem Balken dazu (ausser bei den
            // Eintagesbalken, die ihren Text daneben tragen).
            var zAnz = kindLeer ? 0
                     : (z.zusatz || []).length + ((z.items || []).length ? 1 : 0);
            html += '<div class="tlv-row' + (z.ohneTermin ? ' ohne-termin' : '')
                 + (z.eltern ? ' eltern' : '') + (z.kind ? ' kind' : '')
                 + (z.erlKopf ? ' erl-kopf' : '')
                 + (zAnz ? ' mit-zusatz' : '')
                 + (z.letztes ? ' letztes-kind' : '') + '" data-row="' + esc(z.schluessel) + '"'
                 + (zAnz ? ' style="min-height:calc(var(--tlv-row-h) + ' + (zAnz * 17 + 6) + 'px)"' : '')
                 + ' data-zuw="' + (z.zuweisung || '') + '">'
                 + '<div class="tlv-label' + (z.kind ? ' kind' : '')
                 + (z.rc ? ' farbig" style="--rc:' + z.rc + '' : '')
                 + '"><div class="n">'
                 + (z.klapp ? '<span class="tlv-klapp" data-klapp="' + esc(z.klapp.id) + '">'
                              + (z.klapp.zu ? '▸' : '▾') + '</span> ' : '')
                 + z.n
                 + (z.klapp ? ' <span class="tlv-anz">' + z.klapp.anz + '</span>' : '')
                 + '</div><div class="m">' + z.m + '</div></div>'
                 + '<div class="tlv-track" data-row="' + esc(z.schluessel) + '"'
                 + ' data-zuw="' + (z.zuweisung || '') + '"'
                 + ' style="width:calc(var(--tlv-day-w)*' + n + ')">'
                 + wedivs + wochenLinien + nowLine + bars + '</div>'
                 + '<div class="tlv-summe">' + auswertung(z, start, n * sw) + '</div></div>';
        });
        html += '</div>';

        buehne.innerHTML = html;
        buehneNavBinden(buehne);
        breiteVerteilen(n);
        // Ein zweiter Durchgang, nachdem ein senkrechter Rollbalken
        // aufgetaucht sein kann — sonst waere die Buehne um dessen
        // Breite zu breit berechnet.
        requestAnimationFrame(function () { breiteVerteilen(n); schriftEinpassen(); zeichneAbhaengigkeiten(); });
        zeichneUngeplant();
        // Direkt und noch einmal verzoegert: requestAnimationFrame allein
        // reicht nicht, der Browser haelt es in einem nicht sichtbaren Tab an.
        hoeheVerteilen();
        setTimeout(function () { hoeheVerteilen(); schriftEinpassen(); zeichneAbhaengigkeiten(); }, 60);
        haengeAn(start, n);
        zeichnePanel();
        zeichneAbhaengigkeiten();
    }

    /* Pfeil-Linien zwischen abhaengigen Aufgaben — nur in der Aufgaben-Achse,
       da dort jede Aufgabe genau eine Zeile hat (in "Maschine"/"Monteur"
       koennte dieselbe Aufgabe mehrfach oder gar nicht auftauchen). Rein
       optisch: gezeichnet wird ueber ein SVG-Overlay in der Bühne, es aendert
       nichts an Terminen. Gelb, wenn der Nachfolger vor dem Ende seiner
       Abhaengigkeit beginnt (siehe abhaengigkeitsWarnungen) — sonst grau. */
    function zeichneAbhaengigkeiten() {
        var buehne = document.getElementById('tlv-buehne');
        var alt = document.getElementById('tlv-dep-svg');
        if (alt) alt.remove();
        if (!buehne || S.achse !== 'aufgabe') return;

        var tlvEl = buehne.querySelector('.tlv');
        if (!tlvEl) return;

        var paare = [];
        ITEMS.forEach(function (i) {
            if (i.quelle !== 'tasks' || !i.abhaengigVon || !i.abhaengigVon.length) return;
            i.abhaengigVon.forEach(function (depId) {
                paare.push({ von: 'ta-' + depId, bis: i.id });
            });
        });
        if (!paare.length) return;

        var bref = tlvEl.getBoundingClientRect();
        var pfade = [];
        paare.forEach(function (p) {
            var a = buehne.querySelector('.tlv-bar[data-id="' + p.von + '"]');
            var b = buehne.querySelector('.tlv-bar[data-id="' + p.bis + '"]');
            if (!a || !b || !a.offsetParent || !b.offsetParent) return;
            var ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
            var x1 = ra.right - bref.left, y1 = ra.top - bref.top + ra.height / 2;
            var x2 = rb.left - bref.left, y2 = rb.top - bref.top + rb.height / 2;
            var mitte = x1 + Math.max(14, (x2 - x1) / 2);
            var dep = eintrag(p.von), ziel = eintrag(p.bis);
            var warnt = dep && ziel && ziel.von < dep.bis;
            var d = x2 >= x1
                ? 'M' + x1 + ',' + y1 + ' H' + mitte + ' V' + y2 + ' H' + x2
                // Nachfolger liegt links von seiner Abhaengigkeit (Ueberschneidung/vertauscht):
                // aussen herum statt mitten durch andere Balken.
                : 'M' + x1 + ',' + y1 + ' h10 V' + y2 + ' H' + x2;
            pfade.push('<path d="' + d + '" fill="none" stroke="' + (warnt ? '#fbbf24' : '#64748b')
                + '" stroke-width="1.5" marker-end="url(#tlv-dep-pfeil)"></path>');
        });
        if (!pfade.length) return;

        var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.id = 'tlv-dep-svg';
        svg.setAttribute('width', tlvEl.scrollWidth);
        svg.setAttribute('height', tlvEl.scrollHeight);
        svg.style.cssText = 'position:absolute; left:0; top:0; pointer-events:none; z-index:5; overflow:visible;';
        svg.innerHTML = '<defs><marker id="tlv-dep-pfeil" markerWidth="8" markerHeight="8" refX="6" refY="3"'
            + ' orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#64748b"></path></marker></defs>'
            + pfade.join('');
        tlvEl.appendChild(svg);
    }

    /* Spaltenbreite so setzen, dass der gewaehlte Zeitraum die Buehne
       ausfuellt statt bei fester Breite nur die halbe Flaeche zu nutzen.
       Alles im Markup rechnet mit var(--tlv-day-w), deshalb genuegt es,
       die Variable nach dem Zeichnen zu setzen — es fliesst von selbst um.
       Untergrenze, damit bei vielen Spalten nichts unleserlich wird; dann
       laeuft die Buehne wieder waagerecht. */
    function breiteVerteilen(n) {
        var wurzel = document.getElementById('timeline');
        var buehne = document.getElementById('tlv-buehne');
        if (!wurzel || !buehne || !n) return;

        // `#main-wrapper` ist ein Flex-Element mit min-width:auto und waechst
        // deshalb mit seinem Inhalt, statt ihn rollen zu lassen. Wuerde man
        // hier einfach buehne.clientWidth messen, misst man die schon
        // aufgeblaehte Breite und die Rechnung laeuft sich fest.
        // Darum: Buehne kurz auf 0 setzen, dann steht die echte verfuegbare
        // Breite fest — und die wird anschliessend fest vergeben.
        buehne.style.width = '0px';
        var verfuegbar = wurzel.clientWidth;
        buehne.style.width = verfuegbar + 'px';

        var cs = getComputedStyle(wurzel);
        var label = parseFloat(cs.getPropertyValue('--tlv-label-w')) || 240;
        var summe = parseFloat(cs.getPropertyValue('--tlv-summe-w')) || 0;
        var frei = verfuegbar - label - summe - 2;   // 2px Rahmen
        if (frei <= 0) return;
        // 42px: darunter passt "02.09." nicht mehr in eine Spalte. Beim
        // Herauszoomen (viele Spalten) darf es enger werden — dann blendet
        // das CSS die Tagesbeschriftung stufenweise aus (.tlv-eng, .tlv-sehr-eng)
        // statt die Buehne waagerecht rollen zu lassen.
        var voll = S.raster === 'woche' ? 52 : 42;
        var min = S.raster === 'woche' ? 26 : 12;
        var breite = Math.max(min, Math.floor((frei / n) * 100) / 100);
        wurzel.classList.toggle('tlv-eng', breite < voll);
        wurzel.classList.toggle('tlv-sehr-eng', breite < 24);
        wurzel.style.setProperty('--tlv-day-w', breite + 'px');
    }

    /* Hoehe: die Buehne bekommt genau den Platz, der bis zum unteren
       Bildschirmrand frei ist (abzueglich Ungeplant-Leiste und Legende).
       Bleibt danach Platz uebrig, weil nur wenige Zeilen da sind, werden die
       Zeilen hoeher gezogen statt unten Luft zu lassen. */
    /* Beschriftung an die Balkenbreite anpassen.
       Die Grundgroesse kommt aus dem CSS (waechst mit der Zeilenhoehe). Passt
       der Text damit nicht in den Balken, wird er schrittweise kleiner
       gesetzt — bis 10px, darunter waere er ohnehin nicht mehr zu lesen und
       die Kuerzung mit "…" ist das kleinere Uebel. Umgekehrt bleibt bei viel
       Platz die volle Groesse stehen. */
    /* Waagerecht blättern ohne den Rollbalken ganz unten am Fenster.
       Drei Wege, alle auf derselben Mechanik:
         • zwei schwebende Pfeile am linken/rechten Rand der Bühne,
         • Shift+Mausrad (und waagerechtes Wischen am Trackpad),
         • Pfeiltasten links/rechts, solange kein Eingabefeld den Fokus hat.
       Ist die Bühne schon am Anschlag, blättert der Pfeil das Zeitfenster
       selbst weiter (schiebe) — sonst käme man bei langfristiger Planung
       nicht über den geladenen Ausschnitt hinaus. */
    function buehneRollen(richtung) {
        var buehne = document.getElementById('tlv-buehne');
        if (!buehne) return;
        var max = buehne.scrollWidth - buehne.clientWidth;
        var amRand = richtung < 0 ? buehne.scrollLeft <= 1 : buehne.scrollLeft >= max - 1;
        if (max > 2 && !amRand) {
            buehne.scrollBy({ left: richtung * Math.round(buehne.clientWidth * 0.8), behavior: 'smooth' });
        } else {
            schiebe(richtung);
        }
    }

    /* Zoom mit dem Mausrad: der Zeitraum wird enger (Rad nach vorn) oder
       weiter (Rad zurueck) — der Tag unter dem Zeiger bleibt dabei an
       seiner Stelle, man zoomt also genau dorthin, wo man hinschaut.
       Technisch aendert sich nur die Zahl der Spalten (S.spalten); die
       Spaltenbreite passt breiteVerteilen() danach wieder an die Buehne an.
       Die neue Weite wird zur Grundeinstellung (basisSpalten), damit ‹ ›
       genau in dieser Ansicht weiterblaettern. */
    var ZOOM_MIN = { tag: 7, woche: 4 };
    var wheelSammler = 0;
    function zoomen(e) {
        var buehne = document.getElementById('tlv-buehne');
        var wurzel = document.getElementById('timeline');
        if (!buehne || !wurzel || !S.geladen) return false;
        // Mehrere feine Rad-Schritte (Trackpad) zu einem Schritt buendeln.
        wheelSammler += e.deltaY;
        if (Math.abs(wheelSammler) < 20) return true;
        var richtung = wheelSammler > 0 ? 1 : -1;
        wheelSammler = 0;

        var sw = schritt(), start = fensterStart();
        var cs = getComputedStyle(wurzel);
        var label = parseFloat(cs.getPropertyValue('--tlv-label-w')) || 240;
        var rect = buehne.getBoundingClientRect();
        var x = e.clientX - rect.left - label + buehne.scrollLeft;
        var gesamt = dayW() * S.spalten;
        var anteil = Math.min(1, Math.max(0, gesamt > 0 ? x / gesamt : 0.5));
        var tagUnterMaus = new Date(start);
        tagUnterMaus.setDate(tagUnterMaus.getDate() + Math.round(anteil * S.spalten * sw));

        var deckel = SPALTEN_DECKEL[S.raster] || 180;
        var minSp = ZOOM_MIN[S.raster] || 7;
        var faktor = richtung > 0 ? 1.25 : 0.8;
        var neu = Math.round(S.spalten * faktor);
        if (richtung > 0 && neu <= S.spalten) neu = S.spalten + 1;
        if (richtung < 0 && neu >= S.spalten) neu = S.spalten - 1;
        neu = Math.max(minSp, Math.min(deckel, neu));
        if (neu === S.spalten) return true;

        // Neuer Fensteranfang so, dass der Tag unter der Maus am selben
        // Anteil der Breite liegt. fensterStart() = anker - 7 Tage (Tag)
        // bzw. montag(anker) - 14 Tage (Woche) — entsprechend rueckrechnen.
        var neuStart = new Date(tagUnterMaus);
        neuStart.setDate(neuStart.getDate() - Math.round(anteil * neu * sw));
        if (S.raster === 'woche') {
            neuStart = montag(neuStart);
            neuStart.setDate(neuStart.getDate() + 14);
        } else {
            neuStart.setDate(neuStart.getDate() + 7);
        }
        S.anker = neuStart;
        S.spalten = S.basisSpalten = neu;
        zeichne();
        buehne.scrollLeft = 0;
        return true;
    }

    function buehneNavBinden(buehne) {
        var wrap = buehne.parentNode;
        if (!wrap) return;
        if (!buehne.dataset.navGebunden) {
            buehne.dataset.navGebunden = '1';
            // Shift+Rad und waagerechtes Wischen rollen die Bühne.
            buehne.addEventListener('wheel', function (e) {
                var dx = e.shiftKey ? e.deltaY : e.deltaX;
                if (dx) {
                    var max = buehne.scrollWidth - buehne.clientWidth;
                    if (max <= 2) return;
                    buehne.scrollLeft += dx;
                    e.preventDefault();
                    return;
                }
                // Mausrad ueber der Buehne = Zoom (Rad vor: naeher, zurueck:
                // weiter weg). Senkrecht rollen geht daneben weiter.
                if (e.deltaY && zoomen(e)) e.preventDefault();
            }, { passive: false });
            document.addEventListener('keydown', function (e) {
                var tl = document.getElementById('timeline');
                if (!tl || tl.classList.contains('hidden')) return;
                if (e.ctrlKey || e.altKey || e.metaKey) return;
                var a = document.activeElement;
                if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA'
                    || a.tagName === 'SELECT' || a.isContentEditable)) return;
                if (e.key === 'ArrowRight') { buehneRollen(1); e.preventDefault(); }
                else if (e.key === 'ArrowLeft') { buehneRollen(-1); e.preventDefault(); }
            });
        }
        if (!wrap.querySelector('.tlv-pager')) {
            ['l', 'r'].forEach(function (seite) {
                var b = document.createElement('button');
                b.type = 'button';
                b.className = 'tlv-pager ' + seite;
                b.innerHTML = seite === 'l' ? '‹' : '›';
                b.title = (seite === 'l' ? 'Zurück' : 'Weiter')
                        + ' — Shift+Mausrad oder Pfeiltasten gehen auch';
                b.setAttribute('aria-label', seite === 'l' ? 'Nach links' : 'Nach rechts');
                b.addEventListener('click', function () { buehneRollen(seite === 'l' ? -1 : 1); });
                wrap.appendChild(b);
            });
        }
        pagerSetzen();
    }

    /* Die Pfeile liegen als Geschwister der Bühne im Abschnitt (dort rollen
       sie nicht mit dem Inhalt weg) — ihre Höhe wird deshalb gemessen.
       Bezug ist der SICHTBARE Teil der Bühne: Die Bühne wächst mit ihren
       Zeilen (kein eigener Rollbalken); früher stand der Pfeil in der Mitte
       der gesamten Höhe — bei vielen Zeilen also unterhalb des Fensters, und
       mit jeder weiteren Zeile rutschte er tiefer. Jetzt: Mitte des Teils der
       Bühne, der gerade im Fenster liegt. Bei zwei Zeilen ist das die Mitte
       der zwei Zeilen, bei vier die der vier; bei mehr Zeilen als ins Fenster
       passen die Mitte des Ausschnitts. Beim Rollen der Seite wird nachgeführt. */
    function pagerSetzen() {
        var buehne = document.getElementById('tlv-buehne');
        var wurzel = document.getElementById('timeline');
        if (!buehne || !buehne.parentNode || !wurzel) return;
        var r = buehne.getBoundingClientRect();
        var oben = Math.max(r.top, 0);
        var unten = Math.min(r.bottom, window.innerHeight);
        if (unten <= oben) { oben = r.top; unten = r.bottom; }
        var mitte = (oben + unten) / 2 - wurzel.getBoundingClientRect().top;
        Array.prototype.forEach.call(buehne.parentNode.querySelectorAll('.tlv-pager'), function (b) {
            b.style.top = Math.round(mitte) + 'px';
        });
    }
    // Rollt die Seite oder ändert sich die Fenstergröße, wandert der Pfeil mit.
    (function () {
        var wartend = false;
        function nachfuehren() {
            if (wartend) return;
            wartend = true;
            setTimeout(function () { wartend = false; pagerSetzen(); }, 16);
        }
        document.addEventListener('scroll', nachfuehren, true);
        window.addEventListener('resize', nachfuehren);
    })();

    function schriftEinpassen() {
        var wurzel = document.getElementById('timeline');
        if (!wurzel) return;
        Array.prototype.forEach.call(wurzel.querySelectorAll('.tlv-bar'), function (bar) {
            // Schmale Balken tragen ihren Text daneben statt darin — da gibt
            // es nichts einzupassen, und Messen wuerde ihn nur schrumpfen.
            if (bar.classList.contains('schmal')) { bar.style.fontSize = ''; return; }
            var text = bar.querySelector('.t');
            if (!text) return;
            bar.style.fontSize = '';
            text.style.display = '';
            // Platz im Balken: alles ausser dem Titel (Punkt, Zeitraum, Preis)
            // braucht seine Breite ebenfalls.
            var neben = Array.prototype.filter.call(bar.children, function (c) {
                // Zeitraum und "Zuständig" stehen in eigenen Zeilen unter dem
                // Titel und nehmen ihm keine Breite weg.
                return c !== text && !c.classList.contains('grip')
                    && !c.classList.contains('tlv-bar-resp')
                    && !c.classList.contains('zeitspanne') && c.tagName !== 'I';
            });
            neben.forEach(function (c) { c.style.display = ''; });
            function platz() {
                var f = bar.clientWidth - 14;
                neben.forEach(function (c) {
                    if (c.style.display !== 'none') f -= c.offsetWidth + 6;
                });
                return f;
            }
            var frei = platz();
            /* Der Titel hat Vorrang: wird es eng, weichen erst die Zusatz-
               Angaben (Zeitraum, Stunden, Zähler). Frueher verschwand statt-
               dessen der Titel — und dann stand auf dem Balken nichts mehr,
               was einem sagt, worum es ueberhaupt geht. */
            if (frei < 60) {
                neben.forEach(function (c) {
                    if (c.classList.contains('s')) c.style.display = 'none';
                });
                frei = platz();
            }
            if (frei <= 0) frei = Math.max(12, bar.clientWidth - 10);

            var gross0 = parseFloat(getComputedStyle(bar).fontSize) || 12;
            /* Langer Balken = viel Platz: dann darf die Schrift auch wachsen,
               nicht nur schrumpfen. Nach oben begrenzt die Balkenhoehe — bei
               drei Zeilen (Titel, Zeitraum, Zuständig) bleibt je Zeile nur ein
               Drittel, sonst quillt der Text aus dem Balken. */
            if (text.scrollWidth <= frei) {
                var zeilen = bar.classList.contains('mit-zusatz') ? 3 : 1;
                var hMax = Math.floor((bar.clientHeight - 8) / zeilen * 0.78);
                var obergrenze = Math.max(gross0, Math.min(22, hMax));
                var wachsen = Math.floor(gross0 * frei / Math.max(1, text.scrollWidth));
                var neu = Math.min(obergrenze, wachsen);
                bar.style.fontSize = (neu > gross0 ? neu : gross0) + 'px';
                return;
            }

            var gross = parseFloat(getComputedStyle(bar).fontSize) || 12;
            // scrollWidth skaliert praktisch linear mit der Schriftgroesse —
            // deshalb einmal rechnen statt in einer Schleife zu probieren.
            var passend = Math.floor(gross * frei / text.scrollWidth);
            // Untergrenze 10px: darunter wird der Text nicht mehr lesbar —
            // dann lieber mit "…" kuerzen, der Tooltip zeigt ohnehin alles.
            bar.style.fontSize = Math.max(10, Math.min(gross, passend)) + 'px';
        });
    }

    var ZEILE_MIN = 44, ZEILE_MIN_KOMPAKT = 28, ZEILE_MAX = 96;
    function hoeheVerteilen() {
        var wurzel = document.getElementById('timeline');
        var buehne = document.getElementById('tlv-buehne');
        if (!wurzel || !buehne || wurzel.classList.contains('hidden')) return;

        var unten = 0;
        ['tlv-ungeplant', 'tlv-legende'].forEach(function (id) {
            var el = document.getElementById(id);
            if (el && el.offsetHeight) unten += el.offsetHeight + 8;
        });

        // Gemessen wird gegen den rollenden Kasten (#main-content), nicht
        // gegen das Fenster: waehrend des Rollens wandert der Fensterabstand,
        // und die Buehne bekaeme je nach Rollstand eine andere Hoehe.
        var box = document.getElementById('main-content');
        var oben, hoehe;
        if (box && box.clientHeight) {
            oben = buehne.getBoundingClientRect().top - box.getBoundingClientRect().top;
            hoehe = box.clientHeight;
        } else {
            oben = buehne.getBoundingClientRect().top;
            hoehe = window.innerHeight;
        }
        var frei = Math.max(240, hoehe - oben - unten - 12);
        buehne.style.height = frei + 'px';

        // Zeilen strecken. Der Kopf und die Gruppenzeilen zaehlen nicht mit,
        // die haben ihre eigene feste Hoehe.
        var basis = wurzel.classList.contains('tlv-kompakt') ? ZEILE_MIN_KOMPAKT : ZEILE_MIN;
        wurzel.style.setProperty('--tlv-row-h', basis + 'px');
        var zeilen = buehne.querySelectorAll('.tlv-row');
        if (!zeilen.length) return;

        var fest = 0;
        var kopf = buehne.querySelector('.tlv-head');
        if (kopf) fest += kopf.offsetHeight;
        Array.prototype.forEach.call(buehne.querySelectorAll('.tlv-group'), function (g) {
            fest += g.offsetHeight;
        });

        var proZeile = Math.floor((frei - fest - 4) / zeilen.length);
        if (proZeile > basis) {
            wurzel.style.setProperty('--tlv-row-h', Math.min(ZEILE_MAX, proZeile) + 'px');
        }
        pagerSetzen();
    }

    function luecke(a, b) {
        return '<div class="tlv-luecke" style="left:calc(var(--tlv-day-w)*' + a + ' + 4px);'
             + 'width:calc(var(--tlv-day-w)*' + (b - a + 1) + ' - 8px)"></div>';
    }

    function zeichneUngeplant() {
        var el = document.getElementById('tlv-ungeplant');
        if (!el) return;
        if (!UNGEPLANT.length) { el.innerHTML = ''; el.style.display = 'none'; return; }
        el.style.display = 'flex';
        el.innerHTML = '<span class="lbl">Ohne Termin — in eine Zeile ziehen</span>'
            + UNGEPLANT.map(function (u) {
                return '<span class="tlv-up" data-up="' + esc(u.id) + '" style="--c:'
                     + SORTEN[u.sorte].farbe + '" title="' + esc(SORTEN[u.sorte].label)
                     + ' — in eine Zeile ziehen, um einen Termin zu setzen">'
                     + esc(u.titel) + '</span>';
            }).join('');
    }

    // ------------------------------------------------------------------
    // Ziehen (Maus, Finger, Stift) — Pointer-Events
    // ------------------------------------------------------------------
    var drag = null, upZug = null, tlStart = null, handlerAn = false, zeilenBox = [];

    function geistEl() {
        var g = document.getElementById('tlv-geist');
        if (!g) { g = document.createElement('div'); g.id = 'tlv-geist'; document.body.appendChild(g); }
        return g;
    }
    function geistBewegen(x, y) {
        var g = geistEl();
        g.style.left = (x + 14) + 'px';
        g.style.top = (y - 14) + 'px';
    }

    function dayW() {
        var el = document.getElementById('timeline');
        return parseFloat(getComputedStyle(el).getPropertyValue('--tlv-day-w')) || 44;
    }
    function fangen(el, ev) { try { el.setPointerCapture(ev.pointerId); } catch (e) {} }

    function verschiebe(it, dt, modus) {
        var v = parse(it.von), b = parse(it.bis);
        if (modus === 'move') { v.setDate(v.getDate() + dt); b.setDate(b.getDate() + dt); }
        else if (modus === 'l') { v.setDate(v.getDate() + dt); if (v > b) return false; }
        else { b.setDate(b.getDate() + dt); if (b < v) return false; }
        it.von = key(v); it.bis = key(b);
        // Von Hand angefasst: der Erstellungstag war nur ein Platzhalter.
        it.vorlaeufig = false;
        // Arbeitszeilen wandern um denselben Versatz mit, die Uhrzeiten bleiben.
        if (modus === 'move' && it.work_log) it.work_log.forEach(function (w) {
            if (!w || !w.datum) return;
            var x = new Date(w.datum);
            if (isNaN(x.getTime())) return;
            x.setDate(x.getDate() + dt);
            w.datum = key(x);
        });
        return true;
    }
    function zeilenVermessen() {
        zeilenBox = Array.prototype.map.call(document.querySelectorAll('#timeline .tlv-row'), function (r) {
            var b = r.getBoundingClientRect();
            return { el: r, key: r.dataset.row, zuw: r.dataset.zuw, oben: b.top, unten: b.bottom };
        });
    }
    function zeileBei(y) {
        for (var i = 0; i < zeilenBox.length; i++)
            if (y >= zeilenBox[i].oben && y < zeilenBox[i].unten) return zeilenBox[i];
        return null;
    }
    function zielMarkieren(z) {
        Array.prototype.forEach.call(document.querySelectorAll('#timeline .tlv-row.zielzeile'), function (r) {
            r.classList.remove('zielzeile');
        });
        if (z) z.el.classList.add('zielzeile');
    }

    function haengeAn(start, n) {
        tlStart = start;
        var wurzel = document.getElementById('timeline');
        if (!wurzel) return;

        Array.prototype.forEach.call(wurzel.querySelectorAll('.tlv-group'), function (g) {
            g.onclick = function () {
                var k = g.dataset.grp;
                if (S.zu.has(k)) S.zu.delete(k); else S.zu.add(k);
                zeichne();
            };
        });
        Array.prototype.forEach.call(wurzel.querySelectorAll('.tlv-klapp'), function (k) {
            k.onclick = function (ev) {
                ev.stopPropagation();
                var id = k.dataset.klapp;
                if (S.aufAufg.has(id)) S.aufAufg.delete(id); else S.aufAufg.add(id);
                zeichne();
            };
        });

        Array.prototype.forEach.call(wurzel.querySelectorAll('.tlv-bar'), function (bar) {
            bar.addEventListener('pointerdown', function (ev) {
                var it = eintrag(bar.dataset.id);
                if (!it) return;
                var q = QUELLEN[it.quelle] || {};
                if (it.gesperrt || !q.schreibbar) {
                    ev.preventDefault();
                    meldung(it.gesperrt
                        ? '"' + it.titel + '" ist abgeschlossen und wird nicht verschoben.'
                        : '"' + it.titel + '" lässt sich nicht terminieren. ' + (q.hinweis || ''), false);
                    return;
                }
                /* Noch kein eigener Termin? Dann ist der Balken nur ein
                   Platzhalter (er erbt die Spanne der Aufgabe) und deckt die
                   ganze Spur ab — ein Druck darauf soll deshalb aufziehen,
                   nicht verschieben. Genau daran scheiterte das Aufziehen
                   vorher: der Platzhalter fing den Klick ab, bevor die Spur
                   ihn sah. */
                if ((it.ohneDatum || it.vorlaeufig) && !ev.target.classList.contains('grip')) {
                    if (!zweiTasten(ev)) { ev.preventDefault(); return; }
                    aufziehen(it, bar.parentNode, bar, ev);
                    return;
                }
                if (ev.button !== 0 && ev.pointerType === 'mouse') return;
                var modus = ev.target.classList.contains('grip')
                    ? (ev.target.classList.contains('l') ? 'l' : 'r') : 'move';
                var mit = (modus === 'move' && S.auswahl.has(it.id))
                    ? Array.from(S.auswahl).map(eintrag).filter(function (x) {
                        return x && !x.gesperrt && schreibbar(x); })
                    : [it];
                zeilenVermessen();
                var quelle = zeileBei(ev.clientY);
                drag = {
                    bar: bar, items: mit, haupt: it, modus: modus,
                    x0: ev.clientX, dt: 0, bewegt: false,
                    quelleZeile: quelle, zielZeile: quelle,
                    vorher: schnappschuss(mit)
                };
                bar.classList.add('zieht');
                fangen(bar, ev);
                ev.preventDefault();
            });
            bar.addEventListener('click', function (ev) {
                if (bar._bewegt) { bar._bewegt = false; return; }
                var it = eintrag(bar.dataset.id); if (!it) return;
                if (ev.shiftKey) {
                    if (S.auswahl.has(it.id)) S.auswahl.delete(it.id); else S.auswahl.add(it.id);
                    zeichne(); return;
                }
                S.auswahl.clear(); S.gewaehlt = it; zeichne();
            });
        });

        /* Ein neuer Balken entsteht mit der Maus NUR, wenn linke UND rechte
           Taste zugleich gedrueckt sind (ev.buttons: 1 = links, 2 = rechts).
           Ein einzelner Druck auf die Spur legte zu oft aus Versehen etwas
           an. Wer zuerst links drueckt, loest mit dem zweiten Druck (rechts)
           ein weiteres pointerdown aus — erst das startet das Aufziehen.
           Finger und Stift kennen keine zwei Tasten und duerfen wie bisher. */
        function zweiTasten(ev) {
            if (ev.pointerType && ev.pointerType !== 'mouse') return true;
            return (ev.buttons & 3) === 3;
        }
        wurzel.oncontextmenu = function (ev) {
            /* Die rechte Taste gehoert hier zum Aufziehen — kein Browsermenue
               auf Spuren und Balken. */
            if (ev.target.closest('.tlv-track, .tlv-bar')) ev.preventDefault();
        };

        /* Balken aufziehen: in einer Zeile ohne eigenen Termin druecken und
           nach rechts ziehen. Der Tag unter dem Zeiger ist der erste Tag, die
           Laenge ergibt sich aus dem Ziehen — danach laeuft alles ueber die
           normale Zieh-Mechanik (Modus 'r' = rechte Kante).
           Wird von zwei Stellen aufgerufen: von der leeren Spur und vom
           Platzhalter-Balken, der die Spur ueberdeckt. */
        function aufziehen(it, tr, bar, ev) {
            if (!it || !tr) return;
            if (it.gesperrt || !schreibbarRoh(it)) return;
            /* Liegt der bisherige Termin ausserhalb des Fensters, gibt es
               keinen Balken zum Anfassen — dann einen anlegen. */
            if (!bar) {
                bar = document.createElement('div');
                bar.className = 'tlv-bar';
                bar.dataset.id = it.id;
                bar.style.setProperty('--c', SORTEN[it.sorte].farbe);
                bar.innerHTML = '<div class="grip l"></div><i class="punkt"></i>'
                              + '<span class="t">' + esc(it.titel) + '</span>'
                              + '<div class="grip r"></div>';
                tr.appendChild(bar);
            }

            var box = tr.getBoundingClientRect();
            var off = Math.floor((ev.clientX - box.left) / dayW());
            if (off < 0) off = 0;
            if (off > S.spalten - 1) off = S.spalten - 1;
            var tag = new Date(tlStart);
            tag.setDate(tag.getDate() + off * schritt());

            var vorher = schnappschuss([it]);
            it.von = key(tag); it.bis = it.von;
            it.ohneDatum = false; it.vorlaeufig = false;
            bar.classList.remove('ohne-datum', 'vorlaeufig');
            bar.style.left = 'calc(var(--tlv-day-w)*' + off + ' + 2px)';
            bar.style.width = 'calc(var(--tlv-day-w)*1 - 4px)';

            zeilenVermessen();
            var zeile = zeileBei(ev.clientY);
            drag = {
                bar: bar, items: [it], haupt: it, modus: 'neu',
                // Der Tag, auf dem gedrueckt wurde, bleibt der Anker: ziehen
                // nach rechts verlaengert nach hinten, nach links nach vorne.
                anker: it.von, spur: tr,
                // bewegt: erst ziehen oder halten macht daraus einen Termin.
                x0: ev.clientX, dt: 0, bewegt: false,
                quelleZeile: zeile, zielZeile: zeile,
                vorher: vorher,
                /* Zustand vor dem Druck. Ein kurzer Klick soll KEINEN Balken
                   anlegen — das ist zu oft aus Versehen passiert. Erst wer
                   mindestens 8 px zieht oder 400 ms haelt, meint es ernst
                   (siehe pointermove/pointerup: `bewegt`). */
                neuVorher: { von: it.von, bis: it.bis,
                             ohneDatum: !!it.ohneDatum, vorlaeufig: !!it.vorlaeufig }
            };
            drag.halten = setTimeout(function () {
                if (drag && drag.modus === 'neu') drag.bewegt = true;
            }, 400);
            bar.classList.add('zieht');
            bar._bewegt = true;
            fangen(bar, ev);
            ev.preventDefault();
        }

        Array.prototype.forEach.call(wurzel.querySelectorAll('.tlv-track'), function (tr) {
            var vorab = eintrag(tr.dataset.row || '');
            if (vorab && !vorab.gesperrt && schreibbarRoh(vorab)) {
                tr.classList.add('tlv-aufziehbar');
                tr.title = 'Linke UND rechte Maustaste zusammen drücken und ziehen — '
                         + 'so lang wird der Balken. Eine Taste allein legt nichts an.';
            }
            tr.addEventListener('pointerdown', function (ev) {
                if (!zweiTasten(ev)) return;
                if (ev.target.closest('.tlv-bar')) return;   // hat einen eigenen Handler
                // Auf der freien Spur gilt immer: neu aufziehen. Auch wenn die
                // Zeile schon einen Termin hat — sie wird dann neu gesteckt.
                // Verschoben wird ueber den Balken selbst, da ist kein Konflikt.
                var it = eintrag(tr.dataset.row || '');
                if (!it) return;
                aufziehen(it, tr, tr.querySelector('.tlv-bar[data-id="' + it.id + '"]'), ev);
            });
        });

        /* Zweite Taste dazudrücken löst KEIN weiteres pointerdown aus — der
           Browser meldet einen Tastenwechsel bei schon gedrücktem Zeiger als
           pointermove (mit geändertem ev.buttons). Die pointerdown-Handler oben
           sehen deshalb immer nur die erste Taste allein und lehnen ab; das
           Aufziehen kam so nie zustande. Hier wird der Moment abgefangen, in dem
           beide Tasten gedrückt sind, und von da an gestartet. */
        if (!wurzel.dataset.akkordGebunden) {
            wurzel.dataset.akkordGebunden = '1';
            wurzel.addEventListener('pointermove', function (ev) {
                if (drag || upZug) return;
                if (ev.pointerType && ev.pointerType !== 'mouse') return;
                if ((ev.buttons & 3) !== 3) return;
                var bar = ev.target.closest('.tlv-bar');
                var tr = ev.target.closest('.tlv-track');
                if (!tr) return;
                var it;
                if (bar) {
                    // Nur der Platzhalter-Balken (noch ohne eigenen Termin) darf
                    // aufgezogen werden; echte Balken werden mit links verschoben.
                    it = eintrag(bar.dataset.id);
                    if (!it || !(it.ohneDatum || it.vorlaeufig) || ev.target.classList.contains('grip')) return;
                    aufziehen(it, bar.parentNode, bar, ev);
                    return;
                }
                it = eintrag(tr.dataset.row || '');
                if (!it) return;
                aufziehen(it, tr, tr.querySelector('.tlv-bar[data-id="' + it.id + '"]'), ev);
            });
        }

        Array.prototype.forEach.call(document.querySelectorAll('.tlv-up'), function (u) {
            u.addEventListener('pointerdown', function (ev) {
                ev.preventDefault();
                var e = null;
                for (var i = 0; i < UNGEPLANT.length; i++)
                    if (UNGEPLANT[i].id === u.dataset.up) e = UNGEPLANT[i];
                if (!e) return;
                var q = QUELLEN[e.quelle] || {};
                if (!q.schreibbar) {
                    meldung('"' + e.titel + '" lässt sich nicht einplanen. ' + (q.hinweis || ''), false);
                    return;
                }
                zeilenVermessen();
                upZug = { eintrag: e, el: u };
                u.classList.add('zieht');
                var g = geistEl();
                g.style.setProperty('--c', SORTEN[e.sorte].farbe);
                g.textContent = e.titel;
                g.classList.add('an');
                geistBewegen(ev.clientX, ev.clientY);
                fangen(u, ev);
            });
        });

        if (!handlerAn) { handlerAn = true; globaleHandler(); }
    }

    /* Eine Unteraufgabe wurde verschoben oder verlaengert — dann muss die
       Aufgabe darueber mit. Zwei Faelle:

         • Die Aufgabe hat keinen eigenen Zeitraum (Klammer): sie spannt sich
           genau ueber ihre Kinder.
         • Die Aufgabe hat einen eigenen Zeitraum: sie wird nur erweitert,
           damit der Schritt hineinpasst. Ein Kind nach hinten zu schieben
           zieht also das Ende der Aufgabe mit, ohne ihren Anfang zu kappen.

       Zurueckgegeben werden die geaenderten Aufgaben, damit der Aufrufer sie
       speichern kann. `undoStand` ist die Liste des laufenden Rueckgaengig-
       Schrittes — die Aufgaben kommen dort mit hinein. */
    function elternNachziehen(items, undoStand) {
        var geaendert = [], gesehen = {};
        items.forEach(function (it) {
            if (it.quelle !== 'subtasks' || !it.eltern || gesehen[it.eltern]) return;
            gesehen[it.eltern] = 1;

            var e = eintrag(it.eltern);
            if (!e || e.gesperrt || !schreibbar(e)) return;

            var von = null, bis = null;
            ITEMS.forEach(function (k) {
                if (k.eltern !== e.id || k.ohneDatum) return;
                if (!von || k.von < von) von = k.von;
                if (!bis || k.bis > bis) bis = k.bis;
            });
            if (!von) return;

            var neuVon = e.klammer ? von : (von < e.von ? von : e.von);
            var neuBis = e.klammer ? bis : (bis > e.bis ? bis : e.bis);
            if (neuVon === e.von && neuBis === e.bis) return;

            if (undoStand) undoStand.push(schnappschuss([e])[0]);
            e.von = neuVon; e.bis = neuBis;
            geaendert.push(e);
        });
        return geaendert;
    }

    function globaleHandler() {
        document.addEventListener('pointermove', function (ev) {
            if (upZug) { geistBewegen(ev.clientX, ev.clientY); zielMarkieren(zeileBei(ev.clientY)); return; }
            if (!drag) return;

            /* Balken aufziehen: der gedrueckte Tag ist der Anker, der Tag
               unter dem Zeiger das andere Ende. Deshalb nicht der uebliche
               Versatz, sondern die absolute Spalte unter der Maus. */
            if (drag.modus === 'neu') {
                // Ab 8 px ist es ein Ziehen und kein verrutschter Klick mehr.
                if (Math.abs(ev.clientX - drag.x0) > 8) drag.bewegt = true;
                var kasten = drag.spur.getBoundingClientRect();
                var sp = Math.floor((ev.clientX - kasten.left) / dayW());
                if (sp < 0) sp = 0;
                // Ganz am rechten Rand aufgezogen? Fenster verbreitern und mit
                // dem dann groesseren Platz neu ausrechnen, wo der Zeiger steht.
                if (sp >= S.spalten - 1 && liveErweiternRechts()) {
                    kasten = drag.spur.getBoundingClientRect();
                    sp = Math.floor((ev.clientX - kasten.left) / dayW());
                    if (sp < 0) sp = 0;
                }
                if (sp > S.spalten - 1) sp = S.spalten - 1;
                var jetzt = new Date(tlStart);
                jetzt.setDate(jetzt.getDate() + sp * schritt());
                var k2 = key(jetzt);
                drag.haupt.von = k2 < drag.anker ? k2 : drag.anker;
                drag.haupt.bis = k2 > drag.anker ? k2 : drag.anker;
                // Bei Wochenraster deckt eine Spalte sieben Tage ab.
                if (schritt() > 1) {
                    var w = parse(drag.haupt.bis);
                    w.setDate(w.getDate() + schritt() - 1);
                    drag.haupt.bis = key(w);
                }
                var av = spalteVon(drag.haupt.von, tlStart);
                var lv = spalteVon(drag.haupt.bis, tlStart) - av + 1;
                drag.bar.style.left = 'calc(var(--tlv-day-w)*' + av + ' + 2px)';
                drag.bar.style.width = 'calc(var(--tlv-day-w)*' + lv + ' - 4px)';
                drag.bar.classList.toggle('konflikt', !!konflikte(sichtbar())[drag.haupt.id]);
                var tg = tage(drag.haupt.von, drag.haupt.bis) + 1;
                var g = geistEl();
                g.style.setProperty('--c', SORTEN[drag.haupt.sorte].farbe);
                g.textContent = tg + (tg === 1 ? ' Tag' : ' Tage');
                g.classList.add('an');
                geistBewegen(ev.clientX, ev.clientY);
                return;
            }

            var ziel = Math.round((ev.clientX - drag.x0) / dayW());
            if (ziel !== drag.dt) {
                var s = (ziel - drag.dt) * schritt();
                var ok = drag.items.every(function (it) { return verschiebe(it, s, drag.modus); });
                if (ok) {
                    drag.dt = ziel; drag.bewegt = true; drag.bar._bewegt = true;
                    // Rechter Rand erreicht? Fenster sofort verbreitern, statt
                    // erst beim Loslassen — sonst kommt man mit der Maus gar
                    // nicht weiter, weil da nichts mehr zum Hinziehen ist.
                    if ((drag.modus === 'r' || drag.modus === 'move')
                        && spalteVon(drag.haupt.bis, tlStart) >= S.spalten - 1) {
                        liveErweiternRechts();
                    }
                    var a = spalteVon(drag.haupt.von, tlStart);
                    var len = spalteVon(drag.haupt.bis, tlStart) - a + 1;
                    drag.bar.style.left = 'calc(var(--tlv-day-w)*' + a + ' + 2px)';
                    drag.bar.style.width = 'calc(var(--tlv-day-w)*' + len + ' - 4px)';
                    var kk = konflikte(sichtbar());
                    drag.bar.classList.toggle('konflikt', !!kk[drag.haupt.id]);
                }
            }
            if (drag.modus === 'move') {
                var z = zeileBei(ev.clientY);
                if (z && z.zuw && drag.quelleZeile && z.zuw === drag.quelleZeile.zuw) {
                    drag.zielZeile = z;
                    zielMarkieren(z.key !== drag.quelleZeile.key ? z : null);
                    drag.bar.style.transform = 'translateY(' + (z.oben - drag.quelleZeile.oben) + 'px)';
                }
            }
        });

        document.addEventListener('pointerup', function (ev) {
            if (upZug) { legeAb(ev); return; }
            if (!drag) return;
            var dd = drag; drag = null;
            clearTimeout(dd.halten);
            dd.bar.classList.remove('zieht');
            dd.bar.style.transform = '';
            if (dd.modus === 'neu') geistEl().classList.remove('an');
            zielMarkieren(null);

            /* Nur kurz geklickt, ohne zu ziehen: alles auf den Stand von vor
               dem Druck zurueck — es entsteht KEIN neuer Balken. */
            if (dd.modus === 'neu' && !dd.bewegt) {
                if (dd.neuVorher) {
                    dd.haupt.von = dd.neuVorher.von;
                    dd.haupt.bis = dd.neuVorher.bis;
                    dd.haupt.ohneDatum = dd.neuVorher.ohneDatum;
                    dd.haupt.vorlaeufig = dd.neuVorher.vorlaeufig;
                }
                zeichne();
                return;
            }

            var wechsel = dd.zielZeile && dd.quelleZeile && dd.zielZeile.zuw
                       && dd.zielZeile.key !== dd.quelleZeile.key;
            if (!dd.bewegt && !wechsel) return;

            // Aufgaben und Unteraufgaben haben ein assigned_to — dort wird die
            // Zuordnung wirklich uebernommen. Bei allen anderen Quellen waere
            // "andere Maschine" ein Eingriff in den Datensatz, den ein Ziehen
            // nicht rechtfertigt: dort aendert sich nur die Anzeige.
            var zuordnungGeschrieben = false;
            if (wechsel) dd.items.forEach(function (it) {
                if (dd.zielZeile.zuw === 'maschine') { it.maschine = dd.zielZeile.key; return; }
                if (dd.zielZeile.zuw !== 'monteur') return;
                it.monteur = dd.zielZeile.key;
                if (it.quelle === 'tasks' || it.quelle === 'subtasks') {
                    it.personen = dd.zielZeile.key ? [dd.zielZeile.key] : [];
                    it.personenGeaendert = true;
                    zuordnungGeschrieben = true;
                }
            });

            UNDO.push({
                text: dd.items.length > 1 ? dd.items.length + ' Einträge geändert'
                                          : '"' + dd.haupt.titel + '" geändert',
                stand: dd.vorher
            });
            if (UNDO.length > 50) UNDO.shift();

            var txt = dd.items.length > 1
                ? dd.items.length + ' Einträge verschoben'
                : '"' + dd.haupt.titel + '" → ' + dez(parse(dd.haupt.von)) + ' – ' + dez(parse(dd.haupt.bis));
            if (wechsel) txt += zuordnungGeschrieben
                ? ' · zugewiesen an ' + ((monteur(dd.zielZeile.key) || {}).name || '—')
                : ' · Zuordnung nur in der Anzeige geändert';
            if (dd.haupt.work_log && dd.haupt.work_log.length && dd.modus === 'move')
                txt += ' · ' + dd.haupt.work_log.length + ' Arbeitszeilen mit';

            // Verschobene Unteraufgabe: die Aufgabe darueber spannt sich neu
            // ueber ihre Kinder. Sonst stuende die Aufgabe noch im alten
            // Zeitraum, waehrend ein Schritt schon spaeter liegt.
            var mitgezogen = elternNachziehen(dd.items, dd.vorher);
            if (mitgezogen.length) {
                txt += ' · ' + (mitgezogen.length > 1 ? mitgezogen.length + ' Aufgaben' : 'Aufgabe')
                     + ' mitgezogen';
            }

            if (S.schreiben) {
                dd.items.concat(mitgezogen).forEach(speichern);
                txt += ' · gespeichert';
            } else {
                txt += ' · nicht gespeichert (Schalter aus)';
            }
            meldung(txt);
            zeichne();
        });

        document.addEventListener('pointercancel', function () {
            if (drag) { drag.bar.classList.remove('zieht'); drag.bar.style.transform = ''; drag = null; }
            if (upZug) { geistEl().classList.remove('an'); upZug.el.classList.remove('zieht'); upZug = null; }
            zielMarkieren(null);
        });

        document.addEventListener('keydown', function (e) {
            var v = document.getElementById('timeline');
            if (!v || v.classList.contains('hidden')) return;
            // e.target ist nicht immer ein Element (z. B. document, wenn nichts
            // den Fokus hat) — dann gibt es kein matches().
            if (e.target && e.target.matches && e.target.matches('input,select,textarea')) return;
            if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
                e.preventDefault(); rueckgaengig();
            }
            if (e.key === 'Escape') {
                var frei = document.getElementById('tlv-frei');
                if (frei && frei.classList.contains('an')) { freiZu(); return; }
                S.gewaehlt = null; S.auswahl.clear(); zeichne();
            }
        });
    }

    /* Einen Eintrag aus der Leiste in der Timeline ablegen.
       Nur fuer Quellen mit echten Datumsspalten (heute: tasks) —
       das ist der Weg, wie eine Aufgabe ueberhaupt erst eine Zeit bekommt. */
    function legeAb(ev) {
        var z = zeileBei(ev.clientY);
        geistEl().classList.remove('an');
        upZug.el.classList.remove('zieht');
        zielMarkieren(null);
        var e = upZug.eintrag;
        upZug = null;
        if (!z) { zeichne(); return; }

        var tr = z.el.querySelector('.tlv-track');
        if (!tr) { zeichne(); return; }
        var off = Math.max(0, Math.floor((ev.clientX - tr.getBoundingClientRect().left) / dayW()));
        var von = new Date(tlStart); von.setDate(von.getDate() + off * schritt());
        var bis = new Date(von); bis.setDate(bis.getDate() + schritt() - 1);

        var neu = {
            id: e.id, dbId: e.dbId, quelle: e.quelle, sorte: e.sorte, titel: e.titel,
            monteur: e.monteur, maschine: e.maschine, werkstattNr: e.werkstattNr,
            personen: e.personen || [],
            anzKinder: e.anzKinder, anzErledigt: e.anzErledigt,
            von: key(von), bis: key(bis)
        };
        if (z.zuw === 'maschine') neu.maschine = z.key;
        if (z.zuw === 'monteur' && z.key) {
            neu.monteur = z.key;
            // Auf eine Personenzeile abgelegt heisst: der macht das.
            if (neu.quelle === 'tasks' || neu.quelle === 'subtasks') {
                neu.personen = [z.key];
                neu.personenGeaendert = true;
            }
        }
        ITEMS.push(neu);
        (e.kinder || []).forEach(function (k) {
            var kVon = k.von, kBis = k.bis || k.von, ohne = !kVon;
            if (ohne) { kVon = neu.von; kBis = neu.bis; }
            ITEMS.push({
                id: 'st-' + k.dbId, dbId: k.dbId, quelle: 'subtasks', sorte: 'aufgabe',
                titel: k.titel, eltern: neu.id,
                personen: k.personen || [], monteur: (k.personen || [])[0] || null,
                von: kVon, bis: kBis, status: k.status || null,
                ohneDatum: ohne, gesperrt: k.status === 'completed'
            });
        });
        UNGEPLANT = UNGEPLANT.filter(function (x) { return x.id !== e.id; });

        UNDO.push({ text: '"' + e.titel + '" eingeplant', stand: [], entfernen: neu.id, zurueck: e });

        var txt = '"' + e.titel + '" → ' + dez(von) + (neu.von !== neu.bis ? ' – ' + dez(bis) : '');
        if (S.schreiben) { speichern(neu); txt += ' · in ' + neu.quelle + ' gespeichert'; }
        else txt += ' · nicht gespeichert (Schalter aus)';
        meldung(txt);
        zeichne();
    }

    /* Dauer im Panel per Wochen/Stunden-Feld gesetzt: dieselbe Kette wie beim
       Ziehen an der rechten Kante — nur dass die neue Laenge nicht aus einer
       Mausposition kommt, sondern aus der eingegebenen Zahl. */
    function dauerSetzen(it, tageNeu) {
        if (tageNeu < 1) tageNeu = 1;
        var neuBis = new Date(parse(it.von)); neuBis.setDate(neuBis.getDate() + tageNeu - 1);
        var neuBisK = key(neuBis);
        if (neuBisK === it.bis) return;
        var vorher = schnappschuss([it]);
        it.bis = neuBisK;
        var mitgezogen = elternNachziehen([it], vorher);
        UNDO.push({ text: '"' + it.titel + '" Dauer geändert', stand: vorher });
        if (UNDO.length > 50) UNDO.shift();
        var txt = '"' + it.titel + '" → ' + zeitraumText(it);
        if (S.schreiben) { [it].concat(mitgezogen).forEach(speichern); txt += ' · gespeichert'; }
        else txt += ' · nicht gespeichert (Schalter aus)';
        meldung(txt);
        zeichne();
    }

    // ------------------------------------------------------------------
    // Wer ist wann frei? — Belegungsübersicht auf Knopfdruck
    //
    // Eine Tafel: eine Zeile je Person, eine Spalte je Tag des gerade
    // eingestellten Zeitraums. Belegte Tage tragen den Titel, freie Tage sind
    // gruen. Damit sieht man auf einen Blick, wer wann was macht und wo eine
    // Luecke ist. Gerechnet wird aus denselben ITEMS wie die Timeline —
    // Aufgaben und Serviceberichte, keine eigene Abfrage.
    // ------------------------------------------------------------------
    function freiEl() {
        var f = document.getElementById('tlv-frei');
        if (!f) {
            f = document.createElement('div');
            f.id = 'tlv-frei';
            document.body.appendChild(f);
            f.addEventListener('click', function (e) {
                if (e.target === f || e.target.classList.contains('tlv-frei-zu')) freiZu();
            });
        }
        return f;
    }
    function freiZu() { freiEl().classList.remove('an'); }

    /* Welche Eintraege zaehlen als Arbeit einer Person?
       - nur Aufgaben, Unteraufgaben und Serviceberichte,
       - eine Aufgabe MIT Unteraufgaben zaehlt nicht selbst mit, sonst waere
         derselbe Zeitraum doppelt belegt. */
    function belegungsEintraege() {
        var arbeit = ITEMS.filter(function (i) {
            if (i.sorte !== 'aufgabe' && i.sorte !== 'service') return false;
            if (i.quelle === 'tasks' && i.anzKinder) return false;
            return !!i.von;
        });
        // Termine und Wartungen belegen den Tag genauso — nur zeigt die
        // Timeline sie nicht. Fuer "wer ist frei" gehoeren sie dazu.
        return arbeit.concat(TERMINE);
    }
    /* Abwesenheiten einer Person an einem Tag (Urlaub schlaegt alles andere). */
    function abwesendAm(pid, k) {
        for (var i = 0; i < ABWESEND.length; i++) {
            var a = ABWESEND[i];
            if (a.personen.indexOf(pid) < 0) continue;
            if (a.von <= k && a.bis >= k) return a;
        }
        return null;
    }
    function personenVon(i) {
        if (i.personen && i.personen.length) return i.personen;
        return i.monteur ? [i.monteur] : [];
    }

    function zeichneFrei() {
        var f = freiEl();
        var sw = schritt();
        var start = tlStart ? new Date(tlStart) : heuteDatum();
        var n = S.spalten;
        var tage_ = [];
        for (var x = 0; x < n; x++) {
            var d = new Date(start); d.setDate(d.getDate() + x * sw);
            tage_.push(d);
        }
        var ende = tage_[tage_.length - 1];

        // Belegung einsammeln: proPerson[pid][tagesschluessel] = [Eintraege]
        var proPerson = {}, ohne = [];
        belegungsEintraege().forEach(function (i) {
            var leute = personenVon(i);
            if (!leute.length) { ohne.push(i); return; }
            leute.forEach(function (pid) {
                var topf = proPerson[pid] = proPerson[pid] || {};
                tage_.forEach(function (d) {
                    var k = key(d);
                    var kEnde = k;
                    if (sw > 1) { var e2 = new Date(d); e2.setDate(e2.getDate() + sw - 1); kEnde = key(e2); }
                    if (i.von <= kEnde && i.bis >= k) (topf[k] = topf[k] || []).push(i);
                });
            });
        });

        function zelleInhalt(liste) {
            if (!liste || !liste.length) return '';
            var m = maschine(liste[0].maschine);
            var t = liste[0].titel + (liste.length > 1 ? ' +' + (liste.length - 1) : '');
            return '<span class="tlv-frei-txt" title="' + esc(liste.map(function (i) {
                var mm = maschine(i.maschine);
                return i.titel + (mm ? ' — ' + mm.name : '') + ' (' + zeitraumText(i) + ')';
            }).join('\n')) + '">' + esc(t) + (m ? ' <i>' + esc(m.name) + '</i>' : '') + '</span>';
        }

        var kopf = '<div class="tlv-frei-zelle kopf name">Person</div>';
        tage_.forEach(function (d) {
            kopf += '<div class="tlv-frei-zelle kopf' + (istFrei(d) ? ' we' : '')
                 + (key(d) === key(HEUTE) ? ' heute' : '') + '">'
                 + '<span>' + d.toLocaleDateString('de-DE', { weekday: 'short' }).slice(0, 2) + '</span>'
                 + '<b>' + String(d.getDate()).padStart(2, '0') + '.'
                 + String(d.getMonth() + 1).padStart(2, '0') + '.</b></div>';
        });
        kopf += '<div class="tlv-frei-zelle kopf bilanz">frei</div>';

        var zeilen = '', heuteFrei = [];
        MONTEURE.forEach(function (p) {
            var topf = proPerson[p.id] || {};
            var freiTage = 0, arbeitstage = 0;
            var z = '<div class="tlv-frei-zelle name" style="--rc:' + farbeVon('p' + p.id) + '">'
                  + esc(p.name) + '</div>';
            tage_.forEach(function (d) {
                var k = key(d), liste = topf[k], we = istFrei(d);
                var ab = abwesendAm(p.id, k);
                if (!we) {
                    arbeitstage++;
                    if (!liste && !ab) freiTage++;
                }
                if (!we && !liste && !ab && key(d) === key(HEUTE)) heuteFrei.push(p.name);
                // Urlaub schlaegt alles: wer nicht da ist, ist nicht frei.
                var art = we ? ' we' : (ab ? ' abwesend' : (liste ? ' belegt' : ' frei'));
                z += '<div class="tlv-frei-zelle' + art
                   + (!ab && liste && liste.length > 1 ? ' doppelt' : '')
                   + (key(d) === key(HEUTE) ? ' heute' : '') + '"'
                   + (ab ? ' data-ab="' + esc(String(ab.dbId)) + '"' : '') + '>'
                   + (ab ? '<span class="tlv-frei-txt" title="' + esc(ab.titel + ' · '
                            + dez(parse(ab.von)) + ' – ' + dez(parse(ab.bis))
                            + (ab.notiz ? '\n' + ab.notiz : '')) + '">' + esc(ab.titel) + '</span>'
                         : zelleInhalt(liste)) + '</div>';
            });
            z += '<div class="tlv-frei-zelle bilanz"><b>' + freiTage + '</b>/' + arbeitstage + '</div>';
            zeilen += '<div class="tlv-frei-zeile">' + z + '</div>';
        });

        if (ohne.length) {
            zeilen += '<div class="tlv-frei-ohne"><b>Ohne Zuordnung (' + ohne.length + '):</b> '
                    + ohne.slice(0, 12).map(function (i) {
                        return '<span title="' + esc(zeitraumText(i)) + '">' + esc(i.titel) + '</span>';
                      }).join(' · ')
                    + (ohne.length > 12 ? ' …' : '') + '</div>';
        }

        f.innerHTML =
            '<div class="tlv-frei-box">'
          + '<div class="tlv-frei-kopf">'
          + '<div><h2>Wer ist wann frei?</h2>'
          + '<p>' + esc(dez(start) + ' – ' + dez(ende))
          + ' · Aufgaben, Serviceberichte, Termine und Abwesenheiten'
          + (S.person ? ' · gefiltert auf eine Person' : '') + '</p></div>'
          + '<button class="tlv-frei-zu" title="schließen">&times;</button></div>'
          + '<div class="tlv-frei-leiste">'
          + '<div class="tlv-frei-heute">Heute frei: <b>'
          + (heuteFrei.length ? esc(heuteFrei.join(', ')) : 'niemand') + '</b></div>'
          + (ABWESEND_DA ? abwesenheitFormular() : '<div class="tlv-frei-hinweis">'
              + 'Urlaub und Krankheit fehlen noch: dafür muss '
              + '<code>supabase/supabase_add_absences.sql</code> in Supabase laufen.</div>')
          + '</div>'
          + '<div class="tlv-frei-tafel" style="--tlv-frei-cols:' + n + '">'
          + '<div class="tlv-frei-zeile kopfzeile">' + kopf + '</div>' + zeilen + '</div>'
          + '<div class="tlv-frei-legende">'
          + '<span class="pkt frei"></span> frei <span class="pkt belegt"></span> belegt '
          + '<span class="pkt doppelt"></span> mehreres am selben Tag '
          + '<span class="pkt abwesend"></span> abwesend (Klick = löschen) '
          + '<span class="pkt we"></span> Wochenende/Feiertag'
          + '</div></div>';
        f.classList.add('an');

        var knopf = f.querySelector('#tlv-ab-speichern');
        if (knopf) knopf.onclick = abwesenheitSpeichern;
        Array.prototype.forEach.call(f.querySelectorAll('.tlv-frei-zelle[data-ab]'), function (z) {
            z.onclick = function () { abwesenheitLoeschen(z.dataset.ab); };
        });
    }

    /* Abwesenheit eintragen — bewusst ein schlichtes Formular im Kopf der
       Tafel statt eines eigenen Fensters: Person, von, bis, Grund. */
    function abwesenheitFormular() {
        return '<div class="tlv-frei-form">'
             + '<select id="tlv-ab-person" class="tlv-input tlv-select">'
             + MONTEURE.map(function (p) {
                   return '<option value="' + esc(p.id) + '">' + esc(p.name) + '</option>';
               }).join('') + '</select>'
             + '<input type="date" id="tlv-ab-von" class="tlv-input" title="von">'
             + '<input type="date" id="tlv-ab-bis" class="tlv-input" title="bis">'
             + '<select id="tlv-ab-grund" class="tlv-input tlv-select">'
             + ['Urlaub', 'Krank', 'Schulung', 'Frei'].map(function (g) {
                   return '<option>' + g + '</option>';
               }).join('') + '</select>'
             + '<button class="tlv-tool" id="tlv-ab-speichern">Abwesenheit eintragen</button>'
             + '</div>';
    }
    async function abwesenheitSpeichern() {
        var pid = (document.getElementById('tlv-ab-person') || {}).value;
        var von = (document.getElementById('tlv-ab-von') || {}).value;
        var bis = (document.getElementById('tlv-ab-bis') || {}).value || von;
        var grund = (document.getElementById('tlv-ab-grund') || {}).value || 'Urlaub';
        if (!pid || !von) { meldung('Bitte Person und Datum angeben.', false); return; }
        if (bis < von) { var t = von; von = bis; bis = t; }
        var p = monteur(pid);
        var zeile = {
            user_id: Number(pid), user_name: p ? p.name : null,
            von: von, bis: bis, grund: grund,
            created_by: (window.activeUser && Number(window.activeUser.id)) || null
        };
        var r = sb() ? await sb().from('absences').insert(zeile).select() : null;
        if (r && r.error) { meldung('Konnte nicht gespeichert werden: ' + r.error.message, false); return; }
        var neu = (r && r.data && r.data[0]) || null;
        ABWESEND.push({
            id: 'ab-' + (neu ? neu.id : Date.now()), dbId: neu ? neu.id : null,
            sorte: 'abwesend', titel: grund, notiz: '',
            personen: [String(pid)], name: zeile.user_name, von: von, bis: bis
        });
        zeichneFrei();
    }
    async function abwesenheitLoeschen(id) {
        if (!id || id === 'null') return;
        if (typeof window.canDelete === 'function' && !window.canDelete('Abwesenheiten')) return;
        if (!confirm('Diese Abwesenheit löschen?')) return;
        if (sb()) {
            var r = await sb().from('absences').delete().eq('id', id);
            if (r && r.error) { meldung('Löschen fehlgeschlagen: ' + r.error.message, false); return; }
        }
        ABWESEND = ABWESEND.filter(function (a) { return String(a.dbId) !== String(id); });
        zeichneFrei();
    }

    // ------------------------------------------------------------------
    // Seitenpanel
    // ------------------------------------------------------------------
    function panelEl() {
        var p = document.getElementById('tlv-panel');
        if (!p) { p = document.createElement('aside'); p.id = 'tlv-panel'; document.body.appendChild(p); }
        return p;
    }
    function kundeZeile(it, m) {
        var name = it.kunde || (m && m.firma) || null;
        var quelle = it.kunde ? '' : (m && m.firma ? ' <span style="opacity:.6">(Betreiber der Maschine)</span>' : '');
        var nr = (!it.kunde && m && m.kundenNr) ? ' · Nr. ' + m.kundenNr : '';
        var h = '';
        if (name) h += '<div class="kv"><span>Kunde</span><b>' + esc(name) + esc(nr) + quelle + '</b></div>';
        if (it.ansprech) h += '<div class="kv"><span>Ansprechpartner</span><b>' + esc(it.ansprech) + '</b></div>';
        if (it.einsatzort) h += '<div class="kv"><span>Einsatzort</span><b>' + esc(it.einsatzort) + '</b></div>';
        // Der hinterlegte Standort der Maschine steht zusaetzlich da: er sagt,
        // wo sie laut Stammsatz steht — das ist nicht zwingend der Einsatzort.
        if (m && m.ort && m.ort !== it.einsatzort)
            h += '<div class="kv"><span>Standort Maschine</span><b>' + esc(m.ort) + '</b></div>';
        return h;
    }

    function zeichnePanel() {
        var p = panelEl(), it = S.gewaehlt;
        if (!it) { p.classList.remove('an'); return; }
        var m = maschine(it.maschine), pe = monteur(it.monteur);
        var eltern = it.eltern ? eintrag(it.eltern) : null;
        p.classList.add('an');

        var h = '<div style="display:flex;align-items:flex-start;gap:8px">'
            + '<div style="flex:1"><span class="tlv-badge" style="--c:' + SORTEN[it.sorte].farbe + '">'
            + SORTEN[it.sorte].label + '</span><h2>' + (it.gesperrt ? '🔒 ' : '') + esc(it.titel) + '</h2></div>'
            + '<button class="btn-secondary" id="tlv-panel-zu">&times;</button></div>'
            + '<div class="kv"><span>Zeitraum</span><b>' + esc(zeitraumText(it)) + '</b></div>'
            // Dauer zum Eintippen — nur wenn der Termin verschiebbar ist und
            // schon ein echtes Start-Datum hat (sonst gibt es kein "von", ab
            // dem gerechnet werden könnte). Wochen und Stunden rechnen sich
            // gegenseitig um (siehe wochenAusTagen/stundenAusWochen) und
            // verlängern beim Eintragen sofort den Balken.
            + ((!it.ohneDatum && schreibbarRoh(it)) ? (function () {
                var tageGesamt = tage(it.von, it.bis) + 1;
                var w = wochenAusTagen(tageGesamt);
                var h = stundenAusWochen(w);
                return '<div class="kv"><span>Dauer</span><b style="display:flex; gap:8px; align-items:center;">'
                    + '<input type="text" id="tlv-panel-wochen" value="' + fmtDe(w) + '" inputmode="decimal"'
                    + ' class="glass-input" style="width:70px; padding:4px 8px;"'
                    + ' title="z.B. 2 oder 1,5 — rechnet Stunden automatisch um und verlängert den Balken">'
                    + ' Wochen &nbsp;·&nbsp; '
                    + '<input type="text" id="tlv-panel-stunden" value="' + fmtDe(h) + '" inputmode="decimal"'
                    + ' class="glass-input" style="width:70px; padding:4px 8px;"> Stunden'
                    + '</b></div>';
            })() : '')
            + (it.ohneDatum ? '' : '<div class="kv"><span>Stand heute</span><b>'
                + esc(relativText(it)) + '</b></div>')
            // Arbeitszeit steht bewusst nicht hier: sie gehört in den
            // Servicebericht, nicht in die Planung. Auf dem Balken und im
            // Tooltip ist sie weiterhin zu sehen.
            + (it.vorlaeufig
                ? '<div class="kv"><span>Hinweis</span><b>liegt nur vorläufig auf dem '
                  + 'Erstellungstag — einmal ziehen setzt den echten Termin</b></div>' : '')
            // Alles zur Maschine in EINER Zeile: Hersteller und Typ,
            // Seriennummer, Baujahr — also "BACKHUS A30 · #1065 · 2016".
            // Die Baureihe (m.voll) steht bewusst NICHT dabei: sie wiederholt
            // meist nur den Typ ("A-Serie" zu "A30") und macht die Zeile lang.
            + (m ? '<div class="kv"><span>Maschine</span><b>'
                   + esc([m.name, m.serial ? '#' + m.serial : '', m.jahr]
                         .filter(Boolean).join(' · ')) + '</b></div>' : '')
            // Aufgabe ohne Maschine: dann hängt sie an einer Auftragsnummer.
            + (it.werkstattNr
                ? '<div class="kv"><span>Werkstattauftrag</span><b>' + esc(it.werkstattNr) + '</b></div>'
                : (!m && it.quelle === 'tasks'
                    ? '<div class="kv"><span>Maschine</span><b>keine hinterlegt</b></div>' : ''))
            // Kunde: der am Beleg hinterlegte hat Vorrang vor dem Betreiber
            // der Maschine — sonst zeigt ein Einsatz beim Fremdkunden den
            // falschen Namen.
            + kundeZeile(it, m)
            + (it.personen && it.personen.length
                ? '<div class="kv"><span>' + (it.personen.length > 1 ? 'Personen' : 'Person') + '</span><b>'
                  + esc(it.personen.map(function (p) { return (monteur(p) || {}).name || p; }).join(', '))
                  + '</b></div>'
                : (pe ? '<div class="kv"><span>Monteur</span><b>' + esc(pe.name) + '</b></div>' : ''))
            + (it.anzKinder
                ? '<div class="kv"><span>Unteraufgaben</span><b>' + it.anzErledigt + ' von '
                  + it.anzKinder + ' erledigt</b></div>' : '')
            + (it.klammer
                ? '<div class="kv"><span>Zeitraum</span><b>aus den Unteraufgaben abgeleitet</b></div>' : '')
            + (eltern ? '<div class="kv"><span>gehört zu</span><b>' + esc(eltern.titel) + '</b></div>' : '')
            + (it.preis ? '<div class="kv"><span>Miete</span><b>' + it.preis + ' €/Tag · '
                + (it.preis * (tage(it.von, it.bis) + 1)).toLocaleString('de-DE') + ' €</b></div>' : '');

        // Abhaengigkeiten: nur auf Aufgaben-Ebene (nicht Unteraufgaben), damit
        // die Pflege einfach bleibt. "A muss vor B fertig sein" — angezeigt
        // als Liste zum Entfernen plus ein Auswahlfeld zum Hinzufuegen.
        if (it.quelle === 'tasks') {
            var vonListe = (it.abhaengigVon || []).map(function (depId) {
                var dep = eintrag('ta-' + depId);
                var spaet = dep && it.von < dep.bis;
                return '<div class="wl"><span>' + (spaet ? '⚠ ' : '')
                    + esc(dep ? dep.titel : ('Aufgabe ' + depId)) + '</span>'
                    + '<button type="button" class="tlv-dep-x" data-dep="' + esc(depId) + '" title="Abhängigkeit entfernen">&times;</button></div>';
            }).join('');
            var kandidaten = ITEMS.filter(function (x) {
                return x.quelle === 'tasks' && x.id !== it.id
                    && (it.abhaengigVon || []).indexOf(String(x.dbId)) < 0;
            }).sort(function (a, b) { return a.titel.localeCompare(b.titel, 'de'); });
            h += '<h5>Hängt ab von</h5>'
                + (vonListe || '<div class="kv"><span>—</span><b>keine</b></div>')
                + (kandidaten.length
                    ? '<div class="tlv-dep-add"><select id="tlv-dep-select" class="glass-input">'
                        + '<option value="">Aufgabe wählen …</option>'
                        + kandidaten.map(function (x) {
                            return '<option value="' + esc(x.dbId) + '">' + esc(x.titel) + '</option>';
                        }).join('')
                        + '</select><button type="button" class="btn-secondary" id="tlv-dep-add-btn">+ hinzufügen</button></div>'
                    : '');
        }

        /* Status, Herkunft (Tabelle/Spalten) und die Arbeitszeiten aus dem
           work_log standen hier frueher mit drin. Beim Planen braucht das
           niemand: der Status ist Sache des jeweiligen Fensters, die Herkunft
           war eine Entwicklerangabe, und die Arbeitszeiten stehen im
           Servicebericht selbst. Wandern beim Verschieben trotzdem mit. */


        h += '<div class="acts">' + oeffnenKnopf(it) + '</div>';
        p.innerHTML = h;

        var zu = document.getElementById('tlv-panel-zu');
        if (zu) zu.onclick = function () { S.gewaehlt = null; zeichnePanel(); };
        var oeff = document.getElementById('tlv-oeffnen');
        if (oeff) oeff.onclick = function () { oeffne(it); };

        Array.prototype.forEach.call(p.querySelectorAll('.tlv-dep-x'), function (btn) {
            btn.onclick = function () { abhaengigkeitEntfernen(it, btn.dataset.dep); };
        });
        var depAdd = document.getElementById('tlv-dep-add-btn');
        var depSel = document.getElementById('tlv-dep-select');
        if (depAdd && depSel) depAdd.onclick = function () {
            if (depSel.value) abhaengigkeitHinzufuegen(it, depSel.value);
        };

        var wIn = document.getElementById('tlv-panel-wochen');
        var hIn = document.getElementById('tlv-panel-stunden');
        if (wIn && hIn) {
            wIn.onchange = function () {
                var w = parseDe(wIn.value);
                if (!isFinite(w) || w <= 0) { wIn.value = fmtDe(wochenAusTagen(tage(it.von, it.bis) + 1)); return; }
                hIn.value = fmtDe(stundenAusWochen(w));
                dauerSetzen(it, tageAusWochen(w));
            };
            hIn.onchange = function () {
                var h = parseDe(hIn.value);
                if (!isFinite(h) || h <= 0) { hIn.value = fmtDe(stundenAusWochen(wochenAusTagen(tage(it.von, it.bis) + 1))); return; }
                var w = wochenAusStunden(h);
                wIn.value = fmtDe(w);
                dauerSetzen(it, tageAusWochen(w));
            };
        }
    }
    function oeffnenKnopf(it) {
        if (it.quelle === 'service_entries' && typeof window.jumpToServicebericht === 'function')
            return '<button class="btn-primary" id="tlv-oeffnen">Servicebericht öffnen</button>';
        if (it.quelle === 'rental_agreements' && typeof window.openMietvereinbarung === 'function')
            return '<button class="btn-primary" id="tlv-oeffnen">Mietvereinbarung öffnen</button>';
        if (it.maschine && typeof window.openMachineDetails === 'function')
            return '<button class="btn-primary" id="tlv-oeffnen">Maschine öffnen</button>';
        return '';
    }
    function oeffne(it) {
        try {
            /* Servicebericht: jumpToServicebericht sucht in
               window.allServiceEntries. Wer direkt in der Timeline landet, hat
               diese Liste womoeglich noch nie geladen — dann erst nachladen,
               sonst kaeme nur "Bericht nicht gefunden". */
            if (it.quelle === 'service_entries' && typeof window.jumpToServicebericht === 'function') {
                var los = function () { window.jumpToServicebericht(it.dbId); };
                if (!(window.allServiceEntries || []).length
                    && typeof window.fetchServiceEntries === 'function') {
                    Promise.resolve(window.fetchServiceEntries()).then(los, los);
                } else los();
                return;
            }
            if (it.quelle === 'rental_agreements' && typeof window.openMietvereinbarung === 'function') {
                window.openMietvereinbarung(it.maschine, it.dbId); return;
            }
            if (it.maschine && typeof window.openMachineDetails === 'function') {
                window.openMachineDetails(it.maschine); return;
            }
        } catch (e) { console.error('[timeline] Öffnen fehlgeschlagen', e); }
    }

    // ------------------------------------------------------------------
    // Bedienelemente
    // ------------------------------------------------------------------
    function setzePreset(k) {
        var p = PRESETS[k]; if (!p) return;
        S.preset = k; S.achse = p.achse; S.sorten = new Set(p.sorten);
        var a = document.getElementById('tlv-achse'); if (a) a.value = p.achse;
        chipsAbgleichen();
    }
    /* Eigenes Klappmenue statt <select>: das Systemmenue eines Selects laesst
       sich nicht gestalten und war auf dunklem Grund kaum zu lesen. */
    function presetAbgleichen() {
        var lab = document.getElementById('tlv-preset-label');
        if (lab) lab.textContent = S.preset && PRESETS[S.preset]
            ? PRESETS[S.preset].label : 'eigene Auswahl';
        Array.prototype.forEach.call(document.querySelectorAll('#tlv-presets .tlv-wahl'), function (b) {
            b.classList.toggle('aktiv', b.dataset.p === S.preset);
        });
        // Auch beim ersten Zeichnen muss das Achsen-Menue zum Zustand passen.
        var a = document.getElementById('tlv-achse'); if (a) a.value = S.achse;
        chipsAbgleichen();
    }
    function chipsAbgleichen() {
        Array.prototype.forEach.call(document.querySelectorAll('#tlv-filter .tlv-chip'), function (c) {
            c.classList.toggle('aktiv', S.sorten.has(c.dataset.s));
        });
        filterZahlAbgleichen();
    }
    /* Der Knopf „Filter“ traegt die Zahl der aktiven Sorten — sonst sieht
       niemand, dass hinter dem zugeklappten Menue etwas ausgeblendet ist. */
    function filterZahlAbgleichen() {
        var el = document.getElementById('tlv-filter-zahl');
        if (!el) return;
        var alle = Object.keys(SORTEN), an = 0;
        alle.forEach(function (k) { if (S.sorten.has(k)) an++; });
        var eingeschraenkt = an < alle.length || !!S.person;
        el.textContent = eingeschraenkt ? an + '/' + alle.length : '';
        el.style.display = eingeschraenkt ? '' : 'none';
        var btn = document.getElementById('tlv-filter-btn');
        if (btn) btn.classList.toggle('aktiv', eingeschraenkt);
    }
    /* Klappmenues im Kopf: ein offenes zur Zeit, Klick daneben und Esc zu. */
    function popSchliessen() {
        Array.prototype.forEach.call(document.querySelectorAll('#timeline .tlv-pop-wrap'), function (w) {
            w.classList.remove('offen');
            var b = w.querySelector('.tlv-tool');
            if (b) b.setAttribute('aria-expanded', 'false');
        });
    }
    function popBinden(btnId) {
        var btn = document.getElementById(btnId);
        if (!btn) return;
        var wrap = btn.parentNode;
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            var offen = wrap.classList.contains('offen');
            popSchliessen();
            if (!offen) { wrap.classList.add('offen'); btn.setAttribute('aria-expanded', 'true'); }
        });
        wrap.addEventListener('click', function (e) { e.stopPropagation(); });
    }
    /* Zurueck zu heute: Anker auf heute, gewaehlte Breite, Buehne nach links. */
    function zumHeute() {
        S.anker = heuteDatum(); S.spalten = S.basisSpalten; zeichne();
        var buehne = document.getElementById('tlv-buehne');
        if (buehne) buehne.scrollLeft = 0;
    }
    window.timelineHeute = zumHeute;
    function schiebe(r) {
        if (S.raster === 'woche') S.anker.setDate(S.anker.getDate() + 28 * r);
        else S.anker.setDate(S.anker.getDate() + 7 * r);
        S.anker = new Date(S.anker);
        /* Das Fenster behaelt beim Blaettern seine gewaehlte Breite. Vorher
           blieb eine automatische Verbreiterung (zeichne(): Balken ragt ueber
           das Ende hinaus) stehen und wuchs mit jedem Schritt weiter — bis zu
           180 Spalten. Die Buehne war dann meterbreit, die Balken lagen weit
           rechts ausserhalb des Sichtfelds, und es sah aus, als waere nichts
           mehr da. Erst ein Neuladen setzte die Breite zurueck. */
        S.spalten = S.basisSpalten;
        zeichne();
        var buehne = document.getElementById('tlv-buehne');
        if (buehne) buehne.scrollLeft = 0;
    }

    /* "Weiter" (nach rechts): statt das Fenster nur zu verschieben, wird es
       einfach breiter — ein laengerer Zeitraum, ohne dass oben erst am
       Filter gedreht werden muss. "Zurueck" nimmt diese Erweiterung erst
       wieder zurueck, bevor er wie gewohnt das Fenster verschiebt. */
    var SPALTEN_DECKEL = { tag: 180, woche: 52 };
    function weiterRechts() {
        var deckel = SPALTEN_DECKEL[S.raster] || 180;
        var schrittSp = S.raster === 'woche' ? 4 : 7;
        S.spalten = Math.min(deckel, S.spalten + schrittSp);
        zeichne();
    }
    /* Zeitraum wieder verkuerzen — Gegenstueck zu weiterRechts(), Untergrenze
       ist eine Woche bzw. (im Wochenraster) vier Spalten. */
    function engerMachen() {
        var schrittSp = S.raster === 'woche' ? 4 : 7;
        S.spalten = Math.max(schrittSp, S.spalten - schrittSp);
        S.basisSpalten = Math.min(S.basisSpalten, S.spalten);
        zeichne();
    }
    /* Waehrend des Ziehens (Balken verlaengern, verschieben oder neu
       aufziehen) an den rechten Rand des Fensters gekommen? Dann sofort
       um einen runden Schub verbreitern, statt erst beim Loslassen — sonst
       kommt man mit der Maus nie ueber den sichtbaren Rand hinaus, weil da
       schlicht nichts mehr zum Hinziehen ist. Das Neuzeichnen ersetzt dabei
       das ganze Grid; ein laufender Drag haengt seine Referenzen (Balken,
       Zeile) deshalb hinterher an den frischen Knoten um. */
    function liveErweiternRechts() {
        var deckel = SPALTEN_DECKEL[S.raster] || 180;
        if (S.spalten >= deckel) return false;
        var schrittSp = S.raster === 'woche' ? 4 : 7;
        S.spalten = Math.min(deckel, S.spalten + schrittSp);
        zeichne();
        if (drag) {
            var neuBar = null;
            Array.prototype.forEach.call(document.querySelectorAll('#timeline .tlv-bar'), function (b) {
                if (b.dataset.id === drag.haupt.id) neuBar = b;
            });
            if (neuBar) { drag.bar = neuBar; neuBar.classList.add('zieht'); }
            zeilenVermessen();
            if (drag.quelleZeile) {
                var wiederQ = zeilenBox.filter(function (z) { return z.key === drag.quelleZeile.key; })[0];
                if (wiederQ) { drag.quelleZeile = wiederQ; drag.zielZeile = wiederQ; }
                var neueSpur = document.querySelector(
                    '#timeline .tlv-track[data-row="' + drag.quelleZeile.key + '"]');
                if (neueSpur) drag.spur = neueSpur;
            }
        }
        return true;
    }

    /* Die Personenliste steht erst nach dem Laden fest — deshalb sowohl beim
       Aufbau der Bedienung als auch am Ende von ladeAlles() aufgerufen. */
    function fuellePersonen() {
        var sel = document.getElementById('tlv-person');
        if (!sel) return;
        var vorher = S.person;
        sel.innerHTML = '<option value="">alle Personen</option>'
            + MONTEURE.map(function (p) {
                return '<option value="' + esc(p.id) + '">' + esc(p.name) + '</option>';
            }).join('');
        sel.value = vorher;
        if (sel.value !== vorher) { S.person = ''; sel.value = ''; }
    }

    var aufgebaut = false;
    function baueBedienung() {
        if (aufgebaut) return;
        var wurzel = document.getElementById('timeline');
        if (!wurzel) return;
        aufgebaut = true;

        var pres = document.getElementById('tlv-presets');
        if (pres) {
            pres.innerHTML = Object.keys(PRESETS).map(function (k) {
                return '<button type="button" class="tlv-wahl" data-p="' + k + '">'
                     + PRESETS[k].label + '</button>';
            }).join('');
            pres.addEventListener('click', function (e) {
                var b = e.target.closest('.tlv-wahl'); if (!b) return;
                setzePreset(b.dataset.p); popSchliessen(); zeichne();
            });
        }
        var filt = document.getElementById('tlv-filter');
        if (filt) {
            filt.innerHTML = Object.keys(SORTEN).map(function (k) {
                return '<span class="tlv-chip aktiv" data-s="' + k + '" style="--c:' + SORTEN[k].farbe
                     + '"><i></i>' + SORTEN[k].label + '</span>';
            }).join('');
            filt.onclick = function (e) {
                var c = e.target.closest('.tlv-chip'); if (!c) return;
                var k = c.dataset.s;
                if (S.sorten.has(k)) S.sorten.delete(k); else S.sorten.add(k);
                c.classList.toggle('aktiv'); S.preset = null; zeichne();
            };
        }
        var leg = document.getElementById('tlv-legende');
        if (leg) leg.innerHTML =
            Object.keys(SORTEN).map(function (k) {
                return '<span class="tlv-leg" style="--c:' + SORTEN[k].farbe + '"><i></i>'
                     + SORTEN[k].label + '</span>';
            }).join('')
            + '<span style="opacity:.4">|</span>'
            + Object.keys(ORTE).map(function (k) {
                return '<span class="tlv-leg" style="--c:' + ORTE[k].farbe
                     + '"><i style="opacity:.35"></i>' + ORTE[k].label + '</span>';
            }).join('')
            + '<span style="flex:1"></span>'
            + '<span>Ziehen = verschieben · Kante = verlängern · Shift+Klick = mehrere · Strg+Z = rückgängig</span>';

        function an(id, ereignis, fn) {
            var el = document.getElementById(id);
            if (el) el.addEventListener(ereignis, fn);
        }
        /* Die Pfeile verschieben das Fenster — nichts weiter. Frueher machte
           "›" es breiter und "‹" wieder schmaler; wer nur nach vorn blaettern
           wollte, bekam stattdessen einen immer laengeren Zeitraum. Breiter
           und schmaler machen jetzt die Knoepfe − und +. */
        an('tlv-prev', 'click', function () { schiebe(-1); });
        an('tlv-next', 'click', function () { schiebe(1); });
        an('tlv-frei-btn', 'click', function () { zeichneFrei(); });
        an('tlv-weiter', 'click', function () { weiterRechts(); });
        an('tlv-enger', 'click', function () { engerMachen(); });
        an('tlv-heute', 'click', function () { zumHeute(); });
        an('tlv-neu-laden', 'click', function () { S.geladen = false; ladeAlles(); });
        an('tlv-achse', 'change', function (e) { S.achse = e.target.value; S.preset = null; zeichne(); });
        an('tlv-spanne', 'change', function (e) {
            var v = e.target.value;
            // "__akt" ist nur die Anzeige des gerade sichtbaren Zeitraums —
            // daraus laesst sich keine Spaltenzahl lesen.
            if (v === '__akt') return;
            S.raster = v.charAt(0) === 'w' ? 'woche' : 'tag';
            S.spalten = S.basisSpalten = parseInt(v.slice(1), 10);
            zeichne();   // die Spaltenbreite ergibt sich aus der Buehne
        });
        an('tlv-leer', 'change', function (e) { S.leereZeilen = e.target.checked; zeichne(); });
        an('tlv-summe', 'change', function (e) {
            wurzel.classList.toggle('tlv-mit-summe', e.target.checked); zeichne();
        });
        an('tlv-kompakt', 'change', function (e) {
            wurzel.classList.toggle('tlv-kompakt', e.target.checked); zeichne();
        });
        an('tlv-speichern', 'change', function (e) {
            S.schreiben = e.target.checked;
            wurzel.classList.toggle('tlv-schreibt', S.schreiben);
            meldung(S.schreiben
                ? 'Änderungen werden ab jetzt gespeichert.'
                : 'Änderungen bleiben in der Anzeige.', false);
            zeichnePanel();
        });
        // Auf der Timeline wird von Anfang an gespeichert (S.schreiben
        // startet auf true) — Schalter und Hinweiszeile mit dem Zustand
        // synchron starten, ohne dass erst ein change-Ereignis noetig ist.
        var spSchalter = document.getElementById('tlv-speichern');
        if (spSchalter) spSchalter.checked = S.schreiben;
        wurzel.classList.toggle('tlv-schreibt', S.schreiben);
        an('tlv-suche', 'input', function (e) { S.suche = e.target.value.trim(); zeichne(); });
        an('tlv-person', 'change', function (e) { S.person = e.target.value; zeichne(); });
        an('tlv-alle-sorten', 'click', function () {
            var alle = Object.keys(SORTEN);
            var vollstaendig = alle.every(function (k) { return S.sorten.has(k); });
            S.sorten = vollstaendig ? new Set() : new Set(alle);
            S.preset = null; chipsAbgleichen(); zeichne();
        });
        /* Vollbild: Seitenleiste und Kopfleiste der App ausblenden, die
           Timeline auf den ganzen Bildschirm ziehen. Zusaetzlich — wenn der
           Browser mitspielt — echtes Vollbild, damit auch seine Leisten weg
           sind. Schlaegt das fehl (z. B. ohne Nutzergeste), bleibt die
           Ansicht trotzdem gross; deshalb kein Abbruch im catch. */
        an('tlv-vollbild', 'click', function () {
            var voll = !document.body.classList.contains('tlv-vollbild');
            document.body.classList.toggle('tlv-vollbild', voll);
            try {
                if (voll && document.documentElement.requestFullscreen) {
                    document.documentElement.requestFullscreen().catch(function () {});
                } else if (!voll && document.fullscreenElement && document.exitFullscreen) {
                    document.exitFullscreen().catch(function () {});
                }
            } catch (e) { /* Vollbild vom Browser abgelehnt — halb so wild */ }
            // Spaltenbreite und Zeilenhoehe an die neue Flaeche anpassen.
            setTimeout(function () { breiteVerteilen(S.spalten); hoeheVerteilen(); schriftEinpassen(); }, 120);
        });
        // Esc verlaesst das Vollbild, auch wenn der Browser gar nicht erst
        // in sein eigenes Vollbild gegangen ist.
        document.addEventListener('keydown', function (e) {
            if (e.key !== 'Escape' || !document.body.classList.contains('tlv-vollbild')) return;
            document.body.classList.remove('tlv-vollbild');
            if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen();
            setTimeout(function () { breiteVerteilen(S.spalten); hoeheVerteilen(); schriftEinpassen(); }, 120);
        });
        // Verlaesst der Nutzer das Browser-Vollbild (F11/Esc), auch unseres.
        document.addEventListener('fullscreenchange', function () {
            if (!document.fullscreenElement) document.body.classList.remove('tlv-vollbild');
            setTimeout(function () { breiteVerteilen(S.spalten); hoeheVerteilen(); schriftEinpassen(); }, 120);
        });

        popBinden('tlv-preset-btn');
        popBinden('tlv-filter-btn');
        popBinden('tlv-ansicht-btn');
        document.addEventListener('click', popSchliessen);
        document.addEventListener('keydown', function (e) { if (e.key === 'Escape') popSchliessen(); });
        fuellePersonen();

        // Voreinstellung aus dem Zustand uebernehmen (Vorgabe: Aufgaben) —
        // hier stand fest 'vermiet' und hat die Vorgabe bei jedem Oeffnen
        // wieder ueberschrieben.
        setzePreset(S.preset || 'aufgaben');
    }

    // ------------------------------------------------------------------
    // Start — beim ersten Anzeigen der Ansicht laden
    // ------------------------------------------------------------------
    function ansichtGeoeffnet() {
        baueBedienung();
        if (S.laedt) return;
        // Beim Oeffnen frisch holen, wenn der Stand aelter als 20 s ist.
        // Gezeichnet wird sofort mit dem alten Stand, damit die Ansicht nicht
        // leer aufblitzt — ladeAlles zeichnet danach neu.
        if (!S.geladen) { ladeAlles(); return; }
        zeichne();
        if (Date.now() - GELADEN_AM > NEULADEN_NACH) ladeAlles();
    }

    document.addEventListener('click', function (e) {
        var link = e.target.closest('[data-target="timeline"]');
        if (link) setTimeout(ansichtGeoeffnet, 60);
    });
    window.addEventListener('hashchange', function () {
        if (window.location.hash.replace('#', '') === 'timeline') setTimeout(ansichtGeoeffnet, 60);
    });
    document.addEventListener('DOMContentLoaded', function () {
        if (window.location.hash.replace('#', '') === 'timeline') setTimeout(ansichtGeoeffnet, 400);
    });

    // Fenstergroesse geaendert (auch Sidebar auf-/zuklappen): Spaltenbreite
    // nachziehen, ohne alles neu zu bauen.
    var breitenTimer = null;
    window.addEventListener('resize', function () {
        var v = document.getElementById('timeline');
        if (!v || v.classList.contains('hidden')) return;
        clearTimeout(breitenTimer);
        breitenTimer = setTimeout(function () {
            breiteVerteilen(S.spalten);
            hoeheVerteilen();
            schriftEinpassen();
        }, 120);
    });

    // Von aussen aufrufbar (z. B. aus dem Dashboard)
    window.openTimelineView = function () {
        if (typeof window.switchView === 'function') window.switchView('timeline');
        ansichtGeoeffnet();
    };
    window.timelineNeuLaden = function () { S.geladen = false; ladeAlles(); };
})();
