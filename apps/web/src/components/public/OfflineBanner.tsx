import { useCallback, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CloudOff, RotateCcw } from 'lucide-react';
import { isServerUnreachable } from '@/lib/api';
import { isDemoData } from '@/lib/demo-fallback';
import { publicKeys, useSite } from '@/lib/public-api';
import { OFFLINE_RETRY_MS } from '@/lib/query';
import { cn } from '@/lib/utils';

/**
 * Whether the celebration server is unreachable, judged by the site query every public page uses,
 * and a `retry` that refetches every public query that failed that way or is showing sample
 * content (lib/demo-fallback.ts). While it is down, those queries are retried every 15 seconds,
 * when the browser comes back online and when the tab is shown again.
 */
export function useServerDown() {
  const client = useQueryClient();
  const site = useSite();
  const sample = isDemoData(site.data);
  const down = (site.isError && isServerUnreachable(site.error)) || sample;

  const retry = useCallback(
    () =>
      Promise.all([
        client.refetchQueries({
          queryKey: publicKeys.all,
          type: 'active',
          predicate: (query) => query.state.status === 'error' && isServerUnreachable(query.state.error),
        }),
        // Sample data counts as a success, so it is marked stale too: pages not open now refetch when opened.
        client.invalidateQueries({ queryKey: publicKeys.all, predicate: (query) => isDemoData(query.state.data) }),
      ]),
    [client],
  );

  useEffect(() => {
    if (!down) return;
    const timer = window.setInterval(() => void retry(), OFFLINE_RETRY_MS);
    const onOnline = () => void retry();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void retry();
    };
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [down, retry]);

  return { down, hasData: site.data !== undefined, sample, retrying: site.isFetching, retry };
}

interface OfflineBannerProps {
  hasData: boolean;
  /** The page is showing sample content rather than saved data. */
  sample?: boolean;
  retrying: boolean;
  onRetry: () => void;
  className?: string;
}

/** A slim, polite notice while the server is unreachable. PublicLayout places it at the foot of the screen. */
export function OfflineBanner({ hasData, sample, retrying, onRetry, className }: OfflineBannerProps) {
  return (
    <div
      role="status"
      className={cn('no-print flex max-w-xl items-center gap-3 rounded-full border border-gold/40 bg-navy/95 py-1.5 pl-4 pr-1.5 text-xs text-champagne shadow-lift', className)}
    >
      <CloudOff aria-hidden className="size-4 shrink-0 text-gold" />
      <p className="leading-snug">
        {sample ? (
          'The celebration server is offline. You’re seeing sample content.'
        ) : (
          <>
            We can’t reach the celebration server right now.{' '}
            {hasData ? 'You’re seeing the last saved version.' : 'Retrying…'}
          </>
        )}
      </p>
      <button
        type="button"
        onClick={onRetry}
        disabled={retrying}
        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-gold/50 px-3 font-medium text-ivory transition-colors hover:bg-gold/15 disabled:opacity-60"
      >
        <RotateCcw aria-hidden className={retrying ? 'size-3.5 animate-spin' : 'size-3.5'} />
        Retry
      </button>
    </div>
  );
}
