import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Request, Response } from 'express';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { JOB_DEADLINE_MS, JOB_QUEUE_MAX } from '../../contracts/http.ts';
import { jobAbortSignal } from './abort.ts';
import { acceptJsonJob } from './http.ts';
import { readJob } from './store.ts';

let previousJobsDir: string | undefined;
let previousDeadline: string | undefined;
let previousQueueMax: string | undefined;
let dir = '';

beforeEach(async () => {
  previousJobsDir = process.env.JOBS_DIR;
  previousDeadline = process.env.CLIPFLOW_JOB_DEADLINE_MS;
  previousQueueMax = process.env.CLIPFLOW_JOB_QUEUE_MAX;
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'clipflow-http-jobs-'));
  process.env.JOBS_DIR = dir;
});

afterEach(async () => {
  if (previousJobsDir === undefined) delete process.env.JOBS_DIR;
  else process.env.JOBS_DIR = previousJobsDir;
  if (previousDeadline === undefined) delete process.env.CLIPFLOW_JOB_DEADLINE_MS;
  else process.env.CLIPFLOW_JOB_DEADLINE_MS = previousDeadline;
  if (previousQueueMax === undefined) delete process.env.CLIPFLOW_JOB_QUEUE_MAX;
  else process.env.CLIPFLOW_JOB_QUEUE_MAX = previousQueueMax;
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
    expect(state.body).toMatchObject({
      status: 'queued',
      deadlineMs: JOB_DEADLINE_MS,
      queueMax: JOB_QUEUE_MAX,
    });
    const jobId = (state.body as { jobId?: unknown }).jobId;
    expect(typeof jobId).toBe('string');
    await waitForTerminal(String(jobId));
  });

  it('reports the live deadline and queue cap on the accepted job', async () => {
    process.env.CLIPFLOW_JOB_DEADLINE_MS = '1200';
    process.env.CLIPFLOW_JOB_QUEUE_MAX = '3';
    const handler = acceptJsonJob('demo', async (_req, res) => {
      res.json({ ok: true });
    });

    const state = await invoke(handler, {});
    expect(state.statusCode).toBe(202);
    expect(state.body).toMatchObject({ status: 'queued', deadlineMs: 1200, queueMax: 3 });
    const jobId = (state.body as { jobId?: unknown }).jobId;
    expect(typeof jobId).toBe('string');
    await waitForTerminal(String(jobId));
  });

  it('aborts handler work when the job deadline is reached', async () => {
    process.env.CLIPFLOW_JOB_DEADLINE_MS = '40';
    let aborted = false;
    const handler = acceptJsonJob('demo', async (_req, res) => {
      const signal = jobAbortSignal();
      if (!signal) throw new Error('missing job signal');
      await new Promise((_, reject) => {
        signal.addEventListener(
          'abort',
          () => {
            aborted = true;
            reject(new Error('JOB_DEADLINE'));
          },
          { once: true },
        );
      });
      res.json({ ok: true });
    });

    const state = await invoke(handler, {});
    expect(state.statusCode).toBe(202);
    const jobId = (state.body as { jobId?: unknown }).jobId;
    expect(typeof jobId).toBe('string');
    await waitForTerminal(String(jobId));
    expect(aborted).toBe(true);
    expect(await readJob(String(jobId))).toMatchObject({
      status: 'failed',
      httpStatus: 504,
      error: '任务超时，已停止等待。',
    });
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
