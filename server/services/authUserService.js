import pool from '../db/pool.js';
import {
  MANAGED_BUSINESS_PROJECTS,
  findConfiguredProjectUser,
  getProjectDefaultUsers
} from '../auth/projectsConfig.js';
import { hashPassword } from '../auth/passwordUtils.js';

let storeReadyPromise = null;

function normalizeProject(projectSlug) {
  return String(projectSlug || '').trim().toLowerCase();
}

function normalizeUsername(username) {
  return String(username || '').trim().toLowerCase();
}

function assertManagedProject(projectSlug) {
  const normalized = normalizeProject(projectSlug);
  if (!MANAGED_BUSINESS_PROJECTS.includes(normalized)) {
    const error = new Error('Unsupported project slug');
    error.status = 400;
    throw error;
  }
  return normalized;
}

async function ensureAuthUsersTable() {
  await pool.execute(
    `CREATE TABLE IF NOT EXISTS auth_users (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      project_slug VARCHAR(64) NOT NULL,
      username VARCHAR(120) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(64) NOT NULL DEFAULT 'manager',
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_auth_users_project_username (project_slug, username),
      KEY idx_auth_users_project (project_slug),
      KEY idx_auth_users_active (is_active)
    )`
  );
}

async function seedDefaultManagedUsers() {
  for (const projectSlug of MANAGED_BUSINESS_PROJECTS) {
    const defaults = getProjectDefaultUsers(projectSlug);
    for (const user of defaults) {
      await pool.execute(
        `INSERT INTO auth_users (project_slug, username, password_hash, role, is_active)
         VALUES (?, ?, ?, ?, 1)
         ON DUPLICATE KEY UPDATE id = id`,
        [
          normalizeProject(projectSlug),
          normalizeUsername(user.username),
          user.passwordHash,
          user.role || 'admin'
        ]
      );
    }
  }
}

async function ensureStoreReady() {
  if (!storeReadyPromise) {
    storeReadyPromise = (async () => {
      await ensureAuthUsersTable();
      await seedDefaultManagedUsers();
    })().catch((error) => {
      storeReadyPromise = null;
      throw error;
    });
  }

  await storeReadyPromise;
}

export async function getAuthLoginUser(projectSlug, username) {
  const normalizedProject = normalizeProject(projectSlug);
  const normalizedUsername = normalizeUsername(username);
  if (!normalizedProject || !normalizedUsername) return null;

  if (MANAGED_BUSINESS_PROJECTS.includes(normalizedProject)) {
    await ensureStoreReady();

    const [rows] = await pool.execute(
      `SELECT id, project_slug, username, password_hash, role, is_active
       FROM auth_users
       WHERE project_slug = ?
         AND username = ?
         AND is_active = 1
       LIMIT 1`,
      [normalizedProject, normalizedUsername]
    );

    if (rows[0]) {
      return {
        id: `db-${rows[0].id}`,
        username: rows[0].username,
        role: rows[0].role || 'manager',
        passwordHash: rows[0].password_hash
      };
    }
  }

  const fallback = findConfiguredProjectUser(normalizedProject, normalizedUsername);
  if (!fallback) return null;

  return {
    id: fallback.id,
    username: normalizeUsername(fallback.username),
    role: fallback.role || 'admin',
    passwordHash: fallback.passwordHash
  };
}

export async function listManagedProjectUsers(projectSlug) {
  const normalizedProject = assertManagedProject(projectSlug);
  await ensureStoreReady();

  const [rows] = await pool.execute(
    `SELECT id, project_slug, username, role, is_active, created_at, updated_at
     FROM auth_users
     WHERE project_slug = ?
     ORDER BY username ASC`,
    [normalizedProject]
  );

  return rows.map((row) => ({
    id: Number(row.id),
    project_slug: row.project_slug,
    username: row.username,
    role: row.role,
    is_active: Boolean(row.is_active),
    created_at: row.created_at,
    updated_at: row.updated_at
  }));
}

