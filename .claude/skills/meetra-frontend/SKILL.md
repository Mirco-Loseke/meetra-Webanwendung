---
name: meetra-frontend
description: Pflicht-Ablauf für JEDE Frontend-Änderung in der meetra Webapp — neue oder geänderte Views, Fenster/Modals, Menüs, Knöpfe, Listen, CSS, Markup in partials/, JS-Module unter js/. Auch bei „sieht auf dem Handy kaputt aus“, „Änderung wirkt nicht“, „neues Fenster/neue Ansicht/neuer Knopf“. Enthält Ablagestellen, Token-Regeln, Versionierung (?v=N, sw.js), Handy-Regeln und die bekannten CSS-Fallen dieses Projekts.
---

# meetra Frontend

Vanilla HTML/CSS/JS, kein Framework, kein Bundler, keine ES-Module (muss per `file://` laufen).
UI-Texte deutsch, Dark Mode + Glas. Projektwissen steht in `CLAUDE.md` — hier nur der Ablauf.

## 1. Vor dem Schreiben: finden statt erkunden
- Funktion gesucht → `FUNKTIONEN.txt` greppen (`name → datei:zeile`), dann `Read offset/limit`.
- Datei für ein Thema → Tabelle „Wo liegt was“ in `CLAUDE.md`, sonst `ARCHITEKTUR.md`.
- Nie lesen: `lib/`, `assets/data/`.
- Gibt es den Baustein schon? Menüs → `css/components/dropdowns.css` (`.menu-panel > .menu-list > li`, `.menu-block`, `.selected`).
  Hilfsklassen → `css/base/utilities.css` (`.form-label-caps`, `.row-clickable`, `.clickable`, `.text-muted-sm`).
  **Knöpfe → `css/components/knopf.css` (verbindlich, mit dem Nutzer abgestimmt):**
  `knopf knopf--primaer|sekundaer|bearbeiten(blau)|gefahr(rot)|text|ki`, optional `knopf--klein` / `knopf--icon`;
  Schließen `knopf-x`; Fensterkopf `.fenster-kopf`, Fensterfuß `.fenster-fuss` (Löschen links, Primär rechts).
  Ein Primär je Bereich, Symbol (SVG) links, normale Schreibweise, keine Inline-Stile außer Layout.
  Alte `.btn-*`-Klassen nicht neu verwenden; Regeln und Tabelle in `CLAUDE.md` → „Knöpfe".
  Neue Knopf-Art nötig? Erst mit dem Nutzer klären, dann in `knopf.css` + `tools/knopf-vorschau.html`.
  Kunden-Suche → `customerCacheSearch` (`js/lookup-cache.js`), Maschinenname → `getMachineName(id)` / `window.machineById`.

## 2. Wohin gehört was
| Änderung | Ort |
|---|---|
| Markup einer View/eines Fensters | `partials/views|modals|settings|components/…` → danach `node build.js` (ohne Node: `powershell -ExecutionPolicy Bypass -File tools/build.ps1`). **Nie** Partial-Bereiche direkt in `index.html` ändern. |
| CSS einer Ansicht | `css/views/<thema>.css` |
| Wiederverwendbarer Baustein | `css/components/<baustein>.css` |
| Skalen/Werte | `css/base/tokens.css` (nicht in der View) |
| Handy-Verkleinerung allgemein | `css/base/handy-kompakt.css` |
| Handy-Layout/Vollbild-Fenster | `css/base/responsive.css` |
| Logik | eigenes Modul `js/<thema>.js`, Funktionen die von außen gebraucht werden auf `window.*` |

Nichts an `style.css` anhängen. Ladereihenfolge in `index.html` nicht umsortieren; neues Modul hinten an passender Stelle einhängen.

## 3. CSS-Regeln
- **Nur Tokens**, keine Rohwerte:
  Schrift `--fs-2xs … --fs-4xl`, `--fw-*`, `--lh-*`, `--ls-*`, `--font-body`/`--font-heading`;
  Abstand `--space-1/2/3/4/5/6/8/10/12/16` (4-px-Raster); Radius `--radius-xs … -xl`, `-pill`, `-circle`;
  Glas `--blur-surface|raised|overlay`; Schatten `--shadow-1..3`; Bewegung `--ease-out|spring`, `--dur-fast|base|slow`;
  Farben `--text-1..3`, `--success(-soft)`, `--danger(-soft)`, `--warning`, `--info`, Grün `var(--color-primary-green)`.
  Fehlt ein Wert → in `tokens.css` ergänzen.
- **Keine Inline-Styles** im Markup, schon gar nicht `!important` inline (schlägt jedes Stylesheet).
- Selektor vorher projektweit suchen (Grep über `css/` **und** `index.html`/`partials/`) — doppelte Regeln sind die häufigste „wirkt nicht“-Ursache.
- Keine blanken Element-Selektoren gegen Klassen ausspielen; greift eine Regel nicht → im Browser `getComputedStyle` prüfen und Gegenregel suchen, nicht `!important` stapeln.
- Kein `*/` in CSS-Kommentaren.
- `backdrop-filter` macht Elemente zum Bezugsrahmen für `position: fixed` → schwebende Menüs/Leisten an `<body>` hängen oder `js/dropdown-position.js` nutzen.
- Rechtsklick-/Kontextmenüs und feste Leisten ebenfalls an `<body>`.
- Interaktive Elemente: Hover + kurze Animation mit `--dur-fast`.
- `<select>` wird von `js/select-enhance.js` umgebaut; Fremd-Widgets (z. B. Quill-Toolbar) brauchen `data-no-enhance`.
- Ausnahme Mail-Ansicht: bewusst kein Glas, kleine Radien.

