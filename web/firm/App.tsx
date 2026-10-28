import { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, Check, Inbox as InboxIcon, Landmark, LogIn, Scale, ShieldCheck, X } from 'lucide-react';
import type { Claim, Draft, SourceRef } from '../../shared/data.js';
import {
  getState, getPeople, approveDraft, rejectDraft, getReceipts, mediaUrl, watchEvents,
  currentViewerId, setViewerId, formatClock, millions,
  type FirmState, type FirmInboxEntry,
} from './client.js';
import {
  Button, Card, Chip, Kicker, Avatar, QuoteBlock,
  StatusLine, Skeleton, Toast, Drawer, HonestyBadge, FailedLine,
} from '../ui/components.js';

type Route = 'signin' | 'inbox' | 'deal' | 'sources';

function useHash(): string {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return hash;
}

function parseRoute(hash: string): { name: Route; dealId?: string } {
  const clean = hash.replace(/^#\/?/, '');
  if (clean === 'signin') return { name: 'signin' };
  if (clean === 'sources') return { name: 'sources' };
  const deal = clean.match(/^deals\/(.+)$/);
  if (deal) return { name: 'deal', dealId: decodeURIComponent(deal[1]) };
  return { name: 'inbox' };
}

export default function App() {
  const hash = useHash();
  const route = parseRoute(hash);
  const [state, setState] = useState<FirmState | null>(null);
  const [people, setPeople] = useState<{ id: string; name: string; role: string }[]>([]);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [receiptsFor, setReceiptsFor] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setState(await getState());
      setError('');
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    getPeople().then(setPeople).catch(() => {});
    const params = new URLSearchParams(window.location.search);
    const as = params.get('as');
    if (as) setViewerId(as);
    load();
  }, [load, hash]);

  useEffect(() => watchEvents(load), [load]);

  const claimsById = useMemo(() => {
    const map = new Map<string, Claim>();
    for (const claim of state?.claims ?? []) map.set(claim.id, claim);
    return map;
  }, [state]);

  const sourcesById = useMemo(() => {
    const map = new Map<string, SourceRef>();
    for (const deal of state?.deals ?? []) {
      for (const doc of deal.documents) map.set(doc.id, doc);
    }
    return map;
  }, [state]);

  const go = (path: string) => {
    window.location.hash = '#/' + path;
  };

  return (
    <div className="min-h-screen">
      <div className="mx-auto flex max-w-6xl gap-8 px-5 pb-24">
        <aside className="sticky top-6 hidden h-fit w-60 shrink-0 self-start lg:block">
          <div className="rounded-[14px] border border-hairline bg-paper/90 p-5 shadow-[0_10px_30px_-18px_rgba(28,26,21,0.25)] backdrop-blur">
            <p className="eyebrow text-brass">A chief of staff</p>
            <h1 className="mt-1 font-display text-4xl tracking-tight">Stevens</h1>
            <p className="mt-0.5 font-display text-base italic text-smoke">firm</p>
            <div className="divider-fade mt-4" />
            <nav className="mt-4 space-y-1" aria-label="Sections">
              <SideNav label="Inbox" testid="nav-inbox" active={route.name === 'inbox'} onClick={() => go('inbox')} icon={<InboxIcon size={15} aria-hidden />} />
              <SideNav label="Sources" testid="nav-sources" active={route.name === 'sources'} onClick={() => go('sources')} icon={<Landmark size={15} aria-hidden />} />
            </nav>
            {state && (
              <div className="mt-4 rounded-xl bg-ivory/80 p-3 text-[11px] leading-relaxed text-smoke">
                {state.deals.length} deals · {state.inbox.length} in the inbox
              </div>
            )}
          </div>
        </aside>
        <div className="min-w-0 flex-1">
          <TopBar state={state} people={people} onSwitch={load} />
          {error !== '' && <p className="mt-3 rounded-lg border border-oxblood/20 bg-oxblood-soft/50 px-3 py-2 text-sm text-oxblood">{error}</p>}
          {route.name === 'signin' && <SigninView people={people} go={go} onToast={setToast} />}
          {route.name === 'inbox' && (
            <InboxView
              state={state} claimsById={claimsById} sourcesById={sourcesById} go={go}
              onReceipts={setReceiptsFor} onDone={(m) => { setToast(m); load(); }}
            />
          )}
          {route.name === 'deal' && (
            <DealView
              state={state} dealId={route.dealId ?? ''} claimsById={claimsById} sourcesById={sourcesById} go={go}
              onReceipts={setReceiptsFor} onDone={(m) => { setToast(m); load(); }}
            />
          )}
          {route.name === 'sources' && <SourcesView state={state} />}
          <footer className="mt-10 border-t border-hairline pt-4 text-xs leading-relaxed text-smoke">
            <p>Every enterprise source shows who may see it. <span className="font-semibold text-ink/80">Stevens drafts; the human decides.</span></p>
          </footer>
        </div>
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-hairline bg-paper/95 backdrop-blur lg:hidden" aria-label="Sections">
        <div className="mx-auto flex max-w-6xl">
          <button onClick={() => go('inbox')} className={'flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold ' + (route.name === 'inbox' ? 'text-ink' : 'text-smoke')}>
            <InboxIcon size={17} aria-hidden /> Inbox
          </button>
          <button onClick={() => go('sources')} className={'flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold ' + (route.name === 'sources' ? 'text-ink' : 'text-smoke')}>
            <Landmark size={17} aria-hidden /> Sources
          </button>
        </div>
      </nav>
      {receiptsFor && state && <ReceiptsDrawer draftId={receiptsFor} viewerName={state.viewer.name} onClose={() => setReceiptsFor(null)} />}
      {toast !== '' && <Toast message={toast} onClose={() => setToast('')} />}
    </div>
  );
}

