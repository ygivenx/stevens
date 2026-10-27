import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Source } from '../../../shared/data.js';
import { append, readAll, findCompleted, stageKey, PROMPT_VERSION, dataDir } from '../ledger/store.js';
import { transcribe, readImage, voiceCost, voiceModel, visionModel } from '../meta/client.js';

interface ManifestEntry {
  id: string; vault: Source['vault']; title: string; capturedAt: string;
  kind: Source['kind']; file: string; ownerRole?: Source['ownerRole']; classification?: Source['classification'];
}

function fixturesDir(): string {
  return process.env.STEVENS_FIXTURES_DIR ?? join(process.cwd(), 'fixtures');
}

export function readManifest(): ManifestEntry[] {
  return JSON.parse(readFileSync(join(fixturesDir(), 'manifest.json'), 'utf8')) as ManifestEntry[];
}

function modelFor(kind: Source['kind']): string | null {
  if (kind === 'talk-audio') return voiceModel;
  if (kind === 'slide-photo' || kind === 'deck-photo') return visionModel;
  return null;
}

function ingestedIds(): Set<string> {
  const ids = new Set<string>();
  for (const event of readAll()) {
    if (event.type === 'source.ingested') ids.add(event.source.id);
  }
  return ids;
}

async function ingestPaid(entry: ManifestEntry, model: string, key: string): Promise<Source> {
  const path = join(fixturesDir(), entry.file);
  if (model === voiceModel) {
    const result = await transcribe(path);
    if (typeof result.transcript !== 'string') throw new Error('voice transcript failed validation');
    const derived = join(dataDir(), 'derived');
    mkdirSync(derived, { recursive: true });
    writeFileSync(join(derived, entry.id + '.json'), JSON.stringify({ turns: result.turns }));
    const source: Source = { id: entry.id, vault: entry.vault, title: entry.title, capturedAt: entry.capturedAt, kind: entry.kind, fixture: entry.file, text: result.transcript, ownerRole: entry.ownerRole, classification: entry.classification };
    append({ at: new Date().toISOString(), type: 'source.ingested', source, api: { model, responseId: result.sessionId, usage: { audioSeconds: result.audioSeconds, costUsd: voiceCost(result.audioSeconds) }, stageKey: key } });
    return source;
  }
  const result = await readImage(path, 'Transcribe every word visible in this photo verbatim, in reading order. Return only the transcribed text.');
  if (typeof result.text !== 'string') throw new Error('vision text failed validation');
  const source: Source = { id: entry.id, vault: entry.vault, title: entry.title, capturedAt: entry.capturedAt, kind: entry.kind, fixture: entry.file, text: result.text, ownerRole: entry.ownerRole, classification: entry.classification };
  append({ at: new Date().toISOString(), type: 'source.ingested', source, api: { model, responseId: result.responseId, usage: result.usage, stageKey: key } });
  return source;
}

function ingestText(entry: ManifestEntry): Source {
  const text = readFileSync(join(fixturesDir(), entry.file), 'utf8');
  const source: Source = { id: entry.id, vault: entry.vault, title: entry.title, capturedAt: entry.capturedAt, kind: entry.kind, fixture: entry.file, text, ownerRole: entry.ownerRole, classification: entry.classification };
  append({ at: new Date().toISOString(), type: 'source.ingested', source });
  return source;
}

export async function runIngest(): Promise<{ ingested: string[]; reused: string[] }> {
  const ingested: string[] = [];
  const reused: string[] = [];
  const done = ingestedIds();
  for (const entry of readManifest()) {
    const model = modelFor(entry.kind);
    if (model) {
      const key = stageKey('ingest', [entry.id], PROMPT_VERSION, model);
      if (findCompleted(key)) {
        reused.push(entry.id);
        continue;
      }
      try {
        await ingestPaid(entry, model, key);
      } catch (err) {
        append({ at: new Date().toISOString(), type: 'attempt.failed', stageKey: key, model, error: err instanceof Error ? err.message : String(err) });
        throw err;
      }
      ingested.push(entry.id);
      continue;
    }
    if (done.has(entry.id)) {
      reused.push(entry.id);
      continue;
    }
    ingestText(entry);
    ingested.push(entry.id);
  }
  return { ingested, reused };
}
