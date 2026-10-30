import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import { createModels } from '@earendil-works/pi-ai/models';
import { metaProvider } from '@earendil-works/pi-ai/providers/meta';
import { Type, type AssistantMessage } from '@earendil-works/pi-ai';
import { AssistantEntry, createRegistry, defineExtension, defineTool, Harness, type ConversationId } from '@earendil-works/pi-durable';
import { openNodeJsonlStorage } from '@earendil-works/pi-durable/storage/jsonl/node';
import { join } from 'node:path';
import type { Claim, Draft, Sentence, Source } from '../../shared/data.js';
import { append, dataDir, readAll, stageKey, PROMPT_VERSION } from '../common/ledger/store.js';
import { fakeMode } from '../common/meta/client.js';
import { dedupe, resolveSentences } from '../common/resolver/resolve.js';
import { nowIso } from '../common/clock.js';
import { allPersonalClaims, appendChatMessage, chatContext, chatThread, personalSources, searchSegments } from './store.js';
import { firmContext, soloMode } from './firm-client.js';
import { firmShells, type FirmSlice } from './bridge.js';

export const CHAT_MODEL = 'muse-spark-1.3';

export interface ChatSnapshot { claims: Claim[]; sources: Source[] }

export const chatSnapshots = new Map<number, ChatSnapshot>();

let harnessForDir: string | null = null;
let harness: Harness | null = null;
let harnessPromise: Promise<Harness> | null = null;

export async function closeChat(): Promise<void> {
  if (harnessPromise) await harnessPromise.catch(() => {});
  if (harness) await harness.close(BACKGROUND_CONTEXT).catch(() => {});
  harness = null;
  harnessPromise = null;
  harnessForDir = null;
  chatSnapshots.clear();
}

export async function notebookSearch(query: string): Promise<string> {
  const hits = await searchSegments(query, 5);
  if (hits.length === 0) return 'no matching notebook passages';
  const claims = await allPersonalClaims();
  return hits.map((hit) => {
    const ids = claims.filter((claim) => claim.segmentId === hit.id).map((claim) => claim.id);
    return 'claimIds [' + ids.join(', ') + '] | ' + hit.itemId + (hit.speaker ? ' ' + hit.speaker : '') + ': ' + hit.text;
  }).join('\n---\n');
}

export async function quoteLookup(conversationId: number, claimId: string): Promise<string> {
  let snapshot = chatSnapshots.get(conversationId);
  if (!snapshot) {
    const stored = await chatContextByConversation(conversationId);
    if (!stored) return 'no context for this conversation';
    snapshot = stored;
    chatSnapshots.set(conversationId, snapshot);
  }
  const mine = (await allPersonalClaims()).find((claim) => claim.id === claimId);
  const found = mine ?? snapshot.claims.find((claim) => claim.id === claimId);
  if (!found) return 'unknown claim id';
  const source = snapshot.sources.find((entry) => entry.id === found.sourceId)
    ?? (await personalSources('Associate')).find((entry) => entry.id === found.sourceId);
  return JSON.stringify({ quote: found.quote, entity: found.entity, source: source?.title ?? found.sourceId, vault: source?.vault ?? 'personal' });
}

async function chatContextByConversation(conversationId: number): Promise<ChatSnapshot | null> {
  for (const event of readAll()) {
    if (event.type === 'chat.started' && event.conversationId === conversationId) {
      const raw = await chatContext(event.questionId);
      if (!raw) return null;
      try {
        return JSON.parse(raw) as ChatSnapshot;
      } catch {
        return null;
      }
    }
  }
  return null;
}

const searchNotebookTool = defineTool({
  name: 'search_notebook',
  description: 'Search the owner notebook passages for a query. Returns up to five matching passages with their claim ids. Prefer passages with claim ids and fetch them with get_quote before answering.',
  parameters: Type.Object({ query: Type.String({ description: 'Search query' }) }),
  execute: async (args) => ({ output: [{ type: 'text', text: await notebookSearch(args.query) }] }),
});

const getQuoteTool = defineTool({
  name: 'get_quote',
  description: 'Fetch one claim by id from the notebook or the already-fetched firm context. Returns its quote and source.',
  parameters: Type.Object({ claimId: Type.String({ description: 'Claim id' }) }),
  execute: async (args, api) => ({ output: [{ type: 'text', text: await quoteLookup(api.conversationId, args.claimId) }] }),
});

const stevensExtension = defineExtension({ name: 'stevens', tools: [searchNotebookTool, getQuoteTool] });

const chatAgent = {
  model: { provider: 'meta', modelId: CHAT_MODEL },
  extensions: [stevensExtension],
  instructions: 'Answer from the notebook and the fetched firm context only. End every sentence with the claim ids used, like [cl-abc]. Never invent ids.',
};

