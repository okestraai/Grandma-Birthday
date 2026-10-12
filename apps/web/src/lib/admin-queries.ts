import { queryOptions } from '@tanstack/react-query';
import type {
  AdminAlbum,
  AdminCelebrant,
  AdminCelebration,
  AdminEvent,
  AdminFamilyTree,
  AdminGuestListItem,
  AdminMedia,
  AdminRsvpQuestion,
  AdminSettings,
  AdminTestimonial,
  AdminTimelineEntry,
  AdminUser,
  AuditLogEntry,
  CapacityAllocations,
  CheckInOverview,
  CheckInRecord,
  DashboardStats,
  GuestCategory,
  GuestCheckInFilter,
  GuestRsvpFilter,
  InvitationStatus,
  MediaModerationStats,
  Paginated,
  ProgrammeItem,
  StorageDetail,
  TestimonialCounts,
  TestimonialFilter,
} from '@birthday/types';
import { api } from './api';
import { adminKeys } from './admin-api';

/**
 * Key and fetcher for every admin query a page issues when it opens. Pages use these with their
 * own per-render options (placeholderData, refetchInterval, enabled); the admin preloader
 * (pages/admin/chunks.ts) uses the same ones, so a preloaded answer is the one the page asks for.
 * Keep this module free of React components: main.tsx loads it on every admin URL.
 */

export const dashboardQuery = queryOptions({
  queryKey: adminKeys.dashboard,
  queryFn: () => api.get<DashboardStats>('/admin/dashboard'),
});

export const celebrationQuery = queryOptions({
  queryKey: adminKeys.celebration,
  queryFn: () => api.get<AdminCelebration>('/admin/celebration'),
});

export const allocationsQuery = queryOptions({
  queryKey: adminKeys.allocations,
  queryFn: ({ signal }) => api.get<CapacityAllocations>('/admin/celebration/allocations', undefined, signal),
});

/** Every event, public or not, in display order. */
export const eventsQuery = queryOptions({
  queryKey: adminKeys.events,
  queryFn: ({ signal }) => api.get<AdminEvent[]>('/admin/events', undefined, signal),
  select: sortEvents,
});

/** Events in the order the admin set (sortOrder, then start). */
export function sortEvents(events: AdminEvent[]): AdminEvent[] {
  return events.slice().sort((a, b) => a.sortOrder - b.sortOrder || a.startsAt.localeCompare(b.startsAt));
}

/**
 * The event the programme page shows: the one in the URL when it exists, otherwise the first.
 * Shared by the page and the preload so both ask for the same programme.
 */
export function programmeEventId(events: AdminEvent[] | undefined, param: string | null): string | null {
  if (!events || events.length === 0) return null;
  if (param && events.some((e) => e.id === param)) return param;
  return sortEvents(events)[0]!.id;
}

export const settingsQuery = queryOptions({
  queryKey: adminKeys.settings,
  queryFn: () => api.get<AdminSettings>('/admin/settings'),
});

export const celebrantQuery = queryOptions({
  queryKey: adminKeys.celebrant,
  queryFn: () => api.get<AdminCelebrant>('/admin/celebrant'),
});

export const timelineQuery = queryOptions({
  queryKey: adminKeys.timeline,
  queryFn: () => api.get<AdminTimelineEntry[]>('/admin/timeline'),
});

export const familyQuery = queryOptions({
  queryKey: adminKeys.family,
  queryFn: () => api.get<AdminFamilyTree>('/admin/family'),
});

/** One event's programme items. `eventId` is undefined until an event is chosen. */
export const programmeQuery = (eventId: string | undefined) =>
  queryOptions({
    queryKey: adminKeys.programmeList(eventId ?? ''),
    queryFn: ({ signal }) => api.get<ProgrammeItem[]>(`/admin/events/${eventId}/programme`, undefined, signal),
  });

export const albumsQuery = queryOptions({
  queryKey: adminKeys.albums,
  queryFn: () => api.get<AdminAlbum[]>('/admin/albums'),
});

export const mediaStatsQuery = queryOptions({
  queryKey: adminKeys.mediaStats,
  queryFn: () => api.get<MediaModerationStats>('/admin/media/stats'),
});

