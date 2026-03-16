CREATE TABLE IF NOT EXISTS auth_users (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  project_slug VARCHAR(64) NOT NULL,
  username VARCHAR(120) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(64) NOT NULL DEFAULT 'manager',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_auth_users_project_username (project_slug, username),
  KEY idx_auth_users_project (project_slug),
  KEY idx_auth_users_active (is_active)
);
