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
CREATE POLICY "Enable read access for all authenticated users" ON public.accounting
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Enable insert access for all authenticated users" ON public.accounting
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update access for all authenticated users" ON public.accounting
    FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Enable delete access for all authenticated users" ON public.accounting
    FOR DELETE USING (auth.role() = 'authenticated');

-- Trigger for updated_at
CREATE TRIGGER update_accounting_updated_at
    BEFORE UPDATE ON public.accounting
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
