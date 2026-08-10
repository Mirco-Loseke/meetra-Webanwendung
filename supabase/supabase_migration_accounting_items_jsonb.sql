-- =========================================================================
-- Migration: Buchhaltungs-Positionen von eigener Tabelle (accounting_items)
-- in eine JSONB-Spalte "items" direkt am Beleg (accounting) umziehen.
--
-- Warum: 1 Datenbank-Zeile pro Beleg statt 1+N Zeilen — spart pro Position
-- den kompletten Zeilen-Overhead (Row-Header, UUID-id, accounting_id-FK,
-- created_at, 2 Index-Einträge; zusammen ~150-200 Bytes/Position) und
-- große JSONB-Werte werden von Postgres zusätzlich komprimiert (TOAST).
-- Die Positionen bleiben dauerhaft und vollständig am Beleg gespeichert —
-- nichts ist temporär, die Rückverfolgbarkeit pro Beleg bleibt erhalten.
--
-- WICHTIG: Erst dieses Skript in Supabase (SQL Editor) ausführen,
-- DANN die neue App-Version verwenden. Die alte Tabelle wird hier bewusst
-- NICHT gelöscht — erst nach Kontrolle von Hand löschen (Schritt 4 unten).
-- =========================================================================

-- 1) Neue JSONB-Spalte am Beleg
ALTER TABLE public.accounting
    ADD COLUMN IF NOT EXISTS items jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 2) Bestehende Positionen in die neue Spalte übernehmen.
--    assignment_type 'filter' (Altlast aus der Split-Funktion) wird dabei zu
--    'other' normalisiert — die App verwendet einheitlich 'machine'/'other'.
UPDATE public.accounting a
SET items = sub.items
FROM (
    SELECT accounting_id,
           jsonb_agg(jsonb_build_object(
               'description',     description,
               'quantity',        quantity,
               'unit',            unit,
               'price_net',       price_net,
               'machine_id',      machine_id,
               'assignment_type', CASE WHEN assignment_type = 'filter' THEN 'other' ELSE assignment_type END,
               'assignment_area', assignment_area,
               'machine_filter',  machine_filter
           ) ORDER BY created_at) AS items
    FROM public.accounting_items
    GROUP BY accounting_id
) sub
WHERE a.id = sub.accounting_id;

-- 3) Kontrolle: Anzahl Positionen alt vs. neu muss übereinstimmen
SELECT
    (SELECT count(*) FROM public.accounting_items)                                   AS alte_positionen,
    (SELECT coalesce(sum(jsonb_array_length(items)), 0) FROM public.accounting)      AS neue_positionen;

-- 4) ERST NACH KONTROLLE von Schritt 3 (beide Zahlen gleich) manuell ausführen:
-- DROP TABLE public.accounting_items;
