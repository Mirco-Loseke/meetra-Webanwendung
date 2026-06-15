-- Verknuepfung eines Vorgangs mit einem Werkstattauftrag (ohne Maschinenbezug)
ALTER TABLE internal_processes
ADD COLUMN IF NOT EXISTS workshop_order_number text;
