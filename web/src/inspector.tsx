import type { LedgerEvent, Manifest, Role } from '../../shared/data.js';
import { Card, Chip, Kicker } from './ui.js';

interface CallRow {
  key: string;
  purpose: string;
  manifest: Manifest;
  model?: string;
  responseId?: string;
  dropped?: number;
  failedClosed?: boolean;
}

export function Inspector({ events, role }: { events: LedgerEvent[]; role: Role }) {
  const rows: CallRow[] = [];
  for (const event of events) {
    if (event.type === 'bridge.judged') {
      rows.push({ key: 'bridge-' + event.candidate.join('-'), purpose: 'bridge', manifest: event.manifest, model: event.api.model, responseId: event.api.responseId });
    } else if (event.type === 'draft.created') {
      rows.push({ key: 'draft-' + event.draft.id, purpose: event.draft.kind, manifest: event.manifest, model: event.api.model, responseId: event.api.responseId, dropped: event.draft.droppedSentences });
    } else if (event.type === 'privy.judged') {
      rows.push({ key: 'privy-' + event.questionId, purpose: 'privy', manifest: event.manifest, model: event.api?.model, responseId: event.api?.responseId, failedClosed: event.failedClosed });
    }
  }
  if (rows.length === 0) return <Card><p className="text-smoke">No model calls yet. Run the pipeline to fill the ledger.</p></Card>;
  return (
    <div className="space-y-4">
      {rows.map((row) => (
        <Card key={row.key} testid={'manifest-' + row.key}>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Kicker>{row.purpose}</Kicker>
            <Chip tone="mute">{row.manifest.callId}</Chip>
            {row.failedClosed && <Chip tone="warn">failed closed</Chip>}
            {row.dropped !== undefined && row.dropped > 0 && <Chip tone="warn">{row.dropped} unsupported removed</Chip>}
          </div>
          {row.purpose === 'privy' && row.manifest.included.length === 0 && row.manifest.withheld.length === 0 && role === 'Associate' ? (
            <p className="font-display text-lg italic">1 privy check ran — contents hidden.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full font-mono text-xs">
                <tbody>
                  <Field label="model" value={row.model ?? '—'} />
                  <Field label="response" value={row.responseId ?? '—'} />
                  <Field label="stage key" value={row.manifest.stageKey} />
                  <Field label="tokens" value={`${row.manifest.tokens.raw} raw → ${row.manifest.tokens.assembled} assembled`} />
                  <Field label="web search" value={String(row.manifest.webSearch)} />
                  <Field label={'included (' + row.manifest.included.length + ')'} value={row.manifest.included.map((i) => `${i.sourceId} · ${i.access} · ${i.ruleId}`).join('\n') || '—'} />
                  <Field label={'withheld (' + row.manifest.withheld.length + ')'} value={row.manifest.withheld.map((i) => `${i.sourceId} · ${i.access} · ${i.ruleId}`).join('\n') || '—'} />
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <tr className="border-t border-hairline align-top">
      <td className="whitespace-nowrap py-1.5 pr-4 text-smoke">{label}</td>
      <td className="whitespace-pre-line py-1.5">{value}</td>
    </tr>
  );
}
