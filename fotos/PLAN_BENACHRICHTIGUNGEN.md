# Plan: Benachrichtigungen und Zuweisungs-Abläufe

> Stand 2026-08-15. **Nur Planung — es wurde noch nichts gebaut.**
> Entschieden: Abläufe zunächst für **Vorgänge** und **Termine**.

## Ausgangslage (nachgesehen, nicht vermutet)

| Was | Wo | Zustand |
|---|---|---|
| Einstellungen je Nutzer | `js/notifications.js:64` | vorhanden, aber in `localStorage` |
| Zusagen/Absagen | `event_participants` | vorhanden — **nur für Termine** |
| Vorgänge-Zuweisung | `internal_processes.assigned_users` | Liste von IDs, **kein Antwortstatus** |

Die acht bestehenden Einstellungen (`DEFAULT_PREFS`, `js/notifications.js:28`):
`processes`, `tasks`, `maintenance`, `offers`, `appointments` (an/aus) sowie
`before` (Vorlauf 3 Tage), `after` (Rückblick 14), `maintBefore` (Wartung 30).

**Der Ablauf, den du dir wünschst, existiert also schon — für Termine.**
`event_participants` hält je Kollege `offen | zugesagt | abgesagt`, die Knöpfe
stehen in der Glocke (`js/notifications.js:416`), und die Antwort geht als eigene
Benachrichtigung an den Einladenden zurück (`js/notifications.js:424`).
Es geht im Kern darum, dieses Muster zu verallgemeinern.

### Technische Randbedingungen

- `public.users.id` ist **bigint**, `maintenance_events.id` ist **uuid**.
  `internal_processes.id` ist je nach Setup uuid **oder** bigint — das Projekt
  ermittelt den Typ zur Laufzeit (`supabase_add_process_customer.sql:18`).
  Ein gemeinsamer Bezug muss damit umgehen.
- Migrationen: eine idempotente Datei je Schritt unter `supabase/`, von Hand im
  Supabase-SQL-Editor ausgeführt. **Die App muss vorher weiterlaufen** — das ist
  in diesem Projekt durchgängig so gelöst und bleibt Vorgabe.

---

## Teil A — Einstellungen in die Datenbank

**Problem:** `localStorage` ist an Gerät *und* Browser gebunden. Neues Handy,
zweiter Rechner oder geleerter Cache = alle Einstellungen zurück auf Standard.

**Vorschlag:** Tabelle `user_notification_prefs`, ein Datensatz je Nutzer,
Einstellungen als **jsonb** statt je Spalte.

```sql
create table if not exists public.user_notification_prefs (
    user_id    bigint primary key references public.users (id) on delete cascade,
    prefs      jsonb not null default '{}'::jsonb,
    updated_at timestamptz not null default now()
);
```

