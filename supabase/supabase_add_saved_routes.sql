-- ============================================================================
-- GESPEICHERTE ROUTEN  (Seite "Routenplanung")
-- ----------------------------------------------------------------------------
-- Einmalig im Supabase SQL-Editor ausführen.
--
-- Speichert benannte Touren, damit eine geplante Route auf einem anderen Gerät
-- (z.B. iPad im Fahrzeug) wieder geladen werden kann.
--
-- Optional: Ohne diese Tabelle funktioniert die Routenplanung vollständig,
-- gespeicherte Routen liegen dann nur lokal im Browser (localStorage) und sind
-- nicht geräteübergreifend verfügbar. Die App erkennt das automatisch.
--
-- `stops` ist ein JSON-Array der Stopps in Reihenfolge, jeweils:
--   { "customerId": 123, "label": "...", "address": "...", "lat": 0, "lng": 0 }
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.saved_routes (
    id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name        text NOT NULL,
    stops       jsonb NOT NULL DEFAULT '[]'::jsonb,
    total_km    numeric,
    total_min   integer,
    author      text,
    created_at  timestamptz DEFAULT now(),
    updated_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_saved_routes_created_at ON public.saved_routes(created_at DESC);

ALTER TABLE public.saved_routes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations for saved_routes" ON public.saved_routes;
CREATE POLICY "Allow all operations for saved_routes" ON public.saved_routes
    FOR ALL USING (true) WITH CHECK (true);
