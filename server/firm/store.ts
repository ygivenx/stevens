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

export function syncCrmSnapshot(snap: CrmSnapshot): void {
  const db = getFirmDb();
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
      `insert into meetings (id, deal_id, title, starts_at) values (?, ?, ?, ?)
       on conflict(id) do update set deal_id = excluded.deal_id, title = excluded.title, starts_at = excluded.starts_at`,
    );
    for (const meeting of snap.meetings) upsertMeeting.run(meeting.id, meeting.dealId, meeting.title, meeting.startsAt);
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
    ? db.prepare(`select id, connector, deal_id as dealId, kind, title, body, media_path as mediaPath, created_at as createdAt from documents where deal_id = ? order by created_at`).all(dealId)
    : db.prepare(`select id, connector, deal_id as dealId, kind, title, body, media_path as mediaPath, created_at as createdAt from documents order by created_at`).all()) as unknown as FirmDocument[];
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

export function setConnectorState(connector: string, documents: number, lastSyncAt: string): void {
  const db = getFirmDb();
  db.prepare(
    `insert into connector_state (connector, last_sync_at, documents, last_error) values (?, ?, ?, null)
     on conflict(connector) do update set last_sync_at = excluded.last_sync_at, documents = excluded.documents, last_error = null`,
  ).run(connector, lastSyncAt, documents);
}
