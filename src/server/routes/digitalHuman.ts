import express from 'express';
import { Type } from '@google/genai';
import {
  estimateSpeechDurationSec,
  splitSpeechScriptIntoSegments,
} from '../../domain/speech/index.ts';
import { synthesizeStyledSpeech } from '../audio/synthesize.ts';
import {
  concatenateWavBase64Segments,
  extractWavMelPhonemeAlignment,
  getWavDurationSec,
} from '../audio/wav.ts';
import {
  generateTextContentWithFallback,
  getGeminiClient,
  isQuotaExceededError,
  isServiceBusyError,
} from '../gemini.ts';
import { acceptJsonJob } from '../jobs/http.ts';

export function registerDigitalHumanRoutes(app: express.Express) {
app.post('/api/digital-human/clone', acceptJsonJob('digital-human/clone', async (req, res) => {
  try {
    const {
      anchorName = '我的虚拟主播',
      imageBase64 = '',
      imageMimeType = 'image/jpeg',
      audioBase64 = '',
      audioMimeType = 'audio/webm',
      styleHint = '',
      generateGreeting = false,
    } = req.body ?? {};

    const cleanImg =
      typeof imageBase64 === 'string' && imageBase64.length > 100
        ? imageBase64.includes(',')
          ? imageBase64.split(',')[1]
          : imageBase64
        : '';
    const cleanAudio =
      typeof audioBase64 === 'string' && audioBase64.length > 200
        ? audioBase64.includes(',')
          ? audioBase64.split(',')[1]
          : audioBase64
        : '';

    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
    if (cleanImg) {
      parts.push({
        inlineData: {
          mimeType:
            typeof imageMimeType === 'string' && imageMimeType.startsWith('image/')
              ? imageMimeType
              : 'image/jpeg',
          data: cleanImg,
        },
      });
    }
    if (cleanAudio) {
      parts.push({
        inlineData: {
          mimeType:
            typeof audioMimeType === 'string' && audioMimeType.startsWith('audio/')
              ? audioMimeType.split(';')[0]
              : 'audio/webm',
          data: cleanAudio,
        },
      });
    }

    parts.push({
      text: `You are a virtual digital human cloning & short-video anchor director.
Analyze the provided visual appearance (if image supplied), voice sample (if audio supplied), and creator hints to build a consistent digital human anchor persona.
Anchor Name: "${String(anchorName).trim()}"
Creator Style Hint: "${String(styleHint || '').trim() || '自然真实短视频口播虚拟主播'}"

Map the persona to the best matching foundational TTS voice among:
- "Kore": warm, expressive female or lighter mid-high conversational register
- "Zephyr": bright, agile, youthful neutral-light register
- "Puck": energetic, crisp, bouncy creator register
- "Charon": calm, grounded, steady storytelling mid-low register
- "Fenrir": deep, resonant, husky/magnetic low male register

Return JSON describing the cloned virtual anchor persona, 3 concise Simplified Chinese style tags, English Voice Design prompt, studio accent hex color, and a catchy 1-sentence Chinese greeting line.`,
    });

    const ai = getGeminiClient();
    const response = await generateTextContentWithFallback(ai, {
      contents: { parts: parts as never },
      config: {
        thinkingConfig: { thinkingLevel: 'LOW' },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            personaSummary: {
              type: Type.STRING,
              description: 'Concise Simplified Chinese anchor profile summary (max 45 chars).',
            },
            anchorStyleTags: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: '3 short Chinese tags (each 2-5 chars).',
            },
            recommendedBaseVoice: {
              type: Type.STRING,
              description: 'One of Kore, Zephyr, Puck, Charon, Fenrir.',
            },
            voiceDesignPrompt: {
              type: Type.STRING,
              description: 'English TTS voice design style prompt (30-55 words).',
            },
            accentColor: {
              type: Type.STRING,
              description: 'Hex color matching studio lighting/outfit, e.g. #fb7185 or #38bdf8.',
            },
            recommendedSampleLine: {
              type: Type.STRING,
              description: 'Short welcoming Chinese anchor intro sentence (14-32 chars).',
            },
          },
        },
      },
    });

    const parsed = JSON.parse((response.text ?? '{}').trim()) as Record<string, unknown>;
    const validVoices = new Set(['Kore', 'Zephyr', 'Puck', 'Charon', 'Fenrir']);
    const baseVoice = validVoices.has(String(parsed?.recommendedBaseVoice))
      ? String(parsed.recommendedBaseVoice)
      : 'Kore';
    const voiceDesignPrompt =
      typeof parsed?.voiceDesignPrompt === 'string' && parsed.voiceDesignPrompt.trim()
        ? parsed.voiceDesignPrompt.trim()
        : 'Natural, engaging short-video digital human anchor with warm conversational cadence and clear studio articulation.';
    const sampleLine =
      typeof parsed?.recommendedSampleLine === 'string' && parsed.recommendedSampleLine.trim()
        ? parsed.recommendedSampleLine.trim()
        : `大家好，我是虚拟主播${String(anchorName).trim()}，今天带大家一起看重点！`;

    let sampleAudioBase64: string | undefined;
    let sampleAudioMimeType: string | undefined;
    let sampleAudioDurationSec: number | undefined;

    if (generateGreeting && !cleanAudio) {
      try {
        const inline = await synthesizeStyledSpeech(ai, {
          voiceName: baseVoice,
          spokenText: `<breath> ${sampleLine}`,
          stylePrompt: voiceDesignPrompt,
        });
        sampleAudioBase64 = inline.data;
        sampleAudioMimeType = inline.mimeType || 'audio/wav';
        sampleAudioDurationSec = getWavDurationSec(inline.data) ?? undefined;
      } catch {
        // Non-fatal: anchor clone still completes cleanly even if TTS greeting quota is limited
      }
    }

    const accentRaw = typeof parsed?.accentColor === 'string' ? parsed.accentColor.trim() : '';
    const accentColor = /^#[0-9a-fA-F]{6}$/.test(accentRaw) ? accentRaw : '#fb7185';

    return res.json({
      personaSummary:
        typeof parsed?.personaSummary === 'string' && parsed.personaSummary.trim()
          ? parsed.personaSummary.trim()
          : '真实质感短视频虚拟主播分身，镜头表现力稳定自然',
      anchorStyleTags:
        Array.isArray(parsed?.anchorStyleTags) && parsed.anchorStyleTags.length > 0
          ? parsed.anchorStyleTags.slice(0, 3).map((t: unknown) => String(t))
          : ['虚拟分身', '自然口播', '混剪适配'],
      baseVoice,
      voiceDesignPrompt,
      accentColor,
      recommendedSampleLine: sampleLine,
      sampleAudioBase64,
      sampleAudioMimeType,
      sampleAudioDurationSec,
    });
  } catch (err: unknown) {
    console.error('[api/digital-human/clone] error:', err);
    if (isQuotaExceededError(err)) {
      return res.status(429).json({
        error: 'AI 形象分析调用额度已达当前上限，请稍后再试。',
      });
    }
    return res.status(500).json({ error: '虚拟主播克隆分析失败，请稍后重试。' });
  }
}));

