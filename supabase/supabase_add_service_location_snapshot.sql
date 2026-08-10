-- Per-Bericht-Snapshot des (evtl. abweichenden) Maschinenstandorts.
-- Behebt: Ein nur für einen Bericht eingegebener abweichender Standort wurde bisher in den
-- Maschinen-Stammsatz zurückgeschrieben und tauchte dadurch bei ALLEN Berichten der Maschine auf.
-- Der Standort gehört jetzt zum jeweiligen Bericht und wird hier gespeichert.
ALTER TABLE service_entries
    ADD COLUMN IF NOT EXISTS location_snapshot JSONB;
