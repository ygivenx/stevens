import { DatabaseSync } from 'node:sqlite';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
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

export function openProcessDb(name: string, schemaFile: string | PathLike): DatabaseSync {
  const file = dbFile(name);
  if (!existsSync(file)) return openDatabase(name, schemaFile);
  mkdirSync(dirname(file), { recursive: true });
  return new DatabaseSync(file);
}
