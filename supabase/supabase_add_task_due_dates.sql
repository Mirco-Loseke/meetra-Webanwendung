-- ============================================================
-- ERINNERUNGEN / FÄLLIGKEITEN AN VORGÄNGE UND SCHRITTE
-- ============================================================
-- Fügt tasks.due_date und subtasks.due_date hinzu. Beide sind optional.
-- Wenn kein Datum gesetzt ist, wird der Vorgang/Schritt einfach als
-- „ohne Erinnerung" behandelt. Die Werte werden auch von der
-- KI‑Vorgangserstellung (Adressbuch → Vorgänge → KI‑Analyse) gesetzt,
-- wenn z. B. „bis Ende der Woche" erkannt wird.
-- Idempotent: mehrfaches Ausführen ist unschädlich.
-- ============================================================

ALTER TABLE public.tasks
    ADD COLUMN IF NOT EXISTS due_date date;

ALTER TABLE public.subtasks
    ADD COLUMN IF NOT EXISTS due_date date;

-- customer_id verknüpft einen Vorgang direkt mit einer Adresse aus
-- customers. Ohne diese Spalte fällt das Adressbuch auf eine langsame
-- Textsuche in der Beschreibung zurück und die REST-API antwortet mit 400.
-- Der Typ folgt public.customers.id (bei den bestehenden Setups uuid).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'tasks' AND column_name = 'customer_id'
    ) THEN
        EXECUTE format(
            'ALTER TABLE public.tasks ADD COLUMN customer_id %s REFERENCES public.customers(id) ON DELETE SET NULL',
            (SELECT data_type FROM information_schema.columns
              WHERE table_schema='public' AND table_name='customers' AND column_name='id')
        );
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_tasks_due_date    ON public.tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_customer_id ON public.tasks(customer_id);
CREATE INDEX IF NOT EXISTS idx_subtasks_due_date ON public.subtasks(due_date);
