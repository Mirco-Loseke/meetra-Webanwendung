-- Add category_id to protocol_templates table
ALTER TABLE protocol_templates ADD COLUMN IF NOT EXISTS category_id bigint REFERENCES categories(id) ON DELETE SET NULL;

-- Update existing templates if possible (placeholders until we know exact IDs)
-- For now, let's just add the column. 
-- The user can associate them via the UI we're about to build.