function SideNav({ label, testid, active, onClick, icon }: { label: string; testid: string; active: boolean; onClick: () => void; icon: React.ReactNode }) {
  return (
    <button
      data-testid={testid}
      onClick={onClick}
      className={'flex w-full items-center gap-2.5 rounded-full px-3.5 py-2 text-sm font-semibold transition-all ' + (active ? 'bg-ink text-paper shadow-sm' : 'text-smoke hover:bg-ivory hover:text-ink')}
    >
      {icon}
      {label}
    </button>
  );
}

function TopBar({ state, people, onSwitch }: { state: FirmState | null; people: { id: string; name: string; role: string }[]; onSwitch: () => void }) {
  const current = currentViewerId();
  return (
    <header className="pb-5 pt-8">
      <div className="lg:hidden">
        <p className="eyebrow text-brass">A chief of staff</p>
        <h1 className="mt-1 font-display text-4xl tracking-tight">Stevens <span className="font-display text-xl italic text-smoke">firm</span></h1>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-[14px] border border-hairline bg-paper/90 px-4 py-3 shadow-[0_10px_30px_-20px_rgba(28,26,21,0.3)] backdrop-blur lg:mt-0">
        <div className="flex items-center gap-2.5">
          <Avatar name={state?.viewer.name ?? 'Morgan Hale'} />
          <div className="leading-tight">
            <p className="text-sm font-bold">{state ? state.viewer.name + ' · ' + state.viewer.role : 'Signing in…'}</p>
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-smoke">Simulated sign-in</p>
          </div>
        </div>
        <div className="flex-1" />
        {people.length > 0 && (
          <label className="flex items-center gap-2 text-xs text-smoke">
            View as
            <select
              value={current}
              onChange={(e) => { setViewerId(e.target.value); onSwitch(); }}
              className="rounded-full border border-hairline bg-paper px-3 py-1.5 text-xs font-semibold text-ink"
            >
              {people.map((person) => (
                <option key={person.id} value={person.id}>{person.name} · {person.role}</option>
              ))}
            </select>
          </label>
        )}
      </div>
      {state && state.simulated.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {state.simulated.map((label) => (
            <span key={label} className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-paper/70 px-2.5 py-1 text-[11px] font-medium text-smoke shadow-sm">
              <ShieldCheck size={12} aria-hidden className="text-brass" />
              {label}
            </span>
          ))}
        </div>
      )}
    </header>
  );
}

