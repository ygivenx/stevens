import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import OpenAI from 'openai';
import { z } from 'zod';
import type { Citation, Claim, Source, Usage, Verdict } from '../../../shared/data.js';

export type FakeMode = 'live' | 'normal' | 'empty' | 'fail' | 'garbage' | 'slow';

export interface TranscriptTurn { turnId: number; startMs: number; endMs: number; transcript: string; speaker: string }
export interface Transcript { sessionId: string; transcript: string; audioSeconds: number; turns: TranscriptTurn[] }
export interface ImageText { text: string; responseId: string; usage: Usage }

const VOICE_MODEL = 'muse-voice-transcribe-1.0';
const VISION_MODEL = 'muse-spark-1.3';

function dataDir(): string {
  const dir = process.env.STEVENS_DATA_DIR ?? join(process.cwd(), 'data');
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function fakeMode(): FakeMode {
  const path = join(dataDir(), 'meta-fake.json');
  if (!existsSync(path)) return 'live';
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as { mode?: FakeMode };
  return parsed.mode ?? 'live';
}

export function countCall(): number {
  const path = join(dataDir(), 'meta-calls.json');
  const current = existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as { count?: number }).count ?? 0 : 0;
  const next = current + 1;
  writeFileSync(path, JSON.stringify({ count: next }));
  return next;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const CANNED_TRANSCRIPT: Transcript = {
  sessionId: 'fake/transcribe/00000000000000000000000000000000',
  transcript: 'Thanks for coming to my talk on mid-market SaaS benchmarks. In this category, mid-market churn runs six to eight percent annually. Anyone quoting under two percent is measuring something else. Quick question. Does that six to eight percent include downgrades, or logo churn only? Great question. That is logo churn only. Net revenue churn with expansion is a different story.',
  audioSeconds: 22.56,
  turns: [
    { turnId: 0, startMs: 60, endMs: 11100, transcript: 'Thanks for coming to my talk on mid-market SaaS benchmarks. In this category, mid-market churn runs six to eight percent annually. Anyone quoting under two percent is measuring something else.', speaker: 'A' },
    { turnId: 1, startMs: 11420, endMs: 16620, transcript: 'Quick question. Does that six to eight percent include downgrades, or logo churn only?', speaker: 'B' },
    { turnId: 2, startMs: 16860, endMs: 22060, transcript: 'Great question. That is logo churn only. Net revenue churn with expansion is a different story.', speaker: 'A' },
  ],
};

const CANNED_IMAGE = 'Mid-Market SaaS Benchmarks 2026\nLogo churn 6-8% annually\nNet churn under 2% = check the definition\nSource: fictional conference talk\nSpeaker 2, Oct 20 talk';

function fakeUsage(): Usage {
  return { inputTokens: 0, outputTokens: 0, costUsd: 0 };
}

function requireKey(): string {
  const key = process.env.MODEL_API_KEY;
  if (!key) throw new Error('MODEL_API_KEY is not set');
  return key;
}

export async function transcribe(wavPath: string): Promise<Transcript> {
  const mode = fakeMode();
  countCall();
  if (mode === 'fail') throw new Error('fake voice failure');
  if (mode === 'slow') await sleep(5000);
  if (mode === 'empty') return { sessionId: 'fake/transcribe/empty', transcript: '', audioSeconds: 0, turns: [] };
  if (mode === 'garbage') return { sessionId: 'fake/transcribe/garbage', transcript: 42 as unknown as string, audioSeconds: 0, turns: [] };
  if (mode !== 'live') return CANNED_TRANSCRIPT;
  const form = new FormData();
  form.set('request', new Blob([JSON.stringify({ model: VOICE_MODEL, audioEncoding: 'WAV', mode: 'DIARIZATION' })], { type: 'application/json' }));
  form.set('audio', new Blob([readFileSync(wavPath)], { type: 'audio/wav' }), 'recording.wav');
  const res = await fetch('https://api.meta.ai/v1/asr/transcribe', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + requireKey(), Accept: 'application/json' },
    body: form,
  });
  if (!res.ok) throw new Error('voice transcribe failed with status ' + res.status);
  const body = (await res.json()) as { sessionId: string; transcript: string; audioDurationMs: number; turns: TranscriptTurn[] };
  if (typeof body.transcript !== 'string' || !Array.isArray(body.turns)) throw new Error('voice response failed validation');
  return { sessionId: body.sessionId, transcript: body.transcript, audioSeconds: body.audioDurationMs / 1000, turns: body.turns };
}

