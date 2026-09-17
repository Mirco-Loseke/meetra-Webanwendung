-- =====================================================================
-- Serviceberichte: Kennzeichen „vom Kunden unterschrieben" (2026-09-16)
-- =====================================================================
-- Die Liste der Serviceberichte lädt bewusst schlanke Spalten — das
-- Unterschriftsbild (customer_signature, Base64, oft 30–80 KB je Bericht)
-- gehört nicht dazu. Dadurch war in der Übersicht nicht zu sehen, ob ein
-- Kunde schon unterschrieben hat. Diese generierte Spalte liefert nur
-- ja/nein und wird von der Datenbank automatisch aktuell gehalten.
-- Einmalig im Supabase SQL-Editor ausführen.
-- =====================================================================

alter table public.service_entries
    add column if not exists customer_signed boolean
    generated always as (customer_signature is not null and customer_signature <> '') stored;

alter table public.service_entries
    add column if not exists tech_signed boolean
    generated always as (tech_signature is not null and tech_signature <> '') stored;
