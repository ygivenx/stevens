import type { Claim, Segment } from '../../shared/data.js';
import { append, readAll, findCompleted, stageKey, PROMPT_VERSION } from '../common/ledger/store.js';
import { nowIso } from '../common/clock.js';
import { extractClaims, extractModel, type TranscriptTurn } from '../common/meta/client.js';
import { quoteIn } from '../common/resolver/resolve.js';
import { atLabel } from './normalize/audio.js';
import { getDb, getItemBundle, searchSegments, writeClaims } from './store.js';

export interface ExtractDeps {
  extractFn?: typeof extractClaims;
}

export function dailyTokenCap(): number {
  const parsed = Number(process.env.STEVENS_DAILY_TOKENS ?? '3000000');
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 3000000;
}

export function extractInputTokensToday(): number {
  const today = nowIso().slice(0, 10);
  let total = 0;
  for (const event of readAll()) {
    if (event.at.slice(0, 10) !== today) continue;
    if (event.type === 'claims.extracted') total += event.api.usage.inputTokens ?? 0;
    else if (event.type === 'attempt.failed' && event.model === extractModel) total += event.usage?.inputTokens ?? 0;
  }
  return total;
}

export function pendingExtractionIds(): string[] {
  const extracted = extractedItemIds();
  const failed = failedStageKeys();
  const db = getDb();
  const rows = db.prepare(
    `select i.id as id from items i where i.status not in ('superseded', 'removed', 'failed')
     and exists (select 1 from segments s where s.item_id = i.id)`,
  ).all() as unknown as { id: string }[];
  return rows.map((row) => row.id).filter((id) => {
    if (extracted.has(id)) return false;
    return !failed.has(stageKey('extract', [id], PROMPT_VERSION, extractModel));
  });
}

export function extractionPaused(): boolean {
  if (extractInputTokensToday() < dailyTokenCap()) return false;
  return pendingExtractionIds().length > 0;
}

export function extractedItemIds(): Set<string> {
  const ids = new Set<string>();
  for (const event of readAll()) {
    if (event.type === 'claims.extracted' && event.itemId) ids.add(event.itemId);
  }
  return ids;
}

export function failedStageKeys(): Set<string> {
  const keys = new Set<string>();
  for (const event of readAll()) {
    if (event.type === 'attempt.failed') keys.add(event.stageKey);
  }
  return keys;
}

function turnsFor(segments: Segment[]): TranscriptTurn[] {
  return segments.map((segment, index) => ({
    turnId: index,
    startMs: segment.startMs ?? 0,
    endMs: segment.endMs ?? segment.startMs ?? 0,
    transcript: segment.text,
    speaker: segment.speaker ? segment.speaker.replace('Speaker ', '') : '',
  }));
}

function segmentForQuote(segments: Segment[], quote: string): Segment | undefined {
  return segments.find((segment) => quoteIn(quote, segment.text));
}

export async function extractItem(itemId: string, deps: ExtractDeps = {}): Promise<{ claims: number; reused: boolean; paused?: boolean }> {
  if (extractedItemIds().has(itemId)) return { claims: 0, reused: true };
  const key = stageKey('extract', [itemId], PROMPT_VERSION, extractModel);
  if (findCompleted(key) || failedStageKeys().has(key)) return { claims: 0, reused: true };
  if (extractInputTokensToday() >= dailyTokenCap()) return { claims: 0, reused: true, paused: true };
  const bundle = getItemBundle(itemId);
  if (!bundle || bundle.segments.length === 0) return { claims: 0, reused: true };
  const extractFn = deps.extractFn ?? extractClaims;
  const text = bundle.segments.map((segment) => segment.text).join('\n\n');
  let attempt = await extractFn(itemId, text, turnsFor(bundle.segments)).catch((err: unknown) => {
    append({ at: new Date().toISOString(), type: 'attempt.failed', stageKey: key, model: extractModel, error: err instanceof Error ? err.message : String(err) });
    throw err;
  });
  if (!attempt.claims.every((raw) => segmentForQuote(bundle.segments, raw.quote))) {
    attempt = await extractFn(itemId, text, turnsFor(bundle.segments));
  }
  const unmatched = attempt.claims.filter((raw) => !segmentForQuote(bundle.segments, raw.quote));
  if (unmatched.length > 0) {
    append({ at: new Date().toISOString(), type: 'attempt.failed', stageKey: key, model: extractModel, error: 'extracted quotes failed verbatim validation', usage: attempt.usage });
    throw new Error('extraction failed validation for ' + itemId);
  }
  const short = itemId.replace(/^it-/, '').slice(0, 8);
  const claims: Claim[] = attempt.claims.map((raw, index) => {
    const segment = segmentForQuote(bundle.segments, raw.quote) as Segment;
    return {
      id: 'cl-' + short + '-' + index,
      sourceId: itemId,
      segmentId: segment.id,
      entity: raw.entity,
      metric: raw.metric ?? undefined,
      value: raw.value ?? undefined,
      quote: raw.quote,
      at: segment.startMs != null ? atLabel(segment.startMs) : undefined,
      speaker: segment.speaker ?? undefined,
      startMs: segment.startMs ?? undefined,
      endMs: segment.endMs ?? undefined,
    };
  });
  append({
    at: new Date().toISOString(), type: 'claims.extracted', sourceId: itemId, itemId, claims,
    api: { model: extractModel, responseId: attempt.responseId, usage: attempt.usage, stageKey: key },
  });
  writeClaims(itemId, claims);
  return { claims: claims.length, reused: false };
}

export function queryTerms(text: string): string[] {
  const terms = new Set<string>();
  for (const token of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (token.length > 2) terms.add(token);
  }
  return [...terms];
}

export async function ensureExtractedForTerms(terms: string[], limit: number = 10, deps: ExtractDeps = {}): Promise<{ extracted: number }> {
  const done = extractedItemIds();
  let extracted = 0;
  for (const term of terms) {
    let hits: Segment[];
    try {
      hits = searchSegments(term, limit);
    } catch {
      continue;
    }
    for (const hit of hits) {
      if (done.has(hit.itemId)) continue;
      done.add(hit.itemId);
      try {
        const result = await extractItem(hit.itemId, deps);
        if (!result.reused) extracted += 1;
        if (result.paused) return { extracted };
      } catch {
        continue;
      }
    }
  }
  return { extracted };
}
