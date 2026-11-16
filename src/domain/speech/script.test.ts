import { describe, expect, it } from 'vitest';
import { extractMelPhonemeAlignmentFromPcm } from './phoneme';
import { estimateSpeechDurationSec, splitSpeechScriptIntoSegments } from './script';

describe('splitSpeechScriptIntoSegments', () => {
  it('returns no segments for blank text', () => {
    expect(splitSpeechScriptIntoSegments('   ')).toEqual([]);
  });

  it('keeps each sentence inside the character budget', () => {
    const sentence = `${'甲'.repeat(50)}。`;
    const parts = splitSpeechScriptIntoSegments(sentence.repeat(5), 80);
    expect(parts.length).toBe(5);
    expect(parts.every((part) => part.length <= 80)).toBe(true);
  });
});

describe('estimateSpeechDurationSec', () => {
  it('returns zero when there is nothing to speak', () => {
    expect(estimateSpeechDurationSec('')).toBe(0);
  });

  it('estimates a positive duration for a Chinese line', () => {
    expect(estimateSpeechDurationSec('今天把冰拿铁的注水步骤讲清楚')).toBeGreaterThan(1);
  });
});

describe('extractMelPhonemeAlignmentFromPcm', () => {
  it('builds a mel profile from silence', () => {
    const profile = extractMelPhonemeAlignmentFromPcm(new Float32Array(24_000), 24_000, {
      fps: 30,
    });
    expect(profile.melBands).toBe(24);
    expect(profile.frames.length).toBeGreaterThan(10);
    expect(profile.dominantVisemes.length).toBeGreaterThan(0);
  });
});
