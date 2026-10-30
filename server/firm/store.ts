import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { dataDir } from '../common/ledger/store.js';
import { closeStore, columnExists, openStore, type StoreDb } from '../common/store-db.js';
import type { CrmSnapshot } from './connectors/crm.js';

const here = dirname(fileURLToPath(import.meta.url));

export function schemaFile(): string {
  return join(here, 'db', 'schema.sql');
}

export function pgSchemaFile(): string {
  return join(here, 'db', 'schema.pg.sql');
}

export function dbPath(): string {
  return join(dataDir(), 'firm.db');
}

export function getFirmDb(): Promise<StoreDb> {
  return openStore('firm', {
    url: process.env.FIRM_DATABASE_URL,
    file: dbPath(),
    schema: readFileSync(schemaFile(), 'utf8'),
    pgSchema: readFileSync(pgSchemaFile(), 'utf8'),
  });
}

export function closeFirmDb(): Promise<void> {
  return closeStore('firm');
}

export async function ensureMeetingAskHint(): Promise<void> {
  const db = await getFirmDb();
  if (!(await columnExists(db, 'meetings', 'ask_hint'))) {
    await db.exec(`alter table meetings add column ask_hint text`);
  }
}

export async function ensureConnectorErrorAt(): Promise<void> {
  const db = await getFirmDb();
  if (!(await columnExists(db, 'connector_state', 'last_error_at'))) {
    await db.exec(`alter table connector_state add column last_error_at text`);
  }
}

export async function ensureMemberships(): Promise<void> {
  const db = await getFirmDb();
  await db.exec(`create table if not exists memberships (
    person_id text not null references people(id),
    principal text not null,
    primary key (person_id, principal)
  )`);
}

export async function syncCrmSnapshot(snap: CrmSnapshot): Promise<void> {
  const db = await getFirmDb();
  await ensureMeetingAskHint();
  await db.withTransaction(async (tx) => {
    for (const person of snap.people) {
      await tx.run(
        `insert into people (id, name, role, agent_token_sha256) values ($1, $2, $3, null)
         on conflict(id) do update set name = excluded.name, role = excluded.role`,
        person.id, person.name, person.role,
      );
    }
    for (const deal of snap.deals) {
      await tx.run(
        `insert into deals (id, company, sector, stage, ask_usd) values ($1, $2, $3, $4, $5)
         on conflict(id) do update set company = excluded.company, sector = excluded.sector, stage = excluded.stage, ask_usd = excluded.ask_usd`,
        deal.id, deal.company, deal.sector, deal.stage, deal.askUsd,
      );
    }
    for (const row of snap.dealTeam) {
      await tx.run(
        `insert into deal_team (deal_id, person_id) values ($1, $2) on conflict do nothing`,
        row.dealId, row.personId,
      );
    }
    for (const meeting of snap.meetings) {
      await tx.run(
        `insert into meetings (id, deal_id, title, starts_at, ask_hint) values ($1, $2, $3, $4, $5)
         on conflict(id) do update set deal_id = excluded.deal_id, title = excluded.title, starts_at = excluded.starts_at, ask_hint = excluded.ask_hint`,
        meeting.id, meeting.dealId, meeting.title, meeting.startsAt, meeting.askHint ?? null,
      );
    }
    for (const row of snap.portfolio) {
      await tx.run(
        `insert into portfolio (company, sector) values ($1, $2)
         on conflict(company) do update set sector = excluded.sector`,
        row.company, row.sector,
      );
    }
  });
}

export async function syncDealTeam(rows: { dealId: string; personId: string }[]): Promise<void> {
  const db = await getFirmDb();
  await db.withTransaction(async (tx) => {
    await tx.run(`delete from deal_team`);
    for (const row of rows) {
      await tx.run(`insert into deal_team (deal_id, person_id) values ($1, $2)`, row.dealId, row.personId);
    }
  });
}

