-- 1. Kategorien erweitern (Wartungsintervall hinzufügen)
ALTER TABLE categories ADD COLUMN IF NOT EXISTS default_maintenance_interval_months integer DEFAULT 12;

-- 2. Maschinen erweitern (Wartungsdaten hinzufügen)
ALTER TABLE machines ADD COLUMN IF NOT EXISTS last_maintenance_date timestamptz;
ALTER TABLE machines ADD COLUMN IF NOT EXISTS next_maintenance_date timestamptz;
ALTER TABLE machines ADD COLUMN IF NOT EXISTS maintenance_interval_months integer;

-- 3. Serviceberichte erweitern (manueller Termin-Override)
ALTER TABLE service_entries ADD COLUMN IF NOT EXISTS next_maintenance_date_override timestamptz;

-- 4. Neue Tabelle für Kalender-Events erstellen
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

-- 5. RLS für neue Tabelle aktivieren
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
