import type { Bridge, Claim, LedgerEvent, Role, Source } from '../../../shared/data.js';
import { append, readAll, findCompleted, stageKey, PROMPT_VERSION } from '../ledger/store.js';
import { assemble } from '../boundary/assemble.js';
import { policy } from '../boundary/policy.js';
import { judgeBridge, WONDER_MODEL } from '../meta/client.js';
import { indexEvents } from '../boundary/filter.js';

export function metricHead(metric: string | undefined): string {
  if (!metric) return '';
  const tokens = metric.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 0);
  return tokens.length > 0 ? tokens[tokens.length - 1] : '';
}

export function candidates(personal: Claim[], work: Claim[]): [Claim, Claim][] {
  const pairs: [Claim, Claim][] = [];
  const seenSources = new Set<string>();
  for (const p of personal) {
    for (const w of work) {
      const sameEntity = p.entity.toLowerCase() === w.entity.toLowerCase();
      const pHead = metricHead(p.metric);
      const wHead = metricHead(w.metric);
      const sameFamily = pHead !== '' && pHead === wHead;
      const sourcePair = [p.sourceId, w.sourceId].sort().join('|');
      if ((sameEntity || sameFamily) && !seenSources.has(sourcePair)) {
        seenSources.add(sourcePair);
        pairs.push([p, w]);
      }
    }
  }
  return pairs;
}

function judgedPairs(events: LedgerEvent[]): Set<string> {
  const done = new Set<string>();
  for (const event of events) {
    if (event.type === 'bridge.judged') done.add([...event.candidate].sort().join('|'));
  }
  return done;
}

export async function runBridge(viewer: Role): Promise<{ judged: string[]; reused: string[] }> {
  const events = readAll();
  const { claims, sources } = indexEvents(events);
  const mine = [...claims.values()].filter((c) => {
    const s = sources.get(c.sourceId);
    return s?.vault === 'personal' && s.ownerRole === viewer;
  });
  const work = [...claims.values()].filter((c) => {
    const s = sources.get(c.sourceId);
    return s?.vault === 'enterprise' && s !== undefined && policy(s, viewer, 'bridge').access === 'visible';
  });
  const judged: string[] = [];
  const reused: string[] = [];
  const done = judgedPairs(events);
  for (const [p, w] of candidates(mine, work)) {
    const pairKey = [p.id, w.id].sort().join('|');
    const key = stageKey('bridge', [p.id, w.id].sort(), PROMPT_VERSION, WONDER_MODEL);
    if (done.has(pairKey) || findCompleted(key)) {
      reused.push(pairKey);
      continue;
    }
    const pSource = sources.get(p.sourceId) as Source;
    const wSource = sources.get(w.sourceId) as Source;
    const { prompt, manifest } = assemble('bridge', viewer, WONDER_MODEL, key, [pSource, wSource], [p, w]);
    const task = `${prompt}\n\nTask: does the personal claim bear on the work claim? Reply with relation (contradicts, supports, context, reject) and a one-sentence reason. Quote nothing beyond the claims above.`;
    let result;
    try {
      result = await judgeBridge(p, w, task);
    } catch {
      try {
        result = await judgeBridge(p, w, task);
      } catch (err) {
        append({ at: new Date().toISOString(), type: 'attempt.failed', stageKey: key, model: WONDER_MODEL, error: err instanceof Error ? err.message : String(err) });
        throw err;
      }
    }
    let bridge: Bridge | null = null;
    if (result.judgement.relation !== 'reject') {
      bridge = { id: 'b-' + p.id + '-' + w.id, personalClaimId: p.id, workClaimId: w.id, relation: result.judgement.relation, reason: result.judgement.reason };
    }
    append({
      at: new Date().toISOString(), type: 'bridge.judged', bridge, candidate: [p.id, w.id], manifest,
      api: { model: WONDER_MODEL, responseId: result.responseId, usage: result.usage, stageKey: key },
    });
    judged.push(pairKey);
  }
  return { judged, reused };
}
