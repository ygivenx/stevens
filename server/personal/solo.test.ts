import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildPersonalState } from './state.js';
import { replaceEvents, writeIngested, writeClaims, closeDb } from './store.js';
import { runMeetingTrigger } from './triggers.js';
import { askQuestion } from './answer.js';
import { shareClaim } from './share.js';

beforeEach(async () => {
  await closeDb();
  const dir = mkdtempSync(join(tmpdir(), 'stevens-solo-'));
  process.env.STEVENS_DATA_DIR = dir;
  process.env.STEVENS_FIRM_URL = 'off';
  process.env.STEVENS_NOW = '2026-10-27T12:00:00Z';
  writeFileSync(join(dir, 'meta-fake.json'), JSON.stringify({ mode: 'normal' }));
  writeFileSync(join(dir, 'meta-calls.json'), JSON.stringify({ count: 0 }));
});

afterEach(async () => {
  delete process.env.STEVENS_FIRM_URL;
  delete process.env.STEVENS_NOW;
  await closeDb();
});

async function insertEvent(): Promise<void> {
  await replaceEvents([{
    uid: 'solo-1', title: 'Call with a founder', startsAt: '2026-10-27T14:00:00Z',
    endsAt: null, attendees: [], location: null, description: null,
  }]);
}

describe('solo mode', () => {
  it('reports solo state with only calendar meetings', async () => {
    await insertEvent();
    const state = await buildPersonalState();
    expect(state.solo).toBe(true);
    expect(state.firm.reachable).toBe(false);
    expect(state.meetings).toHaveLength(1);
    expect(state.meetings[0].origin).toBe('calendar');
    expect(state.escalations).toHaveLength(0);
    expect(state.status.line).toContain('Solo');
    expect(state.sourceStatus.map((source) => source.id)).toContain('calendar');
  });

  it('writes a personal-only brief for a calendar meeting without firm calls', async () => {
    await insertEvent();
    await writeIngested(
      { id: 'it-solo', origin: 'vault', originId: 'solo-note', kind: 'note', title: 'Solo note', capturedAt: '2026-10-27T10:00:00Z', status: 'ready', hasMedia: false },
      [{ id: 'sg-solo', itemId: 'it-solo', seq: 0, text: 'Churn is 2% when you count logos.' }],
      { contentHash: 'hash-solo', ingestedAt: '2026-10-27T11:00:00Z' },
    );
    await writeClaims('it-solo', [{ id: 'cl-solo', sourceId: 'it-solo', segmentId: 'sg-solo', entity: 'Helios', metric: 'churn', value: '2%', quote: 'Churn is 2% when you count logos.' }]);
    await writeIngested(
      { id: 'it-solo-2', origin: 'vault', originId: 'solo-note-2', kind: 'note', title: 'Solo note 2', capturedAt: '2026-10-27T10:00:00Z', status: 'ready', hasMedia: false },
      [{ id: 'sg-solo-2', itemId: 'it-solo-2', seq: 0, text: 'Priya promised the logo count by Friday.' }],
      { contentHash: 'hash-solo-2', ingestedAt: '2026-10-27T11:00:00Z' },
    );
    await writeClaims('it-solo-2', [{ id: 'cl-solo-2', sourceId: 'it-solo-2', segmentId: 'sg-solo-2', entity: 'Helios', quote: 'Priya promised the logo count by Friday.' }]);
    const { briefs } = await runMeetingTrigger({ meetingsFn: async () => [] });
    expect(briefs).toHaveLength(1);
    expect(briefs[0].sentences.length).toBeGreaterThan(0);
    expect(briefs[0].bridges ?? []).toHaveLength(0);
    const cited = new Set(briefs[0].sentences.flatMap((sentence) => sentence.citations.flatMap((citation) => citation.kind === 'Fact' ? [citation.claimId] : citation.fromClaimIds)));
    expect(cited.size).toBeGreaterThanOrEqual(2);
  });

  it('answers from the notebook without a privy check', async () => {
    const result = await askQuestion('', 'What should I ask?');
    expect(result.verdict).toEqual({ verdict: 'proceed', routeTo: null });
    expect(result.escalation).toBe('none');
    expect(result.firmReachable).toBe(false);
  });

  it('refuses to share', async () => {
    await expect(shareClaim('cl-solo', 'helios')).rejects.toThrow('solo');
  });

  it('marks the meeting brief failed after a brief write failure', async () => {
    await insertEvent();
    const { append } = await import('../common/ledger/store.js');
    append({ at: '2026-10-27T13:00:00Z', type: 'attempt.failed', stageKey: 'k', stage: 'brief', model: 'm', error: 'writer down', dealId: '' });
    const { buildPersonalState } = await import('./state.js');
    const failed = await buildPersonalState();
    expect(failed.meetings).toHaveLength(1);
    expect(failed.meetings[0].briefFailed).toBe(true);
  });
});
