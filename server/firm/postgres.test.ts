import { describe, it, expect, beforeEach } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from 'pg';
import { readAll } from '../common/ledger/store.js';
import { policy } from '../common/boundary/policy.js';
import { seedPeople } from './agent-auth.js';
import { agentContext } from './agent.js';
import { classifyAcl } from './connectors/acl-map.js';
import { PgCrmReader, granteePrincipal } from './connectors/crm.js';
import { inboundRelease } from './release.js';
import { closeFirmDb, documentAcl, firmDocuments, getFirmDb, isMember } from './store.js';
import { ensureFirmDb, firmSourceFor, runConnectorSync } from './sync.js';

function envFile(): Map<string, string> {
  const found = new Map<string, string>();
  try {
    for (const line of readFileSync(join(process.cwd(), '.env.local'), 'utf8').split('\n')) {
      const cut = line.indexOf('=');
      if (cut > 0) found.set(line.slice(0, cut).trim(), line.slice(cut + 1).trim());
    }
  } catch {
    void 0;
  }
  return found;
}

const ENV = envFile();
const ADMIN_URL = process.env.FIRM_ADMIN_DATABASE_URL ?? ENV.get('FIRM_ADMIN_DATABASE_URL') ?? '';
const STEVENS_URL = process.env.FIRM_DATABASE_URL ?? ENV.get('FIRM_DATABASE_URL') ?? '';

function tcpUp(url: string): boolean {
  let host = '127.0.0.1';
  let port = '5433';
  try {
    const parsed = new URL(url);
    host = parsed.hostname;
    port = parsed.port || '5432';
  } catch {
    return false;
  }
  const probe = spawnSync(process.execPath, ['-e', `require('node:net').connect(${JSON.stringify(port)},${JSON.stringify(host)}).on('connect',function(){process.exit(0)}).on('error',function(){process.exit(1)})`], { timeout: 8000 });
  return probe.status === 0;
}

const LIVE = ADMIN_URL !== '' && STEVENS_URL !== '' && tcpUp(ADMIN_URL);

async function withAdmin<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: ADMIN_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

const TOKEN = 'test-agent-token-pg';

async function freshDir(): Promise<string> {
  closeFirmDb();
  const dir = join(mkdtempSync(join(tmpdir(), 'stevens-pg-')), 'firm');
  mkdirSync(dir, { recursive: true });
  process.env.STEVENS_DATA_DIR = dir;
  process.env.STEVENS_AGENT_TOKEN = TOKEN;
  writeFileSync(join(dir, 'meta-fake.json'), JSON.stringify({ mode: 'normal' }));
  writeFileSync(join(dir, 'meta-calls.json'), JSON.stringify({ count: 0 }));
  seedPeople(getFirmDb(), TOKEN);
  return dir;
}

describe.skipIf(!LIVE)('postgres crm', () => {
  beforeEach(async () => {
    await freshDir();
    const result = await runConnectorSync({ reader: new PgCrmReader(STEVENS_URL) });
    expect(result.crmError).toBeUndefined();
  });

  it('mirrors readability: member in firm.db matches a body read as the person role', async () => {
    const grants = await withAdmin(async (client) => {
      const res = await client.query(`select document_id, grantee from crm.document_grants`);
      return res.rows as { document_id: string; grantee: string }[];
    });
    const people = [
      { id: 'p-alex', role: 'dh_p_alex' },
      { id: 'p-morgan', role: 'dh_p_morgan' },
      { id: 'p-jordan', role: 'dh_p_jordan' },
    ];
    const readable = await withAdmin(async (client) => {
      const found = new Map<string, boolean>();
      for (const person of people) {
        await client.query(`set role "${person.role}"`);
        const res = await client.query(`select document_id from crm.document_bodies`);
        const seen = new Set((res.rows as { document_id: string }[]).map((row) => row.document_id));
        for (const doc of firmDocuments().filter((entry) => entry.connector === 'crm')) {
          found.set(person.id + '|' + doc.id, seen.has(doc.id));
        }
        await client.query(`reset role`);
      }
      return found;
    });
    for (const person of people) {
      for (const doc of firmDocuments().filter((entry) => entry.connector === 'crm')) {
        const acl = grants.filter((grant) => grant.document_id === doc.id).map((grant) => granteePrincipal(grant.grantee));
        expect(isMember(person.id, acl)).toBe(readable.get(person.id + '|' + doc.id));
      }
    }
  });

  it('keeps the legal-hold body out of firm.db and the firm ledger', async () => {
    const body = 'Do not discuss, cite, or reason over this note';
    const row = getFirmDb().prepare(`select body from documents where id = 'd-granite'`).get() as unknown as { body: string | null };
    expect(row.body).toBeNull();
    const dumped = execFileSync('sqlite3', [join(process.env.STEVENS_DATA_DIR as string, 'firm.db'), '.dump'], { encoding: 'utf8', timeout: 15000 });
    expect(dumped).not.toContain(body);
    expect(readAll().map((event) => JSON.stringify(event)).join('\n')).not.toContain(body);
  });

  it('downgrades a document within 60s of a grant revoke', async () => {
    const started = Date.now();
    const jordan = { id: 'p-jordan', name: 'Jordan Blake', role: 'Partner' as const };
    const before = agentContext(jordan, 'beacon', 'brief');
    expect(before.sources.map((source) => source.id)).toContain('d-beacon-memo');
    await withAdmin(async (client) => {
      await client.query(`delete from crm.document_grants where document_id = 'd-beacon-memo'`);
    });
    try {
      await runConnectorSync({ reader: new PgCrmReader(STEVENS_URL) });
      const after = agentContext(jordan, 'beacon', 'brief');
      expect(after.sources.map((source) => source.id)).not.toContain('d-beacon-memo');
      const row = getFirmDb().prepare(`select body from documents where id = 'd-beacon-memo'`).get() as unknown as { body: string | null };
      expect(row.body).toBeNull();
      expect(Date.now() - started).toBeLessThan(60000);
    } finally {
      await withAdmin(async (client) => {
        await client.query(`insert into crm.document_grants (document_id, grantee) values ('d-beacon-memo', 'dh_deal_team_beacon') on conflict do nothing`);
      });
      await runConnectorSync({ reader: new PgCrmReader(STEVENS_URL) });
    }
    const restored = agentContext(jordan, 'beacon', 'brief');
    expect(restored.sources.map((source) => source.id)).toContain('d-beacon-memo');
  });

  it('shows visible sources as member-readable and hidden ones otherwise', async () => {
    const jordan = { id: 'p-jordan', name: 'Jordan Blake', role: 'Partner' as const };
    for (const doc of firmDocuments().filter((entry) => entry.connector === 'crm')) {
      const acl = documentAcl(doc.id);
      const source = firmSourceFor(
        { id: doc.id, kind: doc.kind as 'memo', title: doc.title, createdAt: doc.createdAt, body: doc.body, mediaPath: doc.mediaPath },
        classifyAcl(acl).classification,
      );
      const decision = policy(source, 'Partner', 'brief', isMember('p-jordan', acl));
      const seen = agentContext(jordan, doc.dealId ?? 'helios', 'brief').sources.some((entry) => entry.id === doc.id);
      expect(seen).toBe(decision.access === 'visible');
    }
  });
});

