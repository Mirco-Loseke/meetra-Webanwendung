-- ==========================================================
-- Mail → Kunde: handschriftliche Zuordnung einer Absender-Adresse
-- ==========================================================
-- Die Mail-Ansicht (js/mail-view.js) erkennt Kunden über die E-Mail-Adressen
-- der Ansprechpartner. Ist ein Absender unbekannt, ordnet der Nutzer ihn per
-- „Zuordnen …" einem Kunden zu — das landet hier, damit die Adresse beim
-- nächsten Mal erkannt wird. Solange diese Tabelle fehlt, weicht die App auf
-- localStorage aus (nur im jeweiligen Browser sichtbar).
create table if not exists public.mail_zuordnungen (
    email        text primary key,                  -- kleingeschrieben
    customer_id  uuid not null references public.customers(id) on delete cascade,
    user_id      uuid,                              -- wer zugeordnet hat (activeUser.id)
    created_at   timestamptz not null default now()
);

alter table public.mail_zuordnungen enable row level security;

drop policy if exists "mail_zuordnungen_alle" on public.mail_zuordnungen;
create policy "mail_zuordnungen_alle" on public.mail_zuordnungen
    for all to anon, authenticated using (true) with check (true);
