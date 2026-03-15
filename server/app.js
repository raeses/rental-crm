import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/authRoutes.js';
import { createBusinessApiRouter } from './routes/businessApiRoutes.js';

dotenv.config();

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientRoot = path.resolve(__dirname, '..');

app.set('trust proxy', 1);

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.static(clientRoot));

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/apitchenkov', createBusinessApiRouter('apitchenkov'));
app.use('/api', createBusinessApiRouter('apitchenkov'));

app.use((error, _req, res, _next) => {
  const status = error.status || 500;
  res.status(status).json({ error: error.message || 'Internal server error' });
});

const port = Number(process.env.PORT || 4000);
app.listen(port, () => {
  console.log(`Estimate backend listening on :${port}`);
});
