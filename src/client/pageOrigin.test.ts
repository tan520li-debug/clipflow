import { describe, expect, it } from 'vitest';
import { canonicalPageUrl } from './pageOrigin';

describe('canonicalPageUrl', () => {
  it('sends localhost to 127.0.0.1 and keeps the rest of the address', () => {
    expect(canonicalPageUrl('http://localhost:3000/edit?x=1#top')).toBe(
      'http://127.0.0.1:3000/edit?x=1#top',
    );
  });

  it('leaves 127.0.0.1 and other hosts alone', () => {
    expect(canonicalPageUrl('http://127.0.0.1:3000/')).toBeNull();
    expect(canonicalPageUrl('http://studio.local:3000/')).toBeNull();
    expect(canonicalPageUrl('not a url')).toBeNull();
  });
});
