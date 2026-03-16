import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import session from 'express-session';
import path from 'path';
import { fileURLToPath } from 'url';
import projectsRoutes from './routes/projectsRoutes.js';
import estimatesRoutes from './routes/estimatesRoutes.js';
import itemsRoutes from './routes/itemsRoutes.js';
import authRoutes from './routes/authRoutes.js';
import cinetoolsRoutes from './routes/cinetoolsRoutes.js';
import { requireProjectAuth } from './middleware/requireProjectAuth.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webRoot = path.resolve(__dirname, '..');

const app = express();
const isProduction = process.env.NODE_ENV === 'production';

app.use(cors());
app.use(express.json());
app.set('trust proxy', 1);
app.use(
  session({
    name: 'portal.sid',
    secret: process.env.SESSION_SECRET || 'change-me-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProduction,
      maxAge: Number(process.env.SESSION_TTL_MS || 1000 * 60 * 60 * 12)
    }
  })
);

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);

app.use('/api/cinetools', requireProjectAuth('cinetools'), cinetoolsRoutes);

app.use('/api/items', requireProjectAuth('apitchenkov'), itemsRoutes);
app.use('/api/projects', requireProjectAuth('apitchenkov'), projectsRoutes);
app.use('/api', requireProjectAuth('apitchenkov'), estimatesRoutes);

app.use(express.static(webRoot));
app.get('/', (_req, res) => res.sendFile(path.join(webRoot, 'index.html')));
app.get('/apitchenkov/login', (_req, res) => res.redirect('/apitchenkov/login/'));
app.get('/apitchenkov/login/', (_req, res) => res.sendFile(path.join(webRoot, 'apitchenkov/login/index.html')));
app.get('/apitchenkov/dashboard', (_req, res) => res.redirect('/apitchenkov/dashboard/'));
app.get('/apitchenkov/dashboard/', (_req, res) => res.sendFile(path.join(webRoot, 'apitchenkov/dashboard/index.html')));
app.get('/cinetools/login', (_req, res) => res.redirect('/cinetools/login/'));
app.get('/cinetools/login/', (_req, res) => res.sendFile(path.join(webRoot, 'cinetools/login/index.html')));
app.get('/cinetools/dashboard', (_req, res) => res.redirect('/cinetools/dashboard/'));
app.get('/cinetools/dashboard/', (_req, res) => res.sendFile(path.join(webRoot, 'cinetools/dashboard/index.html')));

app.use((error, _req, res, _next) => {
  const status = error.status || 500;
  res.status(status).json({ error: error.message || 'Internal server error' });
});

const port = Number(process.env.PORT || 4000);
app.listen(port, () => {
  console.log(`Estimate backend listening on :${port}`);
});
