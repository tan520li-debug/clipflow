import express from 'express';
import { Type } from '@google/genai';
import {
  generateTextContentWithFallback,
  getGeminiClient,
  getTtsModelCandidates,
  isQuotaExceededError,
  isServiceBusyError,
} from '../gemini.ts';
import { synthesizeStyledSpeech } from '../audio/synthesize.ts';
import { getWavDurationSec } from '../audio/wav.ts';
import { acceptJsonJob } from '../jobs/http.ts';

export function registerVoiceRoutes(app: express.Express) {
app.post('/api/generate-voiceover', acceptJsonJob('generate-voiceover', async (req, res) => {
  try {
    const {
      platform = 'douyin',
      voiceName = 'Kore',
      naturalMode = 'expressive',
      voicePersonaPrompt = '',
      styleHint = '',
      clonedVoice = null,
      cues = [],
    } = req.body ?? {};

    if (!Array.isArray(cues) || cues.length === 0) {
      return res.status(400).json({ error: '时间线暂无字幕或口播文案，无法生成 AI 配音。' });
    }

    const validVoices = new Set(['Kore', 'Zephyr', 'Puck', 'Charon', 'Fenrir']);
    const clonedBase =
      clonedVoice && typeof clonedVoice.baseVoice === 'string' && validVoices.has(clonedVoice.baseVoice)
        ? String(clonedVoice.baseVoice)
        : null;
    const safeVoice = clonedBase ?? (validVoices.has(String(voiceName)) ? String(voiceName) : 'Kore');
    const isExpressive = Boolean(clonedVoice) || naturalMode !== 'standard';
    const targetCues = cues
      .filter((c: { text?: string }) => typeof c?.text === 'string' && c.text.trim().length > 0)
      .slice(0, 10);

    if (targetCues.length === 0) {
      return res.status(400).json({ error: '口播字幕内容为空，请先补充文案。' });
    }

    const preferLiteTts = !isExpressive || targetCues.length > 2;

    const platformStyle =
      platform === 'douyin'
        ? 'Authentic, relatable real-person Simplified Chinese creator narration, conversational warmth, natural micro-pauses and subtle smile'
        : platform === 'tiktok'
          ? 'Upbeat, conversational, snappy TikTok real-creator narration with natural cadence'
          : 'Warm, articulate, engaging Reels storytelling host with human breath and emphasis';
    const expressiveness =
      clonedVoice && typeof clonedVoice.expressiveness === 'number'
        ? Math.max(0.2, Math.min(1, clonedVoice.expressiveness))
        : 0.75;
    const expressivenessDirective = clonedVoice
      ? expressiveness >= 0.8
        ? 'High emotional expressiveness, vivid vocal inflection, natural emphasis and warm breathy micro-pauses'
        : expressiveness >= 0.45
          ? 'Balanced natural conversational inflection, authentic moderate expressiveness and human warmth'
          : 'Calm, restrained, steady neutral-level delivery with minimal pitch swings and crisp articulation'
      : '';

    const combinedStyle = [
      clonedVoice?.voiceDesignPrompt || '',
      expressivenessDirective,
      platformStyle,
      voicePersonaPrompt,
      styleHint,
    ]
      .filter((s) => typeof s === 'string' && s.trim().length > 0)
      .join('. ');

    const ai = getGeminiClient();

    const results: Array<Record<string, unknown>> = [];
    for (let startIdx = 0; startIdx < targetCues.length; startIdx += 2) {
      const batch = targetCues.slice(startIdx, startIdx + 2);
      const batchResults = await Promise.all(
        batch.map(
          async (
            cue: {
              id?: string;
              subtitleId?: string;
              startTime?: number;
              duration?: number;
              text: string;
            },
            offset: number
          ) => {
            const idx = startIdx + offset;
            const rawText = cue.text.trim();
            const spokenText =
              isExpressive && expressiveness >= 0.4 && idx === 0 && rawText.length > 6
                ? `<breath> ${rawText}`
                : rawText;

            const inline = await synthesizeStyledSpeech(ai, {
              preferLite: preferLiteTts,
              voiceName: safeVoice,
              spokenText,
              stylePrompt: combinedStyle,
            });
            const audioBase64 = inline.data;
            if (!audioBase64) {
              throw new Error(`第 ${idx + 1} 句配音合成未返回音频数据，请重试。`);
            }

            const rate =
              typeof clonedVoice?.playbackRate === 'number' && clonedVoice.playbackRate > 0
                ? clonedVoice.playbackRate
                : 1.0;
            const wavDuration = getWavDurationSec(audioBase64);
            const fallbackDur = Math.max(0.8, Number(cue.duration) || 2.0);
            const rawAudioDur = wavDuration ?? fallbackDur;
            const effectiveDur = Number(Math.max(0.6, rawAudioDur / rate).toFixed(2));

            return {
              id: `vo-${Date.now()}-${idx}`,
              subtitleId: cue.subtitleId || cue.id,
              startTime: Number((Number(cue.startTime) || 0).toFixed(2)),
              duration: effectiveDur,
              audioDurationSec: rawAudioDur,
              text: rawText,
              audioBase64,
              mimeType: inline?.mimeType || 'audio/wav',
              voiceName: safeVoice,
              source: 'ai-tts',
              clonedVoiceId: clonedVoice?.id || undefined,
              clonedVoiceName: clonedVoice?.name || undefined,
              playbackRate: rate,
              eqLowGainDb:
                typeof clonedVoice?.eqLowGainDb === 'number' ? clonedVoice.eqLowGainDb : 0,
              eqMidGainDb:
                typeof clonedVoice?.eqMidGainDb === 'number' ? clonedVoice.eqMidGainDb : 0,
              eqHighGainDb:
                typeof clonedVoice?.eqHighGainDb === 'number' ? clonedVoice.eqHighGainDb : 0,
              modelUsed: inline.modelUsed,
            };
          }
        )
      );
      results.push(...batchResults);
    }

    const actualModelUsed = results[0]?.modelUsed || getTtsModelCandidates(preferLiteTts)[0];
    const sanitizedCues = results.map(({ modelUsed: _m, ...rest }) => rest);

    return res.json({
      voiceName: clonedVoice?.name || safeVoice,
      modelUsed: actualModelUsed,
      cues: sanitizedCues,
    });
  } catch (err: unknown) {
    console.error('[api/generate-voiceover] error:', err);
    if (isQuotaExceededError(err)) {
      return res.status(429).json({
        error:
          'AI 语音合成调用额度已达当前上限，请稍后再试，或使用「麦克风录自己声音 / 导入原声」完成配音。',
      });
    }
    if (isServiceBusyError(err)) {
      return res.status(503).json({
        error: 'AI 语音合成服务当前高峰拥挤，请几秒后重试，或使用「麦克风录自己声音」完成配音。',
      });
    }
    return res.status(500).json({ error: 'AI 配音合成失败，请稍后重试。' });
  }
}, (req) => {
  const { cues = [] } = req.body ?? {};
  if (!Array.isArray(cues) || cues.length === 0) {
    return { status: 400, body: { error: '时间线暂无字幕或口播文案，无法生成 AI 配音。' } };
  }
  const targetCues = cues
    .filter((c: { text?: string }) => typeof c?.text === 'string' && c.text.trim().length > 0)
    .slice(0, 10);
  if (targetCues.length === 0) {
    return { status: 400, body: { error: '口播字幕内容为空，请先补充文案。' } };
  }
  return null;
}));

app.post('/api/voice-clone/train', acceptJsonJob('voice-clone/train', async (req, res) => {
  try {
    const {
      voiceName = '我的专属音色',
      audioBase64,
      mimeType = 'audio/webm',
      durationSec = 30,
      previewSentence = '大家好，这是刚刚完成声纹建模的专属音色，现在听起来是不是很像我本人的说话风格？',
    } = req.body ?? {};

    if (!audioBase64 || typeof audioBase64 !== 'string' || audioBase64.length < 300) {
      return res.status(400).json({ error: '未检测到有效录音数据，请先通过麦克风录制朗读音频。' });
    }

    const ai = getGeminiClient();
    const cleanBase64 = audioBase64.includes(',') ? audioBase64.split(',')[1] : audioBase64;
    const safeMime =
      typeof mimeType === 'string' && mimeType.startsWith('audio/')
        ? mimeType.split(';')[0]
        : 'audio/webm';

    const analysisResp = await generateTextContentWithFallback(ai, {
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: safeMime,
              data: cleanBase64,
            },
          },
          {
            text: `Analyze this speaker's personal voice sample carefully across vocal pitch register, timbre warmth, breathiness, resonance, speaking rate, articulation habits, and emotional cadence.
Map the speaker to the closest foundational Gemini TTS voice actor among:
- "Kore": warm, expressive female or lighter mid-high conversational register
- "Zephyr": bright, agile, youthful neutral-light register
- "Puck": energetic, crisp, bouncy creator register
- "Charon": calm, grounded, steady storytelling mid-low register
- "Fenrir": deep, resonant, husky/magnetic low male register

Return structured voice modeling parameters so we can faithfully reproduce this speaker's personal cadence, vocal warmth, breathiness, and EQ contour using Voice Design TTS.`,
          },
        ],
      },
      config: {
        thinkingConfig: { thinkingLevel: 'LOW' },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            baseVoice: {
              type: Type.STRING,
              description: 'Best matching voice among Kore, Zephyr, Puck, Charon, Fenrir',
            },
            voiceDesignPrompt: {
              type: Type.STRING,
              description:
                'Detailed English Voice Design style instruction (35-65 words) describing exact pitch warmth, speaking pace, micro-pauses, breath texture, emphasis habits, and conversational persona.',
            },
            timbreSummary: {
              type: Type.STRING,
              description: 'Concise Simplified Chinese summary of the speaker vocal timbre and delivery (max 42 chars).',
            },
            speakingPace: {
              type: Type.STRING,
              description: 'Concise Simplified Chinese pace label, e.g. "中速自然 · 约4字/秒"',
            },
            vocalTags: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: '3 to 4 short Simplified Chinese tags (each 2-5 chars) describing vocal signature.',
            },
            playbackRate: {
              type: Type.NUMBER,
              description: 'Subtle speed match between 0.94 and 1.06 (1.0 is neutral).',
            },
            eqLowGainDb: {
              type: Type.NUMBER,
              description: 'Subtle low-warmth shelf calibration in dB between -3.5 and 3.5.',
            },
            eqHighGainDb: {
              type: Type.NUMBER,
              description: 'Subtle high-air brilliance calibration in dB between -3.5 and 3.5.',
            },
          },
        },
      },
    });

    const parsed = JSON.parse((analysisResp.text ?? '{}').trim());
    const validVoices = new Set(['Kore', 'Zephyr', 'Puck', 'Charon', 'Fenrir']);
    const baseVoice = validVoices.has(parsed?.baseVoice) ? parsed.baseVoice : 'Kore';
    const voiceDesignPrompt =
      typeof parsed?.voiceDesignPrompt === 'string' && parsed.voiceDesignPrompt.trim()
        ? parsed.voiceDesignPrompt.trim()
        : 'Natural, conversational personal creator voice with authentic breath, warm chest resonance, relaxed pacing, and subtle human micro-pauses.';

    const clamp = (v: unknown, min: number, max: number, fallback: number) => {
      const n = Number(v);
      return Number.isFinite(n) ? Number(Math.max(min, Math.min(max, n)).toFixed(2)) : fallback;
    };

    const playbackRate = clamp(parsed?.playbackRate, 0.94, 1.06, 1.0);
    const eqLowGainDb = clamp(parsed?.eqLowGainDb, -3.5, 3.5, 0.5);
    const eqHighGainDb = clamp(parsed?.eqHighGainDb, -3.5, 3.5, 0.5);

    const safePreviewText =
      typeof previewSentence === 'string' && previewSentence.trim()
        ? previewSentence.trim().slice(0, 140)
        : '大家好，这是我刚刚完成建模的个性化专属音色，以后每一条视频都能用这个声音自动口播。';

    const previewInline = await synthesizeStyledSpeech(ai, {
      voiceName: baseVoice,
      spokenText: `<breath> ${safePreviewText}`,
      stylePrompt: voiceDesignPrompt,
    });
    const samplePreviewBase64 = previewInline.data;

    const profile = {
      id: `clone-${Date.now()}`,
      name: String(voiceName || '我的专属音色').trim().slice(0, 24),
      createdAt: new Date().toISOString(),
      sampleDurationSec: Number(Math.max(1, Number(durationSec) || 30).toFixed(1)),
      baseVoice,
      voiceDesignPrompt,
      timbreSummary:
        typeof parsed?.timbreSummary === 'string' && parsed.timbreSummary.trim()
          ? parsed.timbreSummary.trim()
          : '自然松弛的真人对话音色，咬字清晰且带有真实呼吸留白',
      speakingPace:
        typeof parsed?.speakingPace === 'string' && parsed.speakingPace.trim()
          ? parsed.speakingPace.trim()
          : '自然中速',
      vocalTags:
        Array.isArray(parsed?.vocalTags) && parsed.vocalTags.length > 0
          ? parsed.vocalTags.slice(0, 4).map((t: unknown) => String(t))
          : ['真人呼吸感', '自然语态', '专属定制'],
      playbackRate,
      eqLowGainDb,
      eqMidGainDb: 0,
      eqHighGainDb,
      expressiveness: 0.75,
      samplePreviewBase64,
      samplePreviewMimeType: previewInline?.mimeType || 'audio/wav',
    };

    return res.json({ profile });
  } catch (err: unknown) {
    console.error('[api/voice-clone/train] error:', err);
    if (isQuotaExceededError(err)) {
      return res.status(429).json({
        error: 'AI 语音合成调用额度已达当前上限，请稍后再试或稍后重新生成试听样音。',
      });
    }
    return res.status(500).json({ error: 'AI 声音克隆建模失败，请稍后重试。' });
  }
}, (req) => {
  const { audioBase64 } = req.body ?? {};
  if (!audioBase64 || typeof audioBase64 !== 'string' || audioBase64.length < 300) {
    return { status: 400, body: { error: '未检测到有效录音数据，请先通过麦克风录制朗读音频。' } };
  }
  return null;
}));

