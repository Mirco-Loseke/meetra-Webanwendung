# UI/UX-Audit meetra Webapp — 16.10.2026

**Geprüft:** lokal (`localhost:5187`), angemeldet als Mirco Loseke (56 Rechte), echte Daten.
**Desktop:** 1440 × 900 · **Mobil:** 375 × 812 (Android-Emulation, Touch).
**Methode:** jede Hauptansicht geöffnet und vermessen (Skript über alle sichtbaren Elemente),
10 Kernfenster je 3× geöffnet/geschlossen (X, Esc, Klick daneben), Zustands-Rücksetzung mit
Testeingabe geprüft, eingebauter `handyCheck()` (68 Ansichten/Fenster) plus eigene
Tippflächen-Messung. **Nichts gespeichert, nichts gelöscht**, Testeingaben wieder entfernt.

**Nicht abgedeckt:** Mail (Outlook nicht verbunden), Foto-Eingang (leer), Speichern-/Fehlerpfade
(hätten echte Daten verändert), Hover-Zustände nur stichprobenartig.

## Stand der Umsetzung (17.10.2026)
**Erledigt:**
- BUG-01 bis BUG-04, UX-01, UX-02, UI-01.
- UI-02/UI-03 (Knopf-System, `knopf.css`), UI-04 (ein Schließen-X).
- UI-06 (Knöpfe ≥ 44 px auf dem Handy über die Angleichung).
- Karten-Löschen leise (Teil von UX-08).
- UX-10 teilweise: Glocke weg, „Meine Liste“ oben.
- Dazu: Druckliste kompakt, Pop-ups nach Art.

**Offen:**
- UX-03 bis UX-07, UX-09, UX-11 bis UX-16.
- UI-05, UI-07, UI-08.
- Rest von UX-08 und UX-10.
- Zusatzpunkte aus dem Gespräch:
  - Maschinen-Detail als Zentrale
  - Ablage-Zone in der leeren Adress-Ablage
  - doppelte Stammdaten
  - Chips in der Adress-Übersicht direkt bearbeitbar
  - Reiter „Mails“ ohne Zähler
  - zweite Glocke in Listen
  - 22-px-Knopf in „Vorgang: Schritte“

---

## 1. Globale Inkonsistenzen (Design-System)

### 1.1 Buttons

