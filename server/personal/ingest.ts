import { createHash } from 'node:crypto';
import type { Api, Item, RawItem, Segment } from '../../shared/data.js';
import type { Piece } from './normalize/audio.js';
import { append, readAll } from '../common/ledger/store.js';
import { voiceModel, visionModel } from '../common/meta/client.js';
import { scanInbox, scanUnsupported } from './adapters/inbox.js';
import { normalizeAudio, type AudioDeps } from './normalize/audio.js';
import { normalizePhoto, type PhotoDeps } from './normalize/photo.js';
import { normalizeVideo, type VideoDeps } from './normalize/video.js';
import { highlightPieces, splitNote } from './normalize/text.js';
import { extractItem, type ExtractDeps } from './extract.js';
import { nowMs } from '../common/clock.js';
import { activeItemForOrigin, hasContentHash, markRemoved, setAdapterState, writeIngested, writeRevised, writeVaultMeta } from './store.js';

export interface IngestDeps extends AudioDeps, PhotoDeps, VideoDeps, ExtractDeps {}

export function backfillDays(): number {
  const parsed = Number(process.env.STEVENS_BACKFILL_DAYS ?? '90');
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 90;
}

export function withinBackfill(capturedAt: string): boolean {
  return Date.parse(capturedAt) >= nowMs() - backfillDays() * 24 * 3600 * 1000;
}

export function itemIdFor(raw: RawItem): string {
  return 'it-' + createHash('sha256').update(raw.origin + '|' + raw.originId + '|' + raw.contentHash).digest('hex').slice(0, 12);
}

export function ingestedItemIds(): Set<string> {
  const ids = new Set<string>();
  for (const event of readAll()) {
    if (event.type === 'item.ingested') ids.add(event.item.id);
  }
  return ids;
}

export function rejectedOriginIds(): Set<string> {
  const ids = new Set<string>();
  for (const event of readAll()) {
    if (event.type === 'item.rejected') ids.add(event.origin + '|' + event.originId);
  }
  return ids;
}

function modelForKind(kind: RawItem['kind']): string {
  if (kind === 'audio') return voiceModel;
  return visionModel;
}

