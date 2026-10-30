import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { append as appendFirmEvent, readAll } from '../common/ledger/store.js';
import { personForToken, seedPeople } from './agent-auth.js';
import { agentContext } from './agent.js';
import { fixtureCrmReader, granteePrincipal, loadCrm, scenarioDisplay, type CrmReader } from './connectors/crm.js';
import { loadFormD } from './connectors/formd.js';
import { draftEscalation, recipientName } from './decision.js';
import { buildFirmState } from './state.js';
import { closeFirmDb, documentAcl, firmDocuments, getFirmDb, isMember, recipientFor } from './store.js';
import { defaultReader, runConnectorSync, testReader } from './sync.js';

const TOKEN = 'test-agent-token-crm';

beforeEach(async () => {
  await closeFirmDb();
  const dir = join(mkdtempSync(join(tmpdir(), 'stevens-crm-')), 'firm');
  mkdirSync(dir, { recursive: true });
  process.env.STEVENS_DATA_DIR = dir;
  process.env.STEVENS_AGENT_TOKEN = TOKEN;
  writeFileSync(join(dir, 'meta-fake.json'), JSON.stringify({ mode: 'normal' }));
  writeFileSync(join(dir, 'meta-calls.json'), JSON.stringify({ count: 0 }));
  await seedPeople(TOKEN);
});

describe('grantee mapping', () => {
  it('maps crm roles to principals and passes the rest through', async () => {
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
    const rows = await (await getFirmDb()).all(`select person_id as personId, principal from memberships order by personId, principal`);
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
    const row = await (await getFirmDb()).get<{ body: string | null; title: string }>(`select body, title from documents where id = 'd-granite'`);
    expect(row.title).toBe('Restricted: Project Granite');
    expect(row.body).toBeNull();
    const ledgerText = readAll().map((event) => JSON.stringify(event)).join('\n');
    expect(ledgerText).not.toContain('Do not discuss, cite, or reason over this note');
  });

  it('deletes documents missing from the reader', async () => {
    await runConnectorSync({ reader: testReader() });
    expect((await firmDocuments()).some((doc) => doc.id === 'd-meridian-notes')).toBe(true);
    const snap = loadCrm();
    const smaller = fixtureCrmReader({ ...snap, documents: snap.documents.filter((doc) => doc.id !== 'd-meridian-notes') });
    await runConnectorSync({ reader: smaller });
    expect((await firmDocuments()).some((doc) => doc.id === 'd-meridian-notes')).toBe(false);
  });

  it('downgrades a document whose grant disappears', async () => {
    await runConnectorSync({ reader: testReader() });
    const before = await (await getFirmDb()).get<{ body: string }>(`select body from documents where id = 'd-beacon-memo'`);
    expect(before.body).toContain('Beacon diligence');
    const snap = loadCrm();
    const revoked: CrmReader = {
      ...fixtureCrmReader(snap),
      grants: async () => [{ documentId: 'd-beacon-memo', grantee: 'dh_legal_hold_granite' }],
      documents: async () => [],
      bodiesFor: async () => [{ id: 'd-beacon-memo', body: null, mediaPath: null }],
    };
    await runConnectorSync({ reader: revoked });
    expect(await documentAcl('d-beacon-memo')).toEqual(['legal-hold:granite']);
    const after = await (await getFirmDb()).get<{ body: string | null }>(`select body from documents where id = 'd-beacon-memo'`);
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
    expect((await firmDocuments()).some((doc) => doc.id === 'd-helios-record')).toBe(true);
    const row = await (await getFirmDb()).get<{ message: string; at: string }>(`select last_error as message, last_error_at as at from connector_state where connector = 'crm'`);
    expect(row.message).toContain('connection refused');
    expect(row.at.length).toBeGreaterThan(0);
    expect((await firmDocuments()).some((doc) => doc.connector === 'sec-form-d')).toBe(true);
  });
});

describe('membership', () => {
  it('requires one shared principal and every legal hold', async () => {
    await runConnectorSync({ reader: testReader() });
    expect(await isMember('p-alex', ['deal-team:helios'])).toBe(true);
    expect(await isMember('p-alex', ['deal-team:beacon'])).toBe(false);
    expect(await isMember('p-alex', ['all-staff'])).toBe(true);
    expect(await isMember('p-jordan', ['deal-team:helios'])).toBe(false);
    expect(await isMember('p-jordan', ['legal-hold:granite'])).toBe(false);
    expect(await isMember('p-alex', [])).toBe(false);
  });

  it('resolves the routed role to the teammate on the deal', async () => {
    await runConnectorSync({ reader: testReader() });
    expect(await recipientFor('Partner', 'helios')).toBe('p-morgan');
    expect(await recipientFor('Partner', 'beacon')).toBe('p-jordan');
    expect(await recipientFor('Associate', 'helios')).toBe('p-alex');
  });
});

