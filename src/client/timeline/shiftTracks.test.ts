import { describe, expect, it } from 'vitest';
import {
  duplicatePointSpan,
  duplicateTimeSpan,
  followSubtitleTimes,
  insertTimeSpan,
  moveTimeSpan,
  remapPointsToDurations,
  remapRangesToDurations,
  removePointSpan,
  removeTimeSpan,
  scalePoints,
} from './shiftTracks';

describe('shiftTracks', () => {
  it('drops a subtitle on a deleted clip and pulls the later one forward', () => {
    const next = removeTimeSpan(
      [
        { id: 'on', startTime: 2.2, duration: 1 },
        { id: 'after', startTime: 5.2, duration: 1.5 },
      ],
      { start: 2, duration: 3 },
    );
    expect(next).toEqual([{ id: 'after', startTime: 2.2, duration: 1.5 }]);
  });

  it('drops a sound effect inside the deleted clip', () => {
    const next = removePointSpan(
      [
        { id: 'hit', time: 3 },
        { id: 'later', time: 6 },
      ],
      { start: 2, duration: 3 },
    );
    expect(next).toEqual([{ id: 'later', time: 3 }]);
  });

  it('moves a cue with its clip and leaves the earlier subtitle', () => {
    const from = { start: 2, duration: 3 };
    const next = moveTimeSpan(
      [
        { id: 'early', startTime: 0.2, duration: 1 },
        { id: 'on', startTime: 2.4, duration: 1 },
      ],
      from,
      4,
    );
    expect(next).toEqual([
      { id: 'on', startTime: 4.4, duration: 1 },
      { id: 'early', startTime: 0.2, duration: 1 },
    ]);
  });

  it('copies a subtitle onto the duplicate and pushes the later one', () => {
    const next = duplicateTimeSpan(
      [
        { id: 'on', startTime: 0.2, duration: 1 },
        { id: 'after', startTime: 2.4, duration: 1 },
      ],
      { start: 0, duration: 2.2 },
      (id) => `${id}-copy`,
    );
    expect(next).toEqual([
      { id: 'on', startTime: 0.2, duration: 1 },
      { id: 'after', startTime: 4.6, duration: 1 },
      { id: 'on-copy', startTime: 2.4, duration: 1 },
    ]);
  });

  it('copies a sound effect that sits on the duplicated clip', () => {
    const next = duplicatePointSpan([{ id: 'whoosh', time: 0.4 }], { start: 0, duration: 2.2 }, (id) => `${id}-copy`);
    expect(next).toEqual([
      { id: 'whoosh', time: 0.4 },
      { id: 'whoosh-copy', time: 2.6 },
    ]);
  });

  it('pulls a later subtitle forward when the clip before it gets shorter', () => {
    const next = remapRangesToDurations(
      [{ id: 'later', startTime: 2.4, duration: 1 }],
      [2.2, 2.6],
      [1.88, 2.6],
    );
    expect(next).toEqual([{ id: 'later', startTime: 2.08, duration: 1 }]);
  });

  it('drops a sound that sat in the trimmed tail', () => {
    const next = remapPointsToDurations([{ id: 'tail', time: 2 }, { id: 'keep', time: 0.5 }], [2.2], [1.88]);
    expect(next).toEqual([{ id: 'keep', time: 0.5 }]);
  });

  it('moves a linked cue onto the rebuilt subtitle and scales the rest', () => {
    const next = followSubtitleTimes(
      [
        { id: 'linked', subtitleId: 's1', startTime: 0.1, duration: 2 },
        { id: 'loose', startTime: 4, duration: 1 },
      ],
      [{ id: 's1', startTime: 0.08, duration: 1.5 }],
      0.5,
    );
    expect(next).toEqual([
      { id: 'linked', subtitleId: 's1', startTime: 0.08, duration: 1.5 },
      { id: 'loose', startTime: 2, duration: 0.5 },
    ]);
  });

  it('scales a sound effect with the rebuilt timeline', () => {
    expect(scalePoints([{ id: 'hit', time: 4 }], 0.5)).toEqual([{ id: 'hit', time: 2 }]);
  });

  it('keeps only the left side of a subtitle that crosses an insert', () => {
    const next = insertTimeSpan(
      [
        { id: 'cross', startTime: 1, duration: 3 },
        { id: 'after', startTime: 5, duration: 1 },
      ],
      2,
      2,
    );
    expect(next).toEqual([
      { id: 'cross', startTime: 1, duration: 1 },
      { id: 'after', startTime: 7, duration: 1 },
    ]);
  });
});
