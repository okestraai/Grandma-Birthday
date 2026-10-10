import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import type { CapacityAllocations } from '@birthday/types';
import { api, ApiError } from '@/lib/api';
import { CategoryAllocations } from './CategoryAllocations';
import { parsePlaces } from './allocations';

vi.mock('@/lib/api', async (orig) => ({
  ...(await orig<typeof import('@/lib/api')>()),
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const data: CapacityAllocations = {
  capacity: 100,
  confirmedPeople: 30,
  allocated: 40,
  unallocated: 60,
  uncategorisedPeople: 5,
  categories: [
    { categoryId: 'c1', name: 'Family', color: '#AA3355', capacity: 40, confirmedPeople: 20, remaining: 20, guestCount: 12 },
    { categoryId: 'c2', name: 'Church', color: null, capacity: null, confirmedPeople: 5, remaining: null, guestCount: 4 },
  ],
};

// The first test in this file pays for a cold first render and a cold first role query: about 100 ms
// idle, 300 ms in the full suite and past findBy*'s default 1 s (and at worst the 5 s test timeout) when
// the CPU is contended. Give the initial load, and each test, room for that one-off cost.
const LOAD = { timeout: 10_000 };
const TEST_TIMEOUT = 15_000;

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <CategoryAllocations />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.mocked(api.get).mockResolvedValue(data as never);
});
afterEach(() => vi.clearAllMocks());

describe('parsePlaces', () => {
  it('treats blank as no limit and rejects non-integers', () => {
    expect(parsePlaces('')).toBeNull();
    expect(parsePlaces(' 12 ')).toBe(12);
    expect(parsePlaces('1.5')).toBeUndefined();
    expect(parsePlaces('-3')).toBeUndefined();
  });
});

// The first test also pays for a cold load, so the whole suite gets a longer timeout.
describe('CategoryAllocations', () => {
  it('shows the summary and blocks saving when the total is over capacity', async () => {
    renderPanel();
    const family = await screen.findByRole('spinbutton', { name: 'Places set aside for Family' }, LOAD);
    // The saved places reach the inputs in an effect, one render after the data: wait for them.
    await waitFor(() => expect(family).toHaveValue(40), LOAD);
    expect(screen.getByText(/not allocated/)).toHaveTextContent('Allocated 40 of 100 seats · 60 not allocated · 5 people coming with no category');
    expect(screen.getByText('12 invitations')).toBeInTheDocument();
    expect(screen.getByText('20 seats left')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'People coming' })).toBeInTheDocument();

    fireEvent.change(family, { target: { value: '70' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Places set aside for Church' }), { target: { value: '40' } });

    expect(screen.getByRole('alert')).toHaveTextContent('The categories add up to 110 seats, 10 more than the event capacity of 100.');
    const save = screen.getByRole('button', { name: 'Save places' });
    expect(save).toBeDisabled();
    fireEvent.click(save);
    expect(api.put).not.toHaveBeenCalled();
  });

  it('will not go below the people already coming in a category', async () => {
    renderPanel();
    fireEvent.change(await screen.findByRole('spinbutton', { name: 'Places set aside for Family' }, LOAD), { target: { value: '10' } });
    expect(screen.getByText(/20 people are already coming; allow at least 20/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save places' })).toBeDisabled();
  });

  it('sends every category, with blank as null', async () => {
    vi.mocked(api.put).mockResolvedValueOnce({ ...data, allocated: 50, unallocated: 50 } as never);
    renderPanel();
    fireEvent.change(await screen.findByRole('spinbutton', { name: 'Places set aside for Family' }, LOAD), { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save places' }));
    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith('/admin/event/allocations', {
        allocations: [
          { categoryId: 'c1', capacity: 50 },
          { categoryId: 'c2', capacity: null },
        ],
      }),
    );
  });

  it('saves on Enter without submitting a surrounding form', async () => {
    vi.mocked(api.put).mockResolvedValueOnce(data as never);
    const onSubmit = vi.fn((e: { preventDefault: () => void }) => e.preventDefault());
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <form onSubmit={onSubmit}>
            <CategoryAllocations />
          </form>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const family = await screen.findByRole('spinbutton', { name: 'Places set aside for Family' }, LOAD);
    fireEvent.change(family, { target: { value: '45' } });
    fireEvent.keyDown(family, { key: 'Enter' });
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows the server message on a category row', async () => {
    vi.mocked(api.put).mockRejectedValueOnce(
      new ApiError(400, { code: 'VALIDATION_FAILED', message: 'Invalid', details: { 'allocations.1.capacity': ['7 Church guests are already confirmed; allow at least 7.'] } }),
    );
    renderPanel();
    fireEvent.change(await screen.findByRole('spinbutton', { name: 'Places set aside for Church' }, LOAD), { target: { value: '6' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save places' }));
    expect(await screen.findByText('7 Church guests are already confirmed; allow at least 7.')).toBeInTheDocument();
  });

  it('Reset puts back the saved values', async () => {
    renderPanel();
    const family = await screen.findByRole('spinbutton', { name: 'Places set aside for Family' }, LOAD);
    fireEvent.change(family, { target: { value: '55' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(family).toHaveValue(40);
  });
}, TEST_TIMEOUT);
