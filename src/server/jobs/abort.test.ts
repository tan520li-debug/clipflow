import { afterEach, describe, expect, it } from 'vitest';
import {
  delay,
  isJobAborted,
  JOB_DEADLINE,
  jobAbortSignal,
  mergeAbortSignal,
  runWithJobAbort,
} from './abort.ts';

describe('mergeAbortSignal', () => {
  it('aborts when the job signal aborts before the timeout', async () => {
    const job = new AbortController();
    const merged = mergeAbortSignal(5_000, job.signal);
    expect(merged.aborted).toBe(false);
    job.abort();
    expect(merged.aborted).toBe(true);
  });

  it('aborts when the timeout fires', async () => {
    const merged = mergeAbortSignal(20);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(merged.aborted).toBe(true);
  });
});

describe('runWithJobAbort', () => {
  afterEach(async () => {
    expect(jobAbortSignal()).toBeUndefined();
  });

  it('exposes the job signal to nested helpers', async () => {
    const job = new AbortController();
    await runWithJobAbort(job.signal, async () => {
      expect(jobAbortSignal()).toBe(job.signal);
      expect(isJobAborted()).toBe(false);
    });
  });

  it('stops delay when the job signal aborts', async () => {
    const job = new AbortController();
    const started = Date.now();
    const pending = runWithJobAbort(job.signal, () => delay(5_000));
    await Promise.resolve();
    job.abort();
    await expect(pending).rejects.toThrow(JOB_DEADLINE);
    expect(Date.now() - started).toBeLessThan(1_000);
  });
});
