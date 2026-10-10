import { useEffect, useState } from 'react';
import { RotateCw } from 'lucide-react';
import { cn, formatRelative } from '@/lib/utils';

/**
 * "Updated 12 seconds ago · Refresh" for pages that re-check the server on their own
 * (guest photos, testimonials). Shows that the list is live and lets the admin force a check.
 */
export function LiveRefresh({ updatedAt, fetching, onRefresh, className }: { updatedAt: number; fetching: boolean; onRefresh: () => void; className?: string }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 5_000);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className={cn('flex items-center gap-2 text-[12px] text-muted', className)}>
      <span aria-live="polite">{fetching ? 'Checking for new items…' : updatedAt ? `Updated ${formatRelative(new Date(updatedAt).toISOString())}` : ''}</span>
      <button
        type="button"
        onClick={onRefresh}
        disabled={fetching}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-navy/15 px-2.5 font-medium text-navy hover:bg-cream disabled:opacity-50"
      >
        <RotateCw className={cn('size-3.5', fetching && 'animate-spin')} aria-hidden /> Refresh
      </button>
    </div>
  );
}
