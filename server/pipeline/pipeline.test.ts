import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Claim, Source } from '../../shared/data.js';
import { append } from '../ledger/store.js';
import { candidates } from './bridge.js';
import { runBrief } from './draft.js';
import { matchPrivy, runAsk } from './ask.js';
import { VerdictShape, Judgement } from '../meta/client.js';

function source(id: string, vault: Source['vault'], text: string, extra: Partial<Source> = {}): Source {
  return { id, vault, title: id, capturedAt: '2026-10-20T00:00:00Z', kind: 'memo', fixture: 'x', text, ...extra };
}

const TALK = source('talk1', 'personal', 'mid-market churn runs 6 to 8 percent', { ownerRole: 'Associate' });
const DECK = source('deck1', 'enterprise', 'net churn is 1.8 percent', { classification: 'team' });
const MEMO = source('memo1', 'enterprise', 'Helios competes with Lumen', { classification: 'partner-only' });

const C_TALK: Claim = { id: 'talk1-c0', sourceId: 'talk1', entity: 'churn', metric: 'churn', value: '6-8%', quote: 'mid-market churn runs 6 to 8 percent' };
const C_DECK: Claim = { id: 'deck1-c0', sourceId: 'deck1', entity: 'churn', metric: 'churn', value: '1.8%', quote: 'net churn is 1.8 percent' };
const C_MEMO: Claim = { id: 'memo1-c0', sourceId: 'memo1', entity: 'Helios', quote: 'Helios competes with Lumen' };

function seed(): void {
  for (const s of [TALK, DECK, MEMO]) {
    append({ at: '2026-10-27T00:00:00Z', type: 'source.ingested', source: s });
  }
  append({
    at: '2026-10-27T00:00:01Z', type: 'claims.extracted', sourceId: 'talk1', claims: [C_TALK],
    api: { model: 'm', responseId: 'r', usage: { costUsd: 0 }, stageKey: 'k1' },
  });
  append({
    at: '2026-10-27T00:00:01Z', type: 'claims.extracted', sourceId: 'deck1', claims: [C_DECK],
    api: { model: 'm', responseId: 'r', usage: { costUsd: 0 }, stageKey: 'k2' },
  });
  append({
    at: '2026-10-27T00:00:01Z', type: 'claims.extracted', sourceId: 'memo1', claims: [C_MEMO],
    api: { model: 'm', responseId: 'r', usage: { costUsd: 0 }, stageKey: 'k3' },
  });
}

beforeEach(() => {
  const dir = mkdtempSync(join(tmpdir(), 'stevens-pipe-'));
  process.env.STEVENS_DATA_DIR = dir;
  writeFileSync(join(dir, 'meta-fake.json'), JSON.stringify({ mode: 'normal' }));
});

describe('day-5 pipeline', () => {
  it('proposes candidate pairs sharing entity or metric family', () => {
    expect(candidates([C_TALK], [C_DECK])).toHaveLength(1);
    expect(candidates([C_TALK], [C_MEMO])).toHaveLength(0);
    const net = { ...C_DECK, id: 'deck1-c9', metric: 'Net churn' };
    expect(candidates([C_TALK], [net])).toHaveLength(1);
    expect(candidates([C_TALK, C_TALK], [C_DECK])).toHaveLength(1);
  });

  it('rejects malformed verdicts and judgements', () => {
    expect(VerdictShape.safeParse({ verdict: 'maybe', routeTo: 'Intern' }).success).toBe(false);
    expect(VerdictShape.safeParse({ verdict: 'hold', routeTo: 'Partner', note: 'x' }).success).toBe(false);
    expect(VerdictShape.safeParse({ verdict: 'hold', routeTo: 'Partner' }).success).toBe(true);
    expect(Judgement.safeParse({ relation: 'maybe', reason: '' }).success).toBe(false);
  });

  it('matches privy sources by entity', () => {
    const claims = [C_TALK, C_DECK, C_MEMO];
    const sources = new Map([['talk1', TALK], ['deck1', DECK], ['memo1', MEMO]]);
    expect(matchPrivy('Should we take the second Helios meeting?', 'Associate', claims, sources).map((s) => s.id)).toEqual(['memo1']);
    expect(matchPrivy('What is for lunch?', 'Associate', claims, sources)).toHaveLength(0);
  });

  it('briefs with cited sentences', async () => {
    seed();
    const { draft, reused } = await runBrief('Associate');
    expect(reused).toBe(false);
    expect(draft.sentences.length).toBeGreaterThan(0);
    expect(draft.sentences[0].citations[0].kind).toBe('Fact');
    const again = await runBrief('Associate');
    expect(again.reused).toBe(true);
  });

  it('holds with an escalation when privy sources match, proceeds otherwise', async () => {
    seed();
    const held = await runAsk('Associate', 'Should we take the second Helios meeting?');
    expect(held.verdict).toEqual({ verdict: 'hold', routeTo: 'Partner' });
    expect(held.escalated).toBe(true);
    expect(held.draft.verdict).toEqual({ verdict: 'hold', routeTo: 'Partner' });
    const free = await runAsk('Associate', 'What is for lunch?');
    expect(free.verdict).toEqual({ verdict: 'proceed', routeTo: null });
    expect(free.escalated).toBe(false);
  });
});
