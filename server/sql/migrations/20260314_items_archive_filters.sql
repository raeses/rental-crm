ALTER TABLE items
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS archived_at DATETIME NULL;

UPDATE items
SET is_archived = COALESCE(is_archived, FALSE);

ALTER TABLE items
  MODIFY COLUMN is_archived BOOLEAN DEFAULT FALSE,
  MODIFY COLUMN archived_at DATETIME NULL;

SET @idx_items_is_archived_exists := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'items'
    AND index_name = 'idx_items_is_archived'
);
SET @idx_items_is_archived_sql := IF(
  @idx_items_is_archived_exists = 0,
  'CREATE INDEX idx_items_is_archived ON items(is_archived)',
  'SELECT 1'
);
PREPARE idx_items_is_archived_stmt FROM @idx_items_is_archived_sql;
EXECUTE idx_items_is_archived_stmt;
DEALLOCATE PREPARE idx_items_is_archived_stmt;
