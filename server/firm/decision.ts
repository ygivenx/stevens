import { createHash } from 'node:crypto';
import type { Claim, Draft, Role, Source, Verdict } from '../../shared/data.js';
import { append, findCompleted, readAll, stageKey, PROMPT_VERSION } from '../common/ledger/store.js';
import { assemble } from '../common/boundary/assemble.js';
import { policy } from '../common/boundary/policy.js';
import { writeDraft, WONDER_MODEL, type Written } from '../common/meta/client.js';
import { resolveSentences } from '../common/resolver/resolve.js';
import { classifyAcl } from './connectors/acl-map.js';
import { documentAcl, firmDocuments, getFirmDb, isMember, recipientFor } from './store.js';
import { scenarioDisplay } from './connectors/crm.js';
import { firmSourceFor } from './sync.js';
import { draftIdFor } from '../common/ids.js';

export interface DecisionDeps {
  writeFn?: (prompt: string, claims: Claim[], sources: Source[]) => Promise<Written>;
}

export async function decisionSources(to: Role, dealId: string, toPerson: string | null): Promise<{ sources: Source[]; claims: Claim[] }> {
  const sources: Source[] = [];
  const ids = new Set<string>();
  for (const doc of await firmDocuments()) {
    if (doc.dealId !== null && doc.dealId !== dealId) continue;
    const acl = await documentAcl(doc.id);
    const source = firmSourceFor(
      { id: doc.id, kind: doc.kind as Source['kind'], title: doc.title, createdAt: doc.createdAt, body: doc.body, mediaPath: doc.mediaPath },
      classifyAcl(acl).classification,
    );
    const member = toPerson !== null && (await isMember(toPerson, acl));
    if (policy(source, to, 'decision', member).access !== 'visible') continue;
    sources.push(source);
    ids.add(doc.id);
  }
  const claims: Claim[] = [];
  for (const event of readAll()) {
    if (event.type === 'claims.extracted' && !event.itemId && ids.has(event.sourceId)) {
      claims.push(...event.claims);
    }
  }
  return { sources, claims };
}

export async function draftDecision(questionId: string, dealId: string, to: Role, question: string | undefined, deps: DecisionDeps = {}, toPerson: string | null = null): Promise<Draft> {
  const writeFn = deps.writeFn ?? writeDraft;
  const key = stageKey('decision', [questionId], PROMPT_VERSION, WONDER_MODEL);
  const found = findCompleted(key);
  if (found && found.type === 'draft.created') return found.draft;
  const { sources, claims } = await decisionSources(to, dealId, toPerson);
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const claimById = new Map(claims.map((claim) => [claim.id, claim]));
  const memberById = new Map<string, boolean>();
  for (const source of sources) {
    memberById.set(source.id, toPerson !== null && (await isMember(toPerson, await documentAcl(source.id))));
  }
  const { prompt, manifest } = assemble('decision', to, WONDER_MODEL, key, sources, claims, undefined, (source) => memberById.get(source.id) ?? false);
  const task = `${prompt}\n\nTask: draft the ${to} decision for deal ${dealId}${question ? ' on the question: ' + question : ''}. Every sentence needs at least one citation. Recommend proceed, hold, or decline with the reason the cited sources support.`;
  let written;
  try {
    written = await writeFn(task, claims, sources);
  } catch (err) {
    append({ at: new Date().toISOString(), type: 'attempt.failed', stageKey: key, model: WONDER_MODEL, error: err instanceof Error ? err.message : String(err) });
    throw err;
  }
  const resolved = resolveSentences(written.sentences, claimById, sourceById);
  const draft: Draft = {
    id: draftIdFor('dc', key), kind: 'decision', dealId, question, questionId, viewerId: '', viewerRole: to,
    sentences: resolved.kept, droppedSentences: resolved.dropped,
    status: 'draft',
  };
  append({
    at: new Date().toISOString(), type: 'draft.created', draft, manifest,
    api: { model: WONDER_MODEL, responseId: written.responseId, usage: written.usage, stageKey: key },
  });
  return draft;
}

export function verdictForEscalation(questionId: string): { verdict: Verdict; dealId: string; personId: string } | null {
  for (const event of readAll()) {
    if (event.type === 'privy.judged' && event.questionId === questionId && event.dealId && event.personId) {
      return { verdict: event.verdict, dealId: event.dealId, personId: event.personId };
    }
  }
  return null;
}

export async function recipientName(recipientId: string | null): Promise<string | null> {
  if (!recipientId) return null;
  const db = await getFirmDb();
  const row = await db.get<{ name: string }>(`select name from people where id = $1`, recipientId);
  return row?.name ?? null;
}

export async function draftEscalation(fromId: string, dealId: string, questionId: string, question: string | undefined, deps: DecisionDeps = {}): Promise<{ escalationId: string; to: Role; toName: string | null; reviewerNoun: string }> {
  const noun = scenarioDisplay().reviewerNoun;
  for (const event of readAll()) {
    if (event.type === 'escalation.drafted' && event.questionId === questionId && event.escalationId && event.to) {
      return { escalationId: event.escalationId, to: event.to, toName: await recipientName(await recipientFor(event.to, event.dealId ?? '')), reviewerNoun: noun };
    }
  }
  const judged = verdictForEscalation(questionId);
  if (!judged || judged.verdict.verdict === 'proceed' || !judged.verdict.routeTo) {
    throw new Error('nothing to escalate for ' + questionId);
  }
  const to = judged.verdict.routeTo;
  const recipient = await recipientFor(to, dealId);
  await draftDecision(questionId, dealId, to, question, deps, recipient);
  const escalationId = 'es-' + createHash('sha256').update(questionId).digest('hex').slice(0, 12);
  append({ at: new Date().toISOString(), type: 'escalation.drafted', escalationId, questionId, dealId, from: fromId, to });
  return { escalationId, to, toName: await recipientName(recipient), reviewerNoun: noun };
}
