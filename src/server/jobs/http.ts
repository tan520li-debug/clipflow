import type { Request, RequestHandler, Response } from 'express';
import { createJob } from './store.ts';
import { startJob, type JobHttpResult } from './runner.ts';

interface CaptureState {
  statusCode: number;
  body: unknown;
  sent: boolean;
}

function captureResponse(): { res: Response; toResult: () => JobHttpResult } {
  const state: CaptureState = { statusCode: 200, body: undefined, sent: false };
  const captured = {
    status(code: number) {
      state.statusCode = code;
      return captured;
    },
    json(body: unknown) {
      state.body = body;
      state.sent = true;
      return captured;
    },
    get headersSent() {
      return state.sent;
    },
  };
  return {
    res: captured as unknown as Response,
    toResult: () => {
      if (!state.sent) {
        return {
          httpStatus: 500,
          resultKind: 'json',
          jsonBody: { error: '任务没有返回结果。' },
        };
      }
      return {
        httpStatus: state.statusCode,
        resultKind: 'json',
        jsonBody: state.body,
      };
    },
  };
}

export function acceptJsonJob(
  kind: string,
  handler: (req: Request, res: Response) => Promise<unknown>,
  validate?: (req: Request) => { status: number; body: unknown } | null
): RequestHandler {
  return async (req, res) => {
    if (validate) {
      const rejected = validate(req);
      if (rejected) {
        res.status(rejected.status).json(rejected.body);
        return;
      }
    }

    let jobId: string;
    try {
      jobId = (await createJob(kind)).id;
    } catch (err: unknown) {
      console.error('[jobs] create failed:', err);
      res.status(500).json({ error: '任务没能开始，请稍后重试。' });
      return;
    }

    res.status(202).json({ jobId, status: 'queued' });
    const captured = captureResponse();
    startJob(jobId, async () => {
      await handler(req, captured.res);
      return captured.toResult();
    });
  };
}