export async function syncMemberships(rows: { personId: string; principal: string }[]): Promise<void> {
  const db = await getFirmDb();
  await ensureMemberships();
  await db.withTransaction(async (tx) => {
    await tx.run(`delete from memberships`);
    for (const row of rows) {
      await tx.run(`insert into memberships (person_id, principal) values ($1, $2)`, row.personId, row.principal);
    }
  });
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

export async function upsertDocument(connector: string, doc: { id: string; dealId?: string; kind: string; title: string; createdAt: string; body?: string; mediaPath?: string }, acl: string[]): Promise<void> {
  const db = await getFirmDb();
  await db.withTransaction(async (tx) => {
    await tx.run(
      `insert into documents (id, connector, deal_id, kind, title, body, media_path, created_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       on conflict(id) do update set connector = excluded.connector, deal_id = excluded.deal_id, kind = excluded.kind,
         title = excluded.title, body = excluded.body, media_path = excluded.media_path, created_at = excluded.created_at`,
      doc.id, connector, doc.dealId ?? null, doc.kind, doc.title, doc.body ?? null, doc.mediaPath ?? null, doc.createdAt,
    );
    await tx.run(`delete from document_acl where document_id = $1`, doc.id);
    for (const principal of acl) {
      await tx.run(`insert into document_acl (document_id, principal) values ($1, $2)`, doc.id, principal);
    }
  });
}

export async function deleteDocument(documentId: string): Promise<void> {
  const db = await getFirmDb();
  await db.run(`delete from document_acl where document_id = $1`, documentId);
  await db.run(`delete from documents where id = $1`, documentId);
}

export async function documentAcl(documentId: string): Promise<string[]> {
  const db = await getFirmDb();
  const rows = await db.all<{ principal: string }>(`select principal from document_acl where document_id = $1`, documentId);
  return rows.map((row) => row.principal);
}

export async function documentBody(documentId: string, body: string): Promise<void> {
  const db = await getFirmDb();
  await db.run(`update documents set body = $1 where id = $2`, body, documentId);
}

export async function crmDocumentIds(): Promise<string[]> {
  const db = await getFirmDb();
  const rows = await db.all<{ id: string }>(`select id from documents where connector = 'crm'`);
  return rows.map((row) => row.id);
}

export async function firmDocuments(dealId?: string): Promise<FirmDocument[]> {
  const db = await getFirmDb();
  if (dealId) {
    return db.all<FirmDocument>(
      `select id, connector, deal_id as "dealId", kind, title, body, media_path as "mediaPath", created_at as "createdAt",
              shared_by as "sharedBy" from documents where deal_id = $1 order by created_at`,
      dealId,
    );
  }
  return db.all<FirmDocument>(
    `select id, connector, deal_id as "dealId", kind, title, body, media_path as "mediaPath", created_at as "createdAt",
            shared_by as "sharedBy" from documents order by created_at`,
  );
}

export async function isMember(personId: string, acl: string[]): Promise<boolean> {
  await ensureMemberships();
  const db = await getFirmDb();
  const rows = await db.all<{ principal: string }>(`select principal from memberships where person_id = $1`, personId);
  const mine = new Set(rows.map((row) => row.principal));
  if (!acl.some((principal) => mine.has(principal))) return false;
  return acl.filter((principal) => principal.startsWith('legal-hold:')).every((principal) => mine.has(principal));
}

export async function recipientFor(role: string, dealId: string): Promise<string | null> {
  await ensureMemberships();
  const db = await getFirmDb();
  const team = await db.get<{ id: string }>(
    `select p.id as id from people p join memberships m on m.person_id = p.id
     where p.role = $1 and m.principal = $2 order by p.id limit 1`,
    role, 'deal-team:' + dealId,
  );
  if (team) return team.id;
  const fallback = await db.get<{ id: string }>(`select id from people where role = $1 order by id limit 1`, role);
  return fallback?.id ?? null;
}

export async function connectorState(): Promise<{ connector: string; lastSyncAt: string | null; documents: number }[]> {
  const db = await getFirmDb();
  return db.all<{ connector: string; lastSyncAt: string | null; documents: number }>(
    `select connector, last_sync_at as "lastSyncAt", documents from connector_state`,
  );
}

export async function setConnectorState(connector: string, documents: number, lastSyncAt: string): Promise<void> {
  await ensureConnectorErrorAt();
  const db = await getFirmDb();
  await db.run(
    `insert into connector_state (connector, last_sync_at, documents, last_error, last_error_at) values ($1, $2, $3, null, null)
     on conflict(connector) do update set last_sync_at = excluded.last_sync_at, documents = excluded.documents,
       last_error = null, last_error_at = null`,
    connector, lastSyncAt, documents,
  );
}

export async function connectorError(connector: string): Promise<{ message: string; at: string } | null> {
  const db = await getFirmDb();
  await ensureConnectorErrorAt();
  const row = await db.get<{ last_error: string | null; last_error_at: string | null }>(
    `select last_error, last_error_at from connector_state where connector = $1`, connector,
  );
  if (!row?.last_error) return null;
  return { message: row.last_error, at: row.last_error_at ?? '' };
}

export async function setConnectorError(connector: string, message: string, at: string): Promise<void> {
  const db = await getFirmDb();
  await ensureConnectorErrorAt();
  await db.run(
    `insert into connector_state (connector, last_sync_at, documents, last_error, last_error_at) values ($1, null, 0, $2, $3)
     on conflict(connector) do update set last_error = excluded.last_error, last_error_at = excluded.last_error_at`,
    connector, message, at,
  );
}

export async function syncFilings(filings: { accession: string; issuer: string; cik?: string; state: string; industryGroup: string; filedAt: string; firstSaleDate: string | null; totalOfferingUsd: number; totalSoldUsd: number }[]): Promise<void> {
  const db = await getFirmDb();
  await db.withTransaction(async (tx) => {
    for (const filing of filings) {
      await tx.run(
        `insert into filings (accession, issuer, cik, state, industry_group, filed_at, first_sale_date, total_offering_usd, total_sold_usd)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         on conflict(accession) do update set issuer = excluded.issuer, cik = excluded.cik, state = excluded.state, industry_group = excluded.industry_group,
           filed_at = excluded.filed_at, first_sale_date = excluded.first_sale_date, total_offering_usd = excluded.total_offering_usd, total_sold_usd = excluded.total_sold_usd`,
        filing.accession, filing.issuer, filing.cik ?? null, filing.state, filing.industryGroup, filing.filedAt, filing.firstSaleDate,
        filing.totalOfferingUsd, filing.totalSoldUsd,
      );
    }
  });
}

export interface ReleaseProvenance {
  title: string;
  origin: string;
  capturedAt: string;
  speaker?: string;
  at?: string;
}

export async function saveReleaseProvenance(documentId: string, provenance: ReleaseProvenance): Promise<void> {
  const db = await getFirmDb();
  await db.run(
    `insert into release_provenance (document_id, title, origin, captured_at, speaker, at) values ($1, $2, $3, $4, $5, $6)
     on conflict(document_id) do update set title = excluded.title, origin = excluded.origin, captured_at = excluded.captured_at,
       speaker = excluded.speaker, at = excluded.at`,
    documentId, provenance.title, provenance.origin, provenance.capturedAt, provenance.speaker ?? null, provenance.at ?? null,
  );
}

export async function getReleaseProvenance(documentId: string): Promise<ReleaseProvenance | null> {
  const db = await getFirmDb();
  const row = await db.get<ReleaseProvenance>(
    `select title, origin, captured_at as "capturedAt", speaker, at from release_provenance where document_id = $1`, documentId,
  );
  return row ?? null;
}
