# meetra Webapp – Coding Guidelines

> **Für KI-Agenten:** `CLAUDE.md` wird automatisch geladen und enthält Layout, Datei-Karte und Arbeitsweise.
> Diese Datei hier nur bei Bedarf lesen — und dann gezielt den passenden Abschnitt (Design, PDF-Generator, DB-Schema, Besonderheiten).

---

## 1. Projektübersicht

**App:** meetra Webapp – interne Serviceverwaltung für Recycling-Maschinen  
**Betreiber:** meetra Recycling Maschinen / Loseke  
**Sprache:** Deutsch (alle UI-Texte, Labels, PDF-Ausgaben)

### Hauptdateien
| Datei | Zweck |
|---|---|
| `index.html` | Haupt-App – Topbar, Inline-Logik, PDF-Generator; Views/Modals kommen aus `partials/` |
| `partials/**` | Ausgelagertes HTML: `views/` (Ansichten), `settings/` (Einstellungsseiten), `modals/`, `components/sidebar.html` |
| `app.js` | Globale App-Logik, Auth, Navigation |
| `checklists.js` | UVV- und Wartungsplan-Rendering + Datenlogik |
| `machines-grouped.js` | Maschinenübersicht mit Gruppierung |
| `customers.js` | Kundenverwaltung (Sage-Import, Autocomplete) |
| `addressbook.js` / `addressbook.css` | Adressbuch: Visitenkarten aller Adressen, Suche/Filter, Detailmodal mit Ansprechpartnern, Maschinen, Verknüpfungen, Historie |
| `routenplanung.js` / `routenplanung.css` | Routenplanung: Karte (Leaflet), Stopps per Drag & Drop, Auto-Optimierung, Umkreissuche, Speichern/Laden, Export Google/Apple Maps |
| `accounting.js` | Buchhaltungsmodul |
| `documents.js` / `documents-r2.js` | Dokumentenverwaltung |

---

## 2. Technologie-Stack

- **Frontend:** Vanilla HTML, CSS, JavaScript (kein Framework)
- **Styling:** Vanilla CSS, Dark Mode, Glassmorphism-Design
- **Schriften:** Google Fonts – `Outfit`, `Inter`
- **Datenbank:** Supabase (PostgreSQL) – `window.supabaseClient`
- **PDF:** jsPDF + jsPDF-AutoTable (`window.jspdf`)
- **Icons:** Inline SVG (keine Icon-Library)
- **Farben:** CSS-Variablen (`--color-primary-green`, `--accent-color`, etc.)

---

## 3. Design-Prinzipien

### Pflicht bei JEDEM neuen UI-Element:
- ✅ **Mobile-First** – immer `@media (max-width: 768px)` Breakpoints ergänzen
- ✅ **Touch-freundlich** – Buttons/Inputs min. 44×44px Tap-Target
- ✅ **Flexbox/Grid** mit `flex-wrap` statt fester Pixel-Breiten
- ✅ **Relative Schriftgrößen** (`rem`) statt `px`
- ✅ **Keine horizontalen Scrollbars** auf Mobilgeräten

### Design-Stil:
- Dark Mode (dunkle Hintergründe, helle Texte)
- Glassmorphism-Karten: `background: rgba(255,255,255,0.05); backdrop-filter: blur(...)`
- Primärfarbe Grün: `var(--color-primary-green)` = `#10b981`
- Hover-Effekte und Micro-Animationen auf interaktiven Elementen
- Kein Plain-CSS – immer harmonische, kuratierte Farben

---

## 4. PDF-Generator (jsPDF)

- **Einstieg:** Funktion `generateServiceberichtPDFDoc()` in `index.html`
- **Hintergrundbild:** `bgImage` wird auf jede Seite gelegt
- **Unterschriften:** Base64 in `<input type="hidden">` gespeichert, via `doc.addImage()` eingebettet
  - Techniker: `#service-tech-signature`
  - Kunde: `#service-customer-signature`
- **Header zentrieren in AutoTable:** Immer `didParseCell` mit `data.cell.section === 'head'` nutzen – `columnStyles` allein reicht nicht!
- **Bottom-Margin:** Mindestens `45` setzen damit Inhalt nicht auf Kopfzeilen läuft
- **UVV vs. Wartung:** Unterschied über `checklist.type === 'uvv'` Flag

---

## 5. Datenbank-Struktur (Supabase)

