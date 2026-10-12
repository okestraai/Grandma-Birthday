import { SEO } from '@/components/seo/SEO';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { siteNameOf, useProgramme, useSite } from '@/lib/public-api';
import { formatEventDate } from '@/lib/utils';
import { PageHero } from '@/components/public/section';
import { Reveal } from '@/components/public/reveal';
import { ProgrammeTimeline } from '@/components/public/programme/ProgrammeTimeline';
import { AddToCalendar } from '@/components/public/event/AddToCalendar';
import { calendarEventsFromSite, celebrationDates, eventTimes } from '@/components/public/event/event-helpers';

export default function ProgrammePage() {
  const { data: site } = useSite();
  const programme = useProgramme();
  const celebration = site?.celebration;
  const timezone = celebration?.timezone;
  const groups = programme.data ?? [];
  const several = groups.length > 1;
  // With one event the hero names its day and venue, as before.
  const only = site?.events.length === 1 ? site.events[0] : null;

  return (
    <>
      <SEO
        title="Programme"
        description={site ? `The order of events for ${site.celebration.name} on ${celebrationDates(site)}.` : 'The order of events for the celebration.'}
        siteName={siteNameOf(site)}
      />
      <PageHero
        eyebrow={several ? 'Order of events' : 'Order of the evening'}
        title="The programme"
        description={site ? (only ? `${formatEventDate(only.startsAt, timezone)} · ${only.venueName}` : celebrationDates(site)) : undefined}
      />
      <section className="bg-ivory py-16 sm:py-24" aria-label="Programme">
        <div className="container-page">
          <div className="mx-auto max-w-2xl">
            {programme.isPending && (
              <div className="space-y-10" aria-busy="true" aria-label="Loading the programme">
                {Array.from({ length: 5 }, (_, i) => (
                  <div key={i} className="grid grid-cols-[4.75rem_1fr] gap-5 sm:grid-cols-[7rem_1fr]">
                    <Skeleton className="ml-auto h-6 w-16" />
                    <div className="space-y-2">
                      <Skeleton className="h-6 w-1/2" />
                      <Skeleton className="h-4 w-4/5" />
                    </div>
                  </div>
                ))}
              </div>
            )}
            {programme.isError && !programme.data && <ErrorState error={programme.error} onRetry={() => programme.refetch()} title="We could not load the programme" />}
            {programme.data?.length === 0 && (
              <EmptyState title="The programme is being finalised" description="The order of events will be shared here closer to the day." />
            )}
            {groups.length > 0 && (
              <div className="space-y-20">
                {groups.map((group) => (
                  <section key={group.event.id} aria-labelledby={several ? `programme-${group.event.slug}` : undefined}>
                    {several && (
                      <Reveal className="mb-10 border-b border-gold/25 pb-5 text-center">
                        <p className="text-[11px] font-medium uppercase tracking-[0.3em] text-gold-rich">
                          <time dateTime={group.event.startsAt}>{formatEventDate(group.event.startsAt, timezone)}</time>
                        </p>
                        <h2 id={`programme-${group.event.slug}`} className="mt-2 font-display text-3xl text-navy">
                          {group.event.name}
                        </h2>
                        <p className="mt-2 text-sm text-muted">
                          {eventTimes(group.event, timezone)} · {group.event.venueName}
                        </p>
                      </Reveal>
                    )}
                    <ProgrammeTimeline items={group.items} eventStart={group.event.startsAt} timezone={timezone} />
                  </section>
                ))}
              </div>
            )}
          </div>
          {site && (
            <div className="mx-auto mt-16 flex max-w-2xl flex-col items-center gap-3 border-t border-gold/25 pt-10 text-center">
              <p className="font-display text-xl text-navy">Save the date</p>
              <AddToCalendar events={calendarEventsFromSite(site)} filename={site.celebration.name} className="justify-center text-navy" />
            </div>
          )}
        </div>
      </section>
    </>
  );
}
