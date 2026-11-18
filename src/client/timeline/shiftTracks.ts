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
