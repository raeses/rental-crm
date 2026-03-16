import pool from '../db/pool.js';

function cleanString(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

function normalizeLimit(limit, fallback = 50, max = 200) {
  const parsed = Number(limit);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

export async function logUserLogin({
  userId = null,
  project,
  ipAddress,
  userAgent,
  success
}) {
  try {
    await pool.execute(
      `INSERT INTO user_login_logs
        (user_id, project, ip_address, user_agent, success)
       VALUES (?, ?, ?, ?, ?)`,
      [
        userId ? Number(userId) : null,
        cleanString(project, 64),
        cleanString(ipAddress, 64) || 'unknown',
        cleanString(userAgent, 512) || null,
        success ? 1 : 0
      ]
    );
  } catch (error) {
    console.error('[user-login-logs] failed to persist login log:', error.message);
  }
}

export async function listUserLoginLogs(userId, limit = 50) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) return [];

  const safeLimit = normalizeLimit(limit, 50, 300);
  const [rows] = await pool.execute(
    `SELECT id, user_id, project, ip_address, user_agent, success, created_at
     FROM user_login_logs
     WHERE user_id = ?
     ORDER BY created_at DESC, id DESC
     LIMIT ${safeLimit}`,
    [id]
  );

  return rows.map((row) => ({
    id: Number(row.id),
    user_id: Number(row.user_id),
    project: row.project,
    ip_address: row.ip_address,
    user_agent: row.user_agent,
    success: Boolean(row.success),
    created_at: row.created_at
  }));
}
