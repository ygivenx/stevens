import { join } from 'node:path';
import type { Claim, LedgerEvent, Source } from '../../shared/data.js';
import { append, findCompleted, readAll, stageKey, PROMPT_VERSION } from '../common/ledger/store.js';
import { extractClaims, extractModel, readImage, visionModel } from '../common/meta/client.js';
import { quoteIn } from '../common/resolver/resolve.js';
import { scenarioStores } from '../common/scenarios.js';
import { nowIso } from '../common/clock.js';
import { PgCrmReader, fixtureCrmReader, granteePrincipal, loadCrm, type CrmReader } from './connectors/crm.js';
import { SecFormDConnector, loadFormD } from './connectors/formd.js';
import type { ConnectorDocument } from './connectors/connector.js';
import {
  crmDocumentIds, deleteDocument, documentAcl, documentBody, ensureMeetingAskHint, ensureMemberships, firmDocuments, getFirmDb,
  saveReleaseProvenance, setConnectorError, setConnectorState, syncCrmSnapshot, syncDealTeam, syncFilings, syncMemberships, upsertDocument,
} from './store.js';

export const FIRM_VERBATIM_PROMPT = 'Transcribe every word visible in this photo verbatim, in reading order. Return only the transcribed text.';

export interface SyncDeps {
  readImageFn?: typeof readImage;
  extractFn?: typeof extractClaims;
  reader?: CrmReader;
}

function fixturesDir(): string {
  return process.env.STEVENS_FIXTURES_DIR ?? join(process.cwd(), 'fixtures');
}

export function defaultReader(): CrmReader {
  const url = process.env.FIRM_DATABASE_URL;
  if (!url) throw new Error('FIRM_DATABASE_URL is not set');
  return new PgCrmReader(url, scenarioStores().prefix);
}

export function testReader(): CrmReader {
  return fixtureCrmReader(loadCrm());
}

function lastCursor(): string | null {
  let cursor: string | null = null;
  for (const event of readAll()) {
    if (event.type === 'connector.synced' && (cursor === null || event.cursor > cursor)) cursor = event.cursor;
  }
  return cursor;
}

function extractedDocIds(): Set<string> {
  const ids = new Set<string>();
  for (const event of readAll()) {
    if (event.type === 'claims.extracted' && !event.itemId) ids.add(event.sourceId);
  }
  return ids;
}

async function visionBody(doc: ConnectorDocument, deps: SyncDeps): Promise<{ body: string; model: string; responseId: string; usage: { inputTokens?: number; outputTokens?: number; audioSeconds?: number; costUsd: number } }> {
  const readImageFn = deps.readImageFn ?? readImage;
  const path = join(fixturesDir(), doc.mediaPath as string);
  const result = await readImageFn(path, FIRM_VERBATIM_PROMPT);
  if (typeof result.text !== 'string' || result.text.trim().length === 0) throw new Error('vision text failed validation');
  return { body: result.text, model: visionModel, responseId: result.responseId, usage: result.usage };
}

function aclFor(documentId: string, grants: { documentId: string; grantee: string }[]): string[] {
  return grants.filter((grant) => grant.documentId === documentId).map((grant) => granteePrincipal(grant.grantee)).sort();
}

function stable(row: unknown): string {
  if (Array.isArray(row)) return '[' + row.map(stable).join(',') + ']';
  if (row !== null && typeof row === 'object') {
    return '{' + Object.keys(row as Record<string, unknown>).sort().map((key) => JSON.stringify(key) + ':' + stable((row as Record<string, unknown>)[key])).join(',') + '}';
  }
  return JSON.stringify(row) ?? 'null';
}

function changedById<T extends { id: string }>(fresh: T[], current: T[]): T[] {
  const seen = new Map(current.map((row) => [row.id, stable(row)]));
  return fresh.filter((row) => seen.get(row.id) !== stable(row));
}

