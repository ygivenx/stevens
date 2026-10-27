import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import type { Role } from '../shared/data.js';
import { append, readAll } from './ledger/store.js';

for (const line of existsSync('.env.local') ? readFileSync('.env.local', 'utf8').split('\n') : []) {
  const cut = line.indexOf('=');
  if (cut > 0 && !process.env[line.slice(0, cut)]) process.env[line.slice(0, cut)] = line.slice(cut + 1).trim();
}
import { runIngest } from './pipeline/ingest.js';
import { runExtract } from './pipeline/extract.js';
import { runBridge } from './pipeline/bridge.js';
import { runBrief } from './pipeline/draft.js';
import { runAsk } from './pipeline/ask.js';
import { policy } from './boundary/policy.js';
import { filterState, indexEvents } from './boundary/filter.js';
import { fakeMode } from './meta/client.js';
import { releaseClaim } from './boundary/release.js';

export const app = new Hono();

function viewerRole(header: string | undefined): Role {
  return header === 'Partner' ? 'Partner' : 'Associate';
}

app.get('/api/health', (c) => c.json({ ok: true }));

app.get('/api/state', (c) => {
  const viewer = viewerRole(c.req.header('X-Viewer-Role'));
  return c.json({ viewer, events: filterState(readAll(), viewer), drafts: [], meta: { fakeMode: fakeMode() } });
});

app.get('/api/events', (c) => {
  c.header('Content-Type', 'text/event-stream');
  c.header('Cache-Control', 'no-cache');
  c.header('Connection', 'keep-alive');
  const encoder = new TextEncoder();
  let count = readAll().length;
  let timer: ReturnType<typeof setInterval> | null = null;
  const changed = () => encoder.encode(`event: changed\ndata: {}\n\n`);
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(changed());
      timer = setInterval(() => {
        try {
          const next = readAll().length;
          if (next !== count) {
            count = next;
            controller.enqueue(changed());
          } else {
            controller.enqueue(encoder.encode(': ping\n\n'));
          }
        } catch {
          if (timer) clearInterval(timer);
        }
      }, 500);
    },
    cancel() {
      if (timer) clearInterval(timer);
    },
  });
  return c.body(stream);
});

app.post('/api/ingest', async (c) => {
  try {
    const result = await runIngest();
    return c.json(result);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

app.post('/api/extract', async (c) => {
  try {
    const result = await runExtract();
    return c.json(result);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

app.post('/api/bridge', async (c) => {
  const viewer = viewerRole(c.req.header('X-Viewer-Role'));
  try {
    return c.json(await runBridge(viewer));
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

app.post('/api/brief', async (c) => {
  const viewer = viewerRole(c.req.header('X-Viewer-Role'));
  try {
    return c.json(await runBrief(viewer));
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

app.post('/api/ask', async (c) => {
  const viewer = viewerRole(c.req.header('X-Viewer-Role'));
  const body = (await c.req.json().catch(() => ({}))) as { question?: string };
  if (!body.question) return c.json({ error: 'question is required' }, 400);
  try {
    return c.json(await runAsk(viewer, body.question));
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

app.post('/api/approve/:draftId', (c) => {
  const by = viewerRole(c.req.header('X-Viewer-Role'));
  const draftId = c.req.param('draftId');
  const exists = readAll().some((e) => e.type === 'draft.created' && e.draft.id === draftId);
  if (!exists) return c.json({ error: 'unknown draft' }, 404);
  append({ at: new Date().toISOString(), type: 'draft.approved', draftId, by });
  return c.json({ approved: true });
});

app.post('/api/reject/:draftId', (c) => {
  const by = viewerRole(c.req.header('X-Viewer-Role'));
  const draftId = c.req.param('draftId');
  const exists = readAll().some((e) => e.type === 'draft.created' && e.draft.id === draftId);
  if (!exists) return c.json({ error: 'unknown draft' }, 404);
  append({ at: new Date().toISOString(), type: 'draft.rejected', draftId, by });
  return c.json({ rejected: true });
});

app.post('/api/switch', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { role?: string };
  if (body.role !== 'Associate' && body.role !== 'Partner') return c.json({ error: 'role must be Associate or Partner' }, 400);
  append({ at: new Date().toISOString(), type: 'role.switched', role: body.role });
  return c.json({ role: body.role });
});

app.post('/api/release/:claimId', (c) => {
  const viewer = viewerRole(c.req.header('X-Viewer-Role'));
  const events = readAll();
  const { claims, sources } = indexEvents(events);
  try {
    releaseClaim(c.req.param('claimId'), viewer, claims, sources, events);
    return c.json({ released: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message === 'only the owner can release' ? 403 : 404;
    return c.json({ error: message }, status);
  }
});

app.get('/api/transcript/:sourceId', (c) => {
  const viewer = viewerRole(c.req.header('X-Viewer-Role'));
  const { sources } = indexEvents(readAll());
  const source = sources.get(c.req.param('sourceId'));
  if (!source) return c.json({ error: 'unknown source' }, 404);
  if (policy(source, viewer, 'brief').access !== 'visible') return c.json({ error: 'unknown source' }, 404);
  const path = join(process.cwd(), 'data', 'derived', source.id + '.json');
  if (!existsSync(path)) return c.json({ error: 'unknown source' }, 404);
  return c.json(JSON.parse(readFileSync(path, 'utf8')));
});

const MEDIA_TYPES: Record<string, string> = { '.wav': 'audio/wav', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.txt': 'text/plain' };

app.get('/api/media/:sourceId', (c) => {
  const viewer = viewerRole(c.req.header('X-Viewer-Role'));
  const { sources } = indexEvents(readAll());
  const source = sources.get(c.req.param('sourceId'));
  if (!source) return c.json({ error: 'unknown source' }, 404);
  if (policy(source, viewer, 'brief').access !== 'visible') return c.json({ error: 'unknown source' }, 404);
  const path = join(process.cwd(), 'fixtures', source.fixture);
  if (!existsSync(path)) return c.json({ error: 'unknown source' }, 404);
  const body = readFileSync(path);
  c.header('Content-Type', MEDIA_TYPES[extname(path)] ?? 'application/octet-stream');
  return c.body(body);
});

app.use('/*', serveStatic({ root: './dist-web' }));
app.get('*', serveStatic({ path: './dist-web/index.html' }));

const port = Number(process.env.PORT ?? 8787);
if (!process.env.VITEST) {
  serve({ fetch: app.fetch, port });
  console.log('stevens server on :' + port);
}
