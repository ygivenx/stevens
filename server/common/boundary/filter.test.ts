import { describe, it, expect } from 'vitest';
import type { Claim, LedgerEvent, Source } from '../../../shared/data.js';
import { filterState } from './filter.js';
import { OWNER_ONLY } from './release.js';

function source(id: string, vault: Source['vault'], text: string, extra: Partial<Source> = {}): Source {
  return { id, vault, title: id, capturedAt: '2026-10-20T00:00:00Z', kind: 'memo', fixture: 'x', text, ...extra };
}

const TEAM = source('team1', 'enterprise', 'TEAM-ALPHA-BRAVO', { classification: 'team' });
const MEMO = source('memo1', 'enterprise', 'MEMO-CHARLIE-LUMEN', { classification: 'partner-only', title: 'Conflicts memo: LUMEN' });
const WALL = source('wall1', 'enterprise', 'WALL-ECHO-FOXTROT', { classification: 'wall', title: 'Restricted: FOXTROT' });
const MINE = source('mine1', 'personal', 'MINE-GOLF-HOTEL', { ownerRole: 'Associate' });
const THEIRS = source('theirs1', 'personal', 'THEIRS-INDIA-JULIET', { ownerRole: 'Partner', title: 'JULIET diary' });

function ingested(s: Source): LedgerEvent {
  return { at: '2026-10-27T00:00:00Z', type: 'source.ingested', source: s };
}

function extracted(sourceId: string, claims: Claim[]): LedgerEvent {
  return {
    at: '2026-10-27T00:00:00Z', type: 'claims.extracted', sourceId, claims,
    api: { model: 'm', responseId: 'r', usage: { costUsd: 0 }, stageKey: 'k' },
  };
}

const EVENTS: LedgerEvent[] = [
  ingested(TEAM), ingested(MEMO), ingested(WALL), ingested(MINE), ingested(THEIRS),
  extracted('memo1', [{ id: 'c-memo', sourceId: 'memo1', entity: 'e', quote: 'MEMO-CHARLIE-LUMEN' }]),
  extracted('mine1', [{ id: 'c-mine', sourceId: 'mine1', entity: 'e', quote: 'MINE-GOLF-HOTEL' }]),
  extracted('theirs1', [{ id: 'c-theirs', sourceId: 'theirs1', entity: 'e', quote: 'THEIRS-INDIA-JULIET' }]),
];

function serialized(viewer: 'Associate' | 'Partner', events: LedgerEvent[] = EVENTS): string {
  return JSON.stringify(filterState(events, viewer));
}

