import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { ChatThread, Claim, Draft, Item, Meeting, Origin, Person, Role, ScenarioDev, ScenarioDisplay, Sentence, SourceRef } from '../../shared/data.js';
import { readAll } from '../common/ledger/store.js';
import { nowIso } from '../common/clock.js';
import { DEFAULT_DISPLAY, devBlock } from '../common/scenarios.js';
import { getAdapterState, getDb, allPersonalClaims, chatThread } from './store.js';
import { extractionPaused } from './extract.js';
import { firmContext, firmMeetings, firmMeta, soloMode, type FirmMeeting } from './firm-client.js';
import { inboxDir } from './adapters/inbox.js';
import { vaultName } from './adapters/vault.js';
import { calendarMeetings, calendarMode } from './adapters/calendar.js';

export interface PersonalState {
  owner: Person;
  now: string;
  vaultName: string;
  solo: boolean;
  sourceStatus: { id: string; label: string; lastSyncAt: string | null; lastError: string | null; simulated?: string }[];
  status: { line: string; busy: boolean };
  adapters: { origin: Origin; label: string; lastSyncAt: string | null; simulated?: string }[];
  items: Item[];
  meetings: (Meeting & { briefId?: string; team?: Person[]; briefFailed: boolean })[];
  drafts: Draft[];
  claims: Claim[];
  sources: SourceRef[];
  shares: { claimId: string; dealId: string; sharedAt: string }[];
  conversations: ChatThread[];
  escalations: { questionId: string; dealId: string; to: Role | null; toName?: string; reviewerNoun?: string; status: 'sent' | 'queued' }[];
  firm: { reachable: boolean; checkedAt: string };
  display: ScenarioDisplay;
  simulated: string[];
  dev?: ScenarioDev;
}

function ownerPerson(): Person {
  const id = process.env.STEVENS_OWNER ?? 'p-alex';
  const name = process.env.STEVENS_OWNER_NAME ?? 'Alex Rivera';
  const title = process.env.STEVENS_OWNER_TITLE;
  return { id, name, role: 'Associate', ...(title ? { title } : {}) };
}

async function listItems(): Promise<Item[]> {
  try {
    const db = await getDb();
    const rows = await db.all<Omit<Item, 'hasMedia'> & { mediaPath: string | null }>(
      `select id, origin, origin_id as "originId", kind, title, captured_at as "capturedAt", status, error, media_path as "mediaPath"
       from items where status not in ('superseded', 'removed') order by captured_at desc`,
    );
    return rows.map((row) => {
      const { mediaPath, ...rest } = row;
      return { ...rest, hasMedia: mediaPath !== null };
    });
  } catch {
    return [];
  }
}

async function adapterEntries(): Promise<PersonalState['adapters']> {
  const inbox = await getAdapterState('glasses');
  const readwise = await getAdapterState('readwise');
  const vault = await getAdapterState('vault');
  const inboxSync = lastSyncFor('glasses');
  return [
    { origin: 'glasses' as Origin, label: 'Glasses inbox', lastSyncAt: inbox?.lastSyncAt ?? inboxSync },
    {
      origin: 'readwise' as Origin,
      label: 'Readwise',
      lastSyncAt: readwise?.lastSyncAt ?? lastSyncFor('readwise'),
      simulated: process.env.READWISE_TOKEN ? undefined : 'Simulated — Readwise export file',
    },
    { origin: 'vault' as Origin, label: 'Obsidian notes', lastSyncAt: vault?.lastSyncAt ?? lastSyncFor('vault') },
  ];
}

function lastSyncFor(adapter: Origin): string | null {
  let last: string | null = null;
  for (const event of readAll()) {
    if (event.type === 'sync.completed' && event.adapter === adapter) last = event.at;
  }
  return last;
}

async function sourceEntries(firmReachable: boolean, checkedAt: string): Promise<PersonalState['sourceStatus']> {
  const glasses = await getAdapterState('glasses');
  const readwise = await getAdapterState('readwise');
  const vault = await getAdapterState('vault');
  const calendar = await getAdapterState('calendar');
  return [
    { id: 'glasses', label: 'Glasses inbox', lastSyncAt: glasses?.lastSyncAt ?? lastSyncFor('glasses'), lastError: glasses?.lastError ?? null },
    {
      id: 'readwise', label: 'Readwise', lastSyncAt: readwise?.lastSyncAt ?? lastSyncFor('readwise'), lastError: readwise?.lastError ?? null,
      simulated: process.env.READWISE_TOKEN ? undefined : 'Simulated — Readwise export file',
    },
    { id: 'vault', label: 'Obsidian notes', lastSyncAt: vault?.lastSyncAt ?? lastSyncFor('vault'), lastError: vault?.lastError ?? null },
    {
      id: 'calendar', label: 'Calendar', lastSyncAt: calendar?.lastSyncAt ?? null, lastError: calendar?.lastError ?? null,
      simulated: calendarMode() === 'fixture' ? 'Simulated — fixture calendar' : undefined,
    },
    {
      id: 'firm', label: 'Firm', lastSyncAt: firmReachable ? checkedAt : null,
      lastError: soloMode() ? 'Solo mode: no firm configured' : firmReachable ? null : 'Unreachable',
    },
  ];
}

