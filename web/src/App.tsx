import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Claim, LedgerEvent, Role, Source } from '../../shared/data.js';
import { getState, postAction, watchEvents } from './api.js';
import { Button, Tab } from './ui.js';
import { Capture } from './capture.js';
import { Brief } from './brief.js';
import { Answer } from './answer.js';
import { Inspector } from './inspector.js';

type TabName = 'Capture' | 'Brief' | 'Answer' | 'Inspector';

export default function App() {
  const [role, setRole] = useState<Role>('Associate');
  const [events, setEvents] = useState<LedgerEvent[]>([]);
  const [tab, setTab] = useState<TabName>('Capture');
  const [question, setQuestion] = useState('Should we take the second Helios meeting?');
  const [stage, setStage] = useState('');
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const state = await getState(role);
      setEvents(state.events);
    } catch (e) {
      setError(String(e));
    }
  }, [role]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => watchEvents(role, load), [role, load]);

  const derived = useMemo(() => {
    const claims = new Map<string, Claim>();
    const sources = new Map<string, Source>();
    const released = new Set<string>();
    const approved = new Map<string, Role>();
    for (const event of events) {
      if (event.type === 'source.ingested') sources.set(event.source.id, event.source);
      if (event.type === 'claims.extracted') for (const c of event.claims) claims.set(c.id, c);
      if (event.type === 'personal.released') released.add(event.claimId);
      if (event.type === 'draft.approved') approved.set(event.draftId, event.by);
    }
    return { claims, sources, released, approved };
  }, [events]);

  async function switchRole(next: Role) {
    if (next === role) return;
    await postAction('/api/switch', role, { role: next });
    setRole(next);
  }

  async function runPipeline() {
    setError('');
    setStage('ingesting');
    try {
      await postAction('/api/ingest', role);
      setStage('extracting');
      await postAction('/api/extract', role);
      setStage('bridging');
      await postAction('/api/bridge', role);
      setStage('drafting');
      await postAction('/api/brief', role);
      setStage('');
      setTab('Brief');
      await load();
    } catch (e) {
      setStage('');
      setError(String(e));
    }
  }

  async function ask() {
    if (question.trim().length === 0) return;
    setAsking(true);
    setError('');
    try {
      await postAction('/api/ask', role, { question });
      setTab('Answer');
      await load();
    } catch (e) {
      setError(String(e));
    }
    setAsking(false);
  }

  async function release(claimId: string) {
    await postAction('/api/release/' + claimId, role);
    await load();
  }

  async function approve(draftId: string) {
    await postAction('/api/approve/' + draftId, role);
    await load();
  }

  const drafts = events.filter((e) => e.type === 'draft.created').length;

  return (
    <div className="mx-auto max-w-5xl px-5 pb-16">
      <header className="pb-4 pt-8">
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-brass">A chief of staff</p>
        <h1 className="mt-1 font-display text-5xl tracking-tight">Stevens</h1>
        <p className="mt-1 font-display text-lg italic text-smoke">Stevens drafts; the human decides.</p>
        <div className="mt-4 h-px bg-brass/60" />
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2" data-testid="role-switch">
            {(['Associate', 'Partner'] as Role[]).map((r) => (
              <button
                key={r}
                data-testid={'role-' + r}
                onClick={() => switchRole(r)}
                className={
                  'rounded-md border px-3 py-1.5 text-sm font-semibold ' +
                  (r === role ? 'border-ink bg-ink text-paper' : 'border-hairline bg-paper text-smoke hover:text-ink')
                }
              >
                {r}
              </button>
            ))}
            <span className="text-xs text-smoke">simulated sign-in</span>
          </div>
          <div className="flex-1" />
          <Button tone="brass" testid="run-pipeline" onClick={runPipeline} disabled={stage !== ''}>
            {stage === '' ? 'Run pipeline' : stage + '…'}
          </Button>
        </div>
        {error !== '' && <p className="mt-3 text-sm text-oxblood" data-testid="error">{error}</p>}
      </header>

      <nav className="mb-6 flex gap-6 border-b border-hairline">
        {(['Capture', 'Brief', 'Answer', 'Inspector'] as TabName[]).map((name) => (
          <Tab key={name} label={name} testid={'tab-' + name} active={tab === name} onClick={() => setTab(name)} />
        ))}
        <div className="flex-1" />
        <p className="self-center text-xs text-smoke">{events.length} events · {drafts} drafts</p>
      </nav>

      <main>
        {tab === 'Capture' && <Capture events={events} role={role} />}
        {tab === 'Brief' && <Brief events={events} role={role} data={derived} onRelease={release} />}
        {tab === 'Answer' && (
          <Answer
            events={events} role={role} data={derived} question={question} setQuestion={setQuestion}
            onAsk={ask} asking={asking} onApprove={approve} onRelease={release} approved={derived.approved}
          />
        )}
        {tab === 'Inspector' && <Inspector events={events} role={role} />}
      </main>

      <footer className="mt-10 border-t border-hairline pt-4 text-xs text-smoke">
        <p>All people, firms, and figures are fictional. Captures are staged and pre-recorded. <span className="font-semibold">Stevens drafts; the human decides.</span></p>
      </footer>
    </div>
  );
}
