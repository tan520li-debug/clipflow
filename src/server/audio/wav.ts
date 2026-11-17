import { extractMelPhonemeAlignmentFromPcm } from '../../domain/speech/index.ts';

export function stripScriptTags(text: string): string {
  return text
    .replace(/<\s*(breath|laugh|gasp)\s*>/gi, ' ')
    .replace(/\|(mhm|yeah)\|/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function getWavDurationSec(base64: string): number | null {
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

export function extractWavMelPhonemeAlignment(
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

export function parseWavPcmMonoInt16(
  base64: string
): { sampleRate: number; samples: Int16Array } | null {
  try {
    const clean = base64.includes(',') ? base64.split(',')[1] : base64;
    const buf = Buffer.from(clean, 'base64');
    if (buf.length < 44) return null;
    if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
      return null;
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

    if (bitsPerSample !== 16) return null;
    const frameBytes = 2 * numChannels;
    const totalFrames = Math.floor(dataSize / frameBytes);
    if (totalFrames <= 0) return null;

    const samples = new Int16Array(totalFrames);
    for (let i = 0; i < totalFrames; i++) {
      let sum = 0;
      const frameBase = dataOffset + i * frameBytes;
      for (let ch = 0; ch < numChannels; ch++) {
        sum += buf.readInt16LE(frameBase + ch * 2);
      }
      samples[i] = Math.max(-32768, Math.min(32767, Math.round(sum / numChannels)));
    }
    return { sampleRate, samples };
  } catch {
    return null;
  }
}

export function resampleInt16Mono(
  samples: Int16Array,
  fromRate: number,
  toRate: number
): Int16Array {
  if (fromRate === toRate || samples.length === 0) return samples;
  const outLen = Math.max(1, Math.round((samples.length * toRate) / fromRate));
  const out = new Int16Array(outLen);
  const ratio = fromRate / toRate;
  for (let i = 0; i < outLen; i++) {
    const srcPos = i * ratio;
    const idx0 = Math.min(samples.length - 1, Math.floor(srcPos));
    const idx1 = Math.min(samples.length - 1, idx0 + 1);
    const frac = srcPos - idx0;
    const val = samples[idx0] * (1 - frac) + samples[idx1] * frac;
    out[i] = Math.max(-32768, Math.min(32767, Math.round(val)));
  }
  return out;
}

export function buildMonoWavBase64(samples: Int16Array, sampleRate: number): string {
  const dataSize = samples.length * 2;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 4, 'ascii');
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8, 4, 'ascii');
  header.write('fmt ', 12, 4, 'ascii');
  header.writeUInt32LE(16, 16); // PCM fmt chunk size
  header.writeUInt16LE(1, 20); // PCM audio format
  header.writeUInt16LE(1, 22); // Mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28); // ByteRate
  header.writeUInt16LE(2, 32); // BlockAlign
  header.writeUInt16LE(16, 34); // BitsPerSample
  header.write('data', 36, 4, 'ascii');
  header.writeUInt32LE(dataSize, 40);

  const pcmBuf = Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength);
  return Buffer.concat([header, pcmBuf]).toString('base64');
}

function sampleRateFromMime(mimeType: string): number {
  const match = /(?:^|[;\s])rate=(\d+)/i.exec(mimeType);
  const rate = match ? Number(match[1]) : 24000;
  if (!Number.isFinite(rate) || rate < 8000 || rate > 192000) return 24000;
  return rate;
}

function isRawPcmMime(mimeType: string): boolean {
  return /audio\/(?:L16|pcm|raw)\b/i.test(mimeType) || /codec=pcm/i.test(mimeType);
}

function parseRawPcm16Le(
  base64: string,
  sampleRate: number,
): { sampleRate: number; samples: Int16Array } | null {
  try {
    const clean = base64.includes(',') ? base64.split(',')[1] : base64;
    const buf = Buffer.from(clean, 'base64');
    const frames = Math.floor(buf.length / 2);
    if (frames <= 0) return null;
    const samples = new Int16Array(frames);
    for (let i = 0; i < frames; i++) samples[i] = buf.readInt16LE(i * 2);
    return { sampleRate, samples };
  } catch {
    return null;
  }
}

function parseSegmentPcm(segment: {
  data: string;
  mimeType: string;
}): { sampleRate: number; samples: Int16Array } | null {
  const wav = parseWavPcmMonoInt16(segment.data);
  if (wav) return wav;
  if (!isRawPcmMime(segment.mimeType || '')) return null;
  return parseRawPcm16Le(segment.data, sampleRateFromMime(segment.mimeType || ''));
}

function wavFromPcm(parsed: {
  sampleRate: number;
  samples: Int16Array;
}): { audioBase64: string; mimeType: string; durationSec: number } {
  return {
    audioBase64: buildMonoWavBase64(parsed.samples, parsed.sampleRate),
    mimeType: 'audio/wav',
    durationSec: Number(Math.max(0.4, parsed.samples.length / parsed.sampleRate).toFixed(2)),
  };
}

export function concatenateWavBase64Segments(
  segments: Array<{ data: string; mimeType: string }>,
  pauseMs = 120
): { audioBase64: string; mimeType: string; durationSec: number | null } {
  if (segments.length === 0) {
    throw new Error('No audio segments provided');
  }

  const parsedList = segments.map((s) => parseSegmentPcm(s));
  if (parsedList.some((p) => p === null)) {
    return {
      audioBase64: segments[0].data,
      mimeType: segments[0].mimeType || 'audio/wav',
      durationSec: getWavDurationSec(segments[0].data),
    };
  }

  if (segments.length === 1 && getWavDurationSec(segments[0].data) !== null) {
    return {
      audioBase64: segments[0].data,
      mimeType: segments[0].mimeType || 'audio/wav',
      durationSec: getWavDurationSec(segments[0].data),
    };
  }

  if (segments.length === 1) {
    return wavFromPcm(parsedList[0] as { sampleRate: number; samples: Int16Array });
  }

  const valid = parsedList as Array<{ sampleRate: number; samples: Int16Array }>;
  const targetRate = valid[0].sampleRate || 24000;
  const pauseSamplesCount = Math.max(0, Math.round((targetRate * pauseMs) / 1000));

  const normalizedChunks = valid.map((v) =>
    v.sampleRate === targetRate
      ? v.samples
      : resampleInt16Mono(v.samples, v.sampleRate, targetRate)
  );

  const totalSampleCount =
    normalizedChunks.reduce((acc, c) => acc + c.length, 0) +
    Math.max(0, normalizedChunks.length - 1) * pauseSamplesCount;

  const stitched = new Int16Array(totalSampleCount);
  let cursor = 0;
  for (let i = 0; i < normalizedChunks.length; i++) {
    stitched.set(normalizedChunks[i], cursor);
    cursor += normalizedChunks[i].length;
    if (i < normalizedChunks.length - 1) {
      cursor += pauseSamplesCount; // zero-filled pause gap
    }
  }

  const stitchedBase64 = buildMonoWavBase64(stitched, targetRate);
  const durationSec = Number(Math.max(0.4, totalSampleCount / targetRate).toFixed(2));
  return {
    audioBase64: stitchedBase64,
    mimeType: 'audio/wav',
    durationSec,
  };
}
