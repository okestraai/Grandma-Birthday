import { SEO } from '@/components/seo/SEO';
import { celebrantName, siteNameOf, useSite } from '@/lib/public-api';
import { Hero, HeroSkeleton, HeroUnavailable } from '@/components/public/home/Hero';
import {
  EventSection,
  FamilyTeaser,
  GalleryTeaser,
  Introduction,
  MomentsMarquee,
  ProgrammeSection,
  RsvpCta,
  ScheduleSection,
  StoryTeaser,
  TestimonialsSection,
} from '@/components/public/home/sections';
import { ScrollScene, VelocityBand } from '@/components/public/motion';
import { eventJsonLd, personJsonLd, siteImagePath } from '@/components/public/jsonld';
import { celebrationDates, celebrationPlace, hasSeveralEvents } from '@/components/public/event/event-helpers';

export default function HomePage() {
  const { data: site, isError, isFetching, refetch } = useSite();

  // Saved data (see lib/snapshot) still shows while a refetch is failing; with none, a branded notice.
  if (!site) return isError ? <HeroUnavailable onRetry={() => void refetch()} retrying={isFetching} /> : <HeroSkeleton />;

  const name = celebrantName(site.celebrant);
  const several = hasSeveralEvents(site);
  const where = site.events.length ? (several ? `: ${celebrationPlace(site)}` : ` at ${site.events[0].venueName}`) : '';
  const description =
    site.branding.siteDescription ??
    (several
      ? `Join us on ${celebrationDates(site)} to celebrate ${site.celebrant.age ?? 70} years of ${name}${where}.`
      : `Join us on ${celebrationDates(site)}${where} to celebrate ${site.celebrant.age ?? 70} years of ${name}.`);

  return (
    // No page-level fade: the hero's own entrance is the reveal, and a fade would hold back the LCP.
    <div className="overflow-x-clip">
      <SEO
        title={site.branding.siteTitle ?? `${name} at ${site.celebrant.age ?? 70}`}
        description={description}
        image={siteImagePath(site)}
        path="/"
        jsonLd={[...eventJsonLd(site), personJsonLd(site.celebrant)]}
        siteName={siteNameOf(site)}
      />
      <Hero site={site} />
      {/* Each section opens out from a rounded card as it scrolls up the screen. */}
      <ScrollScene>
        <Introduction site={site} />
      </ScrollScene>
      <ScrollScene>
        <StoryTeaser site={site} />
      </ScrollScene>
      <VelocityBand words={[`${site.celebrant.age ?? 70} years`, 'Life', 'Love', 'Legacy']} />
      <ScrollScene>
        <FamilyTeaser />
      </ScrollScene>
      <GalleryTeaser />
      <MomentsMarquee />
      {/* One event: its details, as before. Several: a short schedule. */}
      <ScrollScene>{several ? <ScheduleSection site={site} /> : <EventSection site={site} />}</ScrollScene>
      <ProgrammeSection timezone={site.celebration.timezone} />
      <ScrollScene>
        <TestimonialsSection />
      </ScrollScene>
      <VelocityBand words={['Celebrate', 'Honour', 'Gather', 'Rejoice']} />
      <RsvpCta site={site} />
    </div>
  );
}
