import type {
  DigitalHumanActionId,
  DigitalHumanActionRecommendation,
  DigitalHumanCameraMotion,
  DigitalHumanCameraPresetId,
  DigitalHumanClipActionSuggestion,
  DigitalHumanEmotionAnalysis,
  DigitalHumanEmotionId,
  DigitalHumanFacialMuscles,
  DigitalHumanPhonemeAlignmentProfile,
  DigitalHumanPhonemeFrame,
  DigitalHumanProfile,
  DigitalHumanTargetLanguage,
  DigitalHumanVisemeClass,
  SubtitleSegment,
  TimelineClip,
  UiLanguage,
  VoiceoverCue,
  VoiceoverVoice,
} from '../types/studio';

function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.trim())}`;
}

export interface DigitalHumanPresetTemplate {
  id: string;
  name: string;
  roleLabel: string;
  baseVoice: VoiceoverVoice;
  accentColor: string;
  personaSummary: string;
  anchorStyleTags: string[];
  voiceDesignPrompt: string;
  avatarUrl: string;
}

export const BUILTIN_DIGITAL_HUMAN_PRESETS: DigitalHumanPresetTemplate[] = [
  {
    id: 'dh-preset-xinglan',
    name: '星澜 · 知性女主播',
    roleLabel: '好物解说 / 知识科普',
    baseVoice: 'Kore',
    accentColor: '#fb7185',
    personaSummary: '暖光演播室知性主播形象，眼神聚焦镜头，语调温柔有穿透力',
    anchorStyleTags: ['知性口播', '棚拍柔光', '亲和自然'],
    voiceDesignPrompt:
      'Warm, articulate, friendly female creator anchor with conversational pacing, crisp pronunciation, and natural studio warmth.',
    avatarUrl: svgToDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 540 720">
        <defs>
          <radialGradient id="bg1" cx="50%" cy="34%" r="68%">
            <stop offset="0%" stop-color="#3b1d2e"/>
            <stop offset="55%" stop-color="#191624"/>
            <stop offset="100%" stop-color="#0b0d12"/>
          </radialGradient>
          <linearGradient id="suit1" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#2a2d3e"/>
            <stop offset="100%" stop-color="#141720"/>
          </linearGradient>
          <linearGradient id="skin1" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#f7d5c2"/>
            <stop offset="100%" stop-color="#e5b39b"/>
          </linearGradient>
          <linearGradient id="hair1" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#281d25"/>
            <stop offset="100%" stop-color="#120d12"/>
          </linearGradient>
        </defs>
        <rect width="540" height="720" fill="url(#bg1)"/>
        <circle cx="270" cy="230" r="190" fill="#fb7185" opacity="0.14"/>
        <circle cx="110" cy="140" r="90" fill="#f472b6" opacity="0.08"/>
        <!-- Hair back -->
        <path d="M150 230 C140 120 395 110 390 235 L408 420 C355 445 185 445 135 420 Z" fill="url(#hair1)"/>
        <!-- Shoulders & Blazer -->
        <path d="M72 720 L102 522 C116 468 182 444 270 444 C358 444 424 468 438 522 L468 720 Z" fill="url(#suit1)"/>
        <path d="M214 446 L270 578 L326 446 Z" fill="#f4f4f5"/>
        <path d="M214 446 L246 535 L270 578 L195 520 Z" fill="#1e2230"/>
        <path d="M326 446 L294 535 L270 578 L345 520 Z" fill="#1e2230"/>
        <!-- Neck -->
        <rect x="238" y="366" width="64" height="92" rx="28" fill="#dfb098"/>
        <!-- Face -->
        <path d="M188 232 C188 156 352 156 352 232 C352 324 316 392 270 392 C224 392 188 324 188 232 Z" fill="url(#skin1)"/>
        <!-- Hair front bangs -->
        <path d="M174 236 C172 130 368 126 366 236 C350 184 314 166 266 174 C228 180 198 196 174 236 Z" fill="url(#hair1)"/>
        <!-- Eyes & Brows -->
        <path d="M210 234 Q228 224 246 232" stroke="#2c1e24" stroke-width="4.5" fill="none" stroke-linecap="round"/>
        <path d="M294 232 Q312 224 330 234" stroke="#2c1e24" stroke-width="4.5" fill="none" stroke-linecap="round"/>
        <ellipse cx="228" cy="256" rx="13" ry="9" fill="#ffffff"/>
        <circle cx="229" cy="256" r="6.5" fill="#231920"/>
        <circle cx="231.5" cy="253.5" r="2.2" fill="#ffffff"/>
        <ellipse cx="312" cy="256" rx="13" ry="9" fill="#ffffff"/>
        <circle cx="311" cy="256" r="6.5" fill="#231920"/>
        <circle cx="313.5" cy="253.5" r="2.2" fill="#ffffff"/>
        <!-- Blush & Nose -->
        <ellipse cx="212" cy="290" rx="16" ry="8" fill="#fb7185" opacity="0.2"/>
        <ellipse cx="328" cy="290" rx="16" ry="8" fill="#fb7185" opacity="0.2"/>
        <path d="M270 258 L266 296 Q270 301 277 297" stroke="#c98e75" stroke-width="3" fill="none" stroke-linecap="round"/>
        <!-- Smile -->
        <path d="M244 330 Q270 344 296 330" stroke="#c95b6b" stroke-width="4.5" fill="none" stroke-linecap="round"/>
        <!-- Studio Mic lapel -->
        <rect x="294" y="514" width="12" height="22" rx="4" fill="#18181b" stroke="#fb7185" stroke-width="1.5"/>
      </svg>
    `),
  },
  {
    id: 'dh-preset-ache',
    name: '阿澈 · 科技男主理人',
    roleLabel: '数码评测 / 商业干货',
    baseVoice: 'Charon',
    accentColor: '#38bdf8',
    personaSummary: '冷色调极客演播室主播，沉稳有说服力，适合产品讲解与行业拆解',
    anchorStyleTags: ['科技感', '沉稳解说', '极简棚拍'],
    voiceDesignPrompt:
      'Calm, authoritative yet approachable male tech host with steady mid-low tone, crisp diction, and confident narrative flow.',
    avatarUrl: svgToDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 540 720">
        <defs>
          <radialGradient id="bg2" cx="50%" cy="32%" r="70%">
            <stop offset="0%" stop-color="#14324a"/>
            <stop offset="55%" stop-color="#111827"/>
            <stop offset="100%" stop-color="#090c12"/>
          </radialGradient>
          <linearGradient id="skin2" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#efc8b0"/>
            <stop offset="100%" stop-color="#d8a58a"/>
          </linearGradient>
        </defs>
        <rect width="540" height="720" fill="url(#bg2)"/>
        <circle cx="270" cy="235" r="195" fill="#38bdf8" opacity="0.14"/>
        <!-- Hoodie / Jacket -->
        <path d="M62 720 L92 515 C110 458 182 436 270 436 C358 436 430 458 448 515 L478 720 Z" fill="#18202c"/>
        <path d="M200 442 L270 555 L340 442 Z" fill="#0f172a"/>
        <path d="M225 446 L270 538 L315 446 Z" fill="#e2e8f0"/>
        <!-- Neck -->
        <rect x="234" y="362" width="72" height="90" rx="28" fill="#cfa086"/>
        <!-- Face -->
        <path d="M184 228 C184 152 356 152 356 228 C356 322 320 390 270 390 C220 390 184 322 184 228 Z" fill="url(#skin2)"/>
        <!-- Hair -->
        <path d="M174 228 C166 124 374 118 366 228 C346 184 316 172 270 172 C222 172 192 186 174 228 Z" fill="#181b24"/>
        <!-- Glasses -->
        <rect x="200" y="238" width="54" height="36" rx="9" fill="none" stroke="#38bdf8" stroke-width="3.5" opacity="0.85"/>
        <rect x="286" y="238" width="54" height="36" rx="9" fill="none" stroke="#38bdf8" stroke-width="3.5" opacity="0.85"/>
        <line x1="254" y1="254" x2="286" y2="254" stroke="#38bdf8" stroke-width="3"/>
        <!-- Eyes -->
        <circle cx="227" cy="256" r="6" fill="#18181b"/>
        <circle cx="229" cy="254" r="2" fill="#ffffff"/>
        <circle cx="313" cy="256" r="6" fill="#18181b"/>
        <circle cx="315" cy="254" r="2" fill="#ffffff"/>
        <path d="M206 226 Q227 219 248 225" stroke="#181b24" stroke-width="5" fill="none" stroke-linecap="round"/>
        <path d="M292 225 Q313 219 334 226" stroke="#181b24" stroke-width="5" fill="none" stroke-linecap="round"/>
        <!-- Nose & Mouth -->
        <path d="M270 256 L266 296 Q271 301 278 297" stroke="#b9836a" stroke-width="3" fill="none" stroke-linecap="round"/>
        <path d="M244 332 Q270 340 296 332" stroke="#a65a52" stroke-width="4.5" fill="none" stroke-linecap="round"/>
      </svg>
    `),
  },
  {
    id: 'dh-preset-xiaoju',
    name: '小橘 · 活力种草达人',
    roleLabel: '生活 Vlog / 探店带货',
    baseVoice: 'Puck',
    accentColor: '#34d399',
    personaSummary: '清新元气短视频达人分身，语速轻快抓人，适合前 3 秒黄金钩子开场',
    anchorStyleTags: ['元气感', '节奏轻快', '种草爆款'],
    voiceDesignPrompt:
      'Energetic, bright, expressive short-video lifestyle creator with upbeat cadence, natural smile in voice, and punchy hook delivery.',
    avatarUrl: svgToDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 540 720">
        <defs>
          <radialGradient id="bg3" cx="50%" cy="34%" r="68%">
            <stop offset="0%" stop-color="#133a34"/>
            <stop offset="55%" stop-color="#121c22"/>
            <stop offset="100%" stop-color="#090c10"/>
          </radialGradient>
          <linearGradient id="skin3" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#fae0ce"/>
            <stop offset="100%" stop-color="#eabca3"/>
          </linearGradient>
        </defs>
        <rect width="540" height="720" fill="url(#bg3)"/>
        <circle cx="270" cy="230" r="190" fill="#34d399" opacity="0.14"/>
        <!-- Knit sweater -->
        <path d="M72 720 L102 520 C118 468 186 446 270 446 C354 446 422 468 438 520 L468 720 Z" fill="#1f3a36"/>
        <ellipse cx="270" cy="466" rx="68" ry="26" fill="#34d399" opacity="0.28"/>
        <!-- Hair bun & side -->
        <circle cx="270" cy="112" r="46" fill="#2c1d18"/>
        <path d="M168 232 C164 134 376 134 372 232 L380 326 L160 326 Z" fill="#2c1d18"/>
        <!-- Neck -->
        <rect x="240" y="366" width="60" height="88" rx="26" fill="#e1b39a"/>
        <!-- Face -->
        <path d="M190 234 C190 158 350 158 350 234 C350 322 314 388 270 388 C226 388 190 322 190 234 Z" fill="url(#skin3)"/>
        <path d="M178 232 C180 144 360 144 362 232 C340 184 298 176 268 186 C238 176 202 192 178 232 Z" fill="#2c1d18"/>
        <!-- Eyes & Smile -->
        <path d="M214 234 Q230 226 246 234" stroke="#2c1d18" stroke-width="4" fill="none" stroke-linecap="round"/>
        <path d="M294 234 Q310 226 326 234" stroke="#2c1d18" stroke-width="4" fill="none" stroke-linecap="round"/>
        <circle cx="230" cy="256" r="8" fill="#1e1513"/>
        <circle cx="232.5" cy="253" r="2.6" fill="#ffffff"/>
        <circle cx="310" cy="256" r="8" fill="#1e1513"/>
        <circle cx="312.5" cy="253" r="2.6" fill="#ffffff"/>
        <ellipse cx="212" cy="288" rx="15" ry="7" fill="#fb7185" opacity="0.24"/>
        <ellipse cx="328" cy="288" rx="15" ry="7" fill="#fb7185" opacity="0.24"/>
        <path d="M242 326 Q270 348 298 326" stroke="#d95c68" stroke-width="5" fill="none" stroke-linecap="round"/>
      </svg>
    `),
  },
];

