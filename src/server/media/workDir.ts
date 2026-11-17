import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Scratch files for transcode. Defaults to the repo's data/tmp, which stays off the system temp folder. */
export function studioTmpDir(): string {
  const override = process.env.CLIPFLOW_TMP_DIR?.trim();
  if (override && path.isAbsolute(override)) return path.resolve(override);
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '../../..', 'data', 'tmp');
}

export async function ensureStudioTmpDir(): Promise<string> {
  const dir = studioTmpDir();
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

const SCRATCH_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Removes transcode scratch left behind after a crash. Live files younger than a day stay. */
export async function sweepStaleScratch(now = Date.now()): Promise<number> {
  const dir = studioTmpDir();
  let names: string[];
  try {
    names = await fs.readdir(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0;
    throw error;
  }
  let removed = 0;
  for (const name of names) {
    if (!/^clipflow-(in|out)-/.test(name)) continue;
    const full = path.join(dir, name);
    const stat = await fs.stat(full).catch(() => null);
    if (!stat?.isFile() || now - stat.mtimeMs < SCRATCH_MAX_AGE_MS) continue;
    await fs.unlink(full).catch(() => undefined);
    removed += 1;
  }
  return removed;
}
