-- =========================================================
-- Abwesenheiten (Urlaub, Krank, Schulung)
-- =========================================================
-- Bis hierher wusste die App nicht, wann jemand gar nicht da ist: in der
-- Übersicht „Wer ist frei?" (Timeline) stand ein Kollege im Urlaub als
-- „frei". Diese Tabelle hält solche Zeiträume fest.
--
-- Einmal im Supabase SQL-Editor ausführen. Bis dahin funktioniert die App
-- weiter, die Übersicht zeigt dann nur keine Abwesenheiten.
-- =========================================================

create table if not exists public.absences (
    id          bigserial primary key,
    -- public.users.id ist bigint (nicht die uuid aus auth.users).
    user_id     bigint,
    user_name   text,                 -- Klartext, falls die ID mal fehlt
    von         date not null,
    bis         date not null,
    grund       text,                 -- "Urlaub", "Krank", "Schulung", …
    notiz       text,
    created_by  bigint,
    created_at  timestamptz not null default now()
);

create index if not exists absences_user_idx on public.absences (user_id);
create index if not exists absences_zeit_idx on public.absences (von, bis);

alter table public.absences enable row level security;

-- Die App arbeitet mit dem anon-Key und einer eigenen Benutzerverwaltung
-- (public.users) — wie bei den übrigen Tabellen dieses Projekts ist der
-- Zugriff deshalb nicht pro Datenbankrolle eingeschränkt.
drop policy if exists "absences_all" on public.absences;
create policy "absences_all" on public.absences
    for all using (true) with check (true);
