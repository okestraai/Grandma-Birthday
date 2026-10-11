import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { isServerUnreachable } from './api';

/**
 * Sample content for the public pages while the API cannot be reached, so their layout can still
 * be seen before the site goes live.
 *
 * Order: the live API, then the last saved copy (lib/snapshot.ts), then the sample data in
 * src/demo/. The sample data is loaded only when a public request fails because the server is
 * unreachable and there is nothing else to show for it. It is never saved as the last good copy,
 * and the real API keeps being retried (components/public/OfflineBanner.tsx).
 *
 * Build with VITE_DEMO_FALLBACK=false to leave it out: the sample data is then not in the bundle.
 */

/** Data objects that came from the sample data, so they can be told apart from real data. */
const samples = new WeakSet<object>();

/** True when the data, or the first page of a paged list, is sample data. */
export function isDemoData(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  if (samples.has(data)) return true;
  const pages = (data as { pages?: unknown }).pages;
  return Array.isArray(pages) && pages.some((page) => page !== null && typeof page === 'object' && samples.has(page));
}

interface FallbackContext {
  client: QueryClient;
  queryKey: QueryKey;
  pageParam?: unknown;
}

/**
 * Runs a public query's fetch. When it fails because the server is unreachable and the cache holds
 * no real data for the query, it resolves with the sample data instead. Otherwise the error stands.
 */
export async function withDemoFallback<T>({ client, queryKey, pageParam }: FallbackContext, fetcher: () => Promise<T>): Promise<T> {
  try {
    return await fetcher();
  } catch (error) {
    if (import.meta.env.VITE_DEMO_FALLBACK === 'false' || !isServerUnreachable(error)) throw error;
    const current = client.getQueryData(queryKey);
    if (current !== undefined && !isDemoData(current)) throw error;
    const { demoFor } = await import('../demo/data');
    const sample = demoFor(queryKey, pageParam);
    if (!sample || typeof sample !== 'object') throw error;
    samples.add(sample);
    return sample as T;
  }
}
