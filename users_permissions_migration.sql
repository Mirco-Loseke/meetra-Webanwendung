-- Migration to add permissions and pin to users table

-- Add permissions column (JSONB) to store access rights
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{"home": true, "tasks": true, "procurements": true, "machines": true, "history": true, "accounting": true, "settings": true}'::jsonb;

-- Add pin column (TEXT) to store the 4-digit PIN for protected profiles
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS pin TEXT DEFAULT NULL;

-- Keep RLS simple for now, as users will read all rows anyway.
-- No change to policies needed if they are already readable.