export async function runConnectorSync(deps: SyncDeps = {}): Promise<{ documents: number; extracted: number; crmError?: string }> {
  const reader = deps.reader ?? (() => { try { return defaultReader(); } catch { return null; } })();
  let crmError: string | undefined;
  let docs: ConnectorDocument[] = [];
  if (!reader) {
    crmError = 'FIRM_DATABASE_URL is not set';
    await setConnectorError('crm', crmError, nowIso());
  } else {
    try {
      await ensureMeetingAskHint();
      const cursor = lastCursor();
      const [people, deals, readerMeetings, portfolio, changed, ids, grants, memberships] = await Promise.all([
        reader.people(), reader.deals(), reader.meetings(), reader.portfolio(),
        reader.documents(cursor), reader.documentIds(), reader.grants(), reader.memberships(),
      ]);
      const hintById = new Map(loadCrm().meetings.map((meeting) => [meeting.id, meeting.askHint]));
      const meetings = readerMeetings.map((meeting) => ({ ...meeting, askHint: meeting.askHint ?? hintById.get(meeting.id) }));
      const db = await getFirmDb();
      const currentPeople = await db.all<{ id: string; name: string; title: string }>(`select id, name, role as title from people`);
      const currentDeals = await db.all<{ id: string; company: string; sector: string; stage: string; askUsd: number | null }>(
        `select id, company, sector, stage, ask_usd as "askUsd" from deals`,
      );
      const currentMeetings = await db.all<{ id: string; dealId: string; title: string; startsAt: string; askHint?: string }>(
        `select id, deal_id as "dealId", title, starts_at as "startsAt", ask_hint as "askHint" from meetings`,
      );
      const changedIds = new Set(changed.map((doc) => doc.id));
      for (const id of ids) {
        const now = aclFor(id, grants);
        const before = await documentAcl(id);
        if (JSON.stringify(now) !== JSON.stringify([...before].sort())) changedIds.add(id);
      }
      const known = new Set(changed.map((doc) => doc.id));
      const refetch = [...changedIds].filter((id) => !known.has(id));
      const refetched = await reader.bodiesFor(refetch);
      const refetchById = new Map(refetched.map((row) => [row.id, row]));
      const changedDocs = changed.map((doc) => ({ ...doc, acl: aclFor(doc.id, grants) }));
      for (const id of refetch) {
        const body = refetchById.get(id);
        const row = await db.get<{ id: string; dealId: string | null; kind: string; title: string; createdAt: string }>(
          `select id, deal_id as "dealId", kind, title, created_at as "createdAt" from documents where id = $1`, id,
        );
        if (body && row) changedDocs.push({ ...row, updatedAt: cursor ?? '', body: body.body, mediaPath: body.mediaPath, acl: aclFor(id, grants) });
      }
      const deleted = (await crmDocumentIds()).filter((id) => !ids.includes(id));
      const nextCursor = changed.reduce((max, doc) => (doc.updatedAt > max ? doc.updatedAt : max), cursor ?? '');
      const peopleChanged = changedById(people, currentPeople);
      const dealsChanged = changedById(deals, currentDeals);
      const meetingsChanged = changedById(meetings, currentMeetings);
      const currentDocs = (await firmDocuments()).filter((doc) => doc.connector === 'crm');
      const currentGrants: string[] = [];
      for (const doc of currentDocs) {
        for (const principal of await documentAcl(doc.id)) currentGrants.push(doc.id + '|' + principal);
      }
      currentGrants.sort();
      const freshGrants = grants.map((grant) => grant.documentId + '|' + granteePrincipal(grant.grantee)).sort();
      await ensureMemberships();
      const currentMemberships = await db.all<{ personId: string; principal: string }>(`select person_id as "personId", principal from memberships`);
      const membershipsChanged = JSON.stringify([...currentMemberships].sort((a, b) => (a.personId + a.principal < b.personId + b.principal ? -1 : 1)))
        !== JSON.stringify([...memberships].sort((a, b) => (a.personId + a.principal < b.personId + b.principal ? -1 : 1)));
      const anythingChanged = peopleChanged.length + dealsChanged.length + meetingsChanged.length + changedDocs.length + deleted.length > 0
        || JSON.stringify(currentGrants) !== JSON.stringify(freshGrants) || membershipsChanged;
      if (anythingChanged) {
        append({
          at: new Date().toISOString(), type: 'connector.synced', connector: 'crm', cursor: nextCursor,
          upserted: {
            people,
            deals,
            meetings,
            documents: changedDocs.map((doc) => ({
              id: doc.id, dealId: doc.dealId, kind: doc.kind, title: doc.title, createdAt: doc.createdAt,
              body: doc.body, mediaPath: doc.mediaPath, acl: doc.acl,
            })),
          },
          deletedDocumentIds: deleted,
          grants: grants.map((grant) => ({ ...grant })),
          memberships: memberships.map((row) => ({ ...row })),
          portfolio,
        });
      }
      await syncCrmSnapshot({
        people: people.map((person) => ({ id: person.id, name: person.name, role: person.title })),
        deals,
        dealTeam: [],
        meetings,
        documents: [],
        portfolio,
      });
      await syncDealTeam(memberships.filter((row) => row.principal.startsWith('deal-team:')).map((row) => ({ dealId: row.principal.slice('deal-team:'.length), personId: row.personId })));
      await syncMemberships(memberships);
      for (const doc of changedDocs) {
        await upsertDocument('crm', { id: doc.id, dealId: doc.dealId ?? undefined, kind: doc.kind, title: doc.title, createdAt: doc.createdAt, body: doc.body ?? undefined, mediaPath: doc.mediaPath ?? undefined }, doc.acl);
      }
      for (const id of deleted) await deleteDocument(id);
      const total = await db.get<{ n: number }>(`select count(*) as n from documents where connector = 'crm'`);
      await setConnectorState('crm', Number(total?.n ?? 0), nowIso());
      docs = changedDocs.map((doc) => ({
        id: doc.id, dealId: doc.dealId ?? undefined, kind: doc.kind as ConnectorDocument['kind'], title: doc.title,
        createdAt: doc.createdAt, body: doc.body ?? undefined, mediaPath: doc.mediaPath ?? undefined, acl: doc.acl,
      }));
      const missing = (await firmDocuments()).filter((doc) => doc.connector === 'crm' && !docs.some((changedDoc) => changedDoc.id === doc.id));
      for (const doc of missing) {
        docs.push({
          id: doc.id, dealId: doc.dealId ?? undefined, kind: doc.kind as ConnectorDocument['kind'], title: doc.title,
          createdAt: doc.createdAt, body: doc.body ?? undefined, mediaPath: doc.mediaPath ?? undefined, acl: await documentAcl(doc.id),
        });
      }
    } catch (err) {
      crmError = err instanceof Error ? err.message : String(err);
      await setConnectorError('crm', crmError, nowIso());
    }
  }
  const done = extractedDocIds();
  let extracted = 0;
  for (const doc of docs) {
    let body = doc.body;
    if (!body && doc.mediaPath) {
      const key = stageKey('connector-doc', [doc.id], PROMPT_VERSION, visionModel);
      const seen = readAll().find((event) => event.type === 'source.ingested' && event.source.id === doc.id);
      if (!seen) {
        try {
          const vision = await visionBody(doc, deps);
          body = vision.body;
          await documentBody(doc.id, body);
          append({
            at: new Date().toISOString(), type: 'source.ingested',
            source: { id: doc.id, vault: 'enterprise', title: doc.title, capturedAt: doc.createdAt, kind: doc.kind, fixture: doc.mediaPath ?? '', text: body, classification: 'team' },
            api: { model: vision.model, responseId: vision.responseId, usage: vision.usage, stageKey: key },
          });
        } catch (err) {
          append({ at: new Date().toISOString(), type: 'attempt.failed', stageKey: key, model: visionModel, error: err instanceof Error ? err.message : String(err) });
          continue;
        }
      } else if (seen.type === 'source.ingested' && seen.source.text) {
        body = seen.source.text;
        await documentBody(doc.id, body);
      }
    }
    if (!body) continue;
    if (done.has(doc.id)) continue;
    const key = stageKey('extract', [doc.id], PROMPT_VERSION, extractModel);
    if (findCompleted(key)) continue;
    const extractFn = deps.extractFn ?? extractClaims;
    let attempt = await extractFn(doc.id, body);
    if (!attempt.claims.every((raw) => quoteIn(raw.quote, body as string))) {
      attempt = await extractFn(doc.id, body);
    }
    if (!attempt.claims.every((raw) => quoteIn(raw.quote, body as string))) {
      append({ at: new Date().toISOString(), type: 'attempt.failed', stageKey: key, model: extractModel, error: 'extracted quotes failed validation', usage: attempt.usage });
      continue;
    }
    const claims: Claim[] = attempt.claims.map((raw, index) => ({
      id: doc.id + '-c' + index, sourceId: doc.id, entity: raw.entity,
      metric: raw.metric ?? undefined, value: raw.value ?? undefined, quote: raw.quote,
    }));
    append({
      at: new Date().toISOString(), type: 'claims.extracted', sourceId: doc.id, claims,
      api: { model: extractModel, responseId: attempt.responseId, usage: attempt.usage, stageKey: key },
    });
    extracted += claims.length;
  }
  const formd = new SecFormDConnector();
  const fixture = loadFormD();
  await syncFilings(fixture.filings);
  const compsDocs = await formd.documents();
  for (const doc of compsDocs) {
    await upsertDocument(formd.id, doc, doc.acl);
    if (done.has(doc.id)) continue;
    const key = stageKey('extract', [doc.id], PROMPT_VERSION, 'code');
    if (findCompleted(key)) continue;
    const body = doc.body as string;
    const claims: Claim[] = [{ id: doc.id + '-c0', sourceId: doc.id, entity: 'market', quote: body }];
    append({
      at: new Date().toISOString(), type: 'claims.extracted', sourceId: doc.id, claims,
      api: { model: 'code', responseId: 'code:' + key, usage: { costUsd: 0 }, stageKey: key },
    });
    extracted += claims.length;
  }
  await setConnectorState(formd.id, compsDocs.length, nowIso());
  return { documents: docs.length + compsDocs.length, extracted, ...(crmError ? { crmError } : {}) };
}

