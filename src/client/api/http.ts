import {
  ADMIN_TOKEN_HEADER,
  JOB_DEADLINE_MS,
  JOB_QUEUE_MAX,
  JOB_STILL_RUNNING_MESSAGE,
  MISSING_ADMIN_TOKEN_MESSAGE,
  UI_LANG_HEADER,
} from '../../contracts/http';
import { buildApiHeaders, focusAdminTokenField } from '../../utils/i18n';
import { externalizeJsonBody } from './externalizeMedia';

const JOB_POLL_INTERVAL_MS = 800;
const PENDING_JOBS_KEY = 'clipflow_pending_jobs_v1';

interface PendingJob {
  jobId: string;
  origin: string;
  deadlineMs: number;
  queueMax: number;
}

function pollTimeoutMs(deadlineMs: number, queueMax: number): number {
  const window = queueMax * deadlineMs + JOB_POLL_INTERVAL_MS;
  if (!Number.isFinite(window)) return JOB_QUEUE_MAX * JOB_DEADLINE_MS + JOB_POLL_INTERVAL_MS;
  return window;
}

function atLeastOne(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 1) return null;
  return value;
}

function bodyMark(body: BodyInit | null | undefined): string {
  if (typeof body === 'string') {
    let hash = 0x811c9dc5;
    for (let i = 0; i < body.length; i += 1) {
      hash ^= body.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16);
  }
  if (body == null) return '';
  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
  return `bin:${id}`;
}

function pendingSlot(path: string, body: BodyInit | null | undefined): string {
  return `${path}\u0000${bodyMark(body)}`;
}

export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  for (const [key, value] of Object.entries(buildApiHeaders())) {
    if (!headers.has(key)) headers.set(key, value);
  }
  if (!headers.has(UI_LANG_HEADER)) {
    headers.set(UI_LANG_HEADER, 'zh-CN');
  }
  if (!headers.get(ADMIN_TOKEN_HEADER)?.trim()) {
    focusAdminTokenField();
    return jsonResult({ error: MISSING_ADMIN_TOKEN_MESSAGE }, 401);
  }
  const slot = pendingSlot(requestPath(input), init.body);
  const resumed = await resumePending(slot, headers);
  if (resumed) return resumed;

  const body = typeof init.body === 'string' ? await externalizeJsonBody(init.body, headers) : init.body;
  const response = await fetch(input, { ...init, headers, body });
  if (response.status !== 202) return response;

  const accepted = await readAcceptedJob(response);
  if (!accepted) return response;
  await cancelUnusedBody(response);
  const origin = requestOrigin(response, input);
  return finishPoll(slot, origin, accepted, headers);
}

async function finishPoll(
  slot: string,
  origin: string,
  accepted: AcceptedJob,
  headers: Headers,
): Promise<Response> {
  const response = await pollJob(
    jobEndpoint(origin, accepted.jobId),
    jobEndpoint(origin, accepted.jobId, '/result'),
    authHeaders(headers),
    pollTimeoutMs(accepted.deadlineMs, accepted.queueMax),
    accepted.jobId,
  );
  if (await isStillRunning(response) && !slot.includes('\u0000bin:')) {
    writePending(slot, { ...accepted, origin });
  } else {
    clearPending(slot);
  }
  return response;
}

async function resumePending(slot: string, headers: Headers): Promise<Response | null> {
  const pending = readPending(slot);
  if (!pending) return null;
  const snapshot = await fetchJobSnapshot(jobEndpoint(pending.origin, pending.jobId), authHeaders(headers));
  if (
    snapshot?.status !== 'queued' &&
    snapshot?.status !== 'running' &&
    snapshot?.status !== 'succeeded' &&
    snapshot?.status !== 'failed'
  ) {
    clearPending(slot);
    return null;
  }
  return finishPoll(slot, pending.origin, pending, headers);
}

interface AcceptedJob {
  jobId: string;
  deadlineMs: number;
  queueMax: number;
}

async function readAcceptedJob(response: Response): Promise<AcceptedJob | null> {
  try {
    const text = await response.clone().text();
    if (!text.trim()) return null;
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || !('jobId' in parsed)) return null;
    const record = parsed as { jobId?: unknown; deadlineMs?: unknown; queueMax?: unknown };
    if (typeof record.jobId !== 'string' || record.jobId.length === 0) return null;
    const deadlineMs = atLeastOne(record.deadlineMs) ?? JOB_DEADLINE_MS;
    const queueRaw = atLeastOne(record.queueMax);
    const queueMax = queueRaw === null ? JOB_QUEUE_MAX : Math.floor(queueRaw);
    return { jobId: record.jobId, deadlineMs, queueMax };
  } catch {
    return null;
  }
}

function authHeaders(headers: Headers): Headers {
  const next = new Headers();
  const token = headers.get(ADMIN_TOKEN_HEADER);
  const lang = headers.get(UI_LANG_HEADER);
  if (token) next.set(ADMIN_TOKEN_HEADER, token);
  if (lang) next.set(UI_LANG_HEADER, lang);
  return next;
}

