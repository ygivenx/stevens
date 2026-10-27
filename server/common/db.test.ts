import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from './db.js';

const previousDataDir = process.env.STEVENS_DATA_DIR;

afterEach(() => {
  process.env.STEVENS_DATA_DIR = previousDataDir;
});

function tables(name: string, schema: string): string[] {
  process.env.STEVENS_DATA_DIR = mkdtempSync(join(tmpdir(), 'stevens-db-'));
  const db = openDatabase(name, schema);
  const rows = db.prepare(`select name from sqlite_master where type = 'table' order by name`).all() as { name: string }[];
  db.close();
  return rows.map((row) => row.name);
}

describe('process databases', () => {
  it('creates the personal tables from the personal schema', () => {
    const names = tables('personal.db', fileURLToPath(new URL('../personal/db/schema.sql', import.meta.url)));
    for (const expected of ['items', 'segments', 'segments_fts', 'claims', 'shares', 'adapter_state']) {
      expect(names).toContain(expected);
    }
  });

  it('creates the firm tables from the firm schema', () => {
    const names = tables('firm.db', fileURLToPath(new URL('../firm/db/schema.sql', import.meta.url)));
    for (const expected of ['people', 'deals', 'deal_team', 'meetings', 'documents', 'document_acl', 'portfolio', 'filings', 'connector_state']) {
      expect(names).toContain(expected);
    }
  });
});