type MediaListParams = Record<string, string | number | boolean | undefined>;

export const mediaListQuery = (params: MediaListParams) =>
  queryOptions({
    queryKey: adminKeys.mediaList(params),
    queryFn: () => api.get<Paginated<AdminMedia>>('/admin/media', params),
  });

/** The media library's filters when it opens (kept in component state, not the URL). */
export const DEFAULT_MEDIA_PARAMS = {
  status: '',
  source: '',
  kind: '',
  albumId: '',
  q: '',
  sort: 'newest',
  page: 1,
  pageSize: 24,
} as const;

/** The guest photo queue when it opens: pending uploads, newest first. */
export const DEFAULT_GUEST_PHOTO_PARAMS = { source: 'GUEST_UPLOAD', status: 'PENDING', page: 1, pageSize: 25, sort: 'newest' } as const;

const ALBUM_PAGE_SIZE = 100;

/** Every item in an album, in display order (fetches further pages when there are more than 100). */
async function fetchAlbumMedia(albumId: string): Promise<AdminMedia[]> {
  const query = { albumId, sort: 'order', pageSize: ALBUM_PAGE_SIZE };
  const first = await api.get<Paginated<AdminMedia>>('/admin/media', { ...query, page: 1 });
  if (first.totalPages <= 1) return first.items;
  const rest = await Promise.all(
    Array.from({ length: first.totalPages - 1 }, (_, i) => api.get<Paginated<AdminMedia>>('/admin/media', { ...query, page: i + 2 })),
  );
  return [first, ...rest].flatMap((p) => p.items);
}

/** Albums in the order the gallery lists them. */
export function sortAlbums(albums: AdminAlbum[]): AdminAlbum[] {
  return albums.slice().sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * The album the gallery shows: the one in the URL when it exists, otherwise the first album.
 * Shared by the page and the preload so both ask for the same album's media.
 */
export function galleryAlbumId(albums: AdminAlbum[] | undefined, param: string | null): string | null {
  if (!albums || albums.length === 0) return null;
  if (param && albums.some((a) => a.id === param)) return param;
  return sortAlbums(albums)[0]!.id;
}

/** The gallery's media for one album. `albumId` is undefined until an album is chosen. */
export const albumMediaQuery = (albumId: string | undefined) =>
  queryOptions({
    queryKey: adminKeys.mediaList({ gallery: true, albumId }),
    queryFn: () => fetchAlbumMedia(albumId!),
  });

export const storageQuery = queryOptions({
  queryKey: adminKeys.storage,
  queryFn: () => api.get<StorageDetail>('/admin/storage'),
});

export const TESTIMONIAL_FILTERS: readonly TestimonialFilter[] = ['all', 'pending', 'approved', 'rejected', 'featured', 'public'];

/** The testimonial list request for the page's URL (filter, q, page) and page size. */
export function testimonialListParams(search: URLSearchParams, pageSize = 25) {
  const filterParam = search.get('filter');
  const filter: TestimonialFilter = TESTIMONIAL_FILTERS.includes(filterParam as TestimonialFilter) ? (filterParam as TestimonialFilter) : 'all';
  const q = search.get('q') ?? '';
  const page = Math.max(1, Number(search.get('page')) || 1);
  return { filter, q, page, pageSize };
}

export const testimonialListQuery = (params: ReturnType<typeof testimonialListParams>) =>
  queryOptions({
    queryKey: adminKeys.testimonialList(params),
    queryFn: ({ signal }) => api.get<Paginated<AdminTestimonial>>('/admin/testimonials', params, signal),
  });

export const testimonialCountsQuery = queryOptions({
  queryKey: adminKeys.testimonialCounts,
  queryFn: ({ signal }) => api.get<TestimonialCounts>('/admin/testimonials/counts', undefined, signal),
});

/** Assumed values for the guests `sort` query parameter (the contract lists `sort=` without values). */
export const GUEST_SORTS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'name', label: 'Name A–Z' },
  { value: '-name', label: 'Name Z–A' },
] as const;

export const GUEST_PAGE_SIZES = [25, 50, 100];

function pick<T extends string>(value: string | null, allowed: readonly T[]): T | '' {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : '';
}

