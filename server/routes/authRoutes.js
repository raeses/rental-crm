import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { appEnv } from '../config/env.js';
import { getProjectConfig, listPortalProjects } from '../auth/projectsConfig.js';
import { extractDbUserId, getAuthLoginUser, resolveAuthUserId } from '../services/authUserService.js';
import { logLoginAttempt } from '../services/authAuditService.js';
import { logUserLogin } from '../services/userLoginLogService.js';
import { verifyPassword } from '../auth/passwordUtils.js';

const router = Router();

function getSessionAuth(req) {
  if (!req.session.authByProject) req.session.authByProject = {};
  return req.session.authByProject;
}

function getClientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  if (forwarded) return forwarded;
  return String(req.ip || req.socket?.remoteAddress || '').trim() || 'unknown';
}

function buildRateLimitHandler(reason) {
  return function rateLimitHandler(req, res) {
    const projectSlug = String(req.params.project || '').toLowerCase();
    const username = String(req.body?.username || '').trim().toLowerCase();

    void (async () => {
      const userId = await resolveAuthUserId(projectSlug, username);
      await logUserLogin({
        userId,
        project: projectSlug,
        ipAddress: getClientIp(req),
        userAgent: req.get('user-agent') || '',
        success: false
      });
    })();

    void logLoginAttempt({
      projectSlug,
      username: username || 'unknown',
      ipAddress: getClientIp(req),
      userAgent: req.get('user-agent') || '',
      success: false,
      failureReason: reason
    });

    res.status(429).json({ error: 'Too many authentication attempts. Try again later.' });
  };
}

const loginLimiter = rateLimit({
  windowMs: appEnv.security.loginRateLimitWindowMs,
  max: appEnv.security.loginRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${String(req.params.project || '').toLowerCase()}:${req.ip}`,
  handler: buildRateLimitHandler('rate_limited')
});

const failedLoginLimiter = rateLimit({
  windowMs: appEnv.security.loginRateLimitWindowMs,
  max: appEnv.security.loginFailureRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `${String(req.params.project || '').toLowerCase()}:${req.ip}`,
  handler: buildRateLimitHandler('too_many_failures')
});

const sessionLimiter = rateLimit({
  windowMs: appEnv.security.sessionRateLimitWindowMs,
  max: appEnv.security.sessionRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${String(req.params.project || '').toLowerCase()}:${req.ip}`,
  message: { error: 'Too many session checks. Try again later.' }
});

function authCookieOptions() {
  return {
    path: '/',
    httpOnly: true,
    sameSite: appEnv.isProduction ? 'strict' : 'lax',
    secure: appEnv.isProduction
  };
}

router.get('/projects', (_req, res) => {
  res.json({ projects: listPortalProjects() });
});

router.get('/:project/session', sessionLimiter, (req, res) => {
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

router.post('/:project/login', loginLimiter, failedLoginLimiter, async (req, res, next) => {
  try {
    const projectSlug = String(req.params.project || '').toLowerCase();
    const projectConfig = getProjectConfig(projectSlug);
    if (!projectConfig) return res.status(404).json({ error: 'Project not found' });

    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '');
    const normalizedUsername = username.toLowerCase();

    if (!username || !password) {
      const userId = await resolveAuthUserId(projectSlug, normalizedUsername);
      await logUserLogin({
        userId,
        project: projectSlug,
        ipAddress: getClientIp(req),
        userAgent: req.get('user-agent') || '',
        success: false
      });

      await logLoginAttempt({
        projectSlug,
        username: normalizedUsername || 'unknown',
        ipAddress: getClientIp(req),
        userAgent: req.get('user-agent') || '',
        success: false,
        failureReason: 'invalid_credentials'
      });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = await getAuthLoginUser(projectSlug, normalizedUsername);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      const userId = await resolveAuthUserId(projectSlug, normalizedUsername);
      await logUserLogin({
        userId,
        project: projectSlug,
        ipAddress: getClientIp(req),
        userAgent: req.get('user-agent') || '',
        success: false
      });

      await logLoginAttempt({
        projectSlug,
        username: normalizedUsername,
        ipAddress: getClientIp(req),
        userAgent: req.get('user-agent') || '',
        success: false,
        failureReason: 'invalid_credentials'
      });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const previousAuth = { ...(req.session?.authByProject || {}) };

    return req.session.regenerate((regenError) => {
      if (regenError) return res.status(500).json({ error: 'Failed to establish session' });

      const authByProject = {
        ...previousAuth,
        [projectSlug]: {
          id: user.id,
          username: user.username,
          role: user.role,
          loggedAt: new Date().toISOString()
        }
      };

      req.session.authByProject = authByProject;

      return req.session.save(async (saveError) => {
        if (saveError) return res.status(500).json({ error: 'Failed to persist session' });

        await logLoginAttempt({
          projectSlug,
          username: normalizedUsername,
          ipAddress: getClientIp(req),
          userAgent: req.get('user-agent') || '',
          success: true
        });
        await logUserLogin({
          userId: extractDbUserId(user.id) || (await resolveAuthUserId(projectSlug, normalizedUsername)),
          project: projectSlug,
          ipAddress: getClientIp(req),
          userAgent: req.get('user-agent') || '',
          success: true
        });

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
    req.session.authByProject = authByProject;
    return req.session.save((error) => {
      if (error) return res.status(500).json({ error: 'Failed to persist session' });
      return res.json({ ok: true });
    });
  }

  return req.session.destroy((error) => {
    if (error) return res.status(500).json({ error: 'Failed to destroy session' });
    res.clearCookie(appEnv.session.cookieName, authCookieOptions());
    return res.json({ ok: true });
  });
});

export default router;
