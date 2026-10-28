import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readAll } from '../common/ledger/store.js';
import { seedPeople } from './agent-auth.js';
import { agentContext } from './agent.js';
import { fixtureCrmReader, granteePrincipal, loadCrm, type CrmReader } from './connectors/crm.js';
import { buildFirmState } from './state.js';
import { closeFirmDb, documentAcl, firmDocuments, getFirmDb, isMember, recipientFor } from './store.js';
import { runConnectorSync, testReader } from './sync.js';

const TOKEN = 'test-agent-token-crm';

beforeEach(async () => {
  closeFirmDb();
  const dir = join(mkdtempSync(join(tmpdir(), 'stevens-crm-')), 'firm');
  mkdirSync(dir, { recursive: true });
  process.env.STEVENS_DATA_DIR = dir;
  process.env.STEVENS_AGENT_TOKEN = TOKEN;
  writeFileSync(join(dir, 'meta-fake.json'), JSON.stringify({ mode: 'normal' }));
  writeFileSync(join(dir, 'meta-calls.json'), JSON.stringify({ count: 0 }));
  seedPeople(getFirmDb(), TOKEN);
});

describe('grantee mapping', () => {
  it('maps crm roles to principals and passes the rest through', () => {
    expect(granteePrincipal('dh_all_staff')).toBe('all-staff');
    expect(granteePrincipal('dh_partners')).toBe('partners');
    expect(granteePrincipal('dh_deal_team_helios')).toBe('deal-team:helios');
    expect(granteePrincipal('dh_legal_hold_granite')).toBe('legal-hold:granite');
    expect(granteePrincipal('dh_mystery')).toBe('dh_mystery');
  });
});

describe('crm sync', () => {
  it('fills memberships from the reader', async () => {
    await runConnectorSync({ reader: testReader() });
    const rows = getFirmDb().prepare(`select person_id as personId, principal from memberships order by personId, principal`).all();
    expect(rows).toContainEqual({ personId: 'p-alex', principal: 'all-staff' });
    expect(rows).toContainEqual({ personId: 'p-alex', principal: 'deal-team:helios' });
    expect(rows).toContainEqual({ personId: 'p-alex', principal: 'deal-team:meridian' });
    expect(rows).toContainEqual({ personId: 'p-morgan', principal: 'partners' });
    expect(rows).not.toContainEqual({ personId: 'p-alex', principal: 'partners' });
  });

  it('appends one connector.synced and none when nothing changes', async () => {
    await runConnectorSync({ reader: testReader() });
    const first = readAll().filter((event) => event.type === 'connector.synced');
    expect(first).toHaveLength(1);
    await runConnectorSync({ reader: testReader() });
    const second = readAll().filter((event) => event.type === 'connector.synced');
    expect(second).toHaveLength(1);
  });

  it('keeps the legal-hold body out of firm.db', async () => {
    await runConnectorSync({ reader: testReader() });
    const row = getFirmDb().prepare(`select body, title from documents where id = 'd-granite'`).get() as unknown as { body: string | null; title: string };
    expect(row.title).toBe('Restricted: Project Granite');
    expect(row.body).toBeNull();
    const ledgerText = readAll().map((event) => JSON.stringify(event)).join('\n');
    expect(ledgerText).not.toContain('Do not discuss, cite, or reason over this note');
  });

  it('deletes documents missing from the reader', async () => {
    await runConnectorSync({ reader: testReader() });
    expect(firmDocuments().some((doc) => doc.id === 'd-meridian-notes')).toBe(true);
    const snap = loadCrm();
    const smaller = fixtureCrmReader({ ...snap, documents: snap.documents.filter((doc) => doc.id !== 'd-meridian-notes') });
    await runConnectorSync({ reader: smaller });
    expect(firmDocuments().some((doc) => doc.id === 'd-meridian-notes')).toBe(false);
  });

  it('downgrades a document whose grant disappears', async () => {
    await runConnectorSync({ reader: testReader() });
    const before = getFirmDb().prepare(`select body from documents where id = 'd-beacon-memo'`).get() as unknown as { body: string };
    expect(before.body).toContain('Beacon diligence');
    const snap = loadCrm();
    const revoked: CrmReader = {
      ...fixtureCrmReader(snap),
      grants: async () => [{ documentId: 'd-beacon-memo', grantee: 'dh_legal_hold_granite' }],
      documents: async () => [],
      bodiesFor: async () => [{ id: 'd-beacon-memo', body: null, mediaPath: null }],
    };
    await runConnectorSync({ reader: revoked });
    expect(documentAcl('d-beacon-memo')).toEqual(['legal-hold:granite']);
    const after = getFirmDb().prepare(`select body from documents where id = 'd-beacon-memo'`).get() as unknown as { body: string | null };
    expect(after.body).toBeNull();
  });

  it('keeps the last snapshot and records the error when the reader fails', async () => {
    await runConnectorSync({ reader: testReader() });
    const failing: CrmReader = {
      ...testReader(),
      documents: async () => { throw new Error('connection refused'); },
    };
    const result = await runConnectorSync({ reader: failing });
    expect(result.crmError).toContain('connection refused');
    expect(firmDocuments().some((doc) => doc.id === 'd-helios-record')).toBe(true);
    const row = getFirmDb().prepare(`select last_error as message, last_error_at as at from connector_state where connector = 'crm'`).get() as unknown as { message: string; at: string };
    expect(row.message).toContain('connection refused');
    expect(row.at.length).toBeGreaterThan(0);
    expect(firmDocuments().some((doc) => doc.connector === 'sec-form-d')).toBe(true);
  });
});