// Cache 25fps amplitude envelopes per cue id for audio-driven digital human motion & lip-pulse
const envelopeCache = new Map<string, { fps: number; bins: Float32Array; durationSec: number }>();
const envelopeInFlight = new Set<string>();

function computeWavEnvelopeSync(
  b64: string,
  fps = 25
): { fps: number; bins: Float32Array; durationSec: number } | null {
  try {
    const clean = b64.includes(',') ? b64.split(',')[1] : b64;
    const raw = atob(clean);
    if (raw.length < 44) return null;
    if (raw.slice(0, 4) !== 'RIFF' || raw.slice(8, 12) !== 'WAVE') return null;

    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    const view = new DataView(bytes.buffer);

    let sampleRate = 24000;
    let numChannels = 1;
    let bitsPerSample = 16;
    let dataOffset = 44;
    let dataSize = bytes.length - 44;

    let pos = 12;
    while (pos + 8 <= bytes.length) {
      const chunkId = raw.slice(pos, pos + 4);
      const chunkSize = view.getUint32(pos + 4, true);
      if (chunkId === 'fmt ') {
        numChannels = view.getUint16(pos + 10, true) || 1;
        sampleRate = view.getUint32(pos + 12, true) || 24000;
        bitsPerSample = view.getUint16(pos + 22, true) || 16;
      } else if (chunkId === 'data') {
        dataOffset = pos + 8;
        dataSize = Math.min(chunkSize, bytes.length - dataOffset);
        break;
      }
      pos += 8 + chunkSize + (chunkSize % 2);
    }

    const bytesPerSample = Math.max(1, bitsPerSample / 8);
    const totalSamples = Math.floor(dataSize / (bytesPerSample * numChannels));
    const durationSec = totalSamples / Math.max(8000, sampleRate);
    const binCount = Math.max(1, Math.ceil(durationSec * fps));
    const samplesPerBin = Math.max(1, Math.floor(sampleRate / fps));
    const bins = new Float32Array(binCount);

    for (let b = 0; b < binCount; b++) {
      const startSample = b * samplesPerBin;
      const endSample = Math.min(totalSamples, startSample + samplesPerBin);
      let sumSq = 0;
      let count = 0;
      const step = Math.max(1, Math.floor((endSample - startSample) / 64));
      for (let s = startSample; s < endSample; s += step) {
        const byteIdx = dataOffset + s * numChannels * bytesPerSample;
        if (byteIdx + 1 >= bytes.length) break;
        const sample = bitsPerSample === 16 ? view.getInt16(byteIdx, true) / 32768 : 0;
        sumSq += sample * sample;
        count++;
      }
      const rms = count > 0 ? Math.sqrt(sumSq / count) : 0;
      bins[b] = Math.min(1, rms * 3.8);
    }

    return { fps, bins, durationSec };
  } catch {
    return null;
  }
}

export function primeVoiceEnvelopeCache(cues: VoiceoverCue[]): void {
  for (const cue of cues) {
    if (!cue.audioBase64) continue;
    const key = `${cue.id}_${cue.audioBase64.slice(0, 24)}`;
    if (envelopeCache.has(key) || envelopeInFlight.has(key)) continue;

    if (cue.mimeType?.includes('wav')) {
      const syncEnv = computeWavEnvelopeSync(cue.audioBase64);
      if (syncEnv) {
        envelopeCache.set(key, syncEnv);
        continue;
      }
    }

    envelopeInFlight.add(key);
    const AudioCtx =
      typeof window !== 'undefined'
        ? window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        : null;
    if (!AudioCtx) {
      envelopeInFlight.delete(key);
      continue;
    }

    void (async () => {
      let ctx: AudioContext | null = null;
      try {
        const clean = cue.audioBase64.includes(',')
          ? cue.audioBase64.split(',')[1]
          : cue.audioBase64;
        const bin = atob(clean);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        ctx = new AudioCtx();
        const buf = await ctx.decodeAudioData(bytes.buffer.slice(0));
        const ch = buf.getChannelData(0);
        const fps = 25;
        const sr = buf.sampleRate || 44100;
        const samplesPerBin = Math.max(1, Math.floor(sr / fps));
        const binCount = Math.max(1, Math.ceil(buf.duration * fps));
        const bins = new Float32Array(binCount);
        for (let b = 0; b < binCount; b++) {
          const start = b * samplesPerBin;
          const end = Math.min(ch.length, start + samplesPerBin);
          let sumSq = 0;
          const step = Math.max(1, Math.floor((end - start) / 48));
          let cnt = 0;
          for (let i = start; i < end; i += step) {
            sumSq += ch[i] * ch[i];
            cnt++;
          }
          bins[b] = Math.min(1, (cnt > 0 ? Math.sqrt(sumSq / cnt) : 0) * 4.2);
        }
        envelopeCache.set(key, { fps, bins, durationSec: buf.duration });
      } catch {
        // Fallback synthetic cadence on decode error
      } finally {
        envelopeInFlight.delete(key);
        if (ctx) void ctx.close().catch(() => undefined);
      }
    })();
  }
}

/**
 * Returns instantaneous voice activity (0..1) at timeline timeSec for driving digital human lip & halo animations.
 */
export function getVoiceActivityAtTime(
  cues: VoiceoverCue[] | undefined,
  timeSec: number,
  voiceoverEnabled = true
): number {
  if (!voiceoverEnabled || !cues || cues.length === 0) return 0;

  for (const cue of cues) {
    const rate = cue.playbackRate && cue.playbackRate > 0 ? cue.playbackRate : 1;
    const rawDur = cue.audioDurationSec ?? cue.duration;
    const effectiveDur = rawDur / rate;
    if (timeSec >= cue.startTime && timeSec <= cue.startTime + effectiveDur) {
      const localAudioTime = (timeSec - cue.startTime) * rate;
      const key = `${cue.id}_${cue.audioBase64?.slice(0, 24) || 'none'}`;
      let env = envelopeCache.get(key);
      if (!env && cue.audioBase64 && cue.mimeType?.includes('wav')) {
        const parsed = computeWavEnvelopeSync(cue.audioBase64);
        if (parsed) {
          envelopeCache.set(key, parsed);
          env = parsed;
        }
      }
      if (env && env.bins.length > 0) {
        const idx = Math.min(
          env.bins.length - 1,
          Math.max(0, Math.floor(localAudioTime * env.fps))
        );
        return env.bins[idx];
      }
      // Natural syllable-cadence fallback before WebM async decode completes
      const syllableWave =
        0.48 +
        0.32 * Math.sin(localAudioTime * 19.5) +
        0.18 * Math.cos(localAudioTime * 11.2);
      return Math.max(0.12, Math.min(1, syllableWave));
    }
  }
  return 0;
}

export function createDigitalHumanPresetProfile(
  preset: DigitalHumanPresetTemplate
): DigitalHumanProfile {
  return {
    id: preset.id,
    name: preset.name,
    createdAt: new Date().toISOString(),
    avatarUrl: preset.avatarUrl,
    avatarMediaType: 'image',
    personaSummary: preset.personaSummary,
    anchorStyleTags: preset.anchorStyleTags,
    baseVoice: preset.baseVoice,
    voiceDesignPrompt: preset.voiceDesignPrompt,
    accentColor: preset.accentColor,
    defaultAction: 'explain',
  };
}

export interface DigitalHumanActionTemplate {
  id: DigitalHumanActionId;
  label: string;
  englishTag: string;
  badgeColor: string;
  summary: string;
  recommendedIntensity: number;
  thumbnailUrl: string;
}

