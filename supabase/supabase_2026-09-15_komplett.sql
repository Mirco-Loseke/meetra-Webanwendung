-- =========================================================
-- MIGRATIONEN VOM 2026-09-15 — alles in einem Rutsch
-- =========================================================
-- Enthält (alle gefahrlos wiederholbar):
--   1. supabase_add_subtask_sort_order.sql  — Unteraufgaben: feste Reihenfolge
--   2. supabase_add_angebot_vorgang.sql     — Angebot = Vorgang (angebote.process_id)
-- Ausfuehren: Supabase → SQL Editor → komplett einfuegen → Run
-- =========================================================

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


-- =========================================================
-- ANGEBOTE ↔ VORGÄNGE: JEDES ANGEBOT IST EIN VORGANG
-- =========================================================
-- Zweck: Jedes Angebot aus der Angebotsliste bekommt automatisch einen
--        Vorgang (internal_processes, Typ „Angebot"). Der Vorgang ist der
--        EINZIGE Speicherort für Zuständigen, Stand, Adresse und Maschine —
--        die Angebotsliste zeigt und bearbeitet diese Werte über den
--        verknüpften Vorgang. Umgekehrt zeigt der Vorgang die reinen
--        Angebotsdaten (Status, VK, EK, Realisierbar) aus der Tabelle
--        angebote — auch die gibt es nur einmal.
--
-- Diese Spalte ist die Verbindung. Die App legt die Vorgänge beim
-- Öffnen der Angebotsliste für alle Angebote ohne Vorgang selbst an
-- (js/listen.js, angebotVorgaengeAnlegen) — es muss nichts von Hand
-- nachgetragen werden.
--
-- Die alte Spalte angebote.bemerkung bleibt bestehen; ihr Inhalt wandert
-- beim Anlegen des Vorgangs als erster Stand-Eintrag hinüber.
--
-- Gefahrlos wiederholbar (IF NOT EXISTS).
-- Ausfuehren: Supabase → SQL Editor → einfuegen → Run
-- =========================================================

alter table public.angebote
    add column if not exists process_id uuid references public.internal_processes(id) on delete set null;

create index if not exists idx_angebote_process_id on public.angebote (process_id);
