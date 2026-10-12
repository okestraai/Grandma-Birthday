import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';
import type { AdminCelebration } from '@birthday/types';
import { api } from '@/lib/api';
import { CelebrationForm } from './CelebrationForm';

vi.mock('@/lib/api', async (orig) => ({
  ...(await orig<typeof import('@/lib/api')>()),
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const celebration: AdminCelebration = {
  name: 'Mama at 70',
  tagline: null,
  description: null,
  timezone: 'Africa/Lagos',
  startsAt: '2026-11-21T09:00:00.000Z',
  endsAt: '2026-11-22T14:00:00.000Z',
  contactName: null,
  contactEmail: null,
  contactPhone: null,
  capacity: 300,
  rsvpOpen: true,
  rsvpMode: 'OPEN',
  rsvpScope: 'PER_EVENT',
  checkInScope: 'PER_EVENT',
  rsvpDeadline: '2026-11-14T22:59:00.000Z', // 11:59 PM in Lagos
  defaultCompanions: 1,
  maxCompanions: 3,
  allowCompanions: true,
  confirmedPeople: 120,
  capacityRemaining: 180,
  updatedAt: '2026-09-01T10:00:00.000Z',
};

function renderForm() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const router = createMemoryRouter([{ path: '/', element: <CelebrationForm celebration={celebration} /> }]);
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe('CelebrationForm', () => {
  beforeEach(() => vi.mocked(api.put).mockReset());

  it('shows the deadline on the celebration clock and saves only celebration-wide fields', async () => {
    vi.mocked(api.put).mockImplementation(async (_path, body) => ({ ...celebration, ...(body as object) }));
    renderForm();

    const deadline = screen.getByLabelText(/^RSVP deadline/) as HTMLInputElement;
    expect(deadline.value).toBe('2026-11-14T23:59');
    expect(screen.getByText(/read in this zone \(UTC\+1\)/)).toBeInTheDocument();

    fireEvent.change(deadline, { target: { value: '2026-11-15T12:00' } });
    fireEvent.change(screen.getByLabelText(/^Celebration name/), { target: { value: '  Mama at Seventy ' } });
    fireEvent.change(screen.getByLabelText(/^Tagline/), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: /Save changes/ }));

    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    const [path, body] = vi.mocked(api.put).mock.calls[0];
    expect(path).toBe('/admin/celebration');
    expect(body).toMatchObject({ name: 'Mama at Seventy', tagline: null, rsvpDeadline: '2026-11-15T11:00:00.000Z', capacity: 300 });
    for (const key of ['startsAt', 'endsAt', 'venueName', 'dressCode', 'confirmedPeople', 'capacityRemaining', 'updatedAt']) {
      expect(body).not.toHaveProperty(key);
    }
  });

  it('saves how guests reply and how they are checked in', async () => {
    vi.mocked(api.put).mockImplementation(async (_path, body) => ({ ...celebration, ...(body as object) }));
    renderForm();
    fireEvent.click(screen.getByRole('radio', { name: /Once for everything/ }));
    fireEvent.click(screen.getByRole('radio', { name: /Once for the celebration/ }));
    fireEvent.click(screen.getByRole('button', { name: /Save changes/ }));
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.put).mock.calls[0][1]).toMatchObject({ rsvpScope: 'WHOLE_CELEBRATION', checkInScope: 'ONCE' });
  });

  it('blocks a default companion count above the maximum', async () => {
    renderForm();
    fireEvent.change(screen.getByLabelText(/^Default companions/), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: /Save changes/ }));
    expect(await screen.findByText('The default cannot be more than the maximum.')).toBeInTheDocument();
    expect(api.put).not.toHaveBeenCalled();
  });
});