export async function ingestRaw(raw: RawItem, deps: IngestDeps = {}): Promise<{ itemId: string; added: boolean }> {
  const itemId = itemIdFor(raw);
  if (ingestedItemIds().has(itemId) || (await hasContentHash(raw.contentHash))) return { itemId, added: false };
  const at = new Date().toISOString();
  const prior = raw.origin === 'vault' ? await activeItemForOrigin(raw.origin, raw.originId) : null;
  const revising = prior && prior.contentHash !== raw.contentHash ? prior.id : null;
  let pieces: Piece[] = [];
  let api: Api | null = null;
  let stageKeyValue = 'normalize:' + raw.contentHash;
  try {
    if (raw.mediaPath) {
      if (raw.kind === 'audio') ({ pieces, api } = await normalizeAudio(raw.mediaPath, raw.contentHash, deps));
      else if (raw.kind === 'photo') ({ pieces, api } = await normalizePhoto(raw.mediaPath, raw.contentHash, deps));
      else ({ pieces, api } = await normalizeVideo(raw.mediaPath, raw.contentHash, deps));
      stageKeyValue = (api as Api).stageKey;
    } else if (raw.kind === 'highlight') {
      pieces = highlightPieces(raw.segments);
    } else if (raw.kind === 'note' && raw.text) {
      pieces = splitNote(raw.text);
      if (pieces.length === 0) throw new Error('empty note');
    } else {
      append({ at, type: 'item.rejected', origin: raw.origin, originId: raw.originId, reason: 'Skipped: unsupported file type' });
      return { itemId, added: false };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    append({ at, type: 'attempt.failed', stageKey: stageKeyValue, model: modelForKind(raw.kind), error: message });
    const failed: Item = {
      id: itemId, origin: raw.origin, originId: raw.originId, kind: raw.kind, title: raw.title,
      capturedAt: raw.capturedAt, status: 'failed', error: message, hasMedia: raw.mediaPath !== undefined,
    };
    if (revising) {
      append({ at, type: 'item.revised', item: failed, segments: [], contentHash: raw.contentHash, mediaPath: raw.mediaPath, supersedes: revising });
      await writeRevised(failed, [], { contentHash: raw.contentHash, mediaPath: raw.mediaPath, ingestedAt: at }, revising);
    } else {
      append({ at, type: 'item.ingested', item: failed, segments: [], contentHash: raw.contentHash, mediaPath: raw.mediaPath });
      await writeIngested(failed, [], { contentHash: raw.contentHash, mediaPath: raw.mediaPath, ingestedAt: at });
    }
    throw err;
  }
  const segments: Segment[] = pieces.map((piece, seq) => ({
    id: itemId + '-s' + seq,
    itemId,
    seq,
    text: piece.text,
    speaker: piece.speaker,
    startMs: piece.startMs,
    endMs: piece.endMs,
    locator: piece.locator,
  }));
  const item: Item = {
    id: itemId, origin: raw.origin, originId: raw.originId, kind: raw.kind, title: raw.title,
    capturedAt: raw.capturedAt, status: 'ready', hasMedia: raw.mediaPath !== undefined,
  };
  if (revising) {
    append({ at, type: 'item.revised', item, segments, contentHash: raw.contentHash, mediaPath: raw.mediaPath, supersedes: revising, api: api as Api });
    await writeRevised(item, segments, { contentHash: raw.contentHash, mediaPath: raw.mediaPath, ingestedAt: at }, revising);
  } else {
    append({ at, type: 'item.ingested', item, segments, contentHash: raw.contentHash, mediaPath: raw.mediaPath, api: api as Api });
    await writeIngested(item, segments, { contentHash: raw.contentHash, mediaPath: raw.mediaPath, ingestedAt: at });
  }
  if (withinBackfill(raw.capturedAt)) await extractItem(itemId, deps);
  return { itemId, added: true };
}


let running = false;

export async function runInboxPoll(deps: IngestDeps = {}): Promise<{ added: number; rejected: number }> {
  if (running) return { added: 0, rejected: 0 };
  running = true;
  try {
    const known = rejectedOriginIds();
    let rejected = 0;
    for (const unsupported of scanUnsupported()) {
      if (known.has('glasses|' + unsupported.originId)) continue;
      append({ at: new Date().toISOString(), type: 'item.rejected', origin: 'glasses', originId: unsupported.originId, reason: unsupported.reason });
      rejected += 1;
    }
    let added = 0;
    for (const raw of scanInbox()) {
      try {
        const result = await ingestRaw(raw, deps);
        if (result.added) added += 1;
      } catch {
        continue;
      }
    }
    append({ at: new Date().toISOString(), type: 'sync.completed', adapter: 'glasses', added });
    await setAdapterState('glasses', { lastSyncAt: new Date().toISOString(), lastError: null });
    return { added, rejected };
  } catch (err) {
    await setAdapterState('glasses', { lastError: err instanceof Error ? err.message : String(err) });
    throw err;
  } finally {
    running = false;
  }
}

export async function ingestVaultScan(scan: { raws: RawItem[]; meta: Map<string, { tags: string[]; aliases: string[]; links: string[] }> }, deps: IngestDeps = {}): Promise<{ added: number }> {
  let added = 0;
  for (const raw of scan.raws) {
    try {
      const result = await ingestRaw(raw, deps);
      if (result.added) added += 1;
      const meta = scan.meta.get(raw.originId);
      if (meta) await writeVaultMeta(raw.origin, raw.originId, meta);
    } catch {
      continue;
    }
  }
  return { added };
}

export async function retireVaultRemoved(originIds: string[]): Promise<number> {
  let retired = 0;
  for (const originId of originIds) {
    const active = await activeItemForOrigin('vault', originId);
    if (!active) continue;
    append({ at: new Date().toISOString(), type: 'item.removed', origin: 'vault', originId, itemId: active.id });
    await markRemoved(active.id);
    retired += 1;
  }
  return retired;
}

export async function ingestRaws(raws: RawItem[], deps: IngestDeps = {}): Promise<{ added: number }> {
  let added = 0;
  for (const raw of raws) {
    try {
      const result = await ingestRaw(raw, deps);
      if (result.added) added += 1;
    } catch {
      continue;
    }
  }
  return { added };
}
