-- Filter-Katalog: passende Filter je Motortyp / Hersteller / Maschinentyp mit OEM- und Alternativnummern und Wechselintervall.
-- Gepflegt in Einstellungen -> Filter, angezeigt in der Maschinen-Zentrale (Reiter "Filter").
-- Mehrfaches Ausführen ist unschädlich.
create table if not exists public.machine_filters (
    id uuid primary key default gen_random_uuid(),
    bezeichnung text not null,
    art text,
    oem_nr text,
    alternativen jsonb not null default '[]'::jsonb,   -- Liste von Texten, z. B. ["Mann W 719/30","Hengst H17W"]
    intervall_stunden integer,
    intervall_monate integer,
    motor_typen jsonb not null default '[]'::jsonb,    -- Liste von Motortypen, z. B. ["Deutz TCD 2012"]
    hersteller text,
    maschinentyp text,
    menge text,
    notiz text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.machine_filters enable row level security;
drop policy if exists "machine_filters_all" on public.machine_filters;
create policy "machine_filters_all" on public.machine_filters
    for all using (true) with check (true);
