SET @has_tax_profile := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'projects'
    AND COLUMN_NAME = 'tax_profile'
);

SET @sql_tax_profile := IF(
  @has_tax_profile = 0,
  "ALTER TABLE projects ADD COLUMN tax_profile VARCHAR(50) DEFAULT 'none' AFTER status",
  "SELECT 1"
);

PREPARE stmt_tax_profile FROM @sql_tax_profile;
EXECUTE stmt_tax_profile;
DEALLOCATE PREPARE stmt_tax_profile;

SET @has_tax_percent := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'projects'
    AND COLUMN_NAME = 'tax_percent'
);

SET @sql_tax_percent := IF(
  @has_tax_percent = 0,
  "ALTER TABLE projects ADD COLUMN tax_percent DECIMAL(10,2) DEFAULT 0 AFTER tax_profile",
  "SELECT 1"
);

PREPARE stmt_tax_percent FROM @sql_tax_percent;
EXECUTE stmt_tax_percent;
DEALLOCATE PREPARE stmt_tax_percent;
