import type { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Claim, Item, LedgerEvent, Segment } from '../../shared/data.js';
import { dataDir } from '../common/ledger/store.js';
import { openProcessDb } from '../common/db.js';
import { atLabel } from './normalize/audio.js';

let handle: DatabaseSync | null = null;

export function schemaFile(): string {
  return join(process.cwd(), 'server', 'personal', 'db', 'schema.sql');
}

export function dbPath(): string {
  return join(dataDir(), 'personal.db');
}

export function getDb(): DatabaseSync {
  if (!handle) handle = openProcessDb('personal.db', schemaFile());
  return handle;
}

export function closeDb(): void {
  handle?.close();
  handle = null;
}

export interface IngestedExtra {
  contentHash: string;
  mediaPath?: string;
  ingestedAt: string;
}

export function writeIngested(item: Item, segments: Segment[], extra: IngestedExtra): void {
  const db = getDb();
  db.exec('BEGIN');
  try {
    const entry = item;
    const parts = segments;
    const meta = extra;
    db.prepare(
      `insert into items (id, origin, origin_id, kind, title, captured_at, media_path, content_hash, ingested_at, status, error)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       on conflict(id) do update set status = excluded.status, error = excluded.error`,
    ).run(entry.id, entry.origin, entry.originId, entry.kind, entry.title, entry.capturedAt, meta.mediaPath ?? null, meta.contentHash, meta.ingestedAt, entry.status, entry.error ?? null);
    db.prepare(`delete from segments_fts where segment_id in (select id from segments where item_id = ?)`).run(entry.id);
    db.prepare(`delete from segments where item_id = ?`).run(entry.id);
    const insertSegment = db.prepare(
      `insert into segments (id, item_id, seq, text, speaker, start_ms, end_ms, locator) values (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertFts = db.prepare(`insert into segments_fts (text, segment_id) values (?, ?)`);
    for (const segment of parts) {
      insertSegment.run(segment.id, segment.itemId, segment.seq, segment.text, segment.speaker ?? null, segment.startMs ?? null, segment.endMs ?? null, segment.locator ?? null);
      insertFts.run(segment.text, segment.id);
    }
    db.exec('COMMIT');
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      void 0;
    }
    throw err;
  }
}

export function writeClaims(itemId: string, claims: Claim[]): void {
  const db = getDb();
  db.exec('BEGIN');
  try {
    db.prepare(`delete from claims where item_id = ?`).run(itemId);
    const insertClaim = db.prepare(
      `insert or ignore into claims (id, item_id, segment_id, entity, metric, value, quote) values (?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const claim of claims) {
      insertClaim.run(claim.id, itemId, claim.segmentId ?? '', claim.entity, claim.metric ?? null, claim.value ?? null, claim.quote);
    }
    db.exec('COMMIT');
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      void 0;
    }
    throw err;
  }
}

export function hasContentHash(contentHash: string): boolean {
  const db = getDb();
  const row = db.prepare(`select id from items where content_hash = ?`).get(contentHash) as unknown as { id: string } | undefined;
  return row !== undefined;
}

export function searchSegments(query: string, limit: number = 10): Segment[] {
  const db = getDb();
  const hits = db.prepare(`select segment_id as id from segments_fts where segments_fts match ? limit ?`).all(query, limit) as { id: string }[];
  const fetch = db.prepare(`select id, item_id as itemId, seq, text, speaker, start_ms as startMs, end_ms as endMs, locator from segments where id = ?`);
  return hits.map((hit) => fetch.get(hit.id) as unknown as Segment);
}

export interface ItemBundle {
  item: Item;
  segments: Segment[];
  claims: Claim[];
  mediaPath: string | null;
}

export function getItemBundle(itemId: string): ItemBundle | null {
  const db = getDb();
  const row = db.prepare(
    `select id, origin, origin_id as originId, kind, title, captured_at as capturedAt, status, error, media_path as mediaPath
     from items where id = ?`,
  ).get(itemId) as unknown as (Omit<Item, 'hasMedia'> & { mediaPath: string | null }) | undefined;
  if (!row) return null;
  const { mediaPath, ...rest } = row;
  const segments = db.prepare(
    `select id, item_id as itemId, seq, text, speaker, start_ms as startMs, end_ms as endMs, locator from segments where item_id = ? order by seq`,
  ).all(itemId) as unknown as Segment[];
  const claims = db.prepare(
    `select c.id, c.item_id as sourceId, c.segment_id as segmentId, c.entity, c.metric, c.value, c.quote,
            s.speaker as speaker, s.start_ms as startMs, s.end_ms as endMs
     from claims c left join segments s on s.id = c.segment_id where c.item_id = ?`,
  ).all(itemId) as unknown as (Claim & { startMs: number | null; endMs: number | null })[];
  for (const claim of claims) {
    if (claim.startMs != null) claim.at = atLabel(claim.startMs);
    else claim.at = undefined;
  }
  return { item: { ...rest, hasMedia: mediaPath !== null }, segments, claims, mediaPath };
}

export function mediaPathForItem(itemId: string): string | null {
  const db = getDb();
  const row = db.prepare(`select media_path as mediaPath from items where id = ?`).get(itemId) as unknown as { mediaPath: string | null } | undefined;
  return row?.mediaPath ?? null;
}

export function rebuildFromLedger(events: LedgerEvent[]): { items: number; claims: number } {
  let items = 0;
  let claims = 0;
  for (const event of events) {
    if (event.type === 'item.ingested') {
      writeIngested(event.item, event.segments, { contentHash: event.contentHash, mediaPath: event.mediaPath, ingestedAt: event.at });
      items += 1;
    } else if (event.type === 'claims.extracted' && event.itemId) {
      writeClaims(event.itemId, event.claims);
      claims += event.claims.length;
    }
  }
  return { items, claims };
}

export function ensureDb(events: LedgerEvent[]): { rebuilt: boolean; items: number; claims: number } {
  if (existsSync(dbPath())) return { rebuilt: false, items: 0, claims: 0 };
  const counts = rebuildFromLedger(events);
  return { rebuilt: true, ...counts };
}
