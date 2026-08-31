-- ===========================================================================
-- Benachrichtigungs-Einstellungen je Benutzer — geräteübergreifend
-- ---------------------------------------------------------------------------
-- Bisher lagen die Einstellungen nur in localStorage: wer vom Rechner aufs
-- Handy wechselte, fing wieder bei den Voreinstellungen an. Jetzt liegt der
-- Stand in der Datenbank, localStorage bleibt als schneller Zwischenspeicher
-- (und als Rückfall, solange keine Verbindung besteht).
--
-- Eine Zeile je Benutzer, der Inhalt als JSON — so kostet jede neue
-- Einstellung (neue Meldungsart, neuer Abstand) keine weitere Migration.
--
-- Einmalig im Supabase SQL-Editor ausführen.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.notification_preferences (
    user_id    uuid PRIMARY KEY,
    prefs      jsonb NOT NULL DEFAULT '{}'::jsonb,
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Zugriff erlauben (die App nutzt ihre eigene Anmeldung, nicht Supabase-Auth).
-- Ohne Policy scheitert das Schreiben mit "row-level security policy" (42501).
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notification_preferences_all" ON public.notification_preferences;
CREATE POLICY "notification_preferences_all"
    ON public.notification_preferences
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- Kontrolle:
-- SELECT user_id, prefs, updated_at FROM public.notification_preferences;
