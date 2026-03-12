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
