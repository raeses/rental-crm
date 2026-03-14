import pool from '../db/pool.js';

export async function listItems() {
  const [rows] = await pool.execute('SELECT * FROM items ORDER BY is_archived ASC, id DESC');
  return rows;
}

export async function getItemById(id) {
  const [rows] = await pool.execute('SELECT * FROM items WHERE id = ?', [id]);
  return rows[0] || null;
}

export async function getItemUsageHistory(itemId) {
  const [rows] = await pool.execute(
    `SELECT
      ei.id,
      ei.item_name,
      ei.quantity,
      ei.price_per_unit,
      ei.days,
      ei.line_total,
      ei.created_at,
      e.id AS estimate_id,
      e.estimate_number,
      e.title AS estimate_title,
      e.start_date AS estimate_start_date,
      e.end_date AS estimate_end_date,
      p.id AS project_id,
      p.name AS project_name,
      p.start_date AS project_start_date,
      p.end_date AS project_end_date
     FROM estimate_items ei
     INNER JOIN estimates e ON e.id = ei.estimate_id
     INNER JOIN projects p ON p.id = e.project_id
     WHERE ei.catalog_item_id = ?
     ORDER BY COALESCE(e.start_date, p.start_date) DESC, ei.id DESC`,
    [itemId]
  );

  return rows;
}

export async function getItemDetailsById(id) {
  const item = await getItemById(id);
  if (!item) return null;

  const usage_history = await getItemUsageHistory(id);
  return { ...item, usage_history };
}

export async function createItem(data) {
  const [result] = await pool.execute(
    `INSERT INTO items
      (name, category, price, base_rate, purchase_price, purchase_date, status, is_archived, archived_at, owner_type, serial_number)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.name,
      data.category,
      Number(data.price || 0),
      Number(data.base_rate || 0),
      Number(data.purchase_price || 0),
      data.purchase_date || null,
      data.status || 'available',
      Boolean(data.is_archived),
      data.is_archived ? new Date() : null,
      data.owner_type || 'own',
      data.serial_number || null
    ]
  );

  return getItemById(result.insertId);
}

export async function updateItem(id, data) {
  const [result] = await pool.execute(
    `UPDATE items
     SET name=?, category=?, price=?, base_rate=?, purchase_price=?, purchase_date=?, status=?, owner_type=?, serial_number=?
     WHERE id=?`,
    [
      data.name,
      data.category,
      Number(data.price || 0),
      Number(data.base_rate || 0),
      Number(data.purchase_price || 0),
      data.purchase_date || null,
      data.status || 'available',
      data.owner_type || 'own',
      data.serial_number || null,
      id
    ]
  );

  if (!result.affectedRows) return null;
  return getItemById(id);
}

export async function setItemArchived(id, isArchived) {
  const [result] = await pool.execute(
    `UPDATE items
     SET is_archived=?, archived_at=?
     WHERE id=?`,
    [Boolean(isArchived), isArchived ? new Date() : null, id]
  );

  if (!result.affectedRows) return null;
  return getItemById(id);
}