app.post('/api/voice-clone/preview', acceptJsonJob('voice-clone/preview', async (req, res) => {
  try {
    const {
      baseVoice = 'Kore',
      voiceDesignPrompt = '',
      expressiveness = 0.75,
      text = '',
    } = req.body ?? {};

    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ error: '请输入要试听的测试文案。' });
    }

    const validVoices = new Set(['Kore', 'Zephyr', 'Puck', 'Charon', 'Fenrir']);
    const safeVoice = validVoices.has(String(baseVoice)) ? String(baseVoice) : 'Kore';
    const expVal = Math.max(0.2, Math.min(1, Number(expressiveness) || 0.75));
    const expDirective =
      expVal >= 0.8
        ? 'High emotional expressiveness, vivid vocal inflection, natural emphasis and warm breathy micro-pauses'
        : expVal >= 0.45
          ? 'Balanced natural conversational inflection, authentic moderate expressiveness and human warmth'
          : 'Calm, restrained, steady neutral-level delivery with minimal pitch swings and crisp articulation';

    const baseStyle =
      typeof voiceDesignPrompt === 'string' && voiceDesignPrompt.trim()
        ? voiceDesignPrompt.trim()
        : 'Natural, expressive personal voiceover with human warmth and micro-pauses';
    const ai = getGeminiClient();

    const inline = await synthesizeStyledSpeech(ai, {
      voiceName: safeVoice,
      spokenText: `${expVal >= 0.4 ? '<breath> ' : ''}${text.trim().slice(0, 160)}`,
      stylePrompt: `${baseStyle}. ${expDirective}`,
    });

    return res.json({
      audioBase64: inline.data,
      mimeType: inline.mimeType || 'audio/wav',
    });
  } catch (err: unknown) {
    console.error('[api/voice-clone/preview] error:', err);
    if (isQuotaExceededError(err)) {
      return res.status(429).json({
        error: 'AI 语音合成调用额度已达当前上限，您仍可拖动 EQ/语速滑块点击「试听 EQ 音效」本地即时试听。',
      });
    }
    if (isServiceBusyError(err)) {
      return res.status(503).json({
        error: 'AI 语音服务当前高峰拥挤，请几秒后重试，或先使用「试听 EQ 音效」本地预览。',
      });
    }
    return res.status(500).json({ error: '试听音频生成失败，请稍后重试。' });
  }
}, (req) => {
  const { text = '' } = req.body ?? {};
  if (!text || typeof text !== 'string' || !text.trim()) {
    return { status: 400, body: { error: '请输入要试听的测试文案。' } };
  }
  return null;
}));

