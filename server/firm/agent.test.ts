import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import { readAll } from '../common/ledger/store.js';
import { closeFirmDb } from './store.js';
import { seedPeople } from './agent-auth.js';
import { getFirmDb } from './store.js';
import { runConnectorSync } from './sync.js';
import { agentContext, agentFromHeader, agentMedia, agentMeetings } from './agent.js';

const TOKEN = 'test-agent-token-11';

function calls(dir: string): number {
  const path = join(dir, 'meta-calls.json');
  try {
    return (JSON.parse(readFileSync(path, 'utf8')) as { count: number }).count;
  } catch {
    return 0;
  }
}

let dir: string;
let app: typeof import('./index.js')['app'];

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'stevens-agent-'));
  dir = join(dir, 'firm');
  mkdirSync(dir, { recursive: true });
  process.env.STEVENS_DATA_DIR = dir;
  process.env.STEVENS_AGENT_TOKEN = TOKEN;
  process.env.STEVENS_NOW = '2026-10-28T14:00:00-04:00';
  writeFileSync(join(dir, 'meta-fake.json'), JSON.stringify({ mode: 'normal' }));
  writeFileSync(join(dir, 'meta-calls.json'), JSON.stringify({ count: 0 }));
  seedPeople(getFirmDb(), TOKEN);
  await runConnectorSync();
  const mod = await import('./index.js');
  app = mod.app;
});

afterAll(() => {
  delete process.env.STEVENS_NOW;
  closeFirmDb();
});

describe('crm sync', () => {
  it('loads documents, acl rows, and people into firm.db', () => {
    const db = getFirmDb();
    const docs = db.prepare(`select count(*) as n from documents`).get() as unknown as { n: number };
    expect(docs.n).toBe(7);
    const acl = db.prepare(`select count(*) as n from document_acl`).get() as unknown as { n: number };
    expect(acl.n).toBe(7);
    const people = db.prepare(`select count(*) as n from people`).get() as unknown as { n: number };
    expect(people.n).toBe(3);
  });

  it('extracts verbatim claims for every document with a second sync costing nothing', async () => {
    const spent = calls(dir);
    const second = await runConnectorSync();
    expect(second.documents).toBe(7);
    expect(calls(dir)).toBe(spent);
    const extracted = readAll().filter((e) => e.type === 'claims.extracted');
    expect(extracted.length).toBeGreaterThanOrEqual(7);
  });
});

describe('agent meetings', () => {
  it('returns the Helios meeting within 24 hours for Alex', () => {
    const person = agentFromHeader(TOKEN);
    expect(person?.id).toBe('p-alex');
    const meetings = agentMeetings(person as { id: string; name: string; role: 'Associate' }, 24);
    expect(meetings.map((m) => m.id)).toContain('m-helios-2');
    expect(meetings[0].company).toBe('Helios');
  });

  it('returns nothing outside the window', () => {
    const person = agentFromHeader(TOKEN);
    const meetings = agentMeetings(person as { id: string; name: string; role: 'Associate' }, 1);
    expect(meetings).toEqual([]);
  });
});

describe('agent context boundary', () => {
  for (const purpose of ['bridge', 'brief', 'answer'] as const) {
    it(`serves ${purpose} context without privy or wall text`, () => {
      const person = agentFromHeader(TOKEN) as { id: string; name: string; role: 'Associate' };
      const context = agentContext(person, 'helios', purpose);
      const body = JSON.stringify(context);
      expect(body).toContain('churn');
      for (const leaked of ['Lumen', 'Granite', 'legal hold', 'd-conflicts-lumen', 'd-granite']) {
        expect(body).not.toContain(leaked);
      }
      expect(context.sources.every((s) => s.access === 'visible')).toBe(true);
      expect(context.sources.every((s) => s.ruleId.length > 0)).toBe(true);
    });
  }

  it('serves the deck photo bytes but not partner-only media', async () => {
    const person = agentFromHeader(TOKEN) as { id: string; name: string; role: 'Associate' };
    const deck = agentMedia(person, 'd-helios-deck');
    expect(deck?.contentType).toBe('image/jpeg');
    expect((deck?.bytes.length ?? 0)).toBeGreaterThan(0);
    expect(agentMedia(person, 'd-conflicts-lumen')).toBeNull();
    expect(agentMedia(person, 'no-such-doc')).toBeNull();
  });

  it('rejects unknown agents at the HTTP layer', async () => {
    expect((await app.request('/agent/context?dealId=helios&purpose=answer')).status).toBe(401);
    const bad = await app.request('/agent/context?dealId=helios&purpose=answer', { headers: { 'X-Stevens-Agent': 'wrong' } });
    expect(bad.status).toBe(401);
    const good = await app.request('/agent/context?dealId=helios&purpose=answer', { headers: { 'X-Stevens-Agent': TOKEN } });
    expect(good.status).toBe(200);
    const body = await good.text();
    expect(body).not.toContain('Lumen');
    const media = await app.request('/agent/media/d-conflicts-lumen', { headers: { 'X-Stevens-Agent': TOKEN } });
    expect(media.status).toBe(404);
    const deck = await app.request('/agent/media/d-helios-deck', { headers: { 'X-Stevens-Agent': TOKEN } });
    expect(deck.status).toBe(200);
  });
});
