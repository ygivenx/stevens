import { describe, it, expect, afterEach } from 'vitest';
import { assertValidNow } from './clock.js';

describe('assertValidNow', () => {
  const saved = process.env.STEVENS_NOW;
  afterEach(() => {
    if (saved === undefined) delete process.env.STEVENS_NOW;
    else process.env.STEVENS_NOW = saved;
  });

  it('accepts unset and valid timestamps', () => {
    expect(() => assertValidNow(undefined)).not.toThrow();
    expect(() => assertValidNow('2026-10-28T14:00:00-04:00')).not.toThrow();
  });

  it('rejects garbage with the value in the message', () => {
    expect(() => assertValidNow('tomorrow-ish')).toThrow('STEVENS_NOW=tomorrow-ish');
  });
});
