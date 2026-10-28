import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readAll } from '../common/ledger/store.js';
import { quoteIn } from '../common/resolver/resolve.js';
import { seedPeople } from './agent-auth.js';
import { getFirmDb, closeFirmDb } from './store.js';
import { runConnectorSync, testReader } from './sync.js';
import { buildComps, loadFormD } from './connectors/formd.js';
import { runPrivy } from './privy.js';
import { draftDecision, draftEscalation } from './decision.js';
import { inboundRelease } from './release.js';

const TOKEN = 'test-agent-token-firmflow';

let dir: string;
let app: typeof import('./index.js')['app'];

function calls(): number {
  return (JSON.parse(readFileSync(join(dir, 'meta-calls.json'), 'utf8')) as { count: number }).count;
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'stevens-firmflow-'));
  dir = join(dir, 'firm');
  mkdirSync(dir, { recursive: true });
  process.env.STEVENS_DATA_DIR = dir;
  process.env.STEVENS_AGENT_TOKEN = TOKEN;
  writeFileSync(join(dir, 'meta-fake.json'), JSON.stringify({ mode: 'normal' }));
  writeFileSync(join(dir, 'meta-calls.json'), JSON.stringify({ count: 0 }));
  seedPeople(getFirmDb(), TOKEN);
  await runConnectorSync({ reader: testReader() });
  const mod = await import('./index.js');
  app = mod.app;
});

afterAll(() => {
  closeFirmDb();
});

describe('form d comps', () => {
  it('recomputes the comps numbers from the fixture JSON', () => {
    const fixture = loadFormD();
    const comps = buildComps(fixture.filings);
    expect(comps).toHaveLength(2);
    const db = getFirmDb();
    for (const entry of comps) {
      const row = db.prepare(`select body from documents where id = ?`).get('formd-comps-' + entry.quarter) as unknown as { body: string };
      expect(row.body).toBe(entry.sentence);
    }
    expect(comps[0].issuers).toBe(449);
    expect(comps[1].issuers).toBe(404);
  });

  it('resolves every comps claim verbatim', () => {
    const claims = readAll().flatMap((e) => (e.type === 'claims.extracted' && !e.itemId && e.sourceId.startsWith('formd-') ? e.claims : []));
    expect(claims.length).toBeGreaterThan(0);
    for (const claim of claims) {
      const row = getFirmDb().prepare(`select body from documents where id = ?`).get(claim.sourceId) as unknown as { body: string };
      expect(quoteIn(claim.quote, row.body)).toBe(true);
    }
  });
});

describe('privy channel', () => {
  it('returns a string-free verdict that holds with the conflicts memo present', async () => {
    const person = { id: 'p-alex', name: 'Alex Rivera', role: 'Associate' as const };
    const result = await runPrivy(person, 'helios', 'Should we take the second meeting?', { questionId: 'pq-test-' + 'x' * 4 });
    expect(result.failedClosed).toBe(false);
    expect(Object.keys(result.verdict).sort()).toEqual(['routeTo', 'verdict']);
    for (const value of Object.values(result.verdict)) {
      expect(typeof value === 'string' ? value.length < 20 : true).toBe(true);
    }
  });

  it('fails closed to hold plus Partner on repeated validation failure', async () => {
    const person = { id: 'p-alex', name: 'Alex Rivera', role: 'Associate' as const };
    const unique = 'A brand-new question that always breaks ' + Date.now() + Math.random() + '?';
    const result = await runPrivy(person, 'helios', unique, { questionId: 'pq-unique-' + String(Date.now()) }, {
      privyFn: async () => {
        throw new Error('nope');
      },
    });
    expect(result).toMatchObject({ verdict: { verdict: 'hold', routeTo: 'Partner' }, failedClosed: true });
  });

  it('never puts privy text into a writer prompt', async () => {
    const events = readAll().filter((e) => e.type === 'privy.judged');
    expect(events.length).toBeGreaterThan(0);
    const bodies = readAll()
      .filter((e) => e.type === 'claims.extracted' && !e.itemId)
      .flatMap((e) => (e.type === 'claims.extracted' && !e.itemId ? e.claims : []).map((c) => c.quote))
      .join('\n');
    expect(bodies).not.toContain('Lumen');
  });
});

