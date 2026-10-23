-- Fester Ordnername je Maschine im Cloudflare-Speicher (R2).
-- Bisher wurde der Ordner bei jedem Upload neu aus Hersteller/Typ/Seriennummer/Baujahr gebildet;
-- nach einer Umbenennung entstand dadurch ein zweiter Ordner. Die App schreibt den Namen
-- beim ersten Gebrauch hierher und nutzt ihn danach immer wieder. Bestehende Ordner und
-- Dateipfade bleiben unverändert. Ohne diese Spalte funktioniert die App wie bisher.
alter table public.machines add column if not exists r2_ordner text;