app.post('/api/digital-human/drive', acceptJsonJob('digital-human/drive', async (req, res) => {
  try {
    const {
      anchorName = '虚拟主播',
      scriptText = '',
      baseVoice = 'Kore',
      voiceDesignPrompt = '',
      expressiveness = 0.78,
      phonemeAlignmentEnabled = true,
      phonemeKeyframeOffsetMs = -12,
      phonemeOnsetAdvanceMs = 20,
    } = req.body ?? {};

    if (!scriptText || typeof scriptText !== 'string' || !scriptText.trim()) {
      return res.status(400).json({ error: '请输入数字人口播台词内容。' });
    }

    const cleanScript = scriptText.trim();
    const segments = splitSpeechScriptIntoSegments(cleanScript, 160);
    if (segments.length === 0) {
      return res.status(400).json({ error: '请输入有效的数字人口播台词内容。' });
    }
    if (segments.length > 12) {
      return res.status(400).json({
        error: `单次台词过长（当前约拆分为 ${segments.length} 段），请精简至 12 段（约 1900 字）以内再合成。`,
      });
    }

    const validVoices = new Set(['Kore', 'Zephyr', 'Puck', 'Charon', 'Fenrir']);
    const safeVoice = validVoices.has(String(baseVoice)) ? String(baseVoice) : 'Kore';
    const expVal = Math.max(0.2, Math.min(1, Number(expressiveness) || 0.78));
    const expDirective =
      expVal >= 0.78
        ? 'Vivid short-video host delivery with warm breathing, natural emphasis, and engaging camera presence'
        : 'Balanced, clear, friendly studio presenter cadence';

    const stylePrompt = `${
      typeof voiceDesignPrompt === 'string' && voiceDesignPrompt.trim()
        ? voiceDesignPrompt.trim()
        : `Virtual presenter ${String(anchorName).trim()} speaking smoothly to camera.`
    }. ${expDirective}`;

    const ai = getGeminiClient();
    const synthesizedSegments: Array<{ data: string; mimeType: string }> = [];

    for (let i = 0; i < segments.length; i++) {
      const segText = segments[i];
      const spokenText = i === 0 ? `<breath> ${segText}` : segText;
      const inline = await synthesizeStyledSpeech(ai, {
        preferLite: segments.length > 2,
        voiceName: safeVoice,
        spokenText,
        stylePrompt,
      });
      if (!inline?.data) {
        throw new Error(`Segment ${i + 1} returned empty audio`);
      }
      synthesizedSegments.push({
        data: inline.data,
        mimeType: inline.mimeType || 'audio/wav',
      });
    }

    const stitched = concatenateWavBase64Segments(synthesizedSegments, 120);
    const estimatedDurationSec = estimateSpeechDurationSec(cleanScript);
    const phonemeAlignment =
      phonemeAlignmentEnabled !== false
        ? extractWavMelPhonemeAlignment(stitched.audioBase64, {
            enabled: true,
            keyframeOffsetMs: Number(phonemeKeyframeOffsetMs ?? -12),
            onsetAdvanceMs: Number(phonemeOnsetAdvanceMs ?? 20),
          })
        : undefined;

    return res.json({
      audioBase64: stitched.audioBase64,
      mimeType: stitched.mimeType || 'audio/wav',
      audioDurationSec: stitched.durationSec ?? estimatedDurationSec,
      estimatedDurationSec,
      segmentCount: segments.length,
      phonemeAlignment,
    });
  } catch (err: unknown) {
    console.error('[api/digital-human/drive] error:', err);
    if (isQuotaExceededError(err)) {
      return res.status(429).json({
        error: 'AI 语音驱动调用额度已达当前上限，您可直接使用下方「麦克风录制原声 / 导入音频」实时驱动数字人。',
      });
    }
    if (isServiceBusyError(err)) {
      return res.status(503).json({
        error: 'AI 语音合成服务高峰拥挤，请稍后重试或使用麦克风直录驱动。',
      });
    }
    return res.status(500).json({ error: '数字人语音驱动合成失败，请稍后重试。' });
  }
}, (req) => {
  const { scriptText = '' } = req.body ?? {};
  if (!scriptText || typeof scriptText !== 'string' || !scriptText.trim()) {
    return { status: 400, body: { error: '请输入数字人口播台词内容。' } };
  }
  const segments = splitSpeechScriptIntoSegments(scriptText.trim(), 160);
  if (segments.length === 0) {
    return { status: 400, body: { error: '请输入有效的数字人口播台词内容。' } };
  }
  if (segments.length > 12) {
    return {
      status: 400,
      body: {
        error: `单次台词过长（当前约拆分为 ${segments.length} 段），请精简至 12 段（约 1900 字）以内再合成。`,
      },
    };
  }
  return null;
}));

