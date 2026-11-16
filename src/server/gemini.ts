import { GoogleGenAI } from '@google/genai';
import { ProxyAgent, fetch as undiciFetch, type RequestInit as UndiciRequestInit } from 'undici';

const PUBLIC_STABLE_TEXT_MODELS = ['gemini-3.1-flash-lite', 'gemini-3.8-flash'] as const;
const PUBLIC_STABLE_TTS_MODELS = ['gemini-2.5-flash-preview-tts', 'gemini-3.8-flash-lite-tts'] as const;
const PUBLIC_STABLE_TRANSCRIBE_MODELS = [
  'gemini-3.5-transcribe',
  'gemini-3.8-flash',
  'gemini-3.1-flash-lite',
] as const;

function buildModelCandidates(
  envValue: string | undefined,
  fallbacks: readonly string[]
): string[] {
  const list: string[] = [];
  const primary = (envValue || '').trim();
  if (primary) list.push(primary);
  for (const fb of fallbacks) {
    if (fb && !list.includes(fb)) list.push(fb);
  }
  return list;
}

function getTextModelCandidates(): string[] {
  return buildModelCandidates(process.env.GEMINI_TEXT_MODEL, PUBLIC_STABLE_TEXT_MODELS);
}

export function getTtsModelCandidates(preferLite = false): string[] {
  const base = buildModelCandidates(process.env.GEMINI_TTS_MODEL, PUBLIC_STABLE_TTS_MODELS);
  if (preferLite && !(process.env.GEMINI_TTS_MODEL || '').trim()) {
    return ['gemini-3.8-flash-lite-tts', ...base.filter((m) => m !== 'gemini-3.8-flash-lite-tts')];
  }
  return base;
}

export function getTranscribeModelCandidates(): string[] {
  return buildModelCandidates(
    process.env.GEMINI_TRANSCRIBE_MODEL || process.env.GEMINI_TEXT_MODEL,
    PUBLIC_STABLE_TRANSCRIBE_MODELS
  );
}

export function isQuotaExceededError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('429') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('Quota exceeded') ||
    msg.includes('rate-limit')
  );
}

export function isServiceBusyError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('high demand');
}

function adaptConfigForModel(
  modelName: string,
  config?: Record<string, unknown>
): Record<string, unknown> | undefined {
  if (!config) return undefined;
  const supportsThinkingLevel = /^gemini-[34]/.test(modelName);
  if (supportsThinkingLevel || !('thinkingConfig' in config)) {
    return config;
  }
  const { thinkingConfig: _removed, ...rest } = config;
  return rest;
}

export async function generateTextContentWithFallback(
  ai: GoogleGenAI,
  params: {
    contents: unknown;
    config?: Record<string, unknown>;
  },
  candidates?: string[]
) {
  const modelsToTry = candidates && candidates.length > 0 ? candidates : getTextModelCandidates();
  let lastErr: unknown = null;

  for (let idx = 0; idx < modelsToTry.length; idx++) {
    const currentModel = modelsToTry[idx];
    const adaptedConfig = adaptConfigForModel(currentModel, params.config);
    try {
      return await ai.models.generateContent({
        model: currentModel,
        contents: params.contents as never,
        ...(adaptedConfig ? { config: adaptedConfig as never } : {}),
      });
    } catch (err: unknown) {
      lastErr = err;
      if (isServiceBusyError(err)) {
        await new Promise((r) => setTimeout(r, 500));
        try {
          return await ai.models.generateContent({
            model: currentModel,
            contents: params.contents as never,
            ...(adaptedConfig ? { config: adaptedConfig as never } : {}),
          });
        } catch (retryErr: unknown) {
          lastErr = retryErr;
        }
      }
      if (idx < modelsToTry.length - 1) {
        console.warn(
          `[gemini-text] model "${currentModel}" failed; falling back to "${modelsToTry[idx + 1]}"`
        );
      }
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error('Text model invocation failed');
}

function envProxy(): string {
  return (
    process.env.HTTPS_PROXY ||
    process.env.HTTP_PROXY ||
    process.env.https_proxy ||
    process.env.http_proxy ||
    ''
  ).trim();
}

let proxyFetchUrl = '';
let proxyFetchImpl: typeof fetch | undefined;

function fetchThroughProxy(proxy: string): typeof fetch {
  if (proxyFetchImpl && proxyFetchUrl === proxy) return proxyFetchImpl;
  const dispatcher = new ProxyAgent(proxy);
  proxyFetchUrl = proxy;
  proxyFetchImpl = ((input: Parameters<typeof undiciFetch>[0], init?: UndiciRequestInit) =>
    undiciFetch(input, {
      ...init,
      dispatcher,
    })) as typeof fetch;
  return proxyFetchImpl;
}

export function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in environment secrets.');
  }
  const proxy = envProxy();
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      apiVersion: 'v1beta',
      headers: {
        'User-Agent': 'aistudio-build',
      },
      ...(proxy ? { fetch: fetchThroughProxy(proxy) } : {}),
    },
  });
}
