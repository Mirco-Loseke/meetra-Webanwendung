-- =============================================================================
--  LÖSCHRECHTE AUCH IN DER DATENBANK DURCHSETZEN (Row Level Security)
-- =============================================================================
--  Bisher: alle Tabellen haben Policies „for all using (true)" — jeder angemeldete
--  Nutzer darf alles, die App blendet nur Knöpfe aus (js/permissions.js).
--
--  Jetzt: eine SQL-Funktion liest dieselben Rechte aus public.users.permissions,
--  die die Benutzerverwaltung schreibt (can_delete, del_<bereich>), und die
--  DELETE-Policy einer Tabelle fragt sie. Lesen/Anlegen/Ändern bleiben wie bisher.
--  Die Zuordnung Anmeldung → users-Zeile läuft wie in js/auth.js über die E-Mail.
--
--  Aufbau: Block 1 (Grundlage) einmal ausführen. Danach je Tabelle EIN Aufruf
--  von app_rls_loeschschutz(...) — jederzeit, ohne Downtime, einzeln.
--  Rückweg je Tabelle: app_rls_zuruecksetzen('tabelle') stellt „alles erlaubt"
--  wieder her. Beides dauert Millisekunden und sperrt nichts.
--
--  Regel aus js/permissions.js, hier 1:1 nachgebaut:
--    Admin                         → darf immer
--    permissions.can_delete = false → darf nichts löschen
--    permissions.del_<bereich> = false → darf diesen Bereich nicht löschen
--    Schlüssel fehlt               → erlaubt (Altbestände bleiben wie sie sind)
--    keine users-Zeile zur E-Mail  → verboten
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- BLOCK 1 · GRUNDLAGE (einmal ausführen, ändert noch kein Verhalten)
-- ─────────────────────────────────────────────────────────────────────────────

