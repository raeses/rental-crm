import { Router } from 'express';
import { getProjectConfig, listPortalProjects } from '../auth/projectsConfig.js';
import { getAuthLoginUser } from '../services/authUserService.js';
import { verifyPassword } from '../auth/passwordUtils.js';

const router = Router();

function getSessionAuth(req) {
  if (!req.session.authByProject) req.session.authByProject = {};
  return req.session.authByProject;
}

router.get('/projects', (_req, res) => {
  res.json({ projects: listPortalProjects() });
});

router.get('/:project/session', (req, res) => {
  const projectSlug = String(req.params.project || '').toLowerCase();
  const projectConfig = getProjectConfig(projectSlug);
  if (!projectConfig) return res.status(404).json({ error: 'Project not found' });

  const auth = req.session?.authByProject?.[projectSlug] || null;
  return res.json({
    authenticated: Boolean(auth),
    user: auth || null,
    project: {
      slug: projectConfig.slug,
      title: projectConfig.title,
      dashboardPath: projectConfig.dashboardPath,
      loginPath: projectConfig.loginPath
    }
  });
});

router.post('/:project/login', async (req, res, next) => {
  try {
    const projectSlug = String(req.params.project || '').toLowerCase();
    const projectConfig = getProjectConfig(projectSlug);
    if (!projectConfig) return res.status(404).json({ error: 'Project not found' });

    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '');
    if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });

    const user = await getAuthLoginUser(projectSlug, username);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const authByProject = getSessionAuth(req);
    authByProject[projectSlug] = {
      id: user.id,
      username: user.username,
      role: user.role,
      loggedAt: new Date().toISOString()
    };

    return req.session.save((error) => {
      if (error) return res.status(500).json({ error: 'Failed to persist session' });
      return res.json({
        ok: true,
        project: {
          slug: projectConfig.slug,
          title: projectConfig.title,
          dashboardPath: projectConfig.dashboardPath,
          loginPath: projectConfig.loginPath
        },
        user: authByProject[projectSlug]
      });
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/:project/logout', (req, res) => {
  const projectSlug = String(req.params.project || '').toLowerCase();
  const projectConfig = getProjectConfig(projectSlug);
  if (!projectConfig) return res.status(404).json({ error: 'Project not found' });

  const authByProject = getSessionAuth(req);
  delete authByProject[projectSlug];

  const hasAnyProjectSessions = Object.keys(authByProject).length > 0;
  if (hasAnyProjectSessions) {
    return req.session.save((error) => {
      if (error) return res.status(500).json({ error: 'Failed to persist session' });
      return res.json({ ok: true });
    });
  }

  return req.session.destroy(() => {
    res.clearCookie('portal.sid');
    return res.json({ ok: true });
  });
});

export default router;
