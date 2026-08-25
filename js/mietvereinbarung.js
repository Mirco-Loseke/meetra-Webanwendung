// ==========================================================
// MIETVEREINBARUNG
// ----------------------------------------------------------
// Bildet die Papiervorlage "meetra Mietvertrag Trommelsiebmaschine"
// im Browser nach: Mieterangaben, Mietgeraet, Baugruppen-Abnahme mit
// runden Ankreuzfeldern je Uebergabe und Rueckgabe, Vorschaeden,
// Fotopositionen und Unterschriften.
//
// EIGENSTAENDIG UND RUECKBAUBAR:
//   Diese Datei + css/views/mietvereinbarung.css loeschen und die drei
//   mit "MIETVEREINBARUNG" markierten Stellen in index.html,
//   js/history-modal.js und sw.js entfernen — dann ist die Funktion
//   restlos verschwunden. Kein anderes Modul haengt daran.
//
// STAND: reine Ansicht. Es wird noch NICHTS gespeichert (kein Supabase,
//   keine Fotos in R2). Fotos leben nur im Arbeitsspeicher des Fensters.
// ==========================================================

(function () {
    'use strict';

    // ------------------------------------------------------
    // Zustand des geoeffneten Fensters
    // ------------------------------------------------------
    let daten = null;      // alle Eingaben
    let vorlage = null;    // Aufbau des Bogens (Einstellungen → Mietvereinbarungen)
    let maschine = null;   // Maschine, an der die Vereinbarung haengt
    let phase = 'uebergabe'; // 'uebergabe' | 'ruecknahme'
    let a4Modus = false;   // auf dem Handy kurz auf echtes A4 umschalten (Druck/PDF)
    let gespeicherteId = null; // Zeile in rental_agreements, sobald einmal gespeichert
    let gespeichertesDoc = null; // zugehoeriges Dokument unter "Dokumente"
    let padZiel = null;    // welches Unterschriftenfeld gerade gezeichnet wird

    // Fotopositionen der aktuellen Vorlage. Die Reihenfolge ist zugleich
    // die Nummer auf dem Ausdruck und die Reihenfolge, in der die Kamera
    // durchfuehrt.
    function fotoPositionen() {
        const f = vorlage && vorlage.fotos;
        return (Array.isArray(f) && f.length) ? f : ['Gesamtansicht'];
    }

    // Prüfpunkte sind entweder Text oder ein Objekt mit Ausführungen und
    // Optional-Kennzeichen (js/mietvereinbarung-vorlagen.js). Fehlt das
    // Vorlagen-Modul, wird hier notdürftig dasselbe gemacht.
    function punktLesen(p) {
        if (typeof window.mietPunktLesen === 'function') return window.mietPunktLesen(p);
        return { text: String(p == null ? '' : p), optional: false, mehrfach: false, optionen: [] };
    }

    function leereDaten() {
        const d = {
            mieter: { name: '', street: '', zip_city: '', ausweis: '', einsatzort: '', customer_id: null },
            geraet: { typ: '', bezeichnung: '', seriennummer: '' },
            // Vorbelegt mit dem heutigen Tag und der aktuellen Uhrzeit —
            // beides bleibt normal anklickbar und aenderbar.
            miete: {
                abholdatum: heute(), abholzeit: jetztUhrzeit(), beginn: heute(), beginn_bs: '',
                ende: '', ende_bs: '', tagessatz: '', zusatzinfo: vorlage.zusatzinfo || ''
            },
            pruefpunkte: {},   // "nr" -> { spaltenId: 'io' | 'nio' | null }
            auswahl: {},       // "nr" -> ['12 mm'] — gewählte Ausführungen
            trommeltyp: '',
            sauberkeit: { gereinigt: {}, diesel: {}, sonstiges: '' },
            einweisung: { erfolgt: null, durch_id: '', durch_name: '' },
            schaeden: [{ nr: '', position: '', beschreibung: '' }],
            fotos: { uebergabe: {}, ruecknahme: {} },
            unterschriften: {
                u_vermieter: null, u_mieter: null,   // Übergabe
                r_vermieter: null, r_mieter: null    // Rücknahme
            }
        };
        let nr = 1;
        (vorlage.baugruppen || []).forEach(g => (g.punkte || []).forEach(() => { d.pruefpunkte[nr] = {}; nr++; }));
        (vorlage.spalten || []).forEach(s => { d.sauberkeit.gereinigt[s.id] = null; d.sauberkeit.diesel[s.id] = ''; });
        return d;
    }

    function heute() {
        const d = new Date();
        const p = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    }

    function jetztUhrzeit() {
        const d = new Date();
        const p = (n) => String(n).padStart(2, '0');
        return `${p(d.getHours())}:${p(d.getMinutes())}`;
    }

    const esc = (s) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    // ------------------------------------------------------
    // Oeffnen
    // ------------------------------------------------------
    // agreementId gesetzt = eine gespeicherte Mietvereinbarung wird zum
    // Bearbeiten geöffnet (Maschine → Ansehen → Mietvereinbarung).
    // Speichern überschreibt dann genau diese Zeile.
    window.openMietvereinbarung = async function (machineId, agreementId) {
        if (machineId === 'null' || machineId === 'undefined') machineId = null;

        // Vorlagen sicherheitshalber nachladen, falls das Vorladen beim
        // Start noch nicht durch war.
        if (typeof window.fetchMietVorlagen === 'function'
            && typeof window.mietVorlagenGeladen === 'function'
            && !window.mietVorlagenGeladen()) {
            try { await window.fetchMietVorlagen(); } catch (e) { /* Standard genügt */ }
        }

        maschine = null;
        if (machineId) {
            maschine = (window.machineList || []).find(m => String(m.id) === String(machineId)) || null;
        }

        // Aufbau des Bogens: je Maschinentyp kann in den Einstellungen eine
        // eigene Vorlage hinterlegt sein. Ohne Treffer greift der Standard.
        vorlage = (typeof window.getMietVorlage === 'function')
            ? window.getMietVorlage(maschine ? maschine.category_id : null)
            : (window.MIET_VORLAGE_STANDARD || {});

        daten = leereDaten();
        phase = 'uebergabe';
        gespeicherteId = null;
        gespeichertesDoc = null;

        // Angaben zum Mietgeraet aus der Maschine uebernehmen.
        if (maschine) {
            const kat = (window.categoryList || []).find(c => String(c.id) === String(maschine.category_id));
            daten.geraet.typ = kat ? kat.name : (maschine.manufacturer || '');
            daten.geraet.bezeichnung = [maschine.manufacturer, maschine.name].filter(Boolean).join(' ');
            daten.geraet.seriennummer = maschine.serial || '';
            // Einsatzort: falls die Maschine schon einen Standort hat, als Vorschlag.
            const ort = [maschine.location_street, [maschine.location_zip, maschine.location_city].filter(Boolean).join(' ')]
                .filter(Boolean).join(', ');
            if (ort) daten.mieter.einsatzort = ort;
        }

        // Einweisung: der angemeldete Benutzer ist die wahrscheinlichste Wahl.
        if (window.activeUser && window.activeUser.id) {
            daten.einweisung.durch_id = String(window.activeUser.id);
            daten.einweisung.durch_name = window.activeUser.name || '';
        }

        // Gespeicherten Stand laden, bevor gezeichnet wird — sonst blitzt
        // kurz ein leerer Bogen auf.
        const geladen = agreementId ? await ladeVereinbarung(agreementId) : false;

        zeichneFenster();
        uebernehmeEinweiserUnterschrift();
        if (!geladen) ladeBetriebsstunden();
    };

    // Eine gespeicherte Zeile aus rental_agreements in den Bogen holen.
    // Die Fotos liegen dort als Adressen in Cloudflare R2 (nicht mehr als
    // Daten-URL) — der Bogen zeigt beides gleich an.
    async function ladeVereinbarung(id) {
        if (!window.supabaseClient) return false;
        try {
            const { data, error } = await window.supabaseClient
                .from('rental_agreements').select('*').eq('id', id).maybeSingle();
            if (error) throw error;
            if (!data) return false;

            const d = data.data || {};
            ['mieter', 'geraet', 'miete', 'sauberkeit', 'einweisung', 'unterschriften'].forEach(k => {
                if (d[k] && typeof d[k] === 'object') Object.assign(daten[k], d[k]);
            });
            if (d.pruefpunkte && typeof d.pruefpunkte === 'object') daten.pruefpunkte = d.pruefpunkte;
            if (d.auswahl && typeof d.auswahl === 'object') daten.auswahl = d.auswahl;
            if (Array.isArray(d.schaeden) && d.schaeden.length) daten.schaeden = d.schaeden;
            if (d.trommeltyp != null) daten.trommeltyp = d.trommeltyp;

            (Array.isArray(data.photos) ? data.photos : []).forEach(f => {
                if (!f || !f.url || !f.phase || !f.position) return;
                if (!daten.fotos[f.phase]) daten.fotos[f.phase] = {};
                daten.fotos[f.phase][f.position] = f.url;
            });

            gespeicherteId = data.id;
            gespeichertesDoc = null;   // wird beim Speichern nachgeschlagen
            return true;
        } catch (e) {
            console.error('Mietvereinbarung konnte nicht geladen werden:', e);
            window.showToast('Die gespeicherte Mietvereinbarung konnte nicht geladen werden.');
            return false;
        }
    }

    // Zuletzt abgelesene Betriebsstunden der Maschine als Startwert fuer
    // den Mietbeginn. Gesucht wird an denselben zwei Stellen wie in der
    // Maschinen-Detailansicht: im letzten Servicebericht und in den von
    // Hand erfassten Historieneintraegen vom Typ "hours" — es gewinnt der
    // juengere Wert.
    //
    // Das laeuft absichtlich NACH dem Oeffnen: der Bogen soll nicht auf
    // die Datenbank warten. Eingetragen wird nur, wenn das Feld noch leer
    // ist, damit eine eigene Eingabe nie ueberschrieben wird.
    async function ladeBetriebsstunden() {
        if (!maschine || !window.supabaseClient) return;
        try {
            const [bericht, manuell] = await Promise.all([
                window.supabaseClient
                    .from('service_entries')
                    .select('operating_hours, date')
                    .eq('machine_id', maschine.id)
                    .not('operating_hours', 'is', null)
                    .neq('operating_hours', '')
                    .order('date', { ascending: false })
                    .limit(1),
                window.supabaseClient
                    .from('manual_history_entries')
                    .select('content, created_at')
                    .eq('machine_id', maschine.id)
                    .eq('type', 'hours')
                    .order('created_at', { ascending: false })
                    .limit(1)
            ]);

            const a = (bericht.data && bericht.data[0])
                ? { stunden: bericht.data[0].operating_hours, am: new Date(bericht.data[0].date) } : null;
            const b = (manuell.data && manuell.data[0])
                ? { stunden: manuell.data[0].content, am: new Date(manuell.data[0].created_at) } : null;

            const neuester = (a && b) ? (a.am >= b.am ? a : b) : (a || b);
            if (!neuester || neuester.stunden == null) return;

            // "1450 Std." / "1450 h" -> "1450"
            const wert = String(neuester.stunden).trim().replace(/\s*(h|std\.?|stunden)\s*$/i, '').trim();
            if (!wert || daten.miete.beginn_bs) return;

            daten.miete.beginn_bs = wert;

            // Nur das eine Feld nachtragen statt den ganzen Bogen neu zu
            // zeichnen — sonst springt der Schreibcursor weg, falls schon
            // jemand tippt.
            const feld = document.querySelector('[data-feld="miete.beginn_bs"]');
            if (feld && !feld.textContent.trim() && feld !== document.activeElement) {
                feld.textContent = wert;
                window.mietSeitenPruefen();
            }
        } catch (e) {
            console.warn('Betriebsstunden konnten nicht geladen werden:', e && e.message);
        }
    }

    window.closeMietvereinbarung = function () {
        const ov = document.getElementById('miet-overlay');
        if (ov) ov.classList.remove('open');
        document.body.style.overflow = '';
        window.removeEventListener('resize', skaliereSeiten);
        window.mietBildZu();
        menuSchliessen();
    };

    window.setMietPhase = function (p) {
        phase = p;
        zeichneInhalt();
    };

    // ------------------------------------------------------
    // Fenstergeruest (dunkel) — wird einmal je Oeffnen gebaut
    // ------------------------------------------------------
    function zeichneFenster() {
        let ov = document.getElementById('miet-overlay');
        if (ov) ov.remove();

        ov = document.createElement('div');
        ov.id = 'miet-overlay';
        ov.className = 'miet-overlay';
        ov.innerHTML = `
            <div class="miet-modal" onclick="event.stopPropagation()">
                <div class="miet-head">
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#34d399" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline><line x1="9" y1="15" x2="15" y2="15"></line>
                    </svg>
                    <div>
                        <h2>${esc(vorlage.titel || 'Mietvereinbarung')}</h2>
                        <div class="miet-sub">${maschine
                ? esc([maschine.manufacturer, maschine.name, maschine.serial ? '#' + maschine.serial : ''].filter(Boolean).join(' '))
                : 'Ohne Maschinenbezug'}</div>
                    </div>
                    <div class="miet-head-spacer"></div>
                    <button class="miet-close" onclick="window.closeMietvereinbarung()" title="Schließen">&times;</button>
                </div>

                <div class="miet-phase-switch">
                    <button type="button" id="miet-phase-u" class="miet-phase-btn" onclick="window.setMietPhase('uebergabe')">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;">
                            <path d="M5 12h14"></path><path d="M13 6l6 6-6 6"></path>
                        </svg>
                        <span>Übergabe an den Mieter<small>Abholung bzw. Auslieferung — Zustand bei Übernahme</small></span>
                    </button>
                    <button type="button" id="miet-phase-r" class="miet-phase-btn miet-phase-back" onclick="window.setMietPhase('ruecknahme')">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;">
                            <path d="M19 12H5"></path><path d="M11 18l-6-6 6-6"></path>
                        </svg>
                        <span>Rücknahme vom Mieter<small>Rückgabe an meetra — Zustand bei Rückgabe</small></span>
                    </button>
                </div>

                <div class="miet-body">
                    <div class="miet-pages-wrap" id="miet-pages-wrap">
                        <div class="miet-pages" id="miet-pages"></div>
                    </div>
                </div>

                <div class="miet-foot">
                    <span class="miet-note" id="miet-status">Speichern legt das PDF unter „Dokumente → Mietvereinbarung" ab.</span>
                    <span id="miet-seitenzahl" style="font-size:0.78rem; color:rgba(255,255,255,0.45);"></span>
                    <button class="btn-secondary" onclick="window.closeMietvereinbarung()">Schließen</button>
                    <button class="btn-secondary" onclick="window.mietDrucken()">Drucken / PDF</button>
                    <button class="btn-primary" id="miet-save-btn" onclick="window.mietSpeichern()">Speichern</button>
                </div>
            </div>

            <div class="miet-cam" id="miet-cam">
                <div class="miet-cam-flash" id="miet-cam-flash"></div>
                <div class="miet-cam-head">
                    <div>
                        <div class="miet-cam-title" id="miet-cam-title"></div>
                        <div class="miet-cam-step" id="miet-cam-step"></div>
                    </div>
                    <button class="miet-lb-close" style="position:static;" onclick="window.mietKameraSchliessen()" title="Beenden">&times;</button>
                </div>
                <div class="miet-cam-stage">
                    <video id="miet-cam-video" autoplay playsinline muted></video>
                </div>
                <div class="miet-cam-strip" id="miet-cam-strip"></div>
                <div class="miet-cam-next" id="miet-cam-next"></div>
                <div class="miet-cam-foot">
                    <button class="miet-cam-side" onclick="window.mietKameraZurueck()" title="Eine Ansicht zurück">Zurück</button>
                    <button class="miet-cam-shot" onclick="window.mietKameraAusloesen()" title="Auslösen (Leertaste)"><span></span></button>
                    <button class="miet-cam-side" onclick="window.mietKameraUeberspringen()" title="Diese Ansicht auslassen">Überspringen</button>
                </div>
            </div>

            <div class="miet-lightbox" id="miet-lightbox">
                <button class="miet-lb-close" onclick="window.mietBildZu()" title="Schließen">&times;</button>
                <div class="miet-lb-title" id="miet-lb-title"></div>
                <div class="miet-lb-stage">
                    <button class="miet-lb-nav" id="miet-lb-prev" onclick="window.mietBildBlaettern(-1)" title="Vorheriges Bild">&#8249;</button>
                    <img id="miet-lb-img" alt="">
                    <button class="miet-lb-nav" id="miet-lb-next" onclick="window.mietBildBlaettern(1)" title="Nächstes Bild">&#8250;</button>
                </div>
                <div class="miet-lb-dots" id="miet-lb-dots"></div>
            </div>

            <div class="miet-pad-overlay" id="miet-pad-overlay">
                <div class="miet-pad-card">
                    <h3 id="miet-pad-title">Unterschrift</h3>
                    <canvas id="miet-pad-canvas"></canvas>
                    <div class="miet-pad-actions">
                        <button class="btn-secondary" onclick="window.mietPadClear()">Löschen</button>
                        <button class="btn-secondary" onclick="window.mietPadCancel()">Abbrechen</button>
                        <button class="btn-primary" onclick="window.mietPadSave()">Übernehmen</button>
                    </div>
                </div>
            </div>`;
        document.body.appendChild(ov);
        ov.classList.add('open');
        document.body.style.overflow = 'hidden';
        zeichneInhalt();
        window.addEventListener('resize', skaliereSeiten);
    }

    // ------------------------------------------------------
    // Der Briefbogen — auf A4-Seiten verteilt
    // ------------------------------------------------------
    function zeichneInhalt() {
        const pages = document.getElementById('miet-pages');
        if (!pages) return;

        document.getElementById('miet-phase-u').classList.toggle('active', phase === 'uebergabe');
        document.getElementById('miet-phase-r').classList.toggle('active', phase === 'ruecknahme');

        const recht = rechtsBlock();
        verteileAufSeiten(pages, [
            kopfBlock(),
            geraetBlock(),
            abnahmeBlock(),
            schadenBlock(),
            fotoBlock('uebergabe'),
            fotoBlock('ruecknahme'),
            unterschriftBlock(),
        ].filter(Boolean));
        if (recht) rechtsSeite(pages, recht);
        seitenNummerieren(pages);
        skaliereSeiten();
    }

    // ------------------------------------------------------
    // Seitenumbruch
    // ------------------------------------------------------
    // Der Browser kann Inhalt nicht selbst auf mehrere Briefboegen
    // verteilen — er kennt nur einen langen Fluss. Deshalb wird hier
    // gemessen: Block fuer Block auf die Seite legen, und sobald sie
    // ueberlaeuft, eine neue anfangen. Bloecke, die allein schon zu
    // hoch sind (die Baugruppenliste, die Fotos), werden an ihren
    // eigenen Zeilen aufgetrennt und auf der Folgeseite fortgesetzt.
    function neueSeite(container) {
        const s = document.createElement('div');
        s.className = 'miet-page';
        s.innerHTML = '<div class="miet-page-inner"></div><div class="miet-page-nr"></div>';
        container.appendChild(s);
        return s;
    }

    function innen(seite) {
        return seite.querySelector('.miet-page-inner');
    }

    function laeuftUeber(seite) {
        const i = innen(seite);
        return i.scrollHeight > i.clientHeight + 1;
    }

    function ausHtml(html) {
        const h = document.createElement('div');
        h.innerHTML = html.trim();
        return h.firstElementChild;
    }

    // Schiebt so viele Zeilen vom Ende des Blocks in einen leeren
    // Zwilling, bis die Seite passt. Gibt den Zwilling zurueck, oder
    // null, wenn sich der Block nicht auftrennen laesst.
    function teileAb(block, seite, mindestRest) {
        const box = block.querySelector('[data-splitbox]');
        if (!box) return null;

        const rest = block.cloneNode(true);
        const restBox = rest.querySelector('[data-splitbox]');
        Array.from(restBox.children).forEach(n => n.remove());
        // Zeilen, die nur auf dem ersten Teil stehen sollen (Fortschritt,
        // Kamera-Knopf), im Fortsetzungsteil entfernen.
        rest.querySelectorAll("[data-nurerste]").forEach(n => n.remove());
        const titel = rest.querySelector('.miet-block-title');
        // Der Titel bleibt unveraendert — auf dem Papier soll nicht
        // "(Fortsetzung)" stehen, die Tabelle laeuft schlicht weiter.
        void titel;

        const beweglich = () => Array.from(box.children).filter(n => n.hasAttribute('data-split'));

        let bewegt = 0;
        while (laeuftUeber(seite)) {
            const k = beweglich();
            if (k.length <= 1) break;
            restBox.insertBefore(k[k.length - 1], restBox.firstChild);
            bewegt++;
        }
        // Eine Gruppenueberschrift darf nicht allein am Seitenende stehen.
        const k = beweglich();
        if (k.length > 1 && k[k.length - 1].classList.contains('miet-group')) {
            restBox.insertBefore(k[k.length - 1], restBox.firstChild);
            bewegt++;
        }

        // Bleibt vom Block nur noch ein Stummel auf der Seite, lohnt das
        // Auftrennen nicht — dann lieber den ganzen Block umbrechen.
        // Alles zurueckschieben und aufgeben.
        if (!bewegt || beweglich().length < (mindestRest || 1)) {
            while (restBox.firstChild) box.appendChild(restBox.firstChild);
            return null;
        }
        return rest;
    }

    function verteileAufSeiten(container, bloecke) {
        container.innerHTML = '';
        let seite = neueSeite(container);

        // Nach einer gewachsenen Seite muss zwingend eine neue begonnen
        // werden: auf ihr misst laeuftUeber() nichts mehr, sonst landete
        // der ganze Rest des Bogens auf diesem einen Blatt.
        let neueSeiteErzwingen = false;

        bloecke.forEach(html => {
            let block = ausHtml(html);
            if (!block) return;
            // Blöcke mit data-eigeneseite fangen immer oben auf einem
            // leeren Blatt an (der Vertragstext).
            const eigeneSeite = block.hasAttribute && block.hasAttribute('data-eigeneseite');
            if (neueSeiteErzwingen || (eigeneSeite && innen(seite).children.length)) {
                seite = neueSeite(container);
                neueSeiteErzwingen = false;
            }
            innen(seite).appendChild(block);

            let notbremse = 0;
            while (laeuftUeber(seite) && notbremse++ < 60) {
                // Zuerst die angefangene Seite zu Ende fuellen und den
                // Block an einer Zeile auftrennen — nur wenn mindestens
                // drei Zeilen auf der Seite stehen bleiben.
                const rest = teileAb(block, seite, 3);
                if (rest) {
                    seite = neueSeite(container);
                    innen(seite).appendChild(rest);
                    block = rest;
                    continue;
                }
                // Nicht sinnvoll teilbar: der ganze Block wandert weiter.
                if (innen(seite).children.length > 1) {
                    innen(seite).removeChild(block);
                    seite = neueSeite(container);
                    innen(seite).appendChild(block);
                    continue;
                }
                // Steht allein auf der Seite und laesst sich nicht teilen —
                // etwa eine einzelne Tabellenzeile mit sehr viel Text. Dann
                // darf diese Seite ausnahmsweise wachsen. Der Briefbogen
                // deckt nur den oberen A4-Teil ab, aber es geht nichts
                // verloren; abgeschnittener Text waere schlimmer.
                seite.classList.add('miet-page-frei');
                neueSeiteErzwingen = true;
                break;
            }
        });

    }

    // Der Vertragstext bekommt ein eigenes Blatt und soll komplett darauf
    // stehen. Passt er nicht, wird die Schrift schrittweise kleiner —
    // abschneiden oder auf zwei Seiten verteilen waere schlechter, denn
    // rechtlich gehoert der Text zusammen auf die Rueckseite.
    function rechtsSeite(container, html) {
        const seite = neueSeite(container);
        const block = ausHtml(html);
        if (!block) return;
        innen(seite).appendChild(block);

        let f = 1;
        block.style.setProperty('--miet-recht-f', f);
        while (laeuftUeber(seite) && f > 0.6) {
            f = Math.round((f - 0.02) * 100) / 100;
            block.style.setProperty('--miet-recht-f', f);
        }

        // Selbst bei der kleinsten Stufe zu lang (sehr langer eigener
        // Text): dann darf die Seite wachsen, damit nichts verschwindet.
        if (laeuftUeber(seite)) seite.classList.add('miet-page-frei');
    }

    function seitenNummerieren(container) {
        const seiten = container.querySelectorAll('.miet-page');
        seiten.forEach((s, i) => {
            s.querySelector('.miet-page-nr').textContent = `Seite ${i + 1} von ${seiten.length}`;
        });
        const anzeige = document.getElementById('miet-seitenzahl');
        if (anzeige) anzeige.textContent = `${seiten.length} Seite${seiten.length === 1 ? '' : 'n'} A4`;
    }

    // Am Bildschirm werden die Seiten verkleinert, wenn das Fenster
    // schmaler ist als ein A4-Blatt. Gedruckt wird immer 1:1 (siehe
    // @media print), deshalb aendert das am Ausdruck nichts.
    // Handy/Tablet: der Bogen fliesst (siehe css/views/mietvereinbarung.css,
    // Abschnitt "HANDY UND TABLET"). Gedruckt wird trotzdem A4 — dafuer
    // schaltet mitA4() kurz zurueck.
    function istHandy() {
        return window.innerWidth <= 768;
    }

    function skaliereSeiten() {
        const wrap = document.getElementById('miet-pages-wrap');
        const pages = document.getElementById('miet-pages');
        if (!wrap || !pages) return;

        // Im Fliessmodus wird nichts verkleinert und nichts gemessen.
        if (istHandy() && !a4Modus) {
            pages.style.removeProperty('--miet-scale');
            wrap.style.height = 'auto';
            return;
        }
        const breite = 210 * 96 / 25.4; // A4-Breite in CSS-Pixeln
        const faktor = Math.min(1, (wrap.clientWidth - 4) / breite);
        pages.style.setProperty('--miet-scale', faktor);
        wrap.style.height = (pages.scrollHeight * faktor) + 'px';
    }

    // Auf dem Handy steht der Bogen im Fliessmodus (eine lange Seite).
    // Zum Drucken und fuer das PDF muss er kurz wieder echtes A4 sein,
    // sonst stimmt der Seitenumbruch nicht und Inhalt ginge verloren.
    async function mitA4(fn) {
        const pages = document.getElementById('miet-pages');
        if (!istHandy() || !pages) return await fn();

        a4Modus = true;
        pages.classList.add('miet-a4');
        zeichneInhalt();
        try {
            return await fn();
        } finally {
            a4Modus = false;
            pages.classList.remove('miet-a4');
            zeichneInhalt();
        }
    }

    window.mietDrucken = function () {
        window.mietSchliesseVorschlaege();
        // Ein noch offenes Feld kann die Seite gesprengt haben.
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
        window.mietSeitenPruefen();
        mitA4(() => window.print());
    };

    // ------------------------------------------------------
    // Speichern
    // ------------------------------------------------------
    // Beim ersten Speichern entsteht:
    //   * eine Zeile in rental_agreements (Eingaben + Fotos + PDF-Pfad)
    //   * das PDF in Cloudflare R2 unter der Ordnerstruktur der Maschine
    //   * ein Dokument unter "Dokumente" im Ordner "Mietvereinbarung"
    // Jedes weitere Speichern überschreibt genau diese drei Stellen,
    // damit keine Karteileichen entstehen.
    const MIET_ORDNER = 'Mietvereinbarung';

    function status(text) {
        const el = document.getElementById('miet-status');
        if (el) el.textContent = text;
    }

    function sauber(s) {
        return String(s || '').trim().replace(/[^a-zA-Z0-9_\-]/g, '_').replace(/_+/g, '_');
    }

    // Ordnerstruktur wie bei den Serviceberichten, damit sich beides in
    // R2 an derselben Stelle wiederfindet.
    function ordnerName() {
        if (maschine && typeof window.getMachineFolderName === 'function') {
            return window.getMachineFolderName(maschine.id, maschine.manufacturer, maschine.name,
                maschine.serial || maschine.serial_number, maschine.year);
        }
        return 'Maschinen/ohne_maschine';
    }

    function pdfDateiName() {
        const wer = sauber(daten.mieter.name) || 'ohne-mieter';
        const wann = (daten.miete.abholdatum || heute()).split('-').reverse().join('.');
        return `mietvereinbarung-${wer}-${wann}.pdf`;
    }

    async function ladeHtml2Canvas() {
        if (window.html2canvas) return;
        await new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
            s.onload = resolve;
            s.onerror = () => reject(new Error('html2canvas konnte nicht geladen werden. Bitte Internetverbindung prüfen.'));
            document.head.appendChild(s);
        });
    }

    // Der Bogen ist bereits auf A4-Seiten verteilt — jede Seite wird
    // einmal abfotografiert und als ganzseitiges Bild ins PDF gelegt.
    // Dadurch sieht das PDF exakt aus wie der Ausdruck.
    async function pdfErzeugen() {
        await ladeHtml2Canvas();
        if (typeof window.loadPDFGenerators === 'function') await window.loadPDFGenerators();
        if (!window.jspdf) throw new Error('jsPDF steht nicht zur Verfügung.');

        const pages = document.getElementById('miet-pages');
        const seiten = Array.from(pages.querySelectorAll('.miet-page'));
        if (!seiten.length) throw new Error('Der Bogen ist leer.');

        // Verkleinerung und Bedienelemente für die Aufnahme abschalten.
        const altScale = pages.style.getPropertyValue('--miet-scale');
        pages.style.setProperty('--miet-scale', 1);
        pages.classList.add('miet-pdf');

        try {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

            for (let i = 0; i < seiten.length; i++) {
                status(`PDF wird erzeugt (Seite ${i + 1} von ${seiten.length}) …`);
                const canvas = await window.html2canvas(seiten[i], {
                    scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false
                });
                if (i > 0) doc.addPage();
                doc.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 210, 297);
            }
            return doc;
        } finally {
            pages.classList.remove('miet-pdf');
            if (altScale) pages.style.setProperty('--miet-scale', altScale);
            else pages.style.removeProperty('--miet-scale');
            skaliereSeiten();
        }
    }

    // Fotos liegen als Daten-URL im Arbeitsspeicher. Beim Speichern
    // wandern sie einzeln nach R2; im Bogen bleiben sie unverändert,
    // damit ein erneutes Speichern dasselbe PDF ergibt.
    async function fotosHochladen(basis) {
        const ergebnis = [];
        const phasen = ['uebergabe', 'ruecknahme'];
        for (const p of phasen) {
            const satz = daten.fotos[p] || {};
            for (const pos of Object.keys(satz)) {
                const bild = satz[pos];
                if (!bild || !/^data:/.test(bild)) {
                    if (bild) ergebnis.push({ phase: p, position: pos, url: bild, path: null, name: pos });
                    continue;
                }
                const blob = await (await fetch(bild)).blob();
                const name = `${p}-${sauber(pos)}-${Date.now()}.jpg`;
                const pfad = `${basis}/fotos/${name}`;
                const res = await window.FileUploadService.uploadFile(
                    new File([blob], name, { type: 'image/jpeg' }),
                    { bucket: 'dateien', path: pfad, compress: false, provider: 'cloudflare-r2' }
                );
                ergebnis.push({ phase: p, position: pos, url: res.url, path: res.path, name: `${pos} (${p === 'uebergabe' ? 'Übergabe' : 'Rücknahme'})` });
            }
        }
        return ergebnis;
    }

    // Ordner "Mietvereinbarung" unter "Dokumente" — fehlt er, wird er
    // angelegt statt mit einem Fehler abzubrechen (wie beim Servicebericht).
    async function ordnerId() {
        let { data: ordner, error } = await window.supabaseClient
            .from('document_folders').select('id').eq('name', MIET_ORDNER).maybeSingle();
        if (error) throw error;
        if (!ordner) {
            const { data: neu, error: anlegenFehler } = await window.supabaseClient
                .from('document_folders')
                .insert([{ name: MIET_ORDNER, parent_id: null, machine_id: null }])
                .select('id').single();
            if (anlegenFehler) throw anlegenFehler;
            ordner = neu;
        }
        return ordner.id;
    }

    window.mietSpeichern = async function () {
        if (!daten) return;
        if (!window.supabaseClient || !window.FileUploadService) {
            window.showToast('Ohne Verbindung kann nicht gespeichert werden.');
            return;
        }

        const btn = document.getElementById('miet-save-btn');
        if (btn) { btn.disabled = true; btn.style.opacity = '0.7'; }
        window.mietSchliesseVorschlaege();
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
        window.mietSeitenPruefen();

        try {
            // Auf dem Handy vorher zurück auf A4 (siehe mitA4).
            const doc = await mitA4(() => pdfErzeugen());

            const basis = `${ordnerName()}/mietvereinbarungen`;
            status('Fotos werden hochgeladen …');
            const fotos = await fotosHochladen(basis);

            status('PDF wird hochgeladen …');
            const dateiName = pdfDateiName();
            const pdfBlob = doc.output('blob');
            const pdfDatei = new File([pdfBlob], dateiName, { type: 'application/pdf' });
            const upload = await window.FileUploadService.uploadFile(pdfDatei, {
                bucket: 'dateien', path: `${basis}/${dateiName}`, compress: false, provider: 'cloudflare-r2'
            });

            status('Wird gespeichert …');
            const zeile = {
                machine_id: maschine ? maschine.id : null,
                customer_id: daten.mieter.customer_id || null,
                title: [vorlage.titel || 'Mietvereinbarung', daten.mieter.name].filter(Boolean).join(' — '),
                data: { mieter: daten.mieter, geraet: daten.geraet, miete: daten.miete,
                        pruefpunkte: daten.pruefpunkte, auswahl: daten.auswahl, trommeltyp: daten.trommeltyp,
                        sauberkeit: daten.sauberkeit, einweisung: daten.einweisung,
                        schaeden: daten.schaeden, unterschriften: daten.unterschriften },
                photos: fotos,
                pdf_url: upload.url,
                pdf_path: upload.path,
                folder_path: basis,
                user_id: window.activeUser ? String(window.activeUser.id || '') : null
            };

            if (gespeicherteId) {
                const { error } = await window.supabaseClient
                    .from('rental_agreements').update(zeile).eq('id', gespeicherteId);
                if (error) throw error;
            } else {
                const { data: neu, error } = await window.supabaseClient
                    .from('rental_agreements').insert([zeile]).select('id').single();
                if (error) throw error;
                gespeicherteId = neu.id;
            }

            // Dokument unter "Dokumente" anlegen bzw. aktualisieren.
            const folderId = await ordnerId();
            const anhaenge = fotos.map(f => ({ name: f.name, url: f.url, path: f.path, type: 'image/jpeg' }));
            const dokument = {
                name: dateiName.replace(/\.pdf$/, ''),
                category: MIET_ORDNER,
                machine_id: maschine ? parseInt(maschine.id, 10) : null,
                url: upload.url,
                file_path: upload.path,
                size: pdfDatei.size,
                mime_type: 'application/pdf',
                folder_id: folderId,
                rental_agreement_id: gespeicherteId,
                attachments: anhaenge
            };

            if (!gespeichertesDoc) {
                const { data: vorhanden } = await window.supabaseClient
                    .from('documents').select('id').eq('rental_agreement_id', gespeicherteId).maybeSingle();
                gespeichertesDoc = vorhanden ? vorhanden.id : null;
            }

            if (gespeichertesDoc) {
                const { error } = await window.supabaseClient
                    .from('documents').update(dokument).eq('id', gespeichertesDoc);
                if (error) throw error;
            } else {
                const { data: neuDoc, error } = await window.supabaseClient
                    .from('documents').insert([dokument]).select('id').single();
                if (error) throw error;
                gespeichertesDoc = neuDoc.id;
            }

            if (typeof window.fetchDocuments === 'function' && document.getElementById('documents')) {
                try { window.fetchDocuments(); } catch (e) { /* Ansicht evtl. nicht offen */ }
            }

            const jetzt = new Date();
            status(`Gespeichert: ${jetzt.toLocaleDateString('de-DE')}, ${jetzt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr — Dokumente → ${MIET_ORDNER}`);
            window.showToast(`Mietvereinbarung gespeichert und unter „Dokumente → ${MIET_ORDNER}" abgelegt.`);
        } catch (e) {
            console.error('Mietvereinbarung speichern fehlgeschlagen:', e);
            status('Speichern fehlgeschlagen.');
            if (/rental_agreements|rental_agreement_id|attachments/.test((e && e.message) || '')) {
                window.showToast('Migration fehlt: supabase/supabase_add_rental_agreements.sql in Supabase ausführen.');
            } else {
                window.showToast('Speichern fehlgeschlagen: ' + ((e && e.message) || 'unbekannter Fehler'));
            }
        } finally {
            if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
        }
    };

    // ------------------------------------------------------
    // Löschen
    // ------------------------------------------------------
    // Endgültig: PDF und alle Fotos verschwinden aus Cloudflare R2, das
    // Dokument unter "Dokumente" und die Zeile in rental_agreements
    // ebenfalls. Wird das Dokument selbst gelöscht, ruft documents-r2.js
    // diese Funktion mit ohneDokument:true auf — dann ist das Dokument
    // dort schon in Arbeit und wird hier nicht noch einmal angefasst.
    window.deleteRentalAgreement = async function (id, optionen) {
        if (!id || !window.supabaseClient) return;
        const ohneDokument = !!(optionen && optionen.ohneDokument);

        const { data: zeile, error } = await window.supabaseClient
            .from('rental_agreements').select('*').eq('id', id).maybeSingle();
        if (error) throw error;
        if (!zeile) return;

        const wege = [];
        if (zeile.pdf_path) wege.push(zeile.pdf_path);
        (Array.isArray(zeile.photos) ? zeile.photos : []).forEach(f => { if (f && f.path) wege.push(f.path); });

        for (const pfad of wege) {
            try {
                await window.FileUploadService.deleteFile(pfad, { bucket: 'dateien', provider: 'cloudflare-r2' });
            } catch (e) {
                console.error('Datei konnte nicht aus R2 gelöscht werden:', pfad, e);
            }
        }

        if (!ohneDokument) {
            const { error: docFehler } = await window.supabaseClient
                .from('documents').delete().eq('rental_agreement_id', id);
            if (docFehler) console.error('Dokument konnte nicht gelöscht werden:', docFehler);
        }

        const { error: zeilenFehler } = await window.supabaseClient
            .from('rental_agreements').delete().eq('id', id);
        if (zeilenFehler) throw zeilenFehler;

        if (String(gespeicherteId) === String(id)) { gespeicherteId = null; gespeichertesDoc = null; }
    };

    // ------------------------------------------------------
    // Bausteine des Bogens
    // ------------------------------------------------------
    // Beschriftungen, Baugruppen, Spalten, Fotopositionen und der
    // Vertragstext kommen aus der Vorlage (Einstellungen →
    // Mietvereinbarungen). Fehlt eine Angabe, greift der Standard aus
    // js/mietvereinbarung-vorlagen.js.

    // Freitextfeld. Bewusst KEIN <input>: ein Eingabefeld schneidet zu
    // langen Text beim Drucken einfach ab. Ein umbrechendes Feld waechst
    // stattdessen in die Hoehe, und die Seitenaufteilung rechnet mit der
    // tatsaechlichen Hoehe.
    function txt(pfad, wert, platzhalter, stil) {
        return `<div class="miet-in miet-txt" contenteditable="true" spellcheck="false"
                     data-feld="${esc(pfad)}" data-ph="${esc(platzhalter || '')}"${stil ? ` style="${stil}"` : ''}
                     onkeydown="if(event.key==='Enter'){event.preventDefault(); this.blur();}"
                     oninput="window.mietFeld('${pfad}', this.textContent)"
                     onblur="window.mietSeitenPruefen()">${esc(wert)}</div>`;
    }

    // Mehrzeiliges Feld (Zeilenumbruch erlaubt).
    function txtMehr(pfad, wert, platzhalter) {
        return `<div class="miet-in miet-txt" contenteditable="true" spellcheck="false"
                     data-ph="${esc(platzhalter || '')}"
                     oninput="window.mietFeld('${pfad}', this.textContent)"
                     onblur="window.mietSeitenPruefen()">${esc(wert)}</div>`;
    }

    // Waechst ein Feld beim Tippen so weit, dass die Seite nicht mehr
    // reicht, wuerde .miet-page-inner den Ueberhang abschneiden. Beim
    // Verlassen des Feldes wird deshalb geprueft und noetigenfalls neu
    // auf die Seiten verteilt. Waehrend des Tippens bleibt die
    // Aufteilung stehen — sonst springt der Schreibcursor weg.
    window.mietSeitenPruefen = function () {
        const seiten = document.querySelectorAll('.miet-page');
        for (let i = 0; i < seiten.length; i++) {
            if (laeuftUeber(seiten[i])) { zeichneInhalt(); return true; }
        }
        return false;
    };

    // ---------- 1. Mieter ----------
    function kopfBlock() {
        const m = daten.mieter;
        const b = vorlage.bloecke || {};
        const f = vorlage.felder || {};
        // Achtung: jeder Block muss GENAU EIN Wurzelelement haben —
        // die Seitenverteilung nimmt sonst nur das erste und der Rest
        // faellt still unter den Tisch. Deshalb steht die Ueberschrift
        // des Bogens mit im Block.
        return `
        <div class="miet-block">
            <div class="miet-sheet-title">${esc(vorlage.titel || 'Mietvereinbarung')}</div>
            <div class="miet-block-title">${esc(b.mieter || 'Mieter')}</div>
            <table class="miet-table">
                <tr>
                    <td class="miet-label">${esc(f.name || 'Name:')}</td>
                    <td>
                        <div class="miet-in miet-txt" id="miet-kunde" contenteditable="true" spellcheck="false"
                             data-ph="Adressbuch durchsuchen …"
                             onkeydown="if(event.key==='Enter'){event.preventDefault(); this.blur();}"
                             oninput="window.mietSucheAdresse(this.textContent)">${esc(m.name)}</div>
                    </td>
                </tr>
                <tr><td class="miet-label">${esc(f.street || 'Straße:')}</td><td>${txt('mieter.street', m.street)}</td></tr>
                <tr><td class="miet-label">${esc(f.zip_city || 'PLZ/Ort:')}</td><td>${txt('mieter.zip_city', m.zip_city)}</td></tr>
                <tr><td class="miet-label">${esc(f.ausweis || 'Ausweisnummer:')}</td><td>${txt('mieter.ausweis', m.ausweis)}</td></tr>
                <tr><td class="miet-label">${esc(f.einsatzort || 'Einsatzort:')}</td><td>${txt('mieter.einsatzort', m.einsatzort)}</td></tr>
            </table>
        </div>`;
    }

    // ---------- 2. Mietgeraet und Konditionen ----------
    function geraetBlock() {
        const g = daten.geraet, k = daten.miete;
        const b = vorlage.bloecke || {};
        const f = vorlage.felder || {};
        return `
        <div class="miet-block">
            <div class="miet-block-title">${esc(b.geraet || 'Mietgerät')}</div>
            <table class="miet-table">
                <tr>
                    <td class="miet-label">${esc(f.geraet || 'Mietgerät:')}</td>
                    <td>${txt('geraet.typ', g.typ, 'Typ')}</td>
                    <td>${txt('geraet.bezeichnung', g.bezeichnung, 'Typbezeichnung')}</td>
                    <td>${txt('geraet.seriennummer', g.seriennummer, 'Seriennummer')}</td>
                </tr>
                <tr>
                    <td class="miet-label">${esc(f.abholdatum || 'Abhol-/Lieferdatum:')}</td>
                    <td><input type="date" class="miet-in" value="${esc(k.abholdatum)}" oninput="window.mietFeld('miete.abholdatum', this.value)"></td>
                    <td class="miet-label">${esc(f.uhrzeit || 'Uhrzeit:')}</td>
                    <td><input type="time" class="miet-in" value="${esc(k.abholzeit)}" oninput="window.mietFeld('miete.abholzeit', this.value)"></td>
                </tr>
                <tr>
                    <td class="miet-label">${esc(f.beginn || 'Mietbeginn:')}</td>
                    <td><input type="date" class="miet-in" value="${esc(k.beginn)}" oninput="window.mietFeld('miete.beginn', this.value)"></td>
                    <td class="miet-label">${esc(f.betriebsstunden || 'Betriebsstunden:')}</td>
                    <td>${txt('miete.beginn_bs', k.beginn_bs, 'h')}</td>
                </tr>
                <tr>
                    <td class="miet-label">${esc(f.ende || 'Mietende:')}</td>
                    <td><input type="date" class="miet-in" value="${esc(k.ende)}" oninput="window.mietFeld('miete.ende', this.value)"></td>
                    <td class="miet-label">${esc(f.betriebsstunden || 'Betriebsstunden:')}</td>
                    <td>${txt('miete.ende_bs', k.ende_bs, 'h')}</td>
                </tr>
                <tr>
                    <td class="miet-label">${esc(f.tagessatz || 'Tagessatz pro Werktag')}</td>
                    <td colspan="3">${txt('miete.tagessatz', k.tagessatz, 'z. B. 450,00 €/Tag')}</td>
                </tr>
                <tr>
                    <td class="miet-label">${esc(f.zusatzinfo || 'Zusatzinfo:')}</td>
                    <td colspan="3" class="miet-zusatz">${txtMehr('miete.zusatzinfo', k.zusatzinfo)}</td>
                </tr>
            </table>
        </div>`;
    }

    // ---------- 3. Baugruppen ----------
    // Die Pruefspalten stehen in der Vorlage. Zwei sind der Normalfall
    // (Uebernahme / Rueckgabe), es koennen aber mehr sein.
    function spalten() {
        const sp = vorlage.spalten;
        return (Array.isArray(sp) && sp.length) ? sp : [{ id: 'uebergabe', label: 'Zustand bei Übernahme' }];
    }

    function aktiveSpalteId() {
        const sp = spalten();
        return phase === 'ruecknahme' ? (sp[1] || sp[0]).id : sp[0].id;
    }

    function pruefZelle(nr, spalteId) {
        const eintrag = daten.pruefpunkte[nr] || {};
        const wert = eintrag[spalteId] || null;
        const dim = spalteId !== aktiveSpalteId();
        return `<td class="miet-checkcell${dim ? ' miet-dim' : ''}">
            <span class="miet-check${wert === 'io' ? ' on' : ''}" onclick="window.mietPruef(${nr}, '${esc(spalteId)}', 'io')"><span class="miet-dot"></span>i.O.</span>
            <span class="miet-check miet-no${wert === 'nio' ? ' on' : ''}" onclick="window.mietPruef(${nr}, '${esc(spalteId)}', 'nio')"><span class="miet-dot"></span>n.i.O.</span>
        </td>`;
    }

    function jaNein(pfad, wert) {
        return `<span>
            <span class="miet-check${wert === 'ja' ? ' on' : ''}" onclick="window.mietFeld('${pfad}', '${wert === 'ja' ? '' : 'ja'}', true)"><span class="miet-dot"></span>Ja</span>
            <span class="miet-check miet-no${wert === 'nein' ? ' on' : ''}" onclick="window.mietFeld('${pfad}', '${wert === 'nein' ? '' : 'nein'}', true)"><span class="miet-dot"></span>Nein</span>
        </span>`;
    }

    function abnahmeBlock() {
        const sp = spalten();
        const b = vorlage.bloecke || {};
        const f = vorlage.felder || {};
        let nr = 0;
        let zeilen = '';

        (vorlage.baugruppen || []).forEach(g => {
            zeilen += `<tr class="miet-group" data-split><td colspan="${2 + sp.length}">${esc(g.gruppe)}${g.trommeltyp
                ? ` &nbsp;&nbsp;Trommeltyp: <span style="display:inline-block; min-width:150px; border-bottom:1px solid #9ca3af;">${txt('trommeltyp', daten.trommeltyp, '', 'display:inline-block;')}</span>`
                : ''}</td></tr>`;
            (g.punkte || []).forEach(roh => {
                nr++;
                const p = punktLesen(roh);

                // Ausführungen zur Auswahl (z. B. Siebkorb 12 mm / 25 mm).
                const gewaehlt = (daten.auswahl && daten.auswahl[nr]) || [];
                const auswahl = p.optionen.length
                    ? ` <span class="miet-pick miet-pick-klein${gewaehlt.length ? '' : ' leer'}"
                             onclick="window.mietAuswahlMenu(this, ${nr})"
                        >${esc(gewaehlt.length ? gewaehlt.join(', ') : '— Ausführung wählen —')}</span>`
                    : '';

                // Optionale Zeile: grau, mit Vermerk. Bleibt sie leer, wird
                // sie nicht gedruckt (die Option ist dann nicht verbaut).
                const leer = p.optional && !sp.some(s => (daten.pruefpunkte[nr] || {})[s.id]);
                const klassen = ['', p.optional ? 'miet-opt' : '', leer ? 'miet-opt-leer' : '']
                    .filter(Boolean).join(' ');

                zeilen += `<tr data-split${klassen ? ` class="${klassen}"` : ''}>
                    <td>${esc(p.text)}${p.optional ? '<span class="miet-opt-kennung">Optional</span>' : ''}${auswahl}</td>
                    <td class="miet-num">${nr}</td>
                    ${sp.map(s => pruefZelle(nr, s.id)).join('')}
                </tr>`;
            });
        });

        const s = daten.sauberkeit;
        const aktiv = aktiveSpalteId();

        return `
        <div class="miet-block">
            <div class="miet-block-title">${esc(b.abnahme || 'Zustand der Baugruppen')}</div>
            <table class="miet-table">
                <thead>
                <tr>
                    <th style="width:${Math.max(22, 60 - sp.length * 12)}%;">${esc(f.baugruppe || 'Baugruppe')}</th>
                    <th class="miet-num">NR.</th>
                    ${sp.map(c => `<th class="miet-checkcell">${esc(c.label)}</th>`).join('')}
                </tr>
                </thead>
                <tbody data-splitbox>
                ${zeilen}
                <tr class="miet-group" data-split><td colspan="${2 + sp.length}">${esc(f.sauberkeit || 'Sauberkeit, Füllstand')}</td></tr>
                <tr data-split>
                    <td>${esc(f.gereinigt || 'Gereinigt')}</td><td class="miet-num"></td>
                    ${sp.map(c => `<td class="miet-checkcell${c.id === aktiv ? '' : ' miet-dim'}">${jaNein('sauberkeit.gereinigt.' + c.id, (s.gereinigt || {})[c.id])}</td>`).join('')}
                </tr>
                <tr data-split>
                    <td>${esc(f.diesel || 'Diesel Füllstand')}</td><td class="miet-num"></td>
                    ${sp.map(c => `<td class="${c.id === aktiv ? '' : 'miet-dim'}">${txt('sauberkeit.diesel.' + c.id, (s.diesel || {})[c.id] || '', 'z. B. Voll')}</td>`).join('')}
                </tr>
                <tr data-split>
                    <td>${esc(f.sonstiges || 'Sonstiges:')}</td><td class="miet-num"></td>
                    <td colspan="${sp.length}">${txt('sauberkeit.sonstiges', s.sonstiges)}</td>
                </tr>
                <tr data-split>
                    <td>${esc(f.einweisung || 'Einweisung stattgefunden')}</td><td class="miet-num"></td>
                    <td class="miet-checkcell">${jaNein('einweisung.erfolgt', daten.einweisung.erfolgt)}</td>
                    <td${sp.length > 2 ? ` colspan="${sp.length - 1}"` : ''}>
                        <div style="display:flex; align-items:center; gap:6px;">
                            <span style="font-weight:700; white-space:nowrap;">durch:</span>
                            <div class="miet-pick${daten.einweisung.durch_name ? '' : ' leer'}" style="flex:1;"
                                 onclick="window.mietEinweiserMenu(this)">${esc(daten.einweisung.durch_name || '— bitte wählen —')}</div>
                        </div>
                    </td>
                </tr>
                </tbody>
            </table>
        </div>`;
    }

    // ---------- 4. Vorschaeden ----------
    function schadenBlock() {
        const b = vorlage.bloecke || {};
        const zeilen = daten.schaeden.map((s, i) => `
            <tr data-split>
                <td class="miet-num">${txt(`schaeden.${i}.nr`, s.nr, '', 'text-align:center;')}</td>
                <td style="width:32%;">${txt(`schaeden.${i}.position`, s.position)}</td>
                <td>${txt(`schaeden.${i}.beschreibung`, s.beschreibung)}</td>
            </tr>`).join('');
        return `
        <div class="miet-block">
            <div class="miet-block-title">${esc(b.schaeden || 'Schadenstabelle bekannter Vorschäden')}</div>
            <table class="miet-table">
                <thead><tr><th class="miet-num">NR.</th><th>Position</th><th>Schadensbeschreibung</th></tr></thead>
                <tbody data-splitbox>${zeilen}</tbody>
            </table>
            <button type="button" data-nurerste onclick="window.mietSchadenZeile()" style="margin-top:6px; background:#f3f4f6; border:1px solid #9ca3af; border-radius:6px; padding:3px 10px; font-size:11.5px; font-weight:700; cursor:pointer;">+ Zeile</button>
        </div>`;
    }

    // ---------- 5. Fotos ----------
    // Beide Saetze stehen immer auf dem Bogen — auf dem Ausdruck sollen
    // Uebergabe UND Ruecknahme zu sehen sein. Am Bildschirm tritt der
    // Satz zurueck, der gerade nicht bearbeitet wird.
    function fotoBlock(welche) {
        const satz = daten.fotos[welche] || {};
        const pos_liste = fotoPositionen();
        const fertig = pos_liste.filter(p => satz[p]).length;
        const b = vorlage.bloecke || {};
        const titel = welche === 'uebergabe'
            ? (b.fotos_uebergabe || 'Fotos bei Übergabe')
            : (b.fotos_ruecknahme || 'Fotos bei Rücknahme');
        const aktiv = welche === phase;

        const kacheln = pos_liste.map((pos, i) => {
            const bild = satz[pos];
            return `
            <div class="miet-photo-slot${bild ? ' filled' : ''}" data-split onclick="window.mietFotoKlick('${esc(welche)}', '${esc(pos)}')">
                <button type="button" class="miet-photo-swap" onclick="event.stopPropagation(); window.mietFotoEinzeln('${esc(welche)}', '${esc(pos)}')" title="Foto neu aufnehmen">&#8635;</button>
                <button type="button" class="miet-photo-del" onclick="event.stopPropagation(); window.mietFotoLoeschen('${esc(welche)}', '${esc(pos)}')" title="Foto entfernen">&times;</button>
                <div class="miet-photo-name">
                    ${bild
                    ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#047857" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>'
                    : ''}
                    <span style="color:${bild ? '#047857' : '#9ca3af'}; font-weight:800;">Bild ${i + 1}</span> ${esc(pos)}
                </div>
                <div class="miet-photo-box">${bild ? `<img src="${bild}" alt="">` : 'Antippen zum Aufnehmen'}</div>
                ${bild ? '<span class="miet-photo-zoom">Zum Vergrößern tippen</span>' : ''}
            </div>`;
        }).join('');

        return `
        <div class="miet-block${aktiv ? '' : ' miet-dim'}">
            <div class="miet-block-title">${esc(titel)}</div>
            <div class="miet-photo-progress" data-nurerste>${fertig} von ${pos_liste.length} Positionen erfasst${fertig < pos_liste.length
                ? ` <button type="button" class="miet-photo-start" onclick="window.mietFotoserie('${esc(welche)}')">Rundgang starten</button>`
                : ''}</div>
            <div class="miet-photo-grid" data-splitbox>${kacheln}</div>
        </div>`;
    }

    // ---------- 6. Unterschriften ----------
    function feldUnterschrift(schluessel, beschriftung) {
        const bild = daten.unterschriften[schluessel];
        return `
        <div>
            <div class="miet-sign-pad" onclick="window.mietPadOpen('${schluessel}', '${esc(beschriftung)}')">
                ${bild ? `<img src="${bild}" alt="">` : '<span class="miet-sign-hint">Hier unterschreiben</span>'}
            </div>
            <div class="miet-sign-caption">
                <span>${esc(beschriftung)}</span>
                ${bild ? `<button type="button" onclick="event.stopPropagation(); window.mietSignLoeschen('${schluessel}')">löschen</button>` : ''}
            </div>
        </div>`;
    }

    function unterschriftBlock() {
        const u = phase === 'uebergabe';
        const b = vorlage.bloecke || {};
        const f = vorlage.felder || {};
        const kopf = u
            ? (b.bestaetigung_uebergabe || 'o. g. Angaben bei Übergabe bestätigt')
            : (b.bestaetigung_ruecknahme || 'o. g. Angaben bei Rücknahme bestätigt');
        return `
        <div class="miet-block">
            <div class="miet-block-title">${esc(kopf)}</div>
            <div class="miet-sign-row">
                ${feldUnterschrift(u ? 'u_vermieter' : 'r_vermieter', f.unterschrift_vermieter || 'Unterschrift Vermieter')}
                ${feldUnterschrift(u ? 'u_mieter' : 'r_mieter', f.unterschrift_mieter || 'Unterschrift Mieter')}
            </div>
            ${vorlage.schlusssatz ? `<div class="miet-hinweis">${esc(vorlage.schlusssatz)}</div>` : ''}
        </div>`;
    }

    // ---------- 7. Vertragstext ----------
    // Wortlaut steht in der Vorlage. Ist keiner hinterlegt, faellt der
    // Teil einfach weg — der Bogen bleibt benutzbar.
    function rechtsBlock() {
        const t = vorlage.texte;
        if (!t || !Array.isArray(t.abschnitte) || !t.abschnitte.length) return null;

        const stuecke = [];
        t.abschnitte.forEach(a => {
            if (a.titel) stuecke.push(`<div class="miet-recht-h" data-split>${esc(a.titel)}</div>`);
            (a.absaetze || []).forEach(p => stuecke.push(`<p class="miet-recht-p" data-split>${esc(p)}</p>`));
        });

        // data-eigeneseite: der Vertragstext beginnt immer auf einem
        // frischen Blatt und teilt sich keine Seite mit dem Bogen.
        return `
        <div class="miet-block miet-recht" data-eigeneseite>
            <div class="miet-block-title">${esc(t.titel || 'Mietbedingungen')}</div>
            <div data-splitbox>${stuecke.join('')}</div>
        </div>`;
    }
    // ------------------------------------------------------
    // Eingaben entgegennehmen
    // ------------------------------------------------------
    // Setzt einen Wert ueber einen Pfad wie 'mieter.name'. Mit
    // neuZeichnen=true wird der Bogen danach neu aufgebaut (noetig,
    // wenn sich die Darstellung aendert — z. B. Ankreuzfelder).
    window.mietFeld = function (pfad, wert, neuZeichnen) {
        const teile = pfad.split('.');
        let ziel = daten;
        for (let i = 0; i < teile.length - 1; i++) ziel = ziel[teile[i]];
        ziel[teile[teile.length - 1]] = wert === '' && neuZeichnen ? null : wert;
        if (neuZeichnen) zeichneInhalt();
    };

    window.mietPruef = function (nr, spalte, wert) {
        if (!daten.pruefpunkte[nr]) daten.pruefpunkte[nr] = {};
        daten.pruefpunkte[nr][spalte] = daten.pruefpunkte[nr][spalte] === wert ? null : wert;
        zeichneInhalt();
    };

    window.mietSchadenZeile = function () {
        daten.schaeden.push({ nr: '', position: '', beschreibung: '' });
        zeichneInhalt();
    };

    window.mietEinweiser = function (id) {
        const u = (window.userList || []).find(x => String(x.id) === String(id));
        daten.einweisung.durch_id = id || '';
        daten.einweisung.durch_name = u ? u.name : '';
        uebernehmeEinweiserUnterschrift();
        zeichneInhalt();
    };

    // Die hinterlegte Unterschrift des Einweisers wandert in das
    // Vermieter-Feld der Uebergabe — genau wie beim Servicebericht.
    function uebernehmeEinweiserUnterschrift() {
        const u = (window.userList || []).find(x => String(x.id) === String(daten.einweisung.durch_id));
        if (u && u.saved_signature) daten.unterschriften.u_vermieter = u.saved_signature;
    }

    // ------------------------------------------------------
    // Auswahlmenue
    // ------------------------------------------------------
    // Haengt am <body>, nicht im Bogen — Begruendung steht bei
    // .miet-menu in der CSS-Datei. Eintraege:
    //   { text, sub, aktiv, wahl: () => {} }
    let menuEl = null;

    function menuSchliessen() {
        if (menuEl) menuEl.remove();
        menuEl = null;
        document.removeEventListener('mousedown', menuAussenklick, true);
        window.removeEventListener('resize', menuSchliessen);
    }

    function menuAussenklick(e) {
        if (menuEl && !menuEl.contains(e.target)) menuSchliessen();
    }

    function menuOeffnen(anker, eintraege) {
        menuSchliessen();
        if (!anker || !eintraege.length) return;

        const m = document.createElement('div');
        m.className = 'miet-menu';
        m.innerHTML = eintraege.map((e, i) => `
            <div data-i="${i}"${e.aktiv ? ' class="on"' : ''}>${esc(e.text)}${e.sub ? `<div class="miet-menu-sub">${esc(e.sub)}</div>` : ''}</div>`).join('');

        m.addEventListener('mousedown', (ev) => {
            const zeile = ev.target.closest('[data-i]');
            if (!zeile) return;
            ev.preventDefault();
            ev.stopPropagation();
            const eintrag = eintraege[Number(zeile.dataset.i)];
            menuSchliessen();
            if (eintrag && eintrag.wahl) eintrag.wahl();
        });

        document.body.appendChild(m);
        menuEl = m;

        const r = anker.getBoundingClientRect();
        m.style.minWidth = Math.max(200, r.width) + 'px';
        m.style.left = Math.max(8, Math.min(r.left, window.innerWidth - m.offsetWidth - 8)) + 'px';

        // Es wird die Seite genommen, auf der mehr Platz ist, und das
        // Menue auf genau diesen Platz begrenzt — sonst haengt es unten
        // aus dem Fenster heraus und die letzten Eintraege sind nicht
        // erreichbar.
        const platzUnten = Math.max(0, window.innerHeight - r.bottom - 10);
        const platzOben = Math.max(0, Math.min(r.top, window.innerHeight) - 10);
        const nachOben = platzUnten < Math.min(m.offsetHeight, 260) && platzOben > platzUnten;
        m.style.maxHeight = Math.min(
            Math.max(120, nachOben ? platzOben : platzUnten),
            window.innerHeight - 16) + 'px';
        m.style.top = nachOben ? Math.max(8, r.top - m.offsetHeight - 2) + 'px' : (r.bottom + 2) + 'px';

        setTimeout(() => {
            document.addEventListener('mousedown', menuAussenklick, true);
            window.addEventListener('resize', menuSchliessen);
        }, 0);
    }

    // Ausführungen eines Prüfpunkts wählen (z. B. Siebkorb 12 mm / 25 mm).
    // Bei "Mehrfach" bleibt das Menü ein Umschalter: jeder Klick nimmt eine
    // Ausführung dazu oder wieder heraus.
    window.mietAuswahlMenu = function (anker, nr) {
        const p = punktZuNummer(nr);
        if (!p || !p.optionen.length) return;

        const gewaehlt = (daten.auswahl[nr] || []).slice();
        const eintraege = [{
            text: '— keine Angabe —',
            aktiv: !gewaehlt.length,
            wahl: () => { daten.auswahl[nr] = []; zeichneInhalt(); }
        }].concat(p.optionen.map(o => ({
            text: o,
            aktiv: gewaehlt.includes(o),
            wahl: () => {
                if (p.mehrfach) {
                    const i = gewaehlt.indexOf(o);
                    if (i === -1) gewaehlt.push(o); else gewaehlt.splice(i, 1);
                    daten.auswahl[nr] = gewaehlt;
                } else {
                    daten.auswahl[nr] = [o];
                }
                zeichneInhalt();
            }
        })));

        menuOeffnen(anker, eintraege);
    };

    // Den Prüfpunkt zur laufenden Nummer heraussuchen — die Nummer entsteht
    // beim Zeichnen fortlaufend über alle Baugruppen hinweg.
    function punktZuNummer(nr) {
        let i = 0;
        for (const g of (vorlage.baugruppen || [])) {
            for (const roh of (g.punkte || [])) {
                i++;
                if (i === Number(nr)) return punktLesen(roh);
            }
        }
        return null;
    }

    window.mietEinweiserMenu = function (anker) {
        const nutzer = window.userList || [];
        if (!nutzer.length) {
            window.showToast('Keine Benutzer vorhanden.');
            return;
        }
        menuOeffnen(anker, [{
            text: '— niemand —',
            aktiv: !daten.einweisung.durch_id,
            wahl: () => window.mietEinweiser('')
        }].concat(nutzer.map(u => ({
            text: u.name,
            sub: u.saved_signature ? 'Unterschrift hinterlegt' : 'ohne hinterlegte Unterschrift',
            aktiv: String(u.id) === String(daten.einweisung.durch_id),
            wahl: () => window.mietEinweiser(u.id)
        }))));
    };

    // ------------------------------------------------------
    // Adressbuch-Suche
    // ------------------------------------------------------
    let sucheTimer = null;

    window.mietSucheAdresse = function (text) {
        daten.mieter.name = text;
        clearTimeout(sucheTimer);
        if (!text || text.trim().length < 2) { menuSchliessen(); return; }

        sucheTimer = setTimeout(async () => {
            try {
                if (!window.supabaseClient) return;
                const { data, error } = await window.supabaseClient
                    .from('customers')
                    .select('id, name, matchcode, street, zip_code, city, customer_number')
                    .or(`name.ilike.%${text}%,matchcode.ilike.%${text}%`)
                    .limit(8);
                if (error) throw error;

                const feld = document.getElementById('miet-kunde');
                if (!data || !data.length || !feld || feld !== document.activeElement) { menuSchliessen(); return; }

                menuOeffnen(feld, data.map(a => ({
                    text: a.name || '(ohne Namen)',
                    sub: [a.street, a.zip_code, a.city].filter(Boolean).join(' · '),
                    wahl: () => window.mietWaehleAdresse(
                        a.id, a.name || '', a.street || '',
                        [a.zip_code, a.city].filter(Boolean).join(' '))
                })));
            } catch (e) {
                console.warn('Adresssuche fehlgeschlagen:', e);
                menuSchliessen();
            }
        }, 250);
    };

    window.mietWaehleAdresse = function (id, name, street, zipCity) {
        daten.mieter.customer_id = id;
        daten.mieter.name = name;
        daten.mieter.street = street;
        daten.mieter.zip_city = zipCity;
        zeichneInhalt();
    };

    window.mietSchliesseVorschlaege = menuSchliessen;

    // ------------------------------------------------------
    // Fotos — vorerst nur im Arbeitsspeicher (kein Upload)
    // ------------------------------------------------------
    window.mietFotoLoeschen = function (welche, position) {
        delete daten.fotos[welche][position];
        if (lbOffen) window.mietBildZu();
        zeichneInhalt();
    };

    // Auf eine leere Kachel tippen startet die Aufnahme ab genau dieser
    // Position, auf eine gefuellte oeffnet die Grossansicht.
    window.mietFotoKlick = function (welche, position) {
        if (daten.fotos[welche][position]) window.mietBildAnsehen(welche, position);
        else kameraStarten(welche, offenePositionen(welche, position));
    };

    // Nur dieses eine Bild neu aufnehmen.
    window.mietFotoEinzeln = function (welche, position) {
        kameraStarten(welche, [position]);
    };

    // Ganze Serie: alle noch fehlenden Positionen der Reihe nach.
    window.mietFotoserie = function (welche) {
        const offen = offenePositionen(welche);
        if (!offen.length) { window.showToast('Für diesen Satz sind bereits alle Bilder vorhanden.'); return; }
        kameraStarten(welche, offen);
    };

    // Alle Positionen ab "start" (oder ab Anfang), die noch kein Bild haben.
    function offenePositionen(welche, start) {
        const satz = daten.fotos[welche] || {};
        const ab = start ? fotoPositionen().indexOf(start) : 0;
        const liste = fotoPositionen().slice(Math.max(0, ab)).filter(p => !satz[p]);
        // Die angetippte Position gehoert immer dazu, auch wenn schon belegt.
        if (start && !liste.length) return [start];
        return liste;
    }

    // ------------------------------------------------------
    // Geführte Kamera
    // ------------------------------------------------------
    // Ziel: die Kamera bleibt offen und sagt an, welche Ansicht dran ist.
    // Nach dem Auslösen landet das Bild im richtigen Feld und die naechste
    // Ansicht wird angesagt — ohne dass zwischendurch etwas angetippt
    // werden muss.
    //
    // Das geht nur ueber getUserMedia, und das verlangt eine sichere
    // Herkunft (https oder localhost). Per file:// geoeffnet gibt es
    // keine Kamera — dann wird auf den Dateidialog zurueckgefallen, der
    // auf dem Handy ebenfalls die Kamera oeffnet, aber je Bild einmal.
    let camStrom = null;
    let camListe = [];
    let camIdx = 0;
    let camWelche = 'uebergabe';

    async function kameraStarten(welche, positionen) {
        if (!positionen || !positionen.length) return;
        camWelche = welche;
        camListe = positionen;
        camIdx = 0;

        const hatKamera = navigator.mediaDevices && navigator.mediaDevices.getUserMedia;
        if (!hatKamera) { dateiKette(); return; }

        try {
            camStrom = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } },
                audio: false
            });
        } catch (e) {
            console.warn('Kamera nicht verfügbar:', e);
            window.showToast('Kamera nicht verfügbar – die Bilder werden einzeln abgefragt.');
            dateiKette();
            return;
        }

        const cam = document.getElementById('miet-cam');
        const video = document.getElementById('miet-cam-video');
        video.srcObject = camStrom;
        cam.classList.add('open');
        document.addEventListener('keydown', camTaste);
        camAnsage();
    }

    function camAnsage() {
        const pos = camListe[camIdx];
        const nr = fotoPositionen().indexOf(pos) + 1;
        const wort = camWelche === 'uebergabe' ? 'bei Übergabe' : 'bei Rücknahme';
        document.getElementById('miet-cam-title').innerHTML =
            `Bild ${nr} ${esc(wort)}<span>${esc(pos)}</span>`;
        document.getElementById('miet-cam-step').textContent =
            `Aufnahme ${camIdx + 1} von ${camListe.length}`;

        const naechste = camListe[camIdx + 1];
        document.getElementById('miet-cam-next').textContent =
            naechste ? `Danach: ${naechste}` : 'Letzte Aufnahme';

        // Streifen der bereits gemachten Bilder
        const satz = daten.fotos[camWelche] || {};
        document.getElementById('miet-cam-strip').innerHTML = camListe.map((p, i) => `
            <div class="miet-cam-thumb${i === camIdx ? ' on' : ''}" title="${esc(p)}">
                ${satz[p] ? `<img src="${satz[p]}" alt="">` : `<span>${fotoPositionen().indexOf(p) + 1}</span>`}
            </div>`).join('');
    }

    window.mietKameraAusloesen = function () {
        const video = document.getElementById('miet-cam-video');
        if (!video || !video.videoWidth) return;

        const c = document.createElement('canvas');
        c.width = video.videoWidth;
        c.height = video.videoHeight;
        c.getContext('2d').drawImage(video, 0, 0);
        daten.fotos[camWelche][camListe[camIdx]] = c.toDataURL('image/jpeg', 0.85);

        // kurzes Aufblitzen als Rueckmeldung
        const blitz = document.getElementById('miet-cam-flash');
        if (blitz) { blitz.classList.remove('on'); void blitz.offsetWidth; blitz.classList.add('on'); }

        zeichneInhalt();
        weiter();
    };

    window.mietKameraUeberspringen = function () {
        weiter();
    };

    window.mietKameraZurueck = function () {
        if (camIdx > 0) { camIdx--; camAnsage(); }
    };

    function weiter() {
        camIdx++;
        if (camIdx >= camListe.length) {
            window.mietKameraSchliessen();
            window.showToast('Fotoserie abgeschlossen.');
            return;
        }
        camAnsage();
    }

    window.mietKameraSchliessen = function () {
        const cam = document.getElementById('miet-cam');
        if (cam) cam.classList.remove('open');
        const video = document.getElementById('miet-cam-video');
        if (video) video.srcObject = null;
        if (camStrom) camStrom.getTracks().forEach(t => t.stop());
        camStrom = null;
        document.removeEventListener('keydown', camTaste);
        zeichneInhalt();
    };

    function camTaste(e) {
        if (e.key === 'Escape') window.mietKameraSchliessen();
        else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); window.mietKameraAusloesen(); }
        else if (e.key === 'ArrowLeft') window.mietKameraZurueck();
        else if (e.key === 'ArrowRight') window.mietKameraUeberspringen();
    }

    // Rueckfallweg ohne getUserMedia: je Bild ein Dateidialog, direkt
    // hintereinander. Vor jedem Bild wird angesagt, was dran ist.
    function dateiKette() {
        if (camIdx >= camListe.length) {
            zeichneInhalt();
            window.showToast('Fotoserie abgeschlossen.');
            return;
        }
        const pos = camListe[camIdx];
        const nr = fotoPositionen().indexOf(pos) + 1;
        window.showToast(`Bild ${nr}: ${pos}`);

        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.setAttribute('capture', 'environment');
        input.onchange = () => {
            const datei = input.files && input.files[0];
            if (!datei) { camIdx++; dateiKette(); return; }
            const leser = new FileReader();
            leser.onload = () => {
                daten.fotos[camWelche][pos] = leser.result;
                camIdx++;
                zeichneInhalt();
                dateiKette();
            };
            leser.readAsDataURL(datei);
        };
        input.click();
    }

    // ------------------------------------------------------
    // Grossansicht — blaettert durch alle Bilder der aktuellen
    // Phase. Die Ueberschrift nennt Nummer, Phase und Blickwinkel,
    // damit unterwegs klar ist, was man gerade sieht.
    // ------------------------------------------------------
    let lbOffen = false;
    let lbIndex = 0;
    let lbWelche = 'uebergabe';

    function lbListe() {
        const satz = daten.fotos[lbWelche] || {};
        return fotoPositionen().filter(p => satz[p]);
    }

    function phasenWort() {
        return lbWelche === 'uebergabe' ? 'bei Übergabe' : 'bei Rücknahme';
    }

    window.mietBildAnsehen = function (welche, position) {
        lbWelche = welche;
        const liste = lbListe();
        if (!liste.length) return;
        lbIndex = Math.max(0, liste.indexOf(position));
        lbOffen = true;
        document.getElementById('miet-lightbox').classList.add('open');
        document.addEventListener('keydown', lbTaste);
        lbZeichne();
    };

    window.mietBildZu = function () {
        lbOffen = false;
        const lb = document.getElementById('miet-lightbox');
        if (lb) lb.classList.remove('open');
        document.removeEventListener('keydown', lbTaste);
    };

    window.mietBildBlaettern = function (richtung) {
        const liste = lbListe();
        if (!liste.length) return;
        lbIndex = Math.min(liste.length - 1, Math.max(0, lbIndex + richtung));
        lbZeichne();
    };

    window.mietBildSpringen = function (i) {
        lbIndex = i;
        lbZeichne();
    };

    function lbZeichne() {
        const liste = lbListe();
        if (!liste.length) { window.mietBildZu(); return; }
        if (lbIndex > liste.length - 1) lbIndex = liste.length - 1;

        const pos = liste[lbIndex];
        document.getElementById('miet-lb-img').src = daten.fotos[lbWelche][pos];
        document.getElementById('miet-lb-title').innerHTML =
            `Bild ${fotoPositionen().indexOf(pos) + 1} ${esc(phasenWort())} — ${esc(pos)}` +
            `<small>${lbIndex + 1} von ${liste.length} vorhandenen Bildern</small>`;
        document.getElementById('miet-lb-prev').disabled = lbIndex === 0;
        document.getElementById('miet-lb-next').disabled = lbIndex === liste.length - 1;
        document.getElementById('miet-lb-dots').innerHTML = liste.map((p, i) =>
            `<button type="button" class="miet-lb-dot${i === lbIndex ? ' on' : ''}" title="${esc(p)}" onclick="window.mietBildSpringen(${i})"></button>`).join('');
    }

    function lbTaste(e) {
        if (!lbOffen) return;
        if (e.key === 'Escape') window.mietBildZu();
        else if (e.key === 'ArrowLeft') window.mietBildBlaettern(-1);
        else if (e.key === 'ArrowRight') window.mietBildBlaettern(1);
    }

    // Wischen auf dem Handy
    let wischStart = null;
    document.addEventListener('touchstart', (e) => {
        if (!lbOffen) return;
        wischStart = e.touches[0].clientX;
    }, { passive: true });
    document.addEventListener('touchend', (e) => {
        if (!lbOffen || wischStart === null) return;
        const weg = e.changedTouches[0].clientX - wischStart;
        wischStart = null;
        if (Math.abs(weg) > 50) window.mietBildBlaettern(weg < 0 ? 1 : -1);
    }, { passive: true });

    // ------------------------------------------------------
    // Unterschriftenfeld
    // ------------------------------------------------------
    let padCtx = null, padZeichnet = false, padLeer = true;

    window.mietPadOpen = function (schluessel, titel) {
        padZiel = schluessel;
        const ov = document.getElementById('miet-pad-overlay');
        const cv = document.getElementById('miet-pad-canvas');
        const tt = document.getElementById('miet-pad-title');
        if (!ov || !cv) return;
        if (tt) tt.textContent = titel || 'Unterschrift';
        ov.classList.add('open');

        // Aufloesung an die tatsaechliche Anzeigegroesse anpassen,
        // sonst wird der Strich verzerrt.
        const rect = cv.getBoundingClientRect();
        cv.width = rect.width * 2;
        cv.height = rect.height * 2;
        padCtx = cv.getContext('2d');
        padCtx.scale(2, 2);
        padCtx.lineWidth = 2.2;
        padCtx.lineCap = 'round';
        padCtx.lineJoin = 'round';
        padCtx.strokeStyle = '#111';
        padLeer = true;

        const pos = (e) => {
            const r = cv.getBoundingClientRect();
            const p = e.touches ? e.touches[0] : e;
            return { x: p.clientX - r.left, y: p.clientY - r.top };
        };
        const start = (e) => { e.preventDefault(); padZeichnet = true; padLeer = false; const q = pos(e); padCtx.beginPath(); padCtx.moveTo(q.x, q.y); };
        const move = (e) => { if (!padZeichnet) return; e.preventDefault(); const q = pos(e); padCtx.lineTo(q.x, q.y); padCtx.stroke(); };
        const stop = () => { padZeichnet = false; };

        cv.onmousedown = start; cv.onmousemove = move;
        cv.onmouseup = stop; cv.onmouseleave = stop;
        cv.ontouchstart = start; cv.ontouchmove = move; cv.ontouchend = stop;
    };

    window.mietPadClear = function () {
        const cv = document.getElementById('miet-pad-canvas');
        if (cv && padCtx) padCtx.clearRect(0, 0, cv.width, cv.height);
        padLeer = true;
    };

    window.mietPadCancel = function () {
        const ov = document.getElementById('miet-pad-overlay');
        if (ov) ov.classList.remove('open');
        padZiel = null;
    };

    window.mietPadSave = function () {
        const cv = document.getElementById('miet-pad-canvas');
        if (cv && padZiel && !padLeer) daten.unterschriften[padZiel] = cv.toDataURL('image/png');
        window.mietPadCancel();
        zeichneInhalt();
    };

    window.mietSignLoeschen = function (schluessel) {
        daten.unterschriften[schluessel] = null;
        zeichneInhalt();
    };

    console.log('Mietvereinbarung geladen.');
})();
