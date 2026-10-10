import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';
import type { AdminEvent } from '@birthday/types';
import { api } from '@/lib/api';
import { EventForm } from './EventForm';

vi.mock('@/lib/api', async (orig) => ({
  ...(await orig<typeof import('@/lib/api')>()),
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const event: AdminEvent = {
  name: 'Mama at 70',
  tagline: null,
  description: null,
  startsAt: '2026-11-21T15:00:00.000Z', // 4:00 PM in Lagos
  endsAt: '2026-11-21T21:00:00.000Z',
  timezone: 'Africa/Lagos',
  venueName: 'Eko Hotel',
  address: 'Adetokunbo Ademola Street',
  city: 'Lagos',
  mapUrl: null,
  latitude: null,
  longitude: null,
  theme: null,
  dressCode: null,
  parkingInfo: null,
  contactName: null,
  contactEmail: null,
  contactPhone: null,
  capacity: 300,
  rsvpOpen: true,
  rsvpMode: 'OPEN',
  rsvpDeadline: null,
  defaultCompanions: 1,
  maxCompanions: 3,
  allowCompanions: true,
  confirmedPeople: 120,
  capacityRemaining: 180,
  updatedAt: '2026-09-01T10:00:00.000Z',
};

function renderForm() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const router = createMemoryRouter([{ path: '/', element: <EventForm event={event} /> }]);
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe('EventForm', () => {
  beforeEach(() => vi.mocked(api.put).mockReset());

  it('shows times on the event clock and saves them back as UTC', async () => {
    vi.mocked(api.put).mockImplementation(async (_path, body) => ({ ...event, ...(body as object) }));
    renderForm();

    const starts = screen.getByLabelText(/^Starts/) as HTMLInputElement;
    expect(starts.value).toBe('2026-11-21T16:00');
    expect(screen.getByText(/Africa\/Lagos, UTC\+1/)).toBeInTheDocument();

    fireEvent.change(starts, { target: { value: '2026-11-21T17:30' } });
    fireEvent.change(screen.getByLabelText(/^Event name/), { target: { value: '  Mama at Seventy ' } });
    fireEvent.change(screen.getByLabelText(/^Theme/), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: /Save changes/ }));

    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    const [path, body] = vi.mocked(api.put).mock.calls[0];
    expect(path).toBe('/admin/event');
    expect(body).toMatchObject({
      name: 'Mama at Seventy',
      startsAt: '2026-11-21T16:30:00.000Z',
      endsAt: '2026-11-21T21:00:00.000Z',
      theme: null,
      rsvpDeadline: null,
      capacity: 300,
    });
    expect(body).not.toHaveProperty('confirmedPeople');
    expect(body).not.toHaveProperty('capacityRemaining');
    expect(body).not.toHaveProperty('updatedAt');
  });

  it('blocks a default companion count above the maximum', async () => {
    renderForm();
    fireEvent.change(screen.getByLabelText(/^Default companions/), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: /Save changes/ }));
    expect(await screen.findByText('The default cannot be more than the maximum.')).toBeInTheDocument();
    expect(api.put).not.toHaveBeenCalled();
  });
});
