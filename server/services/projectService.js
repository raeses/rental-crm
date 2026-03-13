import pool from '../db/pool.js';

export async function createProject(data) {
  const [result] = await pool.execute(
    `INSERT INTO projects (internal_number, name, client, operator, start_date, end_date, status)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      data.internal_number || null,
      data.name,
      data.client || null,
      data.operator || null,
      data.start_date || null,
      data.end_date || null,
      data.status || 'draft'
    ]
  );

  return getProjectById(result.insertId);
}

export async function listProjects() {
  const [rows] = await pool.execute('SELECT * FROM projects ORDER BY id DESC');
  return rows;
}

export async function getProjectById(id) {
  const [rows] = await pool.execute('SELECT * FROM projects WHERE id = ?', [id]);
  return rows[0] || null;
}

export async function updateProject(id, data) {
  await pool.execute(
    `UPDATE projects
     SET internal_number=?, name=?, client=?, operator=?, start_date=?, end_date=?, status=?
     WHERE id=?`,
    [
      data.internal_number || null,
      data.name,
      data.client || null,
      data.operator || null,
      data.start_date || null,
      data.end_date || null,
      data.status || 'draft',
      id
    ]
  );

  return getProjectById(id);
}
