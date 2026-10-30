import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadEnvFiles } from './env.js';

function fixture(): string {
  const dir = mkdtempSync(join(tmpdir(), 'stevens-env-'));
  writeFileSync(join(dir, '.env.local'), 'FIRM_DATABASE_URL=postgres://local/firm\nSHARED=local\n# comment\n\nQUOTED="a b"\n');
  writeFileSync(join(dir, '.env.forge'), 'FIRM_DATABASE_URL=postgres://forge/firm\nFORGE_ONLY=1\n');
  return dir;
}

describe('loadEnvFiles', () => {
  it('fills gaps from .env.local', () => {
    const env: Record<string, string | undefined> = {};
    loadEnvFiles({ dir: fixture(), env });
    expect(env.FIRM_DATABASE_URL).toBe('postgres://local/firm');
    expect(env.QUOTED).toBe('a b');
  });

  it('lets the scenario file override .env.local', () => {
    const env: Record<string, string | undefined> = {};
    loadEnvFiles({ dir: fixture(), env, scenario: 'forge' });
    expect(env.FIRM_DATABASE_URL).toBe('postgres://forge/firm');
    expect(env.SHARED).toBe('local');
    expect(env.FORGE_ONLY).toBe('1');
  });

  it('lets the environment win over both files', () => {
    const env: Record<string, string | undefined> = { FIRM_DATABASE_URL: 'postgres://shell/firm' };
    loadEnvFiles({ dir: fixture(), env, scenario: 'forge' });
    expect(env.FIRM_DATABASE_URL).toBe('postgres://shell/firm');
  });

  it('tolerates missing files and unknown scenarios', () => {
    const env: Record<string, string | undefined> = {};
    loadEnvFiles({ dir: mkdtempSync(join(tmpdir(), 'stevens-env-empty-')), env, scenario: 'mercy' });
    expect(env.FIRM_DATABASE_URL).toBeUndefined();
  });
});
