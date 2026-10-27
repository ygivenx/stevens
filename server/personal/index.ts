import { serve } from '@hono/node-server';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { createApp } from '../common/app.js';
import { openProcessDb } from '../common/db.js';
import { readAll } from '../common/ledger/store.js';
import { InboxAdapter } from './adapters/inbox.js';
import { ingestRaws, runInboxPoll } from './ingest.js';
import { ensureDb, getItemBundle, mediaPathForItem } from './store.js';

if (!process.env.STEVENS_DATA_DIR) process.env.STEVENS_DATA_DIR = join(process.cwd(), 'data', 'personal');

const schemaFile = join(process.cwd(), 'server', 'personal', 'db', 'schema.sql');

export const db = openProcessDb('personal.db', schemaFile);

const MEDIA_TYPES: Record<string, string> = { '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.mp4': 'video/mp4', '.mov': 'video/quicktime' };

function devEnabled(): boolean {
  return process.env.STEVENS_DEV === '1';
}

export const app = createApp({
  webRoot: './dist-web-personal',
  mountExtra: (extra) => {
    extra.get('/api/owner', (c) => c.json({ owner: process.env.STEVENS_OWNER ?? 'p-alex' }));

    extra.get('/api/items/:itemId', (c) => {
      const bundle = getItemBundle(c.req.param('itemId'));
      if (!bundle) return c.json({ error: 'unknown item' }, 404);
      return c.json(bundle);
    });

    extra.get('/api/media/:itemId', (c) => {
      const path = mediaPathForItem(c.req.param('itemId'));
      if (!path || !existsSync(path)) return c.json({ error: 'unknown item' }, 404);
      const body = readFileSync(path);
      c.header('Content-Type', MEDIA_TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream');
      return c.body(body);
    });

    extra.post('/api/dev/sync', async (c) => {
      if (!devEnabled()) return c.json({ error: 'not found' }, 404);
      return c.json(await runInboxPoll());
    });
  },
});

const inbox = new InboxAdapter();

export function bootPersonal(): () => void {
  ensureDb(readAll());
  void runInboxPoll().catch(() => {});
  return inbox.watch((raws) => {
    void ingestRaws(raws).catch(() => {});
  });
}

if (!process.env.VITEST) {
  bootPersonal();
  const port = Number(process.env.PERSONAL_PORT ?? 8788);
  serve({ fetch: app.fetch, port });
  console.log('stevens personal on :' + port);
}
