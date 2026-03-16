import { Router } from 'express';
import { MANAGED_BUSINESS_PROJECTS } from '../auth/projectsConfig.js';
import { verifyPassword } from '../auth/passwordUtils.js';
import {
  createManagedProjectUser,
  extractDbUserId,
  getAuthLoginUser,
  getAuthUserById,
  listManagedProjectUsers,
  resolveAuthUserId,
  upsertProjectUserPassword,
  updateManagedProjectUser
} from '../services/authUserService.js';
import { listUserLoginLogs } from '../services/userLoginLogService.js';
import { listUserActivityLogs, logUserActivity } from '../services/userActivityLogService.js';

const router = Router();

router.use((req, res, next) => {
  if (String(req.projectAuth?.role || '').toLowerCase() !== 'superadmin') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  return next();
});

function assertProjectSlug(value) {
  const projectSlug = String(value || '').trim().toLowerCase();
  if (!MANAGED_BUSINESS_PROJECTS.includes(projectSlug)) {
    const error = new Error('Invalid project slug');
    error.status = 400;
    throw error;
  }
  return projectSlug;
}

function assertUserId(value) {
  const userId = Number(value);
  if (!Number.isInteger(userId) || userId <= 0) {
    const error = new Error('Invalid user id');
    error.status = 400;
    throw error;
  }
  return userId;
}

function getClientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  if (forwarded) return forwarded;
  return String(req.ip || req.socket?.remoteAddress || '').trim() || 'unknown';
}

async function getActorUserId(req) {
  const fromSession = extractDbUserId(req.projectAuth?.id);
  if (fromSession) return fromSession;

  return resolveAuthUserId('admin', req.projectAuth?.username);
}

router.get('/users', async (req, res, next) => {
  try {
    const projectSlug = assertProjectSlug(req.query.project);
    const users = await listManagedProjectUsers(projectSlug);
    res.json({ users, project: projectSlug });
  } catch (error) {
    next(error);
  }
});

router.get('/users/:id/logins', async (req, res, next) => {
  try {
    const userId = assertUserId(req.params.id);
    const user = await getAuthUserById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const logins = await listUserLoginLogs(userId, req.query.limit);
    return res.json({ user, logins });
  } catch (error) {
    return next(error);
  }
});

router.get('/users/:id/activity', async (req, res, next) => {
  try {
    const userId = assertUserId(req.params.id);
    const user = await getAuthUserById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const activity = await listUserActivityLogs(userId, req.query.limit);
    return res.json({ user, activity });
  } catch (error) {
    return next(error);
  }
});

router.post('/users', async (req, res, next) => {
  try {
    const user = await createManagedProjectUser({
      project_slug: req.body?.project_slug,
      username: req.body?.username,
      role: req.body?.role,
      password: req.body?.password
    });

    await logUserActivity({
      userId: await getActorUserId(req),
      project: 'admin',
      action: 'user_create',
      entity: 'user',
      entityId: user.id,
      ipAddress: getClientIp(req)
    });

    res.status(201).json(user);
  } catch (error) {
    next(error);
  }
});

router.put('/users/:id', async (req, res, next) => {
  try {
    const userId = assertUserId(req.params.id);
    const before = await getAuthUserById(userId);
    if (!before) return res.status(404).json({ error: 'User not found' });

    const user = await updateManagedProjectUser(req.params.id, {
      username: req.body?.username,
      role: req.body?.role,
      is_active: typeof req.body?.is_active === 'boolean' ? req.body.is_active : undefined,
      password: req.body?.password
    });

    await logUserActivity({
      userId: await getActorUserId(req),
      project: 'admin',
      action: 'user_update',
      entity: 'user',
      entityId: user.id,
      ipAddress: getClientIp(req)
    });

    if (String(before.role || '') !== String(user.role || '')) {
      await logUserActivity({
        userId: await getActorUserId(req),
        project: 'admin',
        action: 'role_change',
        entity: 'user_role',
        entityId: user.id,
        ipAddress: getClientIp(req)
      });
    }

    res.json(user);
  } catch (error) {
    next(error);
  }
});

router.post('/change-password', async (req, res, next) => {
  try {
    const currentPassword = String(req.body?.current_password || '');
    const newPassword = String(req.body?.new_password || '');
    const repeatPassword = String(req.body?.new_password_repeat || '');

    if (!currentPassword || !newPassword || !repeatPassword) {
      return res.status(400).json({ error: 'All password fields are required' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }

    if (newPassword !== repeatPassword) {
      return res.status(400).json({ error: 'New password confirmation does not match' });
    }

    const currentSessionUser = req.projectAuth || {};
    const username = String(currentSessionUser.username || '').trim().toLowerCase();
    if (!username) return res.status(401).json({ error: 'Auth required' });

    const authUser = await getAuthLoginUser('admin', username);
    if (!authUser || !verifyPassword(currentPassword, authUser.passwordHash)) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const updatedUserId = await upsertProjectUserPassword({
      projectSlug: 'admin',
      username,
      role: currentSessionUser.role || 'superadmin',
      password: newPassword
    });

    if (req.session?.authByProject?.admin) {
      req.session.authByProject.admin.id = updatedUserId ? `db-${updatedUserId}` : req.session.authByProject.admin.id;
    }

    await logUserActivity({
      userId: updatedUserId || (await getActorUserId(req)),
      project: 'admin',
      action: 'password_change',
      entity: 'user',
      entityId: updatedUserId || null,
      ipAddress: getClientIp(req)
    });

    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

export default router;
