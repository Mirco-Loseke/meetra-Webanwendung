-- SQL Migration: Add location_company column to machines table
ALTER TABLE machines ADD COLUMN IF NOT EXISTS location_company text;
