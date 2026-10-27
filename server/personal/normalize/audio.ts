import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Api, Usage } from '../../../shared/data.js';
import { dataDir } from '../../common/ledger/store.js';
import { stageKey, PROMPT_VERSION } from '../../common/ledger/store.js';
import { transcribe, voiceCost, voiceModel, type Transcript } from '../../common/meta/client.js';

export interface Piece {
  text: string;
  speaker?: string;
  startMs?: number;
  endMs?: number;
  locator?: string;
}

export interface Normalized {
  pieces: Piece[];
  api: Api;
  audioSeconds: number;
}

export interface AudioDeps {
  transcribeFn?: (wavPath: string) => Promise<Transcript>;
}

export const MAX_CHUNK_MS = 9 * 60 * 1000;
export const MAX_MEDIA_MS = 30 * 60 * 1000;

export function chunkPlan(durationMs: number, maxChunkMs: number = MAX_CHUNK_MS): { offsetMs: number; lengthMs: number }[] {
  const chunks: { offsetMs: number; lengthMs: number }[] = [];
  let offset = 0;
  while (offset < durationMs) {
    const length = Math.min(maxChunkMs, durationMs - offset);
    chunks.push({ offsetMs: offset, lengthMs: length });
    offset += length;
  }
  return chunks;
}

export function probeDurationMs(path: string): number {
  const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', path], { encoding: 'utf8' });
  return Math.round(Number(out.trim()) * 1000);
}

export function convertToWav(source: string, dest: string): void {
  mkdirSync(join(dest, '..'), { recursive: true });
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', source, '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', dest]);
}

export function extractChunk(converted: string, offsetMs: number, lengthMs: number, dest: string): void {
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-ss', String(offsetMs / 1000), '-t', String(lengthMs / 1000), '-i', converted, '-c:a', 'pcm_s16le', dest]);
}

export function speakerName(label: string, order: string[]): string {
  return 'Speaker ' + (order.indexOf(label) + 1);
}

export function atLabel(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return Math.floor(total / 60) + ':' + String(total % 60).padStart(2, '0');
}

function cacheDir(): string {
  const dir = join(dataDir(), 'stage-cache');
  mkdirSync(dir, { recursive: true });
  return dir;
}

function cachedTranscript(key: string): Transcript | null {
  const path = join(cacheDir(), key + '.json');
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8')) as Transcript;
}

function storeTranscript(key: string, transcript: Transcript): void {
  writeFileSync(join(cacheDir(), key + '.json'), JSON.stringify(transcript));
}

function emptyUsage(): Usage {
  return { audioSeconds: 0, costUsd: 0 };
}

function addUsage(total: Usage, seconds: number): Usage {
  return { audioSeconds: (total.audioSeconds ?? 0) + seconds, costUsd: total.costUsd + voiceCost(seconds) };
}

export async function normalizeAudio(mediaPath: string, contentHash: string, deps: AudioDeps = {}): Promise<Normalized> {
  const transcribeFn = deps.transcribeFn ?? transcribe;
  const durationMs = probeDurationMs(mediaPath);
  if (durationMs > MAX_MEDIA_MS) throw new Error('media longer than 30 minutes');
  const work = join(dataDir(), 'work', contentHash);
  mkdirSync(work, { recursive: true });
  const converted = join(work, 'converted.wav');
  convertToWav(mediaPath, converted);
  const pieces: Piece[] = [];
  const order: string[] = [];
  let usage = emptyUsage();
  const sessionIds: string[] = [];
  const chunks = chunkPlan(durationMs);
  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    const key = stageKey('transcribe', [contentHash, String(index)], PROMPT_VERSION, voiceModel);
    let result = cachedTranscript(key);
    if (!result) {
      const chunkPath = join(work, 'chunk-' + index + '.wav');
      extractChunk(converted, chunk.offsetMs, chunk.lengthMs, chunkPath);
      result = await transcribeFn(chunkPath);
      if (typeof result.transcript !== 'string' || !Array.isArray(result.turns)) throw new Error('voice transcript failed validation');
      storeTranscript(key, result);
    }
    sessionIds.push(result.sessionId);
    usage = addUsage(usage, result.audioSeconds);
    for (const turn of result.turns) {
      if (!order.includes(turn.speaker)) order.push(turn.speaker);
      pieces.push({
        text: turn.transcript,
        speaker: speakerName(turn.speaker, order),
        startMs: chunk.offsetMs + turn.startMs,
        endMs: chunk.offsetMs + turn.endMs,
      });
    }
  }
  if (pieces.length === 0) throw new Error('empty transcript');
  const api: Api = {
    model: voiceModel,
    responseId: sessionIds[0] ?? 'no-audio',
    usage,
    stageKey: stageKey('normalize', [contentHash], PROMPT_VERSION, voiceModel),
  };
  return { pieces, api, audioSeconds: usage.audioSeconds ?? 0 };
}
