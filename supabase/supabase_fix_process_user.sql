-- ============================================================
-- ERSTELLER AN VORGÄNGEN UND EREIGNISSEN (bigint statt uuid)
-- ============================================================
-- Fehlerbild: "invalid input syntax for type uuid: \"1\"" beim Speichern
-- eines Vorgangs (auch aus Adressen -> Vorgänge).
--
-- Ursache: Die App-Nutzer stehen in public.users mit einer bigint-ID (1, 2, 3 …).
-- internal_processes.user_id und maintenance_events.user_id sind dagegen
-- uuid-Spalten (aus dem Ursprungsschema, FK-Gedanke auf auth.users). Die
-- bigint-ID passt dort nicht hinein.
--
-- Lösung: eine eigene Spalte created_by_user (bigint) für den App-Nutzer.
-- Die alten uuid-Spalten bleiben unangetastet — sie werden nirgends gelesen.
--
-- Idempotent: mehrfaches Ausführen ist unschädlich.
-- ============================================================

ALTER TABLE public.internal_processes
    ADD COLUMN IF NOT EXISTS created_by_user bigint
    REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.maintenance_events
    ADD COLUMN IF NOT EXISTS created_by_user bigint
    REFERENCES public.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_internal_processes_created_by_user
    ON public.internal_processes(created_by_user);

CREATE INDEX IF NOT EXISTS idx_maintenance_events_created_by_user
    ON public.maintenance_events(created_by_user);
