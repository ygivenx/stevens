import { appendFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import type { LedgerEvent } from '../../shared/data.js';

export const PROMPT_VERSION = 'v2';

export function dataDir(): string {
  const dir = process.env.STEVENS_DATA_DIR ?? join(process.cwd(), 'data');
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function ledgerPath(): string {
  return join(dataDir(), 'ledger.jsonl');
}

export function stageKey(stage: string, sourceIds: string[], promptVersion: string, model: string): string {
  return createHash('sha256').update([stage, ...sourceIds].join('|') + '|' + promptVersion + '|' + model).digest('hex').slice(0, 16);
}

export function append(event: LedgerEvent): void {
  appendFileSync(ledgerPath(), JSON.stringify(event) + '\n');
}

export function readAll(): LedgerEvent[] {
  const path = ledgerPath();
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as LedgerEvent);
}

function eventStageKey(event: LedgerEvent): string | null {
  if ('api' in event && event.api) return event.api.stageKey;
  return null;
}

export function findCompleted(key: string): LedgerEvent | null {
  for (const event of readAll()) {
    if (eventStageKey(event) === key) return event;
  }
  return null;
}

export function completedKeys(): Set<string> {
  const keys = new Set<string>();
  for (const event of readAll()) {
    const key = eventStageKey(event);
    if (key) keys.add(key);
  }
  return keys;
}
