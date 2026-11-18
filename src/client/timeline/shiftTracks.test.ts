import { describe, expect, it } from 'vitest';
import {
  duplicatePointSpan,
  duplicateTimeSpan,
  moveTimeSpan,
  removePointSpan,
  removeTimeSpan,
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
});
