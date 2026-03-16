import pool from '../db/pool.js';

function cleanString(value, maxLength = 120) {
  return String(value || '').trim().slice(0, maxLength);
}

export async function logLoginAttempt({
  projectSlug,
  username,
  ipAddress,
  userAgent,
  success,
  failureReason = null
}) {
  try {
    await pool.execute(
      `INSERT INTO auth_login_attempts
        (project_slug, username, ip_address, user_agent, success, failure_reason)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        cleanString(projectSlug, 64),
        cleanString(username, 120),
        cleanString(ipAddress, 64),
        cleanString(userAgent, 512) || null,
        success ? 1 : 0,
        success ? null : cleanString(failureReason, 120) || 'invalid_credentials'
      ]
    );
  } catch (error) {
    console.error('[auth-audit] failed to persist login attempt:', error.message);
  }
}
