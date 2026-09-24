-- NOTFALL-RÜCKWEG: stellt die Policies exakt so her, wie sie am 2026-09-24 VOR
-- supabase_rls_loeschrechte_alle.sql waren (aus pg_policies abgelesen).
-- Nur ausführen, wenn nach dem Umstellen etwas nicht mehr geht.
do $$
declare
    t text; pol record;
    nur_angemeldet text[] := array['acceptance_protocols','accounting','accounting_items','app_settings','customers',
        'document_folders','documents','intake_protocols','internal_processes','machines','maintenance_events',
        'manual_history_entries','procurement_comments','procurements','projects','protocol_checkpoints','protocol_photos',
        'protocol_templates','service_entries','storage_cleanup_queue','subtasks','task_comments','task_dependencies',
        'task_history','task_quick_templates','task_subtask_templates','task_supergroups_templates','tasks','users'];
    fuer_alle text[][] := array[
        array['absences','absences_all'],
        array['address_history','Allow all operations for address_history'],
        array['angebot_notizen','Allow all operations for angebot_notizen'],
        array['angebote','Allow all operations for angebote'],
        array['assignment_responses','Allow all operations for assignment_responses'],
        array['customer_contacts','Allow all operations for customer_contacts'],
        array['customer_links','Allow all operations for customer_links'],
        array['customer_notes','Allow all operations for customer_notes'],
        array['event_participants','event_participants_all'],
        array['invoice_todos','invoice_todos_all'],
        array['label_articles','Allow all operations for label_articles'],
        array['notification_preferences','notification_preferences_all'],
        array['rechnungen','rechnungen_all'],
        array['rental_agreements','rental_agreements_all'],
        array['rental_templates','rental_templates_all'],
        array['workshop_tasks','workshop_tasks_all']];
    paar text[];
    alle text[];
begin
    alle := nur_angemeldet || array['categories'];
    foreach paar slice 1 in array fuer_alle loop alle := alle || paar[1]; end loop;
    -- alle neuen Policies dieser Tabellen entfernen
    foreach t in array alle loop
        if to_regclass('public.' || t) is null then continue; end if;
        for pol in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
            execute format('drop policy if exists %I on public.%I', pol.policyname, t);
        end loop;
    end loop;
    foreach t in array nur_angemeldet loop
        if to_regclass('public.' || t) is null then continue; end if;
        execute format('create policy allow_all_authenticated on public.%I for all to authenticated using (true) with check (true)', t);
    end loop;
    foreach paar slice 1 in array fuer_alle loop
        if to_regclass('public.' || paar[1]) is null then continue; end if;
        execute format('create policy %I on public.%I for all using (true) with check (true)', paar[2], paar[1]);
    end loop;
    create policy allow_all_authenticated on public.categories for all to authenticated using (true) with check (true);
    create policy "Enable read access for all users" on public.categories for select using (true);
    create policy "Enable insert access for all users" on public.categories for insert with check (true);
    create policy "Enable update access for all users" on public.categories for update using (true);
    create policy "Enable delete access for all users" on public.categories for delete using (true);
end $$;

select tablename, policyname, cmd, roles from pg_policies where schemaname = 'public' order by tablename;
