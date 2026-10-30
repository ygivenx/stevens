import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, utimesSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bookToRawItem, ReadwiseAdapter } from './adapters/readwise.js';
import { VaultAdapter, parseFrontmatter, scanVault, seedVault, vaultDir, wikilinkTargets } from './adapters/vault.js';
import { splitNote, highlightPieces } from './normalize/text.js';
import { ingestRaw, itemIdFor } from './ingest.js';
import { closeDb, getAdapterState, getItemBundle } from './store.js';

function settleVault(): void {
  const past = new Date(Date.now() - 10 * 60 * 1000);
  const walk = (current: string): void => {
    for (const name of readdirSync(current)) {
      const path = join(current, name);
      if (statSync(path).isDirectory()) walk(path);
      else utimesSync(path, past, past);
    }
  };
  walk(vaultDir());
}

beforeEach(async () => {
  await closeDb();
  const dir = mkdtempSync(join(tmpdir(), 'stevens-adapters-'));
  process.env.STEVENS_DATA_DIR = dir;
  process.env.STEVENS_NOW = '2026-10-28T14:00:00-04:00';
  delete process.env.STEVENS_VAULT_DIR;
  delete process.env.STEVENS_VAULT_EXCLUDE;
  writeFileSync(join(dir, 'meta-fake.json'), JSON.stringify({ mode: 'normal' }));
  writeFileSync(join(dir, 'meta-calls.json'), JSON.stringify({ count: 0 }));
});

afterEach(async () => {
  delete process.env.STEVENS_NOW;
  delete process.env.STEVENS_VAULT_DIR;
  delete process.env.STEVENS_VAULT_EXCLUDE;
  await closeDb();
});

describe('readwise adapter', () => {
  it('turns each book into an item with one segment per highlight', async () => {
    const adapter = new ReadwiseAdapter();
    expect(adapter.simulated).toContain('export file');
    const raws = await adapter.poll();
    expect(raws).toHaveLength(3);
    expect(raws[0].kind).toBe('highlight');
    expect(raws[0].segments).toHaveLength(1);
    for (const raw of raws) {
      const result = await ingestRaw(raw);
      expect(result.added).toBe(true);
    }
    const bundle = await getItemBundle(itemIdFor(raws[0]));
    expect(bundle?.item.status).toBe('ready');
    expect(bundle?.segments).toHaveLength(1);
    expect(bundle?.segments[0].locator).toContain('example.com');
    expect((bundle?.claims ?? []).length).toBeGreaterThan(0);
  });

  it('adds nothing on a second sync', async () => {
    const adapter = new ReadwiseAdapter();
    const first = await adapter.poll();
    expect(first.length).toBeGreaterThan(0);
    for (const raw of first) await ingestRaw(raw);
    const second = await adapter.poll();
    expect(second).toHaveLength(0);
    const state = await getAdapterState('readwise');
    expect(state?.cursor).toBe('2026-10-23T09:00:00Z');
  });

  it('keeps content hashes stable for the same book', async () => {
    const book = { id: 1, title: 'T', author: null, updated: '2026-10-21T09:00:00Z', highlights: [{ id: 1, text: '  hello   world ', locator: 'u' }] };
    expect(bookToRawItem(book).contentHash).toBe(bookToRawItem(book).contentHash);
  });

  it('rejects empty highlight books', async () => {
    expect(() => highlightPieces([])).toThrow();
    expect(() => highlightPieces([{ text: '   ' }])).toThrow();
  });
});

