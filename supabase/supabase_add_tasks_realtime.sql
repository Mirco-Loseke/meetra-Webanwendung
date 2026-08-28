-- Aufgaben (tasks) und Unteraufgaben (subtasks) für Supabase Realtime
-- freischalten, damit alle geöffneten Clients Änderungen sofort ohne Neuladen
-- sehen — vor allem die Anzeigetafel auf dem Fernseher in der Werkstatt.
-- Einmalig im Supabase SQL-Editor ausführen.

alter publication supabase_realtime add table public.tasks;
alter publication supabase_realtime add table public.subtasks;

-- Kontrolle: sollte tasks und subtasks auflisten (neben service_entries,
-- machines, internal_processes, workshop_tasks …)
-- select tablename from pg_publication_tables where pubname = 'supabase_realtime';
