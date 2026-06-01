-- Add operating hours, work log (JSONB table), and status checkboxes to service_entries table
ALTER TABLE service_entries ADD COLUMN IF NOT EXISTS operating_hours text;
ALTER TABLE service_entries ADD COLUMN IF NOT EXISTS work_log jsonb;
ALTER TABLE service_entries ADD COLUMN IF NOT EXISTS status_repaired boolean DEFAULT false;
ALTER TABLE service_entries ADD COLUMN IF NOT EXISTS status_repaired_en boolean DEFAULT false;
