import { SEO } from '@/components/seo/SEO';
import { celebrantName, siteNameOf, useSite } from '@/lib/public-api';
import { formatEventDate } from '@/lib/utils';
import { Hero, HeroSkeleton, HeroUnavailable } from '@/components/public/home/Hero';
import {
  EventSection,
  FamilyTeaser,
  GalleryTeaser,
  Introduction,
  MomentsMarquee,
  ProgrammeSection,
  RsvpCta,
  StoryTeaser,
  TestimonialsSection,
} from '@/components/public/home/sections';
import { ScrollScene, VelocityBand } from '@/components/public/motion';
import { eventJsonLd, personJsonLd, siteImagePath } from '@/components/public/jsonld';

export default function HomePage() {
  const { data: site, isError, isFetching, refetch } = useSite();

  // Saved data (see lib/snapshot) still shows while a refetch is failing; with none, a branded notice.
  if (!site) return isError ? <HeroUnavailable onRetry={() => void refetch()} retrying={isFetching} /> : <HeroSkeleton />;

  const name = celebrantName(site.celebrant);
  const description =
    site.branding.siteDescription ??
    `Join us on ${formatEventDate(site.event.startsAt, site.event.timezone)} at ${site.event.venueName} to celebrate ${site.celebrant.age ?? 70} years of ${name}.`;

  return (
    // No page-level fade: the hero's own entrance is the reveal, and a fade would hold back the LCP.
    <div className="overflow-x-clip">
      <SEO
        title={site.branding.siteTitle ?? `${name} at ${site.celebrant.age ?? 70}`}
        description={description}
        image={siteImagePath(site)}
        path="/"
        jsonLd={[eventJsonLd(site), personJsonLd(site.celebrant)]}
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
      <ScrollScene>
        <EventSection site={site} />
      </ScrollScene>
      <ProgrammeSection />
      <ScrollScene>
        <TestimonialsSection />
      </ScrollScene>
      <VelocityBand words={['Celebrate', 'Honour', 'Gather', 'Rejoice']} />
      <RsvpCta site={site} />
    </div>
  );
}
