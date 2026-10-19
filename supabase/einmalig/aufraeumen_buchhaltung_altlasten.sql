-- Buchhaltung: Altlasten entfernen (2026-10-02)
-- 1. Alte, von Hand erfasste Ausgangsrechnungen (accounting.type = 'outgoing').
--    Die Ausgangsrechnungen kommen seit 2026-09-30 aus Sage (Tabelle rechnungen).
-- 2. Tabelle accounting_items — Positionen liegen seit der JSONB-Migration in accounting.items.
-- Eingangsrechnungen (type = 'incoming') bleiben unangetastet.
-- ENDGÜLTIG. Vorher backup/backup.bat laufen lassen.

begin;

-- Kontrolle: so viele Zeilen werden gelöscht
select count(*) as alte_ausgangsrechnungen from accounting where type = 'outgoing';

delete from accounting where type = 'outgoing';

drop table if exists accounting_items;

commit;
