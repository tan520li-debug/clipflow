import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import path from 'node:path';
import { once } from 'node:events';
import { describe, expect, it } from 'vitest';

const serverPath = path.resolve('clipflow-mcp/mcp-server.mjs');

function startClient(env: NodeJS.ProcessEnv) {
  const child = spawn(process.execPath, [serverPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, ...env },
  });
  let buffer = '';
  const waiters: Array<(message: { id?: number; result?: unknown; error?: unknown }) => void> = [];
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    buffer += chunk;
    let newline = buffer.indexOf('\n');
    while (newline !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) {
        const waiter = waiters.shift();
        waiter?.(JSON.parse(line) as { id?: number; result?: unknown; error?: unknown });
      }
      newline = buffer.indexOf('\n');
    }
  });
  let nextId = 1;
  return {
    child,
    request(method: string, params?: unknown) {
      const id = nextId;
      nextId += 1;
      const response = new Promise((resolve) => {
        waiters.push(resolve);
      });
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
      return response;
    },
    stop() {
      child.stdin.end();
      child.kill();
    },
  };
}

describe('clipflow mcp server', () => {
  it('lists studio_health and reads a local health endpoint', async () => {
    const http = createServer((_req, res) => {
      res.statusCode = 200;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ ok: true }));
    });
    await new Promise<void>((resolve) => {
      http.listen(0, '127.0.0.1', resolve);
    });
    const address = http.address();
    if (!address || typeof address === 'string') throw new Error('no port');
    const client = startClient({ CLIPFLOW_URL: `http://127.0.0.1:${address.port}` });
    try {
      const init = await client.request('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'vitest', version: '0' },
      });
      expect(init).toMatchObject({
        id: 1,
        result: { serverInfo: { name: 'clipflow-mcp' } },
      });
      const listed = await client.request('tools/list');
      expect(listed).toMatchObject({
        result: { tools: [{ name: 'studio_health' }] },
      });
      const called = (await client.request('tools/call', { name: 'studio_health' })) as {
        result: { content: Array<{ text: string }>; isError: boolean };
      };
      expect(called.result.isError).toBe(false);
      expect(called.result.content[0]?.text).toContain('{"ok":true}');
    } finally {
      client.stop();
      http.close();
      await once(http, 'close');
    }
  });
});
