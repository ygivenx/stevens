import type { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { openProcessDb } from '../common/db.js';
import type { CrmSnapshot } from './connectors/crm.js';

let handle: DatabaseSync | null = null;

export function schemaFile(): string {
  return join(process.cwd(), 'server', 'firm', 'db', 'schema.sql');
}

export function getFirmDb(): DatabaseSync {
  if (!handle) handle = openProcessDb('firm.db', schemaFile());
  return handle;
}

export function closeFirmDb(): void {
  handle?.close();
  handle = null;
}

export function ensureMeetingAskHint(): void {
  const db = getFirmDb();
  const columns = db.prepare(`pragma table_info(meetings)`).all() as unknown as { name: string }[];
  if (!columns.some((column) => column.name === 'ask_hint')) {
    db.exec(`alter table meetings add column ask_hint text`);
  }
}

export function syncCrmSnapshot(snap: CrmSnapshot): void {
  const db = getFirmDb();
  ensureMeetingAskHint();
  db.exec('BEGIN');
  try {
    const upsertPerson = db.prepare(
      `insert into people (id, name, role, agent_token_sha256) values (?, ?, ?, null)
       on conflict(id) do update set name = excluded.name, role = excluded.role`,
    );
    for (const person of snap.people) upsertPerson.run(person.id, person.name, person.role);
    const upsertDeal = db.prepare(
      `insert into deals (id, company, sector, stage, ask_usd) values (?, ?, ?, ?, ?)
       on conflict(id) do update set company = excluded.company, sector = excluded.sector, stage = excluded.stage, ask_usd = excluded.ask_usd`,
    );
    for (const deal of snap.deals) upsertDeal.run(deal.id, deal.company, deal.sector, deal.stage, deal.askUsd);
    const joinTeam = db.prepare(`insert or ignore into deal_team (deal_id, person_id) values (?, ?)`);
    for (const row of snap.dealTeam) joinTeam.run(row.dealId, row.personId);
    const upsertMeeting = db.prepare(
      `insert into meetings (id, deal_id, title, starts_at, ask_hint) values (?, ?, ?, ?, ?)
       on conflict(id) do update set deal_id = excluded.deal_id, title = excluded.title, starts_at = excluded.starts_at, ask_hint = excluded.ask_hint`,
    );
    for (const meeting of snap.meetings) upsertMeeting.run(meeting.id, meeting.dealId, meeting.title, meeting.startsAt, meeting.askHint ?? null);
    const upsertPortfolio = db.prepare(
      `insert into portfolio (company, sector) values (?, ?)
       on conflict(company) do update set sector = excluded.sector`,
    );
    for (const row of snap.portfolio) upsertPortfolio.run(row.company, row.sector);
    db.exec('COMMIT');
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      void 0;
    }
    throw err;
  }
}

export interface FirmDocument {
  id: string;
  connector: string;
  dealId: string | null;
  kind: string;
  title: string;
  body: string | null;
  mediaPath: string | null;
  createdAt: string;
  sharedBy?: string | null;
}

export function upsertDocument(connector: string, doc: { id: string; dealId?: string; kind: string; title: string; createdAt: string; body?: string; mediaPath?: string }, acl: string[]): void {
  const db = getFirmDb();
  db.prepare(
    `insert into documents (id, connector, deal_id, kind, title, body, media_path, created_at)
     values (?, ?, ?, ?, ?, ?, ?, ?)
     on conflict(id) do update set connector = excluded.connector, deal_id = excluded.deal_id, kind = excluded.kind,
       title = excluded.title, body = excluded.body, media_path = excluded.media_path, created_at = excluded.created_at`,
  ).run(doc.id, connector, doc.dealId ?? null, doc.kind, doc.title, doc.body ?? null, doc.mediaPath ?? null, doc.createdAt);
  db.prepare(`delete from document_acl where document_id = ?`).run(doc.id);
  const grant = db.prepare(`insert into document_acl (document_id, principal) values (?, ?)`);
  for (const principal of acl) grant.run(doc.id, principal);
}

export function firmDocuments(dealId?: string): FirmDocument[] {
  const db = getFirmDb();
  const rows = (dealId
    ? db.prepare(`select id, connector, deal_id as dealId, kind, title, body, media_path as mediaPath, created_at as createdAt, shared_by as sharedBy from documents where deal_id = ? order by created_at`).all(dealId)
    : db.prepare(`select id, connector, deal_id as dealId, kind, title, body, media_path as mediaPath, created_at as createdAt, shared_by as sharedBy from documents order by created_at`).all()) as unknown as FirmDocument[];
  return rows;
}

export function documentAcl(documentId: string): string[] {
  const db = getFirmDb();
  const rows = db.prepare(`select principal from document_acl where document_id = ?`).all(documentId) as unknown as { principal: string }[];
  return rows.map((row) => row.principal);
}

export function documentBody(documentId: string, body: string): void {
  const db = getFirmDb();
  db.prepare(`update documents set body = ? where id = ?`).run(body, documentId);
}

export function syncFilings(filings: { accession: string; issuer: string; cik?: string; state: string; industryGroup: string; filedAt: string; firstSaleDate: string | null; totalOfferingUsd: number; totalSoldUsd: number }[]): void {
  const db = getFirmDb();
  const upsert = db.prepare(
    `insert into filings (accession, issuer, cik, state, industry_group, filed_at, first_sale_date, total_offering_usd, total_sold_usd)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?)
     on conflict(accession) do update set issuer = excluded.issuer, cik = excluded.cik, state = excluded.state, industry_group = excluded.industry_group,
       filed_at = excluded.filed_at, first_sale_date = excluded.first_sale_date, total_offering_usd = excluded.total_offering_usd, total_sold_usd = excluded.total_sold_usd`,
  );
  db.exec('BEGIN');
  try {
    for (const filing of filings) {
      upsert.run(filing.accession, filing.issuer, filing.cik ?? null, filing.state, filing.industryGroup, filing.filedAt, filing.firstSaleDate, filing.totalOfferingUsd, filing.totalSoldUsd);
    }
    db.exec('COMMIT');
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      void 0;
    }
    throw err;
  }
}

