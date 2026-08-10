# Projektkarte

> Erzeugt von `node tools/karte.js` — nicht von Hand pflegen.
> Funktion gesucht? `FUNKTIONEN.txt` durchsuchen, dort steht Datei und Zeile.

## JavaScript-Module

48k Zeilen in 55 Dateien.

| Datei | Zeilen | Funktionen | Zweck |
|---|--:|--:|---|
| `js/addressbook.js` | 3988 | 116 | ADRESSBUCH MODULE |
| `js/accounting.js` | 3343 | 82 | accounting.js - Logic for the Accounting Module |
| `js/app-init.js` | 3249 | 82 | App-Start: alles, was beim Laden der Seite eingerichtet wird (DOMContentLoaded) |
| `js/protocols.js` | 2825 | 62 | PROTOCOLS MODULE |
| `js/listen.js` | 2499 | 74 | LISTEN MODULE |
| `js/documents-r2.js` | 2056 | 77 | documents.js - Logic for the Documents Module |
| `js/tasks.js` | 1987 | 64 | TASKS MODULE |
| `js/routenplanung.js` | 1875 | 86 | ROUTENPLANUNG (eigene Seite) |
| `js/labels.js` | 1857 | 89 | labels.js — Etikettendrucker: Artikel verwalten, per CSV/Excel importieren, |
| `js/history-modal.js` | 1646 | 29 | Historie: Verlauf einer Maschine, manuelle Eintraege, Fotos, E-Mail- und WhatsApp-Darstellung |
| `js/servicebericht-pdf.js` | 1501 | 7 | PDF-Erzeugung des Serviceberichts (jsPDF) inkl. Vorschau und Ablage in R2 |
| `js/ai-quick-capture.js` | 1471 | 52 | AI QUICK CAPTURE |
| `js/customers.js` | 1388 | 38 | CUSTOMERS & FIRMENEINSTELLUNGEN MODULE |
| `js/task_templates.js` | 1251 | 57 | TASK TEMPLATES & SNIPPETS MODULE |
| `js/calendar-events.js` | 1133 | 30 | Kalender und Termine: Ereignisse, Wartungstermine, Wartungs-E-Mails |
| `js/service-report-form.js` | 1041 | 40 | Servicebericht-Formular: Maschinenauswahl, Ansprechpartner, Techniker, Speichern |
| `js/calendar-widget.js` | 974 | 39 | KALENDER-WIDGET (Icon rechts oben in der Topbar) |
| `js/processes-ui.js` | 969 | 42 | Vorgaenge: Anlegen, Bearbeiten, Status, Zuweisung, Arbeitsschritte |
| `js/checklists.js` | 832 | 25 | checklists.js - Client-side prototype logic for dynamic checklists (Wartungspläne & UVV-Protokolle) |
| `js/settings-uvv-plans.js` | 738 | 35 | Einstellungen: UVV- und Wartungsplaene, Gruppenfarben |
| `js/machine-modal.js` | 734 | 36 | Maschinen-Modal: Dateien/Fotos, verknuepfte Maschinen, Zusatzausruestung, Upload |
| `js/service-entries.js` | 706 | 14 | — |
| `js/notifications.js` | 683 | 33 | BENACHRICHTIGUNGEN (Glocke in der Topbar) |
| `js/protocol_templates.js` | 674 | 25 | — |
| `js/machine-details-modal.js` | 656 | 12 | Maschinen-Detailansicht: Modal, letzter Serviceeinsatz, Routen-Link |
| `js/offline-service.js` | 646 | 11 | offline-service.js — IndexedDB-based offline queue for service reports |
| `js/processes.js` | 601 | 13 | Vorgangs-Typ Metadaten: Icon, Farbe & Label je process_type |
| `js/ki-assistent.js` | 600 | 22 | KI-ASSISTENT — Fragen stellen, Antworten bekommen, Ansichten öffnen |
| `js/dashboard.js` | 515 | 5 | — |
| `js/machines-grouped.js` | 503 | 8 | Enhanced renderMachines with category grouping, collapsible sections, dividers, and Workshop support |
| `js/service-reports.js` | 496 | 20 | — |
| `js/ai-address-task.js` | 477 | 14 | KI‑VORGANG AUS ADRESSE (mit Mikrofon + Schritt-Erkennung) |
| `js/users.js` | 413 | 8 | USER MANAGEMENT LOGIC |
| `js/signature-pads.js` | 411 | 36 | Unterschriftenfelder: Kunde, Techniker, Fahrer, Benutzer |
| `js/auth.js` | 371 | 10 | — |
| `js/file-upload-service-r2.js` | 343 | 0 | — |
| `js/workshop-photos-helper.js` | 326 | 17 | — |
| `js/service-list.js` | 298 | 12 | Serviceberichte-Liste: Kategorienfilter, Ansichtswechsel, Loeschen, Aktionen |
| `js/routeplanner.js` | 283 | 13 | ROUTENPLANER MIT UMKREISSUCHE |
| `js/service-picker.js` | 264 | 7 | Servicebericht-Auswahl aus Aufgaben und Vorgaengen (Picker) |
| `js/photo-lightbox.js` | 248 | 7 | Bildbetrachter: Anhaenge, Galerie, Zoom und Wischgesten |
| `js/customer-matching.js` | 209 | 4 | Kunden-Autovervollstaendigung und automatische Zuordnung (Name, Adresse, Seriennummer) |
| `js/process-machine-select.js` | 191 | 8 | Vorgaenge: Maschinenauswahl und offene Werkstattauftraege |
| `js/process-messages.js` | 148 | 7 | Vorgaenge: Nachrichten-/Screenshot-Dateien verarbeiten |
| `js/dropdown-position.js` | 139 | 8 | DROPDOWN-POSITIONIERUNG IN SCROLLBAREN MODALS |
| `js/permissions.js` | 120 | 4 | BENUTZER-BERECHTIGUNGEN |
| `js/worklog-tables.js` | 119 | 6 | Servicebericht: Arbeitszeiten- und Materialtabellen, Zusammenfassung |
| `js/ui-feedback.js` | 98 | 7 | RÜCKMELDUNGEN AN DEN BENUTZER (Toasts) |
| `js/documents-modal.js` | 88 | 3 | Dokumente einer Maschine: Modal und Download |
| `js/voice-dictation.js` | 87 | 2 | — |
| `js/auto-nachladen.js` | 80 | 2 | AUTOMATISCHES NACHLADEN LANGER LISTEN |
| `js/workshop-photos-modal.js` | 66 | 2 | Werkstattfotos: Modal zum Aufnehmen und Hochladen |
| `js/ui-modals.js` | 62 | 4 | — |
| `js/app-core.js` | 57 | 3 | App-Basis: Offline-Erkennung, globale Fehlerbehandlung, Dialog fuer ungespeicherte Aenderungen |
| `js/modal-sections.js` | 48 | 3 | Auf- und Zuklappen der Abschnitte in Maschinen- und Servicebericht-Modal |

