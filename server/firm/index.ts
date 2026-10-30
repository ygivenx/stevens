import { serve } from '@hono/node-server';
import { join, sep } from 'node:path';
import { createApp } from '../common/app.js';
import { personForToken, seedPeople } from './agent-auth.js';
import { agentContext, agentFromHeader, agentMedia, agentMeetings, agentMeta, isAgentPurpose } from './agent.js';
import { scenarioDisplay } from './connectors/crm.js';
import { draftEscalation } from './decision.js';
import { inboundRelease } from './release.js';
import { runPrivy } from './privy.js';
import { ensureFirmDb, runConnectorSync } from './sync.js';
import { buildFirmState, viewerFromHeader } from './state.js';
import { append as appendFirmEvent, readAll as readFirmLedger } from '../common/ledger/store.js';
import { receiptsForDraft } from './receipts.js';
import { classifyAcl } from './connectors/acl-map.js';
import { documentAcl, firmDocuments, getFirmDb, isMember } from './store.js';
import { firmSourceFor } from './sync.js';
import { policy } from '../common/boundary/policy.js';
import { join as joinPath, extname as extName } from 'node:path';
import { existsSync as existsSyncFs, readFileSync as readFileSyncFs } from 'node:fs';

if (!process.env.STEVENS_DATA_DIR || process.env.STEVENS_DATA_DIR === join(process.cwd(), 'data')) {
  process.env.STEVENS_DATA_DIR = join(process.cwd(), 'data', 'firm');
} else if (!process.env.STEVENS_DATA_DIR.endsWith(sep + 'firm')) {
  process.env.STEVENS_DATA_DIR = join(process.env.STEVENS_DATA_DIR, 'firm');
}

void seedPeople(process.env.STEVENS_AGENT_TOKEN).catch(() => {});

function devEnabled(): boolean {
  return process.env.STEVENS_DEV === '1';
}

