import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { askQuestion } from './answer.js';
import { chatReply, chatSnapshots, notebookSearch, quoteLookup, sentencesFromReply, closeChat } from './chat.js';
import { chatThread, closeDb, writeIngested } from './store.js';
import type { Claim, Source } from '../../shared/data.js';
import type { FirmSlice } from './bridge.js';

let base: string;

const VISIBLE = {
  id: 'd-helios-memo', vault: 'enterprise', kind: 'memo', title: 'Helios prep memo',
  capturedAt: '2026-10-23T00:00:00Z', connector: 'crm', access: 'visible', ruleId: 'r-team-associate',
} as const;

const PRIVY = {
  id: 'd-conflicts-lumen', vault: 'enterprise', kind: 'memo', title: 'Conflicts memo',
  capturedAt: '2026-10-23T00:00:00Z', connector: 'crm', access: 'privy', ruleId: 'r-partners-privy',
} as const;

function sliceWithPrivy(): FirmSlice {
  return {
    sources: [VISIBLE as unknown as FirmSlice['sources'][number], PRIVY as unknown as FirmSlice['sources'][number]],
    claims: [
      { id: 'd-helios-memo-c0', sourceId: 'd-helios-memo', entity: 'churn', quote: 'vendors quoting churn under two percent are measuring something else' },
      { id: 'd-conflicts-lumen-c0', sourceId: 'd-conflicts-lumen', entity: 'lumen', quote: 'the lumen conflict blocks the second meeting' },
    ],
  };
}

beforeAll(async () => {
  base = mkdtempSync(join(tmpdir(), 'stevens-chat-'));
  mkdirSync(join(base, 'personal', 'inbox'), { recursive: true });
  writeFileSync(join(base, 'personal', 'meta-fake.json'), JSON.stringify({ mode: 'normal' }));
  writeFileSync(join(base, 'personal', 'meta-calls.json'), JSON.stringify({ count: 0 }));
  process.env.STEVENS_DATA_DIR = join(base, 'personal');
  process.env.STEVENS_NOW = '2026-10-28T14:00:00-04:00';
  await writeIngested(
    { id: 'it-note1', origin: 'vault', originId: 'note1.md', kind: 'note', title: 'note1', capturedAt: '2026-10-27T00:00:00Z', status: 'ready', hasMedia: false },
    [{ id: 'it-note1-s1', itemId: 'it-note1', seq: 0, text: 'Mid-market churn runs six to eight percent annually in this category.' }],
    { contentHash: 'chat-note-1', ingestedAt: '2026-10-28T00:00:00Z' },
  );
});

afterEach(async () => {
  await closeChat();
  await closeDb();
});

async function answered(): Promise<string> {
  const asked = await askQuestion('helios', 'Should we take the second meeting?', {
    privyFn: async (dealId, question, extra) => ({ questionId: extra.questionId, verdict: { verdict: 'proceed', routeTo: null }, failedClosed: false }),
    contextFn: async () => sliceWithPrivy(),
  });
  return asked.questionId;
}

describe('chat threads', () => {
  it('threads follow-ups after the first answer with cited sentences', async () => {
    const questionId = await answered();
    const first = await chatReply(questionId, 'what was the number again?', { contextFn: async () => sliceWithPrivy() });
    expect(first.sentences.length).toBeGreaterThan(0);
    for (const sentence of first.sentences) expect(sentence.citations.length).toBeGreaterThan(0);
    expect(first.responseId).toBe('fake_chat_normal');
    const second = await chatReply(questionId, 'and the definition?', { contextFn: async () => sliceWithPrivy() });
    expect(second.sentences.length).toBeGreaterThan(0);
    const rows = await chatThread(questionId);
    expect(rows.map((row) => row.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
  });

  it('rejects unknown questions and bad messages', async () => {
    await expect(chatReply('q-nope', 'hello')).rejects.toThrow('unknown question');
    const questionId = await answered();
    await expect(chatReply(questionId, '   ')).rejects.toThrow('empty message');
    await expect(chatReply(questionId, 'x'.repeat(2001))).rejects.toThrow('message too long');
  });

  it('keeps one conversation per draft', async () => {
    const questionId = await answered();
    await chatReply(questionId, 'one', { contextFn: async () => sliceWithPrivy() });
    await chatReply(questionId, 'two', { contextFn: async () => sliceWithPrivy() });
    const { readAll } = await import('../common/ledger/store.js');
    const started = readAll().filter((event) => event.type === 'chat.started' && event.questionId === questionId);
    expect(started).toHaveLength(1);
  });
});

describe('chat citations', () => {
  it('turns bracket refs into fact citations and drops unknown ids', () => {
    const claims = new Map<string, Claim>([
      ['c1', { id: 'c1', sourceId: 's1', entity: 'churn', quote: 'churn runs six percent' }],
    ]);
    const sources = new Map<string, Source>([
      ['s1', { id: 's1', vault: 'personal', title: 'note', capturedAt: '2026-10-27T00:00:00Z', kind: 'note', text: 'churn runs six percent' }],
    ]);
    const sentences = sentencesFromReply('The number is six [c1]. Nothing about [nope].', claims, sources);
    expect(sentences).toHaveLength(2);
    expect(sentences[0].citations).toEqual([{ kind: 'Fact', claimId: 'c1', vault: 'personal', quote: 'churn runs six percent' }]);
    expect(sentences[1].citations).toEqual([]);
  });
});

describe('chat tools', () => {
  it('searches the notebook', async () => {
    const out = await notebookSearch('churn percent');
    expect(out).toContain('six to eight percent');
    expect(await notebookSearch('zxqv wjjk')).toBe('no matching notebook passages');
  });

  it('quotes personal and fetched firm claims but never privy ones', async () => {
    const questionId = await answered();
    await chatReply(questionId, 'prime the snapshot', { contextFn: async () => sliceWithPrivy() });
    const { readAll } = await import('../common/ledger/store.js');
    const started = readAll().find((event) => event.type === 'chat.started' && event.questionId === questionId);
    if (!started || started.type !== 'chat.started') throw new Error('no chat.started');
    chatSnapshots.set(started.conversationId, {
      claims: sliceWithPrivy().claims.filter((claim) => claim.id === 'd-helios-memo-c0'),
      sources: [{ id: 'd-helios-memo', vault: 'enterprise', title: 'Helios prep memo', capturedAt: '2026-10-23T00:00:00Z', kind: 'memo', text: 'churn quote' }],
    });
    expect(await quoteLookup(started.conversationId, 'd-helios-memo-c0')).toContain('churn under two percent');
    expect(await quoteLookup(started.conversationId, 'd-conflicts-lumen-c0')).toBe('unknown claim id');
    expect(await quoteLookup(started.conversationId, 'c-nope')).toBe('unknown claim id');
  });
});
