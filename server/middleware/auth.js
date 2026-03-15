import { getBusinessConfig } from '../config/businesses.js';
import { readSession } from '../services/authService.js';

export function requireBusinessAuth(businessKey) {
  return (req, res, next) => {
    const business = getBusinessConfig(businessKey);
    if (!business) return res.status(404).json({ error: 'Business not found' });

    const session = readSession(req, business.key);
    if (!session) return res.status(401).json({ error: 'Unauthorized' });

    req.auth = session;
    return next();
  };
}