describe('membership', () => {
  it('requires one shared principal and every legal hold', async () => {
    await runConnectorSync({ reader: testReader() });
    expect(isMember('p-alex', ['deal-team:helios'])).toBe(true);
    expect(isMember('p-alex', ['deal-team:beacon'])).toBe(false);
    expect(isMember('p-alex', ['all-staff'])).toBe(true);
    expect(isMember('p-jordan', ['deal-team:helios'])).toBe(false);
    expect(isMember('p-jordan', ['legal-hold:granite'])).toBe(false);
    expect(isMember('p-alex', [])).toBe(false);
  });

  it('resolves the routed role to the teammate on the deal', async () => {
    await runConnectorSync({ reader: testReader() });
    expect(recipientFor('Partner', 'helios')).toBe('p-morgan');
    expect(recipientFor('Partner', 'beacon')).toBe('p-jordan');
    expect(recipientFor('Associate', 'helios')).toBe('p-alex');
  });
});

describe('member gating', () => {
  const alex = { id: 'p-alex', name: 'Alex Rivera', role: 'Associate' as const };
  const jordan = { id: 'p-jordan', name: 'Jordan Blake', role: 'Partner' as const };

  it('shows Jordan the Helios memo as privy through context', async () => {
    await runConnectorSync({ reader: testReader() });
    const seen = agentContext(jordan, 'helios', 'brief');
    expect(seen.sources.map((source) => source.id)).not.toContain('d-helios-memo');
    const mine = agentContext(alex, 'meridian', 'brief');
    expect(mine.sources.map((source) => source.id)).toContain('d-meridian-notes');
    const outside = agentContext(alex, 'beacon', 'brief');
    expect(outside.sources.map((source) => source.id)).not.toContain('d-beacon-memo');
  });

  it('hides outside-team documents from the firm state', async () => {
    await runConnectorSync({ reader: testReader() });
    const state = buildFirmState({ id: 'p-jordan', name: 'Jordan Blake', role: 'Partner' });
    const helios = state.deals.find((deal) => deal.id === 'helios');
    expect(helios?.documents.map((doc) => doc.id)).not.toContain('d-helios-memo');
    const beacon = state.deals.find((deal) => deal.id === 'beacon');
    expect(beacon?.documents.map((doc) => doc.id)).toContain('d-beacon-memo');
  });

  it('reads Replaying a recorded run with STEVENS_REPLAY=1', async () => {
    await runConnectorSync({ reader: testReader() });
    process.env.STEVENS_REPLAY = '1';
    try {
      const state = buildFirmState({ id: 'p-morgan', name: 'Morgan Hale', role: 'Partner' });
      expect(state.status.line).toBe('Replaying a recorded run');
    } finally {
      delete process.env.STEVENS_REPLAY;
    }
  });
});
