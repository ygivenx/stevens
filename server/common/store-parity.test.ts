import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { Client } from 'pg';
import { closeStore, columnExists, openStore, type StoreDb } from './store-db.js';

const SCHEMA = `create table if not exists widgets (
  id text primary key,
  n integer not null,
  note text
);`;

function adminUrl(): string {
  if (process.env.FIRM_ADMIN_DATABASE_URL) return process.env.FIRM_ADMIN_DATABASE_URL;
  try {
    for (const line of readFileSync(join(process.cwd(), '.env.local'), 'utf8').split('\n')) {
      if (line.startsWith('FIRM_ADMIN_DATABASE_URL=')) return line.slice('FIRM_ADMIN_DATABASE_URL='.length).trim();
    }
  } catch {
    void 0;
  }
  return '';
}

async function pgReachable(url: string): Promise<boolean> {
  if (!url) return false;
  const client = new Client({ connectionString: url, connectionTimeoutMillis: 3000 });
  try {
    await client.connect();
    await client.end();
    return true;
  } catch {
    return false;
  }
}

async function scenario(db: StoreDb): Promise<unknown> {
  const seen: unknown[] = [];
  await db.run(`insert into widgets (id, n, note) values ($1, $2, $3)`, 'a', 3, null);
  await db.run(`insert into widgets (id, n, note) values ($1, $2, $3) on conflict(id) do nothing`, 'a', 9, 'dup');
  await db.run(`insert into widgets (id, n, note) values ($1, $2, $3) on conflict(id) do update set n = excluded.n`, 'b', 4, 'hi');
  seen.push(await db.get(`select id, n, note from widgets where id = $1`, 'a'));
  seen.push(await db.all(`select id, n, note from widgets order by id`));
  const count = await db.get<{ n: number }>(`select count(*) as n from widgets`);
  seen.push([count?.n, typeof count?.n]);
  await db.withTransaction(async (tx) => {
    await tx.run(`insert into widgets (id, n) values ($1, $2)`, 'c', 5);
  });
  await expect(db.withTransaction(async (tx) => {
    await tx.run(`insert into widgets (id, n) values ($1, $2)`, 'd', 6);
    throw new Error('boom');
  })).rejects.toThrow('boom');
  seen.push(await db.all<{ id: string }>(`select id from widgets order by id`));
  seen.push(await columnExists(db, 'widgets', 'note'));
  seen.push(await columnExists(db, 'widgets', 'missing'));
  return seen;
}

describe('store parity', () => {
  it('runs the portable scenario on sqlite', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'stevens-parity-')), 'parity.db');
    const key = 'parity-sqlite';
    try {
      const db = await openStore(key, { url: undefined, file, schema: SCHEMA, pgSchema: SCHEMA });
      const seen = await scenario(db);
      expect(seen[2]).toEqual([2, 'number']);
      expect(seen[4]).toBe(true);
      expect(seen[5]).toBe(false);
    } finally {
      await closeStore(key);
    }
  });

  it('matches sqlite results on postgres when reachable', async () => {
    const admin = adminUrl();
    if (!(await pgReachable(admin))) return;
    const name = 'stevens_parity_' + process.pid;
    const maint = new Client({ connectionString: admin });
    await maint.connect();
    try {
      await maint.query(`drop database if exists "${name}"`);
      await maint.query(`create database "${name}"`);
    } finally {
      await maint.end();
    }
    const url = admin.replace(/\/[^/]*$/, '/' + name);
    const dir = mkdtempSync(join(tmpdir(), 'stevens-parity-'));
    const sqlite = await openStore('parity-sqlite-compare', { url: undefined, file: join(dir, 'parity.db'), schema: SCHEMA, pgSchema: SCHEMA });
    const savedStore = process.env.STEVENS_STORE;
    process.env.STEVENS_STORE = 'pg';
    const pg = await openStore('parity-pg', { url, file: join(dir, 'unused.db'), schema: SCHEMA, pgSchema: SCHEMA });
    try {
      expect(pg.kind).toBe('pg');
      const [a, b] = [await scenario(sqlite), await scenario(pg)];
      expect(b).toEqual(a);
    } finally {
      await closeStore('parity-sqlite-compare');
      await closeStore('parity-pg');
      if (savedStore === undefined) delete process.env.STEVENS_STORE;
      else process.env.STEVENS_STORE = savedStore;
      const drop = new Client({ connectionString: admin });
      await drop.connect();
      try {
        await drop.query(`drop database if exists "${name}"`);
      } finally {
        await drop.end();
      }
    }
  });

});

describe('parity placeholders', () => {
  let db: StoreDb | null = null;

  beforeAll(async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'stevens-parity-')), 'ph.db');
    db = await openStore('parity-placeholders', { url: undefined, file, schema: SCHEMA, pgSchema: SCHEMA });
  });

  afterAll(async () => {
    await closeStore('parity-placeholders');
  });

  it('rejects duplicate placeholder use as a count mismatch', async () => {
    await expect(db!.run(`select 1 where $1 = $1`, 'a')).rejects.toThrow('placeholder count');
  });
});
