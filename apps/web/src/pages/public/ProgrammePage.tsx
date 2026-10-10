import { SEO } from '@/components/seo/SEO';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { siteNameOf, useProgramme, useSite } from '@/lib/public-api';
import { formatEventDate } from '@/lib/utils';
import { PageHero } from '@/components/public/section';
import { ProgrammeTimeline } from '@/components/public/programme/ProgrammeTimeline';
import { AddToCalendar } from '@/components/public/event/AddToCalendar';
import { calendarEventFromSite } from '@/components/public/event/event-helpers';

export default function ProgrammePage() {
  const { data: site } = useSite();
  const programme = useProgramme();
  const event = site?.event;

  return (
    <>
      <SEO
        title="Programme"
        description={event ? `The order of events for ${event.name} on ${formatEventDate(event.startsAt, event.timezone)}.` : 'The order of events for the celebration.'}
        siteName={siteNameOf(site)}
      />
      <PageHero
        eyebrow="Order of the evening"
        title="The programme"
        description={event ? `${formatEventDate(event.startsAt, event.timezone)} · ${event.venueName}` : undefined}
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
            {programme.data && programme.data.length > 0 && <ProgrammeTimeline items={programme.data} />}
          </div>
          {site && (
            <div className="mx-auto mt-16 flex max-w-2xl flex-col items-center gap-3 border-t border-gold/25 pt-10 text-center">
              <p className="font-display text-xl text-navy">Save the date</p>
              <AddToCalendar event={calendarEventFromSite(site)} className="justify-center text-navy" />
            </div>
          )}
        </div>
      </section>
    </>
  );
}
