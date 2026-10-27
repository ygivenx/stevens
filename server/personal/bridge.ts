import type { Bridge, Claim, Source, SourceRef } from '../../shared/data.js';
import { append, findCompleted, readAll, stageKey, PROMPT_VERSION } from '../common/ledger/store.js';
import { assemble } from '../common/boundary/assemble.js';
import { judgeBridge, WONDER_MODEL, type Judged } from '../common/meta/client.js';
import { candidates } from '../common/pipeline/bridge.js';
import { allPersonalClaims, personalSources, searchSegments } from './store.js';

export interface FirmSlice {
  sources: SourceRef[];
  claims: Claim[];
}

export interface BridgeDeps {
  judgeFn?: (personal: Claim, work: Claim, prompt: string) => Promise<Judged>;
}

export function ownerRole(): 'Associate' | 'Partner' {
  return process.env.STEVENS_OWNER_ROLE === 'Partner' ? 'Partner' : 'Associate';
}

export function classificationFromRule(ruleId: string): 'team' | 'partner-only' | 'wall' {
  if (ruleId.startsWith('r-team')) return 'team';
  if (ruleId.startsWith('r-partner-only')) return 'partner-only';
  return 'wall';
}

export function firmShells(slice: FirmSlice): Source[] {
  return slice.sources
    .filter((source) => source.access === 'visible')
    .map((source) => {
      const quotes = slice.claims.filter((claim) => claim.sourceId === source.id).map((claim) => claim.quote);
      return {
        id: source.id,
        vault: 'enterprise' as const,
        title: source.title,
        capturedAt: source.capturedAt,
        kind: source.kind,
        fixture: '',
        text: quotes.join('\n'),
        classification: classificationFromRule(source.ruleId),
      };
    });
}

function judgedPairs(): Set<string> {
  const done = new Set<string>();
  for (const event of readAll()) {
    if (event.type === 'bridge.judged') done.add([...event.candidate].sort().join('|'));
  }
  return done;
}

export function widenedPersonalClaims(firmClaims: Claim[], limit: number = 50): Claim[] {
  const mine = allPersonalClaims();
  const terms = new Set<string>();
  for (const claim of firmClaims) {
    terms.add(claim.entity);
    if (claim.metric) for (const token of claim.metric.toLowerCase().split(/[^a-z0-9]+/)) {
      if (token.length > 2) terms.add(token);
    }
  }
  const widened = new Map<string, Claim>();
  for (const claim of mine) widened.set(claim.id, claim);
  for (const term of terms) {
    try {
      for (const hit of searchSegments(term, limit)) {
        const found = mine.filter((claim) => claim.segmentId === hit.id);
        for (const claim of found) widened.set(claim.id, claim);
      }
    } catch {
      continue;
    }
  }
  return [...widened.values()];
}

export function recordedBridges(): Bridge[] {
  const bridges: Bridge[] = [];
  for (const event of readAll()) {
    if (event.type === 'bridge.judged' && event.bridge) bridges.push(event.bridge);
  }
  return bridges;
}

export async function judgeBridges(slice: FirmSlice, deps: BridgeDeps = {}): Promise<Bridge[]> {
  const judgeFn = deps.judgeFn ?? judgeBridge;
  const viewer = ownerRole();
  const shells = firmShells(slice);
  const shellById = new Map(shells.map((shell) => [shell.id, shell]));
  const mine = widenedPersonalClaims(slice.claims);
  const judged: Bridge[] = [];
  const done = judgedPairs();
  for (const [personal, work] of candidates(mine, slice.claims)) {
    void viewer;
    const pairKey = [personal.id, work.id].sort().join('|');
    const key = stageKey('bridge', [personal.id, work.id].sort(), PROMPT_VERSION, WONDER_MODEL);
    if (done.has(pairKey) || findCompleted(key)) continue;
    const workSource = shellById.get(work.sourceId);
    const mineSources = personalSources(ownerRole());
    const personalSource = mineSources.find((source) => source.id === personal.sourceId);
    if (!personalSource || !workSource) continue;
    const { prompt, manifest } = assemble('bridge', ownerRole(), WONDER_MODEL, key, [personalSource, workSource], [personal, work]);
    const task = `${prompt}\n\nTask: does the personal claim bear on the work claim? Reply with relation (contradicts, supports, context, reject) and a one-sentence reason. Quote nothing beyond the claims above.`;
    let result;
    try {
      result = await judgeFn(personal, work, task);
    } catch (err) {
      append({ at: new Date().toISOString(), type: 'attempt.failed', stageKey: key, model: WONDER_MODEL, error: err instanceof Error ? err.message : String(err) });
      continue;
    }
    const decided = result.judgement.relation as Bridge['relation'] | 'reject';
    let bridge: Bridge | null = null;
    if (decided !== 'reject') {
      bridge = { id: 'b-' + personal.id + '-' + work.id, personalClaimId: personal.id, workClaimId: work.id, relation: decided, reason: result.judgement.reason };
    }
    append({
      at: new Date().toISOString(), type: 'bridge.judged', bridge, candidate: [personal.id, work.id], manifest,
      api: { model: WONDER_MODEL, responseId: result.responseId, usage: result.usage, stageKey: key },
    });
    if (bridge) judged.push(bridge);
  }
  return judged;
}
