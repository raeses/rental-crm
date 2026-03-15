import pool from '../db/pool.js';

const PROJECT_SELECT = `
  SELECT
    p.*,
    COALESCE(SUM(CASE WHEN e.is_archived = 0 THEN e.grand_total ELSE 0 END), 0) AS total,
    COUNT(CASE WHEN e.is_archived = 0 THEN 1 END) AS estimate_count
  FROM projects p
  LEFT JOIN estimates e ON e.project_id = p.id
`;

export async function createProject(data) {
  const [result] = await pool.execute(
    `INSERT INTO projects (internal_number, name, client, operator, start_date, end_date, status, discount_percent, tax_profile, tax_percent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.internal_number || null,
      data.name,
      data.client || null,
      data.operator || null,
      data.start_date || null,
      data.end_date || null,
      data.status || 'draft',
      Number(data.discount_percent || 0),
      data.tax_profile || 'none',
      Number(data.tax_percent || 0)
    ]
  );

  return getProjectById(result.insertId);
}

export async function listProjects() {
  const [rows] = await pool.execute(`${PROJECT_SELECT} GROUP BY p.id ORDER BY p.id DESC`);
  return rows;
}

export async function getProjectById(id) {
  const [rows] = await pool.execute(`${PROJECT_SELECT} WHERE p.id = ? GROUP BY p.id`, [id]);
  return rows[0] || null;
}

export async function updateProject(id, data) {
  await pool.execute(
    `UPDATE projects
     SET internal_number=?, name=?, client=?, operator=?, start_date=?, end_date=?, status=?, discount_percent=?, tax_profile=?, tax_percent=?
     WHERE id=?`,
    [
      data.internal_number || null,
      data.name,
      data.client || null,
      data.operator || null,
      data.start_date || null,
      data.end_date || null,
      data.status || 'draft',
      Number(data.discount_percent || 0),
      data.tax_profile || 'none',
      Number(data.tax_percent || 0),
      id
    ]
  );

  return getProjectById(id);
}
