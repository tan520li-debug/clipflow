import type { TimelineClip } from '../../types/studio';
import { MIN_SPLIT_EDGE_SEC, splitClipAtLocalTime } from './splitClip';

export interface PlacedInsert {
  clips: TimelineClip[];
  at: number;
  splitFromId?: string;
  secondId?: string;
}

/** Put a new clip on the playhead. Near a cut it uses that cut; otherwise it splits the clip underneath. */
export function placeInsertedClip(
  clips: readonly TimelineClip[],
  incoming: TimelineClip,
  time: number,
): PlacedInsert {
  const total = clips.reduce((sum, clip) => sum + clip.duration, 0);
  const atTime = Number.isFinite(time) ? Math.max(0, Math.min(time, total)) : total;
  if (clips.length === 0 || total - atTime <= 0.05) {
    return { clips: [...clips, incoming], at: Number(total.toFixed(2)) };
  }

  let start = 0;
  for (let index = 0; index < clips.length; index++) {
    const clip = clips[index];
    const end = start + clip.duration;
    if (atTime >= end && index < clips.length - 1) {
      start = end;
      continue;
    }
    const local = atTime - start;
    if (local < MIN_SPLIT_EDGE_SEC) {
      const next = [...clips];
      next.splice(index, 0, incoming);
      return { clips: next, at: Number(start.toFixed(2)) };
    }
    if (clip.duration - local < MIN_SPLIT_EDGE_SEC) {
      const next = [...clips];
      next.splice(index + 1, 0, incoming);
      return { clips: next, at: Number(end.toFixed(2)) };
    }
    const split = splitClipAtLocalTime(clip, local, `${clip.id}-split-${incoming.id}`);
    if (!split) {
      const next = [...clips];
      next.splice(index + 1, 0, incoming);
      return { clips: next, at: Number(end.toFixed(2)) };
    }
    const next = [...clips];
    next.splice(index, 1, split.first, incoming, split.second);
    return {
      clips: next,
      at: Number((start + split.first.duration).toFixed(2)),
      splitFromId: clip.id,
      secondId: split.second.id,
    };
  }

  return { clips: [...clips, incoming], at: Number(total.toFixed(2)) };
}
