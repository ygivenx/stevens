import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import type { Claim, Item, LedgerEvent, Segment } from '../../shared/data.js';
import { dataDir } from '../common/ledger/store.js';
import { closeStore, openStore, type StoreDb } from '../common/store-db.js';
import { atLabel } from './normalize/audio.js';

const here = dirname(fileURLToPath(import.meta.url));

export function schemaFile(): string {
  return join(here, 'db', 'schema.sql');
}

export function pgSchemaFile(): string {
  return join(here, 'db', 'schema.pg.sql');
}

export function dbPath(): string {
  return join(dataDir(), 'personal.db');
}

export function getDb(): Promise<StoreDb> {
  return openStore('personal', {
    url: process.env.PERSONAL_DATABASE_URL,
    file: dbPath(),
    schema: readFileSync(schemaFile(), 'utf8'),
    pgSchema: readFileSync(pgSchemaFile(), 'utf8'),
  });
}

export function closeDb(): Promise<void> {
  return closeStore('personal');
}

const LIVE_STATUSES = `status not in ('superseded', 'removed')`;

export interface IngestedExtra {
  contentHash: string;
  mediaPath?: string;
  ingestedAt: string;
  originId?: string;
  kind?: string;
  title?: string;
  capturedAt?: string;
  error?: string | null;
}

export async function writeIngested(item: Item, segments: Segment[], extra: IngestedExtra): Promise<void> {
  const db = await getDb();
  await db.withTransaction(async (tx) => {
    await tx.run(
      `insert into items (id, origin, origin_id, kind, title, captured_at, media_path, content_hash, ingested_at, status, error)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      item.id, item.origin, item.originId, item.kind, item.title, item.capturedAt, extra.mediaPath, extra.contentHash,
      extra.ingestedAt, item.status, item.error ?? null,
    );
    for (const segment of segments) {
      await tx.run(
        `insert into segments (id, item_id, seq, text, speaker, start_ms, end_ms, locator) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        segment.id, item.id, segment.seq, segment.text, segment.speaker ?? null, segment.startMs ?? null, segment.endMs ?? null, segment.locator ?? null,
      );
      if (tx.kind === 'sqlite') {
        await tx.run(`insert into segments_fts (text, segment_id) values ($1, $2)`, segment.text, segment.id);
      }
    }
  });
}

export async function writeClaims(itemId: string, claims: Claim[]): Promise<void> {
  const db = await getDb();
  for (const claim of claims) {
    await db.run(
      `insert into claims (id, item_id, segment_id, entity, metric, value, quote) values ($1, $2, $3, $4, $5, $6, $7)
       on conflict(id) do nothing`,
      claim.id, itemId, claim.segmentId, claim.entity, claim.metric ?? null, claim.value ?? null, claim.quote,
    );
  }
}

export async function hasContentHash(contentHash: string): Promise<boolean> {
  const db = await getDb();
  const row = await db.get<{ id: string }>(`select id from items where content_hash = $1`, contentHash);
  return !!row;
}

export async function activeItemForOrigin(origin: string, originId: string): Promise<{ id: string; contentHash: string } | null> {
  const db = await getDb();
  const row = await db.get<{ id: string; contentHash: string }>(
    `select id, content_hash as "contentHash" from items where origin = $1 and origin_id = $2 and ${LIVE_STATUSES}`,
    origin, originId,
  );
  return row ?? null;
}

export async function activeOriginIds(origin: string): Promise<string[]> {
  const db = await getDb();
  const rows = await db.all<{ origin_id: string }>(`select origin_id from items where origin = $1 and ${LIVE_STATUSES}`, origin);
  return rows.map((row) => row.origin_id);
}

export async function writeRevised(item: Item, segments: Segment[], extra: IngestedExtra, supersedes: string): Promise<void> {
  await writeIngested(item, segments, extra);
  const db = await getDb();
  await db.run(`update items set status = 'superseded' where id = $1`, supersedes);
}

export async function markRemoved(itemId: string): Promise<void> {
  const db = await getDb();
  await db.run(`update items set status = 'removed' where id = $1`, itemId);
}

export interface StoredEvent {
  uid: string;
  startsAt: string;
  endsAt: string | null;
  title: string;
  attendees: string[];
  location: string | null;
  description: string | null;
}

export async function replaceEvents(events: StoredEvent[]): Promise<void> {
  const db = await getDb();
  await db.withTransaction(async (tx) => {
    await tx.run(`delete from events`);
    for (const event of events) {
      await tx.run(
        `insert into events (uid, starts_at, ends_at, title, attendees, location, description) values ($1, $2, $3, $4, $5, $6, $7)`,
        event.uid, event.startsAt, event.endsAt ?? null, event.title, JSON.stringify(event.attendees), event.location ?? null, event.description ?? null,
      );
    }
  });
}

