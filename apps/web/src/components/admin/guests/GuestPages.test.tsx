import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import type { AdminGuestDetail, AdminGuestListItem, CheckInRecord, GuestCategory, Paginated } from '@birthday/types';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import GuestsPage from '@/pages/admin/GuestsPage';
import InvitationsPage from '@/pages/admin/InvitationsPage';
import GuestCategoriesPage from '@/pages/admin/GuestCategoriesPage';

vi.mock('@/lib/api', async (orig) => ({
  ...(await orig<typeof import('@/lib/api')>()),
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ can: () => true }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

const category: GuestCategory = {
  id: 'c1',
  name: 'Family',
  description: null,
  defaultCompanions: 3,
  selfSelectable: false,
  color: '#AA3355',
  sortOrder: 0,
  guestCount: 1,
  capacity: null,
  confirmedPeople: 2,
  full: false,
};

const guest: AdminGuestListItem = {
  id: 'g1',
  fullName: 'Ada Obi',
  email: 'ada@example.com',
  phone: null,
  categoryId: 'c1',
  categoryName: 'Family',
  allowedCompanions: 2,
  source: 'ADMIN_INVITED',
  rsvpResponse: 'ATTENDING',
  companionCount: 1,
  partySize: 2,
  invitation: { id: 'i1', code: 'ABC123', status: 'ACTIVE', lastSentAt: '2026-09-20T10:00:00.000Z' },
  checkedInAt: null,
  createdAt: '2026-09-01T10:00:00.000Z',
};

const detail: AdminGuestDetail = {
  ...guest,
  notes: null,
  rsvp: {
    response: 'ATTENDING',
    companions: [{ id: 'k1', fullName: 'Ben Obi', dietary: 'Vegetarian' }],
    dietary: null,
    accessibility: null,
    message: 'Cannot wait',
    answers: [{ questionId: 'q1', label: 'Staying overnight?', value: true }],
    submittedAt: '2026-09-02T10:00:00.000Z',
    updatedAt: '2026-09-02T10:00:00.000Z',
  },
  invitationDetail: {
    id: 'i1',
    code: 'ABC123',
    status: 'ACTIVE',
    token: 'tok',
    url: 'https://example.com/invitation/tok',
    revokedAt: null,
    revokedReason: null,
    lastSentAt: '2026-09-20T10:00:00.000Z',
    sendCount: 1,
  },
  checkIns: [],
};

const checkin: CheckInRecord = {
  id: 'r1',
  invitationId: 'i1',
  code: 'ABC123',
  guestName: 'Ada Obi',
  categoryName: 'Family',
  partySize: 2,
  checkedInAt: '2026-09-21T18:00:00.000Z',
  checkedInByName: 'Door',
  reversedAt: null,
  reversedByName: null,
  reverseReason: null,
};

function page<T>(items: T[]): Paginated<T> {
  return { items, total: items.length, page: 1, pageSize: 25, totalPages: 1 };
}

function renderAt(ui: ReactNode, path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.mocked(api.get).mockImplementation(async (path: string) => {
    if (path === '/admin/guest-categories') return [category] as never;
    if (path === '/admin/rsvp-questions') return [] as never;
    if (path === '/admin/guests/g1') return detail as never;
    if (path === '/admin/checkins') return page([checkin]) as never;
    return page([guest]) as never;
  });
});
afterEach(() => vi.clearAllMocks());

describe('GuestsPage', () => {
  it('lists guests, opens the linked drawer and builds the CSV link from the filters', async () => {
    renderAt(<GuestsPage />, '/admin/guests?guest=g1&rsvp=ATTENDING&sort=name');
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(await screen.findByText('Staying overnight?')).toBeInTheDocument();
    expect(screen.getByText('Yes')).toBeInTheDocument();
    expect(screen.getByText('https://example.com/invitation/tok')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/admin/guests', expect.objectContaining({ rsvp: 'ATTENDING', sort: 'name', page: 1, pageSize: 25 }), expect.anything());
  });

  it('shows the capacity override after EVENT_CAPACITY_REACHED and resends with overrideCapacity', async () => {
    vi.mocked(api.post)
      .mockRejectedValueOnce(new ApiError(409, { code: 'EVENT_CAPACITY_REACHED', message: 'The event is full (300 of 300).' }))
      .mockResolvedValueOnce(detail as never);
    renderAt(<GuestsPage />, '/admin/guests');
    fireEvent.click((await screen.findAllByRole('button', { name: /add guest/i }))[0]);
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/full name/i), { target: { value: 'New Person' } });
    fireEvent.change(within(dialog).getByLabelText(/^email/i), { target: { value: 'new@example.com' } });
    fireEvent.change(within(dialog).getByLabelText(/^category/i), { target: { value: 'c1' } });
    expect(within(dialog).getByLabelText(/companions allowed/i)).toHaveValue(3);
    fireEvent.click(within(dialog).getByRole('button', { name: /add and send invitation/i }));

    expect(await within(dialog).findByText('The event is full (300 of 300).')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /override capacity/i }));
    fireEvent.click(within(dialog).getByRole('button', { name: /add and send invitation/i }));
    await waitFor(() => expect(api.post).toHaveBeenLastCalledWith('/admin/guests', expect.objectContaining({ overrideCapacity: true, allowedCompanions: 3, categoryId: 'c1' })));
  });
});

