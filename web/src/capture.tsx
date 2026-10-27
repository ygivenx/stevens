import { useEffect, useState } from 'react';
import type { LedgerEvent, Role, Source } from '../../shared/data.js';
import { fetchMedia, fetchTranscript, msLabel, type Turn } from './api.js';
import { Card, Chip, Kicker } from './ui.js';

export function Capture({ events, role }: { events: LedgerEvent[]; role: Role }) {
  const sources = events.filter((e) => e.type === 'source.ingested').map((e) => (e as { source: Source }).source);
  const personal = sources.filter((s) => s.vault === 'personal');
  const enterprise = sources.filter((s) => s.vault === 'enterprise');
  if (sources.length === 0) return <Card><p className="text-smoke">No sources yet. Run the pipeline to ingest the fixtures.</p></Card>;
  return (
    <div className="space-y-8">
      <p className="text-xs text-smoke">Talk audio and slide photos are staged placeholders until the Ray-Ban Meta shoot; enterprise records are fictional.</p>
      <VaultSection title="Personal vault" sources={personal} role={role} tone="personal" />
      <VaultSection title="Enterprise vault" sources={enterprise} role={role} tone="enterprise" />
    </div>
  );
}

function VaultSection({ title, sources, role, tone }: { title: string; sources: Source[]; role: Role; tone: 'personal' | 'enterprise' }) {
  if (sources.length === 0) return null;
  return (
    <div className="space-y-4">
      <Kicker>{title}</Kicker>
      {sources.map((source) => (
        <Card key={source.id} testid={'source-' + source.id}>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h3 className="font-display text-xl">{source.title}</h3>
            <Chip tone={tone}>{source.vault}</Chip>
            <Chip tone="mute">{source.kind}</Chip>
            {source.vault === 'personal' && source.ownerRole === role && <Chip tone="warn">visible to you only</Chip>}
          </div>
          <SourceBody source={source} role={role} />
        </Card>
      ))}
    </div>
  );
}

function SourceBody({ source, role }: { source: Source; role: Role }) {
  if (source.kind === 'talk-audio') return <Turns sourceId={source.id} role={role} />;
  if (source.kind === 'slide-photo' || source.kind === 'deck-photo') return <Photo sourceId={source.id} role={role} text={source.text} />;
  return <p className="max-w-3xl text-[15px] leading-relaxed">{source.text}</p>;
}

function Turns({ sourceId, role }: { sourceId: string; role: Role }) {
  const [turns, setTurns] = useState<Turn[] | null>(null);
  useEffect(() => {
    fetchTranscript(role, sourceId).then((t) => setTurns(t.turns)).catch(() => setTurns([]));
  }, [sourceId, role]);
  if (turns === null) return <p className="text-sm text-smoke">Loading transcript…</p>;
  if (turns.length === 0) return <p className="text-sm text-smoke">No transcript turns.</p>;
  return (
    <ol className="space-y-3">
      {turns.map((turn) => (
        <li key={turn.turnId} className="flex gap-3">
          <span className="w-16 shrink-0 pt-0.5 font-mono text-xs text-smoke">{msLabel(turn.startMs)}</span>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-brass">Speaker {turn.speaker}</p>
            <p className="text-[15px] leading-relaxed">{turn.transcript}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function Photo({ sourceId, role, text }: { sourceId: string; role: Role; text?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    fetchMedia(role, sourceId).then((u) => { if (live) setUrl(u); }).catch(() => {});
    return () => { live = false; };
  }, [sourceId, role]);
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div>{url ? <img src={url} alt={sourceId} className="rounded-md border border-hairline" /> : <p className="text-sm text-smoke">Loading image…</p>}</div>
      <div>
        <Kicker>Read text</Kicker>
        <p className="mt-2 whitespace-pre-line font-mono text-[13px] leading-relaxed">{text}</p>
      </div>
    </div>
  );
}
