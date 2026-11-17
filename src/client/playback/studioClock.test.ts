import { describe, expect, it } from 'vitest';
import {
  advanceStudioCursor,
  clipVideoSeekSec,
  digitalHumanSeekSec,
  shouldSeekMedia,
  shouldWhooshOnClipChange,
} from './studioClock';

describe('advanceStudioCursor', () => {
  it('caps a single frame dt at 0.1 seconds', () => {
    const step = advanceStudioCursor({
      cursorSec: 1,
      lastPerfMs: 0,
      nowMs: 5_000,
      durationSec: 30,
      loop: false,
    });
    expect(step.cursorSec).toBeCloseTo(1.1, 5);
    expect(step.lastPerfMs).toBe(5_000);
    expect(step.reachedEnd).toBe(false);
  });

  it('keeps a frame dt that is already under 0.1 seconds', () => {
    const step = advanceStudioCursor({
      cursorSec: 2,
      lastPerfMs: 1_000,
      nowMs: 1_040,
      durationSec: 30,
      loop: true,
    });
    expect(step.cursorSec).toBeCloseTo(2.04, 5);
    expect(step.lastPerfMs).toBe(1_040);
    expect(step.reachedEnd).toBe(false);
  });

  it('wraps to 0 when playback loops past the duration', () => {
    const step = advanceStudioCursor({
      cursorSec: 9.95,
      lastPerfMs: 0,
      nowMs: 100,
      durationSec: 10,
      loop: true,
    });
    expect(step.cursorSec).toBe(0);
    expect(step.reachedEnd).toBe(true);
    expect(step.lastPerfMs).toBe(100);
  });

  it('stops at the duration and marks the end when not looping', () => {
    const step = advanceStudioCursor({
      cursorSec: 9.95,
      lastPerfMs: 0,
      nowMs: 100,
      durationSec: 10,
      loop: false,
    });
    expect(step.cursorSec).toBe(10);
    expect(step.reachedEnd).toBe(true);
    expect(step.lastPerfMs).toBe(100);
  });
});

describe('shared media seek', () => {
  it('clamps a clip seek into the source file', () => {
    expect(clipVideoSeekSec(1.5, 2, 8)).toBeCloseTo(3.5, 5);
    expect(clipVideoSeekSec(0, -1, 8)).toBe(0);
    expect(clipVideoSeekSec(6, 5, 8)).toBe(8);
    expect(clipVideoSeekSec(1, 1, Number.NaN)).toBe(2);
  });

  it('loops a digital-human seek inside its own duration', () => {
    expect(digitalHumanSeekSec(7, 5)).toBeCloseTo(2, 5);
    expect(digitalHumanSeekSec(-1, 5)).toBeCloseTo(4, 5);
    expect(digitalHumanSeekSec(3, Number.NaN)).toBe(3);
  });

  it('reseeks while paused and only after drift while playing', () => {
    expect(shouldSeekMedia(1, 1.1, true)).toBe(true);
    expect(shouldSeekMedia(1, 1.1, false)).toBe(false);
    expect(shouldSeekMedia(1, 1.3, false)).toBe(true);
  });

  it('whooshes on a non-cut change unless a sound effect is already there', () => {
    expect(
      shouldWhooshOnClipChange({
        previousClipId: 'a',
        clipId: 'b',
        transition: 'fade',
        cursorSec: 4,
        sfxTimes: [],
      }),
    ).toBe(true);
    expect(
      shouldWhooshOnClipChange({
        previousClipId: 'a',
        clipId: 'b',
        transition: 'cut',
        cursorSec: 4,
        sfxTimes: [],
      }),
    ).toBe(false);
    expect(
      shouldWhooshOnClipChange({
        previousClipId: 'a',
        clipId: 'b',
        transition: 'fade',
        cursorSec: 4,
        sfxTimes: [4.2],
      }),
    ).toBe(false);
    expect(
      shouldWhooshOnClipChange({
        previousClipId: null,
        clipId: 'b',
        transition: 'fade',
        cursorSec: 4,
        sfxTimes: [],
      }),
    ).toBe(false);
  });
});
