-- Hersteller als eigene Kategorie (Einstellungen > Kategorien, type = 'manufacturer')
-- 1. Adressbuch: Hersteller-Zuordnung je Adresse (kommaseparierte Namen, wie address_type)
-- 2. Bereits an Maschinen erfasste Hersteller einmalig als Kategorien anlegen
--
-- Im Supabase SQL Editor ausfuehren. Mehrfaches Ausfuehren ist unschaedlich.

-- 1 ── Spalte im Adressbuch ────────────────────────────────────────────────
ALTER TABLE customers ADD COLUMN IF NOT EXISTS manufacturer TEXT;

-- 2 ── Bestehende Hersteller aus den Maschinen uebernehmen ────────────────
INSERT INTO categories (name, type, color)
SELECT DISTINCT ON (lower(btrim(m.manufacturer)))
       btrim(m.manufacturer) AS name,
       'manufacturer'        AS type,
       '#14b8a6'             AS color
FROM machines m
WHERE m.manufacturer IS NOT NULL
  AND btrim(m.manufacturer) <> ''
  AND NOT EXISTS (
      SELECT 1 FROM categories c
      WHERE c.type = 'manufacturer'
        AND lower(btrim(c.name)) = lower(btrim(m.manufacturer))
  )
ORDER BY lower(btrim(m.manufacturer)), btrim(m.manufacturer);

-- 3 ── Zusaetzlich die an Maschinenserien hinterlegten Hersteller ─────────
INSERT INTO categories (name, type, color)
SELECT DISTINCT ON (lower(btrim(s.manufacturer)))
       btrim(s.manufacturer) AS name,
       'manufacturer'        AS type,
       '#14b8a6'             AS color
FROM categories s
WHERE s.type = 'series'
  AND s.manufacturer IS NOT NULL
  AND btrim(s.manufacturer) <> ''
  AND NOT EXISTS (
      SELECT 1 FROM categories c
      WHERE c.type = 'manufacturer'
        AND lower(btrim(c.name)) = lower(btrim(s.manufacturer))
  )
ORDER BY lower(btrim(s.manufacturer)), btrim(s.manufacturer);
