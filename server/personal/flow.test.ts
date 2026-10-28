import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, copyFileSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Claim } from '../../shared/data.js';
import { readAll } from '../common/ledger/store.js';
import { assemble } from '../common/boundary/assemble.js';
import { seedPeople } from '../firm/agent-auth.js';
import { getFirmDb, closeFirmDb } from '../firm/store.js';
import { runConnectorSync, testReader } from '../firm/sync.js';
import { agentContext, agentFromHeader } from '../firm/agent.js';
import { classificationFromRule, firmShells, judgeBridges, type FirmSlice } from './bridge.js';
import { runInboxPoll } from './ingest.js';
import { askQuestion } from './answer.js';
import { shareClaim } from './share.js';
import { runMeetingTrigger } from './triggers.js';
import { closeDb } from './store.js';

const TOKEN = 'test-agent-token-flow';

let base: string;

function usePersonal(): void {
  closeDb();
  closeFirmDb();
  process.env.STEVENS_DATA_DIR = join(base, 'personal');
}

function useFirm(): void {
  closeDb();
  closeFirmDb();
  process.env.STEVENS_DATA_DIR = join(base, 'firm');
}

function calls(which: string): number {
  try {
    return (JSON.parse(readFileSync(join(base, which, 'meta-calls.json'), 'utf8')) as { count: number }).count;
  } catch {
    return 0;
  }
}

function ledger(which: string): string {
  return join(base, which, 'ledger.jsonl');
}

function readLedger(which: string): { type: string }[] {
  const path = ledger(which);
  try {
    return readFileSync(path, 'utf8').split('\n').filter((line) => line.trim().length > 0).map((line) => JSON.parse(line) as { type: string });
  } catch {
    return [];
  }
}

beforeAll(async () => {
  base = mkdtempSync(join(tmpdir(), 'stevens-flow-'));
  for (const side of ['firm', 'personal']) {
    const { mkdirSync } = await import('node:fs');
    mkdirSync(join(base, side, 'inbox'), { recursive: true });
    writeFileSync(join(base, side, 'meta-fake.json'), JSON.stringify({ mode: 'normal' }));
    writeFileSync(join(base, side, 'meta-calls.json'), JSON.stringify({ count: 0 }));
  }
  process.env.STEVENS_AGENT_TOKEN = TOKEN;
  process.env.STEVENS_NOW = '2026-10-28T14:00:00-04:00';
  useFirm();
  seedPeople(getFirmDb(), TOKEN);
  await runConnectorSync({ reader: testReader() });
  usePersonal();
  copyFileSync(join(process.cwd(), 'fixtures', 'personal', 'talk.wav'), join(base, 'personal', 'inbox', 'talk.wav'));
  await runInboxPoll();
  const { seedVault, scanVault } = await import('./adapters/vault.js');
  const { ingestVaultScan } = await import('./ingest.js');
  const { utimesSync: touch, readdirSync: list, statSync: stat } = await import('node:fs');
  seedVault();
  const past = new Date(Date.now() - 10 * 60 * 1000);
  const settle = (current: string): void => {
    for (const name of list(current)) {
      const path = join(current, name);
      if (stat(path).isDirectory()) settle(path);
      else touch(path, past, past);
    }
  };
  settle(join(base, 'personal', 'vault'));
  await ingestVaultScan(scanVault());
});

afterAll(() => {
  delete process.env.STEVENS_NOW;
  closeDb();
  closeFirmDb();
});

async function heliosSlice(): Promise<FirmSlice> {
  useFirm();
  const person = agentFromHeader(TOKEN) as { id: string; name: string; role: 'Associate' };
  const slice = agentContext(person, 'helios', 'brief');
  usePersonal();
  return slice;
}

describe('bridge over firm context', () => {
  it('judges a churn bridge with a visible-only manifest', async () => {
    const slice = await heliosSlice();
    const bridges = await judgeBridges(slice);
    expect(bridges.length).toBeGreaterThan(0);
    const judged = readAll().filter((e) => e.type === 'bridge.judged');
    expect(judged.length).toBeGreaterThan(0);
    const body = JSON.stringify(judged);
    for (const leaked of ['Lumen', 'Granite']) expect(body).not.toContain(leaked);
    usePersonal();
  });

  it('withholds a forged privy source even when marked visible', () => {
    const forged: FirmSlice = {
      sources: [{ id: 'x', vault: 'enterprise', kind: 'memo', title: 'X', capturedAt: '2026-10-23T00:00:00Z', connector: 'crm', access: 'visible', ruleId: 'r-partner-only-associate' }],
      claims: [{ id: 'x-c0', sourceId: 'x', entity: 'e', quote: 'secret eleven' }],
    };
    expect(classificationFromRule('r-partner-only-associate')).toBe('partner-only');
    const shells = firmShells(forged);
    expect(shells[0].classification).toBe('partner-only');
    const { manifest } = assemble('brief', 'Associate', 'm', 'k', shells, forged.claims as Claim[], undefined, () => true);
    expect(manifest.included).toHaveLength(0);
    expect(manifest.withheld.map((entry) => entry.sourceId)).toContain('x');
  });
});

