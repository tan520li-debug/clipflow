export interface SfxClipBound {
  startTime: number;
  endTime: number;
  id?: string;
}

/** Pull a suggested sound onto the current timeline when the model used an old second. */
export function placeSuggestedSfxTime(input: {
  time: number;
  category: string;
  totalDuration: number;
  clips: readonly SfxClipBound[];
  subtitles: readonly { startTime: number }[];
}): number {
  const total = Math.max(0.2, input.totalDuration);
  const maxTime = Number((total - 0.1).toFixed(2));
  const clamp = (value: number) => Number(Math.max(0, Math.min(maxTime, value)).toFixed(2));
  const raw = Number.isFinite(input.time) ? input.time : 0;
  const nearest = (targets: readonly number[], value: number) =>
    targets.reduce((best, item) => (Math.abs(item - value) < Math.abs(best - value) ? item : best));

  const cuts = input.clips.map((clip) => clip.startTime).filter((start) => start > 0.05);
  if (input.category === 'transition' && cuts.length > 0) {
    const cut = nearest(cuts, raw);
    return clamp(Math.abs(cut - raw) > 0.2 ? cut : raw);
  }

  const subtitleStarts = input.subtitles.map((subtitle) => subtitle.startTime);
  if (input.category === 'subtitle' && subtitleStarts.length > 0) {
    const start = nearest(subtitleStarts, raw);
    return clamp(Math.abs(start - raw) > 0.2 ? start : raw);
  }

  if (input.category === 'hook' && raw > 0.45) return clamp(0.08);
  return clamp(raw);
}

export function boundsForClips(clips: readonly { duration: number; id?: string }[]): SfxClipBound[] {
  const bounds: SfxClipBound[] = [];
  let cursor = 0;
  for (const clip of clips) {
    const startTime = Number(cursor.toFixed(2));
    cursor += clip.duration;
    bounds.push(clip.id ? { startTime, endTime: Number(cursor.toFixed(2)), id: clip.id } : { startTime, endTime: Number(cursor.toFixed(2)) });
  }
  return bounds;
}

const NEAR_SEC = 0.2;
const FOLLOW_SEC = 0.25;

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function nearestNumber(targets: readonly number[], value: number): number {
  return targets.reduce((best, item) => (Math.abs(item - value) < Math.abs(best - value) ? item : best));
}

function clipIdForPlacedTime(clips: readonly SfxClipBound[], category: string, time: number): string | undefined {
  if (category === 'transition') {
    return clips.find((clip) => clip.id && clip.startTime > 0.05 && Math.abs(clip.startTime - time) <= FOLLOW_SEC)?.id;
  }
  return (
    clips.find((clip) => clip.id && time >= clip.startTime - 0.05 && time < clip.endTime - 0.001)?.id ??
    [...clips].reverse().find((clip) => clip.id)?.id
  );
}

/**
 * Seat a whole sound list.
 * One stale time still uses the nearest cut.
 * Several stale times that match the cuts one-for-one keep their order, so they do not pile onto the first cut.
 * A caption sound that sits on a transition follows that transition.
 * A sound that already names its clip uses that clip.
 */
export function placeSuggestedSfxEvents<
  T extends { time: number; category: string; linkedClipId?: string },
