import { keepPreviousData, queryOptions, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type {
  AlbumDetail,
  AlbumSummary,
  DigitalInvitation,
  FamilyTree,
  Paginated,
  ProgrammeGroup,
  PublicMedia,
  PublicTestimonial,
  RsvpFormConfig,
  RsvpInvitePrefill,
  SiteOverview,
  TimelineEntry,
  UploadPageConfig,
} from '@birthday/types';
import { api } from './api';
import { withDemoFallback } from './demo-fallback';

/**
 * TanStack Query hooks for the public site. Every key starts with 'public'
 * so the admin side can invalidate the whole public cache in one call.
 *
 * Whole-site queries go through withDemoFallback, so they show sample content when the API is
 * unreachable and nothing real is saved. Queries behind a personal link never do.
 */
export const publicKeys = {
  all: ['public'] as const,
  site: ['public', 'site'] as const,
  timeline: ['public', 'timeline'] as const,
  family: ['public', 'family'] as const,
  albums: ['public', 'albums'] as const,
  album: (slug: string) => ['public', 'album', slug] as const,
  albumMedia: (slug: string) => ['public', 'album', slug, 'media'] as const,
  programme: ['public', 'programme'] as const,
  testimonials: (pageSize: number) => ['public', 'testimonials', pageSize] as const,
  rsvpForm: ['public', 'rsvp', 'form'] as const,
  invite: (token: string) => ['public', 'rsvp', 'invite', token] as const,
  invitation: (token: string) => ['public', 'invitation', token] as const,
  uploadConfig: (token: string) => ['public', 'uploads', token] as const,
};

export const MEDIA_PAGE_SIZE = 24;

/** The home page and the public layout's data; also prefetched from main.tsx on public URLs. */
export const siteQuery = queryOptions({
  queryKey: publicKeys.site,
  queryFn: (ctx) => withDemoFallback(ctx, () => api.get<SiteOverview>('/site', undefined, ctx.signal)),
  staleTime: 5 * 60_000,
});

export function useSite() {
  return useQuery(siteQuery);
}

export function useTimeline() {
  return useQuery({
    queryKey: publicKeys.timeline,
    queryFn: (ctx) => withDemoFallback(ctx, () => api.get<TimelineEntry[]>('/timeline', undefined, ctx.signal)),
  });
}

export function useFamily() {
  return useQuery({
    queryKey: publicKeys.family,
    queryFn: (ctx) => withDemoFallback(ctx, () => api.get<FamilyTree>('/family', undefined, ctx.signal)),
  });
}

export function useAlbums() {
  return useQuery({
    queryKey: publicKeys.albums,
    queryFn: (ctx) => withDemoFallback(ctx, () => api.get<AlbumSummary[]>('/albums', undefined, ctx.signal)),
  });
}

export function useAlbum(slug: string) {
  return useQuery({
    queryKey: publicKeys.album(slug),
    queryFn: (ctx) => withDemoFallback(ctx, () => api.get<AlbumDetail>(`/albums/${encodeURIComponent(slug)}`, undefined, ctx.signal)),
    enabled: Boolean(slug),
  });
}

export function useAlbumMedia(slug: string, enabled = true) {
  return useInfiniteQuery({
    queryKey: publicKeys.albumMedia(slug),
    queryFn: (ctx) =>
      withDemoFallback(ctx, () =>
        api.get<Paginated<PublicMedia>>('/media', { album: slug, page: ctx.pageParam, pageSize: MEDIA_PAGE_SIZE }, ctx.signal),
      ),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
    enabled: enabled && Boolean(slug),
  });
}

export function useProgramme() {
  return useQuery({
    queryKey: publicKeys.programme,
    queryFn: (ctx) => withDemoFallback(ctx, () => api.get<ProgrammeGroup[]>('/programme', undefined, ctx.signal)),
  });
}

export function useTestimonials(pageSize = 12) {
  return useInfiniteQuery({
    queryKey: publicKeys.testimonials(pageSize),
    queryFn: (ctx) =>
      withDemoFallback(ctx, () =>
        api.get<Paginated<PublicTestimonial>>('/testimonials/public', { page: ctx.pageParam, pageSize }, ctx.signal),
      ),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
    placeholderData: keepPreviousData,
  });
}

export function useRsvpForm() {
  return useQuery({
    queryKey: publicKeys.rsvpForm,
    queryFn: (ctx) => withDemoFallback(ctx, () => api.get<RsvpFormConfig>('/rsvp/form', undefined, ctx.signal)),
    staleTime: 30_000,
  });
}

export function useInvitePrefill(token: string | null) {
  return useQuery({
    queryKey: publicKeys.invite(token ?? ''),
    queryFn: ({ signal }) => api.get<RsvpInvitePrefill>(`/rsvp/invite/${encodeURIComponent(token!)}`, undefined, signal),
    enabled: Boolean(token),
    staleTime: 0,
  });
}

export function useInvitation(token: string) {
  return useQuery({
    queryKey: publicKeys.invitation(token),
    queryFn: ({ signal }) => api.get<DigitalInvitation>(`/invitations/${encodeURIComponent(token)}`, undefined, signal),
    enabled: Boolean(token),
    staleTime: 0,
  });
}

export function useUploadConfig(token: string) {
  return useQuery({
    queryKey: publicKeys.uploadConfig(token),
    queryFn: ({ signal }) => api.get<UploadPageConfig>(`/uploads/${encodeURIComponent(token)}`, undefined, signal),
    enabled: Boolean(token),
    staleTime: 0,
  });
}

/** Name used in page titles, e.g. "Dr. Margaret's 70th". */
export function siteNameOf(site: SiteOverview | undefined): string {
  if (!site) return '';
  return site.branding.siteTitle ?? site.celebration.name;
}

/** Celebrant display name with honorific, e.g. "Dr. Margaret Adaeze Okonkwo". */
export function celebrantName(c: SiteOverview['celebrant'] | undefined): string {
  if (!c) return '';
  if (!c.honorific || c.fullName.startsWith(c.honorific)) return c.fullName;
  return `${c.honorific} ${c.fullName}`;
}
