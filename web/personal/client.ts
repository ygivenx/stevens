import type { ChatThread, Claim, Draft, Item, Meeting, Person, Receipt, Role, ScenarioDev, ScenarioDisplay, Segment, SourceRef } from '../../shared/data.js';

export interface PersonalState {
  owner: Person;
  now: string;
  vaultName: string;
  status: { line: string; busy: boolean };
  solo: boolean;
  sourceStatus: { id: string; label: string; lastSyncAt: string | null; lastError: string | null; simulated?: string }[];
  items: Item[];
  meetings: (Meeting & { briefId?: string; team?: Person[]; briefFailed: boolean })[];
  drafts: Draft[];
  claims: Claim[];
  sources: SourceRef[];
  shares: { claimId: string; dealId: string; sharedAt: string }[];
  conversations: ChatThread[];
  escalations: { questionId: string; dealId: string; to: Role | null; toName?: string; reviewerNoun?: string; status: 'sent' | 'queued' }[];
  firm: { reachable: boolean; checkedAt: string };
  display: ScenarioDisplay;
  simulated: string[];
  dev?: ScenarioDev;
}

export interface ItemBundle {
  item: Item;
  segments: Segment[];
  claims: Claim[];
  mediaPath: string | null;
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(path + ' failed with ' + res.status);
  return (await res.json()) as T;
}

export function getState(): Promise<PersonalState> {
  return req<PersonalState>('/api/state');
}

export function getBundle(itemId: string): Promise<ItemBundle> {
  return req<ItemBundle>('/api/items/' + encodeURIComponent(itemId));
}

export function askQuestion(dealId: string, question: string): Promise<{ questionId: string }> {
  return req<{ questionId: string }>('/api/ask', { method: 'POST', body: JSON.stringify({ dealId, question }) });
}

export function shareClaim(claimId: string, dealId: string): Promise<{ documentId: string }> {
  return req<{ documentId: string }>('/api/share/' + encodeURIComponent(claimId), { method: 'POST', body: JSON.stringify({ dealId }) });
}

export function getReceipts(draftId: string): Promise<Receipt[]> {
  return req<Receipt[]>('/api/receipts/' + encodeURIComponent(draftId));
}

export function chatFollowUp(questionId: string, message: string): Promise<{ sentences: { text: string; citations: { kind: string }[] }[]; dropped: number }> {
  return req<{ sentences: { text: string; citations: { kind: string }[] }[]; dropped: number }>('/api/chat', { method: 'POST', body: JSON.stringify({ questionId, message }) });
}

export function mediaUrl(itemId: string): string {
  return '/api/media/' + encodeURIComponent(itemId);
}

export function firmMediaUrl(sourceId: string): string {
  return '/api/firm-media/' + encodeURIComponent(sourceId);
}

export function watchEvents(onMessage: () => void): () => void {
  const ctrl = new AbortController();
  (async () => {
    const res = await fetch('/api/events', { signal: ctrl.signal });
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

export function formatRelative(iso: string, nowIso: string): string {
  const ms = Date.parse(iso) - Date.parse(nowIso);
  const absMin = Math.round(Math.abs(ms) / 60000);
  const when = absMin < 60 ? absMin + ' min' : Math.round(absMin / 60) + ' hr';
  if (ms >= 0) return 'in ' + when;
  return when + ' ago';
}

export function formatMeetingTime(iso: string): string {
  const date = new Date(iso);
  const tomorrow = new Date(Date.now() + 24 * 3600 * 1000);
  const sameDay = date.toDateString() === new Date().toDateString();
  const isTomorrow = date.toDateString() === tomorrow.toDateString();
  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const suffix = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  if (hours === 0) hours = 12;
  const time = hours + ':' + minutes + ' ' + suffix;
  if (sameDay) return 'today ' + time;
  if (isTomorrow) return 'tomorrow ' + time;
  return date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }) + ' · ' + time;
}

export function formatDateLine(nowIso: string): string {
  return new Date(nowIso).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
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

export function msLabel(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return Math.floor(total / 60) + ':' + String(total % 60).padStart(2, '0');
}
