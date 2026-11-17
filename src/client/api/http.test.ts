import { afterEach, describe, expect, it, vi } from 'vitest';
import { JOB_DEADLINE_MS, MISSING_ADMIN_TOKEN_MESSAGE } from '../../contracts/http';
import { ADMIN_TOKEN_STORAGE_KEY } from '../../utils/i18n';
import { apiFetch } from './http';

const store = new Map<string, string>();

function installBrowserDoubles(focus: ReturnType<typeof vi.fn>) {
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    },
  });
  vi.stubGlobal('document', {
    querySelector: (selector: string) =>
      selector === '[aria-label="访问令牌"]' ? { focus } : null,
  });
}

afterEach(() => {
  store.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('apiFetch', () => {
  it('stops before the network when the top bar has no token', async () => {
    const focus = vi.fn();
    const fetchMock = vi.fn();
    installBrowserDoubles(focus);
    vi.stubGlobal('fetch', fetchMock);

    const response = await apiFetch('/api/generate-voiceover', {
      method: 'POST',
      body: JSON.stringify({ cues: [{ text: '几克豆子' }] }),
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(focus).toHaveBeenCalledOnce();
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: MISSING_ADMIN_TOKEN_MESSAGE });
  });

  it('sends a saved token and does not focus the field', async () => {
    const focus = vi.fn();
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    installBrowserDoubles(focus);
    vi.stubGlobal('fetch', fetchMock);
    store.set(ADMIN_TOKEN_STORAGE_KEY, 'stored-token');

    const response = await apiFetch('/api/voice-clone/preview', { method: 'POST', body: '{}' });

    expect(response.status).toBe(200);
    expect(focus).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledOnce();
    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Headers;
    expect(headers.get('x-clipflow-token')).toBe('stored-token');
  });

  it('keeps an explicit token header when storage is empty', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await apiFetch('/api/digital-human/clone', {
      method: 'POST',
      headers: { 'x-clipflow-token': 'explicit-token' },
      body: '{}',
    });

    expect(response.status).toBe(200);
    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Headers;
    expect(headers.get('x-clipflow-token')).toBe('explicit-token');
  });

  it('keeps polling a running job past two minutes', async () => {
    vi.useFakeTimers();
    const focus = vi.fn();
    installBrowserDoubles(focus);
    store.set(ADMIN_TOKEN_STORAGE_KEY, 'stored-token');
    let polls = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (!String(url).includes('/api/jobs/')) {
        return new Response(JSON.stringify({ jobId: 'job-1', status: 'queued' }), { status: 202 });
      }
      polls += 1;
      if (polls < 152) {
        return new Response(JSON.stringify({ status: 'running' }), { status: 200 });
      }
      return new Response(
        JSON.stringify({
          status: 'succeeded',
          resultKind: 'json',
          httpStatus: 200,
          jsonBody: { ready: true },
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const pending = apiFetch('/api/export/transcode-mp4', { method: 'POST', body: '{}' });
    await vi.advanceTimersByTimeAsync(120_000);
    await vi.advanceTimersByTimeAsync(800);
    const response = await pending;

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ready: true });
    expect(polls).toBe(152);
  });

  it('stops after the job deadline when the job never finishes', async () => {
    vi.useFakeTimers();
    const focus = vi.fn();
    installBrowserDoubles(focus);
    store.set(ADMIN_TOKEN_STORAGE_KEY, 'stored-token');
    const fetchMock = vi.fn(async (url: string) => {
      if (!String(url).includes('/api/jobs/')) {
        return new Response(JSON.stringify({ jobId: 'job-2', status: 'queued' }), { status: 202 });
      }
      return new Response(JSON.stringify({ status: 'queued' }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const pending = apiFetch('/api/digital-human/talking-video', { method: 'POST', body: '{}' });
    const result = pending.then(async (response) => ({
      status: response.status,
      body: await response.json(),
    }));
    await vi.advanceTimersByTimeAsync(JOB_DEADLINE_MS + 800);
    await expect(result).resolves.toEqual({
      status: 504,
      body: { error: '任务仍在处理，请稍后再查看。' },
    });
  });
});
