import type express from 'express';
import { loadRateLimitBuckets, persistRateLimitBuckets } from './rateLimitStore.ts';

export { flushRateLimitWrites, resetRateLimitForTests } from './rateLimitStore.ts';

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const STANDARD_RATE_LIMIT_PER_MIN = 20;
const STRICT_RATE_LIMIT_PER_MIN = 3;

const STRICT_RATE_LIMIT_PATHS = new Set([
  '/generate-voiceover',
  '/voice-clone/train',
  '/voice-clone/preview',
  '/digital-human/clone',
  '/digital-human/drive',
  '/digital-human/multilingual-dub',
  '/digital-human/reply',
  '/digital-human/talking-video',
]);

function getNormalizedClientIp(req: express.Request): string {
  const raw = req.ip || req.socket.remoteAddress || 'unknown';
  return raw.startsWith('::ffff:') ? raw.slice(7) : raw;
}

export function apiRateLimitMiddleware(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  if (req.path === '/health' || req.path === '/health/') {
    return next();
  }

  const normalizedPath = req.path.replace(/\/+$/, '') || '/';
  if (
    normalizedPath === '/jobs' ||
    normalizedPath.startsWith('/jobs/') ||
    normalizedPath === '/media' ||
    normalizedPath.startsWith('/media/')
  ) {
    return next();
  }
  const isStrictTier = STRICT_RATE_LIMIT_PATHS.has(normalizedPath);
  const limit = isStrictTier ? STRICT_RATE_LIMIT_PER_MIN : STANDARD_RATE_LIMIT_PER_MIN;
  const tierKey = isStrictTier ? 'strict' : 'standard';
  const clientIp = getNormalizedClientIp(req);
  const bucketKey = `${tierKey}:${clientIp}`;

  const buckets = loadRateLimitBuckets();
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  const existing = buckets.get(bucketKey) || [];
  const recent = existing.filter((ts) => ts > cutoff);

  if (recent.length >= limit) {
    const oldestTs = recent[0] ?? now;
    const retryAfterSec = Math.max(1, Math.ceil((oldestTs + RATE_LIMIT_WINDOW_MS - now) / 1000));
    res.setHeader('Retry-After', String(retryAfterSec));
    res.setHeader('X-RateLimit-Limit', String(limit));
    res.setHeader('X-RateLimit-Remaining', '0');
    res.setHeader('X-RateLimit-Reset', String(Math.ceil((oldestTs + RATE_LIMIT_WINDOW_MS) / 1000)));
    buckets.set(bucketKey, recent);
    persistRateLimitBuckets(buckets);
    return res.status(429).json({
      error: isStrictTier
        ? '语音合成与数字人克隆/驱动接口调用过于频繁（每分钟最多 3 次），请稍后再试。'
        : '接口请求过于频繁（普通接口每分钟最多 20 次），请稍后再试。',
    });
  }

  recent.push(now);
  buckets.set(bucketKey, recent);

  if (buckets.size > 2000) {
    for (const [key, timestamps] of buckets.entries()) {
      const active = timestamps.filter((ts) => ts > cutoff);
      if (active.length === 0) {
        buckets.delete(key);
      } else {
        buckets.set(key, active);
      }
    }
  }

  persistRateLimitBuckets(buckets);

  res.setHeader('X-RateLimit-Limit', String(limit));
  res.setHeader('X-RateLimit-Remaining', String(Math.max(0, limit - recent.length)));
  return next();
}
