import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Api, Usage } from '../../../shared/data.js';
import { dataDir } from '../../common/ledger/store.js';
import { stageKey, PROMPT_VERSION } from '../../common/ledger/store.js';
import { visionModel } from '../../common/meta/client.js';
import { convertToWav, normalizeAudio, probeDurationMs, MAX_MEDIA_MS, type AudioDeps, type Piece } from './audio.js';
import { normalizePhoto, type PhotoDeps } from './photo.js';

export const MAX_FRAMES = 4;

export type VideoDeps = AudioDeps & PhotoDeps;

export function keyframePaths(mediaPath: string, contentHash: string): { path: string; atMs: number }[] {
  const durationMs = probeDurationMs(mediaPath);
  if (durationMs > MAX_MEDIA_MS) throw new Error('media longer than 30 minutes');
  const work = join(dataDir(), 'work', contentHash);
  mkdirSync(work, { recursive: true });
  const run = spawnSync('ffmpeg', ['-y', '-v', 'info', '-i', mediaPath, '-vf', "select='gt(scene,0.4)',showinfo", '-vsync', 'vfr', '-frames:v', String(MAX_FRAMES), join(work, 'frame%02d.jpg')], { encoding: 'utf8' });
  const log = run.stderr ?? '';
  const times: number[] = [];
  for (const match of log.matchAll(/pts_time:([0-9.]+)/g)) times.push(Math.round(Number(match[1]) * 1000));
  const frames = readdirSync(work).filter((name) => /^frame\d+\.jpg$/.test(name)).sort();
  return frames.slice(0, MAX_FRAMES).map((name, index) => ({
    path: join(work, name),
    atMs: times[index] ?? Math.round(((index + 1) / (frames.length + 1)) * durationMs),
  }));
}

function mergeUsage(into: Usage, extra: Usage): Usage {
  return {
    inputTokens: (into.inputTokens ?? 0) + (extra.inputTokens ?? 0),
    outputTokens: (into.outputTokens ?? 0) + (extra.outputTokens ?? 0),
    audioSeconds: (into.audioSeconds ?? 0) + (extra.audioSeconds ?? 0),
    costUsd: into.costUsd + extra.costUsd,
  };
}

export async function normalizeVideo(mediaPath: string, contentHash: string, deps: VideoDeps = {}): Promise<{ pieces: Piece[]; api: Api; audioSeconds: number }> {
  const work = join(dataDir(), 'work', contentHash);
  mkdirSync(work, { recursive: true });
  const track = join(work, 'audio-track.wav');
  convertToWav(mediaPath, track);
  const audio = await normalizeAudio(track, contentHash + '-track', deps);
  const pieces: Piece[] = [...audio.pieces];
  let usage = audio.api.usage;
  let audioSeconds = audio.audioSeconds;
  for (const frame of keyframePaths(mediaPath, contentHash)) {
    const photo = await normalizePhoto(frame.path, contentHash + '-frame', deps);
    if (photo.pieces[0].text.trim().length < 20) continue;
    pieces.push({ text: photo.pieces[0].text, locator: 'frame@' + frame.atMs + 'ms' });
    usage = mergeUsage(usage, photo.api.usage);
  }
  if (pieces.length === 0) throw new Error('empty video transcript');
  const api: Api = {
    model: visionModel + '+' + audio.api.model,
    responseId: audio.api.responseId,
    usage,
    stageKey: stageKey('normalize', [contentHash], PROMPT_VERSION, 'video'),
  };
  return { pieces, api, audioSeconds };
}
