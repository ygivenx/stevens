import type { Citation, Claim, LedgerEvent, Manifest, Role, Source } from '../../shared/data.js';
import { policy } from './policy.js';
import { OWNER_ONLY, personalQuoteVisible } from './release.js';

export function indexEvents(events: LedgerEvent[]): { claims: Map<string, Claim>; sources: Map<string, Source> } {
  const claims = new Map<string, Claim>();
  const sources = new Map<string, Source>();
  for (const event of events) {
    if (event.type === 'source.ingested') sources.set(event.source.id, event.source);
    if (event.type === 'claims.extracted') {
      for (const claim of event.claims) claims.set(claim.id, claim);
    }
  }
  return { claims, sources };
}

function claimVisible(claim: Claim, sources: Map<string, Source>, viewer: Role, events: LedgerEvent[]): boolean {
  const source = sources.get(claim.sourceId);
  if (!source) return false;
  if (source.vault === 'personal') return personalQuoteVisible(claim, source, viewer, events);
  return policy(source, viewer, 'brief').access === 'visible';
}

function entryVisible(sourceId: string, sources: Map<string, Source>, viewer: Role): boolean {
  const source = sources.get(sourceId);
  return source !== undefined && policy(source, viewer, 'brief').access === 'visible';
}

function redactManifest(manifest: Manifest, sources: Map<string, Source>, viewer: Role): Manifest {
  const redact = (entry: Manifest['included'][number]) =>
    entryVisible(entry.sourceId, sources, viewer) ? entry : { ...entry, sourceId: 'withheld' };
  return { ...manifest, included: manifest.included.map(redact), withheld: manifest.withheld.map(redact) };
}

export function filterState(events: LedgerEvent[], viewer: Role): LedgerEvent[] {
  const { claims, sources } = indexEvents(events);
  return events.flatMap((event): LedgerEvent[] => {
    if (event.type === 'source.ingested') {
      if (policy(event.source, viewer, 'brief').access === 'visible') return [event];
      return [];
    }
    if (event.type === 'claims.extracted') {
      const kept = event.claims.filter((c) => claimVisible(c, sources, viewer, events));
      if (kept.length === 0) return [];
      return [{ ...event, claims: kept }];
    }
    if (event.type === 'privy.judged') {
      if (event.manifest.included.every((entry) => entryVisible(entry.sourceId, sources, viewer))) return [event];
      return [{ ...event, manifest: { ...event.manifest, included: [], withheld: [] } }];
    }
    if (event.type === 'bridge.judged') {
      return [{ ...event, manifest: redactManifest(event.manifest, sources, viewer) }];
    }
    if (event.type === 'draft.created') {
      const sentences = event.draft.sentences
        .map((sentence) => ({
          ...sentence,
          citations: sentence.citations.flatMap((citation): Citation[] => {
            if (citation.kind === 'Inference') {
              const kept = citation.fromClaimIds.filter((id) => {
                const claim = claims.get(id);
                return claim !== undefined && claimVisible(claim, sources, viewer, events);
              });
              return kept.length === citation.fromClaimIds.length ? [citation] : [];
            }
            const claim = claims.get(citation.claimId);
            const source = claim ? sources.get(claim.sourceId) : undefined;
            if (!claim || !source) return [];
            if (source.vault === 'personal' && !personalQuoteVisible(claim, source, viewer, events)) {
              return [{ ...citation, quote: OWNER_ONLY }];
            }
            if (policy(source, viewer, 'brief').access !== 'visible') return [];
            return [citation];
          }),
        }))
        .filter((sentence) => sentence.citations.length > 0);
      return [{ ...event, draft: { ...event.draft, sentences }, manifest: redactManifest(event.manifest, sources, viewer) }];
    }
    return [event];
  });
}
