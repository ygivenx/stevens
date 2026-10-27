import { serve } from '@hono/node-server';
import { join } from 'node:path';
import { createApp } from '../common/app.js';
import { openDatabase } from '../common/db.js';

if (!process.env.STEVENS_DATA_DIR) process.env.STEVENS_DATA_DIR = join(process.cwd(), 'data', 'personal');

const schemaFile = join(process.cwd(), 'server', 'personal', 'db', 'schema.sql');

export const db = openDatabase('personal.db', schemaFile);

export const app = createApp({
  webRoot: './dist-web-personal',
  mountExtra: (extra) => {
    extra.get('/api/owner', (c) => c.json({ owner: process.env.STEVENS_OWNER ?? 'p-alex' }));
  },
});

if (!process.env.VITEST) {
  const port = Number(process.env.PERSONAL_PORT ?? 8788);
  serve({ fetch: app.fetch, port });
  console.log('stevens personal on :' + port);
}