export async function readImage(jpgPath: string, prompt: string): Promise<ImageText> {
  const mode = fakeMode();
  countCall();
  if (mode === 'fail') throw new Error('fake vision failure');
  if (mode === 'slow') await sleep(5000);
  if (mode === 'empty') return { text: '', responseId: 'fake_resp_empty', usage: fakeUsage() };
  if (mode === 'garbage') return { text: 42 as unknown as string, responseId: 'fake_resp_garbage', usage: fakeUsage() };
  if (mode !== 'live') return { text: CANNED_IMAGE, responseId: 'fake_resp_normal', usage: fakeUsage() };
  const client = new OpenAI({ baseURL: 'https://api.meta.ai/v1', apiKey: requireKey() });
  const dataUrl = 'data:image/jpeg;base64,' + readFileSync(jpgPath).toString('base64');
  const resp = await client.responses.create({
    model: VISION_MODEL,
    reasoning: { effort: 'low' },
    input: [{ role: 'user', content: [{ type: 'input_text', text: prompt }, { type: 'input_image', image_url: dataUrl, detail: 'auto' }] }],
  });
  const usage: Usage = {
    inputTokens: resp.usage?.input_tokens,
    outputTokens: resp.usage?.output_tokens,
    costUsd: ((resp.usage?.input_tokens ?? 0) * 1.25 + (resp.usage?.output_tokens ?? 0) * 4.25) / 1_000_000,
  };
  return { text: resp.output_text, responseId: resp.id, usage };
}

export function voiceCost(audioSeconds: number): number {
  return (audioSeconds / 3600) * 0.18;
}

export interface RawClaim { entity: string; metric?: string | null; value?: string | null; quote: string; at?: string | null; speaker?: string | null }
export interface Extracted { claims: RawClaim[]; responseId: string; usage: Usage }

const EXTRACT_MODEL = 'muse-spark-1.3-contributor';

function firstSentence(text: string): string {
  const match = text.replace(/\s+/g, ' ').trim().match(/^(.+?[.!?])(\s|$)/);
  return (match ? match[1] : text).slice(0, 200);
}

function fakeClaims(text: string): RawClaim[] {
  const quote = firstSentence(text);
  const lowered = text.toLowerCase();
  if (lowered.includes('churn')) return [{ entity: 'churn', metric: 'churn', value: 'see quote', quote }];
  return [{ entity: 'general', quote }];
}

const CLAIM_SCHEMA = {
  type: 'object',
  properties: {
    claims: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          entity: { type: 'string' },
          metric: { type: ['string', 'null'] },
          value: { type: ['string', 'null'] },
          quote: { type: 'string' },
          at: { type: ['string', 'null'] },
          speaker: { type: ['string', 'null'] },
        },
        required: ['entity', 'metric', 'value', 'quote', 'at', 'speaker'],
        additionalProperties: false,
      },
    },
  },
  required: ['claims'],
  additionalProperties: false,
} as const;

export async function extractClaims(sourceId: string, text: string, turns?: TranscriptTurn[]): Promise<Extracted> {
  const mode = fakeMode();
  countCall();
  if (mode === 'fail') throw new Error('fake extraction failure');
  if (mode === 'slow') await sleep(5000);
  if (mode === 'empty') return { claims: [], responseId: 'fake_extract_empty', usage: fakeUsage() };
  if (mode === 'garbage') return { claims: [{ entity: 'general', quote: 'a sentence that appears nowhere in the source' }], responseId: 'fake_extract_garbage', usage: fakeUsage() };
  if (mode !== 'live') return { claims: fakeClaims(text), responseId: 'fake_extract_normal', usage: fakeUsage() };
  const client = new OpenAI({ baseURL: 'https://api.meta.ai/v1', apiKey: requireKey() });
  const anchors = turns && turns.length > 0
    ? '\nSpeaker turns (copy at/speaker exactly):\n' + turns.map((t) => `${t.speaker} ${(t.startMs / 1000).toFixed(0)}s: ${t.transcript}`).join('\n')
    : '';
  const resp = await client.responses.create({
    model: EXTRACT_MODEL,
    reasoning: { effort: 'low' },
    input: `Extract factual claims from this ${sourceId} text. Every quote must be copied verbatim from the text.\n\n${text}${anchors}`,
    text: { format: { type: 'json_schema', name: 'claims', schema: CLAIM_SCHEMA, strict: true } },
  });
  const parsed = JSON.parse(resp.output_text) as { claims: RawClaim[] };
  if (!Array.isArray(parsed.claims)) throw new Error('extraction response failed validation');
  const usage: Usage = {
    inputTokens: resp.usage?.input_tokens,
    outputTokens: resp.usage?.output_tokens,
    costUsd: ((resp.usage?.input_tokens ?? 0) * 1.25 + (resp.usage?.output_tokens ?? 0) * 4.25) / 1_000_000,
  };
  return { claims: parsed.claims, responseId: resp.id, usage };
}

