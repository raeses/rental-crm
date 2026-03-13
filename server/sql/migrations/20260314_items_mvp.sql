CREATE TABLE IF NOT EXISTS items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(255) NOT NULL,
  price DECIMAL(12,2) DEFAULT 0,
  base_rate DECIMAL(12,2) DEFAULT 0,
  purchase_price DECIMAL(12,2) DEFAULT 0,
  purchase_date DATE NULL,
  status ENUM('available','unavailable','maintenance') DEFAULT 'available',
  owner_type ENUM('own','partner') DEFAULT 'own',
  serial_number VARCHAR(255) NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

ALTER TABLE items
  ADD COLUMN IF NOT EXISTS base_rate DECIMAL(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS purchase_price DECIMAL(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS purchase_date DATE NULL,
  ADD COLUMN IF NOT EXISTS owner_type ENUM('own','partner') DEFAULT 'own',
  ADD COLUMN IF NOT EXISTS serial_number VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

UPDATE items
SET
  category = COALESCE(NULLIF(TRIM(category), ''), 'Other'),
  status = CASE
    WHEN status IN ('available', 'unavailable', 'maintenance') THEN status
    ELSE 'available'
  END,
  owner_type = CASE
    WHEN owner_type IN ('own', 'partner') THEN owner_type
    ELSE 'own'
  END,
  base_rate = COALESCE(base_rate, 0),
  purchase_price = COALESCE(purchase_price, 0);

ALTER TABLE items
  MODIFY COLUMN name VARCHAR(255) NOT NULL,
  MODIFY COLUMN category VARCHAR(255) NOT NULL,
  MODIFY COLUMN price DECIMAL(12,2) DEFAULT 0,
  MODIFY COLUMN base_rate DECIMAL(12,2) DEFAULT 0,
  MODIFY COLUMN purchase_price DECIMAL(12,2) DEFAULT 0,
  MODIFY COLUMN purchase_date DATE NULL,
  MODIFY COLUMN status ENUM('available','unavailable','maintenance') DEFAULT 'available',
  MODIFY COLUMN owner_type ENUM('own','partner') DEFAULT 'own',
  MODIFY COLUMN serial_number VARCHAR(255) NULL;

SET @idx_items_category_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'items'
    AND index_name = 'idx_items_category'
);
SET @idx_items_category_sql := IF(
  @idx_items_category_exists = 0,
  'CREATE INDEX idx_items_category ON items(category)',
  'SELECT 1'
);
PREPARE idx_items_category_stmt FROM @idx_items_category_sql;
EXECUTE idx_items_category_stmt;
DEALLOCATE PREPARE idx_items_category_stmt;

SET @idx_items_status_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'items'
    AND index_name = 'idx_items_status'
);
SET @idx_items_status_sql := IF(
  @idx_items_status_exists = 0,
  'CREATE INDEX idx_items_status ON items(status)',
  'SELECT 1'
);
PREPARE idx_items_status_stmt FROM @idx_items_status_sql;
EXECUTE idx_items_status_stmt;
DEALLOCATE PREPARE idx_items_status_stmt;
