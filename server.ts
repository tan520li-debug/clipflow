import 'dotenv/config';
import crypto from 'crypto';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import { extractMelPhonemeAlignmentFromPcm } from './src/utils/digitalHumanAssets.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.set('trust proxy', 1);
app.use(express.json({ limit: '16mb' }));

// ============================================================================
// Configurable Gemini Models & Public Stable Fallback Chains
// ============================================================================
const PUBLIC_STABLE_TEXT_MODELS = ['gemini-2.5-flash', 'gemini-3.1-flash-lite'] as const;
const PUBLIC_STABLE_TTS_MODELS = ['gemini-2.5-flash-preview-tts', 'gemini-3.8-flash-lite-tts'] as const;
const PUBLIC_STABLE_TRANSCRIBE_MODELS = [
  'gemini-3.5-transcribe',
  'gemini-2.5-flash',
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

function getTtsModelCandidates(preferLite = false): string[] {
  const base = buildModelCandidates(process.env.GEMINI_TTS_MODEL, PUBLIC_STABLE_TTS_MODELS);
  if (preferLite && !(process.env.GEMINI_TTS_MODEL || '').trim()) {
    return ['gemini-3.8-flash-lite-tts', ...base.filter((m) => m !== 'gemini-3.8-flash-lite-tts')];
  }
  return base;
}

function getTranscribeModelCandidates(): string[] {
  return buildModelCandidates(
    process.env.GEMINI_TRANSCRIBE_MODEL || process.env.GEMINI_TEXT_MODEL,
    PUBLIC_STABLE_TRANSCRIBE_MODELS
  );
}

function isQuotaExceededError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('429') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('Quota exceeded') ||
    msg.includes('rate-limit')
  );
}

