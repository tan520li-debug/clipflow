import { describe, expect, it } from 'vitest';
import {
  concatenateWavBase64Segments,
  ensurePlayableWav,
  extractWavMelPhonemeAlignment,
} from './wav';

function pcm16LeBase64(samples: Int16Array): string {
  const buf = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) buf.writeInt16LE(samples[i], i * 2);
  return buf.toString('base64');
}

describe('concatenateWavBase64Segments', () => {
  it('wraps a single Gemini L16 clip as a WAV the browser can play', () => {
    const samples = new Int16Array(24000);
    for (let i = 0; i < samples.length; i++) samples[i] = i % 200 < 100 ? 8000 : -8000;
    const wrapped = concatenateWavBase64Segments([
      {
        data: pcm16LeBase64(samples),
        mimeType: 'audio/L16;codec=pcm;rate=24000',
      },
    ]);
    expect(wrapped.mimeType).toBe('audio/wav');
    expect(wrapped.durationSec).toBe(1);
    const header = Buffer.from(wrapped.audioBase64, 'base64').subarray(0, 12).toString('ascii');
    expect(header.startsWith('RIFF')).toBe(true);
    expect(header.endsWith('WAVE')).toBe(true);
    expect(extractWavMelPhonemeAlignment(wrapped.audioBase64)).toBeDefined();
  });

  it('leaves an existing WAV segment unchanged', () => {
    const samples = new Int16Array(24000);
    samples.fill(1000);
    const wav = concatenateWavBase64Segments([
      { data: pcm16LeBase64(samples), mimeType: 'audio/L16;rate=24000' },
    ]);
    const again = concatenateWavBase64Segments([{ data: wav.audioBase64, mimeType: 'audio/wav' }]);
    expect(again.audioBase64).toBe(wav.audioBase64);
    expect(again.mimeType).toBe('audio/wav');
  });
});

describe('ensurePlayableWav', () => {
  it('turns one Gemini L16 reply into WAV before other routes return it', () => {
    const samples = new Int16Array(4800);
    samples.fill(1200);
    const playable = ensurePlayableWav({
      data: pcm16LeBase64(samples),
      mimeType: 'audio/L16;codec=pcm;rate=24000',
    });
    expect(playable.mimeType).toBe('audio/wav');
    const header = Buffer.from(playable.data, 'base64').subarray(0, 12).toString('ascii');
    expect(header.startsWith('RIFF')).toBe(true);
    expect(header.endsWith('WAVE')).toBe(true);
  });

  it('does not label empty or non-PCM bytes as a WAV', () => {
    const empty = ensurePlayableWav({ data: '', mimeType: 'audio/L16;codec=pcm;rate=24000' });
    expect(empty.data).toBe('');
    expect(empty.mimeType).not.toBe('audio/wav');

    const oddByte = ensurePlayableWav({
      data: Buffer.from([1]).toString('base64'),
      mimeType: 'audio/L16;rate=24000',
    });
    expect(oddByte.mimeType).not.toBe('audio/wav');
    expect(Buffer.from(oddByte.data, 'base64').subarray(0, 4).toString('ascii')).not.toBe('RIFF');

    const foreign = ensurePlayableWav({
      data: Buffer.from('not-pcm-audio', 'utf8').toString('base64'),
      mimeType: 'audio/mpeg',
    });
    expect(foreign.mimeType).toBe('audio/mpeg');
    expect(foreign.data).toBe(Buffer.from('not-pcm-audio', 'utf8').toString('base64'));
  });
});
