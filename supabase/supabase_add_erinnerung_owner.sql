-- ===========================================================================
-- Angebots-Erinnerung: wem gehört sie?
-- ---------------------------------------------------------------------------
-- `angebote` stammt aus dem Sage-Import und hat deshalb keinen Ersteller. Die
-- Erinnerung (`erinnerung`) setzt aber ein Mensch — und bisher landete sie bei
-- JEDEM in der Glocke, nicht nur bei dem, der sie gesetzt hat.
--
-- Zwei Spalten: die Benutzer-ID für den Abgleich, der Name für die Anzeige
-- („von Mirco gesetzt") ohne zusätzliche Abfrage.
--
-- Altbestand bleibt absichtlich leer: eine Erinnerung ohne Besitzer wird
-- weiterhin allen gezeigt, statt still zu verschwinden.
--
-- Einmalig im Supabase SQL-Editor ausführen.
-- ===========================================================================

ALTER TABLE public.angebote
    ADD COLUMN IF NOT EXISTS erinnerung_by      uuid,
    ADD COLUMN IF NOT EXISTS erinnerung_by_name text;

-- Kontrolle:
-- SELECT belegnummer, erinnerung, erinnerung_by_name FROM public.angebote
--  WHERE erinnerung IS NOT NULL ORDER BY erinnerung;
