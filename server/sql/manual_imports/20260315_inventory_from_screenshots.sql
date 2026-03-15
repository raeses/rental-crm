-- Import draft based on user-provided screenshots from 2026-03-15.
-- Assumptions:
-- 1. The source list keeps one row per model/position with `qty`, then expands into multiple `items` rows on insert.
-- 2. All imported items are active and owned: status='available', owner_type='own'.
-- 3. Tariff rate from the screenshot is written into both `price` and `base_rate`.
-- 4. purchase_price, purchase_date, and serial_number are unknown and therefore set to 0/NULL.
-- 5. Clarifications from the user:
--    - DZOFilm Arles lenses are separate positions at 2500 each.
--    - NISI IRND and diffusion filters are separate positions, not a single multi-qty row.
--    - Hollyland Solidcom C1 8S is one bundled position at 6000.
--    - V-mount batteries should be grouped by model in the source list.

WITH RECURSIVE seq AS (
  SELECT 1 AS n
  UNION ALL
  SELECT n + 1 FROM seq WHERE n < 20
),
inventory_source AS (
  SELECT 'Red Komodo' AS name, 'Camera' AS category, 1 AS qty, 7000 AS rate
  UNION ALL SELECT 'ARRI Alexa Mini', 'Camera', 1, 18000
  UNION ALL SELECT 'Dji Action 6', 'Camera', 1, 3000

  UNION ALL SELECT 'Nucleus M', 'Camera Accessories', 1, 1500
  UNION ALL SELECT 'Nucleus M II', 'Camera Accessories', 1, 3500
  UNION ALL SELECT 'NP-F970', 'Camera Accessories', 4, 200
  UNION ALL SELECT 'NP-F Charger', 'Camera Accessories', 1, 300
  UNION ALL SELECT 'Swit PB-S146S', 'Camera Accessories', 4, 400
  UNION ALL SELECT 'Swit PB-M98S', 'Camera Accessories', 4, 400
  UNION ALL SELECT 'Swit S-8228V', 'Camera Accessories', 2, 400
  UNION ALL SELECT 'Swit MINO-S210', 'Camera Accessories', 8, 400
  UNION ALL SELECT 'Kingma 150W', 'Camera Accessories', 1, 400
  UNION ALL SELECT 'Зарядное устройство SWIT PC-P461S V-mount', 'Camera Accessories', 1, 850
  UNION ALL SELECT 'Компендиум SmallRig 2660 легкий', 'Camera Accessories', 1, 400
  UNION ALL SELECT 'Компендиум Chewa Lmb-15 (3 stage)', 'Camera Accessories', 1, 1000

  UNION ALL SELECT 'Голова Sachtler Cine 30', 'Camera Support', 1, 3000
  UNION ALL SELECT 'Ноги универсальные, низкие, хайхэт', 'Camera Support', 1, 1000
  UNION ALL SELECT 'Movmax Danadolly', 'Camera Support', 1, 2500
  UNION ALL SELECT 'Shoulder Set Tilta', 'Camera Support', 1, 750
  UNION ALL SELECT 'CineSaddle', 'Camera Support', 1, 500
  UNION ALL SELECT 'Разгрузочный жилет с V-mount', 'Camera Support', 1, 750

  UNION ALL SELECT 'DZOFilm Arles 25mm T1.4', 'Lenses and Filters', 1, 2500
  UNION ALL SELECT 'DZOFilm Arles 35mm T1.4', 'Lenses and Filters', 1, 2500
  UNION ALL SELECT 'DZOFilm Arles 50mm T1.4', 'Lenses and Filters', 1, 2500
  UNION ALL SELECT 'DZOFilm Arles 75mm T1.4', 'Lenses and Filters', 1, 2500
  UNION ALL SELECT 'DZOFilm Arles 100mm T1.4', 'Lenses and Filters', 1, 2500
  UNION ALL SELECT 'Laowa 12MM Zero-D T2.9 PL', 'Lenses and Filters', 1, 2500
  UNION ALL SELECT 'Tokina ATX 11-20 T2.9 PL', 'Lenses and Filters', 1, 3000
  UNION ALL SELECT 'Tokina Macro 100mm T2.9 (PL)', 'Lenses and Filters', 1, 3000
  UNION ALL SELECT 'NISI Clear', 'Lenses and Filters', 1, 500
  UNION ALL SELECT 'NISI IRND 0.3', 'Lenses and Filters', 1, 500
  UNION ALL SELECT 'NISI IRND 0.6', 'Lenses and Filters', 1, 500
  UNION ALL SELECT 'NISI IRND 0.9', 'Lenses and Filters', 1, 500
  UNION ALL SELECT 'NISI IRND 1.2', 'Lenses and Filters', 1, 500
  UNION ALL SELECT 'NISI IRND 1.5', 'Lenses and Filters', 1, 500
  UNION ALL SELECT 'NISI IRND 1.8', 'Lenses and Filters', 1, 500
  UNION ALL SELECT 'Tiffen BlackProMist 1/2', 'Lenses and Filters', 1, 600
  UNION ALL SELECT 'Tiffen BlackProMist 1/4', 'Lenses and Filters', 1, 600
  UNION ALL SELECT 'Tiffen BlackProMist 1/8', 'Lenses and Filters', 1, 600
  UNION ALL SELECT 'Schneider Hollywood Black Magic 1/4', 'Lenses and Filters', 1, 600
  UNION ALL SELECT 'Schneider Hollywood Black Magic 1/8', 'Lenses and Filters', 1, 600
  UNION ALL SELECT 'NISI RotaPolo', 'Lenses and Filters', 1, 600

  UNION ALL SELECT 'Накамерный монитор SmallHD Indie 7 в клетке', 'Monitors and Playback', 1, 2000
  UNION ALL SELECT 'Накамерный монитор SmallHD Cine 7', 'Monitors and Playback', 1, 1000
  UNION ALL SELECT 'Монитор-рекордер Blackmagic Video Assist 7 12G в клетке', 'Monitors and Playback', 1, 2500
  UNION ALL SELECT 'Avmatrix + Ipad 13 Pro в клетке', 'Monitors and Playback', 1, 3500
  UNION ALL SELECT 'Монитор режиссерский Flanders Scientific DM211 + vesa mount', 'Monitors and Playback', 1, 4000
  UNION ALL SELECT 'Монитор режиссерский Sony LMD-A240 10 bit', 'Monitors and Playback', 1, 3000
  UNION ALL SELECT 'BlackMagic MultiView HD', 'Monitors and Playback', 1, 500
  UNION ALL SELECT 'Monitor Stand Roller + vsa mount', 'Monitors and Playback', 3, 750
  UNION ALL SELECT 'Accsoon CineMaster 4k (до 4х телефонов)', 'Monitors and Playback', 1, 1000
  UNION ALL SELECT 'Accsoon CineView M7 Pro монитор приемник', 'Monitors and Playback', 1, 2000
  UNION ALL SELECT 'Передатчик Vaxis 1000s', 'Monitors and Playback', 1, 1500
  UNION ALL SELECT 'Приемник Vaxis 1000s', 'Monitors and Playback', 3, 2500
  UNION ALL SELECT 'AJA Io XT', 'Monitors and Playback', 1, 1500
  UNION ALL SELECT 'Hollyland Solidcom C1 8S', 'Monitors and Playback', 1, 6000
  UNION ALL SELECT 'Hollyland Solidcom C1 8S with HUB', 'Monitors and Playback', 1, 8000
)
INSERT INTO items (
  name,
  category,
  price,
  base_rate,
  purchase_price,
  purchase_date,
  status,
  owner_type,
  serial_number
)
SELECT
  src.name,
  src.category,
  src.rate,
  src.rate,
  0,
  NULL,
  'available',
  'own',
  NULL
FROM inventory_source src
JOIN seq ON seq.n <= src.qty;
