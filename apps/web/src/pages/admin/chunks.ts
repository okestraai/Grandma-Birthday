import type { ComponentType } from 'react';
import { readCookie } from '@/lib/api';

export type Loader = () => Promise<{ default: ComponentType }>;

/**
 * Every admin page's chunk, keyed by its path under /admin ('' is the dashboard). App.tsx builds
 * its lazy components from these, and `preloadAdmin` calls the same imports early, so the
 * browser fetches each chunk once, whichever asks first.
 */
export const adminPages = {
  '': () => import('./DashboardPage'),
  celebrant: () => import('./CelebrantPage'),
  timeline: () => import('./TimelineAdminPage'),
  family: () => import('./FamilyAdminPage'),
  gallery: () => import('./GalleryAdminPage'),
  albums: () => import('./AlbumsPage'),
  media: () => import('./MediaLibraryPage'),
  'guest-photos': () => import('./GuestPhotosPage'),
  testimonials: () => import('./TestimonialsAdminPage'),
  guests: () => import('./GuestsPage'),
  'guest-categories': () => import('./GuestCategoriesPage'),
  invitations: () => import('./InvitationsPage'),
  'check-in': () => import('./CheckInPage'),
  event: () => import('./EventAdminPage'),
  programme: () => import('./ProgrammeAdminPage'),
  storage: () => import('./StoragePage'),
  users: () => import('./UsersPage'),
  'audit-logs': () => import('./AuditLogsPage'),
  settings: () => import('./SettingsPage'),
  account: () => import('./AccountPage'),
} satisfies Record<string, Loader>;

export const adminShell = {
  layout: () => import('./AdminLayout'),
  login: () => import('./LoginPage'),
  forgotPassword: () => import('./ForgotPasswordPage'),
  resetPassword: () => import('./ResetPasswordPage'),
} satisfies Record<string, Loader>;

/** The first path segment under /admin: '' for the dashboard, 'guests' for /admin/guests/123. */
export function sectionOf(pathname: string): string {
  return pathname.replace(/^\/admin\/?/, '').split('/')[0] ?? '';
}

/** The page chunk for an admin URL such as /admin/guests/123, if there is one. */
function pageFor(pathname: string): Loader | undefined {
  return (adminPages as Record<string, Loader>)[sectionOf(pathname)];
}

// The data preloader is its own chunk, so admin query code stays out of the public pages' first load.
const loadData = () => import('./preload-data');

/**
 * Starts downloading the chunks and data an admin URL needs, at the same time as the sign-in
 * check, instead of one after the other. Access is still decided by RequireAuth and enforced by
 * the API. Without a session cookie only the login page is fetched.
 */
export function preloadAdmin(pathname: string, search = ''): void {
  const load = (loader?: Loader) => void loader?.().catch(() => undefined);
  if (pathname.startsWith('/admin/login')) return load(adminShell.login);
  if (pathname.startsWith('/admin/forgot-password')) return load(adminShell.forgotPassword);
  if (pathname.startsWith('/admin/reset-password')) return load(adminShell.resetPassword);
  if (!readCookie('bp_csrf')) return load(adminShell.login);
  load(adminShell.layout);
  load(pageFor(pathname));
  void loadData().then((m) => m.preloadAdminData(m.queryClient, pathname, search, { layout: true }), () => undefined);
}

/** Fetches one admin page's chunk and data ahead of a click (sidebar hover or focus). */
export function preloadAdminPage(to: string): void {
  const [pathname, query = ''] = to.split('?');
  void pageFor(pathname)?.().catch(() => undefined);
  void loadData().then((m) => m.preloadAdminData(m.queryClient, pathname, query ? `?${query}` : ''), () => undefined);
}