>(
  events: readonly T[],
  input: {
    totalDuration: number;
    clips: readonly SfxClipBound[];
    subtitles: readonly { startTime: number }[];
  },
): T[] {
  const total = Math.max(0.2, input.totalDuration);
  const maxTime = round2(total - 0.1);
  const clamp = (value: number) => round2(Math.max(0, Math.min(maxTime, value)));
  const cuts = input.clips.map((clip) => clip.startTime).filter((start) => start > 0.05);
  const subtitleStarts = input.subtitles.map((subtitle) => subtitle.startTime);
  const draft = events.map((event, index) => ({ event, index, time: Number.isFinite(event.time) ? event.time : 0 }));

  const transitionTime = new Map<number, number>();
  for (const item of draft) {
    if (item.event.category !== 'transition' || !item.event.linkedClipId) continue;
    const linked = input.clips.find((clip) => clip.id === item.event.linkedClipId);
    if (!linked || linked.startTime <= 0.05) continue;
    transitionTime.set(
      item.index,
      clamp(Math.abs(linked.startTime - item.time) > NEAR_SEC ? linked.startTime : item.time),
    );
  }

  const unlinkedTransitions = draft.filter(
    (item) => item.event.category === 'transition' && !transitionTime.has(item.index),
  );
  const usedCuts = new Set<number>();
  for (const item of unlinkedTransitions) {
    if (cuts.length === 0) {
      transitionTime.set(item.index, clamp(item.time));
      continue;
    }
    const cut = nearestNumber(cuts, item.time);
    if (Math.abs(cut - item.time) <= NEAR_SEC) {
      transitionTime.set(item.index, clamp(item.time));
      usedCuts.add(cut);
    }
  }
  const farTransitions = unlinkedTransitions
    .filter((item) => !transitionTime.has(item.index))
    .sort((a, b) => a.time - b.time);
  const freeCuts = cuts.filter((cut) => !usedCuts.has(cut)).sort((a, b) => a - b);
  if (farTransitions.length > 0 && farTransitions.length === freeCuts.length) {
    for (let index = 0; index < farTransitions.length; index++) {
      transitionTime.set(farTransitions[index].index, clamp(freeCuts[index]));
    }
  } else {
    for (const item of farTransitions) {
      transitionTime.set(item.index, cuts.length > 0 ? clamp(nearestNumber(cuts, item.time)) : clamp(item.time));
    }
  }

  const subtitleTime = new Map<number, number>();
  const subtitleItems = draft.filter((item) => item.event.category === 'subtitle');
  for (const item of subtitleItems) {
    if (!item.event.linkedClipId) continue;
    const linked = input.clips.find((clip) => clip.id === item.event.linkedClipId);
    if (!linked) continue;
    const inClip = subtitleStarts.filter((start) => start >= linked.startTime - 0.05 && start < linked.endTime + 0.05);
    const target = inClip.length > 0 ? nearestNumber(inClip, linked.startTime) : linked.startTime;
    subtitleTime.set(item.index, clamp(Math.abs(item.time - target) <= NEAR_SEC ? item.time : target));
  }

  const unlinkedSubtitles = subtitleItems.filter((item) => !subtitleTime.has(item.index));
  const usedSubtitles = new Set<number>();
  for (const item of unlinkedSubtitles) {
    if (subtitleStarts.length === 0) {
      subtitleTime.set(item.index, clamp(item.time));
      continue;
    }
    const start = nearestNumber(subtitleStarts, item.time);
    if (Math.abs(start - item.time) <= NEAR_SEC) {
      subtitleTime.set(item.index, clamp(item.time));
      usedSubtitles.add(start);
    }
  }
  const farSubtitles = unlinkedSubtitles
    .filter((item) => !subtitleTime.has(item.index))
    .sort((a, b) => a.time - b.time);
  const freeSubtitles = subtitleStarts.filter((start) => !usedSubtitles.has(start)).sort((a, b) => a - b);
  if (farSubtitles.length > 0 && farSubtitles.length === freeSubtitles.length) {
    for (let index = 0; index < farSubtitles.length; index++) {
      subtitleTime.set(farSubtitles[index].index, clamp(freeSubtitles[index]));
    }
  } else {
    for (const item of farSubtitles) {
      const partner = draft
        .filter(
          (other) => other.event.category === 'transition' && Math.abs(other.time - item.time) <= FOLLOW_SEC,
        )
        .sort((a, b) => Math.abs(a.time - item.time) - Math.abs(b.time - item.time))[0];
      const partnerTime = partner ? transitionTime.get(partner.index) : undefined;
      if (partnerTime !== undefined && subtitleStarts.length > 0) {
        const near = subtitleStarts.filter((start) => Math.abs(start - partnerTime) <= 0.6);
        const target = near.length > 0 ? nearestNumber(near, partnerTime) : nearestNumber(subtitleStarts, partnerTime);
        subtitleTime.set(item.index, clamp(target));
      } else if (subtitleStarts.length > 0) {
        subtitleTime.set(item.index, clamp(nearestNumber(subtitleStarts, item.time)));
      } else {
        subtitleTime.set(item.index, clamp(item.time));
      }
    }
  }

  return draft.map((item) => {
    let time = clamp(item.time);
    if (item.event.category === 'transition') time = transitionTime.get(item.index) ?? time;
    else if (item.event.category === 'subtitle') time = subtitleTime.get(item.index) ?? time;
    else if (item.event.category === 'hook' && item.time > 0.45) time = clamp(0.08);
    const linkedClipId = clipIdForPlacedTime(input.clips, item.event.category, time) ?? item.event.linkedClipId;
    return linkedClipId ? { ...item.event, time, linkedClipId } : { ...item.event, time };
  });
}
