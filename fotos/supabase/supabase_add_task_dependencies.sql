-- =========================================================
-- ABHAENGIGKEITEN ZWISCHEN AUFGABEN (Timeline-Ansicht)
-- =========================================================
-- Zweck: "Aufgabe B kann erst beginnen, wenn Aufgabe A fertig ist" —
--        sichtbar als Pfeil-Linie zwischen den beiden Balken in der
--        Timeline (js/timeline-view.js) plus Warnung, wenn B trotzdem
--        vor dem Ende von A anfaengt. Rein Aufgaben-Ebene, nicht
--        Unteraufgaben, damit die Pflege einfach bleibt.
--
-- Es wird NICHTS automatisch verschoben — die Abhaengigkeit ist eine
-- Anzeige- und Warnhilfe, keine Zwangsregel.
--
-- Gefahrlos wiederholbar: alles mit IF NOT EXISTS.
-- Bestehende Zeilen bleiben unveraendert (Wert '[]').
--
-- Ausfuehren: Supabase → SQL Editor → einfuegen → Run
-- =========================================================

-- 1. Spalte ----------------------------------------------------
-- Array von tasks.id, von denen diese Aufgabe abhaengt. JSONB statt
-- bigint[], weil das der App das Lesen/Schreiben ueber den normalen
-- Supabase-Client ohne Typ-Sonderfall erlaubt (wie depends_on bei
-- anderen Projekten ueblich).
alter table public.tasks
    add column if not exists depends_on jsonb default '[]'::jsonb;

comment on column public.tasks.depends_on is
    'Array von tasks.id, von denen diese Aufgabe abhaengt (Timeline-Ansicht, Anzeige- und Warnhilfe ohne Zwang).';

-- 2. Kontrolle ---------------------------------------------------
-- select id, title, depends_on from public.tasks where depends_on <> '[]'::jsonb;

-- =========================================================
-- ZURUECKNEHMEN (nur falls gewuenscht — loescht alle Abhaengigkeiten!)
-- =========================================================
-- alter table public.tasks drop column if exists depends_on;
