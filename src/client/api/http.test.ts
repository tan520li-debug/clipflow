import { afterEach, describe, expect, it, vi } from 'vitest';
import { MISSING_ADMIN_TOKEN_MESSAGE } from '../../contracts/http';
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
});
