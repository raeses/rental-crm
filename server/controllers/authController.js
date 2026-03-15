import { getBusinessConfig, listBusinesses } from '../config/businesses.js';
import {
  authenticateUser,
  clearSessionCookie,
  createSessionCookie,
  createSessionToken,
  readSession
} from '../services/authService.js';

function isSecureRequest(req) {
  return req.secure || req.headers['x-forwarded-proto'] === 'https';
}

function presentBusiness(business) {
  return {
    key: business.key,
    name: business.name,
    subtitle: business.subtitle,
    description: business.description,
    dashboardPath: business.dashboardPath,
    loginPath: business.loginPath,
    status: business.status
  };
}

function presentSession(session) {
  return {
    user: {
      id: Number(session.sub),
      username: session.username,
      role: session.role
    }
  };
}

export function listBusinessesHandler(_req, res) {
  res.json(listBusinesses());
}

export async function loginHandler(req, res, next) {
  try {
    const business = getBusinessConfig(req.params.business);
    if (!business) return res.status(404).json({ error: 'Business not found' });

    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const user = await authenticateUser(business.key, username, password);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const token = createSessionToken(user);
    res.setHeader('Set-Cookie', createSessionCookie(business.key, token, { secure: isSecureRequest(req) }));
    return res.json({
      business: presentBusiness(business),
      user: {
        id: user.id,
        username: user.username,
        role: user.role
      }
    });
  } catch (error) {
    return next(error);
  }
}

export function logoutHandler(req, res) {
  const business = getBusinessConfig(req.params.business);
  if (!business) return res.status(404).json({ error: 'Business not found' });

  res.setHeader('Set-Cookie', clearSessionCookie(business.key, { secure: isSecureRequest(req) }));
  return res.status(204).send();
}

export function sessionHandler(req, res) {
  const business = getBusinessConfig(req.params.business);
  if (!business) return res.status(404).json({ error: 'Business not found' });

  const session = readSession(req, business.key);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  return res.json({
    business: presentBusiness(business),
    ...presentSession(session)
  });
}