async function openHarness(): Promise<Harness> {
  const dir = dataDir();
  if (harness && harnessForDir === dir) return harness;
  if (harnessPromise && harnessForDir === dir) return harnessPromise;
  if (harnessPromise) await harnessPromise.catch(() => {});
  if (harness) await harness.close(BACKGROUND_CONTEXT).catch(() => {});
  harnessForDir = dir;
  harnessPromise = (async () => {
    const models = createModels();
    models.setProvider(metaProvider());
    const registry = createRegistry();
    registry.install(stevensExtension);
    const storage = await openNodeJsonlStorage(join(dir, 'chat'), BACKGROUND_CONTEXT);
    harness = await Harness.open(storage, { models, registry }, BACKGROUND_CONTEXT);
    return harness;
  })();
  return harnessPromise;
}

function answerFor(questionId: string): Draft | null {
  for (const event of readAll()) {
    if (event.type === 'draft.created' && event.draft.kind === 'answer' && event.draft.questionId === questionId) return event.draft;
  }
  return null;
}

function conversationFor(questionId: string): number | null {
  let found: number | null = null;
  for (const event of readAll()) {
    if (event.type === 'chat.started' && event.questionId === questionId) found = event.conversationId;
  }
  return found;
}

function visibleSnapshot(slice: FirmSlice): ChatSnapshot {
  const sources = firmShells(slice);
  const ids = new Set(sources.map((source) => source.id));
  return { claims: slice.claims.filter((claim) => ids.has(claim.sourceId)), sources };
}

const REF_GROUP = /.*?(?:\[[A-Za-z0-9_-]+\][\s.,;]*)+/g;
const REF_PATTERN = /\[([A-Za-z0-9_-]+)\]/g;

function splitSentences(text: string): string[] {
  const parts: string[] = [];
  let last = 0;
  REF_GROUP.lastIndex = 0;
  for (;;) {
    const match = REF_GROUP.exec(text);
    if (!match) break;
    parts.push(match[0]);
    last = match.index + match[0].length;
  }
  const rest = text.slice(last).trim();
  if (rest) parts.push(rest);
  if (parts.length === 0) parts.push(text);
  return parts.map((part) => part.trim()).filter((part) => part.length > 0);
}

export function sentencesFromReply(text: string, claims: Map<string, Claim>, sources: Map<string, Source>): Sentence[] {
  return splitSentences(text).map((part) => {
    const refs = [...part.matchAll(REF_PATTERN)].map((match) => match[1]);
    const body = part.replace(REF_PATTERN, '').replace(/\s+/g, ' ').replace(/\s+([.,;!?])/g, '$1').trim();
    const citations = dedupe(refs.flatMap((id) => {
      const claim = claims.get(id);
      const source = claim ? sources.get(claim.sourceId) : undefined;
      if (!claim || !source || !source.text) return [];
      return [{ kind: 'Fact' as const, claimId: claim.id, vault: source.vault, quote: claim.quote }];
    }));
    return { text: body, citations };
  });
}

function fakeReply(question: string, claims: Claim[]): string {
  const first = claims[0];
  const second = claims[1] ?? claims[0];
  if (!first) return 'Nothing in the record answers that yet.';
  return `On ${question}, the notebook and the record agree [${first.id}] [${second.id}]. The record holds the numbers behind that [${first.id}].`;
}

export interface ChatDeps {
  contextFn?: (dealId: string, purpose: 'answer') => Promise<FirmSlice>;
}

export interface ChatResult { sentences: Sentence[]; dropped: number; responseId: string }

