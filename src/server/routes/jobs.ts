import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import type { Request, Response } from 'express';
import { binaryPathFor, readJob, type JobRecord } from '../jobs/store.ts';

const MISSING_JOB = { error: '任务不存在或已过期。' };
const MISSING_RESULT = { error: '任务结果尚不可用。' };

function routeId(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return '';
}

function publicJob(job: JobRecord): Record<string, unknown> {
  const body: Record<string, unknown> = {
    id: job.id,
    kind: job.kind,
    status: job.status,
  };
  if (job.httpStatus !== undefined) body.httpStatus = job.httpStatus;
  if (job.resultKind !== undefined) body.resultKind = job.resultKind;
  if (job.jsonBody !== undefined) body.jsonBody = job.jsonBody;
  if (job.contentType !== undefined) body.contentType = job.contentType;
  if (job.filename !== undefined) body.filename = job.filename;
  if (job.error !== undefined) body.error = job.error;
  return body;
}

function contentTypeOrDefault(value: string | undefined): string {
  if (!value) return 'application/octet-stream';
  const cleaned = value.replace(/[\r\n]/g, '').trim();
  return cleaned || 'application/octet-stream';
}

function contentDisposition(filename: string): string {
  const withoutBreaks = filename.replace(/[\r\n]/g, '');
  const base = withoutBreaks.replace(/\\/g, '/').split('/').pop() || 'download';
  const cleaned = base.replace(/["\\]/g, '_');
  const ascii = cleaned.replace(/[^\x20-\x7E]/g, '_');
  const encoded = encodeURIComponent(cleaned).replace(/['()*]/g, (char) => {
    return `%${char.charCodeAt(0).toString(16).toUpperCase()}`;
  });
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

async function readJobResponse(req: Request, res: Response): Promise<void> {
  const job = await readJob(routeId(req.params.id));
  if (!job) {
    res.status(404).json(MISSING_JOB);
    return;
  }
  res.json(publicJob(job));
}

async function readJobResult(req: Request, res: Response): Promise<void> {
  const job = await readJob(routeId(req.params.id));
  if (!job || job.status !== 'succeeded' || job.resultKind !== 'binary') {
    res.status(404).json(MISSING_RESULT);
    return;
  }

  const filePath = binaryPathFor(job.id);
  let size = 0;
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) {
      res.status(404).json(MISSING_RESULT);
      return;
    }
    size = stat.size;
  } catch {
    res.status(404).json(MISSING_RESULT);
    return;
  }

  res.status(200);
  res.setHeader('Content-Type', contentTypeOrDefault(job.contentType));
  res.setHeader('Content-Length', String(size));
  if (job.filename) res.setHeader('Content-Disposition', contentDisposition(job.filename));

  try {
    await pipeline(createReadStream(filePath), res);
  } catch {
    if (!res.headersSent) res.status(404).json(MISSING_RESULT);
  }
}

export function registerJobRoutes(app: import('express').Express): void {
  app.get('/api/jobs/:id', (req, res, next) => {
    void readJobResponse(req, res).catch(next);
  });
  app.get('/api/jobs/:id/result', (req, res, next) => {
    void readJobResult(req, res).catch(next);
  });
}
