import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  binaryPathFor,
  completeJob,
  createJob,
  failJob,
  markRunning,
} from './store.ts';

export interface JobHttpResult {
  httpStatus: number;
  resultKind: 'json' | 'binary';
  jsonBody?: unknown;
  binary?: Buffer;
  binaryPath?: string;
  contentType?: string;
  filename?: string;
}

const queue: Array<() => Promise<void>> = [];
let busy = false;

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

async function execute(id: string, work: () => Promise<JobHttpResult>): Promise<void> {
  await markRunning(id);
  try {
    const result = await work();
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
  } catch {
    await failJob(id, 500, '任务执行失败，请稍后重试。').catch(() => undefined);
  }
}

export function startJob(id: string, work: () => Promise<JobHttpResult>): void {
  queue.push(() => execute(id, work));
  pump();
}

export function enqueueWork(kind: string, work: () => Promise<JobHttpResult>): string {
  const id = crypto.randomUUID();
  void createJob(kind, id).then(
    () => {
      startJob(id, work);
    },
    () => undefined
  );
  return id;
}