## 4. Handy (≤ 768 px) — Pflicht bei jeder sichtbaren Änderung
- Eingabefelder ≥ 16 px (iOS-Zoom), Tippflächen ≥ 44 × 44 px.
- Feste Mehrspalten-Raster (`1fr 2fr`, `repeat(n,1fr)`, feste px) brechen nicht um → Handy-Regel auf eine Spalte in `responsive.css`.
- Seitenränder nicht erneut aufaddieren (zusammen 14 px je Seite).
- `env(safe-area-inset-*)` bei Vollbild-Fenstern und festen Leisten.
- Neues Fenster ohne `.modal-backdrop`/`.modal-new` → ID in beide Vollbild-Listen in `responsive.css` **und** in `fensterListe` in `js/handy-check.js`.
- Aufgaben-Ansicht = Fernseher-Tafel; Kinomodus/Spaltenwahl auf dem Handy ausgeblendet lassen.

## 5. JS-Regeln, die Frontend betreffen
- Angemeldeter Nutzer: `window.activeUser` (`.id`, `.name`, `.permissions`) — **nie** `window.currentUser`. „Gehört mir“ = ID **oder** Name.
- Unklare Spalten: `select('*')` und im Browser filtern; keine Spaltennamen raten.
- Timer mit Abfrage: `window.istHauptTab()` bzw. `document.hidden` prüfen; nie `select('*')` ohne Serverfilter in Schleife/Timer; auf Realtime nur die geänderte Zeile nachladen.
- Abhängige Zeilen ersetzen: `window.zeilenSicherErsetzen(...)`, nie erst löschen.
- Meldungen nur über `meldungsTakt.einreihen(...)`.
- KI-Aufrufe nur über `kiPseudonym.fetchMaskiert(payload)`.
- Listen: höchstens ~60 Einträge zeichnen, ein `innerHTML` + Klick-Delegation, keine `machineList.find` in Schleifen.
- Benutzertexte vor `innerHTML` escapen.

## 5b. Schwebende Elemente (Vorschlagslisten, Dropdowns, Popover) — PFLICHT, Wunsch des Nutzers
Der Nutzer will so etwas **nie selbst zuerst prüfen müssen**. Deshalb bei jedem Element, das über dem Inhalt schwebt:
1. **Nicht auf `.menu-panel`/`.menu-list` verlassen** — dafür gibt es kein eigenes CSS (das Aussehen kommt nur über die Selektorliste in `css/components/dropdown-look.css`). Eigenes Panel ⇒ **explizit** stylen: `background: #0f172a`, Rahmen `rgba(255,255,255,.18)`, `--radius-lg`, Schatten `0 20px 60px rgba(0,0,0,.6)`, Einträge weiß, Hover/`.selected` grün. Vorbild: `.mt-panel` in `css/views/filter.css`.
2. **z-index über jedem Fenster** (Fenster liegen bis ~20000, Login 1.000.000): `2147483000`. `position: fixed`, aus `getBoundingClientRect()` des Feldes berechnet, an `<body>` hängen (backdrop-filter-Falle).
3. **Selbst ansehen, bevor „fertig“ gemeldet wird:** `preview_start static`, Seite laden, Panel mit Testdaten öffnen (Login-Overlay `#supabase-login-screen` liegt darüber ⇒ Testelement vorn einfügen, `document.body.prepend`, hohes z-index; **Vorsicht: gleiche ID im Markup doppelt ⇒ `getElementById` greift die versteckte**) und **Screenshot** machen: Hintergrund sichtbar? Text lesbar? Position unter dem Feld? Nicht verdeckt? Bei nicht sichtbarem Pane `tabs_select` auf den Tab.
4. Native `<datalist>` nie verwenden (im Dark Mode unlesbar/abgeschnitten).

## 6. Abschluss — jedes Mal
1. `node --check <datei>.js` für jede geänderte JS-Datei.
2. Markup geändert → `node build.js`.
3. Neue js/css-Datei → in `PRECACHE` in `sw.js` eintragen (per `@import` geladene CSS: `?v=N` an der `@import`-Zeile in `style.css`).
4. `node tools/version.js` — zählt `?v=N`, `CACHE_NAME` und den Stand in `CLAUDE.md`. Nie von Hand, keine PowerShell-Ersetzung mit `"$f?v="`.
5. Selbst prüfen in der Vorschau (`.claude/launch.json` → `static`, Port 5187): Konsole fehlerfrei, Ansicht bei Desktop **und** 375 px, bei größeren Änderungen `handyCheck()` bzw. `index.html?handycheck`.
6. Neue Datei/neues Thema → Zeile in „Wo liegt was“ in `CLAUDE.md`; nach größerem Umbau `node tools/karte.js`.
