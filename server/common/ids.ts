import { createHash } from 'node:crypto';

export function draftIdFor(prefix: string, key: string): string {
  return prefix + '-' + createHash('sha256').update(key).digest('hex').slice(0, 12);
}

export function questionIdFor(dealId: string, question: string): string {
  return 'q-' + createHash('sha256').update(dealId + '|' + question).digest('hex').slice(0, 12);
}
