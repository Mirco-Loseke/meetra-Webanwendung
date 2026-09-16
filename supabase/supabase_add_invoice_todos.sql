-- =====================================================================
-- Rechnungsliste — „wem muss noch eine Rechnung geschrieben werden"
-- =====================================================================
-- Ausklappbare Liste rechts in der Vorgänge-Ansicht (js/rechnungsliste.js).
-- Text eintippen + Enter = Eintrag, Haken = erledigt. Live bei allen
-- Nutzern (Realtime). Wer die Liste sehen darf, steht in der
-- Benutzerverwaltung (permissions.rechnungsliste).
-- Einmalig im Supabase SQL-Editor ausführen.
-- =====================================================================

create table if not exists public.invoice_todos (
    id          uuid primary key default gen_random_uuid(),
    text        text not null,
    done        boolean not null default false,
    done_at     timestamptz,
    done_by     text,                       -- Name, wer abgehakt hat
    created_by  text,                       -- Name, wer eingetragen hat
    created_at  timestamptz not null default now()
);

create index if not exists invoice_todos_done_idx on public.invoice_todos (done, created_at);

-- App nutzt eigene Anmeldung (public.users) — Zugriff wie bei den übrigen Tabellen.
alter table public.invoice_todos enable row level security;
drop policy if exists "invoice_todos_all" on public.invoice_todos;
create policy "invoice_todos_all" on public.invoice_todos
    for all using (true) with check (true);

-- Live-Aktualisierung für alle Clients.
alter publication supabase_realtime add table public.invoice_todos;
