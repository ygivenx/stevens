import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Access, Purpose, Role, Source } from '../../../shared/data.js';
import { RULES } from './rules.js';
import { policy } from './policy.js';

const PURPOSES: Purpose[] = ['extract', 'bridge', 'brief', 'privy', 'answer'];
const ROLES: Role[] = ['Associate', 'Partner'];

interface Entry { id: string; vault: Source['vault']; classification?: Source['classification']; ownerRole?: Role }

function manifest(): Entry[] {
  return JSON.parse(readFileSync(join(process.cwd(), 'fixtures', 'manifest.json'), 'utf8')) as Entry[];
}

function expected(entry: Entry, viewer: Role): Access {
  if (entry.vault === 'personal') return entry.ownerRole === viewer ? 'visible' : 'excluded';
  if (entry.classification === 'team') return 'visible';
  if (entry.classification === 'partner-only') return viewer === 'Partner' ? 'visible' : 'privy';
  return 'excluded';
}

function toSource(entry: Entry): Source {
  return {
    id: entry.id, vault: entry.vault, title: entry.id, capturedAt: '2026-10-20T00:00:00Z',
    kind: 'memo', fixture: 'x', ownerRole: entry.ownerRole, classification: entry.classification,
  };
}

describe('policy', () => {
  it('matches the SPEC defaults for every role, source, and purpose', () => {
    const entries = manifest();
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      for (const viewer of ROLES) {
        for (const purpose of PURPOSES) {
          const decision = policy(toSource(entry), viewer, purpose);
          expect(decision.access).toBe(expected(entry, viewer));
          expect(RULES.some((r) => r.id === decision.ruleId)).toBe(true);
        }
      }
    }
  });

  it('covers a Partner-owned personal source symmetrically', () => {
    const source: Source = {
      id: 'p1', vault: 'personal', title: 'p', capturedAt: '2026-10-20T00:00:00Z',
      kind: 'article', fixture: 'x', ownerRole: 'Partner',
    };
    expect(policy(source, 'Partner', 'brief').access).toBe('visible');
    expect(policy(source, 'Associate', 'brief').access).toBe('excluded');
  });

  it('gives every rule a unique id', () => {
    const ids = RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
