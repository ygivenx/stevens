import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { LedgerEvent, Source } from '../shared/data.js';

function source(id: string, vault: Source['vault'], text: string, extra: Partial<Source> = {}): Source {
  return { id, vault, title: id, capturedAt: '2026-10-20T00:00:00Z', kind: 'memo', fixture: 'x', text, ...extra };
}

const TEAM = source('team1', 'enterprise', 'TEAM-ALPHA-BRAVO', { classification: 'team' });
const MEMO = source('memo1', 'enterprise', 'MEMO-CHARLIE-LUMEN', { classification: 'partner-only', title: 'Conflicts memo: LUMEN' });
const WALL = source('wall1', 'enterprise', 'WALL-ECHO-FOXTROT', { classification: 'wall', title: 'Restricted: FOXTROT' });
const MINE = source('mine1', 'personal', 'MINE-GOLF-HOTEL', { ownerRole: 'Associate' });

function seed(): LedgerEvent[] {
  return [
    { at: '2026-10-27T00:00:00Z', type: 'source.ingested', source: TEAM },
    { at: '2026-10-27T00:00:00Z', type: 'source.ingested', source: MEMO },
    { at: '2026-10-27T00:00:00Z', type: 'source.ingested', source: WALL },
    { at: '2026-10-27T00:00:00Z', type: 'source.ingested', source: MINE },
    {
      at: '2026-10-27T00:00:00Z', type: 'claims.extracted', sourceId: 'mine1',
      claims: [{ id: 'c-mine', sourceId: 'mine1', entity: 'e', quote: 'MINE-GOLF-HOTEL' }],
      api: { model: 'm', responseId: 'r', usage: { costUsd: 0 }, stageKey: 'k' },
    },
    {
      at: '2026-10-27T00:00:00Z', type: 'claims.extracted', sourceId: 'team1',
      claims: [{ id: 'c-team', sourceId: 'team1', entity: 'e', quote: 'TEAM-ALPHA-BRAVO' }],
      api: { model: 'm', responseId: 'r', usage: { costUsd: 0 }, stageKey: 'k2' },
    },
    {
      at: '2026-10-27T00:00:01Z', type: 'bridge.judged',
      bridge: { id: 'b-1', personalClaimId: 'c-mine', workClaimId: 'c-team', relation: 'context', reason: 'MINE-GOLF-HOTEL shows the gap' },
      candidate: ['c-mine', 'c-team'],
      manifest: {
        callId: 'c', purpose: 'bridge', viewerRole: 'Associate', model: 'm', stageKey: 'k3',
        included: [
          { sourceId: 'mine1', access: 'visible', ruleId: 'r-personal-owner' },
          { sourceId: 'team1', access: 'visible', ruleId: 'r-team-associate' },
        ],
        withheld: [], webSearch: false, tokens: { raw: 1, assembled: 2 },
      },
      api: { model: 'm', responseId: 'r', usage: { costUsd: 0 }, stageKey: 'k3' },
    },
  ];
}

let app: typeof import('./index.js')['app'];

beforeEach(async () => {
  process.env.STEVENS_DATA_DIR = mkdtempSync(join(tmpdir(), 'stevens-routes-'));
  const mod = await import('./index.js');
  app = mod.app;
  const { append } = await import('./ledger/store.js');
  for (const event of seed()) append(event);
});

async function readFirstChunk(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) throw new Error('missing stream body');
  const { value } = await reader.read();
  await reader.cancel();
  return new TextDecoder().decode(value);
}

describe('route boundary', () => {
  it('serves associate state without privy, wall, or bridge reason text', async () => {
    const res = await app.request('/api/state', { headers: { 'X-Viewer-Role': 'Associate' } });
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('TEAM-ALPHA-BRAVO');
    for (const leaked of ['MEMO-CHARLIE-LUMEN', 'WALL-ECHO-FOXTROT', 'LUMEN', 'FOXTROT', 'memo1', 'wall1']) {
      expect(body).not.toContain(leaked);
    }
    expect(body).toContain('shows the gap');
  });

  it('serves partner state without personal text or bridge reason', async () => {
    const res = await app.request('/api/state', { headers: { 'X-Viewer-Role': 'Partner' } });
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('MEMO-CHARLIE-LUMEN');
    for (const leaked of ['MINE-GOLF-HOTEL', 'shows the gap', 'mine1']) {
      expect(body).not.toContain(leaked);
    }
  });

  it('streams only empty changed signals with no ledger text', async () => {
    for (const role of ['Associate', 'Partner']) {
      const res = await app.request('/api/events', { headers: { 'X-Viewer-Role': role } });
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/event-stream');
      const chunk = await readFirstChunk(res);
      expect(chunk).toContain('event: changed');
      expect(chunk).toContain('data: {}');
      for (const leaked of ['MEMO-CHARLIE-LUMEN', 'WALL-ECHO-FOXTROT', 'MINE-GOLF-HOTEL', 'shows the gap', 'bridge.judged', 'privy']) {
        expect(chunk).not.toContain(leaked);
      }
    }
  });
});
