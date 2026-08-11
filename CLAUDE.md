# meetra Webapp — Kontext für Claude

> Zweck: Alles hier steht schon im Kontext. **Nicht neu erkunden.**
> Fachliche Regeln (Design, PDF, DB-Schema) stehen in `CODING_GUIDELINES.md` — nur bei Bedarf,
> und dann gezielt der passende Abschnitt.

## Stack
Vanilla HTML/CSS/JS, kein Framework, kein Bundler. Supabase (`window.supabaseClient`),
jsPDF, Leaflet, Inline-SVG-Icons. UI-Texte deutsch. Dark Mode / Glassmorphism.
Die App muss auch per Doppelklick über `file://` laufen — deshalb klassische
`<script src>`/`<link>` und **keine** ES-Module, kein Nachladen per fetch.

## Verzeichnis-Layout
- `index.html` — ~7.000 Zeilen, überwiegend Markup. Views/Modals kommen aus `partials/`.
- `js/` — 54 Module, ein Thema pro Datei
- `css/` — `base/`, `components/`, `views/`, plus `style.css` (bündelt per `@import`)
- `partials/` — `views/`, `settings/`, `modals/`, `components/sidebar.html`
- `assets/data/` — Base64-Blobs. **Nie lesen**, riesig.
- `lib/` — Vendor-Minified. **Nie lesen.**
- `sw.js` — Service Worker: `CACHE_NAME` + `PRECACHE`-Liste

## Ladereihenfolge (wichtig)
`index.html` lädt die Module in einer festgelegten Reihenfolge, die der früheren
Reihenfolge im Inline-Code entspricht. **Nicht umsortieren** — Module setzen
Variablen und Funktionen, auf die spätere Module aufbauen. Beispiel:
`service-picker.js` ersetzt `window.submitServicebericht` und hebt die
ursprüngliche Fassung vorher auf.

Reihenfolge der ausgelagerten Module:
`app-core` → `app-init` → `machine-modal` → `service-report-form` → `service-list` →
`history-modal` → `calendar-events` → `processes-ui` → `process-messages` →
`process-machine-select` → `customer-matching` → … → `service-picker` →
`worklog-tables` → `signature-pads` → `servicebericht-pdf`

## Wo liegt was
| Thema | Datei |
|---|---|
| Start/Einrichtung beim Laden (DOMContentLoaded) | `js/app-init.js` |
| Maschinen-Detailansicht | `js/machine-details-modal.js` |
| Einstellungen: UVV-/Wartungspläne | `js/settings-uvv-plans.js` |
| Offline-Erkennung, globale Fehler, Ungespeichert-Dialog | `js/app-core.js` |
| Maschine anlegen/bearbeiten (Fotos, Verknüpfungen, Zubehör) | `js/machine-modal.js` |
| Servicebericht-Formular | `js/service-report-form.js` |
| Serviceberichte-Liste, Filter | `js/service-list.js` |
| Historie einer Maschine | `js/history-modal.js` |
| Kalender, Termine, Wartungs-Mails | `js/calendar-events.js` |
| Vorgänge (Anlegen, Status, Arbeitsschritte) | `js/processes-ui.js` |
| PDF-Erzeugung Servicebericht (jsPDF) | `js/servicebericht-pdf.js` |
| Unterschriftenfelder | `js/signature-pads.js` |
| Bildbetrachter / Lightbox | `js/photo-lightbox.js` |
| Kunden-Zuordnung, Autocomplete | `js/customer-matching.js` |
| Dropdown-Positionierung in Modals | `js/dropdown-position.js` |
| Automatisches Nachladen langer Listen | `js/auto-nachladen.js` |
| Modal „Maschine anlegen/bearbeiten" (CSS) | `css/views/machine-modal.css` |

## Zuerst hier nachschlagen (spart das Durchsuchen)
- **`FUNKTIONEN.txt`** — Nachschlagewerk mit 1.500+ Funktionen: `name → datei:zeile`.
  Funktion gesucht? Diese Datei greppen und direkt an die Stelle springen,
  **nicht** die Codedateien durchsuchen.
- **`ARCHITEKTUR.md`** — welche Datei wofür da ist, wie groß sie ist.
- Beide werden von **`node tools/karte.js`** erzeugt. Nach größeren Umbauten neu
  laufen lassen, nie von Hand pflegen.