app.post('/api/digital-human/analyze-emotion', acceptJsonJob('digital-human/analyze-emotion', async (req, res) => {
  try {
    const {
      audioBase64,
      mimeType = 'audio/wav',
      scriptText = '',
      prosodyMetrics,
      anchorName = '虚拟主播',
    } = req.body ?? {};

    const cleanAudio =
      typeof audioBase64 === 'string' && audioBase64.trim()
        ? audioBase64.includes(',')
          ? audioBase64.split(',')[1]
          : audioBase64.trim()
        : '';

    const hasScript = typeof scriptText === 'string' && scriptText.trim().length > 0;
    if (!cleanAudio && !hasScript) {
      return res.status(400).json({ error: '请先录制、导入或合成一段语音（或输入口播台词）后再进行情感匹配分析。' });
    }

    const ai = getGeminiClient();
    const parts: Array<Record<string, unknown>> = [];

    if (cleanAudio) {
      parts.push({
        inlineData: {
          mimeType: typeof mimeType === 'string' && mimeType ? mimeType : 'audio/wav',
          data: cleanAudio,
        },
      });
    }

    const metricsSummary = prosodyMetrics
      ? `声学语调指标: RMS能量=${prosodyMetrics.energyRms ?? 'N/A'}, 音高方差=${prosodyMetrics.pitchVariance ?? 'N/A'}, 音节爆发率=${prosodyMetrics.tempoBurstRate ?? 'N/A'}/s, 停顿比=${prosodyMetrics.pauseRatio ?? 'N/A'}`
      : '';

    parts.push({
      text: `你是一名数字人面部绑定与语音情感驱动专家。请结合提供的人声语调音频（若有）与台词文本，分析说话人的情感基调，并为数字人「${String(anchorName).trim()}」匹配最契合的面部肌肉驱动参数。
可选情感分类 emotion 仅限：
- "excited"（兴奋：高亢热情、种草爆点、积极感染力）
- "serious"（严肃：权威评测、冷静剖析、警示对比）
- "suspense"（悬疑：压低或挑起尾音、留白停顿、揭秘反转）
- "warm"（亲和：温柔分享、日常陪伴、轻松对话）
- "neutral"（自然：平稳标准口播）

口播台词：${hasScript ? String(scriptText).trim().slice(0, 300) : '（未提供文字，请直接根据音频语调判断）'}
${metricsSummary}

请返回 JSON，确保面部肌肉参数严格处于指定范围：
- jawOpenness: 0.5 ~ 1.6（张口幅度，兴奋偏大 1.25-1.5，严肃偏克制 0.8-0.95）
- browLift: -1.0 ~ 1.0（眉弓抬升：正值挑眉兴奋/惊奇，负值沉眉严肃）
- eyeSquint: 0.0 ~ 1.0（眼神聚焦微眯程度，悬疑/严肃偏高 0.45-0.8）
- smileCurve: -0.6 ~ 1.0（嘴角上扬/收敛弧度，兴奋/亲和正值，严肃/悬疑负值）
- headTension: 0.4 ~ 1.5（头部运动张力与节奏速度）
- lipSyncSharpness: 0.6 ~ 1.6（唇肌咬字开合锐度）
- toneSummary: 一句 25-55 字的中文语调分析与肌肉微调说明。`,
    });

    const response = await generateTextContentWithFallback(ai, {
      contents: [{ role: 'user', parts: parts as never }],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            emotion: { type: Type.STRING },
            emotionLabel: { type: Type.STRING },
            confidence: { type: Type.NUMBER },
            toneSummary: { type: Type.STRING },
            muscles: {
              type: Type.OBJECT,
              properties: {
                jawOpenness: { type: Type.NUMBER },
                browLift: { type: Type.NUMBER },
                eyeSquint: { type: Type.NUMBER },
                smileCurve: { type: Type.NUMBER },
                headTension: { type: Type.NUMBER },
                lipSyncSharpness: { type: Type.NUMBER },
              },
            },
          },
          required: ['emotion', 'emotionLabel', 'toneSummary', 'muscles'],
        },
      },
    });

    let parsed: Record<string, unknown> = {};
    try {
      const rawJson = (response.text || '{}')
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/, '');
      parsed = JSON.parse(rawJson) as Record<string, unknown>;
    } catch {
      const jsonMatch = (response.text || '').match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
        } catch {
          parsed = {};
        }
      }
    }
    const validEmotions = new Set(['neutral', 'excited', 'serious', 'suspense', 'warm']);
    const rawEmotion = String(parsed?.emotion || 'neutral');
    const emotion = validEmotions.has(rawEmotion) ? rawEmotion : 'neutral';

    const labelMap: Record<string, string> = {
      excited: '兴奋',
      serious: '严肃',
      suspense: '悬疑',
      warm: '亲和',
      neutral: '自然',
    };

    const rawMuscles = (parsed?.muscles ?? {}) as Record<string, unknown>;
    const clampNum = (val: unknown, min: number, max: number, fallback: number) => {
      const num = typeof val === 'number' && Number.isFinite(val) ? val : Number(val);
      if (!Number.isFinite(num)) return fallback;
      return Number(Math.max(min, Math.min(max, num)).toFixed(2));
    };

    return res.json({
      emotion,
      emotionLabel:
        typeof parsed?.emotionLabel === 'string' && parsed.emotionLabel.trim()
          ? parsed.emotionLabel.trim()
          : labelMap[emotion],
      confidence: clampNum(parsed?.confidence, 0.5, 0.99, 0.88),
      toneSummary:
        typeof parsed?.toneSummary === 'string' && parsed.toneSummary.trim()
          ? parsed.toneSummary.trim()
          : '已完成音频语调分析，并同步校准数字人面部肌肉驱动参数。',
      muscles: {
        jawOpenness: clampNum(rawMuscles.jawOpenness, 0.5, 1.6, 1.05),
        browLift: clampNum(rawMuscles.browLift, -1.0, 1.0, 0),
        eyeSquint: clampNum(rawMuscles.eyeSquint, 0.0, 1.0, 0.25),
        smileCurve: clampNum(rawMuscles.smileCurve, -0.6, 1.0, 0.2),
        headTension: clampNum(rawMuscles.headTension, 0.4, 1.5, 1.0),
        lipSyncSharpness: clampNum(rawMuscles.lipSyncSharpness, 0.6, 1.6, 1.05),
      },
      analyzedAt: new Date().toISOString(),
    });
  } catch (err: unknown) {
    console.error('[api/digital-human/analyze-emotion] error:', err);
    if (isQuotaExceededError(err)) {
      return res.status(429).json({
        error: 'AI 情感分析调用额度已达当前上限，已使用本地声学语调分析引擎匹配面部肌肉参数。',
      });
    }
    return res.status(500).json({ error: '音频情感匹配分析失败，请稍后重试。' });
  }
}, (req) => {
  const { audioBase64, scriptText = '' } = req.body ?? {};
  const cleanAudio =
    typeof audioBase64 === 'string' && audioBase64.trim()
      ? audioBase64.includes(',')
        ? audioBase64.split(',')[1]
        : audioBase64.trim()
      : '';
  const hasScript = typeof scriptText === 'string' && scriptText.trim().length > 0;
  if (!cleanAudio && !hasScript) {
    return {
      status: 400,
      body: { error: '请先录制、导入或合成一段语音（或输入口播台词）后再进行情感匹配分析。' },
    };
  }
  return null;
}));

