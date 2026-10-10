import { buildIcs, escapeIcsText, googleCalendarUrl, slugify } from './calendar';

const event = {
  uid: 'celebration-1@example.com',
  title: 'A Celebration of Seventy Years',
  startsAt: '2026-11-21T16:00:00.000Z',
  endsAt: '2026-11-21T22:00:00.000Z',
  location: 'Eko Hotel, Plot 1415 Adetokunbo Ademola Street, Lagos',
  description: 'Dress code: Black tie; gold accents\nhttps://example.com/event',
};

describe('buildIcs', () => {
  const ics = buildIcs(event, new Date('2026-09-01T00:00:00Z'));

  it('writes a valid VEVENT in UTC with CRLF line endings', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('DTSTART:20261121T160000Z\r\n');
    expect(ics).toContain('DTEND:20261121T220000Z\r\n');
    expect(ics).toContain('DTSTAMP:20260901T000000Z\r\n');
    expect(ics).toContain('UID:celebration-1@example.com');
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
  });

  it('escapes commas, semicolons and newlines', () => {
    expect(escapeIcsText('a,b;c\nd\\e')).toBe('a\\,b\\;c\\nd\\\\e');
    expect(ics).toContain('LOCATION:Eko Hotel\\, Plot 1415');
  });

  it('folds long lines at 75 characters', () => {
    for (const line of ics.split('\r\n')) expect(line.length).toBeLessThanOrEqual(75);
  });
});

describe('calendar helpers', () => {
  it('builds a Google Calendar link', () => {
    const url = new URL(googleCalendarUrl(event));
    expect(url.searchParams.get('dates')).toBe('20261121T160000Z/20261121T220000Z');
    expect(url.searchParams.get('text')).toBe(event.title);
  });

  it('slugifies titles for filenames', () => {
    expect(slugify('Dr. Margaret’s 70th — Celebration!')).toBe('dr-margaret-s-70th-celebration');
    expect(slugify('***')).toBe('celebration');
  });
});
