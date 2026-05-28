-- Indizes für schnelle Kundensuche und Zuordnung
CREATE INDEX IF NOT EXISTS idx_customers_search_name ON customers (name);
CREATE INDEX IF NOT EXISTS idx_customers_search_match ON customers (matchcode);
CREATE INDEX IF NOT EXISTS idx_machines_customer_id ON machines (customer_id);

-- Indizes für Serviceberichte und Protokolle
CREATE INDEX IF NOT EXISTS idx_service_entries_machine ON service_entries (machine_id);
CREATE INDEX IF NOT EXISTS idx_service_entries_date ON service_entries (date DESC);
CREATE INDEX IF NOT EXISTS idx_protocols_machine_id ON intake_protocols (machine_id);
CREATE INDEX IF NOT EXISTS idx_protocols_acceptance_machine ON acceptance_protocols (machine_id);
