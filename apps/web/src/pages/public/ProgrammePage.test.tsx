import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { MotionGlobalConfig } from 'motion/react';
import type { SiteOverview } from '@birthday/types';
import { jsonResponse, mockFetch } from '@/test/public-helpers';
import { BRUNCH, DINNER, SERVICE, testItem, testProgramme, testSite } from '@/test/site-fixtures';
import ProgrammePage from './ProgrammePage';

MotionGlobalConfig.skipAnimations = true;

// Between the service (09:00–11:00 UTC) and the dinner (16:00 UTC) on the first day.
const MIDDAY = new Date('2026-11-21T12:00:00.000Z');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(MIDDAY);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const threeEvents = () =>
  testProgramme([
    [SERVICE, [testItem(SERVICE.id, 'a', 'Sermon', '10:40')]],
    [DINNER, [testItem(DINNER.id, 'b', 'Dinner', '18:00'), testItem(DINNER.id, 'c', 'Carriages', '00:30', '2026-11-22')]],
    [BRUNCH, []],
  ]);

function renderAt(route: string, site: SiteOverview = testSite([SERVICE, DINNER, BRUNCH]), programme = threeEvents()) {
  mockFetch({ '/api/site': () => jsonResponse(site), '/api/programme': () => jsonResponse(programme) });
  const router = createMemoryRouter([{ path: '/programme', element: <ProgrammePage /> }], { initialEntries: [route] });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

const eventHeading = () => screen.findByRole('heading', { level: 2 });

describe('ProgrammePage', () => {
  it('shows a single programme without a switcher: its event card and running order', async () => {
    renderAt('/programme', testSite([DINNER]), testProgramme([[DINNER, [testItem(DINNER.id, 'a', 'Welcome', '17:00'), testItem(DINNER.id, 'b', 'Dinner', '18:00')]]]));

    expect(await screen.findByRole('heading', { name: 'Welcome' })).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect((await eventHeading()).textContent).toBe('Birthday Dinner');
    expect(screen.getByText('Black tie')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Get directions/ })).toBeInTheDocument();
    expect(screen.getByText('Order of the evening')).toBeInTheDocument();
  });

  it('opens on the next event that has not finished, and lists only events with items', async () => {
    renderAt('/programme');

    const tabs = await screen.findAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['Thanksgiving ServiceSat 21 Nov', 'Birthday DinnerSat 21 Nov']);
    expect(screen.getByRole('tab', { selected: true })).toHaveTextContent('Birthday Dinner');
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'programme-tab-birthday-dinner');
    expect((await eventHeading()).textContent).toBe('Birthday Dinner');
    // An item after midnight shows its own date.
    expect(screen.getByText('Sun 22 Nov')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Sermon' })).not.toBeInTheDocument();
  });

  it('opens the event named in ?event= and switches with clicks and arrow keys, keeping the URL in step', async () => {
    const router = renderAt('/programme?event=thanksgiving-service');

    expect(await screen.findByRole('heading', { name: 'Sermon' })).toBeInTheDocument();
    const service = screen.getByRole('tab', { name: /Thanksgiving Service/ });
    expect(service).toHaveAttribute('aria-selected', 'true');
    expect(service).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tab', { name: /Birthday Dinner/ })).toHaveAttribute('tabindex', '-1');

    fireEvent.keyDown(service, { key: 'ArrowRight' });
    expect(await screen.findByRole('heading', { name: 'Carriages' })).toBeInTheDocument();
    expect(router.state.location.search).toBe('?event=birthday-dinner');
    expect(screen.getByRole('tab', { name: /Birthday Dinner/ })).toHaveFocus();

    // Wraps around; Home and End jump to the ends.
    fireEvent.keyDown(screen.getByRole('tab', { name: /Birthday Dinner/ }), { key: 'ArrowRight' });
    await waitFor(() => expect(router.state.location.search).toBe('?event=thanksgiving-service'));
    fireEvent.keyDown(screen.getByRole('tab', { name: /Thanksgiving Service/ }), { key: 'End' });
    await waitFor(() => expect(router.state.location.search).toBe('?event=birthday-dinner'));

    fireEvent.click(screen.getByRole('tab', { name: /Thanksgiving Service/ }));
    expect(await screen.findByRole('heading', { name: 'Sermon' })).toBeInTheDocument();
    expect(router.state.location.search).toBe('?event=thanksgiving-service');
  });

  it('falls back to the default for an unknown event, and to the first once every event has ended', async () => {
    vi.setSystemTime(new Date('2026-12-01T00:00:00.000Z'));
    renderAt('/programme?event=nope');
    await screen.findAllByRole('tab');
    expect(screen.getByRole('tab', { selected: true })).toHaveTextContent('Thanksgiving Service');
  });

  it('says the programme is not available while an admin has hidden it, and asks search engines to skip it', async () => {
    const site = testSite([SERVICE, DINNER]);
    site.celebration.programmeVisible = false;
    renderAt('/programme', site, []);

    expect(await screen.findByText("The programme isn't available yet")).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /See the event details/ })).toHaveAttribute('href', '/event');
    await waitFor(() => expect(document.querySelector('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow'));
  });

  it('treats a saved copy without the flag as visible', async () => {
    const site = testSite([DINNER]);
    delete (site.celebration as Partial<SiteOverview['celebration']>).programmeVisible;
    renderAt('/programme', site, testProgramme([[DINNER, [testItem(DINNER.id, 'a', 'Welcome', '17:00')]]]));

    expect(await screen.findByRole('heading', { name: 'Welcome' })).toBeInTheDocument();
    expect(within(document.body).queryByText("The programme isn't available yet")).not.toBeInTheDocument();
  });
});
