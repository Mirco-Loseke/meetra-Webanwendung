-- Reparatur: notification_preferences.user_id war als uuid angelegt, die
-- Benutzer-IDs der App (public.users.id) sind aber Zahlen (1, 2, 3 …).
-- Jede Abfrage scheiterte mit „invalid input syntax for type uuid: "1"" (HTTP 400),
-- die Benachrichtigungs-Einstellungen blieben deshalb nur im jeweiligen Browser.
-- text nimmt beides auf. Die Tabelle ist durch den Fehler leer — es geht nichts verloren.
-- Einmalig im Supabase SQL-Editor ausführen. Gefahrlos wiederholbar.

alter table public.notification_preferences
    alter column user_id type text using user_id::text;

-- Kontrolle: data_type = text
select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'notification_preferences' and column_name = 'user_id';