describe('member gating', () => {
  const alex = { id: 'p-alex', name: 'Alex Rivera', role: 'Associate' as const };
  const jordan = { id: 'p-jordan', name: 'Jordan Blake', role: 'Partner' as const };

  it('shows Jordan the Helios memo as privy through context', async () => {
    await runConnectorSync({ reader: testReader() });
    const seen = await agentContext(jordan, 'helios', 'brief');
    expect(seen.sources.map((source) => source.id)).not.toContain('d-helios-memo');
    const mine = await agentContext(alex, 'meridian', 'brief');
    expect(mine.sources.map((source) => source.id)).toContain('d-meridian-notes');
    const outside = await agentContext(alex, 'beacon', 'brief');
    expect(outside.sources.map((source) => source.id)).not.toContain('d-beacon-memo');
  });

  it('hides outside-team documents from the firm state', async () => {
    await runConnectorSync({ reader: testReader() });
    const state = await buildFirmState({ id: 'p-jordan', name: 'Jordan Blake', role: 'Partner' });
    const helios = state.deals.find((deal) => deal.id === 'helios');
    expect(helios?.documents.map((doc) => doc.id)).not.toContain('d-helios-memo');
    const beacon = state.deals.find((deal) => deal.id === 'beacon');
    expect(beacon?.documents.map((doc) => doc.id)).toContain('d-beacon-memo');
  });

  it('reads Replaying a recorded run with STEVENS_REPLAY=1', async () => {
    await runConnectorSync({ reader: testReader() });
    process.env.STEVENS_REPLAY = '1';
    try {
      const state = await buildFirmState({ id: 'p-morgan', name: 'Morgan Hale', role: 'Partner' });
      expect(state.status.line).toBe('Replaying a recorded run');
    } finally {
      delete process.env.STEVENS_REPLAY;
    }
  });
});

describe('scenario fixtures', () => {
  it('refuses to sync when FIRM_DATABASE_URL is unset', async () => {
    const saved = process.env.FIRM_DATABASE_URL;
    delete process.env.FIRM_DATABASE_URL;
    try {
      expect(() => defaultReader()).toThrow('FIRM_DATABASE_URL is not set');
    } finally {
      if (saved === undefined) delete process.env.FIRM_DATABASE_URL;
      else process.env.FIRM_DATABASE_URL = saved;
    }
  });

  it('carries meeting askHint from the fixture into firm.db', async () => {
    await runConnectorSync({ reader: testReader() });
    const row = await (await getFirmDb()).get<{ askHint: string | null }>(`select ask_hint as askHint from meetings where id = 'm-helios-2'`);
    expect(row.askHint).toBe('Should we take the second meeting?');
    const synced = readAll().find((event) => event.type === 'connector.synced');
    expect(synced && synced.type === 'connector.synced' ? synced.upserted.meetings[0].askHint : null).toBe('Should we take the second meeting?');
  });

  it('reads the scenario display contract from crm.json', async () => {
    const display = scenarioDisplay();
    expect(display.roleTitles).toEqual({ Associate: 'Associate', Partner: 'Partner' });
    expect(display.reviewerNoun).toBe('a Partner');
    expect(display.labels.unit).toBe('deals');
    expect(display.firmDataLabel).toBe('Fictional firm data');
  });

  it('serves an empty market when the Form D fixture is missing', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'stevens-noformd-'));
    const saved = process.env.STEVENS_FIXTURES_DIR;
    process.env.STEVENS_FIXTURES_DIR = dir;
    try {
      expect(loadFormD().filings).toEqual([]);
      const state = await buildFirmState({ id: 'p-morgan', name: 'Morgan Hale', role: 'Partner' });
      expect(state.market).toEqual([]);
      expect(state.connectors.map((connector) => connector.id)).toEqual(['crm']);
    } finally {
      if (saved === undefined) delete process.env.STEVENS_FIXTURES_DIR;
      else process.env.STEVENS_FIXTURES_DIR = saved;
    }
  });

  it('maps the agent token to the STEVENS_OWNER person', async () => {
    process.env.STEVENS_OWNER = 'p-morgan';
    try {
      await seedPeople(TOKEN);
      expect((await personForToken(TOKEN))?.id).toBe('p-morgan');
    } finally {
      delete process.env.STEVENS_OWNER;
    }
  });

  it('returns the escalation recipient name and reviewer noun', async () => {
    await runConnectorSync({ reader: testReader() });
    expect(await recipientName(await recipientFor('Partner', 'helios'))).toBe('Morgan Hale');
    appendFirmEvent({ at: new Date().toISOString(), type: 'escalation.drafted', escalationId: 'es-1', questionId: 'q-1', dealId: 'helios', from: 'p-alex', to: 'Partner' });
    const sent = await draftEscalation('p-alex', 'helios', 'q-1', undefined);
    expect(sent.toName).toBe('Morgan Hale');
    expect(sent.reviewerNoun).toBe('a Partner');
  });
});