export async function ensureFirmDb(events: LedgerEvent[]): Promise<{ rebuilt: boolean }> {
  const db = await getFirmDb();
  const count = await db.get<{ n: number }>(`select count(*) as n from documents`);
  if (Number(count?.n ?? 0) > 0) return { rebuilt: false };
  let synced = false;
  for (const event of events) {
    if (event.type === 'connector.synced') {
      synced = true;
      await syncCrmSnapshot({
        people: event.upserted.people.map((person) => ({ id: person.id, name: person.name, role: person.title })),
        deals: event.upserted.deals,
        dealTeam: [],
        meetings: event.upserted.meetings,
        documents: [],
        portfolio: event.portfolio,
      });
      await syncDealTeam(event.memberships.filter((row) => row.principal.startsWith('deal-team:')).map((row) => ({ dealId: row.principal.slice('deal-team:'.length), personId: row.personId })));
      await syncMemberships(event.memberships);
      for (const doc of event.upserted.documents) {
        await upsertDocument('crm', { id: doc.id, dealId: doc.dealId ?? undefined, kind: doc.kind, title: doc.title, createdAt: doc.createdAt, body: doc.body ?? undefined, mediaPath: doc.mediaPath ?? undefined }, doc.acl);
      }
      for (const id of event.deletedDocumentIds) await deleteDocument(id);
      const total = await db.get<{ n: number }>(`select count(*) as n from documents where connector = 'crm'`);
      await setConnectorState('crm', Number(total?.n ?? 0), event.at);
    } else if (event.type === 'source.ingested' && event.source.vault === 'enterprise' && event.source.text) {
      await documentBody(event.source.id, event.source.text);
    } else if (event.type === 'personal.released' && event.document) {
      const doc = event.document;
      await upsertDocument('release', { id: doc.id, dealId: doc.dealId, kind: doc.kind, title: doc.title, createdAt: doc.createdAt, body: doc.body }, doc.acl);
      if (event.sharedBy) await db.run(`update documents set shared_by = $1 where id = $2`, event.sharedBy, doc.id);
      if (event.provenance) await saveReleaseProvenance(doc.id, { title: event.provenance.title, origin: event.provenance.origin, capturedAt: event.provenance.capturedAt, speaker: event.provenance.speaker, at: event.provenance.at });
    }
  }
  if (!synced) return { rebuilt: false };
  const fixture = loadFormD();
  await syncFilings(fixture.filings);
  const formd = new SecFormDConnector();
  const comps = await formd.documents();
  for (const doc of comps) await upsertDocument(formd.id, doc, doc.acl);
  await setConnectorState(formd.id, comps.length, nowIso());
  return { rebuilt: true };
}

export function firmSourceFor(doc: { id: string; kind: Source['kind']; title: string; createdAt: string; body?: string | null; mediaPath?: string | null }, classification: Source['classification']): Source {
  return {
    id: doc.id, vault: 'enterprise', title: doc.title, capturedAt: doc.createdAt, kind: doc.kind,
    fixture: doc.mediaPath ?? '', text: doc.body ?? undefined, classification,
  };
}
