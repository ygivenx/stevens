import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import type { PathLike } from 'node:fs';
import { join } from 'node:path';
import { dataDir } from './ledger/store.js';

export function dbFile(name: string): string {
  return join(dataDir(), name);
}

export function openDatabase(name: string, schemaFile: string | PathLike): DatabaseSync {
  const db = new DatabaseSync(dbFile(name));
  db.exec(readFileSync(schemaFile, 'utf8'));
  return db;
}
