import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import session from 'express-session';
import { RedisStore } from 'connect-redis';
import { createClient } from 'redis';
import path from 'path';
import { fileURLToPath } from 'url';
import { appEnv } from './config/env.js';
import projectsRoutes from './routes/projectsRoutes.js';
import estimatesRoutes from './routes/estimatesRoutes.js';
import itemsRoutes from './routes/itemsRoutes.js';
import authRoutes from './routes/authRoutes.js';
import cinetoolsRoutes from './routes/cinetoolsRoutes.js';
import adminUsersRoutes from './routes/adminUsersRoutes.js';
import { requireProjectAuth } from './middleware/requireProjectAuth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webRoot = path.resolve(__dirname, '..');
const cinetoolsWebRoot = path.resolve(process.env.CINETOOLS_WEB_ROOT || path.join(webRoot, 'cinetools'));

function isHttpsRequest(req) {
  if (req.secure) return true;
  const forwardedProto = String(req.get('x-forwarded-proto') || '').split(',')[0].trim().toLowerCase();
  return forwardedProto === 'https';
}

function hasProjectSession(req, projectSlug) {
  return Boolean(req.session?.authByProject?.[projectSlug]);
}

function buildTrustedOriginSet() {
  return new Set(appEnv.security.corsAllowedOrigins);
}

function createCorsOptions() {
  const allowedOrigins = buildTrustedOriginSet();

  return {
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.has(origin)) return callback(null, true);
      return callback(null, false);
    }
  };
}

function enforceTrustedMutationOrigin(req, res, next) {
  const isApiRequest = req.path.startsWith('/api/');
  const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
  if (!isApiRequest || !isMutation) return next();

  const origin = String(req.get('origin') || '').trim();
  if (!origin) return next();

  const sameOrigin = origin === `${req.protocol}://${req.get('host')}`;
  const allowed = appEnv.security.corsAllowedOrigins.includes(origin);

  if (sameOrigin || allowed) return next();
  return res.status(403).json({ error: 'Origin not allowed' });
}

function renderLoginPage(projectSlug, filePath) {
  return function handleLoginPage(req, res) {
    if (hasProjectSession(req, projectSlug)) {
      return res.redirect(`/${projectSlug}/dashboard/`);
    }

    return res.sendFile(filePath);
  };
}

function renderDashboardPage(projectSlug, filePath) {
  return function handleDashboardPage(req, res) {
    if (!hasProjectSession(req, projectSlug)) {
      return res.redirect(`/${projectSlug}/login/`);
    }

    return res.sendFile(filePath);
  };
}

async function createSessionStore() {
  if (!appEnv.session.redisUrl) return null;

  const redisClient = createClient({
    url: appEnv.session.redisUrl,
    socket: {
      connectTimeout: 5000
    }
  });

  redisClient.on('error', (error) => {
    console.error('[session-redis] client error:', error.message);
  });

  await redisClient.connect();
  return new RedisStore({
    client: redisClient,
    prefix: appEnv.session.redisPrefix
  });
}

async function bootstrap() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', appEnv.session.trustProxy ? 1 : false);

  if (appEnv.isProduction && appEnv.session.requireHttpsInProd) {
    app.use((req, res, next) => {
      if (req.path === '/health') return next();
      if (isHttpsRequest(req)) return next();
      return res.status(403).json({ error: 'HTTPS is required' });
    });
  }

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      frameguard: { action: 'sameorigin' },
      referrerPolicy: { policy: 'no-referrer' },
      hsts: appEnv.isProduction
        ? {
            maxAge: 31536000,
            includeSubDomains: true,
            preload: true
          }
        : false
    })
  );

  app.use((_, res, next) => {
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
    next();
  });

  const corsOptions = createCorsOptions();
  app.use(cors(corsOptions));
  app.options('*', cors(corsOptions));

  app.use(express.json({ limit: '200kb' }));
  app.use(enforceTrustedMutationOrigin);

  const sessionStore = await createSessionStore();

  app.use(
    session({
      store: sessionStore || undefined,
      name: appEnv.session.cookieName,
      secret: appEnv.session.secret,
      resave: false,
      saveUninitialized: false,
      rolling: appEnv.isProduction,
      cookie: {
        httpOnly: true,
        sameSite: appEnv.isProduction ? 'strict' : 'lax',
        secure: appEnv.isProduction,
        maxAge: appEnv.session.ttlMs
      }
    })
  );

  app.get('/health', (_req, res) => res.json({ ok: true }));

  app.use('/api/auth', authRoutes);

  app.use('/api/cinetools', requireProjectAuth('cinetools'), cinetoolsRoutes);
  app.use('/api/admin', requireProjectAuth('admin'), adminUsersRoutes);

  app.use('/api/items', requireProjectAuth('apitchenkov'), itemsRoutes);
  app.use('/api/projects', requireProjectAuth('apitchenkov'), projectsRoutes);
  app.use('/api', requireProjectAuth('apitchenkov'), estimatesRoutes);

  app.get('/', (_req, res) => res.sendFile(path.join(webRoot, 'index.html')));

  app.get(
    ['/apitchenkov/login', '/apitchenkov/login/', '/apitchenkov/login/index.html'],
    renderLoginPage('apitchenkov', path.join(webRoot, 'apitchenkov/login/index.html'))
  );
  app.get(
    ['/apitchenkov/dashboard', '/apitchenkov/dashboard/', '/apitchenkov/dashboard/index.html'],
    renderDashboardPage('apitchenkov', path.join(webRoot, 'apitchenkov/dashboard/index.html'))
  );

  app.get(
    ['/cinetools/login', '/cinetools/login/', '/cinetools/login/index.html'],
    renderLoginPage('cinetools', path.join(cinetoolsWebRoot, 'login/index.html'))
  );
  app.get(
    ['/cinetools/dashboard', '/cinetools/dashboard/', '/cinetools/dashboard/index.html'],
    renderDashboardPage('cinetools', path.join(cinetoolsWebRoot, 'dashboard/index.html'))
  );

  app.get('/admin', (_req, res) => res.redirect('/admin/login/'));
  app.get(
    ['/admin/login', '/admin/login/', '/admin/login/index.html'],
    renderLoginPage('admin', path.join(webRoot, 'admin/login/index.html'))
  );
  app.get(
    ['/admin/dashboard', '/admin/dashboard/', '/admin/dashboard/index.html'],
    renderDashboardPage('admin', path.join(webRoot, 'admin/dashboard/index.html'))
  );

  app.use(
    express.static(webRoot, {
      index: false,
      fallthrough: true,
      etag: true
    })
  );

  app.use((error, _req, res, _next) => {
    const status = error.status || 500;
    res.status(status).json({ error: error.message || 'Internal server error' });
  });

  const port = Number(process.env.PORT || 4000);
  app.listen(port, () => {
    console.log(`Estimate backend listening on :${port}`);
  });
}

bootstrap().catch((error) => {
  console.error('[startup] failed to boot server:', error.message);
  process.exit(1);
});
