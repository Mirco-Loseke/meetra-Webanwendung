ALTER TABLE machines ADD COLUMN IF NOT EXISTS files jsonb DEFAULT '[]'::jsonb;
