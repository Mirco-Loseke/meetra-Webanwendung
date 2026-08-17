# Projektkarte

> Erzeugt von `node tools/karte.js` — nicht von Hand pflegen.
> Funktion gesucht? `FUNKTIONEN.txt` durchsuchen, dort steht Datei und Zeile.

## JavaScript-Module

52k Zeilen in 58 Dateien.

| Datei | Zeilen | Funktionen | Zweck |
|---|--:|--:|---|
| `js/addressbook.js` | 5184 | 166 | ADRESSBUCH MODULE |
| `js/accounting.js` | 3343 | 82 | accounting.js - Logic for the Accounting Module |
| `js/app-init.js` | 3336 | 85 | App-Start: alles, was beim Laden der Seite eingerichtet wird (DOMContentLoaded) |
| `js/protocols.js` | 2729 | 61 | PROTOCOLS MODULE |
| `js/listen.js` | 2495 | 74 | LISTEN MODULE |
| `js/routenplanung.js` | 2320 | 111 | ROUTENPLANUNG (eigene Seite) |
| `js/documents-r2.js` | 2056 | 77 | documents.js - Logic for the Documents Module |
| `js/tasks.js` | 1968 | 66 | TASKS MODULE |
| `js/labels.js` | 1857 | 89 | labels.js — Etikettendrucker: Artikel verwalten, per CSV/Excel importieren, |
| `js/history-modal.js` | 1641 | 29 | Historie: Verlauf einer Maschine, manuelle Eintraege, Fotos, E-Mail- und WhatsApp-Darstellung |
| `js/ai-quick-capture.js` | 1635 | 56 | AI QUICK CAPTURE |
| `js/servicebericht-pdf.js` | 1501 | 7 | PDF-Erzeugung des Serviceberichts (jsPDF) inkl. Vorschau und Ablage in R2 |
| `js/customers.js` | 1441 | 43 | CUSTOMERS & FIRMENEINSTELLUNGEN MODULE |
| `js/processes-ui.js` | 1354 | 62 | Vorgaenge: Anlegen, Bearbeiten, Status, Zuweisung, Arbeitsschritte |
| `js/task_templates.js` | 1251 | 57 | TASK TEMPLATES & SNIPPETS MODULE |
| `js/service-report-form.js` | 1221 | 48 | Servicebericht-Formular: Maschinenauswahl, Ansprechpartner, Techniker, Speichern |
| `js/calendar-events.js` | 1130 | 30 | Kalender und Termine: Ereignisse, Wartungstermine, Wartungs-E-Mails |
| `js/calendar-widget.js` | 993 | 39 | KALENDER-WIDGET (Icon rechts oben in der Topbar) |
| `js/notifications.js` | 934 | 40 | BENACHRICHTIGUNGEN (Glocke in der Topbar) |
| `js/checklists.js` | 832 | 25 | checklists.js - Client-side prototype logic for dynamic checklists (Wartungspläne & UVV-Protokolle) |
| `js/service-entries.js` | 806 | 19 | — |
| `js/processes.js` | 789 | 24 | Vorgangs-Typ Metadaten: Icon, Farbe & Label je process_type |
| `js/settings-uvv-plans.js` | 738 | 35 | Einstellungen: UVV- und Wartungsplaene, Gruppenfarben |
| `js/machine-modal.js` | 734 | 36 | Maschinen-Modal: Dateien/Fotos, verknuepfte Maschinen, Zusatzausruestung, Upload |
| `js/protocol_templates.js` | 674 | 25 | — |
| `js/machine-details-modal.js` | 656 | 12 | Maschinen-Detailansicht: Modal, letzter Serviceeinsatz, Routen-Link |
| `js/offline-service.js` | 646 | 11 | offline-service.js — IndexedDB-based offline queue for service reports |
| `js/dashboard.js` | 515 | 5 | — |
| `js/machines-grouped.js` | 503 | 8 | Enhanced renderMachines with category grouping, collapsible sections, dividers, and Workshop support |
| `js/service-reports.js` | 496 | 20 | — |
| `js/ai-address-task.js` | 467 | 13 | KI‑VORGANG AUS ADRESSE (mit Mikrofon + Schritt-Erkennung) |
| `js/users.js` | 432 | 8 | USER MANAGEMENT LOGIC |
| `js/signature-pads.js` | 411 | 36 | Unterschriftenfelder: Kunde, Techniker, Fahrer, Benutzer |
| `js/appointments.js` | 397 | 21 | TERMINE MIT TEILNEHMERN |
| `js/auth.js` | 371 | 10 | — |
| `js/file-upload-service-r2.js` | 343 | 0 | — |
| `js/workshop-photos-helper.js` | 332 | 17 | — |
| `js/service-list.js` | 298 | 12 | Serviceberichte-Liste: Kategorienfilter, Ansichtswechsel, Loeschen, Aktionen |
| `js/routeplanner.js` | 283 | 13 | ROUTENPLANER MIT UMKREISSUCHE |
| `js/service-picker.js` | 264 | 7 | Servicebericht-Auswahl aus Aufgaben und Vorgaengen (Picker) |
| `js/photo-lightbox.js` | 248 | 7 | Bildbetrachter: Anhaenge, Galerie, Zoom und Wischgesten |
| `js/customer-matching.js` | 209 | 4 | Kunden-Autovervollstaendigung und automatische Zuordnung (Name, Adresse, Seriennummer) |
| `js/select-enhance.js` | 205 | 8 | — |
| `js/worklog-tables.js` | 198 | 11 | Servicebericht: Arbeitszeiten- und Materialtabellen, Zusammenfassung |
| `js/process-machine-select.js` | 191 | 8 | Vorgaenge: Maschinenauswahl und offene Werkstattauftraege |
| `js/workshop-tasks.js` | 179 | 11 | Werkstatt-Liste — schnelle kleine Aufgaben, gemeinsam für alle |
| `js/speech-input.js` | 154 | 7 | SPRACHEINGABE (Diktieren) für Textfelder |
| `js/dropdown-position.js` | 150 | 9 | DROPDOWN-POSITIONIERUNG IN SCROLLBAREN MODALS |
| `js/process-messages.js` | 148 | 7 | Vorgaenge: Nachrichten-/Screenshot-Dateien verarbeiten |
| `js/permissions.js` | 124 | 4 | BENUTZER-BERECHTIGUNGEN |
| `js/ui-feedback.js` | 98 | 7 | RÜCKMELDUNGEN AN DEN BENUTZER (Toasts) |
| `js/app-core.js` | 90 | 5 | App-Basis: Offline-Erkennung, globale Fehlerbehandlung, Dialog fuer ungespeicherte Aenderungen |
| `js/documents-modal.js` | 88 | 3 | Dokumente einer Maschine: Modal und Download |
| `js/voice-dictation.js` | 87 | 2 | — |
| `js/auto-nachladen.js` | 80 | 2 | AUTOMATISCHES NACHLADEN LANGER LISTEN |
| `js/workshop-photos-modal.js` | 66 | 2 | Werkstattfotos: Modal zum Aufnehmen und Hochladen |
| `js/ui-modals.js` | 62 | 4 | — |
| `js/modal-sections.js` | 48 | 3 | Auf- und Zuklappen der Abschnitte in Maschinen- und Servicebericht-Modal |

