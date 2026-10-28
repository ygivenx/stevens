import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, copyFileSync, writeFileSync, readFileSync, existsSync, rmSync, mkdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readAll } from '../common/ledger/store.js';
import { quoteIn } from '../common/resolver/resolve.js';
import { chunkPlan, normalizeAudio, atLabel } from './normalize/audio.js';
import { ingestRaw, itemIdFor, retireVaultRemoved, runInboxPoll } from './ingest.js';
import { allPersonalClaims, closeDb, ensureDb, getDb, getItemBundle, searchSegments } from './store.js';
import type { RawItem } from '../../shared/data.js';

function vaultRaw(originId: string, text: string): RawItem {
  return {
    origin: 'vault', originId, kind: 'note', title: originId,
    capturedAt: new Date().toISOString(), text,
    contentHash: createHash('sha256').update(text.replace(/\s+/g, ' ').trim()).digest('hex'),
  };
}

function freshDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'stevens-ingest-'));
  process.env.STEVENS_DATA_DIR = dir;
  writeFileSync(join(dir, 'meta-fake.json'), JSON.stringify({ mode: 'normal' }));
  writeFileSync(join(dir, 'meta-calls.json'), JSON.stringify({ count: 0 }));
  return dir;
}

function dropFixture(dir: string, name: string): string {
  const inbox = join(dir, 'inbox');
  mkdirSync(inbox, { recursive: true });
  const dest = join(inbox, name);
  copyFileSync(join(process.cwd(), 'fixtures', 'personal', name), dest);
  return dest;
}

function calls(dir: string): number {
  return (JSON.parse(readFileSync(join(dir, 'meta-calls.json'), 'utf8')) as { count: number }).count;
}

function rawFor(dir: string, name: string): RawItem {
  const path = join(dir, 'inbox', name);
  const bytes = readFileSync(path);
  const kind = name.endsWith('.wav') ? 'audio' : name.endsWith('.jpg') ? 'photo' : 'video';
  return {
    origin: 'glasses', originId: name, kind, title: name.replace(/\.[^.]+$/, ''),
    capturedAt: statSync(path).mtime.toISOString(), mediaPath: path,
    contentHash: createHash('sha256').update(bytes).digest('hex'),
  };
}

beforeEach(() => {
  closeDb();
  freshDir();
});

afterEach(() => {
  closeDb();
});

describe('chunking', () => {
  it('keeps short recordings in one chunk and splits long ones under nine minutes', () => {
    expect(chunkPlan(22_518)).toEqual([{ offsetMs: 0, lengthMs: 22_518 }]);
    const plan = chunkPlan(20 * 60 * 1000);
    expect(plan).toHaveLength(3);
    expect(plan[0]).toEqual({ offsetMs: 0, lengthMs: 9 * 60 * 1000 });
    expect(plan[2].offsetMs).toBe(18 * 60 * 1000);
    for (const chunk of plan) expect(chunk.lengthMs).toBeLessThanOrEqual(9 * 60 * 1000);
  });

  it('labels times as minutes and seconds', () => {
    expect(atLabel(0)).toBe('0:00');
    expect(atLabel(74_000)).toBe('1:14');
  });
});

