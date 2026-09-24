-- Aufgaben im Kino-Modus ausblenden: der Merker liegt an der Aufgabe, damit
-- alle Geräte (vor allem der Fernseher in der Werkstatt) ihn sehen.
-- Vorher nur im Browser (localStorage 'cinemaHiddenTasks'); js/tasks.js
-- übernimmt diese Altwerte beim ersten Laden einmalig in die Spalte.
-- Einmalig im Supabase SQL-Editor ausführen.
alter table public.tasks add column if not exists cinema_hidden boolean not null default false;
