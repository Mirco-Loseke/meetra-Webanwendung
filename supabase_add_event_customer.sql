-- Termine an Adressen + Bezug zu einem Historieneintrag.
-- maintenance_events wird als gemeinsame Termin-/Ereignistabelle genutzt (Kalender
-- liest daraus). Zwei zusätzliche Spalten:
--   customer_id  -> verknüpft den Termin mit einer Adresse (customers.id)
--   history_ref  -> kurzer Text, worauf sich der Termin bezieht (Historieneintrag)
alter table maintenance_events add column if not exists customer_id bigint;
alter table maintenance_events add column if not exists history_ref text;

-- Optionaler Index für die Adress-Detailansicht (Termine je Adresse)
create index if not exists maintenance_events_customer_id_idx on maintenance_events (customer_id);
