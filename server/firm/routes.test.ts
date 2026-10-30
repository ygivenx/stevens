import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { closeFirmDb, getFirmDb } from './store.js';
import { seedPeople } from './agent-auth.js';
import { runConnectorSync, testReader } from './sync.js';
import type { FirmState } from './state.js';

let app: typeof import('./index.js')['app'];

beforeEach(async () => {
  await closeFirmDb();
  const dir = join(mkdtempSync(join(tmpdir(), 'stevens-routes-')), 'firm');
  mkdirSync(dir, { recursive: true });
  process.env.STEVENS_DATA_DIR = dir;
  process.env.STEVENS_AGENT_TOKEN = 'test-agent-token-9b';
  writeFileSync(join(dir, 'meta-fake.json'), JSON.stringify({ mode: 'normal' }));
  writeFileSync(join(dir, 'meta-calls.json'), JSON.stringify({ count: 0 }));
  await seedPeople('test-agent-token-9b');
  await runConnectorSync({ reader: testReader() });
  const mod = await import('./index.js');
  app = mod.app;
});

async function stateAs(viewerId: string | undefined): Promise<{ status: number; body: string; json: FirmState | null }> {
  const headers: Record<string, string> = {};
  if (viewerId) headers['X-Viewer-Id'] = viewerId;
  const res = await app.request('/api/state', { headers });
  const body = await res.text();
  let json: FirmState | null = null;
  try {
    json = JSON.parse(body) as FirmState;
  } catch {
    json = null;
  }
  return { status: res.status, body, json };
}

async function readFirstChunk(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) throw new Error('missing stream body');
  const { value } = await reader.read();
  await reader.cancel();
  return new TextDecoder().decode(value);
}

describe('route boundary', () => {
  it('lists people for the simulated sign-in picker', async () => {
    const res = await app.request('/api/people');
    expect(res.status).toBe(200);
    const people = (await res.json()) as { id: string; role: string }[];
    expect(people.map((person) => person.id)).toContain('p-alex');
    expect(people.map((person) => person.id)).toContain('p-morgan');
  });

  it('requires a known viewer for state', async () => {
    expect((await app.request('/api/state')).status).toBe(401);
    expect((await app.request('/api/state', { headers: { 'X-Viewer-Id': 'nobody' } })).status).toBe(401);
  });

  it('serves associate state without privy, wall, or personal text', async () => {
    const { status, body, json } = await stateAs('p-alex');
    expect(status).toBe(200);
    expect(json?.viewer.id).toBe('p-alex');
    expect(body).toContain('Helios');
    for (const leaked of ['Lumen', 'Granite', 'legal hold', 'd-conflicts-lumen', 'd-granite']) {
      expect(body).not.toContain(leaked);
    }
    const ids = (json?.deals ?? []).flatMap((deal) => deal.documents.map((doc) => doc.id));
    expect(ids).not.toContain('d-conflicts-lumen');
    expect(ids).not.toContain('d-granite');
  });

  it('serves partner state with the conflicts memo but no wall or personal text', async () => {
    const { status, body, json } = await stateAs('p-morgan');
    expect(status).toBe(200);
    expect(body).toContain('Lumen');
    const ids = (json?.deals ?? []).flatMap((deal) => deal.documents.map((doc) => doc.id));
    expect(ids).toContain('d-conflicts-lumen');
    expect(ids).not.toContain('d-granite');
    for (const leaked of ['Granite', 'legal hold']) {
      expect(body).not.toContain(leaked);
    }
  });

  it('serves deck media to the deal team and refuses anything else', async () => {
    const deck = await app.request('/api/media/d-helios-deck', { headers: { 'X-Viewer-Id': 'p-alex' } });
    expect(deck.status).toBe(200);
    expect(deck.headers.get('content-type')).toContain('image');
    const conflicts = await app.request('/api/media/d-conflicts-lumen', { headers: { 'X-Viewer-Id': 'p-alex' } });
    expect(conflicts.status).toBe(404);
    const missing = await app.request('/api/media/no-such-doc', { headers: { 'X-Viewer-Id': 'p-morgan' } });
    expect(missing.status).toBe(404);
    const anonymous = await app.request('/api/media/d-helios-deck');
    expect(anonymous.status).toBe(401);
  });

  it('streams only empty changed signals with no ledger text', async () => {
    for (const viewerId of ['p-alex', 'p-morgan']) {
      const res = await app.request('/api/events', { headers: { 'X-Viewer-Id': viewerId } });
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/event-stream');
      const chunk = await readFirstChunk(res);
      expect(chunk).toContain('event: changed');
      expect(chunk).toContain('data: {}');
      for (const leaked of ['Lumen', 'Granite', 'conflicts', 'privy']) {
        expect(chunk).not.toContain(leaked);
      }
    }
  });

  it('rejects agent calls without a token and identifies the owner with one', async () => {
    const anonymous = await app.request('/agent/me');
    expect(anonymous.status).toBe(401);
    const authed = await app.request('/agent/me', { headers: { 'X-Stevens-Agent': 'test-agent-token-9b' } });
    expect(authed.status).toBe(200);
    const person = (await authed.json()) as { id: string; name: string; role: string };
    expect(person.id).toBe('p-alex');
    expect(person.role).toBe('Associate');
    const impostor = await app.request('/agent/me', { headers: { 'X-Stevens-Agent': 'wrong-token' } });
    expect(impostor.status).toBe(401);
  });
});
