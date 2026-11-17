import type { GenerateVideosOperation, Video } from '@google/genai';
import express from 'express';
import { awaitWithAbort, JOB_DEADLINE } from '../jobs/abort.ts';
import { admitJob, QUEUE_FULL_MESSAGE, startJob, type JobHttpResult } from '../jobs/runner.ts';
import {
  fetchWithEnvProxy,
  getGeminiClient,
  getVideoModelCandidates,
  isQuotaExceededError,
  isServiceBusyError,
} from '../gemini.ts';

const VIDEO_WAIT_MS = 240_000;
const MAX_VIDEO_BYTES = 24 * 1024 * 1024;

function scriptFrom(body: unknown): string {
  if (!body || typeof body !== 'object') return '';
  const script = (body as { scriptText?: unknown }).scriptText;
  return typeof script === 'string' ? script.trim().slice(0, 400) : '';
}

function stillImage(body: unknown): { imageBytes: string; mimeType: string } | null {
  if (!body || typeof body !== 'object') return null;
  const record = body as { imageBase64?: unknown; imageMimeType?: unknown };
  if (typeof record.imageBase64 !== 'string' || record.imageBase64.length < 100) return null;
  const mimeType =
    typeof record.imageMimeType === 'string' ? record.imageMimeType.split(';')[0].trim() : '';
  if (mimeType !== 'image/jpeg' && mimeType !== 'image/png' && mimeType !== 'image/webp') return null;
  const imageBytes = record.imageBase64.includes(',')
    ? record.imageBase64.split(',')[1]
    : record.imageBase64;
  if (!imageBytes || imageBytes.length > 4_000_000) return null;
  return { imageBytes, mimeType };
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error(JOB_DEADLINE));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error(JOB_DEADLINE));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

async function waitForVideo(
  ai: ReturnType<typeof getGeminiClient>,
  operation: GenerateVideosOperation,
  signal?: AbortSignal,
): Promise<GenerateVideosOperation> {
  const deadline = Date.now() + VIDEO_WAIT_MS;
  let current = operation;
  while (!current.done) {
    if (signal?.aborted) {
      throw new Error(JOB_DEADLINE);
    }
    if (Date.now() > deadline) {
      throw new Error('VIDEO_TIMEOUT');
    }
    await sleep(8000, signal);
    current = await awaitWithAbort(
      ai.operations.getVideosOperation({
        operation: current,
        config: signal ? { abortSignal: signal } : {},
      }),
      signal,
    );
  }
  return current;
}

async function bytesFromVideo(video: Video | undefined, signal?: AbortSignal): Promise<Buffer> {
  if (!video) throw new Error('NO_VIDEO');
  if (video.videoBytes) {
    const bytes = Buffer.from(video.videoBytes, 'base64');
    if (bytes.length === 0 || bytes.length > MAX_VIDEO_BYTES) throw new Error('NO_VIDEO');
    return bytes;
  }
  if (!video.uri) throw new Error('NO_VIDEO');
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const response = await awaitWithAbort(
    fetchWithEnvProxy(video.uri, {
      headers: apiKey ? { 'x-goog-api-key': apiKey } : undefined,
      signal,
    }) as Promise<{ ok: boolean; status: number; arrayBuffer: () => Promise<ArrayBuffer> }>,
    signal,
  );
  if (!response.ok) throw new Error(`VIDEO_DOWNLOAD_${response.status}`);
  const bytes = Buffer.from(await awaitWithAbort(response.arrayBuffer(), signal));
  if (bytes.length === 0 || bytes.length > MAX_VIDEO_BYTES) throw new Error('NO_VIDEO');
  return bytes;
}

function failure(err: unknown): JobHttpResult {
  if (err instanceof Error && err.message === 'VIDEO_TIMEOUT') {
    return {
      httpStatus: 504,
      resultKind: 'json',
      jsonBody: { error: '说话视频还在生成，超过了等待时间。请稍后再试。' },
    };
  }
  if (isQuotaExceededError(err)) {
    return {
      httpStatus: 429,
      resultKind: 'json',
      jsonBody: { error: '说话视频额度已用完，请稍后再试。' },
    };
  }
  if (isServiceBusyError(err)) {
    return {
      httpStatus: 503,
      resultKind: 'json',
      jsonBody: { error: '说话视频服务正忙，请稍后重试。' },
    };
  }
  console.error('[talking-video]', err instanceof Error ? err.message : err);
  return {
    httpStatus: 502,
    resultKind: 'json',
    jsonBody: { error: '说话视频没有生成。请换一句较短的台词后再试。' },
  };
}

async function generateTalkingVideo(body: unknown, signal?: AbortSignal): Promise<JobHttpResult> {
  const script = scriptFrom(body);
  const image = stillImage(body);
  const prompt = `Vertical 9:16 short video of one adult presenter facing the camera and speaking this Mandarin line naturally, with visible mouth movement: ${script}. Studio lighting, no subtitles, no logos.`;
  const ai = getGeminiClient();
  const models = getVideoModelCandidates();
  let lastErr: unknown = null;

  for (let index = 0; index < models.length; index++) {
    const model = models[index];
    try {
      let operation = await awaitWithAbort(
        ai.models.generateVideos({
          model,
          prompt,
          ...(image ? { image } : {}),
          config: {
            numberOfVideos: 1,
            aspectRatio: '9:16',
            durationSeconds: 4,
            resolution: '720p',
            personGeneration: 'allow_adult',
            generateAudio: true,
            ...(signal ? { abortSignal: signal } : {}),
          },
        }),
        signal,
      );
      operation = await waitForVideo(ai, operation, signal);
      if (operation.error) {
        throw new Error(JSON.stringify(operation.error));
      }
      const bytes = await bytesFromVideo(operation.response?.generatedVideos?.[0]?.video, signal);
      return {
        httpStatus: 200,
        resultKind: 'binary',
        binary: bytes,
        contentType: 'video/mp4',
        filename: 'clipflow-talking.mp4',
      };
    } catch (err: unknown) {
      if (err instanceof Error && err.message === JOB_DEADLINE) throw err;
      if (signal?.aborted) throw new Error(JOB_DEADLINE);
      lastErr = err;
      if (isQuotaExceededError(err)) break;
      if (index < models.length - 1) {
        console.warn(`[talking-video] model "${model}" failed; falling back to "${models[index + 1]}"`);
      }
    }
  }

  return failure(lastErr);
}

export function registerTalkingVideoRoute(app: express.Express): void {
  app.post('/api/digital-human/talking-video', async (req, res) => {
    if (!scriptFrom(req.body)) {
      res.status(400).json({ error: '请先写一句要让主播说的话。' });
      return;
    }
    let admitted: Awaited<ReturnType<typeof admitJob>>;
    try {
      admitted = await admitJob('digital-human/talking-video');
    } catch (err: unknown) {
      console.error('[talking-video] create failed:', err);
      res.status(500).json({ error: '说话视频任务没能开始，请稍后重试。' });
      return;
    }
    if ('full' in admitted) {
      res.status(503).json({ error: QUEUE_FULL_MESSAGE });
      return;
    }
    const jobId = admitted.id;
    res.status(202).json({ jobId, status: 'queued' });
    const body = req.body;
    startJob(jobId, (signal) => generateTalkingVideo(body, signal));
  });
}
