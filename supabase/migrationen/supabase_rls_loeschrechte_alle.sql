-- =============================================================================
--  RLS ABSCHLIESSEN: nur Angemeldete + Löschrechte je Bereich (Stand 2026-09-24)
-- =============================================================================
--  Befund vorher (pg_policies): 17 Tabellen hatten Policies für PUBLIC — lesbar
--  und änderbar mit dem öffentlichen anon-Schlüssel, der im Browser-Code steht,
--  also OHNE Anmeldung (u. a. customer_contacts, customer_notes, angebote,
--  rechnungen, rental_agreements, absences). Die übrigen waren schon
--  „allow_all_authenticated".
--
--  Nach diesem Skript gilt für JEDE Tabelle in public:
--    • nur angemeldete Nutzer (Rolle authenticated) — anon bekommt nichts
--    • Lesen / Anlegen / Ändern: erlaubt
--    • Löschen: je Bereich aus users.permissions (Tabellen in der Liste unten),
--      sonst erlaubt
--  Edge Functions (sage-sync, r2-sign, ki-proxy) und das Backup nutzen den
--  Server-Schlüssel bzw. postgres und sind von RLS nicht betroffen.
--
--  Voraussetzung: Block 1 aus supabase_add_rls_loeschrechte.sql (app_darf_loeschen,
--  users.is_admin). Gefahrlos wiederholbar.
--
--  BEWUSST OHNE Löschschutz (App löscht beim SPEICHERN und schreibt neu — mit
--  Schutz entstünden bei Nutzern ohne Recht still Doppelte):
--    subtasks, protocol_checkpoints, protocol_photos, event_participants
-- =============================================================================

-- 0) Hilfsfunktionen — immer „to authenticated"
create or replace function public.app_rls_loeschschutz(tabelle text, bereich text default null)
returns text
language plpgsql security definer
set search_path = public
as $$
declare pol record;
begin
    execute format('alter table public.%I enable row level security', tabelle);
    for pol in select policyname from pg_policies where schemaname = 'public' and tablename = tabelle loop
        execute format('drop policy if exists %I on public.%I', pol.policyname, tabelle);
    end loop;
    execute format('create policy %I on public.%I for select to authenticated using (true)', tabelle || '_lesen', tabelle);
    execute format('create policy %I on public.%I for insert to authenticated with check (true)', tabelle || '_anlegen', tabelle);
    execute format('create policy %I on public.%I for update to authenticated using (true) with check (true)', tabelle || '_aendern', tabelle);
    if bereich is null then
        execute format('create policy %I on public.%I for delete to authenticated using (public.app_darf_loeschen())', tabelle || '_loeschen', tabelle);
    else
        execute format('create policy %I on public.%I for delete to authenticated using (public.app_darf_loeschen(%L))', tabelle || '_loeschen', tabelle, bereich);
    end if;
    return 'Löschschutz aktiv: ' || tabelle || ' (Bereich ' || coalesce(bereich, '– nur Hauptschalter –') || ')';
end
$$;

-- Rückweg / „ohne Löschschutz": alles erlaubt, aber nur für Angemeldete
create or replace function public.app_rls_zuruecksetzen(tabelle text)
returns text
language plpgsql security definer
set search_path = public
as $$
declare pol record;
begin
    execute format('alter table public.%I enable row level security', tabelle);
    for pol in select policyname from pg_policies where schemaname = 'public' and tablename = tabelle loop
        execute format('drop policy if exists %I on public.%I', pol.policyname, tabelle);
    end loop;
    execute format('create policy %I on public.%I for all to authenticated using (true) with check (true)', tabelle || '_all', tabelle);
    return 'Ohne Löschschutz, nur Angemeldete: ' || tabelle;
end
$$;

-- Übersicht mit Rollen (neue Spalte → View neu anlegen)
drop view if exists public.app_rls_status;
create view public.app_rls_status as
    select tablename,
           bool_or(policyname like '%\_loeschen') as loeschschutz,
           bool_or('public' = any(roles::text[]) or 'anon' = any(roles::text[])) as offen_ohne_anmeldung,
           string_agg(policyname || ' [' || cmd || ' ' || array_to_string(roles, ',') || ']', ', ' order by policyname) as policies
      from pg_policies
     where schemaname = 'public'
     group by tablename;

-- 1) Löschschutz je Bereich
do $$
declare
    paar text[];
    liste text[][] := array[
        array['customers',             'adressen'],
        array['customer_contacts',     'ansprechpartner'],
        array['customer_links',        'verknuepfungen'],
        array['customer_notes',        'adress_historie'],
        array['machines',              'maschinen'],
        array['manual_history_entries','historie'],
        array['service_entries',       'historie'],
        array['intake_protocols',      'protokolle'],
        array['acceptance_protocols',  'protokolle'],
        array['accounting',            'buchungen'],
        array['categories',            'kategorien'],
        array['maintenance_events',    'termine'],
        array['documents',             'dokumente'],
        array['document_folders',      'ordner'],
        array['angebote',              'angebote'],
        array['angebot_notizen',       'notizen'],
        array['internal_processes',    'vorgaenge'],
        array['tasks',                 'aufgaben'],
        array['workshop_tasks',        'werkstatt'],
        array['invoice_todos',         'rechnungen'],
        array['rental_agreements',     'mietvereinbarungen'],
        array['absences',              'abwesenheiten'],
        array['users',                 'benutzer'],
        array['saved_routes',          ''],
        array['rental_templates',      ''],
        array['label_articles',        ''],
        array['task_quick_templates',  ''],
        array['task_subtask_templates',''],
        array['task_supergroups_templates','']
    ];
begin
    if to_regprocedure('public.app_darf_loeschen(text)') is null then
        raise exception 'Zuerst Block 1 aus supabase_add_rls_loeschrechte.sql ausführen.';
    end if;
    foreach paar slice 1 in array liste loop
        if to_regclass('public.' || paar[1]) is null then
            raise notice 'übersprungen (Tabelle fehlt): %', paar[1];
        else
            raise notice '%', public.app_rls_loeschschutz(paar[1], nullif(paar[2], ''));
        end if;
    end loop;
end $$;

-- 2) Alle übrigen Tabellen, die noch für PUBLIC/anon offen sind oder deren
--    Speicher-Tabellen-Schutz zurück muss → „alles erlaubt, nur Angemeldete"
do $$
declare t text;
begin
    for t in
        select distinct tablename from pg_policies
         where schemaname = 'public'
           and (('public' = any(roles::text[]) or 'anon' = any(roles::text[]))
                or (tablename in ('subtasks','protocol_checkpoints','protocol_photos','event_participants')
                    and policyname like '%\_loeschen'))
    loop
        raise notice '%', public.app_rls_zuruecksetzen(t);
    end loop;
end $$;

-- 2b) Tabellen ganz OHNE RLS sind über die API für jeden offen → einschalten,
--     nur Angemeldete. Systemtabellen, die uns nicht gehören, werden übersprungen.
do $$
declare t text;
begin
    for t in select tablename from pg_tables where schemaname = 'public' and not rowsecurity loop
        begin
            raise notice '%', public.app_rls_zuruecksetzen(t);
        exception when others then
            raise notice 'übersprungen (%): %', t, sqlerrm;
        end;
    end loop;
end $$;

-- Tabellen ohne RLS (sollte leer sein)
select tablename as ohne_rls from pg_tables where schemaname = 'public' and not rowsecurity;

-- 3) Kontrolle: offen_ohne_anmeldung muss überall false sein
select * from public.app_rls_status order by offen_ohne_anmeldung desc, loeschschutz desc, tablename;
