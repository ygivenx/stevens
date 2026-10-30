import type { Receipt } from '../../shared/data.js';
import { readAll } from '../common/ledger/store.js';
import { getDb } from './store.js';

async function personalTitle(sourceId: string): Promise<string | null> {
  try {
    const db = await getDb();
    const row = await db.get<{ title: string }>(`select title from items where id = $1`, sourceId);
    return row?.title ?? null;
  } catch {
    return null;
  }
}

function firmTitles(): Map<string, string> {
  const titles = new Map<string, string>();
  for (const event of readAll()) {
    if (event.type === 'context.fetched' && event.titles) {
      for (const entry of event.titles) titles.set(entry.id, entry.title);
    }
  }
  return titles;
}

export async function receiptsFor(draftId: string): Promise<Receipt[]> {
  const events = readAll();
  const created = events.find((event) => event.type === 'draft.created' && event.draft.id === draftId);
  if (!created || created.type !== 'draft.created') return [];
  const titles = firmTitles();
  const labelFor = async (sourceId: string): Promise<string> => (await personalTitle(sourceId)) ?? titles.get(sourceId) ?? sourceId;
  const receipts: Receipt[] = [];
  if (created.draft.kind === 'brief' && created.draft.bridges) {
    for (const bridge of created.draft.bridges) {
      const judged = events.find((event) => event.type === 'bridge.judged' && event.bridge?.id === bridge.id);
      if (!judged || judged.type !== 'bridge.judged') continue;
      const included = [];
      for (const entry of judged.manifest.included) {
        included.push({ label: await labelFor(entry.sourceId), access: entry.access, ruleId: entry.ruleId });
      }
      receipts.push({
        callId: judged.manifest.callId, purpose: 'bridge', model: judged.api.model, at: judged.at, costUsd: judged.api.usage.costUsd,
        included,
        withheld: judged.manifest.withheld.map((entry) => ({ label: null, access: entry.access, ruleId: entry.ruleId })),
        privyHidden: false, webSearch: judged.manifest.webSearch, tokens: judged.manifest.tokens,
      });
    }
  }
  const createdIncluded = [];
  for (const entry of created.manifest.included) {
    createdIncluded.push({ label: await labelFor(entry.sourceId), access: entry.access, ruleId: entry.ruleId });
  }
  receipts.push({
    callId: created.manifest.callId, purpose: created.draft.kind, model: created.api.model, at: created.at, costUsd: created.api.usage.costUsd,
    included: createdIncluded,
    withheld: created.manifest.withheld.map((entry) => ({ label: null, access: entry.access, ruleId: entry.ruleId })),
    privyHidden: false, webSearch: created.manifest.webSearch, tokens: created.manifest.tokens,
  });
  if (created.draft.kind === 'answer' && created.draft.questionId) {
    const questionId = created.draft.questionId;
    const received = events.find((event) => event.type === 'verdict.received' && event.questionId === questionId);
    if (received && received.type === 'verdict.received') {
      receipts.push({
        callId: 'privy-' + received.questionId, purpose: 'privy', model: 'hidden', at: received.at, costUsd: 0,
        included: [], withheld: [], privyHidden: true, webSearch: false, tokens: { raw: 0, assembled: 0 },
      });
    }
  }
  return receipts;
}
