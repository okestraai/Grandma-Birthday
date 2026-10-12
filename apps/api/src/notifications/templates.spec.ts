import { invitationEmail, type EmailEvent } from './templates';

const event = (name: string, partySize: number): EmailEvent => ({
  name,
  dateText: 'Saturday, 21 November 2026',
  timeText: '5:00 PM – 11:00 PM',
  venue: 'The Emerald Ballroom',
  address: '12 Palm Grove Avenue',
  dressCode: null,
  partySize,
});

const base = {
  guestName: 'Ada <Guest>',
  celebrantName: 'Margaret',
  eventName: 'Margaret at Seventy',
  partySize: 3,
  code: 'BP70-AAAAAA',
  invitationUrl: 'https://example.com/invitation/x',
  isRsvpConfirmation: true,
};

describe('invitationEmail', () => {
  it('keeps the date, time and venue rows for a single event', () => {
    const email = invitationEmail({ ...base, events: [event('Birthday Dinner', 3)] });
    expect(email.text).toContain('Date: Saturday, 21 November 2026');
    expect(email.text).toContain('Admits: 3');
    expect(email.html).toContain('Ada &lt;Guest&gt;');
  });

  it('lists each chosen event with its own party size when there are several', () => {
    const email = invitationEmail({ ...base, events: [event('Thanksgiving Service', 3), event('Family Brunch', 2)] });
    expect(email.text).toContain('Thanksgiving Service: Saturday, 21 November 2026, 5:00 PM – 11:00 PM. The Emerald Ballroom, 12 Palm Grove Avenue. Admits 3.');
    expect(email.text).toContain('Family Brunch:');
    expect(email.text).toContain('Admits 2.');
    expect(email.html).toContain('Family Brunch');
    expect(email.html).toContain('works at every event');
  });
});
