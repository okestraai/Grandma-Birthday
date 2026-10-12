import { Link, useSearchParams } from 'react-router';
import { ArrowRight, CalendarClock } from 'lucide-react';
import { SEO } from '@/components/seo/SEO';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { siteNameOf, useProgramme, useSite } from '@/lib/public-api';
import { formatEventDate } from '@/lib/utils';
import { PageHero } from '@/components/public/section';
import { programmeShown } from '@/components/public/nav';
import { ProgrammeTimeline } from '@/components/public/programme/ProgrammeTimeline';
import { ProgrammeEventCard, ProgrammeSwitch } from '@/components/public/programme/ProgrammeEvents';
import { groupsWithItems, pickProgrammeGroup } from '@/components/public/programme/programme-helpers';
import { AddToCalendar } from '@/components/public/event/AddToCalendar';
import { calendarEventsFromSite, celebrationDates } from '@/components/public/event/event-helpers';

function TimelineSkeleton() {
  return (
    <div className="space-y-10" aria-busy="true" aria-label="Loading the programme">
      <Skeleton className="h-44 rounded-[1.75rem]" />
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="grid grid-cols-[4.75rem_1fr] gap-5 sm:grid-cols-[7rem_1fr]">
          <Skeleton className="ml-auto h-6 w-16" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-4 w-4/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ProgrammePage() {
  const { data: site } = useSite();
  const programme = useProgramme();
  const [searchParams, setSearchParams] = useSearchParams();
  const celebration = site?.celebration;
  const timezone = celebration?.timezone;
  const shown = programmeShown(site);
  const groups = groupsWithItems(programme.data);
  const several = groups.length > 1;
  const selected = pickProgrammeGroup(groups, searchParams.get('event'));
  // With one event the hero names its day and venue, as before.
  const only = site?.events.length === 1 ? site.events[0] : null;

  // The chosen event lives in the URL so a link can open it; switching does not add history.
  const select = (slug: string) =>
    setSearchParams(
      (params) => {
        params.set('event', slug);
        return params;
      },
      { replace: true, preventScrollReset: true },
    );

  return (
    <>
      <SEO
        title="Programme"
        description={site ? `The order of events for ${site.celebration.name} on ${celebrationDates(site)}.` : 'The order of events for the celebration.'}
        siteName={siteNameOf(site)}
        noindex={!shown}
      />
      <PageHero
        eyebrow={several ? 'Order of events' : 'Order of the evening'}
        title="The programme"
        description={site ? (only ? `${formatEventDate(only.startsAt, timezone)} · ${only.venueName}` : celebrationDates(site)) : undefined}
      />
      <section className="bg-ivory py-12 sm:py-20" aria-label="Programme">
        <div className="container-page">
          <div className="mx-auto max-w-3xl">
            {!shown ? (
              <EmptyState
                icon={<CalendarClock className="size-7" />}
                title="The programme isn't available yet"
                description="The order of events will be shared here closer to the day."
                action={
                  <Link to="/event" className="group mt-1 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-emerald hover:text-navy">
                    See the event details
                    <ArrowRight className="size-4 transition-transform duration-300 ease-luxe group-hover:translate-x-1" aria-hidden />
                  </Link>
                }
              />
            ) : (
              <>
                {programme.isPending && <TimelineSkeleton />}
                {programme.isError && !programme.data && <ErrorState error={programme.error} onRetry={() => programme.refetch()} title="We could not load the programme" />}
                {programme.data && groups.length === 0 && (
                  <EmptyState title="The programme is being finalised" description="The order of events will be shared here closer to the day." />
                )}
                {selected && (
                  <ProgrammeSwitch groups={groups} selected={selected} onSelect={select} idPrefix="programme" timezone={timezone}>
                    {(group) => (
                      <>
                        <ProgrammeEventCard event={group.event} timezone={timezone} />
                        <div className="mx-auto mt-12 max-w-2xl sm:mt-14">
                          <ProgrammeTimeline items={group.items} eventStart={group.event.startsAt} timezone={timezone} />
                        </div>
                      </>
                    )}
                  </ProgrammeSwitch>
                )}
              </>
            )}
          </div>
          {site && shown && (
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
