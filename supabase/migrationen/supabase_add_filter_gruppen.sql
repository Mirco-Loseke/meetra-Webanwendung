-- Filter-Katalog: Gruppe (z. B. Motor, Luftfilter, Riemen) und Reihenfolge je Filter. Ohne Gruppe wird sie aus "art" abgeleitet.
-- Mehrfaches Ausführen ist unschädlich.
alter table public.machine_filters add column if not exists gruppe text;
alter table public.machine_filters add column if not exists sortierung integer;
