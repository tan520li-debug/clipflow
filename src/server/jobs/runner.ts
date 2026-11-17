import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { JOB_DEADLINE_MS } from '../../contracts/http.ts';
import { JOB_DEADLINE, runWithJobAbort } from './abort.ts';
import {
  binaryPathFor,
  completeJob,
  createJob,
  failJob,
  markRunning,
} from './store.ts';

export { JOB_DEADLINE } from './abort.ts';

export interface JobHttpResult {
  httpStatus: number;
  resultKind: 'json' | 'binary';
  jsonBody?: unknown;
  binary?: Buffer;
  binaryPath?: string;
  contentType?: string;
  filename?: string;
}

export type JobWork = (signal: AbortSignal) => Promise<JobHttpResult>;

const queue: Array<() => Promise<void>> = [];
let busy = false;
const reservedIds = new Set<string>();

function jobDeadlineMs(): number {
  const raw = Number(process.env.CLIPFLOW_JOB_DEADLINE_MS);
  if (Number.isFinite(raw) && raw >= 1) return raw;
  return JOB_DEADLINE_MS;
}

function deadlineError(): Error {
  return new Error(JOB_DEADLINE);
}

function withDeadline<T>(work: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const controller = new AbortController();
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => controller.abort(), ms);

    const finish = (next: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      next();
    };

    const onAbort = () => finish(() => reject(deadlineError()));
    controller.signal.addEventListener('abort', onAbort, { once: true });

    work(controller.signal).then(
      (value) => finish(() => resolve(value)),
      (error: unknown) => {
        finish(() => {
          if (controller.signal.aborted) reject(deadlineError());
          else reject(error);
        });
      },
    );
  });
}

function pump(): void {
  if (busy) return;
  const task = queue.shift();
  if (!task) return;
  busy = true;
  void task()
    .catch(() => undefined)
    .finally(() => {
      busy = false;
      pump();
    });
}

async function execute(id: string, work: JobWork): Promise<void> {
  await markRunning(id);
  try {
    const result = await withDeadline(
      (signal) => runWithJobAbort(signal, () => work(signal)),
      jobDeadlineMs(),
    );
    if (result.resultKind === 'binary') {
      const target = binaryPathFor(id);
      if (result.binaryPath) {
        if (path.resolve(result.binaryPath) !== path.resolve(target)) {
          await fs.mkdir(path.dirname(target), { recursive: true });
          await fs.rename(result.binaryPath, target);
        }
      } else {
        await fs.writeFile(target, result.binary ?? Buffer.alloc(0));
      }
      await completeJob(id, {
        httpStatus: result.httpStatus,
        resultKind: 'binary',
        contentType: result.contentType,
        filename: result.filename,
      });
      return;
    }
    await completeJob(id, {
      httpStatus: result.httpStatus,
      resultKind: 'json',
      jsonBody: result.jsonBody,
      contentType: result.contentType,
      filename: result.filename,
    });
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err);
    if (detail === JOB_DEADLINE) {
      console.error(`[job ${id}] deadline`);
      await failJob(id, 504, '任务超时，已停止等待。').catch(() => undefined);
      return;
    }
    console.error(`[job ${id}]`, detail);
    await failJob(id, 500, '任务执行失败，请稍后重试。').catch(() => undefined);
  }
}

export function startJob(id: string, work: JobWork): void {
  reservedIds.delete(id);
  queue.push(() => execute(id, work));
  pump();
}

const DEFAULT_JOB_QUEUE_MAX = 8;

export const QUEUE_FULL_MESSAGE = '正在处理的任务太多，请等当前任务结束后再试。';

export function jobQueueLimit(): number {
  const raw = Number(process.env.CLIPFLOW_JOB_QUEUE_MAX);
  if (Number.isFinite(raw) && raw >= 1) return Math.floor(raw);
  return DEFAULT_JOB_QUEUE_MAX;
}

export function jobQueueFull(): boolean {
  return queue.length + (busy ? 1 : 0) + reservedIds.size >= jobQueueLimit();
}

export async function admitJob(kind: string): Promise<{ id: string } | { full: true }> {
  if (jobQueueFull()) return { full: true };
  const id = crypto.randomUUID();
  reservedIds.add(id);
  try {
    return await createJob(kind, id);
  } catch (err) {
    reservedIds.delete(id);
    throw err;
  }
}

export async function enqueueWork(
  kind: string,
  work: JobWork,
): Promise<{ id: string } | { full: true }> {
  const admitted = await admitJob(kind);
  if ('full' in admitted) return admitted;
  startJob(admitted.id, work);
  return admitted;
}