function isServiceBusyError(err: unknown): boolean {
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

async function generateTextContentWithFallback(
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

// ============================================================================
// API Authentication & Per-IP Rate Limiting Middleware
// ============================================================================
function timingSafeStringEqual(a: string, b: string): boolean {
  const hashA = crypto.createHash('sha256').update(a, 'utf8').digest();
  const hashB = crypto.createHash('sha256').update(b, 'utf8').digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

function apiAuthMiddleware(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  if (req.path === '/health' || req.path === '/health/') {
    return next();
  }

  const rawHeader = req.headers['x-clipflow-token'];
  const providedToken = Array.isArray(rawHeader)
    ? String(rawHeader[0] ?? '').trim()
    : typeof rawHeader === 'string'
      ? rawHeader.trim()
      : '';

  if (!providedToken) {
    return res.status(401).json({
      error: '未提供访问令牌，请在请求头中携带 x-clipflow-token。',
    });
  }

  const expectedToken = (process.env.ADMIN_ACCESS_TOKEN || '').trim();
  if (!expectedToken || !timingSafeStringEqual(providedToken, expectedToken)) {
    return res.status(401).json({
      error: '访问令牌无效或未配置，无权访问接口。',
    });
  }

  return next();
}

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const STANDARD_RATE_LIMIT_PER_MIN = 20;
const STRICT_RATE_LIMIT_PER_MIN = 3;

const STRICT_RATE_LIMIT_PATHS = new Set([
  '/generate-voiceover',
  '/voice-clone/train',
  '/voice-clone/preview',
  '/digital-human/clone',
  '/digital-human/drive',
  '/digital-human/multilingual-dub',
]);

const ipRateLimitBuckets = new Map<string, number[]>();

function getNormalizedClientIp(req: express.Request): string {
  const raw = req.ip || req.socket.remoteAddress || 'unknown';
  return raw.startsWith('::ffff:') ? raw.slice(7) : raw;
}

function apiRateLimitMiddleware(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  if (req.path === '/health' || req.path === '/health/') {
    return next();
  }

  const normalizedPath = req.path.replace(/\/+$/, '') || '/';
  const isStrictTier = STRICT_RATE_LIMIT_PATHS.has(normalizedPath);
  const limit = isStrictTier ? STRICT_RATE_LIMIT_PER_MIN : STANDARD_RATE_LIMIT_PER_MIN;
  const tierKey = isStrictTier ? 'strict' : 'standard';
  const clientIp = getNormalizedClientIp(req);
  const bucketKey = `${tierKey}:${clientIp}`;

  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  const existing = ipRateLimitBuckets.get(bucketKey) || [];
  const recent = existing.filter((ts) => ts > cutoff);

  if (recent.length >= limit) {
    const oldestTs = recent[0] ?? now;
    const retryAfterSec = Math.max(1, Math.ceil((oldestTs + RATE_LIMIT_WINDOW_MS - now) / 1000));
    res.setHeader('Retry-After', String(retryAfterSec));
    res.setHeader('X-RateLimit-Limit', String(limit));
    res.setHeader('X-RateLimit-Remaining', '0');
    res.setHeader('X-RateLimit-Reset', String(Math.ceil((oldestTs + RATE_LIMIT_WINDOW_MS) / 1000)));
    ipRateLimitBuckets.set(bucketKey, recent);
    return res.status(429).json({
      error: isStrictTier
        ? '语音合成与数字人克隆/驱动接口调用过于频繁（每分钟最多 3 次），请稍后再试。'
        : '接口请求过于频繁（普通接口每分钟最多 20 次），请稍后再试。',
    });
  }

  recent.push(now);
  ipRateLimitBuckets.set(bucketKey, recent);

  if (ipRateLimitBuckets.size > 2000) {
    for (const [key, timestamps] of ipRateLimitBuckets.entries()) {
      const active = timestamps.filter((ts) => ts > cutoff);
      if (active.length === 0) {
        ipRateLimitBuckets.delete(key);
      } else {
        ipRateLimitBuckets.set(key, active);
      }
    }
  }

  res.setHeader('X-RateLimit-Limit', String(limit));
  res.setHeader('X-RateLimit-Remaining', String(Math.max(0, limit - recent.length)));
  return next();
}

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in environment secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      apiVersion: 'v1beta',
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

app.use('/api', apiAuthMiddleware, apiRateLimitMiddleware);

app.post('/api/auto-edit', async (req, res) => {
  try {
    const {
      brief,
      style = 'beat-sync',
      targetPlatforms = ['douyin', 'tiktok', 'facebook'],
      bpm = 120,
      durationTarget = 16,
      mediaSummary = [],
    } = req.body ?? {};

    if (!brief || typeof brief !== 'string' || !brief.trim()) {
      return res.status(400).json({ error: '请输入视频主题或脚本需求后再生成自动剪辑方案。' });
    }

    const ai = getGeminiClient();
    const clipCount = Math.max(1, Array.isArray(mediaSummary) ? mediaSummary.length : 4);

    const mediaListText =
      Array.isArray(mediaSummary) && mediaSummary.length > 0
        ? mediaSummary
            .map(
              (m: { index: number; name: string; type: string; duration: number }) =>
                `[${m.index}] ${m.name} (${m.type}, duration=${Number(m.duration || 5).toFixed(1)}s)`
            )
            .join('\n')
        : '[0] clip_1 (image, 5s)\n[1] clip_2 (image, 5s)\n[2] clip_3 (image, 5s)\n[3] clip_4 (image, 5s)';

    const systemInstruction = `You are a senior short-video director and automated video editor specializing in Douyin (抖音), TikTok, and Facebook Reels.
Given a creator brief, editing style, BPM tempo, target duration, and indexed media clips, generate a production-ready multi-platform auto-edit plan in strict JSON.

Platform rules:
1. "douyin": Simplified Chinese copy & subtitles. Fast 1.5s Golden Hook opening, punchy colloquial Chinese phrases (max 14 Chinese chars per subtitle cue), trending Douyin hashtags without # symbol in the array (or clean tags).
2. "tiktok": Natural global English copy & subtitles. High-energy hook in first 2s, crisp conversational captions (max 7 words per cue), native TikTok discovery hashtags.
3. "facebook": Engaging story-driven English (or bilingual concise) Reels copy & subtitles. Clear value narrative, retention hook, strong CTA for shares/saves.

Timeline rules:
- Use only valid assetIndex integers from 0 to ${clipCount - 1}.
- Total clip durations per platform should roughly sum to ${durationTarget}s (usually 4 to 7 cuts, each 1.8s to 3.8s, aligned cleanly to rhythm).
- For video assets, pick varied trimStart values within their duration; for image assets, trimStart must be 0.
- Vary motion ("ken-burns-in", "ken-burns-out", "pan-left", "pan-right", "static") and transition ("cut", "crossfade", "whip-pan", "zoom-punch", "spin-switch", "flash") across consecutive clips so the edit feels dynamic. First clip transition should be "cut".
- Subtitles must have sequential non-overlapping startTime and duration fitting within the total timeline duration.
- Allowed filter values: "natural", "cinematic", "vibrant", "warm-film", "cool-clean".
- Allowed subtitle position values: "bottom", "center", "upper".`;

    const prompt = `Creative Brief: ${brief.trim()}
Editing Style: ${style}
Target BPM: ${bpm}
Target Duration: ${durationTarget} seconds
Target Platforms: ${JSON.stringify(targetPlatforms)}

Available Media Assets:
${mediaListText}

Generate tailored auto-edit timelines and platform copy for each requested platform.`;

    const response = await generateTextContentWithFallback(ai, {
      contents: prompt,
      config: {
        systemInstruction,
        thinkingConfig: { thinkingLevel: 'LOW' },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            projectTitle: { type: Type.STRING },
            recommendedBpm: { type: Type.INTEGER },
            platforms: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  platform: { type: Type.STRING },
                  title: { type: Type.STRING },
                  caption: { type: Type.STRING },
                  hashtags: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                  hookOpening: { type: Type.STRING },
                  ctaText: { type: Type.STRING },
                  clips: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        assetIndex: { type: Type.INTEGER },
                        label: { type: Type.STRING },
                        trimStart: { type: Type.NUMBER },
                        duration: { type: Type.NUMBER },
                        transition: { type: Type.STRING },
                        motion: { type: Type.STRING },
                        filter: { type: Type.STRING },
                        hookTag: { type: Type.STRING },
                      },
                      required: [
                        'assetIndex',
                        'label',
                        'trimStart',
                        'duration',
                        'transition',
                        'motion',
                        'filter',
                      ],
                    },
                  },
                  subtitles: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        startTime: { type: Type.NUMBER },
                        duration: { type: Type.NUMBER },
                        text: { type: Type.STRING },
                        position: { type: Type.STRING },
                      },
                      required: ['startTime', 'duration', 'text', 'position'],
                    },
                  },
                },
                required: [
                  'platform',
                  'title',
                  'caption',
                  'hashtags',
                  'hookOpening',
                  'ctaText',
                  'clips',
                  'subtitles',
                ],
              },
            },
          },
          required: ['projectTitle', 'recommendedBpm', 'platforms'],
        },
      },
    });

    const rawText = response.text?.trim();
    if (!rawText) {
      return res.status(502).json({ error: 'AI 模型未返回有效的剪辑结构，请重试。' });
    }

    const parsed = JSON.parse(rawText);
    return res.json(parsed);
  } catch (err: unknown) {
    console.error('[api/auto-edit] error:', err);
    return res.status(500).json({ error: '自动剪辑规划生成失败，请稍后重试。' });
  }
});

