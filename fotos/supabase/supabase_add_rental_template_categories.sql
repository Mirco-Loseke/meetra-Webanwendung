-- ==========================================================
-- VERALTET — NICHT MEHR EINZELN AUSFUEHREN.
-- Diese Datei setzt uuid-Schluessel voraus. In dieser Datenbank ist
-- categories.id bigint; das Einspielen scheitert dann mit
--   "Key columns are of incompatible types: uuid and bigint".
--
-- Stattdessen: supabase/supabase_mietvereinbarung_komplett.sql
-- Die liest die tatsaechlichen Typen aus und legt alles passend an.
-- Diese Datei bleibt nur zur Nachvollziehbarkeit liegen.
-- ==========================================================

-- ==========================================================
-- Mietvereinbarungs-Vorlagen: mehrere Maschinenkategorien
-- ----------------------------------------------------------
-- Bisher hing eine Vorlage an genau einer Kategorie
-- (category_id). Eine Vorlage soll aber für mehrere Typen
-- gelten (z. B. "Selbstfahrender Umsetzer" UND "Gezogener
-- Umsetzer"). Dafür gibt es category_ids uuid[].
--
-- category_id bleibt erhalten (Altbestand, erste Kategorie),
-- der eindeutige Index darauf muss aber weg — sonst darf es
-- nur eine Vorlage ohne Zuordnung geben.
--
-- Achtung: categories.id ist uuid — category_ids muss es auch sein.
-- ==========================================================

alter table public.rental_templates
    add column if not exists category_ids uuid[] not null default '{}'::uuid[];

-- Altbestand übernehmen: einzelne Kategorie in die Liste.
update public.rental_templates
   set category_ids = array[category_id]
 where category_id is not null
   and (category_ids is null or cardinality(category_ids) = 0);

drop index if exists public.rental_templates_category_uidx;

create index if not exists rental_templates_category_ids_idx
    on public.rental_templates using gin (category_ids);
