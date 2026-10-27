import type { Draft, Verdict } from '../../shared/data.js';
import { append, readAll } from '../common/ledger/store.js';
import { firmContext, firmPrivy } from './firm-client.js';
import { writeAnswer } from './brief.js';
import type { FirmSlice } from './bridge.js';
import { escalateWithRetry, verdictForQuestion } from './triggers.js';
import { questionIdFor } from '../common/ids.js';

export interface AskDeps {
  privyFn?: (dealId: string, question: string, extra: { questionId: string }) => Promise<{ questionId: string; verdict: Verdict; failedClosed: boolean }>;
  contextFn?: (dealId: string, purpose: 'answer') => Promise<FirmSlice>;
}

export interface AskResult {
  questionId: string;
  draft: Draft;
  verdict: Verdict;
  failedClosed: boolean;
  escalation: 'sent' | 'queued' | 'none';
  firmReachable: boolean;
}

function existingAnswer(questionId: string): Draft | null {
  for (const event of readAll()) {
    if (event.type === 'draft.created' && event.draft.kind === 'answer' && event.draft.questionId === questionId) return event.draft;
  }
  return null;
}

export async function askQuestion(dealId: string, question: string, deps: AskDeps = {}): Promise<AskResult> {
  const questionId = questionIdFor(dealId, question);
  const prior = existingAnswer(questionId);
  if (prior && prior.verdict) {
    return { questionId, draft: prior, verdict: prior.verdict, failedClosed: false, escalation: 'none', firmReachable: true };
  }
  const privyFn = deps.privyFn ?? firmPrivy;
  const contextFn = deps.contextFn ?? firmContext;
  let verdict: Verdict = { verdict: 'hold', routeTo: 'Partner' };
  let failedClosed = false;
  let firmReachable = true;
  const stored = verdictForQuestion(questionId);
  if (stored) {
    verdict = stored;
  } else {
    try {
      const privy = await privyFn(dealId, question, { questionId });
      verdict = privy.verdict as Verdict;
      failedClosed = privy.failedClosed;
    } catch {
      firmReachable = false;
      verdict = { verdict: 'hold', routeTo: 'Partner' };
    }
    append({ at: new Date().toISOString(), type: 'verdict.received', questionId, dealId, verdict, failedClosed });
  }
  let slice: FirmSlice = { sources: [], claims: [] };
  if (firmReachable) {
    try {
      slice = await contextFn(dealId, 'answer');
    } catch {
      firmReachable = false;
    }
  }
  const draft = await writeAnswer(questionId, dealId, question, slice, verdict);
  let escalation: 'sent' | 'queued' | 'none' = 'none';
  if (verdict.verdict !== 'proceed' && verdict.routeTo) {
    escalation = await escalateWithRetry(questionId, dealId, verdict.routeTo);
  }
  return { questionId, draft, verdict, failedClosed, escalation, firmReachable };
}