app.post('/api/suggest-transition', async (req, res) => {
  try {
    const {
      platform = 'douyin',
      bpm = 120,
      currentClip,
      nextClip,
      currentFrameBase64,
      nextFrameBase64,
    } = req.body ?? {};

    if (!currentClip || !nextClip) {
      return res.status(400).json({ error: '需要同时提供当前片段与下一片段信息才能分析转场。' });
    }

    const ai = getGeminiClient();

    const parts: Array<{ inlineData: { mimeType: string; data: string } } | { text: string }> = [];
    if (typeof currentFrameBase64 === 'string' && currentFrameBase64.length > 0) {
      parts.push({
        inlineData: {
          mimeType: 'image/jpeg',
          data: currentFrameBase64,
        },
      });
    }
    if (typeof nextFrameBase64 === 'string' && nextFrameBase64.length > 0) {
      parts.push({
        inlineData: {
          mimeType: 'image/jpeg',
          data: nextFrameBase64,
        },
      });
    }

    parts.push({
      text: `Analyze the visual transition between Clip A (outgoing) and Clip B (incoming) for a ${platform} short video at ${bpm} BPM.
Clip A: label="${currentClip.label}", motion="${currentClip.motion}", filter="${currentClip.filter}", duration=${currentClip.duration}s
Clip B: label="${nextClip.label}", motion="${nextClip.motion}", filter="${nextClip.filter}", duration=${nextClip.duration}s

Choose the best transition from:
- "crossfade" (淡入淡出: best when lighting/color tones shift gently or storytelling mood connects)
- "zoom-punch" (缩放跳转: best when moving from wide/medium shot to close-up detail or hitting a beat)
- "spin-switch" (旋转切换: best for energetic scene jumps, dynamic object/angle swaps, or circular motion)
- "whip-pan" (横甩转场: best when horizontal framing or fast subject movement aligns)
- "flash" (闪白节奏切: best for high-contrast BPM drops)
- "cut" (硬切: best when visual continuity is already direct)

Respond in Simplified Chinese for transitionName, reason (1-2 concise sentences referencing the actual visual elements, lighting, or composition in the two frames), and visualBridgeNote (short actionable tip).`,
    });

    const response = await generateTextContentWithFallback(ai, {
      contents: { parts },
      config: {
        systemInstruction:
          'You are a senior short-video film editor. Inspect the two consecutive frames and recommend the smoothest, most visually cohesive transition effect in strict JSON.',
        thinkingConfig: { thinkingLevel: 'LOW' },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            recommendedTransition: { type: Type.STRING },
            transitionName: { type: Type.STRING },
            reason: { type: Type.STRING },
            visualBridgeNote: { type: Type.STRING },
          },
          required: ['recommendedTransition', 'transitionName', 'reason', 'visualBridgeNote'],
        },
      },
    });

    const rawText = response.text?.trim();
    if (!rawText) {
      return res.status(502).json({ error: 'AI 未能生成转场建议，请重试。' });
    }

    const parsed = JSON.parse(rawText);
    return res.json(parsed);
  } catch (err: unknown) {
    console.error('[api/suggest-transition] error:', err);
    return res.status(500).json({ error: 'AI 转场分析失败，请稍后重试。' });
  }
});

