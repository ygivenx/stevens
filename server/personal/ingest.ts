import { createHash } from 'node:crypto';
import type { Api, Item, RawItem, Segment } from '../../shared/data.js';
import type { Piece } from './normalize/audio.js';
import { append, readAll } from '../common/ledger/store.js';
import { voiceModel, visionModel } from '../common/meta/client.js';
import { scanInbox, scanUnsupported } from './adapters/inbox.js';
import { normalizeAudio, type AudioDeps } from './normalize/audio.js';
import { normalizePhoto, type PhotoDeps } from './normalize/photo.js';
import { normalizeVideo, type VideoDeps } from './normalize/video.js';
import { extractItem, type ExtractDeps } from './extract.js';
import { hasContentHash, writeIngested } from './store.js';

export interface IngestDeps extends AudioDeps, PhotoDeps, VideoDeps, ExtractDeps {}

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
  if (ingestedItemIds().has(itemId) || hasContentHash(raw.contentHash)) return { itemId, added: false };
  const at = new Date().toISOString();
  if (!raw.mediaPath) {
    append({ at, type: 'item.rejected', origin: raw.origin, originId: raw.originId, reason: 'Skipped: unsupported file type' });
    return { itemId, added: false };
  }
  let pieces: Piece[] = [];
  let api: Api | null = null;
  let stageKeyValue = 'normalize:' + raw.contentHash;
  try {
    if (raw.kind === 'audio') ({ pieces, api } = await normalizeAudio(raw.mediaPath, raw.contentHash, deps));
    else if (raw.kind === 'photo') ({ pieces, api } = await normalizePhoto(raw.mediaPath, raw.contentHash, deps));
    else ({ pieces, api } = await normalizeVideo(raw.mediaPath, raw.contentHash, deps));
    stageKeyValue = (api as Api).stageKey;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    append({ at, type: 'attempt.failed', stageKey: stageKeyValue, model: modelForKind(raw.kind), error: message });
    const failed: Item = {
      id: itemId, origin: raw.origin, originId: raw.originId, kind: raw.kind, title: raw.title,
      capturedAt: raw.capturedAt, status: 'failed', error: message, hasMedia: true,
    };
    append({ at, type: 'item.ingested', item: failed, segments: [], contentHash: raw.contentHash, mediaPath: raw.mediaPath });
    writeIngested(failed, [], { contentHash: raw.contentHash, mediaPath: raw.mediaPath, ingestedAt: at });
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
    capturedAt: raw.capturedAt, status: 'ready', hasMedia: true,
  };
  append({ at, type: 'item.ingested', item, segments, contentHash: raw.contentHash, mediaPath: raw.mediaPath, api: api as Api });
  writeIngested(item, segments, { contentHash: raw.contentHash, mediaPath: raw.mediaPath, ingestedAt: at });
  await extractItem(itemId, deps);
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
    return { added, rejected };
  } finally {
    running = false;
  }
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
