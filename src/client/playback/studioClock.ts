/** Largest timeline step applied for one animation frame. */
const MAX_FRAME_DT_SEC = 0.1;

export interface StudioCursorAdvanceInput {
  cursorSec: number;
  lastPerfMs: number;
  nowMs: number;
  durationSec: number;
  loop: boolean;
}

export interface StudioCursorAdvance {
  cursorSec: number;
  lastPerfMs: number;
  /** True when this step reached durationSec. Looping playback still reports it and wraps to 0. */
  reachedEnd: boolean;
}

/**
 * Advance a studio timeline cursor from performance timestamps.
 * Drawing, transition whoosh, and audioEngine.syncStep stay with the caller.
 */
export function advanceStudioCursor(input: StudioCursorAdvanceInput): StudioCursorAdvance {
  const dtSec = Math.min(MAX_FRAME_DT_SEC, (input.nowMs - input.lastPerfMs) / 1000);
  const advancedSec = input.cursorSec + dtSec;
  const lastPerfMs = input.nowMs;
  if (advancedSec >= input.durationSec) {
    if (input.loop) {
      return { cursorSec: 0, lastPerfMs, reachedEnd: true };
    }
    return { cursorSec: input.durationSec, lastPerfMs, reachedEnd: true };
  }
  return { cursorSec: advancedSec, lastPerfMs, reachedEnd: false };
}