app.post('/api/suggest-transition-sequence', async (req, res) => {
  try {
    const {
      platform = 'douyin',
      bpm = 120,
      selectedClipIndex = 0,
      timelineClips = [],
    } = req.body ?? {};

    if (!Array.isArray(timelineClips) || timelineClips.length === 0) {
      return res.status(400).json({ error: '时间线暂无片段，无法规划转场序列方案。' });
    }

    const ai = getGeminiClient();
    const clipsSlice = timelineClips.slice(0, 10);
    const safeSelectedIdx = Math.max(0, Math.min(clipsSlice.length - 1, Number(selectedClipIndex) || 0));

    const parts: Array<{ inlineData: { mimeType: string; data: string } } | { text: string }> = [];
    clipsSlice.forEach(
      (c: {
        frameBase64?: string | null;
      }) => {
        if (typeof c.frameBase64 === 'string' && c.frameBase64.length > 0) {
          parts.push({
            inlineData: {
              mimeType: 'image/jpeg',
              data: c.frameBase64,
            },
          });
        }
      }
    );

    const timelineDescription = clipsSlice
      .map(
        (
          c: {
            clipId: string;
            index: number;
            label: string;
            startTime: number;
            duration: number;
            motion: string;
            filter: string;
            currentTransition: string;
            hookTag?: string;
            frameBase64?: string | null;
          },
          i: number
        ) =>
          `[${i}] ${i === safeSelectedIdx ? '<<< CURRENT SELECTED CLIP >>> ' : ''}id=${c.clipId}, label="${c.label}", start=${Number(c.startTime).toFixed(2)}s, dur=${Number(c.duration).toFixed(2)}s, motion=${c.motion}, filter=${c.filter}, currentTrans=${c.currentTransition}, hookTag="${c.hookTag || ''}", hasImage=${Boolean(c.frameBase64)}`
      )
      .join('\n');

    parts.push({
      text: `Analyze the visual features (subject scale, lighting contrast, color temperature, motion direction) of ALL clips in this ${platform} short-video timeline (${bpm} BPM, ${clipsSlice.length} clips total).
Focus specifically on Clip [${safeSelectedIdx}] (position ${safeSelectedIdx + 1} of ${clipsSlice.length}) and design a cohesive, high-retention transition sequence logic across the entire timeline so viewers stay hooked through every cut.

Timeline Clips (in order, attached images correspond in sequence to clips with hasImage=true):
${timelineDescription}

Available Transitions (use ONLY these exact IDs):
- "cut": 硬切 (instant clean punch — best for Clip [0] hook opening or tight rhythmic continuity)
- "crossfade": 淡入淡出 (smooth narrative/emotional flow)
- "zoom-punch": 缩放跳转 (high-retention focal punch into detail or beat drop)
- "spin-switch": 旋转切换 (energetic 360-like scene/angle jump to re-capture attention mid-video)
- "whip-pan": 横甩转场 (fast directional momentum connecting consecutive actions)
- "flash": 闪白节奏切 (high-energy visual wake-up beat hit)
- "blur-dissolve": 模糊渐变 (dreamy/atmospheric depth shift)
- "push-pull": 纵深推拉 (spatial depth push to build curiosity)
- "page-flip": 翻页切换 (step-by-step tutorial or chapter transition)
- "iris-wipe": 圆形光圈 (spotlight focus shift onto a hero subject)
- "curtain-split": 双开门帘 (dramatic reveal / before-after unveiling)
- "glitch-slice": 故障切片 (sharp pattern-interrupt jolt to prevent mid-video drop-off)

Requirements (Simplified Chinese):
1. "timelineVisualOverview": 1-2 sentences analyzing the visual progression across the whole timeline (color tones, shot framing, lighting contrast).
2. "retentionStrategy": 1-2 sentences explaining the pacing arc (Golden Hook -> Pattern Interrupt / Momentum -> Climax -> Retention Outro) designed for ${platform}.
3. "currentPositionSummary": 1-2 sentences specifically explaining why the recommended transition at Clip [${safeSelectedIdx}] (position ${safeSelectedIdx + 1}/${clipsSlice.length}) maximizes viewer retention given what comes before and after it visually.
4. "currentRecommendedTransition": the exact transition ID recommended for Clip [${safeSelectedIdx}].
5. "steps": an array of exactly ${clipsSlice.length} items (clipIndex 0 through ${clipsSlice.length - 1}), each with:
   - clipIndex: integer index
   - positionRole: short 3-6 char Chinese retention role (e.g. "黄金开场位", "视觉提速位", "中段防滑落", "高潮爆发位", "完播收尾位")
   - recommendedTransition: exact transition ID (Clip 0 should usually be "cut" or "iris-wipe"/"crossfade" if opening reveal fits; subsequent clips must vary purposefully to prevent visual fatigue!)
   - transitionName: Chinese display name
   - retentionReason: concise 10-24 char Chinese explanation linking visual features to retention.`,
    });

    const response = await generateTextContentWithFallback(ai, {
      contents: { parts },
      config: {
        systemInstruction:
          'You are a viral short-video retention architect and senior editor for Douyin, TikTok, and Facebook Reels. Inspect the full sequence of visual frames and design a non-repetitive, high-retention transition sequence in strict JSON.',
        thinkingConfig: { thinkingLevel: 'LOW' },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            timelineVisualOverview: { type: Type.STRING },
            retentionStrategy: { type: Type.STRING },
            currentPositionSummary: { type: Type.STRING },
            currentRecommendedTransition: { type: Type.STRING },
            steps: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  clipIndex: { type: Type.INTEGER },
                  positionRole: { type: Type.STRING },
                  recommendedTransition: { type: Type.STRING },
                  transitionName: { type: Type.STRING },
                  retentionReason: { type: Type.STRING },
                },
                required: [
                  'clipIndex',
                  'positionRole',
                  'recommendedTransition',
                  'transitionName',
                  'retentionReason',
                ],
              },
            },
          },
          required: [
            'timelineVisualOverview',
            'retentionStrategy',
            'currentPositionSummary',
            'currentRecommendedTransition',
            'steps',
          ],
        },
      },
    });

    const rawText = response.text?.trim();
    if (!rawText) {
      return res.status(502).json({ error: 'AI 未能生成转场序列建议，请重试。' });
    }

    const parsed = JSON.parse(rawText);
    const validTransitions = new Set([
      'cut',
      'crossfade',
      'whip-pan',
      'zoom-punch',
      'spin-switch',
      'flash',
      'blur-dissolve',
      'push-pull',
      'page-flip',
      'iris-wipe',
      'curtain-split',
      'glitch-slice',
    ]);
    const transitionNames: Record<string, string> = {
      cut: '硬切',
      crossfade: '淡入淡出',
      'whip-pan': '横甩转场',
      'zoom-punch': '缩放跳转',
      'spin-switch': '旋转切换',
      flash: '闪白节奏切',
      'blur-dissolve': '模糊渐变',
      'push-pull': '纵深推拉',
      'page-flip': '翻页切换',
      'iris-wipe': '圆形光圈',
      'curtain-split': '双开门帘',
      'glitch-slice': '故障切片',
    };

    const rawSteps = Array.isArray(parsed.steps) ? parsed.steps : [];
    const steps = clipsSlice.map(
      (c: { clipId: string; label: string }, idx: number) => {
        const matched = rawSteps.find((s: { clipIndex?: number }) => Number(s.clipIndex) === idx) ?? rawSteps[idx] ?? {};
        const rawTr = String(matched.recommendedTransition || '');
        const safeTr = validTransitions.has(rawTr) ? rawTr : idx === 0 ? 'cut' : 'zoom-punch';
        return {
          clipId: c.clipId,
          clipIndex: idx,
          clipLabel: c.label,
          positionRole:
            typeof matched.positionRole === 'string' && matched.positionRole.trim()
              ? matched.positionRole.trim()
              : idx === 0
                ? '黄金开场位'
                : idx === clipsSlice.length - 1
                  ? '完播收尾位'
                  : '节奏推进位',
          recommendedTransition: safeTr,
          transitionName:
            typeof matched.transitionName === 'string' && matched.transitionName.trim()
              ? matched.transitionName.trim()
              : transitionNames[safeTr] || safeTr,
          retentionReason:
            typeof matched.retentionReason === 'string' && matched.retentionReason.trim()
              ? matched.retentionReason.trim()
              : '结合前后画面光影反差平滑拉升完播率',
        };
      }
    );

    const rawCurrentTr = String(parsed.currentRecommendedTransition || '');
    const currentStep = steps[safeSelectedIdx];
    const currentRecommendedTransition = validTransitions.has(rawCurrentTr)
      ? rawCurrentTr
      : currentStep?.recommendedTransition || 'zoom-punch';

    return res.json({
      timelineVisualOverview:
        parsed.timelineVisualOverview || '已完成整条时间线多镜头光影与景别节奏分析。',
      retentionStrategy:
        parsed.retentionStrategy || '通过前3秒强视觉抓手与中段节奏切换防止观众流失。',
      currentPositionSummary:
        parsed.currentPositionSummary ||
        `第 ${safeSelectedIdx + 1} 段建议采用「${transitionNames[currentRecommendedTransition] || currentRecommendedTransition}」强化视觉衔接粘性。`,
      currentRecommendedTransition,
      steps,
    });
  } catch (err: unknown) {
    console.error('[api/suggest-transition-sequence] error:', err);
    return res.status(500).json({ error: '智能转场序列分析失败，请稍后重试。' });
  }
});

