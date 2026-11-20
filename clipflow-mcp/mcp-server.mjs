#!/usr/bin/env node
import { createInterface } from 'node:readline';

const SERVER = { name: 'clipflow-mcp', version: '0.1.0' };

const TOOLS = [
  {
    name: 'studio_health',
    description:
      'Read GET /api/health on the local ClipFlow studio. Does not generate video, spend API keys, or publish anywhere.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
];

function studioOrigin() {
  const raw = process.env.CLIPFLOW_URL?.trim();
  const value = raw && !raw.startsWith('${') ? raw : 'http://127.0.0.1:3000';
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('CLIPFLOW_URL is not a valid URL.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('CLIPFLOW_URL must be http or https.');
  }
  return url.origin;
}

async function studioHealth() {
  const origin = studioOrigin();
  const response = await fetch(new URL('/api/health', origin), {
    signal: AbortSignal.timeout(5_000),
  });
  const body = await response.text();
  return {
    content: [
      {
        type: 'text',
        text: `${response.status} ${origin}/api/health\n${body}`,
      },
    ],
    isError: !response.ok,
  };
}

async function callTool(name) {
  if (name !== 'studio_health') {
    return {
      content: [{ type: 'text', text: `Unknown tool: ${name}` }],
      isError: true,
    };
  }
  try {
    return await studioHealth();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Health check failed.';
    return { content: [{ type: 'text', text: message }], isError: true };
  }
}

async function handle(message) {
  const method = message.method;
  if (method === 'initialize') {
    return {
      protocolVersion: message.params?.protocolVersion ?? '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: SERVER,
    };
  }
  if (method === 'tools/list') return { tools: TOOLS };
  if (method === 'tools/call') return callTool(message.params?.name);
  if (method === 'ping') return {};
  throw new Error(`Unsupported method: ${method}`);
}

function send(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
lines.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let message;
  try {
    message = JSON.parse(trimmed);
  } catch {
    return;
  }
  if (message.id === undefined) return;
  Promise.resolve(handle(message))
    .then((result) => {
      send({ jsonrpc: '2.0', id: message.id, result });
    })
    .catch((error) => {
      const messageText = error instanceof Error ? error.message : 'MCP error';
      send({
        jsonrpc: '2.0',
        id: message.id,
        error: { code: -32601, message: messageText },
      });
    });
});