## Arbeitsweise in diesem Projekt
- **Suchen statt lesen.** Erst `FUNKTIONEN.txt`, dann gezielt `Read offset/limit`.
- **JS-Änderung:** Datei in `js/` → `node --check <datei>.js` → Cache-Bust:
  `?v=N` beim `<script src>` in `index.html` hochzählen **und** `CACHE_NAME` in `sw.js`.
  Ohne beides sieht der Nutzer die Änderung nicht.
- **Neue js/css-Datei angelegt?** Zusätzlich in die `PRECACHE`-Liste in `sw.js` eintragen,
  sonst fehlt sie offline.
- **HTML-Änderung:** immer im passenden `partials/`-Baustein → `node build.js`.
  Direkt in `index.html` editierte Partial-Bereiche werden beim nächsten Build überschrieben.
- **CSS:** in die passende Datei unter `css/views/` bzw. `css/components/` —
  nichts an `style.css` anhängen.
- Für wiederkehrende Muster gibt es `css/base/utilities.css`
  (`.form-label-caps`, `.row-clickable`, `.clickable`, `.text-muted-sm`) —
  diese Klassen nutzen statt die Stile erneut inline zu schreiben. Die Datei
  wird bewusst **zuletzt** geladen.
- Kein Git-Repo. Keine Tests, kein Linter außer `node --check`.
- Preview: `.claude/launch.json` → Konfiguration `static` (npx serve, Port 5187).

## Fallstricke, die schon Zeit gekostet haben
- **Doppelte CSS-Regeln.** Regeln für dasselbe Element existierten parallel in
  `index.html` und `css/views/settings.css`; Änderungen wirkten scheinbar nicht.
  Vor dem Ändern prüfen, ob es den Selektor mehrfach gibt.
- **Inline-`style="…!important"`** im Markup schlägt jede CSS-Datei. Dann das
  Inline-Attribut entfernen statt im CSS dagegen anzukämpfen.
- **`backdrop-filter` macht ein Element zum Bezugsrahmen für `position: fixed`.**
  Deshalb positioniert `js/dropdown-position.js` Menüs über einen gemessenen Versatz.
- **`*/` innerhalb eines CSS-Kommentars** beendet ihn vorzeitig — die nachfolgende
  Regel wird stillschweigend verschluckt.
- **Spaltennamen nicht aus dem Code raten.** `tasks` hat **kein** `due_date`
  (Aufgaben haben gar kein Fälligkeitsdatum), `internal_processes` hat **kein**
  `created_by` — der Ersteller steht dort in `user_id`. Bei Abfragen deshalb
  `select('*')` nehmen und im Browser filtern/sortieren, statt Spalten fest zu
  verdrahten; eine einzige fehlende Spalte lässt sonst die ganze Abfrage scheitern.
- **Der angemeldete Nutzer heißt `window.activeUser`** (gesetzt in `js/auth.js`),
  mit `.id`, `.name`, `.permissions`. **`window.currentUser` gibt es nicht** —
  Code, der es benutzt, bekommt stillschweigend `undefined`. An fünf Stellen war
  deshalb `user_id` beim Anlegen von Vorgängen und Ereignissen dauerhaft leer.
  Zuordnung „gehört mir" prüft in dieser App **ID *oder* Name** (siehe
  `js/tasks.js`), weil Einträge mal
  das eine, mal das andere enthalten.

## KI im Projekt
Alle KI-Funktionen laufen über **Groq** (`llama-3.3-70b-versatile`), Schlüssel in
`localStorage['groq_api_key']`, einzustellen unter Einstellungen → KI.

Beim Free Tier gilt: 30 Anfragen/Minute, **12.000 Token/Minute**, 100.000/Tag.
Deshalb die feste Regel: **niemals Datenbestände an die KI schicken** — nur den
Text, den der Nutzer gerade eingegeben hat, plus knappe Anweisungen.

