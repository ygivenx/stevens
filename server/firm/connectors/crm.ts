import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import type { ScenarioDisplay } from '../../../shared/data.js';
import { DEFAULT_DISPLAY } from '../../common/scenarios.js';
import type { Connector, ConnectorDocument } from './connector.js';

interface CrmFixture {
  people: { id: string; name: string; role: string }[];
  deals: { id: string; company: string; sector: string; stage: string; askUsd: number | null }[];
  dealTeam: { dealId: string; personId: string }[];
  meetings: { id: string; dealId: string; title: string; startsAt: string; askHint?: string }[];
  documents: { id: string; dealId?: string; kind: ConnectorDocument['kind']; title: string; createdAt: string; body?: string; mediaPath?: string; acl: string[] }[];
  portfolio: { company: string; sector: string }[];
  display?: ScenarioDisplay;
}

export interface CrmSnapshot extends CrmFixture {}

export function loadCrm(): CrmSnapshot {
  const dir = process.env.STEVENS_FIXTURES_DIR ?? join(process.cwd(), 'fixtures');
  return JSON.parse(readFileSync(join(dir, 'enterprise', 'crm.json'), 'utf8')) as CrmSnapshot;
}

export function scenarioDisplay(): ScenarioDisplay {
  try {
    return loadCrm().display ?? DEFAULT_DISPLAY;
  } catch {
    return DEFAULT_DISPLAY;
  }
}

export interface CrmPerson { id: string; name: string; title: string }
export interface CrmDeal { id: string; company: string; sector: string; stage: string; askUsd: number | null }
export interface CrmMeeting { id: string; dealId: string; title: string; startsAt: string; askHint?: string }
export interface CrmDocument { id: string; dealId: string | null; kind: string; title: string; createdAt: string; updatedAt: string; body: string | null; mediaPath: string | null }
export interface CrmGrant { documentId: string; grantee: string }
export interface CrmMembership { personId: string; principal: string }

export interface CrmReader {
  people(): Promise<CrmPerson[]>;
  deals(): Promise<CrmDeal[]>;
  meetings(): Promise<CrmMeeting[]>;
  portfolio(): Promise<{ company: string; sector: string }[]>;
  documents(since: string | null): Promise<CrmDocument[]>;
  bodiesFor(ids: string[]): Promise<{ id: string; body: string | null; mediaPath: string | null }[]>;
  documentIds(): Promise<string[]>;
  grants(): Promise<CrmGrant[]>;
  memberships(): Promise<CrmMembership[]>;
}

const ROLE_PREFIXES = ['dh', 'fg', 'mc'];

export function granteePrincipal(grantee: string): string {
  for (const prefix of ROLE_PREFIXES) {
    if (grantee === prefix + '_all_staff') return 'all-staff';
    if (grantee === prefix + '_partners') return 'partners';
    const team = new RegExp('^' + prefix + '_deal_team_(.+)$').exec(grantee);
    if (team) return 'deal-team:' + team[1];
    const hold = new RegExp('^' + prefix + '_legal_hold_(.+)$').exec(grantee);
    if (hold) return 'legal-hold:' + hold[1];
  }
  return grantee;
}

export class PgCrmReader implements CrmReader {
  private url: string;
  private prefix: string;

  constructor(url: string, prefix: string = 'dh') {
    this.url = url;
    this.prefix = prefix;
  }

  private async query<T>(text: string, params: unknown[] = []): Promise<T[]> {
    const client = new Client({ connectionString: this.url });
    await client.connect();
    try {
      const res = await client.query(text, params as unknown[]);
      return res.rows as T[];
    } finally {
      await client.end();
    }
  }

  async people(): Promise<CrmPerson[]> {
    return this.query(`select id, name, title from crm.people order by id`);
  }

  async deals(): Promise<CrmDeal[]> {
    const rows = await this.query<{ id: string; company: string; sector: string; stage: string; ask_usd: string | null }>(
      `select id, company, sector, stage, ask_usd from crm.deals order by id`);
    return rows.map((row) => ({ id: row.id, company: row.company, sector: row.sector, stage: row.stage, askUsd: row.ask_usd === null ? null : Number(row.ask_usd) }));
  }

  async meetings(): Promise<CrmMeeting[]> {
    const rows = await this.query<{ id: string; deal_id: string; title: string; starts_at: Date }>(
      `select id, deal_id, title, starts_at from crm.meetings order by id`);
    return rows.map((row) => ({ id: row.id, dealId: row.deal_id, title: row.title, startsAt: row.starts_at.toISOString() }));
  }

  async portfolio(): Promise<{ company: string; sector: string }[]> {
    return this.query(`select company, sector from crm.portfolio order by company`);
  }

