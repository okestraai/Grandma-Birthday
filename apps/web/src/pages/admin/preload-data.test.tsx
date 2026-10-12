import type { ComponentType } from 'react';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { api, ApiError } from '@/lib/api';
import { adminKeys } from '@/lib/admin-api';
import { auditParams, guestListParams, testimonialListParams } from '@/lib/admin-queries';
import { adminPages, adminShell, preloadAdmin } from './chunks';
import { preloadAdminData } from './preload-data';
import GuestsPage from './GuestsPage';
import TestimonialsAdminPage from './TestimonialsAdminPage';
import AuditLogsPage from './AuditLogsPage';
import InvitationsPage from './InvitationsPage';
import MediaLibraryPage from './MediaLibraryPage';
import GuestPhotosPage from './GuestPhotosPage';
import GalleryAdminPage from './GalleryAdminPage';
import ProgrammeAdminPage from './ProgrammeAdminPage';
import EventAdminPage from './EventAdminPage';

vi.mock('@/lib/api', async (orig) => ({
  ...(await orig<typeof import('@/lib/api')>()),
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ can: () => true, user: null }) }));
vi.mock('@/components/seo/SEO', () => ({ SEO: () => null }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

const get = vi.mocked(api.get);
const empty = { items: [], total: 0, page: 1, pageSize: 25, totalPages: 0 };
const counts = { all: 0, pending: 0, approved: 0, rejected: 0, featured: 0, public: 0 };
const tally = { pending: 0, approved: 0, rejected: 0 };
const album = { id: 'a1', title: 'Party', slug: 'party', description: null, isPublished: true, sortOrder: 0, mediaCount: 0, coverMediaId: null, coverMedia: null };

const ev = (id: string, sortOrder: number) => ({ id, name: id, sortOrder, startsAt: '2026-11-21T09:00:00.000Z', endsAt: '2026-11-21T12:00:00.000Z', invitedCategoryIds: [], programmeCount: 0,
  venueName: 'Hall', city: null, capacity: null, attendingGuests: 0, attendingPeople: 0, rsvpEnabled: true, isPublic: true });
const celebration = {
  name: 'Mama at 70',
  tagline: null,
  description: null,
  timezone: 'Africa/Lagos',
  startsAt: '2026-11-21T09:00:00.000Z',
  endsAt: '2026-11-21T21:00:00.000Z',
  contactName: null,
  contactEmail: null,
  contactPhone: null,
  capacity: 100,
  rsvpOpen: true,
  rsvpMode: 'OPEN',
  rsvpScope: 'PER_EVENT',
  checkInScope: 'PER_EVENT',
  rsvpDeadline: null,
  defaultCompanions: 1,
  maxCompanions: 2,
  allowCompanions: true,
  confirmedPeople: 0,
  capacityRemaining: 100,
  updatedAt: '2026-09-01T10:00:00.000Z',
};

const RESPONSES: Record<string, unknown> = {
  // Listed out of display order: the first event is the one with the lowest sortOrder.
  '/admin/events': [ev('e2', 1), ev('e1', 0)],
  '/admin/events/e1/programme': [],
  '/admin/events/e2/programme': [],
  '/admin/celebration': celebration,
  '/admin/celebration/allocations': { capacity: 100, confirmedPeople: 0, allocated: 0, unallocated: 100, categories: [], uncategorisedPeople: 0 },
  '/admin/guests': empty,
  '/admin/guest-categories': [],
  '/admin/testimonials': empty,
  '/admin/testimonials/counts': counts,
  '/admin/audit-logs': empty,
  '/admin/invitations': empty,
  '/admin/checkins': empty,
  '/admin/media': empty,
  '/admin/media/stats': { guestUploads: tally, all: tally, storage: { usedBytes: 0, limitBytes: 1, percent: 0 } },
  '/admin/albums': [album],
  '/admin/settings': {},
};

/** A client with the app's admin defaults, so a preloaded answer is fresh when the page mounts. */
function newClient() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryDefaults(['admin'], { staleTime: 10_000 });
  return client;
}

const callsTo = (path: string) => get.mock.calls.filter(([p]) => p === path);

beforeEach(() => {
  get.mockReset();
  get.mockImplementation((path: string) =>
    path in RESPONSES ? Promise.resolve(RESPONSES[path] as never) : Promise.reject(new Error(`Unexpected GET ${path}`)),
  );
  document.cookie = 'bp_csrf=token; path=/';
});

afterEach(() => {
  vi.restoreAllMocks();
  document.cookie = 'bp_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
});

describe('admin data preloading', () => {
  it('prefetches the guest list the page will ask for, from the URL', async () => {
    const client = newClient();
    await preloadAdminData(client, '/admin/guests', '?rsvp=ATTENDING&page=2');
    const params = guestListParams(new URLSearchParams('rsvp=ATTENDING&page=2'));
    expect(params).toEqual({ q: '', categoryId: '', eventId: '', rsvp: 'ATTENDING', checkIn: '', from: '', to: '', sort: 'newest', page: 2, pageSize: 25 });
    expect(client.getQueryData(adminKeys.guestList(params))).toEqual(empty);
    expect(get).toHaveBeenCalledWith('/admin/guests', params, expect.anything());
    expect(client.getQueryData(adminKeys.categories)).toEqual([]);
  });

  it('builds list params with the pages’ defaults and ignores unknown values', () => {
    const odd = new URLSearchParams('rsvp=MAYBE&sort=bogus&pageSize=7&page=-3');
    expect(guestListParams(odd)).toMatchObject({ rsvp: '', sort: 'newest', pageSize: 25, page: 1 });
    expect(testimonialListParams(new URLSearchParams('filter=nope&q=hi'))).toEqual({ filter: 'all', q: 'hi', page: 1, pageSize: 25 });
    expect(testimonialListParams(new URLSearchParams('filter=pending&page=3'), 50)).toEqual({ filter: 'pending', q: '', page: 3, pageSize: 50 });
    expect(auditParams(new URLSearchParams('action=LOGIN&pageSize=100'))).toEqual({ action: 'LOGIN', entityType: '', actorId: '', page: 1, pageSize: 100 });
    expect(auditParams(new URLSearchParams('pageSize=30')).pageSize).toBe(50);
  });

  it('requests nothing without a session cookie', async () => {
    document.cookie = 'bp_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
    const client = newClient();
    await preloadAdminData(client, '/admin/guests', '');
    expect(get).not.toHaveBeenCalled();
    expect(client.getQueryCache().getAll()).toHaveLength(0);
  });

  it('requests nothing for pages without data, such as the login page', async () => {
    const client = newClient();
    await preloadAdminData(client, '/admin/login', '');
    await preloadAdminData(client, '/admin/account', '');
    expect(get).not.toHaveBeenCalled();
  });

  it('leaves no cached error behind when a prefetch fails', async () => {
    get.mockRejectedValue(new ApiError(403, { code: 'FORBIDDEN', message: 'No' }));
    const client = newClient();
    await preloadAdminData(client, '/admin/users', '');
    expect(get).toHaveBeenCalledWith('/admin/users');
    expect(client.getQueryState(adminKeys.users)).toBeUndefined();
  });

  it('adds the sidebar counts on a full load, except on the check-in page', async () => {
    const stub = () => Promise.resolve({} as never);
    vi.spyOn(adminShell, 'layout').mockImplementation(stub);
    vi.spyOn(adminPages, 'check-in').mockImplementation(stub);
    vi.spyOn(adminPages, 'storage').mockImplementation(stub);
    const prefetch = vi.spyOn(QueryClient.prototype, 'prefetchQuery').mockResolvedValue();
    // The data preloader is its own chunk, so its calls land after that import resolves.
    preloadAdmin('/admin/check-in');
    await waitFor(() => expect(prefetch.mock.calls.map(([o]) => o.queryKey)).toEqual([adminKeys.checkinOverviewFor(null)]));
    prefetch.mockClear();
    preloadAdmin('/admin/storage');
    await waitFor(() => expect(prefetch.mock.calls.map(([o]) => o.queryKey)).toEqual([adminKeys.storage, adminKeys.mediaStats, adminKeys.testimonialCounts]));
  });
});

// Each page opened after its preload must find its first requests already answered: the
// preload and the page build the same keys and ask for the same things.
const pages: [string, ComponentType, string, string[]][] = [
  ['/admin/guests', GuestsPage, '?rsvp=ATTENDING&sort=name&page=2&pageSize=50', ['/admin/guests', '/admin/guest-categories', '/admin/events']],
  ['/admin/guests', GuestsPage, '?eventId=e2&checkIn=IN', ['/admin/guests', '/admin/guest-categories', '/admin/events']],
  ['/admin/testimonials', TestimonialsAdminPage, '?filter=pending&q=mama', ['/admin/testimonials', '/admin/testimonials/counts']],
  ['/admin/audit-logs', AuditLogsPage, '?action=LOGIN&page=3', ['/admin/audit-logs']],
  ['/admin/invitations', InvitationsPage, '', ['/admin/invitations', '/admin/checkins', '/admin/events']],
  ['/admin/event', EventAdminPage, '', ['/admin/celebration', '/admin/events', '/admin/celebration/allocations', '/admin/guest-categories']],
  ['/admin/programme', ProgrammeAdminPage, '?event=e2', ['/admin/events', '/admin/events/e2/programme', '/admin/celebration']],
  // No event, or one that no longer exists: the preload picks the first event, as the page does.
  ['/admin/programme', ProgrammeAdminPage, '', ['/admin/events', '/admin/events/e1/programme', '/admin/celebration']],
  ['/admin/programme', ProgrammeAdminPage, '?event=gone', ['/admin/events', '/admin/events/e1/programme', '/admin/celebration']],
  ['/admin/media', MediaLibraryPage, '', ['/admin/media', '/admin/albums', '/admin/settings']],
  ['/admin/guest-photos', GuestPhotosPage, '', ['/admin/media', '/admin/media/stats']],
  ['/admin/gallery', GalleryAdminPage, '?album=a1', ['/admin/media', '/admin/albums', '/admin/settings']],
  // No album, or one that no longer exists: the preload picks the first album, as the page does.
  ['/admin/gallery', GalleryAdminPage, '', ['/admin/media', '/admin/albums', '/admin/settings']],
  ['/admin/gallery', GalleryAdminPage, '?album=gone', ['/admin/media', '/admin/albums', '/admin/settings']],
];

describe.each(pages)('%s after a preload', (path, Page, search, endpoints) => {
  it('makes no second request for its first data', async () => {
    const client = newClient();
    await preloadAdminData(client, path, search);
    const preloaded = endpoints.map((e) => callsTo(e).length);
    expect(preloaded.every((n) => n === 1)).toBe(true);

    // A data router: the event page guards unsaved changes with useBlocker.
    const router = createMemoryRouter([{ path, element: <Page /> }], { initialEntries: [`${path}${search}`] });
    render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(client.isFetching()).toBe(0));
    expect(endpoints.map((e) => callsTo(e).length)).toEqual(preloaded);
  });
});

describe('gallery preload', () => {
  it.each(['', '?album=gone'])('asks for the first album when the URL has %j', async (search) => {
    await preloadAdminData(newClient(), '/admin/gallery', search);
    expect(callsTo('/admin/media').map(([, params]) => (params as { albumId?: string }).albumId)).toEqual(['a1']);
  });
});