async function statusLine(items: Item[], firmReachable: boolean, lastBriefAt: string | null): Promise<{ line: string; busy: boolean }> {
  if (process.env.STEVENS_REPLAY === '1') return { line: 'Replaying a recorded run', busy: false };
  const pending = pendingInboxTitle(items);
  if (pending) return { line: 'Reading the ' + pending + '…', busy: true };
  try {
    if (await extractionPaused()) return { line: 'Paused: daily reading budget reached', busy: false };
  } catch {
    void 0;
  }
  if (!firmReachable && soloMode()) return { line: 'Solo mode · ' + upToDateLine(items), busy: false };
  if (!firmReachable) return { line: "Couldn't reach the firm · showing the brief from " + (lastBriefAt ? timeShort(lastBriefAt) : 'earlier'), busy: false };
  return { line: upToDateLine(items), busy: false };
}

function upToDateLine(items: Item[]): string {
  const latest = latestCaptureAt(items);
  if (!latest) return 'No captures yet';
  const mins = Math.max(0, Math.round((Date.parse(nowIso()) - Date.parse(latest)) / 60000));
  if (mins < 1) return 'Up to date · last capture just now';
  if (mins < 60) return 'Up to date · last capture ' + mins + ' min ago';
  return 'Up to date · last capture ' + Math.round(mins / 60) + ' hr ago';
}

function pendingInboxTitle(items: Item[]): string | null {
  try {
    const dir = inboxDir();
    if (!existsSync(dir)) return null;
    const known = new Set(items.map((item) => item.originId));
    for (const name of readdirSync(dir)) {
      if (!known.has(name)) return name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
    }
    return null;
  } catch {
    return null;
  }
}

function latestCaptureAt(items: Item[]): string | null {
  let latest: string | null = null;
  for (const item of items) {
    if (!latest || item.capturedAt > latest) latest = item.capturedAt;
  }
  return latest;
}

function timeShort(iso: string): string {
  const date = new Date(iso);
  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const suffix = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  if (hours === 0) hours = 12;
  return hours + ':' + minutes + ' ' + suffix;
}

export function personalSourceRefs(items: Item[]): SourceRef[] {
  return items.map((item) => ({
    id: item.id,
    vault: 'personal' as const,
    kind: item.kind === 'audio' ? 'talk-audio' as const : item.kind === 'photo' || item.kind === 'video' ? 'slide-photo' as const : 'article' as const,
    title: item.title,
    capturedAt: item.capturedAt,
    origin: item.origin,
    access: 'visible' as const,
    ruleId: 'r-personal-owner-associate',
  }));
}

