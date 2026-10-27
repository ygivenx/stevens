import { serve } from '@hono/node-server';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { createApp } from '../common/app.js';
import { openProcessDb } from '../common/db.js';
import { readAll } from '../common/ledger/store.js';
import { InboxAdapter } from './adapters/inbox.js';
import { NotesAdapter, seedNotes } from './adapters/notes.js';
import { ReadwiseAdapter } from './adapters/readwise.js';
import { askQuestion } from './answer.js';
import { ingestRaws, runInboxPoll, type IngestDeps } from './ingest.js';
import { startEscalationRetry, startTriggerLoop, runMeetingTrigger } from './triggers.js';
import { receiptsFor } from './receipts.js';
import { shareClaim } from './share.js';
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

    extra.post('/api/ask', async (c) => {
      const body = (await c.req.json().catch(() => ({}))) as { dealId?: string; question?: string };
      if (!body.dealId || !body.question) return c.json({ error: 'dealId and question are required' }, 400);
      try {
        const result = await askQuestion(body.dealId, body.question);
        return c.json({ questionId: result.questionId }, 202);
      } catch (err) {
        return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
      }
    });

    extra.post('/api/share/:claimId', async (c) => {
      const body = (await c.req.json().catch(() => ({}))) as { dealId?: string };
      if (!body.dealId) return c.json({ error: 'dealId is required' }, 400);
      try {
        const result = await shareClaim(c.req.param('claimId'), body.dealId);
        return c.json(result, 201);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.startsWith('unknown claim')) return c.json({ error: message }, 404);
        if (message.includes('500 characters')) return c.json({ error: message }, 400);
        return c.json({ error: 'firm unreachable' }, 502);
      }
    });

    extra.get('/api/receipts/:draftId', (c) => {
      return c.json(receiptsFor(c.req.param('draftId')));
    });
  },
});

const inbox = new InboxAdapter();
const notes = new NotesAdapter();
const readwise = new ReadwiseAdapter();

export async function pollSources(deps: IngestDeps = {}): Promise<{ inbox: number; readwise: number; notes: number }> {
  const counts = { inbox: 0, readwise: 0, notes: 0 };
  try {
    counts.inbox = (await runInboxPoll(deps)).added;
  } catch {
    void 0;
  }
  try {
    counts.readwise = (await ingestRaws(await readwise.poll(), deps)).added;
  } catch {
    void 0;
  }
  try {
    counts.notes = (await ingestRaws(await notes.poll(), deps)).added;
  } catch {
    void 0;
  }
  if (counts.inbox + counts.readwise + counts.notes > 0) {
    void runMeetingTrigger().catch(() => {});
  }
  return counts;
}

export function bootPersonal(): () => void {
  seedNotes();
  ensureDb(readAll());
  void pollSources().catch(() => {});
  const stopInbox = inbox.watch((raws) => {
    void ingestRaws(raws).then((result) => {
      if (result.added > 0) void runMeetingTrigger().catch(() => {});
    }).catch(() => {});
  });
  const stopNotes = notes.watch((raws) => {
    void ingestRaws(raws).then((result) => {
      if (result.added > 0) void runMeetingTrigger().catch(() => {});
    }).catch(() => {});
  });
  const interval = setInterval(() => {
    void readwise.poll().then((raws) => ingestRaws(raws)).catch(() => {});
  }, 15 * 60 * 1000);
  const stopTriggers = startTriggerLoop();
  const stopRetries = startEscalationRetry();
  return () => {
    stopInbox();
    stopNotes();
    clearInterval(interval);
    stopTriggers();
    stopRetries();
  };
}

if (!process.env.VITEST) {
  bootPersonal();
  const port = Number(process.env.PERSONAL_PORT ?? 8788);
  serve({ fetch: app.fetch, port });
  console.log('stevens personal on :' + port);
}
