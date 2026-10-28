import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Draft } from '../../shared/data.js';
import { append } from '../common/ledger/store.js';
import { closeDb } from './store.js';
import { buildPersonalState } from './state.js';

function brief(id: string): Draft {
  return { id, kind: 'brief', dealId: 'helios', questionId: 'q-' + id, verdict: 'go', sentences: [], bridges: [] };
}

beforeEach(() => {
  closeDb();
  const dir = mkdtempSync(join(tmpdir(), 'stevens-state-'));
  process.env.STEVENS_DATA_DIR = dir;
  process.env.STEVENS_FIRM_URL = 'http://127.0.0.1:9';
  writeFileSync(join(dir, 'meta-fake.json'), JSON.stringify({ mode: 'normal' }));
  writeFileSync(join(dir, 'meta-calls.json'), JSON.stringify({ count: 0 }));
});

afterEach(() => {
  delete process.env.STEVENS_FIRM_URL;
  closeDb();
});

describe('meeting brief selection', () => {
  it('shows the latest brief for the deal, not the first', async () => {
    append({ at: '2026-10-28T10:00:00-04:00', type: 'draft.created', draft: brief('br-first'), manifest: { purpose: 'brief', promptVersion: 'v2', model: 'm', sources: [], verdict: 'go' }, api: { model: 'm', responseId: 'r', usage: {}, stageKey: 'k1' } });
    append({ at: '2026-10-28T11:00:00-04:00', type: 'draft.created', draft: brief('br-latest'), manifest: { purpose: 'brief', promptVersion: 'v2', model: 'm', sources: [], verdict: 'go' }, api: { model: 'm', responseId: 'r', usage: {}, stageKey: 'k2' } });
    const state = await buildPersonalState();
    expect(state.firm.reachable).toBe(false);
    expect(state.meetings).toHaveLength(1);
    expect(state.meetings[0].briefId).toBe('br-latest');
  });
});
