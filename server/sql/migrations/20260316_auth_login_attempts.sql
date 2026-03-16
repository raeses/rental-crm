CREATE TABLE IF NOT EXISTS auth_login_attempts (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  project_slug VARCHAR(64) NOT NULL,
  username VARCHAR(120) NOT NULL,
  ip_address VARCHAR(64) NOT NULL,
  user_agent VARCHAR(512) NULL,
  success TINYINT(1) NOT NULL,
  failure_reason VARCHAR(120) NULL,
  attempted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY idx_auth_login_attempts_project (project_slug),
  KEY idx_auth_login_attempts_username (username),
  KEY idx_auth_login_attempts_attempted_at (attempted_at),
  KEY idx_auth_login_attempts_success (success)
);