export const voiceModel = VOICE_MODEL;
export const visionModel = VISION_MODEL;
export const extractModel = EXTRACT_MODEL;

export const WONDER_MODEL = 'muse-wonder-1.0';

export const Judgement = z.strictObject({
  relation: z.enum(['contradicts', 'supports', 'context', 'reject']),
  reason: z.string().min(1),
});
export type Judgement = z.infer<typeof Judgement>;

const JUDGE_SCHEMA = {
  type: 'object',
  properties: {
    relation: { type: 'string', enum: ['contradicts', 'supports', 'context', 'reject'] },
    reason: { type: 'string' },
  },
  required: ['relation', 'reason'],
  additionalProperties: false,
} as const;

export interface Judged { judgement: Judgement; responseId: string; usage: Usage }

export async function judgeBridge(personal: Claim, work: Claim, prompt: string): Promise<Judged> {
  const mode = fakeMode();
  countCall();
  if (mode === 'fail') throw new Error('fake judge failure');
  if (mode === 'slow') await sleep(5000);
  if (mode === 'empty') return { judgement: { relation: 'reject', reason: 'empty' }, responseId: 'fake_judge_empty', usage: fakeUsage() };
  if (mode === 'garbage') return { judgement: Judgement.parse({ relation: 'maybe', reason: '' }), responseId: 'fake_judge_garbage', usage: fakeUsage() };
  if (mode !== 'live') {
    const both = personal.quote.toLowerCase().includes('churn') && work.quote.toLowerCase().includes('churn');
    return {
      judgement: both
        ? { relation: 'contradicts', reason: 'both quote churn benchmarks with incompatible definitions' }
        : { relation: 'reject', reason: 'unrelated claims' },
      responseId: 'fake_judge_normal',
      usage: fakeUsage(),
    };
  }
  const client = new OpenAI({ baseURL: 'https://api.meta.ai/v1', apiKey: requireKey() });
  const resp = await client.responses.create({
    model: WONDER_MODEL,
    reasoning: { effort: 'high' },
    input: prompt,
    text: { format: { type: 'json_schema', name: 'judgement', schema: JUDGE_SCHEMA, strict: true } },
  });
  const judgement = Judgement.parse(JSON.parse(resp.output_text));
  return { judgement, responseId: resp.id, usage: wonderUsage(resp.usage?.input_tokens, resp.usage?.output_tokens) };
}

export const DraftSentence = z.strictObject({
  text: z.string().min(1),
  citations: z.array(z.strictObject({
    kind: z.enum(['Fact', 'Inference']),
    claimId: z.string().nullable().optional(),
    vault: z.enum(['personal', 'enterprise']).nullable().optional(),
    quote: z.string().nullable().optional(),
    fromClaimIds: z.array(z.string()).nullable().optional(),
  })).min(1),
});
const DraftBody = z.strictObject({ sentences: z.array(DraftSentence) });

const DRAFT_SCHEMA = {
  type: 'object',
  properties: {
    sentences: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          citations: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                kind: { type: 'string', enum: ['Fact', 'Inference'] },
                claimId: { type: ['string', 'null'] },
                vault: { type: ['string', 'null'], enum: ['personal', 'enterprise', null] },
                quote: { type: ['string', 'null'] },
                fromClaimIds: { type: ['array', 'null'], items: { type: 'string' } },
              },
              required: ['kind', 'claimId', 'vault', 'quote', 'fromClaimIds'],
              additionalProperties: false,
            },
          },
        },
        required: ['text', 'citations'],
        additionalProperties: false,
      },
    },
  },
  required: ['sentences'],
  additionalProperties: false,
} as const;

export interface Written { sentences: { text: string; citations: Citation[] }[]; responseId: string; usage: Usage }

