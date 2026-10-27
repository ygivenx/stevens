import type { ReactNode } from 'react';
import { AlertTriangle, Check, Clock, MinusCircle, X } from 'lucide-react';

export function Button({ children, onClick, disabled, testid, tone }: { children: ReactNode; onClick: () => void; disabled?: boolean; testid?: string; tone?: 'primary' | 'plain' | 'brass' }) {
  const tones: Record<string, string> = {
    primary: 'bg-ink text-paper hover:opacity-85',
    plain: 'bg-paper text-ink border border-hairline hover:border-brass',
    brass: 'bg-brass text-paper hover:bg-brass-deep',
  };
  return (
    <button
      data-testid={testid}
      disabled={disabled}
      onClick={onClick}
      className={(tones[tone ?? 'plain']) + ' rounded-md px-4 py-2 text-sm font-semibold tracking-wide disabled:opacity-50'}
    >
      {children}
    </button>
  );
}

export function Card({ children, testid }: { children: ReactNode; testid?: string }) {
  return (
    <section data-testid={testid} className="rounded-md border border-hairline bg-paper p-6 shadow-[0_1px_2px_rgba(28,26,21,0.06)]">
      {children}
    </section>
  );
}

export function Kicker({ children }: { children: ReactNode }) {
  return <p className="text-xs font-bold uppercase tracking-[0.18em] text-brass">{children}</p>;
}

export function Chip({ children, tone }: { children: ReactNode; tone: 'personal' | 'enterprise' | 'warn' | 'ok' | 'mute' }) {
  const tones: Record<string, string> = {
    personal: 'border-oxblood/40 text-oxblood',
    enterprise: 'border-navy/40 text-navy',
    warn: 'border-brass/50 text-brass-deep',
    ok: 'border-forest/40 text-forest',
    mute: 'border-hairline text-smoke',
  };
  return (
    <span className={tones[tone] + ' inline-block rounded-full border bg-paper px-2.5 py-0.5 text-xs font-semibold'}>
      {children}
    </span>
  );
}

export function Avatar({ name }: { name: string }) {
  const initials = name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase();
  return (
    <span title={name} className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-ink text-[11px] font-bold text-paper">
      {initials}
    </span>
  );
}

export function VerdictPill({ verdict }: { verdict: 'proceed' | 'hold' | 'decline' }) {
  const tones: Record<string, string> = {
    hold: 'bg-brass text-paper',
    proceed: 'bg-forest text-paper',
    decline: 'bg-oxblood text-paper',
  };
  const labels: Record<string, string> = {
    hold: 'Hold',
    proceed: 'Proceed',
    decline: 'Decline',
  };
  return (
    <span data-testid="verdict" className={tones[verdict] + ' inline-block rounded-full px-3 py-1 text-sm font-bold'}>
      {labels[verdict]}
    </span>
  );
}

export function QuoteBlock({ quote, provenance, onPlay }: { quote: string; provenance: string; onPlay?: () => void }) {
  return (
    <div className="rounded-md border border-hairline bg-ivory p-4">
      <blockquote className="border-l-2 border-brass pl-3 font-display text-[15px] italic leading-relaxed">“{quote}”</blockquote>
      <div className="mt-2 flex items-center gap-2 text-xs text-smoke">
        <span>{provenance}</span>
        {onPlay && (
          <button onClick={onPlay} aria-label="Play the moment" className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-brass text-paper hover:bg-brass-deep">
            <span aria-hidden>▶</span>
          </button>
        )}
      </div>
    </div>
  );
}

export function StatusLine({ line, busy }: { line: string; busy: boolean }) {
  return (
    <p className="flex items-center gap-2 text-sm text-smoke">
      {busy && <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-brass border-t-transparent" aria-hidden />}
      <span>{line}</span>
    </p>
  );
}

export function Skeleton({ label }: { label: string }) {
  return (
    <div className="animate-pulse space-y-2" aria-label={label}>
      <div className="h-4 w-3/4 rounded bg-hairline" />
      <div className="h-4 w-1/2 rounded bg-hairline" />
      <p className="text-sm text-smoke">{label}</p>
    </div>
  );
}

export function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-md border border-hairline bg-ink px-4 py-2 text-sm text-paper shadow-lg">
      <span>{message}</span>
      <button onClick={onClose} aria-label="Dismiss" className="opacity-70 hover:opacity-100">
        <X size={14} />
      </button>
    </div>
  );
}

export function Drawer({ children, onClose, testid }: { children: ReactNode; onClose: () => void; testid?: string }) {
  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink/30" onClick={onClose} />
      <aside data-testid={testid} className="relative h-full w-full max-w-md overflow-y-auto bg-paper p-6 shadow-xl">
        <div className="mb-4 flex justify-end">
          <button onClick={onClose} aria-label="Close" className="rounded-md border border-hairline p-1.5 text-smoke hover:text-ink">
            <X size={16} />
          </button>
        </div>
        {children}
      </aside>
    </div>
  );
}

export function Sheet({ children, onClose, testid }: { children: ReactNode; onClose: () => void; testid?: string }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink/30" onClick={onClose} />
      <div data-testid={testid} className="relative w-full max-w-lg rounded-t-xl bg-paper p-6 shadow-xl sm:rounded-xl">
        {children}
      </div>
    </div>
  );
}

export function Rule() {
  return <div className="h-px bg-hairline" />;
}

export function Quote({ children }: { children: ReactNode }) {
  return <blockquote className="border-l-2 border-brass pl-3 font-display text-[15px] italic">{children}</blockquote>;
}

export function HonestyBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-hairline bg-ivory px-2 py-1 text-xs text-smoke">
      <AlertTriangle size={12} aria-hidden />
      {label}
    </span>
  );
}

export function EmptyCheck({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-forest">
      <Check size={12} aria-hidden />
      {label}
    </span>
  );
}

export function PendingBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-smoke">
      <Clock size={12} aria-hidden />
      {label}
    </span>
  );
}

export function FailedLine({ message }: { message: string }) {
  return (
    <p className="flex items-center gap-2 text-sm text-oxblood">
      <MinusCircle size={14} aria-hidden />
      {message}
    </p>
  );
}
