import { createHash } from 'node:crypto';
import type { Role } from '../../shared/data.js';
import { loadCrm } from './connectors/crm.js';
import { getFirmDb } from './store.js';

export interface AgentPerson {
  id: string;
  name: string;
  role: Role;
}

export function tokenDigest(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function seedPeople(agentToken: string | undefined): Promise<void> {
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
  const db = await getFirmDb();
  for (const person of people) {
    await db.run(
      `insert into people (id, name, role, agent_token_sha256) values ($1, $2, $3, $4)
       on conflict(id) do update set name = excluded.name, role = excluded.role, agent_token_sha256 = excluded.agent_token_sha256`,
      person.id, person.name, person.role, person.id === ownerId && agentToken ? tokenDigest(agentToken) : null,
    );
  }
}

export async function personForToken(token: string | undefined): Promise<AgentPerson | null> {
  if (!token) return null;
  const db = await getFirmDb();
  const row = await db.get<{ id: string; name: string; role: Role }>(
    `select id, name, role from people where agent_token_sha256 = $1`, tokenDigest(token),
  );
  return row ?? null;
}
