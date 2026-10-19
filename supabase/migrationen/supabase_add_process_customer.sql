-- ============================================================
-- ADRESSBEZUG UND ERINNERUNG FÜR VORGÄNGE (internal_processes)
-- ============================================================
-- Bisher konnte ein Vorgang nur an eine Maschine (machine_id) oder einen
-- Werkstattauftrag gehängt werden. Vorgänge, die im Adressbuch entstehen,
-- gehören aber zu einer Adresse/Firma statt zu einer Maschine.
--
--   customer_id -> Adresse aus public.customers
--   remind_at   -> optionale Erinnerung ("melde dich am ...")
--
-- In der Vorgänge-Liste wird bei gesetzter customer_id der Firmenname an der
-- Stelle angezeigt, an der sonst die Maschine steht.
--
-- Idempotent: mehrfaches Ausführen ist unschädlich.
-- ============================================================

-- customer_id folgt dem Typ von public.customers.id (je nach Setup uuid oder bigint).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'internal_processes'
           AND column_name = 'customer_id'
    ) THEN
        EXECUTE format(
            'ALTER TABLE public.internal_processes ADD COLUMN customer_id %s REFERENCES public.customers(id) ON DELETE SET NULL',
            (SELECT data_type FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'customers' AND column_name = 'id')
        );
    END IF;
END $$;

-- Ansprechpartner als Freitext (die Kontakte hängen an der Adresse, ein harter
-- FK würde das Löschen eines Kontakts unnötig blockieren).
ALTER TABLE public.internal_processes
    ADD COLUMN IF NOT EXISTS contact_name text;

-- Erinnerung: Zeitpunkt, zu dem der Vorgang wieder hochkommen soll.
ALTER TABLE public.internal_processes
    ADD COLUMN IF NOT EXISTS remind_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_internal_processes_customer_id
    ON public.internal_processes(customer_id);

CREATE INDEX IF NOT EXISTS idx_internal_processes_remind_at
    ON public.internal_processes(remind_at);