export async function writeDraft(prompt: string, claims: Claim[], sources: Source[]): Promise<Written> {
  const mode = fakeMode();
  countCall();
  if (mode === 'fail') throw new Error('fake writer failure');
  if (mode === 'slow') await sleep(5000);
  if (mode === 'empty' || claims.length === 0) return { sentences: [], responseId: 'fake_write_empty', usage: fakeUsage() };
  if (mode === 'garbage') {
    return { sentences: [{ text: 'Invented.', citations: [{ kind: 'Fact', claimId: claims[0].id, vault: 'personal', quote: 'words from nowhere' }] }], responseId: 'fake_write_garbage', usage: fakeUsage() };
  }
  if (mode !== 'live') {
    const first = claims[0];
    const second = claims[1] ?? claims[0];
    const vaultOf = (id: string) => sources.find((s) => s.id === id)?.vault ?? 'enterprise';
    return {
      sentences: [
        { text: 'The record says: ' + first.quote, citations: [{ kind: 'Fact', claimId: first.id, vault: vaultOf(first.sourceId), quote: first.quote }] },
        { text: 'So compare the definitions.', citations: [{ kind: 'Inference', fromClaimIds: [first.id, second.id] }] },
      ],
      responseId: 'fake_write_normal',
      usage: fakeUsage(),
    };
  }
  const client = new OpenAI({ baseURL: 'https://api.meta.ai/v1', apiKey: requireKey() });
  const resp = await client.responses.create({
    model: WONDER_MODEL,
    reasoning: { effort: 'high' },
    input: prompt,
    text: { format: { type: 'json_schema', name: 'draft', schema: DRAFT_SCHEMA, strict: true } },
  });
  const parsed = DraftBody.parse(JSON.parse(resp.output_text));
  const sentences = parsed.sentences.map((s) => ({
    text: s.text,
    citations: s.citations.map((c) => {
      if (c.kind === 'Fact') {
        if (!c.claimId || !c.vault || !c.quote) throw new Error('fact citation missing fields');
        return { kind: 'Fact' as const, claimId: c.claimId, vault: c.vault, quote: c.quote };
      }
      if (!c.fromClaimIds || c.fromClaimIds.length === 0) throw new Error('inference citation missing claims');
      return { kind: 'Inference' as const, fromClaimIds: c.fromClaimIds };
    }),
  }));
  return { sentences, responseId: resp.id, usage: wonderUsage(resp.usage?.input_tokens, resp.usage?.output_tokens) };
}

export const VerdictShape = z.strictObject({
  verdict: z.enum(['proceed', 'hold', 'decline']),
  routeTo: z.enum(['Associate', 'Partner']).nullable(),
});

const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['proceed', 'hold', 'decline'] },
    routeTo: { type: ['string', 'null'], enum: ['Associate', 'Partner', null] },
  },
  required: ['verdict', 'routeTo'],
  additionalProperties: false,
} as const;

export async function judgePrivy(prompt: string): Promise<{ verdict: Verdict; responseId: string; usage: Usage }> {
  const mode = fakeMode();
  countCall();
  if (mode === 'fail') throw new Error('fake privy failure');
  if (mode === 'slow') await sleep(5000);
  if (mode === 'empty') return { verdict: { verdict: 'proceed', routeTo: null }, responseId: 'fake_privy_empty', usage: fakeUsage() };
  if (mode === 'garbage') return { verdict: VerdictShape.parse({ verdict: 'maybe', routeTo: 'Intern' }), responseId: 'fake_privy_garbage', usage: fakeUsage() };
  if (mode !== 'live') return { verdict: { verdict: 'hold', routeTo: 'Partner' }, responseId: 'fake_privy_normal', usage: fakeUsage() };
  const client = new OpenAI({ baseURL: 'https://api.meta.ai/v1', apiKey: requireKey() });
  const resp = await client.responses.create({
    model: WONDER_MODEL,
    reasoning: { effort: 'high' },
    input: prompt,
    text: { format: { type: 'json_schema', name: 'verdict', schema: VERDICT_SCHEMA, strict: true } },
  });
  const verdict = VerdictShape.parse(JSON.parse(resp.output_text));
  return { verdict, responseId: resp.id, usage: wonderUsage(resp.usage?.input_tokens, resp.usage?.output_tokens) };
}

function wonderUsage(inputTokens?: number, outputTokens?: number): Usage {
  return {
    inputTokens,
    outputTokens,
    costUsd: ((inputTokens ?? 0) * 4 + (outputTokens ?? 0) * 20) / 1_000_000,
  };
}

