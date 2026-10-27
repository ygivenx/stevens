import type { Claim, Draft, LedgerEvent, Role, Source } from '../../shared/data.js';
import { Card, Chip, Kicker } from './ui.js';
import { SentenceList } from './sentences.js';

export interface BriefData {
  claims: Map<string, Claim>;
  sources: Map<string, Source>;
  released: Set<string>;
}

export function Brief({ events, role, data, onRelease }: { events: LedgerEvent[]; role: Role; data: BriefData; onRelease: (claimId: string) => void }) {
  const brief = [...events].reverse().find((e) => e.type === 'draft.created' && (e as { draft: Draft }).draft.kind === 'brief') as { draft: Draft } | undefined;
  if (!brief) return <Card><p className="text-smoke">No brief yet. Run the pipeline to write one.</p></Card>;
  const draft = brief.draft;
  const bridges = events.filter((e) => e.type === 'bridge.judged' && (e as { bridge: unknown }).bridge !== null);
  return (
    <div className="space-y-6">
    <Card testid="brief">
      <Kicker>Unprompted brief · {draft.viewerRole}</Kicker>
      <h2 className="mb-1 mt-2 font-display text-2xl">Before the second Helios meeting</h2>
      <div className="mb-5 flex gap-2">
        <Chip tone="mute">{draft.sentences.length} sentences</Chip>
        {draft.droppedSentences > 0 && <Chip tone="warn">{draft.droppedSentences} unsupported removed</Chip>}
      </div>
      <SentenceList sentences={draft.sentences} claims={data.claims} sources={data.sources} role={role} released={data.released} onRelease={onRelease} />
    </Card>
    {bridges.length > 0 && (
      <Card testid="bridges">
        <Kicker>Judged bridges</Kicker>
        <ul className="mt-3 space-y-3">
          {bridges.map((e) => {
            const b = (e as { bridge: { id: string; personalClaimId: string; workClaimId: string; relation: string; reason: string } }).bridge;
            return (
              <li key={b.id} className="flex flex-wrap items-center gap-2 text-sm">
                <Chip tone="personal">{b.personalClaimId}</Chip>
                <span className="font-semibold text-brass-deep">{b.relation}</span>
                <Chip tone="enterprise">{b.workClaimId}</Chip>
                <span className="text-smoke">— {b.reason.replace(/^context\s*[:\-–]\s*/i, '')}</span>
              </li>
            );
          })}
        </ul>
      </Card>
    )}
    </div>
  );
}
