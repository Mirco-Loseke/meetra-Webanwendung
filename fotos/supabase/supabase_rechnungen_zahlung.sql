-- =====================================================================
-- Ausgangsrechnungen: Fälligkeit (aus Sage) + Bezahlt/Mahnwesen (in der App)
-- =====================================================================
-- Aus Sage (tools/sage-sync.ps1 → Edge Function sage-sync):
--   zahlungsbedingung  Bezeichnung der Zahlungskondition („10 Tage ohne Abzug")
--   zahlungsziel_tage  Nettotage aus KHKVKBelegeZKD.Nettobedingung („1;10" → 10)
--   faellig_am         Belegdatum + zahlungsziel_tage
-- Nur in der App gepflegt (der Abgleich fasst sie nie an):
--   bezahlt_am         gesetzt = bezahlt
--   mahnstufe          0 keine · 1 Zahlungserinnerung · 2 1. Mahnung · 3 2. Mahnung
--   mahnung_am         Datum der letzten Stufe
--   mahn_verlauf       [{stufe, am, von, an}] — jede verschickte Stufe
-- Einmalig im Supabase SQL-Editor ausführen. Danach Edge Function
-- sage-sync neu ausrollen und das Skript nach C:\meetra-sync kopieren.
-- =====================================================================

alter table public.rechnungen add column if not exists zahlungsbedingung text;
alter table public.rechnungen add column if not exists zahlungsziel_tage integer;
alter table public.rechnungen add column if not exists faellig_am        date;
alter table public.rechnungen add column if not exists bezahlt_am        date;
alter table public.rechnungen add column if not exists mahnstufe         smallint not null default 0;
alter table public.rechnungen add column if not exists mahnung_am        date;
alter table public.rechnungen add column if not exists mahn_verlauf      jsonb not null default '[]'::jsonb;

-- Liste „offen / überfällig" filtert serverseitig danach.
create index if not exists rechnungen_offen_idx on public.rechnungen (faellig_am) where bezahlt_am is null;
