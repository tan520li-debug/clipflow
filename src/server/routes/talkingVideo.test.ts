import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));

describe('talking video abort wiring', () => {
  it('stops waiting on generateVideos and getVideosOperation', () => {
    const source = readFileSync(join(here, 'talkingVideo.ts'), 'utf8');
    expect(source).toContain('awaitWithAbort');
    expect(source).toContain('getVideosOperation');
    expect(source).toMatch(/abortSignal:\s*signal/);
  });
});
