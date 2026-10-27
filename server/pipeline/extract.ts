import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Claim, Source } from '../../shared/data.js';
import { append, readAll, findCompleted, stageKey, PROMPT_VERSION, dataDir } from '../ledger/store.js';
import { extractClaims, extractModel, type TranscriptTurn } from '../meta/client.js';
import { quoteIn } from '../resolver/resolve.js';

function ingestedSources(): Source[] {
  const sources: Source[] = [];
  const seen = new Set<string>();
  for (const event of readAll()) {
    if (event.type === 'source.ingested' && !seen.has(event.source.id)) {
      seen.add(event.source.id);
      sources.push(event.source);
    }
  }
  return sources;
}

function extractedIds(): Set<string> {
  const ids = new Set<string>();
  for (const event of readAll()) {
    if (event.type === 'claims.extracted') ids.add(event.sourceId);
  }
  return ids;
}

function turnsFor(sourceId: string): TranscriptTurn[] | undefined {
  const path = join(dataDir(), 'derived', sourceId + '.json');
  if (!existsSync(path)) return undefined;
  return (JSON.parse(readFileSync(path, 'utf8')) as { turns: TranscriptTurn[] }).turns;
}

function validQuotes(text: string, quotes: { quote: string }[]): boolean {
  return quotes.every((c) => typeof c.quote === 'string' && quoteIn(c.quote, text));
}

export async function runExtract(): Promise<{ extracted: string[]; reused: string[] }> {
  const extracted: string[] = [];
  const reused: string[] = [];
  const done = extractedIds();
  for (const source of ingestedSources()) {
    if (!source.text) continue;
    const key = stageKey('extract', [source.id], PROMPT_VERSION, extractModel);
    if (done.has(source.id) || findCompleted(key)) {
      reused.push(source.id);
      continue;
    }
    let attempt = await extractClaims(source.id, source.text, turnsFor(source.id));
    if (!validQuotes(source.text, attempt.claims)) {
      attempt = await extractClaims(source.id, source.text, turnsFor(source.id));
    }
    if (!validQuotes(source.text, attempt.claims)) {
      append({ at: new Date().toISOString(), type: 'attempt.failed', stageKey: key, model: extractModel, error: 'extracted quotes failed verbatim validation', usage: attempt.usage });
      throw new Error('extraction failed validation for ' + source.id);
    }
    const claims: Claim[] = attempt.claims.map((raw, i) => ({
      id: source.id + '-c' + i, sourceId: source.id, entity: raw.entity,
      metric: raw.metric ?? undefined, value: raw.value ?? undefined, quote: raw.quote,
      at: raw.at ?? undefined, speaker: raw.speaker ?? undefined,
    }));
    append({
      at: new Date().toISOString(), type: 'claims.extracted', sourceId: source.id, claims,
      api: { model: extractModel, responseId: attempt.responseId, usage: attempt.usage, stageKey: key },
    });
    extracted.push(source.id);
  }
  return { extracted, reused };
}
