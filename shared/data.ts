export type Role = 'Associate' | 'Partner';
export type Vault = 'personal' | 'enterprise';
export type Classification = 'team' | 'partner-only' | 'wall';
export type Access = 'visible' | 'privy' | 'excluded';
export type Purpose = 'extract' | 'bridge' | 'brief' | 'privy' | 'answer' | 'decision';
export type Verdict = { verdict: 'proceed' | 'hold' | 'decline'; routeTo: Role | null };
export type Usage = { inputTokens?: number; outputTokens?: number; audioSeconds?: number; costUsd: number };
export type Api = { model: string; responseId: string; usage: Usage; stageKey: string };

export interface Source {
  id: string; vault: Vault; title: string; capturedAt: string;
  kind: 'talk-audio' | 'slide-photo' | 'article' | 'deck-photo' | 'crm' | 'memo' | 'conflicts' | 'crm-record' | 'market-comps' | 'released-quote';
  fixture: string;
  text?: string;
  ownerRole?: Role;
  classification?: Classification;
}

export interface SourceRef {
  id: string; vault: Vault; kind: Source['kind']; title: string; capturedAt: string;
  origin?: Origin; connector?: 'crm' | 'sec-form-d'; aclLabel?: string; access: Access; ruleId: string;
}

export interface AccessRule {
  id: string; vault: Vault; classification?: Classification; owner?: boolean;
  viewer: Role; purposes: Purpose[]; access: Access; member?: boolean;
}

export interface Claim {
  id: string; sourceId: string; segmentId?: string; entity: string; metric?: string; value?: string;
  quote: string;
  at?: string; speaker?: string; startMs?: number; endMs?: number;
}

export type Citation =
  | { kind: 'Fact'; claimId: string; vault: Vault; quote: string }
  | { kind: 'Inference'; fromClaimIds: string[] };

export interface Bridge { id: string; personalClaimId: string; workClaimId: string;
  relation: 'contradicts' | 'supports' | 'context'; reason: string }

export interface Receipt {
  callId: string; purpose: Purpose; model: string; at: string; costUsd: number;
  included: { label: string; access: Access; ruleId: string }[];
  withheld: { label: string | null; access: Access; ruleId: string }[];
  privyHidden: boolean; webSearch: boolean; tokens: { raw: number; assembled: number };
}

export interface Manifest {
  callId: string; purpose: Purpose; viewerRole: Role; model: string; stageKey: string;
  included: { sourceId: string; access: Access; ruleId: string }[];
  withheld: { sourceId: string; access: Access; ruleId: string }[];
  webSearch: boolean; tokens: { raw: number; assembled: number };
}

export interface Draft {
  id: string; kind: 'brief' | 'answer' | 'decision'; dealId?: string; company?: string; question?: string; questionId?: string;
  viewerId?: string; viewerRole: Role;
  sentences: { text: string; citations: Citation[] }[]; droppedSentences: number;
  bridges?: Bridge[]; verdict?: Verdict; status: 'draft' | 'approved' | 'rejected' }

export type Origin = 'glasses' | 'readwise' | 'vault';
export type ItemKind = 'audio' | 'photo' | 'video' | 'highlight' | 'note';

export interface Person { id: string; name: string; role: Role; title?: string }

export interface Meeting { id: string; dealId: string; company: string; title: string; startsAt: string; origin: 'firm' | 'calendar'; askHint?: string }

export interface ScenarioDisplay {
  roleTitles: Record<Role, string>;
  reviewerNoun: string;
  labels: { sourcePrefix: string; team: string; restricted: string; workColumn: string; personalColumn: string; unit: string };
  firmDataLabel: string;
}

export interface ScenarioDevEntry { id: string; name: string; yoursUrl: string; firmUrl: string }

export interface ScenarioDev { scenario: string; scenarios: ScenarioDevEntry[] }

export interface RawItem {
  origin: Origin; originId: string; kind: ItemKind; title: string; capturedAt: string;
  mediaPath?: string; text?: string; locator?: string; segments?: { text: string; locator?: string }[]; contentHash: string;
}

export interface Item {
  id: string; origin: Origin; originId: string; kind: ItemKind; title: string; capturedAt: string;
  status: 'normalizing' | 'extracting' | 'ready' | 'failed' | 'superseded' | 'removed'; error?: string; hasMedia: boolean;
}

export interface Segment {
  id: string; itemId: string; seq: number; text: string;
  speaker?: string; startMs?: number; endMs?: number; locator?: string;
}

export type LedgerEvent = { at: string } & (
  | { type: 'source.ingested'; source: Source; api?: Api }
  | { type: 'claims.extracted'; sourceId: string; itemId?: string; claims: Claim[]; api: Api }
  | { type: 'bridge.judged'; bridge: Bridge | null; candidate: [string, string]; manifest: Manifest; api: Api }
  | { type: 'draft.created'; draft: Draft; manifest: Manifest; api: Api }
  | { type: 'privy.judged'; questionId: string; dealId?: string; personId?: string; verdict: Verdict; manifest: Manifest; api?: Api; failedClosed: boolean }
  | { type: 'escalation.drafted'; escalationId?: string; questionId?: string; dealId?: string; from?: string; to: Role; draftId?: string }
  | { type: 'personal.released'; documentId?: string; dealId?: string; claimId: string; by: Role; sharedBy?: string;
      document?: { id: string; dealId: string; kind: string; title: string; createdAt: string; body: string; acl: string[] };
      provenance?: { title: string; origin: string; capturedAt: string; speaker?: string; at?: string } }
  | { type: 'connector.synced'; connector: 'crm'; cursor: string;
      upserted: { people: { id: string; name: string; title: string }[]; deals: { id: string; company: string; sector: string; stage: string; askUsd: number | null }[];
        meetings: { id: string; dealId: string; title: string; startsAt: string; askHint?: string }[];
        documents: { id: string; dealId: string | null; kind: string; title: string; createdAt: string; body: string | null; mediaPath: string | null; acl: string[] }[] };
      deletedDocumentIds: string[]; grants: { documentId: string; grantee: string }[];
      memberships: { personId: string; principal: string }[]; portfolio: { company: string; sector: string }[] }
  | { type: 'verdict.received'; questionId: string; dealId: string; verdict: Verdict; failedClosed: boolean }
  | { type: 'escalation.sent' | 'escalation.queued'; questionId: string; dealId: string; to: Role | null; toName?: string; reviewerNoun?: string }
  | { type: 'share.sent'; claimId: string; dealId: string; documentId: string }
  | { type: 'item.ingested'; item: Item; segments: Segment[]; contentHash: string; mediaPath?: string; api?: Api }
  | { type: 'item.revised'; item: Item; segments: Segment[]; contentHash: string; mediaPath?: string; supersedes: string; api?: Api }
  | { type: 'item.removed'; origin: Origin; originId: string; itemId: string }
  | { type: 'item.rejected'; origin: Origin; originId: string; reason: string }
  | { type: 'sync.completed'; adapter: Origin; added: number; cursor?: string }
  | { type: 'context.fetched'; dealId: string; purpose: Purpose; sourceIds: string[]; titles?: { id: string; title: string }[] }
  | { type: 'context.served'; personId: string; dealId: string; purpose: Purpose; sourceIds: string[] }
  | { type: 'attempt.failed'; stageKey: string; stage?: string; model: string; error: string; usage?: Usage; dealId?: string; questionId?: string }
  | { type: 'role.switched'; role: Role }
  | { type: 'draft.approved' | 'draft.rejected'; draftId: string; by: Role });
