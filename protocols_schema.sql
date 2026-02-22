-- ==========================================
-- PROTOCOLS SCHEMA MIGRATION
-- ==========================================
-- Creates tables for intake and acceptance protocols
-- with support for custom checkpoints, photos, and edit history

-- 1. INTAKE PROTOCOLS TABLE
CREATE TABLE IF NOT EXISTS intake_protocols (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    machine_id bigint REFERENCES machines(id) ON DELETE CASCADE,
    title text NOT NULL, -- Auto-generated from machine data
    status text DEFAULT 'draft', -- 'draft' or 'completed'
    
    -- Free text fields
    error_description text,
    work_order text,
    
    -- Predefined checkpoints (stored as JSONB for flexibility)
    predefined_checkpoints jsonb DEFAULT '{
        "machine_clean": null,
        "machine_dirty": null,
        "visible_damage": null,
        "accessories_complete": null,
        "machine_starts": null,
        "emergency_stop_works": null,
        "display_ok": null,
        "error_messages_present": null,
        "protective_covers_present": null,
        "cables_undamaged": null,
        "plug_ok": null
    }'::jsonb,
    
    -- Completion tracking
    completed_at timestamptz,
    completed_by uuid REFERENCES users(id),
    
    -- Edit history (array of edit records)
    edit_history jsonb DEFAULT '[]'::jsonb,
    
    -- Standard timestamps
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    created_by uuid REFERENCES users(id)
);

-- 2. ACCEPTANCE PROTOCOLS TABLE
CREATE TABLE IF NOT EXISTS acceptance_protocols (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    machine_id bigint REFERENCES machines(id) ON DELETE CASCADE,
    title text NOT NULL, -- Auto-generated from machine data
    status text DEFAULT 'draft', -- 'draft' or 'completed'
    
    -- Free text fields specific to acceptance
    work_performed text,
    parts_replaced text,
    settings_calibrations text,
    remaining_defects text,
    
    -- Predefined checkpoints (stored as JSONB for flexibility)
    predefined_checkpoints jsonb DEFAULT '{
        "test_run_ok": null,
        "electrical_ok": null,
        "safety_ok": null,
        "functionality_ok": null,
        "visual_inspection_ok": null
    }'::jsonb,
    
    -- Completion tracking
    completed_at timestamptz,
    completed_by uuid REFERENCES users(id),
    
    -- Edit history (array of edit records)
    edit_history jsonb DEFAULT '[]'::jsonb,
    
    -- Standard timestamps
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    created_by uuid REFERENCES users(id)
);

-- 3. PROTOCOL CHECKPOINTS TABLE (for custom checkpoints)
CREATE TABLE IF NOT EXISTS protocol_checkpoints (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    protocol_id uuid NOT NULL, -- References either intake or acceptance protocol
    protocol_type text NOT NULL, -- 'intake' or 'acceptance'
    description text NOT NULL,
    result boolean, -- true = Yes, false = No, null = not answered
    sort_order integer DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    created_by uuid REFERENCES users(id)
);

-- 4. PROTOCOL PHOTOS TABLE
CREATE TABLE IF NOT EXISTS protocol_photos (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    protocol_id uuid NOT NULL, -- References either intake or acceptance protocol
    protocol_type text NOT NULL, -- 'intake' or 'acceptance'
    file_name text NOT NULL,
    file_url text NOT NULL,
    file_size bigint,
    uploaded_at timestamptz DEFAULT now(),
    uploaded_by uuid REFERENCES users(id)
);

-- 5. CREATE INDEXES FOR PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_intake_protocols_machine_id ON intake_protocols(machine_id);
CREATE INDEX IF NOT EXISTS idx_acceptance_protocols_machine_id ON acceptance_protocols(machine_id);
CREATE INDEX IF NOT EXISTS idx_protocol_checkpoints_protocol_id ON protocol_checkpoints(protocol_id);
CREATE INDEX IF NOT EXISTS idx_protocol_photos_protocol_id ON protocol_photos(protocol_id);

-- 6. ENABLE ROW LEVEL SECURITY
ALTER TABLE intake_protocols ENABLE ROW LEVEL SECURITY;
ALTER TABLE acceptance_protocols ENABLE ROW LEVEL SECURITY;
ALTER TABLE protocol_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE protocol_photos ENABLE ROW LEVEL SECURITY;