export const DIGITAL_HUMAN_ACTION_TEMPLATES: DigitalHumanActionTemplate[] = [
  {
    id: 'explain',
    label: '讲解',
    englishTag: 'EXPLAIN',
    badgeColor: '#38bdf8',
    summary: '稳重双节拍手势与核心观点强调，适合干货科普与产品介绍',
    recommendedIntensity: 1.0,
    thumbnailUrl: svgToDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 96">
        <defs>
          <radialGradient id="act-bg-exp" cx="50%" cy="35%" r="70%">
            <stop offset="0%" stop-color="#14324a"/>
            <stop offset="100%" stop-color="#0b0e14"/>
          </radialGradient>
        </defs>
        <rect width="120" height="96" rx="10" fill="url(#act-bg-exp)"/>
        <circle cx="60" cy="30" r="13" fill="#e2e8f0" opacity="0.92"/>
        <path d="M35 84 C37 59 46 50 60 50 C74 50 83 59 85 84 Z" fill="#38bdf8" opacity="0.32"/>
        <path d="M39 84 C41 62 49 54 60 54 C71 54 79 62 81 84" stroke="#7dd3fc" stroke-width="2.5" fill="none"/>
        <!-- Presenter open hands gesture -->
        <path d="M40 66 Q30 58 34 48" stroke="#38bdf8" stroke-width="4" stroke-linecap="round" fill="none"/>
        <path d="M80 66 Q90 58 86 48" stroke="#38bdf8" stroke-width="4" stroke-linecap="round" fill="none"/>
        <circle cx="34" cy="46" r="4" fill="#bae6fd"/>
        <circle cx="86" cy="46" r="4" fill="#bae6fd"/>
        <!-- Speaking cadence bars -->
        <rect x="52" y="45" width="3" height="6" rx="1.5" fill="#38bdf8"/>
        <rect x="58.5" y="42" width="3" height="10" rx="1.5" fill="#7dd3fc"/>
        <rect x="65" y="45" width="3" height="6" rx="1.5" fill="#38bdf8"/>
      </svg>
    `),
  },
  {
    id: 'point',
    label: '指引',
    englishTag: 'POINT',
    badgeColor: '#fb7185',
    summary: '侧身指向画面重点区域，引导观众视线聚焦实拍亮点',
    recommendedIntensity: 1.15,
    thumbnailUrl: svgToDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 96">
        <defs>
          <radialGradient id="act-bg-pt" cx="45%" cy="35%" r="70%">
            <stop offset="0%" stop-color="#3f1726"/>
            <stop offset="100%" stop-color="#0b0e14"/>
          </radialGradient>
        </defs>
        <rect width="120" height="96" rx="10" fill="url(#act-bg-pt)"/>
        <circle cx="48" cy="30" r="12.5" fill="#f4f4f5" opacity="0.94"/>
        <path d="M24 84 C26 60 35 50 48 50 C60 50 67 58 70 84 Z" fill="#fb7185" opacity="0.34"/>
        <!-- Pointing arm + index finger -->
        <path d="M62 60 L92 43" stroke="#fda4af" stroke-width="4.5" stroke-linecap="round"/>
        <circle cx="95" cy="41" r="4.5" fill="#fb7185"/>
        <!-- Target focus rings & arrow -->
        <circle cx="95" cy="41" r="10" fill="none" stroke="#fb7185" stroke-width="1.5" stroke-dasharray="3 2"/>
        <path d="M78 26 L94 24 L90 34" stroke="#fecdd3" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `),
  },
  {
    id: 'wave',
    label: '挥手',
    englishTag: 'WAVE',
    badgeColor: '#34d399',
    summary: '高举手掌轻快挥动并伴随招呼倾角，适合开场 Hook 与互动收尾',
    recommendedIntensity: 1.1,
    thumbnailUrl: svgToDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 96">
        <defs>
          <radialGradient id="act-bg-wv" cx="50%" cy="35%" r="70%">
            <stop offset="0%" stop-color="#123a32"/>
            <stop offset="100%" stop-color="#0b0e14"/>
          </radialGradient>
        </defs>
        <rect width="120" height="96" rx="10" fill="url(#act-bg-wv)"/>
        <circle cx="56" cy="31" r="12.5" fill="#ecfdf5" opacity="0.94"/>
        <path d="M32 84 C34 60 43 51 56 51 C69 51 77 60 79 84 Z" fill="#34d399" opacity="0.32"/>
        <!-- Raised waving arm & palm -->
        <path d="M74 62 Q86 48 89 32" stroke="#6ee7b7" stroke-width="4.5" stroke-linecap="round" fill="none"/>
        <ellipse cx="90" cy="28" rx="6" ry="7.5" transform="rotate(14 90 28)" fill="#a7f3d0"/>
        <!-- Wave motion arcs -->
        <path d="M99 20 Q105 26 101 34" stroke="#34d399" stroke-width="2.2" stroke-linecap="round" fill="none"/>
        <path d="M78 19 Q73 25 76 32" stroke="#34d399" stroke-width="2.2" stroke-linecap="round" fill="none"/>
      </svg>
    `),
  },
  {
    id: 'amaze',
    label: '惊叹',
    englishTag: 'AMAZE',
    badgeColor: '#fbbf24',
    summary: '能量推镜微震动效配合高能放射光线，强化爆点反转与吸睛瞬间',
    recommendedIntensity: 1.25,
    thumbnailUrl: svgToDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 96">
        <defs>
          <radialGradient id="act-bg-am" cx="50%" cy="38%" r="70%">
            <stop offset="0%" stop-color="#452b0e"/>
            <stop offset="100%" stop-color="#0b0e14"/>
          </radialGradient>
        </defs>
        <rect width="120" height="96" rx="10" fill="url(#act-bg-am)"/>
        <!-- Exclamation burst lines -->
        <line x1="25" y1="22" x2="36" y2="28" stroke="#fbbf24" stroke-width="2.4" stroke-linecap="round"/>
        <line x1="95" y1="22" x2="84" y2="28" stroke="#fbbf24" stroke-width="2.4" stroke-linecap="round"/>
        <line x1="60" y1="7" x2="60" y2="15" stroke="#fde68a" stroke-width="2.6" stroke-linecap="round"/>
        <circle cx="60" cy="34" r="13" fill="#fef3c7" opacity="0.95"/>
        <path d="M36 84 C38 61 47 52 60 52 C73 52 82 61 84 84 Z" fill="#fbbf24" opacity="0.34"/>
        <!-- Raised startled hands -->
        <path d="M40 66 Q29 52 33 41" stroke="#fcd34d" stroke-width="4" stroke-linecap="round" fill="none"/>
        <path d="M80 66 Q91 52 87 41" stroke="#fcd34d" stroke-width="4" stroke-linecap="round" fill="none"/>
        <circle cx="33" cy="39" r="4" fill="#fde68a"/>
        <circle cx="87" cy="39" r="4" fill="#fde68a"/>
        <!-- Exclamation pill -->
        <rect x="94" y="38" width="12" height="20" rx="5" fill="#f59e0b" opacity="0.9"/>
        <text x="100" y="52" text-anchor="middle" font-size="13" font-weight="800" fill="#090b0f">!</text>
      </svg>
    `),
  },
  {
    id: 'nod',
    label: '点头',
    englishTag: 'NOD',
    badgeColor: '#a78bfa',
    summary: '周期性自然点头与肯定光环，适合口碑证言、观点认同与测评总结',
    recommendedIntensity: 0.95,
    thumbnailUrl: svgToDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 96">
        <defs>
          <radialGradient id="act-bg-nod" cx="50%" cy="35%" r="70%">
            <stop offset="0%" stop-color="#2a1f4b"/>
            <stop offset="100%" stop-color="#0b0e14"/>
          </radialGradient>
        </defs>
        <rect width="120" height="96" rx="10" fill="url(#act-bg-nod)"/>
        <circle cx="56" cy="34" r="13" fill="#ede9fe" opacity="0.94"/>
        <path d="M32 84 C34 61 43 52 56 52 C69 52 78 61 80 84 Z" fill="#a78bfa" opacity="0.32"/>
        <!-- Vertical nod arrows -->
        <path d="M86 24 L86 44 M81 39 L86 45 L91 39" stroke="#c4b5fd" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        <path d="M80 18 L92 18" stroke="#a78bfa" stroke-width="2" stroke-linecap="round"/>
        <!-- Endorsement checkmark -->
        <circle cx="28" cy="34" r="9" fill="#8b5cf6" opacity="0.28" stroke="#a78bfa" stroke-width="1.5"/>
        <path d="M24 34 L27 37 L33 30" stroke="#ddd6fe" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `),
  },
  {
    id: 'thumbs-up',
    label: '点赞',
    englishTag: 'LIKE',
    badgeColor: '#f472b6',
    summary: '前倾比赞手势配合星芒推荐动效，强力提升片尾关注与转化互动',
    recommendedIntensity: 1.15,
    thumbnailUrl: svgToDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 96">
        <defs>
          <radialGradient id="act-bg-tu" cx="50%" cy="35%" r="70%">
            <stop offset="0%" stop-color="#441837"/>
            <stop offset="100%" stop-color="#0b0e14"/>
          </radialGradient>
        </defs>
        <rect width="120" height="96" rx="10" fill="url(#act-bg-tu)"/>
        <circle cx="52" cy="31" r="12.5" fill="#fce7f3" opacity="0.94"/>
        <path d="M28 84 C30 60 39 51 52 51 C65 51 74 60 76 84 Z" fill="#f472b6" opacity="0.34"/>
        <!-- Thumbs up hand -->
        <rect x="81" y="42" width="15" height="14" rx="4" fill="#f9a8d4"/>
        <path d="M86 42 L88 28 C89 24 94 25 94 29 L93 42" fill="#fbcfe8"/>
        <circle cx="96" cy="20" r="2.2" fill="#fde68a"/>
        <circle cx="77" cy="28" r="1.8" fill="#f472b6"/>
      </svg>
    `),
  },
];

export function getDigitalHumanActionTemplate(
  actionId?: DigitalHumanActionId
): DigitalHumanActionTemplate {
  return (
    DIGITAL_HUMAN_ACTION_TEMPLATES.find((t) => t.id === actionId) ??
    DIGITAL_HUMAN_ACTION_TEMPLATES[0]
  );
}

const ACTION_EN_META: Record<DigitalHumanActionId, { label: string; summary: string }> = {
  explain: {
    label: 'Explain',
    summary: 'Balanced two-beat presenter gestures for tutorials, insights, and product walkthroughs.',
  },
  point: {
    label: 'Point',
    summary: 'Side-leaning directional cue guiding viewer attention to key footage details.',
  },
  wave: {
    label: 'Wave',
    summary: 'Raised hand wave with welcoming tilt, ideal for 3s hooks and friendly outros.',
  },
  amaze: {
    label: 'Amaze',
    summary: 'Energetic zoom micro-shake with radial accent lines to amplify reveals and hooks.',
  },
  nod: {
    label: 'Nod',
    summary: 'Natural affirmative head nods and endorsement halo for reviews and summaries.',
  },
  'thumbs-up': {
    label: 'Thumbs Up',
    summary: 'Forward thumbs-up gesture with star accents to boost follows and CTAs.',
  },
};

export function getLocalizedActionTemplate(
  actionId: DigitalHumanActionId | undefined,
  lang: UiLanguage = 'zh-CN'
): DigitalHumanActionTemplate {
  const base = getDigitalHumanActionTemplate(actionId);
  if (lang === 'zh-CN') return base;
  const en = ACTION_EN_META[base.id];
  return en ? { ...base, label: en.label, summary: en.summary } : base;
}

export interface DigitalHumanEmotionPreset {
  id: DigitalHumanEmotionId;
  label: string;
  englishTag: string;
  badgeColor: string;
  description: string;
  muscles: DigitalHumanFacialMuscles;
}

export const DIGITAL_HUMAN_EMOTION_PRESETS: DigitalHumanEmotionPreset[] = [
  {
    id: 'excited',
    label: '兴奋',
    englishTag: 'EXCITED',
    badgeColor: '#f59e0b',
    description: '高张口度、明显挑眉与嘴角上扬，头部节奏明快，适合爆款种草与高能开场',
    muscles: {
      jawOpenness: 1.38,
      browLift: 0.68,
      eyeSquint: 0.28,
      smileCurve: 0.78,
      headTension: 1.32,
      lipSyncSharpness: 1.35,
    },
  },
  {
    id: 'serious',
    label: '严肃',
    englishTag: 'SERIOUS',
    badgeColor: '#38bdf8',
    description: '眉弓微锁沉稳、嘴角平直收敛、头部低幅稳定，适合硬核评测、财经与观点输出',
    muscles: {
      jawOpenness: 0.88,
      browLift: -0.55,
      eyeSquint: 0.52,
      smileCurve: -0.28,
      headTension: 0.68,
      lipSyncSharpness: 1.24,
    },
  },
  {
    id: 'suspense',
    label: '悬疑',
    englishTag: 'SUSPENSE',
    badgeColor: '#a855f7',
    description: '眉峰紧绷挑起、眼神锐利聚焦、暗调微咬字张力，适合揭秘反转与剧情钩子',
    muscles: {
      jawOpenness: 0.94,
      browLift: 0.34,
      eyeSquint: 0.72,
      smileCurve: -0.38,
      headTension: 0.82,
      lipSyncSharpness: 1.18,
    },
  },
  {
    id: 'warm',
    label: '亲和',
    englishTag: 'WARM',
    badgeColor: '#34d399',
    description: '柔和微笑曲线与自然松弛的眉眼舒展，适合日常 Vlog、分享与陪伴解说',
    muscles: {
      jawOpenness: 1.12,
      browLift: 0.25,
      eyeSquint: 0.2,
      smileCurve: 0.65,
      headTension: 0.94,
      lipSyncSharpness: 1.05,
    },
  },
  {
    id: 'neutral',
    label: '自然',
    englishTag: 'NEUTRAL',
    badgeColor: '#94a3b8',
    description: '均衡演播室标准面部肌肉参数，口型清晰稳定，适配常规解说',
    muscles: {
      jawOpenness: 1.0,
      browLift: 0.0,
      eyeSquint: 0.15,
      smileCurve: 0.2,
      headTension: 1.0,
      lipSyncSharpness: 1.0,
    },
  },
];

export function getDigitalHumanEmotionPreset(
  emotionId?: DigitalHumanEmotionId
): DigitalHumanEmotionPreset {
  return (
    DIGITAL_HUMAN_EMOTION_PRESETS.find((e) => e.id === emotionId) ??
    DIGITAL_HUMAN_EMOTION_PRESETS[4]
  );
}

const EMOTION_EN_META: Record<DigitalHumanEmotionId, { label: string; description: string }> = {
  excited: {
    label: 'Excited',
    description: 'Wide jaw opening, raised brows, bright smile, and lively head rhythm for viral hooks.',
  },
  serious: {
    label: 'Serious',
    description: 'Focused brows, composed lips, and steady posture for tech reviews and analysis.',
  },
  suspense: {
    label: 'Suspense',
    description: 'Sharp brow tension, focused eyes, and deliberate articulation for plot twists.',
  },
  warm: {
    label: 'Warm',
    description: 'Gentle smile curve and relaxed expression suited for vlogs and lifestyle sharing.',
  },
  neutral: {
    label: 'Neutral',
    description: 'Balanced studio muscle baseline with crisp, natural lip articulation.',
  },
};

export function getLocalizedEmotionPreset(
  emotionId: DigitalHumanEmotionId | undefined,
  lang: UiLanguage = 'zh-CN'
): DigitalHumanEmotionPreset {
  const base = getDigitalHumanEmotionPreset(emotionId);
  if (lang === 'zh-CN') return base;
  const en = EMOTION_EN_META[base.id];
  return en ? { ...base, label: en.label, description: en.description } : base;
}

export function clampFacialMuscles(
  raw?: Partial<DigitalHumanFacialMuscles> | null
): DigitalHumanFacialMuscles {
  const clamp = (v: unknown, min: number, max: number, fb: number) => {
    const n = typeof v === 'number' && Number.isFinite(v) ? v : fb;
    return Number(Math.max(min, Math.min(max, n)).toFixed(2));
  };
  return {
    jawOpenness: clamp(raw?.jawOpenness, 0.5, 1.6, 1.0),
    browLift: clamp(raw?.browLift, -1.0, 1.0, 0.0),
    eyeSquint: clamp(raw?.eyeSquint, 0.0, 1.0, 0.18),
    smileCurve: clamp(raw?.smileCurve, -0.6, 1.0, 0.2),
    headTension: clamp(raw?.headTension, 0.4, 1.5, 1.0),
    lipSyncSharpness: clamp(raw?.lipSyncSharpness, 0.6, 1.6, 1.0),
  };
}

/**
 * Analyzes spoken audio prosody (RMS energy, zero-crossing pitch proxy variance, syllable burst rate, pause ratio)
 * plus optional script punctuation cues to infer vocal emotion and tune digital human facial muscle drive parameters.
 */