## Stylesheets

| Datei | Zeilen |
|---|--:|
| `css/base/responsive.css` | 1797 |
| `css/views/protocols.css` | 1775 |
| `css/views/addressbook.css` | 1512 |
| `css/views/routenplanung.css` | 840 |
| `css/components/calendar-widget.css` | 819 |
| `css/views/settings.css` | 625 |
| `css/views/machine-modal.css` | 542 |
| `css/views/tasks.css` | 541 |
| `css/components/dropdowns.css` | 497 |
| `css/views/documents.css` | 428 |
| `css/components/calendar.css` | 391 |
| `css/components/notifications.css` | 384 |
| `css/components/navigation.css` | 334 |
| `css/components/ki-assistent.css` | 314 |
| `css/views/history.css` | 310 |
| `css/components/buttons.css` | 294 |
| `css/views/service-reports.css` | 284 |
| `css/components/forms.css` | 269 |
| `css/views/procurement.css` | 242 |
| `css/components/elements.css` | 230 |
| `css/base/reset.css` | 205 |
| `css/views/accounting.css` | 203 |
| `css/views/machines.css` | 197 |
| `css/views/accounting-modal.css` | 184 |
| `css/components/focus-mode.css` | 176 |
| `css/components/modals.css` | 153 |
| `css/views/login.css` | 121 |
| `css/base/landscape.css` | 99 |
| `css/base/variables.css` | 98 |
| `css/views/accounting-finance-cards.css` | 96 |
| `css/views/dashboard.css` | 79 |
| `css/views/listen.css` | 79 |
| `css/components/voice-dictation.css` | 67 |
| `css/base/utilities.css` | 46 |
| `css/views/workshop.css` | 45 |
| `css/style.css` | 38 |
| `css/views/accounting-toggle.css` | 18 |

## Hinweise

- Die Ladereihenfolge der Module in `index.html` entspricht der frueheren
  Reihenfolge im Inline-Code und darf nicht vertauscht werden.
- Neue js/css-Datei? Auch in die `PRECACHE`-Liste in `sw.js` eintragen.
- HTML gehoert in `partials/`, danach `node build.js`.
