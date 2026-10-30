import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RawItem } from '../../../shared/data.js';
import { getAdapterState, setAdapterState } from '../store.js';
import type { Adapter } from './adapter.js';

export interface ReadwiseHighlight {
  id: number;
  text: string;
  locator: string;
}

export interface ReadwiseBook {
  id: number;
  title: string;
  author: string | null;
  updated: string;
  highlights: ReadwiseHighlight[];
}

interface ExportResponse {
  books: ReadwiseBook[];
  nextCursor: string | null;
}

function fixturesDir(): string {
  return process.env.STEVENS_FIXTURES_DIR ?? join(process.cwd(), 'fixtures');
}

function bookFromApi(book: {
  id: number; title: string; author?: string | null; updated: string; source_url?: string | null;
  highlights: { id: number; text: string; url?: string | null; location?: number }[];
}): ReadwiseBook {
  return {
    id: book.id,
    title: book.title,
    author: book.author ?? null,
    updated: book.updated,
    highlights: book.highlights.map((highlight, index) => ({
      id: highlight.id,
      text: highlight.text,
      locator: highlight.url ?? 'location ' + (highlight.location ?? index + 1),
    })),
  };
}

async function fetchLive(cursor: string | null, token: string): Promise<ExportResponse> {
  const books: ReadwiseBook[] = [];
  let pageCursor: string | null = null;
  for (;;) {
    const params = new URLSearchParams();
    if (cursor) params.set('updatedAfter', cursor);
    if (pageCursor) params.set('pageCursor', pageCursor);
    const res = await fetch('https://readwise.io/api/v2/export/?' + params.toString(), {
      headers: { Authorization: 'Token ' + token },
    });
    if (!res.ok) throw new Error('readwise export failed with status ' + res.status);
    const body = (await res.json()) as {
      results: { id: number; title: string; author?: string | null; updated: string; source_url?: string | null; highlights: { id: number; text: string; url?: string | null; location?: number }[] }[];
      nextPageCursor?: string | null;
    };
    if (!Array.isArray(body.results)) throw new Error('readwise export failed validation');
    books.push(...body.results.map(bookFromApi));
    pageCursor = body.nextPageCursor ?? null;
    if (!pageCursor) break;
  }
  const updated = books.map((book) => book.updated).sort();
  return { books, nextCursor: updated.length > 0 ? updated[updated.length - 1] : cursor };
}

async function fetchFile(): Promise<ExportResponse> {
  const body = JSON.parse(readFileSync(join(fixturesDir(), 'personal', 'readwise-export.json'), 'utf8')) as {
    results: { id: number; title: string; author?: string | null; updated: string; source_url?: string | null; highlights: { id: number; text: string; url?: string | null; location?: number }[] }[];
  };
  const books = body.results.map(bookFromApi);
  const updated = books.map((book) => book.updated).sort();
  return { books, nextCursor: updated.length > 0 ? updated[updated.length - 1] : null };
}

export function bookToRawItem(book: ReadwiseBook): RawItem {
  const normalized = book.highlights.map((highlight) => highlight.text.replace(/\s+/g, ' ').trim()).join('\n');
  return {
    origin: 'readwise',
    originId: 'readwise-' + book.id,
    kind: 'highlight',
    title: book.title,
    capturedAt: book.updated,
    segments: book.highlights.map((highlight) => ({ text: highlight.text, locator: highlight.locator })),
    contentHash: createHash('sha256').update(normalized).digest('hex'),
  };
}

export class ReadwiseAdapter implements Adapter {
  origin = 'readwise' as const;
  label = 'Readwise';
  simulated = process.env.READWISE_TOKEN ? undefined : 'Simulated — Readwise export file';

  async poll(): Promise<RawItem[]> {
    const token = process.env.READWISE_TOKEN;
    const state = await getAdapterState('readwise');
    const cursor = state?.cursor ?? null;
    const fetched = token ? await fetchLive(cursor, token) : await fetchFile();
    const fresh = fetched.books.filter((book) => !cursor || book.updated > cursor);
    if (fetched.nextCursor && fetched.nextCursor !== cursor) {
      await setAdapterState('readwise', { cursor: fetched.nextCursor, lastSyncAt: new Date().toISOString() });
    }
    return fresh.map(bookToRawItem);
  }

  watch(): () => void {
    return () => {};
  }
}