app.post('/api/match-color', async (req, res) => {
  try {
    const {
      platform = 'douyin',
      clipLabel = '',
      currentFilter = 'natural',
      frameBase64,
      referenceFrameBase64,
    } = req.body ?? {};

    if (!frameBase64 || typeof frameBase64 !== 'string') {
      return res.status(400).json({ error: '未能获取当前片段画面帧，请先确认素材已加载。' });
    }

    const ai = getGeminiClient();

    const parts: Array<{ inlineData: { mimeType: string; data: string } } | { text: string }> = [
      {
        inlineData: {
          mimeType: 'image/jpeg',
          data: frameBase64,
        },
      },
    ];

    if (typeof referenceFrameBase64 === 'string' && referenceFrameBase64.length > 0) {
      parts.push({
        inlineData: {
          mimeType: 'image/jpeg',
          data: referenceFrameBase64,
        },
      });
    }

    parts.push({
      text: `Analyze the visual color temperature, lighting exposure, and saturation of the target short-video frame (first image)${
        referenceFrameBase64 ? ' and match its visual mood smoothly with the adjacent clip frame (second image)' : ''
      } for ${platform} vertical feed.
Clip label: "${clipLabel}", current preset filter: "${currentFilter}".

Return precise numeric color grading multipliers:
- contrast: between 0.88 and 1.32 (1.0 = neutral)
- saturation: between 0.82 and 1.42 (1.0 = neutral)
- brightness: between 0.88 and 1.18 (1.0 = neutral)
- recommendedFilter: one of "natural", "cinematic", "vibrant", "warm-film", "cool-clean"
- colorTempLabel: concise Simplified Chinese label describing the detected color temp & saturation (e.g. "偏暖晨光 · 中高饱和" or "偏冷室内 · 对比偏低")
- analysisNote: 1-2 concise Simplified Chinese sentences explaining the detected tone and why the tuned contrast/saturation/brightness improves feed appeal.`,
    });

    const response = await generateTextContentWithFallback(ai, {
      contents: { parts },
      config: {
        systemInstruction:
          'You are a senior commercial colorist for Douyin, TikTok, and Facebook Reels. Inspect the frame color temperature and saturation and return balanced, natural-looking color grading multipliers in strict JSON.',
        thinkingConfig: { thinkingLevel: 'LOW' },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            contrast: { type: Type.NUMBER },
            saturation: { type: Type.NUMBER },
            brightness: { type: Type.NUMBER },
            recommendedFilter: { type: Type.STRING },
            colorTempLabel: { type: Type.STRING },
            analysisNote: { type: Type.STRING },
          },
          required: [
            'contrast',
            'saturation',
            'brightness',
            'recommendedFilter',
            'colorTempLabel',
            'analysisNote',
          ],
        },
      },
    });

    const rawText = response.text?.trim();
    if (!rawText) {
      return res.status(502).json({ error: 'AI 未能生成色调匹配参数，请重试。' });
    }

    const parsed = JSON.parse(rawText);
    return res.json(parsed);
  } catch (err: unknown) {
    console.error('[api/match-color] error:', err);
    return res.status(500).json({ error: 'AI 智能色调匹配失败，请稍后重试。' });
  }
});

app.post('/api/tag-media', async (req, res) => {
  try {
    const { name = '', type = 'image', frameBase64 } = req.body ?? {};

    if (!frameBase64 || typeof frameBase64 !== 'string') {
      return res.status(400).json({ error: '未能捕获素材画面帧，无法进行 AI 标签识别。' });
    }

    const ai = getGeminiClient();

    const response = await generateTextContentWithFallback(ai, {
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: frameBase64,
            },
          },
          {
            text: `Inspect this short-video ${type} asset ("${name}") and tag its main subjects and visual tone/lighting characteristics.
- subjects: choose 1-2 from ["美食", "风景", "人物", "产品", "运动"]
- visuals: choose 1-2 from ["高调", "低调", "暖色", "冷色"] (note: 高调=bright/high-key, 低调=moody/low-key, 暖色=warm tone, 冷色=cool tone)
- sceneSummary: concise 6-14 character Simplified Chinese summary of what appears in the frame.`,
          },
        ],
      },
      config: {
        systemInstruction:
          'You are a media asset classifier for a video editing studio. Output strict JSON matching the requested Chinese taxonomy.',
        thinkingConfig: { thinkingLevel: 'LOW' },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            subjects: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            visuals: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            sceneSummary: { type: Type.STRING },
          },
          required: ['subjects', 'visuals', 'sceneSummary'],
        },
      },
    });

    const rawText = response.text?.trim();
    if (!rawText) {
      return res.status(502).json({ error: 'AI 未能返回标签识别结果。' });
    }

    const parsed = JSON.parse(rawText);
    return res.json(parsed);
  } catch (err: unknown) {
    console.error('[api/tag-media] error:', err);
    return res.status(500).json({ error: 'AI 素材打标失败，请稍后重试。' });
  }
});

app.post('/api/suggest-bgm', async (req, res) => {
  try {
    const {
      platform = 'douyin',
      clipsSummary = [],
      totalDuration = 10,
      currentBpm = 120,
      sampleFramesBase64 = [],
    } = req.body ?? {};

    const ai = getGeminiClient();

    const parts: Array<{ inlineData: { mimeType: string; data: string } } | { text: string }> = [];
    if (Array.isArray(sampleFramesBase64)) {
      sampleFramesBase64.slice(0, 3).forEach((frame) => {
        if (typeof frame === 'string' && frame.length > 0) {
          parts.push({
            inlineData: {
              mimeType: 'image/jpeg',
              data: frame,
            },
          });
        }
      });
    }

    const timelineText = Array.isArray(clipsSummary)
      ? clipsSummary
          .map(
            (c: { label: string; duration: number; transition: string; filter: string }, i: number) =>
              `Clip ${i + 1}: "${c.label}", dur=${Number(c.duration).toFixed(1)}s, trans=${c.transition}, filter=${c.filter}`
          )
          .join('\n')
      : '';

    parts.push({
      text: `Analyze the editing rhythm (cut pacing, transitions, filters) and visual mood from the attached video frames for a ${platform} short video (${Number(totalDuration).toFixed(1)}s total, current ${currentBpm} BPM).

Timeline cuts:
${timelineText}

Select the best matching BGM preset from these exact IDs:
- "upbeat-128" (律动感: high-energy electronic groove, great for fast beat cuts and hooks, ~128 BPM)
- "tech-118" (科技律动: crisp modern arpeggio beat, great for product showcases & urban lifestyle, ~118 BPM)
- "fresh-112" (清新: bright airy pluck & light percussion, great for morning coffee, food, bright daylight, ~112 BPM)
- "narrative-92" (叙事感: warm cinematic piano & strings, great for storytelling, crossfades, emotional arcs, ~92 BPM)
- "lofi-95" (松弛感: mellow Rhodes chord groove, great for calm routines and desk setups, ~95 BPM)
- "suspense-104" (悬疑: deep pulsing sub-bass & tense chime, great for mystery hooks, dramatic reveals, moody low-key visuals, ~104 BPM)

Return strict JSON with recommendedPreset, moodLabel (e.g. "律动感", "叙事感", "清新", "悬疑"), presetName (concise Chinese preset name), recommendedBpm (integer 85-140), recommendedVolume (0.50-0.80), reason (1-2 concise Simplified Chinese sentences referencing visual mood & cut tempo), and soundDesignNote (short actionable tip).`,
    });

    const response = await generateTextContentWithFallback(ai, {
      contents: { parts },
      config: {
        systemInstruction:
          'You are a short-video music supervisor and sound designer. Match the editing pace and visual emotion to the ideal music preset in strict JSON.',
        thinkingConfig: { thinkingLevel: 'LOW' },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            recommendedPreset: { type: Type.STRING },
            moodLabel: { type: Type.STRING },
            presetName: { type: Type.STRING },
            recommendedBpm: { type: Type.INTEGER },
            recommendedVolume: { type: Type.NUMBER },
            reason: { type: Type.STRING },
            soundDesignNote: { type: Type.STRING },
          },
          required: [
            'recommendedPreset',
            'moodLabel',
            'presetName',
            'recommendedBpm',
            'recommendedVolume',
            'reason',
            'soundDesignNote',
          ],
        },
      },
    });

    const rawText = response.text?.trim();
    if (!rawText) {
      return res.status(502).json({ error: 'AI 未能生成背景乐风格建议，请重试。' });
    }

    const parsed = JSON.parse(rawText);
    return res.json(parsed);
  } catch (err: unknown) {
    console.error('[api/suggest-bgm] error:', err);
    return res.status(500).json({ error: 'AI 背景乐分析失败，请稍后重试。' });
  }
});

