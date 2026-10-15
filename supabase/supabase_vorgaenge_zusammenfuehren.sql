-- =============================================================================
--  Vorgänge zusammenführen: alte Vorgänge löschen dürfen ALLE angemeldeten Nutzer
-- =============================================================================
--  Der Löschschutz (supabase_rls_loeschrechte_alle.sql) lässt DELETE auf
--  internal_processes nur mit Löschrecht „vorgaenge“ zu. Beim Zusammenführen
--  (Adresse → Vorgänge → „Vorgänge kombinieren“) blieben die alten Vorgänge
--  deshalb bei Nutzern ohne dieses Recht stehen — still, ohne Fehler.
--
--  Diese Funktion löscht NUR im Rahmen des Zusammenführens, mit Prüfungen:
--    * Aufrufer ist ein angemeldeter Nutzer mit users-Zeile (app_benutzer)
--    * der Ziel-Vorgang existiert und ist nicht unter den zu löschenden
--    * an den zu löschenden hängt kein Angebot mehr (wurden vorher umgehängt)
--  Rückgabe: Anzahl gelöschter Vorgänge.
-- =============================================================================
create or replace function public.vorgaenge_zusammenfuehren_loeschen(ziel text, quellen text[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    n integer;
begin
    if auth.uid() is null or (select id from public.app_benutzer()) is null then
        raise exception 'Nicht angemeldet.';
    end if;
    if ziel is null or ziel = any(quellen) then
        raise exception 'Ziel-Vorgang ungültig.';
    end if;
    if not exists (select 1 from public.internal_processes where id::text = ziel) then
        raise exception 'Ziel-Vorgang % existiert nicht.', ziel;
    end if;
    if exists (select 1 from public.angebote where process_id::text = any(quellen)) then
        raise exception 'An den alten Vorgängen hängen noch Angebote — nicht gelöscht.';
    end if;
    delete from public.internal_processes where id::text = any(quellen);
    get diagnostics n = row_count;
    return n;
end $$;

revoke all on function public.vorgaenge_zusammenfuehren_loeschen(text, text[]) from public, anon;
grant execute on function public.vorgaenge_zusammenfuehren_loeschen(text, text[]) to authenticated;
