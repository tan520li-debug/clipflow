import crypto from 'node:crypto';
import express from 'express';
import { createWriteStream, type WriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { mediaDir, type MediaWrapper } from '../media/blobs.ts';

const MAX_MEDIA_BYTES = 16 * 1024 * 1024;
const MIME_PATTERN = /^[A-Za-z0-9.+/]+$/;
const TOO_LARGE = '素材超过 16MB 上限。';
const EMPTY_BODY = '没有收到素材数据。';
const BAD_WRAPPER = '素材封装类型无效。';

class PayloadTooLargeError extends Error {
  constructor() {
    super('PAYLOAD_TOO_LARGE');
    this.name = 'PayloadTooLargeError';
  }
}

function safeMime(value: unknown): string {
  if (typeof value !== 'string') return 'application/octet-stream';
  const mime = value.trim();
  return MIME_PATTERN.test(mime) ? mime : 'application/octet-stream';
}

function parseWrapper(value: unknown): MediaWrapper | null {
  if (value === undefined) return 'base64';
  if (typeof value !== 'string') return null;
  const wrapper = value.trim();
  if (wrapper === '') return 'base64';
  if (wrapper === 'data-url' || wrapper === 'base64') return wrapper;
  return null;
}

function stopWithJson(
  req: express.Request,
  res: express.Response,
  status: number,
  error: string
): void {
  if (!res.headersSent) {
    res.status(status).json({ error });
  }
  // Flush the JSON before destroy. req.destroy() in the same turn sends RST and drops the body.
  const destroyUpload = () => {
    req.on('error', () => {});
    req.pause();
    const socket = req.socket;
    if (socket && !socket.destroyed) {
      socket.once('close', () => {
        if (!req.destroyed) req.destroy();
      });
      socket.end();
      return;
    }
    if (!req.destroyed) req.destroy();
  };
  if (res.writableFinished) destroyUpload();
  else res.once('finish', destroyUpload);
}

function closeWriteStream(ws: WriteStream): Promise<void> {
  return new Promise((resolve) => {
    if (ws.closed || ws.destroyed) {
      resolve();
      return;
    }
    ws.once('error', () => resolve());
    ws.end(() => resolve());
  });
}

function streamRequestToFile(
  req: express.Request,
  res: express.Response,
  filePath: string
): Promise<number> {
  const ws = createWriteStream(filePath);
  let total = 0;
  let settled = false;

  return new Promise((resolve, reject) => {
    const finish = (err: Error | null, bytes = total) => {
      if (settled) return;
      settled = true;
      req.pause();
      req.off('data', onData);
      req.off('end', onEnd);
      req.off('error', onReqError);
      ws.off('error', onWsError);
      void closeWriteStream(ws).then(() => {
        if (err) reject(err);
        else resolve(bytes);
      });
    };

    const onData = (chunk: Buffer) => {
      if (settled) return;
      if (total + chunk.length > MAX_MEDIA_BYTES) {
        stopWithJson(req, res, 413, TOO_LARGE);
        finish(new PayloadTooLargeError());
        return;
      }
      total += chunk.length;
      if (!ws.write(chunk)) {
        req.pause();
        ws.once('drain', () => {
          if (!settled) req.resume();
        });
      }
    };

    const onEnd = () => finish(null, total);
    const onReqError = (err: Error) => finish(err);
    const onWsError = (err: Error) => {
      req.on('error', () => {});
      if (!req.destroyed) req.destroy();
      finish(err);
    };

    ws.on('error', onWsError);
    req.on('data', onData);
    req.on('end', onEnd);
    req.on('error', onReqError);
  });
}

async function removePartial(filePath: string): Promise<void> {
  await fs.rm(filePath, { force: true }).catch(() => undefined);
}

export function registerMediaRoutes(app: express.Express): void {
  app.post('/api/media', async (req, res) => {
    const wrapper = parseWrapper(req.query.wrapper);
    if (wrapper === null) {
      stopWithJson(req, res, 400, BAD_WRAPPER);
      return;
    }
    const mime = safeMime(req.query.mime);

    const declaredLength = Number(req.headers['content-length']);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_MEDIA_BYTES) {
      stopWithJson(req, res, 413, TOO_LARGE);
      return;
    }
    if (declaredLength === 0) {
      stopWithJson(req, res, 400, EMPTY_BODY);
      return;
    }

    const id = crypto.randomUUID();
    const dir = mediaDir();
    const binFile = path.join(dir, `${id}.bin`);
    const jsonFile = path.join(dir, `${id}.json`);
    let committed = false;

    try {
      await fs.mkdir(dir, { recursive: true });
      const bytes = await streamRequestToFile(req, res, binFile);
      if (bytes === 0) {
        stopWithJson(req, res, 400, EMPTY_BODY);
        return;
      }
      await fs.writeFile(jsonFile, JSON.stringify({ mime, wrapper }), 'utf8');
      committed = true;
      res.status(201).json({ mediaId: id });
    } catch (err: unknown) {
      if (err instanceof PayloadTooLargeError) {
        if (!res.headersSent) stopWithJson(req, res, 413, TOO_LARGE);
        return;
      }
      console.error('[api/media] error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: '素材保存失败，请稍后重试。' });
      }
    } finally {
      if (!committed) {
        await removePartial(binFile);
        await removePartial(jsonFile);
      }
    }
  });
}
