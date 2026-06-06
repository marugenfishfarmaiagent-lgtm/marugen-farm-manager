-- Clear sample / legacy business data (customers, inventory, invoices, deliveries, calendar)
DELETE FROM stock_activity;
DELETE FROM deliveries;
DELETE FROM invoices;
DELETE FROM events;
DELETE FROM products;
DELETE FROM customers;

ALTER SEQUENCE IF EXISTS customers_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS products_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS events_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS stock_activity_id_seq RESTART WITH 1;
