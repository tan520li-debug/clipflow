import crypto from 'node:crypto';
import type express from 'express';
import { ADMIN_TOKEN_HEADER, MISSING_ADMIN_TOKEN_MESSAGE } from '../../contracts/http';

function timingSafeStringEqual(a: string, b: string): boolean {
  const hashA = crypto.createHash('sha256').update(a, 'utf8').digest();
  const hashB = crypto.createHash('sha256').update(b, 'utf8').digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

export function apiAuthMiddleware(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  if (req.path === '/health' || req.path === '/health/') {
    return next();
  }

  const rawHeader = req.headers[ADMIN_TOKEN_HEADER];
  const providedToken = Array.isArray(rawHeader)
    ? String(rawHeader[0] ?? '').trim()
    : typeof rawHeader === 'string'
      ? rawHeader.trim()
      : '';

  if (!providedToken) {
    return res.status(401).json({
      error: MISSING_ADMIN_TOKEN_MESSAGE,
    });
  }

  const expectedToken = (process.env.ADMIN_ACCESS_TOKEN || '').trim();
  if (!expectedToken || !timingSafeStringEqual(providedToken, expectedToken)) {
    return res.status(401).json({
      error: '访问令牌无效或未配置，无权访问接口。',
    });
  }

  return next();
}
