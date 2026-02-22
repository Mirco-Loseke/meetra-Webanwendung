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