describe('InvitationsPage', () => {
  it('renders invitations and the check-in log with a reverse action', async () => {
    renderAt(<InvitationsPage />, '/admin/invitations');
    expect(await screen.findAllByText('ABC123')).not.toHaveLength(0);
    expect(await screen.findAllByRole('button', { name: /reverse check-in/i })).not.toHaveLength(0);
    expect(api.get).toHaveBeenCalledWith('/admin/checkins', expect.objectContaining({ includeReversed: true }), expect.anything());
  });

  it('shows when each invitation was sent and explains how invitations go out', async () => {
    renderAt(<InvitationsPage />, '/admin/invitations');
    expect(await screen.findByText('How invitations are sent')).toBeInTheDocument();
    expect((await screen.findAllByText(/^Sent 20 Sept? 2026$/)).length).toBeGreaterThan(0);
  });

  it('sends invitations to the selected guests after confirming', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ sent: 1, skipped: 0, failed: 0, emailEnabled: true } as never);
    renderAt(<InvitationsPage />, '/admin/invitations');
    const table = await screen.findByRole('table', { name: 'Invitations' });
    fireEvent.click(await within(table).findByRole('checkbox', { name: 'Select Ada Obi' }));
    fireEvent.click(screen.getByRole('button', { name: /send to selected/i }));
    const dialog = await screen.findByRole('dialog', { name: 'Email 1 invitation?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send emails' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/admin/invitations/send', { guestIds: ['g1'] }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('1 sent')));
  });

  it('sends to everyone not yet sent and warns when email is not set up', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ sent: 4, skipped: 1, failed: 0, emailEnabled: false } as never);
    renderAt(<InvitationsPage />, '/admin/invitations');
    fireEvent.click(await screen.findByRole('button', { name: /send to everyone not yet sent/i }));
    const dialog = await screen.findByRole('dialog', { name: 'Email every invitation not sent yet?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send emails' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/admin/invitations/send', { onlyUnsent: true }));
    await waitFor(() => expect(toast.warning).toHaveBeenCalledWith(expect.stringContaining('Email is not set up on the server, so nothing was actually emailed')));
  });
});

describe('GuestCategoriesPage', () => {
  it('lists categories and switches to RSVP questions', async () => {
    renderAt(<GuestCategoriesPage />, '/admin/guest-categories');
    expect(await screen.findAllByText('Family')).not.toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: /rsvp questions/i }));
    expect(await screen.findByText('No extra questions')).toBeInTheDocument();
  });

  it('still renders when the API leaves out the capacity numbers (older API build)', async () => {
    const { capacity: _c, confirmedPeople: _p, ...partial } = category;
    vi.mocked(api.get).mockImplementation(async (path: string) =>
      path === '/admin/guest-categories' ? ([partial] as never) : ([] as never),
    );
    renderAt(<GuestCategoriesPage />, '/admin/guest-categories');
    expect(await screen.findAllByText('Family')).not.toHaveLength(0);
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
  });
});
