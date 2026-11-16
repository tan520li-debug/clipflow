import express from 'express';
import { Type } from '@google/genai';
import {
  generateTextContentWithFallback,
  getGeminiClient,
  getTranscribeModelCandidates,
} from '../gemini.ts';
import { acceptJsonJob } from '../jobs/http.ts';

export function registerEditRoutes(app: express.Express) {
app.post('/api/auto-edit', acceptJsonJob('auto-edit', async (req, res) => {
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
}, (req) => {
  const { brief } = req.body ?? {};
  if (!brief || typeof brief !== 'string' || !brief.trim()) {
    return { status: 400, body: { error: '请输入视频主题或脚本需求后再生成自动剪辑方案。' } };
  }
  return null;
}));

app.post('/api/suggest-transition', acceptJsonJob('suggest-transition', async (req, res) => {
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
}, (req) => {
  const { currentClip, nextClip } = req.body ?? {};
  if (!currentClip || !nextClip) {
    return { status: 400, body: { error: '需要同时提供当前片段与下一片段信息才能分析转场。' } };
  }
  return null;
}));

app.post('/api/suggest-transition-sequence', acceptJsonJob('suggest-transition-sequence', async (req, res) => {
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
}, (req) => {
  const { timelineClips = [] } = req.body ?? {};
  if (!Array.isArray(timelineClips) || timelineClips.length === 0) {
    return { status: 400, body: { error: '时间线暂无片段，无法规划转场序列方案。' } };
  }
  return null;
}));

app.post('/api/match-color', acceptJsonJob('match-color', async (req, res) => {
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
}, (req) => {
  const { frameBase64 } = req.body ?? {};
  if (!frameBase64 || typeof frameBase64 !== 'string') {
    return { status: 400, body: { error: '未能获取当前片段画面帧，请先确认素材已加载。' } };
  }
  return null;
}));

app.post('/api/tag-media', acceptJsonJob('tag-media', async (req, res) => {
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
}, (req) => {
  const { frameBase64 } = req.body ?? {};
  if (!frameBase64 || typeof frameBase64 !== 'string') {
    return { status: 400, body: { error: '未能捕获素材画面帧，无法进行 AI 标签识别。' } };
  }
  return null;
}));

app.post('/api/suggest-bgm', acceptJsonJob('suggest-bgm', async (req, res) => {
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
}));

app.post('/api/transcribe-subtitles', acceptJsonJob('transcribe-subtitles', async (req, res) => {
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
}, (req) => {
  const { audioBase64, frameBase64 } = req.body ?? {};
  const hasAudio = typeof audioBase64 === 'string' && audioBase64.length > 0;
  const hasFrame = typeof frameBase64 === 'string' && frameBase64.length > 0;
  if (!hasAudio && !hasFrame) {
    return { status: 400, body: { error: '请提供包含语音的片段音轨，或先加载视频画面。' } };
  }
  return null;
}));

app.post('/api/suggest-sfx', acceptJsonJob('suggest-sfx', async (req, res) => {
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
}, (req) => {
  const { timelineNodes = [] } = req.body ?? {};
  if (!Array.isArray(timelineNodes) || timelineNodes.length === 0) {
    return { status: 400, body: { error: '时间线暂无视频片段节点，无法生成音效库推荐。' } };
  }
  return null;
}));
}
