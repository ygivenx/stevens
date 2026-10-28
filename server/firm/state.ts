import type { Claim, Draft, Meeting, Origin, Person, Role, Source, SourceRef } from '../../shared/data.js';
import { readAll } from '../common/ledger/store.js';
import { nowIso } from '../common/clock.js';
import { policy } from '../common/boundary/policy.js';
import { getFirmDb } from './store.js';
import { classifyAcl, aclLabel, ACL_TABLE } from './connectors/acl-map.js';
import { connectorError, documentAcl, firmDocuments, getReleaseProvenance, isMember } from './store.js';
import { firmSourceFor } from './sync.js';
import { buildComps, loadFormD, marketSample } from './connectors/formd.js';

export interface FirmDeal {
  id: string;
  company: string;
  sector: string;
  stage: string;
  askUsd: number | null;
  team: Person[];
  meetings: Meeting[];
  documents: SourceRef[];
}

export type FirmInboxEntry =
  | { kind: 'escalation'; id: string; dealId: string; from: Person; at: string; decisionDraftId?: string }
  | { kind: 'released-quote'; id: string; dealId: string; from: Person; at: string; quote: string; provenance: { title: string; origin: Origin; capturedAt: string; speaker?: string; at?: string } };

export interface FirmMarket {
  quarter: string;
  issuers: number;
  medianOfferingUsd: number;
  sample: { issuer: string; filedAt: string; totalOfferingUsd: number; accession: string; secUrl: string }[];
}

export interface FirmState {
  viewer: Person;
  now: string;
  status: { line: string; busy: boolean };
  deals: FirmDeal[];
  inbox: FirmInboxEntry[];
  drafts: Draft[];
  claims: Claim[];
  market: FirmMarket[];
  connectors: { id: 'crm' | 'sec-form-d'; label: string; lastSyncAt: string | null; documents: number; simulated?: string; lastError?: { message: string; at: string } }[];
  aclMap: { principal: string; classification: 'team' | 'partner-only' | 'wall' }[];
  simulated: string[];
}

function peopleById(): Map<string, Person> {
  const db = getFirmDb();
  const rows = db.prepare(`select id, name, role from people`).all() as unknown as Person[];
  return new Map(rows.map((row) => [row.id, row]));
}

function personByRole(people: Map<string, Person>, role: Role): Person {
  for (const person of people.values()) {
    if (person.role === role) return person;
  }
  return { id: 'unknown', name: role === 'Partner' ? 'Morgan Hale' : 'Alex Rivera', role };
}

function teamForDeal(dealId: string, people: Map<string, Person>): Person[] {
  const db = getFirmDb();
  const rows = db.prepare(`select person_id as personId from deal_team where deal_id = ?`).all(dealId) as unknown as { personId: string }[];
  return rows.map((row) => people.get(row.personId)).filter((person): person is Person => person !== undefined);
}

function meetingsForDeal(dealId: string): Meeting[] {
  const db = getFirmDb();
  const rows = db.prepare(`select id, deal_id as dealId, title, starts_at as startsAt from meetings where deal_id = ? order by starts_at`).all(dealId) as unknown as Meeting[];
  return rows;
}

function draftStatus(draftId: string): Draft['status'] {
  let status: Draft['status'] = 'draft';
  for (const event of readAll()) {
    if (event.type === 'draft.approved' && event.draftId === draftId) status = 'approved';
    if (event.type === 'draft.rejected' && event.draftId === draftId) status = 'rejected';
  }
  return status;
}

function eventAt(predicate: (event: { type: string }) => boolean): string {
  let at = nowIso();
  for (const event of readAll()) {
    if (predicate(event as { type: string }) && (event as { at: string }).at > at) at = (event as { at: string }).at;
  }
  return at;
}

function clockShort(iso: string): string {
  const date = new Date(iso);
  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const suffix = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  if (hours === 0) hours = 12;
  return hours + ':' + minutes + ' ' + suffix;
}

export function viewerFromHeader(header: string | undefined): Person | null {
  if (!header) return null;
  const people = peopleById();
  return people.get(header) ?? null;
}

