import type { Draft, Meeting, Purpose, Role, Verdict } from '../../shared/data.js';
import { questionIdFor } from '../common/ids.js';
import { append, readAll } from '../common/ledger/store.js';
import { nowMs } from '../common/clock.js';
import { firmContext, firmEscalate, firmMeetings, soloMode, type FirmMeeting } from './firm-client.js';
import { judgeBridges, recordedBridges, type FirmSlice } from './bridge.js';
import { writeMeetingBrief, briefKey } from './brief.js';
import { calendarMeetings } from './adapters/calendar.js';

export interface TriggerDeps {
  meetingsFn?: () => Promise<FirmMeeting[]>;
  contextFn?: (dealId: string, purpose: 'bridge' | 'brief' | 'answer') => Promise<FirmSlice>;
}

const activeDeals = new Set<string>();

export function upcomingMeetings(meetings: FirmMeeting[], withinHours: number = 24): FirmMeeting[] {
  const now = nowMs();
  return meetings.filter((meeting) => {
    const at = Date.parse(meeting.startsAt);
    return at > now && at <= now + withinHours * 3600 * 1000;
  });
}

async function defaultContext(dealId: string, purpose: 'bridge' | 'brief' | 'answer'): Promise<FirmSlice> {
  const context = await firmContext(dealId, purpose);
  const sources = context.sources as { id: string; title: string }[];
  append({
    at: new Date().toISOString(), type: 'context.fetched', dealId, purpose: purpose as Purpose,
    sourceIds: sources.map((source) => source.id), titles: sources.map((source) => ({ id: source.id, title: source.title })),
  });
  return context as unknown as FirmSlice;
}

export async function runMeetingTrigger(deps: TriggerDeps = {}): Promise<{ briefs: Draft[] }> {
  const meetingsFn = deps.meetingsFn ?? (() => firmMeetings(24));
  const contextFn = deps.contextFn ?? defaultContext;
  let firmUpcoming: FirmMeeting[];
  try {
    firmUpcoming = upcomingMeetings(await meetingsFn());
  } catch {
    firmUpcoming = [];
  }
  let meetings: (FirmMeeting & { origin: 'firm' | 'calendar' })[] = firmUpcoming.map((meeting) => ({ ...meeting, origin: 'firm' as const }));
  try {
    const pairs = firmUpcoming.map((meeting) => ({ id: meeting.dealId, company: meeting.company }));
    meetings = [...meetings, ...calendarMeetings(pairs)];
  } catch {
    void 0;
  }
  const briefs: Draft[] = [];
  for (const meeting of meetings) {
    if (activeDeals.has(meeting.dealId)) continue;
    activeDeals.add(meeting.dealId);
    try {
      const slice = soloMode() ? { sources: [], claims: [] } : await contextFn(meeting.dealId, 'brief');
      const judged = await judgeBridges(slice);
      const key = briefKey(meeting.dealId, slice.claims, slice.sources.map((source) => source.id));
      const found = readAll().find((event) => event.type === 'draft.created' && event.draft.kind === 'brief' && event.api?.stageKey === key);
      if (found && found.type === 'draft.created') {
        briefs.push(found.draft);
        continue;
      }
      const seen = new Set(judged.map((bridge) => bridge.id));
      const bridges = [...judged, ...recordedBridges().filter((bridge) => !seen.has(bridge.id))];
      briefs.push(await writeMeetingBrief(meeting.dealId, meeting.company, slice, bridges));
    } catch {
      continue;
    } finally {
      activeDeals.delete(meeting.dealId);
    }
  }
  return { briefs };
}

export function startTriggerLoop(): () => void {
  void runMeetingTrigger().catch(() => {});
  const interval = setInterval(() => {
    void runMeetingTrigger().catch(() => {});
  }, 60 * 1000);
  return () => clearInterval(interval);
}

export function verdictForQuestion(questionId: string): Verdict | null {
  for (const event of readAll()) {
    if (event.type === 'verdict.received' && event.questionId === questionId) return event.verdict;
  }
  return null;
}

export async function escalateWithRetry(questionId: string, dealId: string, to: Role | null): Promise<'sent' | 'queued'> {
  try {
    const sent = await firmEscalate(dealId, questionId);
    append({ at: new Date().toISOString(), type: 'escalation.sent', questionId, dealId, to, toName: sent.toName ?? undefined, reviewerNoun: sent.reviewerNoun });
    return 'sent';
  } catch {
    append({ at: new Date().toISOString(), type: 'escalation.queued', questionId, dealId, to });
    return 'queued';
  }
}

export function startEscalationRetry(): () => void {
  const interval = setInterval(() => {
    const queued: { questionId: string; dealId: string; to: Role | null }[] = [];
    for (const event of readAll()) {
      if (event.type === 'escalation.queued') queued.push({ questionId: event.questionId, dealId: event.dealId, to: event.to });
    }
    const sent = new Set(readAll().filter((event) => event.type === 'escalation.sent').map((event) => event.type === 'escalation.sent' ? event.questionId : ''));
    for (const item of queued) {
      if (sent.has(item.questionId)) continue;
      void escalateWithRetry(item.questionId, item.dealId, item.to);
    }
  }, 30 * 1000);
  return () => clearInterval(interval);
}
