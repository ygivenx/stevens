import type { Claim, Draft, LedgerEvent, Role, Source, Verdict } from '../../../shared/data.js';
import { append, readAll, stageKey, PROMPT_VERSION } from '../ledger/store.js';
import { assemble } from '../boundary/assemble.js';
import { policy } from '../boundary/policy.js';
import { WONDER_MODEL, judgePrivy, writeDraft } from '../meta/client.js';
import { indexEvents } from '../boundary/filter.js';
import { dedupe, resolveSentences } from '../resolver/resolve.js';

export function matchPrivy(question: string, viewer: Role, claims: Claim[], sources: Map<string, Source>): Source[] {
  const visibleEntities = new Set<string>();
  for (const claim of claims) {
    const source = sources.get(claim.sourceId);
    if (source && policy(source, viewer, 'privy', true).access === 'visible') visibleEntities.add(claim.entity.toLowerCase());
  }
  const lowered = question.toLowerCase();
  const matched: Source[] = [];
  for (const source of sources.values()) {
    if (!source.text) continue;
    if (policy(source, viewer, 'privy', true).access !== 'privy') continue;
    const mine = [...claims.values()].filter((c) => c.sourceId === source.id);
    if (mine.some((c) => lowered.includes(c.entity.toLowerCase()) || visibleEntities.has(c.entity.toLowerCase()))) {
      matched.push(source);
    }
  }
  return matched;
}

function priorAnswer(events: LedgerEvent[], questionId: string, viewer: Role): { draft: Draft; verdict: Verdict } | null {
  let verdict: Verdict | null = null;
  for (const event of events) {
    if (event.type === 'privy.judged' && event.questionId === questionId) verdict = event.verdict;
  }
  for (const event of events) {
    if (event.type === 'draft.created' && event.draft.kind === 'answer' && event.draft.viewerRole === viewer && event.draft.question === questionId) {
      return verdict ? { draft: event.draft, verdict } : null;
    }
  }
  return null;
}

export async function runAsk(viewer: Role, question: string): Promise<{ draft: Draft; verdict: Verdict; escalated: boolean; reused: boolean }> {
  const questionId = 'q-' + stageKey('question', [question], PROMPT_VERSION, 'none').slice(0, 8);
  const events = readAll();
  const prior = priorAnswer(events, questionId, viewer);
  if (prior) return { ...prior, escalated: events.some((e) => e.type === 'escalation.drafted' && e.draftId === prior.draft.id), reused: true };
  const { claims, sources } = indexEvents(events);
  const allClaims = [...claims.values()];
  const matched = matchPrivy(question, viewer, allClaims, sources);
  const privyKey = stageKey('privy', [questionId], PROMPT_VERSION, WONDER_MODEL);
  const assembled = assemble('privy', viewer, WONDER_MODEL, privyKey, [...sources.values()].filter((s) => !!s.text), allClaims, undefined, () => true);
  let verdict: Verdict;
  let api: LedgerEvent & { type: 'privy.judged' };
  let failedClosed = false;
  if (matched.length === 0) {
    verdict = { verdict: 'proceed', routeTo: null };
    api = { at: '', type: 'privy.judged', questionId, verdict, manifest: assembled.manifest, failedClosed };
  } else {
    const task = `${assembled.prompt}\n\nTask: the question is "${question}". Weigh the restricted sources above on the viewer's behalf and reply with a verdict only: proceed, hold, or decline, plus where to route (Associate, Partner, or null). Never quote or describe the restricted sources.`;
    try {
      const judged = await judgePrivy(task);
      verdict = judged.verdict;
      api = { at: '', type: 'privy.judged', questionId, verdict, manifest: assembled.manifest, api: { model: WONDER_MODEL, responseId: judged.responseId, usage: judged.usage, stageKey: privyKey }, failedClosed };
    } catch {
      try {
        const judged = await judgePrivy(task);
        verdict = judged.verdict;
        api = { at: '', type: 'privy.judged', questionId, verdict, manifest: assembled.manifest, api: { model: WONDER_MODEL, responseId: judged.responseId, usage: judged.usage, stageKey: privyKey }, failedClosed };
      } catch (err) {
        failedClosed = true;
        verdict = { verdict: 'hold', routeTo: 'Partner' };
        append({ at: new Date().toISOString(), type: 'attempt.failed', stageKey: privyKey, model: WONDER_MODEL, error: err instanceof Error ? err.message : String(err) });
        api = { at: '', type: 'privy.judged', questionId, verdict, manifest: assembled.manifest, failedClosed };
      }
    }
  }
  append({ ...api, at: new Date().toISOString() });
  const answerKey = stageKey('answer', [questionId, viewer], PROMPT_VERSION, WONDER_MODEL);
  const allSources = [...sources.values()].filter((s) => !!s.text);
  const built = assemble('answer', viewer, WONDER_MODEL, answerKey, allSources, allClaims, verdict, () => true);
  const answerTask = `${built.prompt}\n\nTask: answer "${question}" for a ${viewer}. Every sentence carries at least one citation with verbatim Fact quotes. ${
    verdict.verdict === 'hold' ? 'Recommend holding until a Partner reviews, without hinting at what the restricted sources contain.' : 'Answer directly from the visible record.'
  }`;
  let written;
  try {
    written = await writeDraft(answerTask, allClaims, allSources);
  } catch {
    try {
      written = await writeDraft(answerTask, allClaims, allSources);
    } catch (err) {
      append({ at: new Date().toISOString(), type: 'attempt.failed', stageKey: answerKey, model: WONDER_MODEL, error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  }
  const { kept, dropped } = resolveSentences(written.sentences, claims, sources);
  for (const sentence of kept) sentence.citations = dedupe(sentence.citations);
  const draft: Draft = {
    id: 'answer-' + questionId, kind: 'answer', question: questionId, viewerRole: viewer,
    sentences: kept, droppedSentences: dropped, verdict, status: 'draft',
  };
  append({
    at: new Date().toISOString(), type: 'draft.created', draft, manifest: built.manifest,
    api: { model: WONDER_MODEL, responseId: written.responseId, usage: written.usage, stageKey: answerKey },
  });
  let escalated = false;
  if (verdict.routeTo) {
    append({ at: new Date().toISOString(), type: 'escalation.drafted', draftId: draft.id, to: verdict.routeTo });
    escalated = true;
  }
  return { draft, verdict, escalated, reused: false };
}