export function buildFirmState(viewer: Person): FirmState {
  const now = nowIso();
  const events = readAll();
  const people = peopleById();
  const db = getFirmDb();

  const dealRows = db.prepare(`select id, company, sector, stage, ask_usd as askUsd from deals order by company`).all() as unknown as { id: string; company: string; sector: string; stage: string; askUsd: number | null }[];
  const deals: FirmDeal[] = [];
  const visibleSourceIds = new Set<string>();
  const documentsById = new Map<string, SourceRef>();
  for (const deal of dealRows) {
    const documents: SourceRef[] = [];
    for (const doc of firmDocuments(deal.id)) {
      const acl = documentAcl(doc.id);
      const source = firmSourceFor(
        { id: doc.id, kind: doc.kind as Source['kind'], title: doc.title, createdAt: doc.createdAt, body: doc.body, mediaPath: doc.mediaPath },
        classifyAcl(acl).classification,
      );
      const decision = policy(source, viewer.role, 'brief', isMember(viewer.id, acl));
      if (decision.access !== 'visible') continue;
      visibleSourceIds.add(doc.id);
      const ref: SourceRef = {
        id: doc.id, vault: 'enterprise', kind: doc.kind as SourceRef['kind'], title: doc.title, capturedAt: doc.createdAt,
        connector: doc.connector === 'sec-form-d' ? 'sec-form-d' : 'crm',
        aclLabel: aclLabel(acl), access: 'visible', ruleId: decision.ruleId,
      };
      documents.push(ref);
      documentsById.set(doc.id, ref);
    }
    deals.push({
      id: deal.id, company: deal.company, sector: deal.sector, stage: deal.stage, askUsd: deal.askUsd,
      team: teamForDeal(deal.id, people), meetings: meetingsForDeal(deal.id), documents,
    });
  }

  const claims: Claim[] = [];
  for (const event of events) {
    if (event.type === 'claims.extracted' && !event.itemId && visibleSourceIds.has(event.sourceId)) {
      claims.push(...event.claims);
    }
  }

  const drafts: Draft[] = [];
  const decisionByQuestion = new Map<string, string>();
  for (const event of events) {
    if (event.type === 'draft.created' && event.draft.kind === 'decision') {
      if (viewer.role !== 'Partner') continue;
      if (!isMember(viewer.id, ['deal-team:' + event.draft.dealId])) continue;
      const status = draftStatus(event.draft.id);
      drafts.push({ ...event.draft, status });
      if (event.draft.questionId) decisionByQuestion.set(event.draft.questionId, event.draft.id);
    }
  }

  const inbox: FirmInboxEntry[] = [];
  const onTeam = (dealId: string): boolean => teamForDeal(dealId, people).some((member) => member.id === viewer.id);
  for (const event of events) {
    if (event.type === 'escalation.drafted' && event.escalationId && event.to === viewer.role) {
      const from = event.from ? people.get(event.from) ?? personByRole(people, 'Associate') : personByRole(people, 'Associate');
      const dealId = event.dealId ?? '';
      const seesDraft = dealId !== '' && isMember(viewer.id, ['deal-team:' + dealId]);
      inbox.push({
        kind: 'escalation', id: event.escalationId, dealId, from,
        at: event.at, decisionDraftId: event.questionId && seesDraft ? decisionByQuestion.get(event.questionId) : undefined,
      });
    }
    if (event.type === 'personal.released' && event.documentId && event.dealId) {
      if (!onTeam(event.dealId)) continue;
      const doc = firmDocuments().find((entry) => entry.id === event.documentId);
      if (!doc || !doc.body) continue;
      const provenance = getReleaseProvenance(event.documentId);
      const from = doc.sharedBy ? people.get(doc.sharedBy) ?? personByRole(people, 'Associate') : personByRole(people, 'Associate');
      inbox.push({
        kind: 'released-quote', id: event.documentId, dealId: event.dealId, from, at: event.at,
        quote: doc.body,
        provenance: {
          title: provenance?.title ?? doc.title,
          origin: (provenance?.origin as Origin | undefined) ?? 'glasses',
          capturedAt: provenance?.capturedAt ?? doc.createdAt,
          speaker: provenance?.speaker,
          at: provenance?.at,
        },
      });
    }
  }
  inbox.sort((a, b) => (a.at < b.at ? 1 : -1));

  const fixture = loadFormD();
  const comps = buildComps(fixture.filings);
  const market: FirmMarket[] = comps.map((entry) => ({
    quarter: entry.quarter,
    issuers: entry.issuers,
    medianOfferingUsd: entry.medianUsd,
    sample: marketSample(fixture.filings, entry.quarter),
  }));

  const connectorRows = db.prepare(`select connector, last_sync_at as lastSyncAt, documents from connector_state`).all() as unknown as { connector: string; lastSyncAt: string | null; documents: number }[];
  const connectorMeta: Record<string, { label: string; simulated?: string }> = {
    crm: { label: 'Fictional firm data' },
    'sec-form-d': { label: 'SEC Form D (public)' },
  };
  const connectors: FirmState['connectors'] = (['crm', 'sec-form-d'] as const).map((id) => {
    const row = connectorRows.find((entry) => entry.connector === id);
    const docs = id === 'crm' ? firmDocuments().filter((doc) => doc.connector === 'crm').length : firmDocuments().filter((doc) => doc.connector === 'sec-form-d').length;
    const error = connectorError(id);
    return {
      id, label: connectorMeta[id].label,
      lastSyncAt: row?.lastSyncAt ?? null, documents: row?.documents ?? docs,
      simulated: connectorMeta[id].simulated,
      ...(error ? { lastError: error } : {}),
    };
  });

  const error = connectorError('crm');
  const crmRow = connectorRows.find((entry) => entry.connector === 'crm');
  const status = process.env.STEVENS_REPLAY === '1'
    ? { line: 'Replaying a recorded run', busy: false }
    : error
      ? { line: 'CRM unreachable since ' + clockShort(error.at), busy: false }
      : { line: crmRow?.lastSyncAt ? 'Up to date · CRM synced ' + clockShort(crmRow.lastSyncAt) : 'CRM never synced', busy: false };
  return {
    viewer,
    now,
    status,
    deals,
    inbox,
    drafts,
    claims,
    market,
    connectors,
    aclMap: ACL_TABLE.map((entry) => ({ principal: entry.principal, classification: entry.classification })),
    simulated: ['Simulated sign-in'],
  };
}

export function firmTitles(): Map<string, string> {
  const titles = new Map<string, string>();
  for (const doc of firmDocuments()) titles.set(doc.id, doc.title);
  return titles;
}

export function latestDraftAt(): string {
  return eventAt((event) => event.type === 'draft.created');
}
