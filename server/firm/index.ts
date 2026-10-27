import { serve } from '@hono/node-server';
import { join } from 'node:path';
import { createApp } from '../common/app.js';
import { personForToken, seedPeople } from './agent-auth.js';
import { getFirmDb } from './store.js';
import { agentContext, agentFromHeader, agentMedia, agentMeetings, isAgentPurpose } from './agent.js';
import { draftEscalation } from './decision.js';
import { inboundRelease } from './release.js';
import { runPrivy } from './privy.js';
import { runConnectorSync } from './sync.js';

if (!process.env.STEVENS_DATA_DIR) process.env.STEVENS_DATA_DIR = join(process.cwd(), 'data', 'firm');

export const db = getFirmDb();
seedPeople(db, process.env.STEVENS_AGENT_TOKEN);

function devEnabled(): boolean {
  return process.env.STEVENS_DEV === '1';
}

export const app = createApp({
  webRoot: './dist-web-firm',
  mountExtra: (agent) => {
    agent.get('/agent/me', (c) => {
      const person = personForToken(db, c.req.header('X-Stevens-Agent'));
      if (!person) return c.json({ error: 'unknown agent' }, 401);
      return c.json(person);
    });

    agent.get('/agent/meetings', (c) => {
      const person = agentFromHeader(c.req.header('X-Stevens-Agent'));
      if (!person) return c.json({ error: 'unknown agent' }, 401);
      const withinHours = Number(c.req.query('withinHours') ?? 24);
      if (!Number.isFinite(withinHours) || withinHours <= 0) return c.json({ error: 'withinHours must be positive' }, 400);
      return c.json(agentMeetings(person, withinHours));
    });

    agent.get('/agent/context', (c) => {
      const person = agentFromHeader(c.req.header('X-Stevens-Agent'));
      if (!person) return c.json({ error: 'unknown agent' }, 401);
      const dealId = c.req.query('dealId') ?? '';
      const purpose = c.req.query('purpose') ?? '';
      if (!dealId) return c.json({ error: 'dealId is required' }, 400);
      if (!isAgentPurpose(purpose)) return c.json({ error: 'purpose must be bridge, brief, or answer' }, 400);
      return c.json(agentContext(person, dealId, purpose));
    });

    agent.get('/agent/media/:sourceId', (c) => {
      const person = agentFromHeader(c.req.header('X-Stevens-Agent'));
      if (!person) return c.json({ error: 'unknown agent' }, 401);
      const found = agentMedia(person, c.req.param('sourceId'));
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
      const person = agentFromHeader(c.req.header('X-Stevens-Agent'));
      if (!person) return c.json({ error: 'unknown agent' }, 401);
      const body = (await c.req.json().catch(() => ({}))) as { dealId?: string; question?: string; questionId?: string };
      if (!body.dealId || !body.question || !body.questionId) return c.json({ error: 'dealId, question, and questionId are required' }, 400);
      return c.json(await runPrivy(person, body.dealId, body.question, { questionId: body.questionId }));
    });

    agent.post('/agent/escalations', async (c) => {
      const person = agentFromHeader(c.req.header('X-Stevens-Agent'));
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
      const person = agentFromHeader(c.req.header('X-Stevens-Agent'));
      if (!person) return c.json({ error: 'unknown agent' }, 401);
      let payload: unknown;
      try {
        payload = await c.req.json();
      } catch {
        return c.json({ error: 'invalid payload' }, 400);
      }
      try {
        return c.json(inboundRelease(person, payload), 201);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message === 'sender is not on the deal team') return c.json({ error: message }, 403);
        return c.json({ error: 'invalid payload' }, 400);
      }
    });
  },
});

export function bootFirm(): void {
  void runConnectorSync().catch(() => {});
}

if (!process.env.VITEST) {
  bootFirm();
  const port = Number(process.env.FIRM_PORT ?? 8787);
  serve({ fetch: app.fetch, port });
  console.log('stevens firm on :' + port);
}
