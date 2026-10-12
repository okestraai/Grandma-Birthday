import type { PublicCelebration, PublicEvent, RsvpAvailability, SiteOverview } from '@birthday/types';
import { SITE_URL } from '@/components/seo/SEO';
import { celebrantName } from '@/lib/public-api';
import { formatEventDate, formatEventTime } from '@/lib/utils';
import type { CalendarEvent } from '../calendar';

type Venue = Pick<PublicEvent, 'venueName' | 'address'>;
type Place = Pick<PublicEvent, 'mapUrl' | 'latitude' | 'longitude' | 'venueName' | 'address'>;

export function eventLocation(event: Venue): string {
  return [event.venueName, event.address].filter(Boolean).join(', ');
}

/** True when the site has more than one public event; the single-event layouts stay as they were. */
export function hasSeveralEvents(site: Pick<SiteOverview, 'events'>): boolean {
  return site.events.length > 1;
}

/**
 * "Saturday, 21 November 2026" for one day; "Saturday 21 November – Sunday 22 November 2026"
 * when the events run over several days.
 */
export function formatDateRange(startIso: string, endIso: string, timeZone?: string): string {
  const start = formatEventDate(startIso, timeZone);
  if (start === formatEventDate(endIso, timeZone)) return start;
  return new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone }).formatRange(
    new Date(startIso),
    new Date(endIso),
  );
}

/** The day the events take place on: one date, or the range across the events. */
export function celebrationDates(site: Pick<SiteOverview, 'celebration' | 'events'>): string {
  const { celebration, events } = site;
  if (events.length <= 1) return formatEventDate(events[0]?.startsAt ?? celebration.startsAt, celebration.timezone);
  return formatDateRange(celebration.startsAt, celebration.endsAt, celebration.timezone);
}

/** "The Emerald Ballroom, Lagos" for one event; "3 events in Lagos" (or "3 events") for several. */
export function celebrationPlace(site: Pick<SiteOverview, 'events'>): string {
  const { events } = site;
  if (events.length === 1) return [events[0].venueName, events[0].city].filter(Boolean).join(', ');
  const cities = [...new Set(events.map((e) => e.city).filter(Boolean))];
  return cities.length === 1 ? `${events.length} events in ${cities[0]}` : `${events.length} events`;
}

/** "5:00 PM – 11:00 PM", with the end date when the event runs past midnight. */
export function eventTimes(event: Pick<PublicEvent, 'startsAt' | 'endsAt'>, timeZone?: string): string {
  const sameDay = formatEventDate(event.startsAt, timeZone) === formatEventDate(event.endsAt, timeZone);
  const end = sameDay ? formatEventTime(event.endsAt, timeZone) : `${formatEventDate(event.endsAt, timeZone)}, ${formatEventTime(event.endsAt, timeZone)}`;
  return `${formatEventTime(event.startsAt, timeZone)} – ${end}`;
}

/** The next event to start (for the countdown); null once they have all begun. */
export function nextEvent<T extends Pick<PublicEvent, 'startsAt'>>(events: T[], now = Date.now()): T | null {
  return [...events].sort((a, b) => a.startsAt.localeCompare(b.startsAt)).find((e) => new Date(e.startsAt).getTime() > now) ?? null;
}

/** Who an event is for, e.g. "For Family guests", or null when everyone is invited. */
export function audienceNote(event: Pick<PublicEvent, 'invitedCategories'>): string | null {
  if (!event.invitedCategories.length) return null;
  const names = event.invitedCategories;
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `For ${list} guests`;
}

type CalendarSource = Pick<PublicEvent, 'id' | 'slug' | 'name' | 'startsAt' | 'endsAt' | 'venueName' | 'address' | 'dressCode'>;

/**
 * Calendar entries for events: one each. With a single event the entry reads as it always did;
 * with several, each names its event and links to its card on the event page.
 */
export function calendarEvents(
  site: Pick<SiteOverview, 'celebration' | 'celebrant'>,
  events: CalendarSource[],
  url = (event: CalendarSource) => (events.length > 1 ? `${SITE_URL}/event#${event.slug}` : `${SITE_URL}/event`),
): CalendarEvent[] {
  const { celebration } = site;
  const host = new URL(SITE_URL).host;
  return events.map((event) => ({
    // A single event keeps the identifier it always had, so re-adding it updates the same entry.
    uid: events.length > 1 ? `event-${event.id}@${host}` : `celebration-${event.startsAt}@${host}`,
    title: events.length > 1 ? `${event.name} · ${celebration.name}` : event.name,
    label: event.name,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    location: eventLocation(event),
    description: [celebration.tagline ?? `Celebrating ${celebrantName(site.celebrant)}`, event.dressCode ? `Dress code: ${event.dressCode}` : null, url(event)]
      .filter(Boolean)
      .join('\n'),
    url: url(event),
  }));
}

/** Calendar entries for every public event on the site. */
export function calendarEventsFromSite(site: SiteOverview): CalendarEvent[] {
  return calendarEvents(site, site.events);
}

/** The contact details shown with the events. */
export type CelebrationContact = Pick<PublicCelebration, 'contactName' | 'contactEmail' | 'contactPhone'>;

export function mapHref(event: Place): string {
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
  event: Place,
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
