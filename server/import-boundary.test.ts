import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(path));
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) out.push(path);
  }
  return out;
}

function importsOf(path: string): string[] {
  const text = readFileSync(path, 'utf8');
  const found: string[] = [];
  for (const match of text.matchAll(/(?:import|export)[^'"]*['"]([^'"]+)['"]/g)) found.push(match[1]);
  return found;
}

function references(outside: string, files: string[]): string[] {
  return files.filter((file) => importsOf(file).some((spec) => spec.includes(outside)));
}

describe('import boundary', () => {
  const firm = listFiles('server/firm');
  const personal = listFiles('server/personal');
  const common = listFiles('server/common');

  it('keeps personal code out of the firm process', () => {
    expect(references('server/personal', firm)).toEqual([]);
    expect(references('../personal', firm)).toEqual([]);
  });

  it('keeps firm code out of the personal process', () => {
    expect(references('server/firm', personal)).toEqual([]);
    expect(references('../firm', personal)).toEqual([]);
  });

  it('keeps common independent of both processes', () => {
    expect(references('server/firm', common)).toEqual([]);
    expect(references('server/personal', common)).toEqual([]);
    expect(references('../firm', common)).toEqual([]);
    expect(references('../personal', common)).toEqual([]);
  });

  it('keeps personal data paths out of firm sources', () => {
    const offenders = firm.filter((file) => {
      const text = readFileSync(file, 'utf8');
      return text.includes('data/personal') || text.includes('personal.db');
    });
    expect(offenders).toEqual([]);
  });

  it('keeps the boundary modules where the tests expect them', () => {
    for (const required of [
      'server/common/boundary/rules.ts',
      'server/common/boundary/policy.ts',
      'server/common/boundary/assemble.ts',
      'server/common/ledger/store.ts',
      'server/common/db.ts',
      'server/common/clock.ts',
      'server/firm/index.ts',
      'server/firm/agent-auth.ts',
      'server/personal/index.ts',
      'server/personal/firm-client.ts',
    ]) {
      expect(existsSync(required)).toBe(true);
    }
  });
});
