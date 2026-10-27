import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import type { Role } from '../shared/data.js';
import { readAll } from './ledger/store.js';
import { runIngest } from './pipeline/ingest.js';

const app = new Hono();

function viewerRole(header: string | undefined): Role {
  return header === 'Partner' ? 'Partner' : 'Associate';
}

app.get('/api/health', (c) => c.json({ ok: true }));

app.get('/api/state', (c) => {
  const viewer = viewerRole(c.req.header('X-Viewer-Role'));
  return c.json({ viewer, events: readAll(), drafts: [] });
});

app.get('/api/events', (c) => {
  c.header('Content-Type', 'text/event-stream');
  c.header('Cache-Control', 'no-cache');
  c.header('Connection', 'keep-alive');
  const encoder = new TextEncoder();
  let sent = 0;
  let timer: ReturnType<typeof setInterval> | null = null;
  const stream = new ReadableStream({
    start(controller) {
      const push = () => {
        const events = readAll();
        while (sent < events.length) {
          const event = events[sent];
          controller.enqueue(encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`));
          sent += 1;
        }
      };
      push();
      timer = setInterval(() => {
        try {
          push();
          controller.enqueue(encoder.encode(': ping\n\n'));
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

app.use('/*', serveStatic({ root: './dist-web' }));
app.get('*', serveStatic({ path: './dist-web/index.html' }));

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port });
console.log('stevens server on :' + port);
