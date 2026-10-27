import type { Receipt, Role } from '../../shared/data.js';
import { readAll } from '../common/ledger/store.js';
import { policy } from '../common/boundary/policy.js';
import { classifyAcl } from './connectors/acl-map.js';
import { documentAcl, firmDocuments } from './store.js';
import { firmSourceFor } from './sync.js';

function labelFor(sourceId: string): string {
  const doc = firmDocuments().find((entry) => entry.id === sourceId);
  return doc?.title ?? sourceId;
}

function viewerSeesAll(viewerRole: Role, sourceIds: string[]): boolean {
  for (const sourceId of sourceIds) {
    const doc = firmDocuments().find((entry) => entry.id === sourceId);
    if (!doc) return false;
    const source = firmSourceFor(
      { id: doc.id, kind: doc.kind as Parameters<typeof firmSourceFor>[0]['kind'], title: doc.title, createdAt: doc.createdAt, body: doc.body, mediaPath: doc.mediaPath },
      classifyAcl(documentAcl(doc.id)).classification,
    );
    if (policy(source, viewerRole, 'privy').access !== 'visible' && policy(source, viewerRole, 'brief').access !== 'visible') return false;
  }
  return true;
}

export function receiptsForDraft(viewerRole: Role, draftId: string): Receipt[] {
  const events = readAll();
  const created = events.find((event) => event.type === 'draft.created' && event.draft.id === draftId);
  if (!created || created.type !== 'draft.created') return [];
  const receipts: Receipt[] = [];
  if (created.draft.kind === 'decision' && created.draft.questionId) {
    const questionId = created.draft.questionId;
    const privy = events.find((event) => event.type === 'privy.judged' && event.questionId === questionId);
    if (privy && privy.type === 'privy.judged') {
      const includedIds = privy.manifest.included.map((entry) => entry.sourceId);
      if (viewerSeesAll(viewerRole, includedIds)) {
        receipts.push({
          callId: privy.manifest.callId, purpose: 'privy', model: privy.api?.model ?? 'hidden', at: privy.at,
          costUsd: privy.api?.usage.costUsd ?? 0,
          included: privy.manifest.included.map((entry) => ({ label: labelFor(entry.sourceId), access: entry.access, ruleId: entry.ruleId })),
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
  receipts.push({
    callId: created.manifest.callId, purpose: created.draft.kind, model: created.api.model, at: created.at, costUsd: created.api.usage.costUsd,
    included: created.manifest.included.map((entry) => ({ label: labelFor(entry.sourceId), access: entry.access, ruleId: entry.ruleId })),
    withheld: created.manifest.withheld.map((entry) => ({ label: null, access: entry.access, ruleId: entry.ruleId })),
    privyHidden: false, webSearch: created.manifest.webSearch, tokens: created.manifest.tokens,
  });
  return receipts;
}
