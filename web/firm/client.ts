import type { Claim, Draft, Meeting, Person, Receipt, SourceRef } from '../../shared/data.js';

export interface FirmDeal {
  id: string;
  company: string;
  sector: string;
  stage: string;
  askUsd: number | null;
  team: Person[];
  meetings: Meeting[];
  documents: SourceRef[];
}

export type FirmInboxEntry =
  | { kind: 'escalation'; id: string; dealId: string; from: Person; at: string; decisionDraftId?: string }
  | { kind: 'released-quote'; id: string; dealId: string; from: Person; at: string; quote: string; provenance: { title: string; origin: string; capturedAt: string; speaker?: string; at?: string } };

export interface FirmMarket {
  quarter: string;
  issuers: number;
  medianOfferingUsd: number;
  sample: { issuer: string; filedAt: string; totalOfferingUsd: number; accession: string; secUrl: string }[];
}

export interface FirmState {
  viewer: Person;
  now: string;
  deals: FirmDeal[];
  inbox: FirmInboxEntry[];
  drafts: Draft[];
  claims: Claim[];
  market: FirmMarket[];
  connectors: { id: string; label: string; lastSyncAt: string | null; documents: number; simulated?: string }[];
  aclMap: { principal: string; classification: string }[];
  simulated: string[];
}

function viewerHeaders(): Record<string, string> {
  const params = new URLSearchParams(window.location.search);
  const as = params.get('as') ?? localStorage.getItem('stevens-viewer') ?? 'p-morgan';
  return { 'X-Viewer-Id': as };
}

export function currentViewerId(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get('as') ?? localStorage.getItem('stevens-viewer') ?? 'p-morgan';
}

export function setViewerId(id: string): void {
  localStorage.setItem('stevens-viewer', id);
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...viewerHeaders(), ...(init?.headers ?? {}) },
  });
  if (res.ok && res.status === 204) return undefined as T;
  if (!res.ok) throw new Error(path + ' failed with ' + res.status);
  return (await res.json()) as T;
}

export function getPeople(): Promise<Person[]> {
  return fetch('/api/people').then(async (res) => {
    if (!res.ok) throw new Error('/api/people failed with ' + res.status);
    return (await res.json()) as Person[];
  });
}

export function getState(): Promise<FirmState> {
  return req<FirmState>('/api/state');
}

export function approveDraft(draftId: string): Promise<{ approved: boolean }> {
  return req<{ approved: boolean }>('/api/approve/' + encodeURIComponent(draftId), { method: 'POST' });
}

export function rejectDraft(draftId: string): Promise<{ rejected: boolean }> {
  return req<{ rejected: boolean }>('/api/reject/' + encodeURIComponent(draftId), { method: 'POST' });
}

export function getReceipts(draftId: string): Promise<Receipt[]> {
  return req<Receipt[]>('/api/receipts/' + encodeURIComponent(draftId));
}

export function mediaUrl(sourceId: string): string {
  return '/api/media/' + encodeURIComponent(sourceId);
}

export function watchEvents(onMessage: () => void): () => void {
  const ctrl = new AbortController();
  (async () => {
    const res = await fetch('/api/events', { headers: viewerHeaders(), signal: ctrl.signal });
    const reader = res.body?.getReader();
    if (!reader) return;
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (decoder.decode(value).includes('event:')) onMessage();
    }
  })().catch(() => {});
  return () => ctrl.abort();
}

export function formatClock(iso: string): string {
  const date = new Date(iso);
  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const suffix = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  if (hours === 0) hours = 12;
  return hours + ':' + minutes + ' ' + suffix;
}

export function millions(usd: number): string {
  return '$' + (usd / 1000000).toFixed(1) + 'M';
}
