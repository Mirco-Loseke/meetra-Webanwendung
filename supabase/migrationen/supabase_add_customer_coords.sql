-- Routenplanung: Koordinaten-Cache pro Kunde/Adresse.
-- lat/lng werden einmalig per OpenStreetMap (Nominatim) geocodiert und hier gespeichert,
-- damit die Umkreissuche auf der Routenplanung-Seite sofort funktioniert statt bei jedem
-- Öffnen alle Adressen neu aufzulösen. geocoded_address merkt sich, für WELCHE Adresse die
-- Koordinaten gelten — ändert sich die Adresse des Kunden, wird automatisch neu geocodiert.
-- In Supabase (SQL Editor) einmalig ausführen. (Analog zu supabase_add_machine_coords.sql)

ALTER TABLE customers ADD COLUMN IF NOT EXISTS lat double precision;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS lng double precision;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS geocoded_address text;