function SigninView({ people, go, onToast }: { people: { id: string; name: string; role: string }[]; go: (path: string) => void; onToast: (m: string) => void }) {
  if (people.length === 0) return <Skeleton label="Loading people…" />;
  return (
    <Card testid="signin">
      <Kicker>Simulated sign-in</Kicker>
      <h2 className="mt-1 font-display text-3xl">Who is opening Stevens?</h2>
      <p className="mt-2 text-sm text-smoke">Pick a person. The whole product reshapes around what they may see.</p>
      <div className="mt-4 space-y-2">
        {people.map((person) => (
          <button
            key={person.id}
            data-testid={'signin-' + person.id}
            onClick={() => { setViewerId(person.id); go('inbox'); onToast('Signed in as ' + person.name); }}
            className="flex w-full items-center gap-3 rounded-xl border border-hairline bg-ivory/60 px-4 py-3 text-left transition-all hover:-translate-y-px hover:border-brass/50 hover:bg-paper"
          >
            <Avatar name={person.name} />
            <span>
              <span className="block text-sm font-bold">{person.name}</span>
              <span className="block text-xs text-smoke">{person.role}</span>
            </span>
            <LogIn size={15} aria-hidden className="ml-auto text-smoke" />
          </button>
        ))}
      </div>
    </Card>
  );
}

function InboxView({ state, claimsById, sourcesById, go, onReceipts, onDone }: {
  state: FirmState | null;
  claimsById: Map<string, Claim>;
  sourcesById: Map<string, SourceRef>;
  go: (path: string) => void;
  onReceipts: (draftId: string) => void;
  onDone: (message: string) => void;
}) {
  if (!state) return <Skeleton label="Loading the inbox…" />;
  if (state.inbox.length === 0) {
    return (
      <Card>
        <Kicker>Inbox</Kicker>
        <h2 className="mt-1 font-display text-3xl">All clear</h2>
        <p className="mt-2 text-sm text-smoke">Escalations and shared quotes land here, newest first.</p>
      </Card>
    );
  }
  return (
    <div className="space-y-4" data-testid="inbox">
      <div>
        <p className="eyebrow text-brass">Inbox</p>
        <h2 className="mt-1 font-display text-[26px] leading-tight">Newest first, updating live</h2>
      </div>
      {state.inbox.map((entry) => entry.kind === 'escalation' ? (
        <EscalationCard key={entry.id} entry={entry} state={state} go={go} onDone={onDone} />
      ) : (
        <ReleasedQuoteCard key={entry.id} entry={entry} />
      ))}
      <DecisionsSection state={state} claimsById={claimsById} sourcesById={sourcesById} go={go} onReceipts={onReceipts} onDone={onDone} />
    </div>
  );
}

function EscalationCard({ entry, state, go, onDone }: {
  entry: Extract<FirmInboxEntry, { kind: 'escalation' }>;
  state: FirmState;
  go: (path: string) => void;
  onDone: (message: string) => void;
}) {
  void state;
  void onDone;
  const deal = { company: dealCompany(entry.dealId) };
  void deal;
  return (
    <Card testid="inbox-escalation" lift>
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brass-soft text-brass-deep">
          <Scale size={18} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] leading-relaxed">
            <span className="font-bold">{entry.from.name}</span> asked about <span className="font-bold">{companyFor(entry.dealId)}</span>. Stevens recommends: <span className="font-bold">hold until you review.</span>
          </p>
          <p className="mt-1.5 text-sm text-smoke">Enclosed from {entry.from.name.split(' ')[0]}&apos;s notebook: nothing.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {entry.decisionDraftId && (
              <Button tone="plain" testid="open-decision" onClick={() => go('inbox')}>Read the draft decision</Button>
            )}
            <Button tone="plain" onClick={() => go('deals/' + entry.dealId)}>Open the {companyFor(entry.dealId)} record</Button>
          </div>
        </div>
        <span className="shrink-0 text-xs text-smoke">{formatClock(entry.at)}</span>
      </div>
    </Card>
  );
}