app.post('/api/voiceover/analyze-noise', acceptJsonJob('voiceover/analyze-noise', async (req, res) => {
  try {
    const {
      audioBase64,
      mimeType = 'audio/wav',
      metrics = {},
      hasClonedVoice = false,
      clonedVoiceName = '',
    } = req.body ?? {};

    const safeNoiseFloor = Number.isFinite(Number(metrics?.noiseFloorDb))
      ? Number(metrics.noiseFloorDb)
      : -44;
    const safeSnr = Number.isFinite(Number(metrics?.snrDb)) ? Number(metrics.snrDb) : 24;
    const safeRumbleRatio = Number.isFinite(Number(metrics?.lowRumbleRatio))
      ? Number(metrics.lowRumbleRatio)
      : 0.12;
    const safeHissRatio = Number.isFinite(Number(metrics?.highHissRatio))
      ? Number(metrics.highHissRatio)
      : 0.08;
    const sourceLabel =
      typeof metrics?.sourceLabel === 'string' && metrics.sourceLabel.trim()
        ? metrics.sourceLabel.trim()
        : '配音音轨';

    const ai = getGeminiClient();
    const parts: Array<Record<string, unknown>> = [];

    if (typeof audioBase64 === 'string' && audioBase64.length > 300) {
      const cleanBase64 = audioBase64.includes(',') ? audioBase64.split(',')[1] : audioBase64;
      const safeMime =
        typeof mimeType === 'string' && mimeType.startsWith('audio/')
          ? mimeType.split(';')[0]
          : 'audio/wav';
      // Keep inline audio payload compact (~1.5MB max base64)
      if (cleanBase64.length < 2_000_000) {
        parts.push({
          inlineData: {
            mimeType: safeMime,
            data: cleanBase64,
          },
        });
      }
    }

    parts.push({
      text: `You are an audio mastering & broadcast vocal denoising engineer.
Analyze this voiceover audio track (${sourceLabel}${hasClonedVoice ? `, cloned voice: ${clonedVoiceName || 'Custom Clone'}` : ''}) and its measured acoustic telemetry:
- Measured ambient noise floor: ${safeNoiseFloor.toFixed(1)} dBFS
- Measured speech-to-noise ratio (SNR): ${safeSnr.toFixed(1)} dB
- Low-frequency (<160Hz) energy ratio: ${(safeRumbleRatio * 100).toFixed(1)}%
- High-frequency (>6kHz) hiss energy ratio: ${(safeHissRatio * 100).toFixed(1)}%

Identify ambient noises (e.g., room hum/AC rumble, microphone self-noise/hiss, breath/plosive mud, electrical buzz, or subtle synthesis floor) and output optimal Web Audio vocal denoising filter parameters so the cloned or recorded voice sounds studio-grade, clean, warm, and crisp.`,
    });

    const response = await generateTextContentWithFallback(ai, {
      contents: { parts: parts as never },
      config: {
        thinkingConfig: { thinkingLevel: 'LOW' },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            detectedNoiseTypes: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description:
                '2 to 4 concise Simplified Chinese tags describing detected ambient noise or room artifacts (each 3-10 chars).',
            },
            clarityScoreBefore: {
              type: Type.NUMBER,
              description: 'Current vocal clarity score 45-92 before denoising.',
            },
            clarityScoreAfter: {
              type: Type.NUMBER,
              description: 'Projected vocal clarity score 86-99 after applying the filter.',
            },
            highpassHz: {
              type: Type.NUMBER,
              description: 'High-pass rumble cut frequency in Hz (75 to 145).',
            },
            lowpassHz: {
              type: Type.NUMBER,
              description: 'Gentle high-frequency hiss rolloff in Hz (9000 to 14500).',
            },
            noiseGateDb: {
              type: Type.NUMBER,
              description: 'Adaptive noise gate threshold in dBFS (-56 to -30).',
            },
            presenceBoostDb: {
              type: Type.NUMBER,
              description: 'Vocal intelligibility boost around 2.9kHz in dB (0.8 to 3.6).',
            },
            recommendedStrength: {
              type: Type.NUMBER,
              description: 'Recommended overall denoise strength 0.45 to 0.95.',
            },
            summary: {
              type: Type.STRING,
              description:
                'Concise Simplified Chinese diagnosis & cleanup note (20-50 chars).',
            },
          },
        },
      },
    });

    const parsed = JSON.parse((response.text ?? '{}').trim());
    const clamp = (v: unknown, min: number, max: number, fallback: number) => {
      const n = Number(v);
      return Number.isFinite(n) ? Number(Math.max(min, Math.min(max, n)).toFixed(2)) : fallback;
    };

    const clarityBefore = Math.round(clamp(parsed?.clarityScoreBefore, 45, 92, safeSnr >= 28 ? 82 : 68));
    const clarityAfter = Math.round(
      clamp(parsed?.clarityScoreAfter, Math.max(clarityBefore + 4, 86), 99, Math.min(97, clarityBefore + 18))
    );

    const profile = {
      ambientNoiseLevelDb: Number(safeNoiseFloor.toFixed(1)),
      snrDb: Number(safeSnr.toFixed(1)),
      clarityScoreBefore: clarityBefore,
      clarityScoreAfter: clarityAfter,
      detectedNoiseTypes:
        Array.isArray(parsed?.detectedNoiseTypes) && parsed.detectedNoiseTypes.length > 0
          ? parsed.detectedNoiseTypes.slice(0, 4).map((t: unknown) => String(t))
          : ['环境底噪过滤', '低频嗡鸣切除', '人声高频提亮'],
      highpassHz: Math.round(clamp(parsed?.highpassHz, 75, 145, safeRumbleRatio > 0.2 ? 115 : 95)),
      lowpassHz: Math.round(clamp(parsed?.lowpassHz, 9000, 14500, safeHissRatio > 0.15 ? 10800 : 12800)),
      noiseGateDb: Math.round(clamp(parsed?.noiseGateDb, -56, -30, Math.min(-34, safeNoiseFloor + 6))),
      presenceBoostDb: clamp(parsed?.presenceBoostDb, 0.8, 3.6, 2.0),
      recommendedStrength: clamp(parsed?.recommendedStrength, 0.45, 0.95, safeSnr < 22 ? 0.82 : 0.68),
      summary:
        typeof parsed?.summary === 'string' && parsed.summary.trim()
          ? parsed.summary.trim()
          : '已识别配音轨环境底噪与低频嗡鸣，启用多段降噪门限与人声清晰度增强。',
      analyzedAt: new Date().toISOString(),
    };

    return res.json({ profile });
  } catch (err: unknown) {
    console.error('[api/voiceover/analyze-noise] error:', err);
    if (isQuotaExceededError(err)) {
      return res.status(429).json({
        error: 'AI 环境音诊断调用已达当前上限，请直接开启下方「AI 智能背景降噪」开关使用本地自适应滤波。',
      });
    }
    return res.status(500).json({ error: 'AI 环境音分析失败，请稍后重试。' });
  }
}));

