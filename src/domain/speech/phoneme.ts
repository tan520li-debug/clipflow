import type {
  DigitalHumanPhonemeAlignmentProfile,
  DigitalHumanPhonemeFrame,
  DigitalHumanVisemeClass,
} from '../../types/studio';

const VISEME_SHORT_TAG: Record<DigitalHumanVisemeClass, string> = {
  sil: 'SIL',
  aa: 'AA',
  eh: 'EH',
  iy: 'IY',
  oh: 'OH',
  oo: 'OO',
  fv: 'FV',
  sz: 'SZ',
};

function hzToMel(hz: number): number {
  return 2595 * Math.log10(1 + hz / 700);
}

function melToHz(mel: number): number {
  return 700 * (10 ** (mel / 2595) - 1);
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

    const energyScale = viseme === 'sil' ? 1 : 0.45 + 0.55 * normEnergy ** 0.78;
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
      ? rankedVisemes.map((v) => VISEME_SHORT_TAG[v]).join(' / ')
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
