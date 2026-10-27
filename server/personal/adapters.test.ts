import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bookToRawItem, ReadwiseAdapter } from './adapters/readwise.js';
import { NotesAdapter, scanNotes, seedNotes } from './adapters/notes.js';
import { splitNote, highlightPieces } from './normalize/text.js';
import { ingestRaw, itemIdFor } from './ingest.js';
import { closeDb, getAdapterState, getItemBundle } from './store.js';

beforeEach(() => {
  closeDb();
  const dir = mkdtempSync(join(tmpdir(), 'stevens-adapters-'));
  process.env.STEVENS_DATA_DIR = dir;
  writeFileSync(join(dir, 'meta-fake.json'), JSON.stringify({ mode: 'normal' }));
  writeFileSync(join(dir, 'meta-calls.json'), JSON.stringify({ count: 0 }));
});

afterEach(() => {
  closeDb();
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
    const bundle = getItemBundle(itemIdFor(raws[0]));
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
    const state = getAdapterState('readwise');
    expect(state?.cursor).toBe('2026-10-23T09:00:00Z');
  });

  it('keeps content hashes stable for the same book', () => {
    const book = { id: 1, title: 'T', author: null, updated: '2026-10-21T09:00:00Z', highlights: [{ id: 1, text: '  hello   world ', locator: 'u' }] };
    expect(bookToRawItem(book).contentHash).toBe(bookToRawItem(book).contentHash);
  });

  it('rejects empty highlight books', () => {
    expect(() => highlightPieces([])).toThrow();
    expect(() => highlightPieces([{ text: '   ' }])).toThrow();
  });
});

describe('notes adapter', () => {
  it('seeds the notes folder and ingests a note with heading locators', async () => {
    seedNotes();
    const adapter = new NotesAdapter();
    const raws = await adapter.poll();
    expect(raws.length).toBeGreaterThan(0);
    const note = raws.find((raw) => raw.originId === 'oct-20-conference.md');
    expect(note).toBeDefined();
    const result = await ingestRaw(note as NonNullable<typeof note>);
    expect(result.added).toBe(true);
    const bundle = getItemBundle(result.itemId);
    expect(bundle?.item.status).toBe('ready');
    const locators = (bundle?.segments ?? []).map((segment) => segment.locator);
    expect(locators.some((locator) => (locator ?? '').startsWith('#'))).toBe(true);
  });

  it('scans only markdown files', () => {
    seedNotes();
    expect(scanNotes().every((raw) => raw.originId.endsWith('.md'))).toBe(true);
  });
});

describe('note splitting', () => {
  it('splits on headings and blank lines with heading locators', () => {
    const pieces = splitNote('# Title\n\nFirst para.\n\n## Sub\n\nSecond para.\n\nThird para.');
    expect(pieces.map((piece) => piece.locator)).toEqual(['#Title', '#Sub', '#Sub']);
    expect(pieces[0].text).toBe('First para.');
    expect(pieces[2].text).toBe('Third para.');
  });

  it('keeps locator note without headings', () => {
    expect(splitNote('Just a note.')).toEqual([{ text: 'Just a note.', locator: 'note' }]);
  });
});