/** The guest list request for the page's URL: filters, sort, page and page size. */
export function guestListParams(search: URLSearchParams) {
  const pageSizeParam = Number(search.get('pageSize'));
  return {
    q: search.get('q') ?? '',
    categoryId: search.get('categoryId') ?? '',
    eventId: search.get('eventId') ?? '',
    rsvp: pick<GuestRsvpFilter>(search.get('rsvp'), ['ATTENDING', 'DECLINED', 'NONE']),
    checkIn: pick<GuestCheckInFilter>(search.get('checkIn'), ['IN', 'OUT']),
    from: search.get('from') ?? '',
    to: search.get('to') ?? '',
    sort: pick(search.get('sort'), GUEST_SORTS.map((s) => s.value)) || 'newest',
    page: Math.max(1, Number(search.get('page')) || 1),
    pageSize: GUEST_PAGE_SIZES.includes(pageSizeParam) ? pageSizeParam : 25,
  };
}

export const guestListQuery = (params: ReturnType<typeof guestListParams>) =>
  queryOptions({
    queryKey: adminKeys.guestList(params),
    queryFn: ({ signal }) => api.get<Paginated<AdminGuestListItem>>('/admin/guests', params, signal),
  });

export const categoriesQuery = queryOptions({
  queryKey: adminKeys.categories,
  queryFn: ({ signal }) => api.get<GuestCategory[]>('/admin/guest-categories', undefined, signal),
  staleTime: 60_000,
});

export const questionsQuery = queryOptions({
  queryKey: adminKeys.questions,
  queryFn: ({ signal }) => api.get<AdminRsvpQuestion[]>('/admin/rsvp-questions', undefined, signal),
});

export interface InvitationListParams {
  status: InvitationStatus | undefined;
  q: string;
  page: number;
  pageSize: number;
}

/** The invitations list when the page opens (filters live in component state). */
export const DEFAULT_INVITATION_PARAMS: InvitationListParams = { status: undefined, q: '', page: 1, pageSize: 25 };

export const invitationListQuery = (params: InvitationListParams) =>
  queryOptions({
    queryKey: adminKeys.invitationList({ ...params }),
    queryFn: ({ signal }) => api.get<Paginated<AdminGuestListItem>>('/admin/invitations', { ...params }, signal),
  });

/** Counts and recent check-ins for one event; without eventId, for the event the server picks. */
export const checkinOverviewQuery = (eventId?: string | null) =>
  queryOptions({
    queryKey: adminKeys.checkinOverviewFor(eventId ?? null),
    queryFn: ({ signal }) => api.get<CheckInOverview>('/checkin/recent', eventId ? { eventId } : undefined, signal),
  });

export interface CheckinListParams {
  page: number;
  pageSize: number;
  includeReversed: boolean;
}

/** The check-in log under the invitations list when it first shows. */
export const DEFAULT_CHECKIN_LIST_PARAMS: CheckinListParams = { page: 1, pageSize: 25, includeReversed: true };

export const checkinListQuery = (params: CheckinListParams) =>
  queryOptions({
    queryKey: adminKeys.checkinList({ ...params }),
    queryFn: ({ signal }) => api.get<Paginated<CheckInRecord>>('/admin/checkins', { ...params }, signal),
  });

export const usersQuery = queryOptions({
  queryKey: adminKeys.users,
  queryFn: () => api.get<AdminUser[]>('/admin/users'),
});

export const AUDIT_PAGE_SIZES = [25, 50, 100];

/** The audit log request for the page's URL: action, entity type, actor, page and page size. */
export function auditParams(search: URLSearchParams) {
  const pageSizeParam = Number(search.get('pageSize'));
  return {
    action: search.get('action') ?? '',
    entityType: search.get('entityType') ?? '',
    actorId: search.get('actorId') ?? '',
    page: Math.max(1, Number(search.get('page')) || 1),
    pageSize: AUDIT_PAGE_SIZES.includes(pageSizeParam) ? pageSizeParam : 50,
  };
}

export const auditQuery = (params: ReturnType<typeof auditParams>) =>
  queryOptions({
    queryKey: adminKeys.audit(params),
    queryFn: ({ signal }) => api.get<Paginated<AuditLogEntry>>('/admin/audit-logs', params, signal),
  });