*Warum jsonb und nicht je Spalte:* Mit Teil B kommen neue Schalter dazu
(„Zuweisung erhalten", „Zusage eingegangen", „Absage eingegangen"). Je Spalte
hieße das jedes Mal eine neue Migration; als jsonb reicht ein Eintrag mehr in
`DEFAULT_PREFS`. Gefiltert wird ohnehin im Browser, nicht per SQL.

**Änderungen in `js/notifications.js`:**

1. `prefs()` liest weiter **synchron** aus einem Zwischenspeicher — die Funktion
   wird in `collect()` mehrfach aufgerufen, eine async-Umstellung würde sich
   durch die ganze Datei ziehen.
2. Neu `loadPrefsFromDb()`: einmal nach der Anmeldung, füllt den Zwischenspeicher
   und rendert die Glocke neu.
3. `savePrefs()` schreibt in **beides** — Datenbank *und* `localStorage`.
   Der lokale Stand bleibt als Offline-Rückfall (die App muss per `file://`
   und ohne Netz laufen).
4. Fehlt die Tabelle noch, greift alles auf `localStorage` zurück wie heute.

**Reihenfolge beim Lesen:** Datenbank → sonst `localStorage` → sonst `DEFAULT_PREFS`.

**Aufwand:** überschaubar, eine Datei plus eine Migration. Kein Risiko für
bestehende Daten.

---

## Teil B — Zusagen/Absagen für Vorgänge

Hier ist die eigentliche Entscheidung. Zwei Wege:

### Weg 1 — zweite Tabelle `process_participants`

Kopie von `event_participants` für Vorgänge.

- **Dafür:** bestehender, funktionierender Code bleibt unberührt; echter
  Fremdschlüssel mit `on delete cascade`.
- **Dagegen:** Sammel- und Anzeigelogik in `notifications.js` doppelt sich. Beim
  dritten Typ (Aufgaben, Serviceberichte) dann ein drittes Mal.

### Weg 2 — eine gemeinsame Tabelle `assignment_responses` *(Empfehlung)*

```sql
create table if not exists public.assignment_responses (
    id              bigserial primary key,
    target_type     text   not null,          -- 'appointment' | 'process' | später mehr
    target_id       text   not null,          -- als text, s.u.
    user_id         bigint references public.users (id) on delete cascade,
    user_name       text,
    status          text   not null default 'offen',   -- offen | zugesagt | abgesagt
    responded_at    timestamptz,
    invited_by      bigint,
    invited_by_name text,
    created_at      timestamptz not null default now()
);
create unique index if not exists assignment_responses_unique
    on public.assignment_responses (target_type, target_id, user_id);
```

- **`target_id` als `text`**, weil Termine uuid-IDs haben und Vorgänge je nach
  Setup uuid oder bigint. Das ist der Preis für eine gemeinsame Tabelle.
- **Dafür:** ein Code-Pfad für alle Typen; ein weiterer Typ ist danach eine
  Zeile Konfiguration, keine neue Tabelle. Genau das brauchst du für „solche
  Abläufe basteln".
- **Dagegen:** kein `on delete cascade` — wird ein Vorgang gelöscht, bleiben
  verwaiste Zeilen stehen.
  **Warum das hier vertretbar ist:** `notifications.js` schlägt das Ziel ohnehin
  nach und überspringt Einträge, deren Ziel fehlt (`js/notifications.js:395`).
  Verwaiste Zeilen sind damit unsichtbar, sie sammeln sich nur an. Ein
  gelegentlicher Aufräum-Lauf genügt.

**Umstiegsweg ohne Risiko:**
1. Neue Tabelle anlegen, Bestand aus `event_participants` hineinkopieren.
2. Code auf die neue Tabelle umstellen.
3. `event_participants` **stehen lassen** — erst nach einigen Wochen im
   Betrieb löschen. Bis dahin ist ein Rückzug jederzeit möglich.

### Was in der Oberfläche dazukommt

- Beim Zuweisen eines Vorgangs (`js/processes-ui.js:412`, `assigned_users`)
  zusätzlich eine Zeile je Kollege in `assignment_responses` mit `offen`.
- In der Glocke: dieselben Knöpfe wie bei Terminen, aber für Vorgänge.
- Rückmeldung an den Zuweisenden: „*Name* hat Vorgang *X* angenommen/abgelehnt".
- Drei neue Schalter in den Einstellungen (siehe Teil A).

**Offene Frage:** Soll ein Vorgang bei Ablehnung automatisch etwas tun — Status
zurücksetzen, den Zuweisenden wieder eintragen, den Kollegen entfernen? Oder
bleibt die Ablehnung erst einmal nur ein Vermerk? Das ändert den Umfang deutlich.

---

## Teil C — die eigentlichen „Abläufe" (später)

Was du darüber hinaus beschrieben hast — frei baubare Abläufe, wer wann worüber
benachrichtigt wird — ist ein **Regelwerk**, nicht mehr nur ein Antwortstatus.
Das ist ein eigenes Vorhaben und sollte erst beginnen, wenn A und B im Betrieb
stehen. Sinnvoller Zuschnitt dann: eine Tabelle `workflow_rules` mit
Auslöser → Bedingung → Aktion, und die Glocke als Ausgabekanal.

Vorher lohnt die Frage, ob ein festes Muster („zugewiesen → annehmen/ablehnen →
Rückmeldung") den Bedarf schon deckt. Ein frei konfigurierbares Regelwerk ist
deutlich mehr Arbeit und lohnt nur, wenn wirklich mehrere verschiedene Abläufe
gebraucht werden.

---

## Vorgeschlagene Reihenfolge

| Schritt | Inhalt | Abhängig von |
|---|---|---|
| 1 | Teil A — Einstellungen in die Datenbank | — |
| 2 | Teil B — gemeinsame Tabelle, Termine umziehen (Verhalten unverändert) | 1 |
| 3 | Teil B — Vorgänge anschließen, neue Schalter | 2 |
| 4 | Teil C — Regelwerk, falls dann noch gebraucht | 3 |

Schritt 2 ist bewusst ein reiner Umbau **ohne** sichtbare Änderung — so lässt
sich prüfen, dass die Termine unverändert funktionieren, bevor Vorgänge dazukommen.

---

## Aufgaben bleiben bewusst draußen

**Entschieden am 2026-08-15: Aufgaben bekommen *kein* Annehmen/Ablehnen.**

Grund: Die Aufgaben laufen als Anzeigetafel auf dem **Fernseher in der
Werkstatt**. Wer sie abarbeitet, steht davor — ohne Gerät, auf dem er zustimmen
könnte. Ein Antwortstatus hätte dort niemanden, der ihn setzt.

Das erklärt auch den Kinomodus, den Geschwindigkeitsregler und die
Spaltenwahl 1/2/3 in der Aufgaben-Ansicht: Das ist die Fernseher-Darstellung,
kein Arbeitswerkzeug am Schreibtisch. (Auf dem Handy sind diese Bedienelemente
seit 2026-08-15 ausgeblendet.)

Technisch wäre es mit Weg 2 ein `target_type` mehr — es ist also keine
Einbahnstraße, falls sich die Lage einmal ändert.

## Noch offen

**Ablehnung mit Folgen?** Siehe Teil B: Ist die Ablehnung nur ein Vermerk, oder
soll sich der Vorgang dabei verändern — Status zurücksetzen, den Kollegen
entfernen, den Zuweisenden wieder eintragen? Das ändert den Umfang deutlich.
