-- Add workshop_order_number column to service_entries table
ALTER TABLE service_entries ADD COLUMN IF NOT EXISTS workshop_order_number text;
