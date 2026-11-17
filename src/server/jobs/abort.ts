import { AsyncLocalStorage } from 'node:async_hooks';

export const JOB_DEADLINE = 'JOB_DEADLINE';

const storage = new AsyncLocalStorage<AbortSignal>();

export function runWithJobAbort<T>(signal: AbortSignal, fn: () => Promise<T>): Promise<T> {
  return storage.run(signal, fn);
}

export function jobAbortSignal(): AbortSignal | undefined {
  return storage.getStore();
}

export function isJobAborted(): boolean {
  return Boolean(storage.getStore()?.aborted);
}

export function jobDeadlineError(): Error {
  return new Error(JOB_DEADLINE);
}

export function mergeAbortSignal(timeoutMs: number, extra?: AbortSignal): AbortSignal {
  const signals: AbortSignal[] = [AbortSignal.timeout(timeoutMs)];
  const seen = new Set<AbortSignal>(signals);
  const add = (signal?: AbortSignal) => {
    if (!signal || seen.has(signal)) return;
    seen.add(signal);
    signals.push(signal);
  };
  add(extra);
  add(storage.getStore());
  return signals.length === 1 ? signals[0] : AbortSignal.any(signals);
}

export async function awaitWithAbort<T>(pending: Promise<T>, extra?: AbortSignal): Promise<T> {
  const signal = extra ?? storage.getStore();
  if (!signal) return pending;
  if (signal.aborted) throw jobDeadlineError();
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(jobDeadlineError());
    signal.addEventListener('abort', onAbort, { once: true });
    pending.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(signal.aborted ? jobDeadlineError() : error);
      },
    );
  });
}

function abortReason(signal: AbortSignal, job?: AbortSignal): Error {
  if (job?.aborted) return jobDeadlineError();
  return signal.reason instanceof Error ? signal.reason : jobDeadlineError();
}

export function delay(ms: number, extra?: AbortSignal): Promise<void> {
  const job = storage.getStore();
  const signal = extra ?? job;
  return new Promise((resolve, reject) => {
    if (!signal) {
      setTimeout(resolve, ms);
      return;
    }
    if (signal.aborted) {
      reject(abortReason(signal, job));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortReason(signal, job));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}
