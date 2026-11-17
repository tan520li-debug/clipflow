import crypto from 'crypto';
import express from 'express';
import { createWriteStream, type WriteStream } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import { binaryPathFor } from '../jobs/store.ts';
import { admitJob, QUEUE_FULL_MESSAGE, queuedJobBody, startJob } from '../jobs/runner.ts';
import { transcodeVideoFileToH264Mp4 } from '../media/transcode.ts';
import { ensureStudioTmpDir } from '../media/workDir.ts';

const MAX_VIDEO_BYTES = 160 * 1024 * 1024;

class PayloadTooLargeError extends Error {
  constructor() {
    super('PAYLOAD_TOO_LARGE');
    this.name = 'PayloadTooLargeError';
  }
}

function safeSourceExt(sourceExt: string): string {
  return /^[a-z0-9]{2,5}$/i.test(sourceExt) ? sourceExt.toLowerCase() : 'webm';
}

function respondPayloadTooLarge(req: express.Request, res: express.Response) {
  if (!res.headersSent) {
    res.status(413).json({ error: '视频文件超过 160MB 上限。' });
  }
  // Flush the 413 before destroy. req.destroy() in the same turn sends RST and drops the JSON.
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

function saveRequestToFile(
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
      if (total + chunk.length > MAX_VIDEO_BYTES) {
        respondPayloadTooLarge(req, res);
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

export function registerExportRoutes(app: express.Express) {
  app.post('/api/export/transcode-mp4', async (req, res) => {
    const rawSourceExt =
      typeof req.query.sourceExt === 'string' ? req.query.sourceExt.trim() : 'webm';
    const safeExt = safeSourceExt(rawSourceExt);
    const uploadId = crypto.randomUUID();
    const inPath = path.join(await ensureStudioTmpDir(), `clipflow-in-${uploadId}.${safeExt}`);
    let handedOff = false;

    try {
      const declaredLength = Number(req.headers['content-length']);
      if (Number.isFinite(declaredLength) && declaredLength > MAX_VIDEO_BYTES) {
        respondPayloadTooLarge(req, res);
        return;
      }

      const bytes = await saveRequestToFile(req, res, inPath);
      if (bytes === 0) {
        res.status(400).json({ error: '未收到待转码的视频数据流。' });
        return;
      }

      const admitted = await admitJob('export/transcode-mp4');
      if ('full' in admitted) {
        res.status(503).json({ error: QUEUE_FULL_MESSAGE });
        return;
      }
      const id = admitted.id;
      const binPath = binaryPathFor(id);
      handedOff = true;
      res.status(202).json(queuedJobBody(id));
      startJob(id, async (signal) => {
        try {
          await transcodeVideoFileToH264Mp4(inPath, binPath, signal);
          const outStat = await fs.stat(binPath);
          if (!outStat.isFile() || outStat.size === 0) {
            throw new Error('Transcoded MP4 file is empty');
          }
          return {
            httpStatus: 200,
            resultKind: 'binary' as const,
            binaryPath: binPath,
            contentType: 'video/mp4',
            filename: 'clipflow_export.mp4',
          };
        } finally {
          await fs.unlink(inPath).catch(() => undefined);
        }
      });
    } catch (err: unknown) {
      if (err instanceof PayloadTooLargeError) {
        if (!res.headersSent) {
          respondPayloadTooLarge(req, res);
        }
        return;
      }
      console.error('[api/export/transcode-mp4] error:', err);
      if (!res.headersSent) {
        res.status(500).json({
          error: '服务端 FFmpeg 转码 H.264 MP4 失败，请稍后重试或直接下载原始格式。',
        });
      }
    } finally {
      if (!handedOff) {
        await fs.unlink(inPath).catch(() => undefined);
      }
    }
  });
}
