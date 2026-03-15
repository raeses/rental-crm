INSERT INTO projects (internal_number, name, client, operator, start_date, end_date, status)
VALUES ('014', 'Kuznetsov', 'Kuznetsov Prod', 'Alex Petrov', '2026-03-14', '2026-03-16', 'confirmed');

INSERT INTO items (
  name, category, price, base_rate, purchase_price, purchase_date, status, owner_type, serial_number
)
VALUES
('Red Komodo 6K', 'Camera', 3500, 3000, 850000, '2025-01-12', 'available', 'own', 'RK6K-001'),
('SmallHD Indie 7', 'Monitors and Playback', 2400, 2200, 180000, '2025-02-08', 'available', 'own', 'SHD-IND-007');

INSERT INTO estimates (
  project_id, estimate_number, title, start_date, end_date,
  discount_percent, tax_enabled, tax_percent,
  subtotal, discount_amount, total_after_discount, tax_amount, grand_total
)
VALUES
(1, '014/1', 'Main Equipment', '2026-03-14', '2026-03-16', 10, 1, 9, 35350.00, 3535.00, 31815.00, 2863.35, 34678.35),
(1, '014/2', 'Additional Gear', '2026-03-15', '2026-03-16', 0, 0, 0, 0, 0, 0, 0, 0);

INSERT INTO estimate_items (
  estimate_id, category, item_name, quantity, price_per_unit, kit_total, days, line_total, position_order, source_type, notes
)
VALUES
(1, 'Camera', 'Red Komodo 6K', 1, 3000, 3000, 3, 9000, 1, 'catalog', NULL),
(1, 'Camera Accessories', 'Nucleus M 2motor', 1, 1500, 1500, 3, 4500, 2, 'manual', NULL),
(1, 'Monitors and Playback', 'SmallHD Indie 7', 1, 2200, 2200, 3, 6600, 3, 'catalog', NULL);

INSERT INTO portal_users (business_key, username, password_hash, role, is_active)
VALUES
('cinetools', 'admin', 'd26c067037dfcb6d221d69f5ab335d0e:663c9f32ffc23cefc67de7811d940471a48a2d26a03f475c7c93eb415343ead0fa369022becf6ae4875a5b955fb4b5e6758f2f46396bd6a1a460daa84e5145e1', 'admin', TRUE),
('apitchenkov', 'admin', 'cf6674f2d53698811f4fd70047c43dc8:99b237ff76249b9fb5fd5532b0b58d2966eed32cfbb6134c59c771275622c3433e3b364b9946c2592f2a7a24cf2713d4ff8076ddf4e59bcf7cdb66b88be3c7dd', 'admin', TRUE);