-- 7. CREATE RLS POLICIES
-- Intake Protocols Policies
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view all intake protocols' AND tablename = 'intake_protocols') THEN
        CREATE POLICY "Users can view all intake protocols" ON intake_protocols FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can insert intake protocols' AND tablename = 'intake_protocols') THEN
        CREATE POLICY "Users can insert intake protocols" ON intake_protocols FOR INSERT WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can update intake protocols' AND tablename = 'intake_protocols') THEN
        CREATE POLICY "Users can update intake protocols" ON intake_protocols FOR UPDATE USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can delete intake protocols' AND tablename = 'intake_protocols') THEN
        CREATE POLICY "Users can delete intake protocols" ON intake_protocols FOR DELETE USING (true);
    END IF;
END $$;

-- Acceptance Protocols Policies
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view all acceptance protocols' AND tablename = 'acceptance_protocols') THEN
        CREATE POLICY "Users can view all acceptance protocols" ON acceptance_protocols FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can insert acceptance protocols' AND tablename = 'acceptance_protocols') THEN
        CREATE POLICY "Users can insert acceptance protocols" ON acceptance_protocols FOR INSERT WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can update acceptance protocols' AND tablename = 'acceptance_protocols') THEN
        CREATE POLICY "Users can update acceptance protocols" ON acceptance_protocols FOR UPDATE USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can delete acceptance protocols' AND tablename = 'acceptance_protocols') THEN
        CREATE POLICY "Users can delete acceptance protocols" ON acceptance_protocols FOR DELETE USING (true);
    END IF;
END $$;

-- Protocol Checkpoints Policies
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view all protocol checkpoints' AND tablename = 'protocol_checkpoints') THEN
        CREATE POLICY "Users can view all protocol checkpoints" ON protocol_checkpoints FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can insert protocol checkpoints' AND tablename = 'protocol_checkpoints') THEN
        CREATE POLICY "Users can insert protocol checkpoints" ON protocol_checkpoints FOR INSERT WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can update protocol checkpoints' AND tablename = 'protocol_checkpoints') THEN
        CREATE POLICY "Users can update protocol checkpoints" ON protocol_checkpoints FOR UPDATE USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can delete protocol checkpoints' AND tablename = 'protocol_checkpoints') THEN
        CREATE POLICY "Users can delete protocol checkpoints" ON protocol_checkpoints FOR DELETE USING (true);
    END IF;
END $$;

-- Protocol Photos Policies
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view all protocol photos' AND tablename = 'protocol_photos') THEN
        CREATE POLICY "Users can view all protocol photos" ON protocol_photos FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can insert protocol photos' AND tablename = 'protocol_photos') THEN
        CREATE POLICY "Users can insert protocol photos" ON protocol_photos FOR INSERT WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can update protocol photos' AND tablename = 'protocol_photos') THEN
        CREATE POLICY "Users can update protocol photos" ON protocol_photos FOR UPDATE USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can delete protocol photos' AND tablename = 'protocol_photos') THEN
        CREATE POLICY "Users can delete protocol photos" ON protocol_photos FOR DELETE USING (true);
    END IF;
END $$;

-- 8. CREATE STORAGE BUCKET FOR PROTOCOL PHOTOS
-- Note: This needs to be run in Supabase dashboard or via API
-- Storage bucket creation SQL (for reference):
-- INSERT INTO storage.buckets (id, name, public) VALUES ('protocol_photos', 'protocol_photos', true);

-- 9. STORAGE BUCKET POLICIES (for reference)
-- These need to be created in Supabase dashboard under Storage > protocol_photos > Policies
-- Policy 1: Allow all users to upload
-- Policy 2: Allow all users to view
-- Policy 3: Allow all users to delete

-- 10. CREATE UPDATED_AT TRIGGER FUNCTION
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 11. CREATE TRIGGERS FOR UPDATED_AT
DROP TRIGGER IF EXISTS update_intake_protocols_updated_at ON intake_protocols;
CREATE TRIGGER update_intake_protocols_updated_at
    BEFORE UPDATE ON intake_protocols
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_acceptance_protocols_updated_at ON acceptance_protocols;
CREATE TRIGGER update_acceptance_protocols_updated_at
    BEFORE UPDATE ON acceptance_protocols
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
