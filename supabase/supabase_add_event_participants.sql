-- =========================================================
-- Termine mit Teilnehmern
-- =========================================================
-- Ergänzt die bestehenden Kalendereinträge (maintenance_events) um
-- Uhrzeit, Adressbezug und Ort und legt eine Tabelle für die
-- eingeladenen Kollegen an (Zusage / Absage).
--
-- Einmal im Supabase SQL-Editor ausführen. Bis dahin funktioniert die
-- App weiter, nur ohne Termine mit Teilnehmern.
-- =========================================================

-- 1) Zusatzfelder am Kalendereintrag ----------------------------------
alter table public.maintenance_events
    add column if not exists start_time      text,       -- "09:30", frei lassbar
    add column if not exists end_time        text,
    add column if not exists customer_id     uuid,     -- Adresse aus dem Adressbuch
    add column if not exists location_label  text;       -- Anschrift als Klartext

create index if not exists maintenance_events_customer_idx
    on public.maintenance_events (customer_id);

-- 2) Teilnehmer -------------------------------------------------------
create table if not exists public.event_participants (
    id            bigserial primary key,
    -- maintenance_events.id ist uuid (nachgesehen am 11.08.2026), die
    -- App-Nutzer in public.users haben dagegen bigint-IDs.
    event_id      uuid not null references public.maintenance_events (id) on delete cascade,
    user_id       bigint,                       -- public.users.id
    user_name     text,                         -- Klartext, falls die ID mal fehlt
    status        text not null default 'offen',-- offen | zugesagt | abgesagt
    responded_at  timestamptz,
    -- Wer eingeladen hat: dessen Benachrichtigung meldet die Antworten.
    invited_by      bigint,
    invited_by_name text,
    created_at    timestamptz not null default now()
);

create index if not exists event_participants_event_idx on public.event_participants (event_id);
create index if not exists event_participants_user_idx  on public.event_participants (user_id);
create index if not exists event_participants_resp_idx  on public.event_participants (responded_at);

-- Ein Kollege steht höchstens einmal an einem Termin.
create unique index if not exists event_participants_unique
    on public.event_participants (event_id, user_id);

alter table public.event_participants enable row level security;

-- Die App arbeitet mit dem anon-Key und einer eigenen Benutzerverwaltung
-- (public.users) — wie bei den übrigen Tabellen dieses Projekts ist der
-- Zugriff deshalb nicht pro Datenbankrolle eingeschränkt.
drop policy if exists "event_participants_all" on public.event_participants;
create policy "event_participants_all" on public.event_participants
    for all using (true) with check (true);
