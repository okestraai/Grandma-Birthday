import { HttpStatus, Injectable } from '@nestjs/common';
import type { InvitationEvent, PublicEvent, RsvpEventOption } from '@birthday/types';
import { AppException, Errors } from '../common/errors';
import { Prisma, type Event } from '../generated/prisma/client';
import { PrismaService, type Tx } from '../prisma/prisma.service';

/** Display order everywhere: the admin's order, then start time. */
export const EVENT_ORDER = [{ sortOrder: 'asc' as const }, { startsAt: 'asc' as const }];

export const EVENT_INCLUDE = {
  invitedCategories: { include: { category: { select: { name: true, sortOrder: true } } } },
} satisfies Prisma.EventInclude;

export type EventRow = Prisma.EventGetPayload<{ include: typeof EVENT_INCLUDE }>;

/** Guests and people (guest plus companions) attending one event. */
export interface EventAttendance {
  guests: number;
  people: number;
}

type Client = PrismaService | Tx;

export function invitedCategoryIds(event: EventRow): string[] {
  return event.invitedCategories.map((c) => c.categoryId);
}

/** Whether a guest may attend an event: everyone, their category, or an admin added them. */
export function isInvited(event: EventRow, categoryId: string | null, extraEventIds: Iterable<string> = []): boolean {
  if (event.invitedCategories.length === 0) return true;
  if (categoryId && event.invitedCategories.some((c) => c.categoryId === categoryId)) return true;
  return new Set(extraEventIds).has(event.id);
}

/**
 * The events a guest may reply to or be checked in at: by category, added by an admin, or
 * already chosen in their reply (so a later category change does not silently drop a choice).
 */
export function eventsForGuest<T extends EventRow>(
  guest: { categoryId: string | null; extraEventIds: string[]; chosenEventIds: string[] },
  events: T[],
): T[] {
  const chosen = new Set(guest.chosenEventIds);
  return events.filter((e) => chosen.has(e.id) || isInvited(e, guest.categoryId, guest.extraEventIds));
}

/**
 * The event staff most likely want at the door: one in progress, else the next to start,
 * else the one that ended last.
 */
export function defaultEvent<T extends Pick<Event, 'startsAt' | 'endsAt'>>(events: T[], now = new Date()): T | null {
  if (!events.length) return null;
  const byStart = [...events].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  return (
    byStart.find((e) => e.startsAt <= now && now < e.endsAt) ??
    byStart.find((e) => e.startsAt > now) ??
    [...events].sort((a, b) => b.endsAt.getTime() - a.endsAt.getTime())[0]
  );
}

/** First start and last end of a set of events. */
export function spanOf(events: Pick<Event, 'startsAt' | 'endsAt'>[]): { startsAt: Date; endsAt: Date } | null {
  if (!events.length) return null;
  return {
    startsAt: new Date(Math.min(...events.map((e) => e.startsAt.getTime()))),
    endsAt: new Date(Math.max(...events.map((e) => e.endsAt.getTime()))),
  };
}

export function toPublicEvent(e: EventRow): PublicEvent {
  return {
    id: e.id,
    slug: e.slug,
    name: e.name,
    description: e.description,
    startsAt: e.startsAt.toISOString(),
    endsAt: e.endsAt.toISOString(),
    venueName: e.venueName,
    address: e.address,
    city: e.city,
    mapUrl: e.mapUrl,
    latitude: e.latitude,
    longitude: e.longitude,
    dressCode: e.dressCode,
    theme: e.theme,
    parkingInfo: e.parkingInfo,
    rsvpEnabled: e.rsvpEnabled,
    invitedCategories: [...e.invitedCategories].sort((a, b) => a.category.sortOrder - b.category.sortOrder).map((c) => c.category.name),
    sortOrder: e.sortOrder,
  };
}

/** Events with whether each is full, for RSVP availability. */
export function withFull<T extends Pick<Event, 'id' | 'capacity'>>(events: T[], attendance: Map<string, EventAttendance>): (T & { full: boolean })[] {
  return events.map((e) => ({ ...e, full: e.capacity !== null && (attendance.get(e.id)?.people ?? 0) >= e.capacity }));
}

export function toRsvpOption(e: EventRow, attendance: Map<string, EventAttendance>): RsvpEventOption {
  return {
    id: e.id,
    slug: e.slug,
    name: e.name,
    startsAt: e.startsAt.toISOString(),
    endsAt: e.endsAt.toISOString(),
    venueName: e.venueName,
    city: e.city,
    invitedCategoryIds: invitedCategoryIds(e),
    full: e.capacity !== null && (attendance.get(e.id)?.people ?? 0) >= e.capacity,
  };
}

