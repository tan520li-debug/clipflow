import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type express from 'express';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MISSING_ADMIN_TOKEN_MESSAGE } from '../../contracts/http';
import { apiAuthMiddleware } from './auth';
import { apiRateLimitMiddleware, flushRateLimitWrites, resetRateLimitForTests } from './rateLimit';

function createResponse() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
    setHeader(name: string, value: string) {
      this.headers[name] = value;
    },
  };
}

describe('apiAuthMiddleware', () => {
  beforeEach(() => {
    process.env.ADMIN_ACCESS_TOKEN = 'clipflow-test-token';
  });

  it('rejects a request without a token', () => {
    let continued = false;
    const res = createResponse();
    apiAuthMiddleware(
      { path: '/auto-edit', headers: {}, ip: '203.0.113.10', socket: {} } as express.Request,
      res as unknown as express.Response,
      () => {
        continued = true;
      }
    );
    expect(continued).toBe(false);
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: MISSING_ADMIN_TOKEN_MESSAGE });
  });

  it('accepts the configured token', () => {
    let continued = false;
    const res = createResponse();
    apiAuthMiddleware(
      {
        path: '/auto-edit',
        headers: { 'x-clipflow-token': 'clipflow-test-token' },
        ip: '203.0.113.11',
        socket: {},
      } as express.Request,
      res as unknown as express.Response,
      () => {
        continued = true;
      }
    );
    expect(continued).toBe(true);
  });
});

describe('apiRateLimitMiddleware', () => {
  let previousRateLimitFile: string | undefined;
  let dir = '';

  beforeEach(() => {
    previousRateLimitFile = process.env.RATE_LIMIT_FILE;
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clipflow-rate-limit-'));
    process.env.RATE_LIMIT_FILE = path.join(dir, 'rate-limit.json');
    resetRateLimitForTests();
  });

  afterEach(() => {
    resetRateLimitForTests();
    if (previousRateLimitFile === undefined) delete process.env.RATE_LIMIT_FILE;
    else process.env.RATE_LIMIT_FILE = previousRateLimitFile;
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  });

  it('returns 429 after the standard per-minute budget', () => {
    const req = {
      path: '/auto-edit',
      headers: {},
      ip: '203.0.113.50',
      socket: {},
    } as express.Request;
    let blocked = false;
    for (let i = 0; i < 21; i += 1) {
      const res = createResponse();
      let continued = false;
      apiRateLimitMiddleware(req, res as unknown as express.Response, () => {
        continued = true;
      });
      if (i < 20) expect(continued).toBe(true);
      else {
        blocked = res.statusCode === 429;
        expect(continued).toBe(false);
      }
    }
    expect(blocked).toBe(true);
  });

  it('returns 429 on the next request after the cache is cleared', async () => {
    const req = {
      path: '/auto-edit',
      headers: {},
      ip: '203.0.113.60',
      socket: {},
    } as express.Request;
    for (let i = 0; i < 20; i += 1) {
      const res = createResponse();
      let continued = false;
      apiRateLimitMiddleware(req, res as unknown as express.Response, () => {
        continued = true;
      });
      expect(continued).toBe(true);
    }

    await flushRateLimitWrites();
    resetRateLimitForTests();

    const res = createResponse();
    let continued = false;
    apiRateLimitMiddleware(req, res as unknown as express.Response, () => {
      continued = true;
    });
    expect(continued).toBe(false);
    expect(res.statusCode).toBe(429);
  });

  it('limits talking-video requests to three per minute', () => {
    const req = {
      path: '/digital-human/talking-video',
      headers: {},
      ip: '203.0.113.70',
      socket: {},
    } as express.Request;
    let blocked = false;
    for (let i = 0; i < 4; i += 1) {
      const res = createResponse();
      let continued = false;
      apiRateLimitMiddleware(req, res as unknown as express.Response, () => {
        continued = true;
      });
      if (i < 3) expect(continued).toBe(true);
      else blocked = res.statusCode === 429 && continued === false;
    }
    expect(blocked).toBe(true);
  });
});
