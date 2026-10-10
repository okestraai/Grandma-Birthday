import { Link } from 'react-router';
import { ArrowRight } from 'lucide-react';
import { SEO } from '@/components/seo/SEO';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { siteNameOf, useSite } from '@/lib/public-api';
import { formatEventDate, formatEventTime, paragraphs } from '@/lib/utils';
import { PageHero } from '@/components/public/section';
import { Reveal } from '@/components/public/reveal';
import { EventDetails } from '@/components/public/event/EventDetails';
import { AddToCalendar } from '@/components/public/event/AddToCalendar';
import { calendarEventFromSite, directionsHref, rsvpClosedMessage } from '@/components/public/event/event-helpers';
import { eventJsonLd, siteImagePath } from '@/components/public/jsonld';
import { SeventyWatermark } from '@/components/public/seventy';
import { Medallion } from '@/components/public/effects/Medallion';
import { VenueMap } from '@/components/public/event/VenueMap';
import { MagneticLink, SplitText, TiltCard } from '@/components/public/motion';

export default function EventPage() {
  const { data: site, isError, error, refetch } = useSite();

  // Saved data (see lib/snapshot) still shows while a refetch is failing.
  if (!site && !isError) {
    return (
      <>
        <PageHero eyebrow="The celebration" title={<Skeleton className="h-12 w-80 max-w-full bg-white/10" />} />
        <div className="container-page grid gap-6 py-16 sm:grid-cols-2" aria-busy="true">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      </>
    );
  }
  if (!site) {
    return (
      <>
        <PageHero eyebrow="The celebration" title="Event details" />
        <div className="container-page py-16">
          <ErrorState error={error} onRetry={() => refetch()} />
        </div>
      </>
    );
  }

  const { event } = site;
  const directions = directionsHref(event);
  const when = `${formatEventDate(event.startsAt, event.timezone)} at ${formatEventTime(event.startsAt, event.timezone)}`;
  const { rsvp } = event;

  return (
    <>
      <SEO
        title={event.name}
        description={`${when} · ${event.venueName}${event.city ? `, ${event.city}` : ''}. ${event.tagline ?? ''}`.trim()}
        image={siteImagePath(site)}
        jsonLd={eventJsonLd(site)}
        siteName={siteNameOf(site)}
      />
      <PageHero eyebrow="The celebration" title={event.name} description={event.tagline ?? undefined}>
        <p className="mt-6 text-sm text-ivory/80">
          <time dateTime={event.startsAt}>{when}</time>
          <span aria-hidden className="mx-2 text-gold">·</span>
          {event.venueName}
        </p>
        <AddToCalendar event={calendarEventFromSite(site)} tone="dark" className="mt-8 text-ivory" />
      </PageHero>

      <section className="bg-ivory py-16 sm:py-24" aria-labelledby="details-heading">
        <div className="container-page grid gap-14 lg:grid-cols-[1.25fr_0.75fr] lg:gap-20">
          <div>
            <h2 id="details-heading" className="font-display text-3xl text-navy">
              <SplitText text="Details for our guests" trigger="view" />
            </h2>
            {event.description && (
              <div className="mt-5 max-w-2xl space-y-4 text-[15px] leading-relaxed text-charcoal/85 sm:text-base">
                {paragraphs(event.description).map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
            )}
            <Reveal className="mt-8">
              <EventDetails event={event} />
            </Reveal>
          </div>

          <aside className="space-y-6 lg:sticky lg:top-28 lg:self-start">
            <Reveal x={48} y={0}>
            <TiltCard className="rounded-[1.75rem]" max={6}>
            <div className="relative overflow-hidden rounded-[1.75rem] bg-navy p-8 text-ivory shadow-lift">
              <div aria-hidden className="absolute inset-0 bg-luxury opacity-80" />
              <SeventyWatermark className="absolute -bottom-10 -right-4 text-[10rem] opacity-[0.1]" />
              <div aria-hidden className="absolute inset-2.5 rounded-[1.4rem] border border-gold/30" />
              <div className="relative">
                <Medallion className="mx-auto -mt-2 mb-5 w-48 sm:w-52" />
                <p className="text-[11px] font-medium uppercase tracking-[0.3em] text-gold">Kindly reply</p>
                <h2 className="mt-3 font-display text-2xl">Will you be there?</h2>
                {rsvp.open ? (
                  <>
                    <p className="mt-3 text-sm leading-relaxed text-ivory/75">
                      {rsvp.mode === 'INVITE_ONLY' ? 'Please reply with the personal link in your invitation.' : 'Let the family know you are coming.'}
                      {rsvp.deadline && (
                        <>
                          {' '}Replies by <time dateTime={rsvp.deadline}>{formatEventDate(rsvp.deadline, event.timezone)}</time>.
                        </>
                      )}
                    </p>
                    <MagneticLink
                      to="/rsvp"
                      className="mt-6 inline-flex h-11 items-center justify-center rounded-full bg-gold px-7 text-sm font-semibold text-navy shadow-soft transition-shadow duration-300 ease-luxe hover:shadow-gold"
                    >
                      RSVP
                    </MagneticLink>
                  </>
                ) : (
                  <p className="mt-3 text-sm leading-relaxed text-ivory/75">{rsvpClosedMessage(rsvp, event.timezone)}</p>
                )}
              </div>
            </div>
            </TiltCard>
            </Reveal>
            <Reveal delay={0.1} x={48} y={0}>
            <TiltCard className="rounded-[1.75rem]" max={5}>
            <div className="rounded-[1.75rem] border border-gold/30 bg-white p-8 shadow-soft">
              <VenueMap className="mb-6" />
              <h2 className="font-display text-xl text-navy">Getting there</h2>
              <p className="mt-2 text-sm leading-relaxed text-charcoal/80">
                {event.venueName}
                <br />
                {event.address}
              </p>
              <a
                href={directions.href}
                {...(directions.newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                className="mt-5 inline-flex h-11 items-center gap-2 rounded-full border border-gold/60 px-6 text-sm font-medium text-navy transition-colors hover:border-gold hover:bg-gold/10"
              >
                Get directions <ArrowRight className="size-4" aria-hidden />
                {directions.newTab && <span className="sr-only">(opens in a new tab)</span>}
              </a>
            </div>
            </TiltCard>
            </Reveal>
            <Reveal delay={0.15} x={48} y={0}>
              <Link to="/programme" className="group flex items-center justify-between rounded-[1.75rem] border border-gold/30 bg-cream px-8 py-6 transition-colors hover:border-gold">
                <span>
                  <span className="block text-[11px] font-medium uppercase tracking-[0.3em] text-gold-rich">On the night</span>
                  <span className="mt-1 block font-display text-xl text-navy">View the programme</span>
                </span>
                <ArrowRight className="size-5 text-gold-rich transition-transform group-hover:translate-x-1" aria-hidden />
              </Link>
            </Reveal>
          </aside>
        </div>
      </section>
    </>
  );
}
