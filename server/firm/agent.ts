import { join } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import type { Claim, Purpose, Source, SourceRef } from '../../shared/data.js';
import { append, readAll } from '../common/ledger/store.js';
import { policy } from '../common/boundary/policy.js';
import { nowMs } from '../common/clock.js';
import type { AgentPerson } from './agent-auth.js';
import { personForToken } from './agent-auth.js';
import { getFirmDb } from './store.js';
import { classifyAcl, aclLabel } from './connectors/acl-map.js';
import { documentAcl, ensureMeetingAskHint, firmDocuments, isMember } from './store.js';
import { scenarioDisplay } from './connectors/crm.js';
import type { ScenarioDisplay } from '../../shared/data.js';
import { firmSourceFor } from './sync.js';

const AGENT_PURPOSES: Purpose[] = ['bridge', 'brief', 'answer'];

export function agentFromHeader(header: string | undefined): Promise<AgentPerson | null> {
  return personForToken(header);
}

export interface AgentMeeting {
  id: string;
  dealId: string;
  company: string;
  title: string;
  startsAt: string;
  askHint?: string;
  team: { id: string; name: string; role: string }[];
}

export function agentMeta(): { display: ScenarioDisplay } {
  return { display: scenarioDisplay() };
}

export async function agentMeetings(person: AgentPerson, withinHours: number): Promise<AgentMeeting[]> {
  const db = await getFirmDb();
  await ensureMeetingAskHint();
  const cutoff = nowMs() + withinHours * 3600 * 1000;
  const rows = await db.all<Omit<AgentMeeting, 'team'>>(
    `select m.id as id, m.deal_id as "dealId", d.company as company, m.title as title, m.starts_at as "startsAt",
      m.ask_hint as "askHint"
     from meetings m join deals d on d.id = m.deal_id
     join deal_team t on t.deal_id = m.deal_id
     where t.person_id = $1 order by m.starts_at`,
    person.id,
  );
  const teamByDeal = new Map<string, { id: string; name: string; role: string }[]>();
  const teamRows = await db.all<{ dealId: string; id: string; name: string; role: string }>(
    `select t.deal_id as "dealId", p.id as id, p.name as name, p.role as role
     from deal_team t join people p on p.id = t.person_id`,
  );
  for (const row of teamRows) {
    const list = teamByDeal.get(row.dealId) ?? [];
    list.push({ id: row.id, name: row.name, role: row.role });
    teamByDeal.set(row.dealId, list);
  }
  return rows
    .filter((row) => Date.parse(row.startsAt) > nowMs() && Date.parse(row.startsAt) <= cutoff)
    .map((row) => ({ ...row, team: teamByDeal.get(row.dealId) ?? [] }));
}

export interface AgentContext {
  sources: SourceRef[];
  claims: Claim[];
}

export async function agentContext(person: AgentPerson, dealId: string, purpose: Purpose): Promise<AgentContext> {
  const docs = await firmDocuments(dealId);
  const sources: SourceRef[] = [];
  const visibleIds = new Set<string>();
  for (const doc of docs) {
    const acl = await documentAcl(doc.id);
    const source = firmSourceFor({ id: doc.id, kind: doc.kind as Source['kind'], title: doc.title, createdAt: doc.createdAt, body: doc.body, mediaPath: doc.mediaPath }, classifyAcl(acl).classification);
    const decision = policy(source, person.role, purpose, await isMember(person.id, acl));
    if (decision.access !== 'visible') continue;
    visibleIds.add(doc.id);
    sources.push({
      id: doc.id, vault: 'enterprise', kind: doc.kind as SourceRef['kind'], title: doc.title, capturedAt: doc.createdAt,
      connector: 'crm', aclLabel: aclLabel(acl), access: 'visible', ruleId: decision.ruleId,
    });
  }
  const claims: Claim[] = [];
  for (const event of readAll()) {
    if (event.type === 'claims.extracted' && !event.itemId && visibleIds.has(event.sourceId)) {
      claims.push(...event.claims);
    }
  }
  append({ at: new Date().toISOString(), type: 'context.served', personId: person.id, dealId, purpose, sourceIds: sources.map((s) => s.id) });
  return { sources, claims };
}

const MEDIA_TYPES: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.txt': 'text/plain' };

function fixturesDir(): string {
  return process.env.STEVENS_FIXTURES_DIR ?? join(process.cwd(), 'fixtures');
}

export async function agentMedia(person: AgentPerson, sourceId: string): Promise<{ bytes: Buffer; contentType: string } | null> {
  const docs = (await firmDocuments()).filter((doc) => doc.id === sourceId);
  if (docs.length === 0 || !docs[0].mediaPath) return null;
  const doc = docs[0];
  const acl = await documentAcl(doc.id);
  const source = firmSourceFor({ id: doc.id, kind: doc.kind as Source['kind'], title: doc.title, createdAt: doc.createdAt, body: doc.body, mediaPath: doc.mediaPath }, classifyAcl(acl).classification);
  if (policy(source, person.role, 'brief', await isMember(person.id, acl)).access !== 'visible') return null;
  const path = join(fixturesDir(), doc.mediaPath as string);
  if (!existsSync(path)) return null;
  const ext = '.' + (doc.mediaPath as string).split('.').pop()?.toLowerCase();
  return { bytes: readFileSync(path), contentType: MEDIA_TYPES[ext] ?? 'application/octet-stream' };
}

export function isAgentPurpose(value: string): value is Purpose {
  return (AGENT_PURPOSES as string[]).includes(value);
}
