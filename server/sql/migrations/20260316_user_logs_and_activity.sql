CREATE TABLE IF NOT EXISTS user_login_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NULL,
  project VARCHAR(64) NOT NULL,
  ip_address VARCHAR(64) NOT NULL,
  user_agent VARCHAR(512) NULL,
  success TINYINT(1) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY idx_user_login_logs_user_id (user_id),
  KEY idx_user_login_logs_project (project),
  KEY idx_user_login_logs_created_at (created_at),
  CONSTRAINT fk_user_login_logs_user
    FOREIGN KEY (user_id) REFERENCES auth_users(id)
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS user_activity_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NULL,
  project VARCHAR(64) NOT NULL,
  action VARCHAR(120) NOT NULL,
  entity VARCHAR(120) NOT NULL,
  entity_id BIGINT NULL,
  ip_address VARCHAR(64) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY idx_user_activity_logs_user_id (user_id),
  KEY idx_user_activity_logs_project (project),
  KEY idx_user_activity_logs_action (action),
  KEY idx_user_activity_logs_created_at (created_at),
  CONSTRAINT fk_user_activity_logs_user
    FOREIGN KEY (user_id) REFERENCES auth_users(id)
    ON DELETE SET NULL ON UPDATE CASCADE
);
