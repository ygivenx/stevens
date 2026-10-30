import type { Claim, Draft, Meeting, Origin, Person, Role, ScenarioDev, ScenarioDisplay, Source, SourceRef } from '../../shared/data.js';
import { readAll } from '../common/ledger/store.js';
import { nowIso } from '../common/clock.js';
import { policy } from '../common/boundary/policy.js';
import { devBlock } from '../common/scenarios.js';
import { getFirmDb } from './store.js';
import { classifyAcl, aclLabel, ACL_TABLE } from './connectors/acl-map.js';
import { connectorError, connectorState, documentAcl, ensureMeetingAskHint, firmDocuments, getReleaseProvenance, isMember } from './store.js';
import { firmSourceFor } from './sync.js';
import { scenarioDisplay } from './connectors/crm.js';
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
  people: Person[];
  display: ScenarioDisplay;
  simulated: string[];
  dev?: ScenarioDev;
}

async function peopleById(display: ScenarioDisplay): Promise<Map<string, Person>> {
  const db = await getFirmDb();
  const rows = await db.all<{ id: string; name: string; role: Role }>(`select id, name, role from people`);
  return new Map(rows.map((row) => [row.id, { ...row, title: display.roleTitles[row.role] ?? row.role }]));
}

function personByRole(people: Map<string, Person>, role: Role, display: ScenarioDisplay): Person {
  for (const person of people.values()) {
    if (person.role === role) return person;
  }
  const title = display.roleTitles[role] ?? role;
  return { id: 'unknown', name: 'The ' + title.charAt(0).toLowerCase() + title.slice(1), role, title };
}

async function teamForDeal(dealId: string, people: Map<string, Person>): Promise<Person[]> {
  const db = await getFirmDb();
  const rows = await db.all<{ personId: string }>(`select person_id as "personId" from deal_team where deal_id = $1`, dealId);
  return rows.map((row) => people.get(row.personId)).filter((person): person is Person => person !== undefined);
}

async function meetingsForDeal(dealId: string): Promise<Meeting[]> {
  const db = await getFirmDb();
  await ensureMeetingAskHint();
  return db.all<Meeting>(
    `select id, deal_id as "dealId", title, starts_at as "startsAt", ask_hint as "askHint" from meetings where deal_id = $1 order by starts_at`,
    dealId,
  );
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

export async function viewerFromHeader(header: string | undefined): Promise<Person | null> {
  if (!header) return null;
  const people = await peopleById(scenarioDisplay());
  return people.get(header) ?? null;
}

export async function buildFirmState(viewer: Person): Promise<FirmState> {
  const now = nowIso();
  const events = readAll();
  const display = scenarioDisplay();
  const people = await peopleById(display);
  const db = await getFirmDb();

  const dealRows = await db.all<{ id: string; company: string; sector: string; stage: string; askUsd: number | null }>(
    `select id, company, sector, stage, ask_usd as "askUsd" from deals order by company`,
  );
  const deals: FirmDeal[] = [];
  const visibleSourceIds = new Set<string>();
  const documentsById = new Map<string, SourceRef>();
  for (const deal of dealRows) {
    const documents: SourceRef[] = [];
    for (const doc of await firmDocuments(deal.id)) {
      const acl = await documentAcl(doc.id);
      const source = firmSourceFor(
        { id: doc.id, kind: doc.kind as Source['kind'], title: doc.title, createdAt: doc.createdAt, body: doc.body, mediaPath: doc.mediaPath },
        classifyAcl(acl).classification,
      );
      const decision = policy(source, viewer.role, 'brief', await isMember(viewer.id, acl));
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
      team: await teamForDeal(deal.id, people), meetings: await meetingsForDeal(deal.id), documents,
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
      if (!(await isMember(viewer.id, ['deal-team:' + event.draft.dealId]))) continue;
      const status = draftStatus(event.draft.id);
      drafts.push({ ...event.draft, status });
      if (event.draft.questionId) decisionByQuestion.set(event.draft.questionId, event.draft.id);
    }
  }

  const inbox: FirmInboxEntry[] = [];
  const onTeam = async (dealId: string): Promise<boolean> => (await teamForDeal(dealId, people)).some((member) => member.id === viewer.id);
  for (const event of events) {
    if (event.type === 'escalation.drafted' && event.escalationId && event.to === viewer.role) {
      const from = event.from ? people.get(event.from) ?? personByRole(people, 'Associate', display) : personByRole(people, 'Associate', display);
      const dealId = event.dealId ?? '';
      const seesDraft = dealId !== '' && (await isMember(viewer.id, ['deal-team:' + dealId]));
      inbox.push({
        kind: 'escalation', id: event.escalationId, dealId, from,
        at: event.at, decisionDraftId: event.questionId && seesDraft ? decisionByQuestion.get(event.questionId) : undefined,
      });
    }
    if (event.type === 'personal.released' && event.documentId && event.dealId) {
      if (!(await onTeam(event.dealId))) continue;
      const doc = (await firmDocuments()).find((entry) => entry.id === event.documentId);
      if (!doc || !doc.body) continue;
      const provenance = await getReleaseProvenance(event.documentId);
      const from = doc.sharedBy ? people.get(doc.sharedBy) ?? personByRole(people, 'Associate', display) : personByRole(people, 'Associate', display);
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

  const connectorRows = await connectorState();
  const connectorMeta: Record<string, { label: string; simulated?: string }> = {
    crm: { label: display.firmDataLabel },
    'sec-form-d': { label: 'SEC Form D (public)' },
  };
  const connectorIds = fixture.filings.length > 0 ? (['crm', 'sec-form-d'] as const) : (['crm'] as const);
  const allDocs = await firmDocuments();
  const connectors: FirmState['connectors'] = [];
  for (const id of connectorIds) {
    const row = connectorRows.find((entry) => entry.connector === id);
    const docs = allDocs.filter((doc) => doc.connector === id).length;
    const entryError = await connectorError(id);
    connectors.push({
      id, label: connectorMeta[id].label,
      lastSyncAt: row?.lastSyncAt ?? null, documents: row?.documents ?? docs,
      simulated: connectorMeta[id].simulated,
      ...(entryError ? { lastError: entryError } : {}),
    });
  }

  const error = await connectorError('crm');
  const crmRow = connectorRows.find((entry) => entry.connector === 'crm');
  const status = process.env.STEVENS_REPLAY === '1'
    ? { line: 'Replaying a recorded run', busy: false }
    : error
      ? { line: 'CRM unreachable since ' + clockShort(error.at), busy: false }
      : { line: crmRow?.lastSyncAt ? 'Up to date · CRM synced ' + clockShort(crmRow.lastSyncAt) : 'CRM never synced', busy: false };
  const dev = devBlock();
  return {
    viewer: people.get(viewer.id) ?? viewer,
    now,
    status,
    deals,
    inbox,
    drafts,
    claims,
    market,
    connectors,
    aclMap: ACL_TABLE.map((entry) => ({ principal: entry.principal, classification: entry.classification })),
    people: [...people.values()],
    display,
    simulated: ['Simulated sign-in'],
    ...(dev ? { dev } : {}),
  };
}

export async function firmTitles(): Promise<Map<string, string>> {
  const titles = new Map<string, string>();
  for (const doc of await firmDocuments()) titles.set(doc.id, doc.title);
  return titles;
}

export function latestDraftAt(): string {
  return eventAt((event) => event.type === 'draft.created');
}
