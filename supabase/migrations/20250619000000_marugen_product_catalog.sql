-- Marugen supplier price list (JPD fish food + MRG supplies)
-- Fish food: unit=bag, stock=10. Skips rows that already exist by sku or exact name.

UPDATE products
SET sku = 'JPD001', price = 222, unit = 'bag', stock = 10, category = 'Fish Food', description = '15kg AkaFuji Colour M size'
WHERE name = '15kg AkaFuji Colour M size' AND (sku IS NULL OR sku = '');

INSERT INTO products (id, name, category, sku, price, cost, unit, stock, min_stock, description)
SELECT 1780917810000::bigint, '15kg AkaFuji Colour M size', 'Fish Food', 'JPD001', 222, 0, 'bag', 10, 0, '15kg AkaFuji Colour M size'
WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.sku = 'JPD001' OR p.name = '15kg AkaFuji Colour M size');

INSERT INTO products (id, name, category, sku, price, cost, unit, stock, min_stock, description)
SELECT v.id, v.name, v.category, v.sku, v.price, 0, v.unit, v.stock, 0, v.name
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
