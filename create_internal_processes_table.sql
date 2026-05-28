-- Neue Tabelle für Kalender-Vorgänge (E-Mails & Notizen) erstellen
CREATE TABLE IF NOT EXISTS internal_processes (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    title text NOT NULL, -- E-Mail-Betreff / Titel
    process_type text NOT NULL DEFAULT 'email_incoming', -- 'email_incoming', 'email_outgoing', 'note', 'manual'
    sender text, -- Absender-Adresse / Name
    recipient text, -- Empfänger-Adresse / Name
    process_date timestamptz DEFAULT now(), -- E-Mail-Datum
    machine_id bigint REFERENCES machines(id) ON DELETE SET NULL, -- Verknüpfte Maschine
    description text, -- E-Mail-Inhalt / Beschreibung
    status text DEFAULT 'offen', -- 'offen', 'in_bearbeitung', 'erledigt'
    user_id uuid DEFAULT auth.uid(),
    created_at timestamptz DEFAULT now()
);

-- RLS aktivieren
ALTER TABLE internal_processes ENABLE ROW LEVEL SECURITY;

-- RLS Richtlinien für Benutzer
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
