import type { Celebrant, SiteOverview } from '@birthday/types';
import { apiUrl } from '@/lib/api';
import { SITE_URL } from '@/components/seo/SEO';
import { celebrantName } from '@/lib/public-api';

function absolute(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  const url = apiUrl(path);
  return /^https?:\/\//.test(url) ? url : `${SITE_URL}${url}`;
}

/** The best share image for the site: admin OG image, then hero, then portrait. */
export function siteImagePath(site: SiteOverview | undefined): string | null {
  if (!site) return null;
  const m = site.branding.ogImage ?? site.branding.hero ?? site.celebrant.portrait;
  return m ? (m.urls.medium ?? m.urls.original) : null;
}

export function personJsonLd(celebrant: Celebrant): Record<string, unknown> {
  const portrait = celebrant.portrait ? absolute(celebrant.portrait.urls.medium ?? celebrant.portrait.urls.original) : undefined;
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: celebrant.fullName,
    ...(celebrant.honorific ? { honorificPrefix: celebrant.honorific } : {}),
    ...(celebrant.preferredName && celebrant.preferredName !== celebrant.fullName ? { alternateName: celebrant.preferredName } : {}),
    ...(celebrant.birthDate ? { birthDate: celebrant.birthDate } : {}),
    ...(celebrant.birthPlace ? { birthPlace: { '@type': 'Place', name: celebrant.birthPlace } } : {}),
    ...(celebrant.introduction ? { description: celebrant.introduction } : {}),
    ...(portrait ? { image: portrait } : {}),
    url: `${SITE_URL}/about`,
  };
}

export function eventJsonLd(site: SiteOverview): Record<string, unknown> {
  const { event } = site;
  const image = absolute(siteImagePath(site));
  return {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: event.name,
    description: event.description ?? event.tagline ?? `A celebration of ${celebrantName(site.celebrant)}.`,
    startDate: event.startsAt,
    endDate: event.endsAt,
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: {
      '@type': 'Place',
      name: event.venueName,
      address: {
        '@type': 'PostalAddress',
        streetAddress: event.address,
        ...(event.city ? { addressLocality: event.city } : {}),
      },
      ...(event.latitude != null && event.longitude != null
        ? { geo: { '@type': 'GeoCoordinates', latitude: event.latitude, longitude: event.longitude } }
        : {}),
    },
    ...(image ? { image: [image] } : {}),
    ...(event.contactName
      ? {
          organizer: {
            '@type': 'Person',
            name: event.contactName,
            ...(event.contactEmail ? { email: event.contactEmail } : {}),
          },
        }
      : {}),
    url: `${SITE_URL}/event`,
  };
}