export async function upcomingEvents(fromMs: number, toMs: number): Promise<StoredEvent[]> {
  const db = await getDb();
  const rows = await db.all<{ uid: string; starts_at: string; ends_at: string | null; title: string; attendees: string; location: string | null; description: string | null }>(
    `select uid, starts_at, ends_at, title, attendees, location, description from events order by starts_at`,
  );
  return rows
    .filter((row) => {
      const ms = Date.parse(row.starts_at);
      return ms >= fromMs && ms <= toMs;
    })
    .map((row) => ({
      uid: row.uid,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      title: row.title,
      attendees: JSON.parse(row.attendees) as string[],
      location: row.location,
      description: row.description,
    }));
}

export async function writeVaultMeta(origin: string, originId: string, meta: { tags: string[]; aliases: string[]; links: string[] }): Promise<void> {
  const db = await getDb();
  await db.run(
    `insert into vault_meta (origin, origin_id, tags, aliases, links) values ($1, $2, $3, $4, $5)
     on conflict(origin, origin_id) do update set tags = excluded.tags, aliases = excluded.aliases, links = excluded.links`,
    origin, originId, JSON.stringify(meta.tags), JSON.stringify(meta.aliases), JSON.stringify(meta.links),
  );
}

export async function getAdapterState(adapter: string): Promise<{ cursor: string | null; lastSyncAt: string | null; lastError: string | null } | null> {
  const db = await getDb();
  const row = await db.get<{ cursor: string | null; last_sync_at: string | null; last_error: string | null }>(
    `select cursor, last_sync_at, last_error from adapter_state where adapter = $1`, adapter,
  );
  if (!row) return null;
  return { cursor: row.cursor, lastSyncAt: row.last_sync_at, lastError: row.last_error };
}

export async function setAdapterState(adapter: string, state: { cursor?: string | null; lastSyncAt?: string | null; lastError?: string | null }): Promise<void> {
  const db = await getDb();
  const current = await getAdapterState(adapter);
  const next = {
    cursor: state.cursor !== undefined ? state.cursor : current?.cursor ?? null,
    lastSyncAt: state.lastSyncAt !== undefined ? state.lastSyncAt : current?.lastSyncAt ?? null,
    lastError: state.lastError !== undefined ? state.lastError : current?.lastError ?? null,
  };
  await db.run(
    `insert into adapter_state (adapter, cursor, last_sync_at, last_error) values ($1, $2, $3, $4)
     on conflict(adapter) do update set cursor = excluded.cursor, last_sync_at = excluded.last_sync_at, last_error = excluded.last_error`,
    adapter, next.cursor, next.lastSyncAt, next.lastError,
  );
}

export async function allPersonalClaims(): Promise<Claim[]> {
  const db = await getDb();
  const rows = await db.all<Claim & { startMs: number | null; endMs: number | null }>(
    `select c.id, c.item_id as "sourceId", c.segment_id as "segmentId", c.entity, c.metric, c.value, c.quote,
            s.speaker as speaker, s.start_ms as "startMs", s.end_ms as "endMs"
     from claims c left join segments s on s.id = c.segment_id
     join items i on i.id = c.item_id and i.${LIVE_STATUSES} order by c.id`,
  );
  for (const claim of rows) {
    if (claim.startMs != null) claim.at = atLabel(claim.startMs);
    else claim.at = undefined;
  }
  return rows;
}

export async function personalSources(ownerRole: 'Associate' | 'Partner'): Promise<import('../../shared/data.js').Source[]> {
  const db = await getDb();
  const rows = await db.all<{ id: string; origin: string; kind: string; title: string; capturedAt: string; text: string | null }>(
    `select i.id as id, i.origin as origin, i.kind as kind, i.title as title, i.captured_at as "capturedAt", s.text as text
     from items i left join segments s on s.item_id = i.id where i.${LIVE_STATUSES} order by i.id, s.seq`,
  );
  const texts = new Map<string, { origin: string; kind: string; title: string; capturedAt: string; parts: string[] }>();
  for (const row of rows) {
    let entry = texts.get(row.id);
    if (!entry) {
      entry = { origin: row.origin, kind: row.kind, title: row.title, capturedAt: row.capturedAt, parts: [] };
      texts.set(row.id, entry);
    }
    if (row.text != null) entry.parts.push(row.text);
  }
  return [...texts.entries()].map(([id, entry]) => ({
    id,
    vault: 'personal' as const,
    title: entry.title,
    capturedAt: entry.capturedAt,
    kind: entry.kind === 'audio' ? 'talk-audio' as const : entry.kind === 'photo' || entry.kind === 'video' ? 'slide-photo' as const : 'article' as const,
    fixture: '',
    text: entry.parts.length > 0 ? entry.parts.join('\n') : undefined,
    ownerRole,
  }));
}

export async function searchSegments(query: string, limit: number = 10): Promise<Segment[]> {
  if (!query.trim()) return [];
  const db = await getDb();
  const ids = db.kind === 'pg'
    ? (await db.all<{ id: string }>(
      `select s.id as id from segments s
       where s.search @@ plainto_tsquery('english', $1)
       order by ts_rank(s.search, plainto_tsquery('english', $1)) desc limit $2`,
      query, limit,
    )).map((row) => row.id)
    : (await db.all<{ id: string }>(`select segment_id as id from segments_fts where segments_fts match $1 limit $2`, query, limit)).map((row) => row.id);
  const found: Segment[] = [];
  for (const id of ids) {
    const segment = await db.get<Segment>(
      `select s.id, s.item_id as "itemId", s.seq, s.text, s.speaker, s.start_ms as "startMs", s.end_ms as "endMs", s.locator
       from segments s join items i on i.id = s.item_id and i.${LIVE_STATUSES} where s.id = $1`,
      id,
    );
    if (segment) found.push(segment);
  }
  return found;
}

