-- Migration: Add JSONB files column to procurements
-- This column will store an array of file objects, similar to the machines table.
-- Format: [{ url: '...', name: '...', type: '...' }]

ALTER TABLE public.procurements 
ADD COLUMN IF NOT EXISTS files JSONB DEFAULT '[]'::jsonb;
