-- =========================================================
-- ANGEBOTE ↔ VORGÄNGE: JEDES ANGEBOT IST EIN VORGANG
-- =========================================================
-- Zweck: Jedes Angebot aus der Angebotsliste bekommt automatisch einen
--        Vorgang (internal_processes, Typ „Angebot"). Der Vorgang ist der
--        EINZIGE Speicherort für Zuständigen, Stand, Adresse und Maschine —
--        die Angebotsliste zeigt und bearbeitet diese Werte über den
--        verknüpften Vorgang. Umgekehrt zeigt der Vorgang die reinen
--        Angebotsdaten (Status, VK, EK, Realisierbar) aus der Tabelle
--        angebote — auch die gibt es nur einmal.
--
-- Diese Spalte ist die Verbindung. Die App legt die Vorgänge beim
-- Öffnen der Angebotsliste für alle Angebote ohne Vorgang selbst an
-- (js/listen.js, angebotVorgaengeAnlegen) — es muss nichts von Hand
-- nachgetragen werden.
--
-- Die alte Spalte angebote.bemerkung bleibt bestehen; ihr Inhalt wandert
-- beim Anlegen des Vorgangs als erster Stand-Eintrag hinüber.
--
-- Gefahrlos wiederholbar (IF NOT EXISTS).
-- Ausfuehren: Supabase → SQL Editor → einfuegen → Run
-- =========================================================

alter table public.angebote
    add column if not exists process_id uuid references public.internal_processes(id) on delete set null;

create index if not exists idx_angebote_process_id on public.angebote (process_id);
