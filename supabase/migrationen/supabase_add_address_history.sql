-- ============================================================================
-- ADRESS-VERLAUF  (Knopf "Verlauf" im Kopf des Adressbuchs)
-- ----------------------------------------------------------------------------
-- Einmalig im Supabase SQL-Editor ausführen.
--
-- Merkt sich je Benutzer, welche Adressen er zuletzt geöffnet oder bearbeitet
-- hat — damit der Verlauf auf allen Geräten derselbe ist (Rechner, iPad,
-- Handy) und nicht nur im Browser, in dem geklickt wurde.
--
-- Optional: Ohne diese Tabelle funktioniert der Verlauf vollständig, er liegt
-- dann nur lokal im Browser (localStorage) und ist gerätegebunden.
-- Die App erkennt das automatisch.
--
-- Pro Benutzer und Adresse gibt es genau EINE Zeile (unique). Ein erneutes
-- Öffnen aktualisiert nur den Zeitstempel, statt die Tabelle vollzuschreiben.
--
-- Achtung bei den Typen:
--   customer_id ist uuid  (public.customers.id)   -- NIE bigint
--   user_id     ist bigint(public.users.id)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.address_history (
    id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id      bigint NOT NULL,                                    -- public.users.id
    customer_id  uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    action       text NOT NULL DEFAULT 'view',                       -- 'view' | 'edit'
    viewed_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_address_history_user_customer
    ON public.address_history (user_id, customer_id);

CREATE INDEX IF NOT EXISTS idx_address_history_recent
    ON public.address_history (user_id, viewed_at DESC);

ALTER TABLE public.address_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations for address_history" ON public.address_history;
CREATE POLICY "Allow all operations for address_history" ON public.address_history
    FOR ALL USING (true) WITH CHECK (true);
