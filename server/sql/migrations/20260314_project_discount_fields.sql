SET @project_discount_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'projects'
    AND COLUMN_NAME = 'discount_percent'
);

SET @project_discount_sql := IF(
  @project_discount_exists = 0,
  'ALTER TABLE projects ADD COLUMN discount_percent DECIMAL(10,2) DEFAULT 0 AFTER status',
  'SELECT 1'
);

PREPARE project_discount_stmt FROM @project_discount_sql;
EXECUTE project_discount_stmt;
DEALLOCATE PREPARE project_discount_stmt;