describe('vault adapter', () => {
  it('seeds the vault and ingests a note with heading locators', async () => {
    seedVault();
    settleVault();
    const adapter = new VaultAdapter();
    expect(adapter.label).toBe('Obsidian notes');
    const raws = await adapter.poll();
    expect(raws.length).toBeGreaterThan(0);
    const note = raws.find((raw) => raw.originId === 'oct-20-conference.md');
    expect(note).toBeDefined();
    expect(note?.origin).toBe('vault');
    const result = await ingestRaw(note as NonNullable<typeof note>);
    expect(result.added).toBe(true);
    const bundle = await getItemBundle(result.itemId);
    expect(bundle?.item.status).toBe('ready');
    const locators = (bundle?.segments ?? []).map((segment) => segment.locator);
    expect(locators.some((locator) => (locator ?? '').startsWith('#'))).toBe(true);
  });

  it('skips dot folders, excluded prefixes and stevens-skip notes', async () => {
    process.env.STEVENS_VAULT_EXCLUDE = 'Archive';
    seedVault();
    settleVault();
    const ids = scanVault().raws.map((raw) => raw.originId);
    expect(ids).toContain('oct-20-conference.md');
    expect(ids).not.toContain('Archive/buried.md');
    expect(ids).not.toContain('scratch.md');
    expect(ids.every((id) => !id.includes('.obsidian'))).toBe(true);
  });

  it('reads tags, aliases and wikilink targets without ingesting frontmatter', async () => {
    seedVault();
    settleVault();
    const scan = scanVault();
    const meta = scan.meta.get('oct-20-conference.md');
    expect(meta?.tags).toContain('benchmarks');
    expect(meta?.aliases).toContain('Oct 20 talk notes');
    expect(meta?.links).toContain('Helios prep');
    expect(wikilinkTargets('See [[Target note|alias]] and [[Other#section]].')).toEqual(['Target note', 'Other']);
    const note = scan.raws.find((raw) => raw.originId === 'oct-20-conference.md');
    expect(note?.text).not.toContain('stevens:');
    expect(note?.text).not.toContain('tags:');
    expect(note?.text).not.toContain('aliases:');
  });

  it('holds unsettled notes until the quiet period passes', async () => {
    seedVault();
    const fresh = scanVault();
    expect(fresh.settled).toBe(false);
    expect(fresh.raws).toHaveLength(0);
    settleVault();
    const settled = scanVault();
    expect(settled.settled).toBe(true);
    expect(settled.raws.length).toBeGreaterThan(0);
  });

  it('never writes into a configured vault', async () => {
    const configured = mkdtempSync(join(tmpdir(), 'stevens-real-vault-'));
    writeFileSync(join(configured, 'mine.md'), '# Mine\n');
    process.env.STEVENS_VAULT_DIR = configured;
    seedVault();
    expect(readdirSync(configured)).toEqual(['mine.md']);
  });

  it('parses frontmatter lists and the skip marker', async () => {
    const parsed = parseFrontmatter('---\ntags:\n  - a\n  - b\naliases: Solo\n---\n\nBody.\n');
    expect(parsed.skip).toBe(false);
    expect(parsed.tags).toEqual(['a', 'b']);
    expect(parsed.aliases).toEqual(['Solo']);
    expect(parsed.body.trim()).toBe('Body.');
    expect(parseFrontmatter('---\nstevens: skip\n---\n\nBody.\n').skip).toBe(true);
    expect(parseFrontmatter('No frontmatter.\n').body).toBe('No frontmatter.\n');
  });

  it('creates the default vault dir but not a configured one', async () => {
    const dir = vaultDir();
    expect(statSync(dir).isDirectory()).toBe(true);
    const missing = join(tmpdir(), 'stevens-no-vault-' + Date.now());
    process.env.STEVENS_VAULT_DIR = missing;
    expect(vaultDir()).toBe(missing);
  });
});

describe('note splitting', () => {
  it('splits on headings and blank lines with heading locators', async () => {
    const pieces = splitNote('# Title\n\nFirst para.\n\n## Sub\n\nSecond para.\n\nThird para.');
    expect(pieces.map((piece) => piece.locator)).toEqual(['#Title', '#Sub', '#Sub']);
    expect(pieces[0].text).toBe('First para.');
    expect(pieces[2].text).toBe('Third para.');
  });

  it('keeps locator note without headings', async () => {
    expect(splitNote('Just a note.')).toEqual([{ text: 'Just a note.', locator: 'note' }]);
  });
});
