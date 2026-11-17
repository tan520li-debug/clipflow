import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { studioTmpDir, sweepStaleScratch } from './workDir';

const previous = process.env.CLIPFLOW_TMP_DIR;

afterEach(() => {
  if (previous === undefined) delete process.env.CLIPFLOW_TMP_DIR;
  else process.env.CLIPFLOW_TMP_DIR = previous;
});

describe('studioTmpDir', () => {
  it('keeps transcode scratch under data/tmp', () => {
    delete process.env.CLIPFLOW_TMP_DIR;
    const dir = studioTmpDir();
    expect(path.isAbsolute(dir)).toBe(true);
    expect(dir.endsWith(path.join('data', 'tmp'))).toBe(true);
    expect(dir.toLowerCase().startsWith(os.tmpdir().toLowerCase())).toBe(false);
  });

  it('uses an absolute override and ignores a relative one', () => {
    const override = path.resolve(path.parse(process.cwd()).root, 'clipflow-tmp-override');
    process.env.CLIPFLOW_TMP_DIR = override;
    expect(studioTmpDir()).toBe(override);

    process.env.CLIPFLOW_TMP_DIR = 'relative-tmp';
    expect(studioTmpDir().endsWith(path.join('data', 'tmp'))).toBe(true);
  });

  it('deletes scratch files older than a day', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'clipflow-scratch-'));
    process.env.CLIPFLOW_TMP_DIR = dir;
    const stale = path.join(dir, 'clipflow-in-stale.webm');
    const fresh = path.join(dir, 'clipflow-out-fresh.mp4');
    const note = path.join(dir, 'keep.txt');
    await fs.writeFile(stale, 'old');
    await fs.writeFile(fresh, 'new');
    await fs.writeFile(note, 'note');
    const yesterday = new Date(Date.now() - 25 * 60 * 60 * 1000);
    await fs.utimes(stale, yesterday, yesterday);

    expect(await sweepStaleScratch()).toBe(1);
    await expect(fs.access(stale)).rejects.toThrow();
    await fs.access(fresh);
    await fs.access(note);
    await fs.rm(dir, { recursive: true, force: true });
  });
});
