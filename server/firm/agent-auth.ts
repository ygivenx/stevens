import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { Role } from '../../shared/data.js';
import { loadCrm } from './connectors/crm.js';

export interface AgentPerson {
  id: string;
  name: string;
  role: Role;
}

export function tokenDigest(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function seedPeople(db: DatabaseSync, agentToken: string | undefined): void {
  const ownerId = process.env.STEVENS_OWNER ?? 'p-alex';
  let people: { id: string; name: string; role: string }[];
  try {
    people = loadCrm().people;
  } catch {
    people = [
      { id: 'p-alex', name: 'Alex Rivera', role: 'Associate' },
      { id: 'p-morgan', name: 'Morgan Hale', role: 'Partner' },
    ];
  }
  const upsert = db.prepare(
    `insert into people (id, name, role, agent_token_sha256) values (?, ?, ?, ?)
     on conflict(id) do update set name = excluded.name, role = excluded.role, agent_token_sha256 = excluded.agent_token_sha256`,
  );
  for (const person of people) {
    upsert.run(person.id, person.name, person.role, person.id === ownerId && agentToken ? tokenDigest(agentToken) : null);
  }
}

export function personForToken(db: DatabaseSync, token: string | undefined): AgentPerson | null {
  if (!token) return null;
  const row = db
    .prepare(`select id, name, role from people where agent_token_sha256 = ?`)
    .get(tokenDigest(token)) as { id: string; name: string; role: Role } | undefined;
  return row ?? null;
}
