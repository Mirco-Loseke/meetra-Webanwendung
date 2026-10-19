-- =====================================================================
-- Vorgänge: Status „Wartet" abgeschafft (2026-09-16)
-- =====================================================================
-- Es gibt nur noch Offen / In Arbeit / Erledigt. Alle Vorgänge, die noch
-- auf „wartet" stehen, werden auf „in_bearbeitung" gesetzt. Die App zeigt
-- verbliebene „wartet"-Zeilen ohnehin als „In Arbeit" an — die Umstellung
-- hier macht die Daten sauber, damit Auswertungen und Filter stimmen.
-- Einmalig im Supabase SQL-Editor ausführen.
-- =====================================================================

update public.internal_processes
   set status = 'in_bearbeitung'
 where status = 'wartet';

-- Kontrolle: muss 0 ergeben
-- select count(*) from public.internal_processes where status = 'wartet';
