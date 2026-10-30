import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { closeStore, columnExists, openStore } from './store-db.js';

const SCHEMA = `create table if not exists widgets (
  id text primary key,
  n integer not null,
  note text
);`;

async function scratch(): Promise<{ key: string; file: string }> {
  const dir = mkdtempSync(join(tmpdir(), 'stevens-storedb-'));
  const key = 'test-' + dir.replace(/[^a-zA-Z0-9]/g, '').slice(-12);
  return { key, file: join(dir, 'test.db') };
}

describe('store database', () => {
  it('applies the schema and round-trips rows with $n placeholders', async () => {
    const { key, file } = await scratch();
    try {
      const db = await openStore(key, { url: undefined, file, schema: SCHEMA, pgSchema: SCHEMA });
      expect(db.kind).toBe('sqlite');
      await db.run(`insert into widgets (id, n, note) values ($1, $2, $3)`, 'a', 3, null);
      await db.run(`insert into widgets (id, n, note) values ($1, $2, $3) on conflict(id) do nothing`, 'a', 9, 'dup');
      const one = await db.get<{ id: string; n: number; note: string | null }>(`select id, n, note from widgets where id = $1`, 'a');
      expect(one).toEqual({ id: 'a', n: 3, note: null });
      expect(await db.all<{ id: string }>(`select id from widgets order by id`)).toEqual([{ id: 'a' }]);
    } finally {
      await closeStore(key);
    }
  });

  it('reorders out-of-order placeholders and rejects count mismatches', async () => {
    const { key, file } = await scratch();
    try {
      const db = await openStore(key, { url: undefined, file, schema: SCHEMA, pgSchema: SCHEMA });
      await db.run(`insert into widgets (id, n, note) values ($1, $2, $3)`, 'a', 1, 'hi');
      const row = await db.get<{ n: number }>(`select n from widgets where note = $2 and id = $1`, 'a', 'hi');
      expect(row?.n).toBe(1);
      await expect(db.run(`select 1 where $1 = $2`, 'a')).rejects.toThrow('placeholder count');
    } finally {
      await closeStore(key);
    }
  });

  it('rolls back failed transactions', async () => {
    const { key, file } = await scratch();
    try {
      const db = await openStore(key, { url: undefined, file, schema: SCHEMA, pgSchema: SCHEMA });
      await expect(db.withTransaction(async (tx) => {
        await tx.run(`insert into widgets (id, n) values ($1, $2)`, 'a', 1);
        throw new Error('boom');
      })).rejects.toThrow('boom');
      expect(await db.all(`select id from widgets`)).toEqual([]);
    } finally {
      await closeStore(key);
    }
  });

  it('detects columns', async () => {
    const { key, file } = await scratch();
    try {
      const db = await openStore(key, { url: undefined, file, schema: SCHEMA, pgSchema: SCHEMA });
      expect(await columnExists(db, 'widgets', 'note')).toBe(true);
      expect(await columnExists(db, 'widgets', 'missing')).toBe(false);
    } finally {
      await closeStore(key);
    }
  });

  it('refuses the pg backend without a URL', async () => {
    const saved = process.env.STEVENS_STORE;
    process.env.STEVENS_STORE = 'pg';
    try {
      await expect(openStore('test-no-url', { url: undefined, file: '/tmp/stevens-nope.db', schema: SCHEMA, pgSchema: SCHEMA })).rejects.toThrow('not set');
    } finally {
      if (saved === undefined) delete process.env.STEVENS_STORE;
      else process.env.STEVENS_STORE = saved;
    }
  });
});
