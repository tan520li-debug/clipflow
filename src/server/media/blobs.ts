import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const MEDIA_REF_PREFIX = 'clipflow-media:';

const MEDIA_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INVALID_MEDIA_REF = '素材引用无效或已失效。';

export type MediaWrapper = 'data-url' | 'base64';

interface MediaMeta {
  mime: string;
  wrapper: MediaWrapper;
}

export function mediaDir(): string {
  const override = process.env.MEDIA_DIR?.trim();
  if (override && path.isAbsolute(override)) return path.resolve(override);
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '../../..', 'data', 'media');
}

function isMediaId(id: string): boolean {
  return MEDIA_ID_PATTERN.test(id);
}

function binPath(id: string, dir = mediaDir()): string {
  return path.join(dir, `${id}.bin`);
}

function jsonPath(id: string, dir = mediaDir()): string {
  return path.join(dir, `${id}.json`);
}

function invalidMediaRef(): Error & { status: number } {
  return Object.assign(new Error(INVALID_MEDIA_REF), { status: 400 });
}

function isWrapper(value: unknown): value is MediaWrapper {
  return value === 'data-url' || value === 'base64';
}

async function writeMeta(id: string, meta: MediaMeta, dir: string): Promise<void> {
  const body = JSON.stringify({ mime: meta.mime, wrapper: meta.wrapper });
  await fs.writeFile(jsonPath(id, dir), body, 'utf8');
}

export async function saveMediaBytes(
  bytes: Buffer,
  meta: { mime: string; wrapper: 'data-url' | 'base64' }
): Promise<string> {
  const dir = mediaDir();
  await fs.mkdir(dir, { recursive: true });
  const id = crypto.randomUUID();
  await fs.writeFile(binPath(id, dir), bytes);
  await writeMeta(id, meta, dir);
  return id;
}

async function readMeta(id: string, dir: string): Promise<MediaMeta | null> {
  try {
    const raw = await fs.readFile(jsonPath(id, dir), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const meta = parsed as { mime?: unknown; wrapper?: unknown };
    if (typeof meta.mime !== 'string' || !isWrapper(meta.wrapper)) return null;
    return { mime: meta.mime, wrapper: meta.wrapper };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'EISDIR' || error instanceof SyntaxError) return null;
    throw error;
  }
}

export async function readMediaString(id: string): Promise<string | null> {
  if (!isMediaId(id)) return null;
  const dir = mediaDir();
  const meta = await readMeta(id, dir);
  if (!meta) return null;
  let bytes: Buffer;
  try {
    bytes = await fs.readFile(binPath(id, dir));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'EISDIR') return null;
    throw error;
  }
  const encoded = bytes.toString('base64');
  if (meta.wrapper === 'data-url') return `data:${meta.mime};base64,${encoded}`;
  return encoded;
}

function isPlainObject(value: object): value is Record<string, unknown> {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export async function expandMediaRefs<T>(value: T): Promise<T> {
  if (typeof value === 'string') {
    if (!value.startsWith(MEDIA_REF_PREFIX)) return value;
    const restored = await readMediaString(value.slice(MEDIA_REF_PREFIX.length));
    if (restored === null) throw invalidMediaRef();
    return restored as T;
  }
  if (Array.isArray(value)) {
    const expanded = [];
    for (const item of value) expanded.push(await expandMediaRefs(item));
    return expanded as T;
  }
  if (value !== null && typeof value === 'object' && isPlainObject(value)) {
    const expanded: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      expanded[key] = await expandMediaRefs(item);
    }
    return expanded as T;
  }
  return value;
}