### Wichtige Tabellen
| Tabelle | Inhalt |
|---|---|
| `machines` | Maschinen mit `customer_id`, `serial`, `manufacturer`, `name` |
| `customers` | Kunden mit `name`, `street`, `zip_code`, `city`, `customer_number` |
| `service_entries` | Serviceberichte mit `technicians[]`, `machine_id`, `date` |
| `checklist_templates` | UVV/Wartungs-Vorlagen mit `type` ('uvv' oder 'wartung') |
| `checklist_entries` | Ausgefüllte Checklisten |
| `users` | Techniker (`window.userList`) |
| `customer_contacts` | Ansprechpartner je Adresse (Adressbuch) |
| `customer_links` | Verknüpfungen zwischen Adressen: Liefer-/Rechnungsadresse, Konzern, Filiale |
| `customer_notes` | Historie/Notizen je Adresse (Adressbuch); Typ `visit` wird auch aus der Routenplanung geschrieben |
| `saved_routes` | Gespeicherte Touren der Routenplanung (optional – ohne die Tabelle wird auf localStorage ausgewichen) |

> **Achtung – gemischte ID-Typen:** `customers.id` ist **UUID**, `machines.id` und
> `service_entries.machine_id` sind **bigint**. Bei neuen Fremdschlüsseln, Filtern und
> Testdaten den jeweils richtigen Typ verwenden — ein UUID-String gegen eine bigint-Spalte
> liefert `invalid input syntax for type bigint`.

### Globale Variablen
- `window.machineList` – alle Maschinen
- `window.userList` – alle Benutzer/Techniker  
- `window.supabaseClient` – Supabase-Instanz
- `selectedTechs` – aktuell ausgewählte Techniker-IDs (Array)

---

## 6. Arbeitsweise für KI-Agenten

### Effizienz-Regeln:
- 🔍 Erst `Select-String` / `grep` nutzen um Zeilennummern zu finden – dann nur den genauen Bereich lesen
- ✂️ Mehrere Änderungen in **einem** `multi_replace_file_content`-Aufruf bündeln
- 🚫 Keine ganzen Dateien lesen wenn nur ein Abschnitt benötigt wird
- 🚫 Keine unnötigen Rückfragen bei klaren Aufgaben

### Bei neuen Features immer prüfen:
1. Mobile-Responsiveness (768px Breakpoint)
2. Touch-Targets groß genug?
3. Passt ins bestehende Dark-Mode Design?
4. PDF-Ausgabe betroffen? → `didParseCell` für Header-Ausrichtung

---

## 6b. HTML-Bausteine (partials/)

Ansichten, Einstellungsseiten und einige Modals werden in eigenen Dateien unter
`partials/` **gepflegt** und von `build.js` fest ins `index.html` **eingesetzt**.
Im `index.html` steht der Inhalt zwischen Markern:

```html
<!-- @partial:views/calendar.html -->
   ... eingesetzter Inhalt, nicht von Hand ändern ...
<!-- /@partial:views/calendar.html -->
```

**Arbeitsweise:**
1. Datei unter `partials/` bearbeiten (nicht den eingesetzten Block im `index.html`)
2. danach ausführen:

```bash
node build.js
```

Das Skript ist beliebig oft wiederholbar und ersetzt nur die Bereiche zwischen den Markern.

> **Kein Nachladen zur Laufzeit!** Die App wird auch per Doppelklick direkt aus dem
> Ordner geöffnet (`file://`). Dabei blockiert der Browser jedes Nachladen weiterer
> Dateien — ein `fetch`/XHR-Loader für die Bausteine funktioniert dort grundsätzlich
> nicht. Deshalb der Build-Schritt.

**Neuen Baustein anlegen:** Datei unter `partials/…` erstellen, im `index.html` an der
gewünschten Stelle das Marker-Paar einfügen (Anfang + Ende, leer), `node build.js` laufen lassen.

---

## 7. Bekannte Besonderheiten

- `index.html` ist sehr groß (15.000+ Zeilen) – immer gezielt mit Zeilennummern arbeiten
- UVV-Prüfpunkte: leere Bemerkung → `'keine Beanstandung'` (nicht `'/'`)
- Wartungsplan: leere Bemerkung → `'/'` bleibt so
- Google Maps Links: Pin-Icon (fill `#EA4335`) + Text „Google Maps" (kein Unterstreichen)
- Techniker-Unterschrift immer **links**, Kunden-Unterschrift immer **rechts**
- Maschinenübersicht sortiert nach: Hersteller → Typ → Seriennummer (aufsteigend)
