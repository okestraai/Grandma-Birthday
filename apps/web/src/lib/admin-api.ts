import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { apiUrl, errorMessage, isApiError } from './api';

/**
 * Query keys for the admin dashboard. Every key starts with 'admin' so logout can drop them all.
 * Prefix keys (without params) are used for invalidation.
 */
export const adminKeys = {
  all: ['admin'] as const,
  dashboard: ['admin', 'dashboard'] as const,
  celebration: ['admin', 'celebration'] as const,
  /** Nested under `celebration` so invalidating the celebration also refreshes the split. */
  allocations: ['admin', 'celebration', 'allocations'] as const,
  events: ['admin', 'events'] as const,
  settings: ['admin', 'settings'] as const,
  celebrant: ['admin', 'celebrant'] as const,
  timeline: ['admin', 'timeline'] as const,
  family: ['admin', 'family'] as const,
  programme: ['admin', 'programme'] as const,
  programmeList: (eventId: string) => ['admin', 'programme', eventId] as const,
  albums: ['admin', 'albums'] as const,
  media: ['admin', 'media'] as const,
  mediaList: (params: Record<string, unknown>) => ['admin', 'media', 'list', params] as const,
  mediaStats: ['admin', 'media', 'stats'] as const,
  storage: ['admin', 'storage'] as const,
  testimonials: ['admin', 'testimonials'] as const,
  testimonialList: (params: Record<string, unknown>) => ['admin', 'testimonials', 'list', params] as const,
  testimonialCounts: ['admin', 'testimonials', 'counts'] as const,
  guests: ['admin', 'guests'] as const,
  guestList: (params: Record<string, unknown>) => ['admin', 'guests', 'list', params] as const,
  guest: (id: string) => ['admin', 'guests', 'detail', id] as const,
  categories: ['admin', 'guest-categories'] as const,
  questions: ['admin', 'rsvp-questions'] as const,
  invitations: ['admin', 'invitations'] as const,
  invitationList: (params: Record<string, unknown>) => ['admin', 'invitations', 'list', params] as const,
  checkins: ['admin', 'checkins'] as const,
  checkinList: (params: Record<string, unknown>) => ['admin', 'checkins', 'list', params] as const,
  checkinOverview: ['admin', 'checkin', 'overview'] as const,
  /** No eventId: the event the server picks (in progress, next, or last). */
  checkinOverviewFor: (eventId: string | null) => ['admin', 'checkin', 'overview', eventId] as const,
  users: ['admin', 'users'] as const,
  audit: (params: Record<string, unknown>) => ['admin', 'audit-logs', params] as const,
};

/** Groups of keys that change together. Use with `invalidate`. */
export const affects = {
  media: [adminKeys.media, adminKeys.albums, adminKeys.storage, adminKeys.dashboard],
  testimonials: [adminKeys.testimonials, adminKeys.dashboard],
  guests: [adminKeys.guests, adminKeys.invitations, adminKeys.categories, adminKeys.dashboard, adminKeys.celebration, adminKeys.events],
  checkins: [adminKeys.checkins, adminKeys.checkinOverview, adminKeys.guests, adminKeys.invitations, adminKeys.dashboard, adminKeys.events],
} satisfies Record<string, QueryKey[]>;

export interface AdminMutationOptions<TData, TVars> {
  mutationFn: (vars: TVars) => Promise<TData>;
  /** Query key prefixes to invalidate after success. */
  invalidate?: QueryKey[];
  /** Toast shown on success; a function receives the result. `false` shows nothing. */
  success?: string | ((data: TData, vars: TVars) => string) | false;
  /** Show a toast on error (default true). Turn off when the form shows the error inline. */
  toastError?: boolean;
  onSuccess?: (data: TData, vars: TVars) => void;
  onError?: (error: unknown, vars: TVars) => void;
}

/** useMutation with the dashboard's conventions: toasts, and invalidating related queries. */
export function useAdminMutation<TData = unknown, TVars = void>(options: AdminMutationOptions<TData, TVars>) {
  const queryClient = useQueryClient();
  return useMutation<TData, unknown, TVars>({
    mutationFn: options.mutationFn,
    onSuccess: async (data, vars) => {
      if (options.success) {
        toast.success(typeof options.success === 'function' ? options.success(data, vars) : options.success);
      }
      options.onSuccess?.(data, vars);
      await Promise.all((options.invalidate ?? []).map((queryKey) => queryClient.invalidateQueries({ queryKey })));
    },
    onError: (error, vars) => {
      if (options.toastError !== false) toast.error(errorMessage(error));
      options.onError?.(error, vars);
    },
  });
}

/**
 * Copies VALIDATION_FAILED field messages onto a react-hook-form.
 * Returns true when at least one field message was applied.
 */
export function applyServerErrors<T extends FieldValues>(error: unknown, setError: UseFormSetError<T>, fields?: readonly string[]): boolean {
  if (!isApiError(error, 'VALIDATION_FAILED') || !error.details) return false;
  let applied = false;
  for (const [key, messages] of Object.entries(error.details)) {
    if (fields && !fields.includes(key) && !fields.includes(key.split('.')[0])) continue;
    setError(key as Path<T>, { type: 'server', message: messages[0] ?? 'Invalid value' });
    applied = true;
  }
  return applied;
}

/** Toasts the error unless its field messages could be shown on the form. */
export function reportFormError<T extends FieldValues>(error: unknown, setError: UseFormSetError<T>, fields?: readonly string[]): void {
  const applied = applyServerErrors(error, setError, fields);
  toast.error(applied ? 'Please correct the highlighted fields.' : errorMessage(error));
}

/** Empty strings become null, for nullable text fields. */
export function nullIfBlank(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed === '' ? null : trimmed;
}

/** Optional number input: '' → null. */
export function numberOrNull(value: unknown): number | null {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Moves an item one step up or down; returns a new array. */
export function moveItem<T>(list: T[], index: number, delta: -1 | 1): T[] {
  const target = index + delta;
  if (target < 0 || target >= list.length) return list;
  const next = list.slice();
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export const GB = 1024 ** 3;
export const MB = 1024 ** 2;

export const ACCEPTED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif'];
export const ACCEPTED_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];

/** Builds `/api/admin/...` URLs with a query string, for plain links such as CSV export. */
export function adminHref(path: string, query: Record<string, string | number | boolean | null | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return apiUrl(`/api${path}${qs ? `?${qs}` : ''}`);
}
