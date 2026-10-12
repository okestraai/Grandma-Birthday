import { render, screen } from '@testing-library/react';
import { calendarEvents } from './event-helpers';
import { AddToCalendar } from './AddToCalendar';
import { BRUNCH, DINNER, testSite } from '@/test/site-fixtures';

describe('AddToCalendar', () => {
  const site = testSite([DINNER, BRUNCH]);

  it('keeps one button and one Google link for a single event', () => {
    render(<AddToCalendar events={calendarEvents(site, [DINNER])} />);
    expect(screen.getByRole('button', { name: 'Add to calendar' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Google Calendar/ })).toHaveAttribute('href', expect.stringContaining('text=Birthday+Dinner'));
  });

  it('adds every event from one button and links each to Google Calendar', () => {
    const events = calendarEvents(site, site.events);
    render(<AddToCalendar events={events} />);
    expect(screen.getByRole('button', { name: 'Add all to calendar' })).toBeInTheDocument();
    const links = screen.getAllByRole('link');
    expect(links.map((a) => a.textContent)).toEqual(['Birthday Dinner (opens in a new tab)', 'Family Brunch (opens in a new tab)']);
    expect(events[1]).toMatchObject({ title: 'Family Brunch · Margaret at Seventy', url: expect.stringMatching(/\/event#family-brunch$/) });
    expect(new Set(events.map((e) => e.uid)).size).toBe(2);
  });
});