function companyFor(dealId: string): string {
  if (dealId === 'helios') return 'Helios';
  if (dealId === 'meridian') return 'Meridian';
  if (dealId === 'beacon') return 'Beacon';
  return dealId;
}

function dealCompany(dealId: string): string {
  return companyFor(dealId);
}

function ReleasedQuoteCard({ entry }: { entry: Extract<FirmInboxEntry, { kind: 'released-quote' }> }) {
  const provenance = entry.provenance.title + (entry.provenance.speaker ? ' · ' + entry.provenance.speaker : '') + (entry.provenance.at ? ' · ' + entry.provenance.at : '');
  return (
    <Card testid="released-quote" lift>
      <p className="text-[15px] leading-relaxed">
        <span className="font-bold">{entry.from.name}</span> shared a quote from a personal capture
      </p>
      <div className="mt-3">
        <QuoteBlock quote={entry.quote} provenance={provenance} />
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <Chip tone="ok">Shared by {entry.from.name}</Chip>
        <span className="text-xs text-smoke">{companyFor(entry.dealId)} · {formatClock(entry.at)}</span>
      </div>
    </Card>
  );
}

function DecisionsSection({ state, claimsById, sourcesById, go, onReceipts, onDone }: {
  state: FirmState;
  claimsById: Map<string, Claim>;
  sourcesById: Map<string, SourceRef>;
  go: (path: string) => void;
  onReceipts: (draftId: string) => void;
  onDone: (message: string) => void;
}) {
  if (state.drafts.length === 0) return null;
  return (
    <div className="space-y-4">
      {state.drafts.map((draft) => (
        <DecisionCard key={draft.id} draft={draft} state={state} claimsById={claimsById} sourcesById={sourcesById} go={go} onReceipts={onReceipts} onDone={onDone} />
      ))}
    </div>
  );
}

function DecisionCard({ draft, state, claimsById, sourcesById, go, onReceipts, onDone }: {
  draft: Draft;
  state: FirmState;
  claimsById: Map<string, Claim>;
  sourcesById: Map<string, SourceRef>;
  go: (path: string) => void;
  onReceipts: (draftId: string) => void;
  onDone: (message: string) => void;
}) {
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const decided = draft.status !== 'draft';
  async function act(kind: 'approve' | 'reject') {
    setBusy(kind);
    try {
      if (kind === 'approve') {
        await approveDraft(draft.id);
        onDone('Approved.');
      } else {
        await rejectDraft(draft.id);
        onDone('Rejected and logged.');
      }
    } catch {
      onDone('Could not record that. Only a Partner decides.');
    }
    setBusy(null);
  }
  return (
    <div data-testid="decision">
      <Card lift>
        <Kicker>Draft decision · {companyFor(draft.dealId ?? '')}</Kicker>
        <ol className="mt-3 space-y-3">
          {(draft.sentences ?? []).map((sentence, i) => (
            <li key={i} className="text-[15px] leading-relaxed">
              <span>{sentence.text} </span>
              {sentence.citations.map((citation, j) => (
                <CitationMarker key={j} index={j} citation={citation} claimsById={claimsById} sourcesById={sourcesById} />
              ))}
            </li>
          ))}
        </ol>
        {decided ? (
          <p className="mt-3 text-sm font-semibold text-forest">
            {draft.status === 'approved' ? 'Approved by ' + state.viewer.name + ' · ' + formatClock(state.now) : 'Rejected by ' + state.viewer.name}
          </p>
        ) : (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button tone="brass" testid="approve" onClick={() => act('approve')} disabled={busy !== null}>
              <Check size={14} aria-hidden /> {busy === 'approve' ? 'Approving…' : 'Approve'}
            </Button>
            <Button tone="plain" testid="reject" onClick={() => act('reject')} disabled={busy !== null}>
              <X size={14} aria-hidden /> {busy === 'reject' ? 'Rejecting…' : 'Reject'}
            </Button>
            <Button tone="plain" onClick={() => onReceipts(draft.id)}>Receipts</Button>
          </div>
        )}
        {draft.dealId && (
          <button onClick={() => go('deals/' + draft.dealId)} className="mt-3 text-xs font-semibold text-brass-deep underline hover:text-brass">
            Open the {companyFor(draft.dealId)} record
          </button>
        )}
      </Card>
    </div>
  );
}

