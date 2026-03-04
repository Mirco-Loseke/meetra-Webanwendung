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
