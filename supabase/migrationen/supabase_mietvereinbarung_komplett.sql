-- ==========================================================
-- MIETVEREINBARUNG — ALLES IN EINEM
-- ----------------------------------------------------------
-- Legt an:
--   1) rental_templates            — die Vorlagen des Bogens
--   2) rental_templates.category_ids — eine Vorlage für mehrere Kategorien
--   3) rental_agreements           — die gespeicherten Mietvereinbarungen
--   4) documents.rental_agreement_id + documents.attachments
--
-- Mehrfach ausführbar: alles "if not exists" bzw. "create or replace".
-- Im Dashboard: SQL Editor → New query → einfügen → Run.
--
-- ----------------------------------------------------------
-- WARUM DAS SO UMSTÄNDLICH AUSSIEHT
-- ----------------------------------------------------------
-- Die Schlüsseltypen sind in dieser Datenbank nicht einheitlich:
-- categories.id, machines.id und customers.id können je nach
-- Entstehungszeit uuid ODER bigint sein. Ein fest verdrahtetes
-- "category_id uuid" scheitert dann mit
--   "Key columns ... are of incompatible types: uuid and bigint".
--
-- Deshalb werden die Spalten hier in genau dem Typ angelegt, den die
-- Zieltabelle tatsächlich hat — abgelesen aus information_schema.
-- Nichts raten, nichts hart eintragen.
-- ==========================================================

do $$
declare
    kat_typ      text;   -- Typ von categories.id
    masch_typ    text;   -- Typ von machines.id
    kunde_typ    text;   -- Typ von customers.id
    vorhanden    text;   -- Typ einer bereits bestehenden Spalte
