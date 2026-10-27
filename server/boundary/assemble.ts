import type { Access, Claim, Manifest, Purpose, Role, Source, Verdict } from '../../shared/data.js';
import { policy } from './policy.js';

export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

export interface Assembled { prompt: string; manifest: Manifest }

let callCounter = 0;

export function assemble(
  purpose: Purpose,
  viewer: Role,
  model: string,
  stageKey: string,
  sources: Source[],
  claims: Claim[],
  verdict?: Verdict,
): Assembled {
  callCounter += 1;
  const included: Manifest['included'] = [];
  const withheld: Manifest['withheld'] = [];
  const parts: string[] = [];
  let rawTokens = 0;
  for (const source of sources) {
    const decision = policy(source, viewer, purpose);
    const entry = { sourceId: source.id, access: decision.access, ruleId: decision.ruleId };
    const usable = decision.access === 'visible' || (decision.access === 'privy' && purpose === 'privy');
    if (!usable || !source.text) {
      withheld.push(entry);
      continue;
    }
    included.push(entry);
    rawTokens += estimateTokens(source.text);
    const mine = claims.filter((c) => c.sourceId === source.id);
    parts.push(`[${source.vault}:${source.id}] ${source.title}\n${source.text}\nClaims: ${mine.map((c) => c.id).join(', ')}`);
  }
  if (verdict && (purpose === 'brief' || purpose === 'answer')) {
    parts.push(`Privy verdict: ${verdict.verdict} routeTo=${verdict.routeTo ?? 'none'}`);
  }
  const prompt = parts.join('\n\n');
  const manifest: Manifest = {
    callId: 'call-' + callCounter, purpose, viewerRole: viewer, model, stageKey,
    included, withheld, webSearch: false, tokens: { raw: rawTokens, assembled: estimateTokens(prompt) },
  };
  return { prompt, manifest };
}

export function writerSeesPrivyText(prompt: string, sources: Source[]): boolean {
  return sources.some((s) => !!s.text && prompt.includes(s.text));
}
