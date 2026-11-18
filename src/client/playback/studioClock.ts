/** Largest timeline step applied for one animation frame. */
const MAX_FRAME_DT_SEC = 0.1;
/** Reseek a media element when it has drifted farther than this from the timeline. */
export const MEDIA_SEEK_DRIFT_SEC = 0.25;
/** Skip the transition whoosh when a custom sound effect already sits this close. */
export const TRANSITION_SFX_WINDOW_SEC = 0.35;

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
 * Drawing and audioEngine.syncStep stay with the caller.
 * Preview and export both use the seek and whoosh decisions below.
 */

function finiteSpan(durationSec: number, fallback: number): number {
  return Number.isFinite(durationSec) && durationSec > 0 ? durationSec : fallback;
}

/** Timeline position inside a clip's source video, clamped to the file. */
export function clipVideoSeekSec(trimStart: number, localTime: number, durationSec: number): number {
  const span = finiteSpan(durationSec, 10);
  return Math.min(span, Math.max(0, trimStart + localTime));
}

/** Loop a digital-human clip across its own duration. */
export function digitalHumanSeekSec(localTime: number, durationSec: number): number {
  const span = Math.max(1, finiteSpan(durationSec, 5));
  const wrapped = ((localTime % span) + span) % span;
  return Math.min(span, wrapped);
}

/** Pause always reseeks. Playback reseeks only after the element drifts. */
export function shouldSeekMedia(currentSec: number, targetSec: number, force: boolean): boolean {
  return force || Math.abs(currentSec - targetSec) > MEDIA_SEEK_DRIFT_SEC;
}

export function shouldWhooshOnClipChange(input: {
  previousClipId: string | null;
  clipId: string;
  transition: string;
  cursorSec: number;
  sfxTimes: readonly number[];
}): boolean {
  if (!input.previousClipId || input.previousClipId === input.clipId) return false;
  if (input.transition === 'cut') return false;
  return !input.sfxTimes.some((time) => Math.abs(time - input.cursorSec) < TRANSITION_SFX_WINDOW_SEC);
}

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

/** The on-screen timecode only shows tenths, so the React playhead can follow that. */
export function playheadTickChanged(previousSec: number, nextSec: number): boolean {
  const tenth = (value: number) => Math.floor(Math.max(0, value) * 10);
  return tenth(previousSec) !== tenth(nextSec);
}
