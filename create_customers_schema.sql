-- Erstellt die Tabelle für importierte Sage 100 Kundenadressen
CREATE TABLE IF NOT EXISTS customers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_number text UNIQUE, -- Sage 100 Kundennummer
    matchcode text,              -- Sage 100 Matchcode
    name text NOT NULL,          -- Firmenname (Firma)
    street text,                 -- Straße und Hausnummer
    zip_code text,               -- PLZ
    city text,                   -- Ort
    country text DEFAULT 'Deutschland',
    phone text,                  -- Telefon
    email text,                  -- E-Mail
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Hinzufügen der aufgeteilten Felder zur Tabelle 'machines'
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

-- Tabelle für globale Einstellungen (Firmenadresse, etc.)
CREATE TABLE IF NOT EXISTS app_settings (
    key text PRIMARY KEY,
    value jsonb NOT NULL
);
