-- ==========================================================
-- VERALTET — NICHT MEHR EINZELN AUSFUEHREN.
-- Diese Datei setzt uuid-Schluessel voraus. In dieser Datenbank ist
-- categories.id bigint; das Einspielen scheitert dann mit
--   "Key columns are of incompatible types: uuid and bigint".
--
-- Stattdessen: supabase/supabase_mietvereinbarung_komplett.sql
-- Die liest die tatsaechlichen Typen aus und legt alles passend an.
-- Diese Datei bleibt nur zur Nachvollziehbarkeit liegen.
-- ==========================================================

-- ==========================================================
-- Vorlagen für Mietvereinbarungen
-- ----------------------------------------------------------
-- Je Maschinenkategorie (Siebtrommel, Brecher, …) eine Vorlage:
-- Beschriftungen, Prüfspalten, Baugruppen, Fotopositionen und
-- Vertragstext stehen zusammen in "config".
--
-- Ohne diese Tabelle arbeitet die App mit der eingebauten
-- Standardvorlage weiter; gespeichert werden kann dann nichts.
--
-- Achtung: categories.id ist uuid — category_id muss es auch sein.
-- ==========================================================

create table if not exists public.rental_templates (
    id          uuid primary key default gen_random_uuid(),
    name        text not null,
    category_id uuid references public.categories (id) on delete cascade,
    config      jsonb not null default '{}'::jsonb,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

-- Je Kategorie höchstens eine Vorlage.
create unique index if not exists rental_templates_category_uidx
    on public.rental_templates (category_id);

alter table public.rental_templates enable row level security;

drop policy if exists "rental_templates_all" on public.rental_templates;
create policy "rental_templates_all"
    on public.rental_templates
    for all
    using (true)
    with check (true);

-- updated_at mitführen
create or replace function public.rental_templates_touch()
returns trigger language plpgsql as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists rental_templates_touch on public.rental_templates;
create trigger rental_templates_touch
    before update on public.rental_templates
    for each row execute function public.rental_templates_touch();
