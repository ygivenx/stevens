import type { Draft, LedgerEvent, Role } from '../../shared/data.js';
import { Button, Card, Chip, Kicker } from './ui.js';
import { SentenceList } from './sentences.js';
import type { BriefData } from './brief.js';

export function Answer({ events, role, data, question, setQuestion, onAsk, asking, onApprove, onRelease, approved }: {
  events: LedgerEvent[];
  role: Role;
  data: BriefData;
  question: string;
  setQuestion: (q: string) => void;
  onAsk: () => void;
  asking: boolean;
  onApprove: (draftId: string) => void;
  onRelease: (claimId: string) => void;
  approved: Map<string, Role>;
}) {
  const answer = [...events].reverse().find((e) => e.type === 'draft.created' && (e as { draft: Draft }).draft.kind === 'answer') as { draft: Draft } | undefined;
  const escalation = answer ? events.find((e) => e.type === 'escalation.drafted' && (e as { draftId: string }).draftId === (answer as { draft: Draft }).draft.id) as { to: Role } | undefined : undefined;
  return (
    <div className="space-y-6">
      <Card>
        <Kicker>Ask Stevens</Kicker>
        <div className="mt-3 flex gap-3">
          <input
            data-testid="ask-input"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') onAsk(); }}
            placeholder="Should we take the second meeting?"
            className="flex-1 rounded-md border border-hairline bg-ivory px-3 py-2 text-[15px] outline-none focus:border-brass"
          />
          <Button tone="brass" testid="ask-button" onClick={onAsk} disabled={asking || question.trim().length === 0}>
            {asking ? 'Asking…' : 'Ask'}
          </Button>
        </div>
      </Card>
      {!answer && <Card><p className="text-smoke">No answer yet. Ask a question above.</p></Card>}
      {answer && <AnswerCard draft={(answer as { draft: Draft }).draft} escalationTo={escalation?.to} events={events} role={role} data={data} onApprove={onApprove} onRelease={onRelease} approved={approved} />}
    </div>
  );
}

function AnswerCard({ draft, escalationTo, role, data, onApprove, onRelease, approved, events }: {
  draft: Draft;
  escalationTo: Role | undefined;
  events: LedgerEvent[];
  role: Role;
  data: BriefData;
  onApprove: (draftId: string) => void;
  onRelease: (claimId: string) => void;
  approved: Map<string, Role>;
}) {
  const verdict = draft.verdict;
  const decision = approved.get(draft.id);
  return (
    <Card testid="answer">
      <Kicker>Answer</Kicker>
      {verdict && verdict.verdict === 'hold' && (
        <div className="my-4 rounded-md border-l-4 border-brass bg-ink p-4 text-paper" data-testid="verdict-banner">
          <p className="font-display text-xl">Recommendation: hold until a Partner reviews.</p>
          {role === 'Associate' && <p className="mt-1 text-sm opacity-80">Stevens weighed information you are not privy to.</p>}
        </div>
      )}
      {verdict && verdict.verdict === 'proceed' && (
        <div className="my-4 rounded-md border-l-4 border-forest bg-paper p-4" data-testid="verdict-banner">
          <p className="font-display text-xl">Recommendation: proceed.</p>
        </div>
      )}
      {escalationTo && (
        <div className="my-4 rounded-md border border-brass/40 bg-ivory p-4" data-testid="escalation">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brass">Escalation</p>
          <p className="mt-1 font-display text-lg">To {escalationTo} — please review before the second meeting.</p>
          <p className="mt-1 text-sm text-smoke">Enclosed: nothing. The verdict routes this for review; the restricted record stays sealed.</p>
        </div>
      )}
      {events.some((e) => e.type === 'privy.judged' && (e as { failedClosed: boolean }).failedClosed) && (
        <div className="my-4" data-testid="failed-closed">
          <Chip tone="warn">Simulated — privy check failed, held for Partner review</Chip>
        </div>
      )}
      <SentenceList sentences={draft.sentences} claims={data.claims} sources={data.sources} role={role} released={data.released} onRelease={onRelease} />
      <div className="mt-5 flex items-center gap-3">
        {decision ? (
          <Chip tone="ok">Approved by {decision}</Chip>
        ) : (
          <Button tone="primary" testid={'approve-' + draft.id} onClick={() => onApprove(draft.id)}>
            Approve{role === 'Associate' ? ' (a Partner usually approves)' : ''}
          </Button>
        )}
        {draft.droppedSentences > 0 && <Chip tone="warn">{draft.droppedSentences} unsupported removed</Chip>}
      </div>
    </Card>
  );
}
