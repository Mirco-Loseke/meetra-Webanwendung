-- Foto-Eingang: Sprachaufnahmen (2026-10-08)
-- Das Handy schickt eine Tonaufnahme (audio/*) wie ein Foto. Die Edge Function
-- `foto-eingang` lässt sie von Google Gemini abschreiben und legt den Text hier ab.
-- text_status: 'laeuft' | 'fertig' | 'fehler' (null = keine Aufnahme)

alter table public.foto_eingang add column if not exists text        text;
alter table public.foto_eingang add column if not exists text_status text;
alter table public.foto_eingang add column if not exists text_fehler text;
