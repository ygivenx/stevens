import type { LedgerEvent, Role } from '../../shared/data.js';

export interface State {
  viewer: Role;
  events: LedgerEvent[];
  drafts: unknown[];
}

export interface Turn {
  turnId: number;
  startMs: number;
  endMs: number;
  transcript: string;
  speaker: string;
}

async function req<T>(path: string, role: Role, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'X-Viewer-Role': role, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(path + ' failed with ' + res.status);
  return (await res.json()) as T;
}

export function getState(role: Role): Promise<State> {
  return req<State>('/api/state', role);
}

export function postAction<T>(path: string, role: Role, body?: unknown): Promise<T> {
  return req<T>(path, role, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
}

export async function fetchMedia(role: Role, sourceId: string): Promise<string> {
  const res = await fetch('/api/media/' + sourceId, { headers: { 'X-Viewer-Role': role } });
  if (!res.ok) throw new Error('media failed with ' + res.status);
  return URL.createObjectURL(await res.blob());
}

export function fetchTranscript(role: Role, sourceId: string): Promise<{ turns: Turn[] }> {
  return req<{ turns: Turn[] }>('/api/transcript/' + sourceId, role);
}

export function watchEvents(role: Role, onMessage: () => void): () => void {
  const ctrl = new AbortController();
  (async () => {
    const res = await fetch('/api/events', { headers: { 'X-Viewer-Role': role }, signal: ctrl.signal });
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

export function msLabel(ms: number): string {
  const total = Math.floor(ms / 1000);
  return Math.floor(total / 60) + ':' + String(total % 60).padStart(2, '0');
}
