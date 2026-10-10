import { QueryClient } from '@tanstack/react-query';
import { isApiError } from './api';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 10 * 60_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        if (isApiError(error) && error.status >= 400 && error.status < 500) return false;
        return failureCount < 2;
      },
    },
  },
});

/**
 * Admin screens show live moderation queues (guest photos, messages, RSVPs), so their data goes
 * stale after 10 seconds and refreshes when the admin comes back to the tab. Public pages keep
 * the calmer defaults above.
 */
queryClient.setQueryDefaults(['admin'], { staleTime: 10_000, refetchOnWindowFocus: true });

/**
 * Public pages retry quickly, so a guest sees the saved copy or the "we'll be right back" notice
 * within a couple of seconds when the API is down, rather than a skeleton that never resolves.
 */
queryClient.setQueryDefaults(['public'], { retryDelay: (attempt) => (attempt === 0 ? 600 : 1500) });

/** How often public queries that failed because the server was unreachable are tried again. */
export const OFFLINE_RETRY_MS = 15_000;

/** How often live queues re-check for new items while their page is open and the tab visible. */
export const LIVE_REFRESH_MS = 15_000;
