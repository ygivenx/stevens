import type { Citation, Claim, Role, Source } from '../../shared/data.js';
import { Chip, Quote } from './ui.js';

export function SentenceList({ sentences, claims, sources, role, released, onRelease }: {
  sentences: { text: string; citations: Citation[] }[];
  claims: Map<string, Claim>;
  sources: Map<string, Source>;
  role: Role;
  released: Set<string>;
  onRelease: (claimId: string) => void;
}) {
  if (sentences.length === 0) return <p className="font-display text-lg italic text-smoke">Nothing relevant in the record.</p>;
  return (
    <ol className="space-y-5">
      {sentences.map((sentence, i) => (
        <li key={i} className="space-y-2">
          <p className="font-display text-[17px] leading-relaxed">
            <span className="mr-2 text-sm font-bold text-brass">{i + 1}.</span>
            {sentence.text}
          </p>
          <div className="flex flex-wrap items-center gap-2 pl-6">
            {sentence.citations.map((citation, j) => (
              <CitationChip key={j} citation={citation} claims={claims} sources={sources} role={role} released={released} onRelease={onRelease} />
            ))}
          </div>
        </li>
      ))}
    </ol>
  );
}

function CitationChip({ citation, claims, sources, role, released, onRelease }: {
  citation: Citation;
  claims: Map<string, Claim>;
  sources: Map<string, Source>;
  role: Role;
  released: Set<string>;
  onRelease: (claimId: string) => void;
}) {
  if (citation.kind === 'Inference') {
    return <Chip tone="mute">Inference from {citation.fromClaimIds.length} claim{citation.fromClaimIds.length === 1 ? '' : 's'}</Chip>;
  }
  const claim = claims.get(citation.claimId);
  const source = claim ? sources.get(claim.sourceId) : undefined;
  const personal = citation.vault === 'personal';
  const owner = source?.ownerRole === role;
  const shared = released.has(citation.claimId);
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Chip tone={personal ? 'personal' : 'enterprise'}>{personal ? 'Personal · Fact' : 'Enterprise · Fact'}</Chip>
      {personal && owner && !shared && <Chip tone="warn">visible to you only</Chip>}
      {personal && shared && <Chip tone="ok">Shared with the firm</Chip>}
      <span className="max-w-full">
        <Quote>{citation.quote}</Quote>
      </span>
      {claim && source && (
        <span className="text-xs text-smoke">
          {source.title}
          {claim.speaker ? ` · ${claim.speaker}` : ''}{claim.at ? ` · ${claim.at}` : ''}
        </span>
      )}
      {personal && owner && !shared && claim && (
        <button
          data-testid={'release-' + claim.id}
          onClick={() => onRelease(claim.id)}
          className="rounded-md border border-brass/50 px-2 py-0.5 text-xs font-semibold text-brass-deep hover:bg-brass hover:text-paper"
        >
          Share with the firm
        </button>
      )}
    </span>
  );
}
