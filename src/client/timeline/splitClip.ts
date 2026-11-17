import type { TimelineClip } from '../../types/studio';

/** A split closer than this to either edge is ignored. */
export const MIN_SPLIT_EDGE_SEC = 0.45;

/**
 * Cut one clip into two at a local time.
 * The first piece keeps its incoming transition. The second piece is a hard cut
 * and does not inherit the hook tag.
 */
export function splitClipAtLocalTime(
  clip: TimelineClip,
  localTime: number,
  newId: string,
): { first: TimelineClip; second: TimelineClip } | null {
  if (!Number.isFinite(localTime)) return null;
  if (localTime < MIN_SPLIT_EDGE_SEC || clip.duration - localTime < MIN_SPLIT_EDGE_SEC) return null;
  const firstDuration = Number(localTime.toFixed(2));
  const secondDuration = Number((clip.duration - localTime).toFixed(2));
  if (firstDuration < MIN_SPLIT_EDGE_SEC || secondDuration < MIN_SPLIT_EDGE_SEC) return null;
  const { hookTag: _hookTag, ...rest } = clip;
  return {
    first: { ...clip, duration: firstDuration },
    second: {
      ...rest,
      id: newId,
      label: `${clip.label} (2)`,
      trimStart: Number((clip.trimStart + localTime).toFixed(2)),
      duration: secondDuration,
      transition: 'cut',
    },
  };
}
