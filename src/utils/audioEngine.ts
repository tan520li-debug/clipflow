import type {
  BgmPreset,
  SfxEvent,
  SfxType,
  VoiceDenoiseProfile,
  VoiceoverCue,
} from '../types/studio';

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const clean = b64.includes(',') ? b64.split(',')[1] : b64;
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes.buffer;
}

export interface AcousticNoiseMetrics {
  noiseFloorDb: number;
  peakSpeechDb: number;
  snrDb: number;
  lowRumbleRatio: number;
  highHissRatio: number;
}

/**
 * Decodes the primary voiceover cue and computes real acoustic metrics:
 * quiet-frame ambient noise floor (dBFS), speech level, SNR, low-end rumble, and high-end hiss.
 */
export async function analyzeVoiceoverCuesAcousticMetrics(
  cues: VoiceoverCue[]
): Promise<AcousticNoiseMetrics> {
  const fallback: AcousticNoiseMetrics = {
    noiseFloorDb: -46,
    peakSpeechDb: -16,
    snrDb: 30,
    lowRumbleRatio: 0.12,
    highHissRatio: 0.08,
  };
  const target = cues.find((c) => Boolean(c.audioBase64));
  if (!target?.audioBase64) return fallback;

  let tempCtx: AudioContext | null = null;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    tempCtx = new AudioCtx();
    const raw = base64ToArrayBuffer(target.audioBase64);
    const buf = await tempCtx.decodeAudioData(raw.slice(0));
    const samples = buf.getChannelData(0);
    const sr = buf.sampleRate || 44100;
    const frameSize = Math.max(256, Math.floor(sr * 0.02));
    const frameDb: number[] = [];

    // Estimate low-frequency rumble & high-frequency hiss via simple 1-pole filter splits
    let lpState = 0;
    const lpAlpha = Math.exp((-2 * Math.PI * 160) / sr);
    let totalEnergy = 0;
    let lowEnergy = 0;
    let highEnergy = 0;
    let prevSample = 0;

    for (let i = 0; i < samples.length; i += frameSize) {
      const end = Math.min(samples.length, i + frameSize);
      let sumSq = 0;
      for (let j = i; j < end; j++) {
        const s = samples[j];
        sumSq += s * s;
        lpState = lpAlpha * lpState + (1 - lpAlpha) * s;
        const diff = s - prevSample;
        prevSample = s;
        totalEnergy += s * s;
        lowEnergy += lpState * lpState;
        highEnergy += diff * diff * 0.25;
      }
      const rms = Math.sqrt(sumSq / Math.max(1, end - i));
      const db = rms > 1e-6 ? 20 * Math.log10(rms) : -72;
      frameDb.push(Math.max(-72, Math.min(0, db)));
    }

    if (frameDb.length === 0) return fallback;
    const sorted = [...frameDb].sort((a, b) => a - b);
    const p15 = sorted[Math.floor(sorted.length * 0.15)] ?? -48;
    const p90 = sorted[Math.floor(sorted.length * 0.9)] ?? -16;
    const snr = Math.max(6, Math.min(48, p90 - p15));
    const safeTotal = Math.max(1e-9, totalEnergy);

    return {
      noiseFloorDb: Number(p15.toFixed(1)),
      peakSpeechDb: Number(p90.toFixed(1)),
      snrDb: Number(snr.toFixed(1)),
      lowRumbleRatio: Number(Math.min(0.85, lowEnergy / safeTotal).toFixed(3)),
      highHissRatio: Number(Math.min(0.85, highEnergy / safeTotal).toFixed(3)),
    };
  } catch {
    return fallback;
  } finally {
    if (tempCtx) {
      void tempCtx.close().catch(() => undefined);
    }
  }
}

/**
 * Web Audio procedural beat & BGM synthesizer + micro SFX library + AI/mic voiceover mixer + auto-ducking.
 * Works both for live preview playback and MediaStream export recording.
 */
