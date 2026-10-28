import type { Claim, Source, Usage, Verdict } from '../../shared/data.js';
import { append, findCompleted, readAll, stageKey, PROMPT_VERSION } from '../common/ledger/store.js';
import { assemble } from '../common/boundary/assemble.js';
import { policy } from '../common/boundary/policy.js';
import { judgePrivy, WONDER_MODEL } from '../common/meta/client.js';
import { classifyAcl } from './connectors/acl-map.js';
import { documentAcl, firmDocuments, isMember } from './store.js';
import { firmSourceFor } from './sync.js';
import type { AgentPerson } from './agent-auth.js';

export interface PrivyDeps {
  privyFn?: (prompt: string) => Promise<{ verdict: Verdict; responseId: string; usage: Usage }>;
}



export function privySourcesFor(person: AgentPerson, dealId: string): { sources: Source[]; claims: Claim[] } {
  const sources: Source[] = [];
  const ids = new Set<string>();
  for (const doc of firmDocuments(dealId)) {
    const acl = documentAcl(doc.id);
    const source = firmSourceFor(
      { id: doc.id, kind: doc.kind as Source['kind'], title: doc.title, createdAt: doc.createdAt, body: doc.body, mediaPath: doc.mediaPath },
      classifyAcl(acl).classification,
    );
    if (policy(source, person.role, 'privy', isMember(person.id, acl)).access !== 'privy') continue;
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

export interface PrivyResult {
  questionId: string;
  verdict: Verdict;
  failedClosed: boolean;
}

export async function runPrivy(person: AgentPerson, dealId: string, question: string, request: { questionId: string }, deps: PrivyDeps = {}): Promise<PrivyResult> {
  const privyFn = deps.privyFn ?? judgePrivy;
  const questionId = request.questionId;
  for (const event of readAll()) {
    if (event.type === 'privy.judged' && event.questionId === questionId) {
      return { questionId, verdict: event.verdict, failedClosed: event.failedClosed };
    }
  }
  const key = stageKey('privy', [questionId], PROMPT_VERSION, WONDER_MODEL);
  if (findCompleted(key)) {
    for (const event of readAll()) {
      if (event.type === 'privy.judged' && event.api?.stageKey === key) {
        return { questionId, verdict: event.verdict, failedClosed: event.failedClosed };
      }
    }
  }
  const { sources, claims } = privySourcesFor(person, dealId);
  const { prompt, manifest } = assemble('privy', person.role, WONDER_MODEL, key, sources, claims, undefined, (source) => isMember(person.id, documentAcl(source.id)));
  const task = `${prompt}\n\nTask: the user asks about deal ${dealId}: ${question}. Reply with exactly a verdict (proceed, hold, decline) and where to route it (Associate, Partner, or null). Return nothing else.`;
  let attempts = 0;
  let result: { verdict: Verdict; responseId: string; usage: Usage } | null = null;
  const errors: string[] = [];
  while (attempts < 2 && !result) {
    attempts += 1;
    try {
      result = await privyFn(task);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  if (!result) {
    const verdict: Verdict = { verdict: 'hold', routeTo: 'Partner' };
    const key2 = stageKey('privy-failed', [questionId], PROMPT_VERSION, WONDER_MODEL);
    append({
      at: new Date().toISOString(), type: 'privy.judged', questionId, dealId, personId: person.id,
      verdict, manifest, failedClosed: true,
    });
    append({ at: new Date().toISOString(), type: 'attempt.failed', stageKey: key2, model: WONDER_MODEL, error: errors.join(' | ') || 'privy failed' });
    return { questionId, verdict, failedClosed: true };
  }
  append({
    at: new Date().toISOString(), type: 'privy.judged', questionId, dealId, personId: person.id,
    verdict: result.verdict, manifest,
    api: { model: WONDER_MODEL, responseId: result.responseId, usage: result.usage, stageKey: key },
    failedClosed: false,
  });
  return { questionId, verdict: result.verdict, failedClosed: false };
}