  async documents(since: string | null): Promise<CrmDocument[]> {
    const rows = since === null || since === ''
      ? await this.query<{ id: string; deal_id: string | null; kind: string; title: string; created_at: Date; updated_at: Date; body: string | null; media_path: string | null }>(
        `select d.id, d.deal_id, d.kind, d.title, d.created_at, d.updated_at, b.body, b.media_path
         from crm.documents d left join crm.document_bodies b on b.document_id = d.id order by d.id`)
      : await this.query<{ id: string; deal_id: string | null; kind: string; title: string; created_at: Date; updated_at: Date; body: string | null; media_path: string | null }>(
        `select d.id, d.deal_id, d.kind, d.title, d.created_at, d.updated_at, b.body, b.media_path
         from crm.documents d left join crm.document_bodies b on b.document_id = d.id
         where d.updated_at > $1 order by d.id`, [since]);
    return rows.map((row) => ({
      id: row.id, dealId: row.deal_id, kind: row.kind, title: row.title,
      createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(),
      body: row.body, mediaPath: row.media_path,
    }));
  }

  async bodiesFor(ids: string[]): Promise<{ id: string; body: string | null; mediaPath: string | null }[]> {
    if (ids.length === 0) return [];
    const rows = await this.query<{ id: string; body: string | null; mediaPath: string | null }>(
      `select d.id, b.body, b.media_path as "mediaPath" from crm.documents d left join crm.document_bodies b on b.document_id = d.id
       where d.id = any($1)`, [ids]);
    return rows;
  }

  async documentIds(): Promise<string[]> {
    const rows = await this.query<{ id: string }>(`select id from crm.documents order by id`);
    return rows.map((row) => row.id);
  }

  async grants(): Promise<CrmGrant[]> {
    const rows = await this.query<{ document_id: string; grantee: string }>(
      `select document_id, grantee from crm.document_grants order by document_id, grantee`);
    return rows.map((row) => ({ documentId: row.document_id, grantee: row.grantee }));
  }

  async memberships(): Promise<CrmMembership[]> {
    const rows = await this.query<{ person_id: string; grantee: string }>(
      `select p.id as person_id, r.rolname as grantee
       from pg_auth_members m
       join pg_roles r on r.oid = m.roleid
       join pg_roles member on member.oid = m.member
       join crm.people p on p.db_role = member.rolname
       where r.rolname like '${this.prefix}\\_%' order by person_id, grantee`);
    return rows.map((row) => ({ personId: row.person_id, principal: granteePrincipal(row.grantee) }));
  }
}

export function fixtureCrmReader(snap: CrmSnapshot): CrmReader {
  const memberships: CrmMembership[] = [];
  for (const person of snap.people) {
    memberships.push({ personId: person.id, principal: 'all-staff' });
    if (person.role === 'Partner') memberships.push({ personId: person.id, principal: 'partners' });
  }
  for (const row of snap.dealTeam) memberships.push({ personId: row.personId, principal: 'deal-team:' + row.dealId });
  const grants: CrmGrant[] = [];
  for (const doc of snap.documents) for (const principal of doc.acl) {
    const grantee = principal === 'all-staff' ? 'dh_all_staff'
      : principal === 'partners' ? 'dh_partners'
      : principal.startsWith('deal-team:') ? 'dh_deal_team_' + principal.slice('deal-team:'.length)
      : principal.startsWith('legal-hold:') ? 'dh_legal_hold_' + principal.slice('legal-hold:'.length)
      : principal;
    grants.push({ documentId: doc.id, grantee });
  }
  const holds = new Set(snap.documents.filter((doc) => doc.acl.some((principal) => principal.startsWith('legal-hold:'))).map((doc) => doc.id));
  const bodies = new Map(snap.documents.map((doc) => [doc.id, { body: holds.has(doc.id) ? null : (doc.body ?? null), mediaPath: doc.mediaPath ?? null }]));
  return {
    people: async () => snap.people.map((person) => ({ id: person.id, name: person.name, title: person.role })),
    deals: async () => snap.deals.map((deal) => ({ ...deal })),
    meetings: async () => snap.meetings.map((meeting) => ({ ...meeting })),
    portfolio: async () => snap.portfolio.map((row) => ({ ...row })),
    documents: async (since: string | null) => since !== null ? [] : snap.documents.map((doc) => ({
      id: doc.id, dealId: doc.dealId ?? null, kind: doc.kind, title: doc.title,
      createdAt: doc.createdAt, updatedAt: doc.createdAt, body: holds.has(doc.id) ? null : (doc.body ?? null), mediaPath: doc.mediaPath ?? null,
    })),
    bodiesFor: async (ids: string[]) => ids.flatMap((id) => {
      const found = bodies.get(id);
      return found ? [{ id, ...found }] : [];
    }),
    documentIds: async () => snap.documents.map((doc) => doc.id),
    grants: async () => grants.map((grant) => ({ ...grant })),
    memberships: async () => memberships.map((row) => ({ ...row })),
  };
}

export class CrmConnector implements Connector {
  id = 'crm' as const;
  label = 'Fictional firm data';

  async documents(): Promise<ConnectorDocument[]> {
    return loadCrm().documents.map((doc) => ({
      id: doc.id,
      dealId: doc.dealId,
      kind: doc.kind,
      title: doc.title,
      createdAt: doc.createdAt,
      body: doc.body,
      mediaPath: doc.mediaPath,
      acl: doc.acl,
    }));
  }
}
