import { createHash } from 'node:crypto';
import { z } from 'zod';
import { append } from '../common/ledger/store.js';
import { getFirmDb, saveReleaseProvenance, upsertDocument } from './store.js';
import type { AgentPerson } from './agent-auth.js';

const Provenance = z.strictObject({
  title: z.string().min(1),
  origin: z.enum(['glasses', 'readwise', 'vault']),
  capturedAt: z.string().min(1),
  speaker: z.string().optional(),
  at: z.string().optional(),
});

const ReleasePayload = z.strictObject({
  dealId: z.string().min(1),
  claimId: z.string().min(1),
  quote: z.string().min(1).max(500),
  provenance: Provenance,
});

export type ReleasePayload = z.infer<typeof ReleasePayload>;

async function onDealTeam(dealId: string, personId: string): Promise<boolean> {
  const db = await getFirmDb();
  const row = await db.get<{ deal_id: string }>(`select deal_id from deal_team where deal_id = $1 and person_id = $2`, dealId, personId);
  return row !== undefined;
}

export async function inboundRelease(agent: AgentPerson, payload: unknown): Promise<{ documentId: string }> {
  const parsed = ReleasePayload.parse(payload);
  if (!(await onDealTeam(parsed.dealId, agent.id))) {
    throw new Error('sender is not on the deal team');
  }
  const documentId = 'rel-' + createHash('sha256').update(parsed.dealId + '|' + parsed.claimId).digest('hex').slice(0, 12);
  const createdAt = new Date().toISOString();
  const provenance = {
    title: parsed.provenance.title,
    origin: parsed.provenance.origin,
    capturedAt: parsed.provenance.capturedAt,
    speaker: parsed.provenance.speaker,
    at: parsed.provenance.at,
  };
  append({
    at: createdAt, type: 'personal.released', documentId, dealId: parsed.dealId, claimId: parsed.claimId, by: agent.role,
    sharedBy: agent.id,
    document: {
      id: documentId, dealId: parsed.dealId, kind: 'released-quote', title: 'Shared by ' + agent.name,
      createdAt, body: parsed.quote, acl: ['deal-team:' + parsed.dealId],
    },
    provenance: { title: provenance.title, origin: provenance.origin, capturedAt: provenance.capturedAt, speaker: provenance.speaker, at: provenance.at },
  });
  await upsertDocument('release', {
    id: documentId,
    dealId: parsed.dealId,
    kind: 'released-quote',
    title: 'Shared by ' + agent.name,
    createdAt,
    body: parsed.quote,
  }, ['deal-team:' + parsed.dealId]);
  const db = await getFirmDb();
  await db.run(`update documents set shared_by = $1 where id = $2`, agent.id, documentId);
  await saveReleaseProvenance(documentId, provenance);
  return { documentId };
}
