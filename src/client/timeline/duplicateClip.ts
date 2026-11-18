import type { TimelineClip } from '../../types/studio';

/** A copy sits after the original. It keeps the look, not the opening hook. */
export function duplicateClip(clip: TimelineClip, newId: string): TimelineClip {
  const { hookTag: _hookTag, ...rest } = clip;
  return {
    ...rest,
    id: newId,
    label: `${clip.label} 副本`,
  };
}
