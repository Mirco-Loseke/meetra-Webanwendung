/* ========================================================= */
/* DATEI: accounting_items_migration.sql */
/* ========================================================= */

-- Create accounting_items table
CREATE TABLE IF NOT EXISTS public.accounting_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    accounting_id UUID NOT NULL REFERENCES public.accounting(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    quantity DECIMAL(15,2) DEFAULT 1,
    unit TEXT,
    price_net DECIMAL(15,2) NOT NULL,
    machine_id BIGINT REFERENCES public.machines(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.accounting_items ENABLE ROW LEVEL SECURITY;

-- Policies for accounting_items
-- Since accounting has "Allow all operations" for simplicity in this project's current state (based on accounting_schema.sql), 
-- we follow the same pattern or align with authenticated access.
CREATE POLICY "Allow all operations for accounting_items" ON public.accounting_items
    FOR ALL USING (true) WITH CHECK (true);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_accounting_items_accounting_id ON public.accounting_items(accounting_id);
CREATE INDEX IF NOT EXISTS idx_accounting_items_machine_id ON public.accounting_items(machine_id);



/* ========================================================= */
/* DATEI: accounting_schema.sql */
/* ========================================================= */

-- Create accounting table
CREATE TABLE IF NOT EXISTS public.accounting (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN ('incoming', 'outgoing')),
    invoice_number TEXT,
    date DATE NOT NULL,
    entity TEXT NOT NULL, -- Customer or Supplier
    amount_net DECIMAL(15,2) NOT NULL,
    vat_rate DECIMAL(5,2) DEFAULT 19.00,
    amount_gross DECIMAL(15,2) NOT NULL,
    comment TEXT,
    machine_id BIGINT REFERENCES public.machines(id) ON DELETE SET NULL,
    is_paid BOOLEAN DEFAULT false,
    document_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.accounting ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Allow all operations for accounting" ON public.accounting
    FOR ALL USING (true) WITH CHECK (true);

-- Trigger for updated_at
CREATE TRIGGER update_accounting_updated_at
    BEFORE UPDATE ON public.accounting
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();



/* ========================================================= */
/* DATEI: add_location_company_column.sql */
/* ========================================================= */

-- SQL Migration: Add location_company column to machines table
ALTER TABLE machines ADD COLUMN IF NOT EXISTS location_company text;



/* ========================================================= */
/* DATEI: add_performance_indexes.sql */
/* ========================================================= */

-- Indizes fÃ¼r schnelle Kundensuche und Zuordnung
CREATE INDEX IF NOT EXISTS idx_customers_search_name ON customers (name);
CREATE INDEX IF NOT EXISTS idx_customers_search_match ON customers (matchcode);
CREATE INDEX IF NOT EXISTS idx_machines_customer_id ON machines (customer_id);

-- Indizes fÃ¼r Serviceberichte und Protokolle
CREATE INDEX IF NOT EXISTS idx_service_entries_machine ON service_entries (machine_id);
CREATE INDEX IF NOT EXISTS idx_service_entries_date ON service_entries (date DESC);
CREATE INDEX IF NOT EXISTS idx_protocols_machine_id ON intake_protocols (machine_id);
CREATE INDEX IF NOT EXISTS idx_protocols_acceptance_machine ON acceptance_protocols (machine_id);



/* ========================================================= */
/* DATEI: add_tasks_completed_columns.sql */
/* ========================================================= */

-- Migration to add completed_at and completed_by columns to tasks table
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_by BIGINT REFERENCES users(id) ON DELETE SET NULL;



/* ========================================================= */
/* DATEI: add_user_email_column.sql */
/* ========================================================= */

-- Run this SQL in your Supabase SQL Editor to add the email column to the users table
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS email TEXT DEFAULT NULL;



/* ========================================================= */
/* DATEI: create_customers_schema.sql */
/* ========================================================= */

-- Erstellt die Tabelle fÃ¼r importierte Sage 100 Kundenadressen
CREATE TABLE IF NOT EXISTS customers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_number text UNIQUE, -- Sage 100 Kundennummer
    matchcode text,              -- Sage 100 Matchcode
    name text NOT NULL,          -- Firmenname (Firma)
    street text,                 -- StraÃŸe und Hausnummer
    zip_code text,               -- PLZ
    city text,                   -- Ort
    country text DEFAULT 'Deutschland',
    phone text,                  -- Telefon
    email text,                  -- E-Mail
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- HinzufÃ¼gen der aufgeteilten Felder zur Tabelle 'machines'
ALTER TABLE machines 
    ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS customer_number text,
    -- Betreiber-Adresse (Firma ist bereits die Spalte 'company')
    ADD COLUMN IF NOT EXISTS operator_street text,
    ADD COLUMN IF NOT EXISTS operator_zip text,
    ADD COLUMN IF NOT EXISTS operator_city text,
    ADD COLUMN IF NOT EXISTS operator_country text DEFAULT 'Deutschland',
    -- Maschinenstandort (Physischer Standort)
    ADD COLUMN IF NOT EXISTS location_street text,
    ADD COLUMN IF NOT EXISTS location_zip text,
    ADD COLUMN IF NOT EXISTS location_city text,
    ADD COLUMN IF NOT EXISTS location_country text DEFAULT 'Deutschland';

-- Tabelle fÃ¼r globale Einstellungen (Firmenadresse, etc.)
CREATE TABLE IF NOT EXISTS app_settings (
    key text PRIMARY KEY,
    value jsonb NOT NULL
);



/* ========================================================= */
/* DATEI: create_get_email_rpc.sql */
/* ========================================================= */

-- Run this SQL in your Supabase SQL Editor (New Query) to create the RPC lookup function.
-- This function is marked as SECURITY DEFINER, which allows unauthenticated users during login
-- to resolve their display name to an email address without hitting RLS restrictions.

CREATE OR REPLACE FUNCTION public.get_email_by_name(username text)
RETURNS TABLE (email text) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT u.email 
    FROM public.users u 
    WHERE u.name ILIKE username 
    LIMIT 1;
END;
$$;



/* ========================================================= */
/* DATEI: create_internal_processes_table.sql */
/* ========================================================= */

-- Neue Tabelle fÃ¼r Kalender-VorgÃ¤nge (E-Mails & Notizen) erstellen
CREATE TABLE IF NOT EXISTS internal_processes (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    title text NOT NULL, -- E-Mail-Betreff / Titel
    process_type text NOT NULL DEFAULT 'email_incoming', -- 'email_incoming', 'email_outgoing', 'note', 'manual'
    sender text, -- Absender-Adresse / Name
    recipient text, -- EmpfÃ¤nger-Adresse / Name
    process_date timestamptz DEFAULT now(), -- E-Mail-Datum
    machine_id bigint REFERENCES machines(id) ON DELETE SET NULL, -- VerknÃ¼pfte Maschine
    description text, -- E-Mail-Inhalt / Beschreibung
    status text DEFAULT 'offen', -- 'offen', 'in_bearbeitung', 'erledigt'
    user_id uuid DEFAULT auth.uid(),
    created_at timestamptz DEFAULT now()
);

-- RLS aktivieren
ALTER TABLE internal_processes ENABLE ROW LEVEL SECURITY;

-- RLS Richtlinien fÃ¼r Benutzer
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view their own processes' AND tablename = 'internal_processes') THEN
        CREATE POLICY "Users can view their own processes" ON internal_processes FOR SELECT USING (auth.uid() = user_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can insert their own processes' AND tablename = 'internal_processes') THEN
        CREATE POLICY "Users can insert their own processes" ON internal_processes FOR INSERT WITH CHECK (auth.uid() = user_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can update their own processes' AND tablename = 'internal_processes') THEN
        CREATE POLICY "Users can update their own processes" ON internal_processes FOR UPDATE USING (auth.uid() = user_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can delete their own processes' AND tablename = 'internal_processes') THEN
        CREATE POLICY "Users can delete their own processes" ON internal_processes FOR DELETE USING (auth.uid() = user_id);
    END IF;
END $$;



/* ========================================================= */
/* DATEI: enable_rls_all_tables.sql */
/* ========================================================= */

-- Run this SQL in your Supabase SQL Editor (New Query) to automatically:
-- 1. Enable Row Level Security (RLS) on ALL tables in the 'public' schema.
-- 2. Create a policy for each table that allows logged-in (authenticated) users full access.

DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'public'
    LOOP
        -- Enable RLS on the table
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', r.tablename);
        
        -- Drop policy if it already exists to avoid conflicts
        EXECUTE format('DROP POLICY IF EXISTS allow_all_authenticated ON public.%I;', r.tablename);
        
        -- Create policy allowing authenticated users all operations (SELECT, INSERT, UPDATE, DELETE)
        EXECUTE format('CREATE POLICY allow_all_authenticated ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true);', r.tablename);
        
        RAISE NOTICE 'RLS and Policy created for table: %', r.tablename;
    END LOOP;
END;
$$;



/* ========================================================= */
/* DATEI: history_manual_migration.sql */
/* ========================================================= */

-- Create manual_history_entries table
CREATE TABLE IF NOT EXISTS public.manual_history_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    machine_id BIGINT REFERENCES public.machines(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('email', 'phone', 'note', 'photo')),
    title TEXT NOT NULL,
    content TEXT,
    files JSONB DEFAULT '[]'::jsonB,
    created_at TIMESTAMPTZ DEFAULT now(),
    created_by UUID REFERENCES auth.users(id)
);

-- Add index for faster lookups by machine_id
CREATE INDEX IF NOT EXISTS idx_manual_history_machine_id ON public.manual_history_entries(machine_id);

-- Enable RLS
ALTER TABLE public.manual_history_entries ENABLE ROW LEVEL SECURITY;

-- Create policy for authenticated users
CREATE POLICY "Allow all actions for authenticated users" ON public.manual_history_entries
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);



/* ========================================================= */
/* DATEI: in_workshop_migration.sql */
/* ========================================================= */

-- HinzufÃ¼gen des Feldes 'in_workshop' (Boolean, Standard: false) zur Tabelle machines
ALTER TABLE machines ADD COLUMN IF NOT EXISTS in_workshop boolean DEFAULT false;



/* ========================================================= */
/* DATEI: maintenance_migration.sql */
/* ========================================================= */

-- 1. Kategorien erweitern (Wartungsintervall hinzufÃ¼gen)
ALTER TABLE categories ADD COLUMN IF NOT EXISTS default_maintenance_interval_months integer DEFAULT 12;

-- 2. Maschinen erweitern (Wartungsdaten hinzufÃ¼gen)
ALTER TABLE machines ADD COLUMN IF NOT EXISTS last_maintenance_date timestamptz;
ALTER TABLE machines ADD COLUMN IF NOT EXISTS next_maintenance_date timestamptz;
ALTER TABLE machines ADD COLUMN IF NOT EXISTS maintenance_interval_months integer;

-- 3. Serviceberichte erweitern (manueller Termin-Override)
ALTER TABLE service_entries ADD COLUMN IF NOT EXISTS next_maintenance_date_override timestamptz;

-- 4. Neue Tabelle fÃ¼r Kalender-Events erstellen
CREATE TABLE IF NOT EXISTS maintenance_events (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    machine_id bigint REFERENCES machines(id) ON DELETE CASCADE,
    event_type text, -- z.B. 'Wartung', 'Service'
    start_date timestamptz NOT NULL,
    end_date timestamptz,
    description text,
    status text DEFAULT 'geplant',
    user_id uuid DEFAULT auth.uid(),
    created_at timestamptz DEFAULT now()
);

-- 5. RLS fÃ¼r neue Tabelle aktivieren
ALTER TABLE maintenance_events ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies erstellen (Sicherstellung, dass Nutzer nur eigene Daten sehen)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view their own maintenance events' AND tablename = 'maintenance_events') THEN
        CREATE POLICY "Users can view their own maintenance events" ON maintenance_events FOR SELECT USING (auth.uid() = user_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can insert their own maintenance events' AND tablename = 'maintenance_events') THEN
        CREATE POLICY "Users can insert their own maintenance events" ON maintenance_events FOR INSERT WITH CHECK (auth.uid() = user_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can update their own maintenance events' AND tablename = 'maintenance_events') THEN
        CREATE POLICY "Users can update their own maintenance events" ON maintenance_events FOR UPDATE USING (auth.uid() = user_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can delete their own maintenance events' AND tablename = 'maintenance_events') THEN
        CREATE POLICY "Users can delete their own maintenance events" ON maintenance_events FOR DELETE USING (auth.uid() = user_id);
    END IF;
END $$;



/* ========================================================= */
/* DATEI: migrate_customers_address_number.sql */
/* ========================================================= */

-- Remove unique constraint from customer_number if it exists
ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_customer_number_key;

-- Add address_number column to customers table if not exists
ALTER TABLE customers ADD COLUMN IF NOT EXISTS address_number text;

-- Make address_number unique (add constraint)
ALTER TABLE customers ADD CONSTRAINT customers_address_number_key UNIQUE (address_number);



/* ========================================================= */
/* DATEI: procurements_add_files_migration.sql */
/* ========================================================= */

-- Migration: Add JSONB files column to procurements
-- This column will store an array of file objects, similar to the machines table.
-- Format: [{ url: '...', name: '...', type: '...' }]

ALTER TABLE public.procurements 
ADD COLUMN IF NOT EXISTS files JSONB DEFAULT '[]'::jsonb;



/* ========================================================= */
/* DATEI: procurements_schema.sql */
/* ========================================================= */

-- Create procurements table
CREATE TABLE IF NOT EXISTS public.procurements (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    order_number TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    quantity INTEGER DEFAULT 1,
    category TEXT CHECK (category IN ('machine_part', 'workshop_supplies', 'tools', 'office_supplies', 'other')),
    priority TEXT CHECK (priority IN ('low', 'normal', 'high')) DEFAULT 'normal',
    delivery_date DATE,
    product_link TEXT,
    file_url TEXT,
    location_ref TEXT,
    remarks TEXT,
    status TEXT CHECK (status IN ('new', 'in_progress', 'ordered', 'received', 'cancelled')) DEFAULT 'new',
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.procurements ENABLE ROW LEVEL SECURITY;

-- Policies for procurements
CREATE POLICY "Enable read access for all authenticated users" ON public.procurements
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Enable insert access for all authenticated users" ON public.procurements
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update access for all authenticated users" ON public.procurements
    FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Enable delete access for all authenticated users" ON public.procurements
    FOR DELETE USING (auth.role() = 'authenticated');


-- Create procurement_comments table
CREATE TABLE IF NOT EXISTS public.procurement_comments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    procurement_id UUID REFERENCES public.procurements(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id),
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.procurement_comments ENABLE ROW LEVEL SECURITY;

-- Policies for procurement_comments
CREATE POLICY "Enable read access for all authenticated users" ON public.procurement_comments
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Enable insert access for all authenticated users" ON public.procurement_comments
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_procurements_updated_at
    BEFORE UPDATE ON public.procurements
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();



/* ========================================================= */
/* DATEI: protocols_add_pdf_migration.sql */
/* ========================================================= */

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



/* ========================================================= */
/* DATEI: protocols_schema.sql */
/* ========================================================= */

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



/* ========================================================= */
/* DATEI: protocol_templates_category_migration.sql */
/* ========================================================= */

-- Add category_id to protocol_templates table
ALTER TABLE protocol_templates ADD COLUMN IF NOT EXISTS category_id bigint REFERENCES categories(id) ON DELETE SET NULL;

-- Update existing templates if possible (placeholders until we know exact IDs)
-- For now, let's just add the column. 
-- The user can associate them via the UI we're about to build.



/* ========================================================= */
/* DATEI: protocol_templates_migration.sql */
/* ========================================================= */

-- Create protocol_templates table
CREATE TABLE IF NOT EXISTS protocol_templates (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    structure jsonb NOT NULL DEFAULT '[]'::jsonb,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE protocol_templates ENABLE ROW LEVEL SECURITY;

-- Create policy for public read (adjust if needed for authenticated users)
CREATE POLICY "Enable read access for all users" ON protocol_templates
    FOR SELECT USING (true);

-- Create policy for all access (for now, similar to other tables in this project)
CREATE POLICY "Enable all access for all users" ON protocol_templates
    FOR ALL USING (true);

-- Initial templates insertion
INSERT INTO protocol_templates (name, structure) VALUES 
('Abnahmeprotokoll Rotorschaufel', '[
    {
        "group_title": "1. Abschluss SichtprÃ¼fung",
        "items": [
            {"type": "checkbox", "label": "Keine SchweiÃŸnahtbrÃ¼che", "has_description": true, "placeholder": "Anmerkung zur SichtprÃ¼fung..."},
            {"type": "checkbox", "label": "VerschlÃ¼sse & Deckel fest", "has_description": true, "placeholder": "Sind alle VerschlÃ¼sse gesichert?"}
        ]
    }
]'::jsonb),
('Abnahmeprotokoll Selbstfahrender Umsetzer', '[]'::jsonb),
('Eingangsprotokoll Selbstfahrender Umsetzer', '[]'::jsonb);



/* ========================================================= */
/* DATEI: protocol_templates_type_migration.sql */
/* ========================================================= */

-- Add type column to protocol_templates table
ALTER TABLE protocol_templates ADD COLUMN IF NOT EXISTS type text;

-- Add check constraint to ensure only allowed types (optional but recommended)
-- ALTER TABLE protocol_templates ADD CONSTRAINT check_template_type CHECK (type IN ('intake', 'acceptance'));

COMMENT ON COLUMN protocol_templates.type IS 'Distinguishes between intake (Eingang) and acceptance (Abnahme) templates';



/* ========================================================= */
/* DATEI: tasks_add_completed_columns_migration.sql */
/* ========================================================= */

-- Migration to add completed_at and completed_by columns to tasks table
ALTER TABLE public.tasks
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS completed_by BIGINT REFERENCES public.users(id) ON DELETE SET NULL DEFAULT NULL;



/* ========================================================= */
/* DATEI: tasks_add_machine_migration.sql */
/* ========================================================= */

-- Migration: Add machine_id to tasks table
-- This replaces the project_id concept to tie tasks directly to machines

ALTER TABLE public.tasks 
ADD COLUMN IF NOT EXISTS machine_id BIGINT REFERENCES public.machines(id) ON DELETE SET NULL;



/* ========================================================= */
/* DATEI: tasks_schema.sql */
/* ========================================================= */

-- Projects Table
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Tasks Table
CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
    status TEXT DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'completed', 'on_hold')),
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    category_id BIGINT REFERENCES categories(id) ON DELETE SET NULL,
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,-- Deadline
    expected_time INTERVAL,
    actual_time INTERVAL DEFAULT '0 minutes'::interval,
    assigned_to BIGINT[] DEFAULT '{}',
    created_by BIGINT REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Subtasks Table
CREATE TABLE IF NOT EXISTS subtasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    status TEXT DEFAULT 'open' CHECK (status IN ('open', 'completed')),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Task Dependencies
CREATE TABLE IF NOT EXISTS task_dependencies (
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    depends_on_task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, depends_on_task_id)
);

-- Task Comments
CREATE TABLE IF NOT EXISTS task_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    user_id BIGINT REFERENCES users(id),
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Task History
CREATE TABLE IF NOT EXISTS task_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    user_id BIGINT REFERENCES users(id),
    field_changed TEXT,
    old_value TEXT,
    new_value TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE subtasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_history ENABLE ROW LEVEL SECURITY;

-- Create basic policies (Allow everything for now as per previous patterns in the project)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all for projects') THEN
        CREATE POLICY "Allow all for projects" ON projects FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all for tasks') THEN
        CREATE POLICY "Allow all for tasks" ON tasks FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all for subtasks') THEN
        CREATE POLICY "Allow all for subtasks" ON subtasks FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all for task_dependencies') THEN
        CREATE POLICY "Allow all for task_dependencies" ON task_dependencies FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all for task_comments') THEN
        CREATE POLICY "Allow all for task_comments" ON task_comments FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all for task_history') THEN
        CREATE POLICY "Allow all for task_history" ON task_history FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;



/* ========================================================= */
/* DATEI: task_templates_schema.sql */
/* ========================================================= */

-- 1. SUPERGROUP TEMPLATES (Ãœbergruppen)
CREATE TABLE IF NOT EXISTS task_supergroups_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. SUBTASK TEMPLATES (Unteraufgaben-Bausteine)
CREATE TABLE IF NOT EXISTS task_subtask_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL UNIQUE,
    action_type TEXT, -- 'intake', 'acceptance', etc.
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. QUICK TEMPLATES (Schnellvorlagen)
CREATE TABLE IF NOT EXISTS task_quick_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    structure JSONB NOT NULL, -- Array of {name: "Group", subtasks: ["ST1", "ST2"]}
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. UPDATE EXISTING TABLES
ALTER TABLE subtasks ADD COLUMN IF NOT EXISTS supergroup TEXT;
ALTER TABLE subtasks ADD COLUMN IF NOT EXISTS action_type TEXT;

-- 5. ENABLE RLS
ALTER TABLE task_supergroups_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_subtask_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_quick_templates ENABLE ROW LEVEL SECURITY;

-- 6. POLICIES
DROP POLICY IF EXISTS "Enable all for everyone" ON task_supergroups_templates;
CREATE POLICY "Enable all for everyone" ON task_supergroups_templates FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Enable all for everyone" ON task_subtask_templates;
CREATE POLICY "Enable all for everyone" ON task_subtask_templates FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Enable all for everyone" ON task_quick_templates;
CREATE POLICY "Enable all for everyone" ON task_quick_templates FOR ALL USING (true) WITH CHECK (true);



/* ========================================================= */
/* DATEI: update_machines_schema.sql */
/* ========================================================= */

ALTER TABLE machines ADD COLUMN IF NOT EXISTS files jsonb DEFAULT '[]'::jsonb;

-- Weitere Maschinen & Zusatzausrüstung (optional; wird zusätzlich in files-meta gespeichert)
ALTER TABLE machines ADD COLUMN IF NOT EXISTS related_machine_ids jsonb DEFAULT '[]'::jsonb;
ALTER TABLE machines ADD COLUMN IF NOT EXISTS additional_equipment jsonb DEFAULT '[]'::jsonb;



/* ========================================================= */
/* DATEI: update_service_entries_checklist.sql */
/* ========================================================= */

-- Migration to support storing dynamic checklists in service entries
ALTER TABLE service_entries ADD COLUMN IF NOT EXISTS checklist_payload jsonb;



/* ========================================================= */
/* DATEI: update_service_entries_signature.sql */
/* ========================================================= */

-- Add travel distance, travel time, signature, and signee name to service_entries table
ALTER TABLE service_entries ADD COLUMN IF NOT EXISTS travel_distance_km numeric(6,2);
ALTER TABLE service_entries ADD COLUMN IF NOT EXISTS travel_time_minutes integer;
ALTER TABLE service_entries ADD COLUMN IF NOT EXISTS customer_signature text;
ALTER TABLE service_entries ADD COLUMN IF NOT EXISTS customer_name text;



/* ========================================================= */
/* DATEI: update_service_entries_tasks_materials.sql */
/* ========================================================= */

-- Add tasks and materials JSONB tables to service_entries table
ALTER TABLE service_entries ADD COLUMN IF NOT EXISTS tasks jsonb;
ALTER TABLE service_entries ADD COLUMN IF NOT EXISTS materials jsonb;



/* ========================================================= */
/* DATEI: update_service_entries_worklog.sql */
/* ========================================================= */

-- Add operating hours, work log (JSONB table), and status checkboxes to service_entries table
ALTER TABLE service_entries ADD COLUMN IF NOT EXISTS operating_hours text;
ALTER TABLE service_entries ADD COLUMN IF NOT EXISTS work_log jsonb;
ALTER TABLE service_entries ADD COLUMN IF NOT EXISTS status_repaired boolean DEFAULT false;
ALTER TABLE service_entries ADD COLUMN IF NOT EXISTS status_repaired_en boolean DEFAULT false;



/* ========================================================= */
/* DATEI: update_service_entries_workshop_order_number.sql */
/* ========================================================= */

-- Add workshop_order_number column to service_entries table
ALTER TABLE service_entries ADD COLUMN IF NOT EXISTS workshop_order_number text;



/* ========================================================= */
/* DATEI: users_permissions_migration.sql */
/* ========================================================= */

-- Migration to add permissions and pin to users table

-- Add permissions column (JSONB) to store access rights
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{"home": true, "tasks": true, "procurements": true, "machines": true, "history": true, "accounting": true, "settings": true}'::jsonb;

-- Add pin column (TEXT) to store the 4-digit PIN for protected profiles
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS pin TEXT DEFAULT NULL;

-- Keep RLS simple for now, as users will read all rows anyway.
-- No change to policies needed if they are already readable.






/* ========================================================= */
/* DATEI: add_assigned_users_to_internal_processes.sql */
/* ========================================================= */

-- Mitarbeiter-Zuordnung fuer interne Vorgaenge (Vorgang hinzufuegen)
ALTER TABLE internal_processes
ADD COLUMN IF NOT EXISTS assigned_users jsonb DEFAULT '[]'::jsonb;



/* ========================================================= */
/* DATEI: add_workshop_order_number_to_tasks.sql */
/* ========================================================= */

-- Aufgaben ohne Maschinenbezug: Werkstattauftragsnummer statt Maschine
ALTER TABLE public.tasks
ADD COLUMN IF NOT EXISTS workshop_order_number TEXT;



/* ========================================================= */
/* DATEI: add_tech_signature_to_service_entries.sql */
/* ========================================================= */

-- Unterschrift des Technikers ebenfalls speichern (analog zu customer_signature)
ALTER TABLE public.service_entries
ADD COLUMN IF NOT EXISTS tech_signature TEXT;



/* ========================================================= */
/* DATEI: add_remark_to_internal_processes.sql */
/* ========================================================= */

-- Separates Bemerkungs-/Beschreibungsfeld fuer interne Vorgaenge (zusaetzlich zum E-Mail-Text in 'description')
ALTER TABLE internal_processes
ADD COLUMN IF NOT EXISTS remark text;



/* ========================================================= */
/* DATEI: add_workshop_order_number_to_internal_processes.sql */
/* ========================================================= */

-- Verknuepfung eines Vorgangs mit einem Werkstattauftrag (ohne Maschinenbezug)
ALTER TABLE internal_processes
ADD COLUMN IF NOT EXISTS workshop_order_number text;



/* ========================================================= */
/* DATEI: add_contact_person_and_hotel_to_service_entries.sql */
/* ========================================================= */

-- Ansprechpartner / Telefon (zwischen Betreiber und Maschinenstandort auf dem Beleg)
ALTER TABLE public.service_entries
ADD COLUMN IF NOT EXISTS contact_person text;

-- Hotel / Unterkunft (analog zu Maschinenstandort, optional pro Servicebericht)
ALTER TABLE public.service_entries
ADD COLUMN IF NOT EXISTS hotel_company text;
ALTER TABLE public.service_entries
ADD COLUMN IF NOT EXISTS hotel_street text;
ALTER TABLE public.service_entries
ADD COLUMN IF NOT EXISTS hotel_zip text;
ALTER TABLE public.service_entries
ADD COLUMN IF NOT EXISTS hotel_city text;
ALTER TABLE public.service_entries
ADD COLUMN IF NOT EXISTS hotel_country text;