export async function createManagedProjectUser(payload) {
  const projectSlug = assertManagedProject(payload.project_slug);
  const username = normalizeUsername(payload.username);
  const role = String(payload.role || 'manager').trim().toLowerCase() || 'manager';
  const password = String(payload.password || '');

  if (!username) {
    const error = new Error('Username is required');
    error.status = 400;
    throw error;
  }

  if (!password || password.length < 8) {
    const error = new Error('Password must be at least 8 characters');
    error.status = 400;
    throw error;
  }

  await ensureStoreReady();

  try {
    const [result] = await pool.execute(
      `INSERT INTO auth_users (project_slug, username, password_hash, role, is_active)
       VALUES (?, ?, ?, ?, 1)`,
      [projectSlug, username, hashPassword(password), role]
    );

    const [rows] = await pool.execute(
      `SELECT id, project_slug, username, role, is_active, created_at, updated_at
       FROM auth_users
       WHERE id = ?
       LIMIT 1`,
      [result.insertId]
    );

    const created = rows[0];
    return {
      id: Number(created.id),
      project_slug: created.project_slug,
      username: created.username,
      role: created.role,
      is_active: Boolean(created.is_active),
      created_at: created.created_at,
      updated_at: created.updated_at
    };
  } catch (error) {
    if (String(error.code || '') === 'ER_DUP_ENTRY') {
      const duplicateError = new Error('User already exists for this project');
      duplicateError.status = 409;
      throw duplicateError;
    }
    throw error;
  }
}

export async function updateManagedProjectUser(userId, payload) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) {
    const error = new Error('Invalid user id');
    error.status = 400;
    throw error;
  }

  await ensureStoreReady();

  const [existingRows] = await pool.execute(
    `SELECT id, project_slug, username, role, is_active
     FROM auth_users
     WHERE id = ?
     LIMIT 1`,
    [id]
  );

  const existing = existingRows[0];
  if (!existing) {
    const error = new Error('User not found');
    error.status = 404;
    throw error;
  }

  const nextUsername = payload.username
    ? normalizeUsername(payload.username)
    : existing.username;
  const nextRole = payload.role
    ? String(payload.role).trim().toLowerCase()
    : existing.role;
  const nextActive =
    typeof payload.is_active === 'boolean'
      ? payload.is_active
      : Number(existing.is_active) === 1;

  if (!nextUsername) {
    const error = new Error('Username is required');
    error.status = 400;
    throw error;
  }

  if (!nextRole) {
    const error = new Error('Role is required');
    error.status = 400;
    throw error;
  }

  const password = typeof payload.password === 'string' ? payload.password : '';
  const shouldUpdatePassword = password.length > 0;
  if (shouldUpdatePassword && password.length < 8) {
    const error = new Error('Password must be at least 8 characters');
    error.status = 400;
    throw error;
  }

  const updateSql = shouldUpdatePassword
    ? `UPDATE auth_users
       SET username = ?, role = ?, is_active = ?, password_hash = ?
       WHERE id = ?`
    : `UPDATE auth_users
       SET username = ?, role = ?, is_active = ?
       WHERE id = ?`;

  const updateParams = shouldUpdatePassword
    ? [nextUsername, nextRole, nextActive ? 1 : 0, hashPassword(password), id]
    : [nextUsername, nextRole, nextActive ? 1 : 0, id];

  try {
    await pool.execute(updateSql, updateParams);
  } catch (error) {
    if (String(error.code || '') === 'ER_DUP_ENTRY') {
      const duplicateError = new Error('User already exists for this project');
      duplicateError.status = 409;
      throw duplicateError;
    }
    throw error;
  }

  const [rows] = await pool.execute(
    `SELECT id, project_slug, username, role, is_active, created_at, updated_at
     FROM auth_users
     WHERE id = ?
     LIMIT 1`,
    [id]
  );

  const updated = rows[0];
  return {
    id: Number(updated.id),
    project_slug: updated.project_slug,
    username: updated.username,
    role: updated.role,
    is_active: Boolean(updated.is_active),
    created_at: updated.created_at,
    updated_at: updated.updated_at
  };
}