export async function buildPersonalState(): Promise<PersonalState> {
  const owner = ownerPerson();
  const now = nowIso();
  const items = await listItems();
  const events = readAll();
  const drafts = events.filter((e) => e.type === 'draft.created').map((e) => (e as { draft: Draft }).draft);
  const failedDeals = new Set<string>();
  for (const event of events) {
    if (event.type === 'attempt.failed' && event.stage === 'brief' && event.dealId !== undefined) failedDeals.add(event.dealId);
  }
  for (const draft of drafts) {
    if (draft.kind === 'brief' && draft.dealId) failedDeals.delete(draft.dealId);
  }
  let personalClaims: Claim[] = [];
  try {
    personalClaims = await allPersonalClaims();
  } catch {
    personalClaims = [];
  }
  let meetings: (Meeting & { briefId?: string; team?: Person[]; briefFailed: boolean })[] = [];
  let firmReachable = true;
  let firmClaims: Claim[] = [];
  let firmSources: SourceRef[] = [];
  try {
    const upcoming: FirmMeeting[] = await firmMeetings(24);
    const briefByDeal = new Map<string, string>();
    for (const draft of drafts) {
      if (draft.kind === 'brief' && draft.dealId !== undefined) briefByDeal.set(draft.dealId, draft.id);
    }
    const pairs = upcoming.map((meeting) => ({ id: meeting.dealId, company: meeting.company }));
    const firmUpcoming: Meeting[] = upcoming.map((meeting) => ({
      id: meeting.id,
      dealId: meeting.dealId,
      company: meeting.company,
      title: meeting.title,
      startsAt: meeting.startsAt,
      origin: 'firm',
      ...(meeting.askHint ? { askHint: meeting.askHint } : {}),
    }));
    let calendarUpcoming: Meeting[] = [];
    try {
      calendarUpcoming = await calendarMeetings(pairs);
    } catch {
      void 0;
    }
    const merged = [...firmUpcoming, ...calendarUpcoming].sort((a, b) => (a.startsAt < b.startsAt ? -1 : 1));
    meetings = merged.map((meeting) => ({
      ...meeting,
      briefId: briefByDeal.get(meeting.dealId),
      briefFailed: failedDeals.has(meeting.dealId),
      team: (upcoming.find((firm) => firm.id === meeting.id)?.team ?? []).map((member) => ({ id: member.id, name: member.name, role: member.role as Role })),
    }));
    for (const meeting of upcoming) {
      try {
        const slice = await firmContext(meeting.dealId, 'brief');
        firmSources.push(...slice.sources);
        firmClaims.push(...slice.claims);
      } catch {
        continue;
      }
    }
  } catch {
    firmReachable = false;
    if (soloMode()) {
      try {
        const briefByDeal = new Map<string, string>();
        for (const draft of drafts) {
          if (draft.kind === 'brief' && draft.dealId !== undefined) briefByDeal.set(draft.dealId, draft.id);
        }
        meetings = (await calendarMeetings([])).map((meeting) => ({ ...meeting, briefId: briefByDeal.get(meeting.dealId), briefFailed: failedDeals.has(meeting.dealId), team: [] }));
      } catch {
        meetings = [];
      }
    } else {
      const briefByDeal = new Map<string, { meeting: Meeting; briefId: string }>();
      for (const draft of drafts) {
        if (draft.kind === 'brief' && draft.dealId !== undefined) {
          const fetched = events.find((e) => e.type === 'context.fetched' && (e as { dealId?: string }).dealId === draft.dealId);
          void fetched;
          briefByDeal.set(draft.dealId, {
            meeting: { id: 'm-' + draft.dealId, dealId: draft.dealId, company: draft.company ?? draft.dealId, title: 'Meeting', startsAt: now, origin: 'firm' },
            briefId: draft.id,
          });
        }
      }
      meetings = [...briefByDeal.values()].map((entry) => ({ ...entry.meeting, briefId: entry.briefId, briefFailed: failedDeals.has(entry.meeting.dealId), team: [] }));
    }
  }
  const sources = [...personalSourceRefs(items), ...firmSources];
  const claims = [...personalClaims, ...firmClaims];
  const shares = events.filter((e) => e.type === 'share.sent').map((e) => {
    const share = e as unknown as { claimId: string; dealId: string; documentId: string; at: string };
    return { claimId: share.claimId, dealId: share.dealId, sharedAt: share.at };
  });
  const sentIds = new Set(events.filter((e) => e.type === 'escalation.sent').map((e) => (e as { questionId: string }).questionId));
  const escalations = events.filter((e) => e.type === 'escalation.sent' || e.type === 'escalation.queued').map((e) => {
    const esc = e as unknown as { questionId: string; dealId: string; to: Role | null; toName?: string; reviewerNoun?: string };
    return { questionId: esc.questionId, dealId: esc.dealId, to: esc.to, toName: esc.toName, reviewerNoun: esc.reviewerNoun, status: (e.type === 'escalation.sent' || sentIds.has(esc.questionId) ? 'sent' : 'queued') as 'sent' | 'queued' };
  });
  const latestBrief = drafts.filter((d) => d.kind === 'brief').sort((a, b) => (a.id < b.id ? 1 : -1))[0];
  void latestBrief;
  const lastBriefEvent = events.filter((e) => e.type === 'draft.created' && (e as { draft: Draft }).draft.kind === 'brief').sort((a, b) => (a.at < b.at ? 1 : -1))[0];
  const status = await statusLine(items, firmReachable, lastBriefEvent ? lastBriefEvent.at : null);
  const simulated: string[] = [];
  const adapters = await adapterEntries();
  const readwise = adapters.find((a) => a.origin === 'readwise');
  if (readwise?.simulated) simulated.push(readwise.simulated);
  let display = DEFAULT_DISPLAY;
  if (!soloMode()) {
    try {
      display = (await firmMeta()).display;
    } catch {
      display = DEFAULT_DISPLAY;
    }
    simulated.push(display.firmDataLabel);
  }
  simulated.push('Real glasses captures, pre-recorded, imported not streamed');
  const conversations: ChatThread[] = [];
  for (const draft of drafts) {
    if (draft.kind !== 'answer' || !draft.questionId || !draft.dealId) continue;
    if (conversations.some((thread) => thread.questionId === draft.questionId)) continue;
    try {
      const rows = await chatThread(draft.questionId);
      if (rows.length === 0) continue;
      conversations.push({
        questionId: draft.questionId,
        dealId: draft.dealId,
        messages: rows.map((row) => {
          let sentences: Sentence[] = [];
          if (row.citations) {
            try {
              sentences = JSON.parse(row.citations) as Sentence[];
            } catch {
              sentences = [];
            }
          }
          return { id: row.id, role: row.role as 'user' | 'assistant', text: row.text, sentences, at: row.createdAt };
        }),
      });
    } catch {
      continue;
    }
  }
  const dev = devBlock();
  return {
    owner,
    now,
    vaultName: vaultName(),
    solo: soloMode(),
    sourceStatus: await sourceEntries(firmReachable, nowIso()),
    status,
    adapters,
    items,
    meetings,
    drafts,
    claims,
    sources,
    shares,
    conversations,
    escalations,
    firm: { reachable: firmReachable, checkedAt: now },
    display,
    simulated,
    ...(dev ? { dev } : {}),
  };
}