describe('inbox ingest', () => {
  it('turns a talk capture into diarized segments and anchored claims', async () => {
    const dir = process.env.STEVENS_DATA_DIR as string;
    dropFixture(dir, 'talk.wav');
    const result = await runInboxPoll();
    expect(result.added).toBe(1);
    const raw = rawFor(dir, 'talk.wav');
    const bundle = getItemBundle(itemIdFor(raw));
    expect(bundle?.item.status).toBe('ready');
    expect(bundle?.segments.length).toBeGreaterThan(0);
    const speakers = new Set((bundle?.segments ?? []).map((s) => s.speaker));
    expect(speakers.has('Speaker 1')).toBe(true);
    expect(speakers.has('Speaker 2')).toBe(true);
    for (const segment of bundle?.segments ?? []) {
      expect(segment.startMs).toBeGreaterThanOrEqual(0);
    }
    expect((bundle?.claims ?? []).length).toBeGreaterThan(0);
    for (const claim of bundle?.claims ?? []) {
      const segment = (bundle?.segments ?? []).find((s) => s.id === claim.segmentId);
      expect(segment).toBeDefined();
      expect(quoteIn(claim.quote, segment?.text ?? '')).toBe(true);
      expect(claim.speaker).toBe(segment?.speaker);
      expect(claim.startMs).toBe(segment?.startMs);
    }
    const types = readAll().map((e) => e.type);
    expect(types).toContain('item.ingested');
    expect(types).toContain('claims.extracted');
    expect(types).toContain('sync.completed');
  });

  it('reads a slide photo into one verbatim segment', async () => {
    const dir = process.env.STEVENS_DATA_DIR as string;
    dropFixture(dir, 'slide.jpg');
    await runInboxPoll();
    const bundle = getItemBundle(itemIdFor(rawFor(dir, 'slide.jpg')));
    expect(bundle?.item.status).toBe('ready');
    expect(bundle?.segments).toHaveLength(1);
    expect(bundle?.segments[0].locator).toBe('photo');
    expect((bundle?.claims ?? []).length).toBeGreaterThan(0);
  });

  it('drops the same capture twice with nothing added or logged', async () => {
    const dir = process.env.STEVENS_DATA_DIR as string;
    dropFixture(dir, 'talk.wav');
    await runInboxPoll();
    const before = readAll().length;
    const second = await runInboxPoll();
    expect(second.added).toBe(0);
    expect(readAll().length).toBe(before + 1);
  });

  it('leaves a missing configured inbox alone instead of throwing', async () => {
    const { InboxAdapter } = await import('./adapters/inbox.js');
    process.env.STEVENS_INBOX_DIR = join(process.env.STEVENS_DATA_DIR as string, 'no-such-inbox');
    try {
      const stop = new InboxAdapter().watch(() => {});
      expect(typeof stop).toBe('function');
      stop();
    } finally {
      delete process.env.STEVENS_INBOX_DIR;
    }
  });

  it('rejects unsupported files with a reason', async () => {
    const dir = process.env.STEVENS_DATA_DIR as string;
    const inbox = join(dir, 'inbox');
    mkdirSync(inbox, { recursive: true });
    writeFileSync(join(inbox, 'notes.exe'), 'binary');
    const result = await runInboxPoll();
    expect(result.rejected).toBe(1);
    const rejected = readAll().find((e) => e.type === 'item.rejected');
    expect(rejected?.type).toBe('item.rejected');
    if (rejected?.type === 'item.rejected') expect(rejected.reason).toContain('unsupported');
  });

  it('indexes segments for full-text search', async () => {
    const dir = process.env.STEVENS_DATA_DIR as string;
    dropFixture(dir, 'talk.wav');
    await runInboxPoll();
    const hits = searchSegments('churn');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].text.toLowerCase()).toContain('churn');
  });
});

