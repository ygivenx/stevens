import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseIcs, syncCalendar, linkDealId, calendarMeetings, calendarMode } from './calendar.js';
import { closeDb, getAdapterState, upcomingEvents } from '../store.js';

const ICS = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:in-window
DTSTART:20261028T140000Z
DTEND:20261028T143000Z
SUMMARY:Helios follow-up
DESCRIPTION:Ask about churn
ATTENDEE;CN=Priya Nair:mailto:priya@example.com
END:VEVENT
BEGIN:VEVENT
UID:outside
DTSTART:20261120T140000Z
SUMMARY:Far away
END:VEVENT
BEGIN:VEVENT
UID:cancelled
DTSTART:20261028T150000Z
SUMMARY:Called off
STATUS:CANCELLED
END:VEVENT
BEGIN:VEVENT
UID:allday
DTSTART;VALUE=DATE:20261028
SUMMARY:All day thing
END:VEVENT
BEGIN:VEVENT
UID:weekly
DTSTART:20261020T090000Z
RRULE:FREQ=WEEKLY;COUNT=4
SUMMARY:Standup
END:VEVENT
END:VCALENDAR`;

const FROM = Date.parse('2026-10-27T00:00:00Z');
const TO = Date.parse('2026-11-10T00:00:00Z');

describe('parseIcs', () => {
  it('keeps timed events inside the window and skips the rest', async () => {
    const parsed = parseIcs(ICS, FROM, TO);
    const uids = parsed.map((event) => event.uid);
    expect(uids).toContain('in-window');
    expect(uids).not.toContain('outside');
    expect(uids).not.toContain('cancelled');
    expect(uids).not.toContain('allday');
  });

  it('expands recurrences inside the window', async () => {
    const parsed = parseIcs(ICS, FROM, TO);
    const standups = parsed.filter((event) => event.uid === 'weekly');
    expect(standups).toHaveLength(2);
  });

  it('reads attendees and descriptions', async () => {
    const parsed = parseIcs(ICS, FROM, TO);
    const found = parsed.find((event) => event.uid === 'in-window');
    expect(found?.attendees).toEqual(['Priya Nair <priya@example.com>']);
    expect(found?.description).toBe('Ask about churn');
  });
});

describe('linkDealId', () => {
  const deals = [{ id: 'helios', company: 'Helios' }];
  it('links when the company is named', async () => {
    expect(linkDealId('Helios follow-up with Priya', deals)).toBe('helios');
  });
  it('stays unlinked otherwise', async () => {
    expect(linkDealId('Dentist appointment', deals)).toBeNull();
  });
});

describe('calendarMode', () => {
  afterEach(async () => {
    delete process.env.STEVENS_CALENDAR_ICS;
  });
  it('is off when unset, fixture when blank, feed when set', async () => {
    expect(calendarMode()).toBe('off');
    process.env.STEVENS_CALENDAR_ICS = '';
    expect(calendarMode()).toBe('fixture');
    process.env.STEVENS_CALENDAR_ICS = 'https://example.com/cal.ics';
    expect(calendarMode()).toBe('feed');
  });
});

describe('syncCalendar', () => {
  beforeEach(async () => {
    await closeDb();
    process.env.STEVENS_DATA_DIR = mkdtempSync(join(tmpdir(), 'stevens-cal-'));
    process.env.STEVENS_CALENDAR_ICS = '';
    process.env.STEVENS_NOW = '2026-10-27T12:00:00Z';
  });

  afterEach(async () => {
    delete process.env.STEVENS_CALENDAR_ICS;
    delete process.env.STEVENS_NOW;
    await closeDb();
  });

  it('syncs the fixture once and reports no change the second time', async () => {
    const first = await syncCalendar();
    expect(first.mode).toBe('fixture');
    expect(first.events).toBe(1);
    expect(first.changed).toBe(true);
    const rows = await upcomingEvents(Date.parse('2026-10-27T12:00:00Z'), Date.parse('2026-11-04T12:00:00Z'));
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toContain('Helios');
    const second = await syncCalendar();
    expect(second.changed).toBe(false);
  });

  it('links calendar meetings to deals by company name', async () => {
    await syncCalendar();
    process.env.STEVENS_NOW = '2026-10-28T14:00:00Z';
    const meetings = await calendarMeetings([{ id: 'helios', company: 'Helios' }]);
    expect(meetings).toHaveLength(1);
    expect(meetings[0].dealId).toBe('helios');
    expect(meetings[0].origin).toBe('calendar');
  });

  it('records the error when the feed fails', async () => {
    process.env.STEVENS_CALENDAR_ICS = 'https://example.com/cal.ics';
    await expect(syncCalendar({ fetchFn: async () => { throw new Error('feed is down'); } })).rejects.toThrow('feed is down');
    expect((await getAdapterState('calendar'))?.lastError).toBe('feed is down');
  });
});
