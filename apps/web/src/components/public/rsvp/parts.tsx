import { useEffect, useRef, type ReactNode } from 'react';
import type { SiteOverview } from '@birthday/types';
import { celebrantName } from '@/lib/public-api';
import { Skeleton } from '@/components/ui/skeleton';
import { cn, formatEventDate, formatEventTime } from '@/lib/utils';
import { Eyebrow, GoldRule } from '../section';
import { celebrationDates, celebrationPlace } from '../event/event-helpers';

/**
 * Step or result heading. Focusable (tabIndex -1) so focus can move to it when the
 * step changes; `focusOnMount` is false on first render so the page load is not hijacked.
 */
export function StepHeading({
  eyebrow,
  title,
  description,
  focusOnMount,
  id,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  focusOnMount: boolean;
  id?: string;
}) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focusOnMount) ref.current?.focus();
    // Only on mount: each step mounts once per visit.
  }, []);
  return (
    <header className="text-center">
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <h2
        ref={ref}
        id={id}
        tabIndex={-1}
        className="mt-2 font-display text-2xl leading-tight text-navy outline-none focus-visible:ring-2 focus-visible:ring-gold/40 focus-visible:ring-offset-4 focus-visible:ring-offset-ivory sm:text-[1.75rem]"
      >
        {title}
      </h2>
      {description && <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">{description}</p>}
    </header>
  );
}

/** The formal invitation wording at the top of the card, from the site data. */
export function InvitationHeader({ site, className }: { site: SiteOverview; className?: string }) {
  const { celebration, events } = site;
  const name = celebrantName(site.celebrant);
  const [only] = events.length === 1 ? events : [];
  return (
    <div className={cn('text-center', className)}>
      <p className="text-[11px] font-medium uppercase tracking-[0.3em] text-gold-rich">The family of</p>
      <p className="mt-2 font-display text-2xl leading-snug text-navy sm:text-3xl">{name}</p>
      <p className="mx-auto mt-3 max-w-sm font-display text-[15px] italic leading-relaxed text-charcoal/80 sm:text-base">
        requests the pleasure of your company at {celebration.name}
      </p>
      <GoldRule className="mt-5" />
      {only ? (
        <>
          <p className="mt-4 text-sm text-navy">
            <time dateTime={only.startsAt}>
              {formatEventDate(only.startsAt, celebration.timezone)} · {formatEventTime(only.startsAt, celebration.timezone)}
            </time>
          </p>
          <p className="mt-1 text-sm text-muted">{[only.venueName, only.city].filter(Boolean).join(', ')}</p>
        </>
      ) : (
        <>
          <p className="mt-4 text-sm text-navy">
            <time dateTime={celebration.startsAt}>{celebrationDates(site)}</time>
          </p>
          {events.length > 1 && <p className="mt-1 text-sm text-muted">{celebrationPlace(site)}</p>}
        </>
      )}
    </div>
  );
}

/** Ivory card with a fine gold hairline, used for every state of the page. */
export function RsvpCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'relative mx-auto w-full max-w-2xl rounded-[1.75rem] border border-gold/30 bg-ivory px-5 py-8 shadow-lift sm:px-10 sm:py-12',
        className,
      )}
    >
      <div aria-hidden className="pointer-events-none absolute inset-2 rounded-[1.4rem] border border-gold/15 sm:inset-3" />
      <div className="relative">{children}</div>
    </div>
  );
}

/** Label/value row for the review screen. */
export function ReviewRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5 py-2.5 sm:grid-cols-[10rem_1fr] sm:gap-4">
      <dt className="text-xs uppercase tracking-[0.14em] text-muted">{label}</dt>
      <dd className="break-words text-[15px] text-navy">{children}</dd>
    </div>
  );
}

/** Loading placeholder shaped like the invitation card. */
export function RsvpSkeleton() {
  return (
    <RsvpCard>
      <div role="status" aria-label="Loading the RSVP form" className="flex flex-col items-center">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-4 h-7 w-64 max-w-full" />
        <Skeleton className="mt-3 h-4 w-72 max-w-full" />
        <Skeleton className="mt-6 h-px w-32" />
        <Skeleton className="mt-5 h-4 w-56" />
        <div className="mt-10 grid w-full grid-cols-4 gap-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex flex-col items-center gap-2">
              <Skeleton className="size-7 rounded-full" />
              <Skeleton className="h-3 w-14" />
            </div>
          ))}
        </div>
        <div className="mt-10 w-full space-y-5">
          {[0, 1, 2].map((i) => (
            <div key={i}>
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="mt-2 h-11 w-full rounded-xl" />
            </div>
          ))}
        </div>
        <Skeleton className="mt-8 h-11 w-40 self-end rounded-full" />
      </div>
    </RsvpCard>
  );
}
