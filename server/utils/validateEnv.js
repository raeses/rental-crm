function parseBool(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (value == null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(normalized);
}

function parseCsv(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function isValidUrl(value) {
  try {
    const parsed = new URL(value);
    return Boolean(parsed.protocol && parsed.host);
  } catch {
    return false;
  }
}

function isScryptHash(value) {
  if (!value || typeof value !== 'string') return false;
  const [algorithm, salt, digest] = value.split('$');
  if (algorithm !== 'scrypt') return false;
  if (!salt || !digest) return false;
  if (!/^[a-f0-9]+$/i.test(salt) || !/^[a-f0-9]+$/i.test(digest)) return false;
  return salt.length >= 16 && digest.length >= 64;
}

export function validateEnv(raw = process.env) {
  const nodeEnv = String(raw.NODE_ENV || 'development').trim().toLowerCase();
  const isProduction = nodeEnv === 'production';
  const errors = [];

  const requiredDb = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_NAME'];
  requiredDb.forEach((key) => {
    if (!String(raw[key] || '').trim()) {
      errors.push(`Missing required env: ${key}`);
    }
  });

  const sessionSecret = String(raw.SESSION_SECRET || '').trim();
  if (!sessionSecret) {
    errors.push('Missing required env: SESSION_SECRET');
  }

  if (isProduction) {
    if (sessionSecret.length < 32) {
      errors.push('SESSION_SECRET must be at least 32 characters in production');
    }

    const weakSecrets = ['change-me-in-production', 'changeme', 'secret', 'password'];
    if (weakSecrets.includes(sessionSecret.toLowerCase())) {
      errors.push('SESSION_SECRET is weak and not allowed in production');
    }
  }

  const credentialEnv = [
    ['APITCHENKOV_ADMIN_USERNAME', raw.APITCHENKOV_ADMIN_USERNAME],
    ['APITCHENKOV_ADMIN_PASSWORD_HASH', raw.APITCHENKOV_ADMIN_PASSWORD_HASH],
    ['CINETOOLS_ADMIN_USERNAME', raw.CINETOOLS_ADMIN_USERNAME],
    ['CINETOOLS_ADMIN_PASSWORD_HASH', raw.CINETOOLS_ADMIN_PASSWORD_HASH],
    ['PORTAL_ADMIN_USERNAME', raw.PORTAL_ADMIN_USERNAME],
    ['PORTAL_ADMIN_PASSWORD_HASH', raw.PORTAL_ADMIN_PASSWORD_HASH]
  ];

  if (isProduction) {
    credentialEnv.forEach(([key, value]) => {
      if (!String(value || '').trim()) {
        errors.push(`Missing required env in production: ${key}`);
      }
    });

    ['APITCHENKOV_ADMIN_PASSWORD_HASH', 'CINETOOLS_ADMIN_PASSWORD_HASH', 'PORTAL_ADMIN_PASSWORD_HASH']
      .forEach((key) => {
        const value = String(raw[key] || '').trim();
        if (value && !isScryptHash(value)) {
          errors.push(`${key} must be a valid scrypt hash`);
        }
      });

    if (!String(raw.REDIS_URL || '').trim()) {
      errors.push('Missing required env in production: REDIS_URL');
    }
  }

  const trustProxy = parseBool(raw.TRUST_PROXY, isProduction);
  const requireHttpsInProd = parseBool(raw.REQUIRE_HTTPS_IN_PROD, true);
  const enableDevAuthFallback =
    nodeEnv === 'development' && parseBool(raw.ENABLE_DEV_AUTH_FALLBACK, false);

  const corsAllowedOrigins = parseCsv(raw.CORS_ALLOWED_ORIGINS);
  if (isProduction && corsAllowedOrigins.length === 0) {
    errors.push('CORS_ALLOWED_ORIGINS must be configured in production');
  }
  corsAllowedOrigins.forEach((origin) => {
    if (!isValidUrl(origin)) {
      errors.push(`CORS_ALLOWED_ORIGINS contains invalid URL: ${origin}`);
    }
  });

  const sessionCookieName = String(raw.SESSION_COOKIE_NAME || 'portal.sid').trim() || 'portal.sid';
  const sessionTtlMs = Number(raw.SESSION_TTL_MS || 1000 * 60 * 60 * 12);
  const loginRateLimitWindowMs = Number(raw.LOGIN_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000);
  const loginRateLimitMax = Number(raw.LOGIN_RATE_LIMIT_MAX || 10);
  const loginFailureRateLimitMax = Number(raw.LOGIN_FAILURE_RATE_LIMIT_MAX || 5);
  const sessionRateLimitWindowMs = Number(raw.SESSION_RATE_LIMIT_WINDOW_MS || 60 * 1000);
  const sessionRateLimitMax = Number(raw.SESSION_RATE_LIMIT_MAX || 120);

  if (!Number.isFinite(sessionTtlMs) || sessionTtlMs <= 0) {
    errors.push('SESSION_TTL_MS must be a positive number');
  }

  if (!Number.isFinite(loginRateLimitWindowMs) || loginRateLimitWindowMs <= 0) {
    errors.push('LOGIN_RATE_LIMIT_WINDOW_MS must be a positive number');
  }

  if (!Number.isFinite(loginRateLimitMax) || loginRateLimitMax <= 0) {
    errors.push('LOGIN_RATE_LIMIT_MAX must be a positive number');
  }

  if (!Number.isFinite(loginFailureRateLimitMax) || loginFailureRateLimitMax <= 0) {
    errors.push('LOGIN_FAILURE_RATE_LIMIT_MAX must be a positive number');
  }

  if (!Number.isFinite(sessionRateLimitWindowMs) || sessionRateLimitWindowMs <= 0) {
    errors.push('SESSION_RATE_LIMIT_WINDOW_MS must be a positive number');
  }

  if (!Number.isFinite(sessionRateLimitMax) || sessionRateLimitMax <= 0) {
    errors.push('SESSION_RATE_LIMIT_MAX must be a positive number');
  }

  if (errors.length) {
    throw new Error(`Environment validation failed:\n- ${errors.join('\n- ')}`);
  }

  return {
    nodeEnv,
    isProduction,
    db: {
      host: String(raw.DB_HOST || ''),
      port: Number(raw.DB_PORT || 3306),
      user: String(raw.DB_USER || ''),
      password: String(raw.DB_PASSWORD || ''),
      name: String(raw.DB_NAME || ''),
      poolSize: Number(raw.DB_POOL_SIZE || 10)
    },
    session: {
      secret: sessionSecret,
      cookieName: sessionCookieName,
      ttlMs: sessionTtlMs,
      redisUrl: String(raw.REDIS_URL || '').trim(),
      redisPrefix: String(raw.REDIS_PREFIX || 'sess:rental:'),
      trustProxy,
      requireHttpsInProd
    },
    security: {
      corsAllowedOrigins,
      enableDevAuthFallback,
      loginRateLimitWindowMs,
      loginRateLimitMax,
      loginFailureRateLimitMax,
      sessionRateLimitWindowMs,
      sessionRateLimitMax
    },
    auth: {
      apitchenkov: {
        username: String(raw.APITCHENKOV_ADMIN_USERNAME || '').trim(),
        passwordHash: String(raw.APITCHENKOV_ADMIN_PASSWORD_HASH || '').trim()
      },
      cinetools: {
        username: String(raw.CINETOOLS_ADMIN_USERNAME || '').trim(),
        passwordHash: String(raw.CINETOOLS_ADMIN_PASSWORD_HASH || '').trim()
      },
      admin: {
        username: String(raw.PORTAL_ADMIN_USERNAME || '').trim(),
        passwordHash: String(raw.PORTAL_ADMIN_PASSWORD_HASH || '').trim()
      }
    }
  };
}