describe('state filter', () => {
  it('hides privy, wall, and others-personal content from the Associate', () => {
    const body = serialized('Associate');
    expect(body).toContain('TEAM-ALPHA-BRAVO');
    expect(body).toContain('MINE-GOLF-HOTEL');
    for (const leaked of ['MEMO-CHARLIE-LUMEN', 'WALL-ECHO-FOXTROT', 'THEIRS-INDIA-JULIET', 'LUMEN', 'FOXTROT', 'JULIET', 'memo1', 'wall1', 'theirs1']) {
      expect(body).not.toContain(leaked);
    }
  });

  it('shows the Partner the memo but not the wall or the Associate personal quotes', () => {
    const body = serialized('Partner');
    expect(body).toContain('MEMO-CHARLIE-LUMEN');
    expect(body).toContain('THEIRS-INDIA-JULIET');
    for (const leaked of ['WALL-ECHO-FOXTROT', 'MINE-GOLF-HOTEL', 'FOXTROT', 'wall1', 'mine1']) {
      expect(body).not.toContain(leaked);
    }
  });

  it('reveals a released personal quote to the other viewer', () => {
    const withRelease: LedgerEvent[] = [...EVENTS, { at: '2026-10-27T00:00:01Z', type: 'personal.released', claimId: 'c-theirs', by: 'Partner' }];
    expect(serialized('Associate', withRelease)).toContain('THEIRS-INDIA-JULIET');
  });

  it('withholds non-visible source ids from manifests but keeps rule ids', () => {
    const manifest = {
      callId: 'c', purpose: 'brief' as const, viewerRole: 'Associate' as const, model: 'm', stageKey: 'k',
      included: [{ sourceId: 'team1', access: 'visible' as const, ruleId: 'r-team-associate' }],
      withheld: [
        { sourceId: 'memo1', access: 'privy' as const, ruleId: 'r-partner-only-associate' },
        { sourceId: 'wall1', access: 'excluded' as const, ruleId: 'r-wall-associate' },
      ],
      webSearch: false, tokens: { raw: 1, assembled: 2 },
    };
    const draft: LedgerEvent = {
      at: '2026-10-27T00:00:02Z', type: 'draft.created',
      draft: { id: 'd1', kind: 'brief', viewerRole: 'Associate', sentences: [], droppedSentences: 0, status: 'draft' },
      manifest, api: { model: 'm', responseId: 'r', usage: { costUsd: 0 }, stageKey: 'k' },
    };
    const body = JSON.stringify(filterState([...EVENTS, draft], 'Associate'));
    expect(body).toContain('team1');
    expect(body).toContain('r-partner-only-associate');
    expect(body).not.toContain('memo1');
    expect(body).not.toContain('wall1');
    const privyManifest = { ...manifest, included: [{ sourceId: 'memo1', access: 'privy' as const, ruleId: 'r-partner-only-associate' }] };
    const privy: LedgerEvent = {
      at: '2026-10-27T00:00:03Z', type: 'privy.judged', questionId: 'q',
      verdict: { verdict: 'hold', routeTo: 'Partner' }, manifest: privyManifest, failedClosed: false,
    };
    const hidden = JSON.stringify(filterState([...EVENTS, privy], 'Associate'));
    expect(hidden).not.toContain('memo1');
    expect(hidden).toContain('hold');
    const shown = JSON.stringify(filterState([...EVENTS, privy], 'Partner'));
    expect(shown).toContain('memo1');
  });

  it('renders unreleased personal Facts as owner-only inside drafts', () => {
    const draft: LedgerEvent = {
      at: '2026-10-27T00:00:02Z', type: 'draft.created',
      draft: {
        id: 'd1', kind: 'brief', viewerRole: 'Associate',
        sentences: [
          { text: 'a', citations: [{ kind: 'Fact', claimId: 'c-theirs', vault: 'personal', quote: 'THEIRS-INDIA-JULIET' }] },
          { text: 'b', citations: [{ kind: 'Fact', claimId: 'c-mine', vault: 'personal', quote: 'MINE-GOLF-HOTEL' }] },
        ],
        droppedSentences: 0, status: 'draft',
      },
      manifest: { callId: 'c', purpose: 'brief', viewerRole: 'Associate', model: 'm', stageKey: 'k', included: [], withheld: [], webSearch: false, tokens: { raw: 0, assembled: 0 } },
      api: { model: 'm', responseId: 'r', usage: { costUsd: 0 }, stageKey: 'k' },
    };
    const filtered = filterState([...EVENTS, draft], 'Partner').find((e) => e.type === 'draft.created');
    if (filtered?.type !== 'draft.created') throw new Error('draft missing');
    expect(filtered.draft.sentences[0].citations[0]).toMatchObject({ quote: 'THEIRS-INDIA-JULIET' });
    expect(filtered.draft.sentences[1].citations[0]).toMatchObject({ quote: OWNER_ONLY });
  });

  it('keeps the bridge reason for the owner and drops it for anyone else', () => {
    const manifest = {
      callId: 'c', purpose: 'bridge' as const, viewerRole: 'Associate' as const, model: 'm', stageKey: 'k',
      included: [
        { sourceId: 'mine1', access: 'visible' as const, ruleId: 'r-personal-owner' },
        { sourceId: 'team1', access: 'visible' as const, ruleId: 'r-team-associate' },
      ],
      withheld: [], webSearch: false, tokens: { raw: 1, assembled: 2 },
    };
    const bridge: LedgerEvent = {
      at: '2026-10-27T00:00:04Z', type: 'bridge.judged',
      bridge: { id: 'b-1', personalClaimId: 'c-mine', workClaimId: 'c-team', relation: 'context', reason: 'MINE-GOLF-HOTEL proves the point' },
      candidate: ['c-mine', 'c-team'], manifest,
      api: { model: 'm', responseId: 'r', usage: { costUsd: 0 }, stageKey: 'k' },
    };
    const mine: LedgerEvent[] = [...EVENTS, extracted('team1', [{ id: 'c-team', sourceId: 'team1', entity: 'e', quote: 'TEAM-ALPHA-BRAVO' }]), bridge];
    const ownerBody = JSON.stringify(filterState(mine, 'Associate'));
    expect(ownerBody).toContain('MINE-GOLF-HOTEL proves the point');
    expect(ownerBody).toContain('c-mine');
    const otherBody = JSON.stringify(filterState(mine, 'Partner'));
    expect(otherBody).not.toContain('MINE-GOLF-HOTEL');
    expect(otherBody).not.toContain('proves the point');
    expect(otherBody).not.toContain('"personalClaimId":"c-mine"');
    const other = filterState(mine, 'Partner').find((e) => e.type === 'bridge.judged');
    if (other?.type !== 'bridge.judged') throw new Error('bridge missing');
    expect(other.bridge).toBeNull();
  });

  it('withholds non-visible candidate ids on bridges', () => {
    const manifest = {
      callId: 'c', purpose: 'bridge' as const, viewerRole: 'Associate' as const, model: 'm', stageKey: 'k',
      included: [], withheld: [], webSearch: false, tokens: { raw: 0, assembled: 0 },
    };
    const bridge: LedgerEvent = {
      at: '2026-10-27T00:00:04Z', type: 'bridge.judged', bridge: null,
      candidate: ['c-mine', 'c-team'], manifest,
      api: { model: 'm', responseId: 'r', usage: { costUsd: 0 }, stageKey: 'k' },
    };
    const mine: LedgerEvent[] = [...EVENTS, extracted('team1', [{ id: 'c-team', sourceId: 'team1', entity: 'e', quote: 'TEAM-ALPHA-BRAVO' }]), bridge];
    const other = filterState(mine, 'Partner').find((e) => e.type === 'bridge.judged');
    if (other?.type !== 'bridge.judged') throw new Error('bridge missing');
    expect(other.candidate).toContain('withheld');
    expect(JSON.stringify(other)).not.toContain('c-mine');
  });
});
