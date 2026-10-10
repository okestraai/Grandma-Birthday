import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { MotionGlobalConfig } from 'motion/react';
import type { RsvpFormConfig, RsvpInvitePrefill, SiteOverview, SubmitRsvpResult } from '@birthday/types';
import RsvpPage from './RsvpPage';

MotionGlobalConfig.skipAnimations = true;

const site = {
  event: {
    name: 'A 70th Birthday Celebration',
    tagline: null,
    description: null,
    startsAt: '2026-11-21T16:00:00.000Z',
    endsAt: '2026-11-21T22:00:00.000Z',
    timezone: 'Africa/Lagos',
    venueName: 'The Grand Hall',
    address: '1 Marina Road',
    city: 'Lagos',
    mapUrl: null,
    latitude: null,
    longitude: null,
    theme: null,
    dressCode: null,
    parkingInfo: null,
    contactName: 'Chidi',
    contactEmail: 'family@example.com',
    contactPhone: null,
    rsvp: { open: true, mode: 'OPEN', deadline: null, closedReason: null },
  },
  celebrant: { fullName: 'Margaret Okonkwo', preferredName: 'Margaret', honorific: 'Dr.' },
  branding: { siteTitle: null },
} as unknown as SiteOverview;

function formConfig(overrides: Partial<RsvpFormConfig> = {}): RsvpFormConfig {
  return {
    availability: { open: true, mode: 'OPEN', deadline: null, closedReason: null },
    allowCompanions: true,
    maxCompanions: 3,
    categories: [],
    tributes: { open: true, requireApproval: true },
    questions: [],
    ...overrides,
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function mockApi({ config, invite, submit }: { config: RsvpFormConfig; invite?: RsvpInvitePrefill; submit?: SubmitRsvpResult }) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.endsWith('/api/site')) return json(site);
    if (url.endsWith('/api/rsvp/form')) return json(config);
    if (url.includes('/api/rsvp/invite/')) return invite ? json(invite) : json({ code: 'INVITATION_NOT_FOUND', message: 'Not found' }, 404);
    if (url.endsWith('/api/rsvp') && init?.method === 'POST') return json(submit);
    return json({ code: 'NOT_FOUND', message: 'Not found' }, 404);
  });
}

function renderPage(path = '/rsvp') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <RsvpPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function fillDetails(user: ReturnType<typeof userEvent.setup>, email = 'ada@example.com') {
  await user.type(await screen.findByLabelText(/Full name/), 'Ada Obi');
  await user.type(screen.getByLabelText(/Email address/), email);
}

afterEach(() => vi.restoreAllMocks());