function CitationMarker({ index, citation, claimsById, sourcesById }: {
  index: number;
  citation: Draft['sentences'][number]['citations'][number];
  claimsById: Map<string, Claim>;
  sourcesById: Map<string, SourceRef>;
}) {
  const [open, setOpen] = useState(false);
  if (citation.kind === 'Inference') {
    return (
      <button onClick={() => setOpen(!open)} aria-label={'Source ' + (index + 1)} className="mx-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brass/15 px-1 text-[11px] font-bold text-brass-deep hover:bg-brass/30">
        {index + 1}
      </button>
    );
  }
  const claim = claimsById.get(citation.claimId);
  const source = claim ? sourcesById.get(claim.sourceId) : undefined;
  return (
    <>
      <button onClick={() => setOpen(!open)} aria-label={'Source ' + (index + 1)} className="mx-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brass/15 px-1 text-[11px] font-bold text-brass-deep hover:bg-brass/30">
        {index + 1}
      </button>
      {open && (
        <span className="mt-2 block rounded-md border border-hairline bg-ivory/70 p-3 text-sm">
          <span className="block font-display italic">“{citation.quote}”</span>
          <span className="mt-1.5 flex flex-wrap gap-1.5">
            {source && <Chip tone="enterprise">{chipFor(source)}</Chip>}
            {source && <span className="text-xs text-smoke">{source.title}</span>}
          </span>
        </span>
      )}
    </>
  );
}

function chipFor(source: SourceRef): string {
  if (source.kind === 'market-comps') return 'Public filing · SEC Form D';
  if (source.kind === 'released-quote') return 'Shared by the deal team';
  if (source.aclLabel === 'Partners') return 'Firm CRM · Partners';
  return 'Firm CRM · Deal team';
}

