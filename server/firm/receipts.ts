import type { Person, Receipt } from '../../shared/data.js';
import { readAll } from '../common/ledger/store.js';
import { policy } from '../common/boundary/policy.js';
import { classifyAcl } from './connectors/acl-map.js';
import { documentAcl, firmDocuments, isMember } from './store.js';
import { firmSourceFor } from './sync.js';

async function labelFor(sourceId: string): Promise<string> {
  const doc = (await firmDocuments()).find((entry) => entry.id === sourceId);
  return doc?.title ?? sourceId;
}

async function viewerSeesAll(viewer: Person, sourceIds: string[]): Promise<boolean> {
  for (const sourceId of sourceIds) {
    const doc = (await firmDocuments()).find((entry) => entry.id === sourceId);
    if (!doc) return false;
    const acl = await documentAcl(doc.id);
    const source = firmSourceFor(
      { id: doc.id, kind: doc.kind as Parameters<typeof firmSourceFor>[0]['kind'], title: doc.title, createdAt: doc.createdAt, body: doc.body, mediaPath: doc.mediaPath },
      classifyAcl(acl).classification,
    );
    const member = await isMember(viewer.id, acl);
    if (policy(source, viewer.role, 'privy', member).access !== 'visible' && policy(source, viewer.role, 'brief', member).access !== 'visible') return false;
  }
  return true;
}

export async function receiptsForDraft(viewer: Person, draftId: string): Promise<Receipt[]> {
  const events = readAll();
  const created = events.find((event) => event.type === 'draft.created' && event.draft.id === draftId);
  if (!created || created.type !== 'draft.created') return [];
  const receipts: Receipt[] = [];
  if (created.draft.kind === 'decision' && created.draft.questionId) {
    const questionId = created.draft.questionId;
    const privy = events.find((event) => event.type === 'privy.judged' && event.questionId === questionId);
    if (privy && privy.type === 'privy.judged') {
      const includedIds = privy.manifest.included.map((entry) => entry.sourceId);
      if (await viewerSeesAll(viewer, includedIds)) {
        const included = [];
        for (const entry of privy.manifest.included) {
          included.push({ label: await labelFor(entry.sourceId), access: entry.access, ruleId: entry.ruleId });
        }
        receipts.push({
          callId: privy.manifest.callId, purpose: 'privy', model: privy.api?.model ?? 'hidden', at: privy.at,
          costUsd: privy.api?.usage.costUsd ?? 0,
          included,
          withheld: privy.manifest.withheld.map((entry) => ({ label: null, access: entry.access, ruleId: entry.ruleId })),
          privyHidden: false, webSearch: privy.manifest.webSearch, tokens: privy.manifest.tokens,
        });
      } else {
        receipts.push({
          callId: 'privy-' + questionId, purpose: 'privy', model: 'hidden', at: privy.at, costUsd: 0,
          included: [], withheld: [], privyHidden: true, webSearch: false, tokens: { raw: 0, assembled: 0 },
        });
      }
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
  return receipts;
}
