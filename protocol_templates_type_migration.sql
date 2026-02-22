-- Add type column to protocol_templates table
ALTER TABLE protocol_templates ADD COLUMN IF NOT EXISTS type text;

-- Add check constraint to ensure only allowed types (optional but recommended)
-- ALTER TABLE protocol_templates ADD CONSTRAINT check_template_type CHECK (type IN ('intake', 'acceptance'));

COMMENT ON COLUMN protocol_templates.type IS 'Distinguishes between intake (Eingang) and acceptance (Abnahme) templates';
