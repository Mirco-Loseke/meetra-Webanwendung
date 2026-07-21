-- Routenplaner mit Umkreissuche: Koordinaten-Cache pro Maschine.
-- lat/lng werden einmalig per OpenStreetMap (Nominatim) geocodiert und hier gespeichert,
-- damit die Umkreissuche sofort funktioniert statt bei jedem Öffnen alle Adressen neu
-- aufzulösen. geocoded_address merkt sich, für WELCHE Adresse die Koordinaten gelten —
-- ändert sich die Adresse der Maschine, wird automatisch neu geocodiert.
-- In Supabase (SQL Editor) einmalig ausführen.

ALTER TABLE machines ADD COLUMN IF NOT EXISTS lat double precision;
ALTER TABLE machines ADD COLUMN IF NOT EXISTS lng double precision;
ALTER TABLE machines ADD COLUMN IF NOT EXISTS geocoded_address text;
