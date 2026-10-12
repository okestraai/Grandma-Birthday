import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import type { CheckInEventCount, CheckInOverview, CheckInVerifyResult } from '@birthday/types';
import { api } from '@/lib/api';
import { CHECKIN_EVENT_KEY } from '@/components/admin/checkin/EventPicker';
import CheckInPage from './CheckInPage';

vi.mock('@/lib/api', async (orig) => ({
  ...(await orig<typeof import('@/lib/api')>()),
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));
vi.mock('@/components/seo/SEO', () => ({ SEO: () => null }));
vi.mock('@/components/admin/checkin/QrScannerView', () => ({ QrScannerView: () => <div>Camera</div> }));

const count = (eventId: string, name: string, checkedInPeople: number, expectedPeople: number): CheckInEventCount => ({
  eventId,
  name,
  startsAt: '2026-11-21T09:00:00.000Z',
  endsAt: '2026-11-21T12:00:00.000Z',
  checkedInGuests: checkedInPeople,
  checkedInPeople,
  expectedPeople,
});

const EVENTS = [count('e1', 'Thanksgiving Service', 12, 80), count('e2', 'Birthday Dinner', 3, 150), count('e3', 'Family Brunch', 0, 40)];

function overview(eventId: string, events = EVENTS, checkInScope: CheckInOverview['checkInScope'] = 'PER_EVENT'): CheckInOverview {
  const e = events.find((x) => x.eventId === eventId)!;
  return { checkInScope, eventId, eventName: e.name, checkedInGuests: e.checkedInGuests, checkedInPeople: e.checkedInPeople, expectedPeople: e.expectedPeople, recent: [], events };
}

const get = vi.mocked(api.get);
const post = vi.mocked(api.post);

function mockApi(serverDefault: string, events = EVENTS, scope: CheckInOverview['checkInScope'] = 'PER_EVENT') {
  get.mockImplementation(async (path: string, query?: Record<string, unknown>) => {
    if (path === '/checkin/recent') return overview((query?.eventId as string | undefined) ?? serverDefault, events, scope) as never;
    throw new Error(`Unexpected GET ${path}`);
  });
  post.mockImplementation(async (_path: string, body?: unknown) => {
    const { eventId } = body as { eventId?: string };
    const event = events.find((e) => e.eventId === eventId) ?? events[0]!;
    return { status: 'INVALID', event: { id: event.eventId, name: event.name }, guest: null, checkIn: null } satisfies CheckInVerifyResult as never;
  });
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <CheckInPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** The "12 / 80 people" counts (shown twice: above the scanner on phones, beside it on wide screens). */
const counts = (expected: number) =>
  screen.findAllByText((_, el) => el?.tagName === 'P' && new RegExp(`/ ${expected} people`).test(el.textContent ?? ''));

const picker = () => screen.findByRole('group', { name: 'Event to check in to' });
const pressed = (group: HTMLElement) => within(group).getByRole('button', { pressed: true });

async function verifyCode(code: string) {
  fireEvent.click(screen.getByRole('tab', { name: /enter code/i }));
  fireEvent.change(screen.getByLabelText('Invitation code'), { target: { value: code } });
  fireEvent.click(screen.getByRole('button', { name: 'Verify code' }));
}

beforeEach(() => window.sessionStorage.clear());
afterEach(() => vi.clearAllMocks());

describe('CheckInPage event picker', () => {
  it('starts on the event the server picks and sends it with each verify', async () => {
    mockApi('e2');
    renderPage();
    expect(pressed(await picker())).toHaveTextContent('Birthday Dinner');
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith('/checkin/recent', undefined, expect.anything());
    // The other events, with their counts.
    expect(await screen.findByRole('button', { name: 'Switch to Thanksgiving Service: 12 of 80 people checked in' })).toBeInTheDocument();

    await verifyCode('ABC123');
    await waitFor(() => expect(post).toHaveBeenCalledWith('/checkin/verify', { value: 'ABC123', eventId: 'e2' }));
  });

  it('starts on the event chosen earlier in this tab when it still exists', async () => {
    window.sessionStorage.setItem(CHECKIN_EVENT_KEY, 'e3');
    mockApi('e1');
    renderPage();
    const group = await picker();
    await waitFor(() => expect(pressed(group)).toHaveTextContent('Family Brunch'));
    await waitFor(() => expect(get).toHaveBeenCalledWith('/checkin/recent', { eventId: 'e3' }, expect.anything()));
    expect((await counts(40)).length).toBeGreaterThan(0);
  });

  it('ignores a remembered event that no longer exists', async () => {
    window.sessionStorage.setItem(CHECKIN_EVENT_KEY, 'gone');
    mockApi('e1');
    renderPage();
    expect(pressed(await picker())).toHaveTextContent('Thanksgiving Service');
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('remembers a new choice and sends its eventId', async () => {
    mockApi('e1');
    renderPage();
    fireEvent.click(within(await picker()).getByRole('button', { name: 'Birthday Dinner' }));
    expect(window.sessionStorage.getItem(CHECKIN_EVENT_KEY)).toBe('e2');
    await waitFor(() => expect(get).toHaveBeenCalledWith('/checkin/recent', { eventId: 'e2' }, expect.anything()));

    await verifyCode('XYZ789');
    await waitFor(() => expect(post).toHaveBeenCalledWith('/checkin/verify', { value: 'XYZ789', eventId: 'e2' }));
  });

  it('shows no picker when there is one event', async () => {
    mockApi('e1', [EVENTS[0]!]);
    renderPage();
    expect((await counts(80)).length).toBeGreaterThan(0);
    expect(screen.queryByRole('group', { name: 'Event to check in to' })).not.toBeInTheDocument();
    expect(screen.queryByText('Other events')).not.toBeInTheDocument();
  });

  it('hides the picker and ignores a remembered event when guests are checked in once for the celebration', async () => {
    window.sessionStorage.setItem(CHECKIN_EVENT_KEY, 'e3');
    mockApi('e1', EVENTS, 'ONCE');
    renderPage();
    expect(await counts(80)).not.toHaveLength(0);
    expect(screen.queryByRole('group', { name: 'Event to check in to' })).not.toBeInTheDocument();
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith('/checkin/recent', undefined, expect.anything());
  });
});
