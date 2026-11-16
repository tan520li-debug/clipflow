import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  completeJob,
  createJob,
  failJob,
  markRunning,
  readJob,
  recoverInterruptedJobs,
} from './store.ts';

let previousJobsDir: string | undefined;
let dir = '';

beforeEach(async () => {
  previousJobsDir = process.env.JOBS_DIR;
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'clipflow-jobs-'));
  process.env.JOBS_DIR = dir;
});

afterEach(async () => {
  if (previousJobsDir === undefined) delete process.env.JOBS_DIR;
  else process.env.JOBS_DIR = previousJobsDir;
  await fs.rm(dir, { recursive: true, force: true });
});

describe('job store', () => {
  it('creates a queued job on disk', async () => {
    const { id } = await createJob('render');
    const job = await readJob(id);
    expect(job).toMatchObject({
      id,
      kind: 'render',
      status: 'queued',
    });
    expect(job?.createdAt).toEqual(expect.any(String));
    expect(job?.updatedAt).toEqual(expect.any(String));

    const onDisk = JSON.parse(await fs.readFile(path.join(dir, `${id}.json`), 'utf8')) as {
      status: string;
    };
    expect(onDisk.status).toBe('queued');
    expect(await readJob(crypto.randomUUID())).toBeNull();
    expect(await readJob('../outside')).toBeNull();
  });

  it('completes a job with a json body', async () => {
    const { id } = await createJob('edit');
    await completeJob(id, {
      httpStatus: 200,
      resultKind: 'json',
      jsonBody: { ok: true, title: '成片' },
      contentType: 'application/json',
    });

    const job = await readJob(id);
    expect(job).toMatchObject({
      status: 'succeeded',
      httpStatus: 200,
      resultKind: 'json',
      jsonBody: { ok: true, title: '成片' },
      contentType: 'application/json',
    });
    expect(job?.error).toBeUndefined();
    await expect(fs.access(path.join(dir, `${id}.bin`))).rejects.toThrow();
  });

  it('records a failure', async () => {
    const { id } = await createJob('voice');
    await failJob(id, 422, '参数错误');
    const job = await readJob(id);
    expect(job).toMatchObject({
      status: 'failed',
      httpStatus: 422,
      error: '参数错误',
    });
  });

  it('recoverInterruptedJobs flips running and queued jobs to failed', async () => {
    const running = await createJob('export');
    const queued = await createJob('export');
    const done = await createJob('export');
    await markRunning(running.id);
    await completeJob(done.id, {
      httpStatus: 201,
      resultKind: 'json',
      jsonBody: { kept: true },
    });

    expect((await readJob(running.id))?.status).toBe('running');
    await recoverInterruptedJobs();

    const interrupted = await readJob(running.id);
    expect(interrupted).toMatchObject({
      status: 'failed',
      httpStatus: 500,
      error: '服务重启，任务已中断。',
    });
    expect(await readJob(queued.id)).toMatchObject({
      status: 'failed',
      httpStatus: 500,
      error: '服务重启，任务已中断。',
    });
    expect(await readJob(done.id)).toMatchObject({
      status: 'succeeded',
      jsonBody: { kept: true },
    });
  });

  it('fails leftover running jobs on first use', async () => {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await fs.writeFile(
      path.join(dir, `${id}.json`),
      JSON.stringify({
        id,
        kind: 'render',
        status: 'running',
        createdAt: now,
        updatedAt: now,
      }),
      'utf8'
    );

    const job = await readJob(id);
    expect(job).toMatchObject({
      status: 'failed',
      httpStatus: 500,
      error: '服务重启，任务已中断。',
    });
  });
});
