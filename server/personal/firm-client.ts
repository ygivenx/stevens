const firmUrl = () => process.env.STEVENS_FIRM_URL ?? 'http://localhost:8787';
const agentToken = () => process.env.STEVENS_AGENT_TOKEN ?? '';

export function soloMode(): boolean {
  return process.env.STEVENS_FIRM_URL === 'off';
}

export interface FirmMeeting {
  id: string;
  dealId: string;
  company: string;
  title: string;
  startsAt: string;
  askHint?: string;
  team?: { id: string; name: string; role: string }[];
}

import type { Claim, ScenarioDisplay, SourceRef, Verdict } from '../../shared/data.js';

export interface FirmPerson {
  id: string;
  name: string;
  role: string;
}

export function firmTimeoutMs(): number {
  const raw = Number(process.env.STEVENS_FIRM_TIMEOUT_MS ?? 120000);
  return Number.isFinite(raw) && raw > 0 ? raw : 120000;
}

async function agent<T>(path: string, init?: RequestInit): Promise<T> {
  if (soloMode()) throw new Error('solo mode: no firm configured');
  const res = await fetch(firmUrl() + path, {
    ...init,
    signal: AbortSignal.timeout(firmTimeoutMs()),
    headers: { 'X-Stevens-Agent': agentToken(), 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error('firm ' + path + ' failed with ' + res.status);
  return (await res.json()) as T;
}

export function firmMe(): Promise<FirmPerson> {
  return agent<FirmPerson>('/agent/me');
}

export function firmMeetings(withinHours: number): Promise<FirmMeeting[]> {
  return agent<FirmMeeting[]>('/agent/meetings?withinHours=' + withinHours);
}

export function firmContext(dealId: string, purpose: string): Promise<{ sources: SourceRef[]; claims: Claim[] }> {
  return agent('/agent/context?dealId=' + encodeURIComponent(dealId) + '&purpose=' + encodeURIComponent(purpose));
}

export function firmPrivy(dealId: string, question: string, extra: { questionId: string }): Promise<{ questionId: string; verdict: Verdict; failedClosed: boolean }> {
  return agent('/agent/privy', { method: 'POST', body: JSON.stringify({ dealId, question, questionId: extra.questionId }) });
}

export function firmEscalate(dealId: string, questionId: string): Promise<{ escalationId: string; to: 'Associate' | 'Partner' | null; toName: string | null; reviewerNoun: string }> {
  return agent('/agent/escalations', { method: 'POST', body: JSON.stringify({ dealId, questionId }) });
}

export function firmMeta(): Promise<{ display: ScenarioDisplay }> {
  return agent<{ display: ScenarioDisplay }>('/agent/meta');
}

export interface ReleaseProvenance {
  title: string;
  origin: 'glasses' | 'readwise' | 'vault';
  capturedAt: string;
  speaker?: string;
  at?: string;
}

export function firmRelease(payload: { dealId: string; claimId: string; quote: string; provenance: ReleaseProvenance }): Promise<{ documentId: string }> {
  return agent('/agent/releases', { method: 'POST', body: JSON.stringify(payload) });
}