app.post('/api/transcribe-subtitles', async (req, res) => {
  try {
    const {
      platform = 'douyin',
      clipLabel = '',
      clipDuration = 3.0,
      audioBase64,
      mimeType = 'audio/wav',
      frameBase64,
    } = req.body ?? {};

    const safeDuration = Math.max(0.8, Math.min(60, Number(clipDuration) || 3.0));
    const ai = getGeminiClient();

    let transcript = '';
    let sourceMode: 'speech' | 'visual' = 'speech';

    if (typeof audioBase64 === 'string' && audioBase64.length > 0) {
      const transcribeRes = await generateTextContentWithFallback(
        ai,
        {
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType,
                  data: audioBase64,
                },
              },
              {
                text: 'Transcribe the spoken dialogue or narration accurately in its original language (Simplified Chinese or English). Output only the spoken transcript text.',
              },
            ],
          },
        },
        getTranscribeModelCandidates()
      );
      transcript = (transcribeRes.text ?? '').trim();
    } else if (typeof frameBase64 === 'string' && frameBase64.length > 0) {
      sourceMode = 'visual';
    } else {
      return res.status(400).json({ error: '请提供包含语音的片段音轨，或先加载视频画面。' });
    }

    if (sourceMode === 'speech' && !transcript) {
      return res.json({
        transcript: '',
        sourceMode: 'speech',
        emptySpeech: true,
        segments: [],
      });
    }

    const targetLanguageHint =
      platform === 'douyin'
        ? 'Simplified Chinese (简体中文，每条不超过14个字，口语自然)'
        : 'Concise natural English (max 7 words per cue) matching the original meaning';

    const alignPrompt =
      sourceMode === 'speech'
        ? `Split and align the following transcribed speech into timed short-video subtitle segments that fit strictly inside a ${safeDuration.toFixed(2)}-second video clip.
Transcript: "${transcript}"
Platform: ${platform}. Keep original spoken meaning and language (or format cleanly for ${targetLanguageHint} if appropriate).
Rules:
- Each segment has offsetStart (seconds >= 0) and duration (seconds >= 0.7).
- Segments must not overlap and offsetStart + duration must be <= ${safeDuration.toFixed(2)}.
- Cover the entire ${safeDuration.toFixed(2)}s clip smoothly.`
        : `This ${safeDuration.toFixed(2)}-second clip ("${clipLabel}") has no spoken audio track. Based on the visual frame attached, write concise natural voiceover subtitle lines for ${platform} (${targetLanguageHint}) that fit strictly inside ${safeDuration.toFixed(2)} seconds.
Rules:
- Each segment has offsetStart (seconds >= 0) and duration (seconds >= 0.8).
- Segments must not overlap and offsetStart + duration must be <= ${safeDuration.toFixed(2)}.`;

    const alignParts: Array<{ inlineData: { mimeType: string; data: string } } | { text: string }> =
      [];
    if (sourceMode === 'visual' && typeof frameBase64 === 'string') {
      alignParts.push({
        inlineData: {
          mimeType: 'image/jpeg',
          data: frameBase64,
        },
      });
    }
    alignParts.push({ text: alignPrompt });

    const alignRes = await generateTextContentWithFallback(ai, {
      contents: { parts: alignParts },
      config: {
        systemInstruction:
          'You are a short-video subtitle timing specialist. Convert speech transcripts or scene cues into tightly timed, non-overlapping subtitle segments in strict JSON.',
        thinkingConfig: { thinkingLevel: 'LOW' },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            segments: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  offsetStart: { type: Type.NUMBER },
                  duration: { type: Type.NUMBER },
                  text: { type: Type.STRING },
                },
                required: ['offsetStart', 'duration', 'text'],
              },
            },
          },
          required: ['segments'],
        },
      },
    });

    const parsed = JSON.parse((alignRes.text ?? '{"segments":[]}').trim());
    const rawSegs = Array.isArray(parsed.segments) ? parsed.segments : [];

    const segments = rawSegs
      .filter((s: { text?: string }) => typeof s.text === 'string' && s.text.trim().length > 0)
      .map((s: { offsetStart: number; duration: number; text: string }) => {
        const offsetStart = Math.max(0, Math.min(safeDuration - 0.5, Number(s.offsetStart) || 0));
        const maxDur = Math.max(0.5, safeDuration - offsetStart);
        const duration = Math.max(0.5, Math.min(maxDur, Number(s.duration) || 1.5));
        return {
          offsetStart: Number(offsetStart.toFixed(2)),
          duration: Number(duration.toFixed(2)),
          text: s.text.trim(),
        };
      });

    return res.json({
      transcript:
        transcript ||
        segments.map((s: { text: string }) => s.text).join(' '),
      sourceMode,
      emptySpeech: false,
      segments,
    });
  } catch (err: unknown) {
    console.error('[api/transcribe-subtitles] error:', err);
    return res.status(500).json({ error: 'AI 语音识别生成字幕失败，请稍后重试。' });
  }
});

