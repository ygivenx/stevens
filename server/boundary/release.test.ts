import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Claim, LedgerEvent, Source } from '../../shared/data.js';
import { OWNER_ONLY, personalQuoteVisible, releaseClaim } from './release.js';

const SOURCE: Source = {
  id: 'mine1', vault: 'personal', title: 't', capturedAt: '2026-10-20T00:00:00Z',
  kind: 'article', fixture: 'x', text: 'MINE-GOLF-HOTEL', ownerRole: 'Associate',
};
const CLAIM: Claim = { id: 'c1', sourceId: 'mine1', entity: 'e', quote: 'MINE-GOLF-HOTEL' };

beforeEach(() => {
  process.env.STEVENS_DATA_DIR = mkdtempSync(join(tmpdir(), 'stevens-release-'));
});

function maps() {
  return { claims: new Map([['c1', CLAIM]]), sources: new Map([['mine1', SOURCE]]) };
}

describe('release gate', () => {
  it('lets the owner release one quote and logs the event', () => {
    const { claims, sources } = maps();
    const events: LedgerEvent[] = [];
    expect(personalQuoteVisible(CLAIM, SOURCE, 'Partner', events)).toBe(false);
    releaseClaim('c1', 'Associate', claims, sources, events);
    events.push({ at: '2026-10-27T00:00:00Z', type: 'personal.released', claimId: 'c1', by: 'Associate' });
    expect(personalQuoteVisible(CLAIM, SOURCE, 'Partner', events)).toBe(true);
    expect(personalQuoteVisible(CLAIM, SOURCE, 'Associate', events)).toBe(true);
    expect(OWNER_ONLY).toBe('Personal source (owner only)');
  });

  it('rejects a release by anyone but the owner', () => {
    const { claims, sources } = maps();
    expect(() => releaseClaim('c1', 'Partner', claims, sources, [])).toThrow('only the owner');
  });

  it('rejects releasing unknown or enterprise claims', () => {
    const { claims, sources } = maps();
    expect(() => releaseClaim('nope', 'Associate', claims, sources, [])).toThrow('unknown claim');
    const team: Source = { ...SOURCE, id: 'team1', vault: 'enterprise', classification: 'team', ownerRole: undefined };
    const teamClaim: Claim = { ...CLAIM, id: 'c2', sourceId: 'team1' };
    expect(() => releaseClaim('c2', 'Associate', new Map([['c2', teamClaim]]), new Map([['team1', team]]), [])).toThrow('only personal');
  });
});
