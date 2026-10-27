import type { ReactNode } from 'react';
import { AlertTriangle, Check, Clock, MinusCircle, X } from 'lucide-react';

export function Button({ children, onClick, disabled, testid, tone }: { children: ReactNode; onClick: () => void; disabled?: boolean; testid?: string; tone?: 'primary' | 'plain' | 'brass' }) {
  const tones: Record<string, string> = {
    primary: 'bg-ink text-paper shadow-sm hover:-translate-y-px hover:shadow',
    plain: 'bg-paper text-ink border border-hairline shadow-[0_1px_0_rgba(28,26,21,0.04)] hover:border-brass/60 hover:-translate-y-px',
    brass: 'bg-brass text-paper shadow-[0_6px_16px_-8px_rgba(138,109,31,0.7)] hover:bg-brass-deep hover:-translate-y-px',
  };
  return (
    <button
      data-testid={testid}
      disabled={disabled}
      onClick={onClick}
      className={(tones[tone ?? 'plain']) + ' inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold tracking-wide transition-all disabled:opacity-50 disabled:hover:translate-y-0'}
    >
      {children}
    </button>
  );
}

export function Card({ children, testid, lift }: { children: ReactNode; testid?: string; lift?: boolean }) {
  return (
    <section data-testid={testid} className={'rounded-[14px] border border-hairline bg-paper p-6 shadow-[0_10px_30px_-18px_rgba(28,26,21,0.25),0_1px_2px_rgba(28,26,21,0.06)]' + (lift ? ' card-lift' : '')}>
      {children}
    </section>
  );
}

export function Kicker({ children }: { children: ReactNode }) {
  return <p className="eyebrow text-brass">{children}</p>;
}

export function Chip({ children, tone }: { children: ReactNode; tone: 'personal' | 'enterprise' | 'warn' | 'ok' | 'mute' }) {
  const tones: Record<string, string> = {
    personal: 'border-oxblood/30 bg-oxblood-soft/60 text-oxblood',
    enterprise: 'border-navy/25 bg-navy-soft/70 text-navy',
    warn: 'border-brass/40 bg-brass-soft/70 text-brass-deep',
    ok: 'border-forest/25 bg-forest-soft/60 text-forest',
    mute: 'border-hairline bg-ivory text-smoke',
  };
  return (
    <span className={tones[tone] + ' inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold tracking-wide'}>
      {children}
    </span>
  );
}

export function Avatar({ name }: { name: string }) {
  const initials = name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase();
  return (
    <span title={name} className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-ink text-[11px] font-bold text-paper ring-2 ring-paper shadow-sm">
      {initials}
    </span>
  );
}

export function VerdictPill({ verdict }: { verdict: 'proceed' | 'hold' | 'decline' }) {
  const tones: Record<string, string> = {
    hold: 'bg-brass text-paper shadow-[0_6px_16px_-8px_rgba(138,109,31,0.8)]',
    proceed: 'bg-forest text-paper',
    decline: 'bg-oxblood text-paper',
  };
  const labels: Record<string, string> = {
    hold: 'Hold',
    proceed: 'Proceed',
    decline: 'Decline',
  };
  return (
    <span data-testid="verdict" className={tones[verdict] + ' inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-bold tracking-wide'}>
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-current opacity-70" aria-hidden />
      {labels[verdict]}
    </span>
  );
}

export function QuoteBlock({ quote, provenance, onPlay }: { quote: string; provenance: string; onPlay?: () => void }) {
  return (
    <div className="rounded-xl border border-hairline bg-ivory/80 p-4">
      <blockquote className="border-l-[3px] border-brass pl-3 font-display text-[16px] italic leading-relaxed text-ink">“{quote}”</blockquote>
      <div className="mt-2.5 flex items-center gap-2 text-xs text-smoke">
        <span className="font-medium">{provenance}</span>
        {onPlay && (
          <button onClick={onPlay} aria-label="Play the moment" className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-brass text-paper shadow-sm transition-transform hover:scale-105 hover:bg-brass-deep">
            <span aria-hidden className="text-[10px]">▶</span>
          </button>
        )}
      </div>
    </div>
  );
}

export function StatusLine({ line, busy }: { line: string; busy: boolean }) {
  return (
    <p className="inline-flex items-center gap-2 rounded-full border border-hairline bg-paper/80 px-3 py-1.5 text-[13px] text-smoke shadow-sm backdrop-blur">
      {busy
        ? <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-brass border-t-transparent" aria-hidden />
        : <span className="inline-block h-1.5 w-1.5 rounded-full bg-forest" aria-hidden />}
      <span className="font-medium">{line}</span>
    </p>
  );
}

export function Skeleton({ label }: { label: string }) {
  return (
    <div className="space-y-2.5" aria-label={label}>
      <div className="h-4 w-3/4 animate-pulse rounded-full bg-hairline/80" />
      <div className="h-4 w-1/2 animate-pulse rounded-full bg-hairline/60" />
      <p className="text-sm text-smoke">{label}</p>
    </div>
  );
}

export function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full border border-ink/10 bg-ink px-4 py-2.5 text-sm font-medium text-paper shadow-xl">
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-brass" aria-hidden />
      <span>{message}</span>
      <button onClick={onClose} aria-label="Dismiss" className="rounded-full p-1 opacity-70 hover:bg-white/10 hover:opacity-100">
        <X size={14} />
      </button>
    </div>
  );
}

export function Drawer({ children, onClose, testid }: { children: ReactNode; onClose: () => void; testid?: string }) {
  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink/35 backdrop-blur-[2px]" onClick={onClose} />
      <aside data-testid={testid} className="relative h-full w-full max-w-md overflow-y-auto border-l border-hairline bg-paper p-6 shadow-2xl">
        <div className="mb-4 flex justify-end">
          <button onClick={onClose} aria-label="Close" className="rounded-full border border-hairline p-2 text-smoke transition-colors hover:bg-ivory hover:text-ink">
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
    <div className="fixed inset-0 z-40 flex items-end justify-center p-4 sm:items-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink/35 backdrop-blur-[2px]" onClick={onClose} />
      <div data-testid={testid} className="relative w-full max-w-lg rounded-2xl border border-hairline bg-paper p-6 shadow-2xl">
        {children}
      </div>
    </div>
  );
}

export function Rule() {
  return <div className="divider-fade" />;
}

export function Quote({ children }: { children: ReactNode }) {
  return <blockquote className="border-l-[3px] border-brass pl-3 font-display text-[15px] italic leading-relaxed">{children}</blockquote>;
}

export function HonestyBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-paper/70 px-2.5 py-1 text-[11px] font-medium text-smoke shadow-sm">
      <AlertTriangle size={12} aria-hidden className="text-brass" />
      {label}
    </span>
  );
}

export function EmptyCheck({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-forest">
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
    <p className="flex items-center gap-2 rounded-lg border border-oxblood/20 bg-oxblood-soft/50 px-3 py-2 text-sm font-medium text-oxblood">
      <MinusCircle size={14} aria-hidden />
      {message}
    </p>
  );
}
