-- ============================================================================
-- ZUWEISUNGEN QUITTIEREN  ("Vorgang erhalten")
-- ----------------------------------------------------------------------------
-- Einmalig im Supabase SQL-Editor ausführen, wiederholbar.
--
-- Ablauf, den diese Tabelle trägt:
--   1. Ein Vorgang wird jemandem zugewiesen (internal_processes.assigned_users).
--   2. Beim Empfänger geht ein Fenster auf: „Jetzt erledigen" oder
--      „Später erinnern" (10 Min. / 30 Min. / 1 Std. / 2 Std. / morgen 8:00).
--   3. „Jetzt erledigen" setzt status = 'angenommen' + responded_at.
--   4. Der Ersteller bekommt daraufhin die Meldung „X hat den Vorgang erhalten".
--      Sobald er sie gesehen hat, wird seen_by_owner gesetzt — sonst käme sie
--      bei jedem Neuladen wieder.
--
-- ABSICHTLICH ohne Fremdschlüssel auf das Ziel:
--   target_id ist text, weil internal_processes.id je nach Setup uuid ODER
--   bigint ist (siehe supabase_add_process_customer.sql) und weil später
--   weitere Ziel-Arten dazukommen sollen. Verwaiste Zeilen nach dem Löschen
--   eines Vorgangs sind unsichtbar — die App schlägt das Ziel ohnehin nach
--   und überspringt, was es nicht mehr gibt.
--
-- Aufgaben sind hier bewusst NICHT vorgesehen (Entscheidung 15.08.2026,
-- bestätigt 20.08.2026): sie laufen als Anzeigetafel auf dem Werkstatt-
-- Fernseher, davor steht niemand mit einem Gerät zum Quittieren.
--
-- Typen: users.id ist bigint. target_id bewusst text (s.o.).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.assignment_responses (
    id               bigserial PRIMARY KEY,
    target_type      text        NOT NULL DEFAULT 'process',   -- 'process' | 'step' | später mehr
    target_id        text        NOT NULL,                     -- Vorgang: "<id>"
                                                               -- Schritt: "<vorgang-id>::<schritt-id>"
    title            text,                                     -- Anzeigetitel, damit das
                                                               -- Fenster ohne Nachschlagen aufgeht
    user_id          bigint      NOT NULL,                     -- public.users.id (Empfänger)
    user_name        text,
    status           text        NOT NULL DEFAULT 'offen',     -- offen | angenommen
    snooze_until     timestamptz,                              -- vorher kein Fenster
    responded_at     timestamptz,
    invited_by       bigint,                                   -- public.users.id (Ersteller)
    invited_by_name  text,
    seen_by_owner    boolean     NOT NULL DEFAULT false,
    created_at       timestamptz NOT NULL DEFAULT now()
);

-- Eine Zeile je Ziel und Empfänger. Der Client stützt sich darauf: er legt
-- fehlende Zeilen per upsert an, ohne vorher zu prüfen.
CREATE UNIQUE INDEX IF NOT EXISTS assignment_responses_unique
    ON public.assignment_responses (target_type, target_id, user_id);

-- „Was muss ICH noch quittieren?"
CREATE INDEX IF NOT EXISTS assignment_responses_open
    ON public.assignment_responses (user_id, status);

-- „Wer hat MEINE Vorgänge angenommen?"
CREATE INDEX IF NOT EXISTS assignment_responses_owner
    ON public.assignment_responses (invited_by, seen_by_owner);

ALTER TABLE public.assignment_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations for assignment_responses" ON public.assignment_responses;
CREATE POLICY "Allow all operations for assignment_responses" ON public.assignment_responses
    FOR ALL USING (true) WITH CHECK (true);

-- Live-Zustellung: ohne das kommt das Fenster erst beim nächsten Takt (20 s),
-- mit dem hier sofort.
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.assignment_responses;
EXCEPTION
    WHEN duplicate_object THEN NULL;   -- schon drin
    WHEN undefined_object THEN NULL;   -- Publication heißt anders / gibt es nicht
END $$;

-- Kontrolle:
--   select target_id, user_name, status, snooze_until, responded_at
--   from public.assignment_responses order by created_at desc limit 20;
