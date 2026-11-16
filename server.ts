import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '16mb' }));

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

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: prompt,
      config: {
        systemInstruction,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
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
    const message =
      err instanceof Error ? err.message : '自动剪辑规划生成失败，请检查网络或稍后重试。';
    return res.status(500).json({ error: message });
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

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: { parts },
      config: {
        systemInstruction:
          'You are a senior short-video film editor. Inspect the two consecutive frames and recommend the smoothest, most visually cohesive transition effect in strict JSON.',
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
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
    const message =
      err instanceof Error ? err.message : 'AI 转场分析失败，请检查网络后重试。';
    return res.status(500).json({ error: message });
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

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: { parts },
      config: {
        systemInstruction:
          'You are a viral short-video retention architect and senior editor for Douyin, TikTok, and Facebook Reels. Inspect the full sequence of visual frames and design a non-repetitive, high-retention transition sequence in strict JSON.',
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
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
    const message =
      err instanceof Error ? err.message : '智能转场序列分析失败，请稍后重试。';
    return res.status(500).json({ error: message });
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

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: { parts },
      config: {
        systemInstruction:
          'You are a senior commercial colorist for Douyin, TikTok, and Facebook Reels. Inspect the frame color temperature and saturation and return balanced, natural-looking color grading multipliers in strict JSON.',
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
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
    const message =
      err instanceof Error ? err.message : 'AI 智能色调匹配失败，请检查网络后重试。';
    return res.status(500).json({ error: message });
  }
});

app.post('/api/tag-media', async (req, res) => {
  try {
    const { name = '', type = 'image', frameBase64 } = req.body ?? {};

    if (!frameBase64 || typeof frameBase64 !== 'string') {
      return res.status(400).json({ error: '未能捕获素材画面帧，无法进行 AI 标签识别。' });
    }

    const ai = getGeminiClient();

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
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
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
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
    const message =
      err instanceof Error ? err.message : 'AI 素材打标失败，请稍后重试。';
    return res.status(500).json({ error: message });
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

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: { parts },
      config: {
        systemInstruction:
          'You are a short-video music supervisor and sound designer. Match the editing pace and visual emotion to the ideal music preset in strict JSON.',
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
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
    const message =
      err instanceof Error ? err.message : 'AI 背景乐分析失败，请稍后重试。';
    return res.status(500).json({ error: message });
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
      const transcribeRes = await ai.models.generateContent({
        model: 'gemini-3.5-transcribe',
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
      });
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

    const alignRes = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: { parts: alignParts },
      config: {
        systemInstruction:
          'You are a short-video subtitle timing specialist. Convert speech transcripts or scene cues into tightly timed, non-overlapping subtitle segments in strict JSON.',
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
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
    const message =
      err instanceof Error ? err.message : 'AI 语音识别生成字幕失败，请稍后重试。';
    return res.status(500).json({ error: message });
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

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: { parts },
      config: {
        systemInstruction:
          'You are a professional short-video sound designer for Douyin, TikTok, and Facebook Reels. Map timeline transitions, visual actions, and caption cues to precise micro SFX cues in strict JSON.',
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
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
    const message =
      err instanceof Error ? err.message : 'AI 音效库推荐失败，请稍后重试。';
    return res.status(500).json({ error: message });
  }
});

let flashTtsQuotaCooldownUntil = 0;

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

async function synthesizeStyledSpeech(
  ai: GoogleGenAI,
  opts: {
    model: string;
    voiceName: string;
    spokenText: string;
    stylePrompt?: string;
  }
) {
  const { model, voiceName, spokenText, stylePrompt } = opts;
  const cleanStyle = (stylePrompt || '').trim();

  const modelsToTry: string[] = [];
  if (model === 'gemini-3.8-flash-tts' && Date.now() >= flashTtsQuotaCooldownUntil) {
    modelsToTry.push('gemini-3.8-flash-tts');
  }
  if (!modelsToTry.includes('gemini-3.8-flash-lite-tts')) {
    modelsToTry.push('gemini-3.8-flash-lite-tts');
  }

  let lastErr: unknown = null;

  for (const currentModel of modelsToTry) {
    const modelText =
      currentModel === 'gemini-3.8-flash-tts' ? spokenText : stripScriptTags(spokenText);

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
          cleanStyle
            ? { text: modelText, speechMetadata: { style: cleanStyle } }
            : { text: modelText },
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
          if (currentModel === 'gemini-3.8-flash-tts' && isDailyLimit) {
            flashTtsQuotaCooldownUntil = Date.now() + 15 * 60 * 1000;
            console.warn(
              '[tts] gemini-3.8-flash-tts daily quota exceeded; falling back to gemini-3.8-flash-lite-tts'
            );
          }
          break; // Move to next fallback model
        }
        if (isServiceBusyError(err)) {
          await new Promise((r) => setTimeout(r, 800));
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
          throw err;
        }
      }
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

    // Reserve gemini-3.8-flash-tts (10 req/day Free Tier) for single-clip/voice-clone preview;
    // use high-throughput gemini-3.8-flash-lite-tts for multi-cue timeline batch synthesis.
    const ttsModel =
      isExpressive && targetCues.length <= 2
        ? 'gemini-3.8-flash-tts'
        : 'gemini-3.8-flash-lite-tts';

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
              model: ttsModel,
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

    const actualModelUsed = results[0]?.modelUsed || ttsModel;
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
    const message =
      err instanceof Error ? err.message : 'AI 配音合成失败，请稍后重试。';
    return res.status(500).json({ error: message });
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

    const analysisResp = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
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
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
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
      model: 'gemini-3.8-flash-tts',
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
    const message =
      err instanceof Error ? err.message : 'AI 声音克隆建模失败，请稍后重试。';
    return res.status(500).json({ error: message });
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
      model: 'gemini-3.8-flash-tts',
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
    const message = err instanceof Error ? err.message : '试听生成失败，请稍后重试。';
    return res.status(500).json({ error: message });
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

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: { parts: parts as never },
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
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
    const message =
      err instanceof Error ? err.message : 'AI 环境音分析失败，请稍后重试。';
    return res.status(500).json({ error: message });
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

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
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
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
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
    const message =
      err instanceof Error ? err.message : 'AI 脚本辅助润色失败，请稍后重试。';
    return res.status(500).json({ error: message });
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

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: searchPrompt,
      config: {
        tools: [{ googleSearch: {} }],
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
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
    const message =
      err instanceof Error ? err.message : 'AI 版权风险扫描失败，请稍后重试。';
    return res.status(500).json({ error: message });
  }
});

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