describe.skipIf(!LIVE)('postgres rebuild', () => {
  it('rebuilds firm.db with Postgres stopped and zero calls', async () => {
    const dir = await freshDir();
    await runConnectorSync({ reader: new PgCrmReader(STEVENS_URL) });
    const alex = { id: 'p-alex', name: 'Alex Rivera', role: 'Associate' as const };
    inboundRelease(alex, {
      dealId: 'helios', claimId: 'c-rebuild-1', quote: 'churn is two percent on logos',
      provenance: { title: 'note', origin: 'vault', capturedAt: '2026-10-27T00:00:00Z' },
    });
    const db = getFirmDb();
    const snapshot = {
      documents: db.prepare(`select id, connector, deal_id, kind, title, body, media_path, created_at, shared_by from documents order by id`).all(),
      acl: db.prepare(`select document_id, principal from document_acl order by document_id, principal`).all(),
      memberships: db.prepare(`select person_id, principal from memberships order by person_id, principal`).all(),
      people: db.prepare(`select id, name, role from people order by id`).all(),
      deals: db.prepare(`select * from deals order by id`).all(),
      meetings: db.prepare(`select * from meetings order by id`).all(),
      portfolio: db.prepare(`select * from portfolio order by company`).all(),
      provenance: db.prepare(`select * from release_provenance order by document_id`).all(),
    };
    const callsBefore = (JSON.parse(readFileSync(join(dir, 'meta-calls.json'), 'utf8')) as { count: number }).count;
    closeFirmDb();
    rmSync(join(dir, 'firm.db'));
    const savedAdmin = process.env.FIRM_ADMIN_DATABASE_URL;
    const savedStevens = process.env.FIRM_DATABASE_URL;
    delete process.env.FIRM_ADMIN_DATABASE_URL;
    delete process.env.FIRM_DATABASE_URL;
    try {
      const events = readAll();
      const result = await ensureFirmDb(events);
      expect(result.rebuilt).toBe(true);
    } finally {
      if (savedAdmin !== undefined) process.env.FIRM_ADMIN_DATABASE_URL = savedAdmin;
      if (savedStevens !== undefined) process.env.FIRM_DATABASE_URL = savedStevens;
    }
    const rebuilt = getFirmDb();
    expect(rebuilt.prepare(`select id, connector, deal_id, kind, title, body, media_path, created_at, shared_by from documents order by id`).all()).toEqual(snapshot.documents);
    expect(rebuilt.prepare(`select document_id, principal from document_acl order by document_id, principal`).all()).toEqual(snapshot.acl);
    expect(rebuilt.prepare(`select person_id, principal from memberships order by person_id, principal`).all()).toEqual(snapshot.memberships);
    expect(rebuilt.prepare(`select id, name, role from people order by id`).all()).toEqual(snapshot.people);
    expect(rebuilt.prepare(`select * from deals order by id`).all()).toEqual(snapshot.deals);
    expect(rebuilt.prepare(`select * from meetings order by id`).all()).toEqual(snapshot.meetings);
    expect(rebuilt.prepare(`select * from portfolio order by company`).all()).toEqual(snapshot.portfolio);
    expect(rebuilt.prepare(`select * from release_provenance order by document_id`).all()).toEqual(snapshot.provenance);
    const callsAfter = (JSON.parse(readFileSync(join(dir, 'meta-calls.json'), 'utf8')) as { count: number }).count;
    expect(callsAfter).toBe(callsBefore);
    closeFirmDb();
  });
});
