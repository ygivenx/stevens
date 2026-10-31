import { describe, it, expect } from 'vitest';
import { anchorStartsAt } from './anchor.js';

const MERCY = ['2026-10-29T10:00:00-04:00', '2026-10-29T13:00:00-04:00'];

describe('anchorStartsAt', () => {
  it('snaps past meetings to the same wall time on the next live day', () => {
    const out = anchorStartsAt(MERCY, Date.parse('2026-10-31T08:00:00Z'));
    expect(out).toEqual(['2026-10-31T14:00:00.000Z', '2026-10-31T17:00:00.000Z']);
  });

  it('rolls to tomorrow when today wall time already passed', () => {
    const out = anchorStartsAt(MERCY, Date.parse('2026-10-31T20:00:00Z'));
    expect(out).toEqual(['2026-11-01T14:00:00.000Z', '2026-11-01T17:00:00.000Z']);
  });

  it('stays coherent when the clock is pinned before the fixtures', () => {
    const out = anchorStartsAt(MERCY, Date.parse('2026-10-27T13:00:00Z'));
    expect(out).toEqual(['2026-10-27T14:00:00.000Z', '2026-10-27T17:00:00.000Z']);
  });

  it('falls back inside the window when the next occurrence overshoots it', () => {
    const out = anchorStartsAt(MERCY, Date.parse('2026-10-27T13:45:00Z'));
    expect(out).toEqual(['2026-10-27T14:00:00.000Z', '2026-10-27T17:00:00.000Z']);
  });

  it('keeps every meeting inside the 24h trigger window', () => {
    const nowMs = Date.parse('2026-10-31T08:00:00Z');
    for (const raw of anchorStartsAt(MERCY, nowMs)) {
      const ms = Date.parse(raw);
      expect(ms).toBeGreaterThan(nowMs);
      expect(ms).toBeLessThanOrEqual(nowMs + 24 * 3600 * 1000);
    }
  });

  it('passes empty through and rejects invalid timestamps', () => {
    expect(anchorStartsAt([], Date.now())).toEqual([]);
    expect(() => anchorStartsAt(['not-a-date'], Date.now())).toThrow();
  });
});
