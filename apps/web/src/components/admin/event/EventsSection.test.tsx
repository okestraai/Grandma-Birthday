import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import type { AdminEvent, GuestCategory } from '@birthday/types';
import { api, ApiError } from '@/lib/api';
import { EventsSection } from './EventsSection';
import { formatEventWhen } from './event-form';

vi.mock('@/lib/api', async (orig) => ({
  ...(await orig<typeof import('@/lib/api')>()),
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

const family: GuestCategory = {
  id: 'c1',
  name: 'Family',
  description: null,
  defaultCompanions: 2,
  selfSelectable: false,
  color: '#AA3355',
  sortOrder: 0,
  guestCount: 4,
  capacity: null,
  confirmedPeople: 0,
  full: false,
};

function event(id: string, name: string, extra: Partial<AdminEvent> = {}): AdminEvent {
  return {
    id,
    slug: id,
    name,
    description: null,
    startsAt: '2026-11-21T09:00:00.000Z', // 10:00 am in Lagos
    endsAt: '2026-11-21T12:00:00.000Z',
    venueName: 'Cathedral',
    address: '1 Church Road',
    city: 'Lagos',
    mapUrl: null,
    latitude: null,
    longitude: null,
    dressCode: null,
    theme: null,
    parkingInfo: null,
    rsvpEnabled: true,
    invitedCategories: [],
    sortOrder: 0,
    isPublic: true,
    capacity: null,
    invitedCategoryIds: [],
    attendingGuests: 10,
    attendingPeople: 25,
    capacityRemaining: null,
    checkedInPeople: 0,
    programmeCount: 3,
    updatedAt: '2026-09-01T10:00:00.000Z',
    ...extra,
  };
}

const EVENTS = [
  event('e1', 'Thanksgiving Service', { rsvpEnabled: false }),
  event('e3', 'Family Brunch', { sortOrder: 2, capacity: 40, invitedCategoryIds: ['c1'], isPublic: false, programmeCount: 0 }),
  event('e2', 'Birthday Dinner', { sortOrder: 1, programmeCount: 1 }),
];

/** The desktop table once the events have loaded (the phone cards repeat every button). */
async function loadedTable() {
  await screen.findAllByText('Birthday Dinner');
  return screen.getByRole('table', { name: 'Events' });
}

function renderSection() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <EventsSection timeZone="Africa/Lagos" />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.mocked(api.get).mockImplementation(async (path: string) => {
    if (path === '/admin/events') return EVENTS as never;
    if (path === '/admin/guest-categories') return [family] as never;
    throw new Error(`Unexpected GET ${path}`);
  });
});
afterEach(() => vi.clearAllMocks());

describe('EventsSection', () => {
  it('lists events in order with times in the celebration zone, badges, invitees and programme links', async () => {
    renderSection();
    const table = await loadedTable();
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.map((r) => /Thanksgiving Service|Birthday Dinner|Family Brunch/.exec(r.textContent ?? '')?.[0])).toEqual([
      'Thanksgiving Service',
      'Birthday Dinner',
      'Family Brunch',
    ]);
    expect(within(rows[0]!).getByText('Sat 21 Nov 2026, 10:00 am – 1:00 pm')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('Info only')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('Everyone')).toBeInTheDocument();
    expect(within(rows[2]!).getByText('Hidden')).toBeInTheDocument();
    expect(await within(rows[2]!).findByText('Family')).toBeInTheDocument();
    expect(within(rows[2]!).getByText('/ 40')).toBeInTheDocument();
    expect(within(rows[1]!).getByRole('link', { name: 'Programme (1 item)' })).toHaveAttribute('href', '/admin/programme?event=e2');
  });

  it('reorders with the arrow buttons', async () => {
    vi.mocked(api.put).mockResolvedValue(undefined as never);
    renderSection();
    fireEvent.click(within(await loadedTable()).getByRole('button', { name: 'Move Family Brunch up' }));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/admin/events/reorder', { ids: ['e1', 'e3', 'e2'] }));
  });

  it('adds an event with times read in the celebration zone', async () => {
    vi.mocked(api.post).mockResolvedValue(event('e4', 'Thank-you Lunch') as never);
    renderSection();
    fireEvent.click((await screen.findAllByRole('button', { name: 'Add event' }))[0]!);
    const dialog = await screen.findByRole('dialog', { name: 'Add event' });
    fireEvent.change(within(dialog).getByLabelText(/^Event name/), { target: { value: 'Thank-you Lunch' } });
    fireEvent.change(within(dialog).getByLabelText(/^Starts/), { target: { value: '2026-11-23T13:00' } });
    fireEvent.change(within(dialog).getByLabelText(/^Ends/), { target: { value: '2026-11-23T15:30' } });
    fireEvent.change(within(dialog).getByLabelText(/^Venue name/), { target: { value: 'Garden' } });
    fireEvent.change(within(dialog).getByLabelText(/^Address/), { target: { value: '2 Garden Lane' } });
    fireEvent.change(within(dialog).getByLabelText(/^Capacity/), { target: { value: '60' } });
    fireEvent.click(await within(dialog).findByRole('checkbox', { name: 'Family' }));
    fireEvent.click(within(dialog).getByRole('switch', { name: 'Guests reply to this event' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add event' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    const [path, body] = vi.mocked(api.post).mock.calls[0]!;
    expect(path).toBe('/admin/events');
    expect(body).toEqual(
      expect.objectContaining({
        name: 'Thank-you Lunch',
        startsAt: '2026-11-23T12:00:00.000Z',
        endsAt: '2026-11-23T14:30:00.000Z',
        capacity: 60,
        invitedCategoryIds: ['c1'],
        rsvpEnabled: false,
        isPublic: true,
        city: null,
      }),
    );
    expect(body).not.toHaveProperty('slug');
  });

  it('blocks an end before the start', async () => {
    renderSection();
    fireEvent.click(within(await loadedTable()).getByRole('button', { name: 'Edit Birthday Dinner' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit Birthday Dinner' });
    expect(within(dialog).getByLabelText(/^Starts/)).toHaveValue('2026-11-21T10:00');
    fireEvent.change(within(dialog).getByLabelText(/^Ends/), { target: { value: '2026-11-21T09:00' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    expect(await within(dialog).findByText('The event must end after it starts.')).toBeInTheDocument();
    expect(api.put).not.toHaveBeenCalled();
  });

  it('shows why the API refuses a delete', async () => {
    vi.mocked(api.delete).mockRejectedValue(
      new ApiError(409, { code: 'CONFLICT', message: '10 guests have replied to this event and 0 check-ins are recorded. Hide it and turn off its replies instead.' }),
    );
    renderSection();
    fireEvent.click(within(await loadedTable()).getByRole('button', { name: 'Delete Birthday Dinner' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete this event?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete event' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Hide it and turn off its replies instead.');
    expect(api.delete).toHaveBeenCalledWith('/admin/events/e2');
  });
});

describe('formatEventWhen', () => {
  it('adds the end date when an event runs past midnight', () => {
    expect(formatEventWhen('2026-11-21T18:00:00.000Z', '2026-11-22T00:30:00.000Z', 'Africa/Lagos')).toBe(
      'Sat 21 Nov 2026, 7:00 pm – Sun 22 Nov 2026, 1:30 am',
    );
  });
});