describe('release gates', () => {
  const provenance = { title: 'Oct 20 talk', origin: 'glasses' as const, capturedAt: '2026-10-20T14:00:00Z' };

  it('rejects payloads with extra fields', () => {
    const alex = { id: 'p-alex', name: 'Alex Rivera', role: 'Associate' as const };
    expect(() => inboundRelease(alex, { dealId: 'helios', claimId: 'c1', quote: 'q', provenance, injected: true })).toThrow();
  });

  it('rejects quotes over 500 characters', () => {
    const alex = { id: 'p-alex', name: 'Alex Rivera', role: 'Associate' as const };
    expect(() => inboundRelease(alex, { dealId: 'helios', claimId: 'c1', quote: 'x'.repeat(501), provenance })).toThrow();
  });

  it('rejects senders outside the deal team', () => {
    const jordan = { id: 'p-morgan', name: 'Morgan Hale', role: 'Partner' as const };
    expect(() => inboundRelease({ ...jordan, id: 'p-jordan' }, { dealId: 'helios', claimId: 'c1', quote: 'q', provenance })).toThrow('sender is not on the deal team');
  });

  it('stores exactly the shared quote for a teammate', () => {
    const alex = { id: 'p-alex', name: 'Alex Rivera', role: 'Associate' as const };
    const { documentId } = inboundRelease(alex, { dealId: 'helios', claimId: 'c-talk-1', quote: 'mid-market churn runs 6 to 8%', provenance });
    const row = getFirmDb().prepare(`select body, kind from documents where id = ?`).get(documentId) as unknown as { body: string; kind: string };
    expect(row.body).toBe('mid-market churn runs 6 to 8%');
    expect(row.kind).toBe('released-quote');
    const acl = getFirmDb().prepare(`select principal from document_acl where document_id = ?`).all(documentId) as unknown as { principal: string }[];
    expect(acl.map((entry) => entry.principal)).toEqual(['deal-team:helios']);
  });
});

describe('escalation and decision', () => {
  it('refuses to escalate a proceed verdict', async () => {
    await expect(draftEscalation('p-alex', 'helios', 'pq-never-judged', undefined)).rejects.toThrow('nothing to escalate');
  });

  it('drafts a decision and approves it as Partner only', async () => {
    const person = { id: 'p-alex', name: 'Alex Rivera', role: 'Associate' as const };
    const privy = await runPrivy(person, 'helios', 'Should we take the second meeting?', { questionId: 'pq-test-' + 'x' * 4 });
    const { escalationId, to } = await draftEscalation('p-alex', 'helios', privy.questionId, 'Should we take the second meeting?');
    expect(to).toBe('Partner');
    expect(escalationId.startsWith('es-')).toBe(true);
    const drafts = readAll().filter((e) => e.type === 'draft.created' && e.draft.kind === 'decision');
    expect(drafts.length).toBeGreaterThan(0);
    const draftId = drafts[0].type === 'draft.created' ? drafts[0].draft.id : '';
    const denied = await app.request('/api/approve/' + draftId, { method: 'POST', headers: { 'X-Viewer-Id': 'p-alex' } });
    expect(denied.status).toBe(403);
    const approved = await app.request('/api/approve/' + draftId, { method: 'POST', headers: { 'X-Viewer-Id': 'p-morgan' } });
    expect(approved.status).toBe(200);
  });

  it('replays the flow with zero new calls', async () => {
    const spent = calls();
    await runConnectorSync({ reader: testReader() });
    const person = { id: 'p-alex', name: 'Alex Rivera', role: 'Associate' as const };
    await runPrivy(person, 'helios', 'Should we take the second meeting?', { questionId: 'pq-test-' + 'x' * 4 });
    expect(calls()).toBe(spent);
  });
});

describe('decision writer', () => {
  it('cites only visible sources', async () => {
    const draft = await draftDecision('pq-test', 'helios', 'Partner', 'Should we take the second meeting?');
    const body = JSON.stringify(draft.sentences);
    expect(body).not.toContain('Granite');
  });
});