export async function analyzeAudioProsodyForEmotion(
  audioBase64?: string,
  _mimeType?: string,
  scriptText?: string,
  uiLang: UiLanguage = 'zh-CN'
): Promise<DigitalHumanEmotionAnalysis> {
  let energyRms = 0.22;
  let pitchVariance = 0.28;
  let tempoBurstRate = 2.6;
  let pauseRatio = 0.22;

  if (audioBase64 && typeof window !== 'undefined') {
    let ctx: AudioContext | null = null;
    try {
      const clean = audioBase64.includes(',') ? audioBase64.split(',')[1] : audioBase64;
      const bin = atob(clean);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new AudioCtx();
      const buf = await ctx.decodeAudioData(bytes.buffer.slice(0));
      const ch = buf.getChannelData(0);
      const sr = buf.sampleRate || 24000;
      const frameLen = Math.max(256, Math.floor(sr * 0.03)); // 30ms frames
      const frameRms: number[] = [];
      const frameZcr: number[] = [];

      for (let i = 0; i < ch.length; i += frameLen) {
        const end = Math.min(ch.length, i + frameLen);
        let sq = 0;
        let zc = 0;
        for (let j = i + 1; j < end; j++) {
          sq += ch[j] * ch[j];
          if ((ch[j] >= 0 && ch[j - 1] < 0) || (ch[j] < 0 && ch[j - 1] >= 0)) {
            zc++;
          }
        }
        const n = Math.max(1, end - i);
        frameRms.push(Math.sqrt(sq / n));
        frameZcr.push(zc / n);
      }

      if (frameRms.length > 0) {
        const avgRms = frameRms.reduce((a, b) => a + b, 0) / frameRms.length;
        energyRms = Number(Math.min(1, avgRms * 3.5).toFixed(3));

        const pauseFrames = frameRms.filter((r) => r < Math.max(0.012, avgRms * 0.35)).length;
        pauseRatio = Number((pauseFrames / frameRms.length).toFixed(3));

        const voicedZcr = frameZcr.filter((_, idx) => frameRms[idx] >= Math.max(0.015, avgRms * 0.4));
        if (voicedZcr.length > 1) {
          const meanZ = voicedZcr.reduce((a, b) => a + b, 0) / voicedZcr.length;
          const varZ =
            voicedZcr.reduce((a, b) => a + Math.pow(b - meanZ, 2), 0) / voicedZcr.length;
          pitchVariance = Number(Math.min(1, Math.sqrt(varZ) * 14).toFixed(3));
        }

        let bursts = 0;
        const threshold = Math.max(0.03, avgRms * 1.15);
        for (let i = 1; i < frameRms.length; i++) {
          if (frameRms[i] >= threshold && frameRms[i - 1] < threshold) {
            bursts++;
          }
        }
        tempoBurstRate = Number((bursts / Math.max(0.8, buf.duration)).toFixed(2));
      }
    } catch {
      // Keep clean default acoustic baselines if decode fails
    } finally {
      if (ctx) void ctx.close().catch(() => undefined);
    }
  }

  const text = (scriptText || '').trim();
  const hasSuspenseCue =
    /[？?…]|竟然|真相|千万别|小心|秘密|为什么|吓人|细思极恐|背后|\b(secret|truth|why|warning|careful|twist)\b/i.test(text);
  const hasExcitedCue =
    /[！!]|太绝|爆款|冲|必看|超值|哇|天呐|搞定|惊艳|福利|\b(amazing|insane|wow|must|unbelievable|game-changer)\b/i.test(text);
  const hasSeriousCue =
    /评测|实测|数据|核心|警示|警告|对比|原理|避坑|报告|专业|\b(review|data|benchmark|analysis|compare|warning)\b/i.test(text);

  let emotion: DigitalHumanEmotionId = 'neutral';
  let confidence = 0.78;
  let toneSummary =
    uiLang === 'en'
      ? 'Balanced vocal cadence detected; applied natural studio facial muscle drive.'
      : '音频语调平稳均衡，已匹配自然演播室面部肌肉驱动。';

  if (hasSuspenseCue || (pauseRatio >= 0.32 && pitchVariance >= 0.25 && energyRms < 0.36)) {
    emotion = 'suspense';
    confidence = 0.86;
    toneSummary =
      uiLang === 'en'
        ? `Extended pause ratio (${Math.round(pauseRatio * 100)}%) and pitch contrast detected; boosted brow tension and focused gaze.`
        : `检测到语调停顿拉长（停顿比 ${Math.round(pauseRatio * 100)}%）与高低音落差，自动增强眉峰紧绷与锐利聚焦眼神参数。`;
  } else if (
    (energyRms >= 0.28 && tempoBurstRate >= 2.6) ||
    (hasExcitedCue && energyRms >= 0.2)
  ) {
    emotion = 'excited';
    confidence = 0.89;
    toneSummary =
      uiLang === 'en'
        ? `High vocal energy and syllable bursts (${tempoBurstRate.toFixed(1)}/s) detected; amplified jaw opening, brow lift, and smile curve.`
        : `检测到高声压能量与高频音节爆发（${tempoBurstRate.toFixed(1)} 次/秒），自动放大张口幅度、挑眉张力与嘴角上扬曲线。`;
  } else if (
    hasSeriousCue ||
    (pitchVariance < 0.26 && energyRms >= 0.16 && tempoBurstRate < 2.8)
  ) {
    emotion = 'serious';
    confidence = 0.84;
    toneSummary =
      uiLang === 'en'
        ? `Steady low-variance voice (${pitchVariance.toFixed(2)}) detected; tightened brow posture and articulation sharpness.`
        : `检测到声线沉稳低波动（语调方差 ${pitchVariance.toFixed(2)}），自动收敛微笑弧度并加强眉弓沉稳与咬字锐度。`;
  } else if (energyRms >= 0.14 && pauseRatio < 0.28) {
    emotion = 'warm';
    confidence = 0.81;
    toneSummary =
      uiLang === 'en'
        ? 'Smooth, approachable pacing detected; matched warm smile and relaxed facial rig.'
        : '语速柔和流畅、音量分布均匀，已匹配亲和微笑与松弛自然的面部肌肉参数。';
  }

  const basePreset = getLocalizedEmotionPreset(emotion, uiLang);
  const energyDelta = Math.max(-0.12, Math.min(0.18, (energyRms - 0.22) * 0.75));
  const muscles = clampFacialMuscles({
    ...basePreset.muscles,
    jawOpenness: basePreset.muscles.jawOpenness + energyDelta,
    headTension: basePreset.muscles.headTension + (tempoBurstRate - 2.5) * 0.04,
  });

  return {
    emotion,
    emotionLabel: basePreset.label,
    confidence,
    toneSummary,
    prosodyMetrics: {
      energyRms,
      pitchVariance,
      tempoBurstRate,
      pauseRatio,
    },
    muscles,
    analyzedAt: new Date().toISOString(),
  };
}

function classifySingleContextAction(params: {
  text: string;
  label?: string;
  hookTag?: string;
  clipIndex: number;
  totalClips: number;
  uiLang?: UiLanguage;
}): {
  action: DigitalHumanActionId;
  secondary: DigitalHumanActionId;
  stage: string;
  reason: string;
  confidence: number;
} {
  const { text, label = '', hookTag = '', clipIndex, totalClips, uiLang = 'zh-CN' } = params;
  const combined = `${hookTag} ${label} ${text}`.trim();
  const isFirst = clipIndex === 0;
  const isLast = totalClips > 1 && clipIndex === totalClips - 1;

  // Score each action by context keywords + structural position
  const scores: Record<DigitalHumanActionId, number> = {
    explain: 0.4,
    point: 0.25,
    wave: 0.15,
    amaze: 0.2,
    nod: 0.2,
    'thumbs-up': 0.15,
  };

  if (/高潮|爆点|反转|惊艳|太绝|绝了|天呐|震撼|没想到|居然|竟然|秘密|炸裂|省一半|翻倍|离谱|真相|揭秘|惊呆|[！!]{1,}|\b(stop buying|amazing|shocking|secret|unbelievable|climax|wow|insane)\b/i.test(combined)) {
    scores.amaze += /高潮|爆点|反转|惊艳|震撼|天呐|秘密|\b(amazing|shocking|secret|climax)\b/i.test(combined) ? 1.35 : 0.95;
  }
  if (/看这里|你看|注意看|细节|实拍|展示|特写|对比|步骤|演示|注水|萃取|倒入|研磨|磨豆|拉花|画面|这里|左边|右边|界面|外观|构造|手冲|教你|\b(step|look|detail|macro|pour|grind|demo|here|swirl|bloom)\b/i.test(combined)) {
    scores.point += 1.25;
  }
  if (/大家好|哈喽|嗨|欢迎|各位|早八|先说|开场|见面|认识一下|拜拜|下期见|\b(hey|hello|hi everyone|welcome|morning|intro|opener)\b/i.test(combined)) {
    scores.wave += 1.15;
  }
  if (/点赞|关注|收藏|评论|下单|购买|链接|福利|试试|推荐入手|快去|记得|冲|CTA|转化|\b(save|share|follow|subscribe|comment|link|try this|like)\b/i.test(combined)) {
    scores['thumbs-up'] += 1.25;
  }
  if (/实测|口碑|认同|靠谱|确实|没错|真的香|值得|稳了|亲测|满意|舒服|总结|\b(proof|tested|worth|honest|solid|summary|verdict)\b/i.test(combined)) {
    scores.nod += 1.05;
  }
  if (/讲解|原理|为什么|科普|干货|教程|方法|逻辑|首先|其次|核心|重点|分析|拆解|指南|攻略|\b(how|why|tutorial|guide|workflow|method|explain|tip)\b/i.test(combined)) {
    scores.explain += 1.05;
  }

  // Narrative arc positional boosts
  if (isFirst) {
    scores.wave += 0.45;
    if (/钩子|hook|3秒|开场/i.test(combined)) {
      scores.amaze += 0.3;
    }
  } else if (isLast) {
    scores['thumbs-up'] += 0.45;
    scores.nod += 0.3;
  } else if (totalClips >= 3 && clipIndex === Math.floor(totalClips * 0.65)) {
    scores.amaze += 0.25;
  }

  const ranked = (Object.entries(scores) as Array<[DigitalHumanActionId, number]>).sort(
    (a, b) => b[1] - a[1]
  );
  const topAction = ranked[0][0];
  const secondary = ranked[1][0];
  const topScore = ranked[0][1];
  const confidence = Number(Math.min(0.95, Math.max(0.72, 0.65 + topScore * 0.14)).toFixed(2));

  const stageReasonMapZh: Record<DigitalHumanActionId, { stage: string; reason: string }> = {
    point: {
      stage: '细节讲解',
      reason: '脚本包含画面细节、步骤展示或实拍指代词，推荐「指引」手势引导观众聚焦核心视觉卖点。',
    },
    amaze: {
      stage: '高潮爆点',
      reason: '检测到强情绪感叹、反转揭秘或高潮亮点词，推荐「惊叹」推镜姿态放大吸睛瞬间。',
    },
    wave: {
      stage: '开场招呼',
      reason: '属于开场问候或前3秒建立亲近感语境，推荐「挥手」动作自然拉近观众距离。',
    },
    'thumbs-up': {
      stage: '片尾号召',
      reason: '包含行动号召、福利种草或收尾互动引导，推荐「点赞」手势提升关注与转化。',
    },
    nod: {
      stage: '观点认同',
      reason: '强调实测口碑、总结肯定或理性背书，推荐「点头」姿态增强可信度与说服力。',
    },
    explain: {
      stage: '干货阐述',
      reason: '侧重条理化科普、原理解析或教程说明，推荐「讲解」双节拍手势保持稳健节奏。',
    },
  };

  const stageReasonMapEn: Record<DigitalHumanActionId, { stage: string; reason: string }> = {
    point: {
      stage: 'Visual Callout',
      reason: 'Script references on-screen details or step-by-step demonstrations; "Point" directs viewer focus to the product.',
    },
    amaze: {
      stage: 'Climax Reveal',
      reason: 'Detected high-energy emphasis or hook reveal cues; "Amaze" amplifies the punchline.',
    },
    wave: {
      stage: 'Opening Greeting',
      reason: 'Fits the opening greeting or first-3-seconds rapport builder; "Wave" warms up audience retention.',
    },
    'thumbs-up': {
      stage: 'CTA Outro',
      reason: 'Contains call-to-action or save/share cues; "Thumbs Up" boosts engagement and conversions.',
    },
    nod: {
      stage: 'Endorsement',
      reason: 'Highlights tested results or takeaway verdict; "Nod" reinforces presenter credibility.',
    },
    explain: {
      stage: 'Key Explanation',
      reason: 'Focuses on structured explanation or tutorial flow; "Explain" maintains steady rhythm.',
    },
  };

  const map = uiLang === 'en' ? stageReasonMapEn : stageReasonMapZh;

  return {
    action: topAction,
    secondary,
    stage: map[topAction].stage,
    reason: map[topAction].reason,
    confidence,
  };
}

