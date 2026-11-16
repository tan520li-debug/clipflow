const MEDIA_REF_PREFIX = 'clipflow-media:';
const LARGE_CHARS = 4096;

type Wrapper = 'data-url' | 'base64';

function payloadKind(value: string): Wrapper | null {
  if (value.startsWith(MEDIA_REF_PREFIX)) return null;
  if (value.startsWith('data:') && value.includes(';base64,')) {
    const comma = value.indexOf(',');
    if (comma >= 0 && value.length - comma > LARGE_CHARS) return 'data-url';
    return null;
  }
  if (value.length < LARGE_CHARS) return null;
  const compact = value.replace(/\s/g, '');
  if (compact.length % 4 !== 0) return null;
  if (!/^[A-Za-z0-9+/=]+$/.test(compact)) return null;
  return 'base64';
}

function decodeBase64(input: string): Uint8Array {
  const binary = atob(input.replace(/\s/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function dataUrlParts(value: string): { mime: string; bytes: Uint8Array } | null {
  const match = /^data:([^;,]*);base64,([\s\S]*)$/.exec(value);
  if (!match) return null;
  const mime = match[1]?.trim() || 'application/octet-stream';
  try {
    return { mime, bytes: decodeBase64(match[2] ?? '') };
  } catch {
    return null;
  }
}

async function uploadBytes(
  bytes: Uint8Array,
  mime: string,
  wrapper: Wrapper,
  headers: Headers,
): Promise<string> {
  const uploadHeaders = new Headers();
  const token = headers.get('x-clipflow-token');
  const lang = headers.get('x-clipflow-lang');
  if (token) uploadHeaders.set('x-clipflow-token', token);
  if (lang) uploadHeaders.set('x-clipflow-lang', lang);
  uploadHeaders.set('Content-Type', 'application/octet-stream');
  const params = new URLSearchParams({ mime, wrapper });
  const response = await fetch(`/api/media?${params.toString()}`, {
    method: 'POST',
    headers: uploadHeaders,
    body: bytes as unknown as BodyInit,
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error || `素材上传失败（${response.status}）`);
  }
  const payload = (await response.json()) as { mediaId?: unknown };
  if (typeof payload.mediaId !== 'string' || payload.mediaId.length === 0) {
    throw new Error('素材上传没有返回编号。');
  }
  return `${MEDIA_REF_PREFIX}${payload.mediaId}`;
}

async function replaceString(value: string, headers: Headers): Promise<string> {
  const kind = payloadKind(value);
  if (!kind) return value;
  if (kind === 'data-url') {
    const parts = dataUrlParts(value);
    if (!parts) return value;
    return uploadBytes(parts.bytes, parts.mime, 'data-url', headers);
  }
  try {
    return await uploadBytes(decodeBase64(value), 'application/octet-stream', 'base64', headers);
  } catch {
    return value;
  }
}

async function walk(value: unknown, headers: Headers): Promise<unknown> {
  if (typeof value === 'string') return replaceString(value, headers);
  if (Array.isArray(value)) {
    const next = [];
    for (const item of value) next.push(await walk(item, headers));
    return next;
  }
  if (!value || typeof value !== 'object') return value;
  const record = value as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(record)) {
    next[key] = await walk(item, headers);
  }
  return next;
}

export async function externalizeJsonBody(body: string, headers: Headers): Promise<string> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return body;
  }
  const replaced = await walk(parsed, headers);
  return JSON.stringify(replaced);
}
