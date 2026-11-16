import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const JOB_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INTERRUPTED_ERROR = '服务重启，任务已中断。';

export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed';
export type JobResultKind = 'json' | 'binary';

export interface JobRecord {
  id: string;
  kind: string;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  httpStatus?: number;
  resultKind?: JobResultKind;
  jsonBody?: unknown;
  contentType?: string;
  filename?: string;
  error?: string;
}

export interface JobCompletion {
  httpStatus: number;
  resultKind: JobResultKind;
  jsonBody?: unknown;
  contentType?: string;
  filename?: string;
}

let recoveredDir: string | null = null;
let recoveryTask: Promise<void> | null = null;

function jobsDir(): string {
  const override = process.env.JOBS_DIR?.trim();
  if (override) return path.resolve(override);
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '../../..', 'data', 'jobs');
}

function isJobId(id: string): boolean {
  return JOB_ID_PATTERN.test(id);
}

function jsonPath(id: string, dir = jobsDir()): string {
  return path.join(dir, `${id}.json`);
}

function ensureRecovered(): Promise<void> {
  const dir = jobsDir();
  if (recoveryTask && recoveredDir === dir) return recoveryTask;
  recoveredDir = dir;
  const pending = recoverInterruptedJobs().catch((error: unknown) => {
    if (recoveredDir === dir) {
      recoveredDir = null;
      recoveryTask = null;
    }
    throw error;
  });
  recoveryTask = pending;
  return pending;
}

async function replaceFile(tmp: string, target: string): Promise<void> {
  const retryDelays = [0, 20, 50, 100];
  let lastError: unknown;
  for (const delayMs of retryDelays) {
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    try {
      await fs.rename(tmp, target);
      return;
    } catch (error) {
      lastError = error;
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'EEXIST' && code !== 'EPERM' && code !== 'EBUSY') throw error;
      await fs.rm(target, { force: true });
    }
  }
  throw lastError;
}

async function writeRecord(record: JobRecord, dir = jobsDir()): Promise<void> {
  if (!isJobId(record.id)) throw new Error('Invalid job id.');
  await fs.mkdir(dir, { recursive: true });
  const target = jsonPath(record.id, dir);
  const tmp = path.join(dir, `${record.id}.${crypto.randomUUID()}.tmp`);
  await fs.writeFile(tmp, JSON.stringify(record), 'utf8');
  try {
    await replaceFile(tmp, target);
  } catch (error) {
    await fs.rm(tmp, { force: true });
    throw error;
  }
}

async function readRecord(id: string, dir = jobsDir()): Promise<JobRecord | null> {
  if (!isJobId(id)) return null;
  try {
    const raw = await fs.readFile(jsonPath(id, dir), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const record = parsed as Partial<JobRecord>;
    if (record.id !== id || typeof record.kind !== 'string') return null;
    if (
      record.status !== 'queued' &&
      record.status !== 'running' &&
      record.status !== 'succeeded' &&
      record.status !== 'failed'
    ) {
      return null;
    }
    return record as JobRecord;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'EISDIR' || error instanceof SyntaxError) return null;
    throw error;
  }
}

export async function recoverInterruptedJobs(): Promise<void> {
  const dir = jobsDir();
  let names: string[];
  try {
    names = await fs.readdir(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }

  const updatedAt = new Date().toISOString();
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    const id = name.slice(0, -'.json'.length);
    const current = await readRecord(id, dir);
    if (!current) continue;
    if (current.status !== 'running' && current.status !== 'queued') continue;
    await writeRecord(
      {
        ...current,
        status: 'failed',
        updatedAt,
        httpStatus: 500,
        error: INTERRUPTED_ERROR,
      },
      dir
    );
  }
}

export async function createJob(kind: string, reservedId?: string): Promise<{ id: string }> {
  if (typeof kind !== 'string' || kind.trim() === '') throw new Error('Invalid job kind.');
  const id = reservedId ?? crypto.randomUUID();
  if (!isJobId(id)) throw new Error('Invalid job id.');
  await ensureRecovered();
  const now = new Date().toISOString();
  await writeRecord({
    id,
    kind,
    status: 'queued',
    createdAt: now,
    updatedAt: now,
  });
  return { id };
}

export async function markRunning(id: string): Promise<void> {
  await ensureRecovered();
  const current = await readRecord(id);
  if (!current) throw new Error('任务不存在或已过期。');
  if (current.status !== 'queued') throw new Error('任务状态不可更新。');
  await writeRecord({
    ...current,
    status: 'running',
    updatedAt: new Date().toISOString(),
  });
}

export async function completeJob(id: string, result: JobCompletion): Promise<void> {
  await ensureRecovered();
  const current = await readRecord(id);
  if (!current) throw new Error('任务不存在或已过期。');
  if (result.resultKind !== 'json' && result.resultKind !== 'binary') {
    throw new Error('Invalid result kind.');
  }
  const next: JobRecord = {
    id: current.id,
    kind: current.kind,
    status: 'succeeded',
    createdAt: current.createdAt,
    updatedAt: new Date().toISOString(),
    httpStatus: result.httpStatus,
    resultKind: result.resultKind,
  };
  if (result.resultKind === 'json') next.jsonBody = result.jsonBody;
  if (result.contentType) next.contentType = result.contentType;
  if (result.filename) next.filename = result.filename;
  await writeRecord(next);
}

export async function failJob(id: string, httpStatus: number, error: string): Promise<void> {
  await ensureRecovered();
  const current = await readRecord(id);
  if (!current) throw new Error('任务不存在或已过期。');
  await writeRecord({
    ...current,
    status: 'failed',
    updatedAt: new Date().toISOString(),
    httpStatus,
    error,
  });
}

export async function readJob(id: string): Promise<JobRecord | null> {
  await ensureRecovered();
  return readRecord(id);
}

export function binaryPathFor(id: string): string {
  if (!isJobId(id)) throw new Error('Invalid job id.');
  return path.join(jobsDir(), `${id}.bin`);
}