/**
 * Analyzes the current video brief, timeline clips, and spoken subtitles/script
 * to automatically highlight context-matched actions in the editor.
 */
export function analyzeScriptForActionSuggestions(params: {
  brief?: string;
  scriptText?: string;
  clips: TimelineClip[];
  subtitles: SubtitleSegment[];
  selectedClipId?: string | null;
  uiLang?: UiLanguage;
}): DigitalHumanActionRecommendation {
  const { brief = '', scriptText = '', clips, subtitles, selectedClipId, uiLang = 'zh-CN' } = params;

  let cursor = 0;
  const clipSuggestions: DigitalHumanClipActionSuggestion[] = clips.map((clip, idx) => {
    const start = cursor;
    const end = cursor + clip.duration;
    cursor = end;

    const overlappingSubs = subtitles
      .filter((s) => {
        const mid = s.startTime + s.duration / 2;
        return mid >= start && mid <= end;
      })
      .map((s) => s.text.trim())
      .filter(Boolean)
      .join(' ');

    const isSelected = clip.id === selectedClipId;
    const contextText = [
      overlappingSubs,
      isSelected && scriptText.trim() ? scriptText.trim() : '',
      !overlappingSubs && brief.trim() ? brief.trim() : '',
    ]
      .filter(Boolean)
      .join(' ');

    const classified = classifySingleContextAction({
      text: contextText,
      label: clip.label,
      hookTag: clip.hookTag,
      clipIndex: idx,
      totalClips: clips.length,
      uiLang,
    });

    const tmpl = getLocalizedActionTemplate(classified.action, uiLang);
    return {
      clipId: clip.id,
      clipLabel: clip.label,
      contextStage: classified.stage,
      recommendedAction: classified.action,
      recommendedIntensity: tmpl.recommendedIntensity,
      reason: classified.reason,
    };
  });

  const selectedSuggestion = selectedClipId
    ? clipSuggestions.find((s) => s.clipId === selectedClipId)
    : undefined;

  if (selectedSuggestion && !scriptText.trim()) {
    const selIdx = Math.max(
      0,
      clips.findIndex((c) => c.id === selectedClipId)
    );
    const selClip = clips[selIdx];
    const subForSel = subtitles
      .filter((s) => {
        let sStart = 0;
        for (let i = 0; i < selIdx; i++) sStart += clips[i].duration;
        const sEnd = sStart + (selClip?.duration ?? 0);
        const mid = s.startTime + s.duration / 2;
        return mid >= sStart && mid <= sEnd;
      })
      .map((s) => s.text)
      .join(' ');

    const detail = classifySingleContextAction({
      text: subForSel || brief,
      label: selClip?.label,
      hookTag: selClip?.hookTag,
      clipIndex: selIdx,
      totalClips: clips.length,
      uiLang,
    });

    return {
      primaryAction: detail.action,
      secondaryAction: detail.secondary,
      contextStage: detail.stage,
      confidence: detail.confidence,
      reason: detail.reason,
      clipSuggestions,
      source: 'heuristic',
      analyzedAt: new Date().toISOString(),
    };
  }

  const selIdx = selectedClipId ? clips.findIndex((c) => c.id === selectedClipId) : 0;
  const selClip = selIdx >= 0 ? clips[selIdx] : undefined;
  const combinedScript = [scriptText.trim(), brief.trim(), subtitles.map((s) => s.text).join(' ')]
    .filter(Boolean)
    .join(' ');

  const overall = classifySingleContextAction({
    text: combinedScript,
    label: selClip?.label,
    hookTag: selClip?.hookTag,
    clipIndex: Math.max(0, selIdx),
    totalClips: Math.max(1, clips.length),
    uiLang,
  });

  return {
    primaryAction: overall.action,
    secondaryAction: overall.secondary,
    contextStage: overall.stage,
    confidence: overall.confidence,
    reason: overall.reason,
    clipSuggestions,
    source: 'heuristic',
    analyzedAt: new Date().toISOString(),
  };
}

export interface DigitalHumanCameraPreset {
  id: DigitalHumanCameraPresetId;
  label: string;
  englishTag: string;
  badgeColor: string;
  summary: string;
  motion: DigitalHumanCameraMotion;
}

export const DIGITAL_HUMAN_CAMERA_PRESETS: DigitalHumanCameraPreset[] = [
  {
    id: 'none',
    label: '固定机位',
    englishTag: 'LOCKED',
    badgeColor: '#94a3b8',
    summary: '稳固演播室三脚架视角，保留数字人原始口播构图',
    motion: {
      enabled: false,
      preset: 'none',
      dollyAmount: 0,
      panSpeed: 0,
      shakeIntensity: 0,
      shakeFrequency: 1.0,
    },
  },
  {
    id: 'push-in',
    label: '缓推特写',
    englishTag: 'PUSH IN',
    badgeColor: '#38bdf8',
    summary: '镜头随口播节奏平稳推进，逐步强化主播眼神聚焦与感染力',
    motion: {
      enabled: true,
      preset: 'push-in',
      dollyAmount: 0.16,
      panSpeed: 0,
      shakeIntensity: 0.08,
      shakeFrequency: 1.0,
    },
  },
  {
    id: 'pull-out',
    label: '拉远全景',
    englishTag: 'PULL OUT',
    badgeColor: '#34d399',
    summary: '从特写景别流畅拉远至半身构图，适合阶段总结与视野展开',
    motion: {
      enabled: true,
      preset: 'pull-out',
      dollyAmount: -0.16,
      panSpeed: 0,
      shakeIntensity: 0.06,
      shakeFrequency: 0.9,
    },
  },
  {
    id: 'pan-sweep',
    label: '水平横摇',
    englishTag: 'PAN',
    badgeColor: '#a78bfa',
    summary: '电影级横向平滑运镜平移，赋予静态主播肖像真实摄影机调度感',
    motion: {
      enabled: true,
      preset: 'pan-sweep',
      dollyAmount: 0.06,
      panSpeed: 0.65,
      shakeIntensity: 0.05,
      shakeFrequency: 1.0,
    },
  },
  {
    id: 'handheld-shake',
    label: '手持微抖',
    englishTag: 'HANDHELD',
    badgeColor: '#f59e0b',
    summary: '模拟真人 Vlog 手持跟拍呼吸感微抖与细微水平角偏转，降低 AI 僵硬感',
    motion: {
      enabled: true,
      preset: 'handheld-shake',
      dollyAmount: 0.05,
      panSpeed: 0.18,
      shakeIntensity: 0.48,
      shakeFrequency: 1.35,
    },
  },
  {
    id: 'dolly-zoom',
    label: '节奏推摇',
    englishTag: 'DYNAMIC',
    badgeColor: '#fb7185',
    summary: '高能推镜配合节拍横向摇移与轻抖动效，适合前 3 秒钩子与高潮爆点',
    motion: {
      enabled: true,
      preset: 'dolly-zoom',
      dollyAmount: 0.24,
      panSpeed: -0.45,
      shakeIntensity: 0.36,
      shakeFrequency: 1.8,
    },
  },
];

export function getDigitalHumanCameraPreset(
  presetId?: DigitalHumanCameraPresetId
): DigitalHumanCameraPreset {
  return (
    DIGITAL_HUMAN_CAMERA_PRESETS.find((p) => p.id === presetId) ??
    DIGITAL_HUMAN_CAMERA_PRESETS[0]
  );
}

const CAMERA_EN_META: Record<DigitalHumanCameraPresetId, { label: string; summary: string }> = {
  none: {
    label: 'Locked Tripod',
    summary: 'Stable studio tripod framing preserving original anchor composition.',
  },
  'push-in': {
    label: 'Slow Push-In',
    summary: 'Gradually pushes in to intensify presenter eye contact and engagement.',
  },
  'pull-out': {
    label: 'Smooth Pull-Out',
    summary: 'Pulls back smoothly from close-up to half-body framing for summaries.',
  },
  'pan-sweep': {
    label: 'Pan Sweep',
    summary: 'Cinematic lateral camera pan adding realistic motion to static portraits.',
  },
  'handheld-shake': {
    label: 'Handheld Shake',
    summary: 'Subtle organic handheld vlog breathing motion to reduce static stiffness.',
  },
  'dolly-zoom': {
    label: 'Dynamic Push',
    summary: 'Punchy push-in combined with lateral pan and tremor for 3s hooks and reveals.',
  },
};

export function getLocalizedCameraPreset(
  presetId: DigitalHumanCameraPresetId | undefined,
  lang: UiLanguage = 'zh-CN'
): DigitalHumanCameraPreset {
  const base = getDigitalHumanCameraPreset(presetId);
  if (lang === 'zh-CN') return base;
  const en = CAMERA_EN_META[base.id];
  return en ? { ...base, label: en.label, summary: en.summary } : base;
}

export function clampCameraMotion(
  raw?: Partial<DigitalHumanCameraMotion> | null
): DigitalHumanCameraMotion {
  const clamp = (v: unknown, min: number, max: number, fb: number) => {
    const n = typeof v === 'number' && Number.isFinite(v) ? v : fb;
    return Number(Math.max(min, Math.min(max, n)).toFixed(2));
  };
  const validIds: DigitalHumanCameraPresetId[] = [
    'none',
    'push-in',
    'pull-out',
    'pan-sweep',
    'handheld-shake',
    'dolly-zoom',
  ];
  const preset =
    raw?.preset && validIds.includes(raw.preset) ? raw.preset : 'none';
  return {
    enabled: Boolean(raw?.enabled),
    preset,
    dollyAmount: clamp(raw?.dollyAmount, -0.25, 0.35, 0),
    panSpeed: clamp(raw?.panSpeed, -1.0, 1.0, 0),
    shakeIntensity: clamp(raw?.shakeIntensity, 0, 1.0, 0),
    shakeFrequency: clamp(raw?.shakeFrequency, 0.5, 3.0, 1.0),
  };
}

export function computeDigitalHumanCameraTransform(
  cameraMotion: DigitalHumanCameraMotion | undefined,
  timeSec: number,
  progress: number,
  frameW: number,
  frameH: number
): {
  zoom: number;
  offsetX: number;
  offsetY: number;
  rotationRad: number;
} {
  if (!cameraMotion || !cameraMotion.enabled) {
    return { zoom: 1, offsetX: 0, offsetY: 0, rotationRad: 0 };
  }

  const m = clampCameraMotion(cameraMotion);
  const p = Math.max(0, Math.min(1, progress));
  // Smooth ease-in-out curve for dolly & pan
  const eased = p * p * (3 - 2 * p);

  // Ensure sufficient overscan margin so pan/shake never reveals canvas border
  const safetyMargin =
    1 + Math.abs(m.panSpeed) * 0.085 + m.shakeIntensity * 0.045;

  const dollyZoom =
    m.dollyAmount >= 0
      ? 1 + m.dollyAmount * eased
      : 1 + Math.abs(m.dollyAmount) * (1 - eased);

  const zoom = Math.max(safetyMargin, dollyZoom * safetyMargin);

  // Horizontal pan sweep + gentle breathing Y pan
  const panWave = Math.sin((p - 0.5) * Math.PI);
  const panOffsetX = m.panSpeed * panWave * (frameW * 0.065);
  const panOffsetY = Math.sin(p * Math.PI) * Math.abs(m.panSpeed) * (frameH * 0.014);

  // Multi-harmonic organic handheld camera tremor
  const freq = m.shakeFrequency;
  const shakeAmpX = m.shakeIntensity * frameW * 0.016;
  const shakeAmpY = m.shakeIntensity * frameH * 0.014;
  const shakeX =
    shakeAmpX *
    (0.62 * Math.sin(timeSec * 11.4 * freq) + 0.38 * Math.cos(timeSec * 19.2 * freq + 1.1));
  const shakeY =
    shakeAmpY *
    (0.58 * Math.cos(timeSec * 9.8 * freq + 0.5) + 0.42 * Math.sin(timeSec * 17.5 * freq));
  const rotationRad =
    m.shakeIntensity *
    0.022 *
    (0.65 * Math.sin(timeSec * 7.6 * freq) + 0.35 * Math.cos(timeSec * 13.8 * freq));

  return {
    zoom,
    offsetX: panOffsetX + shakeX,
    offsetY: panOffsetY + shakeY,
    rotationRad,
  };
}

