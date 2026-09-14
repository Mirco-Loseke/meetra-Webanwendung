-- =========================================================
-- UNTERAUFGABEN PLANBAR MACHEN
-- =========================================================
-- Zweck: Unteraufgaben bekommen einen eigenen Zeitraum und eine
--        eigene Zuordnung an eine oder mehrere Personen.
--
-- Bisher hatte `subtasks` nur: id, task_id, title, status, created_at.
-- Dadurch konnte eine Unteraufgabe in der Timeline keinen eigenen
-- Balken haben — sie erbte den Zeitraum ihrer Aufgabe.
--
-- Die Spaltennamen sind bewusst dieselben wie in `tasks`
-- (start_date / end_date / assigned_to), damit beide Tabellen
-- gleich gelesen und geschrieben werden koennen.
--
-- Gefahrlos wiederholbar: alles mit IF NOT EXISTS.
-- Bestehende Zeilen bleiben unveraendert (Werte NULL bzw. '{}').
--
-- Ausfuehren: Supabase → SQL Editor → einfuegen → Run
-- =========================================================

-- 1. Zeitraum ------------------------------------------------
-- Beide Felder duerfen leer bleiben. Nur Start gesetzt heisst
-- "an diesem Tag", Start + Ende heisst "ueber diesen Zeitraum"
-- (z. B. Lackieren ueber drei Tage).
alter table public.subtasks
    add column if not exists start_date timestamptz;

alter table public.subtasks
    add column if not exists end_date timestamptz;

-- 2. Zuordnung an Personen -----------------------------------
-- Mehrfachzuordnung wie bei tasks.assigned_to: ein Array von
-- users.id. Leeres Array = niemandem zugewiesen.
alter table public.subtasks
    add column if not exists assigned_to bigint[] default '{}'::bigint[];

-- 3. Geschaetzter Aufwand (optional) --------------------------
-- Fuer die Auslastungsanzeige je Monteur. Gleicher Typ wie
-- tasks.expected_time.
alter table public.subtasks
    add column if not exists expected_time interval;

-- 4. Indizes --------------------------------------------------
-- Die Timeline fragt "alle Unteraufgaben in einem Zeitraum" ab.
create index if not exists subtasks_start_date_idx
    on public.subtasks (start_date);

create index if not exists subtasks_task_id_idx
    on public.subtasks (task_id);

-- 5. Kontrolle ------------------------------------------------
-- Nach dem Ausfuehren sollte diese Abfrage die vier neuen
-- Spalten zeigen:
--
-- select column_name, data_type
--   from information_schema.columns
--  where table_name = 'subtasks'
--  order by ordinal_position;
--
-- Und so sieht man, was schon geplant ist:
--
-- select s.title, s.start_date, s.end_date, s.assigned_to, t.title as aufgabe
--   from public.subtasks s
--   join public.tasks t on t.id = s.task_id
--  where s.start_date is not null
--  order by s.start_date;

-- =========================================================
-- ZURUECKNEHMEN (nur falls gewuenscht — loescht die Planung!)
-- =========================================================
-- alter table public.subtasks drop column if exists start_date;
-- alter table public.subtasks drop column if exists end_date;
-- alter table public.subtasks drop column if exists assigned_to;
-- alter table public.subtasks drop column if exists expected_time;
-- drop index if exists subtasks_start_date_idx;
