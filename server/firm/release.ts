import { createHash } from 'node:crypto';
import { z } from 'zod';
import { append } from '../common/ledger/store.js';
import { getFirmDb, saveReleaseProvenance, upsertDocument } from './store.js';
import type { AgentPerson } from './agent-auth.js';

const Provenance = z.strictObject({
  title: z.string().min(1),
  origin: z.enum(['glasses', 'readwise', 'notes']),
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

function onDealTeam(db: ReturnType<typeof getFirmDb>, dealId: string, personId: string): boolean {
  const row = db.prepare(`select deal_id from deal_team where deal_id = ? and person_id = ?`).get(dealId, personId) as unknown as { deal_id: string } | undefined;
  return row !== undefined;
}

export function inboundRelease(agent: AgentPerson, payload: unknown): { documentId: string } {
  const parsed = ReleasePayload.parse(payload);
  const db = getFirmDb();
  if (!onDealTeam(db, parsed.dealId, agent.id)) {
    throw new Error('sender is not on the deal team');
  }
  const documentId = 'rel-' + createHash('sha256').update(parsed.dealId + '|' + parsed.claimId).digest('hex').slice(0, 12);
  upsertDocument('release', {
    id: documentId,
    dealId: parsed.dealId,
    kind: 'released-quote',
    title: 'Shared by ' + agent.name,
    createdAt: new Date().toISOString(),
    body: parsed.quote,
  }, ['deal-team:' + parsed.dealId]);
  db.prepare(`update documents set shared_by = ? where id = ?`).run(agent.id, documentId);
  saveReleaseProvenance(documentId, {
    title: parsed.provenance.title,
    origin: parsed.provenance.origin,
    capturedAt: parsed.provenance.capturedAt,
    speaker: parsed.provenance.speaker,
    at: parsed.provenance.at,
  });
  append({ at: new Date().toISOString(), type: 'personal.released', documentId, dealId: parsed.dealId, claimId: parsed.claimId, by: agent.role });
  return { documentId };
}
