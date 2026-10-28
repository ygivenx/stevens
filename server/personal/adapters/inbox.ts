import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, mkdirSync, watch, type FSWatcher } from 'node:fs';
import { join, extname, basename } from 'node:path';
import type { ItemKind, RawItem } from '../../../shared/data.js';
import { dataDir } from '../../common/ledger/store.js';
import type { Adapter } from './adapter.js';

export const AUDIO_EXTS = new Set(['.wav', '.m4a', '.mp3']);
export const PHOTO_EXTS = new Set(['.jpg', '.jpeg', '.png', '.heic']);
export const VIDEO_EXTS = new Set(['.mp4', '.mov']);

export function inboxDir(): string {
  const configured = process.env.STEVENS_INBOX_DIR;
  if (configured) return configured;
  const dir = join(dataDir(), 'inbox');
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function downloaded(stat: { size: number; blocks: number }): boolean {
  return stat.size === 0 || stat.blocks > 0;
}

export function kindFor(filename: string): ItemKind | null {
  const ext = extname(filename).toLowerCase();
  if (AUDIO_EXTS.has(ext)) return 'audio';
  if (PHOTO_EXTS.has(ext)) return 'photo';
  if (VIDEO_EXTS.has(ext)) return 'video';
  return null;
}

export function contentHashForBytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function scanInbox(): RawItem[] {
  const dir = inboxDir();
  const found: RawItem[] = [];
  for (const filename of readdirSync(dir)) {
    const path = join(dir, filename);
    let stat;
    try {
      stat = statSync(path);
      if (!stat.isFile()) continue;
    } catch {
      continue;
    }
    if (stat.size === 0 || !downloaded(stat)) continue;
    const kind = kindFor(filename);
    if (!kind) continue;
    let bytes: Buffer;
    try {
      bytes = readFileSync(path);
    } catch {
      continue;
    }
    found.push({
      origin: 'glasses',
      originId: filename,
      kind,
      title: basename(filename, extname(filename)),
      capturedAt: statSync(path).mtime.toISOString(),
      mediaPath: path,
      contentHash: contentHashForBytes(bytes),
    });
  }
  return found;
}

export function scanUnsupported(): { originId: string; reason: string }[] {
  const dir = inboxDir();
  const found: { originId: string; reason: string }[] = [];
  for (const filename of readdirSync(dir)) {
    const path = join(dir, filename);
    try {
      if (!statSync(path).isFile()) continue;
    } catch {
      continue;
    }
    if (!kindFor(filename)) found.push({ originId: filename, reason: 'Skipped: unsupported file type' });
  }
  return found;
}

export class InboxAdapter implements Adapter {
  origin = 'glasses' as const;
  label = 'Glasses inbox';

  async poll(): Promise<RawItem[]> {
    return scanInbox();
  }

  watch(onItems: (items: RawItem[]) => void): () => void {
    const dir = inboxDir();
    let seen: Set<string>;
    try {
      seen = new Set(scanInbox().map((item) => item.contentHash));
    } catch {
      return () => {};
    }
    let timer: ReturnType<typeof setTimeout> | null = null;
    let watcher: FSWatcher | null = null;
    const sizeOf = (path: string): number => {
      try {
        return statSync(path).size;
      } catch {
        return -1;
      }
    };
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    const settle = async () => {
      for (const item of scanInbox()) {
        if (seen.has(item.contentHash) || !item.mediaPath) continue;
        const first = sizeOf(item.mediaPath);
        await sleep(500);
        const second = sizeOf(item.mediaPath);
        if (first >= 0 && first === second) {
          seen.add(item.contentHash);
          onItems([item]);
        }
      }
    };
    const debounced = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(settle, 1000);
    };
    try {
      watcher = watch(dir, debounced);
    } catch {
      return () => {};
    }
    return () => {
      if (timer) clearTimeout(timer);
      watcher?.close();
    };
  }
}