app.post('/api/digital-human/suggest-actions', acceptJsonJob('digital-human/suggest-actions', async (req, res) => {
  try {
    const {
      brief = '',
      scriptText = '',
      platform = 'douyin',
      selectedClipId = '',
      clips = [],
      subtitles = [],
    } = req.body ?? {};

    const cleanBrief = typeof brief === 'string' ? brief.trim() : '';
    const cleanScript = typeof scriptText === 'string' ? scriptText.trim() : '';
    const safeClips = Array.isArray(clips) ? clips.slice(0, 20) : [];
    const safeSubs = Array.isArray(subtitles) ? subtitles.slice(0, 40) : [];

    if (!cleanBrief && !cleanScript && safeClips.length === 0 && safeSubs.length === 0) {
      return res.status(400).json({
        error: '请先输入创意脚本、字幕文案或时间线分镜片段后再分析动作建议。',
      });
    }

    const validActions = new Set(['explain', 'point', 'wave', 'amaze', 'nod', 'thumbs-up']);
    const intensityDefaults: Record<string, number> = {
      explain: 1.0,
      point: 1.15,
      wave: 1.1,
      amaze: 1.25,
      nod: 0.95,
      'thumbs-up': 1.15,
    };

    const clipsPrompt = safeClips
      .map(
        (
          c: {
            id?: string;
            label?: string;
            duration?: number;
            hookTag?: string;
            subtitleText?: string;
          },
          idx: number
        ) =>
          `[${idx + 1}] id=${c.id || `clip-${idx}`} 名称="${c.label || '片段'}" 时长=${Number(c.duration || 3).toFixed(1)}s 标签="${c.hookTag || '无'}" 台词="${(c.subtitleText || '').slice(0, 80)}"${c.id === selectedClipId ? ' (当前选中镜头)' : ''}`
      )
      .join('\n');

    const subsPrompt = safeSubs
      .map(
        (s: { startTime?: number; text?: string }) =>
          `${Number(s.startTime || 0).toFixed(1)}s: ${(s.text || '').slice(0, 80)}`
      )
      .join('\n');

    const ai = getGeminiClient();
    const requestPayload = {
      contents: `你是一位资深的短视频数字人导演与肢体动作编排师。请深度分析以下视频脚本、字幕台词和分镜结构，为当前编辑语境及每个分镜自动推荐最契合的数字人动作姿态。

可选动作 ID 严格限定为以下 6 种：
- "explain"（讲解）：干货科普、原理拆解、条理化阐述
- "point"（指引）：引导观众看实拍画面、产品细节、步骤演示、屏幕对比
- "wave"（挥手）：开场问候、3秒吸睛打招呼、告别互动
- "amaze"（惊叹）：高潮爆点、数据反转、惊艳揭秘、强感叹句瞬间
- "nod"（点头）：口碑背书、实测肯定、理性认同、阶段小结
- "thumbs-up"（点赞）：片尾转化、号召关注点赞、强烈推荐入手

目标平台：${String(platform)}
创意脚本简述：${cleanBrief || '（未填写）'}
数字人口播台词：${cleanScript || '（未单独填写）'}

时间线分镜片段：
${clipsPrompt || '（暂无分镜列表）'}

时间轴字幕台词：
${subsPrompt || '（暂无字幕）'}

请返回 JSON：
- primaryAction: 当前最优先推荐的动作 ID（若选中了特定镜头，优先匹配该镜头语境；否则结合口播台词与全局剧本高潮/讲解节奏）。
- secondaryAction: 备选动作 ID（不能与 primaryAction 相同）。
- contextStage: 4~8字中文语境阶段标签，例如 "细节讲解"、"高潮爆点"、"开场招呼"、"干货阐述"、"片尾号召"、"观点认同"。
- confidence: 0.72 ~ 0.99 推荐置信度。
- reason: 30~65字中文理由，明确说明为什么该脚本语境适合此动作。
- clipSuggestions: 针对上述时间线分镜片段的逐镜动作推荐数组，每项包含 clipId, clipLabel, contextStage, recommendedAction, recommendedIntensity (0.8~1.35), reason (20字以内简明理由)。`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            primaryAction: { type: Type.STRING },
            secondaryAction: { type: Type.STRING },
            contextStage: { type: Type.STRING },
            confidence: { type: Type.NUMBER },
            reason: { type: Type.STRING },
            clipSuggestions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  clipId: { type: Type.STRING },
                  clipLabel: { type: Type.STRING },
                  contextStage: { type: Type.STRING },
                  recommendedAction: { type: Type.STRING },
                  recommendedIntensity: { type: Type.NUMBER },
                  reason: { type: Type.STRING },
                },
                required: ['clipId', 'recommendedAction', 'contextStage', 'reason'],
              },
            },
          },
          required: ['primaryAction', 'contextStage', 'reason', 'clipSuggestions'],
        },
      },
    };

    const response = await generateTextContentWithFallback(ai, requestPayload);

    let parsed: Record<string, unknown> = {};
    try {
      const rawJson = (response.text || '{}')
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/, '');
      parsed = JSON.parse(rawJson) as Record<string, unknown>;
    } catch {
      const jsonMatch = (response.text || '').match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
        } catch {
          parsed = {};
        }
      }
    }

    const rawPrimary = String(parsed?.primaryAction || 'explain');
    const primaryAction = validActions.has(rawPrimary) ? rawPrimary : 'explain';
    const rawSecondary = String(parsed?.secondaryAction || '');
    const secondaryAction =
      validActions.has(rawSecondary) && rawSecondary !== primaryAction ? rawSecondary : undefined;

    const rawClipSuggestions = Array.isArray(parsed?.clipSuggestions) ? parsed.clipSuggestions : [];
    const clipSuggestions = rawClipSuggestions.map((item: Record<string, unknown>, idx: number) => {
      const rawAct = String(item?.recommendedAction || primaryAction);
      const act = validActions.has(rawAct) ? rawAct : primaryAction;
      const inten = Number(item?.recommendedIntensity);
      return {
        clipId: String(item?.clipId || safeClips[idx]?.id || `clip-${idx}`),
        clipLabel: String(item?.clipLabel || safeClips[idx]?.label || `片段 ${idx + 1}`),
        contextStage: String(item?.contextStage || '语境匹配'),
        recommendedAction: act,
        recommendedIntensity:
          Number.isFinite(inten) && inten >= 0.6 && inten <= 1.4
            ? Number(inten.toFixed(2))
            : intensityDefaults[act] ?? 1.0,
        reason: String(item?.reason || '契合当前镜头口播语境与画面节奏。'),
      };
    });

    const confNum = Number(parsed?.confidence);
    return res.json({
      primaryAction,
      secondaryAction,
      contextStage:
        typeof parsed?.contextStage === 'string' && parsed.contextStage.trim()
          ? parsed.contextStage.trim()
          : '语境匹配',
      confidence:
        Number.isFinite(confNum) && confNum >= 0.5 && confNum <= 0.99
          ? Number(confNum.toFixed(2))
          : 0.91,
      reason:
        typeof parsed?.reason === 'string' && parsed.reason.trim()
          ? parsed.reason.trim()
          : '已结合当前视频脚本语义与分镜节奏推荐最契合的数字人动作姿态。',
      clipSuggestions,
      source: 'ai',
      analyzedAt: new Date().toISOString(),
    });
  } catch (err: unknown) {
    console.error('[api/digital-human/suggest-actions] error:', err);
    if (isQuotaExceededError(err)) {
      return res.status(429).json({
        error: 'AI 动作推荐调用额度已达上限，已自动切换为本地脚本语境实时分析推荐。',
      });
    }
    if (isServiceBusyError(err)) {
      return res.status(503).json({
        error: 'AI 模型当前处于请求高峰，已自动切换为本地脚本语境实时分析并高亮推荐动作。',
      });
    }
    return res.status(500).json({ error: '自动动作建议分析失败，请稍后重试。' });
  }
}, (req) => {
  const { brief = '', scriptText = '', clips = [], subtitles = [] } = req.body ?? {};
  const cleanBrief = typeof brief === 'string' ? brief.trim() : '';
  const cleanScript = typeof scriptText === 'string' ? scriptText.trim() : '';
  const safeClips = Array.isArray(clips) ? clips.slice(0, 20) : [];
  const safeSubs = Array.isArray(subtitles) ? subtitles.slice(0, 40) : [];
  if (!cleanBrief && !cleanScript && safeClips.length === 0 && safeSubs.length === 0) {
    return {
      status: 400,
      body: { error: '请先输入创意脚本、字幕文案或时间线分镜片段后再分析动作建议。' },
    };
  }
  return null;
}));