export const app = createApp({
  webRoot: './dist-web-firm',
  mountExtra: (agent) => {
    agent.get('/agent/me', async (c) => {
      const person = await personForToken(c.req.header('X-Stevens-Agent'));
      if (!person) return c.json({ error: 'unknown agent' }, 401);
      return c.json(person);
    });

    agent.get('/api/people', async (c) => {
      const db = await getFirmDb();
      const rows = await db.all<{ id: string; name: string; role: 'Associate' | 'Partner' }>(`select id, name, role from people order by name`);
      const display = scenarioDisplay();
      return c.json(rows.map((row) => ({ ...row, title: display.roleTitles[row.role] ?? row.role })));
    });

    agent.get('/agent/meta', async (c) => {
      const person = await agentFromHeader(c.req.header('X-Stevens-Agent'));
      if (!person) return c.json({ error: 'unknown agent' }, 401);
      return c.json(agentMeta());
    });

    agent.get('/api/state', async (c) => {
      const viewer = await viewerFromHeader(c.req.header('X-Viewer-Id'));
      if (!viewer) return c.json({ error: 'unknown viewer' }, 401);
      return c.json(await buildFirmState(viewer));
    });

    agent.get('/api/media/:sourceId', async (c) => {
      const viewer = await viewerFromHeader(c.req.header('X-Viewer-Id'));
      if (!viewer) return c.json({ error: 'unknown viewer' }, 401);
      const docs = (await firmDocuments()).filter((doc) => doc.id === c.req.param('sourceId'));
      if (docs.length === 0) return c.json({ error: 'unknown source' }, 404);
      const doc = docs[0];
      const source = firmSourceFor(
        { id: doc.id, kind: doc.kind as Parameters<typeof firmSourceFor>[0]['kind'], title: doc.title, createdAt: doc.createdAt, body: doc.body, mediaPath: doc.mediaPath },
        classifyAcl((await documentAcl(doc.id))).classification,
      );
      if (policy(source, viewer.role, 'brief', await isMember(viewer.id, await documentAcl(doc.id))).access !== 'visible') return c.json({ error: 'unknown source' }, 404);
      if (!doc.mediaPath) return c.json({ error: 'unknown source' }, 404);
      const path = joinPath(process.env.STEVENS_FIXTURES_DIR ?? joinPath(process.cwd(), 'fixtures'), doc.mediaPath);
      if (!existsSyncFs(path)) return c.json({ error: 'unknown source' }, 404);
      const body = readFileSyncFs(path);
      const mediaTypes: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.txt': 'text/plain' };
      const found = new Uint8Array(body);
      const copy = found.buffer.slice(found.byteOffset, found.byteOffset + found.byteLength) as ArrayBuffer;
      return new Response(copy, { headers: { 'Content-Type': mediaTypes[extName(path).toLowerCase()] ?? 'application/octet-stream' } });
    });

    agent.get('/api/receipts/:draftId', async (c) => {
      const viewer = await viewerFromHeader(c.req.header('X-Viewer-Id'));
      if (!viewer) return c.json({ error: 'unknown viewer' }, 401);
      return c.json(await receiptsForDraft(viewer, c.req.param('draftId')));
    });

    agent.post('/api/approve/:draftId', async (c) => {
      const viewer = await viewerFromHeader(c.req.header('X-Viewer-Id'));
      if (!viewer) return c.json({ error: 'unknown viewer' }, 401);
      if (viewer.role !== 'Partner') return c.json({ error: 'Partner only' }, 403);
      const draftId = c.req.param('draftId');
      const created = readFirmLedger().find((e) => e.type === 'draft.created' && e.draft.id === draftId);
      if (!created || created.type !== 'draft.created') return c.json({ error: 'unknown draft' }, 404);
      if (!(await isMember(viewer.id, ['deal-team:' + created.draft.dealId]))) return c.json({ error: 'not on the deal team' }, 403);
      appendFirmEvent({ at: new Date().toISOString(), type: 'draft.approved', draftId, by: viewer.role });
      return c.json({ approved: true });
    });

    agent.post('/api/reject/:draftId', async (c) => {
      const viewer = await viewerFromHeader(c.req.header('X-Viewer-Id'));
      if (!viewer) return c.json({ error: 'unknown viewer' }, 401);
      if (viewer.role !== 'Partner') return c.json({ error: 'Partner only' }, 403);
      const draftId = c.req.param('draftId');
      const created = readFirmLedger().find((e) => e.type === 'draft.created' && e.draft.id === draftId);
      if (!created || created.type !== 'draft.created') return c.json({ error: 'unknown draft' }, 404);
      if (!(await isMember(viewer.id, ['deal-team:' + created.draft.dealId]))) return c.json({ error: 'not on the deal team' }, 403);
      appendFirmEvent({ at: new Date().toISOString(), type: 'draft.rejected', draftId, by: viewer.role });
      return c.json({ rejected: true });
    });

    agent.get('/agent/meetings', async (c) => {
      const person = await agentFromHeader(c.req.header('X-Stevens-Agent'));
      if (!person) return c.json({ error: 'unknown agent' }, 401);
      const withinHours = Number(c.req.query('withinHours') ?? 24);
      if (!Number.isFinite(withinHours) || withinHours <= 0) return c.json({ error: 'withinHours must be positive' }, 400);
      return c.json(await agentMeetings(person, withinHours));
    });

    agent.get('/agent/context', async (c) => {
      const person = await agentFromHeader(c.req.header('X-Stevens-Agent'));
      if (!person) return c.json({ error: 'unknown agent' }, 401);
      const dealId = c.req.query('dealId') ?? '';
      const purpose = c.req.query('purpose') ?? '';
      if (!dealId) return c.json({ error: 'dealId is required' }, 400);
      if (!isAgentPurpose(purpose)) return c.json({ error: 'purpose must be bridge, brief, or answer' }, 400);
      return c.json(await agentContext(person, dealId, purpose));
    });

    agent.get('/agent/media/:sourceId', async (c) => {
      const person = await agentFromHeader(c.req.header('X-Stevens-Agent'));
      if (!person) return c.json({ error: 'unknown agent' }, 401);
      const found = await agentMedia(person, c.req.param('sourceId'));
      if (!found) return c.json({ error: 'unknown source' }, 404);
      const view = found.bytes;
      const copy = view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer;
      return new Response(copy, { headers: { 'Content-Type': found.contentType } });
    });

    agent.post('/api/dev/sync', async (c) => {
      if (!devEnabled()) return c.json({ error: 'not found' }, 404);
      return c.json(await runConnectorSync());
    });

    agent.post('/agent/privy', async (c) => {
      const person = await agentFromHeader(c.req.header('X-Stevens-Agent'));
      if (!person) return c.json({ error: 'unknown agent' }, 401);
      const body = (await c.req.json().catch(() => ({}))) as { dealId?: string; question?: string; questionId?: string };
      if (!body.dealId || !body.question || !body.questionId) return c.json({ error: 'dealId, question, and questionId are required' }, 400);
      return c.json(await runPrivy(person, body.dealId, body.question, { questionId: body.questionId }));
    });

    agent.post('/agent/escalations', async (c) => {
      const person = await agentFromHeader(c.req.header('X-Stevens-Agent'));
      if (!person) return c.json({ error: 'unknown agent' }, 401);
      const body = (await c.req.json().catch(() => ({}))) as { dealId?: string; questionId?: string };
      if (!body.dealId || !body.questionId) return c.json({ error: 'dealId and questionId are required' }, 400);
      try {
        return c.json(await draftEscalation(person.id, body.dealId, body.questionId, undefined));
      } catch (err) {
        return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
      }
    });

    agent.post('/agent/releases', async (c) => {
      const person = await agentFromHeader(c.req.header('X-Stevens-Agent'));
      if (!person) return c.json({ error: 'unknown agent' }, 401);
      let payload: unknown;
      try {
        payload = await c.req.json();
      } catch {
        return c.json({ error: 'invalid payload' }, 400);
      }
      try {
        return c.json(await inboundRelease(person, payload), 201);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message === 'sender is not on the deal team') return c.json({ error: message }, 403);
        return c.json({ error: 'invalid payload' }, 400);
      }
    });
  },
});

export function bootFirm(): () => void {
  if (process.env.STEVENS_REPLAY === '1') {
    void ensureFirmDb(readFirmLedger()).catch(() => {});
    return () => {};
  }
  void ensureFirmDb(readFirmLedger())
    .then(() => runConnectorSync())
    .catch(() => {});
  const interval = setInterval(() => {
    void runConnectorSync().catch(() => {});
  }, 60 * 1000);
  return () => clearInterval(interval);
}

if (!process.env.VITEST) {
  bootFirm();
  const port = Number(process.env.FIRM_PORT ?? 8787);
  serve({ fetch: app.fetch, port });
  console.log('stevens firm on :' + port);
}
