import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import type { Role } from '../shared/data.js';

const app = new Hono();

function viewerRole(header: string | undefined): Role {
  return header === 'Partner' ? 'Partner' : 'Associate';
}

app.get('/api/health', (c) => c.json({ ok: true }));

app.get('/api/state', (c) => {
  const viewer = viewerRole(c.req.header('X-Viewer-Role'));
  return c.json({ viewer, events: [], drafts: [] });
});

app.use('/*', serveStatic({ root: './dist-web' }));
app.get('*', serveStatic({ path: './dist-web/index.html' }));

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port });
console.log('stevens server on :' + port);
