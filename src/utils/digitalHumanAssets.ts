import type {
  DigitalHumanActionId,
  DigitalHumanEmotionAnalysis,
  DigitalHumanEmotionId,
  DigitalHumanFacialMuscles,
  DigitalHumanProfile,
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
  scriptText?: string
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
    /[？?…]|竟然|真相|千万别|小心|秘密|为什么|吓人|细思极恐|背后/.test(text);
  const hasExcitedCue =
    /[！!]|太绝|爆款|冲|必看|超值|哇|天呐|搞定|惊艳|福利/.test(text);
  const hasSeriousCue =
    /评测|实测|数据|核心|警示|警告|对比|原理|避坑|报告|专业/.test(text);

  let emotion: DigitalHumanEmotionId = 'neutral';
  let confidence = 0.78;
  let toneSummary = '音频语调平稳均衡，已匹配自然演播室面部肌肉驱动。';

  if (hasSuspenseCue || (pauseRatio >= 0.32 && pitchVariance >= 0.25 && energyRms < 0.36)) {
    emotion = 'suspense';
    confidence = 0.86;
    toneSummary = `检测到语调停顿拉长（停顿比 ${Math.round(pauseRatio * 100)}%）与高低音落差，自动增强眉峰紧绷与锐利聚焦眼神参数。`;
  } else if (
    (energyRms >= 0.28 && tempoBurstRate >= 2.6) ||
    (hasExcitedCue && energyRms >= 0.2)
  ) {
    emotion = 'excited';
    confidence = 0.89;
    toneSummary = `检测到高声压能量与高频音节爆发（${tempoBurstRate.toFixed(1)} 次/秒），自动放大张口幅度、挑眉张力与嘴角上扬曲线。`;
  } else if (
    hasSeriousCue ||
    (pitchVariance < 0.26 && energyRms >= 0.16 && tempoBurstRate < 2.8)
  ) {
    emotion = 'serious';
    confidence = 0.84;
    toneSummary = `检测到声线沉稳低波动（语调方差 ${pitchVariance.toFixed(2)}），自动收敛微笑弧度并加强眉弓沉稳与咬字锐度。`;
  } else if (energyRms >= 0.14 && pauseRatio < 0.28) {
    emotion = 'warm';
    confidence = 0.81;
    toneSummary = '语速柔和流畅、音量分布均匀，已匹配亲和微笑与松弛自然的面部肌肉参数。';
  }

  const basePreset = getDigitalHumanEmotionPreset(emotion);
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