export async function chatReply(questionId: string, message: string, deps: ChatDeps = {}): Promise<ChatResult> {
  const clean = message.trim();
  if (!clean) throw new Error('empty message');
  if (clean.length > 2000) throw new Error('message too long');
  const answer = answerFor(questionId);
  if (!answer || !answer.dealId || !answer.question) throw new Error('unknown question');
  const dealId = answer.dealId;
  const contextFn = deps.contextFn ?? firmContext;
  let slice: FirmSlice = { sources: [], claims: [] };
  if (!soloMode()) {
    try {
      slice = await contextFn(dealId, 'answer');
    } catch {
      slice = { sources: [], claims: [] };
    }
  }
  const snapshot = visibleSnapshot(slice);
  const mine = await personalSources('Associate');
  const sources = [...mine, ...snapshot.sources];
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const claims = [...(await allPersonalClaims()), ...snapshot.claims];
  const claimById = new Map(claims.map((claim) => [claim.id, claim]));
  const prior = await chatThread(questionId);
  const tail = prior[prior.length - 1];
  const retrying = tail?.role === 'user' && tail.text === clean;
  const turn = prior.filter((row) => row.role === 'user').length - (retrying ? 1 : 0);
  const key = stageKey('chat', [questionId, String(turn), clean], PROMPT_VERSION, CHAT_MODEL);
  const at = nowIso();
  const seq = String(turn).padStart(4, '0');
  const userId = questionId + '-' + seq + '-a';
  const asstId = questionId + '-' + seq + '-r';
  if (!retrying) {
    await appendChatMessage({ id: userId, questionId, role: 'user', text: clean, citations: null, createdAt: at });
    append({ at, type: 'chat.asked', questionId, messageId: userId, text: clean });
  }
  let conversationId = conversationFor(questionId);
  if (fakeMode() !== 'live') {
    if (conversationId === null) {
      conversationId = -1;
      append({ at, type: 'chat.started', questionId, dealId, conversationId });
    }
    const text = fakeReply(answer.question, claims);
    const resolved = resolveSentences(sentencesFromReply(text, claimById, sourceById), claimById, sourceById);
    await appendChatMessage({ id: asstId, questionId, role: 'assistant', text: resolved.kept.map((sentence) => sentence.text).join(' '), citations: JSON.stringify(resolved.kept), createdAt: nowIso() });
    append({ at: nowIso(), type: 'chat.replied', questionId, messageId: asstId, sentences: resolved.kept, dropped: resolved.dropped, api: { model: CHAT_MODEL, responseId: 'fake_chat_normal', usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 }, stageKey: key } });
    return { sentences: resolved.kept, dropped: resolved.dropped, responseId: 'fake_chat_normal' };
  }
  const harness = await openHarness();
  if (conversationId === null) {
    const created = await harness.createConversation({ ownership: { kind: 'ownerless' }, agent: chatAgent }, BACKGROUND_CONTEXT);
    conversationId = created.id;
    append({ at, type: 'chat.started', questionId, dealId, conversationId });
  }
  chatSnapshots.set(conversationId, snapshot);
  await appendChatMessage({ id: key + '-c', questionId, role: 'context', text: '', citations: JSON.stringify(snapshot), createdAt: at });
  let conversation = await harness.conversation(conversationId as ConversationId, BACKGROUND_CONTEXT);
  if (!conversation) {
    const created = await harness.createConversation({ ownership: { kind: 'ownerless' }, agent: chatAgent }, BACKGROUND_CONTEXT);
    conversationId = created.id;
    append({ at, type: 'chat.started', questionId, dealId, conversationId });
    conversation = await harness.conversation(created.id, BACKGROUND_CONTEXT);
    if (!conversation) throw new Error('conversation lost');
  }
  const history = prior.map((row) => (row.role === 'user' ? 'Owner: ' + row.text : 'Stevens: ' + row.text)).join('\n');
  const prompt = `The owner asks a follow-up about deal ${dealId}. Original question: ${answer.question}.`
    + (history ? `\nThread so far:\n${history}` : '')
    + `\nAnswer in sentences. End every sentence with the claim ids you used, like [${claims[0]?.id ?? 'claim-id'}]. Use search_notebook and get_quote for anything beyond the answer. Never invent ids.`;
  const before = await harness.usage(BACKGROUND_CONTEXT);
  const beforeModel = before.models['meta/' + CHAT_MODEL];
  const submission = await conversation.submit({ type: 'input', content: prompt + '\n\nFollow-up: ' + clean, requestId: key }, BACKGROUND_CONTEXT);
  const settled = await submission.wait(BACKGROUND_CONTEXT);
  if (settled.status !== 'done' || settled.type !== 'input') throw new Error('chat run did not finish');
  const entry = await conversation.commit((tx) => tx.entry(AssistantEntry, settled.answer), BACKGROUND_CONTEXT);
  const assistant = (entry?.model ?? []).find((message): message is AssistantMessage => message.role === 'assistant');
  const text = (assistant?.content ?? []).map((block) => (block.type === 'text' ? block.text : '')).join('');
  const resolved = resolveSentences(sentencesFromReply(text, claimById, sourceById), claimById, sourceById);
  const after = await harness.usage(BACKGROUND_CONTEXT);
  const afterModel = after.models['meta/' + CHAT_MODEL];
  const used = {
    inputTokens: (afterModel?.input ?? 0) - (beforeModel?.input ?? 0),
    outputTokens: (afterModel?.output ?? 0) - (beforeModel?.output ?? 0),
    costUsd: (afterModel?.cost?.total ?? 0) - (beforeModel?.cost?.total ?? 0),
  };
  await appendChatMessage({ id: asstId, questionId, role: 'assistant', text: resolved.kept.map((sentence) => sentence.text).join(' '), citations: JSON.stringify(resolved.kept), createdAt: nowIso() });
  append({
    at: nowIso(), type: 'chat.replied', questionId, messageId: asstId, sentences: resolved.kept, dropped: resolved.dropped,
    api: { model: CHAT_MODEL, responseId: String(settled.answer), usage: used, stageKey: key },
  });
  return { sentences: resolved.kept, dropped: resolved.dropped, responseId: String(settled.answer) };
}
