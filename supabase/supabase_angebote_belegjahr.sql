-- Angebote: eindeutig über Belegnummer + Jahr statt nur Belegnummer.
-- Sage 100 vergibt die Angebotsnummern jedes Jahr neu (30041 gab es 2024, 2025,
-- 2026). Bisher war angebote.belegnummer UNIQUE — ab dem ersten Jahreswechsel
-- hätte der Sage-Abgleich ein neues Angebot mit einer Vorjahresnummer nicht
-- eintragen können (bzw. das alte überschrieben).
-- Die Spalte belegjahr rechnet die Datenbank selbst aus belegdatum aus
-- (0 = kein Datum); niemand muss sie befüllen.
-- Einmalig im Supabase SQL-Editor ausführen. Gefahrlos wiederholbar.

-- 1) Jahr als berechnete Spalte
alter table public.angebote
    add column if not exists belegjahr int
    generated always as (coalesce(extract(year from belegdatum)::int, 0)) stored;

-- 2) Alte Eindeutigkeit nur auf belegnummer entfernen (Name je nach Anlage verschieden)
do $$
declare r record;
begin
    for r in
        select con.conname
        from pg_constraint con
        join pg_class rel on rel.oid = con.conrelid
        join pg_namespace n on n.oid = rel.relnamespace
        where n.nspname = 'public' and rel.relname = 'angebote' and con.contype = 'u'
          and (select array_agg(att.attname::text order by att.attname)
               from unnest(con.conkey) k join pg_attribute att on att.attrelid = rel.oid and att.attnum = k)
              = array['belegnummer']
    loop
        execute format('alter table public.angebote drop constraint %I', r.conname);
    end loop;
end $$;
drop index if exists public.angebote_belegnummer_key;

-- 3) Neue Eindeutigkeit: Nummer + Jahr
do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'angebote_belegnummer_jahr_key') then
        alter table public.angebote add constraint angebote_belegnummer_jahr_key unique (belegnummer, belegjahr);
    end if;
end $$;

-- Kontrolle: sollte eine Zeile "angebote_belegnummer_jahr_key" zeigen, keine mehr nur auf belegnummer
select conname, pg_get_constraintdef(oid) from pg_constraint
where conrelid = 'public.angebote'::regclass and contype = 'u';