app.post('/api/suggest-sfx', async (req, res) => {
  try {
    const {
      platform = 'douyin',
      bpm = 120,
      totalDuration = 10,
      timelineNodes = [],
      subtitleNodes = [],
      sampleFramesBase64 = [],
    } = req.body ?? {};

    if (!Array.isArray(timelineNodes) || timelineNodes.length === 0) {
      return res.status(400).json({ error: '时间线暂无视频片段节点，无法生成音效库推荐。' });
    }

    const safeTotal = Math.max(1, Number(totalDuration) || 10);
    const ai = getGeminiClient();

    const parts: Array<{ inlineData: { mimeType: string; data: string } } | { text: string }> = [];
    if (Array.isArray(sampleFramesBase64)) {
      sampleFramesBase64.slice(0, 3).forEach((frame) => {
        if (typeof frame === 'string' && frame.length > 0) {
          parts.push({
            inlineData: {
              mimeType: 'image/jpeg',
              data: frame,
            },
          });
        }
      });
    }

    const clipSummaryText = timelineNodes
      .map(
        (n: {
          clipId: string;
          index: number;
          label: string;
          startTime: number;
          endTime: number;
          transition: string;
          motion: string;
          hookTag?: string;
        }) =>
          `Clip#${n.index + 1} (id=${n.clipId}): start=${Number(n.startTime).toFixed(2)}s, end=${Number(n.endTime).toFixed(2)}s, transitionIn="${n.transition}", motion="${n.motion}", hookTag="${n.hookTag || ''}", label="${n.label}"`
      )
      .join('\n');

    const subSummaryText = Array.isArray(subtitleNodes) && subtitleNodes.length > 0
      ? subtitleNodes
          .slice(0, 8)
          .map(
            (s: { startTime: number; text: string; position: string }, i: number) =>
              `Sub#${i + 1}: start=${Number(s.startTime).toFixed(2)}s, pos=${s.position}, text="${s.text}"`
          )
          .join('\n')
      : 'None';

    parts.push({
      text: `Analyze this ${platform} short-video timeline (${safeTotal.toFixed(2)}s total, ${bpm} BPM) and recommend 4 to 8 precisely timed micro sound effects (SFX) placed at key visual action, cut, transition, and subtitle highlight nodes.

Clip Timeline Nodes:
${clipSummaryText}

Subtitle Cue Nodes:
${subSummaryText}

Available Micro SFX Library Types (use ONLY these exact IDs):
- "whoosh": 咻声 (fast air sweep — ideal at whip-pan, spin-switch, push-pull, page-flip, or rapid camera motion)
- "ding": 叮声 (bright bell chime — ideal for key highlight captions, hook reveals, CTA points, or bright moments)
- "click": 咔哒声 (crisp tactile click — ideal for sharp hard cuts, hook opening tags, UI/focus shifts, or step transitions)
- "pop": 啵声 (playful bubble pop — ideal for caption pop-ins, close-up food/product reveals)
- "swoosh-impact": 重击扫响 (whoosh into punch — ideal for zoom-punch, flash drops, glitch-slice, or climax beats)
- "shimmer": 闪烁星芒 (airy sparkle swell — ideal for crossfade, blur-dissolve, iris-wipe, or warm ending reveals)

Rules:
- Each event's "time" MUST be within [0.00, ${(safeTotal - 0.15).toFixed(2)}] and align tightly to a real clip transition startTime (e.g. slightly anticipating by 0.05s or right on cut), opening hook (~0.08s), or subtitle highlight node.
- Use Simplified Chinese for "librarySummary" (1 concise sentence), "name" (e.g., "清脆叮声", "转场咻声", "点击咔哒"), and "reason" (concise visual/timeline node explanation like "匹配 2.2s 缩放跳转切镜").
- "category" must be one of: "transition", "action", "subtitle", "hook".
- "volume" must be between 0.45 and 0.95.`,
    });

    const response = await generateTextContentWithFallback(ai, {
      contents: { parts },
      config: {
        systemInstruction:
          'You are a professional short-video sound designer for Douyin, TikTok, and Facebook Reels. Map timeline transitions, visual actions, and caption cues to precise micro SFX cues in strict JSON.',
        thinkingConfig: { thinkingLevel: 'LOW' },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            librarySummary: { type: Type.STRING },
            sfxEvents: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  type: { type: Type.STRING },
                  name: { type: Type.STRING },
                  time: { type: Type.NUMBER },
                  volume: { type: Type.NUMBER },
                  category: { type: Type.STRING },
                  reason: { type: Type.STRING },
                  linkedClipId: { type: Type.STRING },
                },
                required: ['type', 'name', 'time', 'volume', 'category', 'reason'],
              },
            },
          },
          required: ['librarySummary', 'sfxEvents'],
        },
      },
    });

    const rawText = response.text?.trim();
    if (!rawText) {
      return res.status(502).json({ error: 'AI 未能生成音效库推荐，请重试。' });
    }

    const parsed = JSON.parse(rawText);
    const validTypes = new Set(['whoosh', 'ding', 'click', 'pop', 'swoosh-impact', 'shimmer']);
    const validCategories = new Set(['transition', 'action', 'subtitle', 'hook']);
    const sfxDurationMap: Record<string, number> = {
      whoosh: 0.25,
      ding: 0.42,
      click: 0.08,
      pop: 0.12,
      'swoosh-impact': 0.35,
      shimmer: 0.45,
    };

    const rawEvents = Array.isArray(parsed.sfxEvents) ? parsed.sfxEvents : [];
    const events = rawEvents
      .map(
        (
          ev: {
            type?: string;
            name?: string;
            time?: number;
            volume?: number;
            category?: string;
            reason?: string;
            linkedClipId?: string;
          },
          idx: number
        ) => {
          const safeType = validTypes.has(String(ev.type)) ? String(ev.type) : 'whoosh';
          const safeCategory = validCategories.has(String(ev.category))
            ? String(ev.category)
            : 'transition';
          const safeTime = Number(
            Math.max(0, Math.min(safeTotal - 0.1, Number(ev.time) || 0)).toFixed(2)
          );
          const safeVol = Number(
            Math.max(0.45, Math.min(0.95, Number(ev.volume) || 0.75)).toFixed(2)
          );
          return {
            id: `sfx-ai-${Date.now()}-${idx}`,
            type: safeType,
            name: (ev.name || safeType).trim(),
            time: safeTime,
            duration: sfxDurationMap[safeType] ?? 0.25,
            volume: safeVol,
            category: safeCategory,
            reason: (ev.reason || '匹配时间轴转场动作节点').trim(),
            linkedClipId: typeof ev.linkedClipId === 'string' ? ev.linkedClipId : undefined,
          };
        }
      )
      .sort((a: { time: number }, b: { time: number }) => a.time - b.time);

    return res.json({
      librarySummary:
        typeof parsed.librarySummary === 'string' && parsed.librarySummary.trim()
          ? parsed.librarySummary.trim()
          : '已分析剪辑转场与视觉节点，并匹配对应微型音效。',
      events,
    });
  } catch (err: unknown) {
    console.error('[api/suggest-sfx] error:', err);
    return res.status(500).json({ error: 'AI 音效库推荐失败，请稍后重试。' });
  }
});

