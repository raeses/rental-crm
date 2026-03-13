import pool from '../db/pool.js';

export async function listItems() {
  const [rows] = await pool.execute('SELECT * FROM items ORDER BY id DESC');
  return rows;
}

export async function getItemById(id) {
  const [rows] = await pool.execute('SELECT * FROM items WHERE id = ?', [id]);
  return rows[0] || null;
}

export async function createItem(data) {
  const [result] = await pool.execute(
    `INSERT INTO items
      (name, category, price, base_rate, purchase_price, purchase_date, status, owner_type, serial_number)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.name,
      data.category,
      Number(data.price || 0),
      Number(data.base_rate || 0),
      Number(data.purchase_price || 0),
      data.purchase_date || null,
      data.status || 'available',
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