export interface ReleaseProvenance {
  title: string;
  origin: string;
  capturedAt: string;
  speaker?: string;
  at?: string;
}

export function saveReleaseProvenance(documentId: string, provenance: ReleaseProvenance): void {
  const db = getFirmDb();
  db.prepare(
    `insert into release_provenance (document_id, title, origin, captured_at, speaker, at)
     values (?, ?, ?, ?, ?, ?)
     on conflict(document_id) do update set title = excluded.title, origin = excluded.origin,
       captured_at = excluded.captured_at, speaker = excluded.speaker, at = excluded.at`,
  ).run(documentId, provenance.title, provenance.origin, provenance.capturedAt, provenance.speaker ?? null, provenance.at ?? null);
}

export function getReleaseProvenance(documentId: string): ReleaseProvenance | null {
  const db = getFirmDb();
  const row = db.prepare(
    `select title, origin, captured_at as capturedAt, speaker, at from release_provenance where document_id = ?`,
  ).get(documentId) as unknown as ReleaseProvenance | undefined;
  return row ?? null;
}

export function setConnectorState(connector: string, documents: number, lastSyncAt: string): void {
  ensureConnectorErrorAt();
  const db = getFirmDb();
  db.prepare(
    `insert into connector_state (connector, last_sync_at, documents, last_error, last_error_at) values (?, ?, ?, null, null)
     on conflict(connector) do update set last_sync_at = excluded.last_sync_at, documents = excluded.documents, last_error = null, last_error_at = null`,
  ).run(connector, lastSyncAt, documents);
}

export function ensureConnectorErrorAt(): void {
  const columns = getFirmDb().prepare(`pragma table_info(connector_state)`).all() as unknown as { name: string }[];
  if (!columns.some((column) => column.name === 'last_error_at')) {
    getFirmDb().exec(`alter table connector_state add column last_error_at text`);
  }
}

export function setConnectorError(connector: string, error: string, at: string): void {
  ensureConnectorErrorAt();
  const db = getFirmDb();
  db.prepare(
    `insert into connector_state (connector, last_sync_at, documents, last_error, last_error_at) values (?, null, 0, ?, ?)
     on conflict(connector) do update set last_error = excluded.last_error, last_error_at = excluded.last_error_at`,
  ).run(connector, error, at);
}

export function connectorError(connector: string): { message: string; at: string } | null {
  ensureConnectorErrorAt();
  const db = getFirmDb();
  const row = db.prepare(`select last_error as message, last_error_at as at from connector_state where connector = ?`).get(connector) as unknown as { message: string | null; at: string | null } | undefined;
  if (!row?.message) return null;
  return { message: row.message, at: row.at ?? '' };
}

export function ensureMemberships(): void {
  getFirmDb().exec(`create table if not exists memberships (
    person_id text not null references people(id),
    principal text not null,
    primary key (person_id, principal)
  )`);
}

export function syncMemberships(rows: { personId: string; principal: string }[]): void {
  ensureMemberships();
  const db = getFirmDb();
  db.exec('BEGIN');
  try {
    db.prepare(`delete from memberships`).run();
    const insert = db.prepare(`insert into memberships (person_id, principal) values (?, ?)`);
    for (const row of rows) insert.run(row.personId, row.principal);
    db.exec('COMMIT');
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      void 0;
    }
    throw err;
  }
}

export function isMember(personId: string, acl: string[]): boolean {
  ensureMemberships();
  const rows = getFirmDb().prepare(`select principal from memberships where person_id = ?`).all(personId) as unknown as { principal: string }[];
  const mine = new Set(rows.map((row) => row.principal));
  if (!acl.some((principal) => mine.has(principal))) return false;
  return acl.filter((principal) => principal.startsWith('legal-hold:')).every((principal) => mine.has(principal));
}

export function recipientFor(role: string, dealId: string): string | null {
  ensureMemberships();
  const db = getFirmDb();
  const team = db.prepare(
    `select p.id as id from people p join memberships m on m.person_id = p.id
     where p.role = ? and m.principal = ? order by p.id limit 1`,
  ).get(role, 'deal-team:' + dealId) as unknown as { id: string } | undefined;
  if (team) return team.id;
  const fallback = db.prepare(`select id from people where role = ? order by id limit 1`).get(role) as unknown as { id: string } | undefined;
  return fallback?.id ?? null;
}

export function syncDealTeam(rows: { dealId: string; personId: string }[]): void {
  const db = getFirmDb();
  db.exec('BEGIN');
  try {
    db.prepare(`delete from deal_team`).run();
    const insert = db.prepare(`insert into deal_team (deal_id, person_id) values (?, ?)`);
    for (const row of rows) insert.run(row.dealId, row.personId);
    db.exec('COMMIT');
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      void 0;
    }
    throw err;
  }
}

export function deleteDocument(documentId: string): void {
  const db = getFirmDb();
  db.prepare(`delete from document_acl where document_id = ?`).run(documentId);
  db.prepare(`delete from documents where id = ?`).run(documentId);
}

export function crmDocumentIds(): string[] {
  const rows = getFirmDb().prepare(`select id from documents where connector = 'crm'`).all() as unknown as { id: string }[];
  return rows.map((row) => row.id);
}
