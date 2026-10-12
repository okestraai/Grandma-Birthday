import type { FetchQueryOptions, QueryClient } from '@tanstack/react-query';
import { readCookie } from '@/lib/api';
import { queryClient } from '@/lib/query';
import {
  DEFAULT_CHECKIN_LIST_PARAMS,
  DEFAULT_GUEST_PHOTO_PARAMS,
  DEFAULT_INVITATION_PARAMS,
  DEFAULT_MEDIA_PARAMS,
  albumMediaQuery,
  albumsQuery,
  galleryAlbumId,
  allocationsQuery,
  auditParams,
  auditQuery,
  categoriesQuery,
  celebrantQuery,
  checkinListQuery,
  checkinOverviewQuery,
  dashboardQuery,
  celebrationQuery,
  eventsQuery,
  familyQuery,
  guestListParams,
  guestListQuery,
  invitationListQuery,
  mediaListQuery,
  mediaStatsQuery,
  programmeEventId,
  programmeQuery,
  questionsQuery,
  settingsQuery,
  storageQuery,
  testimonialCountsQuery,
  testimonialListParams,
  testimonialListQuery,
  timelineQuery,
  usersQuery,
} from '@/lib/admin-queries';
import type { adminPages } from './chunks';
import { sectionOf } from './chunks';

export { queryClient };

// Any of the factories in admin-queries; each carries its own data type.
type AnyQuery = FetchQueryOptions<any, any, any, any>;

/**
 * The queries each admin page issues as it opens, keyed like `adminPages`. Pages that pick an
 * upload limit or album (a media field, an upload dialog) also read albums and settings.
 * Detail drawers and search results are left to the page.
 */
const pageData: Partial<Record<keyof typeof adminPages, (search: URLSearchParams) => AnyQuery[]>> = {
  '': () => [dashboardQuery],
  celebrant: () => [celebrantQuery, albumsQuery, settingsQuery],
  timeline: () => [timelineQuery],
  family: () => [familyQuery],
  // The album's media follows once albums arrive; see `thenData`.
  gallery: () => [albumsQuery, settingsQuery],
  albums: () => [albumsQuery, settingsQuery],
  media: () => [albumsQuery, settingsQuery, mediaListQuery({ ...DEFAULT_MEDIA_PARAMS })],
  'guest-photos': () => [mediaStatsQuery, mediaListQuery({ ...DEFAULT_GUEST_PHOTO_PARAMS })],
  testimonials: (search) => [testimonialListQuery(testimonialListParams(search)), testimonialCountsQuery],
  guests: (search) => [categoriesQuery, eventsQuery, guestListQuery(guestListParams(search))],
  'guest-categories': () => [categoriesQuery, questionsQuery],
  invitations: () => [invitationListQuery(DEFAULT_INVITATION_PARAMS), checkinListQuery(DEFAULT_CHECKIN_LIST_PARAMS), eventsQuery],
  // Without an eventId: the page first asks which event the server picks, then follows the saved choice.
  'check-in': () => [checkinOverviewQuery()],
  event: () => [celebrationQuery, eventsQuery, allocationsQuery, categoriesQuery],
  // The event's programme follows once events arrive; see `thenData`.
  programme: () => [eventsQuery, celebrationQuery],
  storage: () => [storageQuery],
  users: () => [usersQuery],
  'audit-logs': (search) => [auditQuery(auditParams(search))],
  settings: () => [settingsQuery, albumsQuery],
};

/**
 * Requests that depend on an earlier answer, run as soon as it arrives. The gallery shows the
 * album in the URL or, failing that, the first album, so it can only ask for media once the
 * album list is in. The programme page does the same with events. The page does the same wait;
 * this just starts it before the page loads.
 */
const thenData: Partial<Record<keyof typeof adminPages, (client: QueryClient, search: URLSearchParams) => Promise<void>>> = {
  gallery: async (client, search) => {
    await prefetch(client, albumsQuery);
    const albumId = galleryAlbumId(client.getQueryData(albumsQuery.queryKey), search.get('album'));
    if (albumId) await prefetch(client, albumMediaQuery(albumId));
  },
  programme: async (client, search) => {
    await prefetch(client, eventsQuery);
    const eventId = programmeEventId(client.getQueryData(eventsQuery.queryKey), search.get('event'));
    if (eventId) await prefetch(client, programmeQuery(eventId));
  },
};

/**
 * Prefetches one query. A failure (no permission, signed out) is dropped from the cache rather
 * than kept, so the page makes its own request instead of starting from the prefetch's error.
 */
async function prefetch(client: QueryClient, options: AnyQuery): Promise<void> {
  await client.prefetchQuery(options);
  const query = client.getQueryCache().find({ queryKey: options.queryKey, exact: true });
  if (query?.state.status === 'error' && query.getObserversCount() === 0) client.removeQueries({ queryKey: options.queryKey, exact: true });
}

/**
 * Starts the requests an admin page makes as it opens, alongside its chunk and the sign-in
 * check. `layout` adds the sidebar's badge counts (only on a full page load; afterwards the
 * sidebar keeps them fresh). Needs the session cookie, like the chunks.
 */
export function preloadAdminData(client: QueryClient, pathname: string, search: string, { layout = false } = {}): Promise<void> {
  if (!readCookie('bp_csrf')) return Promise.resolve();
  const section = sectionOf(pathname);
  const queries = [...(pageData[section as keyof typeof adminPages]?.(new URLSearchParams(search)) ?? [])];
  // Check-in staff only have the check-in page and cannot read the counts, so skip them there.
  if (layout && section !== 'check-in') queries.push(mediaStatsQuery, testimonialCountsQuery);
  const params = new URLSearchParams(search);
  const follow = thenData[section as keyof typeof adminPages]?.(client, params);
  return Promise.all([...queries.map((options) => prefetch(client, options)), follow]).then(() => undefined);
}
