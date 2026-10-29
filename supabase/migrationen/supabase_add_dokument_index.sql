-- KI-Index technischer Dokumente (Betriebsanleitung, Elektro-/Hydraulikplan, Ersatzteilkatalog ...):
-- je Dokument der Status, der Text je Seite und die daraus gelesenen Fakten (Füllmengen, Gewichte, Intervalle ...).
-- Gefüllt von js/dokument-index.js; abgefragt im KI-Chat (Abfrage "technische_daten") und in der Maschinen-Zentrale.
-- Es kommen NUR technische Dokumente hinein (Positivliste im Code) — nie Serviceberichte, Mietvereinbarungen,
-- Protokolle, Rechnungen oder Mails. Mehrfaches Ausführen ist unschädlich.
create table if not exists public.dokument_index (
    document_id text primary key,
    status text not null default 'laeuft',          -- laeuft | pausiert | fertig | abgelehnt | fehler
    dokumenttyp text,
    grund text,                                      -- bei abgelehnt/fehler/pausiert
    seiten integer,
    naechste_seite integer not null default 1,       -- Fortsetzen nach Abbruch
    aufrufe integer not null default 0,
    tokens_ein integer not null default 0,
    tokens_aus integer not null default 0,
    modell text,
    von text,
    aktualisiert timestamptz not null default now()
);

create table if not exists public.dokument_seiten (
    document_id text not null,
    seite integer not null,
    text text,
    primary key (document_id, seite)
);

create table if not exists public.dokument_fakten (
    id uuid primary key default gen_random_uuid(),
    document_id text not null,
    schluessel text not null,
    wert text,
    einheit text,
    variante text,                                   -- z. B. "Kettenlaufwerk", "stationär", "TAD 581 VE"
    seite integer,
    status text not null default 'neu',              -- neu | bestaetigt | verworfen
    created_at timestamptz not null default now()
);
create index if not exists dokument_fakten_doc_idx on public.dokument_fakten (document_id);

alter table public.dokument_index enable row level security;
alter table public.dokument_seiten enable row level security;
alter table public.dokument_fakten enable row level security;
drop policy if exists "dokument_index_all" on public.dokument_index;
create policy "dokument_index_all" on public.dokument_index for all to authenticated using (true) with check (true);
drop policy if exists "dokument_seiten_all" on public.dokument_seiten;
create policy "dokument_seiten_all" on public.dokument_seiten for all to authenticated using (true) with check (true);
drop policy if exists "dokument_fakten_all" on public.dokument_fakten;
create policy "dokument_fakten_all" on public.dokument_fakten for all to authenticated using (true) with check (true);