export interface DigitalHumanLanguageOption {
  id: DigitalHumanTargetLanguage;
  label: string;
  nativeName: string;
  shortTag: string;
  ttsLanguageDirective: string;
}

export const DIGITAL_HUMAN_LANGUAGES: DigitalHumanLanguageOption[] = [
  {
    id: 'en-US',
    label: '英语',
    nativeName: 'English',
    shortTag: 'EN',
    ttsLanguageDirective: 'Speak in fluent, natural American English while preserving the original speaker vocal timbre and cadence',
  },
  {
    id: 'ja-JP',
    label: '日语',
    nativeName: '日本語',
    shortTag: 'JP',
    ttsLanguageDirective: 'Speak in fluent, natural Tokyo Japanese while preserving the original speaker vocal timbre and cadence',
  },
  {
    id: 'ko-KR',
    label: '韩语',
    nativeName: '한국어',
    shortTag: 'KR',
    ttsLanguageDirective: 'Speak in fluent, natural Seoul Korean while preserving the original speaker vocal timbre and cadence',
  },
  {
    id: 'es-ES',
    label: '西班牙语',
    nativeName: 'Español',
    shortTag: 'ES',
    ttsLanguageDirective: 'Speak in fluent, natural Spanish while preserving the original speaker vocal timbre and cadence',
  },
  {
    id: 'fr-FR',
    label: '法语',
    nativeName: 'Français',
    shortTag: 'FR',
    ttsLanguageDirective: 'Speak in fluent, natural French while preserving the original speaker vocal timbre and cadence',
  },
  {
    id: 'de-DE',
    label: '德语',
    nativeName: 'Deutsch',
    shortTag: 'DE',
    ttsLanguageDirective: 'Speak in fluent, natural German while preserving the original speaker vocal timbre and cadence',
  },
  {
    id: 'pt-BR',
    label: '葡萄牙语',
    nativeName: 'Português',
    shortTag: 'PT',
    ttsLanguageDirective: 'Speak in fluent, natural Brazilian Portuguese while preserving the original speaker vocal timbre and cadence',
  },
  {
    id: 'ar-SA',
    label: '阿拉伯语',
    nativeName: 'العربية',
    shortTag: 'AR',
    ttsLanguageDirective: 'Speak in fluent, natural Modern Standard Arabic while preserving the original speaker vocal timbre and cadence',
  },
  {
    id: 'zh-CN',
    label: '中文',
    nativeName: '中文普通话',
    shortTag: 'ZH',
    ttsLanguageDirective: 'Speak in fluent, natural Mandarin Chinese while preserving the original speaker vocal timbre and cadence',
  },
];

export function getDigitalHumanLanguageOption(
  lang?: DigitalHumanTargetLanguage
): DigitalHumanLanguageOption {
  return (
    DIGITAL_HUMAN_LANGUAGES.find((item) => item.id === lang) ?? DIGITAL_HUMAN_LANGUAGES[0]
  );
}

const TARGET_LANG_EN_LABELS: Record<DigitalHumanTargetLanguage, string> = {
  'en-US': 'English',
  'ja-JP': 'Japanese',
  'ko-KR': 'Korean',
  'es-ES': 'Spanish',
  'fr-FR': 'French',
  'de-DE': 'German',
  'pt-BR': 'Portuguese',
  'ar-SA': 'Arabic',
  'zh-CN': 'Chinese',
};

export function getLocalizedTargetLanguageOption(
  lang: DigitalHumanTargetLanguage | undefined,
  uiLang: UiLanguage = 'zh-CN'
): DigitalHumanLanguageOption {
  const base = getDigitalHumanLanguageOption(lang);
  if (uiLang === 'zh-CN') return base;
  return {
    ...base,
    label: TARGET_LANG_EN_LABELS[base.id] ?? base.nativeName,
  };
}

export interface VisemeDisplayMeta {
  id: DigitalHumanVisemeClass;
  shortTag: string;
  label: string;
  badgeColor: string;
  defaultJaw: number;
  defaultWidth: number;
  defaultPucker: number;
}

export const VISEME_META_MAP: Record<DigitalHumanVisemeClass, VisemeDisplayMeta> = {
  sil: {
    id: 'sil',
    shortTag: 'SIL',
    label: '闭唇停顿',
    badgeColor: '#64748b',
    defaultJaw: 0.04,
    defaultWidth: 0.96,
    defaultPucker: 0.05,
  },
  aa: {
    id: 'aa',
    shortTag: 'AA',
    label: '大开口音 /a/',
    badgeColor: '#fb7185',
    defaultJaw: 0.92,
    defaultWidth: 1.02,
    defaultPucker: 0.12,
  },
  eh: {
    id: 'eh',
    shortTag: 'EH',
    label: '半开元音 /e/',
    badgeColor: '#38bdf8',
    defaultJaw: 0.58,
    defaultWidth: 1.12,
    defaultPucker: 0.1,
  },
  iy: {
    id: 'iy',
    shortTag: 'IY',
    label: '展唇高音 /i/',
    badgeColor: '#34d399',
    defaultJaw: 0.36,
    defaultWidth: 1.28,
    defaultPucker: 0.04,
  },
  oh: {
    id: 'oh',
    shortTag: 'OH',
    label: '圆唇中音 /o/',
    badgeColor: '#f59e0b',
    defaultJaw: 0.72,
    defaultWidth: 0.82,
    defaultPucker: 0.64,
  },
  oo: {
    id: 'oo',
    shortTag: 'OO',
    label: '聚唇合口 /u/',
    badgeColor: '#a78bfa',
    defaultJaw: 0.38,
    defaultWidth: 0.72,
    defaultPucker: 0.88,
  },
  fv: {
    id: 'fv',
    shortTag: 'FV',
    label: '唇齿摩擦 /f,v/',
    badgeColor: '#f472b6',
    defaultJaw: 0.22,
    defaultWidth: 1.08,
    defaultPucker: 0.12,
  },
  sz: {
    id: 'sz',
    shortTag: 'SZ',
    label: '齿龈清擦 /s,z/',
    badgeColor: '#22d3ee',
    defaultJaw: 0.26,
    defaultWidth: 1.16,
    defaultPucker: 0.08,
  },
};

export function getVisemeDisplayMeta(viseme?: DigitalHumanVisemeClass): VisemeDisplayMeta {
  return VISEME_META_MAP[viseme ?? 'sil'] ?? VISEME_META_MAP.sil;
}

const VISEME_EN_LABELS: Record<DigitalHumanVisemeClass, string> = {
  sil: 'Closed Pause',
  aa: 'Open Vowel /a/',
  eh: 'Mid Open /e/',
  iy: 'Spread Vowel /i/',
  oh: 'Rounded Mid /o/',
  oo: 'Puckered /u/',
  fv: 'Labiodental /f,v/',
  sz: 'Sibilant /s,z/',
};

export function getLocalizedVisemeMeta(
  viseme: DigitalHumanVisemeClass | undefined,
  uiLang: UiLanguage = 'zh-CN'
): VisemeDisplayMeta {
  const base = getVisemeDisplayMeta(viseme);
  if (uiLang === 'zh-CN') return base;
  return { ...base, label: VISEME_EN_LABELS[base.id] ?? base.label };
}

function hzToMel(hz: number): number {
  return 2595 * Math.log10(1 + hz / 700);
}

function melToHz(mel: number): number {
  return 700 * (Math.pow(10, mel / 2595) - 1);
}

function fftMagnitudeSpectrum(
  frameSamples: Float32Array,
  nFft: number,
  hannWindow: Float32Array,
  re: Float32Array,
  im: Float32Array,
  magOut: Float32Array
): void {
  for (let i = 0; i < nFft; i++) {
    re[i] = i < frameSamples.length ? frameSamples[i] * hannWindow[i] : 0;
    im[i] = 0;
  }

  // In-place bit-reversal permutation
  let j = 0;
  for (let i = 0; i < nFft; i++) {
    if (i < j) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
    let m = nFft >> 1;
    while (m >= 1 && j >= m) {
      j -= m;
      m >>= 1;
    }
    j += m;
  }

  // Cooley-Tukey radix-2 DIT FFT
  for (let size = 2; size <= nFft; size <<= 1) {
    const half = size >> 1;
    const stepAngle = (-2 * Math.PI) / size;
    for (let start = 0; start < nFft; start += size) {
      for (let k = 0; k < half; k++) {
        const angle = stepAngle * k;
        const wr = Math.cos(angle);
        const wi = Math.sin(angle);
        const idxA = start + k;
        const idxB = idxA + half;
        const tRe = wr * re[idxB] - wi * im[idxB];
        const tIm = wr * im[idxB] + wi * re[idxB];
        re[idxB] = re[idxA] - tRe;
        im[idxB] = im[idxA] - tIm;
        re[idxA] += tRe;
        im[idxA] += tIm;
      }
    }
  }

  const bins = nFft >> 1;
  for (let k = 0; k <= bins; k++) {
    magOut[k] = Math.hypot(re[k], im[k]);
  }
}

function buildMelFilterbank(
  sampleRate: number,
  nFft: number,
  numBands = 24
): Array<{ startBin: number; weights: Float32Array }> {
  const bins = nFft >> 1;
  const fMin = 80;
  const fMax = Math.min(7600, Math.max(2400, sampleRate / 2 - 120));
  const melMin = hzToMel(fMin);
  const melMax = hzToMel(fMax);

  const melPoints = new Float32Array(numBands + 2);
  for (let i = 0; i < numBands + 2; i++) {
    melPoints[i] = melMin + ((melMax - melMin) * i) / (numBands + 1);
  }

  const binIndices = new Int32Array(numBands + 2);
  for (let i = 0; i < numBands + 2; i++) {
    const hz = melToHz(melPoints[i]);
    binIndices[i] = Math.max(0, Math.min(bins, Math.floor(((nFft + 1) * hz) / sampleRate)));
  }

  const filters: Array<{ startBin: number; weights: Float32Array }> = [];
  for (let m = 1; m <= numBands; m++) {
    const left = binIndices[m - 1];
    const center = Math.max(left + 1, binIndices[m]);
    const right = Math.max(center + 1, binIndices[m + 1]);
    const len = Math.max(1, right - left + 1);
    const weights = new Float32Array(len);
    for (let k = left; k <= right && k <= bins; k++) {
      if (k < center) {
        weights[k - left] = (k - left) / Math.max(1, center - left);
      } else {
        weights[k - left] = (right - k) / Math.max(1, right - center);
      }
    }
    filters.push({ startBin: left, weights });
  }
  return filters;
}

