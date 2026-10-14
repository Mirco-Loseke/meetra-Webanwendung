-- Dokumente an einer geplanten Vermietung (Timeline → Vermietung → „Dokumente“).
-- Je Datei { name, url, path, type } — die Dateien selbst liegen in R2.
-- Beim „In Mietvereinbarung übernehmen“ werden sie zu Anlagen des Vertrags.
alter table public.timeline_planung
    add column if not exists dateien jsonb not null default '[]'::jsonb;
