import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { obfuscationRouter } from './endpoints/obfuscationEndpoints.js';

const app  = express();
const PORT = Number(process.env.PORT ?? 3030);
const HOST = process.env.HOST ?? '127.0.0.1';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Middleware ─────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// ── Static files ───────────────────────────────────────────────────────────
app.use(express.static(join(__dirname, '..', 'public')));

// ── API routes ─────────────────────────────────────────────────────────────
app.use('/api', obfuscationRouter);

// ── SPA fallback ───────────────────────────────────────────────────────────
app.get('*', (_req, res) => {
  res.sendFile(join(__dirname, '..', 'public', 'index.html'));
});

// ── Error handler ──────────────────────────────────────────────────────────
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, HOST, () => {
  console.log(`🔒 PL/SQL Obfuscator → http://${HOST}:${PORT}`);
});
