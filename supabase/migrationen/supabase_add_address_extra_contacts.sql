-- ============================================================================
--  Weitere Telefonnummern und E-Mail-Adressen je Adresse
-- ============================================================================
--  Die ERSTE Nummer bzw. Adresse bleibt bewusst in customers.phone und
--  customers.email stehen. Daran haengen der Anruf-Link, der mailto-Link, die
--  Dublettenerkennung beim Import und die Adress-Zuordnung — das alles bleibt
--  damit unveraendert. Nur die zusaetzlichen Eintraege kommen hier hinein.
--
--  JSONB-Liste statt phone2/phone3/…: so ist die Anzahl nicht begrenzt und es
--  braucht fuer jede weitere Nummer keine neue Migration.
--
--  Ohne diese Migration laeuft das Adressbuch normal weiter — es gibt dann
--  nur keine zweite Nummer/Adresse (die App merkt das selbst und blendet die
--  Zusatzfelder beim Speichern aus).
--
--  Einmal im Supabase SQL-Editor ausfuehren. Wiederholtes Ausfuehren ist
--  unschaedlich.
-- ============================================================================

ALTER TABLE public.customers
    ADD COLUMN IF NOT EXISTS phones_extra jsonb DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS emails_extra jsonb DEFAULT '[]'::jsonb;

-- Kontrolle:
--   select name, phone, phones_extra, email, emails_extra
--   from public.customers
--   where jsonb_array_length(coalesce(phones_extra,'[]'::jsonb)) > 0
--      or jsonb_array_length(coalesce(emails_extra,'[]'::jsonb)) > 0;
