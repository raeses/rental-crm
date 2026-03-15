CREATE TABLE IF NOT EXISTS portal_users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  business_key VARCHAR(64) NOT NULL,
  username VARCHAR(120) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(64) NOT NULL DEFAULT 'admin',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_portal_user_business_username (business_key, username),
  KEY idx_portal_user_business_key (business_key)
);

INSERT INTO portal_users (business_key, username, password_hash, role, is_active)
SELECT 'cinetools', 'admin', 'd26c067037dfcb6d221d69f5ab335d0e:663c9f32ffc23cefc67de7811d940471a48a2d26a03f475c7c93eb415343ead0fa369022becf6ae4875a5b955fb4b5e6758f2f46396bd6a1a460daa84e5145e1', 'admin', TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM portal_users WHERE business_key = 'cinetools' AND username = 'admin'
);

INSERT INTO portal_users (business_key, username, password_hash, role, is_active)
SELECT 'apitchenkov', 'admin', 'cf6674f2d53698811f4fd70047c43dc8:99b237ff76249b9fb5fd5532b0b58d2966eed32cfbb6134c59c771275622c3433e3b364b9946c2592f2a7a24cf2713d4ff8076ddf4e59bcf7cdb66b88be3c7dd', 'admin', TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM portal_users WHERE business_key = 'apitchenkov' AND username = 'admin'
);
