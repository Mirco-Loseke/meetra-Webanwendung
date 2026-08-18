-- Termine an Adressen + Bezug zu einem Historieneintrag.
-- maintenance_events wird als gemeinsame Termin-/Ereignistabelle genutzt (Kalender
-- liest daraus). Zwei zusätzliche Spalten:
--   customer_id  -> verknüpft den Termin mit einer Adresse (customers.id, UUID!)
--   history_ref  -> kurzer Text, worauf sich der Termin bezieht (Historieneintrag)
--
-- WICHTIG: customers.id ist eine UUID, KEIN bigint. Eine frühere Fassung dieser
-- Migration legte customer_id fälschlich als bigint an — dann scheitert jeder
-- Adress-Termin still (Fallback ohne Adressbezug), der Termin ist verwaist und
-- erscheint nie im Reiter „Termine". Der Block unten korrigiert das auch
-- nachträglich.

alter table maintenance_events add column if not exists customer_id uuid;
alter table maintenance_events add column if not exists history_ref text;

-- Falls die Spalte bereits (falsch) als bigint existiert: auf uuid umstellen.
-- Bestehende bigint-Werte sind ohnehin ungültig (customers.id ist uuid) und
-- werden dabei auf NULL gesetzt.
do $$
begin
    if exists (
        select 1 from information_schema.columns
        where table_name = 'maintenance_events'
          and column_name = 'customer_id'
          and data_type <> 'uuid'
    ) then
        alter table maintenance_events alter column customer_id drop default;
        alter table maintenance_events
            alter column customer_id type uuid using (null::uuid);
    end if;
end $$;

-- Optionaler Index für die Adress-Detailansicht (Termine je Adresse)
create index if not exists maintenance_events_customer_id_idx on maintenance_events (customer_id);
