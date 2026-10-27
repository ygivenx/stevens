import type { ReactNode } from 'react';

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

export function Tab({ label, active, onClick, testid }: { label: string; active: boolean; onClick: () => void; testid?: string }) {
  return (
    <button
      data-testid={testid}
      onClick={onClick}
      className={
        'border-b-2 px-1 pb-2 font-display text-lg ' +
        (active ? 'border-brass text-ink' : 'border-transparent text-smoke hover:text-ink')
      }
    >
      {label}
    </button>
  );
}

export function Rule() {
  return <div className="h-px bg-hairline" />;
}

export function Quote({ children }: { children: ReactNode }) {
  return <blockquote className="border-l-2 border-brass pl-3 font-display text-[15px] italic">{children}</blockquote>;
}