app.post('/api/digital-human/multilingual-dub', acceptJsonJob('digital-human/multilingual-dub', async (req, res) => {
  try {
    const {
      anchorName = '虚拟主播',
      sourceScript = '',
      preTranslatedScript = '',
      targetLanguage = 'en-US',
      baseVoice = 'Kore',
      voiceDesignPrompt = '',
      clonedVoice = null,
      referenceAudioBase64,
      referenceAudioMimeType = 'audio/wav',
      expressiveness = 0.78,
      platform = 'douyin',
      phonemeAlignmentEnabled = true,
      phonemeKeyframeOffsetMs = -12,
      phonemeOnsetAdvanceMs = 20,
    } = req.body ?? {};

    const cleanSource = typeof sourceScript === 'string' ? sourceScript.trim() : '';
    const cleanPreTranslated =
      typeof preTranslatedScript === 'string' ? preTranslatedScript.trim() : '';

    if (!cleanSource && !cleanPreTranslated) {
      return res.status(400).json({
        error: '请先输入或导入现有数字人语音脚本后再进行多语言语音合成。',
      });
    }

    const langConfigMap: Record<
      string,
      { label: string; nativeName: string; ttsDirective: string }
    > = {
      'zh-CN': {
        label: '中文',
        nativeName: 'Mandarin Chinese (简体中文)',
        ttsDirective: 'Speak fluent, natural Mandarin Chinese',
      },
      'en-US': {
        label: '英语',
        nativeName: 'American English',
        ttsDirective: 'Speak fluent, idiomatic American English',
      },
      'ja-JP': {
        label: '日语',
        nativeName: 'Japanese (日本語)',
        ttsDirective: 'Speak fluent, natural Tokyo Japanese',
      },
      'ko-KR': {
        label: '韩语',
        nativeName: 'Korean (한국어)',
        ttsDirective: 'Speak fluent, natural Seoul Korean',
      },
      'es-ES': {
        label: '西班牙语',
        nativeName: 'Spanish (Español)',
        ttsDirective: 'Speak fluent, natural neutral Spanish',
      },
      'fr-FR': {
        label: '法语',
        nativeName: 'French (Français)',
        ttsDirective: 'Speak fluent, natural Parisian French',
      },
      'de-DE': {
        label: '德语',
        nativeName: 'German (Deutsch)',
        ttsDirective: 'Speak fluent, natural standard German',
      },
      'pt-BR': {
        label: '葡萄牙语',
        nativeName: 'Portuguese (Português)',
        ttsDirective: 'Speak fluent, natural Brazilian Portuguese',
      },
      'ar-SA': {
        label: '阿拉伯语',
        nativeName: 'Arabic (العربية)',
        ttsDirective: 'Speak fluent, natural Modern Standard Arabic',
      },
    };

    const safeLang = Object.prototype.hasOwnProperty.call(langConfigMap, String(targetLanguage))
      ? String(targetLanguage)
      : 'en-US';
    const langMeta = langConfigMap[safeLang];

    const validVoices = new Set(['Kore', 'Zephyr', 'Puck', 'Charon', 'Fenrir']);
    const clonedBaseVoice =
      clonedVoice &&
      typeof clonedVoice === 'object' &&
      typeof (clonedVoice as { baseVoice?: unknown }).baseVoice === 'string' &&
      validVoices.has(String((clonedVoice as { baseVoice?: unknown }).baseVoice))
        ? String((clonedVoice as { baseVoice?: unknown }).baseVoice)
        : null;
    const fallbackVoice = clonedBaseVoice ?? (validVoices.has(String(baseVoice)) ? String(baseVoice) : 'Kore');

    const cleanAudio =
      typeof referenceAudioBase64 === 'string' && referenceAudioBase64.trim()
        ? referenceAudioBase64.includes(',')
          ? referenceAudioBase64.split(',')[1]
          : referenceAudioBase64.trim()
        : '';

    const clonedObj =
      clonedVoice && typeof clonedVoice === 'object'
        ? (clonedVoice as Record<string, unknown>)
        : null;
    const vocalPersonaParts = [
      typeof voiceDesignPrompt === 'string' ? voiceDesignPrompt.trim() : '',
      typeof clonedObj?.voiceDesignPrompt === 'string' ? clonedObj.voiceDesignPrompt.trim() : '',
      typeof clonedObj?.timbreSummary === 'string' ? `Timbre: ${clonedObj.timbreSummary.trim()}` : '',
      typeof clonedObj?.speakingPace === 'string' ? `Pace: ${clonedObj.speakingPace.trim()}` : '',
    ].filter(Boolean);

    const ai = getGeminiClient();

    const parts: Array<Record<string, unknown>> = [];
    if (cleanAudio) {
      parts.push({
        inlineData: {
          mimeType:
            typeof referenceAudioMimeType === 'string' && referenceAudioMimeType
              ? referenceAudioMimeType
              : 'audio/wav',
          data: cleanAudio,
        },
      });
    }

    parts.push({
      text: `你是一位专业的多语言短视频配音导演与 AI 声线克隆工程专家。
你的任务是将数字人主播「${String(anchorName).trim()}」现有的语音脚本准确翻译并口语化本地化为目标语种「${langMeta.label} (${langMeta.nativeName})」，同时深度提取并保留原主播的声线特征用于跨语种配音克隆。

现有语音脚本：
"${(cleanSource || cleanPreTranslated).slice(0, 320)}"
${cleanPreTranslated ? `\n用户已手工微调的目标译文（请以该译文语意为准保持自然口播节奏）：\n"${cleanPreTranslated.slice(0, 320)}"` : ''}

原主播已知声纹设定：
- 平台风格：${String(platform)}
- 基底声线参考：${fallbackVoice}
- 音色描述：${vocalPersonaParts.join(' | ') || '自然亲和的短视频口播主播声线'}
${cleanAudio ? '- 已附带原主播真实人声参考音频，请仔细听辨音频中的嗓音质感、音高明亮度、共鸣厚重度、语速习惯与气息感，将其精准编码进目标语种的声线克隆风格指令中。' : ''}

请返回严格 JSON：
1. translatedScript: ${cleanPreTranslated ? '对用户提供的目标译文做极轻微标点呼吸感优化（保持原译文核心措辞不变）' : `将现有脚本翻译为地道、有短视频口播感染力的「${langMeta.nativeName}」口播词`}，控制时长与原脚本节奏基本一致（不超过 250 字符）。不要输出括号注解。
2. recommendedBaseVoice: 从 ["Kore", "Zephyr", "Puck", "Charon", "Fenrir"] 中选择最贴合原主播音色性别与共鸣的一枚（若无音频参考可沿用 "${fallbackVoice}"）。
3. clonedVoiceStylePrompt: 用英文写一段 25~50 词的 TTS 声线克隆指导（直接描述嗓音音色、音域、气息、咬字锐度、语速节奏与跨语种发音要求，供 TTS 引擎复刻原声线特征）。
4. voiceCloneSummary: 用 20~48 字中文简明总结本次跨语种声线克隆保留了主播哪些声音特征（例如："完整保留温暖明快的中高频女声质感与轻快呼吸停顿节奏，无缝迁移至英语口播"）。`,
    });

    const translationPayload = {
      contents: [{ role: 'user', parts: parts as never }],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            translatedScript: { type: Type.STRING },
            recommendedBaseVoice: { type: Type.STRING },
            clonedVoiceStylePrompt: { type: Type.STRING },
            voiceCloneSummary: { type: Type.STRING },
          },
          required: [
            'translatedScript',
            'recommendedBaseVoice',
            'clonedVoiceStylePrompt',
            'voiceCloneSummary',
          ],
        },
      },
    };

    const translationResp = await generateTextContentWithFallback(ai, translationPayload);

    let parsed: Record<string, unknown> = {};
    try {
      const rawJson = (translationResp.text || '{}')
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/, '');
      parsed = JSON.parse(rawJson) as Record<string, unknown>;
    } catch {
      const jsonMatch = (translationResp.text || '').match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
        } catch {
          parsed = {};
        }
      }
    }

    const translatedScript = cleanPreTranslated
      ? cleanPreTranslated
      : typeof parsed?.translatedScript === 'string' && parsed.translatedScript.trim()
        ? parsed.translatedScript.trim()
        : cleanSource;

    const candidateVoice = String(parsed?.recommendedBaseVoice || '');
    const usedVoice =
      clonedBaseVoice ??
      (validVoices.has(candidateVoice) ? candidateVoice : fallbackVoice);

    const expVal = Math.max(0.2, Math.min(1, Number(expressiveness) || 0.78));
    const expDirective =
      expVal >= 0.78
        ? 'expressive short-video creator cadence with natural breathing and engaging emphasis'
        : 'clear, balanced presenter delivery';

    const extractedStyle =
      typeof parsed?.clonedVoiceStylePrompt === 'string' && parsed.clonedVoiceStylePrompt.trim()
        ? parsed.clonedVoiceStylePrompt.trim()
        : vocalPersonaParts[0] || `Preserve ${String(anchorName).trim()} vocal timbre and pacing`;

    const clonedStylePrompt = `${langMeta.ttsDirective}. ${extractedStyle}. ${expDirective}`.slice(
      0,
      260
    );

    const inline = await synthesizeStyledSpeech(ai, {
      voiceName: usedVoice,
      spokenText: `<breath> ${translatedScript.slice(0, 260)}`,
      stylePrompt: clonedStylePrompt,
    });

    const durationSec = getWavDurationSec(inline.data);
    const phonemeAlignment =
      phonemeAlignmentEnabled !== false
        ? extractWavMelPhonemeAlignment(inline.data, {
            enabled: true,
            keyframeOffsetMs: Number(phonemeKeyframeOffsetMs ?? -12),
            onsetAdvanceMs: Number(phonemeOnsetAdvanceMs ?? 20),
          })
        : undefined;
    const voiceCloneSummary =
      typeof parsed?.voiceCloneSummary === 'string' && parsed.voiceCloneSummary.trim()
        ? parsed.voiceCloneSummary.trim()
        : `已提取「${String(anchorName).trim()}」原声线音色与语速节奏特征，克隆合成地道${langMeta.label}配音。`;

    return res.json({
      sourceScript: cleanSource || cleanPreTranslated,
      translatedScript,
      targetLanguage: safeLang,
      targetLanguageLabel: langMeta.label,
      voiceCloneSummary,
      baseVoice: usedVoice,
      clonedStylePrompt,
      audioBase64: inline.data,
      mimeType: inline.mimeType || 'audio/wav',
      audioDurationSec:
        durationSec ?? Number(Math.max(2, translatedScript.length * 0.14).toFixed(2)),
      modelUsed: inline.modelUsed,
      phonemeAlignment,
    });
  } catch (err: unknown) {
    console.error('[api/digital-human/multilingual-dub] error:', err);
    if (isQuotaExceededError(err)) {
      return res.status(429).json({
        error: 'AI 多语言声线合成调用额度已达当前上限，请稍后再试。',
      });
    }
    if (isServiceBusyError(err)) {
      return res.status(503).json({
        error: 'AI 翻译或语音合成服务高峰拥挤，请稍后重试。',
      });
    }
    return res.status(500).json({ error: '多语言语音合成失败，请稍后重试。' });
  }
}, (req) => {
  const { sourceScript = '', preTranslatedScript = '' } = req.body ?? {};
  const cleanSource = typeof sourceScript === 'string' ? sourceScript.trim() : '';
  const cleanPreTranslated =
    typeof preTranslatedScript === 'string' ? preTranslatedScript.trim() : '';
  if (!cleanSource && !cleanPreTranslated) {
    return {
      status: 400,
      body: { error: '请先输入或导入现有数字人语音脚本后再进行多语言语音合成。' },
    };
  }
  return null;
}));

