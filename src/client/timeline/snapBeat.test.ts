import { describe, expect, it } from 'vitest';
import type { TimelineClip } from '../../types/studio';
import { snapClipsToBeat } from './snapBeat';

function clip(overrides: Partial<TimelineClip> = {}): TimelineClip {
  return {
    id: 'c1',
    assetId: 'v1',
    label: '落豆',
    trimStart: 0,
    duration: 2.2,
    transition: 'cut',
    motion: 'ken-burns-in',
    filter: 'warm-film',
    speed: 1,
    ...overrides,
  };
}

describe('snapClipsToBeat', () => {
  it('rounds a still to the nearest two-beat length', () => {
    const assets = new Map([['img', { type: 'image' as const, duration: 5 }]]);
    const [next] = snapClipsToBeat([clip({ assetId: 'img', duration: 2.2 })], 128, assets);
    expect(next.duration).toBe(1.88);
  });

  it('does not run a video past the footage left after the in-point', () => {
    const assets = new Map([['v1', { type: 'video' as const, duration: 3 }]]);
    const [next] = snapClipsToBeat([clip({ trimStart: 1.6, duration: 2.2 })], 128, assets);
    expect(next.duration).toBe(1.4);
  });

  it('treats a BPM under 70 as 70', () => {
    const assets = new Map<string, { type: 'image'; duration: number }>();
    const [next] = snapClipsToBeat([clip({ assetId: 'missing', duration: 2.2 })], 40, assets);
    expect(next.duration).toBe(1.71);
  });
});
