import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import type { RawItem } from '../../../shared/data.js';
import { dataDir } from '../../common/ledger/store.js';
import type { Adapter } from './adapter.js';
import { watchDir } from './watch.js';

export function notesDir(): string {
  const dir = join(dataDir(), 'notes');
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function seedNotes(): void {
  const dir = notesDir();
  const fixtures = join(process.env.STEVENS_FIXTURES_DIR ?? join(process.cwd(), 'fixtures'), 'personal', 'notes');
  let names: string[] = [];
  try {
    names = readdirSync(fixtures).filter((name) => name.endsWith('.md'));
  } catch {
    return;
  }
  for (const name of names) {
    const dest = join(dir, name);
    if (!existsSync(dest)) copyFileSync(join(fixtures, name), dest);
  }
}

function titleFor(text: string, filename: string): string {
  const heading = text.split('\n').find((line) => line.startsWith('# '));
  if (heading) return heading.replace(/^# /, '').trim();
  return basename(filename, '.md');
}

export function scanNotes(): RawItem[] {
  const dir = notesDir();
  const found: RawItem[] = [];
  for (const filename of readdirSync(dir)) {
    if (!filename.endsWith('.md')) continue;
    const path = join(dir, filename);
    let stat;
    try {
      stat = statSync(path);
      if (!stat.isFile()) continue;
    } catch {
      continue;
    }
    const text = readFileSync(path, 'utf8');
    if (text.trim().length === 0) continue;
    found.push({
      origin: 'notes',
      originId: filename,
      kind: 'note',
      title: titleFor(text, filename),
      capturedAt: stat.mtime.toISOString(),
      text,
      contentHash: createHash('sha256').update(text.replace(/\s+/g, ' ').trim()).digest('hex'),
    });
  }
  return found;
}

export class NotesAdapter implements Adapter {
  origin = 'notes' as const;
  label = 'Notes folder';

  async poll(): Promise<RawItem[]> {
    return scanNotes();
  }

  watch(onItems: (items: RawItem[]) => void): () => void {
    const seen = new Set(scanNotes().map((item) => item.contentHash));
    return watchDir(notesDir(), () => {
      const fresh = scanNotes().filter((item) => !seen.has(item.contentHash));
      for (const item of fresh) seen.add(item.contentHash);
      if (fresh.length > 0) onItems(fresh);
    });
  }
}
