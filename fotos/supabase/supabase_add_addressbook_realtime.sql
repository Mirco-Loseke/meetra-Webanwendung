-- Adressbuch für Supabase Realtime freischalten: Änderungen an Adressen,
-- Ansprechpartnern, Notizen und Verknüpfungen erscheinen dann sofort bei
-- allen geöffneten Clients. Einmalig im Supabase SQL-Editor ausführen.
--
-- Mehrfaches Ausführen schadet nicht: schon eingetragene Tabellen werden
-- übersprungen (ein blankes "alter publication ... add table" bricht sonst
-- mit "is already member of publication" ab und lässt den Rest liegen).

do $$
declare t text;
begin
    foreach t in array array['customers', 'customer_contacts', 'customer_notes', 'customer_links']
    loop
        if not exists (
            select 1 from pg_publication_tables
            where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
        ) then
            execute format('alter publication supabase_realtime add table public.%I', t);
        end if;
    end loop;
end $$;

-- Ohne das hier liefert ein DELETE nur die id, nicht die customer_id —
-- die Detailansicht kann dann nicht gezielt nachladen.
alter table public.customer_contacts replica identity full;
alter table public.customer_notes replica identity full;
alter table public.customer_links replica identity full;

-- Kontrolle: die vier Tabellen müssen in der Liste stehen.
-- select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by 1;
