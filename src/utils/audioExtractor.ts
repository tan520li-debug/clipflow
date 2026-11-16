/**
 * Extracts a slice of audio from a local video/audio URL and encodes it as
 * compact 16kHz mono 16-bit WAV base64 for server-side Gemini transcription.
 */
export async function extractAudioSliceAsWavBase64(
  mediaUrl: string,
  trimStartSec: number,
  durationSec: number
): Promise<{ hasAudio: boolean; base64?: string; mimeType?: string }> {
  try {
    const response = await fetch(mediaUrl);
    const arrayBuffer = await response.arrayBuffer();

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();

    let decoded: AudioBuffer;
    try {
      decoded = await ctx.decodeAudioData(arrayBuffer);
    } catch {
      await ctx.close().catch(() => undefined);
      return { hasAudio: false };
    }

    if (!decoded || decoded.numberOfChannels === 0 || decoded.duration <= 0.05) {
      await ctx.close().catch(() => undefined);
      return { hasAudio: false };
    }

    const sampleRate = 16000;
    const safeStart = Math.max(0, Math.min(decoded.duration - 0.2, trimStartSec));
    const safeDur = Math.max(0.5, Math.min(decoded.duration - safeStart, durationSec, 45));
    const targetFrames = Math.max(1, Math.floor(safeDur * sampleRate));

    const offline = new OfflineAudioContext(1, targetFrames, sampleRate);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start(0, safeStart, safeDur);

    const rendered = await offline.startRendering();
    await ctx.close().catch(() => undefined);

    const channelData = rendered.getChannelData(0);

    // Check if audio is completely silent
    let peak = 0;
    for (let i = 0; i < channelData.length; i += 8) {
      const abs = Math.abs(channelData[i]);
      if (abs > peak) peak = abs;
    }
    if (peak < 0.002) {
      return { hasAudio: false };
    }

    const wavBuffer = encodeMonoWav(channelData, sampleRate);
    const base64 = arrayBufferToBase64(wavBuffer);
    return { hasAudio: true, base64, mimeType: 'audio/wav' };
  } catch {
    return { hasAudio: false };
  }
}

function encodeMonoWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const numSamples = samples.length;
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // Byte rate
  view.setUint16(32, 2, true); // Block align
  view.setUint16(34, 16, true); // Bits per sample
  writeStr(36, 'data');
  view.setUint32(40, numSamples * 2, true);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return buffer;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}