begin
    select data_type into kat_typ
      from information_schema.columns
     where table_schema = 'public' and table_name = 'categories' and column_name = 'id';

    select data_type into masch_typ
      from information_schema.columns
     where table_schema = 'public' and table_name = 'machines' and column_name = 'id';

    select data_type into kunde_typ
      from information_schema.columns
     where table_schema = 'public' and table_name = 'customers' and column_name = 'id';

    if kat_typ is null then
        raise exception 'Tabelle public.categories nicht gefunden — bitte zuerst das Grundschema einspielen.';
    end if;

    raise notice 'Erkannte Typen: categories.id=%, machines.id=%, customers.id=%',
        kat_typ, coalesce(masch_typ, 'fehlt'), coalesce(kunde_typ, 'fehlt');

    -- ======================================================
    -- 1) VORLAGEN
    -- ------------------------------------------------------
    -- Beschriftungen, Prüfspalten, Baugruppen, Fotopositionen und
    -- Vertragstext stehen zusammen in "config". Ohne diese Tabelle
    -- arbeitet die App mit der eingebauten Standardvorlage weiter,
    -- speichern lässt sich dann aber nichts.
    -- ======================================================
    execute format($f$
        create table if not exists public.rental_templates (
            id          uuid primary key default gen_random_uuid(),
            name        text not null,
            category_id %s references public.categories (id) on delete cascade,
            config      jsonb not null default '{}'::jsonb,
            created_at  timestamptz not null default now(),
            updated_at  timestamptz not null default now()
        )$f$, kat_typ);

    -- ======================================================
    -- 2) EINE VORLAGE FÜR MEHRERE MASCHINENKATEGORIEN
    -- ------------------------------------------------------
    -- z.B. "Selbstfahrender Umsetzer" UND "Gezogener Umsetzer".
    -- category_id bleibt als Altbestand stehen (erste Kategorie),
    -- maßgeblich ist category_ids.
    -- ======================================================
    execute format($f$
        alter table public.rental_templates
            add column if not exists category_ids %s[] not null default '{}'::%s[]
    $f$, kat_typ, kat_typ);

    update public.rental_templates
       set category_ids = array[category_id]
     where category_id is not null
       and (category_ids is null or cardinality(category_ids) = 0);

    -- Der frühere eindeutige Index auf category_id muss weg: sonst
    -- dürfte es nur eine einzige Vorlage ohne Zuordnung geben.
    drop index if exists public.rental_templates_category_uidx;

    create index if not exists rental_templates_category_ids_idx
        on public.rental_templates using gin (category_ids);

    -- ======================================================
    -- 3) GESPEICHERTE MIETVEREINBARUNGEN
    -- ------------------------------------------------------
    --   data   — die Eingaben des Bogens
    --   photos — [{phase, position, url, path}] der Fotos in R2
    --   pdf_*  — das erzeugte PDF in Cloudflare R2
    --
    -- Ablage in R2 (dieselbe Ordnerstruktur wie bei Serviceberichten):
    --   Maschinen/<id>_<Hersteller>_<Name>_<Serie>_Baujahr_<Jahr>/
    --       mietvereinbarungen/<datei>.pdf
    --       mietvereinbarungen/fotos/<phase>-<position>-<zeit>.jpg
    -- ======================================================
    execute format($f$
        create table if not exists public.rental_agreements (
            id            uuid primary key default gen_random_uuid(),
            machine_id    %s,
            customer_id   %s,
            title         text,
            data          jsonb not null default '{}'::jsonb,
            photos        jsonb not null default '[]'::jsonb,
            pdf_url       text,
            pdf_path      text,
            folder_path   text,
            user_id       text,
            created_at    timestamptz not null default now(),
            updated_at    timestamptz not null default now()
        )$f$, coalesce(masch_typ, 'bigint'), coalesce(kunde_typ, 'uuid'));

    -- Fremdschlüssel getrennt, damit die Tabelle auch dann entsteht,
    -- wenn eine der Zieltabellen (noch) fehlt.
    if masch_typ is not null
       and not exists (select 1 from pg_constraint where conname = 'rental_agreements_machine_fk') then
        alter table public.rental_agreements
            add constraint rental_agreements_machine_fk
            foreign key (machine_id) references public.machines (id) on delete set null;
    end if;

    if kunde_typ is not null
       and not exists (select 1 from pg_constraint where conname = 'rental_agreements_customer_fk') then
        alter table public.rental_agreements
            add constraint rental_agreements_customer_fk
            foreign key (customer_id) references public.customers (id) on delete set null;
    end if;

    create index if not exists rental_agreements_machine_idx
        on public.rental_agreements (machine_id);

    -- ======================================================
    -- 4) DOKUMENTE: VERKNÜPFUNG UND ANHÄNGE
    -- ------------------------------------------------------
    -- rental_agreement_id verbindet das PDF unter "Dokumente" mit der
    -- Mietvereinbarung — darüber werden beim Löschen auch die Fotos in
    -- R2 gefunden. attachments hält die Bilder eines Dokuments
    -- ([{name, url, path}]) für die Anhänge-Anzeige auf der Kachel;
    -- das nutzen Serviceberichte UND Mietvereinbarungen.
    -- ======================================================
    alter table public.documents
        add column if not exists rental_agreement_id uuid;

    select data_type into vorhanden
      from information_schema.columns
     where table_schema = 'public' and table_name = 'documents' and column_name = 'rental_agreement_id';

    if vorhanden = 'uuid'
       and not exists (select 1 from pg_constraint where conname = 'documents_rental_agreement_fk') then
        alter table public.documents
            add constraint documents_rental_agreement_fk
            foreign key (rental_agreement_id) references public.rental_agreements (id) on delete set null;
    end if;

    alter table public.documents
        add column if not exists attachments jsonb not null default '[]'::jsonb;
end $$;


-- ==========================================================
-- Zugriffsregeln (RLS) — außerhalb des Blocks, damit sie auch
-- beim erneuten Einspielen sauber ersetzt werden.
-- ==========================================================
alter table public.rental_templates  enable row level security;
alter table public.rental_agreements enable row level security;

drop policy if exists "rental_templates_all" on public.rental_templates;
create policy "rental_templates_all"
    on public.rental_templates for all using (true) with check (true);

drop policy if exists "rental_agreements_all" on public.rental_agreements;
create policy "rental_agreements_all"
    on public.rental_agreements for all using (true) with check (true);


-- ==========================================================
-- updated_at automatisch mitführen
-- ==========================================================
create or replace function public.rental_touch()
returns trigger language plpgsql as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists rental_templates_touch on public.rental_templates;
create trigger rental_templates_touch
    before update on public.rental_templates
    for each row execute function public.rental_touch();

drop trigger if exists rental_agreements_touch on public.rental_agreements;
create trigger rental_agreements_touch
    before update on public.rental_agreements
    for each row execute function public.rental_touch();


-- ==========================================================
-- Kurzprobe (darf jederzeit einzeln ausgeführt werden):
--
--   select column_name, data_type
--     from information_schema.columns
--    where table_name in ('rental_templates', 'rental_agreements')
--    order by table_name, ordinal_position;
--
--   select column_name from information_schema.columns
--    where table_name = 'documents'
--      and column_name in ('attachments', 'rental_agreement_id');
-- ==========================================================
