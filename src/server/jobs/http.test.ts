import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Request, Response } from 'express';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { acceptJsonJob } from './http.ts';
import { readJob } from './store.ts';

let previousJobsDir: string | undefined;
let dir = '';

beforeEach(async () => {
  previousJobsDir = process.env.JOBS_DIR;
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'clipflow-http-jobs-'));
  process.env.JOBS_DIR = dir;
});

afterEach(async () => {
  if (previousJobsDir === undefined) delete process.env.JOBS_DIR;
  else process.env.JOBS_DIR = previousJobsDir;
  await fs.rm(dir, { recursive: true, force: true });
});

function fakeRes(): { res: Response; state: { statusCode: number; body: unknown } } {
  const state = { statusCode: 200, body: undefined as unknown };
  const res = {
    status(code: number) {
      state.statusCode = code;
      return res;
    },
    json(body: unknown) {
      state.body = body;
      return res;
    },
  };
  return { res: res as unknown as Response, state };
}

async function invoke(
  handler: ReturnType<typeof acceptJsonJob>,
  body: unknown
): Promise<{ statusCode: number; body: unknown }> {
  const { res, state } = fakeRes();
  await handler({ body } as Request, res, () => undefined);
  return state;
}

async function waitForTerminal(jobId: string): Promise<void> {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const job = await readJob(jobId);
    if (job && (job.status === 'succeeded' || job.status === 'failed')) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('任务没有在测试里结束。');
}

describe('acceptJsonJob', () => {
  it('returns 400 and does not write a job when validate rejects', async () => {
    const handler = acceptJsonJob(
      'demo',
      async (_req, res) => {
        res.json({ ok: true });
      },
      (req) => {
        const topic = (req.body as { topic?: unknown } | undefined)?.topic;
        if (typeof topic !== 'string' || topic.trim() === '') {
          return { status: 400, body: { error: '缺主题' } };
        }
        return null;
      }
    );

    const state = await invoke(handler, {});
    expect(state.statusCode).toBe(400);
    expect(state.body).toEqual({ error: '缺主题' });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(await fs.readdir(dir)).toEqual([]);
  });

  it('returns 202 and a jobId when validate passes', async () => {
    const handler = acceptJsonJob(
      'demo',
      async (_req, res) => {
        res.json({ ok: true });
      },
      (req) => {
        const topic = (req.body as { topic?: unknown } | undefined)?.topic;
        if (typeof topic !== 'string' || topic.trim() === '') {
          return { status: 400, body: { error: '缺主题' } };
        }
        return null;
      }
    );

    const state = await invoke(handler, { topic: '海边' });
    expect(state.statusCode).toBe(202);
    expect(state.body).toMatchObject({ status: 'queued' });
    const jobId = (state.body as { jobId?: unknown }).jobId;
    expect(typeof jobId).toBe('string');
    await waitForTerminal(String(jobId));
  });

  it('returns 202 and a jobId without a validate callback', async () => {
    const handler = acceptJsonJob('demo', async (_req, res) => {
      res.json({ ok: true });
    });

    const state = await invoke(handler, {});
    expect(state.statusCode).toBe(202);
    const jobId = (state.body as { jobId?: unknown }).jobId;
    expect(typeof jobId).toBe('string');
    await waitForTerminal(String(jobId));
  });
});
