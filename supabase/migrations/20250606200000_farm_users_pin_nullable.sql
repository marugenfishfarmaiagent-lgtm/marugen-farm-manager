-- Allow legacy pin column to be empty when pin_hash is used
ALTER TABLE farm_users ALTER COLUMN pin DROP NOT NULL;
