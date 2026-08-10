-- Status-Verlauf pro internem Vorgang: Liste von Einträgen
-- [{ text, user, user_id, at (ISO-Zeitstempel) }, ...]
ALTER TABLE internal_processes
    ADD COLUMN IF NOT EXISTS status_log JSONB DEFAULT '[]'::jsonb;
