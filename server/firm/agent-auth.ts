import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { Role } from '../../shared/data.js';

export interface AgentPerson {
  id: string;
  name: string;
  role: Role;
}

export function tokenDigest(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function seedPeople(db: DatabaseSync, agentToken: string | undefined): void {
  db.prepare(
    `insert into people (id, name, role, agent_token_sha256) values ('p-alex', 'Alex Rivera', 'Associate', ?)
     on conflict(id) do update set name = excluded.name, role = excluded.role, agent_token_sha256 = excluded.agent_token_sha256`,
  ).run(agentToken ? tokenDigest(agentToken) : null);
  db.prepare(
    `insert into people (id, name, role, agent_token_sha256) values ('p-morgan', 'Morgan Hale', 'Partner', null)
     on conflict(id) do update set name = excluded.name, role = excluded.role`,
  ).run();
}

export function personForToken(db: DatabaseSync, token: string | undefined): AgentPerson | null {
  if (!token) return null;
  const row = db
    .prepare(`select id, name, role from people where agent_token_sha256 = ?`)
    .get(tokenDigest(token)) as { id: string; name: string; role: Role } | undefined;
  return row ?? null;
}
