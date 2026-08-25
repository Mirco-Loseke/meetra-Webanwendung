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
-- Mietvereinbarungen speichern
-- ----------------------------------------------------------
-- Eine gespeicherte Mietvereinbarung besteht aus:
--   * den Eingaben des Bogens        -> data (jsonb)
--   * den Fotos beider Phasen        -> photos (jsonb: [{phase, position, url, path}])
--   * dem erzeugten PDF              -> pdf_url / pdf_path (Cloudflare R2)
--
-- Ablage in R2 (Ordnerstruktur wie bei den Serviceberichten):
--   Maschinen/<id>_<Hersteller>_<Name>_<Serie>_Baujahr_<Jahr>/
--       mietvereinbarungen/<dateiname>.pdf
--       mietvereinbarungen/fotos/<phase>-<position>-<zeit>.jpg
--
-- customer_id ist uuid (customers.id) — niemals bigint.
-- ==========================================================

create table if not exists public.rental_agreements (
    id            uuid primary key default gen_random_uuid(),
    machine_id    bigint references public.machines (id) on delete set null,
    customer_id   uuid   references public.customers (id) on delete set null,
    title         text,
    data          jsonb not null default '{}'::jsonb,
    photos        jsonb not null default '[]'::jsonb,
    pdf_url       text,
    pdf_path      text,
    folder_path   text,
    user_id       text,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

create index if not exists rental_agreements_machine_idx
    on public.rental_agreements (machine_id);

alter table public.rental_agreements enable row level security;

drop policy if exists "rental_agreements_all" on public.rental_agreements;
create policy "rental_agreements_all"
    on public.rental_agreements
    for all
    using (true)
    with check (true);

create or replace function public.rental_agreements_touch()
returns trigger language plpgsql as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists rental_agreements_touch on public.rental_agreements;
create trigger rental_agreements_touch
    before update on public.rental_agreements
    for each row execute function public.rental_agreements_touch();

-- ----------------------------------------------------------
-- Dokumente: Verknüpfung + Anhänge
-- ----------------------------------------------------------
-- rental_agreement_id verknüpft das PDF unter "Dokumente" mit der
-- Mietvereinbarung — beim Löschen des Dokuments werden dadurch auch
-- die Fotos in R2 gefunden und entfernt.
--
-- attachments hält die Bilder, die an einem Dokument hängen
-- ([{name, url, path}]), damit die Kachel unter "Dokumente" die
-- Anzahl anzeigen und die Bilder öffnen kann, ohne dafür jedes Mal
-- Serviceberichte bzw. Mietvereinbarungen nachzuladen.
alter table public.documents
    add column if not exists rental_agreement_id uuid
        references public.rental_agreements (id) on delete set null;

alter table public.documents
    add column if not exists attachments jsonb not null default '[]'::jsonb;
