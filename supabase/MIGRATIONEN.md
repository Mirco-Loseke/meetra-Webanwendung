# Supabase-Migrationen — Übersicht

Alle `.sql`-Dateien dieses Ordners werden **von Hand im Supabase SQL-Editor**
ausgeführt (Dashboard → SQL Editor → Datei-Inhalt einfügen → *Run*). Es gibt
keine automatische Migrationsverwaltung; deshalb diese Liste.

Jede Datei ist so geschrieben, dass ein **erneutes Ausführen nichts kaputt macht**
(`if not exists` / `create or replace`). Im Zweifel lieber noch einmal laufen
lassen als eine Migration auszulassen.

**Reihenfolge:** von oben nach unten. Innerhalb eines Blocks ist die Reihenfolge egal.

---

## Grundlage

| Datei | Wofür |
|---|---|
| `supabase_setup_history.sql` | Buchhaltungs-Positionen (`accounting_items`) samt Rechten — ältester Stand |
| `supabase_migration_accounting_items_jsonb.sql` | Zieht die Positionen aus `accounting_items` in die JSONB-Spalte `accounting.items` um. **Nach der Kontrolle** kann die alte Tabelle gelöscht werden |

## Adressbuch

| Datei | Wofür |
|---|---|
| `supabase_add_addressbook.sql` | Adressen, Ansprechpartner, Notizen, Verknüpfungen |
| `supabase_add_address_extra_contacts.sql` | Weitere Telefonnummern/E-Mails je Adresse |
| `supabase_add_address_history.sql` | Verlauf je Adresse (Knopf „Verlauf") |
| `supabase_add_addressbook_realtime.sql` | Live-Aktualisierung des Adressbuchs |
| `supabase_add_customer_coords.sql` | Koordinaten-Cache je Adresse (Umkreissuche Routenplanung) |
| `supabase_add_manufacturer_category.sql` | Hersteller als eigene Kategorie + Zuordnung je Adresse |
| `supabase_add_manual_history_customer_id.sql` | Historie-Einträge (u. a. importierte Angebote) auch ohne Maschine direkt an der Adresse sichtbar |

## Maschinen, Service, Protokolle

| Datei | Wofür |
|---|---|
| `supabase_add_machine_coords.sql` | Koordinaten-Cache je Maschine (Routenplaner Umkreissuche) |
| `supabase_add_service_location_snapshot.sql` | Standort **pro Servicebericht** (`location_snapshot`), überschreibt den Maschinen-Stammsatz nicht mehr |
| `supabase_add_service_signed_flag.sql` | Generierte Spalten `customer_signed`/`tech_signed` — die Berichte-Liste zeigt „Unterschrieben", ohne das Unterschriftsbild zu laden |

> Das **UVV- & Wartungsprotokoll** (`js/uvv-protokoll.js`) braucht **keine**
> eigene Migration: es liegt als normale Zeile in `service_entries`
> (`title = 'UVV- & Wartungsprotokoll'`, Prüfliste in `checklist_payload`).

## Mietvereinbarung

| Datei | Wofür |
|---|---|
| `supabase_mietvereinbarung_komplett.sql` | **Die einzige Datei, die ausgeführt wird.** Vereinbarungen, Vorlagen und Vorlagen-Kategorien in einem — passend zu den `bigint`-Schlüsseln dieser Datenbank |
| `supabase_add_rental_history.sql` | Mietvereinbarung in der Maschinen-Historie (Typ `miete` + Betriebsstunden bei Übergabe/Rücknahme als `hours`-Einträge). **Nach** `supabase_mietvereinbarung_komplett.sql` ausführen |
| ~~`supabase_add_rental_agreements.sql`~~ | **Veraltet, nicht ausführen** (setzt `uuid`-Schlüssel voraus) |
| ~~`supabase_add_rental_templates.sql`~~ | **Veraltet, nicht ausführen** |
| ~~`supabase_add_rental_template_categories.sql`~~ | **Veraltet, nicht ausführen** |

## Aufgaben & Werkstatt

| Datei | Wofür |
|---|---|
| `supabase_add_task_due_dates.sql` | Erinnerungen/Fälligkeiten an Vorgängen und Schritten |
| `supabase_add_tasks_realtime.sql` | Live-Aktualisierung von `tasks`/`subtasks` (Anzeigetafel in der Werkstatt) |
| `supabase_add_workshop_tasks.sql` | Werkstatt-Liste (schnelle kleine Aufgaben) |
| `supabase_add_invoice_todos.sql` | Rechnungsliste („wem muss noch eine Rechnung geschrieben werden") — ausklappbar rechts unter Vorgänge, Sichtbarkeit je Benutzer |
| `supabase_add_notification_prefs.sql` | Benachrichtigungs-Einstellungen je Benutzer, geräteübergreifend |
| `supabase_add_erinnerung_owner.sql` | Angebots-Erinnerung gehört dem, der sie gesetzt hat (`erinnerung_by`) |
| `supabase_add_angebot_vorgang.sql` | Jedes Angebot ist ein Vorgang (`angebote.process_id`); Zuständiger, Stand, Adresse, Maschine leben im Vorgang |
| `supabase_add_subtask_planung.sql` | Unteraufgaben planbar: `start_date`, `end_date`, `assigned_to`, `expected_time` — nötig für eigene Balken in der Timeline |
| `supabase_add_subtask_sort_order.sql` | Unteraufgaben: feste Reihenfolge (`sort_order`) — nötig, damit Verschieben per Ziehen auf der Aufgabentafel hält |
| `supabase_add_task_dependencies.sql` | Abhängigkeiten zwischen Aufgaben (`depends_on`) für die Timeline-Ansicht |

## Vorgänge

| Datei | Wofür |
|---|---|
| `supabase_add_process_customer.sql` | Adressbezug und Erinnerung je Vorgang |
| `supabase_add_process_steps.sql` | Schritte/Checkliste je Vorgang (`steps` JSONB) |
| `supabase_add_process_attachments.sql` | Dokumente an Vorgängen und einzelnen Schritten |
| `supabase_add_process_service_link.sql` | Verknüpfung Vorgang ↔ Servicebericht |
| `supabase_add_process_status_updates.sql` | Aktueller Stand je Vorgang |
| `supabase_add_processes_realtime.sql` | Live-Aktualisierung der Vorgänge |
| `supabase_fix_process_user.sql` | Ersteller an Vorgängen/Ereignissen als `bigint` statt `uuid` |
| `supabase_add_assignment_responses.sql` | Zuweisungen quittieren („Vorgang erhalten") |
| `supabase_migrate_status_wartet.sql` | Status „Wartet" abgeschafft — setzt Altbestand auf `in_bearbeitung` |
| ~~`supabase_add_process_status_log.sql`~~ | **Veraltet** — Status-Verlauf wurde am 23.07.2026 durch die Schritte ersetzt |

## Kalender & Termine

| Datei | Wofür |
|---|---|
| `supabase_add_event_participants.sql` | Termine mit Teilnehmern (Zu-/Absagen) |
| `supabase_add_event_customer.sql` | Termine an Adressen + Bezug zu einem Historieneintrag |
| `supabase_add_absences.sql` | Abwesenheiten (Urlaub/Krank/Schulung) für die Übersicht „Wer ist frei?" in der Timeline |

## Routenplanung

| Datei | Wofür |
|---|---|
| `supabase_add_saved_routes.sql` | Gespeicherte Routen der Seite „Routenplanung" |

## KI

| Datei | Wofür |
|---|---|
| `supabase_add_ai_usage.sql` | KI-Verbrauch je Nutzer und Tag |
| `supabase_add_customer_sage_stand.sql` | Sage-Abgleich: letzter Sage-Stand je Adresse (Handänderungen bleiben) |
| `supabase_add_rechnungen.sql` | Sage-Abgleich: Rechnungsbelege je Adresse (Reiter „Belege", Recht `belege`) |

## Mail (Outlook / Microsoft Graph)

| Datei | Wofür |
|---|---|
| `supabase_add_mail_zuordnungen.sql` | Ansicht „Mail": Absender-Adresse → Kunde von Hand zugeordnet (Rückfall ohne Tabelle: localStorage) |

---

## Edge Functions (kein SQL)

Liegen unter `supabase/functions/`, werden über die Supabase CLI ausgerollt:

| Function | Wofür | Anleitung |
|---|---|---|
| `r2-sign` | Signierte Upload-URLs für Cloudflare R2 — keine Credentials mehr im Browser | `SETUP.txt` |
| `sage-sync` | Sage-Abgleich (tools/sage-sync.ps1): nur Adressen/Angebote lesen/anlegen/ändern, Token statt Service-Key, ohne Verify JWT | `SETUP_SAGE_SYNC.txt` |
| `groq-proxy` | KI-Anfragen; hängt den Groq-Schlüssel serverseitig an | `SETUP_GROQ.txt` |

## Rechte in der Datenbank

| Datei | Wofür |
|---|---|
| `supabase_add_rls_loeschrechte.sql` | Löschrechte aus `users.permissions` per RLS durchsetzen. Block 1 (Grundlage, `users.is_admin`, Funktionen) einmal; danach je Tabelle `select app_rls_loeschschutz('tabelle', 'bereich')`, Rückweg `app_rls_zuruecksetzen('tabelle')`, Übersicht `app_rls_status`. **Schrittweise, keine Downtime** |

## Wichtige Regel für neue Migrationen

Schlüsseltypen sind in dieser Datenbank **nicht einheitlich**: `customers.id` ist
`uuid`, `machines.id` ist `bigint`. Eine neue Spalte deshalb nie fest verdrahten,
sondern den Typ zur Laufzeit aus `information_schema.columns` lesen und per
`format(... %s ...)`/`execute` anhängen — so machen es
`supabase_add_process_customer.sql` und `supabase_mietvereinbarung_komplett.sql`.
Ein fest gesetztes `customer_id bigint` scheitert entweder am Fremdschlüssel
(*„incompatible types: uuid and bigint"*) oder lässt Datensätze still verwaisen.
