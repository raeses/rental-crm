import { Router } from 'express';
import { MANAGED_BUSINESS_PROJECTS } from '../auth/projectsConfig.js';
import {
  createManagedProjectUser,
  listManagedProjectUsers,
  updateManagedProjectUser
} from '../services/authUserService.js';

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

router.get('/users', async (req, res, next) => {
  try {
    const projectSlug = assertProjectSlug(req.query.project);
    const users = await listManagedProjectUsers(projectSlug);
    res.json({ users, project: projectSlug });
  } catch (error) {
    next(error);
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

    res.status(201).json(user);
  } catch (error) {
    next(error);
  }
});

router.put('/users/:id', async (req, res, next) => {
  try {
    const user = await updateManagedProjectUser(req.params.id, {
      username: req.body?.username,
      role: req.body?.role,
      is_active: typeof req.body?.is_active === 'boolean' ? req.body.is_active : undefined,
      password: req.body?.password
    });

    res.json(user);
  } catch (error) {
    next(error);
  }
});

export default router;