| Befund | Messwert |
|---|---|
| Knöpfe gesamt im DOM | 2.149, davon **1.256 mit Inline-`style`** |
| `.btn-primary` | **23 verschiedene** Kombinationen aus Innenabstand/Radius/Schrift |
| `.btn-secondary` | **24 verschiedene** Kombinationen |
| Schriftart | `.btn-primary` & fast alle klassenlosen Knöpfe = **Arial**, `.btn-secondary` = **Inter**. Ursache: es gibt keine Regel `button { font: inherit }` — Knöpfe fallen auf die Browser-Vorgabe (13,33 px Arial) zurück. Bei den Serviceberichten erscheint sogar **Georgia** (Info-„i"). |
| Radius | Primär 28 px (Pille), Sekundär 14 px, `btn-modal-base` 10 px, Mail 4 px, Anmeldung 12 px |
| Farbe „Speichern" | Vorgang/Maschine/Dokument/Buchhaltung = **grün**, Servicebericht/Aufgabe = **blau**, KI = lila, „PDF erstellen" = rot |
| Beschriftung | „VORGANG SPEICHERN" / „EREIGNIS SPEICHERN" (Versalien) vs. „Speichern" / „Maschine anlegen" |
| Drei parallele Fenster-Knopfsysteme | `.btn-primary/.btn-secondary`, `.btn-modal-base` (+`-save/-cancel`), `.rp2-btn`, dazu `maint-action-btn`, `btn-reports`, `btn-history` … |
| Icon-Position | überwiegend links vom Text (✓), aber Emoji-Icons (📎, ✨, ➕, 🚗) und SVG-Icons gemischt |

**Empfohlene 4 Varianten** (eine Klasse, Größen per Modifier):

1. **Primär** – volle Farbe (eine Markenfarbe, z. B. Grün), Inter 14/600, Radius `--radius-md`, Höhe 40 (Handy 44).
2. **Sekundär** – Glas-Fläche + Rahmen, sonst identisch.
3. **Destruktiv** – rot umrandet, füllt sich erst beim Hover; nie direkt neben Primär.
4. **Icon-Knopf** – quadratisch 36 (Handy 44), immer mit `aria-label`/`title`.
   Plus Modifier `--sm` (32) für Chips/Filter.

### 1.2 Fenster & Schließen-X

| Fenster | X-Klasse | Optik | Größe | Abstand oben/rechts |
|---|---|---|---|---|
| Vorgang anlegen / Mail-Import / Ereignis | `.btn-close` | graues SVG, ohne Fläche | 40 | 32–44 / 41–48 |
| Servicebericht / Aufgabe / Dokument / KI | `.btn-close-modal` | **rotes Quadrat ×** | 40 | 9–44 / 29–41 |
| Maschine anlegen | `.btn-close-modal` | rundes × | 36 | 19 / 21 |
| Maschinen-Detail | `.procurement-close-btn` | rund, SVG | 36 | — |
| Buchhaltung | `.modal-close-btn` | rund rot | **32** | 17 / 17 |
| Adress-Detail | eigenes | rund, Rahmen | ~36 | — |
| To-do / Benutzer / Rechnungen / Glocke | `todo-x`, `ue-x`, `rechnungen-close`, `notif-close` | je eigenes | 30–38 | — |

→ **16 Varianten**, keine erreicht mobil 44 × 44 px.

**Schließ-Verhalten (Desktop & Handy gleich):**

| Fenster | X | Esc | Klick daneben | Warnung bei ungespeicherten Änderungen |
|---|---|---|---|---|
| Vorgang anlegen | ✓ | ✗ | ✗ | ✓ |
| Aufgabe anlegen | ✓ | ✗ | ✗ | ✓ |
| **Maschine anlegen** | ✓ | ✗ | ✗ | **✗ – schließt ohne Rückfrage** (`closeAddMachineModal`, `app-init.js:2986`) |
| Servicebericht, Ereignis, Dokument, Buchhaltung, Mail-Import, KI, Berichtsart | ✓ | ✗ | ✗ | — |
| Maschinen-Detail | ✓ | ✗ | ✗ | — |
| **Adress-Detail** | ✓ | **✓** | — | — |
| Suche, KI-Chat, To-do, Benutzer | ✓ | ✓ | — | — |

Esc schließt also nur in den neueren Fenstern. Das Verbot „Klick daneben schließt nicht"
ist bei Formularen sinnvoll, sollte aber dann **überall** gelten und Esc trotzdem gehen
(mit derselben Ungespeichert-Abfrage).

**Bestätigungen:** 71× natives `confirm()` und 10× `prompt()` (Browser-Grau mitten im
dunklen Glas-Design, mobil kaum zu unterscheiden), daneben ein eigener
„Ungespeicherte Änderungen"-Dialog. Es gibt keinen gemeinsamen App-Dialog.

### 1.3 Datei-Uploads

17 feste + 19 per JS erzeugte Upload-Felder. Uneinheitlich in jedem Punkt:

| Ort | Muster | Drag & Drop | Fortschritt | Größe/Limit sichtbar | Löschen vor Speichern |
|---|---|---|---|---|---|
| Vorgang (Anhänge) | kleiner Pillen-Knopf „📎 Dokument hinzufügen" | ✓ (nur .msg-Zone) | ✓ | ✓ (`MAX_MB`) | ✓ |
| Vorgang (.msg) | große gestrichelte Zone oben im Fenster | ✓ | – | – | – |
| Dokumente | gestrichelte Zone „Klicken oder Datei hierher ziehen" | ✓ | – | – | ? |
| Buchhaltung | gestrichelte Zone oben + Texterkennung | ✓ | – | Text „max. ~4 MB" | – |
| Servicebericht | Zone im Akkordeon 5 | ✓ | **–** | **–** | ✓ |
| Maschine anlegen | großes Foto-Feld (`accept="*"`, nimmt also auch PDFs an) | – | **–** | – | ✓ |
| Adresse → Ablage | Knopf „+ Hochladen", leere Liste **ohne** Zone | (✓ im Code) | – | – | – |
| Werkstatt-Fotos | Zone | ✓ | – | – | – |
| KI-Chat | Büroklammer | ✓ | – | ✓ | ✓ |
| Mietvereinbarung | Kamera-Kacheln | ✓ | ✓ | ✓ | ✓ |
| Import (Adressen/Angebote/Etiketten) | Zone bzw. nur Knopf | teils | ✓ | – | – |

Kein Upload-Feld setzt `capture` (Handy-Kamera direkt). Fortschritt gibt es nur bei
Vorgangs-Anhängen, Mietvereinbarung und Import.

**Ideale Komponente (`uploadFeld(ziel, optionen)`):** eine gestrichelte Zone
(„Hierher ziehen oder **auswählen**" + auf dem Handy zweiter Knopf „📷 Foto"),
erlaubte Typen und Max-Größe als Hilfetext, Dateiliste mit Symbol/Vorschau,
Name, Größe, Fortschrittsbalken je Datei, ✕ zum Entfernen, Fehlerzeile je Datei.
Kompakt-Variante (nur Knopf + Liste) für enge Stellen — aber dieselbe Liste.

### 1.4 Formularelemente

- **Zwei Feldsysteme parallel:** `.glass-input` (132×, Radius 20, **12 Varianten**) und
  `.glass-form-input` (53×, Radius 14, 3 Varianten), dazu 34 Felder ohne Klasse (9 Varianten).
  Auswahlfelder als Pille (Radius 999) neben eckigen Textfeldern.
- **Checkboxen:** 7 verschiedene Größen (15–20 px), 15 unsichtbar (0 × 0, eigene Schalter).
- **Fehlermeldungen:** kein einziges `aria-invalid`, keine Fehlerklasse am Feld —
  Validierung läuft ausschließlich über Toasts (649 Aufrufe). Der Nutzer sieht nicht,
  **welches** Feld fehlt.
- **Feldbeschriftungen:** VERSALIEN (Vorgang, Bericht) vs. normal (Aufgabe, Buchhaltung)
  vs. nummeriert grün („1. Maschine wählen", Aufgabe).
- **Doppelte Auswahlfelder (Fehler):** im Fenster *Buchhaltung → Neuer Eintrag* stehen
  „Typ" und „MwSt.-Satz" **zweimal untereinander** — das `<select>` wird von zwei
  Verschönerern gleichzeitig ersetzt (`.glass-select` und `.glass-form-input`).
  Desktop und Handy betroffen.

---

## 2. Seiten-für-Seiten-Befunde

### Startseite (`#home`, Cockpit)
- **Gut:** klare Zweiteilung „Jetzt zuerst" / „Demnächst 7 Tage", Favoriten-Leiste, Suche mit Strg+K.
- **Unlogisch:** vier konkurrierende Zähler — Glocke 29, To-do 9, „12 Dinge brauchen dich", Vorgänge 12. Welcher zählt?
- **Mobil vs. Desktop:** mobil sauber; To-do-Knopf überdeckt die Pfeile der unteren Listenzeilen. Die Social-Media-Icons (Instagram, Facebook, YouTube, LinkedIn) belegen am Desktop die halbe Kopfleiste.

### Aufgaben (`#tasks`)
- **Gut:** Fernseher-Bedienelemente mobil ausgeblendet (wie gewollt), Werkstatt-Spalte rechts.
- **Unlogisch:** „Wieder öffnen" ist ein **18 × 18 px** Symbol, „Als erledigt markieren" 24 × 24.
- **Mobil:** 32,6 Bildschirmhöhen lang, 115 Tippflächen < 44 px, „Eingang/Abnahme"-Knöpfe 24 px hoch.

### Vorgänge (`#processes`)
- **Gut:** Kennzahlen-Kacheln, Erinnerungen nach „überfällig/heute" gruppiert, Sortierung erklärt („Neueste zuerst").
- **Unlogisch:** 57 Knöpfe ohne Text/Titel/aria-label; Erinnerungs-Karten schneiden Titel stark ab („Interne Aufgabe…") — 5 Spalten auf 1440 px sind zu eng. Die Wecker-Karte oben rechts liegt **über** „Meine Vorgänge / KI-Erfassung / Vorgang erstellen".
- **Fenster *Vorgang anlegen*:** **Adresse steht ganz unten**, beim *Bearbeiten* ganz oben — gleiche Maske, andere Reihenfolge. Die .msg-Zone belegt den besten Platz, obwohl selten gebraucht. Speichern-Leiste nicht angeheftet (Desktop: erst nach Scrollen sichtbar).
- **Mobil:** Suchfeld nur ~110 px breit (Platzhalter „Suchen: Ad…"); die Lasche „Rechnungen" und der To-do-Knopf liegen über den Karten. **Fenster öffnet 116 px nach unten gescrollt — Titel und X sind beim Öffnen nicht sichtbar** (jedes Mal reproduzierbar).

### Adressbuch (`#addressbook`) + Detail
- **Gut:** Reiter mit Zählern, Kopieren-Symbole, `tel:`/`mailto:`-Links, leere Zustände mit Erklärtext („Keine verknüpften Adressen …"). Esc schließt.
- **Unlogisch:** „Löschen" (rot) steht in der Kopfzeile gleichrangig neben „Bearbeiten"/„Zusammenführen". Reiter „Mails" ohne Zähler. Adresstyp-/Hersteller-Chips in der *Übersicht* sind direkt anklickbar — Bearbeiten im Ansichtsmodus ohne Rückmeldung. Hinweis „1 von 66 Maschinen ohne Adresszuordnung" sprachlich unklar. Reiter *Ablage* leer = nur Text, keine Ablege-Zone.
- **Mobil:** 5 Aktionsknöpfe auf 3 Zeilen, Löschen direkt neben Zusammenführen; Reiterleiste 1.182 px breit, sichtbar 359 px — 7 von 10 Reitern ohne Hinweis versteckt.

### Maschinen (`#machines`) + Detail
- **Gut:** Gruppierung nach Kategorie mit Zähler, Wartungs-Box auf der Karte.
- **Unlogisch:** Detailansicht zeigt fehlende Werte als **„/"** („Baujahr: /", „Motortyp: / | Motornummer: /", Servicebericht-Box nur „/"). Detail ist reine Anzeige — Bericht/Protokoll/Dokument/Miete gehen nur über die Karte. Kopfknöpfe in VERSALIEN, Adress-Detail nicht.
- **Mobil:** eine Karte ≈ ein Bildschirm → **46,5 Bildschirmhöhen** für 66 Maschinen, keine kompakte Liste.

### Serviceberichte (`#service`)
- **Gut:** Kategorie-Badge, Auftragsnummer direkt editierbar, KI-Analyse.
- **Unlogisch:** Kartenraster mit Großbild — 3 Berichte pro Zeile am Desktop, Platzhalterbild nimmt halbe Karte; kein Listen-/Tabellenmodus. Roter Papierkorb direkt neben „Bearbeiten" auf **jeder** Karte. Info-„i" 22 × 22 px in Georgia. Reiter „Protokolle" kontrastarm.
- **Fenster:** Fußleiste mit 6 Knöpfen in 5 Farben; mobil 3 Zeilen hoch (gut: angeheftet).

### Protokolle / Wartung (`#protocols`, `#calendar`)
- **Gut:** Board übersichtlich.
- **Mobil:** Wartungs-Aktionen („Erledigt", „Historie", „Termin pflegen", „Email versenden") 29 px hoch, 126 von 127 Tippflächen < 44 px.

### Listen (`#listen`)
- **Gut:** starke Kennzahlen, „Nachfassen rot/orange" sehr nützlich, Excel-Export.
- **Fehler:** schwebende Tabellen-Pfeile (`#angebote-scroll-pfeile`) liegen **genau über To-do- und KI-Knopf** (alle z-index 9000). Zweite Glocke (35) in der Ansicht zusätzlich zur Kopfleisten-Glocke (29).
- **Unlogisch:** Tabelle 2.324 px breit, Kopfzeile nicht angeheftet, Firmennamen umbrechen dreizeilig.
- **Mobil:** **Beträge brechen mitten in der Zahl um** („11.6 / 34.8 / 09 €", „509.0 / 20 €"). 220 Tippflächen < 32 px, Download-Symbol 13 × 13 px.

### Buchhaltung (`#accounting`)
- **Gut:** Monatsgruppen mit Summe, Skonto-Hinweis je Zeile.
- **Fehler:** Fenster *Neuer Eintrag* mit doppelten Auswahlfeldern (s. 1.4); Felder unterschiedlich breit, „Konto abgebucht" bricht rot um.
- **Mobil:** Tabelle 9 Spalten / 1.198 px — sichtbar nur Belegt-Schalter, Nr., Datum; **Lieferant und Betrag liegen außerhalb**. Bearbeiten/Löschen 30 × 30.

### Dokumente (`#documents`)
- **Gut:** Ordnerkacheln, Filter, Gesamtgröße.
- **Unlogisch:** weiße Clipart-Cover kontrastieren hart zum dunklen Thema; 10 Knöpfe ohne Beschriftung.

### Timeline, Routenplanung, Einstellungen
- **Timeline:** gut; mobil Pfeile 30 px breit, Balkentitel 22 px (handyCheck: „zu groß").
- **Routenplanung:** mobil alle Werkzeugknöpfe 30 px hoch, ✕ 28 × 28.
- **Einstellungen:** **vorbildlich** — Gruppen, Suche, einheitliche Kacheln mit Untertitel. Dieses Muster sollte Vorlage für andere Übersichten sein.

### Handy-Check (eingebaut, 68 Prüfpunkte)
Kein Überstand, keine Überlappung, keine zu kleine Schrift — nur Timeline-Balkentitel „zu groß".
Der Check misst **keine Tippflächen**; die Werte oben stammen aus der Zusatzmessung.

---

## 3. Action-Items zur Entscheidung

| ID | Bereich | Aktueller Zustand | Empfohlene Optimierung | Prio |
|---|---|---|---|---|
| **BUG-01** | Buchhaltung → Neuer Eintrag | „Typ" und „MwSt." doppelt sichtbar | doppelte Verschönerung abstellen (`data-no-enhance` am alten oder Entfernen der zweiten) | **Hoch** |
| **BUG-02** | Listen | Tabellen-Pfeile liegen über To-do-/KI-Knopf | Pfeile nach links bzw. über die Knöpfe setzen, oder FABs in der Ansicht verschieben | **Hoch** |
| **BUG-03** | Vorgang anlegen (Handy) | öffnet 116 px gescrollt, X + Titel unsichtbar | Scroll beim Öffnen auf 0 setzen / Autofokus ohne `scrollIntoView` | **Hoch** |
| **BUG-04** | Listen (Handy) | Beträge brechen mitten in der Zahl | `white-space: nowrap` + kleinere Schrift/zweispaltig | **Hoch** |
| **UX-01** | Maschine anlegen | kein Ungespeichert-Schutz | denselben Dialog wie Vorgang/Aufgabe | **Hoch** |
| **UX-02** | Buchhaltung (Handy) | Lieferant/Betrag nicht sichtbar | Karten-Layout ≤ 768 px (Lieferant, Betrag, Datum, Status) | **Hoch** |
| **UI-01** | Alle Knöpfe | Arial statt Inter | `button, input, select, textarea { font: inherit }` in Basis-CSS | **Hoch** (1 Zeile) |
| **UI-02** | Knopf-System | 23/24 Varianten, 3 Systeme, 1.256 Inline-Styles | 4 Varianten + `--sm` (s. 1.1), schrittweise ersetzen | Mittel |
| **UI-03** | Speichern-Farbe/Text | grün/blau, VERSALIEN/normal | eine Primärfarbe, „Speichern" in normaler Schreibweise | Mittel |
| **UI-04** | Schließen-X | 16 Varianten, 30–40 px, Position 9–48 px | eine Komponente: oben rechts 16 px Abstand, 40 px (Handy 44), neutral grau, Hover rot | Mittel |
| **UX-03** | Esc / Klick daneben | nur neuere Fenster reagieren auf Esc | Esc überall (mit Ungespeichert-Abfrage); Klick daneben bei Formularen bewusst aus | Mittel |
| **UX-04** | Bestätigungen | 71× `confirm()`, 10× `prompt()` | App-Dialog `appFrage()` im Glas-Design, Löschen rot | Mittel |
| **UX-05** | Fehler in Formularen | nur Toast, Feld nicht markiert | Pflichtfeld rot umranden + Text darunter, Fokus aufs Feld | Mittel |
| **UI-05** | Upload | 10+ Muster, Fortschritt/Limit selten | eine `uploadFeld`-Komponente (s. 1.3), Start bei Servicebericht + Maschine | Mittel |
| **UX-06** | Maschine anlegen Foto | `accept="*"` | `accept="image/*"` + Kamera-Knopf (`capture`) auf dem Handy | Niedrig |
| **UX-07** | Vorgang anlegen | Adresse unten, beim Bearbeiten oben; .msg-Zone oben | Reihenfolge angleichen (Adresse oben), .msg-Zone einklappbar/ans Ende | Mittel |
| **UX-08** | Destruktive Knöpfe | Papierkorb neben Bearbeiten (Berichte, Buchhaltung), Löschen in Adress-Kopf | Löschen ins „⋯"-Menü bzw. ans Ende der Bearbeiten-Maske | Mittel |
| **UX-09** | Maschinen-Detail | fehlende Werte als „/" | leere Werte ausblenden oder „—" grau | Niedrig |
| **UX-10** | Zähler | Glocke 29, To-do 9, „12 Dinge", Vorgänge 12, Listen-Glocke 35 | Zähler-Bedeutung festlegen, Listen-Glocke entfernen oder erklären | Niedrig |
| **UX-11** | Adress-Detail Handy | 7 von 10 Reitern unsichtbar | Verlauf/Pfeil am Rand oder Reiter als Auswahl-Menü | Mittel |
| **UX-12** | Lange Handy-Listen | Maschinen 46, Listen 34, Aufgaben 33, Vorgänge 26 Bildschirme | kompakte Zeilenansicht (Umschalter Karte/Liste) | Mittel |
| **UI-06** | Tippflächen Handy | durchgehend 22–30 px | Mindesthöhe 44 px in `handy-kompakt.css` für `.btn-*`, Icon-Knöpfe, X; `handyCheck` um Tippflächen-Messung erweitern | Mittel |
| **UI-07** | Felder | `.glass-input` (r20) und `.glass-form-input` (r14) parallel, Auswahl als Pille | ein Feldstil, ein Radius | Niedrig |
| **UI-08** | Barrierefreiheit | Vorgänge 57, Buchhaltung 59, Berichte 33 Knöpfe ohne Beschriftung | `aria-label` an Icon-Knöpfe | Niedrig |
| **UX-13** | Serviceberichte Desktop | 3 Karten/Zeile mit Großbild | Listenmodus oder kleinere Bilder | Niedrig |
| **UX-14** | Kopfleiste | 4 Social-Media-Icons | in Fußzeile/Einstellungen verschieben | Niedrig |
| **UX-15** | Listen Desktop | Tabellenkopf scrollt weg | `position: sticky` am `thead` | Niedrig |
| **UX-16** | Erinnerungen Vorgänge | 5 Spalten, Titel abgeschnitten | 3–4 Spalten bzw. zweizeiliger Titel | Niedrig |