describe('meeting trigger', () => {
  it('writes a cited brief for the upcoming meeting and never repeats', async () => {
    const contextFn = async () => heliosSlice();
    const meetingsFn = async () => [{ id: 'm-helios-2', dealId: 'helios', company: 'Helios', title: 'Helios second meeting', startsAt: '2026-10-29T10:00:00-04:00' }];
    usePersonal();
    const first = await runMeetingTrigger({ meetingsFn, contextFn });
    expect(first.briefs).toHaveLength(1);
    expect(first.briefs[0].sentences.length).toBeGreaterThan(0);
    expect((first.briefs[0].bridges ?? []).length).toBeGreaterThan(0);
    const spent = calls('personal');
    const ledgerBefore = readAll().length;
    const second = await runMeetingTrigger({ meetingsFn, contextFn });
    expect(second.briefs).toHaveLength(1);
    expect(second.briefs[0].id).toBe(first.briefs[0].id);
    expect(second.briefs[0].sentences.length).toBeGreaterThan(0);
    expect(readAll().length).toBe(ledgerBefore);
    expect(calls('personal')).toBe(spent);
  });
});

describe('ask and escalation', () => {
  it('holds, queues the escalation, and drafts an answer when the firm is down', async () => {
    usePersonal();
    const result = await askQuestion('helios', 'Should we take the second meeting?', {
      privyFn: async () => {
        throw new Error('firm unreachable');
      },
      contextFn: async () => ({ sources: [], claims: [] }),
    });
    expect(result.verdict).toEqual({ verdict: 'hold', routeTo: 'Partner' });
    expect(result.escalation).toBe('queued');
    expect(result.firmReachable).toBe(false);
    expect(result.draft.sentences.length).toBeGreaterThan(0);
  }, 30000);

  it('replays the same question with zero new calls', async () => {
    usePersonal();
    const before = calls('personal');
    const result = await askQuestion('helios', 'Should we take the second meeting?', {
      privyFn: async () => {
        throw new Error('firm unreachable');
      },
      contextFn: async () => ({ sources: [], claims: [] }),
    });
    expect(result.draft.sentences.length).toBeGreaterThan(0);
    expect(calls('personal')).toBe(before);
  });
});

describe('personal routes', () => {
  it('serves ask with 202 and share with 201 shapes ahead of legacy routes', async () => {
    usePersonal();
    const mod = await import('./index.js');
    const asked = await mod.app.request('/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dealId: 'helios', question: 'Route order probe?' }),
    });
    expect(asked.status).toBe(202);
    const payload = (await asked.json()) as { questionId: string };
    expect(payload.questionId.startsWith('q-')).toBe(true);
    const missing = await mod.app.request('/api/share/nope', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dealId: 'helios' }),
    });
    expect(missing.status).toBe(404);
  }, 30000);
});

describe('share gate', () => {
  it('logs share.sent only after the firm answers 201', async () => {
    usePersonal();
    const before = readLedger('personal').length;
    const claim = readAll().flatMap((e) => (e.type === 'claims.extracted' && e.itemId ? e.claims : []) as Claim[])[0];
    const result = await shareClaim(claim.id, 'helios', { releaseFn: async () => ({ documentId: 'rel-1' }) });
    expect(result.documentId).toBe('rel-1');
    expect(readLedger('personal').length).toBeGreaterThan(before);
    await expect(shareClaim('no-such-claim', 'helios', { releaseFn: async () => ({ documentId: 'rel-2' }) })).rejects.toThrow('unknown claim');
    expect(readLedger('personal').filter((e) => e.type === 'share.sent')).toHaveLength(1);
  });

  it('never logs when the firm refuses', async () => {
    usePersonal();
    const claim = readAll().flatMap((e) => (e.type === 'claims.extracted' && e.itemId ? e.claims : []) as Claim[])[0];
    await expect(shareClaim(claim.id, 'helios', {
      releaseFn: async () => {
        throw new Error('firm unreachable');
      },
    })).rejects.toThrow();
    expect(readLedger('personal').filter((e) => e.type === 'share.sent')).toHaveLength(1);
  });
});
