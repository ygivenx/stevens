import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { append, readAll, findCompleted, completedKeys, stageKey } from './store.js';

beforeEach(() => {
  process.env.STEVENS_DATA_DIR = mkdtempSync(join(tmpdir(), 'stevens-ledger-'));
});

describe('ledger store', () => {
  it('round-trips appended events in order', () => {
    append({ at: '2026-10-28T00:00:00Z', type: 'role.switched', role: 'Associate' });
    append({ at: '2026-10-28T00:00:01Z', type: 'role.switched', role: 'Partner' });
    const events = readAll();
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ role: 'Associate' });
    expect(events[1]).toMatchObject({ role: 'Partner' });
  });

  it('finds a completed stage by its key', () => {
    const key = stageKey('ingest', ['talk-oct20'], 'v1', 'muse-voice-transcribe-1.0');
    append({
      at: '2026-10-28T00:00:00Z', type: 'source.ingested',
      source: { id: 'talk-oct20', vault: 'personal', title: 't', capturedAt: '2026-10-20T14:00:00Z', kind: 'talk-audio', fixture: 'personal/talk.wav', ownerRole: 'Associate' },
      api: { model: 'muse-voice-transcribe-1.0', responseId: 's', usage: { costUsd: 0 }, stageKey: key },
    });
    const found = findCompleted(key);
    expect(found).not.toBeNull();
    expect(found?.type).toBe('source.ingested');
    expect(findCompleted('deadbeefdeadbeef')).toBeNull();
    expect(completedKeys().has(key)).toBe(true);
  });

  it('makes deterministic, distinct stage keys', () => {
    const a = stageKey('ingest', ['x'], 'v1', 'm');
    expect(stageKey('ingest', ['x'], 'v1', 'm')).toBe(a);
    expect(stageKey('ingest', ['y'], 'v1', 'm')).not.toBe(a);
    expect(stageKey('ingest', ['x'], 'v2', 'm')).not.toBe(a);
    expect(a).toHaveLength(16);
  });

  it('reads an empty ledger as no events', () => {
    expect(readAll()).toEqual([]);
  });
});
