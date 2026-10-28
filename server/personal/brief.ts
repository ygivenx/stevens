import type { Bridge, Claim, Draft, Source, Verdict } from '../../shared/data.js';
import { draftIdFor } from '../common/ids.js';
import { append, findCompleted, stageKey, PROMPT_VERSION } from '../common/ledger/store.js';
import { assemble } from '../common/boundary/assemble.js';
import { writeDraft, WONDER_MODEL, type Written } from '../common/meta/client.js';
import { resolveSentences } from '../common/resolver/resolve.js';
import { allPersonalClaims, personalSources } from './store.js';
import { ensureExtractedForTerms, queryTerms } from './extract.js';
import { firmShells, ownerRole, type FirmSlice } from './bridge.js';

export interface WriterDeps {
  writeFn?: (prompt: string, claims: Claim[], sources: Source[]) => Promise<Written>;
}

export function briefKey(dealId: string, claims: Claim[], sourceIds: string[]): string {
  const claimIds = [...new Set(claims.map((claim) => claim.id))].sort();
  return stageKey('brief', [dealId, ...claimIds, ...[...sourceIds].sort()], PROMPT_VERSION, WONDER_MODEL);
}

export async function writeMeetingBrief(dealId: string, company: string, slice: FirmSlice, bridges: Bridge[], deps: WriterDeps = {}): Promise<Draft> {
  const writeFn = deps.writeFn ?? writeDraft;
  const viewer = ownerRole();
  const shells = firmShells(slice);
  const mine = personalSources(viewer);
  const sources = [...mine, ...shells];
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const claims = [...allPersonalClaims(), ...slice.claims];
  const claimById = new Map(claims.map((claim) => [claim.id, claim]));
  const key = briefKey(dealId, claims, slice.sources.map((source) => source.id));
  const found = findCompleted(key);
  if (found && found.type === 'draft.created') return found.draft;
  const { prompt, manifest } = assemble('brief', viewer, WONDER_MODEL, key, sources, claims);
  const task = `${prompt}\n\nTask: write the pre-meeting brief for ${company} (deal ${dealId}). Every sentence needs at least one citation. Cite personal claims and firm claims by id. End with one suggested question phrased as an Inference from the cited claims.`;
  let written;
  try {
    written = await writeFn(task, claims, sources);
  } catch (err) {
    append({ at: new Date().toISOString(), type: 'attempt.failed', stageKey: key, model: WONDER_MODEL, error: err instanceof Error ? err.message : String(err) });
    throw err;
  }
  const resolved = resolveSentences(written.sentences, claimById, sourceById);
  const draft: Draft = {
    id: draftIdFor('br', key), kind: 'brief', dealId, viewerId: process.env.STEVENS_OWNER ?? 'p-alex', viewerRole: viewer,
    sentences: resolved.kept, droppedSentences: resolved.dropped, bridges,
    status: 'draft',
  };
  append({
    at: new Date().toISOString(), type: 'draft.created', draft, manifest,
    api: { model: WONDER_MODEL, responseId: written.responseId, usage: written.usage, stageKey: key },
  });
  return draft;
}

export async function writeAnswer(questionId: string, dealId: string, question: string, slice: FirmSlice, verdict: Verdict, deps: WriterDeps = {}): Promise<Draft> {
  const writeFn = deps.writeFn ?? writeDraft;
  await ensureExtractedForTerms(queryTerms(question)).catch(() => {});
  const viewer = ownerRole();
  const shells = firmShells(slice);
  const mine = personalSources(viewer);
  const sources = [...mine, ...shells];
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const claims = [...allPersonalClaims(), ...slice.claims];
  const claimById = new Map(claims.map((claim) => [claim.id, claim]));
  const key = stageKey('answer', [questionId], PROMPT_VERSION, WONDER_MODEL);
  const found = findCompleted(key);
  if (found && found.type === 'draft.created') return found.draft;
  const { prompt, manifest } = assemble('answer', viewer, WONDER_MODEL, key, sources, claims, verdict);
  const task = `${prompt}\n\nTask: answer this question about deal ${dealId}: ${question}. Every sentence needs at least one citation. Never reveal the contents of sources you cannot quote.`;
  let written;
  try {
    written = await writeFn(task, claims, sources);
  } catch (err) {
    append({ at: new Date().toISOString(), type: 'attempt.failed', stageKey: key, model: WONDER_MODEL, error: err instanceof Error ? err.message : String(err) });
    throw err;
  }
  const resolved = resolveSentences(written.sentences, claimById, sourceById);
  const draft: Draft = {
    id: draftIdFor('an', key), kind: 'answer', dealId, question, questionId, viewerId: process.env.STEVENS_OWNER ?? 'p-alex', viewerRole: viewer,
    sentences: resolved.kept, droppedSentences: resolved.dropped, verdict,
    status: 'draft',
  };
  append({
    at: new Date().toISOString(), type: 'draft.created', draft, manifest,
    api: { model: WONDER_MODEL, responseId: written.responseId, usage: written.usage, stageKey: key },
  });
  return draft;
}
