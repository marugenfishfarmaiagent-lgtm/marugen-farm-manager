-- Restore Marugen product catalog after accidental data wipe (idempotent)

INSERT INTO products (id, name, category, sku, price, cost, unit, stock, min_stock, description, track_stock)
SELECT 1780917810000::bigint, '15kg AkaFuji Colour M size', 'Fish Food', 'JPD001', 222, 0, 'bag', 10, 0, '15kg AkaFuji Colour M size', true
WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.sku = 'JPD001' OR p.name = '15kg AkaFuji Colour M size');

UPDATE products
SET sku = 'JPD001', price = 222, unit = 'bag', stock = 10, category = 'Fish Food', description = '15kg AkaFuji Colour M size', track_stock = true
WHERE name = '15kg AkaFuji Colour M size';

INSERT INTO products (id, name, category, sku, price, cost, unit, stock, min_stock, description, track_stock)
SELECT v.id, v.name, v.category, v.sku, v.price, 0, v.unit, v.stock, 0, v.name, true
FROM (VALUES
  (1780917810001::bigint, '15kg AkaFuji Colour L size', 'Fish Food', 'JPD002', 222, 'bag', 10),
  (1780917810002, '20kg AkaFuji Sinking M size', 'Fish Food', 'JPD003', 272, 'bag', 10),
  (1780917810003, '20kg AkaFuji Sinking L size', 'Fish Food', 'JPD004', 272, 'bag', 10),
  (1780917810004, '15kg Fujizakura Health M size', 'Fish Food', 'JPD005', 194, 'bag', 10),
  (1780917810005, '15kg Fujizakura Health L size', 'Fish Food', 'JPD006', 194, 'bag', 10),
  (1780917810006, '20kg Fujizakura Sinking L/M size', 'Fish Food', 'JPD007', 260, 'bag', 10),
  (1780917810007, '15kg Fujiyama Wheatgerm M size', 'Fish Food', 'JPD008', 118, 'bag', 10),
  (1780917810008, '15kg Fujiyama Wheatgerm L size', 'Fish Food', 'JPD009', 118, 'bag', 10),
  (1780917810009, '10kg Medicarp SG M size', 'Fish Food', 'JPD010', 200, 'bag', 10),
  (1780917810010, '10kg Medicarp SG L size', 'Fish Food', 'JPD011', 200, 'bag', 10),
  (1780917810011, '5kg Medicarp Sinking (Floating)', 'Fish Food', 'JPD012', 149, 'bag', 10),
  (1780917810012, '5kg Medicarp Sinking (Sinking)', 'Fish Food', 'JPD013', 149, 'bag', 10),
  (1780917810013, '2kg Mud Booster', 'Fish Food', 'JPD014', 47, 'bag', 10),
  (1780917810014, '15kg Sekirin Spirulina Colour M size', 'Fish Food', 'JPD015', 122, 'bag', 10),
  (1780917810015, '15kg Sekirin Spirulina Colour L size', 'Fish Food', 'JPD016', 122, 'bag', 10),
  (1780917810016, '15kg Shogun Wheatgerm M size', 'Fish Food', 'JPD017', 197, 'bag', 10),
  (1780917810017, '15kg Shogun Wheatgerm L size', 'Fish Food', 'JPD018', 197, 'bag', 10),
  (1780917810018, '15kg Shori Growth M size', 'Fish Food', 'JPD019', 197, 'bag', 10),
  (1780917810019, '15kg Shori Growth L size', 'Fish Food', 'JPD020', 197, 'bag', 10),
  (1780917810020, '20kg Shori Sinking L/M size', 'Fish Food', 'JPD021', 264, 'bag', 10),
  (1780917810021, '15kg Yokozuna Silkworm M size', 'Fish Food', 'JPD022', 198, 'bag', 10),
  (1780917810022, '15kg Yokozuna Silkworm L size', 'Fish Food', 'JPD023', 198, 'bag', 10),
  (1780917810023, '15kg Arowana Fish Food L size', 'Fish Food', 'JPD024', 168, 'bag', 10),
  (1780917810024, '2L Multicoat Antichlorine', 'Water Treatment', 'MRG001', 25, 'bottle', 10),
  (1780917810025, '6kg Oyster Shell', 'Pond Supplies', 'MRG002', 25, 'bag', 10),
  (1780917810026, '500ml Unilight', 'Water Treatment', 'MRG003', 25, 'bottle', 10),
  (1780917810027, '1.5L Unilight', 'Water Treatment', 'MRG004', 50, 'bottle', 10),
  (1780917810028, 'Digital Salt Meter', 'Equipment', 'MRG005', 120, 'pcs', 10),
  (1780917810029, 'Hibow HP80 Air Pump', 'Equipment', 'MRG006', 390, 'pcs', 10),
  (1780917810030, 'Tsurumi Water Pump 50NHPU2.15S150WSP', 'Equipment', 'MRG007', 250, 'pcs', 10)
) AS v(id, name, category, sku, price, unit, stock)
WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.sku = v.sku OR p.name = v.name);

