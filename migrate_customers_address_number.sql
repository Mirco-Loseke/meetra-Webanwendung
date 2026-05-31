-- Remove unique constraint from customer_number if it exists
ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_customer_number_key;

-- Add address_number column to customers table if not exists
ALTER TABLE customers ADD COLUMN IF NOT EXISTS address_number text;

-- Make address_number unique (add constraint)
ALTER TABLE customers ADD CONSTRAINT customers_address_number_key UNIQUE (address_number);
