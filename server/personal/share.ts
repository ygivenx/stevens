import type { Claim } from '../../shared/data.js';
import { append } from '../common/ledger/store.js';
import { allPersonalClaims, getItemBundle } from './store.js';
import { atLabel } from './normalize/audio.js';
import { firmRelease } from './firm-client.js';

export interface ShareProvenance {
  title: string;
  origin: 'glasses' | 'readwise' | 'vault';
  capturedAt: string;
  speaker?: string;
  at?: string;
}

export interface SharePayload {
  dealId: string;
  claimId: string;
  quote: string;
  provenance: ShareProvenance;
}

export interface ShareDeps {
  releaseFn?: (payload: SharePayload) => Promise<{ documentId: string }>;
}

export function sharePayload(claim: Claim, dealId: string): SharePayload {
  const bundle = getItemBundle(claim.sourceId);
  if (!bundle) throw new Error('unknown claim ' + claim.id);
  const segment = bundle.segments.find((part) => part.id === claim.segmentId);
  if (claim.quote.length > 500) throw new Error('quote over 500 characters');
  return {
    dealId,
    claimId: claim.id,
    quote: claim.quote,
    provenance: {
      title: bundle.item.title,
      origin: bundle.item.origin,
      capturedAt: bundle.item.capturedAt,
      speaker: segment?.speaker ?? claim.speaker ?? undefined,
      at: segment?.startMs != null ? atLabel(segment.startMs) : undefined,
    },
  };
}

export async function shareClaim(claimId: string, dealId: string, deps: ShareDeps = {}): Promise<{ documentId: string }> {
  const releaseFn = deps.releaseFn ?? firmRelease;
  const claim = allPersonalClaims().find((entry) => entry.id === claimId);
  if (!claim) throw new Error('unknown claim ' + claimId);
  const payload = sharePayload(claim, dealId);
  const { documentId } = await releaseFn(payload);
  append({ at: new Date().toISOString(), type: 'share.sent', claimId, dealId, documentId });
  return { documentId };
}
