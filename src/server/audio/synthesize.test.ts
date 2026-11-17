import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { GoogleGenAI } from '@google/genai';
import { describe, expect, it } from 'vitest';
import { JOB_DEADLINE, runWithJobAbort } from '../jobs/abort.ts';
import { isSpeechTimeoutError, SPEECH_SYNTHESIS_TIMEOUT_MS, SPEECH_TIMEOUT_MESSAGE, synthesizeStyledSpeech } from './synthesize';
import { extractWavMelPhonemeAlignment, getWavDurationSec } from './wav';

const here = dirname(fileURLToPath(import.meta.url));

function pcm16LeBase64(samples: Int16Array): string {
  const buf = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) buf.writeInt16LE(samples[i], i * 2);
  return buf.toString('base64');
}

function fakeAi(generateContent: () => Promise<unknown>): GoogleGenAI {
  return { models: { generateContent } } as unknown as GoogleGenAI;
}

describe('synthesizeStyledSpeech', () => {
  it('returns audio/wav when the model sends one L16 clip', async () => {
    const samples = new Int16Array(24000);
    for (let i = 0; i < samples.length; i++) samples[i] = i % 200 < 100 ? 8000 : -8000;
    const ai = fakeAi(async () => ({
      candidates: [
        {
          content: {
            parts: [
              {
                inlineData: {
                  data: pcm16LeBase64(samples),
                  mimeType: 'audio/L16;codec=pcm;rate=24000',
                },
              },
            ],
          },
        },
      ],
    }));
    const speech = await synthesizeStyledSpeech(ai, { voiceName: 'Kore', spokenText: '几克豆子' });
    expect(speech.mimeType).toBe('audio/wav');
    expect(getWavDurationSec(speech.data)).toBe(1);
    const header = Buffer.from(speech.data, 'base64').subarray(0, 12).toString('ascii');
    expect(header.startsWith('RIFF')).toBe(true);
    expect(header.endsWith('WAVE')).toBe(true);
    expect(extractWavMelPhonemeAlignment(speech.data)).toBeDefined();
  });

  it('throws when the model returns no audio bytes', async () => {
    const ai = fakeAi(async () => ({
      candidates: [{ content: { parts: [{ inlineData: { data: '', mimeType: 'audio/L16' } }] } }],
    }));
    await expect(
      synthesizeStyledSpeech(ai, { voiceName: 'Kore', spokenText: '几克豆子' })
    ).rejects.toThrow('TTS 合成未返回音频数据');
  });

  it('throws the model error instead of inventing a WAV', async () => {
    const ai = fakeAi(async () => {
      throw new Error('socket hang up');
    });
    await expect(
      synthesizeStyledSpeech(ai, { voiceName: 'Kore', spokenText: '几克豆子' })
    ).rejects.toThrow('socket hang up');
  });

  it('keeps Gemini audio synthesis on the shared WAV exit', () => {
    const synthesize = readFileSync(join(here, 'synthesize.ts'), 'utf8');
    expect(synthesize).toContain('ensurePlayableWav');
    const routes = ['../routes/digitalHuman.ts', '../routes/voice.ts'].map((rel) =>
      readFileSync(join(here, rel), 'utf8')
    );
    for (const source of routes) {
      expect(source).toContain('synthesizeStyledSpeech');
      expect(source).not.toContain("responseModalities: ['AUDIO']");
    }
  });

  it('stops a hung speech request before the 15 minute job deadline', async () => {
    expect(SPEECH_SYNTHESIS_TIMEOUT_MS).toBe(60_000);
    const hanging = {
      models: {
        generateContent: (req: { config?: { abortSignal?: AbortSignal } }) =>
          new Promise((_resolve, reject) => {
            const signal = req.config?.abortSignal;
            if (!signal) {
              reject(new Error('missing abort'));
              return;
            }
            const fail = () => reject(signal.reason ?? new Error('aborted'));
            if (signal.aborted) fail();
            else signal.addEventListener('abort', fail, { once: true });
          }),
      },
    } as unknown as GoogleGenAI;
    const started = Date.now();
    await expect(
      synthesizeStyledSpeech(hanging, {
        voiceName: 'Kore',
        spokenText: '几克豆子',
        timeoutMs: 30,
      })
    ).rejects.toThrow(/aborted|timeout/i);
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it('does not give each TTS model a fresh timeout budget', async () => {
    let calls = 0;
    const hanging = {
      models: {
        generateContent: (req: { config?: { abortSignal?: AbortSignal } }) => {
          calls += 1;
          return new Promise((_resolve, reject) => {
            const signal = req.config?.abortSignal;
            if (!signal) {
              reject(new Error('missing abort'));
              return;
            }
            const fail = () => reject(signal.reason ?? new Error('aborted'));
            if (signal.aborted) fail();
            else signal.addEventListener('abort', fail, { once: true });
          });
        },
      },
    } as unknown as GoogleGenAI;
    const started = Date.now();
    await expect(
      synthesizeStyledSpeech(hanging, {
        voiceName: 'Kore',
        spokenText: '几克豆子',
        timeoutMs: 80,
      }),
    ).rejects.toMatchObject({ name: 'TimeoutError' });
    expect(calls).toBe(1);
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it('stops a hung speech request when the job deadline aborts', async () => {
    let calls = 0;
    const hanging = {
      models: {
        generateContent: (req: { config?: { abortSignal?: AbortSignal } }) => {
          calls += 1;
          return new Promise((_resolve, reject) => {
            const signal = req.config?.abortSignal;
            if (!signal) {
              reject(new Error('missing abort'));
              return;
            }
            const fail = () => reject(signal.reason ?? new Error('aborted'));
            if (signal.aborted) fail();
            else signal.addEventListener('abort', fail, { once: true });
          });
        },
      },
    } as unknown as GoogleGenAI;
    const job = new AbortController();
    const started = Date.now();
    const pending = runWithJobAbort(job.signal, () =>
      synthesizeStyledSpeech(hanging, {
        voiceName: 'Kore',
        spokenText: '几克豆子',
        timeoutMs: 5_000,
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    job.abort();
    await expect(pending).rejects.toThrow(JOB_DEADLINE);
    expect(calls).toBe(1);
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it('names a speech timeout and leaves other failures alone', () => {
    const timeout = new Error('The operation was aborted due to timeout');
    timeout.name = 'TimeoutError';
    expect(isSpeechTimeoutError(timeout)).toBe(true);
    expect(SPEECH_TIMEOUT_MESSAGE).toBe('语音合成超时，请缩短台词后再试。');
    expect(isSpeechTimeoutError(new Error('socket hang up'))).toBe(false);
  });
});
