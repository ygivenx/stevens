import type { Claim, LedgerEvent, Role, Source } from '../../../shared/data.js';
import { append } from '../ledger/store.js';

export const OWNER_ONLY = 'Personal source (owner only)';

export function releasedClaimIds(events: LedgerEvent[]): Set<string> {
  const ids = new Set<string>();
  for (const event of events) {
    if (event.type === 'personal.released') ids.add(event.claimId);
  }
  return ids;
}

export function releaseClaim(claimId: string, by: Role, claims: Map<string, Claim>, sources: Map<string, Source>, events: LedgerEvent[]): void {
  const claim = claims.get(claimId);
  if (!claim) throw new Error('unknown claim ' + claimId);
  const source = sources.get(claim.sourceId);
  if (!source || source.vault !== 'personal') throw new Error('only personal quotes need release');
  if (source.ownerRole !== by) throw new Error('only the owner can release');
  if (releasedClaimIds(events).has(claimId)) return;
  append({ at: new Date().toISOString(), type: 'personal.released', claimId, by });
}

export function personalQuoteVisible(claim: Claim, source: Source, viewer: Role, events: LedgerEvent[]): boolean {
  if (source.vault !== 'personal') return true;
  if (source.ownerRole === viewer) return true;
  return releasedClaimIds(events).has(claim.id);
}
