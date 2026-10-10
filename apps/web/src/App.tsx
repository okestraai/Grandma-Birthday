import { lazy, Suspense, type ComponentType, type ReactNode } from 'react';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'motion/react';
import { Toaster } from 'sonner';
import { queryClient } from '@/lib/query';
import { AuthProvider, RequireAuth } from '@/lib/auth';
import { PageLoader } from '@/components/ui/spinner';
import { RouteError } from '@/components/layout/RouteError';
import { adminPages, adminShell } from '@/pages/admin/chunks';
import { watchNavigation } from '@/lib/version';
import { setReloadTarget } from '@/lib/chunk-reload';

// Public pages use route-level `lazy`: the router starts loading the layout and the page
// chunks together as soon as it matches a URL, instead of the page waiting for the layout to render.
const page = (load: () => Promise<{ default: ComponentType }>) => async () => ({ Component: (await load()).default });

// Admin pages keep element-level lazy, so RequireAuth decides what renders. Their chunks come
// from pages/admin/chunks.ts, which main.tsx also uses to start downloading them early.
const LoginPage = lazy(adminShell.login);
const ForgotPasswordPage = lazy(adminShell.forgotPassword);
const ResetPasswordPage = lazy(adminShell.resetPassword);
const AdminLayout = lazy(adminShell.layout);
const DashboardPage = lazy(adminPages['']);
const CelebrantPage = lazy(adminPages.celebrant);
const TimelineAdminPage = lazy(adminPages.timeline);
const FamilyAdminPage = lazy(adminPages.family);
const GalleryAdminPage = lazy(adminPages.gallery);
const AlbumsPage = lazy(adminPages.albums);
const MediaLibraryPage = lazy(adminPages.media);
const GuestPhotosPage = lazy(adminPages['guest-photos']);
const TestimonialsAdminPage = lazy(adminPages.testimonials);
const GuestsPage = lazy(adminPages.guests);
const GuestCategoriesPage = lazy(adminPages['guest-categories']);
const InvitationsPage = lazy(adminPages.invitations);
const CheckInPage = lazy(adminPages['check-in']);
const EventAdminPage = lazy(adminPages.event);
const ProgrammeAdminPage = lazy(adminPages.programme);
const StoragePage = lazy(adminPages.storage);
const UsersPage = lazy(adminPages.users);
const AuditLogsPage = lazy(adminPages['audit-logs']);
const SettingsPage = lazy(adminPages.settings);
const AccountPage = lazy(adminPages.account);

const s = (node: ReactNode) => <Suspense fallback={<PageLoader />}>{node}</Suspense>;

const router = createBrowserRouter([
  {
    lazy: page(() => import('@/pages/public/PublicLayout')),
    errorElement: <RouteError />,
    hydrateFallbackElement: <PageLoader />,
    children: [
      { index: true, lazy: page(() => import('@/pages/public/HomePage')) },
      { path: 'about', lazy: page(() => import('@/pages/public/AboutPage')) },
      { path: 'story', lazy: page(() => import('@/pages/public/StoryPage')) },
      { path: 'family', lazy: page(() => import('@/pages/public/FamilyPage')) },
      { path: 'gallery', lazy: page(() => import('@/pages/public/GalleryPage')) },
      { path: 'gallery/:album', lazy: page(() => import('@/pages/public/AlbumPage')) },
      { path: 'event', lazy: page(() => import('@/pages/public/EventPage')) },
      { path: 'programme', lazy: page(() => import('@/pages/public/ProgrammePage')) },
      { path: 'testimonials', lazy: page(() => import('@/pages/public/TestimonialsPage')) },
      { path: 'rsvp', lazy: page(() => import('@/pages/public/RsvpPage')) },
      { path: 'invitation/:token', lazy: page(() => import('@/pages/public/InvitationPage')) },
      { path: '*', lazy: page(() => import('@/pages/public/NotFoundPage')) },
    ],
  },
  // Standalone, mobile-first page opened from the event QR code.
  {
    path: '/memories/upload/:token',
    lazy: page(() => import('@/pages/public/MemoriesUploadPage')),
    errorElement: <RouteError />,
    hydrateFallbackElement: <PageLoader />,
  },
  { path: '/admin/login', element: s(<LoginPage />), errorElement: <RouteError /> },
  { path: '/admin/forgot-password', element: s(<ForgotPasswordPage />) },
  { path: '/admin/reset-password', element: s(<ResetPasswordPage />) },
  {
    path: '/admin',
    element: <RequireAuth>{s(<AdminLayout />)}</RequireAuth>,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <RequireAuth permission="dashboard:read">{s(<DashboardPage />)}</RequireAuth> },
      { path: 'celebrant', element: <RequireAuth permission="content:manage">{s(<CelebrantPage />)}</RequireAuth> },
      { path: 'biography', element: <Navigate to="/admin/celebrant" replace /> },
      { path: 'timeline', element: <RequireAuth permission="content:manage">{s(<TimelineAdminPage />)}</RequireAuth> },
      { path: 'family', element: <RequireAuth permission="content:manage">{s(<FamilyAdminPage />)}</RequireAuth> },
      { path: 'gallery', element: <RequireAuth permission="media:manage">{s(<GalleryAdminPage />)}</RequireAuth> },
      { path: 'albums', element: <RequireAuth permission="media:manage">{s(<AlbumsPage />)}</RequireAuth> },
      { path: 'media', element: <RequireAuth permission="media:manage">{s(<MediaLibraryPage />)}</RequireAuth> },
      { path: 'guest-photos', element: <RequireAuth permission="media:manage">{s(<GuestPhotosPage />)}</RequireAuth> },
      { path: 'testimonials', element: <RequireAuth permission="testimonials:manage">{s(<TestimonialsAdminPage />)}</RequireAuth> },
      { path: 'guests', element: <RequireAuth permission="guests:manage">{s(<GuestsPage />)}</RequireAuth> },
      { path: 'guest-categories', element: <RequireAuth permission="guests:manage">{s(<GuestCategoriesPage />)}</RequireAuth> },
      { path: 'invitations', element: <RequireAuth permission="guests:manage">{s(<InvitationsPage />)}</RequireAuth> },
      { path: 'check-in', element: <RequireAuth permission="checkin:use">{s(<CheckInPage />)}</RequireAuth> },
      { path: 'event', element: <RequireAuth permission="event:manage">{s(<EventAdminPage />)}</RequireAuth> },
      { path: 'programme', element: <RequireAuth permission="event:manage">{s(<ProgrammeAdminPage />)}</RequireAuth> },
      { path: 'storage', element: <RequireAuth permission="storage:read">{s(<StoragePage />)}</RequireAuth> },
      { path: 'users', element: <RequireAuth permission="users:manage">{s(<UsersPage />)}</RequireAuth> },
      { path: 'audit-logs', element: <RequireAuth permission="audit:read">{s(<AuditLogsPage />)}</RequireAuth> },
      { path: 'settings', element: <RequireAuth permission="settings:manage">{s(<SettingsPage />)}</RequireAuth> },
      { path: 'account', element: s(<AccountPage />) },
    ],
  },
]);

// Once a newer deploy is known, the next page change loads it in full (see lib/version.ts).
watchNavigation(router);
// If a page's code fails to load mid-navigation, the automatic reload goes to that page.
setReloadTarget(() => (router.state.navigation.location ? router.createHref(router.state.navigation.location) : null));

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
        <Toaster position="top-center" richColors closeButton toastOptions={{ className: 'font-sans' }} />
      </MotionConfig>
    </QueryClientProvider>
  );
}
