-- Sage-Abgleich (tools/sage-sync.ps1): letzter aus Sage uebernommener Stand je Adresse.
-- Weicht ein Feld in der Webapp davon ab, wurde es von Hand geaendert und wird
-- vom Abgleich nicht mehr ueberschrieben.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS sage_stand jsonb;
