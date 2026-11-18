import { describe, expect, it } from 'vitest';
import type { TimelineClip } from '../../types/studio';
import { placeInsertedClip } from './insertClip';

function clip(id: string, duration: number): TimelineClip {
  return {
    id,
    assetId: 'asset',
    label: id,
    trimStart: 0,
    duration,
    transition: 'cut',
    motion: 'static',
    filter: 'natural',
    speed: 1,
  };
}

const incoming = clip('new', 2.5);

describe('placeInsertedClip', () => {
  it('appends when the playhead is at the end', () => {
    const placed = placeInsertedClip([clip('a', 3), clip('b', 4)], incoming, 7);
    expect(placed.at).toBe(7);
    expect(placed.clips.map((item) => item.id)).toEqual(['a', 'b', 'new']);
  });

  it('inserts at the opening when the playhead is near zero', () => {
    const placed = placeInsertedClip([clip('a', 3.98)], incoming, 0.2);
    expect(placed.at).toBe(0);
    expect(placed.clips.map((item) => item.id)).toEqual(['new', 'a']);
  });

  it('splits the clip under the playhead and sits between the pieces', () => {
    const placed = placeInsertedClip([clip('a', 3.98), clip('b', 4.82)], incoming, 5);
    expect(placed.at).toBe(5);
    expect(placed.splitFromId).toBe('b');
    expect(placed.clips.map((item) => item.duration)).toEqual([3.98, 1.02, 2.5, 3.8]);
    expect(placed.clips[3]?.label).toBe('b (2)');
    expect(placed.clips[3]?.hookTag).toBeUndefined();
  });
});
