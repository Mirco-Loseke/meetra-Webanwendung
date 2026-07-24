-- Schritte (Checkliste) pro internem Vorgang
-- Struktur je Element: { "id": "st_xxx", "text": "Transport anfragen", "done": false }
ALTER TABLE internal_processes
  ADD COLUMN IF NOT EXISTS steps JSONB NOT NULL DEFAULT '[]'::jsonb;
