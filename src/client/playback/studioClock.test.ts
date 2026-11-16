import { describe, expect, it } from 'vitest';
import { advanceStudioCursor } from './studioClock';

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