app.post('/api/digital-human/reply', acceptJsonJob('digital-human/reply', async (req, res) => {
  try {
    const { anchorName = '虚拟主播', personaSummary = '', userLine = '', history = [] } = req.body ?? {};
    const line = typeof userLine === 'string' ? userLine.trim() : '';
    const turns = Array.isArray(history)
      ? history
          .filter(
            (turn: { role?: unknown; text?: unknown }) =>
              (turn?.role === 'user' || turn?.role === 'anchor') &&
              typeof turn.text === 'string' &&
              turn.text.trim(),
          )
          .slice(-8)
          .map((turn: { role: string; text: string }) => `${turn.role === 'user' ? '观众' : '主播'}：${turn.text.trim()}`)
          .join('\n')
      : '';
    const ai = getGeminiClient();
    const response = await generateTextContentWithFallback(ai, {
      contents: {
        parts: [
          {
            text: `你是短视频虚拟主播「${String(anchorName).trim() || '虚拟主播'}」。人设：${String(personaSummary).trim() || '亲切、清楚、适合口播'}。
用一句到三句口语中文回答观众，适合直接念出来。不要标题，不要表情符号，不要提你是模型。
已有对话：
${turns || '（还没有）'}
观众刚说：${line}`,
          },
        ],
      },
      config: {
        thinkingConfig: { thinkingLevel: 'LOW' },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            reply: { type: Type.STRING, description: 'Spoken Simplified Chinese reply, 12-80 characters.' },
          },
        },
      },
    });
    const parsed = JSON.parse((response.text ?? '{}').trim()) as { reply?: unknown };
    const reply = typeof parsed.reply === 'string' ? parsed.reply.trim() : '';
    if (!reply) {
      return res.status(502).json({ error: '主播这次没有答上话，请再试一次。' });
    }
    return res.json({ reply });
  } catch (err: unknown) {
    console.error('[api/digital-human/reply] error:', err);
    if (isQuotaExceededError(err)) {
      return res.status(429).json({ error: '对话额度已用完，请稍后再试。' });
    }
    if (isServiceBusyError(err)) {
      return res.status(503).json({ error: '对话服务正忙，请稍后重试。' });
    }
    return res.status(500).json({ error: '主播回答失败，请稍后重试。' });
  }
}, (req) => {
  const line = typeof req.body?.userLine === 'string' ? req.body.userLine.trim() : '';
  if (!line) return { status: 400, body: { error: '请先输入要对主播说的话。' } };
  if (line.length > 500) return { status: 400, body: { error: '这句话太长了，请缩到 500 字以内。' } };
  return null;
}));
}
