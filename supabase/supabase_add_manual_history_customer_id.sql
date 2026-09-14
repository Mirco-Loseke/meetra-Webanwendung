-- =========================================================
-- HISTORIE-EINTRÄGE OHNE MASCHINE — DIREKT AN DER ADRESSE
-- =========================================================
-- Zweck: Ein importiertes Angebot (Sage 100) bekommt den Kunden schon beim
--        Import zuverlässig über den Kundenmatchcode zugeordnet. Bislang
--        entstand der Historie-Eintrag (manual_history_entries) aber erst,
--        wenn ZUSÄTZLICH eine eindeutige Maschine gefunden wurde — bei
--        Kunden mit mehreren oder keiner Maschine blieb das Angebot dadurch
--        unsichtbar in der Adress-Historie, obwohl der Kunde längst bekannt
--        war.
--
-- Diese Migration ergänzt eine eigene customer_id-Spalte an
-- manual_history_entries. js/listen.js (syncAngebotMachineHistory) schreibt
-- sie ab jetzt immer mit, js/addressbook.js liest die Adress-Historie
-- zusätzlich darüber aus — unabhängig von einer Maschinen-Zuordnung.
--
-- Gefahrlos wiederholbar: alles mit IF NOT EXISTS, das Backfill ganz unten
-- ueberspringt Angebote, die schon einen Eintrag haben.
--
-- Ausfuehren: Supabase → SQL Editor → einfuegen → Run
-- =========================================================

-- 1. Spalte ----------------------------------------------------
alter table public.manual_history_entries
    add column if not exists customer_id uuid references public.customers(id) on delete cascade;

create index if not exists idx_manual_history_customer_id
    on public.manual_history_entries (customer_id);

comment on column public.manual_history_entries.customer_id is
    'Direkter Adress-Bezug fuer Eintraege ohne (eindeutige) Maschine, z. B. importierte Angebote — siehe js/listen.js syncAngebotMachineHistory.';

-- 2. Backfill ----------------------------------------------------
-- Bereits importierte Angebote, deren Kunde laengst feststeht, aber die
-- (weil noch keine Maschine gefunden wurde) bislang KEINEN Historie-Eintrag
-- bekommen haben. Einmalig nachholen, danach uebernimmt die App das laufend.
insert into public.manual_history_entries
    (angebot_id, machine_id, customer_id, type, title, content, created_at)
select
    a.id, a.machine_id, a.customer_id, 'angebot',
    'Angebot ' || a.belegnummer,
    trim(both ' · ' from concat_ws(' · ',
        a.kundenmatchcode,
        case when a.nettobetrag is not null then 'Netto: ' || to_char(a.nettobetrag, 'FM999G999G990D00') || ' €' end,
        case when a.bruttobetrag is not null then 'Brutto: ' || to_char(a.bruttobetrag, 'FM999G999G990D00') || ' €' end,
        a.bemerkung
    )),
    coalesce(a.belegdatum::timestamptz, a.created_at, now())
from public.angebote a
where a.customer_id is not null
  and not exists (
      select 1 from public.manual_history_entries m where m.angebot_id = a.id
  );

-- 3. Kontrolle ------------------------------------------------
-- select a.belegnummer, a.customer_id, a.machine_id, m.id as history_id
--   from public.angebote a
--   left join public.manual_history_entries m on m.angebot_id = a.id
--  where a.customer_id is not null
--  order by a.belegnummer;

-- =========================================================
-- ZURUECKNEHMEN (nur falls gewuenscht)
-- =========================================================
-- alter table public.manual_history_entries drop column if exists customer_id;
-- drop index if exists idx_manual_history_customer_id;
