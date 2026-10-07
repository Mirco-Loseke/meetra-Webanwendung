-- Foto-Eingang (2026-10-07)
-- Handys ohne Anmeldung (Werkstatt) laden Fotos über die Edge Function
-- `foto-eingang` hoch. Jedes Handy hat einen eigenen Schlüssel (foto_geraete),
-- einzeln sperrbar. Die Fotos landen in foto_eingang und werden in der App
-- (Ansicht „Foto-Eingang") einer Maschine, Adresse, einem Bericht oder Vorgang zugeordnet.

create table if not exists public.foto_geraete (
    id              uuid primary key default gen_random_uuid(),
    name            text not null,
    schluessel      text not null unique,
    gesperrt        boolean not null default false,
    created_at      timestamptz not null default now(),
    created_by      text,
    letzte_nutzung  timestamptz
);

create table if not exists public.foto_eingang (
    id              uuid primary key default gen_random_uuid(),
    geraet_id       uuid references public.foto_geraete(id) on delete set null,
    absender        text,
    notiz           text,
    url             text not null,
    pfad            text not null,
    dateiname       text,
    typ             text,
    groesse         integer,
    created_at      timestamptz not null default now(),
    zugeordnet_am   timestamptz,
    zugeordnet_von  text,
    zugeordnet_typ  text,      -- 'maschine' | 'adresse' | 'servicebericht' | 'vorgang'
    zugeordnet_id   text,
    zugeordnet_text text
);

create index if not exists foto_eingang_offen_idx on public.foto_eingang (created_at desc) where zugeordnet_am is null;

alter table public.foto_geraete enable row level security;
alter table public.foto_eingang enable row level security;

drop policy if exists foto_geraete_angemeldet on public.foto_geraete;
create policy foto_geraete_angemeldet on public.foto_geraete
    for all to authenticated using (true) with check (true);

drop policy if exists foto_eingang_angemeldet on public.foto_eingang;
create policy foto_eingang_angemeldet on public.foto_eingang
    for all to authenticated using (true) with check (true);

-- Live-Zähler in der Seitenleiste
do $$ begin
    alter publication supabase_realtime add table public.foto_eingang;
exception when duplicate_object then null; end $$;
