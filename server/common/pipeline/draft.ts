import type { Draft, LedgerEvent, Role } from '../../../shared/data.js';
import { append, readAll, findCompleted, stageKey, PROMPT_VERSION } from '../ledger/store.js';
import { assemble } from '../boundary/assemble.js';
import { WONDER_MODEL, writeDraft } from '../meta/client.js';
import { indexEvents } from '../boundary/filter.js';
import { dedupe, resolveSentences } from '../resolver/resolve.js';

function existingBrief(events: LedgerEvent[], viewer: Role): Draft | null {
  for (const event of events) {
    if (event.type === 'draft.created' && event.draft.kind === 'brief' && event.draft.viewerRole === viewer) return event.draft;
  }
  return null;
}

export async function runBrief(viewer: Role): Promise<{ draft: Draft; reused: boolean }> {
  const events = readAll();
  const prior = existingBrief(events, viewer);
  if (prior) return { draft: prior, reused: true };
  const { claims, sources } = indexEvents(events);
  const allSources = [...sources.values()].filter((s) => !!s.text);
  const allClaims = [...claims.values()];
  const key = stageKey('brief', [viewer, ...allSources.map((s) => s.id).sort()], PROMPT_VERSION, WONDER_MODEL);
  if (findCompleted(key)) {
    const again = existingBrief(readAll(), viewer);
    if (again) return { draft: again, reused: true };
  }
  const { prompt, manifest } = assemble('brief', viewer, WONDER_MODEL, key, allSources, allClaims, undefined, () => true);
  const bridges = events
    .filter((e) => e.type === 'bridge.judged' && e.bridge !== null)
    .map((e) => {
      const b = (e as { bridge: { personalClaimId: string; workClaimId: string; relation: string; reason: string } }).bridge;
      return `${b.personalClaimId} ${b.relation} ${b.workClaimId}: ${b.reason}`;
    });
  const task = `${prompt}\n\nJudged bridges:\n${bridges.length > 0 ? bridges.join('\n') : 'none'}\n\nTask: write an unprompted brief for tomorrow's second Helios meeting. Every sentence carries at least one citation. Fact citations reuse a claim id from above with its quote copied verbatim and the claim's vault. Inferences cite the claims they follow from. Include at least one sentence that cites one personal claim and one enterprise claim from the judged bridges, plus the inference it supports.`;
  let written;
  try {
    written = await writeDraft(task, allClaims, allSources);
  } catch {
    try {
      written = await writeDraft(task, allClaims, allSources);
    } catch (err) {
      append({ at: new Date().toISOString(), type: 'attempt.failed', stageKey: key, model: WONDER_MODEL, error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  }
  const { kept, dropped } = resolveSentences(written.sentences, claims, sources);
  for (const sentence of kept) sentence.citations = dedupe(sentence.citations);
  const draft: Draft = {
    id: 'brief-' + viewer.toLowerCase(), kind: 'brief', viewerRole: viewer,
    sentences: kept, droppedSentences: dropped, status: 'draft',
  };
  append({
    at: new Date().toISOString(), type: 'draft.created', draft, manifest,
    api: { model: WONDER_MODEL, responseId: written.responseId, usage: written.usage, stageKey: key },
  });
  return { draft, reused: false };
}
