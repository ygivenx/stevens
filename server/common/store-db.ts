import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { Pool, types, type PoolClient } from 'pg';

types.setTypeParser(20, (value: string) => Number.parseInt(value, 10));

export interface StoreDb {
  readonly kind: 'pg' | 'sqlite';
  all<T>(sql: string, ...params: unknown[]): Promise<T[]>;
  get<T>(sql: string, ...params: unknown[]): Promise<T | undefined>;
  run(sql: string, ...params: unknown[]): Promise<void>;
  exec(sql: string): Promise<void>;
  withTransaction<T>(fn: (tx: StoreDb) => Promise<T>): Promise<T>;
}

export function storeBackend(): 'pg' | 'sqlite' {
  const explicit = process.env.STEVENS_STORE;
  if (explicit === 'sqlite' || explicit === 'pg') return explicit;
  return process.env.VITEST ? 'sqlite' : 'pg';
}

type SqliteParams = (string | number | bigint | Buffer | null)[];

function sqliteSql(sql: string, params: unknown[]): { text: string; params: SqliteParams } {
  const order: number[] = [];
  const text = sql.replace(/\$(\d+)/g, (_match, num) => {
    order.push(Number(num));
    return '?';
  });
  if (order.length !== params.length) throw new Error('placeholder count does not match params: ' + sql);
  return { text, params: order.map((num) => (params[num - 1] === undefined ? null : (params[num - 1] as string | number | bigint | Buffer | null))) };
}

function sqliteStore(file: string): { db: StoreDb; close: () => void } {
  mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  const wrap = (handle: DatabaseSync): StoreDb => ({
    kind: 'sqlite',
    all: async <T>(sql: string, ...params: unknown[]): Promise<T[]> => {
      const query = sqliteSql(sql, params);
      return handle.prepare(query.text).all(...query.params) as unknown as T[];
    },
    get: async <T>(sql: string, ...params: unknown[]): Promise<T | undefined> => {
      const query = sqliteSql(sql, params);
      return handle.prepare(query.text).get(...query.params) as unknown as T | undefined;
    },
    run: async (sql: string, ...params: unknown[]): Promise<void> => {
      const query = sqliteSql(sql, params);
      handle.prepare(query.text).run(...query.params);
    },
    exec: async (sql: string): Promise<void> => {
      handle.exec(sql);
    },
    withTransaction: async <T>(fn: (tx: StoreDb) => Promise<T>): Promise<T> => {
      handle.exec('BEGIN');
      try {
        const out = await fn(wrap(handle));
        handle.exec('COMMIT');
        return out;
      } catch (err) {
        handle.exec('ROLLBACK');
        throw err;
      }
    },
  });
  return { db: wrap(db), close: () => db.close() };
}

function clientStore(client: Pool | PoolClient): StoreDb {
  return {
    kind: 'pg',
    all: async <T>(sql: string, ...params: unknown[]): Promise<T[]> => {
      const res = await client.query(sql, params);
      return res.rows as T[];
    },
    get: async <T>(sql: string, ...params: unknown[]): Promise<T | undefined> => {
      const res = await client.query(sql, params);
      return (res.rows[0] ?? undefined) as T | undefined;
    },
    run: async (sql: string, ...params: unknown[]): Promise<void> => {
      await client.query(sql, params);
    },
    exec: async (sql: string): Promise<void> => {
      await client.query(sql);
    },
    withTransaction: async <T>(fn: (tx: StoreDb) => Promise<T>): Promise<T> => {
      if ('release' in client && typeof client.release === 'function') {
        await client.query('BEGIN');
        try {
          const out = await fn(clientStore(client));
          await client.query('COMMIT');
          return out;
        } catch (err) {
          await client.query('ROLLBACK');
          throw err;
        }
      }
      const pool = client as Pool;
      const single = await pool.connect();
      try {
        await single.query('BEGIN');
        try {
          const out = await fn(clientStore(single));
          await single.query('COMMIT');
          return out;
        } catch (err) {
          await single.query('ROLLBACK');
          throw err;
        }
      } finally {
        single.release();
      }
    },
  };
}

const open: Map<string, { db: StoreDb; close: () => Promise<void> }> = new Map();

export async function openStore(key: string, opts: { url: string | undefined; file: string; schema: string; pgSchema: string }): Promise<StoreDb> {
  const found = open.get(key);
  if (found) return found.db;
  if (storeBackend() === 'sqlite') {
    const store = sqliteStore(opts.file);
    await store.db.exec(opts.schema);
    open.set(key, { db: store.db, close: async () => store.close() });
    return store.db;
  }
  if (!opts.url) throw new Error('Postgres URL is not set for the ' + key + ' store');
  const pool = new Pool({ connectionString: opts.url });
  pool.on('error', (err) => {
    console.error('store pool error (' + key + '): ' + (err instanceof Error ? err.message : String(err)));
  });
  const db = clientStore(pool);
  await db.exec(opts.pgSchema);
  open.set(key, { db, close: async () => { await pool.end(); } });
  return db;
}

export async function closeStore(key: string): Promise<void> {
  const found = open.get(key);
  if (!found) return;
  open.delete(key);
  await found.close();
}

export async function columnExists(db: StoreDb, table: string, column: string): Promise<boolean> {
  if (db.kind === 'pg') {
    const rows = await db.all<{ exists: boolean }>(
      `select exists (select 1 from information_schema.columns where table_name = $1 and column_name = $2) as "exists"`,
      table, column,
    );
    return rows[0]?.exists ?? false;
  }
  const row = await db.get<{ sql: string | null }>(`select sql from sqlite_master where name = $1`, table);
  return !!row?.sql && row.sql.toLowerCase().includes(column.toLowerCase());
}
