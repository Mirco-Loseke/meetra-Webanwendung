-- Foto-Eingang: keine doppelten Dateien annehmen.
-- Das Handy schickt je Datei den SHA-256 des Originals mit; die Function foto-eingang
-- legt ihn in inhalt_hash ab und nimmt dieselbe Datei kein zweites Mal an.
-- Ohne diese Migration läuft die Function weiter (dann ohne Doppelten-Schutz).
-- Bestehende Zeilen bleiben ohne Hash (NULL darf mehrfach vorkommen).

alter table public.foto_eingang add column if not exists inhalt_hash text;

create unique index if not exists foto_eingang_inhalt_hash_uni
    on public.foto_eingang (inhalt_hash)
    where inhalt_hash is not null;
