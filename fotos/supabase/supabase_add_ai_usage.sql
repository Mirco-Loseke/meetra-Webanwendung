-- ============================================================================
--  KI-Verbrauch je Nutzer und Tag
-- ============================================================================
--  OPTIONAL. Nur nötig, wenn in der Edge Function groq-proxy ein Tageslimit
--  gesetzt wird (Secret AI_DAILY_LIMIT). Ohne diese Tabelle läuft die KI
--  weiter — die Function zählt dann einfach nicht mit.
--
--  Geschrieben wird ausschliesslich von der Edge Function mit dem
--  Service-Role-Key. Deshalb bekommt die Tabelle KEINE offene Policy:
--  aus dem Browser soll hier niemand lesen oder schreiben können.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ai_usage (
    user_id  uuid        NOT NULL,
    day      date        NOT NULL,
    calls    integer     NOT NULL DEFAULT 0,
    last_at  timestamptz,
    PRIMARY KEY (user_id, day)
);

ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;

-- Bewusst ohne Policy: der Service-Role-Key der Edge Function umgeht RLS,
-- alle anderen (also jeder Browser) kommen damit an gar nichts heran.

-- Kontrolle, wer heute wie viel genutzt hat:
--   select * from public.ai_usage where day = current_date order by calls desc;