export interface ItemBundle {
  item: Item;
  segments: Segment[];
  claims: Claim[];
  mediaPath: string | null;
}

export async function getItemBundle(itemId: string): Promise<ItemBundle | null> {
  const db = await getDb();
  const row = await db.get<Omit<Item, 'hasMedia'> & { mediaPath: string | null }>(
    `select id, origin, origin_id as "originId", kind, title, captured_at as "capturedAt", status, error, media_path as "mediaPath"
     from items where id = $1`,
    itemId,
  );
  if (!row) return null;
  const { mediaPath, ...rest } = row;
  const segments = await db.all<Segment>(
    `select id, item_id as "itemId", seq, text, speaker, start_ms as "startMs", end_ms as "endMs", locator
     from segments where item_id = $1 order by seq`,
    itemId,
  );
  const claims = await db.all<Claim & { startMs: number | null; endMs: number | null }>(
    `select c.id, c.item_id as "sourceId", c.segment_id as "segmentId", c.entity, c.metric, c.value, c.quote,
            s.speaker as speaker, s.start_ms as "startMs", s.end_ms as "endMs"
     from claims c left join segments s on s.id = c.segment_id where c.item_id = $1`,
    itemId,
  );
  for (const claim of claims) {
    if (claim.startMs != null) claim.at = atLabel(claim.startMs);
    else claim.at = undefined;
  }
  return { item: { ...rest, hasMedia: mediaPath !== null }, segments, claims, mediaPath };
}

export async function mediaPathForItem(itemId: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.get<{ mediaPath: string | null }>(`select media_path as "mediaPath" from items where id = $1`, itemId);
  return row?.mediaPath ?? null;
}

export async function rebuildFromLedger(events: LedgerEvent[]): Promise<{ items: number; claims: number }> {
  let items = 0;
  let claims = 0;
  for (const event of events) {
    if (event.type === 'item.ingested') {
      await writeIngested(event.item, event.segments, { contentHash: event.contentHash, mediaPath: event.mediaPath, ingestedAt: event.at });
      items += 1;
    } else if (event.type === 'item.revised') {
      await writeRevised(event.item, event.segments, { contentHash: event.contentHash, mediaPath: event.mediaPath, ingestedAt: event.at }, event.supersedes);
      items += 1;
    } else if (event.type === 'item.removed') {
      await markRemoved(event.itemId);
    } else if (event.type === 'claims.extracted' && event.itemId) {
      await writeClaims(event.itemId, event.claims);
      claims += event.claims.length;
    } else if (event.type === 'chat.asked') {
      await appendChatMessage({ id: event.messageId, questionId: event.questionId, role: 'user', text: event.text, citations: null, createdAt: event.at });
    } else if (event.type === 'chat.replied') {
      const text = event.sentences.map((sentence) => sentence.text).join(' ');
      await appendChatMessage({ id: event.messageId, questionId: event.questionId, role: 'assistant', text, citations: JSON.stringify(event.sentences), createdAt: event.at });
    }
  }
  return { items, claims };
}

export interface ChatRow { id: string; questionId: string; role: string; text: string; citations: string | null; createdAt: string }

export async function appendChatMessage(row: ChatRow): Promise<void> {
  const db = await getDb();
  await db.run(
    `insert into conversations (id, question_id, role, text, citations, created_at) values ($1, $2, $3, $4, $5, $6)
     on conflict(id) do nothing`,
    row.id, row.questionId, row.role, row.text, row.citations, row.createdAt,
  );
}

export async function chatThread(questionId: string): Promise<ChatRow[]> {
  const db = await getDb();
  return db.all<ChatRow>(
    `select id, question_id as "questionId", role, text, citations, created_at as "createdAt"
     from conversations where question_id = $1 and role in ('user', 'assistant')
     order by created_at, id`,
    questionId,
  );
}

export async function chatContext(questionId: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.get<{ citations: string | null }>(
    `select citations from conversations where question_id = $1 and role = 'context' order by created_at desc limit 1`,
    questionId,
  );
  return row?.citations ?? null;
}

export async function ensureDb(events: LedgerEvent[]): Promise<{ rebuilt: boolean; items: number; claims: number }> {
  const db = await getDb();
  const count = await db.get<{ n: number }>(`select count(*) as n from items`);
  const n = typeof count?.n === 'string' ? Number.parseInt(count.n, 10) : (count?.n ?? 0);
  if (n > 0) return { rebuilt: false, items: 0, claims: 0 };
  const counts = await rebuildFromLedger(events);
  return { rebuilt: true, ...counts };
}
