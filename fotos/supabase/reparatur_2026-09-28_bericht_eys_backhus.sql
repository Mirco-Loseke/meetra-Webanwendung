-- =====================================================================
-- REPARATUR 2026-09-28: abgeschlossener EYS-Bericht 2026-40109 wurde vom
-- neuen Backhus-21.50-Bericht (23.09.2026) überschrieben.
-- Ursache: veraltete Bericht-ID beim Speichern (behoben in
-- js/service-report-form.js, saveServiceberichtData).
--
-- Was dieses Skript tut (alles in EINER Transaktion, bricht bei Unklarheit ab):
--   1. Findet den betroffenen Datensatz: abgeschlossen, Maschine Backhus 21.50
--      #800, Datum 23.09.2026. Genau EIN Treffer, sonst Abbruch.
--   2. Legt den Backhus-Inhalt als NEUEN, offenen Bericht an (ohne PDF).
--   3. Stellt den alten Datensatz auf den Stand des abgeschlossenen PDFs
--      zurück (EYS MTS620 #25EYS609001, 16.09.2026, 2026-40109).
--      Felder, die nicht im PDF-Auszug stehen (Arbeiten, Material, Fotos,
--      Unterschriften), werden geleert statt falsch zu bleiben — das PDF
--      bleibt der gültige Beleg und wird NICHT angefasst.
--
-- Ausführen: Supabase → SQL Editor → komplette Datei einfügen → Run.
-- Zuerst NUR Abschnitt 0 laufen lassen und prüfen, dass genau eine Zeile kommt.
-- =====================================================================

-- ---------- 0. VORSCHAU (ändert nichts) ----------
select s.id, s.datum_von, s.is_finalized, s.pdf_url, s.workshop_order_number,
       m.manufacturer, m.name, m.serial
from service_entries s
join machines m on m.id = s.machine_id
where s.is_finalized = true
  and m.name ilike '%21.50%' and m.serial = '800'
  and s.datum_von = '2026-09-23';

select id, manufacturer, name, serial from machines where serial = '25EYS609001';

-- ---------- 1.–3. REPARATUR ----------
begin;

do $$
declare
    alt_id   bigint;
    eys_id   bigint;
    anzahl   int;
    spalten  text;
    neu_id   bigint;
begin
    select count(*) into anzahl
    from service_entries s join machines m on m.id = s.machine_id
    where s.is_finalized = true and m.name ilike '%21.50%' and m.serial = '800'
      and s.datum_von = '2026-09-23';
    if anzahl <> 1 then
        raise exception 'Abbruch: % passende Berichte gefunden (erwartet 1). Nichts geändert.', anzahl;
    end if;

    select s.id into alt_id
    from service_entries s join machines m on m.id = s.machine_id
    where s.is_finalized = true and m.name ilike '%21.50%' and m.serial = '800'
      and s.datum_von = '2026-09-23';

    select count(*) into anzahl from machines where serial = '25EYS609001';
    if anzahl <> 1 then
        raise exception 'Abbruch: EYS-Maschine %-mal gefunden (erwartet 1). Nichts geändert.', anzahl;
    end if;
    select id into eys_id from machines where serial = '25EYS609001';

    -- 2. Backhus-Inhalt als neuen, offenen Bericht kopieren. Spaltenliste
    --    dynamisch: alles außer ID, PDF, Abschluss, Zeitstempel, Sperre und
    --    berechneten Spalten.
    select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into spalten
    from information_schema.columns
    where table_schema = 'public' and table_name = 'service_entries'
      and is_generated = 'NEVER' and coalesce(is_identity, 'NO') = 'NO'
      and column_name not in ('id', 'pdf_url', 'pdf_path', 'pdf_created_at',
                              'is_finalized', 'finalized_at', 'created_at', 'updated_at',
                              'locked_by', 'locked_at');
    execute format('insert into service_entries (%s) select %s from service_entries where id = $1 returning id',
                   spalten, spalten)
        into neu_id using alt_id;
    raise notice 'Backhus-Bericht neu angelegt: id %', neu_id;

    -- 3. Alten Datensatz auf den abgeschlossenen EYS-Stand zurücksetzen.
    update service_entries set
        machine_id            = eys_id,
        date                  = '2026-09-16',
        datum_von             = '2026-09-16',
        datum_bis             = null,
        description           = 'Es läuft immer das Sammelband voll und muss gereinigt werden',
        workshop_order_number = '2026-40109',
        operating_hours       = '314.25',
        work_log              = '[
            {"datum":"2026-09-16","typ":"Anfahrt","pause":"","zeit":"10:00 - 11:30","von":"10:00","bis":"11:30","kilometer":"130"},
            {"datum":"2026-09-16","typ":"Arbeitszeit","pause":"","zeit":"11:30 - 14:00","von":"11:30","bis":"14:00","kilometer":""},
            {"datum":"2026-09-16","typ":"Abfahrt","pause":"","zeit":"14:00 - 15:30","von":"14:00","bis":"15:30","kilometer":"130"}
        ]'::jsonb,
        location_snapshot     = '{"company":"","street":"Seilerstraße 5","zip":"26506","city":"Norden","country":"Deutschland"}'::jsonb,
        tasks                 = '[]'::jsonb,
        materials             = '[]'::jsonb,
        files                 = '[]'::jsonb,
        checklist_payload     = null,
        remarks               = null,
        customer_signature    = null,
        customer_name         = null,
        tech_signature        = null
    where id = alt_id;
    raise notice 'EYS-Bericht (id %) auf den PDF-Stand zurückgesetzt.', alt_id;
end $$;

commit;