KI gibt es nur noch an **einer** Stelle: der **KI-Schnellerfassung**
(`js/ai-quick-capture.js`) unter Aufgaben, Serviceberichten und Vorgängen.
Freitext geht rein, strukturierte Aufgaben (mit Unteraufgaben) und Vorgänge
kommen heraus — immer erst als Vorschau, gespeichert wird nach Klick.
Vorgänge an einer Adresse haben ihr eigenes Modul: `js/ai-address-task.js`
(Knopf „KI-Analyse" im Reiter Vorgänge der Adresse), es setzt `customer_id`.

**`openAiCaptureModal(bereich)`** grenzt ein: `'aufgaben'` (Knopf unter
Aufgaben), `'vorgaenge'` (Vorgänge-Ansicht und Kalender→Vorgänge), sonst
`'alles'`. Der Bereich baut den Prompt aus Bausteinen zusammen und wirft die
fremde Sorte auch aus der Antwort — das halbiert den Prompt (rund 2.900 statt
5.500 Zeichen) und die KI kann unter „Aufgaben" gar keinen Vorgang anlegen.
Neue Regeln deshalb immer in den passenden Baustein, nicht in den Kopf.

Ein Chat-Assistent unten rechts (`js/ki-assistent.js`, Strg+K) existierte bis
2026-08-05 und wurde **auf Wunsch komplett entfernt**; er brachte gegenüber der
Schnellerfassung nichts. Nicht wieder einführen.

## Was bewusst noch offen ist
`js/app-init.js` (3.249 Zeilen) ist ein einziger `DOMContentLoaded`-Handler.
Die zwei in sich geschlossenen Themen (UVV-Pläne, Maschinen-Detailansicht) sind
heraus. Der Rest ist **nicht gefahrlos zerschneidbar**: `map` (52 Verwendungen),
`fetchMachines`, `fetchCategories`, `currentEditingId` u.a. sind lokale Variablen
des Handlers und quer über den ganzen Block verflochten. Wer weiter zerlegen will,
muss diese Namen erst auf `window.*` heben — und danach die App durchklicken,
weil sich solche Fehler nicht statisch nachweisen lassen.

## Design-Tokens
`css/base/tokens.css` hält alle Skalen: Schriftgrößen (`--fs-*`), Abstände
(`--space-*`, 4px-Raster), Radien (`--radius-*`), Glas-Tiefe (`--blur-surface`
/`-raised`/`-overlay`), Schatten (`--shadow-1..3`), Bewegung, semantische Farben
(`--text-1..3`, `--success`, `--danger`, `--warning`, `--info`).
**In Views/Components keine Rohwerte mehr schreiben** — fehlt ein Wert, gehört er
in `tokens.css`, nicht als Ausnahme in die View. `variables.css` bleibt für
Palette/Verläufe; die Alt-Namen (`--color-text`, `--font-sans`) zeigen jetzt auf
die Tokens.

Schriften (Inter + Outfit, Variable Fonts) liegen lokal in `assets/fonts/` und
werden in `tokens.css` per `@font-face` gebunden — **nicht** mehr von Google.
Grund: per `file://` und offline war Google nicht erreichbar, alles fiel auf die
Systemschrift zurück. Neue Font-Datei ⇒ auch in `PRECACHE` in `sw.js`.

`css/base/brand-accents.css` ist eine **Vorschau-Ebene** für die Logo-Farben
(Rot `#be1e2d`, Grün `#10a068`, aus dem Logo gemessen). Rein additiv, aktuell nur
auf den Anmeldebildschirm angewandt. Rückgängig = `@import`-Zeile in `style.css`
löschen.

## Komponenten statt Inline-Styles
Wiederkehrende Bausteine haben **eine** Definition. Neues Element? Erst dort
nachsehen, nicht im Markup nachstylen — ein Inline-`style` ist nirgends
auffindbar und nicht wiederverwendbar, genau daraus sind die Wildwuchs-Werte
entstanden.

**Menüs** (`css/components/dropdowns.css`, oben dokumentiert): alles was
aufklappt — Filter, Auswahl, Benutzermenü, Autocomplete — nutzt dieselbe Basis.
Neues Menü: `<div class="menu-panel"><ul class="menu-list"><li>…` , bei
formfüllenden Feldern zusätzlich `.menu-block`. Ausgewählter Eintrag: `.selected`.

⚠️ **Inline-`style="… !important"` schlägt jede Stylesheet-Regel — auch eine mit
`!important`.** Genau das war bei den Menüs der Fall: die Regeln in
`dropdowns.css` waren für diese Elemente wirkungslos, Änderungen am CSS
„wirkten nicht". Wenn eine CSS-Änderung nicht greift: zuerst im Markup nach
einem Inline-`style` suchen.

## Aktueller Stand
`sw.js` CACHE_NAME: v117 (Stand 2026-08-10) — bei jeder Änderung hochzählen.

**Aufgaben und Vorgänge sind getrennt (seit 2026-08-10).** Die Ansicht „Aufgaben"
zeigt nur Aufgaben, die Ansicht „Vorgänge" nur Vorgänge. Beide haben denselben
Umschalter: alle / „Meine …" (`filterTasksByUser`, `filterProcessesByUser`).
Der frühere Vorgänge-Tab innerhalb der Aufgaben (`tasks-vorgaenge`,
`renderMyProcessesSection`) ist entfernt.
