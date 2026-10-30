import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let app: { request: (input: string, init?: RequestInit) => Promise<Response> };

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'stevens-routes-'));
  process.env.STEVENS_DATA_DIR = dir;
  process.env.STEVENS_FIRM_URL = 'off';
  process.env.STEVENS_CALENDAR_ICS = '';
  process.env.STEVENS_NOW = '2026-10-28T14:00:00Z';
  writeFileSync(join(dir, 'meta-fake.json'), JSON.stringify({ mode: 'normal' }));
  writeFileSync(join(dir, 'meta-calls.json'), JSON.stringify({ count: 0 }));
  ({ app } = await import('./index.js'));
});

afterAll(async () => {
  delete process.env.STEVENS_FIRM_URL;
  delete process.env.STEVENS_CALENDAR_ICS;
  delete process.env.STEVENS_NOW;
  const { closeDb } = await import('./store.js');
  await closeDb();
});

describe('personal routes in solo mode', () => {
  it('reports solo state with four sources', async () => {
    const res = await app.request('/api/state');
    expect(res.status).toBe(200);
    const state = (await res.json()) as { solo: boolean; sourceStatus: { id: string }[] };
    expect(state.solo).toBe(true);
    expect(state.sourceStatus.map((source) => source.id).sort()).toEqual(['calendar', 'firm', 'glasses', 'readwise', 'vault']);
  });

  it('accepts an ask with an empty dealId', async () => {
    const res = await app.request('/api/ask', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ dealId: '', question: 'What should I ask?' }),
    });
    expect(res.status).toBe(202);
  });

  it('rejects an ask without a question', async () => {
    const res = await app.request('/api/ask', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ dealId: 'helios' }),
    });
    expect(res.status).toBe(400);
  });

  it('refuses to share with 409', async () => {
    const res = await app.request('/api/share/cl-x', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ dealId: 'helios' }),
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('solo');
  });
});
