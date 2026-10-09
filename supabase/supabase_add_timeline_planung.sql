-- =========================================================
-- Timeline: geplante Vermietungen, Vorführungen, Aufbereitung
-- =========================================================
-- Knopf „+ Vermietung" in der Timeline (Voreinstellung Vermietflotte).
-- Keine Mietvereinbarung (kein Bogen, kein PDF) — nur die Planung:
-- Kunde, Maschine, Zeitraum, „noch nicht bestätigt" (gestrichelt) und
-- die Aufbereitung/Instandsetzung danach in Stunden oder Tagen (grau).
--
-- Einmal im Supabase SQL-Editor ausführen. Schlüsseltypen werden aus
-- customers.id / machines.id gelesen (siehe MIGRATIONEN.md).
-- =========================================================

do $$
declare
    typ_kunde   text;
    typ_maschine text;
begin
    select data_type into typ_kunde from information_schema.columns
     where table_schema = 'public' and table_name = 'customers' and column_name = 'id';
    select data_type into typ_maschine from information_schema.columns
     where table_schema = 'public' and table_name = 'machines' and column_name = 'id';

    execute format($f$
        create table if not exists public.timeline_planung (
            id                    bigserial primary key,
            art                   text not null default 'miete',   -- miete | vorfuehrung | aufbereitung
            machine_id            %s references public.machines(id) on delete cascade,
            customer_id           %s references public.customers(id) on delete set null,
            kunde_name            text,
            von                   date not null,
            bis                   date not null,
            unsicher              boolean not null default false,  -- noch nicht bestätigt
            aufbereitung_wert     numeric,                         -- Aufbereitung danach
            aufbereitung_einheit  text default 'd',                -- 'h' | 'd'
            notiz                 text,
            created_by            bigint,
            created_at            timestamptz not null default now()
        )$f$, coalesce(typ_maschine, 'bigint'), coalesce(typ_kunde, 'uuid'));
end $$;

create index if not exists timeline_planung_zeit_idx on public.timeline_planung (von, bis);
create index if not exists timeline_planung_machine_idx on public.timeline_planung (machine_id);

alter table public.timeline_planung enable row level security;
drop policy if exists "timeline_planung_all" on public.timeline_planung;
create policy "timeline_planung_all" on public.timeline_planung
    for all using (true) with check (true);
