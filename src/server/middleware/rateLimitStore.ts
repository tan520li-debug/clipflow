import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * `{ "buckets": { "standard:203.0.113.10": [unixMs, ...], "strict:203.0.113.10": [unixMs, ...] } }`
 * Timestamps are milliseconds, oldest first. A missing or unreadable file is an empty set of buckets.
 */
interface RateLimitFile {
  buckets: Record<string, number[]>;
}

let cached: { filePath: string; buckets: Map<string, number[]> } | null = null;

function resolveRateLimitFilePath(): string {
  const override = process.env.RATE_LIMIT_FILE?.trim();
  if (override) return path.resolve(override);
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '../../..', 'data', 'rate-limit.json');
}

function emptyBuckets(): Map<string, number[]> {
  return new Map();
}

function parseBuckets(raw: string): Map<string, number[]> {
  const parsed: unknown = JSON.parse(raw);
  const buckets = emptyBuckets();
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return buckets;
  const record = (parsed as { buckets?: unknown }).buckets;
  if (!record || typeof record !== 'object' || Array.isArray(record)) return buckets;
  for (const [key, value] of Object.entries(record)) {
    if (!Array.isArray(value)) continue;
    const timestamps = value.filter(
      (ts): ts is number => typeof ts === 'number' && Number.isFinite(ts)
    );
    if (timestamps.length === 0) continue;
    timestamps.sort((a, b) => a - b);
    buckets.set(key, timestamps);
  }
  return buckets;
}

function readBuckets(filePath: string): Map<string, number[]> {
  try {
    return parseBuckets(readFileSync(filePath, 'utf8'));
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    return emptyBuckets();
  }
}

function serializeBuckets(buckets: Map<string, number[]>): string {
  const snapshot: Record<string, number[]> = {};
  for (const [key, timestamps] of buckets) {
    if (timestamps.length === 0) continue;
    snapshot[key] = timestamps;
  }
  const body: RateLimitFile = { buckets: snapshot };
  return JSON.stringify(body);
}

async function commitTempFile(tmp: string, target: string): Promise<void> {
  const retryable = new Set(['EEXIST', 'EPERM', 'EBUSY']);
  let lastError: unknown = new Error('Failed to replace the rate limit file.');
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      await fs.rename(tmp, target);
      return;
    } catch (error) {
      lastError = error;
      const code = (error as NodeJS.ErrnoException).code;
      if (!code || !retryable.has(code)) throw error;
      await fs.rm(target, { force: true });
    }
  }
  throw lastError;
}

let writeChain: Promise<void> = Promise.resolve();

async function writeSnapshot(filePath: string, body: string): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(filePath)}.${process.pid}.${crypto.randomUUID()}.tmp`);
  try {
    await fs.writeFile(tmp, body, 'utf8');
    await commitTempFile(tmp, filePath);
  } catch (error) {
    await fs.rm(tmp, { force: true });
    throw error;
  }
}

/** Clears the in-memory snapshot so the next request reads the file again. Does not delete the file. */
export function resetRateLimitForTests(): void {
  cached = null;
}

export function loadRateLimitBuckets(): Map<string, number[]> {
  const filePath = resolveRateLimitFilePath();
  if (cached?.filePath === filePath) return cached.buckets;
  const buckets = readBuckets(filePath);
  cached = { filePath, buckets };
  return buckets;
}

export function persistRateLimitBuckets(buckets: Map<string, number[]>): void {
  const filePath = resolveRateLimitFilePath();
  const body = serializeBuckets(buckets);
  cached = { filePath, buckets };
  writeChain = writeChain.then(() => writeSnapshot(filePath, body)).catch((error: unknown) => {
    console.error('[rate-limit] persist failed:', error instanceof Error ? error.message : error);
  });
}

/** Resolves after the scheduled disk writes, so a restarted process sees the latest counts. */
export function flushRateLimitWrites(): Promise<void> {
  return writeChain;
}
