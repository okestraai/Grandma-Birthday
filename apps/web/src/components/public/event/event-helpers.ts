import type { PublicEvent, RsvpAvailability, SiteOverview } from '@birthday/types';
import { SITE_URL } from '@/components/seo/SEO';
import { celebrantName } from '@/lib/public-api';
import { formatEventDate } from '@/lib/utils';
import type { CalendarEvent } from '../calendar';

export function eventLocation(event: Pick<PublicEvent, 'venueName' | 'address'>): string {
  return [event.venueName, event.address].filter(Boolean).join(', ');
}

export function calendarEventFromSite(site: SiteOverview): CalendarEvent {
  const { event } = site;
  return {
    uid: `celebration-${event.startsAt}@${new URL(SITE_URL).host}`,
    title: event.name,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    location: eventLocation(event),
    description: [event.tagline ?? `Celebrating ${celebrantName(site.celebrant)}`, event.dressCode ? `Dress code: ${event.dressCode}` : null, `${SITE_URL}/event`]
      .filter(Boolean)
      .join('\n'),
    url: `${SITE_URL}/event`,
  };
}

export function mapHref(event: Pick<PublicEvent, 'mapUrl' | 'latitude' | 'longitude' | 'venueName' | 'address'>): string {
  if (event.mapUrl) return event.mapUrl;
  if (event.latitude != null && event.longitude != null) {
    return `https://www.google.com/maps/search/?api=1&query=${event.latitude},${event.longitude}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(eventLocation(event))}`;
}

/** iPhone, iPad and iPod. iPadOS reports itself as a Mac, so a Mac with touch counts too. */
function isAppleMobile(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
}

/**
 * Turn-by-turn directions to the venue from wherever the guest is. iPhones get Apple Maps, which
 * opens the Maps app in the same tab (a new tab would be left blank behind it); everyone else gets
 * Google Maps directions, which opens the app on Android. The venue's coordinates are used when
 * set, otherwise its name and address. `mapUrl` is only a fallback: it is a link to view the place,
 * and may not offer directions at all.
 */
export function directionsHref(
  event: Pick<PublicEvent, 'mapUrl' | 'latitude' | 'longitude' | 'venueName' | 'address'>,
  apple = isAppleMobile(),
): { href: string; newTab: boolean } {
  const coords = event.latitude != null && event.longitude != null ? `${event.latitude},${event.longitude}` : null;
  const destination = coords ?? eventLocation(event);
  if (!destination) return { href: mapHref(event), newTab: true };
  if (apple) return { href: `https://maps.apple.com/?daddr=${encodeURIComponent(destination)}&dirflg=d`, newTab: false };
  return { href: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`, newTab: true };
}

/** Human explanation of why RSVP is closed. */
export function rsvpClosedMessage(availability: RsvpAvailability, timezone?: string): string {
  switch (availability.closedReason) {
    case 'DEADLINE_PASSED':
      return availability.deadline
        ? `Replies closed on ${formatEventDate(availability.deadline, timezone)}.`
        : 'The reply deadline has passed.';
    case 'CAPACITY_REACHED':
      return 'Every seat for the celebration has now been reserved.';
    case 'EVENT_ENDED':
      return 'The celebration has taken place. Thank you to everyone who joined us.';
    case 'CLOSED_BY_ADMIN':
    default:
      return 'Replies are not being accepted at the moment.';
  }
}
