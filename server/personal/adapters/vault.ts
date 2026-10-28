import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, watch, type FSWatcher } from 'node:fs';
import { join, relative, basename, sep } from 'node:path';
import type { RawItem } from '../../../shared/data.js';
import { dataDir } from '../../common/ledger/store.js';
import type { Adapter } from './adapter.js';

export const QUIET_MS = 2 * 60 * 1000;

export function vaultDir(): string {
  const configured = process.env.STEVENS_VAULT_DIR;
  if (configured) return configured;
  const dir = join(dataDir(), 'vault');
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function vaultName(): string {
  return basename(vaultDir());
}

export function excludePrefixes(): string[] {
  return (process.env.STEVENS_VAULT_EXCLUDE ?? '')
    .split(',')
    .map((entry) => entry.trim().replace(/\/+$/, ''))
    .filter((entry) => entry.length > 0);
}

function copyMissing(src: string, dest: string): void {
  for (const name of readdirSync(src)) {
    if (name === '.DS_Store') continue;
    const from = join(src, name);
    const to = join(dest, name);
    if (statSync(from).isDirectory()) {
      mkdirSync(to, { recursive: true });
      copyMissing(from, to);
    } else if (!existsSync(to)) {
      copyFileSync(from, to);
    }
  }
}

export function seedVault(): void {
  if (process.env.STEVENS_VAULT_DIR) return;
  const dir = vaultDir();
  const fixtures = join(process.env.STEVENS_FIXTURES_DIR ?? join(process.cwd(), 'fixtures'), 'personal', 'vault');
  try {
    if (!statSync(fixtures).isDirectory()) return;
  } catch {
    return;
  }
  copyMissing(fixtures, dir);
}

export interface VaultMeta {
  tags: string[];
  aliases: string[];
  links: string[];
}

function scalar(value: string): string {
  return value.trim().replace(/^['"]|['"]$/g, '');
}

export function parseFrontmatter(text: string): { skip: boolean; tags: string[]; aliases: string[]; body: string } {
  const tags: string[] = [];
  const aliases: string[] = [];
  if (!text.startsWith('---\n') && !text.startsWith('---\r\n')) return { skip: false, tags, aliases, body: text };
  const lines = text.split('\n');
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      end = i;
      break;
    }
  }
  if (end < 0) return { skip: false, tags, aliases, body: text };
  const body = lines.slice(end + 1).join('\n');
  let listKey: string | null = null;
  for (const line of lines.slice(1, end)) {
    const item = line.match(/^\s*-\s+(.*)$/);
    if (item && listKey) {
      const value = scalar(item[1]);
      if (listKey === 'tags') tags.push(value);
      else if (listKey === 'aliases') aliases.push(value);
      continue;
    }
    const cut = line.indexOf(':');
    if (cut < 0) {
      listKey = null;
      continue;
    }
    const key = line.slice(0, cut).trim();
    const value = scalar(line.slice(cut + 1));
    listKey = value.length === 0 ? key : null;
    if (key === 'tags' && value.length > 0) tags.push(value);
    else if (key === 'aliases' && value.length > 0) aliases.push(value);
  }
  const skip = lines.slice(1, end).some((line) => {
    const cut = line.indexOf(':');
    return cut > 0 && line.slice(0, cut).trim() === 'stevens' && scalar(line.slice(cut + 1)) === 'skip';
  });
  return { skip, tags, aliases, body };
}

export function wikilinkTargets(body: string): string[] {
  const found: string[] = [];
  const pattern = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(body)) !== null) {
    const target = match[1].trim();
    if (target.length > 0 && !found.includes(target)) found.push(target);
  }
  return found;
}

