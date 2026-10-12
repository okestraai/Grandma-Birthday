import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { MotionGlobalConfig } from 'motion/react';
import type { SiteOverview } from '@birthday/types';
import { jsonResponse, mockFetch, renderRoute } from '@/test/public-helpers';
import { DINNER, SERVICE, testItem, testProgramme, testSite } from '@/test/site-fixtures';
import HomePage from '@/pages/public/HomePage';
import EventPage from '@/pages/public/EventPage';
import { Header } from '../Header';
import { Footer } from '../Footer';
import { ProgrammeSection } from '../home/sections';
import { defaultProgrammeGroup, groupsWithItems, pickProgrammeGroup, programmeHref } from './programme-helpers';

MotionGlobalConfig.skipAnimations = true;

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function siteWith(visible: boolean | undefined, events = [SERVICE, DINNER]): SiteOverview {
  const site = testSite(events);
  if (visible === undefined) delete (site.celebration as Partial<SiteOverview['celebration']>).programmeVisible;
  else site.celebration.programmeVisible = visible;
  return site;
}

const dinnerItems = ['Arrival', 'Welcome', 'Dinner', 'Toasts', 'Cake', 'Dancing', 'Carriages'].map((title, i) =>
  testItem(DINNER.id, `d${i}`, title, `${17 + i}:00`.padStart(5, '0')),
);
const twoProgrammes = testProgramme([
  [SERVICE, [testItem(SERVICE.id, 's1', 'Sermon', '10:40')]],
  [DINNER, dinnerItems],
]);

describe('programme links follow the admin switch', () => {
  function renderChrome(site: SiteOverview) {
    return render(
      <MemoryRouter initialEntries={['/']}>
        <Header site={site} overHero={false} />
        <Footer site={site} />
      </MemoryRouter>,
    );
  }

  it('drops Programme from the header, the phone menu and the footer when hidden', async () => {
    renderChrome(siteWith(false));
    expect(within(screen.getByRole('navigation', { name: 'Main' })).queryByRole('link', { name: 'Programme' })).not.toBeInTheDocument();
    expect(within(screen.getByRole('navigation', { name: 'Footer' })).queryByRole('link', { name: 'Programme' })).not.toBeInTheDocument();
    expect(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name: 'Tributes' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    const menu = await screen.findByRole('navigation', { name: 'Mobile' });
    expect(within(menu).getByRole('link', { name: 'The Event' })).toBeInTheDocument();
    expect(within(menu).queryByRole('link', { name: 'Programme' })).not.toBeInTheDocument();
  });

  it('keeps Programme when shown, and when an older saved copy has no flag', async () => {
    for (const visible of [true, undefined]) {
      const { unmount } = renderChrome(siteWith(visible));
      expect(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name: 'Programme' })).toHaveAttribute('href', '/programme');
      expect(within(screen.getByRole('navigation', { name: 'Footer' })).getByRole('link', { name: 'Programme' })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
      expect(within(await screen.findByRole('navigation', { name: 'Mobile' })).getByRole('link', { name: 'Programme' })).toBeInTheDocument();
      unmount();
    }
  });

  it('hides the "View the programme" card on the event page', async () => {
    mockFetch({ '/api/site': () => jsonResponse(siteWith(false)) });
    renderRoute(<EventPage />, { path: '/event', route: '/event' });
    expect(await screen.findByRole('heading', { level: 1, name: 'Margaret at Seventy' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /View the programme/ })).not.toBeInTheDocument();
  });

  it('shows the "View the programme" card on the event page when visible', async () => {
    mockFetch({ '/api/site': () => jsonResponse(siteWith(true)) });
    renderRoute(<EventPage />, { path: '/event', route: '/event' });
    expect(await screen.findByRole('link', { name: /View the programme/ })).toHaveAttribute('href', '/programme');
  });

  function mockHome(site: SiteOverview) {
    return mockFetch({
      '/api/site': () => jsonResponse(site),
      '/api/programme': () => jsonResponse(twoProgrammes),
      '/api/timeline': () => jsonResponse([]),
      '/api/family': () => jsonResponse({ members: [], relationships: [] }),
      '/api/albums': () => jsonResponse([]),
      '/api/media': () => jsonResponse({ items: [], page: 1, pageSize: 24, total: 0, totalPages: 0 }),
      '/api/testimonials/public': () => jsonResponse({ items: [], page: 1, pageSize: 8, total: 0, totalPages: 0 }),
    });
  }

  it('leaves the programme section off the home page when hidden', async () => {
    const fetch = mockHome(siteWith(false));
    renderRoute(<HomePage />);
    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'The programme' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /See the full programme/ })).not.toBeInTheDocument();
    expect(fetch.mock.calls.some(([url]) => String(url).includes('/api/programme'))).toBe(false);
  });

  it('shows the programme section on the home page when visible', async () => {
    mockHome(siteWith(true));
    renderRoute(<HomePage />);
    expect(await screen.findByRole('link', { name: /See the full programme/ })).toBeInTheDocument();
  });
});

