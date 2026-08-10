-- ============================================================================
-- ADRESSBUCH / KONTAKTE  (Seite "Adressbuch" in der Webapp)
-- ----------------------------------------------------------------------------
-- Einmalig im Supabase SQL-Editor ausführen.
--
-- Erweitert die bestehende Tabelle `customers` (= alle Adressen aus dem
-- Sage-Import) um Webseite/Notiz/Kunden-Kennzeichen und legt drei
-- Zusatztabellen an:
--   customer_contacts  – Ansprechpartner je Adresse
--   customer_links     – Verknüpfungen zwischen Adressen (Lieferadresse,
--                        Rechnungsadresse, Konzern/Filiale ...)
--   customer_notes     – Historie/Notizen je Adresse
--
-- Alle drei hängen per ON DELETE CASCADE an der Adresse: wird eine Adresse
-- im Adressbuch endgültig gelöscht, verschwinden Ansprechpartner,
-- Verknüpfungen und Historie automatisch mit.
--
-- Der Datentyp von customers.id wird dynamisch ermittelt (bigint ODER uuid),
-- damit dieses Skript unabhängig vom ursprünglichen Tabellen-Setup läuft.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Zusatzfelder auf customers
-- ---------------------------------------------------------------------------
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS website text;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS notes text;
-- is_customer: manuelles Kennzeichen "das ist ein Kunde, nicht nur eine Adresse".
-- Die App wertet zusätzlich customer_number aus (Kundennummer vorhanden => Kunde),
-- dieses Flag erlaubt aber das explizite Setzen ohne Kundennummer.
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS is_customer boolean DEFAULT false;

-- Bestehende Datensätze mit Kundennummer direkt als Kunde markieren
UPDATE public.customers
SET is_customer = true
WHERE is_customer IS DISTINCT FROM true
  AND customer_number IS NOT NULL
  AND btrim(customer_number) <> '';

-- ---------------------------------------------------------------------------
-- 2) Zusatztabellen
-- ---------------------------------------------------------------------------
DO $mig$
DECLARE
    cid_type text;
BEGIN
    SELECT format_type(a.atttypid, a.atttypmod)
      INTO cid_type
      FROM pg_attribute a
     WHERE a.attrelid = 'public.customers'::regclass
       AND a.attname  = 'id'
       AND a.attnum   > 0
       AND NOT a.attisdropped;

    IF cid_type IS NULL THEN
        RAISE EXCEPTION 'Spalte customers.id nicht gefunden – Migration abgebrochen.';
    END IF;

    -- ---- Ansprechpartner ---------------------------------------------------
    EXECUTE format($ddl$
        CREATE TABLE IF NOT EXISTS public.customer_contacts (
            id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
            customer_id %s NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
            salutation  text,
            name        text NOT NULL,
            position    text,
            department  text,
            phone       text,
            mobile      text,
            email       text,
            notes       text,
            is_primary  boolean DEFAULT false,
            created_at  timestamptz DEFAULT now()
        )$ddl$, cid_type);

    -- ---- Verknüpfte Adressen ----------------------------------------------
    -- link_type: 'lieferadresse' | 'rechnungsadresse' | 'zentrale' |
    --            'filiale' | 'konzern' | 'sonstige'
    EXECUTE format($ddl$
        CREATE TABLE IF NOT EXISTS public.customer_links (
            id                 uuid DEFAULT gen_random_uuid() PRIMARY KEY,
            customer_id        %1$s NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
            linked_customer_id %1$s NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
            link_type          text NOT NULL DEFAULT 'sonstige',
            note               text,
            created_at         timestamptz DEFAULT now(),
            CONSTRAINT customer_links_no_self CHECK (customer_id <> linked_customer_id)
        )$ddl$, cid_type);

    -- ---- Historie / Notizen ------------------------------------------------
    -- entry_type: 'note' | 'call' | 'email' | 'visit' | 'meeting' | 'system'
    EXECUTE format($ddl$
        CREATE TABLE IF NOT EXISTS public.customer_notes (
            id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
            customer_id %s NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
            entry_type  text NOT NULL DEFAULT 'note',
            title       text,
            body        text,
            author      text,
            entry_date  date DEFAULT current_date,
            created_at  timestamptz DEFAULT now()
        )$ddl$, cid_type);
END
$mig$;

-- ---------------------------------------------------------------------------
-- 3) Indizes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_customer_contacts_customer_id ON public.customer_contacts(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_links_customer_id    ON public.customer_links(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_links_linked_id      ON public.customer_links(linked_customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_notes_customer_id    ON public.customer_notes(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_notes_created_at     ON public.customer_notes(created_at DESC);

-- Eine Verknüpfung nur einmal pro Richtung/Typ
CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_links_pair
    ON public.customer_links(customer_id, linked_customer_id, link_type);

-- ---------------------------------------------------------------------------
-- 4) RLS-Policies (analog zu den übrigen Tabellen dieses Projekts)
-- ---------------------------------------------------------------------------
ALTER TABLE public.customer_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_links    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_notes    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations for customer_contacts" ON public.customer_contacts;
CREATE POLICY "Allow all operations for customer_contacts" ON public.customer_contacts
    FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all operations for customer_links" ON public.customer_links;
CREATE POLICY "Allow all operations for customer_links" ON public.customer_links
    FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all operations for customer_notes" ON public.customer_notes;
CREATE POLICY "Allow all operations for customer_notes" ON public.customer_notes
    FOR ALL USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 5) Maschinen beim Löschen einer Adresse NICHT mitlöschen
-- ---------------------------------------------------------------------------
-- machines.customer_id soll beim endgültigen Löschen einer Adresse auf NULL
-- gesetzt werden statt die Maschine zu entfernen oder das Löschen zu blockieren.
DO $fk$
DECLARE
    con record;
BEGIN
    FOR con IN
        SELECT c.conname
          FROM pg_constraint c
          JOIN pg_attribute a
            ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
         WHERE c.conrelid = 'public.machines'::regclass
           AND c.contype  = 'f'
           AND c.confrelid = 'public.customers'::regclass
           AND a.attname  = 'customer_id'
    LOOP
        EXECUTE format('ALTER TABLE public.machines DROP CONSTRAINT %I', con.conname);
    END LOOP;

    BEGIN
        ALTER TABLE public.machines
            ADD CONSTRAINT machines_customer_id_fkey
            FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;
    EXCEPTION WHEN others THEN
        RAISE NOTICE 'machines.customer_id FK konnte nicht gesetzt werden: %', SQLERRM;
    END;
END
$fk$;
