import ICAL from 'ical.js';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Meeting } from '../../../shared/data.js';
import { nowMs } from '../../common/clock.js';
import { getAdapterState, replaceEvents, setAdapterState, upcomingEvents, type StoredEvent } from '../store.js';

export type CalendarMode = 'feed' | 'fixture' | 'off';

export function calendarMode(): CalendarMode {
  const raw = process.env.STEVENS_CALENDAR_ICS;
  if (raw === undefined) return 'off';
  if (raw === '') return 'fixture';
  return 'feed';
}

function fixtureIcs(): string {
  const path = join(process.env.STEVENS_FIXTURES_DIR ?? join(process.cwd(), 'fixtures'), 'personal', 'calendar.ics');
  return readFileSync(path, 'utf8');
}

function attendeeName(prop: ICAL.Property): string {
  const cn = prop.getParameter('cn');
  const value = String(prop.getFirstValue() ?? '').replace(/^mailto:/i, '');
  if (typeof cn === 'string' && cn.length > 0) return cn + ' <' + value + '>';
  return value;
}

interface ParsedEvent {
  uid: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  attendees: string[];
  location: string | null;
  description: string | null;
}

function occurrence(vevent: ICAL.Component, start: Date, lengthMs: number | null): ParsedEvent {
  const event = new ICAL.Event(vevent);
  const end = lengthMs === null ? null : new Date(start.getTime() + lengthMs).toISOString();
  return {
    uid: event.uid,
    title: event.summary,
    startsAt: start.toISOString(),
    endsAt: end,
    attendees: vevent.getAllProperties('attendee').map(attendeeName).filter((name) => name.length > 0),
    location: event.location || null,
    description: event.description || null,
  };
}

export function parseIcs(text: string, fromMs: number, toMs: number): ParsedEvent[] {
  const found: ParsedEvent[] = [];
  const cal = new ICAL.Component(ICAL.parse(text));
  for (const vevent of cal.getAllSubcomponents('vevent')) {
    const event = new ICAL.Event(vevent);
    if (!event.uid || !event.summary || !event.startDate) continue;
    if (event.startDate.isDate) continue;
    if (String(vevent.getFirstPropertyValue('status') ?? '').toUpperCase() === 'CANCELLED') continue;
    const startMs = event.startDate.toJSDate().getTime();
    const lengthMs = event.endDate ? event.endDate.toJSDate().getTime() - startMs : null;
    if (!event.isRecurring()) {
      if (startMs >= fromMs && startMs <= toMs) found.push(occurrence(vevent, new Date(startMs), lengthMs));
      continue;
    }
    const iter = event.iterator();
    let next = iter.next();
    let count = 0;
    while (next && count < 50) {
      const at = next.toJSDate().getTime();
      if (at > toMs) break;
      if (at >= fromMs) found.push(occurrence(vevent, new Date(at), lengthMs));
      count += 1;
      next = iter.next();
    }
  }
  return found.sort((a, b) => (a.startsAt < b.startsAt ? -1 : 1));
}

export interface CalendarDeps {
  fetchFn?: (url: string) => Promise<string>;
}

async function readFeed(url: string, deps: CalendarDeps): Promise<string> {
  if (deps.fetchFn) return deps.fetchFn(url);
  const res = await fetch(url);
  if (!res.ok) throw new Error('calendar feed failed with ' + res.status);
  return await res.text();
}

export async function syncCalendar(deps: CalendarDeps = {}): Promise<{ events: number; mode: CalendarMode; changed: boolean }> {
  const mode = calendarMode();
  try {
    if (mode === 'off') {
      replaceEvents([]);
      setAdapterState('calendar', { lastSyncAt: new Date().toISOString(), lastError: null });
      return { events: 0, mode, changed: false };
    }
    const text = mode === 'feed' ? await readFeed(process.env.STEVENS_CALENDAR_ICS as string, deps) : fixtureIcs();
    const now = nowMs();
    const parsed = parseIcs(text, now, now + 7 * 24 * 3600 * 1000);
    replaceEvents(parsed);
    const hash = createHash('sha256').update(JSON.stringify(parsed.map((event) => [event.uid, event.startsAt]))).digest('hex');
    const changed = getAdapterState('calendar')?.cursor !== hash;
    setAdapterState('calendar', { cursor: hash, lastSyncAt: new Date().toISOString(), lastError: null });
    return { events: parsed.length, mode, changed };
  } catch (err) {
    setAdapterState('calendar', { lastError: err instanceof Error ? err.message : String(err) });
    throw err;
  }
}

export function linkDealId(text: string, deals: { id: string; company: string }[]): string | null {
  const lower = text.toLowerCase();
  for (const deal of deals) {
    if (deal.company.length > 0 && lower.includes(deal.company.toLowerCase())) return deal.id;
  }
  return null;
}

function meetingFor(stored: StoredEvent, deals: { id: string; company: string }[]): Meeting {
  const dealId = linkDealId(stored.title + '\n' + (stored.description ?? '') + '\n' + stored.attendees.join('\n'), deals);
  const company = deals.find((deal) => deal.id === dealId)?.company ?? stored.title;
  return { id: 'cal-' + stored.uid, dealId: dealId ?? '', company, title: stored.title, startsAt: stored.startsAt, origin: 'calendar' };
}

export function calendarMeetings(deals: { id: string; company: string }[]): Meeting[] {
  const now = nowMs();
  return upcomingEvents(now, now + 24 * 3600 * 1000).map((stored) => meetingFor(stored, deals));
}
