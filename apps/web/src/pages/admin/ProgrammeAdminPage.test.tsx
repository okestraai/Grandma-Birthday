import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';
import type { ProgrammeItem } from '@birthday/types';
import { api } from '@/lib/api';
import ProgrammeAdminPage from './ProgrammeAdminPage';

vi.mock('@/lib/api', async (orig) => ({
  ...(await orig<typeof import('@/lib/api')>()),
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));
vi.mock('@/components/seo/SEO', () => ({ SEO: () => null }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

const ev = (id: string, name: string, sortOrder: number, startsAt: string) => ({ id, name, sortOrder, startsAt, endsAt: startsAt, programmeCount: 1 });
const DINNER = ev('e2', 'Birthday Dinner', 1, '2026-11-21T17:00:00.000Z'); // 6:00 pm in Lagos
const SERVICE = ev('e1', 'Thanksgiving Service', 0, '2026-11-21T09:00:00.000Z');

const item = (id: string, eventId: string, title: string, startTime: string, date: string | null = null, sortOrder = 0): ProgrammeItem => ({
  id,
  eventId,
  date,
  startTime,
  endTime: null,
  title,
  description: null,
  speaker: null,
  location: null,
  sortOrder,
});

let events = [DINNER, SERVICE];

beforeEach(() => {
  events = [DINNER, SERVICE];
  vi.mocked(api.get).mockImplementation(async (path: string) => {
    if (path === '/admin/events') return events as never;
    if (path === '/admin/celebration') return { timezone: 'Africa/Lagos' } as never;
    if (path === '/admin/events/e1/programme') return [item('p1', 'e1', 'Opening hymn', '10:00')] as never;
    if (path === '/admin/events/e2/programme')
      return [item('p3', 'e2', 'Last dance', '00:30', '2026-11-22', 0), item('p2', 'e2', 'Dinner served', '19:00', null, 1)] as never;
    throw new Error(`Unexpected GET ${path}`);
  });
  vi.mocked(api.post).mockImplementation(async (_path, body) => ({ ...(body as object), id: 'new', eventId: 'e2', sortOrder: 2 }) as never);
});
afterEach(() => vi.clearAllMocks());

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const router = createMemoryRouter([{ path: '/admin/programme', element: <ProgrammeAdminPage /> }], { initialEntries: [path] });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

describe('ProgrammeAdminPage', () => {
  it('opens the first event and switches events with the tabs', async () => {
    const router = renderAt('/admin/programme');
    const tabs = await screen.findByRole('group', { name: 'Event' });
    expect(within(tabs).getByRole('button', { pressed: true })).toHaveTextContent('Thanksgiving Service');
    expect((await screen.findAllByText('Opening hymn')).length).toBeGreaterThan(0);

    fireEvent.click(within(tabs).getByRole('button', { name: /Birthday Dinner/ }));
    expect(router.state.location.search).toBe('?event=e2');
    expect((await screen.findAllByText('Dinner served')).length).toBeGreaterThan(0);
    // An item after midnight leads with its day and counts as later than the dinner.
    expect(screen.getAllByText('Sun 22 Nov, 12:30 AM').length).toBeGreaterThan(0);
    expect(screen.getByText('The list is not in time order. Guests see it in the order shown here.')).toBeInTheDocument();
  });

  it('adds an item to the chosen event; a date equal to the event’s day is sent as blank', async () => {
    renderAt('/admin/programme?event=e2');
    await screen.findAllByText('Dinner served');
    fireEvent.click(screen.getAllByRole('button', { name: 'Add item' })[0]!);
    const dialog = await screen.findByRole('dialog', { name: 'Add programme item' });
    expect(within(dialog).getByText(/Leave blank for the event’s day \(Sat 21 Nov\)/)).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText(/^Date/), { target: { value: '2026-11-21' } });
    fireEvent.change(within(dialog).getByLabelText(/^Starts at/), { target: { value: '18:30' } });
    fireEvent.change(within(dialog).getByLabelText(/^Title/), { target: { value: 'Guest arrival' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add item' }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/admin/events/e2/programme', expect.objectContaining({ date: null, startTime: '18:30', title: 'Guest arrival' })),
    );
  });

  it('shows no tabs when there is one event', async () => {
    events = [SERVICE];
    renderAt('/admin/programme');
    expect((await screen.findAllByText('Opening hymn')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('group', { name: 'Event' })).not.toBeInTheDocument();
  });

  it('hides and shows the programme on the website with one switch, items still editable', async () => {
    let saved = { timezone: 'Africa/Lagos', programmeVisible: true };
    const get = vi.mocked(api.get).getMockImplementation()!;
    vi.mocked(api.get).mockImplementation(async (path: string, ...rest) => (path === '/admin/celebration' ? (saved as never) : get(path, ...rest)));
    vi.mocked(api.put).mockImplementation(async (_path, body) => (saved = { ...saved, ...(body as object) }) as never);
    renderAt('/admin/programme');
    const toggle = await screen.findByRole('switch', { name: 'Show the programme on the website' });
    await waitFor(() => expect(toggle).toBeEnabled());
    expect(toggle).toBeChecked();
    expect(screen.getByText(/You can still edit it here/)).toBeInTheDocument();

    fireEvent.click(toggle);
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/admin/celebration', { programmeVisible: false }));
    await waitFor(() => expect(toggle).not.toBeChecked());
    expect(screen.getAllByRole('button', { name: 'Add item' })[0]).toBeEnabled();

    fireEvent.click(toggle);
    await waitFor(() => expect(api.put).toHaveBeenLastCalledWith('/admin/celebration', { programmeVisible: true }));
    await waitFor(() => expect(toggle).toBeChecked());
  });
});
