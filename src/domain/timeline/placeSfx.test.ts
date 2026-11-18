import { describe, expect, it } from 'vitest';
import { placeSuggestedSfxEvents, placeSuggestedSfxTime } from './placeSfx';

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
});
