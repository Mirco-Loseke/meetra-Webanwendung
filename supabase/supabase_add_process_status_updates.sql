-- Aktueller Stand pro Vorgang: Verlauf aus {text, by, by_id, at}
-- Neuester Eintrag steht an Position 0.
ALTER TABLE internal_processes
  ADD COLUMN IF NOT EXISTS status_updates JSONB DEFAULT '[]'::jsonb;
