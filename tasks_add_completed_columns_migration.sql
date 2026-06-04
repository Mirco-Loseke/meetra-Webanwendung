-- Migration to add completed_at and completed_by columns to tasks table
ALTER TABLE public.tasks
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS completed_by BIGINT REFERENCES public.users(id) ON DELETE SET NULL DEFAULT NULL;
