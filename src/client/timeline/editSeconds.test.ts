import { describe, expect, it } from 'vitest';
import { formatEditSeconds } from './editSeconds';

describe('formatEditSeconds', () => {
  it('keeps a hundredth that would round the wrong way at one decimal', () => {
    expect(formatEditSeconds(1.88)).toBe('1.88');
    expect(formatEditSeconds(2.08)).toBe('2.08');
  });

  it('keeps a whole tenth on one decimal', () => {
    expect(formatEditSeconds(2)).toBe('2.0');
    expect(formatEditSeconds(2.4)).toBe('2.4');
    expect(formatEditSeconds(3.98)).toBe('3.98');
  });
});
