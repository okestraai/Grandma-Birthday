import { screen } from '@testing-library/react';
import { MotionGlobalConfig } from 'motion/react';
import { jsonResponse, mockFetch, renderRoute } from '@/test/public-helpers';
import { DINNER, SERVICE, testItem, testProgramme, testSite } from '@/test/site-fixtures';
import ProgrammePage from './ProgrammePage';

MotionGlobalConfig.skipAnimations = true;

afterEach(() => vi.restoreAllMocks());

describe('ProgrammePage', () => {
  it('lists a single event as before, without event headings', async () => {
    mockFetch({
      '/api/site': () => jsonResponse(testSite([DINNER])),
      '/api/programme': () => jsonResponse(testProgramme([[DINNER, [testItem(DINNER.id, 'a', 'Welcome', '17:00'), testItem(DINNER.id, 'b', 'Dinner', '18:00')]]])),
    });
    renderRoute(<ProgrammePage />, { path: '/programme', route: '/programme' });

    expect(await screen.findByRole('heading', { name: 'Welcome' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2, name: 'Birthday Dinner' })).not.toBeInTheDocument();
    expect(screen.getByText('Order of the evening')).toBeInTheDocument();
  });

  it('groups items under each event, and dates an item after midnight', async () => {
    mockFetch({
      '/api/site': () => jsonResponse(testSite([SERVICE, DINNER])),
      '/api/programme': () =>
        jsonResponse(
          testProgramme([
            [SERVICE, [testItem(SERVICE.id, 'a', 'Sermon', '10:40')]],
            [DINNER, [testItem(DINNER.id, 'b', 'Dinner', '18:00'), testItem(DINNER.id, 'c', 'Carriages', '00:30', '2026-11-22')]],
          ]),
        ),
    });
    renderRoute(<ProgrammePage />, { path: '/programme', route: '/programme' });

    const headings = await screen.findAllByRole('heading', { level: 2 });
    expect(headings.map((h) => h.textContent)).toEqual(['Thanksgiving Service', 'Birthday Dinner']);
    expect(screen.getByRole('heading', { name: 'Sermon' })).toBeInTheDocument();
    expect(screen.getByText('Sun 22 Nov')).toBeInTheDocument();
    expect(screen.getByText('Order of events')).toBeInTheDocument();
  });
});
