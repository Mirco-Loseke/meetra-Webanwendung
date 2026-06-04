-- ==========================================
-- ADD PDF STORAGE & OPERATING HOURS TO PROTOCOLS
-- ==========================================

-- 1. Modify intake_protocols table
ALTER TABLE intake_protocols 
ADD COLUMN IF NOT EXISTS pdf_url text,
ADD COLUMN IF NOT EXISTS pdf_path text,
ADD COLUMN IF NOT EXISTS pdf_created_at timestamptz,
ADD COLUMN IF NOT EXISTS operating_hours numeric;

-- 2. Modify acceptance_protocols table
ALTER TABLE acceptance_protocols 
ADD COLUMN IF NOT EXISTS pdf_url text,
ADD COLUMN IF NOT EXISTS pdf_path text,
ADD COLUMN IF NOT EXISTS pdf_created_at timestamptz,
ADD COLUMN IF NOT EXISTS operating_hours numeric;
