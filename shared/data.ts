export type Role = 'Associate' | 'Partner';
export type Vault = 'personal' | 'enterprise';
export type Classification = 'team' | 'partner-only' | 'wall';
export type Access = 'visible' | 'privy' | 'excluded';
export type Purpose = 'extract' | 'bridge' | 'brief' | 'privy' | 'answer';
export type Verdict = { verdict: 'proceed' | 'hold' | 'decline'; routeTo: Role | null };
export type Usage = { inputTokens?: number; outputTokens?: number; audioSeconds?: number; costUsd: number };
export type Api = { model: string; responseId: string; usage: Usage; stageKey: string };

export interface Source {
  id: string; vault: Vault; title: string; capturedAt: string;
  kind: 'talk-audio' | 'slide-photo' | 'article' | 'deck-photo' | 'crm' | 'memo' | 'conflicts';
  fixture: string;
  text?: string;
  ownerRole?: Role;
  classification?: Classification;
}

export interface AccessRule {
  id: string; vault: Vault; classification?: Classification; owner?: boolean;
  viewer: Role; purposes: Purpose[]; access: Access;
}

export interface Claim {
  id: string; sourceId: string; entity: string; metric?: string; value?: string;
  quote: string;
  at?: string; speaker?: string;
}

export type Citation =
  | { kind: 'Fact'; claimId: string; vault: Vault; quote: string }
  | { kind: 'Inference'; fromClaimIds: string[] };

export interface Bridge { id: string; personalClaimId: string; workClaimId: string;
  relation: 'contradicts' | 'supports' | 'context'; reason: string }

export interface Manifest {
  callId: string; purpose: Purpose; viewerRole: Role; model: string; stageKey: string;
  included: { sourceId: string; access: Access; ruleId: string }[];
  withheld: { sourceId: string; access: Access; ruleId: string }[];
  webSearch: boolean; tokens: { raw: number; assembled: number };
}

export interface Draft { id: string; kind: 'brief' | 'answer'; question?: string; viewerRole: Role;
  sentences: { text: string; citations: Citation[] }[]; droppedSentences: number;
  verdict?: Verdict; status: 'draft' | 'approved' | 'rejected' }

export type LedgerEvent = { at: string } & (
  | { type: 'source.ingested'; source: Source; api?: Api }
  | { type: 'claims.extracted'; sourceId: string; claims: Claim[]; api: Api }
  | { type: 'bridge.judged'; bridge: Bridge | null; candidate: [string, string]; manifest: Manifest; api: Api }
  | { type: 'draft.created'; draft: Draft; manifest: Manifest; api: Api }
  | { type: 'privy.judged'; questionId: string; verdict: Verdict; manifest: Manifest; api?: Api; failedClosed: boolean }
  | { type: 'escalation.drafted'; draftId: string; to: Role }
  | { type: 'personal.released'; claimId: string; by: Role }
  | { type: 'attempt.failed'; stageKey: string; model: string; error: string; usage?: Usage }
  | { type: 'role.switched'; role: Role }
  | { type: 'draft.approved' | 'draft.rejected'; draftId: string; by: Role });
