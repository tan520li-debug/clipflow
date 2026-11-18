import { describe, expect, it } from 'vitest';
import { boundsForClips, placeSuggestedSfxEvents, placeSuggestedSfxTime } from './placeSfx';

const clips = [
  { startTime: 0, endTime: 3.98 },
  { startTime: 3.98, endTime: 8.8 },
  { startTime: 8.8, endTime: 20.34 },
];
const subtitles = [{ startTime: 0.1 }, { startTime: 4.04 }, { startTime: 8.86 }];

describe('placeSuggestedSfxTime', () => {
  it('moves a transition sound that missed the cut onto the nearest cut', () => {
    expect(
      placeSuggestedSfxTime({
        time: 2.15,
        category: 'transition',
        totalDuration: 23.49,
        clips,
        subtitles,
      }),
    ).toBe(3.98);
    expect(
      placeSuggestedSfxTime({
        time: 7.45,
        category: 'transition',
        totalDuration: 23.49,
        clips,
        subtitles,
      }),
    ).toBe(8.8);
  });

  it('keeps a transition sound that is already on the cut', () => {
    expect(
      placeSuggestedSfxTime({
        time: 3.93,
        category: 'transition',
        totalDuration: 23.49,
        clips,
        subtitles,
      }),
    ).toBe(3.93);
  });

  it('moves a late hook back to the opening and a missed caption onto the subtitle', () => {
    expect(
      placeSuggestedSfxTime({
        time: 2.2,
        category: 'hook',
        totalDuration: 23.49,
        clips,
        subtitles,
      }),
    ).toBe(0.08);
    expect(
      placeSuggestedSfxTime({
        time: 2.2,
        category: 'subtitle',
        totalDuration: 23.49,
        clips,
        subtitles,
      }),
    ).toBe(4.04);
  });

  it('places each event in a returned list', () => {
    const [event] = placeSuggestedSfxEvents(
      [{ id: 'hit', time: 2.15, category: 'transition' }],
      { totalDuration: 23.49, clips, subtitles },
    );
    expect(event).toEqual({ id: 'hit', time: 3.98, category: 'transition' });
  });

  it('keeps each stale sound on its own cut instead of piling them onto the first one', () => {
    const placed = placeSuggestedSfxEvents(
      [
        { id: 'h', time: 0.1, category: 'hook' },
        { id: 't1', time: 2.75, category: 'transition' },
        { id: 's1', time: 2.8, category: 'subtitle' },
        { id: 't2', time: 5.35, category: 'transition' },
        { id: 't3', time: 8.2, category: 'transition' },
        { id: 's2', time: 8.3, category: 'subtitle' },
      ],
      {
        totalDuration: 46.33,
        clips: [
          { startTime: 0, endTime: 11.5 },
          { startTime: 11.5, endTime: 22.96 },
          { startTime: 22.96, endTime: 35.7 },
          { startTime: 35.7, endTime: 46.33 },
        ],
        subtitles: [{ startTime: 0.1 }, { startTime: 11.56 }, { startTime: 23.02 }, { startTime: 35.76 }],
      },
    );
    expect(placed.map((event) => [event.id, event.time])).toEqual([
      ['h', 0.1],
      ['t1', 11.5],
      ['s1', 11.56],
      ['t2', 22.96],
      ['t3', 35.7],
      ['s2', 35.76],
    ]);
  });

  it('uses the clip a sound already names when the old time is still on the short grid', () => {
    const placed = placeSuggestedSfxEvents(
      [
        { id: 'hit', time: 4.75, category: 'transition', linkedClipId: 'c3' },
        { id: 'pop', time: 4.8, category: 'subtitle', linkedClipId: 'c3' },
      ],
      {
        totalDuration: 23.49,
        clips: [
          { id: 'c1', startTime: 0, endTime: 3.98 },
          { id: 'c2', startTime: 3.98, endTime: 8.8 },
          { id: 'c3', startTime: 8.8, endTime: 20.34 },
          { id: 'c4', startTime: 20.34, endTime: 23.49 },
        ],
        subtitles: [{ startTime: 0.1 }, { startTime: 4.04 }, { startTime: 8.86 }, { startTime: 20.4 }],
      },
    );
    expect(placed.map((event) => [event.id, event.time, event.linkedClipId])).toEqual([
      ['hit', 8.8, 'c3'],
      ['pop', 8.86, 'c3'],
    ]);
  });

  it('builds clip bounds from durations', () => {
    expect(boundsForClips([{ duration: 3.98 }, { duration: 4.82 }])).toEqual([
      { startTime: 0, endTime: 3.98 },
      { startTime: 3.98, endTime: 8.8 },
    ]);
  });
});
