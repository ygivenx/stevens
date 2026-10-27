import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { platform } from 'node:os';
import { extname } from 'node:path';
import type { Api } from '../../../shared/data.js';
import { dataDir } from '../../common/ledger/store.js';
import { stageKey, PROMPT_VERSION } from '../../common/ledger/store.js';
import { readImage, visionModel, type ImageText } from '../../common/meta/client.js';
import type { Normalized, Piece } from './audio.js';

export const VERBATIM_PROMPT = 'Transcribe every word visible in this photo verbatim, in reading order. Return only the transcribed text.';

export interface PhotoDeps {
  readImageFn?: (jpgPath: string, prompt: string) => Promise<ImageText>;
}

export function ensureJpeg(mediaPath: string, contentHash: string): string {
  if (extname(mediaPath).toLowerCase() !== '.heic') return mediaPath;
  if (platform() !== 'darwin') throw new Error('heic captures need macOS');
  const work = join(dataDir(), 'work', contentHash);
  mkdirSync(work, { recursive: true });
  const dest = join(work, 'converted.jpg');
  execFileSync('sips', ['-s', 'format', 'jpeg', mediaPath, '--out', dest]);
  return dest;
}

export async function normalizePhoto(mediaPath: string, contentHash: string, deps: PhotoDeps = {}): Promise<Normalized> {
  const readImageFn = deps.readImageFn ?? readImage;
  const jpeg = ensureJpeg(mediaPath, contentHash);
  const result = await readImageFn(jpeg, VERBATIM_PROMPT);
  if (typeof result.text !== 'string') throw new Error('vision text failed validation');
  if (result.text.trim().length === 0) throw new Error('empty photo text');
  const pieces: Piece[] = [{ text: result.text, locator: 'photo' }];
  const api: Api = {
    model: visionModel,
    responseId: result.responseId,
    usage: result.usage,
    stageKey: stageKey('normalize', [contentHash], PROMPT_VERSION, visionModel),
  };
  return { pieces, api, audioSeconds: 0 };
}
