-- Vorgänge (internal_processes) für Supabase Realtime freischalten,
-- damit alle geöffneten Clients Änderungen sofort ohne Neuladen sehen.
-- Einmalig im Supabase SQL-Editor ausführen.

alter publication supabase_realtime add table public.internal_processes;

-- Kontrolle: sollte internal_processes (neben service_entries, machines) auflisten
-- select tablename from pg_publication_tables where pubname = 'supabase_realtime';
