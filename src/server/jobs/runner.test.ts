import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { admitJob, startJob } from './runner.ts';
import { createJob, readJob } from './store.ts';

let previousJobsDir: string | undefined;
let previousDeadline: string | undefined;
let previousQueueMax: string | undefined;
let dir = '';

beforeEach(async () => {
  previousJobsDir = process.env.JOBS_DIR;
  previousDeadline = process.env.CLIPFLOW_JOB_DEADLINE_MS;
  previousQueueMax = process.env.CLIPFLOW_JOB_QUEUE_MAX;
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'clipflow-runner-'));
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

async function waitForStatus(id: string, status: string): Promise<void> {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const job = await readJob(id);
    if (job?.status === status) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`任务没有进入 ${status}`);
}

describe('startJob', () => {
  it('fails a stuck job and still runs the next one', async () => {
    process.env.CLIPFLOW_JOB_DEADLINE_MS = '30';
    const stuck = await createJob('stuck');
    startJob(stuck.id, () => new Promise(() => undefined));
    await waitForStatus(stuck.id, 'failed');
    expect(await readJob(stuck.id)).toMatchObject({
      status: 'failed',
      httpStatus: 504,
      error: '任务超时，已停止等待。',
    });

    delete process.env.CLIPFLOW_JOB_DEADLINE_MS;
    const next = await createJob('next');
    startJob(next.id, async () => ({
      httpStatus: 200,
      resultKind: 'json',
      jsonBody: { ok: true },
    }));
    await waitForStatus(next.id, 'succeeded');
    expect((await readJob(next.id))?.jsonBody).toEqual({ ok: true });
  });

  it('refuses another job when the queue is already full', async () => {
    process.env.CLIPFLOW_JOB_QUEUE_MAX = '1';
    process.env.CLIPFLOW_JOB_DEADLINE_MS = '40';
    const hold = await admitJob('hold');
    if (!('id' in hold)) throw new Error('第一个任务应该能进入队列');
    startJob(hold.id, () => new Promise(() => undefined));
    const extra = await admitJob('extra');
    expect(extra).toEqual({ full: true });
    await waitForStatus(hold.id, 'failed');
  });

  it('reserves the only slot before either admission finishes writing', async () => {
    process.env.CLIPFLOW_JOB_QUEUE_MAX = '1';
    const results = await Promise.all([admitJob('a'), admitJob('b')]);
    const accepted = results.filter((result) => 'id' in result);
    const rejected = results.filter((result) => 'full' in result);
    expect(accepted).toHaveLength(1);
    expect(rejected).toEqual([{ full: true }]);
    const id = accepted[0] && 'id' in accepted[0] ? accepted[0].id : '';
    startJob(id, async () => ({
      httpStatus: 200,
      resultKind: 'json',
      jsonBody: { ok: true },
    }));
    await waitForStatus(id, 'succeeded');
  });
});
