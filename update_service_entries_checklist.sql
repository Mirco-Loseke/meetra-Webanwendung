-- Migration to support storing dynamic checklists in service entries
ALTER TABLE service_entries ADD COLUMN IF NOT EXISTS checklist_payload jsonb;
