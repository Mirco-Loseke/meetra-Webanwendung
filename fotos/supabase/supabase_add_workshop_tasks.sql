-- Werkstatt-Liste: schnelle kleine Aufgaben, gemeinsam für alle sichtbar.
-- Einmalig im Supabase SQL-Editor ausführen.

create table if not exists public.workshop_tasks (
    id         uuid primary key default gen_random_uuid(),
    text       text not null,
    done       boolean not null default false,
    created_at timestamptz not null default now()
);

-- Zugriff erlauben (App nutzt eigene Anmeldung, nicht Supabase-Auth).
-- Ohne Policy scheitert das Einfügen mit "row-level security policy" (42501).
alter table public.workshop_tasks enable row level security;
create policy "workshop_tasks_all"
    on public.workshop_tasks
    for all
    using (true)
    with check (true);

-- Live-Aktualisierung für alle Clients (Fernseher) freischalten.
alter publication supabase_realtime add table public.workshop_tasks;

-- Kontrolle:
-- select * from public.workshop_tasks order by done, created_at;
