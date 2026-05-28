-- Hinzufügen des Feldes 'in_workshop' (Boolean, Standard: false) zur Tabelle machines
ALTER TABLE machines ADD COLUMN IF NOT EXISTS in_workshop boolean DEFAULT false;
