import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  MEDIA_REF_PREFIX,
  expandMediaRefs,
  mediaDir,
  readMediaString,
  saveMediaBytes,
} from './blobs.ts';

let previousMediaDir: string | undefined;
let dir = '';

beforeEach(async () => {
  previousMediaDir = process.env.MEDIA_DIR;
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'clipflow-media-'));
  process.env.MEDIA_DIR = dir;
});

afterEach(async () => {
  if (previousMediaDir === undefined) delete process.env.MEDIA_DIR;
  else process.env.MEDIA_DIR = previousMediaDir;
  await fs.rm(dir, { recursive: true, force: true });
});

describe('media blobs', () => {
  it('points MEDIA_DIR at an absolute directory and otherwise uses data/media', () => {
    expect(mediaDir()).toBe(path.resolve(dir));
    delete process.env.MEDIA_DIR;
    const here = path.dirname(fileURLToPath(import.meta.url));
    expect(mediaDir()).toBe(path.resolve(here, '../../..', 'data', 'media'));
    expect(mediaDir()).toBe(path.resolve(process.cwd(), 'data', 'media'));
    process.env.MEDIA_DIR = 'relative/media';
    expect(mediaDir()).toBe(path.resolve(process.cwd(), 'data', 'media'));
  });

  it('restores a data-url from the saved bytes', async () => {
    const bytes = Buffer.from([0xff, 0xfe, 0x00, 0x61, 0x2b]);
    const id = await saveMediaBytes(bytes, { mime: 'image/png', wrapper: 'data-url' });

    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(await fs.readFile(path.join(dir, `${id}.bin`))).toEqual(bytes);
    expect(JSON.parse(await fs.readFile(path.join(dir, `${id}.json`), 'utf8'))).toEqual({
      mime: 'image/png',
      wrapper: 'data-url',
    });
    await expect(readMediaString(id)).resolves.toBe(
      `data:image/png;base64,${bytes.toString('base64')}`
    );
  });

  it('expands clipflow-media refs nested in objects', async () => {
    const bytes = Buffer.from('nested-media');
    const id = await saveMediaBytes(bytes, {
      mime: 'application/octet-stream',
      wrapper: 'base64',
    });
    const original = bytes.toString('base64');
    const input = {
      ok: true,
      title: 'keep',
      clip: {
        src: `${MEDIA_REF_PREFIX}${id}`,
        extras: [1, `${MEDIA_REF_PREFIX}${id}`, null, 'plain'],
      },
    };

    await expect(expandMediaRefs(input)).resolves.toEqual({
      ok: true,
      title: 'keep',
      clip: {
        src: original,
        extras: [1, original, null, 'plain'],
      },
    });
    expect(input.clip.src).toBe(`${MEDIA_REF_PREFIX}${id}`);
  });

  it('throws status 400 when a media ref id is bad or missing', async () => {
    expect(await readMediaString('not-a-uuid')).toBeNull();
    expect(await readMediaString('../outside')).toBeNull();

    await expect(expandMediaRefs(`${MEDIA_REF_PREFIX}not-a-uuid`)).rejects.toMatchObject({
      status: 400,
      message: '素材引用无效或已失效。',
    });

    const missing = `${MEDIA_REF_PREFIX}${crypto.randomUUID()}`;
    await expect(expandMediaRefs({ clip: { src: missing } })).rejects.toMatchObject({
      status: 400,
      message: '素材引用无效或已失效。',
    });
  });
});
