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
        "group_title": "1. Abschluss Sichtprüfung",
        "items": [
            {"type": "checkbox", "label": "Keine Schweißnahtbrüche", "has_description": true, "placeholder": "Anmerkung zur Sichtprüfung..."},
            {"type": "checkbox", "label": "Verschlüsse & Deckel fest", "has_description": true, "placeholder": "Sind alle Verschlüsse gesichert?"}
        ]
    }
]'::jsonb),
('Abnahmeprotokoll Selbstfahrender Umsetzer', '[]'::jsonb),
('Eingangsprotokoll Selbstfahrender Umsetzer', '[]'::jsonb);
