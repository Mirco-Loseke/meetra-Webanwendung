-- Separates Bemerkungs-/Beschreibungsfeld fuer interne Vorgaenge (zusaetzlich zum E-Mail-Text in 'description')
ALTER TABLE internal_processes
ADD COLUMN IF NOT EXISTS remark text;
