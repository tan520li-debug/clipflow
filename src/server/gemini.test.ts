import type { GoogleGenAI } from '@google/genai';
import { describe, expect, it } from 'vitest';
import { generateTextContentWithFallback } from './gemini.ts';
import { JOB_DEADLINE, runWithJobAbort } from './jobs/abort.ts';

function hangingAi(onCall: () => void): GoogleGenAI {
  return {
    models: {
      generateContent: (req: { config?: { abortSignal?: AbortSignal } }) => {
        onCall();
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
}

describe('generateTextContentWithFallback', () => {
  it('stops the hung request when the job deadline aborts', async () => {
    let calls = 0;
    const ai = hangingAi(() => {
      calls += 1;
    });
    const job = new AbortController();
    const pending = runWithJobAbort(job.signal, () =>
      generateTextContentWithFallback(ai, { contents: '几克豆子' }, ['one', 'two']),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    job.abort();
    await expect(pending).rejects.toThrow(JOB_DEADLINE);
    expect(calls).toBe(1);
  });
});
