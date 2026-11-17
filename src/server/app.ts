import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { apiAuthMiddleware } from './middleware/auth.ts';
import { apiRateLimitMiddleware } from './middleware/rateLimit.ts';
import { expandMediaRefs } from './media/blobs.ts';
import { registerDigitalHumanRoutes } from './routes/digitalHuman.ts';
import { registerEditRoutes } from './routes/edit.ts';
import { registerExportRoutes } from './routes/export.ts';
import { registerTalkingVideoRoute } from './routes/talkingVideo.ts';
import { registerJobRoutes } from './routes/jobs.ts';
import { registerMediaRoutes } from './routes/media.ts';
import { registerVoiceRoutes } from './routes/voice.ts';
import { resolveListenPort } from './listenPort.ts';
import { sweepStaleScratch } from './media/workDir.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = resolveListenPort(process.env.PORT);

app.set('trust proxy', 1);
app.use(express.json({ limit: '16mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

app.use('/api', apiAuthMiddleware, apiRateLimitMiddleware);

app.use('/api', async (req, res, next) => {
  if (!req.body || typeof req.body !== 'object') {
    next();
    return;
  }
  try {
    req.body = await expandMediaRefs(req.body);
    next();
  } catch (err: unknown) {
    const status =
      err !== null && typeof err === 'object' && 'status' in err
        ? Number((err as { status?: unknown }).status)
        : 500;
    if (status === 400) {
      const message = err instanceof Error ? err.message : '素材引用无效或已失效。';
      res.status(400).json({ error: message });
      return;
    }
    next(err);
  }
});

registerMediaRoutes(app);
registerEditRoutes(app);
registerVoiceRoutes(app);
registerDigitalHumanRoutes(app);
registerTalkingVideoRoute(app);
registerExportRoutes(app);
registerJobRoutes(app);

// Unknown /api/* JSON 404 handler (protected by auth & rate-limiter above)
app.use('/api', (_req, res) => {
  return res.status(404).json({ error: '请求的接口路径不存在。' });
});

// Global Express error handler — never expose internal error.message or stack traces on 500
app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error('[express] unhandled error:', err);
    if (
      err instanceof SyntaxError &&
      'status' in err &&
      (err as { status?: number }).status === 400
    ) {
      return res.status(400).json({ error: '请求体 JSON 格式无效，请检查后重试。' });
    }
    return res.status(500).json({ error: '服务端内部处理异常，请稍后重试。' });
  }
);

export async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      root: path.resolve(__dirname, '../..'),
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, '../../dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ClipFlow Studio server running on http://0.0.0.0:${PORT}`);
  });
  void sweepStaleScratch().catch((error: unknown) => {
    console.error('[tmp] sweep failed:', error instanceof Error ? error.message : error);
  });
}

