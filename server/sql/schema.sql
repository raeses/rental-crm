CREATE TABLE IF NOT EXISTS projects (
  id INT AUTO_INCREMENT PRIMARY KEY,
  internal_number VARCHAR(100),
  name VARCHAR(255) NOT NULL,
  client VARCHAR(255),
  operator VARCHAR(255),
  start_date DATE,
  end_date DATE,
  status ENUM('draft','confirmed','in_progress','completed','closed') DEFAULT 'draft',
  discount_percent DECIMAL(10,2) DEFAULT 0,
  tax_profile VARCHAR(50) DEFAULT 'none',
  tax_percent DECIMAL(10,2) DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(255) NOT NULL,
  price DECIMAL(12,2) DEFAULT 0,
  base_rate DECIMAL(12,2) DEFAULT 0,
  purchase_price DECIMAL(12,2) DEFAULT 0,
  purchase_date DATE NULL,
  status ENUM('available','unavailable','maintenance') DEFAULT 'available',
  is_archived BOOLEAN DEFAULT FALSE,
  archived_at DATETIME NULL,
  owner_type ENUM('own','partner') DEFAULT 'own',
  serial_number VARCHAR(255) NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS estimates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT NOT NULL,
  estimate_number VARCHAR(100) NOT NULL,
  title VARCHAR(255) NULL,
  start_date DATE NULL,
  end_date DATE NULL,
  discount_percent DECIMAL(10,2) DEFAULT 0,
  tax_enabled BOOLEAN DEFAULT FALSE,
  tax_percent DECIMAL(10,2) DEFAULT 0,
  subtotal DECIMAL(12,2) DEFAULT 0,
  discount_amount DECIMAL(12,2) DEFAULT 0,
  total_after_discount DECIMAL(12,2) DEFAULT 0,
  tax_amount DECIMAL(12,2) DEFAULT 0,
  grand_total DECIMAL(12,2) DEFAULT 0,
  is_archived BOOLEAN DEFAULT FALSE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_estimates_project FOREIGN KEY (project_id) REFERENCES projects(id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS estimate_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  estimate_id INT NOT NULL,
  category VARCHAR(255) NOT NULL,
  item_name VARCHAR(255) NOT NULL,
  quantity INT NOT NULL,
  price_per_unit DECIMAL(12,2) NOT NULL,
  kit_total DECIMAL(12,2) NOT NULL,
  days INT NOT NULL,
  line_total DECIMAL(12,2) NOT NULL,
  position_order INT DEFAULT 0,
  source_type ENUM('manual','catalog','subrental') DEFAULT 'manual',
  catalog_item_id INT NULL,
  notes TEXT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_estimate_items_estimate FOREIGN KEY (estimate_id) REFERENCES estimates(id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX idx_estimates_project_id ON estimates(project_id);
CREATE INDEX idx_estimate_items_estimate_id ON estimate_items(estimate_id);
CREATE INDEX idx_estimate_items_position_order ON estimate_items(position_order);
CREATE INDEX idx_items_category ON items(category);
CREATE INDEX idx_items_status ON items(status);
CREATE INDEX idx_items_is_archived ON items(is_archived);
