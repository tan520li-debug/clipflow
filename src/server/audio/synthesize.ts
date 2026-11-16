import { type GoogleGenAI } from '@google/genai';
import {
  getTtsModelCandidates,
  isQuotaExceededError,
  isServiceBusyError,
} from '../gemini.ts';
import { stripScriptTags } from './wav.ts';

const ttsModelQuotaCooldownUntil = new Map<string, number>();

export async function synthesizeStyledSpeech(
  ai: GoogleGenAI,
  opts: {
    preferLite?: boolean;
    voiceName: string;
    spokenText: string;
    stylePrompt?: string;
  }
) {
  const { preferLite = false, voiceName, spokenText, stylePrompt } = opts;
  const cleanStyle = (stylePrompt || '').trim();

  const rawCandidates = getTtsModelCandidates(preferLite);
  const now = Date.now();
  const activeCandidates = rawCandidates.filter(
    (m) => (ttsModelQuotaCooldownUntil.get(m) ?? 0) <= now
  );
  const modelsToTry = activeCandidates.length > 0 ? activeCandidates : rawCandidates;

  let lastErr: unknown = null;

  for (let mIdx = 0; mIdx < modelsToTry.length; mIdx++) {
    const currentModel = modelsToTry[mIdx];
    const supportsRichSpeechTags = currentModel.includes('3.8-flash-tts');
    const modelText = supportsRichSpeechTags ? spokenText : stripScriptTags(spokenText);

    const buildFallbackPrompt = (includeVoiceHint: boolean) => {
      const hints = [
        includeVoiceHint ? `Voice persona: ${voiceName}` : '',
        cleanStyle ? cleanStyle.slice(0, 220) : '',
      ]
        .filter(Boolean)
        .join('. ');
      return hints ? `Say in this style (${hints}): ${modelText}` : modelText;
    };

    const attempts: Array<{
      parts: Array<Record<string, unknown>>;
      includeSpeechConfig: boolean;
    }> = [
      {
        parts: [
          cleanStyle && supportsRichSpeechTags
            ? { text: modelText, speechMetadata: { style: cleanStyle } }
            : { text: buildFallbackPrompt(false) },
        ],
        includeSpeechConfig: true,
      },
      {
        parts: [{ text: buildFallbackPrompt(false) }],
        includeSpeechConfig: true,
      },
      {
        parts: [{ text: buildFallbackPrompt(true) }],
        includeSpeechConfig: false,
      },
    ];

    for (const attempt of attempts) {
      try {
        const response = await ai.models.generateContent({
          model: currentModel,
          contents: [{ role: 'user', parts: attempt.parts as never }],
          config: {
            responseModalities: ['AUDIO'],
            ...(attempt.includeSpeechConfig
              ? {
                  speechConfig: {
                    voiceConfig: {
                      prebuiltVoiceConfig: { voiceName },
                    },
                  },
                }
              : {}),
          },
        });
        const inline = response.candidates?.[0]?.content?.parts?.[0]?.inlineData;
        if (inline?.data) {
          return {
            data: inline.data,
            mimeType: inline.mimeType || 'audio/wav',
            modelUsed: currentModel,
          };
        }
      } catch (err: unknown) {
        lastErr = err;
        const msg = err instanceof Error ? err.message : String(err);
        if (isQuotaExceededError(err)) {
          const isDailyLimit = msg.includes('PerDay') || msg.includes('per day');
          if (isDailyLimit) {
            ttsModelQuotaCooldownUntil.set(currentModel, Date.now() + 15 * 60 * 1000);
          }
          break;
        }
        if (isServiceBusyError(err)) {
          await new Promise((r) => setTimeout(r, 700));
          try {
            const retryResp = await ai.models.generateContent({
              model: currentModel,
              contents: [{ role: 'user', parts: attempt.parts as never }],
              config: {
                responseModalities: ['AUDIO'],
                ...(attempt.includeSpeechConfig
                  ? {
                      speechConfig: {
                        voiceConfig: {
                          prebuiltVoiceConfig: { voiceName },
                        },
                      },
                    }
                  : {}),
              },
            });
            const retryInline = retryResp.candidates?.[0]?.content?.parts?.[0]?.inlineData;
            if (retryInline?.data) {
              return {
                data: retryInline.data,
                mimeType: retryInline.mimeType || 'audio/wav',
                modelUsed: currentModel,
              };
            }
          } catch (retryErr: unknown) {
            lastErr = retryErr;
          }
          break;
        }
        const isSchemaMismatch =
          msg.includes('speechMetadata') ||
          msg.includes('speechConfig') ||
          msg.includes('Unknown name');
        if (!isSchemaMismatch) {
          // Move to next fallback TTS model instead of aborting early
          break;
        }
      }
    }

    if (mIdx < modelsToTry.length - 1) {
      console.warn(
        `[gemini-tts] model "${currentModel}" failed; falling back to "${modelsToTry[mIdx + 1]}"`
      );
    }
  }

  throw lastErr instanceof Error
    ? lastErr
    : new Error('TTS 合成未返回音频数据，请稍后重试。');
}
