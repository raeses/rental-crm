import pool from '../db/pool.js';

function cleanString(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

function normalizeLimit(limit, fallback = 50, max = 200) {
  const parsed = Number(limit);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

export async function logUserActivity({
  userId = null,
  project,
  action,
  entity,
  entityId = null,
  ipAddress
}) {
  try {
    await pool.execute(
      `INSERT INTO user_activity_logs
        (user_id, project, action, entity, entity_id, ip_address)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        userId ? Number(userId) : null,
        cleanString(project, 64),
        cleanString(action, 120),
        cleanString(entity, 120),
        entityId == null ? null : Number(entityId),
        cleanString(ipAddress, 64) || 'unknown'
      ]
    );
  } catch (error) {
    console.error('[user-activity-logs] failed to persist activity log:', error.message);
  }
}

export async function listUserActivityLogs(userId, limit = 50) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) return [];

  const safeLimit = normalizeLimit(limit, 50, 300);
  const [rows] = await pool.execute(
    `SELECT id, user_id, project, action, entity, entity_id, ip_address, created_at
     FROM user_activity_logs
     WHERE user_id = ?
     ORDER BY created_at DESC, id DESC
     LIMIT ${safeLimit}`,
    [id]
  );

  return rows.map((row) => ({
    id: Number(row.id),
    user_id: Number(row.user_id),
    project: row.project,
    action: row.action,
    entity: row.entity,
    entity_id: row.entity_id == null ? null : Number(row.entity_id),
    ip_address: row.ip_address,
    created_at: row.created_at
  }));
}
