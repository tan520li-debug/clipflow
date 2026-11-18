export interface SfxClipBound {
  startTime: number;
  endTime: number;
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

export function placeSuggestedSfxEvents<T extends { time: number; category: string }>(
  events: readonly T[],
  input: {
    totalDuration: number;
    clips: readonly SfxClipBound[];
    subtitles: readonly { startTime: number }[];
  },
): T[] {
  return events.map((event) => ({
    ...event,
    time: placeSuggestedSfxTime({
      time: event.time,
      category: event.category,
      totalDuration: input.totalDuration,
      clips: input.clips,
      subtitles: input.subtitles,
    }),
  }));
}
