import { describe, it, expect } from 'vitest';
import type { Claim, Source } from '../../../shared/data.js';
import { RULES } from './rules.js';
import { assemble } from './assemble.js';

function source(id: string, vault: Source['vault'], text: string, extra: Partial<Source> = {}): Source {
  return { id, vault, title: id, capturedAt: '2026-10-20T00:00:00Z', kind: 'memo', fixture: 'x', text, ...extra };
}

const TEAM = source('team1', 'enterprise', 'TEAM-ALPHA-BRAVO', { classification: 'team' });
const MEMO = source('memo1', 'enterprise', 'MEMO-CHARLIE-DELTA-LUMEN', { classification: 'partner-only' });
const WALL = source('wall1', 'enterprise', 'WALL-ECHO-FOXTROT', { classification: 'wall' });
const MINE = source('mine1', 'personal', 'MINE-GOLF-HOTEL', { ownerRole: 'Associate' });
const THEIRS = source('theirs1', 'personal', 'THEIRS-INDIA-JULIET', { ownerRole: 'Partner' });
const SOURCES = [TEAM, MEMO, WALL, MINE, THEIRS];

function claim(id: string, sourceId: string, quote: string): Claim {
  return { id, sourceId, entity: 'e', quote };
}

const CLAIMS = [
  claim('c-team', 'team1', 'TEAM-ALPHA-BRAVO'),
  claim('c-memo', 'memo1', 'MEMO-CHARLIE-DELTA'),
  claim('c-mine', 'mine1', 'MINE-GOLF-HOTEL'),
];

describe('assembler', () => {
  it('keeps privy and excluded text out of Associate writer prompts', () => {
    for (const purpose of ['brief', 'answer'] as const) {
      const { prompt, manifest } = assemble(purpose, 'Associate', 'm', 'k', SOURCES, CLAIMS, { verdict: 'hold', routeTo: 'Partner' }, () => true);
      expect(prompt).toContain('TEAM-ALPHA-BRAVO');
      expect(prompt).toContain('MINE-GOLF-HOTEL');
      expect(prompt).not.toContain('MEMO-CHARLIE-DELTA-LUMEN');
      expect(prompt).not.toContain('WALL-ECHO-FOXTROT');
      expect(prompt).not.toContain('THEIRS-INDIA-JULIET');
      expect(prompt).toContain('hold');
      expect(manifest.webSearch).toBe(false);
      expect(manifest.included.map((i) => i.sourceId).sort()).toEqual(['mine1', 'team1']);
      expect(manifest.withheld.map((i) => i.sourceId).sort()).toEqual(['memo1', 'theirs1', 'wall1']);
      for (const entry of [...manifest.included, ...manifest.withheld]) {
        expect(RULES.some((r) => r.id === entry.ruleId)).toBe(true);
      }
    }
  });

  it('includes privy text only for the privy purpose', () => {
    const privy = assemble('privy', 'Associate', 'm', 'k', SOURCES, CLAIMS, undefined, () => true);
    expect(privy.prompt).toContain('MEMO-CHARLIE-DELTA-LUMEN');
    expect(privy.prompt).not.toContain('WALL-ECHO-FOXTROT');
    expect(privy.prompt).not.toContain('THEIRS-INDIA-JULIET');
    expect(privy.manifest.included.map((i) => i.sourceId).sort()).toEqual(['memo1', 'mine1', 'team1']);
  });

  it('shows the Partner everything except the wall and others personal', () => {
    const { prompt } = assemble('answer', 'Partner', 'm', 'k', SOURCES, CLAIMS, undefined, () => true);
    expect(prompt).toContain('MEMO-CHARLIE-DELTA-LUMEN');
    expect(prompt).toContain('THEIRS-INDIA-JULIET');
    expect(prompt).not.toContain('WALL-ECHO-FOXTROT');
    expect(prompt).not.toContain('MINE-GOLF-HOTEL');
  });

  it('withholds team text from a non-member and weighs it under privy', () => {
    const brief = assemble('brief', 'Associate', 'm', 'k', SOURCES, CLAIMS, undefined, (source) => source.vault === 'personal');
    expect(brief.prompt).not.toContain('TEAM-ALPHA-BRAVO');
    expect(brief.prompt).toContain('MINE-GOLF-HOTEL');
    const privy = assemble('privy', 'Associate', 'm', 'k', SOURCES, CLAIMS, undefined, (source) => source.vault === 'personal');
    expect(privy.prompt).toContain('TEAM-ALPHA-BRAVO');
    const withheld = brief.manifest.withheld.find((entry) => entry.sourceId === 'team1');
    expect(withheld?.ruleId).toBe('r-team-associate-outside');
  });

  it('records raw and assembled token estimates', () => {
    const { manifest } = assemble('brief', 'Associate', 'm', 'k', SOURCES, CLAIMS, undefined, () => true);
    expect(manifest.tokens.raw).toBeGreaterThan(0);
    expect(manifest.tokens.assembled).toBeGreaterThanOrEqual(manifest.tokens.raw);
  });
});
