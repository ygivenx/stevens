import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Play } from 'lucide-react';
import type { Claim, Draft, SourceRef } from '../../shared/data.js';
import {
  getState, getBundle, askQuestion, shareClaim, getReceipts,
  mediaUrl, firmMediaUrl, watchEvents, formatDateLine, formatMeetingTime, formatClock, msLabel,
  type PersonalState, type ItemBundle,
} from './client.js';
import {
  Button, Card, Chip, Kicker, Avatar, VerdictPill, QuoteBlock,
  StatusLine, Skeleton, Toast, Drawer, Sheet, Rule, HonestyBadge, FailedLine,
} from '../ui/components.js';

type Route = 'today' | 'captures' | 'shared';

function useRoute(): [Route, (r: Route) => void] {
  const read = (): Route => {
    const hash = window.location.hash.replace('#/', '');
    if (hash === 'captures' || hash === 'shared') return hash;
    return 'today';
  };
  const [route, setRoute] = useState<Route>(read);
  useEffect(() => {
    const onChange = () => setRoute(read());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  const go = (r: Route) => {
    window.location.hash = '#/' + r;
    setRoute(r);
  };
  return [route, go];
}

export default function App() {
  const [route, go] = useRoute();
  const [state, setState] = useState<PersonalState | null>(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [receiptsFor, setReceiptsFor] = useState<string | null>(null);
  const [shareFor, setShareFor] = useState<{ claimId: string; dealId: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setState(await getState());
      setError('');
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => watchEvents(load), [load]);

  const claimsById = useMemo(() => {
    const map = new Map<string, Claim>();
    for (const claim of state?.claims ?? []) map.set(claim.id, claim);
    return map;
  }, [state]);

  const sourcesById = useMemo(() => {
    const map = new Map<string, SourceRef>();
    for (const source of state?.sources ?? []) map.set(source.id, source);
    return map;
  }, [state]);

  return (
    <div className="mx-auto max-w-5xl px-5 pb-24">
      <TopBar state={state} />
      {error !== '' && <p className="mt-3 text-sm text-oxblood">{error}</p>}
      <nav className="mb-6 flex gap-6 border-b border-hairline" aria-label="Sections">
        {(['today', 'captures', 'shared'] as Route[]).map((name) => (
          <button
            key={name}
            data-testid={'nav-' + name}
            onClick={() => go(name)}
            className={
              'border-b-2 px-1 pb-2 font-display text-lg capitalize ' +
              (route === name ? 'border-brass text-ink' : 'border-transparent text-smoke hover:text-ink')
            }
          >
            {name === 'today' ? 'Today' : name === 'captures' ? 'Captures' : 'Shared'}
          </button>
        ))}
      </nav>
      <main>
        {route === 'today' && (
          <TodayView
            state={state}
            claimsById={claimsById}
            sourcesById={sourcesById}
            onAsk={load}
            onShare={(claimId, dealId) => setShareFor({ claimId, dealId })}
            onReceipts={setReceiptsFor}
            onToast={setToast}
          />
        )}
        {route === 'captures' && <CapturesView state={state} onShare={(claimId, dealId) => setShareFor({ claimId, dealId })} onToast={setToast} />}
        {route === 'shared' && <SharedView state={state} claimsById={claimsById} />}
      </main>
      <footer className="mt-10 border-t border-hairline pt-4 text-xs text-smoke">
        <p>Your notebook stays yours. The firm&apos;s secrets stay the firm&apos;s. <span className="font-semibold">Stevens drafts; the human decides.</span></p>
      </footer>
      {receiptsFor && <ReceiptsDrawer draftId={receiptsFor} onClose={() => setReceiptsFor(null)} />}
      {shareFor && state && (
        <ShareSheet
          claimId={shareFor.claimId}
          dealId={shareFor.dealId}
          claimsById={claimsById}
          sourcesById={sourcesById}
          onClose={() => setShareFor(null)}
          onDone={(message) => {
            setShareFor(null);
            setToast(message);
            load();
          }}
        />
      )}
      {toast !== '' && <Toast message={toast} onClose={() => setToast('')} />}
    </div>
  );
}

function TopBar({ state }: { state: PersonalState | null }) {
  return (
    <header className="pb-4 pt-8">
      <p className="text-xs font-bold uppercase tracking-[0.24em] text-brass">A chief of staff</p>
      <h1 className="mt-1 font-display text-5xl tracking-tight">Stevens</h1>
      <p className="mt-1 font-display text-lg italic text-smoke">yours</p>
      <div className="mt-4 h-px bg-brass/60" />
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Avatar name="Alex Rivera" />
          <span className="text-sm font-semibold">Alex Rivera · Associate</span>
          <span className="rounded-md border border-hairline px-2 py-0.5 text-xs text-smoke">Simulated sign-in</span>
        </div>
        <div className="flex-1" />
        {state && <StatusLine line={state.status.line} busy={state.status.busy} />}
      </div>
      {state && state.simulated.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {state.simulated.map((label) => (
            <HonestyBadge key={label} label={label} />
          ))}
        </div>
      )}
    </header>
  );
}

function TodayView({ state, claimsById, sourcesById, onAsk, onShare, onReceipts, onToast }: {
  state: PersonalState | null;
  claimsById: Map<string, Claim>;
  sourcesById: Map<string, SourceRef>;
  onAsk: () => void;
  onShare: (claimId: string, dealId: string) => void;
  onReceipts: (draftId: string) => void;
  onToast: (message: string) => void;
}) {
  if (!state) return <Skeleton label="Loading your day…" />;
  const dateLine = formatDateLine(state.now);
  const meetings = state.meetings;
  return (
    <div className="space-y-6">
      <div>
        <p className="font-display text-xl">{dateLine}</p>
        <p className="mt-1 text-sm text-smoke">
          {meetings.length === 0 ? 'Nothing needs you in the next 24 hours' : meetings.length + ' meeting needs you'}
        </p>
      </div>
      {meetings.length === 0 && <LatestCaptures state={state} />}
      {meetings.map((meeting) => (
        <MeetingCard
          key={meeting.id}
          meeting={meeting}
          state={state}
          claimsById={claimsById}
          sourcesById={sourcesById}
          onAsk={onAsk}
          onShare={onShare}
          onReceipts={onReceipts}
          onToast={onToast}
        />
      ))}
    </div>
  );
}

function LatestCaptures({ state }: { state: PersonalState }) {
  const latest = [...state.items].slice(0, 3);
  if (latest.length === 0) return <Card><p className="text-smoke">No captures yet. Drop a file in your glasses inbox and it appears here by itself.</p></Card>;
  return (
    <Card>
      <Kicker>Latest in your notebook</Kicker>
      <ul className="mt-3 space-y-2">
        {latest.map((item) => (
          <li key={item.id} className="text-sm">
            <span className="font-semibold">{item.title}</span>
            <span className="text-smoke"> · {originLabel(item.origin)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function originLabel(origin: string): string {
  if (origin === 'glasses') return 'Glasses';
  if (origin === 'readwise') return 'Readwise';
  return 'Notes';
}

function MeetingCard({ meeting, state, claimsById, sourcesById, onAsk, onShare, onReceipts, onToast }: {
  meeting: PersonalState['meetings'][number];
  state: PersonalState;
  claimsById: Map<string, Claim>;
  sourcesById: Map<string, SourceRef>;
  onAsk: () => void;
  onShare: (claimId: string, dealId: string) => void;
  onReceipts: (draftId: string) => void;
  onToast: (message: string) => void;
}) {
  const brief = state.drafts.find((d) => d.kind === 'brief' && d.dealId === meeting.dealId);
  const answers = state.drafts.filter((d) => d.kind === 'answer' && d.dealId === meeting.dealId);
  const [question, setQuestion] = useState('Should we take the second meeting?');
  const [asking, setAsking] = useState(false);
  const team = meeting.team ?? [];

  async function submitAsk() {
    if (question.trim().length === 0 || asking) return;
    setAsking(true);
    try {
      await askQuestion(meeting.dealId, question.trim());
      onAsk();
      onToast('Question sent. Stevens is weighing what it may tell you.');
    } catch {
      onToast('Could not reach Stevens. Try again.');
    }
    setAsking(false);
  }

  return (
    <Card testid="meeting-card">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brass">{meeting.company} · second meeting</p>
          <h2 className="mt-1 font-display text-2xl">{meeting.title}</h2>
          <p className="mt-1 text-sm text-smoke">{formatMeetingTime(meeting.startsAt)}</p>
        </div>
        <div className="flex-1" />
        <div className="flex -space-x-2">
          {team.map((member) => (
            <Avatar key={member.id} name={member.name} />
          ))}
        </div>
      </div>
      {!brief && (
        <div className="mt-5">
          <Skeleton label="Preparing your brief…" />
        </div>
      )}
      {brief && (
        <div className="mt-5 space-y-6">
          {(brief.bridges ?? []).map((bridge) => (
            <BridgeBlock
              key={bridge.id}
              bridge={bridge}
              dealId={meeting.dealId}
              claimsById={claimsById}
              sourcesById={sourcesById}
              onShare={onShare}
            />
          ))}
          <SentenceList sentences={brief.sentences} claimsById={claimsById} sourcesById={sourcesById} />
          <SuggestedQuestion sentences={brief.sentences} />
          <BriefFooter brief={brief} now={state.now} onReceipts={() => onReceipts(brief.id)} />
        </div>
      )}
      <div className="mt-6 border-t border-hairline pt-5">
        <Kicker>Ask about {meeting.company}</Kicker>
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            data-testid="ask-input"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={'Ask about ' + meeting.company + '…'}
            className="min-w-0 flex-1 rounded-md border border-hairline bg-paper px-3 py-2 text-sm"
          />
          <Button tone="brass" testid="ask-send" onClick={submitAsk} disabled={asking}>
            {asking ? 'Asking…' : 'Ask'}
          </Button>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            onClick={() => setQuestion('Should we take the second meeting?')}
            className="rounded-full border border-hairline px-3 py-1 text-xs font-semibold text-smoke hover:text-ink"
          >
            Should we take the second meeting?
          </button>
        </div>
        <p className="mt-2 text-xs text-smoke">Your question goes to the firm&apos;s privy check. Nothing from your notebook does.</p>
      </div>
      {answers.map((answer) => (
        <AnswerCard key={answer.id} answer={answer} state={state} claimsById={claimsById} sourcesById={sourcesById} onReceipts={() => onReceipts(answer.id)} />
      ))}
    </Card>
  );
}

function BridgeBlock({ bridge, dealId, claimsById, sourcesById, onShare }: {
  bridge: { personalClaimId: string; workClaimId: string; relation: string; reason: string };
  dealId: string;
  claimsById: Map<string, Claim>;
  sourcesById: Map<string, SourceRef>;
  onShare: (claimId: string, dealId: string) => void;
}) {
  const personal = claimsById.get(bridge.personalClaimId);
  const work = claimsById.get(bridge.workClaimId);
  if (!personal || !work) return null;
  const personalSource = sourcesById.get(personal.sourceId);
  const workSource = sourcesById.get(work.sourceId);
  const relationWord = bridge.relation === 'contradicts' ? 'Contradicts' : bridge.relation === 'supports' ? 'Supports' : 'Different definitions';
  return (
    <div data-testid="bridge" className="rounded-md border border-hairline bg-ivory/60 p-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Kicker>The deck says</Kicker>
          <p className="mt-2 font-display text-[17px] leading-relaxed">“{work.quote}”</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Chip tone="enterprise">{sourceChip(workSource)}</Chip>
            {workSource && <span className="text-xs text-smoke">{workSource.title}</span>}
          </div>
          {workSource?.kind === 'deck-photo' && (
            <img src={firmMediaUrl(workSource.id)} alt={workSource.title} className="mt-3 max-h-48 rounded-md border border-hairline" loading="lazy" />
          )}
        </div>
        <div>
          <Kicker>You heard</Kicker>
          <p className="mt-2 font-display text-[17px] leading-relaxed">“{personal.quote}”</p>
          <p className="mt-2 text-xs text-smoke">{provenanceLine(personal, personalSource)}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Chip tone="personal">Your notebook · Only you</Chip>
            <AudioReplay personal={personal} />
            <button
              onClick={() => onShare(personal.id, dealId)}
              data-testid="share-button"
              className="rounded-md bg-brass px-3 py-1.5 text-xs font-bold text-paper hover:bg-brass-deep"
            >
              Share with the firm
            </button>
          </div>
        </div>
      </div>
      <div className="mt-3 border-t border-hairline pt-3">
        <p className="text-sm"><span className="font-bold text-brass-deep">{relationWord}.</span> <span className="text-ink/90">{bridge.reason}</span></p>
      </div>
    </div>
  );
}

function sourceChip(source: SourceRef | undefined): string {
  if (!source) return 'The firm';
  if (source.kind === 'market-comps') return 'Public filing · SEC Form D';
  if (source.connector === 'sec-form-d') return 'Public filing · SEC Form D';
  if (source.aclLabel === 'Partners') return 'Firm CRM · Partners';
  return 'Firm CRM · Deal team';
}

function provenanceLine(claim: Claim, source: SourceRef | undefined): string {
  const title = source?.title ?? 'Your notebook';
  const speaker = claim.speaker ? ' · ' + claim.speaker : '';
  const at = claim.at ? ' · ' + claim.at : '';
  return title + speaker + at;
}

function AudioReplay({ personal }: { personal: Claim }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    fetch(mediaUrl(personal.sourceId))
      .then(async (res) => {
        if (!res.ok) return null;
        const blob = await res.blob();
        if (live) setUrl(URL.createObjectURL(blob));
        return null;
      })
      .catch(() => {});
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [personal.sourceId]);
  if (personal.startMs == null || !url) return null;
  const play = () => {
    const el = audioRef.current;
    if (!el) return;
    el.currentTime = Math.max(0, (personal.startMs ?? 0) / 1000 - 2);
    void el.play();
    const stopAt = ((personal.endMs ?? personal.startMs ?? 0) / 1000) + 1;
    const timer = setInterval(() => {
      if (el.currentTime >= stopAt) {
        el.pause();
        clearInterval(timer);
      }
    }, 250);
  };
  return (
    <>
      <audio ref={audioRef} src={url} preload="metadata" className="hidden" />
      <button onClick={play} aria-label="Play the moment" className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-brass text-paper hover:bg-brass-deep">
        <Play size={12} aria-hidden />
      </button>
    </>
  );
}

function SentenceList({ sentences, claimsById, sourcesById }: {
  sentences: Draft['sentences'];
  claimsById: Map<string, Claim>;
  sourcesById: Map<string, SourceRef>;
}) {
  const [open, setOpen] = useState<number | null>(null);
  if (sentences.length === 0) return <p className="font-display text-lg italic text-smoke">Nothing relevant in the record.</p>;
  return (
    <ol className="space-y-4">
      {sentences.map((sentence, i) => (
        <li key={i} className="text-[15px] leading-relaxed">
          <span>{sentence.text} </span>
          {sentence.citations.map((citation, j) => (
            <button
              key={j}
              onClick={() => setOpen(open === i * 10 + j ? null : i * 10 + j)}
              aria-label={'Source ' + (j + 1)}
              className="mx-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brass/15 px-1 text-[11px] font-bold text-brass-deep hover:bg-brass/30"
            >
              {j + 1}
            </button>
          ))}
          {open !== null && Math.floor(open / 10) === i && (
            <span className="mt-2 block rounded-md border border-hairline bg-paper p-3 text-sm">
              {(sentence.citations[open % 10] && <CitationDetail citation={sentence.citations[open % 10]} claimsById={claimsById} sourcesById={sourcesById} />) ?? null}
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}

function CitationDetail({ citation, claimsById, sourcesById }: {
  citation: Draft['sentences'][number]['citations'][number];
  claimsById: Map<string, Claim>;
  sourcesById: Map<string, SourceRef>;
}) {
  if (citation.kind === 'Inference') return <span className="text-smoke">Stevens&apos; read from the cited lines.</span>;
  const claim = claimsById.get(citation.claimId);
  const source = claim ? sourcesById.get(claim.sourceId) : undefined;
  const personal = citation.vault === 'personal';
  return (
    <span className="space-y-1.5">
      <span className="block font-display italic">“{citation.quote}”</span>
      <span className="flex flex-wrap gap-1.5">
        <Chip tone={personal ? 'personal' : 'enterprise'}>{personal ? 'Your notebook · Only you' : sourceChip(source)}</Chip>
        {source && <span className="text-xs text-smoke">{source.title}</span>}
      </span>
    </span>
  );
}

function SuggestedQuestion({ sentences }: { sentences: Draft['sentences'] }) {
  const suggestion = sentences.find((s) => s.citations.length > 0 && s.citations.every((c) => c.kind === 'Inference'));
  if (!suggestion) return null;
  return (
    <p className="rounded-md bg-brass/10 p-3 text-sm">
      <span className="font-bold text-brass-deep">Ask them: </span>{suggestion.text}
    </p>
  );
}

function BriefFooter({ brief, now, onReceipts }: { brief: Draft; now: string; onReceipts: () => void }) {
  let personal = 0;
  let firm = 0;
  for (const sentence of brief.sentences) {
    for (const citation of sentence.citations) {
      if (citation.kind === 'Fact') {
        if (citation.vault === 'personal') personal += 1;
        else firm += 1;
      }
    }
  }
  return (
    <p className="text-xs text-smoke">
      Written {formatClock(now)} · {personal} from your notebook · {firm} from the firm ·{' '}
      <button onClick={onReceipts} data-testid="receipts-button" className="font-semibold text-brass-deep underline hover:text-brass">
        Receipts
      </button>
    </p>
  );
}

function AnswerCard({ answer, state, claimsById, sourcesById, onReceipts }: {
  answer: Draft;
  state: PersonalState;
  claimsById: Map<string, Claim>;
  sourcesById: Map<string, SourceRef>;
  onReceipts: () => void;
}) {
  const escalation = state.escalations.find((e) => e.questionId === answer.questionId);
  const verdict = answer.verdict?.verdict ?? 'hold';
  return (
    <div data-testid="answer" className="mt-6 rounded-md border border-hairline bg-paper p-4">
      <div className="flex items-center gap-2">
        <VerdictPill verdict={verdict} />
        {answer.verdict?.routeTo && <span className="text-sm text-smoke">until a {answer.verdict.routeTo} reviews</span>}
      </div>
      <div className="mt-3">
        <SentenceList sentences={answer.sentences} claimsById={claimsById} sourcesById={sourcesById} />
      </div>
      <p className="mt-3 text-sm text-smoke">Stevens weighed information you are not privy to.</p>
      {escalation && (
        <p data-testid="escalation" className="mt-2 text-sm">
          {escalation.status === 'sent' ? (
            <span>Sent to Morgan Hale · nothing enclosed · {formatClock(state.now)}</span>
          ) : (
            <span>Queued — can&apos;t reach the firm, will retry</span>
          )}
        </p>
      )}
      <button onClick={onReceipts} data-testid="receipts-button" className="mt-2 text-xs font-semibold text-brass-deep underline hover:text-brass">
        Receipts
      </button>
    </div>
  );
}

function CapturesView({ state, onShare, onToast }: {
  state: PersonalState | null;
  onShare: (claimId: string, dealId: string) => void;
  onToast: (message: string) => void;
}) {
  const [filter, setFilter] = useState<'all' | 'glasses' | 'readwise' | 'notes'>('all');
  const [bundles, setBundles] = useState<Map<string, ItemBundle>>(new Map());
  useEffect(() => {
    if (!state) return;
    let live = true;
    const missing = state.items.filter((item) => !bundles.has(item.id)).slice(0, 12);
    void Promise.all(missing.map(async (item) => {
      try {
        const bundle = await getBundle(item.id);
        if (live) {
          setBundles((prev) => {
            const next = new Map(prev);
            next.set(item.id, bundle);
            return next;
          });
        }
      } catch {
        onToast('Could not load ' + item.title);
      }
    }));
    return () => {
      live = false;
    };
  }, [state]);
  if (!state) return <Skeleton label="Loading captures…" />;
  const items = state.items.filter((item) => filter === 'all' || item.origin === filter);
  const grouped = new Map<string, typeof items>();
  for (const item of items) {
    const day = new Date(item.capturedAt).toDateString();
    const list = grouped.get(day) ?? [];
    list.push(item);
    grouped.set(day, list);
  }
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {(state.adapters ?? []).map((adapter) => (
          <span key={adapter.origin} className="inline-flex items-center gap-2 rounded-full border border-hairline px-3 py-1 text-xs text-smoke">
            {adapter.label} · {adapter.lastSyncAt ? 'synced ' + formatClock(adapter.lastSyncAt) : 'never synced'}
            {adapter.simulated && <span>· {adapter.simulated}</span>}
          </span>
        ))}
      </div>
      <div className="flex gap-2" role="tablist" aria-label="Filter">
        {(['all', 'glasses', 'readwise', 'notes'] as const).map((name) => (
          <button
            key={name}
            onClick={() => setFilter(name)}
            className={'rounded-full border px-3 py-1 text-xs font-semibold capitalize ' + (filter === name ? 'border-ink bg-ink text-paper' : 'border-hairline text-smoke')}
          >
            {name === 'all' ? 'All' : name === 'glasses' ? 'Glasses' : name === 'readwise' ? 'Readwise' : 'Notes'}
          </button>
        ))}
      </div>
      {[...grouped.entries()].map(([day, dayItems]) => (
        <div key={day} className="space-y-4">
          <Kicker>{new Date(day).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</Kicker>
          {dayItems.map((item) => (
            <CaptureCard key={item.id} item={item} bundle={bundles.get(item.id) ?? null} onShare={onShare} />
          ))}
        </div>
      ))}
      {items.length === 0 && <Card><p className="text-smoke">Nothing here yet.</p></Card>}
    </div>
  );
}

function CaptureCard({ item, bundle, onShare }: {
  item: PersonalState['items'][number];
  bundle: ItemBundle | null;
  onShare: (claimId: string, dealId: string) => void;
}) {
  if (item.status === 'failed') return <Card><FailedLine message={item.error ?? 'Could not read this file.'} /></Card>;
  if (!bundle) return <Card><Skeleton label={item.kind === 'audio' ? 'Transcribing…' : item.kind === 'photo' ? 'Reading the photo…' : 'Finding what matters…'} /></Card>;
  if (item.kind === 'audio' || item.kind === 'video') return <TranscriptCard bundle={bundle} />;
  if (item.kind === 'photo') return <PhotoCard bundle={bundle} />;
  if (item.kind === 'highlight') return <HighlightCard bundle={bundle} />;
  return <NoteCard bundle={bundle} />;
}

function TranscriptCard({ bundle }: { bundle: ItemBundle }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const seek = (ms: number) => {
    const el = audioRef.current;
    if (el) {
      el.currentTime = Math.max(0, ms / 1000);
      void el.play();
    }
  };
  const claimQuotes = new Map<string, string[]>();
  for (const claim of bundle.claims) {
    const list = claimQuotes.get(claim.segmentId ?? '') ?? [];
    list.push(claim.quote);
    claimQuotes.set(claim.segmentId ?? '', list);
  }
  return (
    <Card>
      <h3 className="font-display text-xl">{bundle.item.title}</h3>
      <p className="mt-1 text-xs text-smoke">{originLabel(bundle.item.origin)} · {new Date(bundle.item.capturedAt).toLocaleString()}</p>
      {bundle.item.hasMedia && (
        <audio ref={audioRef} controls src={mediaUrl(bundle.item.id)} className="mt-3 w-full max-w-md" />
      )}
      <ol className="mt-4 space-y-3">
        {bundle.segments.map((segment) => (
          <li key={segment.id} className="flex gap-3">
            <button onClick={() => segment.startMs != null && seek(segment.startMs)} className="w-16 shrink-0 pt-0.5 text-left font-mono text-xs text-brass-deep hover:underline">
              {segment.startMs != null ? msLabel(segment.startMs) : ''}
            </button>
            <div>
              {segment.speaker && <p className="text-xs font-bold uppercase tracking-wider text-brass">{segment.speaker}</p>}
              <Underlined text={segment.text} quotes={claimQuotes.get(segment.id) ?? []} />
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function Underlined({ text, quotes }: { text: string; quotes: string[] }) {
  if (quotes.length === 0) return <p className="text-[15px] leading-relaxed">{text}</p>;
  let remaining = text;
  const parts: { key: number; value: string; underline: boolean }[] = [];
  let key = 0;
  const first = quotes.find((q) => remaining.includes(q));
  if (!first) return <p className="text-[15px] leading-relaxed">{text}</p>;
  const index = remaining.indexOf(first);
  parts.push({ key: key++, value: remaining.slice(0, index), underline: false });
  parts.push({ key: key++, value: first, underline: true });
  parts.push({ key: key++, value: remaining.slice(index + first.length), underline: false });
  return (
    <p className="text-[15px] leading-relaxed">
      {parts.map((part) => part.underline ? <u key={part.key}>{part.value}</u> : <span key={part.key}>{part.value}</span>)}
    </p>
  );
}

function PhotoCard({ bundle }: { bundle: ItemBundle }) {
  return (
    <Card>
      <h3 className="font-display text-xl">{bundle.item.title}</h3>
      <img src={mediaUrl(bundle.item.id)} alt={bundle.item.title} className="mt-3 max-h-96 rounded-md border border-hairline" loading="lazy" />
      {bundle.segments.map((segment) => (
        <p key={segment.id} className="mt-3 whitespace-pre-line text-[15px] leading-relaxed">{segment.text}</p>
      ))}
    </Card>
  );
}

function HighlightCard({ bundle }: { bundle: ItemBundle }) {
  return (
    <Card>
      <h3 className="font-display text-xl">{bundle.item.title}</h3>
      {bundle.segments.map((segment) => (
        <div key={segment.id} className="mt-3">
          <QuoteBlock quote={segment.text} provenance={segment.locator ?? bundle.item.title} />
        </div>
      ))}
    </Card>
  );
}

function NoteCard({ bundle }: { bundle: ItemBundle }) {
  return (
    <Card>
      <h3 className="font-display text-xl">{bundle.item.title}</h3>
      {bundle.segments.map((segment) => (
        <div key={segment.id} className="mt-3">
          {segment.locator && segment.locator.startsWith('#') && (
            <p className="text-xs font-bold uppercase tracking-wider text-brass">{segment.locator.slice(1)}</p>
          )}
          <p className="whitespace-pre-line text-[15px] leading-relaxed">{segment.text}</p>
        </div>
      ))}
    </Card>
  );
}

function SharedView({ state, claimsById }: { state: PersonalState | null; claimsById: Map<string, Claim> }) {
  if (!state) return <Skeleton label="Loading shared…" />;
  if (state.shares.length === 0) return <Card><p className="text-smoke">Nothing shared yet. Sharing sends one quote to the Helios record.</p></Card>;
  return (
    <div className="space-y-4">
      {state.shares.map((share) => {
        const claim = claimsById.get(share.claimId);
        return (
          <Card key={share.claimId + share.dealId}>
            <QuoteBlock quote={claim?.quote ?? '(shared)'} provenance={share.dealId + ' · ' + formatClock(share.sharedAt)} />
            <p className="mt-2 text-xs text-smoke">Shared quotes can&apos;t be unshared.</p>
          </Card>
        );
      })}
    </div>
  );
}

function ShareSheet({ claimId, dealId, claimsById, sourcesById, onClose, onDone }: {
  claimId: string;
  dealId: string;
  claimsById: Map<string, Claim>;
  sourcesById: Map<string, SourceRef>;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [sending, setSending] = useState(false);
  const claim = claimsById.get(claimId);
  const source = claim ? sourcesById.get(claim.sourceId) : undefined;
  if (!claim) return null;
  async function confirm() {
    setSending(true);
    try {
      await shareClaim(claimId, dealId);
      onDone('Shared with the firm.');
    } catch {
      onDone('Could not share. The firm may be unreachable.');
    }
    setSending(false);
  }
  return (
    <Sheet onClose={onClose} testid="share-sheet">
      <Kicker>Share with the firm</Kicker>
      <h2 className="mt-1 font-display text-2xl">Exactly this crosses</h2>
      <div className="mt-3">
        <QuoteBlock quote={claim.quote} provenance={(source?.title ?? 'Your notebook') + (claim.speaker ? ' · ' + claim.speaker : '') + (claim.at ? ' · ' + claim.at : '')} />
      </div>
      <p className="mt-3 text-sm">It becomes part of the Helios record, visible to the deal team.</p>
      <p className="mt-1 text-sm text-smoke">The rest of the talk stays in your notebook.</p>
      <div className="mt-4 flex justify-end gap-2">
        <Button tone="plain" onClick={onClose}>Cancel</Button>
        <Button tone="brass" testid="share-confirm" onClick={confirm} disabled={sending}>{sending ? 'Sharing…' : 'Share'}</Button>
      </div>
    </Sheet>
  );
}

function ReceiptsDrawer({ draftId, onClose }: { draftId: string; onClose: () => void }) {
  const [receipts, setReceipts] = useState<import('../../shared/data.js').Receipt[] | null>(null);
  const [open, setOpen] = useState<number | null>(0);
  useEffect(() => {
    getReceipts(draftId).then(setReceipts).catch(() => setReceipts([]));
  }, [draftId]);
  return (
    <Drawer onClose={onClose} testid="receipts">
      <Kicker>Receipts</Kicker>
      <h2 className="mt-1 font-display text-2xl">What Stevens used</h2>
      {!receipts && <div className="mt-4"><Skeleton label="Loading calls…" /></div>}
      {receipts && receipts.length === 0 && <p className="mt-4 text-sm text-smoke">No calls recorded for this draft.</p>}
      {receipts && receipts.map((receipt, i) => (
        <div key={receipt.callId} className="mt-4 rounded-md border border-hairline p-4">
          <button onClick={() => setOpen(open === i ? null : i)} className="flex w-full flex-wrap items-center gap-2 text-left">
            <span className="font-mono text-xs text-smoke">{receipt.purpose}</span>
            <span className="font-mono text-xs">{receipt.model}</span>
            <span className="text-xs text-smoke">{formatClock(receipt.at)} · ${receipt.costUsd.toFixed(4)}</span>
          </button>
          {open === i && (
            <div className="mt-3 space-y-3 text-sm">
              {receipt.privyHidden ? (
                <p className="font-display italic">1 privy check ran at the firm — contents hidden.</p>
              ) : (
                <>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-smoke">Went in</p>
                    <ul className="mt-1 space-y-1">
                      {receipt.included.map((entry) => (
                        <li key={entry.ruleId + entry.label} className="font-mono text-xs">{entry.label} · {entry.access} · {entry.ruleId}</li>
                      ))}
                      {receipt.included.length === 0 && <li className="text-xs text-smoke">—</li>}
                    </ul>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-smoke">Held back</p>
                    <ul className="mt-1 space-y-1">
                      {receipt.withheld.map((entry) => (
                        <li key={entry.ruleId + (entry.label ?? 'hidden')} className="font-mono text-xs">{entry.label ?? 'hidden'} · {entry.access} · {entry.ruleId}</li>
                      ))}
                      {receipt.withheld.length === 0 && <li className="text-xs text-smoke">—</li>}
                    </ul>
                  </div>
                </>
              )}
              <p className="font-mono text-xs text-smoke">{receipt.tokens.raw} raw → {receipt.tokens.assembled} assembled</p>
              <p className="font-mono text-xs text-smoke">Web search: {receipt.webSearch ? 'on' : 'off'}</p>
              <p className="font-mono text-xs text-smoke">call {receipt.callId}</p>
            </div>
          )}
          <Rule />
        </div>
      ))}
    </Drawer>
  );
}
