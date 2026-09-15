-- =========================================================
-- UNTERAUFGABEN: FESTE REIHENFOLGE
-- =========================================================
-- Zweck: Unteraufgaben lassen sich auf der Aufgabentafel per Ziehen
--        an eine andere Stelle schieben — in eine andere Übergruppe
--        oder eine andere Aufgabe. Dafür braucht jede Zeile eine
--        Position, sonst ist die Reihenfolge nur die Einfügereihenfolge
--        und nach dem Verschieben wieder weg.
--
-- Ohne diese Spalte läuft die App weiter (sie lässt das Feld beim
-- Schreiben weg), aber die Reihenfolge nach dem Verschieben hält nicht.
--
-- Gefahrlos wiederholbar: IF NOT EXISTS, bestehende Zeilen bekommen
-- ihre bisherige Reihenfolge (created_at) als Position.
--
-- Ausfuehren: Supabase → SQL Editor → einfuegen → Run
-- =========================================================

alter table public.subtasks
    add column if not exists sort_order integer;

-- Bestehende Zeilen: Reihenfolge je Aufgabe aus created_at übernehmen.
update public.subtasks s
   set sort_order = n.pos
  from (select id, row_number() over (partition by task_id order by created_at, id) - 1 as pos
          from public.subtasks) n
 where s.id = n.id
   and s.sort_order is null;

create index if not exists subtasks_task_sort_idx
    on public.subtasks (task_id, sort_order);
