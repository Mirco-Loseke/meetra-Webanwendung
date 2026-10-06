-- Persönliche To-do-Liste (Knopf neben dem KI-Chat, js/todo-liste.js)
-- Eine Zeile je Benutzer, Einträge als JSONB. Gefüllt aus dem KI-Briefing
-- („Als To-do übernehmen"); Vorgänge, Termine, Adressen werden dort direkt bearbeitet.
-- (2026-10-02)

create table if not exists public.todo_listen (
    user_id    text primary key,
    eintraege  jsonb not null default '[]'::jsonb,
    updated_at timestamptz not null default now()
);

-- App nutzt eigene Anmeldung (public.users) — Zugriff wie bei den übrigen Tabellen.
alter table public.todo_listen enable row level security;
drop policy if exists "todo_listen_all" on public.todo_listen;
create policy "todo_listen_all" on public.todo_listen
    for all using (true) with check (true);
