/** A closed-open interval on the timeline, in seconds. */
export interface TimeSpan {
  start: number;
  duration: number;
}

interface Ranged {
  startTime: number;
  duration: number;
}

interface Pointed {
  time: number;
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function spanEnd(span: TimeSpan): number {
  return span.start + span.duration;
}

export function clipStart(clips: readonly { duration: number }[], index: number): number {
  let start = 0;
  for (let i = 0; i < index; i++) start += clips[i].duration;
  return start;
}

function rangeInside<T extends Ranged>(item: T, span: TimeSpan): boolean {
  const end = item.startTime + item.duration;
  return item.startTime >= span.start && end <= spanEnd(span);
}

/** Drop or pull ranges across a deleted interval. */
export function removeTimeSpan<T extends Ranged>(items: readonly T[], span: TimeSpan): T[] {
  const out: T[] = [];
  for (const item of items) {
    const next = removeOneRange(item, span);
    if (next && next.duration >= 0.05) out.push(next);
  }
  return out;
}

function removeOneRange<T extends Ranged>(item: T, span: TimeSpan): T | null {
  const end = spanEnd(span);
  const itemEnd = item.startTime + item.duration;
  if (itemEnd <= span.start) return item;
  if (item.startTime >= end) return { ...item, startTime: round2(item.startTime - span.duration) };
  if (item.startTime >= span.start && itemEnd <= end) return null;
  if (item.startTime < span.start && itemEnd > end) {
    return { ...item, duration: round2(item.duration - span.duration) };
  }
  if (item.startTime < span.start) {
    return { ...item, duration: round2(span.start - item.startTime) };
  }
  return { ...item, startTime: round2(span.start), duration: round2(itemEnd - end) };
}

/** Push later ranges right. A range sitting on the cut keeps only its left side. */
export function insertTimeSpan<T extends Ranged>(
  items: readonly T[],
  at: number,
  duration: number,
): T[] {
  const out: T[] = [];
  for (const item of items) {
    const next = insertOneRange(item, at, duration);
    if (next && next.duration >= 0.05) out.push(next);
  }
  return out;
}

function insertOneRange<T extends Ranged>(item: T, at: number, duration: number): T | null {
  const itemEnd = item.startTime + item.duration;
  if (itemEnd <= at) return item;
  if (item.startTime >= at) return { ...item, startTime: round2(item.startTime + duration) };
  return { ...item, duration: round2(at - item.startTime) };
}

export function removePointSpan<T extends Pointed>(items: readonly T[], span: TimeSpan): T[] {
  const end = spanEnd(span);
  const out: T[] = [];
  for (const item of items) {
    if (item.time >= span.start && item.time < end) continue;
    if (item.time >= end) out.push({ ...item, time: round2(item.time - span.duration) });
    else out.push(item);
  }
  return out;
}

export function insertPointSpan<T extends Pointed>(
  items: readonly T[],
  at: number,
  duration: number,
): T[] {
  return items.map((item) =>
    item.time >= at ? { ...item, time: round2(item.time + duration) } : item,
  );
}

/** Keep ranges that sit on a clip with that clip, and close the gap around it. */
export function moveTimeSpan<T extends Ranged>(
  items: readonly T[],
  from: TimeSpan,
  toStart: number,
): T[] {
  const delta = toStart - from.start;
  const moved: T[] = [];
  const rest: T[] = [];
  for (const item of items) {
    if (rangeInside(item, from)) {
      moved.push({ ...item, startTime: round2(item.startTime + delta) });
    } else {
      rest.push(item);
    }
  }
  const closed = removeTimeSpan(rest, from);
  return [...moved, ...insertTimeSpan(closed, toStart, from.duration)];
}

export function movePointSpan<T extends Pointed>(
  items: readonly T[],
  from: TimeSpan,
  toStart: number,
): T[] {
  const end = spanEnd(from);
  const delta = toStart - from.start;
  const moved: T[] = [];
  const rest: T[] = [];
  for (const item of items) {
    if (item.time >= from.start && item.time < end) {
      moved.push({ ...item, time: round2(item.time + delta) });
    } else {
      rest.push(item);
    }
  }
  const closed = removePointSpan(rest, from);
  return [...moved, ...insertPointSpan(closed, toStart, from.duration)];
}

/** Copy ranges that sit on the source clip onto the inserted copy, and push later ranges. */
export function duplicateTimeSpan<T extends Ranged & { id: string }>(
  items: readonly T[],
  source: TimeSpan,
  copyId: (id: string) => string,
): T[] {
  const at = spanEnd(source);
  const shifted = insertTimeSpan(items, at, source.duration);
  const copies = items.filter((item) => rangeInside(item, source)).map((item) => ({
    ...item,
    id: copyId(item.id),
    startTime: round2(item.startTime + source.duration),
  }));
  return [...shifted, ...copies];
}

export function duplicatePointSpan<T extends Pointed & { id: string }>(
  items: readonly T[],
  source: TimeSpan,
  copyId: (id: string) => string,
): T[] {
  const at = spanEnd(source);
  const shifted = insertPointSpan(items, at, source.duration);
  const copies = items
    .filter((item) => item.time >= source.start && item.time < at)
    .map((item) => ({
      ...item,
      id: copyId(item.id),
      time: round2(item.time + source.duration),
    }));
  return [...shifted, ...copies];
}

function clipBounds(durations: readonly number[]): { starts: number[]; total: number } {
  const starts: number[] = [];
  let total = 0;
  for (const duration of durations) {
    starts.push(total);
    total += duration;
  }
  return { starts, total };
}

/**
 * Keep each range on the same part of a clip after that clip's length changes.
 * A piece that fell in the trimmed tail is dropped. The first surviving piece keeps the id.
 */
export function remapRangesToDurations<T extends Ranged & { id: string }>(
  items: readonly T[],
  oldDurations: readonly number[],
  newDurations: readonly number[],
): T[] {
  if (oldDurations.length !== newDurations.length) return [...items];
  const oldBounds = clipBounds(oldDurations);
  const newBounds = clipBounds(newDurations);
  const out: T[] = [];
  for (const item of items) {
    const itemEnd = item.startTime + item.duration;
    const pieces: { start: number; end: number }[] = [];
    for (let i = 0; i < oldDurations.length; i++) {
      const oldStart = oldBounds.starts[i];
      const oldEnd = oldStart + oldDurations[i];
      const from = Math.max(item.startTime, oldStart);
      const to = Math.min(itemEnd, oldEnd);
      if (to - from < 0.0001) continue;
      const localStart = from - oldStart;
      const newDur = newDurations[i];
      if (localStart >= newDur) continue;
      const keptLocalEnd = Math.min(to - oldStart, newDur);
      pieces.push({
        start: newBounds.starts[i] + localStart,
        end: newBounds.starts[i] + keptLocalEnd,
      });
    }
    const merged: { start: number; end: number }[] = [];
    for (const piece of pieces) {
      const last = merged[merged.length - 1];
      if (last && Math.abs(last.end - piece.start) < 0.02) last.end = piece.end;
      else merged.push({ ...piece });
    }
    merged.forEach((piece, index) => {
      const duration = round2(piece.end - piece.start);
      if (duration < 0.05) return;
      out.push({
        ...item,
        id: index === 0 ? item.id : `${item.id}-keep-${index}`,
        startTime: round2(piece.start),
        duration,
      });
    });
  }
  return out;
}

/** Move a point with its clip. A point in the trimmed tail is dropped. */
export function remapPointsToDurations<T extends Pointed>(
  items: readonly T[],
  oldDurations: readonly number[],
  newDurations: readonly number[],
): T[] {
  if (oldDurations.length !== newDurations.length) return [...items];
  const oldBounds = clipBounds(oldDurations);
  const newBounds = clipBounds(newDurations);
  const out: T[] = [];
  for (const item of items) {
    for (let i = 0; i < oldDurations.length; i++) {
      const oldStart = oldBounds.starts[i];
      const oldEnd = oldStart + oldDurations[i];
      const isLast = i === oldDurations.length - 1;
      if (item.time < oldEnd || isLast) {
        const local = item.time - oldStart;
        if (local > newDurations[i] + 0.0001) break;
        out.push({ ...item, time: round2(newBounds.starts[i] + local) });
        break;
      }
    }
  }
  return out;
}

/** After a clip is cut, sounds at or after the cut that still name the original clip belong to the new piece. */
export function assignPointsToSplitClip<T extends Pointed & { linkedClipId?: string }>(
  items: readonly T[],
  splitAt: number,
  fromClipId: string,
  toClipId: string,
): T[] {
  return items.map((item) =>
    item.linkedClipId === fromClipId && item.time >= splitAt - 0.0001
      ? { ...item, linkedClipId: toClipId }
      : item,
  );
}

/** Stretch cues and effects across a rebuilt timeline. Linked cues follow their subtitle. */
export function scaleRanges<T extends Ranged>(items: readonly T[], factor: number): T[] {
  if (!Number.isFinite(factor) || factor <= 0) return [...items];
  return items
    .map((item) => ({
      ...item,
      startTime: round2(item.startTime * factor),
      duration: round2(item.duration * factor),
    }))
    .filter((item) => item.duration >= 0.05);
}

export function scalePoints<T extends Pointed>(items: readonly T[], factor: number): T[] {
  if (!Number.isFinite(factor) || factor <= 0) return [...items];
  return items.map((item) => ({ ...item, time: round2(item.time * factor) }));
}

export function followSubtitleTimes<T extends Ranged & { subtitleId?: string }>(
  items: readonly T[],
  subtitles: readonly { id: string; startTime: number; duration: number }[],
  factor: number,
): T[] {
  const byId = new Map(subtitles.map((subtitle) => [subtitle.id, subtitle]));
  return items.flatMap((item) => {
    const subtitle = item.subtitleId ? byId.get(item.subtitleId) : undefined;
    if (subtitle) {
      return [{ ...item, startTime: round2(subtitle.startTime), duration: round2(subtitle.duration) }];
    }
    return scaleRanges([item], factor);
  });
}

const MIN_SPLIT_RANGE_SEC = 0.05;

/** Cut a caption that crosses a point. The left piece keeps its id. A sliver on either side stays whole. */
export function splitRangesAt<T extends Ranged & { id: string }>(
  items: readonly T[],
  at: number,
  copyId: (id: string) => string,
): T[] {
  const out: T[] = [];
  for (const item of items) {
    const end = item.startTime + item.duration;
    const left = round2(at - item.startTime);
    const right = round2(end - at);
    if (item.startTime >= at - 0.0001 || end <= at + 0.0001 || left < MIN_SPLIT_RANGE_SEC || right < MIN_SPLIT_RANGE_SEC) {
      out.push(item);
      continue;
    }
    out.push({ ...item, duration: left });
    out.push({ ...item, id: copyId(item.id), startTime: round2(at), duration: right });
  }
  return out;
}

/** Shorten a cue when its caption was cut, without copying the spoken audio onto the new piece. */
export function matchCuesToChangedRanges<
  T extends Ranged & { subtitleId?: string },
>(
  cues: readonly T[],
  before: readonly { id: string; startTime: number; duration: number }[],
  after: readonly { id: string; startTime: number; duration: number }[],
): T[] {
  const beforeById = new Map(before.map((item) => [item.id, item]));
  let next = [...cues];
  for (const item of after) {
    const previous = beforeById.get(item.id);
    if (!previous || (previous.startTime === item.startTime && previous.duration === item.duration)) continue;
    next = cuesAfterSubtitleEdit(next, item.id, { startTime: item.startTime, duration: item.duration });
  }
  return next;
}

/** Drop a cue when its subtitle is deleted, or move it when that subtitle is retimed. */
export function cuesAfterSubtitleEdit<T extends Ranged & { subtitleId?: string; text?: string }>(
  cues: readonly T[],
  subtitleId: string,
  next: { startTime: number; duration: number; text?: string } | null,
): T[] {
  if (next === null) return cues.filter((cue) => cue.subtitleId !== subtitleId);
  return cues.map((cue) =>
    cue.subtitleId === subtitleId
      ? {
          ...cue,
          startTime: round2(next.startTime),
          duration: round2(next.duration),
          ...(next.text !== undefined ? { text: next.text } : {}),
        }
        : cue,
  );
}

const SUBTITLE_SFX_WINDOW_SEC = 0.2;

/** A subtitle sound sits on the subtitle it is closer to, within a fifth of a second. */
function subtitleSoundOwns(
  time: number,
  startTime: number,
  others: readonly { startTime: number }[],
): boolean {
  const distance = Math.abs(time - startTime);
  if (distance > SUBTITLE_SFX_WINDOW_SEC) return false;
  return others.every((other) => Math.abs(time - other.startTime) >= distance);
}

/** Drop a subtitle sound when its caption is deleted, or move it when that caption moves. */
export function sfxAfterSubtitleEdit<T extends { time: number; category: string }>(
  events: readonly T[],
  subtitles: readonly { id: string; startTime: number }[],
  subtitleId: string,
  next: { startTime: number } | null,
): T[] {
  const current = subtitles.find((subtitle) => subtitle.id === subtitleId);
  if (!current) return [...events];
  const others = subtitles.filter((subtitle) => subtitle.id !== subtitleId);
  const owns = (time: number) => subtitleSoundOwns(time, current.startTime, others);
  if (next === null) return events.filter((event) => event.category !== 'subtitle' || !owns(event.time));
  return events.map((event) =>
    event.category === 'subtitle' && owns(event.time) ? { ...event, time: round2(next.startTime) } : event,
  );
}