function DealView({ state, dealId, claimsById, sourcesById, go, onReceipts, onDone }: {
  state: FirmState | null;
  dealId: string;
  claimsById: Map<string, Claim>;
  sourcesById: Map<string, SourceRef>;
  go: (path: string) => void;
  onReceipts: (draftId: string) => void;
  onDone: (message: string) => void;
}) {
  if (!state) return <Skeleton label="Loading the deal…" />;
  const deal = state.deals.find((entry) => entry.id === dealId);
  if (!deal) {
    return (
      <Card>
        <p className="text-smoke">No such deal.</p>
        <div className="mt-3"><Button tone="plain" onClick={() => go('inbox')}>Back to Inbox</Button></div>
      </Card>
    );
  }
  const sharedQuotes = deal.documents.filter((doc) => doc.kind === 'released-quote');
  const inboxQuotes = state.inbox.filter((entry): entry is Extract<FirmInboxEntry, { kind: 'released-quote' }> => entry.kind === 'released-quote' && entry.dealId === deal.id);
  const quoteText = (id: string): string | null => {
    const found = state.inbox.find((entry) => entry.kind === 'released-quote' && entry.id === id);
    if (found && found.kind === 'released-quote') return found.quote;
    const claim = [...claimsById.values()].find((entry) => entry.sourceId === id);
    return claim?.quote ?? null;
  };
  const market = state.market;
  return (
    <div className="space-y-5">
      <Card lift>
        <p className="eyebrow text-brass">{deal.sector} · {deal.stage}</p>
        <h2 className="mt-1 font-display text-4xl">{deal.company}</h2>
        <p className="mt-1 text-sm text-smoke">
          {deal.askUsd != null ? 'Raising ' + millions(deal.askUsd) : 'Terms undisclosed'} · {deal.team.map((m) => m.name).join(' · ')}
        </p>
        <div className="mt-3 flex items-center gap-2">
          <div className="flex -space-x-2">
            {deal.team.map((member) => (
              <Avatar key={member.id} name={member.name} />
            ))}
          </div>
          <span className="text-xs text-smoke">{deal.meetings.length > 0 ? 'Next: ' + deal.meetings[0].title : 'No upcoming meetings'}</span>
        </div>
      </Card>
      <Card>
        <Kicker>Documents</Kicker>
        <ul className="mt-3 space-y-2.5">
          {deal.documents.map((doc) => (
            <li key={doc.id} className="flex flex-wrap items-center gap-2 text-sm">
              <Building2 size={14} aria-hidden className="text-smoke" />
              <span className="font-semibold">{doc.title}</span>
              <Chip tone={doc.aclLabel === 'Partners' ? 'enterprise' : 'mute'}>{chipFor(doc)}</Chip>
              {doc.kind === 'deck-photo' && (
                <img src={mediaUrl(doc.id)} alt={doc.title} className="mt-2 max-h-56 w-full rounded-lg border border-hairline object-cover" loading="lazy" />
              )}
            </li>
          ))}
          {deal.documents.length === 0 && <li className="text-sm text-smoke">Nothing visible to you here.</li>}
        </ul>
      </Card>
      {sharedQuotes.length > 0 && (
        <Card>
          <Kicker>Shared with the deal team</Kicker>
          <div className="mt-3 space-y-3">
            {sharedQuotes.map((doc) => {
              const inboxed = inboxQuotes.find((entry) => entry.id === doc.id);
              const quote = inboxed?.quote ?? quoteText(doc.id) ?? '(shared)';
              const provenance = inboxed ? inboxed.provenance.title + (inboxed.provenance.speaker ? ' · ' + inboxed.provenance.speaker : '') + (inboxed.provenance.at ? ' · ' + inboxed.provenance.at : '') : doc.title;
              return <QuoteBlock key={doc.id} quote={quote} provenance={provenance} />;
            })}
          </div>
        </Card>
      )}
      <Card>
        <Kicker>Market</Kicker>
        <h3 className="mt-1 font-display text-2xl">What public filings say</h3>
        {market.map((entry) => (
          <div key={entry.quarter} className="mt-4">
            <p className="text-sm font-semibold">{entry.quarter.replace('Q', ' Q')}: {entry.issuers} issuers · median {millions(entry.medianOfferingUsd)}</p>
            <ul className="mt-2 space-y-1.5">
              {entry.sample.map((row) => (
                <li key={row.accession} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                  <a href={row.secUrl} target="_blank" rel="noreferrer" className="font-semibold text-navy underline hover:text-brass-deep">{row.issuer}</a>
                  <span className="text-xs text-smoke">{row.filedAt} · {millions(row.totalOfferingUsd)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </Card>
      <DecisionsSection state={state} claimsById={claimsById} sourcesById={sourcesById} go={go} onReceipts={onReceipts} onDone={onDone} />
    </div>
  );
}

function SourcesView({ state }: { state: FirmState | null }) {
  if (!state) return <Skeleton label="Loading sources…" />;
  return (
    <div className="space-y-5" data-testid="sources">
      <Card lift>
        <Kicker>Connectors</Kicker>
        <h2 className="mt-1 font-display text-3xl">Where the firm reads from</h2>
        <ul className="mt-4 space-y-3">
          {state.connectors.map((connector) => (
            <li key={connector.id} className="rounded-xl border border-hairline bg-ivory/60 p-4">
              <p className="text-sm font-bold">{connector.label}</p>
              <p className="mt-1 text-xs text-smoke">
                {connector.documents} documents{connector.lastSyncAt ? ' · synced ' + formatClock(connector.lastSyncAt) : ' · never synced'}{connector.simulated ? ' · ' + connector.simulated : ''}
              </p>
              {connector.lastError && (
                <div className="mt-2"><FailedLine message={'CRM unreachable since ' + formatClock(connector.lastError.at)} /></div>
              )}
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <Kicker>Access follows the source system</Kicker>
        <h3 className="mt-1 font-display text-2xl">Who may see what</h3>
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-smoke">
              <th className="py-1.5 pr-3">Source</th>
              <th className="py-1.5">Access</th>
            </tr>
          </thead>
          <tbody>
            {state.aclMap.map((row) => (
              <tr key={row.principal} className="border-t border-hairline">
                <td className="py-2 pr-3 font-mono text-xs">{row.principal}</td>
                <td className="py-2"><Chip tone={row.classification === 'team' ? 'ok' : row.classification === 'partner-only' ? 'warn' : 'mute'}>{row.classification}</Chip></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card>
        <Kicker>The rule</Kicker>
        <h3 className="mt-1 font-display text-2xl">Team sees, partners weigh, walls hold</h3>
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-smoke">
              <th className="py-1.5 pr-3">Source</th>
              <th className="py-1.5 pr-3">Associate</th>
              <th className="py-1.5">Partner</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-hairline"><td className="py-2 pr-3">Deal team</td><td className="py-2 pr-3">Read and quote</td><td className="py-2">Read and quote</td></tr>
            <tr className="border-t border-hairline"><td className="py-2 pr-3">Partners only</td><td className="py-2 pr-3">Effect only, never content</td><td className="py-2">Read and quote</td></tr>
            <tr className="border-t border-hairline"><td className="py-2 pr-3">Legal hold</td><td className="py-2 pr-3">Nothing</td><td className="py-2">Nothing</td></tr>
            <tr className="border-t border-hairline"><td className="py-2 pr-3">Your notebook</td><td className="py-2 pr-3">Only you</td><td className="py-2">Only the owner</td></tr>
          </tbody>
        </table>
        <p className="mt-3 text-xs text-smoke">No personal source ever appears on this side. Each release covers one quote and is logged.</p>
      </Card>
    </div>
  );
}

function ReceiptsDrawer({ draftId, viewerName, onClose }: { draftId: string; viewerName: string; onClose: () => void }) {
  const [receipts, setReceipts] = useState<import('../../shared/data.js').Receipt[] | null>(null);
  const [open, setOpen] = useState<number | null>(0);
  useEffect(() => {
    getReceipts(draftId).then(setReceipts).catch(() => setReceipts([]));
  }, [draftId]);
  void viewerName;
  return (
    <Drawer onClose={onClose} testid="receipts">
      <Kicker>Receipts</Kicker>
      <h2 className="mt-1 font-display text-2xl">What Stevens used</h2>
      {!receipts && <div className="mt-4"><Skeleton label="Loading calls…" /></div>}
      {receipts && receipts.length === 0 && <p className="mt-4 text-sm text-smoke">No calls recorded for this draft.</p>}
      {receipts && receipts.map((receipt, i) => (
        <div key={receipt.callId} className="mt-4 rounded-xl border border-hairline p-4">
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
        </div>
      ))}
    </Drawer>
  );
}