## Stylesheets

| Datei | Zeilen |
|---|--:|
| `css/base/responsive.css` | 1972 |
| `css/views/protocols.css` | 1785 |
| `css/views/addressbook.css` | 1587 |
| `css/views/routenplanung.css` | 926 |
| `css/components/calendar-widget.css` | 819 |
| `css/views/settings.css` | 625 |
| `css/components/dropdowns.css` | 544 |
| `css/views/tasks.css` | 541 |
| `css/components/notifications.css` | 472 |
| `css/views/machine-modal.css` | 452 |
| `css/views/documents.css` | 428 |
| `css/components/calendar.css` | 391 |
| `css/components/navigation.css` | 346 |
| `css/views/history.css` | 310 |
| `css/components/dropdown-look.css` | 309 |
| `css/components/buttons.css` | 294 |
| `css/views/service-reports.css` | 284 |
| `css/components/forms.css` | 269 |
| `css/base/reset.css` | 256 |
| `css/components/focus-mode.css` | 246 |
| `css/views/procurement.css` | 242 |
| `css/components/elements.css` | 230 |
| `css/components/appointments.css` | 214 |
| `css/views/accounting.css` | 203 |
| `css/views/workshop-tasks.css` | 202 |
| `css/views/machines.css` | 197 |
| `css/views/accounting-modal.css` | 184 |
| `css/base/tokens.css` | 183 |
| `css/components/modals.css` | 166 |
| `css/components/voice-dictation.css` | 125 |
| `css/base/brand-accents.css` | 122 |
| `css/views/login.css` | 121 |
| `css/base/landscape.css` | 99 |
| `css/base/variables.css` | 98 |
| `css/views/accounting-finance-cards.css` | 96 |
| `css/views/dashboard.css` | 79 |
| `css/views/listen.css` | 79 |
| `css/base/utilities.css` | 59 |
| `css/style.css` | 45 |
| `css/views/workshop.css` | 45 |
| `css/views/accounting-toggle.css` | 18 |

## Hinweise

- Die Ladereihenfolge der Module in `index.html` entspricht der frueheren
  Reihenfolge im Inline-Code und darf nicht vertauscht werden.
- Neue js/css-Datei? Auch in die `PRECACHE`-Liste in `sw.js` eintragen.
- HTML gehoert in `partials/`, danach `node build.js`.
