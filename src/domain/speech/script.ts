/**
 * Splits long voiceover/digital-human scripts cleanly along sentence and clause boundaries
 * so long speeches can be synthesized without truncation and concatenated smoothly.
 */
export function splitSpeechScriptIntoSegments(
  rawText: string,
  maxCharsPerSegment = 160
): string[] {
  const normalized = (rawText || '').replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim();
  if (!normalized) return [];

  const safeLimit = Math.max(40, Math.min(260, Math.round(maxCharsPerSegment)));

  // Split by sentence terminators keeping punctuation attached
  const sentenceUnits = normalized
    .split(/(?<=[。！？!?；;\n])/)
    .map((s) => s.trim())
    .filter(Boolean);

  const expandOverlongUnit = (unit: string): string[] => {
    if (unit.length <= safeLimit) return [unit];

    // Secondary split on comma/clause delimiters
    const clauses = unit
      .split(/(?<=[，,、：:])/)
      .map((c) => c.trim())
      .filter(Boolean);

    const out: string[] = [];
    let buf = '';
    for (const clause of clauses) {
      if (clause.length > safeLimit) {
        if (buf) {
          out.push(buf);
          buf = '';
        }
        // Hard wrap extremely long punctuation-free strings respecting whitespace for Latin text
        let cursor = 0;
        while (cursor < clause.length) {
          let end = Math.min(clause.length, cursor + safeLimit);
          if (end < clause.length) {
            const lastSpace = clause.lastIndexOf(' ', end);
            if (lastSpace > cursor + Math.floor(safeLimit * 0.5)) {
              end = lastSpace + 1;
            }
          }
          const slice = clause.slice(cursor, end).trim();
          if (slice) out.push(slice);
          cursor = end;
        }
      } else if (!buf) {
        buf = clause;
      } else if (buf.length + clause.length <= safeLimit) {
        buf = `${buf}${clause}`;
      } else {
        out.push(buf);
        buf = clause;
      }
    }
    if (buf) out.push(buf);
    return out;
  };

  const expandedUnits = sentenceUnits.flatMap(expandOverlongUnit);
  const segments: string[] = [];
  let current = '';

  for (const unit of expandedUnits) {
    if (!current) {
      current = unit;
    } else if (current.length + 1 + unit.length <= safeLimit) {
      const needsSpace = /[a-zA-Z0-9]$/.test(current) && /^[a-zA-Z0-9]/.test(unit);
      current = `${current}${needsSpace ? ' ' : ''}${unit}`;
    } else {
      segments.push(current);
      current = unit;
    }
  }
  if (current) segments.push(current);

  return segments;
}

/**
 * Estimates spoken TTS duration in seconds from Chinese characters, Latin/digit words,
 * and punctuation pauses before audio synthesis is invoked.
 */
export function estimateSpeechDurationSec(rawText: string, speakingRate = 1.0): number {
  const clean = (rawText || '').trim();
  if (!clean) return 0;

  const cjkCount = (clean.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g) || []).length;
  const nonCjkText = clean.replace(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g, ' ');
  const latinWords = (nonCjkText.match(/[a-zA-Z0-9]+(?:['’-][a-zA-Z0-9]+)*/g) || []).length;
  const majorPauses = (clean.match(/[。！？!?；;\n]/g) || []).length;
  const minorPauses = (clean.match(/[，,、：:]/g) || []).length;

  const rate = speakingRate > 0 ? speakingRate : 1.0;
  const speechTime = cjkCount / 3.9 + latinWords / 2.45;
  const pauseTime = Math.max(0, majorPauses - 0.5) * 0.32 + minorPauses * 0.16;
  const segments = splitSpeechScriptIntoSegments(clean, 160);
  const stitchPause = Math.max(0, segments.length - 1) * 0.12;

  return Number(Math.max(1.2, (speechTime + pauseTime + stitchPause) / rate).toFixed(1));
}