-- Admin-Kennzeichen: bisher nur im Code („Mirco Loseke", js/users.js). Hier als
-- echte Spalte, damit die Datenbank es prüfen kann.
alter table public.users add column if not exists is_admin boolean not null default false;
update public.users set is_admin = true
 where lower(coalesce(name, '')) like '%mirco%' and lower(coalesce(name, '')) like '%loseke%';

-- Die angemeldete Person als users-Zeile (über die E-Mail der Anmeldung).
create or replace function public.app_benutzer()
returns public.users
language sql stable security definer
set search_path = public
as $$
    select u.* from public.users u
     where lower(u.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
     limit 1
$$;

-- Darf die angemeldete Person in diesem Bereich löschen?
-- bereich = Schlüssel aus DELETE_AREAS (js/permissions.js), z. B. 'maschinen';
-- null = nur der Hauptschalter can_delete zählt.
create or replace function public.app_darf_loeschen(bereich text default null)
returns boolean
language plpgsql stable security definer
set search_path = public
as $$
declare
    u public.users;
    p jsonb;
begin
    u := public.app_benutzer();
    if u.id is null then return false; end if;          -- keine users-Zeile → nein
    if coalesce(u.is_admin, false) then return true; end if;
    p := case when jsonb_typeof(u.permissions) = 'object' then u.permissions else '{}'::jsonb end;
    if coalesce(p ->> 'can_delete', 'true') = 'false' then return false; end if;
    if bereich is not null and coalesce(p ->> ('del_' || bereich), 'true') = 'false' then return false; end if;
    return true;
end
$$;

-- Selbsttest im SQL-Editor (läuft dort als „postgres", also ohne Anmeldung → false):
--   select public.app_darf_loeschen('maschinen');
-- Echter Test: in der App als der Testnutzer anmelden und löschen (siehe Block 2).

-- Löschschutz für EINE Tabelle einschalten. Ersetzt alle vorhandenen Policies der
-- Tabelle durch: select/insert/update wie bisher offen, delete nur mit Recht.
-- (Alle bisherigen Policies sind vom Typ „alles erlaubt" — es geht nichts verloren.)
create or replace function public.app_rls_loeschschutz(tabelle text, bereich text default null)
returns text
language plpgsql security definer
set search_path = public
as $$
declare
    pol record;
begin
    execute format('alter table public.%I enable row level security', tabelle);
    for pol in select policyname from pg_policies where schemaname = 'public' and tablename = tabelle loop
        execute format('drop policy if exists %I on public.%I', pol.policyname, tabelle);
    end loop;
    execute format('create policy %I on public.%I for select using (true)', tabelle || '_lesen', tabelle);
    execute format('create policy %I on public.%I for insert with check (true)', tabelle || '_anlegen', tabelle);
    execute format('create policy %I on public.%I for update using (true) with check (true)', tabelle || '_aendern', tabelle);
    if bereich is null then
        execute format('create policy %I on public.%I for delete using (public.app_darf_loeschen())', tabelle || '_loeschen', tabelle);
    else
        execute format('create policy %I on public.%I for delete using (public.app_darf_loeschen(%L))', tabelle || '_loeschen', tabelle, bereich);
    end if;
    return 'Löschschutz aktiv: ' || tabelle || ' (Bereich ' || coalesce(bereich, '– nur Hauptschalter –') || ')';
end
$$;

-- RÜCKWEG für EINE Tabelle: wieder „alles erlaubt" wie vor dieser Migration.
create or replace function public.app_rls_zuruecksetzen(tabelle text)
returns text
language plpgsql security definer
set search_path = public
as $$
declare
    pol record;
begin
    for pol in select policyname from pg_policies where schemaname = 'public' and tablename = tabelle loop
        execute format('drop policy if exists %I on public.%I', pol.policyname, tabelle);
    end loop;
    execute format('create policy %I on public.%I for all using (true) with check (true)', tabelle || '_all', tabelle);
    return 'Zurückgesetzt: ' || tabelle || ' — alles wieder erlaubt';
end
$$;

-- Übersicht: welche Tabellen sind geschützt? (jederzeit ausführbar)
create or replace view public.app_rls_status as
    select tablename,
           bool_or(policyname like '%\_loeschen') as loeschschutz,
           string_agg(policyname || ' [' || cmd || ']', ', ' order by policyname) as policies
      from pg_policies
     where schemaname = 'public'
     group by tablename
     order by tablename;
-- select * from public.app_rls_status;


-- ─────────────────────────────────────────────────────────────────────────────
-- BLOCK 2 · PROBELAUF MIT EINER TABELLE
-- ─────────────────────────────────────────────────────────────────────────────
-- Probelauf: manuelle Historien-Einträge einer Maschine (manual_history_entries —
-- Telefon, Bemerkung, Foto, Stunden …). Bereich in der Benutzerverwaltung:
-- „Historie einer Maschine". Serviceberichte und Protokolle in derselben Historie
-- liegen in anderen Tabellen (service_entries, intake_protocols, …) und bleiben im
-- Probelauf ungeschützt — sie kommen in Block 3 mit demselben Schlüssel dazu.
--
-- Ablauf:
--   1. Diese Zeile ausführen:
--        select public.app_rls_loeschschutz('manual_history_entries', 'historie');
--   2. In der App als Admin: Einstellungen → Benutzer → Testnutzer → unter
--      „Einträge löschen" den Haken „Historie einer Maschine" ENTFERNEN, speichern.
--   3. Als Testnutzer anmelden, Maschine → Historie: einen Eintrag (z. B. Bemerkung)
--      anlegen geht; der Papierkorb an manuellen Einträgen ist weg. Zur Probe in
--      der Browser-Konsole (F12), <id> = id des Eintrags:
--        await window.supabaseClient.from('manual_history_entries').delete().eq('id', <id>)
--      → Antwort ohne Fehler, aber der Eintrag bleibt nach dem Neuladen stehen.
--   4. Haken wieder setzen, neu anmelden → derselbe Befehl löscht.
--   5. Als Admin: Löschen geht immer.
--
-- Zurück, falls etwas klemmt:
--        select public.app_rls_zuruecksetzen('manual_history_entries');


-- ─────────────────────────────────────────────────────────────────────────────
-- BLOCK 3 · WEITERE TABELLEN (jede Zeile einzeln, wann du willst)
-- ─────────────────────────────────────────────────────────────────────────────
-- Bereichs-Schlüssel = DELETE_AREAS in js/permissions.js. Kaskaden beachten:
-- Vorgang löschen löscht in der App auch Anhänge/Angebots-Verweise — deshalb
-- 'vorgaenge' erst schützen, wenn 'schritte'/'stand' geklärt sind (die liegen als
-- JSON IM Vorgang, brauchen keine eigene Policy).
--
-- select public.app_rls_loeschschutz('customers',             'adressen');
-- select public.app_rls_loeschschutz('customer_contacts',     'ansprechpartner');
-- select public.app_rls_loeschschutz('customer_links',        'verknuepfungen');
-- select public.app_rls_loeschschutz('customer_notes',        'notizen');
-- select public.app_rls_loeschschutz('machines',              'maschinen');
-- select public.app_rls_loeschschutz('manual_history_entries','historie');   -- (Probelauf, Block 2)
-- select public.app_rls_loeschschutz('service_entries',       'historie');   -- Serviceberichte in der Historie
-- select public.app_rls_loeschschutz('protocol_photos',       'historie');
-- select public.app_rls_loeschschutz('protocol_checkpoints',  'historie');
-- select public.app_rls_loeschschutz('accounting',            'buchungen');
-- select public.app_rls_loeschschutz('maintenance_events',    'termine');
-- select public.app_rls_loeschschutz('event_participants',    'termine');
-- select public.app_rls_loeschschutz('documents',             'dokumente');
-- select public.app_rls_loeschschutz('internal_processes',    'vorgaenge');
-- select public.app_rls_loeschschutz('subtasks',              'unteraufgaben');
-- select public.app_rls_loeschschutz('invoice_todos',         'rechnungen');
-- select public.app_rls_loeschschutz('rental_agreements',     'mietvereinbarungen');
-- select public.app_rls_loeschschutz('absences',              'abwesenheiten');
-- select public.app_rls_loeschschutz('users',                 'benutzer');
-- select public.app_rls_loeschschutz('tasks',                'aufgaben');
-- select public.app_rls_loeschschutz('intake_protocols',     'protokolle');
-- select public.app_rls_loeschschutz('acceptance_protocols', 'protokolle');
-- Ohne eigenen Bereich (nur Hauptschalter „Einträge löschen"):
-- select public.app_rls_loeschschutz('saved_routes');
-- select public.app_rls_loeschschutz('rental_templates');
-- select public.app_rls_loeschschutz('label_articles');
-- select public.app_rls_loeschschutz('task_quick_templates');
--
-- Alles auf einen Blick:  select * from public.app_rls_status;