describe('home programme section', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-21T12:00:00.000Z'));
  });

  it('opens on the next event, shows its first five items, and switches with the pills', async () => {
    mockFetch({ '/api/programme': () => jsonResponse(twoProgrammes) });
    renderRoute(<ProgrammeSection timezone="Africa/Lagos" />);

    expect(await screen.findByRole('tab', { selected: true })).toHaveTextContent('Birthday Dinner');
    expect(screen.getByRole('heading', { name: 'Cake' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Dancing' })).not.toBeInTheDocument();
    expect(screen.getByText('Birthday Dinner Hall')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /See the full programme/ })).toHaveAttribute('href', '/programme?event=birthday-dinner');

    fireEvent.click(screen.getByRole('tab', { name: /Thanksgiving Service/ }));
    expect(await screen.findByRole('heading', { name: 'Sermon' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { selected: true })).toHaveTextContent('Thanksgiving Service');
    expect(screen.getByRole('link', { name: /See the full programme/ })).toHaveAttribute('href', '/programme?event=thanksgiving-service');

    fireEvent.keyDown(screen.getByRole('tab', { selected: true }), { key: 'ArrowLeft' });
    expect(await screen.findByRole('heading', { name: 'Arrival' })).toBeInTheDocument();
  });

  it('shows a single programme without pills', async () => {
    mockFetch({ '/api/programme': () => jsonResponse(testProgramme([[DINNER, dinnerItems.slice(0, 2)]])) });
    renderRoute(<ProgrammeSection timezone="Africa/Lagos" />);

    expect(await screen.findByRole('heading', { name: 'Welcome' })).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /See the full programme/ })).toHaveAttribute('href', '/programme');
  });
});

describe('programme helpers', () => {
  const groups = testProgramme([
    [SERVICE, [testItem(SERVICE.id, 'a', 'Sermon', '10:40')]],
    [DINNER, [testItem(DINNER.id, 'b', 'Dinner', '18:00')]],
  ]);

  it('picks the event in progress or next, else the first', () => {
    expect(defaultProgrammeGroup(groups, Date.parse('2026-11-01T00:00:00Z'))?.event.slug).toBe('thanksgiving-service');
    expect(defaultProgrammeGroup(groups, Date.parse('2026-11-21T10:00:00Z'))?.event.slug).toBe('thanksgiving-service');
    expect(defaultProgrammeGroup(groups, Date.parse('2026-11-21T12:00:00Z'))?.event.slug).toBe('birthday-dinner');
    expect(defaultProgrammeGroup(groups, Date.parse('2027-01-01T00:00:00Z'))?.event.slug).toBe('thanksgiving-service');
    expect(defaultProgrammeGroup([])).toBeUndefined();
  });

  it('prefers the slug asked for, drops empty events and links to one event', () => {
    expect(pickProgrammeGroup(groups, 'birthday-dinner', 0)?.event.slug).toBe('birthday-dinner');
    expect(pickProgrammeGroup(groups, 'unknown', 0)?.event.slug).toBe('thanksgiving-service');
    expect(groupsWithItems([...groups, { event: DINNER, items: [] }])).toHaveLength(2);
    expect(programmeHref(groups, 'birthday-dinner')).toBe('/programme?event=birthday-dinner');
    expect(programmeHref(groups.slice(0, 1), 'thanksgiving-service')).toBe('/programme');
  });
});