function titleFor(body: string, rel: string): string {
  const heading = body.split('\n').find((line) => line.startsWith('# '));
  if (heading) return heading.replace(/^# /, '').trim();
  return basename(rel, '.md');
}

function excluded(rel: string, prefixes: string[]): boolean {
  return prefixes.some((prefix) => rel === prefix || rel.startsWith(prefix + '/'));
}

export interface VaultScan {
  raws: RawItem[];
  meta: Map<string, VaultMeta>;
  settled: boolean;
}

export function scanVault(knownMtime?: Map<string, number>): VaultScan {
  const dir = vaultDir();
  const prefixes = excludePrefixes();
  const raws: RawItem[] = [];
  const meta = new Map<string, VaultMeta>();
  let settled = true;
  const walk = (current: string): void => {
    let names: string[];
    try {
      names = readdirSync(current);
    } catch {
      return;
    }
    for (const name of names) {
      if (name.startsWith('.')) continue;
      const path = join(current, name);
      let stat;
      try {
        stat = statSync(path);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        walk(path);
        continue;
      }
      if (!name.endsWith('.md')) continue;
      const rel = relative(dir, path).split(sep).join('/');
      if (excluded(rel, prefixes)) continue;
      const mtime = stat.mtimeMs;
      if (Date.now() - mtime < QUIET_MS) {
        settled = false;
        continue;
      }
      if (knownMtime && knownMtime.get(rel) === mtime) continue;
      knownMtime?.set(rel, mtime);
      let text: string;
      try {
        text = readFileSync(path, 'utf8');
      } catch {
        continue;
      }
      const parsed = parseFrontmatter(text);
      if (parsed.skip) continue;
      const body = parsed.body;
      if (body.trim().length === 0) continue;
      meta.set(rel, { tags: parsed.tags, aliases: parsed.aliases, links: wikilinkTargets(body) });
      raws.push({
        origin: 'vault',
        originId: rel,
        kind: 'note',
        title: titleFor(body, rel),
        capturedAt: stat.mtime.toISOString(),
        text: body,
        contentHash: createHash('sha256').update(body.replace(/\s+/g, ' ').trim()).digest('hex'),
      });
    }
  };
  walk(dir);
  return { raws, meta, settled };
}

export function vaultPaths(): string[] {
  const dir = vaultDir();
  const prefixes = excludePrefixes();
  const paths: string[] = [];
  const walk = (current: string): void => {
    let names: string[];
    try {
      names = readdirSync(current);
    } catch {
      return;
    }
    for (const name of names) {
      if (name.startsWith('.')) continue;
      const path = join(current, name);
      let stat;
      try {
        stat = statSync(path);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        walk(path);
        continue;
      }
      if (!name.endsWith('.md')) continue;
      const rel = relative(dir, path).split(sep).join('/');
      if (!excluded(rel, prefixes)) paths.push(rel);
    }
  };
  walk(dir);
  return paths;
}

export class VaultAdapter implements Adapter {
  origin = 'vault' as const;
  label = 'Obsidian notes';

  async poll(): Promise<RawItem[]> {
    return scanVault().raws;
  }

  watch(onItems: (items: RawItem[]) => void): () => void {
    return this.watchChanges((scan) => onItems(scan.raws), () => {});
  }

  watchChanges(onScan: (scan: VaultScan) => void, onRemoved: (originIds: string[]) => void): () => void {
    const dir = vaultDir();
    const mtimes = new Map<string, number>();
    const known = new Map<string, string>();
    try {
      const first = scanVault(mtimes);
      for (const item of first.raws) known.set(item.originId, item.contentHash);
    } catch {
      return () => {};
    }
    let timer: ReturnType<typeof setTimeout> | null = null;
    let rescan: ReturnType<typeof setTimeout> | null = null;
    let watcher: FSWatcher | null = null;
    const settle = () => {
      let scanned: VaultScan;
      try {
        scanned = scanVault(mtimes);
      } catch {
        return;
      }
      const fresh = scanned.raws.filter((item) => known.get(item.originId) !== item.contentHash);
      const onDisk = new Set(vaultPaths());
      const gone = [...known.keys()].filter((originId) => !onDisk.has(originId));
      for (const item of fresh) known.set(item.originId, item.contentHash);
      for (const originId of gone) known.delete(originId);
      if (fresh.length > 0) {
        const meta = new Map<string, VaultMeta>();
        for (const item of fresh) {
          const entry = scanned.meta.get(item.originId);
          if (entry) meta.set(item.originId, entry);
        }
        onScan({ raws: fresh, meta, settled: scanned.settled });
      }
      if (gone.length > 0) onRemoved(gone);
      if (!scanned.settled && !rescan) {
        rescan = setTimeout(() => {
          rescan = null;
          settle();
        }, 60 * 1000);
      }
    };
    const debounced = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(settle, 2000);
    };
    try {
      watcher = watch(dir, { recursive: true }, debounced);
    } catch {
      watcher = null;
    }
    const interval = setInterval(settle, 60 * 1000);
    return () => {
      if (timer) clearTimeout(timer);
      if (rescan) clearTimeout(rescan);
      clearInterval(interval);
      watcher?.close();
    };
  }
}
