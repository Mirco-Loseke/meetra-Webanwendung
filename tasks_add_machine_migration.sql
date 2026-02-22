-- Migration: Add machine_id to tasks table
-- This replaces the project_id concept to tie tasks directly to machines

ALTER TABLE public.tasks 
ADD COLUMN IF NOT EXISTS machine_id BIGINT REFERENCES public.machines(id) ON DELETE SET NULL;
