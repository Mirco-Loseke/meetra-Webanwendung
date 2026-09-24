-- =====================================================================
-- Rechnungsbelege aus Sage 100 — Reiter „Belege" an der Adresse
-- =====================================================================
-- Befüllt nur der Sage-Abgleich (tools/sage-sync.ps1 → Edge Function
-- sage-sync): Rechnung, Direktrechnung, Stornorechnung, Gutschrift ab 2023.
-- Eindeutig über sage_bel_id (interne Sage-Nummer, wiederholt sich nie —
-- die Belegnummer beginnt jedes Jahr neu). Storno/Gutschrift mit Minus-Beträgen.
-- In der App änderbar ist nur die Notiz.
-- Einmalig im Supabase SQL-Editor ausführen.
-- =====================================================================

create table if not exists public.rechnungen (
    id              bigint generated always as identity primary key,
    sage_bel_id     integer not null unique,
    belegart        text not null,
    belegnummer     text not null,
    belegjahr       integer,
    belegdatum      date,
    address_number  text,
    customer_id     uuid references public.customers(id) on delete set null,
    kundenmatchcode text,
    netto           numeric(14,2),
    mwst            numeric(14,2),
    brutto          numeric(14,2),
    notiz           text,
    aktualisiert_am timestamptz not null default now()
);

create index if not exists rechnungen_customer_idx on public.rechnungen (customer_id, belegdatum desc);

-- App nutzt eigene Anmeldung (public.users) — Zugriff wie bei den übrigen Tabellen.
-- Wer den Reiter sieht, regelt permissions.belege in der Benutzerverwaltung.
alter table public.rechnungen enable row level security;
drop policy if exists "rechnungen_all" on public.rechnungen;
create policy "rechnungen_all" on public.rechnungen
    for all using (true) with check (true);
