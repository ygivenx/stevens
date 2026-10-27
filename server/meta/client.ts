import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import OpenAI from 'openai';
import type { Usage } from '../../shared/data.js';

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

export const voiceModel = VOICE_MODEL;
export const visionModel = VISION_MODEL;