app.post('/api/polish-brief', acceptJsonJob('polish-brief', async (req, res) => {
  try {
    const {
      brief = '',
      editingStyle = 'beat-sync',
      targetDuration = 15,
      targetPlatforms = ['douyin', 'tiktok', 'facebook'],
      toneGoal = 'viral-hook',
      mediaSummary = [],
    } = req.body ?? {};

    if (!brief || typeof brief !== 'string' || !brief.trim()) {
      return res.status(400).json({ error: '请先输入一段成片简述或主题，再进行 AI 脚本辅助润色。' });
    }

    const ai = getGeminiClient();
    const safeDuration = Math.max(8, Math.min(45, Number(targetDuration) || 15));
    const toneInstruction =
      toneGoal === 'storytelling'
        ? '沉浸故事感：强调生活氛围、感官细节与情绪递进，句式温暖有代入感'
        : toneGoal === 'conversion'
          ? '高转化种草：痛点引入 + 核心卖点反差对比 + 行动号召 CTA，节奏利落有说服力'
          : '强钩子高完播：前3秒反常识/强悬念开场，快节奏画面切换，短句爆点高密集输出';

    const mediaContext =
      Array.isArray(mediaSummary) && mediaSummary.length > 0
        ? mediaSummary
            .slice(0, 8)
            .map(
              (m: { name?: string; type?: string; duration?: number }, idx: number) =>
                `[${idx + 1}] ${m.name || '素材'} (${m.type || 'image'}, ${Number(m.duration || 5).toFixed(1)}s)`
            )
            .join(' | ')
        : '无额外指定素材，可自由安排镜头景别';

    const response = await generateTextContentWithFallback(ai, {
      contents: `Raw Creator Brief: "${brief.trim()}"
Editing Style: ${editingStyle}
Target Duration: ${safeDuration} seconds
Target Platforms: ${JSON.stringify(targetPlatforms)}
Rewrite Goal: ${toneInstruction}
Available Media Clips: ${mediaContext}

Rewrite and break down this brief into a high-retention short-video storyboard script in Simplified Chinese.
Requirements:
- Keep total shot durations aligned to ~${safeDuration}s across 3 to 5 distinct shots.
- Make "hookLine" an irresistible 1-sentence opening hook (under 22 Chinese chars).
- Each shot should specify shotNumber, durationRange (e.g. "0-3s"), visualCue (camera framing/action), and voiceoverLine (spoken caption line).
- Make "polishedBrief" a cohesive, ready-to-paste production brief combining the hook, shot-by-shot visual flow, and punchy copy cues so an auto-editor can cut directly from it (100-220 Chinese chars).`,
      config: {
        systemInstruction:
          'You are an elite Douyin/TikTok short-video scriptwriter and viral storyboard director. Always return crisp, natural Simplified Chinese storyboard JSON.',
        thinkingConfig: { thinkingLevel: 'LOW' },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            hookLine: {
              type: Type.STRING,
              description: 'Punchy 3-second opening hook line in Simplified Chinese.',
            },
            viralAngle: {
              type: Type.STRING,
              description: 'One concise sentence explaining why this rewrite boosts retention/engagement.',
            },
            shots: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  shotNumber: { type: Type.INTEGER },
                  durationRange: { type: Type.STRING },
                  visualCue: { type: Type.STRING },
                  voiceoverLine: { type: Type.STRING },
                },
                required: ['shotNumber', 'durationRange', 'visualCue', 'voiceoverLine'],
              },
            },
            polishedBrief: {
              type: Type.STRING,
              description:
                'Complete rewritten storyboard brief ready to replace the user brief input for auto-editing.',
            },
          },
          required: ['hookLine', 'viralAngle', 'shots', 'polishedBrief'],
        },
      },
    });

    const rawText = response.text?.trim();
    if (!rawText) {
      return res.status(502).json({ error: 'AI 脚本润色未返回内容，请重试。' });
    }
    const parsed = JSON.parse(rawText);
    return res.json(parsed);
  } catch (err: unknown) {
    console.error('[api/polish-brief] error:', err);
    if (isQuotaExceededError(err)) {
      return res.status(429).json({
        error: 'AI 脚本润色调用额度已达上限，请稍后再试。',
      });
    }
    return res.status(500).json({ error: 'AI 脚本辅助润色失败，请稍后重试。' });
  }
}, (req) => {
  const { brief = '' } = req.body ?? {};
  if (!brief || typeof brief !== 'string' || !brief.trim()) {
    return { status: 400, body: { error: '请先输入一段成片简述或主题，再进行 AI 脚本辅助润色。' } };
  }
  return null;
}));

