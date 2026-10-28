-- Positionen der Sage-Werkstattaufträge (Belegart „Werkstattauftrag“, Nummer 40xxx je Jahr).
-- Eine Zeile je Beleg, Positionen als JSONB-Liste. Geschrieben nur vom Sage-Abgleich
-- (tools/sage-sync.ps1 über Edge Function sage-sync), gelesen von der App über
-- auftragsnummer = "<Jahr>-<Nummer>" (wie tasks.workshop_order_number, z. B. 2026-40128).
-- Mehrfaches Ausführen ist unschädlich.
create table if not exists public.werkstatt_positionen (
    id uuid primary key default gen_random_uuid(),
    sage_bel_id integer not null unique,
    auftragsnummer text not null,
    belegdatum date,
    address_number text,
    kundenmatchcode text,
    netto numeric(12,2),
    positionen jsonb not null default '[]'::jsonb,   -- [{nr, typ: 'artikel'|'text', artikel, text, text2, menge, einheit, preis, gesamt}]
    aktualisiert_am timestamptz not null default now()
);
create index if not exists werkstatt_positionen_auftrag_idx on public.werkstatt_positionen (auftragsnummer);

alter table public.werkstatt_positionen enable row level security;
drop policy if exists "werkstatt_positionen_lesen" on public.werkstatt_positionen;
create policy "werkstatt_positionen_lesen" on public.werkstatt_positionen
    for select to authenticated using (true);
