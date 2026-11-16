import { describe, expect, it } from 'vitest';
import { resolveListenPort } from './listenPort';

describe('resolveListenPort', () => {
  it('uses 3000 when the variable is empty or invalid', () => {
    expect(resolveListenPort(undefined)).toBe(3000);
    expect(resolveListenPort('')).toBe(3000);
    expect(resolveListenPort('0')).toBe(3000);
    expect(resolveListenPort('abc')).toBe(3000);
  });

  it('reads a numeric port', () => {
    expect(resolveListenPort('4173')).toBe(4173);
  });
});
