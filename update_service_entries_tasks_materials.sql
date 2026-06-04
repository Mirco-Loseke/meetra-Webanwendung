-- Add tasks and materials JSONB tables to service_entries table
ALTER TABLE service_entries ADD COLUMN IF NOT EXISTS tasks jsonb;
ALTER TABLE service_entries ADD COLUMN IF NOT EXISTS materials jsonb;
