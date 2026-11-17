import { describe, expect, it } from 'vitest';
import type { TimelineClip } from '../../types/studio';
import { splitClipAtLocalTime } from './splitClip';

function clip(overrides: Partial<TimelineClip> = {}): TimelineClip {
  return {
    id: 'c1',
    assetId: 'a1',
    label: '开场',
    trimStart: 1.25,
    duration: 2.2,
    transition: 'whip-pan',
    motion: 'ken-burns-in',
    filter: 'warm-film',
    speed: 1,
    hookTag: '前3秒卡点钩子',
    ...overrides,
  };
}

describe('splitClipAtLocalTime', () => {
  it('keeps the incoming transition on the first piece and hard-cuts the second', () => {
    const split = splitClipAtLocalTime(clip(), 1, 'c1-b');
    expect(split).not.toBeNull();
    expect(split?.first).toMatchObject({
      id: 'c1',
      duration: 1,
      trimStart: 1.25,
      transition: 'whip-pan',
      hookTag: '前3秒卡点钩子',
    });
    expect(split?.second).toMatchObject({
      id: 'c1-b',
      label: '开场 (2)',
      trimStart: 2.25,
      duration: 1.2,
      transition: 'cut',
      motion: 'ken-burns-in',
    });
    expect(split?.second.hookTag).toBeUndefined();
  });

  it('refuses a cut within 0.45 seconds of either edge', () => {
    expect(splitClipAtLocalTime(clip(), 0.4, 'x')).toBeNull();
    expect(splitClipAtLocalTime(clip(), 1.8, 'x')).toBeNull();
    expect(splitClipAtLocalTime(clip(), Number.NaN, 'x')).toBeNull();
  });
});
