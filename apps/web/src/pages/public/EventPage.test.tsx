import { screen, within } from '@testing-library/react';
import { MotionGlobalConfig } from 'motion/react';
import { jsonResponse, mockFetch, renderRoute } from '@/test/public-helpers';
import { BRUNCH, DINNER, SERVICE, testSite } from '@/test/site-fixtures';
import EventPage from './EventPage';

MotionGlobalConfig.skipAnimations = true;

afterEach(() => vi.restoreAllMocks());

describe('EventPage', () => {
  it('keeps the single-event layout: one details list and the "Getting there" card', async () => {
    mockFetch({ '/api/site': () => jsonResponse(testSite([DINNER])) });
    renderRoute(<EventPage />, { path: '/event', route: '/event' });

    expect(await screen.findByRole('heading', { level: 1, name: 'Margaret at Seventy' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Details for our guests' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Getting there' })).toBeInTheDocument();
    expect(screen.queryAllByRole('article')).toHaveLength(0);
    expect(screen.getByText('Black tie')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add to calendar' })).toBeInTheDocument();
  });

  it('shows one card per event, each with directions and its own calendar entry', async () => {
    mockFetch({ '/api/site': () => jsonResponse(testSite([SERVICE, DINNER, BRUNCH])) });
    renderRoute(<EventPage />, { path: '/event', route: '/event' });

    const cards = await screen.findAllByRole('article');
    expect(cards.map((card) => within(card).getByRole('heading').textContent)).toEqual(['Thanksgiving Service', 'Birthday Dinner', 'Family Brunch']);
    expect(cards[2]).toHaveAttribute('id', 'family-brunch');
    for (const card of cards) {
      expect(within(card).getByRole('link', { name: /Get directions/ })).toBeInTheDocument();
      expect(within(card).getByRole('button', { name: 'Add to calendar' })).toBeInTheDocument();
    }
    expect(within(cards[2]).getByText('For Family guests')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Getting there' })).not.toBeInTheDocument();
    // The hero spans both days and adds every event to the calendar at once.
    expect(screen.getByText('Saturday 21 November – Sunday 22 November 2026')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add all to calendar' })).toBeInTheDocument();
  });
});
