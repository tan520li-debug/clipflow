import {
  ADMIN_TOKEN_HEADER,
  JOB_DEADLINE_MS,
  JOB_QUEUE_MAX,
  MISSING_ADMIN_TOKEN_MESSAGE,
  UI_LANG_HEADER,
} from '../../contracts/http';
import { buildApiHeaders, focusAdminTokenField } from '../../utils/i18n';
import { externalizeJsonBody } from './externalizeMedia';

const JOB_POLL_INTERVAL_MS = 800;

function pollTimeoutMs(deadlineMs: number, queueMax: number): number {
  const window = queueMax * deadlineMs + JOB_POLL_INTERVAL_MS;
  if (!Number.isFinite(window)) return JOB_QUEUE_MAX * JOB_DEADLINE_MS + JOB_POLL_INTERVAL_MS;
  return window;
}

function atLeastOne(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 1) return null;
  return value;
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
  const body = typeof init.body === 'string' ? await externalizeJsonBody(init.body, headers) : init.body;
  const response = await fetch(input, { ...init, headers, body });
  if (response.status !== 202) return response;

  const accepted = await readAcceptedJob(response);
  if (!accepted) return response;
  await cancelUnusedBody(response);
  const origin = requestOrigin(response, input);
  return pollJob(
    jobEndpoint(origin, accepted.jobId),
    jobEndpoint(origin, accepted.jobId, '/result'),
    authHeaders(headers),
    pollTimeoutMs(accepted.deadlineMs, accepted.queueMax),
  );
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
  return jsonResult({ error: '任务仍在处理，请稍后再查看。' }, 504);
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
