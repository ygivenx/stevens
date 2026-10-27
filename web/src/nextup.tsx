import type { Draft, LedgerEvent, Role } from '../../shared/data.js';
import type { BriefData } from './brief.js';

export interface NextStep {
  label: string;
  testid: string;
  run: () => void;
}

export function nextSteps(events: LedgerEvent[], role: Role, data: BriefData, actions: {
  runPipeline: () => void;
  gotoTab: (tab: 'Capture' | 'Brief' | 'Answer' | 'Inspector') => void;
  switchRole: (role: Role) => void;
  release: (claimId: string) => void;
  approve: (draftId: string) => void;
}): NextStep[] {
  const sources = events.filter((e) => e.type === 'source.ingested');
  const brief = [...events].reverse().find((e) => e.type === 'draft.created' && (e as { draft: Draft }).draft.kind === 'brief') as { draft: Draft } | undefined;
  const answer = [...events].reverse().find((e) => e.type === 'draft.created' && (e as { draft: Draft }).draft.kind === 'answer') as { draft: Draft } | undefined;
  const escalated = answer ? events.some((e) => e.type === 'escalation.drafted' && (e as { draftId: string }).draftId === (answer as { draft: Draft }).draft.id) : false;
  const approved = answer ? events.some((e) => (e.type === 'draft.approved' || e.type === 'draft.rejected') && (e as { draftId: string }).draftId === (answer as { draft: Draft }).draft.id) : false;
  if (sources.length === 0) return [{ label: 'Run the pipeline to ingest the vaults', testid: 'next-run', run: actions.runPipeline }];
  if (!brief) return [{ label: 'Run the pipeline to write the brief', testid: 'next-run', run: actions.runPipeline }];
  if (!answer) {
    return [{ label: 'Ask whether to take the meeting', testid: 'next-ask', run: () => actions.gotoTab('Answer') }];
  }
  const verdict = (answer as { draft: Draft }).draft.verdict;
  if (verdict && verdict.verdict === 'hold' && role === 'Associate') {
    const steps: NextStep[] = [];
    const sentences = [...(brief as { draft: Draft }).draft.sentences, ...(answer as { draft: Draft }).draft.sentences];
    const releasable = sentences
      .flatMap((s) => s.citations)
      .find((c) => c.kind === 'Fact' && c.vault === 'personal' && !data.released.has(c.claimId) && data.sources.get(data.claims.get(c.claimId)?.sourceId ?? '')?.ownerRole === role);
    if (!escalated) return [{ label: 'Re-ask to route the escalation', testid: 'next-ask', run: () => actions.gotoTab('Answer') }];
    if (releasable && releasable.kind === 'Fact') {
      steps.push({ label: 'Share the personal quote with the firm', testid: 'next-release', run: () => actions.release(releasable.claimId) });
    }
    steps.push({ label: 'Switch to Partner to review the escalation', testid: 'next-switch', run: () => actions.switchRole('Partner') });
    return steps;
  }
  if (role === 'Partner' && escalated && !approved && answer) {
    return [{ label: 'Approve the decision', testid: 'next-approve', run: () => actions.approve((answer as { draft: Draft }).draft.id) }];
  }
  return [];
}