INSERT INTO products (id, name, category, sku, price, cost, unit, stock, min_stock, description, track_stock)
SELECT v.id, v.name, v.category, v.sku, v.price, 0, v.unit, 0, 0, v.name, false
FROM (VALUES
  (1780917820001::bigint, '1kg Dried Black Soldier Fly', 'Fish Food', 'FF001', 30, 'bag'),
  (1780917820002, '500g Dried Black Soldier Fly', 'Fish Food', 'FF002', 18, 'pack'),
  (1780917820003, '15kg Marugen Mix M size', 'Fish Food', 'MK001', 110, 'bag'),
  (1780917820004, '15kg Marugen Mix L size', 'Fish Food', 'MK002', 110, 'bag'),
  (1780917820005, '10kg Marugen Mix M size', 'Fish Food', 'MK003', 90, 'bag'),
  (1780917820006, '10kg Marugen Mix L size', 'Fish Food', 'MK004', 90, 'bag'),
  (1780917820007, '5kg Marugen Mix M size', 'Fish Food', 'MK005', 55, 'bag'),
  (1780917820008, '5kg Marugen Mix L size', 'Fish Food', 'MK006', 55, 'bag'),
  (1780917820009, '3kg Marugen Mix M size', 'Fish Food', 'MK007', 36, 'bag'),
  (1780917820010, '3kg Marugen Mix L size', 'Fish Food', 'MK008', 36, 'bag'),
  (1780917820011, '2kg Marugen Mix M size', 'Fish Food', 'MK009', 25, 'bag'),
  (1780917820012, '2kg Marugen Mix L size', 'Fish Food', 'MK010', 25, 'bag'),
  (1780917820013, '1kg Marugen Mix M size', 'Fish Food', 'MK011', 15, 'bag'),
  (1780917820014, '1kg Marugen Mix L size', 'Fish Food', 'MK012', 15, 'bag'),
  (1780917820015, '15kg JPD Fujizakura + Akafuji Mixed M size', 'Fish Food', 'JPDM001', 200, 'bag'),
  (1780917820016, '15kg JPD Fujizakura + Akafuji Mixed L size', 'Fish Food', 'JPDM002', 200, 'bag'),
  (1780917820017, '10kg JPD Fujizakura + Akafuji Mixed M size', 'Fish Food', 'JPDM003', 150, 'bag'),
  (1780917820018, '10kg JPD Fujizakura + Akafuji Mixed L size', 'Fish Food', 'JPDM004', 150, 'bag'),
  (1780917820019, '5kg JPD Fujizakura + Akafuji Mixed M size', 'Fish Food', 'JPDM005', 85, 'bag'),
  (1780917820020, '5kg JPD Fujizakura + Akafuji Mixed L size', 'Fish Food', 'JPDM006', 85, 'bag'),
  (1780917820021, '3kg JPD Fujizakura + Akafuji Mixed M size', 'Fish Food', 'JPDM007', 55, 'bag'),
  (1780917820022, '3kg JPD Fujizakura + Akafuji Mixed L size', 'Fish Food', 'JPDM008', 55, 'bag'),
  (1780917820023, '2kg JPD Fujizakura + Akafuji Mixed M size', 'Fish Food', 'JPDM009', 38, 'bag'),
  (1780917820024, '2kg JPD Fujizakura + Akafuji Mixed L size', 'Fish Food', 'JPDM010', 38, 'bag'),
  (1780917820025, '1kg JPD Fujizakura + Akafuji Mixed M size', 'Fish Food', 'JPDM011', 20, 'bag'),
  (1780917820026, '1kg JPD Fujizakura + Akafuji Mixed L size', 'Fish Food', 'JPDM012', 20, 'bag'),
  (1780917820027, '15kg JPD Shori + Akafuji Mixed M size', 'Fish Food', 'JPDM013', 205, 'bag'),
  (1780917820028, '15kg JPD Shori + Akafuji Mixed L size', 'Fish Food', 'JPDM014', 205, 'bag'),
  (1780917820029, '10kg JPD Shori + Akafuji Mixed M size', 'Fish Food', 'JPDM015', 160, 'bag'),
  (1780917820030, '10kg JPD Shori + Akafuji Mixed L size', 'Fish Food', 'JPDM016', 160, 'bag'),
  (1780917820031, '5kg JPD Shori + Akafuji Mixed M size', 'Fish Food', 'JPDM017', 90, 'bag'),
  (1780917820032, '5kg JPD Shori + Akafuji Mixed L size', 'Fish Food', 'JPDM018', 90, 'bag'),
  (1780917820033, '3kg JPD Shori + Akafuji Mixed M size', 'Fish Food', 'JPDM019', 58, 'bag'),
  (1780917820034, '3kg JPD Shori + Akafuji Mixed L size', 'Fish Food', 'JPDM020', 58, 'bag'),
  (1780917820035, '2kg JPD Shori + Akafuji Mixed M size', 'Fish Food', 'JPDM021', 40, 'bag'),
  (1780917820036, '2kg JPD Shori + Akafuji Mixed L size', 'Fish Food', 'JPDM022', 40, 'bag'),
  (1780917820037, '1kg JPD Shori + Akafuji Mixed M size', 'Fish Food', 'JPDM023', 22, 'bag'),
  (1780917820038, '1kg JPD Shori + Akafuji Mixed L size', 'Fish Food', 'JPDM024', 22, 'bag'),
  (1780917820039, '15kg Saki-Hikari Color M size', 'Fish Food', 'SH001', 230, 'bag'),
  (1780917820040, '15kg Saki-Hikari Color L size', 'Fish Food', 'SH002', 230, 'bag'),
  (1780917820041, '15kg Saki-Hikari Growth M size', 'Fish Food', 'SH003', 200, 'bag'),
  (1780917820042, '15kg Saki-Hikari Growth L size', 'Fish Food', 'SH004', 200, 'bag'),
  (1780917820043, '15kg Saki Mixed Colour + Growth M size', 'Fish Food', 'SHM001', 225, 'bag'),
  (1780917820044, '10kg Saki Mixed Colour + Growth M size', 'Fish Food', 'SHM002', 170, 'bag'),
  (1780917820045, '5kg Saki Mixed Colour + Growth M size', 'Fish Food', 'SHM003', 95, 'bag'),
  (1780917820046, '3kg Saki Mixed Colour + Growth M size', 'Fish Food', 'SHM004', 60, 'bag'),
  (1780917820047, '2kg Saki Mixed Colour + Growth M size', 'Fish Food', 'SHM005', 45, 'bag'),
  (1780917820048, '1kg Saki Mixed Colour + Growth M size', 'Fish Food', 'SHM006', 25, 'bag')
) AS v(id, name, category, sku, price, unit)
WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.sku = v.sku OR p.name = v.name);

SELECT
  count(*) AS total_products,
  count(*) FILTER (WHERE track_stock IS NOT FALSE) AS stock_tracked,
  count(*) FILTER (WHERE track_stock = false) AS price_list_only
FROM products;