export function toInvitationEvent(e: Event, partySize: number, checkedIn: boolean): InvitationEvent {
  return {
    id: e.id,
    slug: e.slug,
    name: e.name,
    startsAt: e.startsAt.toISOString(),
    endsAt: e.endsAt.toISOString(),
    venueName: e.venueName,
    address: e.address,
    city: e.city,
    mapUrl: e.mapUrl,
    latitude: e.latitude,
    longitude: e.longitude,
    dressCode: e.dressCode,
    partySize,
    checkedIn,
  };
}

/**
 * Reads the celebration's events and the rules that depend on them: who is invited to what,
 * and how many people are coming to each.
 */
@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  list(client: Client = this.prisma, where: Prisma.EventWhereInput = {}): Promise<EventRow[]> {
    return client.event.findMany({ where, include: EVENT_INCLUDE, orderBy: EVENT_ORDER });
  }

  listPublic(client: Client = this.prisma): Promise<EventRow[]> {
    return this.list(client, { isPublic: true });
  }

  /** When the first event starts: the date the celebrant's age is given for. */
  async firstStart(client: Client = this.prisma): Promise<Date> {
    const first = await client.event.findFirst({ orderBy: { startsAt: 'asc' }, select: { startsAt: true } });
    return first?.startsAt ?? new Date();
  }

  /** Attendance per event id, from attending replies only. */
  async attendance(client: Client = this.prisma, excludeGuestId?: string): Promise<Map<string, EventAttendance>> {
    const rows = await client.rsvpEvent.findMany({
      where: { rsvp: { response: 'ATTENDING', guestId: excludeGuestId ? { not: excludeGuestId } : undefined } },
      select: { eventId: true, companionCount: true },
    });
    const totals = new Map<string, EventAttendance>();
    for (const row of rows) {
      const current = totals.get(row.eventId) ?? { guests: 0, people: 0 };
      totals.set(row.eventId, { guests: current.guests + 1, people: current.people + 1 + row.companionCount });
    }
    return totals;
  }

  /** The events a guest may attend (see eventsForGuest). */
  async forGuest(client: Client, guestId: string): Promise<EventRow[]> {
    const [guest, events] = await Promise.all([
      client.guest.findUnique({
        where: { id: guestId },
        select: { categoryId: true, extraEvents: { select: { eventId: true } }, rsvp: { select: { events: { select: { eventId: true } } } } },
      }),
      this.list(client),
    ]);
    if (!guest) return [];
    return eventsForGuest(
      { categoryId: guest.categoryId, extraEventIds: guest.extraEvents.map((e) => e.eventId), chosenEventIds: guest.rsvp?.events.map((e) => e.eventId) ?? [] },
      events,
    );
  }

  /** The event a check-in is for. Without an id, the only event; with several, the caller must choose. */
  async resolve(eventId: string | undefined, client: Client = this.prisma): Promise<Event> {
    if (eventId) {
      const event = await client.event.findUnique({ where: { id: eventId } });
      if (!event) throw Errors.notFound('Event');
      return event;
    }
    const events = await client.event.findMany({ take: 2 });
    if (events.length === 1) return events[0];
    throw Errors.validation({ eventId: ['Choose the event.'] });
  }

  /** Refuses a reply that would put an event over its own capacity. Callers hold the capacity lock. */
  async assertRoom(client: Client, guestId: string, choices: { event: Event; companionCount: number }[]): Promise<void> {
    const limited = choices.filter((c) => c.event.capacity !== null);
    if (!limited.length) return;
    const others = await this.attendance(client, guestId);
    for (const { event, companionCount } of limited) {
      const taken = others.get(event.id)?.people ?? 0;
      if (taken + 1 + companionCount > event.capacity!) {
        const left = Math.max(0, event.capacity! - taken);
        throw new AppException(
          HttpStatus.CONFLICT,
          'EVENT_FULL',
          left === 0
            ? `We are sorry: ${event.name} is now full.`
            : `We are sorry: only ${left} place${left === 1 ? '' : 's'} remain${left === 1 ? 's' : ''} at ${event.name}.`,
          { events: [`${event.name} has ${left} place${left === 1 ? '' : 's'} left.`] },
        );
      }
    }
  }
}
