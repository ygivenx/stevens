import { serve } from '@hono/node-server';
import { join } from 'node:path';
import { createApp } from '../common/app.js';
import { openProcessDb } from '../common/db.js';
import { personForToken, seedPeople } from './agent-auth.js';

if (!process.env.STEVENS_DATA_DIR) process.env.STEVENS_DATA_DIR = join(process.cwd(), 'data', 'firm');

const schemaFile = join(process.cwd(), 'server', 'firm', 'db', 'schema.sql');

export const db = openProcessDb('firm.db', schemaFile);
seedPeople(db, process.env.STEVENS_AGENT_TOKEN);

export const app = createApp({
  webRoot: './dist-web-firm',
  mountExtra: (agent) => {
    agent.get('/agent/me', (c) => {
      const person = personForToken(db, c.req.header('X-Stevens-Agent'));
      if (!person) return c.json({ error: 'unknown agent' }, 401);
      return c.json(person);
    });
  },
});

if (!process.env.VITEST) {
  const port = Number(process.env.FIRM_PORT ?? 8787);
  serve({ fetch: app.fetch, port });
  console.log('stevens firm on :' + port);
}
