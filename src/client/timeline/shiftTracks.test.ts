import { describe, expect, it } from 'vitest';
import {
  assignPointsToSplitClip,
  duplicatePointSpan,
  duplicateTimeSpan,
  followSubtitleTimes,
  cuesAfterSubtitleEdit,
  matchCuesToChangedRanges,
  sfxAfterSubtitleEdit,
  splitRangesAt,
  replaceSubtitlesInWindow,
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

  it('gives sounds on the new piece to that piece after a split', () => {
    const next = assignPointsToSplitClip(
      [
        { id: 'early', time: 0.4, linkedClipId: 'c1' },
        { id: 'cut', time: 1, linkedClipId: 'c1' },
        { id: 'other', time: 1.4, linkedClipId: 'c2' },
        { id: 'loose', time: 1.6 },
      ],
      1,
      'c1',
      'c1-b',
    );
    expect(next).toEqual([
      { id: 'early', time: 0.4, linkedClipId: 'c1' },
      { id: 'cut', time: 1, linkedClipId: 'c1-b' },
      { id: 'other', time: 1.4, linkedClipId: 'c2' },
      { id: 'loose', time: 1.6 },
    ]);
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

  it('moves a cue with its subtitle and drops the cue when the subtitle is deleted', () => {
    const cues = [{ id: 'cue', subtitleId: 's1', startTime: 0.1, duration: 2 }];
    expect(cuesAfterSubtitleEdit(cues, 's1', { startTime: 3, duration: 1.2, text: '新台词' })).toEqual([
      { id: 'cue', subtitleId: 's1', startTime: 3, duration: 1.2, text: '新台词' },
    ]);
    expect(cuesAfterSubtitleEdit(cues, 's1', null)).toEqual([]);
  });

  it('drops the subtitle sound on a deleted caption and moves it when the caption moves', () => {
    const subtitles = [
      { id: 's1', startTime: 4.04 },
      { id: 's2', startTime: 8.86 },
    ];
    const events = [
      { id: 'cut', time: 3.98, category: 'transition' },
      { id: 'ding', time: 4.04, category: 'subtitle' },
      { id: 'later', time: 8.86, category: 'subtitle' },
    ];
    expect(sfxAfterSubtitleEdit(events, subtitles, 's1', null)).toEqual([
      { id: 'cut', time: 3.98, category: 'transition' },
      { id: 'later', time: 8.86, category: 'subtitle' },
    ]);
    expect(sfxAfterSubtitleEdit(events, subtitles, 's1', { startTime: 5 })).toEqual([
      { id: 'cut', time: 3.98, category: 'transition' },
      { id: 'ding', time: 5, category: 'subtitle' },
      { id: 'later', time: 8.86, category: 'subtitle' },
    ]);
  });

  it('splits a caption that crosses the cut and keeps the cue on the left piece', () => {
    const subtitles = [
      { id: 's1', startTime: 0.5, duration: 3 },
      { id: 's2', startTime: 4, duration: 1 },
    ];
    const next = splitRangesAt(subtitles, 1.5, (id) => `${id}-b`);
    expect(next).toEqual([
      { id: 's1', startTime: 0.5, duration: 1 },
      { id: 's1-b', startTime: 1.5, duration: 2 },
      { id: 's2', startTime: 4, duration: 1 },
    ]);
    expect(splitRangesAt([{ id: 'edge', startTime: 1.48, duration: 1 }], 1.5, (id) => `${id}-b`)).toEqual([
      { id: 'edge', startTime: 1.48, duration: 1 },
    ]);
    const cues = [{ id: 'cue', subtitleId: 's1', startTime: 0.5, duration: 3, text: '一句' }];
    expect(matchCuesToChangedRanges(cues, subtitles, next)).toEqual([
      { id: 'cue', subtitleId: 's1', startTime: 0.5, duration: 1, text: '一句' },
    ]);
  });

  it('drops the cue and subtitle sound when a clip caption is replaced', () => {
    const replaced = replaceSubtitlesInWindow({
      subtitles: [
        { id: 's1', startTime: 0.1, duration: 2 },
        { id: 's2', startTime: 4, duration: 1 },
      ],
      cues: [
        { id: 'c1', subtitleId: 's1', startTime: 0.1 },
        { id: 'c2', subtitleId: 's2', startTime: 4 },
      ],
      sfxEvents: [
        { id: 'cut', time: 0.1, category: 'transition' },
        { id: 'ding', time: 0.1, category: 'subtitle' },
      ],
      clipStart: 0,
      clipDuration: 3,
      nextSubtitles: [{ id: 'n1', startTime: 0.2, duration: 1.5 }],
    });
    expect(replaced.subtitles).toEqual([
      { id: 'n1', startTime: 0.2, duration: 1.5 },
      { id: 's2', startTime: 4, duration: 1 },
    ]);
    expect(replaced.cues).toEqual([{ id: 'c2', subtitleId: 's2', startTime: 4 }]);
    expect(replaced.sfxEvents).toEqual([{ id: 'cut', time: 0.1, category: 'transition' }]);
  });
});
