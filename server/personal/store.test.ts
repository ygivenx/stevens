import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { closeDb, getAdapterState, setAdapterState } from './store.js';

beforeEach(() => {
  closeDb();
  process.env.STEVENS_DATA_DIR = mkdtempSync(join(tmpdir(), 'stevens-store-'));
});

afterEach(() => {
  closeDb();
});

describe('adapter state', () => {
  it('records an error and clears it on the next success', () => {
    setAdapterState('readwise', { lastError: 'export failed with status 401' });
    expect(getAdapterState('readwise')?.lastError).toBe('export failed with status 401');
    setAdapterState('readwise', { lastError: null });
    expect(getAdapterState('readwise')?.lastError).toBeNull();
  });

  it('leaves untouched fields alone', () => {
    setAdapterState('readwise', { cursor: 'c1', lastSyncAt: '2026-10-28T00:00:00Z' });
    setAdapterState('readwise', { lastError: 'boom' });
    const state = getAdapterState('readwise');
    expect(state?.cursor).toBe('c1');
    expect(state?.lastSyncAt).toBe('2026-10-28T00:00:00Z');
    expect(state?.lastError).toBe('boom');
  });
});