export function extractMelPhonemeAlignmentFromPcm(
  pcm: Float32Array,
  sampleRate: number,
  options?: {
    enabled?: boolean;
    keyframeOffsetMs?: number;
    onsetAdvanceMs?: number;
    fps?: number;
  }
): DigitalHumanPhonemeAlignmentProfile {
  const enabled = options?.enabled !== false;
  const fps = Math.max(20, Math.min(40, options?.fps ?? 30));
  const melBands = 24;
  const keyframeOffsetMs = Math.max(-45, Math.min(45, Math.round(options?.keyframeOffsetMs ?? -12)));
  const onsetAdvanceMs = Math.max(0, Math.min(35, Math.round(options?.onsetAdvanceMs ?? 20)));

  const sr = Math.max(8000, sampleRate || 24000);
  const nFft = 512;
  const hopSamples = Math.max(160, Math.floor(sr / fps));
  const hann = new Float32Array(nFft);
  for (let i = 0; i < nFft; i++) {
    hann[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (nFft - 1)));
  }

  const filters = buildMelFilterbank(sr, nFft, melBands);
  const re = new Float32Array(nFft);
  const im = new Float32Array(nFft);
  const mag = new Float32Array((nFft >> 1) + 1);
  const frameBuf = new Float32Array(nFft);
  const melEnergies = new Float32Array(melBands);
  const prevMel = new Float32Array(melBands);

  const rawFrames: Array<{
    baseT: number;
    viseme: DigitalHumanVisemeClass;
    jawOpen: number;
    mouthWidth: number;
    pucker: number;
    flux: number;
    centroidHz: number;
    energy: number;
  }> = [];

  const totalFrames = Math.max(1, Math.floor(pcm.length / hopSamples));
  let maxEnergy = 1e-6;
  let maxFlux = 1e-6;

  // First pass: Mel band energy & spectral centroid/flux
  for (let f = 0; f < totalFrames; f++) {
    const start = f * hopSamples;
    for (let i = 0; i < nFft; i++) {
      frameBuf[i] = start + i < pcm.length ? pcm[start + i] : 0;
    }

    fftMagnitudeSpectrum(frameBuf, nFft, hann, re, im, mag);

    let totalMel = 0;
    let lowMel = 0; // bands 0..5 (~80-650Hz)
    let midLowMel = 0; // bands 6..11 (~650-1400Hz)
    let midHighMel = 0; // bands 12..17 (~1400-3100Hz)
    let highMel = 0; // bands 18..23 (~3100-7600Hz)
    let flux = 0;

    for (let b = 0; b < melBands; b++) {
      const flt = filters[b];
      let sum = 0;
      for (let wIdx = 0; wIdx < flt.weights.length; wIdx++) {
        const binIdx = flt.startBin + wIdx;
        if (binIdx < mag.length) {
          const pwr = mag[binIdx] * mag[binIdx];
          sum += pwr * flt.weights[wIdx];
        }
      }
      const logE = Math.log1p(sum * 18);
      melEnergies[b] = logE;
      totalMel += logE;
      if (b <= 5) lowMel += logE;
      else if (b <= 11) midLowMel += logE;
      else if (b <= 17) midHighMel += logE;
      else highMel += logE;

      const diff = logE - prevMel[b];
      if (diff > 0) flux += diff;
      prevMel[b] = logE;
    }

    let magSum = 0;
    let weightedFreq = 0;
    const binHz = sr / nFft;
    for (let k = 1; k < mag.length; k++) {
      const m = mag[k];
      magSum += m;
      weightedFreq += m * (k * binHz);
    }
    const centroidHz = magSum > 1e-6 ? weightedFreq / magSum : 950;

    if (totalMel > maxEnergy) maxEnergy = totalMel;
    if (flux > maxFlux) maxFlux = flux;

    const lowRatio = totalMel > 1e-5 ? lowMel / totalMel : 0;
    const midLowRatio = totalMel > 1e-5 ? midLowMel / totalMel : 0;
    const midHighRatio = totalMel > 1e-5 ? midHighMel / totalMel : 0;
    const highRatio = totalMel > 1e-5 ? highMel / totalMel : 0;

    rawFrames.push({
      baseT: Number((start / sr).toFixed(4)),
      viseme: 'eh',
      jawOpen: 0,
      mouthWidth: 1,
      pucker: 0,
      flux,
      centroidHz,
      energy: totalMel,
    });

    // Attach temporary band ratios on last element via local closure calculation
    const idx = rawFrames.length - 1;
    (rawFrames[idx] as unknown as {
      _r?: { lowRatio: number; midLowRatio: number; midHighRatio: number; highRatio: number };
    })._r = { lowRatio, midLowRatio, midHighRatio, highRatio };
  }

  const visemeCounts: Record<DigitalHumanVisemeClass, number> = {
    sil: 0,
    aa: 0,
    eh: 0,
    iy: 0,
    oh: 0,
    oo: 0,
    fv: 0,
    sz: 0,
  };

  let weightedCentroidSum = 0;
  let voicedFrames = 0;

  const frames: DigitalHumanPhonemeFrame[] = rawFrames.map((rf) => {
    const normEnergy = Math.min(1, rf.energy / Math.max(0.5, maxEnergy * 0.88));
    const normFlux = Math.min(1, rf.flux / Math.max(0.4, maxFlux * 0.72));
    const ratios = (
      rf as unknown as {
        _r: { lowRatio: number; midLowRatio: number; midHighRatio: number; highRatio: number };
      }
    )._r;

    let viseme: DigitalHumanVisemeClass = 'eh';
    let jawBase = 0.56;
    let widthBase = 1.1;
    let puckerBase = 0.1;

    if (normEnergy < 0.14) {
      viseme = 'sil';
      jawBase = 0.04;
      widthBase = 0.96;
      puckerBase = 0.05;
    } else if (ratios.highRatio > 0.31 && rf.centroidHz > 2200) {
      if (ratios.midLowRatio > 0.2) {
        viseme = 'fv';
        jawBase = 0.22;
        widthBase = 1.08;
        puckerBase = 0.12;
      } else {
        viseme = 'sz';
        jawBase = 0.26;
        widthBase = 1.18;
        puckerBase = 0.06;
      }
    } else if (ratios.midLowRatio > 0.3 && ratios.lowRatio > 0.22) {
      viseme = 'aa';
      jawBase = 0.92;
      widthBase = 1.02;
      puckerBase = 0.12;
    } else if (ratios.midHighRatio > 0.29 && rf.centroidHz > 1300) {
      viseme = 'iy';
      jawBase = 0.38;
      widthBase = 1.28;
      puckerBase = 0.04;
    } else if (ratios.lowRatio > 0.42 && ratios.midHighRatio < 0.22) {
      viseme = 'oo';
      jawBase = 0.38;
      widthBase = 0.72;
      puckerBase = 0.88;
    } else if (ratios.lowRatio > 0.32 && ratios.midLowRatio > 0.24) {
      viseme = 'oh';
      jawBase = 0.74;
      widthBase = 0.82;
      puckerBase = 0.65;
    }

    if (viseme !== 'sil') {
      visemeCounts[viseme]++;
      weightedCentroidSum += rf.centroidHz;
      voicedFrames++;
    } else {
      visemeCounts.sil++;
    }

    // Anticipatory co-articulation lead on spectral onset bursts + user keyframe micro-offset
    const onsetLeadMs = viseme === 'sil' ? 0 : Math.round(-onsetAdvanceMs * normFlux);
    const appliedOffsetMs = Math.max(-65, Math.min(65, keyframeOffsetMs + onsetLeadMs));
    const shiftedT = Math.max(0, Number((rf.baseT + appliedOffsetMs / 1000).toFixed(4)));

    const energyScale = viseme === 'sil' ? 1 : 0.45 + 0.55 * Math.pow(normEnergy, 0.78);
    return {
      t: shiftedT,
      viseme,
      jawOpen: Number(Math.min(1, jawBase * energyScale).toFixed(3)),
      mouthWidth: Number(widthBase.toFixed(3)),
      pucker: Number(puckerBase.toFixed(3)),
      keyframeOffsetMs: appliedOffsetMs,
    };
  });

  // Sort strictly by keyframe time after anticipatory micro-shifts
  frames.sort((a, b) => a.t - b.t);

  const rankedVisemes = (
    Object.entries(visemeCounts) as Array<[DigitalHumanVisemeClass, number]>
  )
    .filter(([v, c]) => v !== 'sil' && c > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([v]) => v);

  const formantCentroidHz =
    voicedFrames > 0 ? Math.round(weightedCentroidSum / voicedFrames) : 1280;

  const visemeSummaryNames =
    rankedVisemes.length > 0
      ? rankedVisemes.map((v) => getVisemeDisplayMeta(v).shortTag).join(' / ')
      : 'AA / EH';

  const offsetText =
    keyframeOffsetMs < 0
      ? `提前 ${Math.abs(keyframeOffsetMs)}ms 预张口`
      : keyframeOffsetMs > 0
        ? `延后 ${keyframeOffsetMs}ms 收唇`
        : '零基准对齐';

  return {
    enabled,
    fps,
    melBands,
    keyframeOffsetMs,
    onsetAdvanceMs,
    dominantVisemes: rankedVisemes.length > 0 ? rankedVisemes : ['aa', 'eh'],
    spectralSummary: `24阶梅尔频谱提取 ${frames.length} 帧关键帧 · 主口型 ${visemeSummaryNames} · 共振峰质心 ${formantCentroidHz}Hz · ${offsetText}`,
    formantCentroidHz,
    frames,
    analyzedAt: new Date().toISOString(),
  };
}

function decodeWavToFloatPcm(b64: string): { pcm: Float32Array; sampleRate: number } | null {
  try {
    const clean = b64.includes(',') ? b64.split(',')[1] : b64;
    const raw = atob(clean);
    if (raw.length < 44) return null;
    if (raw.slice(0, 4) !== 'RIFF' || raw.slice(8, 12) !== 'WAVE') return null;

    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    const view = new DataView(bytes.buffer);

    let sampleRate = 24000;
    let numChannels = 1;
    let bitsPerSample = 16;
    let dataOffset = 44;
    let dataSize = bytes.length - 44;

    let pos = 12;
    while (pos + 8 <= bytes.length) {
      const chunkId = raw.slice(pos, pos + 4);
      const chunkSize = view.getUint32(pos + 4, true);
      if (chunkId === 'fmt ') {
        numChannels = view.getUint16(pos + 10, true) || 1;
        sampleRate = view.getUint32(pos + 12, true) || 24000;
        bitsPerSample = view.getUint16(pos + 22, true) || 16;
      } else if (chunkId === 'data') {
        dataOffset = pos + 8;
        dataSize = Math.min(chunkSize, bytes.length - dataOffset);
        break;
      }
      pos += 8 + chunkSize + (chunkSize % 2);
    }

    const bytesPerSample = Math.max(1, bitsPerSample / 8);
    const totalSamples = Math.floor(dataSize / (bytesPerSample * numChannels));
    if (totalSamples <= 0) return null;

    const pcm = new Float32Array(totalSamples);
    for (let s = 0; s < totalSamples; s++) {
      const byteIdx = dataOffset + s * numChannels * bytesPerSample;
      if (byteIdx + 1 >= bytes.length) break;
      pcm[s] = bitsPerSample === 16 ? view.getInt16(byteIdx, true) / 32768 : 0;
    }
    return { pcm, sampleRate };
  } catch {
    return null;
  }
}

export async function analyzeAudioForPhonemeAlignment(
  audioBase64: string,
  mimeType = 'audio/wav',
  options?: {
    enabled?: boolean;
    keyframeOffsetMs?: number;
    onsetAdvanceMs?: number;
  }
): Promise<DigitalHumanPhonemeAlignmentProfile | null> {
  if (!audioBase64) return null;

  if (mimeType.includes('wav')) {
    const wav = decodeWavToFloatPcm(audioBase64);
    if (wav) {
      return extractMelPhonemeAlignmentFromPcm(wav.pcm, wav.sampleRate, options);
    }
  }

  if (typeof window === 'undefined') return null;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;

  let ctx: AudioContext | null = null;
  try {
    const clean = audioBase64.includes(',') ? audioBase64.split(',')[1] : audioBase64;
    const bin = atob(clean);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    ctx = new AudioCtx();
    const buf = await ctx.decodeAudioData(bytes.buffer.slice(0));
    const ch = buf.getChannelData(0);
    return extractMelPhonemeAlignmentFromPcm(ch, buf.sampleRate || 44100, options);
  } catch {
    return null;
  } finally {
    if (ctx) void ctx.close().catch(() => undefined);
  }
}

/**
 * Re-calibrates keyframe timing offsets on an existing Mel-analyzed phoneme profile
 * instantaneously when the user adjusts the keyframe offset or onset advance sliders.
 */
