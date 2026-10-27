import type { Citation, Claim, Source } from '../../shared/data.js';

export function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function quoteIn(quote: string, haystack: string): boolean {
  const needle = normalize(quote);
  return needle.length > 0 && normalize(haystack).includes(needle);
}

export interface Sentence { text: string; citations: Citation[] }

export function sentenceResolves(
  sentence: Sentence,
  claims: Map<string, Claim>,
  sources: Map<string, Source>,
): boolean {
  if (sentence.citations.length === 0) return false;
  for (const citation of sentence.citations) {
    if (citation.kind === 'Fact') {
      const claim = claims.get(citation.claimId);
      if (!claim) return false;
      const source = sources.get(claim.sourceId);
      if (!source || !source.text) return false;
      if (!quoteIn(citation.quote, claim.quote)) return false;
      if (!quoteIn(claim.quote, source.text)) return false;
      if (claim.sourceId && sources.get(claim.sourceId)?.vault !== citation.vault) return false;
    } else {
      for (const id of citation.fromClaimIds) {
        if (!claims.has(id)) return false;
      }
    }
  }
  return true;
}

export function dedupe(citations: Citation[]): Citation[] {
  const seen = new Set<string>();
  return citations.filter((c) => {
    const key = JSON.stringify(c);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function resolveSentences(
  sentences: Sentence[],
  claims: Map<string, Claim>,
  sources: Map<string, Source>,
): { kept: Sentence[]; dropped: number } {
  const kept: Sentence[] = [];
  let dropped = 0;
  for (const sentence of sentences) {
    if (sentenceResolves(sentence, claims, sources)) kept.push(sentence);
    else dropped += 1;
  }
  return { kept, dropped };
}