describe('RsvpPage', () => {
  it('does not advance from step 1 with an invalid email', async () => {
    mockApi({ config: formConfig() });
    const user = userEvent.setup();
    renderPage();
    await fillDetails(user, 'not-an-email');
    await user.click(screen.getByRole('button', { name: /Continue/ }));

    expect(await screen.findByText('Please enter a valid email address.')).toBeInTheDocument();
    expect(screen.getByText('Step 1 of 4')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Your details' })).toBeInTheDocument();
  });

  it('limits accompanying guests to the category default', async () => {
    mockApi({
      config: formConfig({ categories: [{ id: 'friends', name: 'Friends', description: null, defaultCompanions: 2, full: false }], maxCompanions: 3 }),
    });
    const user = userEvent.setup();
    renderPage();
    await fillDetails(user);
    await user.selectOptions(screen.getByLabelText(/How do you know the family/), 'friends');
    await user.click(screen.getByRole('button', { name: /Continue/ }));

    await screen.findByRole('heading', { name: 'Will you join us?' });
    await user.click(screen.getByRole('radio', { name: /Joyfully accepts/ }));
    const add = await screen.findByRole('button', { name: 'Add a guest' });
    await user.click(add);
    await user.click(add);

    expect(add).toBeDisabled();
    expect(screen.getAllByLabelText(/Full name/)).toHaveLength(2);
    expect(screen.getByText(/up to 2 guests/)).toBeInTheDocument();
  });

  it('respects the allowance on a personal invitation', async () => {
    mockApi({
      config: formConfig({ categories: [{ id: 'friends', name: 'Friends', description: null, defaultCompanions: 3, full: false }] }),
      invite: {
        fullName: 'Ada Obi',
        email: 'ada@example.com',
        phone: null,
        categoryName: 'Family',
        allowedCompanions: 1,
        existing: null,
      },
    });
    const user = userEvent.setup();
    renderPage('/rsvp?invite=tok-123');

    expect(await screen.findByText(/You are invited as/)).toHaveTextContent('You are invited as Family');
    const email = screen.getByLabelText(/Email address/);
    expect(email).toHaveValue('ada@example.com');
    expect(email).toHaveAttribute('readonly');
    expect(screen.queryByLabelText(/How do you know the family/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Continue/ }));
    await user.click(await screen.findByRole('radio', { name: /Joyfully accepts/ }));
    const add = await screen.findByRole('button', { name: 'Add a guest' });
    await user.click(add);
    expect(add).toBeDisabled();
    expect(screen.getAllByLabelText(/Full name/)).toHaveLength(1);
  });

  it('shows why replies are closed', async () => {
    mockApi({
      config: formConfig({ availability: { open: false, mode: 'OPEN', deadline: '2026-11-01T12:00:00.000Z', closedReason: 'DEADLINE_PASSED' } }),
    });
    renderPage();
    expect(await screen.findByRole('heading', { name: 'The reply date has passed' })).toBeInTheDocument();
    expect(screen.getByText(/Replies closed on Sunday, 1 November 2026/)).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'RSVP' })).not.toBeInTheDocument();
  });

  it('explains invitation-only replies when there is no invite link', async () => {
    mockApi({ config: formConfig({ availability: { open: true, mode: 'INVITE_ONLY', deadline: null, closedReason: null } }) });
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Replies are by personal invitation' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'family@example.com' })).toHaveAttribute('href', 'mailto:family@example.com');
  });

  it('submits and shows the guest list confirmation', async () => {
    const fetchMock = mockApi({
      config: formConfig(),
      submit: {
        response: 'ATTENDING',
        invitationToken: 'inv-token',
        invitationCode: 'AB12CD',
        guestName: 'Ada Obi',
        tributeStatus: null,
        companionCount: 0,
        emailSent: true,
      },
    });
    const user = userEvent.setup();
    renderPage();
    await fillDetails(user);
    await user.click(screen.getByRole('button', { name: /Continue/ }));
    await user.click(await screen.findByRole('radio', { name: /Joyfully accepts/ }));
    await user.click(screen.getByRole('button', { name: /Continue/ }));
    await screen.findByRole('heading', { name: 'Your preferences' });
    await user.click(screen.getByRole('button', { name: /Continue/ }));
    await screen.findByRole('heading', { name: 'Please review your reply' });
    await user.click(screen.getByRole('button', { name: 'Confirm my attendance' }));

    expect(await screen.findByRole('heading', { name: "You're on the guest list." })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View Digital Invitation' })).toHaveAttribute('href', '/invitation/inv-token');
    expect(screen.getByText('AB12CD')).toBeInTheDocument();

    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({
      fullName: 'Ada Obi',
      email: 'ada@example.com',
      response: 'ATTENDING',
      companions: [],
    });
    await waitFor(() => expect(screen.getByRole('heading', { name: "You're on the guest list." })).toHaveFocus());
  });
  it('keeps the answers and says so when the server cannot be reached', async () => {
    const fetchMock = mockApi({ config: formConfig() });
    const user = userEvent.setup();
    renderPage();
    await fillDetails(user);
    await user.click(screen.getByRole('button', { name: /Continue/ }));
    await user.click(await screen.findByRole('radio', { name: /Joyfully accepts/ }));
    await user.click(screen.getByRole('button', { name: /Continue/ }));
    await screen.findByRole('heading', { name: 'Your preferences' });
    await user.click(screen.getByRole('button', { name: /Continue/ }));
    await screen.findByRole('heading', { name: 'Please review your reply' });
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await user.click(screen.getByRole('button', { name: 'Confirm my attendance' }));

    expect(await screen.findByText(/We couldn’t reach the server. Your answers are still here/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Please review your reply' })).toBeInTheDocument();
    expect(screen.getByText('Ada Obi')).toBeInTheDocument();
    expect(screen.getByText('ada@example.com')).toBeInTheDocument();
  });

  it('shows full categories as disabled', async () => {
    mockApi({
      config: formConfig({
        categories: [
          { id: 'family', name: 'Family', description: null, defaultCompanions: 2, full: true },
          { id: 'friends', name: 'Friends', description: null, defaultCompanions: 1, full: false },
        ],
      }),
    });
    renderPage();
    const select = await screen.findByLabelText(/How do you know the family/);
    expect(screen.getByRole('option', { name: 'Family (full)' })).toBeDisabled();
    expect(screen.getByRole('option', { name: 'Friends' })).toBeEnabled();
    expect(select).toHaveAccessibleDescription(/Options marked \(full\) have no places left/);
  });

  it('sends the guest back to step 1 when their category fills up', async () => {
    const config = formConfig({
      categories: [
        { id: 'family', name: 'Family', description: null, defaultCompanions: 2, full: false },
        { id: 'friends', name: 'Friends', description: null, defaultCompanions: 1, full: false },
      ],
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/api/site')) return json(site);
      if (url.endsWith('/api/rsvp/form')) return json(config);
      if (url.endsWith('/api/rsvp') && init?.method === 'POST')
        return json({ code: 'CATEGORY_CAPACITY_REACHED', message: 'We are sorry: the places set aside for Family guests are all taken.' }, 409);
      return json({ code: 'NOT_FOUND', message: 'Not found' }, 404);
    });
    const user = userEvent.setup();
    renderPage();
    await fillDetails(user);
    await user.selectOptions(screen.getByLabelText(/How do you know the family/), 'family');
    await user.click(screen.getByRole('button', { name: /Continue/ }));
    await user.click(await screen.findByRole('radio', { name: /Joyfully accepts/ }));
    await user.click(screen.getByRole('button', { name: /Continue/ }));
    await screen.findByRole('heading', { name: 'Your preferences' });
    await user.click(screen.getByRole('button', { name: /Continue/ }));
    await user.click(await screen.findByRole('button', { name: 'Confirm my attendance' }));

    expect(await screen.findByText('No places left in this group')).toBeInTheDocument();
    expect(screen.getByText(/the places set aside for Family guests are all taken/)).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Your details' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Family (full)' })).toBeDisabled();
  });
});