describe('vault revisions', () => {
  it('supersedes the old revision and retires its claims', async () => {
    const first = await ingestRaw(vaultRaw('note.md', '# Note\n\nChurn runs high this year.'));
    expect(first.added).toBe(true);
    const oldClaims = allPersonalClaims().map((claim) => claim.id);
    expect(oldClaims.length).toBeGreaterThan(0);
    const second = await ingestRaw(vaultRaw('note.md', '# Note\n\nChurn runs low this year, revised.'));
    expect(second.added).toBe(true);
    expect(second.itemId).not.toBe(first.itemId);
    const revised = readAll().find((e) => e.type === 'item.revised');
    expect(revised?.type).toBe('item.revised');
    if (revised?.type === 'item.revised') expect(revised.supersedes).toBe(first.itemId);
    expect(getItemBundle(first.itemId)?.item.status).toBe('superseded');
    const live = allPersonalClaims().map((claim) => claim.id);
    expect(live.length).toBeGreaterThan(0);
    for (const id of oldClaims) expect(live).not.toContain(id);
    expect(searchSegments('revised').every((hit) => hit.itemId === second.itemId)).toBe(true);
  });

  it('retires a deleted note from retrieval while keeping its ledger history', async () => {
    const added = await ingestRaw(vaultRaw('gone.md', '# Gone\n\nChurn notes to delete.'));
    expect(allPersonalClaims().length).toBeGreaterThan(0);
    expect(retireVaultRemoved(['gone.md', 'never-there.md'])).toBe(1);
    const removed = readAll().find((e) => e.type === 'item.removed');
    expect(removed?.type).toBe('item.removed');
    if (removed?.type === 'item.removed') expect(removed.itemId).toBe(added.itemId);
    expect(getItemBundle(added.itemId)?.item.status).toBe('removed');
    expect(allPersonalClaims()).toHaveLength(0);
    expect(searchSegments('delete')).toHaveLength(0);
    expect(readAll().some((e) => e.type === 'item.ingested')).toBe(true);
  });

  it('rebuilds superseded and removed states from the ledger', async () => {
    await ingestRaw(vaultRaw('note.md', '# Note\n\nChurn runs high this year.'));
    await ingestRaw(vaultRaw('note.md', '# Note\n\nChurn runs low this year, revised.'));
    await ingestRaw(vaultRaw('gone.md', '# Gone\n\nChurn notes to delete.'));
    retireVaultRemoved(['gone.md']);
    closeDb();
    rmSync(join(process.env.STEVENS_DATA_DIR as string, 'personal.db'), { force: true });
    const rebuilt = ensureDb(readAll());
    expect(rebuilt.rebuilt).toBe(true);
    const db = getDb();
    const statuses = (db.prepare(`select status from items`).all() as { status: string }[]).map((row) => row.status);
    expect(statuses).toContain('superseded');
    expect(statuses).toContain('removed');
    expect(allPersonalClaims().every((claim) => !claim.quote.includes('delete'))).toBe(true);
  });
});

describe('durable pipeline', () => {
  it('reuses cached chunk transcripts instead of re-calling', async () => {
    const dir = process.env.STEVENS_DATA_DIR as string;
    const path = dropFixture(dir, 'talk.wav');
    const hash = createHash('sha256').update(readFileSync(path)).digest('hex');
    const first = await normalizeAudio(path, hash);
    expect(first.pieces.length).toBeGreaterThan(0);
    const before = calls(dir);
    const second = await normalizeAudio(path, hash);
    expect(second.pieces).toEqual(first.pieces);
    expect(calls(dir)).toBe(before);
  });

  it('logs failed attempts and marks the item failed', async () => {
    const dir = process.env.STEVENS_DATA_DIR as string;
    dropFixture(dir, 'talk.wav');
    const raw = rawFor(dir, 'talk.wav');
    await expect(ingestRaw(raw, {
      transcribeFn: async () => {
        throw new Error('boom');
      },
    })).rejects.toThrow('boom');
    const bundle = getItemBundle(itemIdFor(raw));
    expect(bundle?.item.status).toBe('failed');
    const failed = readAll().find((e) => e.type === 'attempt.failed');
    expect(failed).toBeDefined();
  });

  it('rebuilds the database from the ledger with zero new calls', async () => {
    const dir = process.env.STEVENS_DATA_DIR as string;
    dropFixture(dir, 'talk.wav');
    dropFixture(dir, 'slide.jpg');
    await runInboxPoll();
    const db = getDb();
    const itemsBefore = (db.prepare(`select count(*) as n from items`).get() as unknown as { n: number }).n;
    const claimsBefore = (db.prepare(`select count(*) as n from claims`).get() as unknown as { n: number }).n;
    expect(itemsBefore).toBe(2);
    expect(claimsBefore).toBeGreaterThan(0);
    const spent = calls(dir);
    closeDb();
    rmSync(join(dir, 'personal.db'), { force: true });
    expect(existsSync(join(dir, 'personal.db'))).toBe(false);
    const rebuilt = ensureDb(readAll());
    expect(rebuilt.rebuilt).toBe(true);
    const again = getDb();
    expect((again.prepare(`select count(*) as n from items`).get() as unknown as { n: number }).n).toBe(itemsBefore);
    expect((again.prepare(`select count(*) as n from claims`).get() as unknown as { n: number }).n).toBe(claimsBefore);
    expect(searchSegments('churn').length).toBeGreaterThan(0);
    expect(calls(dir)).toBe(spent);
  });
});
