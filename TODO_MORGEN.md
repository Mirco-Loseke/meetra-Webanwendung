# TODO – Weiter am 2026-09-23

## 1. Sage 100 → Angebote & Rechnungen automatisch (Windows-Aufgabenplanung)

**Vorbereiten (mit IT / Sage-Betreuer):**
- [ ] Welcher Server / SQL-Server-Instanz, Datenbankname der Sage-100-Mandanten-DB
- [ ] SQL-Benutzer **nur mit Leserecht** (`db_datareader`) anlegen lassen
- [ ] Tabellen prüfen (vermutlich `KHKVKBelege` = Belegköpfe, Belegart Angebot/Rechnung;
      `KHKOpVorgaenge` = offene Posten; `KHKKontokorrent` = Kunden). Spalten notieren:
      Belegnummer, Belegdatum, Kundennummer/Matchcode, Netto, MwSt, Brutto
- [ ] Beispielzeilen exportieren (2–3 Angebote, 2–3 Rechnungen)

**Bauen:**
- [ ] Migration `supabase/supabase_add_rechnungen.sql`: Tabelle `rechnungen`
      (belegnummer UNIQUE, belegdatum, customer_id, kunde_name, kundennummer, netto, mwst,
      brutto, bezahlt_am, notiz, quelle, aktualisiert_am) + RLS → in `supabase/MIGRATIONEN.md` eintragen
- [ ] Abgleich-Skript `tools/sage-sync/` (PowerShell oder Node): liest SQL, schreibt per
      Upsert (über `belegnummer`) nach Supabase – **nur Änderungen** seit letztem Lauf
      (Egress-Regeln!). Angebote in `angebote` (gleiche Felder wie der Excel-Import in `listen.js`)
- [ ] Zugang fürs Skript: eigener Supabase-Schlüssel nur auf dem Server, nie im Browser/Repo
- [ ] Windows-Aufgabenplanung: z. B. alle 15 min während der Arbeitszeit + nachts komplett
- [ ] Log-Datei + Fehlermeldung (Mail o. Ä.), wenn der Abgleich scheitert
- [ ] Kundenzuordnung: Matchcode/Kundennummer → `customers` (Logik wie `autoAssignAngeboteMachines`)

**App:**
- [ ] Adresse → neuer Reiter **„Belege"**: Summen (Umsatz Jahr/Vorjahr/gesamt, offen),
      Liste Nr. / Datum / Netto / MwSt / Brutto / Notiz (Notiz bearbeitbar), neueste oben
- [ ] Laden erst beim Öffnen des Reiters, nur für diesen Kunden
- [ ] Übergang: Excel/CSV-Import für Rechnungen wie bei Angeboten (falls Sage-Zugang dauert)

## 2. Datenschutz
- [ ] Einstellungen → Datenschutz (`partials/settings/datenschutz.html`) ergänzen:
  - [ ] Rechnungsdaten aus Sage (Zweck, Kategorien, Speicherdauer – steuerlich 10 Jahre)
  - [ ] OneDrive-/SharePoint-Eingang (Microsoft Graph, `Files.ReadWrite`)
  - [ ] Outlook/Mail (Graph), Gemini-KI mit Pseudonymisierung – Stand prüfen
- [ ] AV-Verträge prüfen: Supabase, Cloudflare R2, Microsoft 365, Google (Gemini)
- [ ] Zugriffsrecht für Belege (wer darf Rechnungen sehen?) – neues Recht wie `rechnungsliste`

## 3. Offen von heute
- [ ] OneDrive-Eingang einrichten: Entra → API-Berechtigungen → `Files.ReadWrite`
      (für SharePoint: `Files.ReadWrite.All` + Admin-Zustimmung), Ordner in Einstellungen → Outlook
- [ ] Entscheiden: SharePoint-Ordner statt OneDrive? → Ordner per Link statt Pfad (`/shares/…`)
- [ ] Service Worker ist seit heute aktiv (v610): nach dem Ausrollen einmal prüfen, dass
      Updates ankommen (neue `?v=N` → neuer Stand) und Erinnerungs-Meldungen funktionieren
