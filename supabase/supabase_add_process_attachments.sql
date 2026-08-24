-- ============================================================================
--  Dokumente an Vorgaengen und einzelnen Schritten
-- ============================================================================
--  Die Dateien selbst liegen in Cloudflare R2 unter
--      vorgaenge/<vorgang-id>/<zeitstempel>-<dateiname>
--  Hier stehen nur die Verweise darauf:
--      { id, name, url, path, size, type, at, by, step_id }
--
--  step_id = null  -> Dokument haengt am VORGANG
--  step_id = "..." -> Dokument haengt an genau DIESEM Schritt
--
--  Bewusst EINE gemeinsame Liste, statt Dateien in steps[] zu verschachteln:
--  die Schritte werden beim Sortieren, Abhaken und Textaendern komplett neu
--  geschrieben — verschachtelte Dateien gingen dabei leicht verloren.
--
--  Einmal im Supabase SQL-Editor ausfuehren, wiederholbar.
-- ============================================================================

ALTER TABLE public.internal_processes
    ADD COLUMN IF NOT EXISTS attachments jsonb DEFAULT '[]'::jsonb;

-- Kontrolle:
--   select id, title, jsonb_array_length(coalesce(attachments,'[]'::jsonb)) as dateien
--   from public.internal_processes
--   where jsonb_array_length(coalesce(attachments,'[]'::jsonb)) > 0;
