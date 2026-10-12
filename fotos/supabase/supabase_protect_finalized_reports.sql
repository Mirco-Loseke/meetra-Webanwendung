-- =====================================================================
-- Abgeschlossene Serviceberichte in der DATENBANK sperren (2026-09-28)
-- =====================================================================
-- Anlass: ein abgeschlossener Bericht (EYS, 2026-40109) wurde durch einen
-- Fehler der App mit einem anderen Bericht überschrieben. Die App prüft jetzt
-- selbst — diese Sperre ist das Netz darunter: sie greift unabhängig davon,
-- welcher Code, welches Gerät oder welche alte App-Fassung schreibt.
--
-- Bei is_finalized = true sind nur noch diese Änderungen erlaubt:
--   files, workshop_order_number   (Anhänge / Auftragsnummer an der Karte)
--   pdf_url, pdf_path, pdf_created_at, finalized_at, updated_at,
--   locked_by, locked_at            (PDF-Ablage, Technik)
-- Alles andere (Maschine, Datum, Text, Arbeiten, Unterschriften …) wird mit
-- einer Fehlermeldung abgelehnt. Löschen bleibt wie bisher über die Rechte geregelt.
--
-- Bewusst entsperren (z. B. Korrektur durch den Chef): im SQL Editor
--   update service_entries set is_finalized = false where id = …;
-- ist erlaubt, danach normal bearbeiten und wieder abschließen.
--
-- Ausführen: Supabase → SQL Editor → Datei einfügen → Run. Mehrfach ausführbar.
-- =====================================================================

create or replace function public.service_entries_finalized_guard()
returns trigger
language plpgsql
as $$
declare
    erlaubt text[] := array['files', 'workshop_order_number', 'pdf_url', 'pdf_path',
                            'pdf_created_at', 'finalized_at', 'updated_at', 'locked_by', 'locked_at'];
begin
    if old.is_finalized is true then
        -- Entsperren (nur is_finalized auf false) ist erlaubt.
        if new.is_finalized is not true
           and (to_jsonb(new) - erlaubt - 'is_finalized') = (to_jsonb(old) - erlaubt - 'is_finalized') then
            return new;
        end if;
        if (to_jsonb(new) - erlaubt) is distinct from (to_jsonb(old) - erlaubt) then
            raise exception 'Servicebericht % ist abgeschlossen und kann nicht mehr geändert werden.', old.id
                using errcode = 'P0001';
        end if;
    end if;
    return new;
end;
$$;

drop trigger if exists service_entries_finalized_guard on public.service_entries;
create trigger service_entries_finalized_guard
    before update on public.service_entries
    for each row execute function public.service_entries_finalized_guard();
