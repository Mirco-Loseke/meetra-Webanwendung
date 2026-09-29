-- ==========================================================
-- Mails am Vorgang: eigenes Feld statt Eintrag unter „Stand"
-- (2026-09-29)
-- ==========================================================
-- Bisher hängte „Zu Vorgang hinzufügen" (js/mail-view.js) eine Mail als
-- Eintrag in status_updates an. Jetzt stehen Mails in internal_processes.mails
-- und erscheinen nur noch im Fenster „E-Mails" (Mail-Symbol auf der Karte).
--
-- Die Migration verschiebt vorhandene Mail-Einträge aus status_updates nach
-- mails (erkennbar am Objekt „mail" oder am Text „📧 Mail von …").
-- Mehrfach ausführbar.

alter table public.internal_processes
    add column if not exists mails jsonb not null default '[]'::jsonb;

update public.internal_processes p
set mails = coalesce(p.mails, '[]'::jsonb) || coalesce((
        select jsonb_agg(
            case when e ? 'mail' then e->'mail'
                 else jsonb_build_object('alt', true, 'text', e->>'text', 'at', e->>'at')
            end order by e->>'at' desc)
        from jsonb_array_elements(p.status_updates) e
        where e ? 'mail' or (e->>'text') like '📧 Mail von %'
    ), '[]'::jsonb),
    status_updates = coalesce((
        select jsonb_agg(e order by ord)
        from jsonb_array_elements(p.status_updates) with ordinality as t(e, ord)
        where not (e ? 'mail' or (e->>'text') like '📧 Mail von %')
    ), '[]'::jsonb)
where jsonb_typeof(p.status_updates) = 'array'
  and exists (
        select 1 from jsonb_array_elements(p.status_updates) e
        where e ? 'mail' or (e->>'text') like '📧 Mail von %'
  );