const ttsModelQuotaCooldownUntil = new Map<string, number>();

function stripScriptTags(text: string): string {
  return text
    .replace(/<\s*(breath|laugh|gasp)\s*>/gi, ' ')
    .replace(/\|(mhm|yeah)\|/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function getWavDurationSec(base64: string): number | null {
  try {
    const clean = base64.includes(',') ? base64.split(',')[1] : base64;
    const buf = Buffer.from(clean, 'base64');
    if (buf.length < 44) return null;
    if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
      return null;
    }
    const byteRate = buf.readUInt32LE(28);
    if (!byteRate) return null;
    let offset = 12;
    while (offset + 8 <= buf.length) {
      const chunkId = buf.toString('ascii', offset, offset + 4);
      const chunkSize = buf.readUInt32LE(offset + 4);
      if (chunkId === 'data') {
        const usableBytes = Math.min(chunkSize, buf.length - (offset + 8));
        return Number(Math.max(0.4, usableBytes / byteRate).toFixed(2));
      }
      offset += 8 + chunkSize + (chunkSize % 2);
    }
    return Number(Math.max(0.4, (buf.length - 44) / byteRate).toFixed(2));
  } catch {
    return null;
  }
}

function extractWavMelPhonemeAlignment(
  base64: string,
  options?: {
    enabled?: boolean;
    keyframeOffsetMs?: number;
    onsetAdvanceMs?: number;
  }
) {
  try {
    const clean = base64.includes(',') ? base64.split(',')[1] : base64;
    const buf = Buffer.from(clean, 'base64');
    if (buf.length < 44) return undefined;
    if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
      return undefined;
    }

    let sampleRate = 24000;
    let numChannels = 1;
    let bitsPerSample = 16;
    let dataOffset = 44;
    let dataSize = buf.length - 44;

    let offset = 12;
    while (offset + 8 <= buf.length) {
      const chunkId = buf.toString('ascii', offset, offset + 4);
      const chunkSize = buf.readUInt32LE(offset + 4);
      if (chunkId === 'fmt ') {
        numChannels = buf.readUInt16LE(offset + 10) || 1;
        sampleRate = buf.readUInt32LE(offset + 12) || 24000;
        bitsPerSample = buf.readUInt16LE(offset + 22) || 16;
      } else if (chunkId === 'data') {
        dataOffset = offset + 8;
        dataSize = Math.min(chunkSize, buf.length - dataOffset);
        break;
      }
      offset += 8 + chunkSize + (chunkSize % 2);
    }

    const bytesPerSample = Math.max(1, bitsPerSample / 8);
    const totalSamples = Math.floor(dataSize / (bytesPerSample * numChannels));
    if (totalSamples <= 0) return undefined;

    const pcm = new Float32Array(totalSamples);
    for (let s = 0; s < totalSamples; s++) {
      const byteIdx = dataOffset + s * numChannels * bytesPerSample;
      if (byteIdx + 1 >= buf.length) break;
      pcm[s] = bitsPerSample === 16 ? buf.readInt16LE(byteIdx) / 32768 : 0;
    }

    return extractMelPhonemeAlignmentFromPcm(pcm, sampleRate, options);
  } catch {
    return undefined;
  }
}

async function synthesizeStyledSpeech(
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

app.post('/api/generate-voiceover', async (req, res) => {
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
});

app.post('/api/voice-clone/train', async (req, res) => {
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
});

app.post('/api/voice-clone/preview', async (req, res) => {
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
});

app.post('/api/voiceover/analyze-noise', async (req, res) => {
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
});

app.post('/api/polish-brief', async (req, res) => {
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
});

app.post('/api/audio/copyright-scan', async (req, res) => {
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
});

app.post('/api/digital-human/clone', async (req, res) => {
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
});

app.post('/api/digital-human/drive', async (req, res) => {
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
    const inline = await synthesizeStyledSpeech(ai, {
      voiceName: safeVoice,
      spokenText: `<breath> ${scriptText.trim().slice(0, 260)}`,
      stylePrompt,
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

    return res.json({
      audioBase64: inline.data,
      mimeType: inline.mimeType || 'audio/wav',
      audioDurationSec: durationSec ?? Number(Math.max(2, scriptText.trim().length * 0.24).toFixed(2)),
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
});

app.post('/api/digital-human/analyze-emotion', async (req, res) => {
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
});

app.post('/api/digital-human/suggest-actions', async (req, res) => {
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
});

app.post('/api/digital-human/multilingual-dub', async (req, res) => {
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
});

// Unknown /api/* JSON 404 handler (protected by auth & rate-limiter above)
app.use('/api', (_req, res) => {
  return res.status(404).json({ error: '请求的接口路径不存在。' });
});

// Global Express error handler — never expose internal error.message or stack traces on 500
app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error('[express] unhandled error:', err);
    if (
      err instanceof SyntaxError &&
      'status' in err &&
      (err as { status?: number }).status === 400
    ) {
      return res.status(400).json({ error: '请求体 JSON 格式无效，请检查后重试。' });
    }
    return res.status(500).json({ error: '服务端内部处理异常，请稍后重试。' });
  }
);

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ClipFlow Studio server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
