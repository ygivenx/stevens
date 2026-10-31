import { describe, it, expect, afterEach } from 'vitest';
import { assertValidNow, nowIso, nowMs } from './clock.js';

const previousNow = process.env.STEVENS_NOW;

afterEach(async () => {
  process.env.STEVENS_NOW = previousNow;
});

describe('clock', () => {
  it('pins now when STEVENS_NOW is set', async () => {
    process.env.STEVENS_NOW = '2026-10-28T14:00:00-04:00';
    expect(nowIso()).toBe('2026-10-28T14:00:00-04:00');
    expect(nowMs()).toBe(Date.parse('2026-10-28T14:00:00-04:00'));
  });

  it('falls back to wall time otherwise', async () => {
    delete process.env.STEVENS_NOW;
    const before = Date.now();
    const seen = Date.parse(nowIso());
    expect(seen).toBeGreaterThanOrEqual(before - 1000);
    expect(seen).toBeLessThanOrEqual(Date.now() + 1000);
  });
});

describe('assertValidNow', () => {
  it('accepts unset and valid timestamps', () => {
    expect(() => assertValidNow(undefined)).not.toThrow();
    expect(() => assertValidNow('2026-10-28T14:00:00-04:00')).not.toThrow();
  });

  it('rejects garbage with the value in the message', () => {
    expect(() => assertValidNow('tomorrow-ish')).toThrow('STEVENS_NOW=tomorrow-ish');
  });
});
