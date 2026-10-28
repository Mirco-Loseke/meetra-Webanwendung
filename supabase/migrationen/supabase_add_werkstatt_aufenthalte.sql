-- Werkstattaufenthalte einer Maschine: Beginn/Ende, Auftragsnummer, Abschlussdaten und abgelegter Bericht.
-- Aufgaben hängen über tasks.workshop_order_number (= auftragsnummer) daran, keine eigene Spalte nötig.
-- Gepflegt von js/werkstatt-aufenthalt.js. Mehrfaches Ausführen ist unschädlich.
create table if not exists public.werkstatt_aufenthalte (
    id uuid primary key default gen_random_uuid(),
    machine_id bigint not null,
    auftragsnummer text,
    beginn date,
    ende date,
    stunden_ende text,
    bemerkung text,
    ki_text text,
    pdf_url text,
    document_id text,
    created_by text,
    created_at timestamptz not null default now()
);
create index if not exists werkstatt_aufenthalte_machine_idx on public.werkstatt_aufenthalte (machine_id, beginn desc);

alter table public.werkstatt_aufenthalte enable row level security;
drop policy if exists "werkstatt_aufenthalte_all" on public.werkstatt_aufenthalte;
create policy "werkstatt_aufenthalte_all" on public.werkstatt_aufenthalte
    for all to authenticated using (true) with check (true);