function pageOrigin(): string {
  if (typeof globalThis.location === 'undefined' || !globalThis.location) return '';
  return globalThis.location.origin;
}

function requestOrigin(response: Response, input: string): string {
  try {
    if (response.url) return new URL(response.url).origin;
  } catch {
    // The response URL can be empty when a test double does not set it.
  }
  try {
    const base = pageOrigin() || undefined;
    return new URL(input, base).origin;
  } catch {
    return pageOrigin();
  }
}

function jobEndpoint(origin: string, jobId: string, suffix = ''): string {
  const path = `/api/jobs/${encodeURIComponent(jobId)}${suffix}`;
  return origin ? `${origin}${path}` : path;
}

async function cancelUnusedBody(response: Response): Promise<void> {
  if (!response.body) return;
  try {
    await response.body.cancel();
  } catch {
    // Polling uses the job id already read from the clone.
  }
}

function jsonResult(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function statusOr(value: unknown, fallback: number): number {
  if (typeof value === 'number' && value >= 200 && value <= 599) return value;
  return fallback;
}

interface JobSnapshot {
  status?: unknown;
  httpStatus?: unknown;
  resultKind?: unknown;
  jsonBody?: unknown;
  error?: unknown;
}

async function pollJob(
  statusUrl: string,
  resultUrl: string,
  headers: Headers,
  timeoutMs: number,
  jobId: string,
): Promise<Response> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const snapshot = await fetchJobSnapshot(statusUrl, headers);
    if (snapshot?.status === 'succeeded' && snapshot.resultKind === 'binary') {
      return fetch(resultUrl, { method: 'GET', headers, cache: 'no-store' });
    }
    if (
      snapshot?.status === 'succeeded' &&
      (snapshot.resultKind === 'json' || 'jsonBody' in snapshot)
    ) {
      return jsonResult(snapshot.jsonBody ?? {}, statusOr(snapshot.httpStatus, 200));
    }
    if (snapshot?.status === 'failed') {
      const error = typeof snapshot.error === 'string' && snapshot.error ? snapshot.error : '任务失败';
      return jsonResult({ error }, statusOr(snapshot.httpStatus, 500));
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await delay(Math.min(JOB_POLL_INTERVAL_MS, remaining));
  }
  return jsonResult({ error: JOB_STILL_RUNNING_MESSAGE, jobId }, 504);
}

function requestPath(input: string): string {
  try {
    const base = pageOrigin() || 'http://local';
    return new URL(input, base).pathname;
  } catch {
    return input.split('?')[0] || input;
  }
}

function pendingStore(): Storage | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

function readPending(path: string): PendingJob | null {
  const store = pendingStore();
  if (!store) return null;
  try {
    const raw = store.getItem(PENDING_JOBS_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const record = (parsed as Record<string, unknown>)[path];
    if (!record || typeof record !== 'object') return null;
    const job = record as Partial<PendingJob>;
    if (typeof job.jobId !== 'string' || job.jobId.length === 0) return null;
    if (typeof job.origin !== 'string') return null;
    const deadlineMs = atLeastOne(job.deadlineMs) ?? JOB_DEADLINE_MS;
    const queueRaw = atLeastOne(job.queueMax);
    const queueMax = queueRaw === null ? JOB_QUEUE_MAX : Math.floor(queueRaw);
    return { jobId: job.jobId, origin: job.origin, deadlineMs, queueMax };
  } catch {
    return null;
  }
}

function writePending(path: string, job: PendingJob): void {
  const store = pendingStore();
  if (!store) return;
  try {
    const raw = store.getItem(PENDING_JOBS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    const map = parsed && typeof parsed === 'object' ? { ...(parsed as Record<string, unknown>) } : {};
    map[path] = job;
    store.setItem(PENDING_JOBS_KEY, JSON.stringify(map));
  } catch {
    // The next click cannot find this job and will start another one.
  }
}

function clearPending(path: string): void {
  const store = pendingStore();
  if (!store) return;
  try {
    const raw = store.getItem(PENDING_JOBS_KEY);
    if (!raw) return;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return;
    const map = { ...(parsed as Record<string, unknown>) };
    delete map[path];
    store.setItem(PENDING_JOBS_KEY, JSON.stringify(map));
  } catch {
    // Leave the record. The next click will try once more, then drop it if the job is gone.
  }
}

async function isStillRunning(response: Response): Promise<boolean> {
  if (response.status !== 504) return false;
  try {
    const body = (await response.clone().json()) as { error?: unknown; jobId?: unknown };
    return body.error === JOB_STILL_RUNNING_MESSAGE && typeof body.jobId === 'string';
  } catch {
    return false;
  }
}

async function fetchJobSnapshot(url: string, headers: Headers): Promise<JobSnapshot | null> {
  try {
    const response = await fetch(url, { method: 'GET', headers, cache: 'no-store' });
    const text = await response.text();
    if (!text.trim()) return null;
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as JobSnapshot;
  } catch {
    return null;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