export class StudioAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private duckingGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private voiceGain: GainNode | null = null;
  private streamDest: MediaStreamAudioDestinationNode | null = null;
  private timerId: number | null = null;
  private lastStep = -1;
  private isPlaying = false;
  private currentPreset: BgmPreset = 'upbeat-128';
  private currentBpm = 128;
  private currentVolume = 0.65;
  private isMuted = false;
  private customAudioEl: HTMLAudioElement | null = null;
  private customSourceNode: MediaElementAudioSourceNode | null = null;
  private customAudioUrl: string | undefined;
  private sfxEvents: SfxEvent[] = [];
  private triggeredSfxIds = new Set<string>();
  private lastSfxCursor = 0;

  // Voiceover 3rd bus & BGM Auto-Ducking
  private voiceoverCues: VoiceoverCue[] = [];
  private voiceoverEnabled = false;
  private voiceoverVolume = 0.95;
  private bgmAutoDucking = true;
  private voiceBufferCache = new Map<string, AudioBuffer>();
  private decodingPromises = new Map<string, Promise<AudioBuffer | null>>();
  private triggeredVoiceIds = new Set<string>();
  private activeVoiceSources = new Set<AudioBufferSourceNode>();
  private activeVoiceStoppers = new Set<() => void>();
  private voicePlaybackEpoch = 0;
  private lastVoiceCursor = 0;
  private isDucking = false;
  private voiceDenoiseEnabled = false;
  private voiceDenoiseStrength = 0.72;
  private voiceDenoiseProfile: VoiceDenoiseProfile | undefined;
  private denoisedBufferCache = new Map<string, AudioBuffer>();

  private ensureContext() {
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
      this.streamDest = this.ctx.createMediaStreamDestination();

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.isMuted ? 0 : this.currentVolume;

      this.duckingGain = this.ctx.createGain();
      this.duckingGain.gain.value = 1.0;
      this.masterGain.connect(this.duckingGain);
      this.duckingGain.connect(this.ctx.destination);
      this.duckingGain.connect(this.streamDest);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = this.isMuted ? 0 : 0.9;
      this.sfxGain.connect(this.ctx.destination);
      this.sfxGain.connect(this.streamDest);

      this.voiceGain = this.ctx.createGain();
      this.voiceGain.gain.value = this.isMuted ? 0 : this.voiceoverVolume;
      this.voiceGain.connect(this.ctx.destination);
      this.voiceGain.connect(this.streamDest);
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  public setConfig(config: {
    preset: BgmPreset;
    bpm: number;
    volume: number;
    muted: boolean;
    customAudioUrl?: string;
  }) {
    this.currentPreset = config.preset;
    this.currentBpm = Math.max(70, Math.min(165, config.bpm || 120));
    this.isMuted = config.muted;
    this.currentVolume = config.muted ? 0 : Math.max(0, Math.min(1, config.volume));

    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.currentVolume, this.ctx.currentTime, 0.03);
    }
    if (this.sfxGain && this.ctx) {
      this.sfxGain.gain.setTargetAtTime(this.isMuted ? 0 : 0.9, this.ctx.currentTime, 0.03);
    }
    if (this.voiceGain && this.ctx) {
      this.voiceGain.gain.setTargetAtTime(
        this.isMuted ? 0 : this.voiceoverVolume,
        this.ctx.currentTime,
        0.03
      );
    }

    if (config.customAudioUrl !== this.customAudioUrl) {
      this.customAudioUrl = config.customAudioUrl;
      this.setupCustomAudio(config.customAudioUrl);
    }
  }

  public setSfxEvents(events: SfxEvent[]) {
    this.sfxEvents = events;
  }

  private getCueCacheKey(cue: VoiceoverCue): string {
    return `${cue.id}:${cue.audioBase64.length}`;
  }

  private decodeVoiceCue(cue: VoiceoverCue): Promise<AudioBuffer | null> {
    if (!cue.audioBase64) return Promise.resolve(null);
    this.ensureContext();
    const key = this.getCueCacheKey(cue);
    const cached = this.voiceBufferCache.get(key);
    if (cached) return Promise.resolve(cached);

    const existingPromise = this.decodingPromises.get(key);
    if (existingPromise) return existingPromise;

    const promise = (async () => {
      try {
        if (!this.ctx) return null;
        const buf = base64ToArrayBuffer(cue.audioBase64);
        const decoded = await this.ctx.decodeAudioData(buf.slice(0));
        this.voiceBufferCache.set(key, decoded);
        return decoded;
      } catch {
        return null;
      } finally {
        this.decodingPromises.delete(key);
      }
    })();

    this.decodingPromises.set(key, promise);
    return promise;
  }

  public setVoiceoverConfig(config: {
    cues: VoiceoverCue[];
    enabled: boolean;
    volume: number;
    autoDucking: boolean;
    denoiseEnabled?: boolean;
    denoiseStrength?: number;
    denoiseProfile?: VoiceDenoiseProfile;
  }) {
    this.voiceoverCues = config.cues;
    this.voiceoverEnabled = config.enabled;
    this.voiceoverVolume = Math.max(0, Math.min(1.2, config.volume));
    this.bgmAutoDucking = config.autoDucking;
    if (typeof config.denoiseEnabled === 'boolean') {
      this.voiceDenoiseEnabled = config.denoiseEnabled;
    }
    if (typeof config.denoiseStrength === 'number') {
      this.voiceDenoiseStrength = Math.max(0.1, Math.min(1.0, config.denoiseStrength));
    }
    this.voiceDenoiseProfile = config.denoiseProfile;

    if (this.voiceGain && this.ctx) {
      this.voiceGain.gain.setTargetAtTime(
        this.isMuted ? 0 : this.voiceoverVolume,
        this.ctx.currentTime,
        0.03
      );
    }
    if ((!this.voiceoverEnabled || !this.bgmAutoDucking) && this.duckingGain && this.ctx) {
      this.isDucking = false;
      this.duckingGain.gain.setTargetAtTime(1.0, this.ctx.currentTime, 0.06);
    }

    if (this.ctx && config.cues.length > 0) {
      config.cues.forEach((cue) => {
        const key = this.getCueCacheKey(cue);
        if (!this.voiceBufferCache.has(key)) {
          void this.decodeVoiceCue(cue);
        }
      });
    }
  }

  public async preloadVoiceoverCues(): Promise<void> {
    if (this.voiceoverCues.length === 0) return;
    this.ensureContext();
    await Promise.all(this.voiceoverCues.map((cue) => this.decodeVoiceCue(cue)));
  }

  public async measureVoiceoverCues(cues: VoiceoverCue[]): Promise<Record<string, number>> {
    if (cues.length === 0) return {};
    this.ensureContext();
    const out: Record<string, number> = {};
    await Promise.all(
      cues.map(async (cue) => {
        if (typeof cue.audioDurationSec === 'number' && cue.audioDurationSec > 0) {
          out[cue.id] = cue.audioDurationSec;
          return;
        }
        const buf = await this.decodeVoiceCue(cue);
        if (buf && buf.duration > 0) {
          out[cue.id] = Number(buf.duration.toFixed(2));
        }
      })
    );
    return out;
  }

  public async previewVoiceoverCue(cue: VoiceoverCue): Promise<void> {
    this.ensureContext();
    const epoch = ++this.voicePlaybackEpoch;
    this.stopActiveVoiceSources();
    const buf = await this.decodeVoiceCue(cue);
    if (!buf || !this.ctx || !this.voiceGain || epoch !== this.voicePlaybackEpoch) return;
    this.playVoiceBuffer(buf, 0, cue);
  }

  private stopActiveVoiceSources() {
    this.activeVoiceStoppers.forEach((stopFn) => {
      try {
        stopFn();
      } catch {
        // ignore already stopped
      }
    });
    this.activeVoiceStoppers.clear();
    this.activeVoiceSources.forEach((src) => {
      try {
        src.stop();
      } catch {
        // ignore already stopped
      }
    });
    this.activeVoiceSources.clear();
  }

  private getProcessedVoiceBuffer(rawBuf: AudioBuffer, cue?: VoiceoverCue): AudioBuffer {
    if (!this.voiceDenoiseEnabled || !this.ctx) return rawBuf;
    const strength = Math.max(0.1, Math.min(1, this.voiceDenoiseStrength));
    const gateDb = this.voiceDenoiseProfile?.noiseGateDb ?? -42;
    const cueKey = cue ? this.getCueCacheKey(cue) : `len:${rawBuf.length}`;
    const cacheKey = `${cueKey}:dn:${strength.toFixed(2)}:${gateDb}`;
    const cached = this.denoisedBufferCache.get(cacheKey);
    if (cached) return cached;

    try {
      const out = this.ctx.createBuffer(rawBuf.numberOfChannels, rawBuf.length, rawBuf.sampleRate);
      const sr = rawBuf.sampleRate || 44100;
      const winSize = Math.max(128, Math.floor(sr * 0.015)); // 15ms short-time envelope
      const thresholdLin = Math.pow(10, gateDb / 20);
      const floorAtten = Math.max(0.05, 1 - strength * 0.88);
      const attackAlpha = 1 - Math.exp(-1 / (sr * 0.008));
      const releaseAlpha = 1 - Math.exp(-1 / (sr * 0.075));

      for (let ch = 0; ch < rawBuf.numberOfChannels; ch++) {
        const srcData = rawBuf.getChannelData(ch);
        const dstData = out.getChannelData(ch);

        // Compute adaptive noise floor from channel quietest windows
        const blockRms: number[] = [];
        for (let i = 0; i < srcData.length; i += winSize) {
          const end = Math.min(srcData.length, i + winSize);
          let sumSq = 0;
          for (let j = i; j < end; j++) sumSq += srcData[j] * srcData[j];
          blockRms.push(Math.sqrt(sumSq / Math.max(1, end - i)));
        }
        const sortedRms = [...blockRms].sort((a, b) => a - b);
        const measuredFloor = sortedRms[Math.floor(sortedRms.length * 0.15)] ?? 0;
        const gateLin = Math.max(thresholdLin, measuredFloor * 1.45);

        let envGain = 1;
        for (let i = 0; i < srcData.length; i++) {
          const blkIdx = Math.min(blockRms.length - 1, Math.floor(i / winSize));
          const localRms = blockRms[blkIdx] ?? 0;
          let targetGain = 1;
          if (localRms < gateLin) {
            const ratio = gateLin > 1e-6 ? localRms / gateLin : 0;
            // Soft-knee expansion for pauses & ambient background noise
            targetGain = floorAtten + (1 - floorAtten) * Math.pow(ratio, 2.2);
          }
          const alpha = targetGain > envGain ? attackAlpha : releaseAlpha;
          envGain = envGain + alpha * (targetGain - envGain);
          dstData[i] = srcData[i] * envGain;
        }
      }

      if (this.denoisedBufferCache.size > 24) {
        const oldest = this.denoisedBufferCache.keys().next().value;
        if (oldest) this.denoisedBufferCache.delete(oldest);
      }
      this.denoisedBufferCache.set(cacheKey, out);
      return out;
    } catch {
      return rawBuf;
    }
  }

  private playVoiceBuffer(
    buf: AudioBuffer,
    offsetSec = 0,
    cue?: VoiceoverCue,
    maxPlayDurationSec?: number
  ) {
    if (!this.ctx || !this.voiceGain || this.isMuted) return;
    if (offsetSec >= buf.duration - 0.05) return;

    // Guarantee only one voiceover source is audible at any time
    this.stopActiveVoiceSources();

    const ctx = this.ctx;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.getProcessedVoiceBuffer(buf, cue);

    const rate =
      cue?.playbackRate && cue.playbackRate >= 0.75 && cue.playbackRate <= 1.35
        ? cue.playbackRate
        : 1.0;
    src.playbackRate.value = rate;

    const sourceGain = ctx.createGain();
    sourceGain.gain.setValueAtTime(1.0, now);

    let chainHead: AudioNode = src;

    // AI Smart Background Noise Reduction DSP Chain (HPF rumble cut + De-Mud + Clarity + Hiss LPF + Dynamics)
    if (this.voiceDenoiseEnabled) {
      const strength = Math.max(0.1, Math.min(1, this.voiceDenoiseStrength));
      const baseHp = this.voiceDenoiseProfile?.highpassHz ?? 95;
      const baseLp = this.voiceDenoiseProfile?.lowpassHz ?? 11800;
      const basePresence = this.voiceDenoiseProfile?.presenceBoostDb ?? 2.0;

      const hpFilter = ctx.createBiquadFilter();
      hpFilter.type = 'highpass';
      hpFilter.frequency.value = Math.round(70 + (baseHp - 70) * strength);
      hpFilter.Q.value = 0.75;

      const deMudFilter = ctx.createBiquadFilter();
      deMudFilter.type = 'peaking';
      deMudFilter.frequency.value = 280;
      deMudFilter.Q.value = 1.1;
      deMudFilter.gain.value = -2.6 * strength;

      const presenceFilter = ctx.createBiquadFilter();
      presenceFilter.type = 'peaking';
      presenceFilter.frequency.value = 2900;
      presenceFilter.Q.value = 0.9;
      presenceFilter.gain.value = basePresence * strength;

      const lpFilter = ctx.createBiquadFilter();
      lpFilter.type = 'lowpass';
      lpFilter.frequency.value = Math.round(15500 - (15500 - baseLp) * strength);
      lpFilter.Q.value = 0.7;

      const vocalComp = ctx.createDynamicsCompressor();
      vocalComp.threshold.value = -20;
      vocalComp.knee.value = 12;
      vocalComp.ratio.value = 2.6 + strength * 1.2;
      vocalComp.attack.value = 0.008;
      vocalComp.release.value = 0.16;

      chainHead.connect(hpFilter);
      hpFilter.connect(deMudFilter);
      deMudFilter.connect(presenceFilter);
      presenceFilter.connect(lpFilter);
      lpFilter.connect(vocalComp);
      chainHead = vocalComp;
    }

    const lowDb = cue?.eqLowGainDb ?? 0;
    const midDb = cue?.eqMidGainDb ?? 0;
    const highDb = cue?.eqHighGainDb ?? 0;

    if (Math.abs(lowDb) > 0.1 || Math.abs(midDb) > 0.1 || Math.abs(highDb) > 0.1) {
      const lowShelf = ctx.createBiquadFilter();
      lowShelf.type = 'lowshelf';
      lowShelf.frequency.value = 220;
      lowShelf.gain.value = lowDb;

      const midPeak = ctx.createBiquadFilter();
      midPeak.type = 'peaking';
      midPeak.frequency.value = 1400;
      midPeak.Q.value = 1.0;
      midPeak.gain.value = midDb;

      const highShelf = ctx.createBiquadFilter();
      highShelf.type = 'highshelf';
      highShelf.frequency.value = 3600;
      highShelf.gain.value = highDb;

      chainHead.connect(lowShelf);
      lowShelf.connect(midPeak);
      midPeak.connect(highShelf);
      highShelf.connect(sourceGain);
    } else {
      chainHead.connect(sourceGain);
    }
    sourceGain.connect(this.voiceGain);

    let stopped = false;
    const smoothStop = () => {
      if (stopped) return;
      stopped = true;
      try {
        const t = ctx.currentTime;
        sourceGain.gain.cancelScheduledValues(t);
        sourceGain.gain.setValueAtTime(sourceGain.gain.value, t);
        sourceGain.gain.linearRampToValueAtTime(0, t + 0.02);
        src.stop(t + 0.025);
      } catch {
        try {
          src.stop();
        } catch {
          // ignore
        }
      }
    };

    this.activeVoiceSources.add(src);
    this.activeVoiceStoppers.add(smoothStop);
    src.onended = () => {
      stopped = true;
      this.activeVoiceSources.delete(src);
      this.activeVoiceStoppers.delete(smoothStop);
    };

    const remainingAudioSec = Math.max(0.05, (buf.duration - Math.max(0, offsetSec)) / rate);
    if (
      typeof maxPlayDurationSec === 'number' &&
      maxPlayDurationSec > 0.2 &&
      remainingAudioSec > maxPlayDurationSec
    ) {
      const fadeStart = now + Math.max(0.05, maxPlayDurationSec - 0.04);
      sourceGain.gain.setValueAtTime(1.0, fadeStart);
      sourceGain.gain.linearRampToValueAtTime(0, now + maxPlayDurationSec);
      src.start(now, Math.max(0, offsetSec));
      src.stop(now + maxPlayDurationSec + 0.01);
    } else {
      src.start(now, Math.max(0, offsetSec));
    }
  }

  private setupCustomAudio(url?: string) {
    if (this.customAudioEl) {
      this.customAudioEl.pause();
      this.customAudioEl.src = '';
      this.customAudioEl = null;
      this.customSourceNode = null;
    }
    if (!url) return;

    const audio = new Audio(url);
    audio.crossOrigin = 'anonymous';
    audio.loop = true;
    this.customAudioEl = audio;

    if (this.ctx && this.masterGain) {
      try {
        this.customSourceNode = this.ctx.createMediaElementSource(audio);
        this.customSourceNode.connect(this.masterGain);
      } catch {
        // Ignore if element is already connected
      }
    }
  }

  public start(startTimeSec: number) {
    this.ensureContext();
    this.isPlaying = true;
    this.lastStep = -1;
    this.triggeredSfxIds.clear();
    this.triggeredVoiceIds.clear();
    this.voicePlaybackEpoch++;
    this.stopActiveVoiceSources();
    this.lastSfxCursor = Math.max(0, startTimeSec);
    this.lastVoiceCursor = Math.max(0, startTimeSec);
    this.isDucking = false;
    if (this.duckingGain && this.ctx) {
      this.duckingGain.gain.setTargetAtTime(1.0, this.ctx.currentTime, 0.02);
    }

    if (this.voiceoverEnabled && this.voiceoverCues.length > 0) {
      const sorted = [...this.voiceoverCues].sort((a, b) => a.startTime - b.startTime);
      let activeIndex = -1;

      sorted.forEach((cue, idx) => {
        const key = this.getCueCacheKey(cue);
        const cached = this.voiceBufferCache.get(key);
        if (!cached) {
          void this.decodeVoiceCue(cue);
        }
        if (cue.startTime <= startTimeSec + 0.04) {
          this.triggeredVoiceIds.add(cue.id);
        }
        const nextCue = sorted[idx + 1];
        const cueSpanEnd = nextCue
          ? Math.min(nextCue.startTime, cue.startTime + (cached ? cached.duration : cue.duration))
          : cue.startTime + (cached ? cached.duration : cue.duration);
        if (
          cached &&
          startTimeSec > cue.startTime + 0.04 &&
          startTimeSec < cueSpanEnd - 0.1
        ) {
          activeIndex = idx;
        }
      });

      if (activeIndex >= 0) {
        const activeCue = sorted[activeIndex];
        const nextCue = sorted[activeIndex + 1];
        const cached = this.voiceBufferCache.get(this.getCueCacheKey(activeCue));
        if (cached) {
          const remainingSlot = nextCue
            ? Math.max(0.25, nextCue.startTime - startTimeSec - 0.04)
            : undefined;
          this.playVoiceBuffer(cached, startTimeSec - activeCue.startTime, activeCue, remainingSlot);
        }
      }
    }

    if (this.customAudioEl && this.ctx && this.masterGain && !this.customSourceNode) {
      try {
        this.customSourceNode = this.ctx.createMediaElementSource(this.customAudioEl);
        this.customSourceNode.connect(this.masterGain);
      } catch {
        // ignore
      }
    }

    if (this.customAudioEl) {
      this.customAudioEl.currentTime = startTimeSec % Math.max(1, this.customAudioEl.duration || 60);
      void this.customAudioEl.play().catch(() => undefined);
    }
  }

  public syncStep(timelineTimeSec: number) {
    if (!this.isPlaying || !this.ctx || !this.masterGain) return;

    // Schedule any timeline SFX events whose timestamp was just crossed
    if (timelineTimeSec + 0.25 < this.lastSfxCursor) {
      this.triggeredSfxIds.clear();
      this.lastSfxCursor = Math.max(0, timelineTimeSec);
    }
    if (this.sfxEvents.length > 0 && !this.isMuted) {
      for (const ev of this.sfxEvents) {
        if (
          !this.triggeredSfxIds.has(ev.id) &&
          ev.time >= this.lastSfxCursor - 0.04 &&
          ev.time <= timelineTimeSec + 0.04
        ) {
          this.triggeredSfxIds.add(ev.id);
          this.triggerSfx(ev.type, ev.volume);
        }
      }
    }
    this.lastSfxCursor = timelineTimeSec;

    // Schedule Voiceover Cues & BGM Auto-Ducking (strictly monophonic: 1 active cue at a time)
    if (timelineTimeSec + 0.25 < this.lastVoiceCursor) {
      this.triggeredVoiceIds.clear();
      this.voicePlaybackEpoch++;
      this.stopActiveVoiceSources();
      this.lastVoiceCursor = Math.max(0, timelineTimeSec);
    }
    if (this.voiceoverEnabled && this.voiceoverCues.length > 0 && !this.isMuted) {
      const sorted = [...this.voiceoverCues].sort((a, b) => a.startTime - b.startTime);
      let speakingNow = false;
      let cueToTrigger: { cue: VoiceoverCue; cached?: AudioBuffer; maxSlotSec?: number } | null =
        null;

      for (let i = 0; i < sorted.length; i++) {
        const cue = sorted[i];
        const nextCue = sorted[i + 1];
        const cached = this.voiceBufferCache.get(this.getCueCacheKey(cue));
        const effectiveDur = cached ? cached.duration : cue.duration;
        if (
          timelineTimeSec >= cue.startTime - 0.05 &&
          timelineTimeSec <= cue.startTime + effectiveDur + 0.12
        ) {
          speakingNow = true;
        }
        if (
          !this.triggeredVoiceIds.has(cue.id) &&
          cue.startTime >= this.lastVoiceCursor - 0.04 &&
          cue.startTime <= timelineTimeSec + 0.05
        ) {
          this.triggeredVoiceIds.add(cue.id);
          const maxSlotSec = nextCue
            ? Math.max(0.35, nextCue.startTime - cue.startTime - 0.04)
            : undefined;
          // If multiple cues fall in the same frame step, keep only the latest one
          cueToTrigger = { cue, cached, maxSlotSec };
        }
      }

      if (cueToTrigger) {
        const epoch = ++this.voicePlaybackEpoch;
        this.stopActiveVoiceSources();
        const { cue, cached, maxSlotSec } = cueToTrigger;
        if (cached) {
          this.playVoiceBuffer(cached, 0, cue, maxSlotSec);
        } else {
          void this.decodeVoiceCue(cue).then((buf) => {
            if (buf && this.isPlaying && epoch === this.voicePlaybackEpoch) {
              this.playVoiceBuffer(buf, 0, cue, maxSlotSec);
            }
          });
        }
      }

      const shouldDuck = this.bgmAutoDucking && speakingNow;
      if (this.duckingGain && shouldDuck !== this.isDucking) {
        this.isDucking = shouldDuck;
        this.duckingGain.gain.setTargetAtTime(shouldDuck ? 0.28 : 1.0, this.ctx.currentTime, 0.08);
      }
    } else if (this.isDucking && this.duckingGain) {
      this.isDucking = false;
      this.duckingGain.gain.setTargetAtTime(1.0, this.ctx.currentTime, 0.08);
    }
    this.lastVoiceCursor = timelineTimeSec;

    if (this.customAudioEl) return; // Custom track handles BGM playback
    if (this.currentPreset === 'none') return;

    const sixteenthSec = 60 / this.currentBpm / 4;
    const step = Math.floor(timelineTimeSec / sixteenthSec);
    if (step === this.lastStep) return;
    this.lastStep = step;

    const stepInBar = step % 16;
    const now = this.ctx.currentTime;

    if (this.currentPreset === 'upbeat-128') {
      // Kick on 0, 4, 8, 12
      if (stepInBar % 4 === 0) this.triggerKick(now, 0.55);
      // Snare on 4, 12
      if (stepInBar === 4 || stepInBar === 12) this.triggerSnare(now, 0.25);
      // Crisp hi-hat on off-beats
      if (stepInBar % 2 === 1) this.triggerHiHat(now, 0.12);
      // Punchy synth bass
      const bassNotes = [55, 55, 65.41, 73.42, 55, 55, 82.41, 73.42];
      if (stepInBar % 2 === 0) {
        const freq = bassNotes[(stepInBar / 2) % bassNotes.length];
        this.triggerBass(now, freq, 0.16, 'sawtooth');
      }
    } else if (this.currentPreset === 'tech-118') {
      if (stepInBar % 4 === 0) this.triggerKick(now, 0.45);
      if (stepInBar === 4 || stepInBar === 12) this.triggerSnare(now, 0.18);
      if (stepInBar % 2 === 0) this.triggerHiHat(now, 0.08);
      const arp = [220, 261.63, 329.63, 392, 329.63, 261.63, 293.66, 349.23];
      if (stepInBar % 2 === 0) {
        this.triggerPluck(now, arp[(stepInBar / 2) % arp.length], 0.12);
      }
    } else if (this.currentPreset === 'lofi-95') {
      if (stepInBar === 0 || stepInBar === 10) this.triggerKick(now, 0.36);
      if (stepInBar === 4 || stepInBar === 12) this.triggerSnare(now, 0.14);
      if (stepInBar % 2 === 0) this.triggerHiHat(now, 0.05);
      if (stepInBar === 0) {
        [261.63, 329.63, 392.0, 493.88].forEach((f) => this.triggerPad(now, f, 0.06, 0.9));
      } else if (stepInBar === 8) {
        [220.0, 261.63, 329.63, 392.0].forEach((f) => this.triggerPad(now, f, 0.06, 0.9));
      }
    } else if (this.currentPreset === 'narrative-92') {
      if (stepInBar === 0) this.triggerKick(now, 0.28);
      if (stepInBar === 8) this.triggerSnare(now, 0.09);
      const chordIdx = Math.floor(step / 16) % 4;
      const chords = [
        [220.0, 261.63, 329.63],
        [174.61, 220.0, 261.63],
        [130.81, 196.0, 261.63],
        [196.0, 246.94, 293.66],
      ];
      if (stepInBar === 0) {
        chords[chordIdx].forEach((f) => this.triggerPad(now, f, 0.075, 1.4));
      }
      if (stepInBar % 4 === 2) {
        const arpNote = chords[chordIdx][(stepInBar / 4) % 3] * 2;
        this.triggerPluck(now, arpNote, 0.08);
      }
    } else if (this.currentPreset === 'fresh-112') {
      if (stepInBar === 0 || stepInBar === 6 || stepInBar === 10) this.triggerKick(now, 0.34);
      if (stepInBar === 4 || stepInBar === 12) this.triggerHiHat(now, 0.1);
      const freshNotes = [523.25, 587.33, 659.25, 783.99, 880.0, 659.25, 587.33, 523.25];
      if (stepInBar % 2 === 0) {
        this.triggerPluck(now, freshNotes[(stepInBar / 2) % freshNotes.length], 0.11);
      }
      if (stepInBar === 0) {
        [261.63, 329.63, 392.0].forEach((f) => this.triggerPad(now, f, 0.045, 0.8));
      }
    } else if (this.currentPreset === 'suspense-104') {
      if (stepInBar % 4 === 0) this.triggerBass(now, 48.99, 0.22, 'triangle');
      if (stepInBar % 2 === 1) this.triggerHiHat(now, 0.09);
      if (stepInBar === 0) {
        this.triggerPad(now, 146.83, 0.08, 1.2);
        this.triggerPad(now, 155.56, 0.05, 1.2);
      }
      if (stepInBar === 6 || stepInBar === 14) {
        this.triggerPluck(now, stepInBar === 6 ? 698.46 : 659.25, 0.09);
      }
    }
  }

  public previewSfx(type: SfxType, volume = 0.8) {
    this.ensureContext();
    this.triggerSfx(type, volume);
  }

  public triggerSfx(type: SfxType, volume = 0.75) {
    if (!this.ctx || !this.sfxGain || this.isMuted) return;
    const level = Math.max(0.15, Math.min(1.0, volume));
    const now = this.ctx.currentTime;

    if (type === 'whoosh') {
      this.playWhooshSfx(now, level * 0.45);
    } else if (type === 'ding') {
      this.playDingSfx(now, level * 0.32);
    } else if (type === 'click') {
      this.playClickSfx(now, level * 0.45);
    } else if (type === 'pop') {
      this.playPopSfx(now, level * 0.4);
    } else if (type === 'swoosh-impact') {
      this.playWhooshSfx(now, level * 0.38);
      this.playImpactSub(now + 0.09, level * 0.52);
    } else if (type === 'shimmer') {
      this.playShimmerSfx(now, level * 0.22);
    }
  }

  public triggerTransitionWhoosh() {
    if (!this.ctx || !this.sfxGain || this.isMuted) return;
    this.playWhooshSfx(this.ctx.currentTime, 0.22);
  }

  private playWhooshSfx(now: number, level: number) {
    if (!this.ctx || !this.sfxGain) return;
    const dur = 0.24;
    const bufferSize = Math.floor(this.ctx.sampleRate * dur);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      const env = Math.sin((i / bufferSize) * Math.PI);
      data[i] = (Math.random() * 2 - 1) * env;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(340, now);
    filter.frequency.exponentialRampToValueAtTime(2400, now + dur * 0.55);
    filter.frequency.exponentialRampToValueAtTime(580, now + dur);
    filter.Q.value = 1.8;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(level, now + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    noise.start(now);
  }

  private playDingSfx(now: number, level: number) {
    if (!this.ctx || !this.sfxGain) return;
    const partials = [
      { freq: 1318.51, amp: level, dur: 0.42 },
      { freq: 2637.02, amp: level * 0.42, dur: 0.28 },
    ];
    for (const p of partials) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(p.freq, now);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(p.amp, now + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + p.dur);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now);
      osc.stop(now + p.dur + 0.02);
    }
  }

  private playClickSfx(now: number, level: number) {
    if (!this.ctx || !this.sfxGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1850, now);
    osc.frequency.exponentialRampToValueAtTime(520, now + 0.035);
    gain.gain.setValueAtTime(level, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.05);
  }

  private playPopSfx(now: number, level: number) {
    if (!this.ctx || !this.sfxGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.exponentialRampToValueAtTime(920, now + 0.075);
    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(level, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.095);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.11);
  }

  private playImpactSub(now: number, level: number) {
    if (!this.ctx || !this.sfxGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(115, now);
    osc.frequency.exponentialRampToValueAtTime(36, now + 0.18);
    gain.gain.setValueAtTime(level, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.24);
  }

  private playShimmerSfx(now: number, level: number) {
    if (!this.ctx || !this.sfxGain) return;
    const freqs = [1567.98, 1975.53, 2349.32];
    freqs.forEach((freq, idx) => {
      if (!this.ctx || !this.sfxGain) return;
      const start = now + idx * 0.045;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(level * 0.55, start + 0.06);
      gain.gain.exponentialRampToValueAtTime(0.0008, start + 0.42);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(start);
      osc.stop(start + 0.45);
    });
  }

  public stop() {
    this.isPlaying = false;
    this.lastStep = -1;
    this.voicePlaybackEpoch++;
    this.stopActiveVoiceSources();
    this.isDucking = false;
    if (this.duckingGain && this.ctx) {
      this.duckingGain.gain.setTargetAtTime(1.0, this.ctx.currentTime, 0.04);
    }
    if (this.timerId !== null) {
      window.clearInterval(this.timerId);
      this.timerId = null;
    }
    if (this.customAudioEl) {
      this.customAudioEl.pause();
    }
  }

  public getExportAudioStream(): MediaStream | null {
    this.ensureContext();
    return this.streamDest?.stream ?? null;
  }

  private triggerKick(time: number, level: number) {
    if (!this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(135, time);
    osc.frequency.exponentialRampToValueAtTime(42, time + 0.12);
    gain.gain.setValueAtTime(level, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.16);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(time);
    osc.stop(time + 0.17);
  }

  private triggerSnare(time: number, level: number) {
    if (!this.ctx || !this.masterGain) return;
    const bufferSize = this.ctx.sampleRate * 0.1;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 950;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(level, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    noise.start(time);
  }

  private triggerHiHat(time: number, level: number) {
    if (!this.ctx || !this.masterGain) return;
    const bufferSize = this.ctx.sampleRate * 0.04;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 5500;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(level, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    noise.start(time);
  }

  private triggerBass(time: number, freq: number, level: number, type: OscillatorType) {
    if (!this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, time);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(340, time);
    gain.gain.setValueAtTime(level, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.18);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    osc.start(time);
    osc.stop(time + 0.19);
  }

  private triggerPluck(time: number, freq: number, level: number) {
    if (!this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, time);
    gain.gain.setValueAtTime(level, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.22);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(time);
    osc.stop(time + 0.23);
  }

  private triggerPad(time: number, freq: number, level: number, dur: number) {
    if (!this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, time);
    gain.gain.setValueAtTime(0.001, time);
    gain.gain.linearRampToValueAtTime(level, time + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.001, time + dur);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(time);
    osc.stop(time + dur + 0.02);
  }
}
