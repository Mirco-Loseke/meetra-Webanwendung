-- =====================================================================
-- Mietvereinbarungen in der Maschinen-Historie (2026-09-16)
-- =====================================================================
-- Jede gespeicherte Mietvereinbarung erzeugt in manual_history_entries:
--   * einen Eintrag vom Typ 'miete'  (Zeitraum, Kunde, Betriebsstunden
--     bei Übergabe und Rücknahme, Tagessatz) — Phase 'miete'
--   * je einen Eintrag vom Typ 'hours' für die Betriebsstunden bei
--     Übergabe (Phase 'uebergabe') und bei Rücknahme (Phase 'ruecknahme'),
--     damit der Zählerstand der Maschine wie bei einer manuellen
--     Ablesung weiterläuft (Maschinen-Detail, nächste Mietvereinbarung).
-- rental_agreement_id + rental_phase sind eindeutig: erneutes Speichern
-- aktualisiert die Einträge statt sie zu vervielfachen; Löschen der
-- Vereinbarung räumt sie per ON DELETE CASCADE mit weg.
-- Voraussetzung: supabase_mietvereinbarung_komplett.sql ist gelaufen.
-- =====================================================================

alter table public.manual_history_entries
    add column if not exists rental_agreement_id uuid
        references public.rental_agreements (id) on delete cascade;

alter table public.manual_history_entries
    add column if not exists rental_phase text;

create unique index if not exists idx_manual_history_rental_phase
    on public.manual_history_entries (rental_agreement_id, rental_phase);

-- Typ 'miete' zulassen — die Liste muss alle bisherigen Typen enthalten.
alter table public.manual_history_entries
    drop constraint if exists manual_history_entries_type_check;

alter table public.manual_history_entries
    add constraint manual_history_entries_type_check
    check (type in ('email', 'phone', 'note', 'photo', 'hours', 'whatsapp',
                    'wartung', 'auslieferung', 'angebot', 'miete'));