export function realignPhonemeProfileOffset(
  profile: DigitalHumanPhonemeAlignmentProfile,
  newKeyframeOffsetMs: number,
  newOnsetAdvanceMs?: number,
  enabled?: boolean
): DigitalHumanPhonemeAlignmentProfile {
  const clampedOffset = Math.max(-45, Math.min(45, Math.round(newKeyframeOffsetMs)));
  const prevOffset = profile.keyframeOffsetMs;
  const deltaSec = (clampedOffset - prevOffset) / 1000;
  const resolvedOnset =
    typeof newOnsetAdvanceMs === 'number'
      ? Math.max(0, Math.min(35, Math.round(newOnsetAdvanceMs)))
      : profile.onsetAdvanceMs;

  const updatedFrames = profile.frames
    .map((f) => ({
      ...f,
      t: Math.max(0, Number((f.t + deltaSec).toFixed(4))),
      keyframeOffsetMs: Math.max(
        -65,
        Math.min(65, f.keyframeOffsetMs + (clampedOffset - prevOffset))
      ),
    }))
    .sort((a, b) => a.t - b.t);

  const offsetText =
    clampedOffset < 0
      ? `提前 ${Math.abs(clampedOffset)}ms 预张口`
      : clampedOffset > 0
        ? `延后 ${clampedOffset}ms 收唇`
        : '零基准对齐';

  const visemeNames = profile.dominantVisemes
    .map((v) => getVisemeDisplayMeta(v).shortTag)
    .join(' / ');

  return {
    ...profile,
    enabled: typeof enabled === 'boolean' ? enabled : profile.enabled,
    keyframeOffsetMs: clampedOffset,
    onsetAdvanceMs: resolvedOnset,
    spectralSummary: `${profile.melBands}阶梅尔频谱提取 ${updatedFrames.length} 帧关键帧 · 主口型 ${visemeNames || 'AA / EH'} · 共振峰质心 ${profile.formantCentroidHz}Hz · ${offsetText}`,
    frames: updatedFrames,
  };
}

export interface SampledPhonemeLipState {
  active: boolean;
  viseme: DigitalHumanVisemeClass;
  jawOpen: number;
  mouthWidth: number;
  pucker: number;
  appliedOffsetMs: number;
}

export function samplePhonemeAlignmentAtTime(
  profile: DigitalHumanPhonemeAlignmentProfile | undefined,
  localAudioTime: number,
  fallbackActivity = 0,
  playbackRate = 1
): SampledPhonemeLipState {
  if (!profile || !profile.enabled || !profile.frames || profile.frames.length === 0) {
    return {
      active: false,
      viseme: fallbackActivity > 0.15 ? 'aa' : 'sil',
      jawOpen: fallbackActivity,
      mouthWidth: 1,
      pucker: 0.1,
      appliedOffsetMs: 0,
    };
  }

  const rate = playbackRate > 0 ? playbackRate : 1;
  const queryT = Math.max(0, localAudioTime * rate);
  const frames = profile.frames;

  if (queryT <= frames[0].t) {
    const f = frames[0];
    return {
      active: true,
      viseme: f.viseme,
      jawOpen: f.jawOpen,
      mouthWidth: f.mouthWidth,
      pucker: f.pucker,
      appliedOffsetMs: f.keyframeOffsetMs,
    };
  }

  const last = frames[frames.length - 1];
  if (queryT >= last.t) {
    return {
      active: true,
      viseme: last.viseme,
      jawOpen: last.jawOpen,
      mouthWidth: last.mouthWidth,
      pucker: last.pucker,
      appliedOffsetMs: last.keyframeOffsetMs,
    };
  }

  // Binary search for bracketing frames
  let lo = 0;
  let hi = frames.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (frames[mid].t <= queryT) lo = mid;
    else hi = mid;
  }

  const f0 = frames[lo];
  const f1 = frames[hi];
  const span = Math.max(0.001, f1.t - f0.t);
  const rawW = Math.max(0, Math.min(1, (queryT - f0.t) / span));
  // Smooth cosine co-articulation interpolation
  const w = 0.5 - 0.5 * Math.cos(rawW * Math.PI);
  const lerp = (a: number, b: number) => a + (b - a) * w;

  return {
    active: true,
    viseme: w < 0.5 ? f0.viseme : f1.viseme,
    jawOpen: lerp(f0.jawOpen, f1.jawOpen),
    mouthWidth: lerp(f0.mouthWidth, f1.mouthWidth),
    pucker: lerp(f0.pucker, f1.pucker),
    appliedOffsetMs: Math.round(lerp(f0.keyframeOffsetMs, f1.keyframeOffsetMs)),
  };
}

/**
 * Splits long voiceover/digital-human scripts cleanly along sentence and clause boundaries
 * so long speeches can be synthesized without truncation and concatenated smoothly.
 */
export function splitSpeechScriptIntoSegments(
  rawText: string,
  maxCharsPerSegment = 160
): string[] {
  const normalized = (rawText || '').replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim();
  if (!normalized) return [];

  const safeLimit = Math.max(40, Math.min(260, Math.round(maxCharsPerSegment)));

  // Split by sentence terminators keeping punctuation attached
  const sentenceUnits = normalized
    .split(/(?<=[。！？!?；;\n])/)
    .map((s) => s.trim())
    .filter(Boolean);

  const expandOverlongUnit = (unit: string): string[] => {
    if (unit.length <= safeLimit) return [unit];

    // Secondary split on comma/clause delimiters
    const clauses = unit
      .split(/(?<=[，,、：:])/)
      .map((c) => c.trim())
      .filter(Boolean);

    const out: string[] = [];
    let buf = '';
    for (const clause of clauses) {
      if (clause.length > safeLimit) {
        if (buf) {
          out.push(buf);
          buf = '';
        }
        // Hard wrap extremely long punctuation-free strings respecting whitespace for Latin text
        let cursor = 0;
        while (cursor < clause.length) {
          let end = Math.min(clause.length, cursor + safeLimit);
          if (end < clause.length) {
            const lastSpace = clause.lastIndexOf(' ', end);
            if (lastSpace > cursor + Math.floor(safeLimit * 0.5)) {
              end = lastSpace + 1;
            }
          }
          const slice = clause.slice(cursor, end).trim();
          if (slice) out.push(slice);
          cursor = end;
        }
      } else if (!buf) {
        buf = clause;
      } else if (buf.length + clause.length <= safeLimit) {
        buf = `${buf}${clause}`;
      } else {
        out.push(buf);
        buf = clause;
      }
    }
    if (buf) out.push(buf);
    return out;
  };

  const expandedUnits = sentenceUnits.flatMap(expandOverlongUnit);
  const segments: string[] = [];
  let current = '';

  for (const unit of expandedUnits) {
    if (!current) {
      current = unit;
    } else if (current.length + 1 + unit.length <= safeLimit) {
      const needsSpace = /[a-zA-Z0-9]$/.test(current) && /^[a-zA-Z0-9]/.test(unit);
      current = `${current}${needsSpace ? ' ' : ''}${unit}`;
    } else {
      segments.push(current);
      current = unit;
    }
  }
  if (current) segments.push(current);

  return segments;
}

/**
 * Estimates spoken TTS duration in seconds from Chinese characters, Latin/digit words,
 * and punctuation pauses before audio synthesis is invoked.
 */
export function estimateSpeechDurationSec(rawText: string, speakingRate = 1.0): number {
  const clean = (rawText || '').trim();
  if (!clean) return 0;

  const cjkCount = (clean.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g) || []).length;
  const nonCjkText = clean.replace(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g, ' ');
  const latinWords = (nonCjkText.match(/[a-zA-Z0-9]+(?:['’-][a-zA-Z0-9]+)*/g) || []).length;
  const majorPauses = (clean.match(/[。！？!?；;\n]/g) || []).length;
  const minorPauses = (clean.match(/[，,、：:]/g) || []).length;

  const rate = speakingRate > 0 ? speakingRate : 1.0;
  const speechTime = cjkCount / 3.9 + latinWords / 2.45;
  const pauseTime = Math.max(0, majorPauses - 0.5) * 0.32 + minorPauses * 0.16;
  const segments = splitSpeechScriptIntoSegments(clean, 160);
  const stitchPause = Math.max(0, segments.length - 1) * 0.12;

  return Number(Math.max(1.2, (speechTime + pauseTime + stitchPause) / rate).toFixed(1));
}

export interface PersistentAvatarDataResult {
  url: string;
  mediaType: 'image' | 'video';
  width: number;
  height: number;
  duration: number;
  convertedFromLargeVideo?: boolean;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string' && reader.result.startsWith('data:')) {
        resolve(reader.result);
      } else {
        reject(new Error('文件读取失败'));
      }
    };
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsDataURL(file);
  });
}

function compressImageDataUrl(
  rawDataUrl: string,
  maxDim = 640,
  quality = 0.82
): Promise<{ dataUrl: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const natW = img.naturalWidth || 540;
      const natH = img.naturalHeight || 720;
      const scale = Math.min(1, maxDim / Math.max(natW, natH));
      const outW = Math.max(64, Math.round(natW * scale));
      const outH = Math.max(64, Math.round(natH * scale));
      const canvas = document.createElement('canvas');
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve({ dataUrl: rawDataUrl, width: natW, height: natH });
        return;
      }
      ctx.drawImage(img, 0, 0, outW, outH);
      resolve({
        dataUrl: canvas.toDataURL('image/jpeg', quality),
        width: outW,
        height: outH,
      });
    };
    img.onerror = () => reject(new Error('图片解码失败'));
    img.src = rawDataUrl;
  });
}

/**
 * Converts user-uploaded avatar photos or videos into persistent compressed data URLs
 * (never volatile blob: URLs) so digital human anchors survive page reloads.
 */
export async function fileToPersistentAvatarDataUrl(
  file: File
): Promise<PersistentAvatarDataResult | null> {
  try {
    const isVideo = file.type.startsWith('video/');
    if (!isVideo) {
      const rawDataUrl = await readFileAsDataUrl(file);
      const compressed = await compressImageDataUrl(rawDataUrl, 640, 0.82);
      return {
        url: compressed.dataUrl,
        mediaType: 'image',
        width: compressed.width,
        height: compressed.height,
        duration: 5,
      };
    }

    const rawVideoDataUrl = await readFileAsDataUrl(file);
    return await new Promise<PersistentAvatarDataResult | null>((resolve) => {
      const vid = document.createElement('video');
      vid.preload = 'auto';
      vid.muted = true;
      vid.playsInline = true;

      const cleanup = () => {
        vid.onloadeddata = null;
        vid.onseeked = null;
        vid.onerror = null;
        vid.removeAttribute('src');
      };

      const maxPersistVideoBytes = 2 * 1024 * 1024; // Keep small videos intact as data:video URL

      vid.onloadeddata = () => {
        const natW = vid.videoWidth || 540;
        const natH = vid.videoHeight || 960;
        const dur = Math.max(1.5, Number(vid.duration) || 5);
        if (file.size <= maxPersistVideoBytes) {
          cleanup();
          resolve({
            url: rawVideoDataUrl,
            mediaType: 'video',
            width: natW,
            height: natH,
            duration: dur,
          });
          return;
        }
        // Large video: capture high-clarity persistent portrait JPEG frame so localStorage stays healthy
        try {
          vid.currentTime = Math.min(0.35, dur * 0.15);
        } catch {
          const scale = Math.min(1, 640 / Math.max(natW, natH));
          const c = document.createElement('canvas');
          c.width = Math.max(64, Math.round(natW * scale));
          c.height = Math.max(64, Math.round(natH * scale));
          const ctx = c.getContext('2d');
          ctx?.drawImage(vid, 0, 0, c.width, c.height);
          const poster = c.toDataURL('image/jpeg', 0.82);
          cleanup();
          resolve({
            url: poster,
            mediaType: 'image',
            width: c.width,
            height: c.height,
            duration: dur,
            convertedFromLargeVideo: true,
          });
        }
      };

      vid.onseeked = () => {
        const natW = vid.videoWidth || 540;
        const natH = vid.videoHeight || 960;
        const dur = Math.max(1.5, Number(vid.duration) || 5);
        const scale = Math.min(1, 640 / Math.max(natW, natH));
        const c = document.createElement('canvas');
        c.width = Math.max(64, Math.round(natW * scale));
        c.height = Math.max(64, Math.round(natH * scale));
        const ctx = c.getContext('2d');
        ctx?.drawImage(vid, 0, 0, c.width, c.height);
        const poster = c.toDataURL('image/jpeg', 0.82);
        cleanup();
        resolve({
          url: poster,
          mediaType: 'image',
          width: c.width,
          height: c.height,
          duration: dur,
          convertedFromLargeVideo: true,
        });
      };

      vid.onerror = () => {
        cleanup();
        resolve(null);
      };

      vid.src = rawVideoDataUrl;
    });
  } catch {
    return null;
  }
}



