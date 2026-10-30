import { describe, it, expect } from 'vitest';
import { resolveSentences, quoteIn } from './resolve.js';
import type { Claim, Source } from '../../../shared/data.js';

const source: Source = {
  id: 's1', vault: 'personal', title: 't', capturedAt: '2026-10-20T14:00:00Z',
  kind: 'article', fixture: 'personal/a.txt', text: 'Mid-market churn runs six to eight percent annually.',
};
const claim: Claim = { id: 'c1', sourceId: 's1', entity: 'churn', quote: 'churn runs six to eight percent' };
const claims = new Map([['c1', claim]]);
const sources = new Map([['s1', source]]);

describe('resolver', () => {
  it('keeps a sentence whose Fact chain resolves verbatim', async () => {
    const { kept, dropped } = resolveSentences(
      [{ text: 'Churn is high.', citations: [{ kind: 'Fact', claimId: 'c1', vault: 'personal', quote: 'churn runs six to eight percent' }] }],
      claims, sources,
    );
    expect(kept).toHaveLength(1);
    expect(dropped).toBe(0);
  });

  it('drops a sentence with no citations', async () => {
    const { kept, dropped } = resolveSentences([{ text: 'Churn is high.', citations: [] }], claims, sources);
    expect(kept).toHaveLength(0);
    expect(dropped).toBe(1);
  });

  it('drops a Fact whose quote is not in the claim', async () => {
    const { dropped } = resolveSentences(
      [{ text: 'Churn is low.', citations: [{ kind: 'Fact', claimId: 'c1', vault: 'personal', quote: 'churn is one percent' }] }],
      claims, sources,
    );
    expect(dropped).toBe(1);
  });

  it('drops a Fact whose claim quote is not in the source', async () => {
    const bad = new Map([['c1', { ...claim, quote: 'invented words here' }]]);
    const { dropped } = resolveSentences(
      [{ text: 'Churn is high.', citations: [{ kind: 'Fact', claimId: 'c1', vault: 'personal', quote: 'invented words here' }] }],
      bad, sources,
    );
    expect(dropped).toBe(1);
  });

  it('drops a Fact pointing at a missing claim or a wrong vault', async () => {
    const missing = resolveSentences(
      [{ text: 'x', citations: [{ kind: 'Fact', claimId: 'nope', vault: 'personal', quote: 'churn' }] }],
      claims, sources,
    );
    expect(missing.dropped).toBe(1);
    const vault = resolveSentences(
      [{ text: 'x', citations: [{ kind: 'Fact', claimId: 'c1', vault: 'enterprise', quote: 'churn runs six to eight percent' }] }],
      claims, sources,
    );
    expect(vault.dropped).toBe(1);
  });

  it('keeps Inferences only when every source claim exists', async () => {
    const good = resolveSentences(
      [{ text: 'So ask.', citations: [{ kind: 'Inference', fromClaimIds: ['c1'] }] }],
      claims, sources,
    );
    expect(good.dropped).toBe(0);
    const bad = resolveSentences(
      [{ text: 'So ask.', citations: [{ kind: 'Inference', fromClaimIds: ['c1', 'nope'] }] }],
      claims, sources,
    );
    expect(bad.dropped).toBe(1);
  });

  it('normalizes whitespace before matching', async () => {
    expect(quoteIn('churn  runs\nsix', 'churn runs six to eight')).toBe(true);
    expect(quoteIn('', 'churn runs six')).toBe(false);
  });
});
