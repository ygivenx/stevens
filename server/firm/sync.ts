import { join } from 'node:path';
import type { Claim, Source } from '../../shared/data.js';
import { append, findCompleted, readAll, stageKey, PROMPT_VERSION } from '../common/ledger/store.js';
import { extractClaims, extractModel, readImage, visionModel } from '../common/meta/client.js';
import { quoteIn } from '../common/resolver/resolve.js';
import { nowIso } from '../common/clock.js';
import { CrmConnector, loadCrm } from './connectors/crm.js';
import type { ConnectorDocument } from './connectors/connector.js';
import { documentBody, setConnectorState, syncCrmSnapshot, upsertDocument } from './store.js';

export const FIRM_VERBATIM_PROMPT = 'Transcribe every word visible in this photo verbatim, in reading order. Return only the transcribed text.';

export interface SyncDeps {
  readImageFn?: typeof readImage;
  extractFn?: typeof extractClaims;
}

function fixturesDir(): string {
  return process.env.STEVENS_FIXTURES_DIR ?? join(process.cwd(), 'fixtures');
}

function extractedDocIds(): Set<string> {
  const ids = new Set<string>();
  for (const event of readAll()) {
    if (event.type === 'claims.extracted' && !event.itemId) ids.add(event.sourceId);
  }
  return ids;
}

async function visionBody(doc: ConnectorDocument, deps: SyncDeps): Promise<{ body: string; model: string; responseId: string; usage: { inputTokens?: number; outputTokens?: number; audioSeconds?: number; costUsd: number } }> {
  const readImageFn = deps.readImageFn ?? readImage;
  const path = join(fixturesDir(), doc.mediaPath as string);
  const result = await readImageFn(path, FIRM_VERBATIM_PROMPT);
  if (typeof result.text !== 'string' || result.text.trim().length === 0) throw new Error('vision text failed validation');
  return { body: result.text, model: visionModel, responseId: result.responseId, usage: result.usage };
}

export async function runConnectorSync(deps: SyncDeps = {}): Promise<{ documents: number; extracted: number }> {
  const snap = loadCrm();
  syncCrmSnapshot(snap);
  const connector = new CrmConnector();
  const docs = await connector.documents();
  const done = extractedDocIds();
  let extracted = 0;
  for (const doc of docs) {
    upsertDocument(connector.id, doc, doc.acl);
    let body = doc.body;
    if (!body && doc.mediaPath) {
      const key = stageKey('connector-doc', [doc.id], PROMPT_VERSION, visionModel);
      const seen = readAll().find((event) => event.type === 'source.ingested' && event.source.id === doc.id);
      if (!seen) {
        try {
          const vision = await visionBody(doc, deps);
          body = vision.body;
          documentBody(doc.id, body);
          append({
            at: new Date().toISOString(), type: 'source.ingested',
            source: { id: doc.id, vault: 'enterprise', title: doc.title, capturedAt: doc.createdAt, kind: doc.kind, fixture: doc.mediaPath ?? '', text: body, classification: 'team' },
            api: { model: vision.model, responseId: vision.responseId, usage: vision.usage, stageKey: key },
          });
        } catch (err) {
          append({ at: new Date().toISOString(), type: 'attempt.failed', stageKey: key, model: visionModel, error: err instanceof Error ? err.message : String(err) });
          continue;
        }
      } else if (seen.type === 'source.ingested' && seen.source.text) {
        body = seen.source.text;
        documentBody(doc.id, body);
      }
    }
    if (!body) continue;
    if (done.has(doc.id)) continue;
    const key = stageKey('extract', [doc.id], PROMPT_VERSION, extractModel);
    if (findCompleted(key)) continue;
    const extractFn = deps.extractFn ?? extractClaims;
    let attempt = await extractFn(doc.id, body);
    if (!attempt.claims.every((raw) => quoteIn(raw.quote, body as string))) {
      attempt = await extractFn(doc.id, body);
    }
    if (!attempt.claims.every((raw) => quoteIn(raw.quote, body as string))) {
      append({ at: new Date().toISOString(), type: 'attempt.failed', stageKey: key, model: extractModel, error: 'extracted quotes failed validation', usage: attempt.usage });
      continue;
    }
    const claims: Claim[] = attempt.claims.map((raw, index) => ({
      id: doc.id + '-c' + index, sourceId: doc.id, entity: raw.entity,
      metric: raw.metric ?? undefined, value: raw.value ?? undefined, quote: raw.quote,
    }));
    append({
      at: new Date().toISOString(), type: 'claims.extracted', sourceId: doc.id, claims,
      api: { model: extractModel, responseId: attempt.responseId, usage: attempt.usage, stageKey: key },
    });
    extracted += claims.length;
  }
  setConnectorState(connector.id, docs.length, nowIso());
  return { documents: docs.length, extracted };
}

export function firmSourceFor(doc: { id: string; kind: Source['kind']; title: string; createdAt: string; body?: string | null; mediaPath?: string | null }, classification: Source['classification']): Source {
  return {
    id: doc.id, vault: 'enterprise', title: doc.title, capturedAt: doc.createdAt, kind: doc.kind,
    fixture: doc.mediaPath ?? '', text: doc.body ?? undefined, classification,
  };
}
