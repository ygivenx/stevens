import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { RawItem } from '../../shared/data.js';
import { append } from '../common/ledger/store.js';
import { ingestRaw, itemIdFor, withinBackfill } from './ingest.js';
import { dailyTokenCap, ensureExtractedForTerms, extractionPaused, extractInputTokensToday, extractItem, pendingExtractionIds } from './extract.js';
import { allPersonalClaims, closeDb, getItemBundle, searchSegments } from './store.js';

function noteRaw(originId: string, text: string, capturedAt: string): RawItem {
  return {
    origin: 'vault', originId, kind: 'note', title: originId,
    capturedAt, text,
    contentHash: createHash('sha256').update(text.replace(/\s+/g, ' ').trim()).digest('hex'),
  };
}

function calls(): number {
  const dir = process.env.STEVENS_DATA_DIR as string;
  return (JSON.parse(readFileSync(join(dir, 'meta-calls.json'), 'utf8')) as { count: number }).count;
}

beforeEach(() => {
  closeDb();
  const dir = mkdtempSync(join(tmpdir(), 'stevens-extract-'));
  process.env.STEVENS_DATA_DIR = dir;
  process.env.STEVENS_NOW = '2026-10-28T14:00:00-04:00';
  delete process.env.STEVENS_BACKFILL_DAYS;
  delete process.env.STEVENS_DAILY_TOKENS;
  writeFileSync(join(dir, 'meta-fake.json'), JSON.stringify({ mode: 'normal' }));
  writeFileSync(join(dir, 'meta-calls.json'), JSON.stringify({ count: 0 }));
});

afterEach(() => {
  delete process.env.STEVENS_NOW;
  delete process.env.STEVENS_BACKFILL_DAYS;
  delete process.env.STEVENS_DAILY_TOKENS;
  closeDb();
});

describe('backfill window', () => {
  it('extracts recent notes and only indexes older ones', async () => {
    const fresh = noteRaw('fresh.md', '# Fresh\n\nChurn benchmarks live here.', '2026-10-27T10:00:00-04:00');
    const stale = noteRaw('stale.md', '# Stale\n\nAncient churn benchmarks live here.', '2020-01-01T00:00:00Z');
    expect(withinBackfill(fresh.capturedAt)).toBe(true);
    expect(withinBackfill(stale.capturedAt)).toBe(false);
    await ingestRaw(fresh);
    await ingestRaw(stale);
    expect(getItemBundle(itemIdFor(fresh))?.claims.length).toBeGreaterThan(0);
    const staleBundle = getItemBundle(itemIdFor(stale));
    expect(staleBundle?.item.status).toBe('ready');
    expect(staleBundle?.segments.length).toBeGreaterThan(0);
    expect(staleBundle?.claims).toHaveLength(0);
    expect(searchSegments('ancient').length).toBeGreaterThan(0);
  });

  it('honors a custom backfill window', () => {
    process.env.STEVENS_BACKFILL_DAYS = '3650';
    expect(withinBackfill('2020-01-01T00:00:00Z')).toBe(true);
  });
});

describe('on-demand extraction', () => {
  it('extracts an old item when it ranks in the top hits', async () => {
    const stale = noteRaw('stale.md', '# Stale\n\nAncient churn benchmarks live here.', '2020-01-01T00:00:00Z');
    await ingestRaw(stale);
    expect(pendingExtractionIds()).toContain(itemIdFor(stale));
    const before = calls();
    const result = await ensureExtractedForTerms(['ancient']);
    expect(result.extracted).toBe(1);
    expect(calls()).toBeGreaterThan(before);
    expect(getItemBundle(itemIdFor(stale))?.claims.length).toBeGreaterThan(0);
    expect(pendingExtractionIds()).not.toContain(itemIdFor(stale));
  });

  it('skips items that never rank', async () => {
    const stale = noteRaw('stale.md', '# Stale\n\nAncient churn benchmarks live here.', '2020-01-01T00:00:00Z');
    await ingestRaw(stale);
    const result = await ensureExtractedForTerms(['zebras']);
    expect(result.extracted).toBe(0);
    expect(getItemBundle(itemIdFor(stale))?.claims).toHaveLength(0);
  });
});

describe('daily budget', () => {
  it('sums extract input tokens from the ledger for the current day', () => {
    expect(dailyTokenCap()).toBe(3000000);
    expect(extractInputTokensToday()).toBe(0);
    append({
      at: '2026-10-28T15:00:00-04:00', type: 'claims.extracted', sourceId: 'it-x', itemId: 'it-x', claims: [],
      api: { model: 'm', responseId: 'r', usage: { inputTokens: 1200, costUsd: 0 }, stageKey: 'k1' },
    });
    append({
      at: '2026-10-27T15:00:00-04:00', type: 'claims.extracted', sourceId: 'it-y', itemId: 'it-y', claims: [],
      api: { model: 'm', responseId: 'r', usage: { inputTokens: 9999, costUsd: 0 }, stageKey: 'k2' },
    });
    expect(extractInputTokensToday()).toBe(1200);
  });

  it('pauses extraction at the cap and resumes nothing until spend drops', async () => {
    process.env.STEVENS_DAILY_TOKENS = '100';
    append({
      at: '2026-10-28T15:00:00-04:00', type: 'claims.extracted', sourceId: 'it-x', itemId: 'it-x', claims: [],
      api: { model: 'm', responseId: 'r', usage: { inputTokens: 100, costUsd: 0 }, stageKey: 'k1' },
    });
    const fresh = noteRaw('fresh.md', '# Fresh\n\nChurn benchmarks live here.', '2026-10-27T10:00:00-04:00');
    await ingestRaw(fresh);
    expect(getItemBundle(itemIdFor(fresh))?.claims).toHaveLength(0);
    expect(extractionPaused()).toBe(true);
    const direct = await extractItem(itemIdFor(fresh));
    expect(direct.paused).toBe(true);
  });

  it('stays unpaused when nothing is waiting', () => {
    process.env.STEVENS_DAILY_TOKENS = '0';
    expect(extractionPaused()).toBe(false);
  });

  it('keeps writers uncapped', async () => {
    process.env.STEVENS_DAILY_TOKENS = '0';
    const fresh = noteRaw('fresh.md', '# Fresh\n\nChurn benchmarks live here.', '2026-10-27T10:00:00-04:00');
    await ingestRaw(fresh);
    expect(allPersonalClaims()).toHaveLength(0);
    expect(getItemBundle(itemIdFor(fresh))?.segments.length).toBeGreaterThan(0);
  });
});