app.post('/api/audio/copyright-scan', acceptJsonJob('audio/copyright-scan', async (req, res) => {
  try {
    const {
      platform = 'douyin',
      bgmPreset = 'upbeat-128',
      bpm = 120,
      customAudioName = '',
      sfxCount = 0,
      sfxNames = [],
    } = req.body ?? {};

    const validPresets = new Set([
      'upbeat-128',
      'tech-118',
      'fresh-112',
      'suspense-104',
      'lofi-95',
      'narrative-92',
    ]);
    const safePreset = validPresets.has(String(bgmPreset)) ? String(bgmPreset) : 'upbeat-128';
    const hasCustomAudio = typeof customAudioName === 'string' && customAudioName.trim().length > 0;
    const isMuted = bgmPreset === 'none' && !hasCustomAudio;
    const trackLabel = hasCustomAudio
      ? customAudioName.trim()
      : isMuted
        ? '无背景音乐（静音）'
        : `ClipFlow 内置原创合成音轨 (${safePreset}, ${bpm} BPM)`;

    const presetStyleDescriptions: Record<string, string> = {
      'upbeat-128': 'Upbeat Electronic Pop / Energetic Dance Beat ~128 BPM',
      'tech-118': 'Modern Tech / Urban Future Bass Groove ~118 BPM',
      'fresh-112': 'Fresh Acoustic Pluck / Cheerful Lifestyle Indie ~112 BPM',
      'suspense-104': 'Cinematic Suspense / Deep Pulse Tension ~104 BPM',
      'lofi-95': 'Warm Lo-Fi Chillhop / Relaxed Study Beats ~95 BPM',
      'narrative-92': 'Emotional Cinematic Piano & Strings ~92 BPM',
      none: 'Ambient / Lifestyle Background Music',
    };
    const styleDesc = presetStyleDescriptions[String(bgmPreset)] || presetStyleDescriptions['upbeat-128'];
    const safeSfxList = Array.isArray(sfxNames)
      ? sfxNames.slice(0, 8).map((s: unknown) => String(s)).join(', ')
      : '';

    const ai = getGeminiClient();

    const searchPrompt = `You are a music copyright compliance & Content ID specialist for short-video creators on Douyin (抖音), TikTok, and Facebook Reels.
Analyze the copyright risk of the creator's current audio tracks and search public royalty-free music databases (e.g., Pixabay Music, YouTube Audio Library, Free Music Archive / CC0, Mixkit, Jamendo, Freesound) to recommend 3 real royalty-free / copyright-safe alternative tracks in a similar style.

Current Project Audio Audit Input:
- Target Platform: ${platform}
- Active BGM Source: ${hasCustomAudio ? `User-uploaded external audio file "${customAudioName.trim()}"` : isMuted ? 'Muted (no BGM)' : `Built-in original WebAudio procedural synthesizer track (${safePreset}, ${bpm} BPM, ${styleDesc})`}
- Target Style / Tempo: ${styleDesc} (${bpm} BPM)
- Active Micro SFX (${Number(sfxCount) || 0} events): ${safeSfxList || 'Built-in procedural SFX (whoosh/ding/click)'}

Instructions:
1. If an external file ("${customAudioName.trim()}") is uploaded, search public databases / copyright info for that track title or filename to check if it matches a copyrighted commercial recording, cover, or unverified third-party MP3 (which risks Content ID / TikTok / Douyin / Meta mute or takedown). If it is built-in procedural synthesis, confirm zero copyright risk while still searching for 3 real royalty-free downloadable reference tracks of matching vibe.
2. Search and pick 3 real royalty-free / CC0 / commercially safe music tracks from Pixabay Music, Mixkit, Free Music Archive, or YouTube Audio Library that match "${styleDesc}".
3. Map each alternative to the closest studio safe preset among: "upbeat-128", "tech-118", "fresh-112", "suspense-104", "lofi-95", "narrative-92".

Output ONLY a single JSON object (no markdown commentary outside JSON) in Simplified Chinese for all descriptive text fields with this exact schema:
{
  "overallRisk": "low" | "medium" | "high",
  "riskHeadline": "string (concise 10-24 char Chinese summary)",
  "bgmAssessment": {
    "trackName": "string",
    "sourceKind": "builtin-synth" | "custom-upload" | "muted",
    "riskLevel": "low" | "medium" | "high",
    "platformWarnings": ["string"],
    "analysisNote": "string (concise 1-2 sentences in Simplified Chinese)"
  },
  "sfxAssessment": {
    "count": ${Number(sfxCount) || 0},
    "riskLevel": "low" | "medium" | "high",
    "note": "string (concise sentence in Simplified Chinese)"
  },
  "alternatives": [
    {
      "title": "Real royalty-free track title",
      "artistOrSource": "Artist / Library (e.g. Pixabay Music / YouTube Audio Library / Mixkit)",
      "licenseType": "e.g. CC0 无版权 / 免版税商用",
      "moodAndBpm": "e.g. 轻快电子 · 125 BPM",
      "recommendedPreset": "upbeat-128" | "tech-118" | "fresh-112" | "suspense-104" | "lofi-95" | "narrative-92",
      "recommendedBpm": 124,
      "reason": "1 sentence in Simplified Chinese explaining style fit & copyright safety",
      "referenceUrl": "https://..."
    }
  ]
}`;

    const response = await generateTextContentWithFallback(ai, {
      contents: searchPrompt,
      config: {
        tools: [{ googleSearch: {} }],
        thinkingConfig: { thinkingLevel: 'LOW' },
      },
    });

    const rawText = (response.text ?? '').trim();
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    let parsed: Record<string, unknown> = {};
    if (jsonMatch) {
      try {
        parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
      } catch {
        parsed = {};
      }
    }

    const groundingChunks =
      response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
    const groundingSources: Array<{ title: string; uri: string }> = [];
    const seenUris = new Set<string>();
    for (const chunk of groundingChunks) {
      const web = (chunk as { web?: { uri?: string; title?: string } })?.web;
      if (web?.uri && !seenUris.has(web.uri)) {
        seenUris.add(web.uri);
        groundingSources.push({
          title: web.title || web.uri,
          uri: web.uri,
        });
      }
    }

    const validRisks = new Set(['low', 'medium', 'high']);
    const defaultRisk = hasCustomAudio ? 'high' : 'low';
    const overallRisk = validRisks.has(String(parsed?.overallRisk))
      ? String(parsed.overallRisk)
      : defaultRisk;

    const rawBgm = (parsed?.bgmAssessment as Record<string, unknown>) || {};
    const bgmRisk = validRisks.has(String(rawBgm?.riskLevel))
      ? String(rawBgm.riskLevel)
      : defaultRisk;

    const rawSfx = (parsed?.sfxAssessment as Record<string, unknown>) || {};
    const sfxRisk = validRisks.has(String(rawSfx?.riskLevel)) ? String(rawSfx.riskLevel) : 'low';

    const rawAlts = Array.isArray(parsed?.alternatives) ? parsed.alternatives : [];
    const alternatives = rawAlts
      .slice(0, 4)
      .map((item: unknown) => {
        const alt = (item as Record<string, unknown>) || {};
        const preset = validPresets.has(String(alt.recommendedPreset))
          ? String(alt.recommendedPreset)
          : safePreset;
        return {
          title:
            typeof alt.title === 'string' && alt.title.trim()
              ? alt.title.trim()
              : 'Upbeat Creator Groove (Royalty-Free)',
          artistOrSource:
            typeof alt.artistOrSource === 'string' && alt.artistOrSource.trim()
              ? alt.artistOrSource.trim()
              : 'Pixabay / Studio 免版税曲库',
          licenseType:
            typeof alt.licenseType === 'string' && alt.licenseType.trim()
              ? alt.licenseType.trim()
              : 'CC0 / 商用免版税',
          moodAndBpm:
            typeof alt.moodAndBpm === 'string' && alt.moodAndBpm.trim()
              ? alt.moodAndBpm.trim()
              : `${bpm} BPM · 同风格匹配`,
          recommendedPreset: preset,
          recommendedBpm: Math.max(80, Math.min(145, Math.round(Number(alt.recommendedBpm) || bpm))),
          reason:
            typeof alt.reason === 'string' && alt.reason.trim()
              ? alt.reason.trim()
              : '支持抖音、TikTok 与 Facebook Reels 全平台商业发布与变现。',
          referenceUrl:
            typeof alt.referenceUrl === 'string' && alt.referenceUrl.startsWith('http')
              ? alt.referenceUrl
              : undefined,
        };
      });

    if (alternatives.length === 0) {
      alternatives.push({
        title: 'Studio Original Procedural Beat',
        artistOrSource: 'ClipFlow 原创无版权合成引擎',
        licenseType: '100% 原创免版税',
        moodAndBpm: `${styleDesc}`,
        recommendedPreset: safePreset,
        recommendedBpm: Math.max(80, Math.min(145, Math.round(Number(bpm) || 120))),
        reason: '实时程序化波形合成，绝不触发任何平台指纹库版权索赔。',
        referenceUrl: undefined,
      });
    }

    return res.json({
      overallRisk,
      riskHeadline:
        typeof parsed?.riskHeadline === 'string' && parsed.riskHeadline.trim()
          ? parsed.riskHeadline.trim()
          : hasCustomAudio
            ? '检测到外部本地音频：存在版权指纹识别风险'
            : '当前内置配乐与音效均为 100% 无版权安全音频',
      bgmAssessment: {
        trackName:
          typeof rawBgm?.trackName === 'string' && rawBgm.trackName.trim()
            ? rawBgm.trackName.trim()
            : trackLabel,
        sourceKind: hasCustomAudio ? 'custom-upload' : isMuted ? 'muted' : 'builtin-synth',
        riskLevel: bgmRisk,
        platformWarnings:
          Array.isArray(rawBgm?.platformWarnings) && rawBgm.platformWarnings.length > 0
            ? rawBgm.platformWarnings.slice(0, 3).map((w: unknown) => String(w))
            : hasCustomAudio
              ? [
                  '外部本地音乐未附带商用授权证明，发布至 TikTok / Meta Reels 可能触发 Content ID 消音或下架',
                  '建议替换为下方同风格无版权音乐或内置原创节奏音轨',
                ]
              : ['内置程序化合成音轨在抖音、TikTok 与 Facebook Reels 均无版权争议风险'],
        analysisNote:
          typeof rawBgm?.analysisNote === 'string' && rawBgm.analysisNote.trim()
            ? rawBgm.analysisNote.trim()
            : hasCustomAudio
              ? `当前使用外部音频「${customAudioName.trim()}」，未经平台商用曲库授权时易被音频指纹系统拦截。`
              : '当前配乐由 Web Audio 实时合成生成，不依赖受版权保护的母带录音文件，可放心商用。',
      },
      sfxAssessment: {
        count: Number(sfxCount) || 0,
        riskLevel: sfxRisk,
        note:
          typeof rawSfx?.note === 'string' && rawSfx.note.trim()
            ? rawSfx.note.trim()
            : Number(sfxCount) > 0
              ? `${Number(sfxCount)} 处时间线微音效均为纯算法合成，无外部采样版权风险。`
              : '当前未插入外部采样音效，无额外版权风险。',
      },
      alternatives,
      groundingSources: groundingSources.slice(0, 5),
      scannedAt: new Date().toISOString(),
    });
  } catch (err: unknown) {
    console.error('[api/audio/copyright-scan] error:', err);
    if (isQuotaExceededError(err)) {
      return res.status(429).json({
        error: 'AI 版权库检索调用额度已达当前上限，请稍后再试。',
      });
    }
    return res.status(500).json({ error: 'AI 版权风险扫描失败，请稍后重试。' });
  }
}));
}
