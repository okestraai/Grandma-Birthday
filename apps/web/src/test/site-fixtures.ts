import type { ProgrammeGroup, ProgrammeItem, PublicEvent, SiteOverview } from '@birthday/types';

/** Site data for public page tests: one event by default, or the three given. */
export function testEvent(id: string, name: string, startsAt: string, hours = 3, over: Partial<PublicEvent> = {}): PublicEvent {
  return {
    id,
    slug: id,
    name,
    description: null,
    startsAt,
    endsAt: new Date(new Date(startsAt).getTime() + hours * 3600_000).toISOString(),
    venueName: `${name} Hall`,
    address: `${id} Road`,
    city: 'Lagos',
    mapUrl: null,
    latitude: null,
    longitude: null,
    dressCode: null,
    theme: null,
    parkingInfo: null,
    rsvpEnabled: true,
    invitedCategories: [],
    sortOrder: 0,
    ...over,
  };
}

export const SERVICE = testEvent('thanksgiving-service', 'Thanksgiving Service', '2026-11-21T09:00:00.000Z', 2);
export const DINNER = testEvent('birthday-dinner', 'Birthday Dinner', '2026-11-21T16:00:00.000Z', 6, { dressCode: 'Black tie' });
export const BRUNCH = testEvent('family-brunch', 'Family Brunch', '2026-11-22T11:00:00.000Z', 3, { invitedCategories: ['Family'] });

export function testSite(events: PublicEvent[] = [DINNER]): SiteOverview {
  return {
    celebration: {
      name: 'Margaret at Seventy',
      tagline: 'A weekend of gratitude',
      description: null,
      timezone: 'Africa/Lagos',
      startsAt: events[0].startsAt,
      endsAt: events[events.length - 1].endsAt,
      contactName: 'Ngozi',
      contactEmail: 'family@example.com',
      contactPhone: null,
      rsvp: { open: true, mode: 'OPEN', deadline: null, closedReason: null },
    },
    events,
    celebrant: {
      fullName: 'Margaret Okonkwo',
      preferredName: 'Margaret',
      honorific: 'Dr.',
      birthDate: null,
      birthPlace: null,
      age: 70,
      heroHeadline: null,
      introduction: null,
      biography: null,
      quote: null,
      quoteAttribution: null,
      achievements: [],
      values: [],
      portrait: null,
    },
    branding: { siteTitle: null, siteDescription: null, primaryColor: '#071A2B', secondaryColor: '#D6B36A', logo: null, hero: null, ogImage: null },
    features: { testimonialsOpen: true, testimonialsAllowPhotos: true, testimonialsAllowVideos: false },
    isDemo: false,
  };
}

export function testItem(eventId: string, id: string, title: string, startTime: string, date: string | null = null): ProgrammeItem {
  return { id, eventId, date, startTime, endTime: null, title, description: null, speaker: null, location: null, sortOrder: 0 };
}

export function testProgramme(groups: [PublicEvent, ProgrammeItem[]][]): ProgrammeGroup[] {
  return groups.map(([event, items]) => ({ event, items }));
}
