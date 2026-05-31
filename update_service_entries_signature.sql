-- Add travel distance, travel time, signature, and signee name to service_entries table
ALTER TABLE service_entries ADD COLUMN IF NOT EXISTS travel_distance_km numeric(6,2);
ALTER TABLE service_entries ADD COLUMN IF NOT EXISTS travel_time_minutes integer;
ALTER TABLE service_entries ADD COLUMN IF NOT EXISTS customer_signature text;
ALTER TABLE service_entries ADD COLUMN IF NOT EXISTS customer_name text;
