const firmUrl = () => process.env.STEVENS_FIRM_URL ?? 'http://localhost:8787';
const agentToken = () => process.env.STEVENS_AGENT_TOKEN ?? '';

export interface FirmMeeting {
  id: string;
  dealId: string;
  company: string;
  title: string;
  startsAt: string;
}

export interface FirmPerson {
  id: string;
  name: string;
  role: string;
}

async function agent<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(firmUrl() + path, {
    ...init,
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

export function firmContext(dealId: string, purpose: string): Promise<{ sources: unknown[]; claims: unknown[] }> {
  return agent('/agent/context?dealId=' + encodeURIComponent(dealId) + '&purpose=' + encodeURIComponent(purpose));
}

export function firmPrivy(dealId: string, question: string): Promise<{ questionId: string; verdict: unknown; failedClosed: boolean }> {
  return agent('/agent/privy', { method: 'POST', body: JSON.stringify({ dealId, question }) });
}

export function firmEscalate(dealId: string, questionId: string): Promise<{ escalationId: string; to: string | null }> {
  return agent('/agent/escalations', { method: 'POST', body: JSON.stringify({ dealId, questionId }) });
}

export function firmRelease(payload: { dealId: string; claimId: string; quote: string; provenance: Record<string, string> }): Promise<{ documentId: string }> {
  return agent('/agent/releases', { method: 'POST', body: JSON.stringify(payload) });
}
