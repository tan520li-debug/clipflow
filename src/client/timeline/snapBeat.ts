import type { MediaAsset, TimelineClip } from '../../types/studio';

/** Two beats, and never faster than 70 BPM. Matches the timeline snap button. */
export function beatPairSec(bpm: number): number {
  const safe = Number.isFinite(bpm) ? bpm : 70;
  return (60 / Math.max(70, safe)) * 2;
}

/** How much of a video is left after the in-point. Stills have no cap. */
export function videoRemainSec(
  trimStart: number,
  asset: Pick<MediaAsset, 'type' | 'duration'> | undefined,
): number | undefined {
  if (!asset || asset.type !== 'video' || !Number.isFinite(asset.duration)) return undefined;
  const start = Number.isFinite(trimStart) ? trimStart : 0;
  const remain = asset.duration - start;
  return remain > 0 ? remain : undefined;
}

/**
 * Round a clip to the nearest pair of beats.
 * A video cannot run past the source file.
 */
export function snapDurationToBeat(duration: number, beatSec: number, maxDuration?: number): number {
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 1;
  const safeBeat = Number.isFinite(beatSec) && beatSec > 0 ? beatSec : beatPairSec(70);
  const beats = Math.max(1, Math.round(safeDuration / safeBeat));
  let next = Number(Math.max(1, beats * safeBeat).toFixed(2));
  if (maxDuration !== undefined && Number.isFinite(maxDuration) && maxDuration > 0) {
    next = Number(Math.min(next, maxDuration).toFixed(2));
  }
  return next;
}

export function snapClipsToBeat(
  clips: TimelineClip[],
  bpm: number,
  assets: Map<string, Pick<MediaAsset, 'type' | 'duration'>>,
): TimelineClip[] {
  const beatSec = beatPairSec(bpm);
  return clips.map((clip) => ({
    ...clip,
    duration: snapDurationToBeat(clip.duration, beatSec, videoRemainSec(clip.trimStart, assets.get(clip.assetId))),
  }));
}
