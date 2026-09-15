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
    // Was in dieser Sitzung schon in R2 liegt: "phase|position" -> { bild, eintrag }
    let hochgeladeneFotos = {};
    let padZiel = null;    // welches Unterschriftenfeld gerade gezeichnet wird
    let schadenLeer = true; // Stand beim letzten Zeichnen: Schadenstabelle ohne Eintrag

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
                ende: '', ende_bs: '', tagessatz: '', zusatzinfo: vorlage.zusatzinfo || '',
                // Zuletzt automatisch aus den Preisregeln der Vorlage eingetragener
                // Betrag. Stimmt "tagessatz" damit überein (oder ist leer), darf
                // die Automatik überschreiben — sonst hat jemand von Hand getippt.
                tagessatz_auto: ''
            },
            pruefpunkte: {},   // "nr" -> { spaltenId: 'io' | 'nio' | null }
            auswahl: {},       // "nr" -> ['12 mm'] — gewählte Ausführungen
            trommeltyp: '',
            sauberkeit: { gereinigt: {}, diesel: {}, sonstiges: '' },
            einweisung: { erfolgt: null, durch_id: '', durch_name: '' },
            schaeden: [{ nr: '', position: '', beschreibung: '' }],
            fotos: { uebergabe: {}, ruecknahme: {} },
            unterschriften: {
                u_vermieter: null, u_mieter: null, u_datum: heute(),   // Übergabe
                r_vermieter: null, r_mieter: null, r_datum: ''       // Rücknahme
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
    // Entwurf: nichts geht mehr verloren
    // ------------------------------------------------------
    // Ohne das hier war bei einem Abbruch (kein Empfang, Tab abgestürzt,
    // Handy gesperrt) die ganze Aufnahme weg — Bogen und Fotos lebten nur
    // im Arbeitsspeicher. Jetzt wandert der Stand bei jeder Änderung in
    // IndexedDB (localStorage wäre mit den Fotos sofort voll) und wird
    // beim nächsten Öffnen angeboten. Gelöscht wird er erst, wenn das
    // Speichern in die Datenbank wirklich durch ist.
    const ENTWURF_DB = 'miet-entwuerfe';
    const ENTWURF_STORE = 'entwuerfe';
    let entwurfKey = null;
    let entwurfUhr = null;

    function entwurfDb() {
        return new Promise((fertig, fehler) => {
            if (!window.indexedDB) { fehler(new Error('IndexedDB fehlt')); return; }
            const anfrage = window.indexedDB.open(ENTWURF_DB, 1);
            anfrage.onupgradeneeded = () => {
                const db = anfrage.result;
                if (!db.objectStoreNames.contains(ENTWURF_STORE)) db.createObjectStore(ENTWURF_STORE);
            };
            anfrage.onsuccess = () => fertig(anfrage.result);
            anfrage.onerror = () => fehler(anfrage.error);
        });
    }

    async function entwurfArbeit(modus, fn) {
        const db = await entwurfDb();
        try {
            return await new Promise((fertig, fehler) => {
                const t = db.transaction(ENTWURF_STORE, modus);
                const anfrage = fn(t.objectStore(ENTWURF_STORE));
                anfrage.onsuccess = () => fertig(anfrage.result);
                anfrage.onerror = () => fehler(anfrage.error);
            });
        } finally {
            db.close();
        }
    }

    // Bei jeder Änderung aufgerufen, aber höchstens alle 800 ms geschrieben.
    function entwurfMerken() {
        if (!entwurfKey || !daten) return;
        clearTimeout(entwurfUhr);
        entwurfUhr = setTimeout(() => {
            const stand = { gespeichertAm: Date.now(), phase: phase, daten: daten,
                            gespeicherteId: gespeicherteId, gespeichertesDoc: gespeichertesDoc };
            entwurfArbeit('readwrite', s => s.put(stand, entwurfKey))
                .catch(e => console.warn('Entwurf konnte nicht gesichert werden:', e));
        }, 800);
    }

    async function entwurfLesen(key) {
        try { return await entwurfArbeit('readonly', s => s.get(key)); }
        catch (e) { console.warn('Entwurf konnte nicht gelesen werden:', e); return null; }
    }

    async function entwurfLoeschen() {
        clearTimeout(entwurfUhr);
        if (!entwurfKey) return;
        try { await entwurfArbeit('readwrite', s => s.delete(entwurfKey)); }
        catch (e) { console.warn('Entwurf konnte nicht gelöscht werden:', e); }
    }

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
        hochgeladeneFotos = {};
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

        // Liegt ein ungespeicherter Stand vor, wird er angeboten statt
        // stillschweigend verworfen.
        entwurfKey = `${machineId || 'ohne'}|${agreementId || 'neu'}`;
        const entwurf = await entwurfLesen(entwurfKey);
        if (entwurf && entwurf.daten) {
            const wann = new Date(entwurf.gespeichertAm || Date.now());
            const text = `Es gibt einen ungespeicherten Stand vom ${wann.toLocaleDateString('de-DE')}, `
                + `${wann.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr `
                + `(inklusive Fotos).\n\nDiesen Stand fortsetzen?`;
            if (window.confirm(text)) {
                daten = entwurf.daten;
                if (entwurf.phase) phase = entwurf.phase;
                if (entwurf.gespeicherteId) gespeicherteId = entwurf.gespeicherteId;
                if (entwurf.gespeichertesDoc) gespeichertesDoc = entwurf.gespeichertesDoc;
            } else {
                await entwurfLoeschen();
            }
        }

        zeichneFenster();
        // html2canvas und jsPDF schon jetzt im Hintergrund holen. Beim
        // Speichern waren das bisher die ersten Sekunden Wartezeit —
        // ausgerechnet dann, wenn der Empfang schlecht ist.
        ladeHtml2Canvas().catch(() => { });
        if (typeof window.loadPDFGenerators === 'function') { try { window.loadPDFGenerators(); } catch (e) { } }
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
        // Beim Schliessen den letzten Stand noch sichern (Entwurf).
        entwurfSofort(null);
        document.removeEventListener('visibilitychange', entwurfSofort);
        window.removeEventListener('pagehide', entwurfSofort);
        window.mietBildZu();
        menuSchliessen();
        // Zwischengespeicherte Bilddaten freigeben — sie sind nur innerhalb
        // eines Bogens etwas wert und belegen sonst dauerhaft Speicher.
        if (typeof datenUrlCache !== 'undefined') datenUrlCache.clear();
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
                        <span>Übergabe</span>
                    </button>
                    <button type="button" id="miet-phase-r" class="miet-phase-btn miet-phase-back" onclick="window.setMietPhase('ruecknahme')">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;">
                            <path d="M19 12H5"></path><path d="M11 18l-6-6 6-6"></path>
                        </svg>
                        <span>Rückgabe</span>
                    </button>
                </div>

                <div class="miet-body">
                    <div class="miet-pages-wrap" id="miet-pages-wrap">
                        <div class="miet-pages" id="miet-pages"></div>
                    </div>
                </div>

                <div class="miet-foot">
                    <!-- Zoom: auf dem Handy zum Ausfüllen unverzichtbar, am
                         Rechner ausgeblendet (siehe .miet-zoom in der CSS). -->
                    <span class="miet-zoom">
                        <button type="button" onclick="window.mietZoom(-1)" title="Kleiner">&minus;</button>
                        <span id="miet-zoom-wert">100%</span>
                        <button type="button" onclick="window.mietZoom(1)" title="Größer">+</button>
                    </span>
                    <span class="miet-note" id="miet-status"></span>
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
        dropZuhoerer(document.getElementById('miet-pages'));
        // Daneben fallen gelassene Bilder würde der Browser sonst statt der
        // App anzeigen — der ausgefüllte Bogen wäre damit weg.
        ov.addEventListener('dragover', (e) => e.preventDefault());
        ov.addEventListener('drop', (e) => e.preventDefault());
        window.addEventListener('resize', skaliereSeiten);
        // Handy gesperrt, App weggewischt: dann sofort schreiben statt
        // auf das Ende der Wartezeit zu hoffen.
        document.addEventListener('visibilitychange', entwurfSofort);
        window.addEventListener('pagehide', entwurfSofort);
    }

    function entwurfSofort(e) {
        if (e && e.type === 'visibilitychange' && document.visibilityState === 'visible') return;
        clearTimeout(entwurfUhr);
        entwurfUhr = null;
        if (!entwurfKey || !daten) return;
        const stand = { gespeichertAm: Date.now(), phase: phase, daten: daten,
                        gespeicherteId: gespeicherteId, gespeichertesDoc: gespeichertesDoc };
        entwurfArbeit('readwrite', s => s.put(stand, entwurfKey))
            .catch(e => console.warn('Entwurf konnte nicht gesichert werden:', e));
    }

    // ------------------------------------------------------
    // Der Briefbogen — auf A4-Seiten verteilt
    // ------------------------------------------------------
    // ------------------------------------------------------
    // Tagessatz nach Ausstattung
    // ------------------------------------------------------
    // Die Vorlage kann Preisregeln tragen (Einstellungen → Mietvereinbarung
    // → „Tagessätze nach Ausstattung"). Was am Bogen gesetzt ist — gewählte
    // Ausführungen und angekreuzte optionale Prüfpunkte — wird gegen diese
    // Regeln gehalten; der Treffer landet im Feld „Tagessatz".
    function ausstattungAmBogen() {
        const liste = [];
        let nr = 0;
        (vorlage.baugruppen || []).forEach(g => (g.punkte || []).forEach(roh => {
            nr++;
            const p = punktLesen(roh);
            ((daten.auswahl && daten.auswahl[nr]) || []).forEach(o => liste.push({ punkt: p.text, option: o }));
            if (p.optional) {
                const eintrag = daten.pruefpunkte[nr] || {};
                if (Object.keys(eintrag).some(k => eintrag[k])) liste.push({ punkt: p.text, verbaut: true });
            }
        }));
        return liste;
    }

    // Trägt den passenden Tagessatz ein — aber nur, wenn das Feld leer ist
    // oder noch den zuletzt automatisch gesetzten Wert zeigt. Ein von Hand
    // eingetippter Betrag bleibt stehen. Gibt true zurück, wenn sich der
    // Wert geändert hat.
    function preisAktualisieren() {
        if (!daten || !vorlage || typeof window.mietPreisErmitteln !== 'function') return false;
        if (!Array.isArray(vorlage.preise) || !vorlage.preise.length) return false;
        const m = daten.miete;
        const neu = window.mietPreisErmitteln(vorlage.preise, ausstattungAmBogen());
        const aktuell = String(m.tagessatz || '');
        const frei = !aktuell.trim() || aktuell === String(m.tagessatz_auto || '');
        if (!frei || aktuell === neu) { return false; }
        m.tagessatz = neu;
        m.tagessatz_auto = neu;
        return true;
    }

    function zeichneInhalt() {
        const pages = document.getElementById('miet-pages');
        if (!pages) return;

        preisAktualisieren();

        // Jeder Neuaufbau heisst: es hat sich etwas geändert.
        entwurfMerken();

        // Der Bogen wird bei jedem Kreuz komplett neu aufgebaut. Ohne das
        // hier sprang die Ansicht dabei zurück nach ganz oben links —
        // beim Ausfüllen auf dem Handy unbrauchbar.
        const rollbereich = document.querySelector('.miet-body');
        const vorherOben = rollbereich ? rollbereich.scrollTop : 0;
        const vorherLinks = rollbereich ? rollbereich.scrollLeft : 0;

        document.getElementById('miet-phase-u').classList.toggle('active', phase === 'uebergabe');
        document.getElementById('miet-phase-r').classList.toggle('active', phase === 'ruecknahme');

        const recht = rechtsBlock();
        pages.innerHTML = '';

        // Mieter, Gerät und Abnahme gehören zusammen auf das erste Blatt.
        // Reicht der Platz nicht, wird der Teil so weit verkleinert, bis er
        // passt (siehe ersteSeite) — statt ihn auf zwei Blätter zu reissen.
        ersteSeite(pages, [kopfBlock(), geraetBlock(), abnahmeBlock()]);

        // Die Schadenstabelle steht immer allein auf einem Blatt. Ist keine
        // Zeile ausgefüllt, bleibt das Blatt nur zum Eintragen am Bildschirm
        // stehen und wird weder gedruckt noch ins PDF übernommen.
        schadenLeer = !schadenHatInhalt();
        eigeneSeite(pages, schadenBlock(), schadenLeer);

        // Fotos zuerst, dann der Vertragstext auf seinem eigenen Blatt, und
        // die Unterschriften ganz zum Schluss: der Vertragstext steht damit
        // immer auf der VORLETZTEN Seite und wird direkt danach
        // unterschrieben. (Vorher lag er ganz hinten, hinter den
        // Unterschriften.)
        const fotos = [fotoBlock('uebergabe'), fotoBlock('ruecknahme')].filter(Boolean);
        if (fotos.length) {
            verteileAufSeiten(pages, fotos, true);
            // verteileAufSeiten legt immer ein Blatt an; blieb es leer, muss es
            // wieder weg — sonst stünde vor dem Vertragstext ein leeres Blatt.
            pages.querySelectorAll('.miet-page').forEach(s => {
                if (!innen(s).children.length) s.remove();
            });
        }
        // Der Vertragstext bildet den Schluss und darf über MEHRERE Blätter
        // laufen (der Wortlaut umfasst inzwischen zwei volle Seiten). Früher
        // wurde er auf ein einziges Blatt zusammengeschrumpft — bei diesem
        // Umfang wäre er unlesbar klein. Unterschrieben wird unter den Fotos,
        // eine eigene Bestätigungsseite gibt es deshalb nicht mehr.
        if (recht) verteileRechtstext(pages, recht);
        leereFelderMarkieren(pages);
        seitenNummerieren(pages);
        skaliereSeiten();

        if (rollbereich && (vorherOben || vorherLinks)) {
            rollbereich.scrollTop = vorherOben;
            rollbereich.scrollLeft = vorherLinks;
        }

        bilderAbwarten(pages);
    }

    // Die Seitenaufteilung misst die tatsächliche Höhe — ein Bild, das
    // noch nicht fertig geladen ist, zählt dabei mit 0 mit. Danach wächst
    // der Block, läuft über den Seitenrand und wird abgeschnitten
    // (.miet-page-inner hat overflow:hidden). Genau deshalb fehlten Fotos
    // und die Zeilen darunter in der Vorschau und im Ausdruck.
    // Also: sobald ein Bild nachlädt, einmal neu verteilen.
    let bilderTimer = null;
    let bilderRunden = 0;

    function bilderAbwarten(container) {
        const offen = Array.from(container.querySelectorAll('img'))
            .filter(i => !i.complete || !i.naturalWidth);
        if (!offen.length) { bilderRunden = 0; return; }
        if (bilderRunden > 3) return;   // Notbremse gegen Endlosschleifen

        offen.forEach(i => i.addEventListener('load', () => {
            clearTimeout(bilderTimer);
            bilderTimer = setTimeout(() => { bilderRunden++; zeichneInhalt(); }, 60);
        }, { once: true }));
    }

    // Vor dem Abfotografieren fürs PDF: alle Bilder wirklich fertig
    // dekodiert, sonst landen leere Kacheln im PDF.
    async function bilderFertig(container) {
        const bilder = Array.from(container.querySelectorAll('img'));
        await Promise.all(bilder.map(img => {
            if (img.complete && img.naturalWidth) return Promise.resolve();
            if (img.decode) return img.decode().catch(() => { });
            return new Promise(r => {
                img.addEventListener('load', r, { once: true });
                img.addEventListener('error', r, { once: true });
            });
        }));
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
        rest.querySelectorAll("[data-nurerste],[data-ersteseite]").forEach(n => n.remove());
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

    // Legt mehrere Blöcke zwingend auf EIN Blatt. Passt der Stapel nicht,
    // wird er als Ganzes verkleinert (--miet-fit-f). Gemessen wird die
    // ungeskalierte Höhe, denn transform ändert die Layouthöhe nicht.
    function ersteSeite(container, htmls) {
        const seite = neueSeite(container);
        const box = document.createElement('div');
        box.className = 'miet-fit';
        innen(seite).appendChild(box);
        htmls.filter(Boolean).forEach(h => {
            const b = ausHtml(h);
            if (b) box.appendChild(b);
        });

        const platz = innen(seite).clientHeight;
        const hoehe = innen(seite).scrollHeight;
        let f = 1;
        if (hoehe > platz && platz > 0) {
            f = Math.max(0.55, Math.floor((platz / hoehe) * 100) / 100);
        }
        box.style.setProperty('--miet-fit-f', f);
        // Breite gegenrechnen, damit der verkleinerte Stapel den Satzspiegel
        // weiter voll ausfüllt statt rechts Luft zu lassen.
        box.style.width = (100 / f) + '%';
        return seite;
    }

    // Ein Block allein auf einem Blatt. `nurSchirm` markiert ein Blatt, das
    // nur zum Ausfüllen da ist und beim Drucken/PDF wegfällt.
    function eigeneSeite(container, html, nurSchirm) {
        const block = ausHtml(html);
        if (!block) return null;
        const seite = neueSeite(container);
        if (nurSchirm) seite.classList.add('miet-page-leer');
        innen(seite).appendChild(block);
        return seite;
    }

    function verteileAufSeiten(container, bloecke, anhaengen) {
        if (!anhaengen) container.innerHTML = '';
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

    // Der Vertragstext lief früher zwingend auf EIN Blatt und wurde dafür
    // beliebig klein gesetzt. Der Wortlaut umfasst inzwischen zwei volle
    // Seiten — deshalb: zweispaltig setzen, an den eigenen Absätzen
    // (data-split) auf mehrere Blätter umbrechen und die Schrift nur so weit
    // verkleinern, bis ZWEI Blätter reichen. Untergrenze 0,7 (≈ 7,5 px, so
    // klein wie der gedruckte Originalbogen) — darunter wird nicht weiter
    // geschrumpft, dann bekommt der Text lieber ein drittes Blatt.
    const RECHT_ZIEL_SEITEN = 2;
    const RECHT_MIN_F = 0.62;

    /* Der gefundene Verkleinerungsfaktor haengt NUR am Wortlaut und an der
       Darstellungsart (A4 oder Fliessmodus) — nicht am Rest des Bogens.
       Ohne diesen Merker suchte jeder Neuaufbau (jedes Kreuz, jedes Foto)
       ihn von 1,0 abwaerts erneut, und jeder Versuch ist ein kompletter
       Seitenumbruch mit Messen. Gemerkt wird deshalb der zuletzt passende
       Wert und beim naechsten Mal sofort dort angefangen. */
    let rechtMerker = { schluessel: null, f: 1 };

    function verteileRechtstext(container, html) {
        const vorher = container.querySelectorAll('.miet-page').length;
        const schluessel = html.length + '|' + (a4Modus ? 'a4' : istHandy() ? 'fluss' : 'schirm');
        let f = rechtMerker.schluessel === schluessel ? rechtMerker.f : 1;
        for (let versuch = 0; versuch < 20; versuch++) {
            const markup = html.replace(
                'class="miet-block miet-recht"',
                `class="miet-block miet-recht" style="--miet-recht-f:${f}"`);
            verteileAufSeiten(container, [markup], true);

            const seiten = container.querySelectorAll('.miet-page').length - vorher;
            if (seiten <= RECHT_ZIEL_SEITEN || f <= RECHT_MIN_F) {
                rechtMerker = { schluessel: schluessel, f: f };
                return;
            }

            // Zu viele Blätter: Versuch verwerfen und eine Stufe kleiner.
            Array.from(container.querySelectorAll('.miet-page')).slice(vorher)
                .forEach(s => s.remove());
            f = Math.round((f - 0.03) * 100) / 100;
        }
    }

    // Ein leeres <input type="date"> zeigt im Browser "tt.mm.jjjj", ein
    // leeres Zeitfeld "--:--". Auf dem Papier und im PDF soll dort NICHTS
    // stehen — man soll von Hand eintragen können. Ein CSS-Platzhalter ist
    // das nicht (::placeholder greift dort nicht), deshalb wird hier
    // markiert und die Schrift im Druck/PDF durchsichtig geschaltet.
    function leereFelderMarkieren(container) {
        container.querySelectorAll('input.miet-in').forEach(f => {
            f.classList.toggle('miet-feld-leer', !f.value);
        });
    }

    function seitenNummerieren(container) {
        // Blätter, die nur am Bildschirm zum Ausfüllen stehen (leere
        // Schadenstabelle), zählen nicht mit — sonst stimmt die
        // Seitenangabe im Ausdruck nicht.
        const seiten = Array.from(container.querySelectorAll('.miet-page:not(.miet-page-leer)'));
        seiten.forEach((s, i) => {
            s.querySelector('.miet-page-nr').textContent = `Seite ${i + 1} von ${seiten.length}`;
        });
        container.querySelectorAll('.miet-page.miet-page-leer .miet-page-nr').forEach(n => {
            n.textContent = 'Leer — wird nicht gedruckt';
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

    // Zoom im Fliessmodus (Handy/Tablet). Der Bogen wird als Ganzes
    // vergrössert — Schrift, Ankreuzfelder und Fotos gleichermassen.
    // Gemerkt wird der Wert, damit er beim nächsten Öffnen noch steht.
    const ZOOM_STUFEN = [0.75, 0.9, 1, 1.15, 1.35, 1.6, 2];
    let zoom = 1;

    try {
        const gemerkt = parseFloat(localStorage.getItem('miet_zoom'));
        if (ZOOM_STUFEN.includes(gemerkt)) zoom = gemerkt;
    } catch (e) { /* privater Modus */ }

    window.mietZoom = function (richtung) {
        const i = ZOOM_STUFEN.indexOf(zoom);
        const neu = ZOOM_STUFEN[Math.min(ZOOM_STUFEN.length - 1, Math.max(0, (i === -1 ? 2 : i) + richtung))];
        if (neu === zoom) return;
        zoom = neu;
        try { localStorage.setItem('miet_zoom', String(zoom)); } catch (e) { /* egal */ }
        skaliereSeiten();
    };

    function zoomAnzeige() {
        const el = document.getElementById('miet-zoom-wert');
        if (el) el.textContent = Math.round(zoom * 100) + '%';
    }

    function skaliereSeiten() {
        const wrap = document.getElementById('miet-pages-wrap');
        const pages = document.getElementById('miet-pages');
        if (!wrap || !pages) return;

        // Im Fliessmodus wird nicht auf A4 gerechnet — dort gilt der Zoom.
        if (istHandy() && !a4Modus) {
            pages.style.setProperty('--miet-zoom', zoom);
            // Beim Vergrössern wächst der Bogen über seine Layouthöhe
            // hinaus (transform ändert die Höhe nicht) — sonst liesse sich
            // der untere Teil nicht mehr erreichen.
            wrap.style.height = zoom === 1 ? 'auto' : (pages.scrollHeight * zoom) + 'px';
            zoomAnzeige();
            return;
        }
        pages.style.removeProperty('--miet-zoom');
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

    window.mietDrucken = async function () {
        window.mietSchliesseVorschlaege();
        // Ein noch offenes Feld kann die Seite gesprengt haben.
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
        window.mietSeitenPruefen();
        // Leere Datums-/Zeitfelder sollen auf dem Papier leer bleiben.
        const seitenBox = document.getElementById('miet-pages');
        if (seitenBox) leereFelderMarkieren(seitenBox);

        // Am Rechner druckt der Browser den Bogen direkt — das Ergebnis
        // stimmt und ist am schnellsten.
        if (!istHandy()) {
            mitA4(() => window.print());
            return;
        }

        // Auf Handy und Tablet kam beim Browser-Druck etwas anderes heraus
        // als am Rechner: die Geräte drucken die Seite nach eigenen Regeln
        // (Geräteweite, eigene Ränder, kein Briefbogen). Deshalb wird hier
        // dasselbe PDF erzeugt wie beim Speichern und zum Ansehen bzw.
        // Weitergeben geöffnet — damit sieht es überall gleich aus.
        try {
            status('PDF wird erzeugt …');
            const doc = await mitEingebettetenFotos(() => mitA4(() => pdfErzeugen()));
            const blob = doc.output('blob');
            const url = URL.createObjectURL(blob);
            const fenster = window.open(url, '_blank');
            if (!fenster) {
                // Pop-up blockiert: dann als Datei anbieten.
                const a = document.createElement('a');
                a.href = url;
                a.download = pdfDateiName();
                document.body.appendChild(a);
                a.click();
                a.remove();
            }
            setTimeout(() => URL.revokeObjectURL(url), 60000);
            status('');
        } catch (e) {
            console.error('PDF für den Druck fehlgeschlagen:', e);
            status('');
            window.showToast('PDF konnte nicht erzeugt werden: ' + fehlerText(e));
        }
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

    /* Zeitmessung beim Speichern. Ohne sie ist nicht zu sagen, WO die
       Sekunden hingehen (Fotos, PDF-Aufnahme, Upload, Datenbank) — und ohne
       das lässt sich nichts gezielt beschleunigen. Die Aufstellung landet in
       der Konsole und die grössten Brocken in der Fusszeile. */
    let messAnfang = 0, messLetzte = 0, messListe = [];

    function messStarten() {
        messAnfang = messLetzte = performance.now();
        messListe = [];
    }
    function messPunkt(name) {
        const jetzt = performance.now();
        messListe.push({ schritt: name, s: +((jetzt - messLetzte) / 1000).toFixed(1) });
        messLetzte = jetzt;
    }
    function messText() {
        if (!messAnfang) return '';
        const gesamt = +((performance.now() - messAnfang) / 1000).toFixed(1);
        console.table(messListe);
        console.log('Mietvereinbarung speichern — gesamt', gesamt, 's');
        const gross = messListe.slice().sort((a, b) => b.s - a.s).slice(0, 3)
            .filter(x => x.s >= 0.5).map(x => `${x.schritt} ${x.s} s`).join(', ');
        return ` — ${gesamt} s${gross ? ' (' + gross + ')' : ''}`;
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
            // Bei schlechtem Empfang blieb das Laden ohne Fehler stehen und
            // damit das ganze Speichern — deshalb eine harte Obergrenze.
            const uhr = setTimeout(() => reject(new Error('html2canvas lädt zu langsam. Bitte Verbindung prüfen.')), 20000);
            s.onload = () => { clearTimeout(uhr); resolve(); };
            s.onerror = () => { clearTimeout(uhr); reject(new Error('html2canvas konnte nicht geladen werden. Bitte Internetverbindung prüfen.')); };
            document.head.appendChild(s);
        });
    }

    // Netzsachen laufen bei schlechtem Empfang gern ins Leere. Deshalb
    // jeder Upload mit Zeitgrenze und zwei Wiederholungen — ein einzelner
    // Aussetzer wirft dann nicht die ganze Arbeit weg.
    function mitZeitgrenze(versprechen, ms, was) {
        return new Promise((fertig, fehler) => {
            const uhr = setTimeout(() => fehler(new Error(was + ' dauert zu lange (Verbindung).')), ms);
            versprechen.then(w => { clearTimeout(uhr); fertig(w); },
                             e => { clearTimeout(uhr); fehler(e); });
        });
    }

    /* Aus IRGENDEINEM Fehlerwert einen lesbaren Text machen. Vorher stand in
       der Meldung „unbekannter Fehler“, sobald der Wert kein Error mit
       .message war (AWS-Objekte, DOMException, abgelehnte Zeichenketten) —
       damit war nicht herauszufinden, woran es lag. */
    function fehlerText(e) {
        if (!e) return 'kein Grund angegeben';
        if (typeof e === 'string') return e;
        const teile = [];
        if (e.message) teile.push(e.message);
        if (e.code && String(e.code) !== e.message) teile.push('Code ' + e.code);
        if (e.statusCode) teile.push('HTTP ' + e.statusCode);
        if (!teile.length && e.name) teile.push(e.name);
        if (!teile.length) {
            try { teile.push(JSON.stringify(e).slice(0, 160)); }
            catch (x) { teile.push(String(e)); }
        }
        return teile.join(' · ');
    }

    /* Zwei Versuche statt drei und kürzere Fristen. Vorher konnte ein
       hoffnungsloser Upload 3 × 90 s laufen — viereinhalb Minuten bis zur
       Fehlermeldung. Wer im Funkloch steht, will das nach einer Minute
       wissen und nicht nach fünf. */
    async function mitWiederholung(fn, was, ms) {
        let letzter = null;
        for (let versuch = 1; versuch <= 2; versuch++) {
            try {
                return await mitZeitgrenze(Promise.resolve(fn()), ms || 45000, was);
            } catch (e) {
                letzter = e;
                console.warn(`${was}: Versuch ${versuch} fehlgeschlagen`, e);
                if (versuch < 2) {
                    status(`${was}: neuer Versuch …`);
                    await new Promise(r => setTimeout(r, 1500));
                }
            }
        }
        const f = new Error(`${was} fehlgeschlagen: ${fehlerText(letzter)}`);
        f.ursprung = letzter;
        throw f;
    }

    // Bilder, die schon in R2 liegen (geladene Vereinbarung), haengen als
    // fremde Adresse im Bogen. html2canvas zeichnet sie mit, und damit ist
    // die Zeichenflaeche "tainted" — toDataURL wirft dann
    // "Tainted canvases may not be exported" und das Speichern bricht ab.
    // Deshalb vor dem PDF jedes fremde Bild einmal holen und als Daten-URL
    // einsetzen; danach wird der Originalstand wiederhergestellt, damit
    // fotosHochladen die Bilder nicht erneut hochlaedt.
    /* Einmal geholte Bilder bleiben für die Sitzung liegen. Beim zweiten
       Speichern (typisch: Rücknahme nachtragen) sind die Übergabe-Fotos
       sonst erneut aus R2 zu holen — bei neun Bildern ist das die längste
       Wartezeit im ganzen Ablauf. */
    const datenUrlCache = new Map();

    /* Mehrere Aufgaben gleichzeitig, aber nicht alle auf einmal: mehr als
       eine Handvoll paralleler Downloads bringt auf Mobilfunk nichts und
       lässt einzelne in die Zeitgrenze laufen. */
    async function parallel(liste, gleichzeitig, arbeit) {
        const rest = liste.slice();
        const laeufer = [];
        for (let i = 0; i < Math.min(gleichzeitig, rest.length); i++) {
            laeufer.push((async () => {
                let a;
                while ((a = rest.shift()) !== undefined) await arbeit(a);
            })());
        }
        await Promise.all(laeufer);
    }

    async function alsDatenUrl(url) {
        const gemerkt = datenUrlCache.get(url);
        if (gemerkt) return gemerkt;
        // Ein zweiter Anlauf nach kurzer Pause: bei wackeligem Empfang
        // scheitert der erste Griff oft, der zweite klappt.
        let frisch;
        try {
            frisch = await alsDatenUrlHolen(url);
        } catch (e) {
            await new Promise(r => setTimeout(r, 800));
            frisch = await alsDatenUrlHolen(url);
        }
        datenUrlCache.set(url, frisch);
        return frisch;
    }

    function blobAlsDatenUrl(blob) {
        return new Promise((fertig, fehler) => {
            const leser = new FileReader();
            leser.onloadend = () => fertig(leser.result);
            leser.onerror = fehler;
            leser.readAsDataURL(blob);
        });
    }

    async function alsDatenUrlHolen(url) {
        /* ERSTER WEG: über den signierten S3-Zugang, über den die Datei auch
           hochgeladen wurde. Genau hier lag der Fehler „ohne CORS am Speicher“:
           die öffentliche Adresse pub-….r2.dev ist ein anderer Host und
           schickt keine CORS-Kopfzeilen — ein `fetch` darauf muss scheitern,
           egal wie oft man es versucht. Der S3-Endpunkt antwortet dagegen,
           sonst könnte diese App dorthin nicht einmal hochladen. */
        const pfad = window.FileUploadService && window.FileUploadService.r2PfadAusUrl
            ? window.FileUploadService.r2PfadAusUrl(url) : null;
        if (pfad) {
            try {
                const blob = await window.FileUploadService.downloadFile(pfad, { bucket: 'dateien' });
                return await blobAlsDatenUrl(blob);
            } catch (e) {
                console.warn('Bild über den S3-Zugang nicht ladbar, zweiter Versuch über die öffentliche Adresse:', e && e.message);
            }
        }

        // Zweiter Weg: holen und umwandeln (klappt nur mit CORS am Bucket).
        try {
            const res = await fetch(url, { mode: 'cors', cache: 'force-cache' });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const blob = await res.blob();
            return await new Promise((fertig, fehler) => {
                const leser = new FileReader();
                leser.onloadend = () => fertig(leser.result);
                leser.onerror = fehler;
                leser.readAsDataURL(blob);
            });
        } catch (e) {
            console.warn('Bild konnte nicht geholt werden, zweiter Versuch über <img>:', e);
        }
        // Dritter Weg: als Bild mit crossOrigin laden und neu zeichnen.
        return await new Promise((fertig, fehler) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                try {
                    const c = document.createElement('canvas');
                    c.width = img.naturalWidth; c.height = img.naturalHeight;
                    c.getContext('2d').drawImage(img, 0, 0);
                    fertig(c.toDataURL('image/jpeg', FOTO_QUALITAET));
                } catch (e) { fehler(e); }
            };
            img.onerror = () => fehler(new Error('Bild nicht ladbar: ' + url));
            img.src = url;
        });
    }

    async function mitEingebettetenFotos(fn) {
        const merker = [];
        for (const p of ['uebergabe', 'ruecknahme']) {
            const satz = daten.fotos[p] || {};
            for (const pos of Object.keys(satz)) {
                const bild = satz[pos];
                if (bild && !/^data:/.test(bild)) merker.push({ behaelter: daten.fotos[p], schluessel: pos, url: bild });
            }
        }
        // Unterschriften können ebenso als Adresse hinterlegt sein
        // (hinterlegte Unterschrift des Benutzers) — sie färben die
        // Zeichenfläche genauso ein.
        Object.keys(daten.unterschriften || {}).forEach(k => {
            const w = daten.unterschriften[k];
            if (typeof w === 'string' && /^https?:\/\//.test(w)) {
                merker.push({ behaelter: daten.unterschriften, schluessel: k, url: w });
            }
        });
        if (!merker.length) return await fn();

        // Nebeneinander statt nacheinander: bei neun nachzuladenden Fotos
        // war das vorher die grösste Einzelwartezeit beim zweiten Speichern.
        let fertigeBilder = 0;
        const gescheitert = [];
        status(`Bilder werden vorbereitet … (0 von ${merker.length})`);
        /* Ein einzelnes Bild darf das PDF nicht mehr verhindern. Vorher warf
           der erste Fehlschlag alles um — der Bogen liess sich dann NIE mehr
           als PDF sichern, auch wenn nur ein Foto fehlte. Jetzt wird das
           Bild ausgelassen und hinterher benannt; alles andere kommt ins PDF. */
        await parallel(merker, 4, async (m) => {
            try {
                m.behaelter[m.schluessel] = await alsDatenUrl(m.url);
            } catch (e) {
                console.error('Foto konnte nicht gelesen werden:', m.schluessel, m.url, e);
                gescheitert.push(m.schluessel);
                m.fehlt = true;
                m.behaelter[m.schluessel] = '';
            }
            fertigeBilder++;
            status(`Bilder werden vorbereitet … (${fertigeBilder} von ${merker.length})`);
        });
        if (gescheitert.length) {
            window.showToast('Diese Fotos liessen sich nicht vom Speicher lesen und fehlen im PDF: '
                + gescheitert.join(', ') + '. In der Datenbank bleiben sie erhalten.');
        }
        zeichneInhalt();
        try {
            return await fn();
        } finally {
            merker.forEach(m => { m.behaelter[m.schluessel] = m.url; });
            zeichneInhalt();
        }
    }

    // Sicherheitsnetz direkt am Bogen: was auch immer noch als fremde
    // Adresse im Markup steht (Foto, Unterschrift, Logo einer Vorlage),
    // wird kurz vor der Aufnahme durch eine Daten-URL ersetzt und danach
    // zurückgesetzt. Über die Daten allein war das nicht sicher zu fassen —
    // die Meldung "Tainted canvas" kam trotzdem.
    async function domBilderEinbetten(pages) {
        const gleicheHerkunft = (src) => {
            try { return new URL(src, location.href).origin === location.origin; }
            catch (e) { return false; }
        };
        const offen = Array.from(pages.querySelectorAll('img')).filter(img => {
            const src = img.getAttribute('src') || '';
            return src && !/^data:/.test(src) && !gleicheHerkunft(src);
        });
        if (!offen.length) return () => { };

        status('Bilder werden vorbereitet …');
        const merker = [];
        // Auch hier nebeneinander; dank Cache sind die meisten Bilder
        // nach mitEingebettetenFotos ohnehin schon geholt.
        // Ein Bild, das sich nicht einbetten lässt, wird für die Aufnahme
        // ENTFERNT statt stehen zu lassen: bliebe die fremde Adresse im
        // Markup, färbte sie die Zeichenfläche ein ("Tainted canvas") und
        // das ganze PDF wäre verloren — wegen eines Bildes.
        await parallel(offen, 4, async (img) => {
            const alt = img.getAttribute('src');
            let neu = '';
            try {
                neu = await alsDatenUrl(alt);
            } catch (e) {
                console.error('Fremdes Bild konnte nicht eingebettet werden:', alt, e);
            }
            img.setAttribute('src', neu);
            merker.push({ img, alt });
        });
        await bilderFertig(pages);
        return () => merker.forEach(m => m.img.setAttribute('src', m.alt));
    }

    // Der Briefbogen liegt als CSS-Hintergrund auf jedem Blatt
    // (vorlage_bg.jpg). Genau der hat die Zeichenflaeche eingefaerbt:
    // in der Bilderliste taucht er nicht auf, weil er kein <img> ist —
    // die Meldung "Tainted canvas" kam trotzdem. Per file:// gilt selbst
    // ein Bild aus dem eigenen Ordner als fremd.
    //
    // Deshalb: einmal holen, als Daten-URL auf die Blaetter legen, nach
    // der Aufnahme zuruecksetzen. Klappt das Holen nicht, wird der
    // Hintergrund fuer die Aufnahme abgeschaltet — ein PDF ohne
    // Briefbogen ist besser als gar keins.
    let bgDatenUrl = null;   // einmal je Sitzung
    let bgUnmoeglich = false;

    async function hintergrundEinbetten(pages) {
        const blaetter = Array.from(pages.querySelectorAll('.miet-page'));
        if (!blaetter.length) return () => { };

        const quelle = getComputedStyle(blaetter[0]).backgroundImage || '';
        const treffer = quelle.match(/url\(["']?(.*?)["']?\)/);
        if (!treffer || /^data:/.test(treffer[1])) return () => { };

        if (!bgDatenUrl && !bgUnmoeglich) {
            try {
                bgDatenUrl = await alsDatenUrl(treffer[1]);
            } catch (e) {
                console.warn('Briefbogen-Hintergrund konnte nicht eingebettet werden:', e);
                bgUnmoeglich = true;
            }
        }

        const wert = bgDatenUrl ? `url("${bgDatenUrl}")` : 'none';
        blaetter.forEach(b => b.style.setProperty('background-image', wert, 'important'));
        return () => blaetter.forEach(b => b.style.removeProperty('background-image'));
    }

    // Ein Blatt aus der Gesamtaufnahme herausschneiden. Gemessen wird die
    // Lage des Blattes im Bogen; dieselbe Verschiebung gilt in der Aufnahme,
    // nur mit dem Maßstab multipliziert.
    function seitenAusschnitt(gesamt, seite, rahmen, skala) {
        const r = seite.getBoundingClientRect();
        const x = Math.round((r.left - rahmen.left) * skala);
        const y = Math.round((r.top - rahmen.top) * skala);
        const b = Math.max(1, Math.round(r.width * skala));
        const h = Math.max(1, Math.round(r.height * skala));

        const cv = document.createElement('canvas');
        cv.width = b;
        cv.height = h;
        const ctx = cv.getContext('2d');
        // Weißer Grund: sonst wären Ränder außerhalb der Aufnahme durchsichtig
        // und würden im JPEG schwarz.
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, b, h);
        ctx.drawImage(gesamt, x, y, b, h, 0, 0, b, h);
        return cv;
    }

    // Ist auf dem Blatt ausser Weiss nichts zu sehen? Geprüft werden drei
    // waagerechte Streifen; das reicht, um ein versehentlich leeres Blatt zu
    // erkennen, und kostet kaum Zeit.
    function istLeeresBild(cv) {
        if (!cv.width || !cv.height) return true;
        try {
            const ctx = cv.getContext('2d');
            for (const anteil of [0.25, 0.5, 0.75]) {
                const y = Math.floor(cv.height * anteil);
                const d = ctx.getImageData(0, y, cv.width, 1).data;
                for (let i = 0; i < d.length; i += 4) {
                    if (d[i] < 245 || d[i + 1] < 245 || d[i + 2] < 245) return false;
                }
            }
            return true;
        } catch (e) {
            return false;   // im Zweifel als „hat Inhalt" behandeln
        }
    }

    // Der Bogen ist bereits auf A4-Seiten verteilt — er wird EINMAL
    // abfotografiert, und jedes Blatt wird daraus als ganzseitiges Bild ins
    // PDF gelegt. Dadurch sieht das PDF exakt aus wie der Ausdruck.
    async function pdfErzeugen() {
        await ladeHtml2Canvas();
        if (typeof window.loadPDFGenerators === 'function') await window.loadPDFGenerators();
        if (!window.jspdf) throw new Error('jsPDF steht nicht zur Verfügung.');

        const pages = document.getElementById('miet-pages');
        // Ein leeres Schadenstabellen-Blatt gehört nicht ins PDF.
        const seiten = Array.from(pages.querySelectorAll('.miet-page:not(.miet-page-leer)'));
        if (!seiten.length) throw new Error('Der Bogen ist leer.');

        // Frisch getippte Datums-/Zeitfelder: Markierung nachziehen, damit
        // leere Felder im PDF wirklich leer bleiben.
        leereFelderMarkieren(pages);

        // Erst wenn alle Fotos und Unterschriften wirklich da sind.
        await bilderFertig(pages);
        // Fremde Adressen im Markup einbetten (sonst "Tainted canvas").
        const bilderZurueck = await domBilderEinbetten(pages);
        const hintergrundZurueck = await hintergrundEinbetten(pages);
        messPunkt('  … Bilder einbetten');

        // Verkleinerung und Bedienelemente für die Aufnahme abschalten.
        const altScale = pages.style.getPropertyValue('--miet-scale');
        pages.style.setProperty('--miet-scale', 1);
        pages.classList.add('miet-pdf');

        try {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

            // Massstab 1,15 (frueher 2, dann 1,35): jede Stufe weniger heisst
            // weniger Bildpunkte zu zeichnen, zu kodieren und hochzuladen —
            // und die Seiten sind wegen des Briefbogen-Hintergrunds volle
            // JPEGs, das PDF haengt also direkt daran. ~123 dpi bleiben fuer
            // Bildschirm und Ausdruck lesbar. Wer es feiner braucht, dreht
            // hier hoch — es kostet unmittelbar Wartezeit beim Speichern.
            const skala = 1.15;

            // EIN Aufruf für den GANZEN Bogen statt einer je Seite.
            // Grund: html2canvas klont für jeden Aufruf das komplette
            // Dokument samt aller Stilangaben — das kostet auf diesem
            // index.html rund 2,5 bis 3 Sekunden, VÖLLIG unabhängig davon,
            // wie viel auf der Seite steht (gemessen: ein Blatt mit 19
            // Elementen brauchte genauso lange wie eines mit 300). Bei
            // sechs Blättern ging so eine halbe Minute allein für dieses
            // Klonen drauf. Jetzt fällt diese Grundzeit nur noch einmal an;
            // die einzelnen Blätter werden anschließend aus der fertigen
            // Aufnahme herausgeschnitten (Millisekunden).
            status('PDF wird erzeugt …');
            await new Promise(r => setTimeout(r, 0));

            // Sehr lange Bögen: ein Canvas hat eine Höhengrenze (browserabhängig
            // ab etwa 32.000 Bildpunkten). Dann doch blattweise — lieber langsam
            // als abgeschnitten.
            const gesamtHoehe = pages.getBoundingClientRect().height * skala;
            const amStueck = gesamtHoehe < 30000;

            const gesamt = amStueck
                ? await window.html2canvas(pages, {
                    scale: skala, backgroundColor: '#ffffff', useCORS: true, logging: false
                })
                : null;
            const rahmen = pages.getBoundingClientRect();
            messPunkt('  … Aufnahme');

            for (let i = 0; i < seiten.length; i++) {
                status(`PDF wird erzeugt (Seite ${i + 1} von ${seiten.length}) …`);
                await new Promise(r => setTimeout(r, 0));
                let canvas = gesamt
                    ? seitenAusschnitt(gesamt, seiten[i], rahmen, skala)
                    : await window.html2canvas(seiten[i], {
                        scale: skala, backgroundColor: '#ffffff', useCORS: true, logging: false
                    });

                // Sicherheitsnetz für den Ausschnitt: käme durch einen
                // Rechenfehler ein leeres Blatt heraus, wäre das im PDF eine
                // weisse Seite — und das fiele erst beim Kunden auf. Ein Blatt
                // mit Text muss Farbe enthalten; sonst dieses eine Blatt doch
                // einzeln aufnehmen.
                if (gesamt && istLeeresBild(canvas) && seiten[i].innerText.trim().length > 20) {
                    console.warn('Seitenausschnitt war leer — Blatt', i + 1, 'wird einzeln aufgenommen.');
                    canvas.width = canvas.height = 0;
                    canvas = await window.html2canvas(seiten[i], {
                        scale: skala, backgroundColor: '#ffffff', useCORS: true, logging: false
                    });
                }
                let seitenBild;
                try {
                    seitenBild = canvas.toDataURL('image/jpeg', 0.74);
                } catch (e) {
                    // "Tainted canvas": es hing doch noch ein fremdes Bild im
                    // Bogen. Zur Eingrenzung alle nicht-eingebetteten Quellen
                    // in die Konsole schreiben — sonst ist nicht zu sehen,
                    // welches Bild es war.
                    const fremd = Array.from(pages.querySelectorAll('img'))
                        .map(im => im.getAttribute('src') || '')
                        .filter(s => s && !/^data:/.test(s));
                    console.error('Tainted canvas — diese Bilder sind nicht eingebettet:', fremd, e);
                    // Beim nächsten Anlauf ohne Briefbogen-Hintergrund: der
                    // ist der übliche Verursacher, wenn kein <img> übrig ist.
                    bgUnmoeglich = true;
                    bgDatenUrl = null;
                    const fehler = new Error(fremd.length
                        ? `Ein Bild lässt sich nicht ins PDF übernehmen: ${fremd[0].slice(0, 80)}`
                        : 'Das PDF liess sich nicht erzeugen (Tainted canvas).');
                    fehler.taint = true;
                    throw fehler;
                }
                if (i > 0) doc.addPage();
                doc.addImage(seitenBild, 'JPEG', 0, 0, 210, 297);
                // Speicher der Seite sofort freigeben (Handy).
                canvas.width = canvas.height = 0;
            }
            if (gesamt) gesamt.width = gesamt.height = 0;
            return doc;
        } finally {
            hintergrundZurueck();
            bilderZurueck();
            pages.classList.remove('miet-pdf');
            if (altScale) pages.style.setProperty('--miet-scale', altScale);
            else pages.style.removeProperty('--miet-scale');
            skaliereSeiten();
        }
    }

    // Fotos liegen als Daten-URL im Arbeitsspeicher. Beim Speichern
    // wandern sie einzeln nach R2; im Bogen bleiben sie unverändert,
    // damit ein erneutes Speichern dasselbe PDF ergibt.
    // Früher lief das streng nacheinander: bei zehn Bildern und schwachem
    // Netz summierten sich die Wartezeiten zu Minuten. Jetzt laufen drei
    // Bilder gleichzeitig, jedes mit Zeitgrenze und Wiederholung.
    async function fotosHochladen(basis) {
        const ergebnis = [];
        const offen = [];
        ['uebergabe', 'ruecknahme'].forEach(p => {
            const satz = daten.fotos[p] || {};
            Object.keys(satz).forEach(pos => {
                const bild = satz[pos];
                if (!bild) return;
                // Schon in R2 (geladene Vereinbarung) — nicht noch einmal hoch.
                if (!/^data:/.test(bild)) { ergebnis.push({ phase: p, position: pos, url: bild, path: null, name: pos }); return; }
                // In dieser Sitzung bereits hochgeladen (z. B. weil beim
                // ersten Mal nur das PDF scheiterte) — Eintrag wiederverwenden,
                // sonst liegt dasselbe Bild mehrfach im Speicher.
                const bekannt = hochgeladeneFotos[`${p}|${pos}`];
                if (bekannt && bekannt.bild === bild) { ergebnis.push(bekannt.eintrag); return; }
                offen.push({ p, pos, bild });
            });
        });
        if (!offen.length) return ergebnis;

        let fertig = 0;
        const melde = () => status(`Fotos werden hochgeladen … (${fertig} von ${offen.length})`);
        melde();

        const naechstes = () => offen.shift();
        const arbeiter = async () => {
            let auftrag;
            while ((auftrag = naechstes())) {
                const { p, pos, bild } = auftrag;
                const blob = await (await fetch(bild)).blob();
                const name = `${p}-${sauber(pos)}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.jpg`;
                const res = await mitWiederholung(
                    () => window.FileUploadService.uploadFile(
                        new File([blob], name, { type: 'image/jpeg' }),
                        { bucket: 'dateien', path: `${basis}/fotos/${name}`, compress: false, provider: 'cloudflare-r2' }
                    ), `Foto „${pos}"`, 45000);
                const eintrag = { phase: p, position: pos, url: res.url, path: res.path, name: `${pos} (${p === 'uebergabe' ? 'Übergabe' : 'Rücknahme'})` };
                hochgeladeneFotos[`${p}|${pos}`] = { bild, eintrag };
                ergebnis.push(eintrag);
                fertig++;
                melde();
            }
        };
        // Sechs gleichzeitig: bei achtzehn Fotos (Übergabe + Rücknahme) ist
        // das der Punkt, ab dem die Leitung und nicht mehr das Warten auf
        // die Antwort begrenzt. Mehr bringt nichts und lässt einzelne
        // Uploads in die Zeitgrenze laufen.
        await Promise.all([arbeiter(), arbeiter(), arbeiter(),
                           arbeiter(), arbeiter(), arbeiter()]);
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
        messStarten();
        window.mietSchliesseVorschlaege();
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
        window.mietSeitenPruefen();

        // REIHENFOLGE IST ABSICHT: erst Fotos und Eingaben in die
        // Datenbank, danach das PDF. Vorher stand das PDF am Anfang —
        // scheiterte es (fremdes Bild, kein Empfang, html2canvas), war
        // die ganze Aufnahme nicht gespeichert. Jetzt ist die Arbeit
        // sicher, und ein fehlgeschlagenes PDF ist nur noch ein Hinweis.
        try {
            const basis = `${ordnerName()}/mietvereinbarungen`;
            // Beides gleichzeitig: der Foto-Upload wartet auf das Netz, die
            // PDF-Erzeugung auf den Rechner. Nacheinander addierten sich die
            // Wartezeiten, nebeneinander zählt nur die längere von beiden.
            // Reihenfolge wichtig: fotosHochladen stellt seine Liste sofort
            // zusammen, bevor mitEingebettetenFotos an den Bildern dreht.
            const fotoLauf = fotosHochladen(basis);
            // Zeitgrenze auch um die Erzeugung selbst: haengt html2canvas
            // (oder ein Bild, das nie fertig laedt), wartete man vorher
            // endlos ohne jede Rueckmeldung.
            const pdfLauf = mitZeitgrenze(
                mitEingebettetenFotos(() => mitA4(() => pdfErzeugen())),
                180000, 'Das Erzeugen des PDFs')
                .catch(e => ({ fehler: e }));

            const fotos = await fotoLauf;
            messPunkt('Fotos');

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

            // Ab hier das PDF. Ein Fehler darf das Gespeicherte nicht mehr
            // umwerfen — deshalb eigener try-Block mit eigener Meldung.
            messPunkt('Datenbank');
            const dateiName = pdfDateiName();
            let upload = null;
            let pdfGroesse = 0;
            try {
                let doc = await pdfLauf;
                if (doc && doc.fehler && doc.fehler.taint) {
                    // Verursacher war der Briefbogen-Hintergrund (siehe
                    // hintergrundEinbetten). bgUnmoeglich steht jetzt —
                    // zweiter Anlauf ohne ihn, lieber schlicht als gar nicht.
                    console.warn('Zweiter Anlauf ohne Briefbogen-Hintergrund.');
                    status('PDF wird ohne Briefbogen erzeugt …');
                    doc = await mitEingebettetenFotos(() => mitA4(() => pdfErzeugen()));
                    window.showToast('Das PDF wurde ohne den Briefbogen-Hintergrund erzeugt.');
                }
                if (!doc || doc.fehler) throw (doc && doc.fehler) || new Error('PDF fehlt.');
                const pdfDatei = new File([doc.output('blob')], dateiName, { type: 'application/pdf' });
                messPunkt('PDF erzeugen');
                pdfGroesse = pdfDatei.size;
                status(`PDF wird hochgeladen … (${Math.round(pdfGroesse / 1024)} KB)`);
                upload = await mitWiederholung(() => window.FileUploadService.uploadFile(pdfDatei, {
                    bucket: 'dateien', path: `${basis}/${dateiName}`, compress: false, provider: 'cloudflare-r2'
                }), 'PDF-Upload', 60000);

                const { error } = await window.supabaseClient.from('rental_agreements')
                    .update({ pdf_url: upload.url, pdf_path: upload.path }).eq('id', gespeicherteId);
                if (error) throw error;
                messPunkt('PDF-Upload');
            } catch (pdfFehler) {
                console.error('PDF konnte nicht erzeugt/hochgeladen werden:', pdfFehler,
                    'Ursprung:', pdfFehler && pdfFehler.ursprung);
                await entwurfLoeschen();   // Eingaben und Fotos sind gesichert
                // Die Ursache bleibt in der Fusszeile stehen — der Toast ist
                // nach ein paar Sekunden weg, und ohne den Grund lässt sich
                // nichts nachsehen.
                status('Gespeichert, PDF fehlt: ' + fehlerText(pdfFehler));
                window.showToast('Gespeichert, aber ohne PDF: ' + fehlerText(pdfFehler)
                    + ' — erneut auf Speichern tippen erzeugt es nach.');
                return;
            }
            // Dokument unter "Dokumente" anlegen bzw. aktualisieren.
                messPunkt('PDF-Upload');
            const folderId = await ordnerId();
            const anhaenge = fotos.map(f => ({ name: f.name, url: f.url, path: f.path, type: 'image/jpeg' }));
            const dokument = {
                name: dateiName.replace(/\.pdf$/, ''),
                category: MIET_ORDNER,
                machine_id: maschine ? parseInt(maschine.id, 10) : null,
                url: upload.url,
                file_path: upload.path,
                size: pdfGroesse,
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

            // Erst jetzt ist alles in der Datenbank — der Entwurf darf weg.
            await entwurfLoeschen();

            const jetzt = new Date();
            messPunkt('Dokument');
            status(`Gespeichert: ${jetzt.toLocaleDateString('de-DE')}, ${jetzt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr — Dokumente → ${MIET_ORDNER}`
                + messText());
            window.showToast(`Mietvereinbarung gespeichert und unter „Dokumente → ${MIET_ORDNER}" abgelegt.`);
        } catch (e) {
            console.error('Mietvereinbarung speichern fehlgeschlagen:', e);
            // Wichtig: der Entwurf bleibt stehen — beim nächsten Öffnen
            // wird genau dieser Stand wieder angeboten.
            status('Speichern fehlgeschlagen — der Stand bleibt als Entwurf erhalten.');
            if (/rental_agreements|rental_agreement_id|attachments/.test((e && e.message) || '')) {
                window.showToast('Migration fehlt: supabase/supabase_add_rental_agreements.sql in Supabase ausführen.');
            } else {
                // Supabase liefert die eigentliche Ursache oft erst in
                // details/hint/code — ohne die tappt man im Dunkeln.
                const teile = [e && e.message, e && e.details, e && e.hint, e && e.code]
                    .filter(Boolean).join(' · ');
                window.showToast('Speichern fehlgeschlagen: ' + (teile || 'unbekannter Fehler'));
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
        // Wurde die erste Zeile der Schadenstabelle gefüllt (oder wieder
        // geleert), ändert sich die Seitenzahl — dann neu aufteilen.
        if (schadenHatInhalt() === schadenLeer) { zeichneInhalt(); return true; }
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
            <span class="miet-check${wert === 'io' ? ' on' : ''}" data-wert="io" onclick="window.mietPruef(${nr}, '${esc(spalteId)}', 'io', this)"><span class="miet-dot"></span>i.O.</span>
            <span class="miet-check miet-no${wert === 'nio' ? ' on' : ''}" data-wert="nio" onclick="window.mietPruef(${nr}, '${esc(spalteId)}', 'nio', this)"><span class="miet-dot"></span>n.i.O.</span>
        </td>`;
    }

    function jaNein(pfad, wert) {
        return `<span>
            <span class="miet-check${wert === 'ja' ? ' on' : ''}" data-wert="ja" onclick="window.mietJaNein('${pfad}', 'ja', this)"><span class="miet-dot"></span>Ja</span>
            <span class="miet-check miet-no${wert === 'nein' ? ' on' : ''}" data-wert="nein" onclick="window.mietJaNein('${pfad}', 'nein', this)"><span class="miet-dot"></span>Nein</span>
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
    // Steht in keiner Zeile etwas, ist die Tabelle leer und das Blatt
    // faellt beim Drucken und im PDF weg.
    function schadenHatInhalt() {
        return (daten.schaeden || []).some(s =>
            String(s.nr || '').trim() || String(s.position || '').trim() || String(s.beschreibung || '').trim());
    }

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
            <div class="miet-photo-slot${bild ? ' filled' : ''}" data-split
                 data-welche="${esc(welche)}" data-pos="${esc(pos)}"
                 onclick="window.mietFotoKlick('${esc(welche)}', '${esc(pos)}')">
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
            <div class="miet-photo-grid" data-splitbox data-drop-welche="${esc(welche)}">${kacheln}</div>
            ${fotoUnterschriften(welche)}
        </div>`;
    }

    // Direkt unter den Fotos wird der Zustand bestätigt: zwei Unterschriften
    // plus Datum — bei Übergabe und bei Rücknahme getrennt. Die Felder der
    // gerade NICHT gewählten Phase sind grau hinterlegt (.miet-dim am Block
    // oben), lassen sich aber weiter ausfüllen.
    function fotoUnterschriften(welche) {
        const u = welche === 'uebergabe';
        const f = vorlage.felder || {};
        const pfad = u ? 'unterschriften.u_datum' : 'unterschriften.r_datum';
        const wert = daten.unterschriften[u ? 'u_datum' : 'r_datum'] || '';
        return `
        <!-- data-ersteseite statt data-nurerste: beim Umbruch soll der Block
             nur auf dem ersten Teil stehen — aber im PDF und auf dem Papier
             MUSS er erscheinen. data-nurerste blendet dort alles aus (das ist
             für Bedienknöpfe gedacht), damit fehlten die Unterschriften. -->
        <div class="miet-foto-sign" data-ersteseite>
            <div class="miet-sign-row">
                ${feldUnterschrift(u ? 'u_vermieter' : 'r_vermieter', f.unterschrift_vermieter || 'Unterschrift Vermieter', pfad, wert)}
                ${feldUnterschrift(u ? 'u_mieter' : 'r_mieter', f.unterschrift_mieter || 'Unterschrift Mieter', pfad, wert)}
            </div>
        </div>`;
    }

    // Beide Unterschriften einer Phase teilen sich EIN Datum. Damit die
    // zweite Beschriftung sofort mitzieht, ohne dass der Bogen neu gezeichnet
    // wird (der Schreibcursor spränge sonst weg), werden die Felder hier
    // direkt abgeglichen.
    window.mietSignDatum = function (pfad, wert) {
        window.mietFeld(pfad, wert);
        document.querySelectorAll(`input[data-signdate="${pfad}"]`).forEach(el => {
            if (el.value !== wert) el.value = wert;
        });
    };

    // ---------- 6. Unterschriften ----------
    // datumPfad/datumWert optional: dann steht hinter der Beschriftung, mit
    // Komma abgetrennt, das Datumsfeld — wie auf dem gedruckten Bogen
    // („Unterschrift Vermieter, 28.08.2026").
    function feldUnterschrift(schluessel, beschriftung, datumPfad, datumWert) {
        const bild = daten.unterschriften[schluessel];
        return `
        <div>
            <div class="miet-sign-pad" onclick="window.mietPadOpen('${schluessel}', '${esc(beschriftung)}')">
                ${bild ? `<img src="${bild}" alt="">` : '<span class="miet-sign-hint">Hier unterschreiben</span>'}
            </div>
            <div class="miet-sign-caption">
                <span class="miet-sign-name">${esc(beschriftung)}${datumPfad ? ',' : ''}</span>
                ${datumPfad ? `<input type="date" class="miet-in miet-sign-date" data-signdate="${esc(datumPfad)}"
                       value="${esc(datumWert || '')}" onclick="event.stopPropagation();"
                       oninput="window.mietSignDatum('${datumPfad}', this.value)">` : ''}
                ${bild ? `<button type="button" onclick="event.stopPropagation(); window.mietSignLoeschen('${schluessel}')">löschen</button>` : ''}
            </div>
        </div>`;
    }

    // Die frühere eigene Bestätigungsseite (unterschriftBlock) ist entfallen:
    // unterschrieben wird jetzt direkt unter den Fotos, getrennt nach Übergabe
    // und Rücknahme (siehe fotoUnterschriften). Zwei Sätze Unterschriften
    // derselben Felder im Bogen wären eine Doppelung gewesen.

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
        else entwurfMerken();   // Tippen im Feld zeichnet nicht neu
    };

    /* Ja/Nein: genau wie die Pruefhaken nur zwei Klassen umschalten statt
       den ganzen Bogen neu aufzubauen. */
    window.mietJaNein = function (pfad, wert, el) {
        const teile = pfad.split('.');
        let ziel = daten;
        for (let i = 0; i < teile.length - 1; i++) ziel = ziel[teile[i]];
        const letzte = teile[teile.length - 1];
        const neu = ziel[letzte] === wert ? null : wert;
        ziel[letzte] = neu;
        const box = el && el.parentElement;
        if (!box) { zeichneInhalt(); return; }
        box.querySelectorAll('.miet-check').forEach(s => {
            s.classList.toggle('on', s.dataset.wert === neu);
        });
        entwurfMerken();
    };

    /* Ein Haken aendert nur zwei Klassen — der komplette Neuaufbau des
       Bogens (zeichneInhalt: Seitenumbruch messen, Vertragstext einpassen)
       ist dafuer viel zu teuer und machte das Abhaken traege. Deshalb wird
       hier nur die angetippte Zelle umgeschaltet; die Hoehe des Bogens
       aendert sich dabei nicht, der Umbruch bleibt also gueltig. */
    window.mietPruef = function (nr, spalte, wert, el) {
        if (!daten.pruefpunkte[nr]) daten.pruefpunkte[nr] = {};
        const neu = daten.pruefpunkte[nr][spalte] === wert ? null : wert;
        daten.pruefpunkte[nr][spalte] = neu;
        const zelle = el && el.parentElement;
        if (!zelle) { zeichneInhalt(); return; }
        zelle.querySelectorAll('.miet-check').forEach(s => {
            s.classList.toggle('on', s.dataset.wert === neu);
        });
        // Optionale Zeile: sobald irgendeine Spalte gesetzt ist, gilt die
        // Option als verbaut und wird gedruckt (.miet-opt-leer wirkt nur im
        // Druck/PDF, am Bildschirm aendert sich die Hoehe also nicht).
        const zeile = zelle.closest('tr');
        if (zeile && zeile.classList.contains('miet-opt')) {
            const eintrag = daten.pruefpunkte[nr] || {};
            zeile.classList.toggle('miet-opt-leer',
                !Object.keys(eintrag).some(k => eintrag[k]));
            // Eine angekreuzte Option kann den Tagessatz ändern — nur das
            // eine Feld nachziehen, der Bogen wird nicht neu aufgebaut.
            if (preisAktualisieren()) {
                const feld = document.querySelector('[data-feld="miete.tagessatz"]');
                if (feld) feld.textContent = daten.miete.tagessatz;
            }
        }
        entwurfMerken();
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
    // Fotos
    // ------------------------------------------------------
    // WICHTIG: Bilder werden beim Hinzufügen verkleinert.
    // Vorher landete die Datei in voller Auflösung als Daten-URL im
    // Arbeitsspeicher: ein 12-Megapixel-Foto sind rund 8 MB Text und
    // beim Anzeigen ~48 MB entpackt. Bei jedem Kreuz wird der Bogen neu
    // gezeichnet, also alle Bilder neu dekodiert — nach zwei, drei
    // Fotos war der Speicher voll und der Tab stürzte ab. Ausserdem
    // druckt Chrome so grosse Daten-URLs teilweise gar nicht erst.
    // 1600px Kantenlänge reicht für den A4-Ausdruck (rund 200 dpi).
    const FOTO_KANTE = 1600;
    const FOTO_QUALITAET = 0.82;

    function bildAusQuelle(quelle) {
        return new Promise((fertig, fehler) => {
            const img = new Image();
            img.onload = () => fertig(img);
            img.onerror = () => fehler(new Error('Bild konnte nicht gelesen werden.'));
            img.src = quelle;
        });
    }

    // Datei oder Daten-URL -> verkleinerte JPEG-Daten-URL
    async function bildVerkleinern(datei) {
        const quelle = typeof datei === 'string' ? datei : URL.createObjectURL(datei);
        try {
            const img = await bildAusQuelle(quelle);
            const gross = Math.max(img.naturalWidth, img.naturalHeight) || 1;
            const faktor = Math.min(1, FOTO_KANTE / gross);
            const c = document.createElement('canvas');
            c.width = Math.round(img.naturalWidth * faktor);
            c.height = Math.round(img.naturalHeight * faktor);
            const ctx = c.getContext('2d');
            ctx.drawImage(img, 0, 0, c.width, c.height);
            return c.toDataURL('image/jpeg', FOTO_QUALITAET);
        } finally {
            if (typeof datei !== 'string') URL.revokeObjectURL(quelle);
        }
    }

    // Eine Position aus einer Datei füllen.
    function dateiFuerPosition(welche, position) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        // Unsichtbar, aber nicht display:none — sonst verweigern manche
        // Browser den Dateidialog.
        input.style.cssText = 'position:fixed;left:-9999px;opacity:0';
        document.body.appendChild(input);

        input.onchange = async () => {
            const datei = input.files && input.files[0];
            input.remove();
            if (!datei) return;
            try {
                daten.fotos[welche][position] = await bildVerkleinern(datei);
                zeichneInhalt();
            } catch (e) {
                console.error('Bild konnte nicht übernommen werden:', e);
                window.showToast('Dieses Bild konnte nicht gelesen werden.');
            }
        };
        input.click();
    }

    window.mietFotoLoeschen = function (welche, position) {
        delete daten.fotos[welche][position];
        if (lbOffen) window.mietBildZu();
        zeichneInhalt();
    };

    // ------------------------------------------------------
    // Bilder hereinziehen (nur Rechner)
    // ------------------------------------------------------
    // Auf eine Kachel gezogen: genau dieses Feld. Auf die Fläche daneben
    // gezogen: die Bilder füllen die offenen Positionen der Reihe nach.
    // Die Zuhörer hängen an #miet-pages, nicht an den Kacheln — der Bogen
    // wird bei jeder Änderung komplett neu aufgebaut, einzeln gesetzte
    // Zuhörer wären danach weg.
    function dateienUebernehmen(welche, positionen, dateien) {
        const bilder = Array.from(dateien).filter(d => /^image\//.test(d.type));
        if (!bilder.length) { window.showToast('Nur Bilddateien können hier abgelegt werden.'); return; }
        (async () => {
            let i = 0;
            for (const datei of bilder) {
                if (i >= positionen.length) break;
                try {
                    daten.fotos[welche][positionen[i]] = await bildVerkleinern(datei);
                } catch (e) {
                    console.error('Bild konnte nicht übernommen werden:', e);
                    window.showToast('Ein Bild konnte nicht gelesen werden.');
                }
                i++;
                zeichneInhalt();
            }
            if (bilder.length > positionen.length) {
                window.showToast(`Es passten nur ${positionen.length} Bilder — die übrigen wurden nicht übernommen.`);
            }
        })();
    }

    function dropZiel(el) {
        if (!el || !el.closest) return null;
        const kachel = el.closest('.miet-photo-slot');
        if (kachel && kachel.dataset.welche) {
            return { el: kachel, welche: kachel.dataset.welche, positionen: [kachel.dataset.pos] };
        }
        const gitter = el.closest('[data-drop-welche]');
        if (gitter) {
            const welche = gitter.dataset.dropWelche;
            const offen = offenePositionen(welche);
            return { el: gitter, welche: welche, positionen: offen.length ? offen : fotoPositionen() };
        }
        return null;
    }

    function dropZuhoerer(pages) {
        let markiert = null;
        const markiere = (el) => {
            if (markiert === el) return;
            if (markiert) markiert.classList.remove('miet-drop-on');
            markiert = el;
            if (markiert) markiert.classList.add('miet-drop-on');
        };

        pages.addEventListener('dragover', (e) => {
            const ziel = dropZiel(e.target);
            if (!ziel) { markiere(null); return; }
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            markiere(ziel.el);
        });
        pages.addEventListener('dragleave', (e) => {
            if (e.target === markiert) markiere(null);
        });
        pages.addEventListener('drop', (e) => {
            const ziel = dropZiel(e.target);
            markiere(null);
            if (!ziel) return;
            e.preventDefault();
            const dateien = e.dataTransfer && e.dataTransfer.files;
            if (dateien && dateien.length) dateienUebernehmen(ziel.welche, ziel.positionen, dateien);
        });
    }

    // Mehrere Bilder auf einmal aus der Galerie: sie füllen die noch
    // offenen Positionen der Reihe nach auf.
    function galerieMehrfach(welche, positionen) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.multiple = true;
        // Unsichtbar, aber nicht display:none — sonst verweigern manche
        // Browser den Dateidialog.
        input.style.cssText = 'position:fixed;left:-9999px;opacity:0';
        document.body.appendChild(input);

        input.onchange = () => {
            const dateien = Array.from(input.files || []);
            input.remove();
            if (dateien.length) dateienUebernehmen(welche, positionen, dateien);
        };
        input.click();
    }

    // Vor jeder Aufnahme wird gefragt: geführter Rundgang mit der Kamera
    // oder Bilder aus der Galerie. Vorher entschied das Gerät allein
    // (Touch = Kamera), bereits vorhandene Bilder liessen sich damit auf
    // dem Handy gar nicht einsetzen.
    //
    // WICHTIG: Die Wahl wird als Rückruf **synchron** im Klick abgearbeitet.
    // Über ein Promise (await) ging der Dateidialog am Rechner nicht mehr
    // auf: `input.click()` verlangt eine frische Nutzeraktion, und die war
    // nach dem Umweg über das Promise verbraucht — es passierte schlicht
    // nichts. Deshalb hier kein async zwischen Klick und Dateidialog.
    function fotoQuelleFragen(titel, untertitel, beiWahl) {
        const box = document.createElement('div');
        box.className = 'miet-quelle';
        box.innerHTML = `
            <div class="miet-quelle-card">
                <h3>${esc(titel)}</h3>
                <p>${esc(untertitel || '')}</p>
                <button type="button" data-wahl="kamera" class="btn-primary">Rundgang mit Kamera</button>
                <button type="button" data-wahl="galerie" class="btn-secondary">Bilder aus Galerie</button>
                <button type="button" data-wahl="" class="miet-quelle-abbruch">Abbrechen</button>
            </div>`;
        // Die Knöpfe hören direkt zu. Ein stopPropagation auf der Karte
        // (wie sonst im Modul üblich) verschluckte sonst genau diese Klicks.
        box.querySelectorAll('button').forEach(b => {
            b.addEventListener('click', () => {
                const wahl = b.dataset.wahl;
                box.remove();
                if (wahl) beiWahl(wahl);
            });
        });
        // Klick auf den dunklen Rand schliesst.
        box.addEventListener('click', (e) => { if (e.target === box) box.remove(); });
        document.body.appendChild(box);
    }

    function fotosHolen(welche, positionen, titel) {
        if (!positionen || !positionen.length) return;
        fotoQuelleFragen(titel,
            positionen.length === 1 ? positionen[0] : `${positionen.length} offene Ansichten`,
            (wahl) => {
                if (wahl === 'kamera') kameraStarten(welche, positionen);
                else if (positionen.length === 1) dateiFuerPosition(welche, positionen[0]);
                else galerieMehrfach(welche, positionen);
            });
    }

    // Auf eine leere Kachel tippen fragt nach der Quelle und füllt dann
    // ab genau dieser Position, auf eine gefuellte oeffnet die Grossansicht.
    window.mietFotoKlick = function (welche, position) {
        if (daten.fotos[welche][position]) { window.mietBildAnsehen(welche, position); return; }
        fotosHolen(welche, offenePositionen(welche, position), 'Bilder hinzufügen');
    };

    // Nur dieses eine Bild neu aufnehmen bzw. austauschen.
    window.mietFotoEinzeln = function (welche, position) {
        fotosHolen(welche, [position], 'Bild ersetzen');
    };

    // Ganze Serie: alle noch fehlenden Positionen der Reihe nach.
    window.mietFotoserie = function (welche) {
        const offen = offenePositionen(welche);
        if (!offen.length) { window.showToast('Für diesen Satz sind bereits alle Bilder vorhanden.'); return; }
        fotosHolen(welche, offen, 'Rundgang starten');
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

        // Gleiche Obergrenze wie beim Einsetzen aus einer Datei — sonst
        // liegen wieder Riesenbilder im Speicher (siehe FOTO_KANTE).
        const faktor = Math.min(1, FOTO_KANTE / Math.max(video.videoWidth, video.videoHeight));
        const c = document.createElement('canvas');
        c.width = Math.round(video.videoWidth * faktor);
        c.height = Math.round(video.videoHeight * faktor);
        c.getContext('2d').drawImage(video, 0, 0, c.width, c.height);
        daten.fotos[camWelche][camListe[camIdx]] = c.toDataURL('image/jpeg', FOTO_QUALITAET);

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
            bildVerkleinern(datei).then(bild => {
                daten.fotos[camWelche][pos] = bild;
            }).catch(e => {
                console.error('Bild konnte nicht übernommen werden:', e);
                window.showToast('Dieses Bild konnte nicht gelesen werden.');
            }).then(() => {
                camIdx++;
                zeichneInhalt();
                dateiKette();
            });
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
